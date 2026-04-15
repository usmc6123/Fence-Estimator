import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calculator, Plus, Trash2, Send, Download, CheckCircle2, 
  ChevronRight, ChevronLeft, Info, Ruler, Palette, Box, 
  Layers, HardHat, FileText, Map, X, Printer, Share2, Trees, Droplets
} from 'lucide-react';
import { FENCE_STYLES } from '../constants';
import { MaterialItem, FenceStyle, Estimate } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { COMPANY_INFO } from '../constants';

interface EstimatorProps {
  materials: MaterialItem[];
}

export default function Estimator({ materials }: EstimatorProps) {
  const [step, setStep] = React.useState(1);
  const [estimate, setEstimate] = React.useState<Partial<Estimate>>({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    customerAddress: '',
    linearFeet: 100,
    corners: 2,
    height: 6,
    width: 8,
    runs: [],
    color: 'White',
    styleId: FENCE_STYLES[0].id,
    visualStyleId: FENCE_STYLES[0].visualStyles[0].id,
    postCapId: materials.find(m => m.category === 'PostCap')?.id || '',
    gateCount: 1,
    gateStyleId: materials.find(m => m.category === 'Gate')?.id || '',
    footingType: 'Cuboid',
    postWidth: 6,
    postThickness: 6,
    
    // New Fields
    hasDemolition: false,
    demoLinearFeet: 100,
    demoType: 'Wood',
    removeConcreteFootings: true,
    hasSitePrep: false,
    needsClearing: false,
    needsMarking: true,
    obstacleRemoval: false,
    wastePercentage: 10,
    includeGravel: true,
    includeStain: false,
    
    markupPercentage: 30,
    taxPercentage: 8.25,
    manualLaborRatePerLF: 15,
    manualLaborRatePerGate: 150,
    manualQuantities: {},
    manualPrices: {},
    woodType: 'Pine',
    topStyle: 'Dog Ear',
    isPreStained: false,
  });

  const [isFullView, setIsFullView] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [showInvoice, setShowInvoice] = React.useState(false);
  const [showDiagram, setShowDiagram] = React.useState(false);

  const selectedStyle = FENCE_STYLES.find(s => s.id === estimate.styleId) || FENCE_STYLES[0];
  const selectedVisualStyle = selectedStyle.visualStyles.find(vs => vs.id === estimate.visualStyleId) || selectedStyle.visualStyles[0];

  const calculateCosts = () => {
    const runs = estimate.runs || [];
    const hasRuns = runs.length > 0;
    
    const lf = hasRuns ? runs.reduce((sum, r) => sum + r.linearFeet, 0) : (estimate.linearFeet || 0);
    const gates = hasRuns ? runs.reduce((sum, r) => sum + (r.gateDetails?.length || r.gates || 0), 0) : (estimate.gateCount || 0);
    
    // Auto-calculate corners based on runs
    const corners = hasRuns ? Math.max(0, runs.length - 1) : (estimate.corners || 0);
    
    const logic = selectedStyle.calcLogic;
    const wasteFactor = 1 + (estimate.wastePercentage || 10) / 100;

    const rawItems: { name: string; qty: number; unitCost: number; total: number; category: string }[] = [];

    // 1. Posts
    let endPostCount = 2; // Start and end of the fence
    let doubleGateCount = 0;
    
    if (hasRuns) {
      runs.forEach(run => {
        if (run.gateDetails && run.gateDetails.length > 0) {
          run.gateDetails.forEach(gate => {
            endPostCount += gate.type === 'Double' ? 2 : 1;
            if (gate.type === 'Double') doubleGateCount++;
          });
        } else {
          endPostCount += (run.gates || 0) * 2;
        }
      });
    } else {
      endPostCount += (estimate.gateCount || 0) * 2;
    }
    
    let cornerPostCount = corners;
    let linePostCount = 0;
    
    if (hasRuns) {
      linePostCount = runs.reduce((sum, run) => sum + Math.max(0, Math.ceil(run.linearFeet / 8) - 1), 0);
    } else {
      linePostCount = Math.max(0, Math.ceil(lf / 8) - 1);
    }
    
    const postCount = endPostCount + cornerPostCount + linePostCount;
    const postMat = materials.find(m => m.category === 'Post' && m.id.startsWith(selectedStyle.type.toLowerCase().charAt(0))) || materials[0];
    const postQty = postCount; // No waste factor on posts per request
    rawItems.push({ 
      name: postMat.name, 
      qty: postQty, 
      unitCost: postMat.cost, 
      total: postQty * postMat.cost,
      category: 'Structure'
    });

    // 2. Main Panels/Pickets
    let panelQty = 0;
    let panelMat = materials.find(m => (m.category === 'Panel' || m.category === 'Picket') && m.id.startsWith(selectedStyle.type.toLowerCase().charAt(0))) || materials[0];

    if (selectedStyle.type === 'Wood') {
      // 5.5 inches = 0.458ft
      panelQty = Math.ceil((lf / 0.458) * wasteFactor);
      
      // Select specific wood type picket
      if (estimate.woodType === 'Pine') {
        panelMat = materials.find(m => m.id === 'w-picket-pine') || panelMat;
      } else if (estimate.woodType === 'Japanese Cedar') {
        panelMat = materials.find(m => m.id === 'w-picket-j-cedar') || panelMat;
      } else if (estimate.woodType === 'Western Cedar') {
        panelMat = materials.find(m => m.id === 'w-picket-w-cedar') || panelMat;
      }
    } else {
      const panelCount = Math.ceil(lf / (estimate.width || 8));
      panelQty = Math.ceil(panelCount * wasteFactor);
    }
    
    const visualStyleModifier = selectedVisualStyle.priceModifier;
    let picketDisplayName = panelMat.name;
    if (selectedStyle.type === 'Wood' && estimate.topStyle) {
      picketDisplayName = picketDisplayName.replace('Picket', `${estimate.topStyle} Picket`);
    }
    
    rawItems.push({ 
      name: picketDisplayName, 
      qty: panelQty, 
      unitCost: panelMat.cost + visualStyleModifier, 
      total: panelQty * (panelMat.cost + visualStyleModifier),
      category: 'Infill'
    });

    // 2.5 Pre-staining Service
    if (selectedStyle.type === 'Wood' && estimate.isPreStained) {
      const preStainMat = materials.find(m => m.id === 'f-pre-stain');
      if (preStainMat) {
        rawItems.push({
          name: preStainMat.name,
          qty: lf,
          unitCost: preStainMat.cost,
          total: lf * preStainMat.cost,
          category: 'Finishing'
        });
      }
    }

    // 3. Post Caps
    const capMat = materials.find(m => m.id === estimate.postCapId);
    if (capMat) {
      rawItems.push({ 
        name: capMat.name, 
        qty: postCount, 
        unitCost: capMat.cost, 
        total: postCount * capMat.cost,
        category: 'Hardware'
      });
    }

    // 4. Gates
    const gateMat = materials.find(m => m.id === estimate.gateStyleId);
    if (gateMat && gates > 0) {
      rawItems.push({ 
        name: gateMat.name, 
        qty: gates, 
        unitCost: gateMat.cost, 
        total: gates * gateMat.cost,
        category: 'Gate'
      });
      
      // Add Latch if not included in kit
      const latchMat = materials.find(m => m.id === 'g-latch-grav');
      if (latchMat) {
        rawItems.push({
          name: latchMat.name,
          qty: gates,
          unitCost: latchMat.cost,
          total: gates * latchMat.cost,
          category: 'Gate'
        });
      }
      
      // Add Shark Hinge Kit for Double Gates
      if (doubleGateCount > 0) {
        const sharkKit = materials.find(m => m.id === 'g-kit-shark');
        if (sharkKit) {
          rawItems.push({
            name: sharkKit.name,
            qty: doubleGateCount,
            unitCost: sharkKit.cost,
            total: doubleGateCount * sharkKit.cost,
            category: 'Gate'
          });
        }
      }
    }

    // 5. Fasteners & Hardware
    if (selectedStyle.type === 'Wood') {
      const fastenerMat = materials.find(m => m.id === 'h-nail-galv')!;
      const fastenerQty = Math.ceil(lf / 50); // 1 box per 50LF
      rawItems.push({ name: fastenerMat.name, qty: fastenerQty, unitCost: fastenerMat.cost, total: fastenerQty * fastenerMat.cost, category: 'Hardware' });
      
      const bracketMat = materials.find(m => m.id === 'h-bracket-w')!;
      const bracketQty = Math.ceil(lf * logic.railsPerLF);
      rawItems.push({ name: bracketMat.name, qty: bracketQty, unitCost: bracketMat.cost, total: bracketQty * bracketMat.cost, category: 'Hardware' });
    }

    if (selectedStyle.type === 'Chain Link') {
      const tieMat = materials.find(m => m.id === 'h-cl-tie')!;
      const tieQty = Math.ceil(lf / 50); // 1 box per 50LF
      rawItems.push({ name: tieMat.name, qty: tieQty, unitCost: tieMat.cost, total: tieQty * tieMat.cost, category: 'Hardware' });
      
      const tensionBandMat = materials.find(m => m.id === 'h-cl-band-tens')!;
      const tensionBandQty = corners * 3 + gates * 3;
      rawItems.push({ name: tensionBandMat.name, qty: tensionBandQty, unitCost: tensionBandMat.cost, total: tensionBandQty * tensionBandMat.cost, category: 'Hardware' });
      
      const braceBandMat = materials.find(m => m.id === 'h-cl-band-brace')!;
      const braceBandQty = corners * 2 + gates * 2;
      rawItems.push({ name: braceBandMat.name, qty: braceBandQty, unitCost: braceBandMat.cost, total: braceBandQty * braceBandMat.cost, category: 'Hardware' });
    }

    if (selectedStyle.type === 'Vinyl') {
      const screwMat = materials.find(m => m.id === 'h-screw-v')!;
      const screwQty = Math.ceil(lf / 10);
      rawItems.push({ name: screwMat.name, qty: screwQty, unitCost: screwMat.cost, total: screwQty * screwMat.cost, category: 'Hardware' });
    }

    // 6. Concrete & Gravel
    const concreteBags = Math.ceil(postCount * logic.concretePerPost);
    const concreteMat = materials.find(m => m.id === 'i-concrete-80') || materials.find(m => m.category === 'Concrete')!;
    rawItems.push({ 
      name: `${concreteMat.name}`, 
      qty: concreteBags, 
      unitCost: concreteMat.cost, 
      total: concreteBags * concreteMat.cost,
      category: 'Installation'
    });

    if (estimate.includeGravel) {
      const gravelMat = materials.find(m => m.id === 'i-gravel')!;
      const gravelQty = Math.ceil(postCount * 0.5 / 27); // 0.5 cu ft per hole, convert to cu yd and round up
      rawItems.push({ 
        name: gravelMat.name, 
        qty: gravelQty, 
        unitCost: gravelMat.cost, 
        total: gravelQty * gravelMat.cost,
        category: 'Installation'
      });
    }

    // 7. Demolition
    if (estimate.hasDemolition) {
      const dLF = estimate.demoLinearFeet || lf;
      const weightPerLF = estimate.demoType === 'Wood' ? 18 : (estimate.demoType === 'Chain Link' ? 8 : 12);
      const fenceWeight = dLF * weightPerLF;
      const footingWeight = estimate.removeConcreteFootings ? (postCount * 225) : 0;
      const totalWeight = fenceWeight + footingWeight;
      
      const dumpsterMat = materials.find(m => m.id === 'd-dumpster')!;
      const haulingMat = materials.find(m => m.id === 'd-hauling')!;
      const bladeMat = materials.find(m => m.id === 'd-blade')!;
      const laborMat = materials.find(m => m.id === 'd-labor')!;
      
      const dumpstersNeeded = Math.ceil(totalWeight / 6000); // Assume 3 tons per dumpster
      const bladesNeeded = Math.ceil(dLF / 50);
      
      rawItems.push(
        { name: dumpsterMat.name, qty: dumpstersNeeded, unitCost: dumpsterMat.cost, total: dumpstersNeeded * dumpsterMat.cost, category: 'Demolition' },
        { name: haulingMat.name, qty: dumpstersNeeded, unitCost: haulingMat.cost, total: dumpstersNeeded * haulingMat.cost, category: 'Demolition' },
        { name: bladeMat.name, qty: bladesNeeded, unitCost: bladeMat.cost, total: bladesNeeded * bladeMat.cost, category: 'Demolition' },
        { name: laborMat.name, qty: Math.ceil(dLF / 10), unitCost: laborMat.cost, total: Math.ceil(dLF / 10) * laborMat.cost, category: 'Demolition' }
      );
    }

    // 8. Site Prep
    if (estimate.hasSitePrep) {
      if (estimate.needsMarking) {
        const markingMat = materials.find(m => m.id === 's-marking')!;
        rawItems.push({ name: markingMat.name, qty: 1, unitCost: markingMat.cost, total: markingMat.cost, category: 'SitePrep' });
      }
      if (estimate.needsClearing) {
        const clearingMat = materials.find(m => m.id === 's-clearing')!;
        const clearingHours = Math.ceil(lf / 20);
        rawItems.push({ name: clearingMat.name, qty: clearingHours, unitCost: clearingMat.cost, total: clearingHours * clearingMat.cost, category: 'SitePrep' });
      }
    }

    // 9. Finishing
    if (estimate.includeStain && selectedStyle.type === 'Wood') {
      const stainMat = materials.find(m => m.id === 'f-stain')!;
      const sqFt = lf * (estimate.height || 6) * 2; // Two sides
      const gallons = Math.ceil(sqFt / 175);
      rawItems.push({ name: stainMat.name, qty: gallons, unitCost: stainMat.cost, total: gallons * stainMat.cost, category: 'Finishing' });
    }

    // Apply manual overrides
    const items = rawItems.map(item => {
      const manualQty = estimate.manualQuantities?.[item.name];
      const manualPrice = estimate.manualPrices?.[item.name];
      
      const qty = manualQty !== undefined ? manualQty : item.qty;
      const unitCost = manualPrice !== undefined ? manualPrice : item.unitCost;
      
      return { 
        ...item, 
        qty, 
        unitCost, 
        total: qty * unitCost 
      };
    });

    const demoCost = items.filter(i => i.category === 'Demolition').reduce((sum, i) => sum + i.total, 0);
    const sitePrepCost = items.filter(i => i.category === 'SitePrep').reduce((sum, i) => sum + i.total, 0);
    const materialSubtotal = items.filter(i => i.category !== 'Labor' && i.category !== 'Demolition' && i.category !== 'SitePrep').reduce((sum, item) => sum + item.total, 0);
    
    // Manual Labor Calculation
    const laborRateLF = estimate.manualLaborRatePerLF ?? selectedStyle.baseLaborRate;
    const laborRateGate = estimate.manualLaborRatePerGate ?? 0;
    const laborCost = (lf * laborRateLF) + (gates * laborRateGate);
    
    const subtotal = materialSubtotal + laborCost + demoCost + sitePrepCost;
    const markup = subtotal * ((estimate.markupPercentage || 0) / 100);
    const tax = (subtotal + markup) * ((estimate.taxPercentage || 0) / 100);
    const total = subtotal + markup + tax;

    // Cost per run
    const runBreakdown = runs.map((run, idx) => {
      const runLF = run.linearFeet;
      const runGates = run.gateDetails?.length || run.gates || 0;
      
      const runLinePosts = Math.max(0, Math.ceil(runLF / 8) - 1);
      
      let runGatePosts = 0;
      if (run.gateDetails && run.gateDetails.length > 0) {
        run.gateDetails.forEach(gate => {
          runGatePosts += gate.type === 'Double' ? 2 : 1;
        });
      } else {
        runGatePosts = runGates * 2;
      }
      
      const runPostCount = runLinePosts + 1 + (idx === runs.length - 1 ? 1 : 0) + runGatePosts;
      
      const runPanelCount = selectedStyle.type === 'Wood' 
        ? Math.ceil(runLF / 0.458)
        : Math.ceil(runLF / (estimate.width || 8));
      
      let runMatCost = (runPostCount * postMat.cost) + (runPanelCount * (panelMat.cost + visualStyleModifier));
      
      if (selectedStyle.type === 'Wood' && estimate.isPreStained) {
        const preStainMat = materials.find(m => m.id === 'f-pre-stain');
        if (preStainMat) {
          runMatCost += runLF * preStainMat.cost;
        }
      }
      
      const laborRateLF = estimate.manualLaborRatePerLF ?? selectedStyle.baseLaborRate;
      const laborRateGate = estimate.manualLaborRatePerGate ?? 0;
      const runLaborCost = (runLF * laborRateLF) + (runGates * laborRateGate);
      
      return {
        id: run.id,
        name: run.name,
        total: runMatCost + runLaborCost
      };
    });

    return { items, materialSubtotal, laborCost, demoCost, sitePrepCost, subtotal, markup, tax, total, runBreakdown, lf, postCount, gateCount: gates };
  };

  const results = calculateCosts();

  const handleNext = () => setStep(s => Math.min(s + 1, 6));
  const handleBack = () => setStep(s => Math.max(s - 1, 1));

  const handleSave = () => {
    setTimeout(() => {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1500);
  };

  const steps = [
    { id: 1, label: 'Measurements', icon: Ruler },
    { id: 2, label: 'Style & Options', icon: Palette },
    { id: 3, label: 'Accessories', icon: Box },
    { id: 4, label: 'Demo & Site Prep', icon: HardHat },
    { id: 5, label: 'Advanced Specs', icon: Layers },
    { id: 6, label: 'Review & Total', icon: FileText },
  ];

  const PatrioticDivider = () => (
    <div className="relative py-10 flex items-center justify-center">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t-4 border-double border-american-blue/10"></div>
      </div>
      <div className="relative flex items-center gap-6 bg-[#F8F9FA] px-8">
        <div className="w-6 h-6 bg-american-red american-star shadow-lg transform rotate-12" />
        <div className="w-8 h-8 bg-american-blue american-star shadow-xl" />
        <div className="w-6 h-6 bg-american-red american-star shadow-lg transform -rotate-12" />
      </div>
    </div>
  );

  const renderSection = (sectionId: number) => {
    switch (sectionId) {
      case 1:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Customer Information Section */}
            <div className="bg-white rounded-3xl p-8 shadow-xl border-2 border-american-blue/10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Share2 size={120} className="transform rotate-12" />
              </div>
              <div className="flex items-center gap-4 mb-8">
                <div className="h-14 w-14 rounded-2xl bg-american-blue flex items-center justify-center text-white shadow-lg shadow-american-blue/20">
                  <Share2 size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-american-blue tracking-tight">CUSTOMER DOSSIER</h3>
                  <p className="text-xs font-bold text-american-red uppercase tracking-widest">Project Identification & Logistics</p>
                </div>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Customer Full Name</label>
                  <input 
                    type="text" 
                    value={estimate.customerName} 
                    onChange={(e) => setEstimate({...estimate, customerName: e.target.value})} 
                    placeholder="Enter Name"
                    className="w-full rounded-xl border-2 border-[#F0F0F0] bg-white px-5 py-3.5 text-sm font-bold focus:border-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all placeholder:text-[#CCCCCC]" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Email Address</label>
                  <input 
                    type="email" 
                    value={estimate.customerEmail} 
                    onChange={(e) => setEstimate({...estimate, customerEmail: e.target.value})} 
                    placeholder="email@domain.com"
                    className="w-full rounded-xl border-2 border-[#F0F0F0] bg-white px-5 py-3.5 text-sm font-bold focus:border-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all placeholder:text-[#CCCCCC]" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Phone Number</label>
                  <input 
                    type="tel" 
                    value={estimate.customerPhone} 
                    onChange={(e) => setEstimate({...estimate, customerPhone: e.target.value})} 
                    placeholder="(555) 000-0000"
                    className="w-full rounded-xl border-2 border-[#F0F0F0] bg-white px-5 py-3.5 text-sm font-bold focus:border-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all placeholder:text-[#CCCCCC]" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Project Site Address</label>
                  <input 
                    type="text" 
                    value={estimate.customerAddress} 
                    onChange={(e) => setEstimate({...estimate, customerAddress: e.target.value})} 
                    placeholder="Street, City, State, Zip"
                    className="w-full rounded-xl border-2 border-[#F0F0F0] bg-white px-5 py-3.5 text-sm font-bold focus:border-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all placeholder:text-[#CCCCCC]" 
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-8 shadow-xl border-2 border-american-red/10 relative overflow-hidden">
              <div className="flex items-center gap-4 mb-8">
                <div className="h-14 w-14 rounded-2xl bg-american-red flex items-center justify-center text-white shadow-lg shadow-american-red/20">
                  <Ruler size={28} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-american-red tracking-tight uppercase">Strategic Measurements</h2>
                  <p className="text-xs font-bold text-american-blue uppercase tracking-widest">Perimeter & Boundary Specifications</p>
                </div>
              </div>

              <div className="grid gap-8 md:grid-cols-3">
                <div className="space-y-3 relative">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Total Perimeter (LF)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={estimate.linearFeet} 
                      onChange={(e) => setEstimate({...estimate, linearFeet: Number(e.target.value)})} 
                      disabled={estimate.runs && estimate.runs.length > 0}
                      className={`w-full rounded-2xl border-2 border-[#F0F0F0] bg-white px-6 py-4 text-2xl font-black text-american-blue focus:border-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all ${estimate.runs && estimate.runs.length > 0 ? 'opacity-50 cursor-not-allowed bg-[#F5F5F5]' : ''}`} 
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-american-blue/30">FEET</div>
                  </div>
                  {estimate.runs && estimate.runs.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-american-red/5 rounded-lg border border-american-red/20">
                      <Info size={12} className="text-american-red" />
                      <p className="text-[9px] text-american-red font-black uppercase tracking-tighter">Overridden by Sectional Data</p>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Structural Corners</label>
                  <div className="relative">
                    <input type="number" value={estimate.corners} onChange={(e) => setEstimate({...estimate, corners: Number(e.target.value)})} className="w-full rounded-2xl border-2 border-[#F0F0F0] bg-white px-6 py-4 text-2xl font-black text-american-blue focus:border-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all" />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-american-blue/30">UNITS</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Access Gates</label>
                  <div className="relative">
                    <input type="number" value={estimate.gateCount} onChange={(e) => setEstimate({...estimate, gateCount: Number(e.target.value)})} className="w-full rounded-2xl border-2 border-[#F0F0F0] bg-white px-6 py-4 text-2xl font-black text-american-blue focus:border-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all" />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-american-blue/30">UNITS</div>
                  </div>
                </div>
              </div>

              {/* Fence Runs Section */}
              <div className="mt-12 pt-10 border-t-2 border-dashed border-[#F0F0F0] space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-american-blue uppercase tracking-tight">Fence Runs</h3>
                    <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Individual Fence Run Specifications</p>
                  </div>
                  <button 
                    onClick={() => {
                      const newRun = { id: Math.random().toString(36).substr(2, 9), name: `Run ${(estimate.runs?.length || 0) + 1}`, linearFeet: 0, corners: 0, gates: 0 };
                      setEstimate({ ...estimate, runs: [...(estimate.runs || []), newRun] });
                    }}
                    className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-american-blue text-white text-xs font-black uppercase tracking-widest hover:bg-american-blue/90 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-american-blue/20"
                  >
                    <Plus size={16} />
                    Add Run
                  </button>
                </div>
                
                <div className="space-y-6">
                  {estimate.runs?.map((run, idx) => (
                    <div key={run.id} className="grid gap-6 md:grid-cols-12 items-end p-6 rounded-3xl bg-white border-2 border-[#F0F0F0] shadow-sm hover:shadow-md hover:border-american-blue/20 transition-all relative group">
                      <div className="md:col-span-5 space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Run Name</label>
                        <input 
                          type="text" 
                          value={run.name} 
                          onChange={(e) => {
                            const newRuns = [...estimate.runs!];
                            newRuns[idx].name = e.target.value;
                            setEstimate({ ...estimate, runs: newRuns });
                          }}
                          className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue focus:bg-white outline-none transition-all"
                        />
                      </div>
                      <div className="md:col-span-3 space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Length (LF)</label>
                        <input 
                          type="number" 
                          value={run.linearFeet} 
                          onChange={(e) => {
                            const newRuns = [...estimate.runs!];
                            newRuns[idx].linearFeet = Number(e.target.value);
                            setEstimate({ ...estimate, runs: newRuns });
                          }}
                          className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue focus:bg-white outline-none transition-all"
                        />
                      </div>
                      <div className="md:col-span-4 flex justify-end items-center">
                        <button 
                          onClick={() => {
                            const newRuns = estimate.runs!.filter((_, i) => i !== idx);
                            setEstimate({ ...estimate, runs: newRuns });
                          }}
                          className="flex items-center gap-2 px-4 py-3 text-american-red hover:bg-american-red/10 rounded-xl transition-all font-bold text-xs uppercase tracking-widest"
                        >
                          <Trash2 size={16} /> Remove Run
                        </button>
                      </div>
                      
                      {/* Gates Section for this Run */}
                      <div className="md:col-span-12 space-y-4 mt-2 pt-4 border-t-2 border-dashed border-[#F0F0F0]">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Gates in this Run</label>
                          <button
                            onClick={() => {
                              const newRuns = [...estimate.runs!];
                              if (!newRuns[idx].gateDetails) newRuns[idx].gateDetails = [];
                              newRuns[idx].gateDetails!.push({ id: Math.random().toString(36).substr(2, 9), type: 'Single', width: 4 });
                              newRuns[idx].gates = newRuns[idx].gateDetails!.length;
                              setEstimate({ ...estimate, runs: newRuns });
                            }}
                            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[#F0F0F0] text-american-blue text-[10px] font-black uppercase tracking-widest hover:bg-[#E5E5E5] transition-all"
                          >
                            <Plus size={12} /> Add Gate
                          </button>
                        </div>
                        
                        <div className="grid gap-3">
                          {run.gateDetails?.map((gate, gIdx) => (
                            <div key={gate.id} className="flex items-center gap-4 bg-[#F9F9F9] p-3 rounded-xl border border-[#E5E5E5]">
                              <div className="flex-1">
                                <select
                                  value={gate.type}
                                  onChange={(e) => {
                                    const newRuns = [...estimate.runs!];
                                    newRuns[idx].gateDetails![gIdx].type = e.target.value as 'Single' | 'Double';
                                    setEstimate({ ...estimate, runs: newRuns });
                                  }}
                                  className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-xs font-bold focus:border-american-blue outline-none"
                                >
                                  <option value="Single">Single Gate</option>
                                  <option value="Double">Double Gate</option>
                                </select>
                              </div>
                              <div className="flex-1 flex items-center gap-2">
                                <input
                                  type="number"
                                  value={gate.width}
                                  onChange={(e) => {
                                    const newRuns = [...estimate.runs!];
                                    newRuns[idx].gateDetails![gIdx].width = Number(e.target.value);
                                    setEstimate({ ...estimate, runs: newRuns });
                                  }}
                                  className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-xs font-bold focus:border-american-blue outline-none"
                                  placeholder="Width"
                                />
                                <span className="text-[10px] font-bold text-american-blue/40">FT</span>
                              </div>
                              <button
                                onClick={() => {
                                  const newRuns = [...estimate.runs!];
                                  newRuns[idx].gateDetails = newRuns[idx].gateDetails!.filter((_, i) => i !== gIdx);
                                  newRuns[idx].gates = newRuns[idx].gateDetails!.length;
                                  setEstimate({ ...estimate, runs: newRuns });
                                }}
                                className="p-2 text-american-red hover:bg-american-red/10 rounded-md transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                          {(!run.gateDetails || run.gateDetails.length === 0) && (
                            <div className="text-center py-4 text-[10px] font-bold text-[#BBBBBB] uppercase tracking-widest">
                              No gates added to this run
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!estimate.runs || estimate.runs.length === 0) && (
                    <div className="text-center py-12 border-4 border-dashed border-[#F0F0F0] rounded-[40px] bg-[#F9F9F9]/50">
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <Ruler className="text-[#CCCCCC]" size={24} />
                      </div>
                      <p className="text-sm font-bold text-[#999999] uppercase tracking-widest">Global Measurements Active</p>
                      <p className="text-[10px] text-[#BBBBBB] mt-1">Add runs for detailed run-based estimation</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-[40px] p-10 shadow-2xl border-2 border-american-blue/5 relative overflow-hidden">
              <div className="flex items-center gap-5 mb-10">
                <div className="h-16 w-16 rounded-3xl bg-american-blue flex items-center justify-center text-white shadow-xl shadow-american-blue/20">
                  <Palette size={32} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-american-blue tracking-tight uppercase">Style Selection</h2>
                  <p className="text-xs font-bold text-american-red uppercase tracking-widest">Choose Your American Standard</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 mb-10">
                {FENCE_STYLES.map(style => (
                  <button 
                    key={style.id} 
                    onClick={() => setEstimate({...estimate, styleId: style.id, visualStyleId: style.visualStyles[0].id})} 
                    className={cn(
                      "group relative px-6 py-3 rounded-full border-2 transition-all text-left overflow-hidden", 
                      estimate.styleId === style.id 
                        ? "border-american-blue bg-american-blue text-white shadow-lg shadow-american-blue/20" 
                        : "border-[#F5F5F5] bg-white hover:border-american-blue/20 text-american-blue"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black uppercase tracking-widest">{style.name}</p>
                      {estimate.styleId === style.id && (
                        <div className="w-3 h-3 bg-white american-star" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <PatrioticDivider />

              <div className="space-y-8">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-xl font-black text-american-blue uppercase tracking-tight">Visual Aesthetics</h3>
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="w-2 h-2 bg-american-red american-star opacity-20" />
                    ))}
                  </div>
                </div>
                <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2">
                  {selectedStyle.visualStyles.map(vs => (
                    <button 
                      key={vs.id} 
                      onClick={() => setEstimate({...estimate, visualStyleId: vs.id})} 
                      className={cn(
                        "group p-4 rounded-[32px] border-2 transition-all text-center relative overflow-hidden flex flex-col gap-4 items-center", 
                        estimate.visualStyleId === vs.id 
                          ? "border-american-red bg-american-red/5 shadow-xl" 
                          : "border-[#F0F0F0] bg-white hover:border-american-red/20 hover:shadow-lg"
                      )}
                    >
                      <div className="relative w-full aspect-video rounded-[24px] overflow-hidden border-2 border-white shadow-md">
                        <img src={vs.imageUrl} alt={vs.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" referrerPolicy="no-referrer" />
                        {estimate.visualStyleId === vs.id && (
                          <div className="absolute inset-0 bg-american-red/5 flex items-center justify-center">
                            <div className="w-12 h-12 bg-white/95 rounded-full flex items-center justify-center shadow-lg scale-100">
                              <CheckCircle2 className="text-american-red" size={24} />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="w-full pb-2">
                        <h4 className={cn("text-xl font-black transition-colors mb-1 tracking-tight uppercase", estimate.visualStyleId === vs.id ? "text-american-red" : "text-american-blue")}>
                          {vs.name}
                        </h4>
                        <p className="text-[10px] font-bold text-[#999999] uppercase tracking-[0.2em]">American Standard</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Wood Specific Options */}
                {selectedStyle.type === 'Wood' && (
                  <div className="mt-12 pt-10 border-t-2 border-dashed border-[#F0F0F0] space-y-10">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-american-blue/10 flex items-center justify-center text-american-blue">
                        <Trees size={20} />
                      </div>
                      <h3 className="text-xl font-black text-american-blue uppercase tracking-tight">Wood Specifications</h3>
                    </div>

                    <div className="grid gap-8 md:grid-cols-3">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Wood Species</label>
                        <div className="grid gap-2">
                          {['Pine', 'Western Cedar', 'Japanese Cedar'].map((type) => (
                            <button
                              key={type}
                              onClick={() => setEstimate({ ...estimate, woodType: type as any })}
                              className={cn(
                                "px-4 py-3 rounded-xl border-2 text-xs font-bold uppercase tracking-widest transition-all text-left",
                                estimate.woodType === type 
                                  ? "border-american-blue bg-american-blue text-white shadow-md" 
                                  : "border-[#F0F0F0] bg-[#F9F9F9] text-american-blue hover:border-american-blue/20"
                              )}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Picket Top Style</label>
                        <div className="grid gap-2">
                          {['Dog Ear', 'Flat Top'].map((style) => (
                            <button
                              key={style}
                              onClick={() => setEstimate({ ...estimate, topStyle: style as any })}
                              className={cn(
                                "px-4 py-3 rounded-xl border-2 text-xs font-bold uppercase tracking-widest transition-all text-left",
                                estimate.topStyle === style 
                                  ? "border-american-red bg-american-red text-white shadow-md" 
                                  : "border-[#F0F0F0] bg-[#F9F9F9] text-american-blue hover:border-american-red/20"
                              )}
                            >
                              {style}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Finish Option</label>
                        <button
                          onClick={() => setEstimate({ ...estimate, isPreStained: !estimate.isPreStained })}
                          className={cn(
                            "w-full p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 text-center",
                            estimate.isPreStained 
                              ? "border-american-blue bg-american-blue/5 shadow-inner" 
                              : "border-[#F0F0F0] bg-[#F9F9F9]"
                          )}
                        >
                          <div className={cn(
                            "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                            estimate.isPreStained ? "bg-american-blue text-white" : "bg-white text-american-blue/20"
                          )}>
                            <Droplets size={24} />
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase tracking-widest text-american-blue">Pre-Stained</p>
                            <p className="text-[9px] font-bold text-[#999999] uppercase mt-1">Factory Applied Finish</p>
                          </div>
                          <div className={cn(
                            "mt-2 h-6 w-12 rounded-full relative transition-all",
                            estimate.isPreStained ? "bg-american-blue" : "bg-[#E5E5E5]"
                          )}>
                            <div className={cn(
                              "absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                              estimate.isPreStained ? "right-1" : "left-1"
                            )} />
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-[40px] p-10 shadow-2xl border-2 border-american-blue/5 relative overflow-hidden">
              <div className="flex items-center gap-5 mb-10">
                <div className="h-16 w-16 rounded-3xl bg-american-blue flex items-center justify-center text-white shadow-xl shadow-american-blue/20">
                  <Box size={32} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-american-blue tracking-tight uppercase">Accessories & Hardware</h2>
                  <p className="text-xs font-bold text-american-red uppercase tracking-widest">The Finishing Touches of Quality</p>
                </div>
              </div>

              <div className="space-y-8">
                <div className="flex items-center gap-4 px-2">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-american-blue/10 to-transparent" />
                  <h3 className="text-sm font-black text-american-blue/40 uppercase tracking-[0.3em]">Post Cap Selection</h3>
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent via-american-blue/10 to-transparent" />
                </div>

                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {materials.filter(m => m.category === 'PostCap').map(cap => (
                    <button 
                      key={cap.id} 
                      onClick={() => setEstimate({...estimate, postCapId: cap.id})} 
                      className={cn(
                        "group p-5 rounded-[32px] border-2 transition-all text-center relative flex flex-col items-center gap-4", 
                        estimate.postCapId === cap.id 
                          ? "border-american-blue bg-american-blue/5 shadow-xl" 
                          : "border-[#F0F0F0] bg-white hover:border-american-blue/20 hover:shadow-lg"
                      )}
                    >
                      <div className="relative w-full aspect-square rounded-[24px] overflow-hidden border-2 border-white shadow-md bg-[#F9F9F9]">
                        <img src={cap.imageUrl} alt={cap.name} className="w-full h-full object-contain p-4 transition-transform duration-500 group-hover:scale-110" referrerPolicy="no-referrer" />
                        {estimate.postCapId === cap.id && (
                          <div className="absolute top-3 right-3 w-6 h-6 bg-american-blue american-star shadow-lg flex items-center justify-center">
                            <div className="w-3 h-3 bg-white american-star scale-50" />
                          </div>
                        )}
                      </div>
                      <div className="w-full pb-1">
                        <h4 className={cn("text-lg font-black leading-tight transition-colors mb-1 tracking-tight uppercase", estimate.postCapId === cap.id ? "text-american-blue" : "text-[#1A1A1A]")}>
                          {cap.name}
                        </h4>
                        <p className="text-[9px] font-bold text-[#999999] uppercase tracking-[0.2em]">Premium Component</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#F5F5F5] flex items-center justify-center text-[#1A1A1A]">
                <HardHat size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Demo & Site Prep</h2>
                <p className="text-sm text-[#666666]">Removal of old fence and line preparation.</p>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="p-6 rounded-2xl border border-[#E5E5E5] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">Demolition</h3>
                  <button onClick={() => setEstimate({...estimate, hasDemolition: !estimate.hasDemolition})} className={cn("h-6 w-12 rounded-full relative transition-all", estimate.hasDemolition ? "bg-american-red" : "bg-[#E5E5E5]")}>
                    <div className={cn("absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all", estimate.hasDemolition ? "right-1" : "left-1")} />
                  </button>
                </div>
                {estimate.hasDemolition && (
                  <div className="space-y-4 pt-4 border-t border-[#F5F5F5]">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[#666666]">Demo Type</label>
                      <select value={estimate.demoType} onChange={(e) => setEstimate({...estimate, demoType: e.target.value as any})} className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-2 text-sm">
                        <option value="Wood">Wood (18 lbs/LF)</option>
                        <option value="Chain Link">Chain Link (8 lbs/LF)</option>
                        <option value="Vinyl">Vinyl (12 lbs/LF)</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={estimate.removeConcreteFootings} onChange={(e) => setEstimate({...estimate, removeConcreteFootings: e.target.checked})} className="rounded border-[#E5E5E5]" />
                      <span className="text-sm">Remove Concrete Footings (225 lbs ea)</span>
                    </label>
                  </div>
                )}
              </div>
              <div className="p-6 rounded-2xl border border-[#E5E5E5] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">Site Prep</h3>
                  <button onClick={() => setEstimate({...estimate, hasSitePrep: !estimate.hasSitePrep})} className={cn("h-6 w-12 rounded-full relative transition-all", estimate.hasSitePrep ? "bg-american-red" : "bg-[#E5E5E5]")}>
                    <div className={cn("absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all", estimate.hasSitePrep ? "right-1" : "left-1")} />
                  </button>
                </div>
                {estimate.hasSitePrep && (
                  <div className="space-y-3 pt-4 border-t border-[#F5F5F5]">
                    {['Marking Paint & Stakes', 'Vegetation Clearing', 'Obstacle Removal'].map((opt, i) => (
                      <label key={i} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={i === 0 ? estimate.needsMarking : (i === 1 ? estimate.needsClearing : estimate.obstacleRemoval)} onChange={(e) => {
                          if (i === 0) setEstimate({...estimate, needsMarking: e.target.checked});
                          if (i === 1) setEstimate({...estimate, needsClearing: e.target.checked});
                          if (i === 2) setEstimate({...estimate, obstacleRemoval: e.target.checked});
                        }} className="rounded border-[#E5E5E5]" />
                        <span className="text-sm">{opt}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#F5F5F5] flex items-center justify-center text-[#1A1A1A]">
                <Layers size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Advanced Specs</h2>
                <p className="text-sm text-[#666666]">Waste, drainage, and finishing.</p>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-6">
                <div className="p-6 rounded-2xl border-2 border-american-blue/10 bg-white space-y-6">
                  <h3 className="text-sm font-black text-american-blue uppercase tracking-widest flex items-center gap-2">
                    <HardHat size={16} className="text-american-red" />
                    Manual Labor Rates
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-wider text-[#999999] ml-1 whitespace-nowrap">Labor per LF ($)</label>
                      <input 
                        type="number" 
                        value={estimate.manualLaborRatePerLF} 
                        onChange={(e) => setEstimate({...estimate, manualLaborRatePerLF: Number(e.target.value)})} 
                        className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue focus:bg-white outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-wider text-[#999999] ml-1 whitespace-nowrap">Labor per Gate ($)</label>
                      <input 
                        type="number" 
                        value={estimate.manualLaborRatePerGate} 
                        onChange={(e) => setEstimate({...estimate, manualLaborRatePerGate: Number(e.target.value)})} 
                        className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue focus:bg-white outline-none transition-all"
                      />
                    </div>
                  </div>
                  <p className="text-[9px] font-bold text-american-red/60 uppercase tracking-widest italic leading-relaxed">
                    * These rates will override the default style labor calculation.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Waste Allowance (%)</label>
                  <input type="range" min="0" max="25" step="1" value={estimate.wastePercentage} onChange={(e) => setEstimate({...estimate, wastePercentage: Number(e.target.value)})} className="w-full h-2 bg-[#F5F5F5] rounded-lg appearance-none cursor-pointer accent-american-blue" />
                  <div className="flex justify-between text-[10px] font-bold text-[#999999]">
                    <span>0%</span>
                    <span>{estimate.wastePercentage}%</span>
                    <span>25%</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={estimate.includeGravel} onChange={(e) => setEstimate({...estimate, includeGravel: e.target.checked})} className="rounded border-[#E5E5E5]" />
                    <span className="text-sm">Include Drainage Gravel (0.5 cu ft/hole)</span>
                  </label>
                  {selectedStyle.type === 'Wood' && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={estimate.includeStain} onChange={(e) => setEstimate({...estimate, includeStain: e.target.checked})} className="rounded border-[#E5E5E5]" />
                      <span className="text-sm">Include Sealant/Stain (1 gal / 175 sq ft)</span>
                    </label>
                  )}
                </div>
              </div>
              <div className="bg-american-blue rounded-2xl p-6 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <div className="american-star w-24 h-24 bg-white" />
                </div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-white/60 mb-4">Structural Specs</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-[#999999]">Footing</p>
                    <p className="text-sm font-bold">{estimate.footingType}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-[#999999]">Post Size</p>
                    <p className="text-sm font-bold">{estimate.postWidth}" x {estimate.postThickness}"</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 6:
        return (
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#F5F5F5] flex items-center justify-center text-[#1A1A1A]">
                <FileText size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Review & Customer</h2>
                <p className="text-sm text-[#666666]">Finalize details and send.</p>
              </div>
            </div>
            <div className="grid gap-4">
              <input type="text" placeholder="Customer Name" value={estimate.customerName} onChange={(e) => setEstimate({...estimate, customerName: e.target.value})} className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-3 text-sm focus:border-[#1A1A1A] focus:outline-none" />
              <input type="email" placeholder="Customer Email" value={estimate.customerEmail} onChange={(e) => setEstimate({...estimate, customerEmail: e.target.value})} className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-3 text-sm focus:border-[#1A1A1A] focus:outline-none" />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-12">
      {/* Left Column: Editor */}
      <div className="lg:col-span-7 space-y-8">
        {/* Navigation & View Toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-[#E5E5E5] shadow-sm overflow-x-auto no-scrollbar flex-1">
            {steps.map((s) => (
              <button 
                key={s.id}
                onClick={() => { setStep(s.id); setIsFullView(false); }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all shrink-0 text-xs font-bold uppercase tracking-wider",
                  !isFullView && step === s.id ? "bg-american-blue text-white shadow-md" : "text-[#999999] hover:bg-[#F5F5F5] hover:text-american-blue"
                )}
              >
                <s.icon size={14} />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            ))}
          </div>
          <button 
            onClick={() => setIsFullView(!isFullView)}
            className={cn(
              "flex items-center gap-2 px-6 py-3.5 rounded-2xl border font-bold text-xs uppercase tracking-wider transition-all shadow-sm",
              isFullView ? "bg-american-blue text-white border-american-blue" : "bg-white text-american-blue border-[#E5E5E5] hover:border-american-blue"
            )}
          >
            <Map size={16} />
            {isFullView ? "Wizard View" : "Full Review"}
          </button>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-sm border border-[#E5E5E5]">
          {isFullView ? (
            <div className="space-y-16">
              {steps.map(s => (
                <div key={s.id} className="scroll-mt-8">
                  {renderSection(s.id)}
                </div>
              ))}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                {renderSection(step)}
                
                <div className="mt-12 flex items-center justify-between pt-8 border-t border-[#E5E5E5]">
                  <button 
                    onClick={handleBack}
                    disabled={step === 1}
                    className="flex items-center gap-2 px-6 py-3 text-sm font-bold text-[#666666] hover:text-[#1A1A1A] disabled:opacity-0 transition-all"
                  >
                    <ChevronLeft size={18} />
                    Back
                  </button>
                  
                  {step < 6 ? (
                    <button 
                      onClick={handleNext}
                      className="flex items-center gap-2 rounded-xl bg-american-blue px-8 py-3 text-sm font-bold text-white hover:bg-american-blue/90 transition-all shadow-lg active:scale-95"
                    >
                      Next Step
                      <ChevronRight size={18} />
                    </button>
                  ) : (
                    <button 
                      onClick={handleSave}
                      className="flex items-center gap-2 rounded-xl bg-american-red px-8 py-3 text-sm font-bold text-white hover:bg-american-red/90 transition-all shadow-lg active:scale-95"
                    >
                      Generate & Send to CRM
                      <Send size={18} />
                    </button>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Right Column: Live Summary */}
      <div className="lg:col-span-5">
        <div className="sticky top-8 space-y-6">
          <section className="patriotic-gradient text-white rounded-3xl p-6 shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <div className="american-star w-32 h-32 bg-white" />
            </div>
            
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-white/60 mb-2">Estimated Total</h2>
            <div className="text-5xl font-bold tracking-tighter mb-8">
              {formatCurrency(results.total)}
            </div>

            <div className="space-y-4 border-t border-white/10 pt-6">
              <div className="flex justify-between text-sm">
                <span className="text-[#999999]">Materials Subtotal</span>
                <span className="font-mono">{formatCurrency(results.materialSubtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#999999]">Demolition Cost</span>
                <span className="font-mono">{formatCurrency(results.demoCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#999999]">Site Prep Cost</span>
                <span className="font-mono">{formatCurrency(results.sitePrepCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#999999]">Labor Cost</span>
                <span className="font-mono">{formatCurrency(results.laborCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#999999]">Markup ({estimate.markupPercentage}%)</span>
                <span className="font-mono">{formatCurrency(results.markup)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#999999]">Tax ({estimate.taxPercentage}%)</span>
                <span className="font-mono">{formatCurrency(results.tax)}</span>
              </div>

              {results.runBreakdown.length > 0 && (
                <div className="space-y-4 border-t border-white/10 pt-6 mt-6">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#999999]">Cost Per Run</h3>
                  {results.runBreakdown.map(run => (
                    <div key={run.id} className="flex justify-between text-sm">
                      <span className="text-[#999999]">{run.name}</span>
                      <span className="font-mono">{formatCurrency(run.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3">
              <button 
                onClick={() => setShowInvoice(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-xs font-bold text-white hover:bg-white/20 transition-colors border border-white/10"
              >
                <Download size={16} />
                Invoice
              </button>
              <button 
                onClick={() => setShowDiagram(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-xs font-bold text-white hover:bg-white/20 transition-colors border border-white/10"
              >
                <Map size={16} />
                Diagram
              </button>
            </div>

            {showSuccess && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute inset-x-0 bottom-0 bg-[#00FF00] p-4 text-[#1A1A1A] text-center font-bold flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={18} />
                Sent to GoHighLevel!
              </motion.div>
            )}
          </section>

          {/* Material Breakdown - Right Column */}
          <section className="bg-white rounded-3xl shadow-sm border border-[#E5E5E5] overflow-hidden flex flex-col max-h-[600px]">
            <div className="p-5 patriotic-gradient text-white relative overflow-hidden shrink-0">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <div className="american-star w-16 h-16 bg-white" />
              </div>
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-widest">Material Breakdown</h3>
                  <p className="text-[10px] text-white/70">Texas-Based Estimates</p>
                </div>
                <div className="px-3 py-1 bg-white/20 rounded-lg text-[10px] font-bold">
                  {results.items.length} Items
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {results.items.map((item, idx) => {
                const material = materials.find(m => m.name === item.name || item.name.startsWith(m.name));
                return (
                  <div key={idx} className="bg-[#F9F9F9] rounded-xl p-3 border border-[#E5E5E5] hover:border-american-blue transition-all group">
                    <div className="flex items-start gap-3">
                      {material?.imageUrl ? (
                        <div className="h-10 w-10 rounded-lg overflow-hidden bg-white border border-[#E5E5E5] shrink-0 shadow-sm">
                          <img src={material.imageUrl} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center text-[#999999] shrink-0 border border-[#E5E5E5] shadow-sm">
                          <Box size={16} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[8px] font-bold uppercase tracking-widest text-american-blue">{item.category}</span>
                          <span className="text-xs font-bold text-[#1A1A1A]">{formatCurrency(item.total)}</span>
                        </div>
                        <h4 className="text-[11px] font-bold text-[#1A1A1A] mb-2 line-clamp-1">{item.name}</h4>
                        
                        <div className="flex items-center gap-2">
                          <div className="flex-1 space-y-0.5">
                            <label className="text-[8px] font-bold uppercase tracking-wider text-[#999999]">Qty</label>
                            <input 
                              type="number" 
                              value={item.qty} 
                              onChange={(e) => {
                                const newQty = Number(e.target.value);
                                setEstimate({
                                  ...estimate,
                                  manualQuantities: {
                                    ...(estimate.manualQuantities || {}),
                                    [item.name]: newQty
                                  }
                                });
                              }}
                              className="w-full rounded-md border border-[#E5E5E5] bg-white px-2 py-1 text-[10px] font-bold focus:border-american-blue focus:outline-none"
                            />
                          </div>
                          <div className="flex-1 space-y-0.5">
                            <label className="text-[8px] font-bold uppercase tracking-wider text-[#999999]">Price</label>
                            <div className="relative">
                              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-[#999999]">$</span>
                              <input 
                                type="number" 
                                step="0.01"
                                value={item.unitCost} 
                                onChange={(e) => {
                                  const newPrice = Number(e.target.value);
                                  setEstimate({
                                    ...estimate,
                                    manualPrices: {
                                      ...(estimate.manualPrices || {}),
                                      [item.name]: newPrice
                                    }
                                  });
                                }}
                                className="w-full rounded-md border border-[#E5E5E5] bg-white pl-4 pr-2 py-1 text-[10px] font-bold focus:border-american-blue focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>

      {/* Invoice Modal */}
      <AnimatePresence>
        {showInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInvoice(false)}
              className="absolute inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-[#F5F5F5] flex items-center justify-between bg-american-blue text-white">
                <div className="flex items-center gap-3">
                  <FileText size={24} />
                  <h2 className="text-xl font-bold">Estimate Invoice</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => window.print()} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                    <Printer size={20} />
                  </button>
                  <button onClick={() => setShowInvoice(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-8 print:p-0">
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-6">
                    {COMPANY_INFO.logo && (
                      <img src={COMPANY_INFO.logo} alt="Logo" className="h-20 w-auto object-contain" referrerPolicy="no-referrer" />
                    )}
                    <div>
                      <h1 className="text-3xl font-black tracking-tighter text-american-blue uppercase">{COMPANY_INFO.name}</h1>
                      <p className="text-sm text-[#666666]">{COMPANY_INFO.address}</p>
                      <p className="text-sm text-[#666666]">{COMPANY_INFO.phone} | {COMPANY_INFO.email}</p>
                      <p className="text-sm text-american-blue font-bold">{COMPANY_INFO.website}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#999999]">Estimate Date</p>
                    <p className="text-lg font-bold">{new Date().toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 py-8 border-y border-[#F5F5F5]">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#999999] mb-2">Customer Details</p>
                    <p className="text-lg font-bold">{estimate.customerName || 'Valued Customer'}</p>
                    <p className="text-sm text-[#666666]">{estimate.customerEmail || 'No email provided'}</p>
                    {estimate.customerPhone && <p className="text-sm text-[#666666]">{estimate.customerPhone}</p>}
                    {estimate.customerAddress && <p className="text-sm text-[#666666]">{estimate.customerAddress}</p>}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#999999] mb-2">Project Scope</p>
                    <p className="text-sm font-bold">{selectedStyle.name} - {selectedVisualStyle.name}</p>
                    <p className="text-sm text-[#666666]">{results.lf} Linear Feet | {results.postCount} Posts | {results.gateCount} Gates</p>
                  </div>
                </div>

                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-american-blue/10">
                      <th className="py-4 text-xs font-bold uppercase tracking-wider text-[#999999]">Description</th>
                      <th className="py-4 text-xs font-bold uppercase tracking-wider text-[#999999] text-center">Qty</th>
                      <th className="py-4 text-xs font-bold uppercase tracking-wider text-[#999999] text-right">Unit Price</th>
                      <th className="py-4 text-xs font-bold uppercase tracking-wider text-[#999999] text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F5]">
                    {results.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-4">
                          <p className="font-bold text-sm">{item.name}</p>
                          <p className="text-[10px] text-[#999999] uppercase">{item.category}</p>
                        </td>
                        <td className="py-4 text-center text-sm">{item.qty}</td>
                        <td className="py-4 text-right text-sm font-mono">{formatCurrency(item.unitCost)}</td>
                        <td className="py-4 text-right text-sm font-bold font-mono">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex justify-end pt-8">
                  <div className="w-64 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#666666]">Subtotal</span>
                      <span className="font-mono">{formatCurrency(results.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#666666]">Tax ({estimate.taxPercentage}%)</span>
                      <span className="font-mono">{formatCurrency(results.tax)}</span>
                    </div>
                    <div className="flex justify-between pt-3 border-t-2 border-american-blue text-xl font-bold">
                      <span>Total</span>
                      <span className="text-american-blue">{formatCurrency(results.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-6 bg-[#F9F9F9] border-t border-[#F5F5F5] flex justify-between items-center">
                <p className="text-[10px] text-[#999999] font-bold uppercase tracking-widest">Generated by {COMPANY_INFO.name} Estimator</p>
                <button 
                  onClick={() => setShowInvoice(false)}
                  className="px-8 py-3 bg-american-blue text-white rounded-xl font-bold text-sm hover:bg-american-blue/90 transition-all"
                >
                  Close Preview
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Diagram Modal */}
      <AnimatePresence>
        {showDiagram && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDiagram(false)}
              className="absolute inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-[#F5F5F5] flex items-center justify-between bg-american-red text-white">
                <div className="flex items-center gap-3">
                  <Map size={24} />
                  <h2 className="text-xl font-bold">Fence Layout Diagram</h2>
                </div>
                <button onClick={() => setShowDiagram(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-8">
                <div className="aspect-video bg-[#F5F5F5] rounded-2xl border-2 border-dashed border-[#E5E5E5] relative overflow-hidden flex items-center justify-center">
                  {/* Simple SVG Diagram */}
                  <svg width="100%" height="100%" viewBox="0 0 800 450" className="max-w-full">
                    <defs>
                      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E0E0E0" strokeWidth="1"/>
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                    
                    {/* Render Runs */}
                    {(() => {
                      const runsData = estimate.runs && estimate.runs.length > 0 
                        ? estimate.runs 
                        : [{ id: 'default', linearFeet: estimate.linearFeet || 100, gates: estimate.gateCount || 0, name: 'Main Run', corners: 0 }];
                      
                      // 1. Calculate raw points based on directions
                      const rawPoints: [number, number][] = [[0, 0]];
                      let currentX = 0;
                      let currentY = 0;
                      const directions = [
                        [1, 0],   // Right
                        [0, 1],   // Down
                        [-1, 0],  // Left
                        [0, -1]   // Up
                      ];
                      
                      runsData.forEach((run, i) => {
                        const dir = directions[i % 4];
                        const length = Math.max(run.linearFeet, 1); // Prevent 0-length breaking
                        currentX += dir[0] * length;
                        currentY += dir[1] * length;
                        rawPoints.push([currentX, currentY]);
                      });
                      
                      // 2. Calculate bounding box
                      const xs = rawPoints.map(p => p[0]);
                      const ys = rawPoints.map(p => p[1]);
                      const minX = Math.min(...xs);
                      const maxX = Math.max(...xs);
                      const minY = Math.min(...ys);
                      const maxY = Math.max(...ys);
                      const rawWidth = maxX - minX;
                      const rawHeight = maxY - minY;
                      
                      // 3. Scale and offset to fit SVG viewBox (800x450)
                      const paddingX = 120;
                      const paddingY = 100;
                      const availWidth = 800 - paddingX * 2;
                      const availHeight = 450 - paddingY * 2;
                      
                      let scale = 1;
                      if (rawWidth > 0 && rawHeight > 0) {
                        scale = Math.min(availWidth / rawWidth, availHeight / rawHeight);
                      } else if (rawWidth > 0) {
                        scale = availWidth / rawWidth;
                      } else if (rawHeight > 0) {
                        scale = availHeight / rawHeight;
                      }
                      
                      // Cap scale to prevent tiny fences from looking gigantic
                      scale = Math.min(scale, 15);
                      
                      const scaledWidth = rawWidth * scale;
                      const scaledHeight = rawHeight * scale;
                      
                      const offsetX = paddingX + (availWidth - scaledWidth) / 2 - minX * scale;
                      const offsetY = paddingY + (availHeight - scaledHeight) / 2 - minY * scale;
                      
                      const scaledPoints = rawPoints.map(p => [
                        p[0] * scale + offsetX,
                        p[1] * scale + offsetY
                      ]);
                      
                      return (
                        <g>
                          {/* Draw lines */}
                          {scaledPoints.map((p, i) => {
                            if (i === scaledPoints.length - 1) return null;
                            const nextP = scaledPoints[i + 1];
                            const run = runsData[i];
                            const dirIndex = i % 4;
                            
                            const midX = p[0] + (nextP[0] - p[0]) / 2;
                            const midY = p[1] + (nextP[1] - p[1]) / 2;
                            
                            let textOffsetX = 0;
                            let textOffsetY = 0;
                            let textAnchor = "middle";
                            
                            if (dirIndex === 0) { // Right
                              textOffsetY = -15;
                            } else if (dirIndex === 1) { // Down
                              textOffsetX = 15;
                              textAnchor = "start";
                            } else if (dirIndex === 2) { // Left
                              textOffsetY = 20;
                            } else if (dirIndex === 3) { // Up
                              textOffsetX = -15;
                              textAnchor = "end";
                            }
                            
                            return (
                              <g key={`l-${i}`}>
                                <line x1={p[0]} y1={p[1]} x2={nextP[0]} y2={nextP[1]} stroke="#3C3B6E" strokeWidth="8" strokeLinecap="round" />
                                <text 
                                  x={midX + textOffsetX} 
                                  y={midY + textOffsetY} 
                                  textAnchor={textAnchor as any} 
                                  className="text-[12px] font-bold fill-american-blue"
                                >
                                  {run?.name} ({run?.linearFeet}')
                                </text>
                              </g>
                            );
                          })}
                          
                          {/* Draw Gates for each run */}
                          {runsData.map((run, rIdx) => {
                            const gatesToDraw = run.gateDetails || Array.from({ length: run.gates || 0 }).map((_, i) => ({ id: `old-${i}`, type: 'Single', width: 4 }));
                            if (gatesToDraw.length === 0) return null;
                            
                            const p1 = scaledPoints[rIdx];
                            const p2 = scaledPoints[rIdx + 1];
                            const dirIndex = rIdx % 4;
                            const isHorizontal = dirIndex % 2 === 0;
                            
                            return gatesToDraw.map((gate, gIdx) => {
                              const fraction = (gIdx + 1) / (gatesToDraw.length + 1);
                              const x = p1[0] + (p2[0] - p1[0]) * fraction;
                              const y = p1[1] + (p2[1] - p1[1]) * fraction;
                              
                              const gateLabel = `${gate.type === 'Double' ? 'DBL ' : ''}GATE (${gate.width}')`;
                              
                              return (
                                <g key={`g-${rIdx}-${gIdx}`} transform={`translate(${x}, ${y})`}>
                                  {isHorizontal ? (
                                    <>
                                      <rect x="-15" y="-6" width="30" height="12" fill="#F5F5F5" />
                                      <line x1="-15" y1="0" x2="15" y2="0" stroke="#B22234" strokeWidth="4" />
                                      <circle cx="-15" cy="0" r="8" fill="#B22234" />
                                      <circle cx="15" cy="0" r="8" fill="#B22234" />
                                      {gate.type === 'Double' && <circle cx="0" cy="0" r="4" fill="#B22234" />}
                                      <text y="20" textAnchor="middle" className="text-[10px] font-bold fill-american-red">{gateLabel}</text>
                                    </>
                                  ) : (
                                    <>
                                      <rect x="-6" y="-15" width="12" height="30" fill="#F5F5F5" />
                                      <line x1="0" y1="-15" x2="0" y2="15" stroke="#B22234" strokeWidth="4" />
                                      <circle cx="0" cy="-15" r="8" fill="#B22234" />
                                      <circle cx="0" cy="15" r="8" fill="#B22234" />
                                      {gate.type === 'Double' && <circle cx="0" cy="0" r="4" fill="#B22234" />}
                                      <text x="20" y="3" textAnchor="start" className="text-[10px] font-bold fill-american-red">{gateLabel}</text>
                                    </>
                                  )}
                                </g>
                              );
                            });
                          })}
                          
                          {/* Draw Posts (on top of lines and gates) */}
                          {scaledPoints.map((p, i) => {
                            const isStart = i === 0;
                            const isEnd = i === scaledPoints.length - 1;
                            const isCorner = !isStart && !isEnd;
                            
                            if (isCorner) {
                              return <rect key={`p-${i}`} x={p[0]-8} y={p[1]-8} width="16" height="16" fill="#3C3B6E" />;
                            } else {
                              return <circle key={`p-${i}`} cx={p[0]} cy={p[1]} r="8" fill="#B22234" />
                            }
                          })}
                        </g>
                      );
                    })()}
                  </svg>
                  
                  <div className="absolute bottom-6 left-6 flex gap-4">
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-[#E5E5E5] shadow-sm">
                      <div className="w-3 h-3 bg-american-red rounded-full" />
                      <span className="text-[10px] font-bold uppercase">End Post</span>
                    </div>
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-[#E5E5E5] shadow-sm">
                      <div className="w-3 h-3 bg-american-blue rounded-sm" />
                      <span className="text-[10px] font-bold uppercase">Corner Post</span>
                    </div>
                  </div>
                </div>

                <div className="mt-8 grid grid-cols-3 gap-6">
                  <div className="p-4 rounded-2xl bg-[#F9F9F9] border border-[#E5E5E5]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#999999] mb-1">Total Length</p>
                    <p className="text-xl font-bold">{results.lf} LF</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#F9F9F9] border border-[#E5E5E5]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#999999] mb-1">Total Posts</p>
                    <p className="text-xl font-bold">{results.postCount}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#F9F9F9] border border-[#E5E5E5]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#999999] mb-1">Total Gates</p>
                    <p className="text-xl font-bold">{results.gateCount}</p>
                  </div>
                </div>
              </div>
              
              <div className="p-6 bg-[#F9F9F9] border-t border-[#F5F5F5] flex justify-end gap-3">
                <button 
                  onClick={() => setShowDiagram(false)}
                  className="px-8 py-3 bg-american-blue text-white rounded-xl font-bold text-sm hover:bg-american-blue/90 transition-all"
                >
                  Close Diagram
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
