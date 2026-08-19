import asyncio
import logging
import os
import re
from urllib.parse import urlparse

import httpx
from outscraper import ApiClient

from models import Organization
from services.crm_webhook import UnsafeWebhookUrlError, _assert_safe_webhook_url

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
MAILTO_RE = re.compile(r'mailto:([^"\'?\s<>]+@[^"\'\s<>]+\.[a-zA-Z]{2,})', re.I)

# Tracking pixels, asset extensions, and placeholder addresses that regularly
# show up as false positives when scraping raw HTML for emails.
_IGNORED_SUBSTRINGS = [
    "example.com", "sentry.io", "wixpress.com", "godaddy.com", "schema.org",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", "wix.com",
]

_SCRAPE_PATHS = ["", "/contact", "/contacto", "/about", "/nosotros", "/about-us", "/quienes-somos"]

ES_ROLE_PREFIXES = ["info", "contacto", "ventas", "hola", "administracion", "atencion"]
EN_ROLE_PREFIXES = ["info", "contact", "sales", "hello", "admin", "support"]


def _extract_domain(url: str) -> str | None:
    if not url:
        return None
    candidate = url.strip()
    if not candidate.startswith(("http://", "https://")):
        candidate = f"https://{candidate}"
    host = (urlparse(candidate).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host or None


async def resolve_company_domain(name: str, city: str, org: Organization) -> dict | None:
    """Look up a business by name (+ optional city) via Outscraper and return
    its listed website/phone, so a bare company name can be turned into a
    domain to search for emails against."""
    api_key = os.getenv("OUTSCRAPER_API_KEY", "").strip()
    if not api_key:
        raise ValueError("OUTSCRAPER_API_KEY no configurada")

    query = f"{name} en {city}" if city else name

    def _search():
        client = ApiClient(api_key=api_key)
        results = client.google_maps_search(query, limit=1, language=org.lh_language or "es", region="us")
        items = results[0] if results and isinstance(results[0], list) else results
        return items[0] if items else None

    item = await asyncio.to_thread(_search)
    if not item:
        return None
    website = (item.get("site") or item.get("website") or "").strip()
    return {
        "matched_name": (item.get("name") or "").strip() or None,
        "website": website or None,
        "phone": (item.get("phone") or "").strip() or None,
    }


async def scrape_site_emails(website_url: str) -> list[str]:
    """Fetch the business's own site (home + a few common contact/about
    paths) and pull out any email addresses it publishes — real, already-
    public emails beat guessed ones every time."""
    domain = _extract_domain(website_url)
    if not domain:
        return []

    base = website_url.strip()
    if not base.startswith(("http://", "https://")):
        base = f"https://{base}"
    base = base.rstrip("/")

    try:
        _assert_safe_webhook_url(base)
    except UnsafeWebhookUrlError as e:
        logger.warning(f"[EmailFinder] refusing to scrape unsafe URL {base}: {e}")
        return []

    same_domain: list[str] = []
    other: list[str] = []
    seen: set[str] = set()

    async with httpx.AsyncClient(
        timeout=6.0, follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 (compatible; ZyraVoiceBot/1.0)"},
    ) as client:
        for path in _SCRAPE_PATHS:
            try:
                resp = await client.get(base + path)
            except Exception:
                continue
            if resp.status_code >= 400:
                continue
            candidates = MAILTO_RE.findall(resp.text) + EMAIL_RE.findall(resp.text)
            for raw in candidates:
                e = raw.strip().lower().rstrip(".,;")
                if e in seen or any(s in e for s in _IGNORED_SUBSTRINGS):
                    continue
                seen.add(e)
                (same_domain if e.split("@")[-1].endswith(domain) else other).append(e)
            if same_domain:
                break

    return (same_domain + other)[:5]


def domain_has_mx(domain: str) -> bool:
    """Cheap, reliable check that a domain can receive mail at all — actual
    SMTP mailbox verification is unreliable from cloud hosts (most block
    outbound port 25), so this is the strongest signal we can check."""
    try:
        import dns.resolver
        answers = dns.resolver.resolve(domain, "MX", lifetime=5)
        return len(answers) > 0
    except Exception:
        return False


def guess_role_emails(domain: str, lang: str = "es") -> list[str]:
    """Generic role-address guesses for a domain. Unverified by nature — a
    person's name-based guess (john.doe@) isn't possible since Lead Hunter
    only has the business name, not staff names."""
    prefixes = EN_ROLE_PREFIXES if lang == "en" else ES_ROLE_PREFIXES
    return [f"{p}@{domain}" for p in prefixes]


async def find_company_email(
    name: str,
    city: str,
    org: Organization,
    website_url: str | None = None,
) -> dict:
    """Resolve a company name (or an already-known website) down to a best-
    guess email: try to scrape a real, published address first; only fall
    back to a generic guessed address (and only if the domain actually
    receives mail) when scraping finds nothing."""
    matched_name = None
    phone = None
    website = (website_url or "").strip() or None

    if not website:
        info = await resolve_company_domain(name, city, org)
        if info:
            matched_name = info["matched_name"]
            website = info["website"]
            phone = info["phone"]

    result = {
        "matched_name": matched_name,
        "phone": phone,
        "website": website,
        "domain": None,
        "email": None,
        "source": None,   # scraped | guessed
        "candidates": [],
    }
    if not website:
        return result

    domain = _extract_domain(website)
    result["domain"] = domain
    if not domain:
        return result

    scraped = await scrape_site_emails(website)
    if scraped:
        result.update(email=scraped[0], source="scraped", candidates=scraped)
        return result

    has_mx = await asyncio.to_thread(domain_has_mx, domain)
    if not has_mx:
        return result

    guesses = guess_role_emails(domain, org.lh_language or "es")
    result.update(email=guesses[0], source="guessed", candidates=guesses)
    return result
