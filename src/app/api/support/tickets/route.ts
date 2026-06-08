import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, clientIpFromHeaders, rateLimitResponse } from "@/lib/security";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

const schema = z.object({
  subject: z.string().min(3).max(160),
  category: z.string().min(2).max(80).default("support"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  message: z.string().min(5).max(4000)
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("tickets")
      .select("id,subject,category,priority,status,created_at,updated_at,ticket_messages(id,sender_type,message,created_at)")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tickets: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  const limited = checkRateLimit(`ticket:${clientIpFromHeaders(request.headers)}`, 8, 10 * 60 * 1000);
  if (!limited.allowed) return rateLimitResponse(limited.resetAt);

  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid ticket payload" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({
      user_id: user.id,
      subject: parsed.data.subject,
      category: parsed.data.category,
      priority: parsed.data.priority,
      status: "open"
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("ticket_messages").insert({
    ticket_id: ticket.id,
    sender_type: "user",
    message: parsed.data.message
  });
  return NextResponse.json({ ticketId: ticket.id });
}
