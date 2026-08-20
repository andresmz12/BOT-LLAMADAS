import asyncio
import logging
import os
import re
from urllib.parse import urlparse

import httpx

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

ES_ROLE_PREFIXES = ["info", "contacto", "ventas", "hola", "administracion", "atencion", "retail"]
EN_ROLE_PREFIXES = ["info", "contact", "sales", "hello", "admin", "support", "retail"]


def _extract_domain(url: str) -> str | None:
    if not url:
        return None
    candidate = url.strip()
    if not candidate.startswith(("http://", "https://")):
        candidate = f"https://{candidate}"
    host = (urlparse(candidate).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host or None


async def resolve_company_domain(name: str, city: str, org: Organization) -> dict | None:
    """Look up a business by name (+ optional city) via Google Places and
    return its listed website/phone, so a bare company name can be turned
    into a domain to search for emails against."""
    query = f"{name} en {city}" if city else name
    google_key = (org.google_api_key or "").strip() or os.getenv("GOOGLE_API_KEY", "").strip()
    if not google_key:
        raise ValueError("Configura una Google API key (Configuración) para poder buscar negocios.")

    from services.google_places_service import search_businesses
    item = await asyncio.to_thread(lambda: next(iter(search_businesses(query, api_key=google_key, limit=1)), None))

    if not item:
        return None
    website = (item.get("site") or item.get("website") or "").strip()
    return {
        "matched_name": (item.get("name") or "").strip() or None,
        "website": website or None,
        "phone": (item.get("phone") or "").strip() or None,
    }


async def _safe_get(client: httpx.AsyncClient, url: str, max_redirects: int = 3) -> httpx.Response | None:
    """GET a URL, following redirects manually so every hop is re-validated
    against _assert_safe_webhook_url. A plain follow_redirects=True would let
    a scraped site's response redirect straight past the initial SSRF check
    into an internal/metadata address."""
    for _ in range(max_redirects + 1):
        try:
            _assert_safe_webhook_url(url)
        except UnsafeWebhookUrlError as e:
            logger.warning(f"[EmailFinder] refusing to follow redirect to unsafe URL {url}: {e}")
            return None
        resp = await client.get(url)
        if resp.is_redirect:
            location = resp.headers.get("location")
            if not location:
                return resp
            url = str(httpx.URL(url).join(location))
            continue
        return resp
    return None


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
        timeout=6.0, follow_redirects=False,
        headers={"User-Agent": "Mozilla/5.0 (compatible; ZyraVoiceBot/1.0)"},
    ) as client:
        for path in _SCRAPE_PATHS:
            try:
                resp = await _safe_get(client, base + path)
            except Exception:
                continue
            if resp is None or resp.status_code >= 400:
                continue
            candidates = MAILTO_RE.findall(resp.text) + EMAIL_RE.findall(resp.text)
            for raw in candidates:
                e = raw.strip().lower().rstrip(".,;")
                if e in seen or any(s in e for s in _IGNORED_SUBSTRINGS):
                    continue
                seen.add(e)
                e_domain = e.split("@")[-1]
                is_same_domain = e_domain == domain or e_domain.endswith(f".{domain}")
                (same_domain if is_same_domain else other).append(e)
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


async def _best_guessable_domain(website_domain: str, scraped: list[str]) -> tuple[str, bool]:
    """Pick the domain to generate role-address guesses against. A company's
    website is often hosted on a subdomain (e.g. corporate.example.com) that
    has no MX record of its own even though the company's real mail domain
    does — so prefer the domain of an email we already found (proof it
    accepts mail), then the website's own domain, then its apex domain as a
    last resort before giving up."""
    candidates = []
    if scraped:
        candidates.append(scraped[0].split("@")[-1])
    candidates.append(website_domain)
    parts = website_domain.split(".")
    if len(parts) > 2:
        candidates.append(".".join(parts[-2:]))

    seen = set()
    for d in candidates:
        if not d or d in seen:
            continue
        seen.add(d)
        if await asyncio.to_thread(domain_has_mx, d):
            return d, True
    return website_domain, False


async def find_company_email(
    name: str,
    city: str,
    org: Organization,
    website_url: str | None = None,
) -> dict:
    """Resolve a company name (or an already-known website) down to a best
    email plus a full spread of extra options: the real address wins as the
    primary pick when the site publishes one, but algorithmic role-address
    guesses (info@, contacto@, ventas@...) are always generated alongside it
    (whenever the domain can receive mail) so there's more than one address
    to try, not just a single result."""
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
        "guessed_candidates": [],
    }
    if not website:
        return result

    domain = _extract_domain(website)
    result["domain"] = domain
    if not domain:
        return result

    scraped = await scrape_site_emails(website)
    guess_domain, has_mx = await _best_guessable_domain(domain, scraped)
    guessed = guess_role_emails(guess_domain, org.lh_language or "es") if has_mx else []
    # Never suggest a guess that duplicates a real address already found.
    guessed = [g for g in guessed if g not in scraped]
    result["guessed_candidates"] = guessed

    if scraped:
        result.update(email=scraped[0], source="scraped", candidates=scraped)
    elif guessed:
        result.update(email=guessed[0], source="guessed", candidates=guessed)
    return result
