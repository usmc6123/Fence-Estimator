import { doc, collection, getDocs, deleteDoc } from 'firebase/firestore';

export async function deleteUser(req: any, res: any, db: any) {
  try {
    const { userId } = req.params;
    if (!db) {
      return res.status(503).json({ error: 'Database offline' });
    }

    // Clean up subcollection estimates
    const estRef = collection(db, 'users', userId, 'estimates');
    const estSnap = await getDocs(estRef);
    for (const d of estSnap.docs) {
      await deleteDoc(doc(db, 'users', userId, 'estimates', d.id));
    }

    // Delete user doc
    const uRef = doc(db, 'users', userId);
    await deleteDoc(uRef);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
