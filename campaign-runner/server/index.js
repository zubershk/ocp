import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync, openSync, closeSync, fsyncSync } from 'fs';
import { join, dirname, resolve, extname, basename, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const UPLOADS_DIR = join(ROOT, 'uploads');
for (const d of [DATA_DIR, UPLOADS_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true });

// Env-only bot configuration (SSRF-safe, no UI override)
// Default http://bot:8090 for docker; override with BOT_API_URL=http://localhost:8090 for local dev
const BOT_API_URL = (process.env.BOT_API_URL || 'http://bot:8090').replace(/\/$/, '');
const BOT_ADMIN_KEY = process.env.BOT_ADMIN_KEY || process.env.CAMPAIGN_ADMIN_KEY || '';
function getBotConfig() {
  return { url: BOT_API_URL, key: BOT_ADMIN_KEY };
}
function clog(campaignId, op, details = {}) {
  // structured log without secrets
  try {
    console.log(JSON.stringify({ ts: new Date().toISOString(), campaignId: campaignId || null, op, ...details }));
  } catch { console.log(`[${campaignId || '-'}] ${op}`); }
}

const app = express();
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.disable('x-powered-by');
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5174,http://localhost:3001').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Admin-Key'],
  maxAge: 600,
}));
app.use(express.json({ limit: '100kb' }));
const rateBuckets = new Map();
function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const key = req.ip + ':' + req.path;
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.start > windowMs) bucket = { start: now, count: 0 };
    bucket.count++;
    rateBuckets.set(key, bucket);
    if (rateBuckets.size > 1000) {
      for (const [k, v] of rateBuckets) if (now - v.start > windowMs) rateBuckets.delete(k);
    }
    if (bucket.count > max) return res.status(429).json({ error: 'rate limited' });
    next();
  };
}
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 120 }));
function requireAdmin(req, res, next) {
  const key = String(req.headers['x-admin-key'] || '');
  const want = String(BOT_ADMIN_KEY || '');
  if (!want) return res.status(500).json({ error: 'admin key not configured' });
  const a = crypto.createHash('sha256').update(key).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'unauthorized' });
  next();
}
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/api/bot-health', async (_req, res) => {
  try {
    const cfg = getBotConfig();
    const controller = new AbortController(); const to = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(`${cfg.url}/health`, { signal: controller.signal });
    clearTimeout(to);
    if (!r.ok) throw new Error('bot unhealthy');
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ ok: false, error: 'bot unreachable' });
  }
});
// Auth gate for all other /api/* (fail closed)
app.use('/api/', (req, res, next) => {
  if (req.path === '/bot-health') return next();
  return requireAdmin(req, res, next);
});
// Extra strict limit note: per-route limits applied on send/upload handlers below
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // attachment prevents HTML execution as page
  res.setHeader('Content-Disposition', 'inline');
  next();
}, express.static(UPLOADS_DIR, { dotfiles: 'deny', setHeaders(res, pth) { if (!pth.match(/\.(jpg|jpeg|png|webp|gif)$/i)) res.setHeader('Content-Type', 'application/octet-stream'); } }));
const allowedUploadExt = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
function fileFilter(_req, file, cb) {
  const ext = extname(file.originalname).toLowerCase();
  if (!allowedUploadExt.has(ext)) return cb(new Error('type not allowed'), false);
  cb(null, true);
}
const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });
function sniffImageType(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// ── Data helpers (hardened JSON) ──
function safeParse(text, fb) {
  try {
    return JSON.parse(text, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v));
  } catch (e) {
    throw e;
  }
}
function load(name, fb = []) {
  if (!/^[a-z_]+$/.test(name)) throw new Error('invalid store');
  const p = join(DATA_DIR, `${name}.json`);
  if (!existsSync(p)) return fb;
  try {
    const raw = readFileSync(p, 'utf-8');
    const data = safeParse(raw, null);
    if (data === null || data === undefined) throw new Error('empty');
    return data;
  } catch (e) {
    // corrupt recovery: backup, return fallback, log
    try {
      const bak = `${p}.corrupt-${Date.now()}.bak`;
      renameSync(p, bak);
      console.error(JSON.stringify({ ts: new Date().toISOString(), op: 'load-corrupt', store: name, backup: bak }));
    } catch {}
    // do not erase state with defaults silently for critical stores; return fallback but caller logs
    if (Array.isArray(fb)) return fb;
    if (typeof fb === 'object' && fb !== null) return fb;
    return fb;
  }
}
function save(name, data) {
  if (!/^[a-z_]+$/.test(name)) throw new Error('invalid store');
  const p = join(DATA_DIR, `${name}.json`);
  const tmp = `${p}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const json = JSON.stringify(data, null, 2);
  const fd = openSync(tmp, 'w', 0o600);
  try {
    writeFileSync(fd, json);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, p);
  try {
    const dfd = openSync(DATA_DIR, 'r');
    try { fsyncSync(dfd); } finally { closeSync(dfd); }
  } catch {}
}
function uid() { return crypto.randomUUID(); }

// ═══════════════════════════════════════════
// SETTINGS (safe, env-only secrets)
// ═══════════════════════════════════════════
const DEFAULT_SETTINGS = {
  delayMs: 3000,
  brandName: '',
  brandLogo: '',
  brandColor: '#ea580c',
  footerText: 'Sent via OCP Campaign Runner',
  defaultCountryCode: '91',
};
function publicSettings() {
  let stored = {};
  try { stored = load('settings', {}); } catch { stored = {}; }
  // never expose botAdminKey/botApiUrl from file; use env
  return {
    botApiUrl: BOT_API_URL,
    configured: Boolean(BOT_ADMIN_KEY),
    delayMs: typeof stored.delayMs === 'number' ? stored.delayMs : DEFAULT_SETTINGS.delayMs,
    brandName: typeof stored.brandName === 'string' ? stored.brandName.slice(0, 100) : '',
    brandLogo: typeof stored.brandLogo === 'string' ? stored.brandLogo.slice(0, 512) : '',
    brandColor: typeof stored.brandColor === 'string' ? stored.brandColor.slice(0, 20) : DEFAULT_SETTINGS.brandColor,
    footerText: typeof stored.footerText === 'string' ? stored.footerText.slice(0, 200) : DEFAULT_SETTINGS.footerText,
    defaultCountryCode: typeof stored.defaultCountryCode === 'string' ? stored.defaultCountryCode.slice(0, 4) : '91',
  };
}
app.get('/api/settings', (_req, res) => {
  res.json(publicSettings());
});
app.put('/api/settings', (req, res) => {
  const b = req.body || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  if (has('botApiUrl') || has('botAdminKey') || has('__proto__') || has('constructor') || has('prototype')) {
    return res.status(400).json({ error: 'botApiUrl/botAdminKey not configurable via API' });
  }
  const out = {};
  try { out._prev = load('settings', {}); } catch { out._prev = {}; }
  const prev = out._prev;
  delete out._prev;
  if (b.delayMs !== undefined) {
    const d = Number(b.delayMs);
    if (!Number.isInteger(d) || d < 500 || d > 10000) return res.status(400).json({ error: 'delayMs must be 500-10000' });
    out.delayMs = d;
  } else out.delayMs = prev.delayMs ?? DEFAULT_SETTINGS.delayMs;
  if (b.brandName !== undefined) {
    if (typeof b.brandName !== 'string' || b.brandName.length > 100) return res.status(400).json({ error: 'invalid brandName' });
    out.brandName = b.brandName;
  } else out.brandName = prev.brandName ?? '';
  if (b.brandLogo !== undefined) {
    if (typeof b.brandLogo !== 'string' || b.brandLogo.length > 512) return res.status(400).json({ error: 'invalid brandLogo' });
    if (b.brandLogo && !/^https?:\/\//i.test(b.brandLogo) && !/^\/uploads\/(?:\d+\/)?[^/]+$/.test(b.brandLogo)) {
      return res.status(400).json({ error: 'brandLogo must be http(s) or /uploads/' });
    }
    out.brandLogo = b.brandLogo;
  } else out.brandLogo = prev.brandLogo ?? '';
  if (b.brandColor !== undefined) {
    if (typeof b.brandColor !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(b.brandColor)) return res.status(400).json({ error: 'invalid brandColor' });
    out.brandColor = b.brandColor;
  } else out.brandColor = prev.brandColor ?? DEFAULT_SETTINGS.brandColor;
  if (b.footerText !== undefined) {
    if (typeof b.footerText !== 'string' || b.footerText.length > 200) return res.status(400).json({ error: 'invalid footerText' });
    out.footerText = b.footerText;
  } else out.footerText = prev.footerText ?? DEFAULT_SETTINGS.footerText;
  if (b.defaultCountryCode !== undefined) {
    if (typeof b.defaultCountryCode !== 'string' || !/^\d{1,4}$/.test(b.defaultCountryCode)) return res.status(400).json({ error: 'invalid defaultCountryCode' });
    out.defaultCountryCode = b.defaultCountryCode;
  } else out.defaultCountryCode = prev.defaultCountryCode ?? '91';
  save('settings', out);
  clog(null, 'settings-update', {});
  res.json({ ok: true });
});

// ── Customer helpers ──
function isSendablePhone(phone) {
  return typeof phone === 'string' && /^[0-9]{10}$/.test(phone);
}
function normPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return d;
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d;
}
async function allCustomers() {
  if (BOT_ADMIN_KEY) {
    try {
      const data = await botApi('/admin/customers?limit=2000');
      const localTags = load('customer_tags', {});
      return (data.customers || []).map(c => ({
        id: String(c.id), phone: c.phone, name: c.name || '', tags: localTags[c.phone] || [],
        email: c.email || '', total_orders: c.total_orders, total_spent: c.total_spent,
        createdAt: c.created_at, source: 'bot',
      }));
    } catch (err) { clog(null, 'customers-bot-fallback', {}); }
  }
  return load('customers');
}
function modeOf(campaign) {
  if (campaign.recipientMode) return campaign.recipientMode;
  if (campaign.recipientTag && campaign.recipientTag !== 'all') return 'tag';
  return 'all';
}
function validatePhoneList(list) {
  const seen = new Set();
  let skipped = 0;
  if (!Array.isArray(list)) return { phones: [], skipped: 0 };
  if (list.length > 2000) list = list.slice(0, 2000);
  for (const raw of list) {
    const p = normPhone(raw);
    if (isSendablePhone(p)) seen.add(p);
    else skipped++;
  }
  return { phones: [...seen], skipped };
}
async function resolvePhonesAsync(campaign) {
  if (modeOf(campaign) === 'custom') return validatePhoneList(campaign.recipientPhones);
  const customers = await allCustomers();
  let filtered = customers;
  if (modeOf(campaign) === 'tag' && campaign.recipientTag && campaign.recipientTag !== 'all') {
    filtered = customers.filter(c => (c.tags || []).includes(campaign.recipientTag));
  }
  const seen = new Set();
  let skipped = 0;
  for (const c of filtered) {
    const p = normPhone(c.phone);
    if (isSendablePhone(p)) seen.add(p);
    else skipped++;
  }
  return { phones: [...seen], skipped };
}

// ── Image resolver (tenant-safe) ──
function resolveImagePayload(imageUrl) {
  if (!imageUrl) return '';
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  const dm = /^data:image\/(jpeg|png|webp|gif);base64,(.*)$/i.exec(imageUrl);
  if (dm) {
    if (dm[2].length > 7 * 1024 * 1024) throw new Error('image too large (max 5MB)');
    return dm[2];
  }
  // accept /uploads/<file> and /uploads/<rid>/<file>
  const m = /^\/uploads\/(?:\d+\/)?([^/]+)$/.exec(imageUrl);
  if (!m) throw new Error('image must be an http(s) URL or a library image');
  const filename = m[1];
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) throw new Error('invalid image path');
  const resolvedUploads = resolve(UPLOADS_DIR);
  const fp = resolve(UPLOADS_DIR, filename);
  // containment: file must be directly under UPLOADS_DIR (flat runner store)
  // tenant uploads live on bot; runner only serves its own library
  if (fp !== join(resolvedUploads, filename)) throw new Error('invalid image path');
  if (!existsSync(fp)) throw new Error('image file not found on server');
  const buf = readFileSync(fp);
  if (buf.length > 5 * 1024 * 1024) throw new Error('image too large (max 5MB)');
  const sniff = sniffImageType(buf);
  if (!sniff) throw new Error('invalid image content');
  return buf.toString('base64');
}

// ── Merge tags ──
function renderMessage(template, contact, settings, variables) {
  const vars = {
    name: contact?.name || '',
    phone: contact?.phone || '',
    brand_name: settings.brandName || '',
    time: new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    ...(variables || {}),
  };
  return String(template || '').replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k] ?? '') : m,
  );
}
function sanitizeVariables(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, val] of Object.entries(v).slice(0, 20)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)) continue;
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = String(val ?? '').slice(0, 200);
  }
  return out;
}

// ── Bot API helper (timeout + ok check, no secret leak) ──
async function botApi(path, opts = {}) {
  const cfg = getBotConfig();
  if (!cfg.key) throw Object.assign(new Error('bot admin key not configured'), { status: 500 });
  const url = `${cfg.url}${path}`;
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs || 15000;
  const to = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': cfg.key, ...(opts.headers || {}) },
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) {
      const err = new Error(data?.error || `bot API ${res.status}`);
      err.status = res.status;
      err.retryAfter = res.headers.get('retry-after');
      err.data = undefined;
      throw err;
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('bot request timeout');
      err.status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(to);
  }
}
async function botApiWithRetry(path, opts = {}, retries = 3) {
  let attempt = 0;
  let delayMs = 1000;
  while (true) {
    try {
      return await botApi(path, opts);
    } catch (e) {
      const status = e.status || 0;
      const retryable = status === 429 || status === 502 || status === 503 || status === 504;
      if (!retryable || attempt >= retries) throw e;
      let wait = delayMs;
      if (status === 429 && e.retryAfter) {
        const ra = parseInt(String(e.retryAfter), 10);
        if (!Number.isNaN(ra) && ra >= 0 && ra <= 60) wait = ra * 1000;
      }
      await new Promise(r => setTimeout(r, wait));
      attempt++;
      delayMs = Math.min(delayMs * 2, 30000);
    }
  }
}

// ═══════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════
function clampInt(v, def, min, max) {
  const n = parseInt(String(v ?? ''), 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}
app.get('/api/customers', async (req, res) => {
  const search = String(req.query.search || '').slice(0, 200);
  const page = clampInt(req.query.page, 1, 1, 10000);
  const limit = clampInt(req.query.limit, 50, 1, 100);
  const tag = String(req.query.tag || 'all').slice(0, 50);
  if (BOT_ADMIN_KEY) {
    try {
      const data = await botApi(`/admin/customers?search=${encodeURIComponent(search)}&limit=2000`, { timeoutMs: 10000 });
      let customers = (data.customers || []).map(c => ({
        id: String(c.id),
        phone: c.phone,
        name: c.name || '',
        tags: [],
        email: c.email || '',
        total_orders: c.total_orders,
        total_spent: c.total_spent,
        createdAt: c.created_at,
        last_seen_at: c.last_seen_at,
        source: 'bot',
      }));
      const localTags = load('customer_tags', {});
      customers.forEach(c => { c.tags = localTags[c.phone] || []; });
      if (tag && tag !== 'all') customers = customers.filter(c => c.tags.includes(tag));
      const total = customers.length;
      const start = (page - 1) * limit;
      return res.json({ customers: customers.slice(start, start + limit), total, page, pages: Math.ceil(total / limit), source: 'bot' });
    } catch (err) {
      clog(null, 'customers-bot-fallback', {});
    }
  }
  let customers = load('customers');
  if (!Array.isArray(customers)) customers = [];
  if (search) { const q = search.toLowerCase(); customers = customers.filter(c => String(c.phone || '').includes(q) || String(c.name || '').toLowerCase().includes(q)); }
  if (tag && tag !== 'all') customers = customers.filter(c => (c.tags || []).includes(tag));
  const total = customers.length;
  const start = (page - 1) * limit;
  res.json({ customers: customers.slice(start, start + limit), total, page, pages: Math.ceil(total / limit), source: 'local' });
});

app.get('/api/customers/all', async (_req, res) => {
  if (BOT_ADMIN_KEY) {
    try {
      const data = await botApi('/admin/customers?limit=2000', { timeoutMs: 10000 });
      const localTags = load('customer_tags', {});
      const customers = (data.customers || []).map(c => ({
        id: String(c.id), phone: c.phone, name: c.name || '', tags: localTags[c.phone] || [],
        email: c.email || '', total_orders: c.total_orders, total_spent: c.total_spent,
        createdAt: c.created_at, source: 'bot',
      }));
      return res.json(customers);
    } catch (err) { /* fall through */ }
  }
  const local = load('customers');
  res.json(Array.isArray(local) ? local : []);
});

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) tags = tags ? [tags] : [];
  return tags.map(t => String(t).trim().slice(0, 50)).filter(Boolean).slice(0, 20);
}
app.post('/api/customers', (req, res) => {
  const customers = load('customers');
  if (!Array.isArray(customers)) return res.status(500).json({ error: 'store corrupted' });
  const { phone, name, tags = [], email, notes } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'phone required' });
  const normalized = normPhone(phone);
  if (!isSendablePhone(normalized)) return res.status(400).json({ error: 'invalid phone' });
  if (customers.some(c => c.phone === normalized)) return res.status(409).json({ error: 'duplicate' });
  if (typeof name === 'string' && name.length > 100) return res.status(400).json({ error: 'name too long' });
  if (typeof email === 'string' && email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'invalid email' });
  const c = { id: uid(), phone: normalized, name: typeof name === 'string' ? name.slice(0, 100) : '', tags: sanitizeTags(tags), email: typeof email === 'string' ? email.slice(0, 200) : '', notes: typeof notes === 'string' ? notes.slice(0, 500) : '', createdAt: new Date().toISOString() };
  customers.push(c);
  if (customers.length > 10000) return res.status(400).json({ error: 'customer store full' });
  save('customers', customers);
  clog(null, 'customer-create', { id: c.id });
  res.json(c);
});

app.put('/api/customers/:id', (req, res) => {
  const customers = load('customers');
  const idx = customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const patch = {};
  if (b.name !== undefined) {
    if (typeof b.name !== 'string' || b.name.length > 100) return res.status(400).json({ error: 'invalid name' });
    patch.name = b.name;
  }
  if (b.tags !== undefined) patch.tags = sanitizeTags(b.tags);
  if (b.email !== undefined) {
    if (typeof b.email !== 'string' || (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email))) return res.status(400).json({ error: 'invalid email' });
    patch.email = b.email.slice(0, 200);
  }
  if (b.notes !== undefined) {
    if (typeof b.notes !== 'string' || b.notes.length > 500) return res.status(400).json({ error: 'invalid notes' });
    patch.notes = b.notes;
  }
  customers[idx] = { ...customers[idx], ...patch };
  save('customers', customers);
  res.json(customers[idx]);
});

app.delete('/api/customers/:id', (req, res) => {
  let customers = load('customers');
  customers = customers.filter(c => c.id !== req.params.id);
  save('customers', customers);
  res.json({ ok: true });
});

app.delete('/api/customers', (_req, res) => { save('customers', []); save('customer_tags', {}); res.json({ ok: true }); });

app.post('/api/customers/:phone/tags', (req, res) => {
  const phone = normPhone(req.params.phone);
  if (!isSendablePhone(phone)) return res.status(400).json({ error: 'invalid phone' });
  const { tags } = req.body || {};
  const clean = sanitizeTags(tags);
  const allTags = load('customer_tags', {});
  allTags[phone] = clean;
  save('customer_tags', allTags);
  res.json({ ok: true });
});

app.get('/api/customers/tags', (_req, res) => {
  const localTags = load('customer_tags', {});
  const tagSet = new Set();
  if (localTags && typeof localTags === 'object') Object.values(localTags).forEach(tags => Array.isArray(tags) && tags.forEach(t => tagSet.add(String(t).slice(0, 50))));
  const lc = load('customers');
  if (Array.isArray(lc)) lc.forEach(c => (c.tags || []).forEach(t => tagSet.add(String(t).slice(0, 50))));
  res.json([...tagSet].sort().slice(0, 200));
});

app.post('/api/customers/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  let content = '';
  try {
    content = readFileSync(req.file.path, 'utf-8');
  } finally {
    try { unlinkSync(req.file.path); } catch {}
  }
  if (content.length > 2 * 1024 * 1024) return res.status(400).json({ error: 'file too large' });
  const lines = content.split(/\r?\n/).filter(Boolean).slice(0, 2000);
  const customers = load('customers');
  const localTags = load('customer_tags', {});
  let imported = 0, skipped = 0;
  const seen = new Set(customers.map(c => c.phone));
  for (const line of lines) {
    const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, '').slice(0, 200));
    const phone = normPhone(parts[0] || '');
    if (!isSendablePhone(phone)) { skipped++; continue; }
    if (seen.has(phone)) { skipped++; continue; }
    const tags = parts[2] ? parts[2].split(';').map(t => t.trim().slice(0, 50)).filter(Boolean).slice(0, 20) : [];
    const email = parts[3] || '';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { skipped++; continue; }
    customers.push({ id: uid(), phone, name: (parts[1] || '').slice(0, 100), tags, email, notes: '', createdAt: new Date().toISOString() });
    seen.add(phone);
    if (tags.length > 0) localTags[phone] = tags;
    imported++;
  }
  save('customers', customers);
  save('customer_tags', localTags);
  clog(null, 'customers-import', { imported, skipped });
  res.json({ imported, skipped, total: customers.length });
});

app.get('/api/customers/export', (_req, res) => {
  const customers = load('customers');
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const csv = 'phone,name,tags,email\n' + customers.map(c => `${c.phone},${esc(c.name)},${esc((c.tags || []).join(';'))},${esc(c.email || '')}`).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=customers.csv');
  res.send(csv);
});

// ═══════════════════════════════════════════
// MEDIA LIBRARY
// ═══════════════════════════════════════════
app.get('/api/media', (_req, res) => { res.json(load('media')); });

app.post('/api/media/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  // sniff content
  let buf = null;
  try { buf = readFileSync(req.file.path); } catch { try { unlinkSync(req.file.path); } catch {} return res.status(400).json({ error: 'unreadable file' }); }
  const sniffed = sniffImageType(buf);
  if (!sniffed || !allowedUploadMime.has(sniffed)) {
    try { unlinkSync(req.file.path); } catch {}
    return res.status(400).json({ error: 'invalid image content' });
  }
  const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
  const ext = extMap[sniffed] || '.jpg';
  const filename = `${crypto.randomUUID()}${ext}`;
  const dest = resolve(UPLOADS_DIR, filename);
  if (dest !== join(resolve(UPLOADS_DIR), filename)) {
    try { unlinkSync(req.file.path); } catch {}
    return res.status(400).json({ error: 'invalid filename' });
  }
  try {
    renameSync(req.file.path, dest);
  } catch {
    try { unlinkSync(req.file.path); } catch {}
    return res.status(500).json({ error: 'save failed' });
  }
  const media = load('media');
  if (!Array.isArray(media)) return res.status(500).json({ error: 'store corrupted' });
  if (media.length > 500) return res.status(400).json({ error: 'media library full' });
  const item = { id: uid(), filename, originalName: basename(req.file.originalname).slice(0, 200), url: `/uploads/${filename}`, size: req.file.size, uploadedAt: new Date().toISOString() };
  media.push(item);
  save('media', media);
  clog(null, 'media-upload', { id: item.id });
  res.json(item);
});

app.delete('/api/media/:id', (req, res) => {
  let media = load('media');
  const item = media.find(m => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });
  if (typeof item.filename !== 'string' || item.filename.includes('/') || item.filename.includes('..') || item.filename.includes('\\')) {
    return res.status(400).json({ error: 'invalid filename' });
  }
  const fp = resolve(UPLOADS_DIR, item.filename);
  if (fp !== join(resolve(UPLOADS_DIR), item.filename)) return res.status(400).json({ error: 'invalid path' });
  if (existsSync(fp)) {
    try { unlinkSync(fp); } catch {}
  }
  media = media.filter(m => m.id !== req.params.id);
  save('media', media);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════
app.get('/api/templates', (_req, res) => { res.json(load('templates')); });

app.post('/api/templates', (req, res) => {
  const templates = load('templates');
  if (!Array.isArray(templates) || templates.length > 1000) return res.status(400).json({ error: 'template store full' });
  const b = req.body || {};
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 100) return res.status(400).json({ error: 'invalid name' });
  if (typeof b.message !== 'string' || !b.message.trim() || b.message.length > 4096) return res.status(400).json({ error: 'invalid message' });
  const t = { id: uid(), name: b.name.slice(0, 100), message: b.message.slice(0, 4096), createdAt: new Date().toISOString() };
  templates.push(t);
  save('templates', templates);
  res.json(t);
});

app.put('/api/templates/:id', (req, res) => {
  const templates = load('templates');
  const idx = templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  const patch = {};
  if (b.name !== undefined) {
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 100) return res.status(400).json({ error: 'invalid name' });
    patch.name = b.name.slice(0, 100);
  }
  if (b.message !== undefined) {
    if (typeof b.message !== 'string' || !b.message.trim() || b.message.length > 4096) return res.status(400).json({ error: 'invalid message' });
    patch.message = b.message.slice(0, 4096);
  }
  templates[idx] = { ...templates[idx], ...patch };
  save('templates', templates);
  res.json(templates[idx]);
});

app.delete('/api/templates/:id', (req, res) => {
  let templates = load('templates');
  templates = templates.filter(t => t.id !== req.params.id);
  save('templates', templates);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════
// CAMPAIGNS — sent via bot's /admin/broadcast/send
// ═══════════════════════════════════════════
const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'sending', 'done', 'cancelled', 'failed'];
const TRANSITIONS = {
  draft: ['scheduled', 'sending', 'cancelled'],
  scheduled: ['sending', 'cancelled', 'draft'],
  sending: ['done', 'failed', 'cancelled'],
  done: [],
  cancelled: [],
  failed: ['sending', 'scheduled', 'draft'],
};
function canTransition(from, to) {
  if (!CAMPAIGN_STATUSES.includes(from) || !CAMPAIGN_STATUSES.includes(to)) return false;
  // tolerate legacy 'completed' alias for done
  const f = from === 'completed' ? 'done' : from;
  const t = to === 'completed' ? 'done' : to;
  return (TRANSITIONS[f] || []).includes(t);
}
const activeSenders = new Set();
let schedulerRunning = false;

app.get('/api/campaigns', (_req, res) => { res.json(load('campaigns')); });

app.post('/api/campaigns', (req, res) => {
  const campaigns = load('campaigns');
  if (!Array.isArray(campaigns) || campaigns.length > 1000) return res.status(400).json({ error: 'campaign store full' });
  const { name, message, imageUrl, recipientTag, recipientMode, recipientPhones, scheduledAt } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.length > 100) return res.status(400).json({ error: 'invalid name' });
  if (typeof message !== 'string' || !message.trim() || message.length > 4096) return res.status(400).json({ error: 'invalid message' });
  const mode = recipientMode || (recipientTag && recipientTag !== 'all' ? 'tag' : 'all');
  if (!['all', 'tag', 'custom'].includes(mode)) return res.status(400).json({ error: 'invalid recipient mode' });
  let phones = [];
  if (mode === 'custom') {
    const v = validatePhoneList(recipientPhones);
    if (v.phones.length === 0) return res.status(400).json({ error: 'select at least one valid contact' });
    phones = v.phones;
  }
  if (mode === 'tag' && recipientTag && recipientTag !== 'all' && (typeof recipientTag !== 'string' || recipientTag.length > 50)) {
    return res.status(400).json({ error: 'invalid tag' });
  }
  let sched = null;
  if (scheduledAt) {
    const d = new Date(scheduledAt);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'invalid scheduledAt' });
    sched = d.toISOString();
  }
  if (imageUrl && typeof imageUrl !== 'string') return res.status(400).json({ error: 'invalid imageUrl' });
  if (typeof imageUrl === 'string' && imageUrl.length > 2048) return res.status(400).json({ error: 'imageUrl too long' });
  const c = {
    id: uid(), name: name.slice(0, 100), message: message.slice(0, 4096), imageUrl: imageUrl || '',
    recipientMode: mode, recipientTag: mode === 'tag' ? (recipientTag || 'all') : 'all',
    recipientPhones: mode === 'custom' ? phones : [],
    variables: sanitizeVariables(req.body.variables),
    scheduledAt: sched,
    status: sched ? 'scheduled' : 'draft',
    sent: 0, failed: 0, skipped: 0, total: 0, createdAt: new Date().toISOString(), results: [],
  };
  campaigns.push(c);
  save('campaigns', campaigns);
  clog(c.id, 'campaign-create', { mode });
  res.json(c);
});

app.put('/api/campaigns/:id', (req, res) => {
  const campaigns = load('campaigns');
  const idx = campaigns.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const cur = campaigns[idx];
  if (cur.status === 'sending') return res.status(409).json({ error: 'cannot edit while sending' });
  const b = req.body || {};
  const forbidden = ['status', 'sent', 'failed', 'skipped', 'total', 'results', 'startedAt', 'completedAt', 'createdAt', 'id'];
  for (const k of forbidden) if (k in b) return res.status(400).json({ error: `field ${k} not editable` });
  const patch = {};
  if (b.name !== undefined) {
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 100) return res.status(400).json({ error: 'invalid name' });
    patch.name = b.name.slice(0, 100);
  }
  if (b.message !== undefined) {
    if (typeof b.message !== 'string' || !b.message.trim() || b.message.length > 4096) return res.status(400).json({ error: 'invalid message' });
    patch.message = b.message.slice(0, 4096);
  }
  if (b.imageUrl !== undefined) {
    if (b.imageUrl !== '' && (typeof b.imageUrl !== 'string' || b.imageUrl.length > 2048)) return res.status(400).json({ error: 'invalid imageUrl' });
    patch.imageUrl = b.imageUrl || '';
  }
  if (b.recipientMode !== undefined || b.recipientTag !== undefined || b.recipientPhones !== undefined) {
    const mode = b.recipientMode ?? cur.recipientMode ?? 'all';
    if (!['all', 'tag', 'custom'].includes(mode)) return res.status(400).json({ error: 'invalid recipient mode' });
    patch.recipientMode = mode;
    if (mode === 'tag') {
      const tag = b.recipientTag ?? cur.recipientTag ?? 'all';
      if (typeof tag !== 'string' || tag.length > 50) return res.status(400).json({ error: 'invalid tag' });
      patch.recipientTag = tag;
      patch.recipientPhones = [];
    } else if (mode === 'custom') {
      const v = validatePhoneList(b.recipientPhones ?? cur.recipientPhones ?? []);
      if (v.phones.length === 0) return res.status(400).json({ error: 'select at least one valid contact' });
      patch.recipientPhones = v.phones;
      patch.recipientTag = 'all';
    } else {
      patch.recipientTag = 'all';
      patch.recipientPhones = [];
    }
  }
  if (b.variables !== undefined) patch.variables = sanitizeVariables(b.variables);
  if (b.scheduledAt !== undefined) {
    if (b.scheduledAt === null || b.scheduledAt === '') {
      // unschedule: scheduled -> draft
      if (cur.status === 'scheduled') {
        if (!canTransition(cur.status, 'draft')) return res.status(400).json({ error: 'invalid transition' });
        patch.scheduledAt = null;
        patch.status = 'draft';
      } else patch.scheduledAt = null;
    } else {
      const d = new Date(b.scheduledAt);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'invalid scheduledAt' });
      if (cur.status === 'draft' || cur.status === 'failed' || cur.status === 'scheduled') {
        const target = 'scheduled';
        if (cur.status !== target && !canTransition(cur.status, target)) return res.status(400).json({ error: 'invalid transition' });
        patch.scheduledAt = d.toISOString();
        patch.status = 'scheduled';
      } else return res.status(400).json({ error: 'cannot reschedule in status ' + cur.status });
    }
  }
  campaigns[idx] = { ...cur, ...patch };
  save('campaigns', campaigns);
  res.json(campaigns[idx]);
});

app.delete('/api/campaigns/:id', (req, res) => {
  if (activeSenders.has(req.params.id)) return res.status(409).json({ error: 'campaign sending' });
  let campaigns = load('campaigns');
  campaigns = campaigns.filter(c => c.id !== req.params.id);
  save('campaigns', campaigns);
  res.json({ ok: true });
});

app.post('/api/campaigns/:id/duplicate', (req, res) => {
  const campaigns = load('campaigns');
  const src = campaigns.find(c => c.id === req.params.id);
  if (!src) return res.status(404).json({ error: 'not found' });
  const c = {
    id: uid(), name: `${String(src.name || 'campaign').slice(0, 90)} (copy)`, message: src.message, imageUrl: src.imageUrl || '',
    recipientMode: src.recipientMode || 'all',
    recipientTag: src.recipientTag || 'all',
    recipientPhones: [...(src.recipientPhones || [])],
    variables: { ...(src.variables || {}) },
    scheduledAt: null, status: 'draft',
    sent: 0, failed: 0, skipped: 0, total: 0,
    createdAt: new Date().toISOString(), results: [],
  };
  campaigns.push(c);
  save('campaigns', campaigns);
  res.json(c);
});

app.get('/api/campaigns/:id', (req, res) => {
  const c = load('campaigns').find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const total = c.total || 0;
  const sent = c.sent || 0, failed = c.failed || 0, skipped = c.skipped || 0;
  const pending = Math.max(0, total - sent - failed);
  res.json({ ...c, pending });
});

app.post('/api/campaigns/preview-recipients', async (req, res) => {
  const { phones, skipped } = await resolvePhonesAsync({
    recipientMode: req.body.recipientMode || 'all',
    recipientTag: req.body.recipientTag || 'all',
    recipientPhones: req.body.recipientPhones || [],
  });
  res.json({ sendable: phones.length, skipped });
});

async function startSend(id) {
  if (activeSenders.has(id)) return { error: 'already sending', status: 409 };
  let campaigns = load('campaigns');
  if (!Array.isArray(campaigns)) return { error: 'store corrupted', status: 500 };
  let campaign = campaigns.find(c => c.id === id);
  if (!campaign) return { error: 'not found', status: 404 };
  if (campaign.status === 'sending') return { error: 'already sending', status: 409 };
  if (campaign.status === 'done' || campaign.status === 'completed') return { error: 'already sent', status: 409 };
  if (campaign.status === 'cancelled') return { error: 'cancelled campaigns cannot be resent, duplicate instead', status: 400 };
  if (!['draft', 'scheduled', 'failed'].includes(campaign.status)) return { error: `cannot send from status ${campaign.status}`, status: 400 };
  activeSenders.add(id);
  try {
    const { phones, skipped } = await resolvePhonesAsync(campaign);
    if (phones.length === 0) {
      activeSenders.delete(id);
      return { error: skipped > 0 ? `no sendable recipients (${skipped} invalid skipped)` : 'no recipients', status: 400 };
    }
    // re-load fresh to avoid lost update during resolve
    campaigns = load('campaigns');
    campaign = campaigns.find(c => c.id === id);
    if (!campaign) { activeSenders.delete(id); return { error: 'not found', status: 404 }; }
    if (campaign.status === 'sending') { activeSenders.delete(id); return { error: 'already sending', status: 409 }; }
    if (campaign.status === 'done' || campaign.status === 'completed') { activeSenders.delete(id); return { error: 'already sent', status: 409 }; }
    if (campaign.status === 'cancelled') { activeSenders.delete(id); return { error: 'cancelled', status: 400 }; }
    campaign.status = 'sending';
    campaign.total = phones.length;
    campaign.sent = 0;
    campaign.failed = 0;
    campaign.skipped = skipped;
    campaign.results = [];
    campaign.startedAt = new Date().toISOString();
    delete campaign.completedAt;
    delete campaign.error;
    save('campaigns', campaigns);
    clog(id, 'send-start', { total: phones.length, skipped });
    sendCampaignViaBot(campaign.id, phones).catch(e => clog(id, 'send-error', {})).finally(() => activeSenders.delete(id));
    return { ok: true, total: phones.length, skipped };
  } catch (e) {
    activeSenders.delete(id);
    throw e;
  }
}

app.post('/api/campaigns/:id/send', rateLimit({ windowMs: 60 * 1000, max: 5 }), async (req, res) => {
  const r = await startSend(req.params.id);
  if (r.error) return res.status(r.status || 400).json({ error: r.error });
  res.json({ ok: true, total: r.total, skipped: r.skipped });
});

app.post('/api/campaigns/:id/cancel', (req, res) => {
  const campaigns = load('campaigns');
  const c = campaigns.find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  if (c.status !== 'sending' && c.status !== 'scheduled') return res.status(400).json({ error: `cannot cancel from status ${c.status}` });
  c.status = 'cancelled';
  c.cancelledAt = new Date().toISOString();
  save('campaigns', campaigns);
  clog(c.id, 'cancel', { status: c.status });
  res.json({ ok: true });
});

async function sendCampaignViaBot(campaignId, phones) {
  let stored = load('campaigns').find(c => c.id === campaignId);
  if (!stored) return;
  const settings = (() => { try { return load('settings', {}); } catch { return {}; } })();
  const delay = Math.min(10000, Math.max(500, Number(settings.delayMs) || 3000));
  let image = '';
  try {
    image = resolveImagePayload(stored.imageUrl);
  } catch (err) {
    const all = load('campaigns');
    const idx = all.findIndex(c => c.id === campaignId);
    if (idx !== -1) {
      for (const phone of phones) {
        all[idx].results.push({ phone, ok: false, error: 'invalid image', sentAt: new Date().toISOString() });
        all[idx].failed++;
      }
      all[idx].status = 'failed';
      all[idx].error = 'invalid image';
      all[idx].completedAt = new Date().toISOString();
      save('campaigns', all);
    }
    clog(campaignId, 'send-image-fail', {});
    return;
  }
  const batchSize = 20;
  const customers = await allCustomers();
  const byPhone = new Map(customers.map(c => [normPhone(c.phone), c]));
  const groups = new Map();
  for (const phone of phones) {
    const contact = byPhone.get(phone) || { phone, name: '' };
    const s = (() => { try { return load('settings', {}); } catch { return {}; } })();
    const text = renderMessage(stored.message, contact, s, stored.variables);
    if (!groups.has(text)) groups.set(text, []);
    groups.get(text).push(phone);
  }
  const batches = [];
  for (const [text, list] of groups) {
    for (let i = 0; i < list.length; i += batchSize) batches.push({ text, phones: list.slice(i, i + batchSize) });
  }
  for (let bi = 0; bi < batches.length; bi++) {
    const { text, phones: batch } = batches[bi];
    const fresh = load('campaigns').find(c => c.id === campaignId);
    if (!fresh) return;
    if (fresh.status === 'cancelled') {
      clog(campaignId, 'send-cancelled', { batch: bi });
      return;
    }
    if (fresh.status !== 'sending') {
      clog(campaignId, 'send-aborted', { status: fresh.status });
      return;
    }
    try {
      const result = await botApiWithRetry('/admin/broadcast/send', {
        method: 'POST',
        body: JSON.stringify({ phones: batch, message: text, image_url: image }),
      }, 3);
      const cur = load('campaigns');
      const idx = cur.findIndex(c => c.id === campaignId);
      if (idx === -1) return;
      if (result.results) {
        for (const r of result.results) {
          cur[idx].results.push({ phone: r.phone, name: byPhone.get(r.phone)?.name || '', ok: !!r.ok, error: r.error || null, sentAt: new Date().toISOString() });
          if (r.ok) cur[idx].sent++; else cur[idx].failed++;
        }
      } else {
        for (const phone of batch) {
          cur[idx].results.push({ phone, name: byPhone.get(phone)?.name || '', ok: false, error: 'API error', sentAt: new Date().toISOString() });
          cur[idx].failed++;
        }
      }
      save('campaigns', cur);
    } catch (err) {
      const cur = load('campaigns');
      const idx = cur.findIndex(c => c.id === campaignId);
      if (idx === -1) return;
      const msg = err.status === 429 ? 'rate limited' : err.status === 504 ? 'timeout' : 'send failed';
      for (const phone of batch) {
        cur[idx].results.push({ phone, name: byPhone.get(phone)?.name || '', ok: false, error: msg, sentAt: new Date().toISOString() });
        cur[idx].failed++;
      }
      save('campaigns', cur);
      clog(campaignId, 'batch-fail', { batch: bi });
    }
    if (bi + 1 < batches.length && delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
  }
  const all = load('campaigns');
  const idx = all.findIndex(c => c.id === campaignId);
  if (idx !== -1) {
    if (all[idx].status === 'cancelled') {
      clog(campaignId, 'send-end-cancelled', {});
    } else {
      all[idx].status = 'done';
      all[idx].completedAt = new Date().toISOString();
      clog(campaignId, 'send-done', { sent: all[idx].sent, failed: all[idx].failed });
    }
    save('campaigns', all);
  }
}

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
app.get('/api/dashboard', async (_req, res) => {
  const campaigns = load('campaigns');
  let totalCustomers = 0;
  if (BOT_ADMIN_KEY) {
    try {
      const data = await botApi('/admin/customers?limit=1', { timeoutMs: 10000 });
      totalCustomers = data.total || 0;
    } catch (err) { /* fall through */ }
  }
  if (totalCustomers === 0) {
    const lc = load('customers');
    totalCustomers = Array.isArray(lc) ? lc.length : 0;
  }
  const totalSent = campaigns.reduce((s, c) => s + (c.sent || 0), 0);
  const totalFailed = campaigns.reduce((s, c) => s + (c.failed || 0), 0);
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const dayCampaigns = campaigns.filter(c => c.createdAt?.startsWith(key));
    last7.push({ date: key, campaigns: dayCampaigns.length, sent: dayCampaigns.reduce((s, c) => s + (c.sent || 0), 0) });
  }
  const tagCounts = {};
  const localTags = load('customer_tags', {});
  if (localTags && typeof localTags === 'object') Object.values(localTags).forEach(tags => Array.isArray(tags) && tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const lc2 = load('customers');
  if (Array.isArray(lc2)) lc2.forEach(c => (c.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  res.json({
    totalCustomers,
    totalCampaigns: campaigns.length,
    totalSent, totalFailed,
    deliveryRate: totalSent + totalFailed > 0 ? Math.round((totalSent / (totalSent + totalFailed)) * 100) : 0,
    recentCampaigns: campaigns.slice(-5).reverse(),
    last7, tagCounts,
  });
});

// ═══════════════════════════════════════════
// TEST SEND
// ═══════════════════════════════════════════
app.post('/api/test-send', rateLimit({ windowMs: 60 * 1000, max: 10 }), async (req, res) => {
  const { phone, message, imageUrl, variables } = req.body || {};
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
  if (typeof message !== 'string' || message.length > 4096) return res.status(400).json({ error: 'invalid message' });
  const normed = normPhone(phone);
  if (!isSendablePhone(normed)) return res.status(400).json({ error: 'invalid phone' });
  let image = '';
  try {
    image = resolveImagePayload(imageUrl);
  } catch (err) {
    return res.status(400).json({ error: 'invalid image' });
  }
  try {
    const settings = (() => { try { return load('settings', {}); } catch { return {}; } })();
    const customers = await allCustomers();
    const contact = customers.find(c => normPhone(c.phone) === normed) || { phone: normed, name: '' };
    const text = renderMessage(message.slice(0, 4096), contact, settings, sanitizeVariables(variables));
    const result = await botApiWithRetry('/admin/broadcast/send', {
      method: 'POST',
      body: JSON.stringify({ phones: [normed], message: text, image_url: image }),
    }, 2);
    const r = result.results?.[0];
    res.json({ ok: r?.ok || false, result: r || { ok: false }, rendered: text });
  } catch (err) {
    const status = err.status || 500;
    if (status === 401) return res.status(502).json({ error: 'bot auth failed' });
    if (status === 429) return res.status(429).json({ error: 'rate limited' });
    res.status(502).json({ error: 'send failed' });
  }
});

// ── Scheduled campaign checker (serialized, every 30s) ──
let schedulerTimer = null;
async function schedulerTick() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const campaigns = load('campaigns');
    if (!Array.isArray(campaigns)) return;
    const now = new Date();
    for (const c of campaigns) {
      if (c.status === 'scheduled' && c.scheduledAt && !Number.isNaN(new Date(c.scheduledAt).getTime()) && new Date(c.scheduledAt) <= now) {
        clog(c.id, 'scheduler-fire', { name: c.name });
        const r = await startSend(c.id);
        if (r.error) {
          clog(c.id, 'scheduler-skip', {});
          // do not demote: keep scheduled for retry, unless invalid
          if (r.status === 400) {
            const all = load('campaigns');
            const idx = all.findIndex(x => x.id === c.id);
            if (idx !== -1 && all[idx].status === 'scheduled') {
              // keep scheduled; operator must fix recipients
            }
          }
        }
      }
    }
  } catch (e) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), op: 'scheduler-error' }));
  } finally {
    schedulerRunning = false;
  }
}
schedulerTimer = setInterval(() => { schedulerTick().catch(() => {}); }, 30000);
// crash recovery: mark stale sending as failed on boot
try {
  const existing = load('campaigns');
  if (Array.isArray(existing)) {
    let dirty = false;
    for (const c of existing) {
      if (c.status === 'sending' && !activeSenders.has(c.id)) {
        c.status = 'failed';
        c.error = 'interrupted (restart)';
        c.completedAt = new Date().toISOString();
        dirty = true;
        clog(c.id, 'recover-interrupted', {});
      }
    }
    if (dirty) save('campaigns', existing);
  }
} catch {}

// ── Production static hosting ──
const DIST_DIR = join(ROOT, 'dist');
if (existsSync(join(DIST_DIR, 'index.html'))) {
  console.log('Serving production UI from dist/');
  app.use(express.static(DIST_DIR));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return res.status(404).json({ error: 'not found' });
    }
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
}

// multer/fileFilter + JSON error handling (must be before listen)
app.use((err, _req, res, _next) => {
  if (err && /type not allowed/i.test(err.message)) return res.status(400).json({ error: 'invalid image type (jpeg/png/webp/gif only)' });
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'file too large (max 5MB)' });
  if (err && err.type === 'entity.too.large') return res.status(400).json({ error: 'payload too large' });
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'invalid JSON' });
  if (err) return res.status(400).json({ error: 'upload failed' });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log(`Campaign Runner on http://localhost:${PORT} — connected to bot`));
function shutdown() {
  console.log('Shutting down campaign runner...');
  try { if (schedulerTimer) clearInterval(schedulerTimer); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
