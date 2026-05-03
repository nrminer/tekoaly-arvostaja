"""Regression checks for Finnish-language release hardening."""

import os

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")


@pytest.fixture(scope="module")
def base_url() -> str:
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not set")
    return BASE_URL.rstrip("/")


# Module: backend public health endpoint contract
def test_api_health_responds_ok(base_url: str) -> None:
    response = requests.get(f"{base_url}/api/health", timeout=20)
    assert response.status_code == 200

    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "universal-cv-reviewer"
    assert payload["privacy_mode"] == "no_server_storage"
