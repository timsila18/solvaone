// Equivalent wording only; adjacent careers still require recorded authorization.
export function normalizeRoleLanguage(value: string) {
  return value.toLowerCase()
    .replace(/\bhr\b/g, "human resource")
    .replace(/\bhuman resources\b/g, "human resource")
    .replace(/\badmin(?:istrative)?\b/g, "administration")
    .replace(/\brecruiting\b|\btalent acquisition\b/g, "recruitment")
    .replace(/\bcustomer (?:care|support|experience|relations)\b|\bclient (?:care|support|service)\b/g, "customer service")
    .replace(/\bfront[ -]?desk\b|\breception(?:\s+officer|\s+assistant)?\b/g, "receptionist")
    .replace(/\b(?:fuel|service|filling|gas) station\b/g, "petrol station")
    .replace(/\bsales (?:representative|rep|consultant)\b/g, "sales executive")
    .replace(/\b(?:personnel|human capital)\b/g, "human resource")
    .replace(/\bpayroll (?:processing|administration|management)\b/g, "payroll");
}
