# AGENTS.md — K8s Monitor

This file provides guidance to AI coding assistants working in the `k8s-monitor/` directory.

## Overview

Monitors a Kubernetes cluster for issues via SSH and sends macOS native notifications. Provides a local web dashboard and optional macOS menu bar icon.

## Tech Stack

- **Language:** Python 3 (stdlib only for core — **zero external dependencies**)
- **Optional deps:** `rumps` (macOS menu bar icon), `terminal-notifier` (clickable notifications)
- **Database:** SQLite with WAL mode for alert history (`~/.k8s-monitor-alerts.db`)
- **State persistence:** JSON file (`~/.k8s-monitor-state.json`) for dedup cooldowns

## Important: No External Dependencies

The core monitoring functionality uses **only Python 3 standard library**. Do not add `pip` dependencies to the core files (`monitor.py`, `checks.py`, `dedup.py`, `notifier.py`, `alert_store.py`, `web.py`, `ssh.py`, `models.py`). The `rumps` dependency is isolated to `menubar.py` only.

## Files

| File | Purpose |
|------|---------|
| `monitor.py` | Main entry point — SSH polling loop, orchestrates all checks |
| `checks.py` | 8 kubectl check functions (pods, nodes, deployments, events, PVCs, jobs, services, HPAs) |
| `dedup.py` | Alert deduplication with severity-based cooldowns |
| `notifier.py` | macOS notification dispatch (osascript or terminal-notifier) |
| `alert_store.py` | SQLite alert storage, querying, and auto-pruning |
| `web.py` | Local HTTP dashboard server (stdlib `http.server`) |
| `dashboard.html` | Dashboard UI (single-file HTML with inline JS/CSS) |
| `menubar.py` | Standalone macOS menu bar companion (requires `rumps`) |
| `ssh.py` | SSH command execution wrapper |
| `models.py` | Alert data model (dataclass) |
| `launchd/` | macOS launchd plist for auto-start on login |

## Commands

```bash
python3 monitor.py                       # Uses K8S_HOST from .env
python3 monitor.py --host user@host      # Explicit SSH target
python3 monitor.py --once --debug        # Single check with verbose output
python3 monitor.py --menubar             # Include menu bar icon
python3 monitor.py --no-web              # Disable web dashboard
python3 monitor.py --interval 30         # Check every 30 seconds
python3 monitor.py --port 9877           # Dashboard on custom port
```

## What It Checks

| Check | Detects |
|-------|---------|
| Pods | CrashLoopBackOff, OOMKilled, ImagePullBackOff, excessive restarts, stuck Pending |
| Nodes | NotReady, memory/disk/PID pressure |
| Deployments | Unavailable replicas, failed rollouts |
| Events | Warning-level events from the last 5 minutes |
| PVCs | Pending or Lost PersistentVolumeClaims |
| Jobs | Failed Jobs |
| Services | Endpoints with no ready addresses |
| HPAs | At-max-replicas, unable to scale |

## Key Patterns

- All SSH commands go through the `ssh.py` wrapper (never call `subprocess` directly for kubectl)
- Dedup cooldowns are severity-based: Critical = 2 min, Warning = 5 min, Info = 10 min
- Dashboard auto-refreshes every 5 seconds via polling (no WebSocket)
- Resolved alerts are pruned after 24 hours, with a 500-row cap
- Notification sounds: Critical = Basso, Warning = Ping, Info = Pop
- The menu bar companion (`menubar.py`) polls the web API — it requires the dashboard to be running
- Deep-linking: `http://localhost:9876/#alert-{id}` scrolls to a specific alert

## Environment

Reads `K8S_HOST` from `.env` in the project root (e.g., `K8S_HOST=user@192.168.1.100`). Can also be passed via `--host` flag.
