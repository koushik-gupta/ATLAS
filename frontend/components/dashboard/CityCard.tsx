"use client";

import { motion, useInView } from "framer-motion";
import { Compass, Star, MapPin, Building, Train, Plane, Car } from "lucide-react";
import DayTimeline from "./DayTimeline";
import { useRouteContext } from "./RouteContext";
import { useEffect, useRef } from "react";

// Helper for Destination Mood
const getDestinationMood = (type: string) => {
  switch(type) {
    case 'mountain': return "bg-blue-50/40"; // Cool mist
    case 'beach': return "bg-orange-50/40"; // Warm sunset
    default: return "bg-[#FAFAFA]";
  }
}

// Helper to parse **bold** text
const parseBold = (text: string) => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-bold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

// Temporary internal types matching our mock backend data
interface CityCardProps {
  city: any;
  index: number;
  isOrigin?: boolean;
  isReturn?: boolean;
  tripData?: any;
  briefData?: any;
}

export default function CityCard({ city, index, isOrigin, isReturn, tripData, briefData }: CityCardProps) {
  const { setActiveSegmentIndex } = useRouteContext();
  const ref = useRef(null);
  const isInView = useInView(ref, { margin: "-40% 0px -40% 0px" });

  useEffect(() => {
    if (isInView) {
      setActiveSegmentIndex(index);
    }
  }, [isInView, index, setActiveSegmentIndex]);

  return (
    <div className="relative" ref={ref}>
      <motion.article 
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 1.2, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className={`w-full ${getDestinationMood(city.type)} rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(15,39,71,0.05)] border border-[var(--color-deep-ocean)]/5 flex flex-col relative z-10 overflow-hidden`}
      >
        {/* Cinematic Image Reveal Mask */}
        <div className="relative h-[400px] w-full overflow-hidden">
          <motion.div 
            initial={{ scale: 1.05 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="absolute inset-0 z-10"
          >
            <img 
              src={city.image} 
              alt={city.city}
              className="w-full h-full object-cover"
            />
          </motion.div>
          
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent z-20 pointer-events-none"></div>
          
          {/* A sliding mask that disappears */}
          <motion.div 
            initial={{ y: "0%" }}
            whileInView={{ y: "100%" }}
            viewport={{ once: true }}
            transition={{ duration: 1.2, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 bg-[var(--color-deep-ocean)] z-30"
          />
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.8, ease: "easeOut" }}
            className="absolute bottom-8 left-8 z-40"
          >
            <h3 className="text-6xl font-serif text-white tracking-wide shadow-sm">
              {city.city}
            </h3>
            <p className="text-xl font-sans text-white/90 mt-2 font-light">
              {city.nights} Nights
            </p>
          </motion.div>
        </div>

        {/* Top Widgets & Curator Note */}
        <div className="flex flex-col md:flex-row p-8 pb-4 gap-8">
          
          {/* Left Panel: Insight or Origin/Return Summary */}
          <motion.div 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 1 }}
            className="md:w-2/5 pt-4 pr-6"
          >
            {isOrigin ? (
              <>
                <div className="flex items-center gap-2 text-[var(--color-tropical-teal)] mb-4">
                  <Compass size={18} />
                  <span className="text-xs uppercase tracking-widest font-bold">Journey Begins</span>
                </div>
                <div className="text-[var(--color-deep-ocean)] font-sans text-[15px] leading-relaxed opacity-90 mb-6">
                  Your journey begins from {city.city}.<br/><br/>
                  Over the next {briefData?.duration_days || tripData?.route?.length || 7} days you will explore the destinations selected for this expedition. The itinerary has been optimized for your chosen pace, travel style, and budget.
                </div>
              </>
            ) : isReturn ? (
              <>
                <div className="flex items-center gap-2 text-[var(--color-tropical-teal)] mb-4">
                  <Compass size={18} />
                  <span className="text-xs uppercase tracking-widest font-bold">Journey Complete</span>
                </div>
                <div className="text-[var(--color-deep-ocean)] font-sans text-[15px] leading-relaxed opacity-90 mb-6">
                  You have successfully completed your journey and returned to {city.city}.<br/><br/>
                  Over the course of this expedition you explored multiple destinations, experienced local culture, landscapes, and attractions, and completed the route planned specifically for your preferences.<br/><br/>
                  <span className="font-semibold">Welcome Home.</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-[var(--color-tropical-teal)] mb-4">
                  <Compass size={18} />
                  <span className="text-xs uppercase tracking-widest font-bold">Destination Insight</span>
                </div>
                <div className="text-[var(--color-deep-ocean)] font-sans text-[15px] leading-relaxed whitespace-pre-line opacity-90">
                  {parseBold(city.destination_insight || city.planner_scratchpad)}
                </div>
              </>
            )}
          </motion.div>

          {/* Exact Data Widgets (Layered offset) */}
          <div className="md:w-3/5 grid grid-cols-2 gap-4 relative md:-top-16 z-50">
            
            {/* Origin Details Widget */}
            {isOrigin && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.6 }}
                className="p-5 rounded-2xl bg-white shadow-xl shadow-[var(--color-deep-ocean)]/5 border border-[var(--color-deep-ocean)]/5 col-span-2 md:col-span-1 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-3 text-[var(--color-tropical-teal)]">
                    <Compass size={18} />
                    <span className="text-xs uppercase tracking-widest font-bold text-[var(--color-deep-ocean)]/60">Expedition Details</span>
                  </div>
                  <div className="flex flex-col gap-3 mt-4">
                    <div className="flex items-center justify-between"><span className="text-sm font-sans font-medium text-[var(--color-deep-ocean)]/70">Duration</span> <span className="text-sm font-sans font-semibold text-[var(--color-deep-ocean)]">{briefData?.duration_days || 7} Days</span></div>
                    <div className="flex items-center justify-between"><span className="text-sm font-sans font-medium text-[var(--color-deep-ocean)]/70">Destinations</span> <span className="text-sm font-sans font-semibold text-[var(--color-deep-ocean)]">{tripData?.route?.length ? Math.max(0, tripData.route.length - 2) : 0}</span></div>
                    <div className="flex items-center justify-between"><span className="text-sm font-sans font-medium text-[var(--color-deep-ocean)]/70">Travel Pace</span> <span className="text-sm font-sans font-semibold text-[var(--color-deep-ocean)]">{briefData?.pace || "Moderate"}</span></div>
                    <div className="flex items-center justify-between"><span className="text-sm font-sans font-medium text-[var(--color-deep-ocean)]/70">Travelers</span> <span className="text-sm font-sans font-semibold text-[var(--color-deep-ocean)]">{briefData?.traveller_count || 1} {briefData?.traveller_type || "Adult(s)"}</span></div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-end">
                  <div>
                    <p className="text-xs font-sans text-gray-500">Budget Range</p>
                    <p className="font-sans font-medium text-[var(--color-deep-ocean)]">₹{(briefData?.budget_min || 0).toLocaleString()} - ₹{(briefData?.budget_max || 0).toLocaleString()}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Return Summary Widget */}
            {isReturn && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.8 }}
                className="p-5 rounded-2xl bg-white shadow-xl shadow-[var(--color-deep-ocean)]/5 border border-[var(--color-deep-ocean)]/5 col-span-2 md:col-span-1 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-3 text-[var(--color-tropical-teal)]">
                    <Compass size={18} />
                    <span className="text-xs uppercase tracking-widest font-bold text-[var(--color-deep-ocean)]/60">Final Summary</span>
                  </div>
                  <div className="flex flex-col gap-3 mt-4">
                    <div className="flex items-center justify-between"><span className="text-sm font-sans font-medium text-[var(--color-deep-ocean)]/70">Total Days</span> <span className="text-sm font-sans font-semibold text-[var(--color-deep-ocean)]">{briefData?.duration_days || 7}</span></div>
                    <div className="flex items-center justify-between"><span className="text-sm font-sans font-medium text-[var(--color-deep-ocean)]/70">Total Destinations</span> <span className="text-sm font-sans font-semibold text-[var(--color-deep-ocean)]">{tripData?.route?.length ? Math.max(0, tripData.route.length - 2) : 0}</span></div>
                    <div className="flex items-center justify-between"><span className="text-sm font-sans font-medium text-[var(--color-deep-ocean)]/70">Transit Segments</span> <span className="text-sm font-sans font-semibold text-[var(--color-deep-ocean)]">{tripData?.route?.filter((c: any) => c.transport_to_city).length || 0}</span></div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-end">
                  <div>
                    <p className="text-xs font-sans text-gray-500">Experiences Planned</p>
                    <p className="font-sans font-medium text-[var(--color-deep-ocean)]">
                      {tripData?.route?.reduce((acc: number, curr: any) => acc + (curr.day_plans?.reduce((a: number, p: any) => a + (p.activities?.filter((act: any) => {
                        const type = act.activity_type?.toLowerCase() || '';
                        const excluded = ['transit', 'meal', 'check-in', 'check-out', 'check in', 'check out', 'rest', 'leisure', 'dinner', 'lunch', 'breakfast', 'free time'];
                        return !excluded.some(ex => type.includes(ex));
                      }).length || 0), 0) || 0), 0) || 0}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Transport Widget */}
            {city.transport_to_city && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.6 }}
                className="p-5 rounded-2xl bg-white shadow-xl shadow-orange-900/5 border border-orange-100 col-span-2 md:col-span-1 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-3 text-[var(--color-sunset-orange)]">
                    <Train size={18} />
                    <span className="text-xs uppercase tracking-widest font-bold text-[var(--color-deep-ocean)]/60">Transport</span>
                  </div>
                  <p className="font-sans font-semibold text-[var(--color-deep-ocean)] text-lg">{city.transport_to_city.provider}</p>
                  <p className="font-sans text-sm text-[var(--color-deep-ocean)]/70">{city.transport_to_city.travel_class}</p>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-end">
                  <div>
                    <p className="text-xs font-sans text-gray-500">Departure</p>
                    <p className="font-sans font-medium text-[var(--color-deep-ocean)]">{city.transport_to_city.departure_time}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-sans text-gray-500">Duration</p>
                    <p className="font-sans font-medium text-[var(--color-deep-ocean)]">{city.transport_to_city.duration}</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Hotel Widget */}
            {city.hotel && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.8 }}
                className="p-5 rounded-2xl bg-white shadow-xl shadow-blue-900/5 border border-blue-100 col-span-2 md:col-span-1 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-3 text-[var(--color-golden-amber)]">
                    <Building size={18} />
                    <span className="text-xs uppercase tracking-widest font-bold text-[var(--color-deep-ocean)]/60">Lodging</span>
                  </div>
                  <p className="font-sans font-semibold text-[var(--color-deep-ocean)] text-lg line-clamp-1">{city.hotel.name}</p>
                  <div className="flex items-center gap-1 mt-1">
                     {Array.from({ length: Math.floor(city.hotel.stars) }).map((_, i) => (
                       <Star key={i} size={12} fill="var(--color-golden-amber)" className="text-[var(--color-golden-amber)]" />
                     ))}
                     <span className="text-xs font-sans text-gray-500 ml-2">{city.hotel.rating}/10</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-sans text-gray-500">Price</p>
                  <p className="font-sans font-medium text-[var(--color-deep-ocean)]">{city.hotel.price_per_night} / night</p>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Expanding Day-by-Day Timeline */}
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, delay: 0.4 }}
          className="px-8 pb-8"
        >
          {city.day_plans?.map((day: any, i: number) => (
            <DayTimeline 
              key={i}
              day_number={day.day_number}
              date={day.date}
              weather_forecast={day.weather_forecast}
              rest_hours={day.rest_hours_allocated}
              activities={day.activities}
            />
          ))}
        </motion.div>

      </motion.article>
    </div>
  );
}
