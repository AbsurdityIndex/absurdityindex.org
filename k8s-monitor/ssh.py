"""SSH command execution with ControlMaster multiplexing."""

from __future__ import annotations

import json
import logging
import subprocess

log = logging.getLogger(__name__)

# Unix domain sockets have a ~104-char path limit on macOS.
# Use a short fixed path to stay well under it.
_SOCKET_PATH = "/tmp/k8s-mon-%C"


class SSHClient:
    """Runs commands on a remote host, reusing a single SSH connection."""

    def __init__(self, host: str, socket_path: str = _SOCKET_PATH):
        self.host = host
        self._socket = socket_path
        self._master_started = False

    def start(self) -> bool:
        """Establish the ControlMaster connection."""
        result = subprocess.run(
            [
                "ssh",
                "-o", "ControlMaster=yes",
                "-o", f"ControlPath={self._socket}",
                "-o", "ControlPersist=300",
                "-o", "ConnectTimeout=10",
                "-o", "ServerAliveInterval=30",
                "-o", "BatchMode=yes",
                "-fN",  # background, no command
                self.host,
            ],
            capture_output=True,
            timeout=15,
        )
        if result.returncode == 0:
            self._master_started = True
            log.info("SSH ControlMaster connected to %s", self.host)
            return True
        log.error("SSH ControlMaster failed: %s", result.stderr.decode().strip())
        return False

    def stop(self):
        """Close the ControlMaster connection."""
        if self._master_started:
            subprocess.run(
                [
                    "ssh",
                    "-o", f"ControlPath={self._socket}",
                    "-O", "exit",
                    self.host,
                ],
                capture_output=True,
                timeout=5,
            )
            self._master_started = False
            log.info("SSH ControlMaster closed")

    def run(self, command: str, timeout: int = 30) -> subprocess.CompletedProcess:
        """Run a command over SSH, reusing the ControlMaster socket."""
        ssh_args = ["ssh"]
        if self._master_started:
            ssh_args += ["-o", f"ControlPath={self._socket}"]
        ssh_args += ["-o", "BatchMode=yes", self.host, command]

        return subprocess.run(ssh_args, capture_output=True, timeout=timeout)

    def kubectl_json(self, args: str, timeout: int = 30) -> dict | list | None:
        """Run a kubectl command and parse JSON output."""
        result = self.run(f"kubectl {args} -o json", timeout=timeout)
        if result.returncode != 0:
            stderr = result.stderr.decode().strip()
            if stderr:
                log.warning("kubectl %s failed: %s", args.split()[0], stderr)
            return None
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            log.warning("kubectl %s returned invalid JSON", args.split()[0])
            return None

    def kubectl_text(self, args: str, timeout: int = 30) -> str | None:
        """Run a kubectl command and return raw text output."""
        result = self.run(f"kubectl {args}", timeout=timeout)
        if result.returncode != 0:
            return None
        return result.stdout.decode()
