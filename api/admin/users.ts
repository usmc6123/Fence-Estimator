import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import jwt from 'jsonwebtoken';
import { readFileSync, existsSync } from 'fs';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
let db: any = null;

function getDbInstance() {
  if (db) return db;
  try {
    const configUrl = new URL('../../firebase-applet-config.json', import.meta.url);
    if (existsSync(configUrl)) {
      const firebaseConfig = JSON.parse(readFileSync(configUrl, 'utf-8'));
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
    } else {
      console.warn('firebase-applet-config.json not found inside local file system.');
    }
  } catch (err) {
    console.error('Failed to initialize Firebase in unified users function:', err);
  }
  return db;
}

// Authentication check
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
    // Authenticate the admin session
    authenticateAdminToken(req);

    const firestoreDb = getDbInstance();
    if (!firestoreDb) {
      return res.status(503).json({ error: 'Database service is offline' });
    }

    // Log the request object to see what's actually being passed and aid debugging
    console.log('Incoming /api/admin/users request details:', {
      method: req ? req.method : undefined,
      url: req ? req.url : undefined,
      hasQuery: !!(req && req.query),
      hasBody: !!(req && req.body),
      queryKeys: req && req.query ? Object.keys(req.query) : [],
      bodyKeys: req && req.body ? Object.keys(req.body) : [],
      query: req ? req.query : undefined,
      body: req ? req.body : undefined
    });

    const query = req && req.query ? req.query : {};
    const body = req && req.body ? req.body : {};

    // Safely extract potential user IDs or actions with complete null/undefined safety
    const userId = (query && (query.id || query.userId)) || (body && (body.userId || body.uid)) || null;
    const action = (query && query.action) || (body && body.action) || null;

    // --- GET METHODS ---
    if (req.method === 'GET') {
      if (!userId) {
        // GET /api/admin/users -> List all users
        const usersRef = collection(firestoreDb, 'users');
        const snap = await getDocs(usersRef);
        const usersList: any[] = [];

        for (const d of snap.docs) {
          const u = d.data();
          const estRef = collection(firestoreDb, 'users', d.id, 'estimates');
          const estSnap = await getDocs(estRef);
          usersList.push({
            uid: d.id,
            email: u.email || '',
            name: u.name || u.displayName || u.email?.split('@')[0] || 'No Name',
            subscriptionTier: u.tier || u.subscriptionTier || 'free',
            createdAt: u.createdAt || '',
            isDisabled: u.isDisabled || false,
            estimatesCount: estSnap.size
          });
        }

        return res.status(200).json(usersList);
      } else {
        // GET /api/admin/users?id=USER_ID & action=estimates -> Get specific user estimates
        if (action === 'estimates') {
          const estRef = collection(firestoreDb, 'users', userId, 'estimates');
          const snap = await getDocs(estRef);
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          return res.status(200).json(list);
        }

        // GET /api/admin/users?id=USER_ID -> Retrieve single user profile
        const uRef = doc(firestoreDb, 'users', userId);
        const snap = await getDoc(uRef);
        if (!snap.exists()) {
          return res.status(404).json({ error: 'User not found in system' });
        }
        return res.status(200).json({ uid: snap.id, ...snap.data() });
      }
    }

    // --- POST METHODS ---
    if (req.method === 'POST') {
      if (!userId) {
        // POST /api/admin/users -> Create user
        const { email, name, subscriptionTier, password } = body;
        if (!email || !name) {
          return res.status(400).json({ error: 'Email and Name are required' });
        }
        if (!password) {
          return res.status(400).json({ error: 'Initial Password is required' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUserId = `usr-${Math.random().toString(36).substring(2, 11)}`;
        const uRef = doc(firestoreDb, 'users', newUserId);

        const newUser = {
          uid: newUserId,
          email: email.toLowerCase().trim(),
          name: name,
          displayName: name,
          tier: subscriptionTier || 'free',
          subscriptionTier: subscriptionTier || 'free',
          passwordHash: passwordHash,
          createdAt: new Date().toISOString(),
          isDisabled: false,
          isAdmin: false
        };

        await setDoc(uRef, newUser);
        return res.status(200).json({ success: true, user: newUser });
      } else {
        // POST /api/admin/users with userId -> Sub-actions like changing tier / enabling / disabling
        const uRef = doc(firestoreDb, 'users', userId);
        
        if (action === 'tier') {
          const { tier } = body;
          if (!tier || !['free', 'paid'].includes(tier)) {
            return res.status(400).json({ error: 'Invalid subscription tier' });
          }
          await updateDoc(uRef, { tier: tier, subscriptionTier: tier, updatedAt: new Date().toISOString() });
          return res.status(200).json({ success: true, tier });
        }

        if (action === 'disable') {
          await updateDoc(uRef, { isDisabled: true, updatedAt: new Date().toISOString() });
          return res.status(200).json({ success: true, isDisabled: true });
        }

        if (action === 'enable') {
          await updateDoc(uRef, { isDisabled: false, updatedAt: new Date().toISOString() });
          return res.status(200).json({ success: true, isDisabled: false });
        }

        return res.status(400).json({ error: 'Unknown action specified' });
      }
    }

    // --- PUT METHODS ---
    if (req.method === 'PUT') {
      if (!userId) {
        return res.status(400).json({ error: 'Target User ID (userId) is required' });
      }

      const { email, name, subscriptionTier, isDisabled, password } = body;
      const uRef = doc(firestoreDb, 'users', userId);
      const updateData: any = {
        updatedAt: new Date().toISOString()
      };

      if (email !== undefined) updateData.email = email.toLowerCase().trim();
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
    }

    // --- DELETE METHODS ---
    if (req.method === 'DELETE') {
      if (!userId) {
        return res.status(400).json({ error: 'Target User ID (userId) is required' });
      }

      // 1. Delete associated estimates first to keep Firestore clean
      const estRef = collection(firestoreDb, 'users', userId, 'estimates');
      const estSnap = await getDocs(estRef);
      for (const d of estSnap.docs) {
        await deleteDoc(doc(firestoreDb, 'users', userId, 'estimates', d.id));
      }

      // 2. Delete main user document
      const uRef = doc(firestoreDb, 'users', userId);
      await deleteDoc(uRef);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });

  } catch (error: any) {
    console.error('Error in unified /api/admin/users:', error);
    return res.status(error.message?.includes('Access denied') || error.message?.includes('authentication') ? 401 : 500).json({
      error: error.message || 'Internal Server Error'
    });
  }
}
