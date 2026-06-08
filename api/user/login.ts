import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
const CUSTOM_DB_ID = 'ai-studio-326159a1-d34a-4219-9e8c-edc19a926edb';

// Initialize the Firebase Admin SDK
if (admin.apps.length === 0) {
  const firebaseConfigEnv = process.env.FIREBASE_CONFIG;
  if (firebaseConfigEnv) {
    try {
      const parsedConfig = JSON.parse(firebaseConfigEnv);
      
      if (parsedConfig.private_key || parsedConfig.client_email) {
        admin.initializeApp({
          credential: admin.credential.cert(parsedConfig),
        });
      } else {
        admin.initializeApp({
          projectId: parsedConfig.projectId || 'dazzling-card-485210-r8',
        });
      }
    } catch (error) {
      console.error('Error parsing FIREBASE_CONFIG env:', error);
      admin.initializeApp({
        projectId: 'dazzling-card-485210-r8',
      });
    }
  } else {
    // Graceful fallback for local development or Standard Google Application Default Credentials
    admin.initializeApp({
      projectId: 'dazzling-card-485210-r8',
    });
  }
}

// Get the Firestore instance targeting the specific custom database ID
const db = getFirestore(admin.app(), CUSTOM_DB_ID);

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const emailLower = email.toLowerCase().trim();

    let targetUser: any = null;
    let isAdminUser = false;
    let userUid = '';

    // Step 1: Query the /admins collection by email
    const adminsQuery = await db.collection('admins')
      .where('email', '==', emailLower)
      .limit(1)
      .get();

    if (!adminsQuery.empty) {
      const adminDoc = adminsQuery.docs[0];
      targetUser = adminDoc.data();
      userUid = adminDoc.id;
      isAdminUser = true;
    } else {
      // Step 2: Query the /users collection by email if not found in /admins
      const usersQuery = await db.collection('users')
        .where('email', '==', emailLower)
        .limit(1)
        .get();

      if (!usersQuery.empty) {
        const userDoc = usersQuery.docs[0];
        targetUser = userDoc.data();
        userUid = userDoc.id;
        isAdminUser = false;
      }
    }

    // Standard credential validation checks
    if (!targetUser) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (targetUser.isDisabled) {
      return res.status(403).json({ error: 'Account disabled' });
    }

    // bcrypt comparison against passwordHash
    const isMatch = await bcrypt.compare(password.trim(), targetUser.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Force exact UID for Braden's account regardless of its document ID in Firestore
    if (emailLower === 'bradens@lonestarfenceworks.com') {
      userUid = 'braden-lonestar-uid';
    }

    // Sign the JWT
    const token = jwt.sign(
      { email: targetUser.email, isAdmin: isAdminUser, uid: userUid },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return exact user profile fields
    return res.status(200).json({
      success: true,
      token,
      isAdmin: isAdminUser,
      user: {
        uid: userUid,
        email: targetUser.email,
        name: targetUser.name || targetUser.displayName || '',
        displayName: targetUser.displayName || targetUser.name || '',
        tier: targetUser.tier || targetUser.subscriptionTier || 'free',
        subscriptionTier: targetUser.subscriptionTier || targetUser.tier || 'free',
        isAdmin: isAdminUser
      }
    });

  } catch (error: any) {
    console.error('Server Login Handler Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
