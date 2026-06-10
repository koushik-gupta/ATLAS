import asyncio
import json
import uuid
import datetime
import traceback
from typing import Dict, Any

from src.schemas.trip_schema import TripRequirements, PatchRequest
from src.llm_config import get_llm, get_heavy_llm, get_compound_mini_llm
from src.prompts import get_extraction_system_rules
from src.graphs.main_graph import master_graph, change_detector, apply_patch, route_after_patch

import threading

class Session:
    def __init__(self):
        self.events = []
        self.final_trip = {}
        self.status = "planning"
        self.new_event = asyncio.Event()
        self.reply_event = threading.Event()
        self.user_reply = None
        self.is_cancelled = False
    
    def add_event(self, event: dict):
        self.events.append(event)
        self.new_event.set()

session_store: Dict[str, Session] = {}

def wait_for_reply(session: Session):
    session.reply_event.clear()
    session.reply_event.wait()
    if session.status == "error" or session.is_cancelled:
        raise Exception("Session aborted, cancelled, or server shutting down.")
    return session.user_reply

def sync_run_feedback(session_id: str, feedback: str, loop: asyncio.AbstractEventLoop):
    session = session_store[session_id]
    
    def emit(event_type: str, label: str = "", **kwargs):
        if session.is_cancelled:
            raise Exception("Session Cancelled")
        event = {"type": event_type, "label": label, **kwargs}
        loop.call_soon_threadsafe(session.add_event, event)

    try:
        emit("system_event", f"Applying feedback: {feedback}")
        config = {"configurable": {"thread_id": session_id}}
        
        current_state = master_graph.get_state(config).values
        current_state["user_request"] = feedback
        
        # We manually run change_detector and apply_patch since the graph routes to END
        emit("system_event", "Analyzing change request...")
        patch_result = change_detector(current_state)
        current_state.update(patch_result)
        
        emit("system_event", "Applying patch...")
        apply_result = apply_patch(current_state)
        current_state.update(apply_result)
        
        next_step = route_after_patch(current_state)
        emit("system_event", f"Routing replan to {next_step}...")
        
        # Resume graph execution starting from the determined next step
        # By passing current_state, it's effectively a new invocation if it previously ended.
        # But we need to use stream with the right entry point. LangGraph `stream` doesn't easily let you start mid-graph unless there's an interrupt.
        # But wait! We can just call the subgraphs directly, or update the state and invoke master_graph?
        # Actually, if we update state with a new user_request, and we don't pass an initial state to stream(), it resumes. But if it's at END, it won't resume.
        # Let's bypass LangGraph strict routing for feedback and just run the needed nodes!
        if next_step == "retrieval":
            emit("route_event", "Refetching options from the web...")
            from src.graphs.retrieval_subgraph import retrieval_graph
            res = retrieval_graph(current_state)
            current_state.update(res)
            next_step = "itinerary"
            
        if next_step == "itinerary":
            emit("route_event", "Restitching itinerary days...")
            from src.graphs.itinerary_subgraph import itinerary_graph
            res = itinerary_graph(current_state)
            current_state.update(res)
            
            emit("system_event", "Validating feasibility constraints...")
            from src.graphs.validation_subgraph import validation_graph
            res = validation_graph(current_state)
            current_state.update(res)
            
        # Update the final state in checkpointer
        master_graph.update_state(config, current_state)
        
        final_json = current_state.get("final_itinerary_json", "{}")
        # Try to hydrate
        try:
            from src.schemas.trip_schema import TripItinerary
            from src.utils.hydrator import hydrate_trip_itinerary
            parsed_itin = TripItinerary.model_validate_json(final_json)
            hydrated_itin = hydrate_trip_itinerary(parsed_itin)
            final_json = hydrated_itin.model_dump_json(indent=2)
            master_graph.update_state(config, {"final_itinerary_json": final_json})
        except Exception as e:
            emit("system_event", f"Minor warning: hydration failed ({str(e)})")

        session.final_trip = json.loads(final_json)
        emit("trip_complete", "Finalizing updated travel journal...")
        session.status = "completed"
        
    except Exception as e:
        traceback.print_exc()
        emit("system_event", f"Error during replan: {str(e)}")
        session.status = "error"

async def run_feedback_session(session_id: str, feedback: str):
    loop = asyncio.get_running_loop()
    await asyncio.to_thread(sync_run_feedback, session_id, feedback, loop)


def sync_run_planning_from_brief(session_id: str, brief: dict, loop: asyncio.AbstractEventLoop):
    """
    Structured planning â€” skips LLM extraction entirely.
    Builds TripRequirements directly from the Journey Brief form data,
    emits brief graph nodes, then runs the identical planning pipeline
    as sync_run_planning (selection loop â†’ layover â†’ weather â†’ graph).
    """
    import time
    import re

    session = session_store[session_id]

    def emit(event_type: str, label: str = "", **kwargs):
        if session.is_cancelled:
            raise Exception("Session Cancelled")
        event = {"type": event_type, "label": label, **kwargs}
        loop.call_soon_threadsafe(session.add_event, event)

    try:
        emit("system_event", "Initializing expedition system...")

        # â”€â”€ 1. Parse brief â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        destinations    = brief.get("destinations", [])
        origin          = brief.get("origin", "")
        month           = brief.get("month", "")
        duration_days   = int(brief.get("duration_days", 7))
        traveller_type  = brief.get("traveller_type", "Solo")
        traveller_count = int(brief.get("traveller_count", 1))
        pace            = brief.get("pace", "Moderate")
        budget_min      = int(brief.get("budget_min", 0))
        budget_max      = int(brief.get("budget_max", 100000))

        # Transport preference â€” map frontend IDs â†’ backend strings
        raw_transport_mode  = brief.get("transport_mode",  "auto")
        raw_transport_class = brief.get("transport_class", "")

        # Mode mapping: frontend id â†’ what prompts/tools expect
        _MODE_MAP = {
            "auto":     "any",
            "flights":  "flight",
            "train":    "train",
            "road_trip":"road",
            "public":   "bus",
        }
        # Class mapping: frontend id â†’ human-readable string for prompts
        _CLASS_MAP = {
            # Flights
            "economy":         "Economy",
            "premium_economy": "Premium Economy",
            "business":        "Business Class",
            # Train
            "sleeper":         "Sleeper",
            "3a":              "AC 3 Tier",
            "2a":              "AC 2 Tier",
            "1a":              "AC 1st Class",
            # Road
            "shared":          "Shared Cab",
            "private_cab":     "Private Cab",
            "self_drive":      "Self Drive",
            # Public
            "standard":        "Standard",
            "comfort":         "Comfort Class",
        }

        backend_mode  = _MODE_MAP.get(raw_transport_mode, "any")
        backend_class = _CLASS_MAP.get(raw_transport_class, "") if raw_transport_class else ""

        # â”€â”€ 1b. Sensible transport class defaults when user didn't pick one â”€â”€â”€â”€
        # Prevents the LLM from hallucinating a class in the prompt.
        _DEFAULT_CLASS = {
            "flights":  "Economy",
            "train":    "AC 3 Tier",
            "road_trip": "Private Cab",
            "public":   "Standard",
        }
        if not backend_class and raw_transport_mode in _DEFAULT_CLASS:
            backend_class = _DEFAULT_CLASS[raw_transport_mode]

        # â”€â”€ 1c. Process advanced preferences dict â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        advanced = brief.get("advanced", {}) or {}
        active_prefs = [k for k, v in advanced.items() if v]

        # â”€â”€ 1d. Conflict resolution: "no_flights" pref vs "flights" transport â”€
        # The transport mode is more explicit and deliberate â€” it wins.
        # Remove conflicting preference and warn via SSE.
        if "no_flights" in active_prefs and raw_transport_mode == "flights":
            active_prefs.remove("no_flights")
            emit("system_event", "Note: 'No Flights' preference overridden by your Flights Preferred transport selection.")
        # Conversely, if no_flights is selected, enforce it by overriding transport to "any" (exclude flights)
        elif "no_flights" in active_prefs and raw_transport_mode == "auto":
            backend_mode = "train"  # prefer train/road when no_flights + auto
            emit("system_event", "No Flights preference detected â€” preferring train & road routes.")

        # Build a preferences note for prompts
        _PREF_LABELS = {
            "no_flights": "No flights", "luxury": "Luxury travel", "adventure": "Adventure activities",
            "nature": "Nature & wildlife", "photography": "Photography spots",
            "heritage": "Heritage & history", "food": "Local food experiences", "family_safe": "Family-friendly activities",
        }
        prefs_note = ", ".join(_PREF_LABELS.get(p, p) for p in active_prefs) if active_prefs else ""

        # â”€â”€ 2. Emit brief data nodes for graph visualisation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        time.sleep(0.05)
        emit("brief_node", f"From {origin}", node_type="origin", value=origin)
        for dest in destinations:
            time.sleep(0.05)
            emit("brief_node", dest, node_type="destination", value=dest)
        time.sleep(0.05)
        emit("brief_node", f"{duration_days} Days", node_type="duration", value=str(duration_days))
        if month:
            time.sleep(0.05)
            emit("brief_node", month, node_type="month", value=month)
        time.sleep(0.05)
        emit("brief_node", f"{traveller_count} {traveller_type}", node_type="travellers", value=traveller_type)
        time.sleep(0.05)
        emit("brief_node", pace, node_type="pace", value=pace)

        # Transport node
        _transport_label = {
            "auto":     "AI Optimized",
            "flights":  "Flights",
            "train":    "Train",
            "road_trip":"Road Trip",
            "public":   "Public Transport",
        }.get(raw_transport_mode, raw_transport_mode.title())
        _class_display = f" Â· {backend_class}" if backend_class else ""
        time.sleep(0.05)
        emit("brief_node", f"{_transport_label}{_class_display}",
             node_type="transport", value=backend_mode, transport_class=backend_class or "auto")

        if budget_max > 0:
            time.sleep(0.05)
            budget_label = (
                f"\u20b9{budget_min:,}\u2013\u20b9{budget_max:,}"
                if budget_min > 0
                else f"Up to \u20b9{budget_max:,}"
            )
            emit("brief_node", budget_label, node_type="budget", value=budget_label)
        time.sleep(0.2)
        emit("extraction_complete", "Journey Brief Assembled")
        time.sleep(0.3)

        # â”€â”€ 3. Build TripRequirements directly (no LLM) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        from src.schemas.trip_schema import TripRequirements

        budget_str   = str(budget_max) if budget_max > 0 else None
        travel_dates = month if month else None

        # Build a rich traveler_profile string including preferences
        traveler_profile_str = f"{traveller_count} {traveller_type}"
        if prefs_note:
            traveler_profile_str += f" | Preferences: {prefs_note}"

        reqs = TripRequirements(
            origin_city=origin or None,
            destination_cities=destinations if destinations else None,
            travel_dates=travel_dates,
            trip_duration_days=str(duration_days),
            budget_inr=budget_str,
            traveler_profile=traveler_profile_str,
            pacing=pace,
            travel_mode=backend_mode,
            travel_class=backend_class or None,
        )

        # Ensure destination is always a list
        if isinstance(reqs.destination_cities, str):
            reqs.destination_cities = [reqs.destination_cities]
        if not reqs.destination_cities:
            emit("system_event", "No destinations provided in brief.")
            session.status = "error"
            return

        duration_int = duration_days

        # ── 4. Destination Curation + Visual Selection ─
        from main import deep_research_destinations, get_ideal_trip_duration
        from api.image_pipeline import get_destination_image
        from src.utils.helpers import optimize_route_order
        from src.prompts import get_smart_pruning_prompt, get_smart_restoration_prompt, get_smart_reduction_prompt

        user_explicit_destinations = reqs.destination_cities
        original_duration_int = duration_int

        emit("system_event", f"Evaluating feasibility of {', '.join(user_explicit_destinations)}...")
        
        reqs.destination_cities = optimize_route_order(origin, user_explicit_destinations)
        
        estimated_days, city_roles, is_broad_region = get_ideal_trip_duration(
            reqs.destination_cities,
            reqs.pacing or "Moderate",
            origin
        )
        remaining_days = original_duration_int - estimated_days

        # SCENARIO 3: Pre-Tray Impossible Trip Brief Pruning
        while remaining_days < 0 and len(reqs.destination_cities) > 1:
            # Prune from the end of the trip brief
            pruned_city = reqs.destination_cities.pop()
            if pruned_city in user_explicit_destinations:
                user_explicit_destinations.remove(pruned_city)
            emit("system_event", f"⚠️ Route requires {estimated_days} days. Pruning '{pruned_city}' as {original_duration_int} days is mathematically impossible for this requested route.")
            reqs.destination_cities = optimize_route_order(origin, reqs.destination_cities)
            estimated_days, city_roles, is_broad_region = get_ideal_trip_duration(
                reqs.destination_cities,
                reqs.pacing or "Moderate",
                origin
            )
            remaining_days = original_duration_int - estimated_days

        previously_selected_cities = reqs.destination_cities.copy()
        city_pitches = []

        MIN_DAYS_FOR_NEW_HUB = 2

        # If the user already explicitly provided a large list of destinations in the brief
        # (4 or more cities), treat the selection as finalised — do NOT show the surplus tray
        # or prompt for more cities. The surplus occurs because many are day-trips from a hub,
        # which is expected and correct.
        user_already_curated = len(user_explicit_destinations) >= 4

        if is_broad_region:
            previously_selected_cities = []
            city_pitches = deep_research_destinations(reqs.destination_cities, str(original_duration_int), origin)
        else:
            if remaining_days >= MIN_DAYS_FOR_NEW_HUB and not user_already_curated:
                city_pitches = deep_research_destinations(reqs.destination_cities, str(original_duration_int), origin)
            else:
                city_pitches = [{"city": c, "pitch": f"Explore {c}"} for c in reqs.destination_cities]

        while True:
            # Only show tray if: broad region (must pick hubs) OR genuine surplus AND user didn't already give many cities
            needs_tray = (is_broad_region) or (remaining_days >= MIN_DAYS_FOR_NEW_HUB and not user_already_curated)

            if needs_tray:
                if is_broad_region:
                    emit("system_event", f"Curating specific expedition hubs within {', '.join(reqs.destination_cities)}...")
                else:
                    emit("system_event", f"Curating additional destinations to fill {int(remaining_days)} remaining days...")
                
                while True:
                    selected_cities = []
                    initial_emit = True
                    
                    import difflib
                    def is_similar(c1, c2):
                        n1 = c1.lower().replace(" ", "").replace("-", "")
                        n2 = c2.lower().replace(" ", "").replace("-", "")
                        if n1 in n2 or n2 in n1: return True
                        return difflib.SequenceMatcher(None, n1, n2).ratio() > 0.85
                        
                    while True:
                        if initial_emit:
                            curated_payload = []
                            for cp in city_pitches:
                                if not any(is_similar(cp["city"], existing) for existing in previously_selected_cities):
                                    curated_payload.append({
                                        "city": cp["city"],
                                        "image": get_destination_image(cp["city"]),
                                        "description": cp["pitch"],
                                        "more_available": True
                                    })
                                    
                            if not curated_payload:
                                emit("system_event", "No additional destinations found.")
                                selected_cities = previously_selected_cities.copy()
                                break
                                
                            title = "Select your expedition hubs" if is_broad_region else "Room for more! Select additional hubs"
                            emit("destination_options", title, options=curated_payload)
                            initial_emit = False
                        
                        reply = wait_for_reply(session)
                        
                        if isinstance(reply, dict):
                            action = reply.get("action")
                            if action == "more":
                                emit("system_event", "Fetching more destination options...")
                                from src.llm_config import get_heavy_llm
                                from pydantic import BaseModel, Field
                                from src.prompts import get_more_options_prompt
        
                                class CityPitch(BaseModel):
                                    city: str = Field(description="Exact name of the specific town, city, or district.")
                                    pitch: str = Field(description="One compelling sentence about why a tourist should visit.")
                                class RegionExpansion(BaseModel):
                                    destinations: list[CityPitch] = Field(description="Exactly 4 NEW destinations.")
        
                                try:
                                    llm = get_heavy_llm(temperature=0.7)
                                    structured_llm = llm.with_structured_output(RegionExpansion)
                                    existing_cities_set = {cp["city"] for cp in city_pitches}
                                    existing_cities = list(existing_cities_set)
                                    prompt = get_more_options_prompt(existing_cities, str(original_duration_int), origin=origin)
                                    result = structured_llm.invoke(prompt)
                                    if result and result.destinations:
                                        new_city_pitches = []
                                        for cp in result.destinations:
                                            if not any(is_similar(cp.city, ex) for ex in existing_cities_set):
                                                city_pitches.append({"city": cp.city, "pitch": cp.pitch})
                                                existing_cities_set.add(cp.city)
                                                new_city_pitches.append({"city": cp.city, "pitch": cp.pitch})
                                        if new_city_pitches:
                                            from src.utils.helpers import get_city_coordinates, haversine
                                            anchor_coords = []
                                            for c in previously_selected_cities:
                                                lat, lon = get_city_coordinates(c)
                                                if lat != 0.0 and lon != 0.0:
                                                    anchor_coords.append((lat, lon, c))
                                                    
                                            for p in new_city_pitches:
                                                plat, plon = get_city_coordinates(p["city"])
                                                if plat != 0.0 and plon != 0.0 and anchor_coords:
                                                    p["_distance"] = min([haversine(alat, alon, plat, plon, acity, p["city"]) for alat, alon, acity in anchor_coords])
                                                else:
                                                    p["_distance"] = 999999
                                                    
                                            new_city_pitches.sort(key=lambda x: x.get("_distance", 999999))
                                            
                                            new_curated = []
                                            for cp in new_city_pitches:
                                                new_curated.append({
                                                    "city": cp["city"],
                                                    "image": get_destination_image(cp["city"]),
                                                    "description": cp["pitch"],
                                                    "more_available": True
                                                })
                                            emit("destination_options", "More destinations discovered", options=new_curated, append=True)
                                except Exception as e:
                                    emit("system_event", f"Failed to fetch more options: {e}")
                                continue
                            elif action == "confirm":
                                selections = reply.get("selections", [])
                                if not selections and not previously_selected_cities:
                                    if city_pitches:
                                        selections = [city_pitches[0]["city"]]
                                selected_cities = previously_selected_cities + selections
                                break
                    else:
                        break
                        
                    reqs.destination_cities = selected_cities
                    emit("system_event", "Destinations confirmed.")
                    emit("system_event", "Validating trip duration and pacing constraints...")

                    reqs.destination_cities = optimize_route_order(origin, reqs.destination_cities)

                    prev_estimated_days = estimated_days  # guard against LLM non-determinism
                    estimated_days, city_roles, is_broad_region = get_ideal_trip_duration(
                        reqs.destination_cities,
                        reqs.pacing or "Moderate",
                        origin
                    )
                    # CLAMP: adding more cities must NEVER decrease estimated_days
                    # (LLM can give lower values on re-call due to non-determinism)
                    estimated_days = max(estimated_days, prev_estimated_days)
                    remaining_days = original_duration_int - estimated_days
                    # After user confirms from tray during an expand cycle, mark as curated
                    # so expand_review does NOT fire again with a worse surplus number.
                    user_already_curated = True
                    break
            else:
                if remaining_days == 1:
                    emit("system_event", f"Your itinerary already makes excellent use of the {original_duration_int}-day duration. (1 buffer day left)")
                else:
                    emit("system_event", f"Your selection of {', '.join(reqs.destination_cities)} perfectly fills or exceeds the {original_duration_int}-day itinerary.")

            # --- Post-selection feasibility: surplus check ---
            if remaining_days >= MIN_DAYS_FOR_NEW_HUB and not user_already_curated:
                emit("expand_review", "Extra Time Available",
                     estimated_days=estimated_days,
                     requested_days=original_duration_int,
                     surplus=int(remaining_days))
                ans = str(wait_for_reply(session)).strip().lower()
                emit("clear_review", "")

                expand_intents = ['more', 'show more', 'expand', 'suggest more', 'add more',
                                  'more destinations', 'continue', 'yes', 'y', 'e', '1']
                finish_intents = ['finish', 'enough', 'conclude', 'stop', 'proceed',
                                  'no', 'n', 'continue with current']

                is_expand = (
                    any(cmd in ans for cmd in expand_intents)
                    and not any(cmd in ans for cmd in finish_intents)
                )
                if is_expand or ans in expand_intents:
                    emit("system_event", "Deep Researching additional regional expansions...")
                    from src.llm_config import get_heavy_llm
                    from pydantic import BaseModel, Field
                    from src.prompts import get_more_options_prompt

                    class CityPitch2(BaseModel):
                        city: str = Field(description="Exact name of the specific town, city, or district.")
                        pitch: str = Field(description="One compelling sentence about why a tourist should visit.")
                    class RegionExpansion2(BaseModel):
                        destinations: list[CityPitch2] = Field(description="Exactly 4 NEW destinations.")

                    try:
                        llm = get_heavy_llm(temperature=0.3)
                        structured_llm = llm.with_structured_output(RegionExpansion2)
                        existing_cities_set = {cp["city"] for cp in city_pitches}
                        prompt = get_more_options_prompt(
                            list(existing_cities_set), str(original_duration_int), origin=origin
                        )
                        result = structured_llm.invoke(prompt)
                        if result and result.destinations:
                            for cp in result.destinations:
                                if not any(is_similar(cp.city, ex) for ex in existing_cities_set):
                                    city_pitches.append({"city": cp.city, "pitch": cp.pitch})
                                    existing_cities_set.add(cp.city)
                            previously_selected_cities = reqs.destination_cities.copy()
                    except Exception as e:
                        emit("system_event", f"Expansion failed: {e}")
                    continue
                else:
                    emit("system_event", "Concluding tour early without adding filler cities.")
                    emit("system_event", "Duration remains as requested.")
                    break
            elif remaining_days < 0 and len(reqs.destination_cities) == 1:
                emit("system_event", f"Your {original_duration_int}-day timeline is quite tight for {reqs.destination_cities[0]}, but since it's only one destination, we will craft a fast-paced itinerary to fit!")
                break
            
            else:
                from src.utils.helpers import analyze_destinations
                
                analysis = analyze_destinations(reqs.destination_cities)
                excursion_hubs = analysis.get("excursion_hubs", {})
                
                # hub_map: internal hub -> real user destinations inside that hub
                hub_map: dict[str, list[str]] = {}
                
                for city in reqs.destination_cities:
                    city_key = city.lower().strip()
                    parent_hub = excursion_hubs.get(city_key, city_key).strip().title()
                    hub_map.setdefault(parent_hub, []).append(city)
                
                normalized_hubs = list(hub_map.keys())
                
                max_destinations = max(3, int(original_duration_int / 1.5))
                max_hubs = max(2, int(original_duration_int / 3.0))
                is_overpacked = len(reqs.destination_cities) > max_destinations and len(normalized_hubs) > max_hubs

                # Always initialize original_cities before the pruning block
                # so it is accessible after the block regardless of whether pruning ran.
                original_cities = list(reqs.destination_cities)

                if (remaining_days < 0 or is_overpacked) and len(reqs.destination_cities) > 1:
                    if is_overpacked and remaining_days >= 0:
                        emit("system_event", f"Itinerary feels overpacked ({len(reqs.destination_cities)} cities across {len(normalized_hubs)} hubs). Running Feasibility Check...")
                    else:
                        emit("system_event", f"Trip duration ({original_duration_int} days) is tight for {len(reqs.destination_cities)} cities. Running Hybrid Feasibility Check...")

                    from src.llm_config import get_structured_llm
                    from pydantic import BaseModel, Field
                    from src.prompts import get_feasibility_check_prompt
                    
                    class FeasibilityResult(BaseModel):
                        is_feasible: bool = Field(description="True if the itinerary is feasible.")
                        city_to_remove: str = Field(
                            description="The exact name of the single destination to remove if the itinerary is not feasible. Empty if feasible."
                        )
                        reasoning: str = Field(description="Why the itinerary is feasible or why the destination should be removed.")
                    
                    max_iterations = 3
                    iterations = 0
                    final_reasoning = "Route optimized for feasibility using algorithmic pruning."
                    
                    while remaining_days < 0 or is_overpacked:
                        analysis = analyze_destinations(reqs.destination_cities)
                        city_scores = analysis.get("city_scores", {})
                        required_transit_nodes = set(analysis.get("required_transit_nodes", []))
                        
                        # --- GEOGRAPHIC HUB CLUSTERING ---
                        # Strategy: Use OSRM *travel time* (not km) — it is terrain-aware by design.
                        # The hub threshold is discovered dynamically via Natural Gap Detection:
                        # find the biggest jump in sorted travel times to determine where one hub ends.
                        # Zero hardcoded values.
                        from src.utils.helpers import haversine, get_osrm_matrix

                        llm_coords = analysis.get("city_coordinates", {})

                        def get_llm_coord(city: str):
                            data = llm_coords.get(city.lower().strip(), {})
                            return (data.get("lat", 0.0), data.get("lon", 0.0))

                        # Build valid coords dict for all cities
                        valid_coords_dict = {}
                        for c in reqs.destination_cities:
                            lat, lon = get_llm_coord(c)
                            if (lat, lon) != (0.0, 0.0):
                                valid_coords_dict[c] = (lat, lon)

                        # Fetch OSRM matrix with both distance AND duration
                        osrm_matrix = get_osrm_matrix(valid_coords_dict)

                        def get_travel_time(city1: str, city2: str) -> float:
                            """Returns travel time in seconds. Falls back to haversine * 50s/km heuristic."""
                            if city1 == city2: return 0.0
                            entry = osrm_matrix.get(city1, {}).get(city2)
                            if entry:
                                return entry["duration_sec"]
                            c1 = valid_coords_dict.get(city1, (0.0, 0.0))
                            c2 = valid_coords_dict.get(city2, (0.0, 0.0))
                            if c1 == (0.0, 0.0) or c2 == (0.0, 0.0):
                                return float('inf')
                            # Haversine fallback: assume 50s per km (average 72 km/h → ~50s/km)
                            return haversine(c1[0], c1[1], c2[0], c2[1]) * 50

                        # For each non-explicit city, compute its travel time to its NEAREST anchor
                        unassigned = [c for c in reqs.destination_cities if c not in user_explicit_destinations]
                        city_to_best_anchor = {}  # city -> (best_anchor, travel_time_sec)
                        for city in unassigned:
                            if city not in valid_coords_dict:
                                city_to_best_anchor[city] = (None, float('inf'))
                                continue
                            best_anchor = None
                            best_t = float('inf')
                            for anchor in user_explicit_destinations:
                                t = get_travel_time(city, anchor)
                                if t < best_t:
                                    best_t = t
                                    best_anchor = anchor
                            city_to_best_anchor[city] = (best_anchor, best_t)

                        # --- NATURAL GAP DETECTION ---
                        # Sort all valid travel times and find the biggest jump.
                        # The hub boundary is the midpoint of that biggest gap.
                        valid_times = sorted(
                            [(city, t) for city, (_, t) in city_to_best_anchor.items() if t != float('inf')],
                            key=lambda x: x[1]
                        )
                        
                        HUB_THRESHOLD_SEC = float('inf')  # default: all go to Core Hub
                        gap_debug = "no valid times or single city"
                        
                        if len(valid_times) >= 2:
                            sorted_t = [t for _, t in valid_times]
                            gaps = [(sorted_t[i+1] - sorted_t[i], i) for i in range(len(sorted_t) - 1)]
                            max_gap, max_gap_idx = max(gaps, key=lambda x: x[0])
                            total_range = sorted_t[-1] - sorted_t[0]
                            
                            # Only use gap detection if the gap is meaningful
                            # (at least 20% of total range AND at least 10 minutes = 600s)
                            if total_range > 0 and max_gap / total_range >= 0.20 and max_gap >= 600:
                                # Threshold = midpoint of the biggest jump
                                HUB_THRESHOLD_SEC = (sorted_t[max_gap_idx] + sorted_t[max_gap_idx + 1]) / 2
                                gap_debug = (f"Gap detected: {max_gap/60:.0f}min jump between "
                                             f"{sorted_t[max_gap_idx]/60:.0f}min and "
                                             f"{sorted_t[max_gap_idx+1]/60:.0f}min → threshold={HUB_THRESHOLD_SEC/60:.0f}min")
                            else:
                                # No clear gap → all cities belong to the nearest anchor hub
                                # (they are all clustered together — very small region trip)
                                HUB_THRESHOLD_SEC = float('inf')
                                gap_debug = f"No clear gap (range={total_range/60:.0f}min, max_gap={max_gap/60:.0f}min) → all cities in Core Hub"

                        # Build hub map using the discovered threshold
                        geo_hub_map: dict[str, list[str]] = {}
                        for anchor in user_explicit_destinations:
                            geo_hub_map.setdefault(anchor, []).append(anchor)

                        city_dist_debug = {}
                        for city in unassigned:
                            best_anchor, best_t = city_to_best_anchor[city]
                            if best_anchor is None:
                                geo_hub_map.setdefault(city, []).append(city)
                                city_dist_debug[city] = "NO_COORD → OPTIONAL"
                                continue
                            mins = best_t / 60
                            label = f"{mins:.0f}min (road) from {best_anchor}"
                            city_dist_debug[city] = label
                            if best_t <= HUB_THRESHOLD_SEC:
                                geo_hub_map[best_anchor].append(city)
                            else:
                                geo_hub_map.setdefault(city, []).append(city)

                        hub_map_current = geo_hub_map
                            
                        # Classify Core vs Optional Hubs
                        core_hubs = []
                        optional_hubs = []
                        for hub, cities in hub_map_current.items():
                            if any(c in user_explicit_destinations for c in cities):
                                core_hubs.append(hub)
                            else:
                                optional_hubs.append(hub)
                        
                        # --- DEBUG PRINTS ---
                        threshold_label = f"{HUB_THRESHOLD_SEC/60:.0f}min" if HUB_THRESHOLD_SEC != float('inf') else "∞ (all in Core)"
                        print(f"\n{'='*60}")
                        print(f"[PRUNING DEBUG] user_explicit_destinations = {user_explicit_destinations}")
                        print(f"[PRUNING DEBUG] Gap Detection: {gap_debug}")
                        print(f"[PRUNING DEBUG] HUB_THRESHOLD = {threshold_label}")
                        print(f"[PRUNING DEBUG] City travel times from nearest anchor:")
                        for city, dist_str in city_dist_debug.items():
                            anchor_t = city_to_best_anchor.get(city, (None, float('inf')))[1]
                            flag = "✓ CORE" if anchor_t <= HUB_THRESHOLD_SEC else "✗ OPTIONAL"
                            print(f"    {flag}  {city}: {dist_str}")
                        print(f"[PRUNING DEBUG] Required transit nodes = {required_transit_nodes}")
                        print(f"[PRUNING DEBUG] Hub Map:")
                        for hub, cities in hub_map_current.items():
                            hub_type = "CORE" if hub in core_hubs else "OPTIONAL"
                            print(f"  [{hub_type}] {hub} → {cities}")
                        print(f"[PRUNING DEBUG] remaining_days={remaining_days}, is_overpacked={is_overpacked}")
                        print(f"{'='*60}\n")
                                
                        # --- SCORING FUNCTIONS ---

                        def calc_global_score(city_name: str) -> float:
                            """Higher = more important globally. Used for Optional Hub pruning."""
                            city_low = city_name.lower().strip()
                            scores = city_scores.get(city_low, {})
                            t_imp = scores.get('tourist_importance', 5)
                            a_den = scores.get('activity_density', 5)
                            uniq  = scores.get('uniqueness', 5)
                            intent = 10 if city_name in user_explicit_destinations else 0
                            return (0.35 * t_imp) + (0.25 * intent) + (0.20 * 5) + (0.10 * a_den) + (0.10 * uniq)

                        def calc_core_hub_prune_priority(city_name: str, hub_anchor: str) -> float:
                            """
                            Core Hub pruning priority — HIGHER value = pruned FIRST.
                            Primary key: travel time from anchor (farther = pruned first).
                            This protects nearby places like Mirik/Kurseong and prunes
                            distant ones like Gangtok/Yuksom when days are tight.
                            """
                            city_low = city_name.lower().strip()
                            travel_time = get_travel_time(city_name, hub_anchor)  # seconds from OSRM
                            if travel_time == float('inf'):
                                travel_time = 999999
                            scores = city_scores.get(city_low, {})
                            # Lower importance = pruned sooner (used as tiebreaker only)
                            importance = scores.get('tourist_importance', 5)
                            # Primary: travel time (farther = higher priority to prune)
                            # Secondary: lower importance = higher priority to prune
                            return travel_time * 1000 - importance  # travel_time dominates

                        # Check minimum hub protection
                        def can_prune(city_name: str, hub_name: str) -> bool:
                            city_low = city_name.lower().strip()
                            if city_low in required_transit_nodes:
                                return False
                            if hub_name in core_hubs:
                                current_hub_cities = hub_map_current[hub_name]
                                user_explicit_in_hub = [c for c in current_hub_cities if c in user_explicit_destinations]
                                # Never prune the last explicit destination in the hub
                                if len(user_explicit_in_hub) == 1 and city_name == user_explicit_in_hub[0]:
                                    return False
                                # Never prune if hub would be left empty
                                if len(current_hub_cities) == 1:
                                    return False
                            return True

                        city_to_remove = None
                        
                        if optional_hubs:
                            # --- OPTIONAL HUB PRUNING ---
                            # Find farthest optional hub from the nearest core hub using OSRM times.
                            farthest_hub = None
                            max_time = -1
                            for ohub in optional_hubs:
                                # Travel time from optional hub to nearest core hub anchor
                                min_t = float('inf')
                                for chub in core_hubs:
                                    t = get_travel_time(ohub, chub)
                                    if t < min_t: min_t = t
                                if min_t != float('inf') and min_t > max_time:
                                    max_time = min_t
                                    farthest_hub = ohub
                            if not farthest_hub:
                                farthest_hub = optional_hubs[-1]
                                
                            # Within the farthest Optional Hub, prune lowest global score first
                            candidates = [c for c in hub_map_current[farthest_hub] if can_prune(c, farthest_hub)]
                            if candidates:
                                city_to_remove = min(candidates, key=calc_global_score)
                            else:
                                city_to_remove = hub_map_current[farthest_hub][-1]
                        else:
                            # --- CORE HUB PRUNING (multiple explicit anchors) ---
                            #
                            # Two-step algorithm:
                            # STEP 1 (Within-hub): From each Core Hub, pick the most prunable
                            #   candidate = farthest from that hub's anchor. This protects the
                            #   local experience (Mirik/Kurseong stay safe in Darjeeling Hub,
                            #   local Sikkim places stay safe in Gangtok Hub).
                            #
                            # STEP 2 (Cross-hub): Compare selected candidates by GLOBAL IMPORTANCE.
                            #   The least globally famous candidate gets pruned — a fair competition
                            #   across different hubs with different anchor distances.
                            #   e.g. Darjeeling Hub's farthest = Yuksom (importance 4)
                            #        Gangtok Hub's farthest = Lachen (importance 6)
                            #        → Yuksom wins (less globally important) → pruned.
                            #
                            # This is exactly: "pick the least famous from each hub, compare,
                            # prune the globally least famous among them."
                            hub_candidates = []  # [(city, global_score, hub_name)]
                            for chub in core_hubs:
                                candidates = [c for c in hub_map_current[chub] if can_prune(c, chub)]
                                if candidates:
                                    # STEP 1: pick the farthest from this hub's anchor
                                    farthest = max(candidates, key=lambda c: calc_core_hub_prune_priority(c, chub))
                                    # STEP 2 prep: record its global importance for cross-hub comparison
                                    hub_candidates.append((farthest, calc_global_score(farthest), chub))
                                    
                            if hub_candidates:
                                # STEP 2: prune the globally least important candidate
                                city_to_remove = min(hub_candidates, key=lambda x: x[1])[0]
                                
                        if not city_to_remove:
                            emit("system_event", "⚠️ Absolute minimum viable itinerary reached. Cannot prune further without violating core protections.")
                            break
                            
                        emit("system_event", f"⚠️ Itinerary too packed. Algorithmic Pruning: Removing {city_to_remove}...")
                        reqs.destination_cities.remove(city_to_remove)
                        
                        if len(reqs.destination_cities) == 0:
                            break
                            
                        # Recalculate
                        reqs.destination_cities = optimize_route_order(origin, reqs.destination_cities)
                        estimated_days, _, _ = get_ideal_trip_duration(
                            reqs.destination_cities, reqs.pacing or "Moderate", origin
                        )
                        remaining_days = original_duration_int - estimated_days
                        
                        # Re-check overpacked (simple city count; hub details recalculated at top of loop)
                        max_destinations = max(3, int(original_duration_int / 1.5))
                        is_overpacked = len(reqs.destination_cities) > max_destinations

                removed_cities = [c for c in original_cities if c not in reqs.destination_cities]
                if removed_cities:
                    emit("pruning_review", "Smart Pruning Complete",
                         removed=removed_cities,
                         kept=reqs.destination_cities,
                         reason=final_reasoning)
                    ans = str(wait_for_reply(session)).strip().lower()
                    emit("clear_review", "")

                    if ans in ['y', 'yes', 'sure', 'ok', 'okay', '1']:
                        reqs.destination_cities = optimize_route_order(origin, reqs.destination_cities)
                        estimated_days, city_roles, is_broad_region = get_ideal_trip_duration(
                            reqs.destination_cities, reqs.pacing or "Moderate", origin, skip_web=True
                        )
                        emit("system_event", "Pruning accepted.")
                        break
                    else:
                        reqs.destination_cities = original_cities
                        emit("system_event", "Keeping original selection. Expect a very fast-paced trip!")
                        break
                else:
                    break

        # â”€â”€ 5. Intelligent Layover Detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        layover_cities = []
        if reqs.destination_cities:
            emit("system_event", "Analyzing transit routes for layover requirements...")
            from src.utils.helpers import should_suggest_layover
            try:
                result = should_suggest_layover(
                    origin=reqs.origin_city or "",
                    destinations=reqs.destination_cities,
                    mode=reqs.travel_mode or "",
                    profile=reqs.traveler_profile or "",
                )
                if result["suggest"] and result["layover_city"]:
                    emit("layover_review", "Layover Recommendation",
                         reason=result["reason"],
                         layover_city=result["layover_city"])
                    ans = str(wait_for_reply(session)).strip().lower()
                    emit("clear_review", "")
                    if ans in ['y', 'yes', 'sure', 'ok', 'okay', '1']:
                        layover_cities.append(result["layover_city"])
                        insert_before = result["insert_before"]
                        if insert_before in reqs.destination_cities:
                            idx = reqs.destination_cities.index(insert_before)
                            reqs.destination_cities.insert(idx, result["layover_city"])
                        else:
                            reqs.destination_cities.append(result["layover_city"])
                        emit("system_event", f"{result['layover_city']} added as a rest stop!")
                else:
                    emit("system_event", "No layover needed â€” direct journey.")
            except Exception as e:
                emit("system_event", f"Layover check failed: {e}")

        # â”€â”€ 6. Pre-Trip Weather Intelligence Gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        weather_downgrade_flag = False
        weather_data_for_state = []

        if reqs.destination_cities and reqs.travel_dates:
            def fetch_weather(dates):
                w_reports = []
                w_data = []
                emit("system_event", f"Checking weather conditions for {dates}...")
                for city in reqs.destination_cities:
                    try:
                        from src.tools.weather_tool import weather_search
                        w_res = weather_search.invoke({"destination": city, "dates": dates})
                        if w_res and "error" not in w_res[0]:
                            w_reports.append(f"City: {city}\nData: {json.dumps(w_res[0]['raw_data'])}")
                            w_data.extend(w_res)
                    except Exception:
                        pass
                return w_reports, w_data

            weather_reports, weather_data_for_state = fetch_weather(reqs.travel_dates)

            if weather_reports:
                from src.llm_config import get_structured_llm
                from src.prompts import get_weather_analysis_prompt
                from pydantic import BaseModel, Field

                class WeatherStatus(BaseModel):
                    is_bad_weather: bool = Field(
                        description="True if there is severe/dangerous/unpleasant weather during the travel dates."
                    )
                    bad_weather_details: str = Field(
                        description="Details of the bad weather conditions and specific dates affected."
                    )
                    suggested_dates: str = Field(
                        description="Highly recommended alternative dates with excellent weather."
                    )
                    reasoning: str = Field(
                        description="Explanation of why these alternative dates are better."
                    )

                try:
                    weather_analyzer = get_structured_llm(WeatherStatus, temperature=0)
                    weather_context = "\n\n".join(weather_reports)
                    prompt = get_weather_analysis_prompt(
                        travel_dates=reqs.travel_dates,
                        weather_context=weather_context,
                    )
                    status = weather_analyzer.invoke(prompt)

                    if status.is_bad_weather:
                        emit("weather_review", "Weather Advisory Detected",
                             original_dates=reqs.travel_dates,
                             issue=status.bad_weather_details if status.bad_weather_details else "Adverse weather conditions",
                             recommended_dates=status.suggested_dates,
                             reason=status.reasoning if status.reasoning else "Better conditions")
                        ans = str(wait_for_reply(session)).strip().lower()
                        emit("clear_review", "")

                        dates_changed = False
                        if ans.startswith("yes::"):
                            reqs.travel_dates = ans.split("::", 1)[1].strip()
                            emit("system_event", f"Travel dates shifted to: {reqs.travel_dates}")
                            dates_changed = True
                        elif ans in ['y', 'yes', 'sure', 'ok', 'okay', '1']:
                            emit("chat_question", "What new month or dates would you prefer?",
                                 placeholder="e.g., December or Next week")
                            new_dates = str(wait_for_reply(session)).strip()
                            reqs.travel_dates = new_dates
                            emit("system_event", f"Travel dates shifted to: {reqs.travel_dates}")
                            dates_changed = True
                        elif ans not in ['n', 'no', 'nope', '0', '']:
                            reqs.travel_dates = ans.title()
                            emit("system_event", f"Travel dates shifted to your custom choice: {reqs.travel_dates}")
                            dates_changed = True
                        else:
                            emit("system_event",
                                 f"Continuing with original dates: {reqs.travel_dates} despite weather warnings.")
                            weather_downgrade_flag = True

                        if dates_changed:
                            _, weather_data_for_state = fetch_weather(reqs.travel_dates)
                    else:
                        emit("system_event", "Weather check passed: No severe conditions detected!")
                except Exception as e:
                    emit("system_event", f"Weather Intelligence Gate analysis skipped: {e}")

        # â”€â”€ 7. Budget Extraction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        budget_str_raw = str(reqs.budget_inr or "0").lower().replace('k', '000').replace(',', '')
        numbers = re.findall(r'\d+', budget_str_raw)
        budget_float = float(max(int(n) for n in numbers)) if numbers else 0.0

        # â”€â”€ 8. Build initial graph state & run master_graph â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        # NOTE: extraction_complete was already emitted at the brief-assembly step above.
        # Do NOT emit it again here â€” that would create a duplicate node in the canvas.
        initial_state = {
            "user_request": (
                f"Journey Brief: {', '.join(reqs.destination_cities or [])} from {origin}. "
                f"Transport: {backend_mode} ({backend_class}). "
                f"Budget: â‚¹{budget_min:,}â€“â‚¹{budget_max:,}. "
                + (f"Preferences: {prefs_note}." if prefs_note else "")
            ),
            "origin_city": reqs.origin_city,
            "destination_cities": reqs.destination_cities,
            "destinations": reqs.destination_cities,
            "pruned_cities": [],
            "travel_dates": reqs.travel_dates,
            "trip_duration_days": duration_int,
            "traveler_profile": reqs.traveler_profile,
            "weather_info": weather_data_for_state,
            "weather_downgrade": weather_downgrade_flag,
            "pacing": reqs.pacing,
            "budget": budget_float,
            "travel_mode": reqs.travel_mode,
            "travel_class": reqs.travel_class,
            "planning_mode": "autopilot",
            "layover_cities": layover_cities,
            "city_roles": city_roles if 'city_roles' in locals() else {c: "Base Hub" for c in reqs.destination_cities},
            "messages": [],
            "validation_flags": {},
            "patch_request": None,
            "user_approved": False,
            "user_selections": None,
        }

        config = {"configurable": {"thread_id": session_id, "emit": emit}}

        # Cinematic Orchestration Milestone Broadcasts
        emit("system_event", "Destination Agent scanning regional hubs...")
        emit("weather_event", "Weather Agent analyzing seasonal patterns...")
        emit("transport_event", "Transport Agent computing optimal routes...")
        emit("hotel_event", "Hotel Agent sourcing accommodations...")
        emit("route_event", "Attraction Agent collecting landmark data...")
        emit("system_event", "Budget Agent validating cost estimates...")
        emit("system_event", "Validation Agent checking feasibility constraints...")

        _seen_cities_for_cluster = set()
        _current_cluster_city = None

        for output in master_graph.stream(initial_state, config=config, stream_mode="updates", subgraphs=True):
            if session.is_cancelled:
                print(f"🛑 Session {session_id} cancelled during stream")
                raise Exception("Session Cancelled")

            if isinstance(output, tuple) and len(output) == 2:
                namespace, chunk = output
                node_name = namespace[-1] if namespace else "unknown"

                _city_from_chunk = None
                if isinstance(chunk, dict):
                    for _node_val in chunk.values():
                        if isinstance(_node_val, dict):
                            _city_from_chunk = _node_val.get("current_city") or _node_val.get("city")
                            if _city_from_chunk:
                                break

                if _city_from_chunk and _city_from_chunk not in _seen_cities_for_cluster:
                    _seen_cities_for_cluster.add(_city_from_chunk)
                    _current_cluster_city = _city_from_chunk
                    emit("city_plan_start", f"Planning {_city_from_chunk}...", city=_city_from_chunk)

                if node_name == "hotel_search_node":
                    city_label = f" in {_current_cluster_city}" if _current_cluster_city else ""
                    emit("city_hotel_search", f"Finding hotels{city_label}...", city=_current_cluster_city or "")
                elif node_name == "places_search_node":
                    city_label = f" in {_current_cluster_city}" if _current_cluster_city else ""
                    emit("city_attraction_search", f"Discovering gems{city_label}...", city=_current_cluster_city or "")
                elif node_name == "transport_search_node":
                    city_label = f" to {_current_cluster_city}" if _current_cluster_city else ""
                    emit("city_transport_search", f"Checking transit{city_label}...", city=_current_cluster_city or "")
                elif node_name == "weather_node":
                    city_label = f" for {_current_cluster_city}" if _current_cluster_city else ""
                    emit("city_weather_check", f"Seasonal analysis{city_label}...", city=_current_cluster_city or "")
                elif node_name == "city_planner":
                    city_label = _current_cluster_city or ""
                    emit("city_plan_complete",
                         f"Blueprint ready{': ' + city_label if city_label else ''}!",
                         city=city_label)
                    _current_cluster_city = None
                elif node_name == "night_allocator":
                    # NOTE: The real night_allocation event (with city->nights data) is already
                    # emitted from INSIDE the synthesize_itinerary node (itinerary_subgraph.py).
                    # Emitting it again here would create a duplicate node in the canvas.
                    pass  # night_allocation already fired from inside the graph node
                elif node_name == "validation_graph":
                    emit("system_event", "Validating feasibility constraints...")
            else:
                for key in output.keys():
                    if key == "retrieval":
                        emit("route_event", "Terrain analysis complete. Assembling itinerary...")
                    elif key == "itinerary":
                        last_city = reqs.destination_cities[-1] if reqs.destination_cities else "Last Stop"
                        emit("route_event",
                             f"Planning the return journey from {last_city} back to {reqs.origin_city or 'Origin'}...")
                        emit("system_event", "Validating itinerary constraints...")

        final_state = master_graph.get_state(config)
        final_json = final_state.values.get("final_itinerary_json", "{}")

        try:
            from src.schemas.trip_schema import TripItinerary
            from src.utils.hydrator import hydrate_trip_itinerary
            parsed_itin = TripItinerary.model_validate_json(final_json)
            hydrated_itin = hydrate_trip_itinerary(parsed_itin)
            final_json = hydrated_itin.model_dump_json(indent=2)
            master_graph.update_state(config, {"final_itinerary_json": final_json})
        except Exception as e:
            emit("system_event", f"Minor warning: hydration failed ({str(e)})")

        session.final_trip = json.loads(final_json)
        emit("trip_complete", "Finalizing travel journal...")
        session.status = "completed"

    except Exception as e:
        traceback.print_exc()
        emit("system_event", f"Error during planning: {str(e)}")
        session.status = "error"


async def run_planning_from_brief(session_id: str, brief: dict):
    loop = asyncio.get_running_loop()
    await asyncio.to_thread(sync_run_planning_from_brief, session_id, brief, loop)

