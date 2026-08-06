/**
 * Server-only Resend transport.
 *
 * The Resend API key is read from the backend secret `RESEND_API_KEY` inside
 * this module only — it is never imported by client code and never logged.
 */

export const RESEND_FROM = "AI Travel Orchestrator <onboarding@resend.dev>";

export type ResendSendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export type ResendSendResult = {
  id: string | null;
  status: number;
};

export class ResendError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ResendError";
    this.status = status;
    this.retryable = status === 429 || status >= 500;
  }
}

export function resendConfigured(): boolean {
  return Boolean(process.env["RESEND_API_KEY"]);
}

export async function sendResendEmail(input: ResendSendInput): Promise<ResendSendResult> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) throw new ResendError("RESEND_API_KEY is not configured", 0);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.headers ? { headers: input.headers } : {}),
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    // Surface the provider's own refusal reason, never the API key.
    throw new ResendError(
      `Resend rejected the email [${response.status}]: ${raw.slice(0, 400)}`,
      response.status,
    );
  }

  let id: string | null = null;
  try {
    id = (JSON.parse(raw) as { id?: string }).id ?? null;
  } catch {
    id = null;
  }
  return { id, status: response.status };
}
