import type { MetadataRoute } from "next";
import { productPages, resourcePosts, site } from "@/lib/marketing";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = site.url.replace(/\/$/, "");
  const staticRoutes = ["", "/pricing", "/about", "/contact", "/faq", "/resources", "/terms", "/privacy", "/refund-policy"];
  return [
    ...staticRoutes.map((route) => ({ url: `${base}${route}`, lastModified: new Date() })),
    ...productPages.map((page) => ({ url: `${base}/products/${page.slug}`, lastModified: new Date() })),
    ...resourcePosts.map((post) => ({ url: `${base}/resources/${post.slug}`, lastModified: new Date() }))
  ];
}
