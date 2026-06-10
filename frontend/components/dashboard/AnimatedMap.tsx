"use client";

import React, { useRef, useState, useEffect, useMemo } from "react";
import Map, { Source, Layer, Marker, NavigationControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { Plane, Train, Car } from "lucide-react";
import { bezierSpline, length, destination, midpoint, distance, bearing, point, lineString, along, feature } from "@turf/turf";
import { MOCK_TRIP_OPTION } from "@/lib/mockData";
import { useRouteContext } from "./RouteContext";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY || "get_your_own_OpIi9ZULNHzrESv6T2vL";

// Helper to create an arc between two points
function createFlightArc(origin: number[], dest: number[]) {
  const ptA = point(origin);
  const ptB = point(dest);
  const dist = distance(ptA, ptB);
  const mid = midpoint(ptA, ptB);
  const brg = bearing(ptA, ptB);
  // Perpendicular offset for arc
  const arcMidpoint = destination(mid, dist * 0.25, brg - 90);
  const line = lineString([origin, arcMidpoint.geometry.coordinates, dest]);
  return bezierSpline(line, { resolution: 10000, sharpness: 0.8 });
}


export default function AnimatedMap({ tripData }: { tripData?: any }) {
  const mapRef = useRef<any>(null);
  const [mounted, setMounted] = useState(false);
  const { activeSegmentIndex } = useRouteContext();

  // Build route from real tripData if available, else fall back to mock
  const routeData = useMemo(() => {
    if (tripData?.route && Array.isArray(tripData.route) && tripData.route.length >= 2) {
      return tripData.route;
    }
    return MOCK_TRIP_OPTION.route;
  }, [tripData]);

  // Build segments dynamically from routeData
  const routeSegments = useMemo(() => {
    return routeData.slice(1).map((city: any, idx: number) => {
      const originCity = routeData[idx];
      const destCity = city;
      const transport = city.transport_to_city;
      const origin = originCity.coordinates as [number, number];
      const dest = destCity.coordinates as [number, number];

      let geometry: any;
      const typeStr = (transport?.type || '').toLowerCase();
      if (typeStr.includes('flight')) {
        geometry = createFlightArc(origin, dest).geometry;
      } else {
        const ptA = point(origin);
        const ptB = point(dest);
        const dist = distance(ptA, ptB);
        const mid = midpoint(ptA, ptB);
        const brg = bearing(ptA, ptB);
        const offset = destination(mid, dist * (!typeStr.includes('flight') && !typeStr.includes('train') ? 0.05 : 0.02), brg - 90);
        const line = lineString([origin, offset.geometry.coordinates, dest]);
        geometry = bezierSpline(line, { resolution: 1000 }).geometry;
      }

      return {
        id: `segment-${idx}`,
        origin,
        dest,
        originName: originCity.city,
        destName: destCity.city,
        transport,
        geometry,
        length: length(feature(geometry)),
      };
    });
  }, [routeData]);
  
  // Hover Tooltip State
  const [hoveredSegment, setHoveredSegment] = useState<any>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Animation Progress State (0 to 1)
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setMounted(true);
    let animationFrameId: number;
    let startTime = Date.now();
    const DURATION = 6000; // 6 seconds per loop

    const animate = () => {
      const now = Date.now();
      const p = ((now - startTime) % DURATION) / DURATION;
      setProgress(p);
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // ── Cinematic auto-tour on first open ───────────────────────────────────────
  // Runs once after the map loads: origin close-up → each segment → full-route overview.
  const cinematicRunning = useRef(false);

  const onMapLoad = () => {
    if (!mapRef.current) return;
    const map = mapRef.current.getMap();

    map.addSource("maptiler-terrain", {
      type: "raster-dem",
      url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`,
    });
    map.setTerrain({ source: "maptiler-terrain", exaggeration: 1.5 });

    // Kick off the cinematic sequence
    cinematicRunning.current = true;
    runCinematicTour(map);
  };

  const runCinematicTour = (map: any) => {
    if (!routeData || routeData.length < 1) return;

    // Step 0: Fly to origin close-up (3 s)
    const ORIGIN_DWELL = 3200;
    const SEG_DWELL    = 3800; // how long to hold each city view
    const OVERVIEW_DELAY = 1200;

    map.flyTo({
      center: routeData[0].coordinates as [number, number],
      zoom: 9,
      pitch: 55,
      bearing: 15,
      duration: 2800,
      essential: true,
    });

    // Step 1..N: Visit each destination
    let cumulativeDelay = ORIGIN_DWELL;

    routeSegments.forEach((seg: any, idx: number) => {
      const typeStr = (seg.transport?.type || '').toLowerCase();
      const isFlight = typeStr.includes('flight');
      const isTrain  = typeStr.includes('train');

      const ptA = point(seg.origin);
      const ptB = point(seg.dest);
      const mid = midpoint(ptA, ptB).geometry.coordinates as [number, number];
      const routeBearing = bearing(ptA, ptB);

      setTimeout(() => {
        if (!cinematicRunning.current) return;
        if (isFlight) {
          // Pull back to see the full arc
          map.flyTo({
            center: mid,
            zoom: 4.5,
            pitch: 25,
            bearing: routeBearing,
            duration: SEG_DWELL - 400,
            essential: true,
          });
        } else if (isTrain) {
          // Medium zoom on destination, slight tilt
          map.flyTo({
            center: seg.dest,
            zoom: 7.5,
            pitch: 50,
            bearing: routeBearing - 20,
            duration: SEG_DWELL - 400,
            essential: true,
          });
        } else {
          // Car — close-up cinematic tilt
          map.flyTo({
            center: seg.dest,
            zoom: 8.5,
            pitch: 65,
            bearing: routeBearing + 30,
            duration: SEG_DWELL - 400,
            essential: true,
          });
        }
      }, cumulativeDelay);

      cumulativeDelay += SEG_DWELL;
    });

    // Final step: Zoom out to show the whole route
    const allCoords = routeData.map((c: any) => c.coordinates as [number, number]);
    const lngs = allCoords.map((c: [number, number]) => c[0]);
    const lats = allCoords.map((c: [number, number]) => c[1]);
    const sw: [number, number] = [Math.min(...lngs) - 0.8, Math.min(...lats) - 0.8];
    const ne: [number, number] = [Math.max(...lngs) + 0.8, Math.max(...lats) + 0.8];

    setTimeout(() => {
      if (!cinematicRunning.current) return;
      map.fitBounds([sw, ne], {
        padding: 80,
        pitch: 0,
        bearing: 0,
        duration: 2800,
        essential: true,
      });
    }, cumulativeDelay + OVERVIEW_DELAY);
  };

  // ── User-driven camera: clicking a city card still flies the map ────────────
  useEffect(() => {
    if (!mounted || !mapRef.current) return;
    // Stop the auto cinematic tour when the user interacts
    cinematicRunning.current = false;
    const map = mapRef.current.getMap();

    if (activeSegmentIndex === 0) {
      map.flyTo({
        center: routeData[0].coordinates,
        zoom: 9,
        pitch: 50,
        duration: 2800,
      });
    } else {
      const segment = routeSegments[activeSegmentIndex - 1];
      if (!segment) return;

      const ptOrigin = point(segment.origin);
      const ptDest   = point(segment.dest);
      const mid      = midpoint(ptOrigin, ptDest).geometry.coordinates;
      const routeBearing = bearing(ptOrigin, ptDest);

      const typeStr = (segment.transport?.type || '').toLowerCase();
      if (typeStr.includes('flight')) {
        map.flyTo({
          center: mid as [number, number],
          zoom: 4.5,
          pitch: 25,
          bearing: routeBearing,
          duration: 3200,
        });
      } else if (typeStr.includes('train')) {
        map.flyTo({
          center: segment.dest as [number, number],
          zoom: 7.5,
          pitch: 50,
          bearing: routeBearing - 20,
          duration: 3200,
        });
      } else {
        map.flyTo({
          center: segment.dest as [number, number],
          zoom: 8.5,
          pitch: 65,
          bearing: routeBearing + 30,
          duration: 3200,
        });
      }
    }
  }, [activeSegmentIndex, mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;

  return (
    <div className="w-full h-full relative" 
         onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}>
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: 80.0,
          latitude: 20.0,
          zoom: 4,
          pitch: 0,
          bearing: 0,
        }}
        mapStyle={`https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`}
        onLoad={onMapLoad}
        attributionControl={false}
        interactiveLayerIds={routeSegments.map((s: any) => s.id + '-click')}
        onMouseMove={(e) => {
          if (e.features && e.features.length > 0) {
            const feature = e.features[0];
            const segId = feature.layer.id.replace('-click', '');
            const seg = routeSegments.find((s: any) => s.id === segId);
            if (seg) setHoveredSegment(seg);
          } else {
            setHoveredSegment(null);
          }
        }}
        onMouseLeave={() => setHoveredSegment(null)}
      >
        <NavigationControl position="bottom-right" />

        {/* Route Segments */}
        {routeSegments.map((segment: any, idx: number) => {
          const isActive = (activeSegmentIndex - 1 === idx);
          const typeStr = (segment.transport?.type || '').toLowerCase();
          const isFlight = typeStr.includes('flight');
          const isTrain = typeStr.includes('train');
          
          let color = "#A3A3A3";
          if (isFlight) color = "#FF8A3D";
          else if (isTrain) color = "#D4AF37";
          else color = "#F59E0B"; // Car

          return (
            <Source key={segment.id} id={segment.id} type="geojson" data={feature(segment.geometry) as any}>
              {/* Invisible wider line for easy hovering */}
              <Layer
                id={`${segment.id}-click`}
                type="line"
                paint={{ "line-color": "transparent", "line-width": 20 }}
              />
              
              {/* Glow Effect */}
              {isFlight && (
                <Layer
                  id={`${segment.id}-glow`}
                  type="line"
                  paint={{
                    "line-color": color,
                    "line-width": isActive ? 8 : 4,
                    "line-blur": 10,
                    "line-opacity": isActive ? 0.6 : 0.2,
                  }}
                />
              )}
              
              {/* Core Route Line */}
              <Layer
                id={`${segment.id}-core`}
                type="line"
                paint={{
                  "line-color": color,
                  "line-width": isFlight ? 2 : 3,
                  "line-dasharray": isTrain ? [2, 2] : [1],
                  "line-opacity": isActive ? 1 : 0.4,
                }}
              />
            </Source>
          );
        })}

        {/* Animated Transport Icons */}
        {routeSegments.map((segment: any) => {
          const typeStr = (segment.transport?.type || '').toLowerCase();
          const isFlight = typeStr.includes('flight');
          const isTrain  = typeStr.includes('train');
          const isActive = (activeSegmentIndex - 1 === routeSegments.indexOf(segment));

          // ALL icons follow the animated progress dot!
          const pinProgress  = progress;
          const pinDistance  = segment.length * pinProgress;
          const currentPoint = along(feature(segment.geometry), pinDistance);

          // Compute bearing so icons face the correct direction along the route
          const lookAhead = along(feature(segment.geometry), Math.min(pinDistance + 10, segment.length));
          const brg = bearing(currentPoint, lookAhead);

          return (
            <Marker
              key={`${segment.id}-icon`}
              longitude={currentPoint.geometry.coordinates[0]}
              latitude={currentPoint.geometry.coordinates[1]}
              rotation={brg}
              anchor="center"
              style={{ zIndex: 50 }}
            >
              <div className="p-1.5 rounded-full shadow-lg backdrop-blur-md bg-white/90 border border-black/10">
                {isFlight && <Plane size={14} className="text-[var(--color-sunset-orange)] rotate-45" />}
                {isTrain  && <Train size={14} className="text-[#D4AF37]" />}
                {!isFlight && !isTrain && <Car size={14} className="text-amber-600" />}
              </div>
            </Marker>
          );
        })}

        {/* City Nodes — from real trip data */}
        {routeData.map((city: any, i: number) => (
          <Marker
            key={`${city.city}-${i}`}
            longitude={city.coordinates[0]}
            latitude={city.coordinates[1]}
            anchor="bottom"
          >
            <div className={`flex flex-col items-center transition-all duration-500 ${activeSegmentIndex === i ? 'scale-110' : 'scale-90 opacity-80'}`}>
              <div className="bg-[var(--color-deep-ocean)]/90 backdrop-blur-md text-white font-sans text-xs font-semibold px-2 py-1 rounded-sm border border-white/20 mb-1 shadow-xl">
                {city.city}
              </div>
              <div className="w-3 h-3 bg-white rounded-full border-[3px] border-[var(--color-deep-ocean)] shadow-md"></div>
            </div>
          </Marker>
        ))}
      </Map>

      {/* Floating Interactive Tooltip */}
      {hoveredSegment && (
        <div 
          className="fixed pointer-events-none z-50 transform -translate-x-1/2 -translate-y-[120%]"
          style={{ left: mousePos.x, top: mousePos.y }}
        >
          <div className="bg-white/90 backdrop-blur-md border border-white/40 shadow-2xl rounded-xl p-3 flex flex-col gap-1 min-w-[200px]">
            <div className="flex items-center gap-2 text-[var(--color-deep-ocean)]/70 text-[10px] font-bold uppercase tracking-wider">
              {(hoveredSegment.transport?.type || '').toLowerCase().includes('flight') && <Plane size={12} />}
              {(hoveredSegment.transport?.type || '').toLowerCase().includes('train') && <Train size={12} />}
              {!(hoveredSegment.transport?.type || '').toLowerCase().includes('flight') && !(hoveredSegment.transport?.type || '').toLowerCase().includes('train') && <Car size={12} />}
              <span>{hoveredSegment.transport?.type} • {hoveredSegment.transport?.duration}</span>
            </div>
            <div className="font-serif text-[var(--color-deep-ocean)] text-lg leading-tight">
              {hoveredSegment.originName} <span className="opacity-50">→</span> {hoveredSegment.destName}
            </div>
            <div className="text-xs font-sans text-[var(--color-deep-ocean)]/80 font-medium">
              {hoveredSegment.transport?.provider}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
