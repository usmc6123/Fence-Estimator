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
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Admin-Token, Authorization'
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
      return res.status(503).json({ error: 'Database service is offline' });
    }

    let targetUser: any = null;
    let isAdminUser = false;
    let userUid = '';

    // Query collection('admins') for matching admin emails
    const adminsSnap = await firestoreDb.collection('admins').get();
    const adminDoc = adminsSnap.docs.find((d: any) => d.data().email?.toLowerCase() === emailLower);

    if (adminDoc) {
      targetUser = adminDoc.data();
      userUid = adminDoc.id;
      if (emailLower === 'bradens@lonestarfenceworks.com') {
        userUid = 'braden-lonestar-uid';
      }
      isAdminUser = true;
    } else {
      // If not in admins, query collection('users') for regular users
      const usersSnap = await firestoreDb.collection('users').get();
      const userDoc = usersSnap.docs.find((d: any) => d.data().email?.toLowerCase() === emailLower);

      if (userDoc) {
        targetUser = userDoc.data();
        userUid = userDoc.id;
        isAdminUser = false;
      }
    }

    if (!targetUser) {
      return res.status(401).json({ error: 'Access Denied: Incorrect email or password.' });
    }

    if (targetUser.isDisabled) {
      return res.status(403).json({ error: 'Access Denied: This account has been disabled.' });
    }

    const passwordHash = targetUser.passwordHash;
    if (!passwordHash) {
      return res.status(401).json({ error: 'Access Denied: Account not configured with local password login.' });
    }

    // Verify password with bcryptjs
    const isMatch = await bcrypt.compare(pwd, passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Access Denied: Incorrect email or password.' });
    }

    // Return JWT token (regular JWT)
    const token = jwt.sign(
      {
        email: targetUser.email,
        isAdmin: isAdminUser,
        uid: userUid
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      success: true,
      token,
      user: {
        uid: userUid,
        email: targetUser.email,
        name: targetUser.name || targetUser.displayName || (isAdminUser ? 'Admin' : 'Client'),
        displayName: targetUser.displayName || targetUser.name || (isAdminUser ? 'Admin' : 'Client'),
        tier: targetUser.tier || targetUser.subscriptionTier || (isAdminUser ? 'paid' : 'free'),
        subscriptionTier: targetUser.subscriptionTier || targetUser.tier || (isAdminUser ? 'paid' : 'free'),
        isAdmin: isAdminUser
      }
    });
  } catch (error: any) {
    console.error('Error in /api/user-login:', error);
    return res.status(500).json({
      error: error.message || 'Internal Server Error'
    });
  }
}
