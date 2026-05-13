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
  Trash2, 
  Plus, 
  AlertCircle,
  Briefcase,
  ExternalLink,
  CheckCircle2,
  XCircle,
  MapPin
} from 'lucide-react';
import { SavedEstimate, ScheduleEvent, JobStatus } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SchedulerProps {
  savedEstimates: SavedEstimate[];
  user: any;
}

export default function Scheduler({ savedEstimates, user }: SchedulerProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isAddingBlackout, setIsAddingBlackout] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [selectedDuration, setSelectedDuration] = useState(2);

  // Sync scheduled jobs with estimates
  const scheduledEstimates = savedEstimates.filter(est => est.scheduledStartDate);
  const acceptedUnscheduled = savedEstimates.filter(est => est.jobStatus === 'Accepted' && !est.scheduledStartDate);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'schedule_events'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setEvents(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as ScheduleEvent)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'schedule_events')
    );
    return () => unsubscribe();
  }, [user]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    setShowEventModal(true);
    // Find event on this day
    const event = events.find(e => isSameDay(parseISO(e.startDate), day));
    const job = scheduledEstimates.find(est => est.scheduledStartDate && isSameDay(parseISO(est.scheduledStartDate), day));
    
    if (event) setSelectedEvent(event);
    else if (job) {
      // Create a virtual event for the modal
      setSelectedEvent({
        id: job.id,
        type: 'Job',
        title: job.customerName,
        startDate: job.scheduledStartDate!,
        endDate: job.scheduledEndDate || job.scheduledStartDate!,
        estimateId: job.id,
        userId: user.uid
      });
    } else {
      setSelectedEvent(null);
    }
  };

  const scheduleJob = async (estimateId: string, date: Date) => {
    const estimate = savedEstimates.find(e => e.id === estimateId);
    if (!estimate || !user) return;

    const startDateStr = date.toISOString();
    const duration = selectedDuration; 
    const endDate = addDays(date, duration - 1);
    const endDateStr = endDate.toISOString();

    try {
      const docRef = doc(db, 'estimates', estimateId);
      await updateDoc(docRef, {
        scheduledStartDate: startDateStr,
        scheduledEndDate: endDateStr,
        scheduledDuration: duration,
        jobStatus: 'In Progress' as JobStatus
      });
      setShowEventModal(false);
    } catch (error) {
      console.error('Failed to schedule job:', error);
    }
  };

  const addBlackout = async (date: Date) => {
    if (!user) return;
    const id = `blackout-${Date.now()}`;
    const newEvent: ScheduleEvent = {
        id,
        type: 'Blackout',
        title: 'Subcontractor Busy',
        startDate: date.toISOString(),
        endDate: date.toISOString(),
        userId: user.uid
    };

    try {
        await setDoc(doc(db, 'schedule_events', id), newEvent);
        setIsAddingBlackout(false);
        setShowEventModal(false);
    } catch (error) {
        console.error('Failed to add blackout:', error);
    }
  };

  const deleteEvent = async (id: string, type: 'Job' | 'Blackout') => {
    if (type === 'Blackout') {
        await deleteDoc(doc(db, 'schedule_events', id));
    } else {
        const docRef = doc(db, 'estimates', id);
        await updateDoc(docRef, {
            scheduledStartDate: null,
            scheduledEndDate: null,
            jobStatus: 'Accepted' as JobStatus
        });
    }
    setShowEventModal(false);
  };

  return (
    <div className="min-h-full bg-[#F5F7FA] p-6 lg:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-american-blue rounded-lg text-white">
                <CalendarIcon size={20} />
              </div>
              <h1 className="text-2xl font-black text-american-blue uppercase tracking-tight">Production Scheduler</h1>
            </div>
            <p className="text-sm font-medium text-[#666666]">Manage installs, blackout dates, and subcontractor capacity.</p>
          </div>
          
          <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-[#E5E5E5]">
            <div className="flex items-center gap-2 px-3 border-r border-[#E5E5E5]">
                <div className="w-3 h-3 rounded-full bg-american-blue" />
                <span className="text-[10px] font-bold text-[#1A1A1A] uppercase">Installs</span>
            </div>
            <div className="flex items-center gap-2 px-3 border-r border-[#E5E5E5]">
                <div className="w-3 h-3 rounded-full bg-american-red" />
                <span className="text-[10px] font-bold text-[#1A1A1A] uppercase">Blackouts</span>
            </div>
            <div className="flex items-center gap-2 px-3">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-[10px] font-bold text-[#1A1A1A] uppercase">Vacant</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Main Calendar View */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="bg-white rounded-3xl p-8 shadow-xl shadow-american-blue/5 border border-[#E5E5E5]">
              {/* Month Selector */}
              <div className="flex items-center justify-between mb-10">
                <h2 className="text-xl font-black text-american-blue">{format(currentDate, 'MMMM yyyy')}</h2>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={prevMonth}
                    className="p-2 hover:bg-[#F5F7FA] rounded-xl transition-colors border border-transparent hover:border-[#E5E5E5]"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button 
                    onClick={() => setCurrentDate(new Date())}
                    className="px-4 py-2 text-xs font-bold text-american-blue hover:bg-american-blue/5 rounded-xl uppercase tracking-widest transition-all"
                  >
                    Today
                  </button>
                  <button 
                    onClick={nextMonth}
                    className="p-2 hover:bg-[#F5F7FA] rounded-xl transition-colors border border-transparent hover:border-[#E5E5E5]"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              {/* Day Headers */}
              <div className="grid grid-cols-7 mb-4">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center">
                    <span className="text-[10px] font-black text-[#999999] uppercase tracking-widest">{day}</span>
                  </div>
                ))}
              </div>

              {/* Grid */}
              <div className="grid grid-cols-7 gap-px bg-[#E5E5E5] border border-[#E5E5E5] rounded-2xl overflow-hidden shadow-inner">
                {calendarDays.map((day, idx) => {
                  const dayEvents = events.filter(e => isSameDay(parseISO(e.startDate), day));
                  const jobs = scheduledEstimates.filter(est => {
                    const start = parseISO(est.scheduledStartDate!);
                    const end = est.scheduledEndDate ? parseISO(est.scheduledEndDate) : start;
                    return isWithinInterval(day, { start, end });
                  });
                  const isCurrentMonth = isSameMonth(day, monthStart);
                  const isToday = isSameDay(day, new Date());
                  
                  return (
                    <div 
                      key={day.toString()}
                      onClick={() => handleDayClick(day)}
                      className={cn(
                        "min-h-[120px] bg-white p-3 cursor-pointer group transition-all",
                        !isCurrentMonth && "bg-[#F8F9FA]/50",
                        isToday && "bg-american-blue/[0.02]"
                      )}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className={cn(
                          "text-sm font-black w-7 h-7 flex items-center justify-center rounded-lg transition-all",
                          isToday ? "bg-american-blue text-white shadow-lg" : "text-[#1A1A1A] group-hover:bg-[#F5F7FA]",
                          !isCurrentMonth && "text-[#BBBBBB]"
                        )}>
                          {format(day, 'd')}
                        </span>
                      </div>

                      <div className="space-y-1">
                        {dayEvents.map(event => (
                          <div 
                            key={event.id}
                            className={cn(
                              "text-[9px] font-bold p-1 rounded-md flex items-center gap-1 leading-tight truncate",
                              event.type === 'Blackout' ? "bg-american-red/10 text-american-red border border-american-red/20" : "bg-american-blue/10 text-american-blue border border-american-blue/20"
                            )}
                          >
                            {event.type === 'Blackout' ? <AlertCircle size={8} /> : <Briefcase size={8} />}
                            {event.title}
                          </div>
                        ))}
                        {jobs.map(job => (
                          <div 
                            key={job.id}
                            className="text-[9px] font-bold p-1 rounded-md flex items-center gap-1 leading-tight truncate bg-american-blue text-white shadow-sm"
                          >
                            <CheckCircle2 size={8} />
                            {job.customerName}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Side Panel: Unscheduled Jobs */}
          <div className="lg:col-span-4 flex flex-col gap-8">
            
            <div className="bg-white rounded-3xl p-8 border border-[#E5E5E5] shadow-xl shadow-american-blue/5 h-fit">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black text-american-blue uppercase tracking-widest">Unscheduled Orders</h3>
                <div className="h-6 w-6 rounded-full bg-american-red flex items-center justify-center text-white text-[10px] font-black">
                  {acceptedUnscheduled.length}
                </div>
              </div>

              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {acceptedUnscheduled.length > 0 ? (
                    acceptedUnscheduled.map(est => (
                        <div 
                          key={est.id} 
                          className="p-4 rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA] hover:border-american-blue transition-all group cursor-default"
                        >
                          <div className="flex justify-between items-start mb-2">
                             <div>
                                <p className="text-xs font-black text-[#1A1A1A]">{est.customerName}</p>
                                <p className="text-[10px] font-bold text-[#999999] uppercase truncate max-w-[150px]">{est.customerAddress}</p>
                             </div>
                             <div className="text-[10px] font-black text-american-blue bg-white px-2 py-1 rounded-lg border border-[#E5E5E5]">
                                {Math.round(est.linearFeet)}' LF
                             </div>
                          </div>
                          
                          <div className="flex items-center justify-between mt-4">
                            <div className="flex items-center gap-1 ">
                                <Clock size={10} className="text-[#999999]" />
                                <span className="text-[9px] font-bold text-[#999999] uppercase tracking-tighter">Approx. {est.scheduledDuration || 2} Days</span>
                            </div>
                            <button 
                                onClick={() => {
                                    setSelectedDate(new Date());
                                    setSelectedEvent({
                                        id: est.id,
                                        type: 'Job',
                                        title: est.customerName,
                                        startDate: '',
                                        endDate: '',
                                        estimateId: est.id,
                                        userId: user.uid
                                    });
                                    setShowEventModal(true);
                                }}
                                className="text-[10px] font-black text-american-blue uppercase tracking-tighter hover:underline"
                            >
                                Assign Slot
                            </button>
                          </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-10 opacity-30">
                        <CalendarIcon size={40} className="mx-auto mb-4" />
                        <p className="text-xs font-bold uppercase tracking-widest leading-relaxed">All active contracts are<br/>currently scheduled.</p>
                    </div>
                )}
              </div>
            </div>

            {/* Subcontractor Status Card */}
            <div className="bg-american-blue p-8 rounded-3xl text-white relative overflow-hidden shadow-xl">
                 <div className="absolute top-0 right-0 p-6 opacity-10">
                    <User size={60} />
                 </div>
                 <h4 className="text-xs font-black uppercase tracking-[0.2em] mb-2 opacity-60">Subcontractor Pool</h4>
                 <p className="text-xl font-black mb-4">Availability Management</p>
                 <p className="text-xs text-white/70 leading-relaxed mb-6">Mark dates as blackout to prevent overlaps or overbooking your installation teams.</p>
                 <button 
                    onClick={() => {
                        setSelectedDate(new Date());
                        setIsAddingBlackout(true);
                        setShowEventModal(true);
                    }}
                    className="w-full bg-american-red hover:bg-white hover:text-american-red text-white transition-all py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2"
                 >
                    <Plus size={16} />
                    Add Blackout Date
                 </button>
            </div>

          </div>
        </div>
      </div>

      {/* Event/Scheduling Modal */}
      <AnimatePresence>
        {showEventModal && selectedDate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => {
                   setShowEventModal(false);
                   setIsAddingBlackout(false);
                   setSelectedEvent(null);
               }}
               className="absolute inset-0 bg-american-blue/60 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden border border-white/10"
            >
              <div className="p-10">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-2xl font-black text-american-blue uppercase tracking-tight">
                        {isAddingBlackout ? 'Add Blackout' : selectedEvent?.type === 'Job' ? 'Schedule Job' : selectedEvent?.type === 'Blackout' ? 'Manage Blackout' : 'Day Actions'}
                    </h3>
                    <p className="text-xs font-bold text-[#999999] uppercase tracking-widest mt-1">
                        {format(selectedDate, 'EEEE, MMM do, yyyy')}
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                        setShowEventModal(false);
                        setIsAddingBlackout(false);
                        setSelectedEvent(null);
                    }}
                    className="h-10 w-10 rounded-xl bg-[#F5F7FA] flex items-center justify-center text-[#999999] hover:text-american-red transition-colors"
                  >
                    <XCircle size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                    {/* Content depends on context */}
                    {isAddingBlackout ? (
                        <div className="space-y-6">
                            <div className="p-6 bg-american-red/5 border border-american-red/10 rounded-3xl">
                                <div className="flex items-center gap-3 text-american-red mb-2">
                                    <AlertCircle size={20} />
                                    <h4 className="font-black uppercase text-xs tracking-widest">Confirm Blackout</h4>
                                </div>
                                <p className="text-xs text-[#666666] leading-relaxed">This will mark this day as unavailable for any new fence installations.</p>
                            </div>
                            <button 
                                onClick={() => addBlackout(selectedDate)}
                                className="w-full bg-american-blue py-5 rounded-3xl text-white font-black uppercase text-xs tracking-widest shadow-xl hover:shadow-american-blue/20 transition-all"
                            >
                                Lock Date
                            </button>
                        </div>
                    ) : selectedEvent ? (
                        <div className="space-y-6">
                            <div className="p-8 bg-[#F8F9FA] rounded-3xl border border-[#E5E5E5]">
                                <div className="flex items-center gap-4 mb-4">
                                     <div className={cn(
                                         "h-12 w-12 rounded-2xl flex items-center justify-center text-white",
                                         selectedEvent.type === 'Blackout' ? 'bg-american-red' : 'bg-american-blue'
                                     )}>
                                         {selectedEvent.type === 'Blackout' ? <AlertCircle size={24} /> : <Briefcase size={24} />}
                                     </div>
                                     <div>
                                         <h4 className="font-black text-american-blue uppercase text-sm">{selectedEvent.title}</h4>
                                         <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">{selectedEvent.type}</p>
                                     </div>
                                </div>
                                
                                {selectedEvent.estimateId && (
                                    <div className="space-y-4 pt-4 border-t border-[#E5E5E5]">
                                        <div className="flex items-center gap-3">
                                            <MapPin size={14} className="text-[#999999]" />
                                            <span className="text-xs text-[#666666] font-medium">{savedEstimates.find(e => e.id === selectedEvent.estimateId)?.customerAddress}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Clock size={14} className="text-[#999999]" />
                                            <span className="text-xs text-[#666666] font-medium">
                                                {savedEstimates.find(e => e.id === selectedEvent.estimateId)?.scheduledDuration || 2} Day Installation
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button 
                                onClick={() => deleteEvent(selectedEvent.id, selectedEvent.type)}
                                className="w-full bg-american-red/5 hover:bg-american-red hover:text-white border border-american-red/20 text-american-red py-4 rounded-3xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                            >
                                <Trash2 size={16} />
                                {selectedEvent.type === 'Blackout' ? 'Remove Blackout' : 'Unschedule Job'}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5]">
                                <p className="text-[10px] font-black text-[#999999] uppercase tracking-widest mb-3 text-center">Set Default Duration (Days)</p>
                                <div className="flex items-center justify-center gap-4">
                                    {[1, 2, 3, 4, 5].map(d => (
                                    <button 
                                        key={d}
                                        onClick={() => setSelectedDuration(d)}
                                        className={cn(
                                            "h-10 w-10 flex items-center justify-center rounded-xl font-bold text-xs transition-all",
                                            selectedDuration === d 
                                                ? "bg-american-blue text-white shadow-lg shadow-american-blue/20" 
                                                : "bg-white border border-[#E5E5E5] text-american-blue hover:border-american-blue"
                                        )}
                                    >
                                        {d}
                                    </button>
                                ))}
                                </div>
                            </div>

                            <h4 className="text-[10px] font-black text-[#999999] uppercase tracking-[0.2em]">Select an available job</h4>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {acceptedUnscheduled.length > 0 ? (
                                    acceptedUnscheduled.map(est => (
                                        <button 
                                            key={est.id}
                                            onClick={() => scheduleJob(est.id, selectedDate)}
                                            className="w-full text-left p-4 rounded-2xl border border-[#E5E5E5] hover:border-american-blue hover:bg-american-blue/5 transition-all group"
                                        >
                                            <p className="text-xs font-black text-[#1A1A1A] group-hover:text-american-blue">{est.customerName}</p>
                                            <p className="text-[9px] font-bold text-[#999999] uppercase mt-1">{est.linearFeet.toFixed(0)}' LF • {est.scheduledDuration || 2} Days</p>
                                        </button>
                                    ))
                                ) : (
                                    <p className="text-center py-6 text-xs italic text-[#999999]">No pending jobs available to schedule.</p>
                                )}
                            </div>
                            
                            <div className="pt-4 border-t border-[#E5E5E5]">
                                <button 
                                    onClick={() => addBlackout(selectedDate)}
                                    className="w-full py-4 text-xs font-black text-american-red uppercase tracking-widest hover:bg-american-red/5 rounded-2xl transition-all"
                                >
                                    Mark as Blackout
                                </button>
                            </div>
                        </div>
                    )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E5E5E5;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #999;
        }
      `}</style>
    </div>
  );
}
