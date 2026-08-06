import { useState } from "react";
import { BellRing, Loader2, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { createAlert } from "@/lib/price-alerts.data";
import {
  PRICE_DISCLAIMER,
  money,
  type AlertConditionType,
} from "@/lib/price-alerts";
import { formatDate } from "@/lib/trip";
import type { TripParams } from "@/lib/booking-links";

type Props = {
  open: boolean;
  onClose: () => void;
  travelPlanId: string;
  trip: TripParams;
  cabinClass: string;
  currency: string;
  currentPrice: number;
  lastUpdated: string | null;
};

const PERCENTS = [5, 10, 15, 20] as const;

/** Compact "Track Price" dialog for a live flight fare. */
export function TrackPriceDialog({
  open,
  onClose,
  travelPlanId,
  trip,
  cabinClass,
  currency,
  currentPrice,
  lastUpdated,
}: Props) {
  const { user, signInWithGoogle } = useAuth();
  const [condition, setCondition] = useState<AlertConditionType>("any_drop");
  const [target, setTarget] = useState(String(Math.max(1, Math.round(currentPrice * 0.9))));
  const [percent, setPercent] = useState<number>(10);
  const [email, setEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!open) return null;

  const save = async () => {
    if (!user?.id) {
      void signInWithGoogle(window.location.pathname);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createAlert({
        userId: user.id,
        travelPlanId: travelPlanId || null,
        origin: trip.origin ?? "",
        destination: trip.destination ?? "",
        departureDate: (trip.departureDate ?? "").slice(0, 10),
        returnDate: trip.returnDate ? trip.returnDate.slice(0, 10) : null,
        adults: trip.adults ?? 1,
        children: trip.children ?? 0,
        cabinClass: cabinClass || "economy",
        currency: currency || "INR",
        conditionType: condition,
        targetPrice: condition === "target_price" ? Number(target) || null : null,
        dropPercent: condition === "percent_drop" ? percent : null,
        currentPrice,
        emailEnabled: email,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this price alert.");
    } finally {
      setSaving(false);
    }
  };

  const Option = ({ value, label }: { value: AlertConditionType; label: string }) => (
    <label
      className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
        condition === value ? "border-primary/60 bg-primary/10" : "border-border bg-surface/60"
      }`}
    >
      <input
        type="radio"
        name="price-alert-condition"
        className="accent-primary"
        checked={condition === value}
        onChange={() => setCondition(value)}
      />
      {label}
    </label>
  );

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="glass glow-border w-full max-w-md rounded-[22px] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary">
              <BellRing className="h-4.5 w-4.5" />
            </span>
            <div>
              <h3 className="text-base font-semibold">Track this fare</h3>
              <p className="text-[11px] text-muted-foreground">
                We check live prices in the background — no need to keep this page open.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-surface/60 p-3 text-sm">
          <div className="font-medium">
            {trip.origin || "Origin"} → {trip.destination || "Destination"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {trip.departureDate ? formatDate(trip.departureDate) : ""}
            {trip.returnDate ? ` – ${formatDate(trip.returnDate)}` : ""} ·{" "}
            {trip.adults ?? 1} adult{(trip.adults ?? 1) > 1 ? "s" : ""}
            {trip.children ? `, ${trip.children} children` : ""} · {cabinClass || "economy"}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-lg font-semibold">{money(currentPrice, currency)}</span>
            <span className="text-[11px] text-muted-foreground">
              live provider fare
              {lastUpdated ? ` · updated ${new Date(lastUpdated).toLocaleString("en-IN")}` : ""}
            </span>
          </div>
        </div>

        {done ? (
          <div className="mt-4 space-y-4">
            <p className="rounded-xl border border-success/50 bg-success/10 p-3 text-sm text-success">
              Price alert saved. You can manage it under Price Alerts.
            </p>
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-[image:var(--gradient-primary)] px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-2">
              <Option value="any_drop" label="Alert me when the fare drops by any amount" />
              <Option value="target_price" label="Alert me below a target price" />
              {condition === "target_price" ? (
                <input
                  type="number"
                  min={1}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-primary/60"
                  placeholder="Target price"
                />
              ) : null}
              <Option value="percent_drop" label="Alert me on a percentage drop" />
              {condition === "percent_drop" ? (
                <div className="flex flex-wrap gap-2">
                  {PERCENTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPercent(p)}
                      className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                        percent === p
                          ? "border-primary/60 bg-primary/15"
                          : "border-border bg-surface/60 text-muted-foreground"
                      }`}
                    >
                      {p}% or more
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <label className="mt-4 flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                className="accent-primary"
                checked={email}
                onChange={(e) => setEmail(e.target.checked)}
              />
              Email me when this alert triggers
            </label>

            {error ? (
              <p className="mt-3 rounded-xl border border-warning/50 bg-warning/10 p-3 text-xs text-warning">
                {error}
              </p>
            ) : null}

            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              {PRICE_DISCLAIMER}
            </p>

            <div className="mt-4 flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-border bg-surface/70 px-4 py-2.5 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[image:var(--gradient-primary)] px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {user ? "Track price" : "Sign in to track"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
