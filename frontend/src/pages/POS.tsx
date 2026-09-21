import { useCallback, useEffect, useMemo, useState } from 'react';
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
import ReceiptModal from '../components/pos/ReceiptModal';
import type { CartLine, HeldOrder, RecordedPayment } from '../components/pos/types';

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
  const queryClient = useQueryClient();

  // Customer / extra billing state
  const [customer, setCustomer] = useState<CustomerInfo>({ phone: '', name: '', address: '', locality: '' });
  const [containerCharge, setContainerCharge] = useState(0);
  const [tip, setTip] = useState(0);
  const [isComplimentary, setIsComplimentary] = useState(false);
  const [isAdvance, setIsAdvance] = useState(false);
  const [advanceAt, setAdvanceAt] = useState('');
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
    setCart([]); setOrderType('dine_in'); setTableId(0); setOrderId(null); setPayments([]); setDuePaise(null);
    setCustomer({ phone: '', name: '', address: '', locality: '' }); setContainerCharge(0); setTip(0); setIsComplimentary(false); setIsAdvance(false); setAdvanceAt(''); setNotice(null);
    try { localStorage.removeItem(`ocp_pos_order:${outletId ?? 'default'}`); } catch {}
  }, [outletId]);

  const openOrder = useCallback((id: number, totalRupees: number) => {
    setOrderId(id); setPayments([]); setDuePaise(toPaise(totalRupees)); queryClient.invalidateQueries({ queryKey: ['pos-tables'] });
  }, [queryClient]);

  const addLine = useCallback((line: Omit<CartLine, 'key'> & { addons?: { name: string; price: number }[] }) => {
    // addon-aware key: size|crust|sorted addons
    const addonKey = (line.addons ?? []).map(a => a.name).sort().join(',');
    const key = `${line.menuItemID}|${line.size}|${line.crust}|${addonKey}`;
    setCart((prev) => {
      const found = prev.find((l) => l.key === key);
      if (found) return prev.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, l.quantity + line.quantity) } : l));
      return [...prev, { ...line, key, addons: line.addons } as CartLine];
    });
  }, []);

  const createOrder = async () => {
    if (cart.length === 0) return;
    setCreating(true); setFatal(null);
    try {
      const created = await posApi.createOrder(
        cart.map((l) => ({ menuItemID: l.menuItemID, size: l.size, crust: l.crust, quantity: l.quantity })),
        orderType === 'dine_in' ? tableId : 0,
        orderType,
      );
      setCart([]); setTableId(0); openOrder(created.id, created.total);
    } catch (e) {
      const { status, message } = posErrorMessage(e);
      setFatal(status === 403 ? 'Your role cannot create orders.' : message);
    } finally { setCreating(false); }
  };

  const header = useMemo(() => (
    <PosHeader
      outletId={outletId}
      onOutlet={(id) => { setOutletId(id); resetSale(); queryClient.invalidateQueries({ queryKey: ['pos-menu'] }); queryClient.invalidateQueries({ queryKey: ['pos-tables'] }); }}
      operator={operatorName}
      role={role}
      heldCount={held.length}
      onNewSale={resetSale}
      onHeld={() => setHoldOpen(true)}
      onLock={() => setAuthed(false)}
      online={online}
    />
  ), [outletId, operatorName, role, held.length, queryClient]);

  const orderQuery = useQuery({
    queryKey: ['pos-order', orderId],
    queryFn: () => posApi.getOrder(orderId as number),
    enabled: authed && orderId != null,
    staleTime: 5 * 1000,
    retry: 1,
  });
  const order: PosOrder | undefined = orderQuery.data;

  if (!authed) return <PosAuthGate onAuthed={() => setAuthed(true)} />;
  return (
    <div className="pos min-h-screen bg-[var(--pos-panel)] flex flex-col">
      {header}
      <main className="mx-auto w-full max-w-[1600px] flex-1 p-2 gap-2 grid xl:grid-cols-[220px_minmax(0,1fr)_400px] items-start">
        {/* LEFT - Categories vertical */}
        <div className="hidden xl:flex xl:flex-col rounded-xl border border-[var(--pos-border)] bg-white overflow-hidden max-h-[calc(100vh-72px)] sticky top-[66px]">
          <div className="h-9 px-3 flex items-center bg-zinc-900 text-white text-xs font-bold tracking-wider">CATEGORIES</div>
          <div className="flex-1 overflow-y-auto">
            <CategoryColumn selected={selectedCategory} onSelect={setSelectedCategory} />
          </div>
        </div>
        {/* MIDDLE - Menu grid */}
        <div className="rounded-xl border border-[var(--pos-border)] bg-white p-3 flex flex-col min-h-0 max-h-[calc(100vh-72px)] overflow-hidden">
          <MenuPanel onAdd={addLine} outletId={outletId} cart={cart} onQty={(k: string,d: number)=> setCart((p: CartLine[])=>p.map(l=>l.key===k?{...l,quantity:l.quantity+d}:l).filter(l=>l.quantity>0))} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
        </div>
        {/* RIGHT - Bill */}
        <div className="rounded-xl border border-[var(--pos-border)] bg-white overflow-hidden flex flex-col max-h-[calc(100vh-72px)] sticky top-[66px]">
          <RightBill
            orderType={orderType} onOrderType={(t: PosOrderType)=>{setOrderType(t); if(t!=='dine_in') setTableId(0);}}
            tableId={tableId} setTableId={setTableId} outletId={outletId}
            customer={customer} setCustomer={setCustomer}
            cart={cart} order={order} orderId={orderId}
            containerCharge={containerCharge} setContainerCharge={setContainerCharge}
            tip={tip} setTip={setTip}
            isComplimentary={isComplimentary} setIsComplimentary={setIsComplimentary}
            isAdvance={isAdvance} setIsAdvance={setIsAdvance} advanceAt={advanceAt} setAdvanceAt={setAdvanceAt}
            onQty={(k: string,d: number)=> setCart((p: CartLine[])=>p.map(l=>l.key===k?{...l,quantity:l.quantity+d}:l).filter(l=>l.quantity>0))}
            onRemove={(k: string)=> setCart((p: CartLine[])=>p.filter(l=>l.key!==k))}
            onClear={()=>setCart([])}
            onCreate={createOrder} creating={creating} canCreate={cart.length>0}
            // checkout props
            payments={payments} duePaise={duePaise ?? (order ? toPaise(order.total) : 0)}
            onPaid={(p: RecordedPayment,due: number)=>{setPayments((prev: RecordedPayment[])=>[...prev,p]); setDuePaise(due);}}
            onCompleted={()=>{queryClient.invalidateQueries({queryKey:['pos-order',orderId]}); setReceiptOpen(true);}}
            onHold={async()=>{ if(orderId==null) return; setHolding(true); try{await posApi.holdOrder(orderId); const d=await posApi.getOrder(orderId); setHeld((prev: HeldOrder[])=>[{id:d.id,orderNumber:d.order_number,total:d.total,at:new Date().toISOString()},...prev].slice(0,20)); resetSale(); setNotice(`Order #${d.order_number} held.`);}catch(e){setNotice(posErrorMessage(e as Error).message);}finally{setHolding(false);}}}
            onCancel={async()=>{ if(orderId==null) return; if(!confirm('Cancel this order?')) return; setCancelling(true); try{await posApi.cancelOrder(orderId); resetSale(); setNotice('Order cancelled.');}catch(e){setNotice(posErrorMessage(e as Error).message);}finally{setCancelling(false);}}}
            onReceipt={()=>setReceiptOpen(true)}
            canPay={canPay} canDiscount={canDiscount}
            fatal={fatal} setFatal={setFatal} role={role} notice={notice}
          />
        </div>
      </main>
      <HoldDrawer open={holdOpen} onClose={()=>setHoldOpen(false)} held={held} orderTypes={{}} onResume={async(h: HeldOrder)=>{ setResumingId(h.id); try{await posApi.resumeOrder(h.id); setHeld((prev: HeldOrder[])=>prev.filter(x=>x.id!==h.id)); setHoldOpen(false); const r=await posApi.getOrder(h.id); openOrder(r.id,r.total); setNotice(`Order #${r.order_number} resumed.`);}catch(e){setNotice(posErrorMessage(e as Error).message);}finally{setResumingId(null);}}} resumingId={resumingId} />
      <ReceiptModal open={receiptOpen} onClose={()=>setReceiptOpen(false)} order={order ?? null} payments={payments} canRefund={role==='owner'||role==='manager'} outletName='Current outlet' onNewSale={resetSale} />
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
      <button onClick={() => onSelect('all')} className={`w-full text-left px-2 py-2 rounded text-xs font-bold flex justify-between items-center ${selected==='all' ? 'bg-[var(--pos-accent)] text-white' : 'hover:bg-zinc-50 text-zinc-700'}`}>
        <span>All Items</span><span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded">{cats.length}</span>
      </button>
      {cats.map((c: { id: number; name: string; isDeliverable?: boolean }) => (
        <button
          key={c.id}
          onClick={() => onSelect(String(c.id))}
          className={`w-full text-left px-2 py-2 rounded text-xs flex justify-between items-center border-b border-zinc-100 last:border-0 ${selected===String(c.id) ? 'bg-zinc-900 text-white border-zinc-900' : 'hover:bg-zinc-50 text-zinc-700'}`}
        >
          <span className="truncate">{c.name} {c.isDeliverable === false ? '' : '[D]'}</span>
          <span className={`w-1.5 h-6 rounded ${selected===String(c.id) ? 'bg-white' : 'bg-emerald-500'}`} />
        </button>
      ))}
      {catQuery.isLoading && <p className="px-2 py-2 text-xs text-zinc-400">Loading…</p>}
    </div>
  );
}

function RightBill(props: any) {
  const { orderType, onOrderType, tableId, setTableId, outletId, customer, setCustomer, cart, order, orderId, containerCharge, setContainerCharge, tip, setTip, isComplimentary, setIsComplimentary, isAdvance, setIsAdvance, advanceAt, setAdvanceAt, onQty, onRemove, onClear, onCreate, creating, canCreate, payments, duePaise, onPaid, onCompleted, onHold, onCancel, onReceipt, canPay, canDiscount, fatal, setFatal, role, notice } = props;
  const subTotal = order ? order.subtotal : cart.reduce((s:number,l:any)=> s + (l.unitPaise ?? 0)*l.quantity,0)/100;
  const discount = order?.discount ?? 0;
  const tax = order?.tax_amount ?? 0;
  const total = order ? order.total : subTotal;
  const roundOff = 0; // server computed
  const customerPaid = payments.reduce((s:number,p:any)=> s + (p.amountPaise>0? p.amountPaise:0),0)/100;
  const ret = Math.max(0, customerPaid - (order ? order.total : subTotal));
  const isDelivery = orderType==='delivery';
  const isDine = orderType==='dine_in';
  const isTakeaway = orderType==='takeaway';
  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="grid grid-cols-3 border-b border-[var(--pos-border)] text-xs font-bold">
        <button onClick={()=>onOrderType('dine_in')} className={`h-10 ${isDine?'bg-[var(--pos-panel)] border-b-2 border-[var(--pos-accent)] text-[var(--pos-accent)]':'text-zinc-500'}`}>Dine In</button>
        <button onClick={()=>onOrderType('delivery')} className={`h-10 ${isDelivery?'bg-[var(--pos-panel)] border-b-2 border-[var(--pos-accent)] text-[var(--pos-accent)]':'text-zinc-500'}`}>Delivery</button>
        <button onClick={()=>onOrderType('takeaway')} className={`h-10 ${isTakeaway?'bg-[var(--pos-panel)] border-b-2 border-[var(--pos-accent)] text-[var(--pos-accent)]':'text-zinc-500'}`}>TAKE AWAY</button>
      </div>
      {/* Table/Guest + Customer */}
      {(isDine || isDelivery) && (
        <div className="p-3 space-y-2 border-b border-[var(--pos-border)] bg-[var(--pos-panel)]">
          {isDine && (
            <div className="flex gap-2 items-center">
              <span className="text-xs font-bold w-16">Table No</span>
              <div className="flex-1 flex gap-1">
                <button onClick={()=> setTableId(Math.max(0, tableId-1))} className="w-8 h-8 rounded border bg-white">−</button>
                <input value={tableId || ''} onChange={e=> setTableId(parseInt(e.target.value)||0)} placeholder="-" className="flex-1 h-8 rounded border bg-white text-center text-sm" />
                <button onClick={()=> setTableId(tableId+1)} className="w-8 h-8 rounded border bg-white">+</button>
              </div>
              <span className="text-xs w-16">Guests 1</span>
            </div>
          )}
          <div className="grid grid-cols-[70px_1fr] gap-2 items-center">
            <span className="text-xs font-bold">Mobile:</span><input value={customer.phone} onChange={e=> setCustomer({...customer,phone:e.target.value})} placeholder="Mobile No." className="h-8 rounded border px-2 text-sm" />
            <span className="text-xs font-bold">Name:</span><input value={customer.name} onChange={e=> setCustomer({...customer,name:e.target.value})} placeholder="Name" className="h-8 rounded border px-2 text-sm" />
            <span className="text-xs font-bold">Add:</span><input value={customer.address} onChange={e=> setCustomer({...customer,address:e.target.value})} placeholder="Address" className="h-8 rounded border px-2 text-sm" />
            <span className="text-xs font-bold">Locality:</span><input value={customer.locality} onChange={e=> setCustomer({...customer,locality:e.target.value})} placeholder="Locality" className="h-8 rounded border px-2 text-sm" />
          </div>
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
            <div key={it.id} className="flex justify-between text-sm border-b py-1.5"><span>{it.quantity}× {it.name} {it.size?`(${it.size})`:''}</span><span>₹{it.line_total ?? it.subtotal}</span></div>
          )) : <div className="grid place-items-center py-12 text-center"><div className="text-sm font-bold">No Item Selected</div><div className="text-xs text-zinc-500">Please Select Item from Left Menu</div></div>
        ) : cart.length ? cart.map((l:any)=>(
          <div key={l.key} className="flex items-center gap-1 border rounded p-1.5 text-sm">
            <span className="flex-1 truncate">{l.name} {l.size?`(${l.size})`:''}</span>
            <button onClick={()=>onQty(l.key,-1)} className="w-7 h-7 rounded border">−</button>
            <span className="w-6 text-center">{l.quantity}</span>
            <button onClick={()=>onQty(l.key,1)} className="w-7 h-7 rounded border bg-zinc-900 text-white">+</button>
            <span className="w-16 text-right">₹{((l.unitPaise??0)*l.quantity/100).toFixed(2)}</span>
            <button onClick={()=>onRemove(l.key)} className="text-red-500 text-xs">×</button>
          </div>
        )) : (
          <div className="grid place-items-center py-12 text-center">
            <div className="w-12 h-12 rounded-full border flex items-center justify-center mb-2">🍽️</div>
            <div className="text-sm font-bold">No Item Selected</div>
            <div className="text-xs text-zinc-500">Please Select Item from Left Menu Item</div>
          </div>
        )}
      </div>
      {/* 8-row breakdown - always visible like TAKE AWAY */}
      <div className="border-t">
        {[
          ['Sub Total', subTotal],
          ['Discount', discount, true],
          ['Container Charge', containerCharge],
          ['Tax', tax],
          ['Round Off', roundOff],
          ['Customer Paid', customerPaid],
          ['Return to Customer', ret],
          ['Tip', tip],
        ].map(([label, val, isDiscount])=>(
          <div key={String(label)} className="grid grid-cols-[1fr_80px] gap-2 px-3 py-1.5 text-xs odd:bg-zinc-100 even:bg-white border-b">
            <span className="font-medium">{String(label)} {String(label)==='Discount' && <button onClick={()=> alert('Discount modal')} className="text-[10px] underline">More</button>}</span>
            <span className="text-right">{isDiscount ? `(${Number(val).toFixed(2)})` : Number(val).toFixed(2)}</span>
          </div>
        ))}
        {/* Editable Container/Tip */}
        <div className="grid grid-cols-2 gap-2 p-2 bg-white">
          <label className="flex items-center gap-1 text-xs">Container <input type="number" value={containerCharge} onChange={e=>setContainerCharge(parseFloat(e.target.value)||0)} className="ml-auto w-16 h-7 rounded border px-1 text-right" /></label>
          <label className="flex items-center gap-1 text-xs">Tip <input type="number" value={tip} onChange={e=>setTip(parseFloat(e.target.value)||0)} className="ml-auto w-16 h-7 rounded border px-1 text-right" /></label>
        </div>
      </div>
      {/* Bottom bar */}
      <div className="p-2 border-t bg-white space-y-2">
        <div className="flex gap-1 flex-wrap">
          <button className="px-3 py-1.5 rounded text-xs bg-amber-100">Bogo Offer</button>
          <button className="px-3 py-1.5 rounded text-xs bg-zinc-200">Split</button>
          <button onClick={()=> setIsAdvance((v: boolean)=>!v)} className={`px-3 py-1.5 rounded text-xs ${isAdvance?'bg-blue-100 border border-blue-300':''}`}>Advance Order</button>
          <label className="flex items-center gap-1 text-xs ml-auto"><input type="checkbox" checked={isComplimentary} onChange={e=>setIsComplimentary(e.target.checked)} />Complimentary</label>
          <span className="ml-auto text-sm font-bold">Total {isComplimentary ? 0 : (total + containerCharge + tip).toFixed(2)}</span>
        </div>
        {isAdvance && <input type="datetime-local" value={advanceAt} onChange={e=>setAdvanceAt(e.target.value)} className="w-full h-8 rounded border px-2 text-xs" />}
        {fatal && <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{fatal} <button onClick={()=>setFatal(null)} className="underline">Dismiss</button></div>}
        {notice && <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">{notice}</div>}
        {orderId==null ? (
          <button disabled={!canCreate || creating} onClick={onCreate} className="w-full h-10 rounded bg-[var(--pos-accent)] text-white font-bold disabled:opacity-50">Save</button>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            <button onClick={onHold} className="h-9 rounded bg-amber-600 text-white text-xs">Save</button>
            <button className="h-9 rounded bg-[var(--pos-accent)] text-white text-xs">Save & Print</button>
            <button className="h-9 rounded bg-[var(--pos-accent)] text-white text-xs">Save & EBil</button>
            <button className="h-9 rounded bg-zinc-700 text-white text-xs">KOT</button>
            <button className="h-9 rounded bg-zinc-700 text-white text-xs">KOT & Print</button>
            <button className="h-9 rounded border text-xs">Hold</button>
          </div>
        )}
        {/* Cash/Card/Due bar */}
        {order && (
          <div className="grid grid-cols-5 gap-1 text-xs">
            {['Cash','Card','Due','Other','More'].map(k=>(
              <button key={k} className="h-8 rounded border bg-white">{k}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
