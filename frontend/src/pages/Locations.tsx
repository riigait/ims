import { useState, useEffect } from 'react';
import { Edit, Trash2 } from 'lucide-react';
import { locationsApi, departmentsApi } from '@/services/api';
import { Location } from '@/types/inventory';
import DataPageLayout from '@/components/layout/DataPageLayout';
import ConfirmDialog from '@/components/ConfirmDialog';
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
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [sortBy, setSortBy] = useState('recently-added');
  const [formData, setFormData] = useState({
    name: '', type: 'room' as Location['type'], parentId: '', notes: '',
  });
  const [wasInAllDepartmentsMode, setWasInAllDepartmentsMode] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchLocations = async () => {
    try {
      const [locationsRes, deptRes] = await Promise.all([
        locationsApi.getAll(),
        user.role === 'superadmin' ? departmentsApi.getAll() : Promise.resolve({ data: [] }),
      ]);
      setLocations(locationsRes.data);
      setDepartments(deptRes.data);
    } catch (error) {
      console.error('Failed to fetch locations:', error);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Location name is required');
      return;
    }
    try {
      if (editingId) {
        await locationsApi.update(editingId, formData);
      } else {
        await locationsApi.create(formData);
      }
      await fetchLocations();
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: '', type: 'room', parentId: '', notes: '' });
      setError('');
      if (wasInAllDepartmentsMode) {
        localStorage.setItem('currentDepartmentId', ALL_DEPARTMENTS_ID);
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to save location:', error);
      setError('Failed to save location');
    }
  };

  const handleEdit = (location: Location) => {
    const currentDeptId = localStorage.getItem('currentDepartmentId');
    const isInAllDepartmentsMode = currentDeptId === ALL_DEPARTMENTS_ID;
    if (isInAllDepartmentsMode && location.departmentId) {
      setWasInAllDepartmentsMode(true);
      localStorage.setItem('currentDepartmentId', location.departmentId);
      window.location.reload();
      return;
    }
    setFormData({
      name: location.name, type: location.type, parentId: location.parentId || '', notes: location.notes || '',
    });
    setEditingId(location.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await locationsApi.delete(deleteConfirm);
      await fetchLocations();
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Failed to delete location:', error);
      setError('Failed to delete location');
      setDeleteConfirm(null);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: '', type: 'room', parentId: '', notes: '' });
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

  const locationTypes = Array.from(new Set(locations.map(l => l.type))).sort();

  const clearAllFilters = () => {
    setSearchTerm('');
    setTypeFilter('');
    setDepartmentFilter('');
    setSortBy('recently-added');
  };

  const getParentName = (parentId: string | undefined) => {
    if (!parentId) return '—';
    return locations.find(l => l.id === parentId)?.name ?? '—';
  };

  if (loading) return <div className="text-center py-12">Loading...</div>;

  const formContent = (
    <>
      <h2 className="text-xl font-semibold mb-4 text-[var(--text)]">
        {editingId ? 'Edit Location' : 'New Location'}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="location-name" className="block text-sm font-medium text-[var(--text)] mb-1">
              Location Name *
            </label>
            <input
              id="location-name"
              name="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
              required
            />
          </div>

          <div>
            <label htmlFor="location-type" className="block text-sm font-medium text-[var(--text)] mb-1">
              Type *
            </label>
            <select
              id="location-type"
              name="type"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as Location['type'] })}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
            >
              <option value="branch">Branch</option>
              <option value="building">Building</option>
              <option value="floor">Floor</option>
              <option value="room">Room</option>
              <option value="rack">Rack</option>
              <option value="shelf">Shelf</option>
            </select>
          </div>

          <div>
            <label htmlFor="parent-location" className="block text-sm font-medium text-[var(--text)] mb-1">
              Parent Location
            </label>
            <select
              id="parent-location"
              name="parentId"
              value={formData.parentId}
              onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
            >
              <option value="">None (Root)</option>
              {locations
                .filter((loc) => loc.id !== editingId)
                .map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.type})
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="location-notes" className="block text-sm font-medium text-[var(--text)] mb-1">
            Notes
          </label>
          <textarea
            id="location-notes"
            name="notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
            rows={2}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)]"
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 bg-[var(--surface-2)] text-[var(--text)] rounded-lg hover:bg-[var(--border)]"
          >
            Cancel
          </button>
        </div>
      </form>
    </>
  );

  const filterContent = (
    <>
      <div className="flex gap-2">
        <input
          id="search-locations"
          name="search"
          type="text"
          placeholder="Search by location name…"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]"
          aria-label="Search locations"
        />
        <select
          id="sort-by"
          name="sort-by"
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm font-medium bg-[var(--surface-2)] text-[var(--text)]"
          aria-label="Sort by">
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
          id="filter-type"
          name="filter-type"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]"
          aria-label="Filter by location type">
          <option value="">All Types</option>
          {locationTypes.map(type => (
            <option key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </option>
          ))}
        </select>
        {user.role === 'superadmin' && (
          <select
            id="filter-department"
            name="filter-department"
            value={departmentFilter}
            onChange={e => setDepartmentFilter(e.target.value)}
            className="px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]"
            aria-label="Filter by department">
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
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Location"
          message="Are you sure? This will delete all sub-locations."
          confirmText="Delete"
          cancelText="Cancel"
          isDangerous
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
      <DataPageLayout
        title="Locations"
        error={error}
        showForm={showForm}
        onAddClick={() => setShowForm(true)}
        showAddButton={user.role === 'admin' && localStorage.getItem('currentDepartmentId') !== ALL_DEPARTMENTS_ID}
        formContent={formContent}
        filterContent={filterContent}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
            <tr>
              <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Name</th>
              <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Type</th>
              <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Parent Location</th>
              {user.role === 'superadmin' && (
                <th className="px-4 py-2 text-left text-[var(--text)] font-semibold">Department</th>
              )}
              {user.role !== 'superadmin' && (
                <th className="px-4 py-2 text-right text-[var(--text)] font-semibold">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {sortedLocations.length === 0 ? (
              <tr>
                <td colSpan={user.role === 'superadmin' ? 4 : 4} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  {searchTerm ? 'No locations match your search.' : 'No locations yet. Create your first location.'}
                </td>
              </tr>
            ) : sortedLocations.map((location) => {
              const dept = location.departmentId ? departments.find(d => d.id === location.departmentId) : null;
              return (
                <tr key={location.id} className="hover:bg-[var(--surface-2)] transition-colors">
                  <td className="px-4 py-2 text-[var(--text)]">{location.name}</td>
                  <td className="px-4 py-2 text-[var(--text-muted)]">{location.type}</td>
                  <td className="px-4 py-2 text-[var(--text-muted)]">{getParentName(location.parentId)}</td>
                  {user.role === 'superadmin' && (
                    <td className="px-4 py-2 text-[var(--text)]">{dept?.name ?? '—'}</td>
                  )}
                  <td className="px-4 py-2 text-right space-x-2">
                    {user.role === 'admin' && (
                      <>
                        <button
                          onClick={() => handleEdit(location)}
                          className="text-[var(--primary)] hover:text-[var(--primary-hover)]">
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(location.id)}
                          className="text-red-600 hover:text-red-700">
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </DataPageLayout>
    </>
  );
}
