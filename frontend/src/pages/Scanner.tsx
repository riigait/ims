import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Keyboard, Package, MapPin, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { productsApi, locationsApi } from '@/services/api';
import { Product, Location } from '@/types/inventory';

type ScanMode = 'camera' | 'keyboard';
type ScanTarget = 'product' | 'location';

declare global {
  interface Window {
    BarcodeDetector?: any;
  }
}

export default function Scanner() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const scanLoopRef = useRef<number | null>(null);

  const [mode, setMode] = useState<ScanMode>('keyboard');
  const [target, setTarget] = useState<ScanTarget>('product');
  const [cameraSupported, setCameraSupported] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [lastScan, setLastScan] = useState('');
  const [result, setResult] = useState<Product | Location | null>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const supported = typeof window.BarcodeDetector !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    setCameraSupported(supported);
    if (supported) {
      detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    }
    return () => stopCamera();
  }, []);

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current) { cancelAnimationFrame(scanLoopRef.current); scanLoopRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      startScanLoop();
    } catch {
      setError('Camera access denied. Use keyboard mode instead.');
    }
  }, []);

  const startScanLoop = useCallback(() => {
    const detect = async () => {
      if (!videoRef.current || !detectorRef.current || !streamRef.current) return;
      try {
        const barcodes = await detectorRef.current.detect(videoRef.current);
        if (barcodes.length > 0) {
          const value = barcodes[0].rawValue as string;
          if (value && value !== lastScan) {
            await handleScan(value);
          }
        }
      } catch { /* ignore individual frame errors */ }
      scanLoopRef.current = requestAnimationFrame(detect);
    };
    scanLoopRef.current = requestAnimationFrame(detect);
  }, [lastScan]);

  const handleScan = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setLastScan(code);
    setScanning(true);
    setError('');
    setResult(null);

    try {
      if (target === 'product') {
        const res = await productsApi.getAll();
        const products: Product[] = res.data;
        const found = products.find(p => p.sku === code.trim() || p.id === code.trim());
        if (found) {
          setResult(found);
        } else {
          setError(`No product found with SKU or ID: ${code}`);
        }
      } else {
        const res = await locationsApi.getAll();
        const locations: Location[] = res.data;
        const found = locations.find(l => l.id === code.trim() || l.name === code.trim());
        if (found) {
          setResult(found);
        } else {
          setError(`No location found with ID or name: ${code}`);
        }
      }
    } catch {
      setError('Failed to look up scan result.');
    } finally {
      setScanning(false);
    }
  }, [target]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      handleScan(manualInput.trim());
      setManualInput('');
    }
  };

  const handleModeSwitch = (newMode: ScanMode) => {
    if (newMode === 'keyboard') stopCamera();
    setMode(newMode);
    setResult(null);
    setError('');
  };

  const isProduct = result && 'sku' in result;
  const isLocation = result && 'type' in result && !('sku' in result);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Scanner</h1>
        <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">Phase 2 Feature</span>
      </div>

      {/* Mode + Target selector */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-4">
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Scan Target</p>
          <div className="flex gap-2">
            {(['product', 'location'] as ScanTarget[]).map(t => (
              <button key={t} onClick={() => { setTarget(t); setResult(null); setError(''); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${target === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {t === 'product' ? <Package size={14} /> : <MapPin size={14} />}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Input Mode</p>
          <div className="flex gap-2">
            <button onClick={() => handleModeSwitch('keyboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${mode === 'keyboard' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              <Keyboard size={14} /> Keyboard / USB Scanner
            </button>
            {cameraSupported && (
              <button onClick={() => handleModeSwitch('camera')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition ${mode === 'camera' ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                <Camera size={14} /> Camera
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Camera view */}
      {mode === 'camera' && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="relative bg-black rounded-lg overflow-hidden" style={{ maxWidth: 480 }}>
            <video ref={videoRef} className="w-full block" playsInline muted />
            {!cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center">
                <button onClick={startCamera}
                  className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 text-sm font-medium">
                  <Camera size={18} /> Start Camera
                </button>
              </div>
            )}
            {cameraActive && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="border-2 border-green-400 rounded-lg w-56 h-56 opacity-70" />
              </div>
            )}
          </div>
          {cameraActive && (
            <div className="mt-3 flex items-center gap-2 text-sm text-green-700">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Scanning… point the camera at a barcode or QR code
            </div>
          )}
          {cameraActive && (
            <button onClick={stopCamera} className="mt-2 text-sm text-red-600 hover:text-red-800">Stop camera</button>
          )}
        </div>
      )}

      {/* Keyboard / USB scanner input */}
      {mode === 'keyboard' && (
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600 mb-3">
            Type or paste a barcode/QR value, or connect a USB barcode scanner — it will type the code here automatically.
          </p>
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              placeholder={target === 'product' ? 'Enter SKU or product ID…' : 'Enter location ID or name…'}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button type="submit" disabled={!manualInput.trim() || scanning}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
              {scanning ? 'Looking up…' : 'Look up'}
            </button>
          </form>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <XCircle size={16} /> {error}
        </div>
      )}

      {/* Product result */}
      {isProduct && (() => {
        const p = result as Product;
        const isOut = p.currentStock === 0;
        const isLow = p.currentStock > 0 && p.currentStock <= p.lowStockThreshold;
        return (
          <div className="bg-white rounded-lg shadow p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Package size={20} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{p.name}</h2>
                  <p className="text-sm text-gray-500 font-mono">{p.sku}</p>
                </div>
              </div>
              {isOut
                ? <span className="flex items-center gap-1 text-xs font-medium bg-red-100 text-red-700 px-2 py-1 rounded-full"><XCircle size={12} /> Out of Stock</span>
                : isLow
                ? <span className="flex items-center gap-1 text-xs font-medium bg-amber-100 text-amber-700 px-2 py-1 rounded-full"><AlertTriangle size={12} /> Low Stock</span>
                : <span className="flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-1 rounded-full"><CheckCircle size={12} /> In Stock</span>
              }
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Current Stock</p>
                <p className={`text-xl font-bold ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-green-700'}`}>
                  {p.currentStock} <span className="text-sm font-normal text-gray-500">{p.unit}</span>
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Low Stock Threshold</p>
                <p className="text-xl font-bold text-gray-700">{p.lowStockThreshold} <span className="text-sm font-normal text-gray-500">{p.unit}</span></p>
              </div>
            </div>
            {p.description && <p className="mt-3 text-sm text-gray-600">{p.description}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => navigate(`/products`)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                Go to Products
              </button>
              <button onClick={() => navigate(`/stock-movements`)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">
                Record Stock Movement
              </button>
            </div>
          </div>
        );
      })()}

      {/* Location result */}
      {isLocation && (() => {
        const l = result as Location;
        return (
          <div className="bg-white rounded-lg shadow p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <MapPin size={20} className="text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">{l.name}</h2>
                <p className="text-sm text-gray-500 capitalize">{l.type}</p>
              </div>
            </div>
            {l.notes && <p className="text-sm text-gray-600 mb-4">{l.notes}</p>}
            <div className="flex gap-2">
              <button onClick={() => navigate(`/locations`)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
                Go to Locations
              </button>
              <button onClick={() => navigate(`/floor-plans`)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">
                View Floor Plans
              </button>
            </div>
          </div>
        );
      })()}

      {!cameraSupported && mode === 'camera' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
          Camera-based scanning (BarcodeDetector API) is not supported in this browser. Use keyboard / USB scanner mode instead, or try Chrome 88+ on Android or desktop.
        </div>
      )}
    </div>
  );
}
