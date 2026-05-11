import React from 'react';
import { Calculator } from 'lucide-react';
import { LaborRates } from '../types';

interface LaborPricingProps {
  laborRates: LaborRates;
  setLaborRates: (rates: LaborRates) => void;
}

export default function LaborPricing({ laborRates, setLaborRates }: LaborPricingProps) {
  const handleChange = (key: keyof LaborRates, value: number) => {
    setLaborRates({
      ...laborRates,
      [key]: value
    });
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex items-center gap-6">
        <div className="h-20 w-20 rounded-[32px] bg-american-red flex items-center justify-center text-white shadow-2xl shadow-american-red/20 transform -rotate-3 hover:rotate-0 transition-transform duration-500">
          <Calculator size={40} />
        </div>
        <div>
          <h1 className="text-4xl font-black text-american-blue tracking-tighter uppercase leading-none">Labor Rate Legend</h1>
          <p className="text-sm font-bold text-american-red uppercase tracking-[0.3em] mt-2">Cristian Palomo's Master Pricing Schedule</p>
        </div>
      </div>

      <div className="bg-white rounded-[50px] p-12 shadow-2xl border-2 border-american-blue/5">
        <div className="grid gap-x-12 gap-y-16 md:grid-cols-2">
          {/* Wood Fence */}
          <div className="space-y-8">
            <div className="flex items-center justify-between border-b-4 border-american-blue/5 pb-4">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-american-blue/40">Wood Fence Labor (/FT)</h4>
              <div className="px-3 py-1 bg-american-blue/5 rounded-full text-[10px] font-black text-american-blue uppercase tracking-widest">Calculated by LF</div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {[
                { label: "Side by Side 6'", key: "woodSideBySide6" },
                { label: "Board on Board 6'", key: "woodBoardOnBoard6" },
                { label: "Side by Side 8'", key: "woodSideBySide8" },
                { label: "Board on Board 8'", key: "woodBoardOnBoard8" }
              ].map((item) => (
                <div key={item.key} className="group space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#666666] ml-2 group-hover:text-american-blue transition-colors">
                    {item.label}
                  </label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={laborRates[item.key as keyof LaborRates]} 
                      onChange={(e) => handleChange(item.key as keyof LaborRates, Number(e.target.value))} 
                      className="w-full rounded-2xl border-3 border-[#F0F0F0] bg-[#F9F9F9] px-5 py-4 text-base font-bold text-american-blue focus:border-american-blue focus:bg-white outline-none transition-all" 
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-[#CCCCCC] group-focus-within:text-american-blue">$</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Metal / Chain Link */}
          <div className="space-y-8">
            <div className="flex items-center justify-between border-b-4 border-american-blue/5 pb-4">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-american-blue/40">Metal / Chain Link (/FT)</h4>
              <div className="px-3 py-1 bg-american-blue/5 rounded-full text-[10px] font-black text-american-blue uppercase tracking-widest">Master Rates</div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {[
                { label: "Iron (Bolt up)", key: "ironBoltUp" },
                { label: "Iron (Weld up)", key: "ironWeldUp" },
                { label: "Chain Link", key: "chainLink" },
                { label: "Pipe / Wire", key: "pipeFence" }
              ].map((item) => (
                <div key={item.key} className="group space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#666666] ml-2 group-hover:text-american-blue transition-colors">
                    {item.label}
                  </label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={laborRates[item.key as keyof LaborRates]} 
                      onChange={(e) => handleChange(item.key as keyof LaborRates, Number(e.target.value))} 
                      className="w-full rounded-2xl border-3 border-[#F0F0F0] bg-[#F9F9F9] px-5 py-4 text-base font-bold text-american-blue focus:border-american-blue focus:bg-white outline-none transition-all" 
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-[#CCCCCC] group-focus-within:text-american-blue">$</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Gate Labor */}
          <div className="space-y-8">
            <div className="flex items-center justify-between border-b-4 border-american-blue/5 pb-4">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-american-blue/40">Gate Labor (Per Unit)</h4>
              <div className="px-3 py-1 bg-american-blue/5 rounded-full text-[10px] font-black text-american-blue uppercase tracking-widest">Install Only</div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {[
                { label: "Wood Walk", key: "gateWoodWalk" },
                { label: "Wood Drive", key: "gateWoodDrive" },
                { label: "Welded Frame", key: "gateWeldedFrame" },
                { label: "Hang Pre-made", key: "gateHangPreMade" }
              ].map((item) => (
                <div key={item.key} className="group space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#666666] ml-2 group-hover:text-american-blue transition-colors">
                    {item.label}
                  </label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={laborRates[item.key as keyof LaborRates]} 
                      onChange={(e) => handleChange(item.key as keyof LaborRates, Number(e.target.value))} 
                      className="w-full rounded-2xl border-3 border-[#F0F0F0] bg-[#F9F9F9] px-5 py-4 text-base font-bold text-american-blue focus:border-american-blue focus:bg-white outline-none transition-all" 
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-[#CCCCCC] group-focus-within:text-american-blue">$</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Technical Services */}
          <div className="space-y-8">
            <div className="flex items-center justify-between border-b-4 border-american-blue/5 pb-4">
              <h4 className="text-xs font-black uppercase tracking-[0.2em] text-american-blue/40">Technical Services</h4>
              <div className="px-3 py-1 bg-american-blue/5 rounded-full text-[10px] font-black text-american-blue uppercase tracking-widest">Upcharges</div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              {[
                { label: "Top Cap (/FT)", key: "topCap" },
                { label: "Demo / Haul (/FT)", key: "demo" },
                { label: "Stain (/SQ FT)", key: "washAndStain" },
                { label: "Delivery Fee ($)", key: "deliveryFee" }
              ].map((item) => (
                <div key={item.key} className="group space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#666666] ml-2 group-hover:text-american-blue transition-colors">
                    {item.label}
                  </label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={laborRates[item.key as keyof LaborRates]} 
                      onChange={(e) => handleChange(item.key as keyof LaborRates, Number(e.target.value))} 
                      className="w-full rounded-2xl border-3 border-[#F0F0F0] bg-[#F9F9F9] px-5 py-4 text-base font-bold text-american-blue focus:border-american-blue focus:bg-white outline-none transition-all" 
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-[#CCCCCC] group-focus-within:text-american-blue">$</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-16 p-8 rounded-[32px] bg-american-blue/5 border-2 border-dashed border-american-blue/10">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-american-blue/10 rounded-lg text-american-blue mt-1">
              <Calculator size={16} />
            </div>
            <div>
              <p className="text-xs font-bold text-american-blue uppercase tracking-widest">Automatic Integration Active</p>
              <p className="text-[10px] text-american-blue/60 mt-1">These values are globally applied to any estimate section based on style selection. Changes here will immediately update all active quotes.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
