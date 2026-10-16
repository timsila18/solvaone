export function readLocalCvFields(text: string) {
  const contactText = text.split(/\b(?:referees|references)\b/i)[0];
  const phoneCandidates = contactText.match(/\+\d[\d ()-]{7,20}\d|\b0\d[\d ()-]{6,16}\d\b/g) ?? [];
  const phone = phoneCandidates.find(value => { const digits = value.replace(/\D/g, ""); return digits.length >= 10 && digits.length <= 15; });
  const linkedIn = contactText.match(/(?:^|[\s(<])((?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-z0-9_%.-]+)/i)?.[1] ?? "";
  const name = contactText.match(/^(?:full\s*name|name)\s*:\s*([^\n\r|]+)/im)?.[1]?.trim() ?? "";
  return {
    fullName: name, email: contactText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "",
    whatsappPhone: phone?.trim() ?? "", applicantLinkedinUrl: linkedIn ? `https://${linkedIn.replace(/^https?:\/\//i, "")}` : "",
    targetJobTitles: [], preferredIndustries: [], preferredLocations: [], experienceLevel: "",
    remotePreference: "flexible" as const, currentCity: "", currentCountry: "", noticePeriod: "", portfolioUrl: ""
  };
}
