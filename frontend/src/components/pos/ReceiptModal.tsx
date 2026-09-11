import { useState } from 'react';
import { Printer, Undo2 } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { Modal } from '../ui/Modal';
import Badge from '../ui/Badge';
import {
  formatINR,
  toRupees,
  newIdempotencyKey,
  posErrorMessage,
  posApi,
  type PosOrder,
} from '../../services/posService';
import type { RecordedPayment } from './types';

export default function ReceiptModal({
  open,
  onClose,
  order,
  payments,
  canRefund,
  outletName,
}: {
  open: boolean;
  onClose: () => void;
  order: PosOrder | null;
  payments: RecordedPayment[];
  canRefund: boolean;
  outletName: string;
}) {
  const [refundId, setRefundId] = useState<number | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refunding, setRefunding] = useState(false);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);

  const submitRefund = async () => {
    if (order == null || refundId == null) return;
    const paise = Math.round(Number(refundAmount) * 100);
    if (!Number.isFinite(paise) || paise <= 0) {
      setRefundMsg('Enter a positive refund amount');
      return;
    }
    setRefunding(true);
    setRefundMsg(null);
    try {
      const r = await posApi.refundPayment(order.id, refundId, paise, 'pos-counter', newIdempotencyKey());
      setRefundMsg(`Refund recorded (#${r.payment_id})${r.replayed ? ' — replayed' : ''}`);
      setRefundId(null);
      setRefundAmount('');
    } catch (e) {
      const { status, message } = posErrorMessage(e);
      setRefundMsg(status === 403 ? 'Not permitted for your role' : message);
    } finally {
      setRefunding(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Receipt" size="sm">
      {order == null ? (
        <p className="text-sm text-zinc-500">No order loaded.</p>
      ) : (
        <div>
          <div className="print-receipt rounded-2xl border border-zinc-200 p-4 text-sm">
            <div className="text-center">
              <div className="font-bold">Orange Cheese Pizza</div>
              <div className="text-xs text-zinc-500">{outletName}</div>
              <div className="font-bold mt-1">Order #{order.order_number}</div>
              <div className="text-xs text-zinc-500">
                {order.order_type.replace('_', ' ')} · {order.status} ·{' '}
                {new Date(order.created_at).toLocaleString('en-IN')}
              </div>
            </div>
            <hr className="my-2 border-dashed" />
            <ul className="space-y-1">
              {(order.items ?? []).map((it, i) => (
                <li key={i} className="flex justify-between tabular-nums">
                  <span>
                    {it.quantity}× {it.name}
                    {it.size ? ` (${it.size})` : ''}
                  </span>
                  <span>{formatINR(it.line_total)}</span>
                </li>
              ))}
            </ul>
            <hr className="my-2 border-dashed" />
            <dl className="space-y-0.5 tabular-nums">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatINR(order.subtotal)}</dd>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between">
                  <dt>Discount</dt>
                  <dd>−{formatINR(order.discount)}</dd>
                </div>
              )}
              {(order.tax_amount ?? 0) > 0 && (
                <div className="flex justify-between">
                  <dt>Tax</dt>
                  <dd>{formatINR(order.tax_amount ?? 0)}</dd>
                </div>
              )}
              <div className="flex justify-between font-bold text-base">
                <dt>Total</dt>
                <dd>{formatINR(order.total)}</dd>
              </div>
            </dl>
            {payments.length > 0 && (
              <>
                <hr className="my-2 border-dashed" />
                <ul className="space-y-0.5 tabular-nums">
                  {payments.map((p) => (
                    <li key={p.paymentId} className="flex justify-between">
                      <span className="uppercase">{p.method}</span>
                      <span>{formatINR(toRupees(p.amountPaise))}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="text-center text-xs text-zinc-400 mt-2">Server-calculated totals · Thank you!</div>
          </div>

          <div className="flex gap-1.5 mt-3 print:hidden">
            <Button variant="secondary" className="flex-1" icon={<Printer size={15} />} onClick={() => window.print()}>
              Print
            </Button>
            <Badge variant="neutral">{order.status}</Badge>
          </div>

          {canRefund && order.status === 'completed' && payments.length > 0 && (
            <div className="mt-3 rounded-2xl border border-zinc-200 p-3 print:hidden">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Refund a payment</div>
              {refundId == null ? (
                <ul className="space-y-1.5">
                  {payments.map((p) => (
                    <li key={p.paymentId}>
                      <button
                        onClick={() => {
                          setRefundId(p.paymentId);
                          setRefundAmount(toRupees(p.amountPaise).toFixed(2));
                          setRefundMsg(null);
                        }}
                        className="w-full flex justify-between items-center rounded-xl border border-zinc-200 px-3 py-2 text-sm hover:border-zinc-400"
                      >
                        <span className="uppercase font-semibold flex items-center gap-1.5">
                          <Undo2 size={13} /> {p.method}
                        </span>
                        <span className="tabular-nums font-bold">{formatINR(toRupees(p.amountPaise))}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="space-y-2">
                  <Input label="Refund amount (₹)" inputMode="decimal" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
                  <div className="flex gap-1.5">
                    <Button variant="secondary" className="flex-1" onClick={() => setRefundId(null)}>
                      Back
                    </Button>
                    <Button variant="danger" className="flex-1" loading={refunding} onClick={submitRefund}>
                      Confirm refund
                    </Button>
                  </div>
                </div>
              )}
              {refundMsg && <p className="text-xs mt-2 rounded-xl bg-stone-100 px-2.5 py-1.5">{refundMsg}</p>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
