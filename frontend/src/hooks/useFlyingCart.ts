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

    // Create flying clone
    const clone = document.createElement('div');
    clone.innerHTML = `
      <div style="
        position: fixed;
        left: ${item.startX}px;
        top: ${item.startY}px;
        width: 48px;
        height: 48px;
        border-radius: 12px;
        overflow: hidden;
        z-index: 9999;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      ">
        <img src="${item.image}" style="width:100%;height:100%;object-fit:cover;" />
      </div>
    `;
    const el = clone.firstElementChild as HTMLElement;
    document.body.appendChild(el);

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
