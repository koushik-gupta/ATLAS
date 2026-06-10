import operator
from typing import TypedDict, Annotated, List, Dict, Any, Optional
from langgraph.graph.message import add_messages

class TripState(TypedDict):
    # --- LangGraph Tool tracking ---
    messages: Annotated[list, add_messages]

    # --- Input & Context ---
    # Phase 3: Split origin from destinations so the agent never plans hotels/sightseeing for the origin city
    user_request: str
    origin_city: str                    # e.g., "Kolkata" — only used for departure transport
    destination_cities: List[str]       # e.g., ["Agra", "Vrindavan", "Amritsar"]
    destinations: List[str]             # kept for backward compatibility (mirrors destination_cities)
    pruned_cities: List[str]            # e.g., ["Dalhousie", "Kullu"] - kept for contextual mentions
    travel_dates: str                   # e.g., "August 10 to August 23"
    trip_duration_days: int
    traveler_profile: str
    pacing: str
    layover_cities: List[str]

    # --- Phase 3: New Preference Fields ---
    travel_mode: str                    # "flight", "train", "bus", or "any"
    travel_class: str                   # "Economy", "AC 2 Tier", "Sleeper", etc.
    planning_mode: str                  # "autopilot" or "step_by_step"
    weather_downgrade: bool             # True if user declined date shift despite bad weather
    city_roles: Dict[str, str]          # e.g., {"Srinagar": "Base Hub", "Gulmarg": "Day-Trip"}

    # --- Human-in-the-Loop (HITL) ---
    has_enough_info: bool
    missing_info_clarification: Optional[str]

    # --- Retrieval Results (Parallel Tools) ---
    # We use Annotated[List, operator.add] so that parallel tool nodes
    # can append their results without overwriting each other.
    transport_options: Annotated[List[Dict[str, Any]], operator.add]
    hotel_options: Annotated[List[Dict[str, Any]], operator.add]
    places_options: Annotated[List[Dict[str, Any]], operator.add]
    weather_info: Annotated[List[Dict[str, Any]], operator.add]

    # --- State for Validation & Logic ---
    estimated_budget: float
    draft_itinerary: str
    budget: float                       # user's max budget

    # Dictionary to track if constraints are met (e.g., {"budget_ok": True})
    validation_flags: Dict[str, bool]

    # --- Phase 3: Refinement Loop State ---
    # Populated by the Change Detector LLM when user requests a change after seeing the itinerary
    patch_request: Optional[Dict[str, str]]   # e.g., {"type": "hotel_change", "city": "Agra", "instruction": "Find a 5-star hotel"}
    user_approved: bool                        # True when user types "approve"

    # --- Phase 6: Step-by-Step Mode ---
    # User's chosen transport/hotel preferences from the step_by_step_review interrupt
    user_selections: Optional[Dict[str, Any]] # e.g., {"transport_kolkata_delhi": "Rajdhani Express", "hotel_delhi": "The Leela"}

    # --- Final Outputs ---
    final_itinerary_json: str
    final_response: str
