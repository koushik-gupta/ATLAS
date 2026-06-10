import json
from langchain_core.tools import tool
from ddgs import DDGS
from typing import Dict, Any, List, Optional
from src.llm_config import get_structured_llm
from pydantic import BaseModel, Field
from rich import print
import math
import requests
import time
import concurrent.futures
from src.prompts import get_places_tool_prompt
from src.utils.helpers import haversine, parse_rating
import os

class ParsedPlace(BaseModel):
    name: str = Field(description="Name of the place or attraction")
    address: str = Field(description="Address or location area")
    rating: str = Field(description="Rating out of 10 (e.g., '8.5', '4.5/5')")
    reviews: Optional[int] = Field(default=100, description="Approximate number of Google reviews if mentioned, or default to 100")
    lat: float = Field(description="Approximate latitude coordinate of the attraction")
    lon: float = Field(description="Approximate longitude coordinate of the attraction")

class PlaceList(BaseModel):
    results: List[ParsedPlace]

def _fetch_llm_flagships(destination: str) -> List[Dict]:
    prompt = f"""You are a world-class travel expert database.
The user is requesting the absolute must-see, iconic, Tier-1 flagship tourist attractions and excursions for: {destination}.

CRITICAL INSTRUCTIONS:
1. You MUST list the most famous, iconic landmarks first (e.g. for Darjeeling: Tiger Hill, Batasia Loop, Ghoom Monastery).
2. Generate exactly 10 top flagship attractions. Do NOT pad with generic cafes.
3. Provide an approximate but highly accurate latitude (lat) and longitude (lon) for each attraction. This is CRITICAL. Use floats.
4. 'rating' should be a realistic string like '4.7/5'.
5. 'reviews' should be a realistic integer like 15000 or 2500 depending on popularity.
6. 'address' should be a brief location string."""
    try:
        structured_llm = get_structured_llm(PlaceList, temperature=0.1).with_retry(stop_after_attempt=3)
        parsed = structured_llm.invoke(prompt)
        return [p.model_dump() for p in parsed.results]
    except Exception as e:
        print(f"[WARNING] LLM flagship generation failed: {e}")
        return []

def _fetch_serpapi_places(destination: str, serpapi_key: str) -> List[Dict]:
    try:
        params = {
            "engine": "google_local",
            "q": f"Top tourist attractions in {destination} India",
            "api_key": serpapi_key
        }
        res = requests.get("https://serpapi.com/search", params=params, timeout=10)
        if res.status_code == 200:
            maps_results = res.json().get("local_results", [])
            parsed_results = []
            for r in maps_results[:10]: # Take top 10
                name = r.get("title", "")
                if not name: continue
                rating = parse_rating(r.get("rating"), default=0.0)
                try: reviews = int(r.get("reviews") or 0)
                except: reviews = 0
                coords = r.get("gps_coordinates", {})
                lat = float(coords.get("latitude") or 0.0)
                lon = float(coords.get("longitude") or 0.0)
                
                parsed_results.append({
                    "name": name,
                    "address": r.get("address", ""),
                    "rating": str(rating),
                    "reviews": reviews,
                    "lat": lat,
                    "lon": lon
                })
            return parsed_results
    except Exception as e:
        print(f"[WARNING] SerpApi search failed: {e}")
    return []

@tool
def places_search(destination: str, category_type: str = "attractions") -> List[Dict[str, Any]]:
    """
    Search for places in a destination.
    category_type must be 'attractions' (museums, parks, landmarks). 'dining' is disabled.
    Returns up to 20 locations with their name, address, ratings, lat, lon and _meta_city_score.
    """
    if category_type == "dining":
        print(" Dining category is disabled for token optimization. Returning empty list.")
        return []

    print(f" Generating merged Flagships + Local Maps data for {destination}...")
    
    serpapi_key = os.getenv("SERPAPI_KEY")
    places_data = []
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f_llm = executor.submit(_fetch_llm_flagships, destination)
        f_serp = executor.submit(_fetch_serpapi_places, destination, serpapi_key) if serpapi_key else None
        
        llm_results = f_llm.result()
        serp_results = f_serp.result() if f_serp else []
        
    # Merge and deduplicate by name similarity (favoring SerpApi for exact coords if duplicates exist)
    merged_places = []
    seen_names = set()
    
    # Add SerpApi real-world data first to prioritize their exact coordinates
    for p in serp_results:
        name_lower = p["name"].lower()
        if name_lower not in seen_names:
            seen_names.add(name_lower)
            merged_places.append(p)
            
    # Then append LLM flagships if they aren't already covered
    for p in llm_results:
        # A bit more aggressive deduplication for LLM vs Maps
        is_duplicate = False
        p_name = p["name"].lower()
        for existing in seen_names:
            if p_name in existing or existing in p_name:
                is_duplicate = True
                break
        
        if not is_duplicate:
            seen_names.add(p_name)
            merged_places.append(p)

    if not merged_places:
        return [{"error": "Failed to fetch any attractions."}]
        
    print(f"[SUCCESS] Merged {len(serp_results)} Maps places and {len(llm_results)} LLM flagships into {len(merged_places)} unique attractions.")
    
    import statistics
    import math

    valid_reviews = []
    for p in merged_places:
        try:
            if p.get("reviews"):
                valid_reviews.append(int(p["reviews"]))
        except: pass
    
    median_reviews = int(statistics.median(valid_reviews)) if valid_reviews else 100

    total_city_score = 0.0
    for p in merged_places:
        r_val = p.get("rating") or "0.0"
        rev_val = p.get("reviews")
        if rev_val is None:
            rev_val = median_reviews
            p["reviews"] = rev_val
            
        try: r_val = parse_rating(r_val, default=0.0)
        except: r_val = 0.0
        try: rev_val = int(rev_val)
        except: rev_val = median_reviews
        
        total_city_score += r_val * math.log(max(rev_val, 0) + 1)
        
    for p in merged_places:
        p["_meta_city_score"] = round(total_city_score, 2)
        p["city"] = destination

    return merged_places
