"""Turnstile verification unit tests.

These tests mock httpx so the Cloudflare siteverify endpoint is never actually
called — we validate the local wiring (missing secret, missing token, success
bool routing, error-code concatenation).
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

_BACKEND_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(_BACKEND_ROOT))

import security_turnstile as st  # noqa: E402


def _run(coro):
    return asyncio.run(coro)


def test_not_configured_returns_false(monkeypatch):
    monkeypatch.delenv("TURNSTILE_SECRET_KEY", raising=False)
    ok, reason = _run(st.verify_turnstile_token("any-token"))
    assert ok is False
    assert reason == "turnstile_not_configured"
    assert st.is_configured() is False


def test_missing_token_returns_false(monkeypatch):
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "test-secret")
    for empty in (None, "", "   "):
        ok, reason = _run(st.verify_turnstile_token(empty))
        assert ok is False
        assert reason == "missing-input-response", empty


def test_successful_verification(monkeypatch):
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "test-secret")
    fake_resp = type("R", (), {"status_code": 200, "json": lambda self: {"success": True}})()

    async def fake_post(self, url, data=None, **kwargs):
        assert url == st.VERIFY_URL
        assert data["secret"] == "test-secret"
        assert data["response"] == "good-token"
        return fake_resp

    with patch("httpx.AsyncClient.post", new=fake_post):
        ok, reason = _run(st.verify_turnstile_token("good-token", remote_ip="1.2.3.4"))
    assert ok is True
    assert reason == "ok"


def test_cloudflare_reports_failure(monkeypatch):
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "test-secret")
    fake_resp = type(
        "R",
        (),
        {
            "status_code": 200,
            "json": lambda self: {
                "success": False,
                "error-codes": ["invalid-input-response", "timeout-or-duplicate"],
            },
        },
    )()

    async def fake_post(self, url, data=None, **kwargs):
        return fake_resp

    with patch("httpx.AsyncClient.post", new=fake_post):
        ok, reason = _run(st.verify_turnstile_token("bad-token"))
    assert ok is False
    assert reason == "invalid-input-response,timeout-or-duplicate"


def test_http_non_200_returns_false(monkeypatch):
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "test-secret")
    fake_resp = type("R", (), {"status_code": 500, "text": "boom", "json": lambda self: {}})()

    async def fake_post(self, url, data=None, **kwargs):
        return fake_resp

    with patch("httpx.AsyncClient.post", new=fake_post):
        ok, reason = _run(st.verify_turnstile_token("x"))
    assert ok is False
    assert reason == "verify_http_500"


def test_network_timeout_returns_false(monkeypatch):
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "test-secret")
    import httpx

    async def fake_post(self, url, data=None, **kwargs):
        raise httpx.TimeoutException("slow")

    with patch("httpx.AsyncClient.post", new=fake_post):
        ok, reason = _run(st.verify_turnstile_token("x"))
    assert ok is False
    assert reason == "verify_timeout"


def test_is_configured_reads_env(monkeypatch):
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "abc")
    assert st.is_configured() is True
    monkeypatch.setenv("TURNSTILE_SECRET_KEY", "   ")
    assert st.is_configured() is False
