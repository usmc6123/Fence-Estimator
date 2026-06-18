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

    if (ghlType === 'contactCreate' || rawAction === 'contactCreate') {
      mappedAction = 'inbound-contact-created';
    } else if (ghlType === 'contactUpdate' || rawAction === 'contactUpdate') {
      mappedAction = 'inbound-contact-updated';
    } else if (ghlType === 'appointmentCreate' || rawAction === 'appointmentCreate') {
      mappedAction = 'inbound-appointment-created';
    }

    const isInbound = [
      'inbound-contact-created',
      'inbound-contact-updated',
      'inbound-appointment-created'
    ].includes(mappedAction);

    if (isInbound) {
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
        customerName: customerName,
        customerEmail: rawEmail,
        matchedBy: matchedByStr,
        duration,
        result: matchedByStr === 'new' ? 'Created' : 'Merged',
        httpStatus: 200,
        errorMessage: warningMessage || null,
        warning: warningMessage,
        firestoreDocId: customerId,
        payload: body,
        rawPayload: body,
        normalizedPayload,
        addressSource,
        missingFields,
        customerId,
        usedCustomData,
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
        payload: body
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
