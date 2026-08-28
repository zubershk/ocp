import { useState, useEffect, useRef, useCallback } from 'react';

const API = '';

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json', ...opts.headers }, ...opts });
  return res.json();
}

// ── SVG Icons ──
const Icons = {
  Home: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||20} height={p?.s||20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Users: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||20} height={p?.s||20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Campaign: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||20} height={p?.s||20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
  Send: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||20} height={p?.s||20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>,
  Image: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||20} height={p?.s||20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>,
  Template: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||20} height={p?.s||20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>,
  Settings: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||20} height={p?.s||20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
  Plus: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>,
  Trash: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||14} height={p?.s||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>,
  Upload: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>,
  Download: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>,
  Check: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||14} height={p?.s||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  X: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||14} height={p?.s||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  Search: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  Filter: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  Clock: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Eye: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
  BarChart: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||20} height={p?.s||20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>,
  ChevronDown: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
  Edit: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||14} height={p?.s||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>,
  Copy: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||14} height={p?.s||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>,
  Calendar: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>,
  Zap: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Phone: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  Tag: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>,
  MoreVert: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>,
};

// ── Stat Card ──
function StatCard({ icon, label, value, sub, color = 'brand' }) {
  const bg = { brand: 'bg-brand-50 text-brand-600', green: 'bg-emerald-50 text-emerald-600', red: 'bg-red-50 text-red-600', blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600' };
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${bg[color]} flex items-center justify-center`}>{icon}</div>
        <div>
          <div className="text-2xl font-bold text-zinc-900">{value}</div>
          <div className="text-xs text-zinc-500">{label}</div>
        </div>
      </div>
      {sub && <div className="text-xs text-zinc-400 mt-2">{sub}</div>}
    </div>
  );
}

// ── Modal ──
function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl ${wide ? 'max-w-2xl' : 'max-w-lg'} w-full max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
          <h3 className="font-bold text-zinc-900">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600"><Icons.X /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Input ──
function Input({ label, error, ...props }) {
  return (
    <div>
      {label && <label className="text-xs font-medium text-zinc-500 mb-1 block">{label}</label>}
      <input {...props} className={`w-full px-3 py-2 rounded-xl border ${error ? 'border-red-300 focus:ring-red-500/20 focus:border-red-400' : 'border-stone-200 focus:ring-brand-500/20 focus:border-brand-400'} text-sm focus:outline-none focus:ring-2 transition-colors ${props.className || ''}`} />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ── Badge ──
function Badge({ children, color = 'stone' }) {
  const colors = { stone: 'bg-stone-100 text-zinc-600', brand: 'bg-brand-50 text-brand-700', green: 'bg-emerald-100 text-emerald-700', red: 'bg-red-100 text-red-600', blue: 'bg-blue-100 text-blue-700', amber: 'bg-amber-100 text-amber-700' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>{children}</span>;
}

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [settings, setSettings] = useState({});
  const [botConnected, setBotConnected] = useState(false);

  useEffect(() => { api('/api/settings').then(s => { setSettings(s); if (s.botAdminKey) checkBot(s); }); }, []);
  const checkBot = async (s) => {
    try { await fetch(`${s.botApiUrl || 'http://localhost:8090'}/health`); setBotConnected(true); } catch { setBotConnected(false); }
  };

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Home },
    { id: 'customers', label: 'Customers', icon: Icons.Users },
    { id: 'campaigns', label: 'Campaigns', icon: Icons.Campaign },
    { id: 'templates', label: 'Templates', icon: Icons.Template },
    { id: 'media', label: 'Media', icon: Icons.Image },
    { id: 'settings', label: 'Settings', icon: Icons.Settings },
  ];

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-zinc-900 text-white flex-shrink-0 flex flex-col">
        <div className="px-5 py-5 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            {settings.brandLogo ? (
              <img src={settings.brandLogo} alt="" className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center"><Icons.Send s={16} /></div>
            )}
            <div>
              <div className="text-sm font-bold">{settings.brandName || 'Campaign Runner'}</div>
              <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${botConnected ? 'bg-emerald-400' : 'bg-zinc-600'}`}></span>
                {botConnected ? 'Bot connected' : 'No bot connection'}
              </div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <button key={n.id} onClick={() => setTab(n.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${tab === n.id ? 'bg-brand-600 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
                <Icon s={18} /> {n.label}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-zinc-800">
          <div className="text-[10px] text-zinc-600 text-center">OCP Campaign Runner v2.0</div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6">
          {tab === 'dashboard' && <DashboardView />}
          {tab === 'customers' && <CustomersView />}
          {tab === 'campaigns' && <CampaignsView />}
          {tab === 'templates' && <TemplatesView />}
          {tab === 'media' && <MediaView />}
          {tab === 'settings' && <SettingsView />}
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
function DashboardView() {
  const [dash, setDash] = useState(null);
  const [days, setDays] = useState(7);

  useEffect(() => { api('/api/dashboard').then(setDash); }, []);

  if (!dash) return <div className="flex items-center justify-center h-64 text-zinc-400 text-sm">Loading...</div>;

  const maxSent = Math.max(...dash.last7.map(d => d.sent), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500">Overview of your WhatsApp marketing</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={<Icons.Users s={20} />} label="Total Customers" value={dash.totalCustomers} color="brand" />
        <StatCard icon={<Icons.Campaign s={20} />} label="Total Campaigns" value={dash.totalCampaigns} color="blue" />
        <StatCard icon={<Icons.Send s={20} />} label="Messages Sent" value={dash.totalSent} sub={`${dash.totalFailed} failed`} color="green" />
        <StatCard icon={<Icons.Zap s={20} />} label="Delivery Rate" value={`${dash.deliveryRate}%`} color={dash.deliveryRate >= 90 ? 'green' : dash.deliveryRate >= 70 ? 'amber' : 'red'} />
      </div>

      {/* Activity chart */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        <h3 className="text-sm font-bold text-zinc-900 mb-4">Activity (Last 7 Days)</h3>
        <div className="flex items-end gap-2 h-32">
          {dash.last7.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full bg-brand-100 rounded-t-lg relative" style={{ height: `${Math.max((d.sent / maxSent) * 100, 4)}%` }}>
                <div className="absolute bottom-0 w-full bg-brand-500 rounded-t-lg transition-all" style={{ height: `${Math.max((d.sent / maxSent) * 100, 4)}%` }} />
              </div>
              <div className="text-[10px] text-zinc-400">{d.date.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Recent campaigns */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <h3 className="text-sm font-bold text-zinc-900 mb-3">Recent Campaigns</h3>
          {dash.recentCampaigns.length === 0 ? (
            <p className="text-xs text-zinc-400">No campaigns yet</p>
          ) : (
            <div className="space-y-2">
              {dash.recentCampaigns.map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
                  <div>
                    <div className="text-sm font-medium text-zinc-900">{c.name}</div>
                    <div className="text-xs text-zinc-400">{c.sent} sent</div>
                  </div>
                  <Badge color={c.status === 'done' ? 'green' : c.status === 'sending' ? 'blue' : 'stone'}>{c.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tag breakdown */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <h3 className="text-sm font-bold text-zinc-900 mb-3">Customer Tags</h3>
          {Object.keys(dash.tagCounts).length === 0 ? (
            <p className="text-xs text-zinc-400">No tags yet</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(dash.tagCounts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => (
                <div key={tag} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icons.Tag s={12} />
                    <span className="text-sm text-zinc-700">{tag}</span>
                  </div>
                  <span className="text-sm font-bold text-zinc-900">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════
function CustomersView() {
  const [customers, setCustomers] = useState([]);
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ phone: '', name: '', tags: '', email: '', notes: '' });
  const [importResult, setImportResult] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page, limit: 50 });
    if (search) params.set('search', search);
    if (tagFilter !== 'all') params.set('tag', tagFilter);
    const data = await api(`/api/customers?${params}`);
    setCustomers(data.customers || []);
    setTotal(data.total || 0);
    api('/api/customers/tags').then(setTags);
  }, [page, search, tagFilter]);

  useEffect(() => { load(); }, [load]);

  const saveCustomer = async () => {
    const payload = { ...form, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) };
    if (editing) {
      await api(`/api/customers/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      const res = await api('/api/customers', { method: 'POST', body: JSON.stringify(payload) });
      if (res.error) return alert(res.error);
    }
    setForm({ phone: '', name: '', tags: '', email: '', notes: '' });
    setEditing(null);
    setShowAdd(false);
    load();
  };

  const removeCustomer = async (id) => {
    if (!confirm('Delete this customer?')) return;
    await api(`/api/customers/${id}`, { method: 'DELETE' });
    load();
  };

  const handleFile = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API}/api/customers/import`, { method: 'POST', body: fd });
    const data = await res.json();
    setImportResult(data);
    load();
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.csv')) handleFile(file);
  };

  const exportCsv = () => { window.open(`${API}/api/customers/export`); };

  const clearAll = async () => {
    if (!confirm('Delete ALL customers? This cannot be undone.')) return;
    await api('/api/customers', { method: 'DELETE' });
    load();
  };

  const startEdit = (c) => {
    setForm({ phone: c.phone, name: c.name || '', tags: (c.tags || []).join(', '), email: c.email || '', notes: c.notes || '' });
    setEditing(c);
    setShowAdd(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Customers</h1>
          <p className="text-sm text-zinc-500">{total} contacts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-zinc-700 hover:bg-stone-50 transition-colors"><Icons.Download /> Export</button>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium cursor-pointer hover:bg-stone-50 transition-colors"><Icons.Upload /> Import CSV<input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFile(e.target.files[0])} /></label>
          <button onClick={() => { setForm({ phone: '', name: '', tags: '', email: '', notes: '' }); setEditing(null); setShowAdd(!showAdd); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"><Icons.Plus /> Add Customer</button>
        </div>
      </div>

      {/* Import result */}
      {importResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-emerald-700">Imported {importResult.imported} customers ({importResult.skipped} skipped). Total: {importResult.total}</span>
          <button onClick={() => setImportResult(null)}><Icons.X /></button>
        </div>
      )}

      {/* Drag-drop zone */}
      {dragOver && (
        <div className="fixed inset-0 z-40 bg-brand-50/80 border-4 border-dashed border-brand-400 flex items-center justify-center" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} onDragLeave={() => setDragOver(false)}>
          <div className="text-center"><Icons.Upload s={48} /><p className="text-lg font-bold text-brand-700 mt-2">Drop CSV file here</p></div>
        </div>
      )}

      <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
        {/* Search and filters */}
        <div className="flex gap-3 mb-3">
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"><Icons.Search /></div>
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" placeholder="Search by name or phone..." />
          </div>
          <select value={tagFilter} onChange={(e) => { setTagFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400">
            <option value="all">All Tags</option>
            {tags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {customers.length > 0 && (
            <button onClick={clearAll} className="px-3 py-2 rounded-xl border border-red-200 bg-white text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">Clear All</button>
          )}
        </div>

        {/* Add/Edit form */}
        {showAdd && (
          <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-3 space-y-3">
            <h3 className="text-sm font-bold">{editing ? 'Edit Customer' : 'Add Customer'}</h3>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Phone (10 digits)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="9876543210" disabled={!!editing} />
              <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Customer name" />
              <Input label="Tags (comma-separated)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="regular, vip" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
              <Input label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any notes..." />
            </div>
            <div className="flex gap-2">
              <button onClick={saveCustomer} className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">{editing ? 'Update' : 'Add Customer'}</button>
              <button onClick={() => { setShowAdd(false); setEditing(null); }} className="px-4 py-2 rounded-xl border border-stone-200 text-sm font-medium hover:bg-stone-50 transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          {customers.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-sm">
              <Icons.Users s={32} />
              <p className="mt-2">No customers yet. Import a CSV or add manually.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500 w-12">#</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Phone</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Tags</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Added</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr key={c.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-zinc-400">{(page - 1) * 50 + i + 1}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{c.phone}</td>
                    <td className="px-4 py-2.5 font-medium">{c.name || '—'}</td>
                    <td className="px-4 py-2.5">{(c.tags || []).length > 0 ? c.tags.map(t => <Badge key={t}>{t}</Badge>) : '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500">{c.email || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-400">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(c)} className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600"><Icons.Edit /></button>
                        <button onClick={() => removeCustomer(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500"><Icons.Trash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {total > 50 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-stone-200">
              <span className="text-xs text-zinc-400">Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded-lg border border-stone-200 text-xs font-medium disabled:opacity-40">Prev</button>
                <button onClick={() => setPage(p => p + 1)} disabled={page * 50 >= total} className="px-3 py-1 rounded-lg border border-stone-200 text-xs font-medium disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════
function TemplatesView() {
  const [templates, setTemplates] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', message: '', imageUrl: '', category: 'offer' });

  const load = () => api('/api/templates').then(setTemplates);
  useEffect(() => { load(); }, []);

  const PRESETS = [
    { name: 'Flash Sale', message: 'FLASH SALE! 🔥\n\nGet {discount} off on all items!\nLimited time only. Order now.\n\n{brand_name}', category: 'offer' },
    { name: 'New Arrival', message: 'Introducing our brand new {item}!\n\n{description}\n\nOrder now: {order_link}', category: 'announcement' },
    { name: 'Birthday Wish', message: 'Happy Birthday {name}! 🎂\n\nWishing you a wonderful day. As a gift, enjoy {discount} off your next order!\n\nUse code: BIRTHDAY', category: 'greeting' },
    { name: 'Order Confirmation', message: 'Hi {name}!\n\nYour order #{order_id} has been confirmed.\nEstimated delivery: {time}\n\nThank you for choosing {brand_name}!', category: 'transactional' },
    { name: 'Feedback Request', message: 'Hi {name}!\n\nWe hope you enjoyed your recent order. Could you take a moment to share your feedback?\n\nYour feedback helps us serve you better!', category: 'engagement' },
    { name: 'Re-engagement', message: 'We miss you, {name}! 😊\n\nIt\'s been a while since your last order. Come back and enjoy {discount} off!\n\nUse code: WELCOMEBACK', category: 're-engagement' },
  ];

  const saveTemplate = async () => {
    if (!form.name || !form.message) return alert('Name and message are required');
    if (editing) {
      await api(`/api/templates/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) });
    } else {
      await api('/api/templates', { method: 'POST', body: JSON.stringify(form) });
    }
    setForm({ name: '', message: '', imageUrl: '', category: 'offer' });
    setEditing(null);
    setShowCreate(false);
    load();
  };

  const removeTemplate = async (id) => {
    if (!confirm('Delete this template?')) return;
    await api(`/api/templates/${id}`, { method: 'DELETE' });
    load();
  };

  const usePreset = (p) => {
    setForm({ name: p.name, message: p.message, imageUrl: '', category: p.category });
    setShowCreate(true);
  };

  const startEdit = (t) => {
    setForm({ name: t.name, message: t.message, imageUrl: t.imageUrl || '', category: t.category || 'offer' });
    setEditing(t);
    setShowCreate(true);
  };

  const MERGE_TAGS = ['{name}', '{phone}', '{brand_name}', '{discount}', '{item}', '{description}', '{order_link}', '{order_id}', '{time}'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Message Templates</h1>
          <p className="text-sm text-zinc-500">Reusable messages with merge tags</p>
        </div>
        <button onClick={() => { setForm({ name: '', message: '', imageUrl: '', category: 'offer' }); setEditing(null); setShowCreate(!showCreate); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"><Icons.Plus /> New Template</button>
      </div>

      {/* Merge tags reference */}
      <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3">
        <div className="text-xs font-bold text-brand-700 mb-1">Merge Tags</div>
        <div className="flex flex-wrap gap-1.5">
          {MERGE_TAGS.map(t => (
            <span key={t} className="px-2 py-0.5 rounded-full bg-white border border-brand-200 text-xs font-mono text-brand-700">{t}</span>
          ))}
        </div>
      </div>

      {showCreate && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-3">
          <h3 className="text-sm font-bold">{editing ? 'Edit Template' : 'New Template'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Template Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Weekend Offer" />
            <div>
              <label className="text-xs font-medium text-zinc-500 mb-1 block">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400">
                <option value="offer">Offer</option>
                <option value="announcement">Announcement</option>
                <option value="greeting">Greeting</option>
                <option value="transactional">Transactional</option>
                <option value="engagement">Engagement</option>
                <option value="re-engagement">Re-engagement</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-500 mb-1 block">Message</label>
            <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={6}
              className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 resize-none font-mono" placeholder="Write your template message here. Use merge tags like {name}, {discount}..." />
            <p className="text-xs text-zinc-400 mt-1">{form.message.length} characters</p>
          </div>
          <div className="flex gap-2">
            <button onClick={saveTemplate} className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">{editing ? 'Update' : 'Create Template'}</button>
            <button onClick={() => { setShowCreate(false); setEditing(null); }} className="px-4 py-2 rounded-xl border border-stone-200 text-sm font-medium hover:bg-stone-50 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Presets */}
      {!showCreate && (
        <div>
          <h3 className="text-sm font-bold text-zinc-900 mb-2">Quick Start Presets</h3>
          <div className="grid grid-cols-3 gap-3">
            {PRESETS.map((p, i) => (
              <button key={i} onClick={() => usePreset(p)}
                className="text-left bg-white rounded-2xl border border-stone-200 p-4 hover:border-brand-300 hover:shadow-sm transition-all">
                <Badge color="brand">{p.category}</Badge>
                <div className="text-sm font-bold text-zinc-900 mt-2">{p.name}</div>
                <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{p.message.replace(/\{[^}]+\}/g, '___')}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Saved templates */}
      {templates.length > 0 && !showCreate && (
        <div>
          <h3 className="text-sm font-bold text-zinc-900 mb-2">Saved Templates ({templates.length})</h3>
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="bg-white rounded-2xl border border-stone-200 p-4 flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-zinc-900">{t.name}</span>
                    <Badge>{t.category}</Badge>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 whitespace-pre-line line-clamp-3">{t.message}</p>
                </div>
                <div className="flex gap-1 ml-3">
                  <button onClick={() => startEdit(t)} className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600"><Icons.Edit /></button>
                  <button onClick={() => removeTemplate(t.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500"><Icons.Trash /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// MEDIA LIBRARY
// ═══════════════════════════════════════════
function MediaView() {
  const [media, setMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const load = () => api('/api/media').then(setMedia);
  useEffect(() => { load(); }, []);

  const upload = async (files) => {
    setUploading(true);
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      await fetch(`${API}/api/media/upload`, { method: 'POST', body: fd });
    }
    setUploading(false);
    load();
  };

  const removeMedia = async (id) => {
    if (!confirm('Delete this media item?')) return;
    await api(`/api/media/${id}`, { method: 'DELETE' });
    load();
  };

  const copyUrl = (url) => {
    navigator.clipboard.writeText(`${window.location.origin}${url}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Media Library</h1>
          <p className="text-sm text-zinc-500">{media.length} items</p>
        </div>
        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium cursor-pointer hover:bg-brand-700 transition-colors">
          {uploading ? 'Uploading...' : <><Icons.Plus /> Upload Image</>}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { upload(Array.from(e.target.files)); e.target.value = ''; }} />
        </label>
      </div>

      {media.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center text-zinc-400 text-sm">
          <Icons.Image s={32} />
          <p className="mt-2">No media yet. Upload images for your campaigns.</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {media.map(m => (
            <div key={m.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden group">
              <div className="aspect-square bg-stone-100 relative">
                <img src={m.url} alt={m.originalName} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <button onClick={() => copyUrl(m.url)} className="p-2 rounded-lg bg-white/90 text-zinc-900 hover:bg-white text-xs font-medium inline-flex items-center gap-1"><Icons.Copy /> Copy URL</button>
                  <button onClick={() => removeMedia(m.id)} className="p-2 rounded-lg bg-red-500/90 text-white hover:bg-red-500 text-xs font-medium inline-flex items-center gap-1"><Icons.Trash /> Delete</button>
                </div>
              </div>
              <div className="p-2">
                <div className="text-xs font-medium text-zinc-700 truncate">{m.originalName}</div>
                <div className="text-[10px] text-zinc-400">{new Date(m.uploadedAt).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// CAMPAIGNS (Wizard)
// ═══════════════════════════════════════════
function CampaignsView() {
  const [campaigns, setCampaigns] = useState([]);
  const [step, setStep] = useState(0); // 0=list, 1=compose, 2=recipients, 3=review
  const [compose, setCompose] = useState({ name: '', message: '', imageUrl: '' });
  const [recipientTag, setRecipientTag] = useState('all');
  const [scheduledAt, setScheduledAt] = useState('');
  const [previewPhone, setPreviewPhone] = useState('9876543210');
  const [showProgress, setShowProgress] = useState(null);
  const [liveCampaign, setLiveCampaign] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [tags, setTags] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [settings, setSettings] = useState({});
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState(null);
  const fileRef = useRef();

  const load = () => {
    api('/api/campaigns').then(setCampaigns);
    api('/api/templates').then(setTemplates);
    api('/api/customers/tags').then(setTags);
    api('/api/settings').then(setSettings);
    api('/api/customers/all').then(setCustomers);
  };
  useEffect(() => { load(); }, []);

  // Poll live campaigns
  useEffect(() => {
    const interval = setInterval(() => {
      if (showProgress) {
        api(`/api/campaigns/${showProgress}`).then(c => { setLiveCampaign(c); if (c.status === 'done' || c.status === 'cancelled') { load(); } });
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [showProgress]);

  const recipientCount = recipientTag === 'all' ? customers.length : customers.filter(c => c.tags?.includes(recipientTag)).length;

  const applyTemplate = (t) => {
    setCompose({ ...compose, message: t.message });
  };

  const uploadImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API}/api/media/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    setCompose({ ...compose, imageUrl: data.url });
    e.target.value = '';
  };

  const createCampaign = async () => {
    const res = await api('/api/campaigns', { method: 'POST', body: JSON.stringify({ ...compose, recipientTag, scheduledAt: scheduledAt || null }) });
    if (res.error) return alert(res.error);
    setStep(0);
    setCompose({ name: '', message: '', imageUrl: '' });
    setRecipientTag('all');
    setScheduledAt('');
    load();
  };

  const sendCampaign = async (id) => {
    if (!confirm('Send this campaign to all recipients?')) return;
    await api(`/api/campaigns/${id}/send`, { method: 'POST' });
    setShowProgress(id);
    load();
  };

  const cancelCampaign = async (id) => {
    if (!confirm('Cancel this campaign?')) return;
    await api(`/api/campaigns/${id}/cancel`, { method: 'POST' });
    load();
  };

  const removeCampaign = async (id) => {
    if (!confirm('Delete this campaign?')) return;
    await api(`/api/campaigns/${id}`, { method: 'DELETE' });
    load();
  };

  const testSend = async () => {
    if (!testPhone || !compose.message) return alert('Phone and message required');
    setTestResult(null);
    const res = await api('/api/test-send', { method: 'POST', body: JSON.stringify({ phone: testPhone, message: compose.message, imageUrl: compose.imageUrl }) });
    setTestResult(res);
  };

  const renderPreview = (msg, img) => {
    const phone = previewPhone || '9876543210';
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return (
      <div className="bg-[#e5ddd5] rounded-2xl p-3 max-w-[280px] shadow-sm">
        {img && <img src={img.startsWith('http') ? img : img} alt="" className="rounded-xl mb-1 w-full object-cover max-h-40" />}
        <div className="bg-white rounded-xl px-3 py-2 shadow-sm relative">
          <div className="text-sm text-zinc-900 whitespace-pre-line" style={{ lineHeight: 1.4 }}>{msg || 'Your message here...'}</div>
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] text-zinc-400">{now}</span>
            <span className="text-blue-500"><Icons.Check s={12} /></span>
          </div>
        </div>
      </div>
    );
  };

  // ── Campaign list ──
  if (step === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Campaigns</h1>
            <p className="text-sm text-zinc-500">{campaigns.length} campaigns</p>
          </div>
          <button onClick={() => { setStep(1); setCompose({ name: '', message: '', imageUrl: '' }); setRecipientTag('all'); setScheduledAt(''); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
            <Icons.Plus /> New Campaign
          </button>
        </div>

        {/* Quick test send */}
        <div className="bg-white rounded-2xl border border-stone-200 p-4">
          <h3 className="text-sm font-bold mb-3 inline-flex items-center gap-1.5"><Icons.Zap /> Quick Test Send</h3>
          <div className="flex gap-2 items-end">
            <Input label="Phone" value={testPhone} onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="9876543210" className="!w-36" />
            <div className="flex-1">
              <label className="text-xs font-medium text-zinc-500 mb-1 block">Message</label>
              <input value={compose.message} onChange={(e) => setCompose({ ...compose, message: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" placeholder="Hello! This is a test." />
            </div>
            <button onClick={testSend} className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-black transition-colors whitespace-nowrap">Send Test</button>
          </div>
          {testResult && (
            <div className={`mt-2 text-xs px-3 py-2 rounded-xl ${testResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {testResult.ok ? 'Test sent successfully!' : `Failed: ${JSON.stringify(testResult.error || testResult.result)}`}
            </div>
          )}
        </div>

        {/* Campaign list */}
        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center text-zinc-400 text-sm">No campaigns yet. Create your first one!</div>
          ) : campaigns.slice().reverse().map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-stone-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-zinc-900">{c.name}</span>
                    <Badge color={c.status === 'draft' ? 'stone' : c.status === 'sending' ? 'blue' : c.status === 'scheduled' ? 'amber' : c.status === 'cancelled' ? 'red' : 'green'}>{c.status}</Badge>
                    {c.recipientTag && c.recipientTag !== 'all' && <Badge color="brand">{c.recipientTag}</Badge>}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{c.message}</p>
                  {c.imageUrl && <img src={c.imageUrl} alt="" className="h-16 rounded-lg mt-2 object-cover border border-stone-200" />}
                  {c.status !== 'draft' && (
                    <div className="flex gap-4 mt-2 text-xs">
                      <span className="text-emerald-600 font-bold">{c.sent} sent</span>
                      <span className="text-red-500 font-bold">{c.failed} failed</span>
                      <span className="text-zinc-400">{c.total} total</span>
                      {c.scheduledAt && <span className="text-amber-600 inline-flex items-center gap-1"><Icons.Clock /> {new Date(c.scheduledAt).toLocaleString()}</span>}
                    </div>
                  )}
                  {/* Progress bar for sending */}
                  {c.status === 'sending' && (
                    <div className="mt-2">
                      <div className="w-full bg-stone-100 rounded-full h-2">
                        <div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: `${c.total ? ((c.sent + c.failed) / c.total) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-4">
                  {c.status === 'draft' && (
                    <>
                      <button onClick={() => sendCampaign(c.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors"><Icons.Send s={12} /> Send</button>
                      <button onClick={() => { setCompose({ name: c.name, message: c.message, imageUrl: c.imageUrl }); setRecipientTag(c.recipientTag || 'all'); setStep(1); }} className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600"><Icons.Edit /></button>
                    </>
                  )}
                  {c.status === 'sending' && (
                    <button onClick={() => { setShowProgress(c.id); setLiveCampaign(c); }} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors"><Icons.Eye /> Progress</button>
                  )}
                  {c.status === 'sending' && (
                    <button onClick={() => cancelCampaign(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500"><Icons.X /></button>
                  )}
                  {(c.status === 'draft' || c.status === 'done' || c.status === 'cancelled') && (
                    <button onClick={() => removeCampaign(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500"><Icons.Trash /></button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Live progress modal */}
        {showProgress && liveCampaign && (
          <Modal open={true} onClose={() => { setShowProgress(null); setLiveCampaign(null); load(); }} title={`Sending: ${liveCampaign.name}`} wide>
            <div className="space-y-4">
              <div>
                <div className="w-full bg-stone-100 rounded-full h-3">
                  <div className="bg-brand-500 h-3 rounded-full transition-all" style={{ width: `${liveCampaign.total ? ((liveCampaign.sent + liveCampaign.failed) / liveCampaign.total) * 100 : 0}%` }} />
                </div>
                <div className="flex justify-between mt-2 text-xs text-zinc-500">
                  <span>{liveCampaign.sent + liveCampaign.failed} / {liveCampaign.total}</span>
                  <span>{liveCampaign.sent} sent, {liveCampaign.failed} failed</span>
                </div>
              </div>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {(liveCampaign.results || []).map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${r.ok ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    {r.ok ? <span className="text-emerald-600"><Icons.Check /></span> : <span className="text-red-500"><Icons.X /></span>}
                    <span className="font-mono text-zinc-700">{r.phone}</span>
                    <span className="text-zinc-500">{r.name}</span>
                  </div>
                ))}
              </div>
              {liveCampaign.status === 'done' && (
                <div className="text-center text-sm text-emerald-600 font-bold">Campaign completed!</div>
              )}
              <button onClick={() => { setShowProgress(null); setLiveCampaign(null); load(); }} className="w-full py-2 rounded-xl border border-stone-200 text-sm font-medium hover:bg-stone-50">Close</button>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ── Compose Step ──
  if (step === 1) {
    return (
      <div className="space-y-4">
        <StepIndicator current={1} />
        <div className="grid grid-cols-[1fr_300px] gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
              <h3 className="text-sm font-bold text-zinc-900">Compose Message</h3>
              <Input label="Campaign Name" value={compose.name} onChange={(e) => setCompose({ ...compose, name: e.target.value })} placeholder="e.g. Weekend Special Offer" />
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Message</label>
                <textarea value={compose.message} onChange={(e) => setCompose({ ...compose, message: e.target.value })} rows={8}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 resize-none" placeholder="Write your WhatsApp message here..." />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-zinc-400">{compose.message.length} characters</p>
                  <button onClick={testSend} className="text-xs text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1"><Icons.Zap /> Send Test</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Image (optional)</label>
                <div className="flex gap-2">
                  <input value={compose.imageUrl} onChange={(e) => setCompose({ ...compose, imageUrl: e.target.value })} readOnly
                    className="flex-1 px-3 py-2 rounded-xl border border-stone-200 text-sm bg-stone-50" placeholder="Upload or paste URL" />
                  <label className="px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium cursor-pointer hover:bg-stone-50 inline-flex items-center gap-1">
                    <Icons.Upload /> Upload
                    <input type="file" accept="image/*" className="hidden" onChange={uploadImage} />
                  </label>
                </div>
                {compose.imageUrl && (
                  <div className="mt-2 relative inline-block">
                    <img src={compose.imageUrl.startsWith('http') ? compose.imageUrl : compose.imageUrl} alt="" className="h-32 rounded-xl object-cover border border-stone-200" />
                    <button onClick={() => setCompose({ ...compose, imageUrl: '' })} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"><Icons.X s={12} /></button>
                  </div>
                )}
              </div>
            </div>
            {/* Template picker */}
            {templates.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-200 p-5">
                <h3 className="text-sm font-bold text-zinc-900 mb-3">Use a Template</h3>
                <div className="grid grid-cols-2 gap-2">
                  {templates.map(t => (
                    <button key={t.id} onClick={() => applyTemplate(t)}
                      className="text-left px-3 py-2 rounded-xl border border-stone-200 hover:border-brand-300 hover:bg-brand-50 transition-all">
                      <div className="text-xs font-bold text-zinc-900">{t.name}</div>
                      <div className="text-[10px] text-zinc-400 line-clamp-1">{t.message}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Preview */}
          <div>
            <div className="sticky top-6 space-y-4">
              <div className="bg-white rounded-2xl border border-stone-200 p-4">
                <h4 className="text-xs font-bold text-zinc-500 mb-2">WhatsApp Preview</h4>
                {renderPreview(compose.message, compose.imageUrl)}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(0)} className="flex-1 py-2 rounded-xl border border-stone-200 text-sm font-medium hover:bg-stone-50">Back</button>
                <button onClick={() => { if (!compose.name || !compose.message) return alert('Name and message required'); setStep(2); }} className="flex-1 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700">Next: Recipients</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Recipients Step ──
  if (step === 2) {
    return (
      <div className="space-y-4">
        <StepIndicator current={2} />
        <div className="grid grid-cols-[1fr_300px] gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
              <h3 className="text-sm font-bold text-zinc-900">Who should receive this?</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 hover:border-brand-300 cursor-pointer transition-colors">
                  <input type="radio" name="tag" value="all" checked={recipientTag === 'all'} onChange={() => setRecipientTag('all')} className="accent-brand-600" />
                  <div>
                    <div className="text-sm font-medium text-zinc-900">All Customers</div>
                    <div className="text-xs text-zinc-400">{customers.length} contacts</div>
                  </div>
                </label>
                {tags.map(t => (
                  <label key={t} className="flex items-center gap-3 p-3 rounded-xl border border-stone-200 hover:border-brand-300 cursor-pointer transition-colors">
                    <input type="radio" name="tag" value={t} checked={recipientTag === t} onChange={() => setRecipientTag(t)} className="accent-brand-600" />
                    <div>
                      <div className="text-sm font-medium text-zinc-900">{t}</div>
                      <div className="text-xs text-zinc-400">{customers.filter(c => c.tags?.includes(t)).length} contacts</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-3">
              <h3 className="text-sm font-bold text-zinc-900 inline-flex items-center gap-1.5"><Icons.Calendar /> Schedule (optional)</h3>
              <Input label="Send at" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              <p className="text-xs text-zinc-400">Leave empty to send immediately</p>
            </div>
          </div>
          <div>
            <div className="sticky top-6 space-y-4">
              <div className="bg-white rounded-2xl border border-stone-200 p-4">
                <h4 className="text-xs font-bold text-zinc-500 mb-2">WhatsApp Preview</h4>
                {renderPreview(compose.message, compose.imageUrl)}
              </div>
              <div className="bg-brand-50 rounded-2xl border border-brand-200 p-4 text-center">
                <div className="text-2xl font-bold text-brand-700">{recipientCount}</div>
                <div className="text-xs text-brand-600">recipients will receive this</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="flex-1 py-2 rounded-xl border border-stone-200 text-sm font-medium hover:bg-stone-50">Back</button>
                <button onClick={() => setStep(3)} className="flex-1 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700">Next: Review</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Review Step ──
  if (step === 3) {
    return (
      <div className="space-y-4">
        <StepIndicator current={3} />
        <div className="grid grid-cols-[1fr_300px] gap-6">
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
              <h3 className="text-sm font-bold text-zinc-900">Review & Send</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm"><span className="text-zinc-500">Campaign</span><span className="font-medium text-zinc-900">{compose.name}</span></div>
                <div className="flex justify-between text-sm"><span className="text-zinc-500">Recipients</span><span className="font-medium text-zinc-900">{recipientTag === 'all' ? 'All Customers' : recipientTag} ({recipientCount})</span></div>
                {scheduledAt && <div className="flex justify-between text-sm"><span className="text-zinc-500">Scheduled</span><span className="font-medium text-zinc-900">{new Date(scheduledAt).toLocaleString()}</span></div>}
                {compose.imageUrl && <div className="flex justify-between text-sm"><span className="text-zinc-500">Image</span><span className="font-medium text-emerald-600">Attached</span></div>}
                <div className="border-t border-stone-200 pt-3">
                  <div className="text-xs text-zinc-500 mb-1">Message Preview:</div>
                  <div className="bg-stone-50 rounded-xl p-3 text-sm text-zinc-700 whitespace-pre-line">{compose.message}</div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <div className="sticky top-6 space-y-4">
              <div className="bg-white rounded-2xl border border-stone-200 p-4">
                <h4 className="text-xs font-bold text-zinc-500 mb-2">WhatsApp Preview</h4>
                {renderPreview(compose.message, compose.imageUrl)}
              </div>
              <div className="bg-brand-50 rounded-2xl border border-brand-200 p-4 text-center">
                <div className="text-2xl font-bold text-brand-700">{recipientCount}</div>
                <div className="text-xs text-brand-600">messages will be sent</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="flex-1 py-2 rounded-xl border border-stone-200 text-sm font-medium hover:bg-stone-50">Back</button>
                <button onClick={createCampaign} className="flex-1 py-2 rounded-xl bg-brand-600 text-white text-sm font-bold hover:bg-brand-700 inline-flex items-center justify-center gap-1.5">
                  <Icons.Send s={14} /> {scheduledAt ? 'Schedule Campaign' : 'Send Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

// ── Step Indicator ──
function StepIndicator({ current }) {
  const steps = ['Compose', 'Recipients', 'Review'];
  return (
    <div className="flex items-center gap-2 mb-4">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i + 1 < current ? 'bg-emerald-500 text-white' : i + 1 === current ? 'bg-brand-600 text-white' : 'bg-stone-200 text-zinc-500'}`}>
            {i + 1 < current ? <Icons.Check s={14} /> : i + 1}
          </div>
          <span className={`text-sm font-medium ${i + 1 === current ? 'text-zinc-900' : 'text-zinc-400'}`}>{s}</span>
          {i < steps.length - 1 && <div className={`w-8 h-0.5 ${i + 1 < current ? 'bg-emerald-500' : 'bg-stone-200'}`} />}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════
function SettingsView() {
  const [settings, setSettings] = useState({});
  const [saved, setSaved] = useState(false);
  const logoRef = useRef();

  useEffect(() => { api('/api/settings').then(setSettings); }, []);

  const save = async () => {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const uploadLogo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API}/api/media/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    setSettings({ ...settings, brandLogo: data.url });
    e.target.value = '';
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Settings</h1>
        <p className="text-sm text-zinc-500">Configure your campaign runner</p>
      </div>

      {/* Brand */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-zinc-900">Brand Identity</h3>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Brand Name" value={settings.brandName || ''} onChange={(e) => setSettings({ ...settings, brandName: e.target.value })} placeholder="Your Restaurant Name" />
          <div>
            <label className="text-xs font-medium text-zinc-500 mb-1 block">Brand Color</label>
            <div className="flex gap-2 items-center">
              <input type="color" value={settings.brandColor || '#ea580c'} onChange={(e) => setSettings({ ...settings, brandColor: e.target.value })} className="w-10 h-10 rounded-lg border border-stone-200 cursor-pointer" />
              <input value={settings.brandColor || '#ea580c'} onChange={(e) => setSettings({ ...settings, brandColor: e.target.value })}
                className="flex-1 px-3 py-2 rounded-xl border border-stone-200 text-sm font-mono" />
            </div>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-500 mb-1 block">Brand Logo</label>
          <div className="flex gap-3 items-center">
            <label className="px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium cursor-pointer hover:bg-stone-50 inline-flex items-center gap-1">
              <Icons.Upload /> Upload Logo
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
            </label>
            {settings.brandLogo && <img src={settings.brandLogo} alt="Logo" className="w-10 h-10 rounded-lg object-cover border border-stone-200" />}
          </div>
        </div>
        <Input label="Footer Text" value={settings.footerText || ''} onChange={(e) => setSettings({ ...settings, footerText: e.target.value })} placeholder="Sent via Your Brand" />
      </div>

      {/* Bot Connection */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-zinc-900">Bot Connection</h3>
        <p className="text-xs text-zinc-400">Connect to your OCP Go bot to sync customers and send messages.</p>
        <Input label="Bot API URL" value={settings.botApiUrl || ''} onChange={(e) => setSettings({ ...settings, botApiUrl: e.target.value })} placeholder="http://localhost:8090" />
        <Input label="Admin Key" type="password" value={settings.botAdminKey || ''} onChange={(e) => setSettings({ ...settings, botAdminKey: e.target.value })} placeholder="Your BOT_ADMIN_KEY from .env" />
        <Input label="Delay Between Batches (ms)" type="number" value={settings.delayMs || 3000} onChange={(e) => setSettings({ ...settings, delayMs: parseInt(e.target.value) || 3000 })} />
        <p className="text-xs text-zinc-400">Messages are sent through the bot's Evolution GO integration. Recommended: 3000ms.</p>
      </div>

      <button onClick={save} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
        {saved ? <><Icons.Check /> Saved!</> : 'Save Settings'}
      </button>
    </div>
  );
}
