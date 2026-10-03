import fs from 'node:fs';
import postgres from 'postgres';
const line = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find(x => x.startsWith('DIRECT_URL='));
const u = new URL(line.slice(11).trim().replace(/^"|"$/g, ''));
const db = postgres({host:u.hostname,port:Number(u.port),database:'postgres',username:decodeURIComponent(u.username),password:decodeURIComponent(u.password).replace(/^\[|\]$/g,''),ssl:'require',max:1,connect_timeout:10});
try {
  await db.begin(async sql => {
    await sql.unsafe(fs.readFileSync('supabase/migrations/20261003232447_job_hunting_ready_pool.sql', 'utf8'));
  });
  console.log(JSON.stringify(await db`select column_name,data_type from information_schema.columns where table_schema='public' and table_name='job_desk_vacancies' and column_name='application_readiness'`));
  console.log(JSON.stringify(await db`select relrowsecurity from pg_class where oid='public.job_desk_vacancies'::regclass`));
} finally {await db.end();}
