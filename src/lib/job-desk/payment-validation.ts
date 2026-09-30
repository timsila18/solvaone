export type DeskPaymentOutcome = { status: "successful" | "failed" | "cancelled" | "timed_out" | "needs_review"; receipt: string | null; code: number; description: string };

export function validateJobDeskCallback(callback: Record<string, any>, expected: { amount: number; phone_number: string }): DeskPaymentOutcome {
  const code = Number(callback.ResultCode);
  const description = String(callback.ResultDesc ?? "").slice(0, 300);
  if (!Number.isInteger(code)) return { status: "needs_review", receipt: null, code: -1, description: "Callback result was invalid." };
  if (code !== 0) return { status: code === 1032 ? "cancelled" : code === 1037 ? "timed_out" : "failed", receipt: null, code, description };
  const items = callback.CallbackMetadata?.Item;
  const value = (name: string) => Array.isArray(items) ? items.find((item: { Name?: string; Value?: unknown }) => item.Name === name)?.Value : undefined;
  const amount = Number(value("Amount"));
  const phone = String(value("PhoneNumber") ?? "").replace(/\D/g, "");
  const receipt = String(value("MpesaReceiptNumber") ?? "").trim();
  if (amount !== expected.amount || phone !== expected.phone_number || !/^[A-Z0-9]{8,20}$/i.test(receipt)) return { status: "needs_review", receipt: null, code, description: "Callback payment details need manual verification." };
  return { status: "successful", receipt, code, description };
}
