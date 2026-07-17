import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKes(amount: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0
  }).format(amount);
}

export function getPublicSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.solvaone.co.ke";
  const url = configuredUrl.replace(/\/+$/, "");

  if (url === "https://solvaone.co.ke" || url === "http://solvaone.co.ke") {
    return "https://www.solvaone.co.ke";
  }

  return url;
}

export function absoluteUrl(path: string) {
  const base = getPublicSiteUrl();
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
