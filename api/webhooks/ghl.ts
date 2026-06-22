import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const CUSTOM_DB_ID = 'ai-studio-326159a1-d34a-4219-9e8c-edc19a926edb';
const BRADEN_UID = 'braden-lonestar-uid';

if (admin.apps.length === 0) {
  const firebaseConfigEnv = process.env.FIREBASE_CONFIG;
  if (firebaseConfigEnv) {
    try {
      const parsedConfig = JSON.parse(firebaseConfigEnv);
      if (parsedConfig.private_key || parsedConfig.client_email) {
        admin.initializeApp({ credential: admin.credential.cert(parsedConfig) });
      } else {
        admin.initializeApp({ projectId: parsedConfig.projectId || 'dazzling-card-485210-r8' });
      }
    } catch (error) {
      admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
    }
  } else {
    admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
  }
}

const db = getFirestore(admin.app(), CUSTOM_DB_ID);

interface SendAppEmailArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  category?: string;
  estimateId?: string;
  customerId?: string;
  customSettingsData?: any;
}

function parseEmailList(emailInput: any): string[] {
  if (!emailInput) return [];
  if (Array.isArray(emailInput)) {
    return emailInput.map((e) => String(e).trim()).filter(Boolean);
  }
  return String(emailInput).split(',').map((e: any) => e.trim()).filter(Boolean);
}

async function sendAppEmail({
  to,
  subject,
  text,
  html,
  replyTo,
  cc,
  bcc,
  category,
  estimateId,
  customerId,
  customSettingsData
}: SendAppEmailArgs) {
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

  let settingsData = customSettingsData || {};

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

  if (settingsData && settingsData.replyToEmail && settingsData.replyToEmail.trim()) {
    const dbReply = settingsData.replyToEmail.trim();
    if (!isExcludedReplyTo(dbReply)) {
      finalReplyTo = dbReply;
      isReplyToConfigured = true;
    }
  }

  if (!isReplyToConfigured && replyTo && replyTo.trim()) {
    const argReply = replyTo.trim();
    if (!isExcludedReplyTo(argReply)) {
      finalReplyTo = argReply;
      isReplyToConfigured = true;
    }
  }

  if (isReplyToConfigured && finalReplyTo) {
    resolvedReplyToEmail = finalReplyTo;
  } else if (adminNotificationEmail && adminNotificationEmail.trim() && !isExcludedReplyTo(adminNotificationEmail)) {
    resolvedReplyToEmail = adminNotificationEmail.trim();
  } else {
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

  const estId = estimateId || '';
  const custId = customerId || '';
  const activeProvider = (emailProvider === 'resend' && resendApiKey) ? 'resend' : 'smtp';

  console.log(`[sendAppEmail Webhook] Dispatching using active provider: ${activeProvider}`);

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
      console.error('[sendAppEmail Webhook Resend Error]', err);
    }
  } else {
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
        const nodemailer = await import('nodemailer');
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
        console.error('[sendAppEmail Webhook SMTP Error]', err);
      }
    }
  }

  // Log in firestore ghlWebhookLogs
  try {
    await db.collection('ghlWebhookLogs').add({
      type: 'email_dispatched',
      estimateId: estId,
      customerId: custId,
      provider: activeProvider,
      success,
      error: activeError,
      messageId: resendMessageId || (smtpInfo ? smtpInfo.messageId : ''),
      sentAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[GHL Webhook Log Error] Failed to write dispatch transaction:', err);
  }

  return { success, error: activeError, messageId: resendMessageId };
}

async function sendGhlWorkflowWebhook(
  eventType: 'instant_estimate_submitted' | 'manual_estimate_sent' | 'estimate_accepted' | 'estimate_completed' | 'estimate_declined',
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

    let webhookUrl = '';
    if (eventType === 'instant_estimate_submitted') {
      webhookUrl = settings.ghlWebhookInstantEstimateSubmitted || settings.gohighlevelWebhookUrl || settings.ghlWebhookUrl;
    } else if (eventType === 'manual_estimate_sent') {
      webhookUrl = settings.ghlWebhookManualEstimateSent;
    } else if (eventType === 'estimate_accepted') {
      webhookUrl = settings.ghlWebhookEstimateAccepted;
    } else if (eventType === 'estimate_completed') {
      webhookUrl = settings.ghlWebhookEstimateCompleted;
    } else if (eventType === 'estimate_declined') {
      webhookUrl = settings.ghlWebhookEstimateDeclined;
    }

    if (!webhookUrl) {
      console.log(`Webhook URL for event type ${eventType} is blank. Skipping GHL webhook trigger.`);
      return { success: true, error: 'Skipped: webhook URL not configured.' };
    }

    let finalPayload: any = { eventType };

    if (eventType === 'instant_estimate_submitted') {
      finalPayload = {
        ...finalPayload,
        leadSource: 'Instant Estimator',
        firstName: payloadData.firstName || '',
        lastName: payloadData.lastName || '',
        email: payloadData.email || '',
        phone: formatPhoneForGHL(payloadData.phone || ''),
        address: payloadData.address || '',
        city: payloadData.city || '',
        state: payloadData.state || '',
        zip: payloadData.zip || '',
        fenceType: payloadData.fenceType || '',
        height: payloadData.height || '',
        linearFeet: Number(payloadData.linearFeet || 0),
        gateCount: Number(payloadData.gateCount || 0),
        estimatedPrice: Number(payloadData.estimatedPrice || 0),
        jobStatus: 'Interested',
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
        jobStatus: 'Accepted'
      };
    } else if (eventType === 'estimate_completed') {
      finalPayload = {
        ...finalPayload,
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
        ...finalPayload,
        customerName: payloadData.customerName || `${payloadData.firstName || ''} ${payloadData.lastName || ''}`.trim(),
        email: payloadData.email || '',
        phone: formatPhoneForGHL(payloadData.phone || ''),
        address: payloadData.address || '',
        fenceType: payloadData.fenceType || '',
        linearFeet: Number(payloadData.linearFeet || 0),
        estimatedPrice: Number(payloadData.estimatedPrice || 0),
        estimateId: estimateId || payloadData.estimateId || '',
        estimateNumber: payloadData.estimateNumber || '',
        declinedAt: payloadData.declinedAt || new Date().toISOString(),
        declineReason: payloadData.declineReason || 'Not specified',
        jobStatus: 'Declined'
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
      await saveWebhookLogToEstimate(firestoreDb, estimateId, logEntry);
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
      await saveWebhookLogToEstimate(firestoreDb, estimateId, logEntry);
    }
    return { success: false, error: err.message };
  }
}

export async function sendGhlWebhook(
  eventType: 'instant_estimate_submitted' | 'manual_estimate_sent' | 'estimate_accepted' | 'estimate_completed' | 'estimate_declined',
  estimateId: string,
  payloadData: any,
  firestoreDb: any,
  ownerUid?: string
): Promise<{ success: boolean; url?: string; status?: number; error?: string }> {
  const settingsData = { ownerUid, userId: ownerUid, uid: ownerUid };
  return sendGhlWorkflowWebhook(eventType, { ...payloadData, ...settingsData }, null, firestoreDb, estimateId);
}

async function saveWebhookLogToEstimate(firestoreDb: any, estimateId: string, logEntry: any) {
  if (!estimateId) return;
  try {
    const rootRef = firestoreDb.collection('estimates').doc(String(estimateId));
    let targetRef = rootRef;
    const snap = await rootRef.get();
    let exists = snap.exists;

    if (!exists) {
      // Find nested
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

// Helpers for Data Normalization
function normalizePhone(p: string | null | undefined): string {
  if (!p) return '';
  const cleaned = p.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  return cleaned ? `+${cleaned}` : '';
}

function normalizeEmail(e: string | null | undefined): string {
  if (!e) return '';
  return e.trim().toLowerCase();
}

function splitName(fullName: string | null | undefined) {
  if (!fullName) return { firstName: '', lastName: '', customerName: '' };
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
  return {
    firstName,
    lastName,
    customerName: trimmed
  };
}

async function resolveCrewRecipient(data: any, activeSettings: any, dbInstance: any): Promise<{ email: string; source: 'estimate_specific' | 'primary_crew_contact' | 'admin_fallback' | 'hardcoded_fallback' }> {
  // 1st: estimate.crewEmailRecipient if set
  if (data?.crewEmailRecipient && data.crewEmailRecipient.trim()) {
    return {
      email: data.crewEmailRecipient.trim(),
      source: 'estimate_specific'
    };
  }

  // 2nd: Primary Crew Contact email from Manage Employees
  try {
    const employeesSnap = await dbInstance.collection('employees').where('isPrimaryCrewContact', '==', true).get();
    if (employeesSnap && !employeesSnap.empty) {
      let primaryContact: any = null;
      employeesSnap.forEach((doc: any) => {
        const emp = doc.data() || {};
        const email = (emp.email || '').trim();
        const isActive = emp.isActive !== false;
        if (email && isActive) {
          primaryContact = emp;
        }
      });

      if (primaryContact) {
        return {
          email: primaryContact.email.trim(),
          source: 'primary_crew_contact'
        };
      }
    }
  } catch (err) {
    console.error('[resolveCrewRecipient] Failed to query primary crew contact:', err);
  }

  // 3rd: company replyToEmail/adminNotificationEmail fallback
  const adminEmail = activeSettings?.replyToEmail || activeSettings?.adminNotificationEmail;
  if (adminEmail && adminEmail.trim()) {
    return {
      email: adminEmail.trim(),
      source: 'admin_fallback'
    };
  }

  // 4th: hardcoded fallback
  return {
    email: 'bradens@lonestarfenceworks.com',
    source: 'hardcoded_fallback'
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-lsfw-webhook-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const startProcessingTime = Date.now();

  try {
    const body = req.body || {};
    const query = req.query || {};

    // PART 3 - Security Shared Secret
    // If ghlInboundWebhookSecret is configured in any companySettings, validate the secret
    let matchedSettings: any = null;
    let secretValidated = false;
    try {
      const settingsSnap = await db.collection('companySettings').get();
      let hasAnySecretConfigured = false;
      const reqSecret = (query.secret || req.headers?.['x-lsfw-webhook-secret'] || '').toString().trim();

      settingsSnap.forEach(doc => {
        const data = doc.data() || {};
        if (data.ghlInboundWebhookSecret && data.ghlInboundWebhookSecret.trim()) {
          hasAnySecretConfigured = true;
          if (data.ghlInboundWebhookSecret.trim() === reqSecret) {
            matchedSettings = data;
            secretValidated = true;
          }
        }
      });

      if (hasAnySecretConfigured && !matchedSettings) {
        console.warn('Inbound GHL Webhook rejected: Unauthorized secret.');
        
        // Log unauthorized attempt to unified logger
        const logRef = db.collection('ghlWebhookLogs').doc();
        await logRef.set({
          id: logRef.id,
          timestamp: new Date().toISOString(),
          eventType: 'unauthorized-webhook',
          direction: 'inbound',
          customerName: 'Anonymous Attempt',
          customerEmail: '',
          matchedBy: 'none',
          duration: Date.now() - startProcessingTime,
          result: 'Failed',
          httpStatus: 401,
          errorMessage: 'Unauthorized: Invalid or missing webhook secret.',
          firestoreDocId: null
        });

        return res.status(401).json({ error: 'Unauthorized: Invalid or missing webhook secret.' });
      } else if (!hasAnySecretConfigured) {
        secretValidated = true; // No secret is configured, so verification is automatically skipped / passed
      }
    } catch (secError) {
      console.warn('Could not complete security secret check:', secError);
    }

    // Determine Action & Inbound vs Outbound
    const rawAction = (body.eventType || body.action || query.action || '').toString().trim();
    let mappedAction = rawAction;
    const ghlType = body.type || '';
    const workflowName = body.workflow?.name || body.workflowName || '';

    // Detect if this is an inbound contact creation or sync event from GHL
    const isGhlInboundTrigger = 
      ghlType === 'contactCreate' || ghlType === 'contactUpdate' || ghlType === 'appointmentCreate' ||
      rawAction === 'contactCreate' || rawAction === 'contactUpdate' || rawAction === 'appointmentCreate' ||
      !!(body.contact_id || body.contactId || (body.id && body.contact_type) || (body.customData && (body.customData.contact_id || body.customData.id)) || body.contact?.id);

    if (ghlType === 'contactCreate' || rawAction === 'contactCreate') {
      mappedAction = 'inbound-contact-created';
    } else if (ghlType === 'contactUpdate' || rawAction === 'contactUpdate') {
      mappedAction = 'inbound-contact-updated';
    } else if (ghlType === 'appointmentCreate' || rawAction === 'appointmentCreate') {
      mappedAction = 'inbound-appointment-created';
    } else if (isGhlInboundTrigger) {
      if (workflowName.toLowerCase().includes('create') || workflowName.toLowerCase().includes('new')) {
        mappedAction = 'inbound-contact-created';
      } else if (workflowName.toLowerCase().includes('appointment') || workflowName.toLowerCase().includes('schedule')) {
        mappedAction = 'inbound-appointment-created';
      } else {
        mappedAction = 'inbound-contact-updated';
      }
    }

    const isInbound = [
      'inbound-contact-created',
      'inbound-contact-updated',
      'inbound-appointment-created'
    ].includes(mappedAction);

    if (isInbound) {
      const parsedAppointmentId = (body.appointmentId || body.appointment_id || body.id || '').toString().trim();
      const parsedCalendarId = (body.calendarId || body.calendar_id || '').toString().trim();
      const isAppointmentWebhook = !!(parsedAppointmentId || parsedCalendarId) || mappedAction === 'inbound-appointment-created';

      if (isAppointmentWebhook) {
        console.info(`Processing Inbound Appointment Webhook: ${parsedAppointmentId}`);

        const contactId = (body.contactId || body.contact_id || body.contact?.id || '').toString().trim();
        const customerName = (body.customerName || body.customer_name || body.name || '').toString().trim();
        const email = (body.email || body.customer_email || '').toString().trim();
        const phone = (body.phone || body.customer_phone || '').toString().trim();
        const estimateId = (body.estimateId || body.estimate_id || '').toString().trim();
        const estimateNumber = (body.estimateNumber || body.estimate_number || '').toString().trim();
        const appointmentId = parsedAppointmentId;
        const calendarId = parsedCalendarId;
        const appointmentStartTime = (body.appointmentStartTime || body.appointment_start_time || '').toString().trim();
        const appointmentEndTime = (body.appointmentEndTime || body.appointment_end_time || '').toString().trim();
        const appointmentStatus = (body.appointmentStatus || body.appointment_status || '').toString().trim();
        const appointmentTitle = (body.appointmentTitle || body.appointment_title || '').toString().trim();
        const appointmentSource = (body.appointmentSource || body.appointment_source || 'GHL Install Calendar').toString().trim();

        const normalizedEmail = normalizeEmail(email);
        const normalizedPhone = normalizePhone(phone);

        // Fetch company settings for matching rules and features configurations
        let activeSettings = matchedSettings;
        if (!activeSettings) {
          const bradenDoc = await db.collection('companySettings').doc('braden-lonestar-uid').get();
          activeSettings = bradenDoc.exists ? bradenDoc.data() : {};
        }

        const requireEstimateMatching = activeSettings.requireEstimateIdMatching === true;
        const allowFallback = activeSettings.allowFallbackMatching !== false;

        let foundEstimateRef: any = null;
        let foundEstimateData: any = null;
        let matchedBySourceStr = '';

        const retrieveEstimate = async (idVal: string) => {
          let docRef = db.collection('estimates').doc(idVal);
          let s = await docRef.get();
          if (s.exists) return { ref: docRef, snap: s };
          
          const usersSnap = await db.collection('users').get();
          for (const uDoc of usersSnap.docs) {
            const nestedRef = db.collection('users').doc(uDoc.id).collection('estimates').doc(idVal);
            const nestedSnap = await nestedRef.get();
            if (nestedSnap.exists) {
              return { ref: nestedRef, snap: nestedSnap };
            }
          }
          return null;
        };

        const findEstimateByField = async (field: string, val: string) => {
          const rootSnap = await db.collection('estimates').where(field, '==', val).limit(1).get();
          if (!rootSnap.empty) {
            return { ref: rootSnap.docs[0].ref, snap: rootSnap.docs[0] };
          }
          const usersSnap = await db.collection('users').get();
          for (const uDoc of usersSnap.docs) {
            const subSnap = await db.collection('users').doc(uDoc.id).collection('estimates').where(field, '==', val).limit(1).get();
            if (!subSnap.empty) {
              return { ref: subSnap.docs[0].ref, snap: subSnap.docs[0] };
            }
          }
          return null;
        };

        // 1. Match by estimateId first if provided
        if (estimateId) {
          const res = await retrieveEstimate(estimateId);
          if (res) {
            foundEstimateRef = res.ref;
            foundEstimateData = res.snap.data() || {};
            matchedBySourceStr = 'estimateId';
          }
        }

        // 2. Fallbacks if allowed
        if (!foundEstimateRef && !requireEstimateMatching) {
          if (contactId) {
            const res = await findEstimateByField('ghlContactId', contactId);
            if (res) {
              foundEstimateRef = res.ref;
              foundEstimateData = res.snap.data() || {};
              matchedBySourceStr = 'ghlContactId';
            }
          }

          if (!foundEstimateRef && allowFallback && normalizedEmail) {
            const res = await findEstimateByField('customerEmail', normalizedEmail);
            if (res) {
              foundEstimateRef = res.ref;
              foundEstimateData = res.snap.data() || {};
              matchedBySourceStr = 'email';
            }
          }

          if (!foundEstimateRef && allowFallback && normalizedPhone) {
            const res = await findEstimateByField('customerPhone', normalizedPhone);
            if (res) {
              foundEstimateRef = res.ref;
              foundEstimateData = res.snap.data() || {};
              matchedBySourceStr = 'phone';
            }
          }
        }

        if (!foundEstimateRef) {
          console.warn(`[GHL APPOINTMENT WEBHOOK] Matched estimate not found for appointment ${appointmentId}`);
          return res.status(200).json({
            success: false,
            error: 'No matching estimate found according to scheduling rules.',
            appointmentId
          });
        }

        const estId = foundEstimateRef.id;
        const data = foundEstimateData;

        // Perform Firestore update transaction
        const nowIso = new Date().toISOString();

        // 1. Determine if this incoming webhook represents an appointment cancellation
        const appointmentStatusLower = appointmentStatus.toLowerCase();
        const isCancellation = 
          ['cancelled', 'deleted', 'no-show', 'noshow', 'no_show', 'no-show', 'no show'].includes(appointmentStatusLower) ||
          rawAction.toLowerCase().includes('cancel') ||
          rawAction.toLowerCase().includes('delete') ||
          rawAction.toLowerCase().includes('noshow') ||
          rawAction.toLowerCase().includes('no show') ||
          workflowName.toLowerCase().includes('cancel') ||
          workflowName.toLowerCase().includes('delete') ||
          workflowName.toLowerCase().includes('noshow') ||
          body.action?.toLowerCase().includes('cancel') ||
          body.action?.toLowerCase().includes('delete');

        const existingHistory = data.schedulingHistory || [];
        const eventId = appointmentId || `ghl-evt-${estId}`;

        if (isCancellation) {
          console.info(`[GHL APPOINTMENT WEBHOOK] Processing cancellation event for estimate ${estId}. Status: ${appointmentStatus}`);
          
          const oldDateVal = data.confirmedInstallDate || data.preferredInstallDate || '';
          
          const cancellationHistoryEntry = {
            action: 'Appointment cancelled',
            source: 'GHL Calendar',
            actor: 'GHL CRM',
            oldValue: oldDateVal,
            newValue: null,
            notes: `Inbound cancellation/deletion from GHL. Status: ${appointmentStatus}. Title: ${appointmentTitle}`,
            timestamp: nowIso
          };

          const estimateUpdates = {
            installStatus: 'Cancelled',
            jobStatus: 'Cancelled',
            confirmedInstallDate: null,
            preferredInstallDate: null,
            schedulingHistory: [...existingHistory, cancellationHistoryEntry],
            updatedAt: nowIso
          };

          await foundEstimateRef.update(estimateUpdates);

          // Delete the schedule_event document so it doesn't show as Scheduled anymore
          await db.collection('schedule_events').doc(eventId).delete().catch((err) => {
            console.warn(`[GHL APPOINTMENT WEBHOOK] Failed to delete schedule_event: ${err.message}`);
          });

          // If crew has already been notified, dispatch cancellation email
          const crewNotified = !!(data.crewEmailRecipient && (data.installStatus === 'Pending Crew Confirmation' || data.installStatus === 'Scheduled'));
          if (crewNotified) {
            const resolvedInfo = await resolveCrewRecipient(data, activeSettings, db);
            const recipientEmail = resolvedInfo.email;
            const recipientSource = resolvedInfo.source;
            console.info(`[CREW CANCELLATION DISPATCH] Resolved recipient to ${recipientEmail} via source: ${recipientSource}`);
            const customerNameVal = data.customerName || customerName || 'Valued Client';
            const jobAddressVal = data.customerAddress || data.address || 'N/A';
            const eNo = data.estimateNumber || estimateNumber || '';

            const crewSubject = `[LSFW Crew Dispatch] CANCELLATION: Job Est #${eNo} for ${customerNameVal}`;
            const crewHtml = `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a202c; line-height: 1.6;">
                <div style="background-color: #d92d20; color: #ffffff; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                  <h2 style="margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 1px;">Lone Star Fence Works</h2>
                  <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.8;">Crew Installation Assignment CANCELLED</p>
                </div>
                
                <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; background-color: #fdfdfd;">
                  <p style="font-size: 15px; margin-top: 0;">Hey Team,</p>
                  <p style="font-size: 14px;">The scheduled installation for <strong>${customerNameVal}</strong> has been <strong>CANCELLED</strong> or deleted in GoHighLevel CRM.</p>
                  
                  <div style="background-color: #fef2f2; border-left: 4px solid #d92d20; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                    <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 14px; text-transform: uppercase; color: #d92d20; letter-spacing: 0.5px;">❌ Cancellation Details</h3>
                    <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 4px 0; font-weight: bold; width: 150px; color: #4a5568;">Originally Scheduled:</td>
                        <td style="padding: 4px 0; color: #d92d20; font-weight: bold;">${oldDateVal || 'Not specified'}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #4a5568;">Customer Name:</td>
                        <td style="padding: 4px 0;">${customerNameVal}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #4a5568;">Site Address:</td>
                        <td style="padding: 4px 0;">${jobAddressVal}</td>
                      </tr>
                      <tr>
                        <td style="padding: 4px 0; color: #4a5568;">Estimate Code:</td>
                        <td style="padding: 4px 0;">Est #${eNo}</td>
                      </tr>
                    </table>
                  </div>

                  <p style="font-size: 14px; color: #4a5568;"><strong>Action Required:</strong> Please remove this project from your active schedule. Do NOT show up to the job site. This slot has been cancelled.</p>

                  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 20px 0;" />
                  
                  <p style="font-size: 11px; color: #718096; text-align: center; margin-bottom: 0;">
                    This layout packet is confidential and intended solely for authorized crews of Lone Star Fence Works.
                  </p>
                </div>
              </div>
            `;
            const crewText = `
              Lone Star Fence Works - Crew Cancellation Alert
              ----------------------------------------------
              Hey Team,
              
              The scheduled installation for ${customerNameVal} has been CANCELLED or deleted in GoHighLevel CRM.
              
              Details:
              - Originally Scheduled: ${oldDateVal || 'Not specified'}
              - Customer: ${customerNameVal}
              - Site Address: ${jobAddressVal}
              - Estimate No: Est #${eNo}
              
              Action Required: Do NOT show up to the job site. Please remove this from your crew schedule.
            `;

            try {
              await sendAppEmail({
                to: recipientEmail,
                subject: crewSubject,
                html: crewHtml,
                text: crewText,
                category: 'crew_install_cancellation',
                estimateId: estId,
                customSettingsData: activeSettings
              });
              console.info(`[GHL APPOINTMENT WEBHOOK] Cancellation email successfully dispatched to ${recipientEmail}`);
            } catch (mErr) {
              console.error('[GHL APPOINTMENT WEBHOOK] Failed to send cancellation email to crew:', mErr);
            }
          }

          return res.status(200).json({
            success: true,
            message: 'Appointment cancellation processed successfully.',
            estimateId: estId
          });
        }

        // 2. This is an appointment creation/update/rescheduling event
        const oldDateVal = data.confirmedInstallDate || data.preferredInstallDate || '';
        const isReschedule = !!oldDateVal && oldDateVal !== appointmentStartTime;
        
        const schedulingHistoryEntry = {
          action: isReschedule ? 'Appointment rescheduled' : 'Appointment booked',
          source: 'GHL Calendar',
          actor: 'Customer via GHL',
          oldValue: oldDateVal || 'Unscheduled',
          newValue: appointmentStartTime,
          notes: `Appointment event processed on calendar: ${appointmentTitle || 'Install'}. Matched by: ${matchedBySourceStr}`,
          timestamp: nowIso
        };

        const estimateUpdates: any = {
          installStatus: 'Pending Crew Confirmation',
          jobStatus: 'Pending Crew Confirmation',
          preferredInstallDate: appointmentStartTime,
          confirmedInstallDate: null, // Reset/clear until crew actually confirms
          ghlInstallCalendarEventId: appointmentId,
          ghlInstallCalendarId: calendarId,
          schedulingHistory: [...existingHistory, schedulingHistoryEntry],
          updatedAt: nowIso
        };

        await foundEstimateRef.update(estimateUpdates);
        console.info(`[GHL APPOINTMENT WEBHOOK] Updated estimate ${estId} to Pending Crew Confirmation on date ${appointmentStartTime}`);

        // Write schedule_event record for calendar representation mapping (initially as pending-crew type)
        const eventPayload = {
          id: eventId,
          userId: data.userId || 'braden-lonestar-uid',
          title: `[PENDING CREW] ${appointmentTitle || `${data.customerName || customerName || 'Valued Client'} - Install`}`,
          start: appointmentStartTime,
          end: appointmentEndTime,
          type: 'Job',
          status: 'Pending Crew Confirmation',
          estimateId: estId,
          estimateNumber: data.estimateNumber || estimateNumber || '',
          customerName: data.customerName || customerName || '',
          email: data.customerEmail || email || '',
          phone: data.customerPhone || phone || '',
          calendarId,
          appointmentId,
          appointmentStatus: 'Pending',
          appointmentSource,
          source: 'GHL Calendar',
          ghlAppointmentId: appointmentId,
          syncedAt: nowIso
        };

        await db.collection('schedule_events').doc(eventId).set(eventPayload, { merge: true });
        console.info(`[GHL APPOINTMENT WEBHOOK] Registered/Updated schedule_event ${eventId}`);

        // Dispatches Crew Emails post-booking lock if enabled
        let emailDispatched = false;
        let crewEmailDetails = null;

        const shouldSendCrewEmail = activeSettings.sendCrewEmailAfterGhlInstallBooking === true;
        if (shouldSendCrewEmail) {
          const resolvedInfo = await resolveCrewRecipient(data, activeSettings, db);
          const recipientEmail = resolvedInfo.email;
          const recipientSource = resolvedInfo.source;
          console.info(`[CREW DISPATCH] Resolved crew email recipient to ${recipientEmail} via source: ${recipientSource}`);
          const snapshot = data.laborContractSnapshot || null;

          const customerNameVal = data.customerName || customerName || 'Valued Client';
          const jobAddressVal = data.customerAddress || data.address || 'N/A';
          const fenceTypeVal = data.fenceMaterial || data.woodType || data.fenceType || 'Japanese Cedar';
          const linearFeetVal = data.linearFeet || 0;
          const eNo = data.estimateNumber || estimateNumber || '';

          let demoDesc = 'Not specified';
          if (data.demoRemovalPrice && Number(data.demoRemovalPrice) > 0) {
            demoDesc = `Yes ($${data.demoRemovalPrice})`;
          } else if (snapshot) {
            const hasDemo = (snapshot.aggregateLaborManifest || []).some((item: any) => String(item.name).includes('Demo') || String(item.name).includes('Demolition'));
            demoDesc = hasDemo ? 'Yes (Included in breakdown)' : 'No';
          }

          let gateDesc = 'None';
          if (snapshot) {
            const gateCount = (snapshot.aggregateLaborManifest || []).filter((item: any) => String(item.name).includes('Gate')).reduce((sum: number, item: any) => sum + (item.qty || 0), 0);
            gateDesc = gateCount > 0 ? `${gateCount} Gate(s)` : 'None';
          } else {
            gateDesc = data.gateSummary || 'None';
          }

          let drawingSection = '';
          const drawingUrlToUse = snapshot ? snapshot.drawingUrl : data.drawingUrl;
          const drawingFileNameToUse = snapshot ? snapshot.drawingFileName : data.drawingFileName;
          const drawingMimeTypeToUse = snapshot ? snapshot.drawingMimeType : data.drawingMimeType;

          if (drawingUrlToUse) {
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

          const appUrl = 'https://fence-estimator-eight.vercel.app';
          let crewScheduleToken = data.crewScheduleToken || '';
          if (!crewScheduleToken) {
            crewScheduleToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            await foundEstimateRef.update({
              crewScheduleToken,
              crewScheduleTokenCreatedAt: nowIso,
              crewScheduleAccessEnabled: true
            });
          }
          const crewScheduleLink = `${appUrl}/?portal=crew-schedule&estimateId=${estId}&token=${crewScheduleToken}`;

          // Map labor summaries
          let runsDetailedTablesHtml = '';
          let runsTableRows = '';
          let laborTotalAmount = 0;

          if (snapshot && Array.isArray(snapshot.laborRuns)) {
            laborTotalAmount = typeof snapshot.totalDirectLaborPayout === 'number' ? snapshot.totalDirectLaborPayout : 0;
            snapshot.laborRuns.forEach((run: any) => {
              const rName = run.runName || `Section`;
              const rLF = run.linearFeet !== undefined ? run.linearFeet : 0;
              const rStyle = run.styleName || '';
              const rHeight = run.height || '';
              const tags: string[] = [];
              if (rHeight) tags.push(`${rHeight}' HEIGHT`);
              if (run.railCount) tags.push(`${run.railCount} RAILS`);
              if (run.hasRotBoard) tags.push(`ROT BOARD`);
              const tagsHtml = tags.map(t => `
                <span style="display: inline-block; background-color: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.1); color: #333333; padding: 2px 6px; font-size: 8px; font-weight: bold; text-transform: uppercase; border-radius: 4px; margin-right: 4px;">${t}</span>
              `).join('');

              let runTotal = 0;
              if (Array.isArray(run.items)) {
                run.items.forEach((item: any) => {
                  runTotal += typeof item.total === 'number' ? item.total : 0;
                });
              }

              runsTableRows += `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                  <td style="padding: 10px; border: 1px solid #e2e8f0; font-family: sans-serif;">
                    <strong>${rName}</strong><br/>
                    <span style="font-size: 11px; color: #64748b;">Specs: ${rStyle}</span> ${tagsHtml}
                  </td>
                  <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace;">${rLF} LF</td>
                  <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-family: monospace;">$${Number(runTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
              `;
            });
          } else {
            const runsToUse = data.contractSnapshot?.costSummaryRuns || data.contractSnapshot?.runs || data.runs || [];
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
                      <span style="font-size: 11px; color: #64748b;">Specs: ${rStyle}</span>
                    </td>
                    <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace;">${rLF} LF</td>
                    <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-family: monospace;">$${Number(runTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>
                `;
              });
            } else {
              laborTotalAmount = data.contractSnapshot?.totalInvestment || data.grandTotal || 0;
              runsTableRows = `
                <tr>
                  <td style="padding: 10px; border: 1px solid #e2e8f0; font-family: sans-serif;">Fence Installation Work package</td>
                  <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: center; font-family: monospace;">1 Job</td>
                  <td style="padding: 10px; border: 1px solid #e2e8f0; text-align: right; font-family: monospace;">$${Number(laborTotalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
              `;
            }
          }

          runsDetailedTablesHtml = `
            <div style="margin-top: 24px; margin-bottom: 24px; border: 2px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); background-color: #ffffff;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                  <tr style="background-color: #f8fafc; color: #64748b; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #f1f5f9;">
                    <th style="padding: 12px 10px; font-family: sans-serif;">Crew Run / Section Itemization</th>
                    <th style="padding: 12px 10px; text-align: center; font-family: sans-serif; width: 100px;">Length/Qty</th>
                    <th style="padding: 12px 10px; text-align: right; font-family: sans-serif; width: 120px;">Payout</th>
                  </tr>
                </thead>
                <tbody>
                  ${runsTableRows}
                </tbody>
                <tfoot>
                  <tr style="background-color: #0c1a30; color: #ffffff; font-weight: bold; font-size: 14px;">
                    <td colspan="2" style="padding: 16px 12px; text-align: right; text-transform: uppercase; font-family: sans-serif; letter-spacing: 1px; font-size: 11px;">Total Crew Payout</td>
                    <td style="padding: 16px 12px; text-align: right; font-family: monospace; font-size: 18px; font-weight: bold;">$${Number(laborTotalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          `;

          const confirmedDateFormatted = new Date(appointmentStartTime).toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
          });

          const crewSubject = `[LSFW Crew Dispatch] Schedule Locked - Est #${eNo} for ${customerNameVal}`;

          const crewHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a202c; line-height: 1.6;">
              <div style="background-color: #0c1a30; color: #ffffff; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
                <h2 style="margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 1px;">Lone Star Fence Works</h2>
                <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.8;">Crew Installation Assignment Locked</p>
              </div>
              
              <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; background-color: #fdfdfd;">
                <p style="font-size: 15px; margin-top: 0;">Hey Team,</p>
                <p style="font-size: 14px;">An installation calendar schedule has been locked for this job by GHL Install Scheduler. Listed below is your full job dispatch packet.</p>
                
                <div style="background-color: #f8fafc; border-left: 4px solid #0c1a30; padding: 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                  <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 14px; text-transform: uppercase; color: #0c1a30; letter-spacing: 0.5px;">📋 Dispatch Summary</h3>
                  <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 4px 0; font-weight: bold; width: 150px; color: #4a5568;">Confirmed Install:</td>
                      <td style="padding: 4px 0; font-weight: bold; color: #b7791f;">${confirmedDateFormatted}</td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #4a5568;">Customer Name:</td>
                      <td style="padding: 4px 0;">${customerNameVal}</td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #4a5568;">Site Address:</td>
                      <td style="padding: 4px 0;">${jobAddressVal}</td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #4a5568;">Estimate Code:</td>
                      <td style="padding: 4px 0;">Est #${eNo}</td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #4a5568;">Fence Material:</td>
                      <td style="padding: 4px 0;">${fenceTypeVal}</td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #4a5568;">Linear Feet:</td>
                      <td style="padding: 4px 0; font-weight: bold;">${linearFeetVal} LF</td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #4a5568;">Gates Count:</td>
                      <td style="padding: 4px 0;">${gateDesc}</td>
                    </tr>
                    <tr>
                      <td style="padding: 4px 0; color: #4a5568;">Demo / Removal:</td>
                      <td style="padding: 4px 0;">${demoDesc}</td>
                    </tr>
                  </table>
                </div>

                ${runsDetailedTablesHtml}

                <div style="text-align: center; margin: 32px 0 24px 0;">
                  <a href="${crewScheduleLink}" target="_blank" style="background-color: #0c1a30; color: #ffffff; text-decoration: none; padding: 14px 28px; font-weight: bold; font-size: 13px; border-radius: 8px; display: inline-block; letter-spacing: 0.5px; box-shadow: 0 4px 6px rgba(12, 26, 48, 0.15);">
                    OPEN CREW SCHEDULING PORTAL
                  </a>
                  <p style="font-size: 10px; color: #718096; margin-top: 10px;">Enables direct crew check-in and updates for start/end parameters.</p>
                </div>

                ${drawingSection}

                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 20px 0;" />
                
                <p style="font-size: 11px; color: #718096; text-align: center; margin-bottom: 0;">
                  This layout packet is confidential and intended solely for authorized crews of Lone Star Fence Works. For support, reach out to Admin.
                </p>
              </div>
            </div>
          `;

          const crewText = `
             Lone Star Fence Works - Crew Dispatch Packet
            ------------------------------------------
            Hey Team,
            
            An installation schedule has been locked for this job by GHL.
            
            Dispatch Summary:
            - Confirmed Install: ${confirmedDateFormatted}
            - Customer: ${customerNameVal}
            - Site Address: ${jobAddressVal}
            - Estimate No: Est #${eNo}
            - Wood Type: ${fenceTypeVal}
            - Linear Feet: ${linearFeetVal} LF
            
            Open your Crew Scheduling Portal here: ${crewScheduleLink}
            
            Labor payout liabilities table is attached to this record in your crew portal.
          `;

          try {
            await sendAppEmail({
              to: recipientEmail,
              subject: crewSubject,
              html: crewHtml,
              text: crewText,
              category: 'crew_install_booking_payout_dispatch',
              estimateId: estId,
              customSettingsData: activeSettings
            });
            emailDispatched = true;
            console.info(`[CREW DISPATCH] Crew email successfully dispatched to ${recipientEmail}`);
          } catch (mErr) {
            console.error('[CREW DISPATCH] Failed to send primary crew email:', mErr);
          }

          const shouldSendBackupAdmin = activeSettings.sendAdminBackupEmail === true;
          if (shouldSendBackupAdmin) {
            try {
              const adminBackupEmail = activeSettings.adminNotificationEmail || 'bradens@lonestarfenceworks.com';
              await sendAppEmail({
                to: adminBackupEmail,
                subject: `[ADMIN COPY] ${crewSubject}`,
                html: crewHtml,
                text: crewText,
                category: 'admin_backup_crew_install_dispatch',
                estimateId: estId,
                customSettingsData: activeSettings
              });
              console.info(`[CREW DISPATCH] Backup admin copy dispatched to ${adminBackupEmail}`);
            } catch (admErr) {
              console.error('[CREW DISPATCH] Failed to send admin backup copy:', admErr);
            }
          }

          crewEmailDetails = {
            recipientEmail,
            recipientSource: recipientSource,
            emailDispatched,
            payoutLiabilityCalculated: laborTotalAmount,
            crewScheduleLink
          };
        }

        const standardLogRef = db.collection('ghlWebhookLogs').doc();
        await standardLogRef.set({
          id: standardLogRef.id,
          timestamp: nowIso,
          eventType: 'ghl_install_appointment_synced',
          direction: 'inbound',
          sourceSystem: 'GHL',
          ghlContactId: contactId,
          customerId: data.customerId || '',
          matchedBy: matchedBySourceStr,
          status: 'Scheduled',
          customerName: data.customerName || customerName,
          customerEmail: data.customerEmail || email,
          duration: Date.now() - startProcessingTime,
          result: 'Success',
          httpStatus: 200,
          firestoreDocId: estId,
          payload: body,
          crewEmailDetails
        });

        return res.status(200).json({
          success: true,
          message: 'GHL confirmed appointment processed successfully and map recorded.',
          estimateId: estId,
          matchedBy: matchedBySourceStr,
          installStatus: 'Scheduled',
          crewEmailSent: emailDispatched,
          crewEmailDetails
        });
      }

      console.info(`Processing Inbound GHL Webhook Event: ${mappedAction}`);

      // Parse payload fields with camelCase, snake_case and customData priority support
      const cd = body.customData || {};
      const contact = body.contact || {};
      const loc = body.location || {};

      const rawContactId = (
        cd.contact_id ||
        body.contact_id ||
        body.contactId ||
        body.id ||
        contact.id ||
        ''
      ).toString().trim();

      let firstName = (
        cd.first_name ||
        body.first_name ||
        body.firstName ||
        contact.first_name ||
        contact.firstName ||
        ''
      ).toString().trim();

      let lastName = (
        cd.last_name ||
        body.last_name ||
        body.lastName ||
        contact.last_name ||
        contact.lastName ||
        ''
      ).toString().trim();

      let customerName = (
        cd.full_name ||
        body.full_name ||
        body.fullName ||
        body.name ||
        ''
      ).toString().trim();

      if (customerName && (!firstName || !lastName)) {
        const parsed = splitName(customerName);
        if (!firstName) firstName = parsed.firstName;
        if (!lastName) lastName = parsed.lastName;
      }
      if (!customerName) {
        if (firstName || lastName) {
          customerName = `${firstName} ${lastName}`.trim();
        }
      }

      const rawEmail = (
        cd.email ||
        body.email ||
        contact.email ||
        ''
      ).toString().trim();

      const rawPhone = (
        cd.phone_raw ||
        body.phone ||
        cd.phone ||
        contact.phone ||
        ''
      ).toString().trim();

      const normalizedPhone = normalizePhone(rawPhone);
      const normalizedEmail = normalizeEmail(rawEmail);

      const rawTags = cd.tags || body.tags || contact.tags || '';
      let tagsToSave: string[] = [];
      if (Array.isArray(rawTags)) {
        tagsToSave = rawTags.map(t => String(t).trim()).filter(Boolean);
      } else if (typeof rawTags === 'string' && rawTags.trim()) {
        tagsToSave = rawTags.split(',').map(t => t.trim()).filter(Boolean);
      }

      const rawContactType = (
        body.contactType ||
        body.contact_type ||
        ''
      ).toString().trim();

      const rawDateCreated = (
        body.dateCreated ||
        body.date_created ||
        ''
      ).toString().trim();

      const rawCompanyName = (
        cd.companyName ||
        body.company_name ||
        body.companyName ||
        ''
      ).toString().trim();

      const rawContactSource = (
        body.contact_source ||
        body.source ||
        contact.attributionSource?.medium ||
        contact.lastAttributionSource?.medium ||
        ''
      ).toString().trim();

      // Priority Address Mapping
      let rawAddress = '';
      let addressSource: 'contact_fields' | 'customData' | 'ghl_location_fallback' | 'missing' = 'missing';

      if (cd.address1 && String(cd.address1).trim()) {
        rawAddress = String(cd.address1).trim();
        addressSource = 'customData';
      } else if (body.address1 && String(body.address1).trim()) {
        rawAddress = String(body.address1).trim();
        addressSource = 'contact_fields';
      } else if (body.address && String(body.address).trim()) {
        rawAddress = String(body.address).trim();
        addressSource = 'contact_fields';
      } else if (body.full_address && String(body.full_address).trim()) {
        rawAddress = String(body.full_address).trim();
        addressSource = 'contact_fields';
      } else if (contact.address1 && String(contact.address1).trim()) {
        rawAddress = String(contact.address1).trim();
        addressSource = 'contact_fields';
      } else if (contact.address && String(contact.address).trim()) {
        rawAddress = String(contact.address).trim();
        addressSource = 'contact_fields';
      } else if (contact.full_address && String(contact.full_address).trim()) {
        rawAddress = String(contact.full_address).trim();
        addressSource = 'contact_fields';
      } else if (loc.address && String(loc.address).trim()) {
        rawAddress = String(loc.address).trim();
        addressSource = 'ghl_location_fallback';
      }

      // Priority City Mapping
      let rawCity = '';
      if (cd.city && String(cd.city).trim()) {
        rawCity = String(cd.city).trim();
      } else if (body.city && String(body.city).trim()) {
        rawCity = String(body.city).trim();
      } else if (contact.city && String(contact.city).trim()) {
        rawCity = String(contact.city).trim();
      } else if (loc.city && String(loc.city).trim()) {
        rawCity = String(loc.city).trim();
      }

      // Priority State Mapping
      let rawState = '';
      if (cd.state && String(cd.state).trim()) {
        rawState = String(cd.state).trim();
      } else if (body.state && String(body.state).trim()) {
        rawState = String(body.state).trim();
      } else if (contact.state && String(contact.state).trim()) {
        rawState = String(contact.state).trim();
      } else if (loc.state && String(loc.state).trim()) {
        rawState = String(loc.state).trim();
      }

      // Priority Zip Mapping
      let rawPostalCode = '';
      if (cd.postalCode && String(cd.postalCode).trim()) {
        rawPostalCode = String(cd.postalCode).trim();
      } else if (cd.postal_code && String(cd.postal_code).trim()) {
        rawPostalCode = String(cd.postal_code).trim();
      } else if (body.postal_code && String(body.postal_code).trim()) {
        rawPostalCode = String(body.postal_code).trim();
      } else if (body.postalCode && String(body.postalCode).trim()) {
        rawPostalCode = String(body.postalCode).trim();
      } else if (body.zip && String(body.zip).trim()) {
        rawPostalCode = String(body.zip).trim();
      } else if (contact.postalCode && String(contact.postalCode).trim()) {
        rawPostalCode = String(contact.postalCode).trim();
      } else if (contact.zip && String(contact.zip).trim()) {
        rawPostalCode = String(contact.zip).trim();
      } else if (loc.postalCode && String(loc.postalCode).trim()) {
        rawPostalCode = String(loc.postalCode).trim();
      }

      const usedCustomData = !!(body.customData && Object.keys(body.customData).length > 0);

      // Duplicate Matching Rules:
      // Before creating a new customer, search existing customers by:
      // 1. ghlContactId
      // 2. normalized email
      // 3. normalized phone

      let matchedDoc: any = null;
      let matchedByStr = 'new';

      if (rawContactId) {
        const qSnap = await db.collection('customers')
          .where('ghlContactId', '==', rawContactId)
          .limit(1)
          .get();
        if (!qSnap.empty) {
          matchedDoc = qSnap.docs[0];
          matchedByStr = 'ghlContactId';
        }
      }

      if (!matchedDoc && normalizedEmail) {
        const qSnap = await db.collection('customers')
          .where('normalizedEmail', '==', normalizedEmail)
          .limit(1)
          .get();
        if (!qSnap.empty) {
          matchedDoc = qSnap.docs[0];
          matchedByStr = 'email';
        }
      }

      if (!matchedDoc && normalizedPhone) {
        const qSnap = await db.collection('customers')
          .where('normalizedPhone', '==', normalizedPhone)
          .limit(1)
          .get();
        if (!qSnap.empty) {
          matchedDoc = qSnap.docs[0];
          matchedByStr = 'phone';
        }
      }

      let customerId = '';
      const nowIso = new Date().toISOString();

      const normalizedPayload = {
        ghlContactId: rawContactId,
        firstName,
        lastName,
        customerName,
        email: rawEmail,
        phone: rawPhone,
        address: rawAddress,
        city: rawCity,
        state: rawState,
        zip: rawPostalCode,
        tags: tagsToSave,
        contactType: rawContactType,
        dateCreated: rawDateCreated,
        companyName: rawCompanyName,
        contactSource: rawContactSource,
        source: 'GHL'
      };

      if (matchedDoc) {
        customerId = matchedDoc.id;
        const currentData = matchedDoc.data() || {};
        const updatePayload: any = {
          ghlContactId: rawContactId || currentData.ghlContactId || '',
          firstName: firstName || currentData.firstName || '',
          lastName: lastName || currentData.lastName || '',
          customerName: customerName || currentData.customerName || '',
          email: rawEmail || currentData.email || '',
          normalizedEmail: normalizedEmail || currentData.normalizedEmail || '',
          phone: rawPhone || currentData.phone || '',
          normalizedPhone: normalizedPhone || currentData.normalizedPhone || '',
          streetAddress: rawAddress || currentData.streetAddress || '',
          address: rawAddress || currentData.address || '',
          city: rawCity || currentData.city || '',
          state: rawState || currentData.state || '',
          zip: rawPostalCode || currentData.zip || '',
          companyName: rawCompanyName || currentData.companyName || '',
          contactSource: rawContactSource || currentData.contactSource || '',
          source: 'GHL',
          tags: tagsToSave.length > 0 ? tagsToSave : (currentData.tags || []),
          contactType: rawContactType || currentData.contactType || '',
          addressSource: addressSource !== 'missing' ? addressSource : (currentData.addressSource || 'missing'),
          createdFrom: currentData.createdFrom || 'ghl_inbound_webhook',
          lastSyncedAt: nowIso,
          rawGhlPayloadPreview: JSON.stringify(body).substring(0, 500),
          normalizedGhlPayloadPreview: JSON.stringify(normalizedPayload).substring(0, 500),
          lastGhlPayloadPreview: JSON.stringify(body).substring(0, 500)
        };

        // PART 2 — Optional Appointment/Scheduler Contact Sync
        if (body.appointmentStartTime || body.appointmentStartTime === 0 || mappedAction === 'inbound-appointment-created') {
          updatePayload.ghlAppointmentId = body.ghlAppointmentId || body.appointmentId || body.id || '';
          updatePayload.appointmentStartTime = body.appointmentStartTime || body.appointment_start_time || '';
          updatePayload.calendarId = body.calendarId || body.calendar_id || '';
          updatePayload.appointmentSource = 'GHL Scheduler';
        }

        await db.collection('customers').doc(customerId).set(updatePayload, { merge: true });
        console.info(`Updated existing customer ID ${customerId} matched by ${matchedByStr}`);
      } else {
        // Create new customer
        const newDocRef = db.collection('customers').doc();
        customerId = newDocRef.id;

        const insertPayload: any = {
          id: customerId,
          ghlContactId: rawContactId,
          firstName,
          lastName,
          customerName,
          email: rawEmail,
          normalizedEmail,
          phone: rawPhone,
          normalizedPhone,
          streetAddress: rawAddress,
          address: rawAddress,
          city: rawCity,
          state: rawState,
          zip: rawPostalCode,
          companyName: rawCompanyName,
          contactSource: rawContactSource,
          source: 'GHL',
          tags: tagsToSave,
          contactType: rawContactType,
          addressSource,
          createdFrom: 'ghl_inbound_webhook',
          createdAt: nowIso,
          lastSyncedAt: nowIso,
          rawGhlPayloadPreview: JSON.stringify(body).substring(0, 500),
          normalizedGhlPayloadPreview: JSON.stringify(normalizedPayload).substring(0, 500),
          lastGhlPayloadPreview: JSON.stringify(body).substring(0, 500)
        };

        // PART 2 — Optional Appointment/Scheduler Contact Sync
        if (body.appointmentStartTime || body.appointmentStartTime === 0 || mappedAction === 'inbound-appointment-created') {
          insertPayload.ghlAppointmentId = body.ghlAppointmentId || body.appointmentId || body.id || '';
          insertPayload.appointmentStartTime = body.appointmentStartTime || body.appointment_start_time || '';
          insertPayload.calendarId = body.calendarId || body.calendar_id || '';
          insertPayload.appointmentSource = 'GHL Scheduler';
        }

        await newDocRef.set(insertPayload);
        console.info(`Created new customer ${customerName} (ID: ${customerId}) from inbound webhook`);
      }

      const duration = Date.now() - startProcessingTime;

      // Warning assessment for address missing
      let warningMessage: string | null = null;
      if (addressSource === 'ghl_location_fallback' || addressSource === 'missing') {
        warningMessage = 'Customer address fields missing from GHL payload. Address may need custom field mapping.';
      }

      const missingFields: string[] = [];
      if (!rawContactId) missingFields.push('contactId');
      if (!firstName) missingFields.push('firstName');
      if (!lastName) missingFields.push('lastName');
      if (!rawEmail) missingFields.push('email');
      if (!rawPhone) missingFields.push('phone');
      if (addressSource === 'ghl_location_fallback' || addressSource === 'missing') {
        missingFields.push('customerAddress');
      }

      // Log to unified ghlWebhookLogs
      const standardLogRef = db.collection('ghlWebhookLogs').doc();
      await standardLogRef.set({
        id: standardLogRef.id,
        timestamp: nowIso,
        eventType: mappedAction,
        direction: 'inbound',
        sourceSystem: 'GHL',
        workflowName: workflowName,
        ghlContactId: rawContactId || '',
        customerId,
        matchedBy: matchedByStr,
        usedCustomData,
        addressSource,
        status: matchedByStr === 'new' ? 'Created' : 'Merged',
        customerName: customerName,
        customerEmail: rawEmail,
        duration,
        result: matchedByStr === 'new' ? 'Created' : 'Merged',
        httpStatus: 200,
        errorMessage: warningMessage || null,
        warning: warningMessage,
        firestoreDocId: customerId,
        payload: body,
        rawPayload: body,
        normalizedPayload,
        missingFields,
        normalizedPayloadPreview: JSON.stringify(normalizedPayload).substring(0, 500)
      });

      // Log to legacy ghlInboundWebhookLogs for complete backward compatibility
      const logRef = db.collection('ghlInboundWebhookLogs').doc();
      await logRef.set({
        id: logRef.id,
        receivedAt: nowIso,
        eventType: mappedAction,
        matchedBy: matchedByStr,
        customerId,
        ghlContactId: rawContactId || '',
        success: true,
        payload: body,
        workflowName,
        sourceSystem: 'GHL',
        direction: 'inbound',
         usedCustomData,
         addressSource
      });

      // Cleanup if simulation test
      let cleanupDone = false;
      if (body.isTestSimulation === true) {
        try {
          await db.collection('customers').doc(customerId).delete();
          cleanupDone = true;
        } catch (cleanupErr) {
          console.error("Simulation test customer deletion failed:", cleanupErr);
        }
      }

      if (body.isTestSimulation === true) {
        return res.status(200).json({
          success: true,
          message: 'Inbound GHL contact synced successfully (Simulation Check)',
          customerId,
          matchedBy: matchedByStr,
          steps: {
            webhookReceived: true,
            secretValidated: secretValidated,
            payloadParsed: true,
            customerLookupSuccessful: true,
            firestoreWriteSuccessful: true,
            cleanupSuccessful: cleanupDone
          }
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Inbound GHL contact synced successfully',
        customerId,
        matchedBy: matchedByStr
      });
    }

    // Default: Fallback to existing Outbound Webhook behavior
    const eventType = body.eventType || 'instant_estimate_submitted';
    const estimateId = body.estimateId || BRADEN_UID;
    const ownerUid = body.ownerUid || BRADEN_UID;

    console.info(`Direct webhook trigger endpoint called for event: ${eventType}`);

    const result = await sendGhlWebhook(
      eventType,
      estimateId,
      body,
      db,
      ownerUid
    );

    const durationOutbound = Date.now() - startProcessingTime;

    // Log outbound webhook to ghlWebhookLogs
    const standardOutboundLogRef = db.collection('ghlWebhookLogs').doc();
    await standardOutboundLogRef.set({
      id: standardOutboundLogRef.id,
      timestamp: new Date().toISOString(),
      eventType: eventType,
      direction: 'outbound',
      customerName: body.customerName || body.name || `${body.firstName || ''} ${body.lastName || ''}`.trim() || 'Valued Customer',
      customerEmail: body.email || '',
      matchedBy: 'N/A',
      duration: durationOutbound,
      result: result.success ? 'Success' : 'Failed',
      httpStatus: result.success ? 200 : 500,
      errorMessage: result.success ? null : result.error,
      firestoreDocId: estimateId,
      payload: body
    });

    if (!result.success) {
      return res.status(200).json({
        success: false,
        message: 'Lead action was handled, but Go High Level webhook dispatch logged a warning.',
        detail: result.error
      });
    }

    return res.status(200).json({ success: true, message: 'Lead action successfully dispatched via GHL workflow event.' });

  } catch (error: any) {
    console.error('GHL webhook handler error:', error);

    // Log fatal handler error to ghlWebhookLogs
    try {
      const standardLogRef = db.collection('ghlWebhookLogs').doc();
      await standardLogRef.set({
        id: standardLogRef.id,
        timestamp: new Date().toISOString(),
        eventType: 'fatal-exception',
        direction: 'inbound',
        customerName: 'Error Handler',
        customerEmail: '',
        matchedBy: 'none',
        duration: Date.now() - startProcessingTime,
        result: 'Failed',
        httpStatus: 500,
        errorMessage: error.message || String(error),
        firestoreDocId: null
      });
    } catch (logErr) {
      console.warn('Failed writing fatal error to logger:', logErr);
    }

    return res.status(200).json({ success: false, error: error.message || 'Internal server processes warning.' });
  }
}
