// Multi-device QA harness for mission/index.html
// - Serves the local HTML at the production URL via route interception
// - Replaces supabase-js with an in-memory fake shared across "devices" (browser contexts)
// - Realtime is simulated: every upsert is pushed to all other subscribed devices
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'mission', 'index.html'), 'utf8');
const URL_ = 'https://amenowa.github.io/home/mission/';

// ---------- fake server ----------
const server = { users: {}, rows: {}, pages: new Set() };
function uid(email) { return 'uid-' + email; }

const FAKE_SB = `
window.supabase = { createClient(){
  const listeners=[]; let session=null;
  try{ session=JSON.parse(localStorage.getItem('__fake_session')||'null'); }catch(e){}
  const setSession=(s)=>{ session=s; try{ if(s) localStorage.setItem('__fake_session',JSON.stringify(s)); else localStorage.removeItem('__fake_session'); }catch(e){} };
  const q = (table)=>({
    select(){ return { eq(_k,uidv){ return { async maybeSingle(){ const r=await window.__srv('get',{uid:uidv}); return {data:r?{data:r.data}:null, error:null}; } }; } }; },
    async upsert(row){ if(!session||session.user.id!==row.user_id) return {error:{message:'rls'}}; await window.__srv('upsert',{uid:row.user_id,data:row.data,updated_at:row.updated_at}); return {error:null}; }
  });
  return {
    from: q,
    auth: {
      async getSession(){ return {data:{session}}; },
      onAuthStateChange(fn){ listeners.push(fn); },
      async signInWithPassword({email,password}){ const r=await window.__srv('signin',{email,password}); if(r.error) return {error:{message:r.error}}; setSession({user:{id:r.uid,email}}); listeners.forEach(f=>f('SIGNED_IN',session)); return {data:{session},error:null}; },
      async signUp({email,password}){ const r=await window.__srv('signup',{email,password}); if(r.error) return {data:{},error:{message:r.error}}; if(r.exists) return {data:{user:{identities:[]}},error:null}; return {data:{user:{identities:[1]},session:null},error:null}; },
      async signOut(){ setSession(null); listeners.forEach(f=>f('SIGNED_OUT',null)); }
    },
    channel(){ return { on(_a,_b,fn){ window.__rt=fn; return this; }, subscribe(){ window.__rtOn=true; return this; } }; }
  };
}};`;

async function srv(page, op, a) {
  if (op === 'signup') { if (server.users[a.email]) return { exists: true }; server.users[a.email] = { password: a.password, uid: uid(a.email) }; return {}; }
  if (op === 'signin') { const u = server.users[a.email]; if (!u || u.password !== a.password) return { error: 'Invalid login credentials' }; return { uid: u.uid }; }
  if (op === 'get') { return server.rows[a.uid] || null; }
  if (op === 'upsert') {
    server.rows[a.uid] = { data: a.data, updated_at: a.updated_at };
    for (const p of server.pages) if (p !== page && !p.isClosed()) {
      p.evaluate(r => { if (window.__rtOn && window.__rt) window.__rt({ new: r }); }, { user_id: a.uid, data: a.data }).catch(() => {});
    }
    return {};
  }
}

async function launch() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  return browser;
}

async function newDevice(browser, name, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 } });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(URL_)) return route.fulfill({ status: 200, contentType: 'text/html', body: HTML });
    if (u.includes('jsdelivr')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    if (u.includes('fonts.g')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await ctx.newPage();
  page.__name = name;
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.exposeFunction('__srv', (op, a) => srv(page, op, a));
  await page.addInitScript(FAKE_SB);
  server.pages.add(page);
  return page;
}
async function open(page) { await page.goto(URL_); await page.waitForTimeout(300); }
async function reload(page) { await page.reload(); await page.waitForTimeout(300); }

// ---- UI helpers ----
async function signup(page, email, pass) { await page.click('#goUp'); await page.fill('#upEmail', email); await page.fill('#upPass', pass); await page.fill('#upPass2', pass); await page.click('#lgUp'); await page.waitForTimeout(200); return page.locator('#lgMsg').textContent(); }
async function login(page, email, pass) { await page.click('#goIn'); await page.fill('#lgEmail', email); await page.fill('#lgPass', pass); await page.click('#lgIn'); await page.waitForTimeout(500); }
async function loggedIn(page) { return !(await page.locator('#login').evaluate(e => e.classList.contains('show'))); }
async function pts(page) { return parseInt(await page.locator('#ptsPill').textContent()); }
async function version(page) { return page.locator('.small:has-text("v")').last().textContent(); }
async function cloudIcon(page) { return page.locator('#cloud').textContent(); }
async function tapMission(page, idx) { await page.locator('#list .tile').nth(idx).click(); await page.waitForTimeout(100); }
async function doneCount(page) { return page.locator('#list .tile.done').count(); }
async function okCount(page) { return page.locator('#list .tile.ok').count(); }
async function enterPin(page, pin = '1234') { for (const ch of pin) await page.locator('#mPad button', { hasText: ch }).first().click(); await page.locator('#mPad button', { hasText: '✓' }).click(); await page.waitForTimeout(150); }
async function openParent(page, pin = '1234') { await page.click('#gear'); await page.waitForTimeout(100); await enterPin(page, pin); await page.waitForTimeout(150); return page.locator('body').evaluate(b => b.classList.contains('pmode')); }
async function closeParent(page) { await page.click('#doneEdit'); await page.waitForTimeout(100); }
async function modalVisible(page) { return page.locator('#modal').evaluate(e => e.classList.contains('show')); }
async function modalOk(page) { await page.click('#mOk'); await page.waitForTimeout(100); }
async function modalNo(page) { await page.click('#mNo'); await page.waitForTimeout(100); }
async function waitSync(page) { await page.waitForTimeout(900); }
async function tab(page, part) { await page.click(`.tabs .tab[data-part="${part}"]`); await page.waitForTimeout(50); }
async function kidsVisible(page) { return page.locator('#kids').evaluate(e => e.style.display !== 'none'); }
async function kidNames(page) { return page.locator('#kids button').allTextContents(); }
async function logCount(page) { await tab(page, 'gift'); const n = await page.locator('#log li:not(.small)').count(); return n; }
async function refresh(page) { await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(300); }

module.exports = { server, launch, newDevice, open, reload, signup, login, loggedIn, pts, version, cloudIcon, tapMission, doneCount, okCount, enterPin, openParent, closeParent, modalVisible, modalOk, modalNo, waitSync, tab, kidsVisible, kidNames, logCount, refresh };
