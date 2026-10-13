#!/usr/bin/env python3
"""Build estático del blog + sitemap + feed RSS.

Requiere: pip install -r requirements-build.txt
Fuentes: _content/blog/*.md y _content/blog/_drafts/*.md
Salida: blog/index.html, blog/<slug>/index.html, blog/feed.xml, sitemap.xml

Los draft no se publican. Los .linkedin.md no se sirven ni se generan HTML.

Categorías y paginación: el build tiene el soporte preparado, pero solo genera
páginas públicas cuando hay ≥3 posts por categoría o >9 posts (paginación).
Mientras no se cumplan, no se escriben esas rutas ni entran al sitemap.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass, field
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
COVERS_OUT = BLOG_OUT / "covers"
TEMPLATES = ROOT / "_templates"
DEFAULT_OG = f"{SITE}/og-image.png"
LOGO_PATH = ROOT / "logo.png"
FONTS_DIR = ROOT / "assets" / "fonts"
WORDS_PER_MINUTE = 220
POSTS_PER_PAGE = 9
CATEGORY_PAGE_MIN_POSTS = 3
PAGINATION_MIN_POSTS = 10  # >9

# Etiquetas de categoría conocidas (slug → nombre visible).
CATEGORY_LABELS = {
    "entregabilidad": "Entregabilidad",
    "dmarc": "DMARC",
    "spf": "SPF",
    "dkim": "DKIM",
    "gobernanza": "Gobernanza",
    "seguridad": "Seguridad",
    "guias": "Guías",
}

SITEMAP_STATIC: list[tuple[str, str, str, str]] = [
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
    excerpt: str
    date: str
    updated: str
    tags: list[str]
    category_slug: str
    category_label: str
    keyword_objetivo: str
    cover: str | None
    cover_path: str  # ruta pública, p. ej. /blog/covers/slug.png
    featured: bool
    draft: bool
    body_md: str
    source_path: Path
    reading_time_min: int = 1
    word_count: int = 0
    toc: list[dict] = field(default_factory=list)

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

    @property
    def cover_url(self) -> str:
        if self.cover:
            if self.cover.startswith("http"):
                return self.cover
            if self.cover.startswith("/"):
                return f"{SITE}{self.cover}"
            return f"{SITE}/{self.cover.lstrip('/')}"
        return f"{SITE}{self.cover_path}"

    @property
    def reading_label(self) -> str:
        n = max(1, self.reading_time_min)
        return f"{n} min de lectura"


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


def _slugify(text: str) -> str:
    text = text.strip().lower()
    repl = {
        "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ñ": "n", "ü": "u",
    }
    for a, b in repl.items():
        text = text.replace(a, b)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-") or "general"


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


def _word_count(md: str) -> int:
    plain = re.sub(r"[`*_>#\[\]()!-]", " ", md)
    plain = re.sub(r"https?://\S+", " ", plain)
    words = re.findall(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+", plain)
    return len(words)


def _reading_time_min(words: int) -> int:
    return max(1, math.ceil(words / WORDS_PER_MINUTE))


def _resolve_category(meta: dict, tags: list[str]) -> tuple[str, str]:
    raw = meta.get("category") or meta.get("categoria")
    if raw:
        label = str(raw).strip()
        slug = _slugify(label)
        return slug, CATEGORY_LABELS.get(slug, label)
    if tags:
        slug = _slugify(tags[0])
        return slug, CATEGORY_LABELS.get(slug, tags[0].strip().capitalize())
    return "guias", CATEGORY_LABELS["guias"]


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
        tags = [str(t).strip() for t in (meta.get("tags") or []) if str(t).strip()]
        cat_slug, cat_label = _resolve_category(meta, tags)
        description = str(meta.get("description") or "").strip()
        excerpt = str(meta.get("excerpt") or meta.get("extracto") or description).strip()
        words = _word_count(body)
        cover_override = str(meta["cover"]).strip() if meta.get("cover") else None
        cover_path = f"/blog/covers/{slug}.png"
        post = Post(
            title=str(meta.get("title") or "").strip(),
            slug=slug,
            description=description,
            excerpt=excerpt,
            date=str(meta.get("date") or "").strip()[:10],
            updated=str(meta.get("updated") or meta.get("date") or "").strip()[:10],
            tags=tags,
            category_slug=cat_slug,
            category_label=cat_label,
            keyword_objetivo=str(meta.get("keyword_objetivo") or "").strip(),
            cover=cover_override,
            cover_path=cover_path,
            featured=_parse_bool(meta.get("featured")),
            draft=draft,
            body_md=body,
            source_path=path,
            reading_time_min=_reading_time_min(words),
            word_count=words,
        )
        if not post.title or not post.slug or not post.date:
            raise SystemExit(f"Post incompleto (title/slug/date): {path}")
        posts.append(post)
    return posts


def git_lastmod(*paths: Path) -> str:
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
    for path in paths:
        if path.exists():
            return datetime.fromtimestamp(path.stat().st_mtime).date().isoformat()
    return date.today().isoformat()


def render_markdown(body: str) -> str:
    return markdown.markdown(
        body,
        extensions=["extra", "sane_lists", "smarty", "toc"],
        extension_configs={"toc": {"permalink": False, "toc_depth": "2-3"}},
        output_format="html5",
    )


def inject_heading_ids_and_toc(html: str) -> tuple[str, list[dict]]:
    """Añade id a h2/h3 y construye TOC (si hay ≥3 headings)."""
    toc: list[dict] = []
    used: set[str] = set()

    def repl(match: re.Match) -> str:
        level = match.group(1)
        attrs = match.group(2) or ""
        text = match.group(3)
        existing = re.search(r'id="([^"]+)"', attrs)
        if existing:
            hid = existing.group(1)
        else:
            base = _slugify(re.sub(r"<[^>]+>", "", text))
            hid = base
            i = 2
            while hid in used:
                hid = f"{base}-{i}"
                i += 1
            attrs = f'{attrs} id="{hid}"'.strip()
        used.add(hid)
        plain = re.sub(r"<[^>]+>", "", text).strip()
        toc.append({"level": int(level), "id": hid, "text": plain})
        return f"<h{level}{(' ' + attrs) if attrs else ''}>{text}</h{level}>"

    html = re.sub(
        r"<h([23])([^>]*)>(.*?)</h\1>",
        repl,
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if len(toc) < 3:
        return html, []
    return html, toc


def _clip(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0]
    return cut + "…"


def pick_featured(posts: list[Post]) -> Post | None:
    if not posts:
        return None
    marked = [p for p in posts if p.featured]
    if marked:
        return sorted(marked, key=lambda p: p.date, reverse=True)[0]
    return sorted(posts, key=lambda p: p.date, reverse=True)[0]


def group_by_category(posts: list[Post]) -> dict[str, list[Post]]:
    groups: dict[str, list[Post]] = defaultdict(list)
    for post in posts:
        groups[post.category_slug].append(post)
    return groups


def should_publish_category_pages(posts: list[Post]) -> dict[str, list[Post]]:
    """Solo categorías con ≥ CATEGORY_PAGE_MIN_POSTS posts."""
    return {
        slug: items
        for slug, items in group_by_category(posts).items()
        if len(items) >= CATEGORY_PAGE_MIN_POSTS
    }


def should_paginate(posts: list[Post]) -> bool:
    return len(posts) >= PAGINATION_MIN_POSTS


# ---------------------------------------------------------------------------
# Portadas (Pillow) — se activa cuando el módulo está disponible
# ---------------------------------------------------------------------------

def _cover_fingerprint(title: str, category_label: str, logo_path: Path) -> str:
    logo_hash = ""
    if logo_path.is_file():
        logo_hash = hashlib.sha256(logo_path.read_bytes()).hexdigest()[:16]
    payload = f"v1|{title}|{category_label}|{logo_hash}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]


def _find_inter_font() -> Path | None:
    candidates = [
        FONTS_DIR / "Inter-Bold.ttf",
        FONTS_DIR / "Inter-SemiBold.ttf",
        FONTS_DIR / "Inter.ttf",
        FONTS_DIR / "Inter-Regular.ttf",
    ]
    for path in candidates:
        if path.is_file():
            return path
    return None


def generate_cover_png(post: Post, force: bool = False) -> Path | None:
    """Genera portada 1200x630 si cambió título/categoría/logo. Retorna path local."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("Pillow no instalado: se omite generación de portadas")
        return None

    COVERS_OUT.mkdir(parents=True, exist_ok=True)
    out_file = COVERS_OUT / f"{post.slug}.png"
    meta_file = COVERS_OUT / f"{post.slug}.sha"
    fingerprint = _cover_fingerprint(post.title, post.category_label, LOGO_PATH)

    if (
        not force
        and out_file.is_file()
        and meta_file.is_file()
        and meta_file.read_text(encoding="utf-8").strip() == fingerprint
    ):
        return out_file

    width, height = 1200, 630
    img = Image.new("RGB", (width, height), "#0f172a")
    draw = ImageDraw.Draw(img)

    # Degradado simple azul oscuro → azul marca
    for y in range(height):
        t = y / (height - 1)
        r = int(15 + (37 - 15) * t)
        g = int(23 + (99 - 23) * t)
        b = int(42 + (235 - 42) * t * 0.55)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # Acento
    draw.rectangle([0, 0, 12, height], fill="#2563eb")

    font_path = _find_inter_font()
    if font_path:
        font_cat = ImageFont.truetype(str(font_path), 28)
        font_title = ImageFont.truetype(str(font_path), 54)
        font_brand = ImageFont.truetype(str(font_path), 22)
    else:
        font_cat = ImageFont.load_default()
        font_title = ImageFont.load_default()
        font_brand = ImageFont.load_default()

    # Logo
    logo_h = 56
    if LOGO_PATH.is_file():
        logo = Image.open(LOGO_PATH).convert("RGBA")
        ratio = logo_h / logo.height
        logo = logo.resize((max(1, int(logo.width * ratio)), logo_h), Image.Resampling.LANCZOS)
        img.paste(logo, (64, 48), logo)

    draw.text((64, 130), post.category_label.upper(), font=font_cat, fill="#93c5fd")

    # Título con wrap
    max_width = width - 128
    lines = _wrap_text(draw, post.title, font_title, max_width, max_lines=4)
    y = 180
    for line in lines:
        draw.text((64, y), line, font=font_title, fill="#ffffff")
        bbox = draw.textbbox((0, 0), line, font=font_title)
        y += (bbox[3] - bbox[1]) + 10

    draw.text((64, height - 72), "InboxSeguro", font=font_brand, fill="#cbd5e1")

    img.save(out_file, format="PNG", optimize=True)
    meta_file.write_text(fingerprint + "\n", encoding="utf-8")
    print(f"Wrote {out_file.relative_to(ROOT)}")
    return out_file


def _wrap_text(draw, text: str, font, max_width: int, max_lines: int = 4) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        trial = f"{current} {word}"
        bbox = draw.textbbox((0, 0), trial, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
            if len(lines) >= max_lines:
                break
    if len(lines) < max_lines:
        lines.append(current)
    elif lines:
        # Truncar última línea
        last = lines[-1]
        while last and draw.textbbox((0, 0), last + "…", font=font)[2] > max_width:
            last = last[:-1]
        lines[-1] = (last.rstrip() + "…") if last else "…"
    return lines[:max_lines]


def ensure_covers(posts: list[Post]) -> None:
    for post in posts:
        if post.cover:
            continue  # override manual
        generate_cover_png(post)


def build_html(posts_published: list[Post]) -> None:
    index_html = read_index()
    chrome_nav = extract_chrome_nav(index_html)
    chrome_footer = extract_chrome_footer(index_html)

    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES)),
        autoescape=select_autoescape(["html", "xml", "j2"]),
    )

    BLOG_OUT.mkdir(parents=True, exist_ok=True)
    ensure_covers(posts_published)

    sorted_posts = sorted(posts_published, key=lambda p: p.date, reverse=True)
    featured = pick_featured(sorted_posts)
    grid_posts = [p for p in sorted_posts if featured is None or p.slug != featured.slug]

    # Limpiar HTML de posts previos
    for child in list(BLOG_OUT.iterdir()):
        if child.is_dir() and child.name not in {"covers", "categoria", "pagina"}:
            if (child / "index.html").is_file() and child.name not in {p.slug for p in posts_published}:
                (child / "index.html").unlink(missing_ok=True)
                try:
                    child.rmdir()
                except OSError:
                    pass

    list_tpl = env.get_template("blog_index.html.j2")
    list_html = list_tpl.render(
        chrome_nav=chrome_nav,
        chrome_footer=chrome_footer,
        page_title=_clip("Blog de seguridad de correo | InboxSeguro", 60),
        meta_description=_clip(
            "Artículos prácticos sobre SPF, DKIM, DMARC y control de envíos para empresas en Chile y LATAM.",
            155,
        ),
        canonical_url=f"{SITE}/blog/",
        og_type="website",
        og_image=featured.cover_url if featured else DEFAULT_OG,
        posts=sorted_posts,
        featured=featured,
        grid_posts=grid_posts,
    )
    (BLOG_OUT / "index.html").write_text(list_html, encoding="utf-8")

    post_tpl = env.get_template("blog_post.html.j2")
    for post in posts_published:
        title = _clip(f"{post.title} | InboxSeguro", 60)
        desc = _clip(post.description, 155)
        body_html = render_markdown(post.body_md)
        body_html, toc = inject_heading_ids_and_toc(body_html)
        post.toc = toc
        image = post.cover_url
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
            toc=toc,
            blog_posting_json=json.dumps(blog_posting, ensure_ascii=False, indent=2),
            breadcrumb_json=json.dumps(breadcrumb, ensure_ascii=False, indent=2),
        )
        out_dir = BLOG_OUT / post.slug
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(html, encoding="utf-8")
        print(f"Wrote blog/{post.slug}/index.html")

    # Categorías / paginación: soporte listo, sin publicar aún
    publishable_cats = should_publish_category_pages(sorted_posts)
    if publishable_cats:
        print(f"Categorías publicables (≥{CATEGORY_PAGE_MIN_POSTS}): {list(publishable_cats)}")
        # Se implementará la escritura de HTML en el paso SEO (5).
    else:
        print(
            f"Categorías: soporte activo; no se generan páginas "
            f"(ninguna llega a {CATEGORY_PAGE_MIN_POSTS} posts)."
        )
    if should_paginate(sorted_posts):
        print(f"Paginación: {len(sorted_posts)} posts → se generaría (umbral {PAGINATION_MIN_POSTS}).")
    else:
        print(
            f"Paginación: soporte activo; no se generan páginas "
            f"({len(sorted_posts)} posts, umbral >9)."
        )

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
            "    <description>Guías prácticas de seguridad de correo para empresas.</description>",
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
        if post.updated and post.updated > lastmod:
            lastmod = post.updated
        urls.append((post.public_url, lastmod, "monthly", "0.7"))

    # Nota: categorías/paginación NO entran al sitemap hasta generarlas.

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
    by_slug: dict[str, Post] = {}
    for post in published_raw:
        prev = by_slug.get(post.slug)
        if prev is None or post.updated >= prev.updated:
            by_slug[post.slug] = post
    published = list(by_slug.values())
    print(f"Posts: {len(published)} publicados, {len(drafts)} draft (omitidos)")
    for p in published:
        print(
            f"  - {p.slug}: categoría={p.category_slug}, "
            f"{p.reading_time_min} min, {p.word_count} palabras"
        )
    build_html(published)
    build_feed(published)
    build_sitemap(published)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
