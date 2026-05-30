import { doc, updateDoc } from 'firebase/firestore';
import bcrypt from 'bcryptjs';

export async function updateUser(req: any, res: any, db: any) {
  try {
    const { userId } = req.params;
    const { email, name, subscriptionTier, isDisabled, password } = req.body;
    if (!db) {
      return res.status(503).json({ error: 'Database offline' });
    }

    const uRef = doc(db, 'users', userId);
    
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

    await updateDoc(uRef, updateData);
    res.json({ success: true, user: { uid: userId, email, name, subscriptionTier, isDisabled } });
  } catch (error: any) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
