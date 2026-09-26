import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PauseCircle, PlusCircle, ReceiptText } from 'lucide-react';
import Button from '../components/ui/Button';
import { adminFetch, getAdminKey } from '../services/api';
import {
  posApi,
  getPosOutletId,
  toPaise,
  posErrorMessage,
  type PosOrder,
  type PosOrderType,
} from '../services/posService';
import PosAuthGate from '../components/pos/PosAuthGate';
import PosHeader from '../components/pos/PosHeader';
import MenuPanel from '../components/pos/MenuPanel';
import TablePicker from '../components/pos/TablePicker';
import CartPanel from '../components/pos/CartPanel';
import CheckoutPanel from '../components/pos/CheckoutPanel';
import HoldDrawer from '../components/pos/HoldDrawer';
import { usePosConfig } from '../hooks/usePosConfig';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import ReceiptModal from '../components/pos/ReceiptModal';
import type { CartLine, HeldOrder, RecordedPayment } from '../components/pos/types';

type PendingConfirm =
  | { kind: 'outlet'; id: number | null }
  | { kind: 'new-sale' }
  | { kind: 'cancel' }
  | { kind: 'remove'; key: string; name: string }
  | { kind: 'clear'; count: number }
  | null;

const PAYMENTS_KEY = (orderId: number): string => `ocp_pos_payments:${orderId}`;

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

type CustomerInfo = { phone: string; name: string; address: string; locality: string };

export default function POS() {
  const [authed, setAuthed] = useState(() => getAdminKey().length > 0);
  const [outletId, setOutletId] = useState<number | null>(() => getPosOutletId());
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<PosOrderType>('dine_in');
  const [tableId, setTableId] = useState(0);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [held, setHeld] = useState<HeldOrder[]>([]);
  const [payments, setPayments] = useState<RecordedPayment[]>([]);
  const [duePaise, setDuePaise] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [holding, setHolding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resumingId, setResumingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const queryClient = useQueryClient();

  // Customer / extra billing state
  const [customer, setCustomer] = useState<CustomerInfo>({ phone: '', name: '', address: '', locality: '' });
  const [containerCharge, setContainerCharge] = useState(0);
  const [tip, setTip] = useState(0);
  const [isComplimentary, setIsComplimentary] = useState(false);
  const [isAdvance, setIsAdvance] = useState(false);
  const [advanceAt, setAdvanceAt] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const [online, setOnline] = useState(true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const roleQuery = useQuery({
    queryKey: ['pos-role'],
    queryFn: () => adminFetch<{ role?: string; user?: { role?: string; name?: string } }>('/admin/me').then((r) => r.role ?? r.user?.role ?? 'owner'),
    enabled: authed,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const role = roleQuery.data ?? 'owner';
  const operatorName = ((roleQuery.data as { user?: { name?: string } })?.user?.name) ?? '';
  const canPay = ['owner', 'manager', 'cashier'].includes(role);
  const canDiscount = ['owner', 'manager'].includes(role);
  const canRefund = ['owner', 'manager'].includes(role);
  const outletsQuery = useQuery({ queryKey: ['pos-outlets-name'], queryFn: posApi.getOutlets, enabled: authed, staleTime: 60_000 });
  const outletName = outletsQuery.data?.find(o => o.id === outletId)?.name ?? null;
  const { config } = usePosConfig();
  const activeOrderTypes = useMemo(() => config.order_types.filter(o => o.active), [config.order_types]);
  // Sync container default from config (once, when config loads, if not dirty)
  useEffect(() => {
    if (config.charges.container_default !== containerCharge && cart.length === 0 && orderId == null) {
      setContainerCharge(config.charges.container_default);
    }
  }, [config.charges.container_default]); // eslint-disable-line react-hooks/exhaustive-deps
  // Apply POS accent token reactively
  useEffect(() => {
    const root = document.querySelector('.pos') as HTMLElement | null;
    if (root && config.ui.pos_accent) {
      root.style.setProperty('--pos-accent', config.ui.pos_accent);
      root.style.setProperty('--pos-accent-hover', config.ui.pos_accent);
    }
  }, [config.ui.pos_accent]);
  // Keep orderType in sync with config's active order types
  useEffect(() => {
    if (activeOrderTypes.length && !activeOrderTypes.find(o => o.key === orderType)) {
      const first = activeOrderTypes[0]?.key as PosOrderType | undefined;
      if (first) setOrderType(first);
    }
  }, [activeOrderTypes, orderType]);

  const heldKey = (id: number | null) => `ocp_pos_held:${id ?? 'default'}`;
  const orderKey = (id: number | null) => `ocp_pos_order:${id ?? 'default'}`;
  useEffect(() => { setHeld(loadJSON<HeldOrder[]>(heldKey(outletId), [])); }, [outletId]);
  useEffect(() => { saveJSON(heldKey(outletId), held); }, [outletId, held]);
  useEffect(() => { setOrderId(loadJSON<number | null>(orderKey(outletId), null)); }, [outletId]);
  useEffect(() => { if (orderId != null) saveJSON(orderKey(outletId), orderId); }, [orderId, outletId]);
  useEffect(() => {
    if (orderId == null) { setPayments([]); setDuePaise(null); return; }
    const saved = loadJSON<{ due: number | null; payments: RecordedPayment[] }>(PAYMENTS_KEY(orderId), { due: null, payments: [] });
    setPayments(saved.payments); setDuePaise(saved.due ?? null);
  }, [orderId]);
  useEffect(() => { if (orderId != null) saveJSON(PAYMENTS_KEY(orderId), { due: duePaise, payments }); }, [orderId, duePaise, payments]);

  const resetSale = useCallback(() => {
    // Hardening: clear both order and ledger together (P0 leak fix)
    const prevOrderId = orderId;
    setCart([]); setOrderType('dine_in'); setTableId(0); setOrderId(null); setPayments([]); setDuePaise(null);
    setCustomer({ phone: '', name: '', address: '', locality: '' }); setContainerCharge(0); setTip(0); setIsComplimentary(false); setIsAdvance(false); setAdvanceAt(''); setGuestCount(1); setNotice(null);
    try {
      localStorage.removeItem(`ocp_pos_order:${outletId ?? 'default'}`);
      if (prevOrderId != null) localStorage.removeItem(PAYMENTS_KEY(prevOrderId));
    } catch {}
  }, [outletId, orderId]);

  const openOrder = useCallback((id: number, totalRupees: number) => {
    setOrderId(id); setPayments([]); setDuePaise(toPaise(totalRupees)); queryClient.invalidateQueries({ queryKey: ['pos-tables'] });
  }, [queryClient]);

  const addLine = useCallback((line: Omit<CartLine, 'key'>) => {
    // addon-aware key: size|crust|sorted addon ids (server is price authority, frontend key is dedupe only)
    const addonKey = (line.addons ?? []).map(a => `${a.group_id}:${a.menu_item_id}`).sort().join(',');
    const key = `${line.menuItemID}|${line.size}|${line.crust}|${addonKey}`;
    setCart((prev) => {
      const found = prev.find((l) => l.key === key);
      if (found) {
        const nextQty = Math.min(20, found.quantity + line.quantity);
        if (nextQty === 20 && found.quantity === 20) setNotice('Maximum quantity 20 reached.');
        return prev.map((l) => (l.key === key ? { ...l, quantity: nextQty } : l));
      }
      if (line.quantity > 20) setNotice('Quantity capped at 20.');
      return [...prev, { ...line, key, quantity: Math.min(20, line.quantity), addons: line.addons } as CartLine];
    });
    setNotice(null);
  }, []);

  const createOrder = async () => {
    if (cart.length === 0) return;
    // Basic customer validation for hardening (defer required enforcement to PR4, but warn)
    if (orderType === 'delivery' && !customer.phone.trim()) {
      setFatal('Delivery requires phone number.');
      return;
    }
    if (orderType === 'dine_in' && tableId === 0) {
      setFatal('Dine-in requires table selection.');
      return;
    }
    setCreating(true); setFatal(null);
    try {
      const created = await posApi.createOrder(
        cart.map((l) => ({ menuItemID: l.menuItemID, size: l.size, crust: l.crust, quantity: l.quantity, addons: (l.addons ?? []).map(a => ({ group_id: a.group_id, menu_item_id: a.menu_item_id })) })),
        orderType === 'dine_in' ? tableId : 0,
        orderType,
        {
          customer_phone: customer.phone,
          customer_name: customer.name,
          address: customer.address,
          locality: customer.locality,
          guest_count: Math.max(1, Math.min(50, guestCount)),
          container_charge: Math.max(0, containerCharge),
          tip_amount: Math.max(0, tip),
          is_complimentary: isComplimentary,
          advance_at: isAdvance ? advanceAt : '',
        },
      );
      // POS orchestrates lifecycle: create (draft) → confirm (confirmed).
      // Payment and completion stay separate services; confirm here so
      // Pay/Complete work without a manual hold→resume loop.
      // Confirmation failures surface explicitly: never pretend confirmed.
      try {
        await posApi.confirmOrder(created.id);
      } catch (e) {
        const { status, message } = posErrorMessage(e);
        setCart([]); setTableId(0); openOrder(created.id, created.total);
        setFatal(`Order #${created.order_number} created but confirm failed (${status ?? 'error'}): ${message}. Pay/complete may be blocked until confirmed.`);
        return;
      }
      setCart([]); setTableId(0); openOrder(created.id, created.total);
      setNotice(`Order #${created.order_number} created and confirmed.`);
    } catch (e) {
      const { status, message } = posErrorMessage(e);
      setFatal(status === 403 ? 'Your role cannot create orders.' : message);
    } finally { setCreating(false); }
  };

  const doOutletSwitch = useCallback((id: number | null) => {
    setOutletId(id); resetSale(); queryClient.invalidateQueries({ queryKey: ['pos-menu'] }); queryClient.invalidateQueries({ queryKey: ['pos-tables'] });
  }, [queryClient, resetSale]);

  const doCancelOrder = useCallback(async () => {
    if (orderId == null) return;
    setCancelling(true);
    try { await posApi.cancelOrder(orderId); resetSale(); setNotice('Order cancelled.'); }
    catch (e) { setNotice(posErrorMessage(e as Error).message); }
    finally { setCancelling(false); }
  }, [orderId, resetSale]);

  const confirmingRef = useRef(false);
  const executePendingConfirm = useCallback(async () => {
    if (confirmingRef.current) return;
    const pc = pendingConfirm;
    if (!pc) return;
    confirmingRef.current = true;
    setPendingConfirm(null);
    try {
      if (pc.kind === 'outlet') doOutletSwitch(pc.id);
      else if (pc.kind === 'new-sale') resetSale();
      else if (pc.kind === 'cancel') await doCancelOrder();
      else if (pc.kind === 'remove') setCart((p: CartLine[]) => p.filter(l => l.key !== pc.key));
      else if (pc.kind === 'clear') setCart([]);
    } finally {
      confirmingRef.current = false;
    }
  }, [pendingConfirm, doOutletSwitch, resetSale, doCancelOrder]);

  const confirmCopy: { title: string; message: string; confirmLabel: string; danger: boolean } = pendingConfirm == null
    ? { title: '', message: '', confirmLabel: 'Confirm', danger: false }
    : pendingConfirm.kind === 'outlet'
      ? { title: 'Switch outlet?', message: 'Current sale will be cleared.', confirmLabel: 'Switch', danger: true }
      : pendingConfirm.kind === 'new-sale'
        ? { title: 'Start new sale?', message: 'This will clear the current cart and inputs.', confirmLabel: 'New sale', danger: true }
        : pendingConfirm.kind === 'cancel'
          ? { title: 'Cancel this order?', message: 'The order will be cancelled. This cannot be undone.', confirmLabel: 'Cancel order', danger: true }
          : pendingConfirm.kind === 'remove'
            ? { title: `Remove ${pendingConfirm.name}?`, message: 'The item will be removed from the cart.', confirmLabel: 'Remove', danger: true }
            : { title: `Clear ${pendingConfirm.count} item(s)?`, message: 'The cart will be emptied.', confirmLabel: 'Clear', danger: true };

  const header = useMemo(() => (
    <PosHeader
      outletId={outletId}
      onOutlet={(id) => {
        if (cart.length > 0 || orderId != null) { setPendingConfirm({ kind: 'outlet', id }); return; }
        doOutletSwitch(id);
      }}
      operator={operatorName}
      role={role}
      heldCount={held.length}
      onNewSale={() => {
        if (cart.length > 0 || orderId != null) { setPendingConfirm({ kind: 'new-sale' }); return; }
        resetSale();
      }}
      onHeld={() => setHoldOpen(true)}
      onLock={() => setAuthed(false)}
      online={online}
      billNo={orderId ? `#${orderId}` : null}
      kotNo={null}
      headerTitle={config.ui.header_title}
    />
  ), [outletId, operatorName, role, held.length, cart.length, orderId, resetSale, doOutletSwitch, online, config.ui.header_title]);

  const orderQuery = useQuery({
    queryKey: ['pos-order', orderId],
    queryFn: () => posApi.getOrder(orderId as number),
    enabled: authed && orderId != null,
    staleTime: 5 * 1000,
    retry: 1,
  });
  const order: PosOrder | undefined = orderQuery.data;
  const serverHeldQuery = useQuery({
    queryKey: ['pos-held', outletId],
    queryFn: () => posApi.getHeldOrders(),
    enabled: authed && holdOpen,
    staleTime: 10_000,
    retry: 1,
  });
  const serverHeld = serverHeldQuery.data ?? [];

  if (!authed) return <PosAuthGate onAuthed={() => setAuthed(true)} />;
  return (
    <div className="pos min-h-screen bg-[var(--pos-panel)] flex flex-col">
      <a href="#pos-main" className="sr-only focus:not-sr-only focus:absolute focus:z-[70] focus:px-4 focus:py-2 focus:bg-zinc-900 focus:text-white focus:rounded-xl focus:m-2">
        Skip to menu
      </a>
      {header}
      <main id="pos-main" className="mx-auto w-full max-w-[1600px] flex-1 p-2 gap-2 grid grid-cols-1 md:grid-cols-[200px_1fr] lg:grid-cols-[220px_minmax(0,1fr)_340px] xl:grid-cols-[220px_minmax(0,1fr)_400px] items-start">
        {/* LEFT - Categories vertical (md+; tabs below md/lg breakpoint) */}
        <div className="hidden md:flex md:flex-col rounded-xl border border-[var(--pos-border)] bg-white overflow-hidden md:max-h-[calc(100dvh-72px)] md:sticky md:top-[66px]">
          <div className="h-9 px-3 flex items-center bg-zinc-900 text-white text-xs font-bold tracking-wider">CATEGORIES</div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <CategoryColumn selected={selectedCategory} onSelect={setSelectedCategory} />
          </div>
        </div>
        {/* MIDDLE - Menu grid */}
        <div className="rounded-xl border border-[var(--pos-border)] bg-white p-3 flex flex-col min-h-0 md:max-h-[calc(100dvh-72px)] md:overflow-hidden">
          <MenuPanel onAdd={addLine} outletId={outletId} cart={cart} onQty={(k: string,d: number)=> setCart((p: CartLine[])=>p.map(l=>l.key===k?{...l,quantity:Math.max(1, Math.min(20, l.quantity+d))}:l).filter(l=>l.quantity>0))} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
        </div>
        {/* Bill anchor — navigation only, no pricing (visible below lg where bill sits under menu) */}
        <a href="#pos-bill" className="md:col-span-2 lg:hidden rounded-xl border border-[var(--pos-border)] bg-zinc-900 text-white text-sm font-bold text-center py-3 min-h-[44px] flex items-center justify-center gap-2">
          Go to bill ↓
        </a>
        {/* RIGHT - Bill (below on <lg, sticky third column at lg+) */}
        <div id="pos-bill" className="rounded-xl border border-[var(--pos-border)] bg-white overflow-hidden flex flex-col md:max-h-[calc(100dvh-72px)] md:col-span-2 lg:col-span-1 lg:sticky lg:top-[66px] scroll-mt-[72px]">
          <RightBill
            config={config}
            activeOrderTypes={activeOrderTypes}
            orderType={orderType} onOrderType={(t: PosOrderType)=>{setOrderType(t); if(t!=='dine_in') setTableId(0);}}
            tableId={tableId} setTableId={setTableId} guestCount={guestCount} setGuestCount={setGuestCount} outletId={outletId}
            customer={customer} setCustomer={setCustomer}
            cart={cart} order={order} orderId={orderId}
            containerCharge={containerCharge} setContainerCharge={setContainerCharge}
            tip={tip} setTip={setTip}
            isComplimentary={isComplimentary} setIsComplimentary={setIsComplimentary}
            isAdvance={isAdvance} setIsAdvance={setIsAdvance} advanceAt={advanceAt} setAdvanceAt={setAdvanceAt}
            onQty={(k: string,d: number)=> setCart((p: CartLine[])=>p.map(l=>l.key===k?{...l,quantity:Math.min(20, Math.max(1, l.quantity+d))}:l).filter(l=>l.quantity>0))}
            onCreate={createOrder} creating={creating} canCreate={cart.length>0}
            payments={payments}
            onHold={async()=>{ if(orderId==null) return; setHolding(true); try{await posApi.holdOrder(orderId); const d=await posApi.getOrder(orderId); setHeld((prev: HeldOrder[])=>[{id:d.id,orderNumber:d.order_number,total:d.total,at:new Date().toISOString()},...prev].slice(0,20)); resetSale(); setNotice(`Order #${d.order_number} held.`);}catch(e){setNotice(posErrorMessage(e as Error).message);}finally{setHolding(false);}}}
            onCancel={async()=>{ if(orderId==null) return; setPendingConfirm({ kind: 'cancel' }); }}
            onRequestRemove={(key: string, name: string)=> setPendingConfirm({ kind: 'remove', key, name })}
            onRequestClear={(count: number)=> setPendingConfirm({ kind: 'clear', count })}
            fatal={fatal} setFatal={setFatal} notice={notice}
          />
        </div>
      </main>
      <HoldDrawer open={holdOpen} onClose={()=>setHoldOpen(false)} held={[...serverHeld.map(s => ({ id: s.id, orderNumber: s.order_number, total: s.total, at: s.created_at })), ...held.filter(l => !serverHeld.some(s => s.id === l.id))].slice(0,20)} orderTypes={{}} onResume={async(h: HeldOrder)=>{ setResumingId(h.id); try{await posApi.resumeOrder(h.id); setHeld((prev: HeldOrder[])=>prev.filter(x=>x.id!==h.id)); setHoldOpen(false); const r=await posApi.getOrder(h.id); openOrder(r.id,r.total); setNotice(`Order #${r.order_number} resumed.`);}catch(e){setNotice(posErrorMessage(e as Error).message);}finally{setResumingId(null);}}} resumingId={resumingId} />
      <ReceiptModal open={receiptOpen} onClose={()=>setReceiptOpen(false)} order={order ?? null} payments={payments} canRefund={role==='owner'||role==='manager'} outletName={outletName ?? 'Outlet'} onNewSale={resetSale} />
      <ConfirmDialog open={pendingConfirm != null} title={confirmCopy.title} message={confirmCopy.message} confirmLabel={confirmCopy.confirmLabel} danger={confirmCopy.danger} onConfirm={() => { void executePendingConfirm(); }} onCancel={() => setPendingConfirm(null)} />
    </div>
  );
}

// Left vertical categories — production-grade with [D] tags
function CategoryColumn({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const catQuery = useQuery({
    queryKey: ['pos-categories'],
    queryFn: () => posApi.getCategories(),
    staleTime: 60_000,
  });
  const cats = catQuery.data ?? [];
  return (
    <div className="p-2 space-y-0.5">
      <button type="button" aria-pressed={selected==='all'} onClick={() => onSelect('all')} className={`w-full text-left px-2 py-2 rounded text-xs font-bold flex justify-between items-center ${selected==='all' ? 'bg-[var(--pos-accent)] text-white' : 'hover:bg-zinc-50 text-zinc-700'}`}>
        <span>All Items</span><span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">{cats.length}</span>
      </button>
      {cats.map((c: { id: number; name: string; isDeliverable?: boolean }) => (
        <button
          type="button"
          key={c.id}
          onClick={() => onSelect(String(c.id))}
          aria-pressed={selected===String(c.id)}
          className={`w-full text-left px-2 py-2 rounded text-xs flex justify-between items-center border-b border-zinc-100 last:border-0 ${selected===String(c.id) ? 'bg-zinc-900 text-white border-zinc-900' : 'hover:bg-zinc-50 text-zinc-700'}`}
        >
          <span className="truncate">{c.name}{c.isDeliverable ? ' [D]' : ''}</span>
          <span className={`w-1.5 h-6 rounded ${selected===String(c.id) ? 'bg-white' : 'bg-emerald-500'}`} aria-hidden />
        </button>
      ))}
      {catQuery.isLoading && <p className="px-2 py-2 text-xs text-zinc-400">Loading…</p>}
    </div>
  );
}

function RightBill(props: any) {
  const { config, activeOrderTypes, orderType, onOrderType, tableId, setTableId, guestCount, setGuestCount, customer, setCustomer, cart, order, orderId, containerCharge, setContainerCharge, tip, setTip, isComplimentary, setIsComplimentary, isAdvance, setIsAdvance, advanceAt, setAdvanceAt, onQty, onCreate, creating, canCreate, payments, onHold, onCancel, onRequestRemove, onRequestClear, fatal, setFatal, notice } = props;
  const cfg = config ?? { order_types: [{key:'dine_in',label:'Dine In',active:true},{key:'delivery',label:'Delivery',active:true},{key:'takeaway',label:'Take Away',active:true}], bill_rows: [{key:'subtotal',label:'Sub Total',visible:true},{key:'discount',label:'Discount',visible:true},{key:'container',label:'Container Charge',visible:true},{key:'tax',label:'Tax',visible:true},{key:'round_off',label:'Round Off',visible:true},{key:'customer_paid',label:'Customer Paid',visible:true},{key:'return_to_customer',label:'Return to Customer',visible:true},{key:'tip',label:'Tip',visible:true}], charges: {container_default:0,tip_enabled:true}, features: {complimentary:true,advance_order:true}, ui:{currency_symbol:'₹'}, customer_fields:{phone:{visible:true,for:['delivery','takeaway']},name:{visible:true,for:['dine_in','delivery','takeaway']},address:{visible:true,for:['delivery']},locality:{visible:true,for:['delivery']}} };
  const currency = cfg.ui?.currency_symbol || '₹';
  const subTotal = order ? order.subtotal : cart.reduce((s:number,l:any)=> s + (l.unitPaise ?? 0)*l.quantity,0)/100;
  const discount = order?.discount ?? 0;
  const tax = order?.tax_amount ?? 0;
  const total = order ? order.total : subTotal;
  const roundOff = 0;
  const customerPaid = payments.reduce((s:number,p:any)=> s + (p.amountPaise>0? p.amountPaise:0),0)/100;
  const ret = Math.max(0, customerPaid - (order ? order.total : subTotal));
  const tabs = activeOrderTypes?.length ? activeOrderTypes : cfg.order_types.filter((o:any)=>o.active);
  const isDine = orderType==='dine_in';
  const nowLocal = new Date().toISOString().slice(0,16);
  const shouldShowField = (key: string) => {
    const f = cfg.customer_fields?.[key];
    if (!f) return true;
    if (!f.visible) return false;
    if (!f.for || f.for.length===0) return true;
    return f.for.includes(orderType);
  };
  const billRows = (cfg.bill_rows || []).filter((b:any)=>b.visible);
  const rowValues: Record<string, number> = {
    subtotal: subTotal,
    discount,
    container: containerCharge,
    tax,
    round_off: roundOff,
    customer_paid: customerPaid,
    return_to_customer: ret,
    tip,
  };
  return (
    <div className="flex flex-col h-full">
      {/* Tabs - config-driven, fallback to hardcoded */}
      <div role="tablist" aria-label="Order type" className="grid border-b border-[var(--pos-border)] text-xs font-bold" style={{gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))`}}>
        {tabs.map((ot:any)=> (
          <button key={ot.key} type="button" role="tab" aria-selected={orderType===ot.key} onClick={()=>onOrderType(ot.key)} className={`h-11 min-h-[44px] px-1 truncate ${orderType===ot.key?'bg-[var(--pos-panel)] border-b-2 border-[var(--pos-accent)] text-[var(--pos-accent)]':'text-zinc-500'}`}>{ot.label}</button>
        ))}
      </div>
      {/* Table/Guest + Customer - config-driven visibility */}
      {(isDine || shouldShowField('phone') || shouldShowField('name') || shouldShowField('address') || shouldShowField('locality')) && (
        <div className="p-3 space-y-3 border-b border-[var(--pos-border)] bg-[var(--pos-panel)]">
          {isDine && (
            <div className="space-y-2">
              <div className="flex gap-2 items-center">
                <label htmlFor="pos-table" className="text-xs font-bold w-16 shrink-0">Table No</label>
                <div className="flex-1 flex gap-1 min-w-0">
                  <button type="button" aria-label="Decrease table number" onClick={()=> setTableId(Math.max(0, tableId-1))} disabled={tableId<=0} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border bg-white disabled:opacity-50 grid place-items-center shrink-0">−</button>
                  <input id="pos-table" type="number" inputMode="numeric" min={0} value={tableId || ''} onChange={e=> setTableId(Math.max(0, parseInt(e.target.value)||0))} placeholder="-" className="flex-1 min-w-0 h-11 min-h-[44px] rounded border bg-white text-center text-sm" />
                  <button type="button" aria-label="Increase table number" onClick={()=> setTableId(Math.min(99, tableId+1))} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border bg-white grid place-items-center shrink-0">+</button>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <label htmlFor="pos-guests" className="text-xs font-bold w-16 shrink-0">Guests</label>
                <div className="flex-1 flex gap-1 items-center min-w-0">
                  <button type="button" aria-label="Decrease guests" disabled={(guestCount??1)<=1} onClick={()=> setGuestCount(Math.max(1, (guestCount??1)-1))} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border bg-white grid place-items-center disabled:opacity-50 shrink-0">−</button>
                  <input id="pos-guests" type="number" min={1} max={50} value={guestCount} onChange={e=> setGuestCount(Math.max(1, Math.min(50, parseInt(e.target.value)||1)))} className="w-14 h-11 min-h-[44px] rounded border bg-white text-center text-sm shrink-0" />
                  <button type="button" aria-label="Increase guests" disabled={(guestCount??1)>=50} onClick={()=> setGuestCount(Math.min(50, (guestCount??1)+1))} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border bg-white grid place-items-center disabled:opacity-50 shrink-0">+</button>
                </div>
              </div>
            </div>
          )}
          <fieldset className="grid grid-cols-[70px_1fr] gap-2 items-center">
            <legend className="sr-only">Customer details</legend>
            {shouldShowField('phone') && (<><label htmlFor="pos-phone" className="text-xs font-bold">Mobile:{cfg.customer_fields?.phone?.required ? ' *' : ''}</label><input id="pos-phone" type="tel" inputMode="numeric" autoComplete="tel" maxLength={15} required={!!cfg.customer_fields?.phone?.required} aria-required={!!cfg.customer_fields?.phone?.required} value={customer.phone} onChange={e=> setCustomer({...customer,phone:e.target.value.replace(/[^0-9+\- ]/g,'')})} placeholder="Mobile No." className="h-11 min-h-[44px] rounded border px-2 text-sm" /></>)}
            {shouldShowField('name') && (<><label htmlFor="pos-name" className="text-xs font-bold">Name:{cfg.customer_fields?.name?.required ? ' *' : ''}</label><input id="pos-name" type="text" autoComplete="name" value={customer.name} onChange={e=> setCustomer({...customer,name:e.target.value})} placeholder="Name" required={!!cfg.customer_fields?.name?.required} aria-required={!!cfg.customer_fields?.name?.required} className="h-11 min-h-[44px] rounded border px-2 text-sm" /></>)}
            {shouldShowField('address') && (<><label htmlFor="pos-addr" className="text-xs font-bold">Add:{cfg.customer_fields?.address?.required ? ' *' : ''}</label><input id="pos-addr" type="text" autoComplete="street-address" value={customer.address} onChange={e=> setCustomer({...customer,address:e.target.value})} placeholder="Address" required={!!cfg.customer_fields?.address?.required} aria-required={!!cfg.customer_fields?.address?.required} className="h-11 min-h-[44px] rounded border px-2 text-sm" /></>)}
            {shouldShowField('locality') && (<><label htmlFor="pos-locality" className="text-xs font-bold">Locality:{cfg.customer_fields?.locality?.required ? ' *' : ''}</label><input id="pos-locality" type="text" value={customer.locality} onChange={e=> setCustomer({...customer,locality:e.target.value})} placeholder="Locality" required={!!cfg.customer_fields?.locality?.required} aria-required={!!cfg.customer_fields?.locality?.required} className="h-11 min-h-[44px] rounded border px-2 text-sm" /></>)}
          </fieldset>
        </div>
      )}
      {/* ITEMS header */}
      <div className="grid grid-cols-[1fr_50px_50px_70px] gap-1 px-2 py-1.5 bg-zinc-900 text-white text-[10px] font-bold tracking-wider">
        <span>ITEMS</span><span className="text-center">CHECK</span><span className="text-center">QTY.</span><span className="text-right">PRICE</span>
      </div>
      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-white min-h-[200px]">
        {order ? (
          (order.items ?? []).length ? (order.items ?? []).map((it:any)=>(
            <div key={it.id} className="flex justify-between text-sm border-b py-1.5"><span>{it.quantity}× {it.name} {it.size?`(${it.size})`:''}{it.addons_snapshot && JSON.parse(it.addons_snapshot||'[]').length? ` +${JSON.parse(it.addons_snapshot).length} addon`:''}</span><span>₹{it.line_total ?? it.subtotal}</span></div>
          )) : <div className="grid place-items-center py-12 text-center" role="status"><div className="text-sm font-bold">No Item Selected</div><div className="text-xs text-zinc-500">Please Select Item from Left Menu</div></div>
        ) : cart.length ? cart.map((l:any)=>(
          <div key={l.key} className="flex items-center gap-1 border rounded p-1.5 text-sm min-w-0">
            <span className="flex-1 min-w-0 truncate" title={`${l.name}${l.addons?.length ? ` + ${l.addons.map((a:any)=>a.name).join(', ')}` : ''}`}>{l.name} {l.size?`(${l.size})`:''}{l.addons?.length? ` +${l.addons.length}`:''}</span>
            <button type="button" aria-label={`Decrease ${l.name}`} onClick={()=>onQty(l.key,-1)} disabled={l.quantity<=1} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border grid place-items-center disabled:opacity-50 shrink-0">−</button>
            <span className="w-6 text-center shrink-0" aria-live="polite">{l.quantity}</span>
            <button type="button" aria-label={`Increase ${l.name}`} onClick={()=>onQty(l.key,1)} disabled={l.quantity>=20} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border bg-zinc-900 text-white disabled:opacity-50 grid place-items-center shrink-0">+</button>
            <span className="w-14 shrink-0 text-right text-[11px] tabular-nums truncate">₹{((l.unitPaise??0)*l.quantity/100).toFixed(2)}</span>
            <button type="button" aria-label={`Remove ${l.name}`} onClick={()=> onRequestRemove(l.key, l.name)} className="w-11 h-11 min-h-[44px] min-w-[44px] text-red-600 grid place-items-center text-lg shrink-0">×</button>
          </div>
        )) : (
          <div className="grid place-items-center py-12 text-center" role="status">
            <div className="w-12 h-12 rounded-full border flex items-center justify-center mb-2" aria-hidden>🍽️</div>
            <div className="text-sm font-bold">No Item Selected</div>
            <div className="text-xs text-zinc-500">Please Select Item from Left Menu</div>
          </div>
        )}
        {cart.length>0 && <button type="button" onClick={()=> onRequestClear(cart.length)} className="w-full mt-2 h-11 min-h-[44px] rounded border text-xs text-zinc-600 hover:bg-zinc-50">Clear cart</button>}
      </div>
      {/* Bill breakdown - config-driven via pos_config bill_rows */}
      <div className="border-t">
        {billRows.map((br:any)=> {
          const val = rowValues[br.key] ?? 0;
          const isDiscount = br.key === 'discount';
          // Hide tip row if charges.tip_enabled false (presentation) — but keep safe fallback if bill_rows says visible
          if (br.key === 'tip' && cfg.charges && cfg.charges.tip_enabled === false) return null;
          return (
            <div key={br.key} className="grid grid-cols-[1fr_80px] gap-2 px-3 py-1.5 text-xs odd:bg-zinc-100 even:bg-white border-b">
              <span className="font-medium">{br.label} {br.key==='discount' && <span className="text-[10px] text-zinc-500"> (after order)</span>}</span>
              <span className="text-right tabular-nums">{isDiscount ? `(${currency}${Number(val).toFixed(2)})` : `${currency}${Number(val).toFixed(2)}`}</span>
            </div>
          );
        })}
        <div className="grid grid-cols-2 gap-2 p-2 bg-white">
          {billRows.find((b:any)=>b.key==='container') && (
            <label htmlFor="pos-container" className="flex items-center gap-1 text-xs">{billRows.find((b:any)=>b.key==='container')?.label || 'Container'} <input id="pos-container" type="number" inputMode="numeric" min={0} value={containerCharge} onChange={e=>setContainerCharge(Math.max(0, parseFloat(e.target.value)||0))} className="ml-auto w-16 h-11 min-h-[44px] rounded border px-1 text-right" /></label>
          )}
          {cfg.charges?.tip_enabled !== false && billRows.find((b:any)=>b.key==='tip') && (
            <label htmlFor="pos-tip" className="flex items-center gap-1 text-xs">{billRows.find((b:any)=>b.key==='tip')?.label || 'Tip'} <input id="pos-tip" type="number" inputMode="numeric" min={0} value={tip} onChange={e=>setTip(Math.max(0, parseFloat(e.target.value)||0))} className="ml-auto w-16 h-11 min-h-[44px] rounded border px-1 text-right" /></label>
          )}
        </div>
      </div>
      {/* Bottom bar - feature-flag driven, no business rules */}
      <div className="p-2 border-t bg-white space-y-2">
        <div className="flex gap-2 flex-wrap items-center">
          {cfg.features?.advance_order !== false && (
            <button type="button" onClick={()=> setIsAdvance((v: boolean)=>!v)} aria-pressed={isAdvance} aria-expanded={isAdvance} aria-controls="advance-at" className={`px-3 py-1.5 rounded text-xs min-h-[44px] ${isAdvance?'bg-blue-100 border border-blue-300': 'bg-zinc-100 border'}`}>Advance Order</button>
          )}
          {cfg.features?.complimentary !== false && (
            <label className="flex items-center gap-1 text-xs ml-auto"><input type="checkbox" checked={isComplimentary} onChange={e=>setIsComplimentary(e.target.checked)} />Complimentary</label>
          )}
          <span className="text-sm font-bold tabular-nums">Total {isComplimentary ? `${currency}0.00` : `${currency}${(total + containerCharge + tip).toFixed(2)}`}</span>
        </div>
        {isAdvance && cfg.features?.advance_order !== false && (
          <div>
            <label htmlFor="advance-at" className="text-xs font-bold">Advance time</label>
            <input id="advance-at" type="datetime-local" value={advanceAt} min={nowLocal} onChange={e=>setAdvanceAt(e.target.value)} aria-label="Advance order time" className="w-full h-11 min-h-[44px] rounded border px-2 text-xs mt-1" />
          </div>
        )}
        {fatal && <div role="alert" aria-live="assertive" aria-atomic="true" className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{fatal} <button type="button" onClick={()=>setFatal(null)} className="underline">Dismiss</button></div>}
        {notice && <div role="status" aria-live="polite" aria-atomic="true" className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">{notice}</div>}
        {orderId==null ? (
          <button type="button" disabled={!canCreate || creating} onClick={onCreate} aria-busy={creating} className="w-full h-11 min-h-[44px] rounded bg-[var(--pos-accent)] text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {creating ? 'Creating order…' : 'Save'}
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {cfg.features?.hold !== false && <button type="button" onClick={onHold} className="h-11 min-h-[44px] rounded bg-amber-600 text-white text-xs font-bold">Hold</button>}
            <button type="button" onClick={onCancel} className="h-11 min-h-[44px] rounded border text-xs font-bold">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
