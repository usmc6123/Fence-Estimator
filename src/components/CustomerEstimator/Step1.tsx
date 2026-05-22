import React from 'react';
import { Shield, EyeOff, Layers, Trees, Box, Grid } from 'lucide-react';

interface Step1Props {
  selectedType: string;
  onChange: (type: string) => void;
  onNext: () => void;
}

export default function Step1({ selectedType, onChange, onNext }: Step1Props) {
  const options = [
    {
      id: 'Privacy',
      title: 'Privacy Fence',
      description: 'Solid side-by-side wooden fence providing complete privacy and noise reduction.',
      icon: Shield,
      bg: 'hover:border-american-blue hover:bg-slate-50'
    },
    {
      id: 'Semi-Private',
      title: 'Semi-Private Fence',
      description: 'Board-on-board shadowbox designs or horizontal layouts for stylish airflow.',
      icon: EyeOff,
      bg: 'hover:border-american-blue hover:bg-slate-50'
    },
    {
      id: 'Picket',
      title: 'Picket Fence',
      description: 'Classic vertical space-picket styles. Traditionally ornamental and warm.',
      icon: Layers,
      bg: 'hover:border-american-blue hover:bg-slate-50'
    },
    {
      id: 'Split Rail',
      title: 'Split Rail / Pipe',
      description: 'Rustic ranch rail and steel pipe setups. Perfect for open boundaries and fields.',
      icon: Trees,
      bg: 'hover:border-american-blue hover:bg-slate-50'
    },
    {
      id: 'Chain Link',
      title: 'Chain Link',
      description: 'Durable, affordable commercial or residential grade galvanized steel mesh.',
      icon: Grid,
      bg: 'hover:border-emerald-600 hover:bg-emerald-50/50'
    },
    {
      id: 'Metal',
      title: 'Metal / Ornamental',
      description: 'High-end black wrought iron panels with flat or decorative top pickets.',
      icon: Box,
      bg: 'hover:border-[#9d8145] hover:bg-amber-50/20'
    }
  ];

  return (
    <div id="step-1-container" className="space-y-6">
      <div className="text-center max-w-xl mx-auto space-y-2">
        <h2 className="text-2xl font-black text-american-blue uppercase tracking-tight">Select Fence Style</h2>
        <p className="text-sm font-medium text-[#666666]">
          Pick the visual category that matches your vision. You will choose the exact material on the upcoming steps.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {options.map((opt) => {
          const Icon = opt.icon;
          const isSelected = selectedType === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => {
                onChange(opt.id);
                // Minor interaction delay so the user sees the active selection before auto-triggering next
                setTimeout(onNext, 250);
              }}
              className={`flex flex-col text-left p-6 rounded-2xl border-2 transition-all duration-300 ${opt.bg} ${
                isSelected
                  ? 'border-american-blue bg-blue-50/30 ring-2 ring-american-blue/20 shadow-md shadow-american-blue/5'
                  : 'border-[#E5E5E5] bg-white hover:shadow-lg'
              }`}
            >
              <div className={`p-3 rounded-xl mb-4 w-fit ${
                isSelected ? 'bg-american-blue text-white' : 'bg-slate-100 text-[#666666]'
              }`}>
                <Icon size={22} />
              </div>
              <h3 className="font-bold text-base text-[#111111] mb-2">{opt.title}</h3>
              <p className="text-xs text-[#666666] leading-relaxed flex-grow">{opt.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
