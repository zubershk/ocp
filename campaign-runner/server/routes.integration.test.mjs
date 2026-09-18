import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PORT = 3219;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = 'testkey123';
const H = { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN };

let proc = null;
async function waitForHealth(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error('server did not start');
}
async function api(path, opts = {}) {
  const { headers: oh, ...rest } = opts;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(oh || {}) },
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

before(async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, '..');
  proc = spawn(process.execPath, [join(here, 'index.js')], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), BOT_ADMIN_KEY: ADMIN, BOT_API_URL: 'http://127.0.0.1:1' },
    stdio: 'ignore',
  });
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('spawn timeout')), 5000);
    proc.on('spawn', () => { clearTimeout(to); resolve(); });
    proc.on('error', (e) => { clearTimeout(to); reject(e); });
  });
  await waitForHealth();
});

after(async () => {
  try { proc?.kill('SIGTERM'); } catch {}
  await delay(500);
  try { proc?.kill('SIGKILL'); } catch {}
});

describe('routes: auth + settings (actual server)', () => {
  it('GET /health public', async () => {
    const r = await fetch(`${BASE}/health`);
    assert.equal(r.status, 200);
  });
  it('GET /api/bot-health public (502 when bot down, not 401)', async () => {
    const r = await fetch(`${BASE}/api/bot-health`);
    assert.ok([200, 502].includes(r.status));
    assert.notEqual(r.status, 401);
  });
  it('GET /api/settings anon -> 401', async () => {
    const { status } = await api('/api/settings');
    assert.equal(status, 401);
  });
  it('GET /api/settings auth -> 200 without botAdminKey', async () => {
    const { status, data } = await api('/api/settings', { headers: { 'X-Admin-Key': ADMIN } });
    assert.equal(status, 200);
    assert.ok(!('botAdminKey' in (data || {})));
    assert.equal(data.configured, true);
  });
  it('PUT /api/settings rejects botApiUrl/botAdminKey', async () => {
    const { status } = await api('/api/settings', {
      method: 'PUT', headers: { 'X-Admin-Key': ADMIN },
      body: JSON.stringify({ botAdminKey: 'evil', delayMs: 3000 }),
    });
    assert.equal(status, 400);
  });
  it('PUT /api/settings accepts safe fields', async () => {
    const { status, data } = await api('/api/settings', {
      method: 'PUT', headers: { 'X-Admin-Key': ADMIN },
      body: JSON.stringify({ delayMs: 3000, brandName: 'Test' }),
    });
    assert.equal(status, 200);
    assert.equal(data.ok, true);
  });
});

describe('routes: campaigns lifecycle (actual server)', () => {
  let id = null;
  it('POST /api/campaigns creates draft', async () => {
    const { status, data } = await api('/api/campaigns', {
      method: 'POST', headers: { 'X-Admin-Key': ADMIN },
      body: JSON.stringify({ name: `it-${Date.now()}`, message: 'hi {name}', recipientMode: 'custom', recipientPhones: ['9876543210'] }),
    });
    assert.equal(status, 200);
    assert.equal(data.status, 'draft');
    id = data.id;
  });
  it('PUT /api/campaigns/:id rejects status/sent forgery', async () => {
    const { status } = await api(`/api/campaigns/${id}`, {
      method: 'PUT', headers: { 'X-Admin-Key': ADMIN },
      body: JSON.stringify({ status: 'done', sent: 999 }),
    });
    assert.equal(status, 400);
  });
  it('POST /send starts once, second send -> 409', async () => {
    const r1 = await api(`/api/campaigns/${id}/send`, { method: 'POST', headers: { 'X-Admin-Key': ADMIN } });
    assert.equal(r1.status, 200);
    const r2 = await api(`/api/campaigns/${id}/send`, { method: 'POST', headers: { 'X-Admin-Key': ADMIN } });
    assert.equal(r2.status, 409);
  });
  it('POST /cancel then GET stays cancelled (not done)', async () => {
    // use a fresh multi-batch campaign so sending lasts through cancel
    const phones = Array.from({ length: 30 }, (_, i) => String(9000000000 + i));
    const mk = await api('/api/campaigns', {
      method: 'POST', headers: { 'X-Admin-Key': ADMIN },
      body: JSON.stringify({ name: `cancel-${Date.now()}`, message: 'hi', recipientMode: 'custom', recipientPhones: phones }),
    });
    assert.equal(mk.status, 200);
    const cid = mk.data.id;
    const s = await api(`/api/campaigns/${cid}/send`, { method: 'POST', headers: { 'X-Admin-Key': ADMIN } });
    assert.equal(s.status, 200);
    const c = await api(`/api/campaigns/${cid}/cancel`, { method: 'POST', headers: { 'X-Admin-Key': ADMIN } });
    assert.equal(c.status, 200);
    // allow background loop to observe cancel (must not overwrite with done)
    await delay(1500);
    const g = await api(`/api/campaigns/${cid}`, { headers: { 'X-Admin-Key': ADMIN } });
    assert.equal(g.data.status, 'cancelled');
    // resend cancelled -> 400 (or 409 while background still draining), must duplicate instead
    const r = await api(`/api/campaigns/${cid}/send`, { method: 'POST', headers: { 'X-Admin-Key': ADMIN } });
    assert.ok([400, 409].includes(r.status));
    // wait for background to drain, then resend must be 400 cancelled
    await delay(4000);
    const r2 = await api(`/api/campaigns/${cid}/send`, { method: 'POST', headers: { 'X-Admin-Key': ADMIN } });
    assert.equal(r2.status, 400);
    await api(`/api/campaigns/${cid}`, { method: 'DELETE', headers: { 'X-Admin-Key': ADMIN } });
  });
  it('DELETE cleans up', async () => {
    const { status } = await api(`/api/campaigns/${id}`, { method: 'DELETE', headers: { 'X-Admin-Key': ADMIN } });
    assert.equal(status, 200);
  });
});

describe('routes: uploads + preview (actual server)', () => {
  it('POST /api/media/upload requires auth', async () => {
    const fd = new FormData();
    fd.append('file', new Blob(['x'], { type: 'text/plain' }), 'a.txt');
    const r = await fetch(`${BASE}/api/media/upload`, { method: 'POST', body: fd });
    assert.equal(r.status, 401);
  });
  it('POST /api/campaigns/preview-recipients requires auth', async () => {
    const r = await fetch(`${BASE}/api/campaigns/preview-recipients`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientMode: 'custom', recipientPhones: ['9876543210'] }),
    });
    assert.equal(r.status, 401);
  });
});
