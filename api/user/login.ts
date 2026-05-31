import admin from 'firebase-admin';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
let dbInstance: any = null;

function getAdminDb() {
  console.log('FIREBASE_CONFIG env var exists:', !!process.env.FIREBASE_CONFIG);
  console.log('FIREBASE_CONFIG length:', process.env.FIREBASE_CONFIG?.length);
  if (process.env.FIREBASE_CONFIG) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_CONFIG);
      console.log('Successfully parsed FIREBASE_CONFIG env var. Project ID:', parsed.projectId);
    } catch (parseErr: any) {
      console.error('Error parsing FIREBASE_CONFIG env var:', parseErr.message || parseErr);
    }
  }

  if (dbInstance) return dbInstance;
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      console.log('Local config file "firebase-applet-config.json" exists. Processing...');
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (admin.apps.length === 0) {
        admin.initializeApp({
          projectId: firebaseConfig.projectId,
        });
        console.log('Admin SDK initialized successfully with local JSON config. Project ID:', firebaseConfig.projectId);
      } else {
        console.log('Admin SDK already initialized with existing apps.');
      }
      const databaseId = firebaseConfig.firestoreDatabaseId;
      if (databaseId && databaseId !== '(default)') {
        try {
          console.log(`Setting firestore instance to custom databaseId: "${databaseId}"`);
          dbInstance = admin.firestore(databaseId);
        } catch (err) {
          console.warn('Failed to construct firestore with databaseId, trying default:', err);
          dbInstance = admin.firestore();
        }
      } else {
        console.log('Setting firestore instance to default database.');
        dbInstance = admin.firestore();
      }
    } else {
      console.log('No local configuration file. Initializing Admin SDK with fallback/default credential environment paths...');
      if (admin.apps.length === 0) {
        admin.initializeApp();
        console.log('Admin v1 SDK app initialized successfully with default environment credential settings.');
      } else {
        console.log('Admin SDK already initialized with existing apps.');
      }
      dbInstance = admin.firestore();
    }
  } catch (err) {
    console.error('Failed to initialize Admin Firestore:', err);
  }
  return dbInstance;
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
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const emailLower = email.toLowerCase().trim();
    const pwd = password.trim();

    const firestoreDb = getAdminDb();
    if (!firestoreDb) {
      return res.status(503).json({ error: 'Database service offline' });
    }

    // Handle direct admin access via main app login
    if (emailLower === 'bradens@lonestarfenceworks.com' || emailLower === 'usmc6123@gmail.com') {
      const adminsSnap = await firestoreDb.collection('admins').get();
      const adminDoc = adminsSnap.docs.find((d: any) => d.data().email?.toLowerCase() === emailLower);

      if (!adminDoc) {
        return res.status(404).json({ error: 'Admin record not found in database.' });
      }

      const adminData = adminDoc.data();
      let adminUid = adminDoc.id;
      if (emailLower === 'bradens@lonestarfenceworks.com') {
        adminUid = 'braden-lonestar-uid';
      }

      // Verify password with bcryptjs
      const isMatch = await bcrypt.compare(pwd, adminData.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Access Denied: Incorrect email or password.' });
      }

      // Create JWT for persistence
      const token = jwt.sign(
        { email: adminData.email, isAdmin: true, uid: adminUid },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      return res.status(200).json({
        success: true,
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

    // Look up standard user in Firestore
    const snap = await firestoreDb.collection('users').get();
    const userDoc = snap.docs.find((d: any) => d.data().email?.toLowerCase() === emailLower);

    if (!userDoc) {
      return res.status(401).json({ error: 'Access Denied: Incorrect email or password.' });
    }

    const userData = userDoc.data();
    
    if (userData.isDisabled) {
      return res.status(403).json({ error: 'Access Denied: This account has been disabled.' });
    }

    if (!userData.passwordHash) {
      return res.status(401).json({ error: 'Access Denied: Account not configured with local password login.' });
    }

    const isMatch = await bcrypt.compare(pwd, userData.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Access Denied: Incorrect email or password.' });
    }

    // Create JWT for regular user
    const token = jwt.sign(
      { email: userData.email, isAdmin: false, uid: userData.uid || userDoc.id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      success: true,
      token,
      user: {
        uid: userData.uid || userDoc.id,
        email: userData.email,
        name: userData.name || userData.displayName || 'Client',
        displayName: userData.displayName || userData.name || 'Client',
        tier: userData.tier || userData.subscriptionTier || 'free',
        subscriptionTier: userData.subscriptionTier || userData.tier || 'free',
        isAdmin: false
      }
    });
  } catch (error: any) {
    console.error('Error in custom client login:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
