import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBell } from '@/contexts/BellContext';
import {
  Package, Boxes, AlertCircle, MapPin,
  ArrowLeftRight, CheckCircle, AlertTriangle, Activity,
  Wrench, Clock, Tag, FileDown, Zap, ClipboardCheck, Bell, ClipboardList, RefreshCw, ChevronDown,
} from 'lucide-react';

function PesoSign({ size = 18 }: { size?: number }) {
  return (
    <span style={{ fontSize: size, fontWeight: 700, lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>₱</span>
  );
}
import { dashboardApi, departmentsApi } from '@/services/api';
import WelcomeModal from '@/components/WelcomeModal';
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
  unconfirmedMovementsCount: number;
  unverifiedItemsCount: number;
  pendingRequestsCount: number;
  totalCategories: number;
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

const REQUEST_META: Record<string, { label: string; color: string; dot: string }> = {
  import:   { label: 'Import',   color: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500' },
  delete:   { label: 'Delete',   color: 'bg-red-100 text-red-700',     dot: 'bg-red-500' },
  password: { label: 'Password', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  edit:     { label: 'Edit',     color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
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
  return `₱ ${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
        <div key={`${item.name}-${i}`} className="flex items-center gap-2">
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
  const { triggerOpenBell } = useBell();
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
    unconfirmedMovementsCount: 0,
    unverifiedItemsCount: 0,
    pendingRequestsCount: 0,
    totalCategories: 0,
  });
  const [recentMovements, setRecentMovements] = useState<any[]>([]);
  const [recentRequests, setRecentRequests] = useState<any[]>([]);
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(() =>
    localStorage.getItem('dash_analytics_open') !== 'false'
  );
  const [showWelcome, setShowWelcome] = useState(() => {
    try {
      const uid = JSON.parse(localStorage.getItem('user') || '{}').id || 'anon';
      return !localStorage.getItem(`ims_welcome_seen_${uid}`);
    } catch { return false; }
  });
  const [checklistDismissed, setChecklistDismissed] = useState(() => {
    try {
      const uid = JSON.parse(localStorage.getItem('user') || '{}').id || 'anon';
      return !!localStorage.getItem(`ims_checklist_dismissed_${uid}`);
    } catch { return false; }
  });

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [statsRes, movementsRes, requestsRes] = await Promise.all([
        dashboardApi.getStats(),
        dashboardApi.getRecentMovements(),
        dashboardApi.getRecentRequests(),
      ]);
      setStats(statsRes.data);
      setRecentMovements(movementsRes.data);
      setRecentRequests(requestsRes.data);
      setLastUpdated(new Date());

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
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const onStorage = () => fetchData();
    window.addEventListener('storage', onStorage);
    const autoRefresh = setInterval(() => fetchData(true), 5 * 60 * 1000);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(autoRefresh);
    };
  }, [fetchData]);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const greeting = () => {
    const h = now.getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const today = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (loading) return (
    <div className="space-y-5 max-w-[1440px] mx-auto animate-pulse">
      <div className="space-y-2">
        <div className="h-4 w-48 bg-[var(--border)] rounded" />
        <div className="h-7 w-64 bg-[var(--border)] rounded" />
        <div className="h-4 w-36 bg-[var(--border)] rounded" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-[var(--border)] rounded-xl" />)}
      </div>
      <div className="space-y-2">
        <div className="h-4 w-32 bg-[var(--border)] rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-[var(--border)] rounded-xl" />)}
        </div>
        <div className="h-32 bg-[var(--border)] rounded-xl mt-2" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-[var(--border)] rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-36 bg-[var(--border)] rounded-xl" />)}
      </div>
    </div>
  );

  const isEmpty = stats.totalProducts === 0 && stats.totalInventoryItems === 0;
  const hasStockAlerts = stats.lowStockCount > 0 || stats.outOfStockCount > 0 || stats.negativeStockCount > 0;

  const stockAlertItems = [
    { label: 'Low Stock',    count: stats.lowStockCount,      color: 'text-yellow-600 dark:text-yellow-400', stockStatus: 'low-stock' },
    { label: 'Out of Stock', count: stats.outOfStockCount,    color: 'text-red-600 dark:text-red-400',       stockStatus: 'out-of-stock' },
    { label: 'Negative',     count: stats.negativeStockCount, color: 'text-purple-600 dark:text-purple-400', stockStatus: 'negative-stock' },
  ].filter(a => a.count > 0);

  const categoryStockItems = stats.categoryBreakdown.map(c => ({ name: c.name, count: c.stock }));

  const quickActions: { label: string; icon: React.ElementType; path?: string; action?: () => void; color: string }[] = [
    { label: 'Add Product',      icon: Package,        path: '/products/bulk-add', color: 'bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-900' },
    { label: 'Stock Movement',   icon: ArrowLeftRight, path: '/stock-movements',   color: 'bg-green-50 text-green-600 hover:bg-green-100 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-900' },
    { label: 'Import / Export',  icon: FileDown,       path: '/import-pclsf',      color: 'bg-orange-50 text-orange-600 hover:bg-orange-100 border-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-900' },
    { label: 'Verify Inventory', icon: ClipboardCheck, path: '/inventory-items',   color: 'bg-teal-50 text-teal-600 hover:bg-teal-100 border-teal-200 dark:bg-teal-950 dark:text-teal-400 dark:border-teal-900' },
    { label: 'View Alerts',      icon: Bell,           action: triggerOpenBell,    color: 'bg-red-50 text-red-600 hover:bg-red-100 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-900' },
  ];

  const checklistSteps = [
    { label: 'Add a category',       done: stats.totalCategories > 0,     path: '/categories' },
    { label: 'Add a location',       done: stats.totalLocations > 0,       path: '/locations' },
    { label: 'Add products',         done: stats.totalProducts > 0,        path: '/products/bulk-add' },
    { label: 'Add inventory items',  done: stats.totalInventoryItems > 0,  path: '/inventory-items' },
  ];
  const checklistDone = checklistSteps.every(s => s.done);
  const showChecklist = !checklistDismissed && !checklistDone;

  return (
    <>
    {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}
    <div className="space-y-5 max-w-[1440px] mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--text-muted)]">
            {today} &nbsp;<span className="font-mono">{timeStr}</span>
          </p>
          <h1 className="text-2xl font-bold text-[var(--text)] mt-0.5">
            {greeting()}{user.name ? `, ${user.name}` : ''}
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
        <div className="flex items-center gap-2 flex-shrink-0 mt-1">
          {lastUpdated && (
            <span className="text-xs text-[var(--text-muted)]">
              Updated {timeAgo(lastUpdated.toISOString())}
            </span>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors disabled:opacity-50"
            title="Refresh dashboard"
            aria-label="Refresh dashboard"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Section 1 — Summary (includes asset status) */}
      <div>
        <SectionLabel>Summary</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Products"        value={stats.totalProducts}       sub="Product types"        icon={Package}     accent="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"           onClick={() => navigate('/products')} />
          <StatCard label="Inventory Items" value={stats.totalInventoryItems}  sub="Tagged items"         icon={Boxes}       accent="bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400"   onClick={() => navigate('/inventory-items')} />
          <StatCard label="Total Stock"     value={stats.totalStock}           sub="Quantity on hand"     icon={CheckCircle} accent="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"       onClick={() => navigate('/products')} />
          <StatCard label="Inventory Value" value={formatValue(stats.totalInventoryValue)} sub="Est. value"  icon={PesoSign}    accent="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" />
          <StatCard label="Available"       value={stats.itemsAvailable}       sub="Ready to use"         icon={Zap}         accent="bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400"               onClick={() => navigate('/inventory-items')} />
          <StatCard label="In Use"          value={stats.itemsInUse}           sub="Deployed / borrowed"  icon={Wrench}      accent="bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400"   onClick={() => navigate('/inventory-items')} />
        </div>
      </div>

      {/* Empty state — shown when no data yet */}
      {isEmpty && (
        <div className="bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-xl p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-[var(--surface-2)]">
              <Package size={32} className="text-[var(--text-muted)] opacity-50" />
            </div>
          </div>
          <div>
            <p className="text-base font-semibold text-[var(--text)]">Your inventory is empty</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">Get started by setting up your locations, then adding your first products.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <button onClick={() => navigate('/categories')}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--border)] transition-colors">
              1. Add a Category
            </button>
            <button onClick={() => navigate('/locations')}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--border)] transition-colors">
              2. Add a Location
            </button>
            <button onClick={() => navigate('/products/bulk-add')}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--primary)] text-white hover:opacity-90 transition-opacity">
              3. Add Products
            </button>
            <button onClick={() => navigate('/import-pclsf')}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--border)] transition-colors">
              4. Import via CSV
            </button>
          </div>
        </div>
      )}

      {/* Getting Started checklist */}
      {showChecklist && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Getting Started</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Complete these steps to set up your inventory.</p>
            </div>
            <button
              onClick={() => {
                const uid = JSON.parse(localStorage.getItem('user') || '{}').id || 'anon';
                localStorage.setItem(`ims_checklist_dismissed_${uid}`, '1');
                setChecklistDismissed(true);
              }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
              aria-label="Dismiss checklist"
            >
              Dismiss
            </button>
          </div>
          <div className="space-y-2">
            {checklistSteps.map((s, i) => (
              <div key={s.label} className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold border-2 transition-colors ${s.done ? 'bg-green-500 border-green-500 text-white' : 'border-[var(--border)] text-[var(--text-muted)]'}`}>
                  {s.done ? '✓' : i + 1}
                </div>
                {s.done ? (
                  <span className="text-sm text-[var(--text-muted)] line-through">{s.label}</span>
                ) : (
                  <button onClick={() => navigate(s.path)} className="text-sm text-[var(--primary)] hover:underline text-left">
                    {s.label}
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${(checklistSteps.filter(s => s.done).length / checklistSteps.length) * 100}%` }}
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1.5">{checklistSteps.filter(s => s.done).length} of {checklistSteps.length} complete</p>
        </div>
      )}

      {/* Section 2 — Priority Actions (merged Attention Needed + Action Queue) */}
      <div>
        <SectionLabel>Priority Actions</SectionLabel>

        {/* Hero cards — always visible, show count */}
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
                  <button key={a.label} onClick={() => navigate('/products', { state: { stockStatus: a.stockStatus } })}
                    className="w-full flex items-center justify-between text-xs hover:opacity-80 transition-opacity">
                    <span className="text-[var(--text-muted)]">{a.label}</span>
                    <span className={`font-bold ${a.color}`}>{a.count}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)] opacity-60">No issues</p>
            )}
          </div>

          {/* Unconfirmed Movements */}
          <button
            onClick={() => stats.unconfirmedMovementsCount > 0 ? navigate('/stock-movements', { state: { notifFilter: 'movement:pending' } }) : undefined}
            className={`bg-[var(--surface)] rounded-xl p-4 shadow-sm border text-left transition-all active:scale-95 ${stats.unconfirmedMovementsCount > 0 ? 'border-yellow-200 dark:border-yellow-800 hover:shadow-md cursor-pointer' : 'border-[var(--border)] cursor-default'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${stats.unconfirmedMovementsCount > 0 ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'}`}>
                <ArrowLeftRight size={16} />
              </div>
              <p className="text-sm font-semibold text-[var(--text)]">Unconfirmed</p>
            </div>
            <p className={`text-2xl font-bold leading-none ${stats.unconfirmedMovementsCount > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-[var(--text)]'}`}>{stats.unconfirmedMovementsCount}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1 opacity-70">{stats.unconfirmedMovementsCount > 0 ? 'Movements awaiting confirmation' : 'All movements confirmed'}</p>
          </button>

          {/* Not Recently Verified */}
          <button
            onClick={() => stats.unverifiedItemsCount > 0 ? navigate('/inventory-items', { state: { filterAuditStatus: 'not-checked-3months' } }) : undefined}
            className={`bg-[var(--surface)] rounded-xl p-4 shadow-sm border text-left transition-all active:scale-95 ${stats.unverifiedItemsCount > 0 ? 'border-teal-200 dark:border-teal-800 hover:shadow-md cursor-pointer' : 'border-[var(--border)] cursor-default'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg ${stats.unverifiedItemsCount > 0 ? 'bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'}`}>
                <ClipboardCheck size={16} />
              </div>
              <p className="text-sm font-semibold text-[var(--text)]">Not Verified</p>
            </div>
            <p className={`text-2xl font-bold leading-none ${stats.unverifiedItemsCount > 0 ? 'text-teal-600 dark:text-teal-400' : 'text-[var(--text)]'}`}>{stats.unverifiedItemsCount}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1 opacity-70">{stats.unverifiedItemsCount > 0 ? 'Not checked in 3 months' : 'All items recently verified'}</p>
          </button>

          {/* Pending Requests — admin/superadmin only; staff sees Missing Details instead */}
          {user.role !== 'staff' ? (
            <button
              onClick={() => stats.pendingRequestsCount > 0 ? navigate('/admin/requests') : undefined}
              className={`bg-[var(--surface)] rounded-xl p-4 shadow-sm border text-left transition-all active:scale-95 ${stats.pendingRequestsCount > 0 ? 'border-violet-200 dark:border-violet-800 hover:shadow-md cursor-pointer' : 'border-[var(--border)] cursor-default'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${stats.pendingRequestsCount > 0 ? 'bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'}`}>
                  <ClipboardList size={16} />
                </div>
                <p className="text-sm font-semibold text-[var(--text)]">Pending Requests</p>
              </div>
              <p className={`text-2xl font-bold leading-none ${stats.pendingRequestsCount > 0 ? 'text-violet-600 dark:text-violet-400' : 'text-[var(--text)]'}`}>{stats.pendingRequestsCount}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1 opacity-70">{stats.pendingRequestsCount > 0 ? 'Import, delete, edit, password' : 'No pending requests'}</p>
            </button>
          ) : (
            <button
              onClick={() => stats.missingDetailsCount > 0 ? navigate('/inventory-items', { state: { filterDataQuality: 'incomplete' } }) : undefined}
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
          )}
        </div>

        {/* Secondary list — only non-zero items */}
        {(() => {
          const secondary = [
            { label: 'Products without location',  count: stats.unassignedLocationCount, path: '/products',        state: { locationId: UNASSIGNED_LOCATION },              tone: 'text-red-600 dark:text-red-400' },
            { label: 'Warranty expiring soon',      count: stats.warrantyExpiringSoon,    path: '/inventory-items', state: { filterWarranty: 'under-warranty' },             tone: 'text-blue-600 dark:text-blue-400' },
            { label: 'Incomplete item records',     count: stats.missingDetailsCount,     path: '/inventory-items', state: { filterDataQuality: 'incomplete' },              tone: 'text-orange-600 dark:text-orange-400' },
            { label: 'Items for repair',            count: stats.itemsForRepair,          path: '/inventory-items', state: { filterStatus: 'under-repair' },                 tone: 'text-orange-600 dark:text-orange-400' },
            { label: 'Lost items',                  count: stats.itemsLost,               path: '/inventory-items', state: { filterStatus: 'lost' },                         tone: 'text-red-600 dark:text-red-400' },
            { label: 'Out of stock products',       count: stats.outOfStockCount,         path: '/products',        state: { stockStatus: 'out-of-stock' },                  tone: 'text-red-600 dark:text-red-400' },
            { label: 'Low stock products',          count: stats.lowStockCount,           path: '/products',        state: { stockStatus: 'low-stock' },                    tone: 'text-yellow-600 dark:text-yellow-400' },
          ].filter(i => i.count > 0);

          if (secondary.length === 0) return (
            <div className="mt-2 px-4 py-3 bg-[var(--surface)] rounded-xl border border-[var(--border)] text-sm text-[var(--text-muted)] text-center">
              All clear — no secondary issues.
            </div>
          );
          return (
            <div className="mt-2 bg-[var(--surface)] rounded-xl shadow-sm border border-[var(--border)] divide-y divide-[var(--border)]">
              {secondary.map(item => (
                <button key={item.label} onClick={() => navigate(item.path, { state: item.state })}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-[var(--surface-2)] transition-colors">
                  <span className="text-sm text-[var(--text)]">{item.label}</span>
                  <span className={`text-sm font-bold ${item.tone}`}>{item.count}</span>
                </button>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Section 4 — Inventory Analytics (collapsible) */}
      <div>
        <button
          onClick={() => {
            const next = !showAnalytics;
            setShowAnalytics(next);
            localStorage.setItem('dash_analytics_open', String(next));
          }}
          className="flex items-center gap-1 mb-2 group"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors">Inventory Analytics</p>
          <ChevronDown size={13} className={`text-[var(--text-muted)] transition-transform ${showAnalytics ? '' : '-rotate-90'}`} />
        </button>
        {showAnalytics && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-[var(--surface)] rounded-xl shadow-sm border border-[var(--border)] p-4">
              <button onClick={() => navigate('/products')} className="flex items-center gap-2 mb-3 hover:opacity-70 transition-opacity w-full text-left">
                <Activity size={16} className="text-[var(--primary)]" />
                <h2 className="text-sm font-semibold text-[var(--text)]">Product Stock Health</h2>
                <span className="ml-auto text-xs text-[var(--primary)]">View →</span>
              </button>
              <HealthBar good={stats.goodStockCount} low={stats.lowStockCount} out={stats.outOfStockCount} negative={stats.negativeStockCount} />
            </div>
            <div className="bg-[var(--surface)] rounded-xl shadow-sm border border-[var(--border)] p-4">
              <button onClick={() => navigate('/products')} className="flex items-center gap-2 mb-3 hover:opacity-70 transition-opacity w-full text-left">
                <Tag size={16} className="text-[var(--primary)]" />
                <h2 className="text-sm font-semibold text-[var(--text)]">Stock Qty by Category</h2>
                <span className="ml-auto text-xs text-[var(--primary)]">View →</span>
              </button>
              <BreakdownBar items={categoryStockItems} emptyLabel="No category data yet." />
            </div>
            <div className="bg-[var(--surface)] rounded-xl shadow-sm border border-[var(--border)] p-4">
              <button onClick={() => navigate('/locations')} className="flex items-center gap-2 mb-3 hover:opacity-70 transition-opacity w-full text-left">
                <MapPin size={16} className="text-[var(--primary)]" />
                <h2 className="text-sm font-semibold text-[var(--text)]">Items by Location</h2>
                <span className="ml-auto text-xs text-[var(--primary)]">View →</span>
              </button>
              <BreakdownBar items={stats.locationBreakdown} emptyLabel="No location data yet." />
            </div>
          </div>
        )}
      </div>

      {/* Section 5 — Operations */}
      <div>
        <SectionLabel>Operations</SectionLabel>
        <div className="space-y-3">

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2">
            {quickActions.map(({ label, icon: Icon, path, action, color }) => (
              <button
                key={label}
                onClick={() => action ? action() : navigate(path!)}
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

          {/* Recent Requests — admin/superadmin only */}
          {user.role !== 'staff' && (
            <div className="bg-[var(--surface)] rounded-xl shadow-sm border border-[var(--border)]">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList size={16} className="text-[var(--primary)]" />
                  <h2 className="text-sm font-semibold text-[var(--text)]">Recent Requests</h2>
                </div>
                <button onClick={() => navigate('/admin/requests')} className="text-xs text-[var(--primary)] hover:underline font-medium">
                  View all →
                </button>
              </div>

              {recentRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <ClipboardList size={28} className="text-[var(--text-muted)] mb-2 opacity-30" />
                  <p className="text-sm text-[var(--text-muted)]">No pending requests.</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {recentRequests.map((r: any) => {
                    const meta = REQUEST_META[r.type] ?? { label: r.type, color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' };
                    return (
                      <div
                        key={r.id}
                        onClick={() => navigate('/admin/requests')}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text)] truncate">{r.label}</p>
                          <p className="text-xs text-[var(--text-muted)] truncate">by {r.requesterName}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${meta.color}`}>
                          {meta.label}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] flex-shrink-0 w-16 text-right">
                          {timeAgo(r.createdAt)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

    </div>
    </>
  );
}
