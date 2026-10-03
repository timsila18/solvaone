import { isOfficialApplyUrl } from "./vacancy-feeds";
import { leverPreflight } from "./lever-preflight";

export type PortalQuestion = { label: string; required?: boolean; fields?: { name: string; type: string; values?: { label: string; value: unknown }[] }[] };
export type SubmissionPreflight = { ready: boolean; blockers: string[]; checkedAt: string; fieldAnswers?: Record<string, string>; fieldSelections?: Record<string, string> };

export function normalizeQuestion(text: string) {
  return text.replace(/[✱*]/g, "").replace(/\s+Select\.\.\.$/i, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function verifiedAnswers(text: string) {
  const answers = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf(" = ");
    if (separator > 0 && line.slice(separator + 3).trim()) answers.set(normalizeQuestion(line.slice(0, separator)), line.slice(separator + 3).trim());
  }
  return answers;
}

export function reusableQuestionKey(label: string): string | null {
  const text = normalizeQuestion(label).replace(/[?.:]/g, "");
  // A narrow alias list prevents answers about one employer/country leaking into another.
  if (/^(?:what is your )?(?:notice period|availability to start|when can you start)$/.test(text)) return "notice_period";
  if (/^(?:your )?linkedin(?: profile)?(?: url| link)?$/.test(text)) return "linkedin_profile";
  if (/^(?:your )?(?:portfolio|personal website)(?: url| link)?$/.test(text)) return "website";
  if (/^(?:your )?(?:current location|where are you currently based|where do you currently live)$/.test(text)) return "current_location";
  if (/^(?:your )?(?:current city|city of residence)$/.test(text)) return "city";
  if (/^(?:your )?(?:current country|country of residence)$/.test(text)) return "country_of_residence";
  if (/^(?:your )?(?:professional summary|professional profile)$/.test(text)) return "professional_summary";
  if (/^(?:your )?(?:education history|educational background)$/.test(text)) return "education_history";
  if (/^(?:your )?(?:employment history|professional experience|work experience)$/.test(text)) return "employment_history";
  if (/^(?:your )?(?:skills|core competencies|technical skills)$/.test(text)) return "skills";
  return null;
}

function questionAnswer(question: PortalQuestion, answers: Map<string, string>, known: Record<string, string>) {
  const exact = answers.get(normalizeQuestion(question.label));
  if (exact) return exact;
  const key = reusableQuestionKey(question.label);
  if (key) {
    const reusable = [...answers].filter(([label]) => reusableQuestionKey(label) === key).map(([, value]) => value);
    if (new Set(reusable.map(normalizeQuestion)).size > 1) return undefined;
    const saved = reusable[0];
    if (saved) return saved;
    if (known[key]?.trim()) return known[key];
  }
  return (question.fields ?? []).map(field => known[field.name]).find(value => value?.trim());
}

export function missingPortalRequirements(questions: PortalQuestion[], answersText: string, known: Record<string, string>) {
  const answers = verifiedAnswers(answersText);
  return questions.filter(question => question.required).filter(question => {
    const fields = question.fields ?? [];
    if (fields.some(field => /^(resume|resume_text|cover_letter|cover_letter_text)$/.test(field.name))) return false;
    if (fields.some(field => field.type === "input_file")) return true;
    const answer = questionAnswer(question, answers, known);
    if (!answer) return true;
    const options = fields.flatMap(field => field.values ?? []);
    return options.length > 0 && !options.some(option => normalizeQuestion(option.label) === normalizeQuestion(answer));
  }).map(question => question.label);
}

export function canRetrySubmission(application: { status?: string; provider_response?: unknown } | null) {
  const evidence = application?.provider_response as { clicked?: boolean } | null;
  return application?.status === "needs_human" && evidence?.clicked === false;
}

export function applicationOutcome(application: { status?: string; method?: string; provider_message_id?: string | null; provider_response?: unknown } | null) {
  const evidence = application?.provider_response as { confirmation?: string; delivery?: { event?: string } } | null;
  if (evidence?.delivery?.event === "email.delivered") return "Delivered to employer mail server; employer review not confirmed";
  if (["email.bounced", "email.failed", "email.complained"].includes(evidence?.delivery?.event ?? "")) return "Email delivery problem: administrator review required";
  if (evidence?.delivery?.event === "email.delivery_delayed") return "Email delivery delayed";
  if (application?.status === "submitted" && evidence?.confirmation && application.method !== "email" && !application.provider_message_id) return "Confirmed submitted";
  if (application?.status === "submitted" && evidence?.confirmation && application.method === "email") return "Email send recorded by administrator; delivery not confirmed";
  if (application?.status === "submitted" && application?.provider_message_id) return "Email accepted by provider; employer receipt not confirmed";
  if (application?.status === "submitted") return "Awaiting submission evidence";
  if (application?.status === "sending") return "Awaiting employer confirmation";
  return "Needs admin action";
}

export async function submissionPreflight(input: { method: string; emailVerified?: boolean; applicationEmail?: string | null; provider?: string; siteToken?: string; url: string; answers: string; known: Record<string, string> }): Promise<SubmissionPreflight> {
  const checkedAt = new Date().toISOString();
  if (input.method === "email") {
    const blockers = input.emailVerified && input.applicationEmail ? [] : ["Employer application email must be verified against the official advert."];
    if (!process.env.RESEND_API_KEY || !(process.env.JOB_DESK_FROM_EMAIL ?? process.env.FROM_EMAIL)) blockers.push("Configure the verified application email sender.");
    return { ready: blockers.length === 0, blockers, checkedAt };
  }
  if (input.provider === "lever" && input.siteToken && isOfficialApplyUrl("lever", input.siteToken, input.url)) return leverPreflight({ ...input, siteToken: input.siteToken });
  if (input.provider !== "greenhouse" || !input.siteToken || !isOfficialApplyUrl("greenhouse", input.siteToken, input.url)) return { ready: false, blockers: ["Unsupported portal: use the prepared admin application packet."], checkedAt };
  const jobId = new URL(input.url).pathname.match(/\/jobs\/(\d+)/)?.[1];
  if (!jobId) return { ready: false, blockers: ["Cannot verify the official portal job ID."], checkedAt };
  const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(input.siteToken)}/jobs/${jobId}?questions=true`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!response.ok) throw new Error(`Official application requirements could not be checked (${response.status}).`);
  const job = await response.json() as { questions?: PortalQuestion[]; location_questions?: PortalQuestion[]; compliance?: PortalQuestion[]; data_compliance?: { requires_consent?: boolean; requires_processing_consent?: boolean; requires_retention_consent?: boolean }[]; demographic_questions?: { questions?: { required?: boolean; label: string }[] } };
  if (!Array.isArray(job.questions)) throw new Error("Employer did not provide a valid application requirements schema.");
  const blockers = missingPortalRequirements([...job.questions, ...(job.location_questions ?? []), ...(job.compliance ?? [])], input.answers, input.known);
  for (const question of job.demographic_questions?.questions ?? []) if (question.required && !verifiedAnswers(input.answers).has(normalizeQuestion(question.label))) blockers.push(question.label);
  if (job.data_compliance?.some(rule => rule.requires_consent || rule.requires_processing_consent || rule.requires_retention_consent)) blockers.push("Employer-specific privacy consent requires administrator review.");
  const answers = verifiedAnswers(input.answers);
  const fieldAnswers: Record<string, string> = {};
  const fieldSelections: Record<string, string> = {};
  for (const question of [...job.questions, ...(job.location_questions ?? []), ...(job.compliance ?? [])]) {
    const answer = questionAnswer(question, answers, input.known);
    const options = (question.fields ?? []).flatMap(field => field.values ?? []);
    if (answer && options.length && !options.some(option => normalizeQuestion(option.label) === normalizeQuestion(answer))) continue;
    if (answer && !blockers.includes(question.label)) for (const field of question.fields ?? []) {
      if (field.type !== "input_file") {
        fieldAnswers[field.name] = answer;
        const option = field.values?.find(option => normalizeQuestion(option.label) === normalizeQuestion(answer));
        if (option) fieldSelections[field.name] = String(option.value);
      }
    }
  }
  return { ready: blockers.length === 0, blockers: [...new Set(blockers)], checkedAt, fieldAnswers, fieldSelections };
}
