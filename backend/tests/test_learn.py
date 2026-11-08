import os
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.database import connect


class LearnTests(TestCase):
    path = "/api/study-sets/html-css/learn"
    key = {"q15": "q15-a", "q16": "q16-c", "q24": "q24-a"}

    def setUp(self) -> None:
        directory = self.enterContext(TemporaryDirectory())
        self.database = Path(directory) / "learn.sqlite3"
        self.credentials = {"username": "review", "password": "test-password"}
        with patch.dict(os.environ, {
            "JANEQ_DB_PATH": str(self.database),
            "JANEQ_DEMO_USERNAME": self.credentials["username"],
            "JANEQ_DEMO_PASSWORD": self.credentials["password"],
            "JANEQ_SESSION_SECRET": "disposable-test-session-secret-12345",
            "JANEQ_COOKIE_SECURE": "false",
        }):
            from app.main import create_app

            self.app = create_app()
        self.client = self.enterContext(TestClient(self.app))

    def configure(self, *, multiple: bool = False) -> None:
        self.assertEqual(self.client.post("/api/auth/login", json=self.credentials).status_code, 200)
        ids = [*self.key.values(), "q15-b"] if multiple else list(self.key.values())
        with closing(connect(self.database)) as connection, connection:
            connection.executemany("UPDATE answer_options SET is_correct = 1 WHERE id = ?", [(item,) for item in ids])

    def command(self, view: dict, action: str, expected: int = 200, **fields) -> dict:
        response = self.client.post(self.path, json={
            "action": action, "revision": view["revision"], "version": view["version"], **fields,
        })
        self.assertEqual(response.status_code, expected, response.text)
        return response.json()

    def test_draft_and_cookie_contract(self) -> None:
        self.assertEqual(self.client.get(self.path).status_code, 401)
        schema = self.client.get("/openapi.json").json()
        for method in ("get", "post"):
            operation = schema["paths"]["/api/study-sets/{set_id}/learn"][method]
            self.assertEqual(operation["security"], [{"SessionCookie": []}])
            self.assertIn("409", operation["responses"])
        self.client.post("/api/auth/login", json=self.credentials)
        self.assertEqual(self.client.get(self.path).status_code, 409)
        self.assertEqual(self.client.get("/api/study-sets/missing/learn").status_code, 404)
        self.assertEqual(self.client.get("/api/study-sets/html-css/preview").status_code, 409)

    def test_rounds_reach_mastery_and_restore_wrong_feedback(self) -> None:
        self.configure()
        view = self.client.get(self.path).json()
        initial_view = view
        self.assertIsNone(view["feedback"])
        self.assertNotIn("correct_ids", view["question"])
        for answer in ("q15-a", "q16-a", "q24-a"):
            view = self.command(view, "check", selected_ids=[answer])
            if answer == "q16-a":
                self.assertFalse(view["feedback"]["correct"])
                self.assertEqual(view["feedback"]["correct_ids"], ["q16-c"])
                with TestClient(self.app, cookies=self.client.cookies) as reopened:
                    self.assertEqual(reopened.get(self.path).json(), view)
            view = self.command(view, "advance")
        self.command(initial_view, "check", 409, selected_ids=["q15-a"])
        self.assertEqual((view["phase"], view["studied"], view["familiar"], view["mastered"]), ("summary", 3, 2, 0))
        self.assertEqual(len(view["review"]), 3)

        view = self.command(view, "advance")
        for _ in range(3):
            question_id = view["question"]["id"]
            view = self.command(view, "check", selected_ids=[self.key[question_id]])
            view = self.command(view, "advance")
        self.assertEqual((view["phase"], view["familiar"], view["mastered"]), ("summary", 1, 2))
        view = self.command(view, "advance")
        self.assertEqual(view["question"]["id"], "q16")
        view = self.command(view, "check", selected_ids=["q16-a"])
        self.assertEqual((view["familiar"], view["mastered"]), (1, 2))
        view = self.command(view, "advance")
        view = self.command(view, "advance")
        view = self.command(view, "check", selected_ids=["q16-c"])
        view = self.command(view, "advance")
        self.assertEqual((view["phase"], view["mastered"]), ("complete", 3))

    def test_multi_select_and_revision_conflict(self) -> None:
        self.configure(multiple=True)
        view = self.client.get(self.path).json()
        self.assertTrue(view["question"]["multiple"])
        self.command(view, "check", 422, selected_ids=["q15-a", "q15-a"])
        self.command(view, "check", 422, selected_ids=["q16-c"])
        for selection, correct in ((["q15-a"], False), (["q15-a", "q15-b", "q15-c"], False), (["q15-b", "q15-a"], True)):
            view = self.command(view, "check", selected_ids=selection)
            self.assertEqual(view["feedback"]["correct"], correct)
            view = self.command(view, "reset")

        with closing(connect(self.database)) as connection, connection:
            connection.execute("UPDATE study_sets SET revision = 2 WHERE id = 'html-css'")
        self.command(view, "check", 409, selected_ids=["q15-a", "q15-b"])
        refreshed = self.client.get(self.path).json()
        self.assertTrue(refreshed["revision_changed"])
        self.assertEqual((refreshed["revision"], refreshed["round"], refreshed["mastered"]), (2, 1, 0))

    def test_existing_database_keeps_its_answer_key(self) -> None:
        self.configure()
        with closing(connect(self.database)) as connection, connection:
            connection.execute("DROP TABLE learn_progress")
        with TestClient(self.app, cookies=self.client.cookies) as reopened:
            sets = reopened.get("/api/study-sets").json()
            self.assertEqual(sum(item["question_count"] for item in sets), 41)
            self.assertEqual(next(item["status"] for item in sets if item["id"] == "html-css"), "ready")
            self.assertEqual(reopened.get(self.path).json()["phase"], "question")

    def test_seeded_draft_can_be_saved_and_opened_in_learn(self) -> None:
        editor_path = "/api/study-sets/html-css/editor"
        self.assertEqual(self.client.get(editor_path).status_code, 401)
        self.assertEqual(self.client.put(editor_path, json={"revision": 1, "answers": {}}).status_code, 401)
        schema = self.client.get("/openapi.json").json()
        for operation in schema["paths"]["/api/study-sets/{set_id}/editor"].values():
            self.assertEqual(operation["security"], [{"SessionCookie": []}])
            self.assertIn("409", operation["responses"])
        self.assertEqual(self.client.post("/api/auth/login", json=self.credentials).status_code, 200)
        editor = self.client.get(editor_path).json()
        self.assertEqual((editor["status"], editor["configured_count"], editor["revision"]), ("draft", 0, 1))
        answers = {"q15": ["q15-a"], "q16": [], "q24": []}
        saved = self.client.put(editor_path, json={"revision": 1, "answers": answers})
        self.assertEqual(saved.status_code, 200)
        self.assertEqual((saved.json()["status"], saved.json()["configured_count"], saved.json()["revision"]), ("draft", 1, 2))
        self.assertEqual(self.client.get(self.path).status_code, 409)

        answers = {question: [option] for question, option in self.key.items()}
        answers["q15"].append("q15-b")
        saved = self.client.put(editor_path, json={"revision": 2, "answers": answers})
        self.assertEqual((saved.json()["status"], saved.json()["configured_count"], saved.json()["revision"]), ("ready", 3, 3))
        unchanged = self.client.put(editor_path, json={"revision": 3, "answers": answers})
        self.assertEqual(unchanged.json(), saved.json())
        view = self.client.get(self.path).json()
        self.assertTrue(view["question"]["multiple"])
        self.assertTrue(self.command(view, "check", selected_ids=answers["q15"])["feedback"]["correct"])

        with TestClient(self.app, cookies=self.client.cookies) as reopened:
            self.assertEqual(reopened.get(editor_path).json(), saved.json())
            self.assertEqual(reopened.get(self.path).json()["phase"], "feedback")

    def test_answer_key_rejects_invalid_and_stale_changes(self) -> None:
        editor_path = "/api/study-sets/html-css/editor"
        self.configure()
        original = self.client.get(editor_path).json()
        initial_learn = self.client.get(self.path).json()
        answers = {question: [option] for question, option in self.key.items()}
        for invalid in ({**answers, "q24": ["q16-c"]}, {**answers, "q24": ["q24-a", "q24-a"]}, {"q15": ["q15-a"]}):
            self.assertEqual(self.client.put(editor_path, json={"revision": 1, "answers": invalid}).status_code, 422)
        self.assertEqual(self.client.get(editor_path).json(), original)

        self.command(initial_learn, "check", selected_ids=["q15-a"])
        cleared = self.client.put(editor_path, json={"revision": 1, "answers": {**answers, "q24": []}})
        self.assertEqual(cleared.status_code, 200)
        self.assertEqual(cleared.json()["status"], "draft")
        self.assertEqual(self.client.put(editor_path, json={"revision": 1, "answers": answers}).status_code, 409)
        self.assertEqual(self.client.get(self.path).status_code, 409)
        self.assertEqual(self.client.put(editor_path, json={"revision": 2, "answers": answers}).status_code, 200)
        refreshed = self.client.get(self.path).json()
        self.assertTrue(refreshed["revision_changed"])
        self.assertEqual((refreshed["revision"], refreshed["phase"]), (3, "question"))
