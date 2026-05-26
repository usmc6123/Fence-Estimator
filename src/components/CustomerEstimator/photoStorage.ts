import { db } from '../../lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';

const DB_NAME = 'LoneStarFenceWorksDB';
const DB_VERSION = 1;
const STORE_NAME = 'CustomPhotosStore';
const PHOTO_KEY = 'customer_estimator_custom_photos';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Retrieves the stored custom photos.
 * First tries to load cached files locally, then syncs with Firestore cloud storage (unauthenticated list is allowed).
 */
export async function getCustomPhotos(): Promise<Record<string, string>> {
  let localPhotos: Record<string, string> = {};

  // Try reading from local IndexedDB first
  try {
    const db = await getDB();
    const photos: Record<string, string> = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(PHOTO_KEY);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || {});
    });
    localPhotos = photos;
  } catch (error) {
    console.warn('IndexedDB retrieval failed, fallback to localStorage read:', error);
    try {
      const local = localStorage.getItem(PHOTO_KEY);
      if (local) localPhotos = JSON.parse(local);
    } catch (_) {}
  }

  // Cloud Firestore read-through to ensure visitor and widget sync
  try {
    const q = collection(db, 'customPhotos');
    const cloudSnap = await getDocs(q);
    const cloudPhotos: Record<string, string> = {};
    
    cloudSnap.docs.forEach((docRef) => {
      const d = docRef.data();
      if (d && d.base64) {
        cloudPhotos[docRef.id] = d.base64;
      }
    });

    if (Object.keys(cloudPhotos).length > 0 || cloudSnap.size === 0) {
      // Sync to local cache
      try {
        const dbLocal = await getDB();
        await new Promise<void>((resolve, reject) => {
          const transaction = dbLocal.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.put(cloudPhotos, PHOTO_KEY);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      } catch (err) {
        console.warn('Failed to cache cloud photos in local db:', err);
      }
      return cloudPhotos;
    }
  } catch (cloudErr) {
    console.warn('Could not read custom photos from Firestore, falling back to local database:', cloudErr);
  }

  return localPhotos;
}

/**
 * Saves custom photos into IndexedDB and Firestore.
 */
export async function saveCustomPhotos(photos: Record<string, string>): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(photos, PHOTO_KEY);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
    
    // Also clean localStorage key just in case it was left over
    localStorage.removeItem(PHOTO_KEY);
  } catch (error) {
    console.error('IndexedDB save failed, fallback to localStorage write:', error);
    try {
      localStorage.setItem(PHOTO_KEY, JSON.stringify(photos));
    } catch (e) {
      console.error('Even localstorage fallback failed due to size quota:', e);
      throw e;
    }
  }

  // Sync to Firestore Cloud Collection
  try {
    const q = collection(db, 'customPhotos');
    const cloudSnap = await getDocs(q);
    const cloudDocIds = cloudSnap.docs.map(doc => doc.id);

    // Save/update any photo present in current photos set
    for (const key of Object.keys(photos)) {
      const docRef = doc(db, 'customPhotos', key);
      await setDoc(docRef, { base64: photos[key] });
    }

    // Remove any photo that was deleted
    for (const docId of cloudDocIds) {
      if (!photos[docId]) {
        await deleteDoc(doc(db, 'customPhotos', docId));
      }
    }
  } catch (syncErr) {
    console.warn('Cloud Firestore photo sync bypassed/failed (unauthorized or offline):', syncErr);
  }
}

/**
 * Clears stored custom photos from both IndexedDB, localStorage and Firestore.
 */
export async function clearCustomPhotos(): Promise<void> {
  try {
    const dbLocal = await getDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = dbLocal.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(PHOTO_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (e) {
    console.error('IndexedDB clear failed:', e);
  }
  localStorage.removeItem(PHOTO_KEY);

  // Attempt clean cloud
  try {
    const q = collection(db, 'customPhotos');
    const cloudSnap = await getDocs(q);
    const batch = writeBatch(db);
    cloudSnap.docs.forEach((docRef) => {
      batch.delete(docRef.ref);
    });
    await batch.commit();
  } catch (err) {
    console.warn('Could not clear Firestore photos (unauthorized or offline):', err);
  }
}
