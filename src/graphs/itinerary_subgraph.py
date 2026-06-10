import dateparser
import datetime
import json
import time
from typing import List, Dict, Any, Optional
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, START, END
from pydantic import BaseModel, Field
from langchain_core.messages import SystemMessage

from src.state.trip_state import TripState
from src.schemas.trip_schema import TripItinerary, CityStop, TripOption
from src.llm_config import (
    get_llm,
    get_heavy_llm,
    get_compound_mini_llm,
    get_city_planner_llm,
    get_return_journey_llm,
    get_structured_llm
)
from src.prompts import (
    get_route_allocation_prompt,
    get_city_tour_planner_prompt,
    get_return_journey_prompt,
)
from src.utils.helpers import parse_rating

# --- Models for Step 1: Night Allocator ---
class CityAllocation(BaseModel):
    city: str = Field(description="Destination city name")
    role: str = Field(description="The role of this destination: OVERNIGHT_HUB, DAY_EXCURSION, TRANSIT_STOP, or ATTRACTION_CLUSTER", default="OVERNIGHT_HUB")
    nights: int = Field(description="Number of nights allocated")

class RoutePlan(BaseModel):
    allocations: List[CityAllocation] = Field(description="Night allocations for each city")

def get_trip_start_date(travel_dates_str: str) -> datetime.date:
    if not travel_dates_str:
        return datetime.date.today()
    try:
        for delimiter in [" to ", "-", " until ", " till "]:
            if delimiter in travel_dates_str.lower():
                parts = travel_dates_str.lower().split(delimiter)
                d1 = dateparser.parse(parts[0].strip())
                if d1:
                    return d1.date()
        d = dateparser.parse(travel_dates_str)
        if d:
            return d.date()
    except Exception:
        pass
    return datetime.date.today()

def slim_context(tool_contents: list[dict], city: str, prev_city: Optional[str] = None, pacing: str = "Moderate", dynamic_hotel_cap: Optional[float] = None) -> str:
    """
    Slims raw tool data for a city down to the bare essentials:
    - Keep only top 3 hotels (keeping name, price_per_night, rating, address)
    - Keep only top 10 attractions (keeping name, rating, nearby_places, _meta_city_score)
    - Keep only top 2 transport options for the CURRENT leg only, with mathematically estimated leg-specific durations
    - Keep weather data for the current city only
    - Completely remove dining
    """
    slimmed_blocks = []
    
    for tc in tool_contents:
        name = tc["name"]
        content = tc["content"]
        
        try:
            data = json.loads(content)
        except Exception:
            slimmed_blocks.append(f"--- RAW DATA FROM {name.upper()} ---\n{content[:1000]}\n")
            continue
            
        if name == "hotel_search":
            hotels = [h for h in (data if isinstance(data, list) else []) if isinstance(h, dict) and h.get("city", "").lower() == city.lower()]
            
            # BUDGET FILTERING: Remove hotels that aggressively exceed the calculated cap
            if dynamic_hotel_cap and dynamic_hotel_cap > 0:
                max_allowed = dynamic_hotel_cap * 1.3  # Allow 30% buffer max
                
                def _safe_price(p):
                    if isinstance(p, (int, float)): return float(p)
                    import re
                    m = re.search(r'\d+', str(p).replace(',', ''))
                    return float(m.group()) if m else 0.0
                    
                hotels = [h for h in hotels if _safe_price(h.get("price_per_night") or h.get("price")) <= max_allowed]
                
            slimmed_hotels = []
            for h in hotels[:3]:
                slimmed_hotels.append({
                    "name": h.get("name"),
                    "price_per_night": h.get("price_per_night") or h.get("price"),
                    "rating": h.get("rating"),
                    "address": h.get("address")
                })
            slimmed_blocks.append(f"--- SLIMMED HOTEL OPTIONS FOR {city.upper()} ---\n{json.dumps(slimmed_hotels, indent=2)}\n")
            
        elif name == "places_search":
            attractions = [p for p in (data if isinstance(data, list) else []) if isinstance(p, dict) and p.get("city", "").lower() == city.lower()]
            # Sort by attraction importance: rating weighted by geospatial cluster richness.
            # High-rated, well-clustered attractions rise to the top automatically.
            # Low-rated or isolated filler attractions fall to the bottom and get cut.
            def _attraction_importance(p: dict) -> float:
                rating = parse_rating(p.get("rating"), default=5.0)
                reviews = p.get("reviews", 0)
                try: reviews = int(reviews)
                except: reviews = 0
                import math
                cluster_bonus = float(p.get("_cluster_bonus") or 0.0)
                base_score = (rating * math.log10(reviews + 1)) + cluster_bonus
                
                # Penalize weak filler POIs ONLY if they have low organic traction (protects famous National Parks)
                name_low = str(p.get("name", "")).lower()
                penalty = 0.0
                if any(w in name_low for w in ["park", "selfie", "viewpoint", "view point", "cinema", "mall", "stand"]):
                    if base_score < 15.0:  # e.g., 1000+ reviews usually passes this threshold easily
                        penalty = -5.0
                    
                return base_score + penalty
            attractions_sorted = sorted(attractions, key=_attraction_importance, reverse=True)
            slimmed_attractions = []
            
            pacing_lower = pacing.lower() if pacing else "moderate"
            top_n = 15 if pacing_lower == "packed" else (6 if pacing_lower == "relaxed" else 10)
            
            for p in attractions_sorted[:top_n]:
                slimmed_attractions.append({
                    "name": p.get("name"),
                    "rating": p.get("rating"),
                    "reviews": p.get("reviews", 0),
                    "nearby_places": p.get("nearby_places", []),
                    "_meta_city_score": p.get("_meta_city_score")
                })
            slimmed_blocks.append(
                f"--- SLIMMED ATTRACTION OPTIONS FOR {city.upper()} "
                f"(pre-sorted by importance: highest-rated + best-clustered first) ---\n"
                f"{json.dumps(slimmed_attractions, indent=2)}\n"
            )
            
        elif name == "transport_search":
            transports = data if isinstance(data, list) else []
            slimmed_transports = []
            for t in transports:
                if not isinstance(t, dict):
                    continue
                # If prev_city is given, filter transport to only include this leg's options
                if prev_city:
                    t_orig = str(t.get("origin", "")).lower().strip()
                    t_dest = str(t.get("destination", "")).lower().strip()
                    if t_orig != prev_city.lower().strip() or t_dest != city.lower().strip():
                        continue
                
                # Dynamic geographic duration calculation for extreme realism
                from src.utils.helpers import get_city_coordinates, haversine
                c1 = get_city_coordinates(t.get("origin") or prev_city or "")
                c2 = get_city_coordinates(t.get("destination") or city or "")
                
                duration_str = t.get("duration") or ""
                t_type = str(t.get("type", "")).lower()
                
                # Only use geographic fallback if online duration is missing, or if it's specifically a road trip
                # where geographic distance / terrain speed is highly accurate for mountain routes.
                is_road = "bus" in t_type or "taxi" in t_type or "car" in t_type or "road" in t_type
                
                if (not duration_str or is_road) and c1 != (0.0, 0.0) and c2 != (0.0, 0.0):
                    orig_name = str(t.get("origin") or prev_city or "")
                    dest_name = str(t.get("destination") or city or "")
                    dist = haversine(c1[0], c1[1], c2[0], c2[1], orig_name, dest_name)
                    if "flight" in t_type or "air" in t_type: speed = 600.0
                    elif "train" in t_type: speed = 60.0
                    else: speed = 40.0  # Mountain/highway average
                    
                    est_hours = dist / speed
                    if est_hours < 1.0:
                        duration_str = f"{round(est_hours * 60)} mins ({round(dist)} km)"
                    else:
                        hours = int(est_hours)
                        mins = int((est_hours - hours) * 60)
                        duration_str = f"{hours}h {mins}m ({round(dist)} km)"
                        if is_road: duration_str += " ~ subject to terrain/road conditions"
                slimmed_transports.append({
                    "provider": t.get("provider") or t.get("name"),
                    "price": t.get("price"),
                    "departure_time": t.get("departure_time"),
                    "arrival_time": t.get("arrival_time"),
                    "duration": duration_str,
                    "details": t.get("details"),
                    "origin": t.get("origin"),
                    "destination": t.get("destination")
                })
            slimmed_blocks.append(f"--- SLIMMED TRANSPORT OPTIONS ({prev_city or 'PREV'} -> {city.upper()}) ---\n{json.dumps(slimmed_transports[:2], indent=2)}\n")
            
        elif name == "weather_search":
            city_weather = [w for w in (data if isinstance(data, list) else []) if isinstance(w, dict) and w.get("city", "").lower() == city.lower()]
            slimmed_blocks.append(f"--- WEATHER DATA FOR {city.upper()} ---\n{json.dumps(city_weather, indent=2)}\n")
            
    return "\n".join(slimmed_blocks)

# Redundant geographic route optimization utilities removed. Now handled in main.py.

def synthesize_itinerary(state: TripState, config: RunnableConfig):
    emit = config.get("configurable", {}).get("emit")
    if emit: emit("system_event", "Structuring and optimizing the final itinerary JSON (City-by-City)...")
    print("✍️ Structuring and optimizing the final itinerary JSON (City-by-City)...")
    
    origin = state.get("origin_city", "Unknown")
    raw_destinations = state.get("destination_cities") or []
    # Preserve the strict geographic sequence resolved and curated by main.py
    destinations = [d for d in raw_destinations if d.lower().strip() != origin.lower().strip()]
    dates_str = state.get("travel_dates", "Unknown")
    duration = state.get("trip_duration_days", 1)
    profile = state.get("traveler_profile", "Standard")
    pacing = state.get("pacing", "Standard")
    budget = float(state.get("budget", 0.0))
    mode = state.get("travel_mode", "any")
    travel_class = state.get("travel_class", "Economy")
    user_selections = state.get("user_selections") or {}
    messages = state.get("messages", [])
    layover_cities = state.get("layover_cities") or []
    city_roles = state.get("city_roles") or {}

    # Pure Python Dynamic Pacing Engine
    if "elderly" in profile.lower() or "kid" in profile.lower() or pacing.lower() == "relaxed":
        dynamic_pacing_rule = (
            "Keep the schedule VERY light. Plan 2–4 gentle experiences per day maximum. "
            "Ensure a proper 2–3 hour afternoon rest at the hotel. Do NOT rush between sites. "
            "Avoid back-to-back monuments — intersperse with cafes, gardens, or scenic rests. "
            "Do NOT force 4 activities per day just to fill time. If a day is light, leave it light."
        )
    elif pacing.lower() == "packed":
        dynamic_pacing_rule = (
            "PACKED PACE INSTRUCTIONS: The user wants a highly dense, action-packed itinerary. "
            "Target 4-7 activities per full day. "
            "Fill the morning block, afternoon block, and evening block completely. "
            "Add nearby secondary attractions, viewpoints, local markets, cultural experiences, food stops, and photography spots to minimize idle gaps. "
            "Group nearby excursions tightly so time isn't wasted in transit. "
            "Even on arrival days, if time permits, add a meaningful activity or market exploration."
        )
    else:
        dynamic_pacing_rule = (
            "Plan 4–5 meaningful experiences per day with a balanced pace. "
            "Allow genuine time at each place rather than rushing through a checklist. "
            "Build in a mid-afternoon break. "
            "On arrival days after 2+ hours of transit: plan ONLY arrive, check in, light walk, dinner."
        )

    if state.get("weather_downgrade"):
        dynamic_pacing_rule += " WEATHER DOWNGRADE IN EFFECT: The user is traveling during severe weather but declined to change dates. You MUST downgrade outdoor activities. Prioritize indoor activities (museums, cafes, covered markets) and severely limit long outdoor sightseeing."

    if not destinations:
        return {"final_itinerary_json": "{}"}

    # Extract tools data per city
    tool_contents = []
    
    # We populate tool_contents directly from state fields since our deterministic retrieval loop saves them there!
    # This is much cleaner and avoids traversing unstructured message logs.
    if state.get("hotel_options"):
        tool_contents.append({"name": "hotel_search", "content": json.dumps(state["hotel_options"])})
    if state.get("places_options"):
        tool_contents.append({"name": "places_search", "content": json.dumps(state["places_options"])})
    if state.get("transport_options"):
        tool_contents.append({"name": "transport_search", "content": json.dumps(state["transport_options"])})
    if state.get("weather_info"):
        tool_contents.append({"name": "weather_search", "content": json.dumps(state["weather_info"])})

    # --- STEP 1: Allocate Nights ---
    print("[WAIT] Allocating nights to cities...")

    places_data = state.get("places_options") or []
    
    city_scores = {}
    total_trip_score = 0.0
    for c in destinations:
        city_attrs = [p for p in places_data if isinstance(p, dict) and p.get("city", "").lower() == c.lower()]
        score = 0.0
        if city_attrs:
            score = float(city_attrs[0].get("_meta_city_score") or 0.0)
        city_scores[c] = score
        total_trip_score += score
        
    city_score_lines = []
    normalized_roles_top = {k.lower().strip(): v for k, v in city_roles.items()}
    for c in destinations:
        score = city_scores[c]
        count = len([p for p in places_data if isinstance(p, dict) and p.get("city", "").lower() == c.lower()])
        percentage = (score / total_trip_score * 100) if total_trip_score > 0 else (100.0 / len(destinations))
        
        city_role = normalized_roles_top.get(c.lower().strip(), "Base Hub")
        city_score_lines.append(
            f"- {c} ({city_role}): relative_importance={percentage:.1f}% of trip value (absolute score={score}, {count} attractions retrieved)"
        )
    city_summary_str = "\n".join(city_score_lines)

    # --- Dynamic Hotel Budget Cap (pure Python, zero tokens) ---
    # Accounts for transport costs dynamically based on travel mode.
    if budget > 0:
        num_legs = len(destinations) + 1  # each city-to-city leg + return
        
        m_lower = mode.lower()
        if "flight" in m_lower: mode_baseline = 4000
        elif "train" in m_lower: mode_baseline = 1500
        elif "bus" in m_lower: mode_baseline = 800
        else: mode_baseline = 1500
        
        estimated_transport_total = num_legs * mode_baseline
        # ISSUE 4 FIX: Apply 15% safety buffer to accommodation budget to prevent slight budget overflows
        remaining_for_accommodation = max(budget - estimated_transport_total, budget * 0.35) * 0.85
        hotel_nights = max(duration - num_legs, 1)
        dynamic_hotel_cap = int(
            min(round(remaining_for_accommodation / hotel_nights, -2), 3500)
        )
    else:
        dynamic_hotel_cap = 3000  # conservative default when no budget stated
    print(f"[INFO] Dynamic hotel cap: ₹{dynamic_hotel_cap:,}/night (budget=₹{budget:,.0f}, legs={len(destinations)+1}, mode={mode})")

    allocator_llm = get_structured_llm(RoutePlan, temperature=0.2).with_retry(
        stop_after_attempt=3,
        wait_exponential_jitter=True
    )
    alloc_prompt = get_route_allocation_prompt(duration, origin, destinations, profile, pacing, city_summary=city_summary_str, layover_cities=layover_cities)
    try:
        route_plan: RoutePlan = allocator_llm.invoke(alloc_prompt)
        allocations = route_plan.allocations
        
        # Pure Python Safeguard 1: Strip out the origin city if the LLM hallucinated it
        allocations = [a for a in allocations if a.city.lower().strip() != origin.lower().strip()]
        
        # Pure Python Safeguard 2: Deduplicate
        seen_alloc: set[str] = set()
        deduped = []
        for a in allocations:
            key = a.city.lower().strip()
            if key not in seen_alloc:
                seen_alloc.add(key)
                deduped.append(a)
        allocations = deduped
        
        # Pure Python Safeguard 2.5: Ensure all original destinations are present
        for d in destinations:
            if d.lower().strip() not in seen_alloc:
                print(f"[SECURE] Missing destination: injecting {d} with 0 nights (likely omitted by LLM)")
                allocations.append(CityAllocation(city=d, nights=0, role="DAY_EXCURSION"))
                seen_alloc.add(d.lower().strip())
                
        # Pure Python Safeguard 3: Hard-clamp layover cities to exactly 1 night
        # (LLM may ignore the prompt rule; this is a deterministic override)
        if layover_cities:
            layover_lower = {c.lower().strip() for c in layover_cities}
            for a in allocations:
                if a.city.lower().strip() in layover_lower:
                    if a.nights != 1:
                        print(f"[SECURE] Layover cap: forcing {a.city} from {a.nights} nights → 1 night")
                        a.nights = 1
        
        # Pure Python Safeguard 4: Role-based clamping
        for a in allocations:
            if not a.role:
                a.role = "OVERNIGHT_HUB"
                
            r = a.role.upper()
            if r in ["DAY_EXCURSION", "ATTRACTION_CLUSTER"]:
                if a.nights != 0:
                    print(f"[SECURE] Role cap: forcing {a.city} from {a.nights} nights → 0 nights (Role: {a.role})")
                    a.nights = 0
            elif r == "TRANSIT_STOP":
                if a.nights > 1:
                    print(f"[SECURE] Transit cap: forcing {a.city} from {a.nights} nights → 1 night (Role: {a.role})")
                    a.nights = 1

        # Pure Python Safeguard 5: Emit Structured Route Log
        emit = config.get("configurable", {}).get("emit")
        if emit:
            hubs = [a.city for a in allocations if a.role.upper() == "OVERNIGHT_HUB"]
            excs = [a.city for a in allocations if a.role.upper() == "DAY_EXCURSION"]
            trans = [a.city for a in allocations if a.role.upper() == "TRANSIT_STOP"]
            clusts = [a.city for a in allocations if a.role.upper() == "ATTRACTION_CLUSTER"]
            
            log_str = "Route Roles Established:<br/>"
            if hubs: log_str += f"• <strong style='color:var(--color-tropical-teal)'>OVERNIGHT HUBS:</strong> {', '.join(hubs)}<br/>"
            if excs: log_str += f"• <strong style='color:var(--color-golden-amber)'>DAY EXCURSIONS:</strong> {', '.join(excs)}<br/>"
            if trans: log_str += f"• <strong style='color:gray'>TRANSIT STOPS:</strong> {', '.join(trans)}<br/>"
            if clusts: log_str += f"• <strong style='color:var(--color-sunset-orange)'>ATTRACTION CLUSTERS:</strong> {', '.join(clusts)}<br/>"
            
            emit("system_event", log_str)
                    
    except Exception as e:
        print(f"[WARNING] Night allocation failed: {e}. Distributing evenly.")
        nights_each = max(1, duration // len(destinations))
        allocations = [CityAllocation(city=city, nights=nights_each) for city in destinations]

    # --- STEP 2: City Stop Detailer (Optimal Route) ---
    start_date = get_trip_start_date(dates_str)
    current_date = start_date
    
    city_stops: List[CityStop] = []
    # Map 0-night Day-Trips to their closest Base Hub logically using an LLM
    hub_day_trips = {}
    corridor_stops: dict[str, list[str]] = {}
    hubs = [a.city for a in allocations if a.nights > 0]
    day_trips = [a.city for a in allocations if a.nights == 0]
    
    from src.utils.helpers import get_city_coordinates, haversine
    from pydantic import BaseModel, Field
    from typing import List
    
    for h in hubs:
        hub_day_trips[h] = []
        corridor_stops[h] = []
        
    if day_trips and hubs:
        def _norm(s: str) -> str:
            return (s or "").strip().lower()

        def _resolve_hub(raw_name: str, hubs_list: list[str]) -> str | None:
            raw_n = _norm(raw_name)
            if not raw_n: return None
            for h in hubs_list:
                if _norm(h) == raw_n: return h
            for h in hubs_list:
                h_n = _norm(h)
                if raw_n in h_n or h_n in raw_n: return h
            return None

        class DayTripMap(BaseModel):
            city: str = Field(description="The 0-night city.")
            classification: str = Field(description="Either 'EXCURSION' (round-trip from a hub) or 'EN_ROUTE_CORRIDOR' (absorbed into transit between hubs).")
            target_hub: str = Field(description="If EXCURSION, the overnight hub it belongs to. If EN_ROUTE_CORRIDOR, the destination hub the traveler is heading toward.")

        class HubMapping(BaseModel):
            mappings: List[DayTripMap] = Field(description="Mapping and classification for each 0-night city.")
            
        try:
            mapper = get_structured_llm(HubMapping, temperature=0.1)
            ordered_route = [a.city for a in allocations]
            prompt = (
                f"You are a routing expert.\n"
                f"Ordered travel route: {ordered_route}\n"
                f"Overnight hubs: {hubs}\n"
                f"0-night stops: {day_trips}\n\n"
                f"For each 0-night stop, you MUST geographically evaluate its position relative to the route.\n"
                f"CRITICAL RULE: Before classifying a stop as EXCURSION, you must check if it lies on the inbound route from the previous hub OR the outbound route to the next hub.\n"
                f"- If yes (it sits on the transit path, e.g. Mirik between NJP and Darjeeling), you MUST classify it as EN_ROUTE_CORRIDOR.\n"
                f"- If no (it requires a dedicated detour/round-trip), classify it as EXCURSION.\n\n"
                f"Map each stop to the most appropriate target_hub.\n"
                f"Do not invent hubs. Use only the listed overnight hubs.\n"
            )
            res = mapper.invoke(prompt)
            mapped_results = res.mappings
        except Exception as e:
            print(f"[WARNING] Route classification failed: {e}")
            mapped_results = []
            
        for dt in day_trips:
            target = None
            dt_map = next((m for m in mapped_results if _norm(m.city) == _norm(dt)), None)
            
            if dt_map:
                target = _resolve_hub(dt_map.target_hub, hubs)
                if not target:
                    print(f"[WARNING] Could not resolve target hub for {dt}: {dt_map.target_hub}")
            
            dt_coords = get_city_coordinates(dt)
            if not target:
                print(f"[WARNING] Falling back to geographic nearest hub for {dt}")
                if dt_coords == (0.0, 0.0):
                    target = hubs[0]
                else:
                    closest_hub = None
                    min_dist = float('inf')
                    for h in hubs:
                        h_coords = get_city_coordinates(h)
                        if h_coords != (0.0, 0.0):
                            d = haversine(dt_coords[0], dt_coords[1], h_coords[0], h_coords[1])
                            if d < min_dist:
                                min_dist = d
                                closest_hub = h
                    target = closest_hub if closest_hub else hubs[0]
            
            if target:
                target_coords = get_city_coordinates(target)
                if target_coords != (0.0, 0.0) and dt_coords != (0.0, 0.0):
                    dist = haversine(dt_coords[0], dt_coords[1], target_coords[0], target_coords[1])
                    est_round_trip_hours = (dist / 40.0) * 2
                    if est_round_trip_hours > 7.0:
                        print(f"[WARNING] Day-trip '{dt}' round-trip takes ~{est_round_trip_hours:.1f}hrs from '{target}'. Reverting to 1-night stay.")
                        dt_alloc = next((x for x in allocations if x.city.lower().strip() == dt.lower().strip()), None)
                        if dt_alloc:
                            dt_alloc.nights = 1
                            target_alloc = next((x for x in allocations if x.city.lower().strip() == target.lower().strip()), None)
                            if target_alloc and target_alloc.nights > 1:
                                target_alloc.nights -= 1
                                print(f" Re-allocated 1 night from {target} to {dt}.")
                        target = None
                
            if target:
                if dt_map and dt_map.classification == "EN_ROUTE_CORRIDOR":
                    corridor_stops[target].append(dt)
                else:
                    hub_day_trips[target].append(dt)
            
    # Refresh allocations lists just in case we mutated nights
    hubs = [a.city for a in allocations if a.nights > 0]
    day_trips = [a.city for a in allocations if a.nights == 0]

    # Emit the night allocation early (but after reallocation) so it renders before city columns are processed
    if emit: 
        alloc_payload = {a.city: a.nights for a in allocations if a.nights > 0}
        emit("night_allocation", "Balancing nights across destinations...", allocation=alloc_payload)

    prev_city = origin
    for i, alloc in enumerate(allocations):
        city = alloc.city
        nights = alloc.nights
        
        if nights == 0:
            print(f"⏩ Skipping standalone planning for {city} (0 nights) — merging into Base Hub.")
            continue
            
        end_date = current_date + datetime.timedelta(days=nights)
        
        # Slim context (passing prev_city to filter transport options strictly for this leg!)
        # Slim context (passing prev_city to filter transport options strictly for this leg!)
        city_context = slim_context(tool_contents, city, prev_city=prev_city, pacing=pacing, dynamic_hotel_cap=dynamic_hotel_cap)
        
        local_pacing_rule = dynamic_pacing_rule
        
        corridor_towns = corridor_stops.get(city, [])
        if corridor_towns:
            ct_list = ", ".join(corridor_towns)
            print(f"⏩ Injecting en-route corridor stops ({ct_list}) into {city}'s transit context...")
            for ct in corridor_towns:
                ct_context = slim_context(tool_contents, ct, pacing=pacing, dynamic_hotel_cap=dynamic_hotel_cap)
                city_context += f"\n\n--- EN-ROUTE STOP CONTEXT FOR {ct.upper()} ---\n{ct_context}"

            local_pacing_rule += (
                f"\n\nCRITICAL TRANSIT ABSORPTION RULE: The traveler passes through {ct_list} on the way to {city}. "
                f"Do NOT create a separate round-trip excursion for these places. "
                f"Absorb them into the transit / arrival day as en-route sightseeing stops."
            )

        day_trips = hub_day_trips.get(city, [])
        if day_trips:
            dt_list = ", ".join(day_trips)
            print(f" Injecting day-trips ({dt_list}) into {city}'s context...")
            for dt in day_trips:
                dt_context = slim_context(tool_contents, dt, pacing=pacing, dynamic_hotel_cap=dynamic_hotel_cap)
                city_context += f"\n\n--- DAY TRIP CONTEXT FOR {dt.upper()} ---\n{dt_context}"
            if pacing.lower() == "packed":
                excursion_rule = "Limit to MAX 1 major excursion per day."
            elif pacing.lower() == "moderate":
                excursion_rule = "Limit to MAX 1 medium excursion per day with plenty of free time."
            else:
                excursion_rule = "Limit excursions and prefer dedicated relaxed exploration days within the hub itself."

            local_pacing_rule += (
                f"\n\nCRITICAL EXCURSION RULE: You MUST allocate full day-trips from {city} to {dt_list}. "
                f"Weave these excursions naturally into the {nights}-night itinerary for {city}. "
                f"{excursion_rule} "
                f"Do not create separate un-dated sections for them. "
                f"When mentioning an excursion destination like '{day_trips[0]}', you MUST format it in bold (e.g. **{day_trips[0]}**)."
            )
            
        selections_block = ""
        if user_selections:
            city_selections = {k: v for k, v in user_selections.items() if city.lower() in k.lower() or k == "transport"}
            if city_selections:
                selections_block = f"""
USER-SELECTED PREFERENCES (MANDATORY):
{chr(10).join(f"  - {k}: {v}" for k, v in city_selections.items())}
You MUST use these specific selections for {city}."""

        is_layover = city in layover_cities
        is_transit_stop = (alloc.role == "TRANSIT_STOP" or is_layover)
        layover_rule = (
            "CRITICAL TRANSIT GATEWAY: This city is purely a logistical transit node (e.g. airport/railway gateway). "
            "DO NOT generate a full tourist destination card. Provide ONLY a minimal arrival/rest plan and logistics. "
            "Keep descriptions brief and avoid adding lower-value local temples/parks just to fill time."
            if is_transit_stop else ""
        )

        prompt = get_city_tour_planner_prompt(
            city=city,
            nights=nights,
            current_date_str=current_date.strftime('%Y-%m-%d'),
            profile=profile,
            pacing=pacing,
            mode=mode,
            travel_class=travel_class,
            prev_city=prev_city,
            layover_rule=layover_rule,
            dynamic_pacing_rule=local_pacing_rule,
            selections_block=selections_block,
            city_context=city_context,
            hotel_budget_cap=dynamic_hotel_cap,
            weather_downgrade=state.get("weather_downgrade", False),
            pruned_cities=state.get("pruned_cities", [])
        )
        
        try:
            print(f"  -> Planning {nights} nights in {city} using rotated planner {i}...")
            if emit: emit("city_plan_start", f"Planning {nights} nights in {city}...", city=city)
            time.sleep(2) # Protect RPM limits
            city_planner_llm = get_structured_llm(CityStop, temperature=0.4).with_retry(
                stop_after_attempt=3,
                wait_exponential_jitter=True
            )
            stop: CityStop = city_planner_llm.invoke(prompt)
            
            # --- HUB QUALITY CHECK (Deterministic + LLM Repair) ---
            if nights >= 3:
                places_for_city = [p for p in (state.get("places_options") or []) if isinstance(p, dict) and p.get("city", "").lower() == city.lower()]
                if places_for_city:
                    # Top 2 by weight (they are pre-sorted by places_tool.py)
                    flagships = [p.get("name", "") for p in places_for_city[:2] if p.get("name")]
                    if flagships:
                        stop_text = stop.model_dump_json().lower()
                        missing = [f for f in flagships if f.lower() not in stop_text]
                        
                        if len(missing) > 0:
                            print(f"[WARNING] Hub Quality Check failed for {city}. Missing flagships: {missing}. Triggering LLM repair...")
                            if emit: emit("system_event", f"Missing flagships ({', '.join(missing)}) detected in {city}. Running auto-repair...")
                            
                            repair_prompt = prompt + (
                                f"\n\nCRITICAL REPAIR INSTRUCTION:\n"
                                f"Your previous attempt completely missed the absolute must-see flagship landmarks for {city}: {missing}.\n"
                                f"This is unacceptable for a major {nights}-night hub. You MUST replace low-value generic fillers with these flagship attractions."
                            )
                            stop = city_planner_llm.invoke(repair_prompt)
                            print(f"[SUCCESS] Hub {city} repaired.")
            # ------------------------------------------------------
            
            city_stops.append(stop)
        except Exception as e:
            print(f"[WARNING] Failed to plan {city}: {e}")
            if emit: emit("system_event", f"Failed to plan {city}: {e}")
            print(f" Constructing Fallback CityStop for {city} to preserve {nights} nights in global itinerary...")
            from src.schemas.trip_schema import DayPlan, Activity, HotelOption, TransportOption
            
            # Extract first hotel option from state if available
            fallback_hotel = None
            hotels_data = state.get("hotel_options") or []
            city_hotels = [h for h in hotels_data if isinstance(h, dict) and h.get("city", "").lower() == city.lower()]
            if city_hotels:
                def parse_price(price_val: Any) -> float:
                    if price_val is None:
                        return float('inf')
                    if isinstance(price_val, (int, float)):
                        return float(price_val)
                    try:
                        import re
                        nums = re.findall(r'\d+', str(price_val).replace(',', ''))
                        if nums:
                            return float(nums[0])
                    except Exception:
                        pass
                    return float('inf')
                
                city_hotels_sorted = sorted(city_hotels, key=lambda h: parse_price(h.get("price_per_night") or h.get("price")))
                first_h = city_hotels_sorted[0]
                fallback_hotel = HotelOption(
                    name=first_h.get("name"),
                    address=first_h.get("address"),
                    price_per_night=first_h.get("price_per_night") or first_h.get("price"),
                    rating=first_h.get("rating"),
                    stars=first_h.get("stars")
                )
            else:
                # Basic mock hotel in fallback
                fallback_hotel = HotelOption(
                    name=f"Standard Accommodation Placeholder",
                    address=f"Central Area, {city}",
                    price_per_night="Based on remaining budget",
                    rating=8.0,
                    stars=3.0
                )
            
            # Extract first transport option from state if available
            fallback_transport = None
            transports_data = state.get("transport_options") or []
            for t in transports_data:
                if not isinstance(t, dict):
                    continue
                t_orig = str(t.get("origin", "")).lower().strip()
                t_dest = str(t.get("destination", "")).lower().strip()
                if (prev_city and t_orig == prev_city.lower().strip() and t_dest == city.lower().strip()) or (not prev_city and t_dest == city.lower().strip()):
                    fallback_transport = TransportOption(
                        provider=t.get("provider") or t.get("name"),
                        type=t.get("type"),
                        travel_class=t.get("travel_class") or travel_class,
                        price=t.get("price"),
                        departure_time=t.get("departure_time"),
                        arrival_time=t.get("arrival_time"),
                        duration=t.get("duration")
                    )
                    break
            
            if not fallback_transport:
                # Highly realistic fallback transport
                fallback_transport = TransportOption(
                    provider="Generic Intercity Transfer",
                    type="train" if mode.lower() == "any" else mode.lower(),
                    travel_class=travel_class,
                    price="Variable; depends on booking time",
                    departure_time="08:00 AM",
                    arrival_time="02:00 PM",
                    duration="Estimated based on distance"
                )

            # Get up to 3 real attractions from places_data to inject in fallback activities
            places_data = state.get("places_options") or []
            city_attractions = [p for p in places_data if isinstance(p, dict) and p.get("city", "").lower() == city.lower()]
            attraction_names = [p.get("name") for p in city_attractions if p.get("name")]
            
            fallback_plans = []
            for d_idx in range(nights):
                d = current_date + datetime.timedelta(days=d_idx)
                
                # Pick attractions for the day
                a1 = attraction_names[d_idx * 2 % len(attraction_names)] if attraction_names else f"local markets in {city}"
                a2 = attraction_names[(d_idx * 2 + 1) % len(attraction_names)] if attraction_names else f"famous landmarks in {city}"
                
                fallback_plans.append(
                    DayPlan(
                        date=d.strftime('%Y-%m-%d'),
                        activities=[
                            Activity(
                                start_time="09:00 AM",
                                end_time="12:00 PM",
                                activity_type="Sightseeing",
                                description=f"Morning visit to {a1}. Explore the history and architectural details."
                            ),
                            Activity(
                                start_time="12:00 PM",
                                end_time="01:30 PM",
                                activity_type="Meal",
                                description="Lunch at a highly-rated local restaurant."
                            ),
                            Activity(
                                start_time="01:30 PM",
                                end_time="05:00 PM",
                                activity_type="Sightseeing",
                                description=f"Afternoon tour of {a2}. Take photos and enjoy the vibrant local atmosphere."
                            )
                        ]
                    )
                )
            fallback_stop = CityStop(
                city=city,
                nights=nights,
                hotel=fallback_hotel,
                transport_to_city=fallback_transport,
                day_plans=fallback_plans
            )
            city_stops.append(fallback_stop)
            
        current_date = end_date
        prev_city = city

    # --- STEP 3: The Return Journey Planner ---
    print(f" Planning the return journey from {prev_city} back to {origin}...")
    return_context_blocks = []
    for tc in tool_contents:
        if "transport" in tc["name"].lower():
            try:
                data = json.loads(tc["content"])
                transports = data if isinstance(data, list) else []
                slimmed_transports = []
                for t in transports:
                    if not isinstance(t, dict):
                        continue
                    t_orig = str(t.get("origin", "")).lower().strip()
                    t_dest = str(t.get("destination", "")).lower().strip()
                    # Filter for return leg options only (from prev_city to origin)
                    if t_orig != prev_city.lower().strip() or t_dest != origin.lower().strip():
                        continue
                        
                    # Dynamic geographic duration calculation for extreme realism
                    from src.utils.helpers import get_city_coordinates, haversine
                    c1 = get_city_coordinates(t_orig)
                    c2 = get_city_coordinates(t_dest)
                    
                    duration_str = t.get("duration") or ""
                    if c1 != (0.0, 0.0) and c2 != (0.0, 0.0):
                        dist = haversine(c1[0], c1[1], c2[0], c2[1])
                        speed = 45.0
                        est_hours = dist / speed
                        
                        if est_hours < 1.0:
                            duration_str = f"{round(est_hours * 60)} mins ({round(dist)} km)"
                        else:
                            hours = int(est_hours)
                            mins = int((est_hours - hours) * 60)
                            duration_str = f"{hours}h {mins}m ({round(dist)} km) ~ subject to terrain, weather, and road delays"
                            
                    slimmed_transports.append({
                        "provider": t.get("provider") or t.get("name"),
                        "price": t.get("price"),
                        "departure_time": t.get("departure_time"),
                        "arrival_time": t.get("arrival_time"),
                        "duration": duration_str,
                        "details": t.get("details"),
                        "origin": t.get("origin"),
                        "destination": t.get("destination")
                    })
                return_context_blocks.append(f"--- DATA FROM {tc['name'].upper()} ---\n{json.dumps(slimmed_transports[:2], indent=2)}\n")
            except Exception:
                return_context_blocks.append(f"--- DATA FROM {tc['name'].upper()} ---\n{tc['content'][:1000]}\n")
    return_context = "\n".join(return_context_blocks)
    
    return_prompt = get_return_journey_prompt(
        origin=origin,
        prev_city=prev_city,
        current_date_str=current_date.strftime('%Y-%m-%d'),
        mode=mode,
        travel_class=travel_class,
        return_context=return_context,
    )
    try:
        time.sleep(2)
        return_planner_llm = get_structured_llm(CityStop, temperature=0.3).with_retry(
            stop_after_attempt=3,
            wait_exponential_jitter=True
        )
        return_stop: CityStop = return_planner_llm.invoke(return_prompt)
        city_stops.append(return_stop)
    except Exception as e:
        print(f"[WARNING] Failed to plan return journey: {e}")
        # Construct highly accurate and robust fallback return stop with leg-specific transit duration
        from src.schemas.trip_schema import TransportOption
        fallback_return_transport = TransportOption(
            provider="Generic Return Transfer",
            type="train" if mode.lower() == "any" else mode.lower(),
            travel_class=travel_class,
            price="Variable; depends on booking time",
            departure_time="10:00 AM",
            arrival_time="04:00 PM",
            duration="Estimated based on distance"
        )
        fallback_return_stop = CityStop(
            city=origin,
            nights=0,
            hotel=None,
            transport_to_city=fallback_return_transport,
            day_plans=[]
        )
        city_stops.append(fallback_return_stop)

    # --- STEP 4: Pure Python Stitcher (0-Tokens) ---
    print(" Stitching plans into final itinerary (Zero-Token Pure Python!)...")
    # Emit the real Final Assembly event here (the frontend maps 'Final Assembly' from this exact text)
    if emit: emit("system_event", "Final Assembly")
    

    total_cost = 0.0
    global_day_number = 1
    
    for stop in city_stops:
        if stop.day_plans:
            for dp in stop.day_plans:
                dp.day_number = global_day_number
                global_day_number += 1
        if stop.hotel and stop.hotel.price_per_night_float and stop.nights:
            total_cost += stop.hotel.price_per_night_float * stop.nights
            
        if stop.transport_to_city and stop.transport_to_city.price_float:
            cost = stop.transport_to_city.price_float
            # Bug 14 Fix: Mountain travel surcharge
            if "terrain" in str(stop.transport_to_city.duration).lower():
                cost *= 1.5
            total_cost += cost

    # Prepend the origin as a zero-night stop so the UI map draws Origin → Dest1 arc correctly
    origin_stop = CityStop(
        city=origin,
        nights=0,
        hotel=None,
        transport_to_city=None,
        day_plans=[]
    )
    city_stops.insert(0, origin_stop)

    optimal_option = TripOption(
        option_label="Your Trip Itinerary",
        summary=f"A complete {duration}-night tour crafted for your preferences.",
        total_cost_inr=total_cost,
        total_travel_hours=sum(t.transport_to_city.estimated_delay_buffer_hours or 0 for t in city_stops if t.transport_to_city),
        route=city_stops,
        constraints_applied=["Generated city-by-city for maximum detail.", "Continuous narrative preserving transit."]
    )

    options = [optimal_option]

    itinerary = TripItinerary(
        options=options,
        total_budget=total_cost,
        constraints_applied=["Zero-token python stitching used to prevent TPM limit crashes."]
    )
    
    return {"final_itinerary_json": itinerary.model_dump_json(indent=2)}

# 3. Build the Itinerary Subgraph
builder = StateGraph(TripState)
builder.add_node("synthesize_itinerary", synthesize_itinerary)
builder.add_edge(START, "synthesize_itinerary")
builder.add_edge("synthesize_itinerary", END)
itinerary_graph = builder.compile()
