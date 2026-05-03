"""VPN / proxy / Tor / datacenter IP intelligence.

Strategy (Q1=c, "free community lists only"):
- Load three bundled lists at import:
    * `security_blocklists/datacenters.txt` — CIDR ranges of hosting providers
      commonly used by commercial VPNs (DigitalOcean, Hetzner, OVH, Vultr, etc.)
    * `security_blocklists/tor_exits.txt`  — static Tor exit-node seed
    * `security_blocklists/allowlist.txt`  — Apple Private Relay + Cloudflare
      WARP egress ranges that we MUST NOT block (Q3=a)
- Each env-overridable path (`SECURITY_VPN_BLOCKLIST_PATH`,
  `SECURITY_TOR_EXIT_PATH`, `SECURITY_VPN_ALLOWLIST_PATH`) lets operators swap
  in a larger, daily-refreshed list without a code change.
- An "unknown" or empty blocklist is NOT fatal (soft-fail): we still run, we
  just don't flag anything. This matches the Q4=c logging-first posture.

Detection is a simple linear CIDR scan. Our traffic is low-QPS (<100 RPS
even peak), so this is cheap (<1 ms per check for ~10k entries). If QPS ever
justifies it, swap in `pytricia` (prefix trie) — the public API here is
unchanged.

Public API:
- `classify(ip_str) -> IPClassification` — main entry point
- `is_blocked(ip_str) -> bool` — convenience boolean
- `get_stats() -> dict` — counts loaded (for `/api/security/limits`)
"""
from __future__ import annotations

import ipaddress
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

logger = logging.getLogger("security.ip_intel")

_BACKEND_ROOT = Path(__file__).parent
_BLOCKLIST_DIR = _BACKEND_ROOT / "security_blocklists"


@dataclass(frozen=True, slots=True)
class IPClassification:
    """Result of classifying a single IP."""

    ip: str
    allowlisted: bool      # Apple Private Relay / Cloudflare WARP / RFC1918
    is_tor_exit: bool
    is_datacenter: bool    # Known hosting/VPN range
    source: str            # e.g. "datacenter", "tor", "allowlist", "clean"

    @property
    def should_block(self) -> bool:
        """Hard-block decision: Tor or datacenter unless allowlisted."""
        if self.allowlisted:
            return False
        return self.is_tor_exit or self.is_datacenter


# ---------------------------------------------------------------------------
# List loading
# ---------------------------------------------------------------------------


def _read_cidr_file(path: Path) -> list[str]:
    if not path.exists():
        return []
    lines: list[str] = []
    try:
        with path.open("r", encoding="utf-8") as f:
            for raw in f:
                line = raw.split("#", 1)[0].strip()
                if line:
                    lines.append(line)
    except OSError as exc:
        logger.warning("ip_intel: could not read %s: %s", path, exc)
    return lines


def _parse_networks(lines: Iterable[str], source_label: str) -> tuple[ipaddress._BaseNetwork, ...]:
    nets: list[ipaddress._BaseNetwork] = []
    for raw in lines:
        try:
            nets.append(ipaddress.ip_network(raw, strict=False))
        except ValueError as exc:
            logger.warning("ip_intel[%s]: skipping invalid CIDR %r: %s", source_label, raw, exc)
    return tuple(nets)


def _load_all() -> tuple[
    tuple[ipaddress._BaseNetwork, ...],
    tuple[ipaddress._BaseNetwork, ...],
    tuple[ipaddress._BaseNetwork, ...],
]:
    dc_path = Path(os.environ.get("SECURITY_VPN_BLOCKLIST_PATH", str(_BLOCKLIST_DIR / "datacenters.txt")))
    tor_path = Path(os.environ.get("SECURITY_TOR_EXIT_PATH", str(_BLOCKLIST_DIR / "tor_exits.txt")))
    allow_path = Path(os.environ.get("SECURITY_VPN_ALLOWLIST_PATH", str(_BLOCKLIST_DIR / "allowlist.txt")))

    dc = _parse_networks(_read_cidr_file(dc_path), "datacenter")
    tor = _parse_networks(_read_cidr_file(tor_path), "tor")
    allow = _parse_networks(_read_cidr_file(allow_path), "allowlist")
    logger.info(
        "ip_intel loaded: datacenters=%d tor=%d allowlist=%d",
        len(dc), len(tor), len(allow),
    )
    return dc, tor, allow


_DATACENTER_NETS, _TOR_NETS, _ALLOWLIST_NETS = _load_all()


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------


def _match_any(ip: ipaddress._BaseAddress, nets: tuple[ipaddress._BaseNetwork, ...]) -> bool:
    # Short-circuit on family mismatch to keep the scan tight.
    v6 = isinstance(ip, ipaddress.IPv6Address)
    for n in nets:
        if isinstance(n, ipaddress.IPv6Network) != v6:
            continue
        if ip in n:
            return True
    return False


def classify(ip_str: str) -> IPClassification:
    """Classify an IP string. Malformed IPs are returned as clean (fail-open)."""
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return IPClassification(ip=ip_str, allowlisted=False, is_tor_exit=False,
                                is_datacenter=False, source="malformed")

    allowlisted = _match_any(ip, _ALLOWLIST_NETS)
    if allowlisted:
        return IPClassification(ip=ip_str, allowlisted=True, is_tor_exit=False,
                                is_datacenter=False, source="allowlist")

    is_tor = _match_any(ip, _TOR_NETS)
    is_dc = _match_any(ip, _DATACENTER_NETS)
    source = "tor" if is_tor else ("datacenter" if is_dc else "clean")
    return IPClassification(
        ip=ip_str,
        allowlisted=False,
        is_tor_exit=is_tor,
        is_datacenter=is_dc,
        source=source,
    )


def is_blocked(ip_str: str) -> bool:
    return classify(ip_str).should_block


def get_stats() -> dict[str, int]:
    return {
        "datacenter_cidrs_loaded": len(_DATACENTER_NETS),
        "tor_exits_loaded": len(_TOR_NETS),
        "allowlist_cidrs_loaded": len(_ALLOWLIST_NETS),
    }
