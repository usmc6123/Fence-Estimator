import React, { useState } from 'react';
import { Printer, FileText, Hammer, Shield, ExternalLink, Sparkles, Loader2, Download, CheckCircle2, Image, Send, Calendar, Clock } from 'lucide-react';
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Employee } from '../types';
import { Estimate, MaterialItem, LaborRates, SupplierQuote } from '../types';
import { calculateDetailedTakeOff, DetailedTakeOff } from '../lib/calculations';
import { cn, formatCurrency } from '../lib/utils';
import { COMPANY_INFO } from '../constants';
import { generateAIScope } from '../services/geminiService';

interface LaborTakeOffProps {
  estimate: Partial<Estimate>;
  materials: MaterialItem[];
  laborRates: LaborRates;
  quotes: SupplierQuote[];
  aiProjectScope: string | null;
  setAiProjectScope: (scope: string | null) => void;
  onUpdateEstimate?: (update: Partial<Estimate>) => void;
}

export default function LaborTakeOff({ 
  estimate, 
  materials, 
  laborRates, 
  quotes,
  aiProjectScope,
  setAiProjectScope,
  onUpdateEstimate
}: LaborTakeOffProps) {
  const data: DetailedTakeOff = calculateDetailedTakeOff(estimate, materials, laborRates);
  const [isGenerating, setIsGenerating] = useState(false);
  const [localAiScope, setLocalAiScope] = useState<string>(estimate.laborScope || aiProjectScope || '');
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);

  // --- STATE FOR SCHEDULE & CRM SYNC ---
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [adminStartDate, setAdminStartDate] = useState(estimate.scheduledStartDate || '');
  const [adminDuration, setAdminDuration] = useState(estimate.scheduledDuration || '1 day');
  const [adminCrew, setAdminCrew] = useState(estimate.assignedCrew || '');
  const [adminScheduleNotes, setAdminScheduleNotes] = useState(estimate.scheduledNotes || '');
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState('');
  const [scheduleError, setScheduleError] = useState('');

  const handleAdminUpdateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminStartDate || !adminDuration || !adminCrew) {
      setScheduleError('Please fill out all required fields.');
      return;
    }

    setScheduleSubmitting(true);
    setScheduleError('');
    setScheduleSuccess('');

    try {
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'admin-update-schedule',
          estimateId: estimate.id,
          startDate: adminStartDate,
          duration: adminDuration,
          assignedCrew: adminCrew,
          notes: adminScheduleNotes
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to update schedule.');
      }

      setScheduleSuccess('Schedule updated and successfully synced with GHL Calendar!');
      setIsEditingSchedule(false);
      
      if (onUpdateEstimate) {
        onUpdateEstimate({
          scheduledStartDate: adminStartDate,
          scheduledDuration: adminDuration,
          assignedCrew: adminCrew,
          scheduledNotes: adminScheduleNotes,
          ghlCalendarSyncStatus: resData.ghlCalendarSyncStatus,
          ghlCalendarSyncError: resData.ghlCalendarSyncError,
          ghlCalendarEventId: resData.ghlCalendarEventId || estimate.ghlCalendarEventId,
          ghlCalendarLastSyncedAt: new Date().toISOString()
        });
      }
    } catch (err: any) {
      setScheduleError(err.message || String(err));
    } finally {
      setScheduleSubmitting(false);
    }
  };

  const handleResyncGhlCalendar = async () => {
    setScheduleSubmitting(true);
    setScheduleError('');
    setScheduleSuccess('');

    try {
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'resync-ghl-calendar',
          estimateId: estimate.id
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to perform calendar re-sync.');
      }

      if (resData.success) {
        setScheduleSuccess('Manual GHL Calendar re-sync completed successfully!');
      } else {
        throw new Error(resData.ghlCalendarSyncError || 'Sync failed.');
      }

      if (onUpdateEstimate) {
        onUpdateEstimate({
          ghlCalendarSyncStatus: resData.ghlCalendarSyncStatus,
          ghlCalendarSyncError: resData.ghlCalendarSyncError,
          ghlCalendarLastSyncedAt: new Date().toISOString()
        });
      }
    } catch (err: any) {
      setScheduleError(err.message || String(err));
    } finally {
      setScheduleSubmitting(false);
    }
  };

  // --- STATE FOR EMAIL LABOR CONTRACT ---
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState('custom');
  const [manualRecipientEmail, setManualRecipientEmail] = useState('');
  const [crewName, setCrewName] = useState('');
  
  const getDefaultMessage = (name: string) => {
    const address = estimate.customerAddress || 'Job Site';
    return `Hi ${name || 'Crew'},\n\nAttached below is the labor contract/work order for the project at ${address}.\n\nPlease review the scope, labor breakdown, project details, measurements, gates, demo/removal, and any drawing/site plan references before starting work.\n\nUse the scheduling link below to schedule or reschedule the installation date for this job.\n\nReply to this email if you have any questions.\n\nThank you,\nLone Star Fence Works`;
  };

  const [emailSubject, setEmailSubject] = useState(`Labor Contract / Work Order - ${estimate.customerName || 'Customer'} - ${estimate.customerAddress || 'Job Site'}`);
  const [emailMessage, setEmailMessage] = useState(getDefaultMessage(''));
  const [includeDrawing, setIncludeDrawing] = useState(!!estimate.drawingUrl);
  const [allowCrewDirectSchedule, setAllowCrewDirectSchedule] = useState(true);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendSuccessInfo, setSendSuccessInfo] = useState<{
    messageId?: string;
    accepted?: string[];
    rejected?: string[];
    response?: string;
    htmlLength?: number;
    textLength?: number;
    spamSafeVersion?: boolean;
    debugBuild?: string;
  } | null>(null);

  React.useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const adminToken = localStorage.getItem('company_admin_token') || '';
        const response = await fetch('/api/admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`,
            'X-Admin-Token': adminToken
          },
          body: JSON.stringify({ action: 'list-crew-recipients' })
        });
        const resData = await response.json();
        if (response.ok && resData.success && Array.isArray(resData.employees)) {
          const list = resData.employees;
          setEmployees(list);
          if (list.length > 0) {
            setSelectedRecipient(list[0].email);
            const name = list[0].name || list[0].email.split('@')[0];
            setCrewName(name);
            setEmailMessage(getDefaultMessage(name));
          } else {
            setSelectedRecipient('custom');
          }
        } else {
          console.warn("Failed to load employees via api/admin:", resData.error);
        }
      } catch (err) {
        console.warn("Failed to load employees for dropdown:", err);
      }
    };
    if (showEmailModal) {
      fetchEmployees();
      setSendSuccess(false);
      setSendSuccessInfo(null);
      setSendError('');
      setIncludeDrawing(!!estimate.drawingUrl);
      setEmailSubject(`Labor Contract / Work Order - ${estimate.customerName || 'Customer'} - ${estimate.customerAddress || 'Job Site'}`);
    }
  }, [showEmailModal, estimate.id, estimate.customerAddress, estimate.drawingUrl]);

  const handleSendLaborContract = async () => {
    setIsSendingEmail(true);
    setSendError('');
    try {
      const recipient = selectedRecipient === 'custom' ? manualRecipientEmail : selectedRecipient;
      if (!recipient) {
        throw new Error("Recipient email address is required.");
      }

      // Pre-build exact snapshot of the labor breakdown display data as requested
      const laborContractSnapshot = {
        customerName: estimate.customerName || 'Valued Client',
        jobAddress: estimate.customerAddress || 'N/A',
        fenceType: (data.runs[0]?.styleName) || 'Fence',
        height: estimate.height || data.runs[0]?.height || 6,
        linearFeet: estimate.linearFeet || data.runs.reduce((sum, r) => sum + r.linearFeet, 0) || 0,
        totalDirectLaborPayout: totalLaborRaw,
        laborRuns: data.runs.map(run => ({
          runId: run.runId,
          runName: run.runName,
          linearFeet: run.linearFeet,
          styleName: run.styleName,
          styleType: run.styleType,
          height: run.height,
          railCount: run.railCount,
          hasRotBoard: run.hasRotBoard,
          topStyle: run.topStyle,
          hasTopCap: run.hasTopCap,
          hasTrim: run.hasTrim,
          picketStyle: run.picketStyle,
          woodType: run.woodType,
          items: run.items.filter(i => i.category === 'Labor' || i.category === 'Demolition').map(item => ({
            name: item.name,
            qty: item.qty,
            unit: item.unit,
            unitCost: item.unitCost,
            total: item.total,
          })),
          gates: (run.gates || []).map(gate => ({
            width: gate.width,
            type: gate.type,
            construction: gate.construction,
            items: (gate.items || []).filter(gi => gi.category === 'Labor').map(gitem => ({
              name: gitem.name,
              qty: gitem.qty,
              unit: gitem.unit,
              unitCost: gitem.unitCost,
              total: gitem.total,
            }))
          }))
        })),
        aggregateLaborManifest: laborSummary.map(item => ({
          name: item.name,
          qty: item.qty,
          unit: item.unit,
          total: item.total,
        })),
        drawingUrl: estimate.drawingUrl || null,
        drawingFileName: estimate.drawingFileName || null,
        drawingMimeType: estimate.drawingMimeType || null,
        scopeOfWorkHtmlOrText: localAiScope || "Standard installation procedures apply.",
      };

      const token = localStorage.getItem('company_admin_token');
      const response = await fetch(`/api/estimates/write`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'send-labor-contract',
          estimateId: estimate.id,
          recipientEmail: recipient,
          crewName,
          subject: emailSubject,
          message: emailMessage,
          includeDrawing,
          allowCrewDirectSchedule,
          laborContractSnapshot
        })
      });

      const resData = await response.json();
      const isAccepted = Array.isArray(resData.accepted) && resData.accepted.some((email: string) => email.toLowerCase() === recipient.toLowerCase());

      if (!response.ok || !resData.success || !isAccepted) {
        let errDesc = resData.error || "Failed to send labor contract email.";
        if (resData.success && !isAccepted) {
          errDesc = `The recipient email address (${recipient}) was not accepted by the SMTP mail server.`;
        }
        if (resData.details) {
          errDesc += ` Details: ${resData.details}`;
        }
        if (resData.code) {
          errDesc += ` (Error Code: ${resData.code})`;
        }
        if (resData.response) {
          errDesc += ` [Server Response: ${resData.response}]`;
        }
        throw new Error(errDesc);
      }

      setSendSuccess(true);
      setSendSuccessInfo({
        messageId: resData.messageId,
        accepted: resData.accepted,
        rejected: resData.rejected,
        response: resData.response,
        htmlLength: resData.htmlLength,
        textLength: resData.textLength,
        spamSafeVersion: resData.spamSafeVersion
      });
      
      if (onUpdateEstimate) {
        onUpdateEstimate({
          laborContractEmailSent: true,
          laborContractEmailRecipient: recipient,
          laborContractEmailSentAt: new Date().toISOString()
        });
      }

    } catch (err: any) {
      setSendError(err?.message || String(err));
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleSendMinimalTest = async () => {
    setIsSendingEmail(true);
    setSendError('');
    try {
      const recipient = selectedRecipient === 'custom' ? manualRecipientEmail : selectedRecipient;
      if (!recipient) {
        throw new Error("Recipient email address is required.");
      }

      const token = localStorage.getItem('company_admin_token');
      const response = await fetch(`/api/estimates/write`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'send-labor-via-estimate-mailer-test',
          estimateId: estimate.id,
          recipientEmail: recipient,
          crewName
        })
      });

      const resData = await response.json();
      const isAccepted = Array.isArray(resData.accepted) && resData.accepted.some((email: string) => email.toLowerCase() === recipient.toLowerCase());

      if (!response.ok || !resData.success || !isAccepted) {
        let errDesc = resData.error || "Failed to send minimal test email.";
        if (resData.success && !isAccepted) {
          errDesc = `The recipient email address (${recipient}) was not accepted by the SMTP mail server.`;
        }
        if (resData.details) {
          errDesc += ` Details: ${resData.details}`;
        }
        throw new Error(errDesc);
      }

      setSendSuccess(true);
      setSendSuccessInfo({
        messageId: resData.messageId,
        accepted: resData.accepted,
        rejected: resData.rejected,
        response: resData.response,
        spamSafeVersion: true,
        debugBuild: resData.debugBuild
      });

    } catch (err: any) {
      setSendError(err?.message || String(err));
    } finally {
      setIsSendingEmail(false);
    }
  };
  
  // Update local scope when external scope changes (e.g. from generation or tab sync)
  React.useEffect(() => {
    if (aiProjectScope) {
      setLocalAiScope(aiProjectScope);
    }
  }, [aiProjectScope]);

  React.useEffect(() => {
    if (estimate.laborScope && !aiProjectScope && !localAiScope) {
       setLocalAiScope(estimate.laborScope);
       setAiProjectScope(estimate.laborScope);
    }
  }, [estimate.laborScope]);

  // Filter for ONLY labor items for the internal manifest (calculated + manual)
  const laborSummary = [
    ...data.summary.filter(item => item.category === 'Labor' || item.category === 'Demolition'),
    ...data.manualSummary.filter(item => item.category === 'Labor' || item.category === 'Demolition')
  ];
  const totalLaborRaw = laborSummary.reduce((sum, item) => sum + item.total, 0);

  const handleScopeChange = (val: string) => {
    setLocalAiScope(val);
    if (onUpdateEstimate) {
      onUpdateEstimate({ laborScope: val });
    }
    setAiProjectScope(val);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSaveLaborScope = () => {
    if (onUpdateEstimate) {
      onUpdateEstimate({
        laborScope: localAiScope
      });
      setAiProjectScope(localAiScope);
      setShowSavedFeedback(true);
      setTimeout(() => setShowSavedFeedback(false), 3000);
    }
  };

  const handleGenerateAIScope = async () => {
    setIsGenerating(true);
    try {
      const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const prompt = `
        You are an expert fencing project manager. Based on the following estimate data, generate a highly detailed "Subcontractor Scope of Work" document. 
        This is a contract-style document that will be sent to the installation crew.
        
        Today's Date: ${currentDate}
        Customer: ${estimate.customerName}
        Address: ${estimate.customerAddress}
        Total Projects Specs:
        ${data.runs.map(run => {
          const isWood = run.styleName.includes('Wood') || run.styleName.includes('Cedar') || run.styleName.includes('Pine');
          return `
          Run: ${run.runName}
          Length: ${run.linearFeet} LF
          Style: ${run.styleName} ${isWood ? `- ${run.picketStyle} orientation` : ''}
          ${run.styleName.includes('Iron') ? `Install: ${run.ironInstallType}\n          Panel Type: ${run.ironPanelType}` : ''}
          Height: ${run.height}'
          ${isWood ? `Rails: ${run.railCount}
          Rot Board: ${run.hasRotBoard ? 'Included' : 'None'}
          Top Style: ${run.topStyle}
          Cap: ${run.hasTopCap ? 'Yes' : 'No'}
          Trim: ${run.hasTrim ? 'Yes' : 'No'}
          Wood Type: ${run.woodType || 'N/A'}` : ''}
          ${run.chainLinkGrade ? `Grade: ${run.chainLinkGrade}
          Bottom Rail: ${run.hasBottomRail ? 'Included' : 'None'}` : ''}
          Gates: ${run.gates.map(g => `${g.width}' ${g.type} (${g.construction || 'Standard'})`).join(', ')}
        `}).join('\n')}

        Requirements to include in the generated text:
        - Specific hole depths as mentioned: 8"x24" for standard, 8"x36" for 8' wood. Gate posts 1' deeper.
        - Detailed construction steps for the specific styles mentioned. Clearly distinguish between "Board on Board" (overlapping) and "Side by Side" picket orientation. For Board on Board, specify that pickets in the back layer must have exactly 3.5" of spacing between them, with the front layer centered over the gaps.
        - Utility Verification: Mandatory check of 811 markings. Instructions to stop digging if unknown obstructions are found.
        - Private Line Due Diligence: Explicitly mention responsibility for avoiding private lines not marked by 811, including sprinkler systems, septic lines, and power to auxiliary buildings/sheds.
        - Material management (how many pickets, posts, bags of concrete etc based on the manifest).
        - Quality control standards: Level/Plum requirements.
        - Cleanup expectations.
        - DO NOT include general PPE or safety requirements (the crew is responsible for their own safety gear).
        
        Format the output with professional headings and clear bullet points. Keep it concise but exhaustive for a contractor to follow perfectly.

        ADDITIONAL INSTRUCTIONS:
        ${customInstructions}
      `;

      const result = await generateAIScope(prompt);
      setAiProjectScope(result);
      setLocalAiScope(result);
      if (onUpdateEstimate) {
        onUpdateEstimate({ laborScope: result });
      }
      
      // Explicitly save to localStorage for immediate cross-tab availability
      localStorage.setItem('fence_pro_ai_scope', JSON.stringify(result));
    } catch (error) {
      console.error("AI Generation Error:", error);
      if (error instanceof Error && error.message === "GEMINI_API_KEY_MISSING") {
        setAiProjectScope("Error: Gemini API Key is missing. Please ensure it is set in your AI Studio settings (Secrets) as GEMINI_API_KEY.");
      } else {
        setAiProjectScope("Error generating AI scope. Please check your connection and API key configuration.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenNewTab = () => {
    // Collect all relevant state for bridging to ensure the new tab is identical
    const stateToBridge = {
      activeTab: 'labor-breakdown',
      estimate,
      materials,
      laborRates,
      quotes,
      aiProjectScope // Pass the scope explicitly to bridge it immediately
    };
    
    const hashState = encodeURIComponent(JSON.stringify(stateToBridge));
    const baseUrl = window.location.origin + window.location.pathname;
    const finalUrl = `${baseUrl}#state=${hashState}`;
    
    window.open(finalUrl, '_blank');
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-700 takeoff-page print:max-w-none print:p-0 print:m-0 print:space-y-4">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-6 rounded-[32px] shadow-xl border-2 border-american-red/10 print:hidden">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-american-red flex items-center justify-center text-white shadow-lg">
            <Hammer size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-american-blue uppercase tracking-tight">Subcontractor Labor Manifest</h1>
            <p className="text-[10px] font-bold text-american-red uppercase tracking-widest flex items-center gap-1">
              <Shield size={10} /> Certified Scope of Work • Vendor Authorization
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {showSavedFeedback && (
            <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-100 flex items-center gap-2">
              <CheckCircle2 size={12} />
              Saved
            </div>
          )}
          <button
            onClick={() => setShowEmailModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-transform active:scale-95 shadow-md"
          >
            <Send size={16} />
            Email Labor Contract
          </button>
          <button
            onClick={handleSaveLaborScope}
            className="flex items-center gap-2 px-4 py-2 bg-american-blue text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-transform active:scale-95 shadow-md shadow-american-blue/10"
          >
            <Download size={16} />
            Save Changes
          </button>
          <button
            onClick={handleOpenNewTab}
            className="flex items-center gap-2 px-4 py-2 bg-[#F5F5F7] hover:bg-[#E5E5E7] rounded-xl text-xs font-black uppercase tracking-widest text-american-blue transition-colors"
            title="Open in new window for better printing"
          >
            <ExternalLink size={16} />
            New Window
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-6 py-2 bg-american-red text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-american-red/20 hover:scale-105 transition-transform active:scale-95"
          >
            <Printer size={16} />
            Print Manifest
          </button>
        </div>
      </div>

      {/* Labor Contract Delivery Logs */}
      {estimate.laborContractEmailLog && Array.isArray(estimate.laborContractEmailLog) && estimate.laborContractEmailLog.length > 0 && (
        <div className="bg-white p-6 rounded-[32px] shadow-xl border-2 border-emerald-100 space-y-4 print:hidden animate-in fade-in duration-500">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm shadow-inner">
              <Clock size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black text-american-blue uppercase tracking-tight">Labor Contract Dispatch History</h3>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                Real-time delivery & scheduling portal logs
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-100">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="px-4 py-3">Crew Subcontractor</th>
                  <th className="px-4 py-3">Recipient Email</th>
                  <th className="px-4 py-3">Dispatched At</th>
                  <th className="px-4 py-3">Schedule Mode</th>
                  <th className="px-4 py-3 text-right">Portal Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-750">
                {estimate.laborContractEmailLog.map((log: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">{log.crewName || 'Subcontractor'}</td>
                    <td className="px-4 py-3 font-normal text-slate-500">{log.recipient}</td>
                    <td className="px-4 py-3 font-normal text-slate-500">{new Date(log.sentAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[9px] uppercase tracking-wider",
                        log.allowCrewDirectSchedule ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-amber-50 text-amber-600 border border-amber-100"
                      )}>
                        {log.allowCrewDirectSchedule ? "Direct Scheduling" : "Request Mode"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {log.crewScheduleLink ? (
                        <a 
                          href={log.crewScheduleLink} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-american-blue hover:text-american-red hover:underline inline-flex items-center gap-1 text-[10px]"
                        >
                          Access Portal <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span className="text-slate-400 font-normal">N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Installation Schedule & CRM Sync Panel */}
      {estimate.laborSnapshotToken && (
        <div className="bg-white p-6 rounded-[32px] shadow-xl border-2 border-american-blue/10 space-y-4 print:hidden animate-in fade-in duration-500">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-blue-50 text-american-blue flex items-center justify-center text-sm shadow-inner">
                <Calendar size={16} />
              </div>
              <div>
                <h3 className="text-sm font-black text-american-blue uppercase tracking-tight">Installation Schedule & CRM Sync</h3>
                <p className="text-[10px] font-bold text-american-blue/60 uppercase tracking-widest">
                  Manage GoHighLevel Calendar Events & Crew Portal Start Times
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isEditingSchedule) {
                    setIsEditingSchedule(false);
                  } else {
                    setAdminStartDate(estimate.scheduledStartDate || '');
                    setAdminDuration(estimate.scheduledDuration || '1 day');
                    setAdminCrew(estimate.assignedCrew || '');
                    setAdminScheduleNotes(estimate.scheduledNotes || '');
                    setIsEditingSchedule(true);
                  }
                  setScheduleSuccess('');
                  setScheduleError('');
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
              >
                {isEditingSchedule ? 'Cancel' : 'Edit Schedule'}
              </button>
              
              {estimate.scheduledStartDate && (
                <button
                  type="button"
                  disabled={scheduleSubmitting}
                  onClick={handleResyncGhlCalendar}
                  className="px-4 py-2 bg-american-blue hover:bg-american-blue/90 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-1"
                >
                  {scheduleSubmitting ? (
                    <Loader2 className="animate-spin" size={12} />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  Re-Sync CRM Calendar
                </button>
              )}
            </div>
          </div>

          {scheduleError && (
            <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-xl font-bold">
              {scheduleError}
            </div>
          )}

          {scheduleSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs rounded-xl font-bold">
              {scheduleSuccess}
            </div>
          )}

          {isEditingSchedule ? (
            <form onSubmit={handleAdminUpdateSchedule} className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">Start Date</label>
                <input
                  type="date"
                  value={adminStartDate}
                  onChange={(e) => setAdminStartDate(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-american-blue"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">Duration</label>
                <select
                  value={adminDuration}
                  onChange={(e) => setAdminDuration(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-american-blue"
                  required
                >
                  <option value="1 day">1 day</option>
                  <option value="2 days">2 days</option>
                  <option value="3 days">3 days</option>
                  <option value="4 days">4 days</option>
                  <option value="5+ days">5+ days</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">Assigned Crew</label>
                <input
                  type="text"
                  placeholder="Crew Name..."
                  value={adminCrew}
                  onChange={(e) => setAdminCrew(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-american-blue"
                  required
                />
              </div>

              <div className="space-y-1 md:col-span-4">
                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">Schedule Notes</label>
                <textarea
                  placeholder="Add any internal / customer facing notes for this schedule..."
                  value={adminScheduleNotes}
                  onChange={(e) => setAdminScheduleNotes(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-american-blue"
                  rows={2}
                />
              </div>

              <div className="md:col-span-4 flex justify-end">
                <button
                  type="submit"
                  disabled={scheduleSubmitting}
                  className="px-5 py-2 bg-american-red hover:bg-american-red/90 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  {scheduleSubmitting ? 'Saving Changes...' : 'Save & Sync Schedule'}
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-bold text-slate-700">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="block text-[10px] text-slate-400 font-black uppercase tracking-wider">Scheduled Start Date</span>
                <span className="text-sm font-black text-american-blue mt-1 block">
                  {estimate.scheduledStartDate || 'Not Scheduled Yet'}
                </span>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="block text-[10px] text-slate-400 font-black uppercase tracking-wider">Duration</span>
                <span className="text-sm font-black text-american-blue mt-1 block">
                  {estimate.scheduledDuration || 'Not Scheduled Yet'}
                </span>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="block text-[10px] text-slate-400 font-black uppercase tracking-wider">Assigned Crew</span>
                <span className="text-sm font-black text-american-blue mt-1 block">
                  {estimate.assignedCrew || 'Not Dispatched/Assigned'}
                </span>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <span className="block text-[10px] text-slate-400 font-black uppercase tracking-wider">GHL CRM Sync Status</span>
                <span className={cn(
                  "text-xs font-black uppercase mt-1.5 inline-block px-2.5 py-0.5 rounded-full border",
                  estimate.ghlCalendarSyncStatus === 'synced'
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                    : estimate.ghlCalendarSyncStatus === 'failed'
                      ? "bg-rose-50 text-rose-600 border-rose-200"
                      : "bg-slate-50 text-slate-500 border-slate-200"
                )}>
                  {estimate.ghlCalendarSyncStatus === 'synced' ? 'Synced to CRM' : estimate.ghlCalendarSyncStatus === 'failed' ? 'Sync Failed' : 'No Sync Active'}
                </span>
                {estimate.ghlCalendarLastSyncedAt && (
                  <span className="block text-[8px] text-slate-400 mt-1 font-normal">
                    Synced: {new Date(estimate.ghlCalendarLastSyncedAt).toLocaleString()}
                  </span>
                )}
              </div>

              {estimate.ghlCalendarEventId && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 sm:col-span-2">
                  <span className="block text-[10px] text-slate-400 font-black uppercase tracking-wider">GHL Appointment Event ID</span>
                  <span className="text-xs font-mono font-bold text-slate-700 mt-1 block select-all">
                    {estimate.ghlCalendarEventId}
                  </span>
                </div>
              )}

              {estimate.scheduledNotes && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 sm:col-span-2">
                  <span className="block text-[10px] text-slate-400 font-black uppercase tracking-wider">Schedule Notes</span>
                  <span className="text-xs font-medium text-slate-600 mt-1 block italic">
                    "{estimate.scheduledNotes}"
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Content (Printable) */}
      <div className="bg-white rounded-[40px] shadow-2xl border-2 border-american-red/5 overflow-hidden print:border-0 print:shadow-none">
        {/* Printable Header */}
        <div className="p-10 border-b-4 border-american-blue/5 bg-[#FBFBFB]">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8">
            <div className="space-y-4">
              <img src={COMPANY_INFO.logo} alt="Logo" className="h-20 object-contain" />
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-american-blue uppercase tracking-tighter">LABOR SCOPE OF WORK</h2>
                <div className="text-[11px] font-bold text-[#666666] uppercase tracking-widest space-y-0.5">
                  <p>Subcontractor Installation Agreement</p>
                  <p>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
              </div>
            </div>
            <div className="text-right space-y-1">
              <p className="text-[10px] font-black text-american-red uppercase tracking-widest">Document: Labor Take-off</p>
              <p className="text-3xl font-black text-american-blue uppercase tracking-tighter">CONFIDENTIAL</p>
              <div className="mt-4 pt-4 border-t-2 border-dashed border-american-blue/10">
                <p className="text-[10px] font-black text-american-blue uppercase tracking-widest">Job Reference</p>
                <p className="text-lg font-black text-american-blue tracking-tight">{estimate.customerName || 'Standard Job'}</p>
                <p className="text-xs font-medium text-[#666666]">{estimate.customerAddress || 'N/A'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="p-8 space-y-12">
          {/* Subcontractor Scope Header */}
          <div className="p-6 bg-american-blue/5 rounded-3xl border-2 border-american-blue/10 space-y-4">
            <h3 className="text-sm font-black text-american-blue uppercase tracking-[0.2em] flex items-center gap-2">
              <Shield size={16} /> Subcontractor General Scope of Work
            </h3>
            <div className="grid md:grid-cols-2 gap-6 text-[11px] leading-relaxed text-[#555555]">
              <div className="space-y-3">
                <p><strong className="text-american-blue font-black uppercase">Standard Digging:</strong> Holes for all fences (except 8' tall wood) must be at least <span className="text-american-red font-black underline">8" wide x 24" deep</span>.</p>
                <p><strong className="text-american-blue font-black uppercase">8' Wood Fence:</strong> Holes for 8' tall wood fences must be at least <span className="text-american-red font-black underline">8" wide x 36" deep</span>.</p>
                <p><strong className="text-american-blue font-black uppercase">Post Quality:</strong> All posts must be set in wet-poured concrete. No dry-bagging without explicit approval.</p>
              </div>
              <div className="space-y-3">
                <p><strong className="text-american-blue font-black uppercase">Gate Posts:</strong> ALL gate posts must be set <span className="text-american-red font-black underline">12" deeper</span> than regular posts (36" deep for standard, 48" deep for 8').</p>
                <p><strong className="text-american-blue font-black uppercase">Utility Marks:</strong> Crew must verify all 811 markings before digging. <span className="text-american-red font-black underline">STOP DIGGING</span> if you encounter unmarked lines or pipes.</p>
                <p><strong className="text-american-blue font-black uppercase">Private Lines:</strong> Subcontractor is responsible for due diligence regarding private lines (sprinklers, septic, shed power) not marked by 811. Hand-dig near suspected areas.</p>
                <p><strong className="text-american-blue font-black uppercase">Clean Up:</strong> Subcontractor is responsible for removal of all debris, picket scraps, and concrete excess from the site daily.</p>
              </div>
            </div>
          </div>

          {/* Project Drawing / Layout Reference */}
          {estimate.drawingUrl && (
            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
              <h3 className="text-sm font-black text-american-blue uppercase tracking-[0.2em] flex items-center gap-2">
                <Image size={16} /> Project Drawing / Layout Reference
              </h3>
              {estimate.drawingMimeType?.includes('pdf') ? (
                <div>
                  <div className="no-print flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-[#E5E5E5]">
                    <div className="flex items-center gap-3">
                      <FileText size={24} className="text-american-blue" />
                      <div>
                        <h4 className="text-sm font-bold text-american-blue">{estimate.drawingFileName || 'View Uploaded Project Drawing'}</h4>
                        <p className="text-xs text-[#999999]">PDF Document</p>
                      </div>
                    </div>
                    <a 
                      href={estimate.drawingUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="px-6 py-2 bg-american-blue text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all text-center"
                    >
                      View Uploaded Project Drawing
                    </a>
                  </div>
                  <div className="hidden print:block p-4 border border-dashed rounded-xl text-xs font-semibold text-slate-800">
                    📎 Reference PDF Drawing: <strong className="font-bold underline">{estimate.drawingFileName}</strong>
                    <p className="text-[10px] text-slate-500 font-mono mt-1 break-all">{estimate.drawingUrl}</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-4 border border-[#E5E5E5] flex flex-col gap-4 print:p-0 print:border-0">
                  <div className="max-w-2xl mx-auto overflow-hidden rounded-2xl border border-american-blue/10 print:border-0 p-1">
                    <img 
                      src={estimate.drawingUrl} 
                      alt="Project site plan or layout drawing"
                      referrerPolicy="no-referrer"
                      className="w-full h-auto object-contain max-h-[500px]" 
                    />
                  </div>
                  <div className="no-print text-center">
                    <a 
                      href={estimate.drawingUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="inline-flex items-center gap-2 text-xs font-bold text-american-blue hover:underline"
                    >
                      <ExternalLink size={14} />
                      Open Full Resolution Drawing
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {data.runs.map((run) => {
            const runLabor = run.items.filter(i => i.category === 'Labor' || i.category === 'Demolition');
            if (runLabor.length === 0 && run.gates.every(g => g.items.every(gi => gi.category !== 'Labor'))) return null;
            
            return (
              <div key={run.runId} className="space-y-4 takeoff-card">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-american-blue p-6 rounded-[32px] text-white">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center">
                      <FileText size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black uppercase tracking-tight">{run.runName}</h3>
                      <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">{run.linearFeet} LF TOTAL • {run.styleName}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20">
                      {run.height}' HEIGHT
                    </span>
                    {(run.styleName.includes('Wood') || run.styleName.includes('Cedar') || run.styleName.includes('Pine')) && (
                      <>
                        <span className="px-3 py-1 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20">
                          {run.railCount} RAILS
                        </span>
                        {run.hasRotBoard && (
                          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-200 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-500/40">
                            ROT BOARD
                          </span>
                        )}
                        <span className="px-3 py-1 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20">
                          {run.topStyle}
                        </span>
                        {(run.hasTopCap || run.hasTrim) && (
                          <span className="px-3 py-1 bg-american-red/20 text-american-red rounded-full text-[9px] font-black uppercase tracking-widest border border-american-red/40">
                            {run.hasTopCap && run.hasTrim ? 'CAP & TRIM' : (run.hasTopCap ? 'TOP CAP' : 'TRIM')}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="overflow-hidden rounded-3xl border-2 border-american-blue/5 shadow-sm">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[#F8F9FA] text-[10px] font-black uppercase tracking-widest text-[#999999]">
                        <th className="px-4 py-4">Detailed Work Specification</th>
                        <th className="px-4 py-4 text-center">Quantities</th>
                        <th className="px-4 py-4 text-right">Piece Rate</th>
                        <th className="px-4 py-4 text-right">Net Pay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-[#F8F9FA]">
                      {runLabor.map((item, i) => (
                        <tr key={i} className={cn(
                          "text-sm font-bold hover:bg-[#FBFBFB] transition-colors",
                          item.category === 'Demolition' ? "text-american-red/80 bg-american-red/5" : "text-american-blue/80"
                        )}>
                          <td className="px-4 py-4">
                            <div className="font-black">{item.name}</div>
                            <div className="text-[10px] font-normal opacity-60 mt-1 max-w-md leading-relaxed">
                              {item.name.includes('Installation') && (
                                <>
                                  <span className="block mb-1 text-american-blue/80 font-bold underline">
                                    Project Specs: {run.height}' Tall {run.styleName} 
                                    {(run.styleName.includes('Wood') || run.styleName.includes('Cedar')) ? `(${run.picketStyle})` : ''}
                                    {run.styleName.includes('Iron') && ` (${run.ironInstallType} • ${run.ironPanelType} Panels)`}
                                  </span>
                                  Includes: Layout, utility marking verification, digging to spec ({run.height === 8 ? '36"' : '24"'} min depth x 8" min width), post setting in wet concrete, {run.styleName.includes('Pipe') ? 'top rail installation' : (run.railCount > 0 ? `${run.railCount}x horizontal rail installation,` : '')} and {run.styleName.includes('Wood') ? 'picket' : (run.styleName.includes('Pipe') ? 'top rail' : 'panel')} attachment. 
                                  {run.picketStyle === 'Board on Board' && run.styleName.includes('Wood') && <span className="text-american-red font-bold">⚠️ BOARD ON BOARD: Pickets in the back layer MUST HAVE EXACTLY 3.5" SPACING between them. Front layer pickets must be centered over the gaps.</span>}
                                  {run.hasRotBoard && run.styleName.includes('Wood') && " Includes installation of 2x6 rot board."} 
                                  {run.hasTopCap && run.styleName.includes('Wood') && " Includes 2x6 top cap rail."} 
                                  {run.hasTrim && run.styleName.includes('Wood') && " Includes trim board application."}
                                  Must exercise full due diligence for private lines (sprinklers/septic/aux power). Gate posts must be set 12" deeper than regular posts. All work must be level, plum, and uniform.
                                </>
                              )}
                              {item.name.includes('Demo') && "Includes: Removal of existing fence segments, posts, and post concrete. Debris must be hauled away or staged as specified in dumpster/trailer."}
                              {item.name.includes('Stain') && `Includes: Power washing/cleaning surface followed by uniform application of selected stain. ${run.stainSides ? `Coverage: ${run.stainSides}` : ''}. No overspray on non-fence surfaces authorized.`}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center font-black">{item.qty} {item.unit}</td>
                          <td className="px-4 py-4 text-right tabular-nums">{formatCurrency(item.unitCost)}</td>
                          <td className="px-4 py-4 text-right tabular-nums font-black">{formatCurrency(item.total)}</td>
                        </tr>
                      ))}
                      {/* Gate Labor if nested */}
                      {run.gates.map((gate, gi) => (
                        gate.items.filter(i => i.category === 'Labor').map((item, ii) => (
                          <tr key={`${gi}-${ii}`} className="text-sm font-bold text-american-red/80 bg-american-red/[0.02] hover:bg-american-red/[0.05] transition-colors">
                            <td className="px-4 py-4 flex items-center gap-2">
                              <span className="text-[10px] bg-american-red font-black text-white px-2 py-0.5 rounded">GATE</span>
                              {item.name}
                            </td>
                            <td className="px-4 py-4 text-center font-black">{item.qty} {item.unit}</td>
                            <td className="px-4 py-4 text-right tabular-nums">{formatCurrency(item.unitCost)}</td>
                            <td className="px-4 py-4 text-right tabular-nums font-black">{formatCurrency(item.total)}</td>
                          </tr>
                        ))
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* Master Labor Summary */}
          <div className="pt-12 border-t-4 border-american-blue/5 space-y-8 takeoff-card">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-american-blue text-white flex items-center justify-center shadow-lg">
                <Hammer size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-american-blue tracking-tight uppercase">Aggregate Labor Manifest</h2>
                <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Total Crew Pay Breakdown</p>
              </div>
            </div>

            <div className="bg-white rounded-[32px] p-1 overflow-hidden border-2 border-american-blue/5 shadow-lg">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#F8F9FA] text-[10px] font-black uppercase tracking-widest text-[#999999]">
                    <th className="px-4 py-6">Operation / Task</th>
                    <th className="px-4 py-6 text-center">Cumulative Volume</th>
                    <th className="px-4 py-6 text-right">Total Net Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-[#F8F9FA]">
                  {laborSummary.map((item, i) => (
                    <tr key={i} className="text-sm font-bold text-american-blue hover:bg-[#FBFBFB] transition-colors">
                      <td className="px-4 py-5 flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-american-red" />
                        {item.name}
                      </td>
                      <td className="px-4 py-5 text-center">
                        <span className="px-3 py-1 bg-american-blue/5 text-american-blue rounded-full text-xs font-black print:bg-transparent print:p-0">{item.qty} {item.unit}</span>
                      </td>
                      <td className="px-4 py-5 text-right font-black text-american-red">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-american-blue text-white">
                    <td colSpan={2} className="px-4 py-6 text-right font-black uppercase tracking-widest text-xs">Total Direct Labor Liability</td>
                    <td className="px-4 py-6 text-right font-black text-2xl">{formatCurrency(totalLaborRaw)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          
          {/* AI Scope Generator Section */}
          <div className="pt-12 border-t-4 border-american-blue/5 space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 print:hidden">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-american-blue/5 text-american-blue flex items-center justify-center border-2 border-american-blue/10">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-american-blue tracking-tight uppercase">AI Contract Refinement</h2>
                  <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Generate detailed job site procedures</p>
                </div>
              </div>
              
              <div className="flex-1 w-full md:w-auto">
                <textarea
                  placeholder="Add specific instructions for AI scope generation..."
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  className="w-full h-12 p-2 rounded-xl text-xs border border-[#E5E5E5] resize-none"
                />
              </div>
              
              <button
                onClick={handleGenerateAIScope}
                disabled={isGenerating}
                className="flex items-center gap-3 px-8 py-4 bg-american-blue text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-american-blue/20 hover:scale-105 transition-all active:scale-95 disabled:opacity-50 disabled:scale-100"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Generating Scope...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Refine Scope with AI
                  </>
                )}
              </button>
            </div>

            {aiProjectScope && (
              <div className="p-10 bg-[#FBFBFB] rounded-[40px] border-4 border-american-blue/5 shadow-inner animate-in slide-in-from-bottom-4 duration-500 print:hidden">
                <div className="flex items-center justify-between mb-8 pb-4 border-b-2 border-american-blue/5">
                  <h4 className="text-[10px] font-black text-american-blue uppercase tracking-widest flex items-center gap-2">
                    <Shield size={14} className="text-american-red" /> AI-Generated Installation Directives
                  </h4>
                  <button 
                    onClick={() => setAiProjectScope(null)}
                    className="text-[10px] font-black text-american-red uppercase tracking-widest hover:underline"
                  >
                    Clear Analysis
                  </button>
                </div>
                <div className="prose prose-sm max-w-none text-[#444444] whitespace-pre-line text-xs leading-relaxed font-medium bg-white p-6 rounded-2xl border border-american-blue/5 shadow-inner print:hidden">
                  <textarea
                    value={localAiScope}
                    onChange={(e) => handleScopeChange(e.target.value)}
                    onInput={(e) => {
                      e.currentTarget.style.height = 'auto';
                      e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                    }}
                    className="w-full bg-transparent outline-none resize-none overflow-hidden text-[#444444] leading-relaxed font-medium min-h-[200px]"
                    placeholder="Enter installation directives here..."
                  />
                </div>
                <div className="hidden print:block whitespace-pre-wrap text-[11px] leading-relaxed text-[#333333]">
                  {localAiScope}
                </div>
              </div>
            )}
            
            {/* Printable AI Scope (only visible when generated and during print) */}
            <div className="hidden print:block mt-12 pt-12 border-t-4 border-dashed border-american-blue/10">
              <h2 className="text-xl font-black text-american-blue tracking-tight uppercase mb-6">Installation Directives & Safety Procedures</h2>
              <div className="text-[11px] leading-relaxed text-[#333333] whitespace-pre-line">
                {localAiScope || "Standard installation procedures apply."}
              </div>
            </div>
          </div>

          <div className="p-8 bg-american-red/5 rounded-3xl border-2 border-american-red/10 print:hidden">
             <div className="flex gap-4">
                <Shield className="text-american-red shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-black text-american-blue uppercase tracking-tight">Confidential Document Notice</p>
                  <p className="text-xs text-[#666666] leading-relaxed">This labor take-off is intended for internal payroll and logistical management only. It reflects direct labor costs without sales tax or profit markup. Do not distribute to clients or external sales representatives.</p>
                </div>
             </div>
          </div>
        </div>

        {/* Footer Branding */}
        <div className="bg-american-blue p-8 text-center border-t-8 border-american-blue/20 print:hidden">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Lone Star Fence Works • Strategic Labor Operations • Internal Use Only</p>
        </div>
      </div>

      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#010915]/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-300">
          <div className="relative bg-white w-full max-w-2xl rounded-[32px] border-2 border-american-blue/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-american-blue text-white p-6 flex justify-between items-start border-b-4 border-american-red">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Email Labor Contract to Crew</h3>
                <p className="text-[10px] text-white/75 font-bold uppercase tracking-wider mt-1">
                  Secure work order & installation dispatch
                </p>
              </div>
              <button 
                onClick={() => setShowEmailModal(false)}
                className="text-white/60 hover:text-white transition-colors text-2xl font-normal leading-none"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {sendSuccess ? (
                <div className="text-center py-10 space-y-4">
                  <div className="h-16 w-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto text-3xl shadow-inner">
                    ✓
                  </div>
                  <h4 className="text-xl font-black text-american-blue uppercase tracking-tight">
                    {sendSuccessInfo?.debugBuild === "labor-via-estimate-mailer-test-v1" ? "Test Email Delivered!" : "Contract Email Dispatched!"}
                  </h4>
                  <p className="text-sm text-american-blue/60 max-w-md mx-auto font-medium">
                    {sendSuccessInfo?.debugBuild === "labor-via-estimate-mailer-test-v1"
                      ? "The highly simplified test email was accepted by the SMTP server for delivery."
                      : "The labor contract has been securely emailed to the crew along with their personal installation scheduling link."}
                  </p>

                  {sendSuccessInfo && (
                    <div className="mt-6 p-5 bg-slate-50 rounded-2xl border border-slate-200 text-left text-xs font-medium space-y-2.5 max-w-lg mx-auto font-mono text-slate-700">
                      <div className="font-bold border-b border-slate-200 pb-1.5 uppercase text-american-blue text-[10px] tracking-wider font-sans">
                        📬 Transmission delivery report
                      </div>
                      {sendSuccessInfo.messageId && (
                        <div>
                          <span className="font-bold">Message ID:</span> {sendSuccessInfo.messageId}
                        </div>
                      )}
                      {Array.isArray(sendSuccessInfo.accepted) && sendSuccessInfo.accepted.length > 0 && (
                        <div>
                          <span className="font-bold text-emerald-600">Accepted Recipients:</span> {sendSuccessInfo.accepted.join(', ')}
                        </div>
                      )}
                      {Array.isArray(sendSuccessInfo.rejected) && sendSuccessInfo.rejected.length > 0 && (
                        <div>
                          <span className="font-bold text-red-500">Rejected Recipients:</span> {sendSuccessInfo.rejected.join(', ')}
                        </div>
                      )}
                      {sendSuccessInfo.response && (
                        <div>
                          <span className="font-bold">SMTP Server Response:</span> {sendSuccessInfo.response}
                        </div>
                      )}
                      {sendSuccessInfo.spamSafeVersion && (
                        <div>
                          <span className="font-bold text-[#2A72E5]">Anti-Spam Shield:</span> Yes (Lightweight Summary Notification)
                        </div>
                      )}
                      {sendSuccessInfo.htmlLength !== undefined && (
                        <div>
                          <span className="font-bold">HTML Size:</span> {sendSuccessInfo.htmlLength} bytes (&lt; 10KB safe limit)
                        </div>
                      )}
                      {sendSuccessInfo.textLength !== undefined && (
                        <div>
                          <span className="font-bold">Plaintext Size:</span> {sendSuccessInfo.textLength} bytes
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {sendError && (
                    <div className="p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 text-xs font-bold leading-relaxed">
                      ⚠️ ERROR: {sendError}
                    </div>
                  )}

                  {!estimate.id && (
                    <div className="p-4 bg-amber-50 text-amber-700 rounded-2xl border border-amber-100 text-xs font-bold leading-relaxed">
                      ⚠️ Estimate has not been saved yet. You must click "Save Changes" on the main estimator tab to get an Estimate ID before you can send a labor contract link.
                    </div>
                  )}

                  {/* Recipient selection */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-black uppercase text-american-blue tracking-wider">Select Crew Recipient</label>
                      <select
                        value={selectedRecipient}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedRecipient(val);
                          if (val !== 'custom') {
                            const emp = employees.find(emp => emp.email === val);
                            const name = emp ? (emp.name || emp.email.split('@')[0]) : val.split('@')[0];
                            setCrewName(name);
                            setEmailMessage(getDefaultMessage(name));
                          } else {
                            setCrewName('');
                            setEmailMessage(getDefaultMessage(''));
                          }
                        }}
                        disabled={!estimate.id}
                        className="w-full text-sm font-bold border-2 border-american-blue/10 rounded-xl px-4 py-3 bg-white focus:outline-none focus:border-american-blue transition-colors disabled:opacity-50"
                      >
                        {employees.map(emp => (
                          <option key={emp.id || emp.email} value={emp.email}>
                            {emp.isPrimaryCrewContact ? `Primary Crew Contact: ${emp.name || emp.email.split('@')[0]} (${emp.email})` : `${emp.name || emp.email.split('@')[0]} (${emp.email})`}
                          </option>
                        ))}
                        <option value="custom">Custom Email Address...</option>
                      </select>
                      {employees.length === 0 && (
                        <p className="text-xs text-amber-600 mt-1 font-semibold">
                          ⚠️ No active crew recipients found. Add one under Manage Employees or use Custom Email Address.
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-black uppercase text-american-blue tracking-wider">Crew / Subcontractor Name</label>
                      <input
                        type="text"
                        value={crewName}
                        onChange={(e) => {
                          const name = e.target.value;
                          setCrewName(name);
                          setEmailMessage(getDefaultMessage(name));
                        }}
                        disabled={!estimate.id}
                        placeholder="e.g. Braden's Construction"
                        className="w-full text-sm font-bold border-2 border-american-blue/10 rounded-xl px-4 py-3 bg-white focus:outline-none focus:border-american-blue transition-colors disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {selectedRecipient === 'custom' && (
                    <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-300">
                      <label className="block text-[11px] font-black uppercase text-american-blue tracking-wider">Custom Recipient Email</label>
                      <input
                        type="email"
                        value={manualRecipientEmail}
                        onChange={(e) => setManualRecipientEmail(e.target.value)}
                        placeholder="crew@example.com"
                        className="w-full text-sm font-bold border-2 border-american-blue/10 rounded-xl px-4 py-3 bg-white focus:outline-none focus:border-american-blue transition-colors"
                      />
                    </div>
                  )}

                  {/* Subject and Message details */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-black uppercase text-american-blue tracking-wider">Email Subject</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      disabled={!estimate.id}
                      placeholder="Enter subject line"
                      className="w-full text-sm font-bold border-2 border-american-blue/10 rounded-xl px-4 py-3 bg-white focus:outline-none focus:border-american-blue transition-colors disabled:opacity-50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-black uppercase text-american-blue tracking-wider">Email Narrative Message</label>
                    <textarea
                      value={emailMessage}
                      onChange={(e) => setEmailMessage(e.target.value)}
                      disabled={!estimate.id}
                      rows={6}
                      placeholder="Write message to crew..."
                      className="w-full text-xs font-medium border-2 border-american-blue/10 rounded-xl px-4 py-3 bg-white focus:outline-none focus:border-american-blue transition-colors focus:ring-0 disabled:opacity-50 border-solid"
                    />
                  </div>

                  {/* Config flags */}
                  <div className="p-4 bg-[#F8F9FA] rounded-2xl border-2 border-american-blue/5 space-y-3">
                    <h4 className="text-[10px] font-black uppercase text-american-red tracking-widest">Optional Attachments & Permissions</h4>
                    <div className="flex flex-col gap-2.5">
                      <label className="flex items-center gap-3 cursor-pointer text-xs font-bold text-[#444444] select-none">
                        <input
                          type="checkbox"
                          checked={includeDrawing}
                          onChange={(e) => setIncludeDrawing(e.target.checked)}
                          disabled={!estimate.id || !estimate.drawingUrl}
                          className="h-4 w-4 rounded border-[#dddddd] text-american-blue focus:ring-0 cursor-pointer disabled:opacity-50"
                        />
                        <span>
                          Include project drawing/site plan reference 
                          {!estimate.drawingUrl && <span className="text-[10px] font-normal text-slate-400 ml-1">(No drawing uploaded)</span>}
                        </span>
                      </label>

                      <label className="flex items-center gap-3 cursor-pointer text-xs font-bold text-[#444444] select-none">
                        <input
                          type="checkbox"
                          checked={allowCrewDirectSchedule}
                          onChange={(e) => setAllowCrewDirectSchedule(e.target.checked)}
                          disabled={!estimate.id}
                          className="h-4 w-4 rounded border-[#dddddd] text-american-blue focus:ring-0 cursor-pointer disabled:opacity-50"
                        />
                        <span>Allow crew to directly schedule / reschedule installations</span>
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-4 flex justify-end gap-3 border-t border-slate-100 rounded-b-[32px]">
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold uppercase tracking-wider hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
              {!sendSuccess && estimate.id && (
                <>
                  <button
                    type="button"
                    onClick={handleSendMinimalTest}
                    disabled={isSendingEmail}
                    className="px-6 py-2.5 bg-american-blue hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:scale-105 transition-transform active:scale-95 shadow-md flex items-center gap-2"
                  >
                    {isSendingEmail ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Send size={14} />
                        Send Minimal Work Order Test
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleSendLaborContract}
                    disabled={isSendingEmail}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:scale-105 transition-transform active:scale-95 shadow-md flex items-center gap-2"
                  >
                    {isSendingEmail ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send size={14} />
                        Send Contract Email
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
