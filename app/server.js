'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(__dirname, '..');
const STATIC = path.join(__dirname, 'public');
const DB_PATH = process.env.DATABASE_PATH || path.join(ROOT, 'data', 'ecodeploy.db');
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@ecodeploy.local').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ecodeploy-admin-change-me';
const intensity = {
  'North America': [72,68,63,60,58,62,75,94,121,138,149,144,136,128,118,111,105,99,93,88,82,78,75,73],
  Europe: [92,88,84,80,77,79,86,95,105,111,108,102,96,91,86,82,78,75,73,77,84,96,102,97],
  'Asia Pacific': [510,498,482,470,465,472,495,522,548,560,552,541,530,520,515,522,534,550,568,575,566,548,530,520]
};

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    salt TEXT NOT NULL, password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('admin','customer')),
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
    description TEXT NOT NULL, vcpu INTEGER NOT NULL, runtime INTEGER NOT NULL,
    hourly_rate REAL NOT NULL DEFAULT 0.04, active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES users(id),
    service_id TEXT REFERENCES services(id), service_name TEXT NOT NULL,
    category TEXT NOT NULL, region TEXT NOT NULL, vcpu INTEGER NOT NULL,
    runtime INTEGER NOT NULL, estimated_kg REAL NOT NULL,
    recommended_hour INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'Requested',
    admin_note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT REFERENCES users(id),
    action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS deployments_customer_idx ON deployments(customer_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS deployments_status_idx ON deployments(status, created_at DESC);
`);

const sessions = new Map();
const nowIso = () => new Date().toISOString();
const id = prefix => `${prefix}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
const seedSalt = crypto.randomBytes(16).toString('hex');
const seed = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL);
if (!seed) {
  const adminId = crypto.randomUUID();
  const hash = crypto.scryptSync(ADMIN_PASSWORD, seedSalt, 64).toString('hex');
  db.prepare('INSERT INTO users(id,email,name,salt,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(adminId, ADMIN_EMAIL, 'EcoDeploy Admin', seedSalt, hash, 'admin', nowIso());
}
const defaultServices = [
  ['web-api','Web API','Applications','A production-ready API service with a low-carbon deployment window.',2,3,0.052],
  ['build-runner','Build runner','Workers','On-demand CI workers for tests, builds, and release automation.',4,1,0.046],
  ['analytics-job','Analytics job','Data','Flexible data processing designed to run when regional grid intensity is lower.',6,2,0.041],
  ['preview-env','Preview environment','Applications','Short-lived review environment for pull requests and product demos.',2,4,0.055],
  ['scheduled-worker','Scheduled worker','Workers','Batch jobs and background tasks that can wait for a cleaner hour.',1,2,0.038]
];
for (const [serviceId,name,category,description,vcpu,runtime,hourlyRate] of defaultServices) {
  // Keep the catalog stable across restarts while allowing admin edits to persist.
  if (!db.prepare('SELECT id FROM services WHERE id=?').get(serviceId)) {
    db.prepare('INSERT INTO services(id,name,category,description,vcpu,runtime,hourly_rate,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(serviceId,name,category,description,vcpu,runtime,hourlyRate,nowIso());
  }
}

// One-time migration keeps the earlier file-based demo account and plans visible.
const legacyPath = path.join(ROOT,'data','store.json');
if (DB_PATH === path.join(ROOT,'data','ecodeploy.db')) {
  db.exec('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  if (!db.prepare("SELECT key FROM app_meta WHERE key='legacy_json_migrated'").get()) {
    try {
      const legacy=JSON.parse(fs.readFileSync(legacyPath,'utf8'));
      const migratedUsers=new Map();
      for(const user of legacy.users||[]){const email=String(user.email||'').toLowerCase();if(!email||!user.salt||!user.hash)continue;let existing=db.prepare('SELECT id FROM users WHERE email=?').get(email);if(!existing){const userId=crypto.randomUUID();db.prepare('INSERT INTO users(id,email,name,salt,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)').run(userId,email,String(user.name||'Developer'),user.salt,user.hash,'customer',user.createdAt||nowIso());existing={id:userId};}migratedUsers.set(email,existing.id);}
      const owner=legacy.users?.[0]&&migratedUsers.get(String(legacy.users[0].email||'').toLowerCase());
      if(owner)for(const p of legacy.plans||[]){const service=String(p.service||'Legacy deployment').slice(0,70);const region=Object.hasOwn(intensity,p.region)?p.region:'Europe';const carbon=estimate({region,workload:30,runtime:2});db.prepare('INSERT OR IGNORE INTO deployments(id,customer_id,service_name,category,region,vcpu,runtime,estimated_kg,recommended_hour,status,admin_note,created_at,updated_at) VALUES(?,?,?,\'Applications\',?,30,2,?,?,?,\'Migrated from the earlier EcoDeploy demo.\',?,?)').run(String(p.id||id('ED')),owner,service,region,carbon.recommended.kg,carbon.recommended.hour,validStatus(p.status)?p.status:'Requested',p.createdAt||nowIso(),p.createdAt||nowIso());}
    } catch {}
    db.prepare("INSERT OR IGNORE INTO app_meta(key,value) VALUES('legacy_json_migrated','yes')").run();
  }
}

function estimate(input = {}) {
  const region = Object.hasOwn(intensity, input.region) ? input.region : 'Europe';
  const workload = Math.max(1, Math.min(500, Number(input.workload) || 40));
  const runtime = Math.max(1, Math.min(24, Number(input.runtime) || 2));
  const rows = intensity[region].map((g, hour) => ({ hour, intensity: g, kg: +(workload * runtime * g / 1000).toFixed(3) }));
  const current = rows[new Date().getUTCHours()];
  const recommended = rows.reduce((a,b) => b.intensity < a.intensity ? b : a);
  const avoidedKg = Math.max(0, +(current.kg - recommended.kg).toFixed(3));
  return { region, workload, runtime, current, recommended, avoidedKg, savingsPercent: current.kg ? Math.round(avoidedKg / current.kg * 100) : 0, forecast: rows };
}
function record(actorId, action, detail) {
  db.prepare('INSERT INTO audit_events(actor_id,action,detail,created_at) VALUES(?,?,?,?)').run(actorId || null, action, detail, nowIso());
}
function send(res, status, data, extraHeaders = {}) {
  res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'x-content-type-options':'nosniff', 'cache-control':'no-store', ...extraHeaders });
  res.end(JSON.stringify(data));
}
function cookieOptions() { return { 'set-cookie':'ecodeploy_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }; }
function setSession(res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, user.id);
  return { 'set-cookie':`ecodeploy_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200` };
}
function currentUser(req) {
  const token = /(?:^|;\s*)ecodeploy_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  const userId = token && sessions.get(token);
  return userId ? db.prepare('SELECT id,email,name,role,active,created_at FROM users WHERE id=?').get(userId) : null;
}
function requireRole(req,res,roles) {
  const user = currentUser(req);
  if (!user || !user.active) { send(res,401,{error:'Sign in to continue.'}); return null; }
  if (roles && !roles.includes(user.role)) { send(res,403,{error:'This workspace is not available for your account.'}); return null; }
  return user;
}
function readBody(req) {
  return new Promise((resolve,reject)=>{
    let raw='';
    req.on('data',chunk=>{raw+=chunk;if(raw.length>1_000_000){reject(new Error('Request too large'));req.destroy();}});
    req.on('end',()=>{try{resolve(JSON.parse(raw||'{}'))}catch{reject(new Error('Invalid JSON'))}});
    req.on('error',reject);
  });
}
function validEmail(email) { return typeof email === 'string' && /^\S+@\S+\.\S+$/.test(email) && email.length <= 190; }
function validStatus(status) { return ['Requested','Approved','Scheduled','Deploying','Completed','Rejected','Cancelled','Failed'].includes(status); }
function orderRows(whereSql='', params=[]) {
  return db.prepare(`SELECT d.*,u.name customer_name,u.email customer_email FROM deployments d JOIN users u ON u.id=d.customer_id ${whereSql} ORDER BY d.created_at DESC`).all(...params);
}
function safeService(row) { return {id:row.id,name:row.name,category:row.category,description:row.description,vcpu:row.vcpu,runtime:row.runtime,hourlyRate:row.hourly_rate,active:Boolean(row.active)}; }
function safeDeployment(row) {
  return {id:row.id,service:row.service_name,category:row.category,region:row.region,vcpu:row.vcpu,runtime:row.runtime,estimatedKg:row.estimated_kg,recommendedHour:row.recommended_hour,status:row.status,note:row.admin_note,customer:row.customer_name,customerEmail:row.customer_email,createdAt:row.created_at,updatedAt:row.updated_at};
}

const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') { res.writeHead(204,{'access-control-allow-methods':'GET,POST,PATCH,OPTIONS','access-control-allow-headers':'content-type'}); return res.end(); }
  try {
    if (req.method==='GET' && url.pathname==='/api/health') return send(res,200,{status:'ok',service:'EcoDeploy',version:'2.0.0',storage:'sqlite'});
    if (req.method==='GET' && url.pathname==='/api/intensity') return send(res,200,{regions:Object.keys(intensity),forecast:intensity,source:'Illustrative regional profiles; not live grid data.'});
    if (req.method==='POST' && url.pathname==='/api/estimate') return send(res,200,estimate(await readBody(req)));
    if (req.method==='POST' && url.pathname==='/api/register') {
      const x=await readBody(req); const email=String(x.email||'').toLowerCase(); const name=String(x.name||'').trim().slice(0,70);
      if (!name || !validEmail(email) || String(x.password||'').length<10) return send(res,400,{error:'Enter a name, valid email, and password of at least 10 characters.'});
      if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) return send(res,409,{error:'An account with this email already exists.'});
      const user={id:crypto.randomUUID(),email,name,role:'customer',active:1,created_at:nowIso()}; const salt=crypto.randomBytes(16).toString('hex');
      db.prepare('INSERT INTO users(id,email,name,salt,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)').run(user.id,email,name,salt,crypto.scryptSync(x.password,salt,64).toString('hex'),'customer',user.created_at);
      record(user.id,'customer.registered',`${name} joined EcoDeploy.`);
      return send(res,201,{user:{id:user.id,email:user.email,name:user.name,role:user.role}},setSession(res,user));
    }
    if (req.method==='POST' && url.pathname==='/api/login') {
      const x=await readBody(req); const email=String(x.email||'').toLowerCase(); const user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
      const salt=user?.salt || 'ecodeploy-demo-unknown-user-salt'; const candidate=crypto.scryptSync(String(x.password||''),salt,64); const expected=user?Buffer.from(user.password_hash,'hex'):Buffer.alloc(64);
      if(!crypto.timingSafeEqual(candidate,expected)||!user||!user.active) return send(res,401,{error:'Email or password is incorrect.'});
      record(user.id,'auth.signed_in',`${user.name} signed in.`);
      return send(res,200,{user:{id:user.id,email:user.email,name:user.name,role:user.role}},setSession(res,user));
    }
    if (req.method==='POST' && url.pathname==='/api/logout') {
      const token=/(?:^|;\s*)ecodeploy_session=([^;]+)/.exec(req.headers.cookie||'')?.[1]; if(token)sessions.delete(token);
      return send(res,200,{ok:true},cookieOptions());
    }
    if (req.method==='GET' && url.pathname==='/api/me') {
      const user=currentUser(req); if(!user||!user.active)return send(res,200,{user:null});
      return send(res,200,{user:{id:user.id,email:user.email,name:user.name,role:user.role}});
    }
    if (req.method==='GET' && url.pathname==='/api/catalog') {
      const query=(url.searchParams.get('q')||'').toLowerCase();const category=url.searchParams.get('category')||'all';
      const rows=db.prepare('SELECT * FROM services WHERE active=1 ORDER BY category,name').all().filter(s=>(category==='all'||s.category.toLowerCase()===category.toLowerCase())&&(!query||`${s.name} ${s.category} ${s.description}`.toLowerCase().includes(query)));
      return send(res,200,{services:rows.map(safeService),categories:['All',...new Set(db.prepare('SELECT category FROM services WHERE active=1 ORDER BY category').all().map(x=>x.category))]});
    }
    if (req.method==='POST' && url.pathname==='/api/deployments') {
      const user=requireRole(req,res,['customer']);if(!user)return;
      const x=await readBody(req);if(!Array.isArray(x.items)||!x.items.length||x.items.length>12)return send(res,400,{error:'Add between 1 and 12 services to your deployment cart.'});
      const tx=db.prepare('INSERT INTO deployments(id,customer_id,service_id,service_name,category,region,vcpu,runtime,estimated_kg,recommended_hour,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,\'Requested\',?,?)');
      const created=[];db.exec('BEGIN IMMEDIATE');
      try { for(const item of x.items){const service=db.prepare('SELECT * FROM services WHERE id=? AND active=1').get(String(item.serviceId||''));if(!service)throw new Error('A selected service is no longer available. Refresh the catalog and try again.');const region=Object.hasOwn(intensity,item.region)?item.region:'Europe';const vcpu=Math.max(1,Math.min(500,Math.round(Number(item.vcpu)||service.vcpu)));const runtime=Math.max(1,Math.min(24,Math.round(Number(item.runtime)||service.runtime)));const carbon=estimate({region,workload:vcpu,runtime});const deploymentId=id('ED');const createdAt=nowIso();tx.run(deploymentId,user.id,service.id,service.name,service.category,region,vcpu,runtime,carbon.recommended.kg,carbon.recommended.hour,createdAt,createdAt);created.push({id:deploymentId,service:service.name,region,estimatedKg:carbon.recommended.kg,recommendedHour:carbon.recommended.hour,status:'Requested'});}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');return send(res,400,{error:e.message});}
      for(const item of created)record(user.id,'deployment.requested',`${item.id} · ${item.service} · ${item.region}.`);
      return send(res,201,{deployments:created});
    }
    if (req.method==='GET' && url.pathname==='/api/deployments') {
      const user=requireRole(req,res,['customer']);if(!user)return;
      return send(res,200,{deployments:orderRows('WHERE d.customer_id=?',[user.id]).map(safeDeployment)});
    }
    const cancelMatch=req.method==='PATCH'&&url.pathname.match(/^\/api\/deployments\/([A-Z0-9-]+)\/cancel$/i);
    if(cancelMatch){const user=requireRole(req,res,['customer']);if(!user)return;const existing=db.prepare('SELECT id,status FROM deployments WHERE id=? AND customer_id=?').get(cancelMatch[1],user.id);if(!existing)return send(res,404,{error:'Deployment request not found.'});if(!['Requested','Approved','Scheduled'].includes(existing.status))return send(res,409,{error:'This request can no longer be cancelled.'});db.prepare('UPDATE deployments SET status=\'Cancelled\',updated_at=? WHERE id=?').run(nowIso(),existing.id);record(user.id,'deployment.cancelled',`${existing.id} cancelled by customer.`);return send(res,200,{id:existing.id,status:'Cancelled'});}
    if (req.method==='GET' && url.pathname==='/api/admin/overview') {
      const admin=requireRole(req,res,['admin']);if(!admin)return;
      const metrics={customers:db.prepare("SELECT COUNT(*) n FROM users WHERE role='customer' AND active=1").get().n,awaiting:db.prepare("SELECT COUNT(*) n FROM deployments WHERE status='Requested'").get().n,inFlight:db.prepare("SELECT COUNT(*) n FROM deployments WHERE status IN ('Approved','Scheduled','Deploying')").get().n,completed:db.prepare("SELECT COUNT(*) n FROM deployments WHERE status='Completed'").get().n,avoidedKg:+db.prepare("SELECT COALESCE(SUM(estimated_kg),0) n FROM deployments WHERE status IN ('Scheduled','Deploying','Completed')").get().n.toFixed(2)};
      const deployments=orderRows().slice(0,40).map(safeDeployment);const services=db.prepare('SELECT * FROM services ORDER BY category,name').all().map(safeService);const customers=db.prepare("SELECT u.id,u.name,u.email,u.active,u.created_at,COUNT(d.id) deployment_count FROM users u LEFT JOIN deployments d ON d.customer_id=u.id WHERE u.role='customer' GROUP BY u.id ORDER BY u.created_at DESC").all();const events=db.prepare('SELECT e.id,e.action,e.detail,e.created_at,u.name actor FROM audit_events e LEFT JOIN users u ON u.id=e.actor_id ORDER BY e.id DESC LIMIT 12').all();
      return send(res,200,{metrics,deployments,services,customers,events:events.map(e=>({id:e.id,action:e.action,detail:e.detail,createdAt:e.created_at,actor:e.actor||'System'}))});
    }
    const adminStatusMatch=req.method==='PATCH'&&url.pathname.match(/^\/api\/admin\/deployments\/([A-Z0-9-]+)$/i);
    if(adminStatusMatch){const admin=requireRole(req,res,['admin']);if(!admin)return;const x=await readBody(req);if(!validStatus(x.status))return send(res,400,{error:'Choose a valid deployment status.'});const d=db.prepare('SELECT id,status FROM deployments WHERE id=?').get(adminStatusMatch[1]);if(!d)return send(res,404,{error:'Deployment request not found.'});const transitions={Requested:['Approved','Rejected','Cancelled'],Approved:['Scheduled','Rejected','Cancelled'],Scheduled:['Deploying','Cancelled'],Deploying:['Completed','Failed'],Failed:['Scheduled']};if(!transitions[d.status]?.includes(x.status))return send(res,409,{error:`Cannot move a ${d.status} request to ${x.status}.`});db.prepare('UPDATE deployments SET status=?,admin_note=?,updated_at=? WHERE id=?').run(x.status,String(x.note||'').trim().slice(0,500),nowIso(),d.id);record(admin.id,`deployment.${x.status.toLowerCase()}`,`${d.id}: ${d.status} → ${x.status}${x.note?` · ${String(x.note).slice(0,100)}`:''}.`);return send(res,200,{id:d.id,status:x.status});}
    const serviceMatch=req.method==='PATCH'&&url.pathname.match(/^\/api\/admin\/services\/([a-z0-9-]+)$/i);
    if(serviceMatch){const admin=requireRole(req,res,['admin']);if(!admin)return;const x=await readBody(req);const service=db.prepare('SELECT id FROM services WHERE id=?').get(serviceMatch[1]);if(!service)return send(res,404,{error:'Service not found.'});db.prepare('UPDATE services SET active=? WHERE id=?').run(x.active?1:0,service.id);record(admin.id,x.active?'catalog.activated':'catalog.paused',`${service.id} ${x.active?'activated':'paused'}.`);return send(res,200,{id:service.id,active:Boolean(x.active)});}
    if(req.method==='POST'&&url.pathname==='/api/admin/services'){const admin=requireRole(req,res,['admin']);if(!admin)return;const x=await readBody(req);const name=String(x.name||'').trim().slice(0,70);const category=String(x.category||'').trim().slice(0,40);const description=String(x.description||'').trim().slice(0,240);if(!name||!category||!description)return send(res,400,{error:'Name, category, and description are required.'});const serviceId=String(x.id||name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')).slice(0,60);if(!serviceId||db.prepare('SELECT id FROM services WHERE id=?').get(serviceId))return send(res,409,{error:'That service ID already exists.'});db.prepare('INSERT INTO services(id,name,category,description,vcpu,runtime,hourly_rate,created_at) VALUES(?,?,?,?,?,?,?,?)').run(serviceId,name,category,description,Math.max(1,Math.min(500,Number(x.vcpu)||2)),Math.max(1,Math.min(24,Number(x.runtime)||2)),Math.max(.001,Number(x.hourlyRate)||.04),nowIso());record(admin.id,'catalog.created',`${name} added to the catalog.`);return send(res,201,{id:serviceId,name,category});}
    const customerMatch=req.method==='PATCH'&&url.pathname.match(/^\/api\/admin\/customers\/([0-9a-f-]+)$/i);
    if(customerMatch){const admin=requireRole(req,res,['admin']);if(!admin)return;const x=await readBody(req);const customer=db.prepare("SELECT id,name,role FROM users WHERE id=? AND role='customer'").get(customerMatch[1]);if(!customer)return send(res,404,{error:'Customer account not found.'});db.prepare('UPDATE users SET active=? WHERE id=?').run(x.active?1:0,customer.id);record(admin.id,x.active?'customer.activated':'customer.suspended',`${customer.name} account ${x.active?'reactivated':'suspended'}.`);return send(res,200,{id:customer.id,active:Boolean(x.active)});}
    if(req.method==='GET'){
      const rel=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/, '');const file=path.resolve(STATIC,rel);
      if(!file.startsWith(STATIC+path.sep)&&file!==path.join(STATIC,'index.html'))return send(res,403,{error:'Forbidden'});
      try{const ext=path.extname(file);const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};res.writeHead(200,{'content-type':types[ext]||'application/octet-stream','x-content-type-options':'nosniff'});return res.end(fs.readFileSync(file));}catch{return send(res,404,{error:'Not found'});}
    }
    return send(res,404,{error:'Not found'});
  } catch(error) { return send(res,400,{error:error.message||'Request failed.'}); }
});

if(require.main===module)server.listen(PORT,'0.0.0.0',()=>console.log(`EcoDeploy listening on http://0.0.0.0:${PORT}; SQLite: ${DB_PATH}`));
module.exports={server,estimate,intensity,db};
