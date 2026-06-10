"use client";

import { motion } from "framer-motion";
import { Compass } from "lucide-react";

interface ChapterHeaderProps {
  title: string;
  subtitle?: string;
  delay: number;
}

export default function ChapterHeader({ title, subtitle, delay }: ChapterHeaderProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.2, delay, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-5xl mx-auto py-16 flex flex-col items-center justify-center text-center relative"
    >
      {/* Route Divider Line */}
      <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-transparent via-[var(--color-sunset-orange)]/30 to-transparent"></div>

      <div className="bg-[var(--color-warm-cream)] px-6 py-2 relative z-10 rounded-full border border-[var(--color-sunset-orange)]/10 shadow-sm flex flex-col items-center gap-1">
        <div className="flex items-center gap-3">
          <Compass size={14} className="text-[var(--color-sunset-orange)]" />
          <h3 className="font-serif text-[var(--color-deep-ocean)]/80 italic text-xl">
            {title}
          </h3>
        </div>
        {subtitle && (
          <span className="font-sans text-[var(--color-deep-ocean)]/50 uppercase tracking-widest text-xs font-semibold">
            {subtitle}
          </span>
        )}
      </div>
      
    </motion.div>
  );
}
