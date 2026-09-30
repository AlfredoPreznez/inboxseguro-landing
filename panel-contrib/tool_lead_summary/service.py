"""Tool lead summary service.

Backend is the source of truth: always recalculates signals via the existing
sending-systems analyzer (injected). Frontend snapshots are ignored.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any, Callable, Dict, Optional
import secrets
import uuid

from .email_builder import build_summary_email
from .store import InMemoryLeadStore, LeadRecord, utcnow
from .validators import (
    normalize_domain,
    normalize_email,
    validate_domain,
    validate_email,
    validate_tool_name,
)

CONSENT_SUMMARY_VERSION = "summary_email_v1"
CONSENT_MARKETING_VERSION = "marketing_opt_in_v1"
DEDUPE_WINDOW = timedelta(hours=48)
RATE_LIMIT_WINDOW = timedelta(hours=1)
MAX_HITS_PER_IP = 20
MAX_HITS_PER_EMAIL = 5

# Generic responses — do not reveal whether an email already exists.
GENERIC_OK = {
    "ok": True,
    "status": "accepted",
    "message": "Si el correo es válido, te enviaremos el resumen en breve.",
}
GENERIC_RATE_LIMIT = {
    "ok": False,
    "status": "rate_limited",
    "message": "Demasiadas solicitudes. Intenta nuevamente en unos minutos.",
}
GENERIC_INVALID = {
    "ok": False,
    "status": "invalid_request",
    "message": "No pudimos procesar la solicitud. Revisa el correo y el dominio.",
}
GENERIC_ERROR = {
    "ok": False,
    "status": "error",
    "message": "No pudimos enviar el resumen en este momento. Intenta más tarde.",
}


class ToolLeadService:
    def __init__(
        self,
        *,
        analyze_sending_systems: Callable[[str], Dict[str, Any]],
        send_email: Callable[[Dict[str, Any]], None],
        store: Optional[InMemoryLeadStore] = None,
        unsubscribe_base_url: str = "https://panel.inboxseguro.com/api/public/tool-lead-unsubscribe",
        reply_to: str = "Alfredo <contacto@inboxseguro.com>",
        from_email: str = "InboxSeguro <noreply@inboxseguro.com>",
        log_event: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    ) -> None:
        self.analyze_sending_systems = analyze_sending_systems
        self.send_email = send_email
        self.store = store or InMemoryLeadStore()
        self.unsubscribe_base_url = unsubscribe_base_url.rstrip("/")
        self.reply_to = reply_to
        self.from_email = from_email
        self.log_event = log_event or (lambda name, payload: None)

    def request_summary(
        self,
        *,
        email: str,
        domain: str,
        tool_name: str,
        consent_summary: bool,
        consent_marketing: bool = False,
        client_ip: str = "",
        # Intentionally unused: frontend context must not be authoritative.
        result_hint: Optional[Dict[str, Any]] = None,
    ) -> tuple[int, Dict[str, Any]]:
        del result_hint  # never trusted

        email_n = normalize_email(email)
        domain_n = normalize_domain(domain)
        tool = str(tool_name or "").strip()

        if not consent_summary:
            return 400, GENERIC_INVALID
        if not validate_email(email_n) or not validate_domain(domain_n) or not validate_tool_name(tool):
            return 400, GENERIC_INVALID

        ip_hits = self.store.count_ip_hits(client_ip, RATE_LIMIT_WINDOW)
        email_hits = self.store.count_email_hits(email_n, RATE_LIMIT_WINDOW)
        if ip_hits > MAX_HITS_PER_IP or email_hits > MAX_HITS_PER_EMAIL:
            self.log_event("lead_email_failed", {"reason": "rate_limit", "tool_name": tool})
            return 429, GENERIC_RATE_LIMIT

        recent = self.store.find_recent_dedupe(email_n, domain_n, tool, DEDUPE_WINDOW)
        if recent and recent.send_status == "sent":
            # Same generic OK — no email-existence oracle.
            self.log_event("lead_email_sent", {"reason": "deduped", "tool_name": tool})
            return 200, GENERIC_OK

        try:
            analysis = self.analyze_sending_systems(domain_n)
        except Exception:
            self.log_event("lead_email_failed", {"reason": "analysis_error", "tool_name": tool})
            return 502, GENERIC_ERROR

        if not analysis or not analysis.get("ok"):
            self.log_event("lead_email_failed", {"reason": "analysis_failed", "tool_name": tool})
            return 502, GENERIC_ERROR

        systems = list(analysis.get("systems") or [])
        signals = dict(analysis.get("signals") or {})
        # Persist only needed fields
        compact_systems = [
            {
                "id": s.get("id"),
                "name": s.get("name"),
                "evidence": [e for e in (s.get("evidence") or []) if e in ("SPF", "DKIM", "MX")],
            }
            for s in systems
        ]
        compact_signals = {
            "spf_exists": bool(signals.get("spf_exists")),
            "dmarc_exists": bool(signals.get("dmarc_exists")),
            "dmarc_policy": signals.get("dmarc_policy"),
        }

        token = secrets.token_urlsafe(24)
        lead = recent or LeadRecord(
            id=str(uuid.uuid4()),
            email=email_n,
            domain=domain_n,
            tool_name=tool,
            created_at=utcnow(),
            consent_summary=True,
            consent_summary_version=CONSENT_SUMMARY_VERSION,
            consent_marketing=bool(consent_marketing),
            consent_marketing_version=CONSENT_MARKETING_VERSION if consent_marketing else None,
            send_status="pending",
            signals=compact_signals,
            systems=compact_systems,
            unsubscribe_token=token,
        )
        if recent:
            lead.consent_marketing = bool(consent_marketing) or lead.consent_marketing
            if consent_marketing:
                lead.consent_marketing_version = CONSENT_MARKETING_VERSION
            lead.signals = compact_signals
            lead.systems = compact_systems
            lead.send_status = "pending"
        else:
            self.store.create(lead)

        unsubscribe_url = f"{self.unsubscribe_base_url}?token={lead.unsubscribe_token}"
        email_payload = build_summary_email(
            domain=domain_n,
            systems=compact_systems,
            signals=compact_signals,
            unsubscribe_url=unsubscribe_url,
        )

        try:
            self.send_email(
                {
                    "to": email_n,
                    "from": self.from_email,
                    "reply_to": self.reply_to,
                    "subject": email_payload["subject"],
                    "text": email_payload["text"],
                    "html": email_payload["html"],
                }
            )
        except Exception:
            lead.send_status = "failed"
            lead.send_error = "send_failed"
            self.store.update(lead)
            self.log_event("lead_email_failed", {"reason": "send_failed", "tool_name": tool})
            return 502, GENERIC_ERROR

        lead.send_status = "sent"
        lead.last_sent_at = utcnow()
        lead.send_error = None
        self.store.update(lead)
        self.log_event("lead_email_sent", {"reason": "sent", "tool_name": tool})
        return 200, GENERIC_OK

    def unsubscribe(self, token: str) -> tuple[int, Dict[str, Any]]:
        lead = self.store.get_by_unsubscribe_token(str(token or ""))
        # Always generic — no token oracle beyond success/fail soft message.
        if not lead:
            return 200, {"ok": True, "message": "Solicitud procesada."}
        lead.consent_marketing = False
        lead.consent_marketing_version = None
        lead.send_status = "unsubscribed"
        self.store.update(lead)
        return 200, {"ok": True, "message": "Solicitud procesada."}
