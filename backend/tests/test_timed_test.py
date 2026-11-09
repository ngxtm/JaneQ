import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Barrier
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.database import connect


class TimedTestTests(TestCase):
    start_path = "/api/study-sets/html-css/timed-test"
    history_path = "/api/test-attempts"

    def setUp(self) -> None:
        directory = self.enterContext(TemporaryDirectory())
        self.database = Path(directory) / "timed-test.sqlite3"
        self.started_at = datetime(2026, 11, 9, 8, 0, tzinfo=UTC)
        self.clock = self.enterContext(patch("app.timed_test.now_utc", return_value=self.started_at))
        self.client = self.open_client("review")
        self.start_id = str(uuid4())

    def open_client(self, username: str) -> TestClient:
        with patch.dict(os.environ, {
            "JANEQ_DB_PATH": str(self.database),
            "JANEQ_DEMO_USERNAME": username,
            "JANEQ_DEMO_PASSWORD": "test-password",
            "JANEQ_SESSION_SECRET": "disposable-timed-session-secret-12345",
            "JANEQ_COOKIE_SECURE": "false",
        }):
            from app.main import create_app

            return self.enterContext(TestClient(create_app()))

    def sign_in(self, client: TestClient, username: str = "review") -> None:
        response = client.post("/api/auth/login", json={"username": username, "password": "test-password"})
        self.assertEqual(response.status_code, 200, response.text)

    def start(self):
        return self.client.post(self.start_path, json={"start_id": self.start_id})

    def assert_deadline(self, state: dict, expected: datetime) -> None:
        self.assertEqual(datetime.fromisoformat(state["deadline_at"]), expected)

    def test_timed_routes_require_session_and_validate_state(self) -> None:
        unknown_attempt = f"{self.history_path}/{uuid4()}"
        answer = {"question_id": "q15", "selected_ids": ["q15-a"]}
        self.assertEqual(self.start().status_code, 401)
        self.assertEqual(self.client.get(f"{unknown_attempt}/state").status_code, 401)
        self.assertEqual(self.client.post(f"{unknown_attempt}/advance", json=answer).status_code, 401)
        schema = self.client.get("/openapi.json").json()["paths"]
        for path, method in (
            ("/api/study-sets/{set_id}/timed-test", "post"),
            ("/api/test-attempts/{attempt_id}/state", "get"),
            ("/api/test-attempts/{attempt_id}/advance", "post"),
        ):
            self.assertEqual(schema[path][method]["security"], [{"SessionCookie": []}])

        self.sign_in(self.client)
        self.assertEqual(self.client.get(f"{unknown_attempt}/state").status_code, 404)
        self.assertEqual(self.client.post(self.start_path, json={}).status_code, 422)
        with closing(connect(self.database)) as connection, connection:
            connection.execute("UPDATE answer_options SET is_correct = 0 WHERE question_id = 'q15'")
        rejected = self.start()
        self.assertEqual(rejected.status_code, 409)
        self.assertEqual(rejected.json(), {"detail": {"code": "draft", "remaining_questions": 1}})
        self.assertEqual(self.client.get(self.history_path).json()["attempts"], [])

    def test_grades_the_frozen_paper_and_times_out_at_the_deadline(self) -> None:
        self.sign_in(self.client)
        with closing(connect(self.database)) as connection, connection:
            connection.execute("UPDATE answer_options SET is_correct = 1 WHERE id = 'q15-b'")

        response = self.start()
        self.assertEqual(response.status_code, 200, response.text)
        first = response.json()
        detail = f"{self.history_path}/{first['attempt_id']}"
        advance = f"{detail}/advance"
        self.assertEqual(first["status"], "in_progress")
        self.assertEqual(first["position"], 1)
        self.assertTrue(first["question"]["multiple"])
        self.assertEqual(set(first["question"]), {"id", "prompt", "options", "multiple"})
        self.assertNotIn("correct_ids", response.text)
        self.assert_deadline(first, self.started_at + timedelta(seconds=60))
        self.assertEqual(self.start().json(), first)
        conflict = self.client.post("/api/study-sets/python/timed-test", json={"start_id": self.start_id})
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json(), {"detail": {"code": "start_id_reused"}})
        self.assertEqual(self.client.get(detail).status_code, 404)
        self.assertEqual(self.client.get(self.history_path).json()["attempts"], [])
        for answer in ({"question_id": "q15"}, {"question_id": "q15", "selected_ids": ["q16-a"]}):
            self.assertEqual(self.client.post(advance, json=answer).status_code, 422)
        early = self.client.post(advance, json={"question_id": "q16", "selected_ids": ["q16-c"]})
        self.assertEqual(early.status_code, 409)
        self.assertEqual(early.json(), {"detail": {"code": "question_changed"}})

        with closing(connect(self.database)) as connection, connection:
            connection.execute("UPDATE questions SET prompt = 'Edited prompt' WHERE id = 'q24'")
            connection.execute("UPDATE answer_options SET is_correct = 0 WHERE id = 'q15-b'")
            connection.execute("UPDATE study_sets SET revision = 2 WHERE legacy_id = 'html-css'")
        just_before_deadline = self.started_at + timedelta(seconds=59, microseconds=999999)
        self.clock.return_value = just_before_deadline
        first_answer = {"question_id": "q15", "selected_ids": ["q15-b", "q15-a"]}
        second = self.client.post(advance, json=first_answer).json()
        self.assertEqual((second["position"], second["question"]["id"]), (2, "q16"))
        self.assert_deadline(second, just_before_deadline + timedelta(seconds=60))
        self.assertEqual(self.client.post(advance, json=first_answer).json(), second)

        self.clock.return_value = just_before_deadline + timedelta(seconds=2)
        third = self.client.post(advance, json={"question_id": "q16", "selected_ids": ["q16-a"]}).json()
        self.assertEqual((third["position"], third["question"]["id"]), (3, "q24"))
        self.assertNotEqual(third["question"]["prompt"], "Edited prompt")
        self.clock.return_value = datetime.fromisoformat(third["deadline_at"])
        expired = self.client.get(f"{detail}/state").json()
        self.assertTrue(expired["expired"])
        self.assertEqual(expired["position"], 3)
        last_answer = {"question_id": "q24", "selected_ids": ["q24-a"]}
        response = self.client.post(advance, json=last_answer)
        self.assertEqual(response.status_code, 200, response.text)
        completed = response.json()
        result = completed["result"]
        self.assertEqual(completed["status"], "completed")
        self.assertEqual((result["mode"], result["revision"], result["score"], result["total"]), ("timed", 1, 1, 3))
        self.assertEqual(
            [(q["selected_ids"], q["correct"], q["timed_out"]) for q in result["questions"]],
            [(["q15-a", "q15-b"], True, False), (["q16-a"], False, False), ([], False, True)],
        )
        self.assertEqual(self.client.get(detail).json(), result)
        self.assertEqual(self.client.get(self.history_path).json()["attempts"][0]["attempt_id"], first["attempt_id"])
        self.assertEqual(self.client.get(f"{detail}/state").json(), completed)
        self.assertEqual(self.client.post(advance, json=last_answer).json(), completed)
        self.assertEqual(self.start().json(), completed)

    def test_resume_after_deadline_and_concurrent_advance(self) -> None:
        self.sign_in(self.client)
        first = self.start().json()
        detail = f"{self.history_path}/{first['attempt_id']}"
        self.clock.return_value = self.started_at + timedelta(minutes=5)

        restarted = self.open_client("review")
        self.sign_in(restarted)
        resumed = restarted.get(f"{detail}/state").json()
        self.assertEqual(resumed["position"], 1)
        self.assertTrue(resumed["expired"])
        self.assertEqual(resumed["deadline_at"], first["deadline_at"])
        other = self.open_client("other-reviewer")
        self.sign_in(other, "other-reviewer")
        self.assertEqual(other.get(f"{detail}/state").status_code, 404)
        self.assertEqual(other.post(f"{detail}/advance", json={"question_id": "q15"}).status_code, 404)

        ready = Barrier(2)

        def advance(client: TestClient):
            ready.wait(timeout=5)
            return client.post(f"{detail}/advance", json={"question_id": "q15"})

        with ThreadPoolExecutor(max_workers=2) as workers:
            first_request = workers.submit(advance, self.client)
            second_request = workers.submit(advance, restarted)
            responses = [first_request.result(), second_request.result()]
        for response in responses:
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["position"], 2)
            self.assert_deadline(response.json(), self.clock.return_value + timedelta(seconds=60))
        self.assertEqual(responses[0].json(), responses[1].json())
