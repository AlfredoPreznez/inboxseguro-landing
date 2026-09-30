import sys
from pathlib import Path

# Allow running as `python panel-contrib/tool_lead_summary/test_tool_lead_summary.py`
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tool_lead_summary.email_builder import DISCLAIMER, build_summary_email
from tool_lead_summary.service import (
    CONSENT_SUMMARY_VERSION,
    GENERIC_OK,
    ToolLeadService,
)
from tool_lead_summary.store import InMemoryLeadStore
from tool_lead_summary.validators import (
    normalize_domain,
    normalize_email,
    validate_domain,
    validate_email,
)


def sample_analysis(domain="inboxseguro.com"):
    return {
        "ok": True,
        "domain": domain,
        "count": 2,
        "systems": [
            {"id": "google_workspace", "name": "Google Workspace", "evidence": ["SPF", "DKIM"]},
            {"id": "amazon_ses", "name": "Amazon SES", "evidence": ["SPF"]},
        ],
        "signals": {"spf_exists": True, "dmarc_exists": True, "dmarc_policy": "quarantine"},
    }


class FakeMailer:
    def __init__(self):
        self.sent = []
        self.fail = False

    def __call__(self, payload):
        if self.fail:
            raise RuntimeError("smtp down")
        self.sent.append(payload)


def make_service(analysis=None, mailer=None, store=None):
    analysis = analysis or sample_analysis()
    mailer = mailer or FakeMailer()

    def analyze(domain):
        data = dict(analysis)
        data["domain"] = domain
        return data

    return ToolLeadService(
        analyze_sending_systems=analyze,
        send_email=mailer,
        store=store or InMemoryLeadStore(),
    ), mailer


def test_validators():
    assert normalize_email("  A@Empresa.COM ") == "a@empresa.com"
    assert normalize_domain("https://www.Empresa.com/path") == "empresa.com"
    assert validate_email("a@empresa.com")
    assert not validate_email("nope")
    assert validate_domain("empresa.com")
    assert not validate_domain("nota domain")


def test_valid_send():
    svc, mailer = make_service()
    status, body = svc.request_summary(
        email="ops@empresa.com",
        domain="empresa.com",
        tool_name="sending_systems",
        consent_summary=True,
        consent_marketing=False,
        client_ip="1.2.3.4",
        result_hint={"count": 99, "systems": [{"id": "spoof"}]},  # must be ignored
    )
    assert status == 200
    assert body == GENERIC_OK
    assert len(mailer.sent) == 1
    assert mailer.sent[0]["to"] == "ops@empresa.com"
    assert "Reply-To" in mailer.sent[0]["reply_to"] or "contacto@" in mailer.sent[0]["reply_to"]
    assert "Google Workspace" in mailer.sent[0]["text"]
    assert "spoof" not in mailer.sent[0]["text"]
    assert DISCLAIMER in mailer.sent[0]["text"]
    assert "diagnóstico completo" not in mailer.sent[0]["text"].lower()


def test_ignores_frontend_snapshot():
    svc, mailer = make_service(analysis=sample_analysis("real.com"))
    svc.request_summary(
        email="a@b.com",
        domain="real.com",
        tool_name="sending_systems",
        consent_summary=True,
        result_hint={"systems": [{"name": "FAKE VENDOR", "id": "fake"}]},
    )
    assert "FAKE VENDOR" not in mailer.sent[0]["html"]
    assert "Google Workspace" in mailer.sent[0]["html"]


def test_invalid_email_and_domain():
    svc, _ = make_service()
    status, _ = svc.request_summary(
        email="bad", domain="empresa.com", tool_name="sending_systems", consent_summary=True
    )
    assert status == 400
    status, _ = svc.request_summary(
        email="a@b.com", domain="bad", tool_name="sending_systems", consent_summary=True
    )
    assert status == 400


def test_consent_required_and_marketing_separate():
    svc, mailer = make_service()
    status, _ = svc.request_summary(
        email="a@b.com", domain="empresa.com", tool_name="sending_systems", consent_summary=False
    )
    assert status == 400
    assert mailer.sent == []

    store = InMemoryLeadStore()
    svc, mailer = make_service(store=store)
    status, _ = svc.request_summary(
        email="a@b.com",
        domain="empresa.com",
        tool_name="sending_systems",
        consent_summary=True,
        consent_marketing=True,
    )
    assert status == 200
    lead = list(store._by_id.values())[0]
    assert lead.consent_summary is True
    assert lead.consent_summary_version == CONSENT_SUMMARY_VERSION
    assert lead.consent_marketing is True
    assert lead.consent_marketing_version is not None


def test_dedupe_no_email_oracle():
    svc, mailer = make_service()
    args = dict(
        email="a@b.com",
        domain="empresa.com",
        tool_name="sending_systems",
        consent_summary=True,
        client_ip="9.9.9.9",
    )
    s1, b1 = svc.request_summary(**args)
    s2, b2 = svc.request_summary(**args)
    assert s1 == 200 and s2 == 200
    assert b1 == b2 == GENERIC_OK
    assert len(mailer.sent) == 1  # second is deduped, no resend


def test_rate_limit():
    store = InMemoryLeadStore()
    svc, mailer = make_service(store=store)
    for i in range(6):
        status, body = svc.request_summary(
            email=f"user{i}@empresa.com",
            domain="empresa.com",
            tool_name="sending_systems",
            consent_summary=True,
            client_ip="10.0.0.1",
        )
    # IP limit is 20; bump hits manually for email-focused check
    status, body = svc.request_summary(
        email="same@empresa.com",
        domain="empresa.com",
        tool_name="sending_systems",
        consent_summary=True,
        client_ip="10.0.0.8",
    )
    for _ in range(5):
        status, body = svc.request_summary(
            email="same@empresa.com",
            domain=f"d{_}.com" if _ else "empresa.com",
            tool_name="sending_systems",
            consent_summary=True,
            client_ip=f"10.0.0.{10+_}",
        )
    assert status == 429
    assert body["status"] == "rate_limited"


def test_backend_error():
    mailer = FakeMailer()
    mailer.fail = True
    svc, _ = make_service(mailer=mailer)
    status, body = svc.request_summary(
        email="a@b.com", domain="empresa.com", tool_name="sending_systems", consent_summary=True
    )
    assert status == 502
    assert body["ok"] is False


def test_email_contains_disclaimer_and_recommendations():
    email = build_summary_email(
        domain="empresa.com",
        systems=[{"id": "google_workspace", "name": "Google Workspace", "evidence": ["SPF"]}],
        signals={"spf_exists": True, "dmarc_exists": False, "dmarc_policy": None},
        unsubscribe_url="https://example.com/unsub?token=abc",
    )
    assert DISCLAIMER in email["text"]
    assert DISCLAIMER in email["html"]
    assert "Publica DMARC" in email["text"]
    assert "unsubscribe" in email["text"].lower() or "baja" in email["text"].lower()
    assert "diagnóstico completo" not in email["subject"].lower()


def test_unsubscribe():
    svc, _ = make_service()
    svc.request_summary(
        email="a@b.com", domain="empresa.com", tool_name="sending_systems", consent_summary=True, consent_marketing=True
    )
    lead = list(svc.store._by_id.values())[0]
    status, body = svc.unsubscribe(lead.unsubscribe_token)
    assert status == 200
    assert lead.consent_marketing is False
    assert lead.send_status == "unsubscribed"


if __name__ == "__main__":
    test_validators()
    test_valid_send()
    test_ignores_frontend_snapshot()
    test_invalid_email_and_domain()
    test_consent_required_and_marketing_separate()
    test_dedupe_no_email_oracle()
    test_rate_limit()
    test_backend_error()
    test_email_contains_disclaimer_and_recommendations()
    test_unsubscribe()
    print("OK: tool_lead_summary tests passed")
