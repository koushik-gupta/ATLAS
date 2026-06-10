"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Compass, CheckCircle2, RefreshCw, Move } from "lucide-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { PlanningPhase, CuratedCity, AgentEvent } from "@/hooks/useAgentStream";
import DestinationCard from "./DestinationCard";

interface LivePlanningCanvasProps {
  currentPhase?: PlanningPhase;
  statusMessage?: string;
  destinationOptions?: CuratedCity[];
  submitAnswer?: (ans: any) => void;
  events?: AgentEvent[];
}

export default function LivePlanningCanvas({ 
  currentPhase = "discovery", 
  statusMessage = "Analyzing terrain...", 
  destinationOptions = [],
  submitAnswer,
  events = []
}: LivePlanningCanvasProps) {
  
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsLoadingMore(false);
  }, [destinationOptions.length]);

  const handleToggle = (city: string) => {
    setSelectedCities(prev => 
      prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]
    );
  };

  const handleConfirm = () => {
    if (submitAnswer) {
      submitAnswer({ action: "confirm", selections: selectedCities });
      setSelectedCities([]);
    }
  };

  const handleLoadMore = () => {
    if (submitAnswer && !isLoadingMore) {
      setIsLoadingMore(true);
      submitAnswer({ action: "more" });
    }
  };

  // Group events to reduce clutter
  const displayEvents = events.filter((e, i, arr) => {
    if (i === 0) return true;
    return e.type !== arr[i-1].type || e.type === 'destination_options'; 
  });

  return (
    <motion.div 
      key="workflow-canvas"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
      className="flex-1 h-full relative overflow-hidden bg-[var(--color-warm-cream)] z-0"
    >
      {/* HUD OVERLAYS */}
      <div className="absolute top-6 left-6 z-50 pointer-events-none">
        <div className="px-4 py-2 bg-white/70 backdrop-blur-md rounded-full shadow-sm border border-[var(--color-deep-ocean)]/10 text-xs font-semibold tracking-widest uppercase text-[var(--color-deep-ocean)] flex items-center gap-2">
          <Move size={14} className="opacity-50" />
          <span>Infinite Workflow Canvas</span>
        </div>
      </div>

      <div className="absolute bottom-6 left-6 z-50 pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={statusMessage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="px-5 py-3 bg-[var(--color-deep-ocean)] text-[var(--color-warm-cream)] rounded-xl shadow-lg text-sm font-medium tracking-wide flex items-center gap-3"
          >
            <Compass size={16} className="animate-spin-slow opacity-80" />
            {statusMessage}
          </motion.div>
        </AnimatePresence>
      </div>

      <TransformWrapper
        initialScale={0.8}
        initialPositionX={200}
        initialPositionY={100}
        minScale={0.2}
        maxScale={2}
        limitToBounds={false}
        wheel={{ step: 0.03 }}
        panning={{ velocityDisabled: false }}
      >
        {({ zoomIn, zoomOut, setTransform }) => (
          <TransformComponent 
            wrapperStyle={{ width: "100%", height: "100%" }} 
            wrapperClass="cursor-grab active:cursor-grabbing" 
            contentClass="w-[4000px] h-[3000px] relative"
          >
            
            {/* AMBIENT BACKGROUND (Plus Grid) */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.15] bg-plus-grid" style={{ width: 4000, height: 3000 }} />
            
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="route-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--color-deep-ocean)" stopOpacity="0.1" />
                  <stop offset="50%" stopColor="var(--color-deep-ocean)" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="var(--color-sunset-orange)" stopOpacity="0.1" />
                </linearGradient>
              </defs>
              
              {/* Dynamic Connecting Edges based on events */}
              {displayEvents.map((evt, idx) => {
                if (idx === 0) return null;
                const prevX = 400 + (idx - 1) * 350;
                const prevY = 1500 + Math.sin(idx - 1) * 200;
                const curX = 400 + idx * 350;
                const curY = 1500 + Math.sin(idx) * 200;
                
                return (
                  <motion.path 
                    key={`edge-${idx}`}
                    d={`M ${prevX+150},${prevY+50} Q ${(prevX+curX)/2},${prevY-100} ${curX},${curY+50}`} 
                    fill="none" 
                    stroke="url(#route-gradient)" 
                    strokeWidth="3"
                    strokeDasharray="6 6"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1.5, ease: "easeInOut" }}
                  />
                );
              })}
            </svg>

            {/* DYNAMIC WORKFLOW NODES */}
            {displayEvents.map((event, idx) => {
              const xPos = 400 + idx * 350;
              const yPos = 1500 + Math.sin(idx) * 200;
              const isLast = idx === displayEvents.length - 1;

              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className={`absolute w-[300px] p-5 rounded-2xl border backdrop-blur-md shadow-xl ${isLast ? 'bg-white border-[var(--color-sunset-orange)]/30 ring-4 ring-[var(--color-sunset-orange)]/10' : 'bg-white/80 border-[var(--color-deep-ocean)]/10'}`}
                  style={{ left: xPos, top: yPos }}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl ${isLast ? 'bg-[var(--color-sunset-orange)]/10 text-[var(--color-sunset-orange)]' : 'bg-[var(--color-deep-ocean)]/5 text-[var(--color-deep-ocean)]'}`}>
                      <event.icon size={24} strokeWidth={2} />
                    </div>
                    <div>
                      <h4 className="font-sans text-xs tracking-[0.2em] uppercase font-semibold text-[var(--color-deep-ocean)]/50 mb-1">
                        Phase 0{idx + 1}
                      </h4>
                      <p className="font-serif text-lg leading-tight text-[var(--color-deep-ocean)]">
                        {event.text}
                      </p>
                    </div>
                  </div>
                  
                  {isLast && (
                    <motion.div 
                      className="absolute -bottom-2 -right-2 w-4 h-4 bg-[var(--color-sunset-orange)] rounded-full"
                      animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}
                </motion.div>
              );
            })}

            {/* CURATION DISCOVERY CLUSTER */}
            <AnimatePresence>
              {currentPhase === "extracting_destinations" && destinationOptions.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.8 }}
                  className="absolute"
                  style={{ 
                    left: 400 + displayEvents.length * 350 - 150, 
                    top: 1500 + Math.sin(displayEvents.length) * 200 - 300 
                  }}
                >
                  <div className="w-[1200px] p-12 bg-white/40 backdrop-blur-xl border border-[var(--color-deep-ocean)]/10 rounded-3xl shadow-2xl">
                    <div className="mb-10 flex items-center justify-between">
                      <div>
                        <h3 className="font-serif text-4xl text-[var(--color-deep-ocean)] mb-2">
                          Destination Curation
                        </h3>
                        <p className="text-sm font-sans uppercase tracking-widest text-[var(--color-deep-ocean)]/60">
                          Select the hubs for your itinerary
                        </p>
                      </div>
                      
                      <button
                        onClick={handleConfirm}
                        disabled={selectedCities.length === 0}
                        className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold shadow-md transition-all ${selectedCities.length > 0 ? 'bg-emerald-500 hover:bg-emerald-600 text-white hover:scale-105' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                      >
                        <CheckCircle2 size={18} />
                        Confirm {selectedCities.length > 0 ? selectedCities.length : ''} Selection
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-6">
                      <AnimatePresence>
                        {destinationOptions.map((city, idx) => (
                          <DestinationCard
                            key={`${city.city}-${idx}`}
                            city={city.city}
                            image={city.image}
                            description={city.description}
                            isSelected={selectedCities.includes(city.city)}
                            onToggle={() => handleToggle(city.city)}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                    
                    <div className="mt-10 flex justify-center border-t border-[var(--color-deep-ocean)]/5 pt-8">
                      <button
                        onClick={handleLoadMore}
                        disabled={isLoadingMore}
                        className={`flex items-center gap-2 px-6 py-3 rounded-full text-[var(--color-deep-ocean)] font-medium text-sm shadow-sm transition-all border border-[var(--color-deep-ocean)]/10 ${isLoadingMore ? 'bg-white/50 opacity-70 cursor-not-allowed' : 'bg-white hover:shadow-md'}`}
                      >
                        <RefreshCw size={16} className={isLoadingMore ? "animate-spin" : ""} /> 
                        {isLoadingMore ? "Expanding Regional Coverage..." : "Discover More Options"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </TransformComponent>
        )}
      </TransformWrapper>
    </motion.div>
  );
}
