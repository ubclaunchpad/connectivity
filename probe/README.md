# Probe software

Bootstrap starter for the probe.

The current implementation validates `PROBE_ID`, `BACKEND_URL`, and `PROBE_TOKEN` when run as `python -m probe`, prints `config valid`, and exits. Upcoming tickets cover polling, SQLite storage, test execution, and testing.

## Configuration

Copy `.env.example` to `.env` for local values and keep `.env` out of version control.

`PROBE_ID` is the UUID that identifies the probe. `BACKEND_URL` is an `http` or `https` URL with a hostname. `PROBE_TOKEN` is a non-empty probe token.

## Local check

Install uv by following the [official uv installation guide](https://docs.astral.sh/uv/getting-started/installation/), then run this command from `probe/`.

```bash
PROBE_ID=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb \
BACKEND_URL=https://example.org \
PROBE_TOKEN=dev-placeholder \
uv run --locked python -m probe
```

## Tests

Unit tests live in `tests/` and run with pytest under Python 3.13. Run this command from `probe/`.

```bash
uv run --locked --extra test python -m pytest
```

`uv run` syncs the environment before running, so no separate `uv sync` call is needed. `uv` reads `.python-version` and installs Python 3.13 when needed. Add new Python dependencies with `uv add` and commit `pyproject.toml` and `uv.lock` together, and commit `.python-version` whenever it changes.

## Container

The image builds dependencies from the lockfile into `/app/.venv` and runs the probe with that interpreter. The final stage does not include `uv` or the test extra.

```bash
docker compose --env-file .env.example config --quiet
docker compose up --build
```

The named `revision-cache` volume is mounted at `/var/lib/probe` for future revision data.
