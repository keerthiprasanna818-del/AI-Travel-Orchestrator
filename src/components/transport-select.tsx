import type { KeyboardEvent } from "react";

/**
 * Single-select transport chooser. One controlled value, one handler — the whole
 * option container (label + icon) is the click target and selection happens on
 * the first click, with Enter/Space support.
 */
export function TransportSelect({
  options,
  value,
  onChange,
  name = "transport",
}: {
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
  name?: string;
}) {
  const activate = (option: string) => {
    if (option !== value) onChange(option);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, option: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate(option);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Transportation preference"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {options.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            name={name}
            aria-checked={selected}
            data-selected={selected ? "true" : "false"}
            tabIndex={selected || (!value && option === options[0]) ? 0 : -1}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              activate(option);
            }}
            onKeyDown={(e) => onKey(e, option)}
            className={`rounded-xl border px-2 py-2.5 text-sm font-medium transition-all ${
              selected
                ? "border-primary/70 bg-primary/15 text-foreground shadow-[var(--shadow-glow)]"
                : "border-border bg-background/40 text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            <span className="pointer-events-none">{option}</span>
          </button>
        );
      })}
    </div>
  );
}
