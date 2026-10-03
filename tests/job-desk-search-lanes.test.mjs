import assert from "node:assert/strict";
import test from "node:test";
import { adjacentRoleTitles, balancedDiscoveryLinks, searchLanePlan } from "../src/lib/job-desk/search-lanes.ts";
import { applicationScopeHold, createApplicationScope, readApplicationScope } from "../src/lib/job-desk/application-scope.ts";
import { scoreVacancy } from "../src/lib/job-desk/matching.ts";

const input = { targetRoles: "HR Officer", preferredLocations: "Nairobi", remotePreference: "flexible", excludedEmployers: "Excluded Employer", excludedRoles: "Director", excludedKeywords: "unpaid", channel: "admin_recorded", evidence: "Client accepts broader career work" };
const vacancy = { title: "Records Clerk", company_name: "Employer", location: "Kisumu, Kenya", workplace_type: "onsite", description: "Records management using Microsoft Excel" };

test("adjacent and country-wide expansion require opt-in and retain exclusions", () => {
  const original = createApplicationScope(input);
  assert.deepEqual(adjacentRoleTitles(original), []);
  assert.ok(applicationScopeHold(original, vacancy));
  const broad = createApplicationScope({ ...input, includeAdjacentRoles: "true", includeKenyaWide: "true" });
  assert.equal(applicationScopeHold(broad, vacancy), null);
  assert.ok(scoreVacancy(vacancy, { structured_profile: { skills: ["Records management"] } }, broad).score >= 25);
  assert.equal(scoreVacancy(vacancy, { structured_profile: { skills: [] } }, broad).score, 0);
  assert.match(applicationScopeHold(broad, { ...vacancy, company_name: "Excluded Employer" }), /excluded/);
  assert.match(applicationScopeHold(broad, { ...vacancy, title: "Software Engineer" }), /outside/);
  assert.match(applicationScopeHold(broad, { ...vacancy, location: "Lagos, Nigeria" }), /Location/);
  assert.equal(readApplicationScope({ applicationScope: { ...broad, includeAdjacentRoles: "yes" } }), null);
});

test("enabled career, adjacent, named broader and general lanes all run together", () => {
  const scope = createApplicationScope({ ...input, includeAdjacentRoles: "true", includeBroaderRoles: "true", broaderRoles: "Office coordinator", includeGeneralRoles: "true", generalRoleFamilies: "retail,office_support" });
  assert.deepEqual(searchLanePlan(scope).map(lane => lane.id), ["career", "adjacent", "transferable", "general"]);
});

test("discovery budgets are shared across categories and rotate older adverts", () => {
  const first = Array.from({ length: 40 }, (_, i) => `hr-${i}`);
  const second = Array.from({ length: 40 }, (_, i) => `retail-${i}`);
  const selected = balancedDiscoveryLinks([first, second, [first[0], "shared"]], 20);
  assert.equal(new Set(selected).size, 20);
  assert.ok(selected.some(url => url.startsWith("retail")));
  assert.ok(selected.includes("shared"));
  assert.equal(balancedDiscoveryLinks([first], 5, 1)[0], "hr-10");
  assert.deepEqual(balancedDiscoveryLinks([], 100), []);
});
