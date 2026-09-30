"""Lead storage interface. Panel can swap InMemoryLeadStore for SQLAlchemy/DB."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
import hashlib
import secrets


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class LeadRecord:
    id: str
    email: str
    domain: str
    tool_name: str
    created_at: datetime
    consent_summary: bool
    consent_summary_version: str
    consent_marketing: bool
    consent_marketing_version: Optional[str]
    send_status: str
    signals: dict
    systems: list
    unsubscribe_token: str
    last_sent_at: Optional[datetime] = None
    send_error: Optional[str] = None


class InMemoryLeadStore:
    def __init__(self) -> None:
        self._by_id: Dict[str, LeadRecord] = {}
        self._dedupe_index: Dict[str, str] = {}
        self._ip_hits: Dict[str, List[datetime]] = {}
        self._email_hits: Dict[str, List[datetime]] = {}

    @staticmethod
    def dedupe_key(email: str, domain: str, tool_name: str) -> str:
        raw = f"{email}|{domain}|{tool_name}".encode("utf-8")
        return hashlib.sha256(raw).hexdigest()

    def find_recent_dedupe(
        self, email: str, domain: str, tool_name: str, window: timedelta
    ) -> Optional[LeadRecord]:
        key = self.dedupe_key(email, domain, tool_name)
        lead_id = self._dedupe_index.get(key)
        if not lead_id:
            return None
        lead = self._by_id.get(lead_id)
        if not lead or not lead.last_sent_at:
            return None
        if utcnow() - lead.last_sent_at <= window:
            return lead
        return None

    def create(self, lead: LeadRecord) -> LeadRecord:
        self._by_id[lead.id] = lead
        self._dedupe_index[self.dedupe_key(lead.email, lead.domain, lead.tool_name)] = lead.id
        return lead

    def update(self, lead: LeadRecord) -> LeadRecord:
        self._by_id[lead.id] = lead
        self._dedupe_index[self.dedupe_key(lead.email, lead.domain, lead.tool_name)] = lead.id
        return lead

    def get_by_unsubscribe_token(self, token: str) -> Optional[LeadRecord]:
        for lead in self._by_id.values():
            if secrets.compare_digest(lead.unsubscribe_token, token):
                return lead
        return None

    def register_hit(self, bucket: Dict[str, List[datetime]], key: str, window: timedelta) -> int:
        now = utcnow()
        hits = [ts for ts in bucket.get(key, []) if now - ts <= window]
        hits.append(now)
        bucket[key] = hits
        return len(hits)

    def count_ip_hits(self, ip: str, window: timedelta) -> int:
        return self.register_hit(self._ip_hits, ip or "unknown", window)

    def count_email_hits(self, email: str, window: timedelta) -> int:
        return self.register_hit(self._email_hits, email, window)
