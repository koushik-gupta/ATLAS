"use client";

import { motion } from "framer-motion";
import { Compass, Sparkles, Navigation, Map } from "lucide-react";
import MorphingInput from "./MorphingInput";

interface PlanningGatewayProps {
  onStartPlanning: () => void;
  query: string;
  setQuery: (q: string) => void;
}

export default function PlanningGateway({ onStartPlanning, query, setQuery }: PlanningGatewayProps) {
  return (
    <motion.div 
      key="gateway"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} // smooth apple-like ease
      className="relative w-full h-full min-h-screen flex items-center justify-center bg-[var(--color-warm-cream)] overflow-hidden font-sans"
    >
      {/* 1. AMBIENT TRAVEL LAYERS */}
      
      {/* Topographic Lines */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none topographic-bg" style={{ animation: 'panBackground 100s linear infinite' }}></div>
      
      {/* Abstract Route Arcs */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
        <path d="M-100,500 Q 400,-100 1200,600 T 2000,200" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 8" />
        <path d="M-200,800 Q 600,200 1400,900" fill="none" stroke="currentColor" strokeWidth="0.5" />
      </svg>

      {/* Floating Travel Elements */}
      <motion.div 
        animate={{ y: [0, -20, 0], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-[20%] left-[15%] text-[var(--color-deep-ocean)]"
      >
        <Map size={48} strokeWidth={0.5} />
      </motion.div>

      <motion.div 
        animate={{ y: [0, 20, 0], opacity: [0.2, 0.5, 0.2], rotate: [0, 5, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute bottom-[25%] right-[18%] text-[var(--color-sunset-orange)]"
      >
        <Navigation size={40} strokeWidth={0.5} />
      </motion.div>
      
      <motion.div 
        animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.3, 0.1] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute top-[30%] right-[25%] text-[var(--color-golden-amber)]"
      >
        <Compass size={64} strokeWidth={0.5} />
      </motion.div>

      {/* 2. CENTERED INTELLIGENCE STUDIO */}
      <div className="relative z-10 flex flex-col items-center text-center w-full max-w-3xl px-6">
        
        {/* Subtle Greeting */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="flex items-center gap-2 mb-8 text-[var(--color-deep-ocean)]/60 uppercase tracking-[0.3em] text-xs font-semibold"
        >
          <Sparkles size={14} className="text-[var(--color-sunset-orange)]" />
          Intelligent Expedition System
        </motion.div>

        {/* Cinematic Heading */}
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="text-5xl md:text-6xl font-serif text-[var(--color-deep-ocean)] tracking-tight mb-12"
        >
          Describe the journey <br/>
          <span className="italic font-light opacity-80">you imagine.</span>
        </motion.h1>

        {/* Morphing Input (Starts large in the center) */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4 }}
          className="w-full"
        >
          <MorphingInput isExpanded={true} onSubmit={onStartPlanning} query={query} setQuery={setQuery} />
        </motion.div>

        {/* Quick Suggestion Chips */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.6 }}
          className="flex flex-wrap justify-center gap-3 mt-8"
        >
          {[
            "Slow scenic mountain journey",
            "Luxury coastal route",
            "Avoid flights",
            "Cultural immersion",
            "Himalayan trails"
          ].map((pill, i) => (
            <button 
              key={i} 
              className="px-4 py-2 rounded-full border border-[var(--color-deep-ocean)]/10 bg-white/50 backdrop-blur-sm text-sm text-[var(--color-deep-ocean)]/70 hover:text-[var(--color-deep-ocean)] hover:bg-white hover:shadow-sm transition-all font-medium"
            >
              {pill}
            </button>
          ))}
        </motion.div>
      </div>

    </motion.div>
  );
}
