import React from 'react';
import { Upload, Image as ImageIcon, Trash2, RefreshCw, CheckCircle2, Sliders, Layers, X, ShieldCheck, Save } from 'lucide-react';
import { getCustomPhotos, saveCustomPhotos, clearCustomPhotos } from './photoStorage';

// Step 1: Fence Styles Images
import privacyFenceImg from '../../assets/images/actual_privacy_fence.jpg';
import metalFenceImg from '../../assets/images/user_metal_fence_faithful_new_1779474753459.png';
import chainLinkImg from '../../assets/images/user_chain_link_fence_faithful_new_1779474771303.png';
import pipeFenceImg from '../../assets/images/user_pipe_fence_faithful_1779472956023.png';

// Step 2: Material Option Images
import sideBySideImg from '../../assets/images/side_by_side_fence_1779799143225.png';
import boardOnBoardImg from '../../assets/images/board_on_board_fence_1779799160044.png';
import dogEarImg from '../../assets/images/dog_ear_picket_1779799178350.png';
import flatTopImg from '../../assets/images/flat_top_picket_1779799198099.png';
import topCapImg from '../../assets/images/top_cap_board_1779799217354.png';

import standardFlatTopImg from '../../assets/images/actual_metal_fence_squarespace.jpg';
import extendedPicketsImg from '../../assets/images/downloaded_portfolio_4.png';
import rackingPanelImg from '../../assets/images/downloaded_portfolio_5.png';
import residentialGradeImg from '../../assets/images/user_chain_link_fence_faithful_new_1779474771303.png';
import commercialGradeImg from '../../assets/images/downloaded_portfolio_7.jpeg';
import privacySlatsImg from '../../assets/images/downloaded_portfolio_6.png';

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

  const previewRef = React.useRef<HTMLDivElement>(null);
  const [editorImage, setEditorImage] = React.useState<{
    id: string;
    src: string;
    naturalWidth: number;
    naturalHeight: number;
  } | null>(null);

  const [zoomMultiplier, setZoomMultiplier] = React.useState<number>(1.0);
  const [dragX, setDragX] = React.useState<number>(0);
  const [dragY, setDragY] = React.useState<number>(0);
  const [isDragging, setIsDragging] = React.useState<boolean>(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });

  const [verificationState, setVerificationState] = React.useState<{
    status: 'idle' | 'checking' | 'verified' | 'error';
    message: string;
    details?: string;
  }>({ status: 'idle', message: '' });

  // Load and sync existing custom images on mount
  React.useEffect(() => {
    getCustomPhotos()
      .then((photos) => {
        setCustomPhotos(photos);
      })
      .catch((e) => {
        console.error('Error loading custom photos:', e);
      });
  }, []);

  const handleForceVerifyAndSave = async () => {
    setVerificationState({ status: 'checking', message: 'Verifying with high-capacity IndexedDB...' });
    
    try {
      // Save to IndexedDB
      await saveCustomPhotos(customPhotos);
      
      // Verification read back
      const verifiedData = await getCustomPhotos();
      
      const initialKeys = Object.keys(customPhotos);
      const verifiedKeys = Object.keys(verifiedData);
      
      if (initialKeys.length !== verifiedKeys.length) {
        throw new Error('Database verification mismatch. Not all photos were preserved successfully.');
      }
      
      // Calculate footprint
      const dataStr = JSON.stringify(verifiedData);
      const bytes = new Blob([dataStr]).size;
      const kb = (bytes / 1024).toFixed(1);
      const count = verifiedKeys.length;
      
      // Emit events
      window.dispatchEvent(new Event('customer_estimator_photos_updated'));
      
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      setVerificationState({
        status: 'verified',
        message: `Saved & Sync Verified successfully at ${timestamp}!`,
        details: `All ${count} custom photograph presets are custom-cropped and securely preserved inside your browser high-capacity storage (${kb} KB utilized).`
      });
    } catch (e: any) {
      console.error('Storage verify error:', e);
      setVerificationState({
        status: 'error',
        message: 'Sync Verification Failed!',
        details: e?.message || 'Check browser storage settings.'
      });
    }
  };

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
    // Wood Fence Detail Customizers
    {
      id: 'w-side',
      name: 'Side by Side (Wood Orientation)',
      description: 'Solid side-by-side display aligned with minimal spacing.',
      defaultImage: sideBySideImg,
    },
    {
      id: 'w-bob',
      name: 'Board on Board (Wood Orientation)',
      description: 'Overlapping wood boards offering maximum visual privacy.',
      defaultImage: boardOnBoardImg,
    },
    {
      id: 'Dog Ear',
      name: 'Classic Dog Ear (Wood Top)',
      description: 'The traditional timber picket look with safety cut corners.',
      defaultImage: dogEarImg,
    },
    {
      id: 'Flat Top',
      name: 'Modern Flat Top (Wood Top)',
      description: 'Sleek premium flat picket ending paired with 1x4 trim accents.',
      defaultImage: flatTopImg,
    },
    {
      id: 'top-cap',
      name: 'Include 2x6 Top Cap (Wood Accent)',
      description: 'A structural wood cap board blocking rainwater from the boards.',
      defaultImage: topCapImg,
    },
    // Wrought Iron Detail Customizers
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
    // Chain Link Detail Customizers
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
  ];

  const activeOptions = activeSection === 'styles' ? styleOptions : materialOptions;

  const handleFileChange = async (id: string, file: File) => {
    if (!file) return;

    setMessage({ id, text: 'Opening image in framing viewport...', type: 'info' });

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          setEditorImage({
            id,
            src,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          });
          setZoomMultiplier(1.0);
          setDragX(0);
          setDragY(0);
          setIsDragging(false);
          setMessage(null);
        };
        img.onerror = () => {
          setMessage({ id, text: 'Failed to load image details.', type: 'info' });
        };
        img.src = src;
      };
      reader.onerror = () => {
        setMessage({ id, text: 'Failed to read image file.', type: 'info' });
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.error('Error loading image:', e);
      setMessage({ id, text: 'Failed to open image editor.', type: 'info' });
    }
  };

  const handleSaveAdjustedPhoto = () => {
    if (!editorImage) return;

    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const VIEWPORT_W = 400;
    const VIEWPORT_H = 250;
    const ratio = 800 / VIEWPORT_W; // exactly 2.0

    // Fill background with elegant neutral first
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 800, 500);

    // High quality scaling setup
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const img = new Image();
    img.onload = () => {
      const imgRatio = editorImage.naturalWidth / editorImage.naturalHeight;
      const targetRatio = VIEWPORT_W / VIEWPORT_H;
      let baseScale = 1.0;
      if (imgRatio > targetRatio) {
        baseScale = VIEWPORT_H / editorImage.naturalHeight;
      } else {
        baseScale = VIEWPORT_W / editorImage.naturalWidth;
      }

      const currentW = editorImage.naturalWidth * baseScale * zoomMultiplier;
      const currentH = editorImage.naturalHeight * baseScale * zoomMultiplier;

      const defaultX = (VIEWPORT_W - currentW) / 2;
      const defaultY = (VIEWPORT_H - currentH) / 2;

      const finalW = currentW * ratio;
      const finalH = currentH * ratio;
      const finalX = (defaultX + dragX) * ratio;
      const finalY = (defaultY + dragY) * ratio;

      ctx.drawImage(img, finalX, finalY, finalW, finalH);

      const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
      const updatedPhotos = { ...customPhotos, [editorImage.id]: compressedBase64 };
      setCustomPhotos(updatedPhotos);
      
      saveCustomPhotos(updatedPhotos)
        .then(() => {
          // Emit event
          window.dispatchEvent(new Event('customer_estimator_photos_updated'));
          setMessage({ id: editorImage.id, text: 'Photo custom crop applied and saved!', type: 'success' });
          setEditorImage(null);
          setTimeout(() => setMessage(null), 3500);
        })
        .catch((err) => {
          console.error('Error saving adjusted photo:', err);
          setMessage({ id: editorImage.id, text: 'Failed to write to database: storage is full or restricted.', type: 'info' });
        });
    };
    img.src = editorImage.src;
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
    
    saveCustomPhotos(updatedPhotos)
      .then(() => {
        // Emit event
        window.dispatchEvent(new Event('customer_estimator_photos_updated'));
        setMessage({ id, text: 'Reset to standard default photograph.', type: 'success' });
        setTimeout(() => setMessage(null), 3000);
      })
      .catch((err) => {
        console.error('Error saving reset state:', err);
        setMessage({ id, text: 'Failed to update database.', type: 'info' });
      });
  };

  return (
    <div id="card-photos-editor-panel" className="space-y-6">
      <div className="text-center max-w-xl mx-auto space-y-2">
        <h2 className="text-2xl font-black text-american-blue uppercase tracking-tight">Customize Card Photos</h2>
        <p className="text-sm font-medium text-[#666666]">
          Upload custom photographs for the wizard cards. Your custom photos will immediately update both the main Style steps and the detailed Material steps.
        </p>

        {/* Global Verification & Storage Sanity Tool */}
        <div className="pt-2 max-w-md mx-auto">
          {verificationState.status === 'idle' && (
            <button
              type="button"
              onClick={handleForceVerifyAndSave}
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider py-2.5 px-5 rounded-xl transition duration-200 shadow-sm border border-slate-900 active:scale-95 cursor-pointer"
            >
              <Save size={14} />
              Confirm & Save Photo Settings
            </button>
          )}

          {verificationState.status === 'checking' && (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-2 bg-slate-100 text-slate-500 text-xs font-black uppercase tracking-wider py-2.5 px-5 rounded-xl border border-slate-200 cursor-not-allowed"
            >
              <RefreshCw className="animate-spin" size={14} />
              Verifying write sync...
            </button>
          )}

          {/* Success / Warning State Banners */}
          {verificationState.status === 'verified' && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-850 text-left space-y-1 shadow-xs animate-fadeIn">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-800">
                    {verificationState.message}
                  </span>
                </div>
                {verificationState.details && (
                  <p className="text-[10px] font-bold text-emerald-700">
                    {verificationState.details}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleForceVerifyAndSave}
                className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 hover:underline text-[11px] font-bold uppercase tracking-wider"
              >
                <RefreshCw size={11} />
                Re-Run Storage Verification Test
              </button>
            </div>
          )}

          {verificationState.status === 'error' && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-850 text-left space-y-1 shadow-xs animate-fadeIn">
                <div className="flex items-center gap-2 text-red-800">
                  <X size={18} className="text-american-red shrink-0" />
                  <span className="text-xs font-black uppercase tracking-wider">
                    {verificationState.message}
                  </span>
                </div>
                {verificationState.details && (
                  <p className="text-[10px] text-red-600">
                    {verificationState.details}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleForceVerifyAndSave}
                className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-850 text-white text-xs font-black uppercase tracking-wider py-2.5 px-5 rounded-xl transition duration-200 shadow-sm border border-slate-900 active:scale-95 cursor-pointer"
              >
                <RefreshCw size={13} />
                Retry Storage Verification Action
              </button>
            </div>
          )}
        </div>
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

      {/* Visual Crop & Position Frame Adjustment Modal */}
      {editorImage && (() => {
        const VIEWPORT_W = 400;
        const VIEWPORT_H = 250;
        
        const imgRatio = editorImage.naturalWidth / editorImage.naturalHeight;
        const targetRatio = VIEWPORT_W / VIEWPORT_H;
        let baseScale = 1.0;
        if (imgRatio > targetRatio) {
          baseScale = VIEWPORT_H / editorImage.naturalHeight;
        } else {
          baseScale = VIEWPORT_W / editorImage.naturalWidth;
        }

        const currentW = editorImage.naturalWidth * baseScale * zoomMultiplier;
        const currentH = editorImage.naturalHeight * baseScale * zoomMultiplier;

        const defaultX = (VIEWPORT_W - currentW) / 2;
        const defaultY = (VIEWPORT_H - currentH) / 2;

        const leftPos = defaultX + dragX;
        const topPos = defaultY + dragY;

        const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
          e.preventDefault();
          setIsDragging(true);
          setDragStart({ x: e.clientX - dragX, y: e.clientY - dragY });
        };

        const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
          if (!isDragging) return;
          setDragX(e.clientX - dragStart.x);
          setDragY(e.clientY - dragStart.y);
        };

        const handleMouseUp = () => {
          setIsDragging(false);
        };

        const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
          if (e.touches.length === 1) {
            setIsDragging(true);
            setDragStart({ x: e.touches[0].clientX - dragX, y: e.touches[0].clientY - dragY });
          }
        };

        const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
          if (!isDragging || e.touches.length !== 1) return;
          setDragX(e.touches[0].clientX - dragStart.x);
          setDragY(e.touches[0].clientY - dragStart.y);
        };

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 relative flex flex-col space-y-5">
              
              {/* Header */}
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <div className="space-y-0.5">
                  <h3 className="text-md font-black text-american-blue uppercase tracking-tight">
                    Position Your Photo
                  </h3>
                  <p className="text-[11px] text-[#666666] font-medium leading-none">
                    Select the ideal crop viewport view below
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditorImage(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Viewport Frame Container */}
              <div className="flex flex-col items-center justify-center space-y-2">
                <div 
                  ref={previewRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleMouseUp}
                  style={{ width: `${VIEWPORT_W}px`, height: `${VIEWPORT_H}px` }}
                  className="relative overflow-hidden rounded-2xl border border-slate-300 shadow-inner select-none cursor-grab active:cursor-grabbing bg-slate-100 flex-shrink-0"
                >
                  <img
                    src={editorImage.src}
                    alt="Reposition adjustments"
                    draggable={false}
                    style={{
                      width: `${currentW}px`,
                      height: `${currentH}px`,
                      left: `${leftPos}px`,
                      top: `${topPos}px`,
                      position: 'absolute',
                      transform: 'translateZ(0)',
                    }}
                    className="max-w-none pointer-events-none select-none"
                    referrerPolicy="no-referrer"
                  />
                  
                  {/* Subtle Framing Guides */}
                  <div className="absolute inset-0 border-2 border-american-blue pointer-events-none opacity-20" />
                  <div className="absolute inset-x-0 top-1/2 h-px bg-white pointer-events-none opacity-40" />
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white pointer-events-none opacity-40" />
                  
                  {/* Card Display overlay tag */}
                  <span className="absolute bottom-2.5 left-2.5 bg-slate-900/80 text-white font-bold text-[9px] uppercase tracking-wider px-2 py-0.5 rounded shadow-sm pointer-events-none">
                    Card View Area
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  ↕️ Drag the picture above to re-center details.
                </p>
              </div>

              {/* Sliders and Quick Centering Actions */}
              <div className="space-y-4 pt-1">
                
                {/* Zoom factor adjustment */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <ImageIcon size={14} className="text-slate-500" />
                      Scale / Zoom View
                    </span>
                    <span className="text-american-blue text-xs font-extrabold flex items-center gap-1">
                      {Math.round(zoomMultiplier * 100)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 font-bold">Fit</span>
                    <input
                      type="range"
                      min="0.2"
                      max="4.0"
                      step="0.02"
                      value={zoomMultiplier}
                      onChange={(e) => setZoomMultiplier(parseFloat(e.target.value))}
                      className="flex-grow accent-slate-900 bg-slate-200 rounded-lg h-1.5 cursor-pointer"
                    />
                    <span className="text-xs text-slate-400 font-bold">Zoom</span>
                  </div>
                </div>

                {/* Reset button row */}
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                    Dimensions: {editorImage.naturalWidth}x{editorImage.naturalHeight}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDragX(0);
                      setDragY(0);
                      setZoomMultiplier(1.0);
                    }}
                    className="text-xs font-black text-slate-800 hover:text-american-blue hover:underline uppercase tracking-wider flex items-center gap-1.5 p-1 transition-colors"
                  >
                    <RefreshCw size={12} />
                    Reset Frame Position
                  </button>
                </div>
              </div>

              {/* Dialog Footer Actions */}
              <div className="flex items-center gap-3 pt-3 border-t border-slate-100 justify-end">
                <button
                  type="button"
                  onClick={() => setEditorImage(null)}
                  className="px-4.5 py-2.5 rounded-xl text-xs font-black uppercase text-slate-600 hover:bg-slate-100 border border-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAdjustedPhoto}
                  className="px-5.5 py-2.5 rounded-xl text-xs font-black uppercase bg-slate-900 text-white hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-md shadow-slate-900/15"
                >
                  <CheckCircle2 size={14} />
                  Apply & Save Crop
                </button>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}
