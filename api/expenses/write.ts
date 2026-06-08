import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
const CUSTOM_DB_ID = 'ai-studio-326159a1-d34a-4219-9e8c-edc19a926edb';

// Initialize the Firebase Admin SDK
if (admin.apps.length === 0) {
  const firebaseConfigEnv = process.env.FIREBASE_CONFIG;
  if (firebaseConfigEnv) {
    try {
      const parsedConfig = JSON.parse(firebaseConfigEnv);
      
      if (parsedConfig.private_key || parsedConfig.client_email) {
        admin.initializeApp({
          credential: admin.credential.cert(parsedConfig),
        });
      } else {
        admin.initializeApp({
          projectId: parsedConfig.projectId || 'dazzling-card-485210-r8',
        });
      }
    } catch (error) {
      console.error('Error parsing FIREBASE_CONFIG env in expenses write:', error);
      admin.initializeApp({
        projectId: 'dazzling-card-485210-r8',
      });
    }
  } else {
    admin.initializeApp({
      projectId: 'dazzling-card-485210-r8',
    });
  }
}

const db = getFirestore(admin.app(), CUSTOM_DB_ID);

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const allowedMethods = ['POST', 'DELETE'];
  if (!allowedMethods.includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err: any) {
      console.error('JWT verification error in expenses write:', err.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    if (!decoded || !decoded.uid) {
      return res.status(401).json({ error: 'Unauthorized: Missing user UID in token' });
    }

    const isDeleteAction = req.method === 'DELETE' || (req.method === 'POST' && req.body.action === 'delete');

    if (isDeleteAction) {
      // DELETE Expense logic
      const expenseId = req.query.id || req.body.id;

      if (!expenseId) {
        return res.status(400).json({ error: 'Missing required field: id (expense ID)' });
      }

      const expenseRef = db.collection('expenses').doc(String(expenseId));
      const expenseSnap = await expenseRef.get();

      if (!expenseSnap.exists) {
        return res.status(404).json({ error: 'Expense record not found' });
      }

      const expenseData = expenseSnap.data() || {};

      // Verify ownership or admin privileges
      const isOwner = expenseData.userId === decoded.uid;
      const isAdmin = decoded.isAdmin === true;

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this expense record' });
      }

      await expenseRef.delete();

      return res.status(200).json({ success: true, message: 'Expense record successfully deleted', id: expenseId });

    } else {
      // POST Save Expense logic
      const { date, description, amount, category, estimateId, materialId, receiptUrl } = req.body;

      if (!description || amount === undefined || amount === null) {
        return res.status(400).json({ error: 'Missing required fields: description and amount' });
      }

      const expenseData: any = {
        date: date || new Date().toISOString().split('T')[0],
        description: String(description),
        amount: Number(amount),
        userId: decoded.uid,
        companyId: 'lonestarfence',
        createdAt: FieldValue.serverTimestamp()
      };

      if (category !== undefined) expenseData.category = category;
      if (estimateId !== undefined) expenseData.estimateId = estimateId;
      if (materialId !== undefined) expenseData.materialId = materialId;
      if (receiptUrl !== undefined) expenseData.receiptUrl = receiptUrl;

      const docRef = await db.collection('expenses').add(expenseData);

      const savedDoc = await docRef.get();
      const savedData = savedDoc.data() || {};

      const cleanCreatedAt = savedData.createdAt && typeof savedData.createdAt.toDate === 'function'
        ? savedData.createdAt.toDate().toISOString()
        : new Date().toISOString();

      return res.status(200).json({
        id: docRef.id,
        ...savedData,
        createdAt: cleanCreatedAt
      });
    }

  } catch (error: any) {
    console.error('Error in expense write handler:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
