import os
import uuid
import json
import warnings
warnings.filterwarnings("ignore")
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.text import Text

console = Console()

# Load environment variables (GROQ_API_KEY, FOURSQUARE_API_KEY, LANGCHAIN_API_KEY)
load_dotenv()

from langsmith import traceable

from src.graphs.main_graph import master_graph
from src.schemas.trip_schema import TripRequirements
from src.llm_config import get_llm
from src.prompts import (
    get_layover_suggestion_prompt,
    get_feasibility_resolution_prompt,
    get_intent_classification_prompt,
    get_destination_details_prompt,
    get_more_options_prompt,
    get_initial_pitch_prompt,
    get_smart_destination_analyzer_prompt,
    get_extraction_system_rules,
    get_clarification_question_prompt,
    get_extraction_update_context,
    get_smart_pruning_prompt,
    get_weather_analysis_prompt,
    get_deep_research_fallback_prompt,
)

@traceable(name="1_smart_extraction", tags=["extraction"])
def smart_extraction(query: str = None, input_func=input) -> TripRequirements:
    """
    An interactive pre-trip chat loop. Uses structured output to extract 
    trip requirements from natural language. Only asks questions for missing fields.
    
    Fixed: No longer loops infinitely on optional/grouped fields. 
    - Only asks about truly required fields (origin, dates, profile+pacing).
    - Groups pacing+traveler_profile into a single combined question.
    - Optional fields (travel_mode, travel_class) are skipped after 1 try.
    - Hard cap of 5 total clarification rounds to prevent infinite loops.
    """
    from src.llm_config import get_llm, get_clarification_llm
    llm = get_llm()
    structured_llm = llm.with_structured_output(TripRequirements)
    
    if not query:
        print("\n Welcome to the AI Travel Planner! ")
        print("-" * 50)
        print("Tell me about your dream trip in one sentence!")
        print("(e.g., 'I want to go to Amritsar from Kolkata on Aug 10 with a ₹50000 budget for 4 people by train')")
        user_input = input_func("\nYou: ")
    else:
        user_input = query

    # Initial parsing
    print(" Thinking...")
    import datetime
    current_date = datetime.datetime.now().strftime("%A, %B %d, %Y")

    system_rules = get_extraction_system_rules(current_date)
    reqs: TripRequirements = structured_llm.invoke(system_rules + f"User Request: {user_input}")

    # No more hardcoded question map - questions are generated dynamically using get_clarification_question_prompt

    # Priority order of fields to ask — most critical first, fully optional at the end
    # trip_duration_days and travel_dates are ALWAYS required — never assume defaults!
    ALWAYS_REQUIRED   = ["origin_city", "trip_duration_days", "travel_dates"]  # must ALL be present before planning
    PROFILE_FIELDS    = ["traveler_profile", "pacing"]  # ask one at a time, separately
    OPTIONAL_FIELDS   = ["travel_mode", "travel_class", "budget_inr"]  # ask once, then skip
    optional_asked    = set()

    MAX_CLARIFICATION_ROUNDS = 8  # bumped up to allow duration + dates + profile
    rounds_done = 0

    while rounds_done < MAX_CLARIFICATION_ROUNDS:
        missing_all = set(k for k, v in reqs.model_dump().items() if v is None)

        if not missing_all:
            print("\n[SUCCESS] All information collected!")
            break

        # Build required fields for this iteration — all three are mandatory
        required_this_round = list(ALWAYS_REQUIRED)

        # Determine the ONE field to ask about — strict priority order
        current_target = None

        for f in required_this_round:
            if f in missing_all:
                current_target = f
                break

        if current_target is None:
            for f in PROFILE_FIELDS:          # traveler_profile, then pacing — separately
                if f in missing_all:
                    current_target = f
                    break

        if current_target is None:
            for f in OPTIONAL_FIELDS:
                if f in missing_all and f not in optional_asked:
                    current_target = f
                    optional_asked.add(f)
                    break

        if current_target is None:
            print("\n[SUCCESS] Proceeding with available information.")
            break

        # --- Generate dynamic conversational question ---
        from src.llm_config import get_clarification_llm
        from src.prompts import get_clarification_question_prompt
        from pydantic import BaseModel, Field

        class Clarification(BaseModel):
            question: str = Field(description="A short, friendly question asking for the missing field.")
            placeholder: str = Field(description="A short placeholder text (e.g. 'e.g., June 1-14')")

        try:
            clarify_llm = get_clarification_llm(temperature=0.7).with_structured_output(Clarification)
            prompt = get_clarification_question_prompt(
                current_date=current_date,
                known_info_json=reqs.model_dump_json(exclude_none=True),
                question_hint=current_target
            )
            clarification = clarify_llm.invoke(prompt)
            question = clarification.question
            placeholder_text = clarification.placeholder
        except Exception as e:
            # Safe fallback if LLM fails
            question = f"Could you clarify your {current_target.replace('_', ' ')}?"
            placeholder_text = "Type your answer..."

        # If placeholder is generated, we append it in parentheses so the frontend web_input parser extracts it.
        # See services.py web_input function which extracts (...) as placeholder.
        import inspect
        if "field_name" in inspect.signature(input_func).parameters:
            answer = input_func(f"\n🤖 {question} ({placeholder_text})\nYou: ", field_name=current_target).strip()
        else:
            answer = input_func(f"\n🤖 {question} ({placeholder_text})\nYou: ").strip()

        # If user presses Enter on an optional field, skip it
        if not answer and current_target in OPTIONAL_FIELDS:
            rounds_done += 1
            continue

        if not answer:
            rounds_done += 1
            continue

        # Update reqs — pass the field name explicitly so the LLM knows exactly what to map
        context = get_extraction_update_context(
            system_rules=system_rules,
            previous_context_json=reqs.model_dump_json(),
            question=question,
            answer=answer,
            field_name=current_target,
        )
        try:
            new_reqs = structured_llm.invoke(context)
            for key, value in new_reqs.model_dump(exclude_none=True).items():
                setattr(reqs, key, value)
        except Exception:
            print("[WARNING] Could not parse your answer, continuing...")
            
        # Anti-infinite-loop fallback: If the LLM failed to extract the EXACT field we asked for,
        # force it into the state using the raw answer to ensure we progress.
        if getattr(reqs, current_target) is None and answer:
            if current_target == "destination_cities":
                setattr(reqs, current_target, [answer.title()[:50]])
            else:
                setattr(reqs, current_target, answer.title()[:50])

        rounds_done += 1

    # Apply smart defaults for any still-missing non-critical fields
    if reqs.traveler_profile is None:
        reqs.traveler_profile = "Solo traveler"

    print("\n[SUCCESS] All set! Let's plan your trip.")
    return reqs

def ask_ready_to_proceed() -> bool:
    print("\n" + "="*50)
    while True:
        resp = input("Are you ready to finalize this itinerary and proceed with generation? (yes to start, no to rethink/exit): ").strip()
        if not resp:
            continue
            
        from src.llm_config import get_clarification_llm
        from pydantic import BaseModel, Field
        
        class IntentResponse(BaseModel):
            intent: str = Field(description="'proceed', 'rethink', or 'exit'")
            
        try:
            llm = get_clarification_llm(temperature=0.0).with_structured_output(IntentResponse)
            res = llm.invoke(f"The user was asked 'Are you ready to finalize this itinerary and proceed?'. User said: '{resp}'. Classify intent as 'proceed', 'rethink', or 'exit'.")
            intent = res.intent.lower()
        except Exception:
            intent = "proceed" if "yes" in resp.lower() or "y" in resp.lower() else "rethink"
            
        if intent == "proceed":
            return True
        elif intent == "exit":
            print(" Exiting planner. See you next time!")
            import sys
            sys.exit(0)
        else: # rethink
            print(" Let's rethink your trip from the beginning!")
            return False

@traceable(name="2_deep_research_destinations", tags=["research"])
def deep_research_destinations(cities: list, duration_days: str, origin: str = "") -> list:
    """V5: Smart destination curation with cluster detection, landmark injection, and regional expansion.
    Returns a list of dicts: [{"city": str, "pitch": str}, ...] for the pitch/selection step."""
    if not cities:
        return []
        
    try:
        duration_int = int(''.join(filter(str.isdigit, str(duration_days))))
    except ValueError:
        duration_int = 1

    # max_pitches: start from the user's city count, then allow up to 2 extras for long trips.
    # Cap at 8 to avoid padding with unrelated cities.
    base = len(cities)
    max_pitches = 10
        
    print(f"\n Deep Researching sub-destinations for a {duration_days}-day itinerary (Curating up to {max_pitches} destination ideas)...")
    from src.llm_config import get_heavy_llm
    from pydantic import BaseModel, Field
    from ddgs import DDGS
    import json
    
    class SmartDestination(BaseModel):
        city: str = Field(description="The destination name. Can be a city, a circuit (e.g. 'Mathura-Vrindavan Circuit'), or a standalone world-famous landmark entry if warranted.")
        pitch: str = Field(description="One compelling sentence that MUST mention the most famous landmark or experience at this destination.")
        landmark_anchors: list[str] = Field(default_factory=list, description="List of 1-2 world-famous landmarks that anchor this destination's tourist appeal.")

    class SmartExpansion(BaseModel):
        destinations: list[SmartDestination] = Field(
            description="A robust, curated list of up to 10 distinct, amazing destinations. Include the user's requested cities, and naturally fill remaining slots ONLY with REAL, LOGICALLY CONNECTED nearby gems. Do NOT force the list to 10 if there aren't enough real nearby places."
        )
        
    llm = get_heavy_llm(temperature=0.4)
    structured_llm = llm.with_structured_output(SmartExpansion)
    
    # Step 1: Fetch research data about user's cities
    all_search_data = []
    for city in cities[:3]:  # Cap at 3 searches to stay fast
        try:
            query = f"best tourist towns hill stations and places to visit near {city}"
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=4))
            all_search_data.append(f"--- {city} ---\n" + json.dumps(results))
        except Exception:
            all_search_data.append(f"--- {city} --- (no search data)")
    
    search_data_str = "\n".join(all_search_data)
    
    # Step 2: Smart destination analysis with clustering + landmark injection
    try:
        prompt = get_smart_destination_analyzer_prompt(
            raw_cities=cities,
            origin=origin,
            duration=duration_days,
            search_data=search_data_str,
        )
        result = structured_llm.invoke(prompt)
        
        if result and result.destinations:
            pitches = []
            seen = set()
            for d in result.destinations:
                if d.city not in seen:
                    seen.add(d.city)
                    pitches.append({"city": d.city, "pitch": d.pitch})
            
            # Geospatial Sorting: Order by proximity to the primary requested city
            if len(cities) > 0 and len(pitches) > 1:
                try:
                    from src.utils.helpers import get_city_coordinates, haversine
                    
                    anchor_coords = []
                    for c in cities:
                        try:
                            lat, lon = get_city_coordinates(c)
                            if lat != 0.0 and lon != 0.0:
                                anchor_coords.append((lat, lon, c))
                        except Exception as anchor_err:
                            print(f"[WARNING] Failed to resolve anchor city {c}: {anchor_err}")
                    
                    if anchor_coords:
                            for p in pitches:
                                city_name = str(p.get("city", "")).strip()
                                if not city_name:
                                    p["_distance"] = 999999
                                    continue
                                    
                                try:
                                    plat, plon = get_city_coordinates(city_name)
                                    if plat != 0.0 and plon != 0.0:
                                        min_dist = min([haversine(alat, alon, plat, plon, acity, city_name) for alat, alon, acity in anchor_coords])
                                        p["_distance"] = min_dist
                                    else:
                                        p["_distance"] = 999999
                                except Exception as city_err:
                                    print(f"[WARNING] Failed to sort {city_name}: {city_err}")
                                    p["_distance"] = 999999
                            pitches.sort(key=lambda x: x.get("_distance", 999999))
                except Exception as e:
                    print(f"[WARNING] Geospatial sorting failed: {e}")
                    
            return pitches[:max_pitches]
    except Exception as e:
        print(f"[WARNING] Smart analysis failed ({e}), falling back to basic expansion...")
    
    # Fallback: basic research loop
    all_pitches = []
    seen_cities = set()
    try:
        for city in cities:
            query = f"top places to visit near {city} overnight trip best tourist destinations famous landmarks"
            with DDGS() as ddgs:
                search_results = list(ddgs.text(query, max_results=5))
                
            class CityPitch(BaseModel):
                city: str = Field(description="Exact name of the specific town, city, or district.")
                pitch: str = Field(description="One compelling sentence about why a tourist should visit. Must mention a specific landmark or experience.")
            class RegionExpansion(BaseModel):
                destinations: list[CityPitch] = Field(description="A curated list of destinations based on the user's request. Do not add extra cities just to meet a minimum count.")
            
            fallback_llm = get_heavy_llm(temperature=0.1).with_structured_output(RegionExpansion)
            fallback_prompt = get_deep_research_fallback_prompt(
                city=city,
                duration_days=duration_days,
                search_results=json.dumps(search_results),
            )
            result = fallback_llm.invoke(fallback_prompt)
            if result and result.destinations:
                for cp in result.destinations:
                    if cp.city not in seen_cities:
                        seen_cities.add(cp.city)
                        all_pitches.append({"city": cp.city, "pitch": cp.pitch})
            else:
                if city not in seen_cities:
                    seen_cities.add(city)
                    all_pitches.append({"city": city, "pitch": f"The main destination for your {duration_days}-day trip."})
                    
        # Geospatial Sorting: Order by proximity to the primary requested city
        if len(cities) > 0 and len(all_pitches) > 1:
            try:
                from src.utils.helpers import get_city_coordinates, haversine
                
                anchor_coords = []
                for c in cities:
                    try:
                        lat, lon = get_city_coordinates(c)
                        if lat != 0.0 and lon != 0.0:
                            anchor_coords.append((lat, lon, c))
                    except Exception as anchor_err:
                        print(f"[WARNING] Failed to resolve anchor city {c} in fallback: {anchor_err}")
                
                if anchor_coords:
                        for p in all_pitches:
                            city_name = str(p.get("city", "")).strip()
                            if not city_name:
                                p["_distance"] = 999999
                                continue
                                
                            try:
                                plat, plon = get_city_coordinates(city_name)
                                if plat != 0.0 and plon != 0.0:
                                    min_dist = min([haversine(alat, alon, plat, plon, acity, city_name) for alat, alon, acity in anchor_coords])
                                    p["_distance"] = min_dist
                                else:
                                    p["_distance"] = 999999
                            except Exception as city_err:
                                print(f"[WARNING] Failed to sort {city_name} in fallback: {city_err}")
                                p["_distance"] = 999999
                        all_pitches.sort(key=lambda x: x.get("_distance", 999999))
            except Exception as e:
                print(f"[WARNING] Geospatial sorting failed in fallback: {e}")
                
        return all_pitches[:max_pitches]
    except Exception as e:
        print(f"[WARNING] Deep Research fallback due to error: {e}")
        return [{"city": c, "pitch": "Curated destination for your trip."} for c in cities]



@traceable(name="3_present_destination_pitch", tags=["hitl"])
def present_destination_pitch(city_pitches: list, duration_days: str, origin: str = "", already_selected: list = None) -> list:
    """
    Displays the AI-curated city pitches in a rich terminal table and asks the user to
    select their preferred destinations. Also allows free-text add-ons for cities not in the list.
    
    Args:
        city_pitches: List of dicts [{"city": str, "pitch": str}, ...]
        duration_days: The trip duration string for display context.
        origin: The user's origin city, used for geographic context when fetching more options.
    
    Returns:
        Final confirmed list of destination city name strings.
    """
    from rich.table import Table
    from rich.panel import Panel
    
    if not city_pitches:
        return []
    
    console.print(f"\n")
    console.print(Panel(
        f"[bold white]️  The AI curated [cyan]{len(city_pitches)}[/cyan] incredible destinations for your [cyan]{duration_days}-day[/cyan] trip![/bold white]\n"
        f"[dim]Pick your favorites below. You can also add your own cities afterward.[/dim]",
        border_style="magenta",
        expand=False
    ))
    console.print()
    
    def render_pitches_table(pitches_to_show, start_idx=1):
        table = Table(
            show_header=True,
            header_style="bold cyan",
            border_style="blue",
            show_lines=True,
            expand=False
        )
        table.add_column("#", style="bold white", width=4, justify="center")
        table.add_column("Destination", style="bold yellow", width=20)
        table.add_column("Why Visit?", style="white", min_width=40)
        
        for i, cp in enumerate(pitches_to_show, start_idx):
            table.add_row(str(i), cp["city"], cp["pitch"])
        
        console.print(table)
        console.print()

    render_pitches_table(city_pitches, 1)
    
    # Selection loop — re-prompts on invalid input
    selected_cities = []
    last_shown_pitches = city_pitches  # Tracks which pitches were last displayed to the user
    while True:
        if not selected_cities:
            console.print("[bold]Select destinations by number[/bold] (e.g. [cyan]1,3[/cyan]) or type [cyan]all[/cyan] to visit everywhere:")
        else:
            console.print("[bold]Select more destinations by number, or just press Enter to proceed with what you have:[/bold]")
            
        raw = input("You: ").strip().lower()
        
        # If they press Enter and already have cities saved, proceed.
        if raw == "" and selected_cities:
            break
            
        if raw == "all":
            for cp in last_shown_pitches:
                if cp["city"] not in selected_cities:
                    selected_cities.append(cp["city"])
            break

            
        import re
        
        # --- NEW: Smart Intent Classifier ---
        NAV_COMMANDS = {"show more", "more options", "go back", "previous", "all", "done", "show list"}
        is_nav = any(cmd in raw for cmd in NAV_COMMANDS)
        
        user_intent = "SELECTION_ONLY"
        if is_nav:
            if "show more" in raw or "more options" in raw:
                user_intent = "REQUEST_MORE"
            elif "previous" in raw or "show list" in raw:
                user_intent = "SHOW_PREVIOUS"
            elif raw == "all":
                user_intent = "SELECTION_ONLY" # will be handled below
        elif re.fullmatch(r'[\d\s,]+', raw) or raw == "":
            user_intent = "SELECTION_ONLY"
        else:
            from src.llm_config import get_llm
            from pydantic import BaseModel, Field
            from typing import Literal
            
            class UserIntent(BaseModel):
                intent: Literal["SELECTION_ONLY", "QUESTION", "REQUEST_MORE", "SHOW_PREVIOUS", "OTHER"] = Field(
                    description="Classify the user's intent: "
                                "SELECTION_ONLY: User is just picking destinations or typing random unrelated words. "
                                "QUESTION: User is asking for details/clarification about specific destinations. "
                                "REQUEST_MORE: User wants the AI to suggest new, additional destinations. "
                                "SHOW_PREVIOUS: User explicitly asks to see the previous list of destinations again. "
                )
                
            try:
                classifier = get_llm(temperature=0).with_structured_output(UserIntent)
                res = classifier.invoke(get_intent_classification_prompt(raw, selected_cities))
                user_intent = res.intent
            except Exception:
                user_intent = "SELECTION_ONLY"
                
        if user_intent == "REQUEST_MORE":
            # Determine which pitches were last shown (original list or last 'show more' batch)
            pitches_to_select_from = last_shown_pitches

            # Handle "all" — select everything from the last visible table
            if re.search(r'\ball\b', raw, re.IGNORECASE):
                for cp in pitches_to_select_from:
                    if cp["city"] not in selected_cities:
                        selected_cities.append(cp["city"])
            else:
                # Save any numbers they typed alongside the request (e.g. '1,3 and show more')
                indices = [int(x) for x in re.findall(r'\d+', raw)]
                valid_indices = [i for i in indices if 1 <= i <= len(city_pitches)]
                for i in valid_indices:
                    city = city_pitches[i - 1]["city"]
                    if city not in selected_cities:
                        selected_cities.append(city)
                    
            console.print("\n [dim]Generating more destinations for you...[/dim]")
            from src.llm_config import get_heavy_llm
            from pydantic import BaseModel, Field
            class CityPitch(BaseModel):
                city: str = Field(description="Exact name of the specific town, city, or district.")
                pitch: str = Field(description="One compelling sentence about why a tourist should visit.")
            class RegionExpansion(BaseModel):
                destinations: list[CityPitch] = Field(description="3 NEW destinations that complement the user's existing selections.")
                
            try:
                llm = get_heavy_llm(temperature=0.3)
                structured_llm = llm.with_structured_output(RegionExpansion)
                existing = [cp['city'] for cp in city_pitches]
                prompt = get_more_options_prompt(existing, duration_days, origin=origin)
                
                result = structured_llm.invoke(prompt)
                new_pitches = []
                if result and result.destinations:
                    for cp in result.destinations:
                        new_pitch = {"city": cp.city, "pitch": cp.pitch}
                        city_pitches.append(new_pitch)
                        new_pitches.append(new_pitch)
                
                # Track these as the last visible pitches so 'all' works correctly next round
                last_shown_pitches = new_pitches
                        
                # Render ONLY the new pitches with their correct global index numbers
                console.print("\n[bold green]✨ Here are some completely new options for you![/bold green]")
                console.print("[dim]Type 'show previous' if you want to see the combined full list again.[/dim]")
                
                start_idx = len(city_pitches) - len(new_pitches) + 1
                render_pitches_table(new_pitches, start_idx)
                
                if selected_cities:
                    console.print(f"[green][SUCCESS] Already saved: {', '.join(selected_cities)}[/green]")
                
            except Exception as e:
                console.print(f"[red][WARNING] Couldn't fetch more options right now. Exception: {e}[/red]\n")
                
            continue

        if user_intent == "SHOW_PREVIOUS":
            console.print("\n[bold green]Here is the full list of destinations so far![/bold green]")
            render_pitches_table(city_pitches, 1)
            continue

        if user_intent == "QUESTION":
            # Save any numbers they typed alongside the question (e.g. '6,7 and tell me more about purulia')
            import re
            indices = [int(x) for x in re.findall(r'\d+', raw)]
            valid_indices = [i for i in indices if 1 <= i <= len(city_pitches)]
            added_this_round = []
            for i in valid_indices:
                city = city_pitches[i - 1]["city"]
                if city not in selected_cities:
                    selected_cities.append(city)
                    added_this_round.append(city)
            
            if added_this_round:
                console.print(f"[green][SUCCESS] Added: {', '.join(added_this_round)}[/green]")

            console.print("\n [dim]Fetching more details for you...[/dim]")
            from src.llm_config import get_llm
            try:
                chat_llm = get_llm()
                q_prompt = get_destination_details_prompt(raw)
                answer = chat_llm.invoke(q_prompt).content
                console.print(f"[green] {answer}[/green]\n")
            except Exception as e:
                console.print("[red][WARNING] Couldn't fetch an answer right now.[/red]\n")
            continue
        
        try:
            # Extract all digits from the string
            indices = [int(x) for x in re.findall(r'\d+', raw)]
            if not indices:
                raise ValueError("No valid numbers entered.")
            
            valid_indices = [i for i in indices if 1 <= i <= len(city_pitches)]
            invalid_indices = [i for i in indices if i not in valid_indices]
            
            if not valid_indices:
                raise ValueError("No valid numbers entered.")
                
            if invalid_indices:
                console.print(f"[yellow][WARNING] Ignoring invalid numbers: {invalid_indices}[/yellow]")
                
            # Append valid selections to persistent memory
            for i in valid_indices:
                city = city_pitches[i - 1]["city"]
                if city not in selected_cities:
                    selected_cities.append(city)
            
            # If they typed extra text (but not QA or 'more options'), let them know about the free-text feature
            if re.search(r'[a-z]', raw.replace('and', '').replace('all', '')):
                console.print("[dim]Note: You can add custom cities in the very next step![/dim]")
                
            break
        except ValueError:
            console.print("[red]❌ Invalid input. Please enter numbers (e.g. 1,3), type 'all', or ask for more options.[/red]")
    
    # Free-text add-on: let user include cities not in the AI list
    console.print("\n[dim]Want to add any city NOT in the list above? (Press Enter to skip)[/dim]")
    extra_input = input("You: ").strip()
    if extra_input:
        extra_cities = [c.strip() for c in extra_input.replace(",", "\n").split("\n") if c.strip()]
        for ec in extra_cities:
            if ec not in selected_cities:
                selected_cities.append(ec)
        console.print(f"[green][SUCCESS] Added custom cities: {', '.join(extra_cities)}[/green]")
    
    # ── Phase 10: Feasibility Checker ────────────────────────────────────────
    while True:
        try:
            duration_int = int(''.join(filter(str.isdigit, str(duration_days))))
        except ValueError:
            duration_int = 1

        if len(selected_cities) > max(1, duration_int - 1):
            console.print(f"\n[bold red][WARNING]  WARNING: Impossible Itinerary Detected![/bold red]")
            console.print(f"[red]You have selected {len(selected_cities)} destinations for a {duration_int}-day trip.[/red]")
            console.print("[red]Geographically and mathematically, this leaves no time for actual sightseeing once you account for transit times.[/red]")
            console.print("\n[bold]Please adjust your list.[/bold] (e.g. 'remove Darjeeling', 'swap Siliguri with something closer to Kolkata')")
            
            resolution = input("You: ").strip()
            
            # Simple keyword removals or LLM resolution
            if resolution:
                console.print("\n [dim]Adjusting your destinations...[/dim]")
                from src.llm_config import get_llm
                from pydantic import BaseModel, Field
                class FeasibilityResolution(BaseModel):
                    new_selected_cities: list[str] = Field(description="The updated list of cities after the user's modifications.")
                    message: str = Field(description="A brief message to the user acknowledging the change.")
                
                try:
                    resolve_llm = get_llm(temperature=0).with_structured_output(FeasibilityResolution)
                    prompt = get_feasibility_resolution_prompt(selected_cities, resolution)
                    res = resolve_llm.invoke(prompt)
                    selected_cities = res.new_selected_cities
                    console.print(f"[green] {res.message}[/green]\n")
                except Exception as e:
                    console.print(f"[red][WARNING] Failed to adjust automatically. Please type exactly what you want to remove.[/red]")
            else:
                console.print("[red]❌ You must reduce the number of cities to proceed.[/red]")
        else:
            break
            
    # Final confirmation display
    console.print()
    
    display_list = selected_cities
    if already_selected:
        # Create a deduped combined list preserving order
        display_list = list(already_selected)
        for c in selected_cities:
            if c not in display_list:
                display_list.append(c)
                
    console.print(Panel(
        f"[bold green][SUCCESS] Your confirmed destinations: [cyan]{', '.join(display_list)}[/cyan][/bold green]\n"
        f"[dim]The AI will now build your {duration_days}-day itinerary across these {len(display_list)} city/cities.[/dim]",
        border_style="green",
        expand=False
    ))
    console.print()
    
    return selected_cities

def get_ideal_trip_duration(cities: list[str], pacing: str, origin: str, skip_web: bool = False) -> tuple[int, dict[str, str]]:
    """Uses a lightweight LLM AND live web search to dynamically classify Base Hubs vs Day-Trips and calculate ideal duration."""
    from src.llm_config import get_compound_mini_llm
    from pydantic import BaseModel, Field
    from ddgs import DDGS
    
    # Bug 10 Fix: Fetch live online data for actual recommended duration
    web_context = ""
    if not skip_web:
        query = f"recommended number of days to visit {', '.join(cities)} tour itinerary"
        try:
            with DDGS(timeout=10) as ddgs:
                results = list(ddgs.text(query, max_results=3))
            if results:
                web_context = "\n".join([f"- {r.get('body', '')}" for r in results])
        except Exception as e:
            print(f"[WARNING] Web search for duration failed: {e}")

    class CityRole(BaseModel):
        city: str = Field(description="The name of the destination city")
        role: str = Field(description="'Base Hub' (requires overnight stays) or 'Day-Trip' (visited from a nearby hub).")
        days_needed: int = Field(description="Days needed to explore this specific location")

    class IdealDuration(BaseModel):
        roles: list[CityRole] = Field(description="Classification of each selected city")
        ideal_days: int = Field(description="Total days required to visit all cities. Sum of days needed + transit time.")
        is_broad_region: bool = Field(default=False, description="True if ANY of the input cities is actually a broad state, country, or massive region (like 'Himachal Pradesh' or 'Kashmir' or 'Goa') rather than a specific city/town.")
        reasoning: str = Field(description="Explanation of routing structure, hubs vs day-trips, and transit based on web data.")
        
    try:
        llm = get_compound_mini_llm(temperature=0).with_structured_output(IdealDuration)
        from src.prompts import get_ideal_trip_duration_prompt
        prompt = get_ideal_trip_duration_prompt(origin, cities, pacing, web_context)
        res = llm.invoke(prompt)
        
        classifications = {r.city: r.role for r in res.roles}
        # Fallback ensuring all input cities are classified
        for c in cities:
            if c not in classifications: classifications[c] = "Base Hub"
            
        return res.ideal_days, classifications, res.is_broad_region
    except Exception as e:
        print(f"[WARNING] Dynamic duration calculation failed: {e}. Falling back to heuristic.")
        return max(1, int(len(cities) * 2.5 + 0.99)), {c: "Base Hub" for c in cities}, False

@traceable(name="travel_planner_full_run", tags=["root"])
def main():
    # 1. Smart Extraction
    reqs = smart_extraction()
    
    # 1.5 Deep Research + Human-in-the-Loop Destination Selection (V4)
    # If extraction found no destination, ask the user directly before doing anything
    if not reqs.destination_cities:
        print(" I couldn't detect a specific destination from your message.")
        raw_dest = input("❓ Where do you want to go? (e.g. 'Kashmir', 'North East India', 'Rajasthan'): ").strip()
        if raw_dest:
            reqs.destination_cities = [raw_dest]
        else:
            print("[WARNING] No destination provided. Exiting.")
            return

    if reqs.destination_cities:
        origin = reqs.origin_city or ""
        duration_str = reqs.trip_duration_days or "1"
        try:
            duration_int = int(''.join(filter(str.isdigit, str(duration_str))))
        except ValueError:
            duration_int = 1
            
        # Step 1: Always curate destinations first so user can choose
        print(f" Curating best destinations for {', '.join(reqs.destination_cities)}...")
        city_pitches = deep_research_destinations(
            reqs.destination_cities,
            str(duration_int),
            origin=origin,
        )
        reqs.destination_cities = present_destination_pitch(
            city_pitches,
            str(duration_int),
            origin=origin,
        )

        # 1.6 Geographic Route Optimization First
        if reqs.destination_cities:
            from src.utils.helpers import optimize_route_order
            reqs.destination_cities = optimize_route_order(origin, reqs.destination_cities)

        original_duration_int = duration_int
        while True:
            # Step 2: Calculate time based on their actual selection dynamically
            print(f" Dynamically calculating ideal duration and classifying base hubs vs day-trips...")
            estimated_days, city_roles = get_ideal_trip_duration(
                reqs.destination_cities, 
                reqs.pacing or "Moderate", 
                origin
            )
            remaining_days = original_duration_int - estimated_days
        
            if remaining_days >= 3:
                # We have plenty of days based on online actual times! Ask user if they want to expand or finish early
                print(f"\n Your {duration_int}-day trip has plenty of room. According to live data, the selected cities only need ~{estimated_days} days.")
                ans = input("Would you like to finish the tour early, or suggest MORE nearby destinations? (type 'expand' to add cities, or 'finish' to conclude early): ").strip().lower()
            
                expand_intents = ['more', 'show more', 'expand', 'suggest more', 'add more', 'more destinations', 'continue', 'yes', 'y', 'e', '1']
                finish_intents = ['finish', 'enough', 'conclude', 'stop', 'proceed', 'no', 'n', 'continue with current']
            
                is_expand = any(cmd in ans for cmd in expand_intents) and not any(cmd in ans for cmd in finish_intents)
                if is_expand or ans in expand_intents:
                    print(f" Deep Researching additional regional expansions...")
                
                    from src.llm_config import get_heavy_llm
                    from pydantic import BaseModel, Field
                    class CityPitch(BaseModel):
                        city: str = Field(description="Exact name of the specific town, city, or district.")
                        pitch: str = Field(description="One compelling sentence about why a tourist should visit.")
                    class RegionExpansion(BaseModel):
                        destinations: list[CityPitch] = Field(description="NEW destinations that complement the user's existing selections.")
                
                    try:
                        llm = get_heavy_llm(temperature=0.3)
                        structured_llm = llm.with_structured_output(RegionExpansion)
                        prompt = get_more_options_prompt(reqs.destination_cities, str(duration_int), origin=origin)
                        result = structured_llm.invoke(prompt)
                    
                        more_pitches = []
                        if result and result.destinations:
                            for cp in result.destinations:
                                more_pitches.append({"city": cp.city, "pitch": cp.pitch})
                    except Exception as e:
                        print(f"[WARNING] Expansion failed: {e}")
                        more_pitches = []
                
                    if more_pitches:
                        new_selections = present_destination_pitch(
                            more_pitches,
                            str(duration_int),
                            origin=origin,
                            already_selected=reqs.destination_cities
                        )
                        for city in new_selections:
                            if city not in reqs.destination_cities:
                                reqs.destination_cities.append(city)
                            
                        # Re-optimize and re-classify after adding new cities!
                        reqs.destination_cities = optimize_route_order(origin, reqs.destination_cities)
                        print(f" Re-calculating ideal duration and hubs...")
                        estimated_days, city_roles = get_ideal_trip_duration(
                            reqs.destination_cities, 
                            reqs.pacing or "Moderate", 
                            origin
                        )
                        # Bug 3 Fix: Update duration after expansion
                        # Use continue to loop back and recalculate.
                        continue
                else:
                    print("[SUCCESS] We will conclude the tour early without adding filler cities.")
                    duration_int = estimated_days
                    reqs.trip_duration_days = str(duration_int)
                    print(f"[SUCCESS] Trip duration updated to {duration_int} days to match your selections.")
            elif remaining_days <= 0:
                # Too many cities! Run smart pruning using compound-mini
                original_curated_cities = list(reqs.destination_cities)
                while True:
                    print(f"[WARNING] Too many cities ({len(reqs.destination_cities)}) selected for a {duration_int}-day trip. Activating Smart Pruning...")
                    from src.llm_config import get_compound_mini_llm
                    from pydantic import BaseModel, Field
                
                    class PrunedCities(BaseModel):
                        pruned_list: list[str] = Field(description="The pruned list of cities, retaining only the most geographically logical ones that fit the duration.")
                        removed_cities: list[str] = Field(description="The cities that were removed from the original list.")
                        estimated_minimum_days: int = Field(description="The estimated minimum number of days required to comfortably visit the pruned_list.")
                        reasoning: str = Field(description="Clear explanation of why certain cities were kept and why others were pruned based on geography and pacing.")
                    
                    try:
                        from src.llm_config import get_structured_llm
                        pruner = get_structured_llm(PrunedCities, temperature=0)
                        prompt = get_smart_pruning_prompt(
                            cities=reqs.destination_cities,
                            origin=reqs.origin_city,
                            duration_int=duration_int,
                            pacing=reqs.pacing or "Moderate",
                            city_roles=city_roles
                        )
                        res = pruner.invoke(prompt)
                        
                        # --- DETERMINISTIC PYTHON SAFETY LAYER ---
                        llm_pruned_list = res.pruned_list
                        # Check how many days the LLM's list ACTUALLY takes using our live math
                        actual_days, _ = get_ideal_trip_duration(llm_pruned_list, reqs.pacing or "Moderate", origin)
                        
                        from src.prompts import get_smart_restoration_prompt, get_smart_reduction_prompt
                        
                        class Correction(BaseModel):
                            updated_list: list[str] = Field(description="The updated destination list after marginal-value correction.")
                            
                        correction_attempts = 0
                        max_attempts = 2
                        
                        # Allow small flexibility window
                        lower_bound = max(duration_int - 2, 1)
                        upper_bound = duration_int
                        
                        while (actual_days < lower_bound or actual_days > upper_bound) and correction_attempts < max_attempts:
                            correction_attempts += 1
                            
                            # ---------------- OVER-PRUNED ----------------
                            if actual_days < lower_bound and res.removed_cities:
                                console.print(
                                    f"[dim] Python Validation: "
                                    f"Trip feels underfilled "
                                    f"({actual_days}d vs target {duration_int}d). "
                                    f"Requesting smart restoration "
                                    f"(Attempt {correction_attempts}/{max_attempts})...[/dim]"
                                )
                                prompt = get_smart_restoration_prompt(
                                    pruned_list=llm_pruned_list,
                                    removed_cities=res.removed_cities,
                                    target_days=duration_int,
                                    current_days=actual_days,
                                    pacing=reqs.pacing or "Moderate"
                                )
                                
                            # ---------------- UNDER-PRUNED ----------------
                            elif actual_days > upper_bound:
                                console.print(
                                    f"[dim] Python Validation: "
                                    f"Trip exceeds duration "
                                    f"({actual_days}d vs target {duration_int}d). "
                                    f"Requesting targeted reduction "
                                    f"(Attempt {correction_attempts}/{max_attempts})...[/dim]"
                                )
                                prompt = get_smart_reduction_prompt(
                                    pruned_list=llm_pruned_list,
                                    target_days=duration_int,
                                    current_days=actual_days,
                                    pacing=reqs.pacing or "Moderate"
                                )
                            else:
                                break
                                
                            try:
                                correction_llm = get_structured_llm(Correction, temperature=0.1)
                                res_correction = correction_llm.invoke(prompt)
                                
                                # Safety fallback
                                if not res_correction.updated_list:
                                    console.print("[yellow][WARNING] Correction agent returned empty list. Keeping previous route.[/yellow]")
                                    break
                                    
                                llm_pruned_list = res_correction.updated_list
                                
                                # Recalculate real-world duration
                                actual_days, _ = get_ideal_trip_duration(llm_pruned_list, reqs.pacing or "Moderate", origin)
                                
                                console.print(f"[dim] Revalidated duration: {actual_days} days[/dim]")
                                
                            except Exception as e:
                                console.print(f"[yellow][WARNING] Smart correction failed: {e}[/yellow]")
                                break
                                
                        res.pruned_list = llm_pruned_list
                    
                        console.print(f"\n[bold yellow]✂️ SMART CITY PRUNING RECOMMENDATION:[/bold yellow]")
                        console.print(f"[yellow]{res.reasoning}[/yellow]")
                        console.print(f"Original list: {reqs.destination_cities}")
                        console.print(f"Suggested pruned list: [green]{res.pruned_list}[/green]")
                        console.print(f"\nWould you like to accept this pruned destination list? (yes/no)")
                        ans = input("You: ").strip().lower()
                        if ans in ['y', 'yes', 'sure', 'ok', 'okay', '1']:
                            reqs.destination_cities = res.pruned_list
                            console.print(f"[green][SUCCESS] Destinations updated to pruned list.[/green]\n")
                            # Re-optimize and re-classify after pruning
                            reqs.destination_cities = optimize_route_order(origin, reqs.destination_cities)
                            estimated_days, city_roles = get_ideal_trip_duration(
                                reqs.destination_cities, 
                                reqs.pacing or "Moderate", 
                                origin
                            )
                            # Bug 3 Fix: Update duration after pruning
                            duration_int = estimated_days
                            reqs.trip_duration_days = str(duration_int)
                            break
                        else:
                            console.print("\n[bold cyan]Here are your current destinations:[/bold cyan]")
                            for idx, city in enumerate(reqs.destination_cities, 1):
                                console.print(f"  [{idx}] {city}")
                            console.print("\nWhich destinations would you like to keep? (Select by number '1,3', type 'all', type a new city, or type 'more' for suggestions)")
                            user_keep = input("You: ").strip()
                        
                            if user_keep:
                                if user_keep.lower() == 'all':
                                    console.print("[yellow][WARNING] Keeping your original list. (Expect a very fast-paced trip!)[/yellow]\n")
                                    break
                                
                                show_more_cmds = ['and show more options', 'and show more', 'show more options', 'show more', 'more']
                                show_more_flag = False
                                for cmd in show_more_cmds:
                                    if cmd in user_keep.lower():
                                        show_more_flag = True
                                        import re
                                        user_keep = re.sub(r'(?i)' + re.escape(cmd), '', user_keep).strip(' ,')
                                        break
                            
                                kept_cities = []
                                if user_keep:
                                    parts = [p.strip() for p in user_keep.split(',')]
                                    from src.utils.helpers import get_city_coordinates
                                
                                    for p in parts:
                                        if not p: continue
                                        if p.isdigit():
                                            i = int(p) - 1
                                            if 0 <= i < len(reqs.destination_cities):
                                                kept_cities.append(reqs.destination_cities[i])
                                        else:
                                            # It's a newly typed city! Authenticate geographically.
                                            if get_city_coordinates(p) != (0.0, 0.0):
                                                kept_cities.append(p.title())
                                                console.print(f"[green]➕ Added new authenticated city: {p.title()}[/green]")
                                            else:
                                                console.print(f"[red][WARNING] '{p}' could not be geographically authenticated. Skipping.[/red]")
                                            
                                if kept_cities:
                                    reqs.destination_cities = kept_cities
                                
                                if show_more_flag:
                                    console.print(f" [dim]Deep Researching alternative regional destinations...[/dim]")
                                    from src.llm_config import get_heavy_llm
                                    from pydantic import BaseModel, Field
                                    class CityPitch(BaseModel):
                                        city: str = Field(description="Exact name of the specific town, city, or district.")
                                        pitch: str = Field(description="One compelling sentence about why a tourist should visit.")
                                    class RegionExpansion(BaseModel):
                                        destinations: list[CityPitch] = Field(description="NEW alternative destinations that complement the user's existing selections.")
                                
                                    try:
                                        llm = get_heavy_llm(temperature=0.3)
                                        structured_llm = llm.with_structured_output(RegionExpansion)
                                        prompt = get_more_options_prompt(reqs.destination_cities, str(duration_int), origin=origin)
                                        result = structured_llm.invoke(prompt)
                                    
                                        if result and result.destinations:
                                            console.print("\n[bold green]✨ Here are some alternative destinations you could swap in:[/bold green]")
                                            for cp in result.destinations:
                                                console.print(f"   [bold]{cp.city}[/bold]: {cp.pitch}")
                                            console.print("[dim](Just type 'all' and add the names of any new ones you want to include in the next prompt!)[/dim]")
                                    except Exception as e:
                                        console.print(f"[red][WARNING] Couldn't fetch more options right now. ({e})[/red]")
                                    continue
                                
                                if not kept_cities:
                                    console.print("[red][WARNING] No valid selections or cities were entered. Please try again.[/red]\n")
                                    continue
                                
                                estimated_days, _ = get_ideal_trip_duration(
                                    reqs.destination_cities, 
                                    reqs.pacing or "Moderate", 
                                    origin
                                )
                                if estimated_days <= duration_int:
                                    console.print(f"[green][SUCCESS] Manual selection accepted. It fits within {duration_int} days![/green]\n")
                                    reqs.destination_cities = optimize_route_order(origin, reqs.destination_cities)
                                    duration_int = estimated_days
                                    reqs.trip_duration_days = str(duration_int)
                                    break
                                else:
                                    console.print(f"[yellow][WARNING] The selected list still requires roughly {estimated_days} days (you have {duration_int}). Re-evaluating...[/yellow]\n")
                            else:
                                console.print("[yellow][WARNING] Keeping your original list. (Expect a very fast-paced trip!)[/yellow]\n")
                                break
                    except Exception as e:
                        print(f"[WARNING] Smart pruning failed: {e}")
                        break
                
                break  # Exit outer loop after inner loop finishes
            else:
                print(f"✨ Perfect amount of days ({duration_int} days) for {len(reqs.destination_cities)} cities.")
                break

    # 1.75 Intelligent Layover Detection — Multi-layer deterministic engine
    layover_cities = []
    if reqs.destination_cities:
        console.print("\n [dim]Analyzing transit routes for layover requirements...[/dim]")
        from src.utils.helpers import should_suggest_layover
        try:
            result = should_suggest_layover(
                origin=reqs.origin_city or "",
                destinations=reqs.destination_cities,
                mode=reqs.travel_mode or "",
                profile=reqs.traveler_profile or "",
            )
            if result["suggest"] and result["layover_city"]:
                console.print(f"\n[bold yellow] Layover Recommendation:[/bold yellow]")
                console.print(f"[yellow]{result['reason']}[/yellow]")
                console.print(f"\nWould you like to add [bold]{result['layover_city']}[/bold] as a 1-night rest stop? (yes/no)")
                ans = input("You: ").strip().lower()
                if ans in ['y', 'yes', 'sure', 'ok', 'okay', '1']:
                    layover_cities.append(result["layover_city"])
                    insert_before = result["insert_before"]
                    if insert_before in reqs.destination_cities:
                        idx = reqs.destination_cities.index(insert_before)
                        reqs.destination_cities.insert(idx, result["layover_city"])
                    else:
                        reqs.destination_cities.append(result["layover_city"])
                    console.print(f"[green][SUCCESS] {result['layover_city']} added as a rest stop![/green]\n")
            else:
                console.print("[dim][SUCCESS] No layover needed — direct journey.[/dim]")
        except Exception as e:
            print(f"[WARNING] Layover check failed: {e}")

    # 1.8 Pre-Trip Weather Intelligence Gate
    weather_data_for_state = []
    weather_downgrade_flag = False
    
    if reqs.destination_cities and reqs.travel_dates:
        def fetch_weather(dates):
            w_reports = []
            w_data = []
            console.print(f"\n️ [dim]Checking weather conditions for your destinations during {dates}...[/dim]")
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
            from src.llm_config import get_compound_mini_llm
            from pydantic import BaseModel, Field
            
            class WeatherStatus(BaseModel):
                is_bad_weather: bool = Field(description="True if there is severe/dangerous/unpleasant weather (monsoon, heatwave, blizzard) during the travel dates.")
                bad_weather_details: str = Field(description="Details of the bad weather conditions and specific dates affected.")
                suggested_dates: str = Field(description="Highly recommended alternative dates with excellent weather.")
                reasoning: str = Field(description="Explanation of why these alternative dates are better.")
                
            try:
                from src.llm_config import get_structured_llm
                weather_analyzer = get_structured_llm(WeatherStatus, temperature=0)
                weather_context = "\n\n".join(weather_reports)
                prompt = get_weather_analysis_prompt(
                    travel_dates=reqs.travel_dates,
                    weather_context=weather_context,
                )
                status = weather_analyzer.invoke(prompt)
                
                if status.is_bad_weather:
                    console.print(f"\n[bold red][WARNING] WEATHER WARNING DETECTED![/bold red]")
                    console.print(f"[red]The AI detected unfavorable weather conditions in your destination(s) during {reqs.travel_dates}:[/red]")
                    console.print(f"  [bold]Details:[/bold] {status.bad_weather_details}")
                    console.print(f"  [bold]Suggested Alternative Dates:[/bold] [green]{status.suggested_dates}[/green] ({status.reasoning})")
                    console.print(f"\nWould you like to shift your travel dates to [bold]{status.suggested_dates}[/bold]? (Type 'yes', or type your preferred month, or 'no' to keep original)")
                    ans = input("You: ").strip().lower()
                    
                    dates_changed = False
                    if ans in ['y', 'yes', 'sure', 'ok', 'okay', '1']:
                        reqs.travel_dates = status.suggested_dates
                        console.print(f"[green][SUCCESS] Travel dates shifted to: {reqs.travel_dates}[/green]\n")
                        dates_changed = True
                    elif ans not in ['n', 'no', 'nope', '0', '']:
                        # Bug 1 Fix: The user typed a custom month/date like "september"
                        reqs.travel_dates = ans.title()
                        console.print(f"[green][SUCCESS] Travel dates shifted to your custom choice: {reqs.travel_dates}[/green]\n")
                        dates_changed = True
                    else:
                        console.print(f"[yellow][WARNING] Continuing with original dates: {reqs.travel_dates}[/yellow]\n")
                        weather_downgrade_flag = True
                        
                    # CRITICAL BUG FIX: Re-fetch weather if dates were shifted
                    if dates_changed:
                        _, weather_data_for_state = fetch_weather(reqs.travel_dates)
                        
                else:
                    console.print("[green][SUCCESS] Weather check passed: No severe conditions detected![/green]\n")
            except Exception as e:
                print(f"[WARNING] Weather Intelligence Gate analysis skipped: {e}")
    
    # 2. Intent Check
    if not ask_ready_to_proceed():
        return main()
    planning_mode = "autopilot"
    
    # 3. Setup Initial State
    # Safely extract integer from duration string
    duration_str = reqs.trip_duration_days or "1"
    try:
        duration_int = int(''.join(filter(str.isdigit, str(duration_str))))
    except ValueError:
        duration_int = 1

    # Safely extract budget float by finding the max number
    import re
    budget_str = str(reqs.budget_inr or "0").lower().replace('k', '000').replace(',', '')
    numbers = re.findall(r'\d+', budget_str)
    budget_float = float(max(int(n) for n in numbers)) if numbers else 0.0

    initial_state = {
        "user_request": "Initial full plan request.",
        "origin_city": reqs.origin_city,
        "destination_cities": reqs.destination_cities or [],
        "destinations": reqs.destination_cities or [], # backward compat
        "pruned_cities": list(set(original_curated_cities) - set(reqs.destination_cities)) if 'original_curated_cities' in locals() else [],
        "travel_dates": reqs.travel_dates,
        "trip_duration_days": duration_int,
        "traveler_profile": reqs.traveler_profile,
        "pacing": reqs.pacing,
        "budget": budget_float,
        "travel_mode": reqs.travel_mode,
        "travel_class": reqs.travel_class,
        "planning_mode": planning_mode,
        "layover_cities": layover_cities if 'layover_cities' in locals() else [],
        "weather_info": weather_data_for_state if 'weather_data_for_state' in locals() else [],
        "weather_downgrade": weather_downgrade_flag if 'weather_downgrade_flag' in locals() else False,
        "city_roles": city_roles if 'city_roles' in locals() else {},
        "messages": [],
        "validation_flags": {},
        "patch_request": None,
        "user_approved": False,
        "user_selections": None
    }
    
    # LangGraph unique session memory
    session_id = uuid.uuid4().hex
    config = {"configurable": {"thread_id": session_id}}
    
    print(f"\n Agent is booting up in {planning_mode.upper()} mode... (Session ID: {session_id})\n")
    
    # 4. Infinite Refinement Loop
    while True:
        # Run the Graph
        for output in master_graph.stream(initial_state if 'initial_state' in locals() else None, config=config):
            for key, value in output.items():
                print(f"--- Finished node: {key} ---")
                
        # Remove initial_state so next iteration resumes from memory
        if 'initial_state' in locals():
            del initial_state
            
        current_state = master_graph.get_state(config)
        next_node = current_state.next
        
        # ─── STEP-BY-STEP REVIEW INTERRUPT ──────────────────────────────────
        if next_node and "step_by_step_review" in next_node:
            state_values = current_state.values
            messages = state_values.get("messages", [])
            
            transport_opts = []
            hotel_opts = []
            
            # Map tool_call_id to its arguments so we know which city the tool was searching
            call_args = {}
            for msg in messages:
                if getattr(msg, "type", "") == "ai" and hasattr(msg, "tool_calls"):
                    for tc in getattr(msg, "tool_calls", []):
                        call_args[tc["id"]] = tc["args"]
                        
            # Extract raw tool data from the message history
            for msg in messages:
                if getattr(msg, "type", "") == "tool":
                    try:
                        data = json.loads(msg.content)
                        args = call_args.get(getattr(msg, "tool_call_id", ""), {})
                        
                        if msg.name == "transport_search":
                            transport_opts.extend(data)
                        elif msg.name == "hotel_search":
                            city_name = args.get("destination", "Unknown City")
                            hotel_opts.append({"city": city_name, "hotels": data})
                    except Exception:
                        pass
            
            console.print("\n[bold magenta][INFO] STEP-BY-STEP SELECTION[/bold magenta]", justify="center")
            console.print("[italic]The AI has gathered options for you. Pick your preferences below.[/italic]\n")
            
            user_selections = {}
            
            # ── Transport Selection ──
            if transport_opts:
                console.print("[bold cyan] TRANSPORT OPTIONS:[/bold cyan]")
                
                # Check for explicit tool errors
                if len(transport_opts) > 0 and "error" in transport_opts[0]:
                    console.print(f"  [red][WARNING] {transport_opts[0]['error']}[/red]")
                else:
                    flat_transports = []
                    for t in transport_opts:
                        if isinstance(t, dict) and "results" in t:
                            flat_transports.extend(t["results"] if isinstance(t["results"], list) else [t])
                        else:
                            flat_transports.append(t)
                    
                    for i, t in enumerate(flat_transports[:5], 1):
                        provider = t.get("provider") or t.get("name") or f"Option {i}"
                        dep = t.get("departure_time", "")
                        arr = t.get("arrival_time", "")
                        dur = t.get("duration", "")
                        details = t.get("details", "")
                        price = t.get("price", "")
                        
                        time_str = f"({dep} -> {arr}, {dur})" if dep and arr else f"({dur})" if dur else ""
                        price_str = f" — ₹{price}" if price else ""
                        
                        console.print(f"  [{i}] [bold]{provider}[/bold] {time_str}{price_str}")
                        if details:
                            console.print(f"      [dim]{details}[/dim]")
                    
                    pick = input("\nYou: Pick a transport number (or press Enter to let AI choose): ").strip()
                    if pick.isdigit() and 1 <= int(pick) <= len(flat_transports):
                        chosen = flat_transports[int(pick) - 1]
                        user_selections["transport"] = chosen.get("name") or chosen.get("provider", f"Option {pick}")
                        console.print(f"[green]✓ Transport selected: {user_selections['transport']}[/green]\n")
            
            # ── Hotel Selection (per city) ──
            if hotel_opts:
                console.print("[bold cyan] HOTEL OPTIONS (per city):[/bold cyan]")
                for city_data in hotel_opts:
                    if not isinstance(city_data, dict):
                        continue
                    city = city_data.get("city", "Unknown City")
                    hotels = city_data.get("hotels") or city_data.get("results") or []
                    if not hotels:
                        continue
                    
                    console.print(f"\n  [bold white]{city}[/bold white]")
                    
                    if len(hotels) > 0 and isinstance(hotels[0], dict) and "error" in hotels[0]:
                        console.print(f"    [red][WARNING] {hotels[0]['error']}[/red]")
                        continue
                        
                    for i, h in enumerate(hotels[:5], 1):
                        name = h.get("name", f"Hotel {i}")
                        price = h.get("price_per_night") or h.get("price", "")
                        rating = h.get("rating", "")
                        price_str = f" — ₹{price}/night" if price else ""
                        rating_str = f" ⭐{rating}" if rating else ""
                        console.print(f"    [{i}] {name}{price_str}{rating_str}")
                    
                    pick = input(f"\n  You: Pick a hotel for {city} (or Enter to let AI choose): ").strip()
                    if pick.isdigit() and 1 <= int(pick) <= len(hotels):
                        chosen = hotels[int(pick) - 1]
                        hotel_key = f"hotel_{city.lower().replace(' ', '_')}"
                        user_selections[hotel_key] = chosen.get("name", f"Option {pick}")
                        console.print(f"  [green]✓ Hotel selected for {city}: {user_selections[hotel_key]}[/green]")
            
            # Push selections into graph state and resume
            master_graph.update_state(config, {"user_selections": user_selections})
            console.print("\n[bold green][SUCCESS] Selections saved! Generating your personalized itinerary...[/bold green]\n")
            continue  # Resume graph from the interrupt point
        
        # ─── FINAL REVIEW / HUMAN REVIEW INTERRUPT ──────────────────────────
        # If graph finished normally, or hit the manual interrupt for review
        if not next_node or "human_review" in next_node:
            state_values = current_state.values
            
            # Print latest itinerary using Rich
            final_json = state_values.get("final_itinerary_json", "{}")
            if final_json != "{}":
                # HYDRATE ITINERARY WITH COORDINATES & IMAGES
                try:
                    from src.schemas.trip_schema import TripItinerary
                    from src.utils.hydrator import hydrate_trip_itinerary
                    parsed_itin = TripItinerary.model_validate_json(final_json)
                    hydrated_itin = hydrate_trip_itinerary(parsed_itin)
                    final_json = hydrated_itin.model_dump_json(indent=2)
                    
                    # Update state with hydrated json so it saves correctly if interrupted
                    master_graph.update_state(config, {"final_itinerary_json": final_json})
                except Exception as e:
                    print(f"\n[yellow][WARNING] Minor Warning: Backend hydration failed ({e}). Proceeding with unhydrated data.[/yellow]")

                console.print("\n[bold magenta] YOUR TRIP ITINERARY [/bold magenta]\n", justify="center")
                try:
                    data = json.loads(final_json)
                    options = data.get("options", [])
                    user_budget = state_values.get("budget", 0)
                    
                    # Always display only the first (and only) option
                    if options:
                        opt = options[0]
                        total_cost = opt.get('total_cost_inr', 0)
                        
                        allocs = state_values.get("allocations", [])
                        hub_day_trips = {}
                        last_hub = None
                        for a in allocs:
                            if hasattr(a, 'nights'):
                                if a.nights > 0:
                                    last_hub = a.city
                                    hub_day_trips[last_hub] = []
                                elif a.nights == 0 and last_hub:
                                    hub_day_trips[last_hub].append(a.city)
                                    
                        for stop in opt.get("route", []):
                            city = stop.get("city", "Unknown")
                            nights = stop.get("nights", 0)
                            if nights == 0:
                                origin_city = state_values.get("origin_city", "")
                                transport = stop.get("transport_to_city")
                                delay_str = ""
                                if transport and isinstance(transport, dict):
                                    delay = transport.get('estimated_delay_buffer_hours', 0)
                                    delay_str = f" (+{delay}h buffer)" if delay else ""
                                    
                                    provider = transport.get('provider', '')
                                    type_str = str(transport.get('type', ''))
                                    dur_str = str(transport.get('duration', ''))
                                    
                                    # Transport Label Normalization
                                    if type_str.lower() == 'car' and any(w in provider.lower() for w in ['taxi', 'cab']):
                                        type_str = ''
                                    provider = provider.replace("Service", "").replace("service", "").strip()
                                    combined_label = f"{provider} {type_str}".strip()
                                    
                                    if "/" in provider and "flight" in str(transport.get('type', '')).lower():
                                        parts = provider.split("/")
                                        taxi_p = [p for p in parts if "taxi" in p.lower() or "cab" in p.lower()]
                                        flight_p = [p for p in parts if p not in taxi_p]
                                        p_flight = flight_p[-1].strip() if flight_p else parts[-1].strip()
                                        p_taxi = taxi_p[0].strip() if taxi_p else "Local Transfer"
                                        transport_info = f"\n  ✈️ [bold]Primary Transport:[/bold] {p_flight} {type_str} - {dur_str}{delay_str}\n  🚕 [bold]Local Transfer:[/bold] {p_taxi}"
                                    else:
                                        transport_info = f"\n  🚆 [bold]Transport:[/bold] {combined_label} - {dur_str}{delay_str}"
                                else:
                                    transport_info = ""
                                
                                if city.lower() == origin_city.lower():
                                    # Final return journey stop
                                    console.print(Panel(
                                        f"[bold white] Return to {city}[/bold white]{transport_info}",
                                        expand=False, border_style="dim"
                                    ))
                                continue

                            dt_list = hub_day_trips.get(city, [])
                            dt_str = f" [dim](Includes excursions to: {', '.join(dt_list)})[/dim]" if dt_list else ""
                            console.print(Panel(f"[bold white]{city}[/bold white] - {nights} Night{'s' if nights != 1 else ''}{dt_str}", expand=False, border_style="blue"))
                            
                            hotel = stop.get("hotel", {})
                            if hotel:
                                console.print(f"   [bold]Hotel:[/bold] {hotel.get('name')} (₹{hotel.get('price_per_night')}/night)")
                            
                            transport = stop.get("transport_to_city")
                            if transport and isinstance(transport, dict):
                                delay = transport.get('estimated_delay_buffer_hours', 0)
                                delay_str = f" (+{delay}h buffer)" if delay else ""
                                provider = transport.get('provider', '')
                                type_str = str(transport.get('type', ''))
                                dur_str = str(transport.get('duration', ''))
                                
                                # Transport Label Normalization
                                if type_str.lower() == 'car' and any(w in provider.lower() for w in ['taxi', 'cab']):
                                    type_str = ''
                                provider = provider.replace("Service", "").replace("service", "").strip()
                                combined_label = f"{provider} {type_str}".strip()
                                
                                if "/" in provider and "flight" in str(transport.get('type', '')).lower():
                                    parts = provider.split("/")
                                    taxi_p = [p for p in parts if "taxi" in p.lower() or "cab" in p.lower()]
                                    flight_p = [p for p in parts if p not in taxi_p]
                                    p_flight = flight_p[-1].strip() if flight_p else parts[-1].strip()
                                    p_taxi = taxi_p[0].strip() if taxi_p else "Local Transfer"
                                    console.print(f"  ✈️ [bold]Primary Transport:[/bold] {p_flight} {type_str} - {dur_str}{delay_str}")
                                    console.print(f"   [bold]Local Transfer:[/bold] {p_taxi}")
                                else:
                                    console.print(f"   [bold]Transport:[/bold] {combined_label} - {dur_str}{delay_str}")
                            
                            console.print("   [bold]Daily Plans:[/bold]")
                            for day in stop.get("day_plans", []):
                                console.print(f"    [bold magenta]️  Day {day.get('day_number')} ({day.get('date')}):[/bold magenta]")
                                activities = day.get('activities', [])
                                
                                # Highlight day-trip excursions prominently
                                day_excursions = [dt for dt in dt_list if dt.lower() in str(activities).lower()]
                                if day_excursions:
                                    console.print(f"      [bold yellow] Excursion to: {', '.join(day_excursions)}[/bold yellow]")
                                    
                                for act in activities:
                                    act_type = act.get('activity_type', 'Activity')
                                    console.print(f"      - [bold cyan]• {act_type}:[/bold cyan] {act.get('description', '')}")
                            console.print()
                        
                        # ── Budget Summary Banner ──────────────────────────────────────────
                        console.print()
                        if user_budget and user_budget > 0:
                            over = total_cost > user_budget
                            diff = abs(total_cost - user_budget)
                            if over:
                                console.print(Panel(
                                    f"[bold red][WARNING]  Budget Alert[/bold red]\n"
                                    f"Estimated Cost:  [bold white]₹{total_cost:,.0f}[/bold white]\n"
                                    f"Your Budget:     [bold white]₹{user_budget:,.0f}[/bold white]\n"
                                    f"Over by:         [bold red]₹{diff:,.0f}[/bold red]\n\n"
                                    f"[dim]Tip: Try reducing nights in expensive cities or choosing budget hotels.[/dim]",
                                    border_style="red", expand=False
                                ))
                            else:
                                console.print(Panel(
                                    f"[bold green][SUCCESS]  Budget Check Passed[/bold green]\n"
                                    f"Estimated Cost:  [bold white]₹{total_cost:,.0f}[/bold white]\n"
                                    f"Your Budget:     [bold white]₹{user_budget:,.0f}[/bold white]\n"
                                    f"Savings:         [bold green]₹{diff:,.0f}[/bold green]",
                                    border_style="green", expand=False
                                ))
                        else:
                            console.print(f"[INFO] [bold]Estimated Total Cost:[/bold] ₹{total_cost:,.0f}")
                        console.print()
                        
                        # Save to file automatically and terminate
                        filename = f"my_trip_{session_id[:6]}.json"
                        with open(filename, "w", encoding="utf-8") as f:
                            f.write(final_json)
                        console.print(f"[bold green] Itinerary saved to {filename}! Safe travels! ✈️[/bold green]\n")
                        console.print("[bold green] Thank you for using the AI Travel Planner! Good bye![/bold green]\n")
                        import sys
                        sys.exit(0)
                        
                except Exception as e:
                    console.print("[red]Could not parse itinerary JSON.[/red]")
                    print(final_json)
            else:
                print("\n[WARNING] Graph paused without a final itinerary. This might be a mid-step interrupt.")
            
            # Post-generation interaction
            print("\n" + "="*50)
            print("Are you happy with this plan?")
            print("- Type 'approve' or 'looks good' to save and exit.")
            print("- Or describe what to change (e.g. 'Change the Agra hotel to 5-star').")
            
            feedback = input("\nYou: ")
            
            feedback_lower = feedback.lower().strip()
            if feedback_lower in ['approve', 'ok', 'looks good', 'done', 'yes']:
                # Update state to approved and break loop
                master_graph.update_state(config, {"user_approved": True})
                
                # Save to file
                filename = f"my_trip_{session_id[:6]}.json"
                with open(filename, "w", encoding="utf-8") as f:
                    f.write(final_json)
                print(f"\n Itinerary saved to {filename}! Safe travels! ✈️")
                break
            else:
                # User wants a change. Send feedback back into the graph.
                # In Phase 3, we push their text to 'user_request' and let Change Detector node handle it
                print(f"\n Sending request to AI: '{feedback}'")
                master_graph.update_state(config, {"user_request": feedback})
                # Loop continues, running the graph from the interrupt point
        
if __name__ == "__main__":
    main()
