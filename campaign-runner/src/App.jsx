import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { UsersIcon, MegaphoneIcon, SendIcon, TrendingDownIcon } from 'lucide-react';
import { cn } from './lib/utils';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui';
import StatisticsWithStatus from './components/statistics-with-status';

const API = '';

function getAdminKey() {
  try {
    const saved = localStorage.getItem('ocp_campaign_admin_key');
    if (saved) return saved;
  } catch { /* ignore */ }
  try { return import.meta.env?.VITE_CAMPAIGN_ADMIN_KEY || ''; } catch { return ''; }
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  // bot-health and health are public; all other /api/* require X-Admin-Key
  if (!path.includes('/api/bot-health') && !path.includes('/health')) {
    const k = getAdminKey();
    if (k) headers['X-Admin-Key'] = k;
  }
  const res = await fetch(`${API}${path}`, { headers, ...opts });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const err = new Error(data?.error || `request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ── In-app dialogs (replaces native confirm()/alert()) ──
const DialogContext = createContext(null);
function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>');
  return ctx;
}
function DialogProvider({ children }) {
  const [confirmState, setConfirmState] = useState(null);
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const toast = useCallback((message, kind = 'error') => {
    const id = ++toastId.current;
    setToasts(prev => [...prev.slice(-2), { id, message: String(message || 'Something went wrong'), kind }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // confirm(message, { title, confirmLabel, danger }) → Promise<boolean>
  const confirm = useCallback((message, opts = {}) => new Promise((resolve) => {
    setConfirmState({
      message,
      title: opts.title || 'Please confirm',
      confirmLabel: opts.confirmLabel || (opts.danger === false ? 'Confirm' : 'Delete'),
      danger: opts.danger !== false,
      resolve,
    });
  }), []);

  const settle = useCallback((value) => {
    setConfirmState(prev => {
      if (prev) setTimeout(() => prev.resolve(value), 0);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!confirmState) return;
    const onKey = (e) => { if (e.key === 'Escape') settle(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmState, settle]);

  const toastStyles = {
    error: 'bg-red-50 border-red-200 text-red-700',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    info: 'bg-white border-stone-200 text-zinc-700',
  };

  return (
    <DialogContext.Provider value={{ confirm, toast }}>
      {children}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => settle(false)}>
          <div role="alertdialog" aria-modal="true" aria-label={confirmState.title}
            className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-zinc-900">{confirmState.title}</h3>
            <p className="text-sm text-zinc-500 mt-1">{confirmState.message}</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => settle(false)}
                className="px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-zinc-700 hover:bg-stone-50 transition-colors">
                Cancel
              </button>
              <button autoFocus onClick={() => settle(true)}
                className={cn('px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors',
                  confirmState.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700')}>
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
          {toasts.map(t => (
            <button key={t.id} onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className={cn('text-left text-sm font-medium px-4 py-3 rounded-xl border shadow-lg', toastStyles[t.kind] || toastStyles.info)}>
              {t.message}
            </button>
          ))}
        </div>
      )}
    </DialogContext.Provider>
  );
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
  Menu: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||18} height={p?.s||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>,
  ChevronsLeft: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||14} height={p?.s||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>,
  ChevronsRight: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||14} height={p?.s||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m13 17 5-5-5-5"/><path d="m6 17 5-5-5-5"/></svg>,
  Search: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  Filter: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  Clock: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Eye: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
  BarChart: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||20} height={p?.s||20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>,
  ChevronDown: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
  ChevronLeft: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  ChevronRight: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>,
  Edit: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||14} height={p?.s||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>,
  Copy: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||14} height={p?.s||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>,
  Calendar: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>,
  Zap: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Phone: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  Tag: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>,
  MoreVert: (p) => <svg xmlns="http://www.w3.org/2000/svg" width={p?.s||16} height={p?.s||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>,
};

// ── Modal ──
function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className={cn('bg-white rounded-2xl w-full max-h-[90vh] overflow-y-auto', { 'max-w-2xl': wide, 'max-w-lg': !wide })} onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-stone-200">
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
      <input {...props} className={cn('w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-colors', {
        'border-red-300 focus:ring-red-500/20 focus:border-red-400': error,
        'border-stone-200 focus:ring-brand-500/20 focus:border-brand-400': !error,
      }, props.className)} />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ── Primitives live in ./components/ui (Badge, Card family) ──

// ── Empty state ──
function Empty({ icon, title, hint, action }) {
  return (
    <div className="p-8 text-center">
      <div className="mx-auto size-11 rounded-2xl bg-stone-100 text-zinc-400 flex items-center justify-center">{icon}</div>
      <p className="mt-2.5 text-sm font-bold text-zinc-900">{title}</p>
      {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ── DateTimePicker (calendar + inline time, datetime-local value) ──
const pad2 = (n) => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
function splitDateTime(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v || '');
  if (!m) return null;
  return { y: +m[1], mo: +m[2] - 1, d: +m[3], h: m[4] != null ? +m[4] : null, mi: m[5] != null ? +m[5] : null };
}
function toKey(y, mo, d, h, mi) {
  return `${y}-${pad2(mo + 1)}-${pad2(d)}T${pad2(h)}:${pad2(mi)}`;
}
function DateTimePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const parsed = splitDateTime(value);
  const today = new Date();
  const [viewY, setViewY] = useState(parsed ? parsed.y : today.getFullYear());
  const [viewMo, setViewMo] = useState(parsed ? parsed.mo : today.getMonth());

  const emit = (y, mo, d, h, mi) => onChange(toKey(y, mo, d, h, mi));
  const curH = parsed && parsed.h != null ? parsed.h : 10;
  const curMi = parsed && parsed.mi != null ? parsed.mi : 0;

  const move = (delta) => {
    let y = viewY, mo = viewMo + delta;
    while (mo < 0) { mo += 12; y -= 1; }
    while (mo > 11) { mo -= 12; y += 1; }
    setViewY(y); setViewMo(mo);
  };

  // 42 cells, Sunday-first, like the shadcn calendar grid
  const firstDow = new Date(viewY, viewMo, 1).getDay();
  const dim = new Date(viewY, viewMo + 1, 0).getDate();
  const prevDim = new Date(viewY, viewMo, 0).getDate();
  const cells = [];
  for (let i = firstDow - 1; i >= 0; i--) cells.push({ d: prevDim - i, outside: true, y: viewMo === 0 ? viewY - 1 : viewY, mo: (viewMo + 11) % 12 });
  for (let d = 1; d <= dim; d++) cells.push({ d, outside: false, y: viewY, mo: viewMo });
  let nextD = 1;
  while (cells.length < 42) {
    cells.push({ d: nextD++, outside: true, y: viewMo === 11 ? viewY + 1 : viewY, mo: (viewMo + 1) % 12 });
  }
  const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const selKey = parsed ? `${parsed.y}-${pad2(parsed.mo + 1)}-${pad2(parsed.d)}` : null;

  const label = parsed
    ? new Date(parsed.y, parsed.mo, parsed.d, curH, curMi).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'Pick date and time';

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm flex items-center gap-2 hover:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400">
        <span className="text-zinc-400"><Icons.Calendar s={14} /></span>
        <span className={parsed ? 'text-zinc-900 font-medium' : 'text-zinc-400'}>{label}</span>
        {parsed && <span className="ml-auto text-zinc-300 hover:text-zinc-500" onClick={(e) => { e.stopPropagation(); onChange(''); }}><Icons.X s={13} /></span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1.5 bg-white rounded-2xl border border-stone-200 shadow-xl p-3 w-[290px] max-w-[calc(100vw-2rem)]">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <button type="button" onClick={() => move(-1)} className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-500"><Icons.ChevronLeft s={15} /></button>
              <div className="text-sm font-bold text-zinc-900">{MONTHS[viewMo]} {viewY}</div>
              <button type="button" onClick={() => move(1)} className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-500"><Icons.ChevronRight s={15} /></button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WDAYS.map(w => <div key={w} className="text-[10px] font-bold text-zinc-400 py-1">{w}</div>)}
              {cells.map((c, i) => {
                const key = `${c.y}-${pad2(c.mo + 1)}-${pad2(c.d)}`;
                const isSel = !c.outside && key === selKey;
                const isToday = key === todayKey;
                const past = !c.outside && key < todayKey;
                return (
                  <button
                    key={i} type="button" disabled={past}
                    onClick={() => emit(c.y, c.mo, c.d, curH, curMi)}
                    className={cn('h-8 rounded-lg text-xs transition-colors', {
                      'bg-brand-600 text-white font-bold': isSel,
                      'text-zinc-300 cursor-not-allowed': !isSel && past,
                      'text-zinc-300 hover:bg-stone-50': !isSel && !past && c.outside,
                      'font-bold text-brand-700 ring-1 ring-brand-400': !isSel && !past && !c.outside && isToday,
                      'text-zinc-700 hover:bg-stone-100': !isSel && !past && !c.outside && !isToday,
                    })}
                  >{c.d}</button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-stone-100">
              <span className="text-zinc-400"><Icons.Clock s={13} /></span>
              <select aria-label="Hour" value={curH} onChange={(e) => { const p = splitDateTime(value) || { y: viewY, mo: viewMo, d: today.getDate() }; emit(p.y, p.mo, p.d, +e.target.value, p.mi ?? 0); }}
                className="flex-1 px-2 py-1.5 rounded-lg border border-stone-200 text-xs font-medium focus:outline-none focus:border-brand-400 bg-white">
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{pad2(h)}</option>)}
              </select>
              <span className="text-zinc-400 font-bold">:</span>
              <select aria-label="Minute" value={curMi} onChange={(e) => { const p = splitDateTime(value) || { y: viewY, mo: viewMo, d: today.getDate() }; emit(p.y, p.mo, p.d, p.h ?? 10, +e.target.value); }}
                className="flex-1 px-2 py-1.5 rounded-lg border border-stone-200 text-xs font-medium focus:outline-none focus:border-brand-400 bg-white">
                {Array.from({ length: 12 }, (_, k) => k * 5).map(m => <option key={m} value={m}>{pad2(m)}</option>)}
              </select>
              <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:bg-stone-100">Clear</button>
              <button type="button" onClick={() => setOpen(false)} className="px-2.5 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-bold hover:bg-brand-700">Done</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [settings, setSettings] = useState({});
  const [botConnected, setBotConnected] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('ocp_nav_collapsed') === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { api('/api/settings').then(s => { setSettings(s); checkBot(s); }).catch(() => { checkBot({}); }); }, []);
  const checkBot = async (s) => {
    // Same-origin probe via the runner backend (a direct browser fetch to
    // :8090 would be blocked by the bot's CORS allow-list).
    try { const r = await api('/api/bot-health'); setBotConnected(!!r.ok); } catch { setBotConnected(false); }
  };

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Home },
    { id: 'customers', label: 'Customers', icon: Icons.Users },
    { id: 'campaigns', label: 'Campaigns', icon: Icons.Campaign },
    { id: 'templates', label: 'Templates', icon: Icons.Template },
    { id: 'media', label: 'Media', icon: Icons.Image },
    { id: 'settings', label: 'Settings', icon: Icons.Settings },
  ];

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      try { localStorage.setItem('ocp_nav_collapsed', prev ? '0' : '1'); } catch { /* ignore */ }
      return !prev;
    });
  };
  const go = (id) => { setTab(id); setMobileOpen(false); };

  const sidebarBody = (overlay) => (
    <>
      <div className={cn('px-5 py-5 border-b border-zinc-800', collapsed && !overlay && 'px-0 flex justify-center')}>
        <div className={cn('flex items-center gap-2.5', collapsed && !overlay && 'justify-center')}>
          {settings.brandLogo ? (
            <img src={settings.brandLogo} alt="" className="size-8 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="size-8 rounded-lg bg-brand-600 flex items-center justify-center shrink-0"><Icons.Send s={16} /></div>
          )}
          {(!collapsed || overlay) && (
            <div className="min-w-0">
              <div className="text-sm font-bold truncate">{settings.brandName || 'Campaign Runner'}</div>
              <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                <span className={cn('size-1.5 rounded-full shrink-0', { 'bg-emerald-400': botConnected, 'bg-zinc-600': !botConnected })}></span>
                {botConnected ? 'Bot connected' : 'No bot connection'}
              </div>
            </div>
          )}
        </div>
      </div>
      <nav className="flex-1 p-3 flex flex-col gap-1 overflow-y-auto" aria-label="Primary">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = tab === n.id;
          return (
            <button key={n.id} onClick={() => go(n.id)} title={collapsed && !overlay ? n.label : undefined}
              aria-current={active ? 'page' : undefined}
              className={cn('w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors', collapsed && !overlay && 'justify-center px-0', {
                'bg-brand-600 text-white': active,
                'text-zinc-400 hover:bg-zinc-800 hover:text-white': !active,
              })}>
              <Icon s={18} /> {(!collapsed || overlay) && n.label}
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-zinc-800 flex items-center gap-2">
        <button onClick={overlay ? () => setMobileOpen(false) : toggleCollapsed}
          title={overlay ? 'Close menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={overlay ? 'Close menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors">
          {overlay ? <Icons.X s={14} /> : collapsed ? <Icons.ChevronsRight s={14} /> : <><Icons.ChevronsLeft s={14} /> Collapse</>}
        </button>
        {(!collapsed || overlay) && <div className="text-[10px] text-zinc-600 text-center">OCP v2.0</div>}
      </div>
    </>
  );

  return (
    <DialogProvider>
    <div className="min-h-screen bg-stone-50 flex">
      {/* Desktop sidebar */}
      <aside className={cn('hidden md:flex bg-zinc-950 text-white flex-shrink-0 flex-col transition-[width] sticky top-0 h-screen', collapsed ? 'w-[68px]' : 'w-60')}>
        {sidebarBody(false)}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button aria-label="Close menu" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-black/50 cursor-default" />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-zinc-950 text-white flex flex-col">
            {sidebarBody(true)}
          </aside>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-2 px-4 py-3 bg-stone-50/95 backdrop-blur border-b border-stone-200">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="p-2 rounded-xl border border-stone-200 bg-white text-zinc-700">
            <Icons.Menu s={16} />
          </button>
          <span className="text-sm font-bold text-zinc-900 truncate">{settings.brandName || 'Campaign Runner'}</span>
          <span className={cn('ml-auto size-2 rounded-full shrink-0', { 'bg-emerald-500': botConnected, 'bg-zinc-300': !botConnected })} title={botConnected ? 'Bot connected' : 'No bot connection'} />
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
          {tab === 'dashboard' && <DashboardView />}
          {tab === 'customers' && <CustomersView />}
          {tab === 'campaigns' && <CampaignsView />}
          {tab === 'templates' && <TemplatesView />}
          {tab === 'media' && <MediaView />}
          {tab === 'settings' && <SettingsView />}
        </div>
      </main>
    </div>
    </DialogProvider>
  );
}

// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
function DashboardView() {
  const [dash, setDash] = useState(null);
  const [dashErr, setDashErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadDash = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const d = await api('/api/dashboard');
      setDash(d);
      setDashErr('');
    } catch (e) {
      setDashErr(e?.message || 'load failed');
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Refetch on mount, every 15s while visible, and when the tab regains focus —
  // sends completing elsewhere (other tab, scheduler, background worker) show up.
  useEffect(() => {
    loadDash();
    const t = setInterval(() => { if (!document.hidden) loadDash(true); }, 15000);
    const onFocus = () => loadDash(true);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [loadDash]);

  if (dashErr) {
    const hint = dashErr === 'unauthorized'
      ? 'Unauthorized — paste your BOT_ADMIN_KEY in Settings (stored locally as ocp_campaign_admin_key).'
      : dashErr === 'admin key not configured'
        ? 'Server misconfigured — set BOT_ADMIN_KEY in campaign-runner/.env (or root .env / bot/.env) and restart npm run dev.'
        : dashErr;
    return <div className="flex items-center justify-center h-64 text-zinc-400 text-sm">Dashboard unavailable: {hint}</div>;
  }

  if (!dash) return <div className="flex items-center justify-center h-64 text-zinc-400 text-sm">Loading...</div>;

  const maxSent = Math.max(...dash.last7.map(d => d.sent), 1);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500">Overview of your WhatsApp marketing</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatisticsWithStatus title="Total Customers" value={dash.totalCustomers} status="within" range={`${dash.totalCustomers} contacts`} icon={<UsersIcon />} />
        <StatisticsWithStatus title="Total Campaigns" value={dash.totalCampaigns} status="observe" range="All time" icon={<MegaphoneIcon />} />
        <StatisticsWithStatus title="Messages Sent" value={dash.totalSent} status={dash.totalFailed > 0 ? 'observe' : 'within'} range={`${dash.totalFailed} failed`} icon={<SendIcon />} />
        <StatisticsWithStatus title="Delivery Rate" value={`${dash.deliveryRate}%`} status={dash.deliveryRate >= 90 ? 'within' : dash.deliveryRate >= 70 ? 'observe' : 'exceed'} range="Target: 90%" icon={<TrendingDownIcon />} />
      </div>

      {/* Activity chart */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-zinc-900">Activity (Last 7 Days)</h3>
          <button onClick={() => loadDash()} disabled={refreshing} title="Refresh dashboard"
            className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600 disabled:opacity-40 text-xs font-medium inline-flex items-center gap-1">
            <Icons.Clock s={14} /> {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
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

      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent campaigns */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <h3 className="text-sm font-bold text-zinc-900 mb-3">Recent Campaigns</h3>
          {dash.recentCampaigns.length === 0 ? (
            <p className="text-xs text-zinc-400">No campaigns yet</p>
          ) : (
            <div className="flex flex-col gap-2">
              {dash.recentCampaigns.map(c => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-stone-100 last:border-0">
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
            <div className="flex flex-col gap-2">
              {Object.entries(dash.tagCounts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => (
                <div key={tag} className="flex flex-wrap items-center justify-between gap-3">
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
  const { confirm, toast } = useDialog();
  const [customers, setCustomers] = useState([]);
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [tagMode, setTagMode] = useState('any');
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [preset, setPreset] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [year, setYear] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [month, setMonth] = useState('');
  const [dateBy, setDateBy] = useState('added');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState('desc');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ phone: '', name: '', tags: '', email: '', notes: '' });
  const [importResult, setImportResult] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState([]); // customer ids (may span pages)
  const [bulkTag, setBulkTag] = useState('');
  const [bulkMode, setBulkMode] = useState('add');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [columns, setColumns] = useState(() => {
    const def = { phone: true, name: true, tags: true, email: true, added: true, source: true, orders: false, lastseen: false };
    try { return { ...def, ...JSON.parse(localStorage.getItem('ocp_customer_cols') || '{}') }; } catch { return def; }
  });
  const [showCols, setShowCols] = useState(false);
  const [detail, setDetail] = useState(null);
  const [msgIds, setMsgIds] = useState([]);
  const [msgLabel, setMsgLabel] = useState('');
  const [msgText, setMsgText] = useState('');
  const [msgBusy, setMsgBusy] = useState(false);
  const [views, setViews] = useState(() => { try { return JSON.parse(localStorage.getItem('ocp_customer_views') || '[]'); } catch { return []; } });
  const [showViews, setShowViews] = useState(false);
  const [viewName, setViewName] = useState('');
  const fileRef = useRef();

  const YEARS = useRef((() => { const y = new Date().getFullYear(); const a = []; for (let i = y; i >= 2020; i--) a.push(String(i)); return a; })()).current;
  const MONTHS = [['01','Jan'],['02','Feb'],['03','Mar'],['04','Apr'],['05','May'],['06','Jun'],['07','Jul'],['08','Aug'],['09','Sep'],['10','Oct'],['11','Nov'],['12','Dec']];
  const fmtDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Preset → {from,to} or {year,yearTo,month}; explicit custom dates pass through.
  const dateParams = () => {
    if (preset === 'custom') {
      const o = {};
      if (fromDate) o.from = fromDate;
      if (toDate) o.to = toDate;
      return o;
    }
    if (preset === 'syear') {
      const o = {};
      if (year) o.year = year;
      if (yearTo) o.yearTo = yearTo;
      if (month && year && !yearTo) o.month = month;
      return o;
    }
    const now = new Date();
    const t = fmtDay(now);
    const ago = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return fmtDay(d); };
    switch (preset) {
      case 'today': return { from: t, to: t };
      case 'yesterday': { const y = ago(1); return { from: y, to: y }; }
      case '7d': return { from: ago(6), to: t };
      case '30d': return { from: ago(29), to: t };
      case 'month': return { from: t.slice(0, 7) + '-01', to: t };
      case 'year': return { from: `${now.getFullYear()}-01-01`, to: t };
      default: return {};
    }
  };

  const filterParams = (withPage = true) => {
    const params = new URLSearchParams();
    if (withPage) { params.set('page', String(page)); params.set('limit', String(pageSize)); }
    params.set('sort', sort);
    params.set('order', order);
    params.set('dateBy', dateBy);
    params.set('source', sourceFilter);
    if (search) params.set('search', search);
    if (selectedTags.length > 0) {
      params.set('tag', selectedTags.join(','));
      if (selectedTags.length > 1) params.set('tagMode', tagMode);
    }
    for (const [k, v] of Object.entries(dateParams())) if (v) params.set(k, v);
    return params;
  };

  const load = useCallback(async () => {
    const data = await api(`/api/customers?${filterParams()}`);
    setCustomers(data.customers || []);
    setTotal(data.total || 0);
    api('/api/customers/tags').then(setTags);
  }, [page, pageSize, search, selectedTags, tagMode, sourceFilter, preset, fromDate, toDate, year, yearTo, month, dateBy, sort, order]);

  useEffect(() => { load(); }, [load]);

  const saveCustomer = async () => {
    const payload = { ...form, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) };
    try {
      if (editing) {
        await api(`/api/customers/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        const res = await api('/api/customers', { method: 'POST', body: JSON.stringify(payload) });
        if (res.error) return toast(res.error);
      }
    } catch (e) {
      return toast(e?.message || 'save failed');
    }
    setForm({ phone: '', name: '', tags: '', email: '', notes: '' });
    setEditing(null);
    setShowAdd(false);
    load();
  };

  const removeCustomer = async (id) => {
    if (!(await confirm('Delete this customer?', { title: 'Delete customer' }))) return;
    try {
      await api(`/api/customers/${id}`, { method: 'DELETE' });
    } catch (e) {
      return toast(e?.message || 'delete failed');
    }
    setSelected(prev => prev.filter(x => x !== id));
    load();
  };

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectPage = () => {
    const ids = customers.map(c => c.id);
    const allIn = ids.length > 0 && ids.every(id => selected.includes(id));
    setSelected(prev => allIn ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
  };

  // Bulk actions go through single-call batch endpoints.
  const bulkDelete = async () => {
    if (selected.length === 0) return;
    if (!(await confirm(`Delete ${selected.length} customers? This cannot be undone.`, { title: `Delete ${selected.length} customers` }))) return;
    setBulkBusy(true);
    try {
      const res = await api('/api/customers/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: selected }) });
      toast(`Deleted ${res.deleted}${res.skippedBot ? ` (${res.skippedBot} bot-owned skipped)` : ''}`, 'success');
    } catch (e) {
      toast(e?.message || 'delete failed');
    }
    setSelected([]);
    setBulkBusy(false);
    load();
  };

  const applyBulkTag = async () => {
    const tag = bulkTag.trim();
    if (selected.length === 0 || !tag) return;
    setBulkBusy(true);
    try {
      const res = await api('/api/customers/bulk-tag', { method: 'POST', body: JSON.stringify({ ids: selected, tag, mode: bulkMode }) });
      toast(`${bulkMode === 'add' ? 'Tagged' : 'Untagged'} ${res.updated}`, 'success');
    } catch (e) {
      toast(e?.message || 'tag failed');
    }
    setBulkTag('');
    setSelected([]);
    setBulkBusy(false);
    load();
  };

  const downloadCsv = async (url, filename) => {
    const headers = {};
    const k = getAdminKey();
    if (k) headers['X-Admin-Key'] = k;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`export failed (${res.status})`);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
  };

  const exportSelected = async () => {
    if (selected.length === 0) return;
    try {
      await downloadCsv(`${API}/api/customers/export?ids=${selected.map(encodeURIComponent).join(',')}`, 'customers-selected.csv');
    } catch (e) {
      toast(e?.message || 'export failed');
    }
  };

  const selectAllFiltered = async () => {
    try {
      const all = await api(`/api/customers/all?${filterParams(false)}`);
      setSelected((all || []).map(c => c.id));
      toast(`Selected ${(all || []).length} contacts`, 'success');
    } catch (e) {
      toast(e?.message || 'select failed');
    }
  };

  const openBulkMessage = (ids, label) => {
    if (!ids || ids.length === 0) return;
    setMsgIds(ids);
    setMsgLabel(label);
    setMsgText('');
  };

  const sendBulkMessage = async () => {
    if (msgIds.length === 0 || !msgText.trim()) return;
    setMsgBusy(true);
    try {
      const res = await api('/api/customers/bulk-message', { method: 'POST', body: JSON.stringify({ ids: msgIds, message: msgText }) });
      setMsgIds([]);
      setMsgText('');
      setSelected([]);
      toast(`Sending to ${res.total} contacts`, 'success');
    } catch (e) {
      toast(e?.message || 'send failed');
    }
    setMsgBusy(false);
  };

  const sendTestTo = async (phone) => {
    if (!phone || !msgText.trim()) return;
    setMsgBusy(true);
    try {
      await api('/api/test-send', { method: 'POST', body: JSON.stringify({ phone, message: msgText }) });
      toast('Test message sent', 'success');
    } catch (e) {
      toast(e?.message || 'send failed');
    }
    setMsgBusy(false);
  };

  const snapshotFilters = () => ({ search, selectedTags, tagMode, sourceFilter, preset, fromDate, toDate, year, yearTo, month, dateBy, sort, order, pageSize });
  const applyView = (v) => {
    const s = v.state || {};
    setSearch(s.search || '');
    setSelectedTags(s.selectedTags || []);
    setTagMode(s.tagMode || 'any');
    setSourceFilter(s.sourceFilter || 'all');
    setPreset(s.preset || 'all');
    setFromDate(s.fromDate || '');
    setToDate(s.toDate || '');
    setYear(s.year || '');
    setYearTo(s.yearTo || '');
    setMonth(s.month || '');
    setDateBy(s.dateBy || 'added');
    setSort(s.sort || 'createdAt');
    setOrder(s.order || 'desc');
    setPageSize(s.pageSize || 50);
    setSelected([]);
    setPage(1);
    setShowViews(false);
  };
  const saveView = () => {
    const name = viewName.trim();
    if (!name) return;
    const next = [...views.filter(x => x.name !== name), { name, state: snapshotFilters() }];
    setViews(next);
    try { localStorage.setItem('ocp_customer_views', JSON.stringify(next)); } catch { /* ignore */ }
    setViewName('');
  };
  const deleteView = (name) => {
    const next = views.filter(x => x.name !== name);
    setViews(next);
    try { localStorage.setItem('ocp_customer_views', JSON.stringify(next)); } catch { /* ignore */ }
  };

  const toggleCol = (k) => {
    setColumns(prev => {
      const next = { ...prev, [k]: !prev[k] };
      try { localStorage.setItem('ocp_customer_cols', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const clickSort = (field) => {
    if (sort === field) {
      setOrder(o => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setOrder(field === 'name' ? 'asc' : 'desc');
    }
    setPage(1);
  };
  const sortArrow = (field) => (sort === field ? (order === 'asc' ? ' ▲' : ' ▼') : '');

  const fmtAdded = (c) => {
    if (!c.createdAt) return '—';
    const d = new Date(c.createdAt);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  };

  const handleFile = async (file) => {
    if (!file) return;
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const headers = {};
      const k = getAdminKey();
      if (k) headers['X-Admin-Key'] = k;
      const res = await fetch(`${API}/api/customers/import`, { method: 'POST', headers, body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `import failed (${res.status})`);
      setImportResult(data);
      load();
    } catch (e) {
      setImportResult({ error: e?.message || 'import failed' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && /\.(csv|xlsx|xls)$/i.test(file.name)) handleFile(file);
  };

  // Export respects the current filters (search/tags/source/dates/sort).
  const exportCsv = async () => {
    try {
      await downloadCsv(`${API}/api/customers/export?${filterParams(false)}`, 'customers.csv');
    } catch (e) {
      toast(e?.message || 'export failed');
    }
  };

  const clearAll = async () => {
    if (!(await confirm('Delete ALL customers? This cannot be undone.', { title: 'Delete all customers' }))) return;
    await api('/api/customers', { method: 'DELETE' });
    load();
  };

  const startEdit = (c) => {
    setForm({ phone: c.phone, name: c.name || '', tags: (c.tags || []).join(', '), email: c.email || '', notes: c.notes || '' });
    setEditing(c);
    setShowAdd(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Customers</h1>
          <p className="text-sm text-zinc-500">{total} contacts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium text-zinc-700 hover:bg-stone-50 transition-colors"><Icons.Download /> Export</button>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium cursor-pointer hover:bg-stone-50 transition-colors"><Icons.Upload /> Import<input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files[0])} /></label>
          <button onClick={() => { setForm({ phone: '', name: '', tags: '', email: '', notes: '' }); setEditing(null); setShowAdd(!showAdd); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"><Icons.Plus /> Add Customer</button>
        </div>
      </div>

      {/* Import result */}
      {importResult && (
        importResult.error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-red-700">Import failed: {importResult.error}</span>
            <button onClick={() => setImportResult(null)}><Icons.X /></button>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-emerald-700">Imported {importResult.imported} customers ({importResult.skipped} skipped). Total: {importResult.total}{importResult.truncated ? ' · only first 10,000 rows processed' : ''}</span>
            <button onClick={() => setImportResult(null)}><Icons.X /></button>
          </div>
        )
      )}

      {/* Drag-drop zone */}
      {dragOver && (
        <div className="fixed inset-0 z-40 bg-brand-50/80 border-4 border-dashed border-brand-400 flex items-center justify-center" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} onDragLeave={() => setDragOver(false)}>
          <div className="text-center"><Icons.Upload s={48} /><p className="text-lg font-bold text-brand-700 mt-2">Drop CSV or Excel file here</p></div>
        </div>
      )}

      <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
        {/* Search and filters */}
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 min-w-0">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"><Icons.Search /></div>
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" placeholder="Search by name or phone..." />
            </div>
            <div className="relative">
              <button onClick={() => { setShowTagPicker(v => !v); setShowCols(false); setShowViews(false); }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none hover:bg-stone-50">
                <Icons.Tag s={14} /> {selectedTags.length === 0 ? 'All Tags' : `${selectedTags.length} tag${selectedTags.length > 1 ? 's' : ''}`} <Icons.ChevronDown s={14} />
              </button>
              {showTagPicker && (
                <div className="absolute z-30 mt-1 w-60 bg-white rounded-xl border border-stone-200 shadow-lg p-2 max-h-72 overflow-y-auto">
                  <button onClick={() => { setSelectedTags([]); setPage(1); }}
                    className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:bg-stone-100">Clear tags</button>
                  {tags.map(t => (
                    <label key={t} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-stone-100 cursor-pointer">
                      <input type="checkbox" checked={selectedTags.includes(t)}
                        onChange={() => { setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]); setPage(1); }}
                        className="accent-brand-600 size-4 cursor-pointer" />
                      <span className="truncate">{t}</span>
                    </label>
                  ))}
                  {tags.length === 0 && <div className="px-2 py-1.5 text-xs text-zinc-400">No tags yet</div>}
                  {selectedTags.length > 1 && (
                    <div className="flex items-center gap-2 px-2 pt-2 mt-1 border-t border-stone-100 text-xs text-zinc-500">
                      Match:
                      <button onClick={() => { setTagMode('any'); setPage(1); }} className={cn('px-2 py-1 rounded-lg font-medium', tagMode === 'any' ? 'bg-brand-600 text-white' : 'bg-stone-100')}>Any</button>
                      <button onClick={() => { setTagMode('all'); setPage(1); }} className={cn('px-2 py-1 rounded-lg font-medium', tagMode === 'all' ? 'bg-brand-600 text-white' : 'bg-stone-100')}>All</button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }} title="Bot = synced from store · Imported = uploaded/manual"
              className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400">
              <option value="all">All sources</option>
              <option value="bot">Bot</option>
              <option value="local">Imported</option>
            </select>
            <div className="relative">
              <button onClick={() => { setShowViews(v => !v); setShowCols(false); setShowTagPicker(false); }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white hover:bg-stone-50">
                Views <Icons.ChevronDown s={14} />
              </button>
              {showViews && (
                <div className="absolute z-30 right-0 mt-1 w-64 bg-white rounded-xl border border-stone-200 shadow-lg p-2">
                  <div className="flex gap-1.5 mb-1">
                    <input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="View name…"
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs focus:outline-none focus:border-brand-400" />
                    <button onClick={saveView} className="px-2.5 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-bold hover:bg-brand-700">Save</button>
                  </div>
                  {views.length === 0 && <div className="px-2 py-1.5 text-xs text-zinc-400">No saved views — set filters, name it, Save.</div>}
                  {views.map(v => (
                    <div key={v.name} className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-stone-100">
                      <button onClick={() => applyView(v)} className="flex-1 text-left text-sm truncate">{v.name}</button>
                      <button onClick={() => deleteView(v.name)} aria-label={`Delete view ${v.name}`} className="p-1 rounded hover:bg-red-50 text-zinc-400 hover:text-red-500"><Icons.X s={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <button onClick={() => { setShowCols(v => !v); setShowViews(false); setShowTagPicker(false); }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white hover:bg-stone-50">
                Columns <Icons.ChevronDown s={14} />
              </button>
              {showCols && (
                <div className="absolute z-30 right-0 mt-1 w-48 bg-white rounded-xl border border-stone-200 shadow-lg p-2">
                  {[['phone', 'Phone'], ['name', 'Name'], ['tags', 'Tags'], ['email', 'Email'], ['added', 'Added'], ['source', 'Source'], ['orders', 'Orders'], ['lastseen', 'Last seen']].map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-stone-100 cursor-pointer">
                      <input type="checkbox" checked={!!columns[k]} onChange={() => toggleCol(k)} className="accent-brand-600 size-4 cursor-pointer" />
                      {label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {customers.length > 0 && (
              <button onClick={clearAll} className="px-3 py-2 rounded-xl border border-red-200 bg-white text-sm font-medium text-red-600 hover:bg-red-50 transition-colors">Clear All</button>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="inline-flex items-center gap-1.5 text-xs text-zinc-500"><Icons.Calendar s={14} /> When:</div>
            <select value={preset} onChange={(e) => { setPreset(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400">
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="month">This month</option>
              <option value="year">This year</option>
              <option value="syear">Specific year…</option>
              <option value="custom">Custom range…</option>
            </select>
            {preset === 'custom' && (
              <>
                <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                  className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" aria-label="From date" />
                <span className="text-xs text-zinc-400">to</span>
                <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                  className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" aria-label="To date" />
              </>
            )}
            {preset === 'syear' && (
              <>
                <select value={year} onChange={(e) => { setYear(e.target.value); setMonth(''); setPage(1); }}
                  className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" aria-label="Year">
                  <option value="">Year…</option>
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={month} disabled={!year} onChange={(e) => { setMonth(e.target.value); setYearTo(''); setPage(1); }}
                  className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 disabled:opacity-40" aria-label="Month">
                  <option value="">All months</option>
                  {MONTHS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
                {!month && (
                  <select value={yearTo} onChange={(e) => { setYearTo(e.target.value); setPage(1); }}
                    className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" aria-label="To year">
                    <option value="">…same year</option>
                    {YEARS.filter(y => !year || y >= year).map(y => <option key={y} value={y}>to {y}</option>)}
                  </select>
                )}
              </>
            )}
            <select value={dateBy} onChange={(e) => { setDateBy(e.target.value); setPage(1); }}
              title="Added = first-seen date · Active = recent activity (falls back to Added)"
              className="px-3 py-2 rounded-xl border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400">
              <option value="added">By added date</option>
              <option value="active">By recent activity</option>
            </select>
          </div>
        </div>

        {/* Add/Edit form */}
        {showAdd && (
          <Card>
            <CardHeader>
              <CardTitle>{editing ? 'Edit Customer' : 'Add Customer'}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input label="Phone (10 digits)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="9876543210" disabled={!!editing} />
              <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Customer name" />
              <Input label="Tags (comma-separated)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="regular, vip" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
              <Input label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any notes..." />
            </div>
            <div className="flex gap-2">
              <button onClick={saveCustomer} className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">{editing ? 'Update' : 'Add Customer'}</button>
              <button onClick={() => { setShowAdd(false); setEditing(null); }} className="px-4 py-2 rounded-xl border border-stone-200 text-sm font-medium hover:bg-stone-50 transition-colors">Cancel</button>
            </div>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-stone-200 overflow-x-auto">
          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-brand-50 border-b border-brand-200">
              <span className="text-xs font-bold text-brand-700">{selected.length} selected</span>
              {selected.length < total && (
                <button onClick={selectAllFiltered} className="text-xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800">
                  Select all {total} filtered
                </button>
              )}
              <div className="flex flex-wrap gap-1.5 items-center ml-1">
                <select value={bulkMode} onChange={(e) => setBulkMode(e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-brand-200 text-xs bg-white focus:outline-none" aria-label="Tag mode">
                  <option value="add">Add tag</option>
                  <option value="remove">Remove tag</option>
                </select>
                <input value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="tag…"
                  className="w-28 px-2.5 py-1.5 rounded-lg border border-brand-200 text-xs bg-white focus:outline-none focus:border-brand-400" />
                <button onClick={applyBulkTag} disabled={bulkBusy} className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 disabled:opacity-50 transition-colors">Tag</button>
                <button onClick={() => openBulkMessage(selected, `${selected.length} contacts`)} disabled={bulkBusy} className="px-3 py-1.5 rounded-lg border border-brand-200 text-brand-700 text-xs font-bold hover:bg-brand-100 disabled:opacity-50 transition-colors">Message</button>
                <button onClick={exportSelected} disabled={bulkBusy} className="px-3 py-1.5 rounded-lg border border-brand-200 text-brand-700 text-xs font-bold hover:bg-brand-100 disabled:opacity-50 transition-colors">Export</button>
                <button onClick={bulkDelete} disabled={bulkBusy} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 disabled:opacity-50 transition-colors">Delete</button>
                <button onClick={() => setSelected([])} className="px-2 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700">Clear</button>
              </div>
            </div>
          )}
          {customers.length === 0 ? (
            <Empty icon={<Icons.Users s={20} />} title="No customers match" hint="Adjust filters, import a file, or add manually." />
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="pl-4 pr-1 py-2.5 w-10">
                    <input type="checkbox" aria-label="Select all on page"
                      checked={customers.length > 0 && customers.every(c => selected.includes(c.id))}
                      ref={el => { if (el) el.indeterminate = customers.some(c => selected.includes(c.id)) && !customers.every(c => selected.includes(c.id)); }}
                      onChange={toggleSelectPage} className="accent-brand-600 size-4 cursor-pointer" />
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-zinc-500 w-12">#</th>
                  {columns.phone && (
                    <th className="text-left px-4 py-2.5"><button onClick={() => clickSort('phone')} className="inline-flex items-center font-medium text-zinc-500 hover:text-zinc-800">Phone{sortArrow('phone')}</button></th>
                  )}
                  {columns.name && (
                    <th className="text-left px-4 py-2.5"><button onClick={() => clickSort('name')} className="inline-flex items-center font-medium text-zinc-500 hover:text-zinc-800">Name{sortArrow('name')}</button></th>
                  )}
                  {columns.tags && <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Tags</th>}
                  {columns.email && <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Email</th>}
                  {columns.added && (
                    <th className="text-left px-4 py-2.5"><button onClick={() => clickSort('createdAt')} className="inline-flex items-center font-medium text-zinc-500 hover:text-zinc-800">Added{sortArrow('createdAt')}</button></th>
                  )}
                  {columns.source && <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Source</th>}
                  {columns.orders && <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Orders</th>}
                  {columns.lastseen && <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Last seen</th>}
                  <th className="w-32"></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr key={c.id} className={cn('border-b border-stone-100 last:border-0 hover:bg-stone-50 transition-colors', selected.includes(c.id) && 'bg-brand-50/60')}>
                    <td className="pl-4 pr-1 py-2.5">
                      <input type="checkbox" aria-label={`Select ${c.phone}`} checked={selected.includes(c.id)} onChange={() => toggleSelect(c.id)} className="accent-brand-600 size-4 cursor-pointer" />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-400">{(page - 1) * pageSize + i + 1}</td>
                    {columns.phone && <td className="px-4 py-2.5 font-mono text-xs">{c.phone}</td>}
                    {columns.name && <td className="px-4 py-2.5 font-medium">{c.name || '—'}</td>}
                    {columns.tags && <td className="px-4 py-2.5">{(c.tags || []).length > 0 ? c.tags.map(t => <Badge key={t}>{t}</Badge>) : '—'}</td>}
                    {columns.email && <td className="px-4 py-2.5 text-xs text-zinc-500">{c.email || '—'}</td>}
                    {columns.added && <td className="px-4 py-2.5 text-xs text-zinc-400">{fmtAdded(c)}</td>}
                    {columns.source && <td className="px-4 py-2.5"><Badge color={c.source === 'bot' ? 'blue' : 'green'}>{c.source === 'bot' ? 'Bot' : 'Local'}</Badge></td>}
                    {columns.orders && <td className="px-4 py-2.5 text-xs text-zinc-500">{c.total_orders ?? '—'}</td>}
                    {columns.lastseen && <td className="px-4 py-2.5 text-xs text-zinc-400">{c.last_seen_at ? new Date(c.last_seen_at).toLocaleDateString() : '—'}</td>}
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(c)} disabled={c.source === 'bot'} title={c.source === 'bot' ? 'Bot-owned — tag only' : 'Edit'}
                          className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600 disabled:opacity-30 disabled:hover:bg-transparent"><Icons.Edit /></button>
                        <button onClick={() => openBulkMessage([c.id], c.name || c.phone)} title="Send message"
                          className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600"><Icons.Send s={14} /></button>
                        <button onClick={() => setDetail(c)} title="Details"
                          className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600"><Icons.Eye s={14} /></button>
                        <button onClick={() => removeCustomer(c.id)} disabled={c.source === 'bot'} title={c.source === 'bot' ? 'Bot-owned — cannot delete here' : 'Delete'}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500 disabled:opacity-30 disabled:hover:bg-transparent"><Icons.Trash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {total > pageSize && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-stone-200">
              <span className="text-xs text-zinc-400">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
              <div className="flex gap-2 items-center">
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="px-2 py-1 rounded-lg border border-stone-200 text-xs bg-white" aria-label="Rows per page">
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </select>
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded-lg border border-stone-200 text-xs font-medium disabled:opacity-40">Prev</button>
                <button onClick={() => setPage(p => p + 1)} disabled={page * pageSize >= total} className="px-3 py-1 rounded-lg border border-stone-200 text-xs font-medium disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Details modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setDetail(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl border border-stone-200 shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-zinc-900">{detail.name || detail.phone}</h3>
              <button onClick={() => setDetail(null)} aria-label="Close details" className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400"><Icons.X s={14} /></button>
            </div>
            <div className="flex flex-col gap-2 text-sm">
              {[
                ['Phone', detail.phone],
                ['Name', detail.name || '—'],
                ['Tags', (detail.tags || []).length > 0 ? detail.tags.join(', ') : '—'],
                ['Email', detail.email || '—'],
                ['Notes', detail.notes || '—'],
                ['Source', detail.source === 'bot' ? 'Bot (synced)' : 'Imported / manual'],
                ['Orders', detail.total_orders ?? '—'],
                ['Total spent', detail.total_spent ?? '—'],
                ['Added', fmtAdded(detail)],
                ['Last seen', detail.last_seen_at ? new Date(detail.last_seen_at).toLocaleString() : '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <span className="w-24 shrink-0 text-xs font-medium text-zinc-400">{k}</span>
                  <span className="text-zinc-800 break-words min-w-0">{String(v)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setDetail(null); openBulkMessage([detail.id], detail.name || detail.phone); }}
                className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">Message</button>
              <button onClick={() => setDetail(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 text-sm font-medium hover:bg-stone-50 transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Message modal (single test or bulk selection) */}
      {msgIds.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { if (!msgBusy) { setMsgIds([]); setMsgText(''); } }}>
          <div className="w-full max-w-md bg-white rounded-2xl border border-stone-200 shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-zinc-900">Message {msgLabel}</h3>
              <button onClick={() => { if (!msgBusy) { setMsgIds([]); setMsgText(''); } }} aria-label="Close message" className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400"><Icons.X s={14} /></button>
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              {msgIds.length === 1 ? 'Sends one test message via the bot.' : `Starts a campaign to ${msgIds.length} contacts (tracked under Campaigns).`}
            </p>
            <textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} rows={4} maxLength={4096}
              placeholder="Type your message… (use {name} for personalization in campaigns)"
              className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => { setMsgIds([]); setMsgText(''); }} disabled={msgBusy}
                className="px-4 py-2 rounded-xl border border-stone-200 text-sm font-medium hover:bg-stone-50 disabled:opacity-40 transition-colors">Cancel</button>
              {msgIds.length === 1 ? (
                <button onClick={() => sendTestTo(customers.find(c => c.id === msgIds[0])?.phone)} disabled={msgBusy || !msgText.trim()}
                  className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-40 transition-colors">
                  {msgBusy ? 'Sending…' : 'Send test'}
                </button>
              ) : (
                <button onClick={sendBulkMessage} disabled={msgBusy || !msgText.trim()}
                  className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-40 transition-colors">
                  {msgBusy ? 'Starting…' : `Send to ${msgIds.length}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════
function TemplatesView() {
  const { confirm, toast } = useDialog();
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
    if (!form.name || !form.message) return toast('Name and message are required');
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
    if (!(await confirm('Delete this template?', { title: 'Delete template' }))) return;
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <Card>
          <CardHeader>
            <CardTitle>{editing ? 'Edit Template' : 'New Template'}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
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
          </CardContent>
        </Card>
      )}

      {/* Presets */}
      {!showCreate && (
        <div>
          <h3 className="text-sm font-bold text-zinc-900 mb-2">Quick Start Presets</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PRESETS.map((p, i) => (
              <button key={i} onClick={() => usePreset(p)}
                className="text-left bg-white rounded-2xl border border-stone-200 p-4 hover:border-brand-300 hover:shadow-sm transition-colors">
                <Badge color="brand">{p.category}</Badge>
                <div className="text-sm font-bold text-zinc-900 mt-2 truncate">{p.name}</div>
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
          <div className="flex flex-col gap-2">
            {templates.map(t => (
              <Card key={t.id}>
                <CardContent className="flex items-start justify-between p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-zinc-900 truncate">{t.name}</span>
                      <Badge>{t.category}</Badge>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 whitespace-pre-line line-clamp-3">{t.message}</p>
                  </div>
                  <div className="flex gap-1 ml-3 shrink-0">
                    <button onClick={() => startEdit(t)} className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600"><Icons.Edit /></button>
                    <button onClick={() => removeTemplate(t.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500"><Icons.Trash /></button>
                  </div>
                </CardContent>
              </Card>
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
  const { confirm, toast } = useDialog();
  const [media, setMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const load = () => api('/api/media').then(setMedia);
  useEffect(() => { load(); }, []);

  const upload = async (files) => {
    setUploading(true);
    try {
      const k = getAdminKey();
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const headers = {};
        if (k) headers['X-Admin-Key'] = k;
        const res = await fetch(`${API}/api/media/upload`, { method: 'POST', headers, body: fd });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `upload failed (${res.status})`);
      }
    } catch (e) {
      toast(e?.message || 'upload failed');
    } finally {
      setUploading(false);
      load();
    }
  };

  const removeMedia = async (id) => {
    if (!(await confirm('Delete this media item?', { title: 'Delete media' }))) return;
    await api(`/api/media/${id}`, { method: 'DELETE' });
    load();
  };

  const copyUrl = (url) => {
    navigator.clipboard.writeText(`${window.location.origin}${url}`)
      .then(() => toast('URL copied to clipboard', 'success'))
      .catch(() => toast('Copy failed'));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <Card><Empty icon={<Icons.Image s={20} />} title="No media yet" hint="Upload images for your campaigns." /></Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {media.map(m => (
            <Card key={m.id} className="overflow-hidden group">
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
            </Card>
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
  const { confirm, toast } = useDialog();
  const [campaigns, setCampaigns] = useState([]);
  const [step, setStep] = useState(0); // 0=list, 1=compose, 2=recipients, 3=review
  const [compose, setCompose] = useState({ name: '', message: '', imageUrl: '' });
  const [recipientTag, setRecipientTag] = useState('all');
  const [recipientMode, setRecipientMode] = useState('all'); // all | tag | custom
  const [selectedPhones, setSelectedPhones] = useState([]); // normalized 10-digit strings
  const [contactSearch, setContactSearch] = useState('');
  const [preview, setPreview] = useState({ sendable: 0, skipped: 0 });
  const [scheduledAt, setScheduledAt] = useState('');
  const [media, setMedia] = useState([]);
  const [showProgress, setShowProgress] = useState(null);
  const [liveCampaign, setLiveCampaign] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [tags, setTags] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [settings, setSettings] = useState({});
  const [testPhone, setTestPhone] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [varRows, setVarRows] = useState([
    { k: 'discount', v: '' }, { k: 'item', v: '' }, { k: 'description', v: '' },
    { k: 'order_link', v: '' }, { k: 'order_id', v: '' },
  ]);
  const msgRef = useRef();
  const fileRef = useRef();
  const [detail, setDetail] = useState(null);
  const [detailFilter, setDetailFilter] = useState('all');
  const [detailSearch, setDetailSearch] = useState('');
  const [detailPreview, setDetailPreview] = useState(null);
  const [showReuse, setShowReuse] = useState(null);

  const load = () => {
    api('/api/campaigns').then(setCampaigns);
    api('/api/templates').then(setTemplates);
    api('/api/customers/tags').then(setTags);
    api('/api/settings').then(setSettings);
    api('/api/customers/all').then(setCustomers);
    api('/api/media').then(m => setMedia(Array.isArray(m) ? m : []));
  };
  useEffect(() => { load(); }, []);

  // Helpers: 10-digit sendable numbers only (longer = WhatsApp LID, not dialable)
  // Matches server normPhone: 10 as-is, 12 starting 91 -> strip, 11 starting 0 -> strip, else invalid (no slice truncation)
  const normPhone = (p) => {
    const d = String(p || '').replace(/\D/g, '');
    if (d.length === 10) return d;
    if (d.length === 12 && d.startsWith('91')) return d.slice(2);
    if (d.length === 11 && d.startsWith('0')) return d.slice(1);
    return d;
  };
  const isSendable = (p) => /^[0-9]{10}$/.test(normPhone(p));
  const modeOf = (c) => c.recipientMode || (c.recipientTag && c.recipientTag !== 'all' ? 'tag' : 'all');
  const recipientLabel = (c) => {
    const m = modeOf(c);
    if (m === 'custom') return `${(c.recipientPhones || []).length} selected`;
    if (m === 'tag') return c.recipientTag;
    return 'All Customers';
  };

  // Live recipient preview (sendable vs skipped) for all/tag modes;
  // custom mode is exact by construction.
  useEffect(() => {
    if (recipientMode === 'custom') {
      setPreview({ sendable: selectedPhones.length, skipped: 0 });
      return;
    }
    let live = true;
    api('/api/campaigns/preview-recipients', {
      method: 'POST',
      body: JSON.stringify({ recipientMode, recipientTag }),
    }).then(r => { if (live && r && typeof r.sendable === 'number') setPreview(r); });
    return () => { live = false; };
  }, [recipientMode, recipientTag, selectedPhones, customers.length]);

  const recipientCount = preview.sendable;

  // Poll live campaigns (cleanup on done/cancelled/failed/unmount/change)
  useEffect(() => {
    if (!showProgress) return;
    let stopped = false;
    const interval = setInterval(() => {
      if (stopped) return;
      api(`/api/campaigns/${showProgress}`).then(c => {
        if (stopped) return;
        setLiveCampaign(c);
        if (c.status === 'done' || c.status === 'completed' || c.status === 'cancelled' || c.status === 'failed') { load(); }
      }).catch(() => {});
    }, 2000);
    return () => { stopped = true; clearInterval(interval); };
  }, [showProgress]);

  const applyTemplate = (t) => {
    setCompose({ ...compose, message: t.message });
  };

  const uploadImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { toast('Only JPEG/PNG/WebP/GIF allowed'); e.target.value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { toast('Image too large (max 5MB)'); e.target.value = ''; return; }
    const fd = new FormData();
    fd.append('file', file);
    try {
      const headers = {};
      const k = getAdminKey();
      if (k) headers['X-Admin-Key'] = k;
      const res = await fetch(`${API}/api/media/upload`, { method: 'POST', headers, body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) { toast(data?.error || `upload failed (${res.status})`); return; }
      setCompose({ ...compose, imageUrl: data.url });
    } catch {
      toast('upload failed');
    } finally {
      e.target.value = '';
    }
  };

  const resetWizard = () => {
    setCompose({ name: '', message: '', imageUrl: '' });
    setRecipientTag('all');
    setRecipientMode('all');
    setSelectedPhones([]);
    setContactSearch('');
    setScheduledAt('');
    setVarRows(defaultVarRows());
  };

  // Campaign variables as an object for the API (non-empty keys only)
  const variablesObj = () => {
    const o = {};
    for (const { k, v } of varRows) {
      const key = k.trim();
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) o[key] = v;
    }
    return o;
  };

  const deliveryRate = (c) => ((c.sent || 0) + (c.failed || 0) > 0 ? Math.round(((c.sent || 0) / ((c.sent || 0) + (c.failed || 0))) * 100) : 0);
  const fmtDuration = (c) => {
    if (!c.startedAt) return '—';
    const end = c.completedAt ? new Date(c.completedAt) : new Date();
    const s = Math.max(0, Math.round((end - new Date(c.startedAt)) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };
  const detailResults = () => {
    const rows = Array.isArray(detail?.results) ? detail.results : [];
    const q = detailSearch.trim().toLowerCase();
    return rows.filter(r => {
      if (detailFilter === 'ok' && !r.ok) return false;
      if (detailFilter === 'failed' && r.ok) return false;
      if (q && !(String(r.phone || '').includes(q) || String(r.name || '').toLowerCase().includes(q))) return false;
      return true;
    });
  };

  const defaultVarRows = () => ([
    { k: 'discount', v: '' }, { k: 'item', v: '' }, { k: 'description', v: '' },
    { k: 'order_link', v: '' }, { k: 'order_id', v: '' },
  ]);

  const restoreVarRows = (vars) => {
    const entries = Object.entries(vars || {});
    setVarRows(entries.length > 0 ? entries.map(([k, v]) => ({ k, v })) : defaultVarRows());
  };

  // Insert a {tag} at the cursor of the compose textarea
  const insertTag = (tag) => {
    const el = msgRef.current;
    const token = `{${tag}}`;
    if (!el) {
      setCompose({ ...compose, message: (compose.message || '') + token });
      return;
    }
    const start = el.selectionStart ?? compose.message.length;
    const end = el.selectionEnd ?? compose.message.length;
    const next = compose.message.slice(0, start) + token + compose.message.slice(end);
    setCompose({ ...compose, message: next });
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + token.length; });
  };

  // Sample rendering for the preview (real rendering happens per contact at send time)
  const renderSample = (msg) => {
    const vars = {
      name: 'Rahul', phone: '9876543210', brand_name: settings.brandName || 'Orange Cheese Pizza',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      ...variablesObj(),
    };
    return String(msg || '').replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (m, k) =>
      Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k] ?? '') : m,
    );
  };

  const createCampaign = async () => {
    if (recipientMode === 'custom' && selectedPhones.length === 0) return toast('Select at least one contact');
    const res = await api('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        ...compose,
        recipientMode,
        recipientTag: recipientMode === 'tag' ? recipientTag : 'all',
        recipientPhones: recipientMode === 'custom' ? selectedPhones : [],
        variables: variablesObj(),
        scheduledAt: scheduledAt || null,
      }),
    });
    if (res.error) return toast(res.error);
    setStep(0);
    resetWizard();
    load();
  };

  const [sendingIds, setSendingIds] = useState(new Set());
  // Prefill the wizard locally — nothing is saved until Review confirm (no orphan drafts).
  const prefillWizard = (c, nameSuffix = '', step = 1) => {
    setCompose({ name: `${c.name || 'Campaign'}${nameSuffix}`.slice(0, 100), message: c.message || '', imageUrl: c.imageUrl || '' });
    setRecipientMode(modeOf(c));
    setRecipientTag(c.recipientTag || 'all');
    setSelectedPhones(c.recipientPhones || []);
    restoreVarRows(c.variables);
    setScheduledAt('');
    setStep(step);
  };
  const sendCampaign = async (id, skipConfirm = false) => {
    if (sendingIds.has(id)) return;
    const c = campaigns.find(x => x.id === id);
    const label = c ? recipientLabel(c) : 'all recipients';
    if (!skipConfirm && !(await confirm(`Send this campaign to ${label}?`, { title: 'Send campaign', confirmLabel: 'Send', danger: false }))) return;
    setSendingIds(prev => new Set(prev).add(id));
    try {
      const res = await api(`/api/campaigns/${id}/send`, { method: 'POST' });
      setShowProgress(id);
      toast('Campaign sending started', 'success');
      load();
    } catch (e) {
      toast(e.message || 'send failed');
    } finally {
      setSendingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const cancelCampaign = async (id) => {
    if (!(await confirm('Cancel this campaign?', { title: 'Cancel campaign' }))) return;
    try {
      await api(`/api/campaigns/${id}/cancel`, { method: 'POST' });
      toast('Campaign cancelled', 'success');
    } catch (e) {
      toast(e.message || 'cancel failed');
    } finally {
      load();
    }
  };

  const removeCampaign = async (id) => {
    if (!(await confirm('Delete this campaign?', { title: 'Delete campaign' }))) return;
    await api(`/api/campaigns/${id}`, { method: 'DELETE' });
    load();
  };

  // Reuse: prefill the wizard locally (saves only on Review confirm — no orphan draft).
  const duplicateCampaign = (c) => {
    prefillWizard(c, ' (copy)');
    toast('Editing a copy — confirm in the wizard to save', 'info');
  };

  const failedCount = (c) => {
    if (Array.isArray(c.results) && c.results.length > 0) return c.results.filter(r => !r.ok).length;
    return c.failed || 0;
  };

  // Resend-all: fresh draft with the same message + audience, then send it.
  const resendAll = async (c) => {
    if (!(await confirm(`Send "${c.name}" again to the same audience?`, { title: 'Resend campaign', confirmLabel: 'Resend', danger: false }))) return;
    try {
      const created = await api('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: `${c.name} (resend)`.slice(0, 100),
          message: c.message, imageUrl: c.imageUrl || '',
          recipientMode: modeOf(c), recipientTag: c.recipientTag || 'all',
          recipientPhones: c.recipientPhones || [], variables: c.variables || {}, scheduledAt: null,
        }),
      });
      await sendCampaign(created.id, true);
    } catch (e) {
      toast(e?.message || 'resend failed');
    }
    load();
  };

  // Resume: continue without resending delivered contacts (pending), or restart all.
  const resumeCampaign = async (c, mode) => {
    const results = Array.isArray(c.results) ? c.results : [];
    const okCount = results.filter(r => r.ok).length;
    const pendingN = Math.max(0, (c.total || 0) - okCount - failedCount(c));
    const msg = mode === 'pending'
      ? `Resume "${c.name}"? ${okCount} already delivered will be skipped (${pendingN} to send).`
      : `Resend "${c.name}" to all ${c.total || 0}, restarting counts? Already delivered contacts will get it again.`;
    if (!(await confirm(msg, { title: mode === 'pending' ? 'Resume campaign' : 'Resend to all', confirmLabel: mode === 'pending' ? 'Resume' : 'Resend', danger: mode !== 'pending' }))) return;
    try {
      const res = await api(`/api/campaigns/${c.id}/resume`, { method: 'POST', body: JSON.stringify({ mode }) });
      toast(mode === 'pending' ? `Resuming ${res.pending} contacts (skipped ${res.alreadySent} sent)` : `Restarted — sending to ${res.pending}`, 'success');
      openDetail(c.id);
    } catch (e) {
      toast(e?.message || 'resume failed');
    }
    load();
  };

  // Retry-failed: server clones only failed recipients and auto-sends. Original untouched.
  const retryFailed = async (c) => {
    const n = failedCount(c);
    if (n === 0) return toast('No failed recipients to retry');
    if (!(await confirm(`Retry ${n} failed recipient${n === 1 ? '' : 's'}?`, { title: 'Retry failed', confirmLabel: 'Retry', danger: false }))) return;
    try {
      const res = await api(`/api/campaigns/${c.id}/retry-failed`, { method: 'POST' });
      toast(`Retrying ${res.total} contacts`, 'success');
    } catch (e) {
      toast(e?.message || 'retry failed');
    }
    load();
  };

  const saveAsTemplate = async (c) => {
    try {
      await api('/api/templates', { method: 'POST', body: JSON.stringify({ name: c.name, message: c.message, imageUrl: c.imageUrl || '' }) });
      toast('Saved as template', 'success');
    } catch (e) {
      toast(e?.message || 'save failed');
    }
  };

  const exportResults = async (c) => {
    try {
      const headers = {};
      const k = getAdminKey();
      if (k) headers['X-Admin-Key'] = k;
      const res = await fetch(`${API}/api/campaigns/${c.id}/export`, { headers });
      if (!res.ok) throw new Error(`export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campaign-${c.id}-results.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast(e?.message || 'export failed');
    }
  };

  const openDetail = async (id) => {
    try {
      const d = await api(`/api/campaigns/${id}`);
      setDetail(d);
      setDetailFilter('all');
      setDetailSearch('');
      setDetailPreview(null);
      try {
        const p = await api('/api/campaigns/preview-recipients', {
          method: 'POST',
          body: JSON.stringify({ recipientMode: d.recipientMode || 'all', recipientTag: d.recipientTag || 'all', recipientPhones: d.recipientPhones || [] }),
        });
        setDetailPreview(p);
      } catch { /* preview unavailable — stats still show */ }
    } catch (e) {
      toast(e?.message || 'load failed');
    }
  };

  const refreshDetail = async () => {
    if (!detail) return;
    try {
      const d = await api(`/api/campaigns/${detail.id}`);
      setDetail(d);
    } catch { /* keep stale data on transient failure */ }
  };

  // Live-tick the drawer while a send is in flight.
  useEffect(() => {
    if (!detail || detail.status !== 'sending') return;
    const t = setInterval(refreshDetail, 2000);
    return () => clearInterval(t);
  }, [detail?.id, detail?.status]);

  const retryOne = async (phone) => {
    if (!detail || !phone) return;
    if (!(await confirm(`Resend this campaign to ${phone}?`, { title: 'Retry contact', confirmLabel: 'Resend', danger: false }))) return;
    try {
      const res = await api('/api/customers/bulk-message', {
        method: 'POST',
        body: JSON.stringify({ ids: [phone], message: detail.message, imageUrl: detail.imageUrl || '' }),
      });
      toast(`Resending to ${res.total} contact${res.total === 1 ? '' : 's'}`, 'success');
      refreshDetail();
    } catch (e) {
      toast(e?.message || 'retry failed');
    }
    load();
  };

  const copyPhone = (phone) => {
    if (!phone) return;
    navigator.clipboard.writeText(String(phone))
      .then(() => toast('Phone copied', 'success'))
      .catch(() => toast('Copy failed'));
  };

  const testSend = async () => {
    if (!testPhone || !compose.message) return toast('Phone and message required');
    setTestResult(null);
    const res = await api('/api/test-send', { method: 'POST', body: JSON.stringify({ phone: testPhone, message: compose.message, imageUrl: compose.imageUrl, variables: variablesObj() }) });
    setTestResult(res);
  };

  const renderPreview = (msg, img) => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const text = renderSample(msg);
    const hasTags = /{[a-zA-Z_][a-zA-Z0-9_]*}/.test(msg || '');
    return (
      <div className="bg-[#e5ddd5] rounded-2xl p-3 max-w-[280px] shadow-sm">
        {img && <img src={img.startsWith('http') ? img : img} onError={(e) => { e.currentTarget.style.display = 'none'; }} alt="" className="rounded-xl mb-1 w-full object-cover max-h-40" />}
        <div className="bg-white rounded-xl px-3 py-2 shadow-sm relative">
          <div className="text-sm text-zinc-900 whitespace-pre-line" style={{ lineHeight: 1.4 }}>{text || 'Your message here...'}</div>
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] text-zinc-400">{now}</span>
            <span className="text-blue-500"><Icons.Check s={12} /></span>
          </div>
        </div>
        {hasTags && <div className="text-[10px] text-zinc-500 mt-1.5 text-center">Preview with sample data — each contact gets their own values</div>}
      </div>
    );
  };

  // ── Campaign list ──
  if (step === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Campaigns</h1>
            <p className="text-sm text-zinc-500">{campaigns.length} campaigns{(settings.dailySendCap || 0) > 0 && <> · Sent today: {settings.sentToday ?? 0}/{settings.dailySendCap}</>}</p>
          </div>
          <button onClick={() => { setStep(1); resetWizard(); }}
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
            <div className={cn('mt-2 text-xs px-3 py-2 rounded-xl', { 'bg-emerald-50 text-emerald-700': testResult.ok, 'bg-red-50 text-red-600': !testResult.ok })}>
              {testResult.ok ? 'Test sent successfully!' : `Failed: ${JSON.stringify(testResult.error || testResult.result)}`}
            </div>
          )}
        </div>

        {/* Campaign list */}
        <div className="flex flex-col gap-3">
          {campaigns.length === 0 ? (
            <Card><Empty icon={<Icons.Send s={20} />} title="No campaigns yet" hint="Create your first one!" /></Card>
          ) : campaigns.slice().reverse().map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openDetail(c.id)} title="Open details">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-zinc-900 hover:text-brand-700">{c.name}</span>
                    <Badge color={c.status === 'draft' ? 'stone' : c.status === 'sending' ? 'blue' : c.status === 'scheduled' ? 'amber' : c.status === 'cancelled' ? 'red' : 'green'}>{c.status}</Badge>
                    <Badge color="brand">{recipientLabel(c)}</Badge>
                    {c.skipped > 0 && <Badge color="amber">{c.skipped} skipped</Badge>}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{c.message}</p>
                  {c.imageUrl && <img src={c.imageUrl} onError={(e) => { e.currentTarget.style.display = 'none'; }} alt={`${c.name} attachment`} className="h-16 rounded-lg mt-2 object-cover border border-stone-200" />}
                  {c.status !== 'draft' && (
                    <div className="flex gap-4 mt-2 text-xs">
                      <span className="text-emerald-600 font-bold">{c.sent} sent</span>
                      <span className="text-red-500 font-bold">{c.failed} failed</span>
                      <span className="text-zinc-400">{c.total} total</span>
                      {c.scheduledAt && (c.status === 'scheduled' || c.status === 'draft') && <span className="text-amber-600 inline-flex items-center gap-1"><Icons.Clock /> {c.status === 'scheduled' ? 'Auto-sends ' : ''}{new Date(c.scheduledAt).toLocaleString()}</span>}
                    </div>
                  )}
                  {/* Progress bar for sending */}
                  {c.status === 'sending' && (
                    <div className="mt-2">
                      <div className="w-full bg-stone-100 rounded-full h-2">
                        <div className="bg-brand-500 h-2 rounded-full transition-[width]" style={{ width: `${c.total ? ((c.sent + c.failed) / c.total) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-4 items-start" onClick={(e) => e.stopPropagation()}>
                  {(c.status === 'draft' || c.status === 'failed') && (
                    <>
                      <button disabled={sendingIds.has(c.id)} onClick={() => sendCampaign(c.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"><Icons.Send s={12} /> {sendingIds.has(c.id) ? 'Sending…' : 'Send'}</button>
                      <button title="Edit" onClick={() => prefillWizard(c)} className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600"><Icons.Edit /></button>
                    </>
                  )}
                  {c.status === 'scheduled' && (
                    <>
                      <button title="Send now" onClick={() => sendCampaign(c.id)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors"><Icons.Send s={12} /> Send</button>
                      <button title="Edit" onClick={() => prefillWizard(c)} className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600"><Icons.Edit /></button>
                      <button title="Details" onClick={() => openDetail(c.id)} className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600"><Icons.Eye s={14} /></button>
                      <button title="Cancel schedule" onClick={() => cancelCampaign(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500"><Icons.X /></button>
                      <button title="Reuse as new campaign" onClick={() => duplicateCampaign(c)} className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600"><Icons.Copy s={14} /></button>
                      <button title="Delete" onClick={() => removeCampaign(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500"><Icons.Trash /></button>
                    </>
                  )}
                  {c.status === 'sending' && (
                    <>
                      <button onClick={() => { setShowProgress(c.id); setLiveCampaign(c); }} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors"><Icons.Eye /> Progress</button>
                      <button title="Cancel" onClick={() => cancelCampaign(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500"><Icons.X /></button>
                    </>
                  )}
                  {(c.status === 'done' || c.status === 'failed' || c.status === 'cancelled') && (
                    <>
                      <button title="Details" onClick={() => openDetail(c.id)} className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600"><Icons.Eye s={14} /></button>
                      <div className="relative">
                        <button title="Reuse options" onClick={() => setShowReuse(v => (v === c.id ? null : c.id))} className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600"><Icons.MoreVert s={14} /></button>
                        {showReuse === c.id && (
                          <div className="absolute right-0 z-30 mt-1 w-56 bg-white rounded-xl border border-stone-200 shadow-lg p-1.5">
                            <button onClick={() => { setShowReuse(null); resendAll(c); }} className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium hover:bg-stone-100">Resend to same audience</button>
                            {failedCount(c) > 0 && (
                              <button onClick={() => { setShowReuse(null); retryFailed(c); }} className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium hover:bg-stone-100">Retry {failedCount(c)} failed</button>
                            )}
                            <button onClick={() => { setShowReuse(null); prefillWizard(c, ' (copy)', 2); }} className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium hover:bg-stone-100">Send to new audience…</button>
                            <button onClick={() => { setShowReuse(null); duplicateCampaign(c); }} className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium hover:bg-stone-100">Copy to composer…</button>
                            <button onClick={() => { setShowReuse(null); saveAsTemplate(c); }} className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium hover:bg-stone-100">Save as template</button>
                            <button onClick={() => { setShowReuse(null); exportResults(c); }} className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium hover:bg-stone-100">Export results CSV</button>
                          </div>
                        )}
                      </div>
                      <button title="Delete" onClick={() => removeCampaign(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500"><Icons.Trash /></button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Live progress modal */}
        {showProgress && liveCampaign && (
          <Modal open={true} onClose={() => { setShowProgress(null); setLiveCampaign(null); load(); }} title={`Sending: ${liveCampaign.name}`} wide>
            <div className="flex flex-col gap-4">
              <div>
                <div className="w-full bg-stone-100 rounded-full h-3">
                  <div className="bg-brand-500 h-3 rounded-full transition-all" style={{ width: `${liveCampaign.total ? ((liveCampaign.sent + liveCampaign.failed) / liveCampaign.total) * 100 : 0}%` }} />
                </div>
                <div className="flex justify-between mt-2 text-xs text-zinc-500">
                  <span>{liveCampaign.sent + liveCampaign.failed} / {liveCampaign.total}</span>
                  <span>{liveCampaign.sent} sent, {liveCampaign.failed} failed{liveCampaign.skipped > 0 && `, ${liveCampaign.skipped} skipped`}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
                {(liveCampaign.results || []).map((r, i) => (
                  <div key={i} className={cn('flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg', { 'bg-emerald-50': r.ok, 'bg-red-50': !r.ok })}>
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

        {/* Campaign detail drawer (all statuses) */}
        {detail && (
          <Modal open={true} onClose={() => setDetail(null)} title={detail.name} wide>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="relative size-20 shrink-0 rounded-full transition-all" title={`Delivery rate ${deliveryRate(detail)}%`}
                  style={{ background: `conic-gradient(#059669 ${deliveryRate(detail) * 3.6}deg, #e7e5e4 0deg)` }}>
                  <div className="absolute inset-2 bg-white rounded-full flex items-center justify-center text-sm font-bold text-zinc-900">{deliveryRate(detail)}%</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge color={detail.status === 'draft' ? 'stone' : detail.status === 'sending' ? 'blue' : detail.status === 'scheduled' ? 'amber' : detail.status === 'cancelled' ? 'red' : 'green'}>{detail.status}</Badge>
                    {detail.status === 'sending' && <span className="text-[10px] text-blue-600 font-medium animate-pulse">live</span>}
                    <button onClick={refreshDetail} title="Refresh stats" className="p-1.5 rounded-lg hover:bg-stone-100 text-zinc-400 hover:text-zinc-600"><Icons.Clock s={14} /></button>
                  </div>
                  <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-stone-100 mt-2" title={`${detail.sent || 0} sent · ${detail.failed || 0} failed · ${Math.max(0, (detail.total || 0) - (detail.sent || 0) - (detail.failed || 0))} pending`}>
                    <div className="bg-emerald-500 h-full transition-all" style={{ width: `${detail.total ? ((detail.sent || 0) / detail.total) * 100 : 0}%` }} />
                    <div className="bg-red-400 h-full transition-all" style={{ width: `${detail.total ? ((detail.failed || 0) / detail.total) * 100 : 0}%` }} />
                  </div>
                  <div className="flex justify-between mt-1 text-[11px] text-zinc-500">
                    <span>{(detail.sent || 0) + (detail.failed || 0)} / {detail.total || 0} processed{(detail.skipped || 0) > 0 && ` · ${detail.skipped} skipped`}</span>
                    <span>{fmtDuration(detail)}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs bg-stone-50 rounded-xl px-3 py-2">
                <span className="text-zinc-500">Audience: <span className="font-medium text-zinc-800">{recipientLabel(detail)}</span></span>
                {detailPreview && <span className="text-zinc-500">· <span className="font-medium text-zinc-800">{detailPreview.sendable}</span> reachable now{detailPreview.skipped > 0 && ` (${detailPreview.skipped} invalid)`}{detailPreview.blocked > 0 && ` (${detailPreview.blocked} known-bad auto-skipped)`}</span>}
                {(detail.status === 'draft' || detail.status === 'failed' || detail.status === 'scheduled') && (
                  <button onClick={() => { const d = detail; setDetail(null); prefillWizard(d, '', 2); }} className="ml-auto font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2">Edit audience…</button>
                )}
              </div>
              {detail.scheduledAt && <div className="text-xs text-amber-600 inline-flex items-center gap-1"><Icons.Clock /> Scheduled: {new Date(detail.scheduledAt).toLocaleString()}</div>}
              <div className="flex flex-wrap gap-2">
                {['all', 'ok', 'failed'].map(f => (
                  <button key={f} onClick={() => setDetailFilter(f)}
                    className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', detailFilter === f ? 'bg-zinc-900 text-white' : 'bg-stone-100 text-zinc-600 hover:bg-stone-200')}>
                    {f === 'all' ? `All (${(detail.results || []).length})` : f === 'ok' ? `Sent (${(detail.results || []).filter(r => r.ok).length})` : `Failed (${failedCount(detail)})`}
                  </button>
                ))}
                <input value={detailSearch} onChange={(e) => setDetailSearch(e.target.value)} placeholder="Search phone or name…"
                  className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg border border-stone-200 text-xs focus:outline-none focus:border-brand-400" />
              </div>
              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                {detailResults().length === 0 && <div className="text-xs text-zinc-400 text-center py-4">No results yet — send the campaign to populate this.</div>}
                {detailResults().map((r, i) => (
                  <div key={i} onClick={() => copyPhone(r.phone)} title="Click to copy phone"
                    className={cn('flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg cursor-pointer', { 'bg-emerald-50 hover:bg-emerald-100': r.ok, 'bg-red-50 hover:bg-red-100': !r.ok })}>
                    {r.ok ? <span className="text-emerald-600"><Icons.Check /></span> : <span className="text-red-500"><Icons.X /></span>}
                    <span className="font-mono text-zinc-700">{r.phone}</span>
                    <span className="text-zinc-500 truncate">{r.name}</span>
                    {!r.ok && r.error && <span className="text-red-500 truncate" title={r.error}>{r.error}</span>}
                    {r.sentAt && <span className="text-zinc-400 shrink-0">{new Date(r.sentAt).toLocaleTimeString()}</span>}
                    {!r.ok && (
                      <button onClick={(e) => { e.stopPropagation(); retryOne(r.phone); }} title={`Retry ${r.phone}`}
                        className="ml-auto shrink-0 px-2 py-1 rounded-lg bg-white border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-500 hover:text-white transition-colors">Retry</button>
                    )}
                    {r.ok && r.sentAt && <span className="ml-auto shrink-0" />}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 pt-1 border-t border-stone-100">
                {(detail.status === 'cancelled' || detail.status === 'failed') && (
                  <>
                    <button onClick={() => resumeCampaign(detail, 'pending')} className="px-3 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-700">Resume — {Math.max(0, (detail.total || 0) - (detail.results || []).filter(r => r.ok).length - failedCount(detail))} pending</button>
                    <button onClick={() => resumeCampaign(detail, 'all')} className="px-3 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50">Resend to all {detail.total || 0}</button>
                  </>
                )}
                {detail.status === 'done' && (
                  <button onClick={() => { setDetail(null); resendAll(detail); }} className="px-3 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-700">Resend all</button>
                )}
                {failedCount(detail) > 0 && (detail.status === 'failed' || detail.status === 'done') && (
                  <button onClick={() => { setDetail(null); retryFailed(detail); }} className="px-3 py-2 rounded-xl border border-brand-200 text-brand-700 text-xs font-bold hover:bg-brand-50">Retry {failedCount(detail)} failed</button>
                )}
                <button onClick={() => { const d = detail; setDetail(null); prefillWizard(d, ' (copy)', 2); }} className="px-3 py-2 rounded-xl border border-stone-200 text-xs font-medium hover:bg-stone-50">New audience…</button>
                <button onClick={() => { const d = detail; setDetail(null); duplicateCampaign(d); }} className="px-3 py-2 rounded-xl border border-stone-200 text-xs font-medium hover:bg-stone-50">Copy</button>
                <button onClick={() => saveAsTemplate(detail)} className="px-3 py-2 rounded-xl border border-stone-200 text-xs font-medium hover:bg-stone-50">Save as template</button>
                <button onClick={() => exportResults(detail)} className="px-3 py-2 rounded-xl border border-stone-200 text-xs font-medium hover:bg-stone-50">Export CSV</button>
                {(detail.status === 'draft' || detail.status === 'failed' || detail.status === 'scheduled' || detail.status === 'done' || detail.status === 'cancelled') && (
                  <button onClick={async () => { const id = detail.id; setDetail(null); await removeCampaign(id); }} className="px-3 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50">Delete</button>
                )}
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ── Compose Step ──
  if (step === 1) {
    return (
      <div className="flex flex-col gap-4">
        <StepIndicator current={1} />
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6">
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-zinc-900">Compose Message</h3>
              <Input label="Campaign Name" value={compose.name} onChange={(e) => setCompose({ ...compose, name: e.target.value })} placeholder="e.g. Weekend Special Offer" />
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Message</label>
                <textarea ref={msgRef} value={compose.message} onChange={(e) => setCompose({ ...compose, message: e.target.value })} rows={8}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 resize-none" placeholder="Write your WhatsApp message here... Use {tags} for personalization." />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-zinc-400">{compose.message.length} characters</p>
                </div>
                <div className="mt-2">
                  <div className="text-xs font-medium text-zinc-500 mb-1.5">Merge tags — click to insert</div>
                  <div className="flex flex-wrap gap-1.5">
                    {['name', 'phone', 'brand_name', 'time', ...varRows.map(r => r.k.trim()).filter(k => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k))].filter((v, i, a) => a.indexOf(v) === i).map(tag => (
                      <button key={tag} type="button" onClick={() => insertTag(tag)}
                        className="px-2.5 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-mono font-medium hover:bg-brand-100 transition-colors">{`{${tag}}`}</button>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">name/phone come from each contact · brand_name from Settings · time is now · rest from Variables below. Unknown tags stay as-is.</p>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Variables</label>
                <div className="flex flex-col gap-1.5">
                  {varRows.map((row, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <input value={row.k} onChange={(e) => { const next = varRows.slice(); next[i] = { ...next[i], k: e.target.value }; setVarRows(next); }}
                        placeholder="key" className="w-32 px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs font-mono focus:outline-none focus:border-brand-400" />
                      <input value={row.v} onChange={(e) => { const next = varRows.slice(); next[i] = { ...next[i], v: e.target.value }; setVarRows(next); }}
                        placeholder="value" className="flex-1 px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs focus:outline-none focus:border-brand-400" />
                      <button type="button" onClick={() => setVarRows(varRows.filter((_, j) => j !== i))} className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500"><Icons.X s={12} /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => varRows.length < 20 && setVarRows([...varRows, { k: '', v: '' }])} className="text-xs text-brand-600 hover:text-brand-700 font-medium inline-flex items-center gap-1"><Icons.Plus s={12} /> Add variable</button>
                </div>
              </div>
                <div className="flex gap-2 items-end mt-2 p-3 rounded-xl bg-stone-50 border border-stone-100">
                  <Input label="Test number" value={testPhone} onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="9876543210" className="!w-32" />
                  <button onClick={testSend} className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-xs font-medium hover:bg-black transition-colors whitespace-nowrap inline-flex items-center gap-1"><Icons.Zap s={12} /> Send Test</button>
                </div>
                {testResult && (
                  <div className={cn('mt-2 text-xs px-3 py-2 rounded-xl', { 'bg-emerald-50 text-emerald-700': testResult.ok, 'bg-red-50 text-red-600': !testResult.ok })}>
              {testResult.ok ? 'Test sent successfully! (test sends are not counted in the dashboard)' : `Failed: ${JSON.stringify(testResult.error || testResult.result)}`}
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-zinc-500 mb-1 block">Image (optional)</label>
                  <div className="flex gap-2">
                    <input value={compose.imageUrl} onChange={(e) => setCompose({ ...compose, imageUrl: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-xl border border-stone-200 text-sm bg-stone-50" placeholder="Upload, paste URL, or pick from library below" />
                    <label className="px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm font-medium cursor-pointer hover:bg-stone-50 inline-flex items-center gap-1">
                      <Icons.Upload /> Upload
                      <input type="file" accept="image/*" className="hidden" onChange={uploadImage} />
                    </label>
                  </div>
                </div>
                {media.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs text-zinc-500 mb-1.5">Or choose from Media Library ({media.length})</div>
                    <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto border border-stone-100 rounded-xl p-1.5">
                      {media.map(m => {
                        const active = compose.imageUrl === m.url;
                        return (
                          <button key={m.id} type="button" onClick={() => setCompose({ ...compose, imageUrl: active ? '' : m.url })}
                            title={m.originalName || m.filename}
                            className={cn('relative rounded-lg overflow-hidden border-2 transition-all', {
                              'border-brand-500 ring-2 ring-brand-500/20': active,
                              'border-transparent hover:border-brand-300': !active,
                            })}>
                            <img src={m.url} alt={m.originalName || ''} className="h-16 w-full object-cover" />
                            {active && <span className="absolute top-1 right-1 size-5 rounded-full bg-brand-600 text-white flex items-center justify-center"><Icons.Check s={12} /></span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {compose.imageUrl && (
                  <div className="mt-2 relative inline-block">
                    <img src={compose.imageUrl.startsWith('http') ? compose.imageUrl : compose.imageUrl} onError={(e) => { e.currentTarget.style.display = 'none'; }} alt="" className="h-32 rounded-xl object-cover border border-stone-200" />
                    <button onClick={() => setCompose({ ...compose, imageUrl: '' })} className="absolute -top-2 -right-2 size-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"><Icons.X s={12} /></button>
                  </div>
                )}
            </div>
            {/* Template picker */}
            {templates.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-200 p-5">
                <h3 className="text-sm font-bold text-zinc-900 mb-3">Use a Template</h3>
                <div className="grid gap-2 sm:grid-cols-2">
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
            <div className="sticky top-6 flex flex-col gap-4">
              <div className="bg-white rounded-2xl border border-stone-200 p-4">
                <h4 className="text-xs font-bold text-zinc-500 mb-2">WhatsApp Preview</h4>
                {renderPreview(compose.message, compose.imageUrl)}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(0)} className="flex-1 py-2 rounded-xl border border-stone-200 text-sm font-medium hover:bg-stone-50">Back</button>
                <button onClick={() => { if (!compose.name || !compose.message) return toast('Name and message required'); setStep(2); }} className="flex-1 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700">Next: Recipients</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Recipients Step ──
  if (step === 2) {
    const q = contactSearch.trim().toLowerCase();
    const visibleCustomers = customers.filter(c =>
      !q || c.phone.includes(q) || (c.name || '').toLowerCase().includes(q),
    );
    const sendableVisible = visibleCustomers.filter(c => isSendable(c.phone));
    const allVisibleSelected = sendableVisible.length > 0 && sendableVisible.every(c => selectedPhones.includes(normPhone(c.phone)));
    const togglePhone = (phone) => {
      const p = normPhone(phone);
      if (!isSendable(p)) return;
      setSelectedPhones(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
    };
    const toggleVisible = () => {
      if (allVisibleSelected) {
        const drop = new Set(sendableVisible.map(c => normPhone(c.phone)));
        setSelectedPhones(prev => prev.filter(x => !drop.has(x)));
      } else {
        const add = sendableVisible.map(c => normPhone(c.phone));
        setSelectedPhones(prev => [...new Set([...prev, ...add])]);
      }
    };
    const modeCard = (mode, title, sub) => (
      <label className={cn('flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors', {
        'border-brand-500 bg-brand-50/50': recipientMode === mode,
        'border-stone-200 hover:border-brand-300': recipientMode !== mode,
      })}>
        <input type="radio" name="rmode" value={mode} checked={recipientMode === mode} onChange={() => setRecipientMode(mode)} className="accent-brand-600" />
        <div>
          <div className="text-sm font-medium text-zinc-900">{title}</div>
          <div className="text-xs text-zinc-400">{sub}</div>
        </div>
      </label>
    );
    return (
      <div className="flex flex-col gap-4">
        <StepIndicator current={2} />
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6">
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-zinc-900">Who should receive this?</h3>
              {modeCard('all', 'All Customers', `${customers.filter(c => isSendable(c.phone)).length} sendable of ${customers.length} contacts`)}
              {modeCard('tag', 'By Tag', tags.length > 0 ? `${tags.length} tags available` : 'No tags yet — tag customers first')}
              {modeCard('custom', 'Specific Contacts', selectedPhones.length > 0 ? `${selectedPhones.length} selected` : 'Pick individual contacts below')}
              {recipientMode === 'tag' && (
                <div className="flex flex-col gap-2 pl-1">
                  {tags.length === 0 && <p className="text-xs text-zinc-400">No tags exist yet. Add tags on the Customers page.</p>}
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
              )}
              {recipientMode === 'custom' && (
                <div className="flex flex-col gap-2 pl-1">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"><Icons.Search s={14} /></span>
                      <input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Search name or number..."
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400" />
                    </div>
                    <button onClick={toggleVisible} className="px-3 py-2 rounded-xl border border-stone-200 text-xs font-medium hover:bg-stone-50 whitespace-nowrap">
                      {allVisibleSelected ? 'Clear visible' : 'Select visible'}
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto flex flex-col gap-1 border border-stone-100 rounded-xl p-1">
                    {visibleCustomers.length === 0 && <p className="text-xs text-zinc-400 text-center py-4">No contacts match.</p>}
                    {visibleCustomers.map(c => {
                      const ok = isSendable(c.phone);
                      const checked = selectedPhones.includes(normPhone(c.phone));
                      return (
                        <label key={c.id || c.phone} className={cn('flex items-center gap-3 px-3 py-2 rounded-lg transition-colors', {
                          'hover:bg-stone-50 cursor-pointer': ok,
                          'opacity-60 cursor-not-allowed bg-stone-50/50': !ok,
                        })}>
                          <input type="checkbox" checked={checked} disabled={!ok} onChange={() => togglePhone(c.phone)} className="accent-brand-600" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-zinc-900 truncate">{c.name || <span className="text-zinc-400">Unnamed</span>}</div>
                            <div className="text-xs text-zinc-400 font-mono">{c.phone}</div>
                          </div>
                          {!ok && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">INVALID NUMBER</span>}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-zinc-400">Invalid numbers (e.g. WhatsApp IDs) can't receive campaigns and can't be selected.</p>
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-zinc-900 inline-flex items-center gap-1.5"><Icons.Calendar /> Schedule (optional)</h3>
              <div>
                <label className="text-xs font-medium text-zinc-500 mb-1 block">Send at</label>
                <DateTimePicker value={scheduledAt} onChange={setScheduledAt} />
              </div>
              <p className="text-xs text-zinc-400">{scheduledAt ? 'Campaign will send automatically at this time.' : 'Leave empty to send immediately'}</p>
            </div>
          </div>
          <div>
            <div className="sticky top-6 flex flex-col gap-4">
              <div className="bg-white rounded-2xl border border-stone-200 p-4">
                <h4 className="text-xs font-bold text-zinc-500 mb-2">WhatsApp Preview</h4>
                {renderPreview(compose.message, compose.imageUrl)}
              </div>
              <div className="bg-brand-50 rounded-2xl border border-brand-200 p-4 text-center">
                <div className="text-2xl font-bold text-brand-700">{recipientCount}</div>
                <div className="text-xs text-brand-600">recipients will receive this</div>
                {preview.skipped > 0 && <div className="text-xs text-amber-600 font-medium mt-1">{preview.skipped} invalid skipped</div>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="flex-1 py-2 rounded-xl border border-stone-200 text-sm font-medium hover:bg-stone-50">Back</button>
                <button onClick={() => { if (recipientMode === 'custom' && selectedPhones.length === 0) return toast('Select at least one contact'); setStep(3); }} className="flex-1 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700">Next: Review</button>
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
      <div className="flex flex-col gap-4">
        <StepIndicator current={3} />
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6">
          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col gap-4">
              <h3 className="text-sm font-bold text-zinc-900">Review & Send</h3>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between text-sm"><span className="text-zinc-500">Campaign</span><span className="font-medium text-zinc-900">{compose.name}</span></div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Recipients</span>
                  <span className="font-medium text-zinc-900 text-right">
                    {recipientMode === 'custom'
                      ? `${selectedPhones.length} selected contacts`
                      : recipientMode === 'tag' ? `Tag: ${recipientTag}` : 'All Customers'}
                    {` (${recipientCount})`}
                  </span>
                </div>
                {preview.skipped > 0 && (
                  <div className="text-xs px-3 py-2 rounded-xl bg-amber-50 text-amber-700 font-medium">
                    {preview.skipped} contact{preview.skipped === 1 ? '' : 's'} will be skipped (invalid numbers).
                  </div>
                )}
                {scheduledAt && <div className="flex justify-between text-sm"><span className="text-zinc-500">Sends</span><span className="font-medium text-zinc-900">{new Date(scheduledAt).toLocaleString()} (automatic)</span></div>}
                {Object.keys(variablesObj()).length > 0 && (
                  <div className="flex justify-between text-sm gap-4">
                    <span className="text-zinc-500 shrink-0">Variables</span>
                    <span className="font-mono text-xs text-zinc-700 text-right">{Object.entries(variablesObj()).map(([k, v]) => `${k}=${v || '∅'}`).join(' · ')}</span>
                  </div>
                )}
                {compose.imageUrl && <div className="flex justify-between text-sm"><span className="text-zinc-500">Image</span><span className="font-medium text-emerald-600">Attached</span></div>}
                <div className="border-t border-stone-200 pt-3">
                  <div className="text-xs text-zinc-500 mb-1">Message Preview:</div>
                  <div className="bg-stone-50 rounded-xl p-3 text-sm text-zinc-700 whitespace-pre-line">{compose.message}</div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <div className="sticky top-6 flex flex-col gap-4">
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
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={cn('size-7 rounded-full flex items-center justify-center text-xs font-bold', {
              'bg-emerald-500 text-white': i + 1 < current,
              'bg-brand-600 text-white': i + 1 === current,
              'bg-stone-200 text-zinc-500': i + 1 > current,
            })}>
              {i + 1 < current ? <Icons.Check s={14} /> : i + 1}
            </div>
            <span className={cn('text-sm font-medium', { 'text-zinc-900': i + 1 === current, 'text-zinc-400': i + 1 !== current })}>{s}</span>
            {i < steps.length - 1 && <div className={cn('w-8 h-0.5', { 'bg-emerald-500': i + 1 < current, 'bg-stone-200': i + 1 >= current })} />}
          </div>
        ))}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════
function SettingsView() {
  const { toast } = useDialog();
  const [settings, setSettings] = useState({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [adminKey, setAdminKey] = useState(() => getAdminKey());
  const logoRef = useRef();

  useEffect(() => { api('/api/settings').then(setSettings).catch(() => {}); }, []);

  const save = async () => {
    setSaveError('');
    try {
      try { localStorage.setItem('ocp_campaign_admin_key', adminKey); } catch {}
      const { delayMs, brandName, brandLogo, brandColor, footerText, defaultCountryCode, dailySendCap, batchSize } = settings;
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ delayMs, brandName, brandLogo, brandColor, footerText, defaultCountryCode, dailySendCap, batchSize }) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(e.message || 'save failed');
    }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) { toast('Only JPEG/PNG/WebP/GIF allowed'); e.target.value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { toast('Image too large (max 5MB)'); e.target.value = ''; return; }
    const fd = new FormData();
    fd.append('file', file);
    try {
      const headers = {};
      const k = getAdminKey();
      if (k) headers['X-Admin-Key'] = k;
      const res = await fetch(`${API}/api/media/upload`, { method: 'POST', headers, body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) { toast(data?.error || `upload failed (${res.status})`); return; }
      setSettings({ ...settings, brandLogo: data.url });
    } catch {
      toast('upload failed');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Settings</h1>
        <p className="text-sm text-zinc-500">Configure your campaign runner</p>
      </div>

      {/* Brand */}
      <Card>
        <CardHeader>
          <CardTitle>Brand Identity</CardTitle>
          <CardDescription>Name, color, logo and footer used across messages</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Brand Name" value={settings.brandName || ''} onChange={(e) => setSettings({ ...settings, brandName: e.target.value })} placeholder="Your Restaurant Name" />
          <div>
            <label className="text-xs font-medium text-zinc-500 mb-1 block">Brand Color</label>
            <div className="flex gap-2 items-center">
              <input type="color" value={settings.brandColor || '#ea580c'} onChange={(e) => setSettings({ ...settings, brandColor: e.target.value })} className="size-10 rounded-lg border border-stone-200 cursor-pointer" />
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
            {settings.brandLogo && <img src={settings.brandLogo} alt="Logo" className="size-10 rounded-lg object-cover border border-stone-200" />}
          </div>
        </div>
        <Input label="Footer Text" value={settings.footerText || ''} onChange={(e) => setSettings({ ...settings, footerText: e.target.value })} placeholder="Sent via Your Brand" />
        </CardContent>
      </Card>

      {/* Bot Connection */}
      <Card>
        <CardHeader>
          <CardTitle>Bot Connection</CardTitle>
          <CardDescription>Connect to your OCP Go bot to sync customers and send messages.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
        <Input label="Admin Key (stored locally, never sent to server except as auth header)" type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="Your BOT_ADMIN_KEY from .env" />
        <div className="text-xs text-zinc-500">Bot URL: <span className="font-mono">{settings.botApiUrl || 'http://bot:8090'}</span> (environment-only) · {settings.configured ? 'configured' : 'not configured'}</div>
        <Input label="Delay Between Batches (ms, 500-10000)" type="number" value={settings.delayMs || 3000} onChange={(e) => setSettings({ ...settings, delayMs: parseInt(e.target.value) || 3000 })} />
        <p className="text-xs text-zinc-400">Messages are sent through the bot's Evolution GO integration. Recommended: 3000ms.</p>
        </CardContent>
      </Card>

      {/* Sending Safety */}
      <Card>
        <CardHeader>
          <CardTitle>Sending Safety</CardTitle>
          <CardDescription>Anti-ban guardrails: pace sends and cap daily volume.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
        <div className="text-xs text-zinc-500">Sent today (IST): <span className="font-bold text-zinc-800">{settings.sentToday ?? 0}</span>{(settings.dailySendCap || 0) > 0 && <> / {settings.dailySendCap}</>} · Known-bad numbers auto-skipped: <span className="font-bold text-zinc-800">{settings.blockedCount ?? 0}</span></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Daily Send Cap (0 = unlimited)" type="number" value={settings.dailySendCap ?? 1000} onChange={(e) => setSettings({ ...settings, dailySendCap: parseInt(e.target.value) || 0 })} placeholder="1000" />
          <Input label="Contacts Per Batch (1-20)" type="number" value={settings.batchSize ?? 5} onChange={(e) => setSettings({ ...settings, batchSize: Math.min(20, Math.max(1, parseInt(e.target.value) || 5)) })} placeholder="5" />
        </div>
        <p className="text-xs text-zinc-400">New sends are refused once the cap is reached. Smaller batches + longer delays keep WhatsApp from rate-limiting the account. Dead numbers are learned automatically and skipped before sending.</p>
        </CardContent>
      </Card>

      {saveError && <p className="text-xs text-red-500">{saveError}</p>}
      <button onClick={save} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
        {saved ? <><Icons.Check /> Saved!</> : 'Save Settings'}
      </button>
    </div>
  );
}
