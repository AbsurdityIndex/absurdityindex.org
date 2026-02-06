"""Alert model for K8s monitoring."""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Severity(str, Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


@dataclass
class Alert:
    severity: Severity
    title: str
    message: str
    namespace: str = ""
    resource: str = ""
    dedup_key: str = ""
    timestamp: float = field(default_factory=time.time)
    id: int | None = None

    def __post_init__(self):
        if isinstance(self.severity, str):
            self.severity = Severity(self.severity)
        if not self.dedup_key:
            raw = f"{self.namespace}:{self.resource}:{self.title}"
            self.dedup_key = hashlib.sha256(raw.encode()).hexdigest()[:16]
