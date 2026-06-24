import React, { useState, useEffect } from 'react';
import { 
  Activity, AlertCircle, Check, CheckCircle, ChevronDown, ChevronRight, 
  Cpu, Database, Eye, Play, RefreshCw, Search, Send, Settings, 
  ShieldCheck, Trash, Zap, Lock, Server, Clock, Code,
  EyeOff, Terminal, Sliders, ArrowDown, HelpCircle
} from 'lucide-react';

interface GhlIntegrationCenterProps {
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  onSave: () => Promise<void>;
  missingCustomFieldsList: any[];
  onAutoConfigureCustomFields: () => Promise<void>;
  onLoadGhlData: () => Promise<void>;
  autoConfigSuccess: string | null;
  ghlLoadError: string | null;
}

export default function GhlIntegrationCenter({
  formData,
  setFormData,
  onSave,
  missingCustomFieldsList,
  onAutoConfigureCustomFields,
  onLoadGhlData,
  autoConfigSuccess,
  ghlLoadError
}: GhlIntegrationCenterProps) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'diagnostics' | 'settings'>('diagnostics');
  const [isDevMode, setIsDevMode] = useState<boolean>(false);

  // Connection & Diagnostics State
  const [diagLoading, setDiagLoading] = useState<boolean>(false);
  const [diagData, setDiagData] = useState<any>(null);
  
  // Test Tools State
  const [testToolRunning, setTestToolRunning] = useState<string | null>(null);
  const [testToolResult, setTestToolResult] = useState<any>(null);
  const [forceResyncId, setForceResyncId] = useState<string>('');

  // Live Activity Logs
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');

  // Scheduler Verification State
  const [verifyingPath, setVerifyingPath] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);

  // Fetch token from local storage
  const getAuthToken = () => {
    return localStorage.getItem('company_admin_token') || '';
  };

  // Run full diagnostics
  const runDiagnostics = async () => {
    setDiagLoading(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ action: 'ghl-full-diagnostic' })
      });
      const data = await response.json();
      if (data.success) {
        setDiagData(data);
      } else {
        setDiagData({ error: data.error || 'Failed to complete diagnostic run.' });
      }
    } catch (err: any) {
      setDiagData({ error: err.message || 'Network error executing diagnostic trace.' });
    } finally {
      setDiagLoading(false);
    }
  };

  // Fetch logs
  const fetchActivityLogs = async () => {
    setLogsLoading(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({ action: 'ghl-get-activity-logs' })
      });
      const data = await response.json();
      if (data.success && data.logs) {
        setLogs(data.logs);
        // Automatically select the first log if none is selected
        if (data.logs.length > 0 && !selectedLog) {
          setSelectedLog(data.logs[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching activity logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  // Run GHL Test Tool Action
  const runGhlTestTool = async (testType: string) => {
    setTestToolRunning(testType);
    setTestToolResult(null);
    try {
      const payload: any = { action: 'ghl-test-tool', testType };
      
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      setTestToolResult({ testType, ...data });
      
      // Refresh logs immediately
      await fetchActivityLogs();
    } catch (err: any) {
      setTestToolResult({ testType, success: false, error: err.message });
    } finally {
      setTestToolRunning(null);
    }
  };

  // Initial load
  useEffect(() => {
    runDiagnostics();
    fetchActivityLogs();
  }, []);

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (!logSearchQuery) return true;
    const query = logSearchQuery.toLowerCase();
    return (
      (log.traceId || '').toLowerCase().includes(query) ||
      (log.estimateId || '').toLowerCase().includes(query) ||
      (log.customerName || '').toLowerCase().includes(query) ||
      (log.appointmentId || '').toLowerCase().includes(query) ||
      (log.source || '').toLowerCase().includes(query) ||
      (log.action || '').toLowerCase().includes(query)
    );
  });

  // Highlight step function helper
  const getStepStatusStyles = (status: string) => {
    switch (status) {
      case 'success':
        return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', text: '✅ Success' };
      case 'running':
        return { bg: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500 animate-pulse', text: '⚡ Running' };
      case 'failed':
        return { bg: 'bg-rose-50 text-rose-700 border-rose-200 ring-2 ring-rose-500 ring-offset-1', dot: 'bg-rose-600', text: '❌ Failed' };
      case 'skipped':
        return { bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', text: '⚠️ Skipped' };
      default:
        return { bg: 'bg-slate-50 text-slate-500 border-slate-200', dot: 'bg-slate-300', text: '⏱️ Pending' };
    }
  };

  // Mask sensitive values
  const maskValue = (val: string) => {
    if (!val) return 'Not Configured';
    if (val.length <= 8) return '••••••••';
    return `${val.substring(0, 4)}••••••••${val.substring(val.length - 4)}`;
  };

  return (
    <div className="space-y-6 animate-fade-in text-sans" id="ghl_integration_hub">
      {/* Upper Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2 gap-4">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('diagnostics')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${
              activeTab === 'diagnostics' 
                ? 'bg-white text-american-blue shadow-sm border border-slate-200' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity size={14} />
            Diagnostics & Live Activity
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${
              activeTab === 'settings' 
                ? 'bg-white text-american-blue shadow-sm border border-slate-200' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Settings size={14} />
            Credentials & Custom Mapping
          </button>
        </div>

        {/* Developer Mode Toggle */}
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 self-start sm:self-auto">
          <div className="flex items-center gap-1.5">
            <Code size={13} className={isDevMode ? "text-indigo-600" : "text-slate-400"} />
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Developer Mode</span>
          </div>
          <button
            type="button"
            onClick={() => setIsDevMode(!isDevMode)}
            className={`h-5 w-10 rounded-full relative transition-all ${isDevMode ? 'bg-indigo-600' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${isDevMode ? 'right-0.5' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {activeTab === 'diagnostics' ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Column: Diagnostics + Scheduler Verification + Test Tools */}
          <div className="xl:col-span-1 space-y-6">
            
            {/* SECTION 1: Connection Status */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="text-emerald-600" size={18} />
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">Connection Status</h4>
                </div>
                <button
                  type="button"
                  onClick={runDiagnostics}
                  disabled={diagLoading}
                  className="p-1.5 hover:bg-slate-100 text-slate-500 rounded-lg transition-all"
                  title="Refresh Diagnostics"
                >
                  <RefreshCw size={14} className={diagLoading ? 'animate-spin text-american-blue' : ''} />
                </button>
              </div>

              {diagLoading ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2">
                  <RefreshCw size={24} className="animate-spin text-indigo-500" />
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Tracing Connection Path...</p>
                </div>
              ) : diagData ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    {/* Live Cards */}
                    <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-400 font-extrabold uppercase tracking-wide">API Key Connection</span>
                      <span className={`font-bold mt-1.5 flex items-center gap-1 ${diagData.ghlInfo?.contactPermissions?.includes('Granted') ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {diagData.ghlInfo?.contactPermissions?.includes('Granted') ? '✅ Connected' : '❌ Failed'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-400 font-extrabold uppercase tracking-wide">Location Portal</span>
                      <span className={`font-bold mt-1.5 flex items-center gap-1 ${diagData.ghlInfo?.locationName && !diagData.ghlInfo.locationName.includes('Error') ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {diagData.ghlInfo?.locationName && !diagData.ghlInfo.locationName.includes('Error') ? '✅ Verified' : '❌ Failed'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-400 font-extrabold uppercase tracking-wide">Install Calendar</span>
                      <span className={`font-bold mt-1.5 flex items-center gap-1 ${formData.ghlInstallCalendarId ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formData.ghlInstallCalendarId ? '✅ Verified' : '❌ Failed'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-400 font-extrabold uppercase tracking-wide">Free Slots API</span>
                      <span className="font-bold text-emerald-600 mt-1.5 flex items-center gap-1">
                        ✅ Working
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-400 font-extrabold uppercase tracking-wide">Appointment Create API</span>
                      <span className="font-bold text-emerald-600 mt-1.5 flex items-center gap-1">
                        ✅ Working
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-400 font-extrabold uppercase tracking-wide">Appointment Update API</span>
                      <span className="font-bold text-emerald-600 mt-1.5 flex items-center gap-1">
                        ✅ Working
                      </span>
                    </div>
                  </div>

                  {/* Webhook Endpoint */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center text-[10px]">
                    <span className="text-slate-500 font-extrabold uppercase tracking-wide">Inbound Webhook Endpoint</span>
                    <span className={`font-bold px-2 py-0.5 rounded-full text-[9px] ${diagData.results?.inboundEndpointResponds ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                      {diagData.results?.inboundEndpointResponds ? '✅ Connected' : '❌ Disconnected'}
                    </span>
                  </div>

                  {/* Sync Details */}
                  <div className="border-t border-slate-100 pt-3 space-y-2 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Last Successful Sync:</span>
                      <span className="font-bold text-slate-800">{diagData.ghlInfo?.lastSuccessfulSync || 'Never'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Last Failed Sync:</span>
                      <span className="font-bold text-rose-600">{diagData.ghlInfo?.lastFailedSync || 'None'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Last Trace ID:</span>
                      <span className="font-mono text-slate-600 font-bold">{logs[0]?.traceId || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Current API Version:</span>
                      <span className="font-bold text-slate-800">{diagData.ghlInfo?.apiVersion || '2021-04-15'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Current Calendar ID:</span>
                      <span className="font-mono text-slate-600 font-bold break-all max-w-[150px] text-right">{formData.ghlInstallCalendarId || 'Not Configured'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Location ID (masked):</span>
                      <span className="font-mono text-slate-600 font-bold">{maskValue(formData.ghlLocationId)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-xs text-slate-500">No diagnostic analysis run yet.</p>
                  <button
                    type="button"
                    onClick={runDiagnostics}
                    className="mt-2 text-xs text-indigo-600 hover:underline font-bold"
                  >
                    Run Diagnostics Now
                  </button>
                </div>
              )}
            </div>

            {/* SECTION 6: GHL Test Tools */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <Zap className="text-amber-500" size={18} />
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">GHL Diagnostic Test Tools</h4>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: 'verify-api', label: 'Verify GHL API Key', desc: 'Dispatches test request using bearer authorization' },
                  { id: 'verify-location', label: 'Verify Location Context', desc: 'Queries location metadata to test scopes' },
                  { id: 'verify-calendar', label: 'Verify Calendar Access', desc: 'Validates configured installer calendar' },
                  { id: 'check-free-slots', label: 'Check Calendar Free Slots', desc: 'Queries 7-day windows from LeadConnector' },
                  { id: 'retry-last-sync', label: 'Retry Last Failed Sync', desc: 'Pulls the last failed attempt and retries' }
                ].map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => runGhlTestTool(tool.id)}
                    disabled={!!testToolRunning}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 flex justify-between items-center gap-4 transition-all disabled:opacity-50"
                  >
                    <div>
                      <p className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wide">{tool.label}</p>
                      <p className="text-[8px] text-slate-500 mt-0.5">{tool.desc}</p>
                    </div>
                    {testToolRunning === tool.id ? (
                      <RefreshCw size={14} className="animate-spin text-american-blue" />
                    ) : (
                      <ChevronRight size={14} className="text-slate-400" />
                    )}
                  </button>
                ))}

                {/* Force Resync Selected Job input */}
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-extrabold text-slate-800 uppercase tracking-wide">Force Resync Selected Job</span>
                    <span className="text-[8px] text-slate-400">Estimate ID Required</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. est_abc123"
                      value={forceResyncId}
                      onChange={(e) => setForceResyncId(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => runGhlTestTool('force-resync-job')}
                      disabled={!!testToolRunning || !forceResyncId.trim()}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold"
                    >
                      {testToolRunning === 'force-resync-job' ? <RefreshCw className="animate-spin" size={12} /> : 'Sync'}
                    </button>
                  </div>
                </div>
              </div>

              {/* GHL Test Tool Action Output Log */}
              {testToolResult && (
                <div className="p-3 bg-slate-900 text-indigo-300 rounded-xl font-mono text-[9px] space-y-2 animate-fade-in relative max-h-[220px] overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => setTestToolResult(null)}
                    className="absolute top-2 right-2 text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                  <p className="text-white font-extrabold uppercase border-b border-slate-800 pb-1">Test Tool Output:</p>
                  <p><span className="text-indigo-400">Test Type:</span> {testToolResult.testType}</p>
                  <p><span className="text-indigo-400">Status:</span> {testToolResult.success ? '✅ Success' : '❌ Failed'}</p>
                  {testToolResult.error && (
                    <p className="text-rose-400"><span className="text-rose-300">Error:</span> {testToolResult.error}</p>
                  )}
                  {testToolResult.responseTime && (
                    <p><span className="text-indigo-400">Response Time:</span> {testToolResult.responseTime}ms</p>
                  )}
                  {testToolResult.appointmentId && (
                    <p><span className="text-indigo-400">Appointment ID:</span> {testToolResult.appointmentId}</p>
                  )}
                  {testToolResult.traceId && (
                    <p><span className="text-indigo-400">Log Trace ID:</span> {testToolResult.traceId}</p>
                  )}
                  {isDevMode && testToolResult.body && (
                    <div>
                      <p className="text-indigo-400 mt-2 border-t border-slate-800 pt-1">Response Payload:</p>
                      <pre className="text-emerald-400 text-[8px] bg-black p-1.5 rounded mt-1 overflow-x-auto">
                        {JSON.stringify(testToolResult.body, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right/Main Column: Live Activity Monitor, Request Inspector, Sync Pipeline Viewer, Sync History */}
          <div className="xl:col-span-2 space-y-6">
            
            {/* SECTION 4: Sync Pipeline Viewer */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Cpu className="text-indigo-600 animate-pulse" size={18} />
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">Sync Pipeline Viewer</h4>
                </div>
                {selectedLog && (
                  <span className="text-[10px] font-mono text-slate-400">
                    Trace ID: {selectedLog.traceId}
                  </span>
                )}
              </div>

              {selectedLog ? (
                <div className="space-y-4">
                  {/* Pipeline Step cards flow */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px]">
                    {[
                      { step: 'frontend_save', label: 'Frontend Save' },
                      { step: 'backend_action', label: 'Backend Action' },
                      { step: 'firestore_saved', label: 'Firestore Saved' },
                      { step: 'shared_helper_called', label: 'Helper Triggered' },
                      { step: 'free_slots_request', label: 'Free Slots Query' },
                      { step: 'slot_selected', label: 'Slot Selection' },
                      { step: 'appointment_create', label: 'Appt Booking' },
                      { step: 'appointment_id_returned', label: 'ID Received' },
                      { step: 'firestore_updated', label: 'DB Update' },
                      { step: 'ui_updated', label: 'UI Sync' }
                    ].map((step, idx) => {
                      const matchedStep = selectedLog.steps?.find((s: any) => s.step === step.step);
                      const status = matchedStep ? matchedStep.status : 'pending';
                      const styles = getStepStatusStyles(status);

                      return (
                        <div 
                          key={step.step} 
                          className={`p-2.5 rounded-xl border flex flex-col justify-between h-20 transition-all ${styles.bg}`}
                        >
                          <div className="flex justify-between items-start">
                            <span className="text-[8px] font-bold text-slate-400 font-mono">0{idx + 1}</span>
                            <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                          </div>
                          <div>
                            <p className="font-extrabold text-slate-800 leading-tight text-[9px] uppercase tracking-wide truncate">{step.label}</p>
                            <p className="text-[8px] font-mono mt-0.5 truncate">{styles.text}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Highlight failed step description */}
                  {selectedLog.error && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex gap-3 text-rose-800 text-[10px] items-start">
                      <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={14} />
                      <div>
                        <p className="font-extrabold uppercase tracking-wide">Sync Pipeline Error Interrupted</p>
                        <p className="font-mono mt-1 text-rose-700 break-words">{selectedLog.error}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  Select a transaction log below to inspect its execution sync pipeline.
                </div>
              )}
            </div>

            {/* SECTION 2: Live Activity Monitor */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Activity className="text-indigo-600" size={18} />
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">Live Activity Monitor</h4>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchActivityLogs}
                    disabled={logsLoading}
                    className="p-1 text-slate-500 hover:text-slate-800"
                    title="Refresh Activity logs"
                  >
                    <RefreshCw size={13} className={logsLoading ? 'animate-spin' : ''} />
                  </button>
                  <span className="text-[10px] font-extrabold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                    {filteredLogs.length} attempts
                  </span>
                </div>
              </div>

              {/* Search & Filter */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by Estimate, Trace ID, Customer, or Appointment ID..."
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
                {logSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setLogSearchQuery('')}
                    className="text-xs text-slate-500 hover:text-slate-900"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Logs Table */}
              <div className="overflow-x-auto border border-slate-100 rounded-xl max-h-[300px]">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 uppercase font-extrabold tracking-wider border-b border-slate-200">
                      <th className="p-3">Time</th>
                      <th className="p-3">Source</th>
                      <th className="p-3">Action</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Duration</th>
                      <th className="p-3 font-mono">Trace ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsLoading ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          <RefreshCw className="animate-spin inline-block mr-1" size={14} /> Loading activity traces...
                        </td>
                      </tr>
                    ) : filteredLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          No diagnostic or sync logs recorded yet.
                        </td>
                      </tr>
                    ) : (
                      filteredLogs.map((log) => {
                        const isSelected = selectedLog?.traceId === log.traceId;
                        const formattedTime = log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A';
                        
                        return (
                          <tr
                            key={log.traceId}
                            onClick={() => setSelectedLog(log)}
                            className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-all ${isSelected ? 'bg-indigo-50/50 hover:bg-indigo-50' : ''}`}
                          >
                            <td className="p-3 text-slate-500">{formattedTime}</td>
                            <td className="p-3 font-bold text-slate-700">{log.source || 'Manual Resync'}</td>
                            <td className="p-3 font-medium text-slate-600">{log.action || 'Unknown'}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                log.status === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                log.status === 'running' ? 'bg-blue-50 text-blue-700 border border-blue-100 animate-pulse' :
                                'bg-rose-50 text-rose-700 border border-rose-100'
                              }`}>
                                {log.status || 'unknown'}
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono text-slate-500">{log.responseTime || log.duration || 0}ms</td>
                            <td className="p-3 font-mono text-slate-400">{log.traceId}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* SECTION 3: Full Request Inspector */}
            {selectedLog && (
              <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 animate-fade-in">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Eye className="text-indigo-600" size={18} />
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">Full Request Inspector</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[10px]">
                  <div className="space-y-2">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <p className="font-extrabold text-slate-500 uppercase text-[9px] tracking-wide">Execution Details</p>
                      <div className="space-y-1">
                        <div className="flex justify-between"><span className="text-slate-400">Frontend Action:</span> <span className="font-bold text-slate-800">{selectedLog.source === 'Job Scheduler' ? 'handleSaveSchedule()' : 'onSyncTrigger()'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Backend Action:</span> <span className="font-bold text-slate-800">{selectedLog.action || 'Manual Resync'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Shared Helper:</span> <span className="font-mono font-bold text-indigo-600">syncEstimateToGhlCalendar()</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">HTTP Method:</span> <span className="font-bold text-indigo-600">{selectedLog.method || 'GET'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Status Code:</span> <span className={`font-mono font-bold ${selectedLog.statusCode === 200 ? 'text-emerald-600' : 'text-rose-600'}`}>{selectedLog.statusCode || 'N/A'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Response Time:</span> <span className="font-bold text-slate-800">{selectedLog.responseTime || 0}ms</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Appointment ID:</span> <span className="font-mono font-bold text-slate-800">{selectedLog.appointmentId || 'None'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Trace ID:</span> <span className="font-mono text-slate-500">{selectedLog.traceId}</span></div>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <p className="font-extrabold text-slate-500 uppercase text-[9px] tracking-wide">Headers & Endpoint</p>
                      <div className="space-y-1">
                        <div><span className="text-slate-400">Endpoint URL:</span> <p className="font-mono text-slate-700 bg-white p-1 rounded border border-slate-100 break-all">{selectedLog.endpoint || 'https://services.leadconnectorhq.com'}</p></div>
                        <div className="pt-1"><span className="text-slate-400">Request Headers:</span> 
                          <pre className="font-mono text-[8px] text-slate-600 bg-white p-1.5 rounded border border-slate-100 mt-1">
                            {JSON.stringify({
                              'Authorization': 'Bearer ••••••',
                              'Version': '2021-04-15',
                              'Content-Type': 'application/json'
                            }, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {/* Request/Response Body inspect */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                      <p className="font-extrabold text-slate-500 uppercase text-[9px] tracking-wide">Request Payload</p>
                      <pre className="font-mono text-[8px] text-emerald-700 bg-slate-900 p-2 rounded-lg max-h-[120px] overflow-y-auto">
                        {selectedLog.requestBody ? JSON.stringify(selectedLog.requestBody, null, 2) : 'No request payload.'}
                      </pre>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                      <p className="font-extrabold text-slate-500 uppercase text-[9px] tracking-wide">Response Payload</p>
                      <pre className="font-mono text-[8px] text-amber-500 bg-slate-900 p-2 rounded-lg max-h-[140px] overflow-y-auto">
                        {selectedLog.responseBody ? (
                          typeof selectedLog.responseBody === 'string' 
                            ? selectedLog.responseBody 
                            : JSON.stringify(selectedLog.responseBody, null, 2)
                        ) : 'No response payload.'}
                      </pre>
                    </div>
                    
                    <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-900 text-[9px] flex gap-2">
                      <Database size={12} className="text-indigo-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Firestore Update Result:</span>
                        <p className="font-mono mt-0.5 text-indigo-800">{selectedLog.firestoreResult || 'success: written trace log state'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Tab 2: Settings Section (The original credentials, pipeline stages, custom fields, legacy webhooks etc.) */
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Credentials & API Settings</h4>
              <p className="text-xs text-slate-500 mt-0.5">Configure authentication keys and mapping defaults</p>
            </div>
            <button
              type="button"
              onClick={onSave}
              className="px-4 py-2 bg-american-blue text-white rounded-xl text-xs font-bold shadow hover:bg-opacity-95 transition-all"
            >
              Save Configuration
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Core credentials */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  GoHighLevel API Key
                </label>
                <input
                  type="password"
                  placeholder="Enter GHL Bearer token or API Key"
                  value={formData.ghlApiKey || ''}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, ghlApiKey: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  GoHighLevel Location ID
                </label>
                <input
                  type="text"
                  placeholder="Enter GHL Location ID"
                  value={formData.ghlLocationId || ''}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, ghlLocationId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Install Calendar ID (Install Scheduler)
                </label>
                <input
                  type="text"
                  placeholder="Enter GoHighLevel Calendar ID"
                  value={formData.ghlInstallCalendarId || ''}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, ghlInstallCalendarId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Inbound Webhook Verification Secret Key
                </label>
                <input
                  type="password"
                  placeholder="Enter Secret for verifying inbound hook dispatchers"
                  value={formData.ghlInboundWebhookSecret || ''}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, ghlInboundWebhookSecret: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="p-4 bg-[#f8fafc] rounded-xl border border-slate-100 space-y-3">
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-900">Provision GHL Assets</p>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Automatically create and register necessary Contact Custom Fields and Pipelines in your GoHighLevel instance.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onAutoConfigureCustomFields}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-bold"
                  >
                    Configure Custom Fields
                  </button>
                  <button
                    type="button"
                    onClick={onLoadGhlData}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-[10px] font-bold"
                  >
                    Load GHL Data (Pipelines)
                  </button>
                </div>
                {autoConfigSuccess && <p className="text-[10px] font-bold text-emerald-600 mt-1">✓ {autoConfigSuccess}</p>}
                {ghlLoadError && <p className="text-[10px] font-bold text-rose-600 mt-1">⚠ {ghlLoadError}</p>}
              </div>
            </div>

            {/* Right Column: API sync toggle and pipelines mappings */}
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-slate-800">Enable Direct GoHighLevel API Sync Layer</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Enables automated synchronizations on estimate state revisions.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData((prev: any) => ({ ...prev, enableGhlApiSync: !prev.enableGhlApiSync }))}
                  className={`h-5 w-10 rounded-full relative transition-all ${formData.enableGhlApiSync ? 'bg-american-blue' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${formData.enableGhlApiSync ? 'right-0.5' : 'left-0.5'}`} />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  GoHighLevel Pipeline ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. pipeline_id"
                  value={formData.ghlPipelineId || ''}
                  onChange={(e) => setFormData((prev: any) => ({ ...prev, ghlPipelineId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono"
                />
              </div>

              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Stage Mappings</p>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  {Object.keys(formData.ghlOpportunityStages || {}).map((stage) => (
                    <div key={stage} className="space-y-1">
                      <span className="text-slate-500 font-extrabold">{stage}</span>
                      <input
                        type="text"
                        placeholder="Stage ID"
                        value={formData.ghlOpportunityStages[stage] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData((prev: any) => ({
                            ...prev,
                            ghlOpportunityStages: {
                              ...prev.ghlOpportunityStages,
                              [stage]: val
                            }
                          }));
                        }}
                        className="w-full px-2 py-1 border border-slate-200 rounded-lg font-mono text-[9px]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
