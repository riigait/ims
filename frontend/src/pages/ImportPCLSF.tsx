import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import api, {
  categoriesApi,
  floorPlansApi,
  locationsApi,
  productsApi,
  stockDetailsApi,
  stockMovementsApi,
} from '@/services/api';
import { convertToCSV, downloadCsv, parseCSV } from '@/utils/csv';
import DataPageLayout from '@/components/layout/DataPageLayout';

type ImportType = 'products' | 'categories' | 'locations' | 'floor-plans' | 'unknown';
type ExportType = 'products' | 'categories' | 'locations' | 'floor-plans' | 'stock-movements' | 'inventory-items';
type UnifiedType = 'products' | 'categories' | 'locations' | 'floor-plans';
type Tab = 'import' | 'export';

interface ImportResult {
  type: ImportType | 'unified';
  created: number;
  errors: Array<{ row: number; error: string }>;
  message: string;
}

const IMPORT_TYPES: ImportType[] = ['products', 'categories', 'locations'];
const SOLO_EXPORT_TYPES: ExportType[] = ['products', 'categories', 'locations'];
const UNIFIED_TYPES: UnifiedType[] = ['categories', 'locations', 'products', 'floor-plans'];

const TYPE_LABELS: Record<ImportType | ExportType | 'unified', string> = {
  products: 'Products',
  categories: 'Categories',
  locations: 'Locations',
  'floor-plans': 'Floor Plans',
  'stock-movements': 'Stock Movements',
  'inventory-items': 'Inventory Items',
  unified: 'Unified',
  unknown: 'Unknown',
};

export default function ImportPCLSF() {
  const [activeTab, setActiveTab] = useState<Tab>('import');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState<ExportType | 'unified' | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [exportMessage, setExportMessage] = useState('');

  const detectImportType = (headers: string[]): ImportType => {
    const headerSet = new Set(headers.map(h => h.trim().toLowerCase()));
    const hasAll = (required: string[]) => required.every(header => headerSet.has(header));

    if (hasAll(['sku', 'name', 'categoryid'])) return 'products';
    if (hasAll(['name', 'type'])) return 'locations';
    if (headerSet.has('planjson')) return 'floor-plans';
    if (hasAll(['name', 'description'])) return 'categories';
    return 'unknown';
  };

  const getImportEndpoint = (type: ImportType | UnifiedType): string => {
    const endpoints: Partial<Record<ImportType | UnifiedType, string>> = {
      products: '/products/import/csv',
      categories: '/categories/import/csv',
      locations: '/locations/import/csv',
      'floor-plans': '/floor-plans/import/csv',
    };
    return endpoints[type] || '';
  };

  const getExportData = async (type: ExportType) => {
    if (type === 'products') return (await productsApi.getAll()).data;
    if (type === 'categories') return (await categoriesApi.getAll()).data;
    if (type === 'locations') return (await locationsApi.getAll()).data;
    if (type === 'floor-plans') return (await floorPlansApi.getAll()).data;
    if (type === 'stock-movements') return (await stockMovementsApi.getAll()).data;
    return (await stockDetailsApi.getAll()).data;
  };

  const normalizeValue = (value: any) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
  };

  const normalizeRows = (rows: any[]) => rows.map(row => {
    const normalized: Record<string, any> = {};
    Object.entries(row).forEach(([key, value]) => {
      normalized[key === 'objects' ? 'planJson' : key] = normalizeValue(value);
    });
    return normalized;
  });

  const downloadTextFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const buildUnifiedCsv = async () => {
    const sections: string[] = [];
    for (const type of UNIFIED_TYPES) {
      const rows = normalizeRows(await getExportData(type));
      sections.push(`#IMS_SECTION,${type}`);
      sections.push(convertToCSV(rows));
    }
    return `${sections.join('\n\n')}\n`;
  };

  const parseUnifiedCsv = (csvContent: string) => {
    const sections: Partial<Record<UnifiedType, string[]>> = {};
    let currentType: UnifiedType | null = null;

    csvContent.split(/\r?\n/).forEach(line => {
      const marker = line.match(/^#IMS_SECTION,(products|categories|locations|floor-plans)\s*$/);
      if (marker) {
        currentType = marker[1] as UnifiedType;
        sections[currentType] = [];
        return;
      }

      if (currentType && line.trim()) {
        sections[currentType]!.push(line);
      }
    });

    return UNIFIED_TYPES
      .filter(type => sections[type]?.length)
      .map(type => ({ type, csv: sections[type]!.join('\n') }));
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
      const unifiedSections = parseUnifiedCsv(csvContent);

      if (unifiedSections.length > 0) {
        let created = 0;
        const errors: ImportResult['errors'] = [];

        for (const section of unifiedSections) {
          const response = await api.post(getImportEndpoint(section.type), { csv: section.csv });
          created += response.data.created || 0;
          (response.data.errors || []).forEach((err: { row: number; error: string }) => {
            errors.push({ row: err.row, error: `${TYPE_LABELS[section.type]}: ${err.error}` });
          });
        }

        setResult({
          type: 'unified',
          created,
          errors,
          message: `Imported ${created} records from ${unifiedSections.length} sections${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
        });
        setError('');
        return;
      }

      const headers = csvContent.split('\n')[0].split(',').map(h => h.trim());
      const importType = detectImportType(headers);

      if (importType === 'unknown') {
        setError('Could not detect CSV type. Please use Products, Categories, Locations, or unified IMS format.');
        return;
      }

      if (importType === 'floor-plans') {
        setError('Floor Plans are only imported through unified IMS export files.');
        return;
      }

      const response = await api.post(getImportEndpoint(importType), { csv: csvContent });
      const data = response.data;

      setResult({
        type: importType,
        created: data.created,
        errors: data.errors || [],
        message: data.message,
      });
      setError('');
    } catch (err) {
      console.error('Import error:', err);
      const message = (err as any).response?.data?.error || 'Failed to import file. Please check format and try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (type: ExportType) => {
    try {
      setExportLoading(type);
      setExportMessage('');
      const rows = normalizeRows(await getExportData(type));
      downloadCsv(rows, `${type}-export.csv`);
      setExportMessage(`${TYPE_LABELS[type]} exported.`);
    } catch (err) {
      console.error('Export error:', err);
      setError(`Failed to export ${TYPE_LABELS[type]}.`);
    } finally {
      setExportLoading(null);
    }
  };

  const handleUnifiedExport = async () => {
    try {
      setExportLoading('unified');
      setExportMessage('');
      const csv = await buildUnifiedCsv();
      downloadTextFile(csv, 'ims-unified-export.csv');
      setExportMessage('Unified export downloaded as one CSV file.');
    } catch (err) {
      console.error('Unified export error:', err);
      setError('Failed to complete unified export.');
    } finally {
      setExportLoading(null);
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
      <div className="inline-flex rounded-lg border border-[var(--border)] overflow-hidden">
        {(['import', 'export'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setError(''); setExportMessage(''); }}
            className={`px-4 py-2 text-sm font-medium capitalize ${activeTab === tab ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)]'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'import' ? (
        <>
          <div>
            <h2 className="text-xl font-semibold mb-2 text-[var(--text)]">Unified Import</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Upload a solo Products, Categories, or Locations CSV, or one unified IMS CSV.
            </p>
          </div>

          <div className="bg-[var(--surface-2)] rounded-lg p-4 border border-[var(--border)]">
            <h3 className="font-semibold text-[var(--text)] mb-3">Templates</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {IMPORT_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => downloadTemplate(type)}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-[var(--surface)] text-[var(--text)] rounded hover:bg-[var(--border)] text-left"
                >
                  <Download size={14} />
                  {TYPE_LABELS[type]}
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
              <input type="file" accept=".csv" onChange={handleFileSelect} disabled={loading} className="hidden" />
            </label>
            {file && <p className="mt-2 text-sm text-[var(--text-muted)]">Selected: {file.name}</p>}
          </div>

          <button
            onClick={handleImport}
            disabled={!file || loading}
            className="w-full px-4 py-3 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] disabled:opacity-50 font-semibold"
          >
            {loading ? 'Importing...' : 'Import CSV'}
          </button>
        </>
      ) : (
        <>
          <div>
            <h2 className="text-xl font-semibold mb-2 text-[var(--text)]">Export Data</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Export one setup dataset, or download one unified CSV for Categories, Locations, Products, and Floor Plans.
            </p>
          </div>

          <button
            onClick={handleUnifiedExport}
            disabled={!!exportLoading}
            className="w-full px-4 py-3 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] disabled:opacity-50 font-semibold"
          >
            {exportLoading === 'unified' ? 'Exporting...' : 'Unified Export'}
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {SOLO_EXPORT_TYPES.map(type => (
              <button
                key={type}
                onClick={() => handleExport(type)}
                disabled={!!exportLoading}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] rounded hover:bg-[var(--border)] disabled:opacity-50 text-left"
              >
                <Download size={14} />
                {exportLoading === type ? 'Exporting...' : `Export ${TYPE_LABELS[type]}`}
              </button>
            ))}
          </div>
        </>
      )}

      {error && <div className="p-4 bg-red-100 text-red-800 rounded-lg">Error: {error}</div>}
      {exportMessage && <div className="p-4 bg-green-100 text-green-800 rounded-lg">{exportMessage}</div>}

      {result && (
        <div className={`p-4 rounded-lg ${result.errors.length === 0 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
          <h3 className="font-semibold mb-2">Success: {TYPE_LABELS[result.type]} Import Result</h3>
          <p className="mb-3">{result.message}</p>
          {result.errors.length > 0 && (
            <div className="mt-3 text-sm">
              <p className="font-semibold mb-2">Errors:</p>
              <ul className="list-disc list-inside space-y-1">
                {result.errors.slice(0, 5).map((err, idx) => (
                  <li key={idx}>Row {err.row}: {err.error}</li>
                ))}
                {result.errors.length > 5 && <li>... and {result.errors.length - 5} more errors</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <DataPageLayout
      title="Data Import / Export"
      error=""
      showForm
      onAddClick={() => undefined}
      showAddButton={false}
      formContent={formContent}
      filterContent={null}
    >
      <div />
    </DataPageLayout>
  );
}
