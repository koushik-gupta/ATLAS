"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PlaneTakeoff, MapPin, Calendar, Clock, CreditCard, Sparkles, Check, ArrowRight } from "lucide-react";

export default function ConciergeForm() {
  const [step, setStep] = useState<"form" | "thinking" | "pruning" | "done">("form");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("thinking");
    
    // Simulate thinking state progression
    setTimeout(() => {
      setStep("pruning");
    }, 4000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 relative">
      <AnimatePresence mode="wait">
        
        {/* STEP 1: INTAKE FORM */}
        {step === "form" && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="glass-panel p-8 md:p-12 relative overflow-hidden"
          >
            {/* Background Map Graphic (subtle) */}
            <div className="absolute top-0 right-0 opacity-5 pointer-events-none">
              <svg width="400" height="400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5">
                <path d="M2 12A10 10 0 1 0 22 12 10 10 0 1 0 2 12Z" />
                <path d="M2 12h20M12 2v20" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>

            <div className="mb-10 text-center">
              <h3 className="text-3xl font-serif text-white mb-2">Design Your Journey</h3>
              <p className="text-gray-400 font-sans">The world's first route-aware AI concierge.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Origin */}
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest text-gray-500 font-semibold flex items-center gap-2">
                    <PlaneTakeoff size={14} className="text-[var(--accent-gold)]" /> Origin
                  </label>
                  <input 
                    type="text" 
                    placeholder="e.g. Kolkata, India"
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--accent-gold)] transition-colors placeholder:text-gray-600 font-sans"
                    required
                  />
                </div>

                {/* Destination */}
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest text-gray-500 font-semibold flex items-center gap-2">
                    <MapPin size={14} className="text-[var(--accent-gold)]" /> Destination(s)
                  </label>
                  <input 
                    type="text" 
                    placeholder="e.g. Shimla & Manali"
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--accent-gold)] transition-colors placeholder:text-gray-600 font-sans"
                    required
                  />
                </div>

                {/* Duration */}
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest text-gray-500 font-semibold flex items-center gap-2">
                    <Calendar size={14} className="text-[var(--accent-gold)]" /> Duration
                  </label>
                  <input 
                    type="text" 
                    placeholder="e.g. 15 Days in October"
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--accent-gold)] transition-colors placeholder:text-gray-600 font-sans"
                    required
                  />
                </div>

                {/* Pace */}
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest text-gray-500 font-semibold flex items-center gap-2">
                    <Clock size={14} className="text-[var(--accent-gold)]" /> Pacing
                  </label>
                  <select className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[var(--accent-gold)] transition-colors appearance-none font-sans">
                    <option value="moderate">Moderate & Balanced</option>
                    <option value="relaxed">Relaxed & Slow</option>
                    <option value="packed">Packed & Busy</option>
                  </select>
                </div>
              </div>

              {/* Submit */}
              <div className="pt-6 text-center">
                <button 
                  type="submit"
                  className="bg-[var(--foreground)] text-black font-semibold px-12 py-4 rounded-full flex items-center gap-2 mx-auto hover:bg-[var(--accent-gold)] transition-colors duration-300"
                >
                  <Sparkles size={18} />
                  Mastercraft My Trip
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* STEP 2: THINKING STATE */}
        {step === "thinking" && (
          <motion.div
            key="thinking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="relative w-32 h-32 mb-8">
              <div className="absolute inset-0 border-t-2 border-[var(--accent-gold)] rounded-full animate-spin"></div>
              <div className="absolute inset-2 border-r-2 border-white/30 rounded-full animate-[spin_2s_reverse_infinite]"></div>
              <PlaneTakeoff size={32} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[var(--accent-gold)] opacity-80" />
            </div>
            
            <div className="h-8 overflow-hidden text-center relative w-64">
              <motion.div 
                animate={{ y: [0, -32, -64, -96] }}
                transition={{ duration: 4, times: [0, 0.3, 0.6, 1], ease: "linear" }}
                className="text-lg font-serif text-gray-300"
              >
                <div className="h-8 flex items-center justify-center">Analyzing topography...</div>
                <div className="h-8 flex items-center justify-center text-[var(--accent-gold)]">Calculating transport logic...</div>
                <div className="h-8 flex items-center justify-center">Balancing night allocations...</div>
                <div className="h-8 flex items-center justify-center">Applying smart pruning...</div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* STEP 3: PRUNING PREVIEW */}
        {step === "pruning" && (
          <motion.div
            key="pruning"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-8 w-full max-w-5xl mx-auto"
          >
            <div className="text-center mb-8">
              <h3 className="text-2xl font-serif text-[var(--accent-gold)] mb-2 text-glow">Route Optimization Detected</h3>
              <p className="text-gray-400">To keep your 'Packed' pace realistic for 15 days, we recommend a smarter route.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              {/* Raw Route */}
              <div className="border border-red-500/20 rounded-xl p-6 bg-red-500/5">
                <div className="text-xs uppercase tracking-widest text-red-400 mb-4 font-semibold">Raw Request (Impossible)</div>
                <ul className="space-y-3 text-gray-400">
                  <li className="flex items-center gap-2 line-through"><div className="w-1.5 h-1.5 rounded-full bg-red-500/50"></div> Shimla</li>
                  <li className="flex items-center gap-2 line-through"><div className="w-1.5 h-1.5 rounded-full bg-red-500/50"></div> Kullu</li>
                  <li className="flex items-center gap-2 line-through"><div className="w-1.5 h-1.5 rounded-full bg-red-500/50"></div> Manali</li>
                  <li className="flex items-center gap-2 line-through"><div className="w-1.5 h-1.5 rounded-full bg-red-500/50"></div> Dharamshala</li>
                  <li className="flex items-center gap-2 line-through"><div className="w-1.5 h-1.5 rounded-full bg-red-500/50"></div> Dalhousie</li>
                  <li className="flex items-center gap-2 line-through"><div className="w-1.5 h-1.5 rounded-full bg-red-500/50"></div> Spiti Valley</li>
                </ul>
              </div>

              {/* Smart Route */}
              <div className="border border-[var(--accent-gold)] rounded-xl p-6 bg-[var(--accent-gold)]/5 cinematic-glow">
                <div className="text-xs uppercase tracking-widest text-[var(--accent-gold)] mb-4 font-semibold">AI Mastercrafted Route</div>
                <ul className="space-y-3 text-white">
                  <li className="flex items-center gap-2"><Check size={14} className="text-green-400"/> Shimla (3 Nights)</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-green-400"/> Kullu (Day Trip)</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-green-400"/> Manali (4 Nights)</li>
                  <li className="flex items-center gap-2"><Check size={14} className="text-green-400"/> Dharamshala (3 Nights)</li>
                  <li className="flex items-center gap-2 text-gray-500 text-sm mt-4 italic border-t border-white/10 pt-4">Dropped Dalhousie & Spiti to prevent 40+ hours of transit.</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-center gap-4">
              <button 
                onClick={() => setStep("done")}
                className="bg-[var(--accent-gold)] text-black font-semibold px-8 py-3 rounded-full flex items-center gap-2 hover:bg-white transition-colors"
              >
                Accept Optimization <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        )}

        {/* STEP 4: DONE (Final CTA) */}
        {step === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-32"
          >
            <h2 className="text-5xl font-serif text-white mb-6">Built for real travel.</h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-12">
              Not generic itineraries. Routes, pacing, weather, and budgets perfectly aligned in seconds.
            </p>
            <button 
              onClick={() => setStep("form")}
              className="border border-[var(--accent-gold)] text-[var(--accent-gold)] px-8 py-3 rounded-full hover:bg-[var(--accent-gold)] hover:text-black transition-colors"
            >
              Plan Another Journey
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
