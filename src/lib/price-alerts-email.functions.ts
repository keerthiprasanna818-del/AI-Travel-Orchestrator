import { createServerFn } from "@tanstack/react-start";

/**
 * TEMPORARY verification action — `send-test-price-alert-email`.
 *
 * Sends one sample price-drop email to the currently signed-in user. The access
 * token is verified server-side and the recipient address is read from Supabase
 * Auth, never from client input. Remove this file (and its button on
 * /price-alerts) once email delivery has been verified.
 */
export const sendTestPriceAlertEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const token = (input as { accessToken?: unknown } | null)?.accessToken;
    if (typeof token !== "string" || token.length < 20 || token.length > 4000) {
      throw new Error("A valid session is required");
    }
    return { accessToken: token };
  })
  .handler(
    async ({
      data,
    }): Promise<{ ok: boolean; recipient?: string; id?: string | null; error?: string }> => {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const { SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY } = await import(
          "@/integrations/supabase/project-client"
        );
        const auth = createClient(SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: userError } = await auth.auth.getUser(data.accessToken);
        const email = userData?.user?.email;
        if (userError || !email) {
          return { ok: false, error: "Please sign in again to run the email test." };
        }

        const { buildAlertEmail } = await import("./price-alerts-email.server");
        const { resendConfigured, sendResendEmail } = await import("./resend.server");
        if (!resendConfigured()) {
          return { ok: false, error: "RESEND_API_KEY is not configured on the backend yet." };
        }

        const now = new Date();
        const depart = new Date(now.getTime() + 21 * 86400000).toISOString().slice(0, 10);
        const back = new Date(now.getTime() + 28 * 86400000).toISOString().slice(0, 10);
        const { subject, html, text } = buildAlertEmail({
          origin: "DEL",
          destination: "GOI",
          departureDate: depart,
          returnDate: back,
          oldPrice: 8400,
          newPrice: 6720,
          savings: 1680,
          percentDrop: 20,
          currency: "INR",
          lastCheckedAt: now.toISOString(),
          providerLink: "https://www.google.com/travel/flights",
        });

        const result = await sendResendEmail({
          to: email,
          subject: `[Test] ${subject}`,
          html,
          text,
        });
        return { ok: true, recipient: email, id: result.id };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Test email failed";
        console.error("SEND TEST PRICE ALERT EMAIL ERROR", message);
        return { ok: false, error: message };
      }
    },
  );
