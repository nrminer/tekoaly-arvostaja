"""Security-hardening guard tests.

These tests are *unit-level* where possible (no external LLM) and validate:
1. `SecurityLimits` is frozen — direct mutation raises.
2. Fingerprint drift is detected.
3. `extract_client_ip` honours X-Forwarded-For only from trusted peers.
4. `security_ip_intel.classify()` correctly flags Tor/datacenter and allowlists
   Apple Private Relay / Cloudflare WARP.
5. Oversized request body yields **HTTP 413** before the handler runs.
6. Spoofed XFF from an untrusted peer does NOT reset the rate-limit bucket.
7. `/api/security/limits` exposes the view + fingerprint, `mutable: false`.
8. `/api/security/audit/health` returns a rollup shape.

Run: `cd /app/backend && python -m pytest tests/test_security_hardening.py -v`
"""
from __future__ import annotations

import asyncio
import dataclasses
import os
import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

# Make the backend package importable.
_BACKEND_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(_BACKEND_ROOT))

from security_audit import clear_buffer_for_tests, rollup  # noqa: E402
from security_config import (  # noqa: E402
    SecurityConfigLockedError,
    assert_unchanged,
    extract_client_ip,
    get_fingerprint,
    get_limits,
)
from security_ip_intel import classify, is_blocked  # noqa: E402


# ---------------------------------------------------------------------------
# 1. Frozen config
# ---------------------------------------------------------------------------


def test_limits_are_frozen_dataclass():
    limits = get_limits()
    assert dataclasses.is_dataclass(limits)
    # Direct mutation must raise FrozenInstanceError.
    with pytest.raises(dataclasses.FrozenInstanceError):
        limits.max_cv_text_input = 99  # type: ignore[misc]
    # slots=True means no __dict__ to sneak attrs into.
    with pytest.raises((AttributeError, TypeError, dataclasses.FrozenInstanceError)):
        limits.extra_field = "haha"  # type: ignore[attr-defined]


def test_fingerprint_stable_and_unchanged():
    fp = get_fingerprint()
    assert len(fp) == 64  # sha256 hex
    # Must not raise under normal conditions.
    assert_unchanged()


def test_fingerprint_drift_detected(monkeypatch):
    from security_config import _LIMITS  # type: ignore

    # Forcefully bypass frozen protection to simulate tampering.
    object.__setattr__(_LIMITS, "max_cv_text_input", _LIMITS.max_cv_text_input + 1)
    try:
        with pytest.raises(SecurityConfigLockedError):
            assert_unchanged()
    finally:
        # Restore so subsequent tests see a clean state.
        object.__setattr__(_LIMITS, "max_cv_text_input", _LIMITS.max_cv_text_input - 1)


# ---------------------------------------------------------------------------
# 2. Trusted-proxy client-IP extraction
# ---------------------------------------------------------------------------


class _FakeReq:
    def __init__(self, peer: str, xff: str | None = None):
        class _C:
            host = peer
        self.client = _C()
        self.headers = {}
        if xff is not None:
            self.headers["x-forwarded-for"] = xff


def test_extract_client_ip_ignores_xff_from_untrusted_peer():
    # 8.8.8.8 is a public peer — XFF must be ignored (anti-spoof).
    req = _FakeReq(peer="8.8.8.8", xff="1.2.3.4, 9.9.9.9")
    assert extract_client_ip(req) == "8.8.8.8"


def test_extract_client_ip_honours_xff_from_trusted_peer():
    # 127.0.0.1 is trusted by default config; XFF leftmost is the client.
    req = _FakeReq(peer="127.0.0.1", xff="203.0.113.42, 10.0.0.1")
    assert extract_client_ip(req) == "203.0.113.42"


def test_extract_client_ip_missing_xff_falls_back_to_peer():
    req = _FakeReq(peer="127.0.0.1")
    assert extract_client_ip(req) == "127.0.0.1"


def test_extract_client_ip_malformed_xff_falls_back_to_peer():
    req = _FakeReq(peer="127.0.0.1", xff="not-an-ip")
    assert extract_client_ip(req) == "127.0.0.1"


# ---------------------------------------------------------------------------
# 3. VPN / Tor / allowlist classification
# ---------------------------------------------------------------------------


def test_datacenter_ip_is_flagged_as_blocked():
    # DigitalOcean NYC range from the bundled list.
    v = classify("104.236.1.1")
    assert v.is_datacenter is True
    assert v.allowlisted is False
    assert v.should_block is True
    assert is_blocked("104.236.1.1") is True


def test_tor_exit_ip_is_flagged_as_blocked():
    v = classify("185.220.101.1")
    assert v.is_tor_exit is True
    assert v.should_block is True


def test_apple_private_relay_is_allowlisted_even_if_looks_like_dc():
    # 104.28.0.0/16 is in our allowlist (Cloudflare-fronted Apple Private Relay).
    v = classify("104.28.5.5")
    assert v.allowlisted is True
    assert v.should_block is False


def test_private_ips_never_blocked():
    for ip in ("10.0.0.1", "172.16.0.1", "192.168.1.1", "127.0.0.1"):
        v = classify(ip)
        assert v.allowlisted is True, ip
        assert v.should_block is False


def test_clean_residential_ip_is_not_blocked():
    # 8.8.8.8 (Google DNS) — not in any list.
    v = classify("8.8.8.8")
    assert v.allowlisted is False
    assert v.is_datacenter is False
    assert v.is_tor_exit is False
    assert v.should_block is False


def test_malformed_ip_does_not_crash():
    v = classify("not-an-ip")
    assert v.should_block is False
    assert v.source == "malformed"


# ---------------------------------------------------------------------------
# 4. Oversized body rejected pre-handler (413)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client():
    # Build TestClient against the hardened app. Turnstile is disabled for
    # these tests by unsetting the secret AFTER import (server.py calls
    # load_dotenv() during import, which re-populates the env from .env). We
    # validate the non-captcha code paths here; Turnstile itself is covered in
    # tests/test_turnstile.py.
    from server import app  # noqa: F401 (load_dotenv runs)
    os.environ.pop("TURNSTILE_SECRET_KEY", None)
    clear_buffer_for_tests()
    return TestClient(app)


def test_oversized_body_declared_in_header_rejected_413(client):
    limits = get_limits()
    # Send a CL header that exceeds the limit. We don't actually have to stream
    # the bytes — the middleware rejects on the declared CL alone.
    over = limits.max_request_body_bytes + 10
    r = client.post(
        "/api/review",
        headers={"content-length": str(over)},
        # The real body is a dummy; the CL-header gate trips first.
        content=b"x" * 10,
    )
    assert r.status_code == 413, (r.status_code, r.text[:200])
    body = r.json()
    assert "max_bytes" in body


def test_oversized_field_rejected_413(client):
    # cv_text well beyond max_cv_text_input
    limits = get_limits()
    over = "x" * (limits.max_cv_text_input + 1)
    r = client.post("/api/review", data={"cv_text": over, "market": "Global"})
    assert r.status_code == 413


# ---------------------------------------------------------------------------
# 5. /api/security/limits endpoint
# ---------------------------------------------------------------------------


def test_security_limits_endpoint_shape(client):
    r = client.get("/api/security/limits")
    assert r.status_code == 200
    body = r.json()
    assert body["mutable"] is False
    assert body["fingerprint"] == get_fingerprint()
    assert "max_cv_text_input" in body["limits"]
    assert "max_request_body_bytes" in body["limits"]
    assert "trusted_proxy_cidrs" in body["limits"]
    assert body["ip_intel"]["datacenter_cidrs_loaded"] > 0


def test_security_audit_health_endpoint_shape(client):
    # Force at least one event so the rollup is non-empty.
    client.post("/api/review", data={"cv_text": "too short", "market": "Global"})
    r = client.get("/api/security/audit/health")
    assert r.status_code == 200
    body = r.json()
    assert body["fingerprint"] == get_fingerprint()
    assert "rollup" in body
    assert "by_event" in body["rollup"]
    assert body["rollup"]["total_events"] >= 1


# ---------------------------------------------------------------------------
# 6. XFF spoof does NOT reset rate-limit bucket (integration)
# ---------------------------------------------------------------------------
# We verify this at the IP-resolution layer: every spoofed XFF from the same
# untrusted peer resolves to the same peer IP, so slowapi buckets all of them
# under one key. A fresh peer should get a new bucket.


def test_spoofed_xff_all_resolve_to_same_peer():
    peers_seen = set()
    for fake in ("1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4"):
        req = _FakeReq(peer="5.6.7.8", xff=fake)
        peers_seen.add(extract_client_ip(req))
    assert peers_seen == {"5.6.7.8"}, peers_seen


# ---------------------------------------------------------------------------
# 7. No setter API exists
# ---------------------------------------------------------------------------


def test_security_config_exposes_no_setter():
    import security_config as sc
    # There must be no public function that mutates limits.
    public_names = [n for n in dir(sc) if not n.startswith("_")]
    for n in public_names:
        assert not any(
            bad in n.lower()
            for bad in ("set_", "update_", "override", "reset_", "reload", "mutate")
        ), f"suspicious mutator-like symbol exported: {n}"
    assert sc._HAS_SETTER_API is False
