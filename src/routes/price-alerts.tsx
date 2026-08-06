import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  BellRing,
  Calendar,
  Check,
  ExternalLink,
  History,
  Loader2,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import { Aurora, NavBar, SectionTitle, SiteFooter } from "@/components/site";
import { RequireAuth } from "@/components/require-auth";
import { TestAlertEmailButton } from "@/components/test-alert-email-button";

import { useAuth } from "@/lib/auth";
import {
  deleteAlert,
  listAlerts,
  listHistory,
  markAlertRead,
  setAlertStatus,
  updateAlertCondition,
} from "@/lib/price-alerts.data";
import {
  PRICE_DISCLAIMER,
  conditionLabel,
  money,
  priceChange,
  statusLabel,
  type AlertConditionType,
  type FlightPriceAlert,
  type FlightPriceHistoryRow,
} from "@/lib/price-alerts";
import { formatDate } from "@/lib/trip";
import { resolveBookingLink } from "@/lib/booking-links";

export const Route = createFileRoute("/price-alerts")({
  head: () => ({
    meta: [
      { title: "Flight Price Alerts — AI Travel Orchestrator" },
      {
        name: "description",
        content:
          "Track live flight fares and get alerted when the price drops for your saved routes and dates.",
      },
      { property: "og:title", content: "Flight Price Alerts — AI Travel Orchestrator" },
      {
        property: "og:description",
        content: "Background live-fare tracking with price history for your saved trips.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PriceAlertsRoute,
});

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`glass rounded-[22px] p-5 ${className}`}>{children}</div>;
}

function PriceAlertsRoute() {
  return (
    <RequireAuth>
      <PriceAlerts />
    </RequireAuth>
  );
}

function PriceAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<FlightPriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      setAlerts(await listAlerts(user.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your price alerts.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen">
      <Aurora />
      <NavBar />

      <main className="mx-auto max-w-5xl px-5 py-14 lg:px-8">
        <SectionTitle
          eyebrow="Fare Watch Agent"
          title="Price Alerts"
          subtitle="Live fares are re-checked in the background — you never need to keep a page open."
        />

        {/* TEMPORARY: email delivery verification — remove after testing. */}
        <TestAlertEmailButton />



        <div className="mt-12 space-y-4">
          {loading ? (
            <Card className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your alerts…
            </Card>
          ) : error ? (
            <Card className="text-sm text-warning">{error}</Card>
          ) : alerts.length === 0 ? (
            <Card className="glow-border mx-auto max-w-lg text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
                <BellRing className="h-7 w-7" />
              </span>
              <h2 className="mt-4 text-xl font-semibold">No price alerts yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Open a trip dashboard and use “Track Price” on any live flight result.
              </p>
              <Link
                to="/my-trips"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[image:var(--gradient-primary)] px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105"
              >
                Go to My Trips <ArrowRight className="h-4 w-4" />
              </Link>
            </Card>
          ) : (
            alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} onChanged={() => void load()} />
            ))
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">{PRICE_DISCLAIMER}</p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function AlertCard({ alert, onChanged }: { alert: FlightPriceAlert; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<FlightPriceHistoryRow[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState(false);
  const [condition, setCondition] = useState<AlertConditionType>(alert.condition_type);
  const [target, setTarget] = useState(String(alert.target_price ?? ""));
  const [percent, setPercent] = useState(String(alert.drop_percent ?? 10));
  const [email, setEmail] = useState(alert.email_enabled);

  const change = priceChange(alert.initial_price, alert.latest_price);
  const dropped = change.amount < 0;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const toggleHistory = async () => {
    setShowHistory((v) => !v);
    if (!history) setHistory(await listHistory(alert.id));
  };

  const maxPrice = Math.max(
    ...(history?.map((h) => h.checked_price) ?? [alert.initial_price]),
    alert.initial_price,
  );

  const bookingLink = resolveBookingLink("flight", {
    origin: alert.origin,
    destination: alert.destination,
    departureDate: alert.departure_date,
    returnDate: alert.return_date,
    adults: alert.adults,
    children: alert.children,
  });

  return (
    <Card className="glow-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">
            {alert.origin} → {alert.destination}
          </h3>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(alert.departure_date)}
            {alert.return_date ? ` – ${formatDate(alert.return_date)}` : ""} · {alert.adults} adult
            {alert.adults > 1 ? "s" : ""}
            {alert.children ? `, ${alert.children} children` : ""} · {alert.cabin_class}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {alert.in_app_unread ? (
            <button
              onClick={() => void run(() => markAlertRead(alert.id))}
              className="rounded-full border border-success/50 bg-success/12 px-2.5 py-0.5 text-[11px] font-medium text-success"
            >
              New price drop · mark read
            </button>
          ) : null}
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
              alert.status === "triggered"
                ? "border-success/50 bg-success/12 text-success"
                : alert.status === "active"
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-warning/50 bg-warning/12 text-warning"
            }`}
          >
            {statusLabel(alert.status)}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
        <Metric label="Initial price" value={money(alert.initial_price, alert.currency)} />
        <Metric label="Current price" value={money(alert.latest_price, alert.currency)} />
        <Metric label="Lowest seen" value={money(alert.lowest_price_seen, alert.currency)} />
        <Metric
          label="Condition"
          value={conditionLabel(alert)}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <span className={dropped ? "text-success" : "text-muted-foreground"}>
          {change.amount === 0
            ? "No change yet"
            : `${dropped ? "▼" : "▲"} ${money(Math.abs(change.amount), alert.currency)} (${Math.abs(
                change.percent,
              ).toFixed(1)}%)`}
        </span>
        <span className="text-muted-foreground">
          {alert.last_checked_at
            ? `Last checked ${new Date(alert.last_checked_at).toLocaleString("en-IN")}`
            : "Not checked yet"}
        </span>
        <span className="text-muted-foreground">
          Prices in {alert.currency.toUpperCase()} from our live booking provider
        </span>
        {alert.notification_status === "pending" ? (
          <span className="text-warning">Email pending — shown in-app for now</span>
        ) : null}
      </div>

      {alert.last_error ? (
        <p className="mt-2 text-[11px] text-warning">
          Last check issue: {alert.last_error} — tracking continues.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {alert.status === "paused" ? (
          <Action
            onClick={() => void run(() => setAlertStatus(alert.id, "active"))}
            disabled={busy}
            icon={<Play className="h-3.5 w-3.5" />}
            label="Resume"
          />
        ) : alert.status === "expired" ? null : (
          <Action
            onClick={() => void run(() => setAlertStatus(alert.id, "paused"))}
            disabled={busy}
            icon={<Pause className="h-3.5 w-3.5" />}
            label="Pause"
          />
        )}
        <Action
          onClick={() => setEditing((v) => !v)}
          icon={<Check className="h-3.5 w-3.5" />}
          label="Edit target"
        />
        <Action
          onClick={() => void toggleHistory()}
          icon={<History className="h-3.5 w-3.5" />}
          label={showHistory ? "Hide history" : "View price history"}
        />
        <a
          href={alert.status === "triggered" ? bookingLink.url : bookingLink.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface/70 px-3 py-2 text-xs font-medium transition-colors hover:border-primary/60"
        >
          <ExternalLink className="h-3.5 w-3.5" /> {bookingLink.label}
        </a>
        <Action
          onClick={() => void run(() => deleteAlert(alert.id))}
          disabled={busy}
          icon={<Trash2 className="h-3.5 w-3.5" />}
          label="Delete alert"
          danger
        />
      </div>

      {editing ? (
        <div className="mt-4 space-y-2 rounded-xl border border-border bg-surface/60 p-3">
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as AlertConditionType)}
            className="w-full rounded-xl border border-border bg-surface/70 px-3 py-2 text-sm"
          >
            <option value="any_drop">Any price drop</option>
            <option value="target_price">Below a target price</option>
            <option value="percent_drop">Percentage drop</option>
          </select>
          {condition === "target_price" ? (
            <input
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Target price"
              className="w-full rounded-xl border border-border bg-surface/70 px-3 py-2 text-sm"
            />
          ) : null}
          {condition === "percent_drop" ? (
            <input
              type="number"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="Percentage"
              className="w-full rounded-xl border border-border bg-surface/70 px-3 py-2 text-sm"
            />
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary"
              checked={email}
              onChange={(e) => setEmail(e.target.checked)}
            />
            Email me when triggered
          </label>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await updateAlertCondition(alert.id, {
                  conditionType: condition,
                  targetPrice: condition === "target_price" ? Number(target) || null : null,
                  dropPercent: condition === "percent_drop" ? Number(percent) || null : null,
                  emailEnabled: email,
                });
                setEditing(false);
              })
            }
            className="w-full rounded-xl bg-[image:var(--gradient-primary)] px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Save changes
          </button>
        </div>
      ) : null}

      {showHistory ? (
        <div className="mt-4 space-y-1.5 rounded-xl border border-border bg-surface/60 p-3">
          {history == null ? (
            <p className="text-xs text-muted-foreground">Loading history…</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No background checks recorded yet. The first check runs on the alert’s schedule.
            </p>
          ) : (
            history.map((row) => (
              <div key={row.id} className="flex items-center gap-3 text-[11px]">
                <span className="w-36 shrink-0 text-muted-foreground">
                  {new Date(row.checked_at).toLocaleString("en-IN")}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted/40">
                  <span
                    className="block h-full rounded-full bg-[image:var(--gradient-primary)]"
                    style={{
                      width: `${Math.max(6, (row.checked_price / (maxPrice || 1)) * 100)}%`,
                    }}
                  />
                </span>
                <span className="w-20 shrink-0 text-right font-medium">
                  {money(row.checked_price, row.currency)}
                </span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold">{value}</div>
    </div>
  );
}

function Action({
  onClick,
  icon,
  label,
  disabled,
  danger,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface/70 px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${
        danger ? "hover:border-destructive/60 hover:text-destructive" : "hover:border-primary/60"
      }`}
    >
      {icon} {label}
    </button>
  );
}
