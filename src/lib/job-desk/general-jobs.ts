export const generalJobFamilies = [
  { id: "retail", label: "Retail and shop support", titles: /\b(shop assistant|retail assistant|store assistant|cashier|sales attendant|supermarket attendant|shelf stacker|merchandiser)\b/i },
  { id: "hospitality", label: "Hospitality and restaurant support", titles: /\b(waiter|waitress|restaurant server|food and beverage server|kitchen assistant|kitchen steward|housekeeping attendant|room attendant|restaurant attendant)\b|^server$/i },
  { id: "warehouse", label: "Warehouse and packing", titles: /\b(warehouse assistant|warehouse attendant|packer|packing assistant|loader|dispatch assistant|stock assistant)\b/i },
  { id: "cleaning", label: "Cleaning and general support", titles: /\b(cleaner|cleaning attendant|general worker|office messenger|messenger|office runner)\b/i },
  { id: "customer_service", label: "Reception and customer service", titles: /\b(receptionist|reception assistant|front desk attendant|front desk assistant|customer service assistant|customer service representative|customer service executive|customer care representative|customer support representative|call cent(?:er|re) agent)\b/i },
  { id: "office_support", label: "Office and data-entry support", titles: /\b(office assistant|administrative assistant|clerical assistant|data entry clerk|records clerk)\b/i }
] as const;

export function generalRoleFamily(title: string) {
  // A general-job opt-in never authorizes specialist or managerial variants.
  if (/\b(senior|manager|supervisor|director|head|lead|chief|engineer|licensed|specialist)\b/i.test(title)) return null;
  return generalJobFamilies.find(family => family.titles.test(title))?.id ?? null;
}

export function authorizedGeneralRole(scope: { includeGeneralRoles?: boolean; generalRoleFamilies?: string[] }, title: string) {
  const family = generalRoleFamily(title);
  return Boolean(scope.includeGeneralRoles && family && scope.generalRoleFamilies?.includes(family));
}

export function entryLevelAdvert(description: string) {
  return /\b(no (?:prior |previous |work )?experience (?:is )?(?:required|necessary)|training (?:is |will be )?provided|on.the.job training|school leavers?|form (?:four|4)|kcse|secondary (?:school |education)|entry.level|unskilled)\b/i.test(description);
}

export function candidateHasSecondaryEducation(profile: Record<string, unknown>) {
  const structured = profile.structured_profile as { education?: unknown } | null;
  const evidence = JSON.stringify(structured?.education ?? []) + " " + String(profile.approvedCvText ?? "");
  return /\b(kcse|form (?:four|4)|secondary school|secondary education|kenya certificate of secondary education)\b/i.test(evidence);
}

export type SearchPathway = "career" | "transferable" | "general";
export function pathwayFromReasons(reasons: string[]) : SearchPathway {
  return reasons.some(reason => reason.startsWith("General-jobs pathway:")) ? "general" : reasons.some(reason => reason.startsWith("Transferable-skills match:")) ? "transferable" : "career";
}

export function completionHold(serviceType: string, successful: number) {
  return serviceType === "job_search_full" && successful < 10
    ? `Only ${successful} applications have delivery or portal-confirmation evidence. Keep the search active, or explicitly pause/cancel it; the ten-application service is not complete.`
    : null;
}
