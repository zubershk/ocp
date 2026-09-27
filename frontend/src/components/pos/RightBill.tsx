import type React from 'react';
import Input from '../ui/Input';
import CheckoutPanel from './CheckoutPanel';
import type { POSConfig } from '../../hooks/usePosConfig';
import type { PosOrder, PosOrderType } from '../../services/posService';
import type { CartLine, CustomerInfo, RecordedPayment } from './types';

export interface RightBillProps {
  config: POSConfig;
  activeOrderTypes: POSConfig['order_types'];
  orderType: PosOrderType;
  onOrderType: (t: PosOrderType) => void;
  tableId: number;
  setTableId: (n: number) => void;
  guestCount: number;
  setGuestCount: (n: number) => void;
  customer: CustomerInfo;
  setCustomer: (c: CustomerInfo) => void;
  cart: CartLine[];
  order: PosOrder | undefined;
  orderId: number | null;
  containerCharge: number;
  setContainerCharge: (n: number) => void;
  tip: number;
  setTip: (n: number) => void;
  isComplimentary: boolean;
  setIsComplimentary: (b: boolean) => void;
  isAdvance: boolean;
  setIsAdvance: (b: boolean | ((prev: boolean) => boolean)) => void;
  advanceAt: string;
  setAdvanceAt: (s: string) => void;
  onQty: (key: string, delta: number) => void;
  onCreate: () => void;
  creating: boolean;
  canCreate: boolean;
  payments: RecordedPayment[];
  duePaise: number | null;
  onPaid: (p: RecordedPayment, duePaise: number) => void;
  onCompleted: () => void;
  onHold: () => void;
  onCancel: () => void;
  onModify: () => void;
  onReceipt: () => void;
  canPay: boolean;
  canDiscount: boolean;
  lineRefs: React.RefObject<Map<string, HTMLDivElement>>;
  pulseKey: string | null;
  onRequestRemove: (key: string, name: string) => void;
  onRequestClear: (count: number) => void;
  fatal: string | null;
  setFatal: (s: string | null) => void;
  notice: string | null;
}

function OrderTypeTabs({ tabs, orderType, onOrderType }: {
  tabs: POSConfig['order_types'];
  orderType: PosOrderType;
  onOrderType: (t: PosOrderType) => void;
}) {
  return (
    <div role="tablist" aria-label="Order type" className="grid border-b border-[var(--pos-border)] text-xs font-bold" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}>
      {tabs.map((ot) => (
        <button key={ot.key} type="button" role="tab" aria-selected={orderType === ot.key} onClick={() => onOrderType(ot.key as PosOrderType)} className={`h-11 min-h-[44px] px-1 truncate ${orderType === ot.key ? 'bg-[var(--pos-panel)] border-b-2 border-[var(--pos-accent)] text-[var(--pos-accent)]' : 'text-zinc-500'}`}>{ot.label}</button>
      ))}
    </div>
  );
}

function CustomerSection({ cfg, orderType, isDine, tableId, setTableId, guestCount, setGuestCount, customer, setCustomer }: {
  cfg: POSConfig;
  orderType: PosOrderType;
  isDine: boolean;
  tableId: number;
  setTableId: (n: number) => void;
  guestCount: number;
  setGuestCount: (n: number) => void;
  customer: CustomerInfo;
  setCustomer: (c: CustomerInfo) => void;
}) {
  return (
    <div className="p-3 space-y-3 border-b border-[var(--pos-border)] bg-[var(--pos-panel)]">
      {isDine && (
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <label htmlFor="pos-table" className="text-xs font-bold w-16 shrink-0">Table No</label>
            <div className="flex-1 flex gap-1 min-w-0">
              <button type="button" aria-label="Decrease table number" onClick={() => setTableId(Math.max(0, tableId - 1))} disabled={tableId <= 0} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border bg-white disabled:opacity-50 grid place-items-center shrink-0">−</button>
              <input id="pos-table" type="number" inputMode="numeric" min={0} value={tableId || ''} onChange={e => setTableId(Math.max(0, parseInt(e.target.value) || 0))} placeholder="-" className="flex-1 min-w-0 h-11 min-h-[44px] rounded border bg-white text-center text-sm focus:outline-none focus:border-[var(--pos-accent)]" />
              <button type="button" aria-label="Increase table number" onClick={() => setTableId(Math.min(99, tableId + 1))} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border bg-white grid place-items-center shrink-0">+</button>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <label htmlFor="pos-guests" className="text-xs font-bold w-16 shrink-0">Guests</label>
            <div className="flex-1 flex gap-1 items-center min-w-0">
              <button type="button" aria-label="Decrease guests" disabled={(guestCount ?? 1) <= 1} onClick={() => setGuestCount(Math.max(1, (guestCount ?? 1) - 1))} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border bg-white grid place-items-center disabled:opacity-50 shrink-0">−</button>
              <input id="pos-guests" type="number" min={1} max={50} value={guestCount} onChange={e => setGuestCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))} className="w-14 h-11 min-h-[44px] rounded border bg-white text-center text-sm shrink-0 focus:outline-none focus:border-[var(--pos-accent)]" />
              <button type="button" aria-label="Increase guests" disabled={(guestCount ?? 1) >= 50} onClick={() => setGuestCount(Math.min(50, (guestCount ?? 1) + 1))} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border bg-white grid place-items-center disabled:opacity-50 shrink-0">+</button>
            </div>
          </div>
        </div>
      )}
      <fieldset className="space-y-2">
        <legend className="sr-only">Customer details</legend>
        {shouldShowField(cfg, orderType, 'phone') && (<Input id="pos-phone" label={`Mobile${cfg.customer_fields?.phone?.required ? ' *' : ''}`} type="tel" inputMode="numeric" autoComplete="tel" maxLength={15} required={!!cfg.customer_fields?.phone?.required} aria-required={!!cfg.customer_fields?.phone?.required} value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value.replace(/[^0-9+\- ]/g, '') })} placeholder="Mobile No." className="h-11 min-h-[44px]" />)}
        {shouldShowField(cfg, orderType, 'name') && (<Input id="pos-name" label={`Name${cfg.customer_fields?.name?.required ? ' *' : ''}`} type="text" autoComplete="name" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} placeholder="Name" required={!!cfg.customer_fields?.name?.required} aria-required={!!cfg.customer_fields?.name?.required} className="h-11 min-h-[44px]" />)}
        {shouldShowField(cfg, orderType, 'address') && (<Input id="pos-addr" label={`Address${cfg.customer_fields?.address?.required ? ' *' : ''}`} type="text" autoComplete="street-address" value={customer.address} onChange={e => setCustomer({ ...customer, address: e.target.value })} placeholder="Address" required={!!cfg.customer_fields?.address?.required} aria-required={!!cfg.customer_fields?.address?.required} className="h-11 min-h-[44px]" />)}
        {shouldShowField(cfg, orderType, 'locality') && (<Input id="pos-locality" label={`Locality${cfg.customer_fields?.locality?.required ? ' *' : ''}`} type="text" value={customer.locality} onChange={e => setCustomer({ ...customer, locality: e.target.value })} placeholder="Locality" required={!!cfg.customer_fields?.locality?.required} aria-required={!!cfg.customer_fields?.locality?.required} className="h-11 min-h-[44px]" />)}
      </fieldset>
    </div>
  );
}

function shouldShowField(cfg: POSConfig, orderType: PosOrderType, key: string): boolean {
  const f = cfg.customer_fields?.[key];
  if (!f) return true;
  if (!f.visible) return false;
  if (!f.for || f.for.length === 0) return true;
  return f.for.includes(orderType);
}

function CartLines({ order, cart, onQty, onRequestRemove, onRequestClear, lineRefs, pulseKey }: {
  order: PosOrder | undefined;
  cart: CartLine[];
  onQty: (key: string, delta: number) => void;
  onRequestRemove: (key: string, name: string) => void;
  onRequestClear: (count: number) => void;
  lineRefs: React.RefObject<Map<string, HTMLDivElement>>;
  pulseKey: string | null;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-white min-h-[200px]">
      {order ? (
        (order.items ?? []).length ? (order.items ?? []).map((it: any) => (
          <div key={it.id} className="flex justify-between text-sm border-b py-1.5"><span>{it.quantity}× {it.name} {it.size ? `(${it.size})` : ''}{it.addons_snapshot && JSON.parse(it.addons_snapshot || '[]').length ? ` +${JSON.parse(it.addons_snapshot).length} addon` : ''}</span><span>₹{it.line_total ?? it.subtotal}</span></div>
        )) : <div className="grid place-items-center py-12 text-center" role="status"><div className="text-sm font-bold">No Item Selected</div><div className="text-xs text-zinc-500">Please Select Item from Left Menu</div></div>
      ) : cart.length ? cart.map((l) => (
        <div
          key={l.key}
          ref={(el) => { if (el) lineRefs.current.set(l.key, el); else lineRefs.current.delete(l.key); }}
          className={`border rounded p-1.5 text-sm min-w-0 space-y-1.5 transition-colors ${pulseKey === l.key ? 'border-[var(--pos-accent)] bg-amber-50' : ''}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex-1 min-w-0 truncate" title={`${l.name}${l.addons?.length ? ` + ${l.addons.map((a) => a.name).join(', ')}` : ''}`}>{l.name} {l.size ? `(${l.size})` : ''}{l.addons?.length ? ` +${l.addons.length}` : ''}</span>
            <span className="shrink-0 text-xs font-bold tabular-nums">₹{((l.unitPaise ?? 0) * l.quantity / 100).toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label={`Decrease ${l.name}`} onClick={() => onQty(l.key, -1)} disabled={l.quantity <= 1} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border grid place-items-center disabled:opacity-50 shrink-0">−</button>
            <span className="w-6 text-center shrink-0" aria-live="polite">{l.quantity}</span>
            <button type="button" aria-label={`Increase ${l.name}`} onClick={() => onQty(l.key, 1)} disabled={l.quantity >= 20} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border bg-zinc-900 text-white disabled:opacity-50 grid place-items-center shrink-0">+</button>
            <button type="button" aria-label={`Remove ${l.name}`} onClick={() => onRequestRemove(l.key, l.name)} className="w-11 h-11 min-h-[44px] min-w-[44px] ml-auto rounded border border-red-200 text-red-600 grid place-items-center text-lg shrink-0">×</button>
          </div>
        </div>
      )) : (
        <div className="grid place-items-center py-12 text-center" role="status">
          <div className="w-12 h-12 rounded-full border flex items-center justify-center mb-2" aria-hidden>🍽️</div>
          <div className="text-sm font-bold">No Item Selected</div>
          <div className="text-xs text-zinc-500">Please Select Item from Left Menu</div>
        </div>
      )}
      {cart.length > 0 && <button type="button" onClick={() => onRequestClear(cart.length)} className="w-full mt-2 h-11 min-h-[44px] rounded border text-xs text-zinc-600 hover:bg-zinc-50">Clear cart</button>}
    </div>
  );
}

export default function RightBill(props: RightBillProps) {
  const { config, activeOrderTypes, orderType, onOrderType, tableId, setTableId, guestCount, setGuestCount, customer, setCustomer, cart, order, orderId, containerCharge, setContainerCharge, tip, setTip, isComplimentary, setIsComplimentary, isAdvance, setIsAdvance, advanceAt, setAdvanceAt, onQty, onCreate, creating, canCreate, payments, duePaise, onPaid, onCompleted, onHold, onCancel, onModify, onReceipt, canPay, canDiscount, lineRefs, pulseKey, onRequestRemove, onRequestClear, fatal, setFatal, notice } = props;
  const cfg = config;
  const currency = cfg.ui?.currency_symbol || '₹';
  // Display-only estimates for immediate UI feedback (quantity/addon/cart edits).
  // Invariant: these values are presentation previews only. Order creation
  // and all persisted financial values are calculated and validated
  // server-side; no payment or order API consumes these client totals.
  const displaySubtotal = order ? order.subtotal : cart.reduce((s, l) => s + (l.unitPaise ?? 0) * l.quantity, 0) / 100;
  const displayDiscount = order?.discount ?? 0;
  const displayTax = order?.tax_amount ?? 0;
  const displayTotal = order ? order.total : displaySubtotal;
  const displayRoundOff = 0;
  const displayPaid = payments.reduce((s, p) => s + (p.amountPaise > 0 ? p.amountPaise : 0), 0) / 100;
  const displayChange = Math.max(0, displayPaid - (order ? order.total : displaySubtotal));
  const tabs = activeOrderTypes?.length ? activeOrderTypes : cfg.order_types.filter((o) => o.active);
  const isDine = orderType === 'dine_in';
  const nowLocal = new Date().toISOString().slice(0, 16);
  const billRows = (cfg.bill_rows || []).filter((b) => b.visible);
  const rowValues: Record<string, number> = {
    subtotal: displaySubtotal,
    discount: displayDiscount,
    container: containerCharge,
    tax: displayTax,
    round_off: displayRoundOff,
    customer_paid: displayPaid,
    return_to_customer: displayChange,
    tip,
  };
  return (
    <div className="flex flex-col h-full">
      <OrderTypeTabs tabs={tabs} orderType={orderType} onOrderType={onOrderType} />
      {(isDine || shouldShowField(cfg, orderType, 'phone') || shouldShowField(cfg, orderType, 'name') || shouldShowField(cfg, orderType, 'address') || shouldShowField(cfg, orderType, 'locality')) && (
        <CustomerSection cfg={cfg} orderType={orderType} isDine={isDine} tableId={tableId} setTableId={setTableId} guestCount={guestCount} setGuestCount={setGuestCount} customer={customer} setCustomer={setCustomer} />
      )}
      <div className="px-2 py-1.5 bg-zinc-900 text-white text-2xs font-bold tracking-wider">
        ITEMS ({order ? ((order.items ?? []).length) : cart.length})
      </div>
      <CartLines order={order} cart={cart} onQty={onQty} onRequestRemove={onRequestRemove} onRequestClear={onRequestClear} lineRefs={lineRefs} pulseKey={pulseKey} />
      <div className="border-t">
        {billRows.map((br) => {
          const val = rowValues[br.key] ?? 0;
          const isDiscount = br.key === 'discount';
          if (br.key === 'tip' && cfg.charges && cfg.charges.tip_enabled === false) return null;
          return (
            <div key={br.key} className="grid grid-cols-[1fr_80px] gap-2 px-3 py-1.5 text-xs odd:bg-zinc-100 even:bg-white border-b">
              <span className="font-medium">{br.label} {br.key === 'discount' && <span className="text-2xs text-zinc-500"> (after order)</span>}</span>
              <span className="text-right tabular-nums">{isDiscount ? `(${currency}${Number(val).toFixed(2)})` : `${currency}${Number(val).toFixed(2)}`}</span>
            </div>
          );
        })}
        <div className="grid grid-cols-2 gap-2 p-2 bg-white">
          {billRows.find((b) => b.key === 'container') && (
            <label htmlFor="pos-container" className="flex items-center gap-1 text-xs">{billRows.find((b) => b.key === 'container')?.label || 'Container'} <input id="pos-container" type="number" inputMode="numeric" min={0} value={containerCharge} onChange={e => setContainerCharge(Math.max(0, parseFloat(e.target.value) || 0))} className="ml-auto w-16 h-11 min-h-[44px] rounded border px-1 text-right focus:outline-none focus:border-[var(--pos-accent)]" /></label>
          )}
          {cfg.charges?.tip_enabled !== false && billRows.find((b) => b.key === 'tip') && (
            <label htmlFor="pos-tip" className="flex items-center gap-1 text-xs">{billRows.find((b) => b.key === 'tip')?.label || 'Tip'} <input id="pos-tip" type="number" inputMode="numeric" min={0} value={tip} onChange={e => setTip(Math.max(0, parseFloat(e.target.value) || 0))} className="ml-auto w-16 h-11 min-h-[44px] rounded border px-1 text-right focus:outline-none focus:border-[var(--pos-accent)]" /></label>
          )}
        </div>
      </div>
      <div className="p-2 border-t bg-white space-y-2">
        <div className="flex gap-2 flex-wrap items-center">
          {cfg.features?.advance_order !== false && (
            <button type="button" onClick={() => setIsAdvance((v: boolean) => !v)} aria-pressed={isAdvance} aria-expanded={isAdvance} aria-controls="advance-at" className={`px-3 py-1.5 rounded text-xs min-h-[44px] ${isAdvance ? 'bg-blue-100 border border-blue-300' : 'bg-zinc-100 border'}`}>Advance Order</button>
          )}
          {cfg.features?.complimentary !== false && (
            <label className="flex items-center gap-1 text-xs ml-auto"><input type="checkbox" checked={isComplimentary} onChange={e => setIsComplimentary(e.target.checked)} />Complimentary</label>
          )}
          <span className="text-sm font-bold tabular-nums">Total {isComplimentary ? `${currency}0.00` : `${currency}${(displayTotal + containerCharge + tip).toFixed(2)}`}</span>
        </div>
        {isAdvance && cfg.features?.advance_order !== false && (
          <Input id="advance-at" label="Advance time" type="datetime-local" value={advanceAt} min={nowLocal} onChange={e => setAdvanceAt(e.target.value)} aria-label="Advance order time" className="h-11 min-h-[44px] text-xs" />
        )}
        {fatal && <div role="alert" aria-live="assertive" aria-atomic="true" className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{fatal} <button type="button" onClick={() => setFatal(null)} className="underline">Dismiss</button></div>}
        {notice && <div role="status" aria-live="polite" aria-atomic="true" className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">{notice}</div>}
        {orderId == null ? (
          <button type="button" disabled={!canCreate || creating} onClick={onCreate} aria-busy={creating} className="w-full h-11 min-h-[44px] rounded bg-[var(--pos-accent)] text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {creating ? 'Creating order…' : 'Save'}
          </button>
        ) : (
          <CheckoutPanel
            orderId={orderId}
            payments={payments}
            duePaise={duePaise}
            onPaid={onPaid}
            onCompleted={onCompleted}
            onHold={onHold}
            onCancel={onCancel}
            onModify={onModify}
            onReceipt={onReceipt}
            canPay={canPay}
            canDiscount={canDiscount}
          />
        )}
      </div>
    </div>
  );
}
