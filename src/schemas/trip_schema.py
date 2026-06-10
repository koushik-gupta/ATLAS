from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional, Dict, Any, Union
import dateparser
import re

# --- Individual Components ---

class TransportOption(BaseModel):
    provider: Optional[str] = Field(description="Name of the airline, train operator, or car company", default=None)
    type: Optional[str] = Field(description="Mode of transport: flight, train, bus, or car", default=None)
    travel_class: Optional[str] = Field(description="Class of travel e.g. Economy, Business, AC 1st Class, AC 2 Tier, Sleeper", default="Economy")
    price: Optional[str] = Field(description="Price of the transport per person (can include text/currency)", default=None)
    departure_time: Optional[str] = Field(description="Departure time e.g. '14:30'", default=None)
    arrival_time: Optional[str] = Field(description="Arrival time e.g. '22:15'", default=None)
    estimated_delay_buffer_hours: Optional[float] = Field(description="Agent calculates how much time to add for safety based on historical delay averages", default=0.0)
    duration: Optional[str] = Field(description="Estimated duration of this leg of the journey including buffer", default=None)

    @property
    def price_float(self) -> float:
        if self.price:
            match = re.search(r'\d+(\.\d+)?', str(self.price).replace(',', ''))
            if match: return float(match.group())
        return 0.0

class HotelOption(BaseModel):
    name: Optional[str] = Field(description="Name of the hotel", default=None)
    address: Optional[str] = Field(description="Address of the hotel", default=None)
    price_per_night: Optional[str] = Field(description="Price per night in INR (can include text/currency)", default=None)
    rating: Optional[float] = Field(description="Rating out of 10", default=None)
    stars: Optional[float] = Field(description="Star category of the hotel (1-5)", default=None)

    @field_validator('stars', 'rating', mode='before')
    @classmethod
    def coerce_to_float(cls, v):
        if v is None: return None
        try: return float(v)
        except: return None

    @property
    def price_per_night_float(self) -> float:
        if self.price_per_night:
            match = re.search(r'\d+(\.\d+)?', str(self.price_per_night).replace(',', ''))
            if match: return float(match.group())
        return 0.0

class PlaceOption(BaseModel):
    name: Optional[str] = Field(description="Name of the place or attraction", default=None)
    category: Optional[str] = Field(description="Type of attraction (e.g., landmark, restaurant, temple)", default=None)
    visit_duration_hours: Optional[float] = Field(description="Recommended visiting time in hours", default=1.0)

# --- Day Plan ---

from typing import Literal

class Activity(BaseModel):
    start_time: Optional[str] = Field(description="Exact start time e.g., '09:00 AM'", default=None)
    end_time: Optional[str] = Field(description="Exact end time e.g., '10:30 AM'", default=None)
    activity_type: Optional[Literal["Sightseeing", "Cultural", "Nature", "Adventure", "Excursion", "Transit", "Meal", "Logistics", "Rest"]] = Field(description="Type of activity MUST be one of these exactly.", default=None)
    description: Optional[str] = Field(description="Extremely detailed, rich narrative of what the traveler will do, why it's interesting, and any transit instructions.", default=None)

class DayPlan(BaseModel):
    day_number: Optional[int] = Field(description="Day number of the trip (e.g., 1, 2)", default=None)
    date: Optional[str] = Field(description="Date of this day plan (e.g., 2026-08-10)", default=None)
    activities: Optional[List[Activity]] = Field(description="A full, chronological story of the day starting from morning wake-up or travel.", default=None)
    rest_hours_allocated: Optional[float] = Field(description="Total rest hours allocated on this day during waking hours (post-travel recovery)", default=0.0)
    weather_forecast: Optional[str] = Field(description="Weather forecast or historical climate note for the day", default=None)

# --- City Stop ---

class CityStop(BaseModel):
    planner_scratchpad: Optional[str] = Field(description="Internal scratchpad for the AI to brainstorm the daily schedule and pick 3-5 distinct attractions before writing the day_plans array.", default=None)
    destination_insight: Optional[str] = Field(description="Editorial insight about the destination formatted with specific sections: 🏔 Destination Summary, ✨ Highlights, 🧭 Role In Journey, 🌲 Atmosphere. MUST NOT mention planner logs.", default=None)
    city: Optional[str] = Field(description="The name of the destination city being visited", default=None)
    nights: Optional[int] = Field(description="Number of nights staying in this city", default=None)
    hotel: Optional[HotelOption] = Field(description="The recommended hotel for this city", default=None)
    transport_to_city: Optional[TransportOption] = Field(description="How the traveler gets to this city from the previous stop", default=None)
    day_plans: Optional[List[DayPlan]] = Field(description="Day-by-day itinerary for this city, adjusted for traveler pacing and profile", default=None)
    # Hydration Fields
    coordinates: Optional[List[float]] = Field(description="[longitude, latitude] hydrated by the backend post-processor", default=None)
    image: Optional[str] = Field(description="Destination banner image URL hydrated by backend post-processor", default=None)
    type: Optional[str] = Field(description="Destination category (e.g., 'mountain', 'beach', 'urban') hydrated by backend", default=None)

# --- Phase 3: Multi-Option Support ---

class TripOption(BaseModel):
    """Represents one complete trip plan. V2 can generate two: Optimal and Budget."""
    option_label: str = Field(description="Label for this option e.g. 'Option A: Optimal Route' or 'Option B: Budget-Friendly'")
    summary: str = Field(description="One-sentence summary of the key trade-offs of this option")
    total_cost_inr: float = Field(description="Total estimated cost in INR (₹) for all travelers")
    total_travel_hours: float = Field(description="Total hours spent in transit across the full trip")
    route: List[CityStop] = Field(description="The full multi-city route for this option")
    constraints_applied: List[str] = Field(description="A list of specific safety, budget, or logistical adjustments made to this specific itinerary.")

class TripItinerary(BaseModel):
    """
    The root output schema.
    - If budget is OK: contains exactly one TripOption.
    - If budget is exceeded: contains two TripOptions (Optimal + Budget-Friendly).
    """
    options: List[TripOption] = Field(description="The generated itinerary options. Usually 1 or 2 options depending on budget.")
    constraints_applied: Optional[List[str]] = Field(description="Any constraints applied to the itinerary", default=None)
    total_budget: Optional[float] = Field(description="Total estimated budget for the primary (first) option — used by validation", default=None)

# --- Phase 4: Patch Request Schema (V4 — Universal Parameter Patching) ---

class PatchRequest(BaseModel):
    """
    Structured output from the Change Detector LLM.
    Tells the graph EXACTLY what the user wants changed and the MINIMUM set of tools to re-run.

    ROUTING MATRIX (what each change_type triggers):
    ─────────────────────────────────────────────────────────────────────────────
    hotel_change      → hotel_tool(city)                    → itinerary subgraph
    transport_change  → transport_tool(prev_city → city)    → itinerary subgraph
    add_city          → ALL tools for new city + 2 legs     → retrieval subgraph
    remove_city       → Delete city + 1 transport leg       → itinerary subgraph
    replace_city      → ALL tools for new city              → retrieval subgraph
    origin_change     → transport_tool(new_origin → city1)  → retrieval subgraph
    traveler_change   → Recalculate budget + transport      → itinerary subgraph
    reorder_cities    → 2 adjacent transport legs only      → itinerary subgraph
    parameter_change  → Mutate global TripState keys        → itinerary (or retrieval if travel_mode)
    full_replan       → Full retrieval pipeline from scratch → retrieval subgraph
    ─────────────────────────────────────────────────────────────────────────────
    """
    change_type: str = Field(
        description=(
            "Exact type of change. Must be one of: "
            "'hotel_change', 'transport_change', 'add_city', 'remove_city', 'replace_city', "
            "'origin_change', 'traveler_change', 'reorder_cities', 'parameter_change', 'full_replan'. "
            "Use 'parameter_change' when the user wants to change global trip settings such as "
            "budget, pacing, travel mode/class, trip duration, or traveler profile."
        )
    )
    city: Optional[str] = Field(
        description="Primary city affected (for hotel_change, transport_change, add_city, remove_city, replace_city). None for parameter_change or full_replan.",
        default=None
    )
    affected_cities: Optional[List[str]] = Field(
        description=(
            "List of cities affected when multiple need updating. "
            "For reorder_cities: [city_a, city_b]. "
            "For add_city: [new_city, adjacent_before, adjacent_after]."
        ),
        default=None
    )
    new_value: Optional[str] = Field(
        description=(
            "New value for simple city replacements. "
            "For replace_city: the replacement city name. "
            "For origin_change: the new origin city name."
        ),
        default=None
    )
    instruction: Optional[str] = Field(
        description="Clear, specific instruction for the tool or planner e.g. 'Find a 5-star hotel in Agra under ₹15000/night'",
        default=""
    )
    # ── V4 NEW: Universal Parameter Patching ─────────────────────────────────
    parameter_changes: Optional[Dict[str, Any]] = Field(
        description=(
            "For 'parameter_change' only. A dictionary of ALL global TripState keys to mutate simultaneously. "
            "Valid keys and types: "
            "'budget' (number, e.g. 80000), "
            "'pacing' (string: 'Relaxed', 'Moderate', or 'Packed'), "
            "'travel_mode' (string: 'flight', 'train', 'bus', or 'any'), "
            "'travel_class' (string: 'Economy', 'Business', 'AC 2 Tier', 'AC 1st Class', 'Sleeper'), "
            "'trip_duration_days' (integer, e.g. 20), "
            "'traveler_profile' (string, e.g. '4 adults and 2 kids'). "
            "Example for 'Change my budget to 80000 and use trains': "
            "{'budget': 80000, 'travel_mode': 'train'}"
        ),
        default=None
    )

# --- Phase 3: Smart Extraction Schema ---

class TripRequirements(BaseModel):
    """
    Structured output from the Smart Extraction Agent.
    All fields are Optional so the LLM can leave unknown fields as None.
    The agent asks follow-up questions for any field that is None.
    Uses field_validator to intercept any hallucinated placeholder strings
    at the schema level — no brittle hardcoded word lists needed.
    """
    origin_city: Optional[str] = Field(description="The city the traveler is departing from. If not mentioned, output null.", default=None)
    destination_cities: Optional[Union[List[str], str]] = Field(description="List of target cities or regions to visit. Output null if not specified.", default=None)
    travel_dates: Optional[str] = Field(description="The travel date range, specific month, or relative time e.g. 'August 10 to 23', 'November', or 'Next month'. If not mentioned, output null.", default=None)
    trip_duration_days: Optional[str] = Field(description="Total days. If travel_dates is provided, leave this null to be auto-calculated.", default=None)
    budget_inr: Optional[str] = Field(description="Maximum total budget in INR (₹) as a string, e.g. '50000'. If not mentioned, output null.", default=None)
    traveler_profile: Optional[str] = Field(description="Description of travelers e.g. '4 elderly, 2 young adults'. If not mentioned, output null.", default=None)
    pacing: Optional[str] = Field(description="Trip pacing preference: Relaxed, Moderate, or Packed. If not mentioned, output null.", default=None)
    travel_mode: Optional[str] = Field(description="Preferred transport mode: flight, train, bus, or any. If not mentioned, output null.", default=None)
    travel_class: Optional[str] = Field(description="Class of travel e.g. Economy, Business, AC 2 Tier, Sleeper. If not mentioned, output null.", default=None)

    @field_validator('destination_cities', mode='before')
    @classmethod
    def coerce_cities_to_list(cls, v):
        """
        Defensive fix: small LLMs (8B) sometimes return destination_cities as a
        plain string ("CityA") instead of an array (["CityA"]).
        This validator transparently coerces it so Pydantic never crashes.
        Handles:
          - None             None
          - "CityA"        ["CityA"]
          - "CityA, CityB"   ["CityA", "CityB"]
          - ["CityA"]      ["CityA"]  (already correct, pass through)
        """
        if v is None:
            return None
        if isinstance(v, list):
            # Filter out null/empty/hallucinated placeholder entries inside the list
            _bad = {
                'null', 'none', 'unknown', 'n/a', 'na', 'not specified',
                'not mentioned', 'not provided', 'unspecified',
                'undefined', 'missing', '-', '--',
            }
            cleaned = [str(c).strip() for c in v if c and str(c).strip().lower() not in _bad]
            return cleaned if cleaned else None
        if isinstance(v, str):
            stripped = v.strip()
            _bad = {
                'null', 'none', 'unknown', 'n/a', 'na', 'not specified',
                'not mentioned', 'not provided', 'unspecified',
                'undefined', 'missing', '-', '--',
            }
            if not stripped or stripped.lower() in _bad:
                return None
            # Split on comma in case the LLM packed multiple cities into one string
            parts = [p.strip() for p in stripped.split(',') if p.strip() and p.strip().lower() not in _bad]
            return parts if parts else None
        return v


    @field_validator(
        'origin_city', 'travel_dates', 'trip_duration_days', 'budget_inr',
        'traveler_profile', 'pacing', 'travel_mode', 'travel_class',
        mode='before'
    )
    @classmethod
    def sanitize_placeholder(cls, v):
        """
        Language-agnostic validator. Instead of matching against a hardcoded
        list of words, we check if the value is semantically 'empty'.
        This is future-proof for multilingual use.

        Strategy: If the LLM outputs a valid, specific value, it will be a
        meaningful string (e.g. 'CityX', 'Economy', '14'). If it's a
        placeholder, it will typically be very short or have no numeric/alpha
        content that encodes real information.

        We reject a string if:
        1. It's empty after stripping whitespace.
        2. After removing digits, the remaining string is ONLY composed of
           non-alphanumeric characters (e.g. it was just a number like '0').
        3. It matches the JSON literal 'null' (case-insensitive), which is the
           canonical 'missing' signal we instruct the LLM to use.
        """
        if v is None:
            return None
        if not isinstance(v, str):
            return v
        stripped = v.strip()
        # Reject empty strings
        if not stripped:
            return None
        # Reject common LLM hallucinations for a missing value.
        # NOTE: 'any' is intentionally NOT in this list — it is a valid value for
        # travel_mode ("flight, train, bus, or any"). Rejecting it causes an
        # infinite re-ask loop because the LLM correctly outputs "any" when the
        # user has no transport preference.
        _lower = stripped.lower()
        if _lower in (
            'null', 'none', 'unknown', 'n/a', 'na', 'not specified',
            'not mentioned', 'not provided', 'unspecified',
            'undefined', 'missing', '-', '--',
        ):
            return None
        return stripped

    @model_validator(mode='after')
    def auto_compute_duration(self):        # Date parsing
        if self.travel_dates and not self.trip_duration_days:
            try:
                # Handle "12 dec to 20 dec" or similar splits
                for delimiter in [" to ", "-", " until ", " till "]:
                    if delimiter in self.travel_dates.lower():
                        parts = self.travel_dates.lower().split(delimiter)
                        if len(parts) == 2:
                            d1 = dateparser.parse(parts[0].strip())
                            d2 = dateparser.parse(parts[1].strip())
                            if d1 and d2:
                                days = (d2 - d1).days + 1 # inclusive
                                if days > 0:
                                    self.trip_duration_days = str(days)
                        break
            except Exception:
                pass
                
        return self
