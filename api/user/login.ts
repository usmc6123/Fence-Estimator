import getAdminDb from './firebaseAdmin';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: 'Password is required' });
    }

    const pwd = password.trim();

    // 1. & 2. Get the admin from getAdminDb
    const adminDoc = await getAdminDb().collection('admins').doc('braden-lonestar-uid').get();

    // 3. If NOT found, return 404
    if (!adminDoc.exists) {
      return res.status(404).json({ success: false, error: 'Admin record not found.' });
    }

    const adminData = adminDoc.data();

    // 4. Verify password with bcryptjs
    const isMatch = await bcrypt.compare(pwd, adminData.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Access Denied: Incorrect password.' });
    }

    // 5. Return JWT token
    const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
    const token = jwt.sign(
      { email: adminData.email, isAdmin: true, uid: 'braden-lonestar-uid' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      success: true,
      userId: 'braden-lonestar-uid',
      token,
      user: {
        uid: 'braden-lonestar-uid',
        email: adminData.email || 'bradens@lonestarfenceworks.com',
        name: 'Braden',
        displayName: 'Braden',
        tier: 'paid',
        subscriptionTier: 'paid',
        isAdmin: true
      }
    });

  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error'
    });
  }
}
