import { load } from "cheerio";

export function buildApplicantKnown(client: { full_name: string; email?: string | null; whatsapp_phone?: string | null }, details: { currentCity?: string; currentCountry?: string; noticePeriod?: string; applicantLinkedinUrl?: string; portfolioUrl?: string } | null, approvedHtml: string) {
  const names = client.full_name.trim().split(/\s+/);
  const $ = load(approvedHtml);
  const section = (heading: RegExp) => {
    const header = $("h2").filter((_, node) => heading.test($(node).text())).first();
    return header.nextUntil("h2").map((_, node) => $(node).text()).get().join(" ").replace(/\s+/g, " ").trim().slice(0, 4000);
  };
  return {
    first_name: names[0] ?? "", last_name: names.slice(1).join(" "),
    email: client.email ?? "", phone: client.whatsapp_phone ?? "",
    linkedin_profile: details?.applicantLinkedinUrl ?? "", website: details?.portfolioUrl ?? "",
    city: details?.currentCity ?? "", country_of_residence: details?.currentCountry ?? "",
    current_location: [details?.currentCity, details?.currentCountry].filter(Boolean).join(", "),
    notice_period: details?.noticePeriod ?? "",
    professional_summary: section(/^professional (?:summary|profile)$/i),
    education_history: section(/^education$/i),
    employment_history: section(/^professional experience|^employment history|^work experience$/i),
    skills: section(/^core competencies$|^skills$|^technical skills$/i),
  };
}
