import { Sandbox } from "@vercel/sandbox";
import { Document, Packer, Paragraph } from "docx";
import { isOfficialApplyUrl } from "./vacancy-feeds";

export type PortalApplication = {
  applicationId?: string;
  dryRun?: boolean;
  provider?: "greenhouse" | "lever";
  url: string;
  siteToken: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  linkedinUrl?: string;
  city?: string;
  country?: string;
  portalAnswers?: string;
  fieldAnswers?: Record<string, string>;
  fieldSelections?: Record<string, string>;
  portfolioUrl?: string;
  coverLetter: string;
};

export type PortalResult = { status: "submitted" | "needs_human"; reason?: string; confirmation?: string; finalUrl?: string; clicked?: boolean; testReady?: boolean };

export function canAutomatePortal(provider: string, siteToken: string, url: string) {
  return (provider === "greenhouse" || provider === "lever") && isOfficialApplyUrl(provider, siteToken, url);
}

// The browser VM receives only this application's CV and contact details, never a database key.
const runner = String.raw`
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const root = process.env.APPLICATION_WORKDIR || '/vercel/sandbox';
const data = JSON.parse(fs.readFileSync(root + '/application.json', 'utf8'));
let clicked = false;
function browser(...args) { return execFileSync('agent-browser', args, { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 }).trim(); }
function evaluate(expression) {
  let value = browser('eval', expression);
  for (let i = 0; i < 2; i++) { try { value = JSON.parse(value); } catch { break; } }
  return value;
}
function hold(reason) { return { status: 'needs_human', reason, clicked }; }
function allowed(url) {
  try { const u = new URL(url); const hosts = data.provider === 'lever' ? ['jobs.lever.co'] : ['boards.greenhouse.io', 'job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io']; return u.protocol === 'https:' && hosts.includes(u.hostname) && u.pathname.split('/')[1].toLowerCase() === data.siteToken.toLowerCase(); }
  catch { return false; }
}
function inspect() { return evaluate("JSON.stringify({url:location.href,body:document.body.innerText.slice(0,12000),challenge:!!document.querySelector('iframe[src*=recaptcha],iframe[src*=hcaptcha],.h-captcha,.g-recaptcha'),fields:[...document.querySelectorAll('input,select,textarea')].filter(e=>e.getClientRects().length && e.type!=='hidden').map(e=>({tag:e.tagName,type:e.type,name:e.name,id:e.id,required:e.required||e.getAttribute('aria-required')==='true',label:(e.labels?.[0]?.innerText||e.parentElement?.parentElement?.innerText||'').trim().slice(0,160)}))})"); }
try {
  browser('open', data.provider === 'lever' ? data.url.replace(/\/apply\/?$/, '').replace(/\/$/, '') + '/apply' : data.url);
  let page = inspect();
  if (!allowed(page.url)) throw new Error('Application redirected outside the verified employer board.');
  if (page.challenge || /security challenge|verify you are human|complete (?:an? )?assessment|identity verification required/i.test(page.body)) throw new Error('The portal requires a challenge or assessment.');
  const values = { first_name: data.firstName, last_name: data.lastName, name: data.firstName + ' ' + data.lastName, email: data.email, phone: data.phone, linkedin_profile: data.linkedinUrl, 'urls[LinkedIn]': data.linkedinUrl, 'urls[Portfolio]': data.portfolioUrl, website: data.portfolioUrl };
  const normalize = text => String(text || '').replace(/[✱*]/g, '').replace(/\s+Select\.\.\.$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const confirmedAnswers = new Map(String(data.portalAnswers || '').split(/\r?\n/).map(line => { const i = line.indexOf(' = '); return i > 0 ? [normalize(line.slice(0,i)), line.slice(i+3).trim()] : null; }).filter(Boolean));
  const handled = new Set();
  for (const field of page.fields) {
    const key = field.name || field.id;
    if (field.type === 'file' && /resume|cv/i.test(key + ' ' + field.label)) {
      browser('upload', field.name ? '[name="' + field.name + '"]' : '#' + field.id, root + '/cv.docx');
      handled.add(key);
    } else if (field.type === 'file' && /cover.?letter/i.test(key + ' ' + field.label)) {
      browser('upload', field.name ? '[name="' + field.name + '"]' : '#' + field.id, root + '/cover-letter.docx');
      handled.add(key);
    } else if (values[key] && ['text','email','tel','url',''].includes(field.type)) {
      browser('fill', field.name ? '[name="' + field.name + '"]' : '#' + field.id, values[key]);
      handled.add(key);
    }
  }
  for (const field of page.fields) {
    const key = field.name || field.id;
    if (!key || handled.has(key) || field.type === 'file') continue;
    const answer = data.fieldAnswers?.[key] || confirmedAnswers.get(normalize(field.label));
    if (!answer) continue;
    const selector = field.id ? '[id=' + JSON.stringify(field.id) + ']' : '[name=' + JSON.stringify(field.name) + ']';
    if (field.tag === 'SELECT') {
      browser('select', selector, data.fieldSelections?.[key] ?? answer);
    } else if (field.type === 'checkbox' || field.type === 'radio') {
      const selectedValue = data.fieldSelections?.[key];
      const actualValue = evaluate('JSON.stringify(document.querySelector(' + JSON.stringify(selector) + ')?.value)');
      if (selectedValue !== undefined ? actualValue !== selectedValue : normalize(field.label) !== normalize(answer) && !/^(yes|true|acknowledge|confirm)\b/i.test(answer)) continue;
      browser('check', selector);
    } else if (['text','email','tel','url','textarea',''].includes(field.type)) {
      browser('fill', selector, answer);
      const combo = evaluate('JSON.stringify(document.querySelector(' + JSON.stringify(selector) + ')?.getAttribute("role"))');
      if (combo === 'combobox') {
        browser('press', 'ArrowDown');
        browser('press', 'Enter');
      }
    } else continue;
    const expectedSelection = data.fieldSelections?.[key];
    const accepted = evaluate('JSON.stringify((()=>{const e=document.querySelector(' + JSON.stringify(selector) + '); if(!e)return false; if(e.type==="checkbox"||e.type==="radio")return e.checked; if(e.tagName==="SELECT")return !!e.value; if(e.getAttribute("role")==="combobox"){const hidden=[...document.querySelectorAll("input[type=hidden]")].find(h=>h.name===' + JSON.stringify(key) + '); return !!hidden?.value && (' + JSON.stringify(expectedSelection) + '===undefined || hidden.value===' + JSON.stringify(expectedSelection) + ');} return !!e.value;})())');
    if (accepted) handled.add(key);
  }
  if (![...handled].some(key => /resume|cv/i.test(key))) throw new Error('No supported CV upload field was found.');
  page = inspect();
  if (!allowed(page.url)) throw new Error('Application moved outside the verified employer board.');
  const completedGroups = evaluate("JSON.stringify([...document.querySelectorAll('input[type=checkbox],input[type=radio]')].filter(e=>e.checked && e.name).map(e=>e.name))");
  const unknown = page.fields.filter(f => (f.required || /[✱*]\s*$/.test(f.label)) && !handled.has(f.name || f.id) && !completedGroups.includes(f.name) && !( !f.name && !f.id && page.fields.some(other => other.id && handled.has(other.id) && normalize(other.label) === normalize(f.label))));
  const questions = [...new Set(unknown.map(f => normalize(f.label) || f.name || f.id || 'unnamed field'))];
  if (questions.length) throw new Error('Admin action needed: supply verified answers or required documents for ' + questions.join('; ').slice(0, 900));
  if (page.challenge || /security challenge|verify you are human|complete (?:an? )?assessment|identity verification required/i.test(page.body)) throw new Error('The portal requires a challenge or assessment.');
  const submit = evaluate("JSON.stringify([...document.querySelectorAll('button,input[type=submit]')].filter(e=>e.getClientRects().length && /submit application|apply now|submit/i.test((e.innerText||e.value||'').trim())).map(e=>({id:e.id,type:e.type,text:(e.innerText||e.value||'').trim()})))");
  if (!Array.isArray(submit) || submit.length !== 1 || submit[0].text.toLowerCase() !== 'submit application') throw new Error('No unambiguous application submission button.');
  if (data.dryRun) {
    console.log(JSON.stringify({ status: 'needs_human', testReady: true, reason: 'Test passed: required fields and documents completed. Submission intentionally disabled.', finalUrl: page.url, clicked: false }));
  } else {
  clicked = true;
  browser('find', 'role', 'button', 'click', '--name', 'Submit application');
  browser('wait', '2000');
  page = inspect();
  if (!allowed(page.url)) throw new Error('Submission redirected outside the verified employer board; outcome needs review.');
  const confirmation = page.body.match(/.{0,80}(?:thank you for applying|application (?:was |has been )?submitted|we (?:have )?received your application).{0,200}/i)?.[0];
  const stillHasSubmit = evaluate("JSON.stringify([...document.querySelectorAll('button,input[type=submit]')].some(e=>e.getClientRects().length && /submit application/i.test(e.innerText||e.value||'')))");
  if (!confirmation || stillHasSubmit) throw new Error('Submission confirmation was not visible. Check the employer portal before retrying.');
  console.log(JSON.stringify({ status: 'submitted', confirmation, finalUrl: page.url, clicked }));
  }
} catch (error) {
  console.log(JSON.stringify(hold(error instanceof Error ? error.message.slice(0,500) : 'Portal application needs review.')));
} finally { try { browser('close'); } catch {} }
`;

async function checked(sandbox: Sandbox, cmd: string, args: string[]) {
  const result = await sandbox.runCommand({ cmd, args });
  if (result.exitCode !== 0) throw new Error(`Browser setup failed: ${cmd} (${(await result.stderr()).slice(0,250)})`);
}

export async function runPortalApplication(data: PortalApplication, cv: Buffer): Promise<PortalResult> {
  if (!canAutomatePortal(data.provider ?? "greenhouse", data.siteToken, data.url)) throw new Error("Unsupported or unverified portal URL.");
  if (!data.firstName || !data.lastName || !data.email || !data.phone) return { status: "needs_human", reason: "Candidate name, email or phone is missing." };
  const coverLetter = await Packer.toBuffer(new Document({ sections: [{ children: data.coverLetter.split(/\r?\n/).map((line) => new Paragraph({ text: line })) }] }));
  if (process.env.APPLICATION_AGENT_URL) {
    const { runDedicatedApplication } = await import("./application-agent");
    return runDedicatedApplication(data, cv, coverLetter);
  }
  const sandbox = await Sandbox.create({ runtime: "node24", timeout: 180000 });
  try {
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
