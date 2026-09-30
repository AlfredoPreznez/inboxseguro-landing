"""Build HTML + text summary emails from authoritative sending-systems data."""

from __future__ import annotations

from typing import Any, Dict, List


DISCLAIMER = (
    "Estas señales provienen de la configuración DNS pública del dominio "
    "(SPF, selectores DKIM conocidos y MX). No confirman que esos servicios "
    "estén enviando correo en este momento ni constituyen un inventario definitivo."
)


def _system_lines(systems: List[Dict[str, Any]]) -> List[str]:
    lines = []
    for system in systems:
        name = system.get("name") or system.get("id") or "Servicio reconocido"
        evidence = ", ".join(
            e for e in (system.get("evidence") or []) if e in ("SPF", "DKIM", "MX")
        ) or "señal pública"
        lines.append(f"- {name} (evidencia: {evidence})")
    if not lines:
        lines.append(
            "- No reconocimos proveedores habituales en las señales consultadas. "
            "Eso no demuestra que el dominio no envíe correo."
        )
    return lines


def _recommendations(systems: List[Dict[str, Any]], signals: Dict[str, Any]) -> List[str]:
    recs = [
        "Confirma internamente quién contrató o mantiene cada servicio listado y si sigue activo.",
        "Asigna un responsable por servicio de envío (marketing, ventas, finanzas, TI).",
        "Revisa si hay herramientas fantasma (Shadow IT) no autorizadas en el inventario real.",
    ]
    if not signals.get("spf_exists"):
        recs.append("Publica un SPF único y cerrado (~all o -all) cuando sepas qué servicios deben enviar.")
    if not signals.get("dmarc_exists"):
        recs.append("Publica DMARC al menos en p=none con rua para empezar a recibir reportes.")
    elif str(signals.get("dmarc_policy") or "").lower() == "none":
        recs.append(
            "Con p=none solo hay visibilidad. Escala a quarantine/reject cuando el inventario esté claro."
        )
    elif str(signals.get("dmarc_policy") or "").lower() == "quarantine":
        recs.append(
            "Tienes p=quarantine. Antes de pasar a reject, valida que no queden remitentes legítimos fuera."
        )
    mx_only = [
        s for s in systems
        if (s.get("evidence") or []) == ["MX"] or (
            "MX" in (s.get("evidence") or []) and "SPF" not in (s.get("evidence") or []) and "DKIM" not in (s.get("evidence") or [])
        )
    ]
    if mx_only:
        recs.append(
            "Algunos hallazgos solo tienen señal MX (recepción). No los trates como autorización de envío sin más evidencia."
        )
    if len(systems) >= 3:
        recs.append(
            "Con varios servicios reconocibles, conviene monitoreo continuo para ver cuáles envían de verdad."
        )
    return recs


def build_summary_email(
    *,
    domain: str,
    systems: List[Dict[str, Any]],
    signals: Dict[str, Any],
    unsubscribe_url: str,
    product_url: str = "https://www.inboxseguro.com/precios",
    reply_hint: str = "contacto@inboxseguro.com",
) -> Dict[str, str]:
    subject = f"Resumen de señales DNS para {domain}"
    system_lines = _system_lines(systems)
    recs = _recommendations(systems, signals)
    spf = "SPF detectado" if signals.get("spf_exists") else "SPF no detectado"
    dmarc = (
        f"DMARC: {signals.get('dmarc_policy')}"
        if signals.get("dmarc_exists")
        else "DMARC no detectado"
    )

    text = "\n".join(
        [
            f"Resumen de señales DNS públicas para {domain}",
            "",
            "Servicios / señales observadas:",
            *system_lines,
            "",
            f"Resumen técnico: {spf} · {dmarc}",
            "",
            DISCLAIMER,
            "",
            "Qué conviene verificar internamente:",
            *[f"- {r}" for r in recs],
            "",
            "Siguiente paso:",
            "Si quieres pasar de una fotografía DNS a inventario continuo, alertas y responsables,",
            f"revisa InboxSeguro: {product_url}",
            "",
            f"¿Dudas? Responde este correo o escribe a {reply_hint}.",
            "",
            f"Darte de baja de estos resúmenes: {unsubscribe_url}",
            "",
            "— InboxSeguro",
        ]
    )

    systems_html = "".join(f"<li>{line[2:]}</li>" for line in system_lines)
    recs_html = "".join(f"<li>{r}</li>" for r in recs)
    html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>{subject}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;max-width:640px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 16px;">Hola,</p>
  <p style="margin:0 0 16px;">Aquí tienes un <strong>resumen de señales DNS públicas</strong> para <strong>{domain}</strong>. No es un inventario de actividad real de envío.</p>
  <h2 style="font-size:18px;margin:24px 0 8px;">Servicios / señales observadas</h2>
  <ul style="margin:0 0 16px;padding-left:20px;">{systems_html}</ul>
  <p style="margin:0 0 16px;font-size:14px;color:#475569;">{spf} · {dmarc}</p>
  <p style="margin:0 0 16px;padding:12px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;font-size:14px;">{DISCLAIMER}</p>
  <h2 style="font-size:18px;margin:24px 0 8px;">Qué conviene verificar internamente</h2>
  <ul style="margin:0 0 16px;padding-left:20px;">{recs_html}</ul>
  <h2 style="font-size:18px;margin:24px 0 8px;">Siguiente paso</h2>
  <p style="margin:0 0 16px;">Si quieres pasar de una fotografía DNS a inventario continuo, alertas y responsables, revisa InboxSeguro.</p>
  <p style="margin:0 0 24px;"><a href="{product_url}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold;">Ver planes InboxSeguro</a></p>
  <p style="margin:0 0 8px;font-size:14px;">¿Dudas? Responde este correo o escribe a <a href="mailto:{reply_hint}">{reply_hint}</a>.</p>
  <p style="margin:24px 0 0;font-size:12px;color:#64748b;"><a href="{unsubscribe_url}">Darme de baja</a> de estos resúmenes · InboxSeguro</p>
</body></html>"""

    return {
        "subject": subject,
        "text": text,
        "html": html,
        "disclaimer": DISCLAIMER,
    }
