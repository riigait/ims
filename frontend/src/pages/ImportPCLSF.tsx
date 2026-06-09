import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Download, Upload } from 'lucide-react';
import api, {
  categoriesApi,
  exportRequestsApi,
  floorPlansApi,
  locationsApi,
  productsApi,
  stockDetailsApi,
  stockMovementsApi,
} from '@/services/api';
import { convertToCSV, parseCSV } from '@/utils/csv';
import DataPageLayout from '@/components/layout/DataPageLayout';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';

type ImportType = 'products' | 'categories' | 'locations' | 'floor-plans' | 'unknown';
type ExportType = 'products' | 'categories' | 'locations' | 'floor-plans' | 'stock-movements' | 'inventory-items';
type UnifiedType = 'products' | 'categories' | 'locations' | 'floor-plans';
type Tab = 'import' | 'export' | 'corrector';
type CsvRow = Record<string, string>;

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
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.role === 'superadmin') return <Navigate to="/dashboard" replace />;

  const [activeTab, setActiveTab] = useState<Tab>(user.role === 'staff' ? 'corrector' : 'import');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState<ExportType | 'unified' | null>(null);
  const [correctorFile, setCorrectorFile] = useState<File | null>(null);
  const [correctorLoading, setCorrectorLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [exportMessage, setExportMessage] = useState('');
  const [correctorMessage, setCorrectorMessage] = useState('');
  const [departments, setDepartments] = useState<any[]>([]);
  const [importDeptId, setImportDeptId] = useState('');
  const [deptSearch, setDeptSearch] = useState('');

  const currentDeptId = localStorage.getItem('currentDepartmentId');
  const showDeptSelector = !currentDeptId || currentDeptId === ALL_DEPARTMENTS_ID;

  useEffect(() => {
    if (!showDeptSelector) return;
    const assigned = [
      ...(user.adminDepartments || []),
      ...(user.staffDepartments || []),
    ].map((ad: any) => ad.department).filter(Boolean);
    const seen = new Set<string>();
    setDepartments(assigned.filter((d: any) => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    }));
  }, []);

  const normalizeCsvHeader = (value: string) =>
    value.replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim().toLowerCase().replace(/\s+/g, ' ');

  const detectImportType = (headers: string[]): ImportType => {
    const headerSet = new Set(headers.map(normalizeCsvHeader));
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

  const timestampForFilename = () => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
      '-',
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join('');
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
      const marker = line.replace(/^\uFEFF/, '').trim().match(/^#IMS_SECTION\s*,\s*(products|categories|locations|floor-plans)$/i);
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

  const parseCsvRows = (csvContent: string): CsvRow[] => {
    const rows: string[][] = [];
    let field = '';
    let row: string[] = [];
    let inQuotes = false;

    for (let i = 0; i < csvContent.length; i++) {
      const char = csvContent[i];
      const next = csvContent[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(field);
        field = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') i++;
        row.push(field);
        if (row.some(value => value.trim())) rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }

    row.push(field);
    if (row.some(value => value.trim())) rows.push(row);

    const headers = rows[0]?.map(header => header.trim()) || [];
    return rows.slice(1).map(values => {
      const item: CsvRow = {};
      headers.forEach((header, index) => {
        if (header && values[index] !== undefined) item[header] = values[index].trim();
      });
      return item;
    });
  };

  const slug = (value: string, fallback: string) => {
    const cleaned = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    return cleaned || fallback;
  };

  const getCsvValue = (row: CsvRow, ...headers: string[]) => {
    const normalizedHeaders = headers.map(normalizeCsvHeader);
    const key = Object.keys(row).find(header => normalizedHeaders.includes(normalizeCsvHeader(header)));
    return key ? row[key] : '';
  };

  const isInventoryListCsv = (csvContent: string) => {
    const headers = new Set(csvContent.split(/\r?\n/)[0]?.split(',').map(normalizeCsvHeader) || []);
    return headers.has('description') || headers.has('item name') || headers.has('product name') || headers.has('name');
  };

  const convertInventoryListToUnifiedCsv = (csvContent: string, sourceFileName?: string) => {
    const rows = parseCsvRows(csvContent);
    const now = new Date().toISOString();
    const locations = new Map<string, CsvRow>();
    const categories = new Map<string, CsvRow>();
    const products: CsvRow[] = [];

    rows.forEach((row, index) => {
      const description = getCsvValue(row, 'Description', 'Product Name', 'Name', 'Item Name');
      if (!description.trim()) return;

      const fileBaseName = sourceFileName ? sourceFileName.replace(/\.[^/.]+$/, '') : '';
      const categoryName = getCsvValue(row, 'Category', 'Category Name', 'Kind') || fileBaseName || 'Imported Items';
      const categoryId = `csv-cat-${slug(categoryName, 'imported-items')}`;
      categories.set(categoryId, {
        id: categoryId,
        name: categoryName,
        description: 'Items converted from inventory CSV',
        departmentId: '',
        createdAt: now,
        updatedAt: now,
      });

      const locationName = getCsvValue(row, 'Location', 'Current Location', 'Location Name', 'Place', 'Room', 'Area') || 'Unassigned';
      const locationId = `csv-loc-${slug(locationName, `location-${index + 1}`)}`;
      locations.set(locationId, {
        id: locationId,
        name: locationName,
        type: getCsvValue(row, 'Location Type') || 'room',
        parentId: '',
        departmentId: '',
        notes: '',
        createdAt: now,
        updatedAt: now,
        parent: '',
        children: '[]',
      });

      const countRaw = getCsvValue(row, 'Count', 'Quantity', 'Opening Stock', 'Current Stock', 'Stock');
      const count = Number.parseInt(countRaw || '', 10);
      const stock = Number.isFinite(count) && count > 0 ? count : 1;
      const lowStockRaw = Number.parseInt(getCsvValue(row, 'Low Stock Threshold') || '', 10);
      const lowStock = Number.isFinite(lowStockRaw) && lowStockRaw > 0 ? String(lowStockRaw) : '1';
      const unit = getCsvValue(row, 'Unit') || 'pcs';
      const supplier = getCsvValue(row, 'Supplier', 'Vendor', 'Supplier / Vendor', 'Brand');
      const unitPriceRaw = getCsvValue(row, 'Unit Cost', 'Unit Price', 'Cost');
      const unitPrice = unitPriceRaw ? String(Number.parseFloat(unitPriceRaw.replace(/[^0-9.]/g, '')) || '') : '';
      const rawStatus = getCsvValue(row, 'Status', 'Stock Status').toLowerCase();
      const statusMap: Record<string, string> = { discontinued: 'discontinued', obsolete: 'obsolete', inactive: 'discontinued', 'on-backorder': 'on-backorder', 'on backorder': 'on-backorder' };
      const status = statusMap[rawStatus] || 'active';
      const expiryDate = getCsvValue(row, 'Warranty Expiry', 'License Expiration', 'Expiry Date', 'License End Date');
      const leadTimeDays = getCsvValue(row, 'Lead Time Days', 'Lead Time');

      const notesFields: Array<[string, string]> = [
        ['Model', getCsvValue(row, 'Model', 'Model Number')],
        ['Serial', getCsvValue(row, 'Serial Number')],
        ['MAC', getCsvValue(row, 'MAC ID', 'MAC Address', 'Mac ID')],
        ['Asset Tag', getCsvValue(row, 'Asset Tag', 'Asset ID', 'Inventory ID')],
        ['Barcode', getCsvValue(row, 'Barcode')],
        ['Condition', getCsvValue(row, 'Condition')],
        ['Custodian', getCsvValue(row, 'Custodian', 'Assigned To')],
        ['Device Type', getCsvValue(row, 'Device Type', 'Item Type', 'Kind')],
        ['IMEI 1', getCsvValue(row, 'IMEI 1')],
        ['IMEI 2', getCsvValue(row, 'IMEI 2')],
        ['Color', getCsvValue(row, 'Color')],
        ['Processor', getCsvValue(row, 'Processor')],
        ['RAM', getCsvValue(row, 'RAM')],
        ['Storage', getCsvValue(row, 'Storage')],
        ['OS', getCsvValue(row, 'Operating System')],
        ['License Key', getCsvValue(row, 'License Key')],
        ['License Type', getCsvValue(row, 'License Type')],
        ['Warranty Notes', getCsvValue(row, 'Warranty Notes')],
        ['Account Name', getCsvValue(row, 'Account Name')],
        ['Account No', getCsvValue(row, 'Account Number', 'Account No')],
        ['Telephone', getCsvValue(row, 'Telephone Number', 'Telephone', 'Phone Number', 'Phone')],
        ['Plan', getCsvValue(row, 'Plan')],
        ['Address', getCsvValue(row, 'Address')],
        ['Speed', getCsvValue(row, 'Speed')],
        ['Department', getCsvValue(row, 'Department')],
        ['Remarks', getCsvValue(row, 'Remarks', 'Note', 'Notes')],
      ];
      const notes = notesFields.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('; ');

      products.push({
        sku: getCsvValue(row, 'SKU', 'Product Code'),
        name: description.slice(0, 80),
        description,
        categoryId,
        category: '',
        departmentId: '',
        department: '',
        unit,
        currentStock: String(stock),
        lowStockThreshold: lowStock,
        locationId,
        location: '',
        supplier,
        unitPrice,
        status,
        expiryDate,
        leadTimeDays,
        notes,
        createdAt: now,
        updatedAt: now,
      });
    });

    return [
      '#IMS_SECTION,categories',
      convertToCSV([...categories.values()]),
      '#IMS_SECTION,locations',
      convertToCSV([...locations.values()]),
      '#IMS_SECTION,products',
      convertToCSV(products),
      '#IMS_SECTION,floor-plans',
      'id,name,locationId,departmentId,width,height,planJson,createdAt,updatedAt,location',
      '',
    ].join('\n\n');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
    setResult(null);
    setError('');
  };

  const handleCorrectorFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCorrectorFile(e.target.files?.[0] || null);
    setCorrectorMessage('');
    setError('');
  };

  const handleCorrectCsv = async () => {
    if (!correctorFile) {
      setError('Please select a CSV file to correct');
      return;
    }

    try {
      setCorrectorLoading(true);
      const csvContent = await parseCSV(correctorFile);
      if (!isInventoryListCsv(csvContent)) {
        setError('CSV Corrector could not detect an inventory list. File must have a Description, Product Name, Name, or Item Name column.');
        return;
      }

      const corrected = convertInventoryListToUnifiedCsv(csvContent, correctorFile.name);
      const baseName = correctorFile.name.replace(/\.[^/.]+$/, '');
      downloadTextFile(corrected, `${baseName}-corrected-${timestampForFilename()}.csv`);
      setCorrectorMessage('Corrected CSV downloaded. Review it, then import it from the Import tab.');
    } catch {
      setError('Failed to correct CSV file.');
    } finally {
      setCorrectorLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) {
      setError('Please select a CSV file');
      return;
    }
    if (showDeptSelector && !importDeptId) {
      setError('Please select a department before importing.');
      return;
    }

    const savedDeptId = localStorage.getItem('currentDepartmentId');
    if (importDeptId) localStorage.setItem('currentDepartmentId', importDeptId);

    try {
      setLoading(true);
      const csvContent = await parseCSV(file);
      const unifiedSections = parseUnifiedCsv(csvContent);

      if (unifiedSections.length > 0) {
        let created = 0;
        const errors: ImportResult['errors'] = [];

        for (const section of unifiedSections) {
          const response = await api.post(getImportEndpoint(section.type), { csv: section.csv, fileName: file?.name });
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
        if (isInventoryListCsv(csvContent)) {
          const correctedSections = parseUnifiedCsv(convertInventoryListToUnifiedCsv(csvContent, file?.name));
          let created = 0;
          const errors: ImportResult['errors'] = [];

          for (const section of correctedSections) {
            const response = await api.post(getImportEndpoint(section.type), { csv: section.csv, fileName: file?.name });
            created += response.data.created || 0;
            (response.data.errors || []).forEach((err: { row: number; error: string }) => {
              errors.push({ row: err.row, error: `${TYPE_LABELS[section.type]}: ${err.error}` });
            });
          }

          setResult({
            type: 'unified',
            created,
            errors,
            message: `Corrected and imported ${created} records from ${correctedSections.length} sections${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
          });
          setError('');
          return;
        }

        setError('Could not detect CSV type. Please use Products, Categories, Locations, or unified IMS format.');
        return;
      }

      if (importType === 'floor-plans') {
        setError('Floor Plans are only imported through unified IMS export files.');
        return;
      }

      const response = await api.post(getImportEndpoint(importType), { csv: csvContent, fileName: file?.name });
      const data = response.data;

      setResult({
        type: importType,
        created: data.created,
        errors: data.errors || [],
        message: data.message,
      });
      setError('');
    } catch (err) {
      const message = (err as any).response?.data?.error || 'Failed to import file. Please check format and try again.';
      setError(message);
    } finally {
      if (importDeptId) {
        if (savedDeptId !== null) localStorage.setItem('currentDepartmentId', savedDeptId);
        else localStorage.removeItem('currentDepartmentId');
      }
      setLoading(false);
    }
  };

  const handleExport = async (type: ExportType) => {
    try {
      setExportLoading(type);
      setExportMessage('');
      const rows = normalizeRows(await getExportData(type));
      const csvData = convertToCSV(rows);
      await exportRequestsApi.create(type, `${TYPE_LABELS[type]} Export`, csvData);
      setExportMessage(`Export request submitted for ${TYPE_LABELS[type]}. Awaiting Superadmin approval. Check Requests page to download when approved.`);
    } catch {
      setError(`Failed to submit export request for ${TYPE_LABELS[type]}.`);
    } finally {
      setExportLoading(null);
    }
  };

  const handleUnifiedExport = async () => {
    try {
      setExportLoading('unified');
      setExportMessage('');
      const csv = await buildUnifiedCsv();
      await exportRequestsApi.create('unified', 'Unified IMS Export', csv);
      setExportMessage('Unified export request submitted. Awaiting Superadmin approval. Check Requests page to download when approved.');
    } catch {
      setError('Failed to submit unified export request.');
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
        {(['import', 'export', 'corrector'] as Tab[]).filter(tab => user.role === 'staff' ? tab === 'corrector' : true).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setError(''); setExportMessage(''); setCorrectorMessage(''); }}
            className={`px-4 py-2 text-sm font-medium capitalize ${activeTab === tab ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-2)]'}`}
          >
            {tab === 'corrector' ? 'CSV Corrector' : tab}
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

          {showDeptSelector && (
            <div className="bg-[var(--surface-2)] rounded-lg p-4 border border-amber-400">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-[var(--text)]">Import Department</h3>
                {importDeptId && (
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded font-medium">
                    {departments.find(d => d.id === importDeptId)?.name}
                  </span>
                )}
              </div>
              <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">
                Note: Select the proper department before importing. Records will be assigned to the selected department. Do not import under All Departments.
              </p>
              <input
                type="text"
                value={deptSearch}
                onChange={e => setDeptSearch(e.target.value)}
                placeholder="Search department..."
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)] mb-2"
              />
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {departments
                  .filter(d => d.name.toLowerCase().includes(deptSearch.toLowerCase()))
                  .map(d => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setImportDeptId(d.id)}
                      className={`text-left px-3 py-2 text-sm rounded-lg transition-colors ${
                        importDeptId === d.id
                          ? 'bg-[var(--primary)] text-white font-semibold'
                          : 'bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--border)]'
                      }`}
                    >
                      {d.name}
                      {d.description && <span className="text-xs opacity-60 ml-2">{d.description}</span>}
                    </button>
                  ))}
                {departments.filter(d => d.name.toLowerCase().includes(deptSearch.toLowerCase())).length === 0 && (
                  <p className="text-xs text-[var(--text-muted)] px-3 py-2">No departments found.</p>
                )}
              </div>
            </div>
          )}

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
      ) : activeTab === 'export' ? (
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
      ) : (
        <>
          <div>
            <h2 className="text-xl font-semibold mb-2 text-[var(--text)]">CSV Corrector</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Upload a raw inventory CSV. The app will convert it to the unified IMS CSV format, then download the corrected file.
            </p>
          </div>

          <div className="bg-[var(--surface-2)] rounded-lg p-4 border border-[var(--border)] text-sm text-[var(--text-muted)] space-y-3">
            <p className="font-medium text-[var(--text)]">Required columns for detection</p>
            <div className="space-y-2">
              <p className="text-[var(--text)]">1 of these as the main item column:</p>
              <ul className="list-disc list-inside space-y-0.5 ml-1">
                <li>Description</li>
                <li>Name</li>
                <li>Item Name</li>
                <li>Product Name</li>
              </ul>
            </div>
            <p>Extra columns (Supplier, Unit Cost, Warranty, Location, Category, etc.) are extracted automatically. A row continues only when its main item column has a value. Count defaults to 1 when blank.</p>
          </div>

          <div className="border-2 border-dashed border-[var(--border)] rounded-lg p-8 text-center">
            <Upload size={48} className="mx-auto mb-4 text-[var(--text-muted)]" />
            <label className="cursor-pointer">
              <span className="text-[var(--primary)] hover:text-[var(--primary-hover)] font-semibold">
                Click to select raw CSV file
              </span>
              <input type="file" accept=".csv" onChange={handleCorrectorFileSelect} disabled={correctorLoading} className="hidden" />
            </label>
            {correctorFile && <p className="mt-2 text-sm text-[var(--text-muted)]">Selected: {correctorFile.name}</p>}
          </div>

          <button
            onClick={handleCorrectCsv}
            disabled={!correctorFile || correctorLoading}
            className="w-full px-4 py-3 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)] disabled:opacity-50 font-semibold"
          >
            {correctorLoading ? 'Correcting...' : 'Correct and Download CSV'}
          </button>
        </>
      )}

      {error && <div className="p-4 bg-red-100 text-red-800 rounded-lg">Error: {error}</div>}
      {exportMessage && <div className="p-4 bg-green-100 text-green-800 rounded-lg">{exportMessage}</div>}
      {correctorMessage && <div className="p-4 bg-green-100 text-green-800 rounded-lg">{correctorMessage}</div>}

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
