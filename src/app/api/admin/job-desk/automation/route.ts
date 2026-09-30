import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import { requireAdmin, logAdminAction } from "@/lib/security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAuthorizationToken, enqueueTask } from "@/lib/job-desk/automation";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add_source"), provider: z.enum(["greenhouse", "lever"]), siteToken: z.string().regex(/^[a-zA-Z0-9_-]{2,80}$/), companyName: z.string().min(2).max(120) }),
  z.object({ action: z.literal("discover"), sourceId: z.string().uuid() }),
  z.object({ action: z.literal("match"), orderId: z.string().uuid() }),
  z.object({ action: z.literal("prepare"), matchId: z.string().uuid() }),
  z.object({ action: z.literal("authorize_link"), matchId: z.string().uuid() }),
  z.object({ action: z.literal("add_vacancy"), companyName: z.string().min(2).max(150), title: z.string().min(3).max(250), location: z.string().max(200), description: z.string().min(100).max(18000), applyUrl: z.string().url().max(1000), applicationMethod: z.enum(["portal", "email"]), applicationEmail: z.string().email().optional(), emailVerified: z.boolean().default(false) })
]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action or input." }, { status: 400 });
  const input = parsed.data;
  const db = createSupabaseAdminClient();
  try {
    let result: Record<string, unknown> = {};
    if (input.action === "add_source") {
      const { data, error } = await db.from("job_desk_sources").upsert({ provider: input.provider, site_token: input.siteToken, company_name: input.companyName, active: true }, { onConflict: "provider,site_token" }).select("id").single();
      if (error) throw new Error(error.message);
      await enqueueTask("discover", `discover:${data.id}:${new Date().toISOString().slice(0, 10)}`, null, { sourceId: data.id });
      result = { sourceId: data.id };
    } else if (input.action === "discover") {
      const { data } = await db.from("job_desk_sources").select("id").eq("id", input.sourceId).eq("active", true).single();
      if (!data) return NextResponse.json({ error: "Active source not found." }, { status: 404 });
      await enqueueTask("discover", `discover:${data.id}:${Date.now()}`, null, { sourceId: data.id });
    } else if (input.action === "add_vacancy") {
      if (input.applicationMethod === "email" && (!input.applicationEmail || !input.emailVerified)) return NextResponse.json({ error: "Verify the application address against the original advert and confirm it." }, { status: 400 });
      const { data, error } = await db.from("job_desk_vacancies").insert({ provider: "manual", external_id: crypto.randomUUID(), company_name: input.companyName, title: input.title, location: input.location, description: input.description, apply_url: input.applyUrl, application_method: input.applicationMethod, application_email: input.applicationEmail ?? null, email_verified: input.applicationMethod === "email" && input.emailVerified }).select("id").single();
      if (error) throw new Error(error.message);
      result = { vacancyId: data.id };
    } else if (input.action === "match") {
      const { data: order } = await db.from("job_desk_orders").select("id,payment_status").eq("id", input.orderId).single();
      if (!order || !["paid", "waived"].includes(order.payment_status)) return NextResponse.json({ error: "Paid order required." }, { status: 409 });
      await enqueueTask("match", `match:${input.orderId}:${Date.now()}`, input.orderId);
    } else if (input.action === "prepare") {
      const { data: match } = await db.from("job_desk_matches").select("id,order_id,status").eq("id", input.matchId).single();
      if (!match || match.status !== "suggested") return NextResponse.json({ error: "Suggested match not found." }, { status: 409 });
      await enqueueTask("prepare", `prepare:${match.id}`, match.order_id, { matchId: match.id });
    } else {
      const { data: match } = await db.from("job_desk_matches").select("id,order_id,status,cover_letter").eq("id", input.matchId).single();
      if (!match || match.status !== "ready" || !match.cover_letter) return NextResponse.json({ error: "Prepare the application before requesting consent." }, { status: 409 });
      const { token, hash } = createAuthorizationToken();
      const { error } = await db.from("job_desk_matches").update({ authorization_token_hash: hash, authorization_expires_at: new Date(Date.now() + 7 * 86400000).toISOString() }).eq("id", match.id);
      if (error) throw new Error(error.message);
      result = { authorizationUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://solvaone.co.ke"}/job-desk/authorize/${token}` };
    }
    await logAdminAction({ adminId: user.id, action: `job_desk.${input.action}`, targetType: "job_desk", targetId: "orderId" in input ? input.orderId : "matchId" in input ? input.matchId : "sourceId" in input ? input.sourceId : user.id, details: { action: input.action } });
    return NextResponse.json({ ok: true, ...result });
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "Job Desk action failed" }, { status: 500 }); }
}
