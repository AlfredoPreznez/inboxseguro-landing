#!/usr/bin/env python3
"""Genera HTML estático de glosario y guías DNS."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from update_nav import extract_chrome_footer, extract_chrome_nav, read_index  # noqa: E402

SITE = "https://www.inboxseguro.com"

SCRIPTS = """
<script>
function toggleMobileMenu(){document.getElementById('mobileMenu').classList.toggle('hidden');document.getElementById('menuIconOpen').classList.toggle('hidden');document.getElementById('menuIconClose').classList.toggle('hidden');}
function closeMobileMenu(){document.getElementById('mobileMenu').classList.add('hidden');document.getElementById('menuIconOpen').classList.remove('hidden');document.getElementById('menuIconClose').classList.add('hidden');}
</script>
    <script src="/analytics-config.js"></script>
    <script src="/analytics-loader.js"></script>
    <script src="/seo-analytics.js" defer></script>
    <script src="/session-cta.js" defer></script>
"""

HEAD_ASSETS = """    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="/styles.css?v=1.0.8">
"""

PRE_CLASS = 'bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 overflow-x-auto'
PRE_STYLE = 'white-space: pre-wrap'


def clip(s: str, n: int) -> str:
    s = s.strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def page_shell(
    *,
    title: str,
    description: str,
    canonical: str,
    json_ld_blocks: list[dict],
    main_html: str,
    chrome_nav: str,
    chrome_footer: str,
) -> str:
    title = clip(title, 60)
    # Meta description: ≤160; no cortar con "…" — el contenido debe caber entero.
    if len(description) > 160:
        raise SystemExit(f"meta description >160 ({len(description)}): {description[:80]}…")
    description = description.strip()
    ld = "\n".join(
        f'<script type="application/ld+json">\n{json.dumps(block, ensure_ascii=False, indent=2)}\n</script>'
        for block in json_ld_blocks
    )
    return f"""<!DOCTYPE html>
<html lang="es" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <link rel="icon" type="image/png" href="/favicon.png">
    <meta name="description" content="{description}">
    <link rel="canonical" href="{canonical}">
    <meta name="robots" content="index, follow">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="InboxSeguro">
    <meta property="og:locale" content="es_CL">
    <meta property="og:url" content="{canonical}">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{description}">
    <meta property="og:image" content="{SITE}/og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{title}">
    <meta name="twitter:description" content="{description}">
    <meta name="twitter:image" content="{SITE}/og-image.png">
{HEAD_ASSETS}{ld}
</head>
<body class="bg-white text-slate-800 antialiased relative min-h-screen flex flex-col">
{chrome_nav}
<main class="flex-grow pt-24 lg:pt-32">
{main_html}
</main>
{chrome_footer}
{SCRIPTS}
</body>
</html>
"""


TERMS: list[dict] = [
    {
        "slug": "rbl",
        "name": "RBL (lista negra de correo)",
        "title": "RBL: lista negra de correo | InboxSeguro",
        "description": "Qué es una RBL (lista negra de correo), por qué importa a tu empresa y cómo revisar tu IP o dominio con el verificador gratuito de InboxSeguro.",
        "definition": "Una RBL (Realtime Blackhole List o lista negra de correo) es un listado público de direcciones IP o dominios asociados a envío abusivo o no deseado, consultado por servidores receptores antes de aceptar o clasificar un mensaje.",
        "why": "Si la IP o el dominio de envío de tu empresa aparecen en una RBL, los receptores pueden rechazar el correo, enviarlo a spam o bajar su prioridad. InboxSeguro monitorea de forma horaria seis RBL (Spamcop, Barracuda, PSBL, Mailspike, DroneBL y Backscatterer) y ofrece guía de remoción cuando hay listado.",
        "example_title": "Cómo se consulta una RBL (RFC 5782)",
        "example": "Las RBL no se publican en el DNS de tu dominio como SPF o DMARC. El receptor consulta el listado formando un nombre DNS: los octetos de la IP en orden inverso, seguidos de la zona de la lista.\n\nEjemplo: IP 203.0.113.10 → consulta 10.113.0.203.bl.ejemplo-rbl.net (RFC 5782).\n\nPara revisar tu dominio o IP puedes usar el verificador de listas negras de InboxSeguro.",
        "errors": [
            "Creer que «estar limpio» en una sola RBL basta: cada receptor usa listas distintas.",
            "Intentar salir del listado sin corregir la causa (compromiso, formulario abierto, rebotes mal manejados).",
            "Confundir RBL con cuarentena DMARC: son mecanismos distintos.",
        ],
        "tool_href": "/verificar-lista-negra",
        "tool_label": "Verificar listas negras (gratis)",
        "tool_cta": "Revisa si tu IP o dominio aparece en listas negras",
        "blog_href": "/blog/como-saber-si-mi-dominio-esta-en-lista-negra/",
        "blog_label": "Cómo saber si tu dominio está en lista negra",
        "sources": [
            ("RFC 5782 — DNS Blacklists and Whitelists", "https://www.rfc-editor.org/rfc/rfc5782.html"),
            ("Spamcop Blocking List", "https://www.spamcop.net/bl.shtml"),
        ],
    },
    {
        "slug": "registro-mx",
        "name": "Registro MX",
        "title": "Registro MX: qué es y ejemplo | InboxSeguro",
        "description": "Qué es el registro MX, ejemplo con ejemplo.cl según valores de Google Workspace y cómo verificarlo con MX Lookup gratis.",
        "definition": "Un registro MX (Mail Exchanger) es un registro DNS que indica el nombre de host que acepta correo para un dominio, junto con una prioridad numérica (menor número = mayor prioridad de intento).",
        "why": "Sin MX correcto, el correo entrante no llega a tu empresa (o llega al host equivocado). Un MX mal apuntado también afecta diagnósticos de entregabilidad y la coherencia con la autenticación del proveedor de correo.",
        "example_title": "Ejemplo MX para ejemplo.cl (Google Workspace)",
        "example": "Valores vigentes documentados por Google (cuentas nuevas desde 2023):\nejemplo.cl.  IN  MX  1  smtp.google.com.\n\nCuentas anteriores pueden usar el conjunto legacy ASPMX (p. ej. prioridad 1 ASPMX.L.GOOGLE.COM, etc.). Si el correo ya funciona con Google Workspace, no hace falta cambiar los MX.\n\nOtros proveedores entregan sus propios hosts y prioridades: usa siempre los que indique tu documentación.\n\nEl destino del MX debe ser un nombre de host con A/AAAA. Según RFC 2181 §10.3, el destino de un registro MX no puede ser un alias (CNAME).",
        "errors": [
            "Apuntar el MX a una IP en lugar de un hostname.",
            "Usar un CNAME como destino del MX (RFC 2181 §10.3).",
            "Dejar MX de un proveedor anterior tras migrar a otro (correo perdido o dividido).",
        ],
        "tool_href": "/mx-lookup",
        "tool_label": "MX Lookup (gratis)",
        "tool_cta": "Consulta los registros MX de tu dominio",
        "blog_href": "/blog/mis-correos-llegan-a-spam/",
        "blog_label": "Por qué tus correos llegan a spam",
        "sources": [
            ("RFC 5321 — SMTP (resolución MX)", "https://www.rfc-editor.org/rfc/rfc5321.html#section-5"),
            ("RFC 2181 §10.3 — destino MX no puede ser CNAME", "https://www.rfc-editor.org/rfc/rfc2181.html#section-10.3"),
            ("Google Workspace — Set up MX records", "https://knowledge.workspace.google.com/admin/domains/set-up-mx-records-for-google-workspace"),
        ],
    },
    {
        "slug": "bimi",
        "name": "BIMI",
        "title": "BIMI: logo verificado en correo | InboxSeguro",
        "description": "BIMI permite mostrar el logo de tu marca en clientes de correo compatibles. Requisitos DMARC, ejemplo de registro y fuentes oficiales.",
        "definition": "BIMI (Brand Indicators for Message Identification) es un mecanismo que permite a los receptores mostrar el logo de una marca en mensajes autenticados, cuando el dominio publica un registro BIMI y cumple requisitos de autenticación (en particular DMARC en aplicación).",
        "why": "Ayuda a que el destinatario reconozca mensajes legítimos de tu empresa. No sustituye SPF, DKIM ni DMARC: sin autenticación alineada y política DMARC en cuarentena o rechazo (con pct=100 cuando el proveedor lo exige para BIMI), el logo no se muestra.",
        "example_title": "Ejemplo de registro TXT BIMI para ejemplo.cl",
        "example": "default._bimi.ejemplo.cl.  IN  TXT  \"v=BIMI1; l=https://ejemplo.cl/logo-bimi.svg; a=https://ejemplo.cl/vmc.pem\"\n\nEl SVG debe cumplir el perfil que indica la guía BIMI / Google. El tag a= (certificado de marca) es opcional en el registro, pero muchos proveedores solo muestran el logo con VMC/CMC.",
        "errors": [
            "Publicar BIMI con DMARC en p=none (Google y BIMI Group exigen quarantine o reject).",
            "Usar un SVG que no cumple el perfil requerido.",
            "Creer que BIMI autentica el correo por sí solo.",
        ],
        "tool_href": "/dmarc-checker",
        "tool_label": "Verificar DMARC (gratis)",
        "tool_cta": "Verifica la política DMARC de tu dominio",
        "blog_href": "/blog/que-es-dmarc-como-activarlo/",
        "blog_label": "Qué es DMARC y cómo activarlo",
        "sources": [
            ("BIMI Group — Implementation Guide", "https://bimigroup.org/implementation-guide/"),
            ("Google Workspace — Set up BIMI", "https://knowledge.workspace.google.com/admin/security/set-up-bimi"),
        ],
    },
    {
        "slug": "mta-sts",
        "name": "MTA-STS",
        "title": "MTA-STS: TLS obligatorio en SMTP | InboxSeguro",
        "description": "MTA-STS declara que tu dominio exige SMTP sobre TLS verificado. Ejemplo de política, registro DNS y referencia a RFC 8461.",
        "definition": "MTA-STS (SMTP MTA Strict Transport Security) es un mecanismo (RFC 8461) con el que un dominio receptor declara que acepta SMTP sobre TLS con certificado válido y si los remitentes deben rechazar la entrega cuando no se pueda verificar esa seguridad.",
        "why": "Sin MTA-STS, el SMTP entre servidores suele usar TLS oportunista: un atacante en la ruta puede degradar o redirigir la sesión. MTA-STS protege el correo que otros envían hacia tu dominio (entrada), no reemplaza SPF/DKIM/DMARC de lo que tú envías.",
        "example_title": "Ejemplo para ejemplo.cl",
        "example": "DNS TXT:\n_mta-sts.ejemplo.cl.  IN  TXT  \"v=STSv1; id=20261025T120000\"\n\nPolítica HTTPS (sin redirecciones) en:\nhttps://mta-sts.ejemplo.cl/.well-known/mta-sts.txt\n\nversion: STSv1\nmode: testing\nmx: mx1.ejemplo.cl\nmx: mx2.ejemplo.cl\nmax_age: 604800\n\nEmpieza en mode: testing; pasa a enforce solo cuando la política y los certificados estén correctos.",
        "errors": [
            "Servir la política con redirección HTTP→HTTPS o a www (los remitentes no siguen redirects, RFC 8461).",
            "Certificado inválido o no emitido para mta-sts.ejemplo.cl.",
            "Lista mx: incompleta respecto a los MX reales del dominio.",
        ],
        "tool_href": "/mx-lookup",
        "tool_label": "MX Lookup (gratis)",
        "tool_cta": "Revisa los MX antes de publicar MTA-STS",
        "blog_href": "/blog/que-es-dmarc-como-activarlo/",
        "blog_label": "Qué es DMARC y cómo activarlo",
        "sources": [
            ("RFC 8461 — SMTP MTA Strict Transport Security", "https://www.rfc-editor.org/rfc/rfc8461.html"),
            ("Google Workspace — Create an MTA-STS policy", "https://knowledge.workspace.google.com/admin/gmail/advanced/create-an-mta-sts-policy"),
        ],
    },
    {
        "slug": "rua",
        "name": "RUA (reportes agregados DMARC)",
        "title": "RUA DMARC: reportes agregados | InboxSeguro",
        "description": "RUA es el destino de reportes agregados DMARC. Qué contiene, ejemplo de registro con ejemplo.cl y cómo usarlo en tu empresa.",
        "definition": "RUA (Reporting URI for Aggregate reports) es la etiqueta DMARC que indica a dónde enviar reportes agregados periódicos sobre resultados de autenticación (pases y fallas) para mensajes que usan tu dominio.",
        "why": "Sin la etiqueta rua, los receptores no deben generar reportes agregados (RFC 9989). Con rua publicas un destino para ver quién envía con tu dominio. InboxSeguro usa analítica semanal a partir de reportes DMARC; el registro DNS lo publicas tú en _dmarc.",
        "example_title": "Ejemplo de registro DMARC con RUA",
        "example": "_dmarc.ejemplo.cl.  IN  TXT  \"v=DMARC1; p=none; rua=mailto:dmarc-reports@ejemplo.cl\"\n\nSi el buzón de reportes está en otro dominio, ese dominio debe autorizar la recepción (RFC 9989 / RFC 9990).",
        "errors": [
            "Omitir rua y esperar reportes agregados de todos modos.",
            "Usar el correo personal del CEO: el volumen de reportes puede ser alto.",
            "Publicar dos registros DMARC distintos en el mismo dominio (el descubrimiento falla).",
        ],
        "tool_href": "/dmarc-checker",
        "tool_label": "Verificar DMARC (gratis)",
        "tool_cta": "Verifica la política DMARC de tu dominio",
        "blog_href": "/blog/que-es-dmarc-como-activarlo/",
        "blog_label": "Qué es DMARC y cómo activarlo",
        "sources": [
            ("RFC 9989 — DMARC (etiqueta rua)", "https://www.rfc-editor.org/rfc/rfc9989.html"),
            ("RFC 9990 — DMARC Aggregate Reporting", "https://www.rfc-editor.org/rfc/rfc9990.html"),
            ("Google Workspace — Set up DMARC", "https://knowledge.workspace.google.com/admin/security/set-up-dmarc"),
        ],
    },
    {
        "slug": "selector-dkim",
        "name": "Selector DKIM",
        "title": "Selector DKIM: qué es y ejemplo | InboxSeguro",
        "description": "El selector DKIM identifica qué clave pública usar al verificar la firma. Ejemplo con ejemplo.cl y verificación con el verificador DKIM.",
        "definition": "Un selector DKIM es un nombre corto que subdivide el espacio de claves públicas de un dominio; aparece en la cabecera DKIM-Signature como s= y determina la consulta DNS a selector._domainkey.dominio.",
        "why": "Permite rotar claves, usar varias firmas (correo corporativo vs. marketing) y delegar firma a un proveedor. Sin el selector correcto publicado, la firma no se puede verificar y DMARC puede fallar aunque la consola diga que DKIM está activo.",
        "example_title": "Ejemplo de clave pública DKIM",
        "example": "Nombre DNS: google._domainkey.ejemplo.cl\nTipo: TXT\nValor (forma): v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA…\n\nEn el mensaje, la firma incluye s=google; d=ejemplo.cl. Google Workspace recomienda el selector google por defecto (puede variar si ya está en uso).",
        "errors": [
            "Publicar la clave pero no activar la autenticación (Start authentication / Verify / Enable) en el proveedor.",
            "Truncar el valor TXT (p= incompleto) en el panel DNS.",
            "Buscar un selector inventado: DNS no lista selectores; hay que usar el s= real o el que da el proveedor.",
        ],
        "tool_href": "/dkim-checker",
        "tool_label": "Verificar DKIM (gratis)",
        "tool_cta": "Comprueba el selector DKIM de tu dominio",
        "blog_href": "/blog/como-verificar-dkim-de-tu-dominio/",
        "blog_label": "Cómo verificar DKIM de tu dominio",
        "sources": [
            ("RFC 6376 — DKIM Signatures (selectors)", "https://www.rfc-editor.org/rfc/rfc6376.html#section-3.1"),
            ("Google Workspace — Set up DKIM", "https://knowledge.workspace.google.com/admin/security/set-up-dkim"),
        ],
    },
    {
        "slug": "politica-dmarc",
        "name": "Política DMARC (none / quarantine / reject)",
        "title": "Política DMARC none quarantine reject | InboxSeguro",
        "description": "Qué significan p=none, p=quarantine y p=reject en DMARC. Cuarentena puede ir a spam; reject no se entrega. Fuentes RFC 9989 y proveedores.",
        "definition": "La política DMARC (etiqueta p=) indica a los receptores qué se sugiere hacer con mensajes que fallan la evaluación DMARC: none (sin acción especial), quarantine (tratar como sospechosos, p. ej. spam) o reject (no entregar / rechazar).",
        "why": "Define el nivel de protección de tu dominio frente a suplantación. Empezar en p=none permite observar con reportes; subir demasiado pronto puede afectar correo legítimo de CRM, facturación u otros remitentes aún no autenticados.",
        "example_title": "Ejemplos seguros para ejemplo.cl",
        "example": "Observación:\nv=DMARC1; p=none; rua=mailto:dmarc@ejemplo.cl\n\nCuarentena (práctica gradual documentada por proveedores):\nv=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc@ejemplo.cl\n\nRechazo (solo con reportes limpios):\nv=DMARC1; p=reject; rua=mailto:dmarc@ejemplo.cl\n\nSegún RFC 9989 y la ayuda de Google/Microsoft: quarantine suele marcar como spam; reject suele rechazar (rebote). Reject no equivale a «enviar a spam».\n\nNota sobre pct: el estándar actual (RFC 9989) eliminó pct (histórico) y usa t=y / t=n para modo de prueba. Google, Microsoft y Zoho aún documentan pct como práctica gradual en sus consolas.",
        "errors": [
            "Pasar a p=reject sin inventariar todos los remitentes legítimos.",
            "Interpretar p=reject como envío a spam.",
            "Publicar varios TXT DMARC en el mismo nombre (_dmarc).",
        ],
        "tool_href": "/dmarc-checker",
        "tool_label": "Verificar DMARC (gratis)",
        "tool_cta": "Verifica la política DMARC de tu dominio",
        "blog_href": "/blog/que-es-dmarc-como-activarlo/",
        "blog_label": "Qué es DMARC y cómo activarlo",
        "sources": [
            ("RFC 9989 — DMARC (política p= y t=)", "https://www.rfc-editor.org/rfc/rfc9989.html"),
            ("Google Workspace — Set up DMARC", "https://knowledge.workspace.google.com/admin/security/set-up-dmarc"),
            ("Microsoft Learn — Set up DMARC", "https://learn.microsoft.com/en-us/defender-office-365/email-authentication-dmarc-configure"),
        ],
    },
    {
        "slug": "alineacion-dmarc",
        "name": "Alineación DMARC",
        "title": "Alineación DMARC SPF y DKIM | InboxSeguro",
        "description": "La alineación DMARC exige que el dominio autenticado coincida con el De: visible. Modos relaxed/strict (aspf/adkim) con fuentes RFC 9989.",
        "definition": "La alineación DMARC es el requisito de que el dominio autenticado por SPF y/o DKIM coincida (de forma relajada o estricta) con el dominio del encabezado From: que ve el destinatario.",
        "why": "Un mensaje puede «pasar SPF» o «pasar DKIM» y aun así fallar DMARC si el dominio firmado o el MAIL FROM no alinean con el From: visible. Eso es habitual con reenvíos o herramientas de terceros mal configuradas.",
        "example_title": "Ejemplo con ejemplo.cl",
        "example": "Registro (relajado, valores por defecto):\nv=DMARC1; p=none; rua=mailto:dmarc@ejemplo.cl; adkim=r; aspf=r\n\n- SPF alineado (relajado): el dominio organizacional del MAIL FROM coincide con el del From: (p. ej. bounce.ejemplo.cl con From usuario@ejemplo.cl).\n- DKIM alineado (relajado): el d= de la firma es ejemplo.cl o un subdominio organizacional compatible.\n- Estricto (adkim=s / aspf=s): exige coincidencia exacta del FQDN (RFC 9989).",
        "errors": [
            "Activar alineación estricta sin necesidad y romper subdominios legítimos.",
            "Creer que SPF «pass» sin alineación basta para DMARC.",
            "Firmar DKIM con d= de un proveedor distinto al From: de la marca sin alineación.",
        ],
        "tool_href": "/dmarc-checker",
        "tool_label": "Verificar DMARC (gratis)",
        "tool_cta": "Verifica la política DMARC de tu dominio",
        "blog_href": "/blog/que-es-dmarc-como-activarlo/",
        "blog_label": "Qué es DMARC y cómo activarlo",
        "sources": [
            ("RFC 9989 — Identifier Alignment", "https://www.rfc-editor.org/rfc/rfc9989.html"),
            ("Google Workspace — Set up DMARC (alignment)", "https://knowledge.workspace.google.com/admin/security/set-up-dmarc"),
        ],
    },
]


def term_main(term: dict) -> str:
    errors = "".join(f'<li class="leading-relaxed">{e}</li>' for e in term["errors"])
    sources = "".join(
        f'<li><a href="{url}" class="text-brand-600 hover:underline" target="_blank" rel="noopener noreferrer">{label}</a></li>'
        for label, url in term["sources"]
    )
    return f"""
<section class="py-12 bg-slate-900 text-white">
  <div class="max-w-3xl mx-auto px-4">
    <nav aria-label="Breadcrumb" class="text-sm text-slate-400 mb-6">
      <ol class="flex flex-wrap gap-2 items-center">
        <li><a href="/" class="hover:text-white transition-colors">Inicio</a></li>
        <li aria-hidden="true">/</li>
        <li><a href="/glosario/" class="hover:text-white transition-colors">Glosario</a></li>
        <li aria-hidden="true">/</li>
        <li class="text-slate-200">{term["name"]}</li>
      </ol>
    </nav>
    <h1 class="text-3xl md:text-4xl font-extrabold mb-4">{term["name"]}</h1>
    <p class="text-lg text-slate-300 font-light leading-relaxed">{term["definition"]}</p>
  </div>
</section>
<section class="py-12 border-b border-slate-100">
  <div class="max-w-3xl mx-auto px-4 space-y-4">
    <h2 class="text-2xl font-bold text-slate-900">Por qué importa</h2>
    <p class="text-slate-600 leading-relaxed">{term["why"]}</p>
  </div>
</section>
<section class="py-12 border-b border-slate-100">
  <div class="max-w-3xl mx-auto px-4 space-y-4">
    <h2 class="text-2xl font-bold text-slate-900">{term["example_title"]}</h2>
    <pre class="{PRE_CLASS}" style="{PRE_STYLE}">{term["example"]}</pre>
  </div>
</section>
<section class="py-12 border-b border-slate-100">
  <div class="max-w-3xl mx-auto px-4 space-y-4">
    <h2 class="text-2xl font-bold text-slate-900">Errores comunes</h2>
    <ul class="list-disc list-inside space-y-2 text-slate-600">{errors}</ul>
  </div>
</section>
<section class="py-12 border-b border-slate-100">
  <div class="max-w-3xl mx-auto px-4 space-y-4">
    <h2 class="text-2xl font-bold text-slate-900">Herramienta y lectura relacionada</h2>
    <p class="text-slate-600 leading-relaxed">
      <a href="{term["tool_href"]}" class="text-brand-600 hover:underline font-semibold">{term["tool_label"]}</a>
      — {term["tool_cta"]}.
    </p>
    <p class="text-slate-600 leading-relaxed">
      Artículo:
      <a href="{term["blog_href"]}" class="text-brand-600 hover:underline">{term["blog_label"]}</a>.
    </p>
    <p class="text-slate-600 leading-relaxed">
      Volver al <a href="/glosario/" class="text-brand-600 hover:underline">índice del glosario</a>.
    </p>
  </div>
</section>
<section class="py-12 bg-slate-50">
  <div class="max-w-3xl mx-auto px-4 space-y-3">
    <h2 class="text-xl font-bold text-slate-900">Fuentes</h2>
    <ul class="list-disc list-inside space-y-2 text-sm text-slate-600">{sources}</ul>
  </div>
</section>
<section class="py-16 bg-slate-900 text-white text-center">
  <div class="max-w-2xl mx-auto px-4">
    <h2 class="text-2xl font-bold mb-4">{term["tool_cta"]}</h2>
    <p class="text-slate-300 mb-6">Herramienta de diagnóstico gratuita. La plataforma InboxSeguro es un servicio aparte de monitoreo y gobernanza.</p>
    <a href="{term["tool_href"]}" data-seo-event="checker_submit" class="inline-flex px-6 py-3 bg-brand-600 hover:bg-brand-700 rounded-xl font-bold">{term["tool_label"]}</a>
  </div>
</section>
"""


def index_main(terms: list[dict]) -> str:
    cards = "".join(
        f"""
        <a href="/glosario/{t["slug"]}/" class="block p-5 border border-slate-200 rounded-xl hover:border-brand-600 hover:bg-slate-50 transition-colors">
          <h2 class="text-lg font-bold text-slate-900 mb-2">{t["name"]}</h2>
          <p class="text-sm text-slate-600 leading-relaxed">{t["definition"][:140]}…</p>
        </a>"""
        for t in terms
    )
    guide_links = """
        <li><a href="/como-configurar-dkim-dmarc-google-workspace" class="text-brand-600 hover:underline">DKIM y DMARC en Google Workspace</a></li>
        <li><a href="/como-configurar-dkim-dmarc-microsoft-365" class="text-brand-600 hover:underline">DKIM y DMARC en Microsoft 365</a></li>
        <li><a href="/como-configurar-dkim-dmarc-zoho-mail" class="text-brand-600 hover:underline">DKIM y DMARC en Zoho Mail</a></li>
    """
    return f"""
<section class="py-12 bg-slate-900 text-white">
  <div class="max-w-3xl mx-auto px-4 text-center">
    <nav aria-label="Breadcrumb" class="text-sm text-slate-400 mb-6">
      <ol class="flex flex-wrap gap-2 items-center justify-center">
        <li><a href="/" class="hover:text-white transition-colors">Inicio</a></li>
        <li aria-hidden="true">/</li>
        <li class="text-slate-200">Glosario</li>
      </ol>
    </nav>
    <h1 class="text-3xl md:text-5xl font-extrabold mb-4">Glosario de correo y DNS</h1>
    <p class="text-lg text-slate-300 font-light max-w-2xl mx-auto">Definiciones verificables de RBL, MX, BIMI, MTA-STS, RUA, selector DKIM, política y alineación DMARC para responsables de empresas.</p>
  </div>
</section>
<section class="py-12 border-b border-slate-100">
  <div class="max-w-4xl mx-auto px-4 grid md:grid-cols-2 gap-4">{cards}</div>
</section>
<section class="py-12 bg-slate-50">
  <div class="max-w-3xl mx-auto px-4 space-y-4">
    <h2 class="text-2xl font-bold text-slate-900">Guías de configuración</h2>
    <ul class="list-disc list-inside space-y-2 text-slate-600">{guide_links}</ul>
    <p class="text-slate-600 leading-relaxed">También puedes leer <a href="/blog/que-es-dmarc-como-activarlo/" class="text-brand-600 hover:underline">qué es DMARC y cómo activarlo</a>.</p>
  </div>
</section>
"""


GUIDES: list[dict] = [
    {
        "file": "como-configurar-dkim-dmarc-google-workspace.html",
        "path": "/como-configurar-dkim-dmarc-google-workspace",
        "title": "DKIM y DMARC en Google Workspace | InboxSeguro",
        "h1": "Cómo configurar DKIM y DMARC en Google Workspace",
        "description": "Cómo activar DKIM y publicar DMARC en Google Workspace, verificar con herramientas gratis y avanzar de p=none a quarantine y reject.",
        "provider": "Google Workspace",
        "crumb": "Google Workspace",
        "docs": [
            ("Set up DKIM (Google Workspace Help)", "https://knowledge.workspace.google.com/admin/security/set-up-dkim"),
            ("Set up DMARC (Google Workspace Help)", "https://knowledge.workspace.google.com/admin/security/set-up-dmarc"),
        ],
        "steps": [
            {
                "name": "Espera tras activar Gmail (si aplica)",
                "text": "Tras activar Gmail para la organización, Google indica esperar 24–72 horas antes de generar la clave DKIM en la Admin console. Si generas antes, puedes ver error de registro no creado. La interfaz de la consola puede variar según versión.",
            },
            {
                "name": "Genera la clave DKIM en Admin console",
                "text": "Ingresa como superadministrador. Ve a Apps → Google Workspace → Gmail → Authenticate email. Elige el dominio y haz clic en Generate New Record. Preferencia: clave 2048 bits si tu DNS la admite; selector por defecto google (cámbialo solo si ya está en uso). Copia el nombre TXT (p. ej. google._domainkey) y el valor v=DKIM1; k=rsa; p=…. Aún no actives Start authentication. Tras Generate, la página Authenticate email puede mostrar hasta 48 horas el aviso de actualizar DNS aunque el registro ya esté bien.",
            },
            {
                "name": "Publica el TXT en tu DNS",
                "text": "En el proveedor DNS de ejemplo.cl crea el TXT con el host y valor que mostró Google. Algunos paneles agregan el dominio automáticamente: verifica que no quede duplicado (google._domainkey.ejemplo.cl.ejemplo.cl).",
            },
            {
                "name": "Activa la autenticación DKIM",
                "text": "Vuelve a Authenticate email y haz clic en Start authentication. El estado debería pasar a Authenticating email with DKIM. Google también indica que, tras agregar la clave, la autenticación puede tardar hasta 48 horas en empezar a funcionar.",
            },
            {
                "name": "Verifica DKIM con herramientas del sitio",
                "text": "Usa el verificador DKIM de InboxSeguro con el selector (p. ej. google). Opcional: envía un correo a una cuenta Gmail externa y revisa Show original → DKIM=pass (no sirve enviarte a ti mismo según Google).",
            },
            {
                "name": "Prepara buzón o grupo para reportes DMARC",
                "text": "Google recomienda un buzón o grupo dedicado para reportes (rua). No uses el correo personal diario: el volumen puede ser alto. Sin rua, los receptores no deben generar reportes agregados (RFC 9989).",
            },
            {
                "name": "Publica DMARC en p=none",
                "text": "DMARC no se «enciende» dentro de Gmail: se publica un TXT en _dmarc.ejemplo.cl. Ejemplo inicial: v=DMARC1; p=none; rua=mailto:dmarc@ejemplo.cl. Google recomienda SPF y/o DKIM activos y esperar ~48 horas tras SPF/DKIM antes de DMARC. Un solo registro DMARC por dominio.",
            },
            {
                "name": "Verifica la política DMARC y avanza por etapas",
                "text": "Comprueba la política p= con el verificador DMARC. Revisa reportes vía rua. Google documenta pct para un despliegue gradual (p. ej. p=quarantine; pct=25) aunque RFC 9989 eliminó pct del estándar y usa t=y/t=n. Solo con reportes limpios: p=reject. Quarantine puede ir a spam; reject suele no entregar (rebote).",
            },
        ],
        "errors": [
            "Generar DKIM antes de que Gmail esté listo (24–72 h).",
            "Truncar el valor p= en el TXT.",
            "Publicar DMARC sin autenticar herramientas de terceros que envían como tu dominio.",
            "Pasar a reject sin leer reportes agregados.",
        ],
        "note_console": "Las rutas del menú (Apps → Gmail → Authenticate email) pueden verse distintas según idioma y versión de la Admin console; prioriza la documentación oficial enlazada.",
    },
    {
        "file": "como-configurar-dkim-dmarc-microsoft-365.html",
        "path": "/como-configurar-dkim-dmarc-microsoft-365",
        "title": "DKIM y DMARC en Microsoft 365 | InboxSeguro",
        "h1": "Cómo configurar DKIM y DMARC en Microsoft 365",
        "description": "Guía basada en la documentación oficial de Microsoft Learn para DKIM (CNAME) y DMARC en Microsoft 365, verificación gratis y avance gradual de política.",
        "provider": "Microsoft 365",
        "crumb": "Microsoft 365",
        "docs": [
            ("Configure DKIM (Microsoft Learn)", "https://learn.microsoft.com/en-us/defender-office-365/email-authentication-dkim-configure"),
            ("Configure DMARC (Microsoft Learn)", "https://learn.microsoft.com/en-us/defender-office-365/email-authentication-dmarc-configure"),
            ("Configure SPF (Microsoft Learn)", "https://learn.microsoft.com/en-us/defender-office-365/email-authentication-spf-configure"),
        ],
        "steps": [
            {
                "name": "Orden recomendado: SPF, luego DKIM, luego DMARC",
                "text": "Microsoft recomienda autenticación SPF → DKIM → DMARC para cada dominio personalizado que envíe correo. SPF es la lista de orígenes autorizados en DNS; sigue la guía SPF de Microsoft Learn para tu dominio en ejemplo.cl.",
            },
            {
                "name": "Obtén los dos CNAME DKIM (antes del interruptor)",
                "text": "En el Microsoft Defender portal, Email authentication settings → DKIM, abre el dominio personalizado. Microsoft muestra (o puedes obtener con Get-DkimSigningConfig) dos hosts selector1._domainkey y selector2._domainkey. Para dominios personalizados nuevos desde mayo de 2025, el destino usa el formato …-v1.dkim.mail.microsoft (por ejemplo selector1-ejemplo-cl._domainkey.ejemplo.n-v1.dkim.mail.microsoft). Los dominios existentes suelen seguir con el formato hacia *.onmicrosoft.com. El formato antiguo y el nuevo no pueden coexistir para el mismo selector: publica solo los valores que Microsoft te muestra ahora.",
            },
            {
                "name": "Publica los CNAME en el DNS",
                "text": "En el DNS de ejemplo.cl crea exactamente esos dos CNAME. Espera unos minutos (o más) a que Microsoft 365 los detecte.",
            },
            {
                "name": "Activa la firma DKIM (interruptor Enabled)",
                "text": "Cuando los CNAME estén publicados, desliza el interruptor Sign messages for this domain with DKIM signatures a Enabled (o Set-DkimSigningConfig -Enabled $true). Si los CNAME faltan, el portal muestra error con los valores a publicar: no intentes dejar Enabled sin DNS. Cada subdominio que envíe correo necesita su propia configuración DKIM según Microsoft.",
            },
            {
                "name": "Verifica con el verificador DKIM",
                "text": "Usa el verificador DKIM de InboxSeguro con los selectores que Microsoft te indicó (no inventes el nombre).",
            },
            {
                "name": "Publica el TXT DMARC en _dmarc",
                "text": "Hostname _dmarc, valor inicial: v=DMARC1; p=none; rua=mailto:dmarc@ejemplo.cl. Microsoft documenta p=none para prueba, p=quarantine (aceptar pero marcar; a menudo spam/junk) y p=reject (típicamente descartar / no entregar). También documenta pct para despliegue gradual, aunque RFC 9989 lo marcó histórico.",
            },
            {
                "name": "Monitorea y endurece la política",
                "text": "Revisa reportes agregados (rua). Sube a quarantine y luego reject solo con fuentes legítimas alineadas. Verifica la política p= con el verificador DMARC.",
            },
        ],
        "errors": [
            "Intentar Enabled sin haber publicado los CNAME.",
            "Mezclar formato CNAME antiguo y nuevo para el mismo selector.",
            "Configurar solo el dominio raíz y olvidar subdominios que envían.",
            "Interpretar p=reject como «va a spam».",
            "Múltiples registros DMARC en el mismo nombre.",
        ],
        "note_console": "El portal Microsoft Defender / Exchange admin center cambia de nombre y menús; sigue la URL canónica de Microsoft Learn si la consola no coincide con capturas antiguas.",
    },
    {
        "file": "como-configurar-dkim-dmarc-zoho-mail.html",
        "path": "/como-configurar-dkim-dmarc-zoho-mail",
        "title": "DKIM y DMARC en Zoho Mail | InboxSeguro",
        "h1": "Cómo configurar DKIM y DMARC en Zoho Mail",
        "description": "Cómo activar DKIM y publicar DMARC en Zoho Mail, verificar con herramientas gratis y avanzar de p=none a quarantine y reject sin cortar correo.",
        "provider": "Zoho Mail",
        "crumb": "Zoho Mail",
        "docs": [
            ("DKIM Configuration (Zoho Mail Help)", "https://www.zoho.com/mail/help/adminconsole/dkim-configuration.html"),
            ("DMARC policy (Zoho Mail Help)", "https://www.zoho.com/mail/help/adminconsole/dmarc-policy.html"),
        ],
        "steps": [
            {
                "name": "Genera el selector DKIM en Admin Console",
                "text": "Inicia sesión como administrador o superadministrador. Domains → dominio → Email Configuration → DKIM → Add. Elige un selector (p. ej. zoho) y longitud 1024 o 2048 bits. Copia el valor TXT generado. No hagas clic en Verify hasta publicar el DNS.",
            },
            {
                "name": "Crea el TXT en DNS",
                "text": "Nombre típico: zoho._domainkey.ejemplo.cl (o zoho._domainkey si el panel agrega el dominio solo). Pega el valor completo. Zoho advierte que GoDaddy/Wix/Namecheap, etc., suelen anexar el dominio automáticamente.",
            },
            {
                "name": "Verifica y habilita DKIM en Zoho",
                "text": "En Admin Console, Verify el selector. Cuando esté verificado, Enable DKIM para firmar el correo saliente del dominio.",
            },
            {
                "name": "Comprueba con el verificador DKIM del sitio",
                "text": "Ingresa ejemplo.cl y el selector (zoho u otro) en el verificador DKIM de InboxSeguro.",
            },
            {
                "name": "Genera DMARC en Zoho (fase 1: none)",
                "text": "Zoho exige SPF y DKIM antes de publicar DMARC. En Email Configuration → DMARC elige «Do nothing» (Phase 1 / p=none), indica direcciones de reportes agregados (y forenses si aplica), genera el TXT y publícalo en _dmarc.ejemplo.cl. Un solo registro DMARC. Sin rua, los receptores no deben generar reportes agregados (RFC 9989).",
            },
            {
                "name": "Verifica la política DMARC y avanza Phase 2 y 3",
                "text": "Usa el verificador DMARC para leer p=. Tras revisar reportes y autorizar terceros, pasa a Quarantine (Phase 2) y luego Reject (Phase 3). Zoho documenta Policy percentage (pct); por defecto 100 si no se indica, aunque RFC 9989 eliminó pct del estándar. Quarantine puede ir a spam; reject no entrega.",
            },
        ],
        "errors": [
            "Hacer clic en Verify en Zoho antes de que el TXT sea visible en DNS.",
            "Publicar DMARC estricto mientras un CRM envía sin DKIM/SPF alineados (Zoho lo advierte).",
            "Duplicar el nombre del dominio en el host TXT.",
            "Varios registros DMARC (error permanente de procesamiento).",
        ],
        "note_console": "La Admin Console de Zoho Mail puede mostrar pestañas distintas según plan e idioma; la estructura Domains → Email Configuration → DKIM/DMARC es la documentada oficialmente.",
    },
]


def guide_main(g: dict) -> str:
    steps_html = "".join(
        f"""
        <li class="leading-relaxed">
          <strong class="text-slate-900">{i}. {step["name"]}</strong>
          <p class="mt-2 text-slate-600">{step["text"]}</p>
        </li>"""
        for i, step in enumerate(g["steps"], 1)
    )
    docs = "".join(
        f'<li><a href="{url}" class="text-brand-600 hover:underline" target="_blank" rel="noopener noreferrer">{label}</a></li>'
        for label, url in g["docs"]
    )
    errors = "".join(f'<li class="leading-relaxed">{e}</li>' for e in g["errors"])
    g["_howto_steps"] = [
        {"@type": "HowToStep", "position": i, "name": s["name"], "text": s["text"]}
        for i, s in enumerate(g["steps"], 1)
    ]
    return f"""
<section class="py-12 bg-slate-900 text-white">
  <div class="max-w-3xl mx-auto px-4">
    <nav aria-label="Breadcrumb" class="text-sm text-slate-400 mb-6">
      <ol class="flex flex-wrap gap-2 items-center">
        <li><a href="/" class="hover:text-white transition-colors">Inicio</a></li>
        <li aria-hidden="true">/</li>
        <li class="text-slate-200">{g["crumb"]}</li>
      </ol>
    </nav>
    <h1 class="text-3xl md:text-4xl font-extrabold mb-4">{g["h1"]}</h1>
    <p class="text-lg text-slate-300 font-light leading-relaxed">Guía basada en la documentación oficial de {g["provider"]}. Verifica cada cambio con las herramientas de diagnóstico gratuitas de InboxSeguro.</p>
  </div>
</section>
<section class="py-12 border-b border-slate-100">
  <div class="max-w-3xl mx-auto px-4 space-y-4">
    <h2 class="text-2xl font-bold text-slate-900">Antes de empezar</h2>
    <p class="text-slate-600 leading-relaxed">Necesitas acceso de administrador al DNS del dominio (p. ej. ejemplo.cl) y a la consola de {g["provider"]}. Lee también <a href="/blog/que-es-dmarc-como-activarlo/" class="text-brand-600 hover:underline">qué es DMARC y cómo activarlo</a> y los términos <a href="/glosario/politica-dmarc/" class="text-brand-600 hover:underline">política DMARC</a> y <a href="/glosario/selector-dkim/" class="text-brand-600 hover:underline">selector DKIM</a>.</p>
    <p class="text-sm text-slate-500 leading-relaxed">{g["note_console"]}</p>
  </div>
</section>
<section class="py-12 border-b border-slate-100">
  <div class="max-w-3xl mx-auto px-4 space-y-4">
    <h2 class="text-2xl font-bold text-slate-900">Pasos numerados</h2>
    <ol class="list-none space-y-6">{steps_html}</ol>
  </div>
</section>
<section class="py-12 border-b border-slate-100">
  <div class="max-w-3xl mx-auto px-4 space-y-4">
    <h2 class="text-2xl font-bold text-slate-900">Cómo verificar con herramientas del sitio</h2>
    <ul class="list-disc list-inside space-y-2 text-slate-600">
      <li><a href="/dkim-checker" class="text-brand-600 hover:underline">Verificador DKIM</a> — confirma el selector publicado.</li>
      <li><a href="/dmarc-checker" class="text-brand-600 hover:underline">Verificador DMARC</a> — verifica la política DMARC (p=) de tu dominio.</li>
      <li><a href="/domain-checker" class="text-brand-600 hover:underline">Chequeo de seguridad del correo</a> — vista conjunta SPF/DKIM/DMARC.</li>
    </ul>
  </div>
</section>
<section class="py-12 border-b border-slate-100">
  <div class="max-w-3xl mx-auto px-4 space-y-4">
    <h2 class="text-2xl font-bold text-slate-900">Avance none → quarantine → reject</h2>
    <ol class="list-decimal list-inside space-y-3 text-slate-600 leading-relaxed">
      <li><code>p=none</code>: observa reportes; no cambia la entrega por política DMARC.</li>
      <li><code>p=quarantine</code>: los fallos pueden ir a spam/cuarentena del receptor. Google, Microsoft y Zoho aún documentan <code>pct</code> para aplicar la política a un porcentaje; el estándar actual (RFC 9989) eliminó <code>pct</code> y usa <code>t=y</code>/<code>t=n</code>.</li>
      <li><code>p=reject</code>: los fallos no se entregan (rebote/descarte). No equivale a «enviar a spam».</li>
    </ol>
    <p class="text-slate-600 leading-relaxed">InboxSeguro ofrece guía gradual DMARC, monitoreo de DNS (SPF/DKIM/DMARC/BIMI/MTA-STS/RUA) con alertas de cambios no autorizados, detección de suplantación y analítica semanal desde reportes DMARC.</p>
  </div>
</section>
<section class="py-12 border-b border-slate-100">
  <div class="max-w-3xl mx-auto px-4 space-y-4">
    <h2 class="text-2xl font-bold text-slate-900">Errores frecuentes</h2>
    <ul class="list-disc list-inside space-y-2 text-slate-600">{errors}</ul>
  </div>
</section>
<section class="py-12 bg-slate-50">
  <div class="max-w-3xl mx-auto px-4 space-y-3">
    <h2 class="text-xl font-bold text-slate-900">Fuentes oficiales</h2>
    <ul class="list-disc list-inside space-y-2 text-sm text-slate-600">{docs}</ul>
    <ul class="list-disc list-inside space-y-2 text-sm text-slate-600 mt-2">
      <li><a href="https://www.rfc-editor.org/rfc/rfc9989.html" class="text-brand-600 hover:underline" target="_blank" rel="noopener noreferrer">RFC 9989 — DMARC</a></li>
      <li><a href="https://www.rfc-editor.org/rfc/rfc9990.html" class="text-brand-600 hover:underline" target="_blank" rel="noopener noreferrer">RFC 9990 — Aggregate Reporting</a></li>
      <li><a href="https://www.rfc-editor.org/rfc/rfc9991.html" class="text-brand-600 hover:underline" target="_blank" rel="noopener noreferrer">RFC 9991 — Failure Reporting</a></li>
      <li><a href="https://www.rfc-editor.org/rfc/rfc6376.html" class="text-brand-600 hover:underline" target="_blank" rel="noopener noreferrer">RFC 6376 — DKIM</a></li>
    </ul>
  </div>
</section>
<section class="py-16 bg-slate-900 text-white text-center">
  <div class="max-w-2xl mx-auto px-4">
    <h2 class="text-2xl font-bold mb-4">Verifica tu dominio ahora</h2>
    <p class="text-slate-300 mb-6">Las herramientas de diagnóstico son gratuitas. Revisa DKIM y la política DMARC tras cada cambio DNS.</p>
    <div class="flex flex-col sm:flex-row gap-3 justify-center">
      <a href="/dkim-checker" data-seo-event="checker_submit" class="px-6 py-3 bg-brand-600 hover:bg-brand-700 rounded-xl font-bold">Verificar DKIM</a>
      <a href="/dmarc-checker" data-seo-event="checker_submit" class="px-6 py-3 bg-white/10 border border-white/20 rounded-xl font-semibold">Verificar política DMARC</a>
    </div>
  </div>
</section>
"""


def main() -> None:
    index_html = read_index()
    chrome_nav = extract_chrome_nav(index_html)
    chrome_footer = extract_chrome_footer(index_html)

    glosario_dir = ROOT / "glosario"
    glosario_dir.mkdir(parents=True, exist_ok=True)
    idx_url = f"{SITE}/glosario/"
    idx_ld = [
        {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": "Glosario de correo y DNS",
            "url": idx_url,
            "description": "Definiciones de RBL, MX, BIMI, MTA-STS, RUA, selector DKIM, política y alineación DMARC.",
            "isPartOf": {"@type": "WebSite", "name": "InboxSeguro", "url": f"{SITE}/"},
        },
        {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Inicio", "item": f"{SITE}/"},
                {"@type": "ListItem", "position": 2, "name": "Glosario", "item": idx_url},
            ],
        },
    ]
    (glosario_dir / "index.html").write_text(
        page_shell(
            title="Glosario de correo y DNS | InboxSeguro",
            description="Definiciones claras de RBL, MX, BIMI, MTA-STS, RUA, selector DKIM, política DMARC y alineación para empresas.",
            canonical=idx_url,
            json_ld_blocks=idx_ld,
            main_html=index_main(TERMS),
            chrome_nav=chrome_nav,
            chrome_footer=chrome_footer,
        ),
        encoding="utf-8",
    )
    print("Wrote glosario/index.html")

    for term in TERMS:
        term_dir = glosario_dir / term["slug"]
        term_dir.mkdir(parents=True, exist_ok=True)
        url = f"{SITE}/glosario/{term['slug']}/"
        ld = [
            {
                "@context": "https://schema.org",
                "@type": "DefinedTerm",
                "name": term["name"],
                "description": term["definition"],
                "url": url,
                "inDefinedTermSet": idx_url,
            },
            {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Inicio", "item": f"{SITE}/"},
                    {"@type": "ListItem", "position": 2, "name": "Glosario", "item": idx_url},
                    {"@type": "ListItem", "position": 3, "name": term["name"], "item": url},
                ],
            },
        ]
        (term_dir / "index.html").write_text(
            page_shell(
                title=term["title"],
                description=term["description"],
                canonical=url,
                json_ld_blocks=ld,
                main_html=term_main(term),
                chrome_nav=chrome_nav,
                chrome_footer=chrome_footer,
            ),
            encoding="utf-8",
        )
        print(f"Wrote glosario/{term['slug']}/index.html")

    for g in GUIDES:
        main_html = guide_main(g)
        url = f"{SITE}{g['path']}"
        ld = [
            {
                "@context": "https://schema.org",
                "@type": "HowTo",
                "name": g["h1"],
                "description": g["description"],
                "url": url,
                "step": g["_howto_steps"],
            },
            {
                "@context": "https://schema.org",
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Inicio", "item": f"{SITE}/"},
                    {"@type": "ListItem", "position": 2, "name": g["crumb"], "item": url},
                ],
            },
        ]
        (ROOT / g["file"]).write_text(
            page_shell(
                title=g["title"],
                description=g["description"],
                canonical=url,
                json_ld_blocks=ld,
                main_html=main_html,
                chrome_nav=chrome_nav,
                chrome_footer=chrome_footer,
            ),
            encoding="utf-8",
        )
        print(f"Wrote {g['file']}")


if __name__ == "__main__":
    main()
