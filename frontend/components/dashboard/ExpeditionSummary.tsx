"use client";

import { motion } from "framer-motion";
import { Wallet, Clock, Map as MapIcon, ShieldAlert } from "lucide-react";

interface ExpeditionSummaryProps {
  label: string;
  summary: string;
  cost: number;
  hours: number;
  constraints: string[];
}

export default function ExpeditionSummary({ label, summary, cost, hours, constraints }: ExpeditionSummaryProps) {
  return (
    <div className="w-full max-w-5xl mx-auto py-16 px-8 md:px-16 flex flex-col md:flex-row gap-12 border-b border-[var(--color-deep-ocean)]/10">
      
      {/* Title & Overview */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="md:w-1/2 flex flex-col justify-center"
      >
        <h2 className="text-sm font-sans tracking-[0.2em] text-[var(--color-sunset-orange)] uppercase font-semibold mb-2">
          Expedition Overview
        </h2>
        <h1 className="text-4xl md:text-5xl font-serif text-[var(--color-deep-ocean)] mb-4 leading-tight">
          {label}
        </h1>
        <p className="text-lg font-sans text-[var(--color-deep-ocean)]/70 leading-relaxed">
          {summary}
        </p>
      </motion.div>

      {/* Highlights & Constraints */}
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1, delay: 0.7 }}
        className="md:w-1/2 flex flex-col gap-6"
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-[var(--color-deep-ocean)]/5 flex items-center gap-4">
            <div className="bg-[var(--color-golden-amber)]/20 p-2 rounded-full text-[var(--color-golden-amber)]">
              <Wallet size={20} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-[var(--color-deep-ocean)]/50 font-bold mb-1">Total Budget</p>
              <p className="font-sans font-semibold text-[var(--color-deep-ocean)]">₹{cost.toLocaleString()}</p>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-xl shadow-sm border border-[var(--color-deep-ocean)]/5 flex items-center gap-4">
            <div className="bg-[var(--color-tropical-teal)]/20 p-2 rounded-full text-[var(--color-tropical-teal)]">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-[var(--color-deep-ocean)]/50 font-bold mb-1">Transit Time</p>
              <p className="font-sans font-semibold text-[var(--color-deep-ocean)]">{hours} hours</p>
            </div>
          </div>
        </div>

        {/* Route Philosophy / Constraints */}
        <div className="bg-[#FAFAFA] p-6 rounded-xl border border-[var(--color-deep-ocean)]/10">
           <div className="flex items-center gap-2 text-[var(--color-deep-ocean)]/60 mb-3">
             <ShieldAlert size={16} />
             <span className="text-xs uppercase tracking-widest font-bold">Route Philosophy</span>
           </div>
           <ul className="flex flex-col gap-2">
             {constraints.map((constraint, i) => (
               <li key={i} className="flex items-start gap-2 font-sans text-sm text-[var(--color-deep-ocean)]/80">
                 <span className="text-[var(--color-sunset-orange)] mt-1">•</span>
                 {constraint}
               </li>
             ))}
           </ul>
        </div>
      </motion.div>

    </div>
  );
}
