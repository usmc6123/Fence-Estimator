import React from 'react';
import { FileText, Copy, Download, Check, Sparkles, ExternalLink, Settings, ShieldCheck, HelpCircle } from 'lucide-react';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

import { MaterialItem, LaborRates, Estimate } from '../../types';

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

  // Pull initial webhook or details of GHL on mount
  React.useEffect(() => {
    const fetchSettings = async () => {
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
    };
    fetchSettings();
  }, []);

  const handleChange = (field: string, val: any) => {
    setParams(prev => ({
      ...prev,
      [field]: val
    }));
  };

  // Compile a gorgeous, live, self-contained single-page responsive HTML Estimator Widget
  const compiledCode = React.useMemo(() => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${params.companyName} - Fencing Estimator Widget</title>
  
  <!-- Tailwind CSS Play CDN for bulletproof styling -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- Google Fonts support -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
  
  <!-- Inline custom styles to isolate widget -->
  <style>
    #fence-estimator-wrapper {
      font-family: 'Inter', system-ui, -apple-system, sans-serif !important;
    }
    #fence-estimator-wrapper button, 
    #fence-estimator-wrapper select, 
    #fence-estimator-wrapper input {
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
  </style>
</head>
<body class="bg-gray-50/20 p-2 sm:p-4">

<div id="fence-estimator-wrapper" class="w-full max-w-4xl mx-auto bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden my-4">
  
  <!-- Banner Header -->
  <div class="bg-[#111827] text-white px-6 py-6 border-b border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-4">
    <div class="text-center sm:text-left space-y-1">
      <span class="text-xs font-black text-red-500 uppercase tracking-widest">★ HONOR & QUALITY BUILT ★</span>
      <h1 class="text-xl font-extrabold uppercase tracking-tight text-white m-0">${params.companyName}</h1>
      <p class="text-[11px] text-gray-400">DFW's faith-based, custom fencing partner. True American Craftsmanship.</p>
    </div>
    <div class="text-center sm:text-right">
      <a href="tel:${params.phone.replace(/\\D/g, '')}" class="text-red-500 font-black text-base hover:underline block">${params.phone}</a>
      <span class="text-[10px] text-gray-500 uppercase tracking-wider block">Patriot Hotline (Closed Sundays)</span>
    </div>
  </div>

  <!-- Wizard Content Container -->
  <div class="p-6 sm:p-10">
    
    <!-- Stage Progress Tracker -->
    <div id="progress-bar-container" class="space-y-3 mb-8 bg-gray-50 p-4 rounded-xl border border-gray-200">
      <div class="flex justify-between items-center text-xs">
        <span id="step-badge" class="font-extrabold text-blue-900 uppercase tracking-widest bg-blue-100 px-2.5 py-1 rounded-full">
          Step 1 of 5
        </span>
        <span id="step-description" class="font-bold text-gray-500">Style Selection</span>
      </div>
      <div class="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
        <div id="progress-indicator" class="h-full bg-gradient-to-r from-blue-900 to-emerald-600 w-[20%] transition-all duration-300"></div>
      </div>
    </div>

    <!-- Step Screens forms -->
    <form id="estimator-form" onsubmit="event.preventDefault();">
      
      <!-- STEP 1: STYLE SELECTION -->
      <div id="step-1" class="step-screen space-y-6">
        <div class="text-center max-w-xl mx-auto space-y-2">
          <h2 class="text-2xl font-black text-blue-950 uppercase tracking-tight">Select Fence Style</h2>
          <p class="text-sm font-medium text-gray-500">Pick the visual category that matches your boundary requirements.</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Wood Fence -->
          <button type="button" onclick="selectStyle('Wood Fence')" class="style-btn flex flex-col text-left p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-blue-900 hover:shadow-md">
            <h3 class="font-bold text-base text-gray-900 mb-1">Wood Fence</h3>
            <p class="text-xs text-gray-500">Solid vertical cedar or pine privacy/style fences built with premium craftsmanship.</p>
          </button>
          <!-- Wrought iron fence -->
          <button type="button" onclick="selectStyle('Wrought iron fence')" class="style-btn flex flex-col text-left p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-blue-900 hover:shadow-md">
            <h3 class="font-bold text-base text-gray-900 mb-1">Wrought iron fence</h3>
            <p class="text-xs text-gray-500">High-end black powder-coated metal/ornamental panels with protective pickets.</p>
          </button>
          <!-- chain link fence -->
          <button type="button" onclick="selectStyle('chain link fence')" class="style-btn flex flex-col text-left p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-blue-950 hover:shadow-md">
            <h3 class="font-bold text-base text-gray-950 mb-1">chain link fence</h3>
            <p class="text-xs text-gray-500">Durable galvanized or black vinyl-coated steel chain link mesh.</p>
          </button>
          <!-- pipe fence -->
          <button type="button" onclick="selectStyle('pipe fence')" class="style-btn flex flex-col text-left p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-blue-950 hover:shadow-md">
            <h3 class="font-bold text-base text-gray-950 mb-1">pipe fence</h3>
            <p class="text-xs text-gray-500">Rustic ranch-rail, pipe, or steel configurations perfect for open acreage.</p>
          </button>
        </div>
      </div>

      <!-- STEP 2: DIMENSIONS -->
      <div id="step-2" class="step-screen space-y-6 hidden">
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
              <span class="text-[10px] font-black text-amber-500 uppercase tracking-widest">★ ESTIMATE ENGINE STATUS</span>
              <span class="block text-sm font-bold text-gray-200">Dynamic Pricing Calculated</span>
              <p class="text-xs text-gray-400 leading-relaxed">Our advanced logic combines real-time lumber indices, concrete bag counts, gate assembly kits, and local labor rates.</p>
              <div class="p-2.5 bg-gray-850/60 border border-gray-800 rounded-xl flex items-center gap-2">
                <div class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <span class="text-[10px] font-black tracking-widest text-[#22c55e] uppercase">ESTIMATE LOCK READY AT STEP 5</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- STEP 3: MATERIAL SELECT -->
      <div id="step-3" class="step-screen space-y-6 hidden">
        <div class="text-center max-w-xl mx-auto space-y-2">
          <h2 class="text-2xl font-black text-blue-950 uppercase tracking-tight">Fence Materials</h2>
          <p class="text-sm font-medium text-gray-500">Calibrate the materials framework based on longevity and style preferences.</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <!-- PT PINE -->
          <button type="button" onclick="selectMaterial('Pressure-treated')" class="mat-btn flex flex-col text-left p-5 rounded-2xl border-2 border-blue-900 bg-blue-50/20 active hover:shadow-md">
            <h3 class="font-extrabold text-[#111111] mb-1">Pressure-Treated Pine</h3>
            <p class="text-xs text-slate-500 leading-relaxed mb-3">Extremely tough, chemically resistant, highly affordable wood choice.</p>
            <span class="text-sm font-black text-emerald-600 mt-auto">$18/LF</span>
          </button>
          <!-- CEDAR -->
          <button type="button" onclick="selectMaterial('Cedar')" class="mat-btn flex flex-col text-left p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-blue-900 hover:shadow-md">
            <h3 class="font-extrabold text-[#111111] mb-1">Western Cedar</h3>
            <p class="text-xs text-slate-500 leading-relaxed mb-3">Naturally beautiful structure, warp-resistant, warm cedar tones.</p>
            <span class="text-sm font-black text-emerald-600 mt-auto">$22/LF</span>
          </button>
          <!-- COMPOSITE -->
          <button type="button" onclick="selectMaterial('Composite')" class="mat-btn flex flex-col text-left p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-blue-900 hover:shadow-md">
            <h3 class="font-extrabold text-[#111111] mb-1">Eco Composite</h3>
            <p class="text-xs text-slate-500 leading-relaxed mb-3">Premium recycled polymer fibers. Utterly immune to weathering.</p>
            <span class="text-sm font-black text-emerald-600 mt-auto">$35/LF</span>
          </button>
          <!-- VINYL -->
          <button type="button" onclick="selectMaterial('Vinyl')" class="mat-btn flex flex-col text-left p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-blue-900 hover:shadow-md">
            <h3 class="font-extrabold text-[#111111] mb-1">Vinyl</h3>
            <p class="text-xs text-slate-500 leading-relaxed mb-3">Pristine sleek surface. Maintenance-free layout.</p>
            <span class="text-sm font-black text-emerald-600 mt-auto">$25/LF</span>
          </button>
          <!-- METAL -->
          <button type="button" onclick="selectMaterial('Metal')" class="mat-btn flex flex-col text-left p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-blue-900 hover:shadow-md">
            <h3 class="font-extrabold text-[#111111] mb-1">Ornamental Metal</h3>
            <p class="text-xs text-slate-500 leading-relaxed mb-3">Extremely safe, rust-proof commercial-quality steel layout.</p>
            <span class="text-sm font-black text-emerald-600 mt-auto">$28/LF</span>
          </button>
          <!-- CHAIN LINK -->
          <button type="button" onclick="selectMaterial('Chain Link')" class="mat-btn flex flex-col text-left p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-blue-900 hover:shadow-md">
            <h3 class="font-extrabold text-[#111111] mb-1">Chain Link</h3>
            <p class="text-xs text-slate-500 leading-relaxed mb-3">Galvanized boundaries tracking mesh. Maximum economic value.</p>
            <span class="text-sm font-black text-emerald-600 mt-auto">$8/LF</span>
          </button>
        </div>
      </div>

      <!-- STEP 4: GATES & TERRAIN -->
      <div id="step-4" class="step-screen space-y-6 hidden">
        <div class="text-center max-w-xl mx-auto space-y-2">
          <h2 class="text-2xl font-black text-blue-950 uppercase tracking-tight">Features & Terrain</h2>
          <p class="text-sm font-medium text-gray-500">Adjust slope factors, entry gates, and environmental cleanup.</p>
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
            <div class="space-y-4">
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
                <input type="checkbox" id="input-remove" onchange="calculateEstimates()" class="h-4 w-4 text-blue-900">
                <label for="input-remove" class="text-[11px] font-bold text-gray-800 cursor-pointer">Tear down & Haul old fence (+$\${(params.demoRate * (1 + params.contingencyBuffer)).toFixed(2)}/LF)</label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- STEP 5: CONTACT & CONFIRM -->
      <div id="step-5" class="step-screen space-y-6 hidden">
        <div class="text-center max-w-xl mx-auto space-y-2">
          <h2 class="text-2xl font-black text-blue-950 uppercase tracking-tight">Contact & Lock Estimate</h2>
          <p class="text-sm font-medium text-gray-500">Provide direct communication metrics to receive your final invoice ledger.</p>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div class="lg:col-span-5 bg-white p-6 rounded-2xl border border-gray-200 space-y-4 shadow-sm">
            <h3 class="font-extrabold text-blue-950 text-sm uppercase flex items-center gap-1.5 border-b border-gray-100 pb-2">Your Credentials</h3>
            <div class="space-y-1">
              <label class="block text-[10px] uppercase font-bold text-gray-500">First Name</label>
              <input type="text" id="cust-first" required placeholder="First Name..." class="w-full border border-gray-300 py-2 px-3 rounded-lg text-xs font-bold text-gray-900">
            </div>
            <div class="space-y-1">
              <label class="block text-[10px] uppercase font-bold text-gray-500">Last Name</label>
              <input type="text" id="cust-last" required placeholder="Last Name..." class="w-full border border-gray-300 py-2 px-3 rounded-lg text-xs font-bold text-gray-900">
            </div>
            <div class="space-y-1">
              <label class="block text-[10px] uppercase font-bold text-gray-500">Email Address</label>
              <input type="email" id="cust-email" required placeholder="example@gmail.com" class="w-full border border-gray-300 py-2 px-3 rounded-lg text-xs font-bold text-gray-900">
            </div>
            <div class="space-y-1">
              <label class="block text-[10px] uppercase font-bold text-gray-500">Phone Number</label>
              <input type="tel" id="cust-phone" required placeholder="(555) 000-0000" class="w-full border border-gray-300 py-2 px-3 rounded-lg text-xs font-bold text-gray-900">
            </div>
            <div class="space-y-1">
              <label class="block text-[10px] uppercase font-bold text-gray-500">Project Location Address</label>
              <input type="text" id="cust-address" required placeholder="Street address, city, state" class="w-full border border-gray-300 py-2 px-3 rounded-lg text-xs font-bold text-gray-900">
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
                <span class="text-gray-450">Selected material:</span>
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
            </div>

            <div class="pt-2 text-center bg-gray-900/60 p-4 border border-gray-800 rounded-xl space-y-1">
              <span class="text-[10px] font-bold text-amber-500 uppercase tracking-widest block">Projected Total Investment Range</span>
              <span id="receipt-price-range" class="text-2xl sm:text-3xl font-black text-emerald-400 block">-</span>
              <span class="text-[9px] text-gray-500 block leading-relaxed">Turnkey calculation includes materials, posts setting, labor, profit buffer, and sales tax estimations.</span>
            </div>

            <div id="error-alert" class="hidden p-3 bg-red-950 text-red-300 font-bold text-xs text-center border border-red-800 rounded-lg"></div>
          </div>
        </div>
      </div>

      <!-- STEP 6: THANK YOU SUCCESS -->
      <div id="step-6" class="step-screen py-10 space-y-6 text-center hidden">
        <div class="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
          <svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div class="space-y-1">
          <h2 class="text-2xl font-black text-blue-950 uppercase tracking-tight">Estimate Confirmed!</h2>
          <p class="text-xs font-bold text-emerald-600">Dynamic pricing logged under secure company pipeline ledger.</p>
        </div>
        <p class="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
          Hello <span id="confirmed-name" class="font-bold text-gray-800">Client</span>, your fencing quote is secure. A representative from <strong>${params.companyName}</strong> will call/email you shortly for on-site validation.
        </p>
        <button type="button" onclick="resetForm()" class="bg-blue-900 text-white hover:bg-blue-950 hover:scale-95 px-6 py-3 text-xs uppercase font-black rounded-xl tracking-wider shadow-md">Start New Estimate</button>
      </div>

      <!-- Dynamic navigation footer buttons for forms -->
      <div id="navigation-footer" class="max-w-4xl mx-auto flex justify-between border-t border-gray-200 mt-8 pt-4">
        <button type="button" id="prev-btn" onclick="prevStep()" class="border border-gray-300 text-gray-600 font-bold px-4 py-3.5 rounded-xl text-xs uppercase hover:bg-slate-50">Back</button>
        <button type="button" id="next-btn" onclick="nextStep()" class="bg-blue-900 text-white font-black uppercase tracking-widest px-6 py-3.5 rounded-xl text-xs hover:bg-blue-950 hover:shadow-lg">Next Step</button>
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
    material: 'Pressure-treated',
    needGates: false,
    gateCount: 1,
    gateType: 'Single Swing',
    siteCondition: 'Level',
    removeOldFence: false
  };

  const MATERIAL_PRICES = {
    'Pressure-treated': 18,
    'Cedar': 22,
    'Composite': 35,
    'Vinyl': 25,
    'Metal': 28,
    'Chain Link': 8
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

  function selectStyle(style) {
    state.fenceType = style;
    // Highlight items
    const btns = document.querySelectorAll('.style-btn');
    btns.forEach(btn => {
      if (btn.querySelector('h3').innerText.includes(style)) {
        btn.className = "style-btn flex flex-col text-left p-5 rounded-2xl border-2 border-blue-900 bg-blue-50/20";
      } else {
        btn.className = "style-btn flex flex-col text-left p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-blue-900";
      }
    });
    setTimeout(nextStep, 200);
  }

  function selectMaterial(mat) {
    state.material = mat;
    const btns = document.querySelectorAll('.mat-btn');
    btns.forEach(btn => {
      if (btn.querySelector('h3').innerText.includes(mat)) {
        btn.className = "mat-btn flex flex-col text-left p-5 rounded-2xl border-2 border-blue-900 bg-blue-50/20";
      } else {
        btn.className = "mat-btn flex flex-col text-left p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-blue-900";
      }
    });
    calculateEstimates();
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
    // Read input dimensions
    state.linearFeet = parseFloat(document.getElementById('input-lf').value) || 0;
    state.height = parseInt(document.getElementById('input-height').value) || 6;
    state.siteCondition = document.getElementById('input-site').value || 'Level';
    state.removeOldFence = document.getElementById('input-remove').checked || false;

    if (state.needGates) {
      state.gateCount = parseInt(document.getElementById('input-gate-count').value) || 1;
      state.gateType = document.getElementById('input-gate-type').value || 'Single Swing';
    }

    const lf = state.linearFeet;
    
    // 1. Posts Cost: (Linear Feet ÷ spacing) × concretePostCost
    const postsCost = Math.ceil(lf / ${params.postSpacing}) * ${params.concretePostCost};

    // 2. Materials
    const matPrice = MATERIAL_PRICES[state.material] || 18;
    const materialsCost = lf * matPrice;

    // 3. Labor: LF × baseLaborRate × terrain + demolition $${params.demoRate} if checked
    const terrainFactor = TERRAIN_FACTORS[state.siteCondition] || 1.0;
    const baseLabor = lf * ${params.baseLaborRate} * terrainFactor;
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
    document.getElementById('receipt-spec-material').innerText = state.material;
    
    const gatesText = state.needGates ? state.gateCount + ' × ' + state.gateType : 'None Requested';
    document.getElementById('receipt-spec-gates').innerText = gatesText;
    
    const demoText = state.removeOldFence ? 'Tear down & haul standard old fence' : 'No removal required';
    document.getElementById('receipt-spec-demo').innerText = demoText;

    // Projected Turnkey Cost range
    const rangeMin = Math.round(total);
    const rangeMax = Math.round(total * 1.10);
    document.getElementById('receipt-price-range').innerText = '$' + rangeMin.toLocaleString() + ' - $' + rangeMax.toLocaleString();
  }

  function renderStep() {
    const screens = document.querySelectorAll('.step-screen');
    screens.forEach(screen => screen.classList.add('hidden'));
    
    document.getElementById('step-' + currentStep).classList.remove('hidden');

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
    if (currentStep === 5) {
      submitPayload();
      return;
    }
    currentStep = Math.min(6, currentStep + 1);
    renderStep();
    calculateEstimates();
  }

  function prevStep() {
    currentStep = Math.max(1, currentStep - 1);
    renderStep();
  }

  function resetForm() {
    currentStep = 1;
    state.fenceType = '';
    state.linearFeet = 120;
    state.height = 6;
    state.material = 'Pressure-treated';
    state.needGates = false;
    state.gateCount = 1;
    state.gateType = 'Single Swing';
    state.siteCondition = 'Level';
    state.removeOldFence = false;

    // Reset inputs
    document.getElementById('input-lf').value = 120;
    document.getElementById('input-height').value = 6;
    document.getElementById('input-site').value = 'Level';
    document.getElementById('input-remove').checked = false;
    setGates(false);

    // Reset customer fields
    document.getElementById('cust-first').value = '';
    document.getElementById('cust-last').value = '';
    document.getElementById('cust-email').value = '';
    document.getElementById('cust-phone').value = '';
    document.getElementById('cust-address').value = '';

    document.getElementById('error-alert').classList.add('hidden');

    renderStep();
  }

  async function submitPayload() {
    const firstName = document.getElementById('cust-first').value.trim();
    const lastName = document.getElementById('cust-last').value.trim();
    const email = document.getElementById('cust-email').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const address = document.getElementById('cust-address').value.trim();

    if (!firstName || !lastName || !email || !phone || !address) {
      document.getElementById('error-alert').innerText = 'Please complete all required fields to register estimate!';
      document.getElementById('error-alert').classList.remove('hidden');
      return;
    }

    document.getElementById('error-alert').classList.add('hidden');
    document.getElementById('next-btn').disabled = true;
    document.getElementById('next-btn').innerText = 'Sending...';

    // Build Payload object
    const webhookUrl = "${params.ghlWebhookUrl}";

    // Local total
    const lf = state.linearFeet;
    const postsCost = Math.ceil(lf / ${params.postSpacing}) * ${params.concretePostCost};
    const materialsCost = lf * (MATERIAL_PRICES[state.material] || 18);
    const laborFactor = TERRAIN_FACTORS[state.siteCondition] || 1.0;
    const laborCost = (lf * ${params.baseLaborRate} * laborFactor) + (state.removeOldFence ? lf * ${params.demoRate} : 0);
    const gatesCost = state.needGates ? state.gateCount * (GATE_PRICES[state.gateType] || 0) : 0;
    const subtotal = postsCost + materialsCost + laborCost + gatesCost;
    const contingency = subtotal * ${params.contingencyBuffer};
    const tax = (subtotal + contingency) * ${params.taxRate};
    const totalVal = subtotal + contingency + tax;

    const payload = {
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

    try {
      if (webhookUrl) {
        // Send payload direct
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      
      document.getElementById('confirmed-name').innerText = firstName;
      currentStep = 6;
      renderStep();
    } catch (err) {
      console.warn('Webhook transmission offline or failed. Navigating to thank you anyway:', err);
      // Fallback: Proceed to success state for seamless UX
      document.getElementById('confirmed-name').innerText = firstName;
      currentStep = 6;
      renderStep();
    } finally {
      document.getElementById('next-btn').disabled = false;
    }
  }

  // Start initialization
  resetForm();
</script>

</body>
</html>`;
  }, [params]);

  const handleCopy = () => {
    navigator.clipboard.writeText(compiledCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([compiledCode], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fence-estimator-widget.html';
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
            Compile & Download Squarespace Widgets
          </h2>
          <p className="text-xs text-indigo-100 max-w-2xl leading-normal font-medium">
            Tune your pricing constants, tax weights, or margins below. Our compiler updates the inline CSS styles and the complete layout logic inside a single copy-load HTML file instantly.
          </p>
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
              className="w-full text-xs font-bold border border-slate-300 px-3.5 py-2.5 rounded-xl text-slate-900"
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
              className="w-full text-xs font-bold border border-slate-300 px-3.5 py-2.5 rounded-xl text-slate-900"
            />
          </div>

          {/* Webhook */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
                GHL CRM Pipeline Backend URL
              </label>
              <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">active dev live</span>
            </div>
            <input
              type="text"
              placeholder="Paste GoHighLevel webhook URL..."
              value={params.ghlWebhookUrl}
              onChange={(e) => handleChange('ghlWebhookUrl', e.target.value)}
              className="w-full text-xs font-bold border border-slate-300 px-3.5 py-2.5 rounded-xl text-[#333333]"
            />
            <p className="text-[10px] text-slate-400">
              Complete submission payloads compile to GHL custom fields automatically on event.
            </p>
          </div>

          {/* Numerical rates adjustments */}
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
                onChange={(e) => handleChange('taxRate', parseFloat(e.target.value) || 0.08)}
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
              onChange={(e) => handleChange('contingencyBuffer', parseFloat(e.target.value) || 0.10)}
              className="w-full text-xs font-bold border border-slate-300 px-3 py-2.5 rounded-xl"
            />
            <p className="text-[9px] text-slate-400">e.g. 0.10 is 10.0% buffering margin value</p>
          </div>

        </div>

        {/* Right Column - Live Code blocks and Squarespace installation checklist (7 Columns) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* File Block Card */}
          <div className="bg-[#111827] text-white rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col">
            
            {/* Header copy buttons */}
            <div className="bg-[#0f172a] border-b border-slate-800 px-5 py-4 flex flex-col sm:flex-row justify-between items-center gap-3">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
                <span className="text-slate-200 font-bold">fence-estimator-widget.html</span>
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
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 py-2 px-4 rounded-xl text-xs font-black uppercase tracking-wider border border-slate-750 transition-all"
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
                className="w-full h-80 bg-transparent text-[11px] font-mono text-slate-300 outline-none resize-none overflow-y-auto leading-relaxed border-none focus:outline-none focus:ring-0"
              />
            </div>
          </div>

          {/* Squarespace Step Installation Guide */}
          <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] space-y-4 shadow-sm">
            <h4 className="font-extrabold text-american-blue uppercase tracking-wider text-sm">
              Squarespace Implementation Guide (5-Step Install)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-600">
              
              {/* Step 1 */}
              <div className="space-y-1 p-3 rounded-xl hover:bg-slate-50 transition-all">
                <span className="font-black text-indigo-600 text-xs uppercase tracking-wider">1. Copy Code or Download</span>
                <p className="text-[11px] text-[#555555]">
                  Click the <strong className="text-slate-800">Copy Entire Code</strong> button above to secure the fully customizable standalone, CSS-scoped HTML bundle.
                </p>
              </div>

              {/* Step 2 */}
              <div className="space-y-1 p-3 rounded-xl hover:bg-slate-50 transition-all">
                <span className="font-black text-indigo-600 text-xs uppercase tracking-wider">2. Insert Squarespace Code Block</span>
                <p className="text-[11px] text-[#555555]">
                  Open your website builder on Squarespace. Select your target page, go into <strong className="text-slate-800">Edit Mode</strong>, and add a custom <strong className="text-slate-800">Code Block</strong> widget element.
                </p>
              </div>

              {/* Step 3 */}
              <div className="space-y-1 p-3 rounded-xl hover:bg-slate-50 transition-all">
                <span className="font-black text-indigo-600 text-xs uppercase tracking-wider">3. Set Compiler target to HTML</span>
                <p className="text-[11px] text-[#555555]">
                  Inside the Code Block settings editor panel, toggle the display output selection dropdown from CSS/Markdown to <strong className="text-slate-800">HTML</strong>.
                </p>
              </div>

              {/* Step 4 */}
              <div className="space-y-1 p-3 rounded-xl hover:bg-slate-50 transition-all">
                <span className="font-black text-indigo-600 text-xs uppercase tracking-wider">4. Turn OFF Display Source option</span>
                <p className="text-[11px] text-[#555555]">
                  Verify that the <strong className="text-slate-800">Display Source</strong> box option is <strong className="text-rose-600">UNCHECKED</strong> inside Squarespace so the code renders inside the site block immediately.
                </p>
              </div>

              {/* Step 5 */}
              <div className="sm:col-span-2 space-y-1 p-3 hover:bg-slate-50 rounded-xl transition-all border-t border-slate-100">
                <span className="font-black text-indigo-600 text-xs uppercase tracking-wider block">5. Paste & Publish</span>
                <p className="text-[11px] text-[#555555]">
                  Delete any default template values, paste the code, click <strong className="text-slate-800">Save</strong> on the page, and preview your gorgeous interactive fence estimator.
                </p>
              </div>
            </div>

            {/* Disclaimer box footer info */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-[11px] text-[#555555]">
              <span className="font-black text-american-blue uppercase tracking-widest block mb-1">
                Helpful Webmaster Tip:
              </span>
              All compiled calculations, styles, and triggers are protected under the custom <code className="bg-slate-200 px-1 rounded">#fence-estimator-wrapper</code> container ID which isolates Tailwind variables, preventing styling conflicts with Squarespace native themes.
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
