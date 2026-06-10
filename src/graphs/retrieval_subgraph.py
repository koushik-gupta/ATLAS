import datetime
from langgraph.graph import StateGraph, START, END
from langchain_core.runnables.config import RunnableConfig

from src.state.trip_state import TripState
from src.tools.transport_tool import transport_search
from src.tools.hotel_tool import hotel_search
from src.tools.places_tool import places_search
from src.tools.weather_tool import weather_search

def retrieval_deterministic_node(state: TripState, config: RunnableConfig):
    """
    Deterministic pure Python retrieval loop that replaces the expensive 70B ReAct agent.
    Directly runs transport_search, hotel_search, places_search, and weather_search.
    """
    emit = config.get("configurable", {}).get("emit") if config else None
    origin = state.get("origin_city") or "Unknown"
    destinations = state.get("destination_cities") or []
    dates = state.get("travel_dates") or "Unknown"
    mode = state.get("travel_mode") or "any"
    travel_class = state.get("travel_class") or "Economy"
    
    print(f"⚡ Running pure Python deterministic retrieval loop for: {destinations}")
    
    hotels = []
    places = []
    transport = []
    
    # city_roles tells us which cities are Base Hubs vs Day-Trips.
    # Only Base Hubs (and layover cities) need overnight hotel searches.
    city_roles = state.get("city_roles") or {}
    layover_cities_lower = {c.lower() for c in (state.get("layover_cities") or [])}
    
    # 1. Call hotel_search and places_search for each destination city
    for city in destinations:
        if emit: emit("city_plan_start", f"Planning {city}...", city=city)
        city_role = city_roles.get(city, "Base Hub")
        needs_hotel = (city_role != "Day-Trip") or (city.lower() in layover_cities_lower)
        
        # Search hotels only for cities that need overnight stay
        if needs_hotel:
            if emit: emit("city_hotel_search", f"Finding hotels in {city}...", city=city)
            try:
                h_res = hotel_search.invoke({"destination": city})
                for item in h_res:
                    if isinstance(item, dict) and "city" not in item:
                        item["city"] = city
                hotels.extend(h_res)
            except Exception as e:
                print(f"[WARNING] Error fetching hotels for {city}: {e}")
        else:
            print(f"️ Skipping hotel search for {city} (Day-Trip — no overnight stay needed)")
            
        # Search attractions for all cities (day-trips need sightseeing data too)
        if emit: emit("city_attraction_search", f"Discovering gems in {city}...", city=city)
        try:
            p_res = places_search.invoke({"destination": city, "category_type": "attractions"})
            for item in p_res:
                if isinstance(item, dict) and "city" not in item:
                    item["city"] = city
            places.extend(p_res)
        except Exception as e:
            print(f"[WARNING] Error fetching places for {city}: {e}")
            
        if emit: emit("city_plan_complete", f"Blueprint ready: {city}", city=city)

    # 2. Call transport_search for each transport leg
    legs = []
    if destinations:
        # First leg: origin -> first destination
        legs.append((origin, destinations[0]))
        # Intermediate legs
        for i in range(len(destinations) - 1):
            legs.append((destinations[i], destinations[i+1]))
        # Last leg: last destination -> origin
        legs.append((destinations[-1], origin))
        
    for leg_origin, leg_dest in legs:
        if emit: emit("city_transport_search", f"Checking transit to {leg_dest}...", city=leg_dest)
        try:
            from src.utils.helpers import determine_leg_transport_mode
            actual_mode = determine_leg_transport_mode(leg_origin, leg_dest, mode)
            
            t_res = transport_search.invoke({
                "origin": leg_origin,
                "destination": leg_dest,
                "date": dates,
                "travel_mode": actual_mode,
                "travel_class": travel_class
            })
            for item in t_res:
                if isinstance(item, dict):
                    if "origin" not in item:
                        item["origin"] = leg_origin
                    if "destination" not in item:
                        item["destination"] = leg_dest
            transport.extend(t_res)
        except Exception as e:
            print(f"[WARNING] Error fetching transport from {leg_origin} to {leg_dest}: {e}")
            
    return {
        "hotel_options": hotels,
        "places_options": places,
        "transport_options": transport
    }

# Build the Retrieval Subgraph deterministically
builder = StateGraph(TripState)
builder.add_node("retrieval_node", retrieval_deterministic_node)
builder.add_edge(START, "retrieval_node")
builder.add_edge("retrieval_node", END)

# Compile the subgraph
retrieval_graph = builder.compile()
