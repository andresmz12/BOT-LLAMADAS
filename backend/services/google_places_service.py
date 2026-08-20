import logging
import time

import httpx

logger = logging.getLogger(__name__)

TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"


class GooglePlacesError(Exception):
    """Raised when Google Places rejects the request (bad key, API not
    enabled, billing not set up, etc.) — distinct from a plain "no results"."""


def _place_details(client: httpx.Client, place_id: str, api_key: str) -> dict:
    try:
        resp = client.get(DETAILS_URL, params={
            "place_id": place_id,
            "fields": "formatted_phone_number,international_phone_number,website",
            "key": api_key,
        })
        data = resp.json()
        return data.get("result", {}) if data.get("status") == "OK" else {}
    except Exception as e:
        logger.warning(f"[GooglePlaces] details failed for place_id={place_id}: {e}")
        return {}


def search_businesses(
    query: str,
    api_key: str,
    limit: int = 20,
    min_rating: float = 0.0,
    max_rating: float = 5.0,
    min_reviews: int = 0,
    max_reviews: int = 10 ** 9,
) -> list[dict]:
    """Search Google Places (Text Search) and enrich only the results that
    already pass the rating/review filter with phone + website via Place
    Details. Returns dicts with name, phone, site, rating, reviews_count.

    Place Details is a separately-billed call per place, so it's only spent
    on candidates the quality filter wouldn't reject anyway — no point
    paying for contact data on a business that's getting discarded.

    Text Search only returns ~20 results per page, so when `limit` asks for
    more than that we follow `next_page_token` (up to Google's own 3-page
    cap, ~60 results) rather than silently returning just the first page.
    """
    with httpx.Client(timeout=10.0) as client:
        items = []
        page_token = None
        for page in range(3):
            params = (
                {"pagetoken": page_token, "key": api_key}
                if page_token
                else {"query": query, "key": api_key, "region": "us"}
            )
            if page_token:
                # A freshly-issued next_page_token isn't valid until Google
                # finishes indexing it — the docs recommend a short delay.
                time.sleep(2)
            resp = client.get(TEXT_SEARCH_URL, params=params)
            data = resp.json()
            status = data.get("status")
            if status == "REQUEST_DENIED":
                raise GooglePlacesError(
                    "Google Places rechazó la solicitud "
                    f"({data.get('error_message') or 'clave inválida o Places API no habilitada en el proyecto de Google Cloud'})"
                )
            if status == "OVER_QUERY_LIMIT":
                raise GooglePlacesError("Se alcanzó el límite de uso de Google Places (revisa la facturación en Google Cloud).")
            if status == "INVALID_REQUEST" and page_token:
                # Token wasn't ready in time — treat as "no more pages" rather than an error.
                break
            if status not in ("OK", "ZERO_RESULTS"):
                raise GooglePlacesError(f"Error de Google Places: {status}")

            for r in (data.get("results") or []):
                rating = r.get("rating") or 0
                reviews = r.get("user_ratings_total") or 0
                item = {
                    "name": r.get("name", ""),
                    "rating": rating,
                    "reviews_count": reviews,
                    "phone": "",
                    "site": "",
                }
                place_id = r.get("place_id")
                if place_id and (min_rating <= rating <= max_rating) and (min_reviews <= reviews <= max_reviews):
                    details = _place_details(client, place_id, api_key)
                    item["phone"] = details.get("formatted_phone_number") or details.get("international_phone_number") or ""
                    item["site"] = details.get("website") or ""
                items.append(item)
                if len(items) >= limit:
                    return items

            page_token = data.get("next_page_token")
            if not page_token:
                break
        return items
