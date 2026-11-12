FROM python:3.13-slim AS python-base

FROM python-base AS builder

COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /bin/

ENV UV_PYTHON_DOWNLOADS=0

WORKDIR /app

COPY pyproject.toml uv.lock ./
COPY src ./src
RUN uv sync --locked --no-dev --no-editable

FROM python-base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install --no-install-recommends -y bash iputils-ping \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv

CMD ["/app/.venv/bin/python", "-m", "probe"]
