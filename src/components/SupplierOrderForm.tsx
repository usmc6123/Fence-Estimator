import React from 'react';
import { Printer, FileText, Package, ExternalLink } from 'lucide-react';
import { Estimate, MaterialItem, LaborRates } from '../types';
import { calculateDetailedTakeOff, DetailedTakeOff } from '../lib/calculations';
import { COMPANY_INFO } from '../constants';

interface SupplierOrderFormProps {
  estimate: Partial<Estimate>;
  materials: MaterialItem[];
  laborRates: LaborRates;
}

export default function SupplierOrderForm({ estimate, materials, laborRates }: SupplierOrderFormProps) {
  const data: DetailedTakeOff = calculateDetailedTakeOff(estimate, materials, laborRates);

  // Consolidate all materials into one master list
  const consolidatedMaterials = [
    ...data.summary.filter(item => item.category !== 'Labor' && item.category !== 'Demolition'),
    ...data.manualSummary.filter(item => item.category !== 'Labor' && item.category !== 'Demolition')
  ].reduce((acc, item) => {
    const existing = acc.find(i => i.name === item.name && i.unit === item.unit);
    if (existing) {
      existing.qty += item.qty;
      existing.total += item.total;
    } else {
      acc.push({ ...item });
    }
    return acc;
  }, [] as (typeof data.summary[0])[]);

  const handlePrint = () => {
    window.print();
  };

  const handleOpenNewTab = () => {
    // Collect all relevant state for bridging
    const stateToBridge = {
      estimate,
      activeTab: 'supplier-order',
      materials,
      laborRates
    };
    
    // Encode state into hash
    const hashState = encodeURIComponent(JSON.stringify(stateToBridge));
    const url = new URL(window.location.href);
    url.hash = `state=${hashState}`;
    
    window.open(url.toString(), '_blank');
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-700 takeoff-page printing-supplier-form print:max-w-none print:p-0 print:m-0 print:break-inside-avoid">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-6 rounded-[32px] shadow-xl border-2 border-american-blue/5 print:hidden">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-american-blue flex items-center justify-center text-white shadow-lg">
            <Package size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-american-blue uppercase tracking-tight">Supplier Order Form</h1>
            <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Consolidated Material List</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenNewTab}
            className="flex items-center gap-2 px-6 py-2 bg-[#F5F5F7] hover:bg-[#E5E5E7] text-american-blue rounded-xl text-xs font-black uppercase tracking-widest transition-all"
            title="Open in new window for better printing"
          >
            <ExternalLink size={16} />
            New Window
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-6 py-2 bg-american-blue text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-american-blue/20 hover:scale-105 transition-transform active:scale-95"
          >
            <Printer size={16} />
            Print Order Form
          </button>
        </div>
      </div>

      {/* Printable Form */}
      <div className="bg-white rounded-[40px] shadow-2xl border-2 border-american-blue/5 overflow-hidden print:border-0 print:shadow-none order-form-print-area">
        {/* Printable Header */}
        <div className="p-10 border-b-4 border-american-blue/5 bg-[#FBFBFB]">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8">
            <div className="space-y-4">
              <img src={COMPANY_INFO.logo} alt="Logo" className="h-16 object-contain" />
              <div className="space-y-1">
                <h2 className="text-xl font-black text-american-blue uppercase tracking-tighter">{COMPANY_INFO.name}</h2>
                <div className="text-[10px] font-bold text-[#666666] uppercase tracking-widest">
                  <p>{COMPANY_INFO.address}</p>
                </div>
              </div>
            </div>
            <div className="text-right space-y-1">
              <p className="text-[9px] font-black text-american-red uppercase tracking-widest">Supplier Order Form</p>
              <p className="text-2xl font-black text-american-blue uppercase tracking-tighter">JOB Order #{Math.random().toString(36).substr(2, 6).toUpperCase()}</p>
              <p className="text-xs font-bold text-[#999999]">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              <div className="mt-4 pt-4 border-t-2 border-dashed border-american-blue/10">
                <p className="text-[9px] font-black text-american-blue uppercase tracking-widest">Shipping Address / Customer</p>
                <p className="text-md font-black text-american-blue tracking-tight">{estimate.customerName || 'N/A'}</p>
                <p className="text-[10px] font-medium text-[#666666]">{estimate.customerAddress || 'No address provided'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Consolidated List */}
        <div className="p-8">
          <div className="bg-white rounded-[24px] overflow-hidden border-2 border-american-blue/5 shadow-md">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#F8F9FA] text-[10px] font-black uppercase tracking-widest text-[#999999]">
                  <th className="px-6 py-4 w-16 text-center">#</th>
                  <th className="px-6 py-4">Required Material Specification</th>
                  <th className="px-6 py-4 text-center">Quantity</th>
                  <th className="px-6 py-4">Unit</th>
                  <th className="px-6 py-4 text-center">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-[#F8F9FA]">
                {consolidatedMaterials.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-10 text-center text-sm font-bold text-[#999999] italic">
                      No materials found for this project
                    </td>
                  </tr>
                ) : (
                  consolidatedMaterials.map((item, i) => (
                    <tr key={i} className="text-sm font-bold text-american-blue print:text-[11pt]">
                      <td className="px-6 py-4 text-center text-[10px] text-[#999999] font-black">{i + 1}</td>
                      <td className="px-6 py-4 leading-tight">{item.name}</td>
                      <td className="px-6 py-4 text-center font-black">{item.qty}</td>
                      <td className="px-6 py-4 text-[9px] uppercase font-black tracking-widest text-[#999999]">{item.unit}</td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-block w-6 h-6 border-2 border-[#E5E5E5] rounded-md" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-8">
             <div className="p-6 border-2 border-american-blue/5 rounded-2xl bg-[#FBFBFB]">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-american-blue mb-4">Job Notes / Instructions</h4>
                <div className="h-32 border-b border-dashed border-[#E5E5E5]" />
             </div>
             <div className="p-6 border-2 border-american-blue/5 rounded-2xl bg-[#FBFBFB]">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-american-blue mb-4">Internal Approval</h4>
                <div className="mt-12 flex justify-between items-end">
                   <div className="text-center">
                      <div className="w-32 border-b-2 border-american-blue/20 mb-2" />
                      <p className="text-[8px] font-bold text-[#999999] uppercase tracking-widest">Ordered By</p>
                   </div>
                   <div className="text-center">
                      <div className="w-32 border-b-2 border-american-blue/20 mb-2" />
                      <p className="text-[8px] font-bold text-[#999999] uppercase tracking-widest">Authorized Signature</p>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* Footer Branding */}
        <div className="bg-american-blue p-6 text-center border-t-8 border-american-blue/20">
          <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em]">Lone Star Fence Works • Strategic Procurement Document • Procurement Authorization Required</p>
        </div>
      </div>
    </div>
  );
}
