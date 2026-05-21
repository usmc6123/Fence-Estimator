import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatFeetInches(totalFeet: number) {
  const feet = Math.floor(totalFeet);
  const inches = Math.round((totalFeet - feet) * 12);
  
  if (inches === 12) {
    return `${feet + 1}'0"`;
  }
  
  return `${feet}'${inches}"`;
}

export function getCanonicalSupplierName(name: string): string {
  if (!name) return 'Unknown Supplier';
  let clean = name.trim();
  
  const lower = clean.toLowerCase();
  if (lower.includes('forney')) {
    return 'Forney Fence';
  }
  if (lower.includes('viking')) {
    return 'Viking Fence';
  }

  // Remove trailing common noise keywords
  let prevClean = '';
  while (clean !== prevClean) {
    prevClean = clean;
    clean = clean.replace(/\s+(company|co|corp|corporation|inc|incorporated|llc|ltd|limited|supply|depot|distributor|distributors|wholesale|wholesalers|group|fencing|fence)\.?$/gi, '');
  }

  // Also remove trailing special characters like commas, ampersands, hyphens, slashes
  clean = clean.replace(/[\s,&-\\/]+$/, '').trim();

  // If we stripped too much or everything, fall back to the original nicely trimmed/Title cased
  if (!clean) {
    clean = name.trim();
  }

  // Title Case
  const finalized = clean.split(/\s+/).map(word => {
    if (!word) return '';
    // Preserve words like "US", "USA", "SKU"
    if (word.toUpperCase() === 'US' || word.toUpperCase() === 'USA') {
      return word.toUpperCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');

  return finalized;
}

