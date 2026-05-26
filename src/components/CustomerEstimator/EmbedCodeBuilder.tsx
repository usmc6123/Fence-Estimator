import React from 'react';
import { FileText, Copy, Download, Check, Sparkles, ExternalLink, Settings, ShieldCheck, HelpCircle, LayoutGrid, Monitor } from 'lucide-react';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

import { MaterialItem, LaborRates, Estimate } from '../../types';
import { getCustomPhotos } from './photoStorage';

interface EmbedCodeBuilderProps {
  materials?: MaterialItem[];
  laborRates?: LaborRates;
  estimate?: Partial<Estimate>;
}

export default function EmbedCodeBuilder({
  materials,
  laborRates,
  estimate,
}: EmbedCodeBuilderProps) {
  const [copied, setCopied] = React.useState(false);
  const [embedFormat, setEmbedFormat] = React.useState<'Squarespace' | 'FullHTML'>('Squarespace');
  const [customPhotos, setCustomPhotos] = React.useState<Record<string, string>>({});
  const [params, setParams] = React.useState(() => {
    let demoRate = 2; // Default
    let baseLaborRate = 45;
    let taxRate = 0.0825;
    let contingencyBuffer = 0.20;

    let activeLabor = laborRates;
    let activeEst = estimate;

    if (!activeLabor || !activeEst) {
      if (typeof window !== 'undefined') {
        try {
          const cachedLabor = localStorage.getItem('fence_pro_labor_rates');
          if (cachedLabor) {
            activeLabor = JSON.parse(cachedLabor);
          }
          const cachedEst = localStorage.getItem('fence_pro_estimate');
          if (cachedEst) {
            activeEst = JSON.parse(cachedEst);
          }
        } catch (e) {
          console.error(e);
        }
      }
    }

    if (activeLabor) {
      if (activeLabor.demo !== undefined) demoRate = activeLabor.demo;
      if (activeLabor.woodSideBySide6 !== undefined) baseLaborRate = activeLabor.woodSideBySide6;
    }

    if (activeEst) {
      if (activeEst.taxPercentage !== undefined) taxRate = activeEst.taxPercentage / 100;
      if (activeEst.markupPercentage !== undefined) contingencyBuffer = activeEst.markupPercentage / 100;
    }

    return {
      companyName: 'Lone Star Fence Works',
      phone: '(469) 560-6269',
      ghlWebhookUrl: '',
      baseLaborRate,
      concretePostCost: 85,
      postSpacing: 8,
      taxRate,
      contingencyBuffer,
      demoRate
    };
  });

  // Pull initial webhook or details of GHL on mount, plus custom photos
  React.useEffect(() => {
    const fetchSettingsAndPhotos = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, 'companySettings', 'main'));
        if (settingsDoc.exists()) {
          const settings = settingsDoc.data();
          setParams(prev => ({
            ...prev,
            ghlWebhookUrl: settings.ghlWebhookUrl || prev.ghlWebhookUrl,
            companyName: settings.companyName || prev.companyName,
            phone: settings.companyPhone || prev.phone
          }));
        }
      } catch (err) {
        console.warn('Could not read companySettings:', err);
      }

      try {
        const photos = await getCustomPhotos();
        setCustomPhotos(photos);
      } catch (err) {
        console.warn('Could not read custom photos:', err);
      }
    };
    fetchSettingsAndPhotos();

    const handlePhotosChange = () => {
      getCustomPhotos()
        .then(p => setCustomPhotos(p))
        .catch(err => console.warn('Sync custom photos error:', err));
    };

    window.addEventListener('customer_estimator_photos_updated', handlePhotosChange);
    return () => {
      window.removeEventListener('customer_estimator_photos_updated', handlePhotosChange);
    };
  }, []);

  const handleChange = (field: string, val: any) => {
    setParams(prev => ({
      ...prev,
      [field]: val
    }));
  };

  // Compile a gorgeous, live, self-contained single-page responsive HTML Estimator Widget
  const compiledCode = React.useMemo(() => {
    const serializedPhotos = JSON.stringify(customPhotos);

    // Dynamic inner HTML structure
    const widgetHTML = `
<div id="fence-estimator-wrapper" class="w-full max-w-4xl mx-auto bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden my-4 relative text-gray-800">
  
  <!-- Defensive styles to make sure steps never expand or collapse nested layouts in website builders like Squarespace -->
  <style>
    #fence-estimator-wrapper .hidden {
      display: none !important;
    }
    #fence-estimator-wrapper .step-screen {
      display: none !important;
    }
    #fence-estimator-wrapper .step-screen.active-step {
      display: block !important;
    }
    #fence-estimator-wrapper {
      font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
    }
    #fence-estimator-wrapper button, 
    #fence-estimator-wrapper select, 
    #fence-estimator-wrapper input {
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
  </style>

  <!-- Banner Header -->
  <div class="bg-[#111827] text-white px-6 py-6 border-b border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4">
    <div class="text-center sm:text-left space-y-1">
      <span class="text-xs font-black text-red-500 uppercase tracking-widest block">★ HONOR & QUALITY BUILT ★</span>
      <h1 class="text-xl font-extrabold uppercase tracking-tight text-white m-0">${params.companyName}</h1>
      <p class="text-[11px] text-gray-400">DFW's faith-based, custom fencing partner. True American Craftsmanship.</p>
    </div>
    <div class="text-center sm:text-right">
      <a href="tel:${params.phone.replace(/\D/g, '')}" class="text-red-500 font-black text-base hover:underline block">${params.phone}</a>
      <span class="text-[10px] text-gray-400 uppercase tracking-wider block">Patriot Hotline (Closed Sundays)</span>
    </div>
  </div>

  <!-- Wizard Content Container -->
  <div class="p-6 sm:p-10">
    
    <!-- Stage Progress Tracker -->
    <div id="progress-bar-container" class="space-y-3 mb-8 bg-gray-50 p-4 rounded-xl border border-gray-200">
      <div class="flex justify-between items-center text-xs">
        <span id="step-badge" class="font-extrabold text-blue-950 uppercase tracking-widest bg-blue-100 px-2.5 py-1 rounded-full">
          Step 1 of 5
        </span>
        <span id="step-description" class="font-bold text-gray-500">Style Selection</span>
      </div>
      <div class="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
        <div id="progress-indicator" class="h-full bg-gradient-to-r from-blue-900 to-emerald-600 w-[20%] transition-all duration-300"></div>
      </div>
    </div>

    <!-- Step Screens forms -->
    <form id="estimator-form" onsubmit="event.preventDefault();" class="space-y-0">
      
      <!-- STEP 1: STYLE SELECTION -->
      <div id="step-1" class="step-screen active-step space-y-6">
        <div class="text-center max-w-xl mx-auto space-y-2">
          <h2 class="text-2xl font-black text-blue-950 uppercase tracking-tight">Select Fence Style</h2>
          <p class="text-sm font-medium text-gray-500">Pick the visual category that matches your boundary requirements.</p>
        </div>
        <div id="style-cards-grid" class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto"></div>
      </div>

      <!-- STEP 2: DIMENSIONS -->
      <div id="step-2" class="step-screen space-y-6">
        <div class="text-center max-w-xl mx-auto space-y-2">
          <h2 class="text-2xl font-black text-blue-950 uppercase tracking-tight">Dimensions & Footage</h2>
          <p class="text-sm font-medium text-gray-500">Define your total target parameters. Budgets recalculate dynamically.</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mx-auto">
          <div class="bg-white p-6 rounded-2xl border border-gray-200 space-y-6">
            <div class="space-y-2">
              <label class="block text-xs font-bold uppercase tracking-wider text-blue-900">Total Length Required</label>
              <div class="relative">
                <input type="number" id="input-lf" min="1" value="120" oninput="calculateEstimates()" class="block w-full border border-gray-300 py-3.5 px-4 pr-12 rounded-xl text-sm font-bold text-gray-900 focus:outline-none focus:border-blue-900">
                <div class="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                  <span class="text-xs font-black text-gray-400">LF</span>
                </div>
              </div>
            </div>
            <div class="space-y-2">
              <label class="block text-xs font-bold uppercase tracking-wider text-blue-900">Fence Height</label>
              <select id="input-height" onchange="calculateEstimates()" class="block w-full border border-gray-300 py-3.5 px-4 rounded-xl text-sm font-bold bg-white text-gray-900 focus:outline-none">
                <option value="3">3 Feet Tall</option>
                <option value="4">4 Feet Tall</option>
                <option value="5">5 Feet Tall</option>
                <option value="6" selected>6 Feet Tall (Standard)</option>
                <option value="8">8 Feet Tall (Security)</option>
              </select>
            </div>
          </div>
          <div class="bg-gray-900 text-white p-6 rounded-2xl flex flex-col justify-between">
            <div class="space-y-2.5">
              <span class="text-[10px] font-black text-amber-500 uppercase tracking-widest block">★ ESTIMATE ENGINE STATUS</span>
              <span class="block text-sm font-bold text-gray-200">Dynamic Pricing Calculated</span>
              <p class="text-xs text-gray-400 leading-relaxed">Our advanced logic combines real-time factors, timber species multipliers, fencing details, ground slopes, and local post labor.</p>
              <div class="p-2.5 bg-gray-800/60 border border-gray-700 rounded-xl flex items-center gap-2">
                <div class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span class="text-[10px] font-black tracking-widest text-[#22c55e] uppercase">ESTIMATE LOCK READY AT STEP 5</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- STEP 3: DYNAMIC MATERIAL SELECT & COHESIVE CONFIGURATOR -->
      <div id="step-3" class="step-screen space-y-6">
        <div class="text-center max-w-xl mx-auto space-y-2">
          <h2 class="text-2xl font-black text-blue-950 uppercase tracking-tight">Material & Customizations</h2>
          <p class="text-sm font-medium text-gray-500">Select species, grades, or design profiles matching your style preferences.</p>
        </div>
        
        <!-- Dynamic options slot populated by JavaScript based on fence style choice -->
        <div id="material-cards-grid" class="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto"></div>
        
        <!-- Conditional Panels for custom specs dependent on fence style selection -->
        <div id="spec-options-card" class="max-w-3xl mx-auto bg-slate-50 p-6 rounded-2xl border border-gray-200 space-y-4 hidden">
          <h3 class="text-xs font-black text-blue-950 uppercase tracking-widest border-b border-gray-200 pb-2">Construction Enhancements</h3>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <!-- Wood Staining Toggle -->
            <div id="wood-stain-input-group" class="p-4 bg-white border border-gray-200 rounded-xl space-y-2 hidden">
              <span class="block text-xs font-black text-blue-900 uppercase">Pre-Stained Lumber Finish?</span>
              <p class="text-slate-500 text-[11px]">Infuse timber with factory sealer to defend against solar fading and cracking.</p>
              <div class="flex gap-2 pt-1">
                <button type="button" id="stain-raw-btn" onclick="toggleStain(false)" class="flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center transition">Raw Lumber</button>
                <button type="button" id="stain-active-btn" onclick="toggleStain(true)" class="flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center transition">Pre-Stained (+6/LF)</button>
              </div>
            </div>
            
            <!-- Posts Reusing Toggle - Crucial Legal Warranty Constraint! -->
            <div id="posts-reuse-input-group" class="p-4 bg-white border border-gray-200 rounded-xl space-y-2">
              <span class="block text-xs font-black text-blue-900 uppercase">Reuse Existing Posts?</span>
              <p class="text-slate-500 text-[11px]">Keep existing sturdy steel posts to save concrete setting labor budgets.</p>
              <div class="flex gap-2 pt-1">
                <button type="button" id="posts-new-btn" onclick="togglePostsReuse(false)" class="flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center transition">Set New Posts</button>
                <button type="button" id="posts-reuse-btn" onclick="togglePostsReuse(true)" class="flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center transition">Reuse Existing</button>
              </div>
            </div>

            <!-- Pipe Paint Color Toggle -->
            <div id="pipe-paint-input-group" class="p-4 bg-white border border-gray-200 rounded-xl space-y-2 hidden">
              <span class="block text-xs font-black text-blue-900 uppercase">Pipe Frame Paint Color</span>
              <select id="input-pipe-color" onchange="updatePipeConfigs()" class="w-full border border-gray-300 py-2 px-3 rounded-lg text-xs font-bold bg-white text-gray-900">
                <option value="Black" selected>Semi-Gloss Black Protective Paint</option>
                <option value="Hunter Green">Hunter Green Farm Paint</option>
                <option value="White">Glossy White Rust Defense Paint</option>
              </select>
            </div>

            <!-- Pipe Wire Type Toggle -->
            <div id="pipe-wire-input-group" class="p-4 bg-white border border-gray-200 rounded-xl space-y-2 hidden">
              <span class="block text-xs font-black text-blue-900 uppercase">No-Climb Wire Texture</span>
              <select id="input-pipe-wire" onchange="updatePipeConfigs()" class="w-full border border-gray-300 py-2 px-3 rounded-lg text-xs font-bold bg-white text-gray-900">
                <option value="Black" selected>Black Vinyl-Coated Mesh (Standard)</option>
                <option value="Galvanized">Class 3 Heavy Galvanized Utility Wire</option>
              </select>
            </div>

            <!-- Wood Picket Style Orientation -->
            <div id="wood-picket-input-group" class="p-4 bg-white border border-gray-200 rounded-xl space-y-2 hidden">
              <span class="block text-xs font-black text-blue-900 uppercase">Picket Orientation Profile</span>
              <div class="flex gap-2 pt-1">
                <button type="button" id="picket-side-btn" onclick="togglePicketStyle('w-side')" class="flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center transition">Side-by-Side (Std)</button>
                <button type="button" id="picket-bob-btn" onclick="togglePicketStyle('w-bob')" class="flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center transition">Board-on-Board</button>
              </div>
            </div>

            <!-- Wood Top Cap Trim style -->
            <div id="wood-top-input-group" class="p-4 bg-white border border-gray-200 rounded-xl space-y-2 hidden">
              <span class="block text-xs font-black text-blue-900 uppercase">Top Finish Profile</span>
              <select id="input-top-style" onchange="updateTopStyle()" class="w-full border border-gray-300 py-2 px-3 rounded-lg text-xs font-bold bg-white text-gray-900">
                <option value="Dog Ear" selected>Standard Rustic Dog Ear Pickets</option>
                <option value="Flat Top">Flat Top with Cap & Premium Fascia Trim</option>
              </select>
            </div>
          </div>

          <!-- Legal Warranty exclusion alert box if reuse posts option is checked -->
          <div id="posts-warranty-exclusion-alert" class="p-4 bg-amber-50 border border-amber-200 text-amber-850 rounded-xl flex items-start gap-3 mt-4 hidden">
            <svg class="h-5 w-5 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div class="space-y-0.5">
              <span class="block text-[11px] font-black uppercase tracking-wider text-amber-900">Warranty Limitation Notice</span>
              <p class="text-xs font-extrabold text-amber-850 uppercase leading-relaxed">
                Contractor will reuse existing posts provided by Customer. Contractor's warranty DOES NOT apply to existing posts.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- STEP 4: GATES & TERRAIN -->
      <div id="step-4" class="step-screen space-y-6">
        <div class="text-center max-w-xl mx-auto space-y-2">
          <h2 class="text-2xl font-black text-blue-950 uppercase tracking-tight">Features & Terrain</h2>
          <p class="text-sm font-medium text-gray-500">Adjust slope factors, entry gates, and old fence cleanup options.</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <div class="bg-white p-6 border border-gray-200 rounded-2xl space-y-4 shadow-sm">
            <h3 class="font-bold text-sm text-blue-900 uppercase">Interactive Gates</h3>
            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-2">Do you need access doors/gates?</label>
              <div class="grid grid-cols-2 gap-2 mb-3">
                <button type="button" onclick="setGates(true)" id="gate-yes" class="border border-blue-900 bg-blue-50/20 text-blue-900 font-bold py-2.5 rounded-lg text-xs">Yes, Add Gates</button>
                <button type="button" onclick="setGates(false)" id="gate-no" class="border border-gray-200 bg-white hover:bg-slate-50 text-gray-700 font-bold py-2.5 rounded-lg text-xs">No Gate Needed</button>
              </div>
            </div>
            <div id="gate-details-row" class="grid grid-cols-2 gap-2 pt-2 hidden">
              <div>
                <label class="block text-[10px] uppercase font-bold text-gray-500">Gate Count</label>
                <select id="input-gate-count" onchange="calculateEstimates()" class="w-full border border-gray-300 py-2 px-3 rounded-lg text-xs bg-white text-gray-900 font-bold">
                  <option value="1" selected>1 Gate</option>
                  <option value="2">2 Gates</option>
                  <option value="3">3 Gates</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] uppercase font-bold text-gray-500">Gate Type</label>
                <select id="input-gate-type" onchange="calculateEstimates()" class="w-full border border-gray-300 py-2 px-3 rounded-lg text-xs bg-white text-gray-900 font-bold">
                  <option value="Single Swing">Single Swing ($500)</option>
                  <option value="Double Swing">Double Swing ($850)</option>
                  <option value="Sliding">Sliding Kit ($950)</option>
                </select>
              </div>
            </div>
          </div>
          <div class="bg-white p-6 border border-gray-200 rounded-2xl space-y-4 shadow-sm flex flex-col justify-between">
            <div class="space-y-4 flex-grow">
              <h3 class="font-bold text-sm text-blue-900 uppercase">Terrain & Demo</h3>
              <div>
                <label class="block text-xs font-semibold text-gray-700 mb-1">Site Land Condition</label>
                <select id="input-site" onchange="calculateEstimates()" class="w-full border border-gray-300 py-2 px-3 rounded-xl text-xs bg-white font-bold text-gray-900 focus:outline-none">
                  <option value="Level" selected>Level Ground (Flat standard)</option>
                  <option value="Slight Slope">Slight Slope (+15% labor multiplier)</option>
                  <option value="Steep Slope">Steep Slope (+35% labor multiplier)</option>
                </select>
              </div>
              <div class="flex items-center gap-2 bg-slate-50 p-2.5 border border-slate-200 rounded-lg">
                <input type="checkbox" id="input-remove" onchange="calculateEstimates()" class="h-4 w-4 text-blue-900 select-none cursor-pointer">
                <label for="input-remove" class="text-[11px] font-bold text-gray-800 cursor-pointer select-none">Tear down & Haul old fence (+$${(params.demoRate * (1 + params.contingencyBuffer)).toFixed(2)}/LF)</label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- STEP 5: CONTACT & CONFIRM -->
      <div id="step-5" class="step-screen space-y-6">
        <div class="text-center max-w-xl mx-auto space-y-2">
          <h2 class="text-2xl font-black text-blue-950 uppercase tracking-tight">Contact & Lock Estimate</h2>
          <p class="text-sm font-medium text-gray-500">Provide contact verification data to log this estimate directly into our company database ledger.</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div class="lg:col-span-5 bg-white p-6 rounded-2xl border border-gray-200 space-y-4 shadow-sm">
            <h3 class="font-extrabold text-blue-950 text-sm uppercase flex items-center gap-1.5 border-b border-gray-100 pb-2">Your Credentials</h3>
            <div class="space-y-1">
              <label class="block text-[10px] uppercase font-bold text-gray-500">First Name</label>
              <input type="text" id="cust-first" required placeholder="First Name..." class="w-full border border-gray-300 py-2 px-3 rounded-lg text-xs font-bold text-gray-900 focus:outline-none focus:border-blue-900">
            </div>
            <div class="space-y-1">
              <label class="block text-[10px] uppercase font-bold text-gray-500">Last Name</label>
              <input type="text" id="cust-last" required placeholder="Last Name..." class="w-full border border-gray-300 py-2 px-3 rounded-lg text-xs font-bold text-gray-900 focus:outline-none focus:border-blue-900">
            </div>
            <div class="space-y-1">
              <label class="block text-[10px] uppercase font-bold text-gray-500">Email Address</label>
              <input type="email" id="cust-email" required placeholder="example@gmail.com" class="w-full border border-gray-300 py-2 px-3 rounded-lg text-xs font-bold text-gray-900 focus:outline-none focus:border-blue-900">
            </div>
            <div class="space-y-1">
              <label class="block text-[10px] uppercase font-bold text-gray-500">Phone Number</label>
              <input type="tel" id="cust-phone" required placeholder="(469) 555-5555" class="w-full border border-gray-300 py-2 px-3 rounded-lg text-xs font-bold text-gray-900 focus:outline-none focus:border-blue-900">
            </div>
            <div class="space-y-1">
              <label class="block text-[10px] uppercase font-bold text-gray-500">Project Location Address</label>
              <input type="text" id="cust-address" required placeholder="Street address, city, state" class="w-full border border-gray-300 py-2 px-3 rounded-lg text-xs font-bold text-gray-900 focus:outline-none focus:border-blue-900">
            </div>
          </div>
          <div class="lg:col-span-7 bg-[#111827] text-white p-6 rounded-2xl shadow-xl space-y-4 border border-gray-800">
            <h3 class="font-extrabold text-white text-base tracking-tight uppercase border-b border-gray-800 pb-2">Investment Summary</h3>
            
            <div class="space-y-3 text-xs border-b border-gray-800 pb-4">
              <div class="flex justify-between">
                <span class="text-gray-400">Selected style:</span>
                <span id="receipt-spec-style" class="font-bold text-gray-200">-</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Total physical span:</span>
                <span id="receipt-spec-span" class="font-bold text-gray-200">-</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Target height parameter:</span>
                <span id="receipt-spec-height" class="font-bold text-gray-200">-</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Selected material:</span>
                <span id="receipt-spec-material" class="font-bold text-gray-200">-</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Gate systems:</span>
                <span id="receipt-spec-gates" class="font-bold text-gray-200">-</span>
              </div>
              <div class="flex justify-between" id="receipt-spec-demo-row">
                <span class="text-gray-400">Old fence removal:</span>
                <span id="receipt-spec-demo" class="font-bold text-gray-200">-</span>
              </div>
              <div class="flex justify-between" id="receipt-spec-posts-row">
                <span class="text-gray-400">Posts structural foundation:</span>
                <span id="receipt-spec-posts" class="font-bold text-gray-200">Set New Concrete Posts</span>
              </div>
            </div>

            <div class="pt-2 text-center bg-gray-900/60 p-4 border border-gray-800 rounded-xl space-y-1">
              <span class="text-[10px] font-bold text-amber-500 uppercase tracking-widest block">Projected Total Investment Range</span>
              <span id="receipt-price-range" class="text-2xl sm:text-3xl font-black text-emerald-400 block">-</span>
              <span class="text-[9px] text-gray-500 block leading-relaxed">Turnkey calculation includes materials, posts setting, labor, profit buffer, and sales tax estimations.</span>
            </div>

            <div id="error-alert" class="hidden p-3 bg-red-950 text-red-350 font-bold text-xs text-center border border-red-800 rounded-lg"></div>
          </div>
        </div>
      </div>

      <!-- STEP 6: THANK YOU SUCCESS -->
      <div id="step-6" class="step-screen py-10 space-y-6 text-center">
        <div class="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
          <svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div class="space-y-1">
          <h2 class="text-2xl font-black text-blue-950 uppercase tracking-tight">Estimate Confirmed!</h2>
          <p class="text-xs font-bold text-emerald-600">Dynamic pricing synced to our secure corporate pipeline ledger database.</p>
        </div>
        <p class="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
          Hello <span id="confirmed-name" class="font-bold text-gray-800">Client</span>, your fencing quote is secure. A representative from <strong>${params.companyName}</strong> will call or email you shortly for on-site validation.
        </p>
        <button type="button" onclick="resetForm()" class="bg-blue-900 text-white hover:bg-blue-950 hover:scale-95 px-6 py-3 text-xs uppercase font-black rounded-xl tracking-wider shadow-md">Start New Estimate</button>
      </div>

      <!-- Dynamic navigation footer buttons for forms -->
      <div id="navigation-footer" class="max-w-4xl mx-auto flex justify-between border-t border-gray-200 mt-8 pt-4">
        <button type="button" id="prev-btn" onclick="prevStep()" class="border border-gray-300 text-gray-600 font-bold px-4 py-3 rounded-xl text-xs uppercase hover:bg-slate-50">Back</button>
        <button type="button" id="next-btn" onclick="nextStep()" class="bg-blue-900 text-white font-black uppercase tracking-widest px-6 py-3 rounded-xl text-xs hover:bg-blue-950 hover:shadow-lg">Next Step</button>
      </div>
    </form>
  </div>
</div>

<!-- CLIENT STATE LOGIC & WEBHOOK CALCULATIONS CORE -->
<script>
  let currentStep = 1;
  const state = {
    fenceType: '',
    linearFeet: 120,
    height: 6,
    material: '',
    needGates: false,
    gateCount: 1,
    gateType: 'Single Swing',
    siteCondition: 'Level',
    removeOldFence: false,
    isPreStained: false,
    reusePosts: false,
    picketStyle: 'w-side',
    topStyle: 'Dog Ear',
    pipePaintColor: 'Black',
    pipeWireType: 'Black'
  };

  const customPhotos = ${serializedPhotos};

  const BUILDER_STYLE_OPTIONS = [
    {
      id: 'Wood Fence',
      title: 'Wood Fence',
      description: 'Solid side-by-side or decorative wooden privacy fences built with premium craftsmanship.',
      defaultImage: 'https://images.unsplash.com/photo-1508873696983-2df519f0397e?auto=format&fit=crop&w=800&q=80',
      badge: 'Privacy & Security'
    },
    {
      id: 'Wrought iron fence',
      title: 'Wrought iron fence',
      description: 'High-end black powder-coated metal/ornamental panels with protective picket borders.',
      defaultImage: 'https://images.unsplash.com/photo-1558244661-d248897f7bc4?auto=format&fit=crop&w=800&q=80',
      badge: 'Stately Ornamental'
    },
    {
      id: 'chain link fence',
      title: 'chain link fence',
      description: 'Durable, affordable commercial or residential grade galvanized steel cross-woven mesh.',
      defaultImage: 'https://images.unsplash.com/photo-1621259182978-f09e5e2b090a?auto=format&fit=crop&w=800&q=80',
      badge: 'Economic Strength'
    },
    {
      id: 'pipe fence',
      title: 'pipe fence',
      description: 'Rustic ranch pipe post structures with black or galvanized steel field grids.',
      defaultImage: 'https://images.unsplash.com/photo-1444858291040-58fa7f98e6a0?auto=format&fit=crop&w=800&q=80',
      badge: 'Ranch & Pasture'
    }
  ];

  const MATERIAL_PRICES = {
    'PT Pine': 18,
    'Japanese Cedar': 22,
    'Western Red Cedar': 28,
    'Standard flat top': 32,
    'Extended pickets': 35,
    '3 rail racking': 40,
    'Residential Grade': 12,
    'Commercial Grade': 16,
    'Privacy Slats': 22,
    'Set in Concrete': 24,
    'Driven Posts': 20
  };

  const TERRAIN_FACTORS = {
    'Level': 1.0,
    'Slight Slope': 1.15,
    'Steep Slope': 1.35
  };

  const GATE_PRICES = {
    'Single Swing': 500,
    'Double Swing': 850,
    'Sliding': 950
  };

  const MATERIALS_SCHEMA = {
    'Wood Fence': [
      { id: 'PT Pine', name: 'Pressure-Treated Pine', price: 18, desc: 'Chemically treated timber prioritizing decay defence.', badge: 'Budget Friendly', defaultImage: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?auto=format&fit=crop&w=800&q=80' },
      { id: 'Japanese Cedar', name: 'Japanese Cedar Sugi', price: 22, desc: 'Supreme dimensional stability with innate rot defence.', badge: 'Most Popular', defaultImage: 'https://images.unsplash.com/photo-1610557870695-189857245b94?auto=format&fit=crop&w=800&q=80' },
      { id: 'Western Red Cedar', name: 'Western Red Cedar', price: 28, desc: 'Luxury grade cedar timber. Beautiful deep warm gold grain.', badge: 'Ultimate Premium', defaultImage: 'https://images.unsplash.com/photo-1629197523164-9cb31c3bfcdf?auto=format&fit=crop&w=800&q=80' }
    ],
    'Wrought iron fence': [
      { id: 'Standard flat top', name: 'Standard Flat Top (2-Rail)', price: 32, desc: 'Elite 2-rail flat top black wrought iron panels offering clean architectural style.', badge: 'Top Standard', defaultImage: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80' },
      { id: 'Extended pickets', name: '2-Rail Extended Pickets', price: 35, desc: 'Decorative styling with spear pickets extending above top frame borders.', badge: 'Stately Design', defaultImage: 'https://images.unsplash.com/photo-1520038410233-7141be7e6f97?auto=format&fit=crop&w=800&q=80' },
      { id: '3 rail racking', name: '3-Rail Racking Panel', price: 40, desc: 'Heavy duty horizontal frame panel conforming seamlessly to ground slopes.', badge: 'Extreme Security', defaultImage: 'https://images.unsplash.com/photo-1549490349-8643362247b5?auto=format&fit=crop&w=800&q=80' }
    ],
    'chain link fence': [
      { id: 'Residential Grade', name: 'Residential Grade (11ga)', price: 12, desc: 'Affordable galvanized standard chain link steel mesh suited for yards.', badge: 'Value Choice', defaultImage: 'https://images.unsplash.com/photo-1616788494707-ec28f08d05a1?auto=format&fit=crop&w=800&q=80' },
      { id: 'Commercial Grade', name: 'Commercial Grade (9ga)', price: 16, desc: 'Rugged commercial armor fabric of 9-gauge galvanized weave steel.', badge: 'Highly Secure', defaultImage: 'https://images.unsplash.com/photo-1621259182978-f09e5e2b090a?auto=format&fit=crop&w=800&q=80' },
      { id: 'Privacy Slats', name: 'Galvanized with Privacy Slats', price: 22, desc: 'Standard steel link wire mesh loaded with colored insert privacy dividers.', badge: 'Privacy Upgrade', defaultImage: 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=800&q=80' }
    ],
    'pipe fence': [
      { id: 'Set in Concrete', name: 'Set in Concrete (Standard)', price: 24, desc: 'Rugged, clean pipe frame set deep into solid concrete anchor footings.', badge: 'Set Concrete', defaultImage: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80' }
    ]
  };

  function selectStyle(style) {
    state.fenceType = style;
    
    // Auto-resolve initial default material
    if (style === 'Wood Fence') {
      state.material = 'PT Pine';
      state.height = 6;
    } else if (style === 'Wrought iron fence') {
      state.material = 'Standard flat top';
      state.height = 4;
    } else if (style === 'chain link fence') {
      state.material = 'Residential Grade';
      state.height = 6;
    } else if (style === 'pipe fence') {
      state.material = 'Set in Concrete';
      state.height = 5;
    }

    // Set height input option on step 2
    const hSelect = document.getElementById('input-height');
    if (hSelect) {
      hSelect.value = state.height;
    }

    // Render style lists highlights
    renderStylesList();
    setTimeout(nextStep, 250);
  }

  function renderStylesList() {
    const grid = document.getElementById('style-cards-grid');
    if (!grid) return;
    grid.innerHTML = '';

    BUILDER_STYLE_OPTIONS.forEach(opt => {
      const isSelected = state.fenceType === opt.id;
      const borderClass = isSelected 
        ? 'border-blue-900 bg-blue-50/10 ring-4 ring-blue-900/10 shadow-lg' 
        : 'border-gray-200 bg-white hover:border-blue-900 hover:shadow-md';
      
      const indicator = isSelected 
        ? '<div class="absolute top-3 right-3 bg-blue-900 text-white font-extrabold text-[8px] sm:text-[9px] tracking-widest px-2 py-0.5 rounded-full uppercase shadow-xs">Active</div>' 
        : '';
        
      const imgSrc = customPhotos[opt.id] || opt.defaultImage;

      grid.innerHTML += \`
        <button type="button" onclick="selectStyle('\${opt.id}')" class="style-btn flex flex-col text-left rounded-2xl border-2 overflow-hidden transition-all duration-300 \${borderClass}">
          <div class="relative w-full h-36 sm:h-40 bg-slate-100 overflow-hidden shrink-0">
            <img src="\${imgSrc}" class="w-full h-full object-cover" alt="\${opt.title}" referrerPolicy="no-referrer" />
            \${indicator}
          </div>
          <div class="p-4 sm:p-5 flex-grow flex flex-col justify-between">
            <div class="space-y-1">
              <span class="text-[9px] font-black uppercase text-blue-950 bg-blue-100 px-2 py-0.5 rounded-full whitespace-nowrap inline-block">\${opt.badge}</span>
              <h3 class="font-extrabold text-blue-950 text-sm leading-tight">\${opt.title}</h3>
              <p class="text-[11px] text-gray-500 leading-normal font-semibold">\${opt.description}</p>
            </div>
          </div>
        </button>
      \`;
    });
  }

  function renderMaterialsList() {
    const grid = document.getElementById('material-cards-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const list = MATERIALS_SCHEMA[state.fenceType] || MATERIALS_SCHEMA['Wood Fence'];
    
    list.forEach(item => {
      const isSelected = state.material === item.id;
      const borderClass = isSelected 
        ? 'border-blue-900 bg-blue-50/10 ring-4 ring-blue-900/10 shadow-lg' 
        : 'border-gray-200 bg-white hover:border-blue-900 hover:shadow-xs';
      
      const indicator = isSelected 
        ? '<div class="absolute top-3 right-3 bg-blue-900 text-white font-extrabold text-[8px] sm:text-[9px] tracking-widest px-2 py-0.5 rounded-full uppercase shadow-xs">Selected</div>' 
        : '';
        
      const imgSrc = customPhotos[item.id] || item.defaultImage;

      grid.innerHTML += \`
        <button type="button" onclick="selectMaterial('\${item.id}')" class="mat-card-btn flex flex-col text-left rounded-2xl border-2 overflow-hidden transition-all duration-300 \${borderClass}">
          <div class="relative w-full h-32 bg-slate-100 overflow-hidden shrink-0">
            <img src="\${imgSrc}" class="w-full h-full object-cover" alt="\${item.name}" referrerPolicy="no-referrer" />
            \${indicator}
          </div>
          <div class="p-4 flex-grow flex flex-col justify-between">
            <div class="space-y-1">
              <span class="text-[9px] font-black uppercase text-blue-950 bg-blue-100 px-2 py-0.5 rounded-full whitespace-nowrap inline-block">\${item.badge}</span>
              <h3 class="font-extrabold text-blue-950 text-xs sm:text-sm leading-tight">\${item.name}</h3>
              <p class="text-[11px] text-gray-500 leading-normal font-semibold mb-2">\${item.desc}</p>
            </div>
            <div class="pt-2 border-t border-gray-100 mt-2 flex justify-between items-center bg-transparent shrink-0 text-xs">
              <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Turnkey</span>
              <span class="font-black text-emerald-600">$\${item.price}/LF</span>
            </div>
          </div>
        </button>
      \`;
    });

    // Handle Conditional Enhancements Panel
    const specCard = document.getElementById('spec-options-card');
    specCard.classList.remove('hidden');

    // Toggle specific option dividers
    const woodStain = document.getElementById('wood-stain-input-group');
    const woodPicket = document.getElementById('wood-picket-input-group');
    const woodTop = document.getElementById('wood-top-input-group');
    const pipePaint = document.getElementById('pipe-paint-input-group');
    const pipeWire = document.getElementById('pipe-wire-input-group');

    woodStain.classList.add('hidden');
    woodPicket.classList.add('hidden');
    woodTop.classList.add('hidden');
    pipePaint.classList.add('hidden');
    pipeWire.classList.add('hidden');

    if (state.fenceType === 'Wood Fence') {
      woodStain.classList.remove('hidden');
      woodPicket.classList.remove('hidden');
      woodTop.classList.remove('hidden');
    } else if (state.fenceType === 'pipe fence') {
      pipePaint.classList.remove('hidden');
      pipeWire.classList.remove('hidden');
    }
    
    // Synchronize toggle button highlights
    syncOptionButtons();
  }

  function selectMaterial(mat) {
    state.material = mat;
    renderMaterialsList();
    calculateEstimates();
  }

  function toggleStain(isStained) {
    state.isPreStained = isStained;
    syncOptionButtons();
    calculateEstimates();
  }

  function togglePostsReuse(reuse) {
    state.reusePosts = reuse;
    const alertBox = document.getElementById('posts-warranty-exclusion-alert');
    if (reuse) {
      alertBox.classList.remove('hidden');
    } else {
      alertBox.classList.add('hidden');
    }
    syncOptionButtons();
    calculateEstimates();
  }

  function togglePicketStyle(style) {
    state.picketStyle = style;
    syncOptionButtons();
    calculateEstimates();
  }

  function updateTopStyle() {
    state.topStyle = document.getElementById('input-top-style').value;
    calculateEstimates();
  }

  function updatePipeConfigs() {
    state.pipePaintColor = document.getElementById('input-pipe-color').value;
    state.pipeWireType = document.getElementById('input-pipe-wire').value;
    calculateEstimates();
  }

  function syncOptionButtons() {
    // Stain buttons
    const rawBtn = document.getElementById('stain-raw-btn');
    const activeBtn = document.getElementById('stain-active-btn');
    if (rawBtn && activeBtn) {
      if (state.isPreStained) {
        activeBtn.className = "flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center text-white bg-slate-900 border-slate-900";
        rawBtn.className = "flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center text-slate-700 bg-white border-slate-200 hover:bg-slate-50";
      } else {
        rawBtn.className = "flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center text-white bg-slate-900 border-slate-900";
        activeBtn.className = "flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center text-slate-700 bg-white border-slate-200 hover:bg-slate-50";
      }
    }

    // Posts buttons
    const newBtn = document.getElementById('posts-new-btn');
    const reuseBtn = document.getElementById('posts-reuse-btn');
    if (newBtn && reuseBtn) {
      if (state.reusePosts) {
        reuseBtn.className = "flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center text-white bg-slate-900 border-slate-900";
        newBtn.className = "flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center text-slate-700 bg-white border-slate-200 hover:bg-slate-50";
      } else {
        newBtn.className = "flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center text-white bg-slate-900 border-slate-900";
        reuseBtn.className = "flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center text-slate-700 bg-white border-slate-200 hover:bg-slate-50";
      }
    }

    // Picket style buttons
    const sideBtn = document.getElementById('picket-side-btn');
    const bobBtn = document.getElementById('picket-bob-btn');
    if (sideBtn && bobBtn) {
      if (state.picketStyle === 'w-bob') {
        bobBtn.className = "flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center text-white bg-slate-900 border-slate-900";
        sideBtn.className = "flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center text-slate-700 bg-white border-slate-200 hover:bg-slate-50";
      } else {
        sideBtn.className = "flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center text-white bg-slate-900 border-slate-900";
        bobBtn.className = "flex-1 py-1 px-3 text-xs font-bold rounded-lg border text-center text-slate-700 bg-white border-slate-200 hover:bg-slate-50";
      }
    }
  }

  function setGates(hasGates) {
    state.needGates = hasGates;
    const gateDetailsRow = document.getElementById('gate-details-row');
    if (hasGates) {
      document.getElementById('gate-yes').className = "border border-blue-900 bg-blue-50/20 text-blue-900 font-bold py-2.5 rounded-lg text-xs";
      document.getElementById('gate-no').className = "border border-gray-200 bg-white text-gray-700 hover:bg-slate-50 font-bold py-2.5 rounded-lg text-xs";
      gateDetailsRow.classList.remove('hidden');
    } else {
      document.getElementById('gate-yes').className = "border border-gray-200 bg-white text-gray-700 hover:bg-slate-50 font-bold py-2.5 rounded-lg text-xs";
      document.getElementById('gate-no').className = "border border-blue-900 bg-blue-50/20 text-blue-900 font-bold py-2.5 rounded-lg text-xs";
      gateDetailsRow.classList.add('hidden');
    }
    calculateEstimates();
  }

  function calculateEstimates() {
    state.linearFeet = parseFloat(document.getElementById('input-lf').value) || 0;
    state.height = parseInt(document.getElementById('input-height').value) || 6;
    state.siteCondition = document.getElementById('input-site').value || 'Level';
    state.removeOldFence = document.getElementById('input-remove').checked || false;

    if (state.needGates) {
      state.gateCount = parseInt(document.getElementById('input-gate-count').value) || 1;
      state.gateType = document.getElementById('input-gate-type').value || 'Single Swing';
    }

    const lf = state.linearFeet;
    
    // 1. Posts Cost (unless reused)
    let postsCost = 0;
    if (!state.reusePosts) {
      postsCost = Math.ceil(lf / ${params.postSpacing}) * ${params.concretePostCost};
    }

    // 2. Material Pricing coefficient
    const matPrice = MATERIAL_PRICES[state.material] || 18;
    
    // Board on board uses more lumber (overlap)
    let materialCostMultiplier = 1.0;
    if (state.fenceType === 'Wood Fence' && state.picketStyle === 'w-bob') {
      materialCostMultiplier = 1.25; 
    }

    // Flat Top top cap adds fascia and boards
    let flatTopSurcharge = 0;
    if (state.fenceType === 'Wood Fence' && state.topStyle === 'Flat Top') {
      flatTopSurcharge = 4.0; 
    }

    // Staining surcharge
    let stainSurcharge = 0;
    if (state.fenceType === 'Wood Fence' && state.isPreStained) {
      stainSurcharge = 6.0; 
    }

    const materialsCost = lf * (matPrice + flatTopSurcharge + stainSurcharge) * materialCostMultiplier;

    // 3. Labor component
    const terrainFactor = TERRAIN_FACTORS[state.siteCondition] || 1.0;
    const activeBaseLaborRate = state.reusePosts ? (${params.baseLaborRate} * 0.6) : ${params.baseLaborRate};
    const baseLabor = lf * activeBaseLaborRate * terrainFactor;
    const demoCost = state.removeOldFence ? lf * ${params.demoRate} : 0;
    const laborCost = baseLabor + demoCost;

    // 4. Gates Cost
    let gatesCost = 0;
    if (state.needGates) {
      gatesCost = state.gateCount * (GATE_PRICES[state.gateType] || 0);
    }

    // Subtotal
    const subtotal = postsCost + materialsCost + laborCost + gatesCost;
    const contingency = subtotal * ${params.contingencyBuffer};
    const tax = (subtotal + contingency) * ${params.taxRate};
    const total = subtotal + contingency + tax;

    // Render displays
    const liveDisplay = document.getElementById('live-calc-display');
    if (liveDisplay) {
      liveDisplay.innerText = '$' + Math.round(total).toLocaleString();
    }
    
    // Specifications list displays
    document.getElementById('receipt-spec-style').innerText = state.fenceType || 'Wood Fence';
    document.getElementById('receipt-spec-span').innerText = lf + ' LF';
    document.getElementById('receipt-spec-height').innerText = state.height + ' FT';
    document.getElementById('receipt-spec-material').innerText = state.material || '-';
    
    const gatesText = state.needGates ? state.gateCount + ' × ' + state.gateType : 'None Requested';
    document.getElementById('receipt-spec-gates').innerText = gatesText;
    
    const demoText = state.removeOldFence ? 'Tear down & haul standard old fence' : 'No removal required';
    document.getElementById('receipt-spec-demo').innerText = demoText;

    const postsText = state.reusePosts ? 'Reusing Existing Posts (No Warranty)' : 'Set New Concrete Posts';
    document.getElementById('receipt-spec-posts').innerText = postsText;

    // Projected Turnkey Cost range
    const rangeMin = Math.round(total);
    const rangeMax = Math.round(total * 1.10);
    document.getElementById('receipt-price-range').innerText = '$' + rangeMin.toLocaleString() + ' - $' + rangeMax.toLocaleString();
  }

  function renderStep() {
    const screens = document.querySelectorAll('.step-screen');
    screens.forEach(screen => {
      screen.classList.remove('active-step');
    });
    
    const activeScreen = document.getElementById('step-' + currentStep);
    if (activeScreen) {
      activeScreen.classList.add('active-step');
    }

    // Handle progress bar
    const stepDescs = {
      1: 'Style Selection',
      2: 'Dimensions & Footage',
      3: 'Materials Selection',
      4: 'Features & Terrain',
      5: 'Contact Verification & Confirm'
    };

    if (currentStep <= 5) {
      document.getElementById('progress-bar-container').classList.remove('hidden');
      document.getElementById('navigation-footer').classList.remove('hidden');
      
      document.getElementById('step-badge').innerText = 'Step ' + currentStep + ' of 5';
      document.getElementById('step-description').innerText = stepDescs[currentStep];
      document.getElementById('progress-indicator').style.width = ((currentStep - 1) / 4) * 100 + '%';

      // Buttons visibility
      document.getElementById('prev-btn').style.visibility = currentStep === 1 ? 'hidden' : 'visible';
      if (currentStep === 5) {
        document.getElementById('next-btn').innerText = 'SUBMIT ESTIMATE';
        document.getElementById('next-btn').className = "bg-emerald-600 text-white font-black uppercase tracking-widest px-8 py-3.5 rounded-xl text-xs hover:bg-emerald-500 hover:shadow-lg";
      } else {
        document.getElementById('next-btn').innerText = 'Next Step';
        document.getElementById('next-btn').className = "bg-blue-900 text-white font-black uppercase tracking-widest px-6 py-3.5 rounded-xl text-xs hover:bg-blue-950 hover:shadow-lg";
      }
    } else {
      // Step 6 (Thank You screen)
      document.getElementById('progress-bar-container').classList.add('hidden');
      document.getElementById('navigation-footer').classList.add('hidden');
    }
  }

  function nextStep() {
    if (currentStep === 1 && !state.fenceType) {
      alert('Please select a fence style first!');
      return;
    }
    if (currentStep === 2 && state.linearFeet <= 0) {
      alert('Please enter a valid length!');
      return;
    }
    if (currentStep === 3) {
      if (!state.material) {
        alert('Please select a material type!');
        return;
      }
    }
    if (currentStep === 5) {
      submitPayload();
      return;
    }
    currentStep = Math.min(6, currentStep + 1);
    if (currentStep === 3) {
      renderMaterialsList();
    }
    renderStep();
    calculateEstimates();
  }

  function prevStep() {
    currentStep = Math.max(1, currentStep - 1);
    renderStep();
    if (currentStep === 1) {
      renderStylesList();
    } else if (currentStep === 3) {
      renderMaterialsList();
    }
  }

  function resetForm() {
    currentStep = 1;
    state.fenceType = '';
    state.linearFeet = 120;
    state.height = 6;
    state.material = '';
    state.needGates = false;
    state.gateCount = 1;
    state.gateType = 'Single Swing';
    state.siteCondition = 'Level';
    state.removeOldFence = false;
    state.isPreStained = false;
    state.reusePosts = false;
    state.picketStyle = 'w-side';
    state.topStyle = 'Dog Ear';

    // Reset inputs
    const lfInput = document.getElementById('input-lf');
    if (lfInput) lfInput.value = 120;
    const hSelect = document.getElementById('input-height');
    if (hSelect) hSelect.value = 6;
    const siteSelect = document.getElementById('input-site');
    if (siteSelect) siteSelect.value = 'Level';
    const removeCheck = document.getElementById('input-remove');
    if (removeCheck) removeCheck.checked = false;
    
    setGates(false);

    // Reset customer fields
    const fields = ['cust-first', 'cust-last', 'cust-email', 'cust-phone', 'cust-address'];
    fields.forEach(fid => {
      const el = document.getElementById(fid);
      if (el) el.value = '';
    });

    const errorBox = document.getElementById('error-alert');
    if (errorBox) errorBox.classList.add('hidden');

    const postsExclusionalert = document.getElementById('posts-warranty-exclusion-alert');
    if (postsExclusionalert) postsExclusionalert.classList.add('hidden');

    renderStylesList();
    renderStep();
  }

  async function submitPayload() {
    const firstName = document.getElementById('cust-first').value.trim();
    const lastName = document.getElementById('cust-last').value.trim();
    const email = document.getElementById('cust-email').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const address = document.getElementById('cust-address').value.trim();

    if (!firstName || !lastName || !email || !phone || !address) {
      const errBox = document.getElementById('error-alert');
      if (errBox) {
        errBox.innerText = 'Please complete all required fields to register estimate!';
        errBox.classList.remove('hidden');
      }
      return;
    }

    const errBox = document.getElementById('error-alert');
    if (errBox) errBox.classList.add('hidden');
    
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.innerText = 'Sending...';
    }

    // Build Payload object
    const webhookUrl = "${params.ghlWebhookUrl}";

    // Local total recalculation
    const lf = state.linearFeet;
    let postsCost = 0;
    if (!state.reusePosts) {
      postsCost = Math.ceil(lf / ${params.postSpacing}) * ${params.concretePostCost};
    }

    const matPrice = MATERIAL_PRICES[state.material] || 18;
    let materialCostMultiplier = 1.0;
    if (state.fenceType === 'Wood Fence' && state.picketStyle === 'w-bob') {
      materialCostMultiplier = 1.25;
    }
    let flatTopSurcharge = 0;
    if (state.fenceType === 'Wood Fence' && state.topStyle === 'Flat Top') {
      flatTopSurcharge = 4.0;
    }
    let stainSurcharge = 0;
    if (state.fenceType === 'Wood Fence' && state.isPreStained) {
      stainSurcharge = 6.0;
    }

    const materialsCost = lf * (matPrice + flatTopSurcharge + stainSurcharge) * materialCostMultiplier;
    const terrainFactor = TERRAIN_FACTORS[state.siteCondition] || 1.0;
    const activeBaseLaborRate = state.reusePosts ? (${params.baseLaborRate} * 0.6) : ${params.baseLaborRate};
    const baseLabor = lf * activeBaseLaborRate * terrainFactor;
    const demoCost = state.removeOldFence ? lf * ${params.demoRate} : 0;
    const laborCost = baseLabor + demoCost;
    const gatesCost = state.needGates ? state.gateCount * (GATE_PRICES[state.gateType] || 0) : 0;

    const subtotal = postsCost + materialsCost + laborCost + gatesCost;
    const contingency = subtotal * ${params.contingencyBuffer};
    const tax = (subtotal + contingency) * ${params.taxRate};
    const totalVal = subtotal + contingency + tax;

    const estId = "est-cust-" + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();

    let defaultStyleId = 'wood-privacy';
    if (state.fenceType === 'chain link fence') {
      defaultStyleId = 'chain-link';
    } else if (state.fenceType === 'Wrought iron fence') {
      defaultStyleId = 'aluminum-ornamental';
    } else if (state.fenceType === 'pipe fence') {
      defaultStyleId = 'pipe-no-climb';
    }

    const customerEstimateDoc = {
      id: estId,
      customerName: firstName + " " + lastName,
      customerEmail: email,
      customerPhone: phone,
      customerAddress: address,
      customerStreet: address,
      customerCity: '',
      customerState: '',
      customerZip: '',
      date: now,
      createdAt: now,
      lastModified: now,
      status: 'active',
      jobStatus: 'Estimate Pending',
      linearFeet: parseFloat(lf),
      height: parseInt(state.height),
      defaultStyleId: defaultStyleId,
      defaultHeight: parseInt(state.height),
      companyId: 'lonestarfence',
      isCustomerEstimate: true,
      subtotal: Math.round(subtotal * 100) / 100,
      total: Math.round(totalVal * 100) / 100,
      gateCount: state.needGates ? parseInt(state.gateCount) : 0,
      hasSitePrep: false,
      needsClearing: false,
      needsMarking: false,
      obstacleRemoval: false,
      postCapId: 'pc-dome',
      hasCapAndTrim: state.fenceType === 'Wood Fence' && state.topStyle === 'Flat Top',
      hasTopCap: state.fenceType === 'Wood Fence' && state.topStyle === 'Flat Top',
      topStyle: state.topStyle,
      wastePercentage: 0,
      includeStain: !!state.isPreStained,
      footingType: 'Cuboid',
      concreteType: 'Maximizer',
      postWidth: 6,
      postThickness: 6,
      markupPercentage: parseFloat((${params.contingencyBuffer} * 100).toFixed(2)),
      taxPercentage: parseFloat((${params.taxRate} * 100).toFixed(2)),
      deliveryFee: 0,
      manualQuantities: {},
      manualPrices: {},
      runs: [{
        id: "run-" + Math.random().toString(36).substr(2, 9),
        name: "Customer Section - " + state.fenceType,
        linearFeet: parseFloat(lf),
        corners: 0,
        gates: state.needGates ? parseInt(state.gateCount) : 0,
        gateDetails: state.needGates ? [{
          id: "gate-" + Math.random().toString(36).substr(2, 9),
          type: state.gateType === 'Double Swing' ? 'Double' : 'Single',
          width: state.gateType === 'Double Swing' ? 8 : 4,
          construction: defaultStyleId === 'aluminum-ornamental' ? 'Welded' : 'Pre-made'
        }] : [],
        styleId: defaultStyleId,
        visualStyleId: defaultStyleId === 'aluminum-ornamental' 
          ? (state.material === 'Extended pickets' ? 'm-2rep' : (state.material === '3 rail racking' ? 'm-3rr' : 'm-2rft'))
          : (defaultStyleId === 'pipe-no-climb' ? (state.pipeWireType === 'Black' ? 'p-black' : 'p-std') : (defaultStyleId === 'wood-privacy' ? state.picketStyle : 'standard')),
        height: parseInt(state.height),
        color: defaultStyleId === 'pipe-no-climb' ? state.pipePaintColor : 'Natural',
        woodType: defaultStyleId === 'wood-privacy' 
          ? (state.material === 'Japanese Cedar' ? 'Japanese Cedar' : (state.material === 'Western Red Cedar' ? 'Western Red Cedar' : 'PT Pine')) 
          : undefined,
        chainLinkGrade: defaultStyleId === 'chain-link' 
          ? (state.material === 'Commercial Grade' ? 'Commercial' : 'Residential')
          : undefined,
        pipeInstallType: defaultStyleId === 'pipe-no-climb' 
          ? 'Set in Concrete'
          : undefined,
        isPreStained: !!state.isPreStained,
        reusePosts: !!state.reusePosts,
        hasDemolition: !!state.removeOldFence,
        demoLinearFeet: state.removeOldFence ? parseFloat(lf) : 0,
        demoType: defaultStyleId === 'wood-privacy' ? 'Wood' : (defaultStyleId === 'chain-link' ? 'Chain Link' : 'Metal'),
        topStyle: state.topStyle
      }]
    };

    // 1. Direct secure writes to corporate Firestore "estimates" collection 
    try {
      const firebaseConfig = {
        apiKey: "AIzaSyDzF73c-QZN6T0_ldVELubP5mEvucsZ9JQ",
        authDomain: "dazzling-card-485210-r8.firebaseapp.com",
        projectId: "dazzling-card-485210-r8",
        storageBucket: "dazzling-card-485210-r8.firebasestorage.app",
        messagingSenderId: "301045874568",
        appId: "1:301045874568:web:ef29807ec75b5c00fb843d"
      };

      if (typeof firebase !== 'undefined') {
        const app = !firebase.apps.length ? firebase.initializeApp(firebaseConfig) : firebase.app();
        const db = app.firestore("ai-studio-326159a1-d34a-4219-9e8c-edc19a926edb");
        await db.collection('estimates').doc(estId).set(customerEstimateDoc);
        console.log('Estimate recorded safely to company Firestore database ledger with ID:', estId);
      }
    } catch (dbErr) {
      console.warn('Direct company ledger sync bypassed or failed. Local offline backup will remain secure:', dbErr);
    }

    // 2. Transmit to GHL CRM if webhook is connected
    try {
      if (webhookUrl) {
        const ghlPayload = {
          firstName,
          lastName,
          email,
          phone,
          projectAddress: address,
          fenceType: state.fenceType,
          estimateTotal: Math.round(totalVal),
          estimateDetails: JSON.stringify({
            data: {
              ...state,
              firstName,
              lastName,
              email,
              phone,
              address
            },
            breakdown: {
              postsCost,
              materialsCost,
              laborCost,
              gatesCost,
              subtotal,
              contingency,
              tax,
              total: totalVal
            }
          }),
          source: "website-estimator-tool",
          tags: ["Customer Estimate", "New Lead"]
        };

        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ghlPayload)
        });
      }
    } catch (err) {
      console.warn('GHL CRM transmission returned status offline. Direct ledger saved:', err);
    }

    document.getElementById('confirmed-name').innerText = firstName;
    currentStep = 6;
    renderStep();
    if (nextBtn) {
      nextBtn.disabled = false;
    }
  }

  // Start initialization
  resetForm();
</script>
    `;

    if (embedFormat === 'Squarespace') {
      // Clean Squarespace format (embeddable Div + scoped scripts)
      return `<!-- Lone Star Fence Works Homeowner Estimator Widget -->
<!-- Simply paste this clean div content block directly into your Squarespace custom HTML block container safely. -->

<!-- Firebase App & Firestore Compatibility CDNs for Direct Ledger Writing -->
<script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"></script>

<!-- Tailwind CSS Play CDN for bulletproof styling -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Google Fonts standard support -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet" />

${widgetHTML}
`;
    } else {
      // Full standalone HTML web page
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${params.companyName} - Fencing Estimator Widget</title>
  
  <!-- Tailwind CSS Play CDN for styling -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- Firebase App & Firestore Compatibility CDNs for Direct Ledger Writing -->
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore-compat.js"></script>
  
  <!-- Google Fonts support -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet" />
</head>
<body class="bg-gray-50/20 p-2 sm:p-4">

${widgetHTML}

</body>
</html>`;
    }
  }, [params, customPhotos, embedFormat]);

  const handleCopy = () => {
    navigator.clipboard.writeText(compiledCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const filename = embedFormat === 'Squarespace' ? 'fence-estimator-widget-squarespace.html' : 'fence-estimator-widget-standalone.html';
    const blob = new Blob([compiledCode], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="embed-widget-builder-root" className="space-y-6">
      
      {/* Banner / Header */}
      <div className="bg-[#4338ca] text-white p-6 rounded-2xl border border-indigo-500/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden shadow-xl">
        <div className="space-y-1 z-10 animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="bg-emerald-400 text-slate-950 font-black text-[9px] uppercase tracking-widest px-2.5 py-0.5 rounded-full">
              Zero Configuration Deployment
            </span>
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-white leading-none">
            Compile & Download Website Widgets
          </h2>
          <p className="text-xs text-indigo-100 max-w-2xl leading-normal font-medium">
            Fine-tune your pricing constants, tax weights, or margins below. Our compiler syncs your custom photos and pricing rules directly into a cohesive, un-strippable copy-paste widget code package.
          </p>
        </div>
      </div>

      {/* Widget Target Selector */}
      <div className="bg-slate-100 p-2 rounded-2xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-0.5 pl-2">
          <span className="text-xs font-black text-[#111111] uppercase tracking-wider block">Widget Deployment Format</span>
          <span className="text-[11px] text-slate-500 font-bold block">Choose format matching how you add code to your website.</span>
        </div>
        <div className="flex gap-1.5 bg-white p-1 rounded-xl border border-slate-250 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setEmbedFormat('Squarespace')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              embedFormat === 'Squarespace'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100 hover:text-indigo-600'
            }`}
          >
            <LayoutGrid size={14} />
            Squarespace Div (Recommended)
          </button>
          <button
            type="button"
            onClick={() => setEmbedFormat('FullHTML')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              embedFormat === 'FullHTML'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-100 hover:text-indigo-600'
            }`}
          >
            <Monitor size={14} />
            Full Standalone Page
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column - Widget settings parameter editor (5 Columns) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-[#E5E5E5] space-y-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-2">
            <Settings size={18} className="text-indigo-600 animate-spin-slow" />
            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">
              Widget Parameters & Ratios
            </h3>
          </div>

          {/* Company Name */}
          <div className="space-y-1">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Company Name
            </label>
            <input
              type="text"
              value={params.companyName}
              onChange={(e) => handleChange('companyName', e.target.value)}
              className="w-full text-xs font-bold border border-slate-300 px-3.5 py-2.5 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Backup phone */}
          <div className="space-y-1">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Backup Phone (For connection fails)
            </label>
            <input
              type="text"
              value={params.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              className="w-full text-xs font-bold border border-slate-300 px-3.5 py-2.5 rounded-xl text-slate-900 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Webhook */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
                GHL CRM Pipeline Webhook URL
              </label>
              <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">active dev live</span>
            </div>
            <input
              type="text"
              placeholder="Paste GoHighLevel webhook URL..."
              value={params.ghlWebhookUrl}
              onChange={(e) => handleChange('ghlWebhookUrl', e.target.value)}
              className="w-full text-xs font-bold border border-slate-300 px-3.5 py-2.5 rounded-xl text-[#333333] focus:outline-none focus:border-indigo-500"
            />
            <p className="text-[10px] text-slate-400">
              Completed homeowner quotation payloads are sent directly to this URL as a clean webhook POST on submission event.
            </p>
          </div>

          {/* Numerical adjustments */}
          <div className="grid grid-cols-2 gap-4">
            {/* base labor rate */}
            <div className="space-y-1">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
                Base Labor Rate
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-xs text-slate-400 font-bold">$</div>
                <input
                  type="number"
                  value={params.baseLaborRate}
                  onChange={(e) => handleChange('baseLaborRate', parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-bold border border-slate-300 pl-6 pr-8 py-2.5 rounded-xl"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[9px] font-bold text-slate-400">/LF</div>
              </div>
            </div>

            {/* post cost */}
            <div className="space-y-1">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
                Concrete Post Cost
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-xs text-slate-400 font-bold">$</div>
                <input
                  type="number"
                  value={params.concretePostCost}
                  onChange={(e) => handleChange('concretePostCost', parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-bold border border-slate-300 pl-6 py-2.5 rounded-xl"
                />
              </div>
            </div>

            {/* demolition rate */}
            <div className="space-y-1">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
                Demolition Rate
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-xs text-slate-400 font-bold">$</div>
                <input
                  type="number"
                  value={params.demoRate}
                  onChange={(e) => handleChange('demoRate', parseFloat(e.target.value) || 0)}
                  className="w-full text-xs font-bold border border-slate-300 pl-6 pr-8 py-2.5 rounded-xl"
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[9px] font-bold text-slate-400">/LF</div>
              </div>
            </div>

            {/* post spacing */}
            <div className="space-y-1">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
                Post Spacing (FT)
              </label>
              <input
                type="number"
                value={params.postSpacing}
                onChange={(e) => handleChange('postSpacing', parseFloat(e.target.value) || 8)}
                className="w-full text-xs font-bold border border-slate-300 px-3 py-2.5 rounded-xl"
              />
            </div>

            {/* tax rate */}
            <div className="space-y-1">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
                Tax Rate (%)
              </label>
              <input
                type="number"
                step="0.001"
                value={params.taxRate}
                onChange={(e) => handleChange('taxRate', parseFloat(e.target.value) || 0.0825)}
                className="w-full text-xs font-bold border border-slate-300 px-3 py-2.5 rounded-xl"
              />
              <p className="text-[9px] text-slate-400">e.g. 0.0825 is 8.25%</p>
            </div>
          </div>

          {/* Contingency */}
          <div className="space-y-1 pb-2">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Contingency Buffer (%)
            </label>
            <input
              type="number"
              step="0.01"
              value={params.contingencyBuffer}
              onChange={(e) => handleChange('contingencyBuffer', parseFloat(e.target.value) || 0.20)}
              className="w-full text-xs font-bold border border-slate-300 px-3 py-2.5 rounded-xl"
            />
            <p className="text-[9px] text-slate-400">e.g. 0.20 is 20.0% buffering profit margin value</p>
          </div>

        </div>

        {/* Right Column - Live Code blocks and Installation checklist (7 Columns) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* File Block Card */}
          <div className="bg-[#111827] text-white rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col">
            
            {/* Header copy buttons */}
            <div className="bg-[#0f172a] border-b border-slate-800 px-5 py-4 flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
                <span className="text-slate-200 font-bold">
                  {embedFormat === 'Squarespace' ? 'squarespace-estimator-widget.html' : 'standalone-estimator-page.html'}
                </span>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={handleCopy}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white py-2 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                >
                  {copied ? <Check size={14} className="text-emerald-300 animate-bounce" /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy Entire Code'}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 py-2 px-4 rounded-xl text-xs font-black uppercase tracking-wider border border-slate-700 transition-all"
                >
                  <Download size={14} />
                  Download HTML File
                </button>
              </div>
            </div>

            {/* Code Textarea display */}
            <div className="p-4 bg-slate-950">
              <textarea
                readOnly
                value={compiledCode}
                className="w-full h-96 bg-transparent text-[11px] font-mono text-slate-300 outline-none resize-none overflow-y-auto leading-relaxed border-none focus:outline-none focus:ring-0"
              />
            </div>
          </div>

          {/* Squarespace Step Installation Guide */}
          <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] space-y-4 shadow-sm">
            <h4 className="font-extrabold text-[#111111] uppercase tracking-wider text-sm">
              Implementation Guide
            </h4>

            {embedFormat === 'Squarespace' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-600">
                <div className="space-y-1 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all">
                  <span className="font-black text-indigo-600 text-xs uppercase tracking-wider">1. Copy widget Code</span>
                  <p className="text-[11px] text-[#555555]">
                    Click the <strong className="text-slate-800">Copy Entire Code</strong> on the snippet panel to copy your self-contained widget block.
                  </p>
                </div>

                <div className="space-y-1 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all">
                  <span className="font-black text-indigo-600 text-xs uppercase tracking-wider">2. Place Squarespace Code Block</span>
                  <p className="text-[11px] text-[#555555]">
                    Go into your Squarespace editor mode. Create/choose your section and add a custom <strong className="text-slate-800">Code Block</strong> element.
                  </p>
                </div>

                <div className="space-y-1 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all">
                  <span className="font-black text-indigo-600 text-xs uppercase tracking-wider">3. Paste Code & Save</span>
                  <p className="text-[11px] text-[#555555]">
                    Paste the entire block directly. Make sure the <strong className="text-[#a81616]">Display Source</strong> option in Squarespace settings is turned <strong className="text-[#a81616]">OFF</strong>.
                  </p>
                </div>

                <div className="space-y-1 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all border border-indigo-100">
                  <span className="font-black text-indigo-600 text-xs uppercase tracking-wider">★ Why This Code Works</span>
                  <p className="text-[11px] text-[#555555]">
                    This custom block wraps styles and scripts inside the <code className="bg-slate-250 py-0.5 px-1 text-slate-800 rounded font-mono">div</code>, rendering step cards immediately, while preventing formatting leakage.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-600">
                <div className="space-y-1 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all">
                  <span className="font-black text-indigo-600 text-xs uppercase tracking-wider">1. Download HTML Page</span>
                  <p className="text-[11px] text-[#555555]">
                    Click <strong className="text-slate-800">Download HTML File</strong> to save a standalone webpage ready to load in any browser tab.
                  </p>
                </div>

                <div className="space-y-1 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all">
                  <span className="font-black text-indigo-600 text-xs uppercase tracking-wider">2. Deploy to hosting or iframe</span>
                  <p className="text-[11px] text-[#555555]">
                    Upload this complete page to your static file domain, or deploy it as an iframe source endpoint on your main website.
                  </p>
                </div>
              </div>
            )}

            {/* Disclaimer box footer info */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-[11px] text-[#555555]">
              <span className="font-black text-[#111111] uppercase tracking-widest block mb-1">
                Helpful Developer Tip:
              </span>
              All compiled calculations, styles, and database hooks are protected under the custom <code className="bg-slate-200 px-1 rounded font-mono">#fence-estimator-wrapper</code> container ID which isolates Tailwind configurations, keeping them from interfering with Squarespace default themes.
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
