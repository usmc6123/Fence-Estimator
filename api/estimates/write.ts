import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { format, addDays } from 'date-fns';
import { 
  syncEstimateToGhlCalendar as libSyncEstimateToGhlCalendar,
  cancelGhlCalendarAppointmentsForSchedule 
} from '../lib/ghlCalendarSync.js';
import { randomBytes } from 'crypto';

function generateSecureToken(): string {
  try {
    return randomBytes(8).toString('hex');
  } catch (err: any) {
    throw new Error(err?.message || String(err));
  }
}

/**
 * Checks if any date in an install range falls on an unavailable day (e.g. Sunday).
 */
function isInstallOnUnavailableDay(startDate: string, duration: number, unavailableDays: string[]): { isUnavailable: boolean; date?: string; day?: string } {
  if (!unavailableDays || unavailableDays.length === 0) return { isUnavailable: false };
  
  // startDate is 'YYYY-MM-DD'
  const start = new Date(startDate + 'T00:00:00');
  
  for (let i = 0; i < duration; i++) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    const dayName = format(current, 'EEEE'); // Sunday, Monday, etc.
    if (unavailableDays.includes(dayName)) {
      return { 
        isUnavailable: true, 
        date: format(current, 'yyyy-MM-dd'),
        day: dayName
      };
    }
  }
  return { isUnavailable: false };
}

const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
const CUSTOM_DB_ID = 'ai-studio-326159a1-d34a-4219-9e8c-edc19a926edb';

// Initialize the Firebase Admin SDK
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
      console.error('Error parsing FIREBASE_CONFIG env in estimates write:', error);
      admin.initializeApp({
        projectId: 'dazzling-card-485210-r8',
      });
    }
  } else {
    admin.initializeApp({
      projectId: 'dazzling-card-485210-r8',
    });
  }
}

/**
 * Decision Engine for Customer Estimator automation suppression.
 * Future workflows can reuse this decision engine as well.
 */
export function shouldTriggerCustomerEstimatorWorkflow(
  customer: any,
  estimate: any,
  settings: any,
  forceTrigger?: boolean
): { trigger: boolean; reason: string } {
  // If Force Trigger is checked and allowed by settings, always trigger!
  const isForceTriggerAllowed = settings?.allowManualForceTrigger !== false;
  if (forceTrigger && isForceTriggerAllowed) {
    return { trigger: true, reason: "Manual Force Override Checked" };
  }

  // Check if outbound webhook general switch is enabled
  if (settings?.enableInstantEstimateWebhook === false) {
    return { trigger: false, reason: "Webhook Disabled in Settings" };
  }

  // If no customer and no estimate exists -> New Customer -> Trigger!
  if (!customer && !estimate) {
    return { trigger: true, reason: "New customer" };
  }

  // Collect any statuses found from customer or estimate
  const customerStatus = customer?.status || customer?.jobStatus || "";
  const estimateStatus = estimate?.status || estimate?.jobStatus || "";

  // Helper to normalize status strings for comparison (case-insensitive, trimmed)
  const normalizeStatus = (s: string) => {
    return (s || "").trim().toLowerCase();
  };

  const cStatusNorm = normalizeStatus(customerStatus);
  const eStatusNorm = normalizeStatus(estimateStatus);

  // Statuses that require suppression:
  // - Estimate Scheduled
  // - Estimate Sent
  // - Accepted
  // - Scheduled
  // - In Progress
  // - Completed
  // - Archived
  const suppressionStatuses = [
    "estimate scheduled",
    "estimate sent",
    "accepted",
    "scheduled",
    "in progress",
    "completed",
    "archived"
  ];

  // Allowed statuses (only trigger if status is one of these):
  // - Interested
  // - New Lead
  // - Appointment Requested
  const allowedStatuses = [
    "interested",
    "new lead",
    "appointment requested"
  ];

  // 1. Check existing customer suppression rule
  if (settings?.suppressInstantEstimateWorkflowExisting !== false) {
    if (customer && !allowedStatuses.includes(cStatusNorm) && cStatusNorm !== "") {
      return { trigger: false, reason: "Existing Customer" };
    }
  }

  // 2. Check individual statuses
  if (settings?.suppressIfEstimateScheduled !== false) {
    if (cStatusNorm === "estimate scheduled" || eStatusNorm === "estimate scheduled") {
      return { trigger: false, reason: "Estimate Scheduled" };
    }
  }

  if (settings?.suppressIfEstimateSent !== false) {
    if (cStatusNorm === "estimate sent" || eStatusNorm === "estimate sent") {
      return { trigger: false, reason: "Estimate Sent" };
    }
  }

  if (settings?.suppressIfCustomerAccepted !== false) {
    if (cStatusNorm === "accepted" || eStatusNorm === "accepted") {
      return { trigger: false, reason: "Accepted" };
    }
  }

  if (settings?.suppressIfCustomerCompleted !== false) {
    const completedOrActiveFlags = ["completed", "in progress", "scheduled", "archived"];
    if (completedOrActiveFlags.includes(cStatusNorm) || completedOrActiveFlags.includes(eStatusNorm)) {
      return { trigger: false, reason: "Completed" };
    }
  }

  // General suppression state matching
  if (suppressionStatuses.includes(cStatusNorm)) {
    return { trigger: false, reason: customerStatus || "Existing Customer Status" };
  }
  if (suppressionStatuses.includes(eStatusNorm)) {
    return { trigger: false, reason: estimateStatus || "Existing Estimate Status" };
  }

  // Allowed statuses checks
  if (customer || estimate) {
    const hasAllowedCStatus = cStatusNorm === "" || allowedStatuses.includes(cStatusNorm);
    const hasAllowedEStatus = eStatusNorm === "" || allowedStatuses.includes(eStatusNorm);
    
    if (hasAllowedCStatus && hasAllowedEStatus) {
      return { trigger: true, reason: "Existing Customer allowed status" };
    }
    
    return { trigger: false, reason: "Existing estimate found" };
  }

  return { trigger: true, reason: "Authorized" };
}

const db = getFirestore(admin.app(), CUSTOM_DB_ID);

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

export interface SendAppEmailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  metadata?: any;
  category?: string;
  estimateData?: any;
  decoded?: any;
  estimateId?: string;
  customerId?: string;
  customSettingsData?: any;
}

export function parseEmailList(emailInput: string | string[] | undefined): string[] | undefined {
  if (!emailInput) return undefined;
  if (Array.isArray(emailInput)) return emailInput.map(e => e.trim());
  return emailInput.split(',').map(e => e.trim()).filter(Boolean);
}

export async function sendAppEmail({
  to,
  subject,
  text,
  html,
  replyTo,
  cc,
  bcc,
  metadata,
  category,
  estimateData,
  decoded,
  estimateId,
  customerId,
  customSettingsData
}: SendAppEmailParams) {
  let resolvedSmtpHost = process.env.SMTP_HOST || 'mail.b.hostedemail.com';
  let resolvedSmtpPort = Number(process.env.SMTP_PORT) || 465;
  let resolvedSmtpSecureType = 'SSL/TLS';
  let resolvedSmtpUser = process.env.SMTP_USER;
  let resolvedSmtpPass = process.env.SMTP_PASS;
  let resolvedFromName = 'Lone Star Fence Works';
  let resolvedFromEmail = process.env.FROM_EMAIL || resolvedSmtpUser || 'estimates@send.lonestarfenceworks.com';
  let resolvedReplyToEmail = '';

  // Default configurations and options
  let emailProvider = 'resend'; // Default to Resend
  let resendApiKey = process.env.RESEND_API_KEY || '';
  let adminNotificationEmail = 'bradens@lonestarfenceworks.com';
  let sendCopyBccToAdmin = true;

  const ownerUid = estimateData?.userId || estimateData?.uid || estimateData?.ownerId;
  const candidateUids = [];
  if (decoded && decoded.uid) candidateUids.push(decoded.uid);
  if (ownerUid && !candidateUids.includes(ownerUid)) candidateUids.push(ownerUid);
  candidateUids.push('braden-lonestar-uid');
  candidateUids.push('main');

  let settingsData: any = null;
  if (customSettingsData) {
    settingsData = customSettingsData;
  } else {
    for (const uidToTry of candidateUids) {
      try {
        const settingsSnap = await db.collection('companySettings').doc(uidToTry).get();
        if (settingsSnap.exists) {
          settingsData = settingsSnap.data() || {};
          break; // break on the first configuration found
        }
      } catch (err) {
        console.warn(`Failed to fetch companySettings for candidate '${uidToTry}' in sendAppEmail:`, err);
      }
    }
  }

  if (settingsData) {
    if (settingsData.emailProvider) emailProvider = settingsData.emailProvider;
    if (settingsData.resendApiKey) resendApiKey = settingsData.resendApiKey;
    if (settingsData.smtpHost) resolvedSmtpHost = settingsData.smtpHost;
    if (settingsData.smtpPort) resolvedSmtpPort = Number(settingsData.smtpPort);
    if (settingsData.smtpSecureType) resolvedSmtpSecureType = settingsData.smtpSecureType;
    if (settingsData.smtpUsername) resolvedSmtpUser = settingsData.smtpUsername;
    if (settingsData.smtpPassword) resolvedSmtpPass = settingsData.smtpPassword;
    if (settingsData.fromName) resolvedFromName = settingsData.fromName;
    if (settingsData.fromEmail) resolvedFromEmail = settingsData.fromEmail;
    if (settingsData.adminNotificationEmail) adminNotificationEmail = settingsData.adminNotificationEmail;
    if (settingsData.sendCopyBccToAdmin !== undefined) sendCopyBccToAdmin = settingsData.sendCopyBccToAdmin;
  }

  // Determine if a Reply-To is explicitly configured
  let isReplyToConfigured = false;
  let finalReplyTo = '';

  // Helper checking of default, placeholder, or system-sending options for Lone Star
  const isExcludedReplyTo = (email: string | undefined): boolean => {
    if (!email) return true;
    const clean = email.trim().toLowerCase();
    return (
      clean === 'estimates@send.lonestarfenceworks.com' ||
      clean.endsWith('@send.lonestarfenceworks.com') ||
      clean === 'office@yourcompany.com' ||
      clean === resolvedFromEmail.toLowerCase()
    );
  };

  // 1. Check if we have explicitly configured database settings
  if (settingsData && settingsData.replyToEmail && settingsData.replyToEmail.trim()) {
    const dbReply = settingsData.replyToEmail.trim();
    if (!isExcludedReplyTo(dbReply)) {
      finalReplyTo = dbReply;
      isReplyToConfigured = true;
    }
  }

  // 2. Check if we have a non-default function argument
  if (!isReplyToConfigured && replyTo && replyTo.trim()) {
    const argReply = replyTo.trim();
    if (!isExcludedReplyTo(argReply)) {
      finalReplyTo = argReply;
      isReplyToConfigured = true;
    }
  }

  // 3. Apply the fallback order
  if (isReplyToConfigured && finalReplyTo) {
    resolvedReplyToEmail = finalReplyTo;
  } else if (adminNotificationEmail && adminNotificationEmail.trim() && !isExcludedReplyTo(adminNotificationEmail)) {
    resolvedReplyToEmail = adminNotificationEmail.trim();
  } else {
    // Ultimate fallback as from email
    resolvedReplyToEmail = resolvedFromEmail;
  }

  // Setup final BCCs
  let finalBccs: string[] = [];
  if (bcc) {
    const list = parseEmailList(bcc);
    if (list) finalBccs.push(...list);
  }
  if (sendCopyBccToAdmin && adminNotificationEmail) {
    const adminEmails = parseEmailList(adminNotificationEmail);
    if (adminEmails) {
      adminEmails.forEach(ae => {
        if (!finalBccs.includes(ae)) finalBccs.push(ae);
      });
    }
  }

  const estId = estimateId || estimateData?.id || estimateData?.estimateId || '';
  const custId = customerId || estimateData?.customerId || estimateData?.customer?.id || '';
  const activeProvider = (emailProvider === 'resend' && resendApiKey) ? 'resend' : 'smtp';

  console.log(`[sendAppEmail] Dispatching using active provider: ${activeProvider}`);

  let success = false;
  let activeError: string | null = null;
  let resendMessageId = '';
  let smtpInfo: any = null;

  if (activeProvider === 'resend') {
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `"${resolvedFromName}" <${resolvedFromEmail}>`,
          to: parseEmailList(to),
          reply_to: parseEmailList(resolvedReplyToEmail),
          subject,
          html,
          text: text || html.replace(/<[^>]*>/g, ''),
          bcc: finalBccs.length > 0 ? finalBccs : undefined,
          cc: cc ? parseEmailList(cc) : undefined
        })
      });

      if (!resendRes.ok) {
        const errBody = await resendRes.text();
        throw new Error(`Resend API returned status ${resendRes.status}: ${errBody}`);
      }

      const resendData = await resendRes.json();
      resendMessageId = resendData.id || '';
      success = true;
    } catch (err: any) {
      activeError = `Resend email failed: ${err.message || String(err)}`;
      console.error('[sendAppEmail Resend Error]', err);
    }
  } else {
    // Falls back to SMTP
    const missingVars: string[] = [];
    if (!resolvedSmtpHost) missingVars.push('SMTP_HOST');
    if (!resolvedSmtpUser) missingVars.push('SMTP_USER');
    if (!resolvedSmtpPass) missingVars.push('SMTP_PASS');

    if (missingVars.length > 0) {
      activeError = `Missing SMTP configurations: [${missingVars.join(', ')}]`;
    } else {
      const isPort465 = resolvedSmtpPort === 465 || resolvedSmtpSecureType === 'SSL/TLS';
      const transporterConfig = {
        host: resolvedSmtpHost,
        port: resolvedSmtpPort,
        secure: isPort465,
        auth: {
          user: resolvedSmtpUser,
          pass: resolvedSmtpPass
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
        tls: {
          rejectUnauthorized: false
        }
      };

      try {
        const transporter = nodemailer.createTransport(transporterConfig);
        smtpInfo = await transporter.sendMail({
          from: `"${resolvedFromName}" <${resolvedFromEmail}>`,
          to,
          replyTo: resolvedReplyToEmail,
          bcc: finalBccs.length > 0 ? finalBccs.join(', ') : undefined,
          cc: cc ? (typeof cc === 'string' ? cc : cc.join(', ')) : undefined,
          subject,
          text,
          html
        });
        success = true;
      } catch (err: any) {
        activeError = `SMTP email failed: ${err.message || String(err)}`;
        console.error('[sendAppEmail SMTP Error]', err);
      }
    }
  }

  // Define logging entry
  const logEntry = {
    provider: activeProvider,
    category: category || 'unknown',
    to,
    from: `"${resolvedFromName}" <${resolvedFromEmail}>`,
    replyTo: resolvedReplyToEmail || '',
    bcc: finalBccs.length > 0 ? finalBccs.join(', ') : '',
    subject,
    sentAt: new Date().toISOString(),
    resendMessageId: resendMessageId || '',
    success,
    error: activeError,
    estimateId: estId || '',
    customerId: custId || ''
  };

  // 1. Write standalone log entry in root collection emailLogs
  try {
    await db.collection('emailLogs').add(logEntry);
  } catch (ignoreLogErr) {
    console.warn("Could not write email log to root collection:", ignoreLogErr);
  }

  // 2. Append log to estimate document if estimateId resolves
  if (estId) {
    try {
      await db.collection('estimates').doc(String(estId)).update({
        emailLogs: admin.firestore.FieldValue.arrayUnion(logEntry)
      });
    } catch (ignoreEstLogErr) {
      console.warn(`Could not append email log to estimate ${estId}:`, ignoreEstLogErr);
    }
  }

  // 3. Append log to customer document if customerId resolves
  if (custId) {
    try {
      await db.collection('customers').doc(String(custId)).update({
        emailLogs: admin.firestore.FieldValue.arrayUnion(logEntry)
      });
    } catch (ignoreCustLogErr) {
      console.warn(`Could not append email log to customer ${custId}:`, ignoreCustLogErr);
    }
  }

  // Throw if there is an error to satisfy test expectations
  if (!success) {
    throw new Error(activeError || 'Failed to dispatch email.');
  }

  // Formulate mock info compatibility object
  const info = smtpInfo || {
    messageId: resendMessageId,
    accepted: parseEmailList(to),
    response: 'api::resend::ok',
    envelope: { from: resolvedFromEmail, to: parseEmailList(to) }
  };

  return {
    success: true,
    provider: activeProvider,
    resendMessageId,
    info,
    resolvedFromName,
    resolvedFromEmail,
    resolvedReplyToEmail
  };
}

const BRADEN_UID = 'braden-lonestar-uid';

async function saveLocalWebhookLog(firestoreDb: any, estimateId: string, logEntry: any) {
  if (!estimateId) return;
  try {
    const rootRef = firestoreDb.collection('estimates').doc(String(estimateId));
    let targetRef = rootRef;
    const snap = await rootRef.get();
    let exists = snap.exists;

    if (!exists) {
      const usersSnap = await firestoreDb.collection('users').get();
      for (const uDoc of usersSnap.docs) {
        const nestedRef = firestoreDb.collection('users').doc(uDoc.id).collection('estimates').doc(String(estimateId));
        const nestedSnap = await nestedRef.get();
        if (nestedSnap.exists) {
          targetRef = nestedRef;
          exists = true;
          break;
        }
      }
    }

    if (exists) {
      const snapToRead = await targetRef.get();
      const currentData = snapToRead.data() || {};
      const logs = currentData.ghlWebhookLog || [];
      await targetRef.set({
        ghlWebhookLog: [...logs, logEntry],
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
  } catch (e) {
    console.warn(`Could not save webhook log to estimate ${estimateId}:`, e);
  }
}

async function sendGhlWorkflowWebhook(
  eventType: 'instant_estimate_submitted' | 'customer_estimator_submitted' | 'manual_estimate_sent' | 'estimate_accepted' | 'estimate_completed' | 'estimate_declined',
  payloadData: any,
  companySettings: any,
  firestoreDb?: any,
  estimateId?: string
): Promise<{ success: boolean; url?: string; status?: number; error?: string }> {
  try {
    const formatPhoneForGHL = (p: string): string => {
      if (!p) return '';
      const cleaned = p.replace(/\D/g, '');
      if (cleaned.length === 10) {
        return `+1${cleaned}`;
      } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
        return `+${cleaned}`;
      }
      return p; 
    };

    let settings = companySettings || {};

    if (firestoreDb && !settings.ghlWebhookInstantEstimateSubmitted && !settings.ghlWebhookManualEstimateSent && !settings.ghlWebhookEstimateAccepted && !settings.ghlWebhookEstimateCompleted && !settings.ghlWebhookEstimateDeclined) {
      const ownerUid = payloadData.userId || payloadData.uid || payloadData.ownerId || payloadData.ownerUid || BRADEN_UID;
      const lookups = [ownerUid, 'main', BRADEN_UID].filter(Boolean);
      for (const key of lookups) {
        try {
          const snap = await firestoreDb.collection('companySettings').doc(String(key)).get();
          if (snap.exists) {
            settings = { ...snap.data(), ...settings };
            break;
          }
        } catch (e) {
          console.warn(`Error resolving settings for key ${key} in local helper:`, e);
        }
      }
    }

    if (settings && settings.keepGhlLegacyWebhooks === false) {
      console.log(`[LEGACY WEBHOOK SUPPRESSION] Legacy webhooks are disabled in settings. Skipping GHL webhook for event: ${eventType}`);
      return { success: true, error: 'Skipped: legacy webhooks disabled.' };
    }

    let webhookUrl = '';
    if (eventType === 'instant_estimate_submitted' || eventType === 'customer_estimator_submitted') {
      webhookUrl = settings.ghlWebhookInstantEstimateSubmitted || settings.gohighlevelWebhookUrl || settings.ghlWebhookUrl;
    } else if (eventType === 'manual_estimate_sent') {
      webhookUrl = settings.ghlWebhookManualEstimateSent || settings.ghlWebhookUrl || settings.gohighlevelWebhookUrl;
    } else if (eventType === 'estimate_accepted') {
      webhookUrl = settings.ghlWebhookEstimateAccepted || settings.ghlWebhookUrl || settings.gohighlevelWebhookUrl;
    } else if (eventType === 'estimate_completed') {
      webhookUrl = settings.ghlWebhookEstimateCompleted || settings.ghlWebhookUrl || settings.gohighlevelWebhookUrl;
    } else if (eventType === 'estimate_declined') {
      webhookUrl = settings.ghlWebhookEstimateDeclined || settings.ghlWebhookUrl || settings.gohighlevelWebhookUrl;
    }

    if (!webhookUrl) {
      console.log(`Webhook URL for event type ${eventType} is blank. Skipping GHL webhook trigger.`);
      return { success: true, error: 'Skipped: webhook URL not configured.' };
    }

    let finalPayload: any = { eventType };

    if (eventType === 'instant_estimate_submitted' || eventType === 'customer_estimator_submitted') {
      finalPayload = {
        ...finalPayload,
        leadSource: payloadData.leadSource || 'Customer Estimator',
        customerName: payloadData.customerName || `${payloadData.firstName || ''} ${payloadData.lastName || ''}`.trim(),
        firstName: payloadData.firstName || '',
        lastName: payloadData.lastName || '',
        email: payloadData.email || '',
        phone: formatPhoneForGHL(payloadData.phone || ''),
        address: payloadData.address || '',
        city: payloadData.city || '',
        state: payloadData.state || '',
        zip: payloadData.zip || '',
        fenceType: payloadData.fenceType || '',
        fenceHeight: payloadData.fenceHeight || payloadData.height || '',
        height: payloadData.fenceHeight || payloadData.height || '',
        linearFeet: Number(payloadData.linearFeet || 0),
        measuredLinearFeet: payloadData.measuredLinearFeet !== undefined ? payloadData.measuredLinearFeet : null,
        measurementMethod: payloadData.measurementMethod || 'manual',
        gateCount: Number(payloadData.gateCount || 0),
        gateSummary: payloadData.gateSummary || '',
        selectedOptions: payloadData.selectedOptions || '',
        estimatedPrice: Number(payloadData.estimatedPrice || 0),
        jobStatus: payloadData.jobStatus || 'Interested',
        estimateId: estimateId || payloadData.estimateId || '',
        createdAt: payloadData.createdAt || new Date().toISOString()
      };
    } else if (eventType === 'manual_estimate_sent') {
      finalPayload = {
        ...finalPayload,
        leadSource: 'Manual Estimate',
        customerName: payloadData.customerName || `${payloadData.firstName || ''} ${payloadData.lastName || ''}`.trim(),
        firstName: payloadData.firstName || '',
        lastName: payloadData.lastName || '',
        email: payloadData.email || '',
        phone: formatPhoneForGHL(payloadData.phone || ''),
        address: payloadData.address || '',
        city: payloadData.city || '',
        state: payloadData.state || '',
        zip: payloadData.zip || '',
        fenceType: payloadData.fenceType || '',
        linearFeet: Number(payloadData.linearFeet || 0),
        estimatedPrice: Number(payloadData.estimatedPrice || 0),
        jobStatus: 'Proposed',
        estimateId: estimateId || payloadData.estimateId || '',
        estimateNumber: payloadData.estimateNumber || '',
        estimateLink: payloadData.estimateLink || '',
        sentAt: payloadData.sentAt || new Date().toISOString()
      };
    } else if (eventType === 'estimate_accepted') {
      finalPayload = {
        ...finalPayload,
        source: payloadData.source || 'customer_portal',
        customerName: payloadData.customerName || `${payloadData.firstName || ''} ${payloadData.lastName || ''}`.trim(),
        email: payloadData.email || '',
        phone: formatPhoneForGHL(payloadData.phone || ''),
        address: payloadData.address || '',
        fenceType: payloadData.fenceType || '',
        linearFeet: Number(payloadData.linearFeet || 0),
        estimatedPrice: Number(payloadData.estimatedPrice || 0),
        estimateId: estimateId || payloadData.estimateId || '',
        estimateNumber: payloadData.estimateNumber || '',
        customerSignature: payloadData.customerSignature || 'Digitally Signed',
        customerSignedDate: payloadData.customerSignedDate || new Date().toISOString(),
        acceptedAt: payloadData.acceptedAt || new Date().toISOString(),
        jobStatus: 'Accepted',
        versionId: payloadData.versionId || '',
        estimateLink: payloadData.estimateLink || ''
      };
    } else if (eventType === 'estimate_completed') {
      finalPayload = {
        ...finalPayload,
        source: payloadData.source || 'customer_portal',
        customerName: payloadData.customerName || `${payloadData.firstName || ''} ${payloadData.lastName || ''}`.trim(),
        email: payloadData.email || '',
        phone: formatPhoneForGHL(payloadData.phone || ''),
        address: payloadData.address || '',
        fenceType: payloadData.fenceType || '',
        linearFeet: Number(payloadData.linearFeet || 0),
        finalPrice: Number(payloadData.finalPrice || payloadData.estimatedPrice || 0),
        estimateId: estimateId || payloadData.estimateId || '',
        estimateNumber: payloadData.estimateNumber || '',
        completedAt: payloadData.completedAt || new Date().toISOString(),
        jobStatus: 'Completed'
      };
    } else if (eventType === 'estimate_declined') {
      finalPayload = {
        eventType: 'estimate_declined',
        customerDecision: 'declined',
        jobStatus: 'Declined',
        estimateId: String(estimateId || payloadData.estimateId || ''),
        versionId: String(payloadData.versionId || ''),
        estimateNumber: String(payloadData.estimateNumber || ''),
        customerName: String(payloadData.customerName || ''),
        firstName: String(payloadData.firstName || (payloadData.customerName ? payloadData.customerName.split(' ')[0] : '')),
        lastName: String(payloadData.lastName || (payloadData.customerName ? payloadData.customerName.split(' ').slice(1).join(' ') : '')),
        email: String(payloadData.email || ''),
        phone: formatPhoneForGHL(payloadData.phone || ''),
        estimatedPrice: String(payloadData.estimatedPrice || 0),
        declineReason: String(payloadData.declineReason || 'Not specified'),
        declinedAt: String(payloadData.declinedAt || new Date().toISOString()),
        estimateLink: String(payloadData.estimateLink || '')
      };
    }

    console.log(`Triggering GHL Webhook for ${eventType} to ${webhookUrl}`);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalPayload)
    });

    const responseText = await response.text();
    const maskedUrl = webhookUrl.replace(/^(https?:\/\/[^\/]+).*$/, '$1/...');

    const logEntry = {
      eventType,
      timestamp: new Date().toISOString(),
      webhookUrl: maskedUrl,
      status: response.status,
      success: response.ok,
      error: response.ok ? null : `Status ${response.status}: ${responseText}`
    };

    if (firestoreDb && estimateId) {
      await saveLocalWebhookLog(firestoreDb, estimateId, logEntry);
    }

    if (!response.ok) {
      console.error(`GHL Webhook returned status ${response.status}: ${responseText}`);
      return { success: false, url: webhookUrl, status: response.status, error: responseText };
    }

    return { success: true, url: webhookUrl, status: response.status };
  } catch (err: any) {
    console.error(`Error executing GHL event webhook dispatch for ${eventType}:`, err);
    const logEntry = {
      eventType,
      timestamp: new Date().toISOString(),
      webhookUrl: 'Unknown',
      status: 500,
      success: false,
      error: err.message || 'Internal logic error'
    };
    if (firestoreDb && estimateId) {
      await saveLocalWebhookLog(firestoreDb, estimateId, logEntry);
    }
    return { success: false, error: err.message };
  }
}

async function syncCustomerToGhl({
  eventType,
  customer,
  estimate,
  status,
  source,
  scheduleDate
}: {
  eventType: string;
  customer?: any;
  estimate?: any;
  status?: string;
  source?: string;
  scheduleDate?: string;
}): Promise<{ success: boolean; message?: string; error?: string; ghlContactId?: string; ghlOpportunityId?: string }> {
  console.log(`[GHL API SYNC] Starting sync for event: ${eventType}`);
  let logId = 'log_' + Math.random().toString(36).substring(2, 10);
  let nowIso = new Date().toISOString();
  
  try {
    // 1. Resolve Company Settings
    const settingsSnap = await db.collection('companySettings').doc('braden-lonestar-uid').get();
    let settings: any = {};
    if (settingsSnap.exists) {
      settings = settingsSnap.data() || {};
    }

    // Check if GHL API Sync is enabled
    if (!settings.enableGhlApiSync) {
      console.log(`[GHL API SYNC] GHL API Sync is disabled in settings. Skipping API sync updates.`);
      const skippedLog = {
        id: logId,
        timestamp: nowIso,
        eventType,
        ghlContactId: null,
        ghlOpportunityId: null,
        success: true,
        message: 'Sync skipped: API Sync disabled'
      };
      await saveGhlSyncLogLocal(estimate?.id, customer?.id, skippedLog);
      return { success: true, message: 'Sync skipped: API Sync disabled' };
    }

    const apiKey = settings.ghlApiKey;
    const locationId = settings.ghlLocationId;

    if (!apiKey || !locationId) {
      console.warn(`[GHL API SYNC] Missing CRM API Key or Location ID.`);
      const errorLog = {
        id: logId,
        timestamp: nowIso,
        eventType,
        ghlContactId: null,
        ghlOpportunityId: null,
        success: false,
        error: 'Missing API Key or Location ID configuration'
      };
      await saveGhlSyncLogLocal(estimate?.id, customer?.id, errorLog);
      return { success: false, error: 'Missing CRM credentials' };
    }

    // 2. Extract and format contact fields
    // Use customer data or estimate data to form name, email, phone
    const email = (customer?.email || estimate?.customerEmail || estimate?.email || '').trim().toLowerCase();
    const phone = (customer?.phone || estimate?.customerPhone || estimate?.phone || '').trim();
    const firstName = (customer?.firstName || estimate?.firstName || '').trim();
    const lastName = (customer?.lastName || estimate?.lastName || '').trim();
    const customerName = (customer?.customerName || estimate?.customerName || `${firstName} ${lastName}`).trim();
    const address = (customer?.address || estimate?.address || estimate?.streetAddress || '').trim();
    const city = (customer?.city || estimate?.city || '').trim();
    const state = (customer?.state || estimate?.state || '').trim();
    const zip = (customer?.zip || estimate?.zip || estimate?.postalCode || '').trim();

    if (!email && !phone && !customerName) {
      console.warn(`[GHL API SYNC] Insufficient data to locate or create contact.`);
      return { success: false, error: 'Insufficient contact details' };
    }

    let ghlContactId = customer?.ghlContactId || estimate?.ghlContactId || '';
    
    // GHL API request helper headers
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Version': '2021-04-15',
      'Content-Type': 'application/json'
    };

    // 3. Search or Find existing Contact in GHL (if not already cached)
    if (!ghlContactId) {
      console.log(`[GHL API SYNC] No cached contact ID. Searching GHL...`);
      let foundContactId = '';

      if (email) {
        try {
          const res = await fetch(`https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&email=${encodeURIComponent(email)}`, { headers });
          if (res.ok) {
            const data: any = await res.json();
            if (data.contacts && data.contacts.length > 0) {
              foundContactId = data.contacts[0].id;
              console.log(`[GHL API SYNC] Found contact by email: ${foundContactId}`);
            }
          }
        } catch (err) {
          console.warn('[GHL API SYNC] Search by email failed:', err);
        }
      }

      if (!foundContactId && phone) {
        // format phone safely
        const cleanedPhone = phone.replace(/\D/g, '');
        const phoneVariants = [phone, cleanedPhone, `+1${cleanedPhone}`].filter(Boolean);
        for (const pv of phoneVariants) {
          try {
            const res = await fetch(`https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&phone=${encodeURIComponent(pv)}`, { headers });
            if (res.ok) {
              const data: any = await res.json();
              if (data.contacts && data.contacts.length > 0) {
                foundContactId = data.contacts[0].id;
                console.log(`[GHL API SYNC] Found contact by phone ${pv}: ${foundContactId}`);
                break;
              }
            }
          } catch (err) {
            console.warn('[GHL API SYNC] Search by phone failed:', err);
          }
        }
      }

      if (!foundContactId && customerName) {
        try {
          const res = await fetch(`https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&query=${encodeURIComponent(customerName)}`, { headers });
          if (res.ok) {
            const data: any = await res.json();
            if (data.contacts && data.contacts.length > 0) {
              foundContactId = data.contacts[0].id;
              console.log(`[GHL API SYNC] Found contact by query/name: ${foundContactId}`);
            }
          }
        } catch (err) {
          console.warn('[GHL API SYNC] Search by name failed:', err);
        }
      }

      if (foundContactId) {
        ghlContactId = foundContactId;
        // Save back to Firestore
        await saveCachedGhlContactId(estimate?.id, customer?.id, ghlContactId);
      }
    }

    // 4. Create contact if still missing
    if (!ghlContactId) {
      console.log(`[GHL API SYNC] No contact found in GHL. Creating a new one...`);
      const createBody: any = {
        locationId,
        firstName: firstName || customerName.split(' ')[0] || 'Unknown',
        lastName: lastName || customerName.split(' ').slice(1).join(' ') || 'Customer',
        name: customerName || 'New CRM Contact',
        email: email || undefined,
        phone: phone || undefined,
        address1: address || undefined,
        city: city || undefined,
        state: state || undefined,
        postalCode: zip || undefined,
        tags: ['customer-created']
      };

      try {
        const res = await fetch(`https://services.leadconnectorhq.com/contacts/`, {
          method: 'POST',
          headers,
          body: JSON.stringify(createBody)
        });
        if (res.ok) {
          const data: any = await res.json();
          ghlContactId = data.contact?.id || data.id;
          console.log(`[GHL API SYNC] Successfully created new GHL Contact: ${ghlContactId}`);
          await saveCachedGhlContactId(estimate?.id, customer?.id, ghlContactId);
        } else {
          const errText = await res.text();
          let errJson: any = null;
          try {
            errJson = JSON.parse(errText);
          } catch (e) {}

          const duplicateContactId = errJson?.contact?.id || errJson?.id || errJson?.meta?.contactId || errJson?.meta?.id;
          if (duplicateContactId) {
            ghlContactId = duplicateContactId;
            console.log(`[GHL API SYNC] Derived duplicate contact ID ${ghlContactId} from error payload.`);
            await saveCachedGhlContactId(estimate?.id, customer?.id, ghlContactId);
          } else {
            // Aggressive fallback search by query
            let foundByFallback = '';
            if (email) {
              try {
                const fRes = await fetch(`https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&query=${encodeURIComponent(email)}`, { headers });
                if (fRes.ok) {
                  const fData: any = await fRes.json();
                  if (fData.contacts && fData.contacts.length > 0) {
                    foundByFallback = fData.contacts[0].id;
                  }
                }
              } catch (e) {}
            }
            if (!foundByFallback && phone) {
              try {
                const fRes = await fetch(`https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&query=${encodeURIComponent(phone)}`, { headers });
                if (fRes.ok) {
                  const fData: any = await fRes.json();
                  if (fData.contacts && fData.contacts.length > 0) {
                    foundByFallback = fData.contacts[0].id;
                  }
                }
              } catch (e) {}
            }

            if (foundByFallback) {
              ghlContactId = foundByFallback;
              console.log(`[GHL API SYNC] Fallback search matched duplicate contact ID: ${ghlContactId}`);
              await saveCachedGhlContactId(estimate?.id, customer?.id, ghlContactId);
            } else {
              throw new Error(`Create contact returned HTTP ${res.status}: ${errText}`);
            }
          }
        }
      } catch (err: any) {
        console.error('[GHL API SYNC] Contact creation failed:', err);
        const errorLog = {
          id: logId,
          timestamp: nowIso,
          eventType,
          ghlContactId: null,
          ghlOpportunityId: null,
          success: false,
          error: `Contact creation failed: ${err.message || err}`
        };
        await saveGhlSyncLogLocal(estimate?.id, customer?.id, errorLog);
        return { success: false, error: `CRM contact creation failed: ${err.message}` };
      }
    }

    // 5. Update custom fields and tag contact
    // Determine the Tag of the event
    let eventTag = '';
    if (eventType === 'customer_created') eventTag = 'customer-created';
    else if (eventType === 'customer_estimator_submitted') eventTag = 'customer-estimator-submitted';
    else if (eventType === 'estimate_scheduled') eventTag = 'estimate-scheduled';
    else if (eventType === 'manual_estimate_sent') eventTag = 'estimate-sent';
    else if (eventType === 'estimate_accepted') eventTag = 'estimate-accepted';
    else if (eventType === 'estimate_declined') eventTag = 'estimate-declined';
    else if (eventType === 'job_scheduled') eventTag = 'job-scheduled';
    else if (eventType === 'estimate_completed' || eventType === 'job_completed' || eventType === 'completed') eventTag = 'LSFW - Job Completed';
    else if (eventType === 'archived') eventTag = 'estimate-archived';
    else if (eventType === 'labor_dispatched') eventTag = 'LSFW - Labor Dispatched';
    else if (eventType === 'crew_confirmed_72hr') eventTag = 'LSFW - Crew Confirmed 72hr';
    else if (eventType === 'crew_confirmed_24hr') eventTag = 'LSFW - Crew Confirmed 24hr';
    else if (eventType === 'schedule_conflict') eventTag = 'LSFW - Crew Schedule Conflict';
    else if (eventType === 'pre_build_complete') eventTag = 'LSFW - Pre Build Complete';
    else if (eventType === 'completion_submitted') eventTag = 'LSFW - Completion Checklist Submitted';
    else if (eventType === 'returned_to_crew') eventTag = 'LSFW - Returned To Crew';
    else if (eventType === 'vendor_doc_uploaded') eventTag = 'LSFW - Material Pickup Document Added';
    else if (eventType === 'materials_confirmed') eventTag = 'LSFW - Materials Confirmed';
    else if (eventType === 'material_issue_reported') eventTag = 'LSFW - Material Issue Reported';
    else if (eventType === 'start_approved_with_material_issue') eventTag = 'LSFW - Start Approved With Material Issue';
    else if (eventType === 'job_start_scheduled') eventTag = 'LSFW - Job Start Scheduled';
    else if (eventType === 'job_schedule_updated') eventTag = 'LSFW - Install Schedule Updated';

    // Map the human-readable job status
    let currentJobStatus = status || 'Interested';
    if (eventType === 'customer_estimator_submitted') currentJobStatus = 'Interested';
    else if (eventType === 'manual_estimate_sent') currentJobStatus = 'Proposed';
    else if (eventType === 'estimate_accepted') currentJobStatus = 'Accepted';
    else if (eventType === 'estimate_declined') currentJobStatus = 'Declined';
    else if (eventType === 'estimate_completed' || eventType === 'job_completed' || eventType === 'completed') currentJobStatus = 'Completed';
    else if (eventType === 'archived') currentJobStatus = 'Archived';
    else if (eventType === 'labor_dispatched') currentJobStatus = 'Labor Dispatched';
    else if (eventType === 'crew_confirmed_72hr') currentJobStatus = 'Crew Confirmed 72hr';
    else if (eventType === 'crew_confirmed_24hr') currentJobStatus = 'Crew Confirmed 24hr';
    else if (eventType === 'schedule_conflict') currentJobStatus = 'Crew Schedule Conflict';
    else if (eventType === 'pre_build_complete') currentJobStatus = 'Pre-Build Complete';
    else if (eventType === 'completion_submitted') currentJobStatus = 'Completion Checklist Submitted';
    else if (eventType === 'returned_to_crew') currentJobStatus = 'Returned to Crew';
    else if (eventType === 'materials_confirmed') currentJobStatus = 'Materials Confirmed';
    else if (eventType === 'material_issue_reported') currentJobStatus = 'Material Issue Reported';
    else if (eventType === 'start_approved_with_material_issue') currentJobStatus = 'Start Approved with Issue';
    else if (eventType === 'job_start_scheduled') currentJobStatus = 'Start Date Scheduled';

    // Form Custom Fields array
    const customFieldsPayload: { id: string; value: any }[] = [];
    const gcf = settings.ghlCustomFields;
    
    if (gcf) {
      const addCf = (key: string, val: any) => {
        const fieldId = gcf[key];
        if (fieldId && val !== undefined && val !== null && val !== '') {
          customFieldsPayload.push({ id: fieldId, value: val });
        }
      };

      if (estimate) {
        addCf('estimateId', estimate.id || '');
        addCf('estimateNumber', estimate.estimateNumber || '');
        const finalEstimateLink = `https://fence-estimator-eight.vercel.app/?portal=contract&estimateId=${estimate.id}&versionId=${estimate.latestContractVersionId || ''}`;
        addCf('estimateLink', finalEstimateLink);
        addCf('estimatedPrice', Number(estimate.totalCost || estimate.manualGrandTotal || 0));
        addCf('fenceType', estimate.fenceMaterial || estimate.woodType || estimate.fenceType || '');
        addCf('linearFeet', Number(estimate.linearFeet || 0));
        addCf('customerName', estimate.customerName || (customer ? customer.customerName : ''));
        addCf('address', estimate.customerAddress || estimate.address || (customer ? (customer.address || customer.streetAddress) : ''));
        
        // Add new labor dispatches details
        addCf('laborSnapshotLink', estimate.laborSnapshotLink || '');
        addCf('crewScheduleLink', estimate.crewScheduleLink || '');
        addCf('assignedCrew', estimate.assignedCrew || '');
        addCf('dispatchDate', estimate.dispatchDate || '');

        // Add vendor & material confirmation details
        addCf('vendorName', estimate.vendorName || '');
        addCf('vendorSalesOrderNumber', estimate.vendorSalesOrderNumber || '');
        addCf('materialPickupLocation', estimate.materialPickupLocation || '');
        addCf('materialConfirmationStatus', estimate.materialConfirmationStatus || '');
        addCf('materialsConfirmedAt', estimate.materialsConfirmedAt || '');
        addCf('materialIssueReported', estimate.materialIssueReported || '');
        addCf('materialIssueSummary', estimate.materialIssueSummary || '');

        // Add new scheduling details
        addCf('jobStartDate', estimate.scheduledStartDate || estimate.jobStartDate || scheduleDate || '');
        addCf('jobScheduledDuration', estimate.scheduledDuration || estimate.jobDuration || '');
        addCf('installDays', estimate.scheduledDuration || estimate.jobDuration || '');
        addCf('jobDuration', estimate.scheduledDuration || estimate.jobDuration || '');
        addCf('crewName', estimate.scheduledByCrewName || estimate.assignedCrew || estimate.crewName || '');
        addCf('jobPortalScheduled', estimate.jobPortalScheduled === true || estimate.jobPortalScheduled === 'true' || false);
        addCf('scheduleLastChangedAt', estimate.scheduleLastChangedAt || '');
        addCf('scheduleLastChangedBy', estimate.scheduleLastChangedBy || '');
        addCf('scheduleChangeReason', estimate.scheduleChangeReason || '');
        addCf('scheduleChangeNotes', estimate.scheduleChangeNotes || '');
      }

      addCf('jobStatus', currentJobStatus);

      if (eventType === 'customer_estimator_submitted') {
        addCf('customerEstimatorSubmittedAt', nowIso);
      }
      if (eventType === 'manual_estimate_sent') {
        addCf('lastEstimateSentAt', nowIso);
      }
      if (eventType === 'estimate_accepted') {
        addCf('acceptedAt', nowIso);
        const targetMinDate = new Date();
        const leadDays = settings.minimumInstallLeadDays !== undefined ? Number(settings.minimumInstallLeadDays) : 4;
        targetMinDate.setDate(targetMinDate.getDate() + leadDays);
        const minInstallStr = targetMinDate.toISOString().split('T')[0];
        addCf('minimumInstallDate', minInstallStr);
      }
      if (eventType === 'estimate_declined') {
        addCf('declinedAt', nowIso);
      }
      if (eventType === 'estimate_scheduled' || eventType === 'job_scheduled') {
        addCf('scheduledStartDate', scheduleDate || nowIso);
      }
      if (eventType === 'estimate_completed' || eventType === 'job_completed') {
        addCf('completedAt', nowIso);
      }
    }

    // Call update tags and fields on contact
    try {
      console.log(`[GHL API SYNC] Updating GHL Contact details: ${ghlContactId}`);
      const updateRes = await fetch(`https://services.leadconnectorhq.com/contacts/${ghlContactId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          tags: eventTag ? [eventTag] : undefined,
          customFields: customFieldsPayload.length > 0 ? customFieldsPayload : undefined
        })
      });
      if (!updateRes.ok) {
        const errText = await updateRes.text();
        console.warn(`[GHL API SYNC] Contact update response: HTTP ${updateRes.status}: ${errText}`);
      }
    } catch (err) {
      console.error('[GHL API SYNC] Contact updates failed:', err);
    }

    // 6. Manage CRM Pipelines / Opportunities
    let ghlOpportunityId = '';
    let stageName = '';
    let pipelineId = settings.ghlPipelineId;
    let stageId = '';

    // Map Event types to stage labels
    let mappedStageLabel = '';
    if (eventType === 'customer_created') mappedStageLabel = 'Interested';
    else if (eventType === 'customer_estimator_submitted') mappedStageLabel = 'Appointment Requested';
    else if (eventType === 'estimate_scheduled') mappedStageLabel = 'Estimate Scheduled';
    else if (eventType === 'manual_estimate_sent') mappedStageLabel = 'Estimate Sent';
    else if (eventType === 'estimate_accepted') mappedStageLabel = 'Accepted';
    else if (eventType === 'estimate_declined') mappedStageLabel = 'Declined';
    else if (eventType === 'job_scheduled') mappedStageLabel = 'Scheduled';
    else if (eventType === 'labor_dispatched' || eventType === 'crew_confirmed_72hr' || eventType === 'crew_confirmed_24hr' || eventType === 'pre_build_complete' || eventType === 'completion_submitted' || eventType === 'returned_to_crew') mappedStageLabel = 'Scheduled';
    else if (eventType === 'estimate_completed' || eventType === 'job_completed' || eventType === 'completed') mappedStageLabel = 'Completed';
    else if (eventType === 'archived') mappedStageLabel = 'Archived';

    if (pipelineId && mappedStageLabel && settings.ghlOpportunityStages) {
      stageId = settings.ghlOpportunityStages[mappedStageLabel];
      stageName = mappedStageLabel;
    }

    if (pipelineId && stageId) {
      console.log(`[GHL API SYNC] Pipeline opportunity mapped. Stage: ${stageName} (${stageId})`);
      
      // Map opportunity open/won/lost status based on state
      let oppStatus = 'open';
      if (eventType === 'estimate_accepted') oppStatus = 'open';
      else if (eventType === 'estimate_declined') oppStatus = 'lost';
      else if (eventType === 'estimate_completed' || eventType === 'job_completed' || eventType === 'completed') oppStatus = 'won';
      else if (eventType === 'archived') oppStatus = 'abandoned';

      const monetaryValue = Number(estimate?.totalCost || estimate?.manualGrandTotal || 0);
      const opportunityName = `${customerName} - ${estimate?.fenceMaterial || estimate?.woodType || 'Fence Estimate'}`;

      // Search for open/matching opportunities for this contact in the pipeline
      let existingOppId = '';
      try {
        console.log(`[GHL API SYNC] Searching for existing opportunities...`);
        const oppSearch = await fetch(`https://services.leadconnectorhq.com/opportunities/search?locationId=${locationId}&contactId=${ghlContactId}`, {headers});
        if (oppSearch.ok) {
          const oppData: any = await oppSearch.json();
          const opps = oppData.opportunities || [];
          const match = opps.find((o: any) => o.pipelineId === pipelineId);
          if (match) {
            existingOppId = match.id;
            console.log(`[GHL API SYNC] Found matching opportunity: ${existingOppId}`);
          }
        }
      } catch (err) {
        console.warn('[GHL API SYNC] Search opportunity failed:', err);
      }

      if (existingOppId) {
        // Update existing opportunity
        try {
          console.log(`[GHL API SYNC] Updating GHL Opportunity: ${existingOppId}`);
          const oppRes = await fetch(`https://services.leadconnectorhq.com/opportunities/${existingOppId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              pipelineId,
              pipelineStageId: stageId,
              status: oppStatus,
              monetaryValue: monetaryValue || undefined
            })
          });
          console.log(`[GHL API SYNC] PUT Payload keys: ${Object.keys({
            pipelineId,
            pipelineStageId: stageId,
            status: oppStatus,
            monetaryValue: monetaryValue || undefined
          }).join(', ')}`);
          if (oppRes.ok) {
            ghlOpportunityId = existingOppId;
          } else {
            const errText = await oppRes.text();
            console.warn(`[GHL API SYNC] Update opportunity failed: HTTP ${oppRes.status}: ${errText}`);
          }
        } catch (err) {
          console.error('[GHL API SYNC] Opportunity update endpoint failed:', err);
        }
      } else {
        // Create new opportunity
        try {
          console.log(`[GHL API SYNC] Creating GHL Opportunity...`);
          const oppRes = await fetch(`https://services.leadconnectorhq.com/opportunities/`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              pipelineId,
              locationId,
              contactId: ghlContactId,
              pipelineStageId: stageId,
              name: opportunityName,
              status: oppStatus,
              monetaryValue: monetaryValue || undefined
            })
          });
          console.log(`[GHL API SYNC] POST Payload keys: ${Object.keys({
            pipelineId,
            locationId,
            contactId: ghlContactId,
            pipelineStageId: stageId,
            name: opportunityName,
            status: oppStatus,
            monetaryValue: monetaryValue || undefined
          }).join(', ')}`);
          if (oppRes.ok) {
            const oppData: any = await oppRes.json();
            ghlOpportunityId = oppData.opportunity?.id || oppData.id;
            console.log(`[GHL API SYNC] Successfully created new GHL Opportunity: ${ghlOpportunityId}`);
          } else {
            const errText = await oppRes.text();
            console.warn(`[GHL API SYNC] Create opportunity failed: HTTP ${oppRes.status}: ${errText}`);
          }
        } catch (err) {
          console.error('[GHL API SYNC] Opportunity creation endpoint failed:', err);
        }
      }
    }

    // 7. Write Logging entry and complete
    const successLog = {
      id: logId,
      timestamp: nowIso,
      eventType,
      ghlContactId: ghlContactId || null,
      ghlOpportunityId: ghlOpportunityId || null,
      success: true,
      stageName: stageName || null,
      stageId: stageId || null,
      error: null
    };
    await saveGhlSyncLogLocal(estimate?.id, customer?.id, successLog);

    return {
      success: true,
      ghlContactId,
      ghlOpportunityId,
      message: 'GoHighLevel sync successfully completed'
    };

  } catch (err: any) {
    console.error(`[GHL API SYNC ERROR] outermost syncCustomerToGhl error:`, err);
    const failureLog = {
      id: logId,
      timestamp: nowIso,
      eventType,
      ghlContactId: null,
      ghlOpportunityId: null,
      success: false,
      error: err.message || String(err)
    };
    await saveGhlSyncLogLocal(estimate?.id, customer?.id, failureLog);
    return { success: false, error: err.message || String(err) };
  }
}

async function saveCachedGhlContactId(estimateId?: string, customerId?: string, ghlContactId?: string) {
  if (!ghlContactId) return;
  const updateObj = { ghlContactId, updatedAt: new Date().toISOString() };

  if (customerId) {
    try {
      await db.collection('customers').doc(String(customerId)).set(updateObj, { merge: true });
    } catch (e) {
      console.warn('Failed caching contact ID to customer:', e);
    }
  }

  if (estimateId) {
    try {
      await db.collection('estimates').doc(String(estimateId)).set(updateObj, { merge: true });
    } catch (e) {
      console.warn('Failed caching contact ID to estimate:', e);
    }
    const estimateDoc = await db.collection('estimates').doc(String(estimateId)).get();
    if (!estimateDoc.exists) {
      const usersSnap = await db.collection('users').get();
      for (const uDoc of usersSnap.docs) {
        try {
          const ref = db.collection('users').doc(uDoc.id).collection('estimates').doc(String(estimateId));
          const snap = await ref.get();
          if (snap.exists) {
            await ref.set(updateObj, { merge: true });
          }
        } catch (e) {}
      }
    }
  }
}

async function saveGhlSyncLogLocal(estimateId: string | undefined, customerId: string | undefined, logEntry: any) {
  const nowIso = new Date().toISOString();

  if (customerId) {
    try {
      const custRef = db.collection('customers').doc(String(customerId));
      const snap = await custRef.get();
      if (snap.exists) {
        const data = snap.data() || {};
        const oldLogs = data.ghlSyncLog || [];
        const updatedLogs = [logEntry, ...oldLogs].slice(0, 50);
        await custRef.set({ ghlSyncLog: updatedLogs, updatedAt: nowIso }, { merge: true });
      }
    } catch (e) {
      console.warn('Failed appending sync log to customer:', e);
    }
  }

  if (estimateId) {
    try {
      let isCachedMatched = false;
      const estRef = db.collection('estimates').doc(String(estimateId));
      let snap = await estRef.get();
      if (snap.exists) {
        isCachedMatched = true;
        const data = snap.data() || {};
        const oldLogs = data.ghlSyncLog || [];
        const updatedLogs = [logEntry, ...oldLogs].slice(0, 50);
        await estRef.set({ ghlSyncLog: updatedLogs, updatedAt: nowIso }, { merge: true });
      }

      if (!isCachedMatched) {
        const usersSnap = await db.collection('users').get();
        for (const uDoc of usersSnap.docs) {
          const nestedRef = db.collection('users').doc(uDoc.id).collection('estimates').doc(String(estimateId));
          snap = await nestedRef.get();
          if (snap.exists) {
            const data = snap.data() || {};
            const oldLogs = data.ghlSyncLog || [];
            const updatedLogs = [logEntry, ...oldLogs].slice(0, 50);
            await nestedRef.set({ ghlSyncLog: updatedLogs, updatedAt: nowIso }, { merge: true });
            break;
          }
        }
      }
    } catch (e) {
      console.warn('Failed appending sync log to estimate:', e);
    }
  }
}

/**
 * Helper to sync schedule events to GHL Install Calendar
 */
/**
 * Helper to log GHL Activity to a central firestore collection
 */
async function logGhlActivity(log: {
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
async function saveGhlSyncDebug(estimateId: string, debugObj: any) {
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
  actionName: string = 'syncEstimateToGhlCalendar'
): Promise<any> {
  return libSyncEstimateToGhlCalendar(
    estimateId,
    estimateData,
    startDate,
    duration,
    notes,
    token,
    scheduleSyncTraceId,
    actionName,
    syncCustomerToGhl
  );
}

async function getEstimateDocRef(estimateId: string) {
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

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'];
  if (!allowedMethods.includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const action = req.query?.action || req.body?.action;

    // --- REAL BACKEND SCHEDULE ACTION RECEIVED ---
    const scheduleActions = [
      'schedule-job-start', 
      'reschedule-job', 
      'admin-update-schedule', 
      'create-schedule-event', 
      'update-schedule-event', 
      'update-job-schedule',
      'update-crew-install-schedule'
    ];
    if (scheduleActions.includes(action)) {
      // Availability Validation
      const vStartDate = req.body?.startDate || req.query?.startDate;
      const vDuration = Number(req.body?.duration || req.query?.duration || 1);
      const vEventType = req.body?.type || 'Job';
      const vEstId = req.body?.estimateId || req.query?.estimateId;

      if (vStartDate && (vEventType === 'Job' || vEventType === 'Estimate' || vEstId)) {
        try {
          const settingsSnap = await db.collection('companySettings').doc('braden-lonestar-uid').get();
          const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
          const unavailableDays = settings.unavailableInstallDays || ['Sunday'];
          
          const validation = isInstallOnUnavailableDay(vStartDate, vDuration, unavailableDays);
          if (validation.isUnavailable) {
            console.warn(`[AVAILABILITY BLOCKED] Action ${action} rejected. Reason: ${validation.day} is unavailable. Date: ${validation.date}`);
            return res.status(400).json({ 
              success: false, 
              reason: 'sunday_unavailable',
              error: `Installs cannot be scheduled on ${validation.day}s. This timeframe includes ${validation.date}.`
            });
          }
        } catch (err) {
          console.error("Failed to validate install availability:", err);
        }
      }
    }

    // --- SCHEDULER TRACE REPORT STEP LOGGING ---
    if (action === 'write-scheduler-trace') {
      try {
        const { traceId, logData } = req.body || {};
        if (!traceId) {
          return res.status(400).json({ error: 'Missing traceId' });
        }
        await logGhlActivity({
          traceId,
          ...logData
        });
        return res.status(200).json({ success: true });
      } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message || String(err) });
      }
    }

    // --- CUSTOMER LOOKUP & PREFILL SEARCH ENDPOINTS ---
    if (action === 'search-customer-prefill' || action === 'search-customers') {
      const searchQuery = (req.body?.query || req.query?.query || '').toString().trim().toLowerCase();
      
      if (!searchQuery) {
        return res.status(200).json([]);
      }

      const results: any[] = [];
      const seenKeys = new Set<string>(); // to prevent duplicates

      // 1. Search in /customers collection
      try {
        const customersSnap = await db.collection('customers').limit(200).get();
        customersSnap.forEach(doc => {
          const data = doc.data() || {};
          const customerName = data.customerName || `${data.firstName || ''} ${data.lastName || ''}`.trim();
          const email = data.email || '';
          const phone = data.phone || '';
          const address = data.address || data.streetAddress || '';
          
          const matchText = `${customerName} ${email} ${phone} ${address}`.toLowerCase();
          if (matchText.includes(searchQuery)) {
            const key = `${customerName}|${email}|${phone}|${address}`.toLowerCase();
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              results.push({
                id: doc.id,
                customerId: doc.id,
                firstName: data.firstName || '',
                lastName: data.lastName || '',
                customerName,
                email,
                phone,
                address,
                city: data.city || '',
                state: data.state || '',
                zip: data.zip || '',
                source: data.source === 'GHL' ? 'GHL' : 'App Customer'
              });
            }
          }
        });
      } catch (err) {
        console.warn('Error reading customers collection for prefill search:', err);
      }

      // 2. Search in /estimates
      try {
        const estimatesSnap = await db.collection('estimates').orderBy('createdAt', 'desc').limit(200).get();
        estimatesSnap.forEach(doc => {
          const data = doc.data() || {};
          const customerName = data.customerName || `${data.firstName || ''} ${data.lastName || ''}`.trim();
          const email = data.customerEmail || data.email || '';
          const phone = data.customerPhone || data.phone || '';
          const address = data.customerAddress || data.address || '';
          
          const matchText = `${customerName} ${email} ${phone} ${address}`.toLowerCase();
          if (matchText.includes(searchQuery)) {
            const key = `${customerName}|${email}|${phone}|${address}`.toLowerCase();
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              results.push({
                id: doc.id,
                estimateId: doc.id,
                firstName: data.firstName || '',
                lastName: data.lastName || '',
                customerName,
                email,
                phone,
                address,
                city: data.customerCity || data.city || '',
                state: data.customerState || data.state || '',
                zip: data.customerZip || data.zip || '',
                source: 'Previous Estimate'
              });
            }
          }
        });
      } catch (err) {
        console.warn('Error reading estimates for prefill search:', err);
      }

      return res.status(200).json(results.slice(0, 15));
    }

    if (action === 'get-customer-prefill') {
      const customerId = req.query?.customerId || req.body?.customerId;
      const estimateId = req.query?.estimateId || req.body?.estimateId;

      if (customerId) {
        const docSnap = await db.collection('customers').doc(String(customerId)).get();
        if (docSnap.exists) {
          const data = docSnap.data() || {};
          return res.status(200).json({
            success: true,
            customerId: docSnap.id,
            firstName: data.firstName || '',
            lastName: data.lastName || '',
            customerName: data.customerName || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
            email: data.email || '',
            phone: data.phone || '',
            address: data.address || data.streetAddress || '',
            city: data.city || '',
            state: data.state || '',
            zip: data.zip || '',
            source: data.source === 'GHL' ? 'GHL' : 'App Customer'
          });
        }
      }

      if (estimateId) {
        const { docRef, snap } = await getEstimateDocRef(String(estimateId));
        if (snap.exists) {
          const data = snap.data() || {};
          return res.status(200).json({
            success: true,
            estimateId: snap.id,
            firstName: data.firstName || '',
            lastName: data.lastName || '',
            customerName: data.customerName || `${data.firstName || ''} ${data.lastName || ''}`.trim(),
            email: data.customerEmail || data.email || '',
            phone: data.customerPhone || data.phone || '',
            address: data.customerAddress || data.address || '',
            city: data.customerCity || data.city || '',
            state: data.customerState || data.state || '',
            zip: data.customerZip || data.zip || '',
            source: 'Previous Estimate'
          });
        }
      }

      return res.status(404).json({ error: 'Customer or estimate prefill record not found.' });
    }

    function cleanTimestamp(val: any): string {
      if (!val) return new Date().toISOString();
      if (typeof val.toDate === 'function') {
        return val.toDate().toISOString();
      }
      if (val && typeof val === 'object') {
        const secs = val._seconds || val.seconds;
        if (secs !== undefined) {
          return new Date(secs * 1000).toISOString();
        }
      }
      if (typeof val === 'string') return val;
      return new Date().toISOString();
    }

    if (req.method === 'GET') {
      if (!action) {
        // Handle listing estimates (integrated from api/estimates/list.ts)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
        }

        const token = authHeader.split(' ')[1];
        let decoded: any;
        try {
          decoded = jwt.verify(token, JWT_SECRET);
        } catch (err: any) {
          console.error('JWT verification error in estimates list:', err.message);
          return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

        const uid = decoded.uid;
        const decodedEmail = decoded.email?.toLowerCase();
        const isAdmin = decoded.isAdmin || 
                        uid === 'braden-lonestar-uid' || 
                        decodedEmail === 'bradens@lonestarfenceworks.com' || 
                        decodedEmail === 'usmc6123@gmail.com';

        const list: any[] = [];

        if (isAdmin) {
          const snap = await db.collection('estimates').get();
          snap.forEach(doc => {
            list.push({ id: doc.id, ...doc.data() });
          });
        } else {
          const queryByUid = await db.collection('estimates').where('uid', '==', uid).get();
          const queryByUserId = await db.collection('estimates').where('userId', '==', uid).get();

          const mergedMap = new Map();
          queryByUid.forEach(doc => mergedMap.set(doc.id, doc));
          queryByUserId.forEach(doc => mergedMap.set(doc.id, doc));

          try {
            const querySub = await db.collection('users').doc(uid).collection('estimates').get();
            querySub.forEach(doc => mergedMap.set(doc.id, doc));
          } catch (err) {
            console.warn('Subcollection fetch fallback failed or empty:', err);
          }

          mergedMap.forEach(doc => {
            list.push({ id: doc.id, ...doc.data() });
          });
        }

        list.sort((a, b) => {
          const timeA = a.createdAt ? (a.createdAt._seconds ? a.createdAt._seconds * 1000 : new Date(a.createdAt).getTime()) : 0;
          const timeB = b.createdAt ? (b.createdAt._seconds ? b.createdAt._seconds * 1000 : new Date(b.createdAt).getTime()) : 0;
          return timeB - timeA;
        });

        const cleanList = list.map(est => {
          return {
            ...est,
            createdAt: cleanTimestamp(est.createdAt),
            lastModified: cleanTimestamp(est.lastModified || est.createdAt)
          };
        });

        return res.status(200).json(cleanList);
      }
      if (action === 'get-public-estimate' || action === 'view-public-estimate') {
        const estimateId = req.query?.estimateId || req.body?.estimateId;
        if (!estimateId) {
          return res.status(400).json({
            success: false,
            error: "Missing estimateId"
          });
        }
      }
    }

    // --- SECURE PUBLIC CREW SCHEDULING PORTAL ENDPOINTS ---
    if (action === 'get-crew-schedule') {
      const estimateId = req.query?.estimateId || req.body?.estimateId;
      const token = req.query?.token || req.body?.token;

      if (!estimateId) {
        return res.status(400).json({ error: 'Estimate ID is required.' });
      }
      if (!token) {
        return res.status(400).json({ error: 'Security token is required.' });
      }

      const { docRef, snap } = await getEstimateDocRef(estimateId);
      if (!snap.exists) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const estimateData = snap.data() || {};
      if (!estimateData.crewScheduleAccessEnabled) {
        return res.status(403).json({ error: 'Crew scheduling access is disabled.' });
      }
      if (estimateData.crewScheduleToken !== token) {
        return res.status(403).json({ error: 'Invalid security token.' });
      }

      const eventsList: any[] = [];
      const eventsSnap = await db.collection('schedule_events').get();
      eventsSnap.forEach(doc => {
        const data = doc.data() || {};
        const isInstall = data.eventType === 'install' || data.type === 'installation';
        const isBlackout = data.eventType === 'blackout' || data.type === 'blackout';
        
        if (isInstall || isBlackout) {
          eventsList.push({
            id: doc.id,
            title: isBlackout ? 'Blackout Date (Blocked)' : 'Installation Scheduled (Busy)',
            start: data.start,
            end: data.end || data.start,
            allDay: data.allDay !== undefined ? data.allDay : true,
            type: data.type || (isBlackout ? 'blackout' : 'installation'),
            eventType: data.eventType || (isBlackout ? 'blackout' : 'install')
          });
        }
      });

      const laborContractSnapshot = estimateData.laborContractSnapshot || {
        customerName: estimateData.customerName || 'Valued Client',
        jobAddress: estimateData.customerAddress || estimateData.address || 'N/A',
        fenceType: estimateData.fenceType || 'Fence',
        height: estimateData.height || 6,
        linearFeet: estimateData.linearFeet || 0,
        totalDirectLaborPayout: estimateData.grandTotal || 0,
        scopeOfWorkHtmlOrText: estimateData.scopeOfWorkHtmlOrText || "Standard installation procedures apply.",
        drawingUrl: estimateData.drawingUrl || null,
        drawingFileName: estimateData.drawingFileName || null,
        drawingMimeType: estimateData.drawingMimeType || null
      };

      return res.status(200).json({
        success: true,
        estimateId,
        customerName: estimateData.customerName || 'Valued Client',
        jobAddress: estimateData.customerAddress || estimateData.address || 'N/A',
        fenceType: estimateData.fenceType || (estimateData.contractSnapshot && estimateData.contractSnapshot.fenceType) || 'Fence',
        linearFeet: estimateData.linearFeet || (estimateData.contractSnapshot && estimateData.contractSnapshot.linearFeet) || 0,
        installDuration: estimateData.installDuration || 1,
        scheduledStartDate: estimateData.scheduledStartDate || null,
        scheduledEndDate: estimateData.scheduledEndDate || null,
        preferredInstallDate: estimateData.preferredInstallDate || null,
        installStatus: estimateData.installStatus || 'Pending',
        allowCrewDirectSchedule: !!estimateData.allowCrewDirectSchedule,
        events: eventsList,
        crewScheduleRequestPending: !!estimateData.crewScheduleRequestPending,
        crewRequestedStartDate: estimateData.crewRequestedStartDate || null,
        crewRequestedDuration: estimateData.crewRequestedDuration || null,
        laborContractSnapshot
      });
    }

    if (action === 'update-crew-install-schedule') {
      const estimateId = req.query?.estimateId || req.body?.estimateId;
      const token = req.query?.token || req.body?.token;
      const { scheduledStartDate, installDuration } = req.body || {};

      if (!estimateId) {
        return res.status(400).json({ error: 'Estimate ID is required.' });
      }
      if (!token) {
        return res.status(400).json({ error: 'Security token is required.' });
      }
      if (!scheduledStartDate) {
        return res.status(400).json({ error: 'Scheduled start date is required.' });
      }
      if (!installDuration || Number(installDuration) <= 0) {
        return res.status(400).json({ error: 'Valid installation duration is required.' });
      }

      const { docRef, snap } = await getEstimateDocRef(estimateId);
      if (!snap.exists) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const estimateData = snap.data() || {};
      if (!estimateData.crewScheduleAccessEnabled) {
        return res.status(403).json({ error: 'Crew scheduling access is disabled.' });
      }
      if (estimateData.crewScheduleToken !== token) {
        return res.status(403).json({ error: 'Invalid security token.' });
      }

      const startD = new Date(scheduledStartDate);
      const endD = new Date(scheduledStartDate);
      endD.setDate(endD.getDate() + Number(installDuration));
      
      const proposedStartStr = startD.toISOString().split('T')[0];
      const proposedEndStr = endD.toISOString().split('T')[0];

      const eventsSnap = await db.collection('schedule_events').get();
      let isBlocked = false;

      const cleanDateMs = (dStr: string) => {
        return new Date(dStr.split('T')[0]).getTime();
      };
      const pStart = cleanDateMs(proposedStartStr);
      const pEnd = cleanDateMs(proposedEndStr);

      eventsSnap.forEach(doc => {
        const data = doc.data() || {};
        const isBlackout = data.eventType === 'blackout' || data.type === 'blackout';
        if (isBlackout) {
          const bStart = data.start;
          let bEnd = data.end || data.start;
          if (bStart === bEnd) {
            const d = new Date(bStart);
            d.setDate(d.getDate() + 1);
            bEnd = d.toISOString().split('T')[0];
          }

          const bs = cleanDateMs(bStart);
          const be = cleanDateMs(bEnd);

          if ((pStart < be) && (bs < pEnd)) {
            isBlocked = true;
          }
        }
      });

      if (isBlocked) {
        return res.status(400).json({
          error: 'This date is blocked out for installation. Please choose another date.'
        });
      }

      const changedAt = new Date().toISOString();
      const oldStartDate = estimateData.scheduledStartDate || null;

      const historyEntry = {
        source: "crew_portal",
        changedAt,
        oldStartDate,
        newStartDate: proposedStartStr,
        duration: Number(installDuration),
        crewEmailRecipient: estimateData.crewEmailRecipient || '',
        action: estimateData.allowCrewDirectSchedule ? "direct_schedule" : "schedule_request"
      };

      const updates: any = {};

      if (estimateData.allowCrewDirectSchedule) {
        updates.scheduledStartDate = proposedStartStr;
        updates.scheduledEndDate = proposedEndStr;
        updates.installDuration = Number(installDuration);
        
        const oldStatus = estimateData.jobStatus || 'Pending';
        if (oldStatus !== 'In Progress' && oldStatus !== 'Accepted') {
          updates.jobStatus = 'Scheduled';
        }

        const eventId = "install-" + estimateId;
        const eventPayload = {
          id: eventId,
          estimateId: estimateId,
          title: `Install - ${estimateData.customerName || 'Customer'} - ${estimateData.customerAddress || ''}`,
          start: proposedStartStr,
          end: proposedEndStr,
          allDay: true,
          type: 'installation',
          eventType: 'install',
          userId: estimateData.userId || 'braden-lonestar-uid',
          notes: `Schedule set via Crew Portal for ${estimateData.crewEmailRecipient || 'Crew'}`
        };

        await db.collection('schedule_events').doc(eventId).set(eventPayload, { merge: true });
        updates.crewScheduleRequestPending = false;
      } else {
        updates.crewScheduleRequestPending = true;
        updates.crewRequestedStartDate = proposedStartStr;
        updates.crewRequestedDuration = Number(installDuration);
        updates.crewScheduleRequestedAt = changedAt;
      }

      updates.scheduleHistory = admin.firestore.FieldValue.arrayUnion(historyEntry);

      await docRef.update(updates);

      return res.status(200).json({
        success: true,
        directScheduled: !!estimateData.allowCrewDirectSchedule,
        scheduledStartDate: proposedStartStr,
        scheduledEndDate: proposedEndStr,
        installDuration: Number(installDuration)
      });
    }

    if (action === 'get-crew-jobs') {
      const estimateId = (req.query?.estimateId || req.body?.estimateId) as string;
      const token = (req.query?.token || req.body?.token) as string;

      if (!estimateId || !token) {
        return res.status(400).json({ error: 'Estimate ID and token are required.' });
      }

      const { snap } = await getEstimateDocRef(estimateId);
      if (!snap.exists) return res.status(404).json({ error: 'Estimate not found' });
      const estimateData = snap.data() || {};

      const isValidToken = (estimateData.laborSnapshotToken === token || estimateData.crewScheduleToken === token);
      if (!isValidToken) return res.status(403).json({ error: 'Invalid security token.' });

      const assignedCrew = estimateData.assignedCrew;
      if (!assignedCrew) return res.json({ jobs: [] });

      const jobsSnap = await db.collection('estimates')
        .where('assignedCrew', '==', assignedCrew)
        .where('status', '!=', 'archived')
        .get();

      const jobs: any[] = [];
      jobsSnap.forEach(d => {
        const dData = d.data();
        if (dData.scheduledStartDate) {
           jobs.push({
             id: d.id,
             customerName: dData.customerName,
             customerAddress: dData.customerAddress || dData.address,
             city: dData.city,
             scheduledStartDate: dData.scheduledStartDate,
             scheduledDuration: dData.scheduledDuration || dData.installDuration || 1,
             jobStatus: dData.jobStatus,
             laborSnapshotToken: dData.laborSnapshotToken,
             crewScheduleToken: dData.crewScheduleToken
           });
        }
      });

      return res.json({ jobs });
    }

    if (action === 'update-job-schedule') {
      const { estimateId, token, startDate, duration, reason, notes, changedBy } = req.body;

      if (!estimateId || !token) {
        return res.status(400).json({ error: 'Estimate ID and token are required.' });
      }

      const { docRef, snap } = await getEstimateDocRef(estimateId);
      if (!snap.exists) return res.status(404).json({ error: 'Estimate not found' });
      const estimateData = snap.data() || {};

      const authHeader = req.headers.authorization;
      const isAdmin = !!authHeader && authHeader.startsWith('Bearer ');
      const isValidCrew = (estimateData.laborSnapshotToken === token || estimateData.crewScheduleToken === token);
      
      if (!isAdmin && !isValidCrew) {
        return res.status(403).json({ error: 'Unauthorized schedule adjustment.' });
      }

      const prevStartDate = estimateData.scheduledStartDate;
      const prevDuration = estimateData.scheduledDuration || estimateData.installDuration || 1;

      const updateData: any = {
        scheduledStartDate: startDate,
        scheduledDuration: duration,
        scheduleLastChangedAt: new Date().toISOString(),
        scheduleLastChangedBy: changedBy,
        scheduleChangeReason: reason,
        scheduleChangeNotes: notes || ''
      };

      const durationNum = parseInt(String(duration)) || 1;
      const startD = new Date(startDate);
      const endD = new Date(startD);
      endD.setDate(endD.getDate() + durationNum - 1);
      updateData.scheduledEndDate = endD.toISOString().split('T')[0];

      await docRef.update(updateData);

      // Also update the schedule event if it exists
      const eventId = "install-" + estimateId;
      await db.collection('schedule_events').doc(eventId).set({
        start: updateData.scheduledStartDate,
        end: updateData.scheduledEndDate,
        notes: `Schedule adjusted by ${changedBy}. Reason: ${reason}. Notes: ${notes || ''}`
      }, { merge: true });

      const scheduleSyncTraceId = req.body.scheduleSyncTraceId || ("trace-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9));

      console.log(`[BACKEND ACTION TRACE] action_received: update-job-schedule
        scheduleSyncTraceId: ${scheduleSyncTraceId}
        action: update-job-schedule
        estimateId: ${estimateId}
        scheduleEventId: ${eventId}
        selected start date: ${startDate}
        duration/install days: ${duration}
        whether schedule event was saved: YES
        whether estimate was updated: YES
        whether GHL sync was requested: YES
        which helper function was called: syncEstimateToGhlCalendar
      `);

      // Sync GHL Calendar
      try {
        await syncEstimateToGhlCalendar(
          estimateId, 
          { ...estimateData, ...updateData }, 
          startDate, 
          duration, 
          notes || '', 
          token, 
          scheduleSyncTraceId, 
          'update-job-schedule'
        );
      } catch (calErr) {
        console.error('GHL Calendar Sync failed during update-job-schedule:', calErr);
      }

      const historyRef = docRef.collection('history').doc();
      await historyRef.set({
        timestamp: new Date().toISOString(),
        action: 'SCHEDULE_UPDATED',
        performedBy: changedBy,
        details: `Schedule adjusted from ${prevStartDate} (${prevDuration} days) to ${startDate} (${duration} days). Reason: ${reason}. Notes: ${notes || 'None'}`
      });

      try {
        await syncCustomerToGhl({
          eventType: 'job_schedule_updated',
          estimate: { 
            id: estimateId, 
            ...estimateData, 
            ...updateData,
            scheduleChangeReason: reason,
            scheduleChangeNotes: notes
          },
          status: estimateData.jobStatus,
          scheduleDate: startDate
        });
      } catch (err) {
        console.error('GHL Sync failed during reschedule:', err);
      }

      // Notify office if changed by crew
      if (!isAdmin) {
        try {
          const host = req.headers.host || 'ais-dev-fofnlg6ga7ou55bw54gntq-35743419833.us-east5.run.app';
          const portalUrl = `https://${host}/?portal=job-portal&estimateId=${estimateId}&token=${token}`;
          const adminUrl = `https://${host}/admin/estimates?id=${estimateId}`;
          
          await sendAppEmail({
            to: 'bradens@lonestarfenceworks.com',
            subject: `[SCHEDULE CHANGE] ${estimateData.customerName} - ${estimateData.jobStatus || 'Job'}`,
            text: `Install schedule changed for ${estimateData.customerName}. New start: ${startDate} (${duration}). Reason: ${reason}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #eee; padding: 20px;">
                <h2 style="color: #E63946;">Install Schedule Changed</h2>
                <p>The crew has updated the install schedule for <strong>${estimateData.customerName}</strong>.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666; width: 140px;"><strong>Customer:</strong></td>
                    <td style="padding: 8px 0;">${estimateData.customerName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;"><strong>Address:</strong></td>
                    <td style="padding: 8px 0;">${estimateData.customerAddress || estimateData.address || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;"><strong>Crew:</strong></td>
                    <td style="padding: 8px 0;">${estimateData.assignedCrew || 'N/A'}</td>
                  </tr>
                  <tr><td colspan="2"><hr style="border: 0; border-top: 1px solid #eee; margin: 10px 0;" /></td></tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;"><strong>Old Schedule:</strong></td>
                    <td style="padding: 8px 0;">${prevStartDate} (${prevDuration})</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;"><strong>New Schedule:</strong></td>
                    <td style="padding: 8px 0;">${startDate} (${duration})</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;"><strong>Reason:</strong></td>
                    <td style="padding: 8px 0;">${reason}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;"><strong>Notes:</strong></td>
                    <td style="padding: 8px 0;">${notes || 'None'}</td>
                  </tr>
                </table>
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                  <a href="${portalUrl}" style="background: #E63946; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; margin-right: 10px;">View Job Portal</a>
                  <a href="${adminUrl}" style="background: #111A2E; color: white; padding: 12px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Admin View</a>
                </div>
              </div>
            `,
            estimateData,
            estimateId
          });
        } catch (emailErr) {
          console.error('Failed to notify office of schedule change:', emailErr);
        }
      }

      return res.json({ success: true });
    }

    if (action === 'crew-confirm-install') {
      const estimateId = req.query?.estimateId || req.body?.estimateId;
      const token = req.query?.token || req.body?.token;
      const notes = (req.body?.notes || '').trim();

      if (!estimateId) {
        return res.status(400).json({ error: 'Estimate ID is required.' });
      }
      if (!token) {
        return res.status(400).json({ error: 'Security token is required.' });
      }

      const { docRef, snap } = await getEstimateDocRef(estimateId);
      if (!snap.exists) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const estimateData = snap.data() || {};
      if (!estimateData.crewScheduleAccessEnabled) {
        return res.status(403).json({ error: 'Crew scheduling access is disabled.' });
      }
      if (estimateData.crewScheduleToken !== token) {
        return res.status(403).json({ error: 'Invalid security token.' });
      }

      const preferredDate = estimateData.preferredInstallDate || estimateData.scheduledStartDate || '';
      if (!preferredDate) {
        return res.status(400).json({ error: 'No preferred installation date found on this estimate to confirm.' });
      }

      const nowIso = new Date().toISOString();
      const crewEmail = estimateData.crewEmailRecipient || 'Subcontractor Crew';

      const historyEntry = {
        action: 'Crew confirmed',
        source: 'Crew Portal',
        actor: 'Crew',
        oldValue: 'Pending Crew Confirmation',
        newValue: 'Scheduled',
        notes: `Crew confirmed preferred date: ${preferredDate}.${notes ? ' Crew Notes: ' + notes : ''}`,
        timestamp: nowIso
      };

      const updates: any = {
        installStatus: 'Scheduled',
        jobStatus: 'Scheduled',
        confirmedInstallDate: preferredDate,
        crewConfirmedAt: nowIso,
        crewConfirmedBy: crewEmail,
        crewConfirmationNotes: notes,
        crewScheduleRequestPending: false,
        updatedAt: nowIso
      };

      // Add to scheduleHistory
      updates.scheduleHistory = admin.firestore.FieldValue.arrayUnion(historyEntry);

      await docRef.update(updates);

      // Sync to GHL Calendar
      await syncEstimateToGhlCalendar(estimateId, estimateData, preferredDate, estimateData.installDuration || 1, notes, token);

      // Create/Update schedule_event reflecting confirmed status
      const eventId = estimateData.ghlCalendarEventId || `install-${estimateId}`;
      const startD = new Date(preferredDate);
      const endD = new Date(preferredDate);
      const duration = Number(estimateData.installDuration || 1);
      endD.setDate(endD.getDate() + duration);

      const eventPayload = {
        id: eventId,
        estimateId: estimateId,
        title: `Install - ${estimateData.customerName || 'Customer'} - ${estimateData.customerAddress || estimateData.address || ''}`,
        start: preferredDate,
        end: endD.toISOString().split('T')[0],
        allDay: true,
        type: 'installation',
        eventType: 'install',
        status: 'Scheduled',
        appointmentStatus: 'Confirmed',
        userId: estimateData.userId || 'braden-lonestar-uid',
        notes: `Schedule confirmed via Crew Portal. Notes: ${notes}`
      };

      await db.collection('schedule_events').doc(eventId).set(eventPayload, { merge: true });

      // Load company settings for replyTo and matching rules
      const settingsSnap = await db.collection('companySettings').doc('braden-lonestar-uid').get();
      const activeSettings = settingsSnap.exists ? settingsSnap.data() : {};

      const adminEmail = activeSettings?.replyToEmail || 'bradens@lonestarfenceworks.com';
      const customerEmail = estimateData.customerEmail || estimateData.email || '';
      const customerNameVal = estimateData.customerName || 'Valued Client';
      const eNo = estimateData.estimateNumber || '';

      // NOTIFY CUSTOMER (Only after crew confirmation, custom message)
      if (customerEmail) {
        const customerSubject = `Installation Confirmed - Lone Star Fence Works`;
        const customerHtml = `
          <div style="font-family: sans-serif; max-width: 650px; margin: 0 auto; color: #1a202c; line-height: 1.6;">
            <div style="background-color: #0c1a30; color: #ffffff; padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
              <h2 style="margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px;">Lone Star Fence Works</h2>
              <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9;">Installation Confirmed</p>
            </div>
            <div style="padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; background-color: #ffffff; font-size: 15px;">
              <p>Dear ${customerNameVal},</p>
              <p>Your installation has been confirmed for <strong>${new Date(preferredDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>.</p>
              <p>Our professional crew is scheduled to begin installation on this date. If weather or unforeseen circumstances require a change, we will contact you as soon as possible.</p>
              <p>Thank you for choosing Lone Star Fence Works. We look forward to delivering your premium new fence!</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="font-size: 13px; color: #718096; text-align: center; margin-bottom: 0;">
                If you have any questions or need to reach our office, reply directly to this email or call us at ${activeSettings?.companyPhone || 'our office'}.
              </p>
            </div>
          </div>
        `;

        await sendAppEmail({
          to: customerEmail,
          subject: customerSubject,
          html: customerHtml,
          text: `Your installation has been confirmed for ${preferredDate}. If weather or unforeseen circumstances require a change, we will contact you as soon as possible. Thank you for choosing Lone Star Fence Works.`,
          category: 'customer_install_confirmed',
          estimateId: estimateId,
          customSettingsData: activeSettings
        }).catch((err) => {
          console.error('[CREW CONFIRM] Failed to send email notification to customer:', err);
        });
      }

      // NOTIFY ADMIN
      const adminSubject = `[Admin Alert] Crew Confirmed Install for Est #${eNo}`;
      const adminHtml = `
        <div style="font-family: sans-serif; padding: 20px;">
          <h3>Crew Confirmation Received</h3>
          <p>Subcontractor Crew <strong>${crewEmail}</strong> has confirmed the scheduled installation date for <strong>Est #${eNo}</strong> (${customerNameVal}).</p>
          <ul>
            <li><strong>Confirmed Install Date:</strong> ${preferredDate}</li>
            <li><strong>Duration:</strong> ${duration} day(s)</li>
            <li><strong>Crew Notes:</strong> ${notes || 'None'}</li>
          </ul>
          <p>CRM and Calendar states have automatically transitioned to Scheduled.</p>
        </div>
      `;

      await sendAppEmail({
        to: adminEmail,
        subject: adminSubject,
        html: adminHtml,
        text: `Crew ${crewEmail} has confirmed installation for Est #${eNo} on ${preferredDate}.`,
        category: 'admin_notification_crew_confirmed',
        estimateId: estimateId,
        customSettingsData: activeSettings
      }).catch((err) => {
        console.error('[CREW CONFIRM] Failed to send admin alert email:', err);
      });

      // NOTIFY GHL (Add tag and update pipeline stage)
      try {
        const fullEstimateSnap = await docRef.get();
        const fullEstimateData = { id: estimateId, ...fullEstimateSnap.data() };
        await syncCustomerToGhl({
          eventType: 'job_scheduled',
          estimate: fullEstimateData,
          scheduleDate: preferredDate
        });
        console.info(`[CREW CONFIRM] Successfully triggered GHL GHL sync and Opportunity status update.`);
      } catch (ghlErr) {
        console.error('[CREW CONFIRM] GHL CRM sync failed during crew confirmation:', ghlErr);
      }

      return res.status(200).json({
        success: true,
        message: 'Installation schedule confirmed and published successfully.',
        confirmedInstallDate: preferredDate
      });
    }

    if (action === 'crew-request-alternative-date') {
      const estimateId = req.query?.estimateId || req.body?.estimateId;
      const token = req.query?.token || req.body?.token;
      const { requestedStartDate, duration, notes } = req.body || {};

      if (!estimateId) {
        return res.status(400).json({ error: 'Estimate ID is required.' });
      }
      if (!token) {
        return res.status(400).json({ error: 'Security token is required.' });
      }
      if (!requestedStartDate) {
        return res.status(400).json({ error: 'Proposed alternative date is required.' });
      }

      const { docRef, snap } = await getEstimateDocRef(estimateId);
      if (!snap.exists) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const estimateData = snap.data() || {};
      if (!estimateData.crewScheduleAccessEnabled) {
        return res.status(403).json({ error: 'Crew scheduling access is disabled.' });
      }
      if (estimateData.crewScheduleToken !== token) {
        return res.status(403).json({ error: 'Invalid security token.' });
      }

      const nowIso = new Date().toISOString();
      const crewEmail = estimateData.crewEmailRecipient || 'Subcontractor Crew';

      const historyEntry = {
        action: 'Crew requested different date',
        source: 'Crew Portal',
        actor: 'Crew',
        oldValue: estimateData.preferredInstallDate || 'Unscheduled',
        newValue: requestedStartDate,
        notes: `Crew requested alternative date: ${requestedStartDate} for ${duration || 1} day(s). Crew Notes: ${notes}`,
        timestamp: nowIso
      };

      const BlackoutD = new Date(requestedStartDate);
      const endD = new Date(requestedStartDate);
      endD.setDate(endD.getDate() + Number(duration || 1));

      const updatesByCrew = {
        crewScheduleRequestPending: true,
        crewRequestedStartDate: requestedStartDate,
        crewRequestedDuration: Number(duration || 1),
        crewAlternativeNotes: notes,
        crewScheduleRequestedAt: nowIso,
        updatedAt: nowIso,
        installStatus: 'Pending Crew Confirmation',
        jobStatus: 'Pending Crew Confirmation'
      };

      // Sync to GHL Calendar
      await syncEstimateToGhlCalendar(estimateId, estimateData, requestedStartDate, duration || 1, notes, token);

      // Wait, we add schedule_event representing alternative proposal
      const eventId = estimateData.ghlCalendarEventId || `install-${estimateId}`;

      const eventPayload = {
        id: eventId,
        estimateId: estimateId,
        title: `[CREW PROPOSED] Install - ${estimateData.customerName || 'Customer'}`,
        start: requestedStartDate,
        end: endD.toISOString().split('T')[0],
        allDay: true,
        type: 'installation',
        eventType: 'install',
        status: 'Pending Crew Confirmation',
        appointmentStatus: 'Pending',
        userId: estimateData.userId || 'braden-lonestar-uid',
        notes: `Crew proposed alternative date: ${requestedStartDate}. Notes: ${notes}`
      };

      await db.collection('schedule_events').doc(eventId).set(eventPayload, { merge: true });

      // Add to scheduleHistory
      await docRef.update({
        ...updatesByCrew,
        scheduleHistory: admin.firestore.FieldValue.arrayUnion(historyEntry)
      });

      // Notify Admin ONLY
      const settingsSnap = await db.collection('companySettings').doc('braden-lonestar-uid').get();
      const activeSettings = settingsSnap.exists ? settingsSnap.data() : {};
      const adminEmail = activeSettings?.replyToEmail || 'bradens@lonestarfenceworks.com';
      const customerNameVal = estimateData.customerName || 'Valued Client';
      const eNo = estimateData.estimateNumber || '';

      const adminSubject = `[Admin Alert] Crew Requested Alternate Date for Est #${eNo}`;
      const adminHtml = `
        <div style="font-family: sans-serif; padding: 20px;">
          <h3>Alternate Date Proposal from Crew</h3>
          <p>Subcontractor Crew <strong>${crewEmail}</strong> has requested a different install date for <strong>Est #${eNo}</strong> (${customerNameVal}).</p>
          <p>No automatic notification has been sent to the customer yet. Please review the proposal and update GHL or contact the crew to confirm.</p>
          <ul>
            <li><strong>Originally Proposed:</strong> ${estimateData.preferredInstallDate || 'Unscheduled'}</li>
            <li><strong>Crew Requested Date:</strong> ${requestedStartDate}</li>
            <li><strong>Crew Requested Duration:</strong> ${duration || 1} day(s)</li>
            <li><strong>Crew Notes:</strong> ${notes || 'None'}</li>
          </ul>
        </div>
      `;

      await sendAppEmail({
        to: adminEmail,
        subject: adminSubject,
        html: adminHtml,
        text: `Crew requested alternative date ${requestedStartDate} for Est #${eNo}.`,
        category: 'admin_notification_crew_requested_alt',
        estimateId: estimateId,
        customSettingsData: activeSettings
      }).catch((err) => {
        console.error('[CREW PROPOSED] Failed to send admin alert email:', err);
      });

      return res.status(200).json({
        success: true,
        message: 'Proposed date successfully submitted to admin.',
        requestedStartDate,
        requestedDuration: duration
      });
    }

    // PUBLIC CUSTOMER PORTAL GUEST ENDPOINTS: Bypass authentication completely!
    if (action === 'get-public-estimate') {
      const estimateId = req.query?.estimateId || req.body?.estimateId;
      const versionId = req.query?.versionId || req.body?.versionId || '';
      if (!estimateId) {
        return res.status(400).json({ error: 'Estimate ID is required.' });
      }

      const docRef = db.collection('estimates').doc(String(estimateId));
      let snap = await docRef.get();

      let estimateData: any = null;
      if (snap.exists) {
        estimateData = { id: snap.id, ...snap.data() };
      } else {
        // Look up nested
        const usersSnap = await db.collection('users').get();
        for (const uDoc of usersSnap.docs) {
          const nestedRef = db.collection('users').doc(uDoc.id).collection('estimates').doc(String(estimateId));
          const nestedSnap = await nestedRef.get();
          if (nestedSnap.exists) {
            estimateData = { id: nestedSnap.id, ...nestedSnap.data() };
            break;
          }
        }
      }

      if (!estimateData) {
        return res.status(404).json({ error: 'Estimate not found in database.' });
      }

      // Check if specific version history is requested and apply snapshot
      if (versionId && estimateData.contractVersions) {
        const matchedVersion = (estimateData.contractVersions || []).find((v: any) => v.versionId === versionId);
        if (matchedVersion) {
          estimateData = {
            ...estimateData,
            ...matchedVersion.estimateSnapshot,
            contractSnapshot: matchedVersion.contractSnapshot,
            // Status and decision belong specifically to this version
            customerDecision: matchedVersion.customerDecision || 'pending',
            customerSignature: matchedVersion.customerSignature || null,
            customerDecisionDate: matchedVersion.customerSignedAt || null,
            customerSignedDate: matchedVersion.customerSignedAt || null,
            customerDeclineReason: matchedVersion.customerDeclineReason || null,
            drawingUrl: matchedVersion.drawingUrl || null,
            drawingFilename: matchedVersion.drawingFilename || null,
            drawingVersion: matchedVersion.drawingVersion || null,
            // Expose version details to client portal
            contractVersion: matchedVersion.version,
            versionSentDate: matchedVersion.createdAt,
            versionStatus: matchedVersion.status
          };
        }
      }

      const ownerUid = estimateData.userId || estimateData.uid || estimateData.ownerId;
      let companyConfig: any = null;
      if (ownerUid) {
        try {
          const settingsSnap = await db.collection('companySettings').doc(ownerUid).get();
          if (settingsSnap.exists) {
            const data = settingsSnap.data() || {};
            // Security: Strip out critical SMTP credentials before returning to public client portal
            companyConfig = {
              companyName: data.companyName || '',
              companyEmail: data.companyEmail || '',
              companyPhone: data.companyPhone || '',
              companyWebsite: data.companyWebsite || '',
              companyLogo: data.companyLogo || '',
              googleReviewLink: data.googleReviewLink || '',
              estimateAcceptedMessage: data.estimateAcceptedMessage || '',
              estimateDeclinedMessage: data.estimateDeclinedMessage || ''
            };
          }
        } catch (settingsErr) {
          console.warn('Skipped reading company settings for public portal:', settingsErr);
        }
      }

      return res.status(200).json({
        success: true,
        estimate: {
          ...estimateData,
          settings: companyConfig
        },
        contractSnapshot: estimateData.contractSnapshot || null
      });
    }

    if (action === 'view-public-estimate') {
      const estimateId = req.query?.estimateId || req.body?.estimateId;
      if (!estimateId) {
        return res.status(400).json({ error: 'Estimate ID is required.' });
      }

      let targetRef = db.collection('estimates').doc(String(estimateId));
      let snap = await targetRef.get();

      if (!snap.exists) {
        const usersSnap = await db.collection('users').get();
        for (const uDoc of usersSnap.docs) {
          const nestedRef = db.collection('users').doc(uDoc.id).collection('estimates').doc(String(estimateId));
          const nestedSnap = await nestedRef.get();
          if (nestedSnap.exists) {
            targetRef = nestedRef;
            snap = nestedSnap;
            break;
          }
        }
      }

      if (!snap.exists) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const docData = snap.data() || {};
      const now = new Date().toISOString();
      const updates: any = {
        customerOpenedAt: docData.customerOpenedAt || now,
        customerViewedAt: now,
        customerOpenedIp: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString().split(',')[0].trim(),
        viewCount: (docData.viewCount || 0) + 1
      };

      await targetRef.update(updates);
      return res.status(200).json({ success: true, tracking: updates });
    }

    if (action === 'get-labor-snapshot') {
      const estimateId = req.query?.estimateId || req.body?.estimateId;
      const token = req.query?.token || req.body?.token;
      if (!estimateId) {
        return res.status(400).json({ error: 'Estimate ID is required.' });
      }

      const { docRef, snap } = await getEstimateDocRef(estimateId);
      if (!snap.exists) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const estimateData = snap.data() || {};

      // Secure token verification: accepts laborSnapshotToken or crewScheduleToken or version ID check
      const isValidToken = token && (
        token === estimateData.laborSnapshotToken || 
        token === estimateData.crewScheduleToken ||
        (Array.isArray(estimateData.laborContractVersions) && estimateData.laborContractVersions.some((v: any) => v.versionId === token))
      );

      if (!isValidToken) {
        return res.status(403).json({ error: 'Unauthorized: Invalid secure access token.' });
      }

      const snapshot = estimateData.laborContractSnapshot || null;

      const ownerUid = estimateData.userId || estimateData.uid || estimateData.ownerId;
      let companyConfig: any = null;
      if (ownerUid) {
        try {
          const settingsSnap = await db.collection('companySettings').doc(ownerUid).get();
          if (settingsSnap.exists) {
            const data = settingsSnap.data() || {};
            companyConfig = {
              companyName: data.companyName || '',
              companyEmail: data.companyEmail || '',
              companyPhone: data.companyPhone || '',
              companyLogo: data.companyLogo || '',
              companyWebsite: data.companyWebsite || '',
            };
          }
        } catch (err) {
          console.warn('Failed to fetch companySettings:', err);
        }
      }

      return res.status(200).json({
        success: true,
        estimate: {
          id: snap.id,
          ...estimateData,
        },
        snapshot,
        settings: companyConfig
      });
    }

    if (action === 'view-labor-snapshot') {
      const estimateId = req.body?.estimateId || req.query?.estimateId;
      const token = req.body?.token || req.query?.token;
      if (!estimateId) {
        return res.status(400).json({ error: 'Estimate ID is required' });
      }

      const { docRef, snap } = await getEstimateDocRef(estimateId);
      if (snap.exists) {
        const data = snap.data() || {};
        const isValidToken = token && (
          token === data.laborSnapshotToken || 
          token === data.crewScheduleToken ||
          (Array.isArray(data.laborContractVersions) && data.laborContractVersions.some((v: any) => v.versionId === token))
        );

        if (isValidToken) {
          const log = data.laborContractEmailLog || [];
          let updated = false;
          const updatedLog = log.map((entry: any) => {
            if (entry.status === 'Sent' || !entry.opened) {
              updated = true;
              return { ...entry, opened: true, status: 'Opened' };
            }
            return entry;
          });

          if (updated) {
            await docRef.update({ laborContractEmailLog: updatedLog });
            console.log(`[VIEW LABOR SNAPSHOT] Marked labor snapshot log as Opened.`);
          }
        }
      }
      return res.status(200).json({ success: true });
    }

    if (action === 'decision-public-estimate') {
      const estimateId = req.query?.estimateId || req.body?.estimateId;
      const { decision, signature, declineReason, customerEmail, customerName } = req.body || {};

      if (!estimateId) {
        return res.status(400).json({ error: 'Estimate ID is required.' });
      }
      if (!decision || !['accepted', 'declined'].includes(decision)) {
        return res.status(400).json({ error: 'Invalid decision parameter. Must be "accepted" or "declined".' });
      }

      let targetRef = db.collection('estimates').doc(String(estimateId));
      let snap = await targetRef.get();

      if (!snap.exists) {
        const usersSnap = await db.collection('users').get();
        for (const uDoc of usersSnap.docs) {
          const nestedRef = db.collection('users').doc(uDoc.id).collection('estimates').doc(String(estimateId));
          const nestedSnap = await nestedRef.get();
          if (nestedSnap.exists) {
            targetRef = nestedRef;
            snap = nestedSnap;
            break;
          }
        }
      }

      if (!snap.exists) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const data = snap.data() || {};
      const versionIdParam = req.query?.versionId || req.body?.versionId || '';

      let originalPreviousDecision = 'pending';
      if (versionIdParam && data.contractVersions) {
        const mv = data.contractVersions.find((v: any) => v.versionId === versionIdParam);
        if (mv) {
          originalPreviousDecision = mv.customerDecision || 'pending';
        }
      } else {
        originalPreviousDecision = data.customerDecision || 'pending';
      }
      
      let resolvedContractVersion = data.latestContractVersion || 1;
      let targetVersionFound = false;

      const now = new Date().toISOString();
      const updates: any = {
        updatedAt: now
      };

      if (versionIdParam && data.contractVersions) {
        const contractVersions = [...(data.contractVersions || [])];
        const vIdx = contractVersions.findIndex((v: any) => v.versionId === versionIdParam);
        if (vIdx !== -1) {
          targetVersionFound = true;
          const vObj = { ...contractVersions[vIdx] };
          const previousDecision = vObj.customerDecision || 'pending';
          
          vObj.customerDecision = decision;
          vObj.status = decision === 'accepted' ? 'Accepted' : 'Declined';
          
          if (decision === 'accepted') {
            vObj.customerSignature = signature || 'Digitally Signed';
            vObj.customerSignedAt = now;
            vObj.acceptedAt = now;
            vObj.declinedAt = null;
            vObj.customerDeclineReason = null;
            vObj.currentAccepted = true;
          } else {
            vObj.declinedAt = now;
            vObj.customerDeclineReason = declineReason || '';
            vObj.currentAccepted = false;
          }

          if (previousDecision !== decision) {
            const historyEntry = {
              previousDecision,
              newDecision: decision,
              changedAt: now,
              customerName: customerName || data.customerName || 'Customer',
              customerSignature: decision === 'accepted' ? (signature || 'Digitally Signed') : (vObj.customerSignature || null),
              declineReason: decision === 'declined' ? (declineReason || 'Not specified') : null,
              source: "customer_portal"
            };
            vObj.decisionHistory = [...(vObj.decisionHistory || []), historyEntry];
          }

          contractVersions[vIdx] = vObj;
          updates.contractVersions = contractVersions;
          resolvedContractVersion = vObj.version || 1;

          if (data.latestContractVersionId === versionIdParam) {
            updates.customerDecision = decision;
            updates.customerDecisionDate = now;
            updates.latestContractStatus = vObj.status;
            updates.customerEmailSigned = customerEmail || '';
            
            if (decision === 'accepted') {
              updates.customerSignature = signature || 'Digitally Signed';
              updates.customerSignedDate = now;
              updates.acceptedAt = now;
              updates.declinedAt = null;
              updates.customerDeclineReason = null;
              updates.jobStatus = 'Accepted';
            } else {
              updates.declinedAt = now;
              updates.customerDeclineReason = declineReason || '';
              updates.jobStatus = 'Declined';
              if (vObj.customerSignature) {
                updates.customerSignature = vObj.customerSignature;
              }
            }
          }
        }
      }

      if (!targetVersionFound) {
        updates.customerDecision = decision;
        updates.customerDecisionDate = now;
        updates.customerEmailSigned = customerEmail || '';

        if (decision === 'accepted') {
          updates.customerSignature = signature || 'Digitally Signed';
          updates.customerSignedDate = now;
          updates.acceptedAt = now;
          updates.declinedAt = null;
          updates.customerDeclineReason = null;
          updates.jobStatus = 'Accepted';
        } else {
          updates.customerDeclineReason = declineReason || 'Not specified';
          updates.declinedAt = now;
          updates.jobStatus = 'Declined';
          if (data.customerSignature) {
            updates.customerSignature = data.customerSignature;
          }
        }
      }

      // Calculate previous label and log transition
      const getStatusLabelComp = (docData: any) => {
        if (docData.status === 'archived') return 'Archived';
        if (docData.jobStatus === 'Completed') return 'Completed';
        if (docData.jobStatus === 'Declined') return 'Declined';
        if (docData.jobStatus === 'Accepted' || docData.jobStatus === 'Approved') return 'Accepted';
        if (docData.jobStatus === 'Estimate Sent') {
          if (!docData.customerEmailSent && !docData.customerEmailSentAt) {
            return 'Draft';
          }
          return 'Estimate Sent';
        }
        return 'Draft';
      };

      const previousLabel = getStatusLabelComp(data);
      const newLabel = decision === 'accepted' ? 'Accepted' : 'Declined';

      if (previousLabel !== newLabel) {
        const historyEntry = {
          from: previousLabel,
          to: newLabel,
          changedAt: now,
          changedBy: customerEmail || data.customerEmail || 'Customer',
          source: 'customer_portal'
        };
        updates.statusHistory = [...(data.statusHistory || []), historyEntry];
      }
      const ownerUid = data.userId || data.uid || data.ownerId;

      let customAcceptedMessage = 'Estimate accepted successfully! We will finalize your installation timeframe shortly.';
      let customDeclinedMessage = 'Estimate declined. We will reach out to understand your feedback. Thank you!';
      let webhookUrl = '';

      if (ownerUid) {
        try {
          const settingsSnap = await db.collection('companySettings').doc(ownerUid).get();
          if (settingsSnap.exists) {
            const settingsData = settingsSnap.data() || {};
            webhookUrl = settingsData.gohighlevelWebhookUrl || settingsData.ghlWebhookUrl || '';
            if (settingsData.estimateAcceptedMessage) {
              customAcceptedMessage = settingsData.estimateAcceptedMessage;
            }
            if (settingsData.estimateDeclinedMessage) {
              customDeclinedMessage = settingsData.estimateDeclinedMessage;
            }
          }
        } catch (settingsError) {
          console.warn('Could not load companySettings for webhooks/templates:', settingsError);
        }
      }

      updates.customMessage = decision === 'accepted' ? customAcceptedMessage : customDeclinedMessage;

      // Dispatch webhook asynchronously
      if (webhookUrl) {
        try {
          const webhookPayload = {
            event: `estimate_${decision}`,
            estimateId,
            estimateNumber: data.estimateNumber || '',
            decision,
            customerName: data.customerName || '',
            customerEmail: data.customerEmail || customerEmail || '',
            totalCost: data.totalCost || data.manualGrandTotal || 0,
            signature: signature || '',
            declineReason: declineReason || '',
            timestamp: now,
            versionId: versionIdParam || data.latestContractVersionId || '',
            contractVersion: resolvedContractVersion || data.latestContractVersion || 1
          };
          fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(webhookPayload)
          }).then(response => {
            console.log(`Outbound SaaS webhook trigger response: status ${response.status}`);
          }).catch(webhookErr => {
            console.error(`Dynamic Webhook dispatch failed:`, webhookErr);
          });
        } catch (webhookOuterError) {
          console.error(`Webhook trigger parse error:`, webhookOuterError);
        }
      }

      // Determine what webhooks to trigger based on originalPreviousDecision
      const shouldTriggerDeclined = (decision === 'declined' && (originalPreviousDecision === 'pending' || originalPreviousDecision === 'accepted'));
      const shouldTriggerAccepted = (decision === 'accepted' && (originalPreviousDecision === 'pending' || originalPreviousDecision === 'declined'));

      let lastGhlWebhookEvent = '';
      let webhookSentStatus = false;
      let logEntryToSave: any = null;

      // Prepare estimate link
      const matchedContractVersionObj = data.contractVersions?.find((v: any) => v.versionId === (versionIdParam || data.latestContractVersionId));
      const finalEstimateLink = matchedContractVersionObj?.estimateLink || `https://fence-estimator-eight.vercel.app/?portal=contract&estimateId=${estimateId}&versionId=${versionIdParam || data.latestContractVersionId || ''}`;

      if (shouldTriggerDeclined) {
        // Send estimate_declined webhook
        const eventPayload = {
          customerName: data.customerName || '',
          firstName: data.firstName || (data.customerName ? data.customerName.split(' ')[0] : ''),
          lastName: data.lastName || (data.customerName ? data.customerName.split(' ').slice(1).join(' ') : ''),
          email: customerEmail || data.customerEmail || data.email || '',
          phone: data.customerPhone || data.phone || '',
          estimatedPrice: String(data.totalCost || data.manualGrandTotal || 0),
          estimateNumber: data.estimateNumber || '',
          declineReason: declineReason || 'Not specified',
          versionId: versionIdParam || data.latestContractVersionId || '',
          declinedAt: now,
          estimateLink: finalEstimateLink
        };

        try {
          const result = await sendGhlWorkflowWebhook('estimate_declined', eventPayload, null, db, String(estimateId));
          lastGhlWebhookEvent = 'estimate_declined';
          webhookSentStatus = result.success;

          // Build log doc
          logEntryToSave = {
            timestamp: now,
            payloadPreview: {
              eventType: 'estimate_declined',
              customerDecision: 'declined',
              jobStatus: 'Declined',
              estimateId,
              versionId: eventPayload.versionId,
              estimateNumber: eventPayload.estimateNumber,
              customerName: eventPayload.customerName,
              firstName: eventPayload.firstName,
              lastName: eventPayload.lastName,
              email: eventPayload.email,
              phone: eventPayload.phone,
              estimatedPrice: eventPayload.estimatedPrice,
              declineReason: eventPayload.declineReason,
              declinedAt: eventPayload.declinedAt,
              estimateLink: eventPayload.estimateLink
            },
            status: result.status || (result.success ? 200 : 500),
            success: result.success,
            response: result.success ? (result.error || 'Successfully dispatched') : null,
            error: result.success ? null : (result.error || 'Webhook returned non-OK status')
          };
        } catch (webhookErr: any) {
          console.error('Failed to trigger declined webhook:', webhookErr);
          lastGhlWebhookEvent = 'estimate_declined';
          webhookSentStatus = false;
          logEntryToSave = {
            timestamp: now,
            payloadPreview: eventPayload,
            status: 500,
            success: false,
            response: null,
            error: webhookErr.message || 'Error occurred during fetch dispatch'
          };
        }

        // Dispatch admin billing/contract notification
        try {
          const sSnap = await db.collection('companySettings').doc('braden-lonestar-uid').get();
          const sData = sSnap.exists ? sSnap.data() || {} : {};
          const adminEmail = sData.adminNotificationEmail || 'bradens@lonestarfenceworks.com';

          const mailSubject = `[LSFW Contract Declined] - ${data.customerName || 'Customer'}`;
          const mailHtml = `
            <h3>Contract Declined Notice</h3>
            <p>An estimate contract has been declined by the customer.</p>
            <ul>
              <li><strong>Customer Name:</strong> ${data.customerName || 'N/A'}</li>
              <li><strong>Customer Email:</strong> ${customerEmail || data.customerEmail || 'N/A'}</li>
              <li><strong>Description:</strong> ${data.estimateNumber ? `Estimate #${data.estimateNumber}` : ''}</li>
              <li><strong>Decline Reason:</strong> ${declineReason || 'Not specified'}</li>
              <li><strong>Time:</strong> ${now}</li>
            </ul>
            <p><a href="${finalEstimateLink}">View Estimate Contract Details</a></p>
          `;
          const mailText = `Contract Declined Notice\n\nCustomer: ${data.customerName || 'N/A'}\nEmail: ${customerEmail || data.customerEmail || 'N/A'}\nDecline Reason: ${declineReason || 'Not specified'}\nTime: ${now}\nLink: ${finalEstimateLink}`;

          await sendAppEmail({
            to: adminEmail,
            subject: mailSubject,
            html: mailHtml,
            text: mailText,
            category: 'estimate_declined_admin_notice',
            estimateId,
            customerId: data.customerId || '',
            estimateData: data
          });
        } catch (mailNoticeErr) {
          console.error("Failed to send admin decline notification email:", mailNoticeErr);
        }
      } else if (shouldTriggerAccepted) {
        // Send estimate_accepted webhook
        const eventPayload = {
          customerName: data.customerName || '',
          firstName: data.firstName || (data.customerName ? data.customerName.split(' ')[0] : ''),
          lastName: data.lastName || (data.customerName ? data.customerName.split(' ').slice(1).join(' ') : ''),
          email: customerEmail || data.customerEmail || data.email || '',
          phone: data.customerPhone || data.phone || '',
          estimatedPrice: Number(data.totalCost || data.manualGrandTotal || 0),
          estimateNumber: data.estimateNumber || '',
          customerSignature: signature || 'Digitally Signed',
          customerSignedDate: now,
          acceptedAt: now,
          versionId: versionIdParam || data.latestContractVersionId || '',
          contractVersion: resolvedContractVersion || data.latestContractVersion || 1,
          estimateLink: finalEstimateLink
        };

        try {
          await sendGhlWorkflowWebhook('estimate_accepted', eventPayload, null, db, String(estimateId));
        } catch (webhookErr) {
          console.error('Failed to trigger accepted webhook:', webhookErr);
        }

        // Dispatch admin billing/contract notification
        try {
          const sSnap = await db.collection('companySettings').doc('braden-lonestar-uid').get();
          const sData = sSnap.exists ? sSnap.data() || {} : {};
          const adminEmail = sData.adminNotificationEmail || 'bradens@lonestarfenceworks.com';

          const mailSubject = `[LSFW Contract Accepted] - ${data.customerName || 'Customer'}`;
          const mailHtml = `
            <h3>Contract Accepted Notice</h3>
            <p>An estimate contract has been accepted and digitally signed by the customer.</p>
            <ul>
              <li><strong>Customer Name:</strong> ${data.customerName || 'N/A'}</li>
              <li><strong>Customer Email:</strong> ${customerEmail || data.customerEmail || 'N/A'}</li>
              <li><strong>Description:</strong> ${data.estimateNumber ? `Estimate #${data.estimateNumber}` : ''}</li>
              <li><strong>Signature Name:</strong> ${signature || 'Digitally Signed'}</li>
              <li><strong>Total Price:</strong> ${(data.totalCost || data.manualGrandTotal || 0).toLocaleString()}</li>
              <li><strong>Time:</strong> ${now}</li>
            </ul>
            <p><a href="${finalEstimateLink}">View Signed Estimate Contract Details</a></p>
          `;
          const mailText = `Contract Accepted Notice\n\nCustomer: ${data.customerName || 'N/A'}\nEmail: ${customerEmail || data.customerEmail || 'N/A'}\nSignature: ${signature || 'Digitally Signed'}\nTotal Price: ${data.totalCost || data.manualGrandTotal || 0}\nTime: ${now}\nLink: ${finalEstimateLink}`;

          await sendAppEmail({
            to: adminEmail,
            subject: mailSubject,
            html: mailHtml,
            text: mailText,
            category: 'estimate_accepted_admin_notice',
            estimateId,
            customerId: data.customerId || '',
            estimateData: data
          });
        } catch (mailNoticeErr) {
          console.error("Failed to send admin accept notification email:", mailNoticeErr);
        }
      }

      // Add Firestore logging fields if logEntryToSave is present
      if (logEntryToSave) {
        updates.lastGhlWebhookEvent = lastGhlWebhookEvent;
        updates.lastGhlWebhookSentAt = now;
        updates.declinedWebhookSent = webhookSentStatus;
        
        const existingDeclinedWebhookLog = data.declinedWebhookLog || [];
        updates.declinedWebhookLog = [...existingDeclinedWebhookLog, logEntryToSave];

        // Also update matching contract version in contractVersions within updates
        if (updates.contractVersions) {
          const cVers = [...updates.contractVersions];
          const cvIdx = cVers.findIndex((v: any) => v.versionId === versionIdParam);
          if (cvIdx !== -1) {
            const upVObj = { ...cVers[cvIdx] };
            upVObj.declinedWebhookSent = webhookSentStatus;
            const existingCVDeclinedLog = upVObj.declinedWebhookLog || [];
            upVObj.declinedWebhookLog = [...existingCVDeclinedLog, logEntryToSave];
            cVers[cvIdx] = upVObj;
            updates.contractVersions = cVers;
          }
        } else if (versionIdParam && data.contractVersions) {
          // If contractVersions is not in updates, read, update, and write
          const cVers = [...data.contractVersions];
          const cvIdx = cVers.findIndex((v: any) => v.versionId === versionIdParam);
          if (cvIdx !== -1) {
            const upVObj = { ...cVers[cvIdx] };
            upVObj.declinedWebhookSent = webhookSentStatus;
            const existingCVDeclinedLog = upVObj.declinedWebhookLog || [];
            upVObj.declinedWebhookLog = [...existingCVDeclinedLog, logEntryToSave];
            cVers[cvIdx] = upVObj;
            updates.contractVersions = cVers;
          }
        }
      }

      await targetRef.update(updates);
      console.log(`Estimate ${estimateId} public decision recorded:`, updates);
      return res.status(200).json({ success: true, decision: updates, debugBuild: "local-ghl-helper-no-import-v1" });
    }

    if (action === 'customer-estimator-submit') {
      const payload = req.body || {};
      const {
        id,
        firstName,
        lastName,
        customerName,
        email,
        phone,
        address,
        city,
        state,
        zip,
        fenceType,
        fenceHeight,
        linearFeet,
        measuredLinearFeet,
        measurementMethod,
        gateCount,
        gateSummary,
        selectedOptions,
        estimatedPrice,
        createdAt,
        rawEstimateDoc
      } = payload;

      if (!email || !firstName || !lastName) {
        return res.status(400).json({ error: 'Missing required customer details (email, firstName, lastName)' });
      }

      // Extract optional selected customer details if available from payload
      let customerId = payload.customerId || '';
      let ghlContactId = payload.ghlContactId || '';

      const normalizedEmail = (email || '').trim().toLowerCase();
      const cleanPhone = (phone || '').replace(/\D/g, '');
      const normalizedPhone = cleanPhone.length === 10 ? `+1${cleanPhone}` : (cleanPhone.length === 11 && cleanPhone.startsWith('1') ? `+${cleanPhone}` : (cleanPhone ? `+${cleanPhone}` : ''));

      const nowIso = new Date().toISOString();

      // If no customerId is provided but customer exists under email/phone, find and link it
      if (!customerId && normalizedEmail) {
        try {
          const emailSnap = await db.collection('customers').where('normalizedEmail', '==', normalizedEmail).get();
          if (!emailSnap.empty) {
            const customerDoc = emailSnap.docs[0];
            customerId = customerDoc.id;
            ghlContactId = customerDoc.data().ghlContactId || ghlContactId || '';
          } else if (normalizedPhone) {
            const phoneSnap = await db.collection('customers').where('normalizedPhone', '==', normalizedPhone).get();
            if (!phoneSnap.empty) {
              const customerDoc = phoneSnap.docs[0];
              customerId = customerDoc.id;
              ghlContactId = customerDoc.data().ghlContactId || ghlContactId || '';
            }
          }
        } catch (findErr) {
          console.warn('Failed to find matching customer pre-save:', findErr);
        }
      }

      // If still no customerId, we should create a new customer record
      let isBrandNewCustomer = false;
      if (!customerId) {
        isBrandNewCustomer = true;
        try {
          const newCustomerRef = db.collection('customers').doc();
          customerId = newCustomerRef.id;
          await newCustomerRef.set({
            id: customerId,
            ghlContactId: ghlContactId || '',
            firstName: firstName,
            lastName: lastName,
            customerName: customerName || `${firstName} ${lastName}`.trim(),
            email: email,
            normalizedEmail,
            phone: phone,
            normalizedPhone,
            streetAddress: address,
            address: address,
            city: city || '',
            state: state || '',
            zip: zip || '',
            source: 'Customer Estimator',
            createdFrom: 'customer_estimator',
            createdAt: nowIso,
            lastSyncedAt: nowIso
          });
        } catch (createCustErr) {
          console.warn('Failed to create customer for customer estimator submission:', createCustErr);
        }
      } else {
        // If customer exists, update their synced info or merge
        try {
          const customerRef = db.collection('customers').doc(customerId);
          const currentCustSnap = await customerRef.get();
          if (currentCustSnap.exists) {
            const currentCustData = currentCustSnap.data() || {};
            await customerRef.set({
              ghlContactId: ghlContactId || currentCustData.ghlContactId || '',
              firstName: firstName || currentCustData.firstName || '',
              lastName: lastName || currentCustData.lastName || '',
              customerName: customerName || currentCustData.customerName || `${firstName} ${lastName}`.trim(),
              email: email || currentCustData.email || '',
              normalizedEmail: normalizedEmail || currentCustData.normalizedEmail || '',
              phone: phone || currentCustData.phone || '',
              normalizedPhone: normalizedPhone || currentCustData.normalizedPhone || '',
              streetAddress: address || currentCustData.streetAddress || currentCustData.address || '',
              address: address || currentCustData.address || currentCustData.streetAddress || '',
              city: city || currentCustData.city || '',
              state: state || currentCustData.state || '',
              zip: zip || currentCustData.zip || '',
              lastSyncedAt: nowIso
            }, { merge: true });
          }
        } catch (updateCustErr) {
          console.warn('Failed to update customer for customer estimator submission:', updateCustErr);
        }
      }

      const estId = id || `est-cust-${Math.random().toString(36).substring(2, 11)}`;

      // Construct a standardized estimate lead document for Firestore
      const estimateDocToSave = {
        ...(rawEstimateDoc || {}),
        id: estId,
        customerId: customerId, // Real customer document ID linking in `/customers`
        ghlContactId: ghlContactId || '', // GHL Contact ID integration fields
        firstName: firstName,
        lastName: lastName,
        customerName: customerName || `${firstName} ${lastName}`.trim(),
        customerEmail: email,
        email: email,
        customerPhone: phone,
        phone: phone,
        customerAddress: address,
        address: address,
        customerCity: city || '',
        city: city || '',
        customerState: state || '',
        state: state || '',
        customerZip: zip || '',
        zip: zip || '',
        fenceType: fenceType || '',
        height: fenceHeight || rawEstimateDoc?.height || '',
        fenceHeight: fenceHeight || rawEstimateDoc?.height || '',
        linearFeet: Number(linearFeet || 0),
        measuredLinearFeet: measuredLinearFeet !== undefined && measuredLinearFeet !== null ? Number(measuredLinearFeet) : null,
        measurementMethod: measurementMethod || 'manual',
        gateCount: Number(gateCount || 0),
        gateSummary: gateSummary || '',
        selectedOptions: selectedOptions || '',
        total: Number(estimatedPrice || 0),
        estimatedPrice: Number(estimatedPrice || 0),
        isCustomerEstimate: true,
        leadSource: "Customer Estimator",
        jobStatus: "Interested",
        status: "active",
        companyId: "lonestarfence",
        uid: "braden-lonestar-uid",
        userId: "braden-lonestar-uid",
        createdAt: createdAt || nowIso,
        lastModified: nowIso
      };

      // 1. SAVE TO FIRESTORE (Required: If this fails, block email and webhook)
      let docRef = db.collection('estimates').doc(String(estId));
      try {
        await docRef.set(estimateDocToSave);
      } catch (dbError: any) {
        console.error('Failed to save customer estimator lead in firestore:', dbError);
        return res.status(500).json({ error: `Save failed: ${dbError.message}` });
      }

      // 2. RESOLVE SMTP & WEBHOOK SETTINGS
      let resolvedSmtpHost = process.env.SMTP_HOST || 'mail.b.hostedemail.com';
      let resolvedSmtpPort = Number(process.env.SMTP_PORT) || 465;
      let resolvedSmtpSecureType = 'SSL/TLS';
      let resolvedSmtpUser = process.env.SMTP_USER;
      let resolvedSmtpPass = process.env.SMTP_PASS;
      let resolvedFromName = 'Lone Star Fence Works';
      let resolvedFromEmail = process.env.FROM_EMAIL || resolvedSmtpUser || 'BradenS@LoneStarFenceWorks.com';
      let resolvedReplyToEmail = resolvedFromEmail;
      let resolvedCompanyLogo = '';
      let resolvedCompanyPhone = '';
      let resolvedCompanyWebsite = '';
      let ghlWebhookUrl = '';
      let companySettingsData: any = {};

      try {
        const settingsSnap = await db.collection('companySettings').doc('braden-lonestar-uid').get();
        if (settingsSnap.exists) {
          const s = settingsSnap.data() || {};
          companySettingsData = s;
          if (s.smtpHost) resolvedSmtpHost = s.smtpHost;
          if (s.smtpPort) resolvedSmtpPort = Number(s.smtpPort);
          if (s.smtpSecureType) resolvedSmtpSecureType = s.smtpSecureType;
          if (s.smtpUsername) resolvedSmtpUser = s.smtpUsername;
          if (s.smtpPassword) resolvedSmtpPass = s.smtpPassword;
          if (s.fromName) resolvedFromName = s.fromName;
          if (s.fromEmail) resolvedFromEmail = s.fromEmail;
          resolvedReplyToEmail = s.replyToEmail || resolvedFromEmail;
          resolvedCompanyLogo = s.companyLogo || '';
          resolvedCompanyPhone = s.companyPhone || '';
          resolvedCompanyWebsite = s.companyWebsite || '';

          // Resolve webhook config
          ghlWebhookUrl = s.ghlWebhookInstantEstimateSubmitted || s.gohighlevelWebhookUrl || s.ghlWebhookUrl || '';
        }
      } catch (settingsErr) {
        console.warn('Could not load companySettings for customer-submit action:', settingsErr);
      }

      // 3. SEND EMAIL
      let emailSent = false;
      let emailSentAt: string | null = null;
      let emailLog = 'Ready to send';

        try {
          let bookingUrl = 'https://lonestarfenceworks.com/contact';
          if (resolvedCompanyWebsite) {
            let cleanWeb = resolvedCompanyWebsite.trim();
            if (!/^https?:\/\//i.test(cleanWeb)) {
              cleanWeb = 'https://' + cleanWeb;
            }
            bookingUrl = cleanWeb.endsWith('/') ? `${cleanWeb}schedule` : `${cleanWeb}/schedule`;
          }

          const emailFirstName = firstName || 'Not Provided';
          const emailLastName = lastName || 'Not Provided';
          const emailAddress = address || 'Not Provided';
          const emailCity = city || 'Not Provided';
          const emailState = state || 'Not Provided';
          const emailZip = zip || 'Not Provided';
          const emailFenceType = fenceType || 'Not Provided';
          const rawHeight = fenceHeight || rawEstimateDoc?.height || '';
          const emailFenceHeight = rawHeight ? `${rawHeight} ft` : 'Not Provided';
          const emailLinearFeet = (linearFeet !== undefined && linearFeet !== null && linearFeet !== '') ? `${linearFeet} LF` : 'Not Provided';
          
          let emailGates = 'None';
          if (gateCount !== undefined && gateCount !== null) {
            if (Number(gateCount) > 0) {
              emailGates = gateSummary || `${gateCount} Gate(s)`;
            } else {
              emailGates = 'None';
            }
          }

          const emailSelectedOptions = (selectedOptions && selectedOptions !== 'None' && selectedOptions !== '') ? selectedOptions : 'Not Provided';
          const formattedTotal = (estimatedPrice !== undefined && estimatedPrice !== null && estimatedPrice !== '') ? Number(estimatedPrice).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : 'Not Provided';

          let logoHtml = '';
          if (resolvedCompanyLogo) {
            logoHtml = `<img src="${resolvedCompanyLogo}" alt="${resolvedFromName}" style="max-height: 70px; max-width: 250px; width: auto !important; height: auto !important; display: block; margin: 0 auto 12px auto;" />`;
          }

          let contactPhoneHtml = '';
          if (resolvedCompanyPhone) {
            contactPhoneHtml = `Phone: ${resolvedCompanyPhone}<br/>`;
          }

          let contactEmailHtml = '';
          if (resolvedReplyToEmail) {
            contactEmailHtml = `Email: ${resolvedReplyToEmail}<br/>`;
          }

          let contactWebHtml = '';
          if (resolvedCompanyWebsite) {
            contactWebHtml = `<a href="${resolvedCompanyWebsite}" style="color: #3182ce; text-decoration: none;">${resolvedCompanyWebsite}</a>`;
          }

          const currentYear = new Date().getFullYear();

          const emailHtml = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <div style="background-color: #0c1a30; padding: 24px; text-align: center; border-bottom: 4px solid #b91c1c;">
                  ${logoHtml}
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">Your Instant Fence Estimate</h1>
                </div>
                <div style="padding: 32px 24px; background-color: #ffffff;">
                  <p style="color: #4a5568; line-height: 1.6; font-size: 15px;">
                    Hello <strong>${emailFirstName} ${emailLastName}</strong>,
                  </p>
                  <p style="color: #4a5568; line-height: 1.6; font-size: 15px;">
                    Thank you for requesting an instant estimate from <strong>${resolvedFromName}</strong>. Below is a summary of your estimated layout and budget parameters based on the options you selected:
                  </p>
                  
                  <div style="background-color: #f7fafc; border-radius: 8px; padding: 20px; border: 1px solid #edf2f7; margin: 24px 0;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #4a5568;">
                      <tr>
                        <td style="padding: 8px 0; font-weight: bold; border-bottom: 1px solid #edf2f7;">Estimated Total:</td>
                        <td style="padding: 8px 0; font-weight: bold; color: #10b981; text-align: right; border-bottom: 1px solid #edf2f7; font-size: 18px;">${formattedTotal}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7;">Fence Type:</td>
                        <td style="padding: 8px 0; text-align: right; border-bottom: 1px solid #edf2f7;">${emailFenceType}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7;">Fence Height:</td>
                        <td style="padding: 8px 0; text-align: right; border-bottom: 1px solid #edf2f7;">${emailFenceHeight}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7;">Fence Length:</td>
                        <td style="padding: 8px 0; text-align: right; border-bottom: 1px solid #edf2f7;">${emailLinearFeet}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7;">Gates / Options:</td>
                        <td style="padding: 8px 0; text-align: right; border-bottom: 1px solid #edf2f7;">${emailGates}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #edf2f7;">Selected Options:</td>
                        <td style="padding: 8px 0; text-align: right; border-bottom: 1px solid #edf2f7;">${emailSelectedOptions}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">Project Address:</td>
                        <td style="padding: 8px 0; text-align: right; color: #718096; max-width: 250px; white-space: normal; word-break: break-all;">${emailAddress}</td>
                      </tr>
                    </table>
                  </div>

                  <p style="color: #4a5568; font-size: 13px; line-height: 1.6; background-color: #fffbeb; border-left: 4px solid #ef4444; padding: 12px; margin: 24px 0 32px 0;">
                    <strong>Please Note:</strong> This is a dynamic automated budget estimate for reference purposes. The final contract pricing may vary following an in-person site inspection to confirm soil status, topology, property stakes, and exact final layout measurements.
                  </p>

                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${bookingUrl}" style="background-color: #0c1a30; color: #ffffff; text-decoration: none; padding: 14px 28px; font-weight: bold; font-size: 14px; border-radius: 6px; text-transform: uppercase; letter-spacing: 1px; display: inline-block; border-bottom: 3px solid #b91c1c;">
                      Schedule On-Site Consultation
                    </a>
                  </div>

                  <p style="color: #4a5568; margin-top: 32px; font-size: 14px; border-top: 1px solid #edf2f7; padding-top: 16px;">
                    Best regards,<br/>
                    <strong>${resolvedFromName}</strong><br/>
                    ${contactPhoneHtml}
                    ${contactEmailHtml}
                    ${contactWebHtml}
                  </p>
                </div>
                <div style="background-color: #f7fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #edf2f7;">
                  <p style="color: #a0aec0; font-size: 11px; margin: 0;">
                    Lone Star Fence Works &copy; ${currentYear}. All rights reserved.
                  </p>
                </div>
              </div>
          `;

          // Requirement 7: Add console logging before sending so the rendered email data can be inspected.
          console.log('[CUSTOMER_ESTIMATOR_EMAIL_RENDER] email:', email);
          console.log('[CUSTOMER_ESTIMATOR_EMAIL_RENDER] emailFirstName:', emailFirstName);
          console.log('[CUSTOMER_ESTIMATOR_EMAIL_RENDER] emailLastName:', emailLastName);
          console.log('[CUSTOMER_ESTIMATOR_EMAIL_RENDER] formattedTotal:', formattedTotal);
          console.log('[CUSTOMER_ESTIMATOR_EMAIL_RENDER] emailFenceType:', emailFenceType);
          console.log('[CUSTOMER_ESTIMATOR_EMAIL_RENDER] emailFenceHeight:', emailFenceHeight);
          console.log('[CUSTOMER_ESTIMATOR_EMAIL_RENDER] emailLinearFeet:', emailLinearFeet);
          console.log('[CUSTOMER_ESTIMATOR_EMAIL_RENDER] emailGates:', emailGates);
          console.log('[CUSTOMER_ESTIMATOR_EMAIL_RENDER] emailSelectedOptions:', emailSelectedOptions);
          console.log('[CUSTOMER_ESTIMATOR_EMAIL_RENDER] emailAddress:', emailAddress);
          console.log('[CUSTOMER_ESTIMATOR_EMAIL_RENDER] bookingUrl:', bookingUrl);

          // Requirement 6: Verify the final email body contains no instances of ${...}, {{...}}, undefined, null.
          let sanitizedHtml = emailHtml;

          // Replace literal dynamic variables with actual customer or estimate details
          const replacements: Record<string, string | number> = {
            firstName: emailFirstName,
            lastName: emailLastName,
            customerName: (emailFirstName !== 'Not Provided' || emailLastName !== 'Not Provided') ? `${emailFirstName} ${emailLastName}`.trim() : 'Not Provided',
            formattedTotal: formattedTotal,
            estimatedPrice: formattedTotal,
            total: formattedTotal,
            fenceType: emailFenceType,
            linearFeet: emailLinearFeet,
            address: emailAddress,
            city: emailCity,
            state: emailState,
            zip: emailZip,
            selectedOptions: emailSelectedOptions,
            fenceHeight: emailFenceHeight,
            height: emailFenceHeight,
            gateSummary: emailGates,
            gates: emailGates
          };

          for (const [key, val] of Object.entries(replacements)) {
            const resolvedVal = (val === undefined || val === null || val === 'undefined' || val === 'null' || val === '') ? 'Not Provided' : String(val);
            const regexDollar = new RegExp(`\\$\\{${key}\\}`, 'gi');
            const regexCurly = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
            sanitizedHtml = sanitizedHtml.replace(regexDollar, resolvedVal);
            sanitizedHtml = sanitizedHtml.replace(regexCurly, resolvedVal);
          }

          // Fallback purging to wipe any remaining unresolved templates
          sanitizedHtml = sanitizedHtml.replace(/\$\{.*?\}/g, 'Not Provided');
          sanitizedHtml = sanitizedHtml.replace(/\{\{.*?\}\}/g, 'Not Provided');

          // Guarantee absolutely no undefined/null literal text slip-ups
          sanitizedHtml = sanitizedHtml.replaceAll('undefined', 'Not Provided');
          sanitizedHtml = sanitizedHtml.replaceAll('null', 'Not Provided');

          const sendRes = await sendAppEmail({
            to: email,
            subject: 'Your Lone Star Fence Works Instant Fence Estimate',
            html: sanitizedHtml,
            text: sanitizedHtml.replace(/<[^>]*>/g, ''),
            category: 'customer_estimator_results',
            estimateId: String(estId),
            customerId: String(customerId || ''),
            estimateData: { id: estId, ...estimateDocToSave }
          });

          emailSent = true;
          emailSentAt = new Date().toISOString();
          emailLog = `Email sent successfully via ${sendRes.provider || 'Resend/SMTP'}`;
        } catch (mErr: any) {
          console.error('Customer Estimator mail send failed:', mErr);
          emailLog = `Mail send failed: ${mErr.message || mErr}`;
        }

      // 4. TRIGGER GHL WEBHOOK
      let webhookTriggered = false;
      let webhookTriggeredAt: string | null = null;
      let webhookLog = 'Ready to trigger';
      let webhookSuppressed = false;
      let suppressionReason: string | null = null;

      // RESOLVE CUSTOMER & ESTIMATE DOCUMENTS FOR SUPPRESSION DECISION ENGINE
      let existingCustDoc: any = null;
      try {
        if (customerId) {
          const s = await db.collection('customers').doc(String(customerId)).get();
          if (s.exists) existingCustDoc = s.data();
        }
        if (!existingCustDoc && ghlContactId) {
          const snap = await db.collection('customers').where('ghlContactId', '==', String(ghlContactId)).get();
          if (!snap.empty) existingCustDoc = snap.docs[0].data();
        }
        if (!existingCustDoc && normalizedEmail) {
          const snap = await db.collection('customers').where('normalizedEmail', '==', normalizedEmail).get();
          if (!snap.empty) existingCustDoc = snap.docs[0].data();
        }
        if (!existingCustDoc && normalizedPhone) {
          const snap = await db.collection('customers').where('normalizedPhone', '==', normalizedPhone).get();
          if (!snap.empty) existingCustDoc = snap.docs[0].data();
        }
      } catch (custLookupErr) {
        console.warn('Error during customer lookup for suppression:', custLookupErr);
      }

      let existingEstDoc: any = null;
      try {
        if (estId) {
          const s = await db.collection('estimates').doc(String(estId)).get();
          if (s.exists) existingEstDoc = s.data();
        }
        if (!existingEstDoc && customerId) {
          const snap = await db.collection('estimates').where('customerId', '==', String(customerId)).orderBy('createdAt', 'desc').limit(1).get();
          if (!snap.empty) existingEstDoc = snap.docs[0].data();
        }
        if (!existingEstDoc && ghlContactId) {
          const snap = await db.collection('estimates').where('ghlContactId', '==', String(ghlContactId)).orderBy('createdAt', 'desc').limit(1).get();
          if (!snap.empty) existingEstDoc = snap.docs[0].data();
        }
        if (!existingEstDoc && normalizedEmail) {
          const snap = await db.collection('estimates').where('customerEmail', '==', email).orderBy('createdAt', 'desc').limit(1).get();
          if (!snap.empty) existingEstDoc = snap.docs[0].data();
        }
        if (!existingEstDoc && normalizedPhone) {
          const snap = await db.collection('estimates').where('customerPhone', '==', phone).orderBy('createdAt', 'desc').limit(1).get();
          if (!snap.empty) existingEstDoc = snap.docs[0].data();
        }
      } catch (estLookupErr) {
        console.warn('Error during estimate lookup for suppression:', estLookupErr);
      }

      const forceTrigger = payload.forceTrigger === true || payload.forceTrigger === 'true';
      const decision = shouldTriggerCustomerEstimatorWorkflow(existingCustDoc, existingEstDoc, companySettingsData, forceTrigger);

      if (!decision.trigger) {
        webhookSuppressed = true;
        suppressionReason = decision.reason;
        webhookLog = `Suppressed by CRM automation decision engine: ${decision.reason}`;
        console.log(`CRM Automation suppressing customer estimator webhook for estimate ${estId}: ${decision.reason}`);
      }

      if (ghlWebhookUrl && !webhookSuppressed) {
        try {
          const ghlPayload = {
            userId: 'braden-lonestar-uid',
            leadSource: 'Customer Estimator',
            customerName: customerName || `${firstName} ${lastName}`.trim(),
            firstName: firstName || '',
            lastName: lastName || '',
            email: email || '',
            phone: phone || '',
            address: address || '',
            city: city || '',
            state: state || '',
            zip: zip || '',
            fenceType: fenceType || '',
            fenceHeight: fenceHeight || '',
            linearFeet: Number(linearFeet || 0),
            measuredLinearFeet: measuredLinearFeet !== undefined && measuredLinearFeet !== null ? Number(measuredLinearFeet) : null,
            measurementMethod: measurementMethod || 'manual',
            gateCount: Number(gateCount || 0),
            gateSummary: gateSummary || '',
            selectedOptions: selectedOptions || '',
            estimatedPrice: Number(estimatedPrice || 0),
            jobStatus: 'Interested',
            estimateId: estId,
            createdAt: createdAt || nowIso
          };

          const result = await sendGhlWorkflowWebhook('customer_estimator_submitted', ghlPayload, companySettingsData, db, estId);
          if (result.success) {
            webhookTriggered = true;
            webhookTriggeredAt = new Date().toISOString();
            webhookLog = `Successfully triggered webhook url: ${result.url || 'Configured Webhook'}`;
          } else {
            webhookLog = `GHL Webhook failed: ${result.error || 'Unknown error'}`;
          }
        } catch (gErr: any) {
          console.error('Customer Estimator GHL Webhook trigger failed:', gErr);
          webhookLog = `Webhook trigger failed: ${gErr.message || gErr}`;
        }
      } else if (!ghlWebhookUrl) {
        webhookLog = 'Skipped: GHL webhook URL not configured in settings.';
      }

      // 5. UPDATE FIRESTORE WITH METADATA / LOG ENTRY (email/webhook success or failure)
      try {
        const snapToRead = await docRef.get();
        const currentData = snapToRead.data() || {};
        const logs = currentData.ghlWebhookLog || [];
        const logEntry = webhookSuppressed ? {
          eventType: "customer_estimator_submitted",
          timestamp: new Date().toISOString(),
          webhookUrl: ghlWebhookUrl ? ghlWebhookUrl.replace(/^(https?:\/\/[^\/]+).*$/, '$1/... ') : 'None',
          success: true,
          webhookSuppressed: true,
          suppressionReason: suppressionReason
        } : {
          eventType: "customer_estimator_submitted",
          timestamp: new Date().toISOString(),
          webhookUrl: ghlWebhookUrl ? ghlWebhookUrl.replace(/^(https?:\/\/[^\/]+).*$/, '$1/... ') : 'None',
          success: webhookTriggered,
          error: webhookTriggered ? null : webhookLog
        };
        await docRef.update({
          customerEstimatorEmailSent: emailSent,
          customerEstimatorEmailSentAt: emailSentAt,
          customerEstimatorEmailLog: emailLog,
          ghlWebhookTriggered: webhookTriggered,
          ghlWebhookTriggeredAt: webhookTriggeredAt,
          ghlWebhookLog: [...logs, logEntry],
          webhookSuppressed,
          suppressionReason
        });
      } catch (logErr) {
        console.warn('Failed to update logs inside the output estimate document:', logErr);
      }

      // Trigger dynamic GHL API sync for newly created customer or submitted estimator
      try {
        if (isBrandNewCustomer) {
          await syncCustomerToGhl({
            eventType: 'customer_created',
            estimate: { id: estId, ...estimateDocToSave },
            status: 'Interested',
            source: 'customer_portal'
          });
        }
        await syncCustomerToGhl({
          eventType: 'customer_estimator_submitted',
          estimate: { id: estId, ...estimateDocToSave },
          status: 'Interested',
          source: 'customer_portal'
        });
      } catch (ghlSyncErr) {
        console.error('Failed to run GHL API Sync for estimator submitted:', ghlSyncErr);
      }

      return res.status(200).json({
        success: true,
        id: estId,
        emailSent,
        emailLog,
        webhookTriggered,
        webhookLog,
        webhookSuppressed,
        suppressionReason,
        message: 'Your instant estimate has been submitted. We sent a copy of your estimate results to your email. Lone Star Fence Works will follow up soon.'
      });
    }

    // --- AUTHENTICATION CHECK ---
    const authHeader = req.headers.authorization;
    let decoded: any = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err: any) {
        console.warn('JWT verification failed in estimates write:', err.message);
      }
    }

    // Public customer submissions have no token — scope them to Braden's UID automatically
    if (!decoded || !decoded.uid) {
      decoded = { uid: 'braden-lonestar-uid', isAdmin: false };
    }

    const decodedEmail = decoded.email?.toLowerCase();
    const isWriteAdmin = decoded.isAdmin || 
                         decoded.uid === 'braden-lonestar-uid' || 
                         decodedEmail === 'bradens@lonestarfenceworks.com' || 
                         decodedEmail === 'usmc6123@gmail.com';

    // --- IMMEDIATE SCHEDULER TRACE CREATION FOR ALL SCHEDULER ACTIONS ---
    if (action && action !== 'write-scheduler-trace' && [
      'reschedule-job', 
      'create-schedule-event', 
      'update-schedule-event', 
      'delete-schedule-event', 
      'schedule-job-start', 
      'admin-update-schedule', 
      'resync-ghl-calendar'
    ].includes(action)) {
      try {
        const traceId = req.body?.scheduleSyncTraceId || req.query?.scheduleSyncTraceId || ("trace-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9));
        if (req.body) {
          req.body.scheduleSyncTraceId = traceId;
        }

        let estimateId = req.body?.estimateId || req.query?.estimateId || '';
        const eventId = req.body?.id || req.query?.id || req.body?.eventId || '';
        
        if (!estimateId && eventId) {
          if (String(eventId).startsWith('install-')) {
            estimateId = String(eventId).replace('install-', '');
          } else if (String(eventId).startsWith('estimate-')) {
            const parts = String(eventId).split('-');
            if (parts[1]) estimateId = parts[1];
          }
        }

        let customerName = 'N/A';
        let estimateData: any = null;
        if (estimateId) {
          try {
            const { snap } = await getEstimateDocRef(estimateId);
            if (snap.exists) {
              estimateData = snap.data();
              customerName = estimateData.customerName || 'N/A';
            }
          } catch (err) {
            console.warn('Failed to load estimate for initial trace log:', err);
          }
        }

        const nowIso = new Date().toISOString();
        const initialSteps = [
          {
            step: 'STEP_1',
            label: 'User clicked Save Schedule',
            status: 'success' as const,
            installStartDate: req.body?.startDate || req.body?.start || req.body?.scheduledStartDate || nowIso.split('T')[0],
            installDays: req.body?.duration || req.body?.scheduledDuration || 1,
            crew: req.body?.assignedCrew || req.body?.crew || estimateData?.assignedCrew || 'N/A',
            timestamp: nowIso
          },
          {
            step: 'STEP_2',
            label: 'Frontend created request payload',
            status: 'success' as const,
            payload: req.body || {},
            timestamp: nowIso
          },
          {
            step: 'STEP_3',
            label: 'POST /api/estimates/write',
            status: 'success' as const,
            endpoint: '/api/estimates/write',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            payload: req.body || {},
            timestamp: nowIso
          },
          {
            step: 'STEP_4',
            label: 'Backend router entered',
            status: 'success' as const,
            actionMatched: action,
            handler: 'estimates/write handler',
            timestamp: nowIso
          }
        ];

        // Determine if GHL sync will be called for this action
        // Now including create-schedule-event if estimateId is present
        const willCallGhlHelper = (
          action === 'reschedule-job' || 
          action === 'schedule-job-start' || 
          ((action === 'update-schedule-event' || action === 'create-schedule-event') && estimateId)
        );
        
        const traceStatus = willCallGhlHelper ? 'running' : 'skipped';
        const traceError = willCallGhlHelper ? '' : 'Job Scheduler saved schedule but did not call GHL sync helper.';
        const actionReason = action === 'delete-schedule-event' ? 'Delete action requested, GHL sync skipped.' : traceError;

        if (!willCallGhlHelper) {
          initialSteps.push({
            step: 'shared_helper_called',
            label: 'Shared GHL Helper Called',
            status: 'skipped' as any,
            reason: actionReason,
            timestamp: nowIso
          } as any);
        }

        await logGhlActivity({
          traceId,
          estimateId,
          customerName,
          source: 'Job Scheduler',
          action,
          status: traceStatus as any,
          error: actionReason,
          steps: initialSteps as any[]
        });
      } catch (err) {
        console.error('Error in immediate scheduler trace creation:', err);
      }
    }

    // Determine the actual action (using standard method or a simulated one such as action params)
    const method = req.method;

    // GET Handler
    if (method === 'GET') {
      const action = req.query.action || (req.body && req.body.action);
      if (action === 'list-schedule-events') {
        const eventsList: any[] = [];
        const snap = await db.collection('schedule_events').get();
        snap.forEach(doc => {
          eventsList.push({ id: doc.id, ...doc.data() });
        });
        
        const filtered = eventsList.filter(e => 
          e.userId === decoded.uid || 
          decoded.uid === 'braden-lonestar-uid'
        );
        return res.status(200).json(filtered);
      }
      if (action === 'debug-smtp-logs') {
        const settingsList: any[] = [];
        try {
          const settingsSnap = await db.collection('companySettings').get();
          settingsSnap.forEach(doc => {
            const data = doc.data();
            settingsList.push({
              id: doc.id,
              smtpHost: data.smtpHost,
              smtpPort: data.smtpPort,
              smtpSecureType: data.smtpSecureType,
              smtpUsername: data.smtpUsername,
              fromEmail: data.fromEmail,
              fromName: data.fromName,
              hasPassword: !!data.smtpPassword,
              passwordLength: data.smtpPassword ? data.smtpPassword.length : 0,
              passwordPreview: data.smtpPassword ? `${data.smtpPassword.substring(0, 2)}...${data.smtpPassword.substring(Math.max(0, data.smtpPassword.length - 2))}` : ''
            });
          });
        } catch (err: any) {
          console.error('Failed to load companySettings in debug:', err);
        }

        const estimateLogsList: any[] = [];
        let allEstimatesCount = 0;
        let allUsersCount = 0;
        let allSettingsCount = 0;
        try {
          const estimatesSnap = await db.collection('estimates').get();
          allEstimatesCount = estimatesSnap.size;
          estimatesSnap.forEach(doc => {
            const data = doc.data();
            estimateLogsList.push({
              id: doc.id,
              customerName: data.customerName,
              customerEmail: data.customerEmail,
              customerEmailSent: data.customerEmailSent || null,
              customerSentAt: data.customerSentAt || null,
              customerEmailLog: data.customerEmailLog || null,
              keys: Object.keys(data)
            });
          });

          const usersSnap = await db.collection('users').get();
          allUsersCount = usersSnap.size;
          for (const userDoc of usersSnap.docs) {
            const nestedSnap = await db.collection('users').doc(userDoc.id).collection('estimates').get();
            nestedSnap.forEach(doc => {
              const data = doc.data();
              estimateLogsList.push({
                id: doc.id,
                userId: userDoc.id,
                customerName: data.customerName,
                customerEmail: data.customerEmail,
                customerEmailSent: data.customerEmailSent || null,
                customerSentAt: data.customerSentAt || null,
                customerEmailLog: data.customerEmailLog || null,
                keys: Object.keys(data)
              });
            });
          }
        } catch (err: any) {
          console.error('Failed to load estimates inside debug:', err);
        }

        return res.status(200).json({
          success: true,
          settingsList,
          estimateLogsList,
          allEstimatesCount,
          allUsersCount,
          envVariables: {
            SMTP_HOST: process.env.SMTP_HOST || 'not set',
            SMTP_PORT: process.env.SMTP_PORT || 'not set',
            SMTP_USER: process.env.SMTP_USER || 'not set',
            FROM_EMAIL: process.env.FROM_EMAIL || 'not set',
            hasSmtpPass: !!process.env.SMTP_PASS
          }
        });
      }
      return res.status(400).json({ error: 'Unsupported action for GET method' });
    }

    // Standard Routing
    if (method === 'POST') {
      if (req.body && req.body.action === 'upload-drawing') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized: Admin or employee login required' });
        }
        
        const { estimateId, filename, mimeType, size, base64Data } = req.body || {};
        if (!estimateId || !filename || !mimeType || !base64Data) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }

        const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (!allowedMimeTypes.includes(mimeType)) {
          return res.status(400).json({ error: 'Invalid file format. Only PDF, JPG, PNG, WEBP are allowed.' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        
        if (snap.exists) {
          const existingData = snap.data() || {};
          if (
            existingData.uid !== decoded.uid &&
            existingData.userId !== decoded.uid &&
            !isWriteAdmin
          ) {
            return res.status(403).json({ error: 'Forbidden: You do not own this estimate record' });
          }
        }

        const timestamp = Date.now();
        const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `estimate-drawings/${estimateId}/${timestamp}-${sanitizedFilename}`;

        const bucket = admin.storage().bucket('dazzling-card-485210-r8.firebasestorage.app');
        const file = bucket.file(storagePath);

        let cleanBase64 = base64Data;
        if (cleanBase64.includes(';base64,')) {
          cleanBase64 = cleanBase64.split(';base64,')[1];
        }
        const buffer = Buffer.from(cleanBase64, 'base64');

        await file.save(buffer, {
          metadata: {
            contentType: mimeType,
          }
        });

        let downloadUrl = '';
        try {
          await file.makePublic();
          downloadUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
        } catch (pubErr: any) {
          console.warn('makePublic failed during drawing upload, using signed url fallback:', pubErr?.message || pubErr);
        }

        if (!downloadUrl) {
          const expires = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;
          const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: expires
          });
          downloadUrl = signedUrl;
        }

        const drawingMetadata = {
          drawingUrl: downloadUrl,
          drawingFileName: filename,
          drawingMimeType: mimeType,
          drawingUploadedAt: new Date().toISOString(),
          drawingStoragePath: storagePath
        };

        if (snap.exists) {
          await docRef.set(drawingMetadata, { merge: true });
        } else {
          await docRef.set({
            ...drawingMetadata,
            uid: decoded.uid,
            userId: decoded.uid,
            companyId: 'lonestarfence',
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            status: 'active'
          });
        }

        return res.status(200).json(drawingMetadata);
      }

      if (req.body && req.body.action === 'upload-diagram') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized: Admin or employee login required' });
        }

        const { estimateId, filename, mimeType, size, base64Data, title, type, visibleToCrew } = req.body || {};
        if (!estimateId || !filename || !mimeType || !base64Data) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }

        const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (!allowedMimeTypes.includes(mimeType)) {
          return res.status(400).json({ error: 'Invalid file format. Only PDF, JPG, PNG, WEBP are allowed.' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (snap.exists) {
          const existingData = snap.data() || {};
          if (
            existingData.uid !== decoded.uid &&
            existingData.userId !== decoded.uid &&
            !isWriteAdmin
          ) {
            return res.status(403).json({ error: 'Forbidden: You do not own this estimate record' });
          }
        } else {
          return res.status(404).json({ error: 'Estimate not found' });
        }

        const timestamp = Date.now();
        const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `estimate-diagrams/${estimateId}/${timestamp}-${sanitizedFilename}`;

        const bucket = admin.storage().bucket('dazzling-card-485210-r8.firebasestorage.app');
        const file = bucket.file(storagePath);

        let cleanBase64 = base64Data;
        if (cleanBase64.includes(';base64,')) {
          cleanBase64 = cleanBase64.split(';base64,')[1];
        }
        const buffer = Buffer.from(cleanBase64, 'base64');

        await file.save(buffer, {
          metadata: {
            contentType: mimeType,
          }
        });

        let downloadUrl = '';
        try {
          await file.makePublic();
          downloadUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
        } catch (pubErr: any) {
          console.warn('makePublic failed during diagram upload, using signed url fallback:', pubErr?.message || pubErr);
        }

        if (!downloadUrl) {
          const expires = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;
          const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: expires
          });
          downloadUrl = signedUrl;
        }

        const diagramId = crypto.randomUUID();
        const isoNow = new Date().toISOString();
        const newDiagram = {
          diagramId,
          estimateId,
          jobPortalId: estimateId,
          title: title || filename,
          type: type || 'Other Diagram',
          fileUrl: downloadUrl,
          storagePath: storagePath,
          createdAt: isoNow,
          updatedAt: isoNow,
          createdBy: decoded.email || decoded.uid || 'Office',
          visibleToCrew: visibleToCrew !== undefined ? !!visibleToCrew : true
        };

        const logEntry = {
          id: crypto.randomUUID(),
          event: 'diagramAttachedToPortal',
          diagramTitle: newDiagram.title,
          diagramType: newDiagram.type,
          attachedAt: isoNow,
          user: decoded.email || decoded.uid || 'Office',
          timestamp: isoNow,
          notes: `Attached diagram "${newDiagram.title}" (${newDiagram.type}) to Job Portal.`
        };

        await docRef.update({
          diagrams: admin.firestore.FieldValue.arrayUnion(newDiagram),
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        return res.status(200).json({ success: true, diagram: newDiagram });
      }

      if (req.body && req.body.action === 'toggle-diagram-visibility') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized: Admin or employee login required' });
        }

        const { estimateId, diagramId, visibleToCrew } = req.body || {};
        if (!estimateId || !diagramId) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }

        const existingData = snap.data() || {};
        if (
          existingData.uid !== decoded.uid &&
          existingData.userId !== decoded.uid &&
          !isWriteAdmin
        ) {
          return res.status(403).json({ error: 'Forbidden: You do not own this estimate record' });
        }

        const diagrams = Array.isArray(existingData.diagrams) ? existingData.diagrams : [];
        const updatedDiagrams = diagrams.map((diag: any) => {
          if (diag.diagramId === diagramId) {
            return {
              ...diag,
              visibleToCrew: !!visibleToCrew,
              updatedAt: new Date().toISOString()
            };
          }
          return diag;
        });

        await docRef.update({
          diagrams: updatedDiagrams
        });

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'delete-diagram') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized: Admin or employee login required' });
        }

        const { estimateId, diagramId } = req.body || {};
        if (!estimateId || !diagramId) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }

        const existingData = snap.data() || {};
        if (
          existingData.uid !== decoded.uid &&
          existingData.userId !== decoded.uid &&
          !isWriteAdmin
        ) {
          return res.status(403).json({ error: 'Forbidden: You do not own this estimate record' });
        }

        const diagrams = Array.isArray(existingData.diagrams) ? existingData.diagrams : [];
        const diagramToDelete = diagrams.find((d: any) => d.diagramId === diagramId);

        if (diagramToDelete && diagramToDelete.storagePath) {
          try {
            const bucket = admin.storage().bucket('dazzling-card-485210-r8.firebasestorage.app');
            const file = bucket.file(diagramToDelete.storagePath);
            await file.delete();
          } catch (storageErr: any) {
            console.warn('Storage deletion failed, continuing database cleanup:', storageErr?.message || storageErr);
          }
        }

        const updatedDiagrams = diagrams.filter((diag: any) => diag.diagramId !== diagramId);

        await docRef.update({
          diagrams: updatedDiagrams
        });

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'remove-drawing') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized: Admin or employee login required' });
        }

        const { estimateId, drawingStoragePath } = req.body || {};
        if (!estimateId) {
          return res.status(400).json({ error: 'Missing estimateId parameter' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);

        if (snap.exists) {
          const existingData = snap.data() || {};
          if (
            existingData.uid !== decoded.uid &&
            existingData.userId !== decoded.uid &&
            !isWriteAdmin
          ) {
            return res.status(403).json({ error: 'Forbidden: You do not own this estimate record' });
          }
        }

        if (drawingStoragePath) {
          try {
            const bucket = admin.storage().bucket('dazzling-card-485210-r8.firebasestorage.app');
            const file = bucket.file(drawingStoragePath);
            await file.delete();
          } catch (storageErr: any) {
            console.warn('Could not delete original file from Firebase Storage using Admin SDK:', storageErr?.message || storageErr);
          }
        }

         if (snap.exists) {
          await docRef.set({
            drawingUrl: admin.firestore.FieldValue.delete(),
            drawingFileName: admin.firestore.FieldValue.delete(),
            drawingMimeType: admin.firestore.FieldValue.delete(),
            drawingUploadedAt: admin.firestore.FieldValue.delete(),
            drawingStoragePath: admin.firestore.FieldValue.delete()
          }, { merge: true });
        }

        return res.status(200).json({ success: true, message: 'Drawing successfully removed' });
      }

      if (req.body && req.body.action === 'upload-vendor-document') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized: Admin or employee login required' });
        }
        if (!isWriteAdmin) {
          return res.status(403).json({ error: 'Forbidden: Admin access required to upload vendor pickup documents.' });
        }

        const { 
          estimateId, 
          vendorName, 
          salesOrderNumber, 
          pickupLocation, 
          pickupDateTime, 
          orderDate,
          subtotal,
          tax,
          deliveryFee,
          otherFees,
          totalCost,
          paymentStatus,
          notes, 
          visibleToCrew, 
          filename, 
          mimeType, 
          base64Data,
          lineItems
        } = req.body || {};

        if (!estimateId || !vendorName || !salesOrderNumber || !filename || !mimeType || !base64Data) {
          return res.status(400).json({ error: 'Missing required parameters. estimateId, vendorName, salesOrderNumber, filename, mimeType, and base64Data are required.' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }
        const estimateData = snap.data() || {};

        const timestamp = Date.now();
        const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `vendor-documents/${estimateId}/${timestamp}-${sanitizedFilename}`;
        const bucket = admin.storage().bucket('dazzling-card-485210-r8.firebasestorage.app');
        const file = bucket.file(storagePath);
        
        let cleanBase64 = base64Data;
        if (cleanBase64.includes(';base64,')) {
          cleanBase64 = cleanBase64.split(';base64,')[1];
        }
        const buffer = Buffer.from(cleanBase64, 'base64');
        await file.save(buffer, { metadata: { contentType: mimeType } });

        let downloadUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
        try {
          await file.makePublic();
        } catch (pubErr) {
          const expires = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;
          const [signedUrl] = await file.getSignedUrl({ action: 'read', expires });
          downloadUrl = signedUrl;
        }

        const docId = crypto.randomUUID();
        const newDoc = {
          id: docId,
          vendorName,
          salesOrderNumber,
          pickupLocation: pickupLocation || '',
          pickupDateTime: pickupDateTime || '',
          orderDate: orderDate || pickupDateTime || new Date().toISOString().split('T')[0],
          subtotal: Number(subtotal) || 0,
          tax: Number(tax) || 0,
          deliveryFee: Number(deliveryFee) || 0,
          otherFees: Number(otherFees) || 0,
          totalCost: Number(totalCost) || 0,
          paymentStatus: paymentStatus || 'Unknown',
          notes: notes || '',
          visibleToCrew: true, // Default to true for simplified form
          fileUrl: downloadUrl,
          fileName: filename,
          storagePath,
          uploadedAt: new Date().toISOString(),
          uploadedBy: decoded.email || 'Office Admin',
          lineItems: Array.isArray(lineItems) ? lineItems : []
        };

        const logEntry = {
          id: crypto.randomUUID(),
          event: 'Vendor Document Uploaded',
          timestamp: new Date().toISOString(),
          user: decoded.email || 'Office Admin',
          notes: `Uploaded sales order document "${filename}" for vendor "${vendorName}". Sales Order: #${salesOrderNumber}.`
        };

        const existingDocs = Array.isArray(estimateData.vendorDocuments) ? estimateData.vendorDocuments : [];
        const updatedDocs = [...existingDocs, newDoc];

        await docRef.update({
          vendorDocuments: updatedDocs,
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        // Notify crew if job has already been dispatched
        const crewEmail = estimateData.laborContractEmailRecipient || estimateData.crewEmailRecipient;
        if (crewEmail && estimateData.jobPortalStatus && visibleToCrew) {
          try {
            const jobPortalLink = estimateData.laborSnapshotLink || `https://fence-estimator-eight.vercel.app/?portal=job-portal&estimateId=${estimateId}&token=${estimateData.laborSnapshotToken}`;
            const text = `A material pickup document has been added to the Job Portal for this job.\n\nCustomer:\n${estimateData.customerName || 'Client'}\n\nVendor:\n${vendorName}\n\nSales Order:\n#${salesOrderNumber}\n\nPickup Location:\n${pickupLocation || 'N/A'}\n\nOpen Job Portal:\n${jobPortalLink}`;
            const html = `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e5e5; border-radius: 12px; background-color: #ffffff;">
                <h2 style="color: #1d3557; border-bottom: 2px solid #e63946; padding-bottom: 10px; margin-top: 0;">Material Pickup Document Added</h2>
                <p>A new material pickup document is available in the Job Portal for this job.</p>
                <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #666666; width: 140px;">Customer:</td>
                    <td style="padding: 8px 0; color: #111111;">${estimateData.customerName || 'Client'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #666666;">Vendor Name:</td>
                    <td style="padding: 8px 0; color: #111111;">${vendorName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #666666;">Sales Order #:</td>
                    <td style="padding: 8px 0; color: #111111;">#${salesOrderNumber}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #666666;">Pickup Location:</td>
                    <td style="padding: 8px 0; color: #111111;">${pickupLocation || 'N/A'}</td>
                  </tr>
                </table>
                <p style="margin-top: 20px;">
                  <a href="${jobPortalLink}" style="display: inline-block; background-color: #e63946; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 14px;">Open Job Portal</a>
                </p>
              </div>
            `;
            await sendAppEmail({
              to: crewEmail,
              subject: `Material Pickup Document Added - ${estimateData.customerName || 'Client'}`,
              text,
              html,
              estimateData
            });
          } catch (emailErr) {
            console.error('Failed to send vendor document upload notification email to crew:', emailErr);
          }
        }

        try {
          await syncCustomerToGhl({
            eventType: 'vendor_doc_uploaded',
            estimate: {
              ...estimateData,
              id: estimateId,
              vendorName,
              vendorSalesOrderNumber: salesOrderNumber,
              materialPickupLocation: pickupLocation
            }
          });
        } catch (ghlErr) {
          console.error('Failed to sync vendor_doc_uploaded event to GHL:', ghlErr);
        }

        return res.status(200).json({ success: true, document: newDoc });
      }

      if (req.body && req.body.action === 'delete-vendor-document') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized: Admin or employee login required' });
        }
        if (!isWriteAdmin) {
          return res.status(403).json({ error: 'Forbidden: Admin access required to delete vendor pickup documents.' });
        }

        const { estimateId, documentId } = req.body || {};
        if (!estimateId || !documentId) {
          return res.status(400).json({ error: 'Missing parameters estimateId or documentId' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }
        const estimateData = snap.data() || {};

        const existingDocs = Array.isArray(estimateData.vendorDocuments) ? estimateData.vendorDocuments : [];
        const docToDelete = existingDocs.find((d: any) => d.id === documentId);
        if (!docToDelete) {
          return res.status(404).json({ error: 'Vendor document not found in estimate record' });
        }

        if (docToDelete.storagePath) {
          try {
            const bucket = admin.storage().bucket('dazzling-card-485210-r8.firebasestorage.app');
            const file = bucket.file(docToDelete.storagePath);
            await file.delete();
          } catch (storageErr: any) {
            console.warn('Could not delete vendor doc file from Firebase Storage:', storageErr?.message || storageErr);
          }
        }

        const updatedDocs = existingDocs.filter((d: any) => d.id !== documentId);
        
        const logEntry = {
          id: crypto.randomUUID(),
          event: 'Vendor Document Deleted',
          timestamp: new Date().toISOString(),
          user: decoded.email || 'Office Admin',
          notes: `Deleted vendor document "${docToDelete.fileName}" for vendor "${docToDelete.vendorName}".`
        };

        await docRef.update({
          vendorDocuments: updatedDocs,
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'edit-sales-order') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!isWriteAdmin) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        const { estimateId, salesOrder } = req.body || {};
        if (!estimateId || !salesOrder || !salesOrder.id) {
          return res.status(400).json({ error: 'Missing parameters' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) return res.status(404).json({ error: 'Estimate not found' });
        const estimateData = snap.data() || {};

        const vendorDocs = Array.isArray(estimateData.vendorDocuments) ? estimateData.vendorDocuments : [];
        const updatedDocs = vendorDocs.map((doc: any) => doc.id === salesOrder.id ? { ...doc, ...salesOrder } : doc);

        const logEntry = {
          id: crypto.randomUUID(),
          event: 'Sales Order Edited',
          timestamp: new Date().toISOString(),
          user: decoded.email || 'Office',
          notes: `Edited sales order #${salesOrder.salesOrderNumber} for vendor "${salesOrder.vendorName}". Total: $${Number(salesOrder.totalCost).toFixed(2)}`
        };

        await docRef.update({
          vendorDocuments: updatedDocs,
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'save-manual-charge') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!isWriteAdmin) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        const { estimateId, charge } = req.body || {};
        if (!estimateId || !charge) {
          return res.status(400).json({ error: 'Missing parameters' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) return res.status(404).json({ error: 'Estimate not found' });
        const estimateData = snap.data() || {};

        const manualCharges = Array.isArray(estimateData.manualCharges) ? estimateData.manualCharges : [];
        let updatedCharges;
        let eventNotes = '';

        if (charge.id) {
          // Update
          updatedCharges = manualCharges.map((c: any) => c.id === charge.id ? { ...charge, date: charge.date || new Date().toISOString() } : c);
          eventNotes = `Edited manual charge: ${charge.category} - $${charge.amount}`;
        } else {
          // Add
          const newCharge = {
            ...charge,
            id: crypto.randomUUID(),
            date: charge.date || new Date().toISOString(),
            enteredBy: decoded.email || 'Office'
          };
          updatedCharges = [...manualCharges, newCharge];
          eventNotes = `Added manual charge: ${charge.category} - $${charge.amount}`;
        }

        const logEntry = {
          id: crypto.randomUUID(),
          event: charge.id ? 'Manual Charge Edited' : 'Manual Charge Added',
          timestamp: new Date().toISOString(),
          user: decoded.email || 'Office',
          notes: eventNotes
        };

        await docRef.update({
          manualCharges: updatedCharges,
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'delete-manual-charge') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!isWriteAdmin) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        const { estimateId, chargeId } = req.body || {};
        if (!estimateId || !chargeId) {
          return res.status(400).json({ error: 'Missing parameters' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) return res.status(404).json({ error: 'Estimate not found' });
        const estimateData = snap.data() || {};

        const manualCharges = Array.isArray(estimateData.manualCharges) ? estimateData.manualCharges : [];
        const chargeToDelete = manualCharges.find((c: any) => c.id === chargeId);
        const updatedCharges = manualCharges.filter((c: any) => c.id !== chargeId);

        const logEntry = {
          id: crypto.randomUUID(),
          event: 'Manual Charge Deleted',
          timestamp: new Date().toISOString(),
          user: decoded.email || 'Office',
          notes: `Deleted manual charge: ${chargeToDelete?.category || 'Unknown'} - $${chargeToDelete?.amount || 0}`
        };

        await docRef.update({
          manualCharges: updatedCharges,
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'analyze-sales-order') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const { base64Data, mimeType } = req.body || {};
        if (!base64Data || !mimeType) {
          return res.status(400).json({ error: 'Missing image data' });
        }

        try {
          const { GoogleGenAI, Type } = await import("@google/genai");
          const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
          });

          let cleanBase64 = base64Data;
          if (cleanBase64.includes(';base64,')) {
            cleanBase64 = cleanBase64.split(';base64,')[1];
          }

          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: {
              parts: [
                { text: "Analyze this Sales Order / Pickup Document. Extract the Vendor Name, Sales Order / Ticket Number, and the Grand Total Amount. Return as JSON." },
                { inlineData: { data: cleanBase64, mimeType } }
              ]
            },
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  vendorName: { type: Type.STRING },
                  salesOrderNumber: { type: Type.STRING },
                  totalAmount: { type: Type.NUMBER }
                },
                required: ["vendorName", "salesOrderNumber", "totalAmount"]
              }
            }
          });

          const result = JSON.parse(response.text);
          return res.status(200).json({ success: true, result });
        } catch (aiErr) {
          console.error('AI Analysis Error:', aiErr);
          return res.status(500).json({ error: 'AI Analysis failed' });
        }
      }

      if (req.body && req.body.action === 'reset-job-step') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!isWriteAdmin) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        const { estimateId, step, reason } = req.body || {};
        if (!estimateId || !step || !reason) {
          return res.status(400).json({ error: 'Missing parameters' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) return res.status(404).json({ error: 'Estimate not found' });
        const estimateData = snap.data() || {};

        const nowIso = new Date().toISOString();
        const updateData: any = {};
        let logEvent = `Job Portal Step Reset: ${step}`;
        let logNotes = `Admin reset ${step} step. Reason: ${reason}`;

        if (step === 'Material') {
          updateData.materialCheckInSubmitted = false;
          updateData.materialConfirmation = null;
          updateData.jobPortalStatus = 'Materials Pending';
          // Lock subsequent
          updateData.preBuildSubmitted = false;
          updateData.preBuildChecklistSubmitted = false;
          updateData.preBuildChecklistCompleted = false;
          updateData.preBuildCompletedAt = null;
          updateData.preBuildChecklist = null;
          updateData.completionSubmitted = false;
        } else if (step === 'Pre-Build') {
          updateData.preBuildSubmitted = false;
          updateData.preBuildChecklistSubmitted = false;
          updateData.preBuildChecklistCompleted = false;
          updateData.preBuildCompletedAt = null;
          // Preserve the original photos/data
          if (estimateData.preBuildChecklist) {
            updateData.preBuildChecklist = {
              ...estimateData.preBuildChecklist,
              completed: false,
              submittedAt: null,
              completedAt: null
            };
          }
          updateData.jobPortalStatus = 'materials_confirmed';
          // Lock subsequent
          updateData.completionSubmitted = false;
          logEvent = 'Pre-Build Checklist Reopened by Admin';
          logNotes = `Pre-Build Checklist reopened by Admin. Reason: ${reason}`;
        } else if (step === 'Completion') {
          updateData.completionSubmitted = false;
          updateData.jobPortalStatus = 'pre_build_complete'; // or Completion Pending
        }

        const logEntry = {
          id: crypto.randomUUID(),
          event: logEvent,
          timestamp: nowIso,
          user: decoded.email || 'Office',
          notes: logNotes,
          resetStep: step
        };

        await docRef.update({
          ...updateData,
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'recalculate-job-financials') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!isWriteAdmin) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        const { estimateId } = req.body || {};
        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) return res.status(404).json({ error: 'Estimate not found' });
        const estimateData = snap.data() || {};

        const vendorDocs = Array.isArray(estimateData.vendorDocuments) ? estimateData.vendorDocuments : [];
        const manualCharges = Array.isArray(estimateData.manualCharges) ? estimateData.manualCharges : [];
        
        const materialCostFromSalesOrders = vendorDocs.reduce((sum: number, doc: any) => sum + (Number(doc.totalCost) || 0), 0);
        
        const manualMaterialCost = manualCharges
          .filter((c: any) => c.category === 'Manual Material Cost')
          .reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0);
          
        // Prioritize labor cost from snapshot if it exists
        let laborCostFromBreakdown = Number(estimateData.laborCostFromBreakdown) || 0;
        let laborCostSource = estimateData.laborCostSource || 'Calculated Fallback';

        // Automatic backfill if missing: try to pull from snapshot if it exists
        if (!laborCostFromBreakdown || laborCostFromBreakdown === 0) {
          const snapshot = estimateData.laborContractSnapshot;
          if (snapshot && (snapshot.totalDirectLaborPayout !== undefined || snapshot.laborTotal !== undefined || snapshot.total !== undefined)) {
            laborCostFromBreakdown = Number(snapshot.totalDirectLaborPayout || snapshot.laborTotal || snapshot.total || 0);
            laborCostSource = 'Labor Breakdown Snapshot (Auto-Backfill)';
          } else if (estimateData.laborBreakdown && (estimateData.laborBreakdown.total !== undefined || estimateData.laborBreakdown.laborTotal !== undefined)) {
            laborCostFromBreakdown = Number(estimateData.laborBreakdown.total || estimateData.laborBreakdown.laborTotal || 0);
            laborCostSource = 'Labor Breakdown Object (Auto-Backfill)';
          }
        }
        
        const manualLaborCostAdjustments = manualCharges
          .filter((c: any) => c.category === 'Manual Labor Adjustment')
          .reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0);
          
        const otherManualCosts = manualCharges
          .filter((c: any) => !['Manual Material Cost', 'Manual Labor Adjustment'].includes(c.category))
          .reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0);
          
        const totalJobCost = materialCostFromSalesOrders + manualMaterialCost + laborCostFromBreakdown + manualLaborCostAdjustments + otherManualCosts;
        
        const jobRevenue = Number(estimateData.totalInvestment) || Number(estimateData.finalCustomerPrice) || Number(estimateData.grandTotal) || 0;
        
        const grossProfit = jobRevenue - totalJobCost;
        const grossMarginPercent = jobRevenue > 0 ? (grossProfit / jobRevenue) * 100 : 0;

        const financialSummary = {
          materialCostFromSalesOrders,
          manualMaterialCost,
          laborCostFromBreakdown,
          laborCostSource,
          manualLaborCostAdjustments,
          otherManualCosts,
          totalJobCost,
          jobRevenue,
          grossProfit,
          grossMarginPercent,
          lastRecalculatedAt: new Date().toISOString()
        };

        const logEntry = {
          id: crypto.randomUUID(),
          event: 'Financials Recalculated',
          timestamp: new Date().toISOString(),
          user: decoded.email || 'Office',
          notes: `Job profit recalculated: $${grossProfit.toFixed(2)} (${grossMarginPercent.toFixed(1)}%)`
        };

        await docRef.update({
          financialSummary,
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        // Optional GHL Sync
        try {
          await syncCustomerToGhl({
            eventType: 'financials_updated',
            estimate: {
              ...estimateData,
              ...financialSummary
            }
          });
        } catch (ghlErr) {
          console.error('Failed to sync financials to GHL:', ghlErr);
        }

        return res.status(200).json({ success: true, financialSummary });
      }

      if (req.body && req.body.action === 'refresh-labor-cost') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const { estimateId, laborCost, laborCostSource } = req.body || {};
        if (!estimateId) return res.status(400).json({ error: 'Missing estimateId' });

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) return res.status(404).json({ error: 'Estimate not found' });

        const logEntry = {
          id: crypto.randomUUID(),
          event: 'Labor Cost Refreshed',
          timestamp: new Date().toISOString(),
          user: decoded.email || 'Office',
          notes: `Refreshed labor snapshot cost to $${Number(laborCost).toFixed(2)} (Source: ${laborCostSource || 'Manual Refresh'})`
        };

        await docRef.update({
          laborCostFromBreakdown: Number(laborCost),
          laborCostSource: laborCostSource || 'Refreshed',
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'submit-material-confirmation') {
        const { estimateId, token, crewLeaderName, pickupLocation, notes, photos, lineItemsStatus, hasIssues, problemSummary } = req.body || {};
        
        if (!estimateId) {
          return res.status(400).json({ error: 'Missing required parameter: estimateId' });
        }
        if (!token) {
          return res.status(400).json({ error: 'Missing required parameter: token' });
        }

        const finalCrewLeaderName = crewLeaderName || (req.body && (req.body.crewName || req.body.submittedBy));
        if (!finalCrewLeaderName) {
          return res.status(400).json({ error: 'Missing required parameter: crewLeaderName' });
        }

        if (!lineItemsStatus) {
          return res.status(400).json({ error: 'Missing required parameter: lineItemsStatus' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }
        const estimateData = snap.data() || {};

        if (estimateData.laborSnapshotToken !== token && estimateData.crewScheduleToken !== token) {
          return res.status(403).json({ error: 'Forbidden: Invalid secure token' });
        }

        const nowIso = new Date().toISOString();
        const newStatus = hasIssues ? 'material_issue_reported' : 'materials_confirmed';
        const resolvedPickupLocation = pickupLocation || estimateData.pickupLocation || 'N/A';

        const confirmationData = {
          crewLeaderName: finalCrewLeaderName,
          pickupLocation: resolvedPickupLocation,
          notes: notes || '',
          photos: Array.isArray(photos) ? photos : [],
          lineItemsStatus: lineItemsStatus || {},
          completedAt: nowIso,
          pickupDate: nowIso, // automatically populated on submit as submittedAt / nowIso
          status: newStatus,
          hasIssues: !!hasIssues,
          problemSummary: problemSummary || ''
        };

        const logEntry = {
          id: crypto.randomUUID(),
          event: hasIssues ? 'Material Issues Reported' : 'Materials Confirmed',
          timestamp: nowIso,
          user: finalCrewLeaderName,
          notes: hasIssues 
            ? `Crew reported material pickup issues: ${problemSummary}. General Notes: ${notes || 'None'}` 
            : `Crew confirmed material pickup successfully with no issues. General Notes: ${notes || 'None'}`
        };

        await docRef.update({
          materialConfirmation: confirmationData,
          materialCheckInSubmitted: true,
          materialCheckInSubmittedAt: nowIso,
          materialCheckInBy: finalCrewLeaderName,
          jobPortalStatus: newStatus,
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        // Notify office immediately
        try {
          const crewName = estimateData.assignedCrew || finalCrewLeaderName || 'Assigned Crew';
          const jobPortalLink = estimateData.laborSnapshotLink || `https://fence-estimator-eight.vercel.app/?portal=job-portal&estimateId=${estimateId}&token=${estimateData.laborSnapshotToken}`;
          const officeLink = `https://fence-estimator-eight.vercel.app/dossier?id=${estimateId}`;

          const subject = hasIssues 
            ? `🚨 MATERIAL PICKUP ISSUE - Crew: ${crewName} - Client: ${estimateData.customerName || 'Client'}`
            : `✅ MATERIAL PICKUP CONFIRMED - Crew: ${crewName} - Client: ${estimateData.customerName || 'Client'}`;

          const text = `
            ${hasIssues ? '⚠️ ATTENTION: Material pickup issues have been reported!' : '✓ Material pickup successfully confirmed.'}
            
            Customer Name: ${estimateData.customerName || 'N/A'}
            Job Address: ${estimateData.customerAddress || 'N/A'}
            Crew Name: ${crewName}
            Pickup Location: ${resolvedPickupLocation}
            
            Confirmation Status: ${hasIssues ? 'ISSUES REPORTED' : 'CONFIRMED OK'}
            ${hasIssues ? `Problem Items:\n${problemSummary}` : ''}
            
            Crew Leader Notes: ${notes || 'None'}
            Photos Uploaded: ${Array.isArray(photos) ? photos.length : 0}
            
            Job Portal Link: ${jobPortalLink}
            Office Admin Link: ${officeLink}
          `;

          const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 2px solid ${hasIssues ? '#e63946' : '#2a9d8f'}; border-radius: 16px; background-color: #ffffff;">
              <h2 style="color: ${hasIssues ? '#e63946' : '#2a9d8f'}; border-bottom: 2px solid ${hasIssues ? '#e63946' : '#2a9d8f'}; padding-bottom: 12px; margin-top: 0;">
                ${hasIssues ? '🚨 Material Pickup Issues Reported' : '✅ Material Pickup Confirmed'}
              </h2>
              <p style="font-size: 14px; line-height: 1.5; color: #333333;">
                ${hasIssues ? 'A crew has reported material discrepancies or damages during pickup.' : 'The crew has completed material confirmation successfully.'}
              </p>
              
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
                <tr style="border-bottom: 1px solid #f0f0f0;">
                  <td style="padding: 10px 0; font-weight: bold; color: #666666; width: 160px;">Customer Name:</td>
                  <td style="padding: 10px 0; color: #111111; font-weight: bold;">${estimateData.customerName || 'N/A'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f0f0f0;">
                  <td style="padding: 10px 0; font-weight: bold; color: #666666;">Jobsite Address:</td>
                  <td style="padding: 10px 0; color: #111111;">${estimateData.customerAddress || 'N/A'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f0f0f0;">
                  <td style="padding: 10px 0; font-weight: bold; color: #666666;">Crew Name:</td>
                  <td style="padding: 10px 0; color: #111111;">${crewName}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f0f0f0;">
                  <td style="padding: 10px 0; font-weight: bold; color: #666666;">Pickup Location:</td>
                  <td style="padding: 10px 0; color: #111111;">${resolvedPickupLocation}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f0f0f0;">
                  <td style="padding: 10px 0; font-weight: bold; color: #666666;">Confirmation Status:</td>
                  <td style="padding: 10px 0; color: ${hasIssues ? '#e63946' : '#2a9d8f'}; font-weight: bold;">
                    ${hasIssues ? 'ISSUES REPORTED / DISCREPANCY' : 'ALL CONFIRMED & LOADED'}
                  </td>
                </tr>
                ${hasIssues ? `
                <tr style="border-bottom: 1px solid #f0f0f0; background-color: #fff5f5;">
                  <td style="padding: 10px; font-weight: bold; color: #e63946; vertical-align: top;">Problem Items:</td>
                  <td style="padding: 10px; color: #c1121f; font-family: monospace; white-space: pre-wrap;">${problemSummary}</td>
                </tr>` : ''}
                <tr style="border-bottom: 1px solid #f0f0f0;">
                  <td style="padding: 10px 0; font-weight: bold; color: #666666; vertical-align: top;">General Notes:</td>
                  <td style="padding: 10px 0; color: #333333; font-style: italic;">${notes || 'None'}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f0f0f0;">
                  <td style="padding: 10px 0; font-weight: bold; color: #666666;">Attached Photos:</td>
                  <td style="padding: 10px 0; color: #333333;">${Array.isArray(photos) ? photos.length : 0} image(s)</td>
                </tr>
              </table>

              <div style="margin-top: 25px; display: flex; gap: 15px;">
                <a href="${jobPortalLink}" style="display: inline-block; background-color: #1d3557; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: bold; font-size: 13px;">Open Crew Job Portal</a>
                <a href="${officeLink}" style="display: inline-block; background-color: #e63946; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: bold; font-size: 13px; margin-left: 10px;">Open Backoffice Estimate</a>
              </div>
            </div>
          `;

          await sendAppEmail({
            to: 'bradens@lonestarfenceworks.com',
            subject,
            text,
            html,
            estimateData
          });
        } catch (mailErr) {
          console.error('Failed to send material confirmation notification email:', mailErr);
        }

        // Sync to GHL
        try {
          await syncCustomerToGhl({
            eventType: newStatus,
            estimate: {
              ...estimateData,
              id: estimateId,
              materialConfirmationStatus: hasIssues ? 'Issues Reported' : 'Confirmed',
              materialsConfirmedAt: nowIso,
              materialIssueReported: hasIssues ? 'Yes' : 'No',
              materialIssueSummary: problemSummary || ''
            }
          });
        } catch (ghlErr) {
          console.error('Failed to sync material confirmation to GHL:', ghlErr);
        }

        return res.status(200).json({ success: true, materialConfirmation: confirmationData });
      }

      if (req.body && req.body.action === 'override-material-issue') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized: Admin or employee login required' });
        }
        if (!isWriteAdmin) {
          return res.status(403).json({ error: 'Forbidden: Admin access required to override material issues.' });
        }

        const { estimateId, decision, adminNotes } = req.body || {};
        if (!estimateId || !decision) {
          return res.status(400).json({ error: 'Missing parameters estimateId or decision' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }
        const estimateData = snap.data() || {};

        const nowIso = new Date().toISOString();
        let newStatus = 'materials_confirmed';
        let logEvent = 'Material Issues Overridden';
        let logNotes = `Office approved starting the job despite material issues. Admin Notes: ${adminNotes || 'None'}`;
        let ghlEvent = 'start_approved_with_material_issue';

        if (decision === 'approve_anyway') {
          newStatus = 'start_approved_with_material_issue';
          logEvent = 'Material Issues Approved';
        } else if (decision === 'return_to_crew') {
          newStatus = 'dispatched'; // Reset back to dispatched so they can re-evaluate
          logEvent = 'Material Issues Returned to Crew';
          logNotes = `Office returned material issues for correction. Admin Notes: ${adminNotes || 'Required'}`;
          ghlEvent = 'returned_to_crew';
        }

        const logEntry = {
          id: crypto.randomUUID(),
          event: logEvent,
          timestamp: nowIso,
          user: decoded.email || 'Office Admin',
          notes: logNotes
        };

        const updatedConfirmation = estimateData.materialConfirmation ? {
          ...estimateData.materialConfirmation,
          adminDecision: decision,
          adminNotes: adminNotes || '',
          decidedAt: nowIso,
          decidedBy: decoded.email || 'Office Admin'
        } : null;

        await docRef.update({
          jobPortalStatus: newStatus,
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry),
          ...(updatedConfirmation ? { materialConfirmation: updatedConfirmation } : {})
        });

        // Notify crew via email
        const crewEmail = estimateData.laborContractEmailRecipient || estimateData.crewEmailRecipient;
        if (crewEmail) {
          try {
            const jobPortalLink = estimateData.laborSnapshotLink || `https://fence-estimator-eight.vercel.app/?portal=job-portal&estimateId=${estimateId}&token=${estimateData.laborSnapshotToken}`;
            const subject = decision === 'approve_anyway' 
              ? `✅ START APPROVED - Customer: ${estimateData.customerName || 'Client'}`
              : `⚠️ MATERIAL ACTION REQUIRED - Customer: ${estimateData.customerName || 'Client'}`;

            const text = decision === 'approve_anyway'
              ? `Hi Crew,\n\nThe office has reviewed the reported material issues and APPROVED starting the job anyway.\n\nYou are clear to proceed with the Pre-Build Checklist.\n\nOffice Comments:\n${adminNotes || 'None'}\n\nOpen Job Portal:\n${jobPortalLink}`
              : `Hi Crew,\n\nThe office has reviewed the material issues reported and returned the order for correction/re-evaluation.\n\nPlease double check materials or communicate with vendor/yard as instructed.\n\nOffice Instructions:\n${adminNotes || 'None'}\n\nOpen Job Portal:\n${jobPortalLink}`;

            const html = `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e5e5e5; border-radius: 12px; background-color: #ffffff;">
                <h2 style="color: ${decision === 'approve_anyway' ? '#1d3557' : '#e63946'}; border-bottom: 2px solid ${decision === 'approve_anyway' ? '#2a9d8f' : '#e63946'}; padding-bottom: 10px; margin-top: 0;">
                  ${decision === 'approve_anyway' ? '✅ Proceed with Installation Approved' : '⚠️ Material Confirmation Returned'}
                </h2>
                <p style="font-size: 14px; line-height: 1.5; color: #333333;">
                  ${decision === 'approve_anyway' 
                    ? 'The office has reviewed your reported issues and approved you to start work anyway. The Pre-Build Checklist is now unlocked.' 
                    : 'The office has returned the material confirmation step for re-evaluation or yard coordination.'}
                </p>
                <div style="background-color: #f8f9fa; border-left: 4px solid ${decision === 'approve_anyway' ? '#2a9d8f' : '#e63946'}; padding: 15px; margin: 15px 0; font-size: 13px; border-radius: 4px;">
                  <strong>Office Instructions / Notes:</strong><br/>
                  <p style="margin: 5px 0 0 0; font-style: italic; color: #555555;">${adminNotes || 'None provided.'}</p>
                </div>
                <p style="margin-top: 25px;">
                  <a href="${jobPortalLink}" style="display: inline-block; background-color: #e63946; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 14px;">Open Crew Job Portal</a>
                </p>
              </div>
            `;

            await sendAppEmail({
              to: crewEmail,
              subject,
              text,
              html,
              estimateData
            });
          } catch (emailErr) {
            console.error('Failed to notify crew of override decision:', emailErr);
          }
        }

        // Sync with GHL
        try {
          await syncCustomerToGhl({
            eventType: ghlEvent,
            estimate: {
              ...estimateData,
              id: estimateId
            }
          });
        } catch (ghlErr) {
          console.error('Failed to sync override decision to GHL:', ghlErr);
        }

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'upload-job-portal-photo') {
        try {
          const { estimateId, token, filename, mimeType, base64Data } = req.body || {};
          if (!estimateId || !token || !filename || !mimeType || !base64Data) {
            return res.status(400).json({
              success: false,
              error: 'Missing parameters',
              code: 'UPLOAD_FAILED'
            });
          }
          const { docRef, snap } = await getEstimateDocRef(estimateId);
          if (!snap.exists) {
            return res.status(404).json({
              success: false,
              error: 'Estimate not found',
              code: 'UPLOAD_FAILED'
            });
          }
          const estimateData = snap.data() || {};
          if (estimateData.laborSnapshotToken !== token && estimateData.crewScheduleToken !== token) {
            return res.status(403).json({
              success: false,
              error: 'Forbidden: Invalid secure token',
              code: 'UPLOAD_FAILED'
            });
          }
          const timestamp = Date.now();
          const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
          const storagePath = `job-photos/${estimateId}/${timestamp}-${sanitizedFilename}`;
          const bucket = admin.storage().bucket('dazzling-card-485210-r8.firebasestorage.app');
          const file = bucket.file(storagePath);
          let cleanBase64 = base64Data;
          if (cleanBase64.includes(';base64,')) {
            cleanBase64 = cleanBase64.split(';base64,')[1];
          }
          const buffer = Buffer.from(cleanBase64, 'base64');
          await file.save(buffer, { metadata: { contentType: mimeType } });
          let downloadUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
          try {
            await file.makePublic();
          } catch (pubErr) {
            const expires = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;
            const [signedUrl] = await file.getSignedUrl({ action: 'read', expires });
            downloadUrl = signedUrl;
          }
          return res.status(200).json({
            success: true,
            drawingUrl: downloadUrl, // for compatibility
            url: downloadUrl,
            path: storagePath,
            fileName: sanitizedFilename,
            contentType: mimeType
          });
        } catch (err: any) {
          console.error('Job portal photo upload error:', err);
          return res.status(500).json({
            success: false,
            error: err.message || 'An unexpected error occurred during photo upload.',
            code: 'UPLOAD_FAILED'
          });
        }
      }

      if (req.body && req.body.action === 'submit-pre-build-checklist') {
        const { estimateId, token, crewLeaderName, startTime, notes, photos, verifiedUtility, locatedValves, verifiedLayout, verifiedMaterials, notifiedNeighbors } = req.body || {};
        if (!estimateId) {
          return res.status(400).json({ error: 'Missing required parameter: estimateId' });
        }
        if (!token) {
          return res.status(400).json({ error: 'Missing required parameter: token' });
        }
        const finalCrewLeaderName = crewLeaderName || (req.body && (req.body.crewName || req.body.submittedBy));
        if (!finalCrewLeaderName) {
          return res.status(400).json({ error: 'Missing required parameter: crewLeaderName' });
        }
        if (!startTime) {
          return res.status(400).json({ error: 'Missing required parameter: startTime' });
        }
        if (!photos || !Array.isArray(photos)) {
          return res.status(400).json({ error: 'Missing required parameter: photos' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }
        const estimateData = snap.data() || {};
        if (estimateData.laborSnapshotToken !== token && estimateData.crewScheduleToken !== token) {
          return res.status(403).json({ error: 'Forbidden: Invalid secure token' });
        }
        const nowIso = new Date().toISOString();
        const checklist = { 
          crewLeaderName: finalCrewLeaderName, 
          startTime, 
          notes, 
          photos, 
          completedAt: nowIso,
          completed: true,
          submittedAt: nowIso,
          verifiedUtility: verifiedUtility !== undefined ? verifiedUtility : true,
          locatedValves: locatedValves !== undefined ? locatedValves : true,
          verifiedLayout: verifiedLayout !== undefined ? verifiedLayout : true,
          verifiedMaterials: verifiedMaterials !== undefined ? verifiedMaterials : true,
          notifiedNeighbors: notifiedNeighbors !== undefined ? notifiedNeighbors : true
        };
        const logEntry = {
          id: crypto.randomUUID(),
          event: 'Pre-Build Checklist Completed',
          timestamp: nowIso,
          user: finalCrewLeaderName,
          notes: `Pre-build submitted with ${photos.length} photos. ${notes || ''}`
        };
        await docRef.update({
          jobPortalStatus: 'pre_build_complete',
          preBuildChecklist: checklist,
          preBuildChecklistSubmitted: true,
          preBuildSubmitted: true,
          preBuildChecklistCompleted: true,
          preBuildCompletedAt: nowIso,
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        // Notify office
        try {
          const text = `Crew Leader ${finalCrewLeaderName} has submitted the Pre-Build Checklist for ${estimateData.customerName || 'customer'}.\n\nNotes: ${notes || 'None'}\nPhoto Count: ${photos.length}`;
          await sendAppEmail({
            to: 'bradens@lonestarfenceworks.com',
            subject: `Pre-Build Checklist Submitted - ${estimateData.customerName || 'Client'}`,
            text,
            html: `<h3>Pre-Build Checklist Submitted</h3><p>Crew Leader <strong>${finalCrewLeaderName}</strong> has submitted the Pre-Build Checklist for ${estimateData.customerName || 'customer'}.</p><p><strong>Notes:</strong> ${notes || 'None'}</p><p><strong>Photo Count:</strong> ${photos.length}</p>`,
            estimateData
          });
        } catch (mailErr) {
          console.error('Mail notification error:', mailErr);
        }

        // Sync GHL
        try {
          await syncCustomerToGhl({
            eventType: 'pre_build_complete',
            estimate: { id: estimateId, ...estimateData },
            status: 'Pre-Build Complete'
          });
        } catch (ghlErr) {
          console.error('GHL sync error:', ghlErr);
        }

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'submit-completion-checklist') {
        const { estimateId, token, crewLeaderName, completionTime, notes, issuesDocumented, photos } = req.body || {};
        if (!estimateId || !token || !crewLeaderName || !completionTime || !Array.isArray(photos)) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }
        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }
        const estimateData = snap.data() || {};
        if (estimateData.laborSnapshotToken !== token && estimateData.crewScheduleToken !== token) {
          return res.status(403).json({ error: 'Forbidden: Invalid secure token' });
        }
        const nowIso = new Date().toISOString();
        const checklist = { crewLeaderName, completionTime, notes, issuesDocumented, photos, completedAt: nowIso };
        const logEntry = {
          id: crypto.randomUUID(),
          event: 'Completion Checklist Submitted',
          timestamp: nowIso,
          user: crewLeaderName,
          notes: `Completion submitted with ${photos.length} photos. Issues: ${issuesDocumented ? 'Yes' : 'No'}. ${notes || ''}`
        };
        await docRef.update({
          jobPortalStatus: 'completion_submitted',
          completionChecklist: checklist,
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        // Notify office
        try {
          const text = `Crew Leader ${crewLeaderName} has submitted the Completion Checklist for ${estimateData.customerName || 'customer'}.\n\nNotes: ${notes || 'None'}\nIssues: ${issuesDocumented ? 'Yes' : 'No'}\nPhoto Count: ${photos.length}`;
          await sendAppEmail({
            to: 'bradens@lonestarfenceworks.com',
            subject: `Completion Checklist Submitted - ${estimateData.customerName || 'Client'}`,
            text,
            html: `<h3>Completion Checklist Submitted</h3><p>Crew Leader <strong>${crewLeaderName}</strong> has submitted the Completion Checklist for ${estimateData.customerName || 'customer'}.</p><p><strong>Notes:</strong> ${notes || 'None'}</p><p><strong>Issues Documented:</strong> ${issuesDocumented ? 'Yes' : 'No'}</p><p><strong>Photo Count:</strong> ${photos.length}</p>`,
            estimateData
          });
        } catch (mailErr) {
          console.error('Mail notification error:', mailErr);
        }

        // Sync GHL
        try {
          await syncCustomerToGhl({
            eventType: 'completion_submitted',
            estimate: { id: estimateId, ...estimateData },
            status: 'Completion Checklist Submitted'
          });
        } catch (ghlErr) {
          console.error('GHL sync error:', ghlErr);
        }

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'submit-schedule-response') {
        const { estimateId, token, responseType, notes, confirmationType } = req.body || {};
        if (!estimateId || !token || !responseType || !confirmationType) {
          return res.status(400).json({ error: 'Missing parameters' });
        }
        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }
        const estimateData = snap.data() || {};
        if (estimateData.laborSnapshotToken !== token && estimateData.crewScheduleToken !== token) {
          return res.status(403).json({ error: 'Forbidden: Invalid secure token' });
        }
        const nowIso = new Date().toISOString();
        const isConfirm = responseType === 'confirm';
        const newStatus = isConfirm 
          ? (confirmationType === '72hr' ? 'schedule_confirmed_72hr' : 'schedule_confirmed_24hr')
          : 'schedule_conflict';
        
        const logEntry = {
          id: crypto.randomUUID(),
          event: isConfirm ? `Schedule Confirmed (${confirmationType})` : 'Crew Schedule Conflict Reported',
          timestamp: nowIso,
          user: 'Crew',
          notes: notes || ''
        };

        await docRef.update({
          jobPortalStatus: newStatus,
          jobPortalPendingConfirmation: admin.firestore.FieldValue.delete(),
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        // Notify office
        try {
          const text = `Crew has responded to ${confirmationType} scheduling request for ${estimateData.customerName || 'customer'}.\n\nResponse: ${responseType.toUpperCase()}\nNotes: ${notes || 'None'}`;
          await sendAppEmail({
            to: 'bradens@lonestarfenceworks.com',
            subject: `Schedule Response (${responseType.toUpperCase()}) - ${estimateData.customerName || 'Client'}`,
            text,
            html: `<h3>Schedule Response Received</h3><p>Crew has responded to <strong>${confirmationType}</strong> scheduling request for ${estimateData.customerName || 'customer'}.</p><p><strong>Response:</strong> ${responseType.toUpperCase()}</p><p><strong>Notes:</strong> ${notes || 'None'}</p>`,
            estimateData
          });
        } catch (mailErr) {
          console.error('Mail notification error:', mailErr);
        }

        // Sync GHL
        try {
          await syncCustomerToGhl({
            eventType: isConfirm ? `crew_confirmed_${confirmationType}` : 'schedule_conflict',
            estimate: { id: estimateId, ...estimateData },
            status: isConfirm ? `Crew Confirmed ${confirmationType}` : 'Crew Schedule Conflict'
          });
        } catch (ghlErr) {
          console.error('GHL sync error:', ghlErr);
        }

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'schedule-job-start') {
        const { estimateId, token, startDate, duration, notes, reason } = req.body || {};
        if (!estimateId || !token || !startDate || !duration) {
          return res.status(400).json({ error: 'Missing parameters: estimateId, token, startDate, and duration are required.' });
        }

        const today = new Date();
        today.setHours(0,0,0,0);
        const minDate = new Date(today.getTime() + 4 * 24 * 60 * 60 * 1000);
        minDate.setHours(0,0,0,0);

        const selectedDate = new Date(startDate + 'T00:00:00');
        if (selectedDate.getTime() < minDate.getTime()) {
          return res.status(400).json({ error: `Invalid start date. The soonest start date allowed is 4 calendar days from today (${minDate.toISOString().split('T')[0]}).` });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }
        const estimateData = snap.data() || {};
        if (estimateData.laborSnapshotToken !== token && estimateData.crewScheduleToken !== token) {
          return res.status(403).json({ error: 'Forbidden: Invalid secure token' });
        }

        const nowIso = new Date().toISOString();

        const scheduleEventId = "install-" + estimateId;
        const scheduleSyncTraceId = req.body.scheduleSyncTraceId || ("trace-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9));

        console.log(`[BACKEND ACTION TRACE] action_received: schedule-job-start
          scheduleSyncTraceId: ${scheduleSyncTraceId}
          action: schedule-job-start
          estimateId: ${estimateId}
          scheduleEventId: ${scheduleEventId}
          selected start date: ${startDate}
          duration/install days: ${duration}
          whether schedule event was saved: YES
          whether estimate was updated: YES
          whether GHL sync was requested: YES
          which helper function was called: syncEstimateToGhlCalendar
        `);

        // Sync to GHL Calendar
        const calSync = await syncEstimateToGhlCalendar(estimateId, estimateData, startDate, duration, notes, token, scheduleSyncTraceId, 'schedule-job-start');
        const syncSuccess = calSync.success;
        const syncErrorMsg = calSync.error || '';
        const ghlCalendarEventId = calSync.ghlCalendarEventId || null;
        const ghlCalendarEventIds = calSync.ghlCalendarEventIds || (ghlCalendarEventId ? [ghlCalendarEventId] : []);
        const ghlContactId = calSync.ghlContactId || estimateData.ghlContactId || '';

        // 5. Save details back to Firestore
        const logEntry = {
          id: crypto.randomUUID(),
          event: 'Job Start Date Scheduled',
          timestamp: nowIso,
          user: 'Crew',
          notes: `Proposed start: ${startDate}, Estimated duration: ${duration}. Notes: ${notes || 'None'}`
        };

        const updates: any = {
          scheduledStartDate: startDate,
          scheduledDuration: duration,
          scheduledNotes: notes || '',
          jobPortalStatus: 'start_date_scheduled',
          jobPortalScheduled: true,
          scheduleLastChangedAt: nowIso,
          scheduleLastChangedBy: 'Crew',
          scheduleChangeReason: reason || 'Initial Schedule',
          updatedAt: nowIso
        };

        if (ghlContactId) {
          updates.ghlContactId = ghlContactId;
        }

        // Save reminders
        const startDateObj = new Date(startDate + 'T08:00:00');
        const rem72 = new Date(startDateObj);
        rem72.setDate(rem72.getDate() - 3);
        const rem24 = new Date(startDateObj);
        rem24.setDate(rem24.getDate() - 1);

        updates.reminder72hrCrewAt = rem72.toISOString().split('T')[0];
        updates.reminder24hrCrewAt = rem24.toISOString().split('T')[0];

        if (syncSuccess && ghlCalendarEventId) {
          updates.ghlCalendarEventId = ghlCalendarEventId;
          updates.ghlCalendarEventIds = ghlCalendarEventIds;
          updates.ghlCalendarSyncStatus = 'synced';
          updates.ghlCalendarLastSyncedAt = nowIso;
          updates.jobPortalHistory = admin.firestore.FieldValue.arrayUnion(logEntry);
        } else {
          updates.ghlCalendarSyncStatus = 'failed';
          updates.ghlCalendarSyncError = syncErrorMsg || 'Calendar ID or API settings not configured';
          
          const failLog = {
            id: crypto.randomUUID(),
            event: 'GHL Calendar Sync Failed',
            timestamp: nowIso,
            user: 'System',
            notes: `Calendar sync failed: ${syncErrorMsg || 'Calendar ID or API settings not configured'}`
          };
          updates.jobPortalHistory = admin.firestore.FieldValue.arrayUnion(logEntry, failLog);
        }

        await docRef.update(updates);

        // Update schedule_events
        try {
          const durationNum = parseInt(String(duration)) || 1;
          const startD_iso = new Date(startDate);
          const endD_iso = new Date(startD_iso);
          endD_iso.setDate(endD_iso.getDate() + durationNum - 1);
          const endDate = endD_iso.toISOString().split('T')[0];
          
          const eventId = "install-" + estimateId;
          await db.collection('schedule_events').doc(eventId).set(sanitizeForFirestore({
            start: startDate,
            end: endDate,
            title: `INSTALL: ${estimateData.customerName || 'Customer'}`,
            crew: estimateData.assignedCrew || 'N/A',
            estimateId: estimateId,
            notes: `Scheduled via Job Portal. Notes: ${notes || 'None'}`
          }), { merge: true });
          
          await docRef.update({ scheduledEndDate: endDate });
        } catch (evErr) {
          console.error('Failed to update schedule_events in schedule-job-start:', evErr);
        }

        // 6. Send email notification to office
        try {
          const emailText = `Crew has scheduled the job start date for ${estimateData.customerName || 'customer'}.\n\nStart Date: ${startDate}\nEstimated Duration: ${duration}\nNotes: ${notes || 'None'}`;
          await sendAppEmail({
            to: 'bradens@lonestarfenceworks.com',
            subject: `Job Start Scheduled - ${estimateData.customerName || 'Client'}`,
            text: emailText,
            html: `<h3>Job Start Scheduled</h3>
                   <p>Crew has scheduled the job start date for <strong>${estimateData.customerName || 'customer'}</strong>.</p>
                   <p><strong>Start Date:</strong> ${startDate}</p>
                   <p><strong>Estimated Duration:</strong> ${duration}</p>
                   <p><strong>Crew Notes:</strong> ${notes || 'None'}</p>
                   ${!syncSuccess ? `<p style="color: #c53030; font-weight: bold;">⚠️ Warning: GHL Calendar Sync Failed: ${syncErrorMsg || 'Not Configured'}</p>` : ''}`,
            estimateData
          });
        } catch (mailErr) {
          console.error('Mail notification error:', mailErr);
        }

        return res.status(200).json({
          success: true,
          scheduledStartDate: startDate,
          scheduledDuration: duration,
          ghlCalendarSyncStatus: syncSuccess ? 'synced' : 'failed',
          ghlCalendarSyncError: syncSuccess ? null : syncErrorMsg,
          ghlSyncDebug: calSync.ghlSyncDebug || null,
          ghlSyncSuccess: calSync.success,
          ghlSyncError: calSync.error,
        });
      }

      if (req.body && req.body.action === 'admin-update-schedule') {
        const { estimateId, startDate, duration, assignedCrew, notes } = req.body || {};
        if (!estimateId || !startDate || !duration || !assignedCrew) {
          return res.status(400).json({ error: 'Missing parameters: estimateId, startDate, duration, and assignedCrew are required.' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }
        const estimateData = snap.data() || {};
        const nowIso = new Date().toISOString();

        const scheduleEventId = "install-" + estimateId;
        const scheduleSyncTraceId = req.body.scheduleSyncTraceId || ("trace-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9));

        console.log(`[BACKEND ACTION TRACE] action_received: admin-update-schedule
          scheduleSyncTraceId: ${scheduleSyncTraceId}
          action: admin-update-schedule
          estimateId: ${estimateId}
          scheduleEventId: ${scheduleEventId}
          selected start date: ${startDate}
          duration/install days: ${duration}
          whether schedule event was saved: YES
          whether estimate was updated: YES
          whether GHL sync was requested: YES
          which helper function was called: syncEstimateToGhlCalendar
        `);

        // Sync to GHL Calendar
        const calSync = await syncEstimateToGhlCalendar(estimateId, estimateData, startDate, duration, notes, estimateData.laborSnapshotToken || '', scheduleSyncTraceId, 'admin-update-schedule');
        const syncSuccess = calSync.success;
        const syncErrorMsg = calSync.error || '';
        const ghlCalendarEventId = calSync.ghlCalendarEventId || null;
        const ghlCalendarEventIds = calSync.ghlCalendarEventIds || (ghlCalendarEventId ? [ghlCalendarEventId] : []);
        const ghlContactId = calSync.ghlContactId || estimateData.ghlContactId || '';

        // 5. Save details back to Firestore
        const logEntry = {
          id: crypto.randomUUID(),
          event: 'Job Schedule Updated by Admin',
          timestamp: nowIso,
          user: 'Admin',
          notes: `Updated start: ${startDate}, Estimated duration: ${duration}, Assigned Crew: ${assignedCrew}. Notes: ${notes || 'None'}`
        };

        const updates: any = {
          scheduledStartDate: startDate,
          scheduledDuration: duration,
          scheduledNotes: notes || '',
          assignedCrew,
          jobPortalStatus: 'start_date_scheduled',
          jobPortalScheduled: true,
          scheduleLastChangedAt: nowIso,
          scheduleLastChangedBy: 'Admin',
          scheduleChangeReason: 'Admin Adjustment',
          updatedAt: nowIso
        };

        if (ghlContactId) {
          updates.ghlContactId = ghlContactId;
        }

        // Save reminders
        const startDateObj = new Date(startDate + 'T08:00:00');
        const rem72 = new Date(startDateObj);
        rem72.setDate(rem72.getDate() - 3);
        const rem24 = new Date(startDateObj);
        rem24.setDate(rem24.getDate() - 1);

        updates.reminder72hrCrewAt = rem72.toISOString().split('T')[0];
        updates.reminder24hrCrewAt = rem24.toISOString().split('T')[0];

        if (syncSuccess && ghlCalendarEventId) {
          updates.ghlCalendarEventId = ghlCalendarEventId;
          updates.ghlCalendarEventIds = ghlCalendarEventIds;
          updates.ghlCalendarSyncStatus = 'synced';
          updates.ghlCalendarLastSyncedAt = nowIso;
          updates.jobPortalHistory = admin.firestore.FieldValue.arrayUnion(logEntry);
        } else {
          updates.ghlCalendarSyncStatus = 'failed';
          updates.ghlCalendarSyncError = syncErrorMsg || 'Calendar ID or API settings not configured';
          
          const failLog = {
            id: crypto.randomUUID(),
            event: 'GHL Calendar Sync Failed',
            timestamp: nowIso,
            user: 'System',
            notes: `Calendar sync failed: ${syncErrorMsg || 'Calendar ID or API settings not configured'}`
          };
          updates.jobPortalHistory = admin.firestore.FieldValue.arrayUnion(logEntry, failLog);
        }

        await docRef.update(updates);

        // Update schedule_events
        try {
          const durationNum = parseInt(String(duration)) || 1;
          const startD_iso = new Date(startDate);
          const endD_iso = new Date(startD_iso);
          endD_iso.setDate(endD_iso.getDate() + durationNum - 1);
          const endDate = endD_iso.toISOString().split('T')[0];
          
          const eventId = "install-" + estimateId;
          await db.collection('schedule_events').doc(eventId).set(sanitizeForFirestore({
            start: startDate,
            end: endDate,
            title: `INSTALL: ${estimateData.customerName || 'Customer'}`,
            crew: assignedCrew || 'N/A',
            estimateId: estimateId,
            notes: `Updated by Admin. Notes: ${notes || 'None'}`
          }), { merge: true });
          
          await docRef.update({ scheduledEndDate: endDate });
        } catch (evErr) {
          console.error('Failed to update schedule_events in admin-update-schedule:', evErr);
        }

        return res.status(200).json({
          success: true,
          scheduledStartDate: startDate,
          scheduledDuration: duration,
          ghlCalendarSyncStatus: syncSuccess ? 'synced' : 'failed',
          ghlCalendarSyncError: syncSuccess ? null : syncErrorMsg,
          ghlSyncDebug: calSync.ghlSyncDebug || null,
          ghlSyncSuccess: calSync.success,
          ghlSyncError: calSync.error,
        });
      }

      if (req.body && req.body.action === 'resync-ghl-calendar') {
        const { estimateId } = req.body || {};
        if (!estimateId) {
          return res.status(400).json({ error: 'Missing parameters: estimateId is required.' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }
        const estimateData = snap.data() || {};
        const startDate = estimateData.scheduledStartDate;
        const duration = estimateData.scheduledDuration || estimateData.installDuration || '1 day';
        const assignedCrew = estimateData.assignedCrew || 'Crew';
        const notes = estimateData.scheduledNotes || '';

        if (!startDate) {
          return res.status(400).json({ error: 'No scheduled start date is currently set on this estimate.' });
        }

        const nowIso = new Date().toISOString();

        const scheduleEventId = "install-" + estimateId;
        const scheduleSyncTraceId = req.body.scheduleSyncTraceId || ("trace-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9));

        console.log(`[BACKEND ACTION TRACE] action_received: resync-ghl-calendar
          scheduleSyncTraceId: ${scheduleSyncTraceId}
          action: resync-ghl-calendar
          estimateId: ${estimateId}
          scheduleEventId: ${scheduleEventId}
          selected start date: ${startDate}
          duration/install days: ${duration}
          whether schedule event was saved: YES
          whether estimate was updated: YES
          whether GHL sync was requested: YES
          which helper function was called: syncEstimateToGhlCalendar
        `);

        // Sync to GHL Calendar
        const calSync = await syncEstimateToGhlCalendar(estimateId, estimateData, startDate, duration, notes, estimateData.laborSnapshotToken || '', scheduleSyncTraceId, 'resync-ghl-calendar');
        const syncSuccess = calSync.success;
        const syncErrorMsg = calSync.error || '';
        const ghlCalendarEventId = calSync.ghlCalendarEventId || null;
        const ghlCalendarEventIds = calSync.ghlCalendarEventIds || (ghlCalendarEventId ? [ghlCalendarEventId] : []);
        const ghlContactId = calSync.ghlContactId || estimateData.ghlContactId || '';

        // 5. Save details back to Firestore
        const logEntry = {
          id: crypto.randomUUID(),
          event: 'GHL Calendar Re-Sync Performed',
          timestamp: nowIso,
          user: 'Admin',
          notes: `Re-sync Status: ${syncSuccess ? 'Success' : 'Failed'}. Error: ${syncErrorMsg || 'None'}`
        };

        const updates: any = {
          updatedAt: nowIso
        };

        if (ghlContactId) {
          updates.ghlContactId = ghlContactId;
        }

        if (syncSuccess && ghlCalendarEventId) {
          updates.ghlCalendarEventId = ghlCalendarEventId;
          updates.ghlCalendarEventIds = ghlCalendarEventIds;
          updates.ghlCalendarSyncStatus = 'synced';
          updates.ghlCalendarLastSyncedAt = nowIso;
          updates.jobPortalHistory = admin.firestore.FieldValue.arrayUnion(logEntry);
        } else {
          updates.ghlCalendarSyncStatus = 'failed';
          updates.ghlCalendarSyncError = syncErrorMsg || 'Calendar ID or API settings not configured';
          updates.jobPortalHistory = admin.firestore.FieldValue.arrayUnion(logEntry);
        }

        await docRef.update(updates);

        return res.status(200).json({
          success: syncSuccess,
          scheduledStartDate: startDate,
          scheduledDuration: duration,
          ghlCalendarSyncStatus: syncSuccess ? 'synced' : 'failed',
          ghlCalendarSyncError: syncSuccess ? null : syncErrorMsg,
          ghlSyncDebug: calSync.ghlSyncDebug || null,
          ghlSyncSuccess: calSync.success,
          ghlSyncError: calSync.error,
        });
      }

      if (req.body && req.body.action === 'submit-job-portal-report') {
        const { estimateId, token, reportType, details } = req.body || {};
        if (!estimateId || !token || !reportType || !details) {
          return res.status(400).json({ error: 'Missing parameters' });
        }
        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }
        const estimateData = snap.data() || {};
        if (estimateData.laborSnapshotToken !== token && estimateData.crewScheduleToken !== token) {
          return res.status(403).json({ error: 'Forbidden: Invalid secure token' });
        }
        const nowIso = new Date().toISOString();
        let eventName = 'Incident/Issue Reported';
        if (reportType === 'shortage') eventName = 'Material Shortage Reported';
        else if (reportType === 'delay') eventName = 'Rain / Delay Reported';

        const logEntry = {
          id: crypto.randomUUID(),
          event: eventName,
          timestamp: nowIso,
          user: 'Crew',
          notes: details
        };

        await docRef.update({
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        // Notify office
        try {
          const text = `Crew has reported a ${reportType.toUpperCase()} for ${estimateData.customerName || 'customer'}.\n\nDetails:\n${details}`;
          await sendAppEmail({
            to: 'bradens@lonestarfenceworks.com',
            subject: `Crew Report: ${reportType.toUpperCase()} - ${estimateData.customerName || 'Client'}`,
            text,
            html: `<h3>Crew Report: ${reportType.toUpperCase()}</h3><p>Crew has reported a ${reportType.toUpperCase()} for ${estimateData.customerName || 'customer'}.</p><p><strong>Details:</strong><br/>${details.replace(/\n/g, '<br/>')}</p>`,
            estimateData
          });
        } catch (mailErr) {
          console.error('Mail notification error:', mailErr);
        }

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'office-approve-completion') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized: Admin or employee login required' });
        }
        if (!isWriteAdmin) {
          return res.status(403).json({ error: 'Forbidden: Admin or employee login required' });
        }
        const { estimateId, notes } = req.body || {};
        if (!estimateId) {
          return res.status(400).json({ error: 'Estimate ID is required' });
        }
        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }
        const estimateData = snap.data() || {};
        const nowIso = new Date().toISOString();
        const logEntry = {
          id: crypto.randomUUID(),
          event: 'Job Approved by Office',
          timestamp: nowIso,
          user: decoded?.email || 'Office Admin',
          notes: notes || 'Completion approved.'
        };

        await docRef.update({
          jobPortalStatus: 'completed',
          installStatus: 'Completed',
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        // Sync GHL
        try {
          await syncCustomerToGhl({
            eventType: 'completed',
            estimate: { id: estimateId, ...estimateData },
            status: 'Completed'
          });
        } catch (ghlErr) {
          console.error('GHL sync error:', ghlErr);
        }

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'office-return-to-crew') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized: Admin or employee login required' });
        }
        if (!isWriteAdmin) {
          return res.status(403).json({ error: 'Forbidden: Admin or employee login required' });
        }
        const { estimateId, notes } = req.body || {};
        if (!estimateId || !notes) {
          return res.status(400).json({ error: 'Estimate ID and return reasons/notes are required' });
        }
        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }
        const estimateData = snap.data() || {};
        const nowIso = new Date().toISOString();
        const logEntry = {
          id: crypto.randomUUID(),
          event: 'Returned to Crew for Correction',
          timestamp: nowIso,
          user: decoded?.email || 'Office Admin',
          notes: notes
        };

        await docRef.update({
          jobPortalStatus: 'returned_to_crew',
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        // Notify Crew by Email
        try {
          const crewEmail = estimateData.crewEmailRecipient || estimateData.laborContractEmailRecipient;
          if (crewEmail) {
            const text = `Hello Crew,\n\nThe office has returned the job for ${estimateData.customerName || 'customer'} to your queue for correction/outstanding tasks.\n\nCorrection Notes:\n${notes}\n\nPlease access the secure Job Portal to review and resubmit upon completion:\n${estimateData.laborSnapshotLink || ''}`;
            await sendAppEmail({
              to: crewEmail,
              subject: `Correction Required - ${estimateData.customerName || 'Client'}`,
              text,
              html: `<h3>Correction Required</h3><p>The office has returned the job for <strong>${estimateData.customerName || 'customer'}</strong> to your queue for correction/outstanding tasks.</p><p><strong>Correction Notes:</strong><br/>${notes.replace(/\n/g, '<br/>')}</p><p><a href="${estimateData.laborSnapshotLink || ''}" style="display:inline-block;background-color:#e63946;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:bold;">Open Secure Crew Job Portal</a></p>`,
              estimateData
            });
          }
        } catch (mailErr) {
          console.error('Mail notification error:', mailErr);
        }

        // Sync GHL
        try {
          await syncCustomerToGhl({
            eventType: 'returned_to_crew',
            estimate: { id: estimateId, ...estimateData },
            status: 'Returned to Crew'
          });
        } catch (ghlErr) {
          console.error('GHL sync error:', ghlErr);
        }

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'send-schedule-confirmation-request') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized: Admin or employee login required' });
        }
        if (!isWriteAdmin) {
          return res.status(403).json({ error: 'Forbidden: Admin or employee login required' });
        }
        const { estimateId, requestType } = req.body || {};
        if (!estimateId || !requestType) {
          return res.status(400).json({ error: 'Estimate ID and request type (72hr/24hr) are required' });
        }
        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }
        const estimateData = snap.data() || {};
        const nowIso = new Date().toISOString();
        const logEntry = {
          id: crypto.randomUUID(),
          event: `Schedule Confirmation Requested (${requestType})`,
          timestamp: nowIso,
          user: decoded?.email || 'Office Admin',
          notes: `Requested ${requestType} confirmation.`
        };

        await docRef.update({
          jobPortalPendingConfirmation: requestType,
          jobPortalHistory: admin.firestore.FieldValue.arrayUnion(logEntry)
        });

        // Notify Crew by Email with direct Link to Job Portal
        try {
          const crewEmail = estimateData.crewEmailRecipient || estimateData.laborContractEmailRecipient;
          if (crewEmail) {
            const text = `Hello Crew,\n\nPlease confirm your schedule availability for the planned installation starting on ${estimateData.scheduledStartDate || 'Unscheduled Date'}.\n\nAccess the secure Crew Job Portal to confirm or report conflicts:\n${estimateData.laborSnapshotLink || ''}`;
            await sendAppEmail({
              to: crewEmail,
              subject: `${requestType} Schedule Confirmation Required - ${estimateData.customerName || 'Client'}`,
              text,
              html: `<h3>Schedule Confirmation Required</h3><p>Please confirm your schedule availability for the planned installation starting on <strong>${estimateData.scheduledStartDate || 'Unscheduled Date'}</strong>.</p><p><a href="${estimateData.laborSnapshotLink || ''}" style="display:inline-block;background-color:#e63946;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:bold;">Open Crew Job Portal to Confirm</a></p>`,
              estimateData
            });
          }
        } catch (mailErr) {
          console.error('Mail notification error:', mailErr);
        }

        return res.status(200).json({ success: true });
      }

      if (req.body && req.body.action === 'send-labor-contract') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized: Admin or employee login required' });
        }
        if (!isWriteAdmin) {
          return res.status(403).json({ error: 'Forbidden: Admin or employee login required' });
        }

        const { estimateId, recipientEmail, crewName, subject, message, includeDrawing, allowCrewDirectSchedule, laborContractSnapshot } = req.body || {};

        if (!estimateId) {
          return res.status(400).json({ error: 'Estimate ID is required.' });
        }
        if (!recipientEmail) {
          return res.status(400).json({ error: 'Recipient email is required.' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }

        const estimateData = snap.data() || {};

        // Generate secure tokens if they don't already exist
        let crewScheduleToken = estimateData.crewScheduleToken || '';
        if (!crewScheduleToken) {
          try {
            crewScheduleToken = generateSecureToken();
          } catch (tokenErr: any) {
            crewScheduleToken = crypto.randomUUID();
          }
        }

        let laborSnapshotToken = estimateData.laborSnapshotToken || '';
        if (!laborSnapshotToken) {
          try {
            laborSnapshotToken = generateSecureToken();
          } catch (tokenErr: any) {
            laborSnapshotToken = crypto.randomUUID();
          }
        }

        const host = req.headers.host || 'fence-estimator-eight.vercel.app';
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const appUrl = `${protocol}://${host}`;
        const laborSnapshotLink = `${appUrl}/?portal=labor-snapshot&estimateId=${estimateId}&token=${laborSnapshotToken}`;
        const crewScheduleLink = `${appUrl}/?portal=crew-schedule&estimateId=${estimateId}&token=${crewScheduleToken}`;
        const nowIso = new Date().toISOString();

        // 1. Gather specs for the email from the laborContractSnapshot if provided
        const snapshot = laborContractSnapshot || estimateData.laborContractSnapshot || null;

        const customerName = snapshot ? snapshot.customerName : (estimateData.customerName || 'Valued Client');
        const jobAddress = snapshot ? snapshot.jobAddress : (estimateData.customerAddress || estimateData.address || 'N/A');
        const fenceType = snapshot ? (snapshot.fenceType || snapshot.woodType || 'Fence') : (estimateData.fenceType || estimateData.fenceMaterial || 'Fence');
        const linearFeet = snapshot ? snapshot.linearFeet : (estimateData.linearFeet || 0);

        const emailSubject = `New Job Dispatch - ${customerName}`;
        
        const hasVendorDocs = Array.isArray(estimateData.vendorDocuments) && estimateData.vendorDocuments.some((d: any) => d.visibleToCrew);
        const vendorDocNoticeText = hasVendorDocs 
          ? "\n\nIMPORTANT: Material pickup documents are available in the Job Portal. Please confirm all materials during pickup." 
          : "";
        const vendorDocNoticeHtml = hasVendorDocs 
          ? `<div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; padding: 16px; margin: 20px 0; font-size: 14px; color: #b45309;">
               <strong>Material Pickup Required:</strong> Material pickup documents are available in the Job Portal. Please confirm all materials during pickup.
             </div>` 
          : "";

        const hasDiagrams = !!estimateData.drawingUrl || (Array.isArray(estimateData.diagrams) && estimateData.diagrams.some((d: any) => d.visibleToCrew));
        const diagramsNoticeText = hasDiagrams 
          ? "\n\nDiagrams and site plans are available in the Job Portal." 
          : "";
        const diagramsNoticeHtml = hasDiagrams 
          ? `<p style="font-size: 15px; line-height: 1.5; font-weight: bold; color: #1e293b; margin: 16px 0;">
               Diagrams and site plans are available in the Job Portal.
             </p>` 
          : "";

        // Clean text-only body
        const emailText = `Hello ${crewName || 'Crew'},

You have been assigned a new project.

Customer:
${customerName}

Address:
${jobAddress}

Fence Type:
${fenceType}

Linear Feet:
${linearFeet}${vendorDocNoticeText}${diagramsNoticeText}

Access Secure Crew Job Portal:
${laborSnapshotLink}

Thank you,

Lone Star Fence Works`;

        // Modern, inbox-safe, professional HTML body
        const emailHtml = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; color: #1e293b;">
  <div style="text-align: center; margin-bottom: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 20px;">
    <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.025em; text-transform: uppercase;">LONE STAR FENCE WORKS</h2>
    <p style="color: #64748b; margin: 4px 0 0 0; font-size: 12px; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase;">Job Dispatch Notification</p>
  </div>
  
  <p style="font-size: 15px; line-height: 1.5; margin-top: 0;">Hello <strong>${crewName || 'Crew'}</strong>,</p>
  <p style="font-size: 15px; line-height: 1.5;">You have been assigned a new project.</p>
  ${vendorDocNoticeHtml}
  ${diagramsNoticeHtml}
  
  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin: 20px 0; font-size: 14px; line-height: 1.6;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 4px 0; font-weight: bold; color: #475569; width: 110px; vertical-align: top;">Customer:</td>
        <td style="padding: 4px 0; color: #0f172a; font-weight: 600;">${customerName}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; font-weight: bold; color: #475569; vertical-align: top;">Address:</td>
        <td style="padding: 4px 0; color: #0f172a;">${jobAddress}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; font-weight: bold; color: #475569; vertical-align: top;">Fence Type:</td>
        <td style="padding: 4px 0; color: #0f172a;">${fenceType}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; font-weight: bold; color: #475569; vertical-align: top;">Linear Feet:</td>
        <td style="padding: 4px 0; color: #0f172a; font-family: monospace;">${linearFeet} LF</td>
      </tr>
    </table>
  </div>
  
  <div style="text-align: center; margin: 24px 0;">
    <a href="${laborSnapshotLink}" style="display: inline-block; background-color: #e63946; color: #ffffff; text-decoration: none; padding: 14px 28px; font-weight: bold; font-size: 14px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(230,57,70,0.2), 0 2px 4px -1px rgba(230,57,70,0.1); text-align: center;">Open Secure Crew Job Portal</a>
  </div>
  
  <p style="font-size: 14px; color: #475569; line-height: 1.5; margin-bottom: 0;">
    Thank you,<br />
    <strong>Lone Star Fence Works</strong>
  </p>
</div>`;

        const htmlLength = emailHtml.length;
        const textLength = emailText.length;

        try {
          console.log(`[SMTP LABOR CONTRACT] Dispatching notification to: ${recipientEmail}`);
          const sendResult = await sendAppEmail({
            to: recipientEmail,
            subject: emailSubject,
            text: emailText,
            html: emailHtml,
            estimateData,
            decoded
          });

          const info = sendResult.info;
          const from = `"${sendResult.resolvedFromName}" <${sendResult.resolvedFromEmail}>`;
          const replyTo = sendResult.resolvedReplyToEmail;

          console.log("LABOR NOTIFICATION EMAIL RESULT", {
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected,
            response: info.response,
            htmlLength,
            textLength
          });

          const isAccepted = Array.isArray(info.accepted) && info.accepted.some((email: string) => email.toLowerCase() === recipientEmail.toLowerCase());

          if (!isAccepted) {
            console.error("LABOR NOTIFICATION EMAIL REJECTED BY SMTP", {
              from,
              to: recipientEmail,
              replyTo,
              envelopeFrom: info.envelope?.from,
              envelopeTo: info.envelope?.to,
              subject: emailSubject,
              textLength,
              htmlLength,
              smtpResponse: info.response,
              rejected: info.rejected
            });

            return res.status(400).json({
              success: false,
              error: "Labor notification email was not accepted for delivery",
              messageId: info.messageId,
              accepted: info.accepted || [],
              rejected: info.rejected || [],
              response: info.response,
              envelope: info.envelope,
              debugBuild: "notification-labor-dispatch-v2",
              from,
              to: recipientEmail,
              replyTo,
              envelopeFrom: info.envelope?.from || '',
              envelopeTo: info.envelope?.to || [],
              subject: emailSubject,
              textLength,
              htmlLength,
              smtpResponse: info.response
            });
          }

          // Generate snapshot and logs
          const snapshotToSave = snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;

          const logEntry = {
            recipient: recipientEmail,
            crewName: crewName || 'Crew',
            sentAt: nowIso,
            subject: emailSubject,
            includeDrawing: !!includeDrawing,
            laborSnapshotLink,
            crewScheduleLink,
            allowCrewDirectSchedule: !!allowCrewDirectSchedule,
            status: "Sent",
            scheduled: estimateData.installStatus === 'Scheduled' || estimateData.installStatus === 'Completed',
            completed: estimateData.installStatus === 'Completed',
            opened: false
          };

          const laborContractVersions = estimateData.laborContractVersions || [];
          const nextLaborVersionNumber = laborContractVersions.length + 1;
          const laborVersionId = crypto.randomUUID();

          const newLaborVersion = {
            version: nextLaborVersionNumber,
            versionId: laborVersionId,
            createdAt: nowIso,
            createdBy: decoded?.email || decoded?.uid || 'SYSTEM',
            recipient: recipientEmail,
            crewName: crewName || 'Crew',
            subject: emailSubject,
            message: message || '',
            laborContractSnapshot: snapshotToSave,
            includeDrawing: !!includeDrawing,
            crewScheduleLink: crewScheduleLink || null,
            allowCrewDirectSchedule: !!allowCrewDirectSchedule,
            status: "Sent",
            emailMessageId: info?.messageId || ''
          };

          const updates: any = {
            crewScheduleToken,
            crewScheduleTokenCreatedAt: nowIso,
            crewScheduleTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            crewScheduleAccessEnabled: true,
            crewEmailRecipient: recipientEmail,
            allowCrewDirectSchedule: !!allowCrewDirectSchedule,
            laborContractEmailSent: true,
            laborContractEmailSentAt: nowIso,
            laborContractEmailRecipient: recipientEmail,
            laborContractEmailLog: admin.firestore.FieldValue.arrayUnion(logEntry),
            laborContractVersions: [...laborContractVersions, newLaborVersion],
            latestLaborContractVersion: nextLaborVersionNumber,
            latestLaborContractVersionId: laborVersionId,
            latestLaborContractSentAt: nowIso,
            
            // New fields for labor snapshot token
            laborSnapshotToken,
            laborSnapshotTokenCreatedAt: nowIso,
            
            // Direct fields
            laborSnapshotLink,
            crewScheduleLink,
            assignedCrew: crewName || 'Crew',
            dispatchDate: nowIso,

            // New Job Portal Status & History Trackers
            jobPortalStatus: 'dispatched',
            jobPortalHistory: admin.firestore.FieldValue.arrayUnion({
              id: crypto.randomUUID(),
              event: 'Job Dispatched to Crew',
              timestamp: nowIso,
              user: decoded?.email || 'Office',
              notes: `Dispatched to ${crewName || 'Crew'} (${recipientEmail})`
            })
          };

          if (snapshotToSave) {
            snapshotToSave.laborSnapshotLink = laborSnapshotLink;
            snapshotToSave.crewScheduleLink = crewScheduleLink;
            updates.laborContractSnapshot = snapshotToSave;
          }

          await docRef.update(updates);

          // CRM Integration: Sync dispatched labor breakdown straight to Go High Level!
          try {
            console.log(`[GHL SYNC] Syncing customer to GHL for Labor Dispatched...`);
            const ghlSyncObj = {
              id: estimateId,
              estimateNumber: estimateData.estimateNumber || '',
              customerName: estimateData.customerName || '',
              customerEmail: estimateData.customerEmail || '',
              customerPhone: estimateData.customerPhone || '',
              customerAddress: estimateData.customerAddress || estimateData.address || '',
              fenceMaterial: fenceType,
              linearFeet: linearFeet,
              totalCost: estimateData.totalCost || estimateData.manualGrandTotal || 0,
              laborSnapshotLink,
              crewScheduleLink,
              assignedCrew: crewName || 'Crew',
              dispatchDate: nowIso,
            };
            
            await syncCustomerToGhl({
              eventType: 'labor_dispatched',
              estimate: ghlSyncObj,
              status: 'Labor Dispatched',
            });
            console.log(`[GHL SYNC] Successfully completed GHL sync.`);
          } catch (ghlErr) {
            console.error(`[GHL SYNC ERROR] Failed to sync to GHL during dispatch:`, ghlErr);
          }

          return res.status(200).json({
            success: true,
            messageId: info.messageId,
            accepted: info.accepted || [],
            rejected: info.rejected || [],
            response: info.response,
            envelope: info.envelope,
            htmlLength,
            textLength,
            spamSafeVersion: true,
            debugBuild: "notification-labor-dispatch-v2"
          });
        } catch (error: any) {
          console.error("LABOR SIMPLE EMAIL EXCEPTION", error);
          const resolvedFrom = error?.resolvedFromName && error?.resolvedFromEmail ? `"${error.resolvedFromName}" <${error.resolvedFromEmail}>` : '';
          const resolvedReplyTo = error?.resolvedReplyToEmail || '';
          
          return res.status(500).json({
            success: false,
            error: "Labor notification email failed",
            details: error?.message || String(error),
            code: error?.code,
            response: error?.response,
            spamSafeVersion: true,
            debugBuild: "notification-labor-dispatch-v2",
            from: resolvedFrom,
            to: recipientEmail,
            replyTo: resolvedReplyTo,
            envelopeFrom: error?.envelope?.from || '',
            envelopeTo: error?.envelope?.to || [],
            subject: emailSubject,
            textLength,
            htmlLength,
            smtpResponse: error?.response || error?.message || String(error)
          });
        }
      }

      if (false) {
        const snapshot: any = null;
        const estimateData: any = {};
        const recipientEmail: string = '';
        const crewName: string = '';
        const nowIso: string = '';
        const includeDrawing: boolean = false;
        const allowCrewDirectSchedule: boolean = false;
        const message: string = '';
        const crewScheduleLink: string = '';
        const crewScheduleToken: string = '';
        const docRef: any = null;

        let demoTotal = 0;
        let gateSummary = 'None';
        if (snapshot) {
          demoTotal = (snapshot.aggregateLaborManifest || []).some((item: any) => String(item.name).includes('Demo') || String(item.name).includes('Demolition')) ? 1 : 0;
          const gateCount = (snapshot.aggregateLaborManifest || []).filter((item: any) => String(item.name).includes('Gate')).reduce((sum: number, item: any) => sum + (item.qty || 0), 0);
          gateSummary = gateCount > 0 ? `${gateCount} Gate(s)` : 'None';
        } else {
          demoTotal = Number(estimateData.demoRemovalPrice || 0);
          gateSummary = estimateData.gateSummary || 'None';
        }

        const scheduledStartDate = estimateData.scheduledStartDate || null;
        const scheduledEndDate = estimateData.scheduledEndDate || null;
        const installDuration = estimateData.installDuration || 1;

        // 2. Build Runs Tables
        let runsTableRows = '';
        let laborTotalAmount = 0;
        let runsDetailedTablesHtml = '';

        if (snapshot && Array.isArray(snapshot.laborRuns)) {
          laborTotalAmount = typeof snapshot.totalDirectLaborPayout === 'number' ? snapshot.totalDirectLaborPayout : 0;
          
          // Build individual run-by-run sections as beautiful tables matching the style of the dashboard
          snapshot.laborRuns.forEach((run: any) => {
            const rName = run.runName || `Section`;
            const rLF = run.linearFeet !== undefined ? run.linearFeet : 0;
            const rStyle = run.styleName || '';
            const rHeight = run.height || '';
            const rType = run.styleType || '';
            
            // Generate run spec tags
            const tags: string[] = [];
            if (rHeight) tags.push(`${rHeight}' HEIGHT`);
            if (run.railCount) tags.push(`${run.railCount} RAILS`);
            if (run.hasRotBoard) tags.push(`ROT BOARD`);
            if (run.topStyle) tags.push(`${String(run.topStyle).toUpperCase()}`);
            if (run.hasTopCap) tags.push(`TOP CAP`);
            if (run.hasTrim) tags.push(`TRIM`);
            if (run.picketStyle) tags.push(`${String(run.picketStyle).toUpperCase()}`);

            const tagsHtml = tags.map(t => `
              <span style="display: inline-block; background-color: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); color: #ffffff; padding: 3px 8px; font-size: 9px; font-weight: bold; text-transform: uppercase; border-radius: 9999px; margin-right: 4px; margin-bottom: 4px; letter-spacing: 0.5px; font-family: sans-serif;">${t}</span>
            `).join('');

            // Build rows for run items
            let runRows = '';
            
            // Regular installation/demolition items
            if (Array.isArray(run.items)) {
              run.items.forEach((item: any) => {
                const itemTotal = typeof item.total === 'number' ? item.total : 0;
                const unitCost = typeof item.unitCost === 'number' ? item.unitCost : 0;
                const isDemo = String(item.name).includes('Demo') || String(item.name).includes('Demolition');
                const rowBgColor = isDemo ? '#fef2f2' : '#ffffff';
                const textColor = isDemo ? '#991b1b' : '#334155';
                
                // Detailed scope guidelines
                let detailedDesc = '';
                if (String(item.name).includes('Installation')) {
                  detailedDesc = `
                    <div style="font-weight: bold; color: #1e3a8a; font-size: 11px; margin-top: 4px; text-decoration: underline; font-family: sans-serif;">Project Specs: ${rHeight}' Tall ${rStyle} ${run.picketStyle ? `(${run.picketStyle})` : ''}</div>
                    <div style="font-size: 10px; color: #64748b; margin-top: 2px; line-height: 1.4; font-family: sans-serif;">
                      Includes: Layout, utility marking verification, digging to spec (${rHeight === 8 ? '36"' : '24"'} min depth x 8" min width), post setting in wet concrete, ${String(rStyle).includes('Pipe') || String(rType).includes('Chain') ? 'top rail installation' : (run.railCount > 0 ? `${run.railCount}x horizontal rail installation,` : '')} and picket/panel attachment.
                      ${run.picketStyle === 'Board on Board' ? '<span style="color: #b91c1c; font-weight: bold;">⚠️ BOARD ON BOARD: Pickets in back layer must have exactly 3.5" spacing.</span>' : ''}
                      ${run.hasRotBoard ? 'Includes installation of 2x6 rot board.' : ''}
                      ${run.hasTopCap ? 'Includes 2x6 top cap.' : ''}
                      ${run.hasTrim ? 'Includes trim.' : ''}
                      Must exercise full due diligence for private lines. All work level, plumb, uniform.
                    </div>
                  `;
                } else if (isDemo) {
                  detailedDesc = `
                    <div style="font-size: 10px; color: #64748b; margin-top: 2px; line-height: 1.4; font-family: sans-serif;">
                      Includes: Removal of existing fence segments, posts, and post concrete. Debris must be hauled away or staged as specified in dumpster/trailer.
                    </div>
                  `;
                } else if (String(item.name).includes('Stain')) {
                  detailedDesc = `
                    <div style="font-size: 10px; color: #64748b; margin-top: 2px; line-height: 1.4; font-family: sans-serif;">
                      Includes: Power washing/cleaning surface followed by uniform application of selected stain. No overspray authorized.
                    </div>
                  `;
                }

                runRows += `
                  <tr style="background-color: ${rowBgColor}; border-bottom: 1px solid #f1f5f9; color: ${textColor};">
                    <td style="padding: 10px; font-family: sans-serif; font-size: 13px; font-weight: bold; line-height: 1.4;">
                      ${item.name}
                      ${detailedDesc}
                    </td>
                    <td style="padding: 10px; text-align: center; font-family: sans-serif; font-size: 12px; width: 85px;">${item.qty} ${item.unit}</td>
                    <td style="padding: 10px; text-align: right; font-family: monospace; font-size: 12px; width: 80px; white-space: nowrap;">$${Number(unitCost).toFixed(2)}</td>
                    <td style="padding: 10px; text-align: right; font-family: monospace; font-size: 12px; font-weight: bold; width: 85px; white-space: nowrap;">$${Number(itemTotal).toFixed(2)}</td>
                  </tr>
                `;
              });
            }

            // Gates embedded
            if (Array.isArray(run.gates)) {
              run.gates.forEach((gate: any) => {
                if (Array.isArray(gate.items)) {
                  gate.items.forEach((gItem: any) => {
                    const gItemTotal = typeof gItem.total === 'number' ? gItem.total : 0;
                    const gUnitCost = typeof gItem.unitCost === 'number' ? gItem.unitCost : 0;
                    runRows += `
                      <tr style="background-color: #fffaf0; border-bottom: 1px solid #f1f5f9; color: #b45309;">
                        <td style="padding: 10px; font-family: sans-serif; font-size: 13px; font-weight: bold; line-height: 1.4;">
                          <span style="display: inline-block; background-color: #f59e0b; color: #ffffff; font-size: 8px; font-weight: bold; padding: 2px 5px; border-radius: 4px; text-transform: uppercase; margin-right: 6px; letter-spacing: 0.5px; font-family: sans-serif; vertical-align: middle;">GATE</span>
                          ${gItem.name}
                        </td>
                        <td style="padding: 10px; text-align: center; font-family: sans-serif; font-size: 12px; width: 85px;">${gItem.qty} ${gItem.unit}</td>
                        <td style="padding: 10px; text-align: right; font-family: monospace; font-size: 12px; width: 80px; white-space: nowrap;">$${Number(gUnitCost).toFixed(2)}</td>
                        <td style="padding: 10px; text-align: right; font-family: monospace; font-size: 12px; font-weight: bold; width: 85px; white-space: nowrap;">$${Number(gItemTotal).toFixed(2)}</td>
                      </tr>
                    `;
                  });
                }
              });
            }

            runsDetailedTablesHtml += `
              <div style="margin-top: 24px; margin-bottom: 24px; border: 2px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <!-- Run Header Block -->
                <div style="background-color: #0c1a30; color: #ffffff; padding: 16px;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="vertical-align: middle;">
                        <h3 style="margin: 0; font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; font-family: sans-serif;">${rName}</h3>
                        <p style="margin: 3px 0 0 0; font-size: 9px; font-weight: bold; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 1px; font-family: sans-serif;">${rLF} LF TOTAL • ${rStyle}</p>
                      </td>
                    </tr>
                  </table>
                  <div style="margin-top: 10px;">
                    ${tagsHtml}
                  </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                  <thead>
                    <tr style="background-color: #f8fafc; color: #64748b; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #f1f5f9;">
                      <th style="padding: 12px 10px; font-family: sans-serif;">Detailed Work Specification</th>
                      <th style="padding: 12px 10px; text-align: center; font-family: sans-serif; width: 85px;">Quantities</th>
                      <th style="padding: 12px 10px; text-align: right; font-family: sans-serif; width: 80px;">Piece Rate</th>
                      <th style="padding: 12px 10px; text-align: right; font-family: sans-serif; width: 85px;">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${runRows}
                  </tbody>
                </table>
              </div>
            `;
          });

          // Build intermediate overview list rows for "Labor Manifest & Payout Details"
          snapshot.laborRuns.forEach((run: any) => {
            const rName = run.runName || `Section`;
            const rLF = run.linearFeet !== undefined ? run.linearFeet : 0;
            const rStyle = run.styleName || '';
            
            // Calculate direct run labor total
            let runLaborTotal = 0;
            if (Array.isArray(run.items)) {
              run.items.forEach((item: any) => {
                runLaborTotal += typeof item.total === 'number' ? item.total : 0;
              });
            }
            if (Array.isArray(run.gates)) {
              run.gates.forEach((gate: any) => {
                if (Array.isArray(gate.items)) {
                  gate.items.forEach((gItem: any) => {
                    runLaborTotal += typeof gItem.total === 'number' ? gItem.total : 0;
                  });
                }
              });
            }

            runsTableRows += `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px; border: 1px solid #e2e8f0; font-family: sans-serif;">
                  <strong>${rName}</strong><br/>
                  <span style="font-size: 11px; color: #64748b;">Specs: ${rStyle} (Height: ${run.height || 6}ft)</span>
                </td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace;">${rLF} LF</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-family: monospace; font-weight: bold; color: #334155;">$${Number(runLaborTotal).toFixed(2)}</td>
              </tr>
            `;
          });

          // Build aggregate master breakdown table
          if (Array.isArray(snapshot.aggregateLaborManifest)) {
            let manifestRows = '';
            snapshot.aggregateLaborManifest.forEach((item: any) => {
              const itemTotal = typeof item.total === 'number' ? item.total : 0;
              manifestRows += `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                  <td style="padding: 12px 10px; font-family: sans-serif; font-size: 13px; font-weight: bold; color: #0c1a30;">
                    <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: #ef4444; margin-right: 8px; vertical-align: middle;"></span>
                    ${item.name}
                  </td>
                  <td style="padding: 12px 10px; text-align: center; font-family: sans-serif; width: 140px;">
                    <span style="display: inline-block; background-color: #f1f5f9; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; color: #0c1a30;">${item.qty} ${item.unit}</span>
                  </td>
                  <td style="padding: 12px 10px; text-align: right; font-family: monospace; font-size: 13px; font-weight: bold; color: #ef4444; width: 110px;">$${Number(itemTotal).toFixed(2)}</td>
                </tr>
              `;
            });

            runsDetailedTablesHtml += `
              <div style="margin-top: 32px; margin-bottom: 24px;">
                <h3 style="color: #0c1a30; font-size: 16px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; border-bottom: 3px solid #0c1a30; padding-bottom: 6px; letter-spacing: 1px; font-family: sans-serif;">Aggregate Labor Manifest</h3>
                <p style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #ef4444; margin-top: 2px; margin-bottom: 16px; letter-spacing: 1.5px; font-family: sans-serif;">Total Subcontractor Pay Breakdown</p>
                
                <div style="border: 2px solid #e2e8f0; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); background-color: #ffffff;">
                  <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                      <tr style="background-color: #f8fafc; color: #64748b; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #f1f5f9;">
                        <th style="padding: 14px 10px; font-family: sans-serif;">Operation / Task</th>
                        <th style="padding: 14px 10px; text-align: center; font-family: sans-serif; width: 140px;">Cumulative Volume</th>
                        <th style="padding: 14px 10px; text-align: right; font-family: sans-serif; width: 110px;">Total Net Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${manifestRows}
                    </tbody>
                    <tfoot>
                      <tr style="background-color: #0c1a30; color: #ffffff; font-weight: bold; font-size: 14px;">
                        <td colspan="2" style="padding: 16px 12px; text-align: right; text-transform: uppercase; font-family: sans-serif; letter-spacing: 1px; font-size: 11px;">Total Direct Labor Liability</td>
                        <td style="padding: 16px 12px; text-align: right; font-family: monospace; font-size: 18px; font-weight: bold;">$${Number(laborTotalAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            `;
          }

        } else {
          // --- FALLBACK REBUILD IN CASE SNAPSHOT IS EMPTY ---
          const runsToUse = estimateData.contractSnapshot?.costSummaryRuns || estimateData.contractSnapshot?.runs || estimateData.runs || [];
          if (Array.isArray(runsToUse) && runsToUse.length > 0) {
            runsToUse.forEach((run: any, idx: number) => {
              const rName = run.runName || run.name || `Section ${idx + 1}`;
              const rStyle = run.fenceType || run.styleName || run.style || 'Fence';
              const rLF = run.linearFeet !== undefined ? run.linearFeet : (run.netLF || 0);
              
              const fenceVal = Number(run.fenceTotal !== undefined ? run.fenceTotal : (run.totalFenceCharge || 0));
              const gateVal = Number(run.gatesTotal !== undefined ? run.gatesTotal : (run.totalGateCharge || 0));
              const demoVal = Number(run.demoTotal !== undefined ? run.demoTotal : (run.demoCharge || 0));
              const runTotal = run.sectionTotal !== undefined ? Number(run.sectionTotal) : (fenceVal + gateVal + demoVal);
              
              laborTotalAmount += runTotal;

              runsTableRows += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 10px; border: 1px solid #e2e8f0; font-family: sans-serif;">
                    <strong>${rName}</strong><br/>
                    <span style="font-size: 11px; color: #64748b;">Specs: ${rStyle} (Height: ${run.height || 6}ft)</span>
                  </td>
                  <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace;">${rLF} LF</td>
                  <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-family: monospace;">$${Number(runTotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              `;
            });
          } else {
            laborTotalAmount = estimateData.contractSnapshot?.totalInvestment || estimateData.grandTotal || 0;
            runsTableRows = `
              <tr>
                <td style="padding: 10px; border: 1px solid #e2e8f0; font-family: sans-serif;">Generic Project Scope (Calculated Labor Package)</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace;">1 Job</td>
                <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-family: monospace;">$${Number(laborTotalAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            `;
          }
        }

        // Bridge fallback into the single detailed layout container if standard snapshot isn't present
        if (!runsDetailedTablesHtml && runsTableRows) {
          runsDetailedTablesHtml = `
            <div style="margin-top: 24px; margin-bottom: 24px; border: 2px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); background-color: #ffffff;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                  <tr style="background-color: #f8fafc; color: #64748b; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #f1f5f9;">
                    <th style="padding: 12px 10px; font-family: sans-serif;">Run / Section Description</th>
                    <th style="padding: 12px 10px; text-align: center; font-family: sans-serif; width: 100px;">Length</th>
                    <th style="padding: 12px 10px; text-align: right; font-family: sans-serif; width: 120px;">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  ${runsTableRows}
                </tbody>
                <tfoot>
                  <tr style="background-color: #0c1a30; color: #ffffff; font-weight: bold; font-size: 14px;">
                    <td colspan="2" style="padding: 16px 12px; text-align: right; text-transform: uppercase; font-family: sans-serif; letter-spacing: 1px; font-size: 11px;">Total Direct Labor Liability</td>
                    <td style="padding: 16px 12px; text-align: right; font-family: monospace; font-size: 18px; font-weight: bold;">$${Number(laborTotalAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          `;
        }

        // 3. Build drawing section
        let drawingSection = '';
        const drawingUrlToUse = snapshot ? snapshot.drawingUrl : estimateData.drawingUrl;
        const drawingFileNameToUse = snapshot ? snapshot.drawingFileName : estimateData.drawingFileName;
        const drawingMimeTypeToUse = snapshot ? snapshot.drawingMimeType : estimateData.drawingMimeType;

        if (includeDrawing && drawingUrlToUse) {
          const isPdf = drawingMimeTypeToUse?.includes('pdf') || drawingUrlToUse?.toLowerCase().includes('.pdf');
          if (isPdf) {
            drawingSection = `
              <div style="margin-top: 32px; margin-bottom: 24px; padding: 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center; font-family: sans-serif;">
                <h4 style="color: #0c1a30; margin-top: 0; margin-bottom: 8px; font-size: 13px; text-transform: uppercase;">📎 PROJECT DRAWING / LAYOUT REFERENCE</h4>
                <p style="font-size: 12px; color: #475569; margin-bottom: 12px;">Reference PDF Drawing: <strong>${drawingFileNameToUse || 'layout.pdf'}</strong></p>
                <a href="${drawingUrlToUse}" target="_blank" style="background-color: #0c1a30; color: #ffffff; text-decoration: none; padding: 10px 20px; font-weight: bold; font-size: 12px; border-radius: 4px; display: inline-block;">
                  Open Reference PDF Drawing
                </a>
              </div>
            `;
          } else {
            drawingSection = `
              <div style="margin-top: 32px; margin-bottom: 24px; padding: 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center; font-family: sans-serif;">
                <h4 style="color: #0c1a30; margin-top: 0; margin-bottom: 12px; font-size: 13px; text-transform: uppercase;">🖼️ PROJECT DRAWING / LAYOUT REFERENCE</h4>
                <div style="max-width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 4px; margin: 0 auto 12px auto; background-color: #ffffff;">
                  <img src="${drawingUrlToUse}" referrerPolicy="no-referrer" alt="Project site plan or layout drawing" style="max-width: 100%; height: auto; max-height: 350px; display: block; margin: 0 auto;" />
                </div>
                <a href="${drawingUrlToUse}" target="_blank" style="font-size: 12px; font-weight: bold; color: #0c1a30; text-decoration: underline;">
                  View drawing image in new tab
                </a>
              </div>
            `;
          }
        }

        // Build SOW Directives Section
        let scopeOfWorkSection = '';
        const sowContent = (snapshot && snapshot.scopeOfWorkHtmlOrText) || estimateData.laborScope || '';
        if (sowContent) {
          scopeOfWorkSection = `
            <div style="margin-top: 32px; margin-bottom: 24px; border-top: 2px dashed #cbd5e1; padding-top: 24px;">
              <h3 style="color: #0c1a30; font-size: 16px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; border-bottom: 3px solid #0c1a30; padding-bottom: 6px; letter-spacing: 1px; font-family: sans-serif;">SUBCONTRACTOR GENERAL SCOPE OF WORK</h3>
              <p style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #ef4444; margin-top: 2px; margin-bottom: 16px; letter-spacing: 1.5px; font-family: sans-serif;">Fencing Directives & Excavation Standards</p>
              
              <div style="background-color: #fafafa; border-radius: 8px; border: 1px solid #e2e8f0; padding: 18px; font-size: 13px; line-height: 1.6; color: #334155; font-family: sans-serif; white-space: pre-wrap;">
${sowContent}
              </div>
            </div>
          `;
        }

        // Build Acknowledgment section as seen in PDF
        const signatureSection = `
          <div style="margin-top: 32px; border-top: 2px dashed #cbd5e1; padding-top: 24px; font-family: sans-serif; font-size: 13px; color: #334155;">
            <h4 style="color: #0c1a30; text-transform: uppercase; font-size: 14px; margin-bottom: 6px;">SUBCONTRACTOR ACKNOWLEDGMENT</h4>
            <p style="font-size: 12px; color: #64748b; margin-bottom: 24px;">By signing below, the subcontractor agrees to execute the work in strict accordance with the specifications, quality standards, and dimensions outlined in this Scope of Work.</p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
              <tr>
                <td style="width: 50%; padding-right: 15px; padding-bottom: 20px;">
                  <span style="font-weight: bold; display: block; margin-bottom: 30px;">Subcontractor Signature: _______________________</span>
                  <span style="font-weight: bold;">Date: _______________</span>
                </td>
                <td style="width: 50%; padding-left: 15px; padding-bottom: 20px;">
                  <span style="font-weight: bold; display: block; margin-bottom: 30px;">Project Manager Signature: _____________________</span>
                  <span style="font-weight: bold;">Date: _______________</span>
                </td>
              </tr>
            </table>
          </div>
        `;

        const emailSubject = `Estimate Update`;
        const emailHtml = `<p>Hello,</p>
<p>A Lone Star Fence Works project update is available.</p>
<p>Please contact Braden at (469) 560-6269 with any questions.</p>
<p>Thank you,<br/>Lone Star Fence Works</p>`;

        const emailText = `Hello,

A Lone Star Fence Works project update is available.

Please contact Braden at (469) 560-6269 with any questions.

Thank you,
Lone Star Fence Works`;

        const htmlLength = emailHtml.length;
        const textLength = emailText.length;

        try {
          console.log(`[SMTP LABOR CONTRACT] Dispatching to: ${recipientEmail}`);
          const sendResult = await sendAppEmail({
            to: recipientEmail,
            subject: emailSubject,
            text: emailText,
            html: emailHtml,
            estimateData,
            decoded
          });

          const info = sendResult.info;
          const from = `"${sendResult.resolvedFromName}" <${sendResult.resolvedFromEmail}>`;
          const replyTo = sendResult.resolvedReplyToEmail;

          console.log("LABOR SIMPLE EMAIL RESULT", {
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected,
            response: info.response,
            htmlLength,
            textLength
          });

          const isAccepted = Array.isArray(info.accepted) && info.accepted.some((email: string) => email.toLowerCase() === recipientEmail.toLowerCase());

          if (!isAccepted) {
            console.error("LABOR SIMPLE EMAIL REJECTED BY SMTP", {
              from,
              to: recipientEmail,
              replyTo,
              envelopeFrom: info.envelope?.from,
              envelopeTo: info.envelope?.to,
              subject: emailSubject,
              textLength,
              htmlLength,
              smtpResponse: info.response,
              rejected: info.rejected
            });

            return res.status(400).json({
              success: false,
              error: "Labor email was not accepted for delivery",
              messageId: info.messageId,
              accepted: info.accepted || [],
              rejected: info.rejected || [],
              response: info.response,
              envelope: info.envelope,
              debugBuild: "shared-email-sender-labor-test-v1",
              from,
              to: recipientEmail,
              replyTo,
              envelopeFrom: info.envelope?.from || '',
              envelopeTo: info.envelope?.to || [],
              subject: emailSubject,
              textLength,
              htmlLength,
              smtpResponse: info.response,
              smtpDiagnostic: {
                from,
                to: recipientEmail,
                replyTo,
                envelopeFrom: info.envelope?.from,
                envelopeTo: info.envelope?.to,
                subject: emailSubject,
                textLength,
                htmlLength,
                smtpResponse: info.response
              }
            });
          }

          const logEntry = {
            recipient: recipientEmail,
            crewName: crewName || 'Crew',
            sentAt: nowIso,
            subject: emailSubject,
            includeDrawing: !!includeDrawing,
            crewScheduleLink,
            allowCrewDirectSchedule: !!allowCrewDirectSchedule,
            status: "sent"
          };

          const laborContractVersions = estimateData.laborContractVersions || [];
          const nextLaborVersionNumber = laborContractVersions.length + 1;
          const laborVersionId = crypto.randomUUID();

          const newLaborVersion = {
            version: nextLaborVersionNumber,
            versionId: laborVersionId,
            createdAt: nowIso,
            createdBy: decoded?.email || decoded?.uid || 'SYSTEM',
            recipient: recipientEmail,
            crewName: crewName || 'Crew',
            subject: emailSubject,
            message: message || '',
            laborContractSnapshot: snapshot ? JSON.parse(JSON.stringify(snapshot)) : null,
            includeDrawing: !!includeDrawing,
            crewScheduleLink: crewScheduleLink || null,
            allowCrewDirectSchedule: !!allowCrewDirectSchedule,
            status: "Sent",
            emailMessageId: info?.messageId || ''
          };

          const updates: any = {
            crewScheduleToken,
            crewScheduleTokenCreatedAt: nowIso,
            crewScheduleTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            crewScheduleAccessEnabled: true,
            crewEmailRecipient: recipientEmail,
            allowCrewDirectSchedule: !!allowCrewDirectSchedule,
            laborContractEmailSent: true,
            laborContractEmailSentAt: nowIso,
            laborContractEmailRecipient: recipientEmail,
            laborContractEmailLog: admin.firestore.FieldValue.arrayUnion(logEntry),
            laborContractVersions: [...laborContractVersions, newLaborVersion],
            latestLaborContractVersion: nextLaborVersionNumber,
            latestLaborContractVersionId: laborVersionId,
            latestLaborContractSentAt: nowIso
          };

          if (snapshot) {
            const serializedSnapshot = JSON.parse(JSON.stringify(snapshot));
            serializedSnapshot.crewScheduleLink = crewScheduleLink;
            updates.laborContractSnapshot = serializedSnapshot;
          }

          await docRef.update(updates);

          return res.status(200).json({
            success: true,
            messageId: info.messageId,
            accepted: info.accepted || [],
            rejected: info.rejected || [],
            response: info.response,
            envelope: info.envelope,
            htmlLength,
            textLength,
            spamSafeVersion: true,
            debugBuild: "shared-email-sender-labor-test-v1"
          });
        } catch (error: any) {
          console.error("LABOR SIMPLE EMAIL EXCEPTION", error);
          const resolvedFrom = error?.resolvedFromName && error?.resolvedFromEmail ? `"${error.resolvedFromName}" <${error.resolvedFromEmail}>` : '';
          const resolvedReplyTo = error?.resolvedReplyToEmail || '';
          
          return res.status(500).json({
            success: false,
            error: "Labor contract email failed",
            details: error?.message || String(error),
            code: error?.code,
            response: error?.response,
            spamSafeVersion: true,
            debugBuild: "shared-email-sender-labor-test-v1",
            from: resolvedFrom,
            to: recipientEmail,
            replyTo: resolvedReplyTo,
            envelopeFrom: error?.envelope?.from || '',
            envelopeTo: error?.envelope?.to || [],
            subject: emailSubject,
            textLength,
            htmlLength,
            smtpResponse: error?.response || error?.message || String(error),
            smtpDiagnostic: {
              from: resolvedFrom,
              to: recipientEmail,
              replyTo: resolvedReplyTo,
              envelopeFrom: error?.envelope?.from || '',
              envelopeTo: error?.envelope?.to || [],
              subject: emailSubject,
              textLength,
              htmlLength,
              smtpResponse: error?.response || error?.message || String(error)
            }
          });
        }
      }

      if (req.body && req.body.action === 'send-labor-via-estimate-mailer-test') {
        if (!authHeader || !authHeader.startsWith('Bearer ') || !decoded || !decoded.uid) {
          return res.status(401).json({ error: 'Unauthorized: Admin or employee login required' });
        }
        if (!isWriteAdmin) {
          return res.status(403).json({ error: 'Forbidden: Admin or employee login required' });
        }

        const { estimateId, recipientEmail } = req.body || {};

        if (!estimateId) {
          return res.status(400).json({ error: 'Estimate ID is required.' });
        }
        if (!recipientEmail) {
          return res.status(400).json({ error: 'Recipient email is required.' });
        }

        const { docRef, snap } = await getEstimateDocRef(estimateId);
        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found' });
        }

        const estimateData = snap.data() || {};

        const emailSubject = `Estimate Update`;
        const emailHtml = `<p>Hello,</p>
<p>A Lone Star Fence Works project update is available.</p>
<p>Please contact Braden at (469) 560-6269 with any questions.</p>
<p>Thank you,<br/>Lone Star Fence Works</p>`;

        const emailText = `Hello,

A Lone Star Fence Works project update is available.

Please contact Braden at (469) 560-6269 with any questions.

Thank you,
Lone Star Fence Works`;

        const htmlLength = emailHtml.length;
        const textLength = emailText.length;

        try {
          console.log(`[SMTP LABOR TEST MAILER] Sending minimal update to: ${recipientEmail}`);
          const sendResult = await sendAppEmail({
            to: recipientEmail,
            subject: emailSubject,
            text: emailText,
            html: emailHtml,
            estimateData,
            decoded
          });

          const info = sendResult.info;
          const from = `"${sendResult.resolvedFromName}" <${sendResult.resolvedFromEmail}>`;
          const replyTo = sendResult.resolvedReplyToEmail;

          console.log("LABOR TEST EMAIL SUCCESS", info.messageId);

          const isAccepted = Array.isArray(info.accepted) && info.accepted.some((email: string) => email.toLowerCase() === recipientEmail.toLowerCase());

          if (!isAccepted) {
            console.error("LABOR TEST EMAIL REJECTED BY SMTP", {
              from,
              to: recipientEmail,
              replyTo,
              envelopeFrom: info.envelope?.from,
              envelopeTo: info.envelope?.to,
              subject: emailSubject,
              textLength,
              htmlLength,
              smtpResponse: info.response,
              rejected: info.rejected
            });

            return res.status(400).json({
              success: false,
              error: "Labor test email was not accepted for delivery",
              messageId: info.messageId,
              accepted: info.accepted || [],
              rejected: info.rejected || [],
              response: info.response,
              envelope: info.envelope,
              debugBuild: "shared-email-sender-labor-test-v1",
              from,
              to: recipientEmail,
              replyTo,
              envelopeFrom: info.envelope?.from || '',
              envelopeTo: info.envelope?.to || [],
              subject: emailSubject,
              textLength,
              htmlLength,
              smtpResponse: info.response,
              smtpDiagnostic: {
                from,
                to: recipientEmail,
                replyTo,
                envelopeFrom: info.envelope?.from,
                envelopeTo: info.envelope?.to,
                subject: emailSubject,
                textLength,
                htmlLength,
                smtpResponse: info.response
              }
            });
          }

          return res.status(200).json({
            success: true,
            messageId: info.messageId,
            accepted: info.accepted || [],
            rejected: info.rejected || [],
            response: info.response,
            envelope: info.envelope,
            debugBuild: "shared-email-sender-labor-test-v1"
          });
        } catch (error: any) {
          console.error("LABOR TEST EMAIL FAILED", error);
          const resolvedFrom = error?.resolvedFromName && error?.resolvedFromEmail ? `"${error.resolvedFromName}" <${error.resolvedFromEmail}>` : '';
          const resolvedReplyTo = error?.resolvedReplyToEmail || '';

          return res.status(500).json({
            success: false,
            error: "Labor test email failed",
            details: error?.message || String(error),
            accepted: [],
            rejected: [recipientEmail],
            response: error?.response || String(error),
            debugBuild: "shared-email-sender-labor-test-v1",
            from: resolvedFrom,
            to: recipientEmail,
            replyTo: resolvedReplyTo,
            envelopeFrom: error?.envelope?.from || '',
            envelopeTo: error?.envelope?.to || [],
            subject: emailSubject,
            textLength,
            htmlLength,
            smtpResponse: error?.response || error?.message || String(error),
            smtpDiagnostic: {
              from: resolvedFrom,
              to: recipientEmail,
              replyTo: resolvedReplyTo,
              envelopeFrom: error?.envelope?.from || '',
              envelopeTo: error?.envelope?.to || [],
              subject: emailSubject,
              textLength,
              htmlLength,
              smtpResponse: error?.response || error?.message || String(error)
            }
          });
        }
      }

      if (req.body && (req.body.action === 'reschedule-job' || req.body.action === 'create-schedule-event' || req.body.action === 'update-schedule-event')) {
        const { action, estimateId, startDate, duration, assignedCrew, notes, id: eventIdFromReq } = req.body || {};
        console.log(`[BACKEND ACTION] ${action}: estimateId=${estimateId}, startDate=${startDate}, duration=${duration}, eventId=${eventIdFromReq}`);

        if (action === 'reschedule-job' || ((action === 'update-schedule-event' || action === 'create-schedule-event') && estimateId)) {
          if (action === 'reschedule-job') {
            // No debug logs
          }
          // If duration is missing, default to 1 (common for estimate appointments)
          const finalDuration = duration || 1;
          
          if (!estimateId || !startDate) {
            return res.status(400).json({ error: 'Missing parameters: estimateId and startDate are required.' });
          }

          const { docRef, snap } = await getEstimateDocRef(estimateId);
          if (!snap.exists) {
            return res.status(404).json({ error: 'Estimate not found' });
          }
          const estimateData = snap.data() || {};
          const nowIso = new Date().toISOString();

          const scheduleEventId = eventIdFromReq || "install-" + estimateId;
          const scheduleSyncTraceId = req.body.scheduleSyncTraceId || ("trace-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9));

          // Ensure trace row exists immediately
          await logGhlActivity({
            traceId: scheduleSyncTraceId,
            estimateId,
            customerName: estimateData.customerName || '',
            status: 'running',
            action: action
          });

          // Use the JWT token for the GHL helper if body token is missing
          const jwtToken = req.headers.authorization ? req.headers.authorization.split(' ')[1] : '';
          const syncToken = req.body.token || jwtToken || estimateData.laborSnapshotToken || estimateData.crewScheduleToken || '';

          try {
            // STEP 4: Backend Router Entered (Reporting back to trace)
            await logGhlActivity({
              traceId: scheduleSyncTraceId,
              estimateId,
              customerName: estimateData.customerName || '',
              steps: [
                {
                  step: 'STEP_4',
                  label: 'Backend router entered',
                  status: 'success' as const,
                  actionMatched: action,
                  handler: 'estimates/write handler (schedule/reschedule event)',
                  timestamp: nowIso
                } as any
              ]
            });

            // Update estimate doc
            const estimateUpdates: any = {
              scheduledStartDate: startDate,
              scheduledDuration: finalDuration,
              assignedCrew: assignedCrew || estimateData.assignedCrew || 'Crew',
              status: 'Scheduled',
              jobStatus: 'Scheduled',
              updatedAt: nowIso
            };

            // Calculate reminders
            try {
              const startDateObj = new Date(startDate + 'T08:00:00');
              const rem72 = new Date(startDateObj);
              rem72.setDate(rem72.getDate() - 3);
              const rem24 = new Date(startDateObj);
              rem24.setDate(rem24.getDate() - 1);

              estimateUpdates.reminder72hrCrewAt = rem72.toISOString().split('T')[0];
              estimateUpdates.reminder24hrCrewAt = rem24.toISOString().split('T')[0];
            } catch(e) {}
            
            await docRef.update(estimateUpdates);

            // Create/Update schedule event doc
            const eventType = req.body.type || (action === 'reschedule-job' ? 'Job' : 'Estimate');
            const eventTitle = req.body.title || (eventType === 'Job' ? `Install: ${estimateData.customerName || 'Unknown'}` : `EST: ${estimateData.customerName || 'Unknown'}`);

            await db.collection('schedule_events').doc(scheduleEventId).set(sanitizeForFirestore({
              estimateId: estimateId,
              title: eventTitle,
              startDate: startDate,
              endDate: format(addDays(new Date(startDate + 'T00:00:00'), finalDuration - 1), 'yyyy-MM-dd'),
              startTime: req.body.startTime || "07:00",
              duration: finalDuration,
              assignedCrew: assignedCrew || estimateData.assignedCrew || 'Crew',
              notes: notes || '',
              type: eventType,
              updatedAt: nowIso
            }), { merge: true });

            // STEP 5: Schedule event updated
            await logGhlActivity({
              traceId: scheduleSyncTraceId,
              steps: [
                {
                  step: 'STEP_5',
                  label: 'Schedule event updated',
                  status: 'success' as const,
                  docPath: `schedule_events/${scheduleEventId}`,
                  docId: scheduleEventId,
                  fieldsWritten: {
                    startDate,
                    duration: finalDuration,
                    assignedCrew: assignedCrew || 'Crew',
                    type: eventType
                  },
                  timestamp: new Date().toISOString()
                } as any
              ]
            });

            // 3. Call shared GHL sync helper
            const calSync = await syncEstimateToGhlCalendar(
              estimateId,
              estimateData,
              startDate,
              finalDuration,
              notes || '',
              syncToken,
              scheduleSyncTraceId,
              action
            );
            // Final sync log
            await logGhlActivity({
              traceId: scheduleSyncTraceId,
              status: calSync.success ? 'success' : 'failed',
              error: calSync.error || '',
              ghlSyncDebug: calSync.ghlSyncDebug
            });

            return res.status(200).json({ 
              success: true, 
              message: 'Schedule updated and synced to GHL.',
              ghlResult: calSync,
              // Explicitly included failure details as requested
              ghlSyncSuccess: calSync.success,
              ghlSyncError: calSync.error,
              ghlSyncDebug: calSync.ghlSyncDebug,
              id: scheduleEventId
            });

          } catch (error: any) {
            console.error(`Error in ${action}:`, error);
            await logGhlActivity({
              traceId: scheduleSyncTraceId,
              status: 'failed',
              error: error.message || String(error)
            });
            return res.status(500).json({ error: `Internal server error during ${action}: ` + (error.message || String(error)) });
          }
        }

        // Default handling for other schedule events (Busy, Blackout, or generic update without estimate)
        const { id, ...eventData } = req.body;
        const evId = id || eventIdFromReq;
        if (!evId) return res.status(400).json({ error: 'Event ID is required.' });
        
        eventData.userId = eventData.userId || decoded.uid;
        await db.collection('schedule_events').doc(String(evId)).set(eventData, { merge: true });
        return res.status(200).json({ id: evId, ...eventData });
      }

      if (req.body && (req.body.action === 'delete-schedule-event' || req.method === 'DELETE')) {
        const id = req.body?.id || req.query?.id;
        const action = req.body?.action || 'delete-schedule-event';
        console.log(`[BACKEND ACTION] ${action}: id=${id}`);

        if (!id) return res.status(400).json({ error: 'Event ID is required.' });
        
        console.log(`[GHL SYNC] Attempting GHL cleanup before deleting schedule event: ${id}`);
        const cancelRes = await cancelGhlCalendarAppointmentsForSchedule(String(id));
        if (!cancelRes.success) {
          console.warn(`[GHL SYNC] GHL cleanup failed or partially failed for ${id}:`, cancelRes.error || cancelRes.results);
        }

        // If it's an install event, we should probably clear the estimate schedule fields too
        if (String(id).startsWith('install-')) {
          const estId = String(id).replace('install-', '');
          try {
            const { docRef, snap } = await getEstimateDocRef(estId);
            if (snap.exists) {
              await docRef.update({
                scheduledStartDate: null,
                scheduledEndDate: null,
                scheduledDuration: null,
                jobStatus: 'Accepted'
              });
            }
          } catch(e) {}
        }

        await db.collection('schedule_events').doc(String(id)).delete();
        return res.status(200).json({ success: true, id, cancelRes });
      }

      if (req.body && req.body.action === 'retry-ghl-cleanup') {
        const id = req.body.scheduleEventId;
        if (!id) return res.status(400).json({ error: 'Schedule Event ID is required.' });
        
        console.log(`[BACKEND ACTION] retry-ghl-cleanup: id=${id}`);
        const cancelRes = await cancelGhlCalendarAppointmentsForSchedule(String(id));
        
        if (cancelRes.success) {
          return res.status(200).json({ success: true, message: 'GHL appointments removed successfully.', results: cancelRes.results });
        } else {
          return res.status(200).json({ success: false, error: cancelRes.error || 'Partial failure during cleanup.', results: cancelRes.results });
        }
      }
      if (req.body && req.body.action === 'send') {
        const estimateId = req.body.estimateId || req.query.estimateId;
        const { customerEmail, senderEmail, subject, message } = req.body;

        if (!estimateId) {
          return res.status(400).json({ error: 'Estimate ID is required.' });
        }

        if (!customerEmail) {
          return res.status(400).json({ error: 'Customer email is required.' });
        }

        // 1. Fetch estimate from firestore using Admin SDK
        const estimateRef = db.collection('estimates').doc(String(estimateId));
        let snap = await estimateRef.get();
        let targetRef = estimateRef;

        if (!snap.exists) {
          // Seek nested user folder path
          const usersSnap = await db.collection('users').get();
          for (const uDoc of usersSnap.docs) {
            const nestedRef = db.collection('users').doc(uDoc.id).collection('estimates').doc(String(estimateId));
            const nestedSnap = await nestedRef.get();
            if (nestedSnap.exists) {
              targetRef = nestedRef;
              snap = nestedSnap;
              break;
            }
          }
        }

        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found in database.' });
        }

        let estimateData = snap.data() || {};
        const customerName = estimateData.customerName || 'Valued Customer';

        const requestEstimateDetails = req.body.estimateDetails || {};
        const pricingUpdatesFromReq = req.body.pricingUpdates || requestEstimateDetails.pricingUpdates;
        const contractSnapshotFromReq = req.body.contractSnapshot || requestEstimateDetails.contractSnapshot;

        let finalPrice = requestEstimateDetails.finalCustomerPrice || requestEstimateDetails.grandTotal || 0;
        if (pricingUpdatesFromReq && pricingUpdatesFromReq.finalCustomerPrice) {
          finalPrice = pricingUpdatesFromReq.finalCustomerPrice;
        }

        const pricingUpdates: any = {
          finalCustomerPrice: finalPrice,
          estimatedPrice: finalPrice,
          grandTotal: finalPrice,
          totalCost: finalPrice,
          total: finalPrice,
          subtotalBeforeDiscount: pricingUpdatesFromReq?.subtotalBeforeDiscount || requestEstimateDetails.subtotalBeforeDiscount || 0,
          addOnSitePrepPrice: pricingUpdatesFromReq?.addOnSitePrepPrice || requestEstimateDetails.addOnSitePrepPrice || 0,
          demoRemovalPrice: pricingUpdatesFromReq?.demoRemovalPrice || requestEstimateDetails.demoRemovalPrice || 0,
          discountAmount: pricingUpdatesFromReq?.discountAmount || requestEstimateDetails.discountAmount || 0,
          pricePerFoot: pricingUpdatesFromReq?.pricePerFoot || requestEstimateDetails.pricePerFoot || 0,
          totalInvestment: finalPrice,
          baseFencePrice: pricingUpdatesFromReq?.baseFencePrice || requestEstimateDetails.baseFencePrice || 0,
          calculatedGrandTotal: pricingUpdatesFromReq?.calculatedGrandTotal || requestEstimateDetails.calculatedGrandTotal || 0,
          pricingUpdatedAt: pricingUpdatesFromReq?.pricingUpdatedAt || new Date().toISOString(),
          contractSnapshot: contractSnapshotFromReq || requestEstimateDetails.contractSnapshot || null,
          // Sync any override arrays if passed or modified
          ...(requestEstimateDetails.manualSectionTotals ? { manualSectionTotals: requestEstimateDetails.manualSectionTotals } : {}),
          ...(requestEstimateDetails.manualGateTotals ? { manualGateTotals: requestEstimateDetails.manualGateTotals } : {}),
          ...(requestEstimateDetails.manualDemoTotals ? { manualDemoTotals: requestEstimateDetails.manualDemoTotals } : {}),
          ...(requestEstimateDetails.manualGrandTotal !== undefined ? { manualGrandTotal: requestEstimateDetails.manualGrandTotal } : {}),
          ...(requestEstimateDetails.manualGatePrices ? { manualGatePrices: requestEstimateDetails.manualGatePrices } : {}),
          updatedAt: new Date().toISOString()
        };

        const mergedEstimateData = {
          ...estimateData,
          ...pricingUpdates
        };

        const resendVersionId = req.body.resendVersionId;
        let newVersionId = '';
        let nextVersionNumber = 1;
        let estimateLink = '';
        let finalContractVersions = mergedEstimateData.contractVersions || [];

        if (resendVersionId) {
          // Resend a specific previous version
          const matchedVersion = finalContractVersions.find((v: any) => v.versionId === resendVersionId);
          if (!matchedVersion) {
            return res.status(404).json({ error: `Version matching id ${resendVersionId} was not found on this estimate.` });
          }
          newVersionId = resendVersionId;
          nextVersionNumber = matchedVersion.version;
          estimateLink = matchedVersion.estimateLink || `https://fence-estimator-eight.vercel.app/?portal=contract&estimateId=${estimateId}&versionId=${resendVersionId}`;
          
          // Use the snapshot of the resent version for placeholder generation
          estimateData = {
            ...mergedEstimateData,
            ...matchedVersion.estimateSnapshot,
            contractSnapshot: matchedVersion.contractSnapshot
          };
        } else {
          // Create new immutable contract version
          newVersionId = crypto.randomUUID();
          nextVersionNumber = finalContractVersions.length + 1;
          estimateLink = `https://fence-estimator-eight.vercel.app/?portal=contract&estimateId=${estimateId}&versionId=${newVersionId}`;
          
          // Clone properties for snapshot without nesting previous versions
          const { contractVersions: _, ...cleanEstimateSnapshot } = mergedEstimateData;
          
          const newContractVersion = {
            version: nextVersionNumber,
            versionId: newVersionId,
            createdAt: new Date().toISOString(),
            createdBy: decoded?.email || decoded?.uid || 'SYSTEM',
            estimateSnapshot: cleanEstimateSnapshot,
            contractSnapshot: contractSnapshotFromReq || cleanEstimateSnapshot.contractSnapshot || null,
            customerDecision: "pending",
            customerSignature: null,
            customerSignedAt: null,
            representativeSignature: "Braden Scott Smith",
            representativeSignedAt: new Date().toISOString(),
            emailSentAt: new Date().toISOString(),
            emailRecipient: customerEmail,
            emailMessageId: "",
            estimateLink: estimateLink,
            status: "Sent",
            drawingUrl: mergedEstimateData.drawingUrl || mergedEstimateData.drawingMapUrl || null,
            drawingFilename: mergedEstimateData.drawingFilename || null,
            drawingVersion: mergedEstimateData.drawingVersion || null
          };
          
          finalContractVersions = [...finalContractVersions, newContractVersion];
          
          // Update the top level pointer attributes
          pricingUpdates.latestContractVersion = nextVersionNumber;
          pricingUpdates.latestContractVersionId = newVersionId;
          pricingUpdates.latestContractStatus = "Sent";
          pricingUpdates.latestContractSentAt = newContractVersion.createdAt;
          pricingUpdates.contractVersions = finalContractVersions;

          estimateData = {
            ...mergedEstimateData,
            ...pricingUpdates
          };
        }

        // Write to Firestore snapshot and clean up main estimate document prior to mail setup
        await targetRef.set(pricingUpdates, { merge: true });

        // Setup access link based on hosting context
        const generatedEstimateLink = `https://fence-estimator-eight.vercel.app/?portal=contract&estimateId=${estimateId}`;

        // Resolve user's Saved SMTP and Company settings
        let resolvedSmtpHost = process.env.SMTP_HOST || 'mail.b.hostedemail.com';
        let resolvedSmtpPort = Number(process.env.SMTP_PORT) || 465;
        let resolvedSmtpSecureType = 'SSL/TLS';
        let resolvedSmtpUser = process.env.SMTP_USER;
        let resolvedSmtpPass = process.env.SMTP_PASS;
        let resolvedFromName = 'Lone Star Fence Works';
        let resolvedFromEmail = process.env.FROM_EMAIL || resolvedSmtpUser || 'BradenS@LoneStarFenceWorks.com';
        let resolvedReplyToEmail = resolvedFromEmail;
        let resolvedCompanyLogo = '';
        let resolvedCompanyPhone = '';
        let resolvedCompanyWebsite = '';
        
        // Default estimate templates:
        let mailSubject = subject || `Fence Installation Contract Agreement - Lone Star Fence Works`;
        let mailMessage = message || `Hello {customerName},\n\nWe have generated your custom fencing contract agreement estimate. Please review and sign the agreement directly on your device using the link below:\n\n{estimateLink}\n\nThank you for choosing {companyName}!\n\nBest regards,\n{companyName} Estimations Department`;

        // Try finding settings matching owner ID or dynamic candidate sequence:
        const ownerUid = estimateData.userId || estimateData.uid || estimateData.ownerId;
        const candidateUids = [];
        if (decoded && decoded.uid) candidateUids.push(decoded.uid);
        if (ownerUid && !candidateUids.includes(ownerUid)) candidateUids.push(ownerUid);
        candidateUids.push('main');

        let settingsData: any = null;
        for (const uidToTry of candidateUids) {
          try {
            const settingsSnap = await db.collection('companySettings').doc(uidToTry).get();
            if (settingsSnap.exists) {
              const possibleSettings = settingsSnap.data() || {};
              // Verify they actually configured custom SMTP credentials here
              if (possibleSettings.smtpHost && possibleSettings.smtpUsername) {
                settingsData = possibleSettings;
                console.log(`[SMTP TENANT LOG] Loaded active SMTP settings from candidate '${uidToTry}'`);
                break;
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch companySettings for candidate '${uidToTry}' in email send handler:`, err);
          }
        }

        if (settingsData) {
          if (settingsData.smtpHost) resolvedSmtpHost = settingsData.smtpHost;
          if (settingsData.smtpPort) resolvedSmtpPort = Number(settingsData.smtpPort);
          if (settingsData.smtpSecureType) resolvedSmtpSecureType = settingsData.smtpSecureType;
          if (settingsData.smtpUsername) resolvedSmtpUser = settingsData.smtpUsername;
          if (settingsData.smtpPassword) resolvedSmtpPass = settingsData.smtpPassword;
          if (settingsData.fromName) resolvedFromName = settingsData.fromName;
          if (settingsData.fromEmail) resolvedFromEmail = settingsData.fromEmail;
          resolvedReplyToEmail = settingsData.replyToEmail || resolvedFromEmail;
          resolvedCompanyLogo = settingsData.companyLogo || '';
          resolvedCompanyPhone = settingsData.companyPhone || '';
          resolvedCompanyWebsite = settingsData.companyWebsite || '';

          // Set customized templates if not overridden by dynamic subject/message
          if (!subject && settingsData.estimateEmailSubject) {
            mailSubject = settingsData.estimateEmailSubject;
          }
          if (!message && settingsData.estimateEmailBody) {
            mailMessage = settingsData.estimateEmailBody;
          }
        }

        // Replace placeholding variables inside templates
        const replacePlaceholders = (text: string) => {
          if (!text) return '';
          return text
            .replace(/{customerName}/g, customerName)
            .replace(/{customerEmail}/g, customerEmail)
            .replace(/{estimateNumber}/g, estimateData.estimateNumber || estimateId)
            .replace(/{estimateLink}/g, estimateLink)
            .replace(/{companyName}/g, resolvedFromName)
            .replace(/{companyPhone}/g, resolvedCompanyPhone || '')
            .replace(/{companyWebsite}/g, resolvedCompanyWebsite || '')
            .replace(/{measuredLinearFeet}/g, estimateData.measuredLinearFeet ? String(estimateData.measuredLinearFeet) : (estimateData.linearFeet ? String(estimateData.linearFeet) : ''));
        };

        mailSubject = replacePlaceholders(mailSubject);
        mailMessage = replacePlaceholders(mailMessage);

        let mailSent = false;
        let mailError = null;
        let errorType = 'UNKNOWN';

        try {
          const sendRes = await sendAppEmail({
            to: customerEmail,
            subject: mailSubject,
            text: mailMessage,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <div style="background-color: #0c1a30; padding: 24px; text-align: center; border-bottom: 4px solid #b91c1c;">
                  ${resolvedCompanyLogo ? `<img src="${resolvedCompanyLogo}" alt="${resolvedFromName} Logo" style="max-height: 70px; max-width: 250px; width: auto !important; height: auto !important; display: block; margin: 0 auto 12px auto;" />` : ''}
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">${resolvedFromName}</h1>
                  <p style="color: #ef4444; margin: 6px 0 0 0; font-weight: bold; letter-spacing: 4px; font-size: 11px;">ESTIMATE PORTAL AGREEMENT</p>
                </div>
                <div style="padding: 32px 24px; background-color: #ffffff;">
                  <h2 style="color: #0c1a30; font-size: 18px; margin-top: 0;">Estimate Prepared for ${customerName}</h2>
                  <div style="color: #4a5568; line-height: 1.6; font-size: 14px; white-space: pre-wrap; margin-bottom: 24px;">
    ${mailMessage.replace(estimateLink, '')}
                  </div>
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${estimateLink}" style="background-color: #0c1a30; color: #ffffff; text-decoration: none; padding: 14px 28px; font-weight: bold; font-size: 14px; border-radius: 6px; text-transform: uppercase; letter-spacing: 1px; display: inline-block; border-bottom: 3px solid #b91c1c;">
                      Review & Sign Contract Agreement
                    </a>
                  </div>
                  <p style="color: #718096; font-size: 12px; line-height: 1.5;">
                    If the button doesn't work, copy and paste the following URL into your browser's address bar:<br/>
                    <a href="${estimateLink}" style="color: #3182ce;">${estimateLink}</a>
                  </p>
                  <p style="color: #4a5568; margin-top: 24px; font-size: 14px; border-top: 1px solid #edf2f7; padding-top: 16px;">
                    Best regards,<br/>
                    <strong>${resolvedFromName}</strong><br/>
                    ${resolvedCompanyPhone ? `Phone: ${resolvedCompanyPhone}<br/>` : ''}
                    ${resolvedCompanyWebsite ? `<a href="${resolvedCompanyWebsite}" style="color: #3182ce; text-decoration: none;">${resolvedCompanyWebsite}</a>` : ''}
                  </p>
                </div>
                <div style="background-color: #f7fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #edf2f7;">
                  <p style="color: #a0aec0; font-size: 11px; margin: 0;">
                    ${resolvedFromName} &bull; Fencing Estimating Suite
                  </p>
                </div>
              </div>
            `,
            replyTo: resolvedReplyToEmail,
            category: 'manual_estimate_sent',
            estimateId,
            customerId: mergedEstimateData.customerId || '',
            estimateData,
            decoded
          });
          mailSent = true;
          console.log(`Email successfully routed in serverless handler to ${customerEmail}`);
        } catch (err: any) {
          const errorMessage = err.message || String(err);
          console.error(`[SERVERLESS SMTP/RESEND TRACE] Failure sending mail:`, err);
          errorType = 'EMAIL_DISPATCH_FAILURE';
          mailError = errorMessage;
        }

        // Record the status back in Firestore
        const now = new Date().toISOString();
        const existingLogs = estimateData.customerEmailLog || [];
        const updates: any = {
          customerEmailSent: mailSent,
          customerSentAt: mailSent ? now : (estimateData.customerSentAt || null),
          customerEmailLog: [...existingLogs, {
            sentAt: now,
            customerEmail,
            subject: mailSubject,
            senderEmail: resolvedFromEmail,
            mailSent,
            mailError,
            portalUrl: estimateLink
          }],
          updatedAt: now
        };

        if (mailSent) {
          updates.representativeSignatureName = "Braden Scott Smith";
          updates.representativeCompanyName = "Lone Star Fence Works";
          updates.representativeSignedDate = now;
          updates.customerEmailSentAt = now;
          updates.sentAt = now;
          updates.jobStatus = 'Estimate Sent';
          updates.customerDecision = 'pending';
          updates.generatedEstimateLink = generatedEstimateLink;
          updates.lastSentEstimateId = estimateId;

          // Clear previous accepted/declined state
          updates.customerSignature = null;
          updates.customerSignedDate = null;
          updates.acceptedAt = null;
          updates.declinedAt = null;
          updates.declineReason = null;
          updates.customerDeclineReason = null;

          if (estimateData.status === 'archived') {
            updates.status = 'active';
          }

          // Create status transition logging
          const getStatusLabelComp = (docData: any) => {
            if (docData.status === 'archived') return 'Archived';
            if (docData.jobStatus === 'Completed') return 'Completed';
            if (docData.jobStatus === 'Declined') return 'Declined';
            if (docData.jobStatus === 'Accepted' || docData.jobStatus === 'Approved') return 'Accepted';
            if (docData.jobStatus === 'Estimate Sent') {
              if (!docData.customerEmailSent && !docData.customerEmailSentAt) {
                return 'Draft';
              }
              return 'Estimate Sent';
            }
            return 'Draft';
          };

          const previousLabel = getStatusLabelComp(estimateData);
          const newLabel = 'Estimate Sent';

          if (previousLabel !== newLabel) {
            const changedBy = decoded?.email || decoded?.uid || 'SYSTEM';
            const historyEntry = {
              from: previousLabel,
              to: newLabel,
              changedAt: now,
              changedBy,
              source: 'send_estimate'
            };
            updates.statusHistory = [...(estimateData.statusHistory || []), historyEntry];
          }
        }

        // Update Firestore email sent log first
        await targetRef.set(updates, { merge: true });

        if (mailSent) {
          // Trigger manual_estimate_sent GHL webhook separately after database update to prevent blocking
          try {
            const manualPayload = {
              customerName: estimateData.customerName || '',
              firstName: estimateData.customerFirstName || '',
              lastName: estimateData.customerLastName || '',
              email: customerEmail || estimateData.customerEmail || '',
              phone: estimateData.customerPhone || '',
              address: estimateData.customerAddress || estimateData.customerStreet || '',
              city: estimateData.customerCity || '',
              state: estimateData.customerState || '',
              zip: estimateData.customerZip || '',
              fenceType: estimateData.fenceType || (estimateData.materials?.[0]?.fenceStyle) || 'Wood Fence',
              linearFeet: Number(estimateData.linearFeet || (estimateData.materials?.[0]?.linearFeet) || estimateData.manualLinearFeet || 0),
              estimatedPrice: Number(estimateData.totalCost || estimateData.manualGrandTotal || 0),
              estimateNumber: estimateData.estimateNumber || '',
              versionId: newVersionId || '',
              contractVersion: nextVersionNumber || 1,
              estimateLink: estimateLink,
              sentAt: now
            };
            await sendGhlWorkflowWebhook('manual_estimate_sent', manualPayload, settingsData, db, String(estimateId));
            
            // Trigger dynamic GHL API Sync for manual_estimate_sent
            try {
              await syncCustomerToGhl({
                eventType: 'manual_estimate_sent',
                estimate: { id: estimateId, ...estimateData, ...updates, latestContractVersionId: newVersionId },
                status: 'Proposed',
                source: 'manual_admin'
              });
            } catch (syncErr) {
              console.error("[GHL API SYNC] GHL API sync failed for manual estimate send:", syncErr);
            }
          } catch (ghlError) {
            console.error("GHL webhook failed, continuing email send:", ghlError);
          }
        }

        if (!mailSent) {
          return res.status(500).json({
            success: false,
            error: mailError || 'Failed to send email via SMTP.',
            errorType
          });
        }

        return res.status(200).json({
          success: true,
          mailSent,
          portalUrl: estimateLink,
          versionId: newVersionId,
          contractVersion: nextVersionNumber,
          sentAt: now,
          debugBuild: "local-ghl-helper-no-import-v1"
        });
      }

      // POST logic matches old api/estimates/save.ts
      const estimateData = { ...req.body };
      const estimateId = estimateData.id;

      // Remove ID before saving
      delete estimateData.id;

      // Always set ownership fields from JWT token, never request body
      estimateData.uid = decoded.uid;
      estimateData.userId = decoded.uid;
      estimateData.companyId = 'lonestarfence';

      const nowIso = new Date().toISOString();
      estimateData.lastModified = nowIso;
      if (!estimateData.createdAt) {
        estimateData.createdAt = nowIso;
      }
      if (!estimateData.status) {
        estimateData.status = 'active';
      }

      let savedId = estimateId;

      if (savedId) {
        const docRef = db.collection('estimates').doc(String(savedId));
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          const existingData = docSnap.data() || {};
          if (
            existingData.uid !== decoded.uid &&
            existingData.userId !== decoded.uid &&
            !isWriteAdmin
          ) {
            return res.status(403).json({ error: 'Forbidden: You do not own this estimate record' });
          }
          await docRef.set(estimateData, { merge: true });
        } else {
          await docRef.set(estimateData);
        }
      } else {
        const docRef = await db.collection('estimates').add(estimateData);
        savedId = docRef.id;
        
        // Trigger customer_created dynamic GHL sync
        try {
          await syncCustomerToGhl({
            eventType: 'customer_created',
            estimate: { id: savedId, ...estimateData },
            status: estimateData.jobStatus || 'Interested',
            source: 'manual_admin'
          });
        } catch (syncErr) {
          console.error("[GHL API SYNC] GHL API sync failing for manual created customer:", syncErr);
        }
      }

      return res.status(200).json({
        id: savedId,
        ...estimateData,
        debugBuild: "local-ghl-helper-no-import-v1"
      });

    } else if (method === 'PUT' || method === 'DELETE') {
      // Handled by unified action logic above if action is present
      if (req.body && req.body.action) {
        // Continue to common action handler
      } else if (method === 'PUT') {
        // PUT logic matches old api/estimates/update.ts
        const { id, ...updates } = req.body;

        if (!id) {
          return res.status(400).json({ error: 'Missing required field: id' });
        }

        // Special case: if scheduledStartDate is updated, trigger GHL sync
        if (updates.scheduledStartDate) {
           console.log(`[BACKEND PUT] Triggering reschedule for estimate ${id}`);
           // We can just redirect to admin-update-schedule logic internally or let it finish and trigger sync
        }

      const docRef = db.collection('estimates').doc(String(id));
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const existingData = docSnap.data() || {};
      if (
        existingData.uid !== decoded.uid &&
        existingData.userId !== decoded.uid &&
        !isWriteAdmin
      ) {
        return res.status(403).json({ error: 'Forbidden: You do not own this estimate record' });
      }

      // Set lastModified in updates
      const nowIso = new Date().toISOString();
      updates.lastModified = nowIso;

      // Do not permit client modification of user ownership parameters
      delete updates.uid;
      delete updates.userId;
      delete updates.companyId;

      const changedBy = decoded?.email || decoded?.uid || 'SYSTEM';
      const source = updates.source || 'manual_dropdown';
      delete updates.source;

      // Create a status label checker to log transition inside status_history / statusHistory
      const getStatusLabelComp = (docData: any) => {
        if (docData.status === 'archived') return 'Archived';
        if (docData.jobStatus === 'Completed') return 'Completed';
        if (docData.jobStatus === 'Declined') return 'Declined';
        if (docData.jobStatus === 'Accepted' || docData.jobStatus === 'Approved') return 'Accepted';
        if (docData.jobStatus === 'Scheduled' || docData.jobStatus === 'In Progress') return 'Scheduled';
        if (docData.jobStatus === 'Estimate Sent') {
          if (!docData.customerEmailSent && !docData.customerEmailSentAt) {
            if (docData.manualStatusOverride === true) {
              return 'Estimate Sent';
            }
            return 'Draft';
          }
          return 'Estimate Sent';
        }
        return 'Draft';
      };

      let manualWebhookTriggered = false;
      let webhookSuccessResult: boolean | null = null;

      // Handle manual status dropdown change requested by client
      if (updates.manualStatusChange) {
        const mStatus = updates.manualStatusChange;
        const previousMStatus = getStatusLabelComp(existingData);

        if (mStatus !== previousMStatus) {
          // Track that a manual webhook firing is needed
          manualWebhookTriggered = (mStatus === 'Accepted' || mStatus === 'Declined' || mStatus === 'Completed');

          if (mStatus === 'Draft') {
            updates.jobStatus = 'Draft';
            updates.customerDecision = 'none';
            updates.customerEmailSent = false;
            updates.customerEmailSentAt = null;
            updates.sentAt = null;
            updates.customerSignature = null;
            updates.customerSignedDate = null;
            updates.acceptedAt = null;
            updates.declinedAt = null;
            updates.completedAt = null;
            updates.declineReason = null;
            updates.customerDeclineReason = null;
            updates.manualStatusOverride = false;
            updates.manualStatusChangedAt = null;
            updates.manualStatusChangedBy = null;
            if (existingData.status === 'archived' || existingData.status === 'completed') {
              updates.status = 'active';
            }
          } else if (mStatus === 'Estimate Sent') {
            updates.jobStatus = 'Estimate Sent';
            updates.customerDecision = 'pending';
            updates.customerSignature = null;
            updates.customerSignedDate = null;
            updates.acceptedAt = null;
            updates.declinedAt = null;
            updates.declineReason = null;
            updates.customerDeclineReason = null;
            updates.manualStatusOverride = true;
            updates.manualStatusChangedAt = nowIso;
            updates.manualStatusChangedBy = changedBy;
            if (existingData.status === 'archived') {
              updates.status = 'active';
            }
          } else if (mStatus === 'Accepted') {
            updates.jobStatus = 'Accepted';
            updates.customerDecision = 'accepted';
            updates.acceptedAt = existingData.acceptedAt || nowIso;
            updates.source = 'manual_admin';
            updates.manualStatusOverride = true;
            updates.manualStatusChangedAt = nowIso;
            updates.manualStatusChangedBy = changedBy;
            if (existingData.status === 'archived') {
              updates.status = 'active';
            }
          } else if (mStatus === 'Declined') {
            updates.jobStatus = 'Declined';
            updates.customerDecision = 'declined';
            updates.declinedAt = existingData.declinedAt || nowIso;
            updates.source = 'manual_admin';
            updates.manualStatusOverride = true;
            updates.manualStatusChangedAt = nowIso;
            updates.manualStatusChangedBy = changedBy;
            if (existingData.status === 'archived') {
              updates.status = 'active';
            }
          } else if (mStatus === 'Scheduled') {
            updates.jobStatus = 'Scheduled';
            updates.source = 'manual_admin';
            updates.manualStatusOverride = true;
            updates.manualStatusChangedAt = nowIso;
            updates.manualStatusChangedBy = changedBy;
            if (existingData.status === 'archived') {
              updates.status = 'active';
            }
          } else if (mStatus === 'Completed') {
            updates.jobStatus = 'Completed';
            updates.status = 'completed';
            updates.completedAt = existingData.completedAt || nowIso;
            updates.source = 'manual_admin';
            updates.manualStatusOverride = true;
            updates.manualStatusChangedAt = nowIso;
            updates.manualStatusChangedBy = changedBy;
          } else if (mStatus === 'Archived') {
            updates.status = 'archived';
            updates.archivedAt = existingData.archivedAt || nowIso;
            updates.manualStatusOverride = true;
            updates.manualStatusChangedAt = nowIso;
            updates.manualStatusChangedBy = changedBy;
          }

          // Version history:
          // If the estimate has contractVersions:
          if (existingData.contractVersions && existingData.contractVersions.length > 0) {
            const contractVersions = [...(existingData.contractVersions || [])];
            let vIdx = -1;
            if (existingData.latestContractVersionId) {
              vIdx = contractVersions.findIndex((v: any) => v.versionId === existingData.latestContractVersionId);
            }
            if (vIdx === -1) {
              vIdx = contractVersions.length - 1;
            }

            if (vIdx !== -1) {
              const vObj = { ...contractVersions[vIdx] };
              const versionPrevDecision = vObj.customerDecision || 'pending';
              
              let targetDecision = vObj.customerDecision || 'pending';
              let targetStatusField = vObj.status || 'Sent';

              if (mStatus === 'Accepted') {
                targetDecision = 'accepted';
                targetStatusField = 'Accepted';
                vObj.customerSignature = vObj.customerSignature || 'Manually marked accepted by admin';
                vObj.customerSignedAt = vObj.customerSignedAt || nowIso;
                vObj.acceptedAt = vObj.acceptedAt || nowIso;
                vObj.declinedAt = null;
                vObj.customerDeclineReason = null;
                vObj.currentAccepted = true;
              } else if (mStatus === 'Declined') {
                targetDecision = 'declined';
                targetStatusField = 'Declined';
                vObj.declinedAt = vObj.declinedAt || nowIso;
                vObj.customerDeclineReason = vObj.customerDeclineReason || 'Manually marked declined by admin';
                vObj.currentAccepted = false;
              } else if (mStatus === 'Completed') {
                targetDecision = 'completed';
                targetStatusField = 'Completed';
              } else if (mStatus === 'Draft') {
                targetDecision = 'none';
                targetStatusField = 'Draft';
              } else if (mStatus === 'Estimate Sent') {
                targetDecision = 'pending';
                targetStatusField = 'Sent';
              } else if (mStatus === 'Scheduled') {
                targetDecision = 'pending';
                targetStatusField = 'Confirmed';
              } else if (mStatus === 'Archived') {
                targetDecision = 'none';
                targetStatusField = 'Archived';
              }

              vObj.customerDecision = targetDecision;
              vObj.status = targetStatusField;

              if (versionPrevDecision !== targetDecision) {
                const histEntry: any = {
                  previousDecision: versionPrevDecision,
                  newDecision: targetDecision,
                  changedAt: nowIso,
                  source: "manual_admin",
                  changedBy: changedBy
                };
                if (targetDecision === 'accepted') {
                  histEntry.customerSignature = vObj.customerSignature || 'Manually marked accepted by admin';
                } else if (targetDecision === 'declined') {
                  histEntry.declineReason = vObj.customerDeclineReason || 'Manually marked declined by admin';
                }
                vObj.decisionHistory = [...(vObj.decisionHistory || []), histEntry];
              }

              contractVersions[vIdx] = vObj;
              updates.contractVersions = contractVersions;
            }
          }

          // Save pricing fields if missing in db but submitted in req.body (Issue 1)
          const pricingFieldsToPreserve = [
            'estimatedPrice',
            'finalCustomerPrice',
            'manualGrandTotal',
            'grandTotal',
            'totalInvestment',
            'pricePerFoot',
            'linearFeet',
            'costSummaryRuns',
            'runSectionTotals',
            'selectedOptions',
            'gateSummary',
            'demoRemovalPrice',
            'addOnSitePrepPrice',
            'discountAmount'
          ];
          pricingFieldsToPreserve.forEach(field => {
            if (existingData[field] === undefined || existingData[field] === null || existingData[field] === 0 || existingData[field] === '0') {
              if (req.body[field] !== undefined && req.body[field] !== null) {
                updates[field] = req.body[field];
              }
            }
          });

          // Fire GHL webhooks if they match Accepted, Declined, or Completed:
          if (mStatus === 'Accepted' || mStatus === 'Declined' || mStatus === 'Completed') {
            const tempContractVer = updates.contractVersions || existingData.contractVersions;
            const matchedContractVersionObj = tempContractVer?.find((v: any) => v.versionId === (existingData.latestContractVersionId));
            const finalEstimateLink = matchedContractVersionObj?.estimateLink || `https://fence-estimator-eight.vercel.app/?portal=contract&estimateId=${id}&versionId=${existingData.latestContractVersionId || ''}`;

            let eventTypeLegacy: 'estimate_accepted' | 'estimate_declined' | 'estimate_completed' = 'estimate_accepted';
            let eventPayload: any = {};

            if (mStatus === 'Declined') {
              eventTypeLegacy = 'estimate_declined';
              eventPayload = {
                eventType: 'estimate_declined',
                source: 'manual_admin',
                customerDecision: 'declined',
                jobStatus: 'Declined',
                estimateId: String(id),
                versionId: String(existingData.latestContractVersionId || ''),
                estimateNumber: String(existingData.estimateNumber || ''),
                customerName: String(existingData.customerName || ''),
                firstName: String(existingData.firstName || (existingData.customerName ? existingData.customerName.split(' ')[0] : '')),
                lastName: String(existingData.lastName || (existingData.customerName ? existingData.customerName.split(' ').slice(1).join(' ') : '')),
                email: String(existingData.customerEmail || existingData.email || ''),
                phone: String(existingData.customerPhone || existingData.phone || ''),
                estimatedPrice: String(existingData.totalCost || existingData.manualGrandTotal || 0),
                declineReason: 'Manually marked declined by admin',
                declinedAt: updates.declinedAt || nowIso,
                estimateLink: finalEstimateLink
              };
            } else if (mStatus === 'Accepted') {
              eventTypeLegacy = 'estimate_accepted';
              eventPayload = {
                eventType: 'estimate_accepted',
                source: 'manual_admin',
                customerDecision: 'accepted',
                jobStatus: 'Accepted',
                estimateId: String(id),
                versionId: String(existingData.latestContractVersionId || ''),
                estimateNumber: String(existingData.estimateNumber || ''),
                customerName: String(existingData.customerName || ''),
                firstName: String(existingData.firstName || (existingData.customerName ? existingData.customerName.split(' ')[0] : '')),
                lastName: String(existingData.lastName || (existingData.customerName ? existingData.customerName.split(' ').slice(1).join(' ') : '')),
                email: String(existingData.customerEmail || existingData.email || ''),
                phone: String(existingData.customerPhone || existingData.phone || ''),
                estimatedPrice: String(existingData.totalCost || existingData.manualGrandTotal || 0),
                customerSignature: 'Manually marked accepted by admin',
                customerSignedDate: updates.acceptedAt || nowIso,
                acceptedAt: updates.acceptedAt || nowIso,
                estimateLink: finalEstimateLink
              };
            } else if (mStatus === 'Completed') {
              eventTypeLegacy = 'estimate_completed';
              eventPayload = {
                eventType: 'estimate_completed',
                source: 'manual_admin',
                jobStatus: 'Completed',
                estimateId: String(id),
                versionId: String(existingData.latestContractVersionId || ''),
                estimateNumber: String(existingData.estimateNumber || ''),
                customerName: String(existingData.customerName || ''),
                firstName: String(existingData.firstName || (existingData.customerName ? existingData.customerName.split(' ')[0] : '')),
                lastName: String(existingData.lastName || (existingData.customerName ? existingData.customerName.split(' ').slice(1).join(' ') : '')),
                email: String(existingData.customerEmail || existingData.email || ''),
                phone: String(existingData.customerPhone || existingData.phone || ''),
                estimatedPrice: String(existingData.totalCost || existingData.manualGrandTotal || 0),
                completedAt: updates.completedAt || nowIso,
                estimateLink: finalEstimateLink
              };
            }

            try {
              const resGhl = await sendGhlWorkflowWebhook(eventTypeLegacy, eventPayload, null, db, String(id));
              webhookSuccessResult = resGhl.success;

              const logEntryToSave = {
                eventType: eventTypeLegacy,
                source: 'manual_admin',
                sentAt: nowIso,
                payloadPreview: eventPayload,
                success: resGhl.success,
                responseStatus: resGhl.status || (resGhl.success ? 200 : 500),
                error: resGhl.success ? null : (resGhl.error || 'Webhook returned non-OK status')
              };

              updates.lastGhlWebhookEvent = eventTypeLegacy;
              updates.lastGhlWebhookSentAt = nowIso;
              if (eventTypeLegacy === 'estimate_declined') {
                updates.declinedWebhookSent = resGhl.success;
              } else if (eventTypeLegacy === 'estimate_accepted') {
                updates.acceptedWebhookSent = resGhl.success;
              } else if (eventTypeLegacy === 'estimate_completed') {
                updates.completedWebhookSent = resGhl.success;
              }

              const existingGhlLogs = existingData.ghlWebhookLog || [];
              updates.ghlWebhookLog = [...existingGhlLogs, logEntryToSave];
            } catch (err: any) {
              console.error(`Error sending GHL webhook for status ${mStatus}:`, err);
              webhookSuccessResult = false;
              const logEntryToSave = {
                eventType: eventTypeLegacy,
                source: 'manual_admin',
                sentAt: nowIso,
                payloadPreview: eventPayload,
                success: false,
                responseStatus: 500,
                error: err.message || 'Error occurred during fetch dispatch'
              };
              updates.lastGhlWebhookEvent = eventTypeLegacy;
              updates.lastGhlWebhookSentAt = nowIso;
              if (eventTypeLegacy === 'estimate_declined') {
                updates.declinedWebhookSent = false;
              } else if (eventTypeLegacy === 'estimate_accepted') {
                updates.acceptedWebhookSent = false;
              } else if (eventTypeLegacy === 'estimate_completed') {
                updates.completedWebhookSent = false;
              }

              const existingGhlLogs = existingData.ghlWebhookLog || [];
              updates.ghlWebhookLog = [...existingGhlLogs, logEntryToSave];
            }
          }

          // Trigger continuous direct GHL API Sync for manual status changes (Issue 3 / Req 5)
          const statusesToSyncDirect = ['Estimate Sent', 'Accepted', 'Declined', 'Completed', 'Scheduled', 'Archived'];
          if (statusesToSyncDirect.includes(mStatus)) {
            let directEventType = '';
            if (mStatus === 'Estimate Sent') directEventType = 'manual_estimate_sent';
            else if (mStatus === 'Accepted') directEventType = 'estimate_accepted';
            else if (mStatus === 'Declined') directEventType = 'estimate_declined';
            else if (mStatus === 'Completed') directEventType = 'estimate_completed';
            else if (mStatus === 'Scheduled') directEventType = 'job_scheduled';
            else if (mStatus === 'Archived') directEventType = 'estimate_archived';

            try {
              const syncRes = await syncCustomerToGhl({
                eventType: directEventType,
                estimate: { id, ...existingData, ...updates },
                status: mStatus,
                source: 'manual_admin'
              });
              if (syncRes && syncRes.success && syncRes.ghlContactId) {
                updates.ghlContactId = syncRes.ghlContactId;
              }
            } catch (syncErr) {
              console.error("[GHL API SYNC] manualStatusChange CRM API sync failing:", syncErr);
            }
          }
        }

        delete updates.manualStatusChange;
      }

      // If status is archived and we change to something else, reset status to active
      if (existingData.status === 'archived' && updates.status !== 'archived' && (updates.jobStatus || updates.status)) {
        if (updates.status !== 'completed') {
          updates.status = 'active';
        }
      }

      const previousLabel = getStatusLabelComp(existingData);
      const newLabel = getStatusLabelComp({ ...existingData, ...updates });

      if (previousLabel !== newLabel) {
        const historyEntry = {
          from: previousLabel,
          to: newLabel,
          changedAt: nowIso,
          changedBy,
          source
        };
        updates.statusHistory = [...(existingData.statusHistory || []), historyEntry];
      }

      const previousStatus = existingData.jobStatus;
      const newStatus = updates.jobStatus;

      await docRef.update(updates);

      // Trigger webhooks for job status transitions handled by PUT (only if not already manually triggered)
      if (!manualWebhookTriggered && newStatus && newStatus !== previousStatus) {
        const eventPayload = {
          customerName: existingData.customerName || '',
          email: existingData.customerEmail || '',
          phone: existingData.customerPhone || '',
          address: existingData.customerAddress || '',
          fenceType: existingData.fenceType || (existingData.materials?.[0]?.fenceStyle) || 'Wood Fence',
          linearFeet: Number(existingData.linearFeet || (existingData.materials?.[0]?.linearFeet) || existingData.manualLinearFeet || 0),
          estimatedPrice: Number(existingData.totalCost || existingData.manualGrandTotal || 0),
          finalPrice: Number(updates.finalPrice || existingData.totalCost || existingData.manualGrandTotal || 0),
          estimateNumber: existingData.estimateNumber || '',
          customerSignature: existingData.customerSignature || 'Digitally Signed',
          customerSignedDate: existingData.customerDecisionDate || nowIso,
          acceptedAt: existingData.customerDecisionDate || nowIso,
          declinedAt: existingData.customerDecisionDate || nowIso,
          declineReason: existingData.customerDeclineReason || 'Not specified'
        };

        const ownerUid = existingData.userId || existingData.uid || existingData.ownerId || (decoded && decoded.uid);

        if (newStatus === 'Completed') {
          sendGhlWorkflowWebhook('estimate_completed', eventPayload, null, db, String(id)).catch(err => {
            console.error('Triggering estimate_completed webhook failed:', err);
          });
        } else if (newStatus === 'Accepted') {
          sendGhlWorkflowWebhook('estimate_accepted', eventPayload, null, db, String(id)).catch(err => {
            console.error('Triggering estimate_accepted webhook failed:', err);
          });
        } else if (newStatus === 'Declined') {
          sendGhlWorkflowWebhook('estimate_declined', eventPayload, null, db, String(id)).catch(err => {
            console.error('Triggering estimate_declined webhook failed:', err);
          });
        }
      }

      return res.status(200).json({
        id,
        ...existingData,
        ...updates,
        webhookSuccess: webhookSuccessResult,
        debugBuild: "local-ghl-helper-no-import-v1"
      });

    } else if (method === 'DELETE') {
      const action = req.body?.action || req.query?.action;
      if (action === 'delete-schedule-event') {
        const id = req.body?.id || req.query?.id;
        if (!id) {
          return res.status(400).json({ error: 'Event ID is required.' });
        }
        await db.collection('schedule_events').doc(String(id)).delete();
        return res.status(200).json({ success: true });
      }

      // DELETE logic matches old api/estimates/delete.ts
      const estimateId = req.query.id || req.body.id;

      if (!estimateId) {
        return res.status(400).json({ error: 'Missing required field: id' });
      }

      const docRef = db.collection('estimates').doc(String(estimateId));
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const existingData = docSnap.data() || {};
      if (
        existingData.uid !== decoded.uid &&
        existingData.userId !== decoded.uid &&
        !isWriteAdmin
      ) {
        return res.status(403).json({ error: 'Forbidden: You do not own this estimate record' });
      }

      await docRef.delete();

      return res.status(200).json({
        success: true,
        message: 'Estimate successfully deleted',
        id: estimateId
      });
    }

  }
} catch (error: any) {
    console.error('Error in estimate handler:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
