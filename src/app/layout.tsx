import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://solvaone.co.ke"),
  title: {
    default: "SolvaOne | Create. Apply. Grow.",
    template: "%s | SolvaOne"
  },
  description: "Premium AI document generation for careers and businesses by Solva Business Group.",
  openGraph: {
    title: "SolvaOne",
    description: "Create. Apply. Grow.",
    url: "https://solvaone.co.ke",
    siteName: "SolvaOne",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
