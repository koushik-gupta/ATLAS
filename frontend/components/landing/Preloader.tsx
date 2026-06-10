"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

interface PreloaderProps {
  isVisible: boolean;
}

export default function Preloader({ isVisible }: PreloaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const text1Ref = useRef<HTMLParagraphElement>(null);
  const text2Ref = useRef<HTMLParagraphElement>(null);
  const pulseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const tl = gsap.timeline();

    // Pulse animation
    gsap.to(pulseRef.current, {
      scale: 1.5,
      opacity: 0,
      duration: 2,
      repeat: -1,
      ease: "power2.out",
    });

    // Text sequence
    tl.to(text1Ref.current, { opacity: 1, y: 0, duration: 1, ease: "power2.out" })
      .to(text1Ref.current, { opacity: 0, y: -10, duration: 0.8, delay: 0.5 })
      .to(text2Ref.current, { opacity: 1, y: 0, duration: 1, ease: "power2.out" });

  }, []);

  if (!isVisible) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#050505]"
    >
      {/* Central subtle pulse */}
      <div className="relative flex items-center justify-center w-32 h-32 mb-12">
        <div className="absolute w-2 h-2 rounded-full bg-[var(--accent-gold)]"></div>
        <div
          ref={pulseRef}
          className="absolute w-12 h-12 rounded-full border border-[var(--accent-gold)] opacity-50"
        ></div>
      </div>

      <div className="relative h-12 flex items-center justify-center text-center">
        <p
          ref={text1Ref}
          className="absolute text-xl font-serif text-[var(--foreground)] opacity-0 translate-y-4"
        >
          Planning your journey.
        </p>
        <p
          ref={text2Ref}
          className="absolute text-xl font-serif text-[var(--accent-gold)] opacity-0 translate-y-4 text-glow"
        >
          Mastercrafted routes.
        </p>
      </div>
    </div>
  );
}
