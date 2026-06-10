"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, RefreshCw, X, MapPin } from "lucide-react";
import type { CuratedCity } from "@/hooks/useAgentStream";
import DestinationCard from "./DestinationCard";

interface DestinationTrayProps {
  visible: boolean;
  options: CuratedCity[];
  onConfirm: (selections: string[]) => void;
  onLoadMore: () => void;
  isLoadingMore: boolean;
}

export default function DestinationTray({
  visible,
  options,
  onConfirm,
  onLoadMore,
  isLoadingMore,
}: DestinationTrayProps) {
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const prevVisible = useRef(false);

  // Only clear selection on false → true transition (tray opens)
  // Do NOT clear when new destinations append (visible stays true)
  useEffect(() => {
    if (visible && !prevVisible.current) {
      setConfirmed(false);
      setSelectedCities([]);
    }
    prevVisible.current = visible;
  }, [visible]);

  const handleToggle = useCallback((city: string) => {
    setSelectedCities(prev =>
      prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]
    );
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedCities.length === 0) return;
    setConfirmed(true);
    onConfirm(selectedCities);
  }, [selectedCities, onConfirm]);

  return (
    <AnimatePresence>
      {visible && !confirmed && (
        <>
          {/* Backdrop */}
          <motion.div
            key="tray-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-30 bg-[var(--color-deep-ocean)]/10 backdrop-blur-[2px] pointer-events-none"
          />

          {/* Tray panel */}
          <motion.div
            key="destination-tray"
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "110%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 36, mass: 1.1 }}
            className="absolute bottom-0 left-0 right-0 z-40 flex flex-col"
            style={{ maxHeight: "80vh" }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-[var(--color-deep-ocean)]/20" />
            </div>

            <div className="bg-white/97 backdrop-blur-2xl rounded-t-3xl shadow-[0_-20px_80px_rgba(15,39,71,0.18)] border-t border-[var(--color-deep-ocean)]/8 flex flex-col flex-1 overflow-hidden">
              {/* Header */}
              <div className="flex-shrink-0 px-10 pt-6 pb-5 border-b border-[var(--color-deep-ocean)]/6">
                <div className="flex items-end justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-2 h-2 rounded-full bg-[var(--color-tropical-teal)] animate-pulse" />
                      <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--color-deep-ocean)]/50 font-bold">
                        Destination Agent · Discovery Phase
                      </span>
                    </div>
                    <h2 className="font-serif text-2xl text-[var(--color-deep-ocean)] leading-tight">
                      Select Your Expedition Hubs
                    </h2>
                    <p className="text-sm text-[var(--color-deep-ocean)]/55 mt-1 font-sans">
                      The AI will build the optimal route around your selections
                    </p>
                  </div>

                  {/* Confirm button */}
                  <motion.button
                    onClick={handleConfirm}
                    disabled={selectedCities.length === 0}
                    whileHover={selectedCities.length > 0 ? { scale: 1.04 } : {}}
                    whileTap={selectedCities.length > 0 ? { scale: 0.97 } : {}}
                    className={[
                      "flex-shrink-0 flex items-center gap-2.5 px-7 py-3.5 rounded-full font-bold text-sm shadow-lg transition-all duration-300 leading-none",
                      selectedCities.length > 0
                        ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-[0_8px_24px_rgba(16,185,129,0.35)] hover:shadow-[0_12px_32px_rgba(16,185,129,0.45)]"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed shadow-none",
                    ].join(" ")}
                  >
                    <CheckCircle2 size={16} strokeWidth={2.5} />
                    {selectedCities.length > 0
                      ? `Lock In ${selectedCities.length} Destination${selectedCities.length > 1 ? "s" : ""}`
                      : "Choose Destinations"}
                  </motion.button>
                </div>

                {/* Selected pills */}
                <AnimatePresence mode="popLayout">
                  {selectedCities.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-2 mt-4 flex-wrap"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-deep-ocean)]/40">
                        Selected:
                      </span>
                      {selectedCities.map((city, idx) => (
                        <motion.div
                          key={`${city}-${idx}`}
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.85 }}
                          className="flex items-center gap-1.5 px-3 py-1 bg-[var(--color-deep-ocean)] text-white rounded-full text-[11px] font-semibold cursor-pointer"
                          onClick={() => handleToggle(city)}
                        >
                          <MapPin size={9} />
                          {city}
                          <X size={9} strokeWidth={3} />
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Card grid — scrollable */}
              <div className="flex-1 overflow-y-auto px-10 py-6">
                <div className="grid grid-cols-3 gap-5">
                  <AnimatePresence mode="popLayout">
                    {options.map((city, idx) => (
                      <motion.div
                        key={`${city.city}-${idx}`}
                        layout
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{
                          layout: { duration: 0.3 },
                          default: { delay: idx * 0.04, type: "spring", stiffness: 320, damping: 30 },
                        }}
                      >
                        <DestinationCard
                          city={city.city}
                          image={city.image}
                          description={city.description}
                          isSelected={selectedCities.includes(city.city)}
                          onToggle={() => handleToggle(city.city)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              {/* Footer: load more */}
              <div className="flex-shrink-0 px-10 py-4 border-t border-[var(--color-deep-ocean)]/5 flex items-center justify-between">
                <button
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className={[
                    "flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold border transition-all",
                    isLoadingMore
                      ? "bg-white border-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-white border-[var(--color-deep-ocean)]/15 text-[var(--color-deep-ocean)]/70 hover:border-[var(--color-deep-ocean)]/30 hover:text-[var(--color-deep-ocean)] hover:shadow-sm",
                  ].join(" ")}
                >
                  <RefreshCw size={13} className={isLoadingMore ? "animate-spin" : ""} />
                  {isLoadingMore ? "Expanding regional coverage..." : "Discover more destinations"}
                </button>

                <p className="text-xs text-[var(--color-deep-ocean)]/30 font-medium">
                  {options.length} destination{options.length !== 1 ? "s" : ""} curated
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
