import fs from 'node:fs';
import postgres from 'postgres';
const id = process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) throw new Error('Supply an order UUID');
const line = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find(x => x.startsWith('DIRECT_URL='));
const u = new URL(line.slice(11).trim().replace(/^"|"$/g, ''));
const db = postgres({host:u.hostname,port:Number(u.port),database:'postgres',username:decodeURIComponent(u.username),password:decodeURIComponent(u.password).replace(/^\[|\]$/g,''),ssl:'require',max:1,connect_timeout:10});
try {
  console.log(JSON.stringify(await db`select status,payment_status,application_authorized from job_desk_orders where id=${id}`));
  console.log(JSON.stringify(await db`select version,status from job_desk_documents where order_id=${id} order by version desc limit 3`));
  console.log(JSON.stringify(await db`select task_type,status,last_error from job_desk_tasks where order_id=${id} order by created_at desc limit 15`));
  console.log(JSON.stringify(await db`select v.title,v.apply_url,s.provider,s.active,m.status,a.status as application_status,a.error_message,a.provider_response from job_desk_matches m join job_desk_vacancies v on v.id=m.vacancy_id left join job_desk_sources s on s.id=v.source_id left join job_desk_applications a on a.match_id=m.id where m.order_id=${id}`));
} finally {await db.end();}
