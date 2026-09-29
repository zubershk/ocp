import { useQuery } from '@tanstack/react-query';
import Skeleton from '../ui/Skeleton';
import { posApi, formatINR, toRupees } from '../../services/posService';

export interface DiscountListProps {
  busy: boolean;
  onPick: (id: number) => void;
  onRemove: (() => void) | null;
}

export default function DiscountList({ busy, onPick, onRemove }: DiscountListProps) {
  const q = useQuery({ queryKey: ['pos-discounts'], queryFn: posApi.getDiscounts, staleTime: 30_000, retry: 1 });
  if (q.isLoading) return <div className="space-y-2" role="status" aria-live="polite" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>;
  if (q.isError) return <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 font-medium" role="alert">Couldn't load discounts. <button type="button" className="font-bold underline" onClick={() => q.refetch()}>Retry</button></div>;
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
