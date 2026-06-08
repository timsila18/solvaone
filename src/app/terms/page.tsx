import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Terms and Conditions", description: "Starter SolvaOne terms and conditions.", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <LegalPage title="Terms and Conditions">
      <p>SolvaOne provides AI-assisted document generation, editing, payment, and download services for career and business documents.</p>
      <p>Users are responsible for reviewing generated content before use. SolvaOne does not create fake qualifications, certifications, referees, employment history, or business claims.</p>
      <p>Payments are processed through M-Pesa Daraja where available. Downloads and premium generation are unlocked only after server-side payment confirmation.</p>
      <p>These starter terms should be reviewed by a qualified legal professional before public launch.</p>
    </LegalPage>
  );
}
