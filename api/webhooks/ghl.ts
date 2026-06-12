import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { sendGhlWorkflowWebhook } from '../../src/lib/ghlWebhook';

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

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const body = req.body || {};
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

    if (!result.success) {
      // Do not block client response, but let them know it failed.
      return res.status(200).json({
        success: false,
        message: 'Lead action was handled, but Go High Level webhook dispatch logged a warning.',
        detail: result.error
      });
    }

    return res.status(200).json({ success: true, message: 'Lead action successfully dispatched via GHL workflow event.' });

  } catch (error: any) {
    console.error('GHL webhook handler error:', error);
    return res.status(200).json({ success: false, error: error.message || 'Internal server processes warning.' });
  }
}
