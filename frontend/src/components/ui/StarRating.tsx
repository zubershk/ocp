import { Star, StarHalf } from 'lucide-react';

interface StarRatingProps {
  rating: number;
  count?: number;
  size?: number;
  showCount?: boolean;
  className?: string;
}

export default function StarRating({ rating, count, size = 14, showCount = true, className = '' }: StarRatingProps) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.3;
  const empty = 5 - full - (hasHalf ? 1 : 0);

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: full }).map((_, i) => (
          <Star key={`f${i}`} size={size} className="text-amber-400 fill-amber-400" />
        ))}
        {hasHalf && <StarHalf size={size} className="text-amber-400 fill-amber-400" />}
        {Array.from({ length: empty }).map((_, i) => (
          <Star key={`e${i}`} size={size} className="text-stone-200" />
        ))}
      </div>
      {showCount && count !== undefined && (
        <span className="text-xs text-zinc-500 font-medium">({count})</span>
      )}
    </div>
  );
}
