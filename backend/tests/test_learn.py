import os
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch
from uuid import UUID

from fastapi.testclient import TestClient

from app.database import connect, initialize_database


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
            connection.execute("UPDATE study_sets SET revision = 2 WHERE legacy_id = 'html-css'")
        self.command(view, "check", 409, selected_ids=["q15-a", "q15-b"])
        refreshed = self.client.get(self.path).json()
        self.assertTrue(refreshed["revision_changed"])
        self.assertEqual((refreshed["revision"], refreshed["round"], refreshed["mastered"]), (2, 1, 0))

    def test_restart_keeps_catalog_and_progress(self) -> None:
        self.sign_in()
        catalog = self.client.get("/api/study-sets").json()
        feedback = self.command(self.client.get(self.path).json(), "check", selected_ids=["q15-a"])

        for _ in range(2):
            with TestClient(self.app, cookies=self.client.cookies) as reopened:
                self.assertEqual(reopened.get("/api/study-sets").json(), catalog)
                self.assertEqual(reopened.get(self.path).json(), feedback)
        with closing(connect(self.database)) as connection:
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_old_database_requires_a_new_path(self) -> None:
        with closing(connect(self.database)) as connection, connection:
            connection.execute("UPDATE seed_history SET name = 'builtin_questions_v2'")

        with self.assertRaisesRegex(RuntimeError, "JANEQ_DB_PATH"):
            initialize_database(self.database)

        with closing(connect(self.database)) as connection:
            self.assertEqual(connection.execute("SELECT name FROM seed_history").fetchone()["name"],
                             "builtin_questions_v2")
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM questions").fetchone()[0], 281)

    def test_slug_database_upgrade_keeps_questions_and_saved_feedback(self) -> None:
        self.sign_in()
        catalog = self.client.get("/api/study-sets").json()
        html_css = next(item for item in catalog if item["legacy_id"] == "html-css")
        self.assertEqual(str(UUID(html_css["id"])), html_css["id"])
        canonical_path = f"/api/study-sets/{html_css['id']}"
        feedback = self.command(self.client.get(self.path).json(), "check", selected_ids=["q15-a"])

        # Reconstruct the previous schema and keys from a populated disposable file.
        with closing(connect(self.database)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("PRAGMA defer_foreign_keys = ON")
            for study_set in catalog:
                keys = (study_set["legacy_id"], study_set["id"])
                connection.execute("UPDATE questions SET study_set_id = ? WHERE study_set_id = ?", keys)
                connection.execute("UPDATE learn_progress SET study_set_id = ? WHERE study_set_id = ?", keys)
                connection.execute("UPDATE study_sets SET id = ? WHERE id = ?", keys)
            connection.execute("DROP INDEX study_sets_legacy_id")
            connection.execute("ALTER TABLE study_sets DROP COLUMN legacy_id")

        for _ in range(2):
            with TestClient(self.app, cookies=self.client.cookies) as reopened:
                self.assertEqual(reopened.get("/api/study-sets").json(), catalog)
                self.assertEqual(reopened.get(f"{canonical_path}/learn").json(), feedback)
                self.assertEqual(reopened.get(self.path).json(), feedback)
                self.assertEqual(reopened.get(f"{canonical_path}/test").json()["set_id"], html_css["id"])
        with closing(connect(self.database)) as connection, connection:
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
            connection.execute(
                "INSERT INTO study_sets (id, title, source_kind) VALUES (?, ?, 'custom')",
                ("725dfaec-5863-484c-85f0-f341927b6ad2", html_css["title"]),
            )
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM study_sets WHERE title = ?", (html_css["title"],)).fetchone()[0], 2)

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
