"""Lightweight HTTP server for the K8s Monitor dashboard."""

from __future__ import annotations

import json
import logging
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from alert_store import AlertStore

log = logging.getLogger(__name__)

DEFAULT_PORT = 9876
DASHBOARD_HTML = (Path(__file__).parent / "dashboard.html").read_text()


class DashboardHandler(BaseHTTPRequestHandler):
    store: AlertStore  # set on class before server starts

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        qs = parse_qs(parsed.query)

        if path == "/":
            self._html(DASHBOARD_HTML)
        elif path == "/api/health":
            self._json(self.store.get_health())
        elif path == "/api/alerts":
            severity = qs.get("severity", [""])[0]
            resolved = int(qs.get("resolved", ["0"])[0])
            limit = int(qs.get("limit", ["200"])[0])
            alerts, total = self.store.get_alerts(severity=severity, resolved=resolved, limit=limit)
            self._json({"alerts": alerts, "total": total})
        elif m := re.match(r"^/api/alerts/(\d+)$", path):
            alert = self.store.get_alert(int(m.group(1)))
            if alert:
                self._json(alert)
            else:
                self._error(404, "Alert not found")
        else:
            self._error(404, "Not found")

    def _json(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _html(self, content: str):
        body = content.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, code: int, msg: str):
        body = json.dumps({"error": msg}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # Suppress default stderr logging; use our logger instead
        log.debug("HTTP %s", args[0] if args else "")


def start_server(store: AlertStore, port: int = DEFAULT_PORT) -> ThreadingHTTPServer:
    """Start the dashboard server in a daemon thread. Returns the server instance."""
    DashboardHandler.store = store
    server = ThreadingHTTPServer(("127.0.0.1", port), DashboardHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    log.info("Dashboard running at http://localhost:%d", port)
    return server
