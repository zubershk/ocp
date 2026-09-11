import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CreditCard, Pause, QrCode, ReceiptText, Tag, Undo2, XCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import {
  posApi,
  posErrorMessage,
  formatINR,
  toPaise,
  toRupees,
  newIdempotencyKey,
  type PosOrder,
  type PosPayMethod,
} from '../../services/posService';
import type { RecordedPayment } from './types';

const METHODS: { value: PosPayMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'cash', label: 'Cash', icon: <Banknote size={22} /> },
  { value: 'upi', label: 'UPI', icon: <QrCode size={22} /> },
  { value: 'card', label: 'Card', icon: <CreditCard size={22} /> },
];

function statusLabel(s: string): string {
  switch (s) {
    case 'draft': return 'Draft';
    case 'held': return 'Held';
    case 'confirmed': return 'Confirmed';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    default: return s;
  }
}

const statusChip: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-600',
  held: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-600',
};

export default function CheckoutPanel({
  orderId,
  payments,
  duePaise,
  onPaid,
  onCompleted,
  onHold,
  onCancel,
  onModify,
  onReceipt,
  canPay,
  canDiscount,
}: {
  orderId: number;
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
}) {
  const orderQuery = useQuery({
    queryKey: ['pos-order', orderId],
    queryFn: () => posApi.getOrder(orderId),
    staleTime: 5_000,
    retry: 1,
  });
  const order: PosOrder | undefined = orderQuery.data;
  const orderOpen = order != null && ['draft', 'held', 'confirmed'].includes(order.status);
  const due = duePaise ?? (order ? toPaise(order.total) : 0);
  const paidPaise = order ? toPaise(order.total) - due : 0;

  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<PosPayMethod>('cash');
  const [tendered, setTendered] = useState('');
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [payKey, setPayKey] = useState(() => newIdempotencyKey());
  const [discOpen, setDiscOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dueRupees = toRupees(due);
  const tenderedPaise = tendered.trim() === '' ? due : Math.round(Number(tendered) * 100);
  const changePaise = method === 'cash' ? tenderedPaise - due : 0;
  const validTender = Number.isFinite(tenderedPaise) && (method !== 'cash' || tenderedPaise >= due || tendered.trim() === '');

  const openPay = () => {
    setPayKey(newIdempotencyKey());
    setTendered('');
    setPayErr(null);
    setMethod('cash');
    setPayOpen(true);
  };

  const submitPayment = async () => {
    if (!validTender || paying) return;
    setPaying(true);
    setPayErr(null);
    try {
      const r = await posApi.takePayment(
        orderId,
        { method, amountPaise: due, tenderedPaise },
        payKey,
      );
      onPaid(
        { paymentId: r.payment_id, method, amountPaise: due, reference: '', replayed: r.replayed, at: new Date().toISOString() },
        r.due_paise,
      );
      setPayOpen(false);
    } catch (e) {
      const { status, message } = posErrorMessage(e);
      setPayErr(
        status === 403
          ? 'You are not allowed to take payments with this key.'
          : status === 409
            ? 'This order was just updated elsewhere. Close this, refresh, and try again.'
            : 'Payment could not be recorded. Nothing was charged. ' + message,
      );
    } finally {
      setPaying(false);
    }
  };

  const complete = async () => {
    setBusy('complete');
    setNotice(null);
    try {
      await posApi.completeOrder(orderId);
      onCompleted();
    } catch (e) {
      setNotice(posErrorMessage(e).message);
    } finally {
      setBusy(null);
    }
  };

  const applyDiscount = async (discountId: number) => {
    setBusy('discount');
    setNotice(null);
    try {
      await posApi.applyDiscount(orderId, discountId);
      setDiscOpen(false);
      await orderQuery.refetch();
    } catch (e) {
      setNotice(posErrorMessage(e).message);
    } finally {
      setBusy(null);
    }
  };

  const removeDiscount = async () => {
    setBusy('discount');
    setNotice(null);
    try {
      await posApi.removeDiscount(orderId);
      await orderQuery.refetch();
    } catch (e) {
      setNotice(posErrorMessage(e).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col min-h-0 h-full gap-3">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-black text-lg">Order {order ? `#${order.order_number}` : `#${orderId}`}</h2>
        {order && <span className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide ${statusChip[order.status] ?? 'bg-zinc-100 text-zinc-600'}`}>{statusLabel(order.status)}</span>}
        <button type="button" onClick={() => orderQuery.refetch()} className="ml-auto text-xs font-bold text-zinc-400 hover:text-zinc-700">Refresh</button>
      </div>

      {order == null ? (
        orderQuery.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded-2xl bg-zinc-100 animate-pulse" />)}</div>
        ) : (
          <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-red-700 font-medium">
            Couldn't load this order.{' '}
            <button className="font-bold underline" onClick={() => orderQuery.refetch()}>Retry</button>
          </div>
        )
      ) : (
        <>
          {/* Items (server-verified) */}
          <ul className="space-y-1.5 overflow-y-auto max-h-44 pr-0.5">
            {(order.items ?? []).map((it, i) => (
              <li key={i} className="flex justify-between gap-2 text-sm bg-zinc-50 rounded-xl px-3 py-2">
                <span className="font-semibold min-w-0 truncate">
                  {it.quantity}× {it.name}
                  {(it.size || it.crust) && <span className="text-zinc-400 font-medium"> ({[it.size, it.crust].filter(Boolean).join(' · ')})</span>}
                </span>
                <span className="font-bold tabular-nums shrink-0">{formatINR(it.line_total)}</span>
              </li>
            ))}
          </ul>

          {/* Totals: server-authoritative */}
          <dl className="rounded-2xl border-2 border-zinc-100 p-3 space-y-1 text-sm tabular-nums">
            <div className="flex justify-between"><dt className="text-zinc-500 font-medium">Subtotal</dt><dd className="font-bold">{formatINR(order.subtotal)}</dd></div>
            {order.discount > 0 && <div className="flex justify-between text-emerald-700"><dt className="font-medium">Discount</dt><dd className="font-bold">−{formatINR(order.discount)}</dd></div>}
            {(order.tax_amount ?? 0) > 0 && <div className="flex justify-between"><dt className="text-zinc-500 font-medium">Tax</dt><dd className="font-bold">{formatINR(order.tax_amount ?? 0)}</dd></div>}
            <div className="flex justify-between items-baseline border-t border-zinc-100 pt-1.5 mt-1"><dt className="font-black text-base">Total</dt><dd className="font-black text-2xl">{formatINR(order.total)}</dd></div>
          </dl>

          {/* Payments ledger + remaining */}
          {payments.length > 0 && (
            <ul className="space-y-1 text-xs">
              {payments.map((p) => (
                <li key={p.paymentId} className="flex justify-between rounded-lg bg-emerald-50 text-emerald-800 px-2.5 py-1.5 font-bold">
                  <span className="uppercase">{p.method}</span>
                  <span className="tabular-nums">{formatINR(toRupees(p.amountPaise))}</span>
                </li>
              ))}
            </ul>
          )}
          {notice && <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold px-3 py-2">{notice}</div>}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onHold} disabled={!orderOpen} className="h-11 rounded-xl border-2 border-zinc-200 bg-white font-bold text-sm inline-flex items-center justify-center gap-1.5 hover:border-zinc-400 disabled:opacity-40 active:scale-[0.98]">
              <Pause size={15} /> Hold
            </button>
            {canDiscount ? (
              <button type="button" onClick={() => setDiscOpen(true)} disabled={!orderOpen} className="h-11 rounded-xl border-2 border-zinc-200 bg-white font-bold text-sm inline-flex items-center justify-center gap-1.5 hover:border-zinc-400 disabled:opacity-40 active:scale-[0.98]">
                <Tag size={15} /> Discount
              </button>
            ) : (
              <button type="button" onClick={onModify} disabled={!orderOpen} className="h-11 rounded-xl border-2 border-zinc-200 bg-white font-bold text-sm inline-flex items-center justify-center gap-1.5 hover:border-zinc-400 disabled:opacity-40 active:scale-[0.98]">
                <Undo2 size={15} /> Modify items
              </button>
            )}
            <button type="button" onClick={onCancel} disabled={!orderOpen} className="h-11 rounded-xl border-2 border-zinc-200 bg-white font-bold text-sm inline-flex items-center justify-center gap-1.5 text-red-600 hover:border-red-300 hover:bg-red-50 disabled:opacity-40 active:scale-[0.98]">
              <XCircle size={15} /> Cancel
            </button>
            <button type="button" onClick={onReceipt} className="h-11 rounded-xl border-2 border-zinc-200 bg-white font-bold text-sm inline-flex items-center justify-center gap-1.5 hover:border-zinc-400 active:scale-[0.98]">
              <ReceiptText size={15} /> Receipt
            </button>
          </div>

          {/* Payment / complete */}
          <div className={`mt-auto rounded-3xl p-4 text-white ${due === 0 ? 'bg-emerald-600' : 'bg-zinc-950'}`}>
            <div className="flex items-center justify-between text-sm font-semibold opacity-80">
              <span>{due === 0 ? 'Fully paid' : 'Amount due'}</span>
              {paidPaise > 0 && <span className="tabular-nums text-xs">Paid {formatINR(toRupees(paidPaise))}</span>}
            </div>
            <div className="font-black text-4xl tabular-nums mt-0.5">{formatINR(dueRupees)}</div>
            {orderOpen && (
              due === 0 ? (
                <button
                  type="button"
                  onClick={complete}
                  disabled={busy === 'complete'}
                  className="mt-3 w-full h-14 rounded-2xl bg-white text-emerald-700 font-black text-lg transition-all active:scale-[0.98] disabled:opacity-60"
                >
                  {busy === 'complete' ? 'Completing…' : 'Complete order'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openPay}
                  disabled={!canPay}
                  className="mt-3 w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-400 font-black text-lg transition-all active:scale-[0.98] disabled:opacity-40"
                >
                  {canPay ? 'Pay' : 'Pay (manager key required)'}
                </button>
              )
            )}
          </div>
        </>
      )}

      {/* Pay dialog */}
      <Modal open={payOpen} onClose={() => !paying && setPayOpen(false)} title={`Collect ${formatINR(dueRupees)}`} size="sm">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={method === m.value}
                onClick={() => setMethod(m.value)}
                className={`h-14 rounded-2xl font-bold inline-flex flex-col items-center justify-center gap-1 border-2 transition-all active:scale-[0.97] ${
                  method === m.value ? 'bg-zinc-950 text-white border-zinc-950' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                }`}
              >
                {m.icon}
                <span className="text-xs">{m.label}</span>
              </button>
            ))}
          </div>

          {method === 'cash' && (
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">Cash received</label>
              <input
                inputMode="decimal"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                placeholder={dueRupees.toFixed(2)}
                aria-label="Cash received"
                className="w-full h-12 rounded-2xl border-2 border-zinc-200 px-4 text-lg font-bold focus:outline-none focus:border-orange-500"
              />
              <div className="flex gap-2">
                {[...new Set([Math.ceil(dueRupees), Math.ceil(dueRupees / 100) * 100, Math.ceil(dueRupees / 500) * 500])].map((v) => (
                  <button key={v} type="button" onClick={() => setTendered(String(v))} className="flex-1 h-10 rounded-xl bg-zinc-100 hover:bg-zinc-200 font-bold text-sm">₹{v}</button>
                ))}
              </div>
              <div className="flex justify-between rounded-2xl bg-zinc-50 px-3 py-2 text-sm font-bold tabular-nums">
                <span>Change</span>
                <span className={changePaise < 0 ? 'text-red-600' : ''}>{formatINR(Math.max(0, toRupees(changePaise)))}</span>
              </div>
            </div>
          )}
          {method === 'upi' && (
            <p className="rounded-2xl bg-zinc-50 p-3 text-sm text-zinc-600">
              Collect {formatINR(dueRupees)} on the counter UPI. Mark as paid only after the customer completes the transfer.
            </p>
          )}
          {method === 'card' && (
            <p className="rounded-2xl bg-zinc-50 p-3 text-sm text-zinc-600">
              Charge {formatINR(dueRupees)} on the card terminal, then confirm here.
            </p>
          )}

          {payErr && <p className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-3 py-2">{payErr}</p>}

          <button
            type="button"
            onClick={submitPayment}
            disabled={paying || !validTender}
            className="w-full h-14 rounded-2xl bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-black text-lg transition-all active:scale-[0.98]"
          >
            {paying ? 'Processing payment…' : `Record ${method.toUpperCase()} ${formatINR(dueRupees)}`}
          </button>
          <p className="text-[11px] text-zinc-400 text-center">Retries reuse the same request key — no double submission.</p>
        </div>
      </Modal>

      {/* Discount dialog */}
      <Modal open={discOpen} onClose={() => setDiscOpen(false)} title="Discount (register verifies)" size="sm">
        <DiscountList
          busy={busy === 'discount'}
          onPick={applyDiscount}
          onRemove={order && order.discount > 0 ? removeDiscount : null}
        />
      </Modal>
    </div>
  );
}

function DiscountList({ busy, onPick, onRemove }: { busy: boolean; onPick: (id: number) => void; onRemove: (() => void) | null }) {
  const q = useQuery({ queryKey: ['pos-discounts'], queryFn: posApi.getDiscounts, staleTime: 30_000, retry: 1 });
  if (q.isLoading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-zinc-100 animate-pulse" />)}</div>;
  if (q.isError) return <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 font-medium">Couldn't load discounts. <button className="font-bold underline" onClick={() => q.refetch()}>Retry</button></div>;
  return (
    <ul className="space-y-2">
      {onRemove && (
        <li>
          <button type="button" disabled={busy} onClick={onRemove} className="w-full h-12 rounded-xl border-2 border-red-200 text-red-700 font-bold hover:bg-red-50 active:scale-[0.98] disabled:opacity-50">
            Remove current discount
          </button>
        </li>
      )}
      {(q.data ?? []).length === 0 && <p className="text-sm text-zinc-500 text-center py-3">No active discounts.</p>}
      {(q.data ?? []).map((d) => (
        <li key={d.id}>
          <button type="button" disabled={busy} onClick={() => onPick(d.id)} className="w-full h-12 rounded-xl border-2 border-zinc-200 font-bold px-3 flex items-center justify-between hover:border-zinc-400 active:scale-[0.98] disabled:opacity-50">
            <span>{d.name}</span>
            <span className="text-zinc-500 text-sm">{d.type === 'percent' ? `${d.value / 100}%` : formatINR(toRupees(d.value))} off</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
