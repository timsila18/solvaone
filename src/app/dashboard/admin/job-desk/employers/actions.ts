"use server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, logAdminAction } from "@/lib/security";
import { employerLeadSubject, readEmployerLead, employerDeadlineOpen } from "@/lib/job-desk/employer-network";

export async function verifyEmployerVacancy(form: FormData) {
  const user = await getCurrentUser();
  if (!user || !(await requireAdmin(user)).allowed) throw new Error("Forbidden");
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid vacancy request.");
  const db = createSupabaseAdminClient();
  const { data: lead, error } = await db.from("contact_messages").select("id,message,status").eq("id", id).eq("subject", employerLeadSubject).single();
  if (error || !lead) throw new Error("Vacancy request not found.");
  if (form.get("action") === "reject") {
    const { error: rejected } = await db.from("contact_messages").update({ status: "spam" }).eq("id", id).in("status", ["new", "open"]);
    if (rejected) throw new Error("Could not reject vacancy.");
  } else {
    if (!["employerVerified", "openVerified", "recipientVerified", "permissionVerified", "feesVerified"].every(key => form.get(key) === "on")) throw new Error("Complete every independent verification check.");
    if (!["new", "open", "closed"].includes(lead.status)) throw new Error("This request was rejected.");
    const parsed = readEmployerLead(lead.message);
    if (!parsed.success || !employerDeadlineOpen(parsed.data.closingDate)) throw new Error("Vacancy details or deadline are invalid.");
    const row = parsed.data;
    const { error: imported } = await db.from("job_desk_vacancies").upsert({ provider: "manual", external_id: `partner:${id}`, company_name: row.company, title: row.title, location: row.location, workplace_type: /\bremote\b/i.test(row.location) ? "remote" : /\bhybrid\b/i.test(row.location) ? "hybrid" : "onsite", description: `${row.requirements}\nApplication deadline: ${row.closingDate}\nApply by email: ${row.applicationEmail}`, apply_url: row.advertUrl, application_method: "email", application_email: row.applicationEmail, email_verified: true, status: "open", review_status: "approved", review_reasons: [], last_seen_at: new Date().toISOString() }, { onConflict: "provider,external_id", ignoreDuplicates: true });
    if (imported) throw new Error("Could not import verified vacancy.");
    const { error: closed } = await db.from("contact_messages").update({ status: "closed" }).eq("id", id).in("status", ["new", "open"]);
    if (closed) throw new Error("Vacancy imported; request status could not be saved. Retry safely.");
  }
  await logAdminAction({ adminId: user.id, action: form.get("action") === "reject" ? "reject_employer_vacancy" : "verify_employer_vacancy", targetType: "contact_message", targetId: id });
  redirect("/dashboard/admin/job-desk/employers");
}
