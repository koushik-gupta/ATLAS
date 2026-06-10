import json
from langchain_core.tools import tool
from ddgs import DDGS
from typing import Dict, Any, List
import os
from src.llm_config import get_structured_llm
from pydantic import BaseModel, Field
from rich import print
from src.prompts import get_transport_tool_prompt

class ParsedTransport(BaseModel):
    provider: str = Field(description="Airline or train operator (e.g. Air India, Rajdhani Express)")
    price: str = Field(description="Estimated price in INR")
    departure_time: str = Field(description="Departure time if mentioned")
    arrival_time: str = Field(description="Arrival time if mentioned")
    duration: str = Field(description="Total travel duration")
    details: str = Field(description="Additional details like layovers, stations, or delays")

class TransportList(BaseModel):
    results: List[ParsedTransport]

@tool
def transport_search(origin: str, destination: str, date: str, travel_mode: str = "any", travel_class: str = "Economy") -> List[Dict[str, Any]]:
    """
    Search for transport options between origin and destination.
    Accepts travel_mode (flight, train, bus) and travel_class (e.g. AC 2 Tier, Business, Economy) to filter results.
    """
    mode_text = travel_mode if travel_mode and travel_mode.lower() != "any" else "train bus flight"
    class_text = f"{travel_class} class" if travel_class else ""
    
    print(f"🚂 Searching {mode_text} ({class_text}) transport from {origin} to {destination} for {date}...")
    
    query = f"Travel from {origin} to {destination} on {date} {mode_text} {class_text} prices departure arrival times schedule"
    
    try:
        with DDGS() as ddgs:
            search_results = list(ddgs.text(query, max_results=5))
            
        structured_llm = get_structured_llm(TransportList, temperature=0.2)
        
        prompt = get_transport_tool_prompt(
            mode_text=mode_text,
            class_text=class_text,
            origin=origin,
            destination=destination,
            raw_data=json.dumps(search_results),
        )
        
        parsed = structured_llm.invoke(prompt)
        
        # Convert pydantic models to dictionaries
        return [t.model_dump() for t in parsed.results]
        
    except Exception as e:
        return [{"error": f"Failed to fetch transport data: {str(e)}"}]
