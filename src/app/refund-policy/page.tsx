import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Refund Policy", description: "Starter SolvaOne refund policy.", alternates: { canonical: "/refund-policy" } };

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Refund Policy">
      <p>Failed, cancelled, duplicate, or unresolved payment issues may be reviewed by SolvaOne support and administrators.</p>
      <p>No refund is normally issued after successful document generation and access to downloads, unless a verified technical failure prevented reasonable use of the paid service.</p>
      <p>If generation fails after payment, the payment remains valid and the user may retry generation without paying again.</p>
      <p>This starter refund policy should be reviewed by a qualified legal professional before public launch.</p>
    </LegalPage>
  );
}
