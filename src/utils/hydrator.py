import os
import json
from typing import Dict, List, Optional
from src.schemas.trip_schema import TripItinerary, TripOption, CityStop

CACHE_DIR = "cache"
COORDS_CACHE_FILE = os.path.join(CACHE_DIR, "coordinates.json")

def _load_cache(filepath: str) -> dict:
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def _save_cache(filepath: str, data: dict):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)

def hydrate_coordinates(city_name: str, coords_cache: dict) -> List[float]:
    """
    Fetches [longitude, latitude] for a city.
    Uses a two-level cache (in-memory dict + disk JSON).
    
    Uses get_city_coordinates from helpers.py which applies
    state/country hints (e.g. "Goa, India") to avoid geocoding
    ambiguous names like "Vasco da Gama" to the wrong country.
    """
    if not city_name:
        return [0.0, 0.0]
    
    city_key = city_name.strip().lower()
    
    # 1. Check in-request cache first (fast)
    if city_key in coords_cache:
        return coords_cache[city_key]
    
    # 2. Use context-aware coordinate lookup (uses state_hints to disambiguate)
    try:
        from src.utils.helpers import get_city_coordinates
        lat, lon = get_city_coordinates(city_name)
        if lat != 0.0 or lon != 0.0:
            # Map stores [longitude, latitude] (GeoJSON order)
            coords = [lon, lat]
            coords_cache[city_key] = coords
            return coords
    except Exception as e:
        print(f"[WARNING] Coordinate lookup failed for {city_name}: {e}")
    
    return [0.0, 0.0]


def hydrate_images(city_name: str, dest_type: str) -> str:
    """
    Returns a high-quality, correct image URL for the given city
    using the multi-layer image pipeline.

    Priority:
      1. Curated Unsplash library (handpicked, always correct)
      2. Wikipedia REST API thumbnail (authoritative)
      3. Category-based Unsplash fallback
    """
    if not city_name:
        return "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1280&h=720&fit=crop&q=80"

    try:
        # Import here to avoid circular imports at module load
        import sys, os
        # Ensure the api package is importable from src context
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        from api.image_pipeline import get_destination_image
        return get_destination_image(city_name)
    except Exception as e:
        print(f"[WARNING] Image pipeline failed for {city_name}: {e}")

    # Hard fallback
    return f"https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1280&h=720&fit=crop&q=80"

def hydrate_destination_types(city_name: str, scratchpad: Optional[str]) -> str:
    """
    Determines the destination type based on simple keyword scoring.
    """
    text_to_analyze = f"{city_name} {scratchpad or ''}".lower()
    
    scores = {
        "mountain": sum(text_to_analyze.count(w) for w in ["mountain", "altitude", "hills", "snow", "trekking", "himalaya"]),
        "beach": sum(text_to_analyze.count(w) for w in ["beach", "coast", "shoreline", "ocean", "tropical", "sea"]),
        "urban": sum(text_to_analyze.count(w) for w in ["city", "nightlife", "downtown", "boulevard", "metropolis", "capital"]),
        "spiritual": sum(text_to_analyze.count(w) for w in ["temple", "monastery", "pilgrimage", "ashram", "holy"]),
        "transit": sum(text_to_analyze.count(w) for w in ["airport", "layover", "transit hub"])
    }
    
    # Get type with highest score
    max_score = max(scores.values())
    if max_score > 0:
        for t, s in scores.items():
            if s == max_score:
                return t
                
    # Fallbacks based on common heuristics
    if "layover" in text_to_analyze:
        return "transit"
    
    return "urban"

def hydrate_trip_itinerary(itinerary: TripItinerary) -> TripItinerary:
    """
    Takes a validated TripItinerary and enriches it with coordinates, images, and types.
    """
    coords_cache = _load_cache(COORDS_CACHE_FILE)
    
    for option in itinerary.options:
        prev_coords = [0.0, 0.0]
        
        for stop in option.route:
            # 1. Typology (always overwrite)
            stop.type = hydrate_destination_types(stop.city, stop.planner_scratchpad)
                
            # 2. Images (always overwrite)
            stop.image = hydrate_images(stop.city, stop.type)
                
            # 3. Coordinates (always overwrite)
            coords = hydrate_coordinates(stop.city, coords_cache)
            if coords == [0.0, 0.0] and prev_coords != [0.0, 0.0]:
                # Fallback to previous city coordinates if geocoding failed
                coords = prev_coords
            stop.coordinates = coords
            prev_coords = coords

    _save_cache(COORDS_CACHE_FILE, coords_cache)
    return itinerary
