# Probe software

Bootstrap starter for the probe.

When run as `python -m probe`, it validates `PROBE_ID`, `BACKEND_URL`, and `PROBE_TOKEN`, then loops: check in, download and hash-check the assigned `run.sh` and `test.json`, run `bash run.sh` (30 s deadline, without `PROBE_TOKEN` in its environment), and upload the result. With no assignment it waits 30 s and checks again. A server or download error stops the probe with a message. `SIGTERM` or Ctrl-C stops it after the current pass. Measurement intervals, retries, caching, and queues come later.

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
