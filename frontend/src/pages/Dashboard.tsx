import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, departmentsApi } from '@/services/api';
import { formatNumber } from '@/utils/ids';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';
interface Stats {
  totalProducts: number;
  totalStock: number;
  lowStockCount: number;
  totalLocations: number;
  totalFloorPlans: number;
}

interface RecentMovement {
  id: string;
  productName: string;
  movementType: string;
  quantity: number;
  createdAt: string;
}

const MOVEMENT_COLORS: Record<string, string> = {
  stock_in:   'bg-green-100 text-green-800',
  stock_out:  'bg-red-100 text-red-800',
  adjustment: 'bg-blue-100 text-blue-800',
  returned:   'bg-teal-100 text-teal-800',
  damaged:    'bg-orange-100 text-orange-800',
  transfer:   'bg-purple-100 text-purple-800',
};

const MOVEMENT_LABELS: Record<string, string> = {
  stock_in: 'In', stock_out: 'Out', adjustment: 'Adj',
  returned: 'Return', damaged: 'Damaged', transfer: 'Transfer',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [stats, setStats] = useState<Stats>({
    totalProducts: 0,
    totalStock: 0,
    lowStockCount: 0,
    totalLocations: 0,
    totalFloorPlans: 0,
  });
  const [recentMovements, setRecentMovements] = useState<RecentMovement[]>([]);
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

        // Fetch department name for users with department switching
        const userDepts = user.role === 'admin' ? user.adminDepartments : user.staffDepartments;

        if (userDepts && userDepts.length > 0) {
          // User has multiple departments - get currently selected one
          const currentDeptId = localStorage.getItem('currentDepartmentId');
          if (currentDeptId === ALL_DEPARTMENTS_ID) {
            setDepartmentName('All Departments');
          } else {
            const currentDept = userDepts.find((ad: any) => ad.departmentId === currentDeptId);
            if (currentDept) {
              setDepartmentName(currentDept.department.name);
            } else if (userDepts.length > 0) {
              setDepartmentName(userDepts[0].department.name);
            }
          }
        } else if (user.departmentId) {
          // User has single department assigned
          try {
            const deptRes = await departmentsApi.getById(user.departmentId);
            setDepartmentName(deptRes.data.name);
          } catch {
            console.error('Failed to fetch department');
          }
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    const handleStorageChange = () => {
      fetchData();
    };

    setLoading(true);
    fetchData();
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  if (loading) return <div className="text-center py-12">Loading...</div>;

  const cards = [
    {
      label: 'Total Products',
      value: formatNumber(stats.totalProducts),
      valueClass: 'text-[var(--text)]',
      to: '/products',
      bg: 'hover:bg-[var(--surface-2)]',
    },
    {
      label: 'Total Stock',
      value: formatNumber(stats.totalStock),
      valueClass: 'text-[var(--text)]',
      to: '/stock-movements',
      bg: 'hover:bg-[var(--surface-2)]',
    },
    {
      label: 'Low Stock Items',
      value: formatNumber(stats.lowStockCount),
      valueClass: stats.lowStockCount > 0 ? 'text-red-600' : 'text-[var(--text)]',
      to: '/products',
      bg: stats.lowStockCount > 0 ? 'hover:bg-red-50' : 'hover:bg-[var(--surface-2)]',
    },
    {
      label: 'Total Locations',
      value: formatNumber(stats.totalLocations),
      valueClass: 'text-[var(--text)]',
      to: '/locations',
      bg: 'hover:bg-[var(--surface-2)]',
    },
    {
      label: 'Floor Plans',
      value: formatNumber(stats.totalFloorPlans),
      valueClass: 'text-[var(--text)]',
      to: '/floor-plans',
      bg: 'hover:bg-[var(--surface-2)]',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">
          {user.role === 'superadmin' ? 'Superadmin Dashboard - All Departments' : 'Dashboard'}
        </h1>
        {user.role === 'admin' && (
          <p className="text-[var(--text-muted)] mt-2">Department: <span className="font-semibold text-[var(--text)]">{departmentName || 'Loading...'}</span></p>
        )}
        {user.role === 'staff' && departmentName && (
          <p className="text-[var(--text-muted)] mt-2">Department: <span className="font-semibold text-[var(--text)]">{departmentName}</span></p>
        )}
        {user.role === 'superadmin' && (
          <p className="text-[var(--text-muted)] mt-2">Viewing all inventory data across all departments</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map(card => (
          <button
            key={card.label}
            onClick={() => navigate(card.to)}
            className={`bg-[var(--surface)] p-6 rounded-lg shadow text-left transition cursor-pointer ${card.bg} hover:shadow-md active:scale-95`}
          >
            <div className="text-sm text-[var(--text-muted)] mb-1">{card.label}</div>
            <div className={`text-3xl font-bold ${card.valueClass}`}>{card.value}</div>
          </button>
        ))}
      </div>

      <div className="bg-[var(--surface)] rounded-lg shadow">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[var(--text)]">Recent Stock Movements</h2>
          <button
            onClick={() => navigate('/stock-movements')}
            className="text-sm text-[var(--primary)] hover:text-[var(--primary-hover)] font-medium"
          >
            View all →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-[var(--text)]">Product</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-[var(--text)]">Type</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-[var(--text)]">Quantity</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-[var(--text)]">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {recentMovements.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-[var(--text-muted)] text-sm">
                    No stock movements yet.
                  </td>
                </tr>
              ) : recentMovements.map(movement => (
                <tr key={movement.id} className="hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
                  onClick={() => navigate('/stock-movements')}>
                  <td className="px-6 py-4 text-sm text-[var(--text)]">{movement.productName}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${MOVEMENT_COLORS[movement.movementType] ?? 'bg-gray-100 text-gray-800'}`}>
                      {MOVEMENT_LABELS[movement.movementType] ?? movement.movementType}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-[var(--text)]">{movement.quantity}</td>
                  <td className="px-6 py-4 text-sm text-[var(--text-muted)]">
                    {new Date(movement.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
