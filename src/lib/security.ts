import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type UserRole = "user" | "admin" | "super_admin";

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .regex(/[A-Z]/, "Add an uppercase letter.")
  .regex(/[a-z]/, "Add a lowercase letter.")
  .regex(/[0-9]/, "Add a number.")
  .regex(/[^A-Za-z0-9]/, "Add a symbol.");

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }
  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }
  current.count += 1;
  return { allowed: true, remaining: limit - current.count, resetAt: current.resetAt };
}

export function clientIpFromHeaders(headers: Pick<Headers, "get">) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

export function rateLimitResponse(resetAt: number) {
  return NextResponse.json(
    { error: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) } }
  );
}

export const requiredServerEnv = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "OPENAI_API_KEY",
  "DARAJA_CONSUMER_KEY",
  "DARAJA_CONSUMER_SECRET",
  "DARAJA_SHORTCODE",
  "DARAJA_PASSKEY",
  "DARAJA_CALLBACK_URL"
];

export function validateServerEnv() {
  const missing = requiredServerEnv.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export async function getUserRole(userId: string): Promise<UserRole> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("users").select("role").eq("id", userId).single();
  return (data?.role as UserRole | undefined) ?? "user";
}

export async function requireAdmin(user: User) {
  const role = await getUserRole(user.id);
  if (role !== "admin" && role !== "super_admin") {
    return { allowed: false, role } as const;
  }
  return { allowed: true, role } as const;
}

export async function requireSuperAdmin(user: User) {
  const role = await getUserRole(user.id);
  if (role !== "super_admin") {
    return { allowed: false, role } as const;
  }
  return { allowed: true, role } as const;
}

export async function logSystemEvent(input: {
  category: string;
  level?: "info" | "warning" | "error";
  message: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from("system_logs").insert({
      category: input.category,
      level: input.level ?? "info",
      message: input.message,
      metadata: input.metadata ?? {}
    });
  } catch (error) {
    console.info("[SolvaOne system log fallback]", input.category, input.message, error instanceof Error ? error.message : "");
  }
}

export async function logAdminAction(input: {
  adminId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
}) {
  try {
    const supabase = createSupabaseAdminClient();
    await supabase.from("admin_activity_logs").insert({
      admin_id: input.adminId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      details: input.details ?? {}
    });
  } catch (error) {
    console.info("[SolvaOne admin log fallback]", input.action, error instanceof Error ? error.message : "");
  }
}
