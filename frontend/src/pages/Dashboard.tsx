import { useState, useEffect } from 'react';
import { dashboardApi } from '@/services/api';
import { formatNumber } from '@/utils/ids';

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

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalProducts: 0,
    totalStock: 0,
    lowStockCount: 0,
    totalLocations: 0,
    totalFloorPlans: 0,
  });
  const [recentMovements, setRecentMovements] = useState<RecentMovement[]>([]);
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
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500">Total Products</div>
          <div className="text-3xl font-bold text-gray-900">
            {formatNumber(stats.totalProducts)}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500">Total Stock</div>
          <div className="text-3xl font-bold text-gray-900">
            {formatNumber(stats.totalStock)}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500">Low Stock Items</div>
          <div className="text-3xl font-bold text-red-600">
            {formatNumber(stats.lowStockCount)}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500">Total Locations</div>
          <div className="text-3xl font-bold text-gray-900">
            {formatNumber(stats.totalLocations)}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500">Floor Plans</div>
          <div className="text-3xl font-bold text-gray-900">
            {formatNumber(stats.totalFloorPlans)}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            Recent Stock Movements
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recentMovements.map((movement) => (
                <tr key={movement.id}>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {movement.productName}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        movement.movementType === 'stock_in'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {movement.movementType === 'stock_in' ? 'In' : 'Out'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {movement.quantity}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
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
