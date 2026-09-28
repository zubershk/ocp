import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Banknote, ChevronDown, ChevronUp, CreditCard, ReceiptText, Wallet } from 'lucide-react';
import Input from '../ui/Input';
import { Modal } from '../ui/Modal';
import CheckoutPanel from './CheckoutPanel';
import DiscountList from './DiscountList';
import OrderTypeStrip from './OrderTypeStrip';
import TablePicker from './TablePicker';
import { buildMetaChips, shouldShowField } from './billRules';
import type { POSConfig } from '../../hooks/usePosConfig';
import { formatINR, posApi, posErrorMessage, toRupees, type PosOrder, type PosOrderType, type PosPayMethod } from '../../services/posService';
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
  outletId: number | null;
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
  onSavePrint: () => void;
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

function MetaSheet({ isDine, tableId, setTableId, guestCount, setGuestCount, locked, outletId, orderId, onAssignTable }: {
  isDine: boolean;
  tableId: number;
  setTableId: (n: number) => void;
  guestCount: number;
  setGuestCount: (n: number) => void;
  locked: boolean;
  outletId: number | null;
  orderId: number | null;
  onAssignTable: (id: number) => void;
}) {
  return (
    <div className="space-y-4">
      {isDine && (
        <div className="space-y-2">
          <div className="text-xs font-bold">Table</div>
          <TablePicker selected={tableId} onSelect={locked && orderId != null ? onAssignTable : setTableId} outletId={outletId} />
        </div>
      )}
      <div className="flex gap-2 items-center">
        <label htmlFor="pos-guests" className="text-xs font-bold w-16 shrink-0">Guests</label>
        <div className="flex-1 flex gap-1 items-center min-w-0">
          <button type="button" aria-label="Decrease guests" disabled={locked || (guestCount ?? 1) <= 1} onClick={() => setGuestCount(Math.max(1, (guestCount ?? 1) - 1))} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border bg-white grid place-items-center disabled:opacity-50 shrink-0">−</button>
          <input id="pos-guests" type="text" inputMode="numeric" pattern="[0-9]*" value={guestCount} disabled={locked} onChange={e => setGuestCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))} className="w-14 h-11 min-h-[44px] rounded border bg-white text-center text-sm tabular-nums shrink-0 focus:outline-none focus:border-[var(--pos-accent)] disabled:opacity-50" />
          <button type="button" aria-label="Increase guests" disabled={locked || (guestCount ?? 1) >= 50} onClick={() => setGuestCount(Math.min(50, (guestCount ?? 1) + 1))} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border bg-white grid place-items-center disabled:opacity-50 shrink-0">+</button>
        </div>
      </div>
      {locked && (
        <p role="note" className="text-xs text-zinc-500">Guests are fixed after saving. Table changes go through the table list above.</p>
      )}
    </div>
  );
}

function CustomerQuickAdd({ cfg, orderType, isDine, customer, setCustomer, locked }: {
  cfg: POSConfig;
  orderType: PosOrderType;
  isDine: boolean;
  customer: CustomerInfo;
  setCustomer: (c: CustomerInfo) => void;
  locked: boolean;
}) {
  const fields = ([
    { key: 'name', label: 'Name', autoComplete: 'name' },
    { key: 'phone', label: 'Mobile', autoComplete: 'tel' },
    { key: 'address', label: 'Address', autoComplete: 'street-address' },
    { key: 'locality', label: 'Locality', autoComplete: undefined },
  ] as const).filter((f) => f.key === 'phone' ? (isDine || shouldShowField(cfg, orderType, f.key)) : shouldShowField(cfg, orderType, f.key));
  if (fields.length === 0) return null;
  return (
    <div className="px-2 py-1.5 border-b border-[var(--pos-border)] bg-[var(--pos-panel)]">
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Customer details">
        {fields.map((f) => {
          const required = !!cfg.customer_fields?.[f.key]?.required;
          return (
            <label key={f.key} className="min-w-0 text-xs font-bold text-zinc-600">
              <span className="block truncate px-0.5">{f.label}{required ? ' *' : ''}</span>
              <input
                id={`pos-${f.key}`}
                type={f.key === 'phone' ? 'tel' : 'text'}
                inputMode={f.key === 'phone' ? 'numeric' : undefined}
                autoComplete={f.autoComplete}
                maxLength={f.key === 'phone' ? 15 : undefined}
                required={required}
                aria-required={required}
                disabled={locked}
                value={customer[f.key]}
                onChange={(e) => setCustomer({
                  ...customer,
                  [f.key]: f.key === 'phone' ? e.target.value.replace(/[^0-9+\- ]/g, '') : e.target.value,
                })}
                placeholder={f.label}
                className="mt-0.5 w-full h-11 min-h-[44px] rounded-lg border border-zinc-200 bg-white px-2.5 text-sm font-medium focus:outline-none focus:border-[var(--pos-accent)] disabled:opacity-60"
              />
            </label>
          );
        })}
      </div>
      {locked && (
        <p role="note" className="mt-1 text-xs text-zinc-500">Customer details are fixed after saving.</p>
      )}
    </div>
  );
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
    <div className="p-2 space-y-2 bg-white">
      {order ? (
        (order.items ?? []).length ? (order.items ?? []).map((it) => (
          <div key={it.id} className="border-b py-1.5 text-sm min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex-1 min-w-0 truncate">{it.quantity}× {it.name}</span>
              <span className="shrink-0 font-bold tabular-nums">₹{(it.line_total ?? it.subtotal).toFixed(2)}</span>
            </div>
            {(it.size || it.crust) && (
              <div className="text-xs text-zinc-500 truncate">{[it.size, it.crust].filter(Boolean).join(' · ')}</div>
            )}
            {(it.addons?.length ?? 0) > 0 && (
              <div className="text-xs text-zinc-500 truncate" title={(it.addons ?? []).map((a) => a.name).join(', ')}>{(it.addons ?? []).map((a) => a.name).join(', ')}</div>
            )}
          </div>
        )) : <div className="grid place-items-center py-8 text-center" role="status"><div className="text-sm font-bold">No Item Selected</div><div className="text-xs text-zinc-500">Please Select Item from Left Menu</div></div>
      ) : cart.length ? cart.map((l) => (
        <div
          key={l.key}
          ref={(el) => { if (el) lineRefs.current.set(l.key, el); else lineRefs.current.delete(l.key); }}
          className={`border rounded p-1.5 text-sm min-w-0 space-y-1.5 transition-colors ${pulseKey === l.key ? 'border-[var(--pos-accent)] bg-amber-50' : ''}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex-1 min-w-0 truncate" title={l.name}>{l.quantity}× {l.name}</span>
            <span className="shrink-0 text-xs font-bold tabular-nums">₹{((l.unitPaise ?? 0) * l.quantity / 100).toFixed(2)}</span>
          </div>
          {(l.size || l.crustName) && (
            <div className="text-xs text-zinc-500 truncate">{[l.size, l.crustName].filter(Boolean).join(' · ')}</div>
          )}
          {(l.addons?.length ?? 0) > 0 && (
            <div className="text-xs text-zinc-500 truncate" title={(l.addons ?? []).map((a) => a.name).join(', ')}>{(l.addons ?? []).map((a) => a.name).join(', ')}</div>
          )}
          <div className="flex items-center gap-1">
            <button type="button" aria-label={`Decrease ${l.name}`} onClick={() => onQty(l.key, -1)} disabled={l.quantity <= 1} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border grid place-items-center disabled:opacity-50 shrink-0">−</button>
            <span className="w-6 text-center shrink-0">{l.quantity}</span>
            <button type="button" aria-label={`Increase ${l.name}`} onClick={() => onQty(l.key, 1)} disabled={l.quantity >= 20} className="w-11 h-11 min-h-[44px] min-w-[44px] rounded border bg-zinc-900 text-white disabled:opacity-50 grid place-items-center shrink-0">+</button>
            <button type="button" aria-label={`Remove ${l.name}`} onClick={() => onRequestRemove(l.key, l.name)} className="w-11 h-11 min-h-[44px] min-w-[44px] ml-auto rounded border border-red-200 text-red-600 grid place-items-center text-lg shrink-0">×</button>
          </div>
        </div>
      )) : (
          <div className="grid place-items-center py-8 text-center" role="status">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="mb-2 text-zinc-300" aria-hidden="true">
              <circle cx="24" cy="24" r="10" />
              <circle cx="24" cy="24" r="5.5" />
              <path d="M8 12v8M11 12v8M14 12v8M11 20v16" />
              <path d="M37 12v8M37 20v16" />
            </svg>
            <div className="text-sm font-bold">No Item Selected</div>
            <div className="text-xs text-zinc-500">Please Select Item from Left Menu</div>
          </div>
      )}
      {cart.length > 0 && <button type="button" onClick={() => onRequestClear(cart.length)} className="w-full mt-2 h-11 min-h-[44px] rounded border text-xs text-zinc-600 hover:bg-zinc-50">Clear cart</button>}
    </div>
  );
}

export default function RightBill(props: RightBillProps) {
  const { config, activeOrderTypes, orderType, onOrderType, tableId, setTableId, guestCount, setGuestCount, customer, setCustomer, cart, order, orderId, containerCharge, setContainerCharge, tip, setTip, isComplimentary, setIsComplimentary, isAdvance, setIsAdvance, advanceAt, setAdvanceAt, onQty, onCreate, creating, canCreate, payments, duePaise, onPaid, onCompleted, onHold, onCancel, onModify, onReceipt, onSavePrint, canPay, canDiscount, lineRefs, pulseKey, onRequestRemove, onRequestClear, fatal, setFatal, notice, outletId } = props;
  const cfg = config;
  const currency = cfg.ui?.currency_symbol || '₹';
  // Display-only estimates for immediate UI feedback (quantity/addon/cart edits).
  // Invariant: these values are presentation previews only. Order creation
  // and all persisted financial values are calculated and validated
  // server-side; no payment or order API consumes these client totals.
  const displaySubtotal = order ? order.subtotal : cart.reduce((s, l) => s + (l.unitPaise ?? 0) * l.quantity, 0) / 100;
  const displayDiscount = order?.discount ?? 0;
  const displayTax = order?.tax_amount ?? 0;
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
    customer_paid: displayPaid,
    return_to_customer: displayChange,
    tip,
  };
  const qc = useQueryClient();
  const [payRequest, setPayRequest] = useState<{ key: number; method?: PosPayMethod } | null>(null);
  const [bogoOpen, setBogoOpen] = useState(false);
  const [bogoBusy, setBogoBusy] = useState(false);
  const hasOrder = orderId != null;
  const isPaid = hasOrder && duePaise === 0;
  const bogoEnabled = cfg.features?.bogo === true;
  const kotEnabled = cfg.features?.kot === true;
  const [metaOpen, setMetaOpen] = useState(false);
  const chips = buildMetaChips(isDine, tableId, guestCount);
  const [tapeOpen, setTapeOpen] = useState(true);

  const changeOrderType = async (t: PosOrderType) => {
    if (t === orderType) return;
    if (orderId == null) {
      onOrderType(t);
      return;
    }
    try {
      await posApi.updateOrderType(orderId, t);
      onOrderType(t);
      await qc.invalidateQueries({ queryKey: ['pos-order', orderId] });
    } catch (e) {
      setFatal(posErrorMessage(e).message);
    }
  };

  const assignTable = async (id: number) => {
    if (orderId == null) {
      setTableId(id);
      return;
    }
    try {
      await posApi.assignTable(id, orderId);
      setTableId(id);
      await qc.invalidateQueries({ queryKey: ['pos-tables'] });
      setMetaOpen(false);
    } catch (e) {
      setFatal(posErrorMessage(e).message);
    }
  };

  const requestPay = (method?: PosPayMethod) => {
    if (!hasOrder) {
      setFatal('Save the order before collecting payment.');
      return;
    }
    if (!canPay) {
      setFatal('Pay needs a manager key.');
      return;
    }
    setPayRequest({ key: Date.now(), method });
  };

  const handleBogo = () => {
    if (!bogoEnabled) {
      setFatal('Enable BOGO in Admin → POS Config → Features.');
      return;
    }
    if (!hasOrder) {
      setFatal('Save the order first, then apply the BOGO discount.');
      return;
    }
    if (!canDiscount) {
      setFatal('BOGO needs a manager key.');
      return;
    }
    setBogoOpen(true);
  };

  const applyBogo = async (discountId: number) => {
    if (orderId == null) return;
    setBogoBusy(true);
    try {
      await posApi.applyDiscount(orderId, discountId);
      setBogoOpen(false);
      await qc.invalidateQueries({ queryKey: ['pos-order', orderId] });
    } catch (e) {
      setFatal(posErrorMessage(e).message);
    } finally {
      setBogoBusy(false);
    }
  };

  const removeBogo = async () => {
    if (orderId == null) return;
    setBogoBusy(true);
    try {
      await posApi.removeDiscount(orderId);
      await qc.invalidateQueries({ queryKey: ['pos-order', orderId] });
    } catch (e) {
      setFatal(posErrorMessage(e).message);
    } finally {
      setBogoBusy(false);
    }
  };

  const handleKot = () => {
    if (!kotEnabled) {
      setFatal('Enable KOT in Admin → POS Config → Features.');
      return;
    }
    setFatal('KOT printing is not wired yet; use Save & Print for the receipt.');
  };

  const dueRupeesValue = duePaise != null ? toRupees(duePaise) : null;
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0">
        <OrderTypeStrip tabs={tabs} orderType={orderType} onOrderType={changeOrderType} />
        {isDine && (
          <div className="flex items-stretch gap-1 px-2 pb-1 min-h-[44px] border-b border-[var(--pos-border)]">
            <ul className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2" aria-label="Order details">
              {chips.map((c) => (
                <li key={c.key} className="shrink-0 max-w-[9rem] truncate text-xs text-zinc-700">
                  <span className="text-zinc-500">{c.label}</span>{' '}
                  <span className="font-semibold tabular-nums">{c.value}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setMetaOpen(true)}
              className="shrink-0 min-h-[44px] px-3 rounded-lg border border-zinc-200 bg-white text-xs font-bold hover:border-zinc-400"
            >
              Edit
            </button>
          </div>
        )}
        <CustomerQuickAdd
          cfg={cfg} orderType={orderType} isDine={isDine}
          customer={customer} setCustomer={setCustomer}
          locked={orderId != null}
        />
        <Modal open={metaOpen} onClose={() => setMetaOpen(false)} title="Table & guests" size="sm">
          <MetaSheet
            isDine={isDine}
            tableId={tableId} setTableId={setTableId}
            guestCount={guestCount} setGuestCount={setGuestCount}
            locked={orderId != null} outletId={outletId} orderId={orderId}
            onAssignTable={assignTable}
          />
        </Modal>
        <div className="px-2 py-1.5 bg-zinc-900 text-white text-2xs font-bold tracking-wider">
          ITEMS ({order ? ((order.items ?? []).length) : cart.length})
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
      {(cart.length > 0 || orderId != null) && (
        <p role="status" aria-live="polite" className="sr-only">
          {order ? (order.items ?? []).length : cart.length} items, {order ? formatINR(order.total) : `${currency}${displaySubtotal.toFixed(2)} estimated`}
        </p>
      )}
      <CartLines order={order} cart={cart} onQty={onQty} onRequestRemove={onRequestRemove} onRequestClear={onRequestClear} lineRefs={lineRefs} pulseKey={pulseKey} />
      {orderId == null ? (
      <>
      <button
        type="button"
        onClick={() => setTapeOpen((v) => !v)}
        aria-expanded={tapeOpen}
        aria-controls="pos-tape"
        className="w-full min-h-[44px] flex items-center justify-between px-3 border-t bg-white text-xs font-bold text-zinc-700"
      >
        Bill details
        {tapeOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
      </button>
      {tapeOpen ? (
      <div id="pos-tape">
      <dl className="border-t">
        {billRows.map((br) => {
          // Round Off has no server computation behind it — never render it.
          if (br.key === 'round_off') return null;
          const val = rowValues[br.key] ?? 0;
          const isDiscount = br.key === 'discount';
          if (br.key === 'tip' && cfg.charges && cfg.charges.tip_enabled === false) return null;
          return (
            <div key={br.key} className="grid grid-cols-[1fr_80px] gap-2 px-3 py-1.5 text-xs odd:bg-zinc-100 even:bg-white border-b">
              <dt className="font-medium">{br.label} {br.key === 'discount' && <span className="text-2xs text-zinc-500"> (after order)</span>}</dt>
              <dd className="text-right tabular-nums">{isDiscount ? `(${currency}${Number(val).toFixed(2)})` : `${currency}${Number(val).toFixed(2)}`}</dd>
            </div>
          );
        })}
        </dl>
        <div className="grid grid-cols-1 @[360px]:grid-cols-2 gap-2 p-2 bg-white">
          {billRows.find((b) => b.key === 'container') && (
            <label htmlFor="pos-container" className="flex items-center gap-1 text-xs">{billRows.find((b) => b.key === 'container')?.label || 'Container'} <input id="pos-container" type="number" inputMode="numeric" min={0} value={containerCharge} onChange={e => setContainerCharge(Math.max(0, parseFloat(e.target.value) || 0))} className="ml-auto w-16 h-11 min-h-[44px] rounded border px-1 text-right focus:outline-none focus:border-[var(--pos-accent)]" /></label>
          )}
          {cfg.charges?.tip_enabled !== false && billRows.find((b) => b.key === 'tip') && (
            <label htmlFor="pos-tip" className="flex items-center gap-1 text-xs">{billRows.find((b) => b.key === 'tip')?.label || 'Tip'} <input id="pos-tip" type="number" inputMode="numeric" min={0} value={tip} onChange={e => setTip(Math.max(0, parseFloat(e.target.value) || 0))} className="ml-auto w-16 h-11 min-h-[44px] rounded border px-1 text-right focus:outline-none focus:border-[var(--pos-accent)]" /></label>
          )}
        </div>
      </div>
      ) : null}
      </>
      ) : null}
      {orderId != null ? (
        <CheckoutPanel
          orderId={orderId}
          payments={payments}
          duePaise={duePaise}
          payRequest={payRequest}
          compact
          onPaid={onPaid}
          onCompleted={onCompleted}
          onHold={onHold}
          onCancel={onCancel}
          onModify={onModify}
          onReceipt={onReceipt}
          canPay={canPay}
          canDiscount={canDiscount}
        />
      ) : null}
      </div>
      <div className="border-t bg-white shrink-0">
        <div className="px-2 pt-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-1 flex-wrap items-center gap-1" role="group" aria-label="Offer actions">
              <button
                type="button"
                onClick={handleBogo}
                title={bogoEnabled ? 'Apply a discount' : 'Offer discounts at the register (Admin → POS Config → Features)'}
                className={`h-11 min-h-[44px] px-2.5 rounded-lg border text-xs font-bold shrink-0 ${bogoEnabled ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-zinc-100 border-zinc-200 text-zinc-600'}`}
              >
                Discount
              </button>
              <button
                type="button"
                disabled
                title="Splitting one bill across guests is not supported yet. Record one bill per guest."
                className="h-11 min-h-[44px] px-2.5 rounded-lg border text-xs font-bold shrink-0 bg-zinc-100 border-zinc-200 text-zinc-500 disabled:opacity-70"
              >
                Split
              </button>
              {orderId == null && cfg.features?.advance_order !== false && (
                <button type="button" onClick={() => setIsAdvance((v: boolean) => !v)} aria-pressed={isAdvance} aria-expanded={isAdvance} aria-controls="advance-at" className={`h-11 min-h-[44px] px-2.5 rounded-lg border text-xs font-bold shrink-0 ${isAdvance ? 'bg-blue-100 border-blue-300 text-blue-900' : 'bg-zinc-100 border-zinc-200 text-zinc-700'}`}>Advance Order</button>
              )}
              {orderId == null && cfg.features?.complimentary !== false && (
                <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 shrink-0 px-1"><input type="checkbox" checked={isComplimentary} onChange={e => setIsComplimentary(e.target.checked)} className="h-4 w-4 accent-[var(--pos-accent)]" />Complimentary</label>
              )}
            </div>
            <span className="ml-auto whitespace-nowrap text-sm font-black tabular-nums shrink-0">Total {order ? formatINR(order.total) : `${currency}${displaySubtotal.toFixed(2)}`}</span>
          </div>
          {isAdvance && cfg.features?.advance_order !== false && (
            <Input id="advance-at" label="Advance time" type="datetime-local" value={advanceAt} min={nowLocal} onChange={e => setAdvanceAt(e.target.value)} aria-label="Advance order time" className="h-11 min-h-[44px] text-xs" />
          )}
          {fatal && <div role="alert" aria-live="assertive" aria-atomic="true" className="mt-1.5 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{fatal} <button type="button" onClick={() => setFatal(null)} className="underline">Dismiss</button></div>}
          {notice && <div role="status" aria-live="polite" aria-atomic="true" className="mt-1.5 rounded border border-amber-200 bg-amber-50 p-2 text-xs">{notice}</div>}
        </div>

        <div className="grid grid-cols-3 @[380px]:grid-cols-5 border-t border-l border-zinc-200 shrink-0" role="group" aria-label="Payment methods">
          <button type="button" onClick={() => requestPay('cash')} disabled={!hasOrder || !canPay} title={!hasOrder ? 'Save the order first' : (!canPay ? 'Pay needs a manager key' : 'Pay with cash')} className="min-h-[44px] px-1 py-1 text-[11px] font-bold inline-flex flex-col items-center justify-center gap-0.5 bg-emerald-50 text-emerald-900 border-b border-r border-zinc-200 disabled:opacity-40">
            <Banknote size={16} aria-hidden /><span>Cash</span>
          </button>
          <button type="button" onClick={() => requestPay('card')} disabled={!hasOrder || !canPay} title={!hasOrder ? 'Save the order first' : (!canPay ? 'Pay needs a manager key' : 'Pay with card')} className="min-h-[44px] px-1 py-1 text-[11px] font-bold inline-flex flex-col items-center justify-center gap-0.5 bg-white text-zinc-700 border-b border-r border-zinc-200 disabled:opacity-40">
            <CreditCard size={16} aria-hidden /><span>Card</span>
          </button>
          <button type="button" disabled title="Due is a status, not a payment method" className="min-h-[44px] px-1 py-1 text-[11px] font-bold inline-flex flex-col items-center justify-center gap-0.5 bg-white text-zinc-400 border-b border-r border-zinc-200 disabled:opacity-60">
            <ReceiptText size={16} aria-hidden /><span>Due</span>
          </button>
          <button type="button" onClick={() => requestPay('other')} disabled={!hasOrder || !canPay} title={!hasOrder ? 'Save the order first' : (!canPay ? 'Pay needs a manager key' : 'Pay with another method')} className="min-h-[44px] px-1 py-1 text-[11px] font-bold inline-flex flex-col items-center justify-center gap-0.5 bg-white text-zinc-700 border-b border-r border-zinc-200 disabled:opacity-40">
            <Wallet size={16} aria-hidden /><span>Other</span>
          </button>
          <button type="button" onClick={() => requestPay()} disabled={!hasOrder || !canPay} title={!hasOrder ? 'Save the order first' : 'More payment methods'} className="min-h-[44px] px-1 py-1 text-[11px] font-bold inline-flex flex-col items-center justify-center gap-0.5 bg-white text-zinc-700 border-b border-r border-zinc-200 disabled:opacity-40">
            <ChevronUp size={16} aria-hidden /><span>More</span>
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 border-t px-2 py-1.5 shrink-0">
          {isPaid ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold px-3 py-1">Paid</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 border border-zinc-200 text-zinc-600 text-xs font-bold px-3 py-1">
              Due{dueRupeesValue != null ? ` ${formatINR(dueRupeesValue)}` : ''}
            </span>
          )}
        </div>

        <div className="relative border-t shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto p-2" role="group" aria-label="Bill actions">
          {orderId == null ? (
            <button type="button" disabled={!canCreate || creating} onClick={onCreate} aria-busy={creating} title="Save this sale as an order" className="h-11 min-h-[44px] px-3 rounded-lg bg-[var(--pos-accent)] text-white text-xs font-bold shrink-0 disabled:opacity-50">
              {creating ? 'Creating order…' : 'Save'}
            </button>
          ) : (
            <button type="button" disabled title="Order already saved" className="h-11 min-h-[44px] px-3 rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-500 text-xs font-bold shrink-0 disabled:opacity-60">
              Save
            </button>
          )}
          <button type="button" disabled={!hasOrder} onClick={onSavePrint} title={!hasOrder ? 'Save the order first' : 'Open the receipt and print it'} className="h-11 min-h-[44px] px-3 rounded-lg bg-[var(--pos-accent)] text-white text-xs font-bold shrink-0 disabled:opacity-50">
            Save &amp; Print
          </button>
          <button type="button" disabled={!hasOrder} onClick={onReceipt} title={!hasOrder ? 'Save the order first' : 'Open the receipt'} className="h-11 min-h-[44px] px-3 rounded-lg bg-white border-2 border-zinc-200 text-zinc-700 text-xs font-bold shrink-0 disabled:opacity-50">
            Receipt
          </button>
          <button type="button" disabled onClick={handleKot} title={kotEnabled ? 'KOT printing is not wired yet' : 'Enable KOT in Admin → POS Config → Features'} className="h-11 min-h-[44px] px-3 rounded-lg bg-zinc-100 border border-zinc-200 text-zinc-500 text-xs font-bold shrink-0 disabled:opacity-70 inline-flex flex-col items-center justify-center leading-none">
            <span>KOT</span>
            <span className="text-[10px] font-semibold">Not available</span>
          </button>
          {cfg.features?.hold !== false && (
          <button type="button" disabled={!hasOrder} onClick={onHold} title={!hasOrder ? 'Save the order first' : 'Hold this order'} className="h-11 min-h-[44px] px-3 rounded-lg bg-amber-600 text-white text-xs font-bold shrink-0 disabled:opacity-50">
            Hold
          </button>
          )}
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
        </div>

        <Modal open={bogoOpen} onClose={() => setBogoOpen(false)} title="Apply discount (register verifies)" size="sm">
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">Choose a discount. The register checks the rule.</p>
            <DiscountList
              busy={bogoBusy}
              onPick={applyBogo}
              onRemove={order && order.discount > 0 ? removeBogo : null}
            />
          </div>
        </Modal>
      </div>
    </div>
  );
}
