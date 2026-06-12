import React from 'react';
import { Ruler, ArrowUpRight, Lock, MapPin, Trash2, CheckCircle2 } from 'lucide-react';
import { EstimateBreakdown, CustomerEstimateData } from './customerEstimateCalculations';
import FenceMapMeasure from '../FenceMapMeasure';
import { motion, AnimatePresence } from 'motion/react';

interface Step2Props {
  linearFeet: number;
  height: number;
  breakdown: EstimateBreakdown;
  onChangeField: (field: any, val: any) => void;
  onNext: () => void;
  onBack: () => void;
  fenceType?: string;
  data: CustomerEstimateData;
}

export default function Step2({
  linearFeet,
  height,
  breakdown,
  onChangeField,
  onNext,
  onBack,
  fenceType,
  data,
}: Step2Props) {
  const [showMapModal, setShowMapModal] = React.useState(false);
  const [mapAddress, setMapAddress] = React.useState(data.address || '');

  React.useEffect(() => {
    if (fenceType === 'Wood Fence' && height !== 6 && height !== 8) {
      onChangeField('height', 6);
    }
  }, [fenceType, height, onChangeField]);

  // Sync internal address state with customer level address if it updates
  React.useEffect(() => {
    if (data.address && !mapAddress) {
      setMapAddress(data.address);
    }
  }, [data.address]);

  const handleApplyMapMeasurement = (mapResult: {
    measuredLinearFeet: number;
    mapMeasurementPoints: { lat: number; lng: number }[];
    mapMeasurementSegments: { length: number; start: { lat: number; lng: number }; end: { lat: number; lng: number } }[];
    customerEnteredAddress?: string;
  }) => {
    onChangeField('measuredLinearFeet', mapResult.measuredLinearFeet);
    onChangeField('linearFeet', mapResult.measuredLinearFeet);
    onChangeField('measurementMethod', 'google_map');
    onChangeField('mapMeasurementPoints', mapResult.mapMeasurementPoints);
    onChangeField('mapMeasurementSegments', mapResult.mapMeasurementSegments);
    onChangeField('customerEnteredAddress', mapResult.customerEnteredAddress || mapAddress);
    onChangeField('measurementUpdatedAt', new Date().toISOString());
    
    // Also save simple address format details to ensure geocoding references are kept
    if (mapResult.customerEnteredAddress) {
      onChangeField('address', mapResult.customerEnteredAddress);
    }
    
    setShowMapModal(false);
  };

  const handleClearMeasurement = () => {
    onChangeField('measuredLinearFeet', null);
    onChangeField('measurementMethod', 'manual');
    onChangeField('mapMeasurementPoints', null);
    onChangeField('mapMeasurementSegments', null);
    onChangeField('customerEnteredAddress', null);
    onChangeField('measurementUpdatedAt', null);
    onChangeField('linearFeet', 100);
  };

  const handleUseMeasurement = () => {
    if (data.measuredLinearFeet) {
      onChangeField('linearFeet', data.measuredLinearFeet);
      onChangeField('measurementMethod', 'google_map');
    }
  };

  return (
    <div id="step-2-container" className="space-y-6">
      <div className="text-center max-w-xl mx-auto space-y-2 font-sans">
        <h2 className="text-2xl font-black text-american-blue uppercase tracking-tight">Fence Dimensions</h2>
        <p className="text-sm font-medium text-[#666666]">
          Provide the general measurements for your boundary. Estimates are calculated instantly.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto items-start">
        {/* Input Fields */}
        <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] space-y-6 shadow-sm font-sans">
          {/* How Long */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-american-blue uppercase tracking-wider">
              Total Fencing Length
            </label>
            <div className="relative rounded-xl shadow-sm">
              <input
                type="number"
                min="1"
                placeholder="Length in linear feet..."
                value={linearFeet || ''}
                onChange={(e) => {
                  const val = Math.max(0, parseInt(e.target.value) || 0);
                  onChangeField('linearFeet', val);
                  if (data.measuredLinearFeet && val !== data.measuredLinearFeet) {
                    onChangeField('measurementMethod', 'manual');
                  } else if (data.measuredLinearFeet && val === data.measuredLinearFeet) {
                    onChangeField('measurementMethod', 'google_map');
                  }
                }}
                className="block w-full rounded-xl border border-[#D5D5D5] px-4 py-4 pr-12 text-sm leading-6 text-[#111111] font-bold focus:border-american-blue focus:ring-american-blue/20 focus:outline-none"
              />
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
                <span className="text-sm font-black text-[#999999] uppercase tracking-wider">LF</span>
              </div>
            </div>
            <p className="text-xs text-[#888888]">
              Linear footage measures the span along the perimeter.
            </p>
          </div>

          {/* How Tall */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-american-blue uppercase tracking-wider">
              Fence Height
            </label>
            <select
              value={height}
              onChange={(e) => onChangeField('height', parseInt(e.target.value))}
              className="block w-full rounded-xl border border-[#D5D5D5] bg-white px-4 py-4 text-sm font-bold text-[#111111] focus:border-american-blue focus:ring-ring focus:outline-none"
            >
              {fenceType === 'Wood Fence' ? (
                <>
                  <option value={6}>6 Feet Tall (Classic Privacy Standard)</option>
                  <option value={8}>8 Feet Tall (High Security / Industrial)</option>
                </>
              ) : (
                <>
                  <option value={3}>3 Feet Tall (Front/Decorative)</option>
                  <option value={4}>4 Feet Tall (Picket / Pool Standard)</option>
                  <option value={5}>5 Feet Tall (Medium Security)</option>
                  <option value={6}>6 Feet Tall (Classic Privacy Standard)</option>
                  <option value={7}>7 Feet Tall (Custom Screen)</option>
                  <option value={8}>8 Feet Tall (High Security / Industrial)</option>
                </>
              )}
            </select>
          </div>

          {/* Measure Your Fence Line Section */}
          <div className="border-t border-slate-100 pt-6 space-y-4">
            <h3 className="text-sm font-black text-american-blue uppercase tracking-wider flex items-center gap-2">
              <MapPin size={16} className="text-red-600" />
              Measure Your Fence Line
            </h3>
            
            <p className="text-xs text-[#555555] leading-relaxed">
              Use the map to click each corner or direction change of your fence line. We’ll calculate the total linear feet automatically. You can still adjust the number before submitting.
            </p>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-[#777777] uppercase tracking-wider">
                  Property Address for Map Search
                </label>
                <input
                  type="text"
                  placeholder="Street Address, City, State..."
                  value={mapAddress}
                  onChange={(e) => setMapAddress(e.target.value)}
                  className="block w-full rounded-xl border border-[#D5D5D5] px-4 py-3 text-xs leading-5 text-[#111111] font-bold focus:border-american-blue focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowMapModal(true)}
                  className="rounded-xl bg-american-blue text-white hover:bg-blue-950 px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <MapPin size={14} />
                  Measure Fence on Map
                </button>

                {data.measuredLinearFeet && (
                  <>
                    {linearFeet !== data.measuredLinearFeet && (
                      <button
                        type="button"
                        onClick={handleUseMeasurement}
                        className="rounded-xl border border-emerald-500 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 size={14} />
                        Use This Measurement
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleClearMeasurement}
                      className="rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 px-4 py-2.5 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 size={13} />
                      Clear Measurement
                    </button>
                  </>
                )}
              </div>

              {data.measuredLinearFeet && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex justify-between items-center text-xs">
                  <span className="text-[#64748b] font-medium flex items-center gap-1.5 font-sans">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    Google Maps Record:
                  </span>
                  <strong className="text-american-blue font-bold tracking-tight font-sans text-right">
                    {data.measuredLinearFeet} LF Map Verified
                  </strong>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Real-time Calculation Card */}
        <div className="bg-[#111827] text-white p-6 rounded-2xl shadow-xl space-y-6 flex flex-col justify-between h-full border border-slate-800 font-sans">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-american-red font-black text-xs uppercase tracking-widest">
              <Ruler size={14} />
              <span>Real-time Estimator</span>
            </div>
            
            <div className="space-y-2 py-2">
              <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                Projected Estimate status
              </span>
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-3.5 rounded-xl text-amber-400">
                <Lock size={18} className="animate-pulse" />
                <span className="text-xs font-black uppercase tracking-wider">LOCKED UNTIL STEP 5</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                To view your dynamic price range, complete the simple contact verification form in Step 5.
              </p>
            </div>

            <div className="border-t border-slate-800 pt-4 space-y-2 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Total linear feet specified:</span>
                <span className="font-bold text-white">{linearFeet} LF</span>
              </div>
              {data.measuredLinearFeet && (
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Geospatial Map trace total:</span>
                  <span>{data.measuredLinearFeet} LF</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Selected fence height:</span>
                <span className="font-bold text-white">{height} FT</span>
              </div>
              <p className="mt-2 text-[10px] leading-normal italic text-slate-500 font-sans">
                *Estimates compile raw structural posts, infill, hardware accessories, site prep, and local TX sales tax.
              </p>
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between mt-4">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 font-sans">Auto-calculated</span>
            <Lock size={14} className="text-amber-400" />
          </div>
        </div>
      </div>

      <div className="flex justify-between max-w-3xl mx-auto pt-4 font-sans">
        <button
          onClick={onBack}
          className="rounded-xl px-5 py-3 text-sm font-bold border border-[#D5D5D5] bg-white text-[#555555] hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!linearFeet || linearFeet <= 0}
          className={`rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wider text-white shadow-lg active:scale-95 transition-all cursor-pointer ${
            !linearFeet || linearFeet <= 0
              ? 'bg-slate-300 shadow-none cursor-not-allowed'
              : 'bg-american-blue shadow-american-blue/20 hover:bg-american-blue/90'
          }`}
        >
          Next Step
        </button>
      </div>

      {/* Map Interactive Draw Modal */}
      <AnimatePresence>
        {showMapModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full h-full max-w-7xl bg-white rounded-[32px] shadow-2xl overflow-hidden border-2 border-white relative"
            >
              <FenceMapMeasure
                customerAddress={mapAddress}
                onApply={handleApplyMapMeasurement}
                onClose={() => setShowMapModal(false)}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
