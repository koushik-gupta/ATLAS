import json
from langgraph.graph import StateGraph, START, END

from src.state.trip_state import TripState

def validate_itinerary(state: TripState):
    """
    Reads the final_itinerary_json and performs mathematical checks.
    In Phase 3, if the budget is exceeded, it simply logs that dual-options 
    were generated instead of triggering a hard-fail interrupt.
    """
    print(" Validating itinerary constraints...")
    
    itinerary_json_str = state.get("final_itinerary_json", "{}")
    user_budget = state.get("budget", 0.0)
    
    validation_flags = state.get("validation_flags", {})
    
    try:
        itinerary_data = json.loads(itinerary_json_str)
        
        # In Phase 3, total_budget is stored at the root of the new schema
        calculated_budget = float(itinerary_data.get("total_budget", 0.0))
        num_options = len(itinerary_data.get("options", []))
        
        if calculated_budget <= user_budget:
            validation_flags["budget_ok"] = True
            print(f"[SUCCESS] Budget OK! Estimated ₹{calculated_budget:,.0f} is within your ₹{user_budget:,.0f} budget.")
        else:
            validation_flags["budget_ok"] = False
            over = calculated_budget - user_budget
            print(f"[WARNING]  Budget Alert: Estimated ₹{calculated_budget:,.0f} exceeds your ₹{user_budget:,.0f} budget by ₹{over:,.0f}.")
            print("   ↳ The budget breakdown will be shown to the user at the end of the itinerary.")
            
    except json.JSONDecodeError:
        print("❌ Failed to parse JSON for validation.")
        validation_flags["budget_ok"] = False
        
    return {"validation_flags": validation_flags}

# Build the Validation Subgraph
builder = StateGraph(TripState)

builder.add_node("validate_itinerary", validate_itinerary)

builder.add_edge(START, "validate_itinerary")
builder.add_edge("validate_itinerary", END)

# Compile the subgraph
validation_graph = builder.compile()
