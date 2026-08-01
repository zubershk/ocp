import type { ReactNode } from 'react';

type BadgeVariant = 'success' | 'warning' | 'error' | 'neutral' | 'brand' | 'veg' | 'nonveg';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
  warning: 'bg-amber-50 text-amber-700 ring-amber-600/10',
  error: 'bg-red-50 text-red-700 ring-red-600/10',
  neutral: 'bg-stone-100 text-stone-600 ring-stone-500/10',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/10',
  veg: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
  nonveg: 'bg-red-50 text-red-700 ring-red-600/10',
};

const sizeStyles = {
  sm: 'text-[11px] px-2 py-0.5 gap-1',
  md: 'text-xs px-2.5 py-1 gap-1.5',
};

export default function Badge({ children, variant = 'neutral', size = 'sm', icon, className = '' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center font-semibold rounded-full ring-1 ring-inset
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
}
