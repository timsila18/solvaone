import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

async function createTicket(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const { data: ticket } = await supabase
    .from("tickets")
    .insert({
      user_id: user.id,
      subject: String(formData.get("subject") ?? "").slice(0, 160),
      category: String(formData.get("category") ?? "support").slice(0, 80),
      priority: "normal",
      status: "open"
    })
    .select("id")
    .single();
  if (ticket) {
    await supabase.from("ticket_messages").insert({
      ticket_id: ticket.id,
      sender_type: "user",
      message: String(formData.get("message") ?? "").slice(0, 4000)
    });
  }
  redirect("/dashboard/support");
}

export default async function SupportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, { data: tickets }] = await Promise.all([
    supabase.from("users").select("role").eq("id", user.id).single(),
    supabase.from("tickets").select("id,subject,category,priority,status,created_at,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false })
  ]);

  return (
    <AppShell email={user.email} isAdmin={profile?.role === "admin" || profile?.role === "super_admin"}>
      <div className="mb-8">
        <h1 className="text-4xl font-black">Support</h1>
        <p className="mt-2 text-black/55 dark:text-white/55">Submit issues and track ticket status.</p>
      </div>
      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <form action={createTicket} className="rounded-lg border border-black/10 p-5 dark:border-white/10">
          <h2 className="text-xl font-black">Contact support</h2>
          <div className="mt-5 space-y-4">
            <Input name="subject" placeholder="Subject" required />
            <Input name="category" placeholder="Category: payment, generation, download" />
            <Textarea name="message" className="min-h-32" placeholder="Describe the issue" required />
            <Button type="submit">Submit ticket</Button>
          </div>
        </form>
        <div className="rounded-lg border border-black/10 p-5 dark:border-white/10">
          <h2 className="text-xl font-black">Your tickets</h2>
          <div className="mt-5 space-y-3">
            {tickets?.length ? tickets.map((ticket) => (
              <div key={ticket.id} className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/10">
                <div className="flex justify-between gap-3 font-black">
                  <span>{ticket.subject}</span>
                  <span className="capitalize text-brand-blue">{ticket.status}</span>
                </div>
                <p className="mt-1 text-black/50 dark:text-white/50">{ticket.category} - {new Date(ticket.updated_at).toLocaleString()}</p>
              </div>
            )) : <p className="text-sm text-black/55 dark:text-white/55">No tickets submitted yet.</p>}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
