# Probe software

Bootstrap starter for the probe.

The current implementation validates `PROBE_ID`, `BACKEND_URL`, and `PROBE_TOKEN` when run as `python -m probe`, prints `config valid`, and exits. Upcoming tickets cover polling, SQLite storage, test execution, and testing.

## Configuration

Copy `.env.example` to `.env` for local values and keep `.env` out of version control.

`PROBE_ID` is the UUID that identifies the probe. `BACKEND_URL` is an `http` or `https` URL with a hostname. `PROBE_TOKEN` is a non-empty probe token.

## Local check

```bash
PROBE_ID=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb \
BACKEND_URL=https://example.org \
PROBE_TOKEN=dev-placeholder \
PYTHONPATH=src python3 -m probe
```

## Tests

Unit tests live in `tests/` and run with pytest under Python 3.13. Run these commands from `probe/` and activate a virtualenv before installing the test extra:

```bash
python3.13 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[test]"
python -m pytest
```

## Container

```bash
docker compose --env-file .env.example config --quiet
docker compose up --build
```

The named `revision-cache` volume is mounted at `/var/lib/probe` for future revision data.
