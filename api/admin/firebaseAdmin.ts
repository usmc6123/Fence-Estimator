import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

let firestoreDb: any = null;

export function getAdminDb() {
  if (firestoreDb) return firestoreDb;

  console.log('[FirebaseAdmin] Starting getAdminDb stabilization sequence...');

  try {
    let credential: any = undefined;
    let projectId: string | undefined = undefined;
    let firestoreDatabaseId: string | undefined = undefined;

    // 1. First choice: Load service credentials from the FIREBASE_CONFIG environment variables (Vercel Production)
    if (process.env.FIREBASE_CONFIG) {
      console.log('[FirebaseAdmin] Found process.env.FIREBASE_CONFIG environment variable.');
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
        console.log('[FirebaseAdmin] Successfully parsed process.env.FIREBASE_CONFIG of length:', process.env.FIREBASE_CONFIG.length);

        const pId = serviceAccount.project_id || serviceAccount.projectId;
        const privateKey = serviceAccount.private_key || serviceAccount.privateKey;
        const clientEmail = serviceAccount.client_email || serviceAccount.clientEmail;

        if (pId && privateKey && clientEmail) {
          console.log(`[FirebaseAdmin] Found valid Service Account in FIREBASE_CONFIG for project "${pId}". Formulating certificate...`);
          // Clean private_key escaped newlines
          const formattedKey = privateKey.replace(/\\n/g, '\n');
          credential = admin.credential.cert({
            projectId: pId,
            clientEmail: clientEmail,
            privateKey: formattedKey
          });
          projectId = pId;
          firestoreDatabaseId = serviceAccount.firestoreDatabaseId || serviceAccount.databaseId || serviceAccount.firestore_database_id;
          console.log('[FirebaseAdmin] Cert credential created successfully.');
        } else {
          console.log('[FirebaseAdmin] FIREBASE_CONFIG exists but does not appear to be a direct Service Account JSON. Will try disk fallback.');
          projectId = pId;
          firestoreDatabaseId = serviceAccount.firestoreDatabaseId || serviceAccount.databaseId || serviceAccount.firestore_database_id;
        }
      } catch (jsonErr: any) {
        console.error('[FirebaseAdmin] Error parsing/loading FIREBASE_CONFIG:', jsonErr.message);
      }
    }

    // 2. Second choice: Fallback to reading firebase-applet-config.json from disk
    if (!projectId) {
      let configObj: any = null;
      const pathsToTry: { name: string; path: string }[] = [];

      try {
        pathsToTry.push({
          name: 'process.cwd()',
          path: join(process.cwd(), 'firebase-applet-config.json'),
        });
      } catch (e: any) {
        console.log('[FirebaseAdmin] Failed to compute process.cwd() path:', e.message);
      }

      try {
        if (import.meta.url) {
          const currentFilePath = fileURLToPath(import.meta.url);
          pathsToTry.push({
            name: 'import.meta.url resolver',
            path: join(currentFilePath, '../../..', 'firebase-applet-config.json'),
          });
        }
      } catch (e: any) {
        // ignore if not supported
      }

      try {
        if (typeof __dirname !== 'undefined') {
          pathsToTry.push({
            name: '__dirname resolver',
            path: join(__dirname, '../../..', 'firebase-applet-config.json'),
          });
        }
      } catch (e: any) {
        // ignore
      }

      pathsToTry.push({
        name: 'Direct Relative Root (./firebase-applet-config.json)',
        path: './firebase-applet-config.json',
      });
      pathsToTry.push({
        name: 'Direct Relative Up (../firebase-applet-config.json)',
        path: '../firebase-applet-config.json',
      });

      for (const p of pathsToTry) {
        if (existsSync(p.path)) {
          console.log(`[FirebaseAdmin] Checking/loading file at [${p.name}]: "${p.path}"`);
          try {
            const raw = readFileSync(p.path, 'utf-8');
            configObj = JSON.parse(raw);
            console.log(`[FirebaseAdmin] Match found on disk at [${p.name}]!`);
            break;
          } catch (readErr: any) {
            console.error(`[FirebaseAdmin] Error reading file at "${p.path}":`, readErr.message);
          }
        }
      }

      if (configObj) {
        projectId = configObj.projectId || configObj.project_id;
        firestoreDatabaseId = configObj.firestoreDatabaseId || configObj.databaseId || configObj.firestore_database_id;

        const privateKey = configObj.privateKey || configObj.private_key;
        const clientEmail = configObj.clientEmail || configObj.client_email;

        if (privateKey && clientEmail) {
          console.log('[FirebaseAdmin] Service Account found inside disk configuration JSON. Constructing cert credentials...');
          credential = admin.credential.cert({
            projectId: projectId,
            clientEmail: clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n')
          });
          console.log('[FirebaseAdmin] Cert credentials built successfully from disk configuration.');
        }
      }
    }

    // 3. Fallback: individual environment variables
    if (!projectId) {
      projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
      firestoreDatabaseId = process.env.FIREBASE_DATABASE_ID || process.env.FIRESTORE_DATABASE_ID;
    }

    if (!projectId) {
      throw new Error('Firebase Admin initialization failure: No project identifier could be resolved.');
    }

    // 4. Initialize administrative app singleton safely
    const apps = admin.apps;
    let app: any;
    if (apps.length === 0) {
      console.log('[FirebaseAdmin] Initializing new Firebase admin App with project identifier:', projectId);
      app = admin.initializeApp({
        credential,
        projectId
      });
    } else {
      console.log('[FirebaseAdmin] Active Firebase admin App exists. Reusing standard credentials singleton.');
      app = apps[0];
    }

    const dbId = firestoreDatabaseId && firestoreDatabaseId !== '(default)'
      ? firestoreDatabaseId
      : undefined;

    console.log(`[FirebaseAdmin] Attaching Firestore database instance reference. Database ID used: "${dbId || '(default)'}"`);
    firestoreDb = getFirestore(app, dbId);
    console.log('[FirebaseAdmin] Firestore db instance initialized successfully.');

  } catch (err: any) {
    console.error('[FirebaseAdmin] CRITICAL: Failed to initialize Firebase Admin service:', err);
    throw err;
  }

  return firestoreDb;
}
