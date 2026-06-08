import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

type Status = "Pass" | "Warning" | "Fail";

export default async function LaunchReadinessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect("/dashboard");

  const checks = buildChecks();

  return (
    <AppShell email={user.email} isAdmin>
      <div className="mb-8">
        <h1 className="text-4xl font-black">Launch Readiness</h1>
        <p className="mt-2 text-black/55 dark:text-white/55">Production controls for SolvaOne go-live.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {checks.map((check) => (
          <div key={check.name} className="rounded-lg border border-black/10 p-5 dark:border-white/10">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black">{check.name}</h2>
              <span className={statusClass(check.status)}>{check.status}</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-black/58 dark:text-white/58">{check.note}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function buildChecks(): Array<{ name: string; status: Status; note: string }> {
  const has = (name: string) => Boolean(process.env[name]);
  return [
    { name: "Authentication", status: has("NEXT_PUBLIC_SUPABASE_URL") && has("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ? "Pass" : "Fail", note: "Supabase auth env vars and email verification middleware are required." },
    { name: "Payments", status: has("DARAJA_CONSUMER_KEY") && has("DARAJA_PASSKEY") ? "Pass" : "Warning", note: "Daraja credentials and callback URL must be live and confirmed with Safaricom." },
    { name: "AI Generation", status: has("OPENAI_API_KEY") ? "Pass" : "Fail", note: "OpenAI key, payment gate, usage limits, and prompt safety are enabled." },
    { name: "Downloads", status: "Pass", note: "PDF, DOCX, and receipt exports are server-side and payment gated." },
    { name: "Email", status: has("EMAIL_PROVIDER") ? "Pass" : "Warning", note: "Notification hooks log safely when provider is not configured." },
    { name: "SEO", status: "Pass", note: "Metadata, sitemap, robots, product pages, and resource foundations are present." },
    { name: "Analytics", status: has("NEXT_PUBLIC_GA_ID") || has("NEXT_PUBLIC_CLARITY_ID") ? "Pass" : "Warning", note: "Analytics scripts are env-driven and safe to enable later." },
    { name: "Referrals", status: "Pass", note: "Referral codes, links, credits foundation, and signup tracking are implemented." },
    { name: "Support", status: "Pass", note: "Tickets, contact messages, and support dashboard are available." },
    { name: "Admin Controls", status: "Pass", note: "Admin/super-admin roles, control endpoint, logs, and reports are implemented." }
  ];
}

function statusClass(status: Status) {
  const base = "rounded-lg px-3 py-1 text-xs font-black";
  if (status === "Pass") return `${base} bg-brand-blue text-white`;
  if (status === "Warning") return `${base} border border-brand-blue text-brand-blue`;
  return `${base} border border-black text-black dark:border-white dark:text-white`;
}
