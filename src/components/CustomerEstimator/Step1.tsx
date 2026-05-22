import React from 'react';
import { Shield, Trees, Box, Grid } from 'lucide-react';
import privacyFenceImg from '../../assets/images/actual_privacy_fence_squarespace.webp';
import metalFenceImg from '../../assets/images/actual_metal_fence_squarespace.jpg';

interface Step1Props {
  selectedType: string;
  onChange: (type: string) => void;
  onNext: () => void;
}

export default function Step1({ selectedType, onChange, onNext }: Step1Props) {
  const options = [
    {
      id: 'Wood Fence',
      title: 'Wood Fence',
      description: 'Solid side-by-side or decorative wooden fences providing complete privacy and noise reduction.',
      icon: Shield,
      image: privacyFenceImg,
      isUserPhoto: true,
      bg: 'hover:border-american-blue hover:bg-slate-50'
    },
    {
      id: 'Wrought iron fence',
      title: 'Wrought iron fence',
      description: 'High-end black wrought iron/metal panels with flat or decorative top pickets.',
      icon: Box,
      image: metalFenceImg,
      isUserPhoto: true,
      bg: 'hover:border-[#9d8145] hover:bg-amber-50/20'
    },
    {
      id: 'chain link fence',
      title: 'chain link fence',
      description: 'Durable, affordable commercial or residential grade galvanized steel mesh.',
      icon: Grid,
      image: 'https://images.unsplash.com/photo-1548690312-e3b507d8c110?auto=format&fit=crop&w=600&q=80',
      isUserPhoto: false,
      bg: 'hover:border-emerald-600 hover:bg-emerald-50/50'
    },
    {
      id: 'pipe fence',
      title: 'pipe fence',
      description: 'Rustic ranch rail and steel pipe setups. Perfect for open boundaries and fields.',
      icon: Trees,
      image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=600&q=80',
      isUserPhoto: false,
      bg: 'hover:border-american-blue hover:bg-slate-50'
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              className={`flex flex-col text-left rounded-3xl border-2 overflow-hidden transition-all duration-300 ${opt.bg} ${
                isSelected
                  ? 'border-american-blue bg-blue-50/10 ring-4 ring-american-blue/10 shadow-lg shadow-american-blue/5'
                  : 'border-[#E5E5E5] bg-white hover:shadow-xl hover:border-slate-300'
              }`}
            >
              {/* Image Section */}
              <div className="w-full h-48 overflow-hidden relative bg-slate-100">
                <img
                  src={opt.image}
                  alt={opt.title}
                  className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                
                {/* Active Indicator Pin */}
                {isSelected && (
                  <div className="absolute top-3 right-3 bg-american-blue text-white font-extrabold text-[10px] tracking-widest px-2.5 py-1 rounded-full uppercase shadow-md border border-white/20 animate-pulse">
                    Selected
                  </div>
                )}

                {/* User Photo Badge / Status Badge */}
                {opt.isUserPhoto && (
                  <div className="absolute bottom-3 left-3 bg-[#1e1b4b] text-white font-black text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full shadow-md flex items-center gap-1.5 border border-indigo-400/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LONE STAR ACTUAL WORK
                  </div>
                )}
                {!opt.isUserPhoto && (
                  <div className="absolute bottom-3 left-3 bg-slate-900/60 backdrop-blur-xs text-white font-bold text-[9px] uppercase tracking-wider px-2 py-0.5 rounded">
                    STYLE REFERENCE
                  </div>
                )}
              </div>

              {/* Text Area */}
              <div className="p-6 flex-grow flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-xl ${
                      isSelected ? 'bg-american-blue text-white' : 'bg-slate-100 text-[#666666]'
                    }`}>
                      <Icon size={16} />
                    </div>
                    <h3 className="font-bold text-base text-[#111111]">{opt.title}</h3>
                  </div>
                  <p className="text-xs text-[#666666] leading-relaxed font-semibold">
                    {opt.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
