import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

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

    const emailLower = email.toLowerCase().trim();
    const pwd = password.trim();

    // Handle Admin Users (Direct Email Sign-In / Estimator Admin Account)
    if (emailLower === 'bradens@lonestarfenceworks.com' || emailLower === 'usmc6123@gmail.com') {
      let adminDoc: any = null;

      // 1. Try querying /admins collection
      try {
        const adminsCollection = collection(firestoreDb, 'admins');
        const adminQuery = query(adminsCollection, where('email', '==', emailLower));
        const querySnapshot = await getDocs(adminQuery);
        if (!querySnapshot.empty) {
          adminDoc = querySnapshot.docs[0];
        }
      } catch (err) {
        console.warn('Failed to query admins collection:', err);
      }

      // 2. Fallback: Try querying /admin_users collection if admins didn't yield result
      if (!adminDoc) {
        try {
          const adminUsersCollection = collection(firestoreDb, 'admin_users');
          const adminUsersQuery = query(adminUsersCollection, where('email', '==', emailLower));
          const querySnapshotFallback = await getDocs(adminUsersQuery);
          if (!querySnapshotFallback.empty) {
            adminDoc = querySnapshotFallback.docs[0];
          }
        } catch (err) {
          console.warn('Failed to query admin_users collection:', err);
        }
      }

      if (!adminDoc) {
        return res.status(404).json({ success: false, error: 'Admin record not found in database.' });
      }

      const adminData = adminDoc.data();
      let adminUid = adminDoc.id;
      if (emailLower === 'bradens@lonestarfenceworks.com') {
        adminUid = 'braden-lonestar-uid'; // Enforce the required ID
      }

      // Verify password with bcryptjs
      const isMatch = await bcrypt.compare(pwd, adminData.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ success: false, error: 'Access Denied: Incorrect email or password.' });
      }

      // Create JWT token for session persistence
      const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
      const token = jwt.sign(
        { email: adminData.email, isAdmin: true, uid: adminUid },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.status(200).json({
        success: true,
        userId: adminUid, // support any legacy format expecting userId
        token,
        user: {
          uid: adminUid,
          email: adminData.email,
          name: emailLower === 'bradens@lonestarfenceworks.com' ? 'Braden' : 'Admin',
          displayName: emailLower === 'bradens@lonestarfenceworks.com' ? 'Braden' : 'Admin',
          tier: 'paid',
          subscriptionTier: 'paid',
          isAdmin: true
        }
      });
    }

    // Handle normal customers
    const usersCollection = collection(firestoreDb, 'users');
    const userQuery = query(usersCollection, where('email', '==', emailLower));
    const querySnapshot = await getDocs(userQuery);

    if (querySnapshot.empty) {
      return res.status(401).json({ success: false, error: 'Access Denied: Incorrect email or password.' });
    }

    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();

    if (userData.isDisabled) {
      return res.status(403).json({ success: false, error: 'Access Denied: This account has been disabled.' });
    }

    if (!userData.passwordHash) {
      return res.status(401).json({ success: false, error: 'Access Denied: Account not configured with local password login.' });
    }

    const isMatch = await bcrypt.compare(pwd, userData.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Access Denied: Incorrect email or password.' });
    }

    return res.status(200).json({
      success: true,
      user: {
        uid: userData.uid || userDoc.id,
        email: userData.email,
        name: userData.name || userData.displayName || 'Client',
        displayName: userData.displayName || userData.name || 'Client',
        tier: userData.tier || userData.subscriptionTier || 'free',
        subscriptionTier: userData.subscriptionTier || userData.tier || 'free'
      }
    });

  } catch (error: any) {
    console.error('Serverless error in user login handler:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal Server Error' 
    });
  }
}
