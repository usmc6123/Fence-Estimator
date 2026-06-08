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
      console.error('Error parsing FIREBASE_CONFIG env in admin users list:', error);
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

export async function listUsers(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-admin-token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const authHeader = req.headers['x-admin-token'] || req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized: Missing token header' });
    }

    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err: any) {
      console.error('JWT verification error in admin users list:', err.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    if (!decoded || !decoded.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin access only' });
    }

    // List all admins
    const adminsList: any[] = [];
    const adminsSnap = await db.collection('admins').get();
    adminsSnap.forEach(doc => {
      const data = doc.data();
      adminsList.push({
        uid: doc.id,
        email: data.email || '',
        name: data.name || data.displayName || data.email?.split('@')[0] || 'No Name',
        displayName: data.displayName || data.name || data.email?.split('@')[0] || 'No Name',
        tier: data.tier || data.subscriptionTier || 'paid',
        subscriptionTier: data.subscriptionTier || data.tier || 'paid',
        isAdmin: true,
        isDisabled: !!data.isDisabled,
        createdAt: cleanTimestamp(data.createdAt),
        estimatesCount: 0
      });
    });

    // List all users with estimatesCount parallel counting
    const usersSnap = await db.collection('users').get();
    const usersPromises = usersSnap.docs.map(async (doc) => {
      const data = doc.data();
      const estSnap = await db.collection('users').doc(doc.id).collection('estimates').select().get();
      return {
        uid: doc.id,
        email: data.email || '',
        name: data.name || data.displayName || data.email?.split('@')[0] || 'No Name',
        displayName: data.displayName || data.name || data.email?.split('@')[0] || 'No Name',
        tier: data.tier || data.subscriptionTier || 'free',
        subscriptionTier: data.subscriptionTier || data.tier || 'free',
        isAdmin: false,
        isDisabled: !!data.isDisabled,
        createdAt: cleanTimestamp(data.createdAt),
        estimatesCount: estSnap.size
      };
    });

    const resolvedUsers = await Promise.all(usersPromises);
    const combined = [...adminsList, ...resolvedUsers];

    // Sort by createdAt descending
    combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.status(200).json(combined);

  } catch (error: any) {
    console.error('Error in Admin Users list handler:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
