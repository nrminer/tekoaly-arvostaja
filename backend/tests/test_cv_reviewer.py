"""Backend tests for the Universal CV Review Assistant."""
import io
import os
import time

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://audio-diarizer-1.preview.emergentagent.com").rstrip("/")
LOCAL = "http://localhost:8001"

VALID_CV_TEXT = (
    "John Doe\nSenior Software Engineer\nExperienced backend engineer with 8+ years building "
    "distributed systems in Python, Go, and TypeScript. Led platform team at Acme delivering "
    "microservices on AWS, reducing latency by 35%. Mentored 6 engineers, ran code reviews, "
    "owned on-call rotations. Education: MSc Computer Science, University of Helsinki, 2014. "
    "Skills: Python, FastAPI, Kubernetes, PostgreSQL, Redis, GitHub Actions, Terraform. "
    "Languages: Finnish (native), English (C2), Swedish (B2). References available on request. "
) * 2


# --- /api/health ---
def test_health():
    r = requests.get(f"{BASE}/api/health", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["status"] == "ok"
    assert d["service"] == "universal-cv-reviewer"
    assert d["privacy_mode"] == "no_server_storage"
    assert d["model"] == "adaptive-claude"


# --- /api/options ---
def test_options():
    r = requests.get(f"{BASE}/api/options", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert isinstance(d["markets"], list) and len(d["markets"]) == 4
    # Finland must be the first option (default in the UI).
    assert d["markets"][0]["code"] == "Finland"
    for m in d["markets"]:
        assert "code" in m and "label" in m
    assert isinstance(d["seniority_levels"], list) and len(d["seniority_levels"]) == 6


# --- Validation: short cv_text, invalid market, invalid seniority ---
def test_review_short_text_rejected():
    r = requests.post(f"{BASE}/api/review", data={"cv_text": "too short", "market": "Global"}, timeout=20)
    assert r.status_code == 400


def test_review_invalid_market():
    r = requests.post(
        f"{BASE}/api/review",
        data={"cv_text": VALID_CV_TEXT, "market": "Mars"},
        timeout=20,
    )
    assert r.status_code == 400


def test_review_invalid_seniority():
    r = requests.post(
        f"{BASE}/api/review",
        data={"cv_text": VALID_CV_TEXT, "market": "Global", "seniority": "MasterOfUniverse"},
        timeout=20,
    )
    assert r.status_code == 400


# --- Input-size caps: all return 413 ---
def test_review_job_title_too_long():
    r = requests.post(
        f"{BASE}/api/review",
        data={"cv_text": VALID_CV_TEXT, "market": "Global", "job_title": "x" * 501},
        timeout=20,
    )
    assert r.status_code == 413


def test_review_industry_too_long():
    r = requests.post(
        f"{BASE}/api/review",
        data={"cv_text": VALID_CV_TEXT, "market": "Global", "industry": "x" * 501},
        timeout=20,
    )
    assert r.status_code == 413


def test_review_job_description_too_long():
    r = requests.post(
        f"{BASE}/api/review",
        data={"cv_text": VALID_CV_TEXT, "market": "Global", "job_description": "x" * 10001},
        timeout=20,
    )
    assert r.status_code == 413


def test_review_specific_concerns_too_long():
    r = requests.post(
        f"{BASE}/api/review",
        data={"cv_text": VALID_CV_TEXT, "market": "Global", "specific_concerns": "x" * 5001},
        timeout=20,
    )
    assert r.status_code == 413


def test_review_cv_text_too_long():
    r = requests.post(
        f"{BASE}/api/review",
        data={"cv_text": "x" * 100_001, "market": "Global"},
        timeout=30,
    )
    assert r.status_code == 413


# --- File handling ---
@pytest.fixture(scope="module")
def _reset_rate_limit_for_file_tests():
    """File-handling tests come after several POSTs that may have consumed the 5/min
    rate-limit budget on the same replica. Restart backend once before this group."""
    os.system("sudo supervisorctl restart backend >/dev/null 2>&1")
    time.sleep(6)
    yield


def test_review_unsupported_extension(_reset_rate_limit_for_file_tests):
    files = {"file": ("cv.txt", b"hello world this is just text", "text/plain")}
    r = requests.post(
        f"{BASE}/api/review",
        data={"market": "Global"},
        files=files,
        timeout=20,
    )
    assert r.status_code == 400


def test_review_empty_pdf(_reset_rate_limit_for_file_tests):
    files = {"file": ("cv.pdf", b"", "application/pdf")}
    r = requests.post(
        f"{BASE}/api/review",
        data={"market": "Global"},
        files=files,
        timeout=20,
    )
    assert r.status_code == 400


def test_review_oversized_file(_reset_rate_limit_for_file_tests):
    big = io.BytesIO(b"\x25PDF-1.4\n" + b"a" * (10 * 1024 * 1024 + 100))
    files = {"file": ("big.pdf", big.getvalue(), "application/pdf")}
    r = requests.post(
        f"{BASE}/api/review",
        data={"market": "Global"},
        files=files,
        timeout=60,
    )
    assert r.status_code == 400


# --- History endpoints disabled (410) ---
def test_history_endpoints_disabled():
    r1 = requests.get(f"{BASE}/api/reviews", timeout=20)
    assert r1.status_code == 410
    r2 = requests.get(f"{BASE}/api/reviews/abc-123", timeout=20)
    assert r2.status_code == 410
    r3 = requests.delete(f"{BASE}/api/reviews/abc-123", timeout=20)
    assert r3.status_code == 410


# --- LLM call -> bilingual 503 (budget exhausted / bad gateway) ---
def test_review_llm_503_bilingual_cold_and_warm():
    """First call (cold cache) should return bilingual 503 within ~30s.
    Second call (warm cache) should short-circuit in <500ms."""
    os.system("sudo supervisorctl restart backend >/dev/null 2>&1")
    time.sleep(6)
    # Cold cache: real LLM dispatch via to_thread + 20s timeout per attempt.
    t0 = time.time()
    r = requests.post(
        f"{LOCAL}/api/review",
        data={
            "cv_text": VALID_CV_TEXT,
            "market": "Nordics",
            "seniority": "Senior",
            "language": "fi",
        },
        timeout=120,
    )
    cold_elapsed = time.time() - t0
    assert r.status_code == 503, f"cold: got {r.status_code}: {r.text[:300]}"
    detail = r.json().get("detail", "")
    assert "AI-palvelun" in detail, f"missing FI substring in: {detail}"
    assert "AI service" in detail, f"missing EN substring in: {detail}"
    # Cold path must complete well under preview ingress 60s (per fix in cv_service).
    assert cold_elapsed < 60, f"cold path too slow: {cold_elapsed}s"

    # Warm cache: budget cooldown cache should make the next call short-circuit.
    t1 = time.time()
    r2 = requests.post(
        f"{LOCAL}/api/review",
        data={
            "cv_text": VALID_CV_TEXT,
            "market": "Nordics",
            "seniority": "Senior",
            "language": "fi",
        },
        timeout=20,
    )
    warm_elapsed = time.time() - t1
    assert r2.status_code == 503, f"warm: got {r2.status_code}: {r2.text[:300]}"
    detail2 = r2.json().get("detail", "")
    assert "AI-palvelun" in detail2 and "AI service" in detail2
    # Warm path should be very fast (no LLM round trip).
    assert warm_elapsed < 2.0, f"warm path too slow: {warm_elapsed}s"
    print(f"[test] cold={cold_elapsed:.2f}s warm={warm_elapsed:.3f}s")


# --- Rate limiting: 6th request within 60s -> 429 with bilingual JSON detail and Retry-After ---
def test_review_rate_limit_429():
    # Use LOCAL backend (preview URL load-balances across replicas, so each replica's in-memory
    # limiter sees only some of the requests and 429 may not trigger reliably).
    os.system("sudo supervisorctl restart backend >/dev/null 2>&1")
    time.sleep(6)
    statuses = []
    last_resp = None
    for i in range(6):
        last_resp = requests.post(
            f"{LOCAL}/api/review",
            data={"cv_text": "too short", "market": "Global"},
            timeout=20,
        )
        statuses.append(last_resp.status_code)
    assert statuses[-1] == 429, f"expected 6th to be 429, got {statuses}"
    body = last_resp.json()
    assert "detail" in body and "retry_after_seconds" in body
    assert "Liikaa" in body["detail"] or "Too many" in body["detail"]
    assert last_resp.headers.get("Retry-After") is not None
