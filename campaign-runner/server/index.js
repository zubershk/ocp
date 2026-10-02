import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync, openSync, closeSync, fsyncSync, realpathSync } from 'fs';
import { join, dirname, resolve, extname, basename, sep } from 'path';
import { fileURLToPath } from 'url';
import { validateExternalImageUrlSync } from './imagePolicy.js';
import XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const UPLOADS_DIR = join(ROOT, 'uploads');
for (const d of [DATA_DIR, UPLOADS_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true });

// Minimal .env loader (no extra dependency): fills missing vars from
// campaign-runner/.env, repo-root .env, then bot/.env — explicit env wins.
function loadEnvFile(p) {
  let text = null;
  try { text = readFileSync(p, 'utf8'); } catch { return; }
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const eq = t.indexOf('=');
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!k || k in process.env) continue;
    process.env[k] = v;
  }
}
for (const p of [join(ROOT, '..', 'bot', '.env'), join(ROOT, '..', '.env'), join(ROOT, '.env')]) loadEnvFile(p);

// Env-only bot configuration (SSRF-safe, no UI override)
// Default http://localhost:8090 for local dev; docker-compose overrides with http://bot:8090
const BOT_API_URL = (process.env.BOT_API_URL || 'http://localhost:8090').replace(/\/$/, '');
const BOT_ADMIN_KEY = process.env.BOT_ADMIN_KEY || process.env.CAMPAIGN_ADMIN_KEY || '';
if (!BOT_ADMIN_KEY) console.warn('WARN: BOT_ADMIN_KEY is not set — all /api/* (except /api/bot-health) will return 500. Set it in campaign-runner/.env, root .env, or bot/.env.');
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
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'");
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
const allowedUploadMime = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
function fileFilter(_req, file, cb) {
  const ext = extname(file.originalname).toLowerCase();
  if (!allowedUploadExt.has(ext)) return cb(new Error('type not allowed'), false);
  cb(null, true);
}
const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter });
// Customer import accepts CSV + Excel (first sheet, phone,name,tags,email columns)
const allowedImportExt = new Set(['.csv', '.xlsx', '.xls']);
function importFileFilter(_req, file, cb) {
  const ext = extname(file.originalname).toLowerCase();
  if (!allowedImportExt.has(ext)) return cb(new Error('import type not allowed'), false);
  cb(null, true);
}
const uploadImport = multer({ dest: UPLOADS_DIR, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: importFileFilter });
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

// Startup: strip legacy secrets from data/settings.json (never persist keys at rest).
// Single-replica assumption: data/*.json is owned by one process; two containers
// sharing the volume can lost-update (documented limitation, no Postgres per scope).
try {
  const sp = join(DATA_DIR, 'settings.json');
  if (existsSync(sp)) {
    try {
      const raw = safeParse(readFileSync(sp, 'utf-8'), null);
      if (raw && typeof raw === 'object' && !Array.isArray(raw) && ('botAdminKey' in raw || 'botApiUrl' in raw)) {
        const { botAdminKey: _k, botApiUrl: _u, ...rest } = raw;
        save('settings', rest);
        clog(null, 'settings-secrets-scrubbed', {});
      }
    } catch {}
  }
} catch {}

// ═══════════════════════════════════════════
// SETTINGS (safe, env-only secrets)
// ═══════════════════════════════════════════
const DEFAULT_SETTINGS = {
  delayMs: 3000,
  batchSize: 5,
  dailySendCap: 1000,
  brandName: '',
  brandLogo: '',
  brandColor: '#ea580c',
  footerText: 'Sent via OCP Campaign Runner',
  defaultCountryCode: '91',
};
function getSettings() {
  let stored = {};
  try { stored = load('settings', {}); } catch { stored = {}; }
  return {
    delayMs: typeof stored.delayMs === 'number' ? stored.delayMs : DEFAULT_SETTINGS.delayMs,
    batchSize: typeof stored.batchSize === 'number' ? stored.batchSize : DEFAULT_SETTINGS.batchSize,
    dailySendCap: typeof stored.dailySendCap === 'number' ? stored.dailySendCap : DEFAULT_SETTINGS.dailySendCap,
  };
}
// IST calendar day (YYYY-MM-DD) — the operator's wall clock. All dashboard
// day buckets and the daily cap use this so evening sends land on the right day.
function istDay(ts) {
  if (ts === undefined || ts === null) return null;
  const d = new Date(typeof ts === 'number' ? ts : ts);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
// Messages successfully sent today (IST day) — enforced by checkDailyCap.
// Scans live results + archives so resume-all restarts count exactly once.
function sentToday() {
  const day = istDay(Date.now());
  let n = 0;
  try {
    for (const c of load('campaigns')) {
      for (const bucket of [c.results, c.resultsArchive]) {
        if (!Array.isArray(bucket)) continue;
        for (const r of bucket) {
          if (r.ok && istDay(r.sentAt) === day) n++;
        }
      }
    }
  } catch { /* ignore */ }
  return n;
}
function checkDailyCap(additional) {
  const { dailySendCap: cap } = getSettings();
  if (!cap || cap <= 0) return { ok: true, sent: sentToday(), cap: 0 };
  const sent = sentToday();
  if (sent + (additional || 0) > cap) {
    return { ok: false, sent, cap, error: `daily send cap reached (${sent}/${cap} sent today)` };
  }
  return { ok: true, sent, cap };
}
// Learned blocklist: numbers WhatsApp reports as unregistered. Auto-skipped
// before any send attempt so dead numbers never count as sends.
function loadBlocklist() {
  try {
    const b = load('invalid_phones', []);
    return Array.isArray(b) ? new Set(b.map(String).filter(Boolean)) : new Set();
  } catch { return new Set(); }
}
function addToBlocklist(phones) {
  if (!phones || phones.length === 0) return;
  try {
    const set = loadBlocklist();
    let dirty = false;
    for (const p of phones) {
      const n = normPhone(p);
      if (isSendablePhone(n) && !set.has(n)) { set.add(n); dirty = true; }
    }
    if (dirty) save('invalid_phones', [...set].slice(-20000));
  } catch { /* ignore */ }
}
function seedBlocklistFromResults() {
  try {
    const found = [];
    for (const c of load('campaigns')) {
      if (!Array.isArray(c.results)) continue;
      for (const r of c.results) {
        if (!r.ok && /not registered on WhatsApp/i.test(r.error || '')) found.push(r.phone);
      }
    }
    if (found.length > 0) {
      const before = loadBlocklist().size;
      addToBlocklist(found);
      clog(null, 'blocklist-seed', { added: loadBlocklist().size - before });
    }
  } catch { /* ignore */ }
}
function publicSettings() {
  let stored = {};
  try { stored = load('settings', {}); } catch { stored = {}; }
  // never expose botAdminKey/botApiUrl from file; use env
  const s = getSettings();
  return {
    botApiUrl: BOT_API_URL,
    configured: Boolean(BOT_ADMIN_KEY),
    delayMs: s.delayMs,
    batchSize: Math.min(20, Math.max(1, s.batchSize || DEFAULT_SETTINGS.batchSize)),
    dailySendCap: s.dailySendCap,
    sentToday: sentToday(),
    blockedCount: loadBlocklist().size,
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
  if (b.batchSize !== undefined) {
    const n = Number(b.batchSize);
    if (!Number.isInteger(n) || n < 1 || n > 20) return res.status(400).json({ error: 'batchSize must be 1-20' });
    out.batchSize = n;
  } else out.batchSize = prev.batchSize ?? DEFAULT_SETTINGS.batchSize;
  if (b.dailySendCap !== undefined) {
    const n = Number(b.dailySendCap);
    if (!Number.isInteger(n) || n < 0 || n > 50000) {
      return res.status(400).json({ error: 'dailySendCap must be 0 (unlimited) or 1-50000' });
    }
    out.dailySendCap = n;
  } else out.dailySendCap = prev.dailySendCap ?? DEFAULT_SETTINGS.dailySendCap;
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
// ── Customer merge (bot + local file) ──
// Bot is source of truth for phone/name/email/order stats; local file holds
// imported/manual contacts plus notes/tags. Merge dedupes by normalized phone.
// Overlap: prefer richer record — bot id/stats kept, local name/tags/notes/email
// fill in when bot fields are empty; tags are unioned. Local-only keeps source:'local'.
function loadLocalCustomers() {
  const lc = load('customers');
  return Array.isArray(lc) ? lc : [];
}
function loadLocalTagsMap() {
  const t = load('customer_tags', {});
  return (t && typeof t === 'object' && !Array.isArray(t)) ? t : {};
}
function unionTags(...lists) {
  const set = new Set();
  for (const l of lists) {
    if (!Array.isArray(l)) continue;
    for (const t of l) {
      const s = String(t || '').trim().slice(0, 50);
      if (s) set.add(s);
    }
  }
  return [...set];
}
function normalizeBotCustomer(c, localTags) {
  const phone = normPhone(c.phone);
  const tags = unionTags(localTags[phone], localTags[c.phone]);
  return {
    id: String(c.id), phone, name: c.name || '', tags,
    email: c.email || '', total_orders: c.total_orders, total_spent: c.total_spent,
    createdAt: c.created_at, last_seen_at: c.last_seen_at, source: 'bot',
  };
}
function normalizeLocalCustomer(c, localTags) {
  const phone = normPhone(c.phone);
  const tags = unionTags(c.tags, localTags[phone], localTags[c.phone]);
  return {
    id: c.id || String(phone), phone, name: c.name || '', tags,
    email: c.email || '', notes: c.notes || '',
    total_orders: c.total_orders, total_spent: c.total_spent,
    createdAt: c.createdAt || c.addedAt, source: 'local',
  };
}
function mergeCustomerLists(botCustomers, localCustomers) {
  const map = new Map();
  for (const b of botCustomers) {
    const np = normPhone(b.phone);
    if (!np) continue;
    if (map.has(np)) {
      const ex = map.get(np);
      ex.tags = unionTags(ex.tags, b.tags);
      if (!ex.name && b.name) ex.name = b.name;
      if (!ex.email && b.email) ex.email = b.email;
      continue;
    }
    map.set(np, { ...b, phone: np });
  }
  for (const l of localCustomers) {
    const np = normPhone(l.phone);
    if (!np) continue;
    if (map.has(np)) {
      const ex = map.get(np);
      map.set(np, {
        ...ex,
        localId: l.id || ex.localId,
        name: ex.name || l.name || '',
        email: ex.email || l.email || '',
        notes: l.notes || ex.notes || '',
        tags: unionTags(ex.tags, l.tags),
        total_orders: ex.total_orders ?? l.total_orders,
        total_spent: ex.total_spent ?? l.total_spent,
        createdAt: ex.createdAt || l.createdAt,
        source: 'bot',
      });
    } else {
      map.set(np, { ...l, phone: np, source: 'local' });
    }
  }
  return [...map.values()];
}
// Full bot list via offset pagination (bot caps limit at 2000/page).
// Without this, bot contacts beyond the freshest 2000 are invisible to
// audience resolution AND render with empty names in byPhone.
async function fetchAllBotCustomers({ search = '' } = {}) {
  const all = [];
  let total = null;
  for (let page = 0; page < 10; page++) {
    const q = `?limit=2000&offset=${page * 2000}${search ? `&search=${encodeURIComponent(search)}` : ''}`;
    const data = await botApi(`/admin/customers${q}`, { timeoutMs: 15000 });
    const batch = Array.isArray(data.customers) ? data.customers : [];
    if (typeof data.total === 'number') total = data.total;
    all.push(...batch);
    if (batch.length < 2000) break;
  }
  return { customers: all, total };
}
async function getMergedCustomers({ search = '' } = {}) {
  const localRaw = loadLocalCustomers();
  const localTags = loadLocalTagsMap();
  let botRaw = null;
  let botTotal = null;
  let botOk = false;
  if (BOT_ADMIN_KEY) {
    try {
      const data = await fetchAllBotCustomers({ search });
      botRaw = data.customers || [];
      botTotal = typeof data.total === 'number' ? data.total : null;
      botOk = true;
    } catch (err) { clog(null, 'customers-bot-fallback', {}); }
  }
  if (!botOk) {
    let locals = localRaw.map(c => normalizeLocalCustomer(c, localTags));
    if (search) {
      const q = search.toLowerCase();
      locals = locals.filter(c => String(c.phone || '').includes(q) || String(c.name || '').toLowerCase().includes(q));
    }
    return { customers: locals, botOk: false, botTotal: null };
  }
  const botNormed = (botRaw || []).map(c => normalizeBotCustomer(c, localTags));
  let localNormed = localRaw.map(c => normalizeLocalCustomer(c, localTags));
  if (search) {
    const q = search.toLowerCase();
    localNormed = localNormed.filter(c => String(c.phone || '').includes(q) || String(c.name || '').toLowerCase().includes(q));
  }
  return { customers: mergeCustomerLists(botNormed, localNormed), botOk: true, botTotal };
}
async function allCustomers() {
  const { customers } = await getMergedCustomers();
  return customers;
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
  const blocked = loadBlocklist();
  const stripBlocked = (phones) => {
    if (blocked.size === 0) return { phones, blocked: 0 };
    const kept = phones.filter(p => !blocked.has(normPhone(p)));
    return { phones: kept, blocked: phones.length - kept.length };
  };
  if (modeOf(campaign) === 'custom') {
    const v = validatePhoneList(campaign.recipientPhones);
    const s = stripBlocked(v.phones);
    return { phones: s.phones, skipped: v.skipped + s.blocked, blocked: s.blocked };
  }
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
  const s = stripBlocked([...seen]);
  return { phones: s.phones, skipped: skipped + s.blocked, blocked: s.blocked };
}

// ── Image resolver (centralized SSRF policy) ──
function resolveImagePayload(imageUrl) {
  if (!imageUrl) return '';
  if (/^https?:\/\//i.test(imageUrl)) {
    // Centralized external URL validation (allowlist + private IP).
    // When IMAGE_ALLOWLIST is empty, this rejects all http(s) (uploads-only mode).
    validateExternalImageUrlSync(imageUrl);
    return imageUrl;
  }
  const dm = /^data:image\/(jpeg|png|webp|gif);base64,(.*)$/i.exec(imageUrl);
  if (dm) {
    if (dm[2].length > 7 * 1024 * 1024) throw new Error('image too large (max 5MB)');
    // Validate decoded payload, not just MIME declaration
    let buf;
    try {
      buf = Buffer.from(dm[2], 'base64');
    } catch {
      throw new Error('invalid image data');
    }
    if (buf.length > 5 * 1024 * 1024) throw new Error('image too large (max 5MB)');
    const sniff = sniffImageType(buf);
    if (!sniff) throw new Error('invalid image content');
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
  // Symlink escape check: realpath must stay inside UPLOADS_DIR
  try {
    const real = realpathSync(fp);
    const realUploads = realpathSync(resolvedUploads);
    if (real !== join(realUploads, filename) && !real.startsWith(realUploads + sep)) {
      throw new Error('invalid image path');
    }
  } catch (e) {
    if (e.message === 'invalid image path') throw e;
    // realpathSync throws on missing file, but existsSync already checked; treat as not found
    throw new Error('image file not found on server');
  }
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
  // Reserved: contact/system tags always win in renderMessage — user variables
  // must not clobber them (e.g. an empty `name` row blanked every recipient).
  const reserved = new Set(['name', 'phone', 'brand_name', 'time']);
  for (const [k, val] of Object.entries(v).slice(0, 20)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)) continue;
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (reserved.has(k)) continue;
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
      // 504 = our own abort (unknown outcome on non-idempotent sends) — never
      // auto-retry; surface it so the caller records `unknown`, not `failed`.
      const retryable = status === 429 || status === 502 || status === 503;
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
// ── Customer list filters (shared by GET /, /all, /export) ──
// Query: search, tag (repeat/comma) + tagMode=any|all, source=all|bot|local,
// dateBy=added|active, from/to (YYYY-MM-DD), year, yearTo, month,
// sort=name|phone|createdAt, order=asc|desc. Dates are UTC day boundaries.
function addedDateMs(c) {
  if (!c || !c.createdAt) return null;
  const t = Date.parse(c.createdAt);
  return Number.isNaN(t) ? null : t;
}
function activeDateMs(c) {
  if (!c) return null;
  const t = Date.parse(c.last_seen_at || c.createdAt);
  return Number.isNaN(t) ? null : t;
}
function parseCustomerFilters(q) {
  const tags = [];
  const rawTags = q.tag === undefined ? [] : (Array.isArray(q.tag) ? q.tag : [q.tag]);
  for (const t of rawTags) {
    for (const s of String(t).split(',')) {
      const v = s.trim().slice(0, 50);
      if (v && v !== 'all' && !tags.includes(v)) tags.push(v);
    }
  }
  if (tags.length > 20) tags.length = 20;
  const tagMode = q.tagMode === 'all' ? 'all' : 'any';
  const source = (q.source === 'bot' || q.source === 'local') ? q.source : 'all';
  const dateBy = q.dateBy === 'active' ? 'active' : 'added';
  const sort = (q.sort === 'name' || q.sort === 'phone' || q.sort === 'createdAt') ? q.sort : 'createdAt';
  const order = q.order === 'asc' ? 'asc' : 'desc';
  let fromMs = null, toMs = null;
  const day = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : null);
  const fromD = day(q.from), toD = day(q.to);
  if (fromD) { const t = Date.parse(`${fromD}T00:00:00Z`); if (!Number.isNaN(t)) fromMs = t; }
  if (toD) { const t = Date.parse(`${toD}T23:59:59.999Z`); if (!Number.isNaN(t)) toMs = t; }
  const yr = (v) => { const n = parseInt(String(v ?? ''), 10); return (n >= 2000 && n <= 2100) ? n : null; };
  if (fromMs === null && toMs === null) {
    const year = yr(q.year);
    const yearTo = yr(q.yearTo);
    const month = q.month === undefined || q.month === '' || q.month === 'all' ? 0 : clampInt(q.month, 0, 1, 12);
    if (year && month >= 1) {
      fromMs = Date.UTC(year, month - 1, 1);
      toMs = Date.UTC(year, month, 1) - 1;
    } else if (year) {
      const y2 = (yearTo && yearTo >= year) ? yearTo : year;
      fromMs = Date.UTC(year, 0, 1);
      toMs = Date.UTC(y2 + 1, 0, 1) - 1;
    }
  }
  return { tags, tagMode, source, dateBy, sort, order, fromMs, toMs };
}
function applyCustomerFilters(list, f) {
  let out = Array.isArray(list) ? list : [];
  if (f.source !== 'all') out = out.filter(c => c.source === f.source);
  if (f.tags.length > 0) {
    out = out.filter(c => {
      const ct = Array.isArray(c.tags) ? c.tags : [];
      return f.tagMode === 'all' ? f.tags.every(t => ct.includes(t)) : f.tags.some(t => ct.includes(t));
    });
  }
  if (f.fromMs !== null || f.toMs !== null) {
    out = out.filter(c => {
      const t = f.dateBy === 'active' ? activeDateMs(c) : addedDateMs(c);
      if (t === null) return false;
      return (f.fromMs === null || t >= f.fromMs) && (f.toMs === null || t <= f.toMs);
    });
  }
  const dir = f.order === 'asc' ? 1 : -1;
  out = [...out].sort((a, b) => {
    let ka, kb, na = false, nb = false;
    if (f.sort === 'createdAt') {
      ka = addedDateMs(a); kb = addedDateMs(b);
      na = ka === null; nb = kb === null;
      ka = ka ?? 0; kb = kb ?? 0;
    } else if (f.sort === 'name') {
      ka = String(a.name || '').toLowerCase(); kb = String(b.name || '').toLowerCase();
    } else {
      ka = String(a.phone || ''); kb = String(b.phone || '');
    }
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir;
  });
  return out;
}
app.get('/api/customers', async (req, res) => {
  const search = String(req.query.search || '').slice(0, 200);
  const page = clampInt(req.query.page, 1, 1, 10000);
  const limit = clampInt(req.query.limit, 50, 1, 100);
  const f = parseCustomerFilters(req.query);
  // Merged set: bot (search-filtered server-side, limit 2000) + local file.
  // Search/tag/source/dates/sort all operate on the merged, deduped set.
  const { customers: merged, botOk } = await getMergedCustomers({ search });
  const customers = applyCustomerFilters(merged, f);
  const total = customers.length;
  const start = (page - 1) * limit;
  res.json({ customers: customers.slice(start, start + limit), total, page, pages: Math.ceil(total / limit), source: botOk ? 'merged' : 'local' });
});

app.get('/api/customers/all', async (req, res) => {
  const search = String(req.query.search || '').slice(0, 200);
  const f = parseCustomerFilters(req.query);
  const { customers: merged } = await getMergedCustomers({ search });
  res.json(applyCustomerFilters(merged, f));
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

app.put('/api/customers/:id', async (req, res) => {
  const customers = load('customers');
  const idx = customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) {
    const byId = await mergedById();
    const hit = byId.get(String(req.params.id));
    if (hit && hit.source === 'bot') return res.status(409).json({ error: 'bot-owned contact (tag only)' });
    return res.status(404).json({ error: 'not found' });
  }
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

app.delete('/api/customers/:id', async (req, res) => {
  const current = load('customers');
  const list = Array.isArray(current) ? current : [];
  const next = list.filter(c => c.id !== req.params.id);
  if (next.length !== list.length) {
    save('customers', next);
    return res.json({ ok: true });
  }
  const byId = await mergedById();
  const hit = byId.get(String(req.params.id));
  if (hit && hit.source === 'bot') return res.status(409).json({ error: 'bot-owned contact cannot be deleted here' });
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

// ── Bulk customer ops (single load+save; bot-owned rows route to the tags overlay) ──
async function mergedById() {
  const { customers } = await getMergedCustomers();
  const map = new Map();
  for (const c of customers) {
    if (!map.has(String(c.id))) map.set(String(c.id), c);
    if (c.localId && !map.has(String(c.localId))) map.set(String(c.localId), c);
  }
  return map;
}
function parseIdList(v, max = 2000) {
  if (!Array.isArray(v)) return null;
  const ids = [...new Set(v.map(x => String(x ?? '').slice(0, 100)).filter(Boolean))].slice(0, max);
  return ids.length > 0 ? ids : null;
}
function resolveBulkPhones(byId, ids) {
  const phones = [];
  const notFound = [];
  for (const id of ids) {
    const c = byId.get(String(id)) || byId.get(String(normPhone(id)));
    if (!c) { notFound.push(id); continue; }
    const p = normPhone(c.phone);
    if (isSendablePhone(p) && !phones.includes(p)) phones.push(p);
  }
  return { phones, notFound };
}
app.post('/api/customers/bulk-delete', rateLimit({ windowMs: 60 * 1000, max: 30 }), async (req, res) => {
  const ids = parseIdList(req.body?.ids);
  if (!ids) return res.status(400).json({ error: 'ids (1-2000) required' });
  const byId = await mergedById();
  let customers = load('customers');
  if (!Array.isArray(customers)) return res.status(500).json({ error: 'store corrupted' });
  const allTags = load('customer_tags', {});
  let deleted = 0, skippedBot = 0;
  const notFound = [];
  const seenLocal = new Set();
  for (const id of ids) {
    const c = byId.get(String(id));
    if (!c) { notFound.push(id); continue; }
    if (c.source === 'bot') { skippedBot++; continue; } // bot is source of truth — refuse loudly
    const lid = String(c.localId || c.id);
    if (seenLocal.has(lid)) continue;
    seenLocal.add(lid);
    customers = customers.filter(x => String(x.id) !== lid);
    if (allTags[c.phone]) delete allTags[c.phone];
    deleted++;
  }
  save('customers', customers);
  save('customer_tags', allTags);
  clog(null, 'customers-bulk-delete', { deleted, skippedBot });
  res.json({ deleted, skippedBot, notFound });
});
app.post('/api/customers/bulk-tag', rateLimit({ windowMs: 60 * 1000, max: 30 }), async (req, res) => {
  const ids = parseIdList(req.body?.ids);
  const body = req.body || {};
  const mode = body.mode === 'remove' ? 'remove' : 'add';
  const incoming = body.tags !== undefined ? body.tags : body.tag;
  const clean = sanitizeTags(incoming);
  if (!ids) return res.status(400).json({ error: 'ids (1-2000) required' });
  if (clean.length === 0) return res.status(400).json({ error: 'tag required' });
  const byId = await mergedById();
  let customers = load('customers');
  if (!Array.isArray(customers)) return res.status(500).json({ error: 'store corrupted' });
  const allTags = load('customer_tags', {});
  const byLocalId = new Map(customers.map(c => [String(c.id), c]));
  let updated = 0;
  const notFound = [];
  for (const id of ids) {
    const c = byId.get(String(id));
    if (!c) { notFound.push(id); continue; }
    const phone = normPhone(c.phone);
    if (mode === 'add') {
      allTags[phone] = unionTags(allTags[phone], clean);
    } else {
      allTags[phone] = unionTags(allTags[phone]).filter(t => !clean.includes(t));
      if (allTags[phone].length === 0) delete allTags[phone];
    }
    const lid = c.localId || (c.source === 'local' ? c.id : null);
    const rec = lid ? byLocalId.get(String(lid)) : null;
    if (rec) {
      rec.tags = mode === 'add' ? unionTags(rec.tags, clean) : unionTags(rec.tags).filter(t => !clean.includes(t));
    }
    updated++;
  }
  save('customers', customers);
  save('customer_tags', allTags);
  clog(null, 'customers-bulk-tag', { updated, mode });
  res.json({ updated, notFound });
});
app.post('/api/customers/bulk-message', rateLimit({ windowMs: 60 * 1000, max: 10 }), async (req, res) => {
  const ids = parseIdList(req.body?.ids);
  const { message, imageUrl } = req.body || {};
  if (!ids) return res.status(400).json({ error: 'ids (1-2000) required' });
  if (typeof message !== 'string' || !message.trim() || message.length > 4096) {
    return res.status(400).json({ error: 'message (1-4096 chars) required' });
  }
  if (imageUrl !== undefined && imageUrl !== '' && (typeof imageUrl !== 'string' || imageUrl.length > 2048)) {
    return res.status(400).json({ error: 'invalid imageUrl' });
  }
  const byId = await mergedById();
  const { phones } = resolveBulkPhones(byId, ids);
  const v = validatePhoneList(phones);
  if (v.phones.length === 0) return res.status(400).json({ error: 'no sendable contacts in selection' });
  const bulkCap = checkDailyCap(v.phones.length);
  if (!bulkCap.ok) return res.status(429).json({ error: bulkCap.error });
  const campaigns = load('campaigns');
  if (!Array.isArray(campaigns) || campaigns.length > 1000) return res.status(400).json({ error: 'campaign store full' });
  const c = {
    id: uid(),
    name: `Bulk message ${new Date().toLocaleDateString()} (${v.phones.length})`.slice(0, 100),
    message: message.slice(0, 4096), imageUrl: imageUrl || '',
    recipientMode: 'custom', recipientTag: 'all', recipientPhones: v.phones,
    variables: sanitizeVariables(req.body.variables),
    scheduledAt: null, status: 'draft',
    sent: 0, failed: 0, skipped: 0, total: 0, createdAt: new Date().toISOString(), results: [],
  };
  campaigns.push(c);
  save('campaigns', campaigns);
  clog(c.id, 'bulk-message-create', { total: v.phones.length });
  const r = await startSend(c.id);
  if (r.error) return res.status(r.status || 400).json({ error: r.error, campaignId: c.id });
  res.json({ ok: true, campaignId: c.id, total: r.total, skipped: r.skipped });
});

app.get('/api/customers/tags', async (_req, res) => {
  // Tags from the merged set (bot + local deduped) so filters match the list.
  const { customers } = await getMergedCustomers();
  const tagSet = new Set();
  for (const c of customers) {
    if (Array.isArray(c.tags)) for (const t of c.tags) {
      const s = String(t || '').slice(0, 50);
      if (s) tagSet.add(s);
    }
  }
  res.json([...tagSet].sort().slice(0, 200));
});

// Import column detection: header names (any order) map to phone/name/tags/email/notes.
// Whole-cell match on letters-only lowercase; longest alias wins ("Phone 1 - Value"
// beats "Phone 1 -"); for phone, the column whose data looks like phone numbers wins.
const IMPORT_HEADERS = {
  phone: ['phonenumber', 'mobilenumber', 'phonevalue', 'mobilevalue', 'contactnumber', 'phone', 'mobile', 'contact', 'number', 'tel', 'telephone', 'phoneno'],
  name: ['firstname', 'customername', 'contactname', 'fullname', 'name', 'customer'],
  tags: ['tags', 'tag', 'labels', 'label', 'groups', 'group', 'category'],
  email: ['email', 'e-mail', 'mail', 'emailid', 'e mail'],
  notes: ['address', 'notes', 'note', 'remarks', 'remark', 'comments', 'comment'],
};
const IMPORT_ALIAS_SET = new Set(Object.values(IMPORT_HEADERS).flat().map(a => a.replace(/[^a-z]/g, '')));
function normImportHeader(s) { return String(s ?? '').trim().toLowerCase().replace(/[^a-z]/g, ''); }
function matchImportAlias(cell, aliases) {
  let best = 0;
  for (const a of aliases) {
    const na = a.replace(/[^a-z]/g, '');
    if (cell === na && na.length > best) best = na.length;
  }
  return best;
}
function resolveImportColumns(headerRow, sampleRows, width) {
  const cells = (headerRow || []).map(normImportHeader);
  const pick = (aliases) => {
    let idx = -1, bestLen = 0;
    for (let i = 0; i < cells.length; i++) {
      const len = matchImportAlias(cells[i], aliases);
      if (len > bestLen) { idx = i; bestLen = len; }
    }
    return idx;
  };
  // Phone: the column with the most valid phone numbers wins (header match only breaks ties),
  // so truncated/odd headers like "Phone 1 - ..." can never misroute it.
  let phone = -1, bestValid = 0, bestLen = 0;
  for (let i = 0; i < width; i++) {
    let valid = 0;
    for (const r of sampleRows) {
      const v = String(r[i] ?? '').trim();
      if (!v) continue;
      if (isSendablePhone(normPhone(v))) valid++;
    }
    const len = matchImportAlias(cells[i] || '', IMPORT_HEADERS.phone);
    if (valid > bestValid || (valid === bestValid && valid > 0 && len > bestLen)) { phone = i; bestValid = valid; bestLen = len; }
  }
  return {
    phone,
    name: pick(IMPORT_HEADERS.name),
    tags: pick(IMPORT_HEADERS.tags),
    email: pick(IMPORT_HEADERS.email),
    notes: pick(IMPORT_HEADERS.notes),
  };
}

app.post('/api/customers/import', uploadImport.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const ext = extname(req.file.originalname).toLowerCase();
  // Header row (any column order) → name/tags/email/notes map; phone column is
  // resolved from data (most phone-like column). Otherwise positional fallback.
  // Caps: 10,000 rows — beyond that the file is truncated (flagged in response).
  const ROW_CAP = 10000;
  let truncated = false;
  let rows = [];
  try {
    if (ext === '.xlsx' || ext === '.xls') {
      if (req.file.size > 5 * 1024 * 1024) return res.status(400).json({ error: 'file too large' });
      let wb = null;
      try {
        wb = XLSX.readFile(req.file.path, { sheetRows: ROW_CAP + 1 });
      } catch {
        return res.status(400).json({ error: 'invalid spreadsheet' });
      }
      const sheet = wb.Sheets?.[wb.SheetNames?.[0]];
      if (!sheet) return res.status(400).json({ error: 'empty spreadsheet' });
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
      truncated = aoa.length > ROW_CAP;
      rows = aoa.slice(0, ROW_CAP).map(r => (Array.isArray(r) ? r : [r]).slice(0, 20).map(c => String(c ?? '').trim().slice(0, 200)));
    } else {
      let content = '';
      try {
        content = readFileSync(req.file.path, 'utf-8');
      } catch {
        return res.status(400).json({ error: 'unreadable file' });
      }
      if (content.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'file too large' });
      const lines = content.split(/\r?\n/).filter(Boolean);
      truncated = lines.length > ROW_CAP;
      rows = lines.slice(0, ROW_CAP)
        .map(line => line.split(',').map(s => s.trim().replace(/^"|"$/g, '').slice(0, 200)));
    }
  } finally {
    try { unlinkSync(req.file.path); } catch {}
  }
  const headerCells = (rows[0] || []).map(normImportHeader);
  const headerMode = headerCells.some(c => IMPORT_ALIAS_SET.has(c));
  const dataStart = headerMode ? 1 : 0;
  const width = Math.max(1, ...rows.slice(0, dataStart + 200).map(r => r.length));
  const resolved = resolveImportColumns(headerMode ? rows[0] : [], rows.slice(dataStart, dataStart + 200), width);
  let cols;
  if (headerMode) {
    if (resolved.phone === -1) return res.status(400).json({ error: 'no phone column found (need phone/mobile/number)' });
    cols = resolved;
  } else if (resolved.phone !== -1) {
    // No header, but a clearly phone-like column exists (maybe not first) — use it
    cols = { phone: resolved.phone, name: 1, tags: 2, email: 3, notes: -1 };
  } else {
    cols = { phone: 0, name: 1, tags: 2, email: 3, notes: -1 };
  }
  let dataRows = rows.slice(dataStart);
  const customers = load('customers');
  const localTags = load('customer_tags', {});
  let imported = 0, skipped = 0;
  const seen = new Set(customers.map(c => c.phone));
  const cell = (r, i) => (i === -1 ? '' : String(r[i] ?? '').trim().slice(0, 200));
  for (const r of dataRows) {
    const parts = [cell(r, cols.phone), cell(r, cols.name), cell(r, cols.tags), cell(r, cols.email)];
    if (parts.every(p => !p)) continue; // blank row: ignore, don't count
    const phone = normPhone(parts[0] || '');
    if (!isSendablePhone(phone)) { skipped++; continue; }
    if (seen.has(phone)) { skipped++; continue; }
    const tags = parts[2] ? parts[2].split(';').map(t => t.trim().slice(0, 50)).filter(Boolean).slice(0, 20) : [];
    const email = parts[3] || '';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { skipped++; continue; }
    customers.push({ id: uid(), phone, name: (parts[1] || '').slice(0, 100), tags, email, notes: (cols.notes === -1 ? '' : String(r[cols.notes] ?? '').trim().slice(0, 500)), createdAt: new Date().toISOString() });
    seen.add(phone);
    if (tags.length > 0) localTags[phone] = tags;
    imported++;
  }
  save('customers', customers);
  save('customer_tags', localTags);
  clog(null, 'customers-import', { imported, skipped, truncated });
  res.json({ imported, skipped, total: customers.length, truncated });
});

app.get('/api/customers/export', async (req, res) => {
  // Export the merged set (bot + local deduped), honoring list filters so the
  // CSV matches the table. `ids` (comma list, max 5000) exports a selection.
  const search = String(req.query.search || '').slice(0, 200);
  const f = parseCustomerFilters(req.query);
  const { customers: merged } = await getMergedCustomers({ search });
  let customers = applyCustomerFilters(merged, f);
  const idsRaw = String(req.query.ids || '');
  if (idsRaw) {
    const want = idsRaw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5000);
    const set = new Set(want);
    const rank = new Map(want.map((id, i) => [id, i]));
    customers = customers
      .filter(c => set.has(String(c.id)) || (c.localId && set.has(String(c.localId))) || set.has(String(c.phone)))
      .sort((a, b) => (rank.get(String(a.id)) ?? rank.get(String(a.phone)) ?? 0) - (rank.get(String(b.id)) ?? rank.get(String(b.phone)) ?? 0));
  }
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
  // cancelled -> sending is legal ONLY via POST /:id/resume (never via /send)
  cancelled: ['sending'],
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

app.get('/api/campaigns/:id/export', (req, res) => {
  const c = load('campaigns').find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = Array.isArray(c.results) ? c.results : [];
  const csv = 'phone,name,ok,error,sentAt\n' + rows.map(r =>
    `${r.phone || ''},${esc(r.name)},${r.ok ? 'yes' : 'no'},${esc(r.error || '')},${r.sentAt || ''}`).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=campaign-${c.id}-results.csv`);
  res.send(csv);
});

// Retry only the failed recipients of a done/failed campaign: clones them
// into a fresh custom draft and starts sending. Original is untouched.
app.post('/api/campaigns/:id/retry-failed', rateLimit({ windowMs: 60 * 1000, max: 5 }), async (req, res) => {
  const campaigns = load('campaigns');
  if (!Array.isArray(campaigns)) return res.status(500).json({ error: 'store corrupted' });
  const src = campaigns.find(c => c.id === req.params.id);
  if (!src) return res.status(404).json({ error: 'not found' });
  if (src.status !== 'done' && src.status !== 'failed' && src.status !== 'completed') {
    return res.status(400).json({ error: 'only done or failed campaigns can be retried' });
  }
  const failedPhones = [...new Set((Array.isArray(src.results) ? src.results : [])
    .filter(r => !r.ok)
    .map(r => normPhone(r.phone))
    .filter(p => isSendablePhone(p)))];
  if (failedPhones.length === 0) return res.status(400).json({ error: 'no failed recipients to retry' });
  const retryCap = checkDailyCap(failedPhones.length);
  if (!retryCap.ok) return res.status(429).json({ error: retryCap.error });
  if (campaigns.length > 1000) return res.status(400).json({ error: 'campaign store full' });
  const c = {
    id: uid(), name: `Retry: ${String(src.name || 'campaign').slice(0, 90)} (${failedPhones.length})`,
    message: src.message, imageUrl: src.imageUrl || '',
    recipientMode: 'custom', recipientTag: 'all', recipientPhones: failedPhones,
    variables: { ...(src.variables || {}) },
    scheduledAt: null, status: 'draft',
    sent: 0, failed: 0, skipped: 0, total: 0, createdAt: new Date().toISOString(), results: [],
  };
  campaigns.push(c);
  save('campaigns', campaigns);
  clog(c.id, 'retry-failed-create', { from: src.id, total: failedPhones.length });
  const r = await startSend(c.id);
  if (r.error) return res.status(r.status || 400).json({ error: r.error, campaignId: c.id });
  res.json({ ok: true, campaignId: c.id, total: r.total, skipped: r.skipped });
});

app.post('/api/campaigns/preview-recipients', async (req, res) => {
  const { phones, skipped, blocked } = await resolvePhonesAsync({
    recipientMode: req.body.recipientMode || 'all',
    recipientTag: req.body.recipientTag || 'all',
    recipientPhones: req.body.recipientPhones || [],
  });
  res.json({ sendable: phones.length, skipped, blocked: blocked || 0 });
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
    // Anti-ban guard: refuse to start when the daily send cap would be exceeded.
    const cap = checkDailyCap(phones.length);
    if (!cap.ok) {
      activeSenders.delete(id);
      return { error: cap.error, status: 429 };
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

// Resume a cancelled/failed campaign WITHOUT resending delivered contacts.
// mode 'pending' (default): send only unsent+failed (delivered skipped, history kept).
// mode 'all': restart on the same ID (prior results archived, counters reset).
app.post('/api/campaigns/:id/resume', rateLimit({ windowMs: 60 * 1000, max: 5 }), async (req, res) => {
  const mode = req.body?.mode === 'all' ? 'all' : 'pending';
  if (activeSenders.has(req.params.id)) return res.status(409).json({ error: 'already sending' });
  let campaigns = load('campaigns');
  if (!Array.isArray(campaigns)) return res.status(500).json({ error: 'store corrupted' });
  const c = campaigns.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  if (c.status !== 'cancelled' && c.status !== 'failed') {
    return res.status(400).json({ error: `cannot resume from status ${c.status}` });
  }
  activeSenders.add(c.id);
  try {
    const { phones: resolved, skipped: freshSkipped } = await resolvePhonesAsync(c);
    if (mode === 'all') {
      const allCap = checkDailyCap(resolved.length);
      if (!allCap.ok) {
        activeSenders.delete(c.id);
        return res.status(429).json({ error: allCap.error });
      }
      if (resolved.length === 0) {
        activeSenders.delete(c.id);
        return res.status(400).json({ error: freshSkipped > 0 ? `no sendable recipients (${freshSkipped} invalid skipped)` : 'no recipients' });
      }
      // archive forensics, then restart counts on the same ID
      const archive = [...(c.resultsArchive || []), ...(Array.isArray(c.results) ? c.results : [])].slice(-10000);
      const fresh = load('campaigns');
      const cur = fresh.find(x => x.id === c.id);
      if (!cur) { activeSenders.delete(c.id); return res.status(404).json({ error: 'not found' }); }
      Object.assign(cur, {
        status: 'sending', total: resolved.length, sent: 0, failed: 0, skipped: freshSkipped,
        results: [], resultsArchive: archive, startedAt: new Date().toISOString(),
      });
      delete cur.completedAt; delete cur.error; delete cur.cancelledAt;
      save('campaigns', fresh);
      clog(c.id, 'resume-all', { total: resolved.length });
      sendCampaignViaBot(c.id, resolved).catch(() => clog(c.id, 'send-error', {})).finally(() => activeSenders.delete(c.id));
      return res.json({ ok: true, mode, total: resolved.length, alreadySent: 0, pending: resolved.length, skipped: freshSkipped });
    }
    // pending: delivered (ok) are skipped; failed + never-attempted are sent. History kept.
    const okPhones = new Set((Array.isArray(c.results) ? c.results : [])
      .filter(r => r.ok).map(r => normPhone(r.phone)).filter(Boolean));
    const pending = resolved.filter(p => !okPhones.has(normPhone(p)));
    if (pending.length === 0) {
      activeSenders.delete(c.id);
      return res.status(400).json({ error: `nothing pending — all ${okPhones.size} delivered` });
    }
    const pendingCap = checkDailyCap(pending.length);
    if (!pendingCap.ok) {
      activeSenders.delete(c.id);
      return res.status(429).json({ error: pendingCap.error });
    }
    const fresh = load('campaigns');
    const cur = fresh.find(x => x.id === c.id);
    if (!cur) { activeSenders.delete(c.id); return res.status(404).json({ error: 'not found' }); }
    if (cur.status === 'sending') { activeSenders.delete(c.id); return res.status(409).json({ error: 'already sending' }); }
    const sentOk = (Array.isArray(cur.results) ? cur.results : []).filter(r => r.ok).length;
    cur.status = 'sending';
    cur.total = Math.max(cur.total || 0, sentOk + (cur.failed || 0) + pending.length);
    cur.skipped = freshSkipped;
    cur.startedAt = cur.startedAt || new Date().toISOString();
    delete cur.completedAt; delete cur.error; delete cur.cancelledAt;
    save('campaigns', fresh);
    clog(c.id, 'resume-pending', { pending: pending.length, alreadySent: sentOk });
    sendCampaignViaBot(c.id, pending).catch(() => clog(c.id, 'send-error', {})).finally(() => activeSenders.delete(c.id));
    return res.json({ ok: true, mode, total: cur.total, alreadySent: sentOk, pending: pending.length, skipped: freshSkipped });
  } catch (e) {
    activeSenders.delete(c.id);
    throw e;
  }
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
  const batchSize = Math.min(20, Math.max(1, getSettings().batchSize || DEFAULT_SETTINGS.batchSize));
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
      // 90s: the bot sends phones sequentially (~1.5-3s each with checks/uploads),
      // so a 20-batch legitimately takes 30-60s. No 504 retries (see botApiWithRetry).
      const result = await botApiWithRetry('/admin/broadcast/send', {
        method: 'POST',
        body: JSON.stringify({ phones: batch, message: text, image_url: image }),
        timeoutMs: 90000,
      }, 3);
      const cur = load('campaigns');
      const idx = cur.findIndex(c => c.id === campaignId);
      if (idx === -1) return;
      if (result.results) {
        const newlyDead = [];
        for (const r of result.results) {
          cur[idx].results.push({ phone: r.phone, name: byPhone.get(r.phone)?.name || '', ok: !!r.ok, error: r.error || null, sentAt: new Date().toISOString() });
          // Dead numbers are expected list churn — count as skipped, not failed,
          // so the delivery rate reflects real send health.
          if (!r.ok && /not registered on WhatsApp/i.test(r.error || '')) {
            cur[idx].skipped++;
            newlyDead.push(r.phone);
          }
          else if (r.ok) cur[idx].sent++;
          else cur[idx].failed++;
        }
        // Learn: never attempt these numbers again (auto-skipped in resolve).
        addToBlocklist(newlyDead);
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
      const msg = err.status === 429 ? 'rate limited' : err.status === 504 ? 'timeout (delivery unknown — verify before retry)' : 'send failed';
      for (const phone of batch) {
        cur[idx].results.push({ phone, name: byPhone.get(phone)?.name || '', ok: false, error: msg, sentAt: new Date().toISOString() });
        cur[idx].failed++;
      }
      save('campaigns', cur);
      clog(campaignId, 'batch-fail', { batch: bi, status: err.status || 0 });
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
  // Merged total: bot total (uncapped) + local-only contacts, deduped by phone.
  // Uses the same merged set as /api/customers so the count matches the list.
  const { customers: merged, botOk, botTotal } = await getMergedCustomers();
  let totalCustomers = merged.length;
  if (botOk && typeof botTotal === 'number' && botTotal > 0) {
    const localOnly = merged.filter(c => c.source === 'local').length;
    const botFetchedUnique = merged.length - localOnly;
    if (botTotal > botFetchedUnique) {
      // Bot has more than the 2000-row fetch window: uncapped total + locals.
      // Upper bound if locals overlap unfetched bot rows (documented).
      totalCustomers = botTotal + localOnly;
    } else {
      totalCustomers = merged.length;
    }
  }
  // Totals include archived results so resume-all restarts don't erase history.
  // Live counters already cover live rows; archive rows are counted from data.
  let totalSent = 0, totalFailed = 0;
  const sentByDay = new Map();
  const countRow = (r) => {
    if (r.ok) {
      const day = istDay(r.sentAt);
      if (day) sentByDay.set(day, (sentByDay.get(day) || 0) + 1);
    }
  };
  for (const c of campaigns) {
    totalSent += (c.sent || 0);
    totalFailed += (c.failed || 0);
    if (Array.isArray(c.results)) for (const r of c.results) countRow(r);
    if (Array.isArray(c.resultsArchive)) for (const r of c.resultsArchive) {
      if (r.ok) totalSent++;
      else totalFailed++;
      countRow(r);
    }
  }
  // Activity by SEND day (IST), not campaign creation day — new sends on old
  // campaigns move the bars. Campaigns without results fall back to startedAt.
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const key = istDay(Date.now() - i * 86400000);
    const dayCampaigns = campaigns.filter(c => istDay(c.createdAt) === key);
    let sent = sentByDay.get(key) || 0;
    if (sent === 0) {
      for (const c of campaigns) {
        if (Array.isArray(c.results) && c.results.length > 0) continue;
        const activeAt = c.startedAt || c.completedAt || c.createdAt;
        if (istDay(activeAt) === key) sent += (c.sent || 0);
      }
    }
    last7.push({ date: key, campaigns: dayCampaigns.length, sent });
  }
  // Tag counts from the merged set (single count per contact). Previously
  // localTags + local file were summed separately, double-counting imports
  // (import writes tags to both stores).
  const tagCounts = {};
  for (const c of merged) {
    if (Array.isArray(c.tags)) for (const t of c.tags) {
      const s = String(t || '').slice(0, 50);
      if (s) tagCounts[s] = (tagCounts[s] || 0) + 1;
    }
  }
  // Most recently ACTIVE first (completed/started/created), not file order.
  const activeTs = (c) => Date.parse(c.completedAt || c.startedAt || c.createdAt) || 0;
  const recentCampaigns = [...campaigns].sort((a, b) => activeTs(b) - activeTs(a)).slice(0, 5);
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.json({
    totalCustomers,
    totalCampaigns: campaigns.length,
    totalSent, totalFailed,
    deliveryRate: totalSent + totalFailed > 0 ? Math.round((totalSent / (totalSent + totalFailed)) * 100) : 0,
    recentCampaigns, last7, tagCounts,
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

// seed learned blocklist from past 'not registered' failures (one-time catch-up)
seedBlocklistFromResults();

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
  if (err && /import type not allowed/i.test(err.message)) return res.status(400).json({ error: 'only .csv/.xlsx/.xls allowed' });
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
