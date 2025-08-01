import { useEffect, useRef } from 'react';
import gsap from 'gsap';

/**
 * Staggered reveal animation for child elements.
 * Usage: <div ref={useGsapReveal('.item')}>{items.map(...)}</div>
 */
export function useGsapReveal(childSelector: string, options?: { y?: number; stagger?: number; duration?: number; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const children = ref.current.querySelectorAll(childSelector);
    if (!children.length) return;

    gsap.set(children, { opacity: 0, y: options?.y ?? 24 });
    const anim = gsap.to(children, {
      opacity: 1,
      y: 0,
      duration: options?.duration ?? 0.5,
      stagger: options?.stagger ?? 0.06,
      delay: options?.delay ?? 0.1,
      ease: 'power3.out',
      clearProps: 'transform',
    });
    return () => { anim.kill(); };
  }, [childSelector, options?.y, options?.stagger, options?.duration, options?.delay]);

  return ref;
}

/**
 * Single element fade-in on mount.
 */
export function useGsapFadeIn(options?: { y?: number; duration?: number; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    gsap.set(ref.current, { opacity: 0, y: options?.y ?? 20 });
    const anim = gsap.to(ref.current, {
      opacity: 1,
      y: 0,
      duration: options?.duration ?? 0.6,
      delay: options?.delay ?? 0,
      ease: 'power3.out',
      clearProps: 'transform',
    });
    return () => { anim.kill(); };
  }, []);

  return ref;
}

/**
 * Animate a number counting up.
 */
export function useGsapCountUp(target: number, options?: { duration?: number; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const obj = { val: 0 };
    const anim = gsap.to(obj, {
      val: target,
      duration: options?.duration ?? 1.2,
      delay: options?.delay ?? 0,
      ease: 'power2.out',
      onUpdate: () => {
        if (ref.current) ref.current.textContent = Math.round(obj.val).toLocaleString('en-IN');
      },
    });
    return () => { anim.kill(); };
  }, [target]);

  return ref;
}
