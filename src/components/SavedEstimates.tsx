import React from 'react';
import { 
  FileText, Search, Archive, RotateCcw, Trash2, 
  ChevronRight, Calendar, MapPin, DollarSign,
  Filter, MoreVertical, ExternalLink, Download,
  Shield, Check, Briefcase, CheckCircle2, Image as ImageIcon,
  FolderOpen, ArrowLeft, ChevronDown, Mail, Send, Eye, Clock, Lock, AlertCircle
} from 'lucide-react';
import { SavedEstimate, JobStatus, JobPhoto, User } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType, getEstimateDoc } from '../lib/firebase';
import { updateDoc, deleteDoc } from 'firebase/firestore';

interface SavedEstimatesProps {
  savedEstimates: SavedEstimate[];
  setSavedEstimates: React.Dispatch<React.SetStateAction<SavedEstimate[]>>;
  onLoadEstimate: (estimate: SavedEstimate) => void;
  setActiveTab: (tab: string) => void;
  user: User | null;
}

const STATUS_FLOW: JobStatus[] = ['Estimate Pending', 'Estimate Sent', 'Accepted', 'Completed'];

export default function SavedEstimates({ savedEstimates, setSavedEstimates, onLoadEstimate, setActiveTab, user }: SavedEstimatesProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'active' | 'completed' | 'archived'>('active');
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [view, setView] = React.useState<'list' | 'files'>('list');
  const [selectedJobPhotos, setSelectedJobPhotos] = React.useState<SavedEstimate | null>(null);
  const [openDropdownId, setOpenDropdownId] = React.useState<string | null>(null);

  // Send Estimate Modal States
  const [sendModalEstimate, setSendModalEstimate] = React.useState<SavedEstimate | null>(null);
  const [senderEmail, setSenderEmail] = React.useState('BradenS@LoneStarFenceWorks.com');
  const [customerEmail, setCustomerEmail] = React.useState('');
  const [emailSubject, setEmailSubject] = React.useState('');
  const [emailMessage, setEmailMessage] = React.useState('');
  const [isSendingEmail, setIsSendingEmail] = React.useState(false);
  const [sendSuccessMessage, setSendSuccessMessage] = React.useState<string | null>(null);
  const [sendErrorMessage, setSendErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (sendModalEstimate) {
      setCustomerEmail(sendModalEstimate.customerEmail || '');
      setSenderEmail('BradenS@LoneStarFenceWorks.com');
      setEmailSubject(`Fence Installation Contract Agreement - Lone Star Fence Works`);
      
      const host = window.location.host;
      const protocol = window.location.protocol;
      const estimateLink = `${protocol}//${host}/?portal=contract&estimateId=${sendModalEstimate.id}`;
      
      const clientName = sendModalEstimate.customerName || 'Valued Customer';
      setEmailMessage(`Hello ${clientName},\n\nWe have generated your custom fencing contract agreement estimate. Please review and sign the agreement directly on your device using the secure link below:\n\n${estimateLink}\n\nThank you for choosing Lone Star Fence Works!\n\nBest regards,\nLone Star Fence Works Estimations Department`);
      setSendSuccessMessage(null);
      setSendErrorMessage(null);
    }
  }, [sendModalEstimate]);

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
      const response = await fetch(`/api/estimates/${sendModalEstimate.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail,
          senderEmail,
          subject: emailSubject,
          message: emailMessage
        })
      });

      if (!response.ok) {
        throw new Error('Failed to transmit email package.');
      }

      const result = await response.json();
      if (result.success) {
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
        setSendErrorMessage(result.error || 'Server rejected email relay config.');
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
        setSavedEstimates(data);
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
    if (filter === 'all') {
      matchesFilter = true;
    } else if (filter === 'active') {
      matchesFilter = est.status === 'active' && est.jobStatus !== 'Completed';
    } else if (filter === 'completed') {
      matchesFilter = est.status === 'active' && est.jobStatus === 'Completed';
    } else if (filter === 'archived') {
      matchesFilter = est.status === 'archived';
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
      const response = await fetch('/api/estimates/update', {
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
          const response = await fetch('/api/estimates/delete', {
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
      const response = await fetch('/api/estimates/update', {
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
      const response = await fetch('/api/estimates/update', {
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
      const response = await fetch('/api/estimates/update', {
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
              {(['active', 'completed', 'archived', 'all'] as const).map((f) => (
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
                              </div>
                              <div className="text-[11px] font-medium text-gray-400 truncate max-w-sm flex items-center gap-1 mt-0.5" title={estimate.customerAddress || 'No Address'}>
                                <MapPin size={10} className="shrink-0" />
                                <span className="truncate">{estimate.customerAddress || 'No Address'}</span>
                                <span className="mx-1 text-gray-300">|</span>
                                <span className="font-bold text-gray-500">{estimate.linearFeet} LF</span>
                              </div>
                            </td>
                            <td className="py-2 px-4 font-bold text-[#111111] font-mono text-xs leading-none whitespace-nowrap">
                              {formatCurrency(estimate.totalCost || estimate.manualGrandTotal || 0)}
                            </td>
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                  {estimate.jobStatus === 'Completed' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-100">
                                      <Check size={10} /> Completed
                                    </span>
                                  ) : estimate.jobStatus === 'Accepted' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-100 animate-pulse">
                                      <CheckCircle2 size={10} fill="#10B981" className="text-white" /> Accepted
                                    </span>
                                  ) : estimate.jobStatus === 'Estimate Sent' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-100">
                                      <Send size={10} /> Sent
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-100">
                                      <Clock size={10} /> Draft
                                    </span>
                                  )}
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
                                ) : estimate.jobStatus === 'Estimate Sent' ? (
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
                        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl font-bold uppercase tracking-wider flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse shrink-0" />
                          <span>{sendErrorMessage}</span>
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
    </div>
  );
}
