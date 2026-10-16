export type LocalCvSections = { summary: string; skills: string; experience: string; education: string; additional: string };
type SectionKind = keyof LocalCvSections | "header" | "references";
type Section = { kind: SectionKind; title: string; lines: string[] };
const roleWord = /\b(?:accountant|officer|manager|assistant|coordinator|administrator|receptionist|analyst|engineer|developer|specialist|consultant|director|executive|representative|supervisor|technician|nutritionist|dietitian|dietician|teacher|tutor|nurse|advocate|counsel|lawyer|clerk|agent|associate|intern|trainee|cashier|bookkeeper|auditor|journalist|presenter|reporter|editor|producer|designer|lead|head)\b/i;
const countries = "Kenya|South Africa|Cameroon|Uganda|Tanzania|Rwanda|Nigeria|Ghana|United Kingdom|United States|Zambia|Zimbabwe";

function sectionKind(value: string): SectionKind | null {
  const title = value.replace(/\s+/g, " ").trim();
  if (/^(?:(?:professional|executive|personal|career)\s+)?(?:profile|summary|objectives?)$|^about me$/i.test(title)) return "summary";
  if (/^(?:(?:core|key|technical|professional|relevant)\s+)?(?:skills|competencies|expertise)(?:\s+(?:and|&)\s+(?:skills|competencies|tools))?$|^areas of expertise$|^technical proficiencies$|^(?:systems and digital skills|financial and commercial capabilities|computer skills|digital skills|computer literacy)$/i.test(title)) return "skills";
  if (/^(?:(?:professional|work|employment|clinical|volunteer|relevant)\s+)?(?:experience|history)(?:\s+continued)?$|^career history$/i.test(title)) return "experience";
  if (/^(?:education|educational background|educational qualifications|academic qualifications|academic background)(?:\s+(?:and|&)\s+(?:professional\s+)?(?:training|qualifications|certifications|credentials|development))?$|^(?:(?:professional|other)\s+)?(?:certifications|certificates|qualifications|training)$/i.test(title)) return "education";
  if (/^(?:professional\s+)?(?:references|referees)(?:\s+available upon request)?$/i.test(title)) return "references";
  if (/^(?:languages|projects|publications|awards|achievements|career value|professional strengths|professional memberships?|professional affiliations|memberships?|interests|relevant academic areas|additional information|contact(?: (?:information|details))?|personal details)$/i.test(title)) return "additional";
  return null;
}

function parseSections(text: string): Section[] {
  const sections: Section[] = [{ kind: "header", title: "", lines: [] }];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/[\u00a0\t]/g, " ").replace(/[\u200b\u0000]/g, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    const heading = separator >= 0 ? line.slice(0, separator) : line;
    const kind = heading.length <= 65 ? sectionKind(heading) : null;
    if (kind) sections.push({ kind, title: heading, lines: separator >= 0 && line.slice(separator + 1).trim() ? [line.slice(separator + 1).trim()] : [] });
    else {
      const previous = sections[sections.length - 1];
      // Sidebar references can appear between work-history blocks in PDF order.
      if (/^\d{1,3}%$/.test(line) && sections.some(section => section.kind === "skills" && !section.lines.length) && previous.kind !== "skills") sections.push({ kind: "skills", title: "Skills", lines: [line] });
      else if ((previous.kind === "references" || /achievements/i.test(previous.title)) && /(?:limited|ltd|group|company|technologies)\b.*[-\u2013\u2014].*\b(?:manager|consultant|teller|officer|assistant)\b/i.test(line)) sections.push({ kind: "experience", title: "Work Experience", lines: [line] });
      else previous.lines.push(line);
    }
  }
  return sections;
}

export function readLocalCvSections(text: string): LocalCvSections {
  const sections = parseSections(text);
  const result: LocalCvSections = { summary: "", skills: "", experience: "", education: "", additional: "" };
  for (const kind of ["summary", "skills", "experience", "education"] as const) {
    const blocks = sections.filter(section => section.kind === kind);
    result[kind] = blocks.map(section => blocks.length > 1 ? `${section.title}\n${section.lines.join("\n")}` : section.lines.join("\n")).filter(Boolean).join("\n\n");
  }
  result.additional = sections.filter(section => ["additional", "references"].includes(section.kind)).map(section => `${section.title}\n${section.lines.join("\n")}`).join("\n\n");
  return result;
}

function cleanRole(line: string) {
  // Word tables sometimes join the bold role and the employer without a space.
  const separated = line.replace(/([A-Z]{3,})([A-Z][a-z])/g, "$1 | $2");
  const employerFirst = separated.match(/^(.*?)\s*[-\u2013\u2014]\s*(.+)$/);
  const role = employerFirst && /\b(?:limited|ltd|group|company|technologies)\b/i.test(employerFirst[1]) ? employerFirst[2] : separated;
  const title = role.split(/\s*[|\t]\s*|\s+at\s+/i)[0].replace(/^[\u2022\-\s]+/, "").trim();
  if (title.length < 4 || title.length > 100 || /[.!?]$/.test(title) || !roleWord.test(title)) return "";
  if (/^(?:supported|assisted|managed|coordinated|prepared|worked|provided|maintained|developed|handled|ensured|responsible|led|conducted|trained|monitored|participated)\b/i.test(title)) return "";
  return title;
}

function possibleName(line: string) {
  const name = line.replace(/^(?:cv|resume)\s*[-:]\s*/i, "").replace(/\s*[-|]\s*(?:cv|resume|curriculum vitae)$/i, "").trim();
  if (name.length < 5 || name.length > 80 || name.split(/\s+/).length < 2 || name.split(/\s+/).length > 7) return "";
  if (!/^[\p{L}\p{M} .'\u2019-]+$/u.test(name) || roleWord.test(name) || sectionKind(name)) return "";
  if (/\b(?:curriculum|vitae|resume|finance|accounting|procurement|operations|professional|registered|dietetics|nutrition|kenya|nairobi|limuru|kiambu|johannesburg|south africa|limited|company|university|college)\b/i.test(name)) return "";
  return name;
}

export function readLocalCvFields(text: string) {
  const sections = parseSections(text);
  const candidateSections = sections.filter(section => section.kind !== "references");
  const contactText = candidateSections.map(section => section.lines.join("\n")).join("\n");
  const header = [...sections[0].lines, ...candidateSections.filter(section => /contact|personal details/i.test(section.title)).flatMap(section => section.lines)];
  const contactHeader = header.join("\n");
  const phoneCandidates = contactHeader.match(/\+\d[\d ().-]{7,24}\d|\b(?:0|254|27|237)[\s().-]*\d[\d ().-]{6,20}\d\b/g) ?? [];
  const phone = phoneCandidates.find(value => { const digits = value.replace(/\D/g, ""); return digits.length >= 10 && digits.length <= 15; });
  const linkedIn = contactText.match(/(?:^|[\s(<])((?:https?:\/\/)?(?:www\.|[a-z]{2}\.)?linkedin\.com\/in\/[a-z0-9_%.-]+)/i)?.[1] ?? "";
  const stackedName = sections[0].lines.slice(0, 5).filter(line => /^[\p{L}\p{M}'\u2019-]{2,30}$/u.test(line) && !sectionKind(line) && !roleWord.test(line));
  const name = contactText.match(/^(?:full\s*name|name)\s*:\s*([^\n\r|]+)/im)?.[1]?.trim() || (stackedName.length >= 2 ? possibleName(stackedName.join(" ")) : "") || header.slice(0, 5).map(possibleName).find(Boolean) || "";
  const country = contactHeader.match(new RegExp(`(?:^|[,|\\s])(${countries})(?=$|[,|\\s])`, "i"))?.[1] ?? contactHeader.match(/(?:^|\n)(?:current\s+)?country\s*:\s*([^\n|]+)/i)?.[1]?.trim() ?? "";
  const locationLine = header.find(line => new RegExp(`[,|]\\s*(?:${countries})(?:$|\\s*[|])`, "i").test(line));
  const labelledCity = contactHeader.match(/(?:^|\n)(?:current\s+city|city|location|address|based in)\s*:\s*([^\n|]+)/i)?.[1]?.trim();
  const city = (labelledCity || locationLine?.split(/[,|]/)[0] || "").split(/[,|]/)[0].trim();
  const validCity = city.length <= 120 && !/\d|@|https?:|\b(?:email|phone|tel)\b/i.test(city) ? city : "";
  const roles = candidateSections.filter(section => section.kind === "experience").flatMap(section => section.lines.map(cleanRole)).filter(Boolean);
  const explicitTitles = contactText.match(/(?:^|\n)(?:target (?:job )?(?:titles|roles)|preferred (?:job )?(?:titles|roles)|desired (?:role|position))\s*:\s*([^\n]+)/i)?.[1];
  const targets = explicitTitles ? explicitTitles.split(/[,;|]/).map(s => s.trim()).filter(Boolean) : [...new Map(roles.map(role => [role.toLowerCase(), role])).values()].slice(0, 3);
  const preferredLocations = contactText.match(/(?:^|\n)preferred locations?\s*:\s*([^\n]+)/i)?.[1];
  const preferredIndustries = contactText.match(/(?:^|\n)(?:preferred industries|target industries)\s*:\s*([^\n]+)/i)?.[1];
  const summary = candidateSections.filter(section => section.kind === "summary").map(section => section.lines.join(" ")).join(" ");
  const years = summary.match(/\b((?:(?:over|more than|at least|approximately)\s+)?(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)\+?\s+years?)(?:\s+of)?(?:\s+(?:progressive|professional|relevant|combined|working|practical)){0,3}\s+experience\b/i)?.[1];
  const level = contactText.match(/(?:^|\n)experience level\s*:\s*([^\n]+)/i)?.[1]?.trim() || years || "";
  const arrangement = contactText.match(/(?:^|\n)(?:preferred\s+)?work (?:arrangement|preference)\s*:\s*(remote|hybrid|on-?site|flexible)/i)?.[1]?.toLowerCase();
  const remotePreference = arrangement?.startsWith("on") ? "onsite" : arrangement === "remote" || arrangement === "hybrid" ? arrangement : "flexible";
  const noticePeriod = contactText.match(/(?:^|\n)(?:notice period|availability|available from|earliest start)\s*:\s*([^\n|]+)/i)?.[1]?.trim() ?? "";
  const portfolio = contactText.match(/(?:portfolio|website|professional site)\s*:\s*((?:https?:\/\/|www\.)[^\s<>]+)/i)?.[1] ?? "";
  return {
    fullName: name, email: contactText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "",
    whatsappPhone: phone?.trim() ?? "", applicantLinkedinUrl: linkedIn ? `https://${linkedIn.replace(/^https?:\/\//i, "")}` : "",
    targetJobTitles: targets, preferredIndustries: preferredIndustries ? preferredIndustries.split(/[,;|]/).map(s => s.trim()).filter(Boolean) : [],
    preferredLocations: preferredLocations ? preferredLocations.split(/[,;|]/).map(s => s.trim()).filter(Boolean) : [],
    experienceLevel: level, remotePreference, currentCity: validCity, currentCountry: country, noticePeriod,
    portfolioUrl: portfolio ? (/^https?:/i.test(portfolio) ? portfolio : `https://${portfolio}`) : ""
  };
}
