import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Aurora, Logo } from "@/components/site";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In or Create Account — AI Travel Orchestrator" },
      {
        name: "description",
        content:
          "Sign in with Google to plan trips with the AI Travel Orchestrator agent team.",
      },
      { property: "og:title", content: "Sign In or Create Account — AI Travel Orchestrator" },
      {
        property: "og:description",
        content: "Secure Google sign-in for your AI travel planning workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Sign In or Create Account — AI Travel Orchestrator" },
      {
        name: "twitter:description",
        content: "Secure Google sign-in for your AI travel planning workspace.",
      },
    ],
  }),
  component: AuthRoute,
});

function AuthRoute() {
  const { user, loading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in — nothing to do here.
  useEffect(() => {
    if (!loading && user) void navigate({ to: "/", replace: true });
  }, [loading, user, navigate]);

  const google = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      // One flow for both sign in and sign up.
      await signInWithGoogle("/");
    } catch {
      setError("Could not start Google sign-in. Please try again.");
      setBusy(false);
    }
  }, [signInWithGoogle]);

  return (
    <div className="relative min-h-screen">
      <Aurora />
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-12">
        <div className="glass glow-border rounded-[26px] p-6 sm:p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <Logo />
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                Welcome to AI Travel Orchestrator
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Sign in or create your account in one tap to reach your trips, price alerts and AI
                itineraries.
              </p>
            </div>
          </div>

          <button
            onClick={() => void google()}
            disabled={busy}
            className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface/70 px-4 py-3 text-sm font-medium transition-all hover:border-primary/60 hover:shadow-[var(--shadow-glow)] disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.8 2.6 13.6l7.8 6c1.9-5.7 7.2-10.1 13.6-10.1z" />
                <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v8.4h12.5c-.3 2.1-1.6 5.2-4.7 7.3l7.6 5.9c4.5-4.2 6.7-10.3 6.7-17.5z" />
                <path fill="#FBBC05" d="M10.4 28.4a14.6 14.6 0 0 1 0-8.8l-7.8-6a24 24 0 0 0 0 20.8l7.8-6z" />
                <path fill="#34A853" d="M24 47.5c6.2 0 11.4-2 15.4-5.5l-7.6-5.9c-2 1.4-4.7 2.4-7.8 2.4-6.4 0-11.7-4.4-13.6-10.1l-7.8 6C6.5 42.2 14.6 47.5 24 47.5z" />
              </svg>
            )}
            Continue with Google
          </button>

          {error && (
            <p role="alert" className="mt-3 text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            more options soon
            <span className="h-px flex-1 bg-border" />
          </div>

          <p className="text-center text-xs text-muted-foreground">
            More sign-in methods such as Phone OTP are planned in a future release.
          </p>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
            By continuing you agree to our Terms of Service and acknowledge our Privacy Policy.
          </p>

          <div className="mt-5 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
