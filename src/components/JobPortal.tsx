import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar as CalendarIcon, Clock, MapPin, Hammer, AlertTriangle, 
  Check, Loader2, RefreshCw, Eye, ShieldCheck, ChevronLeft, ChevronRight,
  Camera, Plus, Trash2, ClipboardList, Package, Image as ImageIcon,
  Map, MessageSquare, History, CheckCircle2, X, AlertCircle, Play,
  Send, User as UserIcon, AlertOctagon, HelpCircle, ArrowLeft
} from 'lucide-react';
import { cn } from '../lib/utils';
import { storage } from '../lib/firebase';
import { calculateDetailedTakeOff } from '../lib/calculations';
import { MaterialItem, LaborRates, User } from '../types';

interface JobPortalProps {
  user: User | null;
  materials: MaterialItem[];
  laborRates: LaborRates;
}

export default function JobPortal({ user, materials, laborRates }: JobPortalProps) {
  const [estimateId, setEstimateId] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Job Data
  const [jobData, setJobData] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'labor' | 'materials' | 'checklists' | 'reports' | 'history'>('overview');

  // Interactive site drawing zoom state
  const [zoomDrawing, setZoomDrawing] = useState(false);

  // Office actions states
  const [adminNotes, setAdminNotes] = useState('');
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);

  // Crew Checklist states
  const [crewLeaderName, setCrewLeaderName] = useState('');
  const [notes, setNotes] = useState('');
  const [issuesDocumented, setIssuesDocumented] = useState(false);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [submittingChecklist, setSubmittingChecklist] = useState(false);
  const [checklistError, setChecklistError] = useState('');
  const [checklistSuccess, setChecklistSuccess] = useState(false);

  // Incident reports states
  const [reportType, setReportType] = useState<'issue' | 'shortage' | 'delay'>('issue');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState('');

  // Confirmation state
  const [confirmNotes, setConfirmNotes] = useState('');
  const [submittingConfirm, setSubmittingConfirm] = useState(false);
  const [confirmSuccess, setConfirmSuccess] = useState(false);

  // Load URL parameters and fetch data
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let estId = params.get('estimateId') || params.get('id') || '';
    let tok = params.get('token') || '';

    if (!estId || !tok) {
      const hash = window.location.hash;
      if (hash.includes('estimateId=')) {
        estId = hash.substring(hash.indexOf('estimateId=') + 11).split('&')[0];
      } else if (hash.includes('id=')) {
        estId = hash.substring(hash.indexOf('id=') + 3).split('&')[0];
      }
      if (hash.includes('token=')) {
        tok = hash.substring(hash.indexOf('token=') + 6).split('&')[0];
      }
    }

    setEstimateId(estId);
    setToken(tok);

    if (estId && tok) {
      fetchJobDetails(estId, tok);
    } else {
      setError('Invalid Job Portal Link. Secure token and Estimate ID are missing from the URL.');
      setLoading(false);
    }
  }, []);

  const fetchJobDetails = async (estId: string, tok: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/estimates/write?action=get-labor-snapshot&estimateId=${estId}&token=${tok}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to retrieve secure job portal data.');
      }
      setJobData(data.estimate || {});
      setSnapshot(data.snapshot || {});
      setSettings(data.settings || {});
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  // Upload job portal photos
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setChecklistError('');

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Convert file to base64
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (err) => reject(err);
        });
        reader.readAsDataURL(file);
        const base64Data = await base64Promise;

        // Call our serverless upload action
        const res = await fetch('/api/estimates/write', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'upload-job-portal-photo',
            estimateId,
            token,
            filename: `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
            mimeType: file.type || 'image/jpeg',
            base64Data
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to upload photo to server');
        }

        if (data.drawingUrl) {
          setUploadedPhotos(prev => [...prev, data.drawingUrl]);
        }
      }
    } catch (err: any) {
      setChecklistError(`Upload error: ${err.message || String(err)}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Remove uploaded photo preview
  const handleRemovePhoto = (urlToRemove: string) => {
    setUploadedPhotos(prev => prev.filter(url => url !== urlToRemove));
  };

  // Submit Pre-Build Checklist
  const handleSubmitPreBuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crewLeaderName.trim()) {
      setChecklistError('Crew Leader Name is required.');
      return;
    }
    if (uploadedPhotos.length < 3) {
      setChecklistError('At least 3 site/pre-build photos are required to document job conditions.');
      return;
    }

    setSubmittingChecklist(true);
    setChecklistError('');
    setChecklistSuccess(false);

    try {
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'submit-pre-build-checklist',
          estimateId,
          token,
          crewLeaderName,
          startTime: new Date().toISOString(),
          notes,
          photos: uploadedPhotos
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to submit pre-build checklist.');
      }

      setChecklistSuccess(true);
      // Reset form
      setCrewLeaderName('');
      setNotes('');
      setUploadedPhotos([]);
      // Reload job details
      await fetchJobDetails(estimateId, token);
    } catch (err: any) {
      setChecklistError(err?.message || String(err));
    } finally {
      setSubmittingChecklist(false);
    }
  };

  // Submit Completion Checklist
  const handleSubmitCompletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crewLeaderName.trim()) {
      setChecklistError('Crew Leader Name is required.');
      return;
    }
    if (uploadedPhotos.length < 5) {
      setChecklistError('At least 5 completion photos are required to document finalized workmanship.');
      return;
    }

    setSubmittingChecklist(true);
    setChecklistError('');
    setChecklistSuccess(false);

    try {
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'submit-completion-checklist',
          estimateId,
          token,
          crewLeaderName,
          completionTime: new Date().toISOString(),
          notes,
          issuesDocumented,
          photos: uploadedPhotos
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to submit completion checklist.');
      }

      setChecklistSuccess(true);
      // Reset form
      setCrewLeaderName('');
      setNotes('');
      setUploadedPhotos([]);
      setIssuesDocumented(false);
      // Reload job details
      await fetchJobDetails(estimateId, token);
    } catch (err: any) {
      setChecklistError(err?.message || String(err));
    } finally {
      setSubmittingChecklist(false);
    }
  };

  // Crew Schedule Confirmations (72hr / 24hr)
  const handleScheduleConfirm = async (responseType: 'confirm' | 'conflict', reqType: '72hr' | '24hr') => {
    setSubmittingConfirm(true);
    setConfirmSuccess(false);

    try {
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'submit-schedule-response',
          estimateId,
          token,
          responseType,
          notes: confirmNotes,
          confirmationType: reqType
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit scheduling confirmation.');
      }

      setConfirmSuccess(true);
      setConfirmNotes('');
      await fetchJobDetails(estimateId, token);
    } catch (err: any) {
      alert(`Error submitting response: ${err.message || String(err)}`);
    } finally {
      setSubmittingConfirm(false);
    }
  };

  // Submit Incident / Weather / Material Shortage Report
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportDetails.trim()) {
      setReportError('Please provide details for the report.');
      return;
    }

    setSubmittingReport(true);
    setReportError('');
    setReportSuccess(false);

    try {
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'submit-job-portal-report',
          estimateId,
          token,
          reportType,
          details: reportDetails
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit incident report.');
      }

      setReportSuccess(true);
      setReportDetails('');
      await fetchJobDetails(estimateId, token);
    } catch (err: any) {
      setReportError(err?.message || String(err));
    } finally {
      setSubmittingReport(false);
    }
  };

  // ADMIN ACTION: Approve Completion
  const handleAdminApprove = async () => {
    setAdminSubmitting(true);
    try {
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('company_admin_token')}`
        },
        body: JSON.stringify({
          action: 'office-approve-completion',
          estimateId,
          notes: adminNotes
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve job completion.');
      }

      setAdminNotes('');
      setShowApproveModal(false);
      await fetchJobDetails(estimateId, token);
    } catch (err: any) {
      alert(`Error: ${err.message || String(err)}`);
    } finally {
      setAdminSubmitting(false);
    }
  };

  // ADMIN ACTION: Return to Crew
  const handleAdminReturn = async () => {
    if (!adminNotes.trim()) {
      alert('Return notes are required to explain correction procedures.');
      return;
    }
    setAdminSubmitting(true);
    try {
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('company_admin_token')}`
        },
        body: JSON.stringify({
          action: 'office-return-to-crew',
          estimateId,
          notes: adminNotes
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to return job to crew.');
      }

      setAdminNotes('');
      setShowReturnModal(false);
      await fetchJobDetails(estimateId, token);
    } catch (err: any) {
      alert(`Error: ${err.message || String(err)}`);
    } finally {
      setAdminSubmitting(false);
    }
  };

  // ADMIN ACTION: Request 72hr or 24hr confirmation
  const handleAdminRequestConfirmation = async (requestType: '72hr' | '24hr') => {
    if (!confirm('Are you sure you want to request schedule confirmation from the crew? This will send them an automated notification.')) return;
    try {
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('company_admin_token')}`
        },
        body: JSON.stringify({
          action: 'send-schedule-confirmation-request',
          estimateId,
          requestType
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to request confirmation.');
      }

      alert(`Schedule confirmation request (${requestType}) successfully sent to crew.`);
      await fetchJobDetails(estimateId, token);
    } catch (err: any) {
      alert(`Error: ${err.message || String(err)}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070D19] text-white">
        <div className="text-center space-y-4">
          <Loader2 size={44} className="text-[#E63946] animate-spin mx-auto" />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Loading Secure Job Portal...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070D19] p-4 text-white">
        <div className="max-w-md w-full bg-white text-slate-900 rounded-[32px] p-8 border-t-8 border-[#E63946] shadow-2xl text-center space-y-6">
          <div className="h-16 w-16 bg-red-50 text-[#E63946] rounded-full flex items-center justify-center mx-auto text-3xl">
            ⚠️
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black uppercase tracking-tight text-[#1D3557]">Portal Access Denied</h2>
            <p className="text-xs text-red-600 font-bold uppercase tracking-wider">{error}</p>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            This secure Job Portal route is restricted. Please refer to the dispatch link sent to your crew.
          </p>
        </div>
      </div>
    );
  }

  // Calculate Materials takeoff list if jobData exists
  const calculatedTakeoff = jobData ? calculateDetailedTakeOff(jobData, materials, laborRates) : null;
  const materialsList = calculatedTakeoff?.summary || [];

  // Determine current job status label and color
  const statusLabels: Record<string, { label: string, color: string, bg: string }> = {
    dispatched: { label: 'Job Dispatched', color: 'text-slate-300 border-slate-500', bg: 'bg-slate-500/10' },
    schedule_confirmed_72hr: { label: 'Schedule Confirmed (72hr)', color: 'text-emerald-400 border-emerald-500', bg: 'bg-emerald-500/10' },
    schedule_confirmed_24hr: { label: 'Schedule Confirmed (24hr)', color: 'text-emerald-400 border-emerald-500', bg: 'bg-emerald-500/10' },
    schedule_conflict: { label: 'Schedule Conflict', color: 'text-rose-400 border-rose-500', bg: 'bg-rose-500/10' },
    pre_build_complete: { label: 'Pre-Build Complete', color: 'text-amber-400 border-amber-500', bg: 'bg-amber-500/10' },
    in_progress: { label: 'In Progress', color: 'text-blue-400 border-blue-500', bg: 'bg-blue-500/10' },
    completion_submitted: { label: 'Completion Submitted', color: 'text-[#E63946] border-[#E63946]', bg: 'bg-[#E63946]/10' },
    returned_to_crew: { label: 'Returned to Crew', color: 'text-amber-500 border-amber-600', bg: 'bg-amber-600/10' },
    completed: { label: 'Completed', color: 'text-emerald-400 border-emerald-500', bg: 'bg-emerald-500/10' }
  };

  const currentStatusKey = jobData.jobPortalStatus || 'dispatched';
  const statusInfo = statusLabels[currentStatusKey] || { label: 'Active Job', color: 'text-blue-400 border-blue-500', bg: 'bg-blue-500/10' };

  return (
    <div className="min-h-screen bg-[#070D19] text-slate-100 font-sans pb-16">
      
      {/* Top Admin / Office Actions Card */}
      {user && (
        <div className="bg-[#1D3557] border-b border-blue-900/30 p-4 sticky top-0 z-50 shadow-md">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-white">
              <ShieldCheck size={20} className="text-emerald-400" />
              <span className="text-xs font-black uppercase tracking-wider">Office Control Panel Active</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleAdminRequestConfirmation('72hr')}
                className="px-3 py-1.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
              >
                Request 72h Confirm
              </button>
              <button
                onClick={() => handleAdminRequestConfirmation('24hr')}
                className="px-3 py-1.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
              >
                Request 24h Confirm
              </button>
              
              {currentStatusKey === 'completion_submitted' && (
                <>
                  <button
                    onClick={() => {
                      setAdminNotes('');
                      setShowApproveModal(true);
                    }}
                    className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-[#0c1a30] text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
                  >
                    Approve Job Completion
                  </button>
                  <button
                    onClick={() => {
                      setAdminNotes('');
                      setShowReturnModal(true);
                    }}
                    className="px-4 py-1.5 bg-rose-500 hover:bg-rose-400 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
                  >
                    Return to Crew
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 pt-6 space-y-6">
        
        {/* Main Branding Header */}
        <div className="bg-gradient-to-r from-[#1D3557] to-[#112240] p-6 sm:p-8 rounded-[32px] border border-blue-900/30 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute right-0 top-0 h-40 w-40 bg-[#E63946]/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            <div className="h-16 w-16 rounded-2xl bg-[#E63946] flex items-center justify-center text-white shadow-lg shrink-0">
              <ClipboardList size={32} />
            </div>
            <div>
              <p className="text-[10px] font-black tracking-[0.25em] text-[#E63946] uppercase">
                Lone Star Fence Works
              </p>
              <h1 className="text-xl sm:text-3xl font-black text-white uppercase tracking-tight">
                Secure Crew Job Portal
              </h1>
              <p className="text-xs text-slate-400 mt-1 flex items-center justify-center sm:justify-start gap-1">
                <ShieldCheck size={14} className="text-emerald-500 inline" /> Dispatched Job Records Protected
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-[#0A1120] px-5 py-3 rounded-2xl border border-blue-900/20">
            <div className="text-right">
              <span className="text-[9px] text-slate-500 uppercase block tracking-wider font-extrabold">Assigned Crew</span>
              <span className="text-sm text-slate-100 font-black">{snapshot.crewName || jobData.crewEmailRecipient?.split('@')[0] || 'Scheduled Crew'}</span>
            </div>
          </div>
        </div>

        {/* Dynamic Crew Schedule Confirmation Banner */}
        {jobData.jobPortalPendingConfirmation && !confirmSuccess && (
          <div className="bg-[#1D3557] border-2 border-[#E63946]/30 rounded-3xl p-6 space-y-4">
            <div className="flex items-start gap-4">
              <AlertCircle className="text-[#E63946] shrink-0 mt-0.5 animate-pulse" size={24} />
              <div className="space-y-1">
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  Schedule Confirmation Required ({jobData.jobPortalPendingConfirmation})
                </h3>
                <p className="text-xs text-slate-300">
                  Please verify your availability and confirm your schedule for the planned install starting on <strong>{jobData.scheduledStartDate || 'Unscheduled Date'}</strong>.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <textarea
                value={confirmNotes}
                onChange={(e) => setConfirmNotes(e.target.value)}
                placeholder="Include confirmation notes or conflict reasoning..."
                className="w-full bg-[#0A1120] border border-blue-900/20 text-white rounded-xl p-3 text-xs focus:ring-1 focus:ring-[#E63946] focus:outline-none"
                rows={2}
              />
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={submittingConfirm}
                  onClick={() => handleScheduleConfirm('confirm', jobData.jobPortalPendingConfirmation)}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-[#0c1a30] font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                >
                  {submittingConfirm ? 'Submitting...' : 'Confirm Availability'}
                </button>
                <button
                  type="button"
                  disabled={submittingConfirm}
                  onClick={() => handleScheduleConfirm('conflict', jobData.jobPortalPendingConfirmation)}
                  className="px-5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                >
                  Report Schedule Conflict
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Success Alert */}
        {confirmSuccess && (
          <div className="bg-emerald-950/40 border-2 border-emerald-500/30 text-emerald-300 p-5 rounded-3xl flex items-center gap-4">
            <CheckCircle2 className="text-emerald-400 shrink-0" size={24} />
            <div>
              <p className="text-xs font-black uppercase tracking-wider">Schedule Status Updated</p>
              <p className="text-xs text-slate-300 mt-0.5">
                Your schedule response has been securely saved and the office was notified.
              </p>
            </div>
          </div>
        )}

        {/* Top Info Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#111A2E] p-5 rounded-2xl border border-blue-900/10 flex items-center gap-4">
            <div className="h-10 w-10 bg-[#1D3557] text-[#E63946] rounded-xl flex items-center justify-center shrink-0">
              <UserIcon size={20} />
            </div>
            <div>
              <span className="text-[9px] text-slate-500 uppercase block font-extrabold tracking-wider">Customer Name</span>
              <span className="text-xs font-bold text-slate-200 line-clamp-1">{snapshot.customerName}</span>
            </div>
          </div>

          <div className="bg-[#111A2E] p-5 rounded-2xl border border-blue-900/10 flex items-center gap-4">
            <div className="h-10 w-10 bg-[#1D3557] text-[#E63946] rounded-xl flex items-center justify-center shrink-0">
              <MapPin size={20} />
            </div>
            <div>
              <span className="text-[9px] text-slate-500 uppercase block font-extrabold tracking-wider">Jobsite Address</span>
              <span className="text-xs font-bold text-slate-200 line-clamp-1">{snapshot.jobAddress}</span>
            </div>
          </div>

          <div className="bg-[#111A2E] p-5 rounded-2xl border border-blue-900/10 flex items-center gap-4">
            <div className="h-10 w-10 bg-[#111A2E] border border-blue-900/30 text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
              <CalendarIcon size={20} />
            </div>
            <div>
              <span className="text-[9px] text-slate-500 uppercase block font-extrabold tracking-wider">Scheduled Start Date</span>
              <span className="text-xs font-black text-slate-200 font-mono">
                {jobData.scheduledStartDate ? jobData.scheduledStartDate : 'Pending Schedule'}
              </span>
            </div>
          </div>

          <div className="bg-[#111A2E] p-5 rounded-2xl border border-blue-900/10 flex items-center gap-4">
            <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border", statusInfo.color)}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <span className="text-[9px] text-slate-500 uppercase block font-extrabold tracking-wider">Job Portal Status</span>
              <span className={cn("text-xs font-black uppercase", statusInfo.color)}>
                {statusInfo.label}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 border-b border-blue-900/20 overflow-x-auto pb-1.5 scrollbar-thin">
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              "px-4 py-2.5 text-xs font-black uppercase tracking-wider shrink-0 transition-all border-b-2",
              activeTab === 'overview' ? "text-[#E63946] border-[#E63946]" : "text-slate-400 border-transparent hover:text-slate-200"
            )}
          >
            <ImageIcon size={14} className="inline mr-1.5" /> Overview & Site Drawing
          </button>
          
          <button
            onClick={() => setActiveTab('labor')}
            className={cn(
              "px-4 py-2.5 text-xs font-black uppercase tracking-wider shrink-0 transition-all border-b-2",
              activeTab === 'labor' ? "text-[#E63946] border-[#E63946]" : "text-slate-400 border-transparent hover:text-slate-200"
            )}
          >
            <Hammer size={14} className="inline mr-1.5" /> Labor Breakdown
          </button>

          <button
            onClick={() => setActiveTab('materials')}
            className={cn(
              "px-4 py-2.5 text-xs font-black uppercase tracking-wider shrink-0 transition-all border-b-2",
              activeTab === 'materials' ? "text-[#E63946] border-[#E63946]" : "text-slate-400 border-transparent hover:text-slate-200"
            )}
          >
            <Package size={14} className="inline mr-1.5" /> Material Checklist
          </button>

          <button
            onClick={() => setActiveTab('checklists')}
            className={cn(
              "px-4 py-2.5 text-xs font-black uppercase tracking-wider shrink-0 transition-all border-b-2",
              activeTab === 'checklists' ? "text-[#E63946] border-[#E63946]" : "text-slate-400 border-transparent hover:text-slate-200"
            )}
          >
            <CheckCircle2 size={14} className="inline mr-1.5" /> Crew Checklists
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={cn(
              "px-4 py-2.5 text-xs font-black uppercase tracking-wider shrink-0 transition-all border-b-2",
              activeTab === 'reports' ? "text-[#E63946] border-[#E63946]" : "text-slate-400 border-transparent hover:text-slate-200"
            )}
          >
            <MessageSquare size={14} className="inline mr-1.5" /> Incident & Shortage Reports
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={cn(
              "px-4 py-2.5 text-xs font-black uppercase tracking-wider shrink-0 transition-all border-b-2",
              activeTab === 'history' ? "text-[#E63946] border-[#E63946]" : "text-slate-400 border-transparent hover:text-slate-200"
            )}
          >
            <History size={14} className="inline mr-1.5" /> Log & History
          </button>
        </div>

        {/* Tab Contents */}
        <div className="bg-[#111A2E] rounded-3xl p-6 sm:p-8 border border-blue-900/10 shadow-xl min-h-[400px]">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-black uppercase text-white tracking-tight">Job Specifications & Location</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Key parameters for fence crew</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-[#0A1120] p-4 rounded-xl border border-blue-900/15">
                    <span className="text-[9px] text-slate-500 uppercase block font-extrabold tracking-wider">Fence Type / Material</span>
                    <span className="text-xs font-black text-slate-200">{snapshot.fenceType || 'Fence'}</span>
                  </div>
                  <div className="bg-[#0A1120] p-4 rounded-xl border border-blue-900/15">
                    <span className="text-[9px] text-slate-500 uppercase block font-extrabold tracking-wider">Height Specs</span>
                    <span className="text-xs font-black text-slate-200">{snapshot.height || 6} FT</span>
                  </div>
                  <div className="bg-[#0A1120] p-4 rounded-xl border border-blue-900/15">
                    <span className="text-[9px] text-slate-500 uppercase block font-extrabold tracking-wider">Total Linear Feet</span>
                    <span className="text-xs font-black text-slate-200 font-mono">{snapshot.linearFeet || 0} LF</span>
                  </div>
                  <div className="bg-[#0A1120] p-4 rounded-xl border border-blue-900/15">
                    <span className="text-[9px] text-slate-500 uppercase block font-extrabold tracking-wider">Planned Duration</span>
                    <span className="text-xs font-black text-slate-200 font-mono">{jobData.installDuration || 1} Day(s)</span>
                  </div>
                </div>

                <div className="p-4 bg-[#0A1120] rounded-xl border border-blue-900/15 space-y-3">
                  <span className="text-[9px] text-[#E63946] uppercase block font-black tracking-widest">Jobsite Navigation</span>
                  <p className="text-xs text-slate-300 font-semibold">{snapshot.jobAddress}</p>
                  
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(snapshot.jobAddress)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#1D3557] hover:bg-[#1D3557]/80 text-white text-xs font-black uppercase tracking-wider rounded-lg transition-all"
                  >
                    <Map size={14} /> Open in Google Maps
                  </a>
                </div>
              </div>

              {/* DRAWINGS SECTION */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black uppercase text-white tracking-tight">Layout site drawing</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Uploaded dimension plan</p>
                  </div>
                </div>

                {snapshot.drawingUrl ? (
                  <div className="bg-[#0A1120] p-3 rounded-2xl border border-blue-900/15 text-center relative group">
                    {snapshot.drawingMimeType?.includes('pdf') || snapshot.drawingUrl?.toLowerCase().includes('.pdf') ? (
                      <div className="py-8">
                        <ImageIcon className="mx-auto text-slate-500 mb-2" size={44} />
                        <p className="text-xs text-slate-400 mb-4">{snapshot.drawingFileName || 'layout.pdf'}</p>
                        <a
                          href={snapshot.drawingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase rounded-lg transition-all"
                        >
                          Download layout PDF
                        </a>
                      </div>
                    ) : (
                      <div className="relative overflow-hidden rounded-xl cursor-pointer" onClick={() => setZoomDrawing(true)}>
                        <img 
                          src={snapshot.drawingUrl} 
                          alt="Layout Drawing" 
                          className="w-full h-48 object-cover group-hover:scale-105 transition-all duration-300 rounded-xl"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-xs text-white font-black uppercase bg-[#E63946] px-3 py-1.5 rounded-lg shadow-lg">Click to Zoom</span>
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-2">
                      File: {snapshot.drawingFileName || 'Layout_Plan_Drawing.jpg'}
                    </p>
                  </div>
                ) : (
                  <div className="p-8 bg-[#0A1120] border-2 border-dashed border-blue-900/10 rounded-2xl text-center text-slate-500">
                    <ImageIcon className="mx-auto mb-2 text-slate-600" size={32} />
                    <p className="text-xs font-bold uppercase tracking-wider">No Site Layout Drawing Provided</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: LABOR BREAKDOWN */}
          {activeTab === 'labor' && (
            <div className="space-y-6">
              <div className="border-b border-blue-900/10 pb-4">
                <h3 className="text-base font-black uppercase text-white tracking-tight">Secure Labor Specifications & Scope</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Runs breakdown and pay summary</p>
              </div>

              {/* PAY SUMMARY TABLE */}
              <div className="bg-[#0A1120] rounded-2xl border border-blue-900/15 overflow-hidden">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="bg-[#0A1120]/80 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-blue-900/10">
                      <th className="px-5 py-4">Operation / Task Name</th>
                      <th className="px-5 py-4 text-center">Volume</th>
                      <th className="px-5 py-4 text-right">Crew Net Payout</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-900/5">
                    {Array.isArray(snapshot.aggregateLaborManifest) && snapshot.aggregateLaborManifest.length > 0 ? (
                      snapshot.aggregateLaborManifest.map((item: any, i: number) => (
                        <tr key={i} className="text-xs text-slate-300 hover:bg-[#1D3557]/10 font-medium transition-colors">
                          <td className="px-5 py-4 flex items-center gap-2.5">
                            <div className="h-1.5 w-1.5 rounded-full bg-[#E63946]" />
                            {item.name}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="px-2.5 py-1 bg-[#1D3557]/40 text-slate-200 rounded-full text-[10px] font-black font-mono">
                              {item.qty} {item.unit}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right font-bold text-[#E63946] font-mono">
                            ${Number(item.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-5 py-8 text-center text-xs text-slate-500 font-bold">
                          No labor breakdown records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#1D3557]/20 border-t-2 border-blue-900/30">
                      <td colSpan={2} className="px-5 py-4 text-right font-black uppercase tracking-widest text-[10px] text-slate-300">Total Direct Labor Payout</td>
                      <td className="px-5 py-4 text-right font-black text-[#E63946] text-base font-mono">
                        ${Number(snapshot.totalDirectLaborPayout || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* DETAILED RUNS BREAKDOWN */}
              {Array.isArray(snapshot.laborRuns) && snapshot.laborRuns.length > 0 && (
                <div className="space-y-4 pt-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">Section-by-Section Specifications</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {snapshot.laborRuns.map((run: any, idx: number) => (
                      <div key={idx} className="bg-[#0A1120] p-5 rounded-2xl border border-blue-900/15 space-y-3">
                        <div className="flex justify-between items-center border-b border-blue-900/10 pb-2">
                          <span className="text-xs font-black uppercase text-white">{run.runName || `Run Section ${idx + 1}`}</span>
                          <span className="px-2 py-0.5 bg-[#E63946]/15 text-[#E63946] rounded text-[10px] font-black font-mono">{run.linearFeet || 0} LF</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-500 block font-bold uppercase tracking-tight">Fence Style</span>
                            <span className="text-slate-300 font-semibold">{run.styleName || 'Standard'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block font-bold uppercase tracking-tight">Height Specs</span>
                            <span className="text-slate-300 font-semibold">{run.height || 6} FT</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block font-bold uppercase tracking-tight">Rails Count</span>
                            <span className="text-slate-300 font-semibold">{run.railCount || 'Standard'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block font-bold uppercase tracking-tight">Post Type</span>
                            <span className="text-slate-300 font-semibold">{run.postType || 'Standard'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SCOPE OF WORK */}
              {snapshot.scopeOfWorkHtmlOrText && (
                <div className="pt-4 space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-white">General Scope of Work Instructions</h4>
                  <div className="bg-[#0A1120] p-5 rounded-2xl border border-blue-900/15 text-xs text-slate-300 leading-relaxed max-h-60 overflow-y-auto">
                    {snapshot.scopeOfWorkHtmlOrText}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MATERIALS CHECKLIST */}
          {activeTab === 'materials' && (
            <div className="space-y-6">
              <div className="border-b border-blue-900/10 pb-4">
                <h3 className="text-base font-black uppercase text-white tracking-tight">Bill of Materials Checklist</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Crews can use this list to audit loading & yard deliveries</p>
              </div>

              {materialsList.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {materialsList.map((item: any, i: number) => (
                    <label 
                      key={i} 
                      className="flex items-start gap-4 p-4 bg-[#0A1120] hover:bg-[#111A2E] rounded-xl border border-blue-900/15 cursor-pointer select-none transition-colors"
                    >
                      <input 
                        type="checkbox" 
                        className="mt-1 h-4 w-4 bg-[#070D19] border-blue-900 text-[#E63946] focus:ring-0 rounded cursor-pointer"
                      />
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold text-slate-200 block">{item.name}</span>
                        <span className="text-[10px] font-black font-mono text-[#E63946] uppercase bg-[#E63946]/5 px-2 py-0.5 rounded">
                          Quantity: {item.qty} {item.unit || 'each'}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="p-8 bg-[#0A1120] border-2 border-dashed border-blue-900/10 rounded-2xl text-center text-slate-500">
                  <Package className="mx-auto mb-2 text-slate-600" size={32} />
                  <p className="text-xs font-bold uppercase tracking-wider">No calculated materials checklist available.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CREW CHECKLISTS */}
          {activeTab === 'checklists' && (
            <div className="space-y-8">
              
              {/* Checklists Logic Router */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 divide-y lg:divide-y-0 lg:divide-x divide-blue-900/10">
                
                {/* 1. PRE-BUILD CHECKLIST */}
                <div className="space-y-6 pb-6 lg:pb-0">
                  <div>
                    <h3 className="text-base font-black uppercase text-white tracking-tight flex items-center gap-2">
                      <Play className="text-emerald-400 shrink-0" size={18} />
                      1. Pre-Build Checklist
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Submit before digging any holes or installing posts</p>
                  </div>

                  {jobData.preBuildChecklist ? (
                    <div className="bg-emerald-950/20 border border-emerald-500/20 p-5 rounded-2xl space-y-4">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 size={18} />
                        <span className="text-xs font-black uppercase">Pre-Build Completed</span>
                      </div>
                      <div className="space-y-2 text-xs text-slate-300">
                        <p><strong className="text-slate-400">Leader Name:</strong> {jobData.preBuildChecklist.crewLeaderName}</p>
                        <p><strong className="text-slate-400">Start Time:</strong> {new Date(jobData.preBuildChecklist.startTime).toLocaleString()}</p>
                        {jobData.preBuildChecklist.notes && <p><strong className="text-slate-400">Notes:</strong> {jobData.preBuildChecklist.notes}</p>}
                        
                        {/* Display Pre-Build Photos */}
                        {Array.isArray(jobData.preBuildChecklist.photos) && jobData.preBuildChecklist.photos.length > 0 && (
                          <div className="space-y-1.5 pt-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Documented site photos:</span>
                            <div className="grid grid-cols-3 gap-2">
                              {jobData.preBuildChecklist.photos.map((url: string, index: number) => (
                                <a key={index} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border border-blue-900/20">
                                  <img src={url} alt={`Pre-Build ${index}`} className="w-full h-full object-cover" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : currentStatusKey === 'completed' || currentStatusKey === 'completion_submitted' ? (
                    <p className="text-xs text-slate-500 italic">Pre-build checklist skipped or was not recorded.</p>
                  ) : (
                    <form onSubmit={handleSubmitPreBuild} className="space-y-4">
                      {checklistError && (
                        <div className="p-4 bg-rose-950/40 text-rose-400 text-xs font-bold rounded-xl border border-rose-900/30">
                          ⚠️ {checklistError}
                        </div>
                      )}
                      {checklistSuccess && (
                        <div className="p-4 bg-emerald-950/40 text-emerald-400 text-xs font-bold rounded-xl border border-emerald-900/30">
                          ✓ Pre-Build Checklist successfully submitted! Job is marked In Progress.
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase text-[#888888] tracking-wider">Crew Leader Name *</label>
                        <input
                          type="text"
                          required
                          value={crewLeaderName}
                          onChange={(e) => setCrewLeaderName(e.target.value)}
                          placeholder="Enter your name"
                          className="w-full text-xs bg-[#0A1120] text-white border-2 border-blue-900/10 focus:border-blue-900 rounded-xl px-4 py-3 focus:outline-none transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase text-[#888888] tracking-wider">Site condition notes / Access info (Optional)</label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="e.g. site cleared, gates checked, water lines identified..."
                          className="w-full text-xs bg-[#0A1120] text-white border-2 border-blue-900/10 focus:border-blue-900 rounded-xl px-4 py-3 focus:outline-none transition-colors"
                          rows={3}
                        />
                      </div>

                      {/* Photo Upload Section */}
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase text-[#888888] tracking-wider">Upload Site Photos (At least 3 required) *</label>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {uploadedPhotos.map((url, index) => (
                            <div key={index} className="aspect-square bg-[#0A1120] rounded-xl border border-blue-900/15 relative overflow-hidden group">
                              <img src={url} alt={`Upload preview ${index}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => handleRemovePhoto(url)}
                                className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 hover:bg-black text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}

                          <label className="aspect-square bg-[#0A1120] hover:bg-[#111A2E] rounded-xl border-2 border-dashed border-blue-900/10 flex flex-col items-center justify-center cursor-pointer transition-colors relative">
                            {isUploading ? (
                              <Loader2 size={24} className="text-[#E63946] animate-spin" />
                            ) : (
                              <>
                                <Camera size={24} className="text-slate-500 mb-1" />
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Add Photo</span>
                                <span className="text-[8px] text-slate-500">({uploadedPhotos.length}/3+)</span>
                              </>
                            )}
                            <input
                              type="file"
                              multiple
                              accept="image/*"
                              disabled={isUploading}
                              onChange={handlePhotoUpload}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                          </label>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={submittingChecklist || isUploading || uploadedPhotos.length < 3}
                        className={cn(
                          "w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95",
                          (submittingChecklist || isUploading || uploadedPhotos.length < 3) && "opacity-50 cursor-not-allowed active:scale-100 hover:bg-emerald-600"
                        )}
                      >
                        {submittingChecklist ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Submitting Pre-Build...
                          </>
                        ) : (
                          <>
                            <Check size={16} />
                            Submit Pre-Build & Start Job
                          </>
                        )}
                      </button>
                    </form>
                  )}
                </div>

                {/* 2. COMPLETION CHECKLIST */}
                <div className="space-y-6 pt-6 lg:pt-0 lg:pl-8">
                  <div>
                    <h3 className="text-base font-black uppercase text-white tracking-tight flex items-center gap-2">
                      <CheckCircle2 className="text-[#E63946] shrink-0" size={18} />
                      2. Completion Checklist
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Submit when all panels, posts, and gates are fully completed</p>
                  </div>

                  {/* Complete states check */}
                  {jobData.completionChecklist ? (
                    <div className="bg-[#E63946]/5 border border-[#E63946]/20 p-5 rounded-2xl space-y-4">
                      <div className="flex items-center gap-2 text-[#E63946]">
                        <CheckCircle2 size={18} />
                        <span className="text-xs font-black uppercase">Completion Checklist Submitted</span>
                      </div>
                      <div className="space-y-2 text-xs text-slate-300">
                        <p><strong className="text-slate-400">Leader Name:</strong> {jobData.completionChecklist.crewLeaderName}</p>
                        <p><strong className="text-slate-400">Submitted Time:</strong> {new Date(jobData.completionChecklist.completionTime).toLocaleString()}</p>
                        {jobData.completionChecklist.notes && <p><strong className="text-slate-400">Workmanship Notes:</strong> {jobData.completionChecklist.notes}</p>}
                        <p><strong className="text-slate-400">Issues Documented:</strong> {jobData.completionChecklist.issuesDocumented ? 'Yes' : 'No'}</p>
                        
                        {/* Display Completion Photos */}
                        {Array.isArray(jobData.completionChecklist.photos) && jobData.completionChecklist.photos.length > 0 && (
                          <div className="space-y-1.5 pt-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Workmanship photos:</span>
                            <div className="grid grid-cols-3 gap-2">
                              {jobData.completionChecklist.photos.map((url: string, index: number) => (
                                <a key={index} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border border-blue-900/20">
                                  <img src={url} alt={`Completion ${index}`} className="w-full h-full object-cover" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (currentStatusKey !== 'pre_build_complete' && currentStatusKey !== 'returned_to_crew') ? (
                    <p className="text-xs text-slate-500 italic">Please complete and submit the Pre-Build Checklist first before accessing the Completion Checklist.</p>
                  ) : (
                    <form onSubmit={handleSubmitCompletion} className="space-y-4">
                      {checklistError && (
                        <div className="p-4 bg-rose-950/40 text-rose-400 text-xs font-bold rounded-xl border border-rose-900/30">
                          ⚠️ {checklistError}
                        </div>
                      )}
                      {checklistSuccess && (
                        <div className="p-4 bg-emerald-950/40 text-emerald-400 text-xs font-bold rounded-xl border border-emerald-900/30">
                          ✓ Completion Checklist successfully submitted! Pending office final approval.
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase text-[#888888] tracking-wider">Crew Leader Name *</label>
                        <input
                          type="text"
                          required
                          value={crewLeaderName}
                          onChange={(e) => setCrewLeaderName(e.target.value)}
                          placeholder="Enter your name"
                          className="w-full text-xs bg-[#0A1120] text-white border-2 border-blue-900/10 focus:border-blue-900 rounded-xl px-4 py-3 focus:outline-none transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase text-[#888888] tracking-wider">Final completion/workmanship notes (Optional)</label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Describe finalized fence specs, gate checks, clean up..."
                          className="w-full text-xs bg-[#0A1120] text-white border-2 border-blue-900/10 focus:border-blue-900 rounded-xl px-4 py-3 focus:outline-none transition-colors"
                          rows={3}
                        />
                      </div>

                      <label className="flex items-center gap-3 p-3 bg-[#0A1120] border border-blue-900/15 rounded-xl cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={issuesDocumented}
                          onChange={(e) => setIssuesDocumented(e.target.checked)}
                          className="h-4 w-4 text-[#E63946] border-blue-900 rounded focus:ring-0 cursor-pointer bg-[#070D19]"
                        />
                        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wide">
                          Are there any issues, outstanding items, or client feedback?
                        </span>
                      </label>

                      {/* Photo Upload Section */}
                      <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase text-[#888888] tracking-wider">Finalized Workmanship Photos (At least 5 required) *</label>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {uploadedPhotos.map((url, index) => (
                            <div key={index} className="aspect-square bg-[#0A1120] rounded-xl border border-blue-900/15 relative overflow-hidden group">
                              <img src={url} alt={`Upload preview ${index}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => handleRemovePhoto(url)}
                                className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 hover:bg-black text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}

                          <label className="aspect-square bg-[#0A1120] hover:bg-[#111A2E] rounded-xl border-2 border-dashed border-blue-900/10 flex flex-col items-center justify-center cursor-pointer transition-colors relative">
                            {isUploading ? (
                              <Loader2 size={24} className="text-[#E63946] animate-spin" />
                            ) : (
                              <>
                                <Camera size={24} className="text-slate-500 mb-1" />
                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Add Photo</span>
                                <span className="text-[8px] text-slate-500">({uploadedPhotos.length}/5+)</span>
                              </>
                            )}
                            <input
                              type="file"
                              multiple
                              accept="image/*"
                              disabled={isUploading}
                              onChange={handlePhotoUpload}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                          </label>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={submittingChecklist || isUploading || uploadedPhotos.length < 5}
                        className={cn(
                          "w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95",
                          (submittingChecklist || isUploading || uploadedPhotos.length < 5) && "opacity-50 cursor-not-allowed active:scale-100 hover:bg-emerald-600"
                        )}
                      >
                        {submittingChecklist ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Submitting Completion...
                          </>
                        ) : (
                          <>
                            <Check size={16} />
                            Submit Job Completion for Review
                          </>
                        )}
                      </button>
                    </form>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* TAB 5: INCIDENT & SHORTAGE REPORTS */}
          {activeTab === 'reports' && (
            <div className="max-w-xl mx-auto space-y-6">
              <div className="border-b border-blue-900/10 pb-4 text-center">
                <h3 className="text-base font-black uppercase text-white tracking-tight">Report Incident, Delay, or Shortage</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Crews can instantly log construction complications straight to the office</p>
              </div>

              <form onSubmit={handleSubmitReport} className="space-y-4">
                {reportSuccess && (
                  <div className="p-4 bg-emerald-950/40 text-emerald-400 text-xs font-bold rounded-xl border border-emerald-900/30">
                    ✓ Report successfully received by the office. Incident logged in timeline logs.
                  </div>
                )}
                {reportError && (
                  <div className="p-4 bg-rose-950/40 text-rose-400 text-xs font-bold rounded-xl border border-rose-900/30">
                    ⚠️ {reportError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase text-[#888888] tracking-wider font-extrabold">Report Category</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setReportType('issue')}
                      className={cn(
                        "py-3 border text-xs font-black uppercase tracking-wider rounded-xl transition-all",
                        reportType === 'issue' 
                          ? "bg-rose-500/15 text-rose-400 border-rose-500" 
                          : "bg-[#0A1120] text-slate-400 border-blue-900/15 hover:bg-[#111A2E]"
                      )}
                    >
                      Construction Issue
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setReportType('shortage')}
                      className={cn(
                        "py-3 border text-xs font-black uppercase tracking-wider rounded-xl transition-all",
                        reportType === 'shortage' 
                          ? "bg-amber-500/15 text-amber-400 border-amber-500" 
                          : "bg-[#0A1120] text-slate-400 border-blue-900/15 hover:bg-[#111A2E]"
                      )}
                    >
                      Material Shortage
                    </button>

                    <button
                      type="button"
                      onClick={() => setReportType('delay')}
                      className={cn(
                        "py-3 border text-xs font-black uppercase tracking-wider rounded-xl transition-all",
                        reportType === 'delay' 
                          ? "bg-blue-500/15 text-blue-400 border-blue-500" 
                          : "bg-[#0A1120] text-slate-400 border-blue-900/15 hover:bg-[#111A2E]"
                      )}
                    >
                      Rain / Delay
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase text-[#888888] tracking-wider">Report Details / Required Action *</label>
                  <textarea
                    required
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder={
                      reportType === 'issue' 
                        ? 'Describe excavation problems, property lines, underground utilities encountered...'
                        : reportType === 'shortage'
                          ? 'Specify item name, dimensions, deficit volume, and yard urgency...'
                          : 'Provide rainfall/weather detail and expected timeline adjustment...'
                    }
                    className="w-full text-xs bg-[#0A1120] text-white border-2 border-blue-900/10 focus:border-blue-900 rounded-xl px-4 py-3 focus:outline-none transition-colors"
                    rows={4}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingReport || !reportDetails.trim()}
                  className={cn(
                    "w-full py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl hover:scale-105 active:scale-95 transition-all rounded-2xl flex items-center justify-center gap-2",
                    reportType === 'issue' ? "bg-rose-600 hover:bg-rose-700 shadow-rose-950/20" :
                    reportType === 'shortage' ? "bg-amber-600 hover:bg-amber-700 shadow-amber-950/20" :
                    "bg-blue-600 hover:bg-blue-700 shadow-blue-950/20",
                    (submittingReport || !reportDetails.trim()) && "opacity-50 cursor-not-allowed hover:scale-100"
                  )}
                >
                  {submittingReport ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Submitting Report...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      Transmit Report to Office
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* TAB 6: JOB HISTORY TIMELINE */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              <div className="border-b border-blue-900/10 pb-4">
                <h3 className="text-base font-black uppercase text-white tracking-tight">Incident Timeline & Audit History</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Full sequential log of operations, approvals, checklists, and reports</p>
              </div>

              {Array.isArray(jobData.jobPortalHistory) && jobData.jobPortalHistory.length > 0 ? (
                <div className="relative border-l-2 border-blue-900/25 ml-4 pl-6 space-y-6">
                  {jobData.jobPortalHistory.map((log: any, i: number) => (
                    <div key={i} className="relative">
                      {/* Timeline dot */}
                      <span className="absolute -left-[31px] top-1 h-4.5 w-4.5 rounded-full border-4 border-[#070D19] bg-[#E63946] flex items-center justify-center" />
                      
                      <div className="bg-[#0A1120] p-4 rounded-xl border border-blue-900/15 space-y-1.5 max-w-2xl">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <span className="text-xs font-black uppercase text-white tracking-tight">{log.event}</span>
                          <span className="text-[10px] font-mono font-bold text-slate-500">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#E63946] uppercase tracking-wider">
                          <UserIcon size={12} /> {log.user || 'System'}
                        </div>
                        {log.notes && (
                          <p className="text-xs text-slate-300 bg-[#070D19]/65 p-2 rounded-lg border border-blue-900/5 mt-1 font-medium">
                            {log.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 bg-[#0A1120] border-2 border-dashed border-blue-900/10 rounded-2xl text-center text-slate-500">
                  <History className="mx-auto mb-2 text-slate-600" size={32} />
                  <p className="text-xs font-bold uppercase tracking-wider">No job history transactions recorded yet.</p>
                </div>
              )}
            </div>
          )}

        </div>

      </div>

      {/* DRAWING FULL-SCREEN MODAL */}
      <AnimatePresence>
        {zoomDrawing && snapshot.drawingUrl && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-[999] flex items-center justify-center p-4"
          >
            <button 
              onClick={() => setZoomDrawing(false)}
              className="absolute top-4 right-4 h-10 w-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors"
            >
              <X size={20} />
            </button>
            <img 
              src={snapshot.drawingUrl} 
              alt="Site plan zoom view" 
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ADMIN OFFICE MODAL: APPROVE COMPLETION */}
      <AnimatePresence>
        {showApproveModal && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111A2E] border border-blue-900/20 p-6 rounded-3xl max-w-md w-full space-y-4"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-base font-black uppercase text-white">Approve Job Completion</h3>
                <button onClick={() => setShowApproveModal(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
              </div>
              <p className="text-xs text-slate-300">
                Are you sure you want to approve the completion of this job? This will set the installation status to Completed and finalize the payroll.
              </p>
              
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-slate-400">Approval Comments (Optional)</label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Enter notes about final inspection, workmanship comments..."
                  className="w-full bg-[#0A1120] text-xs border border-blue-900/10 focus:border-blue-900 rounded-xl p-3 focus:outline-none"
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={adminSubmitting}
                  onClick={handleAdminApprove}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-[#0c1a30] text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                >
                  {adminSubmitting ? 'Approving...' : 'Yes, Approve Completion'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowApproveModal(false)}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ADMIN OFFICE MODAL: RETURN TO CREW */}
      <AnimatePresence>
        {showReturnModal && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111A2E] border border-blue-900/20 p-6 rounded-3xl max-w-md w-full space-y-4"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-base font-black uppercase text-[#E63946]">Return to Crew for Correction</h3>
                <button onClick={() => setShowReturnModal(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
              </div>
              <p className="text-xs text-slate-300">
                Are you returning this job for corrective actions? The crew will be notified to review requirements and resubmit.
              </p>
              
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-rose-400">Required Correction Details (Required) *</label>
                <textarea
                  required
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Specify outstanding items, gate modifications, or clean up required..."
                  className="w-full bg-[#0A1120] text-xs border border-rose-500/20 focus:border-rose-500 rounded-xl p-3 focus:outline-none"
                  rows={4}
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={adminSubmitting || !adminNotes.trim()}
                  onClick={handleAdminReturn}
                  className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                >
                  {adminSubmitting ? 'Returning...' : 'Confirm Return To Crew'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
