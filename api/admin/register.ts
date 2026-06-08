import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import bcrypt from 'bcryptjs';

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
    const { name, email, password, tier, subscriptionTier } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, Email, and Password are required' });
    }

    const emailLower = email.toLowerCase().trim();

    // Check for duplicate accounts in users and admins to give a helpful error
    const usersQuery = await db.collection('users')
      .where('email', '==', emailLower)
      .limit(1)
      .get();

    const adminsQuery = await db.collection('admins')
      .where('email', '==', emailLower)
      .limit(1)
      .get();

    if (!usersQuery.empty || !adminsQuery.empty) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password.trim(), salt);

    const userId = `usr-${Math.random().toString(36).substring(2, 11)}`;
    const chosenTier = tier || subscriptionTier || 'free';

    const newUser = {
      uid: userId,
      email: emailLower,
      name: name.trim(),
      displayName: name.trim(),
      tier: chosenTier,
      subscriptionTier: chosenTier,
      passwordHash,
      createdAt: new Date().toISOString(),
      isDisabled: false,
      isAdmin: false
    };

    await db.collection('users').doc(userId).set(newUser);

    return res.status(200).json(newUser);

  } catch (error: any) {
    console.error('Register API Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
