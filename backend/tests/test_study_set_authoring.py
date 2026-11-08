import os
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.database import connect, create_study_set
from app.study_set_content import StudySetContent


class StudySetAuthoringTests(TestCase):
    catalog = "/api/study-sets"
    complete_question = {
        "prompt": "Which HTTP method retrieves a resource?",
        "options": [{"text": "GET", "is_correct": True}, {"text": "POST", "is_correct": False}],
    }

    def setUp(self) -> None:
        directory = self.enterContext(TemporaryDirectory())
        self.database = Path(directory) / "authoring.sqlite3"
        self.client = self.enterContext(self.signed_in_as("author"))

    def signed_in_as(self, username: str) -> TestClient:
        with patch.dict(os.environ, {
            "JANEQ_DB_PATH": str(self.database),
            "JANEQ_DEMO_USERNAME": username,
            "JANEQ_DEMO_PASSWORD": "disposable-password",
            "JANEQ_SESSION_SECRET": "disposable-editor-session-secret-12345",
            "JANEQ_COOKIE_SECURE": "false",
        }):
            from app.main import create_app

            client = TestClient(create_app())
        response = client.post("/api/auth/login", json={"username": username, "password": "disposable-password"})
        self.assertEqual(response.status_code, 200)
        return client

    def create_set(self, **fields) -> dict:
        response = self.client.post(self.catalog, json={"title": "HTTP practice", "questions": [self.complete_question], **fields})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_repair_legacy_draft_and_grade_after_reopening_database(self) -> None:
        content = StudySetContent(title="Legacy draft", questions=[{
            "prompt": "  Which methods are safe?  ",
            "options": [{"text": text, "is_correct": False} for text in ("GET", "HEAD", "POST", "  ")],
        }])
        with closing(connect(self.database)) as connection, connection:
            set_id = create_study_set(connection, "author", content, None)
        draft = next(item for item in self.client.get(self.catalog).json() if item["id"] == set_id)
        self.assertEqual((draft["status"], draft["configured_count"], draft["question_count"]), ("draft", 0, 1))
        path = f"{self.catalog}/{draft['id']}"
        self.assertEqual(self.client.get(f"{path}/test").status_code, 409)
        with self.signed_in_as("author") as reopened:
            self.assertIn(draft, reopened.get(self.catalog).json())
            saved = reopened.get(f"{path}/editor").json()
            self.assertEqual(saved["revision"], 1)
            self.assertIsNotNone(saved.pop("saved_at"))
            self.assertEqual(saved["questions"][0]["prompt"], "Which methods are safe?")
            self.assertEqual(saved["questions"][0]["options"][-1]["text"], "")

        options = saved["questions"][0]["options"]
        self.assertEqual(self.client.put(f"{path}/editor", json=saved).status_code, 422)
        options.pop()
        options[0]["is_correct"] = options[1]["is_correct"] = True
        response = self.client.put(f"{path}/editor", json=saved)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "ready")
        self.assertEqual(self.client.put(f"{path}/editor", json={**saved, "title": "Stale"}).status_code, 409)
        paper = self.client.get(f"{path}/test").json()
        self.assertEqual((paper["revision"], paper["title"]), (2, draft["title"]))
        question = paper["questions"][0]
        self.assertTrue(question["multiple"])
        self.assertEqual([option["text"] for option in question["options"]], ["GET", "HEAD", "POST"])
        submission = {"revision": paper["revision"], "answers": [{
            "question_id": question["id"], "selected_ids": [option["id"] for option in question["options"][:2]],
        }]}
        self.assertEqual(self.client.post(f"{path}/test", json=submission).json()["score"], 1)

        latest = self.client.get(f"{path}/editor").json()
        latest.pop("saved_at")
        self.assertEqual(self.client.put(f"{path}/editor", json=latest).status_code, 200)
        self.assertEqual(self.client.get(f"{path}/test").json(), paper)
        latest["questions"][0]["options"][1]["is_correct"] = False
        self.assertEqual(self.client.put(f"{path}/editor", json=latest).status_code, 200)
        conflict = self.client.post(f"{path}/test", json=submission)
        self.assertEqual((conflict.status_code, conflict.json()["detail"]["code"]), (409, "revision_changed"))
        with closing(connect(self.database)) as connection:
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_private_reads_and_writes_and_immutable_built_ins(self) -> None:
        draft = self.create_set()
        path = f"{self.catalog}/{draft['id']}"
        valid_update = {"title": "Changed", "questions": [self.complete_question], "revision": 1}
        with self.signed_in_as("another-author") as other:
            self.assertNotIn(draft, other.get(self.catalog).json())
            for mode in ("editor", "preview", "learn", "test"):
                self.assertEqual(other.get(f"{path}/{mode}").status_code, 404, mode)
            self.assertEqual(other.put(f"{path}/editor", json=valid_update).status_code, 404)
            self.assertEqual(other.delete(path, params={"revision": 1}).status_code, 404)
        for method in ("get", "put"):
            response = self.client.request(method, f"{self.catalog}/html-css/editor", json=valid_update)
            self.assertEqual(response.status_code, 404)
        self.assertEqual(self.client.get(f"{self.catalog}/html-css/test").status_code, 200)
        self.assertEqual(self.client.delete(f"{self.catalog}/html-css", params={"revision": 1}).status_code, 404)
        self.assertEqual(self.client.get(f"{path}/editor").json()["title"], draft["title"])

    def test_validation_and_signed_session_contract(self) -> None:
        draft = self.create_set()
        path = f"{self.catalog}/{draft['id']}/editor"
        payload = {"title": "Edited", "questions": [self.complete_question], "revision": 1}
        for fields in (
            {"title": "  "}, {"revision": "1"}, {"owner_username": "someone-else"},
            {"questions": [{"prompt": "Question", "options": [{"text": "  ", "is_correct": True}]}]},
        ):
            self.assertEqual(self.client.put(path, json={**payload, **fields}).status_code, 422)
        self.assertEqual(self.client.get(path).json()["revision"], 1)

        schema = self.client.get("/openapi.json").json()["paths"]
        self.assertEqual(schema[self.catalog]["post"]["security"], [{"SessionCookie": []}])
        editor = schema[f"{self.catalog}/{{set_id}}/editor"]
        self.assertEqual(editor["put"]["security"], [{"SessionCookie": []}])
        self.assertIn("409", editor["put"]["responses"])
        self.client.post("/api/auth/logout")
        self.assertEqual(self.client.post(self.catalog, json={"title": "Unsigned", "questions": [self.complete_question]}).status_code, 401)
        self.assertEqual(self.client.get(path).status_code, 401)
        self.assertEqual(self.client.put(path, json=payload).status_code, 401)
        self.assertEqual(self.client.delete(path.removesuffix("/editor"), params={"revision": 1}).status_code, 401)

    def test_create_retry_reuses_the_same_set(self) -> None:
        headers = {"Idempotency-Key": str(uuid4())}
        content = {"title": "Retried set", "questions": [self.complete_question]}
        first = self.client.post(self.catalog, headers=headers, json=content)
        self.assertEqual(first.status_code, 201)
        retry = self.client.post(self.catalog, headers=headers, json=content)
        self.assertEqual((retry.status_code, retry.json()), (201, first.json()))
        changed = self.client.post(self.catalog, headers=headers, json={**content, "title": "Different set"})
        self.assertEqual(changed.status_code, 409)
        custom = [study_set for study_set in self.client.get(self.catalog).json() if study_set["source_kind"] == "custom"]
        self.assertEqual(custom, [first.json()])

    def test_create_and_update_require_complete_questions(self) -> None:
        saved = self.create_set()
        path = f"{self.catalog}/{saved['id']}/editor"
        original = self.client.get(path).json()
        question = self.complete_question
        invalid_questions = (
            [],
            [{**question, "prompt": "  "}],
            [{**question, "options": []}],
            [{**question, "options": question["options"][:1]}],
            [{**question, "options": [*question["options"], {"text": " ", "is_correct": False}]}],
            [question, {**question, "options": [{**option, "is_correct": False} for option in question["options"]]}],
        )
        for questions in invalid_questions:
            with self.subTest(questions=questions):
                content = {"title": "Incomplete", "questions": questions}
                self.assertEqual(self.client.post(self.catalog, json=content).status_code, 422)
                self.assertEqual(self.client.put(path, json={**content, "revision": saved["revision"]}).status_code, 422)
        self.assertEqual(self.client.get(path).json(), original)
        custom = [study_set for study_set in self.client.get(self.catalog).json() if study_set["source_kind"] == "custom"]
        self.assertEqual(custom, [saved])

    def test_legacy_single_answers_generate_choices_or_accept_text_in_test_and_learn(self) -> None:
        content = StudySetContent(title="Legacy set", questions=[
            {"prompt": prompt, "options": [{"text": answer, "is_correct": True}]}
            for prompt, answer in [("First result?", "12"), ("Second result?", "24"), ("Name the web protocol.", "HTTPS")]
        ])
        single = StudySetContent(title="Legacy one-question set", questions=[{
            "prompt": "What resolves hostnames?", "options": [{"text": "DNS", "is_correct": True}],
        }])
        with closing(connect(self.database)) as connection, connection:
            set_id = create_study_set(connection, "author", content, None)
            single_id = create_study_set(connection, "author", single, None)
        path = f"{self.catalog}/{set_id}"
        paper = self.client.get(f"{path}/test").json()
        self.assertEqual(self.client.get(f"{path}/test").json(), paper)
        first, second, written = paper["questions"]
        for question in (first, second):
            self.assertCountEqual([option["text"] for option in question["options"]], ["12", "24"])
        self.assertEqual(written["options"], [])
        self.assertNotIn("HTTPS", str(written))

        answers = [
            {"question_id": first["id"], "selected_ids": [next(option["id"] for option in first["options"] if option["text"] == "24")]},
            {"question_id": second["id"], "selected_ids": [next(option["id"] for option in second["options"] if option["text"] == "24")]},
            {"question_id": written["id"], "answer_text": "  https  "},
        ]
        result = self.client.post(f"{path}/test", json={"revision": paper["revision"], "answers": answers})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["score"], 2)
        self.assertEqual(result.json()["questions"][2]["correct_text"], "HTTPS")
        for invalid in ({"answer_text": " "}, {"selected_ids": [first["options"][0]["id"]]}):
            bad = [*answers[:2], {"question_id": written["id"], **invalid}]
            self.assertEqual(self.client.post(f"{path}/test", json={"revision": paper["revision"], "answers": bad}).status_code, 422)

        single_path = f"{self.catalog}/{single_id}"
        learn_path = f"{single_path}/learn"
        view = self.client.get(learn_path).json()
        self.assertEqual(view["question"]["options"], [])
        feedback = self.client.post(learn_path, json={
            "action": "check", "revision": view["revision"], "version": view["version"], "answer_text": "HTTP",
        })
        self.assertEqual(feedback.status_code, 200, feedback.text)
        self.assertEqual(feedback.json()["feedback"], {
            "correct": False, "answer_text": "HTTP", "correct_text": "DNS", "selected_ids": [], "correct_ids": [],
        })
        self.assertEqual(self.client.get(learn_path).json(), feedback.json())

        editor_path = f"{single_path}/editor"
        editor = self.client.get(editor_path).json()
        editor.pop("saved_at")
        self.assertEqual(self.client.put(editor_path, json=editor).status_code, 422)
        editor["questions"][0]["options"].append({"text": "HTTP", "is_correct": False})
        self.assertEqual(self.client.put(editor_path, json=editor).status_code, 200)
        repaired = self.client.get(f"{single_path}/test").json()["questions"][0]
        self.assertEqual([option["text"] for option in repaired["options"]], ["DNS", "HTTP"])

    def test_revision_checked_delete_cascades_to_questions_and_learn_progress(self) -> None:
        draft = self.create_set(questions=[{
            "prompt": "What resolves a hostname?",
            "options": [{"text": "DNS", "is_correct": True}, {"text": "TLS", "is_correct": False}],
        }])
        path = f"{self.catalog}/{draft['id']}"
        editor = self.client.get(f"{path}/editor").json()
        self.assertIsNotNone(editor.pop("saved_at"))
        questions = self.client.get(f"{path}/test").json()["questions"]
        response = self.client.put(f"{path}/editor", json={**editor, "description": "Updated"})
        self.assertEqual(response.status_code, 200)
        saved = response.json()
        self.assertEqual(saved["revision"], 2)
        self.assertEqual(self.client.get(f"{path}/test").json()["questions"], questions)
        self.assertIn(saved, self.client.get(self.catalog).json())
        self.assertEqual(self.client.delete(path, params={"revision": draft["revision"]}).status_code, 409)

        learn = self.client.get(f"{path}/learn").json()
        answer = learn["question"]["options"][0]["id"]
        response = self.client.post(f"{path}/learn", json={
            "action": "check", "revision": learn["revision"], "version": learn["version"], "selected_ids": [answer],
        })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.delete(path, params={"revision": saved["revision"]}).status_code, 204)
        self.assertEqual(self.client.delete(path, params={"revision": saved["revision"]}).status_code, 404)
        self.assertNotIn(draft["id"], [item["id"] for item in self.client.get(self.catalog).json()])
        self.assertEqual(self.client.get(f"{path}/editor").status_code, 404)
        with closing(connect(self.database)) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM questions WHERE study_set_id = ?", (draft["id"],)).fetchone()[0], 0)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM learn_progress WHERE study_set_id = ?", (draft["id"],)).fetchone()[0], 0)
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
