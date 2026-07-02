import React from 'react';
import { Calculator, Save, CheckCircle2 } from 'lucide-react';
import { LaborRates } from '../types';

interface LaborPricingProps {
  laborRates: LaborRates;
  setLaborRates: (rates: LaborRates) => void;
  onSave?: (rates: LaborRates) => Promise<boolean>;
  diagnosticData?: any;
}

export default function LaborPricing({ laborRates, setLaborRates, onSave, diagnosticData }: LaborPricingProps) {
  const [localRates, setLocalRates] = React.useState<LaborRates>(laborRates);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [showInspector, setShowInspector] = React.useState(false);

  // Sync local rates if props change (e.g. from firestore load)
  React.useEffect(() => {
    setLocalRates(laborRates);
  }, [laborRates]);

  const handleChange = (key: keyof LaborRates, value: number) => {
    setLocalRates(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      if (onSave) {
        const success = await onSave(localRates);
        if (success) {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        }
      } else {
        // Fallback to just updating parent state if onSave not provided
        setLaborRates(localRates);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save labor rates:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="h-20 w-20 rounded-[32px] bg-american-red flex items-center justify-center text-white shadow-2xl shadow-american-red/20 transform -rotate-3 hover:rotate-0 transition-transform duration-500">
            <Calculator size={40} />
          </div>
          <div>
            <h1 className="text-4xl font-black text-american-blue tracking-tighter uppercase leading-none">Labor Rate Legend</h1>
            <p className="text-sm font-bold text-american-red uppercase tracking-[0.3em] mt-2">Cristian Palomo's Master Pricing Schedule</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowInspector(!showInspector)}
            className="p-3 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all border border-slate-200 flex items-center gap-2"
            title="Labor Rate Save Inspector"
          >
            <div className={`h-2 w-2 rounded-full ${diagnosticData ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className="text-[10px] font-black uppercase tracking-widest">Inspector</span>
          </button>
          {saveSuccess && (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-xl animate-in fade-in slide-in-from-right-4 duration-300">
              <CheckCircle2 size={18} />
              <span className="text-xs font-black uppercase tracking-widest">Labor rates saved.</span>
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-3 px-8 py-4 bg-american-blue text-white rounded-[20px] font-black uppercase tracking-widest text-xs hover:bg-american-red hover:shadow-xl hover:shadow-american-red/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group shadow-lg shadow-american-blue/20"
          >
            {isSaving ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save size={18} className="group-hover:scale-110 transition-transform" />
            )}
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>

      {showInspector && (
        <div className="bg-slate-900 text-slate-100 rounded-3xl p-8 font-mono text-xs overflow-auto max-h-[600px] border-4 border-american-blue/20 shadow-2xl animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-american-red animate-pulse" />
              <h3 className="text-sm font-black text-white uppercase tracking-widest">Labor Rate Save Inspector</h3>
            </div>
            <button onClick={() => setShowInspector(false)} className="text-slate-500 hover:text-white transition-colors">✕</button>
          </div>
          <div className="space-y-6">
            <section>
              <h4 className="text-emerald-400 font-bold mb-2 uppercase tracking-tighter">1. UI State (Local)</h4>
              <pre className="p-4 bg-black/40 rounded-xl border border-white/5">{JSON.stringify(localRates, null, 2)}</pre>
            </section>
            <section>
              <h4 className="text-emerald-400 font-bold mb-2 uppercase tracking-tighter">2. Last Payload Sent</h4>
              <pre className="p-4 bg-black/40 rounded-xl border border-white/5">{JSON.stringify(diagnosticData?.payloadSent, null, 2) || 'No data'}</pre>
            </section>
            <section>
              <h4 className="text-blue-400 font-bold mb-2 uppercase tracking-tighter">3. API & Endpoints</h4>
              <div className="grid grid-cols-2 gap-4 p-4 bg-black/40 rounded-xl border border-white/5">
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Endpoint</p>
                  <p className="font-bold text-white mt-1">{diagnosticData?.endpoint || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Path Match</p>
                  <p className={`font-bold mt-1 ${diagnosticData?.pathMatch ? 'text-emerald-400' : 'text-american-red'}`}>
                    {diagnosticData?.pathMatch ? 'YES (main)' : 'NO'}
                  </p>
                </div>
              </div>
            </section>
            <section>
              <h4 className="text-amber-400 font-bold mb-2 uppercase tracking-tighter">4. Backend Response</h4>
              <pre className="p-4 bg-black/40 rounded-xl border border-white/5">{JSON.stringify(diagnosticData?.backendResponse, null, 2) || 'No response yet'}</pre>
            </section>
            <section>
              <h4 className="text-purple-400 font-bold mb-2 uppercase tracking-tighter">5. Firestore Verification</h4>
              <div className="space-y-4 p-4 bg-black/40 rounded-xl border border-white/5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Write Path</p>
                    <p className="font-bold text-white mt-1">{diagnosticData?.firestoreWritePath || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Load Path</p>
                    <p className="font-bold text-white mt-1">{diagnosticData?.firestoreLoadPath || 'N/A'}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-white/5">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Value After Write (Read-After-Write)</p>
                  <pre className="mt-2 text-[10px] text-slate-300">{JSON.stringify(diagnosticData?.firestoreValueAfterWrite, null, 2) || 'No data'}</pre>
                </div>
                <div className="pt-4 border-t border-white/5">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Value Loaded on Refresh/Init</p>
                  <pre className="mt-2 text-[10px] text-slate-300">{JSON.stringify(diagnosticData?.firestoreValueLoaded, null, 2) || 'No data'}</pre>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

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
                      value={localRates[item.key as keyof LaborRates]} 
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
                      value={localRates[item.key as keyof LaborRates]} 
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
                { label: "Wood Walk Gate", key: "gateWoodWalk" },
                { label: "Welded Frame Gate (wood drive or metal other than 4')", key: "gateWeldedFrame" },
                { label: "Premade 4' Metal Gate", key: "gateHangPreMade" }
              ].map((item) => (
                <div key={item.key} className="group space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#666666] ml-2 group-hover:text-american-blue transition-colors">
                    {item.label}
                  </label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={localRates[item.key as keyof LaborRates]} 
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
                { label: "Delivery Fee ($)", key: "deliveryFee" },
                { label: "Deeper Post Labor (/FT)", key: "deeperPostLabor" }
              ].map((item) => (
                <div key={item.key} className="group space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#666666] ml-2 group-hover:text-american-blue transition-colors">
                    {item.label}
                  </label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={localRates[item.key as keyof LaborRates] !== undefined ? localRates[item.key as keyof LaborRates] : 1} 
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
