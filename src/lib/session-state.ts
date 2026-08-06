/**
 * Browser-only, user-specific state that must never survive a sign-out or a
 * fresh sign-in. Database rows are never touched here.
 */
import { clearRecentPlans } from "./recent-plans";
import { clearTrip } from "./trip";

const PLAN_ID_KEY = "travelPlanId";
const RETURN_KEY = "authReturnPath";
const PENDING_SUBMIT_KEY = "authPendingSubmit";

/**
 * Single reusable reset for the travel form and every trace of it in browser
 * storage (cached draft, selected locations/preferences, plan id, route
 * intent). Saved trips in the database are never touched.
 */
export function resetTravelForm() {
  if (typeof window === "undefined") return;
  try {
    clearTrip();
    window.sessionStorage.removeItem(PLAN_ID_KEY);
    window.sessionStorage.removeItem(RETURN_KEY);
    window.sessionStorage.removeItem(PENDING_SUBMIT_KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/** Full sign-out reset: blank form plus the local trip history cache. */
export function resetOnSignOut() {
  resetTravelForm();
  try {
    clearRecentPlans();
  } catch {
    /* storage unavailable */
  }
}

/** Clears navigation/trip state but keeps the Supabase session itself. */
export function clearTravelSessionState(options?: { keepForm?: boolean }) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PLAN_ID_KEY);
    window.sessionStorage.removeItem(RETURN_KEY);
    if (!options?.keepForm) {
      window.sessionStorage.removeItem(PENDING_SUBMIT_KEY);
      resetTravelForm();
    }
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/** True when the user submitted the form and was sent through Google sign-in. */
export function consumePendingSubmit(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const flag = window.sessionStorage.getItem(PENDING_SUBMIT_KEY);
    window.sessionStorage.removeItem(PENDING_SUBMIT_KEY);
    return flag === "1";
  } catch {
    return false;
  }
}

/** True while an OAuth round-trip for a completed form is in flight. */
export function hasPendingSubmit(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(PENDING_SUBMIT_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPendingSubmit() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_SUBMIT_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Set right after OAuth returns so the homepage may restore the draft once. */
const RESTORE_ONCE_KEY = "authRestoreFormOnce";

export function markRestoreFormOnce() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(RESTORE_ONCE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function consumeRestoreFormOnce(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const flag = window.sessionStorage.getItem(RESTORE_ONCE_KEY);
    window.sessionStorage.removeItem(RESTORE_ONCE_KEY);
    return flag === "1";
  } catch {
    return false;
  }
}
