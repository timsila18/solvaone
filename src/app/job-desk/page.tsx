import type { Metadata } from "next";
import { BriefcaseBusiness, FileText, MessageCircle } from "lucide-react";
import { PublicShell } from "@/components/marketing/public-shell";
import { PublicJobDeskIntakeForm } from "@/components/job-desk/public-intake-form";
import { site } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Job Desk | Job Hunting, Interview Coaching and LinkedIn Revamp Kenya",
  description: "Pay securely with M-Pesa for online job hunting, interview coaching or a LinkedIn revamp. Share your details and hear from SolvaOne within 6 hours.",
  alternates: { canonical: "/job-desk" }
};

export default function JobDeskIntakePage() {
  return <PublicShell>
    <section className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
        <p className="flex items-center gap-2 text-sm font-black text-brand-blue"><BriefcaseBusiness className="h-4 w-4" /> SOLVAONE JOB DESK</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight md:text-5xl">Job search support built around your next move.</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-black/65 dark:text-white/65">Choose online job hunting for KSh 1,500, interview coaching for KSh 1,000 or a LinkedIn revamp for KSh 1,000. Pay by M-Pesa, then our admin will get back to you within 6 hours.</p>
        <div className="mt-8 grid gap-4 border-y border-black/10 py-5 text-sm font-semibold dark:border-white/10 sm:grid-cols-3">
          <p className="flex items-center gap-3"><FileText className="h-5 w-5 text-brand-blue" /> Upload your current CV</p>
          <p className="flex items-center gap-3"><BriefcaseBusiness className="h-5 w-5 text-brand-blue" /> Choose your service</p>
          <p className="flex items-center gap-3"><MessageCircle className="h-5 w-5 text-brand-blue" /> Hear from us on WhatsApp</p>
        </div>
      </div>
    </section>
    <section className="mx-auto max-w-5xl px-4 py-10 pb-28 md:px-6 md:py-14">
      <div className="mb-8"><h2 className="text-2xl font-black">Start your Job Desk request</h2><p className="mt-2 text-sm text-black/60 dark:text-white/60">Your files are kept private. Your request reaches the service queue only after payment is confirmed.</p></div>
      <PublicJobDeskIntakeForm />
      <p className="mt-8 text-sm text-black/55 dark:text-white/55">Need help? Email {site.supportEmail} or WhatsApp 0721537597.</p>
    </section>
  </PublicShell>;
}
