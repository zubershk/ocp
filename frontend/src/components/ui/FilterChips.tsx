import { useRef } from 'react';

interface FilterChipsProps {
  filters: { id: string; label: string; icon?: React.ReactNode }[];
  active: string;
  onChange: (id: string) => void;
}

export default function FilterChips({ filters, active, onChange }: FilterChipsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4 snap-x snap-mandatory"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {filters.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className={`shrink-0 snap-start inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
            active === f.id
              ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/20'
              : 'bg-white text-zinc-600 border border-stone-200 hover:border-brand-300 hover:text-brand-600'
          }`}
        >
          {f.icon}
          {f.label}
        </button>
      ))}
    </div>
  );
}
