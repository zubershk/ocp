/**
 * ComboBreakdown renders the items a customer chose inside a combo.
 *
 * A combo line is billed at the combo price; this is the breakdown of
 * WHAT was picked, so the customer can check their choices at checkout,
 * on their order page and on the receipt — and so the kitchen knows
 * what to prepare.
 */

export interface ComboPick {
  name: string;
  size?: string;
  quantity: number;
}

export function ComboBreakdown({
  picks,
  dense = false,
  className = '',
}: {
  picks: ComboPick[];
  dense?: boolean;
  className?: string;
}) {
  if (!picks || picks.length === 0) return null;
  return (
    <ul className={`mt-1 space-y-0.5 ${className}`}>
      {picks.map((p, i) => (
        <li
          key={`${p.name}-${p.size ?? ''}-${i}`}
          className={`flex items-baseline gap-1.5 text-zinc-500 ${dense ? 'text-[11px]' : 'text-xs'}`}
        >
          <span className="font-semibold text-zinc-700 tabular-nums shrink-0">{p.quantity}×</span>
          <span className="truncate">{p.name}</span>
          {p.size && p.size !== 'regular' ? (
            <span className="text-zinc-400 shrink-0">({p.size})</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Normalises the two shapes the API uses for a combo breakdown. */
export function toComboPicks(
  raw: { name?: string; size?: string; quantity?: number }[] | undefined | null,
): ComboPick[] {
  if (!raw) return [];
  return raw
    .filter((p) => (p.quantity ?? 0) > 0)
    .map((p) => ({ name: p.name ?? '', size: p.size ?? '', quantity: p.quantity ?? 0 }));
}
