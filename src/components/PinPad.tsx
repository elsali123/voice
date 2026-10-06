"use client";

import { useEffect } from "react";

/** A large on-screen number pad for 4-digit PINs. Also works with the keyboard. */
export default function PinPad({
  value,
  onChange,
  disabled = false,
  label,
}: {
  value: string;
  onChange: (pin: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const press = (key: string) => {
    if (disabled) return;
    if (key === "back") onChange(value.slice(0, -1));
    else if (key === "clear") onChange("");
    else if (value.length < 4) onChange(value + key);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^\d$/.test(e.key) && value.length < 4) onChange(value + e.key);
      else if (e.key === "Backspace") onChange(value.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, onChange, disabled]);

  return (
    <div className="mx-auto w-full max-w-sm space-y-5">
      <div className="flex justify-center gap-3" role="status" aria-label={`${label}: ${value.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`grid size-16 place-items-center rounded-2xl border-4 text-4xl font-bold ${
              i < value.length ? "border-brand bg-brand-soft" : "border-line bg-card"
            }`}
          >
            {value[i] ?? ""}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"].map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            disabled={disabled}
            className={`h-20 rounded-2xl border-2 border-line bg-card font-bold shadow-sm hover:border-brand active:bg-brand-soft disabled:opacity-50 ${
              key.length > 1 ? "text-xl" : "text-4xl"
            }`}
          >
            {key === "back" ? "⌫ Back" : key === "clear" ? "Clear" : key}
          </button>
        ))}
      </div>
    </div>
  );
}
