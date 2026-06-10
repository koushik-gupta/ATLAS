import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import {
  Map, Sun, Train, Home, CheckCircle2, Layers, MessageSquare,
  Scissors, Cloud, Building2, Compass, Cpu, Star, Route,
  Hotel, Anchor, Wind, Zap, Sparkles
} from "lucide-react";


export interface AgentEvent {
  id: string;
  type: string;
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  city?: string; // optional city for city-level cluster events
  allocation?: Record<string, number>; // optional city-to-nights mapping
}

export interface CuratedCity {
  city: string;
  image: string;
  description: string;
  more_available?: boolean;
}

export interface ReviewRequest {
  type: "pruning_review" | "weather_review" | "expand_review" | "layover_review";
  title: string;
  // pruning & general
  removed?: string[];
  kept?: string[];
  reason?: string;
  // weather
  original_dates?: string;
  issue?: string;
  recommended_dates?: string;
  // expand
  estimated_days?: number;
  requested_days?: number;
  surplus?: number;
  // layover
  layover_city?: string;
}

export type PlanningPhase =
  | "briefing"
  | "extracting_text"
  | "extracting_destinations"
  | "discovery"
  | "curation"
  | "assembly"
  | "completed";

export interface BriefNode {
  node_type: string; // origin | destination | duration | month | travellers | pace | budget | transport
  value: string;
  label: string;
  transport_class?: string;
}

export function useAgentStream(sessionId: string | null) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>("Initializing expedition...");
  const [currentPhase, setCurrentPhase] = useState<PlanningPhase>("briefing");
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [currentPlaceholder, setCurrentPlaceholder] = useState<string | null>(null);
  const [currentQuestionType, setCurrentQuestionType] = useState<string | null>(null);
  const [currentReview, setCurrentReview] = useState<ReviewRequest | null>(null);
  const [destinationOptions, setDestinationOptions] = useState<CuratedCity[]>([]);
  const [briefNodes, setBriefNodes] = useState<BriefNode[]>([]);

  useEffect(() => {
    if (!sessionId) return;

    console.log("Subscribing to session stream:", sessionId);
    const eventSource = new EventSource(`${API_URL}/stream/${sessionId}`);

    // Reset state for new session
    setEvents([]);
    setStatusMessage("Assembling expedition brief...");
    setCurrentPhase("briefing");
    setCurrentQuestion(null);
    setCurrentPlaceholder(null);
    setCurrentQuestionType(null);
    setCurrentReview(null);
    setDestinationOptions([]);
    setBriefNodes([]);

    function iconForType(type: string, label: string) {
      // City-level events
      if (type === "city_plan_start")       return Star;
      if (type === "city_hotel_search")     return Hotel;
      if (type === "city_attraction_search") return Anchor;
      if (type === "city_transport_search") return Train;
      if (type === "city_weather_check")    return Wind;
      if (type === "city_plan_complete")    return CheckCircle2;
      // Standard events
      if (type === "hotel_event")           return Home;
      if (type === "transport_event")       return Train;
      if (type === "weather_event")         return Sun;
      if (type === "route_event")           return Building2;
      if (type === "trip_complete")         return CheckCircle2;
      if (type === "chat_question")         return MessageSquare;
      if (type === "destination_options")   return Map;
      // Label-based fallback
      const l = label;
      if (l.includes("Pruning") || l.includes("pruning")) return Scissors;
      if (l.includes("weather") || l.includes("Weather")) return Cloud;
      if (l.includes("route") || l.includes("Route"))     return Route;
      if (l.includes("Research"))                         return Cpu;
      if (l.includes("Orchestrat"))                       return Layers;
      if (l.includes("Assembl") || l.includes("Finaliz")) return Layers;
      if (l.includes("Validat"))                          return CheckCircle2;
      if (l.includes("Budget"))                           return Zap;
      return Compass;
    }

    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        let { type, label, options, placeholder, append, city } = parsed;
        
        if (label) {
          label = label.replace(/<[^>]*>?/gm, ' ');
          label = label.replace(/â€”/g, '—').replace(/â€"/g, '–').replace(/â€™/g, "'").replace(/â€œ/g, '"').replace(/â€ /g, '"');
          label = label.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{FE0F}⚠️✅]/gu, "");
          label = label.replace(/\s+/g, ' ').trim();
        }

        // ── Brief nodes (from structured brief, no LLM) ────────────────────
        if (type === "brief_node") {
          const bn: BriefNode = {
            node_type: parsed.node_type || "unknown",
            value: parsed.value || label,
            label,
            transport_class: parsed.transport_class,
          };
          setBriefNodes(prev => [...prev, bn]);
          // NOTE: Do NOT update statusMessage here — we want the bottom chip to
          // keep showing a stable message ("Assembling expedition brief...") rather
          // than flashing individual brief values like "1 Solo" or "10 Days".
          setCurrentPhase("briefing");
          // Do NOT return here, let it fall through to be added to events array
        }

        if (type === "brief_assembled") {
          setCurrentPhase("discovery");
          setStatusMessage("Journey brief assembled — beginning discovery...");
          setEvents(prev => [...prev, {
            id: Date.now().toString() + Math.random(),
            type,
            text: label || "Journey Brief Assembled",
            icon: Sparkles,
          }]);
          return;
        }

        // ── Expand review (extra time available) ─────────────────────────────
        if (type === "expand_review") {
          setCurrentReview({
            type: "expand_review" as any,
            title: label,
            estimated_days: parsed.estimated_days,
            requested_days: parsed.requested_days,
            surplus: parsed.surplus,
          } as any);
          setStatusMessage("Extra time available — expand trip?");
          return;
        }

        // ── Review requests (pruning, weather, layover) ───────────────────────
        if (type === "pruning_review" || type === "weather_review" || type === "layover_review") {
          setCurrentReview({
            type: type as "pruning_review" | "weather_review" | "layover_review",
            title: label,
            removed: parsed.removed || [],
            kept: parsed.kept || [],
            reason: parsed.reason || "",
            original_dates: parsed.original_dates || "",
            issue: parsed.issue || "",
            recommended_dates: parsed.recommended_dates || "",
            layover_city: parsed.layover_city || "",
          });
          setCurrentPhase("extracting_text");
          setStatusMessage("Review required...");
          return;
        }
        
        if (type === "clear_review") {
          setCurrentReview(null);
          return;
        }

        // ── Chat question ──────────────────────────────────────────────────────
        if (type === "chat_question") {
          setCurrentQuestion(label);
          setCurrentPlaceholder(placeholder || "Refine the journey...");
          setCurrentQuestionType(parsed.question_type || null);
          setCurrentPhase("extracting_text");
          setStatusMessage("Waiting for your input...");
          setEvents((prev) => [
            ...prev,
            {
              id: Date.now().toString() + Math.random(),
              type,
              text: label,
              icon: MessageSquare,
            },
          ]);
          return;
        }

        // ── Destination options (with dedup support) ───────────────────────────
        if (type === "destination_options") {
          const incoming: CuratedCity[] = options || [];
          if (append === true) {
            // Append mode: only add cities not already in the list
            setDestinationOptions((prev) => {
              const existingNames = new Set(prev.map((c) => c.city));
              const newOnly = incoming.filter((c) => !existingNames.has(c.city));
              return newOnly.length > 0 ? [...prev, ...newOnly] : prev;
            });
          } else {
            // Full replace (initial load)
            setDestinationOptions(incoming);
          }
          setCurrentPhase("extracting_destinations");
          setStatusMessage("Select your destinations...");
          // Emit graph event for initial load only (not append)
          if (!append) {
            setEvents((prev) => [
              ...prev,
              {
                id: Date.now().toString() + Math.random(),
                type: "destination_options",
                text: label || "Curated destinations ready for selection",
                icon: Map,
              },
            ]);
          }
          return;
        }

        // ── Extraction complete ────────────────────────────────────────────────
        if (type === "extraction_complete") {
          setCurrentQuestion(null);
          setCurrentQuestionType(null);
          setCurrentReview(null);
          setDestinationOptions([]);
          setCurrentPhase("discovery");
        }

        // ── Phase transitions ──────────────────────────────────────────────────
        if (type === "route_event")        setCurrentPhase("assembly");
        if (type === "city_plan_start")    setCurrentPhase("assembly");
        if (type === "city_plan_complete") setCurrentPhase("assembly");
        if (type === "trip_complete")      setCurrentPhase("completed");

        // ── Emit all other events into the graph ───────────────────────────────
        if (label) {
          const newEvent: AgentEvent = {
            id: Date.now().toString() + Math.random().toString(),
            type,
            text: label,
            icon: iconForType(type, label),
            city: city || undefined,
            allocation: parsed.allocation || undefined,
          };
          setEvents((prev) => [...prev, newEvent]);
          setStatusMessage(label.length > 60 ? label.slice(0, 58) + "…" : label);
        }

        if (type === "trip_complete") {
          eventSource.close();
        }
      } catch (err) {
        console.error("Failed to parse SSE data:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      setStatusMessage("Connection lost. Please refresh.");
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId]);

  const submitAnswer = useCallback(
    async (answer: unknown) => {
      if (!sessionId) return;
      setCurrentQuestion(null);
      setCurrentReview(null);
      setStatusMessage("Processing your response...");
      try {
        await fetch(`${API_URL}/plan/${sessionId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer }),
        });
      } catch (err) {
        console.error("Failed to submit answer:", err);
      }
    },
    [sessionId]
  );

  return {
    events,
    statusMessage,
    currentPhase,
    currentQuestion,
    currentPlaceholder,
    currentQuestionType,
    currentReview,
    destinationOptions,
    briefNodes,
    submitAnswer,
  };
}
