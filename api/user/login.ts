import * as admin from 'firebase-admin';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Safely parse service account credentials from environment variables
const serviceAccount = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : null;
let adminApp: any = null;

if (serviceAccount) {
  try {
    const apps = admin.apps || [];
    if (apps.length === 0) {
      let privateKey = serviceAccount.private_key || serviceAccount.privateKey;
      if (privateKey) {
        privateKey = privateKey.replace(/\\n/g, '\n');
      }
      adminApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: serviceAccount.project_id || serviceAccount.projectId,
          clientEmail: serviceAccount.client_email || serviceAccount.clientEmail,
          privateKey: privateKey
        }),
        projectId: serviceAccount.project_id || serviceAccount.projectId
      });
      console.log('[UserLogin-Admin] Direct Firebase Admin initialized successfully.');
    } else {
      adminApp = apps[0];
      console.log('[UserLogin-Admin] Utilizing existing initialized Firebase Admin App.');
    }
  } catch (initErr: any) {
    console.error('[UserLogin-Admin] Error during inline Admin SDK initialization:', initErr.message || initErr);
  }
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

    let firestoreDb: any = null;
    try {
      firestoreDb = admin.firestore(adminApp);
    } catch (initErr: any) {
      console.error('[UserLogin-Admin] Firebase Admin Firestore acquisition failed:', initErr.message);
      return res.status(503).json({ success: false, error: 'Firebase Admin Firestore acquisition failed' });
    }

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

      // Direct fetch of the /admins collection by document ID (UID) using Firebase Admin
      const adminDocRef = firestoreDb.collection('admins').doc(adminUid);
      console.log(`[UserLogin-Admin] Fetching "/admins" collection document with ID: "${adminUid}" using Admin SDK`);
      const adminSnap = await adminDocRef.get();

      let adminData: any = null;

      if (adminSnap.exists) {
        adminData = adminSnap.data();
        console.log(`[UserLogin-Admin] SUCCESS: Found admin record in "/admins/${adminUid}". Payload attributes:`, JSON.stringify(adminData));
      } else {
        console.warn(`[UserLogin-Admin] WARNING: Admin record not found in "/admins/${adminUid}". Trying fallback "/admin_users"...`);
        try {
          const fallbackDocRef = firestoreDb.collection('admin_users').doc(adminUid);
          const fallbackSnap = await fallbackDocRef.get();
          if (fallbackSnap.exists) {
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
        userId: adminUid,
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

    // Handle normal customers using Admin SDK
    console.log(`[UserLogin-Customer] Querying "/users" collection for email: "${emailLower}" using Admin SDK`);
    const querySnapshot = await firestoreDb.collection('users').where('email', '==', emailLower).get();

    if (querySnapshot.empty) {
      console.warn(`[UserLogin-Customer] No customer found with email: "${emailLower}"`);
      return res.status(401).json({ success: false, error: 'Access Denied: Incorrect email or password.' });
    }

    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();

    if (userData.isDisabled) {
      console.warn(`[UserLogin-Customer] Customer with email: "${emailLower}" is disabled`);
      return res.status(403).json({ success: false, error: 'Access Denied: This account has been disabled.' });
    }

    if (!userData.passwordHash) {
      console.error(`[UserLogin-Customer] Customer found but has no passwordHash set.`);
      return res.status(401).json({ success: false, error: 'Access Denied: Account not configured with local password login.' });
    }

    const isMatch = await bcrypt.compare(pwd, userData.passwordHash);
    if (!isMatch) {
      console.warn(`[UserLogin-Customer] Password mismatch for customer email: "${emailLower}"`);
      return res.status(401).json({ success: false, error: 'Access Denied: Incorrect email or password.' });
    }

    const customerUid = userData.uid || userDoc.id;
    console.log(`[UserLogin-Customer] SUCCESS: Customer Authenticated, UID: "${customerUid}"`);

    return res.status(200).json({
      success: true,
      user: {
        uid: customerUid,
        email: userData.email,
        name: userData.name || userData.displayName || 'Client',
        displayName: userData.displayName || userData.name || 'Client',
        tier: userData.tier || userData.subscriptionTier || 'free',
        subscriptionTier: userData.subscriptionTier || userData.tier || 'free'
      }
    });

  } catch (error: any) {
    console.error('[AdminLogin] CRITICAL ERROR:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
      name: error.name
    });
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal Server Error',
      details: error.code || error.name
    });
  }
}
