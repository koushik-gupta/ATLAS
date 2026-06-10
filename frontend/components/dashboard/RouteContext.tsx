"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

interface RouteContextType {
  activeSegmentIndex: number;
  setActiveSegmentIndex: (index: number) => void;
}

const RouteContext = createContext<RouteContextType | undefined>(undefined);

export function RouteProvider({ children }: { children: ReactNode }) {
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);

  return (
    <RouteContext.Provider value={{ activeSegmentIndex, setActiveSegmentIndex }}>
      {children}
    </RouteContext.Provider>
  );
}

export function useRouteContext() {
  const context = useContext(RouteContext);
  if (!context) {
    throw new Error("useRouteContext must be used within a RouteProvider");
  }
  return context;
}
