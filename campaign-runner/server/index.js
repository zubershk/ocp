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
function save(name, data) { writeFileSync(join(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2)); }
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
  const { name, message, imageUrl, recipientTag, scheduledAt } = req.body;
  if (!name || !message) return res.status(400).json({ error: 'name and message required' });
  const c = {
    id: uid(), name, message, imageUrl: imageUrl || '', recipientTag: recipientTag || 'all',
    scheduledAt: scheduledAt || null,
    status: scheduledAt ? 'scheduled' : 'draft',
    sent: 0, failed: 0, total: 0, createdAt: new Date().toISOString(), results: [],
  };
  campaigns.push(c);
  save('campaigns', campaigns);
  res.json(c);
});

app.put('/api/campaigns/:id', (req, res) => {
  const campaigns = load('campaigns');
  const idx = campaigns.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  campaigns[idx] = { ...campaigns[idx], ...req.body };
  save('campaigns', campaigns);
  res.json(campaigns[idx]);
});

app.delete('/api/campaigns/:id', (req, res) => {
  let campaigns = load('campaigns');
  campaigns = campaigns.filter(c => c.id !== req.params.id);
  save('campaigns', campaigns);
  res.json({ ok: true });
});

app.get('/api/campaigns/:id', (req, res) => {
  const c = load('campaigns').find(c => c.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c);
});

app.post('/api/campaigns/:id/send', async (req, res) => {
  const campaigns = load('campaigns');
  const campaign = campaigns.find(c => c.id === req.params.id);
  if (!campaign) return res.status(404).json({ error: 'not found' });
  if (campaign.status === 'sending') return res.status(409).json({ error: 'already sending' });

  // Collect phone numbers from customers
  const settings = load('settings', {});
  let phones = [];

  if (settings.botAdminKey) {
    try {
      const data = await botApi('/admin/customers?limit=2000');
      let customers = data.customers || [];
      if (campaign.recipientTag && campaign.recipientTag !== 'all') {
        const localTags = load('customer_tags', {});
        customers = customers.filter(c => (localTags[c.phone] || []).includes(campaign.recipientTag));
      }
      phones = customers.map(c => c.phone);
    } catch (err) { /* fall through */ }
  }
  if (phones.length === 0) {
    const localCustomers = load('customers');
    let filtered = localCustomers;
    if (campaign.recipientTag && campaign.recipientTag !== 'all') {
      filtered = localCustomers.filter(c => c.tags?.includes(campaign.recipientTag));
    }
    phones = filtered.map(c => c.phone);
  }

  if (phones.length === 0) return res.status(400).json({ error: 'no recipients' });

  campaign.status = 'sending';
  campaign.total = phones.length;
  campaign.sent = 0;
  campaign.failed = 0;
  campaign.results = [];
  campaign.startedAt = new Date().toISOString();
  save('campaigns', campaigns);

  // Send via bot's broadcast endpoint (non-blocking)
  sendCampaignViaBot(campaign, phones).catch(console.error);
  res.json({ ok: true, total: phones.length });
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

  // Send in batches of 20 via bot's broadcast endpoint
  const batchSize = 20;
  for (let i = 0; i < phones.length; i += batchSize) {
    const batch = phones.slice(i, i + batchSize);

    // Check if cancelled
    const fresh = load('campaigns').find(c => c.id === campaign.id);
    if (fresh?.status === 'cancelled') break;

    try {
      const result = await botApi('/admin/broadcast/send', {
        method: 'POST',
        body: JSON.stringify({
          phones: batch,
          message: campaign.message,
          image_url: campaign.imageUrl || '',
        }),
      });

      // Process results
      if (result.results) {
        for (const r of result.results) {
          campaign.results.push({
            phone: r.phone,
            name: '',
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
          campaign.results.push({ phone, ok: false, error: result.error || 'API error', sentAt: new Date().toISOString() });
          campaign.failed++;
        }
      }
    } catch (err) {
      for (const phone of batch) {
        campaign.results.push({ phone, ok: false, error: err.message, sentAt: new Date().toISOString() });
        campaign.failed++;
      }
    }

    // Save progress
    const all = load('campaigns');
    const idx = all.findIndex(c => c.id === campaign.id);
    if (idx !== -1) all[idx] = { ...campaign };
    save('campaigns', all);

    if (i + batchSize < phones.length && delay > 0) {
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

// ═══════════════════════════════════════════
// TEST SEND — via bot's broadcast endpoint
// ═══════════════════════════════════════════
app.post('/api/test-send', async (req, res) => {
  const { phone, message, imageUrl } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });

  try {
    const result = await botApi('/admin/broadcast/send', {
      method: 'POST',
      body: JSON.stringify({ phones: [phone], message, image_url: imageUrl || '' }),
    });
    const r = result.results?.[0];
    res.json({ ok: r?.ok || false, result: r || result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Scheduled campaign checker (every 30s) ──
setInterval(() => {
  const campaigns = load('campaigns');
  const now = new Date();
  let changed = false;
  for (const c of campaigns) {
    if (c.status === 'scheduled' && c.scheduledAt && new Date(c.scheduledAt) <= now) {
      c.status = 'draft';
      changed = true;
    }
  }
  if (changed) save('campaigns', campaigns);
}, 30000);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Campaign Runner on http://localhost:${PORT} — connected to bot`));
