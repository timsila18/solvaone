const ignored = new Set(["and", "the", "with", "for", "from", "have", "will", "your", "must", "our", "required", "experience", "years"]);
const terms = (value: string) => new Set((value.toLowerCase().replace(/<[^>]*>/g, " ").match(/[a-z]{3,}/g) ?? []).filter(word => !ignored.has(word)));

// Reorder approved evidence only. Never generate claims, replace a headline or alter chronology.
export function tailorApprovedCv<T extends { sections: { title: string; html: string }[] }>(cv: T, vacancy?: { title: string; description: string }) : T {
  if (!vacancy) return cv;
  const keywords = terms(`${vacancy.title} ${vacancy.title} ${vacancy.description}`);
  const relevance = (value: string) => [...terms(value)].filter(word => keywords.has(word)).length;
  const sections = cv.sections.map(section => {
    if (!/skills|competencies|expertise|technical tools/i.test(section.title)) return { ...section };
    const html = section.html.replace(/<ul\b([^>]*)>([\s\S]*?)<\/ul>/gi, (original, attributes: string, body: string) => {
      const items = [...body.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/gi)].map(item => item[0]);
      // Leave complex/nested lists untouched rather than risking lost text or invalid markup.
      if (!items.length || body.replace(/<li\b[^>]*>[\s\S]*?<\/li>/gi, "").trim() || /<(?:ul|ol)\b/i.test(body)) return original;
      return `<ul${attributes}>${items.sort((a, b) => relevance(b) - relevance(a)).join("")}</ul>`;
    });
    return { ...section, html };
  });
  const supporting = sections.filter(section => !/summary|profile|objective|experience|employment|education|personal|contact|referee|reference/i.test(section.title));
  supporting.sort((a, b) => relevance(b.html) - relevance(a.html));
  let index = 0;
  return { ...cv, sections: sections.map(section => supporting.includes(section) ? supporting[index++] : section) };
}
