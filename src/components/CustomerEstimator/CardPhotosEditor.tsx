import React from 'react';
import { Upload, Image as ImageIcon, Trash2, RefreshCw, CheckCircle2, Sliders, Layers } from 'lucide-react';

// Step 1: Fence Styles Images
import privacyFenceImg from '../../assets/images/actual_privacy_fence.jpg';
import metalFenceImg from '../../assets/images/user_metal_fence_faithful_new_1779474753459.png';
import chainLinkImg from '../../assets/images/user_chain_link_fence_faithful_new_1779474771303.png';
import pipeFenceImg from '../../assets/images/user_pipe_fence_faithful_1779472956023.png';

// Step 2: Material Option Images
import ptPineImg from '../../assets/images/downloaded_portfolio_1.png';
import japaneseCedarImg from '../../assets/images/downloaded_portfolio_2.png';
import westernRedCedarImg from '../../assets/images/downloaded_portfolio_3.png';
import standardFlatTopImg from '../../assets/images/actual_metal_fence_squarespace.jpg';
import extendedPicketsImg from '../../assets/images/downloaded_portfolio_4.png';
import rackingPanelImg from '../../assets/images/downloaded_portfolio_5.png';
import residentialGradeImg from '../../assets/images/user_chain_link_fence_faithful_new_1779474771303.png';
import commercialGradeImg from '../../assets/images/downloaded_portfolio_7.jpeg';
import privacySlatsImg from '../../assets/images/downloaded_portfolio_6.png';
import setInConcreteImg from '../../assets/images/user_pipe_fence_faithful_1779472956023.png';

interface CardOption {
  id: string;
  name: string;
  description: string;
  defaultImage: string;
}

const resizeAndCropImage = (file: File, targetWidth = 800, targetHeight = 500): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        // Calculate aspect ratio and drawing dimensions (cover crop & center)
        const imgRatio = img.width / img.height;
        const targetRatio = targetWidth / targetHeight;
        let dWidth, dHeight, dx, dy;

        if (imgRatio > targetRatio) {
          // Image is wider than target
          dHeight = targetHeight;
          dWidth = targetHeight * imgRatio;
          dx = (targetWidth - dWidth) / 2;
          dy = 0;
        } else {
          // Image is taller than target
          dWidth = targetWidth;
          dHeight = targetWidth / imgRatio;
          dx = 0;
          dy = (targetHeight - dHeight) / 2;
        }

        // Fill background with clean gray first
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // High quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(img, dx, dy, dWidth, dHeight);

        // Compress at 85% image quality to keep payload small (<120kb) and prevent QuotaExceededError
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
        resolve(compressedBase64);
      };
      img.onerror = (err) => reject(err);
      img.src = event.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

export default function CardPhotosEditor() {
  const [customPhotos, setCustomPhotos] = React.useState<Record<string, string>>({});
  const [dragActiveId, setDragActiveId] = React.useState<string | null>(null);
  const [activeSection, setActiveSection] = React.useState<'styles' | 'materials'>('styles');
  const [message, setMessage] = React.useState<{ id: string; text: string; type: 'success' | 'info' } | null>(null);

  // Load and sync existing custom images on mount
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('customer_estimator_custom_photos');
      if (saved) {
        setCustomPhotos(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading custom photos:', e);
    }
  }, []);

  const styleOptions: CardOption[] = [
    {
      id: 'Wood Fence',
      name: 'Wood Fence Style',
      description: 'Solid side-by-side or decorative wooden fences providing complete privacy.',
      defaultImage: privacyFenceImg,
    },
    {
      id: 'Wrought iron fence',
      name: 'Wrought Iron Fence Style',
      description: 'High-end black wrought iron/metal panels with flat or decorative top pickets.',
      defaultImage: metalFenceImg,
    },
    {
      id: 'chain link fence',
      name: 'Chain Link Fence Style',
      description: 'Durable, affordable commercial or residential grade galvanized steel mesh.',
      defaultImage: chainLinkImg,
    },
    {
      id: 'pipe fence',
      name: 'Pipe Fence Style',
      description: 'Rustic ranch rail and steel pipe setups. Perfect for open boundaries and fields.',
      defaultImage: pipeFenceImg,
    },
  ];

  const materialOptions: CardOption[] = [
    {
      id: 'PT Pine',
      name: 'Pressure-Treated Pine',
      description: 'Rigid wood species pressure-infused with preservative chemicals.',
      defaultImage: ptPineImg,
    },
    {
      id: 'Japanese Cedar',
      name: 'Japanese Cedar (Sugi)',
      description: 'Innate resistance wood with superior dimensional stability and natural grain.',
      defaultImage: japaneseCedarImg,
    },
    {
      id: 'Western Red Cedar',
      name: 'Western Red Cedar',
      description: 'Top-tier luxury lumber with supreme water, rot, and warp resistance.',
      defaultImage: westernRedCedarImg,
    },
    {
      id: 'Standard flat top',
      name: 'Standard Flat Top (Wrought Iron)',
      description: 'Elite 2-rail flat top black wrought iron panels with clean architectural lines.',
      defaultImage: standardFlatTopImg,
    },
    {
      id: 'Extended pickets',
      name: 'Extended Pickets (Wrought Iron)',
      description: 'Spear styling with picket tips extending above the top rail for decor.',
      defaultImage: extendedPicketsImg,
    },
    {
      id: '3 rail racking',
      name: '3-Rail Racking Panel (Wrought Iron)',
      description: 'Heavy duty panel engineered specifically to transition slopes beautifully.',
      defaultImage: rackingPanelImg,
    },
    {
      id: 'Residential Grade',
      name: 'Residential Grade (Chain Link)',
      description: 'Standard residential grade galvanized steel mesh (11-gauge) fabric.',
      defaultImage: residentialGradeImg,
    },
    {
      id: 'Commercial Grade',
      name: 'Commercial Grade (Chain Link)',
      description: 'Thick, high-strength industrial 9-gauge galvanized fabric suited for high security.',
      defaultImage: commercialGradeImg,
    },
    {
      id: 'Privacy Slats',
      name: 'Galvanized with Privacy Slats (Chain Link)',
      description: 'Chain link steel fabric outfitted with lock-in vertical privacy slats.',
      defaultImage: privacySlatsImg,
    },
    {
      id: 'Set in Concrete',
      name: 'Set in Concrete Post (Pipe Fence)',
      description: 'Heavy steel post embedded deep in concrete base footing blocks.',
      defaultImage: setInConcreteImg,
    },
  ];

  const activeOptions = activeSection === 'styles' ? styleOptions : materialOptions;

  const handleFileChange = async (id: string, file: File) => {
    if (!file) return;

    setMessage({ id, text: 'Processing & compressing photo...', type: 'info' });

    try {
      const compressedBase64 = await resizeAndCropImage(file, 800, 500);
      const updatedPhotos = { ...customPhotos, [id]: compressedBase64 };
      setCustomPhotos(updatedPhotos);
      localStorage.setItem('customer_estimator_custom_photos', JSON.stringify(updatedPhotos));
      
      // Emit synthetic update event so other active windows can update
      window.dispatchEvent(new Event('customer_estimator_photos_updated'));

      setMessage({ id, text: 'Photo updated and saved successfully!', type: 'success' });
      setTimeout(() => setMessage(null), 3500);
    } catch (e) {
      console.error('Error processing photo:', e);
      setMessage({ id, text: 'Failed to process the uploaded image.', type: 'info' });
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveId(id);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveId(null);
  };

  const handleDrop = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveId(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(id, e.dataTransfer.files[0]);
    }
  };

  const handleReset = (id: string) => {
    const updatedPhotos = { ...customPhotos };
    delete updatedPhotos[id];
    setCustomPhotos(updatedPhotos);
    localStorage.setItem('customer_estimator_custom_photos', JSON.stringify(updatedPhotos));

    // Emit event
    window.dispatchEvent(new Event('customer_estimator_photos_updated'));

    setMessage({ id, text: 'Reset to standard default photograph.', type: 'success' });
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div id="card-photos-editor-panel" className="space-y-6">
      <div className="text-center max-w-xl mx-auto space-y-2">
        <h2 className="text-2xl font-black text-american-blue uppercase tracking-tight">Customize Card Photos</h2>
        <p className="text-sm font-medium text-[#666666]">
          Upload custom photographs for the wizard cards. Your custom photos will immediately update both the main Style steps and the detailed Material steps.
        </p>
      </div>

      {/* Control Switcher to choose between Step 1 (Styles) and Step 2 (Materials) */}
      <div className="flex justify-center mb-6">
        <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 inline-flex gap-1.5 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveSection('styles')}
            className={`flex items-center gap-2 py-2.5 px-4 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeSection === 'styles'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-[#666666] hover:bg-slate-200/55 hover:text-slate-900'
            }`}
          >
            <Sliders size={14} />
            Step 1: Fence Styles
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('materials')}
            className={`flex items-center gap-2 py-2.5 px-4 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeSection === 'materials'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-[#666666] hover:bg-slate-200/55 hover:text-slate-900'
            }`}
          >
            <Layers size={14} />
            Step 2: Material Details
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {activeOptions.map((card) => {
          const isCustomized = !!customPhotos[card.id];
          const activeImage = customPhotos[card.id] || card.defaultImage;
          const isDragActive = dragActiveId === card.id;

          return (
            <div
              key={card.id}
              id={`editor-card-${card.id.replace(/\s+/g, '-').toLowerCase()}`}
              className="bg-white border-2 border-[#E5E5E5] rounded-3xl p-6 space-y-4 hover:shadow-lg transition-all duration-300 flex flex-col justify-between"
            >
              {/* Header Info */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <h4 className="font-extrabold text-base text-[#111111]">{card.name}</h4>
                  <span
                    className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full whitespace-nowrap ${
                      isCustomized
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300/30'
                        : 'bg-slate-100 text-slate-500 border border-slate-200/50'
                    }`}
                  >
                    {isCustomized ? '● Custom Image Active' : 'Standard Default'}
                  </span>
                </div>
                <p className="text-xs text-[#777777] font-semibold">{card.description}</p>
              </div>

              {/* Preview Area */}
              <div className="relative h-44 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                <img
                  src={activeImage}
                  alt={card.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                
                {/* Live Badge Overlay */}
                <div className="absolute top-3 left-3 bg-slate-900/75 backdrop-blur-xs text-white font-black text-[9px] uppercase tracking-wider px-2 py-0.5 rounded">
                  Current Display
                </div>
              </div>

              {/* Drag and Drop Uploader - SECURE & STABLE */}
              <div
                onDragOver={(e) => handleDragOver(e, card.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, card.id)}
                onClick={() => {
                  document.getElementById(`file-input-${card.id.replace(/\s+/g, '-')}`)?.click();
                }}
                className={`relative border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer select-none ${
                  isDragActive
                    ? 'border-american-blue bg-blue-50/40 text-american-blue scale-[0.98]'
                    : 'border-[#D5D5D5] bg-slate-50 hover:bg-slate-100/50 text-[#666666]'
                }`}
              >
                <Upload size={22} className={isDragActive ? 'animate-bounce text-american-blue' : 'text-[#888888]'} />
                
                <div className="text-xs font-bold">
                  {isDragActive ? (
                    <span className="text-american-blue">Drop image here!</span>
                  ) : (
                    <span>Drag & drop photo or <span className="text-american-blue underline">click to browse</span></span>
                  )}
                </div>
                
                <span className="text-[10px] text-slate-400 font-medium">Supports PNG, JPG, WEBP (Max 5MB)</span>
                
                <input
                  id={`file-input-${card.id.replace(/\s+/g, '-')}`}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileChange(card.id, e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
              </div>

              {/* Bottom Actions Row */}
              <div className="flex items-center justify-between gap-4 pt-2">
                <div>
                  {message?.id === card.id && (
                    <div
                      className={`text-xs font-bold flex items-center gap-1 ${
                        message.type === 'success' ? 'text-emerald-600' : 'text-american-red'
                      }`}
                    >
                      {message.type === 'success' && <CheckCircle2 size={13} />}
                      <span>{message.text}</span>
                    </div>
                  )}
                </div>
                
                {isCustomized && (
                  <button
                    type="button"
                    onClick={() => handleReset(card.id)}
                    className="flex items-center gap-1.5 text-xs font-black uppercase text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100/60 px-3.5 py-2.5 rounded-xl transition-all border border-amber-200 animate-fadeIn"
                    title="Restore default original photo"
                  >
                    <RefreshCw size={13} />
                    Reset to Default
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
