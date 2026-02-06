"""SQLite-backed alert storage with upsert, resolution tracking, and pruning."""

from __future__ import annotations

import logging
import sqlite3
import threading
import time
from pathlib import Path

from models import Alert, Severity

log = logging.getLogger(__name__)

DEFAULT_DB_PATH = Path.home() / ".k8s-monitor-alerts.db"
MAX_ROWS = 500
RESOLVED_TTL = 24 * 3600  # 24 hours


class AlertStore:
    def __init__(self, db_path: str | Path = DEFAULT_DB_PATH):
        self._db_path = str(db_path)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA busy_timeout=3000")
        self._create_tables()
        self._last_check: float = 0.0

    def _create_tables(self):
        with self._lock:
            self._conn.executescript("""
                CREATE TABLE IF NOT EXISTS alerts (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    severity         TEXT NOT NULL,
                    title            TEXT NOT NULL,
                    message          TEXT NOT NULL,
                    namespace        TEXT DEFAULT '',
                    resource         TEXT DEFAULT '',
                    dedup_key        TEXT NOT NULL,
                    first_seen       REAL NOT NULL,
                    last_seen        REAL NOT NULL,
                    occurrence_count INTEGER DEFAULT 1,
                    resolved         INTEGER DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_dedup_key ON alerts(dedup_key);
                CREATE INDEX IF NOT EXISTS idx_severity ON alerts(severity);
                CREATE INDEX IF NOT EXISTS idx_last_seen ON alerts(last_seen DESC);
            """)

    def upsert_alert(self, alert: Alert) -> int:
        """Insert or update an alert by dedup_key. Returns the alert row id."""
        now = time.time()
        with self._lock:
            row = self._conn.execute(
                "SELECT id, occurrence_count FROM alerts WHERE dedup_key = ? AND resolved = 0",
                (alert.dedup_key,),
            ).fetchone()

            if row:
                self._conn.execute(
                    "UPDATE alerts SET last_seen = ?, occurrence_count = ?, "
                    "message = ?, severity = ? WHERE id = ?",
                    (now, row["occurrence_count"] + 1, alert.message, alert.severity.value, row["id"]),
                )
                self._conn.commit()
                return row["id"]
            else:
                cur = self._conn.execute(
                    "INSERT INTO alerts (severity, title, message, namespace, resource, "
                    "dedup_key, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (alert.severity.value, alert.title, alert.message,
                     alert.namespace, alert.resource, alert.dedup_key, now, now),
                )
                self._conn.commit()
                return cur.lastrowid

    def mark_resolved(self, active_dedup_keys: set[str]):
        """Mark alerts as resolved if their dedup_key is no longer active."""
        with self._lock:
            rows = self._conn.execute(
                "SELECT id, dedup_key FROM alerts WHERE resolved = 0"
            ).fetchall()
            to_resolve = [r["id"] for r in rows if r["dedup_key"] not in active_dedup_keys]
            if to_resolve:
                placeholders = ",".join("?" * len(to_resolve))
                self._conn.execute(
                    f"UPDATE alerts SET resolved = 1 WHERE id IN ({placeholders})",
                    to_resolve,
                )
                self._conn.commit()
                log.debug("Resolved %d alerts", len(to_resolve))

    def prune(self):
        """Delete old resolved alerts and enforce row cap."""
        now = time.time()
        with self._lock:
            # Delete resolved alerts older than TTL
            self._conn.execute(
                "DELETE FROM alerts WHERE resolved = 1 AND last_seen < ?",
                (now - RESOLVED_TTL,),
            )
            # Enforce row cap — keep newest
            self._conn.execute(
                "DELETE FROM alerts WHERE id NOT IN "
                "(SELECT id FROM alerts ORDER BY last_seen DESC LIMIT ?)",
                (MAX_ROWS,),
            )
            self._conn.commit()

    def set_last_check(self):
        self._last_check = time.time()

    @property
    def last_check(self) -> float:
        return self._last_check

    # --- Read methods (called from web server thread) ---

    def get_alert(self, alert_id: int) -> dict | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()
            return dict(row) if row else None

    def get_alerts(self, severity: str = "", resolved: int = 0, limit: int = 200) -> tuple[list[dict], int]:
        with self._lock:
            conditions = []
            params: list = []

            if severity:
                conditions.append("severity = ?")
                params.append(severity)
            conditions.append("resolved = ?")
            params.append(resolved)

            where = " AND ".join(conditions)

            total = self._conn.execute(
                f"SELECT COUNT(*) FROM alerts WHERE {where}", params
            ).fetchone()[0]

            rows = self._conn.execute(
                f"SELECT * FROM alerts WHERE {where} ORDER BY last_seen DESC LIMIT ?",
                params + [limit],
            ).fetchall()

            return [dict(r) for r in rows], total

    def get_health(self) -> dict:
        with self._lock:
            counts = {}
            for sev in ("critical", "warning", "info"):
                row = self._conn.execute(
                    "SELECT COUNT(*) FROM alerts WHERE severity = ? AND resolved = 0",
                    (sev,),
                ).fetchone()
                counts[sev] = row[0]
            return {**counts, "last_check": self._last_check}

    def close(self):
        with self._lock:
            self._conn.close()
