# Centralized Prompts for Travel Planner AI

def get_layover_suggestion_prompt(origin: str, destinations: list[str], profile: str, pacing: str, mode: str) -> str:
    # Build a text block of explicit consecutive legs
    legs = []
    if destinations:
        legs.append(f"{origin} -> {destinations[0]}")
        for i in range(len(destinations) - 1):
            legs.append(f"{destinations[i]} -> {destinations[i+1]}")
        legs.append(f"{destinations[-1]} -> {origin}")
        
    legs_str = "\n".join([f"  - Leg {idx+1}: {leg}" for idx, leg in enumerate(legs)])
    
    return (
        f"Origin City: {origin}\n"
        f"Optimized Route Destinations: {destinations}\n"
        f"Exact Consecutive Legs:\n{legs_str}\n"
        f"Traveler Profile: {profile}\n"
        f"Pacing: {pacing}\n"
        f"Transport Mode Preference: {mode}\n\n"
        "Analyze each individual adjacent leg above for transit distance, time, and traveler fatigue.\n"
        "CRITICAL: Layovers should only be suggested between two consecutive destinations if the distance is extremely large (e.g., long overland hops >8 hours) AND the traveler profile (e.g., solo, elderly, kids) or pacing (relaxed) warrants a rest stop.\n"
        "If a leg warrants a layover, identify a geographically logical mid-point city.\n"
        "For example, for a long train route between Shantiniketan and Darjeeling, a layover in Siliguri is highly logical.\n"
        "Specify the exact destination city the layover should be inserted BEFORE. For instance, if inserting Siliguri between Shantiniketan and Darjeeling, it should be inserted BEFORE Darjeeling.\n"
        "If no layover is needed for any adjacent leg, set suggest_layover=False."
    )

def get_feasibility_resolution_prompt(selected_cities: list[str], resolution: str) -> str:
    return (
        f"The user had this list of destinations: {selected_cities}.\n"
        f"They realized it's too packed and requested this change: '{resolution}'.\n"
        "Output the updated list of destinations. If they asked to add/swap a city, include the new city."
    )

def get_intent_classification_prompt(text: str, current_cities: list[str]) -> str:
    return (
        f"The user said: '{text}'\n"
        f"The currently selected cities are: {current_cities}\n"
        "Classify the user's intent. If they are asking for more options/recommendations, it's REQUEST_MORE. "
        "If they are asking a question about a specific place (e.g., 'tell me more about Mirik', 'what is in Darjeeling?'), it's QUESTION. "
        "If they are just listing cities or saying yes/no, it's SELECTION_ONLY. "
        "If they explicitly say 'show previous', 'show list', etc., it's SHOW_PREVIOUS."
    )

def get_destination_details_prompt(text: str) -> str:
    return f"The user asked: '{text}'. Give a short, engaging, 2-3 sentence travel pitch answering their question."

def get_more_options_prompt(current_cities: list[str], duration: str, origin: str = "") -> str:
    origin_context = f" (Note: the traveler is starting from {origin}, so avoid suggesting the origin region as a new destination.)" if origin else ""
    return (
        f"The user currently has these destinations: {current_cities}. "
        f"They want MORE options for their {duration}-day trip.{origin_context} "
        "Provide 3 to 4 NEW, highly relevant MAJOR BASE HUBS or FAMOUS DESTINATIONS that are in the SAME region/state/country as the existing cities. "
        "CRITICAL: Do NOT suggest destinations from completely different parts of the country. "
        "GEOGRAPHIC PROXIMITY RULE: You MUST prioritize destinations that are physically closest to the current cities. Start with the nearest neighbors and only expand outward once nearby hubs are exhausted. "
        "CRITICAL HUB RULE: You MUST suggest major regional anchors (e.g., Gangtok, Srinagar) OR highly notable immediate neighbors (e.g., Mirik, Siliguri for Darjeeling). The closer a town is to the current cities, the more acceptable it is to include, even if it is a secondary town. Only avoid completely unknown, granular tiny villages. "
        "Do not repeat the current cities. To ensure variance, actively avoid falling back to the exact same predictable list; find fresh, varied geographical neighbors or circuits."
    )

def get_initial_pitch_prompt(user_cities: list[str], duration: str) -> str:
    n = len(user_cities)
    return (
        f"The user wants a {duration}-day trip involving these places: {user_cities}. "
        f"Generate destination pitches strictly for the {n} cities the user requested. "
        "Only suggest 1-2 nearby additions if the duration is significantly longer than needed for the requested cities alone. "
        "Do NOT pad the list to reach any minimum count."
    )

def get_smart_destination_analyzer_prompt(raw_cities: list[str], origin: str, duration: str, search_data: str) -> str:
    origin_filter = ""
    if origin:
        origin_filter = (
            f"8. CRITICAL ORIGIN FILTER RULE: The traveler is departing FROM {origin} and traveling TO {raw_cities}. "
            f"You MUST NEVER suggest any destinations located in the origin region or origin state ({origin}). "
            f"Suggesting their home cities (like Manchester or Liverpool if origin is England) is a massive logical error. "
            f"All suggested expansions must be situated in the destination's state/region (e.g., Switzerland for a Zurich tour), completely distinct from the origin state ({origin}).\n"
        )
    city_list_str = ', '.join(raw_cities)
    return f"""You are a Senior Travel Analyst. The user from {origin} wants a {duration}-day trip and mentioned these destinations: {raw_cities}.

Your job is to produce a SMART, CURATED destination list.

IMPORTANT RULES:
1. INDIVIDUAL CITIES ONLY: You MUST return single, specific city or town names (e.g. "Paris", "Versailles"). Do NOT group cities together. NEVER return "Circuits", "Tours", "Regions", or hyphenated multi-city names (e.g. NO "Paris-Versailles Circuit").
2. LANDMARK INJECTION: For each destination, identify its 1-2 most world-famous tourist landmarks. These are attractions so iconic that they define the very reason tourists go there. These landmarks MUST appear prominently in the destination's pitch.
   - ONLY inject truly recognized, top-tier landmarks. Do NOT add generic temples, local parks, or ordinary tourist spots.
8. EXPANSION HIERARCHY (STRICT GEOGRAPHIC PROXIMITY): You MUST generate the absolute CLOSEST geographical neighbors FIRST. Do not blindly copy popular internet circuits (like "Darjeeling-Gangtok-Pelling"). If the user asks for Darjeeling, you MUST generate all immediate neighbors within 40km (e.g., Kurseong, Mirik, Kalimpong, Lamahatta, Sonada, Siliguri) BEFORE you even consider generating distant hubs like Gangtok or Pelling. Your output array MUST be saturated with immediate neighbors before distant ones are added!
4. CROSS-STATE SUPPORT: The user explicitly asked for these cities: [{city_list_str}]. You MUST include them in your output, even if they span multiple different states or regions! If the user provides a cross-state location, you MUST respect it and you may then suggest logical expansions around each of those distinct regions. Do NOT drop user cities unless they are completely geographically impossible for a {duration}-day trip.
5. WE NEED OPTIONS: We want to show the user a healthy variety of choices. Aim to provide 8 to 10 excellent destination suggestions (including the user's choices). Do not just stop at 4 or 5! You MUST fill the list with immediate proximal gems.
6. Each entry must be a real, specific CITY or TOWN — not a hotel, street, vague area, or circuit.
7. HUB & PROXIMAL CITIES ONLY: When suggesting NEW expansions beyond the user's list, you MUST suggest highly notable immediate neighbors (e.g., Mirik, Kurseong, Siliguri for Darjeeling). CRITICAL: The closer a town is to the user's requested cities, the more acceptable it is to include! Ignore popularity in favor of pure geographic proximity!
{origin_filter}
Search context to help validate real landmarks:
{search_data}"""

# --- Graphs ---

def get_route_allocation_prompt(duration: int, origin: str, destinations: list[str], profile: str, pacing: str, city_summary: str = "", layover_cities: list = None) -> str:
    summary_block = ""
    if city_summary:
        summary_block = (
            f"\nDESTINATION IMPORTANCE SCORES (computed from actual retrieved attraction data):\n"
            f"{city_summary}\n"
            f"\nUse these scores as your primary mathematical evidence for assigning both roles and night allocation. "
            f"The scores reflect Attraction Density, Excursion Radius, Regional Importance, and Travel Effort. "
            f"Cities with higher scores are more tourist-worthy and deserve proportionally more nights. "
            f"Cities with low scores should receive minimal nights or be classified as Day Excursions or Transit Stops.\n"
        )
    layover_block = ""
    if layover_cities:
        layover_list = ", ".join(layover_cities)
        layover_block = (
            f"\nHARD LAYOVER CONSTRAINT (NON-NEGOTIABLE, OVERRIDES ALL OTHER RULES):\n"
            f"The following cities are TRANSIT LAYOVERS only, not tourist destinations: {layover_list}.\n"
            f"They MUST each receive EXACTLY 1 night — no more, no fewer. "
            f"Do NOT increase their nights based on tourist scores or city size. "
            f"Distribute the remaining nights only among the non-layover destinations.\n"
        )
    pacing_block = ""
    if pacing.lower() == "packed":
        pacing_block = (
            "- PACING=PACKED: Compress the trip heavily. Maximize destinations visited per day.\n"
            "  * Medium-value hubs (e.g., Pahalgam, Sonamarg) MUST get max 1-2 nights.\n"
            "  * Nearby excursions MUST be treated as day-trips (0 nights).\n"
            "  * Do NOT extend stays just because a city has many attractions. Pacing dictates the maximum allowable nights.\n"
            "  * Remove weak fillers and only prioritize flagship attractions.\n"
        )
    elif pacing.lower() == "relaxed":
        pacing_block = (
            "- PACING=RELAXED: Slower travel. Minimize hotel changes.\n"
            "  * Allocate more nights (3+) to scenic hubs so the traveler can rest.\n"
            "  * Include secondary attractions and prioritize comfort over coverage.\n"
            "  * Avoid 1-night hotel hops.\n"
        )
    else:
        pacing_block = (
            "- PACING=MODERATE: Balance the trip. 2-3 nights per major hub.\n"
            "  * Balance exploration and comfort. Use day-trips (0 nights) to avoid unnecessary hotel check-ins.\n"
        )

    return (
        f"You are a Route Allocation expert. Given the total trip duration of {duration} days, "
        f"origin {origin}, destinations {destinations}, traveler profile {profile}, and pacing {pacing}.\n"
        f"{summary_block}"
        f"{layover_block}\n"
        f"Allocate the total nights ONLY to the destination cities provided in {destinations}.\n"
        "DESTINATION ROLE ENGINE (CRITICAL):\n"
        "You must classify each destination into exactly one of the following roles:\n"
        "- OVERNIGHT_HUB: Major anchor town receiving hotel and night allocation.\n"
        "- DAY_EXCURSION: Minor town explored from a hub. Receives 0 nights.\n"
        "- TRANSIT_STOP: Logistical gateway such as NJP, Siliguri, Chandigarh, airports, or railheads. "
        "Receives 0-1 nights maximum and minimal sightseeing. Do NOT allocate multiple nights to pure transit hubs.\n"
        "- EN_ROUTE_CORRIDOR: A waypoint town that sits naturally on the transit path between two hubs. "
        "Receives 0 nights and must be absorbed into the travel day rather than treated as a round-trip excursion.\n"
        "- ATTRACTION_CLUSTER: Granular area that should be merged into the nearest hub. Receives 0 nights.\n\n"
        "IMPORTANT RULES:\n"
        "1. Use OVERNIGHT_HUB only for true base towns where the traveler should stay overnight.\n"
        "2. Use DAY_EXCURSION only when the place is naturally visited from a hub and is NOT part of the forward travel corridor.\n"
        "3. Use EN_ROUTE_CORRIDOR when the place lies naturally between two hubs on the route and should be absorbed into transit.\n"
        "4. Use TRANSIT_STOP for gateways and junctions that primarily support movement.\n"
        "5. Cities assigned DAY_EXCURSION, EN_ROUTE_CORRIDOR, or ATTRACTION_CLUSTER must receive 0 nights.\n"
        "6. Prefer EN_ROUTE_CORRIDOR over DAY_EXCURSION whenever the stop is on the way to the next hub.\n"
        "\nALLOCATION PRINCIPLES:\n"
        "- Let the Destination Importance Scores above guide your distribution. High-score cities deserve the lion's share.\n"
        "- A city's allocated nights should be proportional to its score relative to the others.\n"
        "- NIGHT WEIGHTING (CRITICAL): You MUST explicitly evaluate a hub's activity density, flagship attraction count, and excursion radius. Larger, activity-rich hubs (e.g. Darjeeling) MUST receive more nights than smaller, purely scenic hubs (e.g. Pelling) regardless of pacing.\n"
        f"{pacing_block}"
        "- Prefer depth over breadth: it is better to spend 4 nights in one great OVERNIGHT_HUB than 1 night each in 4 weak ones.\n"
        f"CRITICAL RULE: Do NOT allocate any nights to the origin city ({origin}).\n"
        f"If the total ideal nights for all selected cities based on their scores is significantly less than the requested {duration} days, do NOT artificially inflate nights to fill the duration. Allocate ONLY the ideal number of nights, and let the total sum be less than {duration} days (or leave 1-2 days buffer for travel if it fills the duration).\n"
        "CRITICAL SCHEMA RULE: Your JSON output MUST strictly contain ONLY the 'allocations' array! "
        "Each object in the array must have 'city', 'nights', and 'role' fields."
    )


def get_city_tour_planner_prompt(
    city: str, nights: int, current_date_str: str, profile: str, pacing: str,
    mode: str, travel_class: str, prev_city: str, layover_rule: str,
    dynamic_pacing_rule: str, selections_block: str, city_context: str,
    hotel_budget_cap: int = 3000, weather_downgrade: bool = False,
    pruned_cities: list[str] = None
) -> str:
    weather_rule = ""
    if weather_downgrade:
        weather_rule = "CRITICAL: The user was warned about bad weather (e.g. rain/monsoon/heat) but chose to proceed anyway. DO NOT suggest changing dates. DO NOT scold the user. Instead, organically prioritize indoor activities, museums, and relaxed pacing to handle the weather safely.\n"

    pruned_rule = ""
    if pruned_cities:
        pruned_rule = f"10. CONTEXTUAL ROUTE MENTIONS: The user originally requested {', '.join(pruned_cities)} but they were skipped for route efficiency. Mention them gracefully (e.g., 'Travel through the scenic Kullu Valley en route to Manali') if geographically relevant, without adding overnight stays or dedicated sightseeing time for them.\n"

    return f"""You are the City Tour Planner. Generate a detailed `CityStop` for {city} where the traveler will stay for {nights} nights starting on {current_date_str}.
The traveler profile is {profile} and pacing is {pacing}. They prefer traveling by {mode} ({travel_class}) from {prev_city} to {city}.
You MUST plan transport from {prev_city} to {city} in `transport_to_city`, choose a hotel in {city} in `hotel`, and write a detailed, chronological list of activities for each day in `day_plans`.

{layover_rule}

CRITICAL RULES:
{weather_rule}1. GEOSPATIAL GROUPING (MATH + LOGIC): The raw tool data has been enriched with mathematical Haversine distances. You MUST explicitly use your `planner_scratchpad` to read the `nearby_places` field attached to each attraction. To minimize travel time, build your daily groups strictly out of places that are listed in each other's `nearby_places` fields. Do NOT schedule adjacent places on different days!
   - FLAGSHIP EXCEPTION: You MUST select Tier-1 Flagship landmarks (e.g. Tiger Hill) even if they break geographic clustering. Do NOT sacrifice world-famous landmarks for the sake of minimizing travel time. Use geographic clustering only for Tier-2 and Tier-3 secondary attractions.
2. TIME INTELLIGENCE & NARRATIVE: You are an expert travel guide. Estimate how long each attraction takes to visit realistically. {dynamic_pacing_rule} Write each activity as a knowledgeable companion would — explain WHY the place matters, what to expect when you arrive, the best time of day, and one practical tip (e.g. 'arrive before 9 AM to avoid tour groups', 'the upper terrace offers the best panoramic view'). Avoid robotic phrases like 'Visit X', 'Explore Y', 'Proceed to Z'. DO NOT REPEAT ATTRACTIONS.
3. NO CLOCK TIMINGS: Do NOT allocate rigid clock hours or specific start/end times (do not generate '09:00 AM - 10:30 AM'). Instead, use a natural chronological flow: Morning → Midday → Afternoon → Evening. Set `start_time` and `end_time` fields to null or empty string.
4. NO HALLUCINATION: Only use hotels, attractions, and transport found in the RAW TOOL DATA below.
5. EXACT DAYS: You MUST generate exactly {max(1, nights)} `DayPlan` objects. Do NOT generate an extra departure day plan; the morning of departure is handled by the next city's arrival day.
6. BUDGET HOTELS: Select hotels priced at or below ₹{hotel_budget_cap:,}/night. Strongly avoid expensive options unless no cheaper alternative exists in the data. If a hotel within budget is available, always choose it over a luxury one.
7. LEG-SPECIFIC TRANSIT DURATIONS: The duration in `transport_to_city` must reflect ONLY the specific leg from {prev_city} to {city} — not the full end-to-end route of a long-haul train. A train that runs Howrah→Chennai (22 hrs total) may only take 7 hrs to reach an Odisha stop — use 7 hrs.
8. ATTRACTION PRIORITIZATION FRAMEWORK: You MUST select attractions using a strict 4-Tier hierarchy to avoid generic itineraries.
   - Tier 1 (Flagship Attractions): World-famous landmarks (e.g., Tiger Hill sunrise and Batasia Loop in Darjeeling, Taj Mahal, Eiffel Tower). YOU MUST AGGRESSIVELY SEARCH FOR AND SCHEDULE THESE FIRST before adding lesser attractions.
   - Tier 2 (Regional Highlights): Highly-rated local specialties (e.g., Fontainhas, Tea Gardens). Schedule these next.
   - Tier 3 (Local Experiences): Heritage walks, authentic food streets, or cultural markets.
   - Tier 4 (Generic Fillers): Random parks, entry gates, unnamed viewpoints. NEVER use Tier 4 unless you have completely run out of Tier 1-3 options. 
   Do NOT pad the itinerary with weak fillers if better attractions exist in the RAW TOOL DATA!
9. ARRIVAL DAY RULE: On Day 1 at {city} (the travel day from {prev_city}), if the journey takes more than 2 hours: plan ONLY arrive → check in → light walk within 15 minutes of the hotel → dinner. Absolutely NO monument visits, museum tours, or excursions on the arrival day after a long journey.
{pruned_rule}
10. DEPARTURE DAY RULE: On the final day at {city} before the next move: plan ONLY morning sightseeing within easy reach of the hotel, then check out and depart. Do NOT plan far or time-consuming destinations on departure day.
11. TRANSPORT REALISM & MULTI-MODAL FALLBACK: If no direct train or flight is found for this leg, the realistic option is often a shared jeep, private taxi, or road transfer. CRITICAL MULTI-MODAL RULE: If the user requested Flight: (1) Attempt flight to the nearest practical airport. (2) Use road transfer for last-mile connectivity. (3) IMPORTANT: If the nearest airport is so absurdly far that taking a Train or Bus directly is objectively faster and more logical (e.g., Kolkata to Digha), you MUST override the user's Flight request. Do NOT blindly force a flight if it ruins the trip. If you override, explicitly explain why in the transport description (e.g., "Selected Train instead of Flight because the nearest airport is X hours away").
12. DESTINATION INSIGHT: You MUST generate a `destination_insight` string. This MUST NOT mention any API behavior, planner decisions, clustering, missing hotel data, or internal backend logic. Format it EXACTLY like this with small icons, keeping it concise and editorial (IF THIS IS A TRANSIT NODE, omit the sections and just provide a single 1-line logistical note):

🏔 Destination Summary
[A short editorial overview of the destination. Max 4-6 lines.]

✨ Highlights
• [Highlight 1]
• [Highlight 2]
• [Highlight 3]

🧭 Role In Journey
[Why this stop exists within the itinerary. Max 4 lines.]

🌲 Atmosphere
[A brief description of what to expect. Max 4 lines.]
{selections_block}

RAW TOOL DATA:
{city_context}"""

def get_return_journey_prompt(origin: str, prev_city: str, current_date_str: str, mode: str, travel_class: str, return_context: str) -> str:
    return f"""You are the Return Journey Planner. Generate a final `CityStop` for {origin}.
The traveler is returning home from {prev_city} to {origin} on {current_date_str}.
They prefer traveling by {mode} ({travel_class}).

CRITICAL RULES:
1. SET nights to 0.
2. DO NOT include a hotel.
3. INSTEAD of a day plan, ONLY output the `transport_to_city` field with the return transport details.
4. If no transport data is available, generate a highly realistic synthetic transport option based on the mode.
5. LEG-SPECIFIC TRANSIT DURATIONS: Ensure the return transport duration strictly corresponds to the specific leg being traveled (from {prev_city} back to {origin}). Do NOT copy the full end-to-end duration of a long-haul train or flight if the traveler is getting off at an intermediate stop! For example, if the Eurostar train goes all the way from London to Amsterdam (4 hours), the travel duration from London back to Brussels is only around 2 hours. You must be highly accurate and adjust the transit duration to reflect ONLY the duration for the specific leg of the journey the traveler is taking!

RAW TOOL DATA:
{return_context}"""

def get_change_detector_prompt(request: str, current_draft: str) -> str:
    return (
        f"The user wants to change this itinerary:\n{request}\n\n"
        f"Here is the current draft:\n{current_draft}\n\n"
        "Extract the type of change ('hotel_change', 'transport_change', 'activity_change', 'add_destination', 'remove_destination'), "
        "the specific city or node affected, and the explicit instructions."
    )

def get_retrieval_system_prompt(
    today: str,
    origin: str,
    destinations: list,
    dates: str,
    profile: str,
    pacing: str,
    mode: str,
    travel_class: str,
) -> str:
    return f"""You are the Data Retrieval Assistant for a Travel Planner AI.
CRITICAL: Today's date is {today}.

Trip Parameters:
- Origin City: {origin}
- Destination Cities: {destinations}
- Travel Dates: {dates}
- Traveler Profile: {profile}
- Pacing: {pacing}
- Preferred Transport Mode: {mode}
- Preferred Travel Class: {travel_class}

Your job is ONLY to call the necessary tools (weather, transport, hotel, places) to gather data.

CRITICAL RULES:
1. ORIGIN RULE: The Origin City ({origin}) is ONLY your starting and ending point. You must NEVER search for hotels or attractions in the Origin City. Only use it for transport to the first destination and from the last destination.
2. TRANSPORT RULE: You MUST pass the Preferred Transport Mode and Preferred Travel Class as arguments to the transport_tool.
3. LOOP PREVENTION: You MUST only call tools ONCE per destination. Look at the chat history. If you see ToolMessage responses, do NOT call any more tools. Just output a text message "Data retrieved." and stop.
4. DINING RULE: For EVERY destination city, you MUST call `places_search` TWICE: once with category_type="attractions", and once with category_type="dining". We need real restaurant names!
"""

# --- Tools ---

def get_hotel_tool_prompt(destination: str, raw_data: str) -> str:
    return f"""Extract at least 5 realistic hotel options for {destination} based on these search results. If the results lack exact prices or ratings, invent highly realistic estimates (e.g., \u20b92000-\u20b915000) so the user has fully fleshed-out options to choose from.
Return ONLY valid JSON matching the schema.
Raw Data: {raw_data}"""

def get_places_tool_prompt(category_type: str, destination: str, raw_data: str) -> str:
    return f"""Extract realistic {category_type} for {destination} from these search results.
Return ONLY valid JSON matching the schema.
CRITICAL: Only extract HIGH-VALUE attractions. A high-value attraction has clear tourist significance — it is either culturally important, scenically remarkable, historically notable, uniquely local, or consistently highly reviewed.
Avoid extracting: low-traffic local parks with no notable features, unnamed or poorly-described roadside spots, generic recreation areas with no tourist significance.
Note: do NOT apply blanket category bans — even science centers and parks can be world-class (e.g. Padmaja Naidu Zoological Park in Darjeeling is a top attraction). Judge each place on its own merit.
IMPORTANT: Group nearby places together if they are commonly visited in one trip.
Do not invent places not found in the data.
Raw Data: {raw_data}"""

def get_transport_tool_prompt(mode_text: str, class_text: str, origin: str, destination: str, raw_data: str) -> str:
    return f"""Extract at least 3 realistic {mode_text} ({class_text}) transport options from {origin} to {destination} based on these search results. 
CRITICAL: You MUST include the specific Departure and Arrival Airport names (e.g. 'Netaji Subhash Chandra Bose International Airport') or Train Station names in the `details` field! Do not just say 'Non-stop flight'.
If the results lack exact times, invent highly realistic standard schedules and prices for this route to ensure the user has complete options to choose from.

CRITICAL TRANSPORT REALISM RULE: There are NO direct broad-gauge train or regular commercial flight routes to high-altitude hill stations across the world (e.g., Zermatt, St. Moritz, Chamonix, Cortina). For any journey to these hill stations, the rail/flight endpoint is a lower-altitude transit hub (e.g., Geneva, Zurich, Milan). The subsequent leg MUST be planned as a road transfer (private taxi, shared jeep, or public bus taking several hours over mountain roads). NEVER claim there is a direct train or flight from outside cities directly to these hill stations. Under NO circumstances should you output a direct flight or broad-gauge train to a hill station!

Return ONLY valid JSON matching the schema.
Raw Data: {raw_data}"""

# --- main.py / Smart Extraction ---

def get_extraction_system_rules(current_date: str) -> str:
    """System rules injected at the start of every structured extraction call."""
    return (
        f"You are a Master Travel Planner. Today's date is {current_date}.\n"
        "CRITICAL RULE 0 (DATES — highest priority): You MUST resolve ALL relative date expressions into concrete values based on today's date. "
        "Examples: 'next month' → the full name of next calendar month (e.g. 'June 2026'), "
        "'this weekend' → the upcoming Saturday date, 'in 2 weeks' → the exact date 2 weeks from today. "
        "This is NOT an assumption — it is a required transformation. Always populate travel_dates when ANY time reference is given.\n"
        "CRITICAL RULE 1 (NO ASSUMPTIONS): If any information (like budget, pacing, traveler profile, origin) is NOT explicitly stated by the user, you MUST leave that field empty (null). DO NOT guess, assume, or hallucinate default values!\n"
        "CRITICAL RULE 2 (CURATION): Intelligently curate the `destination_cities` list based on the requested duration and traveler profile.\n"
        "- If the user allocates far too much time for a single location (e.g., '14 days in Paris'), auto-expand the list to include nearby logical hubs (e.g., Paris, Lyon, Marseille).\n"
        "- If they allocate too little time for too many cities (e.g., '5 days for 6 cities'), auto-prune the list to ensure a realistic, high-quality experience.\n"
        "CRITICAL RULE 3 (PACING): ONLY set pacing if the user EXPLICITLY uses words like 'packed', 'busy', 'non-stop' (Packed); 'relaxed', 'slow', 'chill' (Relaxed); or 'moderate', 'balanced' (Moderate). "
        "If none of these specific pacing words are used, you MUST leave pacing null. DO NOT guess or infer pacing from words like 'full tour' or 'complete trip'!\n"
        "CRITICAL RULE 4 (PROFILE): If the user only mentions a pacing preference without specifying who is travelling, "
        "infer a sensible default for traveler_profile based on context (e.g., 'solo traveler' if nothing stated).\n"
        "CRITICAL RULE 5 (GLOBAL DESTINATIONS): Whenever you extract an origin or destination city, you MUST append its Country (and State if applicable) based on context (e.g., 'Paris' -> 'Paris, France'). This prevents geographical name conflicts. WARNING: NEVER use 'Paris' or any other example as a default! If the user did not specify a city, YOU MUST OUTPUT null.\n"
        "CRITICAL RULE 6 (DURATION AND DATES - NEVER ASSUME): You must NEVER set trip_duration_days or travel_dates unless the user EXPLICITLY states them. "
        "Do NOT infer '7 days' from 'a week', do NOT set 'next month' unless the user actually said it, do NOT use today's month as a default. "
        "If either field is not explicitly stated, leave it null so the system will ask the user directly.\n"
    )


def get_clarification_question_prompt(current_date: str, known_info_json: str, question_hint: str) -> str:
    """Prompt for the clarification LLM to generate a single natural follow-up question."""
    return (
        f"You are a friendly AI travel agent. Today's date is {current_date}.\n"
        f"Known info so far: {known_info_json}\n"
        f"Generate ONE short, friendly, conversational question to ask for {question_hint}. "
        f"Do NOT list options in brackets. Do NOT add greetings. Just a single natural sentence."
    )

def get_extraction_update_context(system_rules: str, previous_context_json: str, question: str, answer: str, field_name: str = "") -> str:
    """Full context prompt to update TripRequirements after a user clarification answer."""
    field_hint = ""
    if field_name:
        field_hint = (
            f"\nCRITICAL: The user was asked about '{field_name}', so pay extra attention to extracting and updating that field. "
            f"However, you MUST ALSO extract any other fields mentioned in their answer if they are currently null. "
            f"For example, if they mention a travel class like '2nd ac', 'sleeper', 'ac 3 tier' or 'ac 2 tier' while answering about travel mode, you MUST update 'travel_class' as well. "
            f"Additional mappings: if pacing is mentioned and user says 'packed', 'fully packed', or 'busy' -> set pacing='Packed'; "
            f"if they say 'relaxed', 'slow', or 'chill' -> 'Relaxed'; if they say 'moderate' or 'normal' -> 'Moderate'. "
            f"If traveler profile is mentioned and user says 'solo' -> set traveler_profile='Solo traveler'.\n"
        )
    return (
        f"{system_rules}\n"
        f"Previous context: {previous_context_json}\n"
        f"The agent just asked: '{question}'\n"
        f"The user replied: '{answer}'\n"
        f"{field_hint}"
        f"Update ALL fields that can be inferred from the answer.\n"
        f"CRITICAL RULE: DO NOT clear, remove, or alter any fields that are already populated in the previous context unless the user explicitly requests to change them! Retain all existing values."
    )

def get_smart_pruning_prompt(cities: list, origin: str, duration_int: int, pacing: str = "Moderate", city_roles: dict = None) -> str:
    """Prompt for compound-mini to intelligently prune an over-stuffed city list."""
    roles_str = ""
    if city_roles:
        roles_str = f"Live Context - City Classifications: {city_roles}\n"

    return (
        f"Traveler wants to visit these cities: {cities} starting from {origin}.\n"
        f"However, the trip is only {duration_int} days long, and they prefer a '{pacing}' travel pace.\n"
        f"Your task is to intelligently prune this list down to a realistic number of destinations.\n\n"
        f"{roles_str}"
        f"CRITICAL INSTRUCTIONS:\n"
        f"1. GEOGRAPHIC AWARENESS: Consider the geographic distances and regions. If cities are densely packed, they can cover more. If spread out, cover fewer.\n"
        f"2. DESTINATION HIERARCHY (CRITICAL): When pruning, you MUST respect this hierarchy of importance:\n"
        f"   - OVERNIGHT_HUB: Highest survival weight. Protect major anchors.\n"
        f"   - EN_ROUTE_CORRIDOR: Medium weight. Keep if it fits naturally on the path.\n"
        f"   - DAY_EXCURSION: Medium weight. Keep if the hub is kept.\n"
        f"   - TRANSIT_STOP: Lowest sightseeing weight. However, Transit Stops (like NJP, Bagdogra, Siliguri) CANNOT be pruned if they are structurally required to enter or exit the region via the chosen transport mode. Prune a Transit Stop ONLY if it is entirely redundant or geographically unnecessary for the route.\n"
        f"3. DYNAMIC SIZING: Use your spatial reasoning to determine the maximum number of these specific locations that fit realistically into {duration_int} days based on their proximity.\n"
        f"4. PRUNING LOGIC: Retain the most iconic, high-value tourist destinations. Prune redundant nodes, distant outliers, and logistical nightmares until the list fits the timeframe.\n"
        f"5. DAY-TRIPS: Recognize if some cities are very close and can be absorbed as day-trips from a single hotel base, which saves massive time."
    )

def get_smart_restoration_prompt(pruned_list: list, removed_cities: list, target_days: int, current_days: int, pacing: str) -> str:
    """Prompt to intelligently restore the highest marginal-value cities when a list is over-pruned."""
    return (
        f"The current pruned itinerary {pruned_list} only takes {current_days} days at a '{pacing}' pace.\n"
        f"However, the user has {target_days} days available, meaning you pruned too aggressively!\n\n"
        f"Here are the cities you previously removed: {removed_cities}\n"
        f"Your task is to restore the 1-2 most valuable cities from the removed list to fill the remaining {target_days - current_days} days.\n"
        f"CRITICAL RULES:\n"
        f"1. Rank the removed cities by their 'marginal usefulness'.\n"
        f"2. Add back cities that complete a region, are iconic, or can easily be done as day-trips.\n"
        f"3. Do NOT add back distant outliers that will add massive transit burden just to fill time.\n"
        f"Return the new complete list of cities."
    )

def get_smart_reduction_prompt(pruned_list: list, target_days: int, current_days: int, pacing: str) -> str:
    """Prompt to intelligently remove the lowest marginal-value cities when a list is under-pruned."""
    return (
        f"The current itinerary {pruned_list} requires {current_days} days at a '{pacing}' pace.\n"
        f"However, the user ONLY has {target_days} days available, meaning you didn't prune enough!\n\n"
        f"Your task is to remove the lowest-value cities from the list until it fits realistically within {target_days} days.\n"
        f"CRITICAL RULES:\n"
        f"1. Identify the cities with the lowest combined score of attraction value and route coherence, or the highest transit penalty.\n"
        f"2. Prioritize the user's requested time constraint. If the selected route exceeds the available duration, first compress the itinerary by reducing low-value activities and merging nearby stops. Only prune additional cities if necessary. Never overwrite the user's duration automatically.\n"
        f"Return the newly reduced list of cities."
    )

def get_weather_analysis_prompt(travel_dates: str, weather_context: str) -> str:
    """Prompt for compound-mini to assess weather and suggest alternative dates if needed."""
    return (
        f"Analyze the weather for these destinations during the dates '{travel_dates}':\n\n"
        f"{weather_context}\n\n"
        "Determine if there are severe weather concerns (e.g. torrential monsoons, severe heatwaves >43C, heavy snow causing blockages, storms).\n"
        "If so, suggest the best alternative travel period. IMPORTANT: Do NOT use robotic date ranges like 'November 15 to February 15'. "
        "Instead, use natural, region-specific wording (e.g. 'Late autumn through mid-winter', 'The dry season from October to March')."
    )

def get_deep_research_fallback_prompt(city: str, duration_days: str, search_results: str) -> str:
    """Fallback prompt for basic destination research when smart analysis fails."""
    return (
        f"The user wants to visit '{city}' for {duration_days} days. "
        f"List real, specific sub-destinations or districts WITHIN {city} or its immediate surroundings (same state/region only). "
        f"Do NOT suggest cities from other states or distant regions — stay strictly within {city}'s state. "
        f"For each place, mention its single most famous landmark or experience. "
        f"Search Results: {search_results}"
    )

def get_ideal_trip_duration_prompt(origin: str, cities: list[str], pacing: str, web_context: str) -> str:
    return (
        f"The traveler is going from {origin} to these cities: {cities}. Pacing: '{pacing}'.\n"
        f"I have run a LIVE WEB SEARCH for recommended itineraries. Here are the top results:\n"
        f"== WEB SEARCH RESULTS ==\n{web_context}\n========================\n\n"
        f"Based STRICTLY on the web search and the pacing:\n"
        f"1. Classify each city using this exact 4-tier Destination Hierarchy:\n"
        f"   - OVERNIGHT_HUB: Major anchor receiving hotel nights.\n"
        f"   - EN_ROUTE_CORRIDOR: Waypoint absorbed into transit (0 nights).\n"
        f"   - DAY_EXCURSION: Minor town visited from a hub (0 nights).\n"
        f"   - TRANSIT_STOP: Logistical gateway like NJP or Bagdogra (0 nights).\n"
        f"2. Calculate the exact actual total trip duration (in days) needed to cover these cities and transit realistically.\n\n"
        f"MINIMUM STAY RULES (REALISM FLOORS):\n"
        f"- Major mountain hub: minimum 2–3 nights\n"
        f"- High-altitude acclimatization hub (e.g. Leh, Ladakh, Spiti): NEVER compress below ~3-4 nights even for PACKED pacing due to altitude sickness risks.\n"
        f"- Major transit region: must consume a partial travel day.\n"
        f"- Day-trip/Corridor/Transit Stop: 0 nights allowed.\n\n"
        f"TRANSIT BURDEN RULE:\n"
        f"- You MUST account for transit time. Changing hubs (e.g. Srinagar -> Leh) is NOT an instant switch even by flight. It consumes half-days for airport security, winding mountain roads, and hotel check-ins.\n\n"
        f"CRITICAL PACING RULE:\n"
        f"- If pacing is 'Relaxed', you MUST add 30-40% more days to the web's baseline recommendation.\n"
        f"- If pacing is 'Packed', compress the trip to maximize sightseeing density, BUT you MUST NOT compress below the minimum viable stay floors (acclimatization, transit fatigue). Do NOT blindly slash numbers if it violates safety or physical travel reality.\n"
        f"- The final `ideal_days` MUST mathematically reflect this realistic pacing adjustment."
    )

def get_layover_verdict_prompt(origin: str, first_dest: str, mode_lower: str, dist_km: float, web_context: str) -> str:
    return (
        f"A traveler wants to go from {origin} to {first_dest} by {mode_lower}.\n"
        f"Straight-line distance: ~{dist_km:.0f} km.\n\n"
        f"I have run a LIVE WEB SEARCH to check if a direct {mode_lower} exists. Here are the top results:\n"
        f"== WEB SEARCH RESULTS ==\n{web_context}\n========================\n\n"
        f"Based STRICTLY on the web search above and your geographic knowledge, answer this:\n"
        f"1. Is there a DIRECT connection? (If yes, needs_layover = False).\n"
        f"2. If no direct connection exists, or if a major mode switch is required (e.g., Train from {origin} ending at a junction, followed by a mountain cab to {first_dest}), set needs_layover = True and provide the logical junction_city (e.g., NJP, Pathankot).\n\n"
        f"CRITICAL RULES:\n"
        f"- **CRITICAL**: If the travel mode is 'flight', you MUST NOT suggest a layover unless absolutely unavoidable. Flight connections happen inside airports.\n"
        f"- If the destination doesn't have a railway station or airport (like Darjeeling, Zermatt), the user MUST take a bus/cab from the nearest major railhead/airport. Set needs_layover = True and name that railhead/airport (e.g. 'NJP' or 'Bagdogra').\n"
        f"This allows the system to ask the user if they want to pause and stay overnight at the junction, or proceed directly."
    )

def get_feasibility_check_prompt(origin: str, core_destinations: list[str], expanded_destinations: list[str], mode: str, pacing: str, duration: int) -> str:
    return (
        f"You are an expert travel planner evaluating trip feasibility.\n"
        f"Trip Brief:\n"
        f"- Origin: {origin}\n"
        f"- Explicitly Requested by User (Core): {core_destinations}\n"
        f"- Optional Tray Additions (Expanded): {expanded_destinations}\n"
        f"- Primary Transport Mode: {mode}\n"
        f"- Pacing Preference: {pacing}\n"
        f"- Total Duration Available: {duration} days\n\n"
        f"Based on these constraints, is it realistically possible to do a high-quality tour visiting ALL of these destinations in exactly {duration} days without exhaustion?\n"
        f"Factor in the transit time from the origin to the first destination, transit between destinations, and return transit. Remember mountain roads and long overland routes take significant time.\n"
        f"If the trip is NOT feasible, you MUST identify the SINGLE least logical or most geographically distant destination that should be removed to make the trip feasible.\n"
        f"CRITICAL RULE: The Explicitly Requested (Core) destinations are the fundamental reason for the trip and should be protected whenever reasonably feasible. "
        f"If the itinerary becomes severely unrealistic, you may recommend removing an explicitly requested destination, "
        f"but ONLY after all optional tray additions have been exhausted. Never silently remove a user's explicit destination if an optional one can be removed instead.\n"
        f"If the trip IS feasible, leave the 'city_to_remove' field empty."
    )
