"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import EditorialCanvas from "@/components/dashboard/EditorialCanvas";
import MapOverlay from "@/components/dashboard/MapOverlay";
import JourneyGateway from "@/components/dashboard/JourneyGateway";
import JourneyBriefing, { type TripBrief } from "@/components/dashboard/JourneyBriefing";
import WorkflowCanvas from "@/components/dashboard/WorkflowCanvas";
import { RouteProvider } from "@/components/dashboard/RouteContext";
import { useAgentStream } from "@/hooks/useAgentStream";
import ErrorBoundary from "@/components/ErrorBoundary";

export type AppState = 'landing' | 'briefing' | 'assembling' | 'completed';

export default function Dashboard() {
  const [appState, setAppState] = useState<AppState>('landing');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [finalTripData, setFinalTripData] = useState<any>(null);
  const [briefData, setBriefData] = useState<TripBrief | null>(null);

  // Global Agent Stream Hook
  const {
    events, statusMessage, currentPhase,
    currentQuestion, currentPlaceholder, currentQuestionType,
    currentReview, destinationOptions, submitAnswer,
  } = useAgentStream(sessionId);

  // Complete Phase trigger
  const handleReveal = async () => {
    if (appState === 'completed' || !sessionId) return;
    try {
      const res = await fetch(`http://localhost:8000/plan/${sessionId}`);
      const data = await res.json();
      setFinalTripData(data.options?.[0] ?? data);
    } catch (err) {
      console.error("Failed to fetch final trip data:", err);
    }
    setAppState('completed');
  };

  // Fallback
  useEffect(() => {
    if (currentPhase === 'completed' && appState !== 'completed' && sessionId) {
      const t = setTimeout(() => handleReveal(), 4200);
      return () => clearTimeout(t);
    }
  }, [currentPhase, appState, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Launch from Journey Brief — POST to /plan/brief
  const handleLaunch = async (brief: TripBrief) => {
    setBriefData(brief);
    setAppState('assembling');
    try {
      const res = await fetch("http://localhost:8000/plan/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brief),
      });
      const data = await res.json();
      if (data.session_id) {
        setSessionId(data.session_id);
      }
    } catch (error) {
      console.error("Failed to start planning session:", error);
    }
  };

  return (
    <ErrorBoundary>
      <div className="w-full h-screen overflow-hidden bg-[var(--color-warm-cream)]">
        <AnimatePresence>

          {/* PHASE 0: LANDING PAGE — JourneyGateway (TravelPinboard + HeroFlightPath) */}
          {appState === 'landing' && (
            <motion.div
              key="landing-gateway"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
              className="w-full h-full overflow-y-auto"
            >
              <JourneyGateway onStartPlanning={() => setAppState('briefing')} />
            </motion.div>
          )}

          {/* PHASE 1: JOURNEY BRIEFING (replaces old chat-based idle/planning) */}
          {appState === 'briefing' && (
            <motion.div
              key="journey-briefing"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="w-full h-full overflow-y-auto"
            >
              <JourneyBriefing onLaunch={handleLaunch} />
            </motion.div>
          )}

          {/* PHASE 2 & 3: ACTIVE PLANNING (full-width — no AgentDesk side panel) */}
          {(appState === 'assembling') && (
            <motion.main
              key="planner-layout"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="absolute inset-0 w-full h-screen pointer-events-auto"
            >
              <RouteProvider>
                <WorkflowCanvas
                  key="workflow-canvas"
                  currentPhase={currentPhase}
                  statusMessage={statusMessage}
                  destinationOptions={destinationOptions}
                  currentReview={currentReview}
                  submitAnswer={submitAnswer}
                  events={events}
                  onReveal={handleReveal}
                  briefData={briefData}
                  currentQuestion={currentQuestion}
                  currentPlaceholder={currentPlaceholder}
                  currentQuestionType={currentQuestionType}
                />
              </RouteProvider>
            </motion.main>
          )}

          {/* PHASE 4: Final Editorial Reveal */}
          {appState === 'completed' && (
            <motion.div
              key="editorial-canvas"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, ease: "easeInOut" }}
              className="absolute inset-0 w-full h-full"
            >
              <RouteProvider>
                <EditorialCanvas tripData={finalTripData} briefData={briefData} />
                {finalTripData && <MapOverlay tripData={finalTripData} />}
              </RouteProvider>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
