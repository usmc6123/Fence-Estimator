import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calculator, Plus, Trash2, Send, Download, CheckCircle2, 
  ChevronRight, ChevronLeft, Info, Ruler, Palette, Box, 
  Layers, HardHat, FileText, Map as MapIcon, X, Printer, Share2, Trees, Droplets,
  TrendingUp, RotateCcw, Package, Navigation
} from 'lucide-react';
import { FENCE_STYLES, COMPANY_INFO, DEFAULT_ESTIMATE } from '../constants';
import { MaterialItem, FenceStyle, Estimate, LaborRates, SavedEstimate } from '../types';
import { cn, formatCurrency, formatFeetInches } from '../lib/utils';
import { calculateDetailedTakeOff } from '../lib/calculations';
import SupplierOrderForm from './SupplierOrderForm';
import SiteMeasurement from './SiteMeasurement';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { setDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';

interface EstimatorProps {
  materials: MaterialItem[];
  laborRates: LaborRates;
  estimate: Partial<Estimate>;
  setEstimate: (estimate: Partial<Estimate>) => void;
  savedEstimates: SavedEstimate[];
  setSavedEstimates: React.Dispatch<React.SetStateAction<SavedEstimate[]>>;
  user: User | null;
  setActiveTab?: (tab: string) => void;
}

export default function Estimator({ 
  materials, 
  laborRates: globalLaborRates, 
  estimate, 
  setEstimate,
  savedEstimates,
  setSavedEstimates,
  user,
  setActiveTab
}: EstimatorProps) {
  const [step, setStep] = React.useState(() => {
    return Number(localStorage.getItem('fence_pro_estimator_step')) || 1;
  });

  React.useEffect(() => {
    localStorage.setItem('fence_pro_estimator_step', step.toString());
  }, [step]);

  const [isFullView, setIsFullView] = React.useState(false);
  const [showMap, setShowMap] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [showInvoice, setShowInvoice] = React.useState(false);
  const [showSupplierForm, setShowSupplierForm] = React.useState(false);
  const [showDiagram, setShowDiagram] = React.useState(false);
  const [leftTab, setLeftTab] = React.useState<'Dimensions' | 'Styles'>('Dimensions');

  const [showGhlSync, setShowGhlSync] = React.useState(false);

  const defaultStyle = FENCE_STYLES.find(s => s.id === estimate.defaultStyleId) || FENCE_STYLES[0];
  const defaultVisualStyle = defaultStyle.visualStyles.find(vs => vs.id === estimate.defaultVisualStyleId) || defaultStyle.visualStyles[0];

  const calculateCosts = () => {
    const detailedData = calculateDetailedTakeOff(estimate, materials, globalLaborRates);

    const markupFactor = 1 + (estimate.markupPercentage || 0) / 100;
    const taxFactor = (estimate.taxPercentage || 0) / 100;

    const runBreakdown = detailedData.runs.map(run => {
      const chargeTotal = ((run.fenceMaterialCost + run.fenceLaborCost) * markupFactor) + (run.fenceMaterialCost * taxFactor);
      const gateCharge = (run.gateMaterialCost + run.gateLaborCost) * markupFactor + (run.gateMaterialCost * taxFactor);
      const total = chargeTotal + gateCharge + (run.demoCharge * markupFactor);
      const fenceChargePerFoot = run.netLF > 0 ? chargeTotal / run.netLF : 0;

      return {
        id: run.runId,
        name: run.runName,
        total,
        netLF: run.netLF,
        fenceChargePerFoot,
        gateCharge,
        demoCharge: run.demoCharge * markupFactor,
        fenceCharge: chargeTotal
      };
    });

    const netLF = (estimate.runs && estimate.runs.length > 0)
      ? detailedData.runs.reduce((sum, r) => sum + r.netLF, 0)
      : (estimate.linearFeet || 0);

    const lf = (estimate.runs && estimate.runs.length > 0)
      ? detailedData.runs.reduce((sum, r) => sum + r.linearFeet, 0)
      : (estimate.linearFeet || 0);

    const manualFenceMaterial = detailedData.manualSummary
      .filter(i => i.category !== 'Labor' && i.category !== 'Demolition' && i.category !== 'SitePrep' && i.category !== 'Gate')
      .reduce((sum, i) => sum + i.total, 0);
    const manualFenceLabor = detailedData.manualSummary
      .filter(i => i.category === 'Labor')
      .reduce((sum, i) => sum + i.total, 0);

    const calculatedFenceMaterial = (estimate.runs && estimate.runs.length > 0)
      ? detailedData.runs.reduce((sum, r) => sum + r.fenceMaterialCost, 0)
      : detailedData.summary.filter(i => i.category !== 'Gate' && i.category !== 'Labor' && i.category !== 'Demolition' && i.category !== 'SitePrep').reduce((sum, i) => sum + i.total, 0);
    
    const calculatedFenceLabor = (estimate.runs && estimate.runs.length > 0)
      ? detailedData.runs.reduce((sum, r) => sum + r.fenceLaborCost, 0)
      : detailedData.summary.filter(i => i.category === 'Labor').reduce((sum, i) => sum + i.total, 0);

    const totalFenceMaterial = calculatedFenceMaterial + manualFenceMaterial;
    const totalFenceLabor = calculatedFenceLabor + manualFenceLabor;

    const totalFenceCharge = (totalFenceMaterial + totalFenceLabor) * markupFactor + (totalFenceMaterial * taxFactor);

    const gateCount = detailedData.runs.reduce((sum, r) => sum + r.gates.length, 0) || estimate.gateCount || 0;
    const postCount = detailedData.summary.filter(i => i.category === 'Structure' && i.name.toLowerCase().includes('post')).reduce((sum, i) => sum + i.qty, 0);

    return {
      items: detailedData.summary,
      materialSubtotal: detailedData.totals.material,
      laborCost: detailedData.totals.labor,
      demoCost: detailedData.totals.demo,
      sitePrepCost: detailedData.totals.prep,
      subtotal: detailedData.totals.subtotal,
      markup: detailedData.totals.markup,
      tax: detailedData.totals.tax,
      total: detailedData.totals.grandTotal,
      overallPricePerFoot: netLF > 0 ? totalFenceCharge / netLF : 0,
      runBreakdown,
      lf,
      netLF,
      postCount,
      gateCount
    };
  };

  const results = calculateCosts();

  const handleNext = () => setStep(s => Math.min(s + 1, 4));
  const handleBack = () => setStep(s => Math.max(s - 1, 1));

  const handleReset = () => {
    if (confirm('Are you sure you want to start a new estimate? This will clear all current data.')) {
      setEstimate(DEFAULT_ESTIMATE);
      setStep(1);
      setIsFullView(false);
      localStorage.removeItem('fence_pro_estimator_step');
    }
  };

  const handleSave = async () => {
    if (!user) {
      alert('Please log in to save estimates to the team cloud.');
      return;
    }

    // Determine the actual linear feet to save
    const actualLF = (estimate.runs && estimate.runs.length > 0)
      ? estimate.runs.reduce((sum, r) => sum + r.linearFeet, 0)
      : (estimate.linearFeet || 0);

    const now = new Date().toISOString();
    
    // Revision Logic
    const isExisting = !!estimate.id;
    const newId = isExisting ? estimate.id : `est-${Math.random().toString(36).substr(2, 9)}`;
    const newVersion = (estimate.version || 1) + (isExisting ? 1 : 0);
    const parentId = isExisting ? (estimate.parentId || estimate.id || null) : null;

    const estimateToSave = {
      ...estimate,
      linearFeet: actualLF,
      id: newId,
      parentId: parentId || null,
      version: newVersion,
      createdAt: estimate.createdAt || now,
      lastModified: now,
      status: 'active',
      userId: user.uid,
      companyId: 'lonestarfence'
    };

    // Remove any undefined fields that cause Firestore to crash
    Object.keys(estimateToSave).forEach(key => {
      if ((estimateToSave as any)[key] === undefined) {
        delete (estimateToSave as any)[key];
      }
    });

    try {
      await setDoc(doc(db, 'estimates', newId), estimateToSave);
      setShowSuccess(true);

      // GHL Webhook Integration
      try {
        const settingsDoc = await getDoc(doc(db, 'companySettings', 'main'));
        if (settingsDoc.exists()) {
          const settings = settingsDoc.data();
          if (settings.ghlWebhookUrl && settings.autoSyncEstimates) {
            const webhookBody = {
              customerName: estimateToSave.customerName || 'N/A',
              customerEmail: estimateToSave.customerEmail || 'N/A',
              customerPhone: estimateToSave.customerPhone || 'N/A',
              customerAddress: estimateToSave.customerAddress || 'N/A',
              projectScope: actualLF,
              fenceType: FENCE_STYLES.find(s => s.id === estimateToSave.defaultStyleId)?.name || 'Unknown',
              fenceHeight: estimateToSave.defaultHeight || 0,
              totalCost: results.total,
              materialCost: results.materialSubtotal,
              laborCost: results.laborCost,
              estimateId: newId,
              createdAt: now,
              lineItems: results.items.map(item => ({
                name: item.name,
                qty: item.qty,
                unit: item.unit,
                total: item.total,
                category: item.category
              }))
            };

            const response = await fetch(settings.ghlWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(webhookBody)
            });

            if (response.ok) {
              setShowGhlSync(true);
              setTimeout(() => setShowGhlSync(false), 3000);
            } else {
              console.warn("GHL Webhook returned non-2xx response:", response.status);
            }
          }
        }
      } catch (webhookError) {
        console.error("GHL Webhook failed to sync:", webhookError);
      }

      setTimeout(() => {
        setShowSuccess(false);
        setEstimate(JSON.parse(JSON.stringify(DEFAULT_ESTIMATE)));
        setStep(1);
        localStorage.removeItem('fence_pro_estimator_step');
        // Switch to dossiers tab if available
        if (setActiveTab) {
          setActiveTab('dossiers');
        }
      }, 1500);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `estimates/${newId}`);
    }
  };

  const steps = [
    { id: 1, label: 'Customer', icon: Share2 },
    { id: 2, label: 'Measurements & Styling', icon: Ruler },
    { id: 3, label: 'Add-ons & Specs', icon: HardHat },
    { id: 4, label: 'Review & Send', icon: Send },
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
                  <h3 className="text-xl font-black text-american-blue tracking-tight uppercase">Customer Dossier</h3>
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
          </div>
        );
      case 2: // Consolidated Style & Measurements
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Tab navigation for Step 2 */}
            <div className="flex bg-[#F0F0F0] p-1.5 rounded-2xl w-fit">
               {(['Dimensions', 'Styles'] as const).map(tab => (
                 <button
                   key={tab}
                   onClick={() => setLeftTab(tab)}
                   className={cn(
                     "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                     leftTab === tab ? "bg-white text-american-blue shadow-md" : "text-[#999999] hover:text-american-blue"
                   )}
                 >
                   {tab}
                 </button>
               ))}
            </div>

            {leftTab === 'Styles' && (
              <div className="bg-white rounded-[40px] p-10 shadow-2xl border-2 border-american-blue/5 relative overflow-hidden">
              <div className="flex items-center gap-5 mb-10">
                <div className="h-16 w-16 rounded-3xl bg-american-blue flex items-center justify-center text-white shadow-xl shadow-american-blue/20">
                  <Palette size={32} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-american-blue tracking-tight uppercase">Project Default Style</h2>
                  <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Baseline for new fence runs</p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Default Material</label>
                    <div className="flex flex-wrap gap-2">
                      {FENCE_STYLES.map(style => (
                        <button 
                          key={style.id} 
                          onClick={() => setEstimate({
                            ...estimate, 
                            defaultStyleId: style.id, 
                            defaultVisualStyleId: style.visualStyles[0].id,
                            defaultHeight: style.availableHeights[0],
                            defaultColor: style.availableColors[0]
                          })} 
                          className={cn(
                            "px-4 py-2 rounded-xl border-2 transition-all text-xs font-black uppercase tracking-widest", 
                            estimate.defaultStyleId === style.id 
                              ? "border-american-blue bg-american-blue text-white shadow-md" 
                              : "border-[#F5F5F5] bg-white hover:border-american-blue/20 text-american-blue"
                          )}
                        >
                          {style.name}
                        </button>
                      ))}
                    </div>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Default Color/Finish</label>
                    <select 
                      value={estimate.defaultColor}
                      onChange={(e) => setEstimate({...estimate, defaultColor: e.target.value})}
                      className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue outline-none"
                    >
                      {defaultStyle.availableColors.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Default Pattern</label>
                    <select 
                      value={estimate.defaultVisualStyleId}
                      onChange={(e) => setEstimate({...estimate, defaultVisualStyleId: e.target.value})}
                      className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue outline-none"
                    >
                      {defaultStyle.visualStyles.map(vs => (
                        <option key={vs.id} value={vs.id}>{vs.name}</option>
                      ))}
                    </select>
                 </div>

                 {defaultStyle.type === 'Wood' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Wood Species</label>
                         <select 
                           value={estimate.woodType}
                           onChange={(e) => setEstimate({...estimate, woodType: e.target.value as any})}
                           className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue outline-none"
                         >
                           <option value="PT Pine">PT Pine</option>
                           <option value="Western Red Cedar">Western Red Cedar</option>
                           <option value="Japanese Cedar">Japanese Cedar</option>
                         </select>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Style Type</label>
                         <select 
                           value={estimate.topStyle || 'Dog Ear'}
                           onChange={(e) => {
                              const newTopStyle = e.target.value as any;
                              setEstimate({
                                ...estimate, 
                                topStyle: newTopStyle,
                                hasCapAndTrim: newTopStyle === 'Flat Top' ? true : estimate.hasCapAndTrim
                              });
                            }}
                           className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue outline-none"
                         >
                           <option value="Dog Ear">Dog Ear</option>
                           <option value="Flat Top">Flat Top</option>
                         </select>
                      </div>
                    </div>
                  )}

                  {defaultStyle.type === 'Metal' && (
                    <>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Install Type</label>
                         <select 
                           value={estimate.ironInstallType}
                           onChange={(e) => setEstimate({...estimate, ironInstallType: e.target.value as any})}
                           className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue outline-none"
                         >
                           <option value="Bolt up">Bolt up</option>
                           <option value="Weld up">Weld up</option>
                         </select>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Rail Count</label>
                         <select 
                           value={estimate.ironRails}
                           onChange={(e) => setEstimate({...estimate, ironRails: e.target.value as any})}
                           className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue outline-none"
                         >
                           <option value="2 rail">2 rail</option>
                           <option value="3 rail">3 rail</option>
                         </select>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Top Finishing</label>
                         <select 
                           value={estimate.ironTop}
                           onChange={(e) => setEstimate({...estimate, ironTop: e.target.value as any})}
                           className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue outline-none"
                         >
                           <option value="Flat top">Flat top</option>
                           <option value="Pressed point top">Pressed point top</option>
                         </select>
                      </div>
                    </>
                  )}
               </div>

               <div className="mt-8 pt-6 border-t border-dashed border-american-blue/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-[10px] font-bold text-[#999999] uppercase italic">* New runs will inherit these settings.</p>
                  <button 
                    onClick={() => {
                      if (!estimate.runs) return;
                      const newRuns = estimate.runs.map(r => ({
                        ...r,
                        styleId: estimate.defaultStyleId!,
                        visualStyleId: estimate.defaultVisualStyleId!,
                        height: estimate.defaultHeight!,
                        color: estimate.defaultColor!,
                        woodType: estimate.woodType,
                        ironRails: estimate.ironRails,
                        ironTop: estimate.ironTop
                      }));
                      setEstimate({...estimate, runs: newRuns});
                    }}
                    className="text-[10px] font-black uppercase tracking-widest text-american-red hover:underline"
                  >
                    Apply selection to all existing runs
                  </button>
               </div>
            </div>
          )}

          {leftTab === 'Dimensions' && (
              <div className="bg-white rounded-3xl p-8 shadow-xl border-2 border-american-red/10 relative overflow-hidden">
              <div className="flex items-center gap-4 mb-8">
                <div className="h-14 w-14 rounded-2xl bg-american-red flex items-center justify-center text-white shadow-lg shadow-american-red/20">
                  <Ruler size={28} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-american-red tracking-tight uppercase">Strategic Layout</h2>
                  <p className="text-xs font-bold text-american-blue uppercase tracking-widest">Perimeter Specifications & Custom Runs</p>
                </div>
              </div>

              <div className="grid gap-8 md:grid-cols-3">
                <div className="space-y-3 relative">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Total Project Perimeter (LF)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={estimate.runs && estimate.runs.length > 0 ? results.lf : estimate.linearFeet} 
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
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Default Height</label>
                  <select 
                    value={estimate.defaultHeight} 
                    onChange={(e) => setEstimate({...estimate, defaultHeight: Number(e.target.value)})}
                    className="w-full rounded-2xl border-2 border-[#F0F0F0] bg-white px-6 py-4 text-sm font-black text-american-blue outline-none"
                  >
                    {defaultStyle.availableHeights.map(h => <option key={h} value={h}>{h} FT</option>)}
                  </select>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Global Access Gates</label>
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
                    <h3 className="text-lg font-black text-american-blue uppercase tracking-tight">Fence Sections</h3>
                    <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Mix & Match Styles per Run</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button 
                      onClick={() => setShowMap(true)}
                      className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-american-red/5 text-american-red text-xs font-black uppercase tracking-widest hover:bg-american-red/10 hover:scale-105 active:scale-95 transition-all border-2 border-american-red/10"
                    >
                      <MapIcon size={16} />
                      Measure from Map
                    </button>
                    <button 
                      onClick={() => {
                        const newRun = { 
                          id: Math.random().toString(36).substr(2, 9), 
                          name: `Run ${(estimate.runs?.length || 0) + 1}`, 
                          linearFeet: 0, 
                          corners: 0, 
                          gates: 0,
                          styleId: estimate.defaultStyleId!,
                          visualStyleId: estimate.defaultVisualStyleId!,
                          height: estimate.defaultHeight!,
                          color: estimate.defaultColor!,
                          isPreStained: estimate.isPreStained,
                          hasRotBoard: estimate.hasRotBoard
                        };
                        setEstimate({ ...estimate, runs: [...(estimate.runs || []), newRun] });
                      }}
                      className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-american-blue text-white text-xs font-black uppercase tracking-widest hover:bg-american-blue/90 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-american-blue/20"
                    >
                      <Plus size={16} />
                      Add Section
                    </button>
                  </div>
                </div>
                
                <div className="space-y-6">
                  {estimate.runs?.map((run, idx) => {
                    const runStyle = FENCE_STYLES.find(s => s.id === run.styleId) || FENCE_STYLES[0];
                    const isNewSection = idx === 0 || run.isStartOfNewSection;
                    
                    return (
                      <React.Fragment key={run.id}>
                        {isNewSection && (
                          <div className={cn(
                            "flex items-center gap-4 py-4",
                            idx > 0 && "mt-8"
                          )}>
                            <div className="h-[2px] flex-1 bg-american-blue/5" />
                            <div className="flex items-center gap-2">
                              <Layers size={14} className="text-american-blue" />
                              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-american-blue">Fence Line #{estimate.runs!.slice(0, idx + 1).filter(r => r.isStartOfNewSection || estimate.runs!.indexOf(r) === 0).length}</h3>
                            </div>
                            <div className="h-[2px] flex-1 bg-american-blue/5" />
                          </div>
                        )}
                        <div className="p-8 rounded-[32px] bg-[#F9F9FB] border-2 border-[#F0F0F0] shadow-sm hover:shadow-md transition-all relative group overflow-hidden">
                        <div className="flex flex-col lg:flex-row gap-8">
                          {/* Run Identifier & Length */}
                          <div className="lg:w-1/3 space-y-6">
                            <div className="flex items-center justify-between mb-2">
                              <span className="px-3 py-1 rounded-full bg-american-blue/10 text-american-blue text-[10px] font-black uppercase tracking-widest">Section {idx + 1}</span>
                              <div className="flex items-center gap-2">
                                {idx > 0 && (
                                  <button
                                    onClick={() => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].isStartOfNewSection = !newRuns[idx].isStartOfNewSection;
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className={cn(
                                      "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ring-1",
                                      run.isStartOfNewSection 
                                        ? "bg-emerald-600 text-white ring-emerald-500 shadow-sm" 
                                        : "bg-white text-american-blue ring-american-blue/20 hover:bg-american-blue/5"
                                    )}
                                    title={run.isStartOfNewSection ? "This run starts a separate section" : "This run is connected to the previous run"}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <Navigation size={10} className={run.isStartOfNewSection ? "" : "rotate-180"} />
                                      {run.isStartOfNewSection ? "New Line" : "Connected"}
                                    </div>
                                  </button>
                                )}
                                <button 
                                  onClick={() => {
                                    const newRuns = estimate.runs!.filter((_, i) => i !== idx);
                                    setEstimate({ ...estimate, runs: newRuns });
                                  }}
                                  className="text-american-red hover:bg-american-red/10 p-2 rounded-xl transition-all"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Run Name</label>
                                <input 
                                  type="text" 
                                  value={run.name} 
                                  onChange={(e) => {
                                    const newRuns = [...estimate.runs!];
                                    newRuns[idx].name = e.target.value;
                                    setEstimate({ ...estimate, runs: newRuns });
                                  }}
                                  className="w-full rounded-xl border-2 border-white bg-white px-4 py-3 text-sm font-bold focus:border-american-blue outline-none transition-all shadow-sm"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Length (LF)</label>
                                <div className="relative">
                                  <input 
                                    type="number" 
                                    value={run.linearFeet} 
                                    onChange={(e) => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].linearFeet = Number(e.target.value);
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className="w-full rounded-xl border-2 border-white bg-white px-4 py-3 text-sm font-bold focus:border-american-blue outline-none transition-all shadow-sm"
                                  />
                                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-[#BBBBBB]">FT</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Styling Overrides */}
                          <div className="flex-1 grid gap-4 grid-cols-2">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Material</label>
                              <select 
                                value={run.styleId}
                                onChange={(e) => {
                                  const newRuns = [...estimate.runs!];
                                  const newStyle = FENCE_STYLES.find(s => s.id === e.target.value)!;
                                  newRuns[idx].styleId = e.target.value;
                                  newRuns[idx].visualStyleId = newStyle.visualStyles[0].id;
                                  newRuns[idx].height = newStyle.availableHeights[0];
                                  newRuns[idx].color = newStyle.availableColors[0];
                                  setEstimate({ ...estimate, runs: newRuns });
                                }}
                                className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                              >
                                {FENCE_STYLES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Pattern</label>
                              <select 
                                value={run.visualStyleId}
                                onChange={(e) => {
                                  const newRuns = [...estimate.runs!];
                                  newRuns[idx].visualStyleId = e.target.value;
                                  setEstimate({ ...estimate, runs: newRuns });
                                }}
                                className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                              >
                                {runStyle.visualStyles.map(vs => <option key={vs.id} value={vs.id}>{vs.name}</option>)}
                              </select>
                            </div>

                            {runStyle.type === 'Wood' && (
                              <>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Wood Type</label>
                                  <select 
                                    value={run.woodType || estimate.woodType}
                                    onChange={(e) => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].woodType = e.target.value as any;
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                                  >
                                    <option value="PT Pine">PT Pine</option>
                                    <option value="Western Red Cedar">Western Red Cedar</option>
                                    <option value="Japanese Cedar">Japanese Cedar</option>
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Style</label>
                                  <select 
                                    value={run.topStyle || estimate.topStyle || 'Dog Ear'}
                                    onChange={(e) => {
                                      const newTopStyle = e.target.value as any;
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].topStyle = newTopStyle;
                                      setEstimate({ 
                                        ...estimate, 
                                        runs: newRuns,
                                        hasCapAndTrim: newTopStyle === 'Flat Top' ? true : estimate.hasCapAndTrim
                                      });
                                    }}
                                    className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                                  >
                                    <option value="Dog Ear">Dog Ear</option>
                                    <option value="Flat Top">Flat Top</option>
                                  </select>
                                </div>
                              </>
                            )}

                            {runStyle.type === 'Metal' && (
                              <>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Install</label>
                                  <select 
                                    value={run.ironInstallType || estimate.ironInstallType}
                                    onChange={(e) => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].ironInstallType = e.target.value as any;
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                                  >
                                    <option value="Bolt up">Bolt up</option>
                                    <option value="Weld up">Weld up</option>
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Rails</label>
                                  <select 
                                    value={run.ironRails || estimate.ironRails}
                                    onChange={(e) => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].ironRails = e.target.value as any;
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                                  >
                                    <option value="2 rail">2 rail</option>
                                    <option value="3 rail">3 rail</option>
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Top</label>
                                  <select 
                                    value={run.ironTop || estimate.ironTop}
                                    onChange={(e) => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].ironTop = e.target.value as any;
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                                  >
                                    <option value="Flat top">Flat top</option>
                                    <option value="Pressed point top">Pressed point top</option>
                                  </select>
                                </div>
                              </>
                            )}

                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Height</label>
                              <select 
                                value={run.height}
                                onChange={(e) => {
                                  const newRuns = [...estimate.runs!];
                                  newRuns[idx].height = Number(e.target.value);
                                  setEstimate({ ...estimate, runs: newRuns });
                                }}
                                className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                              >
                                {runStyle.availableHeights.map(h => <option key={h} value={h}>{h} FT</option>)}
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Color/Finish</label>
                              <select 
                                value={run.color || estimate.defaultColor}
                                onChange={(e) => {
                                  const newRuns = [...estimate.runs!];
                                  newRuns[idx].color = e.target.value;
                                  setEstimate({ ...estimate, runs: newRuns });
                                }}
                                className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                              >
                                {runStyle.availableColors.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div className="pt-6">
                              <button
                                onClick={() => {
                                  const newRuns = [...estimate.runs!];
                                  newRuns[idx].isExistingFence = !newRuns[idx].isExistingFence;
                                  setEstimate({ ...estimate, runs: newRuns });
                                }}
                                className={cn(
                                  "w-full px-3 py-2.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                  run.isExistingFence 
                                    ? "border-american-blue bg-american-blue text-white" 
                                    : "border-white bg-white text-[#BBBBBB]"
                                )}
                              >
                                {run.isExistingFence ? "Existing Fence Active" : "Existing Fence"}
                              </button>
                            </div>

                            {runStyle.type === 'Wood' && (
                              <>
                                <div className="pt-6">
                                  <button
                                    onClick={() => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].needsStain = !newRuns[idx].needsStain;
                                      if (newRuns[idx].needsStain && !newRuns[idx].stainSides) {
                                        newRuns[idx].stainSides = 'Both Sides';
                                      }
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className={cn(
                                      "w-full px-3 py-2.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                      run.needsStain 
                                        ? "border-emerald-600 bg-emerald-600 text-white" 
                                        : "border-white bg-white text-[#BBBBBB]"
                                    )}
                                  >
                                    <div className="flex items-center justify-center gap-2">
                                      <Droplets size={12} />
                                      {run.needsStain ? "Staining Active" : "Add Staining"}
                                    </div>
                                  </button>
                                </div>
                                <AnimatePresence>
                                  {run.needsStain && (
                                    <motion.div 
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: 'auto' }}
                                      exit={{ opacity: 0, height: 0 }}
                                      className="col-span-full pt-4"
                                    >
                                      <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-100 flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Stain Coverage</span>
                                        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-emerald-100">
                                          {(['One Side', 'Both Sides'] as const).map(sides => (
                                            <button 
                                              key={sides}
                                              onClick={() => {
                                                const newRuns = [...estimate.runs!];
                                                newRuns[idx].stainSides = sides;
                                                setEstimate({ ...estimate, runs: newRuns });
                                              }}
                                              className={cn(
                                                "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                                                run.stainSides === sides 
                                                  ? "bg-emerald-600 text-white" 
                                                  : "text-emerald-800/40 hover:text-emerald-800"
                                              )}
                                            >
                                              {sides}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                                <div className="pt-6">
                                  <button
                                    onClick={() => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].reusePosts = !newRuns[idx].reusePosts;
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className={cn(
                                      "w-full px-3 py-2.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                      run.reusePosts 
                                        ? "border-american-red bg-american-red text-white" 
                                        : "border-white bg-white text-[#BBBBBB]"
                                    )}
                                  >
                                    {run.reusePosts ? "Reusing Old Posts" : "Reuse Existing Posts"}
                                  </button>
                                </div>
                              </>
                            )}

                            {runStyle?.type !== 'Pipe' && (
                              <div className="pt-6">
                                <button
                                  onClick={() => {
                                    const newRuns = [...estimate.runs!];
                                    newRuns[idx].isPreStained = !newRuns[idx].isPreStained;
                                    setEstimate({ ...estimate, runs: newRuns });
                                  }}
                                  className={cn(
                                    "w-full px-3 py-2.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                    run.isPreStained 
                                      ? "border-american-blue bg-american-blue text-white" 
                                      : "border-white bg-white text-[#BBBBBB]"
                                  )}
                                >
                                  {run.isPreStained ? "Pre-Stained Active" : "Add Factory Finish"}
                                </button>
                              </div>
                            )}

                            <div className="pt-6">
                              <button
                                onClick={() => {
                                  const newRuns = [...estimate.runs!];
                                  newRuns[idx].hasDemolition = !newRuns[idx].hasDemolition;
                                  if (newRuns[idx].hasDemolition && !newRuns[idx].demoLinearFeet) {
                                    newRuns[idx].demoLinearFeet = run.linearFeet;
                                  }
                                  setEstimate({ ...estimate, runs: newRuns });
                                }}
                                className={cn(
                                  "w-full px-3 py-2.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                  run.hasDemolition 
                                    ? "border-american-red bg-american-red text-white" 
                                    : "border-white bg-white text-[#BBBBBB]"
                                )}
                              >
                                {run.hasDemolition ? "Demo Active" : "Add Demolition"}
                              </button>
                            </div>

                            {run.hasDemolition && (
                              <div className="col-span-full mt-4 p-4 rounded-2xl bg-american-red/5 border-2 border-american-red/10 space-y-4">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-american-red">Demolition Specs</h4>
                                  <div className="flex items-center gap-2">
                                     <span className="text-[10px] font-bold text-american-red/60 uppercase">Feet:</span>
                                     <input 
                                       type="number"
                                       value={run.demoLinearFeet}
                                       onChange={(e) => {
                                         const newRuns = [...estimate.runs!];
                                         newRuns[idx].demoLinearFeet = Number(e.target.value);
                                         setEstimate({ ...estimate, runs: newRuns });
                                       }}
                                       className="w-20 rounded-lg border-2 border-american-red/20 bg-white px-2 py-1 text-[10px] font-bold text-american-red outline-none"
                                     />
                                  </div>
                                </div>
                                <div className="flex gap-4">
                                  {(['Wood', 'Chain Link', 'Metal'] as const).map(type => (
                                    <button
                                      key={type}
                                      onClick={() => {
                                        const newRuns = [...estimate.runs!];
                                        newRuns[idx].demoType = type;
                                        setEstimate({ ...estimate, runs: newRuns });
                                      }}
                                      className={cn(
                                        "flex-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border-2 transition-all",
                                        (run.demoType || 'Wood') === type
                                          ? "bg-american-red text-white border-american-red"
                                          : "bg-white text-american-red border-american-red/10 hover:border-american-red/30"
                                      )}
                                    >
                                      {type}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Gates Section for this Run */}
                        <div className="mt-8 pt-6 border-t-2 border-dashed border-[#F0F0F0]">
                          <div className="flex items-center justify-between mb-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Access Gates</label>
                            <button
                              onClick={() => {
                                const newRuns = [...estimate.runs!];
                                if (!newRuns[idx].gateDetails) newRuns[idx].gateDetails = [];
                                newRuns[idx].gateDetails!.push({ 
                                  id: Math.random().toString(36).substr(2, 9), 
                                  type: 'Single', 
                                  width: 4,
                                  position: 0
                                });
                                newRuns[idx].gates = newRuns[idx].gateDetails!.length;
                                setEstimate({ ...estimate, runs: newRuns });
                              }}
                              className="text-[10px] font-black uppercase text-american-red hover:underline"
                            >
                              + Add Gate
                            </button>
                          </div>
                          
                          <div className="space-y-3">
                            {run.gateDetails?.map((gate, gIdx) => (
                              <div key={gate.id} className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-[#F0F0F0] shadow-sm">
                                <div className="flex items-center justify-between">
                                  <select 
                                    value={`${gate.type}-${gate.width}`}
                                    onChange={(e) => {
                                      const [gType, gWidth] = e.target.value.split('-');
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].gateDetails![gIdx].type = gType as 'Single' | 'Double';
                                      newRuns[idx].gateDetails![gIdx].width = Number(gWidth);
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className="bg-transparent text-[10px] font-black uppercase text-american-blue focus:outline-none cursor-pointer"
                                  >
                                    {runStyle.type === 'Pipe' ? (
                                      runStyle.availableWidths.map(w => (
                                        <option key={w} value={`Single-${w}`}>{w}' Single Gate</option>
                                      ))
                                    ) : (
                                      <>
                                        <option value="Single-4">4' Walk Gate</option>
                                        <option value="Double-12">Double 6' Drive Gate</option>
                                      </>
                                    )}
                                  </select>
                                  <button
                                    onClick={() => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].gateDetails = newRuns[idx].gateDetails!.filter((_, i) => i !== gIdx);
                                      newRuns[idx].gates = newRuns[idx].gateDetails!.length;
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className="text-[#CCCCCC] hover:text-american-red"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[8px] font-black uppercase text-[#BBBBBB]">
                                    <span>Location on Run</span>
                                    <span>{gate.position || 0} FT</span>
                                  </div>
                                  <input 
                                    type="range"
                                    min="0"
                                    max={Math.max(0, run.linearFeet - gate.width)}
                                    value={gate.position || 0}
                                    onChange={(e) => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].gateDetails![gIdx].position = Number(e.target.value);
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className="w-full h-1 bg-[#F5F5F5] rounded-lg appearance-none cursor-pointer accent-american-red"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                  {(!estimate.runs || estimate.runs.length === 0) && (
                    <div className="text-center py-12 border-4 border-dashed border-[#F0F0F0] rounded-[40px] bg-[#F9F9FB]/50">
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <Ruler className="text-[#CCCCCC]" size={24} />
                      </div>
                      <p className="text-sm font-bold text-[#999999] uppercase tracking-widest">Global measurements Active</p>
                      <p className="text-[10px] text-[#BBBBBB] mt-1 italic">Add sections to specify unique runs and styles</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}
          </div>
        );
      case 3:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#F5F5F5] flex items-center justify-center text-[#1A1A1A]">
                <HardHat size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Add-ons & Specs</h2>
                <p className="text-sm text-[#666666]">Demo, site prep, and technical specifics.</p>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
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
              <div className="p-6 rounded-2xl border border-[#E5E5E5] space-y-4">
                <div className="flex items-center justify-between font-bold">
                  <span>Waste Allowance (%): {estimate.wastePercentage}%</span>
                </div>
                <input type="range" min="0" max="25" step="1" value={estimate.wastePercentage} onChange={(e) => setEstimate({...estimate, wastePercentage: Number(e.target.value)})} className="w-full h-2 bg-[#F5F5F5] rounded-lg appearance-none cursor-pointer accent-american-blue" />
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-6">
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
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#999999]">Concrete Specification</label>
                    <div className="flex gap-2">
                      {(['Maximizer', 'Quickset'] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => setEstimate({ ...estimate, concreteType: type })}
                          className={cn(
                            "flex-1 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all",
                            (estimate.concreteType || 'Maximizer') === type
                              ? "bg-american-blue text-white border-american-blue shadow-lg"
                              : "bg-white text-american-blue border-[#F0F0F0] hover:border-american-blue/20"
                          )}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-[#BBBBBB] italic mt-1">
                      {estimate.concreteType === 'Quickset' ? '2.0 Bags per post' : '0.7 Bags per post'}
                    </p>
                  </div>
                  {defaultStyle.type === 'Wood' && (
                    <div className="space-y-3 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={estimate.includeStain} onChange={(e) => setEstimate({...estimate, includeStain: e.target.checked})} className="rounded border-[#E5E5E5]" />
                        <span className="text-sm">Include Sealant/Stain</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={estimate.hasCapAndTrim} onChange={(e) => setEstimate({...estimate, hasCapAndTrim: e.target.checked})} className="rounded border-[#E5E5E5]" />
                        <span className="text-sm">Top Trim (1x4)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={estimate.hasDoubleTrim} onChange={(e) => setEstimate({...estimate, hasDoubleTrim: e.target.checked})} className="rounded border-[#E5E5E5]" />
                        <span className="text-sm">Double Trim (1x2)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={estimate.hasTopCap} onChange={(e) => setEstimate({...estimate, hasTopCap: e.target.checked})} className="rounded border-[#E5E5E5]" />
                        <span className="text-sm">Top Cap (2x6)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={estimate.hasRotBoard} onChange={(e) => setEstimate({...estimate, hasRotBoard: e.target.checked})} className="rounded border-[#E5E5E5]" />
                        <span className="text-sm">Rot Board (2x6)</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-american-blue rounded-2xl p-6 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <div className="american-star w-24 h-24 bg-white" />
                </div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-white/60 mb-8">Financial Settings</h4>
                
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/60">
                      <label>Profit Markup</label>
                      <span>{estimate.markupPercentage}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      step="5" 
                      value={estimate.markupPercentage} 
                      onChange={(e) => setEstimate({...estimate, markupPercentage: Number(e.target.value)})} 
                      className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white" 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-white/60">
                      <label>Sales Tax (Materials Only)</label>
                      <span>{estimate.taxPercentage}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="15" 
                      step="0.125" 
                      value={estimate.taxPercentage} 
                      onChange={(e) => setEstimate({...estimate, taxPercentage: Number(e.target.value)})} 
                      className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white" 
                    />
                    <p className="text-[9px] text-white/40 italic">Applied only to hardware, structure, and infill costs.</p>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-white/60">Concrete Type</p>
                    <p className="text-sm font-bold">{estimate.concreteType || 'Maximizer'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-white/60">Post Size</p>
                    <p className="text-sm font-bold">
                      {defaultStyle.type === 'Wood' ? '2-3/8" Round' : `${estimate.postWidth}" x ${estimate.postThickness}"`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-american-blue flex items-center justify-center text-white shadow-lg shadow-american-blue/20">
                <Send size={28} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-american-blue tracking-tight uppercase">Ready to Finalize?</h2>
                <p className="text-xs font-bold text-american-red uppercase tracking-widest">Review your dossier and send to headquarters.</p>
              </div>
            </div>

            {/* Financial Controls */}
            <div className="bg-[#F8F9FA] rounded-[32px] p-8 border-2 border-[#E5E5E5] space-y-8">
              <div className="flex items-center justify-between flex-wrap gap-4 border-b border-[#E5E5E5] pb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-american-blue text-white flex items-center justify-center shadow-xl">
                    <TrendingUp size={24} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-american-blue">Financial Precision</h3>
                    <p className="text-[10px] font-bold text-[#999999]">Adjust global margins and tax logic</p>
                  </div>
                </div>
                <button 
                  onClick={() => setEstimate({ ...estimate, manualQuantities: {}, manualPrices: {}, markupPercentage: 20, wastePercentage: 0, taxPercentage: 8.25 })}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-american-blue/10 bg-white text-[10px] font-black uppercase tracking-widest text-[#999999] hover:bg-american-red hover:text-white hover:border-american-red transition-all shadow-sm"
                >
                  <RotateCcw size={14} />
                  Clear Overrides & Sync Library
                </button>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div className="space-y-1">
                      <label className="text-xs font-black uppercase tracking-widest text-american-blue">Profit Markup (Universal)</label>
                      <p className="text-[10px] text-[#999999] font-bold">Standard: 20%</p>
                    </div>
                    <span className="px-3 py-1.5 rounded-xl bg-american-red/10 text-american-red text-sm font-black min-w-[60px] text-center">{estimate.markupPercentage}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="100"
                    value={estimate.markupPercentage}
                    onChange={(e) => setEstimate({ ...estimate, markupPercentage: Number(e.target.value) })}
                    className="w-full accent-american-red h-2.5 bg-american-blue/10 rounded-full appearance-none cursor-pointer"
                  />
                </div>
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div className="space-y-1">
                      <label className="text-xs font-black uppercase tracking-widest text-american-blue">Sales Tax (Materials Only)</label>
                      <p className="text-[10px] text-[#999999] font-bold">Applied to hard goods only</p>
                    </div>
                    <span className="px-3 py-1.5 rounded-xl bg-american-blue/10 text-american-blue text-sm font-black min-w-[60px] text-center">{estimate.taxPercentage}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="15"
                    step="0.125"
                    value={estimate.taxPercentage}
                    onChange={(e) => setEstimate({ ...estimate, taxPercentage: Number(e.target.value) })}
                    className="w-full accent-american-blue h-2.5 bg-american-blue/10 rounded-full appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
            
            <div className="p-8 rounded-[40px] bg-american-blue text-white shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-10">
                 <div className="american-star w-32 h-32 bg-white" />
               </div>
               <div className="relative z-10 space-y-6">
                 <div>
                   <h3 className="text-sm font-black uppercase tracking-widest text-white/60 mb-2">Customer Summary</h3>
                   <div className="grid gap-2">
                     <p className="text-2xl font-black italic">"{estimate.customerName || 'No Name Provided'}"</p>
                     <p className="text-sm font-bold opacity-80">{estimate.customerEmail || 'No Email'}</p>
                     <p className="text-sm font-bold opacity-80">{estimate.customerPhone || 'No Phone'}</p>
                     <p className="text-xs font-bold opacity-60 mt-2">{estimate.customerAddress || 'No Address'}</p>
                   </div>
                 </div>
                 
                 <div className="pt-6 border-t border-white/10">
                   <h3 className="text-sm font-black uppercase tracking-widest text-white/60 mb-2">Project Scope</h3>
                   <p className="text-4xl font-black tracking-tighter">{results.lf} <span className="text-lg opacity-40">LF</span></p>
                   <p className="text-xs font-bold opacity-60 uppercase tracking-widest mt-1">
                      {estimate.runs && estimate.runs.length > 0 ? 'Multiple Sections' : `${defaultStyle.name} • ${estimate.defaultHeight}' Height`}
                    </p>
                 </div>
               </div>
            </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <button 
                  onClick={handleSave}
                  className="flex-1 flex items-center justify-center gap-3 px-8 py-5 rounded-2xl bg-american-red text-white text-sm font-black uppercase tracking-widest hover:bg-american-red/90 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-american-red/20 outline-none"
                >
                  <Send size={20} />
                  Submit Dossier
                </button>
                <button 
                  onClick={() => setShowInvoice(true)}
                  className="flex items-center justify-center gap-3 px-8 py-5 rounded-2xl bg-white border-4 border-american-blue text-american-blue text-sm font-black uppercase tracking-widest hover:bg-american-blue/5 hover:scale-[1.02] active:scale-[0.98] transition-all outline-none"
                >
                  <FileText size={20} />
                  Detailed View
                </button>
                <button 
                  onClick={() => setShowSupplierForm(true)}
                  className="flex items-center justify-center gap-3 px-8 py-5 rounded-2xl bg-white border-4 border-[#333333] text-[#333333] text-sm font-black uppercase tracking-widest hover:bg-[#333333]/5 hover:scale-[1.02] active:scale-[0.98] transition-all outline-none"
                >
                  <Package size={20} />
                  Order Form
                </button>
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
          <div className="flex items-center gap-2">
            <button 
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-3.5 rounded-2xl border bg-white text-american-red border-american-red/20 font-bold text-xs uppercase tracking-wider transition-all shadow-sm hover:bg-american-red/5"
              title="Clear all data and start new"
            >
              <RotateCcw size={16} />
              <span className="hidden md:inline">Start New</span>
            </button>
            <button 
              onClick={() => setIsFullView(!isFullView)}
              className={cn(
                "flex items-center gap-2 px-6 py-3.5 rounded-2xl border font-bold text-xs uppercase tracking-wider transition-all shadow-sm",
                isFullView ? "bg-american-blue text-white border-american-blue" : "bg-white text-american-blue border-[#E5E5E5] hover:border-american-blue"
              )}
            >
              <MapIcon size={16} />
              {isFullView ? "Wizard View" : "Full Review"}
            </button>
          </div>
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
                  
                  {step < 4 ? (
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
            <div className="text-5xl font-bold tracking-tighter mb-8 bg-clip-text">
              {formatCurrency(results.total)}
            </div>

            <div className="flex items-center gap-2 mb-8 -mt-6">
              <div className="px-3 py-1 rounded-lg bg-american-red text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-american-red/20">
                {formatCurrency(results.overallPricePerFoot)} / ft
              </div>
              <div className="flex flex-col">
                <span className="text-[8px] font-bold text-white/40 uppercase tracking-[0.2em] leading-none">Project</span>
                <span className="text-[10px] font-black text-white uppercase tracking-wider leading-none">Average Cost</span>
              </div>
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
                <span className="text-[#999999]">Markup (Profit)</span>
                <span className="font-mono">{formatCurrency(results.markup)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#999999]">Tax (Materials Only)</span>
                <span className="font-mono">{formatCurrency(results.tax)}</span>
              </div>
              
              <div className="flex justify-between pt-4 mt-4 border-t border-white/10 text-american-red font-black">
                <span className="text-[10px] uppercase tracking-widest">Overall Price Per Foot</span>
                <span className="text-lg tabular-nums">{formatCurrency(results.overallPricePerFoot)}/ft</span>
              </div>

              {results.runBreakdown.length > 0 && (
                <div className="space-y-6 border-t border-white/10 pt-6 mt-6">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#999999]">Cost Per Run Breakdown</h3>
                  {results.runBreakdown.map(run => (
                    <div key={run.id} className="space-y-2 p-3 rounded-xl bg-white/5 border border-white/5 order-1">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-white">{run.name}</span>
                        <span className="font-mono text-sm font-bold">{formatCurrency(run.total)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-white/40 uppercase tracking-wider">
                        <span>{run.netLF.toFixed(1)} LF @ {formatCurrency(run.fenceChargePerFoot)}/ft</span>
                        <div className="flex gap-3">
                          {run.gateCharge > 0 && <span>Gates: {formatCurrency(run.gateCharge)}</span>}
                          {run.demoCharge > 0 && <span className="text-american-red/60">Demo: {formatCurrency(run.demoCharge)}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 grid grid-cols-3 gap-3">
              <button 
                onClick={() => setShowInvoice(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-[10px] font-bold text-white hover:bg-white/20 transition-colors border border-white/10"
              >
                <Download size={14} />
                Invoice
              </button>
              <button 
                onClick={() => setShowSupplierForm(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-[10px] font-bold text-white hover:bg-white/20 transition-colors border border-white/10"
              >
                <Package size={14} />
                Order
              </button>
              <button 
                onClick={() => setShowDiagram(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-[10px] font-bold text-white hover:bg-white/20 transition-colors border border-white/10"
              >
                <MapIcon size={14} />
                Diagram
              </button>
            </div>

            {showMap && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 bg-american-blue/20 backdrop-blur-md">
                <div className="w-full h-full max-w-7xl bg-white rounded-[40px] shadow-2xl overflow-hidden border-8 border-white relative">
                  <SiteMeasurement 
                    estimate={estimate} 
                    setEstimate={setEstimate} 
                    onClose={() => setShowMap(false)} 
                  />
                </div>
              </div>
            )}

            <AnimatePresence>
              {showSuccess && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute inset-x-0 bottom-0 bg-[#00FF00] p-4 text-[#1A1A1A] text-center font-bold flex items-center justify-center gap-2 z-50 shadow-2xl"
                >
                  <CheckCircle2 size={18} />
                  Dossier Saved to Cloud!
                </motion.div>
              )}

              {showGhlSync && (
                <motion.div 
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 50 }}
                  className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-american-blue text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-3 shadow-2xl z-[100] border-2 border-white/20"
                >
                  <div className="h-6 w-6 rounded-lg bg-white/20 flex items-center justify-center">
                    <TrendingUp size={14} />
                  </div>
                  Synced to GHL CRM
                </motion.div>
              )}
            </AnimatePresence>
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
                <div className="flex items-center gap-2">
                  {(Object.keys(estimate.manualQuantities || {}).length > 0 || Object.keys(estimate.manualPrices || {}).length > 0) && (
                    <button 
                      onClick={() => setEstimate({ ...estimate, manualQuantities: {}, manualPrices: {} })}
                      className="px-2 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-[8px] font-black uppercase tracking-widest transition-colors flex items-center gap-1"
                    >
                      <Trash2 size={10} />
                      Reset Overrides
                    </button>
                  )}
                  <div className="px-3 py-1 bg-white/20 rounded-lg text-[10px] font-bold">
                    {results.items.length} Items
                  </div>
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
                          <div className="text-right">
                            <span className="text-[10px] font-bold text-[#1A1A1A] block">{formatCurrency(item.total)}</span>
                            <span className="text-[8px] text-[#999999] uppercase font-bold">Total Cost</span>
                          </div>
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
                            <label className="text-[8px] font-bold uppercase tracking-wider text-[#999999]">Raw Cost</label>
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

      {/* Supplier Order Form Modal */}
      <AnimatePresence>
        {showSupplierForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSupplierForm(false)}
              className="absolute inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl bg-[#F0F0F0] rounded-3xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col order-form-print-area"
            >
              <div className="p-6 border-b border-[#F5F5F5] flex items-center justify-between bg-american-blue text-white shadow-lg relative z-10">
                <div className="flex items-center gap-3">
                  <Package size={24} />
                  <h2 className="text-xl font-bold uppercase tracking-tight">Supplier Order Form</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      document.body.classList.add('printing-supplier-form');
                      window.print();
                      setTimeout(() => document.body.classList.remove('printing-supplier-form'), 500);
                    }} 
                    className="p-2 hover:bg-white/10 rounded-xl transition-all"
                  >
                    <Printer size={20} />
                  </button>
                  <button onClick={() => setShowSupplierForm(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto no-scrollbar">
                <SupplierOrderForm 
                  estimate={estimate}
                  materials={materials}
                  laborRates={globalLaborRates}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                    <p className="text-sm font-bold">
                      {(() => {
                        const styleNames = Array.from(new Set(estimate.runs?.map(r => FENCE_STYLES.find(s => s.id === r.styleId)?.name).filter(Boolean)));
                        if (styleNames.length === 0) return `${defaultStyle.name} - ${defaultVisualStyle.name}`;
                        if (styleNames.length === 1) return styleNames[0];
                        return "Multi-Style Project";
                      })()}
                    </p>
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
                      <span className="text-[#666666]">Markup ({estimate.markupPercentage}%)</span>
                      <span className="font-mono">{formatCurrency(results.markup)}</span>
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
                  <MapIcon size={24} />
                  <h2 className="text-xl font-bold">Fence Layout Diagram</h2>
                </div>
                <button onClick={() => setShowDiagram(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-8">
                <div id="print-area" className="aspect-[11/8.5] bg-[#F5F5F5] rounded-2xl border-2 border-dashed border-[#E5E5E5] relative overflow-hidden flex items-center justify-center">
                  {/* Simple SVG Diagram optimized for 8.5x11 printing */}
                  <svg width="100%" height="100%" viewBox="0 0 1100 850" className="max-w-full">
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
                        : [{ 
                            id: 'default', 
                            linearFeet: estimate.linearFeet || 100, 
                            gates: estimate.gateCount || 0, 
                            name: 'Main Run', 
                            corners: 0,
                            styleId: estimate.defaultStyleId!,
                            visualStyleId: estimate.defaultVisualStyleId!,
                            height: estimate.defaultHeight!,
                            color: estimate.defaultColor!
                          }];
                      
                      const maxSpacing = (defaultStyle.type === 'Wood' && (estimate.defaultHeight || 6) === 8) ? 6 : 8;
                      
                      // 1. Calculate raw points based on directions or map coordinates
                      const rawPoints: [number, number][] = [];
                      const hasMapPoints = runsData.some(r => r.points && r.points.length >= 2);

                      if (hasMapPoints) {
                        const firstPt = runsData.find(r => r.points && r.points.length >= 2)?.points![0];
                        if (firstPt) {
                          // We project lat/lng to a local Cartesian grid in FEET
                          // One degree of latitude is ~364,000 feet
                          // One degree of longitude is ~364,000 * cos(lat) feet
                          const latScale = 364000;
                          const lngScale = 364000 * Math.cos(firstPt.lat * Math.PI / 180);

                          rawPoints.push([0, 0]);
                          let currentLat = firstPt.lat;
                          let currentLng = firstPt.lng;

                          runsData.forEach((run, i) => {
                            if (run.points && run.points.length >= 2) {
                              const endPt = run.points[run.points.length - 1];
                              const dx = (endPt.lng - currentLng) * lngScale;
                              const dy = (endPt.lat - currentLat) * -latScale; // Y is down in SVG usually, but here we calculate relative
                              
                              const prevX = rawPoints[rawPoints.length - 1][0];
                              const prevY = rawPoints[rawPoints.length - 1][1];
                              
                              rawPoints.push([prevX + dx, prevY + dy]);
                              
                              currentLat = endPt.lat;
                              currentLng = endPt.lng;
                            } else {
                              // Fallback for runs without points? Just continue in a direction
                              const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
                              const dir = directions[i % 4];
                              const length = run.linearFeet || 0;
                              const prevX = rawPoints[rawPoints.length - 1][0];
                              const prevY = rawPoints[rawPoints.length - 1][1];
                              rawPoints.push([prevX + dir[0] * length, prevY + dir[1] * length]);
                            }
                          });
                        }
                      } else {
                        rawPoints.push([0, 0]);
                        let currentX = 0;
                        let currentY = 0;
                        const directions = [
                          [1, 0],   // Right
                          [0, 1],   // Down
                          [-1, 0],  // Left
                          [0, -1]   // Up
                        ];
                        
                        const isClosedFour = runsData.length === 4;

                        runsData.forEach((run, i) => {
                          if (isClosedFour && i === 3) {
                            currentX = 0;
                            currentY = 0;
                          } else {
                            const dir = directions[i % 4];
                            const length = Math.max(run.linearFeet, 1);
                            currentX += dir[0] * length;
                            currentY += dir[1] * length;
                          }
                          rawPoints.push([currentX, currentY]);
                        });
                      }
                      
                      // 2. Calculate bounding box
                      const xs = rawPoints.map(p => p[0]);
                      const ys = rawPoints.map(p => p[1]);
                      const minX = Math.min(...xs);
                      const maxX = Math.max(...xs);
                      const minY = Math.min(...ys);
                      const maxY = Math.max(...ys);
                      const rawWidth = maxX - minX;
                      const rawHeight = maxY - minY;
                      
                      // 3. Scale and offset to fit SVG viewBox (1100x850 - Landscape Letter)
                      // Internal padding to ensure labels (which are offset from lines) don't get cut off
                      const paddingX = 100;
                      const paddingY = 120;
                      const availWidth = 1100 - paddingX * 2;
                      const availHeight = 850 - paddingY * 2;
                      
                      let scale = 1;
                      if (rawWidth > 0 && rawHeight > 0) {
                        scale = Math.min(availWidth / rawWidth, availHeight / rawHeight);
                      } else if (rawWidth > 0) {
                        scale = availWidth / rawWidth;
                      } else if (rawHeight > 0) {
                        scale = availHeight / rawHeight;
                      }
                      
                      // Cap scale to prevent tiny fences from looking gigantic, but allow it to be larger for better fit
                      scale = Math.min(scale, 25);
                      
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
                            
                            const runStyle = FENCE_STYLES.find(s => s.id === run.styleId) || defaultStyle;
                            const runVisualStyle = runStyle.visualStyles.find(vs => vs.id === run.visualStyleId) || runStyle.visualStyles[0];

                            const runGateWidth = (run.gateDetails || []).reduce((sum: number, g: any) => sum + (g.width || 0), 0) || ((run.gates || 0) * 4);
                            const fenceLinearFeet = Math.max(0, run.linearFeet - runGateWidth);
                            const spacingLimit = (runStyle.type === 'Wood' && run.height === 8) ? 6 : 8;
                            const sections = Math.max(1, Math.ceil(fenceLinearFeet / spacingLimit));
                            const spacing = fenceLinearFeet / sections;
                            
                            const linePostsCoords = [];
                            for (let j = 1; j < sections; j++) {
                               const fraction = j / sections;
                               const currentDistanceLF = run.linearFeet * fraction;
                               
                               const isInsideGate = (run.gateDetails || []).some(g => {
                                 const start = g.position || 0;
                                 return currentDistanceLF > (start - 0.5) && currentDistanceLF < (start + g.width + 0.5);
                               });

                               if (!isInsideGate) {
                                 linePostsCoords.push([
                                   p[0] + (nextP[0] - p[0]) * fraction,
                                   p[1] + (nextP[1] - p[1]) * fraction
                                 ]);
                               }
                            }
                            
                            let textOffsetX = 0;
                            let textOffsetY = 0;
                            let textAnchor = "middle";
                            
                            if (dirIndex === 0) { // Right
                              textOffsetY = -80;
                            } else if (dirIndex === 1) { // Down
                              textOffsetX = 80;
                              textAnchor = "start";
                            } else if (dirIndex === 2) { // Left
                              textOffsetY = 95;
                            } else if (dirIndex === 3) { // Up
                              textOffsetX = -80;
                              textAnchor = "end";
                            }
                            
                            return (
                              <g key={`l-${i}`}>
                                <line x1={p[0]} y1={p[1]} x2={nextP[0]} y2={nextP[1]} stroke="#3C3B6E" strokeWidth="10" strokeLinecap="round" />
                                {linePostsCoords.map((pc, pIdx) => (
                                  <circle key={`lp-${i}-${pIdx}`} cx={pc[0]} cy={pc[1]} r="8" fill="#A5A5A5" stroke="#FFFFFF" strokeWidth="2" />
                                ))}
                                <text 
                                  x={midX + textOffsetX} 
                                  y={midY + textOffsetY} 
                                  textAnchor={textAnchor as any} 
                                  className="text-[16px] font-bold fill-american-blue"
                                  style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: '5px', strokeLinecap: 'round', strokeLinejoin: 'round' }}
                                >
                                  <tspan x={midX + textOffsetX} dy="0" className="text-[18px] font-black">{run?.name} ({run?.linearFeet}')</tspan>
                                  <tspan x={midX + textOffsetX} dy="20" className="text-[14px] fill-american-blue/80 font-bold">
                                    {runStyle.name}{runStyle.type === 'Wood' && ` (${run.woodType || estimate.woodType})`} - {runVisualStyle.name}
                                  </tspan>
                                  {runStyle.type === 'Metal' && (
                                    <tspan x={midX + textOffsetX} dy="18" className="text-[12px] fill-american-blue/60 font-medium italic">
                                      {run.ironRails || estimate.ironRails} | {run.ironTop || estimate.ironTop}
                                    </tspan>
                                  )}
                                  <tspan x={midX + textOffsetX} dy={runStyle.type === 'Metal' ? "18" : "18"} className="text-[12px] fill-american-red font-black uppercase tracking-tighter">{(run.height || estimate.defaultHeight)}' H | Spacing: {formatFeetInches(spacing)} OC</tspan>
                                </text>
                              </g>
                            );
                          })}
                          
                           {/* Draw Gates for each run */}
                           {runsData.map((run, rIdx) => {
                             const gatesToDraw = run.gateDetails || Array.from({ length: run.gates || 0 }).map((_, i) => ({ id: `old-${i}`, type: 'Single' as const, width: 4, position: (run.linearFeet - 4) / 2 }));
                             if (gatesToDraw.length === 0) return null;
                             
                             const p1 = scaledPoints[rIdx];
                             const p2 = scaledPoints[rIdx + 1];
                             const dirIndex = rIdx % 4;
                             const isHorizontal = dirIndex % 2 === 0;
                             
                             return gatesToDraw.map((gate, gIdx) => {
                               const gateCenterLF = (gate.position || 0) + (gate.width / 2);
                               const fraction = gateCenterLF / run.linearFeet;
                               const x = p1[0] + (p2[0] - p1[0]) * fraction;
                               const y = p1[1] + (p2[1] - p1[1]) * fraction;
                               
                               const visualWidth = gate.width * scale;
                               const halfWidth = visualWidth / 2;
                               
                               const gateLabel = `${gate.type === 'Double' ? 'DBL ' : ''}GATE (${gate.width}')`;
                               
                               return (
                                 <g key={`g-${rIdx}-${gIdx}`} transform={`translate(${x}, ${y})`}>
                                   {isHorizontal ? (
                                     <>
                                       <rect x={-halfWidth} y="-8" width={visualWidth} height="16" fill="#F5F5F5" />
                                       <line x1={-halfWidth} y1="0" x2={halfWidth} y2="0" stroke="#B22234" strokeWidth="5" />
                                       <circle cx={-halfWidth} cy="0" r="8" fill="#B22234" />
                                       <circle cx={halfWidth} cy="0" r="8" fill="#B22234" />
                                       {gate.type === 'Double' && <circle cx="0" cy="0" r="5" fill="#B22234" />}
                                       <text y="25" textAnchor="middle" className="text-[14px] font-bold fill-american-red" style={{ paintOrder: 'stroke', stroke: 'white' }}>{gateLabel}</text>
                                     </>
                                   ) : (
                                     <>
                                       <rect x="-8" y={-halfWidth} width="16" height={visualWidth} fill="#F5F5F5" />
                                       <line x1="0" y1={-halfWidth} x2="0" y2={halfWidth} stroke="#B22234" strokeWidth="5" />
                                       <circle cx="0" cy={-halfWidth} r="8" fill="#B22234" />
                                       <circle cx="0" cy={halfWidth} r="8" fill="#B22234" />
                                       {gate.type === 'Double' && <circle cx="0" cy="0" r="5" fill="#B22234" />}
                                       <text x="25" y="4" textAnchor="start" className="text-[14px] font-bold fill-american-red" style={{ paintOrder: 'stroke', stroke: 'white' }}>{gateLabel}</text>
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
                              return <rect key={`p-${i}`} x={p[0]-10} y={p[1]-10} width="20" height="20" fill="#3C3B6E" />;
                            } else {
                              return <circle key={`p-${i}`} cx={p[0]} cy={p[1]} r="10" fill="#B22234" />
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
                      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-[#E5E5E5] shadow-sm">
                        <div className="w-3 h-3 bg-[#A5A5A5] rounded-full border border-white" />
                        <span className="text-[10px] font-bold uppercase">Line Post</span>
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
              
              <div className="p-6 bg-[#F9F9F9] border-t border-[#F5F5F5] flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] text-american-red font-bold uppercase tracking-widest">Printing Issue?</p>
                  <p className="text-[9px] text-[#999999] max-w-[200px] leading-tight italic">
                    The browser blocks printing inside this preview window. Use the red button to open the app in a new tab where printing is enabled.
                  </p>
                </div>
                <div className="flex gap-3">
                  <a 
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 bg-white border-2 border-american-red text-american-red rounded-xl font-bold text-sm hover:bg-american-red/5 transition-all flex items-center gap-2 shadow-sm"
                  >
                    <Share2 size={18} />
                    Open in New Tab
                  </a>
                  <button 
                    onClick={() => {
                      document.body.classList.add('printing-diagram');
                      window.focus();
                      window.print();
                      // Remove class after a delay to revert for UI
                      setTimeout(() => {
                        document.body.classList.remove('printing-diagram');
                      }, 500);
                    }}
                    className="px-6 py-3 bg-white border-2 border-american-blue text-american-blue rounded-xl font-bold text-sm hover:bg-american-blue/5 transition-all flex items-center gap-2 shadow-sm"
                  >
                    <Printer size={18} />
                    Print Diagram
                  </button>
                  <button 
                    onClick={() => setShowDiagram(false)}
                    className="px-8 py-3 bg-american-blue text-white rounded-xl font-bold text-sm hover:bg-american-blue/90 transition-all shadow-md"
                  >
                    Close Diagram
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
