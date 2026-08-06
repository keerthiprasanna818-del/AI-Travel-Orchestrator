/**
 * DISABLED FEATURE MODULE — Phone / SMS OTP authentication.
 *
 * Phone OTP sign-in was removed from the UI. Nothing in the app imports this
 * module today; it is preserved so the flow can be re-enabled later without
 * rebuilding it from scratch.
 *
 * To re-enable:
 *  1. Enable the Phone provider (and an SMS sender) in the backend auth settings.
 *  2. Render a phone + OTP form on `src/routes/auth.tsx`.
 *  3. Call `sendPhoneOtp()` then `verifyPhoneOtp()` from that form.
 *  4. Consider enabling CAPTCHA and server-side rate limits before shipping.
 */

import { supabase } from "@/integrations/supabase/project-client";

export const PHONE_AUTH_ENABLED = false;

export type PhoneAuthMode = "login" | "signup";

/** Country dial codes for a future OTP selector. */
export const PHONE_COUNTRIES: { code: string; dial: string; name: string }[] = [
  { code: "IN", dial: "+91", name: "India" },
  { code: "US", dial: "+1", name: "United States" },
  { code: "CA", dial: "+1", name: "Canada" },
  { code: "GB", dial: "+44", name: "United Kingdom" },
  { code: "AE", dial: "+971", name: "United Arab Emirates" },
  { code: "SA", dial: "+966", name: "Saudi Arabia" },
  { code: "SG", dial: "+65", name: "Singapore" },
  { code: "MY", dial: "+60", name: "Malaysia" },
  { code: "TH", dial: "+66", name: "Thailand" },
  { code: "ID", dial: "+62", name: "Indonesia" },
  { code: "AU", dial: "+61", name: "Australia" },
  { code: "NZ", dial: "+64", name: "New Zealand" },
  { code: "JP", dial: "+81", name: "Japan" },
  { code: "KR", dial: "+82", name: "South Korea" },
  { code: "CN", dial: "+86", name: "China" },
  { code: "HK", dial: "+852", name: "Hong Kong" },
  { code: "LK", dial: "+94", name: "Sri Lanka" },
  { code: "NP", dial: "+977", name: "Nepal" },
  { code: "BD", dial: "+880", name: "Bangladesh" },
  { code: "PK", dial: "+92", name: "Pakistan" },
  { code: "QA", dial: "+974", name: "Qatar" },
  { code: "OM", dial: "+968", name: "Oman" },
  { code: "KW", dial: "+965", name: "Kuwait" },
  { code: "BH", dial: "+973", name: "Bahrain" },
  { code: "DE", dial: "+49", name: "Germany" },
  { code: "FR", dial: "+33", name: "France" },
  { code: "IT", dial: "+39", name: "Italy" },
  { code: "ES", dial: "+34", name: "Spain" },
  { code: "NL", dial: "+31", name: "Netherlands" },
  { code: "CH", dial: "+41", name: "Switzerland" },
  { code: "SE", dial: "+46", name: "Sweden" },
  { code: "NO", dial: "+47", name: "Norway" },
  { code: "IE", dial: "+353", name: "Ireland" },
  { code: "PT", dial: "+351", name: "Portugal" },
  { code: "TR", dial: "+90", name: "Türkiye" },
  { code: "ZA", dial: "+27", name: "South Africa" },
  { code: "EG", dial: "+20", name: "Egypt" },
  { code: "KE", dial: "+254", name: "Kenya" },
  { code: "NG", dial: "+234", name: "Nigeria" },
  { code: "BR", dial: "+55", name: "Brazil" },
  { code: "MX", dial: "+52", name: "Mexico" },
  { code: "AR", dial: "+54", name: "Argentina" },
  { code: "RU", dial: "+7", name: "Russia" },
  { code: "MV", dial: "+960", name: "Maldives" },
  { code: "MU", dial: "+230", name: "Mauritius" },
  { code: "VN", dial: "+84", name: "Vietnam" },
  { code: "PH", dial: "+63", name: "Philippines" },
];

/** Locale-based default dial code: +91 for India, otherwise best-effort. */
export function defaultDial(): string {
  if (typeof navigator === "undefined") return "+91";
  const region = (navigator.language.split("-")[1] ?? "").toUpperCase();
  return PHONE_COUNTRIES.find((c) => c.code === region)?.dial ?? "+91";
}

/** Client-side rate limiting for OTP requests (per phone number). */
export const OTP_WINDOW_MS = 15 * 60 * 1000;
export const OTP_MAX_PER_WINDOW = 5;
export const RESEND_SECONDS = 60;

export function otpQuotaExceeded(phone: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const key = `otpRequests:${phone}`;
    const now = Date.now();
    const list: number[] = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    const recent = list.filter((t) => now - t < OTP_WINDOW_MS);
    if (recent.length >= OTP_MAX_PER_WINDOW) {
      window.localStorage.setItem(key, JSON.stringify(recent));
      return true;
    }
    recent.push(now);
    window.localStorage.setItem(key, JSON.stringify(recent));
    return false;
  } catch {
    return false;
  }
}

/** Normalize a dial code + local number into E.164. */
export function toE164(dial: string, phone: string): string {
  return `${dial}${phone.replace(/\D/g, "")}`;
}

export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

/** Map provider errors to copy that is safe to show a user. */
export function friendlyOtpError(message: string, mode: PhoneAuthMode): string {
  const m = message.toLowerCase();
  if (m.includes("signups not allowed") || m.includes("not found") || m.includes("user not found")) {
    return mode === "login"
      ? "This mobile number isn't registered yet. Switch to Sign Up to create your account."
      : "Could not create an account for this number. Please try again.";
  }
  if (m.includes("invalid") && m.includes("phone")) return "That phone number doesn't look valid.";
  if (m.includes("expired")) return "That code has expired. Request a new OTP.";
  if (m.includes("token") || m.includes("otp")) return "That code is incorrect. Please check and retry.";
  if (m.includes("rate") || m.includes("too many") || m.includes("429"))
    return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("provider") || m.includes("sms") || m.includes("unsupported"))
    return "SMS sign-in isn't available right now. Please continue with Google.";
  if (m.includes("captcha")) return "Verification failed. Please reload the page and try again.";
  return message;
}

/** Send a 6-digit SMS OTP to an E.164 phone number. */
export async function sendPhoneOtp(e164: string, mode: PhoneAuthMode) {
  return supabase.auth.signInWithOtp({
    phone: e164,
    options: { shouldCreateUser: mode === "signup" },
  });
}

/** Verify a 6-digit SMS OTP and establish a session. */
export async function verifyPhoneOtp(e164: string, token: string) {
  return supabase.auth.verifyOtp({ phone: e164, token, type: "sms" });
}
