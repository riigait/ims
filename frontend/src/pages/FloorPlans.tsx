import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, MapPin, LayoutGrid, List } from 'lucide-react';
import { floorPlansApi, departmentsApi } from '@/services/api';
import { FloorPlan } from '@/types/floorplan';
import FloorPlanThumbnail from '@/components/floorplan/FloorPlanThumbnail';

interface Department {
  id: string;
  name: string;
}

export default function FloorPlans() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [searchParams] = useSearchParams();
  const locationId = searchParams.get('locationId');

  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', width: 1200, height: 800 });
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [sortBy, setSortBy] = useState('recently-added');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    fetchFloorPlans();
    if (user.role === 'superadmin') {
      departmentsApi.getAll().then(res => setDepartments(res.data)).catch(err => console.error('Failed to fetch departments:', err));
    }
  }, []);

  // Auto-navigate to the floor plan that contains the locationId
  useEffect(() => {
    if (!locationId || floorPlans.length === 0) return;
    const match = floorPlans.find(plan =>
      plan.objects?.some(obj => obj.linkedLocationId === locationId)
    );
    if (match) navigate(`/floor-plans/${match.id}/edit`);
  }, [locationId, floorPlans]);

  const fetchFloorPlans = async () => {
    try {
      const response = await floorPlansApi.getAll();
      setFloorPlans(response.data);
    } catch (error) {
      console.error('Failed to fetch floor plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { alert('Floor plan name is required'); return; }
    if (formData.width <= 0 || formData.height <= 0) { alert('Width and height must be positive'); return; }
    try {
      const response = await floorPlansApi.create({
        name: formData.name,
        width: formData.width,
        height: formData.height,
        scale: { pixelsPerMeter: 50 },
        objects: [],
      });
      navigate(`/floor-plans/${response.data.id}/edit`);
    } catch (error) {
      console.error('Failed to create floor plan:', error);
      alert('Failed to create floor plan');
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this floor plan?')) return;
    try {
      await floorPlansApi.delete(id);
      await fetchFloorPlans();
    } catch (error) {
      console.error('Failed to delete floor plan:', error);
      alert('Failed to delete floor plan');
    }
  };

  const filteredAndSortedPlans = floorPlans
    .filter(plan => {
      const matchesSearch = plan.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDept = !departmentFilter || plan.departmentId === departmentFilter;
      return matchesSearch && matchesDept;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'recently-added') return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      if (sortBy === 'object-count') return (b.objects?.length || 0) - (a.objects?.length || 0);
      return 0;
    });

  const clearAllFilters = () => {
    setSearchTerm('');
    setDepartmentFilter('');
    setSortBy('recently-added');
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Floor Plans</h1>
          {locationId && (
            <p className="text-sm text-blue-600 mt-1 flex items-center gap-1">
              <MapPin size={14} /> Looking for floor plan with linked location…
            </p>
          )}
        </div>
        {(user.role === 'admin' || user.role === 'superadmin') && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            <Plus size={20} /> New Floor Plan
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4">Create Floor Plan</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="plan-name" className="block text-sm font-medium text-gray-700 mb-1">Floor Plan Name *</label>
                <input id="plan-name" name="name" type="text" value={formData.name} required
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., Main Warehouse Floor 1" />
              </div>
              <div>
                <label htmlFor="plan-width" className="block text-sm font-medium text-gray-700 mb-1">Width (px) *</label>
                <input id="plan-width" name="width" type="number" value={formData.width} required min={100} max={10000}
                  onChange={e => setFormData({ ...formData, width: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label htmlFor="plan-height" className="block text-sm font-medium text-gray-700 mb-1">Height (px) *</label>
                <input id="plan-height" name="height" type="number" value={formData.height} required min={100} max={10000}
                  onChange={e => setFormData({ ...formData, height: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Create Floor Plan
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search by floor plan name…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm"
              aria-label="Search floor plans"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {user.role === 'superadmin' && (
              <select
                value={departmentFilter}
                onChange={e => setDepartmentFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded text-sm"
                aria-label="Filter by department">
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            )}

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded text-sm font-medium bg-blue-50"
              aria-label="Sort by">
              <option value="recently-added">Sort: Recently Added</option>
              <option value="name">Sort: Name</option>
              <option value="object-count">Sort: Object Count</option>
            </select>
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={clearAllFilters}
              className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 font-medium">
              Clear All Filters
            </button>

            <div className="flex gap-1 border border-gray-300 rounded">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-2 py-1 ${viewMode === 'grid' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                title="Grid view"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-2 py-1 ${viewMode === 'list' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                title="List view"
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAndSortedPlans.length === 0 ? (
            <div className="col-span-full text-center py-16 bg-white rounded-lg shadow">
              <p className="text-gray-400 text-lg mb-1">{floorPlans.length === 0 ? 'No floor plans yet' : 'No floor plans match your filters'}</p>
              {floorPlans.length === 0 && (
                <>
                  <p className="text-gray-400 text-sm mb-4">Create one to start mapping your warehouse</p>
                  {user.role === 'admin' && (
                    <button onClick={() => setShowForm(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                      Create your first floor plan
                    </button>
                  )}
                </>
              )}
            </div>
          ) : filteredAndSortedPlans.map((plan) => {
            const hasLocation = locationId && plan.objects?.some(o => o.linkedLocationId === locationId);
            const departmentsMap = departments.reduce((map, dept) => ({ ...map, [dept.id]: dept.name }), {} as Record<string, string>);
            const departmentName = plan.departmentId ? departmentsMap[plan.departmentId] : null;
            return (
              <div key={plan.id}
                onClick={() => navigate(`/floor-plans/${plan.id}/edit`)}
                className={`bg-white rounded-lg shadow hover:shadow-lg transition cursor-pointer group ${hasLocation ? 'ring-2 ring-blue-500' : ''}`}>
                {/* Thumbnail */}
                <div className="h-44 overflow-hidden rounded-t-lg bg-slate-100">
                  <FloorPlanThumbnail plan={plan} width={400} height={176}
                    highlightLocationId={locationId ?? undefined} />
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-600 transition">
                        {plan.name}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {plan.width} × {plan.height} px &nbsp;·&nbsp; {plan.objects?.length ?? 0} objects
                      </p>
                      {user.role === 'superadmin' && departmentName && (
                        <p className="text-xs text-gray-500 mt-1">
                          <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs inline-block">{departmentName}</span>
                        </p>
                      )}
                    </div>
                    {hasLocation && (
                      <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0">
                        <MapPin size={10} /> Linked
                      </span>
                    )}
                  </div>

                  {(user.role === 'admin' || user.role === 'superadmin') && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={e => { e.stopPropagation(); navigate(`/floor-plans/${plan.id}/edit`); }}
                        className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
                        Edit
                      </button>
                      <button onClick={e => handleDelete(plan.id, e)}
                        className="px-3 py-1.5 bg-red-50 text-red-600 text-sm rounded hover:bg-red-100">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          {filteredAndSortedPlans.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-gray-400 text-lg mb-1">{floorPlans.length === 0 ? 'No floor plans yet' : 'No floor plans match your filters'}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Name</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Dimensions</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Objects</th>
                  {user.role === 'superadmin' && <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Department</th>}
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredAndSortedPlans.map((plan) => {
                  const departmentsMap = departments.reduce((map, dept) => ({ ...map, [dept.id]: dept.name }), {} as Record<string, string>);
                  const departmentName = plan.departmentId ? departmentsMap[plan.departmentId] : null;
                  return (
                    <tr key={plan.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium cursor-pointer hover:text-blue-600"
                        onClick={() => navigate(`/floor-plans/${plan.id}/edit`)}>
                        {plan.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {plan.width} × {plan.height} px
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {plan.objects?.length ?? 0}
                      </td>
                      {user.role === 'superadmin' && (
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {departmentName ? (
                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">{departmentName}</span>
                          ) : '—'}
                        </td>
                      )}
                      <td className="px-6 py-4 text-sm space-x-2">
                        {(user.role === 'admin' || user.role === 'superadmin') && (
                          <>
                            <button
                              onClick={() => navigate(`/floor-plans/${plan.id}/edit`)}
                              className="text-blue-600 hover:text-blue-800 font-medium">
                              Edit
                            </button>
                            <button
                              onClick={e => handleDelete(plan.id, e)}
                              className="text-red-600 hover:text-red-800">
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
