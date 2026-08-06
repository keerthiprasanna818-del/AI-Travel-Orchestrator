import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  BedDouble,
  BellRing,
  CalendarRange,
  CloudSun,
  Compass,
  LifeBuoy,
  PiggyBank,
  Plane,
  Sparkles,
  TrainFront,
  Loader2,
  LogOut,
  Luggage,
  type LucideIcon,
} from "lucide-react";

export const agentIcons: Record<string, LucideIcon> = {
  Compass,
  CloudSun,
  Plane,
  TrainFront,
  BedDouble,
  PiggyBank,
  CalendarRange,
  Sparkles,
  LifeBuoy,
};

export function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-primary/25 blur-[140px] animate-float" />
      <div className="absolute -right-32 top-40 h-[28rem] w-[28rem] rounded-full bg-secondary/20 blur-[150px] animate-float [animation-delay:1.5s]" />
      <div className="absolute bottom-0 left-1/3 h-[26rem] w-[26rem] rounded-full bg-primary/15 blur-[160px] animate-float [animation-delay:3s]" />
      <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(to_right,color-mix(in_oklab,var(--foreground)_20%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--foreground)_20%,transparent)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
    </div>
  );
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[image:var(--gradient-primary)] shadow-[var(--shadow-glow)]">
        <Compass className="h-5 w-5 text-primary-foreground" strokeWidth={2.2} />
      </span>
      <span className="font-display text-[15px] font-semibold tracking-tight">
        AI Travel <span className="text-gradient">Orchestrator</span>
      </span>
    </Link>
  );
}

const navItems = [
  { label: "Features", href: "/#features" },
  { label: "AI Agents", href: "/#agents" },
  { label: "How It Works", href: "/#how" },
  { label: "My Trips", href: "/my-trips" },
  { label: "Price Alerts", href: "/price-alerts" },
  { label: "Contact", href: "/#contact" },
];

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3.5 lg:px-8">
        <div className="flex min-w-0 items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-6 lg:flex">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
        <AccountMenu />
      </div>
    </header>
  );
}

function AccountMenu() {
  const { user, loading, displayName, avatarUrl, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (loading) {
    return (
      <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border bg-surface/70 px-4 py-2 text-sm font-medium text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading
      </div>
    );
  }

  if (!user) {
    return (
      <Link
        to="/auth"
        className="shrink-0 rounded-xl border border-border bg-surface/70 px-4 py-2 text-sm font-medium transition-all hover:border-primary/60 hover:shadow-[var(--shadow-glow)]"
      >
        Sign In
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-border bg-surface/70 px-2.5 py-1.5 text-sm font-medium transition-all hover:border-primary/60 hover:shadow-[var(--shadow-glow)]"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            referrerPolicy="no-referrer"
            className="h-7 w-7 rounded-full object-cover"
          />
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[image:var(--gradient-primary)] text-xs font-semibold text-primary-foreground">
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="hidden max-w-[9rem] truncate sm:block">{displayName}</span>
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-surface/95 p-1.5 backdrop-blur-xl">
          <p className="truncate px-3 py-2 text-xs text-muted-foreground">{user.email}</p>
          <Link
            to="/my-trips"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <Luggage className="h-4 w-4" /> My Trips
          </Link>
          <Link
            to="/price-alerts"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <BellRing className="h-4 w-4" /> Price Alerts
          </Link>
          <button
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer id="contact" className="border-t border-border/60 py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <Logo />
        <p>Multi-agent travel intelligence · hello@aitravelorchestrator.ai</p>
      </div>
    </footer>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-secondary">
        {eyebrow}
      </span>
      <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">{title}</h2>
      {subtitle ? <p className="mt-3 text-base text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}