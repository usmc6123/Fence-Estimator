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
      console.error('Error parsing FIREBASE_CONFIG env in quotes list:', error);
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

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
      console.error('JWT verification error in quotes list:', err.message);
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    const uid = decoded.uid;
    const isAdmin = decoded.isAdmin || uid === 'braden-lonestar-uid';

    const quotesList: any[] = [];

    if (isAdmin) {
      // 6. If the user is admin, return ALL quotes from the /quotes collection
      const snap = await db.collection('quotes').get();
      snap.forEach(doc => {
        quotesList.push({ id: doc.id, ...doc.data() });
      });
    } else {
      // 7. If not admin, return only quotes where userId matches their uid
      const snap = await db.collection('quotes').where('userId', '==', uid).get();
      snap.forEach(doc => {
        quotesList.push({ id: doc.id, ...doc.data() });
      });
    }

    // 8. Sorts results by createdAt descending (newest first)
    quotesList.sort((a, b) => {
      const timeA = a.createdAt ? (a.createdAt._seconds ? a.createdAt._seconds * 1000 : new Date(a.createdAt).getTime()) : (a.date ? new Date(a.date).getTime() : 0);
      const timeB = b.createdAt ? (b.createdAt._seconds ? b.createdAt._seconds * 1000 : new Date(b.createdAt).getTime()) : (b.date ? new Date(b.date).getTime() : 0);
      return timeB - timeA;
    });

    // 9. Returns the array of quotes as JSON with cleaned timestamps
    const cleanQuotesList = quotesList.map(quote => {
      return {
        ...quote,
        createdAt: cleanTimestamp(quote.createdAt || quote.date),
        updatedAt: cleanTimestamp(quote.updatedAt || quote.createdAt || quote.date),
        date: quote.date || new Date().toISOString()
      };
    });

    return res.status(200).json(cleanQuotesList);

  } catch (error: any) {
    console.error('Error fetching quotes list:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
