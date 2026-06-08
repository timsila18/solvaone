const injectionPatterns = [
  /ignore (all )?(previous|above|prior) instructions/i,
  /system prompt/i,
  /developer message/i,
  /reveal.*(api|key|secret|prompt)/i,
  /jailbreak/i,
  /act as/i,
  /bypass/i
];

export function sanitizeText(value: unknown, maxLength = 12000): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .slice(0, maxLength)
    .trim();
}

export function sanitizePayload(payload: Record<string, unknown>, maxFieldLength = 12000) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (typeof value === "string") return [key, sanitizeText(value, maxFieldLength)];
      if (Array.isArray(value)) return [key, value.map((item) => (typeof item === "string" ? sanitizeText(item, maxFieldLength) : item))];
      return [key, value];
    })
  );
}

export function hasPromptInjectionRisk(payload: Record<string, unknown>) {
  const flat = JSON.stringify(payload).slice(0, 50000);
  return injectionPatterns.some((pattern) => pattern.test(flat));
}

export function stripUnsafeHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

export function sectionsToHtml(sections: { title: string; html: string }[]) {
  return sections
    .map((section) => `<section data-solva-section="${section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}"><h2>${section.title}</h2>${section.html}</section>`)
    .join("\n");
}
