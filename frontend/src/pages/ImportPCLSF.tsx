import { useState } from 'react';
import { Upload, Download } from 'lucide-react';
import { parseCSV } from '@/utils/csv';
import DataPageLayout from '@/components/layout/DataPageLayout';

type ImportType = 'products' | 'categories' | 'locations' | 'stock-movements' | 'floor-plans' | 'unknown';

interface ImportResult {
  type: ImportType;
  created: number;
  errors: Array<{ row: number; error: string }>;
  message: string;
}

export default function ImportPCLSF() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const detectImportType = (headers: string[]): ImportType => {
    const headerSet = new Set(headers.map(h => h.toLowerCase()));

    // Products: has sku, name, categoryId, currentStock
    if (headerSet.has('sku') && headerSet.has('categoryid') && headerSet.has('currentstock')) {
      return 'products';
    }

    // Categories: has name, description (and not sku)
    if (headerSet.has('name') && headerSet.has('description') && !headerSet.has('sku')) {
      return 'categories';
    }

    // Locations: has name, type (location specific)
    if (headerSet.has('name') && headerSet.has('type') && (headerSet.has('parentid') || headers.length <= 5)) {
      return 'locations';
    }

    // Stock Movements: has productId, quantity, movementType
    if (headerSet.has('productid') && headerSet.has('quantity')) {
      return 'stock-movements';
    }

    // Floor Plans: has planJson
    if (headerSet.has('planjson')) {
      return 'floor-plans';
    }

    return 'unknown';
  };

  const getApiEndpoint = (type: ImportType): string => {
    const endpoints: Record<ImportType, string> = {
      products: '/api/products/import/csv',
      categories: '/api/categories/import/csv',
      locations: '/api/locations/import/csv',
      'stock-movements': '/api/stock-movements/import/csv',
      'floor-plans': '/api/floor-plans/import/csv',
      unknown: '',
    };
    return endpoints[type];
  };

  const getTypeLabel = (type: ImportType): string => {
    const labels: Record<ImportType, string> = {
      products: 'Products',
      categories: 'Categories',
      locations: 'Locations',
      'stock-movements': 'Stock Movements',
      'floor-plans': 'Floor Plans',
      unknown: 'Unknown',
    };
    return labels[type];
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
    setResult(null);
    setError('');
  };

  const handleImport = async () => {
    if (!file) {
      setError('Please select a CSV file');
      return;
    }

    try {
      setLoading(true);
      const csvContent = await parseCSV(file);
      const lines = csvContent.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());

      const importType = detectImportType(headers);

      if (importType === 'unknown') {
        setError('Could not detect CSV type. Please check format and try again.');
        return;
      }

      const endpoint = getApiEndpoint(importType);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvContent }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          type: importType,
          created: data.created,
          errors: data.errors || [],
          message: data.message,
        });
        setError('');
      } else {
        setError(data.error || 'Import failed');
      }
    } catch (err) {
      console.error('Import error:', err);
      setError('Failed to import file. Please check format and try again.');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = (type: string) => {
    const filename = `${type}-example.csv`;
    const link = document.createElement('a');
    link.href = `/templates/${filename}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formContent = (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4 text-[var(--text)]">
          Unified PCLSF Import
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Upload a CSV file and it will be automatically detected and imported to the correct page.
        </p>
      </div>

      <div className="bg-[var(--surface-2)] rounded-lg p-4 border border-[var(--border)]">
        <h3 className="font-semibold text-[var(--text)] mb-3">Supported Formats:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {['products', 'categories', 'locations', 'stock-movements', 'floor-plans'].map(type => (
            <button
              key={type}
              onClick={() => downloadTemplate(type)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-[var(--surface)] text-[var(--text)] rounded hover:bg-[var(--border)] text-left"
            >
              <Download size={14} />
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="border-2 border-dashed border-[var(--border)] rounded-lg p-8 text-center">
        <Upload size={48} className="mx-auto mb-4 text-[var(--text-muted)]" />
        <label className="cursor-pointer">
          <span className="text-[var(--primary)] hover:text-[var(--primary-hover)] font-semibold">
            Click to select CSV file
          </span>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            disabled={loading}
            className="hidden"
          />
        </label>
        {file && (
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Selected: {file.name}
          </p>
        )}
      </div>

      <button
        onClick={handleImport}
        disabled={!file || loading}
        className="w-full px-4 py-3 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] disabled:opacity-50 font-semibold"
      >
        {loading ? 'Importing...' : 'Import CSV'}
      </button>

      {error && (
        <div className="p-4 bg-red-100 text-red-800 rounded-lg">
          ❌ {error}
        </div>
      )}

      {result && (
        <div className={`p-4 rounded-lg ${result.errors.length === 0 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
          <h3 className="font-semibold mb-2">
            ✓ {getTypeLabel(result.type)} Import Result
          </h3>
          <p className="mb-3">{result.message}</p>
          {result.errors.length > 0 && (
            <div className="mt-3 text-sm">
              <p className="font-semibold mb-2">Errors:</p>
              <ul className="list-disc list-inside space-y-1">
                {result.errors.slice(0, 5).map((err, idx) => (
                  <li key={idx}>Row {err.row}: {err.error}</li>
                ))}
                {result.errors.length > 5 && (
                  <li>... and {result.errors.length - 5} more errors</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <DataPageLayout
      title="Import PCLSF Data"
      error={error}
      showForm={false}
      formContent={formContent}
      filterContent={null}
    >
      <div className="text-center py-12 text-[var(--text-muted)]">
        Use the form above to import data
      </div>
    </DataPageLayout>
  );
}
