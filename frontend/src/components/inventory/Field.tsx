export function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-[var(--text-muted)] mb-0.5">{label}</p>
      <p className="text-sm text-[var(--text)] font-medium">{value || '—'}</p>
    </div>
  );
}
