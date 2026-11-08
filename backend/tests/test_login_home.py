import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch

from fastapi.testclient import TestClient


class LoginHomeTests(TestCase):
    def setUp(self) -> None:
        directory = self.enterContext(TemporaryDirectory())
        settings = {
            "JANEQ_DB_PATH": str(Path(directory) / "janeq.sqlite3"),
            "JANEQ_DEMO_USERNAME": "review",
            "JANEQ_DEMO_PASSWORD": "test-password",
            "JANEQ_SESSION_SECRET": "disposable-test-session-secret-12345",
            "JANEQ_COOKIE_SECURE": "false",
        }
        with patch.dict(os.environ, settings):
            from app.main import create_app

            app = create_app()
        self.client = self.enterContext(TestClient(app))

    def test_openapi_describes_cookie_and_unauthorized_responses(self) -> None:
        schema = self.client.get("/openapi.json").json()
        cookie = schema["components"]["securitySchemes"]["SessionCookie"]
        self.assertEqual(
            (cookie["type"], cookie["in"], cookie["name"]),
            ("apiKey", "cookie", "janeq_session"),
        )
        login = schema["paths"]["/api/auth/login"]["post"]
        self.assertIn("401", login["responses"])
        self.assertNotIn("security", login)
        for path in ("/api/auth/me", "/api/study-sets"):
            operation = schema["paths"][path]["get"]
            self.assertEqual(operation["security"], [{"SessionCookie": []}])
            self.assertIn("401", operation["responses"])

    def test_signed_session_and_seeded_study_sets(self) -> None:
        for path in ("/api/auth/me", "/api/study-sets"):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json(), {"detail": "Sign in first."})

        credentials = {"username": "review", "password": "test-password"}
        response = self.client.post(
            "/api/auth/login", json={**credentials, "password": "wrong"}
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"detail": "Incorrect username or password."})
        self.assertEqual(self.client.post("/api/auth/login", json=credentials).status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me").json(), {"username": "review"})

        response = self.client.get("/api/study-sets")
        self.assertEqual(response.status_code, 200)
        study_sets = response.json()
        self.assertEqual(len(study_sets), 6)
        self.assertEqual(sum(study_set["question_count"] for study_set in study_sets), 41)

        self.assertEqual(self.client.post("/api/auth/logout").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

        self.client.cookies.set("janeq_session", "invalid-signature")
        self.assertEqual(self.client.get("/api/study-sets").status_code, 401)
