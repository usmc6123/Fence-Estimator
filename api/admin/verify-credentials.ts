import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import jwt from 'jsonwebtoken';
import { readFileSync, existsSync } from 'fs';

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
    console.error('Failed to initialize Firebase inside verify-credentials handler:', err);
  }
  return db;
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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers['x-admin-token'] || req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Admin authentication is required. Token is missing.' });
    }
    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ error: 'Admin authentication is required. Token is invalid.' });
    }

    const decoded = jwt.verify(token as string, JWT_SECRET) as any;
    if (decoded && typeof decoded === 'object' && decoded.isAdmin) {
      // Validate that admin still exists in Firestore database
      const firestoreDb = getDbInstance();
      if (firestoreDb) {
        const adminDocRef = doc(firestoreDb, 'admins', decoded.uid);
        const adminSnap = await getDoc(adminDocRef);
        if (!adminSnap.exists()) {
          return res.status(401).json({ success: false, valid: false, error: 'Admin record no longer exists in database.' });
        }
      }

      // Generate a new refreshed 24-hour token to keep session active
      const refreshedToken = jwt.sign(
        { email: decoded.email, isAdmin: true, uid: decoded.uid },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      return res.status(200).json({
        success: true,
        valid: true,
        token: refreshedToken,
        admin: {
          email: decoded.email,
          uid: decoded.uid,
          isAdmin: true
        }
      });
    }

    return res.status(401).json({ success: false, valid: false, error: 'Access denied. Invalid token.' });
  } catch (err: any) {
    return res.status(401).json({ success: false, valid: false, error: 'Access denied. Invalid or expired admin token.' });
  }
}
