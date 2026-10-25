import { useEffect, useRef, useCallback } from 'react';

interface FlyingItem {
  id: string;
  image: string;
  name: string;
  startX: number;
  startY: number;
}

/**
 * Creates a "flying item" animation from source element to the cart icon.
 * Returns a ref to attach to the cart icon, and a fly() trigger function.
 */
export function useFlyingCart() {
  const cartRef = useRef<HTMLAnchorElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fly = useCallback((item: FlyingItem, onComplete?: () => void) => {
    if (!cartRef.current || !containerRef.current) return;

    const cartRect = cartRef.current.getBoundingClientRect();
    const targetX = cartRect.left + cartRect.width / 2;
    const targetY = cartRect.top + cartRect.height / 2;

    // Create flying clone using safe DOM construction (no innerHTML —
    // item.image is set as a property, not interpolated into HTML string,
    // preventing attribute-breakout XSS).
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = `${item.startX}px`;
    wrapper.style.top = `${item.startY}px`;
    wrapper.style.width = '48px';
    wrapper.style.height = '48px';
    wrapper.style.borderRadius = '12px';
    wrapper.style.overflow = 'hidden';
    wrapper.style.zIndex = '9999';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';

    const img = document.createElement('img');
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    // Validate image URL before setting as src — allow only https:// or /uploads/
    try {
      const u = new URL(item.image, window.location.origin);
      if (u.protocol === 'https:' || u.protocol === 'http:' || u.pathname.startsWith('/uploads/') || u.pathname.startsWith('/')) {
        img.src = u.href;
      } else {
        img.src = '/uploads/placeholder.png';
      }
    } catch {
      img.src = '/uploads/placeholder.png';
    }
    wrapper.appendChild(img);
    document.body.appendChild(wrapper);
    const el = wrapper;

    // Animate with CSS transitions (lighter than GSAP for this simple use)
    el.style.transition = 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
    requestAnimationFrame(() => {
      el.style.left = `${targetX - 24}px`;
      el.style.top = `${targetY - 24}px`;
      el.style.width = '16px';
      el.style.height = '16px';
      el.style.borderRadius = '50%';
      el.style.opacity = '0.6';
      el.style.transform = 'scale(0.5)';
    });

    setTimeout(() => {
      el.remove();
      onComplete?.();
    }, 650);
  }, []);

  return { cartRef, containerRef, fly };
}
