from langchain_core.tools import tool
from ddgs import DDGS
from typing import Dict, Any, List
from rich import print

@tool
def weather_search(destination: str, dates: str) -> List[Dict[str, Any]]:
    """
    Search for the weather forecast or historical climate averages for a destination.
    Uses web search so it can gracefully handle trips scheduled months in the future.
    """
    print(f"🌤️ Checking weather for {destination} during {dates}...")
    
    # We query DuckDuckGo instead of a rigid Weather API. 
    # Why? Because if the trip is 6 months from now, a normal API will crash (forecasts only go 14 days out).
    # DuckDuckGo will intelligently return the "historical average temperatures" for that month instead!
    query = f"Weather forecast and average temperature for {destination} during {dates}"
    
    try:
        with DDGS() as ddgs:
            # Fetch top 3 snippets (AccuWeather, Weather.com summaries)
            search_results = list(ddgs.text(query, max_results=3))
            
        return [{"city": destination, "source": "web_search", "query": query, "raw_data": search_results}]
        
    except Exception as e:
        return [{"error": f"Failed to fetch weather data: {str(e)}"}]
