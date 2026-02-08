#!/usr/bin/env python3
"""macOS menu bar companion for K8s Monitor.

Displays cluster health status in the menu bar with quick access
to alerts and the web dashboard.

Requires: pip install rumps
"""

from __future__ import annotations

import json
import logging
import math
import os
import struct
import sys
import tempfile
import webbrowser
import zlib
from urllib.error import URLError
from urllib.request import urlopen

try:
    import rumps
except ImportError:
    print("Menu bar requires 'rumps'. Install with:")
    print("  pip install rumps")
    sys.exit(1)

log = logging.getLogger(__name__)

SEVERITY_PREFIX = {"critical": "CRIT", "warning": "WARN", "info": "INFO"}
DEFAULT_PORT = 9876
POLL_INTERVAL = 5


# ---------------------------------------------------------------------------
# Icon generation — Kubernetes helm symbol as a template PNG (no bundled files)
# ---------------------------------------------------------------------------

def _create_icon() -> str:
    """Generate a 22x22 Kubernetes helm-style template icon PNG.

    Template icons are black shapes on transparent background.
    macOS automatically tints them for the current menu bar appearance.
    """
    size = 22
    cx = cy = size / 2
    pixels = []

    for y in range(size):
        row = bytearray([0])  # PNG filter byte: None
        for x in range(size):
            dx, dy = x - cx + 0.5, y - cy + 0.5
            dist = math.hypot(dx, dy)
            alpha = 0

            if 7.5 <= dist <= 9.5:              # outer ring
                alpha = 220
            elif dist <= 2.2:                    # center hub
                alpha = 220
            elif 2.8 < dist < 7.5:              # 7 spokes
                angle = math.atan2(dy, dx)
                for i in range(7):
                    spoke = i * 2 * math.pi / 7 - math.pi / 2
                    diff = abs(angle - spoke)
                    diff = min(diff, 2 * math.pi - diff)
                    if diff < 0.2:
                        alpha = 200
                        break

            row.extend([0, 0, 0, alpha])  # RGBA: black + computed alpha
        pixels.append(bytes(row))

    raw = b"".join(pixels)

    def chunk(ctype: bytes, data: bytes) -> bytes:
        c = ctype + data
        crc = struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack(">I", len(data)) + c + crc

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", zlib.compress(raw))
    png += chunk(b"IEND", b"")

    path = os.path.join(tempfile.gettempdir(), "k8s-monitor-icon.png")
    with open(path, "wb") as f:
        f.write(png)
    return path


# ---------------------------------------------------------------------------
# Menu bar app
# ---------------------------------------------------------------------------

class K8sMenuBar(rumps.App):
    def __init__(self, port: int = DEFAULT_PORT):
        icon_path = _create_icon()
        super().__init__("K8s", icon=icon_path, template=True, quit_button=None)
        self.port = port
        self.base = f"http://localhost:{port}"

        self._status = rumps.MenuItem("Connecting...")
        self._alerts_menu = rumps.MenuItem("Recent Alerts")
        self._dashboard = rumps.MenuItem("Open Dashboard", callback=self._open_dashboard)

        self.menu = [
            self._status,
            None,
            self._alerts_menu,
            None,
            self._dashboard,
            None,
            rumps.MenuItem("Quit", callback=rumps.quit_application),
        ]

    @rumps.timer(POLL_INTERVAL)
    def _poll(self, _):
        try:
            health = self._fetch("/api/health")
            c = health.get("critical", 0)
            w = health.get("warning", 0)
            i = health.get("info", 0)
            total = c + w + i

            # Number next to icon when there are active alerts
            self.title = str(total) if total > 0 else ""

            # Status summary line
            parts = []
            if c:
                parts.append(f"CRIT {c}")
            if w:
                parts.append(f"WARN {w}")
            if i:
                parts.append(f"INFO {i}")
            self._status.title = "  ".join(parts) if parts else "OK All clear"

            self._refresh_alerts()

        except (URLError, OSError, ValueError):
            self.title = "?"
            self._status.title = "WARN Monitor unreachable"
            self._clear_alerts()

    def _refresh_alerts(self):
        try:
            data = self._fetch("/api/alerts?limit=8")
            alerts = data.get("alerts", [])
            self._clear_alerts()

            if not alerts:
                self._alerts_menu.add(rumps.MenuItem("No active alerts"))
                return

            for alert in alerts:
                prefix = SEVERITY_PREFIX.get(alert["severity"], "INFO")
                title = f'[{prefix}] {alert["title"]}'
                if len(title) > 55:
                    title = title[:52] + "..."
                aid = alert["id"]
                item = rumps.MenuItem(title, callback=lambda _, a=aid: self._open_alert(a))
                self._alerts_menu.add(item)

        except Exception:
            self._clear_alerts()

    def _clear_alerts(self):
        for key in list(self._alerts_menu):
            del self._alerts_menu[key]

    def _open_dashboard(self, _):
        webbrowser.open(self.base)

    def _open_alert(self, alert_id: int):
        webbrowser.open(f"{self.base}/#alert-{alert_id}")

    def _fetch(self, path: str):
        return json.loads(urlopen(f"{self.base}{path}", timeout=3).read())


def main():
    import argparse

    parser = argparse.ArgumentParser(description="K8s Monitor menu bar app")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT,
                        help="Monitor web port (default: %(default)s)")
    args = parser.parse_args()
    K8sMenuBar(port=args.port).run()


if __name__ == "__main__":
    main()
