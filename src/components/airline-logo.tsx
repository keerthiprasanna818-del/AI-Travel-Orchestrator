import { useEffect, useState } from "react";
import type { AirlineInfo } from "@/lib/airlines";

type Props = {
  airline: AirlineInfo | null;
  /** Raw flight code, used to derive the fallback IATA text. */
  code?: string | null;
  className?: string;
};

/**
 * Renders the local airline logo inside the shared circular container.
 * Falls back to a clean IATA-code circle only when there is no logo mapping or
 * the image fails to load. Reused by every flight result, everywhere.
 */
export function AirlineLogo({ airline, code, className }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [airline?.logo]);

  const iata =
    airline?.iata ?? (code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2) ?? "";

  if (airline && !failed) {
    return (
      <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 p-1">
        <img
          src={airline.logo}
          alt={`${airline.name} logo`}
          loading="lazy"
          decoding="async"
          width={56}
          height={56}
          onError={() => setFailed(true)}
          className={className ?? "h-14 w-14 max-h-14 max-w-14 object-contain object-center"}
        />
      </span>
    );
  }

  return (
    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary/15 text-base font-bold text-primary">
      {iata || "--"}
    </span>
  );
}
