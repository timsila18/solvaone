import { PublicShell } from "@/components/marketing/public-shell";
import { EmployerVacancyForm } from "@/components/job-desk/employer-vacancy-form";
export const metadata = { title: "Employer vacancies | SolvaOne", description: "Submit a genuine Kenyan vacancy for verification by SolvaOne Job Hunting." };
export default function EmployersPage() {
  return <PublicShell><section className="mx-auto max-w-4xl px-4 py-12"><h1 className="text-3xl font-black">Submit an employer vacancy</h1><p className="mb-8 mt-3">SolvaOne verifies employer details and application instructions before matching candidates. Open vacancies only; no applicant recruitment fees.</p><EmployerVacancyForm /></section></PublicShell>;
}
