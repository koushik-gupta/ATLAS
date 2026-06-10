"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Preloader from "./Preloader";
import GlobeHero from "./GlobeHero";
import TrainTransition from "./TrainTransition";
import AirplaneReveal from "./AirplaneReveal";
import ConciergeForm from "./ConciergeForm";

gsap.registerPlugin(ScrollTrigger);

export default function ScrollNarrative() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate initial cinematic preloader
    const timer = setTimeout(() => {
      setLoading(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full bg-black text-white">
      {/* Scene 1: Preloader */}
      <Preloader isVisible={loading} />

      {/* Main Narrative Container (Hidden until preloader finishes) */}
      <div
        className={`transition-opacity duration-1000 ${
          loading ? "opacity-0" : "opacity-100"
        }`}
      >
        {/* Scenes 2 & 3: Globe Hero and India Zoom */}
        <div className="relative w-full" style={{ height: "400vh" }}>
          <GlobeHero />
        </div>

        {/* Scene 4: Train Transition */}
        <div className="relative w-full" style={{ height: "200vh" }}>
          <TrainTransition />
        </div>

        {/* Scene 5: Airplane Reveal */}
        <div className="relative w-full" style={{ height: "200vh" }}>
          <AirplaneReveal />
        </div>

        {/* Scene 6-9: Product UI */}
        <div className="relative w-full min-h-screen bg-[#050505] flex items-center justify-center py-32">
          <ConciergeForm />
        </div>
      </div>
    </div>
  );
}
