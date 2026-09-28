import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import HoldDrawer from '../components/pos/HoldDrawer';
import { usePosConfig } from '../hooks/usePosConfig';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import CategoryColumn from '../components/pos/CategoryColumn';
import RightBill from '../components/pos/RightBill';
import { useToast } from '../context/ToastContext';
import ReceiptModal from '../components/pos/ReceiptModal';
import type { CartLine, CustomerInfo, HeldOrder, RecordedPayment } from '../components/pos/types';

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
  const toast = useToast();
  // Last-added cart line: drives toast-adjacent highlight + scroll-into-view.
  const [lastAddedKey, setLastAddedKey] = useState<string | null>(null);
  const [pulseKey, setPulseKey] = useState<string | null>(null);
  const lineRefs = useRef(new Map<string, HTMLDivElement>());
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
  const canRefund = ['owner', 'manager'].includes(role);
const canPay = ['owner', 'manager'].includes(role);
const canDiscount = ['owner', 'manager'].includes(role);
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
    // Confirmation feedback: toast + highlight + scroll. No cart/pricing/order change.
    setLastAddedKey(key);
    setPulseKey(key);
    toast.push({
      type: 'success',
      title: `${Math.min(20, line.quantity)}× ${line.name} added`,
      action: {
        label: 'View bill',
        onClick: () => document.getElementById('pos-bill')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      },
    });
  }, [toast]);

  // Scroll the newly added bill line into view inside the bill list.
  useEffect(() => {
    if (lastAddedKey == null) return;
    const t = requestAnimationFrame(() => {
      lineRefs.current.get(lastAddedKey)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => cancelAnimationFrame(t);
  }, [cart, lastAddedKey]);

  // Clear the highlight pulse shortly after render.
  useEffect(() => {
    if (pulseKey == null) return;
    const t = setTimeout(() => setPulseKey(null), 1600);
    return () => clearTimeout(t);
  }, [pulseKey]);

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
        <div id="pos-bill" className="@container rounded-xl border border-[var(--pos-border)] bg-white overflow-hidden flex flex-col min-h-0 md:col-span-2 lg:col-span-1 lg:h-[calc(100dvh-72px)] lg:sticky lg:top-[66px] scroll-mt-[72px]">
          <RightBill
            config={config}
            activeOrderTypes={activeOrderTypes}
            orderType={orderType} onOrderType={(t: PosOrderType)=>{setOrderType(t); if(t!=='dine_in') setTableId(0);}}
            tableId={tableId} setTableId={setTableId} guestCount={guestCount} setGuestCount={setGuestCount}
            customer={customer} setCustomer={setCustomer}
            cart={cart} order={order} orderId={orderId}
            containerCharge={containerCharge} setContainerCharge={setContainerCharge}
            tip={tip} setTip={setTip}
            isComplimentary={isComplimentary} setIsComplimentary={setIsComplimentary}
            isAdvance={isAdvance} setIsAdvance={setIsAdvance} advanceAt={advanceAt} setAdvanceAt={setAdvanceAt}
            onQty={(k: string,d: number)=> setCart((p: CartLine[])=>p.map(l=>l.key===k?{...l,quantity:Math.min(20, Math.max(1, l.quantity+d))}:l).filter(l=>l.quantity>0))}
            onCreate={createOrder} creating={creating} canCreate={cart.length>0}
            // checkout props — live CheckoutPanel once the order exists
            payments={payments} duePaise={duePaise ?? (order ? toPaise(order.total) : 0)}
            onPaid={(p: RecordedPayment,due: number)=>{setPayments((prev: RecordedPayment[])=>[...prev,p]); setDuePaise(due);}}
            onCompleted={()=>{queryClient.invalidateQueries({queryKey:['pos-order',orderId]}); setReceiptOpen(true);}}
            onHold={async()=>{ if(orderId==null) return; setHolding(true); try{await posApi.holdOrder(orderId); const d=await posApi.getOrder(orderId); setHeld((prev: HeldOrder[])=>[{id:d.id,orderNumber:d.order_number,total:d.total,at:new Date().toISOString()},...prev].slice(0,20)); resetSale(); setNotice(`Order #${d.order_number} held.`);}catch(e){setNotice(posErrorMessage(e as Error).message);}finally{setHolding(false);}}}
            onCancel={async()=>{ if(orderId==null) return; setPendingConfirm({ kind: 'cancel' }); }}
            onModify={()=>{ setNotice('To change items, cancel this order and start a new sale.'); }}
            onReceipt={()=>setReceiptOpen(true)}
            onSavePrint={()=>{ setReceiptOpen(true); setTimeout(()=>window.print(), 450); }}
            onRequestRemove={(key: string, name: string)=> setPendingConfirm({ kind: 'remove', key, name })}
            onRequestClear={(count: number)=> setPendingConfirm({ kind: 'clear', count })}
            canPay={canPay} canDiscount={canDiscount}
            lineRefs={lineRefs} pulseKey={pulseKey}
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
