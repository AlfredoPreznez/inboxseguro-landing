"""
Flask blueprint ready to mount on panel.inboxseguro.com.

Integration sketch (panel app):

    from panel_contrib.tool_lead_summary.flask_route import create_tool_lead_blueprint
    from your_existing_module import analyze_domain_sending_systems, send_transactional_email

    app.register_blueprint(
        create_tool_lead_blueprint(
            analyze_sending_systems=analyze_domain_sending_systems,
            send_email=send_transactional_email,
        )
    )

`analyze_sending_systems(domain)` MUST reuse the same logic as
POST /api/public/sending-systems and return the same shape:
{ ok, domain, count, systems, signals }.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from flask import Blueprint, jsonify, request

from .service import ToolLeadService
from .store import InMemoryLeadStore


def create_tool_lead_blueprint(
    *,
    analyze_sending_systems: Callable[[str], Dict[str, Any]],
    send_email: Callable[[Dict[str, Any]], None],
    store: Optional[InMemoryLeadStore] = None,
    url_prefix: str = "/api/public",
) -> Blueprint:
    service = ToolLeadService(
        analyze_sending_systems=analyze_sending_systems,
        send_email=send_email,
        store=store,
    )
    bp = Blueprint("tool_lead_summary", __name__, url_prefix=url_prefix)

    def _cors(resp):
        origin = request.headers.get("Origin") or ""
        if origin in ("https://www.inboxseguro.com", "https://inboxseguro.com"):
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Vary"] = "Origin"
            resp.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
            resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return resp

    @bp.route("/tool-lead-summary", methods=["OPTIONS"])
    def tool_lead_options():
        return _cors(("", 204))

    @bp.route("/tool-lead-summary", methods=["POST"])
    def tool_lead_summary():
        data = request.get_json(silent=True) or {}
        status, body = service.request_summary(
            email=data.get("email", ""),
            domain=data.get("domain", ""),
            tool_name=data.get("tool_name", ""),
            consent_summary=bool(data.get("consent_summary")),
            consent_marketing=bool(data.get("consent_marketing")),
            client_ip=request.headers.get("CF-Connecting-IP")
            or request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or (request.remote_addr or ""),
            result_hint=data.get("result_hint"),
        )
        return _cors(jsonify(body)), status

    @bp.route("/tool-lead-unsubscribe", methods=["GET"])
    def tool_lead_unsubscribe():
        status, body = service.unsubscribe(request.args.get("token", ""))
        return jsonify(body), status

    return bp
