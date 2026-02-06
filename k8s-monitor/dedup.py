"""Alert deduplication with file-backed persistence."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from models import Alert, Severity

log = logging.getLogger(__name__)

DEFAULT_COOLDOWNS = {
    Severity.CRITICAL: 120,   # 2 minutes
    Severity.WARNING: 300,    # 5 minutes
    Severity.INFO: 600,       # 10 minutes
}


class DedupEngine:
    """Suppresses duplicate alerts within cooldown windows. Persists state to disk."""

    def __init__(self, state_file: str = "~/.k8s-monitor-state.json",
                 cooldowns: dict[Severity, int] | None = None):
        self._path = Path(state_file).expanduser()
        self._cooldowns = cooldowns or DEFAULT_COOLDOWNS
        self._state: dict[str, float] = {}
        self._load()

    def should_send(self, alert: Alert) -> bool:
        now = time.time()
        cooldown = self._cooldowns.get(alert.severity, 300)
        last = self._state.get(alert.dedup_key, 0)

        if now - last < cooldown:
            return False

        self._state[alert.dedup_key] = now
        return True

    def save(self) -> None:
        """Persist state to disk. Call after each check cycle."""
        # Prune entries older than 1 hour to keep file small
        now = time.time()
        self._state = {k: v for k, v in self._state.items() if now - v < 3600}
        try:
            self._path.write_text(json.dumps(self._state))
        except OSError as exc:
            log.warning("Failed to save dedup state: %s", exc)

    def _load(self) -> None:
        if self._path.exists():
            try:
                self._state = json.loads(self._path.read_text())
            except (json.JSONDecodeError, OSError):
                self._state = {}
