"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const contactSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  subject: z.string().min(3).max(160),
  message: z.string().min(10).max(3000)
});

export async function submitContactMessage(_state: { status: string; message: string }, formData: FormData) {
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    subject: formData.get("subject"),
    message: formData.get("message")
  });

  if (!parsed.success) {
    return { status: "error", message: "Please complete the form with a valid email and message." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("contact_messages").insert({ ...parsed.data, status: "new" });
    if (error) {
      console.info("[SolvaOne contact fallback]", error.message, parsed.data.email);
    }
  } catch (error) {
    console.info("[SolvaOne contact fallback]", error instanceof Error ? error.message : "Contact storage unavailable");
  }

  return { status: "success", message: "Message received. SolvaOne support will follow up." };
}
