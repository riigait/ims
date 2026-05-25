import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, MapPin, LayoutGrid, List, Edit } from 'lucide-react';
import { formatDate } from '@/utils/ids';
import { floorPlansApi, departmentsApi } from '@/services/api';
import { FloorPlan } from '@/types/floorplan';
import FloorPlanThumbnail from '@/components/floorplan/FloorPlanThumbnail';
import Pagination from '@/components/Pagination';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';

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
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [locationLookupFailed, setLocationLookupFailed] = useState(false);

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

  useEffect(() => {
    const handleStorageChange = () => {
      setLoading(true);
      fetchFloorPlans();
    };

    if (locationId) {
      setLoading(true);
      setLocationLookupFailed(false);
      floorPlansApi.getByLocation(locationId)
        .then(response => navigate(`/floor-plans/${response.data.id}/edit`))
        .catch(error => {
          if (error.response?.status === 404) {
            setLocationLookupFailed(true);
          } else {
            console.error('Failed to locate floor plan:', error);
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(true);
      fetchFloorPlans();
    }

    if (user.role === 'superadmin') {
      departmentsApi.getAll().then(res => setDepartments(res.data)).catch(err => console.error('Failed to fetch departments:', err));
    }
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [locationId, navigate]);

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

  const doDelete = async (id: string) => {
    try {
      await floorPlansApi.delete(id);
      await fetchFloorPlans();
      setConfirmingDeleteId(null);
    } catch (error) {
      console.error('Failed to delete floor plan:', error);
      setConfirmingDeleteId(null);
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

  const paginatedPlans = filteredAndSortedPlans.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const clearAllFilters = () => {
    setSearchTerm('');
    setDepartmentFilter('');
    setSortBy('recently-added');
    setCurrentPage(1);
  };

  if (loading) return <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>;
  if (locationId && locationLookupFailed) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        No floor plan found for this linked location.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text)]">Floor Plans</h1>
          {locationId && (
            <p className="text-sm text-[var(--primary)] mt-1 flex items-center gap-1">
              <MapPin size={14} /> Looking for floor plan with linked location…
            </p>
          )}
        </div>
        {user.role === 'admin' && localStorage.getItem('currentDepartmentId') !== ALL_DEPARTMENTS_ID && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--primary-hover)]">
            <Plus size={20} /> New Floor Plan
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-[var(--surface)] p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-[var(--text)]">Create Floor Plan</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="plan-name" className="block text-sm font-medium text-[var(--text)] mb-1">Floor Plan Name *</label>
                <input id="plan-name" name="name" type="text" value={formData.name} required
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                  placeholder="e.g., Main Warehouse Floor 1" />
              </div>
              <div>
                <label htmlFor="plan-width" className="block text-sm font-medium text-[var(--text)] mb-1">Width (px) *</label>
                <input id="plan-width" name="width" type="number" value={formData.width} required min={100} max={10000}
                  onChange={e => setFormData({ ...formData, width: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
              </div>
              <div>
                <label htmlFor="plan-height" className="block text-sm font-medium text-[var(--text)] mb-1">Height (px) *</label>
                <input id="plan-height" name="height" type="number" value={formData.height} required min={100} max={10000}
                  onChange={e => setFormData({ ...formData, height: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)]">
                Create Floor Plan
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-[var(--surface-2)] rounded-lg hover:bg-[var(--border)]">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="bg-[var(--surface)] rounded-lg shadow p-4 space-y-3">
        <div className="flex gap-2 items-center justify-between">
          <div className="flex gap-2 flex-1">
            <input
              id="search-floor-plans"
              name="search"
              type="text"
              placeholder="Search by floor plan name…"
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]"
              aria-label="Search floor plans"
            />
            <select
              id="sort-by"
              name="sort-by"
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm font-medium bg-[var(--surface-2)] text-[var(--text)]"
              aria-label="Sort by">
              <option value="recently-added">Sort: Recently Added</option>
              <option value="name">Sort: Name</option>
              <option value="object-count">Sort: Object Count</option>
            </select>
            <button
              onClick={clearAllFilters}
              className="text-xs px-3 py-1 bg-[var(--surface-2)] text-[var(--text)] rounded hover:bg-[var(--border)] font-medium">
              Clear
            </button>
          </div>

          <div className="flex gap-1 border border-[var(--border)] rounded flex-shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2 py-1 ${viewMode === 'grid' ? 'bg-[var(--surface-2)] text-[var(--primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-2 py-1 ${viewMode === 'list' ? 'bg-[var(--surface-2)] text-[var(--primary)]' : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {user.role === 'superadmin' && (
          <div className="flex gap-2 flex-wrap">
            <select
              id="filter-department"
              name="filter-department"
              value={departmentFilter}
              onChange={e => { setDepartmentFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]"
              aria-label="Filter by department">
              <option value="">All Departments</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {viewMode === 'grid' ? (
        <>
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
          {filteredAndSortedPlans.length === 0 ? (
            <div className="col-span-full text-center py-16 bg-[var(--surface)] rounded-lg shadow">
              <p className="text-[var(--text-muted)] text-lg mb-1">{floorPlans.length === 0 ? 'No floor plans yet' : 'No floor plans match your filters'}</p>
              {floorPlans.length === 0 && user.role === 'admin' && localStorage.getItem('currentDepartmentId') !== ALL_DEPARTMENTS_ID && (
                <>
                  <p className="text-[var(--text-muted)] text-sm mb-4">Create one to start mapping your warehouse</p>
                  <button onClick={() => setShowForm(true)}
                    className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)]">
                    Create your first floor plan
                  </button>
                </>
              )}
            </div>
          ) : paginatedPlans.map((plan) => {
            const hasLocation = locationId && plan.objects?.some(o => o.linkedLocationId === locationId);
            return (
              <div key={plan.id}
                onClick={() => navigate(`/floor-plans/${plan.id}/edit`)}
                className={`aspect-square bg-[var(--surface)] rounded-lg shadow hover:shadow-lg transition cursor-pointer group flex flex-col ${hasLocation ? 'ring-2 ring-[var(--primary)]' : ''}`}>
                {/* Thumbnail */}
                <div className="flex-1 overflow-hidden rounded-t-lg bg-slate-100">
                  <FloorPlanThumbnail plan={plan} width={400} height={400}
                    highlightLocationId={locationId ?? undefined} />
                </div>

                <div className="p-1.5 flex flex-col gap-1 flex-shrink-0">
                  <h3 className="text-xs font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition truncate line-clamp-1">
                    {plan.name}
                  </h3>
                  {(user.role === 'admin' || user.role === 'superadmin') && (
                    confirmingDeleteId === plan.id ? (
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <span className="text-xs text-[var(--text-muted)] flex-1 leading-tight">Delete?</span>
                        <button onClick={() => doDelete(plan.id)}
                          className="px-1 py-0.5 bg-red-600 text-white text-xs rounded hover:bg-red-700">
                          Yes
                        </button>
                        <button onClick={() => setConfirmingDeleteId(null)}
                          className="px-1 py-0.5 bg-[var(--surface-2)] text-xs rounded hover:bg-[var(--border)]">
                          No
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/floor-plans/${plan.id}/edit`); }}
                          className="flex-1 px-1 py-0.5 bg-[var(--primary)] text-white text-xs rounded hover:bg-[var(--primary-hover)]">
                          Edit
                        </button>
                        <button onClick={e => { e.stopPropagation(); setConfirmingDeleteId(plan.id); }}
                          className="px-1 py-0.5 bg-red-50 text-red-600 text-xs rounded hover:bg-red-100">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {filteredAndSortedPlans.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={filteredAndSortedPlans.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
        )}
        </>
      ) : (
        <>
        <div className="bg-[var(--surface)] rounded-lg shadow overflow-x-auto">
          {filteredAndSortedPlans.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)]">
              <p className="text-[var(--text-muted)] text-lg mb-1">{floorPlans.length === 0 ? 'No floor plans yet' : 'No floor plans match your filters'}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-2)]">
                <tr>
                  <th className="px-4 py-2 text-left text-[var(--text)]">Name</th>
                  <th className="px-4 py-2 text-left text-[var(--text)]">Dimensions</th>
                  <th className="px-4 py-2 text-left text-[var(--text)]">Objects</th>
                  <th className="px-4 py-2 text-left text-[var(--text)]">Department</th>
                  <th className="px-4 py-2 text-left text-[var(--text)]">Date</th>
                  <th className="px-4 py-2 text-right text-[var(--text)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {paginatedPlans.map((plan) => {
                  const departmentsMap = departments.reduce((map, dept) => ({ ...map, [dept.id]: dept.name }), {} as Record<string, string>);
                  const departmentName = plan.departmentId ? departmentsMap[plan.departmentId] : null;
                  return (
                    <tr key={plan.id} className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="px-4 py-2 text-[var(--text)] font-medium cursor-pointer hover:text-[var(--primary)]"
                        onClick={() => navigate(`/floor-plans/${plan.id}/edit`)}>
                        {plan.name}
                      </td>
                      <td className="px-4 py-2 text-[var(--text-muted)]">
                        {plan.width} × {plan.height} px
                      </td>
                      <td className="px-4 py-2 text-[var(--text-muted)]">
                        {plan.objects?.length ?? 0}
                      </td>
                      <td className="px-4 py-2 text-[var(--text)]">
                        {departmentName ? (
                          <span className="bg-[var(--surface-2)] text-[var(--text)] px-2 py-0.5 rounded text-xs">{departmentName}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2 text-[var(--text-muted)] text-sm">{formatDate(plan.createdAt)}</td>
                      <td className="px-4 py-2 text-right">
                        {(user.role === 'admin' || user.role === 'superadmin') && (
                          confirmingDeleteId === plan.id ? (
                            <span className="inline-flex gap-2 items-center">
                              <span className="text-xs text-[var(--text-muted)]">Delete?</span>
                              <button onClick={() => doDelete(plan.id)}
                                className="text-red-600 text-xs hover:text-red-800 font-medium">Yes</button>
                              <button onClick={() => setConfirmingDeleteId(null)}
                                className="text-[var(--text-muted)] text-xs hover:text-[var(--text)] font-medium">No</button>
                            </span>
                          ) : (
                            <span className="inline-flex gap-2 items-center">
                              <button
                                onClick={() => navigate(`/floor-plans/${plan.id}/edit`)}
                                className="text-[var(--primary)] hover:text-[var(--primary-hover)]">
                                <Edit size={18} />
                              </button>
                              <button
                                onClick={() => setConfirmingDeleteId(plan.id)}
                                className="text-red-600 hover:text-red-800">
                                <Trash2 size={18} />
                              </button>
                            </span>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {filteredAndSortedPlans.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={filteredAndSortedPlans.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
        )}
        </>
      )}
      </div>
    </>
  );
}
