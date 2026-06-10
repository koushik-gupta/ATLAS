import json
from langchain_core.tools import tool
from ddgs import DDGS
from typing import Dict, Any, List
from src.llm_config import get_structured_llm
from pydantic import BaseModel, Field
from rich import print
from src.prompts import get_hotel_tool_prompt

class ParsedHotel(BaseModel):
    name: str = Field(description="Name of the hotel")
    price_per_night: str = Field(description="Estimated price per night in INR (e.g. '₹2000', '₹2000-5000')")
    rating: str = Field(description="Rating out of 10 (e.g. '8.5', '8.5/10')")
    address: str = Field(description="General location or address area in the city")

class HotelList(BaseModel):
    results: List[ParsedHotel]

@tool
def hotel_search(destination: str) -> List[Dict[str, Any]]:
    """
    Search for hotels in the destination city.
    Returns realistic hotel options, prices, and ratings.
    """
    print(f"🏨 Searching for hotels in {destination}...")
    
    query = f"Top 10 highly rated hotels to stay in {destination} price per night in INR location rating reviews"
    
    try:
        with DDGS() as ddgs:
            search_results = list(ddgs.text(query, max_results=5))
            
        structured_llm = get_structured_llm(HotelList, temperature=0.2)
        
        prompt = get_hotel_tool_prompt(destination, raw_data=json.dumps(search_results))
        
        parsed = structured_llm.invoke(prompt)
        
        return [h.model_dump() for h in parsed.results]
        
    except Exception as e:
        return [{"error": f"Failed to fetch hotels: {str(e)}"}]
