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

export function absoluteUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
