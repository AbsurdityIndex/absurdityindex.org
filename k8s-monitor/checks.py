"""Kubernetes health checks — parse kubectl JSON output into alerts."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from models import Alert, Severity
from ssh import SSHClient

log = logging.getLogger(__name__)

EXCLUDED_NS = {"kube-system", "kube-public", "kube-node-lease"}
RESTART_THRESHOLD = 5


def run_all_checks(ssh: SSHClient) -> list[Alert]:
    """Run all checks and return a flat list of alerts."""
    alerts: list[Alert] = []
    for check_fn in [
        check_pods,
        check_nodes,
        check_deployments,
        check_events,
        check_pvcs,
        check_jobs,
        check_services,
        check_hpas,
    ]:
        try:
            alerts.extend(check_fn(ssh))
        except Exception as exc:
            log.warning("Check %s failed: %s", check_fn.__name__, exc)
    return alerts


def check_pods(ssh: SSHClient) -> list[Alert]:
    data = ssh.kubectl_json("get pods -A")
    if not data:
        return []

    alerts = []
    for pod in data.get("items", []):
        ns = pod["metadata"]["namespace"]
        if ns in EXCLUDED_NS:
            continue
        name = pod["metadata"]["name"]
        resource = f"Pod/{name}"

        # Container statuses
        for cs in (pod.get("status", {}).get("containerStatuses") or []) + \
                  (pod.get("status", {}).get("initContainerStatuses") or []):
            container = cs.get("name", "?")
            restarts = cs.get("restartCount", 0)

            waiting = (cs.get("state") or {}).get("waiting") or {}
            reason = waiting.get("reason", "")

            if reason == "CrashLoopBackOff":
                alerts.append(Alert(
                    Severity.CRITICAL,
                    f"CrashLoopBackOff: {name}",
                    f"{ns}/{name}/{container} crash-looping (restarts: {restarts})",
                    ns, resource,
                ))
            elif reason in ("ImagePullBackOff", "ErrImagePull"):
                alerts.append(Alert(
                    Severity.WARNING,
                    f"ImagePullBackOff: {name}",
                    f"{ns}/{name}/{container}: {waiting.get('message', reason)}",
                    ns, resource,
                ))

            terminated = (cs.get("state") or {}).get("terminated") or {}
            if terminated.get("reason") == "OOMKilled":
                alerts.append(Alert(
                    Severity.CRITICAL,
                    f"OOMKilled: {name}",
                    f"{ns}/{name}/{container} killed by OOM (exit {terminated.get('exitCode', '?')})",
                    ns, resource,
                ))

            if restarts >= RESTART_THRESHOLD:
                alerts.append(Alert(
                    Severity.WARNING,
                    f"Excessive restarts: {name}",
                    f"{ns}/{name}/{container} has restarted {restarts} times",
                    ns, resource,
                ))

        # Stuck Pending
        phase = (pod.get("status") or {}).get("phase", "")
        if phase == "Pending":
            for cond in (pod.get("status", {}).get("conditions") or []):
                if cond.get("type") == "PodScheduled" and cond.get("status") == "False":
                    alerts.append(Alert(
                        Severity.WARNING,
                        f"Stuck Pending: {name}",
                        f"{ns}/{name}: {cond.get('reason', '?')} — {cond.get('message', '')}",
                        ns, resource,
                    ))

    return alerts


def check_nodes(ssh: SSHClient) -> list[Alert]:
    data = ssh.kubectl_json("get nodes")
    if not data:
        return []

    alerts = []
    pressure_types = {"MemoryPressure", "DiskPressure", "PIDPressure", "NetworkUnavailable"}

    for node in data.get("items", []):
        name = node["metadata"]["name"]
        resource = f"Node/{name}"

        for cond in (node.get("status", {}).get("conditions") or []):
            ctype = cond.get("type", "")

            if ctype == "Ready" and cond.get("status") != "True":
                alerts.append(Alert(
                    Severity.CRITICAL,
                    f"Node NotReady: {name}",
                    f"{name}: {cond.get('reason', '')} — {cond.get('message', '')}",
                    resource=resource,
                ))
            elif ctype in pressure_types and cond.get("status") == "True":
                alerts.append(Alert(
                    Severity.WARNING,
                    f"{ctype}: {name}",
                    f"{name}: {cond.get('reason', '')} — {cond.get('message', '')}",
                    resource=resource,
                ))

    return alerts


def check_deployments(ssh: SSHClient) -> list[Alert]:
    data = ssh.kubectl_json("get deployments -A")
    if not data:
        return []

    alerts = []
    for dep in data.get("items", []):
        ns = dep["metadata"]["namespace"]
        if ns in EXCLUDED_NS:
            continue
        name = dep["metadata"]["name"]
        resource = f"Deployment/{name}"
        status = dep.get("status", {})
        desired = (dep.get("spec") or {}).get("replicas", 0)
        unavailable = status.get("unavailableReplicas", 0)

        if unavailable > 0 and desired > 0:
            available = status.get("availableReplicas", 0)
            alerts.append(Alert(
                Severity.WARNING,
                f"Unavailable replicas: {name}",
                f"{ns}/{name}: {unavailable}/{desired} unavailable ({available} ready)",
                ns, resource,
            ))

        for cond in (status.get("conditions") or []):
            if cond.get("type") == "Progressing" and cond.get("status") == "False":
                alerts.append(Alert(
                    Severity.CRITICAL,
                    f"Failed rollout: {name}",
                    f"{ns}/{name}: {cond.get('reason', '')} — {cond.get('message', '')}",
                    ns, resource,
                ))

    return alerts


def check_events(ssh: SSHClient) -> list[Alert]:
    data = ssh.kubectl_json("get events -A --field-selector type=Warning")
    if not data:
        return []

    alerts = []
    now = datetime.now(timezone.utc)

    for ev in data.get("items", []):
        ns = ev["metadata"]["namespace"]
        if ns in EXCLUDED_NS:
            continue

        # Only recent events (last 5 minutes)
        last_ts = ev.get("lastTimestamp") or ev.get("metadata", {}).get("creationTimestamp", "")
        if last_ts:
            try:
                event_time = datetime.fromisoformat(last_ts.replace("Z", "+00:00"))
                if (now - event_time).total_seconds() > 300:
                    continue
            except (ValueError, TypeError):
                pass

        involved = ev.get("involvedObject", {})
        res_kind = involved.get("kind", "?")
        res_name = involved.get("name", "?")
        reason = ev.get("reason", "?")

        alerts.append(Alert(
            Severity.WARNING,
            f"Event: {reason}",
            f"{res_kind}/{res_name} in {ns}: {ev.get('message', '')}",
            ns, f"{res_kind}/{res_name}",
        ))

    return alerts


def check_pvcs(ssh: SSHClient) -> list[Alert]:
    data = ssh.kubectl_json("get pvc -A")
    if not data:
        return []

    alerts = []
    for pvc in data.get("items", []):
        ns = pvc["metadata"]["namespace"]
        if ns in EXCLUDED_NS:
            continue
        name = pvc["metadata"]["name"]
        phase = (pvc.get("status") or {}).get("phase", "")

        if phase == "Pending":
            alerts.append(Alert(
                Severity.WARNING,
                f"PVC Pending: {name}",
                f"{ns}/{name} stuck in Pending",
                ns, f"PVC/{name}",
            ))
        elif phase == "Lost":
            alerts.append(Alert(
                Severity.CRITICAL,
                f"PVC Lost: {name}",
                f"{ns}/{name} lost its backing volume",
                ns, f"PVC/{name}",
            ))

    return alerts


def check_jobs(ssh: SSHClient) -> list[Alert]:
    data = ssh.kubectl_json("get jobs -A")
    if not data:
        return []

    alerts = []
    for job in data.get("items", []):
        ns = job["metadata"]["namespace"]
        if ns in EXCLUDED_NS:
            continue
        name = job["metadata"]["name"]

        for cond in (job.get("status", {}).get("conditions") or []):
            if cond.get("type") == "Failed" and cond.get("status") == "True":
                alerts.append(Alert(
                    Severity.WARNING,
                    f"Job failed: {name}",
                    f"{ns}/{name}: {cond.get('reason', '')} — {cond.get('message', '')}",
                    ns, f"Job/{name}",
                ))

    return alerts


def check_services(ssh: SSHClient) -> list[Alert]:
    data = ssh.kubectl_json("get endpoints -A")
    if not data:
        return []

    alerts = []
    for ep in data.get("items", []):
        ns = ep["metadata"]["namespace"]
        if ns in EXCLUDED_NS:
            continue
        name = ep["metadata"]["name"]

        # Skip the kubernetes default endpoint
        if ns == "default" and name == "kubernetes":
            continue

        subsets = ep.get("subsets") or []
        has_addresses = any(s.get("addresses") for s in subsets)

        if not subsets or not has_addresses:
            # Verify there's actually a service with a selector for this
            alerts.append(Alert(
                Severity.INFO,
                f"No endpoints: {name}",
                f"Service {ns}/{name} has no ready endpoints",
                ns, f"Service/{name}",
            ))

    return alerts


def check_hpas(ssh: SSHClient) -> list[Alert]:
    data = ssh.kubectl_json("get hpa -A")
    if not data:
        return []

    alerts = []
    for hpa in data.get("items", []):
        ns = hpa["metadata"]["namespace"]
        if ns in EXCLUDED_NS:
            continue
        name = hpa["metadata"]["name"]
        resource = f"HPA/{name}"
        status = hpa.get("status", {})
        spec = hpa.get("spec", {})

        current = status.get("currentReplicas", 0)
        max_replicas = spec.get("maxReplicas", 0)

        if max_replicas > 0 and current >= max_replicas:
            alerts.append(Alert(
                Severity.WARNING,
                f"HPA at max: {name}",
                f"{ns}/{name} at {current}/{max_replicas} max replicas",
                ns, resource,
            ))

        for cond in (status.get("conditions") or []):
            if cond.get("type") == "AbleToScale" and cond.get("status") == "False":
                alerts.append(Alert(
                    Severity.CRITICAL,
                    f"HPA can't scale: {name}",
                    f"{ns}/{name}: {cond.get('reason', '')} — {cond.get('message', '')}",
                    ns, resource,
                ))

    return alerts
