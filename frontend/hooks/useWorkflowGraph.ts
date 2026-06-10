"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { AgentEvent, PlanningPhase } from "./useAgentStream";

// ── Layout Constants ───────────────────────────────────────────────────────────

export const LANE_X: Record<number, number> = {
  0: 80,    // Extraction
  1: 500,   // Discovery
  2: 920,   // Optimization
  3: 1340,  // Assembly (multi-city columns will extend this)
  4: 1800,  // Reveal — will be pushed right if needed
};

export const NODE_W = 280;
export const NODE_H = 114;
export const NODE_GAP = 36;
export const NODE_V_STEP = NODE_H + NODE_GAP;  // 150 px
export const LANE_TOP_Y = 200;
export const CANVAS_W = 2800;
export const CANVAS_H = 2200;
export const CITY_COL_W = 320;  // width per city column in assembly lane
export const CITY_COL_GAP = 28;  // gap between city columns

export const LANE_LABELS: Record<number, string> = {
  0: "EXTRACTION",
  1: "DISCOVERY",
  2: "OPTIMIZATION",
  3: "ASSEMBLY",
  4: "REVEAL",
};

export const LANE_SEP_X = [442, 862, 1282, 1752];

// ── Agent Identity Palette ────────────────────────────────────────────────────

export const AGENT_PALETTE: Record<string, { color: string; bg: string }> = {
  "Control Agent": { color: "#0F2747", bg: "rgba(15,39,71,0.09)" },
  "Extraction Agent": { color: "#1e40af", bg: "rgba(30,64,175,0.09)" },
  "Destination Agent": { color: "#0d9488", bg: "rgba(13,148,136,0.09)" },
  "Weather Agent": { color: "#0ea5e9", bg: "rgba(14,165,233,0.09)" },
  "Hotel Agent": { color: "#f97316", bg: "rgba(249,115,22,0.09)" },
  "Transport Agent": { color: "#3b82f6", bg: "rgba(59,130,246,0.09)" },
  "Attraction Agent": { color: "#8b5cf6", bg: "rgba(139,92,246,0.09)" },
  "Budget Agent": { color: "#eab308", bg: "rgba(234,179,8,0.09)" },
  "Validation Agent": { color: "#10b981", bg: "rgba(16,185,129,0.09)" },
  "Stitching Agent": { color: "#ec4899", bg: "rgba(236,72,153,0.09)" },
  "Route Agent": { color: "#ef4444", bg: "rgba(239,68,68,0.09)" },
  "Itinerary Agent": { color: "#8b5cf6", bg: "rgba(139,92,246,0.09)" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type NodeStatus = "pending" | "active" | "completed";
export type EdgeType = "horizontal" | "vertical" | "converge";
export type NodeLane = 0 | 1 | 2 | 3 | 4;
export type RevealState = "idle" | "glowing" | "revealed";

export interface WorkflowNode {
  id: string;
  eventType: string;
  title: string;
  subtitle?: string;
  status: NodeStatus;
  lane: NodeLane;
  x: number;
  y: number;
  agentTag?: string;
  agentColor?: string;
  agentBg?: string;
  city?: string;
  isInputNode?: boolean;
  isSynthesis?: boolean;
  isCityHeader?: boolean;
  isSubNode?: boolean;
}

export interface WorkflowEdge {
  id: string;
  fromId: string;
  toId: string;
  animated: boolean;
  type: EdgeType;
}

export interface PhaseInfo {
  key: string;
  label: string;
  status: "pending" | "active" | "done";
}

// ── Edge path computation ─────────────────────────────────────────────────────

export function computeEdgePath(
  from: WorkflowNode,
  to: WorkflowNode,
  type: EdgeType,
  nodeDeltaMap?: Record<string, { dx: number; dy: number }>
): string {
  const fd = nodeDeltaMap?.[from.id] ?? { dx: 0, dy: 0 };
  const td = nodeDeltaMap?.[to.id] ?? { dx: 0, dy: 0 };

  const fx = from.x + fd.dx;
  const fy = from.y + fd.dy;
  const tx = to.x + td.dx;
  const ty = to.y + td.dy;

  // Use the actual rendered height — sub-nodes are shorter than standard nodes
  const SUB_H = 88;
  const fromH = from.isSubNode ? SUB_H : NODE_H;
  const toH = to.isSubNode ? SUB_H : NODE_H;

  if (type === "horizontal") {
    const x1 = fx + NODE_W;
    const y1 = fy + fromH / 2;
    const x2 = tx;
    const y2 = ty + toH / 2;
    const t = Math.abs(x2 - x1) * 0.48;
    return `M ${x1},${y1} C ${x1 + t},${y1} ${x2 - t},${y2} ${x2},${y2}`;
  }

  if (type === "vertical") {
    const x1 = fx + NODE_W / 2;
    const y1 = fy + fromH;
    const x2 = tx + NODE_W / 2;
    const y2 = ty;
    const t = Math.abs(y2 - y1) * 0.38;
    return `M ${x1},${y1} C ${x1},${y1 + t} ${x2},${y2 - t} ${x2},${y2}`;
  }

  if (type === "converge") {
    // Right-center of input node → Left-center of synthesis node (clean fan-in)
    const x1 = fx + NODE_W;
    const y1 = fy + fromH / 2;
    const x2 = tx;
    const y2 = ty + toH / 2;
    const span = Math.abs(x2 - x1) + Math.abs(y2 - y1);
    const cx1 = x1 + span * 0.35;
    const cy1 = y1;
    const cx2 = x2 - span * 0.15;
    const cy2 = y2;
    return `M ${x1},${y1} C ${cx1},${cy1} ${cx2},${cy2} ${x2},${y2}`;
  }

  return `M ${fx + NODE_W / 2},${fy + fromH} L ${tx + NODE_W / 2},${ty}`;
}

// ── Phase timeline ─────────────────────────────────────────────────────────────

export function computePhaseTimeline(
  currentPhase: PlanningPhase,
  events: AgentEvent[]
): PhaseInfo[] {
  const has = (types: string[], labels: string[] = []) =>
    events.some(e => types.includes(e.type) || labels.some(l => e.text?.includes(l)));

  const phases: PhaseInfo[] = [
    { key: "brief", label: "Brief", status: "pending" },
    { key: "discovery", label: "Discovery", status: "pending" },
    { key: "optimization", label: "Optimization", status: "pending" },
    { key: "assembly", label: "Assembly", status: "pending" },
    { key: "reveal", label: "Reveal", status: "pending" },
  ];

  if (currentPhase === "briefing" || currentPhase === "extracting_text" || currentPhase === "extracting_destinations") {
    phases[0].status = "active";
  }
  if (has(["brief_assembled", "extraction_complete"])) {
    phases[0].status = "done";
    phases[1].status = phases[1].status === "pending" ? "active" : phases[1].status;
  }
  if (currentPhase === "discovery") {
    if (phases[0].status !== "done") phases[0].status = "done";
    phases[1].status = "active";
  }
  if (has([], ["Agent scanning", "Agent analyzing", "Agent computing", "Pruning", "Validat", "Weather Agent", "Transport Agent", "Budget Agent"])) {
    phases[1].status = "done";
    phases[2].status = "active";
  }
  if (has(["city_plan_start", "city_hotel_search", "city_attraction_search"])) {
    phases[2].status = "done";
    phases[3].status = currentPhase === "completed" ? "done" : "active";
  }
  if (currentPhase === "completed") {
    phases.forEach(p => (p.status = "done"));
  }

  return phases;
}


// ── Agent classification ───────────────────────────────────────────────────────

function classifyAgent(eventType: string, text: string): keyof typeof AGENT_PALETTE {
  const l = text || "";
  if (eventType === "city_hotel_search") return "Hotel Agent";
  if (eventType === "city_attraction_search") return "Attraction Agent";
  if (eventType === "city_transport_search") return "Transport Agent";
  if (eventType === "city_weather_check") return "Weather Agent";
  if (eventType === "city_plan_start") return "Control Agent";
  if (eventType === "city_plan_complete") return "Stitching Agent";
  if (eventType === "trip_complete") return "Validation Agent";
  if (eventType === "hotel_event") return "Hotel Agent";
  if (eventType === "transport_event") return "Transport Agent";
  if (eventType === "weather_event") return "Weather Agent";
  if (eventType === "route_event") return "Itinerary Agent";
  if (eventType === "chat_question") return "Extraction Agent";
  if (eventType === "brief_node") return "Extraction Agent";
  if (eventType === "extraction_complete") return "Extraction Agent";
  if (eventType === "destination_options") return "Destination Agent";

  if (l.includes("Hotel Agent") || l.includes("hotel") || l.includes("Hotel")) return "Hotel Agent";
  if (l.includes("Weather Agent") || l.includes("weather") || l.includes("Weather") || l.includes("seasonal")) return "Weather Agent";
  if (l.includes("Transport Agent") || l.includes("transit") || l.includes("layover")) return "Transport Agent";
  if (l.includes("Attraction Agent") || l.includes("gems") || l.includes("landmark")) return "Attraction Agent";
  if (l.includes("Budget Agent") || l.includes("budget") || l.includes("Budget") || l.includes("cost")) return "Budget Agent";
  if (l.includes("Validation Agent") || l.includes("Validat") || l.includes("feasibility")) return "Validation Agent";
  if (l.includes("Destination Agent") || l.includes("Curating") || l.includes("destination")) return "Destination Agent";
  if (l.includes("Stitching Agent") || l.includes("Stitching") || l.includes("Assembl") || l.includes("Finaliz") || l.includes("blueprint") || l.includes("Synthesizing")) return "Stitching Agent";
  if (l.includes("Route Agent") || l.includes("Pruning") || l.includes("pruning")) return "Route Agent";
  if (l.includes("Itinerary Agent") || l.includes("Balancing") || l.includes("nights") || l.includes("pacing") || l.includes("Night Allocation")) return "Itinerary Agent";

  return "Control Agent";
}

// ── Event → display ───────────────────────────────────────────────────────────

export function mapEventToDisplay(eventType: string, rawText: string): {
  title: string;
  subtitle?: string;
  agentTag: string;
  agentColor: string;
  agentBg: string;
} {
  // Clean rawText: remove HTML, Emojis, fix common mojibake
  let text = rawText || "";
  text = text.replace(/<[^>]*>?/gm, ' '); // Strip HTML tags
  text = text.replace(/â€”/g, '—').replace(/â€"/g, '–').replace(/â€™/g, "'").replace(/â€œ/g, '"').replace(/â€ /g, '"'); // Fix common mojibake
  text = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{FE0F}⚠️✅]/gu, ""); // Strip common emojis
  text = text.replace(/\s+/g, ' ').trim(); // Normalize spaces

  const agentKey = classifyAgent(eventType, text);
  const { color: agentColor, bg: agentBg } = AGENT_PALETTE[agentKey];
  const agentTag = agentKey;
  const l = text;

  let title = "";
  let subtitle: string | undefined;

  // City-level events
  if (eventType === "city_plan_start") { title = l.replace(/Planning |\.\.\.$/g, "").trim() || "City Planning"; subtitle = "Spawning city workflow cluster"; }
  else if (eventType === "city_hotel_search") { title = "Hotels"; subtitle = l || "Sourcing accommodation"; }
  else if (eventType === "city_attraction_search") { title = "Attractions"; subtitle = l || "Discovering experiences"; }
  else if (eventType === "city_transport_search") { title = "Transit"; subtitle = l || "Checking travel routes"; }
  else if (eventType === "city_weather_check") { title = "Climate Check"; subtitle = l || "Reading seasonal data"; }
  else if (eventType === "city_plan_complete") { title = "Blueprint Ready"; subtitle = l || "City plan complete"; }
  else if (eventType === "trip_complete") { title = "Expedition Blueprint"; subtitle = "Your journey is assembled"; }
  else if (eventType === "hotel_event") { title = "Sourcing Accommodations"; subtitle = l || "Curating stays"; }
  else if (eventType === "transport_event") { title = "Transit Verification"; subtitle = l || "Rail, road & air"; }
  else if (eventType === "weather_event") { title = "Seasonal Conditions"; subtitle = l || "Climate analysis"; }
  else if (eventType === "route_event") { title = "Day Experiences"; subtitle = l || "City-by-city plan"; }
  else if (eventType === "chat_question") { title = "Concierge Asks"; subtitle = l; }
  else if (eventType === "brief_node") {
    // Infer the parameter type from the label text itself
    if (l.startsWith("From ")) { title = "Origin"; subtitle = l.replace("From ", ""); }
    else if (l.endsWith(" Days") || l.match(/^\d+ Days?$/)) { title = "Duration"; subtitle = l; }
    else if (l === "Relaxed" || l === "Moderate" || l === "Packed") { title = "Travel Pace"; subtitle = l; }
    else if (l.includes("₹") || l.includes("Up to")) { title = "Budget Range"; subtitle = l; }
    else if (l.includes(" ") && (l.includes("Solo") || l.includes("Couple") || l.includes("Family") || l.includes("Group"))) { title = "Travellers"; subtitle = l; }
    else if (l.includes("Train") || l.includes("Flight") || l.includes("Road") || l.includes("AI Optimized") || l.includes("Public")) { title = "Transport"; subtitle = l; }
    else if (["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].some(m => l.includes(m))) { title = "Travel Month"; subtitle = l; }
    else { title = "Destination"; subtitle = l; }
  }
  else if (eventType === "extraction_complete") { title = "Trip Brief Assembled"; subtitle = "All parameters captured"; }
  else if (eventType === "destination_options") { title = "Destination Discovery"; subtitle = "Select your expedition hubs"; }
  else {
    // Label-based
    if (l.includes("Initializing") || l.includes("expedition")) { title = "Reading Trip Brief"; subtitle = "Parsing your brief"; }
    else if (l.includes("Extracting") || l.includes("parameters")) { title = "Extracting Parameters"; subtitle = "Origin · Dates · Preferences"; }
    else if (l.includes("Curating") && l.includes("destination")) { title = "Curating Destinations"; subtitle = "Scanning regional hubs"; }
    else if (l.includes("Deep Researching")) { title = "Deep Research Mode"; subtitle = "Scanning destination data"; }
    else if (l.includes("Pruning accepted") || l.includes("Pruning rejected")) { title = "Pruning Complete"; subtitle = "Resolving itinerary boundaries"; }
    else if (l.includes("Pruning") || l.includes("pruning")) { title = "Pruning Routes"; subtitle = "Removing weak branches"; }
    else if (l.includes("Validat") || l.includes("feasibility")) { title = "Feasibility Check"; subtitle = l || "Checking constraints"; }
    else if (l.includes("Orchestrat")) { title = "Orchestrating Agents"; subtitle = "All systems engaged"; }
    else if (l.includes("Stitching") || l.includes("blueprint")) { title = "Final Assembly"; subtitle = "Building the journey"; }
    else if (l.includes("Balancing") || l.includes("nights")) { title = "Pacing Optimization"; subtitle = "Balancing rest & travel"; }
    else if (l.includes("Discover") || l.includes("hidden gems")) { title = "Hidden Gems"; subtitle = "Scanning regional landmarks"; }
    else if (l.includes("Assembl") || l.includes("assembl")) { title = "Itinerary Assembly"; subtitle = "Building journey structure"; }
    else if (l.includes("Finaliz")) { title = "Finalizing Journal"; subtitle = "Stitching the narrative"; }
    else if (l.includes("Synthesizing")) { title = "Final Assembly"; subtitle = "Compiling the final itinerary"; }
    else if (l.includes("Budget") || l.includes("budget")) { title = "Budget Validation"; subtitle = l; }
    else if (l.includes("Agent scanning")) { title = "Destination Scan"; subtitle = "Curating regional hubs"; }
    else if (l.includes("Agent analyzing")) { title = "Seasonal Analysis"; subtitle = "Reading climate patterns"; }
    else if (l.includes("Agent computing")) { title = "Route Computation"; subtitle = "Optimizing travel paths"; }
    else if (l.includes("Agent sourcing")) { title = "Sourcing Stays"; subtitle = "Finding accommodations"; }
    else if (l.includes("Agent collecting")) { title = "Collecting Gems"; subtitle = "Gathering landmark data"; }
    else if (l.includes("Agent validating") || l.includes("Agent checking")) { title = "Agent Validation"; subtitle = l; }
    else { title = l || "Processing..."; subtitle = undefined; }
  }

  return { title, subtitle, agentTag, agentColor, agentBg };
}

// ── Lane mapping ──────────────────────────────────────────────────────────────

function getLane(eventType: string, text: string): NodeLane {
  if (eventType === "trip_complete") return 4;
  if (eventType === "city_plan_start") return 3;
  if (eventType === "city_hotel_search") return 3;
  if (eventType === "city_attraction_search") return 3;
  if (eventType === "city_transport_search") return 3;
  if (eventType === "city_weather_check") return 3;
  if (eventType === "city_plan_complete") return 3;
  if (eventType === "hotel_event") return 3;
  if (eventType === "transport_event") return 3;
  if (eventType === "route_event") return 3;
  if (eventType === "weather_event") return 2;
  if (eventType === "chat_question") return 0;
  if (eventType === "brief_node") return 0;
  if (eventType === "extraction_complete") return 0;
  if (eventType === "destination_options") return 1;

  const l = text;
  if (l.includes("Initializing") || l.includes("Extracting") || l.includes("Reading trip")) return 0;
  if ((l.includes("Curating") && l.includes("destination")) || l.includes("Deep Researching") || l.includes("sub-destinations")) return 1;
  if (l.includes("Agent scanning") || l.includes("Agent analyzing") || l.includes("Agent computing") || l.includes("Agent sourcing") || l.includes("Agent collecting") || l.includes("Agent validating") || l.includes("Agent checking")) return 2;
  if (l.includes("Pruning") || l.includes("pruning") || l.includes("Validat") || l.includes("feasibility")) return 2;
  if (l.includes("transit") || l.includes("layover") || l.includes("weather") || l.includes("Weather") || l.includes("seasonal")) return 2;
  if (l.includes("Budget") || l.includes("budget")) return 2;
  if (l.includes("Balancing") || l.includes("nights") || l.includes("pacing")) return 4;
  if (l.includes("Orchestrat") || l.includes("Drafting") || l.includes("Finaliz") || l.includes("Assembl") || l.includes("Stitching") || l.includes("blueprint") || l.includes("Synthesizing")) return 4;

  return 2; // default: optimization lane
}

// ── Thinking messages ─────────────────────────────────────────────────────────

const THINKING_MSGS = [
  "Mapping scenic clusters...",
  "Checking altitude transitions...",
  "Evaluating weather windows...",
  "Matching hotel inventory...",
  "Scoring transport routes...",
  "Analyzing cultural density...",
  "Computing travel fatigue index...",
  "Cross-referencing landmarks...",
  "Optimizing night allocation...",
  "Validating road accessibility...",
  "Scanning hidden regional gems...",
  "Balancing pace and rest days...",
];

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useWorkflowGraph(events: AgentEvent[], currentPhase: PlanningPhase) {
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [thinkingMsg, setThinkingMsg] = useState<string | null>(null);
  const [revealState, setRevealState] = useState<RevealState>("idle");
  const [nodeDeltaMap, setNodeDeltaMap] = useState<Record<string, { dx: number; dy: number }>>({});

  // Mutable refs — not causing re-renders
  const processedIds = useRef(new Set<string>());
  const laneCount = useRef<Record<number, number>>({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 });
  const lastInLane = useRef<Record<number, string | null>>({ 0: null, 1: null, 2: null, 3: null, 4: null });
  const lastEventTime = useRef(Date.now());
  const thinkingIdx = useRef(0);
  const inputNodeIds = useRef<string[]>([]);    // Track extraction question nodes for converge edges
  const revealFired = useRef(false);
  const finalAssemblyFired = useRef(false); // Guard: render Final Assembly node only once

  // City cluster tracking: city → { headerNodeId, colIndex, subCount }
  const cityMap = useRef<Map<string, { headerNodeId: string; colIndex: number; subCount: number }>>(new Map());
  const cityColCount = useRef(0);

  // ── Init: start node ────────────────────────────────────────────────────────
  useEffect(() => {
    const id = "node-start";
    const lane = 0 as NodeLane;
    const pal = AGENT_PALETTE["Control Agent"];
    setNodes([{
      id, eventType: "start",
      title: "Expedition Initiated", subtitle: "AI travel intelligence online",
      status: "completed", lane, x: LANE_X[lane], y: LANE_TOP_Y,
      agentTag: "Control Agent", agentColor: pal.color, agentBg: pal.bg,
    }]);
    laneCount.current[0] = 1;
    lastInLane.current[0] = id;
    setActiveNodeId(id);
  }, []);

  // ── Process new events ────────────────────────────────────────────────────────
  useEffect(() => {
    const newEvents = events.filter(e => !processedIds.current.has(e.id));
    if (!newEvents.length) return;

    lastEventTime.current = Date.now();

    // We collect all nodes and edges to add in this batch
    const batchNodes: WorkflowNode[] = [];
    const batchEdges: WorkflowEdge[] = [];

    for (const event of newEvents) {
      processedIds.current.add(event.id);

      const { title, subtitle, agentTag, agentColor, agentBg } = mapEventToDisplay(event.type, event.text);

      // ── input nodes (chat_question & brief_node) ───────────────────────
      if (event.type === "chat_question" || event.type === "brief_node") {
        const inputIdx = inputNodeIds.current.length;
        // Two-column fan-in layout:
        //   even indices → left column (xOff=0)
        //   odd  indices → right column (xOff=160)
        // Each column has its own running Y, interleaved for natural spacing.
        const isLeft = inputIdx % 2 === 0;
        const xOff = isLeft ? 0 : 160;
        const colIdx = Math.floor(inputIdx / 2);
        const y = LANE_TOP_Y + (laneCount.current[0] + colIdx) * NODE_V_STEP;

        const node: WorkflowNode = {
          id: event.id, eventType: event.type,
          title: title, subtitle: subtitle,
          status: "active", lane: 0, x: LANE_X[0] + xOff, y,
          agentTag, agentColor, agentBg, isInputNode: true,
        };

        // Only chain a vertical edge from the very first node (Expedition Initiated → first input)
        if (inputNodeIds.current.length === 0 && lastInLane.current[0]) {
          batchEdges.push({ id: `ev-${lastInLane.current[0]}-${event.id}`, fromId: lastInLane.current[0]!, toId: event.id, animated: true, type: "vertical" });
        }

        inputNodeIds.current.push(event.id);
        // Only increment Y counter for left-column nodes (right-column shares the row)
        if (isLeft) laneCount.current[0]++;
        lastInLane.current[0] = event.id;
        batchNodes.push(node);
        continue;
      }

      // ── extraction_complete → synthesis node with converging edges ─────────
      if (event.type === "extraction_complete") {
        // Synthesis sits centered vertically between the input nodes
        const colRows = Math.ceil(inputNodeIds.current.length / 2);
        const synthY = LANE_TOP_Y + ((colRows - 1) / 2 + 1.5) * NODE_V_STEP;
        const synthX = LANE_X[0] + 320;  // Midway to LANE_X[1]

        const node: WorkflowNode = {
          id: event.id, eventType: "extraction_complete",
          title: "Trip Brief Assembled", subtitle: "All parameters captured",
          status: "active", lane: 0, x: synthX, y: synthY,
          agentTag, agentColor, agentBg, isSynthesis: true,
        };

        // Converge edges from all input nodes → synthesis (right-to-left fan-in)
        for (const inputId of inputNodeIds.current) {
          batchEdges.push({ id: `conv-${inputId}-${event.id}`, fromId: inputId, toId: event.id, animated: true, type: "converge" });
        }
        if (inputNodeIds.current.length === 0 && lastInLane.current[0]) {
          batchEdges.push({ id: `ev-${lastInLane.current[0]}-${event.id}`, fromId: lastInLane.current[0]!, toId: event.id, animated: true, type: "vertical" });
        }

        laneCount.current[0] = laneCount.current[0] + colRows + 1;
        lastInLane.current[0] = event.id;
        batchNodes.push(node);
        continue;
      }

      // ── city_plan_start → city header node ────────────────────────────────
      if (event.type === "city_plan_start" && event.city) {
        const city = event.city;
        if (!cityMap.current.has(city)) {
          const colIdx = cityColCount.current++;
          const cityX = LANE_X[3] + colIdx * (CITY_COL_W + CITY_COL_GAP);

          const node: WorkflowNode = {
            id: event.id, eventType: "city_plan_start",
            title: city, subtitle: "Planning city workflow...",
            status: "active", lane: 3, x: cityX, y: LANE_TOP_Y,
            agentTag, agentColor, agentBg, city, isCityHeader: true,
          };

          cityMap.current.set(city, { headerNodeId: event.id, colIndex: colIdx, subCount: 0 });

          // Horizontal edge from the Night Allocation hub (last in Lane 2) or Optimization node
          const prevId = lastInLane.current[2] || lastInLane.current[1] || lastInLane.current[0];
          if (prevId) {
            batchEdges.push({ id: `eh-${prevId}-${event.id}`, fromId: prevId, toId: event.id, animated: true, type: "horizontal" });
          }

          lastInLane.current[3] = event.id;
          batchNodes.push(node);
        }
        continue;
      }

      // ── City sub-events (hotel/attraction/transport/weather/complete) ─────
      const isCitySubEvent = [
        "city_hotel_search", "city_attraction_search",
        "city_transport_search", "city_weather_check", "city_plan_complete"
      ].includes(event.type);

      if (isCitySubEvent && event.city) {
        const city = event.city;
        const cluster = cityMap.current.get(city);

        if (cluster) {
          const colIdx = cluster.colIndex;
          const subIdx = cluster.subCount;
          cluster.subCount++;

          const cityX = LANE_X[3] + colIdx * (CITY_COL_W + CITY_COL_GAP);
          // Give extra Y space to the first sub-node to accommodate two branches
          const extraY = subIdx >= 0 ? 160 : 0;
          const y = LANE_TOP_Y + (subIdx + 1) * NODE_V_STEP + extraY;

          const node: WorkflowNode = {
            id: event.id, eventType: event.type, title, subtitle,
            status: "active", lane: 3, x: cityX, y,
            agentTag, agentColor, agentBg, city, isSubNode: true,
          };

          // Vertical edge: from prev sub-node or city header
          const prevId = subIdx === 0
            ? cluster.headerNodeId
            : batchNodes.findLast(n => n.city === city && n.isSubNode)?.id
            ?? (nodes.findLast ? nodes.findLast(n => n.city === city && n.isSubNode)?.id : undefined)
            ?? cluster.headerNodeId;

          if (prevId) {
            batchEdges.push({ id: `cv-${prevId}-${event.id}`, fromId: prevId, toId: event.id, animated: true, type: "vertical" });
          }

          batchNodes.push(node);
        }
        continue;
      }

      // ── night_allocation → hub + per-city night nodes, placed RIGHT AFTER city columns ──────
      if (event.type === "night_allocation") {
        const pal = AGENT_PALETTE["Itinerary Agent"];
        const alloc: Record<string, number> = event.allocation || {};
        
        // Place the night allocation column right after all city planning columns.
        // We add 200px padding so we have room to safely fan the sub-nodes to the left and right.
        const nightColX = LANE_X[3] + cityColCount.current * (CITY_COL_W + CITY_COL_GAP) + 200;
        const lane = 4 as NodeLane;

        const hubY = LANE_TOP_Y;

        // Hub node
        const hubId = event.id + "-hub";
        const hubNode: WorkflowNode = {
          id: hubId, eventType: "night_allocation",
          title: "Night Allocation", subtitle: "Distributing nights across cities",
          status: "active", lane, x: nightColX, y: hubY,
          agentTag: "Itinerary Agent", agentColor: pal.color, agentBg: pal.bg,
        };

        // Connect from the last city planning node (bottom of the longest city column) to the hub
        const lastLane3Node = batchNodes.findLast(n => n.lane === 3) || nodes.findLast(n => n.lane === 3);
        if (lastLane3Node) {
          batchEdges.push({ id: `eh-${lastLane3Node.id}-${hubId}`, fromId: lastLane3Node.id, toId: hubId, animated: true, type: "horizontal" });
        } else if (lastInLane.current[2]) {
          batchEdges.push({ id: `eh-${lastInLane.current[2]}-${hubId}`, fromId: lastInLane.current[2]!, toId: hubId, animated: true, type: "horizontal" });
        }

        laneCount.current[lane]++;
        batchNodes.push(hubNode);

        const cities = Object.entries(alloc);
        const nightAllocationIds: string[] = [];

        cities.forEach(([city, nights], ci) => {
          const subId = `${event.id}-night-${city}`;
          const subY = hubY + (ci + 1) * NODE_V_STEP;
          
          // Zig-zag offsets to prevent edges from overlapping vertically (recreating the fan-out layout)
          const staggerOffsets = [220, 0, -180, 360, 110, -90];
          const subX = nightColX + staggerOffsets[ci % staggerOffsets.length];

          const subNode: WorkflowNode = {
            id: subId, eventType: "night_allocation_sub",
            title: city, subtitle: `${nights} night${nights !== 1 ? "s" : ""} allocated`,
            status: "active", lane: 4, x: subX, y: subY,
            agentTag: "Itinerary Agent", agentColor: pal.color, agentBg: pal.bg,
          };

          batchNodes.push(subNode);
          batchEdges.push({ id: `ev-${hubId}-${subId}`, fromId: hubId, toId: subId, animated: true, type: "vertical" });
          nightAllocationIds.push(subId);
          laneCount.current[lane]++;
        });

        lastInLane.current[lane] = nightAllocationIds.length > 0 ? nightAllocationIds[nightAllocationIds.length - 1] : hubId;
        continue;
      }

      // ── system_event (Final Assembly / Stitching) — render only ONCE ─────────────────────
      if (event.type === "system_event" && (title === "Final Assembly" || title === "Itinerary Assembly")) {
        // Guard: only render a single Final Assembly synthesis node across the entire session.
        if (finalAssemblyFired.current) continue;
        finalAssemblyFired.current = true;

        const lane = 3 as NodeLane;
        const maxSubCount = Array.from(cityMap.current.values()).reduce((max, c) => Math.max(max, c.subCount), 0);
        const synthY = LANE_TOP_Y + (maxSubCount + 1.5) * NODE_V_STEP;

        const firstCityX = LANE_X[3];
        const lastCityX = LANE_X[3] + Math.max(0, cityColCount.current - 1) * (CITY_COL_W + CITY_COL_GAP);
        const synthX = firstCityX + (lastCityX - firstCityX) / 2;

        const node: WorkflowNode = {
          id: event.id, eventType: event.type, title, subtitle,
          status: "active", lane, x: synthX, y: synthY,
          agentTag, agentColor, agentBg, isSynthesis: true,
        };

        // Fan-in from all city columns
        cityMap.current.forEach((cluster, city) => {
          const prevId = batchNodes.findLast(n => n.city === city && n.isSubNode)?.id
            ?? (nodes.findLast ? nodes.findLast(n => n.city === city && n.isSubNode)?.id : undefined)
            ?? cluster.headerNodeId;

          if (prevId) {
            batchEdges.push({ id: `conv-${prevId}-${event.id}`, fromId: prevId, toId: event.id, animated: true, type: "converge" });
          }
        });

        lastInLane.current[lane] = event.id;
        batchNodes.push(node);
        continue;
      }

      // ── trip_complete → reveal sequence ───────────────────────────────────
      if (event.type === "trip_complete") {
        if (!revealFired.current) {
          revealFired.current = true;

          // Dynamically place reveal node beyond city columns AND the night allocation column.
          // Night allocation sits at: LANE_X[3] + cityColCount * (CITY_COL_W + CITY_COL_GAP) + 60
          // So the reveal goes one full column further.
          const revealX = LANE_X[3] + (cityColCount.current + 1) * (CITY_COL_W + CITY_COL_GAP) + 80;

          const node: WorkflowNode = {
            id: event.id, eventType: "trip_complete",
            title: "Expedition Blueprint", subtitle: "Your journey is assembled",
            status: "active", lane: 4, x: revealX, y: LANE_TOP_Y,
            agentTag, agentColor, agentBg,
          };

          // Prefer connecting from night allocation (lane 4) → reveal, then fall back to city/optimization lanes.
          const prevId = lastInLane.current[4] || lastInLane.current[3] || lastInLane.current[2] || lastInLane.current[1];
          if (prevId) {
            batchEdges.push({ id: `eh-${prevId}-${event.id}`, fromId: prevId, toId: event.id, animated: true, type: "horizontal" });
          }

          lastInLane.current[4] = event.id;
          batchNodes.push(node);

          // Trigger the glow cascade after a short freeze
          setTimeout(() => {
            setRevealState("glowing");
            // After glow completes, set revealed
            setTimeout(() => {
              setRevealState("revealed");
            }, 2400);
          }, 600);
        }
        continue;
      }

      // ── Standard node ─────────────────────────────────────────────────────
      const lane = getLane(event.type, event.text) as NodeLane;
      const y = LANE_TOP_Y + laneCount.current[lane] * NODE_V_STEP;

      const node: WorkflowNode = {
        id: event.id, eventType: event.type, title, subtitle,
        status: "active", lane, x: LANE_X[lane], y,
        agentTag, agentColor, agentBg,
      };

      laneCount.current[lane]++;

      const prevSameLane = lastInLane.current[lane];
      if (prevSameLane) {
        batchEdges.push({ id: `ev-${prevSameLane}-${event.id}`, fromId: prevSameLane, toId: event.id, animated: true, type: "vertical" });
      } else {
        // First in this lane → horizontal from nearest previous lane
        for (let pl = lane - 1; pl >= 0; pl--) {
          const prev = lastInLane.current[pl];
          if (prev) {
            batchEdges.push({ id: `eh-${prev}-${event.id}`, fromId: prev, toId: event.id, animated: true, type: "horizontal" });
            break;
          }
        }
      }

      lastInLane.current[lane] = event.id;
      batchNodes.push(node);
    }

    if (!batchNodes.length && !batchEdges.length) return;

    // Set active node to the last one added
    const lastNode = batchNodes[batchNodes.length - 1];
    if (lastNode) setActiveNodeId(lastNode.id);

    // Apply batch updates
    setNodes(prev => {
      const cooled = prev.map(n => n.status === "active" ? { ...n, status: "completed" as NodeStatus } : n);
      return [...cooled, ...batchNodes];
    });

    setEdges(prev => {
      const cooled = prev.map(e => ({ ...e, animated: false }));
      return [...cooled, ...batchEdges];
    });
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Thinking messages during silence ──────────────────────────────────────
  useEffect(() => {
    if (currentPhase === "completed") return;
    const iv = setInterval(() => {
      if (Date.now() - lastEventTime.current > 12000) {
        setThinkingMsg(THINKING_MSGS[thinkingIdx.current % THINKING_MSGS.length]);
        thinkingIdx.current++;
        setTimeout(() => setThinkingMsg(null), 5000);
      }
    }, 14000);
    return () => clearInterval(iv);
  }, [currentPhase]);

  // ── Node drag management ────────────────────────────────────────────────────
  const updateNodeDelta = useCallback((id: string, dx: number, dy: number) => {
    setNodeDeltaMap(prev => ({ ...prev, [id]: { dx, dy } }));
  }, []);

  return { nodes, edges, activeNodeId, thinkingMsg, revealState, nodeDeltaMap, updateNodeDelta };
}
