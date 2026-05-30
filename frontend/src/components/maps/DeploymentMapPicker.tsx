import { useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { X } from 'lucide-react';

type DeploymentMapPickerProps = {
  latitude?: number | null;
  longitude?: number | null;
  onChange: (coords: { latitude: number; longitude: number }) => void;
  onClose: () => void;
};

function ClickHandler({ onChange }: { onChange: DeploymentMapPickerProps['onChange'] }) {
  useMapEvents({
    click(event) {
      onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });

  return null;
}

export default function DeploymentMapPicker({ latitude, longitude, onChange, onClose }: DeploymentMapPickerProps) {
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

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[88vh] bg-[var(--surface)] rounded-lg shadow-2xl border border-[var(--border)] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">Deployment Map</h3>
            <p className="text-xs text-[var(--text-muted)]">Click the map or drag the marker to set deployment coordinates.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-muted)]">
            <X size={18} />
          </button>
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
            <ClickHandler onChange={onChange} />
            {markerPosition && (
              <Marker
                position={markerPosition}
                icon={markerIcon}
                draggable
                eventHandlers={{
                  dragend(event) {
                    const position = event.target.getLatLng();
                    onChange({ latitude: position.lat, longitude: position.lng });
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
