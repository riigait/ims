import { useState, useEffect } from 'react';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Location } from '@/types/inventory';
import { FloorPlan, FloorPlanObject } from '@/types/floorplan';

export function MapLocationPicker({
  locations,
  floorPlans,
  selectedLocationId,
  onSelect,
  onClose,
}: {
  locations: Location[];
  floorPlans: FloorPlan[];
  selectedLocationId: string;
  onSelect: (locationId: string) => void;
  onClose: () => void;
}) {
  const locationIds = new Set(locations.map(location => location.id));
  const plansWithLinks = floorPlans
    .map(plan => ({
      plan,
      linkedCount: (plan.objects || []).filter(obj => obj.linkedLocationId && locationIds.has(obj.linkedLocationId)).length,
    }))
    .filter(entry => entry.linkedCount > 0)
    .sort((a, b) => Number(b.plan.isApproved) - Number(a.plan.isApproved) || b.linkedCount - a.linkedCount);

  const [selectedPlanId, setSelectedPlanId] = useState(plansWithLinks[0]?.plan.id || '');
  const [locationSearch, setLocationSearch] = useState('');
  const [locationPage, setLocationPage] = useState(1);
  const [locationPageSize, setLocationPageSize] = useState(20);
  useEffect(() => {
    if (plansWithLinks.length > 0 && !plansWithLinks.some(entry => entry.plan.id === selectedPlanId)) {
      setSelectedPlanId(plansWithLinks[0].plan.id);
    }
  }, [plansWithLinks, selectedPlanId]);

  const selectedPlan = plansWithLinks.find(entry => entry.plan.id === selectedPlanId)?.plan || plansWithLinks[0]?.plan;
  const locationName = (id?: string) => locations.find(location => location.id === id)?.name || 'Linked location';
  const filteredLocations = locationSearch.trim()
    ? locations.filter(location => {
      const query = locationSearch.trim().toLowerCase();
      return location.name.toLowerCase().includes(query) || location.type.toLowerCase().includes(query);
    })
    : locations;
  const totalLocationPages = Math.max(1, Math.ceil(filteredLocations.length / locationPageSize));
  const paginatedLocations = filteredLocations.slice((locationPage - 1) * locationPageSize, locationPage * locationPageSize);
  const rectFill: Record<string, string> = { room: '#e5e7eb', rack: '#fef3c7', shelf: '#dbeafe' };

  useEffect(() => { setLocationPage(1); }, [locationSearch, locationPageSize]);
  useEffect(() => {
    if (locationPage > totalLocationPages) {
      setLocationPage(totalLocationPages);
    }
  }, [locationPage, totalLocationPages]);

  const renderObject = (obj: FloorPlanObject) => {
    const linked = obj.linkedLocationId && locationIds.has(obj.linkedLocationId);
    const selected = !!obj.linkedLocationId && obj.linkedLocationId === selectedLocationId;
    const common = {
      key: obj.id,
      onClick: linked ? () => onSelect(obj.linkedLocationId as string) : undefined,
      style: { cursor: linked ? 'pointer' : 'default' },
    };

    if (obj.type === 'wall') {
      return <line {...common} x1={obj.startX} y1={obj.startY} x2={obj.endX} y2={obj.endY} stroke={selected ? '#2563eb' : obj.color || '#1e293b'} strokeWidth={Math.max(1, obj.thickness ?? 1)} strokeLinecap="round" />;
    }
    if (obj.type === 'room' || obj.type === 'rack' || obj.type === 'shelf') {
      return (
        <g {...common}>
          <rect
            x={obj.x}
            y={obj.y}
            width={obj.width}
            height={obj.height}
            fill={selected ? '#bfdbfe' : obj.color || rectFill[obj.type]}
            stroke={selected ? '#2563eb' : linked ? '#0f766e' : '#64748b'}
            strokeWidth={selected ? 4 : linked ? 2 : 1}
            opacity={linked ? 0.9 : 0.55}
          />
          {(obj.label || obj.linkedLocationId) && obj.width > 48 && obj.height > 24 && (
            <text x={obj.x + obj.width / 2} y={obj.y + obj.height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={14} fill="#334155">
              {(obj.label || locationName(obj.linkedLocationId)).slice(0, 24)}
            </text>
          )}
        </g>
      );
    }
    if (obj.type === 'label') {
      return <text {...common} x={obj.x} y={obj.y} fontSize={obj.fontSize} fill={obj.color || '#475569'}>{obj.text}</text>;
    }
    if (obj.type === 'marker') {
      return (
        <g {...common}>
          <circle cx={obj.x} cy={obj.y} r={selected ? 12 : 8} fill={selected ? '#2563eb' : linked ? '#0f766e' : '#94a3b8'} />
          {linked && <text x={obj.x + 12} y={obj.y + 4} fontSize={12} fill="#334155">{locationName(obj.linkedLocationId).slice(0, 18)}</text>}
        </g>
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = obj as any;
    return <line {...common} x1={shape.x - shape.width / 2} y1={shape.y} x2={shape.x + shape.width / 2} y2={shape.y} stroke={obj.type === 'window' ? '#38bdf8' : '#16a34a'} strokeWidth={4} transform={`rotate(${((shape.angle || 0) * 180) / Math.PI} ${shape.x} ${shape.y})`} />;
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[88vh] bg-[var(--surface)] rounded-lg shadow-2xl border border-[var(--border)] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">Map Select Location</h3>
            <p className="text-xs text-[var(--text-muted)]">Click a linked area or choose from the location list.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)]">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_280px]">
          <div className="min-h-0 p-4 bg-[var(--surface-2)]">
            {selectedPlan ? (
              <div className="h-full flex flex-col gap-3">
                {plansWithLinks.length > 1 && (
                  <select value={selectedPlan.id} onChange={e => setSelectedPlanId(e.target.value)}
                    className="w-full max-w-sm px-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]">
                    {plansWithLinks.map(({ plan }) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                  </select>
                )}
                <div className="flex-1 min-h-0 bg-white rounded border border-[var(--border)] overflow-auto">
                  <svg viewBox={`0 0 ${selectedPlan.width} ${selectedPlan.height}`} className="w-full h-full min-h-[420px]">
                    <rect x="0" y="0" width={selectedPlan.width} height={selectedPlan.height} fill="#f8fafc" />
                    {(selectedPlan.objects || []).map(renderObject)}
                  </svg>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-[var(--text-muted)]">
                No linked floor-plan locations found.
              </div>
            )}
          </div>
          <div className="border-t lg:border-t-0 lg:border-l border-[var(--border)] p-3 overflow-y-auto">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Locations</p>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={locationSearch}
                onChange={e => setLocationSearch(e.target.value)}
                placeholder="Search locations..."
                className="w-full pl-8 pr-3 py-2 border border-[var(--border)] rounded text-sm bg-[var(--surface)] text-[var(--text)]"
              />
            </div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs text-[var(--text-muted)]">{filteredLocations.length} locations</p>
              <div className="flex gap-1">
                {[20, 50, 100].map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setLocationPageSize(size)}
                    className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${locationPageSize === size ? 'bg-[var(--primary)] text-white border-[var(--primary)]' : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'}`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              {paginatedLocations.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] text-center py-4">No locations match.</p>
              ) : paginatedLocations.map(location => (
                <button
                  key={location.id}
                  type="button"
                  onClick={() => onSelect(location.id)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${location.id === selectedLocationId ? 'bg-[var(--primary)] text-white' : 'hover:bg-[var(--surface-2)] text-[var(--text)]'}`}
                >
                  {location.name}
                </button>
              ))}
            </div>
            {filteredLocations.length > locationPageSize && (
              <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setLocationPage(page => Math.max(1, page - 1))}
                  disabled={locationPage === 1}
                  className="p-1 rounded border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-[var(--text-muted)]">Page {locationPage} of {totalLocationPages}</span>
                <button
                  type="button"
                  onClick={() => setLocationPage(page => Math.min(totalLocationPages, page + 1))}
                  disabled={locationPage === totalLocationPages}
                  className="p-1 rounded border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] disabled:opacity-40"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
