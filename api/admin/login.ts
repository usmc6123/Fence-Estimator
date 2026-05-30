import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFileSync, existsSync } from 'fs';

// Load Firebase configuration
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
    console.error('Failed to initialize Firebase inside serverless function:', err);
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
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const firestoreDb = getDbInstance();
    if (!firestoreDb) {
      return res.status(503).json({ success: false, error: 'Database service is offline or misconfigured' });
    }

    const emailLower = email.toLowerCase();
    let adminUid = 'braden-lonestar-uid';
    if (emailLower === 'bradens@lonestarfenceworks.com') {
      adminUid = 'braden-lonestar-uid';
    } else {
      adminUid = emailLower.replace(/[^a-zA-Z0-9]/g, '-');
    }

    console.log(`[AdminLogin] Attempting login. Received Email: "${emailLower}". Determined UID: "${adminUid}"`);

    // Direct fetch of the /admins collection by document ID (UID)
    const adminDocRef = doc(firestoreDb, 'admins', adminUid);
    console.log(`[AdminLogin] Querying "/admins" collection by document ID (UID): "${adminUid}"`);
    const adminSnap = await getDoc(adminDocRef);

    let adminData: any = null;

    if (adminSnap.exists()) {
      adminData = adminSnap.data();
      console.log(`[AdminLogin] Found admin record in "/admins/${adminUid}". Payload attributes:`, JSON.stringify(adminData));
    } else {
      console.log(`[AdminLogin] Admin record not found in "/admins/${adminUid}". Trying fallback "/admin_users"...`);
      try {
        const fallbackDocRef = doc(firestoreDb, 'admin_users', adminUid);
        const fallbackSnap = await getDoc(fallbackDocRef);
        if (fallbackSnap.exists()) {
          adminData = fallbackSnap.data();
          console.log(`[AdminLogin] Found admin record in fallback "/admin_users/${adminUid}". Data:`, JSON.stringify(adminData));
        } else {
          console.log(`[AdminLogin] Admin record not found in fallback "/admin_users/${adminUid}".`);
        }
      } catch (fallbackErr: any) {
        console.warn(`[AdminLogin] Fallback admin_users document query failed:`, fallbackErr.message || fallbackErr);
      }
    }

    if (!adminData) {
      console.error(`[AdminLogin] Admin record not found in database for derived UID: "${adminUid}" (email: "${emailLower}")`);
      return res.status(404).json({ success: false, error: 'Admin record not found in database.' });
    }

    const storedHash = adminData.passwordHash;

    if (!storedHash) {
      console.error(`[AdminLogin] Admin record exists but has no passwordHash set.`);
      return res.status(401).json({ success: false, error: 'Invalid password' });
    }

    // Compare incoming password with stored hash using bcryptjs
    const isMatch = await bcrypt.compare(password, storedHash);
    if (!isMatch) {
      console.warn(`[AdminLogin] Password mismatch for derived UID: "${adminUid}"`);
      return res.status(401).json({ success: false, error: 'Invalid password' });
    }

    // Generate JWT token
    const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
    const token = jwt.sign(
      { 
        email: adminData.email || emailLower, 
        isAdmin: true, 
        uid: adminUid 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log(`[AdminLogin] Password matched successfully. Generated JWT for UID: "${adminUid}".`);

    return res.status(200).json({
      success: true,
      token,
      admin: {
        email: adminData.email || emailLower,
        uid: adminUid,
        canAccessAllData: adminData.canAccessAllData !== false,
        isAdmin: true
      }
    });

  } catch (error: any) {
    console.error('Serverless error in admin login handler:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal Server Error' 
    });
  }
}
