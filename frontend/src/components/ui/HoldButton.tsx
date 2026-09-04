import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/shadcn/button';

// Press-and-hold confirm for destructive touch actions.
// Fires onConfirm after holdMs of continuous press; shows progress ring.
export default function HoldButton({
  onConfirm,
  holdMs = 900,
  children,
  ...props
}: {
  onConfirm: () => void;
  holdMs?: number;
  children: React.ReactNode;
} & React.ComponentProps<typeof Button>) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef(0);
  const doneRef = useRef(false);

  const cancel = () => {
    cancelAnimationFrame(rafRef.current);
    setProgress(0);
    doneRef.current = false;
  };

  const begin = () => {
    doneRef.current = false;
    startRef.current = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - startRef.current) / holdMs);
      setProgress(p);
      if (p >= 1 && !doneRef.current) {
        doneRef.current = true;
        onConfirm();
        setProgress(0);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => cancel, []);

  return (
    <Button
      {...props}
      title={`${typeof children === 'string' ? children : 'Hold to confirm'} (hold)`}
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: 'relative', overflow: 'hidden', ...props.style }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute', inset: 0, width: `${progress * 100}%`,
          background: 'rgba(255,255,255,0.25)', pointerEvents: 'none',
        }}
      />
      <span style={{ position: 'relative' }}>{children}</span>
    </Button>
  );
}
