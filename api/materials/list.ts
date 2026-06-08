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
      console.error('Error parsing FIREBASE_CONFIG env in materials list:', error);
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
    try {
      jwt.verify(token, JWT_SECRET);
    } catch (err: any) {
      console.error('JWT verification error in materials list:', err.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    // 5. Reads ALL documents from the /materials collection
    const materialsList: any[] = [];
    const snap = await db.collection('materials').get();
    snap.forEach(doc => {
      materialsList.push({ id: doc.id, ...doc.data() });
    });

    // 6. Returns the full array of materials as JSON with cleaned timestamps
    const cleanMaterialsList = materialsList.map(mat => {
      return {
        ...mat,
        createdAt: cleanTimestamp(mat.createdAt),
        updatedAt: cleanTimestamp(mat.updatedAt || mat.createdAt),
        lastPriceUpdate: mat.lastPriceUpdate ? cleanTimestamp(mat.lastPriceUpdate) : undefined
      };
    });

    return res.status(200).json(cleanMaterialsList);

  } catch (error: any) {
    console.error('Error fetching materials list:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
