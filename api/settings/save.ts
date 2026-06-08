import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
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
      console.error('Error parsing FIREBASE_CONFIG env in settings save:', error);
      admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
    }
  } else {
    admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
  }
}

const db = getFirestore(admin.app(), CUSTOM_DB_ID);

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing token header' });
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err: any) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    const uid = decoded.uid;
    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized: Invalid credentials payload' });
    }

    const incomingFields = req.body;

    // 1. Validation Logic
    const {
      companyName,
      companyEmail,
      companyPhone,
      companyWebsite,
      companyLogo,
      smtpHost,
      smtpPort,
      smtpSecureType,
      smtpUsername,
      smtpPassword,
      fromEmail,
      fromName,
      replyToEmail,
      gohighlevelWebhookUrl,
      googleReviewLink,
      estimateEmailSubject,
      estimateEmailBody,
      estimateAcceptedMessage,
      estimateDeclinedMessage
    } = incomingFields;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (fromEmail && !emailRegex.test(fromEmail)) {
      return res.status(400).json({ error: 'Invalid From Email format.' });
    }
    if (companyEmail && !emailRegex.test(companyEmail)) {
      return res.status(400).json({ error: 'Invalid Company Email format.' });
    }

    // SMTP Host check
    if (!smtpHost) {
      return res.status(400).json({ error: 'SMTP Host cannot be blank.' });
    }

    // SMTP Port check
    const numericPort = Number(smtpPort);
    if (!smtpPort || isNaN(numericPort)) {
      return res.status(400).json({ error: 'Numeric SMTP Port is required.' });
    }

    // SMTP Username check
    if (!smtpUsername) {
      return res.status(400).json({ error: 'SMTP Username is required.' });
    }

    // Check existing document to retain existing password if masked are sent
    const settingsDocRef = db.collection('companySettings').doc(uid);
    const existingDoc = await settingsDocRef.get();
    const existingData = existingDoc.exists ? existingDoc.data() : {};

    let finalPassword = smtpPassword;
    if (smtpPassword === '••••••••' || !smtpPassword) {
      if (existingData && existingData.smtpPassword) {
        finalPassword = existingData.smtpPassword;
      } else {
        return res.status(400).json({ error: 'SMTP Password is required for initial setup.' });
      }
    }

    const updatedSettings = {
      id: uid,
      companyName: companyName || '',
      companyEmail: companyEmail || '',
      companyPhone: companyPhone || '',
      companyWebsite: companyWebsite || '',
      companyLogo: companyLogo || '',
      smtpHost: smtpHost,
      smtpPort: numericPort,
      smtpSecureType: smtpSecureType || 'SSL/TLS',
      smtpUsername: smtpUsername,
      smtpPassword: finalPassword,
      fromEmail: fromEmail || '',
      fromName: fromName || '',
      replyToEmail: replyToEmail || '',
      gohighlevelWebhookUrl: gohighlevelWebhookUrl || '',
      ghlWebhookUrl: gohighlevelWebhookUrl || '', // Maintain compatibility for both forms
      googleReviewLink: googleReviewLink || '',
      estimateEmailSubject: estimateEmailSubject || '',
      estimateEmailBody: estimateEmailBody || '',
      estimateAcceptedMessage: estimateAcceptedMessage || '',
      estimateDeclinedMessage: estimateDeclinedMessage || '',
      updatedAt: new Date().toISOString()
    };

    await settingsDocRef.set(updatedSettings, { merge: true });

    return res.status(200).json({ success: true, message: 'Settings saved successfully.' });
  } catch (error: any) {
    console.error('Error saving settings:', error);
    return res.status(500).json({ error: error.message || 'Settings database save operation failed.' });
  }
}
