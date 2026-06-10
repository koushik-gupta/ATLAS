"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function TrainTransition() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountainRef = useRef<HTMLDivElement>(null);
  const foregroundRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: containerRef.current,
        start: "top top",
        end: "+=200%",
        scrub: 1,
        pin: true,
      },
    });

    // Parallax scrolling effect for the layers
    tl.to(mountainRef.current, { x: "-10%", duration: 1 }, 0)
      .to(foregroundRef.current, { x: "-30%", duration: 1 }, 0)
      .to(textRef.current, { opacity: 1, scale: 1.1, duration: 0.5 }, 0.2)
      .to(textRef.current, { opacity: 0, duration: 0.3 }, 0.7);

  }, []);

  return (
    <div ref={containerRef} className="pin-wrapper bg-[#0a0a0a] overflow-hidden flex items-center justify-center relative">
      
      {/* Background Mountains (Slow parallax) */}
      <div 
        ref={mountainRef}
        className="absolute inset-0 w-[150%] h-full opacity-30 pointer-events-none"
        style={{
          background: "linear-gradient(to right, transparent, rgba(207, 168, 110, 0.05) 50%, transparent), repeating-linear-gradient(90deg, transparent 0, transparent 200px, rgba(255,255,255,0.03) 200px, rgba(255,255,255,0.03) 400px)",
        }}
      ></div>

      {/* Foreground Window / Pillars (Fast parallax) */}
      <div 
        ref={foregroundRef}
        className="absolute inset-0 w-[200%] h-full pointer-events-none flex"
      >
        {/* Simulate train window pillars passing by */}
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="h-full w-24 bg-black/80 shadow-[0_0_50px_rgba(0,0,0,0.9)] ml-[300px]"></div>
        ))}
      </div>

      {/* Cinematic Text */}
      <div ref={textRef} className="absolute z-10 flex flex-col items-center text-center opacity-0">
        <h2 className="text-4xl md:text-6xl font-serif text-[var(--accent-gold)] text-glow mb-4">
          Rails. Roads. Timing.
        </h2>
        <p className="text-xl text-gray-300 font-sans tracking-widest uppercase text-sm">
          Moving through terrain
        </p>
      </div>

      {/* Window reflection overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none mix-blend-overlay"></div>
    </div>
  );
}
