import type { Metadata } from "next";
import { BriefcaseBusiness, FileText, MessageCircle } from "lucide-react";
import { PublicShell } from "@/components/marketing/public-shell";
import { PublicJobDeskIntakeForm } from "@/components/job-desk/public-intake-form";
import { site } from "@/lib/marketing";

export const metadata: Metadata = {
  title: "Job Desk | CV Intake and Job Search Support Kenya",
  description: "Share your CV and job preferences with SolvaOne Job Desk. Our team reviews your documents and contacts you on WhatsApp about tailored job search support.",
  alternates: { canonical: "/job-desk" }
};

export default function JobDeskIntakePage() {
  return <PublicShell>
    <section className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
        <p className="flex items-center gap-2 text-sm font-black text-brand-blue"><BriefcaseBusiness className="h-4 w-4" /> SOLVAONE JOB DESK</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight md:text-5xl">Share your CV. Tell us where you want to go.</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-black/65 dark:text-white/65">Our team reviews your CV and job preferences, then contacts you about the next steps. You will know the service and price before paying.</p>
        <div className="mt-8 grid gap-4 border-y border-black/10 py-5 text-sm font-semibold dark:border-white/10 sm:grid-cols-3">
          <p className="flex items-center gap-3"><FileText className="h-5 w-5 text-brand-blue" /> Upload your current CV</p>
          <p className="flex items-center gap-3"><BriefcaseBusiness className="h-5 w-5 text-brand-blue" /> Share your target roles</p>
          <p className="flex items-center gap-3"><MessageCircle className="h-5 w-5 text-brand-blue" /> Hear from us on WhatsApp</p>
        </div>
      </div>
    </section>
    <section className="mx-auto max-w-5xl px-4 py-10 pb-28 md:px-6 md:py-14">
      <div className="mb-8"><h2 className="text-2xl font-black">Start your Job Desk request</h2><p className="mt-2 text-sm text-black/60 dark:text-white/60">Your files are kept private and reviewed by the SolvaOne team.</p></div>
      <PublicJobDeskIntakeForm />
      <p className="mt-8 text-sm text-black/55 dark:text-white/55">Need help? Email {site.supportEmail} or WhatsApp {site.supportPhone}.</p>
    </section>
  </PublicShell>;
}
