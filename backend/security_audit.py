"""JSON-lines security audit logger.

Every security-relevant event (oversized payload, rate-limit hit, VPN/proxy
detection, validation failure, budget-cooldown trip, suspicious XFF) is written
as a single-line JSON object. Two sinks are active simultaneously:

1. **File**: `logs/security_audit.jsonl` under the backend root by default,
   rotated at 5 MB × 5 backups (configurable via env). Useful for local ops and
   ad-hoc grep/jq analysis.
2. **stdout**: the same JSON line, via the standard `logging` module. Captured
   by supervisor locally and by Vercel's log collector in serverless mode.

Privacy discipline
------------------
The audit log **never** includes:
- CV content (`cv_text`, extracted file text, `job_description`, `specific_concerns`)
- Uploaded file bytes or filename
- AI review output

It only includes operational metadata needed to detect abuse:
- peer IP (the direct TCP peer — necessary to enforce rate limits & VPN blocks)
- client IP (derived from trusted XFF only when the peer is a trusted proxy)
- request path + method
- event type + coarse reason string
- size/count fields (bytes, char counts — *not* the content itself)

A short GDPR-legitimate-interest disclosure is added to the privacy policy.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from collections import deque
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Deque

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_BACKEND_ROOT = Path(__file__).parent
_DEFAULT_LOG_DIR = _BACKEND_ROOT / "logs"
_AUDIT_FILENAME = "security_audit.jsonl"
_MAX_BYTES = 5 * 1024 * 1024
_BACKUP_COUNT = 5

# In-memory rolling buffer of recent events, for /api/security/audit/health.
_RECENT_MAX = 5_000
_recent_lock = threading.Lock()
_recent_events: Deque[dict[str, Any]] = deque(maxlen=_RECENT_MAX)


# ---------------------------------------------------------------------------
# Logger setup (idempotent — safe across hot-reload)
# ---------------------------------------------------------------------------


def _init_logger() -> logging.Logger:
    logger = logging.getLogger("security.audit")
    logger.setLevel(logging.INFO)
    logger.propagate = False

    # Re-attaching handlers on hot-reload would duplicate every line.
    if getattr(logger, "_security_audit_configured", False):
        return logger

    log_dir = Path(os.environ.get("SECURITY_AUDIT_LOG_DIR", str(_DEFAULT_LOG_DIR)))
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_dir / _AUDIT_FILENAME,
            maxBytes=_MAX_BYTES,
            backupCount=_BACKUP_COUNT,
            encoding="utf-8",
        )
        file_handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(file_handler)
    except OSError:
        # File logging is best-effort (serverless FS may be read-only). Fall
        # through to stdout-only.
        logging.getLogger(__name__).warning(
            "security.audit file handler disabled (read-only FS?)"
        )

    stdout_handler = logging.StreamHandler()
    stdout_handler.setFormatter(logging.Formatter("[audit] %(message)s"))
    logger.addHandler(stdout_handler)

    logger._security_audit_configured = True  # type: ignore[attr-defined]
    return logger


_logger = _init_logger()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


_ALLOWED_EVENTS = {
    "oversized_body_rejected",
    "oversized_field_rejected",
    "vpn_or_proxy_blocked",
    "vpn_or_proxy_flagged",
    "rate_limit_exceeded",
    "invalid_market",
    "invalid_seniority",
    "invalid_file_type",
    "oversized_file",
    "budget_cooldown_triggered",
    "budget_cooldown_short_circuit",
    "suspicious_xff",
    "limits_fingerprint_drift",
    "review_completed",
    "review_failed_upstream",
    "invalid_payload",
    "captcha_failed",
    "captcha_passed",
}


def log_event(event: str, *, peer_ip: str | None = None, client_ip: str | None = None,
              trusted_peer: bool = False, path: str | None = None,
              method: str | None = None, status_code: int | None = None,
              **extra: Any) -> None:
    """Write a single JSON line to both sinks and push to the rolling buffer."""
    if event not in _ALLOWED_EVENTS:
        # Fail loudly in dev; in prod this would still log under 'unknown_event'.
        logging.getLogger(__name__).warning("audit: unknown event type %r", event)

    record: dict[str, Any] = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        "peer_ip": peer_ip or "anon",
        "client_ip": client_ip or peer_ip or "anon",
        "trusted_peer": bool(trusted_peer),
    }
    if path:
        record["path"] = path
    if method:
        record["method"] = method
    if status_code is not None:
        record["status"] = int(status_code)
    for k, v in extra.items():
        # Defensively stringify any non-JSON-native types.
        try:
            json.dumps(v)
            record[k] = v
        except (TypeError, ValueError):
            record[k] = str(v)

    line = json.dumps(record, separators=(",", ":"), ensure_ascii=False)
    _logger.info(line)

    with _recent_lock:
        _recent_events.append({**record, "_mono": time.monotonic()})


def rollup(window_seconds: int = 3600) -> dict[str, Any]:
    """Return a summary of events seen in the last `window_seconds`.

    Used by `GET /api/security/audit/health` for monitoring.
    """
    cutoff = time.monotonic() - max(60, min(window_seconds, 86_400))
    totals: dict[str, int] = {}
    total = 0
    with _recent_lock:
        for evt in _recent_events:
            if evt["_mono"] < cutoff:
                continue
            total += 1
            totals[evt["event"]] = totals.get(evt["event"], 0) + 1
    return {
        "window_seconds": window_seconds,
        "total_events": total,
        "by_event": totals,
        "buffer_capacity": _RECENT_MAX,
        "buffer_size": sum(1 for _ in _recent_events),
    }


def clear_buffer_for_tests() -> None:
    """Test-only hook to drop the rolling buffer."""
    with _recent_lock:
        _recent_events.clear()
