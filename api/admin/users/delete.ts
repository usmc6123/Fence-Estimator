import { getAdminDb } from '../firebaseAdmin';

export async function deleteUser(req: any, res: any, _db: any) {
  try {
    const { userId } = req.params;
    
    const adminDb = getAdminDb();
    if (!adminDb) {
      return res.status(503).json({ error: 'Database offline' });
    }

    // Clean up subcollection estimates bypassing security rules via Admin SDK
    const estRef = adminDb.collection('users').doc(userId).collection('estimates');
    const estSnap = await estRef.get();
    for (const d of estSnap.docs) {
      await adminDb.collection('users').doc(userId).collection('estimates').doc(d.id).delete();
    }

    // Delete user doc
    const uRef = adminDb.collection('users').doc(userId);
    await uRef.delete();
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
