import uuid
import json
import asyncio
from dotenv import load_dotenv
load_dotenv()

import time
import sqlite3
import os
from fastapi import FastAPI, BackgroundTasks, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Any

from api.services import (
    session_store,
    Session,
    run_planning_from_brief,
    run_feedback_session
)

app = FastAPI(title="Cinematic Travel Planner API")

# Setup CORS to allow frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory Rate Limiter
RATE_LIMIT_WINDOW = 60 # seconds
RATE_LIMIT_MAX_REQ = 3
ip_request_history = {}

# Background Task to prune SQLite DB
async def prune_database_loop():
    while True:
        try:
            db_path = "trip_memory.db"
            if os.path.exists(db_path):
                # Delete rows older than 24 hours if there is a timestamp, or just clear old ones 
                # Since LangGraph SqliteSaver might not have an easy timestamp column accessible by default
                # for a simple prune we'll just clear the checkpoints table entirely periodically 
                # (or ideally, we'd only clear specific thread_ids. But for this MVP, we can just wipe it).
                # To be safe, we will just delete threads that are not in the active session_store
                active_threads = list(session_store.keys())
                
                with sqlite3.connect(db_path) as conn:
                    cursor = conn.cursor()
                    if active_threads:
                        placeholders = ",".join("?" for _ in active_threads)
                        cursor.execute(f"DELETE FROM checkpoints WHERE thread_id NOT IN ({placeholders})")
                        cursor.execute(f"DELETE FROM writes WHERE thread_id NOT IN ({placeholders})")
                    else:
                        cursor.execute("DELETE FROM checkpoints")
                        cursor.execute("DELETE FROM writes")
                    conn.commit()
                print("🧹 Pruned inactive threads from trip_memory.db")
        except Exception as e:
            print(f"Error pruning DB: {e}")
        
        await asyncio.sleep(3600) # Run every hour

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(prune_database_loop())

class FeedbackRequest(BaseModel):
    feedback: str

class AnswerRequest(BaseModel):
    answer: Any # Can be a string or a list of selected cities

class TripBriefRequest(BaseModel):
    destinations: list[str]
    origin: str
    month: str = ""
    duration_days: int = 7
    traveller_type: str = "Solo"     # Solo, Couple, Family, Group
    traveller_count: int = 1
    pace: str = "Moderate"           # Relaxed, Moderate, Packed
    # Transport preference (new — from Journey Briefing step 5)
    transport_mode: str = "auto"     # auto | flights | train | road_trip | public
    transport_class: str = ""        # depends on mode; "" = auto-select
    budget_min: int = 0
    budget_max: int = 100000
    advanced: dict = {}

@app.post("/plan/brief")
async def start_plan_from_brief(req: TripBriefRequest, background_tasks: BackgroundTasks, request: Request):
    """Start a planning session from a structured Journey Brief (no LLM extraction needed)."""
    
    # Rate Limiting Logic
    client_ip = request.client.host if request.client else "unknown"
    current_time = time.time()
    
    # Clean up old timestamps for this IP
    if client_ip in ip_request_history:
        ip_request_history[client_ip] = [
            ts for ts in ip_request_history[client_ip]
            if current_time - ts < RATE_LIMIT_WINDOW
        ]
    else:
        ip_request_history[client_ip] = []
        
    if len(ip_request_history[client_ip]) >= RATE_LIMIT_MAX_REQ:
        raise HTTPException(status_code=429, detail="Too many requests. Please wait a minute before trying again.")
        
    ip_request_history[client_ip].append(current_time)
    
    session_id = uuid.uuid4().hex
    session_store[session_id] = Session()
    background_tasks.add_task(run_planning_from_brief, session_id, req.dict())
    return {"session_id": session_id}

@app.get("/stream/{session_id}")
async def stream_plan(session_id: str, request: Request):
    """
    Server-Sent Events endpoint.
    Streams progression of the LangGraph AI to the frontend AgentDesk.
    """
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    async def event_generator():
        last_sent_index = 0
        while True:
            # Check for client disconnect
            if await request.is_disconnected():
                print(f"🛑 Client disconnected for session {session_id}. Cancelling ghost tasks.")
                session.is_cancelled = True
                if hasattr(session, "reply_event"):
                    session.reply_event.set()
                break

            # Yield all newly added events
            if last_sent_index < len(session.events):
                events_to_send = session.events[last_sent_index:]
                for event in events_to_send:
                    yield f"data: {json.dumps(event)}\n\n"
                last_sent_index = len(session.events)
            
            # If done, exit stream
            if session.status in ["completed", "error"] and last_sent_index == len(session.events):
                break
                
            # Wait for the next event to be pushed
            session.new_event.clear()
            
            # Use wait_for to check disconnects periodically
            try:
                await asyncio.wait_for(session.new_event.wait(), timeout=1.0)
            except asyncio.TimeoutError:
                pass

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/plan/{session_id}")
async def get_plan(session_id: str):
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    if session.status != "completed":
        return {"status": session.status, "message": "Plan is not ready yet."}
        
    return session.final_trip

@app.post("/plan/{session_id}/feedback")
async def apply_feedback(session_id: str, req: FeedbackRequest, background_tasks: BackgroundTasks):
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    # Reset status so stream reconnects/waits
    session.status = "planning"
    
    background_tasks.add_task(run_feedback_session, session_id, req.feedback)
    return {"status": "accepted"}

@app.post("/plan/{session_id}/answer")
async def post_answer(session_id: str, request: Request):
    data = await request.json()
    answer = data.get("answer")
    session = session_store.get(session_id)
    if session and hasattr(session, "reply_event"):
        session.user_reply = answer
        session.reply_event.set()
    return {"status": "accepted"}

@app.on_event("shutdown")
def shutdown_event():
    print("Stopping backend server and waking up all waiting sessions...")
    for session_id, session in session_store.items():
        session.status = "error"
        session.reply_event.set()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
