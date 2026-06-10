import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
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
      console.error('Error parsing FIREBASE_CONFIG env in quotes write:', error);
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
  res.setHeader('Access-Control-Allow-Methods', 'POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const allowedMethods = ['POST', 'PUT', 'DELETE'];
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
      console.error('JWT verification error in quotes write:', err.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    if (!decoded || !decoded.uid) {
      return res.status(401).json({ error: 'Unauthorized: Missing user UID in token' });
    }

    const decodedEmail = decoded.email?.toLowerCase();
    const isWriteAdmin = decoded.isAdmin || 
                         decoded.uid === 'braden-lonestar-uid' || 
                         decodedEmail === 'bradens@lonestarfenceworks.com' || 
                         decodedEmail === 'usmc6123@gmail.com';

    const method = req.method;

    if (method === 'POST') {
      const quoteData = { ...req.body };
      quoteData.userId = decoded.uid;
      quoteData.companyId = 'lonestarfence';

      let docId = quoteData.id;
      if (!docId) {
        docId = db.collection('quotes').doc().id;
        quoteData.id = docId;
      }

      await db.collection('quotes').doc(docId).set(quoteData);
      return res.status(200).json(quoteData);
    }

    if (method === 'PUT') {
      const { id, ...updateFields } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Missing quote ID inside body' });
      }

      const docRef = db.collection('quotes').doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return res.status(404).json({ error: 'Quote not found' });
      }

      const existingData = docSnap.data() || {};
      if (
        existingData.userId !== decoded.uid &&
        existingData.uid !== decoded.uid &&
        !isWriteAdmin
      ) {
        return res.status(403).json({ error: 'Forbidden: You do not own this quote record' });
      }

      await docRef.update(updateFields);
      const updatedSnap = await docRef.get();
      return res.status(200).json(updatedSnap.data());
    }

    if (method === 'DELETE') {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Missing quote ID inside body' });
      }

      const docRef = db.collection('quotes').doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return res.status(404).json({ error: 'Quote not found' });
      }

      const existingData = docSnap.data() || {};
      if (
        existingData.userId !== decoded.uid &&
        existingData.uid !== decoded.uid &&
        !isWriteAdmin
      ) {
        return res.status(403).json({ error: 'Forbidden: You do not own this quote record' });
      }

      await docRef.delete();
      return res.status(200).json({ success: true, message: 'Quote deleted successfully' });
    }

    return res.status(400).json({ error: 'Unhandled request action' });

  } catch (error: any) {
    console.error('Server Quotes Write Handler Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
