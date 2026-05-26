import React from 'react';
import { Layers, CheckCircle2, ShieldAlert, Sparkles, RefreshCw, Lock } from 'lucide-react';
import { MATERIAL_PRICES, EstimateBreakdown } from './customerEstimateCalculations';

// Standard Default Images for Step 2 Material Options
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

// Custom Stock Photos as requested for Wood Fence options
import sideBySideImg from '../../assets/images/side_by_side_fence_1779799143225.png';
import boardOnBoardImg from '../../assets/images/board_on_board_fence_1779799160044.png';
import dogEarImg from '../../assets/images/dog_ear_picket_1779799178350.png';
import flatTopImg from '../../assets/images/flat_top_picket_1779799198099.png';
import topCapImg from '../../assets/images/top_cap_board_1779799217354.png';

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
  const [customPhotos, setCustomPhotos] = React.useState<Record<string, string>>({});

  const loadPhotos = React.useCallback(() => {
    try {
      const saved = localStorage.getItem('customer_estimator_custom_photos');
      if (saved) {
        setCustomPhotos(JSON.parse(saved));
      } else {
        setCustomPhotos({});
      }
    } catch (e) {
      console.error('Error loading custom photos:', e);
    }
  }, []);

  React.useEffect(() => {
    loadPhotos();

    // Listen for custom photo changes
    window.addEventListener('customer_estimator_photos_updated', loadPhotos);
    return () => {
      window.removeEventListener('customer_estimator_photos_updated', loadPhotos);
    };
  }, [loadPhotos]);

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
        badgeColor: 'bg-slate-100 text-slate-800',
        image: standardFlatTopImg
      },
      {
        id: 'Extended pickets',
        name: '2-Rail Extended Pickets',
        price: MATERIAL_PRICES['Extended pickets'],
        description: 'Traditional spear styling with picket tips extending above the top rail for decorative appeal.',
        badge: 'Spear Decorative',
        badgeColor: 'bg-indigo-100 text-indigo-800',
        image: extendedPicketsImg
      },
      {
        id: '3 rail racking',
        name: '3-Rail Racking Panel',
        price: MATERIAL_PRICES['3 rail racking'],
        description: 'Heavy duty three-rail structural panel engineered specifically to transition sloped ground beautifully.',
        badge: 'Maximum Enclosure',
        badgeColor: 'bg-amber-100 text-amber-800',
        image: rackingPanelImg
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
        badgeColor: 'bg-green-100 text-green-800',
        image: residentialGradeImg
      },
      {
        id: 'Commercial Grade',
        name: 'Commercial Grade (9ga)',
        price: MATERIAL_PRICES['Commercial Grade'],
        description: 'Thick, high-strength industrial 9-gauge galvanized fabric suited for superior security.',
        badge: 'Heavy Utility',
        badgeColor: 'bg-blue-100 text-blue-800',
        image: commercialGradeImg
      },
      {
        id: 'Privacy Slats',
        name: 'Galvanized with Privacy Slats',
        price: MATERIAL_PRICES['Privacy Slats'],
        description: 'Standard 11-gauge galvanized steel fence outfitted with lock-in vertical privacy slats.',
        badge: 'Semi-Private Span',
        badgeColor: 'bg-purple-100 text-purple-800',
        image: privacySlatsImg
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
        badgeColor: 'bg-[#1e1b4b] text-white',
        image: setInConcreteImg
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
        badgeColor: 'bg-lime-100 text-lime-800',
        image: ptPineImg
      },
      {
        id: 'Japanese Cedar',
        name: 'Japanese Cedar (Sugi)',
        price: MATERIAL_PRICES['Japanese Cedar'],
        description: 'Superior dimensional stability, pleasing natural grain, and innate natural resistance to insect rot.',
        badge: 'Popular Quality Choice',
        badgeColor: 'bg-amber-100 text-amber-800',
        image: japaneseCedarImg
      },
      {
        id: 'Western Red Cedar',
        name: 'Western Red Cedar',
        price: MATERIAL_PRICES['Western Red Cedar'],
        description: 'Top-tier luxury timber. Supreme water resistance, beautiful red tones, and absolute resistance to warping.',
        badge: 'Ultimate Premium Species',
        badgeColor: 'bg-emerald-100 text-emerald-800',
        image: westernRedCedarImg
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
          const activeImage = customPhotos[m.id] || m.image;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onChangeField('material', m.id);
              }}
              className={`flex flex-col text-left p-5 rounded-2xl border-2 transition-all duration-300 relative ${
                isSelected
                  ? 'border-american-blue bg-blue-50/10 ring-2 ring-american-blue/20 shadow-md shadow-american-blue/5'
                  : 'border-[#E5E5E5] bg-white hover:border-[#CCCCCC] hover:shadow-md'
              }`}
            >
              <div className="flex justify-between items-center mb-2.5 w-full">
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] uppercase font-black tracking-wider ${m.badgeColor}`}>
                  {m.badge}
                </span>
                {isSelected && (
                  <CheckCircle2 size={16} className="text-american-blue shrink-0 ml-1" />
                )}
              </div>

              {/* Material option photograph preview */}
              {fenceType !== 'Wood Fence' && (
                <div className="w-full h-32 rounded-xl overflow-hidden mb-3 bg-slate-100 border border-slate-200 relative shrink-0">
                  <img
                    src={activeImage}
                    alt={m.name}
                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}

              <h3 className="font-extrabold text-[#111111] text-sm mb-1">{m.name}</h3>
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
        <div id="wood-fence-customizer" className="max-w-3xl mx-auto bg-white p-6 rounded-2xl border border-[#E5E5E5] space-y-8">
          <div className="border-b border-[#F0F0F0] pb-3">
            <h3 className="text-base font-black text-american-blue uppercase tracking-wider">
              Wood Fence Custom Construction Styles
            </h3>
            <p className="text-xs text-[#666666] mt-0.5">
              Select premium architectural specs to customize your Lone Star wood fence layout.
            </p>
          </div>

          <div className="space-y-8">
            {/* Picket Style: Board on Board vs Side by Side */}
            <div className="space-y-3">
              <div>
                <span className="block text-sm font-black text-american-blue uppercase tracking-wider">Picket Orientation</span>
                <p className="text-xs text-[#666666] leading-relaxed mt-1">
                  Choose how your wood pickets are aligned. standard Side-by-Side has minimal spacing, while Board-on-Board delivers absolute total privacy with layered overlaps.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Option 1: Side by Side */}
                <button
                  type="button"
                  onClick={() => onChangeField('picketStyle', 'w-side')}
                  className={`flex flex-col text-left overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                    picketStyle === 'w-side'
                      ? 'border-american-blue bg-blue-50/10 ring-2 ring-american-blue/15 shadow-sm'
                      : 'border-[#E5E5E5] bg-white hover:border-[#CCCCCC] hover:shadow-xs'
                  }`}
                >
                  <div className="w-full h-36 bg-slate-100 overflow-hidden relative shrink-0 border-b border-[#E5E5E5]">
                    <img
                      src={sideBySideImg}
                      alt="Side by Side Pickets"
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    {picketStyle === 'w-side' && (
                      <div className="absolute top-2.5 right-2.5 bg-american-blue text-white p-1 rounded-full shadow-md z-10">
                        <CheckCircle2 size={16} />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <span className="block font-extrabold text-[#111111] text-sm">Side by Side (Standard)</span>
                    <span className="block text-[10px] text-[#666666] leading-relaxed mt-1">Minor hairline gaps can form over time as wood boards naturally dry and contract.</span>
                  </div>
                </button>

                {/* Option 2: Board on Board */}
                <button
                  type="button"
                  onClick={() => onChangeField('picketStyle', 'w-bob')}
                  className={`flex flex-col text-left overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                    picketStyle === 'w-bob'
                      ? 'border-american-blue bg-blue-50/10 ring-2 ring-american-blue/15 shadow-sm'
                      : 'border-[#E5E5E5] bg-white hover:border-[#CCCCCC] hover:shadow-xs'
                  }`}
                >
                  <div className="w-full h-36 bg-slate-100 overflow-hidden relative shrink-0 border-b border-[#E5E5E5]">
                    <img
                      src={boardOnBoardImg}
                      alt="Board on Board Pickets"
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    {picketStyle === 'w-bob' && (
                      <div className="absolute top-2.5 right-2.5 bg-american-blue text-white p-1 rounded-full shadow-md z-10">
                        <CheckCircle2 size={16} />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <span className="block font-extrabold text-[#111111] text-sm">Board on Board</span>
                    <span className="block text-[10px] text-[#666666] leading-relaxed mt-1">Overlapping layered picket boards provide 100% gapless premium security & permanent privacy.</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Picket Top Finish: Dog Ear vs Flat Top */}
            <div className="space-y-3">
              <div>
                <span className="block text-sm font-black text-american-blue uppercase tracking-wider">Picket Top Finish</span>
                <p className="text-xs text-[#666666] leading-relaxed mt-1">
                  Decide the upper profile cuts for each picket. Dog Ear has classic safety angles. Flat Top gives a crisp linear framing line that easily integrates cap styles.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Option 1: Dog Ear */}
                <button
                  type="button"
                  onClick={() => onChangeField('topStyle', 'Dog Ear')}
                  className={`flex flex-col text-left overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                    topStyle === 'Dog Ear' || !topStyle
                      ? 'border-american-blue bg-blue-50/10 ring-2 ring-american-blue/15 shadow-sm'
                      : 'border-[#E5E5E5] bg-white hover:border-[#CCCCCC] hover:shadow-xs'
                  }`}
                >
                  <div className="w-full h-36 bg-slate-100 overflow-hidden relative shrink-0 border-b border-[#E5E5E5]">
                    <img
                      src={dogEarImg}
                      alt="Dog Ear Picket Ends"
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    {(topStyle === 'Dog Ear' || !topStyle) && (
                      <div className="absolute top-2.5 right-2.5 bg-american-blue text-white p-1 rounded-full shadow-md z-10">
                        <CheckCircle2 size={16} />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <span className="block font-extrabold text-[#111111] text-sm">Classic Dog Ear</span>
                    <span className="block text-[10px] text-[#666666] leading-relaxed mt-1">The traditional design highlighting corner angle bevels on the tip of every picket.</span>
                  </div>
                </button>

                {/* Option 2: Flat Top */}
                <button
                  type="button"
                  onClick={() => onChangeField('topStyle', 'Flat Top')}
                  className={`flex flex-col text-left overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                    topStyle === 'Flat Top'
                      ? 'border-american-blue bg-blue-50/10 ring-2 ring-american-blue/15 shadow-sm'
                      : 'border-[#E5E5E5] bg-white hover:border-[#CCCCCC] hover:shadow-xs'
                  }`}
                >
                  <div className="w-full h-36 bg-slate-100 overflow-hidden relative shrink-0 border-b border-[#E5E5E5]">
                    <img
                      src={flatTopImg}
                      alt="Flat Top Picket Ends"
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    {topStyle === 'Flat Top' && (
                      <div className="absolute top-2.5 right-2.5 bg-american-blue text-white p-1 rounded-full shadow-md z-10">
                        <CheckCircle2 size={16} />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <span className="block font-extrabold text-[#111111] text-sm">Modern Flat Top</span>
                    <span className="block text-[10px] text-[#666666] leading-relaxed mt-1">Clean, straight, horizontal boundaries. Automatically includes the premium 1x4 horizontal trim board accent as a standard add-on!</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Top Cap (2x6) Toggle */}
            <div className="space-y-3">
              <div>
                <span className="block text-sm font-black text-american-blue uppercase tracking-wider">Top Cap Board (2x6 Wood Rail)</span>
                <p className="text-xs text-[#666666] leading-relaxed mt-1">
                  Protects raw wood picket cores from direct rainfall and environmental elements by adding a heavy-duty horizontal cap rail across the system.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Option 1: Standard No Cap */}
                <button
                  type="button"
                  onClick={() => onChangeField('hasTopCap', false)}
                  className={`flex flex-col text-left overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                    !hasTopCap
                      ? 'border-slate-900 bg-slate-900 text-white ring-2 ring-slate-900/15 shadow-sm'
                      : 'border-[#E5E5E5] bg-white hover:border-[#CCCCCC] text-slate-700 hover:shadow-xs'
                  }`}
                >
                  <div className="w-full h-36 bg-slate-100 overflow-hidden relative shrink-0 border-b border-[#E5E5E5]">
                    <img
                      src={dogEarImg}
                      alt="Standard Raw Top"
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    {!hasTopCap && (
                      <div className="absolute top-2.5 right-2.5 bg-emerald-500 text-white p-1 rounded-full shadow-md z-10">
                        <CheckCircle2 size={16} />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <span className="block font-extrabold text-sm">Standard (No Top Cap)</span>
                    <span className="block text-[10px] leading-relaxed mt-1 opacity-80">Simple classic outline exposing the pickets. Picket tops remain fully visible.</span>
                  </div>
                </button>

                {/* Option 2: Include Top Cap */}
                <button
                  type="button"
                  onClick={() => onChangeField('hasTopCap', true)}
                  className={`flex flex-col text-left overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                    hasTopCap
                      ? 'border-slate-900 bg-slate-900 text-white ring-2 ring-slate-900/15 shadow-sm'
                      : 'border-[#E5E5E5] bg-white hover:border-[#CCCCCC] text-slate-700 hover:shadow-xs'
                  }`}
                >
                  <div className="w-full h-36 bg-slate-100 overflow-hidden relative shrink-0 border-b border-[#E5E5E5]">
                    <img
                      src={topCapImg}
                      alt="Top Cap Board"
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    {hasTopCap && (
                      <div className="absolute top-2.5 right-2.5 bg-emerald-500 text-white p-1 rounded-full shadow-md z-10">
                        <CheckCircle2 size={16} />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <span className="block font-extrabold text-sm">Include 2x6 Top Cap</span>
                    <span className="block text-[10px] leading-relaxed mt-1 opacity-80">Heavy 2x6 timber rail set flat across top. Adds solid framing strength and diverts weathering rainwater.</span>
                  </div>
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
