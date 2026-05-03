"""Security response-header middleware.

Adds a baseline set of hardening HTTP headers to every response so that the
same hardening passes pentest tooling (securityheaders.com, OWASP ZAP
headers check, mozilla observatory).

Headers applied (see per-line rationale):
  • X-Content-Type-Options: nosniff
      — prevents MIME sniffing on JSON/HTML responses.
  • X-Frame-Options: DENY
      — no iframe embedding, blocks clickjacking.
  • Referrer-Policy: no-referrer
      — don't leak the preview URL to Anthropic / Cloudflare.
  • Permissions-Policy: minimal
      — disable sensors, camera, mic, geolocation, etc.
  • Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
      — enforce HTTPS for ~2 years. Only sent on HTTPS requests so local
        `http://localhost:8001` testing is unaffected.
  • X-Download-Options: noopen       (legacy IE safety)
  • X-Permitted-Cross-Domain-Policies: none
      — no Flash/Acrobat cross-domain policy acceptance.
  • Cross-Origin-Opener-Policy: same-origin
      — opener isolation (Spectre hardening).
  • Cross-Origin-Resource-Policy: same-site
      — prevent cross-origin <img>/<script> etc. from embedding our API.
  • Cache-Control: no-store (on /api/review responses only — CV reviews are
        personal data and must NEVER be cached by intermediaries or the
        browser disk cache).
  • Server header: replaced with a neutral string to hide the uvicorn version.
"""
from __future__ import annotations

from starlette.types import ASGIApp, Message, Receive, Scope, Send


_BASE_HEADERS: tuple[tuple[bytes, bytes], ...] = (
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (
        b"permissions-policy",
        b"accelerometer=(), camera=(), geolocation=(), gyroscope=(), "
        b"magnetometer=(), microphone=(), payment=(), usb=()",
    ),
    (b"x-download-options", b"noopen"),
    (b"x-permitted-cross-domain-policies", b"none"),
    (b"cross-origin-opener-policy", b"same-origin"),
    (b"cross-origin-resource-policy", b"same-site"),
    (b"server", b"cv-reviewer"),
    # API endpoints only serve JSON; lock down everything else.
    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
)

_HSTS = (b"strict-transport-security", b"max-age=63072000; includeSubDomains; preload")
_NO_STORE = (b"cache-control", b"no-store, max-age=0")


def _replace_header(headers: list[tuple[bytes, bytes]], name: bytes, value: bytes) -> None:
    lower = name.lower()
    # Remove ALL existing occurrences first so we don't end up with duplicates
    # (uvicorn's internal middleware sets `server: uvicorn` below us).
    headers[:] = [(k, v) for (k, v) in headers if k.lower() != lower]
    headers.append((name, value))


class SecurityHeadersMiddleware:
    """Pure-ASGI middleware so we can overwrite the Server header set by uvicorn."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        is_https = scope.get("scheme") == "https" or any(
            k.lower() == b"x-forwarded-proto" and v.lower() == b"https"
            for k, v in scope.get("headers", [])
        )
        path = scope.get("path", "")
        is_review = path.startswith("/api/review")

        async def _send(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers") or [])
                for k, v in _BASE_HEADERS:
                    _replace_header(headers, k, v)
                if is_https:
                    _replace_header(headers, *_HSTS)
                if is_review:
                    _replace_header(headers, *_NO_STORE)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, _send)
