import React from 'react';
import { Layers, CheckCircle2, ShieldAlert, Sparkles, RefreshCw, Lock } from 'lucide-react';
import { MATERIAL_PRICES, EstimateBreakdown } from './customerEstimateCalculations';

interface Step3Props {
  material: string;
  breakdown: EstimateBreakdown;
  onChangeMaterial: (material: string) => void;
  onNext: () => void;
  onBack: () => void;
  fenceType: string;
  isPreStained?: boolean;
  onChangeField: (field: any, val: any) => void;
  reusePosts?: boolean;
  picketStyle?: 'w-side' | 'w-bob';
  topStyle?: 'Dog Ear' | 'Flat Top';
  hasTopCap?: boolean;
  hasCapAndTrim?: boolean;
  pipePaintColor?: 'Black' | 'Hunter Green' | 'White';
  pipeWireType?: 'Black' | 'Galvanized';
}

export default function Step3({
  material,
  breakdown,
  onChangeMaterial,
  onNext,
  onBack,
  fenceType,
  isPreStained = false,
  onChangeField,
  reusePosts = false,
  picketStyle = 'w-side',
  topStyle = 'Dog Ear',
  hasTopCap = false,
  hasCapAndTrim = false,
  pipePaintColor = 'Black',
  pipeWireType = 'Black',
}: Step3Props) {

  // Define dynamic material options depending on selected style type
  let materialsList = [];

  if (fenceType === 'Wrought iron fence') {
    materialsList = [
      {
        id: 'Standard flat top',
        name: 'Standard Flat Top (2-Rail)',
        price: MATERIAL_PRICES['Standard flat top'],
        description: 'Elite 2-rail flat top black wrought iron panels offering modern, clean architectural lines.',
        badge: 'Classic Black Match',
        badgeColor: 'bg-slate-100 text-slate-800'
      },
      {
        id: 'Extended pickets',
        name: '2-Rail Extended Pickets',
        price: MATERIAL_PRICES['Extended pickets'],
        description: 'Traditional spear styling with picket tips extending above the top rail for decorative appeal.',
        badge: 'Spear Decorative',
        badgeColor: 'bg-indigo-100 text-indigo-800'
      },
      {
        id: '3 rail racking',
        name: '3-Rail Racking Panel',
        price: MATERIAL_PRICES['3 rail racking'],
        description: 'Heavy duty three-rail structural panel engineered specifically to transition sloped ground beautifully.',
        badge: 'Maximum Enclosure',
        badgeColor: 'bg-amber-100 text-amber-800'
      }
    ];
  } else if (fenceType === 'chain link fence') {
    materialsList = [
      {
        id: 'Residential Grade',
        name: 'Residential Grade (11ga)',
        price: MATERIAL_PRICES['Residential Grade'],
        description: 'Affordable galvanized steel wire mesh (11-gauge) suited for standard residential properties.',
        badge: 'Highly Economical',
        badgeColor: 'bg-green-100 text-green-800'
      },
      {
        id: 'Commercial Grade',
        name: 'Commercial Grade (9ga)',
        price: MATERIAL_PRICES['Commercial Grade'],
        description: 'Thick, high-strength industrial 9-gauge galvanized fabric suited for superior security.',
        badge: 'Heavy Utility',
        badgeColor: 'bg-blue-100 text-blue-800'
      },
      {
        id: 'Privacy Slats',
        name: 'Galvanized with Privacy Slats',
        price: MATERIAL_PRICES['Privacy Slats'],
        description: 'Standard 11-gauge galvanized steel fence outfitted with lock-in vertical privacy slats.',
        badge: 'Semi-Private Span',
        badgeColor: 'bg-purple-100 text-purple-800'
      }
    ];
  } else if (fenceType === 'pipe fence') {
    materialsList = [
      {
        id: 'Set in Concrete',
        name: 'Set in Concrete Post Pipe (Standard)',
        price: MATERIAL_PRICES['Set in Concrete'],
        description: 'Heavy steel gauge schedule posts embedded inside deep concrete base footing blocks. Built for maximum longevity and wind resistance, concrete set posts are Lone Star standard.',
        badge: 'Concrete Set Standard',
        badgeColor: 'bg-[#1e1b4b] text-white'
      }
    ];
  } else {
    // Wood Fence default
    materialsList = [
      {
        id: 'PT Pine',
        name: 'Pressure-Treated Pine',
        price: MATERIAL_PRICES['PT Pine'],
        description: 'Rigid wood species pressure-infused with preservative chemicals protecting against decay and termites.',
        badge: 'Tough Budget Option',
        badgeColor: 'bg-lime-100 text-lime-800'
      },
      {
        id: 'Japanese Cedar',
        name: 'Japanese Cedar (Sugi)',
        price: MATERIAL_PRICES['Japanese Cedar'],
        description: 'Superior dimensional stability, pleasing natural grain, and innate natural resistance to insect rot.',
        badge: 'Popular Quality Choice',
        badgeColor: 'bg-amber-100 text-amber-800'
      },
      {
        id: 'Western Red Cedar',
        name: 'Western Red Cedar',
        price: MATERIAL_PRICES['Western Red Cedar'],
        description: 'Top-tier luxury timber. Supreme water resistance, beautiful red tones, and absolute resistance to warping.',
        badge: 'Ultimate Premium Species',
        badgeColor: 'bg-emerald-100 text-emerald-800'
      }
    ];
  }

  return (
    <div id="step-3-container" className="space-y-6">
      <div className="text-center max-w-xl mx-auto space-y-2">
        <h2 className="text-2xl font-black text-american-blue uppercase tracking-tight">Material & Details</h2>
        <p className="text-sm font-medium text-[#666666]">
          Choose the specific species, grade, or styling configuration for your {fenceType || 'Wood Fence'}.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {materialsList.map((m) => {
          const isSelected = material === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onChangeField('material', m.id);
              }}
              className={`flex flex-col text-left p-6 rounded-2xl border-2 transition-all duration-300 relative ${
                isSelected
                  ? 'border-american-blue bg-blue-50/10 ring-2 ring-american-blue/20 shadow-md shadow-american-blue/5'
                  : 'border-[#E5E5E5] bg-white hover:border-[#CCCCCC] hover:shadow-md'
              }`}
            >
              <div className="flex justify-between items-start mb-3 w-full">
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] uppercase font-black tracking-wider ${m.badgeColor}`}>
                  {m.badge}
                </span>
                {isSelected && (
                  <CheckCircle2 size={16} className="text-american-blue shrink-0 ml-1" />
                )}
              </div>
              <h3 className="font-bold text-base text-[#111111] mb-1">{m.name}</h3>
              <p className="text-xs text-[#666666] leading-relaxed flex-grow mt-1">{m.description}</p>
            </button>
          );
        })}
      </div>

      {/* Conditional settings for styling modifications based on style selected */}
      <div className="max-w-3xl mx-auto bg-white p-6 rounded-2xl border border-[#E5E5E5] space-y-6">
        <h3 className="text-sm font-black text-american-blue uppercase tracking-wider border-b border-[#F0F0F0] pb-2">
          Special Options
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Option A: Staining (Only for Wood Fence) */}
          {fenceType === 'Wood Fence' && (
            <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
                <Sparkles size={18} />
              </div>
              <div className="space-y-1">
                <span className="block text-sm font-bold text-american-blue">Pre-Stained Lumber Finish?</span>
                <p className="text-xs text-[#666666]">Apply factory pre-staining to lumber (adds protection & rich warm color).</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onChangeField('isPreStained', false)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                      !isPreStained 
                        ? 'bg-slate-900 border-slate-900 text-white' 
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Raw Lumber
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeField('isPreStained', true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                      isPreStained 
                        ? 'bg-slate-900 border-slate-900 text-white' 
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Pre-Stained
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Option B: Post Reusing & Disclaimer (All, but focus on Wood/overall) */}
          <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="h-10 w-10 rounded-xl bg-orange-50 text-orange-700 flex items-center justify-center shrink-0 border border-orange-200">
              <RefreshCw size={18} />
            </div>
            <div className="space-y-1">
              <span className="block text-sm font-bold text-american-blue">Reuse Existing Posts?</span>
              <p className="text-xs text-[#666666]">Reuse standard sturdy fence posts already set in position.</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => onChangeField('reusePosts', false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                    !reusePosts 
                      ? 'bg-slate-900 border-slate-900 text-white' 
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  New Posts
                </button>
                <button
                  type="button"
                  onClick={() => onChangeField('reusePosts', true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                    reusePosts 
                      ? 'bg-slate-900 border-slate-900 text-white' 
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Reuse Existing
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Legal Disclaimer Box if Reuse Existing Posts is checked */}
        {reusePosts && (
          <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-orange-850 flex items-start gap-3 mt-4">
            <ShieldAlert size={20} className="text-orange-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="block text-xs font-black uppercase tracking-wider text-orange-800">Warranty Limitation Notice</span>
              <p className="text-xs font-bold text-orange-700 leading-relaxed uppercase">
                Contractor will reuse existing posts provided by Customer. Contractor's warranty DOES NOT apply to existing posts.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Wood Style customizer section if Wood Fence is selected */}
      {fenceType === 'Wood Fence' && (
        <div className="max-w-3xl mx-auto bg-white p-6 rounded-2xl border border-[#E5E5E5] space-y-6">
          <h3 className="text-sm font-black text-american-blue uppercase tracking-wider border-b border-[#F0F0F0] pb-2">
            Wood Fence Construction Style
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Picket Style: Board on Board vs Side by Side */}
            <div className="space-y-2 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="block text-sm font-bold text-american-blue">Picket Orientation</span>
                <p className="text-xs text-[#666666] leading-relaxed mt-1">
                  Choose how your wood pickets are oriented: Side by Side (standard) or Board on Board (overlapping layers).
                </p>
              </div>
              <div className="pt-2 flex gap-2 w-full">
                <button
                  type="button"
                  onClick={() => onChangeField('picketStyle', 'w-side')}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold border transition duration-250 ${
                    picketStyle === 'w-side'
                      ? 'bg-american-blue border-american-blue text-white shadow-sm'
                      : 'bg-white border-[#E5E5E5] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="block text-center font-black">Side by Side</span>
                  <span className="block text-[9px] text-center opacity-85 mt-0.5">Micro gaps form over time</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeField('picketStyle', 'w-bob')}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold border transition duration-250 ${
                    picketStyle === 'w-bob'
                      ? 'bg-american-blue border-american-blue text-white shadow-sm'
                      : 'bg-white border-[#E5E5E5] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="block text-center font-black">Board on Board</span>
                  <span className="block text-[9px] text-center opacity-85 mt-0.5">100% gapless privacy</span>
                </button>
              </div>
            </div>

            {/* Picket Top Finish: Dog Ear vs Flat Top */}
            <div className="space-y-2 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="block text-sm font-bold text-american-blue">Picket Top Finish</span>
                <p className="text-xs text-[#666666] leading-relaxed mt-1">
                  Dog Ear is standard. Flat Top gives an elegant modern line, especially when finished with cap and trim.
                </p>
              </div>
              <div className="pt-2 flex gap-2 w-full">
                <button
                  type="button"
                  onClick={() => onChangeField('topStyle', 'Dog Ear')}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold border transition duration-250 ${
                    topStyle === 'Dog Ear' || !topStyle
                      ? 'bg-american-blue border-american-blue text-white shadow-sm'
                      : 'bg-white border-[#E5E5E5] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="block text-center font-black">Dog Ear</span>
                  <span className="block text-[9px] text-center opacity-85 mt-0.5">Classic dog-eared tops</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeField('topStyle', 'Flat Top')}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold border transition duration-250 ${
                    topStyle === 'Flat Top'
                      ? 'bg-american-blue border-american-blue text-white shadow-sm'
                      : 'bg-white border-[#E5E5E5] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="block text-center font-black">Flat Top</span>
                  <span className="block text-[9px] text-center opacity-85 mt-0.5">Clean horizontal top cuts</span>
                </button>
              </div>
            </div>

            {/* Top Cap (2x6) Toggle */}
            <div className="space-y-2 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="block text-sm font-bold text-american-blue">Top Cap Board (2x6 Wood Rail)</span>
                <p className="text-xs text-[#666666] leading-relaxed mt-1">
                  Adds a flat horizontal structural cap across the top of your fence panels.
                </p>
              </div>
              <div className="pt-2 flex gap-2 w-full">
                <button
                  type="button"
                  onClick={() => onChangeField('hasTopCap', false)}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold border transition duration-250 ${
                    !hasTopCap
                      ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                      : 'bg-white border-[#E5E5E5] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Standard (No Cap)
                </button>
                <button
                  type="button"
                  onClick={() => onChangeField('hasTopCap', true)}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold border transition duration-250 ${
                    hasTopCap
                      ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                      : 'bg-white border-[#E5E5E5] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Include Top Cap
                </button>
              </div>
            </div>

            {/* Top Trim (1x4) Toggle */}
            <div className="space-y-2 p-4 rounded-xl bg-[#F8FAFC] border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="block text-sm font-bold text-american-blue">Top Trim Board (1x4 Decorative Rail)</span>
                <p className="text-xs text-[#666666] leading-relaxed mt-1">
                  Adds a vertical trim board accent under the cap for a beautiful, premium framed framing look.
                </p>
              </div>
              <div className="pt-2 flex gap-2 w-full">
                <button
                  type="button"
                  onClick={() => onChangeField('hasCapAndTrim', false)}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold border transition duration-250 ${
                    !hasCapAndTrim
                      ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                      : 'bg-white border-[#E5E5E5] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  No Trim
                </button>
                <button
                  type="button"
                  onClick={() => onChangeField('hasCapAndTrim', true)}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold border transition duration-250 ${
                    hasCapAndTrim
                      ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                      : 'bg-white border-[#E5E5E5] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  Include Top Trim
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pipe style customizer section if Pipe Fence is selected */}
      {fenceType === 'pipe fence' && (
        <div className="max-w-3xl mx-auto bg-white p-6 rounded-2xl border border-[#E5E5E5] space-y-6">
          <h3 className="text-sm font-black text-american-blue uppercase tracking-wider border-b border-[#F0F0F0] pb-2">
            Pipe Fence Customizer Options
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Rail Paint Color Selection */}
            <div className="space-y-2 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="block text-sm font-bold text-american-blue">Rail Paint Color</span>
                <p className="text-xs text-[#666666] leading-relaxed mt-1 font-semibold">
                  Choose the high-durability finish color painted on your horizontal metal rails.
                </p>
              </div>
              <div className="pt-3 flex gap-2 w-full">
                {['Black', 'Hunter Green', 'White'].map((colorOpt) => {
                  const isColorSel = pipePaintColor === colorOpt;
                  return (
                    <button
                      key={colorOpt}
                      type="button"
                      onClick={() => onChangeField('pipePaintColor', colorOpt)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black border transition duration-250 ${
                        isColorSel
                          ? 'bg-american-blue border-american-blue text-white shadow-sm'
                          : 'bg-white border-[#E5E5E5] text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {colorOpt}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* No-Climb Wire Selection */}
            <div className="space-y-2 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="block text-sm font-bold text-american-blue">No-Climb Wire Finish</span>
                <p className="text-xs text-[#666666] leading-relaxed mt-1 font-semibold">
                  Select the mesh coating. Black coated offers a highly transparent, premium look that blends with pasture surroundings.
                </p>
              </div>
              <div className="pt-3 flex gap-2 w-full">
                {[
                  { id: 'Black', label: 'Black Coated' },
                  { id: 'Galvanized', label: 'Galvanized' }
                ].map((wireOpt) => {
                  const isWireSel = pipeWireType === wireOpt.id;
                  return (
                    <button
                      key={wireOpt.id}
                      type="button"
                      onClick={() => onChangeField('pipeWireType', wireOpt.id)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black border transition duration-250 ${
                        isWireSel
                          ? 'bg-american-blue border-american-blue text-white shadow-sm'
                          : 'bg-white border-[#E5E5E5] text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="block text-center">{wireOpt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary calculation card */}
      <div className="max-w-xl mx-auto bg-slate-100 p-4 rounded-2xl flex items-center justify-between border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-american-blue text-white shadow-sm">
            <Layers size={18} />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Choice</span>
            <span className="text-xs font-black text-american-blue block">
              {fenceType === 'pipe fence' 
                ? `Pipe Fence / ${pipeWireType} Wire / ${pipePaintColor} Rails` 
                : `${material || 'Select Option'} ${fenceType === 'Wood Fence' ? (isPreStained ? '(Pre-Stained)' : '(Raw)') : ''}`
              }
            </span>
          </div>
        </div>
        <div className="text-right flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
          <Lock size={12} className="text-amber-500" />
          <div>
            <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">Base Rate</span>
            <span className="text-[10px] font-black text-slate-700 block whitespace-nowrap">Locked until Step 5</span>
          </div>
        </div>
      </div>

      <div className="flex justify-between max-w-5xl mx-auto pt-4">
        <button
          onClick={onBack}
          className="rounded-xl px-5 py-3 text-sm font-bold border border-[#D5D5D5] bg-white text-[#555555] hover:bg-slate-50 active:scale-95 transition-all"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!material}
          className={`rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wider text-white shadow-lg active:scale-95 transition-all ${
            !material
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
