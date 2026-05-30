import * as admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { getFirestore } from 'firebase-admin/firestore';

let adminDb: any = null;
let app: any = null;

export function getAdminDb() {
  if (adminDb) return adminDb;

  console.log('[FirebaseAdmin] Starting getAdminDb initialization...');

  let configObj: any = null;
  let credential: any = undefined;
  let projectId: string | undefined = undefined;
  let databaseId: string | undefined = undefined;

  // 1. Try reading configuration from process.env.FIREBASE_CONFIG
  try {
    if (process.env.FIREBASE_CONFIG) {
      console.log('[FirebaseAdmin] Found process.env.FIREBASE_CONFIG environment variable.');
      configObj = JSON.parse(process.env.FIREBASE_CONFIG);
      console.log('[FirebaseAdmin] Successfully parsed process.env.FIREBASE_CONFIG of length:', process.env.FIREBASE_CONFIG.length);

      // Clean private_key spaces and newlines if they are escaped as literal '\n'
      if (configObj.private_key) {
        configObj.private_key = configObj.private_key.replace(/\\n/g, '\n');
      }
      if (configObj.privateKey) {
        configObj.privateKey = configObj.privateKey.replace(/\\n/g, '\n');
      }

      const prId = configObj.project_id || configObj.projectId;
      const key = configObj.private_key || configObj.privateKey;
      const email = configObj.client_email || configObj.clientEmail;

      if (prId && key && email) {
        console.log('[FirebaseAdmin] Configuration has valid Service Account private key & email. Initializing credential via cert...');
        credential = admin.credential.cert(configObj);
        projectId = prId;
        databaseId = configObj.firestoreDatabaseId || configObj.databaseId || configObj.firestore_database_id;
        console.log('[FirebaseAdmin] Successfully built admin.credential.cert credential.');
      } else {
        console.log('[FirebaseAdmin] process.env.FIREBASE_CONFIG is a Client SDK config or missing credentials. Will proceed with disk fallback.');
        configObj = null; // Reset to trigger disk configuration lookup
      }
    } else {
      console.log('[FirebaseAdmin] process.env.FIREBASE_CONFIG is empty.');
    }
  } catch (err: any) {
    console.error('[FirebaseAdmin] Failed to parse/initialize process.env.FIREBASE_CONFIG:', err);
    // Do not throw, allow code path to attempt disk configuration fallbacks
  }

  // 2. Fallback to reading firebase-applet-config.json from disk
  let diskConfig: any = null;
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
    // ignore if import.meta.url is not supported or errors out
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

  console.log('[FirebaseAdmin] Evaluating disk paths for firebase-applet-config.json...');
  for (const p of pathsToTry) {
    console.log(`[FirebaseAdmin] Checking if file exists at [${p.name}]: "${p.path}"`);
    if (existsSync(p.path)) {
      console.log(`[FirebaseAdmin] Found file at [${p.name}]!`);
      try {
        const raw = readFileSync(p.path, 'utf-8');
        diskConfig = JSON.parse(raw);
        console.log(`[FirebaseAdmin] Successfully read/parsed file from: "${p.path}"`);
        break;
      } catch (readErr: any) {
        console.error(`[FirebaseAdmin] Error reading file at "${p.path}":`, readErr.message);
      }
    }
  }

  // Merge disk configuration back if not already established
  if (!configObj && diskConfig) {
    console.log('[FirebaseAdmin] Initializing using loaded disk config details');
    configObj = diskConfig;
    projectId = configObj.projectId || configObj.project_id;
    databaseId = configObj.firestoreDatabaseId || configObj.databaseId || configObj.firestore_database_id;
  }

  // 3. Last fallback check against individual environment variables (for developer environment configurations)
  if (!projectId) {
    projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
    console.log('[FirebaseAdmin] ProjectId fell back to environment process.env.FIREBASE_PROJECT_ID / VITE_FIREBASE_PROJECT_ID:', projectId);
  }
  if (!databaseId) {
    databaseId = process.env.FIREBASE_DATABASE_ID || process.env.FIRESTORE_DATABASE_ID || process.env.FIREBASE_FIRESTORE_DATABASE_ID;
  }

  // Reject if no ProjectId is resolved
  if (!projectId) {
    const errorMsg = 'Firebase Admin initialization failed: No project configuration resolved from env (FIREBASE_CONFIG), disk (firebase-applet-config.json), or environment process.env.FIREBASE_PROJECT_ID.';
    console.error(`[FirebaseAdmin] CRITICAL: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  console.log(`[FirebaseAdmin] Resolved ProjectId: "${projectId}"`);
  console.log(`[FirebaseAdmin] Resolved databaseId: "${databaseId || '(default)'}"`);

  // Build credentials cert from custom environment variables if not loaded yet
  if (!credential && configObj) {
    const privateKey = configObj.privateKey || configObj.private_key;
    const clientEmail = configObj.clientEmail || configObj.client_email;

    if (privateKey && clientEmail) {
      try {
        console.log('[FirebaseAdmin] Initializing credential with custom serviceAccount cert parsed from disk file configuration');
        credential = admin.credential.cert({
          projectId: projectId,
          clientEmail: clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n')
        });
        console.log('[FirebaseAdmin] Service account cert built successfully.');
      } catch (credErr: any) {
        console.error('[FirebaseAdmin] Failed to construct credentialcert:', credErr);
      }
    }
  }

  // 4. Initialize administration app singleton
  try {
    if (!app) {
      const apps = admin.apps;
      if (apps.length === 0) {
        console.log('[FirebaseAdmin] Standard initializeApp with properties:', {
          projectId,
          hasCredential: !!credential,
          databaseId
        });
        app = admin.initializeApp({
          credential,
          projectId
        });
        console.log('[FirebaseAdmin] Firebase admin App initialized successfully.');
      } else {
        app = apps[0];
        console.log('[FirebaseAdmin] Reusing existing default firebase-admin app.');
      }
    }

    const dbId = databaseId && databaseId !== '(default)' ? databaseId : undefined;
    console.log(`[FirebaseAdmin] Fetching Firestore database reference. DB ID used: "${dbId || '(default)'}"`);

    if (getFirestore) {
      adminDb = getFirestore(app, dbId);
    } else {
      adminDb = admin.firestore(app);
    }

    console.log('[FirebaseAdmin] Firestore db instance created successfully.');

  } catch (initErr: any) {
    console.error('[FirebaseAdmin] CRITICAL: Failed to initialize Firebase Admin app or database instance:', initErr);
    throw initErr;
  }

  return adminDb;
}
