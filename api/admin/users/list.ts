import { collection, getDocs } from 'firebase/firestore';

export async function listUsers(req: any, res: any, db: any) {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database offline' });
    }

    const usersRef = collection(db, 'users');
    const snap = await getDocs(usersRef);
    const usersList: any[] = [];

    for (const d of snap.docs) {
      const u = d.data();
      // Count user's estimates
      const estRef = collection(db, 'users', d.id, 'estimates');
      const estSnap = await getDocs(estRef);
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

    res.json(usersList);
  } catch (error: any) {
    console.error('Error listing all users:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
