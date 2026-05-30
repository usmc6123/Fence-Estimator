import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { getFirestore } from 'firebase-admin/firestore';

let adminDb: any = null;

export function getAdminDb() {
  if (adminDb) return adminDb;

  console.log('[FirebaseAdmin] Starting getAdminDb initialization...');

  let configObj: any = null;

  try {
    // 1. Check if process.env.FIREBASE_CONFIG environment variable exists
    if (process.env.FIREBASE_CONFIG) {
      console.log('[FirebaseAdmin] Found process.env.FIREBASE_CONFIG environment variable.');
      try {
        configObj = JSON.parse(process.env.FIREBASE_CONFIG);
        console.log('[FirebaseAdmin] Successfully parsed process.env.FIREBASE_CONFIG JSON string');
      } catch (jsonErr: any) {
        const errorMsg = `[FirebaseAdmin] CRITICAL: Failed to parse process.env.FIREBASE_CONFIG. Raw content length: ${process.env.FIREBASE_CONFIG.length}. Error: ${jsonErr.message}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
    } else {
      console.log('[FirebaseAdmin] process.env.FIREBASE_CONFIG is empty. Falling back to files...');
    }

    // 2. Fallback: If not loaded via environment variable, try reading firebase-applet-config.json from disk
    if (!configObj) {
      const pathsToTry: { name: string; path: string }[] = [];

      // Attempt A: Process current working directory
      try {
        pathsToTry.push({
          name: 'process.cwd()',
          path: join(process.cwd(), 'firebase-applet-config.json'),
        });
      } catch (e: any) {
        console.log('[FirebaseAdmin] Failed to compute process.cwd() path:', e.message);
      }

      // Attempt B: import.meta.url absolute path resolver
      try {
        if (import.meta.url) {
          const currentFilePath = fileURLToPath(import.meta.url);
          pathsToTry.push({
            name: 'import.meta.url resolver',
            path: join(currentFilePath, '../../..', 'firebase-applet-config.json'),
          });
        }
      } catch (e: any) {
        console.log('[FirebaseAdmin] Failed to compute import.meta.url path:', e.message);
      }

      // Attempt C: Relative path from __dirname
      try {
        if (typeof __dirname !== 'undefined') {
          pathsToTry.push({
            name: '__dirname resolver',
            path: join(__dirname, '../../..', 'firebase-applet-config.json'),
          });
        }
      } catch (e: any) {
        console.log('[FirebaseAdmin] Failed to compute __dirname path:', e.message);
      }

      // Attempt D: Direct relative path checks
      pathsToTry.push({
        name: 'Direct Relative Root (./firebase-applet-config.json)',
        path: './firebase-applet-config.json',
      });
      pathsToTry.push({
        name: 'Direct Relative Up (../firebase-applet-config.json)',
        path: '../firebase-applet-config.json',
      });

      // Check existing paths sequentially
      for (const p of pathsToTry) {
        console.log(`[FirebaseAdmin] Checking path [${p.name}]: "${p.path}"`);
        if (existsSync(p.path)) {
          console.log(`[FirebaseAdmin] Match found at [${p.name}]! Loading: "${p.path}"`);
          try {
            const raw = readFileSync(p.path, 'utf-8');
            configObj = JSON.parse(raw);
            console.log(`[FirebaseAdmin] Successfully read and parsed Configuration File from path: "${p.path}"`);
            break;
          } catch (readErr: any) {
            console.error(`[FirebaseAdmin] Error reading/parsing file at "${p.path}":`, readErr.message);
          }
        } else {
          console.log(`[FirebaseAdmin] File does NOT exist at "${p.path}"`);
        }
      }
    }

    // 3. Fallback: If still unconfigured, check other individual environment variables
    if (!configObj) {
      console.log('[FirebaseAdmin] Config not yet found. Checking other individual environment variables...');
      
      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
      let privateKey = process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
      const firestoreDatabaseId = process.env.FIREBASE_DATABASE_ID || process.env.FIRESTORE_DATABASE_ID || process.env.FIREBASE_FIRESTORE_DATABASE_ID;

      if (projectId) {
        console.log(`[FirebaseAdmin] Initializing with environmental variables. Project ID: "${projectId}"`);
        if (privateKey) {
          privateKey = privateKey.replace(/\\n/g, '\n');
        }
        configObj = {
          projectId,
          privateKey,
          clientEmail,
          firestoreDatabaseId
        };
      }
    }

    // 4. Reject if no config was resolved
    if (!configObj) {
      const errMsg = 'Firebase Admin initialization failed: No config found in process.env.FIREBASE_CONFIG, firebase-applet-config.json on disk, or other individual environment variables.';
      console.error(`[FirebaseAdmin] CRITICAL_ERROR: ${errMsg}`);
      throw new Error(errMsg);
    }

    const projectId = configObj.projectId || configObj.project_id;
    if (!projectId) {
      const errMsg = `Firebase Admin initialization failed: Resolved configuration object does not contain a "projectId" or "project_id". Config keys: ${Object.keys(configObj).join(', ')}`;
      console.error(`[FirebaseAdmin] CRITICAL_ERROR: ${errMsg}`);
      throw new Error(errMsg);
    }

    console.log(`[FirebaseAdmin] Resolved ProjectId: "${projectId}"`);
    
    // Support both web config with "firestoreDatabaseId" and custom with "databaseId" / "firestoreDatabaseId" or environment override
    const firestoreDatabaseId = configObj.firestoreDatabaseId || configObj.firestore_database_id || configObj.databaseId || configObj.database_id || process.env.FIREBASE_DATABASE_ID || process.env.FIRESTORE_DATABASE_ID;
    console.log(`[FirebaseAdmin] Resolved Firestore databaseId: "${firestoreDatabaseId || '(default)'}"`);

    const privateKey = configObj.privateKey || configObj.private_key;
    const clientEmail = configObj.clientEmail || configObj.client_email;
    const hasPrivateKey = !!privateKey;
    const hasClientEmail = !!clientEmail;
    console.log(`[FirebaseAdmin] Credential presence - private key: ${hasPrivateKey}, client email: ${hasClientEmail}`);

    let credential: any = undefined;
    if (hasPrivateKey) {
      try {
        console.log('[FirebaseAdmin] Developing Admin SDK credentials using cert objects');
        credential = admin.credential.cert({
          projectId: projectId,
          clientEmail: clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n')
        });
        console.log('[FirebaseAdmin] Admin cert object successfully configured');
      } catch (credErr: any) {
        console.error('[FirebaseAdmin] Credential cert constructor failed:', credErr);
      }
    } else {
      console.log('[FirebaseAdmin] Initializing with default SDK credentials mode (ADC / ProjectID only)');
    }

    // Initialize or retrieve the firebase administration app
    const app = admin.apps.length === 0
      ? admin.initializeApp({
          credential,
          projectId: projectId
        })
      : admin.apps[0];

    console.log('[FirebaseAdmin] Firebase admin App initialized successfully. Total apps:', admin.apps.length);

    const dbId = firestoreDatabaseId && firestoreDatabaseId !== '(default)'
      ? firestoreDatabaseId
      : undefined;

    console.log(`[FirebaseAdmin] Fetching Firestore referencing db instance ID: "${dbId || '(default)'}"`);
    adminDb = getFirestore(app, dbId);
    console.log('[FirebaseAdmin] Firestore db instance created successfully.');

  } catch (err: any) {
    console.error('[FirebaseAdmin] CRITICAL: Failed to initialize Firebase Admin SDK:', err);
    throw err;
  }

  return adminDb;
}
