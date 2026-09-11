import { useQuery } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { posApi, getPosOutletId, setPosOutletId } from '../../services/posService';

export default function OutletSwitcher({
  outletId,
  onChange,
}: {
  outletId: number | null;
  onChange: (id: number | null) => void;
}) {
  const outletsQuery = useQuery({
    queryKey: ['pos-outlets'],
    queryFn: posApi.getOutlets,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const outlets = (outletsQuery.data ?? []).filter((o) => o.active);
  const current = outletId ?? getPosOutletId();

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <Store size={15} className="text-zinc-500 shrink-0" />
      <span className="sr-only">Outlet</span>
      <select
        aria-label="Outlet"
        className="h-9 rounded-xl border border-zinc-200 bg-white px-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500/30 max-w-44"
        value={current ?? ''}
        disabled={outletsQuery.isLoading || outlets.length === 0}
        onChange={(e) => {
          const v = e.target.value === '' ? null : Number.parseInt(e.target.value, 10);
          const id = v != null && Number.isFinite(v) ? v : null;
          setPosOutletId(id);
          onChange(id);
        }}
      >
        {outlets.length === 0 && <option value="">Outlet…</option>}
        {outlets.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
