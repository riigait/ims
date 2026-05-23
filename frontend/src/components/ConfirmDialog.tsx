import { AlertCircle, X } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDangerous?: boolean;
}

export default function ConfirmDialog({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isDangerous = false,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in">
      <div className="bg-[var(--surface)] rounded-xl shadow-2xl max-w-sm w-full mx-4 animate-in zoom-in">
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${isDangerous ? 'bg-red-100 dark:bg-red-950' : 'bg-blue-100 dark:bg-blue-950'}`}>
              <AlertCircle size={20} className={isDangerous ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-[var(--text)]">{title}</h2>
            </div>
            <button
              onClick={onCancel}
              className="text-[var(--text-muted)] hover:text-[var(--text)] transition"
              aria-label="Close dialog"
            >
              <X size={20} />
            </button>
          </div>

          {/* Message */}
          <p className="text-[var(--text-muted)] leading-relaxed">{message}</p>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--border)] text-[var(--text)] font-medium hover:bg-[var(--surface-2)] transition"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-white transition ${
                isDangerous
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)]'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
