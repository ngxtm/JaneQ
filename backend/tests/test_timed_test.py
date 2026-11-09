import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import UTC, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Barrier, Event
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

    def test_whole_paper_keeps_an_answer_received_before_the_write_lock_clears(self) -> None:
        self.sign_in(self.client)
        paper = self.client.post(self.start_path, json={"start_id": self.start_id, "duration_minutes": 1}).json()
        detail = f"{self.history_path}/{paper['attempt_id']}"
        waiting_for_lock = Event()

        def signal_write_lock(statement: str) -> None:
            if statement == "BEGIN IMMEDIATE":
                waiting_for_lock.set()

        def traced_connection(path: Path):
            connection = connect(path)
            connection.set_trace_callback(signal_write_lock)
            return connection

        with patch("app.timed_test.connect", side_effect=traced_connection):
            with ThreadPoolExecutor(max_workers=1) as worker, closing(connect(self.database)) as writer:
                writer.execute("BEGIN IMMEDIATE")
                save = worker.submit(
                    self.client.put, f"{detail}/answer",
                    json={"question_id": "q15", "selected_ids": ["q15-a"], "expected_version": 0},
                )
                self.assertTrue(waiting_for_lock.wait(timeout=3))
                self.clock.return_value = datetime.fromisoformat(paper["deadline_at"])
                writer.commit()
                self.assertIsNone(save.result(timeout=3).json())

        result = self.client.post(f"{detail}/finish", params={"only_if_expired": True}).json()
        self.assertEqual((result["score"], result["questions"][0]["timed_out"]), (1, False))

    def test_automatic_finish_cannot_close_a_paper_before_the_server_deadline(self) -> None:
        self.sign_in(self.client)
        paper = self.client.post(self.start_path, json={"start_id": self.start_id, "duration_minutes": 1}).json()
        detail = f"{self.history_path}/{paper['attempt_id']}"
        early = self.client.post(f"{detail}/finish", params={"only_if_expired": True})
        self.assertEqual(early.status_code, 409)
        self.assertEqual(early.json()["detail"], {"code": "time_remaining", "server_now": paper["server_now"]})
        self.assertEqual(self.client.get(f"{detail}/state").json(), paper)

        self.clock.return_value = datetime.fromisoformat(paper["deadline_at"])
        expired = self.client.post(f"{detail}/finish", params={"only_if_expired": True})
        self.assertEqual(expired.status_code, 200)
        self.assertTrue(all(question["timed_out"] for question in expired.json()["questions"]))

    def test_whole_paper_saves_answers_in_any_order_and_grades_at_the_same_deadline(self) -> None:
        self.sign_in(self.client)
        command = {"start_id": self.start_id, "duration_minutes": 90}
        response = self.client.post(self.start_path, json=command)
        self.assertEqual(response.status_code, 200, response.text)
        paper = response.json()
        self.assertEqual((paper["status"], paper["duration_minutes"]), ("paper", 90))
        self.assertEqual([q["id"] for q in paper["questions"]], ["q15", "q16", "q24"])
        self.assertNotIn("correct_ids", response.text)
        self.assert_deadline(paper, self.started_at + timedelta(minutes=90))
        detail = f"{self.history_path}/{paper['attempt_id']}"
        last_answer = {"question_id": "q24", "selected_ids": ["q24-a"]}
        last_save = {**last_answer, "expected_version": 0}
        self.assertEqual(self.client.put(f"{detail}/answer", json=last_save).status_code, 200)
        self.assertEqual(self.client.put(f"{detail}/answer", json={
            "question_id": "q15", "selected_ids": ["q24-a"], "expected_version": 0,
        }).status_code, 422)
        self.assertEqual(self.client.put(f"{detail}/answer", json={
            "question_id": "q15", "selected_ids": ["q15-a"], "expected_version": 0,
        }).status_code, 200)
        self.assertEqual(self.client.put(f"{detail}/answer", json={
            "question_id": "q15", "selected_ids": [], "expected_version": 1,
        }).status_code, 200)
        self.assertEqual(self.client.post(f"{detail}/advance", json=last_answer).status_code, 409)

        restarted = self.open_client("review")
        self.sign_in(restarted)
        resumed = restarted.post(self.start_path, json=command).json()
        self.assertEqual(resumed["answers"], {"q24": ["q24-a"]})
        self.assertEqual(resumed["answer_versions"], {"q15": 2, "q24": 1})
        self.assertEqual(resumed["deadline_at"], paper["deadline_at"])
        self.assertEqual(restarted.get(f"{detail}/state").json(), resumed)
        other = self.open_client("other-reviewer")
        self.sign_in(other, "other-reviewer")
        self.assertEqual(other.put(f"{detail}/answer", json=last_save).status_code, 404)
        self.assertEqual(other.post(f"{detail}/finish").status_code, 404)

        self.clock.return_value = datetime.fromisoformat(paper["deadline_at"])
        late = restarted.put(f"{detail}/answer", json={
            "question_id": "q15", "selected_ids": ["q15-a"], "expected_version": 2,
        })
        self.assertEqual(late.status_code, 200, late.text)
        result = late.json()
        self.assertEqual((result["mode"], result["score"], result["total"]), ("timed", 1, 3))
        self.assertEqual([question["timed_out"] for question in result["questions"]], [True, True, False])
        self.assertEqual(restarted.post(f"{detail}/finish").json(), result)
        self.assertEqual(restarted.post(f"{detail}/advance", json=last_answer).status_code, 409)
        self.assertEqual(restarted.get(detail).json(), result)
        self.assertEqual(restarted.post(self.start_path, json=command).json(), {"status": "completed", "result": result})

    def test_whole_paper_validates_duration_and_finishes_before_deadline(self) -> None:
        self.sign_in(self.client)
        for invalid in (0, 1441, 2.5, "30"):
            response = self.client.post(self.start_path, json={"start_id": self.start_id, "duration_minutes": invalid})
            self.assertEqual(response.status_code, 422)
        response = self.client.post(self.start_path, json={
            "start_id": self.start_id, "duration_minutes": 1, "time_per_question": 30,
        })
        self.assertEqual(response.status_code, 422)
        paper = self.client.post(self.start_path, json={"start_id": self.start_id, "duration_minutes": 1}).json()
        self.assert_deadline(paper, self.started_at + timedelta(minutes=1))
        detail = f"{self.history_path}/{paper['attempt_id']}"
        for question_id, option_id in (("q15", "q15-a"), ("q16", "q16-a"), ("q24", "q24-a")):
            self.assertEqual(self.client.put(f"{detail}/answer", json={
                "question_id": question_id, "selected_ids": [option_id], "expected_version": 0,
            }).status_code, 200)
        result = self.client.post(f"{detail}/finish").json()
        self.assertEqual(result["total"], 3)
        self.assertTrue(all(not question["timed_out"] for question in result["questions"]))
        self.assertEqual(self.client.post(f"{detail}/finish").json(), result)

    def test_timed_paper_rejects_stale_saves_and_retains_the_version_of_a_cleared_answer(self) -> None:
        self.sign_in(self.client)
        paper = self.client.post(self.start_path, json={"start_id": self.start_id, "duration_minutes": 1}).json()
        detail = f"{self.history_path}/{paper['attempt_id']}"
        save_url = f"{detail}/answer"
        original = {"question_id": "q15", "selected_ids": ["q15-a"], "expected_version": 0, "write_id": str(uuid4())}
        self.assertIsNone(self.client.put(save_url, json=original).json())

        clear = {"question_id": "q15", "selected_ids": [], "expected_version": 0, "write_id": str(uuid4())}
        conflict = self.client.put(save_url, json=clear)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()["detail"], {
            "code": "answer_version_changed", "version": 1, "selected_ids": ["q15-a"], "write_id": original["write_id"],
        })
        self.assertIsNone(self.client.put(save_url, json={**clear, "expected_version": 1}).json())

        reopened = self.open_client("review")
        self.sign_in(reopened)
        stale = reopened.put(save_url, json=original)
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json()["detail"], {
            "code": "answer_version_changed", "version": 2, "selected_ids": [], "write_id": clear["write_id"],
        })
        result = reopened.post(f"{detail}/finish").json()
        self.assertEqual(result["questions"][0]["selected_ids"], [])

    def test_timed_routes_require_session_and_validate_state(self) -> None:
        unknown_attempt = f"{self.history_path}/{uuid4()}"
        answer = {"question_id": "q15", "selected_ids": ["q15-a"]}
        self.assertEqual(self.start().status_code, 401)
        self.assertEqual(self.client.get(f"{unknown_attempt}/state").status_code, 401)
        self.assertEqual(self.client.post(f"{unknown_attempt}/advance", json=answer).status_code, 401)
        self.assertEqual(self.client.put(f"{unknown_attempt}/answer", json={**answer, "expected_version": 0}).status_code, 401)
        self.assertEqual(self.client.post(f"{unknown_attempt}/finish").status_code, 401)
        schema = self.client.get("/openapi.json").json()["paths"]
        for path, method in (
            ("/api/study-sets/{set_id}/timed-test", "post"),
            ("/api/test-attempts/{attempt_id}/state", "get"),
            ("/api/test-attempts/{attempt_id}/advance", "post"),
            ("/api/test-attempts/{attempt_id}/answer", "put"),
            ("/api/test-attempts/{attempt_id}/finish", "post"),
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

    def test_custom_time_per_question_sets_deadline_and_saves_in_result(self) -> None:
        self.sign_in(self.client)
        # Test boundary validation
        invalid_short = self.client.post(self.start_path, json={"start_id": str(uuid4()), "time_per_question": 5})
        self.assertEqual(invalid_short.status_code, 422)
        invalid_long = self.client.post(self.start_path, json={"start_id": str(uuid4()), "time_per_question": 601})
        self.assertEqual(invalid_long.status_code, 422)

        # Start with custom duration: 30 seconds
        custom_id = str(uuid4())
        response = self.client.post(self.start_path, json={"start_id": custom_id, "time_per_question": 30})
        self.assertEqual(response.status_code, 200, response.text)
        first = response.json()
        self.assertEqual(first["status"], "in_progress")
        self.assertEqual(first["time_per_question"], 30)
        self.assert_deadline(first, self.started_at + timedelta(seconds=30))

        detail = f"{self.history_path}/{first['attempt_id']}"
        state = self.client.get(f"{detail}/state").json()
        self.assertEqual(state["time_per_question"], 30)
        self.assertEqual(state["deadline_at"], first["deadline_at"])

        advance = f"{detail}/advance"
        advance_time = self.started_at + timedelta(seconds=15)
        self.clock.return_value = advance_time
        second = self.client.post(advance, json={"question_id": first["question"]["id"], "selected_ids": ["q15-a"]}).json()
        self.assertEqual(second["position"], 2)
        self.assertEqual(second["time_per_question"], 30)
        self.assert_deadline(second, advance_time + timedelta(seconds=30))

        advance_time_2 = advance_time + timedelta(seconds=10)
        self.clock.return_value = advance_time_2
        third = self.client.post(advance, json={"question_id": second["question"]["id"], "selected_ids": ["q16-a"]}).json()
        self.assertEqual(third["position"], 3)
        self.assertEqual(third["time_per_question"], 30)
        self.assert_deadline(third, advance_time_2 + timedelta(seconds=30))

        advance_time_3 = advance_time_2 + timedelta(seconds=5)
        self.clock.return_value = advance_time_3
        response = self.client.post(advance, json={"question_id": third["question"]["id"], "selected_ids": ["q24-a"]})
        self.assertEqual(response.status_code, 200, response.text)
        completed = response.json()
        self.assertEqual(completed["status"], "completed")
        result = completed["result"]
        self.assertEqual(result["time_per_question"], 30)

        # Verify reading attempt directly and via history
        attempt_detail = self.client.get(detail).json()
        self.assertEqual(attempt_detail["time_per_question"], 30)

        history = self.client.get(self.history_path).json()
        self.assertEqual(history["attempts"][0]["time_per_question"], 30)

    def test_startup_migrates_test_attempts_without_time_per_question(self) -> None:
        self.sign_in(self.client)
        saved = self.start().json()
        state_path = f"{self.history_path}/{saved['attempt_id']}/state"
        with closing(connect(self.database)) as connection, connection:
            connection.execute("ALTER TABLE test_attempts DROP COLUMN timing_kind")
            connection.execute("ALTER TABLE test_attempts DROP COLUMN time_per_question")
            connection.execute(
                "UPDATE test_attempts SET state_json = json_remove(state_json, '$.time_per_question', '$.duration_minutes', '$.answers')",
            )

        restarted = self.open_client("review")
        self.sign_in(restarted)
        self.assertEqual(restarted.get(state_path).json(), saved)
        with closing(connect(self.database)) as connection:
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(test_attempts)")}
            self.assertTrue({"time_per_question", "timing_kind"}.issubset(columns))
            row = connection.execute("SELECT timing_kind, time_per_question FROM test_attempts").fetchone()
            self.assertEqual(tuple(row), ("sequential", None))
        detail = f"{self.history_path}/{saved['attempt_id']}"
        for question_id in ("q15", "q16", "q24"):
            self.clock.return_value += timedelta(minutes=2)
            self.assertEqual(restarted.post(f"{detail}/advance", json={"question_id": question_id}).status_code, 200)
        self.assertEqual(restarted.post(f"{detail}/finish").status_code, 404)
        self.assertEqual(restarted.get(detail).status_code, 200)

    def test_migration_recovers_active_papers_and_preserves_ambiguous_completed_results(self) -> None:
        self.sign_in(self.client)
        command = {"start_id": self.start_id, "duration_minutes": 10}
        active = self.client.post(self.start_path, json=command).json()
        second_command = {**command, "start_id": str(uuid4())}
        second = self.client.post(self.start_path, json=second_command).json()
        second_detail = f"{self.history_path}/{second['attempt_id']}"
        completed = self.client.post(f"{second_detail}/finish").json()
        with closing(connect(self.database)) as connection, connection:
            connection.execute("ALTER TABLE test_attempts DROP COLUMN timing_kind")

        restarted = self.open_client("review")
        self.sign_in(restarted)
        self.assertEqual(restarted.post(self.start_path, json=command).json(), active)
        self.assertEqual(restarted.post(self.start_path, json=second_command).json(), {"status": "completed", "result": completed})
        self.assertEqual(restarted.get(second_detail).json(), completed)
        self.assertEqual(restarted.post(f"{second_detail}/finish").status_code, 404)

    def test_completed_legacy_advance_can_be_replayed_after_migration(self) -> None:
        self.sign_in(self.client)
        started = self.start().json()
        detail = f"{self.history_path}/{started['attempt_id']}"
        for question_id in ("q15", "q16", "q24"):
            self.clock.return_value += timedelta(minutes=2)
            final_answer = {"question_id": question_id}
            self.assertEqual(self.client.post(f"{detail}/advance", json=final_answer).status_code, 200)
        with closing(connect(self.database)) as connection, connection:
            connection.execute("ALTER TABLE test_attempts DROP COLUMN timing_kind")
            connection.execute("""
                UPDATE test_attempts SET time_per_question = NULL,
                    result_json = json_remove(result_json, '$.time_per_question')
            """)

        restarted = self.open_client("review")
        self.sign_in(restarted)
        result = restarted.get(detail).json()
        self.assertEqual(restarted.post(f"{detail}/advance", json=final_answer).json(), {
            "status": "completed", "result": result,
        })
        self.assertEqual(restarted.post(f"{detail}/finish").status_code, 404)
