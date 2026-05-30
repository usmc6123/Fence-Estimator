import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFileSync, existsSync } from 'fs';

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

    const emailLower = email.toLowerCase().trim();
    const pwd = password.trim();

    // Handle Admin Users (Direct Email Sign-In / Estimator Admin Account)
    if (emailLower === 'bradens@lonestarfenceworks.com' || emailLower === 'usmc6123@gmail.com') {
      let adminUid = '';
      if (emailLower === 'bradens@lonestarfenceworks.com') {
        adminUid = 'braden-lonestar-uid';
        console.log(`[UserLogin-Admin] Explicit hardcoded check matched: "${emailLower}". Using doc ID: "${adminUid}"`);
      } else {
        adminUid = emailLower.replace(/[^a-zA-Z0-9]/g, '-');
        console.log(`[UserLogin-Admin] Custom email matched: "${emailLower}". Derived doc ID: "${adminUid}"`);
      }

      console.log(`[UserLogin-Admin] Attempting login. Received Email: "${emailLower}". Final query UID: "${adminUid}"`);

      // Direct fetch of the /admins collection by document ID (UID)
      const adminDocRef = doc(firestoreDb, 'admins', adminUid);
      console.log(`[UserLogin-Admin] Fetching "/admins" collection document with ID: "${adminUid}"`);
      const adminSnap = await getDoc(adminDocRef);

      let adminData: any = null;

      if (adminSnap.exists()) {
        adminData = adminSnap.data();
        console.log(`[UserLogin-Admin] SUCCESS: Found admin record in "/admins/${adminUid}". Payload attributes:`, JSON.stringify(adminData));
      } else {
        console.warn(`[UserLogin-Admin] WARNING: Admin record not found in "/admins/${adminUid}". Trying fallback "/admin_users"...`);
        try {
          const fallbackDocRef = doc(firestoreDb, 'admin_users', adminUid);
          const fallbackSnap = await getDoc(fallbackDocRef);
          if (fallbackSnap.exists()) {
            adminData = fallbackSnap.data();
            console.log(`[UserLogin-Admin] SUCCESS: Found admin record in fallback "/admin_users/${adminUid}". Data:`, JSON.stringify(adminData));
          } else {
            console.error(`[UserLogin-Admin] ERROR: Admin record not found in fallback "/admin_users/${adminUid}" either.`);
          }
        } catch (fallbackErr: any) {
          console.error(`[UserLogin-Admin] CRITICAL fallback admin_users document query failed:`, fallbackErr.message || fallbackErr);
        }
      }

      if (!adminData) {
        console.error(`[UserLogin-Admin] Admin record not found in database for derived UID: "${adminUid}" (email: "${emailLower}")`);
        return res.status(404).json({ success: false, error: 'Admin record not found in database.' });
      }

      const storedHash = adminData.passwordHash;

      if (!storedHash) {
        console.error(`[UserLogin-Admin] Admin record exists but has no passwordHash set.`);
        return res.status(401).json({ success: false, error: 'Invalid password' });
      }

      // Verify password with bcryptjs
      const isMatch = await bcrypt.compare(pwd, storedHash);
      if (!isMatch) {
        console.warn(`[UserLogin-Admin] Password mismatch for derived UID: "${adminUid}"`);
        return res.status(401).json({ success: false, error: 'Access Denied: Incorrect email or password.' });
      }

      // Create JWT token for session persistence
      const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
      const token = jwt.sign(
        { email: adminData.email || emailLower, isAdmin: true, uid: adminUid },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      console.log(`[UserLogin-Admin] Password matched successfully. Generated JWT for UID: "${adminUid}".`);

      return res.status(200).json({
        success: true,
        userId: adminUid, // support any legacy format expecting userId
        token,
        user: {
          uid: adminUid,
          email: adminData.email || emailLower,
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
