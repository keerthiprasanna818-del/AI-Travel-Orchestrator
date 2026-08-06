import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/project-client";
import { sendTestPriceAlertEmail } from "@/lib/price-alerts-email.functions";

/**
 * TEMPORARY verification control. Sends one sample price-drop email to the
 * signed-in user's own address. Delete this component and its usage on
 * /price-alerts once delivery has been verified.
 */
export function TestAlertEmailButton() {
  const send = useServerFn(sendTestPriceAlertEmail);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in again to run the email test.");
      const result = await send({ data: { accessToken: token } });
      setFailed(!result.ok);
      setMessage(
        result.ok
          ? `Test email sent to ${result.recipient}${result.id ? ` (id ${result.id})` : ""}.`
          : (result.error ?? "Test email failed."),
      );
    } catch (err) {
      setFailed(true);
      setMessage(err instanceof Error ? err.message : "Test email failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
        Send test price-drop email
      </button>
      {message ? (
        <span className={`text-xs ${failed ? "text-warning" : "text-muted-foreground"}`}>
          {message}
        </span>
      ) : null}
    </div>
  );
}
