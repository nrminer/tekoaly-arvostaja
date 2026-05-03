"""Cloudflare Turnstile token verification.

Turnstile is Cloudflare's privacy-friendly CAPTCHA replacement. It issues a
short-lived token on the frontend (via the Cloudflare-hosted widget) that the
backend verifies by POSTing `{secret, response, [remoteip]}` to
`https://challenges.cloudflare.com/turnstile/v0/siteverify`. Tokens are single
-use and expire after a few minutes.

This module is small on purpose — it exposes one coroutine that returns a
`(success, reason)` tuple so the caller can emit a structured audit event.
No caching, no retries (tokens are single-use; retrying a failed one fails).
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger("security.turnstile")

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
_TIMEOUT_SECONDS = 10.0


def is_configured() -> bool:
    """Return True if the secret is present in the environment."""
    return bool(os.environ.get("TURNSTILE_SECRET_KEY", "").strip())


async def verify_turnstile_token(
    token: Optional[str],
    remote_ip: Optional[str] = None,
) -> tuple[bool, str]:
    """Verify a Turnstile token against Cloudflare's siteverify endpoint.

    Returns `(success, reason)`. `reason` is `'ok'` on success or one of
    Cloudflare's error codes (`missing-input-response`,
    `invalid-input-response`, `timeout-or-duplicate`, ...) / our own
    network-layer codes (`verify_timeout`, `verify_http_<code>`,
    `turnstile_not_configured`) on failure.
    """
    secret = os.environ.get("TURNSTILE_SECRET_KEY", "").strip()
    if not secret:
        logger.warning("TURNSTILE_SECRET_KEY not configured — CAPTCHA verification skipped.")
        return False, "turnstile_not_configured"

    if not token or not token.strip():
        return False, "missing-input-response"

    data: dict[str, str] = {"secret": secret, "response": token}
    if remote_ip and remote_ip != "anon":
        data["remoteip"] = remote_ip

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS) as client:
            resp = await client.post(VERIFY_URL, data=data)
        if resp.status_code != 200:
            logger.warning("Turnstile siteverify HTTP %s: %s", resp.status_code, resp.text[:200])
            return False, f"verify_http_{resp.status_code}"
        result = resp.json()
    except httpx.TimeoutException:
        logger.warning("Turnstile siteverify timed out")
        return False, "verify_timeout"
    except Exception as exc:
        logger.exception("Turnstile siteverify raised")
        return False, f"verify_error:{type(exc).__name__}"

    if result.get("success"):
        return True, "ok"

    error_codes = result.get("error-codes") or ["unknown"]
    return False, ",".join(error_codes)
