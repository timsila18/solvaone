import { createHash, randomBytes } from "node:crypto";
import { expiredDeadline } from "./matching.ts";

export function createBatchToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashBatchToken(token) };
}

export function hashBatchToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function batchVacancyIsCurrent(vacancy: { status?: string; review_status?: string; duplicate_of?: string | null; description?: string; last_seen_at?: string } | null | undefined) {
  return Boolean(vacancy?.status === "open" && vacancy.review_status === "approved" && !vacancy.duplicate_of && vacancy.last_seen_at && Date.now() - new Date(vacancy.last_seen_at).getTime() <= 72 * 3600000 && !expiredDeadline(vacancy.description ?? ""));
}
