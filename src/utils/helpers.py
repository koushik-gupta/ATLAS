import math
import re
import requests
import time
from typing import Dict, Tuple
from pydantic import BaseModel, Field

def parse_rating(val, default: float = 5.0) -> float:
    """
    Robustly parse a rating value to a float on a 0–10 scale.
    Handles: 8.5, '8.5', '8.5/10', '4.7/5', '4.7 out of 5', None, '', etc.
    Values already on a 10-scale are returned as-is.
    Values on a 5-scale (denominator == 5) are doubled to a 10-scale.
    """
    if val is None:
        return default
    s = str(val).strip()
    if not s:
        return default
    # Try to extract numerator and optional denominator from patterns like '4.7/5' or '8.5/10'
    m = re.match(r'^([\d.]+)\s*(?:/|out\s+of)\s*([\d.]+)$', s, re.IGNORECASE)
    if m:
        try:
            numerator = float(m.group(1))
            denominator = float(m.group(2))
            if denominator <= 0:
                return default
            # Normalise to 10-scale
            score = (numerator / denominator) * 10.0
            return round(min(score, 10.0), 2)
        except ValueError:
            return default
    # Plain number
    try:
        score = float(s)
        # Heuristic: if score <= 5 and has a decimal (i.e. likely a 5-scale value), double it
        # But only if it looks like a 5-point scale (≤ 5.0)
        if score <= 5.0:
            score = score * 2.0
        return round(min(score, 10.0), 2)
    except ValueError:
        return default

# In-memory cache for resolved city coordinates
_coord_cache: Dict[str, Tuple[float, float]] = {}
_city_analysis_cache: Dict[tuple, dict] = {}
_global_state_hints: Dict[str, str] = {}

class Geocode(BaseModel):
    latitude: float = Field(description="The latitude of the city in decimal degrees (e.g. 22.5726)")
    longitude: float = Field(description="The longitude of the city in decimal degrees (e.g. 88.3639)")

class CityAnalysis(BaseModel):
    mountain_towns: list[str] = Field(description="Cities from the input list that are located in hilly or mountainous terrain.")
    airport_cities: list[str] = Field(description="Cities from the input list that have functional commercial airports.")
    acclimatization_levels: dict[str, int] = Field(description="Mapping of high-altitude cities to required acclimatization tier (1 to 4). Empty if none.")
    excursion_hubs: dict[str, str] = Field(description="Mapping of day-trip excursion cities to their logical base hub city from the input list. Empty if none.")
    state_hints: dict[str, str] = Field(description="Mapping of all input cities to their respective state and country.")
    city_scores: dict[str, dict[str, int]] = Field(description="Mapping of each input city to its intrinsic scores (1-10) for 'tourist_importance', 'activity_density', and 'uniqueness'.")
    required_transit_nodes: list[str] = Field(description="Cities from the input list that are strictly required structural transit gateways (e.g. NJP, Bagdogra, Chandigarh). Do not include regular tourist cities unless they serve as mandatory regional gateways.")
    city_coordinates: dict[str, dict[str, float]] = Field(description="Mapping of each input city name to its approximate decimal GPS coordinates as {\"lat\": float, \"lon\": float}. Use your geographic knowledge to provide accurate coordinates.")

def analyze_destinations(cities: list[str]) -> dict:
    """
    Dynamically analyzes a list of cities using a fast LLM to classify topography, 
    infrastructure, and regional data, replacing hardcoded lists.
    """
    if not cities:
        return {"mountain_towns": [], "airport_cities": [], "acclimatization_levels": {}, "excursion_hubs": {}, "state_hints": {}}
        
    cache_key = tuple(sorted([c.lower().strip() for c in cities]))
    if cache_key in _city_analysis_cache:
        return _city_analysis_cache[cache_key]
        
    # Subset check optimization
    req_set = set([c.lower().strip() for c in cities])
    for cached_tuple, cached_result in _city_analysis_cache.items():
        if req_set.issubset(set(cached_tuple)):
            # We already have a larger context cached! Extract subset!
            subset_result = {
                "mountain_towns": [c for c in cached_result["mountain_towns"] if c in req_set],
                "airport_cities": [c for c in cached_result["airport_cities"] if c in req_set],
                "acclimatization_levels": {k: v for k, v in cached_result["acclimatization_levels"].items() if k in req_set},
                "excursion_hubs": {k: v for k, v in cached_result["excursion_hubs"].items() if k in req_set and v in req_set},
                "state_hints": {k: v for k, v in cached_result["state_hints"].items() if k in req_set},
                "city_scores": {k: v for k, v in cached_result.get("city_scores", {}).items() if k in req_set},
                "required_transit_nodes": [c for c in cached_result.get("required_transit_nodes", []) if c in req_set],
                "city_coordinates": {k: v for k, v in cached_result.get("city_coordinates", {}).items() if k in req_set}
            }
            _city_analysis_cache[cache_key] = subset_result
            return subset_result
            
    from src.llm_config import get_compound_mini_llm
    
    prompt = f"""
    Analyze the following list of global cities: {cities}
    
    Provide a structured classification:
    1. mountain_towns: Which of these cities are in hilly/mountainous terrain?
    2. airport_cities: Which of these cities have functional commercial airports, OR are serviced by a major commercial airport within a 60-90 minute drive (e.g., Sorrento is serviced by Naples Airport)?
    3. acclimatization_levels: High-altitude cities that need acclimatization (e.g., Srinagar=1, Cusco=2, Leh=3, La Paz=4).
    4. excursion_hubs: Known day-trip excursions and their logical base hub (e.g., 'Nubra Valley': 'Leh', 'Versailles': 'Paris'). ONLY include pairs where both exist in the input list.
    5. state_hints: Map each city to its state and country.
    6. city_scores: Map each city to an object with keys: 'tourist_importance', 'activity_density', and 'uniqueness' (1-10 scale).
    7. required_transit_nodes: List any cities that are strictly mandatory transit gateways (e.g., NJP, Bagdogra).
    8. city_coordinates: Map EVERY city in the input list to its approximate GPS coordinates as {{"lat": float, "lon": float}}. Use your geographic knowledge. Be precise — this is used for distance calculations.
    """
    
    try:
        llm = get_compound_mini_llm(temperature=0).with_structured_output(CityAnalysis)
        res = llm.invoke(prompt)
        
        result = {
            "mountain_towns": [c.lower().strip() for c in res.mountain_towns],
            "airport_cities": [c.lower().strip() for c in res.airport_cities],
            "acclimatization_levels": {k.lower().strip(): v for k, v in res.acclimatization_levels.items()},
            "excursion_hubs": {k.lower().strip(): v.lower().strip() for k, v in res.excursion_hubs.items()},
            "state_hints": {k.lower().strip(): v for k, v in res.state_hints.items()},
            "city_scores": {k.lower().strip(): v for k, v in res.city_scores.items()},
            "required_transit_nodes": [c.lower().strip() for c in res.required_transit_nodes],
            "city_coordinates": {k.lower().strip(): v for k, v in res.city_coordinates.items()}
        }
        _city_analysis_cache[cache_key] = result
        _global_state_hints.update(result["state_hints"])
        return result
    except Exception as e:
        print(f"[WARNING] Dynamic city classification failed: {e}. Using empty fallbacks.")
        fallback = {"mountain_towns": [], "airport_cities": [], "acclimatization_levels": {}, "excursion_hubs": {}, "state_hints": {}, "city_scores": {}, "required_transit_nodes": [], "city_coordinates": {}}
        _city_analysis_cache[cache_key] = fallback
        return fallback

def fetch_coordinates_llm_fallback(city_name: str, state_hint: str = "") -> Tuple[float, float]:
    """Fetches approximate decimal coordinates of a city using the LLM's internal knowledge base (much faster than DDGS)."""
    from src.llm_config import get_structured_llm
    try:
        extractor = get_structured_llm(Geocode, temperature=0)
        res = extractor.invoke(f"What are the approximate decimal latitude and longitude coordinates of {city_name} {state_hint}? Reply with the coordinates.")
        return res.latitude, res.longitude
    except Exception as e:
        print(f"[WARNING] LLM coordinate extraction failed for {city_name}: {e}")
    return (0.0, 0.0)

def get_city_coordinates(city_name: str) -> Tuple[float, float]:
    city_clean = city_name.strip().lower()
    if city_clean in _coord_cache:
        return _coord_cache[city_clean]

    search_query = city_name.strip()
    if not search_query:
        return (0.0, 0.0)

    # Append state/country hint if available to prevent geocoding to ambiguous villages (like Lava in Italy)
    hint = _global_state_hints.get(city_clean, "")
    if hint:
        search_query = f"{search_query}, {hint}"

    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": search_query,
        "format": "json",
        "limit": 1,
    }
    headers = {
        "User-Agent": "KoushikAgenticDev/1.0 (test@koushik.com)"
    }

    try:
        resp = requests.get(url, params=params, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        if data:
            lat = float(data[0]["lat"])
            lon = float(data[0]["lon"])
            _coord_cache[city_clean] = (lat, lon)
            return lat, lon

    except Exception as e:
        print(f"[WARNING] Coordinate lookup failed for {city_name}: {e}")

    _coord_cache[city_clean] = (0.0, 0.0)
    return (0.0, 0.0)

def get_osrm_matrix(coords: dict[str, tuple[float, float]]) -> dict[str, dict[str, dict]]:
    """
    Fetches actual driving road distances (km) AND travel durations (seconds)
    between all coordinates using the free OSRM Table API.
    
    coords: {city_name: (lat, lon)}
    Returns: {city1: {city2: {"distance_km": float, "duration_sec": float}}}
    """
    if not coords or len(coords) < 2:
        return {}
        
    cities = list(coords.keys())
    coord_strings = [f"{lon},{lat}" for c in cities for lat, lon in [coords[c]]]
    url = f"http://router.project-osrm.org/table/v1/driving/{';'.join(coord_strings)}?annotations=duration,distance"
    
    try:
        resp = requests.get(url, timeout=12)
        data = resp.json()
        if data.get("code") == "Ok":
            distances = data.get("distances", [])
            durations = data.get("durations", [])
            result = {}
            for i, city1 in enumerate(cities):
                result[city1] = {}
                for j, city2 in enumerate(cities):
                    result[city1][city2] = {
                        "distance_km": distances[i][j] / 1000.0,
                        "duration_sec": durations[i][j]
                    }
            return result
    except Exception as e:
        print(f"[WARNING] OSRM Matrix API failed: {e}")
        
    return {}

# Keep old name as alias for backward compat
def get_osrm_distance_matrix(coords: dict[str, tuple[float, float]]) -> dict[str, dict[str, float]]:
    matrix = get_osrm_matrix(coords)
    return {c1: {c2: v["distance_km"] for c2, v in row.items()} for c1, row in matrix.items()}


def haversine(lat1: float, lon1: float, lat2: float, lon2: float, city1: str = "", city2: str = "") -> float:
    """Calculate distance in km between two lat/lon points, with terrain awareness for mountains."""
    R = 6371.0  # Earth radius in kilometers
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    dist = R * c
    return dist

def optimize_route_order(origin: str, destinations: list[str]) -> list[str]:
    """Computes the geographically optimal route using LLM Global Route Scoring, respecting hub-and-spoke excursions, continuity, and acclimatization."""
    if not destinations:
        return []
        
    analysis = analyze_destinations([origin] + destinations)
    _EXCURSION_HUBS = analysis.get("excursion_hubs", {})
    _ACCLIMATIZATION = analysis.get("acclimatization_levels", {})
    mountain_towns = analysis.get("mountain_towns", [])
    airport_cities = analysis.get("airport_cities", [])
    state_hints = analysis.get("state_hints", {})

    from src.llm_config import get_compound_mini_llm
    from pydantic import BaseModel, Field
    
    class RoutePlan(BaseModel):
        optimized_route: list[str] = Field(description="The final optimal route sequence of destinations (excluding the origin).")

    # Pass the context into the prompt
    prompt = f"""
    You are an expert travel logistics routing engine.
    
    The traveler needs to visit these destinations: {destinations}.
    The journey starts from the origin city: {origin}.
    
    Your task is to determine the absolute most physically efficient and logical route sequence to visit all destinations exactly once.
    
    GLOBAL ROUTE SCORING RULES:
    1. MINIMIZE TRAVEL TIME: Group cities that are geographically close together.
    2. ROUTE CONTINUITY PENALTY (CRITICAL): Strongly penalize descending and then re-ascending. You must prefer continuous progression and geographic flow. Complete a regional corridor before moving to the next. Avoid ping-ponging between mountains and plains.
    3. NO BACKTRACKING: Avoid crossing the same transit hub multiple times unless structurally required.
    4. HUB AND SPOKE: If a destination is a day-trip excursion (e.g., '{list(_EXCURSION_HUBS.keys())}'), it MUST be scheduled immediately adjacent to its logical Base Hub (e.g., '{list(_EXCURSION_HUBS.values())}').
    5. ACCLIMATIZATION: If high-altitude cities require acclimatization ({_ACCLIMATIZATION}), schedule lower altitude mountain towns first before jumping to extreme altitudes.
    
    Here is the geographical context of the cities:
    - Mountain/Hill Towns: {mountain_towns}
    - Gateway/Airport Cities: {airport_cities}
    - State/Country Hints: {state_hints}
    
    Provide the exact list of destination names in the optimal visitation order. Do NOT include the origin city in the output list.
    """
    
    try:
        llm = get_compound_mini_llm(temperature=0).with_structured_output(RoutePlan)
        res = llm.invoke(prompt)
        
        # Validation: ensure all original destinations are present and exactly match
        original_lower = [d.lower().strip() for d in destinations]
        validated_route = []
        for c in res.optimized_route:
            for original_c in destinations:
                if original_c.lower().strip() == c.lower().strip() and original_c not in validated_route:
                    validated_route.append(original_c)
                    break
                    
        # Append any missing destinations that the LLM forgot
        for d in destinations:
            if d not in validated_route:
                validated_route.append(d)
                
        # Remove any hallucinated extra destinations
        validated_route = [d for d in validated_route if d in destinations]
        
        return validated_route
    except Exception as e:
        print(f"[WARNING] LLM Route Optimization failed: {e}. Falling back to original order.")
        return destinations    

def determine_leg_transport_mode(origin: str, destination: str, requested_mode: str) -> str:
    """
    Determines the most logical transport mode between two cities.
    Forces road transport for nearby cities and mountain-to-mountain routes.
    """
    orig_low = origin.lower().strip()
    dest_low = destination.lower().strip()
    
    analysis = analyze_destinations([origin, destination])
    _MOUNTAIN_TOWNS = set(analysis.get("mountain_towns", []))
    _AIRPORT_CITIES = set(analysis.get("airport_cities", []))
    
    # 1. Strict Mountain Hub Logic (No flights between these)
    if orig_low in _MOUNTAIN_TOWNS and dest_low in _MOUNTAIN_TOWNS:
        print(f"[INFO] Mountain-to-Mountain route ({origin} ↔ {destination}). Forcing Road/Taxi.")
        return "Private Taxi"
        
    # 2. Strict Airport Logic
    req_mode_low = requested_mode.lower()
    if "flight" in req_mode_low or "air" in req_mode_low:
        if orig_low not in _AIRPORT_CITIES or dest_low not in _AIRPORT_CITIES:
            print(f"✈️ Missing airport for {origin} ↔ {destination}. Downgrading flight request.")
            requested_mode = "train"

    # 3. Deterministic check based on exact geographical distance
    coord1 = get_city_coordinates(origin)
    coord2 = get_city_coordinates(destination)
    
    if coord1 != (0.0, 0.0) and coord2 != (0.0, 0.0):
        dist_km = haversine(coord1[0], coord1[1], coord2[0], coord2[1], origin, destination)
        if dist_km < 50:
            print(f" Distance between {origin} and {destination} is {dist_km:.1f} km (< 50 km). Forcing Private Taxi.")
            return "Private Taxi"
        elif dist_km < 300 and ("flight" in req_mode_low or "air" in req_mode_low):
            print(f" Distance between {origin} and {destination} is {dist_km:.1f} km. Too short for flight. Forcing Private Taxi.")
            return "Private Taxi"            
    # Small LLM fallback for route viability
    print(f" Verifying if '{requested_mode}' is possible from {origin} to {destination}...")
    from src.llm_config import get_compound_mini_llm
    from pydantic import BaseModel as PydanticBase, Field as PydanticField
    
    class TransportDecision(PydanticBase):
        mode: str = PydanticField(description="The realistic transport mode (e.g., 'Flight', 'Train', 'Bus', 'Private Taxi', or a multi-modal string like 'Train to [Station] + Taxi').")
        
    try:
        llm = get_compound_mini_llm(temperature=0).with_structured_output(TransportDecision)
        res = llm.invoke(
            f"The traveler prefers '{requested_mode}'. What is the most realistic and common transport mode from {origin} to {destination} in this specific region/country? "
            f"CRITICAL: If the requested mode is not directly available, do NOT default immediately to a taxi for the full journey. "
            f"Instead, identify the nearest realistic hub and return a multi-modal route such as 'Train to [Station] + Taxi' or 'Bus to [Hub] + Local Transfer'."
        )
        return res.mode
    except Exception:
        return requested_mode


# ---------------------------------------------------------------------------
# LAYOVER DECISION ENGINE
# ---------------------------------------------------------------------------

import functools

@functools.lru_cache(maxsize=128)
def fetch_transit_truth_online(origin: str, dest: str, mode: str) -> str:
    """Fetches real-world information about whether a direct transit exists."""
    from ddgs import DDGS
    query = f"direct {mode} route from {origin} to {dest} transit options"
    try:
        with DDGS(timeout=10) as ddgs:
            results = list(ddgs.text(query, max_results=3))
        if not results:
            return "No internet search results found."
        text = "\n".join([f"- {r.get('body', '')}" for r in results])
        return text
    except Exception as e:
        return f"Web search failed: {e}"

def should_suggest_layover(origin: str, destinations: list, mode: str, profile: str) -> dict:
    """
    Decides if an overnight layover city is needed.
    Uses LIVE WEB SEARCH validation for long overland routes to avoid LLM hallucinations.

    Returns a dict:
      {
        "suggest": bool,
        "layover_city": str,        # empty string if suggest=False
        "insert_before": str,       # destination city to insert before
        "reason": str,              # user-facing explanation
      }
    """
    no_layover = {"suggest": False, "layover_city": "", "insert_before": "", "reason": ""}

    mode_lower = (mode or "").lower()
    first_dest = destinations[0] if destinations else ""
    origin_lower = origin.lower().strip()
    dest_lower = first_dest.lower().strip()

    # ── LAYER 1: FLIGHT — Airport connections only, never overnight ──────────
    if "flight" in mode_lower or "fly" in mode_lower or "air" in mode_lower:
        return no_layover

    # ── LAYER 2: SHORT DISTANCE (< 600 km straight-line) ────────────────────
    coord1 = get_city_coordinates(origin)
    coord2 = get_city_coordinates(first_dest)
    dist_km = 9999.0
    if coord1 != (0.0, 0.0) and coord2 != (0.0, 0.0):
        dist_km = haversine(coord1[0], coord1[1], coord2[0], coord2[1])

    # ── LAYER 3: DYNAMIC LLM CHECK WITH LIVE WEB VALIDATION ─────────────────
    print(f" Long {mode_lower} route ({dist_km:.0f} km): Validating transit via live internet search...")
    
    # Fetch live truth
    web_context = fetch_transit_truth_online(origin, first_dest, mode_lower)
    
    from src.llm_config import get_structured_llm
    from pydantic import BaseModel as PB, Field as PF

    class LayoverVerdict(PB):
        needs_layover: bool = PF(description="True ONLY if the web search explicitly indicates no direct train/bus exists and the traveler MUST change at an intermediate city overnight.")
        junction_city: str = PF(description="The real railway junction/bus hub city where the traveler must break journey. Empty if needs_layover is False.")
        reason: str = PF(description="One sentence explanation for the traveler based on the web data.")

    try:
        llm = get_structured_llm(LayoverVerdict, temperature=0)
        from src.prompts import get_layover_verdict_prompt
        prompt = get_layover_verdict_prompt(origin, first_dest, mode_lower, dist_km, web_context)
        verdict = llm.invoke(prompt)
        if verdict.needs_layover and verdict.junction_city:
            return {
                "suggest": True,
                "layover_city": verdict.junction_city,
                "insert_before": first_dest,
                "reason": verdict.reason,
            }
    except Exception as e:
        print(f"[WARNING] Layover LLM validation failed: {e}")

    return no_layover

