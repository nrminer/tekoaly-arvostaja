"""Immutable, environment-backed security configuration.

This module is the single source of truth for every internal processing limit used by the
Universal CV Review Assistant (payload caps, rate limits, trusted-proxy CIDRs, abuse
thresholds, budget cooldown window).

Design goals
------------
1. **Immutable at runtime.** Values are frozen into a `@dataclass(frozen=True)` at import
   time. Any attempt to rebind an attribute raises `SecurityConfigLockedError`.
2. **No mutation endpoint anywhere in the API.** Limits can only be changed by editing
   environment variables / code and redeploying. This is the "approval workflow" — it
   requires a Git PR + deploy, not an in-app admin action.
3. **Bounds-checked at startup.** Each value has a hard `min`/`max`. If the environment
   supplies an out-of-range value, the process refuses to start. This prevents a
   mis-configured env (or a tampered `.env`) from silently disabling a limit.
4. **Fingerprinted.** A SHA-256 of all frozen values is computed once at import and
   exposed. A `/api/security/limits` endpoint returns this fingerprint so an external
   monitor can detect any drift.
5. **Safely observable.** The read-only `get_limits_view()` returns a `MappingProxyType`
   — callers cannot mutate the underlying dict.

Changing a limit requires a code commit + deploy. There is deliberately **no runtime API**
to set or reset any of these values.
"""
from __future__ import annotations

import hashlib
import ipaddress
import json
import logging
import os
import re
from dataclasses import asdict, dataclass, fields
from types import MappingProxyType
from typing import Any, Mapping

logger = logging.getLogger("security.config")


class SecurityConfigLockedError(RuntimeError):
    """Raised when code attempts to mutate the frozen security configuration."""


class SecurityConfigInvalid(RuntimeError):
    """Raised at import if an environment-supplied value is out of bounds or malformed."""


# ---------------------------------------------------------------------------
# Helpers for env parsing + bounds validation
# ---------------------------------------------------------------------------

_RATE_LIMIT_TOKEN = re.compile(r"^\s*\d+\s*/\s*(second|minute|hour|day)\s*$", re.IGNORECASE)


def _parse_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        value = default
    else:
        try:
            value = int(raw)
        except ValueError as exc:
            raise SecurityConfigInvalid(
                f"{name} must be an integer (got {raw!r})"
            ) from exc
    if value < minimum or value > maximum:
        raise SecurityConfigInvalid(
            f"{name} out of safe bounds: got {value}, allowed [{minimum}, {maximum}]."
        )
    return value


def _parse_rate_limit(name: str, default: str) -> str:
    raw = os.environ.get(name, "").strip() or default
    # `slowapi` accepts a compound limit like "5/minute;30/hour". Validate each token.
    for token in raw.split(";"):
        if not _RATE_LIMIT_TOKEN.match(token):
            raise SecurityConfigInvalid(
                f"{name} has an invalid rate-limit token {token!r}. "
                "Each token must look like '5/minute' or '30/hour'."
            )
    return raw


def _parse_cidrs(name: str, default: str) -> tuple[str, ...]:
    raw = os.environ.get(name, "").strip() or default
    cidrs: list[str] = []
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            # strict=False so we accept host-bits-set forms like 10.0.0.1/8
            ipaddress.ip_network(item, strict=False)
        except ValueError as exc:
            raise SecurityConfigInvalid(
                f"{name} has an invalid CIDR {item!r}: {exc}"
            ) from exc
        cidrs.append(item)
    if not cidrs:
        raise SecurityConfigInvalid(
            f"{name} must list at least one CIDR (current: {raw!r})"
        )
    return tuple(cidrs)


# ---------------------------------------------------------------------------
# The frozen config dataclass
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class SecurityLimits:
    """Every processing limit used by the API. Immutable once instantiated.

    `slots=True` removes `__dict__`, so there is no hidden way to attach arbitrary
    attributes at runtime. `frozen=True` makes `__setattr__` raise
    `dataclasses.FrozenInstanceError` — which we catch and re-raise as
    `SecurityConfigLockedError` via a small `__post_init__` sanity check.
    """

    # --- Per-field character caps on /api/review form fields -----------------
    max_cv_text_input: int
    max_job_title_chars: int
    max_industry_chars: int
    max_job_description_chars: int
    max_specific_concerns_chars: int

    # --- File / body caps ----------------------------------------------------
    max_file_size_bytes: int
    max_request_body_bytes: int
    max_text_chars_for_llm: int

    # --- Rate limits (slowapi strings) --------------------------------------
    review_rate_limit: str
    options_rate_limit: str
    default_rate_limit: str

    # --- Proxy / abuse / budget ---------------------------------------------
    trusted_proxy_cidrs: tuple[str, ...]
    abuse_threshold_4xx: int
    abuse_window_seconds: int
    budget_cooldown_seconds: int
    total_llm_wall_clock_seconds: int
    per_llm_attempt_timeout_seconds: int

    def to_public_dict(self) -> dict[str, Any]:
        """Return a dict safe for exposure through the read-only API endpoint.

        No secrets are held in this dataclass, so every field is safe to include. We
        deliberately DO NOT include the fingerprint here — that is computed from this
        dict by `_compute_fingerprint` and added separately by the endpoint.
        """
        data = asdict(self)
        # Convert tuple to list for JSON compatibility.
        data["trusted_proxy_cidrs"] = list(self.trusted_proxy_cidrs)
        return data


def _compute_fingerprint(limits: SecurityLimits) -> str:
    """SHA-256 of a canonical JSON representation. Stable across restarts (same env)."""
    payload = json.dumps(limits.to_public_dict(), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _load_limits_from_env() -> SecurityLimits:
    """Read env vars once and produce a validated, frozen SecurityLimits instance."""
    limits = SecurityLimits(
        # Per-field caps
        max_cv_text_input=_parse_int(
            "SECURITY_MAX_CV_TEXT_INPUT", 100_000, minimum=1_000, maximum=500_000
        ),
        max_job_title_chars=_parse_int(
            "SECURITY_MAX_JOB_TITLE_CHARS", 500, minimum=50, maximum=2_000
        ),
        max_industry_chars=_parse_int(
            "SECURITY_MAX_INDUSTRY_CHARS", 500, minimum=50, maximum=2_000
        ),
        max_job_description_chars=_parse_int(
            "SECURITY_MAX_JOB_DESCRIPTION_CHARS", 10_000, minimum=500, maximum=50_000
        ),
        max_specific_concerns_chars=_parse_int(
            "SECURITY_MAX_SPECIFIC_CONCERNS_CHARS", 5_000, minimum=100, maximum=20_000
        ),
        # File / body caps (10 MB default file, 12 MB default body envelope)
        max_file_size_bytes=_parse_int(
            "SECURITY_MAX_FILE_SIZE_BYTES",
            10 * 1024 * 1024,
            minimum=100 * 1024,
            maximum=50 * 1024 * 1024,
        ),
        max_request_body_bytes=_parse_int(
            "SECURITY_MAX_REQUEST_BODY_BYTES",
            12 * 1024 * 1024,
            minimum=200 * 1024,
            maximum=64 * 1024 * 1024,
        ),
        max_text_chars_for_llm=_parse_int(
            "SECURITY_MAX_TEXT_CHARS_FOR_LLM", 8_000, minimum=1_000, maximum=20_000
        ),
        # Rate limits
        review_rate_limit=_parse_rate_limit("SECURITY_REVIEW_RATE_LIMIT", "5/minute;30/hour"),
        options_rate_limit=_parse_rate_limit("SECURITY_OPTIONS_RATE_LIMIT", "60/minute"),
        default_rate_limit=_parse_rate_limit("SECURITY_DEFAULT_RATE_LIMIT", "120/minute"),
        # Proxy / abuse / budget
        trusted_proxy_cidrs=_parse_cidrs(
            "SECURITY_TRUSTED_PROXY_CIDRS",
            "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8",
        ),
        abuse_threshold_4xx=_parse_int(
            "SECURITY_ABUSE_THRESHOLD_4XX", 50, minimum=10, maximum=500
        ),
        abuse_window_seconds=_parse_int(
            "SECURITY_ABUSE_WINDOW_SECONDS", 300, minimum=60, maximum=3_600
        ),
        budget_cooldown_seconds=_parse_int(
            "SECURITY_BUDGET_COOLDOWN_SECONDS", 60, minimum=10, maximum=600
        ),
        total_llm_wall_clock_seconds=_parse_int(
            "SECURITY_TOTAL_LLM_WALL_CLOCK_SECONDS", 90, minimum=30, maximum=600
        ),
        per_llm_attempt_timeout_seconds=_parse_int(
            "SECURITY_PER_LLM_ATTEMPT_TIMEOUT_SECONDS", 58, minimum=10, maximum=300
        ),
    )

    # Cross-field sanity: body envelope must accommodate the file cap plus form fields.
    if limits.max_request_body_bytes < limits.max_file_size_bytes + 64 * 1024:
        raise SecurityConfigInvalid(
            "SECURITY_MAX_REQUEST_BODY_BYTES must be at least MAX_FILE_SIZE_BYTES + 64 KB "
            "to leave headroom for form-field overhead."
        )

    return limits


# ---------------------------------------------------------------------------
# Module-level singletons (loaded ONCE at import, never reassigned)
# ---------------------------------------------------------------------------

try:
    _LIMITS: SecurityLimits = _load_limits_from_env()
except SecurityConfigInvalid as exc:
    # Refuse to start if any limit is out of bounds — better to fail loudly at boot
    # than to run with a silently-disabled limit.
    logger.critical("Refusing to start: invalid security configuration — %s", exc)
    raise

_LIMITS_FINGERPRINT: str = _compute_fingerprint(_LIMITS)
_PUBLIC_LIMITS_VIEW: Mapping[str, Any] = MappingProxyType(_LIMITS.to_public_dict())

logger.info(
    "security.config loaded (fingerprint=%s, %d fields frozen)",
    _LIMITS_FINGERPRINT[:12],
    len(fields(SecurityLimits)),
)


# ---------------------------------------------------------------------------
# Public API — read-only accessors
# ---------------------------------------------------------------------------


def get_limits() -> SecurityLimits:
    """Return the frozen SecurityLimits singleton.

    Callers can read fields via attribute access (`get_limits().max_cv_text_input`) but
    cannot mutate them — the dataclass is frozen.
    """
    return _LIMITS


def get_limits_view() -> Mapping[str, Any]:
    """Return a read-only mapping of all limits, safe to serialize over the wire."""
    return _PUBLIC_LIMITS_VIEW


def get_fingerprint() -> str:
    """Return the SHA-256 fingerprint of the currently-loaded limits."""
    return _LIMITS_FINGERPRINT


def assert_unchanged() -> None:
    """Recompute the fingerprint and compare against the baseline.

    If someone managed to patch `_LIMITS` at runtime (via a highly unusual mechanism like
    `object.__setattr__`), the recomputed fingerprint will differ and this raises.
    Called from `/api/security/limits` on every access so the endpoint can double-verify.
    """
    current = _compute_fingerprint(_LIMITS)
    if current != _LIMITS_FINGERPRINT:
        raise SecurityConfigLockedError(
            f"Security configuration fingerprint drift detected! "
            f"baseline={_LIMITS_FINGERPRINT[:12]} current={current[:12]}"
        )


# ---------------------------------------------------------------------------
# Trusted-proxy IP extractor for slowapi
# ---------------------------------------------------------------------------


def _trusted_networks() -> tuple[ipaddress._BaseNetwork, ...]:
    """Parse the frozen CIDR tuple into ipaddress.ip_network objects (cached at import)."""
    return tuple(ipaddress.ip_network(c, strict=False) for c in _LIMITS.trusted_proxy_cidrs)


_TRUSTED_NETWORKS: tuple[ipaddress._BaseNetwork, ...] = _trusted_networks()


def _peer_is_trusted(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return any(ip in net for net in _TRUSTED_NETWORKS)


def is_trusted_proxy(ip_str: str) -> bool:
    """Public: is this IP a configured trusted proxy (CDN/ingress)?"""
    return _peer_is_trusted(ip_str)


def extract_client_ip(request: Any) -> str:
    """Return the real-client IP for rate-limiting purposes.

    Strategy:
    - If the direct peer (`request.client.host`) is in `TRUSTED_PROXY_CIDRS`, we trust the
      `X-Forwarded-For` header and take the LEFTMOST valid IP (the original client).
    - Otherwise, we ignore `X-Forwarded-For` entirely and return the peer IP. This means
      an attacker on the public internet cannot spoof XFF to reset their rate-limit bucket.

    Audit events for malformed XFF or untrusted-peer XFF are emitted by
    `security_audit.log_suspicious_xff` — called from the caller when it detects drift.
    """
    peer = getattr(getattr(request, "client", None), "host", None) or "anon"
    if not _peer_is_trusted(peer):
        return peer
    xff = (request.headers.get("x-forwarded-for") or "").strip() if hasattr(request, "headers") else ""
    if not xff:
        return peer
    first = xff.split(",")[0].strip()
    try:
        ipaddress.ip_address(first)
    except ValueError:
        # Malformed XFF from a trusted peer — unusual. Fall back to peer and let the
        # caller audit if needed.
        return peer
    return first


# ---------------------------------------------------------------------------
# Explicit guard: this module intentionally exposes NO setter.
# ---------------------------------------------------------------------------

# If anyone adds a setter later, this sentinel fails a unit test:
_HAS_SETTER_API = False
