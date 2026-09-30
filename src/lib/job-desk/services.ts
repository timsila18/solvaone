export const jobDeskServices = {
  job_search_full: { name: "Online job hunting", price: 1500, description: "CV review, matching and supported application assistance" },
  interview_coaching: { name: "Interview coaching", price: 1000, description: "Role-specific interview preparation with our team" },
  linkedin_revamp: { name: "LinkedIn revamp", price: 1000, description: "Professional LinkedIn profile review and rewrite guidance" }
} as const;

export type PublicJobDeskService = keyof typeof jobDeskServices;

export function getJobDeskService(value: string) {
  return jobDeskServices[value as PublicJobDeskService] ?? null;
}
