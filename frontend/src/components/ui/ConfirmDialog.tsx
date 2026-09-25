import { useEffect, useId, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open, title, message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
      if (e.key === 'Tab' && containerRef.current) {
        const focusable = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        ).filter((el) => !(el as HTMLButtonElement).disabled && el.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      containerRef.current?.querySelector<HTMLElement>('button')?.focus();
    }, 30);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      prevFocusRef.current?.focus?.();
      prevFocusRef.current = null;
    };
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div ref={containerRef} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}>
        <div className="p-6 text-center">
          <div className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-4 ${danger ? 'bg-red-100' : 'bg-amber-100'}`} aria-hidden>
            <AlertTriangle size={24} className={danger ? 'text-red-600' : 'text-amber-600'} />
          </div>
          <h3 id={titleId} className="font-bold text-lg text-zinc-900">{title}</h3>
          <p id={descId} className="text-sm text-zinc-500 mt-2">{message}</p>
        </div>
        <div className="flex border-t">
          <button type="button" onClick={onCancel} className="flex-1 px-4 py-3.5 min-h-[48px] text-sm font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className={`flex-1 px-4 py-3.5 min-h-[48px] text-sm font-semibold border-l transition-colors ${
              danger
                ? 'text-red-600 hover:bg-red-50'
                : 'text-zinc-900 hover:bg-zinc-50'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
