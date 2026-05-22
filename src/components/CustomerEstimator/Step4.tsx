import React from 'react';
import { HelpCircle, Trash2, Sliders } from 'lucide-react';
import { GATE_PRICES, EstimateBreakdown } from './customerEstimateCalculations';

interface Step4Props {
  needGates: boolean;
  gateCount: number;
  gateType: 'Single Swing' | 'Double Swing' | 'Sliding';
  siteCondition: 'Level' | 'Slight Slope' | 'Steep Slope';
  removeOldFence: boolean;
  breakdown: EstimateBreakdown;
  onChangeField: <K extends 'needGates' | 'gateCount' | 'gateType' | 'siteCondition' | 'removeOldFence'>(
    field: K,
    val: any
  ) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Step4({
  needGates,
  gateCount,
  gateType,
  siteCondition,
  removeOldFence,
  breakdown,
  onChangeField,
  onNext,
  onBack,
}: Step4Props) {
  return (
    <div id="step-4-container" className="space-y-6">
      <div className="text-center max-w-xl mx-auto space-y-2">
        <h2 className="text-2xl font-black text-american-blue uppercase tracking-tight">Fence Features & Terrain</h2>
        <p className="text-sm font-medium text-[#666666]">
          Configure specific gates, land slope adjustments, and setup options.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto items-stretch">
        
        {/* Left column: Gates and Layout Accessories */}
        <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] space-y-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-6">
            <h3 className="text-sm font-black text-american-blue uppercase tracking-widest border-b border-[#E5E5E5] pb-2">
              Entryways & Gates
            </h3>

            {/* Need Gates Question */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[#111111]">
                Do you need matching gates?
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => onChangeField('needGates', true)}
                  className={`flex-1 py-3 px-4 rounded-xl border text-sm font-bold transition-all ${
                    needGates
                      ? 'border-american-blue bg-blue-50/20 text-american-blue font-black'
                      : 'border-[#D5D5D5] bg-white text-[#555555] hover:bg-slate-50'
                  }`}
                >
                  Yes (Need Entryways)
                </button>
                <button
                  type="button"
                  onClick={() => onChangeField('needGates', false)}
                  className={`flex-1 py-3 px-4 rounded-xl border text-sm font-bold transition-all ${
                    !needGates
                      ? 'border-american-blue bg-blue-50/20 text-american-blue font-black'
                      : 'border-[#D5D5D5] bg-white text-[#555555] hover:bg-slate-50'
                  }`}
                >
                  No Gate Needed
                </button>
              </div>
            </div>

            {/* Gate Configuration Details */}
            {needGates && (
              <div className="space-y-4 p-4 rounded-xl bg-slate-50 border border-slate-200 animate-fadeIn">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Gate Count */}
                  <div className="space-y-1">
                    <label className="block text-xs font-black text-[#555555] uppercase tracking-wider">
                      How Many Gates?
                    </label>
                    <select
                      value={gateCount}
                      onChange={(e) => onChangeField('gateCount', parseInt(e.target.value))}
                      className="block w-full rounded-lg border border-[#D5D5D5] bg-white px-3 py-2.5 text-sm font-bold text-[#111111]"
                    >
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? 'Gate' : 'Gates'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Gate Type */}
                  <div className="space-y-1">
                    <label className="block text-xs font-black text-[#555555] uppercase tracking-wider">
                      Gate Style
                    </label>
                    <select
                      value={gateType}
                      onChange={(e) => onChangeField('gateType', e.target.value)}
                      className="block w-full rounded-lg border border-[#D5D5D5] bg-white px-3 py-2.5 text-sm font-bold text-[#111111]"
                    >
                      <option value="Single Swing">Single Swing (3-5ft wide)</option>
                      <option value="Double Swing">Double Swing (8-12ft wide)</option>
                      <option value="Sliding">Sliding Gate (Space-Saver)</option>
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-[#666666] leading-normal italic">
                  *Gates include industrial grade self-closing standard steel latch kits and premium hinges.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Site Condition & Demolition */}
        <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] space-y-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-6">
            <h3 className="text-sm font-black text-american-blue uppercase tracking-widest border-b border-[#E5E5E5] pb-2">
              Terrain & Demolition
            </h3>

            {/* Site Condition */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[#111111]">
                Site & Land Conditions?
              </label>
              <select
                value={siteCondition}
                onChange={(e) => onChangeField('siteCondition', e.target.value)}
                className="block w-full rounded-xl border border-[#D5D5D5] bg-white px-4 py-3.5 text-sm font-bold text-[#111111]"
              >
                <option value="Level">Level Ground (No slope adjustments)</option>
                <option value="Slight Slope">Slight Slope (+15% labor multiplier)</option>
                <option value="Steep Slope">Steep Slope (+35% labor multiplier)</option>
              </select>
              <p className="text-[11px] text-[#888888]">
                Slope factors adjust concrete depths and staircase/staking layout labor.
              </p>
            </div>

            {/* Demolition Checkbox */}
            <div className="p-4 rounded-xl border border-[#E5E5E5] bg-slate-50 flex items-center gap-3">
              <input
                id="removeOldFence"
                type="checkbox"
                checked={removeOldFence}
                onChange={(e) => onChangeField('removeOldFence', e.target.checked)}
                className="h-5 w-5 rounded border-[#D5D5D5] text-american-blue focus:ring-american-blue"
              />
              <div className="flex-1">
                <label htmlFor="removeOldFence" className="block text-sm font-black text-[#111111] cursor-pointer">
                  Need to tear down & haul an existing fence?
                </label>
                <span className="block text-[11px] text-[#666666]">
                  Adds a standard ${breakdown.demoRate}/LF demolition and environmental waste disposal fee.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between max-w-4xl mx-auto pt-4">
        <button
          onClick={onBack}
          className="rounded-xl px-5 py-3 text-sm font-bold border border-[#D5D5D5] bg-white text-[#555555] hover:bg-slate-50 active:scale-95 transition-all"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wider text-white shadow-lg bg-american-blue shadow-american-blue/20 hover:bg-american-blue/90 active:scale-95 transition-all"
        >
          Proceed to Contact & Estimate
        </button>
      </div>
    </div>
  );
}
