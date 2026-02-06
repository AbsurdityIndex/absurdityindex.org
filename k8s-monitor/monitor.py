#!/usr/bin/env python3
"""K8s Monitor — SSH-based Kubernetes health checker with macOS notifications.

Connects to a remote K8s server via SSH, runs kubectl checks every 60 seconds,
and sends macOS notifications for any issues found.
"""

from __future__ import annotations

import argparse
import logging
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from alert_store import AlertStore
from checks import run_all_checks
from dedup import DedupEngine
from notifier import notify
from ssh import SSHClient
from web import DEFAULT_PORT, start_server

log = logging.getLogger("k8s-monitor")

DEFAULT_HOST = os.environ.get("K8S_HOST", "user@your-k8s-host")
DEFAULT_INTERVAL = 60


def main():
    parser = argparse.ArgumentParser(description="K8s cluster monitor via SSH")
    parser.add_argument("--host", default=DEFAULT_HOST, help="SSH host (default: %(default)s)")
    parser.add_argument("--interval", type=int, default=DEFAULT_INTERVAL, help="Check interval in seconds")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Dashboard port (default: %(default)s)")
    parser.add_argument("--no-web", action="store_true", help="Disable the web dashboard")
    parser.add_argument("--menubar", action="store_true", help="Show menu bar icon (requires: pip install rumps)")
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--once", action="store_true", help="Run checks once and exit")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    ssh = SSHClient(args.host)
    dedup = DedupEngine()
    store = AlertStore()
    running = True
    web_server = None
    menubar_proc = None

    def shutdown(sig, frame):
        nonlocal running
        log.info("Shutting down...")
        running = False

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Start web dashboard
    if not args.no_web:
        web_server = start_server(store, port=args.port)

    # Launch menu bar companion
    if args.menubar and not args.no_web:
        menubar_script = Path(__file__).parent / "menubar.py"
        menubar_proc = subprocess.Popen(
            [sys.executable, str(menubar_script), "--port", str(args.port)],
        )
        log.info("Menu bar app started (pid %d)", menubar_proc.pid)

    # Establish persistent SSH connection
    if not ssh.start():
        log.error("Cannot connect to %s — check SSH config/keys", args.host)
        sys.exit(1)

    log.info("Monitoring %s every %ds", args.host, args.interval)

    try:
        while running:
            cycle_start = time.time()
            alerts = run_all_checks(ssh)

            # Track which dedup_keys are active this cycle
            active_keys: set[str] = set()

            sent = 0
            for alert in alerts:
                alert_id = store.upsert_alert(alert)
                alert.id = alert_id
                active_keys.add(alert.dedup_key)

                if dedup.should_send(alert):
                    notify(
                        alert.title, alert.message, alert.severity.value,
                        alert_id=alert_id,
                        port=args.port if not args.no_web else None,
                    )
                    log.info("[%s] %s", alert.severity.value.upper(), alert.title)
                    sent += 1

            # Mark alerts not seen this cycle as resolved
            store.mark_resolved(active_keys)
            store.set_last_check()
            store.prune()
            dedup.save()

            if alerts:
                log.debug("Cycle: %d issues found, %d notifications sent (%.1fs)",
                          len(alerts), sent, time.time() - cycle_start)

            if args.once:
                break

            # Sleep for the remainder of the interval
            elapsed = time.time() - cycle_start
            sleep_time = max(0, args.interval - elapsed)
            if sleep_time > 0 and running:
                time.sleep(sleep_time)
    finally:
        if menubar_proc:
            menubar_proc.terminate()
        if web_server:
            web_server.shutdown()
        store.close()
        ssh.stop()
        log.info("Stopped")


if __name__ == "__main__":
    main()
