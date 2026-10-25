#!/usr/bin/env python3
"""Sincroniza nav y footer canónicos desde index.html hacia el resto del sitio.

El bloque canónico incluye el wrapper <div data-nosnippet> (Google solo lo
honra en div/span/section; en nav/footer lo ignora).

Uso:
  python3 update_nav.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Marcadores preferidos; también aceptamos HTML previo sin marcadores.
NAV_MARKED_RE = re.compile(
    r"<!-- chrome:nav -->.*?<!-- /chrome:nav -->",
    re.DOTALL,
)
FOOTER_MARKED_RE = re.compile(
    r"<!-- chrome:footer -->.*?<!-- /chrome:footer -->",
    re.DOTALL,
)
# Nav principal del sitio (no breadcrumb <nav aria-label=...>).
NAV_LEGACY_RE = re.compile(
    r"<nav class=\"fixed w-full z-40[\s\S]*?</nav>",
    re.DOTALL,
)
FOOTER_LEGACY_RE = re.compile(
    r"<footer class=\"bg-slate-950[\s\S]*?</footer>",
    re.DOTALL,
)


def read_index() -> str:
    path = ROOT / "index.html"
    if not path.is_file():
        raise SystemExit(f"No existe {path}")
    return path.read_text(encoding="utf-8")


def extract_chrome_nav(index_html: str) -> str:
    m = NAV_MARKED_RE.search(index_html)
    if m:
        return m.group(0)
    m = NAV_LEGACY_RE.search(index_html)
    if not m:
        raise SystemExit("No se encontró el nav canónico en index.html")
    return (
        "<!-- chrome:nav -->\n"
        "    <div data-nosnippet>\n"
        f"    {m.group(0)}\n"
        "    </div>\n"
        "    <!-- /chrome:nav -->"
    )


def extract_chrome_footer(index_html: str) -> str:
    m = FOOTER_MARKED_RE.search(index_html)
    if m:
        return m.group(0)
    m = FOOTER_LEGACY_RE.search(index_html)
    if not m:
        raise SystemExit("No se encontró el footer canónico en index.html")
    return (
        "<!-- chrome:footer -->\n"
        "    <div data-nosnippet>\n"
        f"    {m.group(0)}\n"
        "    </div>\n"
        "    <!-- /chrome:footer -->"
    )


def replace_nav(content: str, new_nav: str) -> tuple[str, bool]:
    if NAV_MARKED_RE.search(content):
        return NAV_MARKED_RE.sub(new_nav, content, count=1), True
    if NAV_LEGACY_RE.search(content):
        # Si ya estaba envuelto sin marcadores, reemplazar wrapper+nav.
        wrapped = re.compile(
            r"<div data-nosnippet>\s*<nav class=\"fixed w-full z-40[\s\S]*?</nav>\s*</div>",
            re.DOTALL,
        )
        if wrapped.search(content):
            return wrapped.sub(new_nav, content, count=1), True
        return NAV_LEGACY_RE.sub(new_nav, content, count=1), True
    return content, False


def replace_footer(content: str, new_footer: str) -> tuple[str, bool]:
    if FOOTER_MARKED_RE.search(content):
        return FOOTER_MARKED_RE.sub(new_footer, content, count=1), True
    if FOOTER_LEGACY_RE.search(content):
        wrapped = re.compile(
            r"<div data-nosnippet>\s*<footer class=\"bg-slate-950[\s\S]*?</footer>\s*</div>",
            re.DOTALL,
        )
        if wrapped.search(content):
            return wrapped.sub(new_footer, content, count=1), True
        return FOOTER_LEGACY_RE.sub(new_footer, content, count=1), True
    return content, False


def iter_html_targets() -> list[Path]:
    targets: list[Path] = []
    for path in sorted(ROOT.glob("*.html")):
        if path.name == "index.html":
            continue
        targets.append(path)
    blog_root = ROOT / "blog"
    if blog_root.is_dir():
        targets.extend(sorted(blog_root.rglob("*.html")))
    glosario_root = ROOT / "glosario"
    if glosario_root.is_dir():
        targets.extend(sorted(glosario_root.rglob("*.html")))
    return targets


def sync_all(dry_run: bool = False) -> int:
    index_html = read_index()
    new_nav = extract_chrome_nav(index_html)
    new_footer = extract_chrome_footer(index_html)

    if "data-nosnippet" not in new_nav or "data-nosnippet" not in new_footer:
        raise SystemExit("El chrome canónico debe incluir data-nosnippet")

    updated = 0
    for path in iter_html_targets():
        content = path.read_text(encoding="utf-8")
        original = content
        content, nav_ok = replace_nav(content, new_nav)
        content, footer_ok = replace_footer(content, new_footer)
        if not nav_ok and not footer_ok:
            print(f"Skipping {path.relative_to(ROOT)} - sin nav/footer de sitio")
            continue
        if content != original:
            if not dry_run:
                path.write_text(content, encoding="utf-8")
            bits = []
            if nav_ok:
                bits.append("nav")
            if footer_ok:
                bits.append("footer")
            print(f"Updated {path.relative_to(ROOT)} ({', '.join(bits)})")
            updated += 1
        else:
            print(f"Unchanged {path.relative_to(ROOT)}")
    return updated


def main(argv: list[str]) -> int:
    dry = "--dry-run" in argv
    n = sync_all(dry_run=dry)
    print(f"\n{'Would update' if dry else 'Updated'} {n} file(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
