import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
let db: any = null;

function getDbInstance() {
  if (db) return db;
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
    }
  } catch (err) {
    console.error('Failed to initialize Firebase in users function:', err);
  }
  return db;
}

// Authentication middleware
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
    // Authenticate the admin
    authenticateAdminToken(req);

    const firestoreDb = getDbInstance();
    if (!firestoreDb) {
      return res.status(503).json({ error: 'Database service is offline' });
    }

    if (req.method === 'GET') {
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

    } else if (req.method === 'POST') {
      // POST /api/admin/users -> Create user
      const { email, name, subscriptionTier, password } = req.body;
      if (!email || !name) {
        return res.status(400).json({ error: 'Email and Name are required' });
      }
      if (!password) {
        return res.status(400).json({ error: 'Initial Password is required' });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const userId = `usr-${Math.random().toString(36).substring(2, 11)}`;
      const uRef = doc(firestoreDb, 'users', userId);

      const newUser = {
        uid: userId,
        email: email,
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
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
  } catch (error: any) {
    console.error('Error in /api/admin/users:', error);
    return res.status(error.message?.includes('Access denied') || error.message?.includes('authentication') ? 401 : 500).json({
      error: error.message || 'Internal Server Error'
    });
  }
}
