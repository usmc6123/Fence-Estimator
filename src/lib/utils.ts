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

export function assignEstimateNumbers<T extends { id: string; createdAt?: string; estimateNumber?: number }>(estimates: T[]): T[] {
  // Sort a copy by createdAt ascending to determine stable visual order
  const sorted = [...estimates].sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateA - dateB;
  });

  const usedNumbers = new Set<number>();
  sorted.forEach(est => {
    if (typeof est.estimateNumber === 'number' && est.estimateNumber >= 1201) {
      usedNumbers.add(est.estimateNumber);
    }
  });

  let nextNum = 1201;
  const result = sorted.map(est => {
    if (typeof est.estimateNumber === 'number' && est.estimateNumber >= 1201) {
      return est;
    }
    while (usedNumbers.has(nextNum)) {
      nextNum++;
    }
    usedNumbers.add(nextNum);
    return {
      ...est,
      estimateNumber: nextNum
    };
  });

  const idToNumber = new Map<string, number>();
  result.forEach(est => {
    idToNumber.set(est.id, est.estimateNumber!);
  });

  return estimates.map(est => ({
    ...est,
    estimateNumber: idToNumber.get(est.id)
  }));
}

export function calculateEstimatePricing(estimate: any): any {
  if (!estimate) return estimate;

  // Safe helper to convert any potential input value to a valid number
  const toNum = (val: any, fallback = 0): number => {
    if (val === null || val === undefined || val === '') return fallback;
    const parsed = typeof val === 'number' ? val : parseFloat(val);
    return isNaN(parsed) ? fallback : parsed;
  };

  // Legacy fallback and inference
  let finalPrice = 0;
  if (estimate.finalCustomerPrice !== undefined && estimate.finalCustomerPrice !== null) {
    finalPrice = toNum(estimate.finalCustomerPrice);
  } else if (estimate.manualGrandTotal !== undefined && estimate.manualGrandTotal !== null) {
    finalPrice = toNum(estimate.manualGrandTotal);
  } else if (estimate.estimatedPrice !== undefined && estimate.estimatedPrice !== null) {
    finalPrice = toNum(estimate.estimatedPrice);
  } else if (estimate.totalCost !== undefined && estimate.totalCost !== null) {
    finalPrice = toNum(estimate.totalCost);
  } else if (estimate.total !== undefined && estimate.total !== null) {
    finalPrice = toNum(estimate.total);
  } else if (estimate.grandTotal !== undefined && estimate.grandTotal !== null) {
    finalPrice = toNum(estimate.grandTotal);
  }

  // If baseFencePrice is missing, infer it from existing calculated price.
  let baseFencePrice = estimate.baseFencePrice;
  if (baseFencePrice === undefined || baseFencePrice === null) {
    // Infer the baseFencePrice if possible: finalPrice + discountAmount - demoRemovalPrice - addOnTotal
    const inferredDemo = toNum(estimate.demoRemovalPrice, 0);
    const inferredAddOn = toNum(estimate.addOnSitePrepPrice !== undefined ? estimate.addOnSitePrepPrice : estimate.addOnTotal, 0);
    const inferredDiscount = toNum(estimate.discountAmount, 0);
    baseFencePrice = Math.max(0, finalPrice + inferredDiscount - inferredDemo - inferredAddOn);
  } else {
    baseFencePrice = toNum(baseFencePrice, 0);
  }

  const addOnSitePrepPrice = toNum(estimate.addOnSitePrepPrice !== undefined ? estimate.addOnSitePrepPrice : estimate.addOnTotal, 0);
  const demoRemovalPrice = toNum(estimate.demoRemovalPrice, 0);
  const discountAmount = toNum(estimate.discountAmount, 0);

  const subtotalBeforeDiscount = baseFencePrice + addOnSitePrepPrice + demoRemovalPrice;

  let manualGrandTotal = estimate.manualGrandTotal !== undefined ? estimate.manualGrandTotal : null;
  if (manualGrandTotal !== null && manualGrandTotal !== undefined && manualGrandTotal !== '') {
    manualGrandTotal = toNum(manualGrandTotal, 0);
  } else {
    manualGrandTotal = null;
  }

  let finalCustomerPrice = 0;
  if (manualGrandTotal !== null && manualGrandTotal !== 0) {
    finalCustomerPrice = Math.max(0, manualGrandTotal);
  } else {
    finalCustomerPrice = Math.max(0, subtotalBeforeDiscount - discountAmount);
  }

  const linearFeet = toNum(estimate.linearFeet, 0);
  const pricePerFoot = linearFeet > 0 ? (finalCustomerPrice / linearFeet) : 0;

  const originalCalculatedTotal = toNum(estimate.originalCalculatedTotal || estimate.totalCost || estimate.total || finalCustomerPrice, 0);

  return {
    ...estimate,
    baseFencePrice,
    addOnSitePrepPrice,
    addOnTotal: addOnSitePrepPrice, // Keep both in sync for security
    demoRemovalPrice,
    discountAmount,
    discountType: estimate.discountType || 'none',
    discountLabel: estimate.discountLabel || '',
    subtotalBeforeDiscount,
    finalCustomerPrice,
    manualGrandTotal,
    pricePerFoot,
    originalCalculatedTotal,
    pricingUpdatedAt: estimate.pricingUpdatedAt || new Date().toISOString()
  };
}

