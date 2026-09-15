import { cn } from '../lib/utils';

// ── Badge ──
export function Badge({ children, color = 'stone', className }) {
  const colors = { stone: 'bg-stone-100 text-zinc-600', brand: 'bg-brand-50 text-brand-700', green: 'bg-emerald-100 text-emerald-700', red: 'bg-red-100 text-red-600', blue: 'bg-blue-100 text-blue-700', amber: 'bg-amber-100 text-amber-700' };
  return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', colors[color], className)}>{children}</span>;
}

// ── Card composition (shadcn pattern on local tokens) ──
export function Card({ className, children }) {
  return <div className={cn('bg-white rounded-2xl border border-stone-200', className)}>{children}</div>;
}
export function CardHeader({ className, children }) {
  return <div className={cn('px-5 pt-4', className)}>{children}</div>;
}
export function CardTitle({ className, children }) {
  return <h3 className={cn('text-sm font-bold text-zinc-900', className)}>{children}</h3>;
}
export function CardDescription({ className, children }) {
  return <p className={cn('text-xs text-zinc-500 mt-0.5', className)}>{children}</p>;
}
export function CardContent({ className, children }) {
  return <div className={cn('px-5 pb-5 pt-3', className)}>{children}</div>;
}
