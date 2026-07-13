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
        admin.initializeApp({ credential: admin.credential.cert(parsedConfig) });
      } else {
        admin.initializeApp({ projectId: parsedConfig.projectId || 'dazzling-card-485210-r8' });
      }
    } catch (error) {
      console.error('Error parsing FIREBASE_CONFIG env in materials history:', error);
      admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
    }
  } else {
    admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
  }
}

const db = getFirestore(admin.app(), CUSTOM_DB_ID);

export default async function handler(req: any, res: any) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    const token = authHeader.split(' ')[1];
    try {
      jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    if (req.method === 'GET') {
      const { materialId } = req.query;
      if (!materialId) {
        return res.status(400).json({ error: 'Missing materialId' });
      }

      const snap = await db.collection('materialHistory')
        .where('materialId', '==', materialId)
        .orderBy('date', 'desc')
        .get();

      const history = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return res.status(200).json(history);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Error fetching material history:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
