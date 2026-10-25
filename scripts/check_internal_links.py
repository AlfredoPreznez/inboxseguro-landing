#!/usr/bin/env python3
"""Comprueba href locales en HTML del sitio → reporta rotos (debe ser 0)."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
HREF_RE = re.compile(r"""href=["']([^"'#]+)""", re.IGNORECASE)

# Rutas conocidas sin archivo HTML (servidas por hosting / redirects).
ALLOW_MISSING = {
    "/login",  # externo panel; no aplica si es relativo
}


def resolve_local(href: str, from_file: Path) -> Path | None:
    """Devuelve Path esperado o None si no es local."""
    href = href.strip()
    if not href or href.startswith(("mailto:", "tel:", "javascript:", "data:")):
        return None
    parsed = urlparse(href)
    if parsed.scheme in ("http", "https"):
        host = (parsed.netloc or "").lower()
        if host and host not in ("www.inboxseguro.com", "inboxseguro.com"):
            return None
        path = parsed.path or "/"
    elif href.startswith("//"):
        return None
    else:
        path = href.split("?")[0].split("#")[0]
        if not path:
            return None
        if not path.startswith("/"):
            # relativo al archivo
            base = from_file.parent
            candidate = (base / path).resolve()
            try:
                candidate.relative_to(ROOT.resolve())
            except ValueError:
                return None
            return candidate
    path = unquote(path)
    if path in ALLOW_MISSING:
        return None
    if path.endswith("/"):
        return ROOT / path.lstrip("/") / "index.html"
    # /guias → guias.html; /glosario/ → glosario/index.html ya cubierto
    candidates = [
        ROOT / path.lstrip("/"),
        ROOT / f"{path.lstrip('/')}.html",
        ROOT / path.lstrip("/") / "index.html",
    ]
    for c in candidates:
        if c.is_file():
            return c
    # Prefer .html sibling for report
    return ROOT / f"{path.lstrip('/')}.html"


def main() -> int:
    broken: list[tuple[str, str, str]] = []
    checked = 0
    for html in sorted(ROOT.rglob("*.html")):
        if "node_modules" in html.parts:
            continue
        rel = html.relative_to(ROOT)
        text = html.read_text(encoding="utf-8", errors="replace")
        for m in HREF_RE.finditer(text):
            href = m.group(1)
            target = resolve_local(href, html)
            if target is None:
                continue
            checked += 1
            # Si resolve_local devolvió un path existente vía candidates, ok;
            # si no existe el Path preferido, re-check candidates.
            path_part = urlparse(href).path if "://" in href else href.split("?")[0].split("#")[0]
            if path_part.startswith("/") or "://" in href:
                p = unquote(urlparse(href).path if "://" in href else path_part)
                ok = False
                if p.endswith("/"):
                    ok = (ROOT / p.lstrip("/") / "index.html").is_file()
                else:
                    ok = any(
                        c.is_file()
                        for c in (
                            ROOT / p.lstrip("/"),
                            ROOT / f"{p.lstrip('/')}.html",
                            ROOT / p.lstrip("/") / "index.html",
                        )
                    )
                if not ok:
                    broken.append((str(rel), href, str(target.relative_to(ROOT))))
            else:
                if not target.is_file():
                    broken.append((str(rel), href, str(target)))

    print(f"Checked {checked} local hrefs in HTML under {ROOT}")
    if broken:
        print(f"BROKEN: {len(broken)}")
        for src, href, expect in broken[:50]:
            print(f"  {src}: {href} → missing {expect}")
        if len(broken) > 50:
            print(f"  … y {len(broken) - 50} más")
        return 1
    print("BROKEN: 0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
