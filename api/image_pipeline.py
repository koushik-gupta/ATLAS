"""
Multi-layer image pipeline for travel destinations.

Layer 1: Curated URL library — handpicked Unsplash photos for top destinations
Layer 2: Wikipedia REST API — always-correct featured image for any city
Layer 3: Category-based fallback — detected from destination keywords
Layer 4: Generic travel default
"""

import re
import requests

# ── Layer 1: Curated destination → Unsplash photo ─────────────────────────────
# Keys are lowercase, de-accented destination names or common variants.
CURATED: dict[str, str] = {}

# ── Layer 3: Category-based fallback images ────────────────────────────────────
CATEGORY_IMAGES: dict[str, str] = {
    "beach":       "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop&q=80",
    "hill":        "https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=800&h=600&fit=crop&q=80",
    "mountain":    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&h=600&fit=crop&q=80",
    "snow":        "https://images.unsplash.com/photo-1452001603657-4b8b1bee6764?w=800&h=600&fit=crop&q=80",
    "forest":      "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&h=600&fit=crop&q=80",
    "backwater":   "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?w=800&h=600&fit=crop&q=80",
    "lake":        "https://images.unsplash.com/photo-1598874399285-dac6de98e05c?w=800&h=600&fit=crop&q=80",
    "desert":      "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&h=600&fit=crop&q=80",
    "heritage":    "https://images.unsplash.com/photo-1568454537842-d933259bb258?w=800&h=600&fit=crop&q=80",
    "temple":      "https://images.unsplash.com/photo-1561721414-81d2d964b73a?w=800&h=600&fit=crop&q=80",
    "wildlife":    "https://images.unsplash.com/photo-1561996709-7982ba9c1eb6?w=800&h=600&fit=crop&q=80",
    "island":      "https://images.unsplash.com/photo-1587922546307-776227941871?w=800&h=600&fit=crop&q=80",
    "city":        "https://images.unsplash.com/photo-1477587458883-47145ed94245?w=800&h=600&fit=crop&q=80",
    "valley":      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop&q=80",
    "waterfall":   "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&h=600&fit=crop&q=80",
    "default":     "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&h=600&fit=crop&q=80",
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def _normalize(name: str) -> str:
    """Lowercase, strip punctuation, collapse spaces."""
    return re.sub(r"[^a-z0-9 ]", "", name.lower()).strip()


def _detect_category(name: str) -> str:
    n = name.lower()
    if any(w in n for w in ["beach", "coast", "bay", "sea", "shore", "surf"]):
        return "beach"
    if any(w in n for w in ["island", "atoll", "lakshadweep", "andaman"]):
        return "island"
    if any(w in n for w in ["snow", "glacier", "ski", "gulmarg", "auli"]):
        return "snow"
    if any(w in n for w in ["desert", "dune", "sand", "jaisalmer", "thar"]):
        return "desert"
    if any(w in n for w in ["backwater", "houseboat", "alleppey", "kumarakom"]):
        return "backwater"
    if any(w in n for w in ["lake", "ooty", "nainital", "dal lake"]):
        return "lake"
    if any(w in n for w in ["valley", "kasol", "parvati", "spiti", "nubra"]):
        return "valley"
    if any(w in n for w in ["waterfall", "falls", "arvalem", "athirappilly"]):
        return "waterfall"
    if any(w in n for w in ["hill station", "hill", "shimla", "ooty", "kodaikanal", "munnar", "coorg"]):
        return "hill"
    if any(w in n for w in ["mountain", "himalaya", "peak", "manali", "leh", "ladakh", "sikkim"]):
        return "mountain"
    if any(w in n for w in ["forest", "jungle", "wildlife", "tiger", "national park", "sanctuary", "ranthambore", "kaziranga", "corbett", "kanha"]):
        return "wildlife"
    if any(w in n for w in ["fort", "palace", "temple", "heritage", "historical", "monument", "hampi", "ajanta", "ellora"]):
        return "heritage"
    return "city"


import os
import urllib.parse
import shutil

def _get_wikipedia_image(city: str) -> str:
    """Fetch the featured thumbnail from Wikipedia. 
    Uses the Search API first to find the exact authentic page title."""
    try:
        # 1. Search for the exact page title
        search_url = "https://en.wikipedia.org/w/api.php"
        search_params = {
            "action": "query",
            "list": "search",
            "srsearch": f"{city} city",
            "utf8": "",
            "format": "json",
            "srlimit": 1
        }
        headers = {"User-Agent": "AntigravityTravelApp/1.0 (contact: test@example.com)"}
        search_resp = requests.get(search_url, params=search_params, headers=headers, timeout=5)
        
        if search_resp.status_code == 200:
            search_data = search_resp.json()
            results = search_data.get("query", {}).get("search", [])
            if results:
                title = results[0]["title"]
                
                # 2. Fetch the summary for the exact title
                slug = urllib.parse.quote(title.replace(" ", "_"))
                summary_resp = requests.get(
                    f"https://en.wikipedia.org/api/rest_v1/page/summary/{slug}",
                    timeout=5,
                    headers=headers,
                )
                
                if summary_resp.status_code == 200:
                    data = summary_resp.json()
                    url = (
                        data.get("originalimage", {}).get("source")
                        or data.get("thumbnail", {}).get("source", "")
                    )
                    if url and _is_safe_url(url):
                        return url
    except Exception as e:
        print(f"Wikipedia image fetch failed for {city}: {e}")
    return ""


def _get_duckduckgo_image(city: str) -> str:
    """Fallback to DuckDuckGo image search for obscure cities."""
    try:
        from duckduckgo_search import DDGS
        query = f"{city} city landmark travel photography"
        with DDGS() as ddgs:
            results = list(ddgs.images(query, max_results=3))
            for res in results:
                url = res.get("image")
                if url and _is_safe_url(url) and not any(bad in url.lower() for bad in ["stock", "shutterstock", "getty", "vector"]):
                    return url
    except Exception as e:
        print(f"DuckDuckGo image fetch failed for {city}: {e}")
    return ""


def _is_safe_url(url: str) -> bool:
    """Reject obviously broken, tiny, or SVG-only URLs."""
    if not url or len(url) < 10:
        return False
    low = url.lower()
    # Reject SVG, logos, flags, icons
    if low.endswith(".svg") or "logo" in low or "flag" in low or "icon" in low:
        return False
    # Reject very small Wikipedia thumbnails (below 300px wide)
    m = re.search(r"(\d+)px-", url)
    if m and int(m.group(1)) < 300:
        return False
    return True

def _get_google_places_image(city: str) -> str:
    """Fetch high-quality photo using Google Places API (New) if key is present."""
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY")
    if not api_key:
        return ""
        
    try:
        url = "https://places.googleapis.com/v1/places:searchText"
        headers = {
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "places.photos",
            "Content-Type": "application/json"
        }
        data = {"textQuery": f"{city} tourism landmark"}
        resp = requests.post(url, headers=headers, json=data, timeout=5)
        
        if resp.status_code == 200:
            places = resp.json().get("places", [])
            if places:
                for place in places:
                    photos = place.get("photos", [])
                    if photos:
                        photo_name = photos[0].get("name")
                        if photo_name:
                            return f"https://places.googleapis.com/v1/{photo_name}/media?maxHeightPx=1280&key={api_key}"
    except Exception as e:
        print(f"Google Places API fetch failed for {city}: {e}")
    return ""


def _download_image_locally(url: str, filepath: str) -> bool:
    """Downloads an image from a URL and saves it to filepath."""
    try:
        headers = {"User-Agent": "AntigravityTravelApp/1.0 (contact: test@example.com)"}
        resp = requests.get(url, stream=True, timeout=10, headers=headers)
        if resp.status_code == 200:
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            with open(filepath, 'wb') as f:
                resp.raw.decode_content = True
                shutil.copyfileobj(resp.raw, f)
            return True
        else:
            print(f"Failed to download image {url}, status code: {resp.status_code}")
    except Exception as e:
        print(f"Failed to download image {url}: {e}")
    return False

def get_destination_image(city_name: str) -> str:
    """
    Return the best available image URL for a travel destination.
    
    Priority:
      1. Google Places API (authentic)
      2. Wikipedia REST API via Search (authentic)
      3. DuckDuckGo Image Search (strict fallback)
      4. Category-based Unsplash fallback (relevant but generic)
    """
    # Layer 1: Google Places API
    google_img = _get_google_places_image(city_name)
    if google_img:
        return google_img

    # Layer 2: Wikipedia
    wiki = _get_wikipedia_image(city_name)
    if wiki:
        return wiki

    # Layer 3: DuckDuckGo
    ddg = _get_duckduckgo_image(city_name)
    if ddg:
        return ddg

    # Layer 4: Category fallback
    cat = _detect_category(city_name)
    return CATEGORY_IMAGES.get(cat, CATEGORY_IMAGES["default"])
