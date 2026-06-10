import React, { useState, useEffect, useRef } from "react";
import { MapPin, Search, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Location {
  name: string;
  state?: string;
  country?: string;
  osm_id: number;
  osm_value?: string;
  matchedAlias?: string;
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  autoFocus?: boolean;
  onEnter?: () => void;
  onBackspaceEmpty?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
  actionButton?: React.ReactNode;
}

export default function LocationAutocomplete({
  value,
  onChange,
  placeholder = "Search destination...",
  icon = <Search size={16} />,
  autoFocus = false,
  onEnter,
  onBackspaceEmpty,
  inputRef,
  actionButton,
}: LocationAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isApiError, setIsApiError] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync internal query when external value changes (e.g. initial load)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Revert query to last valid selected value if user didn't pick anything
        if (query !== value) {
          if (query.trim() === "") {
            onChange("");
          } else {
            setQuery(value);
          }
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [query, value, onChange]);

  // Debounced fetch
  useEffect(() => {
    // Only search if user typed something new and it's not exactly the selected value
    if (query === value || query.trim().length < 2) {
      if (results.length > 0) setResults([]);
      if (isOpen) setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        // Photon API query - biased towards India (lat/lon) and fetching more to sort client-side
        const tags = '&osm_tag=place:city&osm_tag=place:town&osm_tag=place:village&osm_tag=place:state&osm_tag=place:region&osm_tag=place:district&osm_tag=place:island&osm_tag=boundary:local_authority&osm_tag=boundary:administrative';
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}${tags}&lat=22.0&lon=79.0&limit=15`);
        if (!res.ok) throw new Error("Network response was not ok");
        const data = await res.json();
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let locations: Location[] = data.features.map((f: any) => {
          const rawName = f.properties.name;
          const qLower = query.toLowerCase().trim();
          const nameLower = rawName?.toLowerCase() || "";
          const stateLower = (f.properties.state || "").toLowerCase();
          const countryLower = (f.properties.country || "").toLowerCase();

          let matchedAlias;
          if (qLower.length >= 3 && !nameLower.includes(qLower) && !stateLower.includes(qLower) && !countryLower.includes(qLower)) {
             matchedAlias = query.trim();
          }

          return {
            name: rawName,
            state: f.properties.state,
            country: f.properties.country,
            osm_id: f.properties.osm_id,
            osm_value: f.properties.osm_value,
            matchedAlias
          };
        }).filter((l: any) => l.name);

        // Remove duplicates by osm_id or name+state
        const uniqueLocations = locations.filter((loc, index, self) =>
          index === self.findIndex((t) => (
            t.osm_id === loc.osm_id || (t.name === loc.name && t.state === loc.state)
          ))
        );

        // Map original index to preserve API relevance ranking during ties
        const withIndex = uniqueLocations.map((loc, idx) => ({ ...loc, _apiRank: idx }));

        const getTier = (osm_value: string) => {
          if (['state', 'region', 'local_authority', 'administrative', 'district', 'city', 'island', 'town'].includes(osm_value)) return 1;
          return 2; // village, locality, hamlet, etc.
        };

        const q = query.toLowerCase().trim();

        withIndex.sort((a: any, b: any) => {
          // 1. Prioritize India
          if (a.country === "India" && b.country !== "India") return -1;
          if (a.country !== "India" && b.country === "India") return 1;

          // 2. Suppress minor villages when major regions/cities exist
          const tierA = getTier(a.osm_value || "");
          const tierB = getTier(b.osm_value || "");
          if (tierA !== tierB) return tierA - tierB;
          
          // 3. Exact match priority (prevents fuzzy matches like 'Shamli' beating 'Shimla')
          const aExact = a.name.toLowerCase() === q;
          const bExact = b.name.toLowerCase() === q;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          
          // 4. Fallback to original API ranking (ElasticSearch relevance)
          return a._apiRank - b._apiRank;
        });

        // Filter out fuzzy-matched obscure villages (Tier 2) to reduce noise like 'Osty' for 'Ooty'
        let cleanedResults = withIndex.filter((loc) => {
          const locNameLower = loc.name.toLowerCase();
          const isFuzzy = !locNameLower.includes(q) && !q.includes(locNameLower);
          if (isFuzzy && getTier(loc.osm_value || "") === 2) {
             return false;
          }
          return true;
        });

        if (cleanedResults.length === 0 && withIndex.length > 0) {
            cleanedResults = withIndex;
        }

        setResults(cleanedResults.slice(0, 5));
        setIsOpen(true);
        setHighlightedIndex(-1);
      } catch (err) {
        console.error("Failed to fetch locations:", err);
        setIsApiError(true);
        setResults([]);
        setIsOpen(true); // Open anyway to show fallback
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, value]);

  const handleSelect = (loc: Location) => {
    const fullName = loc.name; // Can also append state/country if needed, e.g., `${loc.name}, ${loc.country}`
    setQuery(fullName);
    onChange(fullName);
    setIsOpen(false);
    
    // Focus the input back
    const input = wrapperRef.current?.querySelector("input");
    if (input) input.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "Enter" && onEnter) {
        e.preventDefault();
        onEnter();
      }
      if (e.key === "Backspace" && query === "" && onBackspaceEmpty) {
        onBackspaceEmpty();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const maxIndex = results.length > 0 ? results.length - 1 : 0; // 0 for the fallback item
      setHighlightedIndex(prev => (prev < maxIndex ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results.length === 0) {
        // Fallback option selected
        handleSelect({ name: query, osm_id: 0 });
      } else if (highlightedIndex >= 0 && highlightedIndex < results.length) {
        handleSelect(results[highlightedIndex]);
      } else if (results.length > 0) {
        // Pick first result if hitting enter without highlighting
        handleSelect(results[0]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setQuery(value);
    }
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div 
        className="flex items-center gap-3 px-4 py-3.5 bg-white rounded-2xl border border-[#0F2747]/[0.08] shadow-sm transition-all focus-within:border-[#FF8A3D]/35 focus-within:shadow-[0_0_0_3px_rgba(255,138,61,0.055)] relative z-10"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-owns="autocomplete-list"
      >
        {icon || <Search size={14} className="text-[#FF8A3D] flex-shrink-0" />}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsApiError(false); // Reset error on type
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if ((results.length > 0 || isApiError) && query !== value) setIsOpen(true);
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-autocomplete="list"
          aria-controls="autocomplete-list"
          aria-activedescendant={highlightedIndex >= 0 ? `option-${highlightedIndex}` : undefined}
          className="flex-1 bg-transparent text-[#0F2747] placeholder-[#0F2747]/18 text-[15px] font-medium outline-none"
        />
        {isLoading && <Loader2 size={14} className="text-[#0F2747]/20 animate-spin flex-shrink-0" />}
        {actionButton}
      </div>

      <AnimatePresence>
        {isOpen && (results.length > 0 || (query.length >= 2 && !isLoading)) && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-[0_8px_30px_rgba(15,39,71,0.12)] border border-[#0F2747]/[0.06] overflow-hidden z-50"
          >
            <ul id="autocomplete-list" role="listbox" className="max-h-[220px] overflow-y-auto py-1">
              {results.length > 0 ? (
                results.map((loc, idx) => {
                  const isHighlighted = idx === highlightedIndex;
                  const subtitle = [loc.state, loc.country].filter(Boolean).join(", ");
                  return (
                    <li
                      key={loc.osm_id}
                      id={`option-${idx}`}
                      role="option"
                      aria-selected={isHighlighted}
                      onClick={() => handleSelect(loc)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 transition-colors ${
                        isHighlighted ? "bg-[#0F2747]/[0.03]" : ""
                      }`}
                    >
                      <MapPin size={13} className={isHighlighted ? "text-[#FF8A3D]" : "text-[#0F2747]/30"} />
                      <div className="flex flex-col">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[14px] font-semibold text-[#0F2747]">{loc.name}</span>
                          {loc.matchedAlias && (
                            <span className="text-[12px] text-[#0F2747]/60 italic font-medium">
                              (matches "{loc.matchedAlias}")
                            </span>
                          )}
                        </div>
                        {subtitle && <span className="text-[11px] text-[#0F2747]/40">{subtitle}</span>}
                      </div>
                    </li>
                  );
                })
              ) : (
                <li
                  role="option"
                  id="option-0"
                  aria-selected={highlightedIndex === 0}
                  onClick={() => handleSelect({ name: query, osm_id: 0 })}
                  onMouseEnter={() => setHighlightedIndex(0)}
                  className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 transition-colors ${
                    highlightedIndex === 0 ? "bg-[#0F2747]/[0.03]" : ""
                  }`}
                >
                  <MapPin size={13} className={highlightedIndex === 0 ? "text-[#FF8A3D]" : "text-[#0F2747]/30"} />
                  <div className="flex flex-col">
                    <span className="text-[14px] font-semibold text-[#0F2747]">Use &quot;{query}&quot; anyway</span>
                    <span className="text-[11px] text-[#0F2747]/40">Manual entry bypass</span>
                  </div>
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
