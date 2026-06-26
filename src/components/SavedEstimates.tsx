import React from 'react';
import { 
  FileText, Search, Archive, RotateCcw, Trash2, 
  ChevronRight, Calendar, MapPin, DollarSign,
  Filter, MoreVertical, ExternalLink, Download,
  Shield, Check, Briefcase, CheckCircle2, Image as ImageIcon,
  FolderOpen, ArrowLeft, ChevronDown, Mail, Send, Eye, Clock, Lock, AlertCircle, Copy, History
} from 'lucide-react';
import { SavedEstimate, JobStatus, JobPhoto, User, MaterialItem, LaborRates } from '../types';
import { formatCurrency, cn, assignEstimateNumbers, getEstimateFinalPrice } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType, getEstimateDoc } from '../lib/firebase';
import { updateDoc, deleteDoc } from 'firebase/firestore';
import { calculateDetailedTakeOff } from '../lib/calculations';

interface SavedEstimatesProps {
  savedEstimates: SavedEstimate[];
  setSavedEstimates: React.Dispatch<React.SetStateAction<SavedEstimate[]>>;
  onLoadEstimate: (estimate: SavedEstimate) => void;
  setActiveTab: (tab: string) => void;
  user: User | null;
  materials: MaterialItem[];
  laborRates: LaborRates;
}

const STATUS_FLOW: JobStatus[] = ['Estimate Pending', 'Estimate Sent', 'Accepted', 'Completed'];

const getEstimateDisplayStatus = (est: any) => {
  if (est.status === 'archived') return 'Archived';
  const jobStatus = est.jobStatus;
  if (jobStatus === 'Completed') return 'Completed';
  if (jobStatus === 'Declined') return 'Declined';
  if (jobStatus === 'Accepted' || jobStatus === 'Approved') return 'Accepted';
  if (jobStatus === 'Scheduled' || jobStatus === 'In Progress') return 'Scheduled';
  if (jobStatus === 'Estimate Sent') {
    if (!est.customerEmailSent && !est.customerEmailSentAt) {
      if (est.manualStatusOverride === true) {
        return 'Estimate Sent';
      }
      return 'Draft';
    }
    return 'Estimate Sent';
  }
  return 'Draft';
};

const getStatusStyle = (statusLabel: string) => {
  switch (statusLabel) {
    case 'Archived':
      return 'border-gray-200 bg-gray-50 text-gray-500';
    case 'Completed':
      return 'border-purple-200 bg-purple-50 text-purple-700 font-bold';
    case 'Accepted':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 font-bold';
    case 'Declined':
      return 'border-red-200 bg-red-50 text-red-700 font-bold';
    case 'Estimate Sent':
      return 'border-blue-200 bg-blue-50 text-blue-700 font-bold';
    case 'Draft':
    default:
      return 'border-amber-200 bg-amber-50 text-amber-700 font-bold';
  }
};

export default function SavedEstimates({ savedEstimates, setSavedEstimates, onLoadEstimate, setActiveTab, user, materials, laborRates }: SavedEstimatesProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'active' | 'completed' | 'declined' | 'archived'>('active');
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [view, setView] = React.useState<'list' | 'files'>('list');
  const [selectedJobPhotos, setSelectedJobPhotos] = React.useState<SavedEstimate | null>(null);
  const [openDropdownId, setOpenDropdownId] = React.useState<string | null>(null);
  const [selectedLogEstimate, setSelectedLogEstimate] = React.useState<SavedEstimate | null>(null);
  const [selectedHistoryEstimate, setSelectedHistoryEstimate] = React.useState<any>(null);
  const [compareFromId, setCompareFromId] = React.useState<string>("");
  const [compareToId, setCompareToId] = React.useState<string>("");

  // GHL Contact Sync Diagnostic States
  const [syncDiagnosticEstimate, setSyncDiagnosticEstimate] = React.useState<SavedEstimate | null>(null);
  const [syncDiagnosticLoading, setSyncDiagnosticLoading] = React.useState(false);
  const [syncDiagnosticResult, setSyncDiagnosticResult] = React.useState<any>(null);

  const handleRunContactSyncDiagnostic = async (estimate: SavedEstimate) => {
    setSyncDiagnosticEstimate(estimate);
    setSyncDiagnosticLoading(true);
    setSyncDiagnosticResult(null);
    try {
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test-contact-sync',
          estimateId: estimate.id
        })
      });
      const data = await response.json();
      setSyncDiagnosticResult(data);
    } catch (err: any) {
      setSyncDiagnosticResult({
        success: false,
        error: err.message || String(err)
      });
    } finally {
      setSyncDiagnosticLoading(false);
    }
  };

  const [companySettings, setCompanySettings] = React.useState<any>(null);

  // Send Estimate Modal States
  const [sendModalEstimate, setSendModalEstimate] = React.useState<SavedEstimate | null>(null);
  const [senderEmail, setSenderEmail] = React.useState('BradenS@LoneStarFenceWorks.com');
  const [customerEmail, setCustomerEmail] = React.useState('');
  const [emailSubject, setEmailSubject] = React.useState('');
  const [emailMessage, setEmailMessage] = React.useState('');
  const [isSendingEmail, setIsSendingEmail] = React.useState(false);
  const [sendSuccessMessage, setSendSuccessMessage] = React.useState<string | null>(null);
  const [sendErrorMessage, setSendErrorMessage] = React.useState<string | null>(null);

  // Fetch Company Settings to populate templates
  React.useEffect(() => {
    async function loadCompanySettings() {
      try {
        const token = localStorage.getItem('company_admin_token');
        if (!token) return;
        const res = await fetch('/api/settings', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCompanySettings(data);
        }
      } catch (err) {
        console.warn('Failed to load company settings inside SavedEstimates:', err);
      }
    }
    loadCompanySettings();
  }, [sendModalEstimate]); // Reload slightly on modal show to pick up fresh updates

  React.useEffect(() => {
    if (sendModalEstimate) {
      setCustomerEmail(sendModalEstimate.customerEmail || '');
      
      const host = window.location.host;
      const protocol = window.location.protocol;
      const estimateLink = `${protocol}//${host}/?portal=contract&estimateId=${sendModalEstimate.id}`;
      const clientName = sendModalEstimate.customerName || 'Valued Customer';

      let activeFromEmail = 'BradenS@LoneStarFenceWorks.com';
      let activeFromName = 'Lone Star Fence Works';
      let activeSubject = `Fence Installation Contract Agreement - Lone Star Fence Works`;
      let activeMessage = `Hello ${clientName},\n\nWe have generated your custom fencing contract agreement estimate. Please review and sign the agreement directly on your device using the secure link below:\n\n${estimateLink}\n\nThank you for choosing Lone Star Fence Works!\n\nBest regards,\nLone Star Fence Works Estimations Department`;

      if (companySettings) {
        if (companySettings.fromEmail) activeFromEmail = companySettings.fromEmail;
        if (companySettings.fromName) activeFromName = companySettings.fromName;
        
        if (companySettings.estimateEmailSubject) {
          activeSubject = companySettings.estimateEmailSubject
            .replace(/{customerName}/g, clientName)
            .replace(/{estimateNumber}/g, String(sendModalEstimate.estimateNumber || ''))
            .replace(/{companyName}/g, companySettings.fromName || 'Lone Star Fence Works');
        }

        if (companySettings.estimateEmailBody) {
          activeMessage = companySettings.estimateEmailBody
            .replace(/{customerName}/g, clientName)
            .replace(/{customerEmail}/g, sendModalEstimate.customerEmail || '')
            .replace(/{estimateNumber}/g, String(sendModalEstimate.estimateNumber || ''))
            .replace(/{estimateLink}/g, estimateLink)
            .replace(/{companyName}/g, companySettings.fromName || 'Lone Star Fence Works')
            .replace(/{companyPhone}/g, companySettings.companyPhone || '')
            .replace(/{companyWebsite}/g, companySettings.companyWebsite || '');
        }
      }

      setSenderEmail(activeFromEmail);
      setEmailSubject(activeSubject);
      setEmailMessage(activeMessage);
      setSendSuccessMessage(null);
      setSendErrorMessage(null);
    }
  }, [sendModalEstimate, companySettings]);

  const handleSendEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendModalEstimate) return;
    if (!customerEmail) {
      setSendErrorMessage('Customer email is required.');
      return;
    }

    setIsSendingEmail(true);
    setSendSuccessMessage(null);
    setSendErrorMessage(null);

    try {
      // 1. Recalculate takeoff first on the frontend
      const mergedEstimate = {
        ...sendModalEstimate,
        manualSectionTotals: sendModalEstimate.manualSectionTotals || [],
        manualGateTotals: sendModalEstimate.manualGateTotals || [],
        manualDemoTotals: sendModalEstimate.manualDemoTotals || [],
        manualGrandTotal: sendModalEstimate.manualGrandTotal !== undefined ? sendModalEstimate.manualGrandTotal : null,
        manualGatePrices: sendModalEstimate.manualGatePrices || {}
      } as any;
      
      const recalculatedTakeOff = calculateDetailedTakeOff(mergedEstimate, materials, laborRates);
      const pricing = recalculatedTakeOff.pricing;
      const finalPrice = pricing.finalCustomerPrice;

      // Gate Summary construction
      let gateCount = 0;
      let singleGates = 0;
      let doubleGates = 0;
      const runsData = mergedEstimate.runs || [];
      runsData.forEach((run: any) => {
        const gatesList = run.gateDetails || run.gates || [];
        gatesList.forEach((gate: any) => {
          gateCount++;
          if (String(gate.gateType || '').toLowerCase().includes('double') || String(gate.type || '').toLowerCase().includes('double')) {
            doubleGates++;
          } else {
            singleGates++;
          }
        });
      });
      const gateSummary = gateCount > 0 
        ? `${gateCount} Gate(s) (${singleGates} Single, ${doubleGates} Double)`
        : 'None';

      // Fence type summary
      const styles = Array.from(new Set(recalculatedTakeOff.runs.map((r: any) => r.style || 'Custom Fence')));
      const fenceType = styles.length === 0 ? 'Custom Fence' : styles.length === 1 ? styles[0] : 'Multi-Style Wood/Iron Fence';

      const height = mergedEstimate.defaultHeight || (recalculatedTakeOff.runs[0]?.height) || 6;

      // Map costSummaryRuns and runBreakdown explicitly to match requested schema:
      const costSummaryRuns = recalculatedTakeOff.runs.map((run: any, i: number) => {
        const origRun: any = runsData[i] || {};
        const pricingRun = (pricing.runsPricing?.[i] || {}) as any;
        const finalFenceValue = pricingRun.finalFence !== undefined ? pricingRun.finalFence : (pricingRun.totalFenceCharge || run.totalFenceCharge || run.finalFence || 0);
        const finalGateValue = pricingRun.finalGate !== undefined ? pricingRun.finalGate : (pricingRun.totalGateCharge || run.totalGateCharge || run.finalGate || 0);
        const finalDemoValue = pricingRun.finalDemo !== undefined ? pricingRun.finalDemo : (pricingRun.demoCharge || run.demoCharge || run.finalDemo || 0);
        return {
          runName: run.runName || origRun.name || `Section ${i + 1}`,
          fenceType: run.style || origRun.styleId || '',
          height: run.height || 6,
          linearFeet: run.netLF,
          fenceRate: run.netLF > 0 ? finalFenceValue / run.netLF : 0,
          fenceTotal: finalFenceValue,
          gatesTotal: finalGateValue,
          demoTotal: finalDemoValue,
          sectionTotal: pricingRun.totalSection !== undefined ? pricingRun.totalSection : (finalFenceValue + finalGateValue + finalDemoValue)
        };
      });

      const fenceTotal = pricing.runsPricing?.reduce((sum: number, r: any) => sum + (r.finalFence || 0), 0) || 0;
      const gatesTotal = pricing.runsPricing?.reduce((sum: number, r: any) => sum + (r.finalGate || 0), 0) || 0;
      const demoTotal = pricing.runsPricing?.reduce((sum: number, r: any) => sum + (r.finalDemo || 0), 0) || 0;
      const sectionTotalsArr = pricing.runsPricing?.map((r: any) => r.totalSection || 0) || [];

      // Create the contractSnapshot object
      const contractSnapshot = {
        estimateId: String(sendModalEstimate.id),
        estimateNumber: mergedEstimate.estimateNumber || sendModalEstimate.estimateNumber || '',
        customerName: mergedEstimate.customerName || 'Valued Customer',
        customerEmail: customerEmail || mergedEstimate.customerEmail || sendModalEstimate.customerEmail || '',
        customerPhone: mergedEstimate.customerPhone || sendModalEstimate.customerPhone || '',
        customerAddress: mergedEstimate.customerAddress || sendModalEstimate.customerAddress || '',
        drawingUrl: mergedEstimate.drawingUrl || sendModalEstimate.drawingUrl || '',
        drawingFileName: mergedEstimate.drawingFileName || sendModalEstimate.drawingFileName || '',
        drawingMimeType: mergedEstimate.drawingMimeType || sendModalEstimate.drawingMimeType || '',
        fenceType: fenceType,
        height: height,
        linearFeet: Number(mergedEstimate.linearFeet || recalculatedTakeOff.runs.reduce((sum: number, r: any) => sum + r.netLF, 0) || 0),
        runs: recalculatedTakeOff.runs.map((run: any, i: number) => {
          const origRun: any = runsData[i] || {};
          const pricingRun = (pricing.runsPricing?.[i] || {}) as any;
          const finalFenceValue = pricingRun.finalFence !== undefined ? pricingRun.finalFence : (pricingRun.totalFenceCharge || run.totalFenceCharge || run.finalFence || 0);
          const finalGateValue = pricingRun.finalGate !== undefined ? pricingRun.finalGate : (pricingRun.totalGateCharge || run.totalGateCharge || run.finalGate || 0);
          const finalDemoValue = pricingRun.finalDemo !== undefined ? pricingRun.finalDemo : (pricingRun.demoCharge || run.demoCharge || run.finalDemo || 0);
          return {
            name: run.runName || origRun.name || `Section ${i + 1}`,
            runName: run.runName || origRun.name || `Section ${i + 1}`,
            linearFeet: run.netLF,
            totalFenceCharge: finalFenceValue,
            pricePerFoot: run.netLF > 0 ? finalFenceValue / run.netLF : 0,
            totalGateCharge: finalGateValue,
            demoCharge: finalDemoValue,
            gateDetails: origRun.gateDetails || origRun.gates || [],
            styleName: run.style || '',
            styleType: run.styleType || '',
            height: run.height || 6,
            hasRotBoard: !!run.hasRotBoard,
            hasTopCap: !!run.hasTopCap,
            hasTrim: !!run.hasTrim,
            picketStyle: run.picketStyle || '',
            ironInstallType: run.ironInstallType || '',
            ironPanelType: run.ironPanelType || '',
            
            // Explicit run snapshot properties requested
            fenceType: run.style || origRun.styleId || '',
            fenceRate: run.netLF > 0 ? finalFenceValue / run.netLF : 0,
            fenceTotal: finalFenceValue,
            gatesTotal: finalGateValue,
            demoTotal: finalDemoValue,
            sectionTotal: pricingRun.totalSection !== undefined ? pricingRun.totalSection : (finalFenceValue + finalGateValue + finalDemoValue)
          };
        }),
        costSummaryRuns: costSummaryRuns,
        runBreakdown: costSummaryRuns,
        sectionTotals: sectionTotalsArr,
        fenceTotal: fenceTotal,
        gatesTotal: gatesTotal,
        demoTotal: demoTotal,
        baseFencePrice: fenceTotal,
        gateSummary: gateSummary,
        demoRemovalPrice: pricing.demoRemovalPrice || 0,
        addOnSitePrepPrice: pricing.addOnSitePrepPrice || 0,
        discountAmount: pricing.discountAmount || 0,
        discountLabel: mergedEstimate.discountLabel || 'Discount',
        subtotalBeforeDiscount: pricing.subtotalBeforeDiscount || 0,
        finalCustomerPrice: finalPrice,
        manualGrandTotal: mergedEstimate.manualGrandTotal !== undefined ? mergedEstimate.manualGrandTotal : null,
        pricePerFoot: pricing.pricePerFoot || 0,
        totalInvestment: finalPrice,
        contractScope: mergedEstimate.contractScope || mergedEstimate.localAiScope || 'Detailed Scope of Work is being finalized.',
        sentAt: new Date().toISOString(),
        sentBy: user?.email || 'Admin'
      };

      const pricingUpdates = {
        finalCustomerPrice: finalPrice,
        manualGrandTotal: mergedEstimate.manualGrandTotal !== undefined ? mergedEstimate.manualGrandTotal : null,
        estimatedPrice: finalPrice,
        grandTotal: finalPrice,
        totalInvestment: finalPrice,
        pricePerFoot: pricing.pricePerFoot || 0,
        subtotalBeforeDiscount: pricing.subtotalBeforeDiscount || 0,
        baseFencePrice: fenceTotal,
        addOnSitePrepPrice: pricing.addOnSitePrepPrice || 0,
        demoRemovalPrice: pricing.demoRemovalPrice || 0,
        discountAmount: pricing.discountAmount || 0,
        calculatedGrandTotal: pricing.calculatedTotal || 0,
        pricingUpdatedAt: new Date().toISOString(),
        contractSnapshot: contractSnapshot
      };

      const token = localStorage.getItem('company_admin_token');

      // Phase 1: Call PUT to save recalculated state and snapshot to Firestore prior to sending email
      const saveResponse = await fetch(`/api/estimates/write`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          id: sendModalEstimate.id,
          ...pricingUpdates
        })
      });

      if (!saveResponse.ok) {
        throw new Error(`Failed to save updated pricing fields to Firestore prior to sending the contract. Status: ${saveResponse.status}`);
      }

      // Phase 2: Dispatch SMTP email with precalculated contractSnapshot
      const response = await fetch(`/api/estimates/write`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'send',
          estimateId: sendModalEstimate.id,
          customerEmail,
          senderEmail,
          subject: emailSubject,
          message: emailMessage,
          estimateDetails: {
            ...sendModalEstimate,
            ...pricingUpdates
          },
          pricingUpdates,
          contractSnapshot
        })
      });

      const responseText = await response.text();
      console.log(`[SMTP EMAIL API RESPONSE] Code: ${response.status} (${response.statusText})`);
      console.log(`[SMTP EMAIL API RESPONSE BODY]:`, responseText);

      let parsedJson: any = null;
      try {
        parsedJson = JSON.parse(responseText);
      } catch (jsonErr) {
        console.warn('Response was not JSON structure:', responseText);
      }

      if (!response.ok) {
        let detailedError = `HTTP ${response.status} (${response.statusText || 'Error'}). `;
        if (parsedJson && parsedJson.error) {
          detailedError += `${parsedJson.error}`;
          if (parsedJson.errorType) {
            detailedError += ` [Type: ${parsedJson.errorType}]`;
          }
        } else if (responseText) {
          detailedError += `Response context: ${responseText.substring(0, 300)}`;
        } else {
          detailedError += 'The server returned an empty response body.';
        }
        throw new Error(detailedError);
      }

      if (!parsedJson) {
        throw new Error(`Server returned success status ${response.status} but body was not valid JSON.`);
      }

      if (parsedJson.success) {
        setSendSuccessMessage('Fencing contract estimate pack successfully sent!');
        
        // Update local estimate list jobStatus immediately in primary React parent state
        setSavedEstimates(prev => prev.map(est => {
          if (est.id === sendModalEstimate.id) {
            return {
              ...est,
              jobStatus: 'Estimate Sent',
              customerEmail: customerEmail,
              lastModified: new Date().toISOString()
            };
          }
          return est;
        }));

        setTimeout(() => {
          setSendModalEstimate(null);
        }, 1500);
      } else {
        const errorMsg = parsedJson.error || 'Server rejected email relay config.';
        const errorDetail = parsedJson.errorType ? `${errorMsg} [Type: ${parsedJson.errorType}]` : errorMsg;
        setSendErrorMessage(`API Error: ${errorDetail}`);
      }
    } catch (err: any) {
      setSendErrorMessage(err.message || 'Network dispatch fail. Please check SMTP settings.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const [loading, setLoading] = React.useState(false);

  const fetchEstimates = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('company_admin_token');
      const response = await fetch('/api/estimates/list', {
        headers: {
          'Authorization': `Bearer ${token || ''}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setSavedEstimates(assignEstimateNumbers(data));
      } else {
        console.error('Failed to fetch estimates via API:', response.statusText);
      }
    } catch (err) {
      console.error('Network error fetching estimates via API:', err);
    } finally {
      setLoading(false);
    }
  }, [user, setSavedEstimates]);

  React.useEffect(() => {
    fetchEstimates();

    const handleSync = () => {
      fetchEstimates();
    };
    window.addEventListener('customer_estimator_estimate_submitted', handleSync);
    window.addEventListener('focus', handleSync);
    return () => {
      window.removeEventListener('customer_estimator_estimate_submitted', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, [fetchEstimates]);

  const filteredEstimates = savedEstimates.filter(est => {
    const name = est.customerName || 'Unnamed Prospect';
    const address = est.customerAddress || 'No Address';
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          address.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesFilter = false;
    const displayStatus = getEstimateDisplayStatus(est);
    if (filter === 'all') {
      matchesFilter = true;
    } else if (filter === 'active') {
      matchesFilter = displayStatus !== 'Archived' && displayStatus !== 'Completed' && displayStatus !== 'Declined';
    } else if (filter === 'completed') {
      matchesFilter = displayStatus === 'Completed';
    } else if (filter === 'declined') {
      matchesFilter = displayStatus === 'Declined';
    } else if (filter === 'archived') {
      matchesFilter = displayStatus === 'Archived';
    }

    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    const timeA = new Date(a.createdAt || a.date || b.createdAt || b.date).getTime() || 0;
    const timeB = new Date(b.createdAt || b.date || a.createdAt || a.date).getTime() || 0;
    return timeB - timeA;
  });

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto py-20 px-4 text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-24 w-24 rounded-[32px] bg-american-blue/5 flex items-center justify-center text-american-blue rotate-6">
            <Shield size={48} />
          </div>
        </div>
        <div>
          <h2 className="text-3xl font-black text-american-blue uppercase tracking-tighter">Authentication Required</h2>
          <p className="text-sm font-bold text-[#999999] uppercase tracking-widest mt-2 max-w-md mx-auto">
            Please sign in on the sidebar to access the Lone Star company cloud estimates.
          </p>
        </div>
      </div>
    );
  }

  const updateJobStatus = async (id: string, status: JobStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) return;

    try {
      const token = localStorage.getItem('company_admin_token');
      const response = await fetch('/api/estimates/write', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`
        },
        body: JSON.stringify({
          id,
          jobStatus: status,
          status: 'active'
        })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to update estimate status');
      }
      fetchEstimates();
    } catch (error: any) {
      console.error('Failed to update job status:', error);
      alert(error.message || 'Failed to update job status');
    }
  };

  const handleCreateJobPortal = async (estimate: SavedEstimate, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) return;

    const est = estimate as any;

    try {
      const generateToken = () => {
        try {
          const arr = new Uint8Array(8);
          window.crypto.getRandomValues(arr);
          return Array.from(arr, dec => dec.toString(16).padStart(2, '0')).join('');
        } catch (e) {
          return Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10);
        }
      };

      const laborSnapshotToken = generateToken();
      const crewScheduleToken = generateToken();

      const appUrl = `${window.location.protocol}//${window.location.host}`;
      const laborSnapshotLink = `${appUrl}/?portal=job-portal&estimateId=${est.id}&token=${laborSnapshotToken}`;
      const crewScheduleLink = `${appUrl}/?portal=crew-schedule&estimateId=${est.id}&token=${crewScheduleToken}`;
      const nowIso = new Date().toISOString();

      const token = localStorage.getItem('company_admin_token');

      const existingHistory = Array.isArray(est.jobPortalHistory) ? est.jobPortalHistory : [];
      const newHistoryEntry = {
        id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
        event: 'Job Portal Created',
        timestamp: nowIso,
        user: user.email || 'Office',
        notes: 'Job Portal manually initialized.'
      };

      const defaultSnapshot = est.laborContractSnapshot || {
        customerName: est.customerName || 'Valued Client',
        jobAddress: est.customerAddress || est.address || 'N/A',
        fenceType: est.fenceType || 'Fence',
        height: est.height || 6,
        linearFeet: est.linearFeet || 0,
        totalDirectLaborPayout: est.grandTotal || 0,
        scopeOfWorkHtmlOrText: est.scopeOfWorkHtmlOrText || "Standard installation procedures apply.",
        drawingUrl: est.drawingUrl || null,
        drawingFileName: est.drawingFileName || null,
        drawingMimeType: est.drawingMimeType || null
      };

      const response = await fetch('/api/estimates/write', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`
        },
        body: JSON.stringify({
          id: est.id,
          laborSnapshotToken,
          crewScheduleToken,
          laborSnapshotLink,
          crewScheduleLink,
          jobPortalStatus: 'scheduling_required',
          jobPortalHistory: [...existingHistory, newHistoryEntry],
          laborContractSnapshot: defaultSnapshot
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to initialize Job Portal');
      }

      await fetchEstimates();
      window.open(laborSnapshotLink, '_blank');
    } catch (error: any) {
      console.error('Failed to create Job Portal:', error);
      alert(error.message || 'Failed to create Job Portal');
    }
  };

  const deleteEstimate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (deleteConfirmId === id) {
      // 1. Remove from local ledger in localStorage
      try {
        const localLedgerStr = localStorage.getItem('customer_estimator_local_ledger');
        if (localLedgerStr) {
          const localLedger = JSON.parse(localLedgerStr);
          const updatedLedger = localLedger.filter((est: any) => est.id !== id);
          localStorage.setItem('customer_estimator_local_ledger', JSON.stringify(updatedLedger));
        }
      } catch (err) {
        console.error('Failed to update local ledger during deletion:', err);
      }

      // Dispatch event to app syncing engine
      window.dispatchEvent(new Event('customer_estimator_estimate_submitted'));

      // 2. Optimistically update local parent UI state so it disappears immediately
      setSavedEstimates(prev => prev.filter(est => est.id !== id));

      // Reset confirmation immediately to prevent deadlock if async deletion fails
      setDeleteConfirmId(null);

      // 3. Delete from firestore if user is logged in
      if (user) {
        try {
          const token = localStorage.getItem('company_admin_token');
          const response = await fetch('/api/estimates/write', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token || ''}`
            },
            body: JSON.stringify({ id })
          });
          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to delete estimate');
          }
          fetchEstimates();
        } catch (error: any) {
          console.warn('REST API server-side delete operation rejected:', error);
        }
      }
    } else {
      setDeleteConfirmId(id);
      // Reset after 6 seconds if not clicked again
      setTimeout(() => setDeleteConfirmId(null), 6000);
    }
  };

  const toggleArchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) return;

    const estimate = savedEstimates.find(est => est.id === id);
    if (!estimate) return;

    try {
      const token = localStorage.getItem('company_admin_token');
      const response = await fetch('/api/estimates/write', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`
        },
        body: JSON.stringify({
          id,
          status: estimate.status === 'archived' ? 'active' : 'archived'
        })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to toggle archive');
      }
      fetchEstimates();
    } catch (error: any) {
      console.error('Failed to toggle archive status:', error);
    }
  };

  const acceptJob = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) return;

    try {
      const token = localStorage.getItem('company_admin_token');
      const response = await fetch('/api/estimates/write', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`
        },
        body: JSON.stringify({
          id,
          jobStatus: 'Accepted',
          status: 'active'
        })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to accept job');
      }
      fetchEstimates();
    } catch (error: any) {
      console.error('Failed to accept job:', error);
    }
  };
  
  const completeJob = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) return;
    
    try {
      const token = localStorage.getItem('company_admin_token');
      const response = await fetch('/api/estimates/write', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`
        },
        body: JSON.stringify({
          id,
          jobStatus: 'Completed',
          status: 'active'
        })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to complete job');
      }
      fetchEstimates();
    } catch (error: any) {
      console.error('Failed to complete job:', error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-[40px] shadow-2xl border-2 border-american-blue/5">
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 rounded-3xl bg-american-blue flex items-center justify-center text-white shadow-xl shadow-american-blue/20 rotate-3">
            <FileText size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-american-blue uppercase tracking-tighter">Saved Estimates</h1>
            <p className="text-xs font-bold text-american-red uppercase tracking-widest leading-none mt-1">VIRTUAL ESTIMATE ARCHIVE</p>
          </div>
        </div>

          <div className="flex bg-[#F5F5F7] p-1.5 rounded-2xl">
            {(['list', 'files'] as const).map((v) => (
              <button
                key={v}
                onClick={() => {
                  setView(v);
                  if (v === 'list') setSelectedJobPhotos(null);
                }}
                className={cn(
                  "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  view === v ? "bg-white text-american-blue shadow-lg" : "text-[#999999] hover:text-american-blue"
                )}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Search */}
          <div className="relative group w-full sm:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-american-blue/30 group-focus-within:text-american-blue transition-colors" size={18} />
            <input
              type="text"
              placeholder="Search by name or address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-6 py-4 bg-[#F5F5F7] border-none rounded-2xl text-sm font-bold text-american-blue placeholder:text-[#999999] focus:ring-4 focus:ring-american-blue/10 outline-none transition-all"
            />
          </div>

        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {view === 'list' ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Filter */}
            <div className="flex bg-[#F5F5F7] p-1.5 rounded-2xl w-fit">
              {(['active', 'completed', 'declined', 'archived', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    filter === f 
                      ? "bg-white text-american-blue shadow-lg shadow-american-blue/5 scale-105" 
                      : "text-[#999999] hover:text-american-blue"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-2xl">
              <div className="overflow-x-auto overflow-y-visible">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm text-american-blue">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-[#E5E5E5]">
                      <th className="py-2.5 px-4 w-12 text-[#999999] font-black uppercase text-[9px] tracking-wider">
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300 text-american-blue focus:ring-american-blue/20" 
                        />
                      </th>
                      <th className="py-2.5 px-3 text-[#999999] font-black uppercase text-[9px] tracking-wider">Date</th>
                      <th className="py-2.5 px-3 text-[#999999] font-black uppercase text-[9px] tracking-wider">Est #</th>
                      <th className="py-2.5 px-4 text-[#999999] font-black uppercase text-[9px] tracking-wider">Customer Name & Address</th>
                      <th className="py-2.5 px-4 text-[#999999] font-black uppercase text-[9px] tracking-wider">Est. Cost</th>
                      <th className="py-2.5 px-4 text-[#999999] font-black uppercase text-[9px] tracking-wider">Status</th>
                      <th className="py-2.5 px-4 text-[#999999] font-black uppercase text-[9px] tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {filteredEstimates.map((estimate) => {
                        const isAcceptedOrCompleted = estimate.jobStatus === 'Accepted' || estimate.jobStatus === 'Completed';
                        const isSent = estimate.jobStatus === 'Estimate Sent';
                        const isPending = !estimate.jobStatus || estimate.jobStatus === 'Estimate Pending';
                        
                        const dateFormatted = new Date(estimate.createdAt || estimate.lastModified || '').toLocaleDateString('en-US', {
                          month: 'numeric',
                          day: 'numeric',
                          year: '2-digit'
                        });
                        const lastModFormatted = new Date(estimate.lastModified || estimate.createdAt || '').toLocaleDateString('en-US', {
                          month: 'numeric',
                          day: 'numeric',
                          year: '2-digit'
                        });

                        // Gracefully clean up case where last name is misplaced in the email field for the row preview
                        let namePreview = estimate.customerName || 'Valued Customer';
                        const emailField = estimate.customerEmail || '';
                        if (emailField && !emailField.includes('@') && namePreview && !namePreview.toLowerCase().includes(emailField.toLowerCase())) {
                          namePreview = `${namePreview} ${emailField}`.trim();
                        }

                        return (
                          <motion.tr 
                            layout
                            key={estimate.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className={cn(
                              "border-b border-[#F0F0F2] hover:bg-slate-50/50 transition-colors",
                              estimate.status === 'archived' && "opacity-60 bg-gray-50/50"
                            )}
                          >
                            <td className="py-2 px-4 w-12 text-center">
                              <input 
                                type="checkbox" 
                                className="rounded border-gray-300 text-american-blue focus:ring-american-blue/20" 
                              />
                            </td>
                            <td className="py-2 px-3 font-bold text-[#555555] text-xs whitespace-nowrap">
                              {dateFormatted}
                            </td>
                            <td className="py-2 px-3 font-bold text-[#111111] font-mono text-xs whitespace-nowrap">
                              {estimate.estimateNumber || 1201}
                            </td>
                            <td className="py-2 px-4 text-american-blue">
                              <div className="font-bold text-sm text-[#111111] flex items-center gap-2">
                                {namePreview}
                                {estimate.version && estimate.version > 1 && (
                                  <span className="px-1.5 py-0.5 bg-american-blue/5 text-american-blue text-[8px] font-black rounded uppercase">v{estimate.version}</span>
                                )}
                                {estimate.jobReferencePhotoUrl && (
                                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[8px] font-black rounded uppercase border border-emerald-200/50">Reference Photo Added</span>
                                )}
                              </div>
                              <div className="text-[11px] font-medium text-gray-400 truncate max-w-sm flex items-center gap-1 mt-0.5" title={estimate.customerAddress || 'No Address'}>
                                <MapPin size={10} className="shrink-0" />
                                <span className="truncate">{estimate.customerAddress || 'No Address'}</span>
                                <span className="mx-1 text-gray-300">|</span>
                                <span className="font-bold text-gray-500">{estimate.linearFeet} LF</span>
                              </div>
                            </td>
                            <td className="py-2 px-4 font-bold text-[#111111] font-mono text-xs leading-none whitespace-nowrap">
                              {formatCurrency(getEstimateFinalPrice(estimate))}
                            </td>
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                  <select
                                    id={`status-dropdown-${estimate.id}`}
                                    className={cn(
                                      "text-[10px] uppercase font-black tracking-wider border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-american-blue cursor-pointer transition-all font-sans shadow-sm",
                                      getStatusStyle(getEstimateDisplayStatus(estimate))
                                    )}
                                    value={getEstimateDisplayStatus(estimate)}
                                    onChange={async (e) => {
                                      const newStatus = e.target.value;
                                      try {
                                        const token = localStorage.getItem('company_admin_token');
                                        const response = await fetch('/api/estimates/write', {
                                          method: 'PUT',
                                          headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${token || ''}`
                                          },
                                          body: JSON.stringify({
                                            id: estimate.id,
                                            manualStatusChange: newStatus
                                          })
                                        });
                                        if (!response.ok) {
                                          const errData = await response.json();
                                          throw new Error(errData.error || 'Failed to update estimate status');
                                        }
                                        const resData = await response.json();
                                        fetchEstimates();

                                        if (newStatus === 'Accepted' || newStatus === 'Declined' || newStatus === 'Completed') {
                                          if (resData.webhookSuccess === true) {
                                            alert("Status updated and GHL notified.");
                                          } else if (resData.webhookSuccess === false) {
                                            alert("Status updated, but GHL webhook failed. Check integration logs.");
                                          } else {
                                            alert("Status updated.");
                                          }
                                        } else {
                                          alert("Status updated.");
                                        }
                                      } catch (error: any) {
                                        console.error('Failed to update status manually:', error);
                                        alert(error.message || 'Failed to update status');
                                      }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="Draft">Draft</option>
                                    <option value="Estimate Sent">Estimate Sent</option>
                                    <option value="Accepted">Accepted</option>
                                    <option value="Declined">Declined</option>
                                    <option value="Scheduled">Scheduled</option>
                                    <option value="Completed">Completed</option>
                                    <option value="Archived">Archived</option>
                                  </select>
                                </div>
                                
                                {/* Engagement & Portal View Status Logs */}
                                {(estimate as any).customerViewedAt || (estimate as any).customerOpenedAt ? (
                                  <div className="flex items-center gap-1 text-[10px] text-[#2563EB] font-bold">
                                    <Eye size={11} className="text-blue-500 animate-bounce" />
                                    <span>
                                      Viewed {new Date((estimate as any).customerViewedAt || (estimate as any).customerOpenedAt).toLocaleDateString('en-US', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'})}
                                      {((estimate as any).viewCount || 1) > 1 && ` (${(estimate as any).viewCount}x)`}
                                    </span>
                                  </div>
                                ) : getEstimateDisplayStatus(estimate) === 'Estimate Sent' ? (
                                  <div className="text-[10px] text-gray-400 font-bold flex items-center gap-1 pl-1">
                                    <Clock size={10} /> Unopened
                                  </div>
                                ) : null}

                                {estimate.customerDecision === 'accepted' && (
                                  <div className="text-[10px] text-emerald-600 font-black uppercase tracking-widest pl-1 mt-0.5">
                                    ✓ Signed by {estimate.customerSignature}
                                  </div>
                                )}
                                {estimate.customerDecision === 'declined' && (
                                  <div className="text-[10px] text-red-600 font-black uppercase tracking-widest pl-1 mt-0.5 max-w-[150px] truncate" title={estimate.customerDeclineReason}>
                                    ✗ Declined: {estimate.customerDeclineReason}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => onLoadEstimate(estimate)}
                                  className="px-2.5 py-1.5 rounded-lg font-bold bg-[#F5F5F7] text-american-blue hover:bg-slate-200 transition-all cursor-pointer flex items-center gap-1 border border-[#E5E5E5]"
                                >
                                  Edit
                                </button>
                                
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setSendModalEstimate(estimate);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg font-bold bg-american-blue text-white hover:bg-[#0b3c8a] transition-all cursor-pointer flex items-center gap-1"
                                >
                                  {estimate.jobStatus === 'Estimate Sent' ? 'Resend' : 'Send'}
                                </button>

                                {estimate.jobStatus === 'Estimate Sent' && (
                                  <button
                                    type="button"
                                    onClick={(e) => updateJobStatus(estimate.id, 'Accepted', e)}
                                    className="px-2.5 py-1.5 rounded-lg font-bold bg-amber-500 text-white hover:bg-amber-600 transition-all cursor-pointer"
                                  >
                                    Accept
                                  </button>
                                )}
                                {estimate.jobStatus === 'Accepted' && (
                                  <button
                                    type="button"
                                    onClick={(e) => updateJobStatus(estimate.id, 'Completed', e)}
                                    className="px-2.5 py-1.5 rounded-lg font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all cursor-pointer"
                                  >
                                    Invoice
                                  </button>
                                )}

                                {(estimate.customerDecision === 'accepted' || !!estimate.customerSignature) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      onLoadEstimate(estimate);
                                      setActiveTab('customer-contract');
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer flex items-center gap-1"
                                  >
                                    <FileText size={14} /> View Signed Contract
                                  </button>
                                )}

                                <div className="relative inline-block text-left" id={`dropdown-wrapper-${estimate.id}`}>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenDropdownId(openDropdownId === estimate.id ? null : estimate.id);
                                    }}
                                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-all text-[#444444] inline-flex items-center justify-center min-h-[32px] min-w-[32px] border border-[#E5E5E5]"
                                  >
                                    <ChevronDown size={14} className="text-gray-500" />
                                  </button>

                                  {/* Dropdown Menu Portal/Overlay list */}
                                  {openDropdownId === estimate.id && (
                                    <>
                                      {/* Invisible backdrop to dismiss click */}
                                      <div 
                                        className="fixed inset-0 z-40 cursor-default" 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenDropdownId(null);
                                        }}
                                      />
                                      <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-2xl border border-slate-100 py-1.5 z-50 text-left origin-top-right">
                                        {(estimate.customerDecision === 'accepted' || !!estimate.customerSignature) && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onLoadEstimate(estimate);
                                              setActiveTab('customer-contract');
                                              setOpenDropdownId(null);
                                            }}
                                            className="w-full text-left px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 border-b border-slate-50 mb-1"
                                          >
                                            <FileText size={14} className="text-emerald-600" /> View Signed Contract
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setView('files');
                                            setSelectedJobPhotos(estimate);
                                            setOpenDropdownId(null);
                                          }}
                                          className="w-full text-left px-4 py-2 text-xs font-bold text-[#444444] hover:bg-[#F5F5F7] hover:text-[#111111] flex items-center gap-2"
                                        >
                                          <ImageIcon size={14} /> Project Photos
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveTab('scheduler');
                                            setOpenDropdownId(null);
                                          }}
                                          className="w-full text-left px-4 py-2 text-xs font-bold text-[#444444] hover:bg-[#F5F5F7] hover:text-[#111111] flex items-center gap-2"
                                        >
                                          <Calendar size={14} /> Schedule Job
                                        </button>
                                        {/* Job Portal / Create Job Portal */}
                                        {!!estimate.laborSnapshotToken ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const portalLink = `${window.location.protocol}//${window.location.host}/?portal=job-portal&estimateId=${estimate.id}&token=${estimate.laborSnapshotToken}`;
                                                window.open(portalLink, '_blank');
                                                setOpenDropdownId(null);
                                              }}
                                              className="w-full text-left px-4 py-2 text-xs font-bold text-[#444444] hover:bg-[#F5F5F7] hover:text-[#111111] flex items-center gap-2"
                                            >
                                              <ExternalLink size={14} /> Open Job Portal
                                            </button>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const portalLink = `${window.location.protocol}//${window.location.host}/?portal=job-portal&estimateId=${estimate.id}&token=${estimate.laborSnapshotToken}`;
                                                navigator.clipboard.writeText(portalLink)
                                                  .then(() => alert('Job Portal link copied to clipboard!'))
                                                  .catch(() => alert('Failed to copy. URL: ' + portalLink));
                                                setOpenDropdownId(null);
                                              }}
                                              className="w-full text-left px-4 py-2 text-xs font-bold text-[#444444] hover:bg-[#F5F5F7] hover:text-[#111111] flex items-center gap-2"
                                            >
                                              <Copy size={14} /> Copy Job Portal Link
                                            </button>
                                          </>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleCreateJobPortal(estimate, e);
                                              setOpenDropdownId(null);
                                            }}
                                            className="w-full text-left px-4 py-2 text-xs font-bold text-[#444444] hover:bg-[#F5F5F7] hover:text-[#111111] flex items-center gap-2"
                                          >
                                            <Briefcase size={14} /> Create Job Portal
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedLogEstimate(estimate);
                                            setOpenDropdownId(null);
                                          }}
                                          className="w-full text-left px-4 py-2 text-xs font-bold text-[#444444] hover:bg-[#F5F5F7] hover:text-[#111111] flex items-center gap-2"
                                        >
                                          <Clock size={14} /> Email Activity Log
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRunContactSyncDiagnostic(estimate);
                                            setOpenDropdownId(null);
                                          }}
                                          className="w-full text-left px-4 py-2 text-xs font-bold text-[#1e40af] hover:bg-[#eff6ff] hover:text-[#1d4ed8] flex items-center gap-2 border-t border-blue-50 mt-1 pt-1"
                                        >
                                          <Shield size={14} className="text-[#1e40af]" /> Test Contact Sync
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedHistoryEstimate(estimate);
                                            setCompareFromId("");
                                            setCompareToId("");
                                            setOpenDropdownId(null);
                                          }}
                                          className="w-full text-left px-4 py-2 text-xs font-bold text-[#444444] hover:bg-[#F5F5F7] hover:text-[#111111] flex items-center gap-2"
                                        >
                                          <History size={14} className="text-slate-500" /> Contract History ({estimate.contractVersions?.length || 1})
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const link = `https://fence-estimator-eight.vercel.app/?portal=contract&estimateId=${estimate.id}`;
                                            navigator.clipboard.writeText(link)
                                              .then(() => alert('Customer link copied to clipboard!'))
                                              .catch(() => alert('Failed to copy. URL: ' + link));
                                            setOpenDropdownId(null);
                                          }}
                                          className="w-full text-left px-4 py-2 text-xs font-bold text-[#444444] hover:bg-[#F5F5F7] hover:text-[#111111] flex items-center gap-2 border-t border-slate-100/50 mt-1 pt-1"
                                        >
                                          <Copy size={14} /> Copy Customer Link
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const link = `https://fence-estimator-eight.vercel.app/?portal=contract&estimateId=${estimate.id}`;
                                            window.open(link, '_blank');
                                            setOpenDropdownId(null);
                                          }}
                                          className="w-full text-left px-4 py-2 text-xs font-bold text-[#444444] hover:bg-[#F5F5F7] hover:text-[#111111] flex items-center gap-2"
                                        >
                                          <ExternalLink size={14} /> Test Customer Link
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleArchive(estimate.id, e);
                                            setOpenDropdownId(null);
                                          }}
                                          className="w-full text-left px-4 py-2 text-xs font-bold text-[#444444] hover:bg-[#F5F5F7] hover:text-[#111111] flex items-center gap-2 border-t border-slate-50 mt-1 pt-1"
                                        >
                                          <Archive size={14} />
                                          {estimate.status === 'active' ? 'Archive' : 'Restore'}
                                        </button>
                                        
                                        <div className="border-t border-slate-100 my-1" />

                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteEstimate(estimate.id, e);
                                            if (deleteConfirmId !== estimate.id) {
                                              // Keep open to let them confirm
                                            } else {
                                              setOpenDropdownId(null);
                                            }
                                          }}
                                          className={cn(
                                            "w-full text-left px-4 py-2 text-xs font-bold flex items-center justify-between gap-2 transition-colors",
                                            deleteConfirmId === estimate.id
                                              ? "bg-american-red text-white hover:bg-american-red/90"
                                              : "text-american-red hover:bg-red-50"
                                          )}
                                        >
                                          <span className="flex items-center gap-2">
                                            <Trash2 size={14} /> 
                                            {deleteConfirmId === estimate.id ? 'Confirm Delete!' : 'Delete Permanently'}
                                          </span>
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>

            {loading && (
              <div className="col-span-full py-20 text-center space-y-4">
                <div className="flex justify-center">
                  <div className="h-10 w-10 border-4 border-american-blue/20 border-t-american-blue rounded-full animate-spin" />
                </div>
                <p className="text-xs font-black uppercase tracking-widest text-[#999999]">Loading your estimates...</p>
              </div>
            )}

            {!loading && filteredEstimates.length === 0 && (
              <div className="col-span-full py-20 text-center space-y-4">
                <div className="flex justify-center">
                  <div className="h-20 w-20 rounded-full bg-[#F5F5F7] flex items-center justify-center text-[#CCCCCC]">
                    <FileText size={40} />
                  </div>
                </div>
                <div>
                  <p className="text-xl font-black text-american-blue">
                    {savedEstimates.length === 0 ? "No estimates yet" : "No matching estimates found"}
                  </p>
                  <p className="text-sm font-bold text-[#999999] uppercase tracking-widest">
                    {savedEstimates.length === 0 ? "Start by creating a new estimate in the Estimator." : "Adjust your search or filters"}
                  </p>
                </div>
              </div>
            )}

            {/* Send Estimate Email Modal Popup */}
            <AnimatePresence>
              {sendModalEstimate && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
                  >
                    <div className="p-6 bg-gradient-to-r from-american-blue to-[#0b2b5a] text-white flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 p-2.5 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                          <Mail size={20} className="text-white" />
                        </div>
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-wider">Send Contract Estimate</h3>
                          <p className="text-[10px] opacity-70 font-semibold uppercase tracking-widest mt-0.5">Lone Star Dispatch Center</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSendModalEstimate(null)}
                        className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center text-sm font-bold"
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleSendEmailSubmit} className="p-6 space-y-4 text-left">
                      {sendSuccessMessage && (
                        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-bold uppercase tracking-wider flex items-center gap-2">
                          <CheckCircle2 size={16} fill="#10B981" className="text-white shadow" />
                          <span>{sendSuccessMessage}</span>
                        </div>
                      )}

                      {sendErrorMessage && (
                        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl font-medium tracking-wide flex items-start gap-2">
                          <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse shrink-0 mt-1" />
                          <div className="flex-1 space-y-1">
                            <span className="font-bold uppercase block text-[10px] tracking-wider text-red-600 mb-0.5">Transmission Diagnostic Warning</span>
                            <p className="normal-case break-words leading-relaxed whitespace-pre-wrap text-slate-700 font-mono text-[11px] selection:bg-red-200">{sendErrorMessage}</p>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Sender Email */}
                        <div className="space-y-1">
                          <label className="block text-[9px] font-black uppercase tracking-wider text-slate-500">Sender (My Email)</label>
                          <input
                            type="email"
                            required
                            value={senderEmail}
                            onChange={(e) => setSenderEmail(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-american-blue"
                          />
                        </div>

                        {/* Customer Email */}
                        <div className="space-y-1">
                          <label className="block text-[9px] font-black uppercase tracking-wider text-slate-500">Recipient (Customer Email)</label>
                          <input
                            type="email"
                            required
                            placeholder="customer@email.com"
                            value={customerEmail}
                            onChange={(e) => setCustomerEmail(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-american-blue"
                          />
                        </div>
                      </div>

                      {/* Email Subject */}
                      <div className="space-y-1">
                        <label className="block text-[9px] font-black uppercase tracking-wider text-slate-500">Email Subject</label>
                        <input
                          type="text"
                          required
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-american-blue"
                        />
                      </div>

                      {/* Email Body Message */}
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">Email Message Payload</label>
                          <span className="text-[8px] font-bold tracking-widest text-[#9333EA] uppercase bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                            Auto-Injected Link
                          </span>
                        </div>
                        <textarea
                          required
                          rows={6}
                          value={emailMessage}
                          onChange={(e) => setEmailMessage(e.target.value)}
                          className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-american-blue leading-relaxed resize-none font-sans"
                        />
                      </div>

                      <div className="pt-4 flex gap-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setSendModalEstimate(null)}
                          className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSendingEmail}
                          className="flex-1 py-2.5 bg-american-blue text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all hover:bg-[#0b2b5a] disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-american-blue/15"
                        >
                          {isSendingEmail ? (
                            <>
                              <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin shrink-0" />
                              <span>Sending...</span>
                            </>
                          ) : (
                            <>
                              <Send size={12} className="text-white" />
                              <span>Send Package</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            key="files"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            {selectedJobPhotos ? (
              <div className="space-y-6">
                <button 
                  onClick={() => setSelectedJobPhotos(null)}
                  className="flex items-center gap-2 text-american-blue hover:text-american-red transition-colors text-[10px] font-black uppercase tracking-widest"
                >
                  <ArrowLeft size={16} />
                  Back to Files
                </button>
                
                <div className="bg-white p-8 rounded-[40px] shadow-xl border-2 border-american-blue/10">
                   <div className="flex items-center gap-4 mb-8">
                      <div className="h-14 w-14 rounded-2xl bg-american-blue/10 flex items-center justify-center text-american-blue">
                        <ImageIcon size={28} />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-american-blue uppercase tracking-tighter">{selectedJobPhotos.customerName}</h3>
                        <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">{selectedJobPhotos.customerAddress}</p>
                      </div>
                   </div>

                   <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {selectedJobPhotos.photos && selectedJobPhotos.photos.length > 0 ? (
                        selectedJobPhotos.photos.map(photo => (
                          <div key={photo.id} className="group relative aspect-square rounded-2xl overflow-hidden shadow-lg hover:scale-105 transition-all cursor-zoom-in">
                            <img src={photo.url} className="w-full h-full object-cover" alt="Job site" />
                            <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                               <p className="text-[9px] font-black text-white uppercase tracking-widest">{photo.category || 'Site'}</p>
                               <p className="text-[7px] text-white/60 font-bold uppercase">{new Date(photo.timestamp).toLocaleDateString()}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-full py-20 flex flex-col items-center justify-center opacity-30 italic">
                          <ImageIcon size={48} className="mb-4" />
                          <p className="text-xs font-black uppercase tracking-widest">No photos for this estimate</p>
                        </div>
                      )}
                   </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {savedEstimates.filter(est => est.photos && est.photos.length > 0).map(est => (
                  <button
                    key={est.id}
                    onClick={() => setSelectedJobPhotos(est)}
                    className="group bg-white p-6 rounded-[32px] border-2 border-american-blue/5 hover:border-american-blue/20 transition-all text-left shadow-xl hover:shadow-2xl"
                  >
                    <div className="flex items-center gap-4 mb-6">
                      <div className="h-14 w-14 rounded-2xl bg-american-blue/10 flex items-center justify-center text-american-blue group-hover:bg-american-blue group-hover:text-white transition-all scale-95 group-hover:scale-100">
                        <FolderOpen size={28} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-american-blue uppercase tracking-tighter truncate max-w-[150px]">{est.customerName}</h4>
                        <p className="text-[9px] font-bold text-[#999999] uppercase tracking-widest truncate max-w-[150px]">{est.customerAddress}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-4 border-t border-dashed border-[#F0F0F0]">
                      <div className="flex items-center gap-1.5 text-american-red">
                        <ImageIcon size={14} />
                        <span className="text-[10px] font-black uppercase tracking-widest">{est.photos?.length || 0} Files</span>
                      </div>
                      <ChevronRight size={16} className="text-american-blue/20 group-hover:text-american-blue transition-colors" />
                    </div>
                  </button>
                ))}
                {savedEstimates.filter(est => est.photos && est.photos.length > 0).length === 0 && (
                  <div className="col-span-full py-40 flex flex-col items-center justify-center space-y-4 opacity-30">
                    <ImageIcon size={64} className="text-american-blue" />
                    <div className="text-center">
                      <p className="text-xl font-black text-american-blue uppercase tracking-tighter">No Project Files Discovered</p>
                      <p className="text-xs font-bold text-[#999999] uppercase tracking-widest mt-1">Upload photos in the Estimator to generate files</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Email Activity Log Modal Popup */}
      <AnimatePresence>
        {selectedLogEstimate && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col font-sans"
            >
              <div className="p-6 bg-[#0c1a30] text-white flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 p-2.5 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                    <Clock size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider">Email Activity Log</h3>
                    <p className="text-[10px] opacity-70 font-semibold uppercase tracking-widest mt-0.5">
                      Est #{selectedLogEstimate.estimateNumber || '1201'} - {selectedLogEstimate.customerName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLogEstimate(null)}
                  className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-6 text-left max-h-[60vh] overflow-y-auto">
                {/* Summary bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div>
                    <span className="block text-[9px] font-black uppercase tracking-wider text-slate-500">Recipient Email Address</span>
                    <strong className="text-xs font-bold text-slate-800 break-all">{selectedLogEstimate.customerEmail || 'No recipient configured'}</strong>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black uppercase tracking-wider text-slate-500">Current Job Status</span>
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-american-blue/5 text-american-blue">
                      {selectedLogEstimate.jobStatus || 'Draft'}
                    </span>
                  </div>
                </div>

                {/* Timeline display */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-american-blue">Communication Timeline logs</h4>
                  
                  <div className="relative border-l-2 border-slate-100 pl-6 ml-3 space-y-6">
                    {/* Date Created */}
                    <div className="relative">
                      <span className="absolute -left-[31px] top-0 h-4 w-4 rounded-full bg-slate-200 border-4 border-white flex items-center justify-center" />
                      <div>
                        <span className="text-[10px] font-black uppercase text-slate-400">Estimate Created</span>
                        <p className="text-[11px] font-medium text-slate-600 mt-0.5">
                          Estimate record created in digital ledger database on {new Date(selectedLogEstimate.createdAt || '').toLocaleString()}.
                        </p>
                      </div>
                    </div>

                    {/* Email history log */}
                    {selectedLogEstimate.customerEmailLog && selectedLogEstimate.customerEmailLog.length > 0 ? (
                      selectedLogEstimate.customerEmailLog.map((log: any, index: number) => (
                        <div key={index} className="relative">
                          <span className={`absolute -left-[31px] top-0 h-4 w-4 rounded-full border-4 border-white flex items-center justify-center ${log.mailSent ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase text-slate-400">Email Dispatched</span>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${log.mailSent ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                {log.mailSent ? 'SENT' : 'FAILED'}
                              </span>
                            </div>
                            <div className="text-[11px] font-medium text-slate-600 mt-0.5 space-y-1">
                              <p>Dispatched to: <strong>{log.customerEmail || selectedLogEstimate.customerEmail}</strong></p>
                              {log.subject && <p className="italic">Subject: "{log.subject}"</p>}
                              {log.senderEmail && <p>Sender Identity: {log.senderEmail}</p>}
                              <p className="text-[9px] font-bold text-slate-400">Sent time: {new Date(log.sentAt).toLocaleString()}</p>
                              
                              {log.mailError && (
                                <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded-lg text-[10px] font-mono text-red-800 leading-normal break-words whitespace-pre-wrap">
                                  <strong>SMTP Failure Trace:</strong> {log.mailError}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      selectedLogEstimate.jobStatus === 'Estimate Sent' ? (
                        <div className="relative">
                          <span className="absolute -left-[31px] top-0 h-4 w-4 rounded-full bg-blue-500 border-4 border-white flex items-center justify-center" />
                          <div>
                            <span className="text-[10px] font-black uppercase text-slate-400">Email Dispatched (Basic status)</span>
                            <p className="text-[11px] font-medium text-slate-600 mt-0.5">
                              Estimate marked as sent on {(selectedLogEstimate as any).customerSentAt ? new Date((selectedLogEstimate as any).customerSentAt).toLocaleString() : 'N/A'}. (Detailed connection log not available for this legacy entry)
                            </p>
                          </div>
                        </div>
                      ) : null
                    )}

                    {/* View Logs */}
                    {((selectedLogEstimate as any).customerViewedAt || (selectedLogEstimate as any).customerOpenedAt) && (
                      <div className="relative">
                        <span className="absolute -left-[31px] top-0 h-4 w-4 rounded-full bg-blue-500 border-4 border-white flex items-center justify-center animate-pulse" />
                        <div>
                          <span className="text-[10px] font-black uppercase text-slate-400">Customer Opened Portal</span>
                          <p className="text-[11px] font-medium text-slate-600 mt-0.5">
                            Customer opened the secure fencing portal link. Last viewed: <strong>{new Date((selectedLogEstimate as any).customerViewedAt || (selectedLogEstimate as any).customerOpenedAt).toLocaleString()}</strong>
                          </p>
                          <p className="text-[9px] font-bold text-slate-400">Cumulative Page Hits: {(selectedLogEstimate as any).viewCount || 1} view(s)</p>
                        </div>
                      </div>
                    )}

                    {/* Decisions log */}
                    {selectedLogEstimate.customerDecision && (
                      <div className="relative">
                        <span className={`absolute -left-[31px] top-0 h-4 w-4 rounded-full border-4 border-white flex items-center justify-center ${selectedLogEstimate.customerDecision === 'accepted' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <div>
                          <span className="text-[10px] font-black uppercase text-slate-400">Customer Final Decision</span>
                          <div className="text-[11px] font-medium text-slate-600 mt-0.5 space-y-1">
                            <p>Status: <strong className={selectedLogEstimate.customerDecision === 'accepted' ? 'text-emerald-600' : 'text-red-500'}>{selectedLogEstimate.customerDecision.toUpperCase()}</strong></p>
                            <p>Decision Date: {selectedLogEstimate.customerDecisionDate ? new Date(selectedLogEstimate.customerDecisionDate).toLocaleString() : 'N/A'}</p>
                            {selectedLogEstimate.customerDecision === 'accepted' ? (
                              <p>Signature Validation: <strong>{selectedLogEstimate.customerSignature || 'Digitally Signed'}</strong></p>
                            ) : (
                              <p>Reason for Declining: <span className="italic">"{selectedLogEstimate.customerDeclineReason || 'Not specified'}"</span></p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedLogEstimate(null)}
                  className="py-2 px-5 bg-[#0c1a30] hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
                >
                  Close Activity Log
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Contract Version History & Revisions Modal */}
      <AnimatePresence>
        {selectedHistoryEstimate && (() => {
          const versions = selectedHistoryEstimate.contractVersions || [
            {
              version: 1,
              versionId: 'legacy-v1',
              createdAt: selectedHistoryEstimate.createdAt || selectedHistoryEstimate.lastModified || new Date().toISOString(),
              createdBy: 'SYSTEM',
              estimateSnapshot: selectedHistoryEstimate,
              contractSnapshot: selectedHistoryEstimate.contractSnapshot || null,
              customerDecision: selectedHistoryEstimate.customerDecision || 'pending',
              customerSignature: selectedHistoryEstimate.customerSignature || null,
              customerSignedAt: selectedHistoryEstimate.customerSignedDate || null,
              representativeSignature: 'Braden Scott Smith',
              representativeSignedAt: selectedHistoryEstimate.customerEmailSentAt || selectedHistoryEstimate.createdAt || null,
              emailSentAt: selectedHistoryEstimate.customerEmailSentAt || null,
              emailRecipient: selectedHistoryEstimate.customerEmail || 'N/A',
              emailMessageId: '',
              estimateLink: `https://fence-estimator-eight.vercel.app/?portal=contract&estimateId=${selectedHistoryEstimate.id}`,
              status: selectedHistoryEstimate.customerDecision === 'accepted' ? 'Accepted' : (selectedHistoryEstimate.customerDecision === 'declined' ? 'Declined' : (selectedHistoryEstimate.jobStatus === 'Estimate Sent' ? 'Sent' : 'Draft')),
              drawingUrl: selectedHistoryEstimate.drawingUrl || selectedHistoryEstimate.drawingMapUrl || null,
              drawingFilename: selectedHistoryEstimate.drawingFilename || null,
              drawingVersion: selectedHistoryEstimate.drawingVersion || null
            }
          ];

          const verA = versions.find((v: any) => v.versionId === compareFromId);
          const verB = versions.find((v: any) => v.versionId === compareToId);

          const renderVersionDiff = (vA: any, vB: any) => {
            if (!vA || !vB) return null;
            const snapA = vA.estimateSnapshot || {};
            const snapB = vB.estimateSnapshot || {};

            const diffs: { label: string; icon: string; fromVal: string; toVal: string; key: string }[] = [];

            // 1. Price comparison
            const priceA = snapA.totalCost || snapA.manualGrandTotal || 0;
            const priceB = snapB.totalCost || snapB.manualGrandTotal || 0;
            if (priceA !== priceB) {
              diffs.push({
                label: "Total Contract Price",
                icon: "💰",
                fromVal: formatCurrency(priceA),
                toVal: formatCurrency(priceB),
                key: "price"
              });
            }

            // 2. Linear Feet
            const lfA = snapA.linearFeet || snapA.manualLinearFeet || 0;
            const lfB = snapB.linearFeet || snapB.manualLinearFeet || 0;
            if (lfA !== lfB) {
              diffs.push({
                label: "Fence Run (LF)",
                icon: "📏",
                fromVal: `${lfA} LF`,
                toVal: `${lfB} LF`,
                key: "run"
              });
            }

            // 3. Materials / Fence Type
            const materialA = snapA.fenceType || (snapA.materials?.[0]?.fenceStyle) || 'Wood Fence';
            const materialB = snapB.fenceType || (snapB.materials?.[0]?.fenceStyle) || 'Wood Fence';
            const hA = snapA.fenceHeight || (snapA.materials?.[0]?.fenceHeight) || '';
            const hB = snapB.fenceHeight || (snapB.materials?.[0]?.fenceHeight) || '';
            const descA = `${materialA} ${hA ? `(${hA})` : ''}`.trim();
            const descB = `${materialB} ${hB ? `(${hB})` : ''}`.trim();
            if (descA !== descB) {
              diffs.push({
                label: "Lumber & Material Specs",
                icon: "🪵",
                fromVal: descA || "Not Configured",
                toVal: descB || "Not Configured",
                key: "materials"
              });
            }

            // 4. Gates
            const gatesA = snapA.gates?.length || (snapA.manualGateTotals ? "Configured" : "None");
            const gatesB = snapB.gates?.length || (snapB.manualGateTotals ? "Configured" : "None");
            if (gatesA !== gatesB) {
              diffs.push({
                label: "Gate Counts / Types",
                icon: "🚪",
                fromVal: String(gatesA),
                toVal: String(gatesB),
                key: "gates"
              });
            }

            // 5. Discount
            const discA = snapA.discountAmount || 0;
            const discB = snapB.discountAmount || 0;
            if (discA !== discB) {
              diffs.push({
                label: "Discount / Rebates",
                icon: "🏷️",
                fromVal: formatCurrency(discA),
                toVal: formatCurrency(discB),
                key: "discount"
              });
            }

            // 6. Demo & Removal
            const demoA = snapA.demoRemovalPrice || 0;
            const demoB = snapB.demoRemovalPrice || 0;
            if (demoA !== demoB) {
              diffs.push({
                label: "Demolition & Removal",
                icon: "🚜",
                fromVal: formatCurrency(demoA),
                toVal: formatCurrency(demoB),
                key: "demo"
              });
            }

            // 7. Schedule
            const schedA = snapA.scheduleStartDate || snapA.scheduleDate || 'Unscheduled';
            const schedB = snapB.scheduleStartDate || snapB.scheduleDate || 'Unscheduled';
            if (schedA !== schedB) {
              diffs.push({
                label: "Project Schedule",
                icon: "📅",
                fromVal: schedA,
                toVal: schedB,
                key: "schedule"
              });
            }

            // 8. Drawings URL/Preservation
            const drawUrlA = vA.drawingUrl || "No Sketch";
            const drawUrlB = vB.drawingUrl || "No Sketch";
            if (drawUrlA !== drawUrlB) {
              diffs.push({
                label: "Fencing Sketch Map / Drawing",
                icon: "🎨",
                fromVal: vA.drawingFilename ? `${vA.drawingFilename} (v${vA.drawingVersion || 1})` : (drawUrlA !== "No Sketch" ? "Drawing Attached" : "No Sketch"),
                toVal: vB.drawingFilename ? `${vB.drawingFilename} (v${vB.drawingVersion || 1})` : (drawUrlB !== "No Sketch" ? "Drawing Attached" : "No Sketch"),
                key: "drawing"
              });
            }

            // 9. Contract Snapshot Terms / customMessage wording
            const termA = vA.contractSnapshot || snapA.contractSnapshot || "Default Terms";
            const termB = vB.contractSnapshot || snapB.contractSnapshot || "Default Terms";
            if (termA !== termB) {
              diffs.push({
                label: "Contract Terms & Custom Message Wording",
                icon: "✍️",
                fromVal: typeof termA === 'string' ? (termA.substring(0, 50) + "...") : "Snapshot Terms Metadata",
                toVal: typeof termB === 'string' ? (termB.substring(0, 50) + "...") : "Snapshot Terms Metadata",
                key: "wording"
              });
            }

            if (diffs.length === 0) {
              return (
                <div className="p-6 bg-emerald-50 text-emerald-800 rounded-2xl text-center border border-emerald-100 text-xs font-bold uppercase tracking-wider">
                  Perfect Match: No material changes detected between Revision #{vA.version} and Revision #{vB.version}.
                </div>
              );
            }

            return (
              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase text-amber-600 tracking-wider">Comparative Audit Differences ({diffs.length})</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {diffs.map((d) => (
                    <div key={d.key} className="bg-white rounded-xl p-3.5 border border-slate-100 flex flex-col justify-between shadow-sm">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm">{d.icon}</span>
                        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">{d.label}</span>
                      </div>
                      <div className="grid grid-cols-3 items-center text-xs gap-1">
                        <div className="text-slate-400 font-bold break-all line-through opacity-70 truncate">{d.fromVal}</div>
                        <div className="text-center font-bold text-slate-300">➔</div>
                        <div className="text-emerald-700 font-black break-all truncate">{d.toVal}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          };

          const handleResendHistoryVersion = async (version: any) => {
            if (!confirm(`Are you sure you want to resend Contract Revision #${version.version} to ${version.emailRecipient || selectedHistoryEstimate.customerEmail}?`)) {
              return;
            }
            const token = localStorage.getItem('company_admin_token');
            setIsSendingEmail(true);
            try {
              const res = await fetch(`/api/estimates/write`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                  action: 'send',
                  estimateId: selectedHistoryEstimate.id,
                  customerEmail: version.emailRecipient || selectedHistoryEstimate.customerEmail,
                  senderEmail: 'BradenS@LoneStarFenceWorks.com',
                  subject: version.subject || `Fencing Contract Revision #${version.version} - Lone Star Fence Works`,
                  message: version.message || `Hello,\n\nPlease find your contract revision #${version.version} linked below:`,
                  resendVersionId: version.versionId
                })
              });
              const text = await res.text();
              let data: any = {};
              try { data = JSON.parse(text); } catch(e) {}
              if (!res.ok) throw new Error(data.error || 'Failed to resend revision');
              alert(`Contract revision #${version.version} successfully resent!`);
              fetchEstimates();
              setSelectedHistoryEstimate(null);
            } catch (err: any) {
              alert(`Error resending revision: ` + err.message);
            } finally {
              setIsSendingEmail(false);
            }
          };

          return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col font-sans max-h-[90vh]"
              >
                <div className="p-6 bg-[#0c1a30] text-white flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 p-2.5 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                      <History size={20} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-wider">Contract Version Revisions Ledger</h3>
                      <p className="text-[10px] opacity-70 font-semibold uppercase tracking-widest mt-0.5">
                        Est #{selectedHistoryEstimate.estimateNumber || '1201'} - {selectedHistoryEstimate.customerName} &bull; Total Revisions: {versions.length}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedHistoryEstimate(null);
                      setCompareFromId("");
                      setCompareToId("");
                    }}
                    className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center text-sm font-bold"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-6 space-y-6 text-left overflow-y-auto flex-1">
                  
                  {/* Versions Table list */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Historical Revision Snapshots</h4>
                    <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100 font-black text-slate-400 uppercase text-[9px] tracking-wider">
                            <th className="p-3">Ver #</th>
                            <th className="p-3">Created / Sent Date</th>
                            <th className="p-3">Authorized By</th>
                            <th className="p-3">Recipient</th>
                            <th className="p-3 text-center">Fencing Map Sketch</th>
                            <th className="p-3 text-center">Revision Status</th>
                            <th className="p-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {versions.map((ver: any) => {
                            const revisionLink = ver.versionId === 'legacy-v1' 
                              ? `https://fence-estimator-eight.vercel.app/?portal=contract&estimateId=${selectedHistoryEstimate.id}`
                              : `https://fence-estimator-eight.vercel.app/?portal=contract&estimateId=${selectedHistoryEstimate.id}&versionId=${ver.versionId}`;
                            return (
                              <tr key={ver.versionId} className="border-b last:border-0 border-slate-50 hover:bg-slate-50 transition-colors">
                                <td className="p-3 font-black text-american-blue">v{ver.version}</td>
                                <td className="p-3 text-slate-800 font-medium">{new Date(ver.createdAt).toLocaleString()}</td>
                                <td className="p-3 text-slate-600 font-bold">{ver.createdBy || 'SYSTEM'}</td>
                                <td className="p-3 text-slate-500 break-all">{ver.emailRecipient || 'N/A'}</td>
                                <td className="p-3 text-center">
                                  {ver.drawingUrl ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] bg-sky-50 text-sky-700 font-bold px-2 py-0.5 rounded-full border border-sky-100" title={ver.drawingFilename || 'Custom Drawing Design'}>
                                      🎨 Map Design Attached
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-gray-400">No drawing</span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <span className={cn(
                                    "px-2.5 py-1 text-[9px] uppercase font-black tracking-widest rounded-full border",
                                    ver.status === 'Accepted' || ver.status === 'accepted' || ver.customerDecision === 'accepted' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                    ver.status === 'Declined' || ver.status === 'declined' || ver.customerDecision === 'declined' ? "bg-red-50 text-red-700 border-red-100" :
                                    "bg-blue-50 text-blue-700 border-blue-100"
                                  )}>
                                    {ver.status || ver.customerDecision || 'Sent'}
                                  </span>
                                  {(ver.status === 'Accepted' || ver.status === 'accepted' || ver.customerDecision === 'accepted') && ver.customerSignature && (
                                    <div className="text-[9px] text-emerald-600 font-bold mt-1">
                                      ✓ {ver.customerSignature}
                                    </div>
                                  )}
                                  {(ver.status === 'Declined' || ver.status === 'declined' || ver.customerDecision === 'declined') && ver.customerDeclineReason && (
                                    <div className="text-[9px] text-red-500 italic mt-1 max-w-[150px] mx-auto truncate" title={ver.customerDeclineReason}>
                                      "{ver.customerDeclineReason}"
                                    </div>
                                  )}
                                  {ver.decisionHistory && ver.decisionHistory.length > 0 && (
                                    <div className="mt-2 text-[9px] bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1 text-left max-w-[180px] mx-auto">
                                      <p className="font-extrabold uppercase text-slate-400 text-[8px] tracking-wide mb-1">Decision History ({ver.decisionHistory.length}):</p>
                                      <div className="max-h-[80px] overflow-y-auto space-y-1">
                                        {ver.decisionHistory.map((h: any, idx: number) => (
                                          <div key={idx} className="border-b last:border-0 border-slate-100 pb-1 last:pb-0">
                                            <p className="text-slate-500 font-bold">
                                              <span className="capitalize">{h.previousDecision}</span> ➔ <span className="capitalize font-black text-slate-800">{h.newDecision}</span>
                                            </p>
                                            <p className="text-slate-400 font-medium">{h.customerName} &bull; {new Date(h.changedAt).toLocaleDateString()}</p>
                                            {h.newDecision === 'accepted' && h.customerSignature && (
                                              <p className="text-emerald-600 font-semibold text-[8px]">Sig: {h.customerSignature}</p>
                                            )}
                                            {h.newDecision === 'declined' && h.declineReason && (
                                              <p className="text-red-500 font-mono italic text-[8px] truncate" title={h.declineReason}>Reason: "{h.declineReason}"</p>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 text-right whitespace-nowrap">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(revisionLink)
                                          .then(() => alert(`Link for Revision #${ver.version} copied to clipboard!`))
                                          .catch(() => alert('Failed to copy. URL: ' + revisionLink));
                                      }}
                                      className="px-2 py-1 text-[10px] font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200 flex items-center gap-1"
                                    >
                                      <Copy size={11} /> Copy Link
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleResendHistoryVersion(ver)}
                                      disabled={isSendingEmail}
                                      className="px-2 py-1 text-[10px] font-bold text-white bg-american-blue hover:bg-[#0b3c8a] disabled:bg-slate-400 rounded-lg transition-colors flex items-center gap-1"
                                    >
                                      <Mail size={11} /> Resend
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Compare Revisions Selectors */}
                  {versions.length >= 1 && (
                    <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl space-y-4">
                      <div>
                        <h4 className="text-sm font-black text-american-blue uppercase tracking-wider">Side-by-Side Comparative Audit Engine</h4>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Select two revisions below to audit prices, lumber runs, gate totals, discounts, design drawings, and legal snapshot wordings.</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Audit Baseline (From Revision)</label>
                          <select
                            value={compareFromId}
                            onChange={(e) => setCompareFromId(e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-xl p-2.5 bg-white font-bold"
                          >
                            <option value="">-- Choose Baseline Revision --</option>
                            {versions.map((v: any) => (
                              <option key={v.versionId} value={v.versionId}>Revision #{v.version} ({new Date(v.createdAt).toLocaleDateString()})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Target Comparison (To Revision)</label>
                          <select
                            value={compareToId}
                            onChange={(e) => setCompareToId(e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-xl p-2.5 bg-white font-bold"
                          >
                            <option value="">-- Choose Target Revision --</option>
                            {versions.map((v: any) => (
                              <option key={v.versionId} value={v.versionId}>Revision #{v.version} ({new Date(v.createdAt).toLocaleDateString()})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Diff Comparison Result panel */}
                      {verA && verB && renderVersionDiff(verA, verB)}
                    </div>
                  )}

                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedHistoryEstimate(null);
                      setCompareFromId("");
                      setCompareToId("");
                    }}
                    className="py-2.5 px-6 bg-[#0c1a30] hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow"
                  >
                    Dismiss Revision Panel
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* CRM Contact Sync Diagnostic Modal Popup */}
      <AnimatePresence>
        {syncDiagnosticEstimate && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col font-sans text-left"
            >
              {/* Header */}
              <div className="p-6 bg-[#0c1a30] text-white flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 p-2.5 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                    <Shield size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider">CRM Sync Diagnostic Console</h3>
                    <p className="text-[10px] opacity-70 font-semibold uppercase tracking-widest mt-0.5">
                      Contact Match & Trace Audit for Estimate #{syncDiagnosticEstimate.estimateNumber || '1201'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSyncDiagnosticEstimate(null);
                    setSyncDiagnosticResult(null);
                  }}
                  className="text-white/70 hover:text-white transition-colors p-1"
                >
                  <ArrowLeft size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto max-h-[70vh] space-y-6">
                
                {/* Contact Baseline Profile */}
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Target Customer Contact Profile</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Customer Name</p>
                      <p className="text-xs font-black text-slate-800 mt-0.5">{syncDiagnosticEstimate.customerName || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Email Address</p>
                      <p className="text-xs font-black text-slate-800 mt-0.5">{syncDiagnosticEstimate.customerEmail || (syncDiagnosticEstimate as any).email || 'None Provided'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Phone Number</p>
                      <p className="text-xs font-black text-[#0c1a30] font-mono mt-0.5">{syncDiagnosticEstimate.customerPhone || (syncDiagnosticEstimate as any).phone || 'None Provided'}</p>
                    </div>
                  </div>
                </div>

                {/* Status Indicator */}
                {syncDiagnosticLoading ? (
                  <div className="flex flex-col items-center justify-center py-10 space-y-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider animate-pulse text-center">Running full GoHighLevel matching API diagnostics...</p>
                  </div>
                ) : syncDiagnosticResult ? (
                  <div className="space-y-6">
                    {/* Diagnostic Outcomes Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Overall Status Box */}
                      <div className={cn(
                        "p-4 rounded-2xl border flex items-start gap-3",
                        syncDiagnosticResult.success 
                          ? "bg-emerald-50 border-emerald-200/50 text-emerald-800" 
                          : "bg-red-50 border-red-200/50 text-red-800"
                      )}>
                        {syncDiagnosticResult.success ? (
                          <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
                        ) : (
                          <AlertCircle size={18} className="text-red-600 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Test Run Outcome</p>
                          <p className="text-xs font-black mt-1">
                            {syncDiagnosticResult.success ? 'CRM Sync Succeeded' : 'CRM Sync Failed'}
                          </p>
                          <p className="text-[11px] font-semibold mt-0.5 opacity-90">
                            {syncDiagnosticResult.message || syncDiagnosticResult.error}
                          </p>
                        </div>
                      </div>

                      {/* CRM ID Mappings */}
                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl space-y-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active CRM IDs</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[9px] text-slate-400 font-bold block uppercase">GHL Contact ID</span>
                            <span className="font-mono font-black text-slate-800 bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[10px] inline-block mt-0.5">
                              {syncDiagnosticResult.ghlContactId || 'None'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[9px] text-slate-400 font-bold block uppercase">Opportunity ID</span>
                            <span className="font-mono font-black text-slate-800 bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[10px] inline-block mt-0.5">
                              {syncDiagnosticResult.ghlOpportunityId || 'None'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Step-by-Step Interactive Trace Report */}
                    {syncDiagnosticResult.trace && (
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Execution Steps & Trace Details</h4>
                        <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 text-xs">
                          
                          {/* Step 1: Baseline Check */}
                          <div className="p-3 bg-white flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="bg-slate-100 text-slate-600 h-5 w-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                              <span className="font-bold text-slate-700 truncate">Pre-existing CRM Cache Scan</span>
                            </div>
                            <span className="font-mono font-semibold text-slate-600 bg-slate-50 border px-1.5 py-0.5 rounded text-[10px] shrink-0">
                              {syncDiagnosticResult.trace.existingGhlContactId ? `Cached ID found: ${syncDiagnosticResult.trace.existingGhlContactId}` : 'No cached ID'}
                            </span>
                          </div>

                          {/* Step 2: Email Match */}
                          <div className="p-3 bg-white flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="bg-slate-100 text-slate-600 h-5 w-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                              <span className="font-bold text-slate-700 truncate">GoHighLevel Email Exact Search</span>
                            </div>
                            <span className={cn(
                              "font-mono font-semibold px-1.5 py-0.5 rounded text-[10px] border shrink-0",
                              syncDiagnosticResult.trace.didSearchByEmail 
                                ? syncDiagnosticResult.trace.matchedExistingContactId && syncDiagnosticResult.trace.matchedExistingContactId === syncDiagnosticResult.trace.existingGhlContactId
                                  ? "bg-slate-50 text-slate-600" 
                                  : syncDiagnosticResult.trace.matchedExistingContactId
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                    : "bg-amber-50 text-amber-700 border-amber-100"
                                : "bg-slate-50 text-slate-400"
                            )}>
                              {!syncDiagnosticResult.trace.didSearchByEmail ? 'Skipped (No Email or Cached ID used)' : syncDiagnosticResult.trace.matchedExistingContactId ? `Matched Contact: ${syncDiagnosticResult.trace.matchedExistingContactId}` : 'No Match Found'}
                            </span>
                          </div>

                          {/* Step 3: Phone Match */}
                          <div className="p-3 bg-white flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="bg-slate-100 text-slate-600 h-5 w-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                              <span className="font-bold text-slate-700 truncate">GoHighLevel Phone Normalized Search</span>
                            </div>
                            <span className={cn(
                              "font-mono font-semibold px-1.5 py-0.5 rounded text-[10px] border shrink-0",
                              syncDiagnosticResult.trace.didSearchByPhone 
                                ? syncDiagnosticResult.trace.matchedExistingContactId 
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                  : "bg-amber-50 text-amber-700 border-amber-100"
                                : "bg-slate-50 text-slate-400"
                            )}>
                              {!syncDiagnosticResult.trace.didSearchByPhone ? 'Skipped (Not Needed or No Phone)' : syncDiagnosticResult.trace.matchedExistingContactId ? `Matched Contact: ${syncDiagnosticResult.trace.matchedExistingContactId}` : 'No Match Found'}
                            </span>
                          </div>

                          {/* Step 4: Contact Resolution */}
                          <div className="p-3 bg-white flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="bg-slate-100 text-slate-600 h-5 w-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">4</span>
                              <span className="font-bold text-slate-700 truncate">Contact Integration Resolution</span>
                            </div>
                            <span className="font-bold text-slate-700 shrink-0">
                              {syncDiagnosticResult.trace.createdNewContactId ? (
                                <span className="text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded text-[10px]">Created New Contact</span>
                              ) : syncDiagnosticResult.trace.matchedExistingContactId ? (
                                <span className="text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded text-[10px]">Resolved Existing Contact</span>
                              ) : (
                                <span className="text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded text-[10px]">Resolution Failed</span>
                              )}
                            </span>
                          </div>

                          {/* Step 5: Database Cache Persistence */}
                          <div className="p-3 bg-white flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="bg-slate-100 text-slate-600 h-5 w-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">5</span>
                              <span className="font-bold text-slate-700 truncate">Estimate ID Back-Caching to Local DB</span>
                            </div>
                            <span className={cn(
                              "font-bold px-1.5 py-0.5 rounded text-[10px] border shrink-0",
                              syncDiagnosticResult.trace.savedGhlContactIdBackToEstimate 
                                ? "bg-emerald-50 border-emerald-100 text-emerald-700" 
                                : "bg-slate-50 text-slate-500"
                            )}>
                              {syncDiagnosticResult.trace.savedGhlContactIdBackToEstimate ? 'Successfully Persisted' : 'Not Saved/Not Required'}
                            </span>
                          </div>

                          {/* Step 6: Pipeline Opportunity */}
                          <div className="p-3 bg-white flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="bg-slate-100 text-slate-600 h-5 w-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">6</span>
                              <span className="font-bold text-slate-700 truncate">Opportunity Stage Progression</span>
                            </div>
                            <span className="font-mono font-semibold text-slate-600 bg-slate-50 border px-1.5 py-0.5 rounded text-[10px] shrink-0">
                              {syncDiagnosticResult.trace.pipelineOpportunityActionAttempted || 'None'}
                            </span>
                          </div>

                          {/* Step 7: Tags application */}
                          <div className="p-3 bg-white flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="bg-slate-100 text-slate-600 h-5 w-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0">7</span>
                              <span className="font-bold text-slate-700 truncate">Assigned Tags & Custom Fields</span>
                            </div>
                            <span className="font-semibold text-slate-600 max-w-[50%] truncate text-[10px] shrink-0">
                              Attempted: {syncDiagnosticResult.trace.tagsAttempted?.join(', ') || 'None'}
                            </span>
                          </div>

                        </div>
                      </div>
                    )}

                    {/* HTTP Payload Response Preview */}
                    {syncDiagnosticResult.trace && syncDiagnosticResult.trace.responseBody && (
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">HTTP Response Payload Details</h4>
                        <pre className="p-3 bg-slate-950 text-slate-100 font-mono text-[10px] rounded-2xl overflow-x-auto max-h-[150px] leading-relaxed select-all">
                          {`HTTP Status: ${syncDiagnosticResult.trace.responseStatus}\nResponseBody:\n${
                            (() => {
                              try {
                                return JSON.stringify(JSON.parse(syncDiagnosticResult.trace.responseBody), null, 2);
                              } catch(e) {
                                return syncDiagnosticResult.trace.responseBody;
                              }
                            })()
                          }`}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 space-y-3">
                    <AlertCircle size={24} className="text-slate-400" />
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider text-center">No diagnostic data retrieved.</p>
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => handleRunContactSyncDiagnostic(syncDiagnosticEstimate)}
                  disabled={syncDiagnosticLoading}
                  className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow disabled:opacity-50"
                >
                  Re-Run Diagnostic Sync
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSyncDiagnosticEstimate(null);
                    setSyncDiagnosticResult(null);
                  }}
                  className="py-2.5 px-6 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
                >
                  Close Console
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
