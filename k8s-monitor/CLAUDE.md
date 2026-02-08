# K8s Monitor

Monitors a Kubernetes cluster for issues via SSH and sends macOS native notifications. Provides a local web dashboard and optional menu bar icon.

## Tech Stack

- **Language:** Python 3 (stdlib only for core — zero external dependencies)
- **Optional:** `rumps` for macOS menu bar icon, `terminal-notifier` for clickable notifications
- **Database:** SQLite (WAL mode) for alert history at `~/.k8s-monitor-alerts.db`
- **State:** JSON file at `~/.k8s-monitor-state.json` for dedup cooldowns

## Files

| File | Purpose |
|------|---------|
| `monitor.py` | Main entry point — SSH polling loop, orchestrates checks |
| `checks.py` | 8 kubectl check functions (pods, nodes, deployments, events, PVCs, jobs, services, HPAs) |
| `dedup.py` | Alert deduplication with severity-based cooldowns |
| `notifier.py` | macOS notification dispatch (osascript / terminal-notifier) |
| `alert_store.py` | SQLite alert storage with auto-pruning |
| `web.py` | Local HTTP dashboard server (stdlib `http.server`) |
| `dashboard.html` | Dashboard UI (single-file HTML with inline JS/CSS) |
| `menubar.py` | Standalone macOS menu bar companion (requires `rumps`) |
| `ssh.py` | SSH command execution wrapper |
| `models.py` | Alert data model |
| `launchd/` | macOS launchd plist for auto-start |

## Quick Start

```bash
cd k8s-monitor
python3 monitor.py                    # Uses K8S_HOST from .env
python3 monitor.py --host user@host   # Explicit SSH target
python3 monitor.py --once --debug     # Single check with verbose output
python3 monitor.py --menubar          # Include menu bar icon
```

## Key Options

```text
--host USER@HOST   SSH target (default: $K8S_HOST env var)
--interval N       Seconds between checks (default: 60)
--port N           Dashboard port (default: 9876)
--no-web           Disable the web dashboard
--menubar          Show menu bar icon (requires: pip install rumps)
--once             Run one check cycle and exit
--debug            Verbose logging
```

## What It Checks

Pods (CrashLoop, OOM, ImagePull, restarts, Pending), Nodes (NotReady, pressure conditions), Deployments (unavailable replicas), Events (warnings), PVCs (Pending/Lost), Jobs (failed), Services (no ready endpoints), HPAs (at-max, unable to scale).

## Dedup Cooldowns

- Critical: 2 min
- Warning: 5 min
- Info: 10 min

## Conventions

- No external dependencies for core functionality — stdlib only
- All SSH commands go through `ssh.py` wrapper
- Dashboard auto-refreshes every 5 seconds
- Resolved alerts pruned after 24 hours, 500-row cap
