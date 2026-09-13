import { PauseCircle, Play, Search } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { formatINR, type PosOrderType } from '../../services/posService';
import type { HeldOrder } from './types';

const typeLabel: Record<string, string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
};

export default function HeldDrawer({
  open,
  onClose,
  held,
  orderTypes,
  onResume,
  resumingId,
}: {
  open: boolean;
  onClose: () => void;
  held: HeldOrder[];
  /** best-effort order_type cache per order id (may be incomplete) */
  orderTypes?: Record<number, PosOrderType>;
  onResume: (h: HeldOrder) => void;
  resumingId: number | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title={`Held orders · this outlet (${held.length})`} size="sm">
      {held.length === 0 ? (
        <div className="py-8 text-center">
          <PauseCircle size={28} className="mx-auto text-zinc-300 mb-2" />
          <div className="font-bold text-zinc-500">No held orders</div>
          <div className="text-sm text-zinc-400">Held orders for this outlet will show here.</div>
        </div>
      ) : (
        <ul className="space-y-2">
          {held.map((h) => (
            <li key={h.id} className="flex items-center gap-3 rounded-2xl border-2 border-zinc-100 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-bold">#{h.orderNumber}</div>
                <div className="text-xs text-zinc-500 font-semibold">
                  {typeLabel[orderTypes?.[h.id] ?? ''] ?? ''}
                  {orderTypes?.[h.id] ? ' · ' : ''}
                  {formatINR(h.total)} · {new Date(h.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onResume(h)}
                disabled={resumingId != null}
                className="h-11 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold text-sm inline-flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Play size={14} /> {resumingId === h.id ? 'Resuming…' : 'Resume'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {held.length > 4 && (
        <p className="text-[11px] text-zinc-400 text-center mt-2 inline-flex items-center gap-1 justify-center w-full">
          <Search size={11} /> Use order search to find older held orders.
        </p>
      )}
    </Modal>
  );
}
