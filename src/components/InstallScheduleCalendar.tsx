import React, { useState, useEffect } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  addDays,
  parseISO,
  isWithinInterval
} from 'date-fns';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  User, 
  Clock, 
  MapPin,
  AlertCircle,
  Briefcase,
  CheckCircle2
} from 'lucide-react';
import { ScheduleEvent, SavedEstimate, SchedulerConfig } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const parseLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  return new Date(dateStr);
};

interface InstallScheduleCalendarProps {
  mode: 'admin' | 'crew';
  events: ScheduleEvent[];
  scheduledEstimates: SavedEstimate[];
  selectedDate: Date | null;
  onDateClick: (date: Date) => void;
  unavailableInstallDays?: string[];
  config?: SchedulerConfig;
  excludeEstimateId?: string;
  selectedDuration?: number;
  highlightedEstimateId?: string; // e.g. current job being rescheduled
}

export default function InstallScheduleCalendar({
  mode,
  events = [],
  scheduledEstimates = [],
  selectedDate,
  onDateClick,
  unavailableInstallDays = ['Sunday'],
  config = { viewFilter: 'both', appointmentDuration: 60, startHour: 8, endHour: 17 },
  excludeEstimateId,
  selectedDuration = 1,
  highlightedEstimateId
}: InstallScheduleCalendarProps) {
  console.log("[DEBUG] InstallScheduleCalendar - CHECKPOINT A: Component mounted");
  console.log("Props received:", { mode, eventsCount: events?.length, estimatesCount: scheduledEstimates?.length, selectedDate, selectedDuration, highlightedEstimateId });

  const [currentDate, setCurrentDate] = useState(() => {
    try {
      return new Date();
    } catch (e) {
      console.error("Failed to initialize currentDate", e);
      return new Date();
    }
  });
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<'grid' | 'list'>('list');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  console.log("[DEBUG] InstallScheduleCalendar - CHECKPOINT B: Building calendar model");
  
  let monthStart, monthEnd, startDate, endDate, calendarDays: Date[] = [];
  try {
    monthStart = startOfMonth(currentDate);
    monthEnd = endOfMonth(monthStart);
    startDate = startOfWeek(monthStart);
    endDate = endOfWeek(monthEnd);

    calendarDays = eachDayOfInterval({
      start: startDate,
      end: endDate,
    });
  } catch (e) {
    console.error("Error calculating calendar intervals", e);
  }

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const getDayItems = (day: Date) => {
    try {
      if (!day || isNaN(day.getTime())) {
        console.error("INVALID DATE passed to getDayItems", day);
        return [];
      }
      const dateKey = format(day, 'yyyy-MM-dd');
      
      // Filter events
      const dayEvents = (events || []).filter(e => {
        if (!e || !e.startDate) return false;
        if (excludeEstimateId && e.estimateId === excludeEstimateId) return false;
        const start = e.startDate;
        const end = e.endDate || start;
        return dateKey >= start && dateKey <= end;
      });

      // Filter jobs
      const dayJobs = (scheduledEstimates || []).filter(est => {
        if (!est || !est.scheduledStartDate) return false;
        if (excludeEstimateId && est.id === excludeEstimateId) return false;
        
        const start = est.scheduledStartDate;
        let end = est.scheduledEndDate;
        const durationNum = Number(est.scheduledDuration || 1);
        
        if (!end && durationNum && durationNum > 1) {
          try {
            const d = parseLocalDate(start.substring(0, 10));
            if (!isNaN(d.getTime())) {
              d.setDate(d.getDate() + (durationNum - 1));
              end = format(d, 'yyyy-MM-dd');
            }
          } catch (e) {
            console.error("Error calculating end date for estimate", est.id, e);
          }
        }
        const finalEnd = end || start;
        const startStr = start.substring(0, 10);
        const endStr = finalEnd.substring(0, 10);
        return dateKey >= startStr && dateKey <= endStr;
      });

      return [
        ...dayEvents.map(e => ({
          id: e.id,
          type: e.type,
          title: e.type === 'Job' ? ((e as any)?.customerName || e.title) : e.title,
          isJob: false,
          raw: e
        })),
        ...dayJobs.map(j => ({
          id: j.id,
          type: 'Job' as const,
          title: j.customerName || (j as any).contactName || (j as any).jobTitle || 'Installation Scheduled',
          isJob: true,
          raw: j,
          city: j.customerCity,
          crew: j.assignedCrew
        }))
      ];
    } catch (e) {
      console.error("Error in getDayItems for day", day, e);
      return [];
    }
  };

  const isSelectedRange = (day: Date) => {
    try {
      if (!selectedDate || isNaN(selectedDate.getTime()) || isNaN(day.getTime())) return false;
      const end = addDays(selectedDate, (selectedDuration || 1) - 1);
      return isWithinInterval(day, { start: selectedDate, end });
    } catch (e) {
      return false;
    }
  };

  const isCurrentJobDate = (day: Date) => {
    try {
      if (!highlightedEstimateId || isNaN(day.getTime())) return false;
      const job = (scheduledEstimates || []).find(j => j.id === highlightedEstimateId);
      if (!job || !job.scheduledStartDate) return false;
      
      const start = parseISO(job.scheduledStartDate.substring(0, 10));
      if (isNaN(start.getTime())) return false;
      
      const duration = Number(job.scheduledDuration || 1);
      const end = addDays(start, duration - 1);
      
      return isWithinInterval(day, { start, end });
    } catch (e) {
      return false;
    }
  };

  const renderGrid = () => {
    console.log("[DEBUG] InstallScheduleCalendar - CHECKPOINT F: Rendering desktop calendar");
    return (
      <div className="grid grid-cols-7 border-t border-l border-blue-900/5">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="py-4 text-center text-[10px] font-black text-american-blue/40 uppercase tracking-widest border-r border-b border-blue-900/5 bg-gray-50/50">
            {day}
          </div>
        ))}
        {calendarDays.map((day, i) => {
          try {
            if (!day || isNaN(day.getTime())) return null;
            const dateKey = format(day, 'yyyy-MM-dd');
            const items = getDayItems(day);
            const isToday = isSameDay(day, new Date());
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isUnavailable = (unavailableInstallDays || []).includes(format(day, 'EEEE'));
            const isBlackout = (events || []).some(e => e.type === 'Blackout' && e.startDate === dateKey);
            const isOccupied = items.some(item => item.type === 'Job');
            const isSelected = isSelectedRange(day);
            const isCurrentJob = isCurrentJobDate(day);

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => onDateClick(day)}
                disabled={isUnavailable || isBlackout}
                className={cn(
                  "min-h-[100px] p-2 border-r border-b border-blue-900/5 transition-all text-left relative group",
                  !isCurrentMonth && "opacity-20",
                  isToday ? "bg-blue-50/30" : "bg-white",
                  (isUnavailable || isBlackout) ? "cursor-not-allowed bg-slate-900/[0.03]" : "hover:bg-blue-50/50",
                  isSelected && "ring-2 ring-inset ring-american-blue bg-blue-50/50 z-10",
                  isCurrentJob && !isSelected && "bg-orange-50/30"
                )}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={cn(
                    "text-sm font-black transition-colors",
                    isToday ? "text-american-red" : isCurrentMonth ? "text-american-blue" : "text-american-blue/40",
                    isSelected && "text-american-blue"
                  )}>
                    {format(day, 'd')}
                  </span>
                  {isBlackout && <AlertCircle size={12} className="text-american-red" />}
                  {isUnavailable && <span className="text-[8px] font-black text-american-red/40 uppercase">Closed</span>}
                </div>

                <div className="space-y-1 overflow-hidden">
                  {items.map((item, idx) => {
                    const isJob = item.type === 'Job';
                    const isBusy = item.type === 'Busy';
                    const isEstimate = item.type === 'Estimate';
                    
                    return (
                      <div
                        key={`${item.id}-${idx}`}
                        className={cn(
                          "text-[9px] px-1.5 py-1 rounded-sm font-bold leading-tight shadow-xs w-full whitespace-normal break-words",
                          isJob ? "bg-american-blue text-white" :
                          isBusy ? "bg-purple-500 text-white" :
                          isEstimate ? "bg-amber-100 text-amber-800 border border-amber-200" :
                          "bg-gray-100 text-gray-700"
                        )}
                      >
                        {item.title}
                      </div>
                    );
                  })}
                  {isSelected && !isOccupied && !isUnavailable && !isBlackout && (
                    <div className="text-[9px] px-1.5 py-0.5 rounded-sm font-black bg-american-blue/10 text-american-blue border border-american-blue/20 animate-pulse">
                      NEW SLOT
                    </div>
                  )}
                </div>
              </button>
            );
          } catch (e) {
            console.error("Error rendering grid day", day, e);
            return null;
          }
        })}
      </div>
    );
  };

  const renderList = () => {
    console.log("[DEBUG] InstallScheduleCalendar - CHECKPOINT G: Rendering mobile agenda");
    try {
      const listDays = eachDayOfInterval({
        start: monthStart,
        end: endOfMonth(addMonths(monthStart, 1))
      });

      return (
        <div className="space-y-3">
          {listDays.map(day => {
            try {
              if (!day || isNaN(day.getTime())) return null;
              const dateKey = format(day, 'yyyy-MM-dd');
              const items = getDayItems(day);
              const isToday = isSameDay(day, new Date());
              const isUnavailable = (unavailableInstallDays || []).includes(format(day, 'EEEE'));
              const isBlackout = (events || []).some(e => e.type === 'Blackout' && e.startDate === dateKey);
              const isSelected = isSelectedRange(day);
              const isCurrentJob = isCurrentJobDate(day);

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => onDateClick(day)}
                  disabled={isUnavailable || isBlackout}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left",
                    isSelected ? "bg-american-blue text-white border-american-blue shadow-lg scale-[1.02]" :
                    isToday ? "bg-white border-american-red/30 shadow-sm" :
                    (isUnavailable || isBlackout) ? "bg-gray-100/50 border-gray-200 opacity-60" :
                    "bg-white border-gray-100 shadow-xs hover:border-american-blue/30",
                    isCurrentJob && !isSelected && "border-orange-200 bg-orange-50/50"
                  )}
                >
                  <div className={cn(
                    "flex flex-col items-center justify-center w-12 h-12 rounded-xl font-black shrink-0",
                    isSelected ? "bg-white/20" : isToday ? "bg-american-red/10 text-american-red" : "bg-gray-50 text-american-blue"
                  )}>
                    <span className="text-[10px] uppercase tracking-tighter leading-none">{format(day, 'MMM')}</span>
                    <span className="text-lg leading-none mt-0.5">{format(day, 'd')}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "text-xs font-black uppercase tracking-widest",
                        isSelected ? "text-white" : "text-american-blue"
                      )}>
                        {format(day, 'EEEE')}
                      </span>
                      {isToday && <span className="px-1.5 py-0.5 bg-american-red text-[8px] text-white font-black rounded uppercase">Today</span>}
                      {isUnavailable && <span className="text-[9px] font-bold text-american-red uppercase">Closed</span>}
                      {isBlackout && <span className="text-[9px] font-bold text-american-red uppercase">Blackout</span>}
                      {isCurrentJob && <span className="text-[9px] font-bold text-orange-600 uppercase">Current Schedule</span>}
                    </div>

                    <div className="space-y-1">
                      {items.length > 0 ? (
                        items.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", 
                              item.type === 'Job' ? "bg-american-blue" : 
                              item.type === 'Busy' ? "bg-purple-500" : "bg-amber-500"
                            )} />
                            <span className={cn("text-sm font-bold whitespace-normal break-words", isSelected ? "text-white/90" : "text-gray-600")}>
                              {item.title}
                              {mode === 'crew' && item.isJob && (item.raw as any).customerCity && ` (${(item.raw as any).customerCity})`}
                            </span>
                          </div>
                        ))
                      ) : (
                        <span className={cn("text-sm font-medium", isSelected ? "text-white/60" : "text-gray-400 italic")}>
                          {isUnavailable || isBlackout ? "Not available" : "Open for scheduling"}
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className={cn("shrink-0 opacity-20", isSelected && "opacity-100")} size={20} />
                </button>
              );
            } catch (e) {
              console.error("Error rendering list day", day, e);
              return null;
            }
          })}
        </div>
      );
    } catch (e) {
      console.error("Error calculating list days", e);
      return <div>Error loading list view</div>;
    }
  };

  console.log("[DEBUG] InstallScheduleCalendar - CHECKPOINT I: Rendering complete");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between no-print">
        <h3 className="text-xl font-black text-american-blue uppercase tracking-tight">
          {format(currentDate, 'MMMM yyyy')}
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm transition-all">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="px-3 py-2 text-xs font-black uppercase tracking-widest text-american-blue hover:bg-gray-50 rounded-xl transition-all">
            Today
          </button>
          <button onClick={nextMonth} className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm transition-all">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {isMobile ? renderList() : renderGrid()}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-white rounded-2xl border border-gray-100 shadow-xs no-print">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-american-blue" />
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Scheduled Job</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Appointment</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-500" />
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Busy / Off</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-slate-900/[0.03] border border-gray-200" />
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Unavailable</span>
        </div>
      </div>
    </div>
  );
}
