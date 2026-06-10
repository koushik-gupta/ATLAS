# 🗺️ ATLAS — Agentic Travel Logistics and Advisory System

<div align="center">

**Turn a one-line trip brief into a complete, time-optimized travel itinerary — powered by AI agents.**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.2+-FF6B6B?style=flat-square)](https://langchain-ai.github.io/langgraph/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

</div>

---

## What is ATLAS?

ATLAS is a full-stack agentic AI travel planning system. You describe your trip in plain language — destination, duration, travel style — and ATLAS handles everything else: curating destinations, building a logical multi-city route, estimating travel time, flagging over-packed schedules, and generating a complete day-by-day itinerary with transport options.

Unlike basic AI chatbots that generate static text, ATLAS uses a **multi-agent LangGraph pipeline** where specialized agents collaborate — each responsible for a distinct phase of planning — with a live streaming UI that lets you watch the plan being built in real time.

---

## ✈️ Current Mode — Autopilot

> *"Plan less. Explore more. Let ATLAS chart the way."*

In **Autopilot Mode**, ATLAS autonomously handles the full planning pipeline with minimal user input. You provide a trip brief, select destinations from the curated tray, and ATLAS produces a complete itinerary.

### How it works end-to-end

```
User Trip Brief
      │
      ▼
┌─────────────────────┐
│  Trip Brief Parser  │  Extracts: origin, destinations, duration, travel style, budget
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Destination Curator │  Curates nearby cities, generates rich pitches and images
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  User Selection     │  Interactive destination tray — choose what interests you
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Route Optimizer    │  Builds the optimal visit sequence (acclimatization-aware)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Duration Estimator  │  Calculates ideal days per city, checks time feasibility
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Algorithmic Pruning │  Removes overcrowded cities using hub clustering + OSRM
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Itinerary Builder   │  Generates day-by-day plan with activities and transport
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Transport Planner   │  Finds real flights (SerpApi) and surface transport options
└─────────┬───────────┘
          │
          ▼
     Final Itinerary + Cinematic Expedition Map
```

---

## 🧠 Core Intelligence — Algorithmic Pruning Engine

The most technically sophisticated part of ATLAS. When a user selects too many destinations for their available days, ATLAS doesn't blindly drop random cities. It applies a **geographic hub clustering + proximity-aware pruning** algorithm.

### Geographic Hub Clustering

Every destination is assigned to a **hub** anchored by the user's explicit trip brief destinations.

- Uses **OSRM Table API** (free, open-source routing engine) to get **actual road driving distances** between cities — not straight-line estimates
- Dynamically discovers hub boundaries via **Natural Gap Detection**: finds the biggest jump in sorted travel times, sets the threshold at that gap's midpoint
- No hardcoded radius — the threshold adapts to the trip's geography

```
Example: User brief → "Darjeeling"

Sorted travel times from Darjeeling (OSRM real-road):
  Kurseong:  26 min  ← Darjeeling Core Hub
  Mirik:     41 min  ← Darjeeling Core Hub
  Siliguri:  58 min  ← Darjeeling Core Hub
  Ravangla:  67 min  ← Darjeeling Core Hub
  Pelling:   74 min  ← Darjeeling Core Hub
  Gangtok:   83 min  ╔═══ BIGGEST GAP (28 min) detected here
  Yuksom:   111 min  ╚═══ Optional Hub (beyond threshold)

Hub Threshold auto-set to: 97 min (midpoint of gap)
```

### Two-Phase Pruning Strategy

| Phase | Condition | Strategy |
|---|---|---|
| **Phase 1** | Optional Hubs exist | Prune the farthest Optional Hub first, removing its least globally famous city |
| **Phase 2** | Only Core Hubs remain | **Within each hub**: pick farthest city from anchor (protects local gems). **Cross-hub**: prune least globally famous candidate |

This guarantees: Mirik and Kurseong (local Darjeeling experience) are protected while Gangtok or Yuksom (farther away) get removed first when days are tight.

### Multi-Anchor Fairness (Multiple Trip Brief Destinations)

When the user specifies multiple destinations (e.g., Darjeeling + Gangtok):
- Both form **Core Hubs** — equal status
- Cross-hub pruning uses **global tourist importance** as the tiebreaker, not raw distance (since anchors are geographically different, comparing raw km/minutes across hubs is unfair)

---

## 🎨 Frontend Architecture

Built with **Next.js 16 + React 19 + TypeScript**, styled with **Tailwind CSS v4**.

| Component | Purpose |
|---|---|
| `AgentDesk` | Main orchestrator — SSE stream handler, phase routing |
| `JourneyBriefing` | Trip brief input with animated multi-step form |
| `DestinationTray` | Interactive city selection cards with curated images |
| `EditorialCanvas` | Rich itinerary viewer with day-by-day breakdown |
| `ExpeditionSummary` | Final trip summary with hotel, transport, and cost overview |
| `AnimatedMap` | **MapLibre GL + MapTiler** cinematic expedition route map |
| `LivePlanningCanvas` | Real-time workflow visualization canvas (zoom/pan) |

### Expedition Map Features

- **Real-time 3D terrain** via MapTiler Terrain RGB v2 with 1.5× exaggeration
- **Animated transport icons** (✈️ Plane / 🚂 Train / 🚗 Car) that travel along the route in real time
- **Cinematic auto-tour**: automatically flies through each city on first open
- **Flight arcs** rendered as smooth Bézier curves via `@turf/turf`
- **Context-aware geocoding** — city names like "Vasco da Gama" correctly resolve to Goa, India (not Brazil) using state/country hints

---

## 🔧 Tech Stack

### Backend
| Technology | Role |
|---|---|
| **Python 3.11+** | Core language |
| **FastAPI** | REST API + Server-Sent Events (SSE) streaming |
| **LangGraph** | Multi-agent state graph orchestration |
| **LangChain** | LLM abstraction, structured output, tool calls |
| **Pydantic v2** | Data validation and structured LLM output schemas |
| **SQLite** | LangGraph checkpoint persistence (`langgraph-checkpoint-sqlite`) |
| **OSRM Table API** | Free open-source real-road distance + duration matrix |
| **SerpApi** | Google Flights search for real transport options |
| **DuckDuckGo Search** | Web search tool for activity research |

### Frontend
| Technology | Role |
|---|---|
| **Next.js 16** | React framework with App Router |
| **React 19** | UI components |
| **TypeScript** | Type safety |
| **Tailwind CSS v4** | Utility-first styling |
| **Framer Motion** | Page transitions and micro-animations |
| **GSAP** | High-performance animation sequences |
| **MapLibre GL** | Open-source WebGL map rendering |
| **MapTiler** | Map tiles and 3D terrain |
| **@turf/turf** | Geospatial calculations (arcs, bearings, distances) |
| **react-globe.gl** | 3D globe visualization |

---

## 🗂️ Project Structure

```
atlas/
├── api/                        # FastAPI application
│   ├── main.py                 # App entry point, SSE endpoints
│   ├── services.py             # Core planning service (pruning engine, streaming)
│   └── image_pipeline.py       # Multi-layer destination image resolver
│
├── src/
│   ├── graphs/                 # LangGraph agent pipelines
│   │   ├── main_graph.py       # Top-level orchestration graph
│   │   └── itinerary_subgraph.py  # Itinerary generation subgraph
│   ├── nodes/                  # Individual agent nodes
│   │   ├── validation_nodes.py
│   │   └── retrieval_nodes.py
│   ├── schemas/                # Pydantic data models
│   │   └── trip_schema.py      # TripItinerary, CityStop, TripOption schemas
│   ├── tools/                  # LangChain tools
│   │   └── places_tool.py      # Activity and hotel search
│   ├── utils/
│   │   ├── helpers.py          # Geographic clustering, OSRM matrix, LLM geocoding
│   │   └── hydrator.py         # Post-processor: coordinates, images, types
│   ├── prompts.py              # All LLM system prompts
│   └── llm_config.py           # LLM model configurations
│
├── frontend/                   # Next.js application
│   ├── app/                    # App Router pages
│   ├── components/
│   │   └── dashboard/          # All UI components
│   ├── hooks/
│   │   └── useAgentStream.ts   # SSE stream consumer
│   └── lib/
│       └── mockData.ts         # Development mock data
│
├── requirements.txt
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- API keys (see below)

### Required API Keys

Create a `.env` file in the project root:

```env
# LLM Provider (at least one required)
GROQ_API_KEY=your_groq_api_key

# Google Flights search (free tier: 250 searches/month)
SERPAPI_KEY=your_serpapi_key

# Map tiles and terrain
NEXT_PUBLIC_MAPTILER_KEY=your_maptiler_key
```

> **Free tiers available:** Groq (generous free tier), SerpApi (250 free searches/month), MapTiler (100k free map loads/month)

### Backend Setup

```bash
# Clone the repo
git clone https://github.com/yourusername/atlas.git
cd atlas

# Create virtual environment
python -m venv myenv
myenv\Scripts\activate        # Windows
# source myenv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Start backend
uvicorn api.main:app --reload
# → Running at http://localhost:8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
# → Running at http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) and describe your trip.

---

## 📡 API Overview

| Endpoint | Method | Description |
|---|---|---|
| `/stream` | `GET` | SSE stream — main planning pipeline |
| `/submit-answer` | `POST` | Submit user selections mid-stream |
| `/health` | `GET` | Health check |

The frontend communicates exclusively via **Server-Sent Events (SSE)** for real-time streaming. Each event has a `type` field that drives phase transitions in the UI.

---

## 🛣️ Roadmap

### ✅ Current — Autopilot Mode

Full autonomous planning pipeline: brief → curation → selection → routing → pruning → itinerary → transport.

---

### 🔜 v2.0 — Feedback Mode (Human-in-the-Loop)

> *Give users control of every decision while the AI still does the heavy lifting.*

ATLAS will offer a second planning mode — **Feedback Mode** — where the agent pauses at each major decision point and presents options to the user before proceeding.

| Decision Point | Autopilot | Feedback Mode |
|---|---|---|
| Destination selection | AI suggests, user picks from tray | AI presents ranked options with rationale, user approves each |
| Route order | AI decides | User can drag-and-drop, AI validates and warns |
| Days per city | AI calculates | User can adjust sliders, AI recalculates feasibility |
| Pruning decisions | AI removes automatically | AI explains why a city is being cut, user can override |
| Hotel selection | AI picks category | User browses options, picks their hotel |
| Flight selection | AI picks best option | User sees all available flights and chooses |
| Activity selection | AI curates | User browses activities and builds their own day plan |

---

### 🔜 v2.1 — Itinerary Editor

> *The plan is yours — change anything after it's generated.*

- Inline editing of any itinerary element (hotel, activity, note)
- Add / remove / reorder cities post-generation
- Swap transport options (e.g., train → flight)
- AI validates changes and flags new time conflicts
- Real-time itinerary re-rendering on every edit

---

### 🔜 v3.0 — End-to-End Booking

> *From plan to passport stamp — without leaving ATLAS.*

Once the itinerary is finalized, ATLAS will handle the complete booking workflow:

- **✈️ Flights** — Direct booking integration (Skyscanner / Amadeus API)
- **🏨 Hotels** — Room selection and reservation (Booking.com / Hotels.com API)
- **🚌 Ground Transport** — Bus, train, cab booking where available
- **🎟️ Activities** — Tour and experience booking (Viator / GetYourGuide API)
- **📄 Booking Summary** — Single consolidated booking reference with all confirmations
- **📱 Trip Wallet** — All tickets, vouchers, and confirmations in one place

---

### 🔜 v3.1 — Live Trip Companion

> *ATLAS travels with you.*

- Real-time flight status and delay alerts
- Dynamic itinerary re-routing on disruptions
- Local weather integration per city
- Offline mode — full itinerary accessible without internet
- Push notifications for check-ins and departures

---

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

```bash
# Fork the repo, then:
git checkout -b feature/your-feature-name
git commit -m "feat: add your feature"
git push origin feature/your-feature-name
# Open a Pull Request
```

### Areas open for contribution

- Adding new LLM provider integrations (OpenAI, Anthropic, Gemini)
- Expanding transport estimation beyond India
- Adding more curated destination pitches and city data
- Improving the OSRM fallback for regions with poor road data
- Internationalisation (i18n) for non-English trip briefs

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

- [LangGraph](https://langchain-ai.github.io/langgraph/) — for making complex agentic workflows manageable
- [OSRM](http://project-osrm.org/) — for the free, fast, and accurate routing engine
- [MapLibre GL](https://maplibre.org/) — for the beautiful open-source map renderer
- [MapTiler](https://www.maptiler.com/) — for stunning map styles and 3D terrain
- [Groq](https://groq.com/) — for blazing-fast LLM inference
- [SerpApi](https://serpapi.com/) — for reliable Google Flights data

---

<div align="center">

**Named after the Titan who held up the world — ATLAS holds your entire journey together.**

*Built with ❤️ and a lot of agentic reasoning*

</div>
