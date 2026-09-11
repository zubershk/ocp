import { useState } from 'react';
import { Banknote, CreditCard, QrCode } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { Modal } from '../ui/Modal';
import {
  posApi,
  formatINR,
  toRupees,
  newIdempotencyKey,
  posErrorMessage,
  type PosOrder,
  type PosPayMethod,
} from '../../services/posService';
import type { RecordedPayment } from './types';

const METHODS: { value: PosPayMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'cash', label: 'Cash', icon: <Banknote size={16} /> },
  { value: 'upi', label: 'UPI', icon: <QrCode size={16} /> },
  { value: 'card', label: 'Card', icon: <CreditCard size={16} /> },
];

export default function PaymentPanel({
  order,
  orderOpen,
  duePaise,
  payments,
  onPaid,
  onCompleted,
  canPay,
}: {
  order: PosOrder;
  orderOpen: boolean;
  duePaise: number;
  payments: RecordedPayment[];
  onPaid: (p: RecordedPayment, duePaise: number) => void;
  onCompleted: () => void;
  canPay: boolean;
}) {
  const [dialog, setDialog] = useState(false);
  const [method, setMethod] = useState<PosPayMethod>('cash');
  const [amount, setAmount] = useState('');
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  // One key per cashier action, created when the dialog opens and kept
  // across retries: double-clicks and timeout replays collapse server-side.
  const [idemKey, setIdemKey] = useState(() => newIdempotencyKey());
  const [paying, setPaying] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dueRupees = toRupees(duePaise);
  const amountPaise = Math.round(Number(amount) * 100);
  const tenderedPaise = tendered === '' ? amountPaise : Math.round(Number(tendered) * 100);
  const changePaise = method === 'cash' && tendered !== '' ? tenderedPaise - amountPaise : 0;

  const openDialog = () => {
    setAmount(dueRupees > 0 ? dueRupees.toFixed(2) : '');
    setTendered('');
    setReference('');
    setError(null);
    setIdemKey(newIdempotencyKey());
    setDialog(true);
  };

  const submit = async () => {
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      setError('Enter a positive amount');
      return;
    }
    setPaying(true);
    setError(null);
    try {
      const r = await posApi.takePayment(
        order.id,
        { method, amountPaise, tenderedPaise, reference: reference.trim() },
        idemKey,
      );
      onPaid(
        { paymentId: r.payment_id, method, amountPaise, reference: reference.trim(), replayed: r.replayed, at: new Date().toISOString() },
        r.due_paise,
      );
      setDialog(false);
    } catch (e) {
      const { status, message } = posErrorMessage(e);
      setError(status === 403 ? 'Not permitted for your role' : message);
    } finally {
      setPaying(false);
    }
  };

  const complete = async () => {
    setCompleting(true);
    setError(null);
    try {
      await posApi.completeOrder(order.id);
      onCompleted();
    } catch (e) {
      setError(posErrorMessage(e).message);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <section aria-label="Payment" className="rounded-3xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <h2 className="font-bold text-sm">Payment</h2>
        <span className="ml-auto text-sm tabular-nums">
          Due <strong>{formatINR(dueRupees)}</strong>
        </span>
      </div>

      {payments.length > 0 && (
        <ul className="mt-2 space-y-1">
          {payments.map((p) => (
            <li key={p.paymentId} className="flex justify-between text-xs text-zinc-600 rounded-lg bg-stone-50 px-2.5 py-1.5">
              <span className="uppercase font-semibold">
                {p.method} {p.replayed ? '· replayed' : ''}
              </span>
              <span className="tabular-nums font-bold">{formatINR(toRupees(p.amountPaise))}</span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-2 text-xs rounded-xl bg-red-50 border border-red-200 text-red-700 px-2.5 py-1.5">{error}</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <Button size="sm" variant="primary" disabled={!canPay || !orderOpen || duePaise <= 0} onClick={openDialog}>
          {duePaise <= 0 ? 'Fully paid' : `Pay ${formatINR(dueRupees)}`}
        </Button>
        <Button size="sm" variant="secondary" disabled={!orderOpen || duePaise > 0} loading={completing} onClick={complete}>
          Complete order
        </Button>
      </div>
      {!canPay && <p className="text-[11px] text-zinc-400 mt-1.5">Your role cannot take payments.</p>}

      <Modal open={dialog} onClose={() => !paying && setDialog(false)} title={`Collect · due ${formatINR(dueRupees)}`} size="sm">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Method">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={method === m.value}
                onClick={() => setMethod(m.value)}
                className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                  method === m.value ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white border-zinc-200'
                }`}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>
          <Input label="Amount (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={dueRupees.toFixed(2)} />
          {method === 'cash' && (
            <Input label="Tendered (₹, optional)" inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} hint={changePaise !== 0 ? `Change due: ${formatINR(toRupees(changePaise))} (display only)` : undefined} />
          )}
          {method !== 'cash' && (
            <Input label={method === 'upi' ? 'UPI reference' : 'Card reference'} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="txn / auth id" />
          )}
          <Button className="w-full" size="lg" loading={paying} onClick={submit}>
            Record {Number.isFinite(amountPaise) && amountPaise > 0 ? formatINR(toRupees(amountPaise)) : ''} {method.toUpperCase()}
          </Button>
          <p className="text-[11px] text-zinc-400 text-center">Retries reuse the same request key — no double charge.</p>
        </div>
      </Modal>
    </section>
  );
}
