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
                if re.search(r"^draft:\s*true\b", header, re.MULTILINE | re.IGNORECASE):
                    continue
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

    # 2. Glosario Técnico (TERMS: name, definition, why, example_title, example, errors)
    if TERMS:
        out_lines.append("---")
        out_lines.append("")
        out_lines.append("## Glosario Técnico Completo de Correo y DNS")
        out_lines.append("")
        for term in TERMS:
            t_name = term.get("name") or term.get("slug", "")
            t_slug = term.get("slug", "")
            t_def = term.get("definition", "")
            t_why = term.get("why", "")
            t_extitle = term.get("example_title", "")
            t_ex = term.get("example", "")
            t_errors = term.get("errors", [])

            if not t_name:
                continue

            out_lines.append(f"### {t_name}")
            out_lines.append(f"- URL Canónica: https://www.inboxseguro.com/glosario/{t_slug}/")
            if t_def:
                out_lines.append(f"- Definición: {t_def}")
            if t_why:
                out_lines.append(f"\n{t_why}")
            if t_extitle and t_ex:
                out_lines.append(f"\n#### {t_extitle}")
                out_lines.append(f"\n{t_ex}")
            if t_errors:
                out_lines.append("\nErrores habituales:")
                for err in t_errors:
                    out_lines.append(f"- {err}")
            out_lines.append("")

    # 3. Guías de Configuración por Proveedor (GUIDES: h1 o provider, path, description, steps con name y text)
    if GUIDES:
        out_lines.append("---")
        out_lines.append("")
        out_lines.append("## Guías de Configuración Paso a Paso por Plataforma")
        out_lines.append("")
        for g in GUIDES:
            g_title = g.get("h1") or g.get("provider", "")
            g_path = g.get("path", "")
            g_desc = g.get("description", "")
            steps = g.get("steps", [])
            g_errors = g.get("errors", [])

            if not g_title or not g_path:
                continue

            out_lines.append(f"### {g_title}")
            out_lines.append(f"- URL Canónica: https://www.inboxseguro.com{g_path}")
            if g_desc:
                out_lines.append(f"- Resumen: {g_desc}")
            if steps:
                out_lines.append("\nPasos de configuración:")
                for step in steps:
                    s_name = step.get("name", "").strip()
                    s_text = step.get("text", "").strip()
                    if s_name:
                        out_lines.append(f"\n#### {s_name}")
                    if s_text:
                        out_lines.append(s_text)
            if g_errors:
                out_lines.append("\nErrores frecuentes:")
                for err in g_errors:
                    out_lines.append(f"- {err}")
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
            if not title:
                continue
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
            if not q:
                continue
            out_lines.append(f"### {q}")
            out_lines.append(f"{a}\n")

    output_path = ROOT / "llms-full.txt"
    output_path.write_text("\n".join(out_lines), encoding="utf-8")
    print(f"OK: Generado llms-full.txt ({output_path.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
