"""Runtime contract checks for vibe-cleanup config endpoints.

Module scope: public backend endpoints used by the frontend configuration flow.
"""

import os

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")


@pytest.fixture(scope="module")
def base_url() -> str:
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not set")
    return BASE_URL.rstrip("/")


def test_health_endpoint_contract(base_url: str) -> None:
    response = requests.get(f"{base_url}/api/health", timeout=20)
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "universal-cv-reviewer"
    assert payload["privacy_mode"] == "no_server_storage"


def test_app_config_endpoint_contract(base_url: str) -> None:
    response = requests.get(f"{base_url}/api/app-config", timeout=20)
    assert response.status_code == 200

    payload = response.json()
    assert payload["cvMinChars"] == 120
    assert payload["languageMode"] == "finnish-only"
    assert payload["defaultLanguage"] == "fi"
    assert payload["interviewTimerSecondsDefault"] == 90
    assert payload["interviewTimerSecondsOptions"] == [60, 90, 120]
