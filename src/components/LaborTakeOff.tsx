import React, { useState } from 'react';
import { Printer, FileText, Hammer, Shield, ExternalLink, Sparkles, Loader2, Download, CheckCircle2 } from 'lucide-react';
import { Estimate, MaterialItem, LaborRates, SupplierQuote } from '../types';
import { calculateDetailedTakeOff, DetailedTakeOff } from '../lib/calculations';
import { cn, formatCurrency } from '../lib/utils';
import { COMPANY_INFO } from '../constants';
import { generateAIScope } from '../services/geminiService';

interface LaborTakeOffProps {
  estimate: Partial<Estimate>;
  materials: MaterialItem[];
  laborRates: LaborRates;
  quotes: SupplierQuote[];
  aiProjectScope: string | null;
  setAiProjectScope: (scope: string | null) => void;
  onUpdateEstimate?: (update: Partial<Estimate>) => void;
}

export default function LaborTakeOff({ 
  estimate, 
  materials, 
  laborRates, 
  quotes,
  aiProjectScope,
  setAiProjectScope,
  onUpdateEstimate
}: LaborTakeOffProps) {
  const data: DetailedTakeOff = calculateDetailedTakeOff(estimate, materials, laborRates);
  const [isGenerating, setIsGenerating] = useState(false);
  const [localAiScope, setLocalAiScope] = useState<string>(estimate.laborScope || aiProjectScope || '');
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  
  // Update local scope when external scope changes (e.g. from generation or tab sync)
  React.useEffect(() => {
    if (aiProjectScope) {
      setLocalAiScope(aiProjectScope);
    }
  }, [aiProjectScope]);

  React.useEffect(() => {
    if (estimate.laborScope && !aiProjectScope && !localAiScope) {
       setLocalAiScope(estimate.laborScope);
       setAiProjectScope(estimate.laborScope);
    }
  }, [estimate.laborScope]);

  // Filter for ONLY labor items for the internal manifest
  const laborSummary = data.summary.filter(item => item.category === 'Labor' || item.category === 'Demolition');
  const totalLaborRaw = laborSummary.reduce((sum, item) => sum + item.total, 0);

  const handlePrint = () => {
    window.print();
  };

  const handleSaveLaborScope = () => {
    if (onUpdateEstimate) {
      onUpdateEstimate({
        laborScope: localAiScope
      });
      setAiProjectScope(localAiScope);
      setShowSavedFeedback(true);
      setTimeout(() => setShowSavedFeedback(false), 3000);
    }
  };

  const handleGenerateAIScope = async () => {
    setIsGenerating(true);
    try {
      const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const prompt = `
        You are an expert fencing project manager. Based on the following estimate data, generate a highly detailed "Subcontractor Scope of Work" document. 
        This is a contract-style document that will be sent to the installation crew.
        
        Today's Date: ${currentDate}
        Customer: ${estimate.customerName}
        Address: ${estimate.customerAddress}
        Total Projects Specs:
        ${data.runs.map(run => {
          const isWood = run.styleName.includes('Wood') || run.styleName.includes('Cedar') || run.styleName.includes('Pine');
          return `
          Run: ${run.runName}
          Length: ${run.linearFeet} LF
          Style: ${run.styleName} ${isWood ? `- ${run.picketStyle} orientation` : ''}
          Height: ${run.height}'
          ${isWood ? `Rails: ${run.railCount}
          Rot Board: ${run.hasRotBoard ? 'Included' : 'None'}
          Top Style: ${run.topStyle}
          Cap: ${run.hasTopCap ? 'Yes' : 'No'}
          Trim: ${run.hasTrim ? 'Yes' : 'No'}
          Wood Type: ${run.woodType || 'N/A'}` : ''}
          Gates: ${run.gates.map(g => `${g.width}' ${g.type}`).join(', ')}
        `}).join('\n')}

        Requirements to include in the generated text:
        - Specific hole depths as mentioned: 8"x24" for standard, 8"x36" for 8' wood. Gate posts 1' deeper.
        - Detailed construction steps for the specific styles mentioned. Clearly distinguish between "Board on Board" (overlapping) and "Side by Side" picket orientation. For Board on Board, specify that pickets in the back layer must have exactly 3.5" of spacing between them, with the front layer centered over the gaps.
        - Utility Verification: Mandatory check of 811 markings. Instructions to stop digging if unknown obstructions are found.
        - Private Line Due Diligence: Explicitly mention responsibility for avoiding private lines not marked by 811, including sprinkler systems, septic lines, and power to auxiliary buildings/sheds.
        - Material management (how many pickets, posts, bags of concrete etc based on the manifest).
        - Quality control standards: Level/Plum requirements.
        - Cleanup expectations.
        - DO NOT include general PPE or safety requirements (the crew is responsible for their own safety gear).
        
        Format the output with professional headings and clear bullet points. Keep it concise but exhaustive for a contractor to follow perfectly.

        ADDITIONAL INSTRUCTIONS:
        ${customInstructions}
      `;

      const result = await generateAIScope(prompt);
      setAiProjectScope(result);
      setLocalAiScope(result);
      if (onUpdateEstimate) {
        onUpdateEstimate({ laborScope: result });
      }
      
      // Explicitly save to localStorage for immediate cross-tab availability
      localStorage.setItem('fence_pro_ai_scope', JSON.stringify(result));
    } catch (error) {
      console.error("AI Generation Error:", error);
      if (error instanceof Error && error.message === "GEMINI_API_KEY_MISSING") {
        setAiProjectScope("Error: Gemini API Key is missing. Please ensure it is set in your AI Studio settings (Secrets) as GEMINI_API_KEY.");
      } else {
        setAiProjectScope("Error generating AI scope. Please check your connection and API key configuration.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenNewTab = () => {
    // Collect all relevant state for bridging to ensure the new tab is identical
    const stateToBridge = {
      activeTab: 'labor-breakdown',
      estimate,
      materials,
      laborRates,
      quotes,
      aiProjectScope // Pass the scope explicitly to bridge it immediately
    };
    
    const hashState = encodeURIComponent(JSON.stringify(stateToBridge));
    const baseUrl = window.location.origin + window.location.pathname;
    const finalUrl = `${baseUrl}#state=${hashState}`;
    
    window.open(finalUrl, '_blank');
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-700 takeoff-page print:max-w-none print:p-0 print:m-0 print:space-y-4">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-6 rounded-[32px] shadow-xl border-2 border-american-red/10 print:hidden">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-american-red flex items-center justify-center text-white shadow-lg">
            <Hammer size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-american-blue uppercase tracking-tight">Subcontractor Labor Manifest</h1>
            <p className="text-[10px] font-bold text-american-red uppercase tracking-widest flex items-center gap-1">
              <Shield size={10} /> Certified Scope of Work • Vendor Authorization
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {showSavedFeedback && (
            <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-100 flex items-center gap-2">
              <CheckCircle2 size={12} />
              Saved
            </div>
          )}
          <button
            onClick={handleSaveLaborScope}
            className="flex items-center gap-2 px-4 py-2 bg-american-blue text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-transform active:scale-95 shadow-md shadow-american-blue/10"
          >
            <Download size={16} />
            Save Changes
          </button>
          <button
            onClick={handleOpenNewTab}
            className="flex items-center gap-2 px-4 py-2 bg-[#F5F5F7] hover:bg-[#E5E5E7] rounded-xl text-xs font-black uppercase tracking-widest text-american-blue transition-colors"
            title="Open in new window for better printing"
          >
            <ExternalLink size={16} />
            New Window
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-6 py-2 bg-american-red text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-american-red/20 hover:scale-105 transition-transform active:scale-95"
          >
            <Printer size={16} />
            Print Manifest
          </button>
        </div>
      </div>

      {/* Main Content (Printable) */}
      <div className="bg-white rounded-[40px] shadow-2xl border-2 border-american-red/5 overflow-hidden print:border-0 print:shadow-none">
        {/* Printable Header */}
        <div className="p-10 border-b-4 border-american-blue/5 bg-[#FBFBFB]">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8">
            <div className="space-y-4">
              <img src={COMPANY_INFO.logo} alt="Logo" className="h-20 object-contain" />
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-american-blue uppercase tracking-tighter">LABOR SCOPE OF WORK</h2>
                <div className="text-[11px] font-bold text-[#666666] uppercase tracking-widest space-y-0.5">
                  <p>Subcontractor Installation Agreement</p>
                  <p>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
              </div>
            </div>
            <div className="text-right space-y-1">
              <p className="text-[10px] font-black text-american-red uppercase tracking-widest">Document: Labor Take-off</p>
              <p className="text-3xl font-black text-american-blue uppercase tracking-tighter">CONFIDENTIAL</p>
              <div className="mt-4 pt-4 border-t-2 border-dashed border-american-blue/10">
                <p className="text-[10px] font-black text-american-blue uppercase tracking-widest">Job Reference</p>
                <p className="text-lg font-black text-american-blue tracking-tight">{estimate.customerName || 'Standard Job'}</p>
                <p className="text-xs font-medium text-[#666666]">{estimate.customerAddress || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="p-8 space-y-12">
          {/* Subcontractor Scope Header */}
          <div className="p-6 bg-american-blue/5 rounded-3xl border-2 border-american-blue/10 space-y-4">
            <h3 className="text-sm font-black text-american-blue uppercase tracking-[0.2em] flex items-center gap-2">
              <Shield size={16} /> Subcontractor General Scope of Work
            </h3>
            <div className="grid md:grid-cols-2 gap-6 text-[11px] leading-relaxed text-[#555555]">
              <div className="space-y-3">
                <p><strong className="text-american-blue font-black uppercase">Standard Digging:</strong> Holes for all fences (except 8' tall wood) must be at least <span className="text-american-red font-black underline">8" wide x 24" deep</span>.</p>
                <p><strong className="text-american-blue font-black uppercase">8' Wood Fence:</strong> Holes for 8' tall wood fences must be at least <span className="text-american-red font-black underline">8" wide x 36" deep</span>.</p>
                <p><strong className="text-american-blue font-black uppercase">Post Quality:</strong> All posts must be set in wet-poured concrete. No dry-bagging without explicit approval.</p>
              </div>
              <div className="space-y-3">
                <p><strong className="text-american-blue font-black uppercase">Gate Posts:</strong> ALL gate posts must be set <span className="text-american-red font-black underline">12" deeper</span> than regular posts (36" deep for standard, 48" deep for 8').</p>
                <p><strong className="text-american-blue font-black uppercase">Utility Marks:</strong> Crew must verify all 811 markings before digging. <span className="text-american-red font-black underline">STOP DIGGING</span> if you encounter unmarked lines or pipes.</p>
                <p><strong className="text-american-blue font-black uppercase">Private Lines:</strong> Subcontractor is responsible for due diligence regarding private lines (sprinklers, septic, shed power) not marked by 811. Hand-dig near suspected areas.</p>
                <p><strong className="text-american-blue font-black uppercase">Clean Up:</strong> Subcontractor is responsible for removal of all debris, picket scraps, and concrete excess from the site daily.</p>
              </div>
            </div>
          </div>

          {data.runs.map((run) => {
            const runLabor = run.items.filter(i => i.category === 'Labor' || i.category === 'Demolition');
            if (runLabor.length === 0 && run.gates.every(g => g.items.every(gi => gi.category !== 'Labor'))) return null;
            
            return (
              <div key={run.runId} className="space-y-4 takeoff-card">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-american-blue p-6 rounded-[32px] text-white">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center">
                      <FileText size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black uppercase tracking-tight">{run.runName}</h3>
                      <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">{run.linearFeet} LF TOTAL • {run.styleName}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20">
                      {run.height}' HEIGHT
                    </span>
                    {(run.styleName.includes('Wood') || run.styleName.includes('Cedar') || run.styleName.includes('Pine')) && (
                      <>
                        <span className="px-3 py-1 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20">
                          {run.railCount} RAILS
                        </span>
                        {run.hasRotBoard && (
                          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-200 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-500/40">
                            ROT BOARD
                          </span>
                        )}
                        <span className="px-3 py-1 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20">
                          {run.topStyle}
                        </span>
                        {(run.hasTopCap || run.hasTrim) && (
                          <span className="px-3 py-1 bg-american-red/20 text-american-red rounded-full text-[9px] font-black uppercase tracking-widest border border-american-red/40">
                            {run.hasTopCap && run.hasTrim ? 'CAP & TRIM' : (run.hasTopCap ? 'TOP CAP' : 'TRIM')}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-3xl border-2 border-american-blue/5 shadow-sm">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[#F8F9FA] text-[10px] font-black uppercase tracking-widest text-[#999999]">
                        <th className="px-6 py-4">Detailed Work Specification</th>
                        <th className="px-6 py-4 text-center">Quantities</th>
                        <th className="px-6 py-4 text-right print:hidden">Piece Rate</th>
                        <th className="px-6 py-4 text-right print:hidden">Net Pay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-[#F8F9FA]">
                      {runLabor.map((item, i) => (
                        <tr key={i} className={cn(
                          "text-sm font-bold hover:bg-[#FBFBFB] transition-colors",
                          item.category === 'Demolition' ? "text-american-red/80 bg-american-red/5" : "text-american-blue/80"
                        )}>
                          <td className="px-6 py-4">
                            <div className="font-black">{item.name}</div>
                            <div className="text-[10px] font-normal opacity-60 mt-1 max-w-md leading-relaxed">
                              {item.name.includes('Installation') && (
                                <>
                                  <span className="block mb-1 text-american-blue/80 font-bold underline">
                                    Project Specs: {run.height}' Tall {run.styleName} {(run.styleName.includes('Wood') || run.styleName.includes('Cedar')) ? `(${run.picketStyle})` : ''}
                                  </span>
                                  Includes: Layout, utility marking verification, digging to spec ({run.height === 8 ? '36"' : '24"'} min depth x 8" min width), post setting in wet concrete, {run.styleName.includes('Pipe') ? 'top rail installation' : (run.railCount > 0 ? `${run.railCount}x horizontal rail installation,` : '')} and {run.styleName.includes('Wood') ? 'picket' : (run.styleName.includes('Pipe') ? 'top rail' : 'panel')} attachment. 
                                  {run.picketStyle === 'Board on Board' && run.styleName.includes('Wood') && <span className="text-american-red font-bold">⚠️ BOARD ON BOARD: Pickets in the back layer MUST HAVE EXACTLY 3.5" SPACING between them. Front layer pickets must be centered over the gaps.</span>}
                                  {run.hasRotBoard && run.styleName.includes('Wood') && " Includes installation of 2x6 rot board."} 
                                  {run.hasTopCap && run.styleName.includes('Wood') && " Includes 2x6 top cap rail."} 
                                  {run.hasTrim && run.styleName.includes('Wood') && " Includes trim board application."}
                                  Must exercise full due diligence for private lines (sprinklers/septic/aux power). Gate posts must be set 12" deeper than regular posts. All work must be level, plum, and uniform.
                                </>
                              )}
                              {item.name.includes('Demo') && "Includes: Removal of existing fence segments, posts, and post concrete. Debris must be hauled away or staged as specified in dumpster/trailer."}
                              {item.name.includes('Stain') && `Includes: Power washing/cleaning surface followed by uniform application of selected stain. ${run.stainSides ? `Coverage: ${run.stainSides}` : ''}. No overspray on non-fence surfaces authorized.`}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center font-black">{item.qty} {item.unit}</td>
                          <td className="px-6 py-4 text-right tabular-nums print:hidden">{formatCurrency(item.unitCost)}</td>
                          <td className="px-6 py-4 text-right tabular-nums font-black print:hidden">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                      {/* Gate Labor if nested */}
                      {run.gates.map((gate, gi) => (
                        gate.items.filter(i => i.category === 'Labor').map((item, ii) => (
                          <tr key={`${gi}-${ii}`} className="text-sm font-bold text-american-red/80 bg-american-red/[0.02] hover:bg-american-red/[0.05] transition-colors">
                            <td className="px-6 py-4 flex items-center gap-2">
                              <span className="text-[10px] bg-american-red font-black text-white px-2 py-0.5 rounded">GATE</span>
                              {item.name}
                            </td>
                            <td className="px-6 py-4 text-center font-black">{item.qty} {item.unit}</td>
                            <td className="px-6 py-4 text-right tabular-nums print:hidden">{formatCurrency(item.unitCost)}</td>
                            <td className="px-6 py-4 text-right tabular-nums font-black print:hidden">{formatCurrency(item.total)}</td>
                          </tr>
                        ))
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* Master Labor Summary */}
          <div className="pt-12 border-t-4 border-american-blue/5 space-y-8 takeoff-card">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-american-blue text-white flex items-center justify-center shadow-lg">
                <Hammer size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-american-blue tracking-tight uppercase">Aggregate Labor Manifest</h2>
                <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Total Crew Pay Breakdown</p>
              </div>
            </div>

            <div className="bg-white rounded-[32px] p-1 overflow-hidden border-2 border-american-blue/5 shadow-lg">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#F8F9FA] text-[10px] font-black uppercase tracking-widest text-[#999999]">
                    <th className="px-8 py-6">Operation / Task</th>
                    <th className="px-8 py-6 text-center">Cumulative Volume</th>
                    <th className="px-8 py-6 text-right print:hidden">Total Net Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-[#F8F9FA]">
                  {laborSummary.map((item, i) => (
                    <tr key={i} className="text-sm font-bold text-american-blue hover:bg-[#FBFBFB] transition-colors">
                      <td className="px-8 py-5 flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-american-red" />
                        {item.name}
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="px-3 py-1 bg-american-blue/5 text-american-blue rounded-full text-xs font-black print:bg-transparent print:p-0">{item.qty} {item.unit}</span>
                      </td>
                      <td className="px-8 py-5 text-right font-black text-american-red print:hidden">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-american-blue text-white">
                    <td colSpan={2} className="px-8 py-6 text-right font-black uppercase tracking-widest text-xs">Total Direct Labor Liability</td>
                    <td className="px-8 py-6 text-right font-black text-2xl">{formatCurrency(totalLaborRaw)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          
          {/* AI Scope Generator Section */}
          <div className="pt-12 border-t-4 border-american-blue/5 space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 print:hidden">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-american-blue/5 text-american-blue flex items-center justify-center border-2 border-american-blue/10">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-american-blue tracking-tight uppercase">AI Contract Refinement</h2>
                  <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Generate detailed job site procedures</p>
                </div>
              </div>
              
              <div className="flex-1 w-full md:w-auto">
                <textarea
                  placeholder="Add specific instructions for AI scope generation..."
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  className="w-full h-12 p-2 rounded-xl text-xs border border-[#E5E5E5] resize-none"
                />
              </div>
              
              <button
                onClick={handleGenerateAIScope}
                disabled={isGenerating}
                className="flex items-center gap-3 px-8 py-4 bg-american-blue text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-american-blue/20 hover:scale-105 transition-all active:scale-95 disabled:opacity-50 disabled:scale-100"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Generating Scope...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Refine Scope with AI
                  </>
                )}
              </button>
            </div>

            {aiProjectScope && (
              <div className="p-10 bg-[#FBFBFB] rounded-[40px] border-4 border-american-blue/5 shadow-inner animate-in slide-in-from-bottom-4 duration-500 print:hidden">
                <div className="flex items-center justify-between mb-8 pb-4 border-b-2 border-american-blue/5">
                  <h4 className="text-[10px] font-black text-american-blue uppercase tracking-widest flex items-center gap-2">
                    <Shield size={14} className="text-american-red" /> AI-Generated Installation Directives
                  </h4>
                  <button 
                    onClick={() => setAiProjectScope(null)}
                    className="text-[10px] font-black text-american-red uppercase tracking-widest hover:underline"
                  >
                    Clear Analysis
                  </button>
                </div>
                <div className="prose prose-sm max-w-none text-[#444444] whitespace-pre-line text-xs leading-relaxed font-medium bg-white p-6 rounded-2xl border border-american-blue/5 shadow-inner print:hidden">
                  <textarea
                    value={localAiScope}
                    onChange={(e) => setLocalAiScope(e.target.value)}
                    onInput={(e) => {
                      e.currentTarget.style.height = 'auto';
                      e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                    }}
                    className="w-full bg-transparent outline-none resize-none overflow-hidden text-[#444444] leading-relaxed font-medium min-h-[200px]"
                    placeholder="Enter installation directives here..."
                  />
                </div>
                <div className="hidden print:block whitespace-pre-wrap text-[11px] leading-relaxed text-[#333333]">
                  {localAiScope}
                </div>
              </div>
            )}
            
            {/* Printable AI Scope (only visible when generated and during print) */}
            <div className="hidden print:block mt-12 pt-12 border-t-4 border-dashed border-american-blue/10">
              <h2 className="text-xl font-black text-american-blue tracking-tight uppercase mb-6">Installation Directives & Safety Procedures</h2>
              <div className="text-[11px] leading-relaxed text-[#333333] whitespace-pre-line">
                {localAiScope || "Standard installation procedures apply."}
              </div>
            </div>
          </div>

          <div className="p-8 bg-american-red/5 rounded-3xl border-2 border-american-red/10 print:hidden">
             <div className="flex gap-4">
                <Shield className="text-american-red shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-black text-american-blue uppercase tracking-tight">Confidential Document Notice</p>
                  <p className="text-xs text-[#666666] leading-relaxed">This labor take-off is intended for internal payroll and logistical management only. It reflects direct labor costs without sales tax or profit markup. Do not distribute to clients or external sales representatives.</p>
                </div>
             </div>
          </div>
        </div>

        {/* Footer Branding */}
        <div className="bg-american-blue p-8 text-center border-t-8 border-american-blue/20 print:hidden">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Lone Star Fence Works • Strategic Labor Operations • Internal Use Only</p>
        </div>
      </div>

    </div>
  );
}
