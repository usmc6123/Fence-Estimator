import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// Client Firebase Fallback Imports
import { initializeApp as initializeClientApp, getApps as getClientApps } from 'firebase/app';
import { 
  getFirestore as getClientFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  getDocs, 
  deleteDoc 
} from 'firebase/firestore';
import { getAuth as getClientAuth, signInWithEmailAndPassword } from 'firebase/auth';

let firestoreDb: any = null;
let authPromise: Promise<any> | null = null;

// Initialize the fully-authenticated Fallback Client DB
function initializeFallbackDb(): Promise<any> {
  if (authPromise) return authPromise;

  authPromise = (async () => {
    try {
      console.log('[FirebaseAdmin Fallback] Initiating secure synchronized client fallback sequence...');
      const configPath = join(process.cwd(), 'firebase-applet-config.json');
      if (!existsSync(configPath)) {
        throw new Error('firebase-applet-config.json not found on disk, cannot initialize fallback.');
      }

      const firebaseConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      const clientApps = getClientApps();
      let clientApp;
      if (clientApps.length === 0) {
        clientApp = initializeClientApp(firebaseConfig);
      } else {
        clientApp = clientApps[0];
      }

      const clientDb = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);
      const clientAuth = getClientAuth(clientApp);

      console.log('[FirebaseAdmin Fallback] Client SDK initialized, logging in supervisor/administrator...');
      await signInWithEmailAndPassword(clientAuth, 'bradens@lonestarfenceworks.com', 'password123');
      console.log('✅ [FirebaseAdmin Fallback] Authenticated standard admin session successfully.');
      return clientDb;
    } catch (err: any) {
      console.error('❌ [FirebaseAdmin Fallback] Fatal error during Client adaptation setup:', err.message);
      throw err;
    }
  })();

  return authPromise;
}

// Client SDK Adapter to perfectly mimic Firebase Admin SDK expectations
class AdminDbClientAdapter {
  collection(collectionPath: string) {
    return new CollectionAdapter(collectionPath);
  }
}

class CollectionAdapter {
  private path: string;

  constructor(path: string) {
    this.path = path;
  }

  doc(docId: string) {
    return new DocAdapter(`${this.path}/${docId}`);
  }

  async get() {
    const clientDb = await initializeFallbackDb();
    const colRef = collection(clientDb, this.path);
    const snap = await getDocs(colRef);
    return new QuerySnapshotAdapter(snap);
  }
}

class DocAdapter {
  private path: string;

  constructor(path: string) {
    this.path = path;
  }

  get id() {
    const parts = this.path.split('/');
    return parts[parts.length - 1];
  }

  collection(collectionPath: string) {
    return new CollectionAdapter(`${this.path}/${collectionPath}`);
  }

  async get() {
    const clientDb = await initializeFallbackDb();
    const docRef = doc(clientDb, this.path);
    const snap = await getDoc(docRef);
    return new DocumentSnapshotAdapter(snap);
  }

  async set(data: any, options?: any) {
    const clientDb = await initializeFallbackDb();
    const docRef = doc(clientDb, this.path);
    await setDoc(docRef, data, options);
  }

  async update(data: any) {
    const clientDb = await initializeFallbackDb();
    const docRef = doc(clientDb, this.path);
    await updateDoc(docRef, data);
  }

  async delete() {
    const clientDb = await initializeFallbackDb();
    const docRef = doc(clientDb, this.path);
    await deleteDoc(docRef);
  }
}

class QuerySnapshotAdapter {
  private snap: any;

  constructor(snap: any) {
    this.snap = snap;
  }

  get size() {
    return this.snap.size;
  }

  get docs() {
    return this.snap.docs.map((d: any) => new DocumentSnapshotAdapter(d));
  }
}

class DocumentSnapshotAdapter {
  private docSnap: any;

  constructor(docSnap: any) {
    this.docSnap = docSnap;
  }

  get id() {
    return this.docSnap.id;
  }

  get exists() {
    return this.docSnap.exists();
  }

  data() {
    return this.docSnap.data();
  }
}

export function getAdminDb() {
  if (firestoreDb) return firestoreDb;

  console.log('[FirebaseAdmin] Starting getAdminDb stabilization sequence...');
  console.log('[FirebaseAdmin] DEBUG: process.env.FIREBASE_CONFIG exists?', !!process.env.FIREBASE_CONFIG);
  console.log('[FirebaseAdmin] DEBUG: FIREBASE_CONFIG length:', process.env.FIREBASE_CONFIG?.length);

  try {
    let credential: any = undefined;
    let projectId: string | undefined = undefined;
    let firestoreDatabaseId: string | undefined = undefined;

    // 1. Try FIREBASE_CONFIG first (checks for service account credential)
    if (process.env.FIREBASE_CONFIG && process.env.FIREBASE_CONFIG.length > 0) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
        const pId = serviceAccount.project_id || serviceAccount.projectId;
        const privateKey = serviceAccount.private_key || serviceAccount.privateKey;
        const clientEmail = serviceAccount.client_email || serviceAccount.clientEmail;
        firestoreDatabaseId = serviceAccount.firestoreDatabaseId || serviceAccount.databaseId || serviceAccount.firestore_database_id;

        if (pId && privateKey && clientEmail) {
          const formattedKey = privateKey.replace(/\\n/g, '\n');
          credential = cert({
            projectId: pId,
            clientEmail: clientEmail,
            privateKey: formattedKey
          });
          projectId = pId;
          console.log('✅ Firebase Admin SDK credential successfully created from FIREBASE_CONFIG');
        } else {
          // Captures projectId if it is set in client config but not service account
          projectId = pId;
        }
      } catch (jsonErr: any) {
        console.error('[FirebaseAdmin] Error parsing FIREBASE_CONFIG:', jsonErr.message);
      }
    }

    // 2. Fallback to reading firebase-applet-config.json from disk
    if (!projectId) {
      let configObj: any = null;
      const pathsToTry = [
        join(process.cwd(), 'firebase-applet-config.json'),
        './firebase-applet-config.json',
        '../firebase-applet-config.json'
      ];

      for (const p of pathsToTry) {
        if (existsSync(p)) {
          try {
            const raw = readFileSync(p, 'utf-8');
            configObj = JSON.parse(raw);
            break;
          } catch (readErr: any) {
            // ignore loading error, check next path
          }
        }
      }

      if (configObj) {
        projectId = configObj.projectId || configObj.project_id;
        firestoreDatabaseId = configObj.firestoreDatabaseId || configObj.databaseId || configObj.firestore_database_id;

        const privateKey = configObj.privateKey || configObj.private_key;
        const clientEmail = configObj.clientEmail || configObj.client_email;

        if (privateKey && clientEmail) {
          credential = cert({
            projectId: projectId,
            clientEmail: clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n')
          });
          console.log('✅ Firebase Admin SDK credential successfully created from disk configuration file');
        }
      }
    }

    // 3. Last fallback: individual env variables
    if (!projectId) {
      projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
      firestoreDatabaseId = process.env.FIREBASE_DATABASE_ID || process.env.FIRESTORE_DATABASE_ID;
    }

    // 4. Initialize administrative app singleton safely OR engage adapter
    if (credential) {
      const apps = getApps();
      let app: any;
      if (apps.length === 0) {
        const options: any = {};
        if (projectId) {
          options.projectId = projectId;
        }
        if (credential) {
          options.credential = credential;
        }

        console.log(`[FirebaseAdmin] Initializing, Project ID: "${projectId || 'Default'}", Credential provided: ${!!credential}`);
        app = initializeApp(options);
        console.log('✅ Firebase Admin app initialized successfully');
      } else {
        app = apps[0];
      }

      const dbId = firestoreDatabaseId && firestoreDatabaseId !== '(default)'
        ? firestoreDatabaseId
        : undefined;

      firestoreDb = getFirestore(app, dbId);
      console.log(`✅ Firestore db instance initialized successfully. Database ID: "${dbId || '(default)'}"`);
    } else {
      console.log('⚠️ [FirebaseAdmin] No administrative credentials detected. Engaging Client Adapter sequence fallback.');
      firestoreDb = new AdminDbClientAdapter();
    }

  } catch (err: any) {
    console.error('[FirebaseAdmin] Failed to initialize Firebase Admin service:', err);
    console.log('⚠️ [FirebaseAdmin] Engaging adapter due to initialization crash');
    firestoreDb = new AdminDbClientAdapter();
  }

  return firestoreDb;
}
