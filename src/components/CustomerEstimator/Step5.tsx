import React from 'react';
import { Mail, Phone, MapPin, User, FileText, Lock, Globe, CheckCircle2 } from 'lucide-react';
import { CustomerEstimateData, EstimateBreakdown, MATERIAL_PRICES, GATE_PRICES } from './customerEstimateCalculations';

interface Step5Props {
  data: CustomerEstimateData;
  breakdown: EstimateBreakdown;
  isSubmitting: boolean;
  error: string | null;
  onChangeField: <K extends keyof CustomerEstimateData>(field: K, val: any) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export default function Step5({
  data,
  breakdown,
  isSubmitting,
  error,
  onChangeField,
  onSubmit,
  onBack,
}: Step5Props) {
  // Simple form validator to toggle button status
  const isValid = React.useMemo(() => {
    return (
      data.firstName.trim().length > 0 &&
      data.lastName.trim().length > 0 &&
      data.email.trim().length > 0 &&
      data.phone.trim().length > 0 &&
      data.address.trim().length > 0
    );
  }, [data]);

  return (
    <div id="step-5-container" className="space-y-6">
      <div className="text-center max-w-xl mx-auto space-y-2">
        <h2 className="text-2xl font-black text-american-blue uppercase tracking-tight">Confirm & Get Estimate</h2>
        <p className="text-sm font-medium text-[#666666]">
          Complete your contact information to lock in your calculated price and receive your official estimate document.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-6xl mx-auto items-start">
        
        {/* Contact Input Form (5 Cols) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-[#E5E5E5] space-y-4 shadow-sm">
          <h3 className="text-sm font-black text-american-blue uppercase tracking-widest border-b border-[#E5E5E5] pb-2 mb-2 flex items-center gap-2">
            <User size={16} />
            Contact & Address Details
          </h3>

          {/* First Name */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#555555] uppercase tracking-wider">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="First Name..."
              value={data.firstName}
              onChange={(e) => onChangeField('firstName', e.target.value)}
              className="block w-full rounded-xl border border-[#D5D5D5] px-4 py-2.5 text-sm font-bold text-[#111111]"
            />
          </div>

          {/* Last Name */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#555555] uppercase tracking-wider">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Last Name..."
              value={data.lastName}
              onChange={(e) => onChangeField('lastName', e.target.value)}
              className="block w-full rounded-xl border border-[#D5D5D5] px-4 py-2.5 text-sm font-bold text-[#111111]"
            />
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#555555] uppercase tracking-wider flex items-center gap-1">
              <Mail size={12} /> Email Address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              placeholder="name@gmail.com..."
              value={data.email}
              onChange={(e) => onChangeField('email', e.target.value)}
              className="block w-full rounded-xl border border-[#D5D5D5] px-4 py-2.5 text-sm font-bold text-[#111111]"
            />
          </div>

          {/* Phone */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#555555] uppercase tracking-wider flex items-center gap-1">
              <Phone size={12} /> Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              required
              placeholder="(555) 000-0000"
              value={data.phone}
              onChange={(e) => onChangeField('phone', e.target.value)}
              className="block w-full rounded-xl border border-[#D5D5D5] px-4 py-2.5 text-sm font-bold text-[#111111]"
            />
          </div>

          {/* Address */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#555555] uppercase tracking-wider flex items-center gap-1">
              <MapPin size={12} /> Site / Project Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="123 Lone Star Hwy, Austin TX..."
              value={data.address}
              onChange={(e) => onChangeField('address', e.target.value)}
              className="block w-full rounded-xl border border-[#D5D5D5] px-4 py-2.5 text-sm font-bold text-[#111111]"
            />
          </div>

          <div className="text-slate-400 text-[10px] flex items-center gap-2 mt-4 pt-4 border-t border-[#E5E5E5]">
            <Lock size={12} className="text-emerald-500" />
            <span>Your information is safely encrypted and secured by Lone Star.</span>
          </div>
        </div>

        {/* Dynamic Pricing Receipt & Scopes Block (7 Cols) */}
        <div className="lg:col-span-7 bg-[#111827] text-white p-6 rounded-2xl shadow-xl space-y-6 border border-slate-800 self-stretch flex flex-col justify-between min-h-[460px]">
          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
            <div className="space-y-0.5">
              <span className="block text-[10px] font-black text-american-red uppercase tracking-widest">
                Lone Star Fence Works
              </span>
              <h3 className="text-lg font-black tracking-tight text-white uppercase">
                Estimate Summary
              </h3>
            </div>
            <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400">
              {data.fenceType || 'Wood Fence'} / {data.linearFeet} LF
            </div>
          </div>

          {/* Simplified Specifications and Overall Range (No Itemized Prices shown until submission) */}
          <div className="space-y-6">
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 space-y-3">
              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-1">
                Project Specifications
              </span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Fence Style:</span>
                  <span className="text-slate-300 font-bold">{data.fenceType || 'Wood Fence'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Linear Footage:</span>
                  <span className="text-slate-300 font-bold">{data.linearFeet} LF</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Panel Height:</span>
                  <span className="text-slate-300 font-bold">{data.height} FT</span>
                </div>
                {data.fenceType === 'Wood Fence' ? (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Wood Finish:</span>
                    <span className="text-slate-300 font-bold">{data.isPreStained ? 'Pre-Stained' : 'Natural / Raw'}</span>
                  </div>
                ) : data.fenceType === 'pipe fence' ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Rail Paint:</span>
                      <span className="text-slate-300 font-bold">{data.pipePaintColor || 'Black'}</span>
                    </div>
                    <div className="flex justify-between text-right">
                      <span className="text-slate-500">Wire Option:</span>
                      <span className="text-slate-300 font-bold">{data.pipeWireType || 'Black'} Coated</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Post Setting:</span>
                      <span className="text-slate-300 font-bold">Concrete Set</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Material Type:</span>
                    <span className="text-slate-300 font-bold">{data.material}</span>
                  </div>
                )}
                {data.needGates && (
                  <div className="flex justify-between col-span-2 border-t border-slate-800/50 pt-2">
                    <span className="text-slate-500">Gate Configuration:</span>
                    <span className="text-slate-300 font-bold">
                      {data.gateCount}x {data.gateType} {data.gateType?.toLowerCase().includes('gate') ? '' : 'Gate'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* GRAND TOTAL RANGE - LOCKED UNTIL SUBMISSION */}
            <div className="bg-slate-900 border border-amber-500/25 p-5 rounded-xl space-y-3 text-center sm:text-left relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-[#f59e0b]/10 text-amber-500 text-[8px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-bl">
                🔒 LOCKED
              </div>
              <span className="block text-[10px] font-black uppercase text-slate-400 tracking-widest">
                Projected Total Investment Range:
              </span>
              
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 pt-0.5">
                <span className="text-lg sm:text-xl font-extrabold text-amber-400 flex items-center gap-2">
                  <Lock size={18} className="animate-pulse text-amber-500 shrink-0" />
                  Locked Until Submit
                </span>
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                  *Turnkey Project Price
                </span>
              </div>

              {!isValid ? (
                <p className="text-[10px] leading-relaxed text-slate-400">
                  Please enter your <strong className="text-white">First Name, Last Name, Email, Phone, and Project Address</strong> on the left to verify your submission and unlock your tailored price estimation.
                </p>
              ) : (
                <p className="text-[10px] leading-relaxed text-slate-300">
                  Contact details complete! Click the <strong className="text-emerald-400">"Get Estimate Now"</strong> button below to secure your lead, log your information, and instantly unlock your official price range.
                </p>
              )}
            </div>
          </div>

          {/* Legal Warranties & Safeguards (Compliant with Lone Star rule) */}
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <h4 className="text-[10px] font-black text-american-red uppercase tracking-widest flex items-center gap-1.5">
              <Globe size={12} />
              Professional Scopes & Warranties
            </h4>
            <ul className="list-disc list-inside text-[10px] text-slate-400 space-y-1.5 leading-relaxed">
              <li>
                <strong className="text-slate-200">New Installation Workmanship:</strong> Full 1-year warranty covering installation defects or connection issues.
              </li>
              <li>
                <strong className="text-slate-200">Environmental Aging Limitations:</strong> Excludes natural weathering, wood cracking, warp, rot under severe conditions, or acts of nature that transcend normal application tolerances.
              </li>
              <li>
                <strong className="text-slate-200">Accurate Raw Sizing:</strong> Quotes are computed explicitly with Japanese/Western Cedar and PT Pine, omitting unbranded terms.
              </li>
            </ul>
          </div>

          {/* Submitting Feedback / Error block */}
          {error && (
            <div className="p-3 bg-red-950/25 border border-red-500/50 rounded-xl text-red-400 text-xs text-center font-bold">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-between max-w-6xl mx-auto pt-6">
        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="rounded-xl px-5 py-3.5 text-sm font-bold border border-[#D5D5D5] bg-white text-[#555555] hover:bg-slate-50 active:scale-95 disabled:opacity-50 transition-all"
        >
          Back
        </button>

        <button
          onClick={onSubmit}
          disabled={!isValid || isSubmitting}
          className={`flex items-center gap-2 rounded-xl px-8 py-4 text-sm font-black uppercase tracking-widest text-white shadow-xl active:scale-95 transition-all ${
            !isValid || isSubmitting
              ? 'bg-slate-600 shadow-none cursor-not-allowed opacity-60'
              : 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-500'
          }`}
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating Quote...
            </>
          ) : (
            <>
              <CheckCircle2 size={16} />
              Get Estimate Now
            </>
          )}
        </button>
      </div>
    </div>
  );
}
