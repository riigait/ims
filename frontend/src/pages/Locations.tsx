import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, ChevronRight } from 'lucide-react';
import { locationsApi } from '@/services/api';
import { Location } from '@/types/inventory';

export default function Locations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedParent, setExpandedParent] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    type: 'room' as Location['type'],
    parentId: '',
    notes: '',
  });

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const response = await locationsApi.getAll();
      setLocations(response.data);
    } catch (error) {
      console.error('Failed to fetch locations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('Location name is required');
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
      setFormData({
        name: '',
        type: 'room',
        parentId: '',
        notes: '',
      });
    } catch (error) {
      console.error('Failed to save location:', error);
      alert('Failed to save location');
    }
  };

  const handleEdit = (location: Location) => {
    setFormData({
      name: location.name,
      type: location.type,
      parentId: location.parentId || '',
      notes: location.notes || '',
    });
    setEditingId(location.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure? This will delete all sub-locations.')) return;

    try {
      await locationsApi.delete(id);
      await fetchLocations();
    } catch (error) {
      console.error('Failed to delete location:', error);
      alert('Failed to delete location');
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      name: '',
      type: 'room',
      parentId: '',
      notes: '',
    });
  };

  const getChildren = (parentId: string | undefined) => {
    return locations.filter((loc) => loc.parentId === parentId);
  };


  const rootLocations = locations.filter((loc) => !loc.parentId);

  const renderLocationTree = (location: Location, depth: number = 0) => {
    const children = getChildren(location.id);
    const isExpanded = expandedParent === location.id;

    return (
      <div key={location.id}>
        <div
          className="flex items-center gap-2 p-3 bg-gray-50 border-b hover:bg-gray-100"
          style={{ marginLeft: `${depth * 20}px` }}
        >
          {children.length > 0 && (
            <button
              onClick={() =>
                setExpandedParent(isExpanded ? null : location.id)
              }
              className="text-gray-400"
            >
              <ChevronRight
                size={16}
                style={{
                  transform: isExpanded ? 'rotate(90deg)' : '',
                }}
              />
            </button>
          )}
          <div className="flex-1">
            <div className="font-medium text-gray-900">{location.name}</div>
            <div className="text-xs text-gray-500">{location.type}</div>
          </div>
          <div className="space-x-2">
            <button
              onClick={() => handleEdit(location)}
              className="text-blue-600 hover:text-blue-800"
            >
              <Edit size={16} />
            </button>
            <button
              onClick={() => handleDelete(location.id)}
              className="text-red-600 hover:text-red-800"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {isExpanded && children.length > 0 && (
          <div>
            {children.map((child) => renderLocationTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Locations</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Add Location
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4">
            {editingId ? 'Edit Location' : 'New Location'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="location-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Location Name *
                </label>
                <input
                  id="location-name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label htmlFor="location-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Type *
                </label>
                <select
                  id="location-type"
                  name="type"
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      type: e.target.value as Location['type'],
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
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
                <label htmlFor="parent-location" className="block text-sm font-medium text-gray-700 mb-1">
                  Parent Location
                </label>
                <select
                  id="parent-location"
                  name="parentId"
                  value={formData.parentId}
                  onChange={(e) =>
                    setFormData({ ...formData, parentId: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
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
              <label htmlFor="location-notes" className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                id="location-notes"
                name="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                rows={2}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {rootLocations.length > 0 ? (
          <div>
            {rootLocations.map((loc) => renderLocationTree(loc))}
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500">
            No locations yet. Create your first location.
          </div>
        )}
      </div>
    </div>
  );
}
