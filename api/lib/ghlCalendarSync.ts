import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const CUSTOM_DB_ID = 'ai-studio-326159a1-d34a-4219-9e8c-edc19a926edb';

// Initialize the Firebase Admin SDK safely
if (admin.apps.length === 0) {
  const firebaseConfigEnv = process.env.FIREBASE_CONFIG;
  if (firebaseConfigEnv) {
    try {
      const parsedConfig = JSON.parse(firebaseConfigEnv);
      if (parsedConfig.private_key || parsedConfig.client_email) {
        admin.initializeApp({
          credential: admin.credential.cert(parsedConfig),
        });
      } else {
        admin.initializeApp({
          projectId: parsedConfig.projectId || 'dazzling-card-485210-r8',
        });
      }
    } catch (error) {
      console.error('Error parsing FIREBASE_CONFIG env in ghlCalendarSync helper:', error);
      admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
    }
  } else {
    admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
  }
}

export const db = getFirestore(admin.app(), CUSTOM_DB_ID);

/**
 * Recursively removes undefined values from objects/arrays to prevent Firestore errors.
 */
function sanitizeForFirestore(val: any): any {
  if (val === undefined) return null;
  if (val === null) return null;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.map(v => sanitizeForFirestore(v));
  }
  const sanitized: any = {};
  for (const key in val) {
    if (Object.prototype.hasOwnProperty.call(val, key)) {
      sanitized[key] = sanitizeForFirestore(val[key]);
    }
  }
  return sanitized;
}

export async function getEstimateDocRef(estimateId: string) {
  let docRef = db.collection('estimates').doc(String(estimateId));
  let snap = await docRef.get();

  if (!snap.exists) {
    const usersSnap = await db.collection('users').get();
    for (const uDoc of usersSnap.docs) {
      const nestedRef = db.collection('users').doc(uDoc.id).collection('estimates').doc(String(estimateId));
      const nestedSnap = await nestedRef.get();
      if (nestedSnap.exists) {
        docRef = nestedRef;
        snap = nestedSnap;
        break;
      }
    }
  }
  return { docRef, snap };
}

/**
 * Helper to log GHL Activity to a central firestore collection
 */
export async function logGhlActivity(log: {
  traceId: string;
  estimateId?: string;
  customerName?: string;
  source?: string;
  action?: string;
  endpoint?: string;
  method?: string;
  requestHeaders?: any;
  queryParams?: any;
  requestBody?: any;
  responseHeaders?: any;
  responseBody?: any;
  statusCode?: number;
  responseTime?: number;
  appointmentId?: string;
  status?: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  error?: string;
  duration?: number;
  steps?: Array<{ step: string; label?: string; status: string; reason?: string; timestamp?: string }>;
  firestoreUpdated?: boolean;
  firestoreResult?: string;
  ghlSyncDebug?: any;
}) {
  try {
    const traceId = log.traceId;
    if (!traceId) return;

    const logRef = db.collection('ghl_integration_logs').doc(traceId);
    const existingSnap = await logRef.get();
    
    let mergedSteps = log.steps || [];
    if (existingSnap.exists) {
      const existingData = existingSnap.data() || {};
      if (existingData.steps && Array.isArray(existingData.steps)) {
        const stepMap = new Map(existingData.steps.map((s: any) => [s.step, s]));
        mergedSteps.forEach((s: any) => {
          stepMap.set(s.step, { ...stepMap.get(s.step), ...s, timestamp: s.timestamp || new Date().toISOString() });
        });
        mergedSteps = Array.from(stepMap.values());
      }
    } else {
      mergedSteps = mergedSteps.map((s: any) => ({ ...s, timestamp: s.timestamp || new Date().toISOString() }));
    }

    const docData = sanitizeForFirestore({
      traceId,
      estimateId: log.estimateId || existingSnap.data()?.estimateId || '',
      customerName: log.customerName || existingSnap.data()?.customerName || '',
      source: log.source || existingSnap.data()?.source || '',
      action: log.action || existingSnap.data()?.action || '',
      endpoint: log.endpoint || existingSnap.data()?.endpoint || '',
      method: log.method || existingSnap.data()?.method || '',
      requestHeaders: log.requestHeaders || existingSnap.data()?.requestHeaders || null,
      queryParams: log.queryParams || existingSnap.data()?.queryParams || null,
      requestBody: log.requestBody || existingSnap.data()?.requestBody || null,
      responseHeaders: log.responseHeaders || existingSnap.data()?.responseHeaders || null,
      responseBody: log.responseBody || existingSnap.data()?.responseBody || null,
      statusCode: log.statusCode !== undefined ? log.statusCode : (existingSnap.data()?.statusCode || null),
      responseTime: log.responseTime !== undefined ? log.responseTime : (existingSnap.data()?.responseTime || null),
      appointmentId: log.appointmentId || existingSnap.data()?.appointmentId || '',
      status: log.status || existingSnap.data()?.status || 'pending',
      error: log.error || existingSnap.data()?.error || '',
      duration: log.duration !== undefined ? log.duration : (existingSnap.data()?.duration || 0),
      timestamp: traceId.startsWith('trace-') ? new Date(parseInt(traceId.split('-')[1])).toISOString() : new Date().toISOString(),
      steps: mergedSteps,
      firestoreUpdated: log.firestoreUpdated !== undefined ? log.firestoreUpdated : (existingSnap.data()?.firestoreUpdated || false),
      firestoreResult: log.firestoreResult || existingSnap.data()?.firestoreResult || '',
      ghlSyncDebug: log.ghlSyncDebug || existingSnap.data()?.ghlSyncDebug || null
    });

    await logRef.set(docData, { merge: true });

    // Keep the last 200 items in history
    const allLogsSnap = await db.collection('ghl_integration_logs').orderBy('timestamp', 'desc').get();
    if (allLogsSnap.size > 200) {
      const docsToDelete = allLogsSnap.docs.slice(200);
      const batch = db.batch();
      docsToDelete.forEach((d: any) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (err) {
    console.error('Error writing GHL integration activity log:', err);
  }
}

/**
 * Helper to save ghlSyncDebug to Firestore
 */
export async function saveGhlSyncDebug(estimateId: string, debugObj: any) {
  try {
    const sanitizedDebug = sanitizeForFirestore(debugObj);
    const { docRef } = await getEstimateDocRef(estimateId);
    await docRef.set({ ghlSyncDebug: sanitizedDebug }, { merge: true });
    
    const scheduleEventId = "install-" + estimateId;
    await db.collection('schedule_events').doc(scheduleEventId).set({ ghlSyncDebug: sanitizedDebug }, { merge: true });
  } catch (e) {
    console.error('[GHL CALENDAR SYNC] Failed to save ghlSyncDebug to Firestore:', e);
  }
}

/**
 * Helper to sync schedule events to GHL Install Calendar
 */
export async function syncEstimateToGhlCalendar(
  estimateId: string, 
  estimateData: any, 
  startDate: string, 
  duration: string | number, 
  notes: string, 
  token: string,
  scheduleSyncTraceId?: string,
  actionName: string = 'syncEstimateToGhlCalendar',
  syncCustomerToGhlFn?: any
): Promise<any> {
  const traceId = scheduleSyncTraceId || ("trace-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9));
  
  let days = 1;
  const durationStr = String(duration);
  if (durationStr.includes('2')) days = 2;
  else if (durationStr.includes('3')) days = 3;
  else if (durationStr.includes('4')) days = 4;
  else if (durationStr.includes('5')) days = 5;
  else {
    const parsed = parseInt(durationStr);
    if (!isNaN(parsed)) days = parsed;
  }

  let scheduleEventLoaded = false;
  try {
    const schedEvSnap = await db.collection('schedule_events').doc("install-" + estimateId).get();
    scheduleEventLoaded = schedEvSnap.exists;
  } catch (e) {
    console.error('[GHL CALENDAR SYNC] Error checking schedule_events existence:', e);
  }

  const nowIso = new Date().toISOString();
  let errors: string[] = [];
  let debugSteps: any[] = [
    { step: "frontend_save_clicked", status: "success" },
    { step: "backend_action_received", status: "success" },
    { step: "schedule_event_saved", status: "success" },
    { step: "ghl_sync_helper_entered", status: "success" },
    { step: "free_slots_success", status: "started" },
    { step: "appointment_create_success", status: "started" }
  ];

  let ghlSyncDebug = {
    scheduleSyncTraceId: traceId,
    actionName,
    startedAt: nowIso,
    completedAt: null as string | null,
    status: "started" as "started" | "success" | "failed" | "skipped",
    steps: debugSteps,
    errors: errors
  };

  await saveGhlSyncDebug(estimateId, ghlSyncDebug);

  let sourceLabel = 'Manual Resync';
  if (actionName === 'schedule-job-start' || actionName === 'reschedule-job') sourceLabel = 'Job Scheduler';
  else if (actionName === 'admin-update-schedule') sourceLabel = 'Job Portal';
  else if (actionName === 'resync-ghl-calendar') sourceLabel = 'Manual Resync';
  else if (actionName === 'diagnostic') sourceLabel = 'Diagnostic Test';

  const initialPipelineSteps = [
    { step: "frontend_save", label: "Frontend Save", status: "success", timestamp: nowIso },
    { step: "backend_action", label: "Backend Action", status: "success", timestamp: nowIso },
    { step: "firestore_saved", label: "Firestore Saved", status: "success", timestamp: nowIso },
    { step: "shared_helper_called", label: "Shared GHL Helper Called", status: "success", timestamp: nowIso },
    { step: "free_slots_request", label: "Free Slots Request", status: "pending" },
    { step: "slot_selected", label: "Slot Selected", status: "pending" },
    { step: "appointment_create", label: "Appointment Create", status: "pending" },
    { step: "appointment_id_returned", label: "Appointment ID Returned", status: "pending" },
    { step: "firestore_updated", label: "Firestore Updated", status: "pending" },
    { step: "ui_updated", label: "UI Updated", status: "pending" }
  ];

  await logGhlActivity({
    traceId,
    estimateId,
    customerName: estimateData?.customerName || '',
    source: sourceLabel,
    action: actionName,
    status: 'running',
    steps: initialPipelineSteps
  });

  let syncDebug: any = {
    selectedDate: startDate,
    selectedDuration: duration,
    timezone: 'America/Chicago',
    timestamp: nowIso
  };

  try {
    const settingsSnap = await db.collection('companySettings').doc('braden-lonestar-uid').get();
    const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
    const apiKey = settings.ghlApiKey;
    const locationId = settings.ghlLocationId;
    const calendarId = settings.ghlInstallCalendarId || 'mLZAlEmZ3Y2QyByYTFQh'; // Use settings or fallback

    const mask = (str: string) => str && str.length > 8 ? `${str.substring(0, 4)}...${str.substring(str.length - 4)}` : (str || 'null');
    console.log(`[GHL SYNC TRACE - ${traceId}] Shared GHL appointment helper entered
      scheduleSyncTraceId: ${traceId}
      helper entered true: true
      estimate loaded true/false: ${!!estimateData && Object.keys(estimateData).length > 0}
      schedule event loaded true/false: ${scheduleEventLoaded}
      calendarId: ${calendarId}
      locationId exists true/false: ${!!locationId}
      number of install days to sync: ${days}
      install dates being synced: ${JSON.stringify(Array.from({length: days}, (_, i) => {
        const d = new Date(startDate + 'T07:00:00');
        d.setDate(d.getDate() + i);
        return d.toISOString().split('T')[0];
      }))}
    `);

    if (!apiKey || !locationId) {
      const errorMsg = !apiKey ? 'Missing GHL API Key' : 'Missing GHL Location ID';
      console.warn(`[GHL SYNC TRACE - ${traceId}] Aborting: ${errorMsg}`);
      errors.push(errorMsg);
      
      ghlSyncDebug.status = 'failed';
      ghlSyncDebug.completedAt = new Date().toISOString();
      ghlSyncDebug.steps = [
        { step: "frontend_save_clicked", status: "success" },
        { step: "backend_action_received", status: "success" },
        { step: "schedule_event_saved", status: "success" },
        { step: "ghl_sync_helper_entered", status: "failed", reason: errorMsg },
        { step: "free_slots_success", status: "skipped", reason: "Credentials missing" },
        { step: "appointment_create_success", status: "skipped", reason: "Credentials missing" }
      ];
      await saveGhlSyncDebug(estimateId, ghlSyncDebug);

      await logGhlActivity({
        traceId,
        status: 'failed',
        error: errorMsg,
        steps: [
          { step: "shared_helper_called", status: "failed", reason: errorMsg },
          { step: "free_slots_request", status: "skipped", reason: "Credentials missing" },
          { step: "slot_selected", status: "skipped" },
          { step: "appointment_create", status: "skipped" },
          { step: "appointment_id_returned", status: "skipped" },
          { step: "firestore_updated", status: "skipped" },
          { step: "ui_updated", status: "skipped" }
        ]
      });

      const { docRef: targetDocRef } = await getEstimateDocRef(estimateId);
      await targetDocRef.set({
        ghlCalendarSyncStatus: 'failed',
        ghlCalendarSyncError: errorMsg,
        ghlCalendarLastSyncedAt: nowIso
      }, { merge: true });

      return { success: false, error: `CRM credentials (${errorMsg}) not configured in settings.` };
    }

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Version': '2021-04-15',
      'Content-Type': 'application/json'
    };

    // Ensure we have a GHL Contact ID
    let ghlContactId = estimateData.ghlContactId;
    if (!ghlContactId) {
      if (typeof syncCustomerToGhlFn === 'function') {
        const syncRes = await syncCustomerToGhlFn({
          eventType: 'job_schedule_updated',
          estimate: { ...estimateData, id: estimateId },
          status: 'Start Date Scheduled'
        });
        if (syncRes.success && syncRes.ghlContactId) {
          ghlContactId = syncRes.ghlContactId;
        } else {
          const contactErr = 'Could not resolve GHL Contact ID for calendar sync.';
          errors.push(contactErr);
          ghlSyncDebug.status = 'failed';
          ghlSyncDebug.completedAt = new Date().toISOString();
          ghlSyncDebug.steps = [
            { step: "frontend_save_clicked", status: "success" },
            { step: "backend_action_received", status: "success" },
            { step: "schedule_event_saved", status: "success" },
            { step: "ghl_sync_helper_entered", status: "failed", reason: contactErr },
            { step: "free_slots_request_failed", status: "skipped", reason: "Contact resolution failed" },
            { step: "appointment_create_failed", status: "skipped", reason: "Contact resolution failed" }
          ];
          await saveGhlSyncDebug(estimateId, ghlSyncDebug);

          await logGhlActivity({
            traceId,
            status: 'failed',
            error: contactErr,
            steps: [
              { step: "shared_helper_called", status: "failed", reason: contactErr },
              { step: "free_slots_request", status: "skipped" },
              { step: "slot_selected", status: "skipped" },
              { step: "appointment_create", status: "skipped" },
              { step: "appointment_id_returned", status: "skipped" },
              { step: "firestore_updated", status: "skipped" },
              { step: "ui_updated", status: "skipped" }
            ]
          });

          return { success: false, error: contactErr };
        }
      } else {
        const contactErr = 'Could not resolve GHL Contact ID for calendar sync (customer sync function missing).';
        errors.push(contactErr);
        ghlSyncDebug.status = 'failed';
        ghlSyncDebug.completedAt = new Date().toISOString();
        ghlSyncDebug.steps = [
          { step: "frontend_save_clicked", status: "success" },
          { step: "backend_action_received", status: "success" },
          { step: "schedule_event_saved", status: "success" },
          { step: "ghl_sync_helper_entered", status: "failed", reason: contactErr },
          { step: "free_slots_request_failed", status: "skipped", reason: "Contact resolution failed" },
          { step: "appointment_create_failed", status: "skipped", reason: "Contact resolution failed" }
        ];
        await saveGhlSyncDebug(estimateId, ghlSyncDebug);

        await logGhlActivity({
          traceId,
          status: 'failed',
          error: contactErr,
          steps: [
            { step: "shared_helper_called", status: "failed", reason: contactErr },
            { step: "free_slots_request", status: "skipped" },
            { step: "slot_selected", status: "skipped" },
            { step: "appointment_create", status: "skipped" },
            { step: "appointment_id_returned", status: "skipped" },
            { step: "firestore_updated", status: "skipped" },
            { step: "ui_updated", status: "skipped" }
          ]
        });

        return { success: false, error: contactErr };
      }
    }

    // Existing Event IDs (comma-separated string or array)
    let existingIds: string[] = [];
    if (Array.isArray(estimateData.ghlCalendarEventIds)) {
      existingIds = estimateData.ghlCalendarEventIds.map((item: any) => 
        typeof item === 'string' ? item : (item && item.ghlCalendarEventId)
      ).filter(Boolean);
    } else if (estimateData.ghlCalendarEventId) {
      existingIds = String(estimateData.ghlCalendarEventId).split(',').filter(Boolean);
    }

    // RESCHEDULING RULE: If duration changes, delete old appointments first
    if (existingIds.length > 0 && existingIds.length !== days) {
      console.log(`[GHL SYNC TRACE - ${traceId}] Duration changed from ${existingIds.length} to ${days}. Cleaning up old appointments first.`);
      for (const oldId of existingIds) {
        try {
          console.log(`[GHL SYNC TRACE - ${traceId}] Deleting old appointment during reschedule: ${oldId}`);
          await fetch(`https://services.leadconnectorhq.com/calendars/events/appointments/${oldId}`, {
            method: 'DELETE',
            headers
          });
        } catch (err) {
          console.error(`[GHL SYNC TRACE - ${traceId}] Failed to delete old appointment ${oldId}:`, err);
        }
      }
      existingIds = []; // Clear them so the loop below creates new ones
    }

    const portalLink = `https://ais-dev-fofnlg6ga7ou55bw54gntq-35743419833.us-east5.run.app/?portal=job-portal&estimateId=${estimateId}&token=${token}`;
    
    // Loop for each day and create/update appointment
    const syncDaysResults: any[] = [];
    const newIds: string[] = [];
    let slotsSuccess = true;
    let overallSuccess = true;

    for (let i = 0; i < days; i++) {
      const currentD = new Date(startDate + 'T07:00:00');
      currentD.setDate(currentD.getDate() + i);
      const targetDateStr = currentD.toISOString().split('T')[0];
      
      const targetStartIso = currentD.toISOString();
      const targetEndD = new Date(currentD);
      targetEndD.setHours(targetEndD.getHours() + 3); 
      const targetEndIso = targetEndD.toISOString();

      // 1. Fetch Slots for this specific day
      let daySlots: any[] = [];
      const slotTimezone = 'America/Chicago';
      let slotMatchDebug: any = {
        requestedStart: targetStartIso,
        requestedEnd: targetEndIso,
        requestedTimezone: slotTimezone,
        matchFound: false,
        startTimeMatches: false,
        endTimeValid: true,
        timezoneMatches: true
      };

      let daySlotsFetchStatus = 0;
      let daySlotsFetchText = '';

      try {
        const dayStartT = new Date(targetDateStr + 'T00:00:00').getTime();
        const dayEndT = dayStartT + 86400000;
        const slotUrl = `https://services.leadconnectorhq.com/calendars/${calendarId}/free-slots?startDate=${dayStartT}&endDate=${dayEndT}&timezone=${slotTimezone}`;
        const slotRes = await fetch(slotUrl, { headers });
        daySlotsFetchStatus = slotRes.status;
        daySlotsFetchText = await slotRes.text();
        
        console.log(`[GHL SYNC TRACE - ${traceId}] Day ${i+1} (${targetDateStr}) free slots request result: Status=${slotRes.status}, Body=${daySlotsFetchText}`);

        if (slotRes.ok) {
          const slotData = JSON.parse(daySlotsFetchText);
          const daySlotsExtracted: any[] = [];
          if (slotData.slots && Array.isArray(slotData.slots)) {
            daySlotsExtracted.push(...slotData.slots);
          } else {
            Object.keys(slotData).forEach(dateKey => {
              if (slotData[dateKey]?.slots && Array.isArray(slotData[dateKey].slots)) {
                daySlotsExtracted.push(...slotData[dateKey].slots);
              }
            });
          }
          daySlots = daySlotsExtracted;
          slotMatchDebug.availableSlotsCount = daySlots.length;
        } else {
          slotsSuccess = false;
          errors.push(`Day ${i+1} slots fetch returned status ${slotRes.status}`);
        }
      } catch (e: any) {
        slotsSuccess = false;
        errors.push(`Day ${i+1} slots fetch error: ${e.message || String(e)}`);
      }

      // Update Free Slots request step in activity log
      await logGhlActivity({
        traceId,
        endpoint: `https://services.leadconnectorhq.com/calendars/${calendarId}/free-slots`,
        method: 'GET',
        statusCode: daySlotsFetchStatus,
        responseBody: daySlotsFetchText,
        steps: [
          { step: "free_slots_request", status: slotsSuccess ? "success" : "failed", reason: slotsSuccess ? undefined : `Fetch returned status ${daySlotsFetchStatus}` }
        ]
      });

      // 2. Compare and Find Matching Slot (Chicago timezone robust comparison)
      let matchedSlot = daySlots.find(s => {
        const sStart = typeof s === 'string' ? s : (s.startTime || '');
        if (!sStart) return false;
        try {
          const d = new Date(sStart);
          const chicagoStr = d.toLocaleString("en-US", { timeZone: "America/Chicago" });
          return chicagoStr.includes(" 7:00:") || chicagoStr.includes(" 7:00 ");
        } catch (e) {
          return sStart.includes(`${targetDateStr}T07:00:00`);
        }
      });

      if (!matchedSlot && daySlots.length > 0) {
        matchedSlot = daySlots[0];
        console.log(`[GHL SYNC TRACE - ${traceId}] Day ${i+1} (${targetDateStr}) No exact 7:00 AM slot found. Falling back to first available slot: ${JSON.stringify(matchedSlot)}`);
      }

      console.log(`[GHL SYNC TRACE - ${traceId}] Day ${i+1} (${targetDateStr}) selected slot: ${JSON.stringify(matchedSlot)}`);

      let finalStart = targetStartIso;
      let finalEnd = targetEndIso;

      if (matchedSlot) {
        slotMatchDebug.matchFound = true;
        slotMatchDebug.matchedSlot = matchedSlot;
        
        // 1. USE EXACT SLOT START FROM GHL
        finalStart = typeof matchedSlot === 'string' ? matchedSlot : (matchedSlot.startTime || targetStartIso);
        
        // 2. CALCULATE 3H END TIME STRICTLY FROM START
        const endD = new Date(finalStart);
        endD.setMinutes(endD.getMinutes() + 180); // 3 Hours exactly
        finalEnd = endD.toISOString();
        
        slotMatchDebug.startTimeMatches = true;
      }

      // Update Slot Selected step in activity log
      await logGhlActivity({
        traceId,
        steps: [
          { step: "slot_selected", status: slotMatchDebug.matchFound ? "success" : (existingIds[i] ? "success" : "failed"), reason: slotMatchDebug.matchFound ? `Selected slot: ${JSON.stringify(matchedSlot)}` : (existingIds[i] ? "Reusing existing event" : "No slot found") }
        ]
      });

      const customerName = estimateData.customerName || 'N/A';
      const customerCity = estimateData.customerCity || estimateData.city || 'N/A';
      const customerAddress = estimateData.customerAddress || estimateData.address || 'N/A';
      const fenceType = estimateData.fenceMaterial || estimateData.woodType || estimateData.fenceType || 'N/A';
      const linearFeet = estimateData.linearFeet || 'N/A';
      const assignedCrew = estimateData.assignedCrew || 'N/A';
      const estimateNumber = estimateData.estimateNumber || 'N/A';
      const adminEstimateLink = portalLink.replace('/portal/', '/estimate/');

      const dayTitle = days > 1 
        ? `Install - ${customerName} - ${customerCity} (Day ${i + 1}/${days})` 
        : `Install - ${customerName} - ${customerCity}`;
      
      const appointmentNotes = `Customer: ${customerName}
Address: ${customerAddress}
Fence Type: ${fenceType}
Linear Feet: ${linearFeet}
Crew: ${assignedCrew}
Duration: ${days} ${days > 1 ? 'Days' : 'Day'}
Estimate #: ${estimateNumber}
Job Portal: ${portalLink}
Admin Estimate: ${adminEstimateLink}`;

      const bodyPayload = {
        locationId,
        calendarId,
        contactId: ghlContactId,
        startTime: finalStart,
        endTime: finalEnd,
        title: dayTitle,
        notes: appointmentNotes,
        status: 'booked'
      };

      // EXPLICIT DEBUG LOGS BEFORE CREATION
      const startD_check = new Date(finalStart);
      const endD_check = new Date(finalEnd);
      const durationMs = endD_check.getTime() - startD_check.getTime();
      const durationMinutes = Math.round(durationMs / 60000);
      const startEqualsEnd = finalStart === finalEnd;

      const ghlEventId = existingIds[i] || null;
      const mode = ghlEventId ? 'UPDATE' : 'CREATE';
      const endpoint = ghlEventId 
        ? `https://services.leadconnectorhq.com/calendars/events/appointments/${ghlEventId}`
        : `https://services.leadconnectorhq.com/calendars/events/appointments`;

      console.log(`[GHL SYNC DEBUG] Pre-Appointment Creation Check:
        - selectedSlot: ${JSON.stringify(matchedSlot)}
        - appointmentStartTime: ${finalStart}
        - appointmentEndTime: ${finalEnd}
        - durationMinutes: ${durationMinutes}
        - startEqualsEnd: ${startEqualsEnd}
        - timezone: ${slotTimezone}`);

      let resText = '';
      let resStatus = 0;
      let daySuccess = false;
      let returnedId = ghlEventId;
      let dayError = '';
      let dayTraceId = '';

      if (startEqualsEnd) {
        dayError = `Invalid local appointment range: startTime equals endTime (${finalStart}).`;
        console.error(`[GHL SYNC TRACE - ${traceId}] Day ${i+1} (${targetDateStr}) Aborted: ${dayError}`);
        errors.push(`Day ${i+1} aborted: ${dayError}`);
        overallSuccess = false;

        await logGhlActivity({
          traceId,
          status: 'failed',
          error: dayError,
          steps: [
            { step: "appointment_create_failed", status: "failed", reason: dayError },
            { step: "appointment_id_returned_failed", status: "failed", reason: "Zero duration range" }
          ]
        });
      } else if (!slotMatchDebug.matchFound && !ghlEventId) {
        dayError = `Comparison Failed: No available slots found on ${targetDateStr}.`;
        console.error(`[GHL SYNC TRACE - ${traceId}] Day ${i+1} (${targetDateStr}) Aborted: ${dayError}`);
        errors.push(`Day ${i+1} aborted: ${dayError}`);
        overallSuccess = false;

        await logGhlActivity({
          traceId,
          status: 'failed',
          error: dayError,
          steps: [
            { step: "appointment_create_failed", status: "failed", reason: dayError },
            { step: "appointment_id_returned_failed", status: "failed", reason: "Comparison Failed" },
            { step: "firestore_updated", status: "skipped" },
            { step: "ui_updated", status: "skipped" }
          ]
        });
      } else {
        console.log(`[GHL SYNC TRACE - ${traceId}] Day ${i+1} (${targetDateStr}) appointment creation attempted: true (Mode=${mode}, ID=${ghlEventId || 'NEW'}, startTime=${finalStart}, endTime=${finalEnd})`);
        try {
          const res = await fetch(endpoint, {
            method: ghlEventId ? 'PUT' : 'POST',
            headers,
            body: JSON.stringify(bodyPayload)
          });
          resStatus = res.status;
          resText = await res.text();
          dayTraceId = res.headers.get('x-datadog-trace-id') || res.headers.get('trace-id') || '';
          
          console.log(`[GHL SYNC TRACE - ${traceId}] Day ${i+1} (${targetDateStr}) appointment creation response: Status=${resStatus}, Body=${resText}`);

          if (res.ok) {
            let resData: any = {};
            try { resData = JSON.parse(resText); } catch(e) {}
            const newId = resData.appointment?.id || resData.id || resData.event?.id;
            if (newId) {
              returnedId = newId;
              daySuccess = true;
              newIds.push(newId);
              console.log(`[GHL SYNC TRACE - ${traceId}] Day ${i+1} (${targetDateStr}) returned appointment ID: ${returnedId}`);
            } else if (mode === 'UPDATE' && ghlEventId) {
              daySuccess = true;
              newIds.push(ghlEventId);
              console.log(`[GHL SYNC TRACE - ${traceId}] Day ${i+1} (${targetDateStr}) returned appointment ID: ${ghlEventId} (Updated existing)`);
            } else {
              dayError = 'Success response but no ID returned';
              errors.push(`Day ${i+1} failure: ${dayError}`);
              overallSuccess = false;
            }
          } else {
            dayError = `HTTP ${resStatus}: ${resText}`;
            errors.push(`Day ${i+1} API failure: ${dayError}`);
            overallSuccess = false;
          }
        } catch (err: any) {
          dayError = err.message || String(err);
          errors.push(`Day ${i+1} fetch exception: ${dayError}`);
          overallSuccess = false;
        }

        // Update log with Appointment Creation result steps
        await logGhlActivity({
          traceId,
          endpoint,
          method: ghlEventId ? 'PUT' : 'POST',
          requestHeaders: { ...headers, Authorization: 'Bearer ' + mask(apiKey) },
          requestBody: bodyPayload,
          responseBody: resText,
          statusCode: resStatus,
          appointmentId: returnedId || undefined,
          status: daySuccess ? 'success' : 'failed',
          error: daySuccess ? undefined : dayError,
          steps: [
            { step: daySuccess ? "appointment_create_success" : "appointment_create_failed", status: daySuccess ? "success" : "failed", reason: daySuccess ? undefined : dayError },
            { step: daySuccess ? "appointment_id_returned_success" : "appointment_id_returned_failed", status: daySuccess ? "success" : "failed", reason: daySuccess ? `Returned ID: ${returnedId}` : dayError }
          ]
        });
      }

      syncDaysResults.push({
        dayNumber: i + 1,
        date: targetDateStr,
        startTime: finalStart,
        endTime: finalEnd,
        status: daySuccess ? 'synced' : 'failed',
        ghlCalendarEventId: returnedId,
        error: dayError,
        mode,
        resStatus,
        resBody: resText,
        traceId: dayTraceId,
        slotComparison: slotMatchDebug,
        requestBody: JSON.stringify(bodyPayload)
      });
    }

    // Cleanup extra appointments if duration decreased
    if (existingIds.length > days) {
      for (let j = days; j < existingIds.length; j++) {
        const idToDelete = existingIds[j];
        console.log(`[GHL SYNC TRACE - ${traceId}] Deleting extra appointment ${idToDelete}`);
        await fetch(`https://services.leadconnectorhq.com/calendars/events/appointments/${idToDelete}`, {
          method: 'DELETE',
          headers
        }).catch(err => console.error(`Failed to delete appointment ${idToDelete}:`, err));
      }
    }

    const finalIdsStr = newIds.join(',');
    const overallSuccessFinal = newIds.length > 0;
    const partialSync = overallSuccessFinal && newIds.length < days;

    // Save final ghlSyncDebug and save status to Firestore
    ghlSyncDebug.completedAt = new Date().toISOString();
    ghlSyncDebug.status = overallSuccessFinal ? "success" : "failed";
    ghlSyncDebug.steps = [
      { step: "frontend_save_clicked", status: "success" },
      { step: "backend_action_received", status: "success" },
      { step: "schedule_event_saved", status: "success" },
      { step: "ghl_sync_helper_entered", status: "success" },
      { step: "free_slots_success", status: slotsSuccess ? "success" : "failed" },
      { step: "appointment_create_success", status: overallSuccessFinal ? "success" : "failed" }
    ];
    if (errors.length > 0) {
      ghlSyncDebug.errors = errors;
    }
    await saveGhlSyncDebug(estimateId, ghlSyncDebug);

    const { docRef: targetDocRef } = await getEstimateDocRef(estimateId);
    await targetDocRef.set({
      ghlCalendarEventId: finalIdsStr, // Backwards compatibility
      ghlCalendarEventIds: newIds, // Array as requested
      ghlCalendarSyncDays: syncDaysResults,
      ghlCalendarSyncStatus: overallSuccessFinal ? 'synced' : 'failed',
      ghlCalendarSyncError: overallSuccessFinal ? (partialSync ? `Partial sync: ${newIds.length}/${days} days` : null) : 'All appointment requests failed',
      ghlCalendarLastSyncedAt: nowIso,
      ghlCalendarSyncDebug: syncDebug,
      ghlSyncDebug: ghlSyncDebug
    }, { merge: true });

    // Also update schedule_events with synced GHL event IDs
    try {
      const scheduleEventId = "install-" + estimateId;
      await db.collection('schedule_events').doc(scheduleEventId).set(sanitizeForFirestore({
        ghlCalendarEventId: finalIdsStr,
        ghlCalendarEventIds: newIds,
        ghlCalendarSyncStatus: overallSuccessFinal ? 'synced' : 'failed',
        ghlSyncDebug: ghlSyncDebug
      }), { merge: true });
      console.log(`[GHL SYNC TRACE - ${traceId}] Saved GHL IDs and ghlSyncDebug to schedule_events for ${scheduleEventId}`);
    } catch (e) {
      console.error('Failed updating schedule_events with GHL IDs:', e);
    }

    // Update log with final result and firestore updated steps
    await logGhlActivity({
      traceId,
      status: overallSuccessFinal ? 'success' : 'failed',
      appointmentId: finalIdsStr || undefined,
      firestoreUpdated: true,
      firestoreResult: `Saved to estimate: ${estimateId} and schedule_events: install-${estimateId}`,
      steps: [
        { step: "firestore_updated", status: overallSuccessFinal ? "success" : "failed", reason: `Saved event IDs: ${finalIdsStr}` },
        { step: "ui_updated", status: "success", timestamp: new Date().toISOString() }
      ]
    });

    if (overallSuccessFinal) {
      return { success: true, ghlCalendarEventId: finalIdsStr, ghlCalendarEventIds: newIds, ghlContactId, ghlSyncDebug };
    } else {
      ghlSyncDebug.status = 'failed';
      ghlSyncDebug.completedAt = new Date().toISOString();
      
      console.log(`GHL_SYNC_FAILED_TRACE_ID: ${ghlSyncDebug.scheduleSyncTraceId}`);
      console.log(`GHL_SYNC_FAILED_STATUS: ${ghlSyncDebug.status}`);
      console.log(`GHL_SYNC_FAILED_ACTION: ${ghlSyncDebug.actionName}`);

      (ghlSyncDebug.steps || []).forEach((step: any, idx: number) => {
        console.log(`GHL_SYNC_STEP_${idx}: ${JSON.stringify(step)}`);
      });

      (ghlSyncDebug.errors || []).forEach((error: any, idx: number) => {
        console.log(`GHL_SYNC_ERROR_${idx}: ${JSON.stringify(error)}`);
      });

      console.log("GHL_SYNC_DEBUG_FULL_JSON_START");
      console.log(JSON.stringify(ghlSyncDebug));
      console.log("GHL_SYNC_DEBUG_FULL_JSON_END");

      return { success: false, error: `GHL API Sync Failed. See sync details in admin.`, ghlSyncDebug };
    }

  } catch (err: any) {
    console.error('[GHL CALENDAR SYNC ERROR]', err);
    errors.push(err.message || String(err));
    ghlSyncDebug.status = 'failed';
    ghlSyncDebug.completedAt = new Date().toISOString();
    ghlSyncDebug.steps = [
      { step: "frontend_save_clicked", status: "success" },
      { step: "backend_action_received", status: "success" },
      { step: "schedule_event_saved", status: "success" },
      { step: "ghl_sync_helper_entered", status: "failed", reason: err.message || String(err) },
      { step: "free_slots_success", status: "skipped" },
      { step: "appointment_create_success", status: "skipped" }
    ];
    if (errors.length > 0) {
      ghlSyncDebug.errors = errors;
    }
    await saveGhlSyncDebug(estimateId, ghlSyncDebug);

    await logGhlActivity({
      traceId,
      status: 'failed',
      error: err.message || String(err),
      steps: [
        { step: "free_slots_request", status: "failed", reason: err.message || String(err) },
        { step: "slot_selected", status: "skipped" },
        { step: "appointment_create", status: "skipped" },
        { step: "appointment_id_returned", status: "skipped" },
        { step: "firestore_updated", status: "failed" },
        { step: "ui_updated", status: "failed" }
      ]
    });

    console.log(`GHL_SYNC_FAILED_TRACE_ID: ${ghlSyncDebug.scheduleSyncTraceId}`);
    console.log(`GHL_SYNC_FAILED_STATUS: ${ghlSyncDebug.status}`);
    console.log(`GHL_SYNC_FAILED_ACTION: ${ghlSyncDebug.actionName}`);

    (ghlSyncDebug.steps || []).forEach((step: any, idx: number) => {
      console.log(`GHL_SYNC_STEP_${idx}: ${JSON.stringify(step)}`);
    });

    (ghlSyncDebug.errors || []).forEach((error: any, idx: number) => {
      console.log(`GHL_SYNC_ERROR_${idx}: ${JSON.stringify(error)}`);
    });

    console.log("GHL_SYNC_DEBUG_FULL_JSON_START");
    console.log(JSON.stringify(ghlSyncDebug));
    console.log("GHL_SYNC_DEBUG_FULL_JSON_END");

    return { success: false, error: err.message || String(err), ghlSyncDebug };
  }
}

/**
 * Canceled/Deleted GHL Appointments for a given schedule event.
 */
export async function cancelGhlCalendarAppointmentsForSchedule(scheduleEventId: string) {
  const traceId = `cancel-${Math.random().toString(36).substring(2, 15)}`;
  const nowIso = new Date().toISOString();
  console.log(`[GHL SYNC TRACE - ${traceId}] Starting GHL cancellation for schedule: ${scheduleEventId}`);

  try {
    // 1. Fetch schedule event
    const eventSnap = await db.collection('schedule_events').doc(String(scheduleEventId)).get();
    if (!eventSnap.exists) {
      console.warn(`[GHL SYNC TRACE - ${traceId}] Schedule event not found: ${scheduleEventId}`);
      return { success: false, error: 'Schedule event not found.' };
    }
    const eventData = eventSnap.data() || {};
    const estimateId = eventData.estimateId;

    // 2. Collect IDs
    const ghlIds: string[] = [];
    if (eventData.ghlCalendarEventId) {
      ghlIds.push(eventData.ghlCalendarEventId);
    }
    if (Array.isArray(eventData.ghlCalendarEventIds)) {
      eventData.ghlCalendarEventIds.forEach((item: any) => {
        if (item && item.ghlCalendarEventId) {
          ghlIds.push(item.ghlCalendarEventId);
        }
      });
    }

    const uniqueIds = Array.from(new Set(ghlIds)).filter(Boolean);
    if (uniqueIds.length === 0) {
      console.log(`[GHL SYNC TRACE - ${traceId}] No GHL appointment IDs found to cancel.`);
      return { success: true, message: 'No GHL appointments found to cancel.' };
    }

    // 3. Fetch settings
    const settingsSnap = await db.collection('companySettings').doc('braden-lonestar-uid').get();
    const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
    const apiKey = settings.ghlApiKey;

    if (!apiKey) {
      console.warn(`[GHL SYNC TRACE - ${traceId}] GHL API Key missing, cannot cancel appointments.`);
      return { success: false, error: 'GHL API Key missing.' };
    }

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Version': '2021-04-15',
      'Content-Type': 'application/json'
    };

    const results: any[] = [];
    let allSucceeded = true;

    // 4. Delete each appointment
    for (const idToDelete of uniqueIds) {
      try {
        console.log(`[GHL SYNC TRACE - ${traceId}] Deleting GHL appointment: ${idToDelete}`);
        const res = await fetch(`https://services.leadconnectorhq.com/calendars/events/appointments/${idToDelete}`, {
          method: 'DELETE',
          headers
        });
        const resStatus = res.status;
        const resText = await res.text();
        
        results.push({ id: idToDelete, status: resStatus, response: resText });
        if (resStatus !== 200 && resStatus !== 204 && resStatus !== 404) {
          allSucceeded = false;
        }
      } catch (err) {
        console.error(`[GHL SYNC TRACE - ${traceId}] Failed to delete ${idToDelete}:`, err);
        results.push({ id: idToDelete, error: String(err) });
        allSucceeded = false;
      }
    }

    // 5. Log activity
    await logGhlActivity({
      traceId,
      estimateId,
      source: 'App Deletion',
      action: 'cancelGhlCalendarAppointmentsForSchedule',
      status: allSucceeded ? 'success' : 'failed',
      responseBody: { results },
      steps: [
        { step: "ghl_cancel_started", status: "success" },
        { step: "ghl_cancel_completed", status: allSucceeded ? "success" : "failed" }
      ]
    });

    return { success: allSucceeded, results };
  } catch (err) {
    console.error(`[GHL SYNC TRACE - ${traceId}] Error in cancel helper:`, err);
    return { success: false, error: String(err) };
  }
}
