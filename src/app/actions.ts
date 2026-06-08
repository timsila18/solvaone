"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientIpFromHeaders, passwordSchema } from "@/lib/security";
import { absoluteUrl } from "@/lib/utils";
import { headers } from "next/headers";

const authSchema = z.object({
  email: z.string().email(),
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

async function recordAuthAttempt(email: string, success: boolean, failureReason?: string) {
  try {
    const admin = createSupabaseAdminClient();
    const headerStore = await headers();
    await admin.from("auth_attempts").insert({
      email: email.toLowerCase(),
      ip_address: clientIpFromHeaders(headerStore),
      success,
      failure_reason: failureReason ?? null
    });
  } catch {
    // Auth attempts are defense-in-depth; never block login solely because logging failed.
  }
}

async function isLockedOut(email: string) {
  try {
    const admin = createSupabaseAdminClient();
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("auth_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email", email.toLowerCase())
      .eq("success", false)
      .gte("created_at", since);
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

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password
  });

  if (error) {
    await recordAuthAttempt(parsed.data.email, false, error.message);
    redirect("/login?error=credentials");
  }

  if (!data.user?.email_confirmed_at) {
    await supabase.auth.signOut();
    await recordAuthAttempt(parsed.data.email, false, "email_unverified");
    redirect("/auth/verify");
  }

  await recordAuthAttempt(parsed.data.email, true);
  await supabase.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", data.user.id);
  redirect("/dashboard");
}

export async function registerAction(formData: FormData) {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    referralCode: formData.get("referralCode") || undefined,
    acceptTerms: formData.get("acceptTerms"),
    acceptPrivacy: formData.get("acceptPrivacy")
  });

  if (!parsed.success) {
    redirect("/register?error=invalid");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: absoluteUrl("/auth/callback"),
      data: {
        referral_code: parsed.data.referralCode?.toUpperCase(),
        terms_accepted: true,
        privacy_accepted: true,
        terms_version: "2026-06-08",
        privacy_version: "2026-06-08"
      }
    }
  });

  if (error) {
    redirect("/register?error=signup");
  }

  redirect("/auth/verify");
}

export async function forgotPasswordAction(formData: FormData) {
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect("/forgot-password?error=invalid");

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: absoluteUrl("/reset-password")
  });

  redirect("/forgot-password?sent=1");
}

export async function resetPasswordAction(formData: FormData) {
  const parsed = passwordResetSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) redirect("/reset-password?error=weak");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) redirect("/reset-password?error=token");

  redirect("/dashboard");
}
