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
      console.error('Error parsing FIREBASE_CONFIG env:', error);
      admin.initializeApp({
        projectId: 'dazzling-card-485210-r8',
      });
    }
  } else {
    // Graceful fallback for local development or Standard Google Application Default Credentials
    admin.initializeApp({
      projectId: 'dazzling-card-485210-r8',
    });
  }
}

// Get the Firestore instance targeting the specific custom database ID
const db = getFirestore(admin.app(), CUSTOM_DB_ID);

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

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

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
      console.error('JWT verification error in estimates list:', err.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    const uid = decoded.uid;
    const isAdmin = decoded.isAdmin || uid === 'braden-lonestar-uid';

    const list: any[] = [];

    if (isAdmin) {
      // 6. If the user is admin, return ALL estimates from the /estimates collection
      const snap = await db.collection('estimates').get();
      snap.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
    } else {
      // 7. If the user is not admin, return only estimates where the uid field matches their uid
      const queryByUid = await db.collection('estimates').where('uid', '==', uid).get();
      const queryByUserId = await db.collection('estimates').where('userId', '==', uid).get();

      const mergedMap = new Map();
      queryByUid.forEach(doc => mergedMap.set(doc.id, doc));
      queryByUserId.forEach(doc => mergedMap.set(doc.id, doc));

      // Subcollection fallback mapping for backward compatibility if saved per-user
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

    // 8. Sorts results by createdAt descending (newest first)
    list.sort((a, b) => {
      const timeA = a.createdAt ? (a.createdAt._seconds ? a.createdAt._seconds * 1000 : new Date(a.createdAt).getTime()) : 0;
      const timeB = b.createdAt ? (b.createdAt._seconds ? b.createdAt._seconds * 1000 : new Date(b.createdAt).getTime()) : 0;
      return timeB - timeA;
    });

    // 9. Returns the array of estimates as JSON
    const cleanList = list.map(est => {
      return {
        ...est,
        createdAt: cleanTimestamp(est.createdAt),
        lastModified: cleanTimestamp(est.lastModified || est.createdAt)
      };
    });

    return res.status(200).json(cleanList);

  } catch (error: any) {
    console.error('Error fetching estimates list:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
