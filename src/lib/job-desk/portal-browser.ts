import { Sandbox } from "@vercel/sandbox";
import { Document, Packer, Paragraph } from "docx";
import { isOfficialApplyUrl } from "./vacancy-feeds";

export type PortalApplication = {
  url: string;
  siteToken: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  linkedinUrl?: string;
  city?: string;
  country?: string;
  coverLetter: string;
};

type PortalResult = { status: "submitted" | "needs_human"; reason?: string; confirmation?: string; finalUrl?: string; clicked?: boolean };

export function canAutomatePortal(provider: string, siteToken: string, url: string) {
  return provider === "greenhouse" && isOfficialApplyUrl("greenhouse", siteToken, url);
}

// The browser VM receives only this application's CV and contact details, never a database key.
const runner = String.raw`
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const data = JSON.parse(fs.readFileSync('/vercel/sandbox/application.json', 'utf8'));
let clicked = false;
function browser(...args) { return execFileSync('agent-browser', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 }).trim(); }
function evaluate(expression) {
  let value = browser('eval', expression);
  for (let i = 0; i < 2; i++) { try { value = JSON.parse(value); } catch { break; } }
  return value;
}
function hold(reason) { return { status: 'needs_human', reason, clicked }; }
function allowed(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && ['boards.greenhouse.io', 'job-boards.greenhouse.io'].includes(u.hostname) && u.pathname.split('/')[1].toLowerCase() === data.siteToken.toLowerCase(); }
  catch { return false; }
}
function inspect() { return evaluate("JSON.stringify({url:location.href,body:document.body.innerText.slice(0,12000),challenge:!!document.querySelector('iframe[src*=recaptcha],iframe[src*=hcaptcha],.h-captcha,.g-recaptcha'),fields:[...document.querySelectorAll('input,select,textarea')].filter(e=>e.getClientRects().length && e.type!=='hidden').map(e=>({tag:e.tagName,type:e.type,name:e.name,id:e.id,required:e.required||e.getAttribute('aria-required')==='true',label:(e.labels?.[0]?.innerText||e.parentElement?.parentElement?.innerText||'').trim().slice(0,160)}))})"); }
try {
  browser('open', data.url);
  let page = inspect();
  if (!allowed(page.url)) throw new Error('Application redirected outside the verified employer board.');
  if (page.challenge || /security challenge|verify you are human|complete (?:an? )?assessment|identity verification required/i.test(page.body)) throw new Error('The portal requires a challenge or assessment.');
  const values = { first_name: data.firstName, last_name: data.lastName, email: data.email, phone: data.phone, linkedin_profile: data.linkedinUrl, website: data.linkedinUrl };
  const handled = new Set();
  for (const field of page.fields) {
    const key = field.name || field.id;
    if (field.type === 'file' && /resume|cv/i.test(key + ' ' + field.label)) {
      browser('upload', field.name ? '[name="' + field.name + '"]' : '#' + field.id, '/vercel/sandbox/cv.docx');
      handled.add(key);
    } else if (field.type === 'file' && /cover.?letter/i.test(key + ' ' + field.label)) {
      browser('upload', field.name ? '[name="' + field.name + '"]' : '#' + field.id, '/vercel/sandbox/cover-letter.docx');
      handled.add(key);
    } else if (values[key] && ['text','email','tel','url',''].includes(field.type)) {
      browser('fill', field.name ? '[name="' + field.name + '"]' : '#' + field.id, values[key]);
      handled.add(key);
    }
  }
  if (![...handled].some(key => /resume|cv/i.test(key))) throw new Error('No supported CV upload field was found.');
  page = inspect();
  if (!allowed(page.url)) throw new Error('Application moved outside the verified employer board.');
  const unknown = page.fields.filter(f => (f.required || /\*\s*$/.test(f.label)) && !handled.has(f.name || f.id));
  if (unknown.length) throw new Error('Unanswered required questions: ' + unknown.map(f => f.label || f.name || f.id || 'unnamed field').join(', ').slice(0, 300));
  if (page.challenge || /security challenge|verify you are human|complete (?:an? )?assessment|identity verification required/i.test(page.body)) throw new Error('The portal requires a challenge or assessment.');
  const submit = evaluate("JSON.stringify([...document.querySelectorAll('button,input[type=submit]')].filter(e=>e.getClientRects().length && /submit application|apply now|submit/i.test((e.innerText||e.value||'').trim())).map(e=>({id:e.id,type:e.type,text:(e.innerText||e.value||'').trim()})))");
  if (!Array.isArray(submit) || submit.length !== 1 || submit[0].text.toLowerCase() !== 'submit application') throw new Error('No unambiguous application submission button.');
  clicked = true;
  browser('find', 'role', 'button', 'click', '--name', 'Submit application');
  browser('wait', '2000');
  page = inspect();
  if (!allowed(page.url)) throw new Error('Submission redirected outside the verified employer board; outcome needs review.');
  if (!/thank you for applying|application (?:was |has been )?submitted|we (?:have )?received your application/i.test(page.body)) throw new Error('Submission confirmation was not visible. Check the employer portal before retrying.');
  console.log(JSON.stringify({ status: 'submitted', confirmation: page.body.slice(0,500), finalUrl: page.url, clicked }));
} catch (error) {
  console.log(JSON.stringify(hold(error instanceof Error ? error.message.slice(0,500) : 'Portal application needs review.')));
} finally { try { browser('close'); } catch {} }
`;

async function checked(sandbox: Sandbox, cmd: string, args: string[]) {
  const result = await sandbox.runCommand({ cmd, args });
  if (result.exitCode !== 0) throw new Error(`Browser setup failed: ${cmd} (${(await result.stderr()).slice(0,250)})`);
}

export async function runPortalApplication(data: PortalApplication, cv: Buffer): Promise<PortalResult> {
  if (!canAutomatePortal("greenhouse", data.siteToken, data.url)) throw new Error("Unsupported or unverified portal URL.");
  if (!data.firstName || !data.lastName || !data.email || !data.phone) return { status: "needs_human", reason: "Candidate name, email or phone is missing." };
  const sandbox = await Sandbox.create({ runtime: "node24", timeout: 180000 });
  try {
    const coverLetter = await Packer.toBuffer(new Document({ sections: [{ children: data.coverLetter.split(/\r?\n/).map((line) => new Paragraph({ text: line })) }] }));
    await checked(sandbox, "sh", ["-c", "sudo dnf install -y nss nspr libxkbcommon atk at-spi2-atk libXcomposite libXdamage libXrandr mesa-libgbm libdrm alsa-lib pango cairo gtk3 >/dev/null"]);
    await checked(sandbox, "npm", ["install", "-g", "agent-browser"]);
    await checked(sandbox, "agent-browser", ["install"]);
    await sandbox.writeFiles([
      { path: "/vercel/sandbox/runner.cjs", content: Buffer.from(runner) },
      { path: "/vercel/sandbox/application.json", content: Buffer.from(JSON.stringify(data)) },
      { path: "/vercel/sandbox/cv.docx", content: cv },
      { path: "/vercel/sandbox/cover-letter.docx", content: coverLetter }
    ]);
    const result = await sandbox.runCommand({ cmd: "node", args: ["/vercel/sandbox/runner.cjs"] });
    const output = (await result.stdout()).trim().split("\n").at(-1);
    if (!output) return { status: "needs_human", reason: "Browser worker returned no confirmation. Check the employer portal before retrying.", clicked: true };
    const parsed = JSON.parse(output) as PortalResult;
    return parsed.status === "submitted" && parsed.confirmation ? parsed : { status: "needs_human", reason: parsed.reason ?? "Submission could not be verified.", clicked: parsed.clicked };
  } finally {
    await sandbox.stop();
  }
}
