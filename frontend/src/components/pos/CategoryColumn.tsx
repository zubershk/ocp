import { useQuery } from '@tanstack/react-query';
import { posApi } from '../../services/posService';

export interface CategoryColumnProps {
  selected: string;
  onSelect: (id: string) => void;
}

export default function CategoryColumn({ selected, onSelect }: CategoryColumnProps) {
  const catQuery = useQuery({
    queryKey: ['pos-categories'],
    queryFn: () => posApi.getCategories(),
    staleTime: 60_000,
  });
  const cats = catQuery.data ?? [];
  return (
    <div className="p-2 space-y-0.5">
      <button type="button" aria-pressed={selected === 'all'} onClick={() => onSelect('all')} className={`w-full text-left px-2 py-2 rounded text-xs font-bold flex justify-between items-center ${selected === 'all' ? 'bg-[var(--pos-accent,#b91c1c)] text-white' : 'hover:bg-zinc-50 text-zinc-700'}`}>
        <span>All Items</span><span className="text-2xs bg-white/20 px-1.5 py-0.5 rounded">{cats.length}</span>
      </button>
      {cats.map((c: { id: number; name: string; isDeliverable?: boolean }) => (
        <button
          type="button"
          key={c.id}
          onClick={() => onSelect(String(c.id))}
          aria-pressed={selected === String(c.id)}
          className={`w-full text-left px-2 py-2 rounded text-xs flex justify-between items-center border-b border-zinc-100 last:border-0 ${selected === String(c.id) ? 'bg-zinc-900 text-white border-zinc-900' : 'hover:bg-zinc-50 text-zinc-700'}`}
        >
          <span className="truncate">{c.name}{c.isDeliverable ? ' [D]' : ''}</span>
          <span className={`w-1.5 h-6 rounded ${selected === String(c.id) ? 'bg-white' : 'bg-emerald-500'}`} aria-hidden />
        </button>
      ))}
      {catQuery.isLoading && <p className="px-2 py-2 text-xs text-zinc-400">Loading…</p>}
    </div>
  );
}
