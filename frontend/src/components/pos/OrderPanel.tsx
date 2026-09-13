import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pause, Play, ReceiptText, Tag, XCircle } from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { posApi, formatINR, describeDiscount, posErrorMessage, type PosOrder, type PosOrderType } from '../../services/posService';

function statusVariant(status: string): 'success' | 'warning' | 'error' | 'neutral' | 'brand' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'held':
      return 'warning';
    case 'cancelled':
      return 'error';
    case 'confirmed':
      return 'brand';
    default:
      return 'neutral';
  }
}

export default function OrderPanel({
  orderId,
  canDiscount,
  canManage,
  onHold,
  onResumeHeld,
  onCancel,
  onModify,
  holding,
  cancelling,
  notice,
  onOpenReceipt,
  onPay,
}: {
  orderId: number;
  canDiscount: boolean;
  canManage: boolean;
  onHold: () => void;
  onResumeHeld: () => void;
  onCancel: () => void;
  onModify: () => void;
  holding: boolean;
  cancelling: boolean;
  notice: string | null;
  onOpenReceipt: () => void;
  onPay: () => void;
}) {
  const [discountOpen, setDiscountOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);

  const orderQuery = useQuery({
    queryKey: ['pos-order', orderId],
    queryFn: () => posApi.getOrder(orderId),
    staleTime: 5 * 1000,
    retry: 1,
  });
  const discountsQuery = useQuery({
    queryKey: ['pos-discounts'],
    queryFn: posApi.getDiscounts,
    enabled: discountOpen,
    staleTime: 30 * 1000,
    retry: 1,
  });

  const order: PosOrder | undefined = orderQuery.data;
  const [mutating, setMutating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutate = async (label: string, fn: () => Promise<unknown>) => {
    setMutating(label);
    setError(null);
    try {
      await fn();
      await orderQuery.refetch();
    } catch (e) {
      const { status, message } = posErrorMessage(e);
      setError(status === 403 ? 'Not permitted for your role' : message);
    } finally {
      setMutating(null);
    }
  };

  return (
    <section aria-label="Order" className="rounded-3xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-bold text-sm">Order {order ? `#${order.order_number}` : `#${orderId}`}</h2>
        {order && <Badge variant={statusVariant(order.status)}>{order.status}</Badge>}
        {order && <Badge variant="neutral">{order.order_type.replace('_', ' ')}</Badge>}
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={onOpenReceipt} icon={<ReceiptText size={14} />}>
            Receipt
          </Button>
          <Button size="sm" variant="secondary" onClick={() => orderQuery.refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      {orderQuery.isLoading ? (
        <p className="text-sm text-zinc-500 py-6 text-center">Loading order…</p>
      ) : orderQuery.isError || !order ? (
        <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Order failed to load.{' '}
          <button className="font-bold underline" onClick={() => orderQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <dl className="mt-3 space-y-1 text-sm tabular-nums">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Subtotal</dt>
              <dd className="font-semibold">{formatINR(order.subtotal)}</dd>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <dt>Discount</dt>
                <dd className="font-semibold">−{formatINR(order.discount)}</dd>
              </div>
            )}
            {(order.tax_amount ?? 0) > 0 && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">Tax</dt>
                <dd className="font-semibold">{formatINR(order.tax_amount ?? 0)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-bold border-t border-zinc-100 pt-1.5">
              <dt>Total</dt>
              <dd>{formatINR(order.total)}</dd>
            </div>
          </dl>

          <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto">
            {(order.items ?? []).map((it, i) => (
              <li key={i} className="flex justify-between text-xs text-zinc-600">
                <span>
                  {it.quantity}× {it.name}
                  {it.size ? ` (${it.size}${it.crust ? ` + ${it.crust}` : ''})` : ''}
                </span>
                <span className="tabular-nums font-semibold">{formatINR(it.line_total)}</span>
              </li>
            ))}
          </ul>

          {(error ?? notice) && (
            <p className="mt-2 text-xs rounded-xl bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1.5">
              {error ?? notice}
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {order.status === 'held' ? (
              <Button size="sm" variant="secondary" icon={<Play size={14} />} loading={mutating === 'resume'} onClick={() => mutate('resume', () => posApi.resumeOrder(order.id).then(onResumeHeld))}>
                Resume
              </Button>
            ) : (
              <Button size="sm" variant="secondary" icon={<Pause size={14} />} loading={holding} onClick={onHold}>
                Hold
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={onModify}>
              Modify items
            </Button>
            {canDiscount && (
              <Button size="sm" variant="secondary" icon={<Tag size={14} />} onClick={() => setDiscountOpen(true)}>
                {order.discount > 0 ? 'Change discount' : 'Discount'}
              </Button>
            )}
            {canManage && (
              <Button size="sm" variant="secondary" onClick={() => setTypeOpen(true)}>
                Order type
              </Button>
            )}
            <Button
              size="sm"
              variant="danger"
              icon={<XCircle size={14} />}
              loading={cancelling}
              onClick={onCancel}
              className={canDiscount || canManage ? '' : 'col-span-2'}
            >
              Cancel order
            </Button>
            <Button size="sm" variant="primary" onClick={onPay} className="col-span-2">
              Take payment · {formatINR(order.total)}
            </Button>
          </div>
        </>
      )}

      <Modal open={discountOpen} onClose={() => setDiscountOpen(false)} title="Discount (register-calculated)" size="sm">
        {order && order.discount > 0 && (
          <Button
            variant="secondary"
            className="w-full mb-2"
            loading={mutating === 'rm-discount'}
            onClick={() => mutate('rm-discount', () => posApi.removeDiscount(order.id).then(() => setDiscountOpen(false)))}
          >
            Remove current discount ({formatINR(order.discount)})
          </Button>
        )}
        {discountsQuery.isLoading ? (
          <p className="text-sm text-zinc-500">Loading discounts…</p>
        ) : (discountsQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-zinc-500">No active discounts.</p>
        ) : (
          <ul className="space-y-1.5">
            {(discountsQuery.data ?? []).map((d) => (
              <li key={d.id}>
                <button
                  disabled={mutating != null}
                  onClick={() => order && mutate(`d-${d.id}`, () => posApi.applyDiscount(order.id, d.id).then(() => setDiscountOpen(false)))}
                  className="w-full text-left rounded-xl border border-zinc-200 px-3 py-2 hover:border-zinc-400 disabled:opacity-50 transition-colors"
                >
                  <div className="text-sm font-bold">{d.name}</div>
                  <div className="text-xs text-zinc-500">
                    {describeDiscount(d)}
                    {d.code ? ` · code ${d.code}` : ' · manual'}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {mutating != null && <p className="text-xs text-zinc-500 mt-2">Recalculating on the register…</p>}
      </Modal>

      <Modal open={typeOpen} onClose={() => setTypeOpen(false)} title="Order type" size="sm">
        <div className="grid grid-cols-3 gap-1.5">
          {(['dine_in', 'takeaway', 'delivery'] as PosOrderType[]).map((t) => (
            <Button
              key={t}
              variant="secondary"
              loading={mutating === `t-${t}`}
              onClick={() => order && mutate(`t-${t}`, () => posApi.updateOrderType(order.id, t).then(() => setTypeOpen(false)))}
            >
              {t.replace('_', ' ')}
            </Button>
          ))}
        </div>
      </Modal>
    </section>
  );
}
