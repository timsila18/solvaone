import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Privacy Policy", description: "Starter SolvaOne privacy policy.", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>SolvaOne collects account details, document inputs, payment references, and usage events required to provide document generation, editing, checkout, and support.</p>
      <p>API keys and payment credentials are kept server-side. Generated documents are visible only to the account owner and authorized administrators under access controls.</p>
      <p>Analytics providers may be enabled through environment variables to measure page views, checkout activity, and product performance.</p>
      <p>This starter privacy policy should be reviewed and completed before production launch.</p>
    </LegalPage>
  );
}
