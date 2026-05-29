import { doc, setDoc } from 'firebase/firestore';

export async function createUser(req: any, res: any, db: any) {
  try {
    const { email, name, subscriptionTier } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'Email and Name are required' });
    }
    if (!db) {
      return res.status(503).json({ error: 'Database offline' });
    }

    // Generate a clean user id (manual user)
    const userId = `usr-${Math.random().toString(36).substr(2, 9)}`;
    const uRef = doc(db, 'users', userId);
    
    // We store tier, subscriptionTier, display name, status, etc.
    const newUser = {
      uid: userId,
      email: email,
      name: name,
      displayName: name,
      tier: subscriptionTier || 'free',
      subscriptionTier: subscriptionTier || 'free',
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
