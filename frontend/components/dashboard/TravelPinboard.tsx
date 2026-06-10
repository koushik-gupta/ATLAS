"use client";

import { motion, useScroll, useTransform, useSpring, MotionValue } from "framer-motion";
import { Compass, MapPin } from "lucide-react";
import { useRef } from "react";

// --- Types ---
interface CardData {
  id: string;
  title: string;
  image: string;
  rotation: number;
  x: number;
  y: number;
  label: string;
  yOffsetBase: number;
  zIndex: number;
}

// --- Data ---
// Cards are placed in a strict 1280x1000 coordinate system.
// Each card is exactly 256px wide (w-64).
// The pin head anchor is at: (x + 128, y - 12)
const CARDS: CardData[] = [
  {
    id: "c1",
    title: "Kerala Backwaters",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Kerala_backwaters%2C_Canal%2C_Palm_trees%2C_India.jpg/960px-Kerala_backwaters%2C_Canal%2C_Palm_trees%2C_India.jpg",
    rotation: -6,
    x: 80,
    y: 60,
    label: "Tropical Escape",
    yOffsetBase: -20,
    zIndex: 32
  },
  {
    id: "c2",
    title: "Udaipur Palaces",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/City_Palace_Udaipur_Front.jpg/960px-City_Palace_Udaipur_Front.jpg",
    rotation: 4,
    x: 850,
    y: 40,
    label: "Heritage Stay",
    yOffsetBase: 15,
    zIndex: 31
  },
  {
    id: "c5", 
    title: "Kullu Valley",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/03/Manali_City.jpg/1280px-Manali_City.jpg",
    rotation: -5,
    x: 1000,
    y: 550,
    label: "Mountain Base",
    yOffsetBase: -30,
    zIndex: 33
  },
  {
    id: "c4",
    title: "Himalayan Ridge",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Landscape_of_Shimla_%2C_Himachal_Pradesh.jpg/1280px-Landscape_of_Shimla_%2C_Himachal_Pradesh.jpg",
    rotation: 8,
    x: 650,
    y: 720,
    label: "Elevation Focus",
    yOffsetBase: 25,
    zIndex: 34
  },
  {
    id: "c3",
    title: "Goa Coastlines",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/BeachFun.jpg/1280px-BeachFun.jpg",
    rotation: -3,
    x: 120,
    y: 650,
    label: "Coastal Escape",
    yOffsetBase: -10,
    zIndex: 35
  }
];

// Define precise SVG segment paths between the pin anchors calculated above.
// Includes natural sag and hand-pulled tension.
const THREAD_SEGMENTS = [
  { path: "M 193 56 Q 590 140 988 36", delay: 0.2 },         // Kyoto to Paris
  { path: "M 988 36 Q 1150 250 1116 546", delay: 1.4 },      // Paris to Kullu
  { path: "M 1116 546 Q 950 720 798 716", delay: 2.6 },      // Kullu to Shimla
  { path: "M 798 716 Q 510 750 240 646", delay: 3.8 }        // Shimla to Goa
];

// --- Sub-Components ---

// Extracts hook logic cleanly so useTransform isn't inside a map loop.
const PinboardCard = ({ card, progress, index }: { card: CardData, progress: MotionValue<number>, index: number }) => {
  // Parallax drift unique to this card
  const driftY = useTransform(progress, [0, 1], [card.yOffsetBase * 2, -card.yOffsetBase * 2]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, rotate: 0 }}
      whileInView={{ opacity: 1, scale: 1, rotate: card.rotation }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 1.2, delay: index * 0.15, type: "spring", stiffness: 40 }}
      style={{ 
        left: card.x, 
        top: card.y, 
        position: 'absolute',
        zIndex: card.zIndex
      }}
      whileHover={{ scale: 1.08, rotate: 0, zIndex: 50, transition: { duration: 0.4 } }}
      className="w-64 bg-white p-3 pb-8 rounded-sm shadow-[0_20px_40px_-15px_rgba(0,0,0,0.2)] border border-[#EAE3D9] cursor-pointer hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] group"
    >
      {/* Handcrafted Pin */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[#A12424] shadow-[0_4px_8px_rgba(0,0,0,0.4)] border-2 border-[#D9534F] group-hover:bg-[#C9302C] transition-colors duration-300">
        <div className="absolute top-[2px] left-[2px] w-1 h-1 rounded-full bg-white/40"></div>
      </div>
      
      {/* Polarized Image */}
      <div className="overflow-hidden mb-3 bg-gray-100">
        <img src={card.image} alt={card.title} className="w-full h-40 object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700 saturate-[0.85] contrast-[1.1] group-hover:saturate-100" />
      </div>
      
      <h3 className="font-serif text-[var(--color-deep-ocean)] text-lg mb-1">{card.title}</h3>
      
      <div className="flex items-center gap-1 text-[var(--color-deep-ocean)]/50 font-sans text-xs">
        <MapPin size={12} />
        <span className="uppercase tracking-widest">{card.label}</span>
      </div>
    </motion.div>
  );
};

// --- Main Component ---
export default function TravelPinboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 40,
    damping: 20
  });

  // Removed dynamic scroll-linked drawing. Using whileInView for guaranteed render.

  return (
    <div ref={containerRef} className="w-full min-h-[110vh] relative flex items-center justify-center overflow-hidden pt-12 pb-32 bg-[var(--color-warm-cream)]">
      
      {/* Cinematic Overlays: Ambient grain & lighting sweep */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-40 mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>
      <div className="absolute inset-0 pointer-events-none z-0 bg-gradient-to-tr from-transparent via-white/5 to-black/5 mix-blend-soft-light"></div>
      
      {/* Centered Board Coordinate Container (1280x1000) */}
      <div className="relative w-[1280px] h-[1000px] max-w-full scale-50 sm:scale-75 md:scale-90 lg:scale-100 transition-transform duration-500 origin-top">
        
        {/* Main Typography Plane (z-index 10) */}
        {/* We place it intentionally so it intersects with the cards and route perfectly */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="text-center px-6 -mt-16"
          >
             <h2 
               className="text-xs font-sans tracking-[0.5em] text-[#8E1F1F] uppercase font-bold mb-4"
               style={{ textShadow: "1px 1px 0px rgba(0,0,0,0.2)" }}
             >
               Explorer's Memory Wall
             </h2>
             <h1 
               className="text-6xl md:text-8xl font-serif text-[var(--color-deep-ocean)] mb-6 tracking-tight leading-tight"
               style={{ textShadow: "4px 4px 0px rgba(0,0,0,0.2)" }}
             >
               Every route tells <br /><span className="italic font-light">a different story.</span>
             </h1>
             <p className="font-sans text-[var(--color-deep-ocean)]/80 max-w-md mx-auto leading-relaxed text-sm font-medium tracking-wide">
               Built for journeys, not checklists.
             </p>
          </motion.div>
        </div>

        {/* The Route Thread System (SVG layers - z-index 20) */}
        <div className="absolute inset-0 w-full h-full pointer-events-none z-20">
          <svg className="w-full h-full" viewBox="0 0 1280 1000" overflow="visible">
            <defs>
              <filter id="wool-fuzz" x="-50%" y="-50%" width="200%" height="200%">
                <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="4" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" xChannelSelector="R" yChannelSelector="G" result="displaced" />
                <feGaussianBlur in="displaced" stdDeviation="0.4" result="blurred" />
                <feComposite in="SourceGraphic" in2="blurred" operator="over" />
              </filter>
              <filter id="thread-shadow">
                <feDropShadow dx="1" dy="12" stdDeviation="8" floodColor="#000000" floodOpacity="0.3" />
              </filter>
            </defs>

            {/* Render each segment individually to mimic real stitched threads */}
            {THREAD_SEGMENTS.map((segment, i) => {
              return (
                <g key={i}>
                  {/* Deep physical shadow on the paper */}
                  <motion.path 
                    initial={{ pathLength: 0, opacity: 0 }}
                    whileInView={{ pathLength: 1, opacity: 1 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 1.2, delay: segment.delay, ease: "easeInOut" }}
                    d={segment.path}
                    stroke="rgba(0,0,0,0.15)" strokeWidth="8" fill="none" 
                    style={{ filter: 'blur(5px)', transform: 'translateY(16px) translateX(4px)' }}
                  />
                  {/* Base dark core with localized depth shadow */}
                  <motion.path 
                    initial={{ pathLength: 0, opacity: 0 }}
                    whileInView={{ pathLength: 1, opacity: 1 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 1.2, delay: segment.delay, ease: "easeInOut" }}
                    d={segment.path}
                    stroke="#500A0A" strokeWidth="4" fill="none" 
                    style={{ filter: 'url(#thread-shadow)' }}
                  />
                  {/* Main Wool texture layer */}
                  <motion.path 
                    initial={{ pathLength: 0, opacity: 0 }}
                    whileInView={{ pathLength: 1, opacity: 1 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 1.2, delay: segment.delay, ease: "easeInOut" }}
                    d={segment.path}
                    stroke="#9E1E1E" strokeWidth="3" fill="none" 
                    style={{ filter: 'url(#wool-fuzz)' }}
                  />
                  {/* Specular highlight strand */}
                  <motion.path 
                    initial={{ pathLength: 0, opacity: 0 }}
                    whileInView={{ pathLength: 1, opacity: 0.8 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 1.2, delay: segment.delay, ease: "easeInOut" }}
                    d={segment.path}
                    stroke="#E25C5C" strokeWidth="0.8" fill="none" 
                    style={{ transform: 'translateY(-1px) translateX(-0.5px)' }}
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Postcards (z-index 30+) */}
        {/* Rendered independently to handle local transform hooks cleanly */}
        {CARDS.map((card, i) => (
          <PinboardCard key={card.id} card={card} progress={smoothProgress} index={i} />
        ))}
        
      </div>
    </div>
  );
}
