import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, MapPin } from 'lucide-react';
import { floorPlansApi } from '@/services/api';
import { FloorPlan } from '@/types/floorplan';
import FloorPlanThumbnail from '@/components/floorplan/FloorPlanThumbnail';

export default function FloorPlans() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const locationId = searchParams.get('locationId');

  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', width: 1200, height: 800 });

  useEffect(() => {
    fetchFloorPlans();
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
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          <Plus size={20} /> New Floor Plan
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4">Create Floor Plan</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Floor Plan Name *</label>
                <input type="text" value={formData.name} required
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., Main Warehouse Floor 1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Width (px) *</label>
                <input type="number" value={formData.width} required min={100} max={10000}
                  onChange={e => setFormData({ ...formData, width: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Height (px) *</label>
                <input type="number" value={formData.height} required min={100} max={10000}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {floorPlans.map((plan) => {
          const hasLocation = locationId && plan.objects?.some(o => o.linkedLocationId === locationId);
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
                  </div>
                  {hasLocation && (
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0">
                      <MapPin size={10} /> Linked
                    </span>
                  )}
                </div>

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
              </div>
            </div>
          );
        })}
      </div>

      {floorPlans.length === 0 && !showForm && (
        <div className="text-center py-16 bg-white rounded-lg shadow">
          <p className="text-gray-400 text-lg mb-1">No floor plans yet</p>
          <p className="text-gray-400 text-sm mb-4">Create one to start mapping your warehouse</p>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Create your first floor plan
          </button>
        </div>
      )}
    </div>
  );
}
