import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, MapPin, LayoutGrid, List, Edit, Sparkles, CheckCircle, XCircle, RefreshCw, BookmarkCheck, ChevronDown, ChevronUp, Info, AlertTriangle } from 'lucide-react';
import { formatDate } from '@/utils/ids';
import { floorPlansApi, departmentsApi } from '@/services/api';
import { FloorPlan } from '@/types/floorplan';
import FloorPlanThumbnail from '@/components/floorplan/FloorPlanThumbnail';
import Pagination from '@/components/Pagination';
import { ALL_DEPARTMENTS_ID } from '@/constants/app';
import { validateFloorplanObjects } from '@/utils/floorplanValidation';

interface Department {
  id: string;
  name: string;
}

const AUTO_GENERATE_TEMPLATES = [
  'Office layout',
  'Storage room',
  'Server room',
  'SCADA control room',
  'Dormitory',
  'Warehouse',
  'Reception',
];

// Inline rules for the preview panel (mirrors backend TEMPLATE_RULES)
const TEMPLATE_RULES_PREVIEW: Record<string, {
  description: string;
  requiredRooms: string[];
  relationships: Array<{ type: string; source: string; target?: string; description: string }>;
  mustHave: string[];
}> = {
  'Office layout': {
    description: 'Reception near entrance, meeting room near work area, storage accessible from office.',
    requiredRooms: ['Reception', 'Open Office Work Area', 'Meeting/Training Room', 'Equipment Storage'],
    relationships: [
      { type: 'near', source: 'Reception', target: 'Entrance', description: 'Reception at front entrance' },
      { type: 'near', source: 'Meeting Room', target: 'Work Area', description: 'Meeting room near work area' },
      { type: 'near', source: 'Storage', target: 'Work Area', description: 'Storage accessible from work area' },
    ],
    mustHave: ['Front Entry', 'Meeting Room', 'Storage Area'],
  },
  'Reception': {
    description: 'Waiting area at entrance, admin desk visible from door, restricted back office.',
    requiredRooms: ['Reception / Waiting Area', 'Open Office Work Area', 'Meeting/Training Room', 'Equipment Storage'],
    relationships: [
      { type: 'near', source: 'Reception', target: 'Entrance', description: 'Waiting area at front door' },
    ],
    mustHave: ['Front Entry', 'Waiting Area'],
  },
  'Storage room': {
    description: 'Rack aisles and bulk storage with clear walking paths, receiving area near door.',
    requiredRooms: ['Rack Aisle Storage', 'Bulk Storage', 'Receiving/Dispatch Bay', 'Warehouse Office'],
    relationships: [
      { type: 'near', source: 'Receiving/Dispatch', target: 'Main Door', description: 'Receiving bay near roll-up door' },
    ],
    mustHave: ['Roll-up Door', 'Walking Aisle'],
  },
  'Warehouse': {
    description: 'Same as storage — clear flow from receiving to dispatch with labeled aisles.',
    requiredRooms: ['Rack Aisle Storage', 'Bulk Storage', 'Receiving/Dispatch Bay', 'Warehouse Office'],
    relationships: [
      { type: 'near', source: 'Receiving/Dispatch', target: 'Main Door', description: 'Receiving bay near roll-up door' },
      { type: 'near', source: 'Office', target: 'Receiving', description: 'Office has visibility to receiving' },
    ],
    mustHave: ['Roll-up Door', 'Walking Aisle', 'Receiving Bay'],
  },
  'Server room': {
    description: 'Server room adjacent to network room, access control door, not publicly accessible.',
    requiredRooms: ['Server Room', 'Network/Electrical Room', 'Operator Workstations', 'Controlled Spares'],
    relationships: [
      { type: 'near', source: 'Server Room', target: 'Network Room', description: 'Adjacent to network/electrical room' },
      { type: 'restricted', source: 'Server Room', description: 'Requires access control — not public' },
      { type: 'away_from', source: 'Server Room', target: 'Public Area', description: 'Away from reception/public zones' },
    ],
    mustHave: ['Access Control Door', 'Cooling Space'],
  },
  'SCADA control room': {
    description: 'SCADA consoles near server room, operator desks with display wall, restricted access.',
    requiredRooms: ['SCADA Console Room', 'Network/Electrical Room', 'Operator Workstations', 'Controlled Spares'],
    relationships: [
      { type: 'near', source: 'Console Room', target: 'Operator Area', description: 'Operators need line of sight to consoles' },
      { type: 'restricted', source: 'SCADA Room', description: 'Access-controlled — not publicly accessible' },
    ],
    mustHave: ['Access Control Door', 'Cooling Space', 'Secure Entry'],
  },
  'Dormitory': {
    description: 'Bedrooms grouped around hallway, utility near rooms, common area centrally located.',
    requiredRooms: ['Dorm Rooms', 'Common Area', 'Utility/Service', 'Linen/Equipment Storage'],
    relationships: [
      { type: 'near', source: 'Utility', target: 'Dorm Rooms', description: 'Utility accessible from bedrooms' },
      { type: 'near', source: 'Common Area', target: 'Hallway', description: 'Common area near hallway' },
      { type: 'away_from', source: 'Kitchen/Utility', target: 'Bedrooms', description: 'Dirty kitchen away from sleeping areas' },
    ],
    mustHave: ['Hallway Access', 'Shared Bathroom', 'Common Area'],
  },
};

type AutoGenerateStatus = {
  type: 'info' | 'success' | 'error';
  message: string;
} | null;

type FeedbackState = 'approved' | 'bad_layout' | null;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const SCORE_COLOR = (score: number) =>
  score >= 80 ? 'text-green-600 bg-green-50 border-green-200' :
  score >= 50 ? 'text-yellow-600 bg-yellow-50 border-yellow-200' :
  'text-red-600 bg-red-50 border-red-200';

export default function FloorPlans() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const currentDepartmentId = localStorage.getItem('currentDepartmentId');
  const canManageFloorPlans = user.role === 'superadmin' || (user.role === 'admin' && Boolean(currentDepartmentId) && currentDepartmentId !== ALL_DEPARTMENTS_ID);
  const [searchParams] = useSearchParams();
  const locationId = searchParams.get('locationId');

  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', width: 1200, height: 800, departmentId: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [sortBy, setSortBy] = useState('recently-added');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [locationLookupFailed, setLocationLookupFailed] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [showAutoGenerateConfirm, setShowAutoGenerateConfirm] = useState(false);
  const [autoGenerateStatus, setAutoGenerateStatus] = useState<AutoGenerateStatus>(null);
  const [autoGenerateCount, setAutoGenerateCount] = useState(3);
  const [autoGenerateTemplates, setAutoGenerateTemplates] = useState<string[]>(['Office layout', 'Storage room', 'SCADA control room']);
  const [showRulesPreview, setShowRulesPreview] = useState(false);

  // Per-plan feedback state: planId -> feedback value
  const [planFeedback, setPlanFeedback] = useState<Record<string, FeedbackState>>({});
  // Per-plan regenerating state
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  // Per-plan saving-as-template state
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);

  const fetchFloorPlans = async () => {
    try {
      const response = await floorPlansApi.getAll();
      setFloorPlans(response.data);
      // Seed feedback state from isApproved
      const fb: Record<string, FeedbackState> = {};
      response.data.forEach((p: any) => {
        if (p.isApproved) fb[p.id] = 'approved';
      });
      setPlanFeedback(fb);
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

  const openCreateForm = () => {
    setFormData(current => ({
      ...current,
      departmentId: user.role === 'superadmin' ? departmentFilter : current.departmentId,
    }));
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { alert('Floor plan name is required'); return; }
    if (formData.width <= 0 || formData.height <= 0) { alert('Width and height must be positive'); return; }
    const selectedDepartmentId = user.role === 'superadmin' ? formData.departmentId : undefined;
    if (user.role === 'superadmin' && !selectedDepartmentId) { alert('Department is required'); return; }
    try {
      const response = await floorPlansApi.create({
        name: formData.name,
        width: formData.width,
        height: formData.height,
        scale: { pixelsPerMeter: 50 },
        objects: [],
        ...(selectedDepartmentId ? { departmentId: selectedDepartmentId } : {}),
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

  const openAutoGenerateConfirm = () => {
    const selectedDepartmentId = user.role === 'superadmin' ? departmentFilter : currentDepartmentId;
    if (!selectedDepartmentId || selectedDepartmentId === ALL_DEPARTMENTS_ID) {
      setAutoGenerateStatus({ type: 'error', message: 'Select one department before auto-generating floor plans.' });
      return;
    }
    setShowAutoGenerateConfirm(true);
  };

  const handleAutoGenerate = async () => {
    const selectedDepartmentId = user.role === 'superadmin' ? departmentFilter : currentDepartmentId;
    if (!selectedDepartmentId || selectedDepartmentId === ALL_DEPARTMENTS_ID) {
      setAutoGenerateStatus({ type: 'error', message: 'Select one department before auto-generating floor plans.' });
      return;
    }

    try {
      setShowAutoGenerateConfirm(false);
      setAutoGenerating(true);
      setAutoGenerateStatus({ type: 'info', message: 'Applying template rules and relationship constraints...' });
      const response = await floorPlansApi.autoGenerate({
        count: autoGenerateCount,
        templates: autoGenerateTemplates,
        ...(user.role === 'superadmin' ? { departmentId: selectedDepartmentId } : {}),
      });
      setAutoGenerateStatus({ type: 'info', message: 'Validating and scoring generated layouts...' });
      await wait(700);
      await fetchFloorPlans();
      setAutoGenerateStatus({ type: 'success', message: response.data.message || 'Floor plans generated.' });
      window.setTimeout(() => setAutoGenerateStatus(null), 5000);
    } catch (error: any) {
      console.error('Failed to auto-generate floor plans:', error);
      setAutoGenerateStatus({ type: 'error', message: error.response?.data?.error || 'Failed to auto-generate floor plans.' });
    } finally {
      setAutoGenerating(false);
    }
  };

  const handleFeedback = async (planId: string, feedback: 'approved' | 'bad_layout') => {
    try {
      await floorPlansApi.feedback(planId, { feedback });
      setPlanFeedback(prev => ({ ...prev, [planId]: feedback }));
      if (feedback === 'approved') {
        setFloorPlans(prev => prev.map(p => p.id === planId ? { ...p, isApproved: true } : p));
      }
    } catch (error) {
      console.error('Failed to save feedback:', error);
    }
  };

  const handleRegenerate = async (planId: string) => {
    try {
      setRegeneratingId(planId);
      const response = await floorPlansApi.regenerate(planId);
      setFloorPlans(prev => prev.map(p => p.id === planId
        ? { ...p, objects: response.data.objects, generationScore: response.data.generationScore, isApproved: false }
        : p
      ));
      setPlanFeedback(prev => ({ ...prev, [planId]: null }));
    } catch (error: any) {
      console.error('Failed to regenerate:', error);
      alert(error.response?.data?.error || 'Failed to regenerate floor plan');
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleSaveAsTemplate = async (plan: FloorPlan) => {
    try {
      setSavingTemplateId(plan.id);
      await floorPlansApi.update(plan.id, {
        name: plan.name,
        width: plan.width,
        height: plan.height,
        objects: plan.objects,
        isTemplate: true,
      });
      setFloorPlans(prev => prev.map(p => p.id === plan.id ? { ...p, isTemplate: true } : p));
    } catch (error) {
      console.error('Failed to save as template:', error);
    } finally {
      setSavingTemplateId(null);
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
      if (sortBy === 'score') return (b.generationScore || 0) - (a.generationScore || 0);
      return 0;
    });

  const paginatedPlans = filteredAndSortedPlans.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const clearAllFilters = () => {
    setSearchTerm('');
    setDepartmentFilter('');
    setSortBy('recently-added');
    setCurrentPage(1);
  };

  // Rules preview for selected templates
  const selectedRules = autoGenerateTemplates.map(t => ({ name: t, rules: TEMPLATE_RULES_PREVIEW[t] })).filter(r => r.rules);

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
        {canManageFloorPlans && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openAutoGenerateConfirm}
              disabled={autoGenerating}
              className="flex items-center gap-2 bg-[var(--surface-2)] text-[var(--text)] px-4 py-2 rounded-lg hover:bg-[var(--border)] disabled:opacity-60"
            >
              <Sparkles size={20} /> {autoGenerating ? 'Generating...' : 'Auto Generate'}
            </button>
            <button onClick={openCreateForm}
              className="flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2 rounded-lg hover:bg-[var(--primary-hover)]">
              <Plus size={20} /> New Floor Plan
            </button>
          </div>
        )}
      </div>

      {autoGenerateStatus && (
        <div
          className={`rounded-lg border px-4 py-3 shadow-sm transition-all duration-300 ${
            autoGenerateStatus.type === 'success'
              ? 'border-green-500/30 bg-green-500/10 text-green-700'
              : autoGenerateStatus.type === 'error'
                ? 'border-red-500/30 bg-red-500/10 text-red-700'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)]'
          }`}
        >
          <div className="flex items-center gap-3">
            {autoGenerateStatus.type === 'info' && (
              <div className="h-4 w-4 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
            )}
            <p className="text-sm font-medium">{autoGenerateStatus.message}</p>
          </div>
        </div>
      )}

      {/* Auto Generate Modal */}
      {showAutoGenerateConfirm && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg transition-all duration-300">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Generate floorplans now?</h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Applies template rules, room relationships, and validation scoring. Replaces existing auto-generated plans for this department.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">How many</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={autoGenerateCount}
                  onChange={e => setAutoGenerateCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]"
                />
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Templates</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {AUTO_GENERATE_TEMPLATES.map(template => (
                    <label key={template} className="flex items-center gap-2 text-sm text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoGenerateTemplates.includes(template)}
                        onChange={e => {
                          setAutoGenerateTemplates(current => e.target.checked
                            ? [...current, template]
                            : current.filter(item => item !== template));
                        }}
                      />
                      <span>{template}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Rules Preview */}
            {autoGenerateTemplates.length > 0 && (
              <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowRulesPreview(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-[var(--surface-2)] text-sm font-medium text-[var(--text)] hover:bg-[var(--border)]"
                >
                  <span className="flex items-center gap-2"><Info size={14} /> Template Rules Preview</span>
                  {showRulesPreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showRulesPreview && (
                  <div className="p-4 space-y-4 bg-[var(--surface)]">
                    {selectedRules.map(({ name, rules }) => (
                      <div key={name} className="border border-[var(--border)] rounded p-3 space-y-2">
                        <div className="font-semibold text-sm text-[var(--text)]">{name}</div>
                        <p className="text-xs text-[var(--text-muted)]">{rules.description}</p>
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Required Rooms</div>
                          <div className="flex flex-wrap gap-1">
                            {rules.requiredRooms.map(r => (
                              <span key={r} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-0.5">{r}</span>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Relationships</div>
                          {rules.relationships.map((rel, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-[var(--text)]">
                              <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                rel.type === 'near' ? 'bg-green-100 text-green-700' :
                                rel.type === 'restricted' ? 'bg-red-100 text-red-700' :
                                'bg-orange-100 text-orange-700'
                              }`}>
                                {rel.type === 'near' ? 'NEAR' : rel.type === 'restricted' ? 'RESTRICTED' : 'AWAY FROM'}
                              </span>
                              <span>{rel.description}</span>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Must Have</div>
                          <div className="flex flex-wrap gap-1">
                            {rules.mustHave.map(r => (
                              <span key={r} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded px-2 py-0.5">{r}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAutoGenerateConfirm(false)}
                disabled={autoGenerating}
                className="px-4 py-2 rounded-lg bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--border)] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAutoGenerate}
                disabled={autoGenerating}
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
              >
                Begin Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-[var(--surface)] p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-[var(--text)]">Create Floor Plan</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {user.role === 'superadmin' && (
                <div>
                  <label htmlFor="plan-department" className="block text-sm font-medium text-[var(--text)] mb-1">Department *</label>
                  <select
                    id="plan-department"
                    name="departmentId"
                    value={formData.departmentId}
                    required
                    onChange={e => setFormData({ ...formData, departmentId: e.target.value })}
                    className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-[var(--text)]"
                  >
                    <option value="">Select department</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
              )}
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
              <option value="score">Sort: Layout Score</option>
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
              {floorPlans.length === 0 && canManageFloorPlans && (
                <>
                  <p className="text-[var(--text-muted)] text-sm mb-4">Create one to start mapping your warehouse</p>
                  <button onClick={openCreateForm}
                    className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary-hover)]">
                    Create your first floor plan
                  </button>
                </>
              )}
            </div>
          ) : paginatedPlans.map((plan) => {
            const hasLocation = locationId && plan.objects?.some(o => o.linkedLocationId === locationId);
            const isAutoGenerated = plan.name.startsWith('Auto - ');
            const score = plan.generationScore as number | undefined;
            const feedback = planFeedback[plan.id];
            const isApproved = feedback === 'approved' || plan.isApproved;
            const isTemplate = plan.isTemplate;
            const isRegenerating = regeneratingId === plan.id;
            const isSavingTemplate = savingTemplateId === plan.id;
            const validation = isAutoGenerated ? validateFloorplanObjects(plan.objects || []) : null;

            return (
              <div key={plan.id}
                onClick={() => navigate(`/floor-plans/${plan.id}/edit`)}
                className={`aspect-square bg-[var(--surface)] rounded-lg shadow hover:shadow-lg transition cursor-pointer group flex flex-col ${
                  hasLocation ? 'ring-2 ring-[var(--primary)]' : ''
                } ${isApproved ? 'ring-2 ring-green-400' : ''}`}>
                {/* Thumbnail */}
                <div className="flex-1 overflow-hidden rounded-t-lg bg-slate-100 relative">
                  <FloorPlanThumbnail plan={plan} width={400} height={400}
                    highlightLocationId={locationId ?? undefined} />

                  {/* Score badge */}
                  {isAutoGenerated && score !== undefined && (
                    <span className={`absolute top-1 right-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${SCORE_COLOR(score)}`}>
                      {score}%
                    </span>
                  )}

                  {/* Approved badge */}
                  {isApproved && (
                    <span className="absolute top-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-600 text-white flex items-center gap-0.5">
                      <CheckCircle size={10} /> OK
                    </span>
                  )}

                  {validation && !validation.valid && (
                    <span
                      className="absolute bottom-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white flex items-center gap-0.5"
                      title={validation.errors[0]?.message}>
                      <AlertTriangle size={10} /> Check
                    </span>
                  )}

                  {/* Template badge */}
                  {isTemplate && (
                    <span className="absolute bottom-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-600 text-white flex items-center gap-0.5">
                      <BookmarkCheck size={10} /> TPL
                    </span>
                  )}
                </div>

                <div className="p-1.5 flex flex-col gap-1 flex-shrink-0">
                  <h3 className="text-xs font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition truncate line-clamp-1">
                    {plan.name}
                  </h3>

                  {canManageFloorPlans && (
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
                    ) : isAutoGenerated ? (
                      /* Auto-generated plan: feedback + actions row */
                      <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => navigate(`/floor-plans/${plan.id}/edit`)}
                            className="flex-1 px-1 py-0.5 bg-[var(--primary)] text-white text-xs rounded hover:bg-[var(--primary-hover)] flex items-center justify-center gap-0.5"
                            title="Edit">
                            <Edit size={10} /> Edit
                          </button>
                          <button
                            onClick={() => handleRegenerate(plan.id)}
                            disabled={isRegenerating}
                            className="px-1 py-0.5 bg-[var(--surface-2)] text-[var(--text)] text-xs rounded hover:bg-[var(--border)] disabled:opacity-50"
                            title="Regenerate">
                            <RefreshCw size={10} className={isRegenerating ? 'animate-spin' : ''} />
                          </button>
                          <button onClick={() => setConfirmingDeleteId(plan.id)}
                            className="px-1 py-0.5 bg-red-50 text-red-600 text-xs rounded hover:bg-red-100"
                            title="Delete">
                            <Trash2 size={10} />
                          </button>
                        </div>
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => handleFeedback(plan.id, 'approved')}
                            disabled={isApproved}
                            className={`flex-1 px-1 py-0.5 text-xs rounded flex items-center justify-center gap-0.5 ${
                              isApproved
                                ? 'bg-green-600 text-white cursor-default'
                                : 'bg-green-50 text-green-700 hover:bg-green-100'
                            }`}
                            title="Approve this layout">
                            <CheckCircle size={10} /> {isApproved ? 'Approved' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleFeedback(plan.id, 'bad_layout')}
                            disabled={feedback === 'bad_layout'}
                            className={`flex-1 px-1 py-0.5 text-xs rounded flex items-center justify-center gap-0.5 ${
                              feedback === 'bad_layout'
                                ? 'bg-red-600 text-white cursor-default'
                                : 'bg-red-50 text-red-600 hover:bg-red-100'
                            }`}
                            title="Mark as bad layout">
                            <XCircle size={10} /> Bad
                          </button>
                          <button
                            onClick={() => handleSaveAsTemplate(plan)}
                            disabled={isTemplate || isSavingTemplate}
                            className={`flex-1 px-1 py-0.5 text-xs rounded flex items-center justify-center gap-0.5 ${
                              isTemplate
                                ? 'bg-purple-600 text-white cursor-default'
                                : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                            }`}
                            title="Save as approved template">
                            <BookmarkCheck size={10} /> {isTemplate ? 'Saved' : 'Template'}
                          </button>
                        </div>
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
                  <th className="px-4 py-2 text-left text-[var(--text)]">Score</th>
                  <th className="px-4 py-2 text-left text-[var(--text)]">Status</th>
                  <th className="px-4 py-2 text-left text-[var(--text)]">Department</th>
                  <th className="px-4 py-2 text-left text-[var(--text)]">Date</th>
                  <th className="px-4 py-2 text-right text-[var(--text)]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {paginatedPlans.map((plan) => {
                  const departmentsMap = departments.reduce((map, dept) => ({ ...map, [dept.id]: dept.name }), {} as Record<string, string>);
                  const departmentName = plan.departmentId ? departmentsMap[plan.departmentId] : null;
                  const isAutoGenerated = plan.name.startsWith('Auto - ');
                  const score = plan.generationScore as number | undefined;
                  const feedback = planFeedback[plan.id];
                  const isApproved = feedback === 'approved' || plan.isApproved;
                  const isTemplate = plan.isTemplate;
                  const isRegenerating = regeneratingId === plan.id;

                  return (
                    <tr key={plan.id} className="hover:bg-[var(--surface-2)] transition-colors">
                      <td className="px-4 py-2 text-[var(--text)] font-medium cursor-pointer hover:text-[var(--primary)]"
                        onClick={() => navigate(`/floor-plans/${plan.id}/edit`)}>
                        <div className="flex items-center gap-1.5">
                          {plan.name}
                          {isApproved && <CheckCircle size={13} className="text-green-500 flex-shrink-0" />}
                          {isTemplate && <BookmarkCheck size={13} className="text-purple-500 flex-shrink-0" />}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-[var(--text-muted)]">
                        {plan.width} × {plan.height} px
                      </td>
                      <td className="px-4 py-2 text-[var(--text-muted)]">
                        {plan.objects?.length ?? 0}
                      </td>
                      <td className="px-4 py-2">
                        {isAutoGenerated && score !== undefined ? (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${SCORE_COLOR(score)}`}>
                            {score}%
                          </span>
                        ) : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="px-4 py-2">
                        {isAutoGenerated ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleFeedback(plan.id, 'approved')}
                              disabled={isApproved}
                              className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${isApproved ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                              title="Approve layout">
                              <CheckCircle size={11} /> {isApproved ? 'Approved' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleFeedback(plan.id, 'bad_layout')}
                              disabled={feedback === 'bad_layout'}
                              className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${feedback === 'bad_layout' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                              title="Mark as bad layout">
                              <XCircle size={11} /> Bad
                            </button>
                          </div>
                        ) : <span className="text-xs text-[var(--text-muted)]">Manual</span>}
                      </td>
                      <td className="px-4 py-2 text-[var(--text)]">
                        {departmentName ? (
                          <span className="bg-[var(--surface-2)] text-[var(--text)] px-2 py-0.5 rounded text-xs">{departmentName}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2 text-[var(--text-muted)] text-sm">{formatDate(plan.createdAt)}</td>
                      <td className="px-4 py-2 text-right">
                        {canManageFloorPlans && (
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
                              {isAutoGenerated && (
                                <button
                                  onClick={() => handleRegenerate(plan.id)}
                                  disabled={isRegenerating}
                                  className="text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
                                  title="Regenerate">
                                  <RefreshCw size={16} className={isRegenerating ? 'animate-spin' : ''} />
                                </button>
                              )}
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
