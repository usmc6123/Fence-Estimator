import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar as CalendarIcon, Clock, MapPin, Hammer, AlertTriangle, 
  Check, Loader2, RefreshCw, Eye, ShieldCheck, ChevronLeft, ChevronRight,
  Camera, Plus, Trash2, ClipboardList, Package, Image as ImageIcon,
  Map, MessageSquare, History, CheckCircle2, X, AlertCircle, Play,
  Send, User as UserIcon, AlertOctagon, HelpCircle, ArrowLeft, Lock,
  ExternalLink, FileText
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
  const [selectedDiagram, setSelectedDiagram] = useState<any>(null);

  // Office actions states
  const [adminNotes, setAdminNotes] = useState('');
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);

  // Material Confirmation States
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [activeDocForConfirmation, setActiveDocForConfirmation] = useState<any>(null);
  const [pickupLeaderName, setPickupLeaderName] = useState('');
  const [pickupLocationState, setPickupLocationState] = useState('');
  const [pickupDateTimeState, setPickupDateTimeState] = useState('');
  const [pickupGeneralNotes, setPickupGeneralNotes] = useState('');
  const [pickupGeneralPhotos, setPickupGeneralPhotos] = useState<string[]>([]);
  const [isUploadingPickupPhoto, setIsUploadingPickupPhoto] = useState(false);
  const [uploadingLineItemPhotoId, setUploadingLineItemPhotoId] = useState<string | null>(null);
  const [lineItemStatuses, setLineItemStatuses] = useState<Record<string, { status: string; notes: string; photoUrl?: string }>>({});
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [confirmSuccessMessage, setConfirmSuccessMessage] = useState('');

  // Admin Upload Vendor Doc States
  const [showUploadDocPanel, setShowUploadDocPanel] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newSalesOrderNumber, setNewSalesOrderNumber] = useState('');
  const [newPickupLocation, setNewPickupLocation] = useState('');
  const [newPickupDateTime, setNewPickupDateTime] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newVisibleToCrew, setNewVisibleToCrew] = useState(true);
  const [newDocFilename, setNewDocFilename] = useState('');
  const [newDocBase64, setNewDocBase64] = useState('');
  const [newDocMimeType, setNewDocMimeType] = useState('');
  const [newDocLineItems, setNewDocLineItems] = useState<{ id: string; description: string; qty: number }[]>([]);
  const [newLineItemDesc, setNewLineItemDesc] = useState('');
  const [newLineItemQty, setNewLineItemQty] = useState(1);
  const [isUploadingVendorDoc, setIsUploadingVendorDoc] = useState(false);
  const [uploadDocError, setUploadDocError] = useState('');
  const [uploadDocSuccess, setUploadDocSuccess] = useState('');

  // Office Override Action Modal States
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideDecision, setOverrideDecision] = useState<'approve_anyway' | 'return_to_crew'>('approve_anyway');
  const [overrideNotes, setOverrideNotes] = useState('');
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideError, setOverrideError] = useState('');

  // --- JOB PORTAL INITIAL SCHEDULING STATES & HANDLERS ---
  const [scheduleStartDate, setScheduleStartDate] = useState('');
  const [scheduleDuration, setScheduleDuration] = useState('1 day');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleError, setScheduleError] = useState('');

  const getMinDateString = () => {
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 4);
    return minDate.toISOString().split('T')[0];
  };

  const handleScheduleJobStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleStartDate || !scheduleDuration) {
      setScheduleError('Please fill out all required fields.');
      return;
    }

    const today = new Date();
    today.setHours(0,0,0,0);
    const minDateLimit = new Date(today.getTime() + 4 * 24 * 60 * 60 * 1000);
    minDateLimit.setHours(0,0,0,0);
    const selectedDate = new Date(scheduleStartDate + 'T00:00:00');

    if (selectedDate.getTime() < minDateLimit.getTime()) {
      setScheduleError(`The soonest start date allowed is 4 calendar days from today (${minDateLimit.toISOString().split('T')[0]}).`);
      return;
    }

    setScheduleSubmitting(true);
    setScheduleError('');
    try {
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'schedule-job-start',
          estimateId,
          token,
          startDate: scheduleStartDate,
          duration: scheduleDuration,
          notes: scheduleNotes
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to submit schedule.');
      }

      await fetchJobDetails(estimateId, token);
    } catch (err: any) {
      setScheduleError(err.message || String(err));
    } finally {
      setScheduleSubmitting(false);
    }
  };

  // Helper functions for Materials & Vendor Docs
  const handleVendorDocFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setNewDocFilename(file.name);
    setNewDocMimeType(file.type || 'application/octet-stream');

    const reader = new FileReader();
    reader.onload = () => {
      setNewDocBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAddLineItemToNewDoc = () => {
    if (!newLineItemDesc.trim()) return;
    const newItem = {
      id: crypto.randomUUID(),
      description: newLineItemDesc,
      qty: newLineItemQty
    };
    setNewDocLineItems(prev => [...prev, newItem]);
    setNewLineItemDesc('');
    setNewLineItemQty(1);
  };

  const handleRemoveLineItemFromNewDoc = (id: string) => {
    setNewDocLineItems(prev => prev.filter(item => item.id !== id));
  };

  const handleUpdateLineItemStatus = (itemId: string, status: string) => {
    setLineItemStatuses(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || { status: 'Confirmed', notes: '', photoUrl: '' }),
        status
      }
    }));
  };

  const handleUpdateLineItemField = (itemId: string, field: 'notes' | 'photoUrl', value: string) => {
    setLineItemStatuses(prev => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || { status: 'Confirmed', notes: '', photoUrl: '' }),
        [field]: value
      }
    }));
  };

  const handleRemoveGeneralPhoto = (index: number) => {
    setPickupGeneralPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadVendorDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadDocError('');
    setUploadDocSuccess('');
    setIsUploadingVendorDoc(true);

    try {
      const adminToken = localStorage.getItem('company_admin_token') || localStorage.getItem('token') || '';
      if (!adminToken) {
        throw new Error('Admin login token required. Please log in as an administrator.');
      }

      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          action: 'upload-vendor-document',
          estimateId,
          vendorName: newVendorName,
          salesOrderNumber: newSalesOrderNumber,
          pickupLocation: newPickupLocation,
          pickupDateTime: newPickupDateTime,
          notes: newNotes,
          visibleToCrew: newVisibleToCrew,
          filename: newDocFilename,
          mimeType: newDocMimeType,
          base64Data: newDocBase64,
          lineItems: newDocLineItems
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload vendor document.');
      }

      setUploadDocSuccess('Vendor document successfully uploaded and saved!');
      // Clear fields
      setNewVendorName('');
      setNewSalesOrderNumber('');
      setNewPickupLocation('');
      setNewPickupDateTime('');
      setNewNotes('');
      setNewDocFilename('');
      setNewDocBase64('');
      setNewDocMimeType('');
      setNewDocLineItems([]);
      
      // Refresh estimate data
      fetchJobDetails(estimateId, token);
    } catch (err: any) {
      setUploadDocError(err.message || String(err));
    } finally {
      setIsUploadingVendorDoc(false);
    }
  };

  const handleDeleteVendorDoc = async (documentId: string) => {
    if (!window.confirm('Are you sure you want to delete this vendor pickup document? This is irreversible.')) return;
    
    try {
      const adminToken = localStorage.getItem('company_admin_token') || localStorage.getItem('token') || '';
      if (!adminToken) {
        throw new Error('Admin login token required.');
      }

      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          action: 'delete-vendor-document',
          estimateId,
          documentId
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete vendor document.');
      }

      fetchJobDetails(estimateId, token);
    } catch (err: any) {
      alert(err.message || String(err));
    }
  };

  const handleUploadPickupPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingPickupPhoto(true);
    setConfirmError('');

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (err) => reject(err);
        });
        reader.readAsDataURL(file);
        const base64Data = await base64Promise;

        const res = await fetch('/api/estimates/write', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'upload-job-portal-photo',
            estimateId,
            token,
            filename: `pickup_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
            mimeType: file.type || 'image/jpeg',
            base64Data
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to upload photo');
        }

        if (data.drawingUrl) {
          setPickupGeneralPhotos(prev => [...prev, data.drawingUrl]);
        }
      }
    } catch (err: any) {
      setConfirmError(`Photo upload failed: ${err.message || String(err)}`);
    } finally {
      setIsUploadingPickupPhoto(false);
    }
  };

  const handleUploadLineItemPhoto = async (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLineItemPhotoId(itemId);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (err) => reject(err);
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      const res = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'upload-job-portal-photo',
          estimateId,
          token,
          filename: `item_${itemId}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
          mimeType: file.type || 'image/jpeg',
          base64Data
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload item photo');
      }

      if (data.drawingUrl) {
        setLineItemStatuses(prev => ({
          ...prev,
          [itemId]: {
            ...(prev[itemId] || { status: 'Confirmed', notes: '' }),
            photoUrl: data.drawingUrl
          }
        }));
      }
    } catch (err: any) {
      setConfirmError(`Line item photo upload failed: ${err.message || String(err)}`);
    } finally {
      setUploadingLineItemPhotoId(null);
    }
  };

  const handleSubmitMaterialConfirmation = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmError('');
    setConfirmSuccessMessage('');
    setConfirmSubmitting(true);

    try {
      const lineItems = activeDocForConfirmation?.lineItems || [];
      let hasIssues = false;
      const problemList: string[] = [];

      for (const item of lineItems) {
        const itemState = lineItemStatuses[item.id];
        if (!itemState || !itemState.status) {
          throw new Error(`Please complete the status selection for "${item.description}"`);
        }
        if (itemState.status !== 'Confirmed') {
          hasIssues = true;
          if (!itemState.notes || !itemState.notes.trim()) {
            throw new Error(`Notes are required for item "${item.description}" because it is marked as ${itemState.status}.`);
          }
          if (!itemState.photoUrl) {
            throw new Error(`A photo is required for item "${item.description}" because it is marked as ${itemState.status}.`);
          }
          problemList.push(`${item.description}: ${itemState.status} - Notes: ${itemState.notes}`);
        }
      }

      if (pickupGeneralPhotos.length === 0) {
        throw new Error('At least one general photo of the loaded material or sales order is required to submit.');
      }

      const problemSummary = problemList.join('\n');

      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'submit-material-confirmation',
          estimateId,
          token,
          crewLeaderName: pickupLeaderName,
          pickupLocation: pickupLocationState,
          notes: pickupGeneralNotes,
          photos: pickupGeneralPhotos,
          lineItemsStatus: lineItemStatuses,
          hasIssues,
          problemSummary
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit material confirmation.');
      }

      setConfirmSuccessMessage('Material pickup confirmation submitted successfully!');
      setShowConfirmModal(false);
      
      // Refresh job data
      fetchJobDetails(estimateId, token);
    } catch (err: any) {
      setConfirmError(err.message || String(err));
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const handleOverrideMaterialIssue = async (decision: 'approve_anyway' | 'return_to_crew') => {
    setOverrideError('');
    setOverrideSubmitting(true);

    try {
      const adminToken = localStorage.getItem('company_admin_token') || localStorage.getItem('token') || '';
      if (!adminToken) {
        throw new Error('Admin login token required.');
      }

      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          action: 'override-material-issue',
          estimateId,
          decision,
          adminNotes: overrideNotes
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit override action.');
      }

      setShowOverrideModal(false);
      setOverrideNotes('');
      fetchJobDetails(estimateId, token);
    } catch (err: any) {
      setOverrideError(err.message || String(err));
    } finally {
      setOverrideSubmitting(false);
    }
  };

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
    materials_pending: { label: 'Materials Pending Pickup', color: 'text-amber-500 border-amber-500', bg: 'bg-amber-500/10' },
    materials_confirmed: { label: 'Materials Confirmed Complete', color: 'text-emerald-400 border-emerald-500', bg: 'bg-emerald-500/10' },
    material_issue_reported: { label: 'Material Issue Reported', color: 'text-rose-400 border-rose-500', bg: 'bg-rose-500/10' },
    start_approved_with_material_issue: { label: 'Approved Start (With Material Issue)', color: 'text-emerald-400 border-emerald-500', bg: 'bg-emerald-500/10' },
    schedule_confirmed_72hr: { label: 'Schedule Confirmed (72hr)', color: 'text-emerald-400 border-emerald-500', bg: 'bg-emerald-500/10' },
    schedule_confirmed_24hr: { label: 'Schedule Confirmed (24hr)', color: 'text-emerald-400 border-emerald-500', bg: 'bg-emerald-500/10' },
    schedule_conflict: { label: 'Schedule Conflict', color: 'text-rose-400 border-rose-500', bg: 'bg-rose-500/10' },
    pre_build_complete: { label: 'Pre-Build Complete', color: 'text-amber-400 border-amber-500', bg: 'bg-amber-500/10' },
    in_progress: { label: 'In Progress', color: 'text-blue-400 border-blue-500', bg: 'bg-blue-500/10' },
    completion_submitted: { label: 'Completion Submitted', color: 'text-[#E63946] border-[#E63946]', bg: 'bg-[#E63946]/10' },
    returned_to_crew: { label: 'Returned to Crew', color: 'text-amber-500 border-amber-600', bg: 'bg-amber-600/10' },
    completed: { label: 'Completed', color: 'text-emerald-400 border-emerald-500', bg: 'bg-emerald-500/10' },
    scheduling_required: { label: 'Scheduling Required', color: 'text-rose-400 border-rose-500', bg: 'bg-rose-500/10' },
    start_date_scheduled: { label: 'Start Date Scheduled', color: 'text-blue-400 border-blue-500', bg: 'bg-blue-500/10' }
  };

  const currentStatusKey = jobData.jobPortalStatus || 'dispatched';
  const statusInfo = statusLabels[currentStatusKey] || { label: 'Active Job', color: 'text-blue-400 border-blue-500', bg: 'bg-blue-500/10' };

  // Sequential Workflow Helper Variables
  const isScheduled = !!jobData?.scheduledStartDate;
  const hasVendorDocs = Array.isArray(jobData.vendorDocuments) && jobData.vendorDocuments.length > 0;
  const isMaterialsConfirmed = !hasVendorDocs || (!!jobData.materialConfirmation || currentStatusKey === 'materials_confirmed' || currentStatusKey === 'start_approved_with_material_issue' || currentStatusKey === 'pre_build_complete' || currentStatusKey === 'in_progress' || currentStatusKey === 'completion_submitted' || currentStatusKey === 'completed');
  const isPreBuildComplete = !!jobData.preBuildChecklist || (currentStatusKey === 'pre_build_complete' || currentStatusKey === 'in_progress' || currentStatusKey === 'completion_submitted' || currentStatusKey === 'completed');
  const isCompletionComplete = currentStatusKey === 'completion_submitted' || currentStatusKey === 'completed';
  const isOfficeApproved = currentStatusKey === 'completed';

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

        {/* Sequential Workflow Progress Stepper */}
        <div className="bg-[#111A2E]/60 border border-blue-900/10 p-5 rounded-[24px]">
          <div className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider mb-4 flex items-center justify-between">
            <span>Job Progression Tracker</span>
            <span className="text-[#E63946]">Sequential Workflow Active</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-2">
            
            {/* Step 1: Schedule Start Date */}
            <div className={cn(
              "p-3.5 rounded-xl border flex flex-col justify-between gap-1",
              isScheduled 
                ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-400" 
                : "bg-[#0A1120] border-rose-500/30 text-rose-400 animate-pulse"
            )}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider">1. Schedule Start</span>
                {isScheduled ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              </div>
              <span className="text-xs font-bold">
                {isScheduled ? "Start Date Set" : "Action Required"}
              </span>
            </div>

            {/* Step 2: Material Pickup Confirmation */}
            <div className={cn(
              "relative p-3.5 rounded-xl border flex flex-col justify-between gap-1",
              !isScheduled
                ? "bg-[#0A1120]/40 border-slate-800 text-slate-500 cursor-not-allowed"
                : isMaterialsConfirmed 
                  ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-400" 
                  : currentStatusKey === 'material_issue_reported'
                    ? "bg-rose-950/20 border-rose-500/30 text-rose-400 animate-pulse"
                    : "bg-[#0A1120] border-amber-500/30 text-amber-400"
            )}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider">2. Confirm Materials</span>
                {isMaterialsConfirmed ? <CheckCircle2 size={14} /> : !isScheduled ? <Lock size={12} /> : <AlertTriangle size={14} />}
              </div>
              <span className="text-xs font-bold">
                {isMaterialsConfirmed 
                  ? "Confirmed Complete" 
                  : !isScheduled
                    ? "Locked (Awaiting Step 1)"
                    : currentStatusKey === 'material_issue_reported' 
                      ? "Issue Reported" 
                      : "Action Required"}
              </span>
            </div>

            {/* Step 3: Pre-Build Site Check */}
            <div className={cn(
              "p-3.5 rounded-xl border flex flex-col justify-between gap-1",
              isPreBuildComplete 
                ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-400" 
                : (!isScheduled || !isMaterialsConfirmed) 
                  ? "bg-[#0A1120]/40 border-slate-800 text-slate-500 cursor-not-allowed" 
                  : "bg-[#0A1120] border-amber-500/30 text-amber-400"
            )}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider">3. Pre-Build Site Check</span>
                {isPreBuildComplete ? <CheckCircle2 size={14} /> : (!isScheduled || !isMaterialsConfirmed) ? <Lock size={12} /> : <AlertTriangle size={14} />}
              </div>
              <span className="text-xs font-bold">
                {isPreBuildComplete 
                  ? "Completed" 
                  : (!isScheduled || !isMaterialsConfirmed) 
                    ? "Locked (Awaiting Step 2)" 
                    : "Ready to Submit"}
              </span>
            </div>

            {/* Step 4: Completion Sign-Off */}
            <div className={cn(
              "p-3.5 rounded-xl border flex flex-col justify-between gap-1",
              isCompletionComplete 
                ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-400" 
                : (!isScheduled || !isMaterialsConfirmed || !isPreBuildComplete) 
                  ? "bg-[#0A1120]/40 border-slate-800 text-slate-500 cursor-not-allowed" 
                  : "bg-[#0A1120] border-amber-500/30 text-amber-400"
            )}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider">4. Completion Sign-Off</span>
                {isCompletionComplete ? <CheckCircle2 size={14} /> : (!isScheduled || !isMaterialsConfirmed || !isPreBuildComplete) ? <Lock size={12} /> : <AlertTriangle size={14} />}
              </div>
              <span className="text-xs font-bold">
                {isCompletionComplete 
                  ? "Submitted" 
                  : (!isScheduled || !isMaterialsConfirmed || !isPreBuildComplete) 
                    ? "Locked (Awaiting Step 3)" 
                    : "Ready to Submit"}
              </span>
            </div>

            {/* Step 5: Office Review */}
            <div className={cn(
              "p-3.5 rounded-xl border flex flex-col justify-between gap-1",
              isOfficeApproved 
                ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-400" 
                : currentStatusKey === 'completion_submitted'
                  ? "bg-amber-950/20 border-amber-500/30 text-amber-400"
                  : "bg-[#0A1120]/40 border-slate-800 text-slate-500"
            )}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider">5. Office Review</span>
                {isOfficeApproved ? <CheckCircle2 size={14} /> : currentStatusKey === 'completion_submitted' ? <Clock size={14} /> : <Lock size={12} />}
              </div>
              <span className="text-xs font-bold">
                {isOfficeApproved 
                  ? "Approved & Closed" 
                  : currentStatusKey === 'completion_submitted' 
                    ? "Awaiting Backoffice Review" 
                    : "Locked"}
              </span>
            </div>

          </div>
        </div>

        {isScheduled ? (
          <>
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

              {/* DIAGRAMS / SITE PLANS SECTION */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black uppercase text-white tracking-tight">Diagrams / Site Plans</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Project layouts & sketches</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {/* Primary Drawing */}
                  {snapshot.drawingUrl && (
                    <div className="bg-[#0A1120] p-3 rounded-2xl border border-blue-900/15 text-center relative group">
                      <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-[8px] font-black uppercase tracking-widest text-blue-400 bg-blue-900/20 px-2 py-0.5 rounded">Primary Layout</span>
                      </div>
                      {snapshot.drawingMimeType?.includes('pdf') || snapshot.drawingUrl?.toLowerCase().includes('.pdf') ? (
                        <div className="py-6">
                          <FileText className="mx-auto text-slate-500 mb-2" size={32} />
                          <p className="text-[10px] text-slate-400 mb-3 truncate px-4">{snapshot.drawingFileName || 'layout.pdf'}</p>
                          <a
                            href={snapshot.drawingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase rounded-lg transition-all"
                          >
                            <ExternalLink size={12} /> View PDF
                          </a>
                        </div>
                      ) : (
                        <div className="relative overflow-hidden rounded-xl cursor-pointer" onClick={() => setSelectedDiagram({ fileUrl: snapshot.drawingUrl, title: snapshot.drawingFileName || 'Primary Layout' })}>
                          <img 
                            src={snapshot.drawingUrl} 
                            alt="Layout Drawing" 
                            className="w-full h-40 object-cover group-hover:scale-105 transition-all duration-300 rounded-xl"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-[10px] text-white font-black uppercase bg-[#E63946] px-3 py-1.5 rounded-lg shadow-lg">Click to Zoom</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Additional Diagrams */}
                  {jobData?.diagrams?.filter((d: any) => d.visibleToCrew).map((diag: any) => {
                    const isPdf = diag.fileUrl?.toLowerCase().includes('.pdf');
                    return (
                      <div key={diag.diagramId} className="bg-[#0A1120] p-3 rounded-2xl border border-blue-900/15 text-center relative group">
                        <div className="flex items-center justify-between mb-2 px-1">
                          <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-900/20 px-2 py-0.5 rounded">{diag.type}</span>
                        </div>
                        {isPdf ? (
                          <div className="py-6">
                            <FileText className="mx-auto text-slate-500 mb-2" size={32} />
                            <p className="text-[10px] text-slate-400 mb-3 truncate px-4">{diag.title}</p>
                            <a
                              href={diag.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase rounded-lg transition-all"
                            >
                              <ExternalLink size={12} /> View PDF
                            </a>
                          </div>
                        ) : (
                          <div className="relative overflow-hidden rounded-xl cursor-pointer" onClick={() => setSelectedDiagram(diag)}>
                            <img 
                              src={diag.fileUrl} 
                              alt={diag.title} 
                              className="w-full h-40 object-cover group-hover:scale-105 transition-all duration-300 rounded-xl"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="text-[10px] text-white font-black uppercase bg-[#E63946] px-3 py-1.5 rounded-lg shadow-lg">Click to Zoom</span>
                            </div>
                          </div>
                        )}
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-2">
                          {diag.title}
                        </p>
                      </div>
                    );
                  })}

                  {!snapshot.drawingUrl && (!jobData?.diagrams || jobData.diagrams.filter((d: any) => d.visibleToCrew).length === 0) && (
                    <div className="p-8 bg-[#0A1120] border-2 border-dashed border-blue-900/10 rounded-2xl text-center text-slate-500">
                      <ImageIcon className="mx-auto mb-2 text-slate-600" size={32} />
                      <p className="text-xs font-bold uppercase tracking-wider">No Diagrams Provided</p>
                    </div>
                  )}
                </div>
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
              {/* ----------------- VENDOR SALES ORDERS & MATERIAL PICKUP SECTION ----------------- */}
              <div className="bg-[#111A2E]/50 border border-blue-900/15 rounded-3xl p-6 space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-blue-900/10 pb-4">
                  <div>
                    <h3 className="text-base font-black uppercase text-white tracking-tight flex items-center gap-2">
                      <Package className="text-[#E63946]" size={20} />
                      Material Pickup & Vendor Documents
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                      Manage and confirm material pickup orders from local vendors
                    </p>
                  </div>
                  
                  {user && (
                    <button
                      onClick={() => setShowUploadDocPanel(!showUploadDocPanel)}
                      className="px-4 py-2 bg-[#E63946] hover:bg-[#E63946]/90 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5"
                    >
                      <Plus size={14} />
                      {showUploadDocPanel ? 'Close Upload Form' : 'Upload Vendor SO'}
                    </button>
                  )}
                </div>

                {/* Admin upload form */}
                {user && showUploadDocPanel && (
                  <form onSubmit={handleUploadVendorDoc} className="bg-[#0A1120] border border-blue-900/20 p-5 rounded-2xl space-y-4">
                    <h4 className="text-xs font-black uppercase text-white tracking-wider border-b border-blue-900/15 pb-2">
                      Upload New Vendor Sales Order / Pickup Document
                    </h4>
                    
                    {uploadDocError && (
                      <div className="p-3 bg-rose-950/40 border border-rose-900/30 text-rose-400 text-xs font-bold rounded-xl">
                        ⚠️ {uploadDocError}
                      </div>
                    )}
                    {uploadDocSuccess && (
                      <div className="p-3 bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-xl">
                        ✓ {uploadDocSuccess}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Vendor Name *</label>
                        <input
                          type="text"
                          required
                          value={newVendorName}
                          onChange={(e) => setNewVendorName(e.target.value)}
                          placeholder="e.g. Cedar Supply Depot"
                          className="w-full text-xs bg-[#070D19] text-white border-2 border-blue-900/10 focus:border-blue-900 rounded-xl px-4 py-3 focus:outline-none transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Sales Order / Pickup Ticket Number *</label>
                        <input
                          type="text"
                          required
                          value={newSalesOrderNumber}
                          onChange={(e) => setNewSalesOrderNumber(e.target.value)}
                          placeholder="e.g. SO-98421"
                          className="w-full text-xs bg-[#070D19] text-white border-2 border-blue-900/10 focus:border-blue-900 rounded-xl px-4 py-3 focus:outline-none transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Pickup Location *</label>
                        <input
                          type="text"
                          required
                          value={newPickupLocation}
                          onChange={(e) => setNewPickupLocation(e.target.value)}
                          placeholder="e.g. 104 Main St, Austin TX"
                          className="w-full text-xs bg-[#070D19] text-white border-2 border-blue-900/10 focus:border-blue-900 rounded-xl px-4 py-3 focus:outline-none transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Pickup Date/Time (Optional)</label>
                        <input
                          type="datetime-local"
                          value={newPickupDateTime}
                          onChange={(e) => setNewPickupDateTime(e.target.value)}
                          className="w-full text-xs bg-[#070D19] text-white border-2 border-blue-900/10 focus:border-blue-900 rounded-xl px-4 py-3 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Notes for Crew</label>
                      <textarea
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                        placeholder="e.g. Pick up the premium rails first, check for splitting..."
                        className="w-full text-xs bg-[#070D19] text-white border-2 border-blue-900/10 focus:border-blue-900 rounded-xl px-4 py-3 focus:outline-none transition-colors"
                        rows={2}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Upload Document File (PDF/JPG/PNG/WEBP/DOC/DOCX) *</label>
                        <input
                          type="file"
                          required
                          onChange={handleVendorDocFileChange}
                          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                          className="w-full text-xs text-slate-300 bg-[#070D19] border-2 border-blue-900/10 rounded-xl p-2.5 cursor-pointer"
                        />
                      </div>

                      <label className="flex items-center gap-2 select-none cursor-pointer mt-4">
                        <input
                          type="checkbox"
                          checked={newVisibleToCrew}
                          onChange={(e) => setNewVisibleToCrew(e.target.checked)}
                          className="h-4 w-4 rounded bg-[#070D19] border-blue-900 text-[#E63946] focus:ring-0"
                        />
                        <span className="text-xs font-bold text-slate-200">Visible to Crew in Job Portal</span>
                      </label>
                    </div>

                    {/* Manual line items editor */}
                    <div className="space-y-3 pt-2 border-t border-blue-900/10">
                      <span className="block text-[10px] font-black uppercase text-slate-300 tracking-wider">
                        Document Line Items for Crew Audit (Manual Entry)
                      </span>
                      
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newLineItemDesc}
                          onChange={(e) => setNewLineItemDesc(e.target.value)}
                          placeholder="e.g. Japanese Cedar Pickett 1x6x6"
                          className="flex-1 text-xs bg-[#070D19] text-white border-2 border-blue-900/10 focus:border-blue-900 rounded-xl px-3 py-2 focus:outline-none"
                        />
                        <input
                          type="number"
                          value={newLineItemQty}
                          onChange={(e) => setNewLineItemQty(Number(e.target.value))}
                          placeholder="Qty"
                          className="w-20 text-xs bg-[#070D19] text-white border-2 border-blue-900/10 focus:border-blue-900 rounded-xl px-3 py-2 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleAddLineItemToNewDoc}
                          className="px-4 bg-blue-900 hover:bg-blue-800 text-white font-black text-xs uppercase tracking-wider rounded-xl"
                        >
                          Add Item
                        </button>
                      </div>

                      {newDocLineItems.length > 0 ? (
                        <div className="bg-[#070D19] rounded-xl overflow-hidden border border-blue-900/15">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-blue-950/20 text-[9px] text-slate-400 font-extrabold uppercase tracking-wider border-b border-blue-900/10">
                                <th className="p-2.5">Item Description</th>
                                <th className="p-2.5 w-24">Required Qty</th>
                                <th className="p-2.5 w-16 text-center">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {newDocLineItems.map((item) => (
                                <tr key={item.id} className="border-b border-blue-900/5 text-xs">
                                  <td className="p-2.5 font-bold text-slate-200">{item.description}</td>
                                  <td className="p-2.5 font-mono text-amber-400">{item.qty} pcs</td>
                                  <td className="p-2.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveLineItemFromNewDoc(item.id)}
                                      className="text-rose-500 hover:text-rose-400 p-1"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-500 italic">No line items added yet. Add at least one material line item so the crew can audit it.</p>
                      )}
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isUploadingVendorDoc || !newDocFilename}
                        className={cn(
                          "w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2",
                          (isUploadingVendorDoc || !newDocFilename) && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {isUploadingVendorDoc ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Uploading Document & Saving...
                          </>
                        ) : (
                          <>
                            <Send size={14} />
                            Save & Upload Vendor Document
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}

                {/* Documents List */}
                {Array.isArray(jobData.vendorDocuments) && jobData.vendorDocuments.length > 0 ? (
                  <div className="space-y-4">
                    {jobData.vendorDocuments
                      .filter((d: any) => user || d.visibleToCrew)
                      .map((doc: any) => {
                        const isConfirmed = !!jobData.materialConfirmation || !!doc.confirmation;
                        const confirmationDetails = jobData.materialConfirmation || doc.confirmation;
                        
                        return (
                          <div key={doc.id} className="bg-[#0A1120] border border-blue-900/15 p-5 rounded-2xl space-y-4">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-blue-900/10 pb-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black text-white uppercase">{doc.vendorName}</span>
                                  <span className="text-[10px] font-mono text-slate-400 font-bold uppercase bg-slate-800/60 px-2 py-0.5 rounded">
                                    SO #{doc.salesOrderNumber}
                                  </span>
                                  {user && (
                                    <span className={cn(
                                      "text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border",
                                      doc.visibleToCrew 
                                        ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" 
                                        : "text-slate-500 border-slate-700 bg-slate-800/10"
                                    )}>
                                      {doc.visibleToCrew ? 'Visible to Crew' : 'Hidden from Crew'}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                                  <span><strong>Location:</strong> {doc.pickupLocation}</span>
                                  {doc.pickupDateTime && (
                                    <span><strong>Target Date/Time:</strong> {new Date(doc.pickupDateTime).toLocaleString()}</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <a
                                  href={doc.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 bg-blue-950 hover:bg-blue-900 text-blue-400 font-bold text-xs rounded-lg transition-all flex items-center gap-1 border border-blue-900/30"
                                >
                                  <Eye size={13} /> View Order Document
                                </a>

                                {user && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteVendorDoc(doc.id)}
                                    className="p-1.5 bg-rose-950/20 border border-rose-900/20 hover:bg-rose-950/40 text-rose-400 rounded-lg transition-all"
                                    title="Delete document"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {doc.notes && (
                              <p className="text-xs text-slate-300 italic bg-[#070D19]/60 p-3 rounded-xl border border-blue-900/5">
                                <strong>Office Notes:</strong> {doc.notes}
                              </p>
                            )}

                            {/* Line items checklist */}
                            {Array.isArray(doc.lineItems) && doc.lineItems.length > 0 && (
                              <div className="space-y-2">
                                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
                                  Pickup Item Manifest:
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {doc.lineItems.map((item: any) => {
                                    const itemStatus = confirmationDetails?.lineItemsStatus?.[item.id]?.status || 'Pending';
                                    const itemNotes = confirmationDetails?.lineItemsStatus?.[item.id]?.notes;
                                    const itemPhoto = confirmationDetails?.lineItemsStatus?.[item.id]?.photoUrl;
                                    
                                    return (
                                      <div key={item.id} className="p-3 bg-[#070D19]/40 border border-blue-900/5 rounded-xl flex items-center justify-between gap-4">
                                        <div className="space-y-0.5">
                                          <span className="text-xs font-bold text-slate-300">{item.description}</span>
                                          <span className="text-[10px] font-black text-amber-500 font-mono">Qty: {item.qty}</span>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <span className={cn(
                                            "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded",
                                            itemStatus === 'Confirmed' 
                                              ? "bg-emerald-500/10 text-emerald-400" 
                                              : itemStatus === 'Pending' 
                                                ? "bg-amber-500/10 text-amber-500 animate-pulse" 
                                                : "bg-rose-500/10 text-rose-400"
                                          )}>
                                            {itemStatus}
                                          </span>
                                          {itemNotes && (
                                            <p className="text-[9px] text-slate-400 italic mt-0.5 line-clamp-1 max-w-[120px]" title={itemNotes}>
                                              "{itemNotes}"
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* CONFIRMATION SECTION */}
                            {isConfirmed ? (
                              <div className="bg-emerald-950/20 border border-emerald-500/20 p-4 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-emerald-400">
                                    <CheckCircle2 size={16} />
                                    <span className="text-xs font-black uppercase tracking-wider">Materials Pickup Confirmed</span>
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {confirmationDetails?.confirmedAt ? new Date(confirmationDetails.confirmedAt).toLocaleString() : ''}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
                                  <div className="space-y-1">
                                    <p><strong className="text-slate-400">Confirmed By:</strong> {confirmationDetails?.crewLeaderName}</p>
                                    <p><strong className="text-slate-400">Pickup Location:</strong> {confirmationDetails?.pickupLocation || doc.pickupLocation}</p>
                                    {confirmationDetails?.notes && (
                                      <p><strong className="text-slate-400">Crew Notes:</strong> {confirmationDetails.notes}</p>
                                    )}
                                  </div>

                                  {/* Photos */}
                                  {Array.isArray(confirmationDetails?.photos) && confirmationDetails.photos.length > 0 && (
                                    <div className="space-y-1.5">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Pickup Documentation Photos:</span>
                                      <div className="flex flex-wrap gap-2">
                                        {confirmationDetails.photos.map((url: string, idx: number) => (
                                          <a key={idx} href={url} target="_blank" rel="noreferrer" className="block h-12 w-12 overflow-hidden rounded-lg border border-blue-900/10 hover:border-[#E63946] transition-all">
                                            <img src={url} alt={`Pickup confirmation ${idx}`} className="h-full w-full object-cover" />
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Reported problems summary */}
                                {confirmationDetails?.hasIssues && (
                                  <div className="p-3 bg-rose-950/30 border border-rose-500/20 rounded-lg space-y-1.5 mt-2">
                                    <div className="flex items-center gap-1.5 text-rose-400 text-xs font-bold">
                                      <AlertTriangle size={14} />
                                      <span>Issues Documented during Pickup:</span>
                                    </div>
                                    <p className="text-xs text-slate-300 whitespace-pre-wrap">{confirmationDetails.problemSummary}</p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              /* Crew Action Button */
                              !user && (
                                <div className="bg-[#1D3557]/40 border border-blue-900/20 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                                  <div className="space-y-1">
                                    <span className="text-xs font-black uppercase text-amber-400 flex items-center gap-1.5">
                                      <AlertTriangle size={15} /> Action Required: Check In Order
                                    </span>
                                    <p className="text-[10px] text-slate-400">
                                      Auditing and confirming material statuses is required before starting the project.
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => {
                                      setActiveDocForConfirmation(doc);
                                      setPickupLeaderName(crewLeaderName || '');
                                      setPickupLocationState(doc.pickupLocation || '');
                                      setPickupDateTimeState(doc.pickupDateTime || '');
                                      setPickupGeneralNotes('');
                                      setPickupGeneralPhotos([]);
                                      
                                      // Initialize statuses to 'Confirmed'
                                      const initialStatuses: any = {};
                                      (doc.lineItems || []).forEach((item: any) => {
                                        initialStatuses[item.id] = { status: 'Confirmed', notes: '' };
                                      });
                                      setLineItemStatuses(initialStatuses);
                                      
                                      setConfirmError('');
                                      setConfirmSuccessMessage('');
                                      setShowConfirmModal(true);
                                    }}
                                    className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-[#0c1a30] font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shrink-0 flex items-center gap-1.5"
                                  >
                                    <ClipboardList size={14} />
                                    Check In & Confirm Materials
                                  </button>
                                </div>
                              )
                            )}

                            {/* OFFICE OVERRIDE AREA FOR ADMIN */}
                            {user && isConfirmed && confirmationDetails?.hasIssues && currentStatusKey === 'material_issue_reported' && (
                              <div className="bg-amber-950/30 border border-amber-500/30 p-4 rounded-xl space-y-3 mt-4">
                                <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                                  <ShieldCheck size={16} />
                                  <span>Office Action Required: Material Issue Override Panel</span>
                                </div>
                                <p className="text-[10px] text-slate-300">
                                  The crew reported a material issue. You can override and authorize them to start anyway, or issue instructions to return the order or resolve vendor errors.
                                </p>
                                
                                <div className="space-y-3 pt-2">
                                  <div className="space-y-1">
                                    <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Override Action Decision *</label>
                                    <div className="flex gap-4">
                                      <label className="flex items-center gap-2 select-none cursor-pointer">
                                        <input
                                          type="radio"
                                          name="overrideDecision"
                                          checked={overrideDecision === 'approve_anyway'}
                                          onChange={() => setOverrideDecision('approve_anyway')}
                                          className="h-4 w-4 bg-[#070D19] border-blue-900 text-[#E63946] focus:ring-0"
                                        />
                                        <span className="text-xs font-bold text-slate-200">Approve Start Anyway (Unlocks Pre-Build)</span>
                                      </label>
                                      <label className="flex items-center gap-2 select-none cursor-pointer">
                                        <input
                                          type="radio"
                                          name="overrideDecision"
                                          checked={overrideDecision === 'return_to_crew'}
                                          onChange={() => setOverrideDecision('return_to_crew')}
                                          className="h-4 w-4 bg-[#070D19] border-blue-900 text-[#E63946] focus:ring-0"
                                        />
                                        <span className="text-xs font-bold text-slate-200">Return to Crew / Vendor (Resolve Issues First)</span>
                                      </label>
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Resolution Instructions / Admin Notes *</label>
                                    <textarea
                                      required
                                      value={overrideNotes}
                                      onChange={(e) => setOverrideNotes(e.target.value)}
                                      placeholder="e.g. Approved start. Local supplier delivering substitutions by 2 PM..."
                                      className="w-full text-xs bg-[#070D19] text-white border border-blue-900/30 focus:border-blue-900 rounded-xl px-3 py-2 focus:outline-none"
                                      rows={2}
                                    />
                                  </div>

                                  {overrideError && (
                                    <p className="text-xs text-rose-400 font-bold">⚠️ {overrideError}</p>
                                  )}

                                  <button
                                    type="button"
                                    disabled={overrideSubmitting || !overrideNotes.trim()}
                                    onClick={() => handleOverrideMaterialIssue(overrideDecision)}
                                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-[#0c1a30] font-black text-[10px] uppercase tracking-wider rounded-lg transition-all"
                                  >
                                    {overrideSubmitting ? 'Submitting Override...' : 'Submit Resolution Action'}
                                  </button>
                                </div>
                              </div>
                            )}

                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="p-8 bg-[#0A1120] border-2 border-dashed border-blue-900/10 rounded-2xl text-center text-slate-500">
                    <Package className="mx-auto mb-2 text-slate-600" size={32} />
                    <p className="text-xs font-bold uppercase tracking-wider">No vendor sales orders or material pickup documents attached to this job.</p>
                  </div>
                )}
              </div>

              {/* ----------------- BILL OF MATERIALS CHECKLIST ----------------- */}
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

                  {!isMaterialsConfirmed ? (
                    <div className="bg-[#0A1120]/40 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
                      <div className="h-10 w-10 bg-amber-950/20 text-amber-500 rounded-full flex items-center justify-center mx-auto">
                        <Lock size={18} />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-black uppercase text-slate-200">Pre-Build Checklist Locked</h4>
                        <p className="text-[10px] text-slate-400">
                          This checklist is locked until **Step 1: Material Pickup Confirmation** is completed. Please go to the **Material Checklist** tab to confirm pickup.
                        </p>
                      </div>
                    </div>
                  ) : jobData.preBuildChecklist ? (
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
                  ) : !isPreBuildComplete ? (
                    <div className="bg-[#0A1120]/40 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
                      <div className="h-10 w-10 bg-amber-950/20 text-amber-500 rounded-full flex items-center justify-center mx-auto">
                        <Lock size={18} />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-xs font-black uppercase text-slate-200">Completion Checklist Locked</h4>
                        <p className="text-[10px] text-slate-400">
                          This checklist is locked until **Step 2: Pre-Build Site Check** is completed. Please complete and submit the **Pre-Build Checklist** first.
                        </p>
                      </div>
                    </div>
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

          </>
        ) : (
          <div className="bg-[#111A2E] rounded-3xl p-6 sm:p-8 border border-blue-900/15 shadow-xl space-y-6">
            <div className="border-b border-blue-900/10 pb-4">
              <h2 className="text-xl font-black uppercase text-white tracking-tight flex items-center gap-2">
                <CalendarIcon className="text-[#E63946]" size={24} />
                Schedule Job Start
              </h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
                You must schedule the job start date before you can access the rest of the portal.
              </p>
            </div>

            {/* Warning Message Box */}
            <div className="p-4 bg-rose-950/20 border-2 border-rose-500/30 text-rose-300 rounded-2xl flex items-center gap-3">
              <AlertCircle className="text-rose-400 shrink-0 animate-bounce" size={20} />
              <p className="text-xs font-black uppercase tracking-wider">
                Please schedule the job start date to begin the sequential workflow.
              </p>
            </div>

            {/* Job Details Card */}
            <div className="bg-[#0A1120] p-6 rounded-2xl border border-blue-900/10 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-bold text-slate-300">
              <div>
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Customer Name</span>
                <span className="text-sm font-black text-slate-200 mt-0.5 block">{snapshot.customerName || jobData.customerName || 'N/A'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Jobsite Address</span>
                <span className="text-sm font-black text-slate-200 mt-0.5 block">{snapshot.jobAddress || jobData.customerAddress || jobData.address || 'N/A'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Fence Type / Wood</span>
                <span className="text-sm font-black text-slate-200 mt-0.5 block">{snapshot.fenceMaterial || jobData.fenceMaterial || jobData.woodType || 'N/A'}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Linear Feet</span>
                <span className="text-sm font-black text-slate-200 mt-0.5 block">{snapshot.linearFeet || jobData.linearFeet || '0'} LF</span>
              </div>
              <div className="md:col-span-2">
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Assigned Crew Name</span>
                <span className="text-sm font-black text-slate-200 mt-0.5 block">{snapshot.crewName || jobData.assignedCrew || 'Scheduled Crew'}</span>
              </div>
            </div>

            {/* Schedule Form */}
            <form onSubmit={handleScheduleJobStart} className="space-y-4">
              {scheduleError && (
                <div className="p-4 bg-rose-950/30 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-bold">
                  {scheduleError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Proposed Start Date</label>
                  <input
                    type="date"
                    min={getMinDateString()}
                    value={scheduleStartDate}
                    onChange={(e) => setScheduleStartDate(e.target.value)}
                    className="w-full bg-[#0A1120] border border-blue-900/30 rounded-xl px-4 py-3 text-sm text-white font-mono font-bold focus:outline-none focus:ring-1 focus:ring-[#E63946]"
                    required
                  />
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide mt-1">
                    Earliest allowed: {new Date(new Date().getTime() + 4 * 24 * 60 * 60 * 1000).toLocaleDateString()} (4 calendar days from today)
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Estimated Duration</label>
                  <select
                    value={scheduleDuration}
                    onChange={(e) => setScheduleDuration(e.target.value)}
                    className="w-full bg-[#0A1120] border border-blue-900/30 rounded-xl px-4 py-3 text-sm text-white font-bold focus:outline-none focus:ring-1 focus:ring-[#E63946]"
                    required
                  >
                    <option value="1 day">1 day</option>
                    <option value="2 days">2 days</option>
                    <option value="3 days">3 days</option>
                    <option value="4 days">4 days</option>
                    <option value="5+ days">5+ days</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Crew Schedule Notes</label>
                <textarea
                  placeholder="Include any schedule details, planned daily goals, or coordination notes for the office..."
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  className="w-full bg-[#0A1120] border border-blue-900/30 rounded-xl p-4 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#E63946]"
                  rows={3}
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={scheduleSubmitting}
                  className="px-6 py-3 bg-[#E63946] hover:bg-[#E63946]/90 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-[#E63946]/20 disabled:opacity-50"
                >
                  {scheduleSubmitting ? 'Scheduling...' : 'Schedule Job Start & Continue'}
                </button>
              </div>
            </form>
          </div>
        )}

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

      {/* GENERIC DIAGRAM FULL-SCREEN MODAL */}
      <AnimatePresence>
        {selectedDiagram && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-[999] flex flex-col items-center justify-center p-4"
          >
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent">
              <h3 className="text-sm font-black text-white uppercase tracking-widest">{selectedDiagram.title}</h3>
              <button 
                onClick={() => setSelectedDiagram(null)}
                className="h-10 w-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <img 
              src={selectedDiagram.fileUrl} 
              alt={selectedDiagram.title} 
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
            <div className="mt-6 flex gap-4">
               <a 
                href={selectedDiagram.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-xl"
               >
                 <ExternalLink size={14} /> Open Full View
               </a>
            </div>
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

      {/* CREW WORKFLOW: MATERIAL PICKUP CONFIRMATION MODAL */}
      <AnimatePresence>
        {showConfirmModal && activeDocForConfirmation && (
          <div className="fixed inset-0 bg-black/95 z-[120] flex items-center justify-center overflow-y-auto p-4 md:p-8">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#111A2E] border border-blue-900/35 rounded-3xl max-w-3xl w-full my-auto overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Modal Header */}
              <div className="bg-[#1D3557] p-5 border-b border-blue-900/20 flex justify-between items-center shrink-0">
                <div className="space-y-1">
                  <h3 className="text-base font-black uppercase text-white tracking-tight flex items-center gap-2">
                    <ClipboardList className="text-[#E63946]" size={20} />
                    Material Audit & Check-In Confirmation
                  </h3>
                  <p className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">
                    Vendor: {activeDocForConfirmation.vendorName} | Order: #{activeDocForConfirmation.salesOrderNumber}
                  </p>
                </div>
                <button 
                  onClick={() => setShowConfirmModal(false)} 
                  className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800/40 hover:bg-slate-800 transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Modal Content */}
              <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh] scrollbar-thin">
                
                {confirmError && (
                  <div className="p-4 bg-rose-950/40 border border-rose-900/30 text-rose-400 text-xs font-bold rounded-xl">
                    ⚠️ {confirmError}
                  </div>
                )}
                {confirmSuccessMessage && (
                  <div className="p-4 bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-xl">
                    ✓ {confirmSuccessMessage}
                  </div>
                )}

                {/* Audit metadata */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Crew Leader Name *</label>
                    <input
                      type="text"
                      required
                      value={pickupLeaderName}
                      onChange={(e) => setPickupLeaderName(e.target.value)}
                      placeholder="Your Full Name"
                      className="w-full text-xs bg-[#070D19] text-white border-2 border-blue-900/10 focus:border-blue-900 rounded-xl px-3 py-2.5 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Pickup Location *</label>
                    <input
                      type="text"
                      required
                      value={pickupLocationState}
                      onChange={(e) => setPickupLocationState(e.target.value)}
                      placeholder="Vendor yard address"
                      className="w-full text-xs bg-[#070D19] text-white border-2 border-blue-900/10 focus:border-blue-900 rounded-xl px-3 py-2.5 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Actual Pickup Date/Time *</label>
                    <input
                      type="datetime-local"
                      required
                      value={pickupDateTimeState}
                      onChange={(e) => setPickupDateTimeState(e.target.value)}
                      className="w-full text-xs bg-[#070D19] text-white border-2 border-blue-900/10 focus:border-blue-900 rounded-xl px-3 py-2.5 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Manifest Line Items Verification table */}
                <div className="space-y-3">
                  <span className="block text-xs font-black uppercase text-slate-300 tracking-wider">
                    Line Item Quality & Quantity Audit
                  </span>
                  
                  {Array.isArray(activeDocForConfirmation.lineItems) && activeDocForConfirmation.lineItems.length > 0 ? (
                    <div className="space-y-4">
                      {activeDocForConfirmation.lineItems.map((item: any) => {
                        const statusObj = lineItemStatuses[item.id] || { status: 'Confirmed', notes: '', photoUrl: '' };
                        
                        return (
                          <div key={item.id} className="p-4 bg-[#070D19] border border-blue-900/10 rounded-2xl space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-900/5 pb-2">
                              <div>
                                <span className="text-xs font-black text-slate-100 uppercase">{item.description}</span>
                                <span className="text-[10px] font-mono text-amber-500 font-bold block">Required Quantity: {item.qty} pcs</span>
                              </div>
                              
                              <div className="flex flex-wrap gap-1">
                                {['Confirmed', 'Short', 'Damaged', 'Substituted', 'Not Received'].map((st) => (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => handleUpdateLineItemStatus(item.id, st)}
                                    className={cn(
                                      "px-2 py-1 text-[9px] font-black uppercase tracking-wider rounded border transition-all",
                                      statusObj.status === st
                                        ? st === 'Confirmed'
                                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                          : st === 'Short' || st === 'Substituted'
                                            ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                            : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                                        : "bg-[#0c1322] text-slate-400 border-slate-800 hover:text-slate-300"
                                    )}
                                  >
                                    {st === 'Confirmed' ? '✓ ' : ''}{st}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Additional inputs if NOT Confirmed */}
                            {statusObj.status !== 'Confirmed' && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 animate-fadeIn">
                                <div className="space-y-1">
                                  <label className="block text-[8px] font-black uppercase text-[#E63946] tracking-wider">
                                    Describe the {statusObj.status} issue *
                                  </label>
                                  <textarea
                                    required
                                    value={statusObj.notes || ''}
                                    onChange={(e) => handleUpdateLineItemField(item.id, 'notes', e.target.value)}
                                    placeholder={`Explain why this is ${statusObj.status.toLowerCase()}...`}
                                    className="w-full text-xs bg-[#0c1322] text-white border border-rose-500/20 focus:border-rose-500 rounded-xl px-3 py-2 focus:outline-none"
                                    rows={2}
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="block text-[8px] font-black uppercase text-[#E63946] tracking-wider">
                                    Upload Photo of {statusObj.status} Issue *
                                  </label>
                                  
                                  <div className="flex items-center gap-3">
                                    <label className="flex-1 flex flex-col items-center justify-center aspect-[4/1] border border-dashed border-rose-500/20 hover:border-rose-500 rounded-xl bg-[#0c1322] cursor-pointer text-slate-400 hover:text-white transition-all relative overflow-hidden">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleUploadLineItemPhoto(item.id, e)}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                      />
                                      {uploadingLineItemPhotoId === item.id ? (
                                        <div className="flex items-center gap-1 text-[9px] font-bold text-rose-400">
                                          <Loader2 size={12} className="animate-spin" /> Uploading...
                                        </div>
                                      ) : statusObj.photoUrl ? (
                                        <span className="text-[9px] font-bold text-emerald-400">✓ Photo Uploaded (Click to change)</span>
                                      ) : (
                                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider">
                                          <Camera size={12} /> Upload Photo
                                        </div>
                                      )}
                                    </label>
                                    
                                    {statusObj.photoUrl && (
                                      <a href={statusObj.photoUrl} target="_blank" rel="noopener noreferrer" className="h-10 w-10 shrink-0 border border-emerald-500/20 rounded-xl overflow-hidden block">
                                        <img src={statusObj.photoUrl} alt="issue" className="h-full w-full object-cover" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No checklist items defined for this sales order.</p>
                  )}
                </div>

                {/* General Pickup Documentation Photos */}
                <div className="space-y-3 pt-2 border-t border-blue-900/10">
                  <span className="block text-xs font-black uppercase text-slate-300 tracking-wider">
                    General Loaded Material or Sales Order Photos * (Min 1 photo required)
                  </span>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-blue-900/20 hover:border-[#E63946] rounded-2xl bg-[#070D19]/40 cursor-pointer text-slate-400 hover:text-white transition-all relative overflow-hidden">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleUploadPickupPhoto}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      {isUploadingPickupPhoto ? (
                        <div className="text-center space-y-1">
                          <Loader2 size={18} className="animate-spin mx-auto text-[#E63946]" />
                          <span className="text-[9px] font-bold text-slate-500">Uploading...</span>
                        </div>
                      ) : (
                        <div className="text-center space-y-1">
                          <Camera size={18} className="mx-auto" />
                          <span className="text-[9px] font-black uppercase tracking-wider block">Add Photo</span>
                        </div>
                      )}
                    </label>

                    {pickupGeneralPhotos.map((url, index) => (
                      <div key={index} className="aspect-square rounded-2xl overflow-hidden border border-blue-900/10 relative group bg-[#070D19]">
                        <img src={url} alt={`General pickup ${index}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveGeneralPhoto(index)}
                          className="absolute top-1.5 right-1.5 bg-black/70 hover:bg-rose-600 text-white p-1 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* General notes */}
                <div className="space-y-1.5">
                  <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">General Check-In Notes / Comments (Optional)</label>
                  <textarea
                    value={pickupGeneralNotes}
                    onChange={(e) => setPickupGeneralNotes(e.target.value)}
                    placeholder="Add notes about loaded items, vendor service, or substitution approvals..."
                    className="w-full text-xs bg-[#070D19] text-white border border-blue-900/10 focus:border-blue-900 rounded-xl p-3 focus:outline-none"
                    rows={2}
                  />
                </div>

              </div>

              {/* Submit Area Footer */}
              <div className="bg-[#111A2E] border-t border-blue-900/15 p-5 flex items-center justify-between gap-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                >
                  Close & Cancel
                </button>

                <button
                  type="button"
                  disabled={confirmSubmitting || isUploadingPickupPhoto || !pickupLeaderName.trim() || pickupGeneralPhotos.length < 1}
                  onClick={handleSubmitMaterialConfirmation}
                  className={cn(
                    "px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-xl flex items-center gap-1.5",
                    (confirmSubmitting || isUploadingPickupPhoto || !pickupLeaderName.trim() || pickupGeneralPhotos.length < 1) && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {confirmSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Submitting Audit...
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      Verify & Submit Material Confirmation
                    </>
                  )}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
