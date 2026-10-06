"use client";

import { useSyncExternalStore } from "react";

const SIZES = [
  { value: "m", label: "A", name: "Normal text" },
  { value: "l", label: "A+", name: "Large text" },
  { value: "xl", label: "A++", name: "Extra large text" },
];

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getSize = () => document.documentElement.dataset.size ?? "m";

function choose(value: string) {
  document.documentElement.dataset.size = value;
  try {
    localStorage.setItem("textSize", value);
  } catch {}
  listeners.forEach((fn) => fn());
}

export default function TextSizeSwitch() {
  const size = useSyncExternalStore(subscribe, getSize, () => "m");
  return (
    <div role="group" aria-label="Text size" className="flex items-center gap-1">
      <span className="mr-1 hidden text-base font-bold text-ink-soft md:inline">Text size</span>
      {SIZES.map((s, i) => (
        <button
          key={s.value}
          type="button"
          onClick={() => choose(s.value)}
          aria-pressed={size === s.value}
          aria-label={s.name}
          className={`min-w-12 rounded-xl border-2 px-2 py-1 font-bold ${
            size === s.value ? "border-brand bg-brand text-white" : "border-line bg-card text-ink hover:border-brand"
          }`}
          style={{ fontSize: `${0.9 + i * 0.2}rem` }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
