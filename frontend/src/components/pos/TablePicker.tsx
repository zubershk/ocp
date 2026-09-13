import { useQuery } from '@tanstack/react-query';
import { posApi, type PosTable } from '../../services/posService';

const statusStyle: Record<PosTable['status'], string> = {
  free: 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:border-emerald-500',
  occupied: 'bg-zinc-100 border-zinc-200 text-zinc-400 cursor-not-allowed',
  reserved: 'bg-amber-50 border-amber-300 text-amber-800 cursor-not-allowed',
  dirty: 'bg-red-50 border-red-200 text-red-400 cursor-not-allowed',
};

const statusLabel: Record<PosTable['status'], string> = {
  free: 'Free',
  occupied: 'Busy',
  reserved: 'Reserved',
  dirty: 'Dirty',
};

export default function TablePicker({
  selected,
  onSelect,
  outletId,
}: {
  selected: number;
  onSelect: (id: number) => void;
  outletId: number | null;
}) {
  const q = useQuery({
    queryKey: ['pos-tables', outletId ?? 0],
    queryFn: posApi.getTables,
    staleTime: 10_000,
    retry: 1,
  });
  const tables = (q.data ?? []).filter((t) => t.active);

  if (q.isLoading) {
    return <div className="grid grid-cols-4 gap-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded-2xl bg-zinc-100 animate-pulse" />)}</div>;
  }
  if (q.isError) {
    return (
      <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-700 font-medium">
        Tables unavailable.{' '}
        <button className="font-bold underline" onClick={() => q.refetch()}>Retry</button>
      </div>
    );
  }
  if (tables.length === 0) {
    return <div className="py-3 text-center text-sm text-zinc-400 font-medium">No tables at this outlet</div>;
  }

  return (
    <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Table">
      {tables.map((t) => {
        const active = selected === t.id;
        const usable = t.status === 'free' || active;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={!usable}
            onClick={() => onSelect(active ? 0 : t.id)}
            className={`h-12 rounded-2xl border-2 font-bold transition-all active:scale-95 ${
              active
                ? 'bg-zinc-950 text-white border-zinc-950'
                : statusStyle[t.status]
            }`}
            title={`${t.name} · ${statusLabel[t.status]} · seats ${t.capacity}`}
          >
            <div className="text-sm leading-none">{t.name}</div>
            <div className="text-[10px] opacity-70 font-semibold mt-0.5">{active ? 'Selected' : statusLabel[t.status]}</div>
          </button>
        );
      })}
    </div>
  );
}
