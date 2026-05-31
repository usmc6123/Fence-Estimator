import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';

const firebaseConfig = {
  projectId: "dazzling-card-485210-r8",
  apiKey: "AIzaSyDzF73c-QZN6T0_ldVELubP5mEvucsZ9JQ",
  authDomain: "dazzling-card-485210-r8.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-326159a1-d34a-4219-9e8c-edc19a926edb",
  storageBucket: "dazzling-card-485210-r8.firebasestorage.app",
  messagingSenderId: "301045874568"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const emailLower = email.toLowerCase().trim();

    let targetUser: any = null;
    let isAdminUser = false;
    let userUid = '';

    const adminsSnap = await getDocs(collection(db, 'admins'));
    const adminDoc = adminsSnap.docs.find((d: any) => d.data().email?.toLowerCase() === emailLower);

    if (adminDoc) {
      targetUser = adminDoc.data();
      userUid = adminDoc.id;
      if (emailLower === 'bradens@lonestarfenceworks.com') {
        userUid = 'braden-lonestar-uid';
      }
      isAdminUser = true;
    } else {
      const usersSnap = await getDocs(collection(db, 'users'));
      const userDoc = usersSnap.docs.find((d: any) => d.data().email?.toLowerCase() === emailLower);
      if (userDoc) {
        targetUser = userDoc.data();
        userUid = userDoc.id;
        isAdminUser = false;
      }
    }

    if (!targetUser) return res.status(401).json({ error: 'Invalid credentials' });
    if (targetUser.isDisabled) return res.status(403).json({ error: 'Account disabled' });

    const isMatch = await bcrypt.compare(password.trim(), targetUser.passwordHash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ email: targetUser.email, isAdmin: isAdminUser, uid: userUid }, JWT_SECRET, { expiresIn: '24h' });

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
    console.error('Login error:', error);
    return res.status(500).json({ error: error.message });
  }
}
