import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Printer, FileText, Sparkles, Loader2, Download, Send, CheckCircle2, Navigation } from 'lucide-react';
import { Estimate, MaterialItem, LaborRates, SupplierQuote } from '../types';
import { calculateDetailedTakeOff, DetailedTakeOff } from '../lib/calculations';
import { cn, formatCurrency } from '../lib/utils';
import { COMPANY_INFO, FENCE_STYLES } from '../constants';
import { generateAIScope } from '../services/geminiService';

interface CustomerContractProps {
  estimate: Partial<Estimate>;
  materials: MaterialItem[];
  laborRates: LaborRates;
  quotes: SupplierQuote[];
  aiContractScope: string | null;
  setAiContractScope: (scope: string | null) => void;
}

export default function CustomerContract({ 
  estimate, 
  materials, 
  laborRates,
  quotes,
  aiContractScope,
  setAiContractScope
}: CustomerContractProps) {
  // Resolve materials based on chosen strategy
  const pricingStrategy = estimate.pricingStrategy || 'best';
  const selectedSupplier = estimate.selectedSupplier || '';

  let resolvedMaterials = materials;
  if (pricingStrategy === 'supplier' && selectedSupplier) {
    const supplierQuotes = quotes
      .filter(q => q.supplierName === selectedSupplier)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    resolvedMaterials = materials.map(m => {
      let quotedPrice: number | undefined;
      for (const quote of supplierQuotes) {
        const item = quote.items.find(i => i.mappedMaterialId === m.id);
        if (item) {
          quotedPrice = item.unitPrice;
          break;
        }
      }

      if (quotedPrice !== undefined) {
        return { ...m, cost: quotedPrice };
      }
      return m;
    });
  }

  const data: DetailedTakeOff = calculateDetailedTakeOff(estimate, resolvedMaterials, laborRates);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const markupFactor = 1 + (estimate.markupPercentage || 0) / 100;
  const taxFactor = (estimate.taxPercentage || 0) / 100;

  // Calculate project financial breakdown for customer view
  const projectBreakdown = data.runs.map(run => {
    // Fence Charge = Base Labor + Base Materials + Markup + Tax on Materials
    const baseFenceCharge = (run.fenceMaterialCost + run.fenceLaborCost) * markupFactor;
    const fenceTax = run.fenceMaterialCost * taxFactor;
    const totalFenceCharge = baseFenceCharge + fenceTax;
    
    // Gate Charge
    const baseGateCharge = (run.gateMaterialCost + run.gateLaborCost) * markupFactor;
    const gateTax = run.gateMaterialCost * taxFactor;
    const totalGateCharge = baseGateCharge + gateTax;

    // Demo Charge
    const demoCharge = run.demoCharge * markupFactor;

    return {
      name: run.runName,
      netLF: run.netLF,
      totalFenceCharge,
      pricePerFoot: run.netLF > 0 ? totalFenceCharge / run.netLF : 0,
      totalGateCharge,
      demoCharge,
      gates: run.gates,
      style: run.styleName,
      height: run.height,
      hasRotBoard: run.hasRotBoard,
      hasTopCap: run.hasTopCap,
      hasTrim: run.hasTrim,
      picketStyle: run.picketStyle
    };
  });

  // Check if all runs are homogenous (same specs)
  const isHomogeneous = projectBreakdown.length > 1 && projectBreakdown.every(r => {
    const isWood = r.style.includes('Wood') || r.style.includes('Cedar') || r.style.includes('Pine');
    return r.style === projectBreakdown[0].style && 
      r.height === projectBreakdown[0].height &&
      (!isWood || (
        r.hasRotBoard === projectBreakdown[0].hasRotBoard &&
        r.hasTopCap === projectBreakdown[0].hasTopCap &&
        r.hasTrim === projectBreakdown[0].hasTrim &&
        r.picketStyle === projectBreakdown[0].picketStyle
      ));
  });

  const totalFenceCharge = projectBreakdown.reduce((sum, r) => sum + r.totalFenceCharge, 0);
  const totalNetLF = projectBreakdown.reduce((sum, r) => sum + r.netLF, 0);
  const grandTotal = data.totals.grandTotal;
  const globalPricePerFoot = totalNetLF > 0 ? totalFenceCharge / totalNetLF : 0;

  const handlePrint = () => {
    window.print();
  };

  const handleGenerateAIScope = async () => {
    setIsGenerating(true);
    try {
      const prompt = `
        You are a professional estimator for Lone Star Fence Works, a premium fence contractor in Texas. 
        Your tone is professional, confident, and direct. No fluff. 
        Generate a detailed, contractor-grade Scope of Work that protects the contractor legally.
        
        Customer: ${estimate.customerName || 'Valued Customer'}
        Project Type: ${estimate.projectType || 'Installation'}
        
        Project Details:
        ${data.runs.map(run => {
          const isWood = run.styleName.includes('Wood') || run.styleName.includes('Cedar') || run.styleName.includes('Pine');
          return `
          Section: ${run.runName}
          Specs: ${run.height}' ${run.styleName} ${isWood ? `(${run.picketStyle || 'Standard'})` : ''}
          Length: ${run.linearFeet} LF (Gross)
          Gates: ${run.gates.map(g => `${g.width}' ${g.type}`).join(', ') || 'None'}
          ${isWood ? `Features: ${run.hasRotBoard ? 'Rot Board included' : ''} ${run.hasTopCap ? 'Top Cap included' : ''} ${run.hasTrim ? 'Trim included' : ''}` : ''}
        `}).join('\n')}

        Structure the Scope of Work as follows (use Markdown with bold headers):
        ### Project Overview
        2-3 sentences max, professional tone. 
        
        ### Scope of Work & Installation Details
        ${estimate.projectType === 'Staining Only' ? `
        - Stain Application: Professionally apply stain using industry-standard methods.
        - Natural Variations: Absorption, color, and tone variations are natural due to wood grain/age.
        - Overspray Protection: Contractor takes reasonable precautions (covering nearby areas), but is not responsible for damage caused by expected levels of overspray, drift, or runoff.` : `
        - Total LF and fence height.
        - Post details (size, spacing, depth - assume 24"-36" depth for concrete set).
        - Installation method.
        - Layout: Follows property lines provided by customer; survey required for disputes.
        - Utility: Customer must provide 811 utility clearance prior to digging.
        - Grade/Dirt: Minor grade variations may cause small gaps; dirt from post holes will be left on-site and spread along fence line.
        - Protection: Damage to unmarked underground utilities, irrigation, or landscaping is not the responsibility of the contractor.`}

        ### Materials
        Professional description of materials based on project specs (e.g., ${estimate.woodType || 'Selected Timber'}, Galvanized Steel Posts, etc.).

        ### Gates
        ${estimate.projectType === 'Staining Only' ? 'N/A' : 'For all gates: specify width, height, type, hinges, and latches.'}

        ### Cleanup & Disposal
        Standard removal of construction debris and fencing materials.

        ### Exclusions & Limitations
        ${estimate.projectType === 'Staining Only' ? 'Weather delays, existing surface contaminants not explicitly prepped.' : 'Rock excavation, permits (unless stated), and unforeseen conditions.'}

        ### Customer Responsibilities
        Ensure access, provide utility clearance, and clear immediate work area of vehicles, personal items, and plants.

        ### Warranty & Workmanship
        Contractor warrants workmanship for 1 year from completion. For painting or staining: workmanship/application warranty is limited to 30 days due to the nature of environmental factors (weathering, fading, natural wood movement).
      `;


      const result = await generateAIScope(prompt);
      setAiContractScope(result);
      localStorage.setItem('fence_pro_customer_contract_ai_scope', JSON.stringify(result));
    } catch (error) {
      console.error("AI Generation Error:", error);
      setAiContractScope("Error generating AI scope. Please ensure your API key is correctly configured.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      {/* Action Header */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#E5E5E5] flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <FileText size={120} className="text-american-blue" strokeWidth={1} />
        </div>
        
        <div className="relative z-10">
          <h1 className="text-2xl font-black text-american-blue tracking-tight uppercase mb-1">Customer Agreement</h1>
          <p className="text-xs font-bold text-[#999999] uppercase tracking-widest">Client-Ready Professional Contract & Scope</p>
        </div>

        <div className="flex items-center gap-3 relative z-10 w-full md:w-auto">
          <button 
            onClick={handleGenerateAIScope}
            disabled={isGenerating}
            className={cn(
              "flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg",
              isGenerating ? "bg-[#F5F5F5] text-[#999999]" : "bg-american-red text-white hover:bg-american-red/90 hover:scale-105"
            )}
          >
            {isGenerating ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            {aiContractScope ? 'Regenerate Scope' : 'Generate AI Scope'}
          </button>
          <button 
            onClick={handlePrint}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-american-blue text-white font-bold text-xs uppercase tracking-widest hover:bg-american-blue/90 hover:scale-105 transition-all shadow-lg"
          >
            <Printer size={16} />
            Print Agreement
          </button>
        </div>
      </div>

      {/* Contract Preview Area */}
      <div id="contract-view" className="bg-white rounded-[40px] shadow-2xl border border-[#E5E5E5] overflow-hidden print:border-0 print:shadow-none print:rounded-none">
        {/* Company Header */}
        <div className="bg-american-blue p-10 text-white flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-10">
            <div className="american-star w-48 h-48 bg-white" />
          </div>
          
          <div className="flex items-center gap-6 relative z-10">
            {COMPANY_INFO.logo && (
              <img src={COMPANY_INFO.logo} alt="Logo" className="h-24 w-auto object-contain bg-white/10 p-4 rounded-3xl" referrerPolicy="no-referrer" />
            )}
            <div>
              <h2 className="text-3xl font-black tracking-tighter uppercase leading-none">{COMPANY_INFO.name}</h2>
              <div className="mt-4 space-y-1 opacity-70">
                <p className="text-sm font-bold">{COMPANY_INFO.address}</p>
                <p className="text-sm font-bold">{COMPANY_INFO.phone} | {COMPANY_INFO.email}</p>
                <p className="text-xs font-black uppercase tracking-widest">{COMPANY_INFO.website}</p>
              </div>
            </div>
          </div>

          <div className="text-right relative z-10">
            <div className="inline-block px-4 py-2 rounded-xl bg-white/10 border border-white/20 mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-60 mr-2">Project Date:</span>
              <span className="text-sm font-bold">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-american-red italic">Fences with Character</p>
          </div>
        </div>

        <div className="p-12 space-y-12">
          {/* Customer & Project Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 border-b border-dashed border-[#E5E5E5] pb-12">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[#999999] mb-4">Customer Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[8px] font-black text-american-blue uppercase tracking-widest opacity-40">Client Name</label>
                  <p className="text-xl font-bold text-american-blue">{estimate.customerName || 'Valued Customer'}</p>
                </div>
                <div>
                  <label className="block text-[8px] font-black text-american-blue uppercase tracking-widest opacity-40">Installation Address</label>
                  <p className="text-sm font-bold text-[#444444] leading-relaxed">{estimate.customerAddress || 'No address specified'}</p>
                </div>
                {(estimate.customerPhone || estimate.customerEmail) && (
                  <p className="text-xs font-bold text-[#666666]">{estimate.customerPhone} {estimate.customerEmail && `• ${estimate.customerEmail}`}</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[#999999] mb-4">Project Overview</h3>
              <div className="bg-[#F8F9FA] rounded-2xl p-6 border border-[#F0F0F0] space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-[#666666] uppercase tracking-wider">Total linear footage</span>
                  <span className="text-lg font-black text-american-blue tracking-tight">{data.totals.subtotal > 0 ? (projectBreakdown.reduce((sum, r) => sum + r.netLF, 0).toFixed(1)) : (estimate.linearFeet || 0)} LF</span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-[#666666] uppercase tracking-wider">Project Type</span>
                  <span className="text-sm font-bold text-american-blue uppercase tracking-widest">
                    {(() => {
                      const styles = Array.from(new Set(projectBreakdown.map(r => r.style)));
                      if (styles.length === 0) return 'Custom Fence Project';
                      if (styles.length === 1) return styles[0];
                      return "Multi-Section Project";
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Scope of Work Section */}
          <div className="space-y-6">
            <h3 className="text-lg font-black text-american-blue uppercase tracking-tight flex items-center gap-3">
              <span className="h-6 w-1 bg-american-red rounded-full" />
              I. Scope of Work & Project Specifications
            </h3>
            
            {aiContractScope ? (
              <div className="prose prose-sm max-w-none text-[#444444] leading-relaxed font-medium bg-[#F9F9F9] p-8 rounded-3xl border border-[#E5E5E5] ai-content-area">
                <div dangerouslySetInnerHTML={{ __html: aiContractScope.replace(/\n/g, '<br/>') }} />
              </div>
            ) : (
              <div className="p-8 rounded-3xl border-2 border-dashed border-[#E5E5E5] flex flex-col items-center justify-center gap-4 text-center">
                <div className="h-12 w-12 rounded-full bg-american-red/10 flex items-center justify-center text-american-red">
                  <Sparkles size={24} />
                </div>
                <div>
                  <p className="text-sm font-bold text-american-blue">Generate AI Scope of Work</p>
                  <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest max-w-[300px] mt-1">
                    Click the "Generate AI Scope" button above to create a detailed project narrative for your client.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Financial Breakdown (Client View) */}
          <div className="space-y-6">
            <h3 className="text-lg font-black text-american-blue uppercase tracking-tight flex items-center gap-3">
              <span className="h-6 w-1 bg-american-red rounded-full" />
              II. Cost Summary
            </h3>
            
            <div className="space-y-6">
              {isHomogeneous ? (
                <div className="space-y-6">
                  {/* Unified Project Rate Card */}
                  <div className="bg-white rounded-3xl p-8 border-2 border-american-blue/5 shadow-lg flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
                      <Sparkles size={120} />
                    </div>
                    
                    <div className="relative z-10 text-center md:text-left">
                      <div className="inline-block px-3 py-1 rounded-full bg-american-red/10 text-american-red text-[9px] font-black uppercase tracking-widest mb-3">
                        Project-Wide Rate
                      </div>
                      <h4 className="text-xl font-black text-american-blue uppercase tracking-tight">Unified Fence Pricing</h4>
                      <p className="text-xs font-bold text-[#999999] mt-1 italic uppercase tracking-wider">{projectBreakdown[0].height}' {projectBreakdown[0].style} Specification</p>
                    </div>

                    <div className="text-center md:text-right relative z-10">
                      <div className="flex items-baseline justify-center md:justify-end gap-2">
                        <span className="text-4xl font-black text-american-blue tabular-nums">{formatCurrency(globalPricePerFoot)}</span>
                        <span className="text-sm font-black text-[#BBBBBB] uppercase tracking-widest">/ LF</span>
                      </div>
                      <p className="text-[10px] font-bold text-american-red uppercase tracking-widest mt-1">Guaranteed Custom Rate</p>
                    </div>
                  </div>

                  {/* Individual Footages for Clarity */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    {projectBreakdown.map((run, i) => (
                      <div key={i} className="bg-[#F9F9F9] rounded-2xl p-4 border border-[#F0F0F0] flex justify-between items-center">
                        <span className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">{run.name}</span>
                        <span className="text-sm font-bold text-american-blue">{run.netLF.toFixed(1)}'</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {projectBreakdown.map((run, i) => (
                    <div key={i} className="bg-white rounded-2xl p-6 border border-[#E5E5E5] shadow-sm flex flex-col">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="font-black text-american-blue uppercase tracking-tight text-sm">{run.name}</h4>
                          <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">{run.height}' {run.style}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-american-red">{formatCurrency(run.pricePerFoot)} <span className="opacity-40">/ FT</span></p>
                          <p className="text-[9px] font-bold text-[#BBBBBB] uppercase">Fence Rate</p>
                        </div>
                      </div>
                      
                      <div className="mt-auto pt-4 border-t border-[#F5F5F5] flex justify-between items-center">
                        <span className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">Section Total</span>
                        <span className="font-bold text-american-blue">{formatCurrency(run.totalFenceCharge)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Gates Section - Listed Separately */}
              <div className="bg-[#F8F9FA] rounded-3xl p-8 border border-[#E5E5E5]">
                <div className="flex items-center gap-4 mb-6">
                  <div className="h-10 w-10 rounded-xl bg-american-blue flex items-center justify-center text-white">
                    <Navigation size={20} />
                  </div>
                  <h4 className="font-black text-american-blue uppercase tracking-widest text-xs">Custom Gate Access Systems</h4>
                </div>
                
                <div className="space-y-3">
                  {projectBreakdown.some(r => r.gates.length > 0) ? (
                    projectBreakdown.flatMap(r => r.gates).map((gate, gIdx) => {
                      // Estimate gate price
                      const basePrice = (gate.items.reduce((sum, item) => sum + item.total, 0)) * markupFactor;
                      const tax = (gate.items.filter(i => i.category !== 'Labor').reduce((sum, item) => sum + item.total, 0)) * taxFactor;
                      return (
                        <div key={gIdx} className="flex items-center justify-between py-3 border-b border-[#E5E5E5] last:border-0">
                          <div>
                            <p className="text-sm font-bold text-[#1A1A1A]">{gate.width}' {gate.type} Gate</p>
                            <p className="text-[10px] font-bold text-[#999999] uppercase">Custom-Built & Professionally Installed</p>
                          </div>
                          <p className="font-bold text-american-blue text-sm">{formatCurrency(basePrice + tax)}</p>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs font-bold text-[#BBBBBB] uppercase italic tracking-widest">No custom gates included in this scope.</p>
                  )}
                </div>
              </div>

              {/* Grand Total */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-8 p-10 bg-american-blue rounded-3xl text-white relative overflow-hidden mt-8 shadow-xl">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                   <CheckCircle2 size={100} />
                </div>
                <div className="relative z-10 text-center md:text-left">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-1">Guaranteed Project Quoted Total</p>
                  <h3 className="text-3xl font-black tracking-tighter">TOTAL INVESTMENT</h3>
                </div>
                <div className="relative z-10 text-center md:text-right">
                  <div className="text-5xl font-bold tracking-tighter tabular-nums mb-1">
                    {formatCurrency(grandTotal)}
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-american-red">Valid for 30 days from date of issue</p>
                </div>
              </div>
            </div>
          </div>

          {/* Terms & Conditions (From PDFs) */}
          <div className="space-y-8 pt-12 border-t border-[#F0F0F0]">
            <h3 className="text-lg font-black text-american-blue uppercase tracking-tight flex items-center gap-3">
              <span className="h-6 w-1 bg-american-red rounded-full" />
              III. Terms, Conditions & Disclosures
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 text-[11px] leading-relaxed text-[#555555]">
              {[
                { title: "1. Payment Terms", content: "Total Contract Price: $[Amount] | Deposit: [10%] due at signing. Balance: [90%] due upon completion. Invoiced via QuickBooks (check, ACH, credit card). 3% fee on credit card payments. Late fee of 5% per month on balances unpaid past 3 days." },
                { title: "2. Change Orders", content: "Any changes to materials, layout, or additions requested after work begins must be agreed to in writing and may affect cost and timeline." },
                { title: "3. Client Responsibilities", content: "Client warrants property ownership or legal authority, is responsible for identifying property lines (LSFW is not responsible for disputes), must ensure access, provide utility clearance (811 Call Before You Dig), and must clear the immediate work area (including vehicles, items, and plants) of obstructions prior to painting or staining." },
                { title: "4. Warranty", content: "Workmanship is warranted for [1 year] from completion, covering installation defects. Exclusions: Normal wear/tear, settling, misuse, neglect, accidents, pets, vehicles, natural disasters. Materials covered by manufacturer warranty only. Staining/Painting workmanship warranty is limited to 30 days for application defects; exclusions include normal aging, fading, environmental factors, or product performance." },
                { title: "5. Liability", content: "LSFW is insured. Contractor is not liable for damages outside the work area unless caused by negligence. Client is responsible for securing pets and protecting landscaping/items within work zones." },
                { title: "6. Termination", content: "Either party may terminate with 7 days written notice. Client remains responsible for payment for work performed and materials ordered." },
                { title: "7. Governing Law", content: "Governed by the laws of the State of Texas." },
                { title: "8. Entire Agreement", content: "Represents total understanding between Contractor and Client. No oral agreements are binding." },
                { title: "9. Lawn and Landscaping", content: "LSFW is not liable for damage to lawns, plants, trees, sprinkler systems, or landscaping resulting from normal foot traffic, material storage, or equipment use. Contractor takes reasonable precautions but is not responsible for damage caused by expected levels of overspray, drift, or runoff during painting or staining." },
                { title: "10. Spoil Haul-Off", content: "Spoil removal (excavated dirt, concrete, etc.) is not included in the base estimate. LSFW offers spoil haul-off for an additional flat fee of $250, upon request." },
                { title: "11. Fence Length Tolerance", content: "All fence length estimates include a tolerance of ±5 feet. Final pricing may reflect minor adjustments based on actual field measurements." },
                { title: "12. Weather Delays", content: "In the event of rain or inclement weather, the scheduled job date may be delayed. Each weather day may result in up to a 2-day delay to the original schedule." },
                { title: "13. Fence Clearance & Swing Gap", content: "Due to natural variations in terrain, a gap of up to 3 inches between the bottom of the fence and the ground may be necessary for proper installation. Fence gates may have up to a 4-inch gap to allow for smooth swing and operation." },
                { title: "14. Painting & Staining Surfaces", content: "Variations in color, tone, and absorption are natural due to wood grain, age, and moisture content. LSFW is not responsible for color inconsistencies. Application is weather-dependent; rain, humidity, or extreme temperature variations may affect final appearance or curing." }
              ].map((term, idx) => (
                <div key={idx} className="space-y-2">
                  <p className="font-black text-american-blue uppercase tracking-widest">{term.title}</p>
                  <p className="font-medium">{term.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Signature Block */}
          <div className="pt-20 border-t border-dashed border-[#E5E5E5]">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#999999] mb-12 text-center">Acknowledgment & Professional Authorization</h3>
            
            <p className="text-sm font-medium text-[#444444] text-center max-w-2xl mx-auto mb-16 italic">
              "I have read, understood, and agree to the terms stated in this agreement. I acknowledge that Lone Star Fence Works has made all disclosures regarding liability, access, utility use, and warranty coverage."
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
              <div className="space-y-6">
                <div className="h-20 border-b-2 border-american-blue/20" />
                <div className="flex justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#999999]">Customer Signature</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#999999]">Date</span>
                </div>
                <div className="pt-4">
                  <p className="text-lg font-bold text-american-blue uppercase">{estimate.customerName || '___________________________'}</p>
                </div>
              </div>
              <div className="space-y-6">
                <div className="h-20 border-b-2 border-american-blue/20" />
                <div className="flex justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#999999]">Authorized Representative</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#999999]">Date</span>
                </div>
                <div className="pt-4">
                  <p className="text-lg font-bold text-american-blue uppercase">{COMPANY_INFO.name}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contract Footer */}
        <div className="p-8 bg-[#F9F9F9] border-t border-[#F0F0F0] text-center">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#BBBBBB]">Lone Star Fence Works • Official Customer Contract • Fences With Character</p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          #contract-view { border: 0 !important; margin: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
          aside, nav { display: none !important; }
        }
      `}} />
    </div>
  );
}
