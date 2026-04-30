import React from 'react';
import { GoogleMap, useJsApiLoader, Marker, Polyline, Autocomplete } from '@react-google-maps/api';
import { Map as MapIcon, Satellite, Ruler, Trash2, Check, Search, X, Navigation, Layers, MousePointer2, Plus } from 'lucide-react';
import { Estimate, FenceRun } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface SiteMeasurementProps {
  estimate: Partial<Estimate>;
  setEstimate: (estimate: Partial<Estimate>) => void;
  onClose: () => void;
}

const libraries: any = ["places", "geometry"];

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 39.8283, // Center of USA
  lng: -98.5795
};

// Calculate distance in feet using the Haversine formula
function calculateDistance(p1: google.maps.LatLngLiteral, p2: google.maps.LatLngLiteral) {
  const R = 20902231; // Earth radius in FEET
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default function SiteMeasurement({ estimate, setEstimate, onClose }: SiteMeasurementProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries
  });

  const [map, setMap] = React.useState<google.maps.Map | null>(null);
  const [mapType, setMapType] = React.useState<"roadmap" | "satellite" | "hybrid">("satellite");
  const [points, setPoints] = React.useState<google.maps.LatLngLiteral[]>([]);
  const [autocomplete, setAutocomplete] = React.useState<google.maps.places.Autocomplete | null>(null);
  const [center, setCenter] = React.useState(defaultCenter);
  const [isDrawing, setIsDrawing] = React.useState(true);

  // If address exists, try to center it
  React.useEffect(() => {
    if (isLoaded && estimate.customerAddress && !points.length) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: estimate.customerAddress }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
          const location = results[0].geometry.location;
          setCenter({ lat: location.lat(), lng: location.lng() });
          map?.panTo(location);
          map?.setZoom(20);
        }
      });
    }
  }, [isLoaded, estimate.customerAddress, map]);

  const onMapClick = (e: google.maps.MapMouseEvent) => {
    if (!isDrawing || !e.latLng) return;
    const newPoint = { lat: e.latLng.lat(), lng: e.latLng.lng() };
    setPoints(prev => [...prev, newPoint]);
  };

  const handlePlaceChanged = () => {
    if (autocomplete) {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        const location = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };
        setCenter(location);
        map?.panTo(location);
        map?.setZoom(20);
      }
    }
  };

  const clearPoints = () => setPoints([]);

  const removeLastPoint = () => setPoints(prev => prev.slice(0, -1));

  const applyMeasurements = () => {
    if (points.length < 2) return;

    const newRuns: FenceRun[] = [];
    let currentTotalLF = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i+1];
      const distance = calculateDistance(p1, p2);
      currentTotalLF += distance;

      newRuns.push({
        id: Math.random().toString(36).substr(2, 9),
        name: `Section ${i + 1}`,
        linearFeet: Math.round(distance),
        corners: 0,
        gates: 0,
        points: [p1, p2],
        styleId: estimate.defaultStyleId || 'wood-standard',
        visualStyleId: estimate.defaultVisualStyleId || 'side-by-side',
        height: estimate.defaultHeight || 6,
        color: estimate.defaultColor || 'Natural',
        isPreStained: estimate.isPreStained,
        hasRotBoard: estimate.hasRotBoard
      });
    }

    setEstimate({
      ...estimate,
      runs: [...(estimate.runs || []), ...newRuns],
      linearFeet: (estimate.linearFeet || 0) + Math.round(currentTotalLF)
    });
    onClose();
  };

  const totalLength = React.useMemo(() => {
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      length += calculateDistance(points[i], points[i+1]);
    }
    return length;
  }, [points]);

  if (loadError) return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-american-red/5">
      <X size={48} className="text-american-red mb-4" />
      <h3 className="text-xl font-black text-american-blue uppercase mb-2">Maps Failed to Load</h3>
      <p className="text-sm text-american-blue/60 max-w-md">Please ensure the VITE_GOOGLE_MAPS_API_KEY is correctly configured in your environment.</p>
      <button onClick={onClose} className="mt-6 px-8 py-3 bg-american-blue text-white rounded-2xl font-black uppercase tracking-widest text-xs">Close Window</button>
    </div>
  );

  if (!isLoaded) return <div className="flex items-center justify-center h-full bg-[#f5f5f7]"><div className="animate-spin rounded-full h-12 w-12 border-4 border-american-blue border-t-transparent" /></div>;

  return (
    <div className="flex flex-col h-full bg-[#f5f5f7] overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b-2 border-american-blue/5 p-4 flex items-center justify-between z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-american-blue flex items-center justify-center text-white shadow-lg">
            <MapIcon size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black text-american-blue uppercase tracking-tight">Geospatial Site Measure</h3>
            <p className="text-[9px] font-bold text-american-red uppercase tracking-widest">Precision Satellite Planning</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
            <div className="flex items-center gap-6 mr-8 px-6 py-2 bg-american-blue/5 rounded-2xl border border-american-blue/10">
                <div className="text-center">
                    <p className="text-[8px] font-black uppercase text-american-blue/40 tracking-widest leading-none mb-1">Segments</p>
                    <p className="text-sm font-black text-american-blue leading-none">{Math.max(0, points.length - 1)}</p>
                </div>
                <div className="w-px h-6 bg-american-blue/10" />
                <div className="text-center">
                    <p className="text-[8px] font-black uppercase text-american-blue/40 tracking-widest leading-none mb-1">Total Distance</p>
                    <p className="text-sm font-black text-american-red leading-none">{Math.round(totalLength)} <span className="text-[10px]">FT</span></p>
                </div>
            </div>
          <button 
            onClick={onClose}
            className="p-2.5 rounded-xl hover:bg-american-red/10 text-american-blue/40 hover:text-american-red transition-all"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
        {/* Search Bar Overlay */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 w-full max-w-xl z-10 px-4">
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-american-blue/5 p-2 flex items-center gap-2">
            <div className="pl-4 text-american-blue/30">
              <Search size={18} />
            </div>
            <Autocomplete
              onLoad={setAutocomplete}
              onPlaceChanged={handlePlaceChanged}
              className="flex-1"
            >
              <input 
                type="text" 
                placeholder="Search property address..." 
                className="w-full py-3 text-sm font-bold text-american-blue outline-none placeholder:text-[#BBBBBB]"
              />
            </Autocomplete>
          </div>
        </div>

        {/* Map Type Toggle */}
        <div className="absolute bottom-10 right-6 z-10 flex flex-col gap-2">
            <button 
                onClick={() => setMapType(mapType === 'roadmap' ? 'satellite' : 'roadmap')}
                className="flex items-center gap-3 px-5 py-3 bg-white rounded-2xl shadow-xl border-2 border-american-blue/10 hover:border-american-blue/30 transition-all text-american-blue"
            >
                {mapType === 'roadmap' ? <Satellite size={18} /> : <MapIcon size={18} />}
                <span className="text-[10px] font-black uppercase tracking-widest">{mapType === 'roadmap' ? 'Satellite View' : 'Map View'}</span>
            </button>
            <button 
                onClick={() => map?.setZoom((map.getZoom() || 0) + 1)}
                className="p-3 bg-white rounded-2xl shadow-xl border-2 border-american-blue/10 text-american-blue flex items-center justify-center"
            >
                <Plus size={18} />
            </button>
        </div>

        {/* Tools Sidebar */}
        <div className="absolute top-24 left-6 z-10 flex flex-col gap-3">
            <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="bg-white rounded-3xl shadow-2xl border-2 border-american-blue/5 p-2 flex flex-col gap-1">
                <Tooltip label="Precision Select">
                    <button 
                        onClick={() => setIsDrawing(true)}
                        className={cn(
                            "p-3 rounded-2xl transition-all",
                            isDrawing ? "bg-american-blue text-white shadow-lg" : "text-american-blue/40 hover:bg-american-blue/5"
                        )}
                    >
                        <MousePointer2 size={20} />
                    </button>
                </Tooltip>
                <Tooltip label="Undo Last Point">
                    <button 
                        onClick={removeLastPoint}
                        disabled={points.length === 0}
                        className="p-3 rounded-2xl text-american-blue/40 hover:bg-american-blue/5 transition-all disabled:opacity-20"
                    >
                        <Navigation size={20} className="transform rotate-180" />
                    </button>
                </Tooltip>
                <div className="h-px bg-american-blue/5 mx-2" />
                <Tooltip label="Clear All">
                    <button 
                        onClick={clearPoints}
                        disabled={points.length === 0}
                        className="p-3 rounded-2xl text-american-red/40 hover:bg-american-red/10 transition-all disabled:opacity-20"
                    >
                        <Trash2 size={20} />
                    </button>
                </Tooltip>
            </motion.div>
        </div>

        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={center}
          zoom={18}
          onLoad={setMap}
          onClick={onMapClick}
          options={{
            mapTypeId: mapType,
            disableDefaultUI: true,
            gestureHandling: 'greedy',
            tilt: 0,
            mapTypeControl: false,
            streetViewControl: false
          }}
        >
          {points.length > 0 && (
            <>
              {points.map((pt, i) => (
                <Marker 
                  key={i} 
                  position={pt} 
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: i === points.length - 1 ? '#002868' : '#BF0A30',
                    fillOpacity: 1,
                    strokeWeight: 2,
                    strokeColor: '#FFFFFF',
                    scale: i === points.length - 1 ? 6 : 4
                  }}
                />
              ))}
              <Polyline 
                path={points}
                options={{
                  strokeColor: '#BF0A30',
                  strokeOpacity: 0.8,
                  strokeWeight: 4,
                  geodesic: true
                }}
              />
              {/* Segment Measurement Tooltips */}
              {points.slice(1).map((pt, i) => {
                  const dist = calculateDistance(points[i], pt);
                  const midPoint = {
                      lat: (points[i].lat + pt.lat) / 2,
                      lng: (points[i].lng + pt.lng) / 2
                  };
                  return (
                    <div key={i} style={{ position: 'absolute' }}>
                        {/* Custom label implementation via OverlayView if needed, but for simplicity we rely on UI summary */}
                    </div>
                  );
              })}
            </>
          )}
        </GoogleMap>

        {/* Measurement Summary Card */}
        <AnimatePresence>
            {points.length >= 2 && (
                <motion.div 
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white rounded-[40px] shadow-2xl border-4 border-american-blue/5 p-6 flex items-center gap-10 min-w-[500px]"
                >
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                            <Ruler size={24} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest leading-none mb-1">Calculated Estimate</p>
                            <h4 className="text-xl font-black text-american-blue leading-none">{Math.round(totalLength)} Linear Feet</h4>
                        </div>
                    </div>
                    <div className="h-12 w-px bg-american-blue/10" />
                    <div className="flex-1">
                        <p className="text-[9px] font-bold text-american-blue/60 uppercase tracking-widest">Calculated from {points.length} coordinate points. This will populate your fence runs automatically.</p>
                    </div>
                    <button 
                        onClick={applyMeasurements}
                        className="px-8 py-4 bg-american-blue text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95 transition-all shadow-xl shadow-american-blue/20 flex items-center gap-3"
                    >
                        <Check size={18} />
                        Apply to Project
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
      </div>

      {/* Footer Instructions */}
      <div className="bg-american-blue py-3 px-6 text-center">
          <p className="text-[9px] font-bold text-white/60 uppercase tracking-[0.2em]">
              Click on the map to place vertex points. Each segment represents a fence run. Press Apply when finished.
          </p>
      </div>
    </div>
  );
}

function Tooltip({ children, label }: { children: React.ReactNode, label: string }) {
    return (
        <div className="relative group">
            {children}
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-american-blue text-white text-[9px] font-black uppercase tracking-widest rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                {label}
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-american-blue" />
            </div>
        </div>
    );
}
