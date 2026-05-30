import { getAdminDb } from './firebaseAdmin';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';

// Authentication check
function authenticateAdminToken(req: any) {
  const authHeader = req ? (req.headers['x-admin-token'] || req.headers.authorization) : null;
  if (!authHeader) {
    throw new Error('Admin authentication is required. Token is missing.');
  }
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : authHeader;

  if (!token || token === 'null' || token === 'undefined') {
    throw new Error('Admin authentication is required. Token is invalid.');
  }

  const decoded = jwt.verify(token as string, JWT_SECRET);
  if (decoded && typeof decoded === 'object' && (decoded as any).isAdmin) {
    return decoded;
  }
  throw new Error('Access denied. Invalid or expired admin token.');
}

export default async function handler(req: any, res: any) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Admin-Token, Authorization'
  );

  if (req && req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Detailed incoming request logging for debugging
  console.log('Incoming /api/admin/users request:', {
    method: req ? req.method : undefined,
    url: req ? req.url : undefined,
    hasHeaders: !!(req && req.headers),
    hasQuery: !!(req && req.query),
    hasBody: !!(req && req.body),
    queryKeys: req && req.query ? Object.keys(req.query) : [],
    bodyKeys: req && req.body ? Object.keys(req.body) : []
  });

  try {
    // 1. Authenticate the admin session
    authenticateAdminToken(req);

    // 2. Resolve database instance
    const firestoreDb = getAdminDb();
    if (!firestoreDb) {
      return res.status(503).json({ error: 'Database service is offline' });
    }

    const method = req ? req.method : '';

    // --- GET METHOD: List all users ---
    if (method === 'GET') {
      const usersRef = firestoreDb.collection('users');
      const snap = await usersRef.get();
      const usersList: any[] = [];

      for (const d of snap.docs) {
        const u = d.data();
        const estRef = firestoreDb.collection('users').doc(d.id).collection('estimates');
        const estSnap = await estRef.get();
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
    }

    // --- POST METHOD: Create new user ---
    if (method === 'POST') {
      const body = (req && req.body) ? req.body : {};
      const { email, name, subscriptionTier, password } = body;
      
      if (!email || !name) {
        return res.status(400).json({ error: 'Email and Name are required' });
      }
      if (!password) {
        return res.status(400).json({ error: 'Initial Password is required' });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const newUserId = `usr-${Math.random().toString(36).substring(2, 11)}`;
      const uRef = firestoreDb.collection('users').doc(newUserId);

      const newUser = {
        uid: newUserId,
        email: email.toLowerCase().trim(),
        name: name,
        displayName: name,
        tier: subscriptionTier || 'free',
        subscriptionTier: subscriptionTier || 'free',
        passwordHash: passwordHash,
        createdAt: new Date().toISOString(),
        isDisabled: false,
        isAdmin: false
      };

      await uRef.set(newUser);
      return res.status(200).json({ success: true, user: newUser });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });

  } catch (error: any) {
    console.error('Error in /api/admin/users handler:', error);
    const isAuthError = error.message?.includes('Access denied') || error.message?.includes('authentication') || error.message?.includes('Token');
    return res.status(isAuthError ? 401 : 500).json({
      error: error.message || 'Internal Server Error'
    });
  }
}
