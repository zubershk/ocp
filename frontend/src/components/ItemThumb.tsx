import { Package } from 'lucide-react';

/**
 * ItemThumb renders a product image, falling back to a neutral tile when
 * there is no image.
 *
 * An empty string in `src` makes the browser resolve it to the current
 * page URL and re-download the whole page — React warns about it and
 * it hurts performance. So the <img> is only rendered when there is a
 * real source.
 */
export function ItemThumb({
  src,
  alt = '',
  className = '',
  iconSize = 20,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  iconSize?: number;
}) {
  if (!src || !src.trim()) {
    return (
      <div
        className={`flex items-center justify-center bg-orange-50 text-orange-300 shrink-0 ${className}`}
        aria-hidden="true"
      >
        <Package size={iconSize} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`object-cover bg-orange-50 shrink-0 ${className}`}
    />
  );
}
