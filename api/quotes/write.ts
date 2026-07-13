import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import jwt from 'jsonwebtoken';
import { sanitizeForFirestore } from '../lib/utils.js';

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

  const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'];
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
      decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    } catch (err: any) {
      console.error('JWT verification error in quotes write:', err.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    if (!decoded || !decoded.uid) {
      return res.status(401).json({ error: 'Unauthorized: Missing user UID in token' });
    }

    if (req.method === 'GET') {
      const uid = decoded.uid;
      const isAdmin = decoded.isAdmin || uid === 'braden-lonestar-uid';
      const isSnapshotRequest = req.query.snapshots === 'true';

      const results: any[] = [];
      const collectionName = isSnapshotRequest ? 'supplierQuoteSnapshots' : 'quotes';

      if (isAdmin) {
        const snap = await db.collection(collectionName).get();
        snap.forEach(doc => {
          results.push({ id: doc.id, ...doc.data() });
        });
      } else {
        const snap = await db.collection(collectionName).where('userId', '==', uid).get();
        snap.forEach(doc => {
          results.push({ id: doc.id, ...doc.data() });
        });
      }

      results.sort((a, b) => {
        const timeA = a.createdAt ? (a.createdAt._seconds ? a.createdAt._seconds * 1000 : new Date(a.createdAt).getTime()) : (a.date ? new Date(a.date).getTime() : 0);
        const timeB = b.createdAt ? (b.createdAt._seconds ? b.createdAt._seconds * 1000 : new Date(b.createdAt).getTime()) : (b.date ? new Date(b.date).getTime() : 0);
        return timeB - timeA;
      });

      const cleanResults = results.map(item => {
        return {
          ...item,
          createdAt: cleanTimestamp(item.createdAt || item.date),
          updatedAt: cleanTimestamp(item.updatedAt || item.createdAt || item.date),
          date: item.date || new Date().toISOString()
        };
      });

      return res.status(200).json(cleanResults);
    }

    const decodedEmail = decoded.email?.toLowerCase();
    const isWriteAdmin = decoded.isAdmin || 
                         decoded.uid === 'braden-lonestar-uid' || 
                         decodedEmail === 'bradens@lonestarfenceworks.com' || 
                         decodedEmail === 'usmc6123@gmail.com';

    const method = req.method;

    if (method === 'POST') {
      if (req.body && req.body.action === 'upload') {
        const { fileData, fileName, fileType, pathPrefix, supplierId } = req.body;
        console.log(`SUPPLIER_QUOTE_UPLOAD_1: request received - supplierId: ${supplierId}, filename: ${fileName}, type: ${fileType}`);
        
        if (!fileData || !fileName) {
          console.error('SUPPLIER_QUOTE_UPLOAD_FAILED - step: validation, message: Missing fileData or fileName');
          return res.status(400).json({ 
            success: false, 
            error: 'Missing fileData or fileName in body',
            failedStep: 'validation'
          });
        }
        console.log(`SUPPLIER_QUOTE_UPLOAD_2: file validated - size: ${fileData.length} chars`);

        const cleanPrefix = pathPrefix || 'quotes/';
        const timestamp = Date.now();
        const filePath = `${cleanPrefix}${decoded.uid}/${timestamp}-${fileName}`;

        try {
          const bucketName = 'dazzling-card-485210-r8.firebasestorage.app';
          console.log(`SUPPLIER_QUOTE_UPLOAD_3: storage upload started - bucket: ${bucketName}, path: ${filePath}`);
          const bucket = admin.storage().bucket(bucketName);
          const file = bucket.file(filePath);

          let cleanBase64 = fileData;
          if (cleanBase64.includes(';base64,')) {
            cleanBase64 = cleanBase64.split(';base64,')[1];
          }
          const buffer = Buffer.from(cleanBase64, 'base64');

          // Check file size (Vercel limit is ~4.5MB, but we should be safe up to 10MB on most Cloud Run setups)
          if (buffer.length > 10 * 1024 * 1024) {
            console.error('SUPPLIER_QUOTE_UPLOAD_FAILED - step: size_check, message: File too large');
            return res.status(400).json({
              success: false,
              error: 'File too large',
              code: 'FILE_TOO_LARGE',
              failedStep: 'size_check'
            });
          }

          await file.save(buffer, {
            metadata: {
              contentType: fileType || 'application/octet-stream',
            }
          });
          console.log(`SUPPLIER_QUOTE_UPLOAD_4: storage upload completed - path: ${filePath}`);

          let downloadUrl = '';
          try {
            await file.makePublic();
            downloadUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
          } catch (pubErr: any) {
            console.warn('makePublic failed, using signed url:', pubErr?.message || pubErr);
          }

          const expires = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;
          const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: expires
          });

          if (!downloadUrl) {
            downloadUrl = signedUrl;
          }

          console.log(`SUPPLIER_QUOTE_UPLOAD_9: response returned - url: ${downloadUrl}`);
          return res.status(200).json({
            success: true,
            downloadUrl,
            fileUrl: downloadUrl,
            signedUrl,
            filePath: filePath,
            bucket: bucket.name
          });
        } catch (uploadErr: any) {
          console.error('SUPPLIER_QUOTE_UPLOAD_FAILED - step: storage_save, message:', uploadErr.message, 'supplierId:', supplierId, 'filename:', fileName);
          return res.status(500).json({ 
            success: false, 
            error: 'Failed to upload file to storage',
            failedStep: 'storage_save',
            details: uploadErr.message,
            storagePath: filePath
          });
        }
      }

      // Handle Snapshots
      if (req.body && req.body.action === 'snapshot') {
        console.log(`SUPPLIER_QUOTE_UPLOAD_5: quote snapshot payload built`);
        const snapshotData = sanitizeForFirestore({ ...req.body.snapshot });
        snapshotData.userId = decoded.uid;
        snapshotData.companyId = 'lonestarfence';
        
        if (!snapshotData.id) {
          snapshotData.id = db.collection('supplierQuoteSnapshots').doc().id;
        }
        
        try {
          await db.collection('supplierQuoteSnapshots').doc(snapshotData.id).set(snapshotData);
          console.log(`SUPPLIER_QUOTE_UPLOAD_6: quote snapshot saved - snapshotId: ${snapshotData.id}`);
          return res.status(200).json({ success: true, ...snapshotData });
        } catch (snapErr: any) {
          console.error('SUPPLIER_QUOTE_UPLOAD_FAILED - step: quote_snapshot_save, message:', snapErr.message, 'snapshotId:', snapshotData.id);
          return res.status(500).json({
            success: false,
            error: 'Supplier quote upload failed',
            failedStep: 'quote_snapshot_save',
            details: snapErr.message,
            snapshotId: snapshotData.id
          });
        }
      }

      // Handle Activation
      if (req.body && req.body.action === 'activate') {
        const { snapshotId, supplierId } = req.body;
        if (!snapshotId) return res.status(400).json({ error: 'Missing snapshotId' });
        
        const snapRef = db.collection('supplierQuoteSnapshots').doc(snapshotId);
        const snapDoc = await snapRef.get();
        if (!snapDoc.exists) return res.status(404).json({ error: 'Snapshot not found' });
        
        const snapData = snapDoc.data();
        
        // 1. Mark snapshot as active
        await snapRef.update({ 
          status: 'active',
          activatedAt: new Date().toISOString(),
          activatedBy: decoded.uid
        });
        
        // 2. Update the main quote document for this supplier to maintain backward compatibility
        // Find existing quote for this supplier
        const quotesSnap = await db.collection('quotes')
          .where('supplierName', '==', snapData.supplierName)
          .get();
        
        const quoteItems = snapData.lineItems.map((li: any) => ({
          id: db.collection('quotes').doc().id,
          materialName: li.materialName,
          partNumber: li.partNumber,
          unit: li.unit,
          unitPrice: li.newPrice,
          totalPrice: li.newPrice, // Total price for 1 unit in the reference quote
          mappedMaterialId: li.mappedMaterialId
        }));

        const quoteData = {
          id: quotesSnap.empty ? db.collection('quotes').doc().id : quotesSnap.docs[0].id,
          companyId: 'lonestarfence',
          supplierName: snapData.supplierName,
          date: new Date().toISOString(),
          items: quoteItems,
          totalAmount: quoteItems.reduce((sum: number, i: any) => sum + i.totalPrice, 0),
          fileName: snapData.sourceFileName,
          fileType: 'application/pdf',
          fileUrl: snapData.sourceFileUrl,
          userId: decoded.uid,
          snapshotId: snapshotId // Link back to the snapshot
        };

        await db.collection('quotes').doc(quoteData.id).set(sanitizeForFirestore(quoteData));

        // 3. Sync material prices and create history
        const batch = db.batch();
        const now = new Date().toISOString();
        let updateCount = 0;

        for (const item of snapData.lineItems) {
          if (item.mappedMaterialId && item.newPrice !== undefined) {
            const matRef = db.collection('materials').doc(item.mappedMaterialId);
            const matDoc = await matRef.get();
            const matData = matDoc.exists ? matDoc.data() : null;
            const prevPrice = matData?.cost || 0;

            batch.update(matRef, sanitizeForFirestore({
              cost: item.newPrice,
              lastPriceUpdate: now,
              updatedAt: now,
              libraryPriceSourceType: 'supplier_quote',
              libraryPriceSourceSupplierName: snapData.supplierName,
              libraryPriceSourceQuoteDate: snapData.date,
              libraryPriceSourceFileName: snapData.sourceFileName,
              libraryPriceSourceDocumentUrl: snapData.sourceFileUrl,
              libraryPriceSourceQuoteSnapshotId: snapshotId,
              libraryPriceSourceUpdatedAt: now,
              libraryPriceSourceUpdatedBy: decoded.email || decoded.uid
            }));

            const historyRef = db.collection('materialHistory').doc();
            batch.set(historyRef, sanitizeForFirestore({
              id: historyRef.id,
              materialId: item.mappedMaterialId,
              price: item.newPrice,
              previousPrice: prevPrice,
              date: now,
              updatedBy: decoded.email || decoded.uid,
              sourceType: 'supplier_quote',
              sourceSupplierName: snapData.supplierName,
              sourceQuoteSnapshotId: snapshotId,
              sourceDocumentUrl: snapData.sourceFileUrl,
              sourceDocumentPath: snapData.sourceFilePath,
              sourceFileName: snapData.sourceFileName,
              sourceQuoteDate: snapData.date,
              sourceUpdatedAt: now
            }));
            updateCount++;
          }
        }

        if (updateCount > 0) {
          await batch.commit();
        }
        
        return res.status(200).json({ success: true, quote: quoteData, updateCount });
      }

      const quoteData = { ...req.body };
      quoteData.userId = decoded.uid;
      quoteData.companyId = 'lonestarfence';

      let docId = quoteData.id;
      if (!docId) {
        docId = db.collection('quotes').doc().id;
        quoteData.id = docId;
      }

      await db.collection('quotes').doc(docId).set(sanitizeForFirestore(quoteData));
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

      await docRef.update(sanitizeForFirestore(updateFields));
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
    console.error('SUPPLIER_QUOTE_UPLOAD_FAILED - global catch');
    console.error('message:', error.message);
    console.error('stack:', error.stack);
    return res.status(500).json({ 
      success: false, 
      error: 'Supplier quote operation failed',
      details: error.message,
      failedStep: 'global_handler'
    });
  }
}
