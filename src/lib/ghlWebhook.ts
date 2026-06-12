const BRADEN_UID = 'braden-lonestar-uid';

export async function sendGhlWorkflowWebhook(
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

    // If companySettings is not populated/complete and firestoreDb is available, resolve it
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
          console.warn(`Error resolving settings for key ${key} in shared helper:`, e);
        }
      }
    }

    // Determine the target Webhook URL based on eventType
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

    // Fallbacks if event-specific is blank (skip if blank)
    if (!webhookUrl) {
      console.log(`Webhook URL for event type ${eventType} is blank. Skipping GHL webhook trigger.`);
      return { success: true, error: 'Skipped: webhook URL not configured.' };
    }

    // Construct the event payload
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

    // Send GHL Webhook
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

    // Log to Firestore in ghlWebhookLog if database is provided
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
