import type { Metadata } from "next";
import { AnalyticsScripts } from "@/components/analytics/analytics-scripts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://solvaone.co.ke"),
  title: {
    default: "SolvaOne | Create. Apply. Grow.",
    template: "%s | SolvaOne"
  },
  description: "Premium AI document generation for careers and businesses by Solva Business Group.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "SolvaOne | Create. Apply. Grow.",
    description: "CVs, cover letters, company profiles and business plans powered by Solva Intelligence.",
    url: "https://solvaone.co.ke",
    siteName: "SolvaOne",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "SolvaOne | Create. Apply. Grow.",
    description: "Premium document generation for job seekers, SMEs and professionals in Kenya."
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <AnalyticsScripts />
      </body>
    </html>
  );
}
