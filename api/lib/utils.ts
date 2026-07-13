/**
 * Sanitizes an object for Firestore by removing undefined values,
 * recursively cleaning nested objects and arrays.
 * 
 * @param obj The object or value to sanitize
 * @returns The sanitized value
 */
export function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) {
    return null;
  }
  
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle Date objects
  if (obj instanceof Date) {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item));
  }

  // Handle objects
  const sanitized: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (value !== undefined) {
        sanitized[key] = sanitizeForFirestore(value);
      }
    }
  }
  return sanitized;
}
