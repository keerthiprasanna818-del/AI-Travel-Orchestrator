import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/project-client";
import {
  clearTravelSessionState,
  consumePendingSubmit,
  markRestoreFormOnce,
  resetOnSignOut,
  resetTravelForm,
} from "@/lib/session-state";

type AuthValue = {
  user: User | null;
  session: Session | null;
  /** True while the initial session check is in flight. */
  loading: boolean;
  displayName: string;
  avatarUrl: string | null;
  signInWithGoogle: (returnPath?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function goHome() {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/" || window.location.search) {
    window.location.replace("/");
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const hadSession = useRef(false);

  useEffect(() => {
    let active = true;

    // Register the listener first so no auth event is missed.
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      setSession(next);
      setLoading(false);

      if (event === "SIGNED_OUT") {
        hadSession.current = false;
        // Only browser/session state is cleared — database trips stay intact.
        resetOnSignOut();
        goHome();
        return;
      }

      if (event === "SIGNED_IN" && next && !hadSession.current) {
        hadSession.current = true;
        // A fresh login always lands on a clean, blank homepage form. Values are
        // kept only for the immediate OAuth round-trip of a completed form.
        const keepForm = consumePendingSubmit();
        if (keepForm) {
          markRestoreFormOnce();
          clearTravelSessionState({ keepForm: true });
        } else {
          resetTravelForm();
        }
        goHome();
        return;
      }


      if (next) hadSession.current = true;
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) hadSession.current = true;
      setSession(data.session ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async (_returnPath?: string) => {
    // Never restore a previous route: OAuth always returns to the homepage.

    // Never let Google render inside an iframe: get the URL, then drive the
    // top-level browser window to it.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: { prompt: "select_account" },
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (!data?.url) throw new Error("Could not start Google sign-in");

    try {
      if (window.top) window.top.location.href = data.url;
      else window.location.href = data.url;
    } catch {
      // Cross-origin top frame: break out with a full-page navigation.
      window.open(data.url, "_top", "noopener,noreferrer");
    }
  }, []);

  const signOut = useCallback(async () => {
    resetOnSignOut();
    await supabase.auth.signOut();
    setSession(null);
    hadSession.current = false;
    goHome();
  }, []);

  const user = session?.user ?? null;
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;

  const value = useMemo<AuthValue>(
    () => ({
      user,
      session,
      loading,
      displayName:
        (typeof meta['full_name'] === "string" && meta['full_name']) ||
        (typeof meta['name'] === "string" && meta['name']) ||
        user?.email?.split("@")[0] ||
        "Traveller",
      avatarUrl:
        (typeof meta['avatar_url'] === "string" && meta['avatar_url']) ||
        (typeof meta['picture'] === "string" && meta['picture']) ||
        null,
      signInWithGoogle,
      signOut,
    }),
    [user, session, loading, signInWithGoogle, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
