import { FormEvent, useCallback, useRef, useState } from 'react';
import Map, { Layer, NavigationControl, Source, type MapRef, type MapLayerMouseEvent } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AlertTriangle, Map as MapIcon, MousePointer, RotateCcw, Search, X } from 'lucide-react';
import { floorPlansApi, mapApi } from '@/services/api';
import type { BuildingFootprint } from '@/types/floorplan';
import { buildFootprintResult } from '@/utils/mapFootprintMath';

type MapSearchResult = { name: string; lat: number; lng: number; type: string | null };

type Phase =
  | { name: 'idle' }
  | { name: 'drawing' }
  | { name: 'footprint_selected'; footprint: BuildingFootprint }
  | { name: 'applying' };

export type MapFootprintModalProps = {
  departmentId: string | undefined;
  addFormMode: 'building' | 'standalone';
  manualFormData: {
    buildingLabel: string;
    buildingNumber: number;
    floorNumber: number;
    standaloneName: string;
  };
  onClose: () => void;
  onImported: (floorPlanId: string) => void;
};

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const RECENT_SEARCH_KEY = 'ims_map_recent_searches';
const MAX_RECENT = 5;

function ConfidenceChip({ level }: Readonly<{ level: BuildingFootprint['confidence'] }>) {
  const styles: Record<BuildingFootprint['confidence'], string> = {
    High:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    Medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    Low:    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[level]}`}>
      {level} confidence
    </span>
  );
}

function loadRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) ?? '[]') as string[];
  } catch { return []; }
}

function saveRecentSearch(query: string) {
  const recent = loadRecentSearches().filter(q => q !== query);
  recent.unshift(query);
  localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

function drawnFC(coords: [number, number][]): GeoJSON.FeatureCollection {
  if (coords.length === 0) return EMPTY_FC;
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
      ...coords.map(([lng, lat]) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
        properties: {},
      })),
    ],
  };
}

function polygonFC(ring: [number, number][]): GeoJSON.FeatureCollection {
  if (ring.length < 3) return EMPTY_FC;
  const last = ring.at(-1);
  const closed = (last?.[0] === ring[0][0] && last?.[1] === ring[0][1]) ? ring : [...ring, ring[0]];
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [closed] }, properties: {} }],
  };
}

export default function MapFootprintModal({
  departmentId,
  addFormMode,
  manualFormData,
  onClose,
  onImported,
}: Readonly<MapFootprintModalProps>) {
  const mapRef = useRef<MapRef>(null);

  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [drawnCoords, setDrawnCoords] = useState<[number, number][]>([]);
  const [buildingHeightM, setBuildingHeightM] = useState(3);
  const [floorCount, setFloorCount] = useState(1);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MapSearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches);
  const [showRecent, setShowRecent] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [isError, setIsError] = useState(false);

  const isDrawMode = phase.name === 'drawing';
  const isApplying = phase.name === 'applying';
  const footprint = phase.name === 'footprint_selected' ? phase.footprint : null;

  // ── Map click: add vertex ─────────────────────────────────────────────────
  const handleMapClick = useCallback((e: MapLayerMouseEvent) => {
    if (!isDrawMode) return;
    setDrawnCoords(prev => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
    setStatusMsg('');
    setIsError(false);
  }, [isDrawMode]);

  // ── Double-click: close polygon ───────────────────────────────────────────
  const handleMapDblClick = useCallback((e: MapLayerMouseEvent) => {
    if (!isDrawMode) return;
    e.preventDefault();
    if (drawnCoords.length < 3) {
      setStatusMsg('Draw at least 3 points before closing.');
      setIsError(true);
      return;
    }
    try {
      const fp = buildFootprintResult(drawnCoords, 'drawn');
      setPhase({ name: 'footprint_selected', footprint: fp });
      setStatusMsg('');
      setIsError(false);
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Invalid polygon.');
      setIsError(true);
    }
  }, [isDrawMode, drawnCoords]);

  const handleClear = () => {
    setPhase({ name: 'idle' });
    setDrawnCoords([]);
    setStatusMsg('');
    setIsError(false);
    setApplyError('');
  };

  const startDrawing = () => {
    setPhase({ name: 'drawing' });
    setDrawnCoords([]);
    setStatusMsg('');
    setIsError(false);
  };

  // ── Search ────────────────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchError('Enter a location to search.'); return; }
    try {
      setSearching(true);
      setSearchError('');
      setShowRecent(false);
      const res = await mapApi.search(q.trim());
      const results = res.data as MapSearchResult[];
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError('No location found.');
      } else {
        saveRecentSearch(q.trim());
        setRecentSearches(loadRecentSearches());
      }
    } catch {
      setSearchResults([]);
      setSearchError('Failed to search location.');
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearch = (e: FormEvent) => { e.preventDefault(); runSearch(searchQuery); };

  const chooseResult = (r: MapSearchResult) => {
    setSearchQuery(r.name);
    setSearchResults([]);
    setSearchError('');
    setShowRecent(false);
    mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 18, duration: 1000 });
  };

  const pickRecent = (q: string) => {
    setSearchQuery(q);
    setShowRecent(false);
    runSearch(q);
  };

  const clearRecent = () => {
    localStorage.removeItem(RECENT_SEARCH_KEY);
    setRecentSearches([]);
    setShowRecent(false);
  };

  // ── Apply ─────────────────────────────────────────────────────────────────
  const handleApply = async () => {
    if (phase.name !== 'footprint_selected') return;
    const { footprint: fp } = phase;
    setPhase({ name: 'applying' });
    setApplyError('');

    let name: string;
    if (addFormMode === 'building') {
      const label = manualFormData.buildingLabel.trim() || 'Building';
      name = `Manual - ${label} - Building ${manualFormData.buildingNumber} - Floor ${manualFormData.floorNumber}`;
    } else {
      name = manualFormData.standaloneName.trim() || 'Floorplan';
    }

    try {
      const response = await floorPlansApi.create({
        name,
        width: fp.suggestedWidth,
        height: fp.suggestedHeight,
        scale: { pixelsPerMeter: 50 },
        objects: fp.walls,
        ...(departmentId ? { departmentId } : {}),
      });
      onImported(response.data.id);
    } catch {
      setApplyError('Failed to create floor plan. Please try again.');
      setPhase({ name: 'footprint_selected', footprint: fp });
    }
  };

  // ── GeoJSON overlays ──────────────────────────────────────────────────────
  const drawnData   = drawnFC(drawnCoords);
  const footprintData = footprint ? polygonFC(footprint.coordinates) : EMPTY_FC;

  // ── Status text ───────────────────────────────────────────────────────────
  let displayStatus = statusMsg;
  if (!displayStatus) {
    if (isDrawMode) {
      const pts = drawnCoords.length > 0 ? ` · ${drawnCoords.length} pts` : '';
      displayStatus = `Click to add points · Double-click to close${pts}`;
    } else if (phase.name === 'idle') {
      displayStatus = 'Click "Draw Outline" to start tracing the building boundary';
    }
  }

  return (
    <div className="fixed inset-0 z-[80]">
      {/* Full-screen map */}
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 120.9842, latitude: 14.5995, zoom: 17 }}
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
        mapStyle={MAP_STYLE}
        onClick={handleMapClick}
        onDblClick={handleMapDblClick}
        cursor={isDrawMode ? 'crosshair' : 'grab'}
        doubleClickZoom={false}
      >
        <NavigationControl position="bottom-right" />

        {/* In-progress drawing */}
        <Source id="drawn" type="geojson" data={drawnData}>
          <Layer id="drawn-line" type="line" filter={['==', '$type', 'LineString']}
            paint={{ 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [4, 3] }} />
          <Layer id="drawn-points" type="circle" filter={['==', '$type', 'Point']}
            paint={{ 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-color': '#2563eb', 'circle-stroke-width': 2 }} />
        </Source>

        {/* Confirmed footprint */}
        <Source id="footprint" type="geojson" data={footprintData}>
          <Layer id="footprint-fill" type="fill"
            paint={{ 'fill-color': '#2563eb', 'fill-opacity': 0.2 }} />
          <Layer id="footprint-line" type="line"
            paint={{ 'line-color': '#2563eb', 'line-width': 3 }} />
        </Source>
      </Map>

      {/* ── Floating top bar ─────────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 right-3 z-[400] flex gap-2 pointer-events-none">

        {/* Search + recent */}
        <div className="pointer-events-auto flex-1 max-w-sm relative">
          <form onSubmit={handleSearch} className="flex gap-1.5">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => setShowRecent(true)}
                onBlur={() => setTimeout(() => setShowRecent(false), 150)}
                placeholder="Search address or building…"
                className="w-full pl-7 pr-2 py-2 text-sm rounded-lg shadow-lg border border-white/20 bg-white/95 dark:bg-gray-900/95 text-gray-900 dark:text-white backdrop-blur"
              />
            </div>
            <button type="submit" disabled={searching}
              className="px-3 py-2 text-sm rounded-lg shadow-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] disabled:opacity-60 font-medium">
              {searching ? '…' : 'Go'}
            </button>
          </form>

          {/* Recent searches dropdown */}
          {showRecent && recentSearches.length > 0 && searchResults.length === 0 && !searchError && (
            <div className="absolute top-full mt-1 w-full rounded-lg shadow-lg border border-white/20 bg-white/95 dark:bg-gray-900/95 backdrop-blur overflow-hidden z-10">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
                <span className="text-xs text-gray-400 font-medium">Recent searches</span>
                <button type="button" onClick={clearRecent} className="text-xs text-gray-400 hover:text-red-500">Clear</button>
              </div>
              {recentSearches.map(q => (
                <button key={q} type="button" onMouseDown={() => pickRecent(q)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2">
                  <Search size={11} className="text-gray-400 flex-shrink-0" />
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Search results */}
          {(searchError || searchResults.length > 0) && (
            <div className="absolute top-full mt-1 w-full rounded-lg shadow-lg border border-white/20 bg-white/95 dark:bg-gray-900/95 backdrop-blur overflow-hidden z-10">
              {searchError && <p className="px-3 py-2 text-xs text-gray-500">{searchError}</p>}
              {searchResults.map((r, idx) => (
                <button key={`${r.lat}-${r.lng}`} type="button" onClick={() => chooseResult(r)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 border-t first:border-t-0 border-gray-200 dark:border-gray-700">
                  <span className="font-medium">{idx + 1}. </span>{r.name}
                  {r.type && <span className="ml-1 text-xs text-gray-400">{r.type}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Mode buttons */}
        <div className="pointer-events-auto flex items-start gap-1.5">
          <button type="button" disabled={isApplying} onClick={startDrawing}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg shadow-lg font-medium transition-colors ${
              isDrawMode
                ? 'bg-[var(--primary)] text-white'
                : 'bg-white/95 dark:bg-gray-900/95 text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 backdrop-blur'
            }`}>
            <MousePointer size={12} /> Draw Outline
          </button>
          {phase.name !== 'idle' && (
            <button type="button" disabled={isApplying} onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg shadow-lg font-medium bg-white/95 dark:bg-gray-900/95 text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 backdrop-blur">
              <RotateCcw size={12} /> Clear
            </button>
          )}
          <button type="button" onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg shadow-lg font-medium bg-white/95 dark:bg-gray-900/95 text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 backdrop-blur">
            <X size={12} /> Close
          </button>
        </div>
      </div>

      {/* Status hint — bottom left */}
      {displayStatus && (
        <div className="absolute bottom-10 left-3 z-[400] pointer-events-none">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg shadow-lg backdrop-blur ${
            isError ? 'bg-red-700/80 text-white' : 'bg-black/70 text-white'
          }`}>
            {isError && <AlertTriangle size={11} className="text-red-300 flex-shrink-0" />}
            {displayStatus}
          </div>
        </div>
      )}

      {/* ── Measurement panel — floating right ───────────────────────────── */}
      {footprint && (
        <div className="absolute top-3 right-3 bottom-12 z-[400] w-72 pointer-events-auto">
          <div className="h-full overflow-y-auto rounded-xl shadow-2xl border border-white/20 bg-white/95 dark:bg-gray-900/95 backdrop-blur">
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Building Dimensions</h4>
                <ConfidenceChip level={footprint.confidence} />
              </div>

              {footprint.warnings.length > 0 && (
                <div className="rounded border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/30 px-3 py-2 text-xs text-yellow-800 dark:text-yellow-300 flex gap-2">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>
                    {footprint.warnings.includes('area_too_small') && 'Footprint is very small. '}
                    {footprint.warnings.includes('area_too_large') && 'Selection is unusually large.'}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Source</span>
                <span className="font-medium text-gray-900 dark:text-white flex items-center gap-1">
                  <MapIcon size={12} /> Hand-drawn
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {([
                  { label: 'Area',        value: `${footprint.measurements.areaSqM.toFixed(0)} m²` },
                  { label: 'Perimeter',   value: `${footprint.measurements.perimeterM.toFixed(1)} m` },
                  { label: 'Width',       value: `${footprint.measurements.widthM.toFixed(1)} m` },
                  { label: 'Length',      value: `${footprint.measurements.lengthM.toFixed(1)} m` },
                  { label: 'Orientation', value: `${footprint.measurements.orientationDeg.toFixed(1)}°` },
                  { label: 'Canvas',      value: `${footprint.suggestedWidth}×${footprint.suggestedHeight}` },
                ] as const).map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{value}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div>
                  <label htmlFor="fp-height" className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Building Height (m)</label>
                  <input id="fp-height" type="number" min={1} max={999} step={0.5} value={buildingHeightM}
                    onChange={e => setBuildingHeightM(Math.max(1, Number(e.target.value)))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label htmlFor="fp-floors" className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Number of Floors</label>
                  <input id="fp-floors" type="number" min={1} max={200} value={floorCount}
                    onChange={e => setFloorCount(Math.max(1, Number.parseInt(e.target.value) || 1))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                </div>
              </div>

              <p className="text-xs text-gray-400 leading-relaxed">
                Map footprint is approximate. Verify before structural use.
              </p>

              {applyError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle size={11} /> {applyError}
                </p>
              )}

              <button type="button" onClick={handleApply} disabled={isApplying}
                className="w-full px-4 py-2.5 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)] disabled:opacity-60 font-semibold">
                {isApplying ? 'Creating floorplan…' : 'Apply to Floorplan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
