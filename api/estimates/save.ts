import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import jwt from 'jsonwebtoken';

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
      console.error('Error parsing FIREBASE_CONFIG env in estimates save:', error);
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

const db = getFirestore(admin.app(), CUSTOM_DB_ID);

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err: any) {
      console.error('JWT verification error in estimates save:', err.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    if (!decoded || !decoded.uid) {
      return res.status(401).json({ error: 'Unauthorized: Missing user UID in token' });
    }

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
          !decoded.isAdmin &&
          decoded.uid !== 'braden-lonestar-uid'
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
    }

    return res.status(200).json({
      id: savedId,
      ...estimateData
    });

  } catch (error: any) {
    console.error('Error saving estimate:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
