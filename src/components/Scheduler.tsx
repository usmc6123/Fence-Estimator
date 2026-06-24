import React, { useState, useEffect, useMemo } from 'react';
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
  Printer,
  Eye
} from 'lucide-react';
import { SavedEstimate, ScheduleEvent, JobStatus, SchedulerConfig } from '../types';
import { db, handleFirestoreError, OperationType, getEstimateDoc } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, updateDoc, writeBatch, getDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const getInitials = (name: string) => {
  if (!name) return "";
  const cleaned = name.replace(/^EST:\s*/i, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const parseLocalDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  return new Date(dateStr);
};

const traceSchedulerStep = async (
  traceId: string,
  estimateId: string,
  customerName: string,
  stepNum: number,
  status: 'success' | 'failed' | 'skipped',
  details: any
) => {
  try {
    const token = localStorage.getItem('company_admin_token');
    const getStepLabel = (num: number) => {
      const labels: Record<number, string> = {
        1: 'User clicked Save Schedule',
        2: 'Frontend created request payload',
        3: 'POST /api/estimates/write',
        4: 'Backend router entered',
        5: 'Schedule event updated',
        6: 'Shared GHL helper called?',
        7: 'Settings loaded',
        8: 'Free Slots request',
        9: 'Slot selected',
        10: 'Appointment Create request',
        11: 'Firestore updated',
        12: 'Frontend success'
      };
      return labels[num] || `Step ${num}`;
    };

    await fetch('/api/estimates/write?action=write-scheduler-trace', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        traceId,
        logData: {
          estimateId,
          customerName,
          status: status === 'failed' ? 'failed' : 'running',
          steps: [
            {
              step: `STEP_${stepNum}`,
              label: getStepLabel(stepNum),
              status,
              timestamp: new Date().toISOString(),
              ...details
            }
          ]
        }
      })
    });
  } catch (err) {
    console.error(`Failed to log trace step ${stepNum}:`, err);
  }
};

interface SchedulerProps {
  savedEstimates: SavedEstimate[];
  user: any;
  readOnly?: boolean;
}

export default function Scheduler({ savedEstimates, user, readOnly = false }: SchedulerProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
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
  
  // Rescheduling states
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleDateStr, setRescheduleDateStr] = useState("");
  const [rescheduleTimeStr, setRescheduleTimeStr] = useState("09:00");
  const [rescheduleDuration, setRescheduleDuration] = useState(2);
  
  // Mobile responsive helper states
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<'grid' | 'list'>('list');
  const [activeTab, setActiveTab] = useState<'calendar' | 'pending'>('calendar');
  const [isModalLoading, setIsModalLoading] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const [config, setConfig] = useState<SchedulerConfig>({
    appointmentDuration: 60, // 60 mins
    startHour: 8,
    endHour: 17,
    viewFilter: 'both'
  });

  // Sync scheduled jobs with estimates
  const scheduledEstimates = savedEstimates.filter(est => est.scheduledStartDate && est.status !== 'archived');
  const pendingDossiers = savedEstimates.filter(est => 
    est.status !== 'archived' && 
    (!est.jobStatus || 
     est.jobStatus === 'Draft' || 
     est.jobStatus === 'Proposed' || 
     est.jobStatus === 'Estimate Pending')
  );
  const acceptedUnscheduled = savedEstimates.filter(est => est.jobStatus === 'Accepted' && !est.scheduledStartDate && est.status !== 'archived');

  const dayAllScheduledItems = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    const dayEvents = events.filter(e => {
      if (e.startDate !== dateKey) return false;
      const view = config.viewFilter;
      if (view === 'both') return true;
      if (view === 'estimates') return e.type === 'Estimate' || e.type === 'Busy';
      if (view === 'jobs') return e.type === 'Job' || e.type === 'Blackout';
      return true;
    });
    const showJobs = config.viewFilter === 'jobs' || config.viewFilter === 'both';
    const dayJobs = showJobs ? scheduledEstimates.filter(est => {
      const start = est.scheduledStartDate!;
      const end = est.scheduledEndDate || start;
      return dateKey >= start.substring(0, 10) && dateKey <= end.substring(0, 10);
    }) : [];

    return [
      ...dayEvents.map(e => ({ id: e.id, type: e.type, title: e.title, raw: e, isJob: false })),
      ...dayJobs.map(j => ({ id: j.id, type: 'Job' as const, title: j.customerName, raw: j, isJob: true }))
    ];
  }, [selectedDate, events, scheduledEstimates, config.viewFilter]);

  useEffect(() => {
    if (showEventModal) {
      setIsModalLoading(true);
      const timer = setTimeout(() => {
        setIsModalLoading(false);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [showEventModal, selectedEvent]);

  const fetchEvents = async () => {
    if (!user) return;
    try {
      const token = localStorage.getItem('company_admin_token');
      const response = await fetch('/api/estimates/write?action=list-schedule-events', {
        headers: {
          'Authorization': `Bearer ${token || ''}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setEvents(data);
      } else {
        console.error('Failed to fetch events', response.statusText);
      }
    } catch (err) {
      console.error('Failed to load schedule events:', err);
    }
  };

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

    fetchEvents();
    // Refresh schedule events periodically (every 10 seconds)
    const interval = setInterval(fetchEvents, 10000);

    // Support trigger via custom events for local responsiveness
    const handleEventsUpdated = () => fetchEvents();
    window.addEventListener('company_materials_updated', handleEventsUpdated);
    window.addEventListener('schedule_events_updated', handleEventsUpdated);

    return () => {
      clearInterval(interval);
      window.removeEventListener('company_materials_updated', handleEventsUpdated);
      window.removeEventListener('schedule_events_updated', handleEventsUpdated);
    };
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
    if (readOnly) return;
    setSelectedDate(day);
    setIsAddingBlackout(false);
    setIsAddingEstimate(false);
    setIsAddingBusy(false);
    setIsCreatingNewDossier(false);
    setSelectedEvent(null);
    setShowEventModal(true);
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

    const traceId = 'trace-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    try {
        const token = localStorage.getItem('company_admin_token');
        const response = await fetch('/api/estimates/write', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            action: 'create-schedule-event',
            scheduleSyncTraceId: traceId,
            ...newEvent
          })
        });
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        await fetchEvents();
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
            gateHangPreMade: 50,
            deliveryFee: 75
        },
        deliveryFee: 75,
        manualQuantities: {},
        manualPrices: {},
        createdAt: new Date().toISOString()
    };

    try {
        const token = localStorage.getItem('company_admin_token');
        const response = await fetch('/api/estimates/write', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token || ''}`
            },
            body: JSON.stringify({
                id: dossierId,
                ...newDossier
            })
        });
        if (!response.ok) {
            throw new Error(await response.text());
        }
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
    const traceId = 'trace-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    
    // Check for Job Blackouts
    const isBlackedOut = events.some(e => e.type === 'Blackout' && e.startDate.startsWith(startDateStr));
    if (isBlackedOut) {
        alert("This day is a designated blackout for installs.");
        return;
    }

    const duration = selectedDuration; 
    const endDate = addDays(date, duration - 1);
    const endDateStr = format(endDate, 'yyyy-MM-dd');

    // STEP 1: Clicked Save Schedule
    console.log("REAL JOB SCHEDULER SAVE FIRED");
    console.log({
      scheduleSyncTraceId: traceId,
      estimateId,
      selectedDate: startDateStr,
      duration,
      crew: estimate.assignedCrew || 'Crew',
      endpoint: '/api/estimates/write',
      action: 'reschedule-job'
    });

    await traceSchedulerStep(traceId, estimateId, estimate.customerName || '', 1, 'success', {
      installStartDate: startDateStr,
      installDays: duration,
      crew: estimate.assignedCrew || 'Crew',
      timestamp: new Date().toISOString()
    });

    // STEP 2: Request Payload
    const payload = {
      action: 'reschedule-job',
      estimateId: estimateId,
      startDate: startDateStr,
      duration: duration,
      assignedCrew: estimate.assignedCrew || 'Crew',
      notes: '',
      scheduleSyncTraceId: traceId
    };

    await traceSchedulerStep(traceId, estimateId, estimate.customerName || '', 2, 'success', {
      payload
    });

    try {
      const token = localStorage.getItem('company_admin_token');
      
      // STEP 3: POST /api/estimates/write
      await traceSchedulerStep(traceId, estimateId, estimate.customerName || '', 3, 'success', {
        endpoint: '/api/estimates/write',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? 'Bearer ' + token.substring(0, 10) + '...' : 'none'
        },
        payload
      });

      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`
        },
        body: JSON.stringify(payload)
      });
      
      const resText = await response.clone().text();

      await traceSchedulerStep(traceId, estimateId, estimate.customerName || '', 3, response.ok ? 'success' : 'failed', {
        endpoint: '/api/estimates/write',
        method: 'POST',
        status: response.status,
        response: resText
      });

      if (!response.ok) {
        throw new Error(resText);
      }
      setShowEventModal(false);

      // STEP 12: Frontend success
      await traceSchedulerStep(traceId, estimateId, estimate.customerName || '', 12, 'success', {
        schedulerUpdated: true,
        jobPortalUpdated: true,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Failed to schedule job:', error);
      await traceSchedulerStep(traceId, estimateId, estimate.customerName || '', 3, 'failed', {
        error: error.message || String(error)
      });
    }
  };

  const handleRescheduleJob = async (estimateId: string, newDateStr: string, newDuration: number) => {
    const estimate = savedEstimates.find(e => e.id === estimateId);
    const customerName = estimate?.customerName || 'N/A';
    const traceId = 'trace-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

    try {
      const parsed = parseLocalDate(newDateStr);
      const end = addDays(parsed, newDuration - 1);
      const endStr = format(end, 'yyyy-MM-dd');
      
      const isBlackedOut = events.some(e => e.type === 'Blackout' && e.startDate.startsWith(newDateStr));
      if (isBlackedOut) {
          alert("This day is a designated blackout for installs.");
          return;
      }

      // STEP 1: Clicked Save Schedule
      console.log("REAL JOB SCHEDULER SAVE FIRED");
      console.log({
        scheduleSyncTraceId: traceId,
        estimateId,
        selectedDate: newDateStr,
        duration: newDuration,
        crew: estimate?.assignedCrew || 'Crew',
        endpoint: '/api/estimates/write',
        action: 'reschedule-job'
      });

      await traceSchedulerStep(traceId, estimateId, customerName, 1, 'success', {
        installStartDate: newDateStr,
        installDays: newDuration,
        crew: estimate?.assignedCrew || 'Crew',
        timestamp: new Date().toISOString()
      });

      // STEP 2: Request Payload
      const payload = {
        action: 'reschedule-job',
        estimateId: estimateId,
        startDate: newDateStr,
        duration: newDuration,
        notes: 'Rescheduled via calendar',
        scheduleSyncTraceId: traceId
      };

      await traceSchedulerStep(traceId, estimateId, customerName, 2, 'success', {
        payload
      });

      const token = localStorage.getItem('company_admin_token');

      // STEP 3: POST /api/estimates/write
      await traceSchedulerStep(traceId, estimateId, customerName, 3, 'success', {
        endpoint: '/api/estimates/write',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? 'Bearer ' + token.substring(0, 10) + '...' : 'none'
        },
        payload
      });

      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`
        },
        body: JSON.stringify(payload)
      });

      const resText = await response.clone().text();

      await traceSchedulerStep(traceId, estimateId, customerName, 3, response.ok ? 'success' : 'failed', {
        endpoint: '/api/estimates/write',
        method: 'POST',
        status: response.status,
        response: resText
      });

      if (!response.ok) {
        throw new Error(resText);
      }
      
      setIsRescheduling(false);
      setShowEventModal(false);

      // STEP 12: Frontend success
      await traceSchedulerStep(traceId, estimateId, customerName, 12, 'success', {
        schedulerUpdated: true,
        jobPortalUpdated: true,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Failed to reschedule job:', error);
      await traceSchedulerStep(traceId, estimateId, customerName, 3, 'failed', {
        error: error.message || String(error)
      });
    }
  };

  const handleRescheduleEstimate = async (eventId: string, newDateStr: string, newTimeStr: string) => {
    const traceId = 'trace-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    try {
      const token = localStorage.getItem('company_admin_token');
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'update-schedule-event',
          scheduleSyncTraceId: traceId,
          id: eventId,
          startDate: newDateStr,
          startTime: newTimeStr
        })
      });
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      await fetchEvents();
      
      setIsRescheduling(false);
      setShowEventModal(false);
    } catch (error) {
      console.error('Failed to reschedule estimate:', error);
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

    const traceId = 'trace-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    try {
        const token = localStorage.getItem('company_admin_token');
        const response = await fetch('/api/estimates/write', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            action: 'create-schedule-event',
            scheduleSyncTraceId: traceId,
            ...newEvent
          })
        });
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        await fetchEvents();
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

    const traceId = 'trace-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    try {
        const token = localStorage.getItem('company_admin_token');
        const response = await fetch('/api/estimates/write', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            action: 'create-schedule-event',
            scheduleSyncTraceId: traceId,
            ...newEvent
          })
        });
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        await fetchEvents();
        setIsAddingBusy(false);
        setShowEventModal(false);
    } catch (error) {
        console.error('Failed to add busy time:', error);
    }
  };

  const deleteEvent = async (id: string, type: 'Job' | 'Estimate' | 'Blackout' | 'Busy') => {
    const traceId = 'trace-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    if (type === 'Blackout' || type === 'Estimate' || type === 'Busy') {
        const token = localStorage.getItem('company_admin_token');
        const response = await fetch('/api/estimates/write', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            action: 'delete-schedule-event',
            scheduleSyncTraceId: traceId,
            id
          })
        });
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        await fetchEvents();
    } else {
        const token = localStorage.getItem('company_admin_token');
        const response = await fetch('/api/estimates/write', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token || ''}`
          },
          body: JSON.stringify({
            action: 'delete-schedule-event',
            scheduleSyncTraceId: traceId,
            id: `install-${id}` // For jobs, we use the install- prefix in schedule_events
          })
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
    }
    setShowEventModal(false);
  };

  const getSelectedDayItems = () => {
    const targetDate = selectedDate || new Date();
    const dateKey = format(targetDate, 'yyyy-MM-dd');
    
    // Day scheduled events
    const dayEvents = events.filter(e => {
      if (e.startDate !== dateKey) return false;
      const view = config.viewFilter;
      if (view === 'both') return true;
      if (view === 'estimates') return e.type === 'Estimate' || e.type === 'Busy';
      if (view === 'jobs') return e.type === 'Job' || e.type === 'Blackout';
      return true;
    });

    const items = dayEvents.map(e => ({
      id: e.id,
      title: e.title,
      type: e.type,
      isJob: false,
      address: e.estimateId ? savedEstimates.find(est => est.id === e.estimateId)?.customerAddress : undefined,
      raw: e
    }));

    // Scheduled jobs (installations)
    const showJobs = config.viewFilter === 'jobs' || config.viewFilter === 'both';
    const activeJobs = showJobs ? scheduledEstimates.filter(est => {
      const start = est.scheduledStartDate!;
      const end = est.scheduledEndDate || start;
      return dateKey >= start.substring(0, 10) && dateKey <= end.substring(0, 10);
    }) : [];

    activeJobs.forEach(job => {
      items.push({
        id: job.id,
        title: job.customerName,
        type: 'Job',
        isJob: true,
        address: job.customerAddress,
        raw: job as any
      });
    });

    return items;
  };

  return (
    <div className="min-h-full bg-[#F5F7FA] p-1 sm:p-6 lg:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-10">
        
        {/* Header */}
        <div className="hidden sm:flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2.5 bg-american-blue rounded-xl text-white">
                <CalendarIcon size={20} />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-american-blue uppercase tracking-tight">Production Scheduler</h1>
            </div>
            <p className="text-xs sm:text-sm font-medium text-[#666666]">Manage installs, blackout dates, and subcontractor capacity.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Legend Indicators */}
            <div className="flex flex-wrap items-center gap-2 bg-white px-3 py-2 rounded-2xl shadow-xs border border-[#E5E5E5] text-[10px] sm:text-xs">
              <div className="flex items-center gap-1.5 pr-2 border-r border-[#E5E5E5]">
                <div className="w-2.5 h-2.5 rounded-full bg-american-blue" />
                <span className="font-extrabold text-[#1A1A1A] uppercase tracking-wider text-[9px]">Installs</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 border-r border-[#E5E5E5]">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="font-extrabold text-[#1A1A1A] uppercase tracking-wider text-[9px]">Appts</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 border-r border-[#E5E5E5]">
                <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span className="font-extrabold text-[#1A1A1A] uppercase tracking-wider text-[9px]">Busy</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 border-r border-[#E5E5E5]">
                <div className="w-2.5 h-2.5 rounded-full bg-american-red" />
                <span className="font-extrabold text-[#1A1A1A] uppercase tracking-wider text-[9px]">Job Blk</span>
              </div>
              <div className="flex items-center gap-1.5 pl-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="font-extrabold text-[#1A1A1A] uppercase tracking-wider text-[9px]">Vacant</span>
              </div>
            </div>

            {/* Print and Settings Controls */}
            <div className="flex items-center gap-2">
              {!readOnly && (
                <button 
                  onClick={() => setShowSettingsModal(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 p-3 bg-white text-american-blue hover:text-american-red rounded-2xl shadow-xs border border-[#E5E5E5] transition-all no-print min-h-[44px] text-xs font-bold uppercase tracking-wider"
                  title="Scheduler Settings"
                >
                  <SettingsIcon size={18} />
                  <span className="sm:hidden">Settings</span>
                </button>
              )}

              <button 
                onClick={handlePrint}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-american-blue text-white px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-american-red transition-all shadow-md no-print min-h-[44px]"
              >
                <Printer size={16} />
                <span>Print</span>
              </button>
            </div>
          </div>
        </div>

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
          
          {/* Main Calendar View */}
          <div className={cn("flex flex-col gap-6 w-full", readOnly ? "lg:col-span-12" : "lg:col-span-8")}>
            <div className="bg-white rounded-3xl p-3 sm:p-8 shadow-xl shadow-american-blue/5 border border-[#E5E5E5]">
              {/* Month Selector */}
              <div className="flex items-center justify-between mb-6 sm:mb-10 px-1 sm:px-0">
                <h2 className="text-2xl sm:text-xl font-black text-american-blue uppercase tracking-tight">{format(currentDate, 'MMMM yyyy')}</h2>
                <div className="flex items-center gap-2 sm:gap-2">
                  <button 
                    onClick={prevMonth}
                    className="p-3.5 bg-[#F5F7FA] hover:bg-[#E5E5E5] rounded-xl transition-all border border-[#E5E5E5] flex items-center justify-center min-w-[48px] min-h-[48px] text-american-blue shadow-xs"
                    title="Previous Month"
                  >
                    <ChevronLeft size={24} />
                  </button>
                  <button 
                    onClick={() => setCurrentDate(new Date())}
                    className="px-4 py-2.5 text-xs font-black text-american-blue hover:bg-american-blue/5 rounded-xl uppercase tracking-widest transition-all min-h-[48px] flex items-center justify-center"
                  >
                    Today
                  </button>
                  <button 
                    onClick={nextMonth}
                    className="p-3.5 bg-[#F5F7FA] hover:bg-[#E5E5E5] rounded-xl transition-all border border-[#E5E5E5] flex items-center justify-center min-w-[48px] min-h-[48px] text-american-blue shadow-xs"
                    title="Next Month"
                  >
                    <ChevronRight size={24} />
                  </button>
                </div>
              </div>

              {/* Mobile View Switcher */}
              {isMobile && (
                <div className="flex p-1 bg-[#F5F7FA] border border-[#E5E5E5] rounded-2xl mb-4 w-full shadow-inner no-print">
                  <button
                    onClick={() => setMobileView('list')}
                    className={cn(
                      "flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all",
                      mobileView === 'list' 
                        ? "bg-american-blue text-white shadow-md" 
                        : "text-[#666666] hover:bg-black/5"
                    )}
                  >
                    List view (Highly readable)
                  </button>
                  <button
                    onClick={() => setMobileView('grid')}
                    className={cn(
                      "flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all",
                      mobileView === 'grid' 
                        ? "bg-american-blue text-white shadow-md" 
                        : "text-[#666666] hover:bg-black/5"
                    )}
                  >
                    6-Day Grid mode
                  </button>
                </div>
              )}

              {/* Calendar Color Legend */}
              {isMobile && (
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 p-3 bg-gray-50 border border-[#E5E5E5] rounded-2xl mb-6 text-[10px] font-black uppercase tracking-wider no-print">
                  <div className="flex items-center gap-1">
                    <span className="px-2 py-0.5 rounded text-[8px] bg-american-blue text-white uppercase font-black leading-none">Job</span>
                    <span className="text-[#666666] font-bold text-[9px]">(J)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded text-[8px] bg-pink-50 text-pink-805 border border-pink-200 uppercase font-black leading-none" style={{ color: '#be185d' }}>Estimate</span>
                    <span className="text-[#666666] font-bold text-[9px]">(C)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded text-[8px] bg-orange-50 text-orange-855 border border-orange-200 uppercase font-black leading-none" style={{ color: '#c2410c' }}>Appt</span>
                    <span className="text-[#666666] font-bold text-[9px]">(A)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded text-[8px] bg-rose-100 text-rose-800 border border-rose-200 uppercase font-black leading-none">Blackout</span>
                    <span className="text-[#666666] font-bold text-[9px]">(Blk)</span>
                  </div>
                </div>
              )}

              {/* Day Headers */}
              <div className={cn(
                "grid mb-4",
                isMobile && mobileView === 'grid' ? "grid-cols-6" : "grid-cols-7",
                isMobile && mobileView === 'list' ? "hidden" : ""
              )}>
                {(isMobile && mobileView === 'grid' 
                  ? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] 
                  : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                ).map((day, dIdx) => (
                  <div key={dIdx} className="text-center">
                    <span className="text-base sm:text-xs font-black text-[#666666] uppercase tracking-widest">{day}</span>
                  </div>
                ))}
              </div>

              {/* Grid or List Container */}
              {isMobile && mobileView === 'list' ? (
                <div className="space-y-4 my-2 no-print">
                  {calendarDays
                    // Filters to only days of the current visible month for accuracy
                    .filter(day => isSameMonth(day, monthStart))
                    .map((day) => {
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

                      const isToday = isSameDay(day, new Date());
                      const isSelected = selectedDate && isSameDay(day, selectedDate);
                      const allDayItems = [
                        ...dayEvents.map(e => ({ id: e.id, type: e.type, title: e.title, raw: e, isJob: false })),
                        ...jobs.map(j => ({ id: j.id, type: 'Job' as const, title: j.customerName, raw: j, isJob: true }))
                      ];

                      return (
                        <div 
                          key={day.toString()}
                          onClick={() => setSelectedDate(isSelected ? null : day)}
                          className={cn(
                            "flex flex-col p-4 bg-white rounded-3xl border transition-all cursor-pointer shadow-sm hover:border-american-blue hover:shadow-md",
                            isToday ? "ring-2 ring-american-red ring-offset-2 border-american-red" : "border-[#E5E5E5]",
                            isSelected ? "ring-2 ring-american-blue border-american-blue" : ""
                          )}
                        >
                          {/* Card Summary row */}
                          <div className="flex items-center gap-4 w-full">
                            {/* Huge Date on Left (at least 60px x 60px layout) */}
                            <div className={cn(
                              "flex flex-col items-center justify-center min-w-[65px] h-[65px] rounded-2xl shrink-0 transition-all shadow-xs",
                              isToday ? "bg-american-red text-white" : 
                              isSelected ? "bg-american-blue text-white" : "bg-[#F5F7FA] text-american-blue"
                            )}>
                              <span className="text-[28px] font-black leading-none">{format(day, 'd')}</span>
                              <span className={cn(
                                "text-[10px] font-black uppercase tracking-wider mt-1",
                                isToday || isSelected ? "text-white/80" : "text-[#999999]"
                              )}>{format(day, 'EEE')}</span>
                            </div>

                            {/* Summary list on right */}
                            <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
                              {allDayItems.length > 0 ? (
                                allDayItems.map((item, idx) => {
                                  let bg = "bg-pink-100 text-pink-850 border-pink-200/50";
                                  let tagText = item.type === 'Job' ? 'Job' : item.type === 'Busy' ? 'Appt' : item.type;
                                  if (item.type === 'Blackout') {
                                    bg = "bg-rose-100 text-rose-800 border-rose-200/50";
                                  } else if (item.type === 'Busy') {
                                    bg = "bg-orange-100 text-orange-850 border-orange-200/50";
                                  } else if (item.type === 'Job') {
                                    bg = "bg-blue-100 text-blue-800 border-blue-200/50";
                                  }

                                  return (
                                    <span 
                                      key={idx} 
                                      className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border leading-none shrink-0", bg)}
                                    >
                                      {tagText}: <span className="font-bold normal-case text-gray-800">{item.title}</span>
                                    </span>
                                  );
                                })
                              ) : (
                                <div className="flex items-center gap-2 text-emerald-600 px-1 py-1">
                                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                  <span className="text-[10px] font-black uppercase tracking-wider">Vacant Slot (Available)</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Beautiful Expanded Detail Section inline */}
                          {isSelected && (
                            <div 
                              className="mt-4 pt-4 border-t border-[#E5E5E5] space-y-4 text-left w-full animate-fade-in"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-black text-american-blue uppercase tracking-[0.15em]">Daily Schedule details</h4>
                                <span className="text-[9px] font-black bg-american-blue/5 text-american-blue px-2.5 py-0.5 rounded-full">
                                  {allDayItems.length} items
                                </span>
                              </div>

                              <div className="space-y-3">
                                {allDayItems.length === 0 ? (
                                  <div className="p-5 bg-emerald-50/50 border border-emerald-100 rounded-2xl text-center">
                                    <CalendarIcon size={20} className="mx-auto text-emerald-400 mb-2" />
                                    <p className="text-xs font-black text-emerald-800">No events scheduled for this day</p>
                                    <p className="text-[9px] text-emerald-600/70 uppercase tracking-widest font-bold mt-0.5">Vacant Day (Fully Open)</p>
                                  </div>
                                ) : (
                                  allDayItems.map((item, idx) => {
                                    let bg = "bg-pink-50 border-pink-100 text-pink-700";
                                    let icon = <CalendarIcon size={14} />;
                                    if (item.type === 'Blackout') {
                                      bg = "bg-rose-50 border-rose-100 text-rose-700";
                                      icon = <AlertCircle size={14} />;
                                    } else if (item.type === 'Busy') {
                                      bg = "bg-orange-50 border-orange-100 text-orange-700";
                                      icon = <Clock size={14} />;
                                    } else if (item.type === 'Estimate') {
                                      bg = "bg-pink-50 border-pink-100 text-pink-700";
                                      icon = <CalendarIcon size={14} />;
                                    } else if (item.type === 'Job') {
                                      bg = "bg-blue-50 border-blue-105 text-blue-700";
                                      icon = <Briefcase size={14} />;
                                    }

                                    const estObj = savedEstimates.find(e => e.id === (item.raw as any).estimateId || e.id === item.id);

                                    return (
                                      <div key={idx} className="p-3.5 bg-[#F8F9FA] border border-[#E5E5E5] rounded-2xl shadow-xs space-y-2.5">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex items-center gap-2">
                                            <span className={cn("p-1 rounded-lg border", bg)}>
                                              {icon}
                                            </span>
                                            <div>
                                              <span className={cn("text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded", bg)}>
                                                {item.type === 'Job' ? 'Fence Install' : item.type === 'Busy' ? 'Appt' : item.type}
                                              </span>
                                              <h5 className="font-black text-american-blue text-[13px] mt-0.5">
                                                {item.title}
                                              </h5>
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-1 shrink-0">
                                            <button
                                              onClick={() => {
                                                setSelectedEvent(item.isJob ? {
                                                  id: item.id,
                                                  type: 'Job',
                                                  title: item.title,
                                                  startDate: (item.raw as any).scheduledStartDate!,
                                                  endDate: (item.raw as any).scheduledEndDate || (item.raw as any).scheduledStartDate!,
                                                  estimateId: item.id,
                                                  userId: user?.uid || ''
                                                } : item.raw as ScheduleEvent);
                                                setShowEventModal(true);
                                              }}
                                              className="p-1.5 text-american-blue hover:bg-american-blue/5 rounded-lg transition-colors flex items-center justify-center min-h-[32px] min-w-[32px]"
                                              title="Manage / Edit"
                                            >
                                              <Eye size={15} />
                                            </button>
                                            {!readOnly && (
                                              <button
                                                onClick={() => deleteEvent(item.id, item.type)}
                                                className="p-1.5 text-american-red hover:bg-american-red/10 rounded-lg transition-colors flex items-center justify-center min-h-[32px] min-w-[32px]"
                                                title="Delete"
                                              >
                                                <Trash2 size={15} />
                                              </button>
                                            )}
                                          </div>
                                        </div>

                                        {estObj && (
                                          <div className="text-[10px] text-[#666666] font-medium space-y-1.5 bg-white p-2.5 rounded-xl border border-gray-150">
                                            {estObj.customerAddress && (
                                              <div className="space-y-1">
                                                <p className="flex items-center gap-1">
                                                  <span className="font-bold text-[#999] shrink-0">ADDR:</span> 
                                                  <span className="truncate font-black text-american-blue uppercase">{estObj.customerAddress}</span>
                                                </p>
                                                <a
                                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(estObj.customerAddress)}`}
                                                  target="_blank"
                                                  referrerPolicy="no-referrer"
                                                  rel="noopener noreferrer"
                                                  className="inline-flex items-center gap-1 bg-american-blue/5 hover:bg-american-blue/10 text-american-blue p-1.5 rounded-lg font-black uppercase text-[8px] tracking-widest"
                                                >
                                                  <ExternalLink size={10} />
                                                  <span>Get Directions</span>
                                                </a>
                                              </div>
                                            )}
                                            {estObj.customerPhone && (
                                              <p className="flex items-center gap-1">
                                                <span className="font-bold text-[#999]">TEL:</span>
                                                <a href={`tel:${estObj.customerPhone}`} className="text-american-blue hover:underline font-black">{estObj.customerPhone}</a>
                                              </p>
                                            )}
                                            <p className="flex items-center gap-2 mt-1 pt-1.5 border-t border-gray-200/50 text-[9px] font-bold text-[#999]">
                                              <span>{(estObj.linearFeet || 0).toFixed(0)}' LF</span>
                                              <span>•</span>
                                              <span>{item.type === 'Job' ? `${estObj.scheduledDuration || 2} Days` : 'Assessment'}</span>
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>

                              {/* Create / Block Time Buttons directly inline */}
                              {!readOnly && (
                                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
                                  <button 
                                    onClick={() => {
                                      setIsAddingEstimate(true);
                                      setSelectedEvent(null);
                                      setShowEventModal(true);
                                    }}
                                    className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-all min-h-[44px]"
                                  >
                                    <CalendarIcon size={14} />
                                    <span className="text-[8px] font-black uppercase tracking-wider">Add Est</span>
                                  </button>
                                  <button 
                                    onClick={() => {
                                      setIsAddingBusy(true);
                                      setSelectedEvent(null);
                                      setShowEventModal(true);
                                    }}
                                    className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 transition-all min-h-[44px]"
                                  >
                                    <Clock size={14} />
                                    <span className="text-[8px] font-black uppercase tracking-wider">Busy Appt</span>
                                  </button>
                                  <button 
                                    onClick={() => {
                                      setIsAddingBlackout(true);
                                      setSelectedEvent(null);
                                      setShowEventModal(true);
                                    }}
                                    className="flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 transition-all min-h-[44px]"
                                  >
                                    <AlertCircle size={14} />
                                    <span className="text-[8px] font-black uppercase tracking-wider text-rose-700">Blackout</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className={cn(
                  "grid gap-1.5 sm:gap-px bg-[#F5F7FA] sm:bg-[#E5E5E5] border border-transparent sm:border-[#E5E5E5] rounded-2xl overflow-hidden shadow-inner",
                  isMobile && mobileView === 'grid' ? "grid-cols-6" : "grid-cols-7"
                )}>
                  {calendarDays
                    .filter(day => {
                      if (isMobile && mobileView === 'grid') {
                        // Omit Sunday to render exactly 6 days per row
                        return day.getDay() !== 0;
                      }
                      return true;
                    })
                    .map((day, idx) => {
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
                      const isSelected = selectedDate && isSameDay(day, selectedDate);
                      
                      // Combine events and jobs
                      const dayAllItems = [
                        ...dayEvents.map(e => ({ id: e.id, type: e.type, title: e.title, raw: e, isJob: false })),
                        ...jobs.map(j => ({ id: j.id, type: 'Job' as const, title: j.customerName, raw: j, isJob: true }))
                      ];

                      return (
                        <div 
                          key={day.toString()}
                          onClick={() => handleDayClick(day)}
                          className={cn(
                            "min-h-[110px] bg-white p-2 sm:p-3 cursor-pointer group transition-all flex flex-col justify-between shadow-xs sm:shadow-none rounded-2xl sm:rounded-none",
                            !isCurrentMonth && "bg-[#F8F9FA]/50 opacity-60",
                            isToday && "bg-american-blue/[0.02] ring-2 ring-american-red ring-inset",
                            isSelected && "ring-2 ring-american-blue ring-inset bg-american-blue/[0.01]"
                          )}
                        >
                          <div className="flex justify-between items-start">
                            <span className={cn(
                              "text-[28px] sm:text-sm font-black w-10 h-10 sm:w-7 sm:h-7 flex items-center justify-center rounded-full transition-all leading-none",
                              isToday ? "bg-american-red text-white shadow-md font-bold" : 
                              isSelected ? "bg-american-blue text-white shadow-md font-bold" :
                              "text-[#1A1A1A] group-hover:bg-[#F5F7FA]",
                              !isCurrentMonth && "text-[#BBBBBB]"
                            )}>
                              {format(day, 'd')}
                            </span>
                          </div>

                          {/* Events content */}
                          {!isMobile ? (
                            <div className="space-y-1 mt-2">
                              {dayEvents.map(event => (
                                <div 
                                  key={event.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedDate(day);
                                    setSelectedEvent(event);
                                    setShowEventModal(true);
                                  }}
                                  className={cn(
                                    "text-[9px] font-bold p-1 rounded-md flex items-center gap-1 leading-tight truncate cursor-pointer transition-all hover:scale-105 active:scale-95",
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
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedDate(day);
                                    setSelectedEvent({
                                      id: job.id,
                                      type: 'Job',
                                      title: job.customerName,
                                      startDate: job.scheduledStartDate!,
                                      endDate: job.scheduledEndDate || job.scheduledStartDate!,
                                      estimateId: job.id,
                                      userId: user?.uid || ''
                                    });
                                    setShowEventModal(true);
                                  }}
                                  className="text-[9px] font-bold p-1 rounded-md flex items-center gap-1 leading-tight truncate bg-american-blue text-white shadow-xs cursor-pointer transition-all hover:scale-105 active:scale-95"
                                >
                                  <CheckCircle2 size={8} />
                                  {job.customerName}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex flex-row flex-wrap gap-1.5 justify-center items-center mt-2 pb-1 w-full">
                              {dayAllItems.slice(0, 2).map((item, idx) => {
                                let bg = "bg-amber-500 text-white";
                                let label = "A";
                                
                                if (item.type === 'Blackout') {
                                  bg = "bg-rose-500 text-white font-black animate-pulse";
                                  label = "Blk";
                                } else if (item.type === 'Busy') {
                                  bg = "bg-orange-500 text-white font-black";
                                  label = "A";
                                } else if (item.type === 'Estimate') {
                                  bg = "bg-pink-500 text-white font-black";
                                  label = "C";
                                } else {
                                  bg = "bg-american-blue text-white font-black";
                                  label = "J";
                                }

                                return (
                                  <div
                                    key={idx}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedDate(day);
                                      setSelectedEvent(item.isJob ? {
                                        id: item.id,
                                        type: 'Job',
                                        title: item.title,
                                        startDate: (item.raw as any).scheduledStartDate!,
                                        endDate: (item.raw as any).scheduledEndDate || (item.raw as any).scheduledStartDate!,
                                        estimateId: item.id,
                                        userId: user?.uid || ''
                                      } : item.raw as ScheduleEvent);
                                      setShowEventModal(true);
                                    }}
                                    className={cn(
                                      "w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shadow-md border border-white transition-transform active:scale-90 cursor-pointer shrink-0",
                                      bg
                                    )}
                                  >
                                    {label}
                                  </div>
                                );
                              })}
                              
                              {/* Overlapping preventer "+more" indicator */}
                              {dayAllItems.length > 2 && (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDayClick(day);
                                  }}
                                  className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black bg-gray-500 text-white shadow-md border border-white transition-transform active:scale-90 cursor-pointer shrink-0"
                                  title={`${dayAllItems.length - 2} more items`}
                                >
                                  +{dayAllItems.length - 2}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Agenda details section below the calendar grid for quick view & interaction */}
              {isMobile && (
                <div className="mt-8 border-t border-[#E5E5E5] pt-6 text-left" id="mobile-selected-day-agenda-section">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[16px] font-black text-american-blue uppercase tracking-wider">
                      Agenda: {format(selectedDate || new Date(), 'EEEE, MMM d, yyyy')}
                    </h4>
                    {!readOnly && (
                      <button
                        onClick={() => {
                          setSelectedDate(selectedDate || new Date());
                          setIsAddingBlackout(false);
                          setIsAddingEstimate(false);
                          setIsAddingBusy(false);
                          setIsCreatingNewDossier(false);
                          setSelectedEvent(null);
                          setShowEventModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 bg-american-blue/5 text-american-blue border border-american-blue/15 hover:bg-american-blue hover:text-white transition-all px-4 py-2.5 rounded-xl text-xs font-bold leading-none min-h-[44px]"
                      >
                        <Plus size={14} />
                        <span>Add Action</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {getSelectedDayItems().length > 0 ? (
                      getSelectedDayItems().map((item, iIdx) => (
                        <div
                          key={iIdx}
                          onClick={() => {
                            setSelectedEvent(item.isJob ? {
                              id: item.id,
                              type: 'Job',
                              title: item.title,
                              startDate: (item.raw as any).scheduledStartDate!,
                              endDate: (item.raw as any).scheduledEndDate || (item.raw as any).scheduledStartDate!,
                              estimateId: item.id,
                              userId: user?.uid || ''
                            } : item.raw);
                            setShowEventModal(true);
                          }}
                          className="p-4 rounded-2xl bg-[#F8F9FA] border border-[#E5E5E5] active:border-american-blue cursor-pointer transition-all flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 text-white",
                              item.type === 'Blackout' ? 'bg-rose-500' :
                              item.type === 'Estimate' ? 'bg-amber-500' :
                              item.type === 'Busy' ? 'bg-purple-500' : 'bg-american-blue'
                            )}>
                              {item.type === 'Blackout' ? <AlertCircle size={20} /> :
                               item.type === 'Busy' ? <Clock size={20} /> :
                               item.type === 'Estimate' ? <CalendarIcon size={20} /> :
                               <Briefcase size={20} />}
                            </div>
                            <div className="text-left">
                              <p className="text-[16px] font-black text-american-blue leading-tight">{item.title}</p>
                              <p className="text-sm text-[#666666] font-medium mt-1 leading-normal">
                                {item.type} {item.raw.isAllDay ? '(All Day)' : item.raw.startTime ? `@ ${item.raw.startTime}` : ''}
                                {item.address ? ` • ${item.address}` : ''}
                              </p>
                            </div>
                          </div>
                          <ChevronRight size={18} className="text-[#999999] shrink-0" />
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 px-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-850">
                        <p className="text-sm font-black uppercase tracking-wider text-emerald-800">No active events today.</p>
                        <p className="text-xs text-emerald-600/70 mt-1">Ready for scheduled works or appointments.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Side Panel: Unscheduled items & Pending Estimates */}
          {!readOnly && (
            <div className="hidden lg:flex lg:col-span-4 flex-col gap-6 sm:gap-8 w-full">
              
              {/* Pending Estimates List */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E5E5E5] shadow-xl shadow-american-blue/5 h-fit text-left">
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
                                  <p className="text-[10px] font-bold text-[#999999] uppercase truncate max-w-[150px] sm:max-w-[200px]">{est.customerAddress}</p>
                               </div>
                               <div className="text-[10px] font-black text-white bg-american-red px-2 py-1 rounded-lg shrink-0">
                                  {Math.round(est.linearFeet)}'
                                </div>
                            </div>
                            
                            <div className="flex items-center justify-between mt-4">
                              <div className="flex items-center gap-1">
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
                                          userId: user?.uid || ''
                                      });
                                      setShowEventModal(true);
                                  }}
                                  className="text-[10px] font-black text-american-blue uppercase tracking-tighter hover:underline min-h-[36px] px-2.5"
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

              {/* Unscheduled Orders list */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E5E5E5] shadow-xl shadow-american-blue/5 h-fit text-left">
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
                                  <p className="text-[10px] font-bold text-[#999999] uppercase truncate max-w-[150px] sm:max-w-[200px]">{est.customerAddress}</p>
                               </div>
                               <div className="text-[10px] font-black text-american-blue bg-white px-2 py-1 rounded-lg border border-[#E5E5E5] shrink-0">
                                  {Math.round(est.linearFeet)}' LF
                               </div>
                            </div>
                            
                            <div className="flex items-center justify-between mt-4">
                              <div className="flex items-center gap-1">
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
                                          userId: user?.uid || ''
                                      });
                                      setShowEventModal(true);
                                  }}
                                  className="text-[10px] font-black text-american-blue uppercase tracking-tighter hover:underline min-h-[36px] px-2.5"
                              >
                                  Assign Slot
                              </button>
                            </div>
                          </div>
                      ))
                  ) : (
                      <div className="text-center py-10 opacity-30">
                          <CalendarIcon size={40} className="mx-auto mb-4 text-[#999]" />
                          <p className="text-xs font-bold uppercase tracking-widest leading-relaxed">All active contracts are<br/>currently scheduled.</p>
                      </div>
                  )}
                </div>
              </div>

              {/* Blackout Actions */}
              <div className="bg-american-blue p-6 sm:p-8 rounded-3xl text-white relative overflow-hidden shadow-xl text-left">
                   <div className="absolute top-0 right-0 p-6 opacity-10">
                      <User size={60} />
                   </div>
                   <h4 className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] mb-2 opacity-60">Subcontractor Pool</h4>
                   <p className="text-lg sm:text-xl font-black mb-4">Availability Management</p>
                   <p className="text-xs text-white/70 leading-relaxed mb-6">Mark dates as blackout to prevent overlaps or overbooking your installation teams.</p>
                   <button 
                      onClick={() => {
                          const today = new Date();
                          setSelectedDate(today);
                          setIsAddingBlackout(true);
                          setIsAddingEstimate(false);
                          setIsAddingBusy(false);
                          setSelectedEvent(null);
                          setShowEventModal(true);
                      }}
                      className="w-full bg-american-red hover:bg-white hover:text-american-red text-white transition-all py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 min-h-[44px]"
                   >
                      <AlertCircle size={16} />
                      Blackout Today
                   </button>
              </div>

            </div>
          )}
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
              className="relative bg-white w-full max-w-sm rounded-3xl sm:rounded-[40px] shadow-2xl overflow-hidden text-left"
            >
              <div className="p-6 sm:p-10">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-base sm:text-xl font-black text-american-blue uppercase tracking-tight">Calendar Settings</h3>
                  <button onClick={() => setShowSettingsModal(false)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#999999] hover:text-american-red">
                    <XCircle size={22} />
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
                            "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all min-h-[44px]",
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
                      className="w-full p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5] text-sm font-bold outline-none focus:border-american-blue min-h-[44px]"
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
                        className="w-full p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5] text-sm font-bold outline-none focus:border-american-blue min-h-[44px]"
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
                        className="w-full p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5] text-sm font-bold outline-none focus:border-american-blue min-h-[44px]"
                      >
                        {Array.from({ length: 24 }).map((_, i) => (
                          <option key={i} value={i}>{i}:00</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button 
                    onClick={() => setShowSettingsModal(false)}
                    className="w-full bg-american-blue py-4 rounded-2xl text-white font-black uppercase text-xs tracking-widest shadow-xl mt-4 min-h-[48px]"
                  >
                    Done
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Event/Scheduling Actions Modal */}
      <AnimatePresence>
        {showEventModal && selectedDate && (
          <div className={cn(
              "fixed inset-0 z-50 flex items-center justify-center overflow-y-auto no-print",
              isMobile ? "p-0" : "p-4"
          )}>
            {!isMobile && (
              <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 onClick={() => {
                     setShowEventModal(false);
                     setIsAddingBlackout(false);
                     setIsAddingEstimate(false);
                     setIsAddingBusy(false);
                     setSelectedEvent(null);
                     setIsRescheduling(false);
                 }}
                 className="absolute inset-0 bg-american-blue/60 backdrop-blur-md" 
              />
            )}
            <motion.div 
              initial={isMobile ? { y: '100%' } : { scale: 0.9, opacity: 0, y: 20 }}
              animate={isMobile ? { y: 0 } : { scale: 1, opacity: 1, y: 0 }}
              exit={isMobile ? { y: '100%' } : { scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className={cn(
                "bg-white text-left shadow-2xl",
                isMobile 
                  ? "fixed inset-0 z-50 w-full h-full flex flex-col p-6 overflow-hidden" 
                  : "relative w-full max-w-md rounded-3xl sm:rounded-[40px] overflow-hidden border border-white/10 my-8"
              )}
            >
              <div className={cn(
                "flex flex-col h-full overflow-hidden",
                !isMobile && "p-6 sm:p-10 max-h-[90vh] overflow-y-auto custom-scrollbar"
              )}>
                <div className="flex items-center justify-between mb-6 shrink-0">
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-american-blue uppercase tracking-tight leading-snug">
                        {isAddingBlackout ? 'Job Blackout' : isAddingBusy ? 'Busy Appointment' : isAddingEstimate ? 'Schedule Appointment' : selectedEvent?.type === 'Job' ? 'Schedule Job' : selectedEvent?.type === 'Blackout' ? 'Manage Blackout' : selectedEvent?.type === 'Estimate' ? 'Manage Appointment' : selectedEvent?.type === 'Busy' ? 'Manage Busy Time' : 'Day Actions'}
                    </h3>
                    <p className="text-xs font-black text-[#999999] uppercase tracking-widest mt-1">
                        {format(selectedDate, 'EEEE, MMMM do, yyyy')}
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                        setShowEventModal(false);
                        setIsAddingBlackout(false);
                        setIsAddingEstimate(false);
                        setIsAddingBusy(false);
                        setSelectedEvent(null);
                        setIsRescheduling(false);
                    }}
                    className="h-11 w-11 rounded-xl bg-[#F5F7FA] flex items-center justify-center text-[#999999] hover:text-american-red transition-colors shrink-0"
                  >
                    <XCircle size={22} />
                  </button>
                </div>

                <div className={cn(
                  "space-y-6 flex-1",
                  isMobile ? "overflow-y-auto pr-1 pb-8 custom-scrollbar" : ""
                )}>
                    {isModalLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
                            <div className="relative w-12 h-12">
                                <div className="absolute inset-0 rounded-full border-4 border-american-blue/20"></div>
                                <div className="absolute inset-0 rounded-full border-4 border-american-blue border-t-transparent animate-spin"></div>
                            </div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#999999] mt-4">Loading Day Schedule...</p>
                        </div>
                    ) : isAddingBlackout ? (
                        <div className="space-y-6">
                            <div className="p-5 bg-american-red/5 border border-american-red/10 rounded-2xl">
                                <div className="flex items-center gap-3 text-american-red mb-2">
                                    <AlertCircle size={18} />
                                    <h4 className="font-black uppercase text-xs tracking-wider">Confirm Job Blackout</h4>
                                </div>
                                <p className="text-xs text-[#666666] leading-relaxed">This will mark this day as unavailable for any new fence installations. Estimates can still be scheduled.</p>
                            </div>
                            <button 
                                onClick={() => addBlackout(selectedDate)}
                                className="w-full bg-american-blue py-4 rounded-2xl text-white font-black uppercase text-xs tracking-widest shadow-xl hover:shadow-american-blue/20 transition-all min-h-[48px]"
                            >
                                Lock Jobs
                            </button>
                        </div>
                    ) : isAddingBusy ? (
                        <div className="space-y-6">
                            <div className="p-5 bg-purple-50 border border-purple-100 rounded-2xl">
                                <div className="flex items-center gap-3 text-purple-700 mb-2">
                                    <Clock size={18} />
                                    <h4 className="font-black uppercase text-xs tracking-wider">Custom Appointment / Busy</h4>
                                </div>
                                <p className="text-xs text-purple-800 leading-relaxed font-bold">Block time for estimate appointments (Vacations/Personal time).</p>
                            </div>

                            <div className="space-y-4 text-left">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-[#999999] uppercase tracking-widest px-1">Reason / Description</label>
                                    <input 
                                        type="text" 
                                        id="busy-title"
                                        placeholder="e.g. Doctor Appt, Vacation..."
                                        className="w-full p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5] text-sm font-bold outline-none focus:border-american-blue min-h-[44px]"
                                    />
                                </div>

                                <div className="flex items-center justify-between p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5]">
                                    <label className="text-xs font-black text-american-blue uppercase tracking-wider">All Day Window</label>
                                    <button 
                                        onClick={() => setBusyAllDay(!busyAllDay)}
                                        className={cn(
                                            "w-12 h-6 rounded-full transition-all relative p-1 shrink-0",
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
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-[#999999] uppercase tracking-widest px-1">Start</label>
                                                <input 
                                                    type="time" 
                                                    value={busyStart}
                                                    onChange={(e) => setBusyStart(e.target.value)}
                                                    className="w-full p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5] text-sm font-bold outline-none focus:border-american-blue min-h-[44px]"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-[#999999] uppercase tracking-widest px-1">End</label>
                                                <input 
                                                    type="time" 
                                                    value={busyEnd}
                                                    onChange={(e) => setBusyEnd(e.target.value)}
                                                    className="w-full p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5] text-sm font-bold outline-none focus:border-american-blue min-h-[44px]"
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
                                className="w-full bg-american-blue py-4 rounded-2xl text-white font-black uppercase text-xs tracking-widest shadow-xl hover:shadow-american-blue/20 transition-all min-h-[48px]"
                            >
                                {busyAllDay ? 'Block Full Day' : 'Block Selected Time'}
                            </button>
                        </div>
                    ) : isAddingEstimate ? (
                        <div className="space-y-6">
                            <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl">
                                <div className="flex items-center gap-3 text-amber-600 mb-2">
                                    <CalendarIcon size={18} />
                                    <h4 className="font-black uppercase text-xs tracking-wider">Estimate Appointment</h4>
                                </div>
                                <p className="text-xs text-amber-800 leading-relaxed font-bold">Duration: {config.appointmentDuration} Minutes</p>
                                <p className="text-[10px] text-amber-700/70 mt-1 uppercase tracking-widest font-black">Available Between {config.startHour}:00 - {config.endHour}:00</p>
                            </div>

                            <div className="space-y-1.5 text-left">
                                <label className="text-[10px] font-black text-[#999999] uppercase tracking-widest px-1">Appointment Time</label>
                                <input 
                                    type="time" 
                                    value={estimateTime}
                                    onChange={(e) => setEstimateTime(e.target.value)}
                                    className="w-full p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5] text-sm font-bold outline-none focus:border-american-blue min-h-[44px]"
                                />
                            </div>

                            <div className="flex items-center justify-between mb-2 mt-4">
                               <h4 className="text-[10px] font-black text-[#999999] uppercase tracking-[0.2em]">
                                   {isCreatingNewDossier ? 'New Lead Details' : 'Select Estimate'}
                               </h4>
                               <button 
                                 onClick={() => {
                                     setIsCreatingNewDossier(!isCreatingNewDossier);
                                     setNewDossierData({ name: '', phone: '', address: '', email: '' });
                                 }}
                                 className="text-[10px] font-black text-american-blue uppercase tracking-widest hover:text-american-red transition-all py-1 px-2.5 min-h-[36px]"
                               >
                                   {isCreatingNewDossier ? 'Cancel' : '+ Add New'}
                               </button>
                            </div>

                            {isCreatingNewDossier ? (
                                <div className="space-y-3.5 p-5 bg-american-blue/5 rounded-2xl border border-american-blue/10 text-left">
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-[#999999] uppercase tracking-widest pl-2">Customer Name*</label>
                                        <input 
                                            type="text" 
                                            placeholder="Full Name"
                                            value={newDossierData.name}
                                            onChange={(e) => setNewDossierData({...newDossierData, name: e.target.value})}
                                            className="w-full p-3 bg-white rounded-xl border border-[#E5E5E5] text-xs font-bold outline-none focus:border-american-blue min-h-[40px]"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-35">
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-[#999999] uppercase tracking-widest pl-2">Phone*</label>
                                            <input 
                                                type="tel" 
                                                placeholder="(000) 000-0000"
                                                value={newDossierData.phone}
                                                onChange={(e) => setNewDossierData({...newDossierData, phone: e.target.value})}
                                                className="w-full p-3 bg-white rounded-xl border border-[#E5E5E5] text-xs font-bold outline-none focus:border-american-blue min-h-[40px]"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-[#999999] uppercase tracking-widest pl-2">Email (Optional)</label>
                                            <input 
                                                type="email" 
                                                placeholder="email@example.com"
                                                value={newDossierData.email}
                                                onChange={(e) => setNewDossierData({...newDossierData, email: e.target.value})}
                                                className="w-full p-3 bg-white rounded-xl border border-[#E5E5E5] text-xs font-bold outline-none focus:border-american-blue min-h-[40px]"
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
                                            className="w-full p-3 bg-white rounded-xl border border-[#E5E5E5] text-xs font-bold outline-none focus:border-american-blue min-h-[40px]"
                                        />
                                    </div>
                                    <button 
                                        onClick={quickCreateAndSchedule}
                                        className="w-full bg-american-blue py-4 rounded-2xl text-white font-black uppercase text-xs tracking-widest shadow-xl hover:bg-american-red transition-all mt-2 min-h-[48px]"
                                    >
                                        Create & Schedule
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar text-left">
                                    {pendingDossiers.length > 0 ? (
                                        pendingDossiers.map(est => (
                                            <button 
                                                key={est.id}
                                                onClick={() => scheduleEstimate(est.id, selectedDate)}
                                                className="w-full text-left p-4 rounded-2xl border border-[#E5E5E5] hover:border-american-blue hover:bg-american-blue/5 transition-all group min-h-[48px]"
                                            >
                                                <p className="text-xs font-black text-[#1A1A1A] group-hover:text-american-blue leading-snug">{est.customerName}</p>
                                                <p className="text-[9px] font-bold text-[#999999] uppercase mt-1 leading-none">{(est.linearFeet || 0).toFixed(0)}' LF • {est.customerAddress}</p>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="text-center py-6 px-4">
                                            <p className="text-xs italic text-[#999999] mb-4">No pending estimates available.</p>
                                            <button 
                                              onClick={() => setIsCreatingNewDossier(true)}
                                              className="text-[10px] font-black text-american-blue uppercase tracking-widest bg-american-blue/5 px-6 py-3 rounded-xl hover:bg-american-blue hover:text-white transition-all shadow-sm border border-american-blue/10 min-h-[44px]"
                                            >
                                              + Quick Add Lead
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : isRescheduling && selectedEvent ? (
                        <div className="space-y-6 text-left animate-fade-in">
                            <div className="p-5 sm:p-7 bg-[#F8F9FA] rounded-2xl border border-[#E5E5E5] space-y-4">
                                <h4 className="text-base font-black text-american-blue uppercase tracking-wider">Reschedule Date / Time</h4>
                                
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-[#999999] uppercase tracking-widest px-1">Select New Start Date</label>
                                    <input 
                                        type="date"
                                        value={rescheduleDateStr}
                                        onChange={(e) => setRescheduleDateStr(e.target.value)}
                                        className="w-full p-4 bg-white rounded-2xl border border-[#E5E5E5] text-base font-black outline-none focus:border-american-blue min-h-[44px]"
                                    />
                                </div>

                                {selectedEvent.type === 'Job' ? (
                                  <div className="space-y-1.5">
                                      <label className="text-[10px] font-black text-[#999999] uppercase tracking-widest px-1">Installation Duration (Days)</label>
                                      <div className="flex items-center gap-2">
                                          {[1, 2, 3, 4, 5].map(d => (
                                              <button
                                                  key={d}
                                                  type="button"
                                                  onClick={() => setRescheduleDuration(d)}
                                                  className={cn(
                                                      "h-11 w-11 flex items-center justify-center rounded-xl font-bold text-xs transition-all min-h-[44px] min-w-[44px]",
                                                      rescheduleDuration === d 
                                                          ? "bg-american-blue text-white shadow-md shadow-american-blue/20" 
                                                          : "bg-white border border-[#E5E5E5] text-american-blue hover:border-american-blue"
                                                  )}
                                              >
                                                  {d}
                                              </button>
                                          ))}
                                      </div>
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                      <label className="text-[10px] font-black text-[#999999] uppercase tracking-widest px-1">Appointment Time</label>
                                      <input 
                                          type="time"
                                          value={rescheduleTimeStr}
                                          onChange={(e) => setRescheduleTimeStr(e.target.value)}
                                          className="w-full p-4 bg-white rounded-2xl border border-[#E5E5E5] text-base font-black outline-none focus:border-american-blue min-h-[44px]"
                                      />
                                  </div>
                                )}

                                <div className="flex gap-3 pt-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsRescheduling(false)}
                                        className="flex-1 py-3 border border-[#E5E5E5] rounded-xl text-xs font-black text-[#666] uppercase hover:bg-gray-100 min-h-[44px]"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (selectedEvent.type === 'Job') {
                                                handleRescheduleJob(selectedEvent.estimateId || selectedEvent.id, rescheduleDateStr, rescheduleDuration);
                                            } else {
                                                handleRescheduleEstimate(selectedEvent.id, rescheduleDateStr, rescheduleTimeStr);
                                            }
                                        }}
                                        className="flex-1 py-3 bg-american-blue text-white rounded-xl text-xs font-black uppercase hover:bg-american-red transition-all min-h-[44px]"
                                    >
                                        Save Date
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : selectedEvent ? (
                        (() => {
                          const estimateObj = savedEstimates.find(e => e.id === selectedEvent.estimateId || e.id === selectedEvent.id);
                          return (
                            <div className="space-y-6 text-left animate-fade-in">
                                <div className="p-5 sm:p-7 bg-[#F8F9FA] rounded-2xl border border-[#E5E5E5] space-y-5">
                                    
                                    {/* Main Event Type Badge */}
                                    <div className="flex items-center gap-3">
                                         <div className={cn(
                                             "h-12 w-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-sm",
                                             selectedEvent.type === 'Blackout' ? 'bg-rose-500' : 
                                             selectedEvent.type === 'Estimate' ? 'bg-amber-500' : 
                                             selectedEvent.type === 'Busy' ? 'bg-purple-500' : 'bg-american-blue'
                                         )}>
                                             {selectedEvent.type === 'Blackout' ? <AlertCircle size={22} /> : 
                                              selectedEvent.type === 'Busy' ? <Clock size={22} /> :
                                              selectedEvent.type === 'Estimate' ? <CalendarIcon size={22} /> :
                                              <Briefcase size={22} />}
                                         </div>
                                         <div>
                                             <span className={cn(
                                                 "px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider text-white",
                                                 selectedEvent.type === 'Blackout' ? 'bg-rose-500' : 
                                                 selectedEvent.type === 'Estimate' ? 'bg-amber-500' : 
                                                 selectedEvent.type === 'Busy' ? 'bg-purple-500' : 'bg-american-blue'
                                             )}>
                                                 {selectedEvent.type === 'Job' ? 'Fence Installation' : selectedEvent.type}
                                             </span>
                                             {selectedEvent.type === 'Job' && estimateObj && (
                                                 <p className="text-xs font-black text-american-blue uppercase tracking-tight mt-1">
                                                     Japanese Cedar Wooden Fence
                                                 </p>
                                             )}
                                         </div>
                                    </div>

                                    {/* Date Section (Enhanced) */}
                                    <div className="pt-2">
                                        <p className="text-[11px] font-black text-[#999999] uppercase tracking-widest leading-none mb-1.5">
                                            Scheduled Date
                                        </p>
                                        <p className="text-lg sm:text-xl font-black text-american-blue uppercase leading-snug">
                                            {format(parseLocalDate(selectedEvent.startDate), 'EEEE, MMMM do, yyyy')}
                                        </p>
                                        {selectedEvent.type === 'Job' && selectedEvent.endDate && selectedEvent.endDate !== selectedEvent.startDate && (
                                            <div className="mt-1.5 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#999]" />
                                                <p className="text-xs font-bold text-[#666666]">
                                                    Through {format(parseLocalDate(selectedEvent.endDate), 'EEEE, MMMM do, yyyy')}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Customer Name Section */}
                                    {selectedEvent.type !== 'Blackout' && selectedEvent.type !== 'Busy' && (
                                        <div>
                                            <p className="text-[11px] font-black text-[#999999] uppercase tracking-widest leading-none mb-1.5">
                                                Customer Name
                                            </p>
                                            <p className="text-lg sm:text-xl font-black text-american-blue uppercase leading-snug">
                                                {estimateObj?.customerName || selectedEvent.title}
                                            </p>
                                            {estimateObj?.customerPhone && (
                                                <p className="text-sm font-bold text-american-blue hover:underline mt-1">
                                                    <a href={`tel:${estimateObj.customerPhone}`}>{estimateObj.customerPhone}</a>
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Address & Navigation */}
                                    {estimateObj?.customerAddress && (
                                        <div className="space-y-2 pt-2">
                                            <div>
                                                <p className="text-[11px] font-black text-[#999999] uppercase tracking-widest leading-none mb-1.5">
                                                    Site Address
                                                </p>
                                                <p className="text-sm sm:text-base text-[#333333] font-black uppercase leading-normal">
                                                    {estimateObj.customerAddress}
                                                </p>
                                            </div>
                                            
                                            <a
                                               href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(estimateObj.customerAddress)}`}
                                               target="_blank"
                                               referrerPolicy="no-referrer"
                                               rel="noopener noreferrer"
                                               className="flex items-center justify-center gap-2.5 w-full bg-american-blue hover:bg-american-red text-white py-4 sm:py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all min-h-[48px] shadow-xs cursor-pointer mt-2"
                                            >
                                               <ExternalLink size={15} />
                                               <span>Navigate to Site</span>
                                            </a>
                                        </div>
                                    )}

                                    {/* Duration details */}
                                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[#E5E5E5]">
                                         <div>
                                             <p className="text-[10px] font-black text-[#999999] uppercase tracking-widest mb-1">Type of Work</p>
                                             <p className="text-xs font-black text-american-blue uppercase leading-none">
                                                 {selectedEvent.type === 'Job' ? 'Project Install' : 'Assessment Visit'}
                                             </p>
                                         </div>
                                         <div>
                                             <p className="text-[10px] font-black text-[#999999] uppercase tracking-widest mb-1">Work Duration</p>
                                             <p className="text-xs font-black text-american-blue uppercase leading-none">
                                                 {selectedEvent.type === 'Job' 
                                                   ? `${estimateObj?.scheduledDuration || 2} Days`
                                                   : `${config.appointmentDuration} Minutes`}
                                             </p>
                                         </div>
                                    </div>

                                    {/* GHL Integration metadata sync badges */}
                                    {(selectedEvent.source === 'GHL Calendar' || selectedEvent.appointmentId || selectedEvent.ghlAppointmentId) && (
                                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 mt-4 space-y-2">
                                            <div className="flex items-center gap-1.5 text-emerald-800">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                <p className="text-[10px] font-black uppercase tracking-wider">Source: GHL Calendar Sync</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                                <div>
                                                    <span className="text-slate-500 block">Appointment ID</span>
                                                    <span className="font-mono text-slate-800 break-all select-all font-semibold">
                                                        {selectedEvent.appointmentId || selectedEvent.ghlAppointmentId || 'N/A'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500 block">Synced At</span>
                                                    <span className="text-slate-800 font-semibold">
                                                        {selectedEvent.syncedAt ? format(new Date(selectedEvent.syncedAt), 'MMM d, h:mm a') : 'Recently'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Action Buttons */}
                                <div className="flex flex-col gap-3">
                                    {!readOnly && (
                                        <div className="grid grid-cols-2 gap-3">
                                             <button
                                                 type="button"
                                                 onClick={() => {
                                                     setRescheduleDateStr(selectedEvent.startDate || "");
                                                     setRescheduleTimeStr(selectedEvent.startTime || "09:00");
                                                     setRescheduleDuration(typeof estimateObj?.scheduledDuration === 'number' ? estimateObj.scheduledDuration : parseInt(String(estimateObj?.scheduledDuration || 2), 10) || 2);
                                                     setIsRescheduling(true);
                                                 }}
                                                 className="w-full bg-[#F5F7FA] hover:bg-[#E5E5E5] text-american-blue border border-[#E5E5E5] py-4 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all min-h-[48px]"
                                             >
                                                 <Clock size={16} />
                                                 <span>Reschedule</span>
                                             </button>
                                             
                                             <button 
                                                 type="button"
                                                 onClick={() => deleteEvent(selectedEvent.id, selectedEvent.type)}
                                                 className="w-full bg-american-red/5 hover:bg-american-red hover:text-white border border-american-red/20 text-american-red py-4 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all min-h-[48px]"
                                             >
                                                 <Trash2 size={16} />
                                                 <span>{selectedEvent.type === 'Job' ? 'Unschedule' : 'Delete'}</span>
                                             </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                          );
                        })()
                    ) : (
                        <div className="space-y-6 text-left">
                            {/* Day's Active Scheduled Events Section */}
                            <div className="space-y-3 pb-4 border-b border-[#E5E5E5]">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-black text-[#999999] uppercase tracking-[0.2em]">Scheduled on this Day</h4>
                                    <span className="text-[10px] font-black bg-american-blue/5 text-american-blue px-2.5 py-0.5 rounded-full">
                                        {dayAllScheduledItems.length}
                                    </span>
                                </div>

                                {dayAllScheduledItems.length === 0 ? (
                                    <div className="p-5 bg-gray-50 border border-[#E5E5E5] rounded-2xl text-center">
                                        <CalendarIcon size={20} className="mx-auto text-gray-400 mb-1.5" />
                                        <p className="text-xs font-black text-gray-500">No events scheduled for this day</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                                        {dayAllScheduledItems.map((item, idx) => {
                                            let bg = "bg-pink-50 border-pink-100 text-pink-700";
                                            let icon = <CalendarIcon size={14} />;
                                            if (item.type === 'Blackout') {
                                                bg = "bg-rose-50 border-rose-100 text-rose-700";
                                                icon = <AlertCircle size={14} />;
                                            } else if (item.type === 'Busy') {
                                                bg = "bg-orange-50 border-orange-100 text-orange-700";
                                                icon = <Clock size={14} />;
                                            } else if (item.type === 'Estimate') {
                                                bg = "bg-pink-50 border-pink-100 text-pink-700";
                                                icon = <CalendarIcon size={14} />;
                                            } else if (item.type === 'Job') {
                                                bg = "bg-american-blue/5 border-american-blue/10 text-american-blue";
                                                icon = <Briefcase size={14} />;
                                            }

                                            const estObj = savedEstimates.find(e => e.id === (item.raw as any).estimateId || e.id === item.id);

                                            return (
                                                <div key={idx} className="p-3.5 bg-white border border-[#E5E5E5] rounded-2xl shadow-xs space-y-2">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className={cn("p-1 rounded-lg border", bg)}>
                                                                {icon}
                                                            </span>
                                                            <div>
                                                                <span className={cn("text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded", bg)}>
                                                                    {item.type === 'Job' ? 'Fence Install' : item.type === 'Busy' ? 'Appt' : item.type}
                                                                </span>
                                                                <h5 className="font-black text-american-blue text-xs mt-0.5 max-w-[180px] truncate">
                                                                    {item.title}
                                                                </h5>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedEvent(item.isJob ? {
                                                                        id: item.id,
                                                                        type: 'Job',
                                                                        title: item.title,
                                                                        startDate: (item.raw as any).scheduledStartDate!,
                                                                        endDate: (item.raw as any).scheduledEndDate || (item.raw as any).scheduledStartDate!,
                                                                        estimateId: item.id,
                                                                        userId: (user ? user.uid : '')
                                                                    } : item.raw as ScheduleEvent);
                                                                }}
                                                                className="p-1 text-[#999999] hover:bg-[#F5F7FA] hover:text-american-blue rounded-lg transition-colors"
                                                                title="View Details"
                                                            >
                                                                <Eye size={13} />
                                                            </button>
                                                            <button
                                                                onClick={() => deleteEvent(item.id, item.type)}
                                                                className="p-1 text-[#999999] hover:bg-american-red/10 hover:text-american-red rounded-lg transition-colors"
                                                                title="Remove Item"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {estObj && (
                                                        <div className="text-[10px] text-[#666666] font-medium space-y-0.5 bg-gray-50/50 p-2 rounded-xl border border-gray-150">
                                                            {estObj.customerAddress && (
                                                                <p className="flex items-center gap-1">
                                                                    <span className="font-bold text-[#999] shrink-0">ADDR:</span> 
                                                                    <span className="truncate font-black">{estObj.customerAddress}</span>
                                                                </p>
                                                            )}
                                                            {estObj.customerPhone && (
                                                                <p className="flex items-center gap-1">
                                                                    <span className="font-bold text-[#999]">TEL:</span>
                                                                    <a href={`tel:${estObj.customerPhone}`} className="text-american-blue hover:underline font-black">{estObj.customerPhone}</a>
                                                                </p>
                                                            )}
                                                            <p className="flex items-center gap-2 mt-1 pt-1 border-t border-gray-200/50 text-[9px] font-bold text-[#999]">
                                                                <span>{(estObj.linearFeet || 0).toFixed(0)}' LF</span>
                                                                <span>•</span>
                                                                <span>{item.type === 'Job' ? `${estObj.scheduledDuration || 2} Days` : 'Assessment'}</span>
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Create / Block Time Buttons */}
                            <div className="grid grid-cols-3 gap-3">
                                <button 
                                  onClick={() => setIsAddingEstimate(true)}
                                  className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-all min-h-[48px]"
                                >
                                  <CalendarIcon size={18} />
                                  <span className="text-[9px] font-black uppercase tracking-wider">Add Est</span>
                                </button>
                                <button 
                                  onClick={() => setIsAddingBusy(true)}
                                  className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 transition-all min-h-[48px]"
                                >
                                  <Clock size={18} />
                                  <span className="text-[9px] font-black uppercase tracking-wider">Busy Appt</span>
                                </button>
                                <button 
                                  onClick={() => setIsAddingBlackout(true)}
                                  className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-american-red/5 border border-american-red/20 text-american-red hover:bg-american-red/10 transition-all min-h-[48px]"
                                >
                                  <AlertCircle size={18} />
                                  <span className="text-[9px] font-black uppercase tracking-wider">Blackout</span>
                                </button>
                            </div>

                            <div className="relative">
                              <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-[#E5E5E5]"></div>
                              </div>
                              <div className="relative flex justify-center text-[10px]">
                                <span className="px-2 bg-white text-[#999999] uppercase font-bold tracking-widest">Schedule Jobs</span>
                              </div>
                            </div>

                            <div className="p-4 bg-[#F5F7FA] rounded-2xl border border-[#E5E5E5]">
                                <p className="text-[10px] font-black text-[#999999] uppercase tracking-widest mb-3 text-center">Set Default Duration (Days)</p>
                                <div className="flex items-center justify-center gap-3">
                                    {[1, 2, 3, 4, 5].map(d => (
                                    <button 
                                        key={d}
                                        onClick={() => setSelectedDuration(d)}
                                        className={cn(
                                            "h-11 w-11 flex items-center justify-center rounded-xl font-bold text-xs transition-all min-h-[44px] min-w-[44px]",
                                            selectedDuration === d 
                                                ? "bg-american-blue text-white shadow-md shadow-american-blue/20" 
                                                : "bg-white border border-[#E5E5E5] text-american-blue hover:border-american-blue"
                                        )}
                                    >
                                        {d}
                                    </button>
                                ))}
                                </div>
                            </div>

                            <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar text-left">
                                {acceptedUnscheduled.length > 0 ? (
                                    acceptedUnscheduled.map(est => (
                                        <button 
                                            key={est.id}
                                            onClick={() => scheduleJob(est.id, selectedDate)}
                                            className="w-full text-left p-4 rounded-2xl border border-[#E5E5E5] hover:border-american-blue hover:bg-american-blue/5 transition-all group min-h-[48px]"
                                        >
                                            <p className="text-xs font-black text-[#1A1A1A] group-hover:text-american-blue leading-snug">{est.customerName}</p>
                                            <p className="text-[9px] font-bold text-[#999999] uppercase mt-1 leading-none">{(est.linearFeet || 0).toFixed(0)}' LF • {est.scheduledDuration || 2} Days</p>
                                        </button>
                                    ))
                                ) : (
                                    <p className="text-center py-6 text-xs italic text-[#999999]">No pending job orders available.</p>
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
