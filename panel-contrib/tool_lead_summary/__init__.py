"""Lead summary capture for free tools (panel integration package)."""

from .service import ToolLeadService, CONSENT_SUMMARY_VERSION
from .email_builder import build_summary_email

__all__ = [
    "ToolLeadService",
    "CONSENT_SUMMARY_VERSION",
    "build_summary_email",
]
