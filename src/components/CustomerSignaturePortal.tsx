import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  FileCheck2, 
  Signature, 
  User, 
  Mail, 
  Lock, 
  AlertCircle, 
  Printer, 
  ArrowRight, 
  MessageSquare,
  Sparkles
} from 'lucide-react';
import { MaterialItem, LaborRates, SupplierQuote, SavedEstimate } from '../types';
import CustomerContract from './CustomerContract';
import { formatCurrency } from '../lib/utils';
import { COMPANY_INFO } from '../constants';

interface ErrorBoundaryProps {
  children?: ReactNode;
  estimateId: string;
  portalVersion: string;
  estimate: any;
  onAccept: (sig: string, email: string) => Promise<boolean>;
  onDecline: (reason: string) => Promise<boolean>;
  companyPhone: string;
  companyEmail: string;
  companyName: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class CustomerPortalErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
    
    // On render failure, log render failure details
    const estimate = this.props.estimate || {};
    const contractSnapshotExists = !!(estimate.contractSnapshot);
    const customerDecision = estimate.customerDecision || "pending";
    const finalCustomerPrice = estimate.finalCustomerPrice || estimate.totalInvestment || (estimate.contractSnapshot)?.finalCustomerPrice || 0;

    console.error({
      estimateId: this.props.estimateId,
      componentName: "CustomerContract",
      errorMessage: error.message,
      stackTrace: error.stack,
      contractSnapshotExists,
      customerDecision,
      finalCustomerPrice
    });
  }

  public render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || "Unknown rendering error";
      const componentName = "CustomerContract";
      const stackTrace = this.state.error?.stack || "";
      const estimate = this.props.estimate || {};
      const contractSnapshotExists = !!(estimate.contractSnapshot);
      const customerDecision = estimate.customerDecision || "pending";
      const finalCustomerPrice = estimate.finalCustomerPrice || estimate.totalInvestment || (estimate.contractSnapshot)?.finalCustomerPrice || 0;
      
      const formatCurrencyLocal = (val: any) => {
        const num = Number(val || 0);
        return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      };

      return (
        <div className="flex flex-col min-h-screen bg-[#010915] text-white font-sans p-4 md:p-8" id="fallback-portal-view">
          <div className="max-w-4xl w-full mx-auto space-y-8">
            
            {/* Header / Brand */}
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <span className="text-sm font-black uppercase tracking-widest text-[#ef4444]">{this.props.companyName || "Lone Star Fence Works"} Portal</span>
              <span className="text-xs font-mono text-slate-400">Version: {this.props.portalVersion}</span>
            </div>

            {/* ERROR CARD */}
            <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-6 md:p-8 shadow-2xl space-y-6">
              <div className="flex items-center gap-4 text-red-500 border-b border-slate-800 pb-4">
                <span className="text-3xl">⚠️</span>
                <h2 className="text-lg md:text-xl font-black uppercase tracking-tight">Estimate Loaded But Display Failed</h2>
              </div>
              
              <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                We were able to locate your estimate, but the portal encountered an interactive display error. No worries, your estimate data is entirely safe and on file with us.
              </p>
              
              <p className="text-xs md:text-sm font-semibold text-slate-300 leading-relaxed">
                Please contact Lone Star Fence Works for assistance.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">Phone</p>
                  <a href={`tel:${this.props.companyPhone.replace(/\D/g, "")}`} className="text-sm text-red-400 font-bold hover:underline">
                    {this.props.companyPhone || "(469) 560-6269"}
                  </a>
                </div>
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">Email</p>
                  <a href={`mailto:${this.props.companyEmail}`} className="text-sm text-red-400 font-bold hover:underline">
                    {this.props.companyEmail || "bradens@lonestarfenceworks.com"}
                  </a>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 py-3 bg-[#b91c1c] hover:bg-[#a11818] active:scale-[0.98] transition-all rounded-xl text-xs font-black uppercase tracking-widest text-white shadow-lg"
                >
                  Retry Loading Estimate
                </button>
                <button
                  onClick={() => {
                    const el = document.getElementById("diagnostic-panel");
                    if (el) el.classList.toggle("hidden");
                  }}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] transition-all rounded-xl text-xs font-black uppercase tracking-widest text-slate-300 border border-slate-700"
                >
                  Show Diagnostic Details
                </button>
              </div>

              {/* Diagnostic Panel */}
              <div id="diagnostic-panel" className="hidden pt-4 border-t border-slate-800 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Diagnostic Details Panel</h3>
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs font-mono space-y-2 text-slate-300 overflow-x-auto max-h-60">
                  <p><span className="text-slate-500">estimateId:</span> {this.props.estimateId || "N/A"}</p>
                  <p><span className="text-slate-500">API status:</span> success</p>
                  <p><span className="text-slate-500">contractSnapshot exists:</span> {contractSnapshotExists ? "true" : "false"}</p>
                  <p><span className="text-slate-500">customerDecision:</span> {customerDecision}</p>
                  <p><span className="text-slate-500">finalCustomerPrice:</span> {formatCurrencyLocal(finalCustomerPrice)}</p>
                  <p><span className="text-slate-500">portal build version:</span> {this.props.portalVersion}</p>
                  <p><span className="text-slate-500">renderBuild:</span> "public-portal-safe-render-v1"</p>
                  <p><span className="text-slate-500">userAgent:</span> {navigator?.userAgent || "unknown"}</p>
                  <p><span className="text-slate-500">exact error message:</span> {errorMsg}</p>
                  <p><span className="text-slate-500">component that failed:</span> {componentName}</p>
                  <p><span className="text-slate-500">stack trace:</span></p>
                  <pre className="text-[10px] text-red-00 whitespace-pre-wrap">{stackTrace}</pre>
                </div>
              </div>
            </div>

            {/* MINIMUM FALLBACK VIEW */}
            <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-6 md:p-8 space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Core Proposal Summary (Safe Mode)</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-extrabold">Customer Name</span>
                  <span className="text-slate-200 font-bold">{this.props.estimate?.customerName || "Valued Client"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-extrabold">Job Address</span>
                  <span className="text-slate-200 font-bold">{this.props.estimate?.customerAddress || this.props.estimate?.address || "N/A"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-extrabold">Fence Type</span>
                  <span className="text-slate-200 font-bold">{this.props.estimate?.fenceType || (this.props.estimate?.contractSnapshot as any)?.fenceType || "Fence Project"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-extrabold">Linear Feet</span>
                  <span className="text-slate-200 font-bold">
                    {this.props.estimate?.linearFeet !== undefined ? `${this.props.estimate.linearFeet} LF` : "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-extrabold">Estimate Number</span>
                  <span className="text-slate-200 font-bold">#{this.props.estimate?.estimateNumber || "Draft"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-extrabold">Project Total</span>
                  <span className="text-xl font-mono font-black text-green-400">
                    {formatCurrencyLocal(finalCustomerPrice)}
                  </span>
                </div>
              </div>

              {/* Fallback decision buttons */}
              <div className="border-t border-slate-800 pt-6">
                {customerDecision === "accepted" ? (
                  <div className="bg-green-950/40 border border-green-800 p-4 rounded-xl flex items-center gap-3 text-green-400">
                    <span className="text-xl">✅</span>
                    <div>
                      <h4 className="font-bold">Contract Digitally Authorized</h4>
                      <p className="text-xs text-slate-400">Signed digitally by client</p>
                    </div>
                  </div>
                ) : customerDecision === "declined" ? (
                  <div className="bg-red-950/40 border border-red-800 p-4 rounded-xl flex items-center gap-3 text-red-00">
                    <span className="text-xl">❌</span>
                    <div>
                      <h4 className="font-bold">Proposal Declined</h4>
                      <p className="text-xs text-slate-400">Comments: {this.props.estimate?.customerDeclineReason || "None"}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                      You can still sign and accept or decline this business contract directly in safe mode:
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 items-center">
                      <input
                        type="text"
                        id="fallback-sig-name-input"
                        placeholder="Type Legal Full Name to Sign"
                        className="w-full sm:flex-1 bg-slate-950 border border-slate-800 focus:border-red-500 rounded-xl px-4 py-3 text-sm text-white outline-none font-medium"
                      />
                      <button
                        onClick={async () => {
                          const inputVal = (document.getElementById("fallback-sig-name-input") as HTMLInputElement)?.value || "";
                          if (!inputVal.trim()) {
                            alert("Proof of signature name is required.");
                            return;
                          }
                          const ok = await this.props.onAccept(inputVal, this.props.estimate?.customerEmail || "");
                          if (ok) {
                            this.setState({ hasError: false, error: null, errorInfo: null });
                          }
                        }}
                        className="w-full sm:w-auto px-6 py-3 bg-green-600 hover:bg-green-500 active:scale-95 transition-all text-xs font-black uppercase tracking-widest text-white rounded-xl shadow-lg"
                      >
                        Sign & Accept
                      </button>
                      <button
                        onClick={async () => {
                          const feedback = prompt("Please provide a brief reason for declining:");
                          if (feedback === null) return;
                          if (!feedback.trim()) {
                            alert("Decline feedback is required.");
                            return;
                          }
                          const ok = await this.props.onDecline(feedback);
                          if (ok) {
                            this.setState({ hasError: false, error: null, errorInfo: null });
                          }
                        }}
                        className="w-full sm:w-auto px-6 py-3 bg-transparent border border-slate-700 hover:border-slate-600 text-xs font-black uppercase tracking-widest text-slate-300 rounded-xl transition-all"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface CustomerSignaturePortalProps {
  estimateId: string;
  materials: MaterialItem[];
  laborRates: LaborRates;
  quotes: SupplierQuote[];
}

export default function CustomerSignaturePortal({
  estimateId,
  materials,
  laborRates,
  quotes
}: CustomerSignaturePortalProps) {
  const [estimate, setEstimate] = useState<SavedEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeEstimateId, setActiveEstimateId] = useState('');
  
  // Dynamic brand identity resolutions from active user settings
  const settings = (estimate as any)?.settings;
  const companyLogo = settings?.companyLogo || COMPANY_INFO.logo;
  const companyName = settings?.companyName || 'Lone Star Fence Works';
  const companyPhone = settings?.companyPhone || COMPANY_INFO.phone;
  const companyEmail = settings?.companyEmail || COMPANY_INFO.email;
  const companyWebsite = settings?.companyWebsite || COMPANY_INFO.website;

  // Gracefully clean up case where last name is misplaced in the email field
  const resolvedClientName = React.useMemo(() => {
    if (!estimate) return 'Valued Customer';
    let name = estimate.customerName || 'Valued Customer';
    const email = estimate.customerEmail || '';
    if (email && !email.includes('@') && name && !name.toLowerCase().includes(email.toLowerCase())) {
      name = `${name} ${email}`.trim();
    }
    return name;
  }, [estimate]);

  const resolvedClientEmail = React.useMemo(() => {
    if (!estimate) return '';
    const email = estimate.customerEmail || '';
    if (email && !email.includes('@')) {
      return '';
    }
    return email;
  }, [estimate]);
  
  // Modals for signing / declining
  const [showSignModal, setShowSignModal] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  
  // Forms inputs
  const [signatureName, setSignatureName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    // Read estimateId from window.location.search first as required, falling back to props
    const urlParams = new URLSearchParams(window.location.search);
    const resolvedEstimateId = urlParams.get('estimateId') || urlParams.get('id') || estimateId || '';
    const resolvedVersionId = urlParams.get('versionId') || '';
    setActiveEstimateId(resolvedEstimateId);

    async function loadPublicEstimate() {
      try {
        setLoading(true);
        if (!resolvedEstimateId || resolvedEstimateId === 'undefined' || resolvedEstimateId === 'null') {
          console.log({
            estimateId: resolvedEstimateId,
            action: 'get-public-estimate',
            found: false,
            contractSnapshotExists: false
          });
          throw new Error('No estimate ID was provided in the link. Please ask your Sales Representative for a fresh estimate link.');
        }

        // Fetch the estimate through secure guest endpoint
        const response = await fetch(`/api/estimates/write?action=get-public-estimate&estimateId=${resolvedEstimateId}&versionId=${resolvedVersionId}`);
        
        if (!response.ok) {
          console.log({
            estimateId: resolvedEstimateId,
            action: 'get-public-estimate',
            found: false,
            contractSnapshotExists: false
          });
          if (response.status === 404) {
            throw new Error('The requested estimate contract was not found. Please verify the link or contact your Sales Representative.');
          }
          throw new Error('This estimate contract could not be retrieved. Please verify the URL or link.');
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          console.log({
            estimateId: resolvedEstimateId,
            action: 'get-public-estimate',
            found: false,
            contractSnapshotExists: false
          });
          throw new Error('The secure portal returned an invalid file format (HTML). This usually means the link has expired or is invalid. Please contact support.');
        }

        const data = await response.json();
        
        // Add validation immediately after API response:
        const hasEstimate = !!data && !!data.success && !!data.estimate;
        const hasContractSnapshot = !!data && !!(data.contractSnapshot || data.estimate?.contractSnapshot);
        const finalCustomerPrice = hasEstimate ? (data.estimate.finalCustomerPrice || data.estimate.totalInvestment || (data.contractSnapshot || data.estimate.contractSnapshot)?.finalCustomerPrice || 0) : 0;

        console.log("PUBLIC ESTIMATE RESPONSE", {
          estimateId: resolvedEstimateId,
          hasEstimate,
          hasContractSnapshot,
          finalCustomerPrice
        });

        // Debug logging on portal load (required):
        console.log({
          estimateId: resolvedEstimateId,
          portalVersion: "public-portal-safe-render-v1",
          contractSnapshotExists: hasContractSnapshot,
          finalCustomerPrice
        });

        if (!hasEstimate) {
          throw new Error('Estimate data was missing or empty in target API response.');
        }

        const estimateObj = data.estimate;
        if (!estimateObj.contractSnapshot && data.contractSnapshot) {
          estimateObj.contractSnapshot = data.contractSnapshot;
        }

        setEstimate(estimateObj);
        const initialEmail = estimateObj.customerEmail || '';
        setCustomerEmail(initialEmail.includes('@') ? initialEmail : '');
        
        // Notify the server that the estimate was opened/viewed
        fetch(`/api/estimates/write`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'view-public-estimate', 
            estimateId: resolvedEstimateId,
            versionId: resolvedVersionId
          })
        })
          .then(res => res.json())
          .then(track => console.log('View event recorded:', track))
          .catch(e => console.warn('Failed to record view event:', e));

      } catch (err: any) {
        setError(err.message || 'Failed to fetch public contract');
      } finally {
        setLoading(false);
      }
    }

    if (resolvedEstimateId && resolvedEstimateId !== 'undefined' && resolvedEstimateId !== 'null') {
      loadPublicEstimate();
    } else {
      setError('No estimate ID was found in the link. Please verify the URL or request a new estimate link.');
      setLoading(false);
    }
  }, [estimateId]);

  const handleAcceptFallback = async (sigName: string, email: string): Promise<boolean> => {
    try {
      setIsSubmitting(true);
      const urlParams = new URLSearchParams(window.location.search);
      const resolvedVersionId = urlParams.get('versionId') || '';
      const response = await fetch(`/api/estimates/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'decision-public-estimate',
          estimateId: activeEstimateId || estimateId,
          versionId: resolvedVersionId,
          decision: 'accepted',
          signature: sigName,
          customerEmail: email
        })
      });

      if (!response.ok) {
        throw new Error('Failed to record contract acceptance.');
      }

      const result = await response.json();
      if (result.success) {
        setActionSuccess('accepted');
        setShowSignModal(false);
        setEstimate(prev => prev ? {
          ...prev,
          customerDecision: 'accepted',
          customerSignature: sigName,
          customerDecisionDate: new Date().toISOString(),
          customerSignedDate: new Date().toISOString(),
          acceptedAt: new Date().toISOString(),
          jobStatus: 'Accepted'
        } : null);
        return true;
      }
      return false;
    } catch (err: any) {
      alert(err.message || "An error occurred.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeclineFallback = async (reason: string): Promise<boolean> => {
    try {
      setIsSubmitting(true);
      const urlParams = new URLSearchParams(window.location.search);
      const resolvedVersionId = urlParams.get('versionId') || '';
      const response = await fetch(`/api/estimates/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'decision-public-estimate',
          estimateId: activeEstimateId || estimateId,
          versionId: resolvedVersionId,
          decision: 'declined',
          declineReason: reason
        })
      });

      if (!response.ok) {
        throw new Error('Failed to record contract decline.');
      }

      const result = await response.json();
      if (result.success) {
        setActionSuccess('declined');
        setShowDeclineModal(false);
        setEstimate(prev => prev ? {
          ...prev,
          customerDecision: 'declined',
          customerDeclineReason: reason,
          customerDecisionDate: new Date().toISOString(),
          jobStatus: 'Declined'
        } : null);
        return true;
      }
      return false;
    } catch (err: any) {
      alert(err.message || "An error occurred.");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signatureName.trim()) {
      alert("Please enter your name to digitally sign the contract.");
      return;
    }
    await handleAcceptFallback(signatureName, customerEmail);
  };

  const handleDecline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!declineReason.trim()) {
      alert("Please provide a reason for declining so we can make adjustments.");
      return;
    }
    await handleDeclineFallback(declineReason);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] px-4 font-sans text-[#1A1A1A]" id="portal-loading">
        <div className="flex flex-col items-center max-w-md text-center">
          <div className="mb-6 flex flex-col items-center">
            {companyLogo && (
              <img 
                src={companyLogo} 
                alt={companyName} 
                className="h-20 w-auto object-contain animate-pulse max-h-24 max-w-[200px]"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="mt-3 flex flex-col items-center">
              <span className="text-lg font-black uppercase tracking-tight text-[#0c1a30]">{companyName}</span>
            </div>
          </div>
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-t-[#0c1a30] border-r-[#b91c1c] border-b-transparent border-l-transparent my-4"></div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 font-mono mt-2">Loading secure contract portal...</p>
        </div>
      </div>
    );
  }

  if (error || !estimate) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] px-4 font-sans" id="portal-error">
        <div className="bg-white p-8 md:p-12 rounded-[32px] shadow-2xl border border-red-100 max-w-lg text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 mb-6">
            <AlertCircle size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight mb-2">Estimate Not Found</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-6">
            {error || `This proposal contract could not be loaded. This link may have expired, or the estimate number is incorrect. Please contact support.`}
          </p>
          <div className="space-y-2 text-xs font-semibold text-slate-500 uppercase tracking-widest font-mono">
            <p>Phone: {companyPhone}</p>
            <p>Email: {companyEmail}</p>
          </div>
        </div>
      </div>
    );
  }

  // Determine current status
  const currentDecision = (!estimate.customerDecision || (estimate.customerDecision as any) === 'pending') ? null : estimate.customerDecision; 
  const formattedDecisionDate = estimate.customerDecisionDate 
    ? new Date(estimate.customerDecisionDate).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="min-h-screen bg-[#F4F6F8] font-sans pb-24" id="customer-approval-portal">
      {/* Top Bar Banner with Status */}
      <div className="sticky top-0 z-50 bg-[#0c1a30] text-white border-b-4 border-[#b91c1c] shadow-md print:hidden">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/15 p-2 rounded-xl">
              <FileCheck2 size={24} className="text-[#ef4444]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#ef4444]">{companyName} Contract Portal</span>
                <span className="text-[10px] font-bold text-slate-300 font-mono">#{estimate.estimateNumber || 'Draft'}</span>
              </div>
              <h1 className="text-sm md:text-base font-black uppercase tracking-tight">
                Review & Approvals &bull; {resolvedClientName}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Real-time status display */}
            {!currentDecision ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="hidden xs:flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                </span>
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-yellow-500 mr-1 sm:mr-2">Pending</span>

                <button
                  onClick={() => setShowDeclineModal(true)}
                  className="px-2.5 py-1.5 sm:px-4 sm:py-2 border border-slate-600 hover:border-red-500 text-slate-300 hover:text-red-400 font-bold text-[10px] sm:text-xs uppercase tracking-widest rounded-xl transition-all"
                >
                  Decline
                </button>
                <button
                  onClick={() => setShowSignModal(true)}
                  className="px-3 py-2 sm:px-5 sm:py-2.5 bg-green-600 hover:bg-green-500 hover:scale-[1.03] active:scale-[0.98] text-white font-black text-[10px] sm:text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1 sm:gap-1.5"
                >
                  <Signature size={12} />
                  Accept & Sign
                </button>
              </div>
            ) : currentDecision === 'accepted' ? (
              <div className="flex items-center gap-2 bg-green-950/40 border border-green-500 px-4 py-2 rounded-xl">
                <CheckCircle size={16} className="text-green-400" />
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-green-400 leading-none">ACCEPTED & SIGNED</p>
                  <p className="text-[9px] font-bold text-slate-300 mt-1">Signed by: {estimate.customerSignature}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-red-950/40 border border-red-500 px-4 py-2 rounded-xl">
                <XCircle size={16} className="text-red-400" />
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-400 leading-none">DECLINED</p>
                  <p className="text-[9px] font-bold text-slate-300 mt-1">Reason: {estimate.customerDeclineReason}</p>
                </div>
              </div>
            )}

            <button
              onClick={() => window.print()}
              title="Print Contract"
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700 ml-1"
            >
              <Printer size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 pt-8 pb-16 space-y-8">
        
        {/* Real-time Confirmation Alerts */}
        <AnimatePresence>
          {actionSuccess && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              className={`p-6 rounded-2xl border-2 flex items-start gap-4 shadow-lg ${
                actionSuccess === 'accepted' 
                  ? 'bg-green-50 border-green-200 text-green-900' 
                  : 'bg-red-50 border-red-200 text-red-900'
              } print:hidden`}
            >
              {actionSuccess === 'accepted' ? (
                <>
                  <div className="p-2.5 bg-green-200 text-green-800 rounded-xl mt-0.5">
                    <CheckCircle size={24} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-bold uppercase tracking-tight text-green-800">Contract Signed Successfully!</h3>
                    <p className="text-sm mt-1 text-green-700 leading-relaxed font-semibold">
                      {settings?.estimateAcceptedMessage || `Thank you for digitally signing. Your approval has been saved. Braden and the team at ${companyName} are reviewing your document and will lock in your installation calendar date shortly.`}
                    </p>
                    
                    {settings?.googleReviewLink && (
                      <div className="mt-4 p-4 bg-white/70 rounded-2xl border border-green-200 shadow-sm text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <p className="text-[11px] font-black uppercase text-green-800 tracking-wider">Help Us Grow!</p>
                          <p className="text-xs text-slate-600 font-medium">Would you mind sharing your feedback with a review? It only takes a second.</p>
                        </div>
                        <a
                          href={settings.googleReviewLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex shrink-0 items-center justify-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md hover:scale-105 active:scale-95"
                        >
                          ★ Leave Google Review
                        </a>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="p-2.5 bg-red-200 text-red-800 rounded-xl mt-0.5">
                    <XCircle size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold uppercase tracking-tight text-red-800">Estimate Decided: Declined</h3>
                    <p className="text-sm mt-1 text-red-700 leading-relaxed">
                      {settings?.estimateDeclinedMessage || "You have declined this contract copy. We have logged your comments and will follow up with you shortly to make revision edits to meet your specifications."}
                    </p>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Customer Portal Version Metadata Header Dashboard */}
        {estimate && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-slate-800 font-sans print:hidden mb-6" id="portal-version-header">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Estimate Identifier</span>
                <span className="block text-sm font-bold text-[#0c1a30] mt-1">
                  Estimate #{estimate.estimateNumber || 'Draft'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Contract Revision</span>
                <span className="block text-sm font-bold text-slate-800 mt-1">
                  {estimate.contractVersion ? `Version ${estimate.contractVersion}` : 'Version 1 (Original)'}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Sent Out Date</span>
                <span className="block text-sm font-bold text-slate-800 mt-1">
                  {estimate.versionSentDate 
                    ? new Date(estimate.versionSentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) 
                    : (estimate.customerSentAt ? new Date(estimate.customerSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Pending dispatch')
                  }
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Current Status</span>
                <div className="mt-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${
                    estimate.customerDecision === 'accepted' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                    estimate.customerDecision === 'declined' ? 'bg-rose-50 border-rose-200 text-rose-800' :
                    'bg-amber-50 border-amber-200 text-amber-800'
                  }`}>
                    {estimate.customerDecision === 'accepted' ? 'ACCEPTED' : 
                     estimate.customerDecision === 'declined' ? 'DECLINED' : 'PENDING'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Informative Welcome Header for Guest Customer */}
        {!currentDecision && !actionSuccess && (
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-3xl p-6 md:p-8 shadow-xl border-b-4 border-[#b91c1c] print:hidden">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-[#ef4444]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">{companyName} Official Portal</span>
                </div>
                <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight">Review Your Custom Fencing Proposal</h2>
                <p className="text-sm text-slate-300 max-w-2xl leading-relaxed font-medium">
                  We are excited to build your new structural fence. Please inspect the Scope of Work, warranties, and itemized linear foot investments below. If everything looks good, sign the contract at the top or bottom of the page to initiate scheduling.
                </p>
              </div>

              <div className="flex flex-col items-center justify-center p-4 bg-white/5 border border-white/10 rounded-2xl min-w-[170px] text-center">
                <Clock className="text-yellow-400 mb-1" size={20} />
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Pricing Guarantee</p>
                <p className="text-sm font-bold text-white mt-0.5">30 Days Active</p>
              </div>
            </div>
          </div>
        )}

        {/* Embed Customer Contract as Read-Only Panel */}
        <div className="relative">
          <CustomerPortalErrorBoundary
            estimateId={activeEstimateId || estimateId}
            portalVersion="public-portal-safe-render-v1"
            estimate={estimate}
            onAccept={handleAcceptFallback}
            onDecline={handleDeclineFallback}
            companyPhone={companyPhone}
            companyEmail={companyEmail}
            companyName={companyName}
          >
            <CustomerContract 
              estimate={estimate} 
              materials={materials} 
              laborRates={laborRates} 
              quotes={quotes}
              aiContractScope={estimate?.contractScope || ''}
              setAiContractScope={() => {}} // Disabled for public view
              isCustomerView={true} // Triggers read-only / hidden UI elements
            />
          </CustomerPortalErrorBoundary>
        </div>

        {/* Digital Signature Footer Form if Pending and loaded */}
        {!currentDecision && (
          <div className="bg-white rounded-3xl p-8 shadow-lg border border-slate-200 mt-8 text-center max-w-2xl mx-auto print:hidden">
            <Signature size={40} className="text-[#0c1a30] mx-auto mb-4" />
            <h3 className="text-lg font-black text-[#0c1a30] uppercase tracking-tight">Accept & Authorize This Contract</h3>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed max-w-md mx-auto">
              Ready to locked in this estimate? Tap below to provide your digital signature and approve construction.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row justify-center items-center gap-3 w-full max-w-sm mx-auto sm:max-w-none">
              <button
                onClick={() => setShowDeclineModal(true)}
                className="w-full sm:w-auto px-6 py-3.5 border-2 border-slate-200 hover:border-red-400 text-slate-600 hover:text-red-500 font-bold text-xs uppercase tracking-widest rounded-2xl transition-all"
              >
                No, Request Revisions
              </button>
              <button
                onClick={() => setShowSignModal(true)}
                className="w-full sm:w-auto px-8 py-3.5 bg-[#0c1a30] hover:bg-[#1a3052] text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-md flex items-center justify-center gap-2"
              >
                <Signature size={16} />
                Sign Now
              </button>
            </div>
          </div>
        )}

        {/* Already Decided Footer Display */}
        {currentDecision && (
          <div className="bg-white rounded-3xl p-8 shadow-md border border-slate-200 max-w-3xl mx-auto text-center mt-8">
            {currentDecision === 'accepted' ? (
              <div className="space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <CheckCircle size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Contract Completed</h3>
                <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                  This fencing agreement was authorized and signed digitally by <strong className="text-slate-900">{estimate.customerSignature}</strong> on {formattedDecisionDate}.
                </p>
                <div className="pt-4 border-t border-slate-100 max-w-md mx-auto text-xs text-slate-400 font-mono flex items-center justify-between">
                  <span>Signee IP: {estimate.customerOpenedIp || 'Recorded'}</span>
                  <span>System Reference: #{estimate.id?.substring(0, 8)}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <XCircle size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Estimate Declined</h3>
                <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                  This proposal copy was declined on {formattedDecisionDate}.
                </p>
                <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-200 max-w-md mx-auto mt-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">Reason Given:</p>
                  <p className="text-xs text-slate-700 italic text-left mt-1 font-medium">"{estimate.customerDeclineReason}"</p>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* SIGN OFF MODAL DIALOG */}
      {showSignModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[32px] shadow-2xl border border-slate-100 w-full max-w-md max-h-[90vh] overflow-y-auto p-8 relative"
          >
            <div className="text-center mb-6">
              <div className="inline-flex p-3 bg-green-50 text-green-600 rounded-2xl mb-3">
                <Signature size={28} />
              </div>
              <h4 className="text-lg font-black text-[#0c1a30] uppercase tracking-tight">Sign Contract Agreement</h4>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">{companyName} &bull; Estimate #{estimate.estimateNumber}</p>
            </div>

            <form onSubmit={handleAccept} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Type Full Name (Legal Signature)</label>
                <div className="relative">
                  <User size={16} className="absolute left-4 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="e.g., John C. Doe"
                    value={signatureName}
                    onChange={(e) => setSignatureName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 focus:border-[#0c1a30] rounded-xl text-sm font-medium outline-none transition-all text-slate-800"
                  />
                </div>
                <p className="text-[9px] text-[#b91c1c] font-bold uppercase tracking-wider">
                  By typing your name, you authorize this digitally generated signature.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Confirm Registered Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-4 top-3.5 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="john@example.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-200 focus:border-[#0c1a30] rounded-xl text-sm font-medium outline-none transition-all text-slate-800"
                  />
                </div>
              </div>

              <div className="p-4 bg-[#F8F9FA] rounded-xl border border-slate-200 text-[11px] text-slate-500 leading-relaxed font-medium flex gap-3">
                <Lock size={16} className="text-[#0c1a30] shrink-0 mt-0.5" />
                <span>
                  This signing portal is secured by 256-bit transactional security. Changes are logged and stored securely with Lone star and your electronic record copy.
                </span>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSignModal(false)}
                  className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-500 active:scale-95 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? 'Signing...' : (
                    <>
                      <CheckCircle size={14} />
                      Sign Contract
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* DECLINE FEEDBACK MODAL DIALOG */}
      {showDeclineModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[32px] shadow-2xl border border-slate-100 w-full max-w-md max-h-[90vh] overflow-y-auto p-8 relative"
          >
            <div className="text-center mb-6">
              <div className="inline-flex p-3 bg-red-50 text-red-600 rounded-2xl mb-3">
                <MessageSquare size={28} />
              </div>
              <h4 className="text-lg font-black text-[#0c1a30] uppercase tracking-tight">Decline Proposal</h4>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-semibold">{companyName} &bull; Review feedback</p>
            </div>

            <form onSubmit={handleDecline} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">Decline Reason / Request Adjustments</label>
                <textarea
                  required
                  placeholder="e.g., 'The linear foot cost is slightly above our budget', or 'We need to change the gate count from 2 to 1', or 'We need Cedar instead of Japanese Pine'..."
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="w-full h-32 p-4 bg-slate-50 border-2 border-slate-200 focus:border-[#0c1a30] rounded-xl text-sm font-medium outline-none transition-all text-slate-800 leading-relaxed resize-none"
                />
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500 leading-normal font-medium">
                We take customer feedback very seriously. Braden will receive these comments directly and will follow up to send updated estimate options.
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeclineModal(false)}
                  className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-500 active:scale-95 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? 'Submitting...' : (
                    <>
                      <XCircle size={14} />
                      Confirm Decline
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

    </div>
  );
}
