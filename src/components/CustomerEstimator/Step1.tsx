import React from 'react';
import { Shield, Trees, Box, Grid } from 'lucide-react';
import privacyFenceImg from '../../assets/images/actual_privacy_fence.jpg';
import metalFenceImg from '../../assets/images/user_metal_fence_faithful_new_1779474753459.png';
import chainLinkImg from '../../assets/images/user_chain_link_fence_faithful_new_1779474771303.png';
import pipeFenceImg from '../../assets/images/user_pipe_fence_faithful_1779472956023.png';
import { getCustomPhotos } from './photoStorage';

interface Step1Props {
  selectedType: string;
  onChange: (type: string) => void;
  onNext: () => void;
}

export default function Step1({ selectedType, onChange, onNext }: Step1Props) {
  const [customPhotos, setCustomPhotos] = React.useState<Record<string, string>>({});

  const loadPhotos = React.useCallback(() => {
    getCustomPhotos()
      .then((photos) => {
        setCustomPhotos(photos);
      })
      .catch((e) => {
        console.error('Error loading custom photos from high-capacity DB:', e);
      });
  }, []);

  React.useEffect(() => {
    loadPhotos();

    // Listen for custom photo changes
    window.addEventListener('customer_estimator_photos_updated', loadPhotos);
    return () => {
      window.removeEventListener('customer_estimator_photos_updated', loadPhotos);
    };
  }, [loadPhotos]);

  const options = [
    {
      id: 'Wood Fence',
      title: 'Wood Fence',
      description: 'Solid side-by-side or decorative wooden fences providing complete privacy and noise reduction.',
      icon: Shield,
      image: customPhotos['Wood Fence'] || privacyFenceImg,
      isUserPhoto: true,
      bg: 'hover:border-american-blue hover:bg-slate-50'
    },
    {
      id: 'Wrought iron fence',
      title: 'Wrought iron fence',
      description: 'High-end black wrought iron/metal panels with flat or decorative top pickets.',
      icon: Box,
      image: customPhotos['Wrought iron fence'] || metalFenceImg,
      isUserPhoto: true,
      bg: 'hover:border-[#9d8145] hover:bg-amber-50/20'
    },
    {
      id: 'chain link fence',
      title: 'chain link fence',
      description: 'Durable, affordable commercial or residential grade galvanized steel mesh.',
      icon: Grid,
      image: customPhotos['chain link fence'] || chainLinkImg,
      isUserPhoto: true,
      bg: 'hover:border-emerald-600 hover:bg-emerald-50/50'
    },
    {
      id: 'pipe fence',
      title: 'pipe fence',
      description: 'Rustic ranch rail and steel pipe setups. Perfect for open boundaries and fields.',
      icon: Trees,
      image: customPhotos['pipe fence'] || pipeFenceImg,
      isUserPhoto: true,
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

      <div className="flex justify-end max-w-5xl mx-auto pt-4 border-t border-[#F0F0F0]">
        <button
          onClick={onNext}
          disabled={!selectedType}
          className={`rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wider text-white shadow-lg active:scale-95 transition-all ${
            !selectedType
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
