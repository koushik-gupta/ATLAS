"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Plus, X, ArrowRight, Compass, Sparkles, Navigation, CheckCircle2, Zap, Plane, Train, Car, Bus, Mountain, Trees, Camera, Building2, Utensils, Baby,
} from "lucide-react";
import LocationAutocomplete from "./LocationAutocomplete";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TripBrief {
  destinations:      string[];
  origin:            string;
  month:             string;
  duration_days:     number;
  traveller_type:    string;
  traveller_count:   number;
  pace:              string;
  transport_mode:    string;   // "auto" | "flights" | "train" | "road_trip" | "public"
  transport_class:   string;   // depends on mode; "" = not set
  budget_min:        number;
  budget_max:        number;
  advanced:          Record<string, boolean>;
}

const DEFAULT_BRIEF: TripBrief = {
  destinations:    [],
  origin:          "",
  month:           "",
  duration_days:   7,
  traveller_type:  "Solo",
  traveller_count: 1,
  pace:            "",
  transport_mode:  "auto",
  transport_class: "",
  budget_min:      20000,
  budget_max:      100000,
  advanced:        {},
};

const STORAGE_KEY = "journey-brief-v4";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const TRAVELLER_TYPES = [
  { id: "Solo",   label: "Solo",   desc: "Just me",     defaultCount: 1 },
  { id: "Couple", label: "Couple", desc: "Two of us",   defaultCount: 2 },
  { id: "Family", label: "Family", desc: "With family", defaultCount: 3 },
  { id: "Group",  label: "Group",  desc: "Group trip",  defaultCount: 4 },
];

const PACE_OPTIONS = [
  {
    id: "Relaxed",  label: "Relaxed",  subtitle: "Slow & deep",
    desc: "2–3 highlights per day, long rests, immersive local stays.",
    accent: "#14B8A6", bg: "rgba(20,184,166,0.06)", border: "rgba(20,184,166,0.22)",
  },
  {
    id: "Moderate", label: "Moderate", subtitle: "Balanced",
    desc: "4–5 activities, balanced between depth and coverage.",
    accent: "#CFA86E", bg: "rgba(207,168,110,0.06)", border: "rgba(207,168,110,0.22)",
  },
  {
    id: "Packed",   label: "Packed",   subtitle: "Max sights",
    desc: "6–8 activities daily — every moment utilised.",
    accent: "#FF8A3D", bg: "rgba(255,138,61,0.06)",  border: "rgba(255,138,61,0.22)",
  },
];

const TRANSPORT_MODES = [
  {
    id: "auto",      label: "Optimize Automatically", desc: "AI selects the best mix for your route",
    Icon: Zap,   accent: "#8B5CF6", bg: "rgba(139,92,246,0.06)", border: "rgba(139,92,246,0.22)", hasClass: false,
  },
  {
    id: "flights",   label: "Flights Preferred",      desc: "Fastest routes, maximize sightseeing time",
    Icon: Plane, accent: "#0EA5E9", bg: "rgba(14,165,233,0.06)", border: "rgba(14,165,233,0.22)", hasClass: true,
  },
  {
    id: "train",     label: "Train Journey",          desc: "Scenic and comfortable — the soul of Indian travel",
    Icon: Train, accent: "#14B8A6", bg: "rgba(20,184,166,0.06)", border: "rgba(20,184,166,0.22)", hasClass: true,
  },
  {
    id: "road_trip", label: "Road Trip",              desc: "Maximum flexibility, explore off the beaten path",
    Icon: Car,   accent: "#CFA86E", bg: "rgba(207,168,110,0.06)",border: "rgba(207,168,110,0.22)", hasClass: true,
  },
  {
    id: "public",    label: "Public Transport",       desc: "Budget-friendly, authentic local experience",
    Icon: Bus,   accent: "#22C55E", bg: "rgba(34,197,94,0.06)",  border: "rgba(34,197,94,0.22)",  hasClass: true,
  },
];

const TRANSPORT_CLASSES: Record<string, { id: string; label: string; desc: string }[]> = {
  flights: [
    { id: "economy",         label: "Economy",         desc: "Best value, wide availability" },
    { id: "premium_economy", label: "Premium Economy", desc: "Extra legroom & comfort" },
    { id: "business",        label: "Business",        desc: "Lie-flat, premium service" },
  ],
  train: [
    { id: "sleeper",   label: "Sleeper",   desc: "Budget overnight, no AC" },
    { id: "3a",        label: "3A AC",     desc: "3-tier AC, most popular" },
    { id: "2a",        label: "2A AC",     desc: "2-tier AC, more privacy" },
    { id: "1a",        label: "1A AC",     desc: "Luxury cabin, 1st class" },
  ],
  road_trip: [
    { id: "shared",      label: "Shared",      desc: "Cost-effective with others" },
    { id: "private_cab", label: "Private Cab", desc: "Comfortable, door-to-door" },
    { id: "self_drive",  label: "Self Drive",  desc: "Full control of your route" },
  ],
  public: [
    { id: "standard", label: "Standard", desc: "Local buses, metro, auto" },
    { id: "comfort",   label: "Comfort",  desc: "AC buses & ride-share" },
  ],
};

const PREFERENCES = [
  { id: "no_flights",  label: "No Flights",  Icon: Plane },
  { id: "luxury",      label: "Luxury",      Icon: Sparkles },
  { id: "adventure",   label: "Adventure",   Icon: Mountain },
  { id: "nature",      label: "Nature",      Icon: Trees },
  { id: "photography", label: "Photography", Icon: Camera },
  { id: "heritage",    label: "Heritage",    Icon: Building2 },
  { id: "food",        label: "Food",        Icon: Utensils },
  { id: "family_safe", label: "Family Safe", Icon: Baby },
];

// ─────────────────────────────────────────────────────────────────────────────
// Budget Slider
// ─────────────────────────────────────────────────────────────────────────────

const LOG_MIN   = 5000;
const LOG_MAX   = 1000000;
const toLog     = (v: number) => (Math.log(v) - Math.log(LOG_MIN)) / (Math.log(LOG_MAX) - Math.log(LOG_MIN));
const fromLog   = (t: number) => Math.round(Math.exp(Math.log(LOG_MIN) + t * (Math.log(LOG_MAX) - Math.log(LOG_MIN))));
const fmtBudget = (v: number) =>
  v >= 100000 ? `₹${(v / 100000).toFixed(v % 100000 === 0 ? 0 : 1)}L` : `₹${(v / 1000).toFixed(0)}k`;

function BudgetSlider({ min, max, onMin, onMax }: {
  min: number; max: number; onMin: (v: number) => void; onMax: (v: number) => void;
}) {
  const railRef  = useRef<HTMLDivElement>(null);
  const leftPct  = toLog(min) * 100;
  const rightPct = toLog(max) * 100;

  const startDrag = (side: "min" | "max") => (e: React.MouseEvent) => {
    e.preventDefault();
    const startX   = e.clientX;
    const railW    = railRef.current?.clientWidth || 400;
    const startPct = side === "min" ? leftPct : rightPct;
    const onMove   = (me: MouseEvent) => {
      const delta  = ((me.clientX - startX) / railW) * 100;
      const newPct = Math.max(0, Math.min(100, startPct + delta));
      const newVal = fromLog(newPct / 100);
      if (side === "min" && newVal < max - 5000) onMin(newVal);
      if (side === "max" && newVal > min + 5000) onMax(newVal);
    };
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="w-full select-none">
      <div className="flex justify-between items-end mb-6">
        <div>
          <div className="text-[9px] text-[#0F2747]/30 uppercase tracking-widest mb-1">Minimum</div>
          <div className="text-3xl font-serif text-[#0F2747]">{fmtBudget(min)}</div>
        </div>
        <div className="text-[#0F2747]/15 text-xl pb-1">—</div>
        <div className="text-right">
          <div className="text-[9px] text-[#0F2747]/30 uppercase tracking-widest mb-1">Maximum</div>
          <div className="text-3xl font-serif text-[#0F2747]">{fmtBudget(max)}</div>
        </div>
      </div>
      <div ref={railRef} className="relative h-2 rounded-full bg-[#0F2747]/8">
        <div className="absolute h-full rounded-full bg-gradient-to-r from-[#FF8A3D] to-[#CFA86E]"
          style={{ left: `${leftPct}%`, right: `${100 - rightPct}%` }} />
        <div onMouseDown={startDrag("min")}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-white rounded-full border-2 border-[#FF8A3D] shadow-[0_2px_8px_rgba(255,138,61,0.3)] cursor-grab active:cursor-grabbing hover:scale-110 transition-transform z-10"
          style={{ left: `${leftPct}%` }} />
        <div onMouseDown={startDrag("max")}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-white rounded-full border-2 border-[#CFA86E] shadow-[0_2px_8px_rgba(207,168,110,0.3)] cursor-grab active:cursor-grabbing hover:scale-110 transition-transform z-10"
          style={{ left: `${rightPct}%` }} />
      </div>
      <div className="flex justify-between mt-3">
        <span className="text-[10px] text-[#0F2747]/20 tracking-widest">₹5k</span>
        <span className="text-[10px] text-[#0F2747]/20 tracking-widest">₹10L</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StepBadge({ n, done, active }: { n: number; done: boolean; active: boolean }) {
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
      done  ? "bg-[#0F2747] border-2 border-[#0F2747]"
      : active ? "bg-white border-2 border-[#0F2747]/30 shadow-sm"
      :          "bg-transparent border-2 border-[#0F2747]/12"
    }`}>
      {done
        ? <CheckCircle2 size={16} className="text-white" strokeWidth={2.5} />
        : <span className={`text-[13px] font-bold ${active ? "text-[#0F2747]" : "text-[#0F2747]/20"}`}>{n}</span>
      }
    </div>
  );
}

function StepConnector({ done, n = 0 }: { done: boolean; n?: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 20 }}
      transition={{ delay: 0.5 + n * 0.1 + 0.05, duration: 0.3 }}
      className="flex ml-[15px] my-0.5"
    >
      <div className="w-0.5 h-full rounded-full transition-colors duration-500"
        style={{ background: done ? "rgba(15,39,71,0.22)" : "rgba(15,39,71,0.07)" }} />
    </motion.div>
  );
}

interface StepBlockProps {
  n: number; tag: string; done: boolean; active: boolean;
  summary: string; onEdit: () => void; children: React.ReactNode;
}
function StepBlock({ n, tag, done, active, summary, onEdit, children }: StepBlockProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 + n * 0.1, duration: 0.5, ease: "easeOut" }}
    >
      <div className="flex items-center gap-3 cursor-pointer group" onClick={onEdit}>
        <StepBadge n={n} done={done} active={active} />
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <span className={`text-[11.5px] font-bold uppercase tracking-[0.28em] flex-shrink-0 transition-colors ${
            active ? "text-[#0F2747]/55" : done ? "text-[#0F2747]/35" : "text-[#0F2747]/18"
          }`}>{tag}</span>
          {!active && summary && (
            <span className="text-[15px] text-[#0F2747]/38 font-medium truncate">{summary}</span>
          )}
        </div>
        {!active && (
          <span className="opacity-0 group-hover:opacity-100 text-[10px] font-bold uppercase tracking-widest text-[#0F2747]/25 hover:text-[#0F2747]/50 transition-all flex-shrink-0">
            Edit
          </span>
        )}
      </div>
      <AnimatePresence initial={false}>
        {active && (
          <motion.div key="content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden" style={{ paddingLeft: 44 }}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ContinueBtn({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <div className="mt-8 flex justify-end">
      <button onClick={onClick} disabled={!enabled}
        className={`flex items-center gap-2 px-7 py-3 rounded-full font-bold text-[13px] tracking-wide transition-all duration-200 ${
          enabled
            ? "bg-[#0F2747] text-white shadow-[0_4px_20px_rgba(15,39,71,0.18)] hover:shadow-[0_6px_28px_rgba(15,39,71,0.25)] hover:-translate-y-0.5"
            : "bg-[#0F2747]/5 text-[#0F2747]/18 cursor-not-allowed"
        }`}>
        Continue <ArrowRight size={14} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

interface JourneyBriefingProps {
  onLaunch: (brief: TripBrief) => void;
}

export default function JourneyBriefing({ onLaunch }: JourneyBriefingProps) {
  const [brief,      setBrief]      = useState<TripBrief>(DEFAULT_BRIEF);
  const [launching,  setLaunching]  = useState(false);
  const [destInputs, setDestInputs] = useState<{ id: string, value: string }[]>([{ id: crypto.randomUUID(), value: "" }]);
  const [activeStep, setActiveStep] = useState(0);

  const destRefs  = useRef<(HTMLInputElement | null)[]>([]);
  const originRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Persistence ────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) {
        const p = JSON.parse(s) as TripBrief;
        setBrief(p);
        setDestInputs(p.destinations.length ? p.destinations.map(d => ({ id: crypto.randomUUID(), value: d })) : [{ id: crypto.randomUUID(), value: "" }]);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(brief)); } catch {}
  }, [brief]);

  const update = useCallback(<K extends keyof TripBrief>(k: K, v: TripBrief[K]) =>
    setBrief(prev => ({ ...prev, [k]: v })), []);

  // ── Destinations ───────────────────────────────────────────────────────────
  const filledDests = destInputs.map(d => d.value).filter(d => d.trim().length > 0);

  const updateDest = (i: number, v: string) => {
    const n = [...destInputs]; n[i].value = v; setDestInputs(n);
    update("destinations", n.map(d => d.value).filter(d => d.trim().length > 0));
  };
  const addDest = () => {
    setDestInputs(p => [...p, { id: crypto.randomUUID(), value: "" }]);
    setTimeout(() => destRefs.current[destInputs.length]?.focus(), 80);
  };
  const removeDest = (i: number) => {
    if (destInputs.length <= 1) { setDestInputs([{ id: crypto.randomUUID(), value: "" }]); update("destinations", []); return; }
    const n = destInputs.filter((_, j) => j !== i);
    setDestInputs(n);
    update("destinations", n.map(d => d.value).filter(d => d.trim().length > 0));
  };

  const togglePref = (id: string) => {
    // Conflict guard: "no_flights" + "flights" transport are mutually exclusive
    if (id === "no_flights" && brief.transport_mode === "flights") return; // silently block
    update("advanced", { ...brief.advanced, [id]: !brief.advanced[id] });
  };

  // ── Transport helpers ──────────────────────────────────────────────────────
  const activeMode   = TRANSPORT_MODES.find(m => m.id === brief.transport_mode) ?? TRANSPORT_MODES[0];
  const classOptions = activeMode.hasClass ? TRANSPORT_CLASSES[brief.transport_mode] ?? [] : [];

  const setTransportMode = (id: string) => {
    update("transport_mode", id);
    update("transport_class", ""); // reset class when mode changes
    // Auto-remove conflicting "no_flights" preference if user picks flights
    if (id === "flights" && brief.advanced["no_flights"]) {
      update("advanced", { ...brief.advanced, no_flights: false });
    }
  };

  // ── Readiness ──────────────────────────────────────────────────────────────
  const checks = {
    destination: filledDests.length > 0,
    origin:      brief.origin.trim().length > 0,
    month:       brief.month !== "",
    pace:        brief.pace !== "",
  };
  const pct       = Math.round((Object.values(checks).filter(Boolean).length / 4) * 100);
  const canLaunch = Object.values(checks).every(Boolean);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goStep = (s: number) => {
    setActiveStep(s);
    setTimeout(() => {
      document.getElementById(`step-${s}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  // ── Launch ─────────────────────────────────────────────────────────────────
  const handleLaunch = () => {
    if (!canLaunch || launching) return;
    setLaunching(true);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    onLaunch({ ...brief, destinations: filledDests });
  };

  // ── Summary texts ──────────────────────────────────────────────────────────
  const destSummary = filledDests.join(" → ");
  const overviewSummary = [brief.origin || "—", brief.month || "—", `${brief.duration_days} nights`].join("  ·  ");
  const travellerSummary = brief.traveller_type + (
    (brief.traveller_type === "Family" || brief.traveller_type === "Group") ? ` · ${brief.traveller_count} people` : ""
  );
  const transportSummary = activeMode.label + (brief.transport_class
    ? ` · ${classOptions.find(c => c.id === brief.transport_class)?.label ?? ""}` : "");
  const budgetSummary  = `${fmtBudget(brief.budget_min)} – ${fmtBudget(brief.budget_max)}`;
  const prefSummary    = Object.entries(brief.advanced).filter(([,v]) => v).map(([k]) => k.replace(/_/g," ")).join(", ") || "Optional — skip if none";

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-screen flex flex-col overflow-hidden font-sans"
      style={{ background: "var(--color-warm-cream)" }}>

      {/* Dot-grid background */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: "radial-gradient(rgba(15,39,71,0.042) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />

      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <div className="relative z-20 flex-shrink-0 flex items-center justify-between px-8 py-3.5 border-b border-[#0F2747]/[0.05] bg-[var(--color-warm-cream)]/80 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#0F2747] flex items-center justify-center shadow-sm">
            <Navigation size={13} className="text-white" />
          </div>
          <span className="text-[9px] font-bold tracking-[0.26em] uppercase text-[#0F2747]/35">Expedition Planner</span>
        </div>

        <div className="flex items-center gap-2">
          {([
            { k: "destination" as const, label: "Destination" },
            { k: "origin"      as const, label: "Origin"      },
            { k: "month"       as const, label: "Month"       },
            { k: "pace"        as const, label: "Pace"        },
          ]).map(c => (
            <div key={c.k} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8.5px] font-bold uppercase tracking-wider transition-all duration-300 ${
              checks[c.k]
                ? "bg-emerald-50 text-emerald-600 border border-emerald-200/70"
                : "bg-[#0F2747]/[0.035] text-[#0F2747]/22 border border-[#0F2747]/[0.065]"
            }`}>
              {checks[c.k] && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />}
              {c.label}
            </div>
          ))}
          <div className="flex items-center gap-2 ml-2 px-3 py-1.5 bg-white/65 border border-[#0F2747]/[0.07] rounded-full shadow-sm">
            <div className="relative w-14 h-1 rounded-full bg-[#0F2747]/10">
              <motion.div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#FF8A3D] to-[#CFA86E]"
                animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
            </div>
            <span className="text-[10px] font-bold text-[#0F2747]/45">{pct}%</span>
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE FORM ──────────────────────────────────────────────── */}
      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 pt-10 pb-20">

          {/* Page title */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Sparkles size={10} className="text-[#FF8A3D]" />
              <span className="text-[8px] font-bold uppercase tracking-[0.35em] text-[#0F2747]/30">Configure Expedition</span>
            </div>
            <h1 className="text-[3.25rem] font-serif text-[#0F2747] leading-[1.12] tracking-tight">
              Build your<br />
              <em className="font-light text-[#CFA86E] not-italic">dream journey.</em>
            </h1>
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* STEP 1 — ROUTE                                               */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div id="step-0">
            <StepBlock n={1} tag="ROUTE" done={checks.destination && checks.origin}
              active={activeStep === 0} summary={destSummary} onEdit={() => goStep(0)}>
              <div className="pt-6 pb-2">
                <h2 className="text-[1.55rem] font-serif text-[#0F2747] leading-tight mb-1.5">Where are you starting and heading to?</h2>
                <p className="text-[12.5px] text-[#0F2747]/40 mb-7 leading-relaxed">Set your starting point and add one or more destinations.</p>

                {/* Starting Point */}
                <div className="mb-6">
                  <label className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#0F2747]/28 mb-2.5 block">Starting Point (Origin)</label>
                  <LocationAutocomplete
                    inputRef={originRef}
                    value={brief.origin}
                    onChange={v => update("origin", v)}
                    placeholder="Your departure city…"
                    icon={<Compass size={14} className="text-[#14B8A6] flex-shrink-0" />}
                  />
                </div>

                {/* Destinations */}
                <div className="mb-2.5">
                  <label className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#0F2747]/28 mb-2.5 block">Destinations</label>
                </div>
                <div className="space-y-2.5">
                  <AnimatePresence>
                    {destInputs.map((item, idx) => (
                      <motion.div key={item.id}
                        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6, height: 0 }} transition={{ duration: 0.18 }}
                        className="group">
                        <LocationAutocomplete
                          inputRef={el => { destRefs.current[idx] = el; }}
                          value={item.value}
                          onChange={v => updateDest(idx, v)}
                          onEnter={addDest}
                          onBackspaceEmpty={idx > 0 ? () => removeDest(idx) : undefined}
                          placeholder={idx === 0 ? "e.g. Srinagar" : "Add another city…"}
                          icon={<MapPin size={14} className="text-[#FF8A3D] flex-shrink-0" />}
                          actionButton={
                            destInputs.length > 1 ? (
                              <button onClick={() => removeDest(idx)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 rounded-full hover:bg-[#0F2747]/5 flex items-center justify-center">
                                <X size={10} className="text-[#0F2747]/30" />
                              </button>
                            ) : undefined
                          }
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <button onClick={addDest}
                  className="mt-3.5 flex items-center gap-2 text-[#FF8A3D]/45 hover:text-[#FF8A3D] text-[10.5px] font-bold uppercase tracking-[0.2em] transition-colors">
                  <div className="w-4 h-4 rounded-full border border-current flex items-center justify-center"><Plus size={8} /></div>
                  Add Destination
                </button>

                {/* Route preview */}
                <AnimatePresence>
                  {filledDests.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="mt-7 pt-5 border-t border-[#0F2747]/[0.055]">
                      <div className="text-[8.5px] font-bold uppercase tracking-[0.26em] text-[#0F2747]/25 mb-3">Your Route</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {filledDests.map((d, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="px-3.5 py-1.5 bg-[#0F2747] text-white text-[11px] font-bold rounded-full tracking-wide shadow-sm">{d}</span>
                            {i < filledDests.length - 1 && <ArrowRight size={10} className="text-[#0F2747]/20" />}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <ContinueBtn enabled={filledDests.length > 0 && brief.origin.trim().length > 0} onClick={() => { if (filledDests.length > 0 && brief.origin.trim().length > 0) goStep(1); }} />
              </div>
            </StepBlock>
          </div>

          <StepConnector done={checks.destination && checks.origin} n={1} />

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* STEP 2 — JOURNEY OVERVIEW                                    */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div id="step-1">
            <StepBlock n={2} tag="JOURNEY OVERVIEW" done={checks.month}
              active={activeStep === 1} summary={overviewSummary} onEdit={() => goStep(1)}>
              <div className="pt-6 pb-2">
                <h2 className="text-[1.55rem] font-serif text-[#0F2747] leading-tight mb-1.5">When are you travelling?</h2>
                <p className="text-[12.5px] text-[#0F2747]/40 mb-7 leading-relaxed">Set your preferred month and how long you&apos;d like to travel.</p>

                {/* Month + Duration */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#0F2747]/28 mb-2.5 block">Travel Month</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {MONTHS_SHORT.map((m, i) => (
                        <button key={m} onClick={() => update("month", brief.month === MONTHS_FULL[i] ? "" : MONTHS_FULL[i])}
                          className={`py-2 text-[10px] font-semibold rounded-xl transition-all ${
                            brief.month === MONTHS_FULL[i]
                              ? "bg-[#CFA86E] text-white shadow-sm"
                              : "text-[#0F2747]/38 hover:text-[#0F2747]/65 hover:bg-[#0F2747]/[0.04]"
                          }`}>{m}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#0F2747]/28 mb-2.5 block">Duration</label>
                    <div className="flex flex-col items-center justify-center gap-3 py-2">
                      <button onClick={() => update("duration_days", Math.min(60, brief.duration_days + 1))}
                        className="w-10 h-10 rounded-xl bg-[#0F2747]/[0.04] border border-[#0F2747]/[0.08] text-[#0F2747]/45 hover:text-[#0F2747] hover:bg-[#0F2747]/[0.07] flex items-center justify-center text-xl font-light transition-all">+</button>
                      <div className="text-center">
                        <div className="text-[2.4rem] font-serif text-[#0F2747] leading-none">{brief.duration_days}</div>
                        <div className="text-[9px] text-[#0F2747]/28 uppercase tracking-widest mt-1">nights</div>
                      </div>
                      <button onClick={() => update("duration_days", Math.max(1, brief.duration_days - 1))}
                        className="w-10 h-10 rounded-xl bg-[#0F2747]/[0.04] border border-[#0F2747]/[0.08] text-[#0F2747]/45 hover:text-[#0F2747] hover:bg-[#0F2747]/[0.07] flex items-center justify-center text-xl font-light transition-all">−</button>
                    </div>
                  </div>
                </div>

                <ContinueBtn enabled={checks.origin && checks.month} onClick={() => { if (checks.origin && checks.month) goStep(2); }} />
              </div>
            </StepBlock>
          </div>

          <StepConnector done={checks.origin && checks.month} n={2} />

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* STEP 3 — TRAVELLERS                                          */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div id="step-2">
            <StepBlock n={3} tag="TRAVELLERS" done={activeStep > 2}
              active={activeStep === 2} summary={travellerSummary} onEdit={() => goStep(2)}>
              <div className="pt-6 pb-2">
                <h2 className="text-[1.55rem] font-serif text-[#0F2747] leading-tight mb-1.5">Who&apos;s travelling?</h2>
                <p className="text-[12.5px] text-[#0F2747]/40 mb-7 leading-relaxed">Select your group type — this shapes accommodation and activity planning.</p>

                <div className="grid grid-cols-4 gap-2.5 mb-5">
                  {TRAVELLER_TYPES.map(t => {
                    const on = brief.traveller_type === t.id;
                    return (
                      <button key={t.id} onClick={() => {
                        update("traveller_type", t.id);
                        if (t.id === "Solo")        update("traveller_count", 1);
                        else if (t.id === "Couple") update("traveller_count", 2);
                        else if (brief.traveller_count < 3) update("traveller_count", t.defaultCount);
                      }}
                        className={`py-4 px-2 rounded-2xl border text-center transition-all duration-200 ${
                          on ? "border-[#0F2747]/15 bg-white shadow-[0_4px_20px_rgba(15,39,71,0.07)]"
                             : "border-[#0F2747]/[0.065] hover:border-[#0F2747]/12 hover:bg-[#0F2747]/[0.02]"
                        }`}>
                        <div className={`text-[12.5px] font-bold mb-0.5 ${on ? "text-[#0F2747]" : "text-[#0F2747]/30"}`}>{t.label}</div>
                        <div className={`text-[10px] ${on ? "text-[#0F2747]/40" : "text-[#0F2747]/16"}`}>{t.desc}</div>
                        {on && <motion.div layoutId="traveller-dot" className="w-1.5 h-1.5 rounded-full bg-[#CFA86E] mx-auto mt-2" />}
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence>
                  {(brief.traveller_type === "Family" || brief.traveller_type === "Group") && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="flex items-center gap-5 pt-3 pb-1 border-t border-[#0F2747]/[0.05] mt-1">
                        <span className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-[#0F2747]/32">Number of Travellers</span>
                        <div className="flex items-center gap-3 ml-auto">
                          <button onClick={() => update("traveller_count", Math.max(3, brief.traveller_count - 1))}
                            className="w-9 h-9 rounded-xl bg-[#0F2747]/[0.04] border border-[#0F2747]/[0.08] text-[#0F2747]/45 hover:text-[#0F2747] flex items-center justify-center text-lg font-light transition-all">−</button>
                          <span className="text-[1.6rem] font-serif text-[#0F2747] w-8 text-center">{brief.traveller_count}</span>
                          <button onClick={() => update("traveller_count", Math.min(20, brief.traveller_count + 1))}
                            className="w-9 h-9 rounded-xl bg-[#0F2747]/[0.04] border border-[#0F2747]/[0.08] text-[#0F2747]/45 hover:text-[#0F2747] flex items-center justify-center text-lg font-light transition-all">+</button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <ContinueBtn enabled={true} onClick={() => goStep(3)} />
              </div>
            </StepBlock>
          </div>

          <StepConnector done={activeStep > 2} n={3} />

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* STEP 4 — TRAVEL STYLE (Pace)                                 */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div id="step-3">
            <StepBlock n={4} tag="TRAVEL STYLE" done={checks.pace}
              active={activeStep === 3} summary={brief.pace} onEdit={() => goStep(3)}>
              <div className="pt-6 pb-2">
                <h2 className="text-[1.55rem] font-serif text-[#0F2747] leading-tight mb-1.5">What&apos;s your travel pace?</h2>
                <p className="text-[12.5px] text-[#0F2747]/40 mb-7 leading-relaxed">This shapes how the AI structures every day of your expedition.</p>

                <div className="grid grid-cols-3 gap-3">
                  {PACE_OPTIONS.map(p => {
                    const on = brief.pace === p.id;
                    return (
                      <button key={p.id} onClick={() => update("pace", brief.pace === p.id ? "" : p.id)}
                        className={`relative p-5 rounded-2xl border text-left transition-all duration-250 ${
                          on ? "shadow-[0_6px_28px_rgba(15,39,71,0.09)]" : "border-[#0F2747]/[0.065] hover:border-[#0F2747]/14 hover:shadow-sm"
                        }`} style={on ? { background: p.bg, borderColor: p.border } : {}}>
                        {on && (
                          <div className="absolute top-3.5 right-3.5 w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ background: p.accent }}>
                            <CheckCircle2 size={10} className="text-white" strokeWidth={2.5} />
                          </div>
                        )}
                        <div className="font-bold text-[15px] mb-0.5" style={{ color: on ? p.accent : "#0F2747", opacity: on ? 1 : 0.38 }}>{p.label}</div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.2em] mb-4" style={{ color: on ? p.accent : "#0F2747", opacity: on ? 0.55 : 0.2 }}>{p.subtitle}</div>
                        <div className="text-[11px] leading-relaxed text-[#0F2747]/48">{p.desc}</div>
                      </button>
                    );
                  })}
                </div>

                <ContinueBtn enabled={checks.pace} onClick={() => { if (checks.pace) goStep(4); }} />
              </div>
            </StepBlock>
          </div>

          <StepConnector done={checks.pace} n={4} />

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* STEP 5 — TRANSPORT PREFERENCE (NEW)                          */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div id="step-4">
            <StepBlock n={5} tag="HOW WOULD YOU LIKE TO TRAVEL" done={activeStep > 4}
              active={activeStep === 4} summary={transportSummary} onEdit={() => goStep(4)}>
              <div className="pt-6 pb-2">
                <h2 className="text-[1.55rem] font-serif text-[#0F2747] leading-tight mb-1.5">How would you like to travel?</h2>
                <p className="text-[12.5px] text-[#0F2747]/40 mb-7 leading-relaxed">
                  Your preferred mode of transport shapes routes, scheduling, and accommodation placement.
                </p>

                {/* Transport mode cards */}
                <div className="space-y-2.5">
                  {TRANSPORT_MODES.map(mode => {
                    const on = brief.transport_mode === mode.id;
                    const ModeIcon = mode.Icon;
                    return (
                      <button key={mode.id} onClick={() => setTransportMode(mode.id)}
                        className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border text-left transition-all duration-200 ${
                          on ? "shadow-[0_4px_20px_rgba(15,39,71,0.08)]" : "border-[#0F2747]/[0.065] hover:border-[#0F2747]/14 hover:bg-[#0F2747]/[0.015]"
                        }`} style={on ? { background: mode.bg, borderColor: mode.border } : {}}>
                        {/* Icon */}
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
                          style={{ background: on ? mode.accent + "20" : "rgba(15,39,71,0.04)", color: on ? mode.accent : "rgba(15,39,71,0.3)" }}>
                          <ModeIcon size={18} />
                        </div>
                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-[13.5px] mb-0.5" style={{ color: on ? mode.accent : "#0F2747", opacity: on ? 1 : 0.45 }}>
                            {mode.label}
                          </div>
                          <div className="text-[11px] text-[#0F2747]/40 leading-snug">{mode.desc}</div>
                        </div>
                        {/* Selected dot */}
                        {on && (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: mode.accent }}>
                            <CheckCircle2 size={11} className="text-white" strokeWidth={2.5} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Transport class — conditional reveal */}
                <AnimatePresence>
                  {activeMode.hasClass && classOptions.length > 0 && (
                    <motion.div
                      key={brief.transport_mode}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden">
                      <div className="mt-6 pt-5 border-t border-[#0F2747]/[0.06]">
                        <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-[#0F2747]/30 mb-3">
                          {brief.transport_mode === "flights" ? "Flight Class"
                           : brief.transport_mode === "train"  ? "Train Class"
                           : brief.transport_mode === "road_trip" ? "Vehicle Type"
                           : "Comfort Level"}
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          {classOptions.map(cls => {
                            const on = brief.transport_class === cls.id;
                            return (
                              <button key={cls.id}
                                onClick={() => update("transport_class", brief.transport_class === cls.id ? "" : cls.id)}
                                className={`p-3.5 rounded-xl border text-left transition-all ${
                                  on
                                    ? "border-[#0F2747]/18 bg-white shadow-sm"
                                    : "border-[#0F2747]/[0.065] hover:border-[#0F2747]/12 hover:bg-[#0F2747]/[0.02]"
                                }`}>
                                <div className="flex items-center gap-2 mb-0.5">
                                  {on && <div className="w-1.5 h-1.5 rounded-full bg-[#CFA86E] flex-shrink-0" />}
                                  <span className={`text-[12px] font-bold ${on ? "text-[#0F2747]" : "text-[#0F2747]/35"}`}>{cls.label}</span>
                                </div>
                                <div className={`text-[10px] ml-${on ? "3.5" : "0"} ${on ? "text-[#0F2747]/45" : "text-[#0F2747]/22"}`}>{cls.desc}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <ContinueBtn enabled={true} onClick={() => goStep(5)} />
              </div>
            </StepBlock>
          </div>

          <StepConnector done={activeStep > 4} n={5} />

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* STEP 6 — BUDGET (full width)                                 */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div id="step-5">
            <StepBlock n={6} tag="BUDGET" done={activeStep > 5}
              active={activeStep === 5} summary={budgetSummary} onEdit={() => goStep(5)}>
              <div className="pt-6 pb-2">
                <h2 className="text-[1.55rem] font-serif text-[#0F2747] leading-tight mb-1.5">What&apos;s your budget range?</h2>
                <p className="text-[12.5px] text-[#0F2747]/40 mb-8 leading-relaxed">
                  Per person total budget in Indian Rupees, including accommodation, travel and activities.
                </p>
                <BudgetSlider min={brief.budget_min} max={brief.budget_max}
                  onMin={v => update("budget_min", v)} onMax={v => update("budget_max", v)} />
                <ContinueBtn enabled={true} onClick={() => goStep(6)} />
              </div>
            </StepBlock>
          </div>

          <StepConnector done={activeStep > 5} n={6} />

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* STEP 7 — PREFERENCES                                         */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div id="step-6">
            <StepBlock n={7} tag="PREFERENCES" done={Object.values(brief.advanced).some(Boolean)}
              active={activeStep === 6} summary={prefSummary} onEdit={() => goStep(6)}>
              <div className="pt-6 pb-2">
                <h2 className="text-[1.55rem] font-serif text-[#0F2747] leading-tight mb-1.5">Any special preferences?</h2>
                <p className="text-[12.5px] text-[#0F2747]/40 mb-7 leading-relaxed">Optional — helps the AI personalise your expedition further.</p>
                <div className="grid grid-cols-4 gap-2.5">
                  {PREFERENCES.map(({ id, label, Icon }) => {
                    const on = !!brief.advanced[id];
                    // "No Flights" is incompatible with "Flights Preferred" transport
                    const isConflict = id === "no_flights" && brief.transport_mode === "flights";
                    return (
                      <button key={id}
                        onClick={() => togglePref(id)}
                        disabled={isConflict}
                        title={isConflict ? "Cannot select No Flights when Flights Preferred is your transport mode" : undefined}
                        className={`flex flex-col items-center gap-2 py-4 px-2 rounded-2xl border text-center transition-all ${
                          isConflict
                            ? "border-[#0F2747]/[0.04] text-[#0F2747]/15 cursor-not-allowed opacity-40"
                            : on
                            ? "border-[#CFA86E]/35 bg-[#CFA86E]/[0.06] text-[#CFA86E]"
                            : "border-[#0F2747]/[0.065] text-[#0F2747]/28 hover:border-[#0F2747]/14 hover:text-[#0F2747]/52"
                        }`}>
                        <Icon size={16} />
                        <span className="text-[10px] font-semibold leading-tight">{label}</span>
                        {isConflict && <span className="text-[8.5px] text-[#0F2747]/25 leading-tight">conflicts with transport</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </StepBlock>
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* LAUNCH CTA                                                   */}
          {/* ══════════════════════════════════════════════════════════════ */}
          <div className="pt-12">
            <motion.button onClick={handleLaunch} disabled={!canLaunch || launching}
              whileHover={canLaunch && !launching ? { scale: 1.018, y: -2 } : {}}
              whileTap={canLaunch  && !launching ? { scale: 0.985 } : {}}
              className={`w-full py-5 rounded-2xl font-bold text-[13.5px] tracking-[0.1em] uppercase flex items-center justify-center gap-3 transition-all duration-200 ${
                canLaunch && !launching
                  ? "bg-[#0F2747] text-white shadow-[0_8px_36px_rgba(15,39,71,0.22)] hover:shadow-[0_12px_44px_rgba(15,39,71,0.28)]"
                  : "bg-[#0F2747]/[0.04] text-[#0F2747]/18 border border-[#0F2747]/[0.055] cursor-not-allowed"
              }`}>
              {launching ? (
                <>
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                  Assembling Expedition…
                </>
              ) : (
                <>
                  <Navigation size={15} />
                  Assemble Expedition
                  <ArrowRight size={13} className="opacity-45" />
                </>
              )}
            </motion.button>
            {!canLaunch && (
              <p className="text-center text-[10px] text-[#0F2747]/22 mt-3 tracking-wide leading-relaxed">
                Complete destination, origin, travel month &amp; travel style to launch
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
