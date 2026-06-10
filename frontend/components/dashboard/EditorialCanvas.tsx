"use client";

import { motion } from "framer-motion";
import ExpeditionSummary from "./ExpeditionSummary";
import ChapterHeader from "./ChapterHeader";
import CityCard from "./CityCard";

import { MOCK_TRIP_OPTION } from "@/lib/mockData";

interface EditorialCanvasProps {
  tripData?: any;
  briefData?: any;
}

export default function EditorialCanvas({ tripData, briefData }: EditorialCanvasProps) {
  const data = tripData || MOCK_TRIP_OPTION;
  
  return (
    <div className="flex-1 h-full overflow-y-auto relative no-scrollbar">
      <div className="max-w-6xl mx-auto pb-32 pt-16">
        {/* Phase 2: Global Trip Summary */}
        <ExpeditionSummary 
          label={data.option_label || "Expedition Plan"}
          summary={data.summary || "A journey constructed for you."}
          cost={data.total_cost_inr || 0}
          hours={data.total_travel_hours || 0}
          constraints={data.constraints_applied || []}
        />

        {/* Phase 3 & 4: City Cards and Timelines */}
        <div className="mt-16 flex flex-col gap-12 px-4 md:px-8">
          {data.route?.map((city: any, index: number) => (
            <div key={index} className="flex flex-col gap-12">
              
              {/* Chapter Header (unless it's the first city) */}
              {index > 0 && (
                <ChapterHeader 
                  title={`Ascending into ${city.city}`} 
                  subtitle="Route progression established"
                  delay={0.2}
                />
              )}

              {/* City Card (Holds Image, Widgets, Curator Note, and Day Timeline) */}
              <CityCard 
                city={city} 
                index={index} 
                isOrigin={index === 0} 
                isReturn={index === data.route.length - 1}
                tripData={data}
                briefData={briefData}
              />

            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
