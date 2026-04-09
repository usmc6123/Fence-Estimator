import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calculator, Plus, Trash2, Send, Download, CheckCircle2, 
  ChevronRight, ChevronLeft, Info, Ruler, Palette, Box, 
  Layers, HardHat, FileText, Map
} from 'lucide-react';
import { FENCE_STYLES } from '../constants';
import { MaterialItem, FenceStyle, Estimate } from '../types';
import { cn, formatCurrency } from '../lib/utils';

interface EstimatorProps {
  materials: MaterialItem[];
}

export default function Estimator({ materials }: EstimatorProps) {
  const [step, setStep] = React.useState(1);
  const [estimate, setEstimate] = React.useState<Partial<Estimate>>({
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
    taxPercentage: 8,
    manualQuantities: {},
  });

  const [isFullView, setIsFullView] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);

  const selectedStyle = FENCE_STYLES.find(s => s.id === estimate.styleId) || FENCE_STYLES[0];
  const selectedVisualStyle = selectedStyle.visualStyles.find(vs => vs.id === estimate.visualStyleId) || selectedStyle.visualStyles[0];

  const calculateCosts = () => {
    const runs = estimate.runs || [];
    const hasRuns = runs.length > 0;
    
    const lf = hasRuns ? runs.reduce((sum, r) => sum + r.linearFeet, 0) : (estimate.linearFeet || 0);
    const corners = hasRuns ? runs.reduce((sum, r) => sum + r.corners, 0) : (estimate.corners || 0);
    const gates = hasRuns ? runs.reduce((sum, r) => sum + r.gates, 0) : (estimate.gateCount || 0);
    
    const logic = selectedStyle.calcLogic;
    const wasteFactor = 1 + (estimate.wastePercentage || 10) / 100;

    const rawItems: { name: string; qty: number; unitCost: number; total: number; category: string }[] = [];

    // 1. Posts
    const postCount = Math.ceil(lf * logic.postsPerLF) + 1 + corners + gates;
    const postMat = materials.find(m => m.category === 'Post' && m.id.startsWith(selectedStyle.type.toLowerCase().charAt(0))) || materials[0];
    const postQty = Math.ceil(postCount * wasteFactor);
    rawItems.push({ 
      name: `${postMat.name} (incl. waste)`, 
      qty: postQty, 
      unitCost: postMat.cost, 
      total: postQty * postMat.cost,
      category: 'Structure'
    });

    // 2. Main Panels/Pickets
    const panelCount = Math.ceil(lf / (estimate.width || 8));
    const visualStyleModifier = selectedVisualStyle.priceModifier;
    const panelMat = materials.find(m => (m.category === 'Panel' || m.category === 'Picket') && m.id.startsWith(selectedStyle.type.toLowerCase().charAt(0))) || materials[0];
    const panelQty = Math.ceil(panelCount * wasteFactor);
    rawItems.push({ 
      name: `${selectedVisualStyle.name} Panels (incl. waste)`, 
      qty: panelQty, 
      unitCost: panelMat.cost + visualStyleModifier, 
      total: panelQty * (panelMat.cost + visualStyleModifier),
      category: 'Infill'
    });

    // 3. Post Caps
    const capMat = materials.find(m => m.id === estimate.postCapId);
    if (capMat) {
      rawItems.push({ 
        name: `${capMat.name} Caps`, 
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
        name: `${gateMat.name} Gate Kit`, 
        qty: gates, 
        unitCost: gateMat.cost, 
        total: gates * gateMat.cost,
        category: 'Gate'
      });
    }

    // 5. Concrete & Gravel
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
      const gravelQty = postCount * 0.5 / 27; // 0.5 cu ft per hole, convert to cu yd
      rawItems.push({ 
        name: 'Drainage Gravel', 
        qty: Number(gravelQty.toFixed(2)), 
        unitCost: gravelMat.cost, 
        total: gravelQty * gravelMat.cost,
        category: 'Installation'
      });
    }

    // Apply manual overrides
    const items = rawItems.map(item => {
      const manualQty = estimate.manualQuantities?.[item.name];
      if (manualQty !== undefined) {
        return { ...item, qty: manualQty, total: manualQty * item.unitCost };
      }
      return item;
    });

    // 6. Demolition
    let demoCost = 0;
    if (estimate.hasDemolition) {
      const dLF = estimate.demoLinearFeet || lf;
      const weightPerLF = estimate.demoType === 'Wood' ? 18 : (estimate.demoType === 'Chain Link' ? 8 : 12);
      const fenceWeight = dLF * weightPerLF;
      const footingWeight = estimate.removeConcreteFootings ? (postCount * 225) : 0;
      const totalWeight = fenceWeight + footingWeight;
      
      const dumpsterMat = materials.find(m => m.id === 'd-dumpster')!;
      const haulingMat = materials.find(m => m.id === 'd-hauling')!;
      const bladeMat = materials.find(m => m.id === 'd-blade')!;
      
      const dumpstersNeeded = Math.ceil(totalWeight / 6000); // Assume 3 tons per dumpster
      const bladesNeeded = Math.ceil(dLF / 50);
      
      const dItems = [
        { name: 'Dumpster Fee', qty: dumpstersNeeded, unitCost: dumpsterMat.cost, total: dumpstersNeeded * dumpsterMat.cost, category: 'Demolition' },
        { name: 'Hauling Trips', qty: dumpstersNeeded, unitCost: haulingMat.cost, total: dumpstersNeeded * haulingMat.cost, category: 'Demolition' },
        { name: 'Demo Blades', qty: bladesNeeded, unitCost: bladeMat.cost, total: bladesNeeded * bladeMat.cost, category: 'Demolition' },
        { name: 'Demo Labor', qty: Math.ceil(dLF / 10), unitCost: 45, total: Math.ceil(dLF / 10) * 45, category: 'Demolition' }
      ];
      
      items.push(...dItems);
      demoCost = dItems.reduce((sum, i) => sum + i.total, 0);
    }

    // 7. Site Prep
    let sitePrepCost = 0;
    if (estimate.hasSitePrep) {
      if (estimate.needsMarking) {
        const markingMat = materials.find(m => m.id === 's-marking')!;
        items.push({ name: markingMat.name, qty: 1, unitCost: markingMat.cost, total: markingMat.cost, category: 'SitePrep' });
      }
      if (estimate.needsClearing) {
        const clearingMat = materials.find(m => m.id === 's-clearing')!;
        const clearingHours = Math.ceil(lf / 20);
        items.push({ name: 'Vegetation Clearing', qty: clearingHours, unitCost: clearingMat.cost, total: clearingHours * clearingMat.cost, category: 'SitePrep' });
      }
      sitePrepCost = items.filter(i => i.category === 'SitePrep').reduce((sum, i) => sum + i.total, 0);
    }

    // 8. Finishing
    if (estimate.includeStain && selectedStyle.type === 'Wood') {
      const stainMat = materials.find(m => m.id === 'f-stain')!;
      const sqFt = lf * (estimate.height || 6) * 2; // Two sides
      const gallons = Math.ceil(sqFt / 175);
      items.push({ name: 'Sealant/Stain', qty: gallons, unitCost: stainMat.cost, total: gallons * stainMat.cost, category: 'Finishing' });
    }

    const materialSubtotal = items.filter(i => i.category !== 'Labor' && i.category !== 'Demolition' && i.category !== 'SitePrep').reduce((sum, item) => sum + item.total, 0);
    const laborCost = lf * selectedStyle.baseLaborRate;
    const subtotal = materialSubtotal + laborCost + demoCost + sitePrepCost;
    const markup = subtotal * ((estimate.markupPercentage || 0) / 100);
    const tax = (subtotal + markup) * ((estimate.taxPercentage || 0) / 100);
    const total = subtotal + markup + tax;

    // Cost per run
    const runBreakdown = runs.map(run => {
      const runLF = run.linearFeet;
      const runCorners = run.corners;
      const runGates = run.gates;
      
      const runPostCount = Math.ceil(runLF * logic.postsPerLF) + 1 + runCorners + runGates;
      const runPanelCount = Math.ceil(runLF / (estimate.width || 8));
      
      const runMatCost = (runPostCount * postMat.cost) + (runPanelCount * (panelMat.cost + visualStyleModifier));
      const runLaborCost = runLF * selectedStyle.baseLaborRate;
      
      return {
        id: run.id,
        name: run.name,
        total: runMatCost + runLaborCost
      };
    });

    return { items, materialSubtotal, laborCost, demoCost, sitePrepCost, subtotal, markup, tax, total, runBreakdown };
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

  const renderSection = (sectionId: number) => {
    switch (sectionId) {
      case 1:
        return (
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#F5F5F5] flex items-center justify-center text-[#1A1A1A]">
                <Ruler size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Measurements</h2>
                <p className="text-sm text-[#666666]">Define the perimeter and layout.</p>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Perimeter (LF)</label>
                <input type="number" value={estimate.linearFeet} onChange={(e) => setEstimate({...estimate, linearFeet: Number(e.target.value)})} className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-3 text-lg font-bold focus:border-[#1A1A1A] focus:outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Corners</label>
                <input type="number" value={estimate.corners} onChange={(e) => setEstimate({...estimate, corners: Number(e.target.value)})} className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-3 text-lg font-bold focus:border-[#1A1A1A] focus:outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Gates</label>
                <input type="number" value={estimate.gateCount} onChange={(e) => setEstimate({...estimate, gateCount: Number(e.target.value)})} className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-3 text-lg font-bold focus:border-[#1A1A1A] focus:outline-none" />
              </div>
            </div>

            {/* Fence Runs Section */}
            <div className="pt-8 border-t border-[#F5F5F5] space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold">Fence Runs</h3>
                  <p className="text-xs text-[#666666]">Break down your project into specific sections for run-based costing.</p>
                </div>
                <button 
                  onClick={() => {
                    const newRun = { id: Math.random().toString(36).substr(2, 9), name: `Run ${(estimate.runs?.length || 0) + 1}`, linearFeet: 0, corners: 0, gates: 0 };
                    setEstimate({ ...estimate, runs: [...(estimate.runs || []), newRun] });
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1A1A1A] text-white text-xs font-bold hover:bg-[#333333] transition-all"
                >
                  <Plus size={14} />
                  Add Run
                </button>
              </div>
              
              <div className="space-y-4">
                {estimate.runs?.map((run, idx) => (
                  <div key={run.id} className="grid gap-4 md:grid-cols-5 items-end p-4 rounded-2xl bg-[#F9F9F9] border border-[#E5E5E5]">
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-[10px] font-bold uppercase text-[#999999]">Run Name</label>
                      <input 
                        type="text" 
                        value={run.name} 
                        onChange={(e) => {
                          const newRuns = [...estimate.runs!];
                          newRuns[idx].name = e.target.value;
                          setEstimate({ ...estimate, runs: newRuns });
                        }}
                        className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm focus:border-[#1A1A1A] focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-[#999999]">LF</label>
                      <input 
                        type="number" 
                        value={run.linearFeet} 
                        onChange={(e) => {
                          const newRuns = [...estimate.runs!];
                          newRuns[idx].linearFeet = Number(e.target.value);
                          setEstimate({ ...estimate, runs: newRuns });
                        }}
                        className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm focus:border-[#1A1A1A] focus:outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-[#999999]">Corners</label>
                      <input 
                        type="number" 
                        value={run.corners} 
                        onChange={(e) => {
                          const newRuns = [...estimate.runs!];
                          newRuns[idx].corners = Number(e.target.value);
                          setEstimate({ ...estimate, runs: newRuns });
                        }}
                        className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm focus:border-[#1A1A1A] focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 space-y-2">
                        <label className="text-[10px] font-bold uppercase text-[#999999]">Gates</label>
                        <input 
                          type="number" 
                          value={run.gates} 
                          onChange={(e) => {
                            const newRuns = [...estimate.runs!];
                            newRuns[idx].gates = Number(e.target.value);
                            setEstimate({ ...estimate, runs: newRuns });
                          }}
                          className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-sm focus:border-[#1A1A1A] focus:outline-none"
                        />
                      </div>
                      <button 
                        onClick={() => {
                          const newRuns = estimate.runs!.filter((_, i) => i !== idx);
                          setEstimate({ ...estimate, runs: newRuns });
                        }}
                        className="p-2 text-[#FF4D4D] hover:bg-[#FF4D4D]/10 rounded-lg transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
                {(!estimate.runs || estimate.runs.length === 0) && (
                  <div className="text-center py-8 border-2 border-dashed border-[#E5E5E5] rounded-2xl">
                    <p className="text-sm text-[#999999]">No fence runs added. Using global measurements above.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#F5F5F5] flex items-center justify-center text-[#1A1A1A]">
                <Palette size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Style & Options</h2>
                <p className="text-sm text-[#666666]">Select material and visual style.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              {FENCE_STYLES.map(style => (
                <button key={style.id} onClick={() => setEstimate({...estimate, styleId: style.id, visualStyleId: style.visualStyles[0].id})} className={cn("p-4 rounded-2xl border transition-all text-left", estimate.styleId === style.id ? "border-[#1A1A1A] bg-[#F9F9F9]" : "border-[#E5E5E5] hover:border-[#1A1A1A]")}>
                  <p className="text-sm font-bold">{style.name}</p>
                  <p className="text-[10px] text-[#666666]">{style.type}</p>
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              {selectedStyle.visualStyles.map(vs => (
                <button key={vs.id} onClick={() => setEstimate({...estimate, visualStyleId: vs.id})} className={cn("p-3 rounded-2xl border transition-all text-center", estimate.visualStyleId === vs.id ? "border-[#1A1A1A] bg-[#F9F9F9]" : "border-[#E5E5E5] hover:border-[#1A1A1A]")}>
                  <img src={vs.imageUrl} alt={vs.name} className="w-full aspect-video object-cover rounded-lg mb-2" referrerPolicy="no-referrer" />
                  <p className="text-xs font-bold">{vs.name}</p>
                </button>
              ))}
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#F5F5F5] flex items-center justify-center text-[#1A1A1A]">
                <Box size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Accessories</h2>
                <p className="text-sm text-[#666666]">Caps and gate hardware.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 md:grid-cols-5">
              {materials.filter(m => m.category === 'PostCap').map(cap => (
                <button key={cap.id} onClick={() => setEstimate({...estimate, postCapId: cap.id})} className={cn("p-3 rounded-2xl border transition-all text-center", estimate.postCapId === cap.id ? "border-[#1A1A1A] bg-[#F9F9F9]" : "border-[#E5E5E5] hover:border-[#1A1A1A]")}>
                  <img src={cap.imageUrl} alt={cap.name} className="w-full aspect-square object-cover rounded-lg mb-2" referrerPolicy="no-referrer" />
                  <p className="text-[10px] font-bold">{cap.name}</p>
                </button>
              ))}
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
                  <button onClick={() => setEstimate({...estimate, hasDemolition: !estimate.hasDemolition})} className={cn("h-6 w-12 rounded-full relative transition-all", estimate.hasDemolition ? "bg-[#1A1A1A]" : "bg-[#E5E5E5]")}>
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
                  <button onClick={() => setEstimate({...estimate, hasSitePrep: !estimate.hasSitePrep})} className={cn("h-6 w-12 rounded-full relative transition-all", estimate.hasSitePrep ? "bg-[#1A1A1A]" : "bg-[#E5E5E5]")}>
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
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Waste Allowance (%)</label>
                  <input type="range" min="0" max="25" step="1" value={estimate.wastePercentage} onChange={(e) => setEstimate({...estimate, wastePercentage: Number(e.target.value)})} className="w-full h-2 bg-[#F5F5F5] rounded-lg appearance-none cursor-pointer accent-[#1A1A1A]" />
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
              <div className="bg-[#1A1A1A] rounded-2xl p-6 text-white">
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#999999] mb-4">Structural Specs</h4>
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
    <div className="grid gap-8 lg:grid-cols-12">
      {/* Left Column: Editor */}
      <div className="lg:col-span-8 space-y-8">
        {/* Navigation & View Toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-[#E5E5E5] shadow-sm overflow-x-auto no-scrollbar flex-1">
            {steps.map((s) => (
              <button 
                key={s.id}
                onClick={() => { setStep(s.id); setIsFullView(false); }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all shrink-0 text-xs font-bold uppercase tracking-wider",
                  !isFullView && step === s.id ? "bg-[#1A1A1A] text-white shadow-md" : "text-[#999999] hover:bg-[#F5F5F5]"
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
              isFullView ? "bg-[#1A1A1A] text-white border-[#1A1A1A]" : "bg-white text-[#1A1A1A] border-[#E5E5E5] hover:border-[#1A1A1A]"
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
                      className="flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-8 py-3 text-sm font-bold text-white hover:bg-[#333333] transition-all shadow-lg active:scale-95"
                    >
                      Next Step
                      <ChevronRight size={18} />
                    </button>
                  ) : (
                    <button 
                      onClick={handleSave}
                      className="flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-8 py-3 text-sm font-bold text-white hover:bg-[#333333] transition-all shadow-lg active:scale-95"
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
      <div className="lg:col-span-4">
        <div className="sticky top-8 space-y-6">
          <section className="bg-[#1A1A1A] text-white rounded-3xl p-8 shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Calculator size={120} />
            </div>
            
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[#999999] mb-2">Estimated Total</h2>
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
              <button className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-xs font-bold text-white hover:bg-white/20 transition-colors border border-white/10">
                <Download size={16} />
                Invoice
              </button>
              <button className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-xs font-bold text-white hover:bg-white/20 transition-colors border border-white/10">
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

          <section className="bg-white rounded-3xl p-8 shadow-sm border border-[#E5E5E5]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#666666] mb-6">Material Breakdown</h3>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {results.items.map((item, idx) => {
                const material = materials.find(m => m.name === item.name || item.name.startsWith(m.name));
                return (
                  <div key={idx} className="flex items-center justify-between group gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      {material?.imageUrl ? (
                        <div className="h-12 w-12 rounded-lg overflow-hidden bg-[#F9F9F9] border border-[#E5E5E5] shrink-0">
                          <img src={material.imageUrl} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-[#F5F5F5] flex items-center justify-center text-[#999999] shrink-0">
                          <Box size={20} />
                        </div>
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-[#1A1A1A] truncate">{item.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#999999] uppercase tracking-wider">Qty:</span>
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
                            className="w-16 rounded border border-[#E5E5E5] bg-[#F9F9F9] px-1 py-0.5 text-[10px] font-bold focus:border-[#1A1A1A] focus:outline-none"
                          />
                          <span className="text-[10px] text-[#999999] uppercase tracking-wider">× {formatCurrency(item.unitCost)}</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-mono font-medium shrink-0">{formatCurrency(item.total)}</span>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-8 p-4 rounded-2xl bg-orange-50 border border-orange-100 flex items-start gap-3">
              <HardHat size={16} className="text-orange-600 mt-0.5" />
              <p className="text-[10px] text-orange-800 leading-relaxed">
                <strong>Pro Tip:</strong> Don't forget to check for underground utilities before digging. Call 811 at least 48 hours before starting.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
