import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

// Load Firebase configuration
let db: any = null;

function getDbInstance() {
  if (db) return db;

  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
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

    // Query /admins collection for the email
    const adminsCollection = collection(firestoreDb, 'admins');
    const adminQuery = query(adminsCollection, where('email', '==', emailLower));
    const querySnapshot = await getDocs(adminQuery);

    let adminDoc: any = null;

    if (!querySnapshot.empty) {
      adminDoc = querySnapshot.docs[0];
    } else {
      // Fallback: Query /admin_users collection
      try {
        const adminUsersCollection = collection(firestoreDb, 'admin_users');
        const adminUsersQuery = query(adminUsersCollection, where('email', '==', emailLower));
        const querySnapshotFallback = await getDocs(adminUsersQuery);
        if (!querySnapshotFallback.empty) {
          adminDoc = querySnapshotFallback.docs[0];
        }
      } catch (err) {
        console.warn('Failed fallback query to admin_users:', err);
      }
    }

    if (!adminDoc) {
      return res.status(404).json({ success: false, error: 'Admin record not found in database.' });
    }

    const adminData = adminDoc.data();
    const storedHash = adminData.passwordHash;

    if (!storedHash) {
      return res.status(401).json({ success: false, error: 'Invalid password' });
    }

    // Compare incoming password with stored hash using bcryptjs
    const isMatch = await bcrypt.compare(password, storedHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid password' });
    }

    let adminUid = adminDoc.id;
    if (emailLower === 'bradens@lonestarfenceworks.com') {
      adminUid = 'braden-lonestar-uid';
    }

    // Generate JWT token
    const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
    const token = jwt.sign(
      { 
        email: adminData.email, 
        isAdmin: true, 
        uid: adminUid 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      success: true,
      token,
      admin: {
        email: adminData.email,
        uid: adminUid,
        canAccessAllData: adminData.canAccessAllData || true,
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
