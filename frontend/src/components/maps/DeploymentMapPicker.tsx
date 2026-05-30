import { FormEvent, useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { Search, X } from 'lucide-react';
import { mapApi } from '@/services/api';

type DeploymentMapPickerProps = {
  latitude?: number | null;
  longitude?: number | null;
  onChange: (coords: { latitude: number; longitude: number }) => void;
  onAddressFound?: (name: string) => void;
  onClose: () => void;
};

type MapSearchResult = {
  name: string;
  lat: number;
  lng: number;
  type: string | null;
  importance: number | null;
};

function ClickHandler({ onChange, onReverse }: { onChange: DeploymentMapPickerProps['onChange']; onReverse: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng });
      onReverse(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

function MapViewController({ latitude, longitude }: { latitude?: number | null; longitude?: number | null }) {
  const map = useMap();

  useEffect(() => {
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      map.setView([latitude, longitude], Math.max(map.getZoom(), 15));
    }
  }, [latitude, longitude, map]);

  return null;
}

export default function DeploymentMapPicker({ latitude, longitude, onChange, onAddressFound, onClose }: DeploymentMapPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MapSearchResult[]>([]);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const defaultCenter: LatLngExpression = [14.5995, 120.9842];
  const markerPosition: LatLngExpression | null =
    typeof latitude === 'number' && typeof longitude === 'number' ? [latitude, longitude] : null;
  const markerIcon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: '<div style="width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid white;box-shadow:0 3px 12px rgba(15,23,42,.35)"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    []
  );

  const handleReverse = async (lat: number, lng: number) => {
    try {
      const response = await mapApi.reverse(lat, lng);
      if (response.data?.name) {
        setSearchQuery(response.data.name);
        setSearchResults([]);
        setSearchError('');
        onAddressFound?.(response.data.name);
      }
    } catch {
      // silently ignore — coordinates are still set
    }
  };

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchError('Enter a location to search.');
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      setSearchError('');
      const response = await mapApi.search(query);
      const results = response.data as MapSearchResult[];
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError('No location found.');
      }
    } catch (error: any) {
      setSearchResults([]);
      setSearchError(error.response?.data?.error || 'Failed to search location.');
    } finally {
      setSearching(false);
    }
  };

  const chooseResult = (result: MapSearchResult) => {
    setSearchQuery(result.name);
    setSearchResults([]);
    setSearchError('');
    onChange({ latitude: result.lat, longitude: result.lng });
    onAddressFound?.(result.name);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-6xl h-[88vh] bg-[var(--surface)] rounded-lg shadow-2xl border border-[var(--border)] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">Deployment Map</h3>
            <p className="text-xs text-[var(--text-muted)]">Click the map or drag the marker to set deployment coordinates.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)]">
            <X size={18} />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search address or place..."
                className="w-full pl-9 pr-3 py-2 border border-[var(--border)] rounded-lg text-sm bg-[var(--surface)] text-[var(--text)]"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-4 py-2 bg-[var(--primary)] text-white text-sm rounded-lg hover:bg-[var(--primary-hover)] disabled:opacity-60"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>
          {(searchError || searchResults.length > 0) && (
            <div className="mt-2 border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--surface)]">
              {searchError && <p className="px-3 py-2 text-sm text-[var(--text-muted)]">{searchError}</p>}
              {searchResults.map((result, index) => (
                <button
                  key={`${result.lat}-${result.lng}-${index}`}
                  type="button"
                  onClick={() => chooseResult(result)}
                  className="w-full text-left px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-2)] border-t first:border-t-0 border-[var(--border)]"
                >
                  <span className="font-medium">{index + 1}. {result.name}</span>
                  {result.type && <span className="ml-2 text-xs text-[var(--text-muted)]">{result.type}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0">
          <MapContainer
            center={markerPosition || defaultCenter}
            zoom={markerPosition ? 15 : 12}
            scrollWheelZoom
            className="h-full w-full"
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ClickHandler onChange={onChange} onReverse={handleReverse} />
            <MapViewController latitude={latitude} longitude={longitude} />
            {markerPosition && (
              <Marker
                position={markerPosition}
                icon={markerIcon}
                draggable
                eventHandlers={{
                  dragend(event) {
                    const position = event.target.getLatLng();
                    onChange({ latitude: position.lat, longitude: position.lng });
                    handleReverse(position.lat, position.lng);
                  },
                }}
              >
                <Popup>
                  Deployment location
                  <br />
                  Lat: {latitude?.toFixed(6)}
                  <br />
                  Lng: {longitude?.toFixed(6)}
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
