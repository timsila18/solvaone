import fs from 'node:fs';
import postgres from 'postgres';
import { fetchEmailPage, parseEmailAdvert } from '../src/lib/job-desk/email-vacancy-feed.ts';
import { inspectRequirements } from '../src/lib/job-desk/ready-pool.ts';
const urls=process.argv.slice(2);
if (!urls.length) throw new Error('Supply published recruiter advert URLs');
const robots=await fetch('https://www.corporatestaffing.co.ke/robots.txt',{signal:AbortSignal.timeout(12000)});
if (!robots.ok || /^\s*Disallow:\s*\S+/im.test(await robots.text())) throw new Error('Crawl permission unavailable');
const line=fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith('DIRECT_URL='));
const u=new URL(line.slice(11).trim().replace(/^"|"$/g,''));
const db=postgres({host:u.hostname,port:Number(u.port),database:'postgres',username:decodeURIComponent(u.username),password:decodeURIComponent(u.password).replace(/^\[|\]$/g,''),ssl:'require',max:1,connect_timeout:10});
try {
  for (const url of urls) {
    const row=parseEmailAdvert(await fetchEmailPage(url),url);
    if (!row || row.status !== 'open' || row.review_status !== 'approved') {console.log(JSON.stringify({url,imported:false}));continue;}
    const readiness=await inspectRequirements({...row,id:'probe'});
    const { review_reasons, ...values } = row;
    const inserted=await db`insert into job_desk_vacancies ${db({...values,application_readiness:db.json(readiness)})}
      on conflict (provider,external_id) do update set description=excluded.description,last_seen_at=excluded.last_seen_at,application_email=excluded.application_email,email_verified=excluded.email_verified,application_readiness=excluded.application_readiness,status=excluded.status
      returning id,title,application_email,review_status`;
    console.log(JSON.stringify(inserted));
  }
} finally {await db.end();}
