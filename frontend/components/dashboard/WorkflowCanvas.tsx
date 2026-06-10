"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import {
  Compass, CheckCircle2, Cloud, Train, Home, Building2,
  Scissors, Sparkles, MessageSquare, Route, Layers, Clock,
  ZoomIn, Maximize2, Navigation, Radio, ChevronRight, Cpu,
  Star, Hotel, Anchor, Wind, Zap, Map as MapIcon,
  FileText, Moon, MapPin,
  type LucideIcon,
} from "lucide-react";
import type { AgentEvent, PlanningPhase, CuratedCity, ReviewRequest } from "@/hooks/useAgentStream";
import DestinationTray from "./DestinationTray";
import MorphingInput from "./MorphingInput";
import {
  useWorkflowGraph,
  computePhaseTimeline,
  computeEdgePath,
  AGENT_PALETTE,
  LANE_X, LANE_LABELS, LANE_SEP_X,
  NODE_W, NODE_H, CANVAS_W, CANVAS_H, LANE_TOP_Y,
  type WorkflowNode, type WorkflowEdge, type PhaseInfo, type RevealState,
} from "@/hooks/useWorkflowGraph";

// ── Review Card: floating overlay for pruning/weather decisions ─────────────────

interface ReviewCardProps {
  review: ReviewRequest;
  onApprove: (ans: string) => void;
}

const ReviewCard = memo(({ review, onApprove }: ReviewCardProps) => {
  const isPruning = review.type === "pruning_review";
  const [isAskingDates, setIsAskingDates] = useState(false);
  const [newDates, setNewDates] = useState("");

  const handleShiftToRecommended = () => {
    if (isPruning) {
      onApprove("yes");
    } else {
      setIsAskingDates(true);
    }
  };

  const handleConfirmDates = () => {
    if (newDates.trim()) {
      onApprove("yes::" + newDates.trim());
    } else {
      onApprove("yes");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: -16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -12 }}
      transition={{ type: "spring", stiffness: 340, damping: 28 }}
      className="absolute inset-x-0 top-16 z-50 flex justify-center pointer-events-none px-8"
    >
      <div className="pointer-events-auto max-w-lg w-full bg-white/95 backdrop-blur-xl rounded-2xl border border-[var(--color-deep-ocean)]/10 shadow-[0_20px_60px_rgba(15,39,71,0.18)] p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-xl ${
            isPruning ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
          }`}>
            {isPruning ? <Scissors size={18} /> : <Cloud size={18} />}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-deep-ocean)]/40 font-bold">
              {isPruning ? "Route Optimization Review" : "Weather Advisory"}
            </div>
            <div className="text-sm font-bold text-[var(--color-deep-ocean)] leading-tight">
              {review.title}
            </div>
          </div>
        </div>

        {isPruning ? (
          <div className="space-y-3 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-red-50/80 border border-red-100 rounded-xl p-3.5">
                <div className="text-[9px] uppercase tracking-widest text-red-500 font-bold mb-2.5 flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-400/30 flex items-center justify-center text-red-500">✕</span>
                  Removed
                </div>
                <div className="space-y-1.5">
                  {(review.removed || []).map((c, idx) => (
                    <div key={`${c}-${idx}`} className="flex items-center gap-2 text-[11.5px] text-red-600/70">
                      <span className="w-1 h-1 rounded-full bg-red-400/60 flex-shrink-0" />
                      <span className="line-through">{c}</span>
                    </div>
                  ))}
                  {(review.removed || []).length === 0 && <div className="text-[11px] text-red-400/60">None</div>}
                </div>
              </div>
              <div className="bg-emerald-50/80 border border-emerald-100 rounded-xl p-3.5">
                <div className="text-[9px] uppercase tracking-widest text-emerald-600 font-bold mb-2.5 flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-400/30 flex items-center justify-center text-emerald-600">✓</span>
                  Retained
                </div>
                <div className="space-y-1.5">
                  {(review.kept || []).map((c, idx) => (
                    <div key={`${c}-${idx}`} className="flex items-center gap-2 text-[11.5px] text-emerald-800 font-medium">
                      <span className="w-1 h-1 rounded-full bg-emerald-500/60 flex-shrink-0" />
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Impact indicator */}
            {(review.removed || []).length > 0 && (
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[var(--color-deep-ocean)]/4 rounded-xl border border-[var(--color-deep-ocean)]/6">
                <Route size={11} className="text-emerald-600 flex-shrink-0" />
                <span className="text-[10.5px] text-emerald-700 font-semibold">
                  Route efficiency improves with {(review.removed || []).length} fewer transit{(review.removed || []).length > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2.5 mb-4">
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-[var(--color-deep-ocean)]/40 w-28 shrink-0">Original dates</span>
              <span className="font-semibold text-[var(--color-deep-ocean)] line-through opacity-60">{review.original_dates}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-[var(--color-deep-ocean)]/40 w-28 shrink-0">Issue</span>
              <span className="text-amber-700 font-medium">{review.issue}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-[var(--color-deep-ocean)]/40 w-28 shrink-0">Recommended</span>
              <span className="font-bold text-emerald-700">{review.recommended_dates}</span>
            </div>
          </div>
        )}

        {review.reason && (
          <div className="max-h-28 overflow-y-auto mb-4 border-t border-[var(--color-deep-ocean)]/5 pt-3">
            <p className="text-[10.5px] text-[var(--color-deep-ocean)]/50 leading-relaxed">
              {review.reason}
            </p>
          </div>
        )}

        {/* Action buttons */}
        {isAskingDates ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 items-center mb-1">
              <span className="text-[11px] font-semibold text-[var(--color-deep-ocean)] uppercase tracking-wide">
                What new dates would you prefer?
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                placeholder="e.g., December or Next week"
                value={newDates}
                onChange={(e) => setNewDates(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmDates()}
                className="flex-1 px-3 py-2 bg-[var(--color-deep-ocean)]/5 border border-[var(--color-deep-ocean)]/10 rounded-xl text-[12px] font-medium text-[var(--color-deep-ocean)] placeholder-[var(--color-deep-ocean)]/40 focus:outline-none focus:ring-1 focus:ring-[var(--color-deep-ocean)]/20"
              />
              <button
                onClick={handleConfirmDates}
                className="px-4 py-2 bg-[var(--color-deep-ocean)] text-white text-[12px] font-bold rounded-xl hover:bg-[var(--color-deep-ocean)]/90 transition-all shadow-sm"
              >
                Confirm
              </button>
            </div>
            <button
              onClick={() => setIsAskingDates(false)}
              className="mt-1 text-[10px] text-[var(--color-deep-ocean)]/50 hover:text-[var(--color-deep-ocean)]/80 text-center transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleShiftToRecommended}
              className="flex-1 py-2.5 rounded-xl bg-[var(--color-deep-ocean)] text-white text-[12px] font-bold tracking-wide hover:bg-[var(--color-deep-ocean)]/90 transition-all duration-200 shadow-md active:scale-95"
            >
              {isPruning ? "Accept Optimization" : "Shift to Recommended"}
            </button>
            <button
              onClick={() => onApprove("no")}
              className="flex-1 py-2.5 rounded-xl border border-[var(--color-deep-ocean)]/12 text-[var(--color-deep-ocean)]/55 text-[12px] font-semibold tracking-wide hover:bg-[var(--color-deep-ocean)]/5 transition-all duration-200 active:scale-95"
            >
              {isPruning ? "Keep Original Plan" : "Keep My Dates"}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
});
ReviewCard.displayName = "ReviewCard";

// ── Expand Review Card: extra days available ──────────────────────────────────

interface ExpandReviewProps {
  estimatedDays: number;
  requestedDays: number;
  surplus: number;
  onApprove: (ans: string) => void;
}

const ExpandReviewCard = memo(({ estimatedDays, requestedDays, surplus, onApprove }: ExpandReviewProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -12 }}
      transition={{ type: "spring", stiffness: 340, damping: 28 }}
      className="absolute inset-x-0 top-16 z-50 flex justify-center pointer-events-none px-8"
    >
      <div className="pointer-events-auto max-w-sm w-full bg-white/95 backdrop-blur-xl rounded-2xl border border-[var(--color-deep-ocean)]/10 shadow-[0_20px_60px_rgba(15,39,71,0.18)] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
            <Clock size={18} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-deep-ocean)]/40 font-bold">Time Surplus Detected</div>
            <div className="text-sm font-bold text-[var(--color-deep-ocean)] leading-tight">Extra Time Available</div>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--color-deep-ocean)]/50">Cities need</span>
            <span className="font-semibold text-[var(--color-deep-ocean)]">{estimatedDays} nights</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--color-deep-ocean)]/50">Your timeline</span>
            <span className="font-semibold text-[var(--color-deep-ocean)]">{requestedDays} nights</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-[var(--color-deep-ocean)]/5">
            <span className="text-amber-700 font-semibold">Surplus nights</span>
            <span className="font-bold text-amber-600">+{surplus} nights</span>
          </div>
        </div>

        <p className="text-[10.5px] text-[var(--color-deep-ocean)]/50 mb-4 leading-relaxed">
          Would you like the AI to suggest hidden gems nearby to fill the extra time?
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => onApprove("yes")}
            className="flex-1 py-2.5 rounded-xl bg-[var(--color-deep-ocean)] text-white text-[12px] font-bold tracking-wide hover:bg-[var(--color-deep-ocean)]/90 transition-all duration-200 shadow-md active:scale-95"
          >
            Discover More Places
          </button>
          <button
            onClick={() => onApprove("no")}
            className="flex-1 py-2.5 rounded-xl border border-[var(--color-deep-ocean)]/12 text-[var(--color-deep-ocean)]/55 text-[12px] font-semibold hover:bg-[var(--color-deep-ocean)]/5 transition-all duration-200 active:scale-95"
          >
            Keep It Focused
          </button>
        </div>
      </div>
    </motion.div>
  );
});
ExpandReviewCard.displayName = "ExpandReviewCard";

// ── Layover Review Card ───────────────────────────────────────────────────────

interface LayoverReviewProps {
  reason: string;
  layoverCity: string;
  onApprove: (ans: string) => void;
}

const LayoverReviewCard = memo(({ reason, layoverCity, onApprove }: LayoverReviewProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -12 }}
      transition={{ type: "spring", stiffness: 340, damping: 28 }}
      className="absolute inset-x-0 top-16 z-50 flex justify-center pointer-events-none px-8"
    >
      <div className="pointer-events-auto max-w-sm w-full bg-white/95 backdrop-blur-xl rounded-2xl border border-[var(--color-deep-ocean)]/10 shadow-[0_20px_60px_rgba(15,39,71,0.18)] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
            <Anchor size={18} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[var(--color-deep-ocean)]/40 font-bold">Transit Insight</div>
            <div className="text-sm font-bold text-[var(--color-deep-ocean)] leading-tight">Layover Recommendation</div>
          </div>
        </div>

        <p className="text-[11px] text-[var(--color-deep-ocean)]/80 mb-4 leading-relaxed font-medium">
          {reason}
        </p>
        <p className="text-[10.5px] text-[var(--color-deep-ocean)]/60 mb-4 leading-relaxed">
          Would you like to add <span className="font-bold text-[var(--color-deep-ocean)]">{layoverCity}</span> as a 1-night rest stop?
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => onApprove("yes")}
            className="flex-1 py-2.5 rounded-xl bg-[var(--color-deep-ocean)] text-white text-[12px] font-bold tracking-wide hover:bg-[var(--color-deep-ocean)]/90 transition-all duration-200 shadow-md active:scale-95"
          >
            Yes, add stop
          </button>
          <button
            onClick={() => onApprove("no")}
            className="flex-1 py-2.5 rounded-xl border border-[var(--color-deep-ocean)]/12 text-[var(--color-deep-ocean)]/55 text-[12px] font-semibold tracking-wide hover:bg-[var(--color-deep-ocean)]/5 transition-all duration-200 active:scale-95"
          >
            No, skip
          </button>
        </div>
      </div>
    </motion.div>
  );
});
LayoverReviewCard.displayName = "LayoverReviewCard";



const COMPLETION_CHECKS = [
  "Route finalized",
  "Destinations validated",
  "Accommodations mapped",
  "Activities planned",
  "Journey ready",
];

const CompletionCard = memo(({ onDone }: { onDone: () => void }) => {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setVisibleCount(i);
      if (i >= COMPLETION_CHECKS.length) {
        clearInterval(iv);
        setTimeout(onDone, 900);
      }
    }, 520);
    return () => clearInterval(iv);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -16 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
    >
      <div className="pointer-events-auto bg-white/95 backdrop-blur-xl rounded-2xl border border-[var(--color-deep-ocean)]/10 shadow-[0_20px_80px_rgba(15,39,71,0.22)] p-8 min-w-[320px]">
        <div className="flex items-center gap-3 mb-6">
          <motion.div
            animate={{ rotate: [0, 20, -10, 0] }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="p-2.5 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg"
          >
            <Sparkles size={20} />
          </motion.div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-[var(--color-deep-ocean)]/35 font-bold">Expedition Complete</div>
            <div className="text-base font-bold text-[var(--color-deep-ocean)]">Journey Blueprint Ready</div>
          </div>
        </div>

        <div className="space-y-3">
          {COMPLETION_CHECKS.map((item, i) => (
            <motion.div
              key={item}
              initial={{ opacity: 0, x: -8 }}
              animate={visibleCount > i ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="flex items-center gap-3"
            >
              <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-300 ${
                visibleCount > i
                  ? "bg-emerald-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.4)]"
                  : "bg-[var(--color-deep-ocean)]/8 text-[var(--color-deep-ocean)]/25"
              }`}>
                <CheckCircle2 size={11} strokeWidth={2.5} />
              </div>
              <span className={`text-[12px] font-medium transition-colors duration-300 ${
                visibleCount > i ? "text-[var(--color-deep-ocean)]" : "text-[var(--color-deep-ocean)]/25"
              }`}>
                {item}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
});
CompletionCard.displayName = "CompletionCard";

// ── Canvas background SVG data URL ────────────────────────────────────────────

const PLUS_GRID_BG = `url("data:image/svg+xml,%3Csvg width='32' height='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M16 6v20M6 16h20' stroke='%230F2747' stroke-width='0.6' stroke-opacity='0.07' stroke-linecap='round'/%3E%3C/svg%3E")`;

// ── Icon map ──────────────────────────────────────────────────────────────────

function getIcon(eventType: string, text: string): LucideIcon {
  if (eventType === "trip_complete")            return Sparkles;
  if (eventType === "city_plan_start")          return Star;
  if (eventType === "city_hotel_search")        return Hotel;
  if (eventType === "city_attraction_search")   return Anchor;
  if (eventType === "city_transport_search")    return Train;
  if (eventType === "city_weather_check")       return Wind;
  if (eventType === "city_plan_complete")       return CheckCircle2;
  if (eventType === "hotel_event")              return Home;
  if (eventType === "transport_event")          return Train;
  if (eventType === "weather_event")            return Cloud;
  if (eventType === "route_event")              return Building2;
  if (eventType === "chat_question")            return MessageSquare;
  if (eventType === "brief_node")               return FileText;
  if (eventType === "brief_assembled")          return CheckCircle2;
  if (eventType === "night_allocation")         return Moon;
  if (eventType === "night_allocation_sub")     return MapPin;
  if (eventType === "destination_options")      return MapIcon;
  if (eventType === "extraction_complete")      return CheckCircle2;
  if (eventType === "start")                    return Compass;
  const l = text;
  if (l.includes("Pruning") || l.includes("pruning")) return Scissors;
  if (l.includes("Validat"))   return CheckCircle2;
  if (l.includes("Orchestrat")) return Layers;
  if (l.includes("transit") || l.includes("layover")) return Route;
  if (l.includes("Balancing") || l.includes("nights")) return Clock;
  if (l.includes("Discover") || l.includes("gems"))   return MapIcon;
  if (l.includes("Research")) return Cpu;
  if (l.includes("Assembl") || l.includes("Finaliz")) return Layers;
  if (l.includes("Budget") || l.includes("budget"))   return Zap;
  if (l.includes("Stitching") || l.includes("blueprint")) return Sparkles;
  return Compass;
}

// ── SVG Edge Layer ─────────────────────────────────────────────────────────────

interface EdgeLayerProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  nodeDeltaMap: Record<string, { dx: number; dy: number }>;
  revealState: RevealState;
  canvasW: number;
  canvasH: number;
}

const EdgeLayer = memo(({ nodes, edges, nodeDeltaMap, revealState, canvasW, canvasH }: EdgeLayerProps) => {
  const nodeMap = new Map<string, WorkflowNode>(nodes.map(n => [n.id, n]));
  const isGlowing   = revealState === "glowing";
  const isRevealed  = revealState === "revealed";

  return (
    <svg
      className="absolute inset-0 overflow-visible pointer-events-none"
      style={{ width: canvasW, height: canvasH }}
    >
      <defs>
        {/* Glow filter for active edges */}
        <filter id="edge-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="edge-glow-soft" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="gold-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>

        {/* Lane separator gradient */}
        <linearGradient id="sep-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(15,39,71,0)" />
          <stop offset="25%"  stopColor="rgba(15,39,71,0.07)" />
          <stop offset="75%"  stopColor="rgba(15,39,71,0.07)" />
          <stop offset="100%" stopColor="rgba(15,39,71,0)" />
        </linearGradient>

        {/* Glow cascade sweep gradient for reveal — white-ice sweep */}
        {isGlowing && (
          <linearGradient id="sweep-grad" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
            <stop stopColor="transparent" stopOpacity="0">
              <animate attributeName="offset" values="-0.4;1.4" dur="2.2s" fill="freeze" />
            </stop>
            <stop stopColor="#FFFFFF" stopOpacity="0.92">
              <animate attributeName="offset" values="-0.1;1.7" dur="2.2s" fill="freeze" />
            </stop>
            <stop stopColor="transparent" stopOpacity="0">
              <animate attributeName="offset" values="0.2;2.0" dur="2.2s" fill="freeze" />
            </stop>
          </linearGradient>
        )}
      </defs>

      {/* Lane separator lines */}
      {LANE_SEP_X.map((x, i) => (
        <line
          key={i} x1={x} y1={60} x2={x} y2={canvasH - 60}
          stroke="url(#sep-grad)" strokeWidth={1} strokeDasharray="4 14"
        />
      ))}

      {/* Lane header labels */}
      {Object.entries(LANE_LABELS).map(([lane, label]) => (
        <text
          key={lane}
          x={LANE_X[Number(lane)] + NODE_W / 2}
          y={130}
          textAnchor="middle"
          fill="#0F2747"
          fillOpacity={0.07}
          fontSize={9.5}
          fontWeight={800}
          letterSpacing={4}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {label}
        </text>
      ))}

      {/* Edges */}
      {edges.map(edge => {
        const from = nodeMap.get(edge.fromId);
        const to   = nodeMap.get(edge.toId);
        if (!from || !to) return null;

        const d = computeEdgePath(from, to, edge.type, nodeDeltaMap);
        const pathId = `ep-${edge.id}`;
        const isActive  = edge.animated;
        // After reveal: edges stay their standard deep-ocean colour — no gold flash
        const edgeColor = isRevealed
          ? "rgba(15,39,71,0.22)"
          : isGlowing
          ? "#bae6fd"
          : isActive ? "#FF8A3D" : "rgba(15,39,71,0.14)";
        const edgeWidth = isGlowing ? 3 : isActive ? 2.5 : 1.5;

        return (
          <g key={edge.id}>
            <path id={pathId} d={d} fill="none" stroke="none" />

            {/* Glow halo */}
            {(isActive || isGlowing) && (
              <path
                d={d} fill="none"
                stroke={isGlowing ? "#e0f2fe" : "#FF8A3D"}
                strokeWidth={isGlowing ? 12 : 8}
                strokeLinecap="round"
                opacity={isGlowing ? 0.18 : 0.13}
                filter={isGlowing ? "url(#gold-glow)" : "url(#edge-glow)"}
              />
            )}

            {/* Main line */}
            <motion.path
              d={d} fill="none"
              stroke={edgeColor}
              strokeWidth={edgeWidth}
              strokeLinecap="round"
              filter={isActive ? "url(#edge-glow-soft)" : "none"}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />

            {/* Travelling signal dot — only on active edges */}
            {isActive && !isGlowing && (
              <>
                <circle r="5" fill="#FF8A3D" opacity="0.95">
                  <animateMotion dur="1.8s" repeatCount="indefinite" calcMode="spline"
                    keySplines="0.42 0 0.58 1" keyTimes="0;1">
                    <mpath href={`#${pathId}`} />
                  </animateMotion>
                </circle>
                <circle r="3" fill="#FF8A3D" opacity="0.4">
                  <animateMotion dur="1.8s" begin="0.1s" repeatCount="indefinite" calcMode="spline"
                    keySplines="0.42 0 0.58 1" keyTimes="0;1">
                    <mpath href={`#${pathId}`} />
                  </animateMotion>
                </circle>
              </>
            )}

            {/* Gold sweep on reveal */}
            {isGlowing && (
              <path
                d={d} fill="none"
                stroke="url(#sweep-grad)"
                strokeWidth={5}
                strokeLinecap="round"
                opacity={0.9}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
});
EdgeLayer.displayName = "EdgeLayer";

// ── Node Card ────────────────────────────────────────────────────────────────

interface NodeCardProps {
  node: WorkflowNode;
  isActive: boolean;
  thinkingMsg: string | null;
  delta: { dx: number; dy: number };
  onDragEnd: (id: string, dx: number, dy: number) => void;
  onDragStart: () => void;
  onNodeClick: (node: WorkflowNode) => void;
  revealState: RevealState;
}

const NodeCard = memo(({
  node, isActive, thinkingMsg, delta, onDragEnd, onDragStart, onNodeClick, revealState,
}: NodeCardProps) => {
  const Icon        = getIcon(node.eventType, node.title);
  const isComplete  = node.status === "completed";
  const isReveal    = node.eventType === "trip_complete";
  const isSynthesis = node.isSynthesis;
  const isCityHdr   = node.isCityHeader;
  const isSubNode   = node.isSubNode;
  const isGlowing   = revealState === "glowing";
  const color       = node.agentColor || "#FF8A3D";

  // Dragging state
  const dragRef      = useRef<{ startX: number; startY: number; baseDx: number; baseDy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localDelta, setLocalDelta] = useState(delta);

  // Sync external delta
  useEffect(() => setLocalDelta(delta), [delta]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseDx: localDelta.dx,
      baseDy: localDelta.dy,
    };
    setDragging(true);
    onDragStart();
  }, [localDelta, onDragStart]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = dragRef.current.baseDx + (e.clientX - dragRef.current.startX);
    const dy = dragRef.current.baseDy + (e.clientY - dragRef.current.startY);
    setLocalDelta({ dx, dy });
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = dragRef.current.baseDx + (e.clientX - dragRef.current.startX);
    const dy = dragRef.current.baseDy + (e.clientY - dragRef.current.startY);
    const moved = Math.abs(dx - dragRef.current.baseDx) > 3 || Math.abs(dy - dragRef.current.baseDy) > 3;
    dragRef.current = null;
    setDragging(false);
    if (moved) {
      onDragEnd(node.id, dx, dy);
    } else {
      // It was a click
      onNodeClick(node);
    }
  }, [node, onDragEnd, onNodeClick]);

  const glowColor = isGlowing ? "#FFFFFF" : color;

  return (
    <motion.div
      initial={{ opacity: 0, x: -18, scale: 0.91 }}
      animate={{
        opacity: 1, x: 0, scale: isActive ? 1.02 : 1,
      }}
      transition={{
        type: "spring", stiffness: 280, damping: 24,
        // Stagger cascade by lane so nodes light up left-to-right
        delay: isGlowing ? (node.lane ?? 0) * 0.18 : 0,
      }}
      className="absolute select-none nodrag"
      style={{
        left: node.x + localDelta.dx,
        top:  node.y + localDelta.dy,
        width: NODE_W,
        zIndex: dragging ? 999 : isActive ? 10 : 1,
        cursor: dragging ? "grabbing" : "grab",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* ── Triple glow rings for active node ── */}
      {(isActive || isGlowing) && (
        <>
          <motion.div
            className="absolute rounded-2xl pointer-events-none"
            style={{ inset: -5, borderRadius: 20 }}
            animate={{
              boxShadow: [
                `0 0 0 2px ${glowColor}35, 0 0 16px ${glowColor}18, 0 0 40px ${glowColor}08`,
                `0 0 0 4px ${glowColor}65, 0 0 30px ${glowColor}35, 0 0 70px ${glowColor}16`,
                `0 0 0 2px ${glowColor}35, 0 0 16px ${glowColor}18, 0 0 40px ${glowColor}08`,
              ],
            }}
            transition={{ duration: isGlowing ? 0.8 : 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute rounded-2xl pointer-events-none"
            style={{ inset: -12, borderRadius: 24 }}
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: isGlowing ? 0.6 : 3, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          >
            <div style={{
              width: "100%", height: "100%", borderRadius: 24,
              boxShadow: `0 0 48px ${glowColor}14`,
            }} />
          </motion.div>
        </>
      )}

      {/* ── Card surface ── */}
      <div
        className={[
          "relative rounded-2xl border overflow-hidden transition-all duration-500",
          isGlowing
            ? "bg-gradient-to-br from-sky-50/95 to-white border-sky-200/60 shadow-[0_8px_40px_rgba(186,230,253,0.45)]"
            : isReveal
            ? "bg-gradient-to-br from-emerald-50/95 to-white border-emerald-300/50 shadow-[0_8px_40px_rgba(16,185,129,0.22)]"
            : isSynthesis
            ? "bg-gradient-to-br from-blue-50/90 to-white border-blue-200/50 shadow-[0_6px_28px_rgba(30,64,175,0.14)]"
            : isCityHdr
            ? "bg-gradient-to-br from-slate-50/95 to-white border-[var(--color-deep-ocean)]/20 shadow-[0_6px_24px_rgba(15,39,71,0.12)]"
            : isSubNode
            ? "bg-white/92 border-[var(--color-deep-ocean)]/8 shadow-sm"
            : isActive
            ? "bg-white border-[var(--color-sunset-orange)]/30 shadow-[0_6px_28px_rgba(255,138,61,0.16)]"
            : "bg-white/90 border-[var(--color-deep-ocean)]/7 shadow-sm",
        ].join(" ")}
        style={{
          minHeight: isSubNode ? 88 : NODE_H,
        }}
      >
        {/* Animated left accent bar */}
        <motion.div
          className="absolute left-0 top-0 bottom-0 rounded-l-2xl"
          animate={{
            width: isActive || isGlowing ? 4 : 3,
            background: isGlowing
              ? "#bae6fd"
              : isReveal
              ? "#10b981"
              : isSynthesis
              ? "#1e40af"
              : isCityHdr
              ? color
              : isActive
              ? color
              : isComplete
              ? "rgba(15,39,71,0.10)"
              : "rgba(15,39,71,0)",
          }}
          transition={{ duration: 0.4 }}
        />

        <div className={`pl-4 pr-3 ${isSubNode ? "pt-3 pb-2.5" : "pt-3.5 pb-3"}`}>
          <div className="flex items-start gap-2.5">
            {/* Icon */}
            <div
              className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5"
              style={{
                background: isGlowing
                  ? "rgba(186,230,253,0.18)"
                  : isReveal
                  ? "rgba(16,185,129,0.10)"
                  : isSynthesis
                  ? "rgba(30,64,175,0.09)"
                  : isActive
                  ? `${color}18`
                  : "rgba(15,39,71,0.04)",
              }}
            >
              <div style={{
                color: isGlowing ? "#0369a1" : isReveal ? "#10b981" : isSynthesis ? "#1e40af" : isActive ? color : "#0F2747",
                opacity: isComplete && !isReveal && !isActive && !isGlowing ? 0.5 : 1,
              }}>
                <Icon size={isSubNode ? 14 : 16} strokeWidth={1.8} />
              </div>
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                {isComplete && !isActive && !isGlowing && (
                  <CheckCircle2 size={10} strokeWidth={2.5} style={{ color: "#10b981", flexShrink: 0 }} />
                )}
                <h4
                  className="font-serif leading-snug truncate"
                  style={{
                    fontSize: isCityHdr ? 15 : isSubNode ? 12.5 : 14,
                    fontWeight: isCityHdr ? 700 : 500,
                    opacity: isComplete && !isReveal && !isActive && !isGlowing ? 0.6 : 1,
                    color: isGlowing ? "#0c4a6e" : isReveal ? "#065f46" : isSynthesis ? "#1e3a8a" : "#0F2747",
                  }}
                >
                  {node.title}
                </h4>
              </div>

              {node.subtitle && (
                <p
                  className="text-[10.5px] font-sans truncate"
                  style={{ color: "rgba(15,39,71,0.44)", lineHeight: 1.4 }}
                >
                  {node.subtitle}
                </p>
              )}

              {/* Thinking message */}
              <AnimatePresence>
                {isActive && thinkingMsg && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-1.5 flex items-center gap-1.5"
                  >
                    {[0, 0.15, 0.3].map((delay, i) => (
                      <motion.div
                        key={i}
                        className="w-1 h-1 rounded-full"
                        style={{ background: color }}
                        animate={{ opacity: [1, 0.2, 1] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay }}
                      />
                    ))}
                    <span className="text-[9.5px] font-medium ml-0.5 truncate" style={{ color }}>
                      {thinkingMsg}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Active pulse dot */}
            {isActive && !isGlowing && (
              <motion.div
                className="flex-shrink-0 w-2 h-2 rounded-full mt-1.5"
                style={{ background: color }}
                animate={{ scale: [1, 1.8, 1], opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              />
            )}
          </div>

          {/* Agent badge — show on active nodes */}
          {node.agentTag && (isActive || isGlowing) && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 flex"
            >
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-white text-[8.5px] font-bold tracking-[0.18em] uppercase"
                style={{ background: isGlowing ? "#0369a1" : color }}
              >
                <motion.div
                  className="w-1 h-1 rounded-full bg-white"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                {node.agentTag}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
});
NodeCard.displayName = "NodeCard";

// ── Phase Timeline HUD ────────────────────────────────────────────────────────

const PhaseTimeline = memo(({ phases }: { phases: PhaseInfo[] }) => (
  <div className="flex items-center gap-0 bg-white/82 backdrop-blur-md rounded-full px-4 py-2 shadow-sm border border-[var(--color-deep-ocean)]/8">
    {phases.map((phase, i) => (
      <div key={phase.key} className="flex items-center gap-0">
        <div className="flex items-center gap-1.5 px-1.5">
          <div className={[
            "w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all duration-500",
            phase.status === "done"   ? "bg-emerald-500"
            : phase.status === "active" ? "bg-[var(--color-sunset-orange)] animate-pulse"
            : "bg-[var(--color-deep-ocean)]/10",
          ].join(" ")} />
          <span className={[
            "text-[9.5px] font-bold tracking-wider uppercase whitespace-nowrap transition-colors",
            phase.status === "done"   ? "text-emerald-600"
            : phase.status === "active" ? "text-[var(--color-sunset-orange)]"
            : "text-[var(--color-deep-ocean)]/22",
          ].join(" ")}>
            {phase.label}
          </span>
        </div>
        {i < phases.length - 1 && (
          <ChevronRight size={9} strokeWidth={2.5} className={
            phase.status === "done" ? "text-emerald-300 mx-0.5" : "text-[var(--color-deep-ocean)]/10 mx-0.5"
          } />
        )}
      </div>
    ))}
  </div>
));
PhaseTimeline.displayName = "PhaseTimeline";

// ── Node Detail Drawer ────────────────────────────────────────────────────────

const NodeDetailDrawer = memo(({ node, onClose }: { node: WorkflowNode | null; onClose: () => void }) => (
  <AnimatePresence>
    {node && (
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 24 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
        className="absolute top-20 right-5 z-50 w-64 bg-white/96 backdrop-blur-xl rounded-2xl shadow-[0_8px_48px_rgba(15,39,71,0.18)] border border-[var(--color-deep-ocean)]/10 overflow-hidden"
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b border-[var(--color-deep-ocean)]/6"
          style={{ borderLeft: `4px solid ${node.agentColor || "#FF8A3D"}` }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[9px] uppercase tracking-[0.2em] font-bold mb-1" style={{ color: node.agentColor || "#FF8A3D" }}>
                {node.agentTag || "Agent"}
              </div>
              <h3 className="font-serif text-sm text-[var(--color-deep-ocean)] leading-snug">{node.title}</h3>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-deep-ocean)]/5 hover:bg-[var(--color-deep-ocean)]/10 flex items-center justify-center text-[var(--color-deep-ocean)]/50 transition-colors text-xs font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          {node.subtitle && (
            <p className="text-[11px] text-[var(--color-deep-ocean)]/60 leading-relaxed mb-3 font-sans">
              {node.subtitle}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={[
              "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider",
              node.status === "active"    ? "bg-[var(--color-sunset-orange)]/12 text-[var(--color-sunset-orange)]"
              : node.status === "completed" ? "bg-emerald-100 text-emerald-700"
              : "bg-[var(--color-deep-ocean)]/6 text-[var(--color-deep-ocean)]/45",
            ].join(" ")}>
              {node.status}
            </span>
            <span className="text-[9px] text-[var(--color-deep-ocean)]/30 font-mono">
              {node.eventType}
            </span>
          </div>
          {node.city && (
            <div className="mt-3 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: node.agentColor || "#FF8A3D" }} />
              <span className="text-[10px] font-semibold text-[var(--color-deep-ocean)]/70">{node.city}</span>
            </div>
          )}
        </div>
      </motion.div>
    )}
  </AnimatePresence>
));
NodeDetailDrawer.displayName = "NodeDetailDrawer";

// ── Props ─────────────────────────────────────────────────────────────────────

interface WorkflowCanvasProps {
  currentPhase?: PlanningPhase;
  statusMessage?: string;
  destinationOptions?: CuratedCity[];
  currentReview?: ReviewRequest | null;
  submitAnswer?: (ans: unknown) => void;
  events?: AgentEvent[];
  onReveal?: () => void;
  briefData?: import("@/components/dashboard/JourneyBriefing").TripBrief | null;
  currentQuestion?: string | null;
  currentPlaceholder?: string | null;
  currentQuestionType?: string | null;
}

// ── Main WorkflowCanvas ────────────────────────────────────────────────────────

export default function WorkflowCanvas({
  currentPhase  = "briefing",
  statusMessage = "Initializing expedition...",
  destinationOptions = [],
  currentReview,
  submitAnswer,
  events = [],
  onReveal,
  briefData,
  currentQuestion,
  currentPlaceholder,
  currentQuestionType,
}: WorkflowCanvasProps) {
  const [followAI, setFollowAI]              = useState(true);
  const [userInteracting, setUserInteracting] = useState(false);
  const [followPaused, setFollowPaused]       = useState(false);
  const [trayDismissed, setTrayDismissed]     = useState(false);
  const [isLoadingMore, setIsLoadingMore]     = useState(false);
  const [selectedNode, setSelectedNode]       = useState<WorkflowNode | null>(null);
  const [query, setQuery]                     = useState("");

  const { nodes, edges, activeNodeId, thinkingMsg, revealState, nodeDeltaMap, updateNodeDelta } =
    useWorkflowGraph(events, currentPhase);

  const phases = computePhaseTimeline(currentPhase, events);

  // Destination tray
  const showTray =
    currentPhase === "extracting_destinations" &&
    destinationOptions.length > 0 &&
    !trayDismissed;

  // Pan/zoom ref
  const transformRef    = useRef<ReactZoomPanPinchRef>(null);
  const containerRef    = useRef<HTMLDivElement>(null);
  const interactTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Dynamic canvas size
  const maxLane        = Math.max(...nodes.map(n => n.lane), 0);
  const maxCityX       = Math.max(...nodes.filter(n => n.lane === 3).map(n => n.x + n.x), LANE_X[3]);
  const canvasW        = Math.max(CANVAS_W, maxCityX + 600);
  const laneNodeCounts = nodes.reduce((acc, n) => ({ ...acc, [n.lane]: (acc[n.lane] || 0) + 1 }), {} as Record<number, number>);
  const maxPerLane     = Math.max(...Object.values(laneNodeCounts), 1);
  const canvasH        = Math.max(CANVAS_H, LANE_TOP_Y + maxPerLane * 130 + 320);

  // Auto-approve empty pruning
  useEffect(() => {
    if (currentReview?.type === "pruning_review" && currentReview.removed?.length === 0 && submitAnswer) {
      submitAnswer("yes");
    }
  }, [currentReview, submitAnswer]);

  // Fire reveal callback — driven by CompletionCard's onDone
  const [showCompletionCard, setShowCompletionCard] = useState(false);

  useEffect(() => {
    if (revealState === "revealed" && onReveal) {
      const t = setTimeout(() => onReveal(), 800);
      return () => clearTimeout(t);
    }
  }, [revealState, onReveal]);

  // Show CompletionCard when trip_complete fires (revealState transitions away from idle)
  useEffect(() => {
    if (revealState !== "idle") setShowCompletionCard(true);
  }, [revealState]);

  // Reset tray-dismissed when phase re-enters discovery or new options arrive
  useEffect(() => {
    if (currentPhase === "extracting_destinations") setTrayDismissed(false);
  }, [currentPhase, destinationOptions]);

  // Reset load-more state when options arrive
  useEffect(() => { setIsLoadingMore(false); }, [destinationOptions.length]);

  // Auto-pan to active node
  useEffect(() => {
    if (!followAI || followPaused || userInteracting || !activeNodeId || !transformRef.current || !containerRef.current) return;

    const activeNode = nodes.find(n => n.id === activeNodeId);
    if (!activeNode) return;

    const delta = nodeDeltaMap[activeNodeId] ?? { dx: 0, dy: 0 };
    const cW    = containerRef.current.clientWidth;
    const cH    = containerRef.current.clientHeight;
    const scale = 0.7;

    const nodeCX = activeNode.x + delta.dx + NODE_W / 2;
    const nodeCY = activeNode.y + delta.dy + NODE_H / 2;
    const posX   = cW / 2 - nodeCX * scale;
    const posY   = cH * 0.38 - nodeCY * scale;

    transformRef.current.setTransform(posX, posY, scale, 800, "easeOut");
  }, [activeNodeId, nodes, followAI, followPaused, userInteracting, nodeDeltaMap]);

  // Dynamic timeout config: reduce drastically after night allocation
  const timeoutConfig = useRef({ interact: 5000, drag: 10000 });
  useEffect(() => {
    if (nodes.some(n => n.eventType === "night_allocation")) {
      timeoutConfig.current = { interact: 1000, drag: 1000 };
    } else {
      timeoutConfig.current = { interact: 5000, drag: 10000 };
    }
  }, [nodes]);

  // Interaction handlers
  const handleInteractionStart = useCallback(() => {
    setUserInteracting(true);
    clearTimeout(interactTimeout.current);
    interactTimeout.current = setTimeout(() => setUserInteracting(false), timeoutConfig.current.interact);
  }, []);

  const handleNodeDragStart = useCallback(() => {
    setFollowPaused(true);
    clearTimeout(interactTimeout.current);
    interactTimeout.current = setTimeout(() => setFollowPaused(false), timeoutConfig.current.drag);
  }, []);

  const handleFit = useCallback(() => {
    if (!transformRef.current || !containerRef.current) return;
    const scale = 0.7;
    const cW    = containerRef.current.clientWidth;
    const cH    = containerRef.current.clientHeight;
    const posX  = cW / 2 - (LANE_X[0] + NODE_W / 2) * scale;
    const posY  = cH * 0.38 - (LANE_TOP_Y + 55) * scale;
    transformRef.current.setTransform(posX, posY, scale, 500, "easeOut");
  }, []);

  const handleConfirm = useCallback((selections: string[]) => {
    setTrayDismissed(true);
    if (submitAnswer && selections.length > 0) {
      submitAnswer({ action: "confirm", selections });
    }
  }, [submitAnswer]);

  const handleLoadMore = useCallback(() => {
    if (submitAnswer && !isLoadingMore) {
      setIsLoadingMore(true);
      submitAnswer({ action: "more" });
    }
  }, [submitAnswer, isLoadingMore]);

  const handleNodeClick = useCallback((node: WorkflowNode) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node);
  }, []);

  const handleCloseDrawer = useCallback(() => setSelectedNode(null), []);

  return (
    <motion.div
      key="workflow-canvas"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="flex-1 h-full relative overflow-hidden"
      style={{ background: "var(--color-warm-cream)" }}
      ref={containerRef}
    >
      {/* ── Phase 7: Full-screen fixed grid background (tiles regardless of zoom) ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: PLUS_GRID_BG,
          backgroundSize: "32px 32px",
          opacity: 1,
        }}
      />

      {/* ── HUD: Phase timeline ─────────────────────────────────────────────── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <PhaseTimeline phases={phases} />
      </div>

      {/* ── HUD: Workspace label ─────────────────────────────────────────────── */}
      <div className="absolute top-4 left-4 z-50 pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white/70 backdrop-blur-md rounded-full border border-[var(--color-deep-ocean)]/8 shadow-sm">
          <Radio size={9} className="text-[var(--color-sunset-orange)]" />
          <span className="text-[8.5px] font-bold tracking-[0.22em] uppercase text-[var(--color-deep-ocean)]/50">
            AI Planning Studio
          </span>
        </div>
      </div>

      {/* ── HUD: Controls — bottom-left ──────────────────────────────────────── */}
      <AnimatePresence>
        {!showTray && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-5 left-5 z-50 flex flex-col gap-2"
          >
            {/* Follow AI toggle */}
            <button
              onClick={() => {
                if (followPaused) { setFollowPaused(false); setFollowAI(true); }
                else { setFollowAI(f => !f); if (!followAI) setUserInteracting(false); }
              }}
              className={[
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9.5px] font-bold tracking-wider uppercase shadow-sm border transition-all",
                followPaused
                  ? "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-50"
                  : followAI
                  ? "bg-[var(--color-deep-ocean)] text-white border-[var(--color-deep-ocean)]"
                  : "bg-white/85 text-[var(--color-deep-ocean)]/55 border-[var(--color-deep-ocean)]/15 hover:border-[var(--color-deep-ocean)]/30",
              ].join(" ")}
            >
              <Navigation size={9} />
              {followPaused ? "Resume AI" : followAI ? "Following AI" : "Follow AI"}
            </button>

            {/* Zoom controls */}
            <div className="flex gap-1.5">
              {[
                { label: "+", action: () => transformRef.current?.zoomIn(0.2) },
                { label: "−", action: () => transformRef.current?.zoomOut(0.2) },
                { label: "⊡", action: handleFit },
              ].map(({ label, action }, i) => (
                <button
                  key={i}
                  onClick={action}
                  className="w-8 h-8 bg-white/85 backdrop-blur-sm rounded-full border border-[var(--color-deep-ocean)]/10 hover:bg-white shadow-sm transition-all hover:shadow-md text-[var(--color-deep-ocean)]/55 text-xs font-bold"
                >
                  {label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Completion Card (replaces glow sequence) ───────────────────── */}
      <AnimatePresence>
        {showCompletionCard && revealState !== "revealed" && (
          <CompletionCard
            onDone={() => {
              setShowCompletionCard(false);
              // After card finishes, fire onReveal
              if (onReveal) onReveal();
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Review Card (pruning / weather) ─────────────────────────────────── */}
      <AnimatePresence>
        {currentReview && (currentReview.type === "pruning_review" || currentReview.type === "weather_review") &&
         !(currentReview.type === "pruning_review" && currentReview.removed?.length === 0) &&
         submitAnswer && (
          <ReviewCard
            review={currentReview}
            onApprove={(ans) => submitAnswer(ans)}
          />
        )}
      </AnimatePresence>

      {/* ── Expand Review Card (surplus days) ───────────────────────────────── */}
      <AnimatePresence>
        {currentReview && (currentReview as any).type === "expand_review" && submitAnswer && (
          <ExpandReviewCard
            estimatedDays={(currentReview as any).estimated_days || 0}
            requestedDays={(currentReview as any).requested_days || 0}
            surplus={(currentReview as any).surplus || 0}
            onApprove={(ans) => submitAnswer(ans)}
          />
        )}
      </AnimatePresence>

      {/* ── Layover Review Card ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {currentReview && currentReview.type === "layover_review" && submitAnswer && (
          <LayoverReviewCard
            reason={currentReview.reason || ""}
            layoverCity={currentReview.layover_city || ""}
            onApprove={submitAnswer}
          />
        )}
      </AnimatePresence>

      {/* ── HUD: Status chip — bottom-center ─────────────────────────────────── */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        <AnimatePresence mode="wait">
          {!showTray && (
            <motion.div
              key={statusMessage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2 px-5 py-2.5 bg-[var(--color-deep-ocean)] text-[var(--color-warm-cream)] rounded-full shadow-lg text-[10.5px] font-medium tracking-wide"
            >
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: revealState === "glowing" ? "#FFD700" : "var(--color-sunset-orange)" }}
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
              {statusMessage}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Pan / Zoom canvas ─────────────────────────────────────────────────── */}
      <TransformWrapper
        ref={transformRef}
        initialScale={0.7}
        minScale={0.15}
        maxScale={2.4}
        limitToBounds={false}
        wheel={{ step: 0.04 }}
        panning={{ velocityDisabled: false, excluded: ["nodrag"] }}
        onPanningStart={handleInteractionStart}
        onWheelStart={handleInteractionStart}
        onPinchStart={handleInteractionStart}
      >
        <TransformComponent
          wrapperStyle={{ width: "100%", height: "100%" }}
          wrapperClass="cursor-grab active:cursor-grabbing"
        >
          {/* Virtual canvas — grid removed here; now full-screen fixed above */}
          <div
            className="relative"
            style={{ width: canvasW, height: canvasH }}
          >
            {/* SVG edge layer */}
            <EdgeLayer
              nodes={nodes}
              edges={edges}
              nodeDeltaMap={nodeDeltaMap}
              revealState={revealState}
              canvasW={canvasW}
              canvasH={canvasH}
            />

            {/* Node cards */}
            <AnimatePresence>
              {nodes.map(node => (
                <NodeCard
                  key={node.id}
                  node={node}
                  isActive={
                    node.id === activeNodeId ||
                    (node.eventType === "night_allocation_sub" &&
                      nodes.find((n) => n.id === activeNodeId)?.eventType === "night_allocation_sub")
                  }
                  thinkingMsg={node.id === activeNodeId ? thinkingMsg : null}
                  delta={nodeDeltaMap[node.id] ?? { dx: 0, dy: 0 }}
                  onDragEnd={updateNodeDelta}
                  onDragStart={handleNodeDragStart}
                  onNodeClick={handleNodeClick}
                  revealState={revealState}
                />
              ))}
            </AnimatePresence>
          </div>
        </TransformComponent>
      </TransformWrapper>


      {/* ── Node Detail Drawer ────────────────────────────────────────────────── */}
      <NodeDetailDrawer node={selectedNode} onClose={handleCloseDrawer} />

      {/* ── Chat Question Overlay ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {currentQuestion && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[60] w-full max-w-lg pointer-events-auto"
          >
            <div className="bg-white/95 backdrop-blur-md border border-[var(--color-deep-ocean)]/10 shadow-[0_8px_32px_rgba(15,39,71,0.12)] rounded-2xl p-4 flex flex-col gap-3">
              <div className="text-[10px] uppercase tracking-widest text-[var(--color-deep-ocean)]/45 font-bold">
                Concierge asks:
              </div>
              <div className="text-[var(--color-deep-ocean)] font-medium text-[14px] leading-snug">
                {currentQuestion}
              </div>
              <MorphingInput
                isExpanded={false}
                placeholder={currentPlaceholder || "Your response..."}
                onSubmit={() => {
                  if (query && submitAnswer) {
                    submitAnswer(query);
                    setQuery("");
                  }
                }}
                query={query}
                setQuery={setQuery}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Destination Tray (outside transform wrapper) ─────────────────────── */}
      <DestinationTray
        visible={showTray}
        options={destinationOptions}
        onConfirm={handleConfirm}
        onLoadMore={handleLoadMore}
        isLoadingMore={isLoadingMore}
      />
    </motion.div>
  );
}
