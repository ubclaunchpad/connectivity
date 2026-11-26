"""Tests for the probe loop against a fake backend."""

from __future__ import annotations

import hashlib
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

import pytest

from probe.runner import Config, ProbeError, run_loop, run_once, run_script

PROBE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
TOKEN = "connectivity-local-probe-token"
FIXED_SCRIPT = b"printf '{\"result_data\":{\"rtt_avg_ms\":18.4,\"packet_loss_pct\":0}}\\n'\n"
DEFINITION = b'{"name": "Fixed"}\n'


class FakeBackend:
    def __init__(self) -> None:
        self.files: dict[str, bytes] = {}
        self.assignments: list[dict] = []
        self.checked_in = threading.Event()
        self.measurements: list[dict] = []
        self.download_tokens: list[str | None] = []
        backend = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args: object) -> None:
                pass

            def reply(self, code: int, data: bytes) -> None:
                self.send_response(code)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self) -> None:
                backend.download_tokens.append(self.headers.get("X-Probe-Token"))
                data = backend.files.get(urlsplit(self.path).path)
                self.reply(404, b"") if data is None else self.reply(200, data)

            def do_POST(self) -> None:
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                if self.headers.get("X-Probe-Token") != TOKEN or body["probe_id"] != PROBE_ID:
                    return self.reply(401, b'{"error":"unauthorized"}')
                if self.path == "/functions/v1/probe-check-in":
                    backend.checked_in.set()
                    assignment = backend.assignments.pop(0) if backend.assignments else None
                    return self.reply(200, json.dumps({"assignment": assignment}).encode())
                backend.measurements.append(body)
                self.reply(201, json.dumps({"id": body["id"]}).encode())

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def assign(self, revision_id: str, script: bytes, script_hash: str | None = None) -> None:
        base = f"/storage/v1/object/sign/test-revisions/fixed/{revision_id}"
        self.files[f"{base}/run.sh"] = script
        self.files[f"{base}/test.json"] = DEFINITION
        self.assignments.append(
            {
                "test_revision_id": revision_id,
                "script": {
                    "download_path": f"{base}/run.sh?token=example",
                    "sha256": script_hash or hashlib.sha256(script).hexdigest(),
                },
                "definition": {
                    "download_path": f"{base}/test.json?token=example",
                    "sha256": hashlib.sha256(DEFINITION).hexdigest(),
                },
            }
        )


@pytest.fixture
def backend():
    fake = FakeBackend()
    thread = threading.Thread(target=fake.server.serve_forever, daemon=True)
    thread.start()
    yield fake
    fake.server.shutdown()
    fake.server.server_close()


@pytest.fixture
def config(backend: FakeBackend) -> Config:
    return Config(probe_id=PROBE_ID, backend_url=backend.url, probe_token=TOKEN)


def test_two_runs_in_order_with_new_revision(backend: FakeBackend, config: Config) -> None:
    backend.assign("dddddddd-dddd-4ddd-8ddd-dddddddddddd", FIXED_SCRIPT)
    backend.assign("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", FIXED_SCRIPT)

    assert run_once(config) is True
    assert run_once(config) is True
    assert run_once(config) is False

    first, second = backend.measurements
    assert first["test_revision_id"] == "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
    assert second["test_revision_id"] == "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
    assert first["id"] != second["id"]
    for record in (first, second):
        assert record["status"] == "completed"
        assert record["result_code"] == 0
        assert record["result_data"] == {"rtt_avg_ms": 18.4, "packet_loss_pct": 0}
        assert record["probe_id"] == PROBE_ID
        assert record["location"] is None


def test_bad_hash_prevents_execution(backend: FakeBackend, config: Config, tmp_path: Path) -> None:
    marker = tmp_path / "ran"
    backend.assign(
        "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        f"touch '{marker.as_posix()}'\n".encode(),
        script_hash="0" * 64,
    )

    with pytest.raises(ProbeError, match="hash check"):
        run_once(config)

    assert not marker.exists()
    assert backend.measurements == []


def test_empty_assignment_waits_and_shutdown_stops_loop(
    backend: FakeBackend, config: Config
) -> None:
    stop = threading.Event()
    thread = threading.Thread(target=run_loop, args=(config, stop), kwargs={"idle_wait": 60})
    thread.start()
    assert backend.checked_in.wait(5)

    stop.set()
    thread.join(timeout=5)

    assert not thread.is_alive()
    assert backend.measurements == []


def test_token_with_newline_is_stripped_and_not_logged(
    backend: FakeBackend, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PROBE_ID", PROBE_ID)
    monkeypatch.setenv("BACKEND_URL", backend.url)
    monkeypatch.setenv("PROBE_TOKEN", TOKEN + "\n")

    assert run_once(Config.from_env()) is False

    # Without the strip, the HTTP layer rejects the header; its error must not echo the token.
    with pytest.raises(ProbeError) as error:
        run_once(Config(probe_id=PROBE_ID, backend_url=backend.url, probe_token=TOKEN + "\n"))
    assert TOKEN not in str(error.value)


def test_token_kept_out_of_downloads_and_script(
    backend: FakeBackend, config: Config, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PROBE_TOKEN", TOKEN)
    backend.assign(
        "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        b'printf \'{"result_data":{"token":"%s"}}\' "${PROBE_TOKEN-unset}"\n',
    )

    run_once(config)

    assert backend.measurements[0]["result_data"] == {"token": "unset"}
    assert backend.download_tokens == [None, None]


@pytest.mark.parametrize(
    ("script", "expected"),
    [
        (b"echo oops >&2; exit 3\n", ("failed", 3, {})),
        (b"echo not-json\n", ("failed", 0, {})),
        (b'echo \'{"other":1}\'\n', ("failed", 0, {})),
        (b'echo \'{"result_data":{"rtt_avg_ms":null,"packet_loss_pct":100}}\'\n',
         ("completed", 0, {"rtt_avg_ms": None, "packet_loss_pct": 100})),
    ],
)
def test_run_script_statuses(tmp_path: Path, script: bytes, expected: tuple) -> None:
    (tmp_path / "run.sh").write_bytes(script)

    assert run_script(str(tmp_path), timeout=10) == expected


def test_run_script_timeout(tmp_path: Path) -> None:
    (tmp_path / "run.sh").write_bytes(b"exec sleep 5\n")

    assert run_script(str(tmp_path), timeout=0.2) == ("timeout", None, {})
