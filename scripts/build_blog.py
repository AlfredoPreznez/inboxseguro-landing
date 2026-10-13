#!/usr/bin/env python3
"""Build estático del blog + sitemap + feed RSS.

Requiere: pip install -r requirements-build.txt
Fuentes: _content/blog/*.md y _content/blog/_drafts/*.md
Salida: blog/index.html, blog/<slug>/index.html, blog/feed.xml, sitemap.xml

Los draft no se publican. Los .linkedin.md no se sirven ni se generan HTML.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import date, datetime
from email.utils import format_datetime
from pathlib import Path
from xml.sax.saxutils import escape

import markdown
import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from update_nav import extract_chrome_footer, extract_chrome_nav, read_index  # noqa: E402

SITE = "https://www.inboxseguro.com"
CONTENT_DIR = ROOT / "_content" / "blog"
DRAFTS_DIR = CONTENT_DIR / "_drafts"
BLOG_OUT = ROOT / "blog"
TEMPLATES = ROOT / "_templates"
DEFAULT_OG = f"{SITE}/og-image.png"

# Rutas públicas -> archivo fuente para lastmod vía git.
SITEMAP_STATIC: list[tuple[str, str, str, str]] = [
    # path, file, changefreq, priority
    ("/", "index.html", "weekly", "1.0"),
    ("/plataforma", "plataforma.html", "monthly", "0.9"),
    ("/precios", "precios.html", "monthly", "0.9"),
    ("/herramientas", "herramientas.html", "monthly", "0.9"),
    ("/quien-puede-enviar-correos", "quien-puede-enviar-correos.html", "monthly", "0.9"),
    ("/domain-checker", "domain-checker.html", "monthly", "0.85"),
    ("/spf-checker", "spf-checker.html", "monthly", "0.85"),
    ("/dmarc-checker", "dmarc-checker.html", "monthly", "0.85"),
    ("/dkim-checker", "dkim-checker.html", "monthly", "0.85"),
    ("/mx-lookup", "mx-lookup.html", "monthly", "0.85"),
    ("/seguridad-correo-proveedores", "seguridad-correo-proveedores.html", "monthly", "0.85"),
    ("/informe-higiene-correo-corporativo", "informe-higiene-correo-corporativo.html", "monthly", "0.85"),
    ("/control-envios-dominio", "control-envios-dominio.html", "monthly", "0.8"),
    ("/suplantacion-correo-empresa", "suplantacion-correo-empresa.html", "monthly", "0.8"),
    ("/dmarc-para-pymes", "dmarc-para-pymes.html", "monthly", "0.75"),
    ("/due-diligence-ciberseguridad-pyme", "due-diligence-ciberseguridad-pyme.html", "monthly", "0.75"),
    ("/como-funciona", "como-funciona.html", "monthly", "0.7"),
    ("/faq", "faq.html", "monthly", "0.65"),
    ("/contacto", "contacto.html", "monthly", "0.6"),
    ("/terminos", "terminos.html", "yearly", "0.2"),
    ("/privacidad", "privacidad.html", "yearly", "0.2"),
]


@dataclass
class Post:
    title: str
    slug: str
    description: str
    date: str
    updated: str
    tags: list[str]
    keyword_objetivo: str
    cover: str | None
    draft: bool
    body_md: str
    source_path: Path

    @property
    def date_display(self) -> str:
        return _format_es(self.date)

    @property
    def updated_display(self) -> str:
        return _format_es(self.updated or self.date)

    @property
    def public_path(self) -> str:
        return f"/blog/{self.slug}/"

    @property
    def public_url(self) -> str:
        return f"{SITE}{self.public_path}"


def _format_es(iso: str) -> str:
    try:
        d = date.fromisoformat(iso[:10])
    except ValueError:
        return iso
    months = (
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    )
    return f"{d.day} de {months[d.month - 1]} de {d.year}"


def _parse_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "si", "sí"}


def _split_front_matter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    meta = yaml.safe_load(parts[1]) or {}
    if not isinstance(meta, dict):
        raise ValueError("Front matter debe ser un mapa YAML")
    return meta, parts[2].lstrip("\n")


def load_posts() -> list[Post]:
    paths: list[Path] = []
    if CONTENT_DIR.is_dir():
        paths.extend(sorted(CONTENT_DIR.glob("*.md")))
    if DRAFTS_DIR.is_dir():
        paths.extend(sorted(DRAFTS_DIR.glob("*.md")))

    posts: list[Post] = []
    for path in paths:
        if path.name.lower() in {"readme.md", "readme"}:
            continue
        if path.name.endswith(".linkedin.md") or path.name.endswith(".linkedin"):
            continue
        if ".linkedin." in path.name:
            continue
        raw = path.read_text(encoding="utf-8")
        if not raw.lstrip().startswith("---"):
            print(f"Skipping {path.relative_to(ROOT)} (sin front matter)")
            continue
        meta, body = _split_front_matter(raw)
        slug = str(meta.get("slug") or path.stem).strip()
        draft = _parse_bool(meta.get("draft")) or path.parent.name == "_drafts"
        post = Post(
            title=str(meta.get("title") or "").strip(),
            slug=slug,
            description=str(meta.get("description") or "").strip(),
            date=str(meta.get("date") or "").strip()[:10],
            updated=str(meta.get("updated") or meta.get("date") or "").strip()[:10],
            tags=[str(t) for t in (meta.get("tags") or [])],
            keyword_objetivo=str(meta.get("keyword_objetivo") or "").strip(),
            cover=(str(meta["cover"]).strip() if meta.get("cover") else None),
            draft=draft,
            body_md=body,
            source_path=path,
        )
        if not post.title or not post.slug or not post.date:
            raise SystemExit(f"Post incompleto (title/slug/date): {path}")
        posts.append(post)
    return posts


def git_lastmod(*paths: Path) -> str:
    """Fecha YYYY-MM-DD del último commit que tocó alguno de los paths."""
    best: str | None = None
    for path in paths:
        if not path.exists():
            continue
        try:
            out = subprocess.check_output(
                ["git", "log", "-1", "--format=%cs", "--", str(path)],
                cwd=ROOT,
                text=True,
                stderr=subprocess.DEVNULL,
            ).strip()
        except subprocess.CalledProcessError:
            out = ""
        if out and (best is None or out > best):
            best = out
    if best:
        return best
    # Archivo nuevo sin commit: usar mtime local (solo para build; tras commit git manda).
    for path in paths:
        if path.exists():
            return datetime.fromtimestamp(path.stat().st_mtime).date().isoformat()
    return date.today().isoformat()


def render_markdown(body: str) -> str:
    return markdown.markdown(
        body,
        extensions=["extra", "sane_lists", "smarty"],
        output_format="html5",
    )


def _clip(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0]
    return cut + "…"


def build_html(posts_published: list[Post]) -> None:
    index_html = read_index()
    chrome_nav = extract_chrome_nav(index_html)
    chrome_footer = extract_chrome_footer(index_html)

    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES)),
        autoescape=select_autoescape(["html", "xml", "j2"]),
    )

    BLOG_OUT.mkdir(parents=True, exist_ok=True)

    # Limpiar HTML de posts previos que ya no estén publicados.
    keep = {"index.html", "feed.xml"}
    for child in list(BLOG_OUT.iterdir()):
        if child.is_dir() and (child / "index.html").is_file():
            if child.name not in {p.slug for p in posts_published}:
                (child / "index.html").unlink(missing_ok=True)
                try:
                    child.rmdir()
                except OSError:
                    pass

    # Listado
    sorted_posts = sorted(posts_published, key=lambda p: p.date, reverse=True)
    list_tpl = env.get_template("blog_index.html.j2")
    list_html = list_tpl.render(
        chrome_nav=chrome_nav,
        chrome_footer=chrome_footer,
        page_title=_clip("Blog de seguridad de correo | InboxSeguro", 60),
        meta_description=_clip(
            "Artículos prácticos sobre SPF, DKIM, DMARC y control de envíos para PYMEs en Chile y LATAM.",
            155,
        ),
        canonical_url=f"{SITE}/blog/",
        og_type="website",
        og_image=DEFAULT_OG,
        posts=sorted_posts,
    )
    (BLOG_OUT / "index.html").write_text(list_html, encoding="utf-8")

    post_tpl = env.get_template("blog_post.html.j2")
    for post in posts_published:
        title = _clip(f"{post.title} | InboxSeguro", 60)
        desc = _clip(post.description, 155)
        body_html = render_markdown(post.body_md)
        image = post.cover if post.cover and post.cover.startswith("http") else (
            f"{SITE}{post.cover}" if post.cover and post.cover.startswith("/") else DEFAULT_OG
        )
        blog_posting = {
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": post.title,
            "description": desc,
            "datePublished": post.date,
            "dateModified": post.updated or post.date,
            "author": {"@type": "Organization", "name": "InboxSeguro"},
            "publisher": {
                "@type": "Organization",
                "name": "InboxSeguro",
                "logo": {
                    "@type": "ImageObject",
                    "url": f"{SITE}/logo.png",
                },
            },
            "image": [image],
            "mainEntityOfPage": {"@type": "WebPage", "@id": post.public_url},
            "url": post.public_url,
        }
        breadcrumb = {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Inicio", "item": f"{SITE}/"},
                {"@type": "ListItem", "position": 2, "name": "Blog", "item": f"{SITE}/blog/"},
                {"@type": "ListItem", "position": 3, "name": post.title, "item": post.public_url},
            ],
        }
        html = post_tpl.render(
            chrome_nav=chrome_nav,
            chrome_footer=chrome_footer,
            page_title=title,
            meta_description=desc,
            canonical_url=post.public_url,
            og_type="article",
            og_image=image,
            post=post,
            body_html=body_html,
            blog_posting_json=json.dumps(blog_posting, ensure_ascii=False, indent=2),
            breadcrumb_json=json.dumps(breadcrumb, ensure_ascii=False, indent=2),
        )
        out_dir = BLOG_OUT / post.slug
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(html, encoding="utf-8")
        print(f"Wrote blog/{post.slug}/index.html")

    print(f"Wrote blog/index.html ({len(sorted_posts)} publicados)")


def build_feed(posts_published: list[Post]) -> None:
    items = []
    for post in sorted(posts_published, key=lambda p: p.date, reverse=True):
        pub = datetime.fromisoformat(post.date)
        items.append(
            "\n".join(
                [
                    "    <item>",
                    f"      <title>{escape(post.title)}</title>",
                    f"      <link>{escape(post.public_url)}</link>",
                    f"      <guid isPermaLink=\"true\">{escape(post.public_url)}</guid>",
                    f"      <pubDate>{escape(format_datetime(pub))}</pubDate>",
                    f"      <description>{escape(post.description)}</description>",
                    "    </item>",
                ]
            )
        )
    xml = "\n".join(
        [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<rss version="2.0">',
            "  <channel>",
            "    <title>Blog InboxSeguro</title>",
            f"    <link>{SITE}/blog/</link>",
            "    <description>Guías prácticas de seguridad de correo para PYMEs.</description>",
            "    <language>es-cl</language>",
            *items,
            "  </channel>",
            "</rss>",
            "",
        ]
    )
    BLOG_OUT.mkdir(parents=True, exist_ok=True)
    (BLOG_OUT / "feed.xml").write_text(xml, encoding="utf-8")
    print("Wrote blog/feed.xml")


def build_sitemap(posts_published: list[Post]) -> None:
    urls: list[tuple[str, str, str, str]] = []
    for path, file_name, freq, prio in SITEMAP_STATIC:
        lastmod = git_lastmod(ROOT / file_name)
        urls.append((f"{SITE}{path}", lastmod, freq, prio))

    blog_index_lastmod = git_lastmod(BLOG_OUT / "index.html", CONTENT_DIR)
    for post in posts_published:
        candidate = git_lastmod(post.source_path, BLOG_OUT / post.slug / "index.html")
        if candidate > blog_index_lastmod:
            blog_index_lastmod = candidate

    urls.append((f"{SITE}/blog/", blog_index_lastmod, "weekly", "0.8"))
    for post in sorted(posts_published, key=lambda p: p.slug):
        lastmod = git_lastmod(post.source_path, BLOG_OUT / post.slug / "index.html")
        # Preferir updated del front matter si es más reciente que git (archivo nuevo).
        if post.updated and post.updated > lastmod:
            lastmod = post.updated
        urls.append((post.public_url, lastmod, "monthly", "0.7"))

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        "",
    ]
    for loc, lastmod, freq, prio in urls:
        lines.extend(
            [
                "  <url>",
                f"    <loc>{escape(loc)}</loc>",
                f"    <lastmod>{escape(lastmod)}</lastmod>",
                f"    <changefreq>{freq}</changefreq>",
                f"    <priority>{prio}</priority>",
                "  </url>",
            ]
        )
    lines.extend(["", "</urlset>", ""])
    (ROOT / "sitemap.xml").write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote sitemap.xml ({len(urls)} URLs)")


def main() -> int:
    all_posts = load_posts()
    drafts = [p for p in all_posts if p.draft]
    published_raw = [p for p in all_posts if not p.draft]
    # Si el mismo slug aparece dos veces, gana el no-draft más reciente.
    by_slug: dict[str, Post] = {}
    for post in published_raw:
        prev = by_slug.get(post.slug)
        if prev is None or post.updated >= prev.updated:
            by_slug[post.slug] = post
    published = list(by_slug.values())
    print(f"Posts: {len(published)} publicados, {len(drafts)} draft (omitidos)")
    build_html(published)
    build_feed(published)
    build_sitemap(published)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
