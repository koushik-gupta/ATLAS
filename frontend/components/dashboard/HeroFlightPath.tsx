"use client";

import { motion } from "framer-motion";

export default function HeroFlightPath() {
  // A tighter, elegant cinematic flight path.
  // Starts below the text, loops tightly, coasts shallowly underneath, and swoops up late.
  const pathData = "M 400 460 C 650 460, 800 150, 600 150 C 400 150, 400 460, 650 460 C 900 460, 980 370, 1020 370";

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none z-20">
      <svg className="w-full h-full" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" overflow="visible">
        <defs>
          <filter id="plane-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#0F2747" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* RESTORED: Original Cinematic Route Arcs (Moved Up) */}
        <motion.path
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 5, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
          d="M -100 650 Q 400 200, 1200 400 T 2000 50"
          stroke="var(--color-deep-ocean)"
          strokeWidth="2"
          fill="none"
          opacity="0.05"
        />

        {/* Hidden reference path for the motion animation (Invisible!) */}
        <path id="flight-route" d={pathData} fill="none" stroke="none" />

        {/* The Animated Paper Plane Group (Hidden on mobile to avoid misalignment) */}
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 7, times: [0, 0.1, 0.9, 1], delay: 0.5 }}
          className="hidden md:block"
        >
          {/* Centering offset + Forward axis alignment (45deg) so rotate="auto" works accurately */}
          <g transform="translate(-12, -12) rotate(0, 12, 12)">
            {/* The Plane Shape - Luxury origami style */}
            <path
              d="M22 2L15 22L11 13L2 9L22 2Z"
              fill="#FFFDF9"
              stroke="#8E1F1F"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#plane-shadow)"
            />
            {/* Fold line detail */}
            <path
              d="M22 2L11 13"
              stroke="#8E1F1F"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.3"
            />
          </g>

          {/* Native SVG Motion Animation */}
          <animateMotion
            dur="5.5s"
            begin="0.5s"
            repeatCount="1"
            fill="freeze"
            rotate="auto"
            calcMode="spline"
            keyTimes="0;1"
            keySplines="0.25 1 0.25 1"
          >
            <mpath href="#flight-route" />
          </animateMotion>
        </motion.g>
      </svg>
    </div>
  );
}
