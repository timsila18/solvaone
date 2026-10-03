import fs from 'node:fs';
import postgres from 'postgres';
import { inspectRequirements } from '../src/lib/job-desk/ready-pool.ts';
const line = fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith('DIRECT_URL='));
const u = new URL(line.slice(11).trim().replace(/^"|"$/g,''));
const db = postgres({host:u.hostname,port:Number(u.port),database:'postgres',username:decodeURIComponent(u.username),password:decodeURIComponent(u.password).replace(/^\[|\]$/g,''),ssl:'require',max:1,connect_timeout:10});
try {
  if (process.argv.includes('--refresh')) {
    const rows = await db`select v.*,s.active,s.site_token,s.provider as source_provider from job_desk_vacancies v left join job_desk_sources s on s.id=v.source_id where v.status='open' and v.review_status='approved' and v.duplicate_of is null and v.last_seen_at > now()-interval '72 hours' and (v.application_method='email' or v.location ~* 'kenya|nairobi|mombasa') order by (v.application_method='email') desc,v.last_seen_at desc,v.id limit 24`;
    for (const row of rows) {
      const readiness = await inspectRequirements(row,row.site_token ? {active:row.active,provider:row.source_provider,site_token:row.site_token} : undefined);
      await db`update job_desk_vacancies set application_readiness=${db.json(readiness)} where id=${row.id} and apply_url=${row.apply_url} and description=${row.description}`;
      console.log(JSON.stringify({title:row.title,state:readiness.state,blockers:readiness.blockers.length}));
    }
  }
  console.log(JSON.stringify(await db`select coalesce(application_readiness->>'state','unchecked') as state,count(*) from job_desk_vacancies where status='open' and review_status='approved' and duplicate_of is null and last_seen_at>now()-interval '72 hours' group by 1`));
  console.log(JSON.stringify(await db`select relrowsecurity from pg_class where oid='public.job_desk_vacancies'::regclass`));
} finally {await db.end();}
