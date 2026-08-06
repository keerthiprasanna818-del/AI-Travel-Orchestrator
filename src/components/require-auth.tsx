import { Loader2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Aurora, NavBar, SiteFooter } from "@/components/site";
import { clearTravelSessionState } from "@/lib/session-state";

/**
 * Shared auth gate. While the session is being checked it shows a loading
 * state; with no session it clears user-specific browser state and sends the
 * user to the branded /auth page.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const kicked = useRef(false);

  useEffect(() => {
    if (loading || user || kicked.current) return;
    kicked.current = true;
    clearTravelSessionState();
    void navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  if (!user) {
    return (
      <div className="min-h-screen">
        <Aurora />
        <NavBar />
        <div className="grid min-h-[60vh] place-items-center">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            {loading ? "Checking your session…" : "Redirecting you to sign in…"}
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return <>{children}</>;
}
