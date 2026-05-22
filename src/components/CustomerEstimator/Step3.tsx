import React from 'react';
import { Layers, HardHat } from 'lucide-react';
import { MATERIAL_PRICES, EstimateBreakdown } from './customerEstimateCalculations';

interface Step3Props {
  material: string;
  breakdown: EstimateBreakdown;
  onChangeMaterial: (material: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function Step3({
  material,
  breakdown,
  onChangeMaterial,
  onNext,
  onBack,
}: Step3Props) {
  const materialsList = [
    {
      id: 'Pressure-treated',
      name: 'Pressure-Treated Pine',
      price: MATERIAL_PRICES['Pressure-treated'],
      description: 'Budget-friendly, chemical protection against decay and insects.',
      badge: 'Aggressive Value',
      badgeColor: 'bg-green-100 text-green-800'
    },
    {
      id: 'Cedar',
      name: 'Japanese / Western Cedar',
      price: MATERIAL_PRICES['Cedar'],
      description: 'Elegant, premium natural aesthetic with superb dimensional stability.',
      badge: 'Popular Favorite',
      badgeColor: 'bg-amber-100 text-amber-800'
    },
    {
      id: 'Composite',
      name: 'High-Performance Composite',
      price: MATERIAL_PRICES['Composite'],
      description: 'Ultra low maintenance, won\'t rot, warp, splinter, or fade.',
      badge: 'Premium Quality',
      badgeColor: 'bg-purple-100 text-purple-800'
    },
    {
      id: 'Vinyl',
      name: 'Architectural Vinyl',
      price: MATERIAL_PRICES['Vinyl'],
      description: 'Smooth, pristine look with absolute immunity to rot or corrosion.',
      badge: 'Maintenance Free',
      badgeColor: 'bg-blue-100 text-blue-800'
    },
    {
      id: 'Metal',
      name: 'Powder-Coated Metal / Wrought Iron',
      price: MATERIAL_PRICES['Metal'],
      description: 'Superior strength, unmatched security, and architectural styling.',
      badge: 'Maximum Longevity',
      badgeColor: 'bg-gray-200 text-gray-800'
    },
    {
      id: 'Chain Link',
      name: 'Heavy Galvanized Chain Link',
      price: MATERIAL_PRICES['Chain Link'],
      description: 'Simple, effective, extremely secure boundary tracking.',
      badge: 'Highest Economy',
      badgeColor: 'bg-emerald-100 text-emerald-800'
    }
  ];

  return (
    <div id="step-3-container" className="space-y-6">
      <div className="text-center max-w-xl mx-auto space-y-2">
        <h2 className="text-2xl font-black text-american-blue uppercase tracking-tight">Fence Material</h2>
        <p className="text-sm font-medium text-[#666666]">
          Choose the material that matches your performance, style, and financial requirements.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
        {materialsList.map((m) => {
          const isSelected = material === m.id;
          return (
            <button
              key={m.id}
              onClick={() => {
                onChangeMaterial(m.id);
              }}
              className={`flex flex-col text-left p-5 rounded-2xl border-2 transition-all duration-300 relative ${
                isSelected
                  ? 'border-american-blue bg-blue-50/20 ring-2 ring-american-blue/20 shadow-md shadow-american-blue/5'
                  : 'border-[#E5E5E5] bg-white hover:border-[#CCCCCC] hover:shadow-md'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-black tracking-wider ${m.badgeColor}`}>
                  {m.badge}
                </span>
                <span className="text-sm font-black text-emerald-600">
                  ${m.price}/LF
                </span>
              </div>
              <h3 className="font-bold text-base text-[#111111] mb-1">{m.name}</h3>
              <p className="text-xs text-[#666666] leading-relaxed flex-grow">{m.description}</p>
            </button>
          );
        })}
      </div>

      {/* Summary calculation card */}
      <div className="max-w-xl mx-auto bg-slate-100 hover:border-slate-300 border border-slate-200 p-5 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white text-american-blue border border-slate-200">
            <Layers size={18} />
          </div>
          <div>
            <span className="block text-[10px] font-bold text-[#666666] uppercase tracking-wider">Current Selected Material Cost:</span>
            <span className="text-sm font-black text-[#111111]">{material} — ${MATERIAL_PRICES[material]}/LF</span>
          </div>
        </div>
        <div className="text-right">
          <span className="block text-[10px] font-bold text-[#666666] uppercase tracking-wider">Total Est. Price:</span>
          <span className="text-lg font-black text-emerald-600">${Math.round(breakdown.total).toLocaleString()}</span>
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
          className="rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wider text-white shadow-lg bg-american-blue shadow-american-blue/20 hover:bg-american-blue/90 active:scale-95 transition-all"
        >
          Next Step
        </button>
      </div>
    </div>
  );
}
