import React from 'react';
import { Printer, FileText, Hammer, Shield, ExternalLink } from 'lucide-react';
import { Estimate, MaterialItem, LaborRates, SupplierQuote } from '../types';
import { calculateDetailedTakeOff, DetailedTakeOff } from '../lib/calculations';
import { cn, formatCurrency } from '../lib/utils';
import { COMPANY_INFO } from '../constants';

interface LaborTakeOffProps {
  estimate: Partial<Estimate>;
  materials: MaterialItem[];
  laborRates: LaborRates;
  quotes: SupplierQuote[];
}

export default function LaborTakeOff({ estimate, materials, laborRates, quotes }: LaborTakeOffProps) {
  const data: DetailedTakeOff = calculateDetailedTakeOff(estimate, materials, laborRates);
  
  // Filter for ONLY labor items for the internal manifest
  const laborSummary = data.summary.filter(item => item.category === 'Labor' || item.category === 'Demolition');
  const totalLaborRaw = laborSummary.reduce((sum, item) => sum + item.total, 0);

  const handlePrint = () => {
    window.print();
  };

  const handleOpenNewTab = () => {
    // Collect all relevant state for bridging
    const stateToBridge = {
      estimate,
      activeTab: 'labor-takeoff',
      materials,
      laborRates,
      quotes
    };
    
    // Encode state into hash
    const hashState = encodeURIComponent(JSON.stringify(stateToBridge));
    const url = new URL(window.location.href);
    url.hash = `state=${hashState}`;
    
    window.open(url.toString(), '_blank');
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
            <h1 className="text-xl font-black text-american-blue uppercase tracking-tight">Internal Labor Analysis</h1>
            <p className="text-[10px] font-bold text-american-red uppercase tracking-widest flex items-center gap-1">
              <Shield size={10} /> Confidential • Crew Manifest • No Markup Applied
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
                <h2 className="text-2xl font-black text-american-blue uppercase tracking-tighter">INTERNAL USE ONLY</h2>
                <div className="text-[11px] font-bold text-[#666666] uppercase tracking-widest space-y-0.5">
                  <p>Labor Breakdown Report</p>
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
          {data.runs.map((run) => {
            const runLabor = run.items.filter(i => i.category === 'Labor' || i.category === 'Demolition');
            if (runLabor.length === 0 && run.gates.every(g => g.items.every(gi => gi.category !== 'Labor'))) return null;
            
            return (
              <div key={run.runId} className="space-y-4 takeoff-card">
                <div className="flex items-center gap-4 bg-american-blue p-4 rounded-2xl text-white">
                  <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="font-black uppercase tracking-tight">{run.runName}</h3>
                    <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">{run.linearFeet} LF • {run.styleName}</p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border-2 border-american-blue/5">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[#F8F9FA] text-[10px] font-black uppercase tracking-widest text-[#999999]">
                        <th className="px-6 py-4">Labor Task Description</th>
                        <th className="px-6 py-4 text-center">Volume</th>
                        <th className="px-6 py-4 text-right print:hidden">Unit Rate</th>
                        <th className="px-6 py-4 text-right print:hidden">Subtotal cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-[#F8F9FA]">
                      {runLabor.map((item, i) => (
                        <tr key={i} className={cn(
                          "text-sm font-bold hover:bg-[#FBFBFB] transition-colors",
                          item.category === 'Demolition' ? "text-american-red/80 bg-american-red/5" : "text-american-blue/80"
                        )}>
                          <td className="px-6 py-4">{item.name}</td>
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
          <div className="pt-12 border-t-4 border-american-blue/5 space-y-8 takeoff-card print:hidden">
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
        <div className="bg-[#1A1A1A] p-8 text-center border-t-8 border-american-red print:hidden">
          <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Lone Star Fence Works • Strategic Labor Operations • Internal Use Only</p>
        </div>
      </div>

    </div>
  );
}
