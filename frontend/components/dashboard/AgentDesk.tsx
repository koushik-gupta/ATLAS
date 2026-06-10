"use client";

import { useState } from "react";
import { API_URL } from "@/lib/config";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Zap, Coffee, Layers } from "lucide-react";
import MorphingInput from "./MorphingInput";
import type { AppState } from "@/app/page";
import type { AgentEvent } from "@/hooks/useAgentStream";

interface AgentDeskProps {
  planningState: AppState;
  query: string;
  setQuery: (q: string) => void;
  sessionId?: string | null;
  events: AgentEvent[];
  statusMessage: string;
  currentQuestion?: string | null;
  currentPlaceholder?: string | null;
  currentQuestionType?: string | null;
  submitAnswer?: (ans: string) => void;
}

// ── Pacing Choice Component ────────────────────────────────────────────────────
const PACING_OPTIONS = [
  {
    id: "Relaxed",
    label: "Relaxed",
    desc: "Slow pace, deep immersion",
    icon: Coffee,
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200 hover:bg-emerald-100",
    active: "bg-emerald-500 border-emerald-500 text-white shadow-[0_4px_16px_rgba(16,185,129,0.3)]",
  },
  {
    id: "Moderate",
    label: "Moderate",
    desc: "Balanced — best of both",
    icon: Layers,
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200 hover:bg-blue-100",
    active: "bg-blue-600 border-blue-600 text-white shadow-[0_4px_16px_rgba(37,99,235,0.3)]",
  },
  {
    id: "Packed",
    label: "Packed",
    desc: "Fast pace, see everything",
    icon: Zap,
    color: "text-orange-700",
    bg: "bg-orange-50 border-orange-200 hover:bg-orange-100",
    active: "bg-[var(--color-sunset-orange)] border-[var(--color-sunset-orange)] text-white shadow-[0_4px_16px_rgba(255,138,61,0.3)]",
  },
];

function PacingChoice({ onSelect }: { onSelect: (pace: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);

  const handlePick = (id: string) => {
    setSelected(id);
    setTimeout(() => onSelect(id), 320); // small delay for visual feedback
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2 mb-4"
    >
      <p className="text-[10px] uppercase tracking-widest text-[var(--color-deep-ocean)]/40 font-bold mb-1">
        Choose your travel pace
      </p>
      {PACING_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const isActive = selected === opt.id;
        return (
          <motion.button
            key={opt.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => handlePick(opt.id)}
            className={[
              "flex items-center gap-3 w-full px-4 py-3 rounded-xl border transition-all duration-200 text-left",
              isActive ? opt.active : `${opt.bg} ${opt.color}`,
            ].join(" ")}
          >
            <Icon size={16} strokeWidth={2.2} className="flex-shrink-0" />
            <div>
              <div className={`text-sm font-bold leading-tight ${isActive ? "text-white" : ""}`}>
                {opt.label}
              </div>
              <div className={`text-[11px] leading-tight ${isActive ? "text-white/80" : "opacity-60"}`}>
                {opt.desc}
              </div>
            </div>
            {isActive && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="ml-auto w-4 h-4 rounded-full bg-white/30 flex items-center justify-center"
              >
                <div className="w-2 h-2 rounded-full bg-white" />
              </motion.div>
            )}
          </motion.button>
        );
      })}
    </motion.div>
  );
}

// ── Truncate event text to keep the feed compact ──────────────────────────────
function truncate(rawText: string, max = 52): string {
  if (!rawText) return "";
  let text = rawText.replace(/<[^>]*>?/gm, ' ');
  text = text.replace(/â€”/g, '—').replace(/â€"/g, '–').replace(/â€™/g, "'").replace(/â€œ/g, '"').replace(/â€ /g, '"');
  text = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{FE0F}⚠️✅]/gu, "");
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AgentDesk({
  planningState,
  query,
  setQuery,
  sessionId,
  events,
  statusMessage,
  currentQuestion,
  currentPlaceholder,
  currentQuestionType,
  submitAnswer,
}: AgentDeskProps) {
  const [isFeedExpanded, setIsFeedExpanded] = useState<boolean>(true);

  const handleFeedbackSubmit = async () => {
    if (!query.trim() || !sessionId) return;
    const currentQuery = query;
    setQuery("");

    if (currentQuestion && submitAnswer) {
      submitAnswer(currentQuery);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/plan/${sessionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: currentQuery }),
      });
      if (!res.ok) console.error("Failed to submit feedback");
    } catch (err) {
      console.error("Error submitting feedback:", err);
    }
  };

  // Filter feed: hide long reasoning / system_event entries from left panel
  const feedEvents = events
    .filter((e) => {
      // Don't display raw system_events (they go to canvas instead)
      if (e.type === "system_event") return false;
      // Don't display destination_options (handled by tray)
      if (e.type === "destination_options") return false;
      return true;
    })
    .slice(-8); // only last 8 entries keep the feed compact

  return (
    <aside className="hidden md:flex w-[300px] flex-shrink-0 h-full bg-[var(--color-warm-cream)] flex-col border-r border-[var(--color-deep-ocean)]/10 shadow-[4px_0_24px_rgba(0,0,0,0.04)] z-20 relative">

      {/* 1. TOP: Compact Status Strip */}
      <div className="px-6 py-5 border-b border-[var(--color-deep-ocean)]/5 bg-white/40 backdrop-blur-md z-20 flex flex-col gap-1">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-deep-ocean)]/40 font-semibold mb-1">Live Agent Desk</h2>
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-3 h-3">
            {planningState !== "completed" ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            )}
          </div>
          <span className="text-sm text-[var(--color-deep-ocean)]/90 font-medium tracking-wide line-clamp-1">
            {statusMessage}
          </span>
        </div>
      </div>

      {/* 2. MIDDLE: Live Agent Feed — compact, no system_events, truncated */}
      <div className="flex-1 overflow-y-auto no-scrollbar relative flex flex-col min-h-0">
        <div className="p-4 flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {(isFeedExpanded ? feedEvents : feedEvents.filter((e) => e.type === "trip_complete")).map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                className={`flex items-center gap-3 p-3 rounded-xl border border-[var(--color-deep-ocean)]/5 shadow-sm bg-white/60 backdrop-blur-sm ${
                  event.type === "trip_complete" && !isFeedExpanded
                    ? "bg-emerald-50/80 border-emerald-500/20 ring-1 ring-emerald-500/10"
                    : ""
                }`}
              >
                <div
                  className={`p-1.5 rounded-md flex-shrink-0 ${
                    event.type === "trip_complete"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : event.type === "chat_question"
                      ? "bg-amber-500/10 text-amber-600"
                      : "bg-blue-500/10 text-blue-600"
                  }`}
                >
                  <event.icon size={13} strokeWidth={2.5} />
                </div>
                <span
                  className={`text-[12px] tracking-wide font-medium leading-tight ${
                    event.type === "trip_complete" && !isFeedExpanded
                      ? "text-emerald-900"
                      : "text-[var(--color-deep-ocean)]/75"
                  }`}
                >
                  {event.type === "trip_complete" && !isFeedExpanded
                    ? "Trip Assembled"
                    : truncate(event.text)}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>

          {planningState === "completed" && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => setIsFeedExpanded(!isFeedExpanded)}
              className="mt-1 mx-auto flex items-center gap-1.5 text-xs text-[var(--color-deep-ocean)]/40 hover:text-[var(--color-deep-ocean)]/70 transition-colors py-1 px-3 rounded-full hover:bg-[var(--color-deep-ocean)]/5"
            >
              {isFeedExpanded ? (
                <><ChevronUp size={12} /> Hide History</>
              ) : (
                <><ChevronDown size={12} /> View Mission Log</>
              )}
            </motion.button>
          )}
        </div>
      </div>

      {/* 3. BOTTOM: Active Question or Refinement Input */}
      <div className="p-5 bg-white/40 backdrop-blur-md z-20 border-t border-[var(--color-deep-ocean)]/5 flex flex-col gap-3">
        <AnimatePresence mode="wait">
          {currentQuestion ? (
            <motion.div
              key="question-box"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {/* Question bubble */}
              <div className="mb-3 p-3.5 rounded-xl bg-[var(--color-deep-ocean)]/5 border border-[var(--color-deep-ocean)]/8">
                <div className="text-[10px] uppercase tracking-widest text-[var(--color-deep-ocean)]/45 font-bold mb-1.5">
                  Concierge asks:
                </div>
                <div className="text-[var(--color-deep-ocean)] font-medium text-[13px] leading-snug">
                  {currentQuestion}
                </div>
              </div>

              {/* Pacing: structured 3-button choice */}
              {currentQuestionType === "pacing" ? (
                <PacingChoice
                  onSelect={(pace) => {
                    if (submitAnswer) submitAnswer(pace);
                  }}
                />
              ) : (
                /* All other questions: regular text input */
                <MorphingInput
                  isExpanded={false}
                  onSubmit={handleFeedbackSubmit}
                  query={query}
                  setQuery={setQuery}
                  placeholder={currentPlaceholder || "Type your answer..."}
                />
              )}
            </motion.div>
          ) : planningState === "completed" ? (
            <motion.div key="completed-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="text-[11px] text-[var(--color-deep-ocean)]/40 leading-relaxed mb-3">
                Your expedition is assembled. Use the input below to refine your journey.
              </p>
              <MorphingInput
                isExpanded={false}
                onSubmit={handleFeedbackSubmit}
                query={query}
                setQuery={setQuery}
                placeholder="Refine the journey..."
              />
            </motion.div>
          ) : (
            <motion.div key="active-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="text-[11px] text-[var(--color-deep-ocean)]/35 leading-relaxed mb-3">
                Watch the workflow canvas as the AI builds your journey in real time.
              </p>
              <MorphingInput
                isExpanded={false}
                onSubmit={handleFeedbackSubmit}
                query={query}
                setQuery={setQuery}
                placeholder="Refine the journey..."
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
}
