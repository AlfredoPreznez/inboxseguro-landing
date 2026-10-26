#!/usr/bin/env python3
"""Compara clases Tailwind de HTML clave vs styles.css; reporta faltantes nuevas vs main."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = [
    "guias.html",
    "como-configurar-dkim-dmarc-google-workspace.html",
    "como-configurar-dkim-dmarc-microsoft-365.html",
    "como-configurar-dkim-dmarc-zoho-mail.html",
    "como-configurar-dkim-dmarc-shopify.html",
    "como-configurar-dkim-dmarc-hubspot.html",
    "como-configurar-dkim-dmarc-mailchimp.html",
    "index.html",
    "blog/index.html",
    "dmarc-checker.html",
    "spf-checker.html",
    "dkim-checker.html",
    "domain-checker.html",
    "mx-lookup.html",
    "verificar-lista-negra.html",
    "quien-puede-enviar-correos.html",
    "inboxscore.html",
]
CLASS_RE = re.compile(r'class="([^"]*)"')
TOKEN_RE = re.compile(r"[a-zA-Z_][a-zA-Z0-9_:/.-]*")
BASE_REF = "origin/main"


def extract_classes(html: str) -> set[str]:
    out: set[str] = set()
    for m in CLASS_RE.finditer(html):
        for tok in m.group(1).split():
            if TOKEN_RE.fullmatch(tok):
                out.add(tok)
    return out


def css_classes(css: str) -> set[str]:
    raw = set(re.findall(r"\.([a-zA-Z_][a-zA-Z0-9_-]*(?:\\:[a-zA-Z0-9_-]+)*)", css))
    return {c.replace("\\:", ":").replace("\\/", "/").replace("\\.", ".") for c in raw}


def missing_in(files_content: dict[str, str], avail: set[str]) -> set[str]:
    used: set[str] = set()
    for html in files_content.values():
        used |= extract_classes(html)
    return {c for c in used if c not in avail}


def main() -> int:
    avail = css_classes((ROOT / "styles.css").read_text(encoding="utf-8"))
    current: dict[str, str] = {}
    for rel in TARGETS:
        p = ROOT / rel
        if p.is_file():
            current[rel] = p.read_text(encoding="utf-8", errors="replace")
    main_files: dict[str, str] = {}
    for rel in TARGETS:
        try:
            main_files[rel] = subprocess.check_output(
                ["git", "show", f"{BASE_REF}:{rel}"],
                text=True,
                stderr=subprocess.DEVNULL,
            )
        except subprocess.CalledProcessError:
            pass
    miss_cur = missing_in(current, avail)
    miss_main = missing_in(main_files, avail)
    new_missing = miss_cur - miss_main
    print(f"Faltantes vs styles.css (branch): {len(miss_cur)}")
    print(f"Faltantes vs styles.css ({BASE_REF} existentes): {len(miss_main)}")
    print(f"Faltantes NUEVAS vs {BASE_REF}: {len(new_missing)}")
    if new_missing:
        for c in sorted(new_missing):
            print(f"  {c}")
        return 1
    print(f"OK: 0 faltantes nuevas respecto de {BASE_REF}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
