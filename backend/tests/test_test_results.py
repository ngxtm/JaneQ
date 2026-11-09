import os
from contextlib import closing
from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.database import connect


class TestResultsTests(TestCase):
    path = "/api/study-sets/html-css/test"

    def setUp(self) -> None:
        directory = self.enterContext(TemporaryDirectory())
        self.database = Path(directory) / "test-results.sqlite3"
        self.exports = Path(directory) / "pdf"
        self.credentials = {"username": "review", "password": "test-password"}
        with patch.dict(os.environ, {
            "JANEQ_DB_PATH": str(self.database),
            "JANEQ_PDF_EXPORT_DIR": str(self.exports),
            "JANEQ_DEMO_USERNAME": self.credentials["username"],
            "JANEQ_DEMO_PASSWORD": self.credentials["password"],
            "JANEQ_SESSION_SECRET": "disposable-test-session-secret-12345",
            "JANEQ_COOKIE_SECURE": "false",
        }):
            from app.main import create_app

            self.client = self.enterContext(TestClient(create_app()))

    def sign_in(self) -> None:
        self.assertEqual(self.client.post("/api/auth/login", json=self.credentials).status_code, 200)

    def submit(self, q15: list[str] | None = None, *, revision: int = 1, submission_id: str | None = None):
        payload = {
            "revision": revision,
            "answers": [
                {"question_id": "q24", "selected_ids": ["q24-a"]},
                {"question_id": "q16", "selected_ids": ["q16-a"]},
                {"question_id": "q15", "selected_ids": ["q15-a"] if q15 is None else q15},
            ],
        }
        if submission_id is not None:
            payload["submission_id"] = submission_id
        return self.client.post(self.path, json=payload)

    def test_requires_session_and_rejects_draft_on_both_requests(self) -> None:
        self.assertEqual(self.client.get(self.path).status_code, 401)
        self.assertEqual(self.submit().status_code, 401)
        schema = self.client.get("/openapi.json").json()
        for method in ("get", "post"):
            operation = schema["paths"]["/api/study-sets/{set_id}/test"][method]
            self.assertEqual(operation["security"], [{"SessionCookie": []}])
            self.assertTrue({"401", "404", "409"}.issubset(operation["responses"]))
        self.sign_in()
        with closing(connect(self.database)) as connection, connection:
            connection.execute("UPDATE answer_options SET is_correct = 0 WHERE question_id = 'q15'")
        for response in (self.client.get(self.path), self.submit()):
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json(), {"detail": {"code": "draft", "remaining_questions": 1}})
        self.assertEqual(self.client.get("/api/study-sets/missing/test").status_code, 404)

    def test_ordered_paper_and_two_of_three_result(self) -> None:
        self.sign_in()
        response = self.client.get(self.path)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        paper = response.json()
        self.assertEqual((paper["set_id"], paper["title"], paper["revision"]), ("html-css", "HTML / CSS", 1))
        self.assertEqual([question["id"] for question in paper["questions"]], ["q15", "q16", "q24"])
        for question in paper["questions"]:
            self.assertEqual(set(question), {"id", "prompt", "options", "multiple"})
            self.assertFalse(question["multiple"])
            for option in question["options"]:
                self.assertEqual(set(option), {"id", "text"})

        before_submit = datetime.now(UTC)
        response = self.submit()
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        result = response.json()
        self.assertEqual(result["submitted_by"], self.credentials["username"])
        submitted_at = datetime.fromisoformat(result["submitted_at"])
        self.assertEqual(submitted_at.utcoffset(), timedelta(0))
        self.assertLessEqual(before_submit, submitted_at)
        self.assertLessEqual(submitted_at, datetime.now(UTC))
        self.assertEqual((result["score"], result["total"]), (2, 3))
        for graded, question, selected, correct in zip(
            result["questions"], paper["questions"], ("q15-a", "q16-a", "q24-a"), ("q15-a", "q16-c", "q24-a"), strict=True,
        ):
            self.assertEqual(graded, {**question, "selected_ids": [selected], "correct_ids": [correct], "correct": selected == correct})
        resubmitted = self.submit().json()
        self.assertGreaterEqual(datetime.fromisoformat(resubmitted.pop("submitted_at")), submitted_at)
        result.pop("submitted_at")
        self.assertNotEqual(resubmitted.pop("attempt_id"), result.pop("attempt_id"))
        self.assertEqual(resubmitted, result)
        with closing(connect(self.database)) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM learn_progress").fetchone()[0], 0)

    def test_history_is_private_and_survives_restart_and_set_deletion(self) -> None:
        history = "/api/test-attempts"
        self.assertEqual(self.client.get(history).status_code, 401)
        self.sign_in()
        self.assertEqual(self.client.get(history).json(), {"attempts": [], "next_before": None})

        key = str(uuid4())
        saved = self.submit(submission_id=key).json()
        detail = f"{history}/{saved['attempt_id']}"
        newer = self.submit().json()
        first_page = self.client.get(history, params={"limit": 1}).json()
        self.assertEqual(first_page["next_before"], newer["attempt_id"])
        self.assertEqual(first_page["attempts"], [{k: v for k, v in newer.items() if k != "questions"}])
        last_page = self.client.get(history, params={"limit": 1, "before": first_page["next_before"]}).json()
        self.assertEqual(last_page["attempts"][0]["attempt_id"], saved["attempt_id"])
        self.assertIsNone(last_page["next_before"])

        conflict = self.submit(["q15-b"], submission_id=key)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json(), {"detail": {"code": "submission_id_reused"}})
        with closing(connect(self.database)) as connection, connection:
            connection.execute("DELETE FROM study_sets WHERE legacy_id = 'html-css'")
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertEqual(self.submit(submission_id=key).json(), saved)
        self.assertEqual(len(self.client.get(history).json()["attempts"]), 2)

        with TestClient(self.client.app) as restarted:
            self.assertEqual(restarted.post("/api/auth/login", json=self.credentials).status_code, 200)
            self.assertEqual(restarted.get(detail).json(), saved)

        self.client.app.state.demo_username = "other-reviewer"
        self.credentials["username"] = "other-reviewer"
        self.sign_in()
        self.assertEqual(self.client.get(history).json(), {"attempts": [], "next_before": None})
        self.assertEqual(self.client.get(detail).status_code, 404)
        self.assertEqual(self.client.get(history, params={"before": saved["attempt_id"]}).status_code, 404)

    def test_history_filters_by_set_before_pagination_and_accepts_legacy_references(self) -> None:
        self.sign_in()
        history = "/api/test-attempts"
        older = self.submit().json()
        with closing(connect(self.database)) as connection:
            set_id = connection.execute("SELECT id FROM study_sets WHERE legacy_id = 'html-css'").fetchone()["id"]
        paper = self.client.get(f"/api/study-sets/{set_id}/test").json()
        newer = self.client.post(f"/api/study-sets/{set_id}/test", json={
            "revision": paper["revision"],
            "answers": [{"question_id": q["id"], "selected_ids": [q["options"][0]["id"]]} for q in paper["questions"]],
        }).json()
        other = self.client.post("/api/study-sets/python/timed-test", json={
            "start_id": str(uuid4()), "duration_minutes": 1,
        }).json()
        other_result = self.client.post(f"{history}/{other['attempt_id']}/finish").json()

        global_page = self.client.get(history, params={"limit": 1}).json()
        self.assertEqual(global_page["attempts"][0]["attempt_id"], other_result["attempt_id"])
        filtered = self.client.get(history, params={"set_id": set_id, "limit": 1}).json()
        self.assertEqual(filtered["attempts"][0]["attempt_id"], newer["attempt_id"])
        next_page = self.client.get(history, params={"set_id": "html-css", "before": filtered["next_before"]}).json()
        self.assertEqual([attempt["attempt_id"] for attempt in next_page["attempts"]], [older["attempt_id"]])
        self.assertEqual(self.client.get(history, params={"set_id": set_id, "before": other["attempt_id"]}).status_code, 404)

    def test_export_archives_pdf_by_attempt_and_retries_replace_the_same_file(self) -> None:
        self.sign_in()
        result = self.submit().json()
        attempt_id = result["attempt_id"]
        path = f"/api/test-attempts/{attempt_id}/pdf"
        file = self.exports / f"{attempt_id}.pdf"
        headers = {"Content-Type": "application/pdf"}
        sample = Path(__file__).resolve().parents[2] / "docs" / "features" / "test-results.sample.pdf"
        content = sample.read_bytes()

        for exported in (content, content + b"\n"):
            response = self.client.put(path, headers=headers, content=exported)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json(), {"saved": True})
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertEqual(file.read_bytes(), exported)
        self.assertEqual(list(self.exports.iterdir()), [file])

        invalid = b"%PDF-1.7\nnot a PDF document\n%%EOF\n"
        self.assertEqual(self.client.put(path, headers=headers, content=invalid).status_code, 400)
        self.assertEqual(file.read_bytes(), content + b"\n")

        self.client.app.state.pdf_export_dir = self.exports / file.name
        self.assertEqual(self.client.put(path, headers=headers, content=content).status_code, 503)
        self.client.app.state.pdf_export_dir = None
        self.assertEqual(self.client.put(path, headers=headers, content=content).json(), {"saved": False})
        self.assertEqual(file.read_bytes(), content + b"\n")

    def test_export_rejects_unsigned_unknown_incomplete_and_invalid_uploads(self) -> None:
        headers = {"Content-Type": "application/pdf"}
        self.assertEqual(self.client.put(f"/api/test-attempts/{uuid4()}/pdf", headers=headers).status_code, 401)
        self.sign_in()
        attempt_id = self.submit().json()["attempt_id"]
        path = f"/api/test-attempts/{attempt_id}/pdf"
        active = self.client.post("/api/study-sets/html-css/timed-test", json={
            "start_id": str(uuid4()), "duration_minutes": 1,
        }).json()
        self.assertEqual(self.client.put(f"/api/test-attempts/{active['attempt_id']}/pdf", headers=headers).status_code, 404)
        self.assertEqual(self.client.put(path, content=b"unknown type").status_code, 415)
        self.assertEqual(self.client.put(path, headers=headers, content=b"%PDF-1.4\n").status_code, 400)
        with patch("app.test_pdf.MAX_PDF_BYTES", 16):
            self.assertEqual(self.client.put(path, headers=headers, content=b"x" * 17).status_code, 413)
        self.client.app.state.demo_username = "other-reviewer"
        self.credentials["username"] = "other-reviewer"
        self.sign_in()
        self.assertEqual(self.client.put(path, headers=headers).status_code, 404)
        self.assertFalse(self.exports.exists())

    def test_startup_adds_history_to_an_existing_database(self) -> None:
        with closing(connect(self.database)) as connection, connection:
            connection.execute("DROP TABLE test_attempts")
            question_count = connection.execute("SELECT COUNT(*) FROM questions").fetchone()[0]

        with TestClient(self.client.app) as restarted:
            self.assertEqual(restarted.post("/api/auth/login", json=self.credentials).status_code, 200)
            response = restarted.get("/api/test-attempts")
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json(), {"attempts": [], "next_before": None})

        with closing(connect(self.database)) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM questions").fetchone()[0], question_count)
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_rejects_incomplete_duplicate_foreign_and_single_choice_answers(self) -> None:
        self.sign_in()
        answer = {"question_id": "q15", "selected_ids": ["q15-a"]}
        for answers in ([], [answer], [answer, answer], [{"question_id": "missing", "selected_ids": ["q15-a"]}]):
            with self.subTest(answers=answers):
                self.assertEqual(self.client.post(self.path, json={"revision": 1, "answers": answers}).status_code, 422)
        for selected in ([], ["q15-a", "q15-a"], ["q16-a"], ["q15-a", "q15-b"]):
            with self.subTest(selected=selected):
                self.assertEqual(self.submit(selected).status_code, 422)

    def test_multiple_select_requires_exact_set_and_current_revision(self) -> None:
        self.sign_in()
        with closing(connect(self.database)) as connection, connection:
            connection.execute("UPDATE answer_options SET is_correct = 1 WHERE id = 'q15-b'")
            connection.execute("UPDATE study_sets SET revision = 2 WHERE legacy_id = 'html-css'")
        stale = self.submit()
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json(), {"detail": {"code": "revision_changed"}})
        paper = self.client.get(self.path).json()
        self.assertEqual(paper["revision"], 2)
        self.assertTrue(paper["questions"][0]["multiple"])
        for selected, expected_score in (
            (["q15-b", "q15-a"], 2),
            (["q15-a"], 1),
            (["q15-a", "q15-b", "q15-c"], 1),
        ):
            with self.subTest(selected=selected):
                response = self.submit(selected, revision=2)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["score"], expected_score)
                self.assertEqual(response.json()["questions"][0]["correct_ids"], ["q15-a", "q15-b"])

    def test_confirmed_blank_answers_are_graded_zero_and_saved(self) -> None:
        self.sign_in()
        payload = {
            "revision": 1, "submission_id": str(uuid4()),
            "answers": [
                {"question_id": "q15", "selected_ids": []},
                {"question_id": "q16", "selected_ids": ["q16-c"]},
                {"question_id": "q24", "selected_ids": []},
            ],
        }
        self.assertEqual(self.client.post(self.path, json=payload).status_code, 422)
        confirmed = {**payload, "allow_unanswered": True}
        response = self.client.post(self.path, json=confirmed)
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual((result["score"], result["total"]), (1, 3))
        self.assertEqual([question["selected_ids"] for question in result["questions"]], [[], ["q16-c"], []])
        self.assertEqual(self.client.post(self.path, json=confirmed).json(), result)
        self.assertEqual(self.client.post(self.path, json=payload).status_code, 422)
