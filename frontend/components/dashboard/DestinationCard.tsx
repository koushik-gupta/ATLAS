import { motion } from "framer-motion";
import { Check, CheckCircle2 } from "lucide-react";

interface DestinationCardProps {
  city: string;
  image: string;
  description: string;
  isSelected: boolean;
  onToggle: () => void;
}

export default function DestinationCard({ city, image, description, isSelected, onToggle }: DestinationCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onToggle}
      className={`relative group cursor-pointer overflow-hidden rounded-2xl transition-all duration-300 ${
        isSelected ? 'ring-2 ring-emerald-500 shadow-[0_8px_30px_rgba(16,185,129,0.3)]' : 'shadow-lg hover:shadow-xl'
      }`}
      style={{ height: "320px" }}
    >
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
        style={{ backgroundImage: `url('${image}')` }}
      />
      
      {/* Gradient Overlay */}
      <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent transition-opacity duration-300 ${isSelected ? 'opacity-90' : 'opacity-70 group-hover:opacity-80'}`} />

      {/* Selected Indicator */}
      <div className="absolute top-4 right-4 z-20">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 backdrop-blur-md ${isSelected ? 'bg-emerald-500 text-white scale-100' : 'bg-white/20 border border-white/40 text-transparent scale-90 opacity-0 group-hover:opacity-100'}`}>
          <Check strokeWidth={3} size={16} />
        </div>
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 z-20 flex flex-col justify-end h-full">
        <h3 className="text-2xl font-bold text-white mb-2 leading-tight tracking-wide">{city}</h3>
        <p className={`text-white/80 text-sm leading-relaxed line-clamp-3 transition-all duration-300 ${isSelected ? 'text-white/95 font-medium' : ''}`}>
          {description}
        </p>
      </div>
    </motion.div>
  );
}
