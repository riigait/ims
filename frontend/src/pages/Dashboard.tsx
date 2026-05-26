import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, Boxes, AlertCircle, MapPin,
  ArrowLeftRight, CheckCircle, AlertTriangle, Activity,
  DollarSign, Wrench, Clock, Tag, ScanLine, Plus, FileDown, Zap,
} from 'lucide-react';
import { dashboardApi, departmentsApi } from '@/services/api';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';
import { UNASSIGNED_LOCATION } from '@/utils/filterHelpers';

interface Stats {
  totalProducts: number;
  totalStock: number;
  totalInventoryItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  negativeStockCount: number;
  goodStockCount: number;
  totalLocations: number;
  unassignedLocationCount: number;
  unassignedLocationId: string | null;
  missingDetailsCount: number;
  totalFloorPlans: number;
  totalInventoryValue: number;
  itemsAvailable: number;
  itemsInUse: number;
  itemsForRepair: number;
  itemsLost: number;
  warrantyExpiringSoon: number;
  categoryBreakdown: { name: string; count: number; stock: number }[];
  locationBreakdown: { name: string; count: number }[];
}

const MOVEMENT_META: Record<string, { label: string; color: string; dot: string }> = {
  stock_in:      { label: 'Stock In',      color: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
  stock_out:     { label: 'Stock Out',     color: 'bg-red-100 text-red-700',       dot: 'bg-red-500' },
  adjustment:    { label: 'Adjustment',    color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500' },
  returned:      { label: 'Returned',      color: 'bg-teal-100 text-teal-700',     dot: 'bg-teal-500' },
  damaged:       { label: 'Damaged',       color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  transfer:      { label: 'Transfer',      color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  opening_stock: { label: 'Opening Stock', color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
  deployment:    { label: 'Deployment',    color: 'bg-cyan-100 text-cyan-700',     dot: 'bg-cyan-500' },
  repair:        { label: 'Repair',        color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  disposal:      { label: 'Disposal',      color: 'bg-gray-100 text-gray-700',     dot: 'bg-gray-500' },
  borrowed:      { label: 'Borrowed',      color: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
  lost:          { label: 'Lost',          color: 'bg-rose-100 text-rose-700',     dot: 'bg-rose-500' },
};

const BAR_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-green-500',
  'bg-orange-500', 'bg-teal-500', 'bg-rose-500',
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatValue(n: number) {
  if (n >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₱${(n / 1_000).toFixed(1)}K`;
  return `₱${n.toLocaleString()}`;
}

function formatMovementTitle(raw: string, itemCount: number): string {
  if (!raw || raw === '—') return `${itemCount} item${itemCount !== 1 ? 's' : ''}`;
  const names = raw.split(', ');
  const unique = [...new Set(names)];
  if (unique.length === 1 && names.length > 1) {
    return `${unique[0]} ×${names.length}`;
  }
  if (unique.length > 1) {
    const extra = unique.length - 1;
    return extra > 0 ? `${unique[0]} + ${extra} more` : unique[0];
  }
  return unique[0];
}

function StatCard({
  label, value, sub, icon: Icon, accent, onClick,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-[var(--surface)] rounded-xl p-4 text-left w-full shadow-sm border border-[var(--border)] hover:shadow-md hover:border-[var(--primary)] transition-all active:scale-95"
    >
      <div className="mb-3">
        <div className={`p-2 rounded-lg inline-flex ${accent}`}>
          <Icon size={18} />
        </div>
      </div>
      <p className="text-2xl font-bold text-[var(--text)] mb-0.5 leading-none">{value}</p>
      <p className="text-sm text-[var(--text-muted)] mt-1">{label}</p>
      {sub && <p className="text-xs text-[var(--text-muted)] mt-0.5 opacity-60">{sub}</p>}
    </button>
  );
}

function HealthBar({ good, low, out, negative }: { good: number; low: number; out: number; negative: number }) {
  const total = good + low + out + negative;
  if (total === 0) return <p className="text-sm text-[var(--text-muted)]">No products yet.</p>;
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 rounded-full overflow-hidden gap-px">
        {good     > 0 && <div className="bg-green-500"  style={{ width: pct(good) }}     title={`Good: ${good}`} />}
        {low      > 0 && <div className="bg-yellow-400" style={{ width: pct(low) }}      title={`Low: ${low}`} />}
        {out      > 0 && <div className="bg-red-500"    style={{ width: pct(out) }}      title={`Out: ${out}`} />}
        {negative > 0 && <div className="bg-purple-500" style={{ width: pct(negative) }} title={`Negative: ${negative}`} />}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /><span className="text-[var(--text-muted)]">Good</span> <span className="font-semibold text-[var(--text)]">{good}</span></span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /><span className="text-[var(--text-muted)]">Low</span> <span className="font-semibold text-[var(--text)]">{low}</span></span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /><span className="text-[var(--text-muted)]">Out</span> <span className="font-semibold text-[var(--text)]">{out}</span></span>
        {negative > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /><span className="text-[var(--text-muted)]">Neg</span> <span className="font-semibold text-purple-600">{negative}</span></span>}
      </div>
    </div>
  );
}

function BreakdownBar({ items, emptyLabel }: { items: { name: string; count: number }[]; emptyLabel?: string }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  if (items.length === 0 || total === 0) return <p className="text-sm text-[var(--text-muted)]">{emptyLabel ?? 'No data yet.'}</p>;
  if (items.length === 1) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] w-24 truncate flex-shrink-0" title={items[0].name}>{items[0].name}</span>
          <div className="flex-1 h-2 bg-[var(--border)] rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full w-full" />
          </div>
          <span className="text-xs font-semibold text-[var(--text)] w-8 text-right flex-shrink-0">{items[0].count}</span>
        </div>
        <p className="text-xs text-[var(--text-muted)] opacity-60">Only 1 category found</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={item.name} className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] w-24 truncate flex-shrink-0" title={item.name}>{item.name}</span>
          <div className="flex-1 h-2 bg-[var(--border)] rounded-full overflow-hidden">
            <div
              className={`h-full ${BAR_COLORS[i % BAR_COLORS.length]} rounded-full`}
              style={{ width: `${Math.round((item.count / total) * 100)}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-[var(--text)] w-8 text-right flex-shrink-0">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-2">{children}</p>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [stats, setStats] = useState<Stats>({
    totalProducts: 0, totalStock: 0, totalInventoryItems: 0,
    lowStockCount: 0, outOfStockCount: 0, negativeStockCount: 0, goodStockCount: 0,
    totalLocations: 0, unassignedLocationCount: 0, unassignedLocationId: null, missingDetailsCount: 0, totalFloorPlans: 0,
    totalInventoryValue: 0,
    itemsAvailable: 0, itemsInUse: 0, itemsForRepair: 0, itemsLost: 0,
    warrantyExpiringSoon: 0,
    categoryBreakdown: [],
    locationBreakdown: [],
  });
  const [recentMovements, setRecentMovements] = useState<any[]>([]);
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, movementsRes] = await Promise.all([
          dashboardApi.getStats(),
          dashboardApi.getRecentMovements(),
        ]);
        setStats(statsRes.data);
        setRecentMovements(movementsRes.data);

        const userDepts = user.role === 'admin' ? user.adminDepartments : user.staffDepartments;
        if (userDepts && userDepts.length > 0) {
          const currentDeptId = localStorage.getItem('currentDepartmentId');
          if (currentDeptId === ALL_DEPARTMENTS_ID) {
            setDepartmentName('All Departments');
          } else {
            const currentDept = userDepts.find((ad: any) => ad.departmentId === currentDeptId);
            setDepartmentName(currentDept?.department?.name ?? userDepts[0]?.department?.name ?? null);
          }
        } else if (user.departmentId) {
          try {
            const deptRes = await departmentsApi.getById(user.departmentId);
            setDepartmentName(deptRes.data.name);
          } catch { /* ignore */ }
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    fetchData();
    window.addEventListener('storage', fetchData);
    return () => window.removeEventListener('storage', fetchData);
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center space-y-3">
        <Activity size={32} className="text-[var(--primary)] mx-auto animate-pulse" />
        <p className="text-[var(--text-muted)] text-sm">Loading dashboard…</p>
      </div>
    </div>
  );

  const hasStockAlerts = stats.lowStockCount > 0 || stats.outOfStockCount > 0 || stats.negativeStockCount > 0;

  const stockAlertItems = [
    { label: 'Low Stock',    count: stats.lowStockCount,      color: 'text-yellow-600 dark:text-yellow-400', stockStatus: 'low-stock' },
    { label: 'Out of Stock', count: stats.outOfStockCount,    color: 'text-red-600 dark:text-red-400',       stockStatus: 'out-of-stock' },
    { label: 'Negative',     count: stats.negativeStockCount, color: 'text-purple-600 dark:text-purple-400', stockStatus: undefined },
  ].filter(a => a.count > 0);

  const categoryStockItems = stats.categoryBreakdown.map(c => ({ name: c.name, count: c.stock }));

  const quickActions = [
    { label: 'Add Product',     icon: Package,        path: '/products',        color: 'bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-900' },
    { label: 'Add Stock',       icon: Plus,           path: '/stock-movements', color: 'bg-green-50 text-green-600 hover:bg-green-100 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-900' },
    { label: 'Move Item',       icon: ArrowLeftRight, path: '/stock-movements', color: 'bg-purple-50 text-purple-600 hover:bg-purple-100 border-purple-200 dark:bg-purple-950 dark:text-purple-400 dark:border-purple-900' },
    { label: 'Scan Barcode',    icon: ScanLine,       path: '/inventory-items', color: 'bg-teal-50 text-teal-600 hover:bg-teal-100 border-teal-200 dark:bg-teal-950 dark:text-teal-400 dark:border-teal-900' },
    { label: 'Import / Export', icon: FileDown,       path: '/import-export',   color: 'bg-orange-50 text-orange-600 hover:bg-orange-100 border-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-900' },
  ];

  return (
    <div className="space-y-5 max-w-[1440px] mx-auto">

      {/* Header */}
      <div>
        <p className="text-sm text-[var(--text-muted)]">{today}</p>
        <h1 className="text-2xl font-bold text-[var(--text)] mt-0.5">
          {greeting()}{user.name ? `, ${user.name}` : ''} 👋
        </h1>
        {user.role === 'superadmin' && (
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Viewing all departments</p>
        )}
        {(user.role === 'admin' || user.role === 'staff') && departmentName && (
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Department: <span className="font-semibold text-[var(--text)]">{departmentName}</span>
          </p>
        )}
      </div>

      {/* Section 1 — Summary */}
      <div>
        <SectionLabel>Summary</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Products"        value={stats.totalProducts}      sub="Product types / SKUs"      icon={Package}     accent="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"         onClick={() => navigate('/products')} />
          <StatCard label="Inventory Items" value={stats.totalInventoryItems} sub="Tagged physical items"     icon={Boxes}       accent="bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400" onClick={() => navigate('/inventory-items')} />
          <StatCard label="Total Stock"     value={stats.totalStock}          sub="Quantity on hand"          icon={CheckCircle} accent="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"     onClick={() => navigate('/products')} />
          <StatCard label="Inventory Value" value={formatValue(stats.totalInventoryValue)} sub="Based on current stock" icon={DollarSign} accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" />
        </div>
      </div>

      {/* Section 2 — Attention Needed */}
      <div>
        <SectionLabel>Attention Needed</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          {/* Stock Alerts */}
          <div className={`bg-[var(--surface)] rounded-xl p-4 shadow-sm border ${hasStockAlerts ? 'border-yellow-200 dark:border-yellow-800' : 'border-[var(--border)]'}`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${hasStockAlerts ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'}`}>
                <AlertTriangle size={16} />
              </div>
              <p className="text-sm font-semibold text-[var(--text)]">Stock Alerts</p>
            </div>
            {hasStockAlerts ? (
              <div className="space-y-1.5">
                {stockAlertItems.map(a => (
                  <button
                    key={a.label}
                    onClick={() => navigate('/products', { state: { stockStatus: a.stockStatus } })}
                    className="w-full flex items-center justify-between text-xs hover:opacity-80 transition-opacity"
                  >
                    <span className="text-[var(--text-muted)]">{a.label}</span>
                    <span className={`font-bold ${a.color}`}>{a.count}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)] opacity-60">No issues</p>
            )}
          </div>

          {/* Unassigned Location */}
          <button
            onClick={() => stats.unassignedLocationCount > 0 ? navigate('/products', { state: { locationId: UNASSIGNED_LOCATION } }) : undefined}
            className={`bg-[var(--surface)] rounded-xl p-4 shadow-sm border text-left transition-all active:scale-95 ${stats.unassignedLocationCount > 0 ? 'border-red-200 dark:border-red-800 hover:shadow-md cursor-pointer' : 'border-[var(--border)] cursor-default'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${stats.unassignedLocationCount > 0 ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'}`}>
                <MapPin size={16} />
              </div>
              <p className="text-sm font-semibold text-[var(--text)]">Unassigned Location</p>
            </div>
            <p className={`text-2xl font-bold leading-none ${stats.unassignedLocationCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-[var(--text)]'}`}>{stats.unassignedLocationCount}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1 opacity-70">Products with no location</p>
          </button>

          {/* Warranty Expiring Soon */}
          <button
            onClick={() => stats.warrantyExpiringSoon > 0 ? navigate('/inventory-items') : undefined}
            className={`bg-[var(--surface)] rounded-xl p-4 shadow-sm border text-left transition-all active:scale-95 ${stats.warrantyExpiringSoon > 0 ? 'border-blue-200 dark:border-blue-800 hover:shadow-md cursor-pointer' : 'border-[var(--border)] cursor-default'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${stats.warrantyExpiringSoon > 0 ? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'}`}>
                <Clock size={16} />
              </div>
              <p className="text-sm font-semibold text-[var(--text)]">Warranty</p>
            </div>
            <p className={`text-2xl font-bold leading-none ${stats.warrantyExpiringSoon > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-[var(--text)]'}`}>{stats.warrantyExpiringSoon}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1 opacity-70">Expiring within 30 days</p>
          </button>

          {/* Missing Details */}
          <button
            onClick={() => stats.missingDetailsCount > 0 ? navigate('/inventory-items') : undefined}
            className={`bg-[var(--surface)] rounded-xl p-4 shadow-sm border text-left transition-all active:scale-95 ${stats.missingDetailsCount > 0 ? 'border-orange-200 dark:border-orange-800 hover:shadow-md cursor-pointer' : 'border-[var(--border)] cursor-default'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${stats.missingDetailsCount > 0 ? 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400' : 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400'}`}>
                <AlertCircle size={16} />
              </div>
              <p className="text-sm font-semibold text-[var(--text)]">Missing Details</p>
            </div>
            <p className={`text-2xl font-bold leading-none ${stats.missingDetailsCount > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>{stats.missingDetailsCount}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1 opacity-70">{stats.missingDetailsCount > 0 ? 'Incomplete item records' : 'All key details complete'}</p>
          </button>

        </div>
      </div>

      {/* Section 3 — Asset Status */}
      <div>
        <SectionLabel>Asset Status</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Available"  value={stats.itemsAvailable} icon={CheckCircle} accent="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"    onClick={() => navigate('/inventory-items')} />
          <StatCard label="In Use"     value={stats.itemsInUse}     icon={Zap}         accent="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"        onClick={() => navigate('/inventory-items')} />
          <StatCard label="For Repair" value={stats.itemsForRepair} icon={Wrench}      accent={stats.itemsForRepair > 0 ? 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400' : 'bg-gray-100 text-gray-400'} onClick={() => navigate('/inventory-items')} />
          <StatCard label="Lost"       value={stats.itemsLost}      icon={AlertCircle} accent={stats.itemsLost > 0 ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400' : 'bg-gray-100 text-gray-400'} onClick={() => navigate('/inventory-items')} />
        </div>
      </div>

      {/* Section 4 — Inventory Analytics */}
      <div>
        <SectionLabel>Inventory Analytics</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          <div className="bg-[var(--surface)] rounded-xl shadow-sm border border-[var(--border)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={16} className="text-[var(--primary)]" />
              <h2 className="text-sm font-semibold text-[var(--text)]">Product Stock Health</h2>
            </div>
            <HealthBar
              good={stats.goodStockCount}
              low={stats.lowStockCount}
              out={stats.outOfStockCount}
              negative={stats.negativeStockCount}
            />
            {(stats.outOfStockCount > 0 || stats.negativeStockCount > 0) && (
              <button onClick={() => navigate('/products')} className="mt-3 w-full text-xs text-center text-[var(--primary)] hover:underline">
                Review products →
              </button>
            )}
          </div>

          <div className="bg-[var(--surface)] rounded-xl shadow-sm border border-[var(--border)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Tag size={16} className="text-[var(--primary)]" />
              <h2 className="text-sm font-semibold text-[var(--text)]">Stock Qty by Category</h2>
            </div>
            <BreakdownBar items={categoryStockItems} emptyLabel="No category data yet." />
          </div>

          <div className="bg-[var(--surface)] rounded-xl shadow-sm border border-[var(--border)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={16} className="text-[var(--primary)]" />
              <h2 className="text-sm font-semibold text-[var(--text)]">Inventory Items by Location</h2>
            </div>
            <BreakdownBar items={stats.locationBreakdown} emptyLabel="No location data yet." />
          </div>

        </div>
      </div>

      {/* Section 5 — Operations */}
      <div>
        <SectionLabel>Operations</SectionLabel>
        <div className="space-y-3">

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2">
            {quickActions.map(({ label, icon: Icon, path, color }) => (
              <button
                key={label}
                onClick={() => navigate(path)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all active:scale-95 ${color}`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {/* Recent Movements */}
          <div className="bg-[var(--surface)] rounded-xl shadow-sm border border-[var(--border)]">
            <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowLeftRight size={16} className="text-[var(--primary)]" />
                <h2 className="text-sm font-semibold text-[var(--text)]">Recent Movements</h2>
              </div>
              <button onClick={() => navigate('/stock-movements')} className="text-xs text-[var(--primary)] hover:underline font-medium">
                View all →
              </button>
            </div>

            {recentMovements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <ArrowLeftRight size={28} className="text-[var(--text-muted)] mb-2 opacity-30" />
                <p className="text-sm text-[var(--text-muted)]">No stock movements yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {recentMovements.slice(0, 8).map(m => {
                  const meta = MOVEMENT_META[m.movementType] ?? { label: m.movementType, color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' };
                  const rawNames: string = m.products || m.items?.map((i: any) => i.product?.name).join(', ') || '—';
                  const itemCount = m.items?.length ?? 0;
                  const title = formatMovementTitle(rawNames, itemCount);
                  return (
                    <div
                      key={m.id}
                      onClick={() => navigate('/stock-movements')}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text)] truncate">{title}</p>
                        <p className="text-xs text-[var(--text-muted)] truncate">
                          {m.movementNo ?? '—'} · {itemCount} item{itemCount !== 1 ? 's' : ''}{m.user?.name ? ` · ${m.user.name}` : ''}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${meta.color}`}>
                        {meta.label}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] flex-shrink-0 w-16 text-right">
                        {timeAgo(m.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

    </div>
  );
}
