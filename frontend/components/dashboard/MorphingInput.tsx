"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Send } from "lucide-react";

interface MorphingInputProps {
  isExpanded: boolean;
  onSubmit?: () => void;
  query?: string;
  setQuery?: (q: string) => void;
  placeholder?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const smoothTransition: any = { duration: 1.2, ease: [0.16, 1, 0.3, 1] };

const EXAMPLES = [
  "I want a 10-day luxury trip through Rajasthan...",
  "Planning a romantic honeymoon in the Swiss Alps...",
  "Backpacking through Southeast Asia for 3 weeks...",
  "A weekend foodie getaway to Tokyo...",
  "Family road trip along the California coast..."
];

export default function MorphingInput({ isExpanded, onSubmit, query = "", setQuery, placeholder }: MorphingInputProps) {
  const [currentExampleIdx, setCurrentExampleIdx] = useState(0);
  const [typedText, setTypedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Typewriter effect for placeholder
  useEffect(() => {
    if (!isExpanded || placeholder) return; // Don't run if we have a real placeholder or are compact
    
    const currentExample = EXAMPLES[currentExampleIdx];
    
    const timeout = setTimeout(() => {
      if (!isDeleting) {
        if (typedText.length < currentExample.length) {
          setTypedText(currentExample.slice(0, typedText.length + 1));
        } else {
          setTimeout(() => setIsDeleting(true), 2000); // Wait before deleting
        }
      } else {
        if (typedText.length > 0) {
          setTypedText(currentExample.slice(0, typedText.length - 1));
        } else {
          setIsDeleting(false);
          setCurrentExampleIdx((prev) => (prev + 1) % EXAMPLES.length);
        }
      }
    }, isDeleting ? 30 : 60);

    return () => clearTimeout(timeout);
  }, [typedText, isDeleting, currentExampleIdx, isExpanded, placeholder]);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit) onSubmit();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (setQuery) setQuery(e.target.value);
  }

  if (isExpanded) {
    // -----------------------------------------------------
    // EXPANDED STATE (IDLE) - Center of the screen
    // -----------------------------------------------------
    return (
      <motion.form 
        layoutId="planning-input-container"
        onSubmit={handleSubmit}
        transition={smoothTransition}
        className="relative w-full max-w-2xl mx-auto shadow-2xl bg-white border border-[var(--color-deep-ocean)]/10 p-2"
        style={{ borderRadius: 24 }} // keep consistent for layout transition
      >
        <motion.input
          layoutId="planning-input-field"
          type="text"
          value={query}
          onChange={handleChange}
          transition={smoothTransition}
          placeholder={placeholder || typedText || "Type your destination here..."}
          className="w-full bg-transparent border-none py-4 px-6 text-lg text-[var(--color-deep-ocean)] focus:outline-none placeholder:text-[var(--color-deep-ocean)]/40 font-sans"
          autoFocus
        />
        <motion.button
          layoutId="planning-input-submit"
          type="submit"
          transition={smoothTransition}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-[var(--color-deep-ocean)] hover:bg-[var(--color-sunset-orange)] text-white rounded-xl transition-colors"
        >
          <Send size={20} className="ml-[-2px]" />
        </motion.button>
      </motion.form>
    );
  }

  // -----------------------------------------------------
  // COMPACT STATE (ACTIVE) - Bottom of the Agent Desk
  // -----------------------------------------------------
  return (
    <motion.form 
      layoutId="planning-input-container"
      onSubmit={handleSubmit}
      transition={smoothTransition}
      className="relative w-full bg-white border border-[var(--color-deep-ocean)]/10 shadow-sm p-1"
      style={{ borderRadius: 12 }} // layout transition handles border-radius interpolation
    >
      <motion.input
        layoutId="planning-input-field"
        type="text"
        value={query}
        onChange={handleChange}
        transition={smoothTransition}
        placeholder={placeholder || "Refine the journey..."}
        className="w-full bg-transparent border-none py-3 pl-4 pr-12 text-sm text-[var(--color-deep-ocean)] focus:outline-none placeholder:text-[var(--color-deep-ocean)]/40 font-sans"
      />
      <motion.button
        layoutId="planning-input-submit"
        type="submit"
        transition={smoothTransition}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[var(--color-deep-ocean)] hover:bg-[var(--color-sunset-orange)] text-white rounded-lg transition-colors"
      >
        <Send size={14} className="ml-[-1px]" />
      </motion.button>
    </motion.form>
  );
}
