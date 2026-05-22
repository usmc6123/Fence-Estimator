import React from 'react';
import { CheckCircle, ArrowRight, Printer, RotateCcw, Calendar, FileText } from 'lucide-react';
import { CustomerEstimateData, EstimateBreakdown } from './customerEstimateCalculations';

interface Step6Props {
  data: CustomerEstimateData;
  breakdown: EstimateBreakdown;
  ghlSynced: boolean;
  onReset: () => void;
}

export default function Step6({ data, breakdown, ghlSynced, onReset }: Step6Props) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="step-6-container" className="max-w-2xl mx-auto space-y-8 py-4 print:py-0 text-center">
      
      {/* Visual Header */}
      <div className="space-y-3 flex flex-col items-center">
        <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-100/30">
          <CheckCircle size={36} />
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-black text-american-blue uppercase tracking-tight">
            Estimate Successfully Cast!
          </h2>
          <p className="text-sm font-medium text-emerald-600 flex items-center justify-center gap-1">
            Official quote locks in your dynamic price.
          </p>
        </div>
      </div>

      {/* Confirmation Block */}
      <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] text-left space-y-6 shadow-sm print:border-none print:shadow-none">
        
        {/* Intro greetings */}
        <div className="border-b border-[#E5E5E5] pb-4 space-y-1">
          <h3 className="font-bold text-[#111111] text-base">
            Hello {data.firstName},
          </h3>
          <p className="text-xs text-[#666666] leading-relaxed">
            Thank you for checking out Lone Star Fence Works. Your fence evaluation has been logged securely under our database. An estimator will reach out to schedule an optional physical validation soon.
          </p>
        </div>

        {/* Breakdown detail list */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="block text-[10px] font-black text-american-blue uppercase tracking-wider">
              Customer Info
            </span>
            <span className="block text-[#111111] font-bold">
              {data.firstName} {data.lastName}
            </span>
            <span className="block text-[#666666]">{data.phone}</span>
            <span className="block text-[#666666]">{data.email}</span>
            <span className="block text-[#666666] truncate">{data.address}</span>
          </div>

          <div className="space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="block text-[10px] font-black text-american-blue uppercase tracking-wider">
              Fence Parameters
            </span>
            <div className="grid grid-cols-2 gap-2 text-[#555555]">
              <div>
                <span className="block text-[9px] text-[#888888]">STYLE:</span>
                <span className="font-bold text-[#111111]">{data.fenceType}</span>
              </div>
              <div>
                <span className="block text-[9px] text-[#888888]">SPAN:</span>
                <span className="font-bold text-[#111111]">{data.linearFeet} LF</span>
              </div>
              <div>
                <span className="block text-[9px] text-[#888888]">HEIGHT:</span>
                <span className="font-bold text-[#111111]">{data.height}' Tall</span>
              </div>
              <div>
                <span className="block text-[9px] text-[#888888]">MATERIAL:</span>
                <span className="font-bold text-[#111111]">{data.material}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Grand Total display */}
        <div className="border-t border-[#E5E5E5] pt-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="block text-[9px] font-black text-[#888888] uppercase tracking-wider">
              Estimated Total Price:
            </span>
            <span className="text-xs text-slate-500 italic">
              *Includes delivery, posts, hardware, tax, & labor
            </span>
          </div>
          <span className="text-3xl font-black text-emerald-600">
            ${Math.round(breakdown.total).toLocaleString()}
          </span>
        </div>

        {/* Sync feedback */}
        {ghlSynced && (
          <div className="mt-4 p-3 rounded-xl bg-blue-50 text-american-blue text-xs font-medium text-center border border-blue-100 flex items-center justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
            Synchronized directly to Lone Star Customer Portal (Go High Level CRM)
          </div>
        )}
      </div>

      {/* Bottom utilities */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center items-center print:hidden">
        <button
          onClick={handlePrint}
          className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl border border-[#D5D5D5] bg-white text-[#222222] font-bold px-6 py-3.5 text-sm hover:bg-slate-50 hover:border-[#111111] transition-all"
        >
          <Printer size={16} />
          Print Estimate
        </button>

        <button
          onClick={onReset}
          className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-american-blue text-white font-black uppercase tracking-wider px-6 py-3.5 text-sm shadow-xl shadow-american-blue/20 hover:bg-american-blue/90 transition-all"
        >
          <RotateCcw size={16} />
          Start New Estimate
        </button>
      </div>
    </div>
  );
}
