import { createHash, randomBytes } from "node:crypto";
import { officialStep } from "./question-policy";
export { officialStep } from "./question-policy";

export type AssistedQuestion = { id: string; matchId: string; label: string; title: string; company: string; url: string; officialStep: boolean };
export type AnswerRequest = { batchId: string; cvId: string; questions: AssistedQuestion[]; expiresAt: string; savedAt?: string };

export function hashAnswerToken(token: string) {
  // Answer links cannot be used at either application-authorization endpoint.
  return createHash("sha256").update(`job-desk-answers:v1:${token}`).digest("hex");
}
export function createAnswerToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashAnswerToken(token) };
}
export function makeAssistedQuestion(matchId: string, label: string, vacancy: { title: string; company_name: string; apply_url: string }): AssistedQuestion {
  return { id: createHash("sha256").update(`${matchId}:${label}`).digest("hex"), matchId, label, title: vacancy.title, company: vacancy.company_name, url: vacancy.apply_url, officialStep: officialStep(label) };
}
export function readAnswerRequest(details: unknown): AnswerRequest | null {
  if (!details || typeof details !== "object") return null;
  const value = (details as { answerRequest?: AnswerRequest }).answerRequest;
  return value && typeof value.batchId === "string" && typeof value.cvId === "string" && Array.isArray(value.questions) && value.questions.length <= 80 && typeof value.expiresAt === "string" ? value : null;
}
export function validatedAnswers(questions: AssistedQuestion[], input: Record<string, string>) {
  const allowed = new Map(questions.map(question => [question.id, question]));
  const result: { matchId: string; question: string; answer: string }[] = [];
  for (const [id, text] of Object.entries(input)) {
    const question = allowed.get(id);
    if (!question || question.officialStep || officialStep(question.label)) throw new Error("An answer is not part of this factual questionnaire.");
    const answer = text.trim();
    if (!answer || answer.length > 2000 || /[\r\n\x00-\x1f]/.test(answer)) throw new Error("Use a single paragraph of up to 2,000 characters per answer.");
    result.push({ matchId: question.matchId, question: question.label.replace(/\s+/g, " ").trim(), answer });
  }
  if (!result.length || result.reduce((sum, item) => sum + item.answer.length, 0) > 20000) throw new Error("Provide at least one factual answer, within the answer size limit.");
  return result;
}
export type SavedAssistedAnswers = { cvId: string; savedAt: string; batchId: string; answers: { question: string; answer: string }[] };
export function answersForMatch(details: unknown, matchId: string, adminAnswers: string, cvId: string) {
  const record = (details as { assistedAnswers?: Record<string, SavedAssistedAnswers> } | null)?.assistedAnswers?.[matchId];
  const saved = record?.cvId === cvId ? record.answers : [];
  return [adminAnswers, ...saved.filter(item => !officialStep(item.question)).map(item => `${item.question} = ${item.answer}`)].filter(Boolean).join("\n");
}
