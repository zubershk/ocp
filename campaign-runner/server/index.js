import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const UPLOADS_DIR = join(ROOT, 'uploads');
for (const d of [DATA_DIR, UPLOADS_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
const upload = multer({ dest: UPLOADS_DIR, limits: { fileSize: 10 * 1024 * 1024 } });

// ── Data helpers ──
function load(name, fb = []) { const p = join(DATA_DIR, `${name}.json`); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : fb; }
// Atomic save (tmp + rename) so concurrent writers (dev + prod on one
// data dir, scheduler ticks) can't truncate each other's files.
function save(name, data) {
  const p = join(DATA_DIR, `${name}.json`);
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, p);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════
app.get('/api/settings', (_req, res) => {
  res.json(load('settings', {
    botApiUrl: 'http://localhost:8090',
    botAdminKey: '',
    delayMs: 3000,
    brandName: '',
    brandLogo: '',
    brandColor: '#ea580c',
    footerText: 'Sent via OCP Campaign Runner',
    defaultCountryCode: '91',
  }));
});
app.put('/api/settings', (req, res) => { save('settings', req.body); res.json({ ok: true }); });

// ── Customer helpers ──
// A sendable number is exactly 10 digits. Longer values are WhatsApp
// LIDs (13–15 digits) captured from LID-mode contacts — not dialable,
// so campaigns must skip them instead of failing per-recipient.
function isSendablePhone(phone) {
  return typeof phone === 'string' && /^[0-9]{10}$/.test(phone);
}
function normPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return d;
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d; // anything else (e.g. 13–15 digit WhatsApp LIDs) stays invalid
}

// All customers from bot (preferred) or local fallback, normalized to
// a common shape { id, phone, name, tags, ... }.
async function allCustomers() {
  const settings = load('settings', {});
  if (settings.botAdminKey) {
    try {
      const data = await botApi('/admin/customers?limit=2000');
      const localTags = load('customer_tags', {});
      return (data.customers || []).map(c => ({
        id: String(c.id), phone: c.phone, name: c.name || '', tags: localTags[c.phone] || [],
        email: c.email || '', total_orders: c.total_orders, total_spent: c.total_spent,
        createdAt: c.created_at, source: 'bot',
      }));
    } catch (err) { /* fall through to local */ }
  }
  return load('customers');
}

// Resolve a campaign's recipients by mode. Returns { phones, skipped }:
// phones are unique sendable 10-digit numbers; skipped counts contacts
// excluded for missing/invalid numbers (e.g. LID rows).
function modeOf(campaign) {
  if (campaign.recipientMode) return campaign.recipientMode;
  if (campaign.recipientTag && campaign.recipientTag !== 'all') return 'tag';
  return 'all';
}

// Sync validator for explicit phone lists (custom mode). Used at
// create-time for immediate feedback; sending re-validates.
function validatePhoneList(list) {
  const seen = new Set();
  let skipped = 0;
  for (const raw of list || []) {
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

// ── Image resolver ──
// Evolution's /send/media accepts only absolute http(s) URLs (fetched
// server-side) or raw base64. A local "/uploads/..." path is neither,
// so resolve it here: read the file and inline it as base64.
function resolveImagePayload(imageUrl) {
  if (!imageUrl) return '';
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  const dm = /^data:image\/[a-z0-9.+-]+;base64,(.*)$/i.exec(imageUrl);
  if (dm) return dm[1];
  const m = /^\/uploads\/([^/]+)$/.exec(imageUrl);
  if (!m) throw new Error('image must be an http(s) URL or a library image');
  const fp = join(UPLOADS_DIR, m[1]);
  if (!existsSync(fp)) throw new Error('image file not found on server');
  const buf = readFileSync(fp);
  if (buf.length > 5 * 1024 * 1024) throw new Error('image too large (max 5MB)');
  return buf.toString('base64');
}

// ── Merge tags ──
// {name} {phone} come from the contact, {brand_name} {time} are built in,
// anything else comes from the campaign's variables object. Unknown tags
// are left untouched so typos stay visible instead of silently blanking.
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

// Sanitize campaign variables: string keys/values, bounded count/size.
function sanitizeVariables(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, val] of Object.entries(v).slice(0, 20)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)) continue;
    out[k] = String(val ?? '').slice(0, 200);
  }
  return out;
}

// ── Bot API helper ──
async function botApi(path, opts = {}) {
  const settings = load('settings', {});
  const url = `${settings.botApiUrl || 'http://localhost:8090'}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': settings.botAdminKey || '', ...opts.headers },
    ...opts,
  });
  return res.json();
}

// ═══════════════════════════════════════════
// CUSTOMERS — synced from bot via /admin/customers
// ═══════════════════════════════════════════
app.get('/api/customers', async (req, res) => {
  const { search = '', page = 1, limit = 50, tag = 'all' } = req.query;
  const settings = load('settings', {});
  if (settings.botAdminKey) {
    // Fetch from bot
    try {
      const data = await botApi(`/admin/customers?search=${encodeURIComponent(search)}&limit=2000`);
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
      // Apply local tags
      const localTags = load('customer_tags', {});
      customers.forEach(c => { c.tags = localTags[c.phone] || []; });
      if (tag && tag !== 'all') customers = customers.filter(c => c.tags.includes(tag));
      const total = customers.length;
      const start = (page - 1) * limit;
      return res.json({ customers: customers.slice(start, start + +limit), total, page: +page, pages: Math.ceil(total / limit) });
    } catch (err) {
      // Fall through to local
    }
  }
  // Local fallback
  let customers = load('customers');
  if (search) { const q = search.toLowerCase(); customers = customers.filter(c => c.phone.includes(q) || c.name?.toLowerCase().includes(q)); }
  if (tag && tag !== 'all') customers = customers.filter(c => c.tags?.includes(tag));
  const total = customers.length;
  const start = (page - 1) * limit;
  res.json({ customers: customers.slice(start, start + +limit), total, page: +page, pages: Math.ceil(total / limit) });
});

app.get('/api/customers/all', async (_req, res) => {
  const settings = load('settings', {});
  if (settings.botAdminKey) {
    try {
      const data = await botApi('/admin/customers?limit=2000');
      const localTags = load('customer_tags', {});
      const customers = (data.customers || []).map(c => ({
        id: String(c.id), phone: c.phone, name: c.name || '', tags: localTags[c.phone] || [],
        email: c.email || '', total_orders: c.total_orders, total_spent: c.total_spent,
        createdAt: c.created_at, source: 'bot',
      }));
      return res.json(customers);
    } catch (err) { /* fall through */ }
  }
  res.json(load('customers'));
});

app.post('/api/customers', (req, res) => {
  const customers = load('customers');
  const { phone, name, tags = [], email, notes } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone required' });
  const normalized = phone.replace(/\D/g, '').slice(-10);
  if (normalized.length !== 10) return res.status(400).json({ error: 'invalid phone' });
  if (customers.some(c => c.phone === normalized)) return res.status(409).json({ error: 'duplicate' });
  const c = { id: uid(), phone: normalized, name: name || '', tags: Array.isArray(tags) ? tags : [tags].filter(Boolean), email: email || '', notes: notes || '', createdAt: new Date().toISOString() };
  customers.push(c);
  save('customers', customers);
  res.json(c);
});

app.put('/api/customers/:id', (req, res) => {
  const customers = load('customers');
  const idx = customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  customers[idx] = { ...customers[idx], ...req.body, phone: customers[idx].phone };
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

// ── Tag management for bot-sourced customers ──
app.post('/api/customers/:phone/tags', (req, res) => {
  const { phone } = req.params;
  const { tags } = req.body;
  const allTags = load('customer_tags', {});
  allTags[phone] = tags || [];
  save('customer_tags', allTags);
  res.json({ ok: true });
});

app.get('/api/customers/tags', (_req, res) => {
  const localTags = load('customer_tags', {});
  const tagSet = new Set();
  Object.values(localTags).forEach(tags => tags.forEach(t => tagSet.add(t)));
  load('customers').forEach(c => c.tags?.forEach(t => tagSet.add(t)));
  res.json([...tagSet].sort());
});

app.post('/api/customers/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const content = readFileSync(req.file.path, 'utf-8');
  unlinkSync(req.file.path);
  const lines = content.split(/\r?\n/).filter(Boolean);
  const customers = load('customers');
  const localTags = load('customer_tags', {});
  let imported = 0, skipped = 0;
  for (const line of lines) {
    const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    const phone = (parts[0] || '').replace(/\D/g, '').slice(-10);
    if (phone.length !== 10) { skipped++; continue; }
    if (customers.some(c => c.phone === phone)) { skipped++; continue; }
    const tags = parts[2] ? parts[2].split(';').map(t => t.trim()).filter(Boolean) : [];
    customers.push({ id: uid(), phone, name: parts[1] || '', tags, email: parts[3] || '', notes: '', createdAt: new Date().toISOString() });
    if (tags.length > 0) localTags[phone] = tags;
    imported++;
  }
  save('customers', customers);
  save('customer_tags', localTags);
  res.json({ imported, skipped, total: customers.length });
});

app.get('/api/customers/export', (_req, res) => {
  const customers = load('customers');
  const csv = 'phone,name,tags,email\n' + customers.map(c => `${c.phone},"${c.name}","${c.tags?.join(';') || ''}","${c.email || ''}"`).join('\n');
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
  const ext = req.file.originalname.split('.').pop();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  renameSync(req.file.path, join(UPLOADS_DIR, filename));
  const media = load('media');
  const item = { id: uid(), filename, originalName: req.file.originalname, url: `/uploads/${filename}`, size: req.file.size, uploadedAt: new Date().toISOString() };
  media.push(item);
  save('media', media);
  res.json(item);
});

app.delete('/api/media/:id', (req, res) => {
  let media = load('media');
  const item = media.find(m => m.id === req.params.id);
  if (item) { const fp = join(UPLOADS_DIR, item.filename); if (existsSync(fp)) unlinkSync(fp); }
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
  const t = { id: uid(), ...req.body, createdAt: new Date().toISOString() };
  templates.push(t);
  save('templates', templates);
  res.json(t);
});

app.put('/api/templates/:id', (req, res) => {
  const templates = load('templates');
  const idx = templates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  templates[idx] = { ...templates[idx], ...req.body };
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
app.get('/api/campaigns', (_req, res) => { res.json(load('campaigns')); });

app.post('/api/campaigns', (req, res) => {
  const campaigns = load('campaigns');
  const { name, message, imageUrl, recipientTag, recipientMode, recipientPhones, scheduledAt } = req.body;
  if (!name || !message) return res.status(400).json({ error: 'name and message required' });
  const mode = recipientMode || (recipientTag && recipientTag !== 'all' ? 'tag' : 'all');
  if (!['all', 'tag', 'custom'].includes(mode)) return res.status(400).json({ error: 'invalid recipient mode' });
  let phones = [];
  if (mode === 'custom') {
    const v = validatePhoneList(recipientPhones);
    if (v.phones.length === 0) return res.status(400).json({ error: 'select at least one valid contact' });
    phones = v.phones;
  }
  const c = {
    id: uid(), name, message, imageUrl: imageUrl || '',
    recipientMode: mode, recipientTag: mode === 'tag' ? (recipientTag || 'all') : 'all',
    recipientPhones: mode === 'custom' ? phones : [],
    variables: sanitizeVariables(req.body.variables),
    scheduledAt: scheduledAt || null,
    status: scheduledAt ? 'scheduled' : 'draft',
    sent: 0, failed: 0, skipped: 0, total: 0, createdAt: new Date().toISOString(), results: [],
  };
  campaigns.push(c);
  save('campaigns', campaigns);
  res.json(c);
});

app.put('/api/campaigns/:id', (req, res) => {
  const campaigns = load('campaigns');
  const idx = campaigns.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const body = { ...req.body };
  if (body.variables !== undefined) body.variables = sanitizeVariables(body.variables);
  if (body.recipientPhones !== undefined) body.recipientPhones = validatePhoneList(body.recipientPhones).phones;
  campaigns[idx] = { ...campaigns[idx], ...body };
  save('campaigns', campaigns);
  res.json(campaigns[idx]);
});

app.delete('/api/campaigns/:id', (req, res) => {
  let campaigns = load('campaigns');
  campaigns = campaigns.filter(c => c.id !== req.params.id);
  save('campaigns', campaigns);
  res.json({ ok: true });
});

// Duplicate a campaign for reuse: fresh draft copy, stats reset,
// schedule cleared so it never auto-fires on creation.
app.post('/api/campaigns/:id/duplicate', (req, res) => {
  const campaigns = load('campaigns');
  const src = campaigns.find(c => c.id === req.params.id);
  if (!src) return res.status(404).json({ error: 'not found' });
  const c = {
    id: uid(), name: `${src.name} (copy)`, message: src.message, imageUrl: src.imageUrl || '',
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
  res.json(c);
});

// Preview recipient resolution before creating/sending:
// { recipientMode, recipientTag, recipientPhones } -> { sendable, skipped }
app.post('/api/campaigns/preview-recipients', async (req, res) => {
  const { phones, skipped } = await resolvePhonesAsync({
    recipientMode: req.body.recipientMode || 'all',
    recipientTag: req.body.recipientTag || 'all',
    recipientPhones: req.body.recipientPhones || [],
  });
  res.json({ sendable: phones.length, skipped });
});

// Shared send kickoff used by the manual send route and the
// scheduler. Resolves recipients, marks the campaign sending, and
// starts background delivery. Returns { ok, total, skipped } or
// { error, status }.
async function startSend(id) {
  const campaigns = load('campaigns');
  const campaign = campaigns.find(c => c.id === id);
  if (!campaign) return { error: 'not found', status: 404 };
  if (campaign.status === 'sending') return { error: 'already sending', status: 409 };
  if (campaign.status === 'done') return { error: 'already sent', status: 409 };

  const { phones, skipped } = await resolvePhonesAsync(campaign);
  if (phones.length === 0) return { error: skipped > 0 ? `no sendable recipients (${skipped} invalid skipped)` : 'no recipients', status: 400 };

  campaign.status = 'sending';
  campaign.total = phones.length;
  campaign.sent = 0;
  campaign.failed = 0;
  campaign.skipped = skipped;
  campaign.results = [];
  campaign.startedAt = new Date().toISOString();
  save('campaigns', campaigns);

  // Send via bot's broadcast endpoint (non-blocking)
  sendCampaignViaBot(campaign, phones).catch(console.error);
  return { ok: true, total: phones.length, skipped };
}

app.post('/api/campaigns/:id/send', async (req, res) => {
  const r = await startSend(req.params.id);
  if (r.error) return res.status(r.status || 400).json({ error: r.error });
  res.json({ ok: true, total: r.total, skipped: r.skipped });
});

app.post('/api/campaigns/:id/cancel', (req, res) => {
  const campaigns = load('campaigns');
  const c = campaigns.find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  c.status = 'cancelled';
  save('campaigns', campaigns);
  res.json({ ok: true });
});

async function sendCampaignViaBot(campaign, phones) {
  const settings = load('settings', {});
  const delay = settings.delayMs || 3000;

  // Resolve the image once: local library paths must become base64,
  // otherwise every recipient fails at evolution with "invalid base64".
  let image = '';
  try {
    image = resolveImagePayload(campaign.imageUrl);
  } catch (err) {
    for (const phone of phones) {
      campaign.results.push({ phone, ok: false, error: err.message, sentAt: new Date().toISOString() });
      campaign.failed++;
    }
    campaign.status = 'done';
    campaign.completedAt = new Date().toISOString();
    const all = load('campaigns');
    const idx = all.findIndex(c => c.id === campaign.id);
    if (idx !== -1) all[idx] = { ...campaign };
    save('campaigns', all);
    return;
  }

  // Render per recipient (merge tags), then group identical texts so
  // untagged campaigns still send in bulk while personalized ones fan
  // out per unique rendering.
  const batchSize = 20;
  const customers = await allCustomers();
  const byPhone = new Map(customers.map(c => [normPhone(c.phone), c]));
  const groups = new Map(); // rendered text -> phones[]
  for (const phone of phones) {
    const contact = byPhone.get(phone) || { phone, name: '' };
    const text = renderMessage(campaign.message, contact, settings, campaign.variables);
    if (!groups.has(text)) groups.set(text, []);
    groups.get(text).push(phone);
  }
  // Flatten groups into send batches (<=20), keeping each batch uniform.
  const batches = [];
  for (const [text, list] of groups) {
    for (let i = 0; i < list.length; i += batchSize) batches.push({ text, phones: list.slice(i, i + batchSize) });
  }

  // Send in batches of 20 via bot's broadcast endpoint
  for (let bi = 0; bi < batches.length; bi++) {
    const { text, phones: batch } = batches[bi];

    // Check if cancelled
    const fresh = load('campaigns').find(c => c.id === campaign.id);
    if (fresh?.status === 'cancelled') break;

    try {
      const result = await botApi('/admin/broadcast/send', {
        method: 'POST',
        body: JSON.stringify({
          phones: batch,
          message: text,
          image_url: image,
        }),
      });

      // Process results
      if (result.results) {
        for (const r of result.results) {
          campaign.results.push({
            phone: r.phone,
            name: byPhone.get(r.phone)?.name || '',
            ok: r.ok,
            error: r.error || null,
            sentAt: new Date().toISOString(),
          });
          if (r.ok) campaign.sent++;
          else campaign.failed++;
        }
      } else {
        // API error — mark all as failed
        for (const phone of batch) {
          campaign.results.push({ phone, name: byPhone.get(phone)?.name || '', ok: false, error: result.error || 'API error', sentAt: new Date().toISOString() });
          campaign.failed++;
        }
      }
    } catch (err) {
      for (const phone of batch) {
        campaign.results.push({ phone, name: byPhone.get(phone)?.name || '', ok: false, error: err.message, sentAt: new Date().toISOString() });
        campaign.failed++;
      }
    }

    // Save progress
    const all = load('campaigns');
    const idx = all.findIndex(c => c.id === campaign.id);
    if (idx !== -1) all[idx] = { ...campaign };
    save('campaigns', all);

    if (bi + 1 < batches.length && delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  campaign.status = 'done';
  campaign.completedAt = new Date().toISOString();
  const all = load('campaigns');
  const idx = all.findIndex(c => c.id === campaign.id);
  if (idx !== -1) all[idx] = { ...campaign };
  save('campaigns', all);
}

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
app.get('/api/dashboard', async (_req, res) => {
  const campaigns = load('campaigns');
  const settings = load('settings', {});
  let totalCustomers = 0;

  if (settings.botAdminKey) {
    try {
      const data = await botApi('/admin/customers?limit=1');
      totalCustomers = data.total || 0;
    } catch (err) { /* fall through */ }
  }
  if (totalCustomers === 0) {
    totalCustomers = load('customers').length;
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
  Object.values(localTags).forEach(tags => tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  load('customers').forEach(c => (c.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));

  res.json({
    totalCustomers,
    totalCampaigns: campaigns.length,
    totalSent, totalFailed,
    deliveryRate: totalSent + totalFailed > 0 ? Math.round((totalSent / (totalSent + totalFailed)) * 100) : 0,
    recentCampaigns: campaigns.slice(-5).reverse(),
    last7, tagCounts,
  });
});

// Bot connectivity probe for the UI (same-origin, so no CORS;
// honors the configured botApiUrl unlike a browser-side fetch).
app.get('/api/bot-health', async (_req, res) => {
  try {
    await botApi('/health');
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════
// TEST SEND — via bot's broadcast endpoint
// ═══════════════════════════════════════════
app.post('/api/test-send', async (req, res) => {
  const { phone, message, imageUrl, variables } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });

  let image = '';
  try {
    image = resolveImagePayload(imageUrl);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    const settings = load('settings', {});
    const customers = await allCustomers();
    const contact = customers.find(c => normPhone(c.phone) === normPhone(phone)) || { phone, name: '' };
    const text = renderMessage(message, contact, settings, sanitizeVariables(variables));
    const result = await botApi('/admin/broadcast/send', {
      method: 'POST',
      body: JSON.stringify({ phones: [normPhone(phone)], message: text, image_url: image }),
    });
    const r = result.results?.[0];
    res.json({ ok: r?.ok || false, result: r || result, rendered: text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Scheduled campaign checker (every 30s) ──
// Due scheduled campaigns are sent automatically, not demoted.
setInterval(async () => {
  const campaigns = load('campaigns');
  const now = new Date();
  for (const c of campaigns) {
    if (c.status === 'scheduled' && c.scheduledAt && new Date(c.scheduledAt) <= now) {
      console.log(`[scheduler] firing campaign ${c.id} (${c.name})`);
      const r = await startSend(c.id);
      if (r.error) {
        console.log(`[scheduler] campaign ${c.id} could not start: ${r.error}`);
        const all = load('campaigns');
        const idx = all.findIndex(x => x.id === c.id);
        if (idx !== -1) { all[idx].status = 'draft'; all[idx].scheduledAt = null; save('campaigns', all); }
      }
    }
  }
}, 30000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Campaign Runner on http://localhost:${PORT} — connected to bot`));
