"""macOS native notifications via terminal-notifier (preferred) or osascript."""

from __future__ import annotations

import logging
import shutil
import subprocess

log = logging.getLogger(__name__)

SEVERITY_SOUNDS = {
    "critical": "Basso",
    "warning": "Ping",
    "info": "Pop",
}

SEVERITY_EMOJI = {
    "critical": "\U0001f534",
    "warning": "\U0001f7e1",
    "info": "\U0001f535",
}

HAS_TERMINAL_NOTIFIER = shutil.which("terminal-notifier") is not None


def notify(
    title: str,
    message: str,
    severity: str = "info",
    *,
    alert_id: int | None = None,
    port: int | None = None,
) -> bool:
    """Send a macOS notification with severity-appropriate sound.

    If terminal-notifier is installed and alert_id/port are provided,
    clicking the notification opens the dashboard at that alert.
    """
    sound = SEVERITY_SOUNDS.get(severity, "Pop")
    emoji = SEVERITY_EMOJI.get(severity, "")
    display_title = f"{emoji} [{severity.upper()}] {title}"

    if HAS_TERMINAL_NOTIFIER:
        return _notify_terminal_notifier(display_title, message, sound, alert_id, port)
    return _notify_osascript(display_title, message, sound)


def _notify_terminal_notifier(
    title: str, message: str, sound: str,
    alert_id: int | None, port: int | None,
) -> bool:
    cmd = [
        "terminal-notifier",
        "-title", title,
        "-message", message,
        "-sound", sound,
        "-group", "k8s-monitor",
    ]
    if alert_id is not None and port is not None:
        cmd += ["-open", f"http://localhost:{port}/#alert-{alert_id}"]

    try:
        subprocess.run(cmd, capture_output=True, timeout=5)
        return True
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as exc:
        log.error("terminal-notifier failed: %s", exc)
        return False


def _notify_osascript(title: str, message: str, sound: str) -> bool:
    script = (
        f'display notification "{_escape(message)}" '
        f'with title "{_escape(title)}" '
        f'sound name "{sound}"'
    )
    try:
        subprocess.run(["osascript", "-e", script], capture_output=True, timeout=5)
        return True
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as exc:
        log.error("Notification failed: %s", exc)
        return False


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')
