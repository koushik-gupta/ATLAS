"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import TravelPinboard from "./TravelPinboard";
import HeroFlightPath from "./HeroFlightPath";
import { Compass, Layers, Map as MapIcon, Route } from "lucide-react";

interface JourneyGatewayProps {
  onStartPlanning: () => void;
}

const ATLAS_WORDS = [
  { first: "A", rest: "GENTIC" },
  { first: "T", rest: "RAVEL" },
  { first: "L", rest: "OGISTICS&" },
  { first: "A", rest: "DVISORY" },
  { first: "S", rest: "YSTEM" }
];

export default function JourneyGateway({ onStartPlanning }: JourneyGatewayProps) {
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleStart = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      onStartPlanning();
    }, 1200); // Wait for transition animation to complete
  };

  return (
    <div className="w-full bg-[var(--color-warm-cream)] flex flex-col relative overflow-hidden font-sans">

      {/* TRANSITION OVERLAY */}
      {isTransitioning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          className="fixed inset-0 bg-[var(--color-deep-ocean)] z-[100] pointer-events-none flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.2, opacity: [0, 1, 0] }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            className="w-32 h-32 rounded-full border border-white/20"
          />
        </motion.div>
      )}

      {/* GLOBAL NAVIGATION */}
      <nav className="absolute top-0 w-full p-8 flex justify-between items-center z-50">
        <div className="flex items-center gap-2">
          <Compass size={24} className="text-[var(--color-deep-ocean)]" />
          <span className="font-serif text-xl tracking-wide text-[var(--color-deep-ocean)]">ATLAS</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-semibold tracking-wide uppercase text-[var(--color-deep-ocean)]/60">
          <button className="hover:text-[var(--color-deep-ocean)] transition-colors">Explore</button>
          <button className="hover:text-[var(--color-deep-ocean)] transition-colors">How It Works</button>
          <button className="hover:text-[var(--color-deep-ocean)] transition-colors">Intelligence</button>
          <button onClick={handleStart} className="text-[var(--color-sunset-orange)] hover:text-[var(--color-sunset-orange)]/80 transition-colors">Start Planning</button>
        </div>
      </nav>

      {/* SECTION A — HERO INTRODUCTION (FULLSCREEN) */}
      <section className="relative w-full min-h-screen flex items-center justify-center px-6 pt-20 overflow-hidden">

        {/* Subtle Topographic Background */}
        <div className="absolute inset-0 opacity-10 pointer-events-none topographic-bg" style={{ animation: 'panBackground 60s linear infinite' }}></div>

        {/* Cinematic Route Micro-Interaction */}
        <HeroFlightPath />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.5, delay: 0.2, ease: "easeOut" }}
          className="flex flex-col items-center text-center relative z-10 max-w-5xl"
        >
          <div className="flex items-center justify-center mb-8 h-6 overflow-hidden">
            <div className="flex gap-[0.5em] font-medium text-[11px] tracking-widest">
              {ATLAS_WORDS.map((word, i) => (
                <div key={i} className="flex items-center">
                  <span className="font-extrabold text-[13px] z-10 relative text-[#B84E14]">
                    {word.first}
                  </span>
                  {word.rest && (
                    <motion.span
                      initial={{ maxWidth: 0, opacity: 0, paddingRight: 0 }}
                      animate={{ maxWidth: 160, opacity: 1, paddingRight: i < ATLAS_WORDS.length - 1 ? 8 : 0 }}
                      transition={{
                        maxWidth: { duration: 1.8, delay: 1, ease: "easeInOut" },
                        paddingRight: { duration: 1.8, delay: 1, ease: "easeInOut" },
                        opacity: { duration: 1.0, delay: 1.8 + (i * 0.2) }
                      }}
                      className="whitespace-nowrap overflow-hidden inline-block text-[#B84E14] font-extrabold text-[13px]"
                    >
                      {word.rest.includes("&") ? (
                        <>
                          {word.rest.replace("&", "")}
                          <span className="text-[var(--color-sunset-orange)] font-medium text-[11px] ml-[13.5px] relative -top-[1px]">&</span>
                        </>
                      ) : (
                        word.rest
                      )}
                    </motion.span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <h1 className="text-6xl md:text-8xl font-serif text-[var(--color-deep-ocean)] leading-[1.1] tracking-tight mb-8">
            An intelligent way <br />
            <span className="italic font-light opacity-90">to plan journeys.</span>
          </h1>

          <p className="text-xl md:text-2xl font-sans text-[var(--color-deep-ocean)]/70 max-w-3xl mb-16 leading-relaxed font-light">
            Agentic travel intelligence that understands pacing, terrain, weather, transport logic, and human experience.
          </p>

          <div className="flex flex-col items-center gap-6 relative z-30">
            <button
              onClick={handleStart}
              className="bg-[var(--color-deep-ocean)] text-white px-10 py-5 rounded-full font-sans font-semibold tracking-widest text-sm uppercase shadow-[0_20px_40px_-15px_rgba(15,39,71,0.5)] hover:bg-[var(--color-sunset-orange)] hover:shadow-orange-900/20 hover:-translate-y-1 transition-all duration-400 flex items-center gap-3 group"
            >
              Start Planning Your Journey
              <Route size={18} className="group-hover:translate-x-1 transition-transform opacity-70" />
            </button>
            <button className="text-[var(--color-deep-ocean)]/60 text-sm font-semibold tracking-wider uppercase hover:text-[var(--color-deep-ocean)] transition-colors border-b border-transparent hover:border-[var(--color-deep-ocean)] pb-1">
              See how the AI thinks
            </button>
            
            {/* Scroll Indicator - Center */}
            <div 
              className="mt-5 flex flex-col items-center opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
              onClick={() => window.scrollTo({ top: window.innerHeight, behavior: "smooth" })}
            >
              <svg width="48" height="72" viewBox="0 0 24 40" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-sunset-orange)] drop-shadow-md">
                <motion.path 
                  d="M5 4l7 7 7-7" 
                  animate={{ opacity: [0.15, 1, 0.15] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0 }}
                />
                <motion.path 
                  d="M5 12l7 7 7-7" 
                  animate={{ opacity: [0.15, 1, 0.15] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                />
                <motion.path 
                  d="M5 20l7 7 7-7" 
                  animate={{ opacity: [0.15, 1, 0.15] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                />
                <motion.path 
                  d="M5 28l7 7 7-7" 
                  animate={{ opacity: [0.15, 1, 0.15] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
                />
              </svg>
            </div>
          </div>
        </motion.div>
      </section>

      {/* SECTION B — THE MEMORY BOARD / EXPLORER WALL */}
      <section className="relative w-full border-t border-[var(--color-deep-ocean)]/5 bg-white/30 backdrop-blur-3xl z-20">
        <TravelPinboard />
      </section>

      {/* SECTION C — HOW THE AI THINKS (PROCESS TIMELINE) */}
      <section className="w-full bg-[var(--color-deep-ocean)] py-32 px-6 relative z-10 text-white overflow-hidden">

        {/* Subtle dark route line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-white/10 hidden md:block"></div>

        <div className="max-w-5xl mx-auto">
          <motion.h3
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center font-sans uppercase tracking-[0.4em] text-[var(--color-golden-amber)] text-sm font-bold mb-24"
          >
            How The AI Thinks
          </motion.h3>

          <div className="flex flex-col gap-24">

            {/* Step 01 */}
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="flex flex-col md:flex-row items-center gap-12 relative"
            >
              <div className="md:w-1/2 md:text-right">
                <span className="font-serif italic text-6xl text-white/10 absolute -top-10 md:right-1/2 md:mr-12">01</span>
                <h4 className="font-serif text-3xl md:text-4xl mb-4 relative z-10">Terrain Intelligence</h4>
                <p className="text-white/60 text-lg font-light leading-relaxed">Understands altitude, terrain fatigue, and realistic transit between challenging geographies.</p>
              </div>
              <div className="md:w-1/2 hidden md:flex items-center">
                <div className="w-4 h-4 rounded-full bg-[var(--color-golden-amber)] shadow-[0_0_20px_var(--color-golden-amber)] absolute left-1/2 -ml-[8px]"></div>
                <div className="pl-12 text-white/20">
                  <MapIcon size={64} strokeWidth={1} />
                </div>
              </div>
            </motion.div>

            {/* Step 02 */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="flex flex-col md:flex-row-reverse items-center gap-12 relative"
            >
              <div className="md:w-1/2">
                <span className="font-serif italic text-6xl text-white/10 absolute -top-10 md:left-1/2 md:ml-12">02</span>
                <h4 className="font-serif text-3xl md:text-4xl mb-4 relative z-10">Dynamic Route Logic</h4>
                <p className="text-white/60 text-lg font-light leading-relaxed">Clusters destinations intelligently instead of blindly optimizing distance. It maps how humans actually travel.</p>
              </div>
              <div className="md:w-1/2 hidden md:flex items-center justify-end">
                <div className="w-4 h-4 rounded-full bg-[var(--color-sunset-orange)] shadow-[0_0_20px_var(--color-sunset-orange)] absolute left-1/2 -ml-[8px]"></div>
                <div className="pr-12 text-white/20">
                  <Route size={64} strokeWidth={1} />
                </div>
              </div>
            </motion.div>

            {/* Step 03 */}
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="flex flex-col md:flex-row items-center gap-12 relative"
            >
              <div className="md:w-1/2 md:text-right">
                <span className="font-serif italic text-6xl text-white/10 absolute -top-10 md:right-1/2 md:mr-12">03</span>
                <h4 className="font-serif text-3xl md:text-4xl mb-4 relative z-10">Living Itinerary Assembly</h4>
                <p className="text-white/60 text-lg font-light leading-relaxed">Builds cinematic editorial journeys instead of static schedules. Your trip generates as a beautiful narrative.</p>
              </div>
              <div className="md:w-1/2 hidden md:flex items-center">
                <div className="w-4 h-4 rounded-full bg-[var(--color-tropical-teal)] shadow-[0_0_20px_var(--color-tropical-teal)] absolute left-1/2 -ml-[8px]"></div>
                <div className="pl-12 text-white/20">
                  <Layers size={64} strokeWidth={1} />
                </div>
              </div>
            </motion.div>

            {/* Step 04 */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="flex flex-col md:flex-row-reverse items-center gap-12 relative"
            >
              <div className="md:w-1/2">
                <span className="font-serif italic text-6xl text-white/10 absolute -top-10 md:left-1/2 md:ml-12">04</span>
                <h4 className="font-serif text-3xl md:text-4xl mb-4 relative z-10">Adaptive Intelligence</h4>
                <p className="text-white/60 text-lg font-light leading-relaxed">Continuously refines weather, transport, and pacing to ensure maximum safety and immersion.</p>
              </div>
              <div className="md:w-1/2 hidden md:flex items-center justify-end">
                <div className="w-4 h-4 rounded-full bg-white/40 shadow-[0_0_20px_white] absolute left-1/2 -ml-[8px]"></div>
                <div className="pr-12 text-white/20">
                  <Compass size={64} strokeWidth={1} />
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* SECTION D — FINAL CTA */}
      <section className="w-full bg-[var(--color-warm-cream)] py-40 px-6 flex flex-col items-center text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
        >
          <h2 className="text-5xl md:text-7xl font-serif text-[var(--color-deep-ocean)] leading-tight mb-6">
            Your journey, <br />
            <span className="italic font-light">mastercrafted.</span>
          </h2>
          <p className="text-xl font-sans text-[var(--color-deep-ocean)]/60 max-w-md mx-auto mb-12 font-light">
            Start building your living travel journal.
          </p>
          <button
            onClick={handleStart}
            className="bg-[var(--color-deep-ocean)] text-white px-10 py-5 rounded-full font-sans font-semibold tracking-widest text-sm uppercase shadow-2xl hover:bg-[var(--color-sunset-orange)] hover:scale-105 transition-all duration-300"
          >
            Start Planning
          </button>
        </motion.div>
      </section>

    </div>
  );
}
