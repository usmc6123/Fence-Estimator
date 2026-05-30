import { doc, setDoc } from 'firebase/firestore';
import bcrypt from 'bcryptjs';

export async function createUser(req: any, res: any, db: any) {
  try {
    const { email, name, subscriptionTier, password } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'Email and Name are required' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Initial Password is required' });
    }
    if (!db) {
      return res.status(503).json({ error: 'Database offline' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Generate a clean user id (manual user)
    const userId = `usr-${Math.random().toString(36).substring(2, 11)}`;
    const uRef = doc(db, 'users', userId);
    
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

    await setDoc(uRef, newUser);
    res.json({ success: true, user: newUser });
  } catch (error: any) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
