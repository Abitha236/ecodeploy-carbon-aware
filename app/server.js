'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(__dirname, '..');
const STORE = path.join(ROOT, 'data', 'store.json');
const STATIC = path.join(__dirname, 'public');
const intensity = { 'North America': [72,68,63,60,58,62,75,94,121,138,149,144,136,128,118,111,105,99,93,88,82,78,75,73], Europe: [92,88,84,80,77,79,86,95,105,111,108,102,96,91,86,82,78,75,73,77,84,96,102,97], 'Asia Pacific': [510,498,482,470,465,472,495,522,548,560,552,541,530,520,515,522,534,550,568,575,566,548,530,520] };
function load() { try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return { users: [], plans: [] }; } }
function save(db) { fs.mkdirSync(path.dirname(STORE), { recursive: true }); fs.writeFileSync(STORE, JSON.stringify(db, null, 2)); }
function send(res, status, body, type='application/json; charset=utf-8') { res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*', 'x-content-type-options':'nosniff' }); res.end(type.startsWith('application/json') ? JSON.stringify(body) : body); }
function body(req) { return new Promise((resolve, reject) => { let raw=''; req.on('data', c => { raw += c; if (raw.length > 1e6) reject(new Error('Request too large')); }); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); }); }
function estimate(input) {
  const region = Object.hasOwn(intensity, input.region) ? input.region : 'Europe';
  const workload = Math.max(1, Math.min(500, Number(input.workload) || 40));
  const runtime = Math.max(1, Math.min(24, Number(input.runtime) || 2));
  const baseHour = new Date().getUTCHours();
  const rows = intensity[region].map((g, hour) => ({ hour, intensity: g, kg: +(workload * runtime * g / 1000).toFixed(3) }));
  const now = rows[baseHour], best = rows.reduce((a,b) => b.intensity < a.intensity ? b : a);
  const avoided = Math.max(0, +(now.kg - best.kg).toFixed(3));
  return { region, workload, runtime, current: now, recommended: best, avoidedKg: avoided, savingsPercent: now.kg ? Math.round(avoided / now.kg * 100) : 0, forecast: rows, source: 'Illustrative regional hourly intensity profile (gCO₂e/kWh); replace with a live grid API for production.' };
}
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, {'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'}); return res.end(); }
  if (req.method === 'GET' && url.pathname === '/api/health') return send(res,200,{status:'ok',service:'EcoDeploy',version:'1.0.0'});
  if (req.method === 'GET' && url.pathname === '/api/intensity') return send(res,200,{regions:Object.keys(intensity),forecast:intensity});
  if (req.method === 'POST' && url.pathname === '/api/estimate') { try { return send(res,200,estimate(await body(req))); } catch(e) { return send(res,400,{error:e.message}); } }
  if (req.method === 'POST' && url.pathname === '/api/register') { try { const x=await body(req); if (!/^\S+@\S+\.\S+$/.test(x.email||'') || (x.password||'').length<8) return send(res,400,{error:'Use a valid email and a password with at least 8 characters.'}); const db=load(); if(db.users.some(u=>u.email===x.email.toLowerCase())) return send(res,409,{error:'An account with this email already exists.'}); const salt=crypto.randomBytes(16).toString('hex'); db.users.push({email:x.email.toLowerCase(),name:String(x.name||'Developer').slice(0,70),salt,hash:crypto.scryptSync(x.password,salt,64).toString('hex'),createdAt:new Date().toISOString()}); save(db); return send(res,201,{message:'Account created. Your profile stays on this server.',name:String(x.name||'Developer').slice(0,70)}); } catch(e) { return send(res,400,{error:e.message}); } }
  if (req.method === 'POST' && url.pathname === '/api/login') { try { const x=await body(req); const db=load(); const user=db.users.find(u=>u.email===String(x.email||'').toLowerCase()); const salt=user?.salt || 'ecodeploy-auth-fallback-salt'; const candidate=crypto.scryptSync(String(x.password||''),salt,64); const expected=user ? Buffer.from(user.hash,'hex') : Buffer.alloc(64); if(!crypto.timingSafeEqual(candidate,expected) || !user) return send(res,401,{error:'Email or password is incorrect.'}); return send(res,200,{message:'Signed in for this demo.',name:user.name}); } catch(e) { return send(res,400,{error:e.message}); } }
  if (req.method === 'POST' && url.pathname === '/api/plan') { try { const x=await body(req); const plan={id:crypto.randomUUID(),service:String(x.service||'web-api').slice(0,60),region:String(x.region||'Europe'),window:String(x.window||'low-carbon window'),status:'Scheduled',createdAt:new Date().toISOString()}; const db=load(); db.plans.unshift(plan); db.plans=db.plans.slice(0,100); save(db); return send(res,201,plan); } catch(e) { return send(res,400,{error:e.message}); } }
  if (req.method==='GET' && url.pathname==='/api/plans') return send(res,200,{plans:load().plans});
  if (req.method==='GET') { const rel=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/, ''); const file=path.resolve(STATIC,rel); if(!file.startsWith(STATIC+path.sep) && file!==path.join(STATIC,'index.html')) return send(res,403,{error:'Forbidden'}); try { const ext=path.extname(file); const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'}; return send(res,200,fs.readFileSync(file),types[ext]||'application/octet-stream'); } catch { return send(res,404,{error:'Not found'}); } }
  return send(res,404,{error:'Not found'});
});
if (require.main===module) server.listen(PORT,'0.0.0.0',()=>console.log(`EcoDeploy listening on http://0.0.0.0:${PORT}`));
module.exports={server,estimate,intensity};
