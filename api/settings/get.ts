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
      console.error('Error parsing FIREBASE_CONFIG env in settings get:', error);
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
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

    // Retrieve Settings from /companySettings/{uid}
    const settingsDoc = await db.collection('companySettings').doc(uid).get();
    
    if (!settingsDoc.exists) {
      // Return empty default state if not found
      return res.status(200).json({
        id: uid,
        companyName: '',
        companyEmail: '',
        companyPhone: '',
        companyWebsite: '',
        companyLogo: '',
        smtpHost: '',
        smtpPort: 465,
        smtpSecureType: 'SSL/TLS',
        smtpUsername: '',
        smtpPassword: '', // empty on start
        fromEmail: '',
        fromName: '',
        replyToEmail: '',
        gohighlevelWebhookUrl: '',
        googleReviewLink: '',
        estimateEmailSubject: '',
        estimateEmailBody: '',
        estimateAcceptedMessage: '',
        estimateDeclinedMessage: ''
      });
    }

    const data = settingsDoc.data() || {};
    
    // Mask sensitive fields like smtpPassword and webhook details for secure retrieval
    if (data.smtpPassword) {
      data.smtpPassword = '••••••••';
    }

    return res.status(200).json({ id: uid, ...data });
  } catch (error: any) {
    console.error('Error fetching company settings:', error);
    return res.status(500).json({ error: error.message || 'Internal settings retrieval failure.' });
  }
}
