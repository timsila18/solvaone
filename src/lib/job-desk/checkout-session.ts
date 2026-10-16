type CheckoutSession = { token: string; reference?: string };
type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const key = "solva-job-desk-checkout";

export function readCheckoutSession(storage: SessionStore): CheckoutSession | null {
  try {
    const saved = JSON.parse(storage.getItem(key) ?? "null");
    if (typeof saved?.token !== "string" || !/^[A-Za-z0-9_-]{40,80}$/.test(saved.token)) return null;
    return { token: saved.token, ...(typeof saved.reference === "string" ? { reference: saved.reference } : {}) };
  } catch { return null; }
}

export function saveCheckoutSession(storage: SessionStore, value: CheckoutSession) {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* Checkout works even when browser storage is blocked. */ }
}

export function clearCheckoutSession(storage: SessionStore) {
  try { storage.removeItem(key); } catch { /* In-memory state is cleared by the caller. */ }
}

export function paymentPollDelay(attempt: number) {
  return attempt < 8 ? 15000 : 30000;
}

export function paymentPollingFinished(status: string) {
  return ["successful", "failed", "cancelled", "timed_out"].includes(status);
}
