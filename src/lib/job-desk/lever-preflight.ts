import { load } from "cheerio";
import { isOfficialApplyUrl } from "./vacancy-feeds";
import { normalizeQuestion, verifiedAnswers, type SubmissionPreflight } from "./submission-preflight";

export function leverFormPreflight(html: string, answersText: string, known: Record<string, string>): SubmissionPreflight {
  const q = load(html);
  const form = q("form#application-form");
  const blockers: string[] = [];
  const fieldAnswers: Record<string, string> = {};
  const fieldSelections: Record<string, string> = {};
  const answers = verifiedAnswers(answersText);
  const values: Record<string, string> = {
    name: [known.first_name, known.last_name].filter(Boolean).join(" "), email: known.email,
    phone: known.phone, "urls[LinkedIn]": known.linkedin_profile, "urls[Portfolio]": known.website,
  };
  if (form.length !== 1) blockers.push("The official Lever application form could not be verified.");
  if (form.find("iframe[src*=captcha],.h-captcha,.g-recaptcha,[data-sitekey]").length) blockers.push("The employer form requires a human security challenge.");
  const grouped = new Set<string>();
  form.find("input,textarea,select").each((_, element) => {
    const field = q(element);
    const name = field.attr("name") ?? "";
    const type = field.attr("type") ?? (element.tagName === "textarea" ? "textarea" : "text");
    if (!name || type === "hidden" || ["submit", "button"].includes(type) || field.attr("disabled") !== undefined) return;
    const label = (field.closest("li").find(".application-label").first().text() || field.closest("li").text() || name).replace(/[✱*]/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
    const required = field.attr("required") !== undefined || field.attr("aria-required") === "true" || /[✱*]/.test(field.closest("li").find(".application-label").text());
    if (type === "file") {
      if (name === "resume") return;
      if (required) blockers.push(label);
      return;
    }
    if (["checkbox", "radio"].includes(type)) {
      if (required && !grouped.has(name)) blockers.push(label);
      grouped.add(name);
      return;
    }
    const answer = values[name] || answers.get(normalizeQuestion(label));
    // Lever location uses a provider-backed autocomplete; free text alone is not proof of selection.
    if (name === "location") { if (required) blockers.push("Current location: employer autocomplete selection requires review."); return; }
    if (!answer) { if (required) blockers.push(label); return; }
    if (element.tagName === "select") {
      const options = field.find("option").filter((_, option) => normalizeQuestion(q(option).text()) === normalizeQuestion(answer));
      if (options.length !== 1 || !options.attr("value")) { if (required) blockers.push(label); return; }
      fieldSelections[name] = options.attr("value")!;
    }
    fieldAnswers[name] = answer;
  });
  if (!form.find('input[type="file"][name="resume"]').length) blockers.push("No supported CV upload field was found.");
  return { ready: blockers.length === 0, blockers: [...new Set(blockers)], checkedAt: new Date().toISOString(), fieldAnswers, fieldSelections };
}

export async function leverPreflight(input: { siteToken: string; url: string; answers: string; known: Record<string, string> }) {
  if (!isOfficialApplyUrl("lever", input.siteToken, input.url)) throw new Error("Unverified Lever application URL.");
  const url = new URL(input.url);
  if (!/^\/[a-zA-Z0-9_-]+\/[a-f0-9-]{36}(?:\/apply)?\/?$/i.test(url.pathname)) throw new Error("Cannot verify the official Lever job ID.");
  url.pathname = url.pathname.replace(/\/(?:apply)?$/, "").replace(/\/apply$/, "") + "/apply";
  url.search = "";
  const response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Official Lever form returned HTTP ${response.status}.`);
  const html = await response.text();
  if (html.length > 2000000) throw new Error("Official Lever form exceeded the safe size limit.");
  return leverFormPreflight(html, input.answers, input.known);
}
