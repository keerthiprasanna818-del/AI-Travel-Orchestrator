import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, MapPin, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { searchLocations } from "@/lib/locations.functions";
import {
  locationSecondaryLine,
  type LocationFieldType,
  type LocationSuggestion,
  type LocationTravelType,
} from "@/lib/location";

/** Temporary in-memory cache of recent searches (per session). */
const cache = new Map<string, LocationSuggestion[]>();

/** Highlights the matched portion of a suggestion label. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-transparent font-semibold text-primary">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function LocationAutocomplete({
  value,
  onChange,
  onSelectLocation,
  placeholder,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelectLocation?: (location: LocationSuggestion | null) => void;
  placeholder?: string;
  /** Accepted for context only — search is always worldwide. */
  travelType?: LocationTravelType;
  fieldType?: LocationFieldType;
  id?: string;
}) {
  const search = useServerFn(searchLocations);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<LocationSuggestion[]>([]);
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQuery(value), [value]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const run = useCallback(
    async (q: string, signal: { cancelled: boolean }) => {
      const key = q.toLowerCase();
      const cached = cache.get(key);
      if (cached) {
        setResults(cached);
        setError(null);
        setLoading(false);
        return;
      }
      try {
        const res = await search({ data: { query: q } });
        if (signal.cancelled) return;
        if (res.ok) {
          cache.set(key, res.results);
          setResults(res.results);
          setError(null);
        } else {
          setResults([]);
          setError(res.error);
        }
      } catch {
        if (signal.cancelled) return;
        setResults([]);
        setError("Location search failed. Please try again.");
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    },
    [search],
  );

  useEffect(() => {
    const q = query.trim();
    if (!touched || q.length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    const signal = { cancelled: false };
    setLoading(true);
    const timer = setTimeout(() => void run(q, signal), 300);
    return () => {
      signal.cancelled = true;
      clearTimeout(timer);
    };
  }, [query, touched, run]);

  const suggestions = useMemo(() => results.slice(0, 10), [results]);
  const showPanel = open && touched && query.trim().length >= 2;

  const select = (s: LocationSuggestion) => {
    onChange(s.displayName);
    onSelectLocation?.(s);
    setQuery(s.displayName);
    setOpen(false);
    setTouched(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showPanel) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      const s = suggestions[active];
      if (s) {
        e.preventDefault();
        select(s);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <input
        id={id}
        autoComplete="off"
        className="w-full rounded-xl border border-input bg-background/60 px-3.5 py-2.5 pr-9 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/70 focus:border-primary/70 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_22%,transparent)]"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setTouched(true);
          setOpen(true);
          setActive(0);
          onChange(e.target.value);
          onSelectLocation?.(null);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showPanel}
        aria-autocomplete="list"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      </span>
      {!loading && query ? (
        <button
          type="button"
          aria-label="Clear location"
          onClick={() => {
            onChange("");
            onSelectLocation?.(null);
            setQuery("");
            setResults([]);
            setError(null);
            setTouched(false);
            setOpen(false);
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {showPanel ? (
        <ul
          role="listbox"
          className="glass absolute z-40 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-border p-1 shadow-[var(--shadow-glow)]"
        >
          {loading && suggestions.length === 0 ? (
            <li className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching locations…
            </li>
          ) : error ? (
            <li className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 text-destructive" /> {error}
            </li>
          ) : suggestions.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground">No locations found</li>
          ) : (
            suggestions.map((s, i) => (
              <li key={s.geonameId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => select(s)}
                  className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                    i === active ? "bg-primary/15 text-foreground" : "text-foreground/90 hover:bg-primary/10"
                  }`}
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      <Highlight text={s.name} query={query} />
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {locationSecondaryLine(s)}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
