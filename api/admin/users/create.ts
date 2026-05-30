import { getAdminDb } from '../firebaseAdmin';
import bcrypt from 'bcryptjs';

export async function createUser(req: any, res: any, _db: any) {
  try {
    const { email, name, subscriptionTier, password } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'Email and Name are required' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Initial Password is required' });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return res.status(503).json({ error: 'Database offline' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Generate a clean user id (manual user)
    const userId = `usr-${Math.random().toString(36).substring(2, 11)}`;
    const uRef = adminDb.collection('users').doc(userId);
    
    // We store tier, subscriptionTier, display name, status, etc.
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

    await uRef.set(newUser);
    res.json({ success: true, user: newUser });
  } catch (error: any) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
