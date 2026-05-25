import { useState, useEffect } from 'react';
import { X, Edit, Trash2, ChevronRight } from 'lucide-react';
import { locationsApi, departmentsApi } from '@/services/api';
import { formatDate } from '@/utils/ids';
import { Location } from '@/types/inventory';
import DataPageLayout from '@/components/layout/DataPageLayout';
import Pagination from '@/components/Pagination';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';

interface Department {
  id: string;
  name: string;
}

export default function Locations() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [sortBy, setSortBy] = useState('recently-added');
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<Location | null>(null);
  const [drawerEditing, setDrawerEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [formData, setFormData] = useState({
    name: '', type: 'room' as Location['type'], parentId: '', notes: '',
  });
  const [formError, setFormError] = useState('');

  const fetchLocations = async () => {
    try {
      const [locationsRes, deptRes] = await Promise.all([
        locationsApi.getAll(),
        departmentsApi.getAll(),
      ]);
      setLocations(locationsRes.data);
      setDepartments(deptRes.data);
    } catch (err) {
      console.error('Failed to fetch locations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleStorageChange = () => { setLoading(true); fetchLocations(); };
    setLoading(true);
    fetchLocations();
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const openNewDrawer = () => {
    setDrawerItem(null);
    setFormData({ name: '', type: 'room', parentId: '', notes: '' });
    setFormError('');
    setDrawerEditing(true);
    setConfirmingDelete(false);
    setDrawerOpen(true);
  };

  const openViewDrawer = (location: Location) => {
    setDrawerItem(location);
    setFormError('');
    setDrawerEditing(false);
    setConfirmingDelete(false);
    setDrawerOpen(true);
  };

  const startEdit = (location: Location) => {
    const currentDeptId = localStorage.getItem('currentDepartmentId');
    if (currentDeptId === ALL_DEPARTMENTS_ID && location.departmentId) {
      localStorage.setItem('currentDepartmentId', location.departmentId);
      window.location.reload();
      return;
    }
    setFormData({
      name: location.name,
      type: location.type,
      parentId: location.parentId || '',
      notes: location.notes || '',
    });
    setFormError('');
    setConfirmingDelete(false);
    setDrawerEditing(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerItem(null);
    setDrawerEditing(false);
    setConfirmingDelete(false);
    setFormData({ name: '', type: 'room', parentId: '', notes: '' });
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Location name is required');
      return;
    }
    try {
      if (drawerItem) {
        await locationsApi.update(drawerItem.id, formData);
        setDrawerItem({ ...drawerItem, ...formData });
        setDrawerEditing(false);
      } else {
        await locationsApi.create(formData);
        closeDrawer();
      }
      await fetchLocations();
      setFormError('');
    } catch {
      setFormError('Failed to save location');
    }
  };

  const doDelete = async () => {
    if (!drawerItem) return;
    try {
      await locationsApi.delete(drawerItem.id);
      await fetchLocations();
      closeDrawer();
    } catch {
      setError('Failed to delete location');
      setConfirmingDelete(false);
    }
  };

  const filteredLocations = locations.filter(loc => {
    const matchesSearch = loc.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !typeFilter || loc.type === typeFilter;
    const matchesDept = !departmentFilter || loc.departmentId === departmentFilter;
    return matchesSearch && matchesType && matchesDept;
  });

  const sortedLocations = [...filteredLocations].sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'recently-added') return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    return 0;
  });
  const paginatedLocations = sortedLocations.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const locationTypes = Array.from(new Set(locations.map(l => l.type))).sort();

  const clearAllFilters = () => {
    setSearchTerm('');
    setTypeFilter('');
    setDepartmentFilter('');
    setSortBy('recently-added');
    setCurrentPage(1);
  };

  const getParentName = (parentId: string | undefined) => {
    if (!parentId) return '—';
    return locations.find(l => l.id === parentId)?.name ?? '—';
  };

  if (loading) return <div className="text-center py-12">Loading...</div>;

  const filterContent = (
    <>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search by location name…"
          value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]"
        />
        <select
          value={sortBy}
          onChange={e => { setSortBy(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm font-medium bg-[var(--surface-2)] text-[var(--text)]">
          <option value="recently-added">Sort: Recently Added</option>
          <option value="name">Sort: Name</option>
        </select>
        <button
          onClick={clearAllFilters}
          className="text-xs px-3 py-1 bg-[var(--surface-2)] text-[var(--text-muted)] rounded hover:bg-[var(--border)] font-medium">
          Clear
        </button>
      </div>
      <div className="flex gap-2 flex-wrap">
        <select
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1); }}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
          <option value="">All Types</option>
          {locationTypes.map(type => (
            <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
          ))}
        </select>
        {user.role === 'superadmin' && (
          <select
            value={departmentFilter}
            onChange={e => { setDepartmentFilter(e.target.value); setCurrentPage(1); }}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
            <option value="">All Departments</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </select>
        )}
      </div>
    </>
  );

  return (
    <>
      <DataPageLayout
        title="Locations"
        error={error}
        showForm={false}
        formContent={null}
        onAddClick={openNewDrawer}
        showAddButton={user.role === 'admin' && localStorage.getItem('currentDepartmentId') !== ALL_DEPARTMENTS_ID}
        filterContent={filterContent}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
              <tr>
                <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Name</th>
                <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Type</th>
                <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Parent</th>
                <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Department</th>
                <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Date</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {sortedLocations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    {searchTerm ? 'No locations match your search.' : 'No locations yet. Create your first location.'}
                  </td>
                </tr>
              ) : paginatedLocations.map((location) => {
                const dept = location.departmentId ? departments.find(d => d.id === location.departmentId) : null;
                return (
                  <tr
                    key={location.id}
                    onClick={() => openViewDrawer(location)}
                    className="hover:bg-[var(--surface-2)] transition-colors cursor-pointer">
                    <td className="px-4 py-2 text-[var(--text)] font-medium">{location.name}</td>
                    <td className="px-4 py-2 text-[var(--text-muted)] capitalize">{location.type}</td>
                    <td className="px-4 py-2 text-[var(--text-muted)]">{getParentName(location.parentId)}</td>
                    <td className="px-4 py-2 text-[var(--text)]">{dept?.name ?? '—'}</td>
                    <td className="px-4 py-2 text-[var(--text-muted)] text-sm">{formatDate(location.createdAt)}</td>
                    <td className="px-4 py-2 text-right">
                      <ChevronRight size={16} className="text-[var(--text-muted)] inline-block" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sortedLocations.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalItems={sortedLocations.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
        )}
      </DataPageLayout>

      {/* Right-Side Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={closeDrawer} />
          <div className="w-full max-w-lg bg-[var(--surface)] border-l border-[var(--border)] flex flex-col h-full overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-start justify-between flex-shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  {!drawerItem ? 'New Location' : drawerEditing ? 'Edit Location' : drawerItem.name}
                </h2>
                {drawerItem && !drawerEditing && (
                  <p className="text-sm text-[var(--text-muted)] mt-0.5 capitalize">{drawerItem.type}</p>
                )}
              </div>
              <button onClick={closeDrawer} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)] flex-shrink-0 ml-2">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {drawerEditing ? (
                <form id="location-form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Location Name *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]"
                        autoFocus
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Type *</label>
                      <select
                        value={formData.type}
                        onChange={e => setFormData({ ...formData, type: e.target.value as Location['type'] })}
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]">
                        <option value="branch">Branch</option>
                        <option value="building">Building</option>
                        <option value="floor">Floor</option>
                        <option value="room">Room</option>
                        <option value="rack">Rack</option>
                        <option value="shelf">Shelf</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Parent Location</label>
                      <select
                        value={formData.parentId}
                        onChange={e => setFormData({ ...formData, parentId: e.target.value })}
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]">
                        <option value="">None (Root)</option>
                        {locations
                          .filter(loc => loc.id !== drawerItem?.id)
                          .map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
                          ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Notes</label>
                      <textarea
                        value={formData.notes}
                        onChange={e => setFormData({ ...formData, notes: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]"
                      />
                    </div>
                  </div>
                  {formError && <p className="text-red-500 text-sm">{formError}</p>}
                </form>
              ) : drawerItem && (
                <div className="space-y-6">
                  <section>
                    <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Details</h3>
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Name</p>
                        <p className="text-sm font-medium text-[var(--text)]">{drawerItem.name}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Type</p>
                        <p className="text-sm text-[var(--text)] capitalize">{drawerItem.type}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Parent Location</p>
                        <p className="text-sm text-[var(--text)]">{getParentName(drawerItem.parentId)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Department</p>
                        <p className="text-sm text-[var(--text)]">{departments.find(d => d.id === drawerItem.departmentId)?.name ?? '—'}</p>
                      </div>
                      {drawerItem.notes && (
                        <div>
                          <p className="text-xs text-[var(--text-muted)] mb-0.5">Notes</p>
                          <p className="text-sm text-[var(--text)]">{drawerItem.notes}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-[var(--text-muted)] mb-0.5">Date Added</p>
                        <p className="text-sm text-[var(--text)]">{formatDate(drawerItem.createdAt)}</p>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--border)] flex-shrink-0">
              {drawerEditing ? (
                <div className="flex gap-2">
                  <button type="submit" form="location-form"
                    className="px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                    Save
                  </button>
                  <button type="button" onClick={() => drawerItem ? setDrawerEditing(false) : closeDrawer()}
                    className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                    Cancel
                  </button>
                </div>
              ) : confirmingDelete ? (
                <div className="w-full">
                  <p className="text-sm font-medium text-[var(--text)] mb-3">Delete "{drawerItem?.name}"?</p>
                  <div className="flex gap-2">
                    <button onClick={doDelete}
                      className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">
                      Yes, Delete
                    </button>
                    <button onClick={() => setConfirmingDelete(false)}
                      className="px-4 py-2 border border-[var(--border)] text-sm rounded-lg text-[var(--text)] hover:bg-[var(--surface-2)]">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : user.role === 'admin' && (
                <div className="flex gap-2">
                  <button onClick={() => drawerItem && startEdit(drawerItem)}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)]">
                    <Edit size={14} /> Edit
                  </button>
                  <button onClick={() => setConfirmingDelete(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
