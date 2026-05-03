"""Public release smoke tests (API health + SEO assets + deep-link routing)."""

import os
import xml.etree.ElementTree as ET

import pytest
import requests


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")


@pytest.fixture(scope="module")
def base_url() -> str:
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL is not set")
    return BASE_URL.rstrip("/")


# Module: backend availability
def test_api_health_public(base_url: str):
    response = requests.get(f"{base_url}/api/health", timeout=20)
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "universal-cv-reviewer"
    assert data["privacy_mode"] == "no_server_storage"


# Module: static SEO/public assets
def test_manifest_is_valid_json(base_url: str):
    response = requests.get(f"{base_url}/manifest.json", timeout=20)
    assert response.status_code == 200

    data = response.json()
    assert data["start_url"] == "/"
    assert data["display"] in {"standalone", "minimal-ui", "browser"}
    assert isinstance(data.get("icons"), list)
    assert len(data["icons"]) > 0


# Module: sitemap + key route discoverability
def test_sitemap_includes_home_and_interview(base_url: str):
    response = requests.get(f"{base_url}/sitemap.xml", timeout=20)
    assert response.status_code == 200

    root = ET.fromstring(response.text)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    locs = [node.text for node in root.findall("sm:url/sm:loc", ns)]

    assert f"{base_url}/" in locs
    assert f"{base_url}/interview" in locs


# Module: SPA route handling on production host
def test_interview_deep_link_loads(base_url: str):
    response = requests.get(f"{base_url}/interview", timeout=20)
    assert response.status_code == 200
    assert "<div id=\"root\"></div>" in response.text
