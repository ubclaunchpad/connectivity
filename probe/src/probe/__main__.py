"""Probe entry point: validate configuration, then run the probe loop."""

from __future__ import annotations

import os
import signal
import sys
import threading
import uuid
from urllib.parse import urlsplit

from probe.runner import Config, ProbeError, run_loop


def validate_config() -> list[str]:
    """Return configuration errors without exposing secret values."""
    errors: list[str] = []

    probe_id = os.environ.get("PROBE_ID", "").strip()
    if not probe_id:
        errors.append("PROBE_ID is required")
    else:
        try:
            uuid.UUID(probe_id)
        except ValueError:
            errors.append("PROBE_ID must be a valid UUID")

    backend_url = os.environ.get("BACKEND_URL", "").strip()
    if not backend_url:
        errors.append("BACKEND_URL is required")
    else:
        try:
            parsed = urlsplit(backend_url)
            hostname = parsed.hostname
        except ValueError:
            errors.append("BACKEND_URL must be a valid http(s) URL with a hostname")
        else:
            if parsed.scheme not in {"http", "https"}:
                errors.append("BACKEND_URL scheme must be http or https")
            elif not hostname:
                errors.append("BACKEND_URL must include a hostname")

    probe_token = os.environ.get("PROBE_TOKEN", "")
    if not probe_token.strip():
        errors.append("PROBE_TOKEN is required")

    return errors


def main() -> int:
    errors = validate_config()
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    try:
        run_loop(Config.from_env(), stop)
    except ProbeError as error:
        print(f"probe stopped: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
