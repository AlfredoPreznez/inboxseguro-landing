import re

EMAIL_RE = re.compile(r"^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$", re.I)
DOMAIN_RE = re.compile(r"^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$", re.I)
ALLOWED_TOOLS = frozenset({"sending_systems"})


def normalize_email(value: str) -> str:
    return str(value or "").strip().lower()


def normalize_domain(value: str) -> str:
    raw = str(value or "").strip().lower()
    raw = re.sub(r"^https?://", "", raw)
    raw = re.sub(r"^www\.", "", raw)
    return raw.split("/")[0].split(":")[0].strip(".")


def validate_email(email: str) -> bool:
    if not email or len(email) > 254:
        return False
    if ".." in email or email.startswith(".") or email.endswith("."):
        return False
    return bool(EMAIL_RE.match(email))


def validate_domain(domain: str) -> bool:
    if not domain or len(domain) > 253:
        return False
    return bool(DOMAIN_RE.match(domain))


def validate_tool_name(tool_name: str) -> bool:
    return tool_name in ALLOWED_TOOLS
