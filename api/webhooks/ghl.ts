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

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const {
      firstName, lastName, email, phone,
      address, city, state, zip,
      fenceType, linearFeet, gateCount, estimatedPrice
    } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'Missing required lead fields: firstName, lastName, email' });
    }

    const settingsSnap = await db.collection('companySettings').doc(BRADEN_UID).get();
    if (!settingsSnap.exists) {
      return res.status(500).json({ error: 'Company settings not found. Configure GHL webhook URL in Settings.' });
    }

    const settings = settingsSnap.data() || {};
    const ghlWebhookUrl = settings.gohighlevelWebhookUrl || settings.ghlWebhookUrl || '';

    if (!ghlWebhookUrl) {
      return res.status(500).json({ error: 'GoHighLevel webhook URL is not configured in Settings.' });
    }

    const ghlPayload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone?.trim() || '',
      address: address?.trim() || '',
      city: city?.trim() || '',
      state: state?.trim() || '',
      zip: zip?.trim() || '',
      fenceType: fenceType || 'Wood Fence',
      linearFeet: linearFeet || 0,
      gateCount: gateCount || 0,
      estimatedPrice: estimatedPrice || 0,
      tags: ['Customer Estimate', 'New Lead'],
      source: 'Lone Star Fence Estimator'
    };

    const ghlResponse = await fetch(ghlWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ghlPayload)
    });

    const ghlResponseText = await ghlResponse.text();

    if (!ghlResponse.ok) {
      console.error('GHL webhook rejected payload:', ghlResponse.status, ghlResponseText);
      return res.status(502).json({
        error: `GHL webhook returned ${ghlResponse.status}`,
        detail: ghlResponseText
      });
    }

    console.log('Lead successfully transmitted to GoHighLevel:', email);
    return res.status(200).json({ success: true, message: 'Lead transmitted to GoHighLevel CRM.' });

  } catch (error: any) {
    console.error('GHL webhook handler error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error in GHL webhook handler.' });
  }
}
