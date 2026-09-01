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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden">
        <div className="p-6 text-center">
          <div className={`w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-4 ${danger ? 'bg-red-100' : 'bg-amber-100'}`}>
            <AlertTriangle size={24} className={danger ? 'text-red-600' : 'text-amber-600'} />
          </div>
          <h3 className="font-bold text-lg text-zinc-900">{title}</h3>
          <p className="text-sm text-zinc-500 mt-2">{message}</p>
        </div>
        <div className="flex border-t">
          <button onClick={onCancel} className="flex-1 px-4 py-3.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-3.5 text-sm font-semibold border-l transition-colors ${
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
