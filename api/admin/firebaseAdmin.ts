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

    // 1. Try FIREBASE_CONFIG first (checks for service account credential)
    if (process.env.FIREBASE_CONFIG) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);
        const pId = serviceAccount.project_id || serviceAccount.projectId;
        const privateKey = serviceAccount.private_key || serviceAccount.privateKey;
        const clientEmail = serviceAccount.client_email || serviceAccount.clientEmail;
        firestoreDatabaseId = serviceAccount.firestoreDatabaseId || serviceAccount.databaseId || serviceAccount.firestore_database_id;

        if (pId && privateKey && clientEmail) {
          const formattedKey = privateKey.replace(/\\n/g, '\n');
          credential = admin.credential.cert({
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
          credential = admin.credential.cert({
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

    // 4. Initialize administrative app singleton safely
    const apps = admin.apps;
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
      app = admin.initializeApp(options);
      console.log('✅ Firebase Admin app initialized successfully');
    } else {
      app = apps[0];
    }

    const dbId = firestoreDatabaseId && firestoreDatabaseId !== '(default)'
      ? firestoreDatabaseId
      : undefined;

    firestoreDb = getFirestore(app, dbId);
    console.log(`✅ Firestore db instance initialized successfully. Database ID: "${dbId || '(default)'}"`);

  } catch (err: any) {
    console.error('[FirebaseAdmin] Failed to initialize Firebase Admin service:', err);
    // Keep it robust, don't throw to avoid killing server startup
  }

  return firestoreDb;
}
