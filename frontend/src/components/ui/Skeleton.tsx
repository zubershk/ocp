interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'card';
}

export default function Skeleton({ className = '', variant = 'rectangular' }: SkeletonProps) {
  const base = 'animate-pulse bg-gradient-to-r from-stone-200 via-stone-100 to-stone-200 bg-[length:200%_100%] animate-shimmer';

  const variants = {
    text: `h-4 rounded-lg ${base}`,
    circular: `rounded-full ${base}`,
    rectangular: `rounded-xl ${base}`,
    card: `rounded-2xl ${base}`,
  };

  return <div className={`${variants[variant]} ${className}`} />;
}

export function MenuCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
      <Skeleton variant="rectangular" className="h-48 w-full rounded-none" />
      <div className="p-4 space-y-3">
        <Skeleton variant="text" className="w-3/4 h-5" />
        <Skeleton variant="text" className="w-full h-3" />
        <div className="flex justify-between items-center pt-2">
          <Skeleton variant="text" className="w-16 h-6" />
          <Skeleton variant="rectangular" className="w-20 h-8 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function OrderCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-stone-100 p-5 space-y-4">
      <div className="flex justify-between">
        <Skeleton variant="text" className="w-24 h-5" />
        <Skeleton variant="text" className="w-16 h-5" />
      </div>
      <Skeleton variant="text" className="w-full h-3" />
      <Skeleton variant="text" className="w-2/3 h-3" />
      <div className="flex gap-2">
        <Skeleton variant="rectangular" className="w-20 h-6 rounded-full" />
        <Skeleton variant="rectangular" className="w-16 h-6 rounded-full" />
      </div>
    </div>
  );
}
