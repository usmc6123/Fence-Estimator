import React from 'react';
import { GoogleMap, useJsApiLoader, Marker, Polyline, Polygon, Autocomplete } from '@react-google-maps/api';
import { Map as MapIcon, Satellite, Ruler, Trash2, Check, Search, X, Navigation, Layers, MousePointer2, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface FenceMapMeasureProps {
  customerAddress?: string;
  onApply: (data: {
    measuredLinearFeet: number;
    mapMeasurementPoints: { lat: number; lng: number }[];
    mapMeasurementSegments: { length: number; start: { lat: number; lng: number }; end: { lat: number; lng: number } }[];
    customerEnteredAddress?: string;
  }) => void;
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
function calculateDistance(p1: { lat: number; lng: number }, p2: { lat: number; lng: number }) {
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

export default function FenceMapMeasure({ customerAddress, onApply, onClose }: FenceMapMeasureProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries
  });

  const [map, setMap] = React.useState<google.maps.Map | null>(null);
  const [mapType, setMapType] = React.useState<"roadmap" | "satellite" | "hybrid">("satellite");
  const [points, setPoints] = React.useState<{ lat: number; lng: number }[]>([]);
  const [isClosed, setIsClosed] = React.useState(false);
  const [autocomplete, setAutocomplete] = React.useState<google.maps.places.Autocomplete | null>(null);
  const [center, setCenter] = React.useState(defaultCenter);
  const [isDrawing, setIsDrawing] = React.useState(true);
  const [searchedAddress, setSearchedAddress] = React.useState<string>(customerAddress || '');

  // If address exists, try to center it
  React.useEffect(() => {
    if (isLoaded && customerAddress && !points.length) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address: customerAddress }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
          const location = results[0].geometry.location;
          setCenter({ lat: location.lat(), lng: location.lng() });
          map?.panTo(location);
          map?.setZoom(20);
        }
      });
    }
  }, [isLoaded, customerAddress, map]);

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
        setSearchedAddress(place.formatted_address || '');
        map?.panTo(location);
        map?.setZoom(20);
      }
    }
  };

  const clearPoints = () => setPoints([]);

  const removeLastPoint = () => setPoints(prev => prev.slice(0, -1));

  const totalLength = React.useMemo(() => {
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      length += calculateDistance(points[i], points[i+1]);
    }
    if (isClosed && points.length > 2) {
      length += calculateDistance(points[points.length - 1], points[0]);
    }
    return length;
  }, [points, isClosed]);

  const applyMeasurements = () => {
    if (points.length < 2) return;

    const segments: { length: number; start: { lat: number; lng: number }; end: { lat: number; lng: number } }[] = [];
    
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i+1];
      const dist = calculateDistance(p1, p2);
      segments.push({
        length: Math.round(dist),
        start: p1,
        end: p2
      });
    }

    if (isClosed && points.length > 2) {
      const p1 = points[points.length - 1];
      const p2 = points[0];
      const dist = calculateDistance(p1, p2);
      segments.push({
        length: Math.round(dist),
        start: p1,
        end: p2
      });
    }

    const roundedLength = Math.round(totalLength);
    
    onApply({
      measuredLinearFeet: roundedLength,
      mapMeasurementPoints: points,
      mapMeasurementSegments: segments,
      customerEnteredAddress: searchedAddress || customerAddress
    });
  };

  if (loadError) return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-red-500/5 h-[400px]">
      <X size={48} className="text-red-500 mb-4" />
      <h3 className="text-xl font-black text-[#111111] uppercase mb-2 animate-bounce">Maps Failed to Load</h3>
      <p className="text-sm text-[#555555] max-w-md">Please ensure the VITE_GOOGLE_MAPS_API_KEY is correctly configured in your environment.</p>
      <button onClick={onClose} className="mt-6 px-8 py-3 bg-american-blue text-white rounded-2xl font-black uppercase tracking-widest text-xs cursor-pointer">Close Window</button>
    </div>
  );

  if (!isLoaded) return (
    <div className="flex items-center justify-center h-[500px] bg-[#f5f5f7]">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-american-blue border-t-transparent" />
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#f5f5f7] overflow-hidden" id="fence-map-measure-root">
      {/* Header */}
      <div className="bg-white border-b-2 border-slate-100 p-4 flex items-center justify-between z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-american-blue flex items-center justify-center text-white shadow-lg">
            <MapIcon size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black text-american-blue uppercase tracking-tight">Fence Line Estimator</h3>
            <p className="text-[9px] font-bold text-red-600 uppercase tracking-widest">Precision Satellite Planning</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
            <div className="flex items-center gap-6 mr-8 px-6 py-2 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="text-center">
                    <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1 font-sans">Segments</p>
                    <p className="text-sm font-black text-american-blue leading-none font-sans">{Math.max(0, points.length - 1)}</p>
                </div>
                <div className="w-px h-6 bg-slate-200" />
                <div className="text-center">
                    <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1 font-sans">Total Distance</p>
                    <p className="text-sm font-black text-red-600 leading-none font-sans">{Math.round(totalLength)} <span className="text-[10px]">FT</span></p>
                </div>
            </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative min-h-[450px]">
        {/* Search Bar Overlay */}
        <div className="absolute top-6 inset-x-0 mx-auto w-full max-w-xl z-10 px-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 p-2 flex items-center gap-2">
            <div className="pl-4 text-slate-400">
              <Search size={18} />
            </div>
            <Autocomplete
              onLoad={setAutocomplete}
              onPlaceChanged={handlePlaceChanged}
              className="flex-1"
            >
              <input 
                type="text" 
                placeholder="Type or verify property address..." 
                defaultValue={customerAddress || ''}
                className="w-full py-3 text-sm font-bold text-slate-900 outline-none placeholder:text-slate-300 font-sans"
              />
            </Autocomplete>
          </div>
        </div>

        {/* Map Type Toggle */}
        <div className="absolute bottom-10 right-6 z-10 flex flex-col gap-2">
            <button 
                type="button"
                onClick={() => setMapType(mapType === 'roadmap' ? 'satellite' : 'roadmap')}
                className="flex items-center gap-3 px-5 py-3 bg-white rounded-2xl shadow-xl border border-slate-200 hover:border-slate-300 transition-all text-slate-800 font-sans cursor-pointer"
            >
                {mapType === 'roadmap' ? <Satellite size={18} /> : <MapIcon size={18} />}
                <span className="text-[10px] font-black uppercase tracking-widest">{mapType === 'roadmap' ? 'Satellite View' : 'Map View'}</span>
            </button>
            <button 
                type="button"
                onClick={() => map?.setZoom((map.getZoom() || 0) + 1)}
                className="p-3 bg-white rounded-2xl shadow-xl border border-slate-200 text-slate-800 flex items-center justify-center cursor-pointer"
            >
                <Plus size={18} />
            </button>
        </div>

        {/* Tools Sidebar */}
        <div className="absolute top-24 left-6 z-10 flex flex-col gap-3">
            <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="bg-white rounded-3xl shadow-2xl border border-slate-100 p-2 flex flex-col gap-1 font-sans">
                <Tooltip label="Precision Click to Draw">
                    <button 
                        type="button"
                        onClick={() => setIsDrawing(true)}
                        className={cn(
                            "p-3 rounded-2xl transition-all cursor-pointer",
                            isDrawing ? "bg-american-blue text-white shadow-lg" : "text-slate-400 hover:bg-slate-50"
                        )}
                    >
                        <MousePointer2 size={20} />
                    </button>
                </Tooltip>
                <Tooltip label="Undo Last Point">
                    <button 
                        type="button"
                        onClick={removeLastPoint}
                        disabled={points.length === 0}
                        className="p-3 rounded-2xl text-slate-400 hover:bg-slate-50 transition-all disabled:opacity-20 cursor-pointer"
                    >
                        <Navigation size={20} className="transform rotate-180" />
                    </button>
                </Tooltip>
                <Tooltip label={isClosed ? "Open Line" : "Connect First <-> Last"}>
                    <button 
                        type="button"
                        onClick={() => setIsClosed(!isClosed)}
                        className={cn(
                            "p-3 rounded-2xl transition-all cursor-pointer",
                            isClosed ? "text-american-blue bg-blue-50/50" : "text-slate-400 hover:bg-slate-50"
                        )}
                    >
                        <Layers size={20} />
                    </button>
                </Tooltip>
                <div className="h-px bg-slate-100 mx-2" />
                <Tooltip label="Clear All Points">
                    <button 
                        type="button"
                        onClick={clearPoints}
                        disabled={points.length === 0}
                        className="p-3 rounded-2xl text-red-400 hover:bg-red-50/50 transition-all disabled:opacity-20 cursor-pointer"
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
                    fillColor: (i === points.length - 1 && points.length > 1) ? '#002868' : '#BF0A30',
                    fillOpacity: 1,
                    strokeWeight: 2,
                    strokeColor: '#FFFFFF',
                    scale: (i === points.length - 1 && points.length > 1) ? 6 : 4
                  }}
                />
              ))}
              {isClosed && points.length > 2 ? (
                <Polygon 
                  paths={points}
                  options={{
                    strokeColor: '#BF0A30',
                    strokeOpacity: 0.8,
                    strokeWeight: 4,
                    fillColor: '#BF0A30',
                    fillOpacity: 0.2
                  }}
                />
              ) : (
                <Polyline 
                  path={points}
                  options={{
                    strokeColor: '#BF0A30',
                    strokeOpacity: 0.8,
                    strokeWeight: 4,
                    geodesic: true
                  }}
                />
              )}
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
                    className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 flex flex-col md:flex-row items-center gap-6 md:gap-10 min-w-full md:min-w-[500px] max-w-[90%] md:max-w-xl z-20"
                >
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                            <Ruler size={24} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest leading-none mb-1 font-sans">Measured Fence Line</p>
                            <h4 className="text-xl font-black text-american-blue leading-none font-sans">{Math.round(totalLength)} Linear Feet</h4>
                        </div>
                    </div>
                    <div className="hidden md:block h-12 w-px bg-slate-200" />
                    <button 
                        type="button"
                        onClick={applyMeasurements}
                        className="w-full md:w-auto px-8 py-4 bg-american-blue text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-950 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-american-blue/20 flex items-center justify-center gap-3 cursor-pointer"
                    >
                        <Check size={18} />
                        Apply Measurement
                    </button>
                </motion.div>
            )}
        </AnimatePresence>
      </div>

      {/* Footer Instructions */}
      <div className="bg-american-blue py-3 px-6 text-center">
          <p className="text-[9px] font-bold text-white/60 uppercase tracking-[0.2em] font-sans">
              Click on the map to place corner vertex points. Each line represents a fence run. Click Apply when finished.
          </p>
      </div>
    </div>
  );
}

function Tooltip({ children, label }: { children: React.ReactNode, label: string }) {
    return (
        <div className="relative group">
            {children}
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-american-blue text-white text-[9px] font-black uppercase tracking-widest rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 font-sans">
                {label}
                <div className="absolute right-full top-1/2 -translate-y-1/2 border-8 border-transparent border-r-american-blue" />
            </div>
        </div>
    );
}
