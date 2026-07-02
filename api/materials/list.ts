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
      console.error('Error parsing FIREBASE_CONFIG env in materials list:', error);
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

function cleanTimestamp(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val.toDate === 'function') {
    return val.toDate().toISOString();
  }
  if (val && typeof val === 'object') {
    const secs = val._seconds || val.seconds;
    if (secs !== undefined) {
      return new Date(secs * 1000).toISOString();
    }
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    } catch (err: any) {
      console.error('JWT verification error in materials list:', err.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    // Handle GET (list all)
    if (req.method === 'GET') {
      const materialsList: any[] = [];
      const snap = await db.collection('materials').get();
      snap.forEach(doc => {
        materialsList.push({ id: doc.id, ...doc.data() });
      });

      const cleanMaterialsList = materialsList.map(mat => {
        return {
          ...mat,
          createdAt: cleanTimestamp(mat.createdAt),
          updatedAt: cleanTimestamp(mat.updatedAt || mat.createdAt),
          lastPriceUpdate: mat.lastPriceUpdate ? cleanTimestamp(mat.lastPriceUpdate) : undefined
        };
      });

      return res.status(200).json(cleanMaterialsList);
    }

    // Handle POST (create)
    if (req.method === 'POST') {
      const materialData = { ...req.body };
      materialData.companyId = 'lonestarfence';
      materialData.createdAt = new Date().toISOString();
      materialData.updatedAt = materialData.createdAt;

      let docId = materialData.id;
      if (!docId) {
        docId = db.collection('materials').doc().id;
        materialData.id = docId;
      }

      await db.collection('materials').doc(docId).set(materialData);
      
      const savedSnap = await db.collection('materials').doc(docId).get();
      const savedData: any = { id: docId, ...savedSnap.data() };
      return res.status(200).json({
        ...savedData,
        createdAt: cleanTimestamp(savedData.createdAt),
        updatedAt: cleanTimestamp(savedData.updatedAt || savedData.createdAt),
        lastPriceUpdate: savedData.lastPriceUpdate ? cleanTimestamp(savedData.lastPriceUpdate) : undefined
      });
    }

    // Handle PUT (update / bulk-sync)
    if (req.method === 'PUT') {
      if (req.body && req.body.action === 'bulk-sync') {
        const updatesList = req.body.updates || req.body.items || req.body.data || (Array.isArray(req.body) ? req.body : []);
        if (!Array.isArray(updatesList)) {
          return res.status(400).json({ error: 'Invalid updates body format for bulk-sync' });
        }

        const batch = db.batch();
        let count = 0;
        const now = new Date().toISOString();

        for (const item of updatesList) {
          const mId = item.materialId || item.id;
          if (!mId) continue;
          const cost = parseFloat(item.cost);
          if (isNaN(cost)) continue;

          const docRef = db.collection('materials').doc(mId);
          batch.update(docRef, {
            cost: cost,
            lastPriceUpdate: now,
            updatedAt: now
          });
          count++;
        }

        const updatedMaterials: any[] = [];
        if (count > 0) {
          await batch.commit();
          const updatedIds = updatesList.map((item: any) => item.materialId || item.id).filter(Boolean);
          if (updatedIds.length > 0) {
            const snap = await db.collection('materials').get();
            snap.forEach(doc => {
              if (updatedIds.includes(doc.id)) {
                updatedMaterials.push({
                  id: doc.id,
                  ...doc.data(),
                  createdAt: cleanTimestamp(doc.data().createdAt),
                  updatedAt: cleanTimestamp(doc.data().updatedAt || doc.data().createdAt),
                  lastPriceUpdate: doc.data().lastPriceUpdate ? cleanTimestamp(doc.data().lastPriceUpdate) : undefined
                });
              }
            });
          }
        }

        return res.status(200).json({ success: true, count, updatedMaterials });
      }

      // Handle standard partial update
      const { id, ...updateFields } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Missing material ID in request body' });
      }

      updateFields.updatedAt = new Date().toISOString();
      const docRef = db.collection('materials').doc(id);
      await docRef.update(updateFields);

      const updatedSnap = await docRef.get();
      const updatedData: any = { id, ...updatedSnap.data() };
      return res.status(200).json({
        ...updatedData,
        createdAt: cleanTimestamp(updatedData.createdAt),
        updatedAt: cleanTimestamp(updatedData.updatedAt || updatedData.createdAt),
        lastPriceUpdate: updatedData.lastPriceUpdate ? cleanTimestamp(updatedData.lastPriceUpdate) : undefined
      });
    }

    // Handle DELETE
    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Missing material ID in request body for deletion' });
      }

      await db.collection('materials').doc(id).delete();
      return res.status(200).json({ success: true, message: 'Material deleted successfully' });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });

  } catch (error: any) {
    console.error('Error handling materials operation:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
