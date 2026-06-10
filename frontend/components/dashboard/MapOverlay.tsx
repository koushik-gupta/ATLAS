"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Map, X } from "lucide-react";
import AnimatedMap from "./AnimatedMap";

export default function MapOverlay({ tripData }: { tripData: any }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Map Toggle Button */}
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 md:bottom-12 md:right-12 bg-[var(--color-deep-ocean)] text-white p-4 rounded-full shadow-2xl hover:bg-[var(--color-sunset-orange)] hover:scale-105 transition-all duration-300 z-40 flex items-center gap-3 pr-6"
      >
        <div className="bg-white/20 p-2 rounded-full">
          <Map size={24} />
        </div>
        <span className="font-sans font-semibold tracking-wide uppercase text-sm">View Route</span>
      </button>

      {/* Cinematic Map Modal (Fullscreen on mobile, 60vw on desktop) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 w-full md:w-[60vw] shadow-2xl z-50 flex flex-col border-l border-white/10"
          >
            {/* Header Overlay */}
            <div className="absolute top-0 inset-x-0 p-6 flex justify-between items-center z-10 bg-gradient-to-b from-black/60 to-transparent">
              <h2 className="text-3xl font-serif text-white tracking-wide drop-shadow-md">
                Expedition Route
              </h2>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 bg-black/40 backdrop-blur-sm text-white hover:bg-[var(--color-sunset-orange)] rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* The Actual Map */}
            <div className="flex-1 relative bg-[#1A2E44]">
              <AnimatedMap tripData={tripData} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
