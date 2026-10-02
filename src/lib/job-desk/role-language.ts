// Equivalent wording only; adjacent careers still require recorded authorization.
export function normalizeRoleLanguage(value: string) {
  return value.toLowerCase()
    .replace(/\bhr\b/g, "human resource")
    .replace(/\bhuman resources\b/g, "human resource")
    .replace(/\badmin(?:istrative)?\b/g, "administration")
    .replace(/\brecruiting\b/g, "recruitment");
}
