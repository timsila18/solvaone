import type { MetadataRoute } from "next";
import { site } from "@/lib/marketing";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/api"]
    },
    sitemap: `${site.url.replace(/\/$/, "")}/sitemap.xml`
  };
}
