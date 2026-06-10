import json
import sqlite3
from typing import Literal
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver
from src.llm_config import get_llm
from langchain_core.messages import SystemMessage
from langgraph.prebuilt import ToolNode

from src.state.trip_state import TripState
from src.graphs.retrieval_subgraph import retrieval_graph
from src.graphs.itinerary_subgraph import itinerary_graph
from src.graphs.validation_subgraph import validation_graph
from src.schemas.trip_schema import PatchRequest
from src.prompts import get_change_detector_prompt

from src.tools.transport_tool import transport_search
from src.tools.hotel_tool import hotel_search
from src.tools.places_tool import places_search
from src.tools.weather_tool import weather_search

# We need the tools here for the surgical patch agent
tools = [transport_search, hotel_search, places_search, weather_search]

def human_review_node(state: TripState):
    """
    Dummy node. The graph is compiled to ALWAYS INTERRUPT before this node.
    This gives the user a chance to review the itinerary and provide feedback.
    """
    print(" Resuming agent from human review...")
    return {}

def step_by_step_review_node(state: TripState):
    """
    Dummy node. The graph is compiled to INTERRUPT before this node when
    planning_mode == 'step_by_step'. main.py will display the raw retrieved
    options and let the user pick transport and hotels before synthesis.
    """
    print("[INFO] Resuming agent with user selections...")
    return {}

def route_after_retrieval(state: TripState) -> Literal["step_by_step_review", "itinerary"]:
    """Route to step-by-step selection if user chose that mode, else go straight to synthesis."""
    if state.get("planning_mode") == "step_by_step":
        return "step_by_step_review"
    return "itinerary"

def route_after_review(state: TripState) -> Literal["__end__", "change_detector"]:
    """If user typed approve, we end. Otherwise, we analyze their change request."""
    if state.get("user_approved"):
        return "__end__"
    return "change_detector"

def change_detector(state: TripState):
    """Parses user natural language feedback into a strict PatchRequest."""
    from src.llm_config import get_llm
    llm = get_llm()
    structured_llm = llm.with_structured_output(PatchRequest)
    
    feedback = state.get("user_request", "")
    current_draft = state.get("final_itinerary_json", "{}")
    print(f" Analyzing change request: '{feedback}'")
    
    prompt = get_change_detector_prompt(feedback, current_draft)
    try:
        patch: PatchRequest = structured_llm.invoke(prompt)
        return {"patch_request": patch.model_dump()}
    except Exception as e:
        print(f"[WARNING] Change detector failed: {e}. Defaulting to full replan.")
        return {"patch_request": {"change_type": "full_replan", "instruction": feedback}}

def apply_patch(state: TripState):
    """Deterministically mutates the TripState based on the PatchRequest logic."""
    patch = state.get("patch_request", {})
    change_type = patch.get("change_type", "")
    city = patch.get("city", "")
    new_value = patch.get("new_value", "")
    instruction = patch.get("instruction", "")
    
    # Initialize user_selections if it doesn't exist
    user_selections = state.get("user_selections") or {}
    dest_cities = list(state.get("destination_cities", []))
    
    print(f"️  Applying Patch: '{change_type}' | Target: {city or patch.get('parameter_changes', {})}")

    if change_type == "add_city":
        city_to_add = new_value or city
        if city_to_add and city_to_add not in dest_cities:
            dest_cities.append(city_to_add)
            print(f"[SUCCESS] Added city: {city_to_add}")
            
    elif change_type == "remove_city":
        if city in dest_cities:
            dest_cities.remove(city)
            print(f"[SUCCESS] Removed city: {city}")
            
    elif change_type == "replace_city":
        if city in dest_cities:
            idx = dest_cities.index(city)
            dest_cities[idx] = new_value
            print(f"[SUCCESS] Replaced {city} with {new_value}")
        elif new_value and new_value not in dest_cities:
            dest_cities.append(new_value)
            print(f"[SUCCESS] Added replacement city: {new_value}")
            
    elif change_type == "traveler_change":
        new_profile = new_value or instruction
        print(f"[SUCCESS] Traveler profile updated to: {new_profile}")
        return {
            "traveler_profile": new_profile,
            "user_selections": user_selections,
            "destination_cities": dest_cities
        }
        
    elif change_type == "origin_change":
        new_origin = new_value or instruction
        print(f"[SUCCESS] Origin city updated to: {new_origin}")
        return {
            "origin_city": new_origin,
            "user_selections": user_selections,
            "destination_cities": dest_cities
        }
        
    elif change_type == "hotel_change":
        # Force a new hotel search for the target city
        from src.tools.hotel_tool import hotel_search
        try:
            print(f" Fetching new hotel options for {city}...")
            new_hotel_data = hotel_search.invoke({"destination": city})
            user_selections[f"{city} Hotel"] = str(new_hotel_data)
            print(f"[SUCCESS] Hotel data refreshed for {city}")
        except Exception as e:
            print(f"[WARNING] Hotel patch failed: {e}")
            
    elif change_type == "transport_change":
        from src.tools.transport_tool import transport_search
        try:
            print(f" Fetching new transport options to {city}...")
            new_transport_data = transport_search.invoke({
                "origin": "Current City",
                "destination": city,
                "date": state.get("travel_dates", ""),
                "travel_mode": state.get("travel_mode", "any"),
                "travel_class": state.get("travel_class", "Economy")
            })
            user_selections[f"Transport to {city}"] = str(new_transport_data)
            print(f"[SUCCESS] Transport data refreshed for {city}")
        except Exception as e:
            print(f"[WARNING] Transport patch failed: {e}")

    # ── V4 NEW: Universal Parameter Patching ─────────────────────────────────
    elif change_type == "parameter_change":
        parameter_changes = patch.get("parameter_changes") or {}
        if not parameter_changes:
            print("[WARNING]  parameter_change received but 'parameter_changes' dict is empty. No action taken.")
            return {"user_selections": user_selections, "destination_cities": dest_cities}
        
        # Safe type coercion — Groq may output numbers as strings
        import re as _re
        if "budget" in parameter_changes:
            try:
                raw = str(parameter_changes["budget"]).replace(",", "").replace("₹", "").replace("k", "000").strip()
                nums = _re.findall(r'\d+', raw)
                parameter_changes["budget"] = float(max(int(n) for n in nums)) if nums else parameter_changes["budget"]
            except Exception:
                pass  # Keep original value if coercion fails
        if "trip_duration_days" in parameter_changes:
            try:
                parameter_changes["trip_duration_days"] = int(parameter_changes["trip_duration_days"])
            except Exception:
                pass
        
        print(f"⚙️  Mutating global parameters: {parameter_changes}")
        # LangGraph automatically merges this dict into TripState — all keys update atomically
        return dict(parameter_changes)
    # ────────────────────────────────────────────────────────────────────
            
    return {"user_selections": user_selections, "destination_cities": dest_cities}

# 1. Build the Master Motherboard Graph
builder = StateGraph(TripState)

# Add all nodes
builder.add_node("retrieval", retrieval_graph)
builder.add_node("step_by_step_review", step_by_step_review_node)
builder.add_node("itinerary", itinerary_graph)
builder.add_node("validation", validation_graph)
builder.add_node("human_review", human_review_node)
builder.add_node("change_detector", change_detector)
builder.add_node("apply_patch", apply_patch)

# 2. Main Linear Execution Flow
builder.add_edge(START, "retrieval")
# After retrieval, check planning mode
builder.add_conditional_edges("retrieval", route_after_retrieval)
# Step-by-step review feeds into itinerary (after user picks options)
builder.add_edge("step_by_step_review", "itinerary")
builder.add_edge("itinerary", "validation")

# Phase 3: EVERY run unconditionally pauses before human_review! (Now disconnected, routes to END)
builder.add_edge("validation", END)

# 3. Post-Review Routing Loop
builder.add_conditional_edges("human_review", route_after_review)

# 4. Change Detection & Patching Loop
builder.add_edge("change_detector", "apply_patch")

def route_after_patch(state: TripState) -> Literal["retrieval", "itinerary"]:
    """
    After state mutation, route to the correct subgraph.
    
    RETRIEVAL (needs new web searches):
      - full_replan:       Entirely new plan requested
      - add_city:         Need hotel/places/transport for the new city
      - replace_city:     Need hotel/places/transport for the replacement city
      - origin_change:    Need new transport leg from new origin to first city
      - travel_mode:      (via parameter_change) New mode = new transport searches
    
    ITINERARY (re-synthesize from existing cached data):
      - hotel_change:     New hotel already fetched into user_selections
      - transport_change: New transport already fetched into user_selections
      - remove_city:      City deleted from dest_cities — re-stitch remaining
      - traveler_change:  Profile updated — re-synthesize with new profile
      - reorder_cities:   Re-stitch in new order from cached data
      - parameter_change: Budget/pacing/class/duration — Night Allocator re-runs on cached data
    """
    patch = state.get("patch_request", {})
    change_type = patch.get("change_type", "full_replan")
    
    # These change types require fetching new data from the web
    RETRIEVAL_ROUTES = {"full_replan", "add_city", "replace_city", "origin_change"}
    
    if change_type in RETRIEVAL_ROUTES:
        print(f" Routing to Retrieval Subgraph (new data needed): '{change_type}'")
        return "retrieval"
    
    # Special case: travel_mode change needs new transport search data
    if change_type == "parameter_change":
        param_changes = patch.get("parameter_changes") or {}
        if "travel_mode" in param_changes:
            new_mode = param_changes["travel_mode"]
            print(f" travel_mode changed to '{new_mode}' → Routing to Retrieval for new transport search")
            return "retrieval"
        changed_keys = list(param_changes.keys())
        print(f"⚙️  Global params mutated {changed_keys} → Routing to Itinerary for fast re-synthesis")
        return "itinerary"
    
    print(f" Routing to Itinerary Subgraph (surgical edit): '{change_type}'")
    return "itinerary"

builder.add_conditional_edges("apply_patch", route_after_patch)

# 5. Compile with persistent memory
conn = sqlite3.connect("trip_memory.db", check_same_thread=False)
memory = SqliteSaver(conn)

# We instruct LangGraph to physically pause execution EVERY time it hits human_review
master_graph = builder.compile(
    checkpointer=memory,
    interrupt_before=["human_review", "step_by_step_review"]
)
