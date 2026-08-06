import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  DISPLAY_PLACEHOLDER,
  displayToIso,
  isoToDisplay,
  localToIso,
  maskDisplayInput,
} from "@/lib/date-input";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function monthMatrix(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  // Monday-first offset.
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export type DateFieldProps = {
  /** ISO `yyyy-mm-dd` (or empty). */
  value: string;
  /** Receives ISO `yyyy-mm-dd`, or "" when cleared. */
  onChange: (iso: string) => void;
  /** Inclusive lower bound, ISO. */
  min?: string | undefined;
  className?: string | undefined;
  id?: string | undefined;
  ariaLabel: string;
  /** Validation text rendered under the field. */
  error?: string | null | undefined;
};

/**
 * Date input that supports manual typing (`dd-mm-yyyy`), an interactive
 * calendar icon and a click-anywhere-in-the-field picker, on desktop, touch and
 * keyboard. Values are always emitted in ISO `yyyy-mm-dd`.
 */
export function DateField({
  value,
  onChange,
  min,
  className = "",
  id,
  ariaLabel,
  error,
}: DateFieldProps) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const [open, setOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the visible text in sync when the value changes from outside
  // (reset, auto-correction of an invalid return date, restored draft).
  useEffect(() => {
    setText(isoToDisplay(value));
    if (value) setLocalError(null);
  }, [value]);

  const [view, setView] = useState(() => {
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  useEffect(() => {
    if (!open) return;
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    setView({ year: base.getFullYear(), month: base.getMonth() });
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const cells = useMemo(() => monthMatrix(view.year, view.month), [view]);

  const commit = (raw: string) => {
    if (!raw.trim()) {
      setLocalError(null);
      onChange("");
      return;
    }
    const iso = displayToIso(raw);
    if (!iso) {
      setLocalError(`Enter a valid date as ${DISPLAY_PLACEHOLDER}.`);
      return;
    }
    if (min && iso < min) {
      setLocalError("That date is not available. Please pick a later date.");
      return;
    }
    setLocalError(null);
    onChange(iso);
  };

  const pick = (date: Date) => {
    const iso = localToIso(date);
    if (min && iso < min) return;
    setLocalError(null);
    onChange(iso);
    setOpen(false);
    inputRef.current?.focus();
  };

  const message = error ?? localError;

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={`flex items-center gap-2 rounded-xl border border-input bg-background/60 px-3.5 py-2.5 transition-all focus-within:border-primary/70 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_22%,transparent)] ${className}`}
        onClick={() => setOpen(true)}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={ariaLabel}
          aria-invalid={message ? true : undefined}
          placeholder={DISPLAY_PLACEHOLDER}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
          value={text}
          onChange={(e) => {
            const masked = maskDisplayInput(e.target.value);
            setText(masked);
            if (masked.length === 10) commit(masked);
            else if (masked.length === 0) commit("");
          }}
          onBlur={() => commit(text)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(text);
              setOpen(false);
            }
            if (e.key === "Escape") setOpen(false);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        />
        <button
          type="button"
          aria-label={`Open calendar for ${ariaLabel}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-primary"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
      </div>

      {message ? (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {message}
        </p>
      ) : null}

      {open ? (
        <div
          role="dialog"
          aria-label={`${ariaLabel} calendar`}
          className="glass absolute left-0 top-[calc(100%+6px)] z-50 w-[276px] rounded-2xl border border-border p-3 shadow-[var(--shadow-glow)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setView(({ year, month }) =>
                  month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
                )
              }
              className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground hover:text-primary"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">
              {MONTHS[view.month]} {view.year}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setView(({ year, month }) =>
                  month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
                )
              }
              className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground hover:text-primary"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((date, i) => {
              if (!date) return <span key={`e${i}`} />;
              const iso = localToIso(date);
              const disabled = Boolean(min && iso < min);
              const selected = iso === value;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  aria-label={iso}
                  aria-pressed={selected}
                  onClick={() => pick(date)}
                  className={`h-8 rounded-lg text-xs tabular-nums transition-colors ${
                    selected
                      ? "bg-[image:var(--gradient-primary)] font-semibold text-primary-foreground"
                      : disabled
                        ? "cursor-not-allowed text-muted-foreground/40"
                        : "text-foreground hover:bg-primary/15"
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
