import { normalizeRoleLanguage } from "./role-language";
import { generalJobFamilies, authorizedGeneralRole } from "./general-jobs";

const careers = [
  { roles: /accountant|accounting|accounts|bookkeep|finance|audit|billing|credit control/, titles: ["Accountant", "Accounts assistant", "Bookkeeper", "Billing officer", "Credit controller", "Payroll", "Audit trainee", "Finance assistant"] },
  { roles: /customer service|receptionist|call cent(?:er|re)/, titles: ["Customer service", "Customer success", "Receptionist", "Call centre agent", "Client relations", "Sales support"] },
  { roles: /human resource|payroll|recruitment|people operation/, titles: ["Human resources", "Payroll", "Recruitment", "People operations", "Personnel", "Administration", "Records clerk"] },
  { roles: /sales|marketing|business development|account management/, titles: ["Sales", "Marketing", "Business development", "Account manager", "Customer service", "Merchandiser", "Sales support"] },
  { roles: /administration|office|secretar|clerical|records/, titles: ["Administration", "Office assistant", "Receptionist", "Records clerk", "Data entry", "Operations coordinator"] },
  { roles: /teach|education|tutor|trainer/, titles: ["Teacher", "Tutor", "Trainer", "Education assistant", "Learning support"] },
  { roles: /hospitality|restaurant|waiter|housekeep|kitchen/, titles: ["Restaurant attendant", "Waiter", "Housekeeping attendant", "Kitchen assistant", "Customer service"] },
  { roles: /warehouse|logistics|dispatch|inventory|stock/, titles: ["Warehouse assistant", "Logistics", "Dispatch assistant", "Stock assistant", "Inventory", "Packing assistant"] }
];

type Scope = { targetRoles: string[]; includeAdjacentRoles?: boolean; includeBroaderRoles?: boolean; broaderRoles?: string[]; includeGeneralRoles?: boolean; generalRoleFamilies?: string[]; preferredLocations?: string[]; remotePreference?: string };
const generic = new Set(["and", "the", "for", "with", "senior", "junior", "officer", "manager", "assistant", "associate", "executive", "specialist"]);
const terms = (title: string): string[] => (normalizeRoleLanguage(title).match(/[a-z]{3,}/g) ?? []).filter(term => !generic.has(term));

export function acceptsAnySupportedBroaderRole(scope: { includeBroaderRoles?: boolean; broaderRoles?: string[] }) {
  return Boolean(scope.includeBroaderRoles && scope.broaderRoles?.some(role => /^(?:all|any|all roles|any role|any other|all suitable roles|any suitable role)$/i.test(role.trim())));
}

export function authorizedBroaderRole(scope: { includeBroaderRoles?: boolean; broaderRoles?: string[] }, title: string) {
  if (!scope.includeBroaderRoles) return false;
  if (acceptsAnySupportedBroaderRole(scope)) return true;
  const vacancyTerms = terms(title);
  return (scope.broaderRoles ?? []).some(role => terms(role).length > 0 && terms(role).every(term => vacancyTerms.includes(term)));
}

export function adjacentRoleTitles(scope: Scope) {
  if (!scope.includeAdjacentRoles && !acceptsAnySupportedBroaderRole(scope)) return [];
  const career = normalizeRoleLanguage(scope.targetRoles.join(" "));
  return [...new Set(careers.filter(group => group.roles.test(career)).flatMap(group => group.titles))];
}

export function authorizedAdjacentRole(scope: Scope, title: string) {
  const vacancyTerms = terms(title);
  return adjacentRoleTitles(scope).some(role => terms(role).length > 0 && terms(role).every(term => vacancyTerms.includes(term)));
}

export function searchLane(scope: Scope, title: string) {
  if (authorizedGeneralRole(scope, title)) return "general";
  if (scope.targetRoles.some(role => terms(role).length > 0 && terms(role).every(term => terms(title).includes(term)))) return "career";
  return authorizedAdjacentRole(scope, title) ? "adjacent" : "transferable";
}

export function searchLanePlan(scope: Scope) {
  return [
    { id: "career", label: "Career roles", titles: scope.targetRoles },
    { id: "adjacent", label: "Adjacent careers", titles: adjacentRoleTitles(scope) },
    { id: "transferable", label: "Accepted broader roles", titles: acceptsAnySupportedBroaderRole(scope) ? ["Any broader role supported by documented CV skills; mandatory requirements still apply"] : scope.includeBroaderRoles ? scope.broaderRoles ?? [] : [] },
    { id: "general", label: "General employment", titles: scope.includeGeneralRoles ? generalJobFamilies.filter(family => scope.generalRoleFamilies?.includes(family.id)).map(family => family.label) : [] }
  ].filter(lane => lane.titles.length);
}

export function balancedDiscoveryLinks(groups: string[][], limit = 100, window = 0) {
  if (limit <= 0) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  const rotated = groups.map(group => {
    if (!group.length) return [];
    const offset = (window * 10) % group.length;
    return [...group.slice(offset), ...group.slice(0, offset)];
  });
  for (let index = 0; index < Math.max(0, ...rotated.map(group => group.length)); index++) {
    for (const group of rotated) {
      const url = group[index];
      if (url && !seen.has(url)) { seen.add(url); result.push(url); }
      if (result.length === limit) return result;
    }
  }
  return result;
}
