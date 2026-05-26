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
 * If there are existing records in localStorage, they are automatically migrated to IndexedDB,
 * the old localStorage key is cleaned up to prevent future QuotaExceededError, and data is synced.
 */
export async function getCustomPhotos(): Promise<Record<string, string>> {
  try {
    const db = await getDB();
    const photos: Record<string, string> = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(PHOTO_KEY);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || {});
    });

    // Check for existing localStorage records to migrate
    const localSaved = localStorage.getItem(PHOTO_KEY);
    if (localSaved) {
      try {
        const parsed = JSON.parse(localSaved);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          const merged = { ...parsed, ...photos };
          await saveCustomPhotos(merged);
          localStorage.removeItem(PHOTO_KEY);
          return merged;
        }
      } catch (e) {
        console.error('Migration of local customer photos failed:', e);
      }
    }

    return photos;
  } catch (error) {
    console.error('IndexedDB retrieval failed, fallback to localStorage read:', error);
    try {
      const local = localStorage.getItem(PHOTO_KEY);
      return local ? JSON.parse(local) : {};
    } catch (_) {
      return {};
    }
  }
}

/**
 * Saves custom photos into IndexedDB.
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
}

/**
 * Clears stored custom photos from both IndexedDB and localStorage.
 */
export async function clearCustomPhotos(): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(PHOTO_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (e) {
    console.error('IndexedDB clear failed:', e);
  }
  localStorage.removeItem(PHOTO_KEY);
}
