import fs from 'node:fs';
import postgres from 'postgres';
const id=process.argv[2];
if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) throw new Error('Supply an order UUID');
const line=fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith('DIRECT_URL='));
const u=new URL(line.slice(11).trim().replace(/^"|"$/g,''));
const db=postgres({host:u.hostname,port:Number(u.port),database:'postgres',username:decodeURIComponent(u.username),password:decodeURIComponent(u.password).replace(/^\[|\]$/g,''),ssl:'require',max:1,connect_timeout:10});
try {
  console.log(JSON.stringify(await db`select c.email from job_desk_orders o join job_desk_clients c on c.id=o.client_id where o.id=${id}`));
  console.log(JSON.stringify(await db`select id,payload->>'event' as event,status,attempts,last_error,result,created_at,available_at from job_desk_tasks where order_id=${id} and task_type='notify_client' order by created_at`));
  console.log(JSON.stringify(await db`select status,count(*) from job_desk_tasks where task_type='notify_client' group by status`));
} finally {await db.end();}
