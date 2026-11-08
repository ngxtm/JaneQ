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

    def sign_in(self) -> None:
        self.assertEqual(self.client.post("/api/auth/login", json=self.credentials).status_code, 200)

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
        self.sign_in()
        with closing(connect(self.database)) as connection, connection:
            connection.execute("UPDATE answer_options SET is_correct = 0 WHERE question_id = 'q15'")
        self.assertEqual(self.client.get(self.path).status_code, 409)
        self.assertEqual(self.client.get("/api/study-sets/missing/learn").status_code, 404)
        self.assertEqual(self.client.get("/api/study-sets/html-css/preview").status_code, 409)

    def test_rounds_reach_mastery_and_restore_wrong_feedback(self) -> None:
        self.sign_in()
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
        self.sign_in()
        with closing(connect(self.database)) as connection, connection:
            connection.execute("UPDATE answer_options SET is_correct = 1 WHERE id = 'q15-b'")
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

    def test_upgrade_replaces_changed_keys_once_and_preserves_unaffected_progress(self) -> None:
        self.sign_in()
        with closing(connect(self.database)) as connection, connection:
            # Model v1 with a manually saved key and progress in two existing sets.
            connection.execute(
                """
                DELETE FROM study_sets WHERE id NOT IN (
                    SELECT study_set_id FROM questions WHERE id GLOB 'q[0-9][0-9]'
                )
                """,
            )
            connection.execute("UPDATE seed_history SET name = 'builtin_questions_v1'")
            connection.execute("UPDATE answer_options SET is_correct = (id = 'q16-a') WHERE question_id = 'q16'")
            connection.execute("UPDATE questions SET prompt = 'Old prompt' WHERE id = 'q01'")
            connection.execute("INSERT INTO study_sets (id, title, source_kind) VALUES ('custom', 'Custom', 'custom')")
        html = self.command(self.client.get(self.path).json(), "check", selected_ids=["q15-a"])

        api_path = "/api/study-sets/api-http/learn"
        api = self.client.get(api_path).json()
        self.assertEqual(self.client.post(api_path, json={
            "action": "check", "revision": api["revision"], "version": api["version"], "selected_ids": ["q11-a"],
        }).status_code, 200)

        for _ in range(2):
            with TestClient(self.app, cookies=self.client.cookies) as reopened:
                sets = reopened.get("/api/study-sets").json()
                builtins = [item for item in sets if item["source_kind"] == "builtin"]
                self.assertEqual(len(builtins), 18)
                self.assertEqual(sum(item["question_count"] for item in builtins), 281)
                self.assertTrue(all(item["status"] == "ready" for item in builtins))
                self.assertIn("custom", {item["id"] for item in sets})
                updated = reopened.get(self.path).json()
                self.assertEqual((updated["revision"], updated["phase"]), (html["revision"] + 1, "question"))
                self.assertTrue(updated["revision_changed"])
                unaffected = reopened.get(api_path).json()
                self.assertEqual((unaffected["revision"], unaffected["phase"]), (api["revision"], "feedback"))
                self.assertFalse(unaffected["revision_changed"])
        with closing(connect(self.database)) as connection:
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
            self.assertEqual(connection.execute(
                "SELECT id FROM answer_options WHERE question_id = 'q16' AND is_correct = 1",
            ).fetchone()["id"], "q16-c")
            self.assertNotEqual(connection.execute(
                "SELECT prompt FROM questions WHERE id = 'q01'",
            ).fetchone()["prompt"], "Old prompt")

    def test_all_built_in_sets_open_without_an_editor(self) -> None:
        self.sign_in()
        sets = self.client.get("/api/study-sets").json()
        for study_set in sets:
            with self.subTest(study_set=study_set["id"]):
                path = f"/api/study-sets/{study_set['id']}"
                response = self.client.get(f"{path}/learn")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["total_questions"], study_set["question_count"])
                self.assertNotIn("correct_ids", response.json()["question"])
        editor_path = "/api/study-sets/html-css/editor"
        self.assertEqual(self.client.get(editor_path).status_code, 404)
        self.assertEqual(self.client.put(editor_path, json={"revision": 1, "answers": {}}).status_code, 404)

    def test_new_set_grades_seeded_multi_select(self) -> None:
        self.sign_in()
        self.path = "/api/study-sets/python/learn"
        view = self.client.get(self.path).json()
        for answer in ("c", "b", "d", "a"):
            option_id = f"{view['question']['id']}-{answer}"
            view = self.command(view, "check", selected_ids=[option_id])
            self.assertTrue(view["feedback"]["correct"])
            view = self.command(view, "advance")
        self.assertEqual(view["question"]["id"], "python-05")
        self.assertTrue(view["question"]["multiple"])
        feedback = self.command(view, "check", selected_ids=["python-05-d", "python-05-b"])["feedback"]
        self.assertTrue(feedback["correct"])
