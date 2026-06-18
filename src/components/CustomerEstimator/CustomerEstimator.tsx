import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useCustomerEstimator } from './useCustomerEstimator';
import { Globe, ClipboardCheck, ArrowRight, ExternalLink, Calculator, Users, Settings, Image as ImageIcon } from 'lucide-react';
import Step1 from './Step1';
import Step2 from './Step2';
import Step3 from './Step3';
import Step4 from './Step4';
import Step5 from './Step5';
import Step6 from './Step6';
import ClientCrmLeads from './ClientCrmLeads';
import EmbedCodeBuilder from './EmbedCodeBuilder';
import CardPhotosEditor from './CardPhotosEditor';

import { MaterialItem, LaborRates, Estimate } from '../../types';

interface CustomerEstimatorProps {
  standalone?: boolean;
  materials?: MaterialItem[];
  laborRates?: LaborRates;
  estimate?: Partial<Estimate>;
}

export default function CustomerEstimator({ 
  standalone = false,
  materials,
  laborRates,
  estimate,
}: CustomerEstimatorProps) {
  const {
    step,
    data,
    updateField,
    breakdown,
    isSubmitting,
    submitSuccess,
    error,
    ghlSynced,
    webhookSuppressed,
    suppressionReason,
    handleNext,
    handleBack,
    handleSubmit,
    resetEstimator,
  } = useCustomerEstimator(materials, laborRates, estimate);

  // Internal tab state for the suite (only active if NOT standalone)
  const [activeSubTab, setActiveSubTab] = React.useState<'estimator' | 'crm' | 'embed' | 'photos'>('estimator');
  const [leadsCount, setLeadsCount] = React.useState<number>(0);
  const [isEmbedded, setIsEmbedded] = React.useState<boolean>(false);
  const [copiedLink, setCopiedLink] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        setIsEmbedded(window.self !== window.top);
      } catch (e) {
        setIsEmbedded(true);
      }
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleScrollToTop = () => {
      const rootEl = document.getElementById('customer-estimator-root');
      if (!rootEl) return;

      // Find nearest scrollable ancestor container in case we are placed in a custom scroll holder
      let parent = rootEl.parentElement;
      let scrollContainer: HTMLElement | null = null;

      while (parent && parent !== document.body && parent !== document.documentElement) {
        const style = window.getComputedStyle(parent);
        const overflowY = style.overflowY || style.overflow || '';
        const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') && parent.scrollHeight > parent.clientHeight;
        
        if (isScrollable) {
          scrollContainer = parent;
          break;
        }
        parent = parent.parentElement;
      }

      // If we found a scrollable ancestor, scroll that container to the top
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      } else {
        // If standalone and full-page or standard viewport, scroll the whole window smoothly
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });

        // Also ensure the element itself is shifted back into view at the top
        rootEl.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }

      // If inside an iframe, let the parent container know so it can adjust window scroll
      if (isEmbedded) {
        try {
          window.parent.postMessage({ type: 'scroll_to_top' }, '*');
        } catch (postErr) {
          // ignore sandboxed message errors
        }
      }
    };

    // requestAnimationFrame ensures scrolling triggers right after the render phase finishes
    requestAnimationFrame(() => {
      requestAnimationFrame(handleScrollToTop);
    });
  }, [step, activeSubTab, isEmbedded]);

  // Send scroll height to parent window when embedded inside an iframe
  React.useEffect(() => {
    if (!standalone) return;

    const sendHeight = () => {
      const root = document.getElementById('customer-estimator-root');
      if (root) {
        // Measure real content height and add spacing padding for fluid shadow rendering
        const height = root.offsetHeight || root.scrollHeight;
        window.parent.postMessage({ type: 'resize_estimator', height: height + 20 }, '*');
      }
    };

    sendHeight();
    const timer = setTimeout(sendHeight, 300);

    let observer: ResizeObserver | null = null;
    const rootEl = document.getElementById('customer-estimator-root');
    if (rootEl && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        sendHeight();
      });
      observer.observe(rootEl);
    }

    return () => {
      clearTimeout(timer);
      if (observer) {
        observer.disconnect();
      }
    };
  }, [step, standalone, activeSubTab, isEmbedded]);

  // Compute progress percent for steps 1-5
  const progressPercent = Math.min(100, Math.max(0, ((step - 1) / 4) * 100));

  return (
    <div 
      id="customer-estimator-root" 
      className={`font-sans ${
        isEmbedded 
          ? 'bg-[#F8F9FA] h-auto min-h-0 py-2 px-2 flex flex-col justify-start' 
          : (standalone ? 'bg-[#F8F9FA] min-h-screen flex flex-col justify-center py-10 px-4' : 'bg-transparent')
      }`}
    >
      <div 
        className={`w-full max-w-5xl mx-auto ${
          standalone ? 'bg-white rounded-3xl border border-[#E5E5E5] p-6 md:p-10 shadow-xl' : 'space-y-6'
        }`}
      >
        {/* Header bar / Title for standalone */}
        {standalone && (
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-[#E5E5E5] pb-6 mb-8 gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-auto flex flex-col justify-center">
                <span className="text-lg font-black uppercase leading-none tracking-tighter text-american-blue">Lone Star</span>
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-american-red">Fence Works</span>
              </div>
              <div className="h-6 w-px bg-slate-300 hidden md:block" />
              <span className="text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                Homeowner Estimator
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#666666]">
              <Globe size={14} className="text-emerald-500 animate-pulse" />
              <span>Embedded Security Enabled</span>
            </div>
          </div>
        )}

        {/* Title & Tabs for App contractor view (not standalone) */}
        {!standalone && (
          <div className="space-y-6">
            
            {/* Header branding info */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-[#E5E5E5] pb-5 gap-4">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-200/50 px-2 py-0.5 rounded-full">
                  ★ Patriot Builder Management System ★
                </span>
                <h1 className="text-3xl font-black text-american-blue uppercase tracking-tight mt-1">
                  Squarespace-Compatible Widget
                </h1>
                <p className="text-xs font-semibold text-[#666666]">
                  A cohesive estimation suite allowing instant lead routing, pipeline dashboard tracking, and widget generation.
                </p>
              </div>
              
              {/* Embedded Link Copy Box */}
              <button
                onClick={() => {
                  const embeddedUrl = `${window.location.origin}${window.location.pathname}?portal=customer`;
                  navigator.clipboard.writeText(embeddedUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="flex items-center gap-2 rounded-xl bg-slate-900 border border-slate-800 px-4 py-2.5 hover:bg-slate-800 text-xs text-white font-bold tracking-wider transition-all"
              >
                {copiedLink ? (
                  <>
                    <ClipboardCheck size={14} className="text-emerald-400 animate-bounce" />
                    Copied Public Link!
                  </>
                ) : (
                  <>
                    <ExternalLink size={14} className="text-indigo-400" />
                    Copy Public Estimator Link
                  </>
                )}
              </button>
            </div>

            {/* Top Workspace Tab Bar selectors */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-200 p-1.5 rounded-2xl border border-slate-300 shadow-inner">
              
              {/* Tab 1: Homeowner Estimator Wizard */}
              <button
                type="button"
                onClick={() => setActiveSubTab('estimator')}
                className={`py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                  activeSubTab === 'estimator'
                    ? 'bg-white text-american-blue shadow-md border border-slate-200'
                    : 'text-[#555555] hover:text-american-blue hover:bg-white/40'
                }`}
              >
                <Calculator size={14} />
                Estimator Layout
              </button>

              {/* Tab 2: client CRM Leads logs */}
              <button
                type="button"
                onClick={() => setActiveSubTab('crm')}
                className={`py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all relative ${
                  activeSubTab === 'crm'
                    ? 'bg-white text-american-blue shadow-md border border-slate-200'
                    : 'text-[#555555] hover:text-american-blue hover:bg-white/40'
                }`}
              >
                <Users size={14} />
                Client CRM Leads
                {leadsCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-black text-white ring-2 ring-white animate-bounce-slow">
                    {leadsCount}
                  </span>
                )}
              </button>

              {/* Tab 3: Embed Code squarespace compiler */}
              <button
                type="button"
                onClick={() => setActiveSubTab('embed')}
                className={`py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                  activeSubTab === 'embed'
                    ? 'bg-white text-american-blue shadow-md border border-slate-200'
                    : 'text-[#555555] hover:text-american-blue hover:bg-white/40'
                }`}
              >
                <Settings size={14} />
                Embed Code Builder
              </button>

              {/* Tab 4: Customize Card Photos */}
              <button
                type="button"
                onClick={() => setActiveSubTab('photos')}
                className={`py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                  activeSubTab === 'photos'
                    ? 'bg-white text-american-blue shadow-md border border-slate-200'
                    : 'text-[#555555] hover:text-american-blue hover:bg-white/40'
                }`}
              >
                <ImageIcon size={14} />
                Customize Photos
              </button>

            </div>

          </div>
        )}

        {/* Dynamic sub-view router switcher */}
        <div className="mt-4">
          {standalone || activeSubTab === 'estimator' ? (
            <div className="space-y-6">
              {/* Multi-step progress tracker bar (only shown on steps 1-5) */}
              {step <= 5 && (
                <div className="space-y-3 mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-200/55 shadow-inner">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-black text-american-blue uppercase tracking-widest bg-blue-100/60 px-2.5 py-1 rounded-full">
                      Step {step} of 5
                    </span>
                    <span className="font-bold text-[#666666]">
                      {step === 1 && 'Style Selection'}
                      {step === 2 && 'Dimensions & Footage'}
                      {step === 3 && 'Material & Customizations'}
                      {step === 4 && 'Fence Accessories'}
                      {step === 5 && 'Contact Verification & Confirmation'}
                    </span>
                  </div>
                  {/* Progress line */}
                  <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-american-blue to-emerald-600 transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Step Rendering container */}
              <div className="min-h-[400px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    {step === 1 && (
                      <Step1
                        selectedType={data.fenceType}
                        onChange={(type) => updateField('fenceType', type)}
                        onNext={handleNext}
                      />
                    )}

                    {step === 2 && (
                      <Step2
                        linearFeet={data.linearFeet}
                        height={data.height}
                        breakdown={breakdown}
                        onChangeField={updateField}
                        onNext={handleNext}
                        onBack={handleBack}
                        fenceType={data.fenceType}
                        data={data}
                      />
                    )}

                    {step === 3 && (
                      <Step3
                        material={data.material}
                        breakdown={breakdown}
                        onChangeMaterial={(mat) => updateField('material', mat)}
                        onNext={handleNext}
                        onBack={handleBack}
                        fenceType={data.fenceType}
                        isPreStained={data.isPreStained}
                        onChangeField={updateField}
                        reusePosts={data.reusePosts}
                        picketStyle={data.picketStyle}
                        topStyle={data.topStyle}
                        hasTopCap={data.hasTopCap}
                        hasCapAndTrim={data.hasCapAndTrim}
                        pipePaintColor={data.pipePaintColor}
                        pipeWireType={data.pipeWireType}
                      />
                    )}

                    {step === 4 && (
                      <Step4
                        needGates={data.needGates}
                        gateCount={data.gateCount}
                        gateType={data.gateType}
                        siteCondition={data.siteCondition}
                        removeOldFence={data.removeOldFence}
                        breakdown={breakdown}
                        onChangeField={updateField}
                        onNext={handleNext}
                        onBack={handleBack}
                      />
                    )}

                    {step === 5 && (
                      <Step5
                        data={data}
                        breakdown={breakdown}
                        isSubmitting={isSubmitting}
                        error={error}
                        onChangeField={updateField}
                        onSubmit={handleSubmit}
                        onBack={handleBack}
                      />
                    )}

                    {step === 6 && (
                      <Step6
                        data={data}
                        breakdown={breakdown}
                        ghlSynced={ghlSynced}
                        webhookSuppressed={webhookSuppressed}
                        suppressionReason={suppressionReason}
                        onReset={resetEstimator}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          ) : activeSubTab === 'crm' ? (
            <ClientCrmLeads onLeadsCountChange={setLeadsCount} />
          ) : activeSubTab === 'embed' ? (
            <EmbedCodeBuilder materials={materials} laborRates={laborRates} estimate={estimate} />
          ) : (
            <CardPhotosEditor />
          )}
        </div>

      </div>
    </div>
  );
}
