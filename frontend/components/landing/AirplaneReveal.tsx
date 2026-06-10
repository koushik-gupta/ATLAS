"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { Plane } from "lucide-react";

export default function AirplaneReveal() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cloudRef = useRef<HTMLDivElement>(null);
  const airplaneRef = useRef<HTMLDivElement>(null);
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

    // Upward camera rise effect
    tl.fromTo(cloudRef.current, { y: "100%", opacity: 0 }, { y: "-50%", opacity: 0.5, duration: 1 })
      .fromTo(airplaneRef.current, { y: "50vh", scale: 0.5, opacity: 0 }, { y: "0vh", scale: 1, opacity: 1, duration: 1 }, "<0.2")
      .fromTo(textRef.current, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5 }, "-=0.3")
      .to(airplaneRef.current, { y: "-50vh", opacity: 0, duration: 0.8 }, "+=0.2")
      .to(textRef.current, { opacity: 0, duration: 0.5 }, "<");

  }, []);

  return (
    <div ref={containerRef} className="pin-wrapper bg-gradient-to-b from-[#02050a] to-[#0a0a0a] overflow-hidden flex flex-col items-center justify-center relative">
      
      {/* Cloud layer (simulated with CSS gradients) */}
      <div 
        ref={cloudRef}
        className="absolute inset-0 w-full h-[200%] pointer-events-none opacity-0"
        style={{
          background: "radial-gradient(ellipse at center, rgba(207, 168, 110, 0.1) 0%, transparent 70%)",
          filter: "blur(40px)"
        }}
      ></div>

      {/* Airplane Silhouette */}
      <div ref={airplaneRef} className="absolute z-10 opacity-0 flex flex-col items-center">
        <div className="relative">
          <Plane className="w-32 h-32 text-[var(--accent-gold)] opacity-80" strokeWidth={1} />
          {/* Engine glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-[var(--accent-gold)] rounded-full blur-2xl opacity-20"></div>
        </div>
        
        {/* Contrail */}
        <div className="w-0.5 h-64 bg-gradient-to-b from-[var(--accent-gold)] to-transparent opacity-30 mt-4 blur-[1px]"></div>
      </div>

      {/* Cinematic Text */}
      <div ref={textRef} className="absolute z-20 flex flex-col items-center text-center opacity-0 mt-64">
        <h2 className="text-4xl md:text-5xl font-serif text-white text-glow mb-4">
          From mountain roads to flight paths.
        </h2>
        <p className="text-xl text-[var(--accent-gold)] font-sans tracking-widest uppercase text-sm">
          One Planner. Every Journey.
        </p>
      </div>

    </div>
  );
}
