"use client";

import { motion } from "framer-motion";
import { Coffee, Map, Compass, Moon, Train, Utensils } from "lucide-react";

interface Activity {
  start_time: string;
  end_time: string;
  activity_type: string;
  description: string;
}

interface DayTimelineProps {
  day_number: number;
  date: string;
  weather_forecast: string;
  rest_hours: number;
  activities: Activity[];
}

// Helper for Activity Colors & Icons
const getActivityStyle = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes('transit')) return { color: "text-[var(--color-sunset-orange)]", bg: "bg-[var(--color-sunset-orange)]/10", icon: Train };
  if (t.includes('sightseeing')) return { color: "text-[var(--color-tropical-teal)]", bg: "bg-[var(--color-tropical-teal)]/10", icon: Compass };
  if (t.includes('meal')) return { color: "text-[var(--color-golden-amber)]", bg: "bg-[var(--color-golden-amber)]/10", icon: Utensils };
  if (t.includes('leisure') || t.includes('check-in')) return { color: "text-green-600", bg: "bg-green-100", icon: Coffee };
  if (t.includes('rest')) return { color: "text-gray-500", bg: "bg-gray-100", icon: Moon };
  return { color: "text-blue-500", bg: "bg-blue-100", icon: Map };
}

// Helper to parse **bold** text
const parseBold = (text: string) => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

export default function DayTimeline({ day_number, date, weather_forecast, rest_hours, activities }: DayTimelineProps) {
  return (
    <div className="w-full flex flex-col pt-8 pb-12 border-b border-[var(--color-deep-ocean)]/5 last:border-0 relative">
      
      {/* Vertical Spine (Connecting the whole day) */}
      <div className="absolute left-6 md:left-[11rem] top-8 bottom-0 w-px bg-gradient-to-b from-[var(--color-deep-ocean)]/10 via-[var(--color-deep-ocean)]/10 to-transparent"></div>

      {/* Day Header */}
      <div className="flex flex-col md:flex-row gap-4 md:gap-12 mb-8 relative z-10">
        <div className="md:w-32 flex flex-col text-left pl-6 md:pl-0">
           <h3 className="text-3xl font-serif text-[var(--color-deep-ocean)]">Day {day_number}</h3>
           <p className="text-sm font-sans text-[var(--color-deep-ocean)]/50 uppercase tracking-widest font-semibold mt-1">{date}</p>
        </div>
        <div className="flex-1 bg-[#FAFAFA] border border-[var(--color-deep-ocean)]/5 p-4 rounded-xl flex items-center justify-between ml-12 md:ml-0 shadow-sm">
           <div className="flex flex-col">
             <span className="text-xs uppercase tracking-widest text-[var(--color-deep-ocean)]/40 font-bold mb-1">Daily Forecast</span>
             <span className="font-sans text-sm font-medium text-[var(--color-deep-ocean)]/80">{weather_forecast}</span>
           </div>
           <div className="text-right">
             <span className="text-xs uppercase tracking-widest text-[var(--color-deep-ocean)]/40 font-bold mb-1">Rest</span>
             <p className="font-sans text-sm font-medium text-[var(--color-deep-ocean)]/80">{rest_hours}h allocated</p>
           </div>
        </div>
      </div>

      {/* Activities */}
      <div className="flex flex-col gap-6 pl-12 md:pl-[11rem] relative z-10">
        {activities.map((activity, index) => {
          const style = getActivityStyle(activity.activity_type);
          const Icon = style.icon;

          return (
            <motion.div 
              key={index}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="flex flex-col md:flex-row gap-4 md:gap-6 relative group"
            >
              {/* Timeline Node */}
              <div className="absolute -left-[2.85rem] md:-left-[2.85rem] top-4 w-3 h-3 rounded-full bg-white border-2 border-[var(--color-deep-ocean)]/20 group-hover:border-[var(--color-tropical-teal)] transition-colors"></div>

              {/* Time Block */}
              <div className="md:w-32 flex flex-col pt-3">
                <span className="font-sans font-semibold text-[var(--color-deep-ocean)]">{activity.start_time}</span>
                <span className="font-sans text-sm text-[var(--color-deep-ocean)]/40">{activity.end_time}</span>
              </div>

              {/* Content Card */}
              <div className="flex-1 bg-white border border-[var(--color-deep-ocean)]/5 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-1.5 rounded-md ${style.bg} ${style.color}`}>
                    <Icon size={16} />
                  </div>
                  <span className="text-sm font-sans uppercase tracking-widest font-bold text-[var(--color-deep-ocean)]/60">
                    {activity.activity_type}
                  </span>
                </div>
                <p className="font-serif text-[var(--color-deep-ocean)]/90 leading-relaxed text-lg">
                  {parseBold(activity.description)}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
