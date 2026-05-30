import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import jwt from 'jsonwebtoken';
import { readFileSync, existsSync } from 'fs';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
let db: any = null;

function getDbInstance() {
  if (db) return db;
  try {
    const configUrl = new URL('../../../firebase-applet-config.json', import.meta.url);
    if (existsSync(configUrl)) {
      const firebaseConfig = JSON.parse(readFileSync(configUrl, 'utf-8'));
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
    }
  } catch (err) {
    console.error('Failed to initialize Firebase in users router:', err);
  }
  return db;
}

function authenticateAdminToken(req: any) {
  const authHeader = req.headers['x-admin-token'] || req.headers.authorization;
  if (!authHeader) {
    throw new Error('Admin authentication is required. Token is missing.');
  }
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  if (!token || token === 'null' || token === 'undefined') {
    throw new Error('Admin authentication is required. Token is invalid.');
  }

  const decoded = jwt.verify(token as string, JWT_SECRET);
  if (decoded && typeof decoded === 'object' && (decoded as any).isAdmin) {
    return decoded;
  }
  throw new Error('Access denied. Invalid or expired admin token.');
}

export default async function handler(req: any, res: any) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Admin-Token, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    authenticateAdminToken(req);

    const firestoreDb = getDbInstance();
    if (!firestoreDb) {
      return res.status(503).json({ error: 'Database service is offline' });
    }

    const query = req && req.query ? req.query : {};
    const params = query && query.params ? query.params : null;
    if (!params || !Array.isArray(params) || params.length === 0) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const userId = params[0];
    const action = params[1] || null;

    if (!action) {
      // Endpoints for: /api/admin/users/:userId
      if (req.method === 'GET') {
        const uRef = doc(firestoreDb, 'users', userId);
        const snap = await getDoc(uRef);
        if (!snap.exists()) {
          return res.status(404).json({ error: 'User not found' });
        }
        return res.status(200).json({ uid: snap.id, ...snap.data() });

      } else if (req.method === 'PUT') {
        // Edit / update user details
        const { email, name, subscriptionTier, isDisabled, password } = req.body;
        const uRef = doc(firestoreDb, 'users', userId);
        const updateData: any = {
          updatedAt: new Date().toISOString()
        };

        if (email !== undefined) updateData.email = email;
        if (name !== undefined) {
          updateData.name = name;
          updateData.displayName = name;
        }
        if (subscriptionTier !== undefined) {
          updateData.tier = subscriptionTier;
          updateData.subscriptionTier = subscriptionTier;
        }
        if (isDisabled !== undefined) {
          updateData.isDisabled = isDisabled;
        }
        if (password !== undefined && password !== '') {
          const salt = await bcrypt.genSalt(10);
          updateData.passwordHash = await bcrypt.hash(password, salt);
        }

        await updateDoc(uRef, updateData);
        return res.status(200).json({ success: true, user: { uid: userId, email, name, subscriptionTier, isDisabled } });

      } else if (req.method === 'DELETE') {
        // Delete user
        // 1. Clean subcollections
        const estRef = collection(firestoreDb, 'users', userId, 'estimates');
        const estSnap = await getDocs(estRef);
        for (const d of estSnap.docs) {
          await deleteDoc(doc(firestoreDb, 'users', userId, 'estimates', d.id));
        }

        // 2. Delete main user doc
        const uRef = doc(firestoreDb, 'users', userId);
        await deleteDoc(uRef);
        return res.status(200).json({ success: true });

      } else {
        return res.status(405).json({ error: 'Method Not Allowed' });
      }

    } else {
      // Endpoints with a sub-route: /api/admin/users/:userId/:action
      if (action === 'estimates' && req.method === 'GET') {
        const estRef = collection(firestoreDb, 'users', userId, 'estimates');
        const snap = await getDocs(estRef);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return res.status(200).json(list);

      } else if (action === 'tier' && req.method === 'POST') {
        const { tier } = req.body;
        if (!tier || !['free', 'paid'].includes(tier)) {
          return res.status(400).json({ error: 'Invalid subscription tier' });
        }
        const uRef = doc(firestoreDb, 'users', userId);
        await updateDoc(uRef, { tier: tier, subscriptionTier: tier, updatedAt: new Date().toISOString() });
        return res.status(200).json({ success: true, tier });

      } else if (action === 'disable' && req.method === 'POST') {
        const uRef = doc(firestoreDb, 'users', userId);
        await updateDoc(uRef, { isDisabled: true, updatedAt: new Date().toISOString() });
        return res.status(200).json({ success: true, isDisabled: true });

      } else if (action === 'enable' && req.method === 'POST') {
        const uRef = doc(firestoreDb, 'users', userId);
        await updateDoc(uRef, { isDisabled: false, updatedAt: new Date().toISOString() });
        return res.status(200).json({ success: true, isDisabled: false });

      } else {
        return res.status(404).json({ error: 'Endpoint sub-action not found' });
      }
    }

  } catch (error: any) {
    console.error(`Error in /api/admin/users catch-all [userId/action]:`, error);
    return res.status(error.message?.includes('Access denied') || error.message?.includes('authentication') ? 401 : 500).json({
      error: error.message || 'Internal Server Error'
    });
  }
}
