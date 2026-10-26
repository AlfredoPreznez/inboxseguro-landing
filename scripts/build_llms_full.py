#!/usr/bin/env python3
"""Compila llms-full.txt a partir de contenido ya publicado en el repositorio.

Fuentes utilizadas (100% contenido existente):
- llms.txt (resumen de la plataforma, herramientas y límites)
- _content/blog/*.md (artículos técnicos completos)
- scripts/generate_glosario_guias.py (TERMS de glosario y GUIDES por plataforma)
- faq.html (preguntas frecuentes oficiales)

Uso: python3 scripts/build_llms_full.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

try:
    from generate_glosario_guias import GUIDES, TERMS  # type: ignore
except ImportError:
    TERMS = []
    GUIDES = []


def extract_faqs_from_html(html_path: Path) -> list[tuple[str, str]]:
    if not html_path.exists():
        return []
    content = html_path.read_text(encoding="utf-8")
    match = re.search(
        r'<script type="application/ld\+json">\s*({[\s\S]*?"@type":\s*"FAQPage"[\s\S]*?})\s*</script>',
        content,
    )
    faqs: list[tuple[str, str]] = []
    if match:
        try:
            data = json.loads(match.group(1))
            for item in data.get("mainEntity", []):
                q = item.get("name", "").strip()
                a = item.get("acceptedAnswer", {}).get("text", "").strip()
                if q and a:
                    faqs.append((q, a))
            if faqs:
                return faqs
        except Exception:
            pass
    items = re.findall(
        r'<h[34][^>]*>(.*?)</h[34]>\s*<p[^>]*>(.*?)</p>', content, re.DOTALL
    )
    for q, a in items:
        clean_q = re.sub(r"<[^>]+>", "", q).strip()
        clean_a = re.sub(r"<[^>]+>", "", a).strip()
        if clean_q and clean_a:
            faqs.append((clean_q, clean_a))
    return faqs


def extract_blog_posts(blog_dir: Path) -> list[tuple[str, str, str]]:
    posts: list[tuple[str, str, str]] = []
    if not blog_dir.exists():
        return posts
    for md_file in sorted(blog_dir.glob("*.md")):
        if md_file.name == "README.md":
            continue
        text = md_file.read_text(encoding="utf-8")
        if text.startswith("---"):
            parts = text.split("---", 2)
            if len(parts) >= 3:
                header = parts[1]
                body = parts[2].strip()
                title_match = re.search(r"^title:\s*(.+)$", header, re.MULTILINE)
                title = title_match.group(1).strip(" \"'") if title_match else md_file.stem
                slug = md_file.stem
                posts.append((title, slug, body))
                continue
        title = md_file.stem.replace("-", " ").capitalize()
        posts.append((title, md_file.stem, text.strip()))
    return posts


def main() -> int:
    llms_path = ROOT / "llms.txt"
    if not llms_path.exists():
        print("Error: llms.txt no encontrado")
        return 1

    llms_base = llms_path.read_text(encoding="utf-8")

    out_lines: list[str] = []
    out_lines.append("# InboxSeguro - Documentación Técnica Completa (llms-full.txt)")
    out_lines.append("")
    out_lines.append("> Este documento compila la totalidad de la documentación pública, definiciones de glosario, guías de configuración y artículos técnicos de InboxSeguro.")
    out_lines.append("> Fuente canónica: https://www.inboxseguro.com/")
    out_lines.append("")

    # 1. Base llms.txt
    out_lines.append("---")
    out_lines.append("")
    out_lines.append(llms_base.strip())
    out_lines.append("")

    # 2. Glosario Técnico
    if TERMS:
        out_lines.append("---")
        out_lines.append("")
        out_lines.append("## Glosario Técnico Completo de Correo y DNS")
        out_lines.append("")
        for term in TERMS:
            t_title = term.get("term", "")
            t_slug = term.get("slug", "")
            t_desc = term.get("description", "")
            t_p1 = term.get("p1", "")
            t_p2 = term.get("p2", "")
            out_lines.append(f"### {t_title}")
            out_lines.append(f"- URL Canónica: https://www.inboxseguro.com/glosario/{t_slug}/")
            if t_desc:
                out_lines.append(f"- Definición: {t_desc}")
            if t_p1:
                out_lines.append(f"\n{t_p1}")
            if t_p2:
                out_lines.append(f"\n{t_p2}")
            code_block = term.get("code", "")
            if code_block:
                out_lines.append(f"\n```text\n{code_block}\n```")
            out_lines.append("")

    # 3. Guías de Configuración por Proveedor
    if GUIDES:
        out_lines.append("---")
        out_lines.append("")
        out_lines.append("## Guías de Configuración Paso a Paso por Plataforma")
        out_lines.append("")
        for g in GUIDES:
            g_title = g.get("platform", "")
            g_file = g.get("filename", "")
            g_desc = g.get("description", "")
            out_lines.append(f"### {g_title}")
            out_lines.append(f"- URL Canónica: https://www.inboxseguro.com/{g_file.replace('.html', '')}")
            out_lines.append(f"- Resumen: {g_desc}")
            pasos = g.get("steps", [])
            if pasos:
                out_lines.append("\nPasos de configuración:")
                for step in pasos:
                    s_t = step.get("title", "")
                    s_b = step.get("body", "")
                    s_c = step.get("code", "")
                    out_lines.append(f"\n#### {s_t}")
                    out_lines.append(s_b)
                    if s_c:
                        out_lines.append(f"\n```text\n{s_c}\n```")
            out_lines.append("")

    # 4. Artículos Técnicos del Blog
    blog_dir = ROOT / "_content" / "blog"
    blog_posts = extract_blog_posts(blog_dir)
    if blog_posts:
        out_lines.append("---")
        out_lines.append("")
        out_lines.append("## Artículos Técnicos de Soporte y Diagnóstico (Blog)")
        out_lines.append("")
        for title, slug, body in blog_posts:
            out_lines.append(f"### {title}")
            out_lines.append(f"- URL Canónica: https://www.inboxseguro.com/blog/{slug}/")
            out_lines.append("")
            out_lines.append(body)
            out_lines.append("")

    # 5. Preguntas Frecuentes
    faq_path = ROOT / "faq.html"
    faqs = extract_faqs_from_html(faq_path)
    if faqs:
        out_lines.append("---")
        out_lines.append("")
        out_lines.append("## Preguntas Frecuentes de la Plataforma")
        out_lines.append("")
        for q, a in faqs:
            out_lines.append(f"### {q}")
            out_lines.append(f"{a}\n")

    output_path = ROOT / "llms-full.txt"
    output_path.write_text("\n".join(out_lines), encoding="utf-8")
    print(f"OK: Generado llms-full.txt ({output_path.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
