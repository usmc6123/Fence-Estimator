import { getAdminDb } from '../firebaseAdmin';

export async function listUsers(req: any, res: any, _db: any) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return res.status(503).json({ error: 'Database offline' });
    }

    const snap = await adminDb.collection('users').get();
    const usersList: any[] = [];

    for (const d of snap.docs) {
      const u = d.data();
      // Count user's estimates bypassing security rules via Admin SDK
      const estSnap = await adminDb.collection('users').doc(d.id).collection('estimates').get();
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
