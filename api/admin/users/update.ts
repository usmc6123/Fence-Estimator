import { getAdminDb } from '../firebaseAdmin';
import bcrypt from 'bcryptjs';

export async function updateUser(req: any, res: any, _db: any) {
  try {
    const { userId } = req.params;
    const { email, name, subscriptionTier, isDisabled, password } = req.body;
    
    const adminDb = getAdminDb();
    if (!adminDb) {
      return res.status(503).json({ error: 'Database offline' });
    }

    const uRef = adminDb.collection('users').doc(userId);
    
    const updateData: any = {
      updatedAt: new Date().toISOString()
    };
    
    if (email !== undefined) updateData.email = email;
    if (name !== undefined) {
      updateData.name = name;
      updateData.displayName = name;
    }
    if (subscriptionTier !== undefined) {
      updateData.tier = subscriptionTier;
      updateData.subscriptionTier = subscriptionTier;
    }
    if (isDisabled !== undefined) {
      updateData.isDisabled = isDisabled;
    }
    if (password !== undefined && password !== '') {
      const salt = await bcrypt.genSalt(10);
      updateData.passwordHash = await bcrypt.hash(password, salt);
    }

    await uRef.update(updateData);
    res.json({ success: true, user: { uid: userId, email, name, subscriptionTier, isDisabled } });
  } catch (error: any) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
