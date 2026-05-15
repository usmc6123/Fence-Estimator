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
  Settings as SettingsIcon, Filter as FilterIcon,
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
  MapPin,
  Printer
} from 'lucide-react';
import { SavedEstimate, ScheduleEvent, JobStatus, SchedulerConfig } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, updateDoc, writeBatch, getDoc } from 'firebase/firestore';
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
  const [isAddingEstimate, setIsAddingEstimate] = useState(false);
  const [isAddingBusy, setIsAddingBusy] = useState(false);
  const [isCreatingNewDossier, setIsCreatingNewDossier] = useState(false);
  const [newDossierData, setNewDossierData] = useState({
    name: '',
    phone: '',
    address: '',
    email: ''
  });
  const [busyAllDay, setBusyAllDay] = useState(true);
  const [busyStart, setBusyStart] = useState("09:00");
  const [busyEnd, setBusyEnd] = useState("17:00");
  const [estimateTime, setEstimateTime] = useState("09:00");
  const [showEventModal, setShowEventModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [selectedDuration, setSelectedDuration] = useState(2);
  
  const [config, setConfig] = useState<SchedulerConfig>({
    appointmentDuration: 60, // 60 mins
    startHour: 8,
    endHour: 17,
    viewFilter: 'both'
  });

  // Sync scheduled jobs with estimates
  const scheduledEstimates = savedEstimates.filter(est => est.scheduledStartDate);
  const pendingDossiers = savedEstimates.filter(est => est.jobStatus === 'Estimate Pending' || est.jobStatus === 'Estimate Sent');
  const acceptedUnscheduled = savedEstimates.filter(est => est.jobStatus === 'Accepted' && !est.scheduledStartDate);

  useEffect(() => {
    if (!user) return;

    // Load config
    const loadConfig = async () => {
      try {
        const configDoc = await getDoc(doc(db, 'companySettings', 'scheduler'));
        if (configDoc.exists()) {
          setConfig(configDoc.data() as SchedulerConfig);
        }
      } catch (err) {
        console.error('Failed to load scheduler config:', err);
      }
    };
    loadConfig();

    const q = query(collection(db, 'schedule_events'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setEvents(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as ScheduleEvent)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'schedule_events')
    );
    return () => unsubscribe();
  }, [user]);

  const saveConfig = async (newConfig: SchedulerConfig) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'companySettings', 'scheduler'), { ...newConfig, userId: user.uid });
      setConfig(newConfig);
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  };

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

  const handlePrint = () => {
    window.print();
  };

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

  const scheduleEstimate = async (estimateId: string, date: Date) => {
    const estimate = savedEstimates.find(e => e.id === estimateId);
    if (!estimate || !user) return;

    // Check for Busy (Estimate Blockers)
    const dateKey = format(date, 'yyyy-MM-dd');
    const conflicts = events.filter(e => e.type === 'Busy' && e.startDate.startsWith(dateKey));
    
    const hasAllDayConflict = conflicts.some(c => c.isAllDay);
    const hasTimeConflict = conflicts.some(c => {
        if (!c.startTime || !c.endTime) return false;
        return estimateTime >= c.startTime && estimateTime < c.endTime;
    });

    if (hasAllDayConflict || hasTimeConflict) {
        alert("This time overlaps with a busy period.");
        return;
    }

    const id = `estimate-${estimateId}-${dateKey}-${estimateTime.replace(':', '')}`;
    const newEvent: ScheduleEvent = {
        id,
        type: 'Estimate',
        title: `EST: ${estimate.customerName}`,
        startDate: dateKey,
        endDate: dateKey,
        startTime: estimateTime,
        estimateId: estimate.id,
        userId: user.uid,
        notes: `Estimate appointment @ ${estimateTime} for ${estimate.customerName}`
    };

    try {
        await setDoc(doc(db, 'schedule_events', id), newEvent);
        setIsAddingEstimate(false);
        setShowEventModal(false);
    } catch (error) {
        console.error('Failed to schedule estimate:', error);
    }
  };

  const quickCreateAndSchedule = async () => {
    if (!user || !selectedDate) return;
    if (!newDossierData.name || !newDossierData.phone || !newDossierData.address) {
        alert("Please fill in Name, Phone, and Address.");
        return;
    }

    const dossierId = `quick-${Date.now()}-${user.uid}`;
    const newDossier: SavedEstimate = {
        id: dossierId,
        customerName: newDossierData.name,
        customerPhone: newDossierData.phone,
        customerAddress: newDossierData.address,
        customerEmail: newDossierData.email,
        customerCity: '',
        customerState: '',
        customerZip: '',
        customerStreet: '',
        date: new Date().toISOString().split('T')[0],
        jobStatus: 'Estimate Pending',
        status: 'active',
        lastModified: new Date().toISOString(),
        userId: user.uid,
        linearFeet: 0,
        corners: 0,
        height: 6,
        width: 3,
        runs: [],
        defaultStyleId: 'standard-cedar',
        defaultVisualStyleId: 'side-by-side',
        defaultHeight: 6,
        defaultColor: 'Natural',
        hasSitePrep: false,
        needsClearing: false,
        needsMarking: false,
        obstacleRemoval: false,
        postCapId: 'none',
        hasCapAndTrim: false,
        gateCount: 0,
        gateStyleId: 'standard',
        wastePercentage: 10,
        includeStain: false,
        footingType: 'Cylindrical',
        concreteType: 'Quickset',
        postWidth: 4,
        postThickness: 4,
        markupPercentage: 35,
        taxPercentage: 8,
        laborRates: {
            woodSideBySide6: 8,
            woodBoardOnBoard6: 12,
            woodSideBySide8: 10,
            woodBoardOnBoard8: 14,
            ironBoltUp: 10,
            ironWeldUp: 15,
            chainLink: 6,
            pipeFence: 12,
            topCap: 2,
            additionalRailPipe: 1,
            demo: 3,
            washAndStain: 1.5,
            gateWeldedFrame: 150,
            gateWoodWalk: 75,
            gateWoodDrive: 150,
            gateHangPreMade: 50,
            deliveryFee: 75
        },
        deliveryFee: 75,
        manualQuantities: {},
        manualPrices: {},
        createdAt: new Date().toISOString()
    };

    try {
        await setDoc(doc(db, 'estimates', dossierId), newDossier);
        await scheduleEstimate(dossierId, selectedDate);
        setNewDossierData({ name: '', phone: '', address: '', email: '' });
        setIsCreatingNewDossier(false);
    } catch (error) {
        console.error('Failed to quick create and schedule:', error);
    }
  };

  const scheduleJob = async (estimateId: string, date: Date) => {
    const estimate = savedEstimates.find(e => e.id === estimateId);
    if (!estimate || !user) return;

    const startDateStr = format(date, 'yyyy-MM-dd');
    
    // Check for Job Blackouts
    const isBlackedOut = events.some(e => e.type === 'Blackout' && e.startDate.startsWith(startDateStr));
    if (isBlackedOut) {
        alert("This day is a designated blackout for installs.");
        return;
    }

    const duration = selectedDuration; 
    const endDate = addDays(date, duration - 1);
    const endDateStr = format(endDate, 'yyyy-MM-dd');

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
    const dateKey = format(date, 'yyyy-MM-dd');
    const id = `blackout-${dateKey}-${user.uid}`;
    const newEvent: ScheduleEvent = {
        id,
        type: 'Blackout',
        title: 'Job Blackout',
        startDate: dateKey,
        endDate: dateKey,
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

  const addBusy = async (date: Date, title: string) => {
    if (!user) return;
    const dateKey = format(date, 'yyyy-MM-dd');
    const id = `busy-${Date.now()}-${user.uid}`;
    const newEvent: ScheduleEvent = {
        id,
        type: 'Busy',
        title: title || (busyAllDay ? 'Out of Office' : 'Busy'),
        startDate: dateKey,
        endDate: dateKey,
        userId: user.uid,
        isAllDay: busyAllDay,
        startTime: busyAllDay ? undefined : busyStart,
        endTime: busyAllDay ? undefined : busyEnd
    };

    try {
        await setDoc(doc(db, 'schedule_events', id), newEvent);
        setIsAddingBusy(false);
        setShowEventModal(false);
    } catch (error) {
        console.error('Failed to add busy time:', error);
    }
  };

  const deleteEvent = async (id: string, type: 'Job' | 'Estimate' | 'Blackout' | 'Busy') => {
    if (type === 'Blackout' || type === 'Estimate' || type === 'Busy') {
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
          
          <div className="flex items-center gap-3">
              <div className="flex items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-[#E5E5E5] no-print">
              <div className="flex items-center gap-2 px-3 border-r border-[#E5E5E5]">
                  <div className="w-3 h-3 rounded-full bg-american-blue" />
                  <span className="text-[10px] font-bold text-[#1A1A1A] uppercase">Installs</span>
              </div>
              <div className="flex items-center gap-2 px-3 border-r border-[#E5E5E5]">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-[10px] font-bold text-[#1A1A1A] uppercase">Appts</span>
              </div>
              <div className="flex items-center gap-2 px-3 border-r border-[#E5E5E5]">
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                  <span className="text-[10px] font-bold text-[#1A1A1A] uppercase">Busy</span>
              </div>
              <div className="flex items-center gap-2 px-3 border-r border-[#E5E5E5]">
                  <div className="w-3 h-3 rounded-full bg-american-red" />
                  <span className="text-[10px] font-bold text-[#1A1A1A] uppercase">Job Blk</span>
              </div>
              <div className="flex items-center gap-2 px-3">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-[10px] font-bold text-[#1A1A1A] uppercase">Vacant</span>
              </div>
            </div>

            <button 
              onClick={() => setShowSettingsModal(true)}
              className="p-3 bg-white text-american-blue hover:text-american-red rounded-2xl shadow-lg border border-[#E5E5E5] transition-all no-print"
              title="Scheduler Settings"
            >
              <SettingsIcon size={20} />
            </button>

            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 bg-american-blue text-white px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-american-red transition-all shadow-lg no-print"
            >
              <Printer size={16} />
              Print
            </button>
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
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const dayEvents = events.filter(e => {
                    if (e.startDate !== dateKey) return false;
                    const view = config.viewFilter;
                    if (view === 'both') return true;
                    if (view === 'estimates') return e.type === 'Estimate' || e.type === 'Busy';
                    if (view === 'jobs') return e.type === 'Job' || e.type === 'Blackout';
                    return true;
                  });
                  const showJobs = config.viewFilter === 'jobs' || config.viewFilter === 'both';
                  const jobs = showJobs ? scheduledEstimates.filter(est => {
                    const start = est.scheduledStartDate!;
                    const end = est.scheduledEndDate || start;
                    return dateKey >= start.substring(0, 10) && dateKey <= end.substring(0, 10);
                  }) : [];
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
                              event.type === 'Blackout' ? "bg-american-red/10 text-american-red border border-american-red/20" : 
                              event.type === 'Estimate' ? "bg-amber-100 text-amber-700 border border-amber-200" :
                              event.type === 'Busy' ? "bg-purple-100 text-purple-700 border border-purple-200" :
                              "bg-american-blue/10 text-american-blue border border-american-blue/20"
                            )}
                          >
                            {event.type === 'Blackout' ? <AlertCircle size={8} /> : 
                             event.type === 'Estimate' ? <CalendarIcon size={8} /> :
                             event.type === 'Busy' ? <Clock size={8} /> :
                             <Briefcase size={8} />}
                            {event.title} {!event.isAllDay && event.startTime ? `(${event.startTime})` : ''}
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
                <h3 className="text-sm font-black text-american-blue uppercase tracking-widest">Pending Estimates</h3>
                <div className="h-6 w-6 rounded-full bg-american-red flex items-center justify-center text-white text-[10px] font-black">
                  {pendingDossiers.length}
                </div>
              </div>

              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {pendingDossiers.length > 0 ? (
                    pendingDossiers.map(est => (
                        <div 
                          key={est.id} 
                          className="p-4 rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA] hover:border-american-blue transition-all group cursor-default"
                        >
                          <div className="flex justify-between items-start mb-2">
                             <div>
                                <p className="text-xs font-black text-[#1A1A1A]">{est.customerName}</p>
                                <p className="text-[10px] font-bold text-[#999999] uppercase truncate max-w-[150px]">{est.customerAddress}</p>
                             </div>
                             <div className="text-[10px] font-black text-white bg-american-red px-2 py-1 rounded-lg">
                                {Math.round(est.linearFeet)}'
                             </div>
                          </div>
                          
                          <div className="flex items-center justify-between mt-4">
                            <div className="flex items-center gap-1 ">
                                <Clock size={10} className="text-[#999999]" />
                                <span className="text-[9px] font-bold text-[#999999] uppercase tracking-tighter">{config.appointmentDuration} Min Appt</span>
                            </div>
                            <button 
                                onClick={() => {
                                    setSelectedDate(new Date());
                                    setIsAddingEstimate(true);
                                    setSelectedEvent({
                                        id: est.id,
                                        type: 'Estimate',
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
                                Schedule
                            </button>
                          </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-10 opacity-30">
                        <p className="text-xs font-bold uppercase tracking-widest text-[#999999]">No pending estimates</p>
                    </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-8 border border-[#E5E5E5] shadow-xl shadow-american-blue/5 h-fit">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black text-american-blue uppercase tracking-widest">Unscheduled Orders</h3>
                <div className="h-6 w-6 rounded-full bg-american-red flex items-center justify-center text-white text-[10px] font-black">
                  {acceptedUnscheduled.length}
                </div>
              </div>

              <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
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

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setShowSettingsModal(false)}
               className="absolute inset-0 bg-american-blue/60 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-10">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-black text-american-blue uppercase tracking-tight">Calendar Settings</h3>
                  <button onClick={() => setShowSettingsModal(false)}>
                    <XCircle size={20} className="text-[#999999]" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-[#999999] uppercase tracking-widest">View Filter</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['estimates', 'jobs', 'both'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => saveConfig({ ...config, viewFilter: f })}
                          className={cn(
                            "py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                            config.viewFilter === f ? "bg-american-blue text-white shadow-lg" : "bg-[#F5F7FA] text-[#999999]"
                          )}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-[#999999] uppercase tracking-widest">Appt. Duration (Mins)</label>
                    <select 
                      value={config.appointmentDuration}
                      onChange={(e) => saveConfig({ ...config, appointmentDuration: Number(e.target.value) })}
                      className="w-full p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5] text-sm font-bold outline-none focus:border-american-blue"
                    >
                      <option value={30}>30 Minutes</option>
                      <option value={45}>45 Minutes</option>
                      <option value={60}>1 Hour</option>
                      <option value={90}>1.5 Hours</option>
                      <option value={120}>2 Hours</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-[#999999] uppercase tracking-widest">Start Hour</label>
                      <select 
                        value={config.startHour}
                        onChange={(e) => saveConfig({ ...config, startHour: Number(e.target.value) })}
                        className="w-full p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5] text-sm font-bold outline-none focus:border-american-blue"
                      >
                        {Array.from({ length: 24 }).map((_, i) => (
                          <option key={i} value={i}>{i}:00</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-[#999999] uppercase tracking-widest">End Hour</label>
                      <select 
                        value={config.endHour}
                        onChange={(e) => saveConfig({ ...config, endHour: Number(e.target.value) })}
                        className="w-full p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5] text-sm font-bold outline-none focus:border-american-blue"
                      >
                        {Array.from({ length: 24 }).map((_, i) => (
                          <option key={i} value={i}>{i}:00</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button 
                    onClick={() => setShowSettingsModal(false)}
                    className="w-full bg-american-blue py-5 rounded-3xl text-white font-black uppercase text-xs tracking-widest shadow-xl mt-4"
                  >
                    Done
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                   setIsAddingEstimate(false);
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
                        {isAddingBlackout ? 'Job Blackout' : isAddingBusy ? 'Busy Appointment' : isAddingEstimate ? 'Schedule Appointment' : selectedEvent?.type === 'Job' ? 'Schedule Job' : selectedEvent?.type === 'Blackout' ? 'Manage Blackout' : selectedEvent?.type === 'Estimate' ? 'Manage Appointment' : selectedEvent?.type === 'Busy' ? 'Manage Busy Time' : 'Day Actions'}
                    </h3>
                    <p className="text-xs font-bold text-[#999999] uppercase tracking-widest mt-1">
                        {format(selectedDate, 'EEEE, MMM do, yyyy')}
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                        setShowEventModal(false);
                        setIsAddingBlackout(false);
                        setIsAddingEstimate(false);
                        setIsAddingBusy(false);
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
                                    <h4 className="font-black uppercase text-xs tracking-widest">Confirm Job Blackout</h4>
                                </div>
                                <p className="text-xs text-[#666666] leading-relaxed">This will mark this day as unavailable for any new fence installations. Estimates can still be scheduled.</p>
                            </div>
                            <button 
                                onClick={() => addBlackout(selectedDate)}
                                className="w-full bg-american-blue py-5 rounded-3xl text-white font-black uppercase text-xs tracking-widest shadow-xl hover:shadow-american-blue/20 transition-all"
                            >
                                Lock Jobs
                            </button>
                        </div>
                    ) : isAddingBusy ? (
                        <div className="space-y-6">
                            <div className="p-6 bg-purple-50 border border-purple-100 rounded-3xl">
                                <div className="flex items-center gap-3 text-purple-700 mb-2">
                                    <Clock size={20} />
                                    <h4 className="font-black uppercase text-xs tracking-widest">Custom Appointment / Busy</h4>
                                </div>
                                <p className="text-xs text-purple-800/70 leading-relaxed font-bold">Block time for estimate appointments (Vacations/Personal time).</p>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-[#999999] uppercase tracking-widest px-1">Reason / Description</label>
                                    <input 
                                        type="text" 
                                        id="busy-title"
                                        placeholder="e.g. Doctor Appt, Vacation..."
                                        className="w-full p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5] text-sm font-bold outline-none focus:border-american-blue"
                                    />
                                </div>

                                <div className="flex items-center justify-between p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5]">
                                    <label className="text-xs font-bold text-american-blue">All Day Window</label>
                                    <button 
                                        onClick={() => setBusyAllDay(!busyAllDay)}
                                        className={cn(
                                            "w-12 h-6 rounded-full transition-all relative p-1",
                                            busyAllDay ? "bg-american-blue" : "bg-[#E5E5E5]"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                                            busyAllDay ? "translate-x-6" : "translate-x-0"
                                        )} />
                                    </button>
                                </div>

                                <AnimatePresence>
                                    {!busyAllDay && (
                                        <motion.div 
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="grid grid-cols-2 gap-4 overflow-hidden"
                                        >
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-[#999999] uppercase tracking-widest px-1">Start</label>
                                                <input 
                                                    type="time" 
                                                    value={busyStart}
                                                    onChange={(e) => setBusyStart(e.target.value)}
                                                    className="w-full p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5] text-sm font-bold outline-none focus:border-american-blue"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-[#999999] uppercase tracking-widest px-1">End</label>
                                                <input 
                                                    type="time" 
                                                    value={busyEnd}
                                                    onChange={(e) => setBusyEnd(e.target.value)}
                                                    className="w-full p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5] text-sm font-bold outline-none focus:border-american-blue"
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <button 
                                onClick={() => {
                                    const title = (document.getElementById('busy-title') as HTMLInputElement).value;
                                    addBusy(selectedDate, title);
                                }}
                                className="w-full bg-american-blue py-5 rounded-3xl text-white font-black uppercase text-xs tracking-widest shadow-xl hover:shadow-american-blue/20 transition-all font-sans"
                            >
                                {busyAllDay ? 'Block Full Day' : 'Block Selected Time'}
                            </button>
                        </div>
                    ) : isAddingEstimate ? (
                        <div className="space-y-6">
                            <div className="p-6 bg-amber-50 border border-amber-200 rounded-3xl">
                                <div className="flex items-center gap-3 text-amber-600 mb-2">
                                    <CalendarIcon size={20} />
                                    <h4 className="font-black uppercase text-xs tracking-widest">Estimate Appointment</h4>
                                </div>
                                <p className="text-xs text-amber-800 leading-relaxed font-bold">Duration: {config.appointmentDuration} Minutes</p>
                                <p className="text-[10px] text-amber-700/60 mt-1 uppercase tracking-widest font-black">Available Between {config.startHour}:00 - {config.endHour}:00</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-[#999999] uppercase tracking-widest px-1">Appointment Time</label>
                                <input 
                                    type="time" 
                                    value={estimateTime}
                                    onChange={(e) => setEstimateTime(e.target.value)}
                                    className="w-full p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5] text-sm font-bold outline-none focus:border-american-blue"
                                />
                            </div>

                            <div className="flex items-center justify-between mb-2 mt-4">
                               <h4 className="text-[10px] font-black text-[#999999] uppercase tracking-[0.2em]">
                                   {isCreatingNewDossier ? 'New Lead Details' : 'Select Estimate Dossier'}
                               </h4>
                               <button 
                                 onClick={() => {
                                     setIsCreatingNewDossier(!isCreatingNewDossier);
                                     setNewDossierData({ name: '', phone: '', address: '', email: '' });
                                 }}
                                 className="text-[9px] font-black text-american-blue uppercase tracking-widest hover:text-american-red transition-colors"
                               >
                                   {isCreatingNewDossier ? 'Cancel & Select Existing' : '+ Add New'}
                               </button>
                            </div>

                            {isCreatingNewDossier ? (
                                <div className="space-y-3 p-6 bg-american-blue/5 rounded-3xl border border-american-blue/10">
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-[#999999] uppercase tracking-widest pl-2">Customer Name*</label>
                                        <input 
                                            type="text" 
                                            placeholder="Full Name"
                                            value={newDossierData.name}
                                            onChange={(e) => setNewDossierData({...newDossierData, name: e.target.value})}
                                            className="w-full p-3 bg-white rounded-xl border border-[#E5E5E5] text-xs font-bold outline-none focus:border-american-blue"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-[#999999] uppercase tracking-widest pl-2">Phone*</label>
                                            <input 
                                                type="tel" 
                                                placeholder="(000) 000-0000"
                                                value={newDossierData.phone}
                                                onChange={(e) => setNewDossierData({...newDossierData, phone: e.target.value})}
                                                className="w-full p-3 bg-white rounded-xl border border-[#E5E5E5] text-xs font-bold outline-none focus:border-american-blue"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-[#999999] uppercase tracking-widest pl-2">Email (Optional)</label>
                                            <input 
                                                type="email" 
                                                placeholder="email@example.com"
                                                value={newDossierData.email}
                                                onChange={(e) => setNewDossierData({...newDossierData, email: e.target.value})}
                                                className="w-full p-3 bg-white rounded-xl border border-[#E5E5E5] text-xs font-bold outline-none focus:border-american-blue"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-[#999999] uppercase tracking-widest pl-2">Site Address*</label>
                                        <input 
                                            type="text" 
                                            placeholder="123 Fence Way, City, TX"
                                            value={newDossierData.address}
                                            onChange={(e) => setNewDossierData({...newDossierData, address: e.target.value})}
                                            className="w-full p-3 bg-white rounded-xl border border-[#E5E5E5] text-xs font-bold outline-none focus:border-american-blue"
                                        />
                                    </div>
                                    <button 
                                        onClick={quickCreateAndSchedule}
                                        className="w-full bg-american-blue py-4 rounded-2xl text-white font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-american-red transition-all mt-2"
                                    >
                                        Create & Schedule
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                    {pendingDossiers.length > 0 ? (
                                        pendingDossiers.map(est => (
                                            <button 
                                                key={est.id}
                                                onClick={() => scheduleEstimate(est.id, selectedDate)}
                                                className="w-full text-left p-4 rounded-2xl border border-[#E5E5E5] hover:border-american-blue hover:bg-american-blue/5 transition-all group"
                                            >
                                                <p className="text-xs font-black text-[#1A1A1A] group-hover:text-american-blue">{est.customerName}</p>
                                                <p className="text-[9px] font-bold text-[#999999] uppercase mt-1">{est.linearFeet.toFixed(0)}' LF • {est.customerAddress}</p>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="text-center py-6 px-4">
                                            <p className="text-xs italic text-[#999999] mb-4">No pending dossiers available.</p>
                                            <button 
                                              onClick={() => setIsCreatingNewDossier(true)}
                                              className="text-[10px] font-black text-american-blue uppercase tracking-widest bg-american-blue/5 px-6 py-3 rounded-xl hover:bg-american-blue hover:text-white transition-all shadow-sm border border-american-blue/10"
                                            >
                                              + Quick Add Lead
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : selectedEvent ? (
                        <div className="space-y-6">
                            <div className="p-8 bg-[#F8F9FA] rounded-3xl border border-[#E5E5E5]">
                                <div className="flex items-center gap-4 mb-4">
                                     <div className={cn(
                                         "h-12 w-12 rounded-2xl flex items-center justify-center text-white",
                                         selectedEvent.type === 'Blackout' ? 'bg-american-red' : 
                                         selectedEvent.type === 'Estimate' ? 'bg-amber-500' : 
                                         selectedEvent.type === 'Busy' ? 'bg-purple-500' : 'bg-american-blue'
                                     )}>
                                         {selectedEvent.type === 'Blackout' ? <AlertCircle size={24} /> : 
                                          selectedEvent.type === 'Busy' ? <Clock size={24} /> :
                                          <Briefcase size={24} />}
                                     </div>
                                     <div>
                                         <h4 className="font-black text-american-blue uppercase text-sm">{selectedEvent.title}</h4>
                                         <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">
                                             {selectedEvent.type} {selectedEvent.isAllDay ? '(All Day)' : selectedEvent.startTime ? `(${selectedEvent.startTime} - ${selectedEvent.endTime})` : ''}
                                         </p>
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
                                                {selectedEvent.type === 'Job' 
                                                  ? `${savedEstimates.find(e => e.id === selectedEvent.estimateId)?.scheduledDuration || 2} Day Installation`
                                                  : `${config.appointmentDuration} Minute Appointment ${selectedEvent.startTime ? `@ ${selectedEvent.startTime}` : ''}`}
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
                                {selectedEvent.type === 'Blackout' ? 'Remove Blackout' : 
                                 selectedEvent.type === 'Busy' ? 'Remove Appointment' :
                                 selectedEvent.type === 'Estimate' ? 'Cancel Appointment' : 'Unschedule Job'}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-3 gap-3">
                                <button 
                                  onClick={() => setIsAddingEstimate(true)}
                                  className="flex flex-col items-center gap-2 p-4 rounded-3xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-all"
                                >
                                  <CalendarIcon size={20} />
                                  <span className="text-[9px] font-bold uppercase tracking-tight">Est</span>
                                </button>
                                <button 
                                  onClick={() => setIsAddingBusy(true)}
                                  className="flex flex-col items-center gap-2 p-4 rounded-3xl bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 transition-all"
                                >
                                  <Clock size={20} />
                                  <span className="text-[9px] font-bold uppercase tracking-tight">Busy</span>
                                </button>
                                <button 
                                  onClick={() => setIsAddingBlackout(true)}
                                  className="flex flex-col items-center gap-2 p-4 rounded-3xl bg-american-red/5 border border-american-red/20 text-american-red hover:bg-american-red/10 transition-all"
                                >
                                  <AlertCircle size={20} />
                                  <span className="text-[9px] font-bold uppercase tracking-tight">Blk Out</span>
                                </button>
                            </div>

                            <div className="relative">
                              <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-[#E5E5E5] text-center"></div>
                              </div>
                              <div className="relative flex justify-center text-[10px]">
                                <span className="px-2 bg-white text-[#999999] uppercase font-bold tracking-widest">Schedule Job</span>
                              </div>
                            </div>

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

                            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
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
                                    <p className="text-center py-6 text-xs italic text-[#999999]">No pending jobs available.</p>
                                )}
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
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; font-size: 10pt; }
          .min-h-full { background: white !important; padding: 0 !important; }
          .max-w-7xl { max-width: 100% !important; margin: 0 !important; }
          .lg\\:col-span-8 { width: 100% !important; grid-column: span 12 / span 12 !important; }
          .lg\\:col-span-4 { display: none !important; }
          .bg-white { border: 1px solid #ccc !important; box-shadow: none !important; }
          .shadow-xl { box-shadow: none !important; }
          .rounded-3xl, .rounded-2xl, .rounded-xl { border-radius: 4px !important; }
          .min-h-\\[120px\\] { min-height: 1.5in !important; }
          .p-6, .lg\\:p-10, .p-8 { padding: 4px !important; }
          .grid-cols-7 { gap: 0 !important; border-collapse: collapse; }
          .bg-\\[#E5E5E5\\] { background: transparent !important; }
          .border { border-color: #ccc !important; }
          .flex { display: flex !important; }
          .hidden { display: none !important; }
          h1, h2 { color: black !important; }
          .bg-american-blue { background-color: #f0f0f0 !important; color: black !important; border: 1px solid #ddd !important; }
          .text-white { color: black !important; }
        }
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
