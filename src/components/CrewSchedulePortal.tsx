import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Calendar as CalendarIcon, Clock, MapPin, Hammer, AlertTriangle, Check, Loader2, RefreshCw, Eye, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { COMPANY_INFO } from '../constants';

export default function CrewSchedulePortal() {
  const [estimateId, setEstimateId] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Schedule Data
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Selection state
  const [chosenStartDate, setChosenStartDate] = useState('');
  const [chosenDuration, setChosenDuration] = useState('1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'manifest' | 'breakdown' | 'scope' | 'drawing'>('manifest');

  // Crew Confirmation Workflow States
  const [crewNotes, setCrewNotes] = useState('');
  const [proposingNewDate, setProposingNewDate] = useState(false);
  const [alternateStartDate, setAlternateStartDate] = useState('');
  const [alternateDuration, setAlternateDuration] = useState('1');

  // Load URL credentials
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let estId = params.get('estimateId') || params.get('id') || '';
    let tok = params.get('token') || '';

    // Check hash fallback if search is empty (e.g. from routing redirects)
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
      fetchSchedulePortal(estId, tok);
    } else {
      setError('Invalid Access Credentials. Secure token and Estimate ID are missing from the URL.');
      setLoading(false);
    }
  }, []);

  const fetchSchedulePortal = async (estId: string, tok: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/estimates/write?action=get-crew-schedule&estimateId=${estId}&token=${tok}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to retrieve crew scheduling portal.');
      }
      setScheduleData(data);
      if (data.scheduledStartDate) {
        setChosenStartDate(data.scheduledStartDate);
      } else if (data.crewRequestedStartDate) {
        setChosenStartDate(data.crewRequestedStartDate);
      } else {
        // Default to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setChosenStartDate(tomorrow.toISOString().split('T')[0]);
      }
      setChosenDuration(String(data.crewRequestedDuration || data.installDuration || 1));
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosenStartDate) {
      setSubmitError('Please select a valid start date.');
      return;
    }
    if (Number(chosenDuration) <= 0) {
      setSubmitError('Duration must be 1 day or longer.');
      return;
    }

    const conflict = getOverlapWarning();
    if (conflict) {
      setSubmitError(`Schedule Conflict: ${conflict.date} is already occupied by ${conflict.title}. Please choose alternative dates.`);
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setSubmitSuccess(false);

    try {
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'update-crew-install-schedule',
          estimateId,
          token,
          scheduledStartDate: chosenStartDate,
          installDuration: Number(chosenDuration)
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to set installation schedule.');
      }

      setSubmitSuccess(true);
      // Reload schedule data to update busy calendars
      await fetchSchedulePortal(estimateId, token);
      
      setTimeout(() => {
        setSubmitSuccess(false);
      }, 5000);
    } catch (err: any) {
      setSubmitError(err?.message || String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmInstall = async () => {
    setIsSubmitting(true);
    setSubmitError('');
    setSubmitSuccess(false);

    try {
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'crew-confirm-install',
          estimateId,
          token,
          notes: crewNotes
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to confirm installation date.');
      }

      setSubmitSuccess(true);
      await fetchSchedulePortal(estimateId, token);
    } catch (err: any) {
      setSubmitError(err?.message || String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestAlternateDate = async () => {
    const conflict = getOverlapWarning(alternateStartDate, Number(alternateDuration));
    if (conflict) {
      setSubmitError(`Schedule Conflict: ${conflict.date} is already occupied by ${conflict.title}. Please choose alternative dates.`);
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setSubmitSuccess(false);

    try {
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'crew-request-alternative-date',
          estimateId,
          token,
          requestedStartDate: alternateStartDate,
          duration: Number(alternateDuration),
          notes: crewNotes
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to submit date proposal.');
      }

      setSubmitSuccess(true);
      setProposingNewDate(false);
      await fetchSchedulePortal(estimateId, token);
    } catch (err: any) {
      setSubmitError(err?.message || String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper functions for Calendar Logic
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const days = [];
    
    // Add empty slots for days before the 1st
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    // Add real days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };

  const checkDayStatus = (date: Date | null) => {
    if (!date || !scheduleData || !scheduleData.events) return { isBlackout: false, isInstallation: false, matchesSelection: false };
    
    const dateStr = date.toISOString().split('T')[0];
    const cleanTime = (dStr: string) => new Date(dStr).getTime();
    const t = date.getTime();

    // Check selection preview overlap
    let matchesSelection = false;
    if (chosenStartDate) {
      const startD = new Date(chosenStartDate);
      const endD = new Date(chosenStartDate);
      endD.setDate(endD.getDate() + Number(chosenDuration));
      
      const selectStart = new Date(startD.toISOString().split('T')[0]).getTime();
      const selectEnd = new Date(endD.toISOString().split('T')[0]).getTime();

      if (t >= selectStart && t < selectEnd) {
        matchesSelection = true;
      }
    }

    let isBlackout = false;
    let isInstallation = false;

    scheduleData.events.forEach((ev: any) => {
      const bStart = new Date(ev.start.split('T')[0]).getTime();
      let bEnd = new Date((ev.end || ev.start).split('T')[0]).getTime();
      
      // If start equals end, ensure single day is visible
      if (bStart === bEnd) {
        const d = new Date(ev.start);
        d.setDate(d.getDate() + 1);
        bEnd = new Date(d.toISOString().split('T')[0]).getTime();
      }

      if (t >= bStart && t < bEnd) {
        if (ev.eventType === 'blackout' || ev.type === 'blackout') {
          isBlackout = true;
        } else {
          isInstallation = true;
        }
      }
    });

    return { isBlackout, isInstallation, matchesSelection };
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleDayClick = (day: Date) => {
    const { isBlackout } = checkDayStatus(day);
    if (isBlackout) {
      setSubmitError("This date is blocked out for installation. Please choose another date.");
      return;
    }
    setSubmitError("");
    
    // Set scheduledStartDate formatted as YYYY-MM-DD (local time-zone safe)
    const year = day.getFullYear();
    const month = String(day.getMonth() + 1).padStart(2, '0');
    const dateNum = String(day.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${dateNum}`;
    
    setChosenStartDate(dateStr);
  };

  // Check if selection overlaps with any blackout date or other installation
  const getOverlapWarning = (startDate?: string, duration?: number) => {
    const sDate = startDate || chosenStartDate;
    const dDays = duration || Number(chosenDuration);

    if (!sDate || !scheduleData || !scheduleData.events) return null;
    
    const startD = new Date(sDate + 'T00:00:00');
    const requestedDates = [];
    for (let i = 0; i < dDays; i++) {
      const d = new Date(startD);
      d.setDate(startD.getDate() + i);
      requestedDates.push(d.toISOString().split('T')[0]);
    }

    for (const dStr of requestedDates) {
      const conflict = scheduleData.events.find((ev: any) => {
        // Skip current job if we are rescheduling
        if (ev.id === `install-${estimateId}`) return false;

        const bStartStr = ev.start.split('T')[0];
        let bEndStr = (ev.end || ev.start).split('T')[0];
        
        // Handle single day events
        if (bStartStr === bEndStr) {
          return dStr === bStartStr;
        }

        // Standard range check
        return dStr >= bStartStr && dStr <= bEndStr;
      });

      if (conflict) {
        const isBlackout = conflict.eventType === 'blackout' || conflict.type === 'blackout';
        return {
          date: dStr,
          title: conflict.title,
          isBlackout
        };
      }
    }

    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#010915] text-white">
        <div className="text-center space-y-4">
          <Loader2 size={40} className="text-american-red animate-spin mx-auto" />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Loading Crew Portal...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#010915] p-4 text-white">
        <div className="max-w-md w-full bg-white text-slate-900 rounded-[32px] p-8 border-t-8 border-american-red shadow-2xl text-center space-y-6">
          <div className="h-16 w-16 bg-red-50 text-american-red rounded-full flex items-center justify-center mx-auto text-3xl">
            ⚠️
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black uppercase tracking-tight text-american-blue">Portal Access Denied</h2>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{error}</p>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            This scheduling route is securely hashed. Please refer back to the exact Labor Contract email link sent to your crew.
          </p>
        </div>
      </div>
    );
  }

  const calendarDays = generateCalendarDays();
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const errorWarning = getOverlapWarning();

  return (
    <div className="min-h-screen bg-[#060E1A] text-slate-100 font-sans p-4 sm:p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Top Header Grid */}
        <div className="bg-gradient-to-r from-american-blue to-[#0E1B30] p-6 sm:p-8 rounded-[32px] border-2 border-american-blue/20 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute right-0 top-0 h-40 w-40 bg-american-red/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            <div className="h-14 w-14 rounded-2xl bg-american-red flex items-center justify-center text-white shadow-lg shrink-0">
              <Hammer size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black tracking-[0.25em] text-american-red uppercase">
                Lone Star Fence Works
              </p>
              <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                Crew Portal • Install Dispatch
              </h1>
              <p className="text-xs text-slate-400 mt-1 flex items-center justify-center sm:justify-start gap-1">
                <ShieldCheck size={14} className="text-emerald-500 inline" /> Security Token Active
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-[#030A14] px-5 py-3 rounded-2xl border border-american-blue/20">
            <div className="text-right">
              <span className="text-[9px] text-[#888888] uppercase block tracking-wider font-extrabold">Active Subcontractor</span>
              <span className="text-sm text-slate-100 font-black">{scheduleData.crewEmailRecipient?.split('@')[0] || 'Scheduled Crew'}</span>
            </div>
          </div>
        </div>

        {/* Info Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#0A1424] p-5 rounded-2xl border border-american-blue/10 flex items-center gap-4">
            <div className="h-10 w-10 bg-american-blue/10 text-american-red rounded-xl flex items-center justify-center shrink-0">
              <MapPin size={20} />
            </div>
            <div>
              <span className="text-[9px] text-[#888888] uppercase block font-extrabold tracking-wider">Jobsite Address</span>
              <span className="text-xs font-bold text-slate-200 line-clamp-1">{scheduleData.jobAddress}</span>
            </div>
          </div>

          <div className="bg-[#0A1424] p-5 rounded-2xl border border-american-blue/10 flex items-center gap-4">
            <div className="h-10 w-10 bg-american-blue/10 text-american-red rounded-xl flex items-center justify-center shrink-0">
              <Hammer size={20} />
            </div>
            <div>
              <span className="text-[9px] text-[#888888] uppercase block font-extrabold tracking-wider">Fence Specifications</span>
              <span className="text-xs font-bold text-slate-200 line-clamp-1">{scheduleData.fenceType}</span>
            </div>
          </div>

          <div className="bg-[#0A1424] p-5 rounded-2xl border border-american-blue/10 flex items-center gap-4">
            <div className="h-10 w-10 bg-american-blue/10 text-american-red rounded-xl flex items-center justify-center shrink-0">
              <Clock size={20} />
            </div>
            <div>
              <span className="text-[9px] text-[#888888] uppercase block font-extrabold tracking-wider">Total linear feet</span>
              <span className="text-xs font-bold text-slate-200 font-mono">{scheduleData.linearFeet} LF</span>
            </div>
          </div>

          <div className="bg-[#0A1424] p-5 rounded-2xl border border-american-blue/10 flex items-center gap-4">
            <div className="h-10 w-10 bg-american-blue/10 text-emerald-500 rounded-xl flex items-center justify-center shrink-0">
              <CalendarIcon size={20} />
            </div>
            <div>
              <span className="text-[9px] text-[#888888] uppercase block font-extrabold tracking-wider">Installation Schedule</span>
              <span className="text-xs font-black text-slate-200">
                {scheduleData.scheduledStartDate ? (
                  <span className="text-emerald-400 font-mono tracking-tight">{scheduleData.scheduledStartDate} ({scheduleData.installDuration}d)</span>
                ) : (
                  <span className="text-amber-400 font-black">Not Scheduled</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Schedule Mode Alert */}
        {scheduleData.crewScheduleRequestPending && (
          <div className="bg-amber-950/40 border-2 border-amber-500/20 text-amber-300 p-5 rounded-3xl flex items-center gap-4 animate-pulse">
            <AlertTriangle className="text-amber-400 shrink-0" size={24} />
            <div>
              <p className="text-xs font-black uppercase tracking-wider">Schedule Request Pending Admin Approval</p>
              <p className="text-xs text-amber-200/80 mt-1 font-medium">
                You have requested {scheduleData.crewRequestedStartDate} for {scheduleData.crewRequestedDuration} days. The admin team has been notified and will approve shortly.
              </p>
            </div>
          </div>
        )}

        {/* Pending Crew Confirmation Card */}
        {scheduleData.installStatus === 'Pending Crew Confirmation' && scheduleData.preferredInstallDate && (
          <div className="bg-[#11241E]/90 border-2 border-emerald-500/40 text-emerald-300 p-6 rounded-[32px] space-y-4">
            <div className="flex items-start gap-4">
              <ShieldCheck className="text-emerald-400 shrink-0 mt-1" size={24} />
              <div className="space-y-1">
                <p className="text-sm font-black uppercase tracking-wider text-emerald-100">CONFIRMATION REQUIRED: Preferred Install Slot Set</p>
                <p className="text-xs text-slate-300">
                  The client has booked their preferred installation key for <strong>{new Date(scheduleData.preferredInstallDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>. Please confirm your crew availability or submit a request for an alternate date.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-300">
                Crew Confirmation or Alternatives Notes (Optional)
              </label>
              <textarea
                value={crewNotes}
                onChange={(e) => setCrewNotes(e.target.value)}
                placeholder="Include access info, crew size, or alternate slot reasoning..."
                className="w-full bg-[#0A1424] border border-emerald-500/20 text-white rounded-2xl p-3 text-xs focus:ring-1 focus:ring-emerald-400 focus:outline-none"
                rows={2}
              />
            </div>

            {!proposingNewDate ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmInstall}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-[#0c1a30] font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? 'Confirming...' : 'Yes, Confirm Scheduled Date'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProposingNewDate(true);
                    if (!alternateStartDate) {
                      setAlternateStartDate(scheduleData.preferredInstallDate);
                    }
                  }}
                  className="px-6 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                >
                  Propose Alternate Date
                </button>
              </div>
            ) : (
              <div className="bg-[#1A1A10] p-4 rounded-2xl border border-amber-500/20 space-y-4">
                <p className="text-xs font-black uppercase tracking-wider text-amber-200">Propose Alternative Schedule Slot</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase font-bold text-slate-400">Proposed Start Date</label>
                    <input
                      type="date"
                      value={alternateStartDate}
                      onChange={(e) => setAlternateStartDate(e.target.value)}
                      className="w-full bg-[#0A1424] border border-slate-700 text-white p-2.5 rounded-lg text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase font-bold text-slate-400">Duration (Days)</label>
                    <select
                      value={alternateDuration}
                      onChange={(e) => setAlternateDuration(e.target.value)}
                      className="w-full bg-[#0A1424] border border-slate-700 text-white p-2.5 rounded-lg text-xs"
                    >
                      <option value="1">1 Day</option>
                      <option value="2">2 Days</option>
                      <option value="3">3 Days</option>
                      <option value="4">4 Days</option>
                      <option value="5">5 Days</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleRequestAlternateDate}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                  >
                    {isSubmitting ? 'Submitting proposal...' : 'Submit Proposed Date'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setProposingNewDate(false)}
                    className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Calendar Block (2/3 width) */}
          <div className="lg:col-span-2 bg-[#0A1424] p-6 sm:p-8 rounded-[32px] border border-american-blue/10 shadow-xl space-y-6">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-black uppercase tracking-tight text-white">Installation Calendar</h2>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mt-1">
                  Active schedules & blackout periods
                </p>
              </div>

              {/* Prev/Next Navigation */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={handlePrevMonth}
                  className="p-2 hover:bg-[#13233B] text-slate-300 hover:text-white rounded-xl border border-american-blue/10 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs font-black uppercase tracking-wider px-3 text-white">
                  {monthName}
                </span>
                <button 
                  onClick={handleNextMonth}
                  className="p-2 hover:bg-[#13233B] text-slate-300 hover:text-white rounded-xl border border-american-blue/10 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Grid Header days */}
            <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-black uppercase tracking-widest text-[#555555]">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

             {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-1.5 md:gap-2">
              {calendarDays.map((day, idx) => {
                if (!day) {
                  return <div key={`empty-${idx}`} className="aspect-square bg-american-blue/[0.01]" />;
                }

                const { isBlackout, isInstallation, matchesSelection } = checkDayStatus(day);
                const isToday = day.toDateString() === new Date().toDateString();

                return (
                  <div
                    key={idx}
                    onClick={() => day && handleDayClick(day)}
                    className={cn(
                      "aspect-square p-1 sm:p-2 rounded-xl flex flex-col justify-between items-center relative transition-all duration-200 font-mono font-medium border border-[#13233B]/20 text-[10px] sm:text-xs select-none",
                      day ? "cursor-pointer hover:border-american-blue/50" : "pointer-events-none",
                      isBlackout && "bg-amber-950/40 text-amber-500 border border-amber-900/40 cursor-not-allowed hover:bg-amber-950/60",
                      isInstallation && "bg-american-red/10 text-american-red border-american-red/10 hover:bg-american-red/20",
                      matchesSelection && "bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 ring-2 ring-emerald-500/50",
                      !isBlackout && !isInstallation && !matchesSelection && "bg-[#030A14]/40 hover:bg-[#13233B] hover:text-white text-slate-300",
                      isToday && "ring-2 ring-american-red/50 ring-offset-2 ring-offset-[#060E1A]"
                    )}
                  >
                    <span>{day.getDate()}</span>
                    
                    <div className="flex flex-col gap-0.5 w-full mt-1">
                      {isBlackout && (
                        <span className="text-[7px] font-black uppercase text-center block leading-none truncate tracking-tighter text-amber-500/80">Blocked</span>
                      )}
                      {isInstallation && (
                        <span className="text-[7px] font-black uppercase text-center block leading-none truncate tracking-tighter text-american-red">Busy</span>
                      )}
                      {matchesSelection && (
                        <span className="text-[7px] font-black uppercase text-center block leading-none truncate tracking-tighter text-emerald-400">Proposed</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend indicators */}
            <div className="pt-4 border-t border-american-blue/10 flex flex-wrap gap-4 text-[9px] font-black uppercase tracking-wider text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded bg-[#030A14] border border-[#13233B] inline-block" />
                <span>Available Date</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded bg-amber-950/40 border border-amber-900 inline-block" />
                <span>Blackout / Blocked date</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded bg-american-red/10 border border-american-red/30 inline-block" />
                <span>Other Crews Busy</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded bg-emerald-950/40 border border-emerald-500/30 inline-block" />
                <span>Chosen Schedule Window</span>
              </div>
            </div>

          </div>

          {/* Date Selector form (1/3 width) */}
          <div className="bg-[#0A1424] p-6 sm:p-8 rounded-[32px] border border-american-blue/10 shadow-xl space-y-6">
            <div>
              <h2 className="text-base font-black uppercase tracking-tight text-white">Select Installation Date</h2>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mt-1">
                Configure proposed job timeline
              </p>
            </div>

            {submitError && (
              <div className="p-4 bg-red-950/50 text-red-400 text-xs font-bold leading-relaxed rounded-xl border border-red-900/30">
                ⚠️ {submitError}
              </div>
            )}

            {errorWarning && (
              <div className="p-4 bg-yellow-950/50 text-yellow-500 text-xs font-bold leading-relaxed rounded-xl border border-yellow-900/30">
                ⚠️ Warning: The selected dates overlap with <strong>{errorWarning.title}</strong> on <strong>{errorWarning.date}</strong>. Only one installation is allowed per day.
              </div>
            )}

            {submitSuccess && (
              <div className="p-4 bg-emerald-950/50 text-emerald-400 text-xs font-bold leading-relaxed rounded-xl border border-emerald-900/30 flex items-center gap-3">
                <Check size={16} />
                <span>
                  {scheduleData.allowCrewDirectSchedule 
                    ? "Schedule direct entry completed! Calendar synced."
                    : "Schedule request successfully submitted to admin!"}
                </span>
              </div>
            )}

            <form onSubmit={handleUpdateSchedule} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-[#888888] tracking-wider">Start Date</label>
                <input
                  type="date"
                  value={chosenStartDate}
                  onChange={(e) => setChosenStartDate(e.target.value)}
                  className="w-full text-xs font-mono font-bold bg-[#030A14] text-white border-2 border-american-blue/10 focus:border-american-blue rounded-xl px-4 py-3 focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-[#888888] tracking-wider">Installation Duration</label>
                <select
                  value={chosenDuration}
                  onChange={(e) => setChosenDuration(e.target.value)}
                  className="w-full text-xs font-bold bg-[#030A14] text-white border-2 border-american-blue/10 focus:border-american-blue rounded-xl px-4 py-3 focus:outline-none transition-colors"
                >
                  <option value="1">1 Day</option>
                  <option value="2">2 Days</option>
                  <option value="3">3 Days</option>
                  <option value="4">4 Days</option>
                  <option value="5">5 Days</option>
                  <option value="7">1 Week</option>
                </select>
              </div>

              {/* Range Preview */}
              {chosenStartDate && (
                <div className="p-4 bg-[#030A14] rounded-xl border border-american-blue/10 text-xs space-y-1.5 font-bold">
                  <div className="text-[9px] uppercase text-[#888888] tracking-widest font-extrabold">Final Proposed Window</div>
                  <div className="text-slate-200">
                    {new Date(chosenStartDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    <span className="text-[#888888] mx-1">to</span>
                    {(() => {
                      const d = new Date(chosenStartDate);
                      d.setDate(d.getDate() + Number(chosenDuration));
                      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                    })()}
                  </div>
                  <div className="text-[10px] text-american-red font-black uppercase tracking-wider">
                    {chosenDuration} DAY TIMELINE
                  </div>
                </div>
              )}

              {/* Submit Dispatch */}
              <button
                type="submit"
                disabled={isSubmitting || !!errorWarning || !chosenStartDate}
                className={cn(
                  "w-full py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl hover:scale-105 active:scale-95 transition-all rounded-2xl flex items-center justify-center gap-2",
                  scheduleData.allowCrewDirectSchedule 
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-950/20" 
                  : "bg-american-blue hover:bg-[#13233B] shadow-american-blue/20",
                  (isSubmitting || !!errorWarning || !chosenStartDate) && "opacity-50 hover:scale-100 cursor-not-allowed"
                )}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Updating Calendar...
                  </>
                ) : scheduleData.allowCrewDirectSchedule ? (
                  <>
                    <CalendarIcon size={16} />
                    Confirm & Publish Schedule
                  </>
                ) : (
                  <>
                    <Clock size={16} />
                    Submit Schedule Request
                  </>
                )}
              </button>
            </form>

            <div className="p-4 bg-[#030A14] rounded-2xl border border-american-blue/10 text-[10px] text-slate-500 leading-relaxed font-bold">
              <span className="text-american-red uppercase">Subcontractor Rules & Disclaimer:</span>
              <p className="mt-1">
                You are currently accessing a single-job scheduling module. Dates submitted in "Direct Scheduling" mode instantly block other crews. Workmanship guarantees for painting/staining must strictly fall inside the 30-day limits.
              </p>
            </div>

          </div>

        </div>

        {/* LABOR PACKAGE SECTIONS BELOW TIMELINE */}
        {scheduleData.laborContractSnapshot && (
          <div className="bg-[#0A1424] p-6 sm:p-8 rounded-[32px] border border-american-blue/10 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-american-blue/10 pb-4">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                  <ShieldCheck className="text-emerald-500 animate-pulse" size={22} />
                  Secure Labor Package & SOW
                </h2>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mt-1">
                  Full project drawings, specifications, and crew payout schedules
                </p>
              </div>

              {/* Dynamic Tabs */}
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('manifest')}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 border",
                    activeTab === 'manifest'
                      ? "bg-[#D92D20] text-white border-[#D92D20] shadow-md shadow-[#D92D20]/20"
                      : "bg-[#030A14]/40 text-slate-300 border-[#13233B]/40 hover:bg-[#13233B]"
                  )}
                >
                  Aggregate Manifest
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('breakdown')}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 border",
                    activeTab === 'breakdown'
                      ? "bg-[#D92D20] text-white border-[#D92D20] shadow-md shadow-[#D92D20]/20"
                      : "bg-[#030A14]/40 text-slate-300 border-[#13233B]/40 hover:bg-[#13233B]"
                  )}
                >
                  Run Breakdown
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('scope')}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 border",
                    activeTab === 'scope'
                      ? "bg-[#D92D20] text-white border-[#D92D20] shadow-md shadow-[#D92D20]/20"
                      : "bg-[#030A14]/40 text-slate-300 border-[#13233B]/40 hover:bg-[#13233B]"
                  )}
                >
                  Scope of Work
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('drawing')}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 border",
                    activeTab === 'drawing'
                      ? "bg-[#D92D20] text-white border-[#D92D20] shadow-md shadow-[#D92D20]/20"
                      : "bg-[#030A14]/40 text-slate-300 border-[#13233B]/40 hover:bg-[#13233B]"
                  )}
                >
                  Layout Drawing
                </button>
              </div>
            </div>

            {/* TAB CONTENTS */}
            <div className="pt-2">
              
              {/* 1. AGGREGATE MANIFEST */}
              {activeTab === 'manifest' && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-[#D92D20] animate-ping" />
                    <p className="text-xs font-bold text-slate-300 uppercase">Project Payroll Summary Table</p>
                  </div>
                  
                  <div className="overflow-x-auto rounded-2xl border border-american-blue/10 bg-[#030A14]/20">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead>
                        <tr className="bg-[#030A14]/60 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-american-blue/10">
                          <th className="px-5 py-4">Operation / Task</th>
                          <th className="px-5 py-4 text-center">Volume</th>
                          <th className="px-5 py-4 text-right">Net Subpayout</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-american-blue/5">
                        {Array.isArray(scheduleData.laborContractSnapshot.aggregateLaborManifest) && 
                         scheduleData.laborContractSnapshot.aggregateLaborManifest.length > 0 ? (
                          scheduleData.laborContractSnapshot.aggregateLaborManifest.map((item: any, i: number) => (
                            <tr key={i} className="text-xs text-slate-300 hover:bg-[#13233B]/30 font-medium transition-colors">
                              <td className="px-5 py-4 flex items-center gap-2.5">
                                <div className="h-1.5 w-1.5 rounded-full bg-[#D92D20]/80" />
                                {item.name}
                              </td>
                              <td className="px-5 py-4 text-center">
                                <span className="px-2.5 py-1 bg-american-blue/20 text-slate-200 rounded-full text-[10px] font-black font-mono">
                                  {item.qty} {item.unit}
                                </span>
                              </td>
                              <td className="px-5 py-4 text-right font-bold text-[#D92D20] font-mono">
                                ${Number(item.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="px-5 py-8 text-center text-xs text-slate-500 font-bold">
                              No aggregate labor tasks found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="bg-american-blue/20 border-t-2 border-american-blue/20">
                          <td colSpan={2} className="px-5 py-4 text-right font-black uppercase tracking-widest text-[10px] text-slate-300">Total Direct Labor Payout</td>
                          <td className="px-5 py-4 text-right font-black text-[#D92D20] text-base font-mono">
                            ${Number(scheduleData.laborContractSnapshot.totalDirectLaborPayout || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* 2. RUN BREAKDOWN */}
              {activeTab === 'breakdown' && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-[#D92D20]" />
                    <p className="text-xs font-bold text-slate-300 uppercase">Detailed Run-by-Run Specifications</p>
                  </div>

                  {Array.isArray(scheduleData.laborContractSnapshot.laborRuns) && 
                   scheduleData.laborContractSnapshot.laborRuns.length > 0 ? (
                    <div className="space-y-6">
                      {scheduleData.laborContractSnapshot.laborRuns.map((run: any, idx: number) => (
                        <div key={idx} className="bg-[#030A14]/30 rounded-2xl border border-american-blue/15 p-5 space-y-4">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-american-blue/10 pb-3">
                            <div>
                              <span className="text-[9px] font-black uppercase tracking-widest text-[#D92D20] block">Run #{run.runId}</span>
                              <h3 className="text-sm font-black text-slate-200 mt-0.5">{run.label || `Specification ${idx + 1}`}</h3>
                            </div>
                            <div className="flex flex-wrap gap-2 text-[10px] font-bold font-mono">
                              <span className="px-2.5 py-1 bg-[#13233B] text-slate-200 rounded-lg">Style: {run.style}</span>
                              <span className="px-2.5 py-1 bg-[#13233B] text-slate-200 rounded-lg">{run.linearFeet} LF</span>
                              <span className="px-2.5 py-1 bg-[#13233B] text-slate-200 rounded-lg">{run.height}ft High</span>
                              {run.postCount !== undefined && (
                                <span className="px-2.5 py-1 bg-[#13233B] text-slate-200 rounded-lg">{run.postCount} Posts</span>
                              )}
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse font-sans min-w-[400px]">
                              <thead>
                                <tr className="text-[9px] font-black uppercase text-slate-400 border-b border-white/5 bg-white/[0.02]">
                                  <th className="px-4 py-2.5">Task Description</th>
                                  <th className="px-4 py-2.5 text-center">Volume</th>
                                  <th className="px-4 py-2.5 text-right">Rate</th>
                                  <th className="px-4 py-2.5 text-right">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5 font-medium text-slate-300">
                                {Array.isArray(run.laborItems) && run.laborItems.map((item: any, i: number) => (
                                  <tr key={i} className="hover:bg-white/[0.01]">
                                    <td className="px-4 py-3 text-slate-300 text-xs font-semibold">{item.name}</td>
                                    <td className="px-4 py-3 text-center text-slate-400 font-bold font-mono">{item.qty} {item.unit}</td>
                                    <td className="px-4 py-3 text-right text-slate-400 font-mono">${Number(item.rate).toFixed(2)}</td>
                                    <td className="px-4 py-3 text-right text-slate-200 font-black font-mono">${Number(item.total).toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-500 font-bold border-2 border-dashed border-american-blue/10 rounded-2xl">
                      Detailed run breakdowns are not specified for this project layout.
                    </div>
                  )}
                </div>
              )}

              {/* 3. SCOPE OF WORK */}
              {activeTab === 'scope' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 border-b border-american-blue/15 pb-2">
                    <div className="h-2 w-2 rounded-full bg-[#D92D20]" />
                    <p className="text-xs font-bold text-slate-300 uppercase">Subcontractor Scope of Work Procedures</p>
                  </div>
                  <div className="bg-[#030A14]/30 rounded-2xl border border-american-blue/15 p-6 text-sm text-slate-300 font-medium leading-relaxed whitespace-pre-wrap font-mono prose prose-invert max-w-none max-h-[500px] overflow-y-auto">
                    {scheduleData.laborContractSnapshot.scopeOfWorkHtmlOrText || "Standard installation procedures apply."}
                  </div>
                </div>
              )}

              {/* 4. LAYOUT DRAWING */}
              {activeTab === 'drawing' && (
                <div className="space-y-4 text-center">
                  <div className="flex items-center gap-3 border-b border-american-blue/15 pb-2 text-left">
                    <div className="h-2 w-2 rounded-full bg-[#D92D20]" />
                    <p className="text-xs font-bold text-slate-300 uppercase">Project Layout & Dimension Drawing</p>
                  </div>
                  
                  {scheduleData.laborContractSnapshot.drawingUrl ? (
                    <div className="bg-[#030A14]/30 rounded-2xl border border-american-blue/15 p-6 space-y-4">
                      {scheduleData.laborContractSnapshot.drawingMimeType?.includes('pdf') || 
                       scheduleData.laborContractSnapshot.drawingUrl?.toLowerCase().includes('.pdf') ? (
                        <div className="p-8 text-center">
                          <Eye className="mx-auto text-[#D92D20] mb-3" size={40} />
                          <p className="font-bold text-slate-200 text-sm mb-1">LAYOUT DESIGN (PDF Reference)</p>
                          <p className="text-xs text-slate-400 mb-4">{scheduleData.laborContractSnapshot.drawingFileName || 'layout.pdf'}</p>
                          <a 
                            href={scheduleData.laborContractSnapshot.drawingUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            className="inline-block px-6 py-3 bg-[#13233B] hover:bg-[#1C3254] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                          >
                            Open Reference PDF Drawing
                          </a>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <img 
                            src={scheduleData.laborContractSnapshot.drawingUrl} 
                            referrerPolicy="no-referrer" 
                            alt="Project site plan or layout drawing" 
                            className="max-h-[380px] w-auto max-w-full rounded-xl mx-auto border-4 border-[#13233B]/40 shadow-xl"
                          />
                          <p className="text-xs text-slate-400 font-bold">
                            File: {scheduleData.laborContractSnapshot.drawingFileName || 'Layout_Plan_Drawing.jpg'}
                          </p>
                          <a 
                            href={scheduleData.laborContractSnapshot.drawingUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            className="inline-block px-6 py-2.5 bg-[#13233B] hover:bg-[#1C3254] text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all"
                          >
                            View Drawing in New Tab
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-12 text-center text-xs text-slate-500 font-bold border-2 border-dashed border-american-blue/10 rounded-2xl">
                      No layout dimension drawings have been uploaded for this project yet.
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        )}

        {/* Footer */}
        <div className="py-6 text-center text-[10px] font-black uppercase tracking-[0.25em] text-[#444444] border-t border-american-blue/10">
          Lone Star Fence Works • Dispatch Operations Control • Secure Crew Link
        </div>

      </div>
    </div>
  );
}
