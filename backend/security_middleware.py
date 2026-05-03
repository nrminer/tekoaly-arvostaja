"""Security-hardening middleware.

Two layers sit in front of every FastAPI request:

1. `BodySizeLimitMiddleware` — gates the request envelope *before* FastAPI reads
   the multipart body into memory. This prevents attackers from exhausting RAM
   by streaming a huge body that would only be rejected after parsing. Two
   checks:
     a. `Content-Length` header > `max_request_body_bytes` → **HTTP 413** with
        a JSON body. No further processing.
     b. If `Content-Length` is missing, we wrap the ASGI `receive` callable so
        that once accumulated chunks exceed the cap we short-circuit with 413
        (again, without letting FastAPI parse anything).
   Oversized events are written to the security audit log.

2. `VPNChallengeMiddleware` — checks the effective client IP (derived with
   `security_config.extract_client_ip`, which only honours `X-Forwarded-For`
   when the peer is in `trusted_proxy_cidrs`) against
   `security_ip_intel.classify()`. If the IP is a datacenter or Tor exit and
   NOT in the allowlist, we return **HTTP 403** with a bilingual soft-challenge
   message (Q2=b). `GET /api/health`, `GET /api/security/*`, `OPTIONS *`, and
   `GET /api/options` are always allowed — the block applies only to the
   mutating endpoint (`POST /api/review`). Every hit — blocked or flagged — is
   audit-logged.

Both middlewares are registered in `server.py` via `app.add_middleware(...)`.
"""
from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from security_audit import log_event
from security_config import extract_client_ip, get_limits
from security_ip_intel import classify

logger = logging.getLogger("security.middleware")


# ---------------------------------------------------------------------------
# 1. Body-size gate
# ---------------------------------------------------------------------------


class BodySizeLimitMiddleware:
    """Raw-ASGI middleware (not BaseHTTPMiddleware) so we can reject *before*
    FastAPI touches the request body."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limits = get_limits()
        max_bytes = limits.max_request_body_bytes

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        content_length = headers.get("content-length")

        # Fast path: trust a well-formed CL header if present.
        if content_length is not None:
            try:
                declared = int(content_length)
            except ValueError:
                declared = -1
            if declared > max_bytes:
                await _write_413(send, max_bytes, scope, declared)
                return

        # Slow path: wrap receive so we enforce the cap while streaming.
        received_bytes = 0
        cap = max_bytes

        async def _capped_receive() -> Message:
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                body = message.get("body", b"")
                if body:
                    received_bytes += len(body)
                    if received_bytes > cap:
                        # Signal a payload-too-large by raising — the outer
                        # handler catches this and emits the 413.
                        raise _PayloadTooLarge(received_bytes)
            return message

        try:
            await self.app(scope, _capped_receive, send)
        except _PayloadTooLarge as exc:
            # The response may already be partially flushed; safest to try 413
            # and tolerate the send failing (client may have closed).
            try:
                await _write_413(send, cap, scope, exc.received)
            except Exception:
                pass


class _PayloadTooLarge(Exception):
    def __init__(self, received: int) -> None:
        super().__init__(received)
        self.received = received


async def _write_413(send: Send, max_bytes: int, scope: Scope, declared: int) -> None:
    peer = (scope.get("client") or ("anon",))[0]
    method = scope.get("method", "")
    path = scope.get("path", "")
    body = (
        f'{{"detail":"Request body too large (limit {max_bytes} bytes).",'
        f'"max_bytes":{max_bytes}}}'
    ).encode("utf-8")
    log_event(
        "oversized_body_rejected",
        peer_ip=peer,
        path=path,
        method=method,
        status_code=413,
        max_bytes=max_bytes,
        declared_bytes=declared,
    )
    await send({
        "type": "http.response.start",
        "status": 413,
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode()),
        ],
    })
    await send({"type": "http.response.body", "body": body, "more_body": False})


# ---------------------------------------------------------------------------
# 2. VPN / proxy / Tor soft-challenge
# ---------------------------------------------------------------------------


# Paths that must NEVER be blocked (health/monitoring/options always allowed).
_ALWAYS_ALLOW_PATHS = {
    "/api/health",
    "/api/",
    "/api/options",
    "/api/security/limits",
    "/api/security/audit/health",
}
# Only these paths are subject to the VPN block. Everything else (GETs, etc.)
# is audit-logged when suspicious but allowed through.
_BLOCK_ON_PATHS = {"/api/review"}


class VPNChallengeMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Any]],
    ):
        path = request.url.path
        method = request.method.upper()

        if method == "OPTIONS" or path in _ALWAYS_ALLOW_PATHS:
            return await call_next(request)

        peer = (request.client.host if request.client else "") or "anon"
        client_ip = extract_client_ip(request)
        trusted_peer = client_ip != peer  # only ever differs when peer is trusted

        # Classify the client-facing IP (not the trusted proxy).
        verdict = classify(client_ip)

        if verdict.should_block and path in _BLOCK_ON_PATHS and method != "GET":
            log_event(
                "vpn_or_proxy_blocked",
                peer_ip=peer,
                client_ip=client_ip,
                trusted_peer=trusted_peer,
                path=path,
                method=method,
                status_code=403,
                source=verdict.source,
            )
            return JSONResponse(
                status_code=403,
                content={
                    "detail": (
                        "VPN tai välityspalvelin havaittu. Jotta voimme varmistaa tasapuolisen "
                        "käytön ja estää väärinkäyttöä, poista VPN käytöstä ja yritä uudelleen. "
                        "/ A VPN or proxy was detected. To ensure fair access and prevent abuse, "
                        "please disable your VPN and try again."
                    ),
                    "reason": verdict.source,
                    "help": "If you believe this is incorrect, please try again without a VPN or proxy.",
                },
            )

        if verdict.should_block:
            # Flagged but not blocked (e.g. GET on /api/options from Tor exit).
            log_event(
                "vpn_or_proxy_flagged",
                peer_ip=peer,
                client_ip=client_ip,
                trusted_peer=trusted_peer,
                path=path,
                method=method,
                source=verdict.source,
            )

        return await call_next(request)
