from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
import os
import random
from typing import Any, Optional

# Core task-specific models (drawn from completely separate TPD quota pools)
MODEL_TOOLS = "llama-3.1-8b-instant"                  # 500K TPD
MODEL_CLARIFICATION = "allam-2-7b"                    # 500K TPD
MODEL_COMPOUND = "llama-3.3-70b-versatile"              # High capability for destination research
MODEL_COMPOUND_MINI = "llama-3.1-8b-instant"            # Fast, supports tool calling for logic gates

# City Planner Models (rotated by city index if Groq fallback is active)
MODEL_CITY_1 = "meta-llama/llama-4-scout-17b-16e-instruct" # 500K TPD
MODEL_CITY_2 = "qwen/qwen3-32b"                            # 500K TPD
MODEL_CITY_3 = "openai/gpt-oss-20b"                        # 200K TPD
MODEL_FALLBACK = "llama-3.3-70b-versatile"                 # 100K TPD

# Multi-hop routing model
MODEL_RETURN_JOURNEY = "openai/gpt-oss-120b"               # 200K TPD

def get_groq_api_key() -> str:
    """Retrieves a Groq API key, supporting rotation of a comma-separated list in GROQ_API_KEYS."""
    keys_str = os.getenv("GROQ_API_KEYS", "")
    if keys_str:
        keys = [k.strip() for k in keys_str.split(",") if k.strip()]
        if keys:
            # Randomly select a key to distribute the API quota load
            return random.choice(keys)
    return os.getenv("GROQ_API_KEY", "")

def has_gemini() -> bool:
    """Returns True if a Google/Gemini API key is configured in the environment."""
    return bool(os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"))

def get_gemini_llm(temperature: float = 0.2, max_tokens: Optional[int] = None) -> ChatGoogleGenerativeAI:
    """Returns the extremely high-capacity, free-tier gemini-3.1-flash-lite model (15 RPM / 500 RPD)."""
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    return ChatGoogleGenerativeAI(
        model="gemini-3.1-flash-lite",
        temperature=temperature,
        max_output_tokens=max_tokens or 8192,
        google_api_key=api_key
    )

def get_llm(temperature: float = 0.2) -> ChatGroq:
    """Returns the fast 8B model for structured data extraction and tool calls."""
    return ChatGroq(model=MODEL_TOOLS, temperature=temperature, max_tokens=2000, api_key=get_groq_api_key())

def get_clarification_llm(temperature: float = 0.3) -> Any:
    """Returns the clarification model, prioritizing Gemini if available."""
    if has_gemini():
        return get_gemini_llm(temperature=temperature)
    return ChatGroq(model=MODEL_CLARIFICATION, temperature=temperature, api_key=get_groq_api_key())

def get_compound_llm(temperature: float = 0.5) -> Any:
    """Returns the compound research model, prioritizing Gemini if available."""
    if has_gemini():
        return get_gemini_llm(temperature=temperature)
    return ChatGroq(model=MODEL_COMPOUND, temperature=temperature, api_key=get_groq_api_key())

def get_compound_mini_llm(temperature: float = 0.2) -> Any:
    """Returns the logic gate decision model, prioritizing Gemini if available."""
    if has_gemini():
        return get_gemini_llm(temperature=temperature)
    return ChatGroq(model=MODEL_COMPOUND_MINI, temperature=temperature, api_key=get_groq_api_key())

def get_city_planner_llm(index: int, temperature: float = 0.4) -> Any:
    """Returns the city planner model. Prioritizes Gemini-3.1-Flash-Lite, falling back to rotated Groq models."""
    if has_gemini():
        return get_gemini_llm(temperature=temperature)
        
    if index == 0:
        return ChatGroq(model=MODEL_CITY_1, temperature=temperature, max_tokens=2500, api_key=get_groq_api_key())
    elif index == 1:
        return ChatGroq(model=MODEL_CITY_2, temperature=temperature, max_tokens=1500, api_key=get_groq_api_key())
    elif index == 2:
        return ChatGroq(model=MODEL_CITY_3, temperature=temperature, max_tokens=2000, api_key=get_groq_api_key())
    else:
        return ChatGroq(model=MODEL_FALLBACK, temperature=temperature, max_tokens=2000, api_key=get_groq_api_key())

def get_return_journey_llm(temperature: float = 0.3) -> Any:
    """Returns the return journey planner model, prioritizing Gemini if available."""
    if has_gemini():
        return get_gemini_llm(temperature=temperature)
    return ChatGroq(model=MODEL_RETURN_JOURNEY, temperature=temperature, max_tokens=1500, api_key=get_groq_api_key())

def get_heavy_llm(temperature: float = 0.2) -> Any:
    """Returns a heavy model fallback, prioritizing Gemini if available."""
    if has_gemini():
        return get_gemini_llm(temperature=temperature)
    return ChatGroq(model=MODEL_FALLBACK, temperature=temperature, max_tokens=2000, api_key=get_groq_api_key())

def get_structured_llm(schema: Any, temperature: float = 0.2, max_tokens: Optional[int] = None) -> Any:
    """
    Returns a structured LLM with extremely robust multi-model fallback.
    If Gemini is available, it returns a RunnableWithFallbacks that uses gemini-3.1-flash-lite as primary
    and llama-3.3-70b-versatile on Groq as secondary.
    This protects the application completely against Gemini rate limits or connection errors.
    """
    if has_gemini():
        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        gemini_structured = ChatGoogleGenerativeAI(
            model="gemini-3.1-flash-lite",
            temperature=temperature,
            max_output_tokens=max_tokens or 8192,
            google_api_key=api_key
        ).with_structured_output(schema)
        
        # Groq Fallback
        groq_api_key = get_groq_api_key()
        if groq_api_key:
            groq_fallback = ChatGroq(
                model="llama-3.3-70b-versatile",
                temperature=temperature,
                max_tokens=max_tokens or 2000,
                api_key=groq_api_key
            ).with_structured_output(schema)
            return gemini_structured.with_fallbacks([groq_fallback])
            
        return gemini_structured
    else:
        # Standard Groq
        return ChatGroq(
            model="llama-3.3-70b-versatile",
            temperature=temperature,
            max_tokens=max_tokens or 2000,
            api_key=get_groq_api_key()
        ).with_structured_output(schema)
