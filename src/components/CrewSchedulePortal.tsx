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

  // Check if selection overlaps with any blackout date
  const getOverlapWarning = () => {
    if (!chosenStartDate || !scheduleData || !scheduleData.events) return null;
    
    const startD = new Date(chosenStartDate);
    const endD = new Date(chosenStartDate);
    endD.setDate(endD.getDate() + Number(chosenDuration));
    
    const pStartStr = startD.toISOString().split('T')[0];
    const pEndStr = endD.toISOString().split('T')[0];
    const pStart = new Date(pStartStr).getTime();
    const pEnd = new Date(pEndStr).getTime();

    let hasOverlap = false;

    scheduleData.events.forEach((ev: any) => {
      const isBlackout = ev.eventType === 'blackout' || ev.type === 'blackout';
      if (isBlackout) {
        const bStartStr = ev.start.split('T')[0];
        let bEndStr = (ev.end || ev.start).split('T')[0];
        if (bStartStr === bEndStr) {
          const d = new Date(bStartStr);
          d.setDate(d.getDate() + 1);
          bEndStr = d.toISOString().split('T')[0];
        }

        const bs = new Date(bStartStr).getTime();
        const be = new Date(bEndStr).getTime();

        if ((pStart < be) && (bs < pEnd)) {
          hasOverlap = true;
        }
      }
    });

    if (hasOverlap) {
      return "Warning: The selected dates overlap with a blocked blackout date. Please choose alternative dates.";
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
                    className={cn(
                      "aspect-square p-1 sm:p-2 rounded-xl flex flex-col justify-between items-center relative transition-colors font-mono font-medium border border-[#13233B]/20 text-[10px] sm:text-xs",
                      isBlackout && "bg-amber-950/40 text-amber-500 border border-amber-900/30",
                      isInstallation && "bg-american-red/10 text-american-red border-american-red/10",
                      matchesSelection && "bg-emerald-950/40 text-emerald-400 border border-emerald-500/25",
                      !isBlackout && !isInstallation && !matchesSelection && "bg-[#030A14]/40 hover:bg-[#13233B] text-slate-300",
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
                ⚠️ {errorWarning}
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
                disabled={isSubmitting || !!errorWarning}
                className={cn(
                  "w-full py-4 text-xs font-black uppercase tracking-widest text-white shadow-xl hover:scale-105 active:scale-95 transition-all rounded-2xl flex items-center justify-center gap-2",
                  scheduleData.allowCrewDirectSchedule 
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-950/20" 
                    : "bg-american-blue hover:bg-[#13233B] shadow-american-blue/20",
                  (isSubmitting || !!errorWarning) && "opacity-50 hover:scale-100 cursor-not-allowed"
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

        {/* Footer */}
        <div className="py-6 text-center text-[10px] font-black uppercase tracking-[0.25em] text-[#444444] border-t border-american-blue/10">
          Lone Star Fence Works • Dispatch Operations Control • Secure Crew Link
        </div>

      </div>
    </div>
  );
}
