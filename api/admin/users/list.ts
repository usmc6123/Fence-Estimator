import { getAdminDb } from '../firebaseAdmin';

export async function listUsers(req: any, res: any, _db: any) {
  const authHeader = req ? (req.headers['x-admin-token'] || req.headers.authorization) : null;
  console.log('[listUsers] Request arrived at GET /api/admin/users');
  console.log('[listUsers] Authorization Header Exists:', !!authHeader);
  if (authHeader) {
    console.log('[listUsers] Token value (truncated):', typeof authHeader === 'string' ? `${authHeader.substring(0, 15)}...` : authHeader);
  }

  try {
    console.log('[listUsers] Intending to resolve adminDb...');
    const adminDb = getAdminDb();
    console.log('[listUsers] Resolved getAdminDb():', !!adminDb);

    if (!adminDb) {
      console.error('[listUsers] adminDb is falsy!');
      return res.status(503).json({ error: 'Database offline' });
    }

    console.log('[listUsers] Fetching users collection from Firestore adminDb...');
    const snap = await adminDb.collection('users').get();
    console.log('[listUsers] Successfully fetched users collection. Doc count:', snap.size);

    const usersList: any[] = [];

    for (const d of snap.docs) {
      const u = d.data();
      const userId = d.id;
      console.log(`[listUsers] Processing user: ${userId}, email: ${u.email}`);
      
      // Count user's estimates bypassing security rules via Admin SDK
      let estCount = 0;
      try {
        const estSnap = await adminDb.collection('users').doc(userId).collection('estimates').get();
        estCount = estSnap.size;
        console.log(`[listUsers] Estimations count for ${userId}: ${estCount}`);
      } catch (estErr: any) {
        console.error(`[listUsers] Error fetching estimates for user ${userId}:`, estErr.message || estErr);
      }

      usersList.push({
        uid: userId,
        email: u.email || '',
        name: u.name || u.displayName || u.email?.split('@')[0] || 'No Name',
        subscriptionTier: u.tier || u.subscriptionTier || 'free',
        createdAt: u.createdAt || '',
        isDisabled: u.isDisabled || false,
        estimatesCount: estCount
      });
    }

    console.log('[listUsers] Returning users array length:', usersList.length);
    return res.json(usersList);
  } catch (error: any) {
    console.error('[listUsers] Error listing all users:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
