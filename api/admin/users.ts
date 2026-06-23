import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
const CUSTOM_DB_ID = 'ai-studio-326159a1-d34a-4219-9e8c-edc19a926edb';

// Initialize the Firebase Admin SDK safely
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
      console.error('Error parsing FIREBASE_CONFIG env in admin users integrated:', error);
      admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
    }
  } else {
    admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
  }
}

const db = getFirestore(admin.app(), CUSTOM_DB_ID);

function cleanTimestamp(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val.toDate === 'function') {
    return val.toDate().toISOString();
  }
  if (val && typeof val === 'object') {
    const secs = val._seconds || val.seconds;
    if (secs !== undefined) {
      return new Date(secs * 1000).toISOString();
    }
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

// Authentication check for Vercel functions
function authenticateAdminToken(req: any) {
  const authHeader = req.headers['x-admin-token'] || req.headers.authorization;
  console.log('[Auth Log Unified] Received Authorization header:', authHeader ? 'Present' : 'Missing');

  if (!authHeader) {
    console.warn('[Auth Log Unified] Denying request: No Authorization or x-admin-token header found');
    throw new Error('Admin authentication is required. Token is missing.');
  }

  const authStr = typeof authHeader === 'string' ? authHeader : String(authHeader);
  const token = authStr.toLowerCase().startsWith('bearer ')
    ? authStr.substring(7).trim()
    : authStr.trim();

  if (!token || token === 'null' || token === 'undefined' || token === '') {
    console.warn('[Auth Log Unified] Denying request: Token resolved to empty/null/undefined.');
    throw new Error('Admin authentication is required. Token is invalid.');
  }

  let decoded: any = null;

  // 1. Try process.env.JWT_SECRET
  if (process.env.JWT_SECRET) {
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err: any) {
      console.warn('[Auth Log Unified] Verification failed with custom process.env.JWT_SECRET:', err.message || err);
    }
  }

  // 2. Try standard fallback secret
  if (!decoded) {
    try {
      decoded = jwt.verify(token, 'lone-star-fence-secret');
    } catch (err: any) {
      console.error('[Auth Log Unified] Both custom and fallback JWT verification failed.');
      throw new Error(`Access denied. Invalid or expired admin token. Reason: ${err.message || 'unknown'}`);
    }
  }

  // 3. Admin validation
  if (decoded && typeof decoded === 'object' && (decoded as any).isAdmin) {
    return decoded;
  }

  console.warn('[Auth Log Unified] Valid token but missing isAdmin privilege. Decoded payload:', decoded);
  throw new Error('Access denied. Invalid or expired admin token.');
}

// GET all users/admins
export async function listUsers(req: any, res: any) {
  try {
    const isEmployeesReq = req.query?.type === 'employees' || req.query?.role === 'employee';
    if (isEmployeesReq) {
      const employeesSnap = await db.collection('employees').get();
      const employeesList: any[] = [];
      employeesSnap.forEach(doc => {
        const data = doc.data();
        if (doc.id !== '_trigger') {
          employeesList.push({
            email: data.email || doc.id,
            name: data.name || '',
            phone: data.phone || '',
            role: data.role || '',
            password: data.password || '',
            permission: data.permission || data.permissionLevel || 'View Only',
            permissionLevel: data.permissionLevel || data.permission || 'View Only',
            isActive: data.isActive !== false,
            active: data.active !== false,
            canReceiveCrewDispatch: data.canReceiveCrewDispatch !== false,
            canReceiveCrewDispatchEmails: data.canReceiveCrewDispatchEmails !== false,
            isPrimaryCrewContact: !!data.isPrimaryCrewContact,
            primaryCrewContact: !!data.primaryCrewContact,
            createdAt: cleanTimestamp(data.createdAt),
            updatedAt: cleanTimestamp(data.updatedAt)
          });
        }
      });
      employeesList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return res.status(200).json(employeesList);
    }

    const adminsList: any[] = [];
    const adminsSnap = await db.collection('admins').get();
    adminsSnap.forEach(doc => {
      const data = doc.data();
      adminsList.push({
        uid: doc.id,
        email: data.email || '',
        name: data.name || data.displayName || data.email?.split('@')[0] || 'No Name',
        displayName: data.displayName || data.name || data.email?.split('@')[0] || 'No Name',
        tier: data.tier || data.subscriptionTier || 'paid',
        subscriptionTier: data.subscriptionTier || data.tier || 'paid',
        isAdmin: true,
        isDisabled: !!data.isDisabled,
        createdAt: cleanTimestamp(data.createdAt),
        estimatesCount: 0
      });
    });

    const usersSnap = await db.collection('users').get();
    const usersPromises = usersSnap.docs.map(async (doc) => {
      const data = doc.data();
      const estSnap = await db.collection('users').doc(doc.id).collection('estimates').select().get();
      return {
        uid: doc.id,
        email: data.email || '',
        name: data.name || data.displayName || data.email?.split('@')[0] || 'No Name',
        displayName: data.displayName || data.name || data.email?.split('@')[0] || 'No Name',
        tier: data.tier || data.subscriptionTier || 'free',
        subscriptionTier: data.subscriptionTier || data.tier || 'free',
        isAdmin: false,
        isDisabled: !!data.isDisabled,
        createdAt: cleanTimestamp(data.createdAt),
        estimatesCount: estSnap.size
      };
    });

    const resolvedUsers = await Promise.all(usersPromises);
    const combined = [...adminsList, ...resolvedUsers];
    combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return res.status(200).json(combined);
  } catch (error: any) {
    console.error('Error listing users:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

// CREATE manual user
export async function createUser(req: any, res: any, dbInstance?: any) {
  try {
    const firestoreDb = dbInstance || db;
    const { email, name, subscriptionTier, password } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'Email and Name are required' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Initial Password is required' });
    }
    if (!firestoreDb) {
      return res.status(503).json({ error: 'Database offline' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const userId = `usr-${Math.random().toString(36).substring(2, 11)}`;
    const finalTier = subscriptionTier || 'free';

    const newUser = {
      uid: userId,
      email: email.toLowerCase().trim(),
      name: name.trim(),
      displayName: name.trim(),
      tier: finalTier,
      subscriptionTier: finalTier,
      passwordHash: passwordHash,
      createdAt: new Date().toISOString(),
      isDisabled: false,
      isAdmin: false
    };

    await firestoreDb.collection('users').doc(userId).set(newUser);
    return res.status(200).json({ success: true, user: newUser });
  } catch (error: any) {
    console.error('Error creating user:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

// UPDATE user details
export async function updateUser(req: any, res: any, dbInstance?: any) {
  try {
    const firestoreDb = dbInstance || db;
    const userId = req.params?.userId || req.body.userId || req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const { email, name, subscriptionTier, isDisabled, password } = req.body;
    if (!firestoreDb) {
      return res.status(503).json({ error: 'Database offline' });
    }

    const updateData: any = {
      updatedAt: new Date().toISOString()
    };

    if (email !== undefined) updateData.email = email.toLowerCase().trim();
    if (name !== undefined) {
      updateData.name = name.trim();
      updateData.displayName = name.trim();
    }
    if (subscriptionTier !== undefined) {
      updateData.tier = subscriptionTier;
      updateData.subscriptionTier = subscriptionTier;
    }
    if (isDisabled !== undefined) {
      updateData.isDisabled = isDisabled;
    }
    if (password !== undefined && password !== '') {
      const salt = await bcrypt.genSalt(10);
      updateData.passwordHash = await bcrypt.hash(password, salt);
    }

    await firestoreDb.collection('users').doc(userId).update(updateData);
    return res.status(200).json({ success: true, user: { uid: userId, email, name, subscriptionTier, isDisabled } });
  } catch (error: any) {
    console.error('Error updating user:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

// DELETE user & clean estimates subcollection
export async function deleteUser(req: any, res: any, dbInstance?: any) {
  try {
    const firestoreDb = dbInstance || db;
    const userId = req.params?.userId || req.body.userId || req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    if (!firestoreDb) {
      return res.status(503).json({ error: 'Database offline' });
    }

    // Clean up subcollection estimates
    const estSnap = await firestoreDb.collection('users').doc(userId).collection('estimates').get();
    const batch = firestoreDb.batch();
    estSnap.docs.forEach((doc: any) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Delete user doc
    await firestoreDb.collection('users').doc(userId).delete();
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

// Complete handler mapping (Vercel Entry Point / Multi-method router)
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

  try {
    // Authenticate Admin Token
    authenticateAdminToken(req);

    const method = req.method;
    const userId = req.body?.userId || req.query?.userId || (req.query?.params ? req.query.params[0] : null);
    const action = req.body?.action || req.query?.action || (req.query?.params ? req.query.params[1] : null);

    if (method === 'GET') {
      if (userId) {
        if (action === 'estimates') {
          // List specific user's estimates
          const estSnap = await db.collection('users').doc(userId).collection('estimates').get();
          const list = estSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
          return res.status(200).json(list);
        } else {
          // Get specific user details
          const uRef = await db.collection('users').doc(userId).get();
          if (!uRef.exists) {
            return res.status(404).json({ error: 'User not found' });
          }
          return res.status(200).json({ uid: uRef.id, ...uRef.data() });
        }
      } else {
        // Standard GET users list
        return await listUsers(req, res);
      }
    } else if (method === 'POST') {
      if (action === 'create' || req.body?.password) {
        return await createUser(req, res);
      } else if (action === 'tier') {
        const { tier } = req.body;
        if (!tier || !['free', 'paid'].includes(tier)) {
          return res.status(400).json({ error: 'Invalid subscription tier' });
        }
        await db.collection('users').doc(userId).update({ tier: tier, subscriptionTier: tier, updatedAt: new Date().toISOString() });
        return res.status(200).json({ success: true, tier });
      } else if (action === 'disable') {
        await db.collection('users').doc(userId).update({ isDisabled: true, updatedAt: new Date().toISOString() });
        return res.status(200).json({ success: true, isDisabled: true });
      } else if (action === 'enable') {
        await db.collection('users').doc(userId).update({ isDisabled: false, updatedAt: new Date().toISOString() });
        return res.status(200).json({ success: true, isDisabled: false });
      } else {
        return res.status(400).json({ error: 'Invalid POST action or payload' });
      }
    } else if (method === 'PUT') {
      return await updateUser(req, res);
    } else if (method === 'DELETE') {
      return await deleteUser(req, res);
    } else {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
  } catch (error: any) {
    console.error(`Unified User Router Error:`, error);
    const statusCode = error.message?.includes('Access denied') || error.message?.includes('authentication') ? 401 : 500;
    return res.status(statusCode).json({ error: error.message || 'Internal Server Error' });
  }
}
