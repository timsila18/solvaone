const origin = "https://www.corporatestaffing.co.ke";
export const careerCatalogues = [
  { path: "customer-service-jobs-in-kenya", roles: /reception|front.?office|front.?desk|customer|call.?cent[er]|retail|cashier|shop|store|petrol/i },
  { path: "administration-jobs-in-kenya", roles: /admin|reception|front.?office|secretar|office|assistant/i },
  { path: "hr-jobs-in-kenya", roles: /\bhr\b|human.?resource|payroll|recruit|people.?operation|personnel/i },
  { path: "sales-marketing-jobs-in-kenya", roles: /sales|market|retail|business.?develop|account.?manager|merchandis/i },
  { path: "teaching-jobs-in-kenya", roles: /teach|tutor|educat|trainer|lectur|school/i }
] as const;

export function careerCatalogueUrls(profiles: { target_job_titles?: string[]; structured_profile?: unknown }[]) {
  const ranked = careerCatalogues.map(source => ({ source, count: profiles.filter(profile => {
    const details = profile.structured_profile as { experience?: { jobTitle?: string }[] } | null;
    return source.roles.test([...(profile.target_job_titles ?? []), ...(details?.experience ?? []).map(item => item.jobTitle ?? "")].join(" "));
  }).length })).filter(item => item.count > 0).sort((a, b) => b.count - a.count);
  return ranked.map(item => `${origin}/category/${item.source.path}/`);
}

export function isCareerCatalogueUrl(value: string) {
  return careerCatalogues.some(source => value === `${origin}/category/${source.path}/`);
}
