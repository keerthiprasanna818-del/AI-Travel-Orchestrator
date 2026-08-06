import { AirlineLogo } from "@/components/airline-logo";
import { resolveFlightIdentity } from "@/lib/airlines";

type Props = {
  airline?: string | null;
  code?: string | null;
  stops?: string | null;
};

/**
 * Shared airline identity block used by every flight result (all destinations,
 * domestic and international). Vertical hierarchy:
 *   Airline Name  →  Flight 6E 543 / AI 608 → AI 812  →  Non-stop / 1 Stop via BOM
 */
export function AirlineIdentity({ airline, code, stops }: Props) {
  const id = resolveFlightIdentity(airline, code, stops);
  const name = airline?.trim() || id.airline?.name || "Airline";

  return (
    <div className="flex min-w-0 items-center gap-3">
      <AirlineLogo airline={id.airline} code={code ?? null} />
      <div className="min-w-0 space-y-0.5">
        <div className="truncate whitespace-nowrap text-sm font-semibold leading-tight sm:text-base">{name}</div>
        <div className="whitespace-nowrap text-xs font-medium leading-tight text-muted-foreground">
          {id.valid ? `Flight ${id.flightLabel}` : "Estimated option"}
        </div>
        <div className="whitespace-nowrap text-[11px] leading-tight text-muted-foreground/70">{id.stopsLabel}</div>
      </div>
    </div>
  );
}
