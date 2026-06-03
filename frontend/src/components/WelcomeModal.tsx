import { useState } from 'react';
import { X, Package, Boxes, ArrowLeftRight, MapPin, Bell, ChevronRight, ChevronLeft } from 'lucide-react';

const SLIDES = [
  {
    icon: Package,
    accent: 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400',
    title: 'Welcome to IMS',
    body: 'IMS is your central hub for managing physical inventory — products, equipment, and assets — across departments, locations, and warehouses.',
    tip: null,
  },
  {
    icon: Package,
    accent: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400',
    title: 'Products & Inventory Items',
    body: 'Products are your catalog — what you stock and how much. Inventory Items are the individual physical units with serial numbers, asset tags, and condition tracking.',
    tip: 'Tip: Use Bulk Add to add many products at once.',
  },
  {
    icon: ArrowLeftRight,
    accent: 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400',
    title: 'Stock Movements',
    body: 'Every time stock comes in, goes out, gets transferred, repaired, or deployed — record it here. Admins confirm pending movements before they are applied.',
    tip: 'Tip: Unconfirmed movements show up in your dashboard until approved.',
  },
  {
    icon: MapPin,
    accent: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400',
    title: 'Locations & Floor Plans',
    body: 'Locations are where items physically live — shelves, rooms, offices, warehouses. Floor Plans give you a visual map of your departments.',
    tip: 'Tip: From a Location drawer you can quickly add products to that location.',
  },
  {
    icon: Boxes,
    accent: 'bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400',
    title: 'Verify Your Inventory',
    body: 'Periodically verify your inventory items — physically check they exist and are in the right condition. Items not checked in 3 months show up as alerts.',
    tip: 'Tip: Use "Mark all as verified today" to bulk-verify your entire department.',
  },
  {
    icon: Bell,
    accent: 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400',
    title: 'Notifications & Alerts',
    body: 'The bell icon shows live alerts — low stock, warranty expiring, items not verified, damaged or lost items. Snooze an alert for 7 days if it\'s not urgent right now.',
    tip: 'Tip: "View Alerts" on the dashboard opens the notification panel directly.',
  },
];

function getUserId(): string {
  try { return JSON.parse(localStorage.getItem('user') || '{}').id || 'anon'; }
  catch { return 'anon'; }
}

export default function WelcomeModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;
  const Icon = slide.icon;

  const handleClose = () => {
    localStorage.setItem(`ims_welcome_seen_${getUserId()}`, '1');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--border)] w-full max-w-md flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-[var(--primary)]' : 'w-1.5 bg-[var(--border)]'}`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)]" aria-label="Close welcome guide">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 flex-1">
          <div className={`inline-flex p-3 rounded-xl mb-4 ${slide.accent}`}>
            <Icon size={24} />
          </div>
          <h2 className="text-lg font-bold text-[var(--text)] mb-2">{slide.title}</h2>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">{slide.body}</p>
          {slide.tip && (
            <p className="mt-3 text-xs text-[var(--primary)] font-medium">{slide.tip}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between gap-2">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="flex items-center gap-1 px-3 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={15} /> Back
          </button>
          <span className="text-xs text-[var(--text-muted)]">{step + 1} / {SLIDES.length}</span>
          {isLast ? (
            <button onClick={handleClose}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-opacity">
              Get started
            </button>
          ) : (
            <button onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-[var(--primary)] hover:opacity-70 transition-opacity">
              Next <ChevronRight size={15} />
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
