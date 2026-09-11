import { Play } from 'lucide-react';
import Button from '../ui/Button';
import { Modal } from '../ui/Modal';
import { formatINR } from '../../services/posService';
import type { HeldOrder } from './types';

export default function HoldDrawer({
  open,
  onClose,
  held,
  onResume,
  resumingId,
}: {
  open: boolean;
  onClose: () => void;
  held: HeldOrder[];
  onResume: (h: HeldOrder) => void;
  resumingId: number | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title={`Held orders (${held.length})`} size="sm">
      {held.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-4">No held orders on this terminal.</p>
      ) : (
        <ul className="space-y-1.5">
          {held.map((h) => (
            <li key={h.id} className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">#{h.orderNumber}</div>
                <div className="text-xs text-zinc-500 tabular-nums">
                  {formatINR(h.total)} · held {new Date(h.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <Button size="sm" variant="secondary" icon={<Play size={13} />} loading={resumingId === h.id} onClick={() => onResume(h)}>
                Resume
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
