import admin from 'firebase-admin';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
let dbInstance: any = null;

function getAdminDb() {
  if (dbInstance) return dbInstance;
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (admin.apps.length === 0) {
        admin.initializeApp();  // <-- NO arguments, use default credentials
      }
      const databaseId = firebaseConfig.firestoreDatabaseId;
      if (databaseId && databaseId !== '(default)') {
        try {
          dbInstance = admin.firestore(databaseId);
        } catch (err) {
          dbInstance = admin.firestore();
        }
      } else {
        dbInstance = admin.firestore();
      }
    } else {
      if (admin.apps.length === 0) {
        admin.initializeApp();
      }
      dbInstance = admin.firestore();
    }
  } catch (err) {
    console.error('Failed to initialize Admin Firestore:', err);
  }
  return dbInstance;
}

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
    const firestoreDb = getAdminDb();
    if (!firestoreDb) return res.status(503).json({ error: 'Database offline' });

    let targetUser: any = null;
    let isAdminUser = false;
    let userUid = '';

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
      const usersSnap = await firestoreDb.collection('users').get();
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
