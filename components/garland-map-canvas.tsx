"use client";

import { useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";

export function GarlandMapCanvas({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);

  return (
    <>
      <div
        className={`garland-map-canvas relative overflow-hidden rounded-lg border${paused ? " garland-map-paused" : ""}`}
      >
        {children}
      </div>
      <div className="garland-motion-controls">
        <button
          type="button"
          className="garland-motion-toggle"
          aria-label="Анимация гирлянды"
          aria-pressed={!paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? (
            <Play size={16} aria-hidden="true" />
          ) : (
            <Pause size={16} aria-hidden="true" />
          )}
          {paused ? "Включить огоньки" : "Пауза"}
        </button>
      </div>
    </>
  );
}
