"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";

// Dynamically import Globe to avoid SSR issues with Three.js
const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

export default function GlobeHero() {
  const containerRef = useRef<HTMLDivElement>(null);
  const text1Ref = useRef<HTMLDivElement>(null);
  const text2Ref = useRef<HTMLDivElement>(null);
  const globeWrapperRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<any>(null);

  useEffect(() => {
    if (globeRef.current) {
      const globe = globeRef.current;
      globe.controls().autoRotate = true;
      globe.controls().autoRotateSpeed = 0.5;
      globe.controls().enableZoom = false;
      globe.pointOfView({ lat: 20, lng: 80, altitude: 2.5 });
    }
  }, []);
  
  // Custom styling for the globe
  const globeMaterial = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // The whole GlobeHero section acts as a pin
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: containerRef.current,
        start: "top top",
        end: "+=300%",
        scrub: 1,
        pin: true,
      },
    });

    // Animate text fading and globe scale
    tl.to(text1Ref.current, { opacity: 0, y: -50, duration: 1 })
      .to(globeWrapperRef.current, { scale: 1.5, opacity: 1, duration: 2 }, "<")
      .to(text2Ref.current, { opacity: 1, y: 0, duration: 1 }, "-=1")
      .to(globeWrapperRef.current, { scale: 3.5, y: "20vh", duration: 2 }, "+=0.5")
      .to(text2Ref.current, { opacity: 0, duration: 0.5 }, "<");

  }, []);

  return (
    <div ref={containerRef} className="pin-wrapper bg-black overflow-hidden flex items-center justify-center">
      
      {/* Background ambient glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0a0805] opacity-50"></div>

      {/* Hero Text 1 */}
      <div ref={text1Ref} className="absolute z-10 flex flex-col items-center text-center">
        <h1 className="text-4xl md:text-6xl font-serif text-[var(--foreground)] mb-4">
          Every journey has a path.
        </h1>
        <p className="text-lg md:text-xl text-gray-400 font-sans tracking-wide">
          We make it intelligent.
        </p>
      </div>

      {/* Hero Text 2 (Reveals later in scroll) */}
      <div ref={text2Ref} className="absolute z-10 flex flex-col items-center text-center opacity-0 translate-y-10">
        <h2 className="text-3xl md:text-5xl font-serif text-[var(--accent-gold)] text-glow mb-4">
          Not every route is the same.
        </h2>
        <p className="text-lg text-gray-400 font-sans tracking-wide">
          Terrains change the journey.
        </p>
      </div>

      {/* Globe Container */}
      <div ref={globeWrapperRef} className="absolute z-0 w-full h-full flex items-center justify-center opacity-80 scale-90">
        <div className="w-[800px] h-[800px]">
          <Globe
            ref={globeRef}
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
            backgroundColor="rgba(0,0,0,0)"
            atmosphereColor="#cfa86e"
            atmosphereAltitude={0.15}
            arcsData={[
              { startLat: 28.6, startLng: 77.2, endLat: 31.1, endLng: 77.1, color: "#cfa86e" }, // Delhi to Shimla
              { startLat: 34.0, startLng: -118.2, endLat: 35.6, endLng: 139.6, color: "rgba(255,255,255,0.2)" }, // LA to Tokyo
              { startLat: 51.5, startLng: -0.1, endLat: 48.8, endLng: 2.3, color: "rgba(255,255,255,0.2)" }, // London to Paris
            ]}
            arcColor="color"
            arcDashLength={0.4}
            arcDashGap={4}
            arcDashInitialGap={() => Math.random() * 5}
            arcDashAnimateTime={2000}
            arcAltitudeAutoScale={0.2}
          />
        </div>
      </div>
      
    </div>
  );
}
