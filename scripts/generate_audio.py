#!/usr/bin/env python3
"""Genera audio de artículos del blog con Amazon Polly (SSML).

Uso:
  AWS_PROFILE=tu-perfil python3 scripts/generate_audio.py --slug mis-correos-llegan-a-spam
  python3 scripts/generate_audio.py --dry-run --slug mis-correos-llegan-a-spam
  python3 scripts/generate_audio.py --all

Sin credenciales AWS el build no falla: omite y avisa.
IAM mínimo: polly:SynthesizeSpeech
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "_content" / "blog"
BLOG_OUT = ROOT / "blog"
LEXICON_PATH = Path(__file__).resolve().parent / "polly_lexicon.yaml"

# --- Configuración Polly (cambiar solo aquí) ---
POLLY_ENGINE = "generative"
POLLY_VOICE_ID = "Pedro"
POLLY_LANGUAGE_CODE = "es-US"
POLLY_SAMPLE_RATE = "24000"
POLLY_REGION = "us-east-1"
POLLY_PROSODY_RATE = "95%"
BREAK_SECTION_MS = 500
BREAK_PARAGRAPH_MS = 300

# SynthesizeSpeech: máx. 3000 facturables / 6000 totales (SSML no cuenta).
# Margen conservador por fragmento (mismo límite documentado para generative).
MAX_BILLED_CHARS_PER_REQUEST = 2500

# Tarifa generative (USD / millón de caracteres), fuera de free tier.
GENERATIVE_USD_PER_MILLION = 30.0

AUDIO_META_VERSION = "audio-v1"
POLICY_SPOKEN = {
    "p=none": "pe igual none",
    "p=quarantine": "pe igual quarantine",
    "p=reject": "pe igual reject",
}
DNS_TOKEN_RE = re.compile(
    r"\b(v=spf1|include:|p=none|p=quarantine|p=reject|redirect=|exp=)\S*",
    re.I,
)
FENCE_RE = re.compile(r"```.*?```", re.S)
INLINE_CODE_RE = re.compile(r"`([^`]+)`")
LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")
IMAGE_RE = re.compile(r"!\[([^\]]*)\]\([^)]+\)")
HEADING_RE = re.compile(r"^(#{2,3})\s+(.+)$")
LIST_RE = re.compile(r"^(\s*)([-*+]|\d+\.)\s+(.+)$")
TABLE_LINE_RE = re.compile(r"^\s*\|.*\|\s*$")
HTML_TABLE_RE = re.compile(r"<table\b[\s\S]*?</table>", re.I)

# --- Normalización para lectura (no altera el texto visible del artículo) ---
URL_RE = re.compile(r"\s*(?:https?://|www\.)\S+")
SEPARATOR_RE = re.compile(r"\s*·\s*")
# Números con punto de miles (24.768, 3.046.598.558). No toca 5.7.515 ni IPs.
NUM_DOTS_RE = re.compile(r"(?<![\d.])\b\d{1,3}(?:\.\d{3})+\b(?![.,]\d)")
USD_RE = re.compile(r"\bUSD\s+(\d{1,3}(?:\.\d{3})+|\d+)\b(?![.,]\d)")
DATE_DMY_RE = re.compile(r"(?<![\w-])(\d{1,2})-(\d{1,2})-(\d{4})(?![\w-])")
PAGE_RE = re.compile(r"(?<!\w)(pp?)\.\s*(\d+)(?:\s*-\s*(\d+))?")
SPOKEN_TLDS = {"cl": "ce ele", "com": "com", "org": "org", "net": "net", "gov": "gov", "io": "i o"}
_TLD_ALT = "|".join(sorted(SPOKEN_TLDS, key=len, reverse=True))
EMAIL_RE = re.compile(rf"(?<![\w.+-])([\w.+-]+)@((?:[\w-]+\.)+(?:{_TLD_ALT}))(?![\w-])", re.I)
DOMAIN_RE = re.compile(rf"(?<![\w@.-])((?:[A-Za-z0-9][\w-]*\.)+(?:{_TLD_ALT}))(?![\w-]|\.\w)", re.I)
EMPH_STAR_RE = re.compile(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])")
EMPH_UNDERSCORE_RE = re.compile(r"(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])")
CODE_FALLBACK_SPOKEN = "el ejemplo que se muestra en la página"
CARDINAL_MARK = "\x01"
ALIAS_MARK = "\x02"
MESES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)


@dataclass
class Lexicon:
    version: int
    say_as_characters: list[str]
    sub_alias: dict[str, str]
    skip_sections: dict[str, str] = field(default_factory=dict)


@dataclass
class AudioMeta:
    fingerprint: str
    engine: str
    voice: str
    language: str
    lexicon_version: int
    billed_chars: int
    duration_sec: int
    bytes: int
    cost_usd_est: float

    def to_json(self) -> str:
        return json.dumps(
            {
                "version": AUDIO_META_VERSION,
                "fingerprint": self.fingerprint,
                "engine": self.engine,
                "voice": self.voice,
                "language": self.language,
                "lexicon_version": self.lexicon_version,
                "billed_chars": self.billed_chars,
                "duration_sec": self.duration_sec,
                "bytes": self.bytes,
                "cost_usd_est": self.cost_usd_est,
            },
            ensure_ascii=False,
            indent=2,
        ) + "\n"

    @staticmethod
    def from_path(path: Path) -> AudioMeta | None:
        if not path.is_file():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        if not isinstance(data, dict) or not data.get("fingerprint"):
            return None
        return AudioMeta(
            fingerprint=str(data["fingerprint"]),
            engine=str(data.get("engine") or ""),
            voice=str(data.get("voice") or ""),
            language=str(data.get("language") or ""),
            lexicon_version=int(data.get("lexicon_version") or 0),
            billed_chars=int(data.get("billed_chars") or 0),
            duration_sec=int(data.get("duration_sec") or 0),
            bytes=int(data.get("bytes") or 0),
            cost_usd_est=float(data.get("cost_usd_est") or 0),
        )


def load_lexicon(path: Path = LEXICON_PATH) -> Lexicon:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    say = [str(x).strip() for x in (raw.get("say_as_characters") or []) if str(x).strip()]
    subs = {
        str(k): str(v)
        for k, v in (raw.get("sub_alias") or {}).items()
        if str(k).strip() and str(v).strip()
    }
    skips = {
        str(k).strip().lower(): str(v).strip()
        for k, v in (raw.get("skip_sections") or {}).items()
        if str(k).strip() and str(v).strip()
    }
    return Lexicon(
        version=int(raw.get("version") or 1),
        say_as_characters=say,
        sub_alias=subs,
        skip_sections=skips,
    )


def load_audio_aliases(meta: dict) -> dict[str, str]:
    """`audio_alias:` del front matter: fragmento visible → cómo se dice."""
    raw = meta.get("audio_alias") or {}
    if not isinstance(raw, dict):
        raise ValueError("audio_alias debe ser un mapa YAML (fragmento: lectura)")
    return {str(k): str(v).strip() for k, v in raw.items() if str(k).strip() and str(v).strip()}


def _split_front_matter(text: str) -> tuple[dict, str]:
    if not text.lstrip().startswith("---"):
        return {}, text
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text
    meta = yaml.safe_load(parts[1]) or {}
    if not isinstance(meta, dict):
        raise ValueError("Front matter debe ser un mapa YAML")
    return meta, parts[2].lstrip("\n")


def _speak_domain(domain: str) -> str:
    labels = domain.split(".")
    tld = SPOKEN_TLDS.get(labels[-1].lower(), labels[-1])
    return " punto ".join([*labels[:-1], tld])


def _normalize_for_speech(text: str) -> str:
    """Correos, dominios, fechas, páginas, montos y números con punto de miles."""
    text = EMAIL_RE.sub(lambda m: f"{m.group(1)} arroba {_speak_domain(m.group(2))}", text)
    text = DOMAIN_RE.sub(lambda m: _speak_domain(m.group(1)), text)

    def _date(m: re.Match) -> str:
        day, month = int(m.group(1)), int(m.group(2))
        if not (1 <= day <= 31 and 1 <= month <= 12):
            return m.group(0)
        return f"{day} de {MESES[month - 1]} de {m.group(3)}"

    text = DATE_DMY_RE.sub(_date, text)
    text = PAGE_RE.sub(
        lambda m: f"páginas {m.group(2)} a {m.group(3)}" if m.group(3) else f"página {m.group(2)}",
        text,
    )

    def _cardinal(digits: str) -> str:
        return f"{CARDINAL_MARK}{digits.replace('.', '')}{CARDINAL_MARK}"

    text = USD_RE.sub(lambda m: f"{_cardinal(m.group(1))} dólares", text)
    text = NUM_DOTS_RE.sub(lambda m: _cardinal(m.group(0)), text)
    return text


def _protect_aliases(text: str, aliases: dict[str, str], store: list[tuple[str, str]]) -> str:
    """Sustituye fragmentos con alias por marcas para que ninguna regla los altere."""
    for key in sorted(aliases, key=len, reverse=True):
        pattern = re.compile(rf"(?<!\w){re.escape(key)}(?!\w)")

        def _mark(m: re.Match, _spoken: str = aliases[key]) -> str:
            store.append((m.group(0), _spoken))
            return f"{ALIAS_MARK}{len(store) - 1}{ALIAS_MARK}"

        text = pattern.sub(_mark, text)
    return text


def _strip_inline_noise(text: str) -> str:
    def _code_repl(m: re.Match) -> str:
        inner = m.group(1).strip()
        if re.fullmatch(rf"{ALIAS_MARK}\d+{ALIAS_MARK}", inner):
            return inner
        spoken = POLICY_SPOKEN.get(inner.lower())
        if spoken:
            return spoken
        if EMAIL_RE.fullmatch(inner) or DOMAIN_RE.fullmatch(inner):
            return inner  # se lee después como «arroba» / «punto»
        if DNS_TOKEN_RE.search(inner) or len(inner) > 12:
            # Sin alias: frase neutra para no dejar la oración rota.
            return CODE_FALLBACK_SPOKEN
        return inner

    text = INLINE_CODE_RE.sub(_code_repl, text)
    for token, spoken in POLICY_SPOKEN.items():
        text = re.sub(rf"\b{re.escape(token)}\b", spoken, text, flags=re.I)
    text = DNS_TOKEN_RE.sub("", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip()


def _strip_emphasis(text: str) -> str:
    text = text.replace("**", "").replace("__", "")
    text = EMPH_STAR_RE.sub(r"\1", text)
    # El guion bajo solo se quita cuando marca énfasis (_así_), no dentro de palabras.
    return EMPH_UNDERSCORE_RE.sub(r"\1", text)


def _plain_block(
    text: str,
    aliases: dict[str, str] | None = None,
    store: list[tuple[str, str]] | None = None,
) -> str:
    text = re.sub(r"^>\s?", "", text, flags=re.M)
    text = IMAGE_RE.sub(r"\1", text)
    text = LINK_RE.sub(r"\1", text)
    text = URL_RE.sub("", text)
    text = SEPARATOR_RE.sub(" ", text)
    if aliases and store is not None:
        text = _protect_aliases(text, aliases, store)
    text = _strip_inline_noise(text)
    text = _strip_emphasis(text)
    text = _normalize_for_speech(text)
    return re.sub(r"\s{2,}", " ", text).strip()


def extract_speakable_blocks(
    title: str,
    body_md: str,
    *,
    aliases: dict[str, str] | None = None,
    skip_sections: dict[str, str] | None = None,
    alias_store: list[tuple[str, str]] | None = None,
) -> list[tuple[str, str]]:
    """Devuelve lista de (kind, text) con kind in title|heading|paragraph|list_item.

    `aliases` (front matter `audio_alias`) se guardan en `alias_store` y quedan como
    marcas en el texto; `apply_lexicon_ssml` las convierte en <sub alias>.
    `skip_sections` (título en minúsculas → frase) omite la sección completa hasta el
    siguiente título de igual o mayor nivel y la reemplaza por la frase.
    """
    body = FENCE_RE.sub("", body_md)
    body = HTML_TABLE_RE.sub("", body)
    blocks: list[tuple[str, str]] = []
    store = alias_store if alias_store is not None else []
    skips = skip_sections or {}
    skip_level = 0  # nivel del título que se está omitiendo (0 = no se omite)

    def plain(text: str) -> str:
        return _plain_block(text, aliases, store)

    if title.strip():
        blocks.append(("title", plain(title.strip())))

    paragraph_buf: list[str] = []

    def flush_paragraph() -> None:
        nonlocal paragraph_buf
        if not paragraph_buf:
            return
        text = plain(" ".join(paragraph_buf))
        paragraph_buf = []
        if text and not skip_level:
            blocks.append(("paragraph", text))

    for raw_line in body.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            flush_paragraph()
            continue
        if TABLE_LINE_RE.match(line) or re.match(r"^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$", line):
            flush_paragraph()
            continue
        hm = HEADING_RE.match(line.strip())
        if hm:
            flush_paragraph()
            level = len(hm.group(1))
            if skip_level and level > skip_level:
                continue
            skip_level = 0
            raw_heading = _strip_emphasis(hm.group(2)).strip().lower()
            if raw_heading in skips:
                skip_level = level
                blocks.append(("heading", skips[raw_heading]))
                continue
            heading = plain(hm.group(2))
            if heading:
                blocks.append(("heading", heading))
            continue
        if skip_level:
            continue
        lm = LIST_RE.match(line)
        if lm:
            flush_paragraph()
            item = plain(lm.group(3))
            if item:
                blocks.append(("list_item", item))
            continue
        paragraph_buf.append(line.strip())

    flush_paragraph()
    return blocks


def apply_lexicon_ssml(
    text: str,
    lexicon: Lexicon,
    alias_store: list[tuple[str, str]] | None = None,
) -> str:
    """Escapa XML y envuelve términos del diccionario en etiquetas SSML."""
    text = text.replace(CARDINAL_MARK, "\x00CARD\x00")
    brand_aliases = sorted(lexicon.sub_alias.items(), key=lambda kv: len(kv[0]), reverse=True)
    acronyms = sorted(lexicon.say_as_characters, key=len, reverse=True)

    placeholders: dict[str, str] = {}
    work = text
    counter = 0

    for key, alias in brand_aliases:
        pattern = re.compile(rf"(?<!\w){re.escape(key)}(?!\w)", re.I)

        def _brand_sub(m: re.Match, _alias: str = alias) -> str:
            nonlocal counter
            token = f"\x00SUB{counter}\x00"
            counter += 1
            placeholders[token] = (
                f'<sub alias="{xml_escape(_alias, {chr(34): "&quot;"})}">{xml_escape(m.group(0))}</sub>'
            )
            return token

        work = pattern.sub(_brand_sub, work)

    for acr in acronyms:
        pattern = re.compile(rf"(?<!\w){re.escape(acr)}(?!\w)")

        def _acr_sub(m: re.Match) -> str:
            nonlocal counter
            token = f"\x00ACR{counter}\x00"
            counter += 1
            placeholders[token] = (
                f'<say-as interpret-as="characters">{xml_escape(m.group(0))}</say-as>'
            )
            return token

        work = pattern.sub(_acr_sub, work)

    parts: list[str] = []
    cursor = 0
    for m in re.finditer(r"\x00(?:SUB|ACR)\d+\x00", work):
        parts.append(xml_escape(work[cursor : m.start()]))
        parts.append(placeholders[m.group(0)])
        cursor = m.end()
    parts.append(xml_escape(work[cursor:]))
    out = "".join(parts)
    out = re.sub(
        r"\x00CARD\x00(\d+)\x00CARD\x00",
        r'<say-as interpret-as="cardinal">\1</say-as>',
        out,
    )

    def _alias(m: re.Match) -> str:
        original, spoken = (alias_store or [])[int(m.group(1))]
        return f'<sub alias="{xml_escape(spoken, {chr(34): "&quot;"})}">{xml_escape(original)}</sub>'

    return re.sub(rf"{ALIAS_MARK}(\d+){ALIAS_MARK}", _alias, out)


def blocks_to_ssml_fragments(
    blocks: list[tuple[str, str]],
    lexicon: Lexicon,
    *,
    max_billed: int = MAX_BILLED_CHARS_PER_REQUEST,
    alias_store: list[tuple[str, str]] | None = None,
) -> list[str]:
    """Arma fragmentos SSML <speak> listos para Polly, sin cortar frases."""
    section_break = f'<break time="{BREAK_SECTION_MS}ms"/>'
    para_break = f'<break time="{BREAK_PARAGRAPH_MS}ms"/>'

    units: list[tuple[str, int]] = []  # (ssml_piece, billed_chars)
    for i, (kind, text) in enumerate(blocks):
        inner = apply_lexicon_ssml(text, lexicon, alias_store)
        billed = len(re.sub(r"<[^>]+>", "", inner))
        prefix = ""
        if i > 0:
            if kind == "heading":
                prefix = f"{section_break} "
            else:
                prefix = f"{para_break} "
        units.append((prefix + inner, billed))

    fragments: list[str] = []
    current_parts: list[str] = []
    current_billed = 0

    def wrap(parts: list[str]) -> str:
        body = " ".join(p for p in parts if p)
        return (
            f'<speak><prosody rate="{POLLY_PROSODY_RATE}">'
            f"{body}"
            f"</prosody></speak>"
        )

    for piece, billed in units:
        if current_parts and current_billed + billed > max_billed:
            fragments.append(wrap(current_parts))
            current_parts = [piece]
            current_billed = billed
        else:
            current_parts.append(piece)
            current_billed += billed

    if current_parts:
        fragments.append(wrap(current_parts))
    return fragments


def fingerprint_ssml(fragments: list[str], lexicon: Lexicon) -> str:
    payload = "|".join(
        [
            AUDIO_META_VERSION,
            POLLY_ENGINE,
            POLLY_VOICE_ID,
            POLLY_LANGUAGE_CODE,
            POLLY_PROSODY_RATE,
            str(BREAK_SECTION_MS),
            str(BREAK_PARAGRAPH_MS),
            str(lexicon.version),
            *fragments,
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


def estimate_duration_sec(billed_chars: int) -> int:
    # ~14–16 caracteres/s en lectura calmada; rate 95% ≈ un poco más lento
    return max(1, round(billed_chars / 14.5))


def measure_mp3_duration_sec(path: Path) -> int | None:
    """Duración real del MP3 con ffprobe; None si no está disponible."""
    import shutil
    import subprocess

    if not shutil.which("ffprobe"):
        return None
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, check=True, timeout=30,
        ).stdout.strip()
        return max(1, int(float(out)))
    except (subprocess.SubprocessError, ValueError):
        return None


def estimate_cost_usd(billed_chars: int) -> float:
    return round(billed_chars / 1_000_000 * GENERATIVE_USD_PER_MILLION, 4)


def format_duration(seconds: int) -> str:
    m, s = divmod(max(0, int(seconds)), 60)
    return f"{m}:{s:02d}"


def audio_paths(slug: str) -> tuple[Path, Path]:
    out_dir = BLOG_OUT / slug
    return out_dir / "audio.mp3", out_dir / "audio.sha"


def load_post_md(slug: str) -> tuple[str, str, Path]:
    """Retorna title, body_md, source_path."""
    title, body, path, _meta = load_post(slug)
    return title, body, path


def load_post(slug: str) -> tuple[str, str, Path, dict]:
    """Retorna title, body_md, source_path, front matter."""
    candidates = [
        CONTENT_DIR / f"{slug}.md",
        CONTENT_DIR / "_drafts" / f"{slug}.md",
    ]
    for path in candidates:
        if path.is_file():
            meta, body = _split_front_matter(path.read_text(encoding="utf-8"))
            title = str(meta.get("title") or "").strip()
            file_slug = str(meta.get("slug") or path.stem).strip()
            if file_slug != slug:
                continue
            if not title:
                raise SystemExit(f"Post sin title: {path}")
            return title, body, path, meta
    # buscar por slug en front matter
    for path in sorted(CONTENT_DIR.glob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        meta, body = _split_front_matter(path.read_text(encoding="utf-8"))
        if str(meta.get("slug") or path.stem).strip() == slug:
            title = str(meta.get("title") or "").strip()
            if not title:
                raise SystemExit(f"Post sin title: {path}")
            return title, body, path, meta
    raise SystemExit(f"No se encontró markdown para slug={slug}")


def prepare_audio(slug: str) -> tuple[list[str], Lexicon, str, int]:
    title, body, _path, meta = load_post(slug)
    lexicon = load_lexicon()
    store: list[tuple[str, str]] = []
    blocks = extract_speakable_blocks(
        title,
        body,
        aliases=load_audio_aliases(meta),
        skip_sections=lexicon.skip_sections,
        alias_store=store,
    )
    fragments = blocks_to_ssml_fragments(blocks, lexicon, alias_store=store)
    fp = fingerprint_ssml(fragments, lexicon)
    billed = 0
    for frag in fragments:
        billed += len(re.sub(r"<[^>]+>", "", frag))
    return fragments, lexicon, fp, billed


def _aws_client():
    try:
        import boto3
        from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
    except ImportError as exc:
        raise RuntimeError(
            "boto3 no instalado. pip install -r requirements-build.txt"
        ) from exc
    session = boto3.Session(region_name=POLLY_REGION)
    client = session.client("polly")
    return client, BotoCoreError, ClientError, NoCredentialsError


def synthesize_fragments(fragments: list[str]) -> bytes:
    client, BotoCoreError, ClientError, NoCredentialsError = _aws_client()
    chunks: list[bytes] = []
    try:
        for i, ssml in enumerate(fragments):
            resp = client.synthesize_speech(
                Engine=POLLY_ENGINE,
                VoiceId=POLLY_VOICE_ID,
                LanguageCode=POLLY_LANGUAGE_CODE,
                OutputFormat="mp3",
                SampleRate=POLLY_SAMPLE_RATE,
                Text=ssml,
                TextType="ssml",
            )
            stream = resp.get("AudioStream")
            if stream is None:
                raise RuntimeError(f"Polly sin AudioStream (fragmento {i + 1})")
            chunks.append(stream.read())
    except NoCredentialsError as exc:
        raise RuntimeError(
            "Sin credenciales AWS. Exporta AWS_PROFILE o configura ~/.aws/credentials."
        ) from exc
    except (BotoCoreError, ClientError) as exc:
        raise RuntimeError(f"Error Polly: {exc}") from exc
    return b"".join(chunks)


def generate_for_slug(slug: str, *, force: bool = False, dry_run: bool = False) -> AudioMeta | None:
    fragments, lexicon, fp, billed = prepare_audio(slug)
    mp3_path, sha_path = audio_paths(slug)
    existing = AudioMeta.from_path(sha_path)

    if (
        not force
        and not dry_run
        and mp3_path.is_file()
        and existing
        and existing.fingerprint == fp
    ):
        print(f"Audio OK (cache): blog/{slug}/audio.mp3")
        return existing

    duration = estimate_duration_sec(billed)
    cost = estimate_cost_usd(billed)
    print(
        f"Audio {slug}: {len(fragments)} fragmentos, ~{billed} chars, "
        f"~{format_duration(duration)}, ~USD {cost:.4f} (generative)"
    )

    if dry_run:
        for i, frag in enumerate(fragments, 1):
            print(f"--- fragmento {i}/{len(fragments)} ({len(frag)} chars SSML) ---")
            print(frag[:800] + ("…" if len(frag) > 800 else ""))
        return AudioMeta(
            fingerprint=fp,
            engine=POLLY_ENGINE,
            voice=POLLY_VOICE_ID,
            language=POLLY_LANGUAGE_CODE,
            lexicon_version=lexicon.version,
            billed_chars=billed,
            duration_sec=duration,
            bytes=0,
            cost_usd_est=cost,
        )

    try:
        audio = synthesize_fragments(fragments)
    except RuntimeError as exc:
        print(f"AVISO audio omitido ({slug}): {exc}")
        return None

    mp3_path.parent.mkdir(parents=True, exist_ok=True)
    mp3_path.write_bytes(audio)
    size = len(audio)
    if size > 2 * 1024 * 1024:
        print(f"AVISO: blog/{slug}/audio.mp3 pesa {size / (1024 * 1024):.2f} MB (>2 MB)")
    elif size > 1 * 1024 * 1024:
        print(f"AVISO: blog/{slug}/audio.mp3 pesa {size / (1024 * 1024):.2f} MB (>1 MB)")

    measured = measure_mp3_duration_sec(mp3_path)
    if measured:
        duration = measured
    else:
        print("AVISO: ffprobe no disponible; la duración del audio es estimada")

    meta = AudioMeta(
        fingerprint=fp,
        engine=POLLY_ENGINE,
        voice=POLLY_VOICE_ID,
        language=POLLY_LANGUAGE_CODE,
        lexicon_version=lexicon.version,
        billed_chars=billed,
        duration_sec=duration,
        bytes=size,
        cost_usd_est=cost,
    )
    sha_path.write_text(meta.to_json(), encoding="utf-8")
    print(f"Wrote blog/{slug}/audio.mp3 ({size} bytes)")
    return meta


def ensure_audio_for_posts(slugs: list[str], *, force: bool = False) -> dict[str, AudioMeta]:
    """Invocado desde build_blog. Omite sin credenciales."""
    out: dict[str, AudioMeta] = {}
    for slug in slugs:
        meta = generate_for_slug(slug, force=force, dry_run=False)
        if meta:
            out[slug] = meta
    return out


def get_audio_for_template(slug: str) -> dict | None:
    """Datos para la plantilla si existe audio.mp3 + meta."""
    mp3_path, sha_path = audio_paths(slug)
    if not mp3_path.is_file():
        return None
    meta = AudioMeta.from_path(sha_path)
    duration = meta.duration_sec if meta else 0
    return {
        "url": f"/blog/{slug}/audio.mp3",
        "duration_sec": duration,
        "duration_label": format_duration(duration) if duration else "",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Genera audio Polly para posts del blog")
    parser.add_argument("--slug", help="Slug del artículo")
    parser.add_argument("--all", action="store_true", help="Todos los .md publicados")
    parser.add_argument("--dry-run", action="store_true", help="Solo SSML/costo, sin Polly")
    parser.add_argument("--force", action="store_true", help="Regenerar aunque el hash coincida")
    args = parser.parse_args(argv)

    slugs: list[str] = []
    if args.all:
        for path in sorted(CONTENT_DIR.glob("*.md")):
            if path.name.lower() == "readme.md":
                continue
            meta, _body = _split_front_matter(path.read_text(encoding="utf-8"))
            if str(meta.get("draft") or "").lower() in {"1", "true", "yes", "si", "sí"}:
                continue
            slugs.append(str(meta.get("slug") or path.stem).strip())
    elif args.slug:
        slugs = [args.slug.strip()]
    else:
        parser.error("Indica --slug o --all")

    for slug in slugs:
        generate_for_slug(slug, force=args.force, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
