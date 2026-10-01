export type ApplicationScope = {
  version: 1;
  targetRoles: string[];
  preferredLocations: string[];
  remotePreference: "onsite" | "hybrid" | "remote" | "flexible";
  excludedEmployers: string[];
  excludedRoles: string[];
  excludedKeywords: string[];
  authorizedAt: string;
  channel: "website" | "admin_recorded";
  evidence: string;
};

type ScopeInput = Pick<ApplicationScope, "remotePreference" | "channel" | "evidence"> & {
  targetRoles: string;
  preferredLocations: string;
  excludedEmployers: string;
  excludedRoles: string;
  excludedKeywords: string;
};

const entries = (value: string) => value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 30);
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const terms = (value: string) => normalize(value).split(" ").filter((term) => term.length >= 3 && !["and", "the", "for", "with", "senior", "junior", "manager", "officer", "assistant", "associate", "executive", "specialist"].includes(term));

export function createApplicationScope(input: ScopeInput): ApplicationScope {
  const targetRoles = entries(input.targetRoles);
  if (!targetRoles.length) throw new Error("At least one target role is required for application authorization.");
  return {
    version: 1,
    targetRoles,
    preferredLocations: entries(input.preferredLocations),
    remotePreference: input.remotePreference,
    excludedEmployers: entries(input.excludedEmployers),
    excludedRoles: entries(input.excludedRoles),
    excludedKeywords: entries(input.excludedKeywords),
    authorizedAt: new Date().toISOString(),
    channel: input.channel,
    evidence: input.evidence.trim().slice(0, 1000)
  };
}

export function readApplicationScope(details: unknown): ApplicationScope | null {
  if (!details || typeof details !== "object") return null;
  const scope = (details as { applicationScope?: unknown }).applicationScope;
  if (!scope || typeof scope !== "object") return null;
  const value = scope as Partial<ApplicationScope>;
  if (value.version !== 1 || !Array.isArray(value.targetRoles) || !value.targetRoles.length ||
      !value.targetRoles.every((item) => typeof item === "string" && item.trim()) ||
      !Array.isArray(value.preferredLocations) || !Array.isArray(value.excludedEmployers) ||
      !Array.isArray(value.excludedRoles) || !Array.isArray(value.excludedKeywords) ||
      ![value.preferredLocations, value.excludedEmployers, value.excludedRoles, value.excludedKeywords].every((items) => items.every((item) => typeof item === "string" && item.trim())) ||
      !["onsite", "hybrid", "remote", "flexible"].includes(value.remotePreference ?? "") ||
      !value.authorizedAt || Number.isNaN(Date.parse(value.authorizedAt)) || !["website", "admin_recorded"].includes(value.channel ?? "")) return null;
  return value as ApplicationScope;
}

export function applicationScopeHold(scope: ApplicationScope, vacancy: {
  title: string; company_name: string; location: string; workplace_type: string; description: string;
}): string | null {
  const title = normalize(vacancy.title);
  const employer = normalize(vacancy.company_name);
  const location = normalize(vacancy.location);
  const advert = normalize(`${vacancy.title} ${vacancy.company_name} ${vacancy.description}`);
  if (scope.excludedEmployers.some((item) => employer.includes(normalize(item)))) return "Employer is excluded by the client.";
  if (scope.excludedRoles.some((item) => title.includes(normalize(item)))) return "Role is excluded by the client.";
  if (scope.excludedKeywords.some((item) => advert.includes(normalize(item)))) return "Vacancy conflicts with a client exclusion.";
  const vacancyTerms = terms(vacancy.title);
  if (!scope.targetRoles.some((role) => {
    const roleTerms = terms(role);
    const overlap = roleTerms.filter((term) => vacancyTerms.includes(term)).length;
    return roleTerms.length > 0 && overlap >= Math.min(2, roleTerms.length);
  })) return "Role is outside the client's authorized target roles.";
  if (scope.remotePreference !== "flexible" && vacancy.workplace_type !== scope.remotePreference) return `Client authorized ${scope.remotePreference} roles only.`;
  if (scope.preferredLocations.length && vacancy.workplace_type !== "remote" &&
      !scope.preferredLocations.some((item) => normalize(item) === "kenya" ? /\b(kenya|nairobi|mombasa|kisumu|nakuru|eldoret)\b/.test(location) : location.includes(normalize(item)))) {
    return "Location is outside the client's authorized locations.";
  }
  return null;
}
