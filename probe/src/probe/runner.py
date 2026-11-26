"""Probe loop: check in, run the assigned test, and upload its measurement."""

from __future__ import annotations

import hashlib
import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

CHECK_IN_PATH = "/functions/v1/probe-check-in"
MEASUREMENTS_PATH = "/functions/v1/probe-measurements"
IDLE_WAIT_SECONDS = 30
SCRIPT_TIMEOUT_SECONDS = 30
HTTP_TIMEOUT_SECONDS = 30


class ProbeError(Exception):
    """A server or download failure that ends the run."""


@dataclass(frozen=True)
class Config:
    probe_id: str
    backend_url: str
    probe_token: str

    @classmethod
    def from_env(cls) -> Config:
        return cls(
            probe_id=os.environ["PROBE_ID"].strip(),
            backend_url=os.environ["BACKEND_URL"].strip().rstrip("/"),
            probe_token=os.environ["PROBE_TOKEN"].strip(),
        )


def _post(config: Config, path: str, body: dict) -> object:
    request = Request(
        config.backend_url + path,
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "X-Probe-Token": config.probe_token},
    )
    try:
        with urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            return json.load(response)
    except HTTPError as error:
        raise ProbeError(f"{path} returned HTTP {error.code}") from None
    except (URLError, OSError) as error:
        raise ProbeError(f"{path} failed: {error}") from None
    except ValueError:
        # No error text: a rejected header value would echo the token.
        raise ProbeError(f"{path} returned a malformed response or bad request") from None


def _download(config: Config, file: dict) -> bytes:
    """Fetch a signed path without the probe token and verify its hash."""
    try:
        path, expected = file["download_path"], file["sha256"].lower()
    except (KeyError, TypeError, AttributeError):
        raise ProbeError("check-in returned a malformed download") from None
    # The signed query token is not the probe token, but keep it out of logs anyway.
    name = path.split("?", 1)[0]
    try:
        with urlopen(config.backend_url + path, timeout=HTTP_TIMEOUT_SECONDS) as response:
            data = response.read()
    except (URLError, OSError) as error:
        raise ProbeError(f"download {name} failed: {error}") from None
    if hashlib.sha256(data).hexdigest() != expected:
        raise ProbeError(f"download {name} failed its hash check")
    return data


def check_in(config: Config) -> dict | None:
    body = _post(config, CHECK_IN_PATH, {"probe_id": config.probe_id})
    if not isinstance(body, dict) or "assignment" not in body:
        raise ProbeError("check-in returned a malformed response")
    return body["assignment"]


def run_script(test_dir: str, timeout: float) -> tuple[str, int | None, dict]:
    """Run run.sh and return (status, result_code, result_data)."""
    env = {k: v for k, v in os.environ.items() if k != "PROBE_TOKEN"}
    try:
        proc = subprocess.Popen(
            ["bash", "run.sh"],
            cwd=test_dir,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        )
    except OSError as error:
        print(f"could not start test: {error}", file=sys.stderr)
        return "failed", None, {}
    with proc:
        try:
            stdout, stderr = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            # Kill the whole group so children like ping don't hold the pipes open.
            if hasattr(os, "killpg"):
                os.killpg(proc.pid, signal.SIGKILL)
            else:
                proc.kill()
            proc.communicate()
            return "timeout", None, {}
    if stderr:
        sys.stderr.write(stderr.decode(errors="replace"))
    if proc.returncode == 0:
        try:
            output = json.loads(stdout)
        except ValueError:
            output = None
        if isinstance(output, dict) and isinstance(output.get("result_data"), dict):
            return "completed", 0, output["result_data"]
    return "failed", proc.returncode, {}


def _now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def run_once(config: Config, script_timeout: float = SCRIPT_TIMEOUT_SECONDS) -> bool:
    """Run one pass. Return False when there was no assignment."""
    assignment = check_in(config)
    if assignment is None:
        return False
    try:
        revision_id = assignment["test_revision_id"]
        script, definition = assignment["script"], assignment["definition"]
    except (KeyError, TypeError):
        raise ProbeError("check-in returned a malformed assignment") from None

    # On Windows the folder can stay locked for a moment after bash exits.
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as test_dir:
        Path(test_dir, "run.sh").write_bytes(_download(config, script))
        Path(test_dir, "test.json").write_bytes(_download(config, definition))
        run_id = str(uuid.uuid4())
        started_at = _now()
        status, result_code, result_data = run_script(test_dir, script_timeout)
        finished_at = _now()

    _post(
        config,
        MEASUREMENTS_PATH,
        {
            "schema_version": 1,
            "id": run_id,
            "probe_id": config.probe_id,
            "test_revision_id": revision_id,
            "started_at": started_at,
            "finished_at": finished_at,
            "status": status,
            "result_code": result_code,
            "result_data": result_data,
            "location": None,
        },
    )
    print(f"run {run_id} of revision {revision_id}: {status}")
    return True


def run_loop(
    config: Config,
    stop: threading.Event,
    idle_wait: float = IDLE_WAIT_SECONDS,
    script_timeout: float = SCRIPT_TIMEOUT_SECONDS,
) -> None:
    """Run passes until stop is set; a pass in progress finishes first."""
    while not stop.is_set():
        if not run_once(config, script_timeout):
            stop.wait(idle_wait)
