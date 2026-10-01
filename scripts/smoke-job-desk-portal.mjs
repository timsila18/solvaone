import { Sandbox } from "@vercel/sandbox";

const url = process.argv[2] ?? "https://job-boards.greenhouse.io/gitlab/jobs/8556658002";
if (!/^https:\/\/job-boards\.greenhouse\.io\/[a-z0-9_-]+\/jobs\/\d+$/i.test(url)) {
  throw new Error("Use a public Greenhouse job URL. This script never fills or submits a form.");
}

const sandbox = await Sandbox.create({ runtime: "node24", timeout: 180000 });
try {
  for (const [cmd, args] of [
    ["sh", ["-c", "sudo dnf install -y nss nspr libxkbcommon atk at-spi2-atk libXcomposite libXdamage libXrandr mesa-libgbm libdrm alsa-lib pango cairo gtk3 >/dev/null"]],
    ["npm", ["install", "-g", "agent-browser"]],
    ["agent-browser", ["install"]],
    ["agent-browser", ["open", url]]
  ]) {
    const result = await sandbox.runCommand({ cmd, args });
    if (result.exitCode !== 0) throw new Error(`${cmd} failed: ${(await result.stderr()).slice(-300)}`);
  }
  const expression = "JSON.stringify({url:location.href,fields:[...document.querySelectorAll('input,select,textarea')].filter(e=>e.getClientRects().length).map(e=>({name:e.name,id:e.id,type:e.type,required:e.required,label:e.labels?.[0]?.innerText?.slice(0,100)})),buttons:[...document.querySelectorAll('button,input[type=submit]')].filter(e=>e.getClientRects().length).map(e=>({id:e.id,text:e.innerText||e.value}))})";
  const result = await sandbox.runCommand({ cmd: "agent-browser", args: ["eval", expression] });
  if (result.exitCode !== 0) throw new Error((await result.stderr()).slice(-300));
  console.log(JSON.parse(await result.stdout()));
} finally {
  await sandbox.stop();
}
