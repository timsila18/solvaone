"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseLoginClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { clientIpFromHeaders, logSystemEvent, passwordSchema } from "@/lib/security";
import { absoluteUrl } from "@/lib/utils";
import { headers } from "next/headers";
import { withinDeadline } from "@/lib/request-deadline";

const authSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  referralCode: z.string().max(40).optional()
});

const registerSchema = authSchema.extend({
  password: passwordSchema,
  acceptTerms: z.literal("on"),
  acceptPrivacy: z.literal("on")
});

const resetRequestSchema = z.object({ email: z.string().email() });
const passwordResetSchema = z.object({ password: passwordSchema });

function authServiceUnavailable(error: { status?: number; name?: string; message?: string }) {
  return error.status === 0 || error.status === 402 || error.status === 429 ||
    (typeof error.status === "number" && error.status >= 500) ||
    error.name === "AuthRetryableFetchError" ||
    /exceed_egress_quota|service for this project is restricted/i.test(error.message ?? "");
}

async function recordAuthAttempt(email: string, success: boolean, failureReason?: string) {
  try {
    const admin = createSupabaseAdminClient();
    const headerStore = await headers();
    await withinDeadline(admin.from("auth_attempts").insert({
      email: email.toLowerCase(),
      ip_address: clientIpFromHeaders(headerStore),
      success,
      failure_reason: failureReason ?? null
    }).abortSignal(AbortSignal.timeout(1500)).retry(false), 1500);
  } catch {
    // Auth attempts are defense-in-depth; never block login solely because logging failed.
  }
}

async function isLockedOut(email: string) {
  try {
    const admin = createSupabaseAdminClient();
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await withinDeadline(admin
      .from("auth_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email", email.toLowerCase())
      .eq("success", false)
      .gte("created_at", since).abortSignal(AbortSignal.timeout(2500)).retry(false), 2500);
    return (count ?? 0) >= 5;
  } catch {
    return false;
  }
}

export async function loginAction(formData: FormData) {
  const parsed = authSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    referralCode: formData.get("referralCode") || undefined
  });

  if (!parsed.success) {
    redirect("/login?error=invalid");
  }

  if (await isLockedOut(parsed.data.email)) {
    redirect("/login?error=locked");
  }

  const supabase = await createSupabaseLoginClient();
  let result: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
  try {
    result = await withinDeadline(supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password
    }), 12000);
  } catch {
    redirect("/login?error=unavailable");
  }
  const { data, error } = result;

  if (error) {
    if (authServiceUnavailable(error)) redirect("/login?error=unavailable");
    await recordAuthAttempt(parsed.data.email, false, error.message);
    redirect("/login?error=credentials");
  }

  await recordAuthAttempt(parsed.data.email, true);
  try {
    await withinDeadline(supabase.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", data.user.id)
      .abortSignal(AbortSignal.timeout(1500)).retry(false), 1500);
  } catch {
    // A telemetry write must not discard an authenticated session.
  }
  redirect("/dashboard");
}

export async function registerAction(formData: FormData) {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : rawEmail;
  const parsed = registerSchema.safeParse({
    email,
    password: formData.get("password"),
    referralCode: formData.get("referralCode") || undefined,
    acceptTerms: formData.get("acceptTerms"),
    acceptPrivacy: formData.get("acceptPrivacy")
  });

  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    if (fields.email?.length) redirect("/register?error=email");
    if (fields.password?.length) redirect("/register?error=password");
    if (fields.acceptTerms?.length || fields.acceptPrivacy?.length) redirect("/register?error=consent");
    redirect("/register?error=invalid");
  }

  let error: { code?: string; status?: number; message: string } | null = null;
  try {
    const admin = createSupabaseAdminClient();
    const result = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        referral_code: parsed.data.referralCode?.toUpperCase(),
        terms_accepted: true,
        privacy_accepted: true,
        terms_version: "2026-06-08",
        privacy_version: "2026-06-08"
      }
    });
    error = result.error;
  } catch (registrationError) {
    error = {
      message: registrationError instanceof Error ? registrationError.message : "Registration service unavailable"
    };
  }

  if (error) {
    const normalizedMessage = error.message.toLowerCase();
    const isExistingAccount =
      normalizedMessage.includes("already") ||
      normalizedMessage.includes("registered") ||
      normalizedMessage.includes("exists");
    const isPasswordError = normalizedMessage.includes("password");

    console.error("[register] Supabase account creation failed", {
      code: error.code,
      status: error.status,
      message: error.message
    });
    await logSystemEvent({
      category: "auth.registration_failed",
      level: "error",
      message: "Supabase rejected an account registration request.",
      metadata: { code: error.code ?? null, status: error.status ?? null, reason: error.message }
    });

    if (isExistingAccount) redirect("/register?error=existing");
    if (isPasswordError) redirect("/register?error=password");
    redirect("/register?error=unavailable");
  }

  const supabase = await createSupabaseServerClient();
  const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password
  });

  if (loginError || !loginData.user) {
    redirect("/login?registered=1");
  }

  await recordAuthAttempt(parsed.data.email, true);
  await supabase.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", loginData.user.id);
  redirect("/dashboard");
}

export async function forgotPasswordAction(formData: FormData) {
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect("/forgot-password?error=invalid");

  const supabase = await createSupabaseServerClient();
  let resetError: { status?: number; name?: string; message?: string } | null = null;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: absoluteUrl("/reset-password")
    });
    resetError = error;
  } catch (error) {
    redirect("/forgot-password?error=unavailable");
  }
  if (resetError) redirect("/forgot-password?error=unavailable");

  redirect("/forgot-password?sent=1");
}

export async function resetPasswordAction(formData: FormData) {
  const parsed = passwordResetSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) redirect("/reset-password?error=weak");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error && authServiceUnavailable(error)) redirect("/reset-password?error=unavailable");
  if (error) redirect("/reset-password?error=token");

  redirect("/dashboard");
}
