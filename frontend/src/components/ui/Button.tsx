import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantStyles: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm hover:shadow-md active:bg-brand-800 focus-visible:ring-brand-500',
  secondary: 'bg-white text-zinc-700 border border-zinc-200 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/50 focus-visible:ring-brand-500',
  ghost: 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 focus-visible:ring-zinc-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm focus-visible:ring-red-500',
  outline: 'border-2 border-brand-600 text-brand-600 hover:bg-brand-600 hover:text-white focus-visible:ring-brand-500',
};

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-base rounded-xl gap-2.5',
  icon: 'h-10 w-10 rounded-xl p-0 justify-center',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', loading, icon, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          inline-flex items-center justify-center font-semibold
          transition-all duration-200 ease-out
          cursor-pointer select-none
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
          active:scale-[0.98]
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
