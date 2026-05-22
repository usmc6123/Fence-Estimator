import React from 'react';
import { Ruler, ArrowUpRight } from 'lucide-react';
import { EstimateBreakdown } from './customerEstimateCalculations';

interface Step2Props {
  linearFeet: number;
  height: number;
  breakdown: EstimateBreakdown;
  onChangeField: (field: 'linearFeet' | 'height', val: any) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Step2({
  linearFeet,
  height,
  breakdown,
  onChangeField,
  onNext,
  onBack,
}: Step2Props) {
  return (
    <div id="step-2-container" className="space-y-6">
      <div className="text-center max-w-xl mx-auto space-y-2">
        <h2 className="text-2xl font-black text-american-blue uppercase tracking-tight">Fence Dimensions</h2>
        <p className="text-sm font-medium text-[#666666]">
          Provide the general measurements for your boundary. Estimates are calculated instantly.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto items-start">
        {/* Input Fields */}
        <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] space-y-6 shadow-sm">
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
              <option value={3}>3 Feet Tall (Front/Decorative)</option>
              <option value={4}>4 Feet Tall (Picket / Pool Standard)</option>
              <option value={5}>5 Feet Tall (Medium Security)</option>
              <option value={6}>6 Feet Tall (Classic Privacy Standard)</option>
              <option value={7}>7 Feet Tall (Custom Screen)</option>
              <option value={8}>8 Feet Tall (High Security / Industrial)</option>
            </select>
          </div>
        </div>

        {/* Real-time Calculation Card */}
        <div className="bg-[#111827] text-white p-6 rounded-2xl shadow-xl space-y-6 flex flex-col justify-between h-full border border-slate-800">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-american-red font-black text-xs uppercase tracking-widest">
              <Ruler size={14} />
              <span>Real-time Estimator</span>
            </div>
            
            <div className="space-y-1">
              <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                Projected Estimate Range
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-black text-emerald-400">
                  ${Math.round(breakdown.total).toLocaleString()}
                </span>
                <span className="text-xs text-slate-400">total</span>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4 space-y-2 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Total linear feet specified:</span>
                <span className="font-bold text-white">{linearFeet} LF</span>
              </div>
              <div className="flex justify-between">
                <span>Selected fence height:</span>
                <span className="font-bold text-white">{height} FT</span>
              </div>
              <p className="mt-2 text-[10px] leading-normal italic">
                *Includes standard cedar lumber pricing guidelines. You can pick pressure-treated pine, metal, or other raw materials on Step 3 to calibrate results.
              </p>
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between mt-4">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Auto-calculated</span>
            <ArrowUpRight size={14} className="text-emerald-400 animate-pulse" />
          </div>
        </div>
      </div>

      <div className="flex justify-between max-w-3xl mx-auto pt-4">
        <button
          onClick={onBack}
          className="rounded-xl px-5 py-3 text-sm font-bold border border-[#D5D5D5] bg-white text-[#555555] hover:bg-slate-50 active:scale-95 transition-all"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!linearFeet || linearFeet <= 0}
          className={`rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wider text-white shadow-lg active:scale-95 transition-all ${
            !linearFeet || linearFeet <= 0
              ? 'bg-slate-300 shadow-none cursor-not-allowed'
              : 'bg-american-blue shadow-american-blue/20 hover:bg-american-blue/90'
          }`}
        >
          Next Step
        </button>
      </div>
    </div>
  );
}
