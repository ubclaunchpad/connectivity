"""Tests for probe configuration validation."""

from __future__ import annotations

import pytest

from probe.__main__ import validate_config

VALID_ENV = {
    "PROBE_ID": "00000000-0000-4000-8000-000000000000",
    "BACKEND_URL": "https://example.org",
    "PROBE_TOKEN": "test-placeholder",
}


def set_env(monkeypatch: pytest.MonkeyPatch, values: dict[str, str]) -> None:
    """Set only the given configuration variables."""
    for name in VALID_ENV:
        monkeypatch.delenv(name, raising=False)
    for name, value in values.items():
        monkeypatch.setenv(name, value)


def test_validate_config_accepts_valid_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    set_env(monkeypatch, VALID_ENV)

    assert validate_config() == []


def test_validate_config_reports_missing_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    set_env(monkeypatch, {})

    assert validate_config() == [
        "PROBE_ID is required",
        "BACKEND_URL is required",
        "PROBE_TOKEN is required",
    ]


@pytest.mark.parametrize(
    ("name", "value", "expected"),
    [
        ("PROBE_ID", "not-a-uuid", "PROBE_ID must be a valid UUID"),
        (
            "BACKEND_URL",
            "ftp://example.org",
            "BACKEND_URL scheme must be http or https",
        ),
        (
            "BACKEND_URL",
            "https://",
            "BACKEND_URL must include a hostname",
        ),
        (
            "BACKEND_URL",
            "https://[invalid",
            "BACKEND_URL must be a valid http(s) URL with a hostname",
        ),
    ],
)
def test_validate_config_reports_malformed_values(
    monkeypatch: pytest.MonkeyPatch,
    name: str,
    value: str,
    expected: str,
) -> None:
    set_env(monkeypatch, {**VALID_ENV, name: value})

    assert validate_config() == [expected]
