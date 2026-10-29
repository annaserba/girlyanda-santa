"use client";
import { createContext, useContext, type ReactNode } from "react";

const HolidayThemeContext = createContext(false);

/** Context follows React portals; no body classes, effects or theme flash. */
export function HolidayThemeProvider({ children }: { children: ReactNode }) {
  return (
    <HolidayThemeContext.Provider value={true}>
      {children}
    </HolidayThemeContext.Provider>
  );
}

export function useHolidayPortalClass() {
  return useContext(HolidayThemeContext)
    ? "holiday-theme holiday-portal"
    : undefined;
}
