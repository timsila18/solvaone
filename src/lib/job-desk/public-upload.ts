import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const INTAKE_BUCKET = "job-desk-intake";
export const MAX_INTAKE_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_INTAKE_TOTAL_SIZE = 20 * 1024 * 1024;

export const intakeMimeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain"
};

export type IntakeUploadRef = {
  checkoutToken: string;
  path: string;
  name: string;
  size: number;
  kind: "cv" | "supporting";
  index: number;
  expiresAt: number;
};

function signingKey() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Upload signing is unavailable");
  return key;
}

function signature(payload: string) {
  return createHmac("sha256", signingKey()).update(`job-desk-upload-v1:${payload}`).digest("hex");
}

export function signIntakeUpload(ref: IntakeUploadRef) {
  const payload = Buffer.from(JSON.stringify(ref)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyIntakeUpload(value: string, checkoutToken: string): IntakeUploadRef | null {
  if (value.length > 1800) return null;
  const [payload, mac, extra] = value.split(".");
  if (!payload || !mac || extra || !/^[a-f0-9]{64}$/.test(mac)) return null;
  if (!timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(signature(payload), "hex"))) return null;
  try {
    const ref = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as IntakeUploadRef;
    const extension = ref.name?.split(".").pop()?.toLowerCase() ?? "";
    if (ref.checkoutToken !== checkoutToken || ref.expiresAt < Date.now() || ref.expiresAt > Date.now() + 2 * 60 * 60 * 1000 || !ref.path?.startsWith(`staging/${checkoutToken}/`) || !intakeMimeByExtension[extension] || !Number.isInteger(ref.size) || ref.size < 1 || ref.size > MAX_INTAKE_FILE_SIZE || !["cv", "supporting"].includes(ref.kind) || !Number.isInteger(ref.index) || ref.index < 0 || ref.index > 2) return null;
    return ref;
  } catch { return null; }
}
