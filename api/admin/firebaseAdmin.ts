import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getFirestore } from 'firebase-admin/firestore';

let adminDb: any = null;

export function getAdminDb() {
  if (adminDb) return adminDb;
  try {
    const configPath = join(process.cwd(), 'firebase-applet-config.json');
    if (existsSync(configPath)) {
      const firebaseConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      
      const app = admin.apps.length === 0
        ? admin.initializeApp({
            credential: (firebaseConfig.privateKey || firebaseConfig.private_key) 
              ? admin.credential.cert(firebaseConfig) 
              : undefined,
            projectId: firebaseConfig.projectId
          })
        : admin.apps[0];
      
      const dbId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
        ? firebaseConfig.firestoreDatabaseId 
        : undefined;

      adminDb = getFirestore(app, dbId);
    } else {
      console.warn('firebase-applet-config.json not found inside local file system.');
    }
  } catch (err) {
    console.error('Failed to initialize Firebase Admin SDK:', err);
  }
  return adminDb;
}
