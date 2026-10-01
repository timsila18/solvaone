export class ApplicationEmailError extends Error {
  constructor(message: string, public readonly rejected: boolean) { super(message); }
}

export function emailSender() {
  const from = (process.env.JOB_DESK_FROM_EMAIL || process.env.FROM_EMAIL || "").trim();
  if (!process.env.RESEND_API_KEY || !from) throw new ApplicationEmailError("Configure RESEND_API_KEY and a verified JOB_DESK_FROM_EMAIL or FROM_EMAIL in Vercel.", true);
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new ApplicationEmailError("The application sender must be a valid verified email address.", true);
  return from;
}

export async function sendApplicationEmail(payload: Record<string, unknown>, idempotencyKey: string) {
  const from = emailSender();
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ ...payload, from }), signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw new ApplicationEmailError("Email outcome is unknown after a network error. Check Resend logs before retrying.", false);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.id !== "string") {
    const hint = response.status === 401 ? "Replace the invalid Resend API key." : response.status === 403 ? "Verify the sender domain and API-key sending permission in Resend." : response.status === 429 ? "Resend sending limit reached; retry after the limit resets." : "Check Resend email logs.";
    // Only an explicit provider rejection establishes that nothing was accepted.
    throw new ApplicationEmailError(`Email not confirmed (${response.status}). ${hint}`, [400, 401, 403, 422, 429].includes(response.status));
  }
  return { id: result.id as string };
}
