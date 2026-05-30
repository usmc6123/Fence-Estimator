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
    let firebaseConfig: any = null;

    // 1. Try to read FIREBASE_CONFIG from process.env.FIREBASE_CONFIG
    const envConfig = process.env.FIREBASE_CONFIG;
    if (envConfig) {
      try {
        firebaseConfig = JSON.parse(envConfig);
        console.log('Successfully parsed FIREBASE_CONFIG env variable for firebase-admin.');
      } catch (e: any) {
        console.error('Failed to parse FIREBASE_CONFIG env variable:', e);
      }
    }

    // 2. Fall back to firebase-applet-config.json for local dev
    if (!firebaseConfig) {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        console.log('Successfully loaded firebase-applet-config.json for firebase-admin.');
      }
    }

    if (firebaseConfig) {
      if (admin.apps.length === 0) {
        const initOptions: any = {};

        // Parse service account credentials if present
        if (firebaseConfig.private_key && firebaseConfig.client_email) {
          const privateKey = typeof firebaseConfig.private_key === 'string'
            ? firebaseConfig.private_key.replace(/\\n/g, '\n')
            : firebaseConfig.private_key;
          initOptions.credential = admin.credential.cert({
            ...firebaseConfig,
            private_key: privateKey,
          });
        }

        initOptions.projectId = firebaseConfig.projectId || firebaseConfig.project_id;
        admin.initializeApp(initOptions);
      }

      const databaseId = firebaseConfig.firestoreDatabaseId || firebaseConfig.databaseId;
      if (databaseId && databaseId !== '(default)') {
        try {
          dbInstance = admin.firestore(databaseId);
        } catch (err) {
          console.warn('Failed to construct firestore with databaseId, trying default:', err);
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

// Authentication middleware for JWT Verification with detailed logging and double-fallback verification
function authenticateAdminToken(req: any) {
  const authHeader = req.headers['x-admin-token'] || req.headers.authorization;
  console.log('[Auth Log] Received Authorization header:', authHeader ? 'Present' : 'Missing');

  if (!authHeader) {
    console.warn('[Auth Log] Denying request: No Authorization or x-admin-token header found');
    throw new Error('Admin authentication is required. Token is missing.');
  }

  const authStr = typeof authHeader === 'string' ? authHeader : String(authHeader);
  const token = authStr.toLowerCase().startsWith('bearer ')
    ? authStr.substring(7).trim()
    : authStr.trim();

  console.log('[Auth Log] Parsed token length:', token.length);
  if (token.length > 15) {
    console.log('[Auth Log] Token snippet:', `${token.substring(0, 10)}...${token.substring(token.length - 8)}`);
  }

  if (!token || token === 'null' || token === 'undefined' || token === '') {
    console.warn('[Auth Log] Denying request: Token resolved to an empty, null, or undefined state. Token string was:', token);
    throw new Error('Admin authentication is required. Token is invalid.');
  }

  let decoded: any = null;

  // 1. First attempt verification with process.env.JWT_SECRET if configured.
  if (process.env.JWT_SECRET) {
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('[Auth Log] Successfully verified JWT with custom process.env.JWT_SECRET.');
    } catch (err: any) {
      console.warn('[Auth Log] Verification failed with custom process.env.JWT_SECRET:', err.message || err);
    }
  }

  // 2. Second attempt: fallback to standard secret 'lone-star-fence-secret' to support cross-environment verification.
  if (!decoded) {
    try {
      decoded = jwt.verify(token, 'lone-star-fence-secret');
      console.log('[Auth Log] Successfully verified JWT with fallback "lone-star-fence-secret".');
    } catch (err: any) {
      console.error('[Auth Log] Both custom and fallback JWT verification failed.');
      console.error('[Auth Log] Fallback verification error detail:', err.message || err);
      throw new Error(`Access denied. Invalid or expired admin token. Reason: ${err.message || 'unknown'}`);
    }
  }

  // 3. Role validation check.
  if (decoded && typeof decoded === 'object' && (decoded as any).isAdmin) {
    console.log('[Auth Log] Token validation passed. User identity verified as Admin:', decoded.email);
    return decoded;
  }

  console.warn('[Auth Log] Denying request: Decoded token is valid, but is missing isAdmin privilege. Decoded payload:', decoded);
  throw new Error('Access denied. Invalid or expired admin token.');
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

  try {
    // Authenticate the admin
    authenticateAdminToken(req);

    const firestoreDb = getAdminDb();
    if (!firestoreDb) {
      return res.status(503).json({ error: 'Database service is offline' });
    }

    if (req.method === 'GET') {
      // GET /api/admin/users -> List all users using firebase-admin
      const usersSnap = await firestoreDb.collection('users').get();
      const usersList: any[] = [];

      for (const d of usersSnap.docs) {
        const u = d.data();
        // Fetch subcollection estimates count
        const estSnap = await firestoreDb.collection('users').doc(d.id).collection('estimates').get();
        usersList.push({
          uid: d.id,
          email: u.email || '',
          name: u.name || u.displayName || u.email?.split('@')[0] || 'No Name',
          subscriptionTier: u.tier || u.subscriptionTier || 'free',
          createdAt: u.createdAt || '',
          isDisabled: u.isDisabled || false,
          estimatesCount: estSnap.size
        });
      }

      return res.status(200).json(usersList);

    } else if (req.method === 'POST') {
      // POST /api/admin/users -> Create user using firebase-admin
      const { email, name, subscriptionTier, password } = req.body;
      if (!email || !name) {
        return res.status(400).json({ error: 'Email and Name are required' });
      }
      if (!password) {
        return res.status(400).json({ error: 'Initial Password is required' });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const userId = `usr-${Math.random().toString(36).substring(2, 11)}`;
      const newUser = {
        uid: userId,
        email: email,
        name: name,
        displayName: name,
        tier: subscriptionTier || 'free',
        subscriptionTier: subscriptionTier || 'free',
        passwordHash: passwordHash,
        createdAt: new Date().toISOString(),
        isDisabled: false,
        isAdmin: false
      };

      await firestoreDb.collection('users').doc(userId).set(newUser);
      return res.status(200).json({ success: true, user: newUser });
    } else {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
  } catch (error: any) {
    console.error('Error in /api/admin/users:', error);
    return res.status(
      error.message?.includes('Access denied') || error.message?.includes('authentication') ? 401 : 500
    ).json({
      error: error.message || 'Internal Server Error'
    });
  }
}
