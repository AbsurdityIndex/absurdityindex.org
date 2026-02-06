# K8s Monitor

Monitors a Kubernetes cluster for issues via SSH and sends macOS native notifications.

```
Your Mac                             K8s Server
┌──────────────────────┐   SSH      ┌──────────────────┐
│  monitor.py          │──────────► │  kubectl get ...  │
│  ├─ checks (8)       │  (every    │                  │
│  ├─ dedup            │   60s)     └──────────────────┘
│  ├─ macOS notify     │
│  ├─ web dashboard    │◄── http://localhost:9876
│  │  └─ alert_store   │    (SQLite WAL)
│  └─ menu bar icon    │    (optional, pip install rumps)
└──────────────────────┘
```

Core monitoring is zero dependencies (Python 3 stdlib only). The optional menu bar icon requires `rumps`.

## What it checks

| Check | Detects |
|-------|---------|
| **pods** | CrashLoopBackOff, OOMKilled, ImagePullBackOff, excessive restarts, stuck Pending |
| **nodes** | NotReady, memory/disk/PID pressure |
| **deployments** | Unavailable replicas, failed rollouts |
| **events** | Warning-level events from the last 5 minutes |
| **pvcs** | Pending or Lost PersistentVolumeClaims |
| **jobs** | Failed Jobs |
| **services** | Endpoints with no ready addresses |
| **hpas** | At-max-replicas, unable to scale |

## Quick start

```bash
cd k8s-monitor
python3 monitor.py
```

That's it. It connects to `corey@172.16.10.54` via SSH, runs checks every 60 seconds, pops macOS notifications for any issues, and opens a dashboard at [http://localhost:9876](http://localhost:9876).

### Options

```
--host USER@HOST   SSH target (default: corey@172.16.10.54)
--interval N       Seconds between checks (default: 60)
--port N           Dashboard port (default: 9876)
--no-web           Disable the web dashboard
--menubar          Show menu bar icon (requires: pip install rumps)
--once             Run one check cycle and exit
--debug            Verbose logging
```

## Web dashboard

A local web UI runs automatically on port 9876. It provides:

- **Health bar** — color-coded severity counts (critical/warning/info)
- **Severity filters** — click to filter by severity level
- **Alert list** — expandable rows with title, time-ago, occurrence count
- **Alert details** — full message, namespace, resource, first/last seen
- **Auto-refresh** — updates every 5 seconds without full page reload
- **Resolved toggle** — show/hide resolved alerts
- **Deep-linking** — `#alert-{id}` scrolls to and highlights a specific alert

Alert history is stored in SQLite (`~/.k8s-monitor-alerts.db`) with WAL mode for concurrent reads/writes. Resolved alerts are pruned after 24 hours, with a 500-row cap.

Disable with `--no-web` if you only want notifications.

## Menu bar icon

A Kubernetes helm icon in your menu bar showing live alert counts:

```bash
pip install rumps
python3 monitor.py --menubar
```

Or run the menu bar app standalone (while monitor.py runs separately):

```bash
python3 menubar.py
```

The icon shows:
- **Helm symbol** — always visible in the menu bar
- **Alert count** — number appears next to icon when alerts are active
- **Dropdown menu** — severity breakdown, recent alerts (clickable), "Open Dashboard"

The menu bar companion polls the web API every 5 seconds, so the web dashboard must be running.

## Clickable notifications

Install [terminal-notifier](https://github.com/julienXX/terminal-notifier) for clickable notifications that open the dashboard:

```bash
brew install terminal-notifier
```

When installed, clicking a notification opens the dashboard scrolled to that specific alert. Without it, notifications still work via osascript but aren't clickable.

## Deduplication

Same alert won't fire again within its cooldown:

- **Critical**: 2 minutes
- **Warning**: 5 minutes
- **Info**: 10 minutes

State persists in `~/.k8s-monitor-state.json` across restarts.

## Notification sounds

- **Critical**: Basso (urgent low tone)
- **Warning**: Ping
- **Info**: Pop (subtle)

## Auto-start with launchd

```bash
cp launchd/com.k8s-monitor.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.k8s-monitor.plist
```

Logs go to `/tmp/k8s-monitor.log`. Stop with:

```bash
launchctl unload ~/Library/LaunchAgents/com.k8s-monitor.plist
```
