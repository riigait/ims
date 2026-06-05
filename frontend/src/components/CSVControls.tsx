import { Download, Upload } from 'lucide-react';
import { parseCSV } from '@/utils/csv';
import { useState } from 'react';

interface CSVControlsProps {
  onExport: () => void;
  onImport: (csvContent: string) => Promise<void>;
  exportLabel?: string;
  importLabel?: string;
  isLoading?: boolean;
}

export default function CSVControls({
  onExport,
  onImport,
  exportLabel = 'Export CSV',
  importLabel = 'Import CSV',
  isLoading = false,
}: CSVControlsProps) {
  const [importing, setImporting] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      const csvContent = await parseCSV(file);
      await onImport(csvContent);
    } catch {
    } finally {
      setImporting(false);
      // Reset input
      e.target.value = '';
    }
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={onExport}
        disabled={isLoading}
        className="flex items-center gap-2 px-3 py-2 text-sm bg-[var(--surface-2)] text-[var(--text)] rounded hover:bg-[var(--border)] disabled:opacity-50"
        title="Download data as CSV file"
      >
        <Download size={16} />
        {exportLabel}
      </button>

      <label className="flex items-center gap-2 px-3 py-2 text-sm bg-[var(--surface-2)] text-[var(--text)] rounded hover:bg-[var(--border)] cursor-pointer disabled:opacity-50"
        title="Upload CSV file to import data">
        <Upload size={16} />
        {importLabel}
        <input
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          disabled={importing || isLoading}
          className="hidden"
        />
      </label>
    </div>
  );
}
