"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/utils";

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function loginAction(formData: FormData) {
  const parsed = authSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    redirect("/login?error=invalid");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    redirect("/login?error=credentials");
  }

  redirect("/dashboard");
}

export async function registerAction(formData: FormData) {
  const parsed = authSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    redirect("/register?error=invalid");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: absoluteUrl("/auth/callback")
    }
  });

  if (error) {
    redirect("/register?error=signup");
  }

  redirect("/auth/verify");
}
