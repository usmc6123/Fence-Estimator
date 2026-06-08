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
      console.error('Error parsing FIREBASE_CONFIG env in estimates write:', error);
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
      console.error('JWT verification error in estimates write:', err.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    if (!decoded || !decoded.uid) {
      return res.status(401).json({ error: 'Unauthorized: Missing user UID in token' });
    }

    // Determine the actual action (using standard method or a simulated one such as action params)
    const method = req.method;

    // Standard Routing
    if (method === 'POST') {
      // POST logic matches old api/estimates/save.ts
      const estimateData = { ...req.body };
      const estimateId = estimateData.id;

      // Remove ID before saving
      delete estimateData.id;

      // Always set ownership fields from JWT token, never request body
      estimateData.uid = decoded.uid;
      estimateData.userId = decoded.uid;
      estimateData.companyId = 'lonestarfence';

      const nowIso = new Date().toISOString();
      estimateData.lastModified = nowIso;
      if (!estimateData.createdAt) {
        estimateData.createdAt = nowIso;
      }
      if (!estimateData.status) {
        estimateData.status = 'active';
      }

      let savedId = estimateId;

      if (savedId) {
        const docRef = db.collection('estimates').doc(String(savedId));
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          const existingData = docSnap.data() || {};
          if (
            existingData.uid !== decoded.uid &&
            existingData.userId !== decoded.uid &&
            !decoded.isAdmin &&
            decoded.uid !== 'braden-lonestar-uid'
          ) {
            return res.status(403).json({ error: 'Forbidden: You do not own this estimate record' });
          }
          await docRef.set(estimateData, { merge: true });
        } else {
          await docRef.set(estimateData);
        }
      } else {
        const docRef = await db.collection('estimates').add(estimateData);
        savedId = docRef.id;
      }

      return res.status(200).json({
        id: savedId,
        ...estimateData
      });

    } else if (method === 'PUT') {
      // PUT logic matches old api/estimates/update.ts
      const { id, ...updates } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Missing required field: id' });
      }

      const docRef = db.collection('estimates').doc(String(id));
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const existingData = docSnap.data() || {};
      if (
        existingData.uid !== decoded.uid &&
        existingData.userId !== decoded.uid &&
        !decoded.isAdmin &&
        decoded.uid !== 'braden-lonestar-uid'
      ) {
        return res.status(403).json({ error: 'Forbidden: You do not own this estimate record' });
      }

      // Set lastModified in updates
      const nowIso = new Date().toISOString();
      updates.lastModified = nowIso;

      // Do not permit client modification of user ownership parameters
      delete updates.uid;
      delete updates.userId;
      delete updates.companyId;

      await docRef.update(updates);

      return res.status(200).json({
        id,
        ...existingData,
        ...updates
      });

    } else if (method === 'DELETE') {
      // DELETE logic matches old api/estimates/delete.ts
      const estimateId = req.query.id || req.body.id;

      if (!estimateId) {
        return res.status(400).json({ error: 'Missing required field: id' });
      }

      const docRef = db.collection('estimates').doc(String(estimateId));
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const existingData = docSnap.data() || {};
      if (
        existingData.uid !== decoded.uid &&
        existingData.userId !== decoded.uid &&
        !decoded.isAdmin &&
        decoded.uid !== 'braden-lonestar-uid'
      ) {
        return res.status(403).json({ error: 'Forbidden: You do not own this estimate record' });
      }

      await docRef.delete();

      return res.status(200).json({
        success: true,
        message: 'Estimate successfully deleted',
        id: estimateId
      });
    }

  } catch (error: any) {
    console.error('Error in estimate handler:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
