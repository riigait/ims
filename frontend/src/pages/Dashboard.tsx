import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, Boxes, TrendingDown, AlertCircle, MapPin, Map,
  ArrowLeftRight, CheckCircle, AlertTriangle, Activity,
} from 'lucide-react';
import { dashboardApi, departmentsApi } from '@/services/api';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';

interface Stats {
  totalProducts: number;
  totalStock: number;
  totalInventoryItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  negativeStockCount: number;
  goodStockCount: number;
  totalLocations: number;
  totalFloorPlans: number;
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

function StatCard({
  label, value, sub, icon: Icon, accent, onClick,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; accent: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-[var(--surface)] rounded-xl p-5 text-left w-full shadow-sm border border-[var(--border)] hover:shadow-md hover:border-[var(--primary)] transition-all group active:scale-95"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${accent}`}>
          <Icon size={20} />
        </div>
      </div>
      <p className="text-2xl font-bold text-[var(--text)] mb-0.5">{value}</p>
      <p className="text-sm text-[var(--text-muted)]">{label}</p>
      {sub && <p className="text-xs text-[var(--text-muted)] mt-1 opacity-70">{sub}</p>}
    </button>
  );
}

function HealthBar({ good, low, out, negative }: { good: number; low: number; out: number; negative: number }) {
  const total = good + low + out + negative;
  if (total === 0) return <p className="text-sm text-[var(--text-muted)]">No products yet.</p>;
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div className="space-y-3">
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
        {good     > 0 && <div className="bg-green-500 rounded-l-full"  style={{ width: pct(good) }}     title={`Good: ${good}`} />}
        {low      > 0 && <div className="bg-yellow-400"                style={{ width: pct(low) }}      title={`Low: ${low}`} />}
        {out      > 0 && <div className="bg-red-500"                   style={{ width: pct(out) }}      title={`Out: ${out}`} />}
        {negative > 0 && <div className="bg-purple-500 rounded-r-full" style={{ width: pct(negative) }} title={`Negative: ${negative}`} />}
      </div>
      <div className="flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /><span className="text-[var(--text-muted)]">Good</span> <span className="font-semibold text-[var(--text)]">{good}</span></span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /><span className="text-[var(--text-muted)]">Low Stock</span> <span className="font-semibold text-[var(--text)]">{low}</span></span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /><span className="text-[var(--text-muted)]">Out of Stock</span> <span className="font-semibold text-[var(--text)]">{out}</span></span>
        {negative > 0 && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /><span className="text-[var(--text-muted)]">Negative</span> <span className="font-semibold text-purple-600">{negative}</span></span>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [stats, setStats] = useState<Stats>({
    totalProducts: 0, totalStock: 0, totalInventoryItems: 0,
    lowStockCount: 0, outOfStockCount: 0, negativeStockCount: 0, goodStockCount: 0,
    totalLocations: 0, totalFloorPlans: 0,
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

  const hasAlerts = stats.lowStockCount > 0 || stats.outOfStockCount > 0 || stats.negativeStockCount > 0;

  return (
    <div className="space-y-6 p-1">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-2">
        <div>
          <p className="text-sm text-[var(--text-muted)]">{today}</p>
          <h1 className="text-3xl font-bold text-[var(--text)] mt-0.5">
            {greeting()}{user.name ? `, ${user.name}` : ''} 👋
          </h1>
          {user.role === 'superadmin' && (
            <p className="text-sm text-[var(--text-muted)] mt-1">Viewing all departments</p>
          )}
          {(user.role === 'admin' || user.role === 'staff') && departmentName && (
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Department: <span className="font-semibold text-[var(--text)]">{departmentName}</span>
            </p>
          )}
        </div>
        {hasAlerts && (
          <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-2">
            <AlertTriangle size={16} className="text-yellow-600 flex-shrink-0" />
            <span className="text-sm text-yellow-700 dark:text-yellow-300">
              {stats.negativeStockCount > 0 && <><span className="font-semibold">{stats.negativeStockCount} negative</span> · </>}
              {stats.outOfStockCount > 0 && <><span className="font-semibold">{stats.outOfStockCount} out of stock</span> · </>}
              {stats.lowStockCount > 0 && <><span className="font-semibold">{stats.lowStockCount} low stock</span></>}
            </span>
          </div>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Products"        value={stats.totalProducts}       icon={Package}       accent="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"     onClick={() => navigate('/products')} />
        <StatCard label="Inventory Items" value={stats.totalInventoryItems}  icon={Boxes}         accent="bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400" onClick={() => navigate('/inventory-items')} />
        <StatCard label="Total Stock"     value={stats.totalStock}           icon={CheckCircle}   accent="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"   onClick={() => navigate('/products')} />
        <StatCard label="Low Stock"       value={stats.lowStockCount}        icon={TrendingDown}  accent={stats.lowStockCount > 0 ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400' : 'bg-gray-100 text-gray-400'} onClick={() => navigate('/products')} />
        <StatCard label="Locations"       value={stats.totalLocations}       icon={MapPin}        accent="bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400" onClick={() => navigate('/locations')} />
        <StatCard label="Floor Plans"     value={stats.totalFloorPlans}      icon={Map}           accent="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"       onClick={() => navigate('/floor-plans')} />
      </div>

      {/* Bottom row: Stock Health + Recent Movements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Stock Health */}
        <div className="bg-[var(--surface)] rounded-xl shadow-sm border border-[var(--border)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-[var(--primary)]" />
            <h2 className="font-semibold text-[var(--text)]">Stock Health</h2>
          </div>
          <HealthBar
            good={stats.goodStockCount}
            low={stats.lowStockCount}
            out={stats.outOfStockCount}
            negative={stats.negativeStockCount}
          />
          {(stats.outOfStockCount > 0 || stats.negativeStockCount > 0) && (
            <button
              onClick={() => navigate('/products')}
              className="mt-4 w-full text-xs text-center text-[var(--primary)] hover:underline">
              Review products →
            </button>
          )}
        </div>

        {/* Recent Movements */}
        <div className="lg:col-span-2 bg-[var(--surface)] rounded-xl shadow-sm border border-[var(--border)]">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowLeftRight size={18} className="text-[var(--primary)]" />
              <h2 className="font-semibold text-[var(--text)]">Recent Movements</h2>
            </div>
            <button
              onClick={() => navigate('/stock-movements')}
              className="text-xs text-[var(--primary)] hover:underline font-medium">
              View all →
            </button>
          </div>

          {recentMovements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ArrowLeftRight size={32} className="text-[var(--text-muted)] mb-3 opacity-30" />
              <p className="text-sm text-[var(--text-muted)]">No stock movements yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {recentMovements.slice(0, 8).map(m => {
                const meta = MOVEMENT_META[m.movementType] ?? { label: m.movementType, color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' };
                const productNames: string = m.products || m.items?.map((i: any) => i.product?.name).join(', ') || '—';
                const itemCount = m.items?.length ?? 0;
                return (
                  <div
                    key={m.id}
                    onClick={() => navigate('/stock-movements')}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--surface-2)] cursor-pointer transition-colors">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text)] truncate">{productNames}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {m.movementNo ?? '—'} · {itemCount} item{itemCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${meta.color}`}>
                      {meta.label}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] flex-shrink-0">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
