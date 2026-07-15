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

export function getEstimateFinalPrice(estimate: any): number {
  if (!estimate) return 0;
  
  if (estimate.contractSnapshot) {
    const snap = estimate.contractSnapshot;
    const finalPrice = Number(snap.finalCustomerPrice || 0);
    if (snap.baseFenceTotal !== undefined && snap.baseFenceTotal !== null) {
      // New system: finalCustomerPrice already includes custom contract line items
      return finalPrice;
    }
    // Old system fallback
    const customTotal = Number(snap.customContractLineItemsTotal || 0);
    return finalPrice + customTotal;
  }
  
  if (estimate.baseFenceTotal !== undefined && estimate.baseFenceTotal !== null) {
    // New system: finalCustomerPrice already includes custom contract line items
    return Number(estimate.finalCustomerPrice || 0);
  }
  
  let basePrice = 0;
  if (estimate.finalCustomerPrice !== undefined && estimate.finalCustomerPrice !== null) {
    basePrice = Number(estimate.finalCustomerPrice);
  } else if (estimate.manualGrandTotal !== undefined && estimate.manualGrandTotal !== null) {
    basePrice = Number(estimate.manualGrandTotal);
  } else if (estimate.estimatedPrice !== undefined && estimate.estimatedPrice !== null) {
    basePrice = Number(estimate.estimatedPrice);
  } else if (estimate.grandTotal !== undefined && estimate.grandTotal !== null) {
    basePrice = Number(estimate.grandTotal);
  } else if (estimate.totalCost !== undefined && estimate.totalCost !== null) {
    basePrice = Number(estimate.totalCost);
  } else if (estimate.total !== undefined && estimate.total !== null) {
    basePrice = Number(estimate.total);
  }
  
  const customTotal = Number(estimate.customContractLineItemsTotal || 0);
  return basePrice + customTotal;
}

/**
 * Calculates the dollar and percentage difference between two prices.
 */
export function calculatePriceChange(
  oldPrice: number | null | undefined,
  newPrice: number | null | undefined
) {
  if (
    typeof oldPrice !== "number" ||
    typeof newPrice !== "number" ||
    !Number.isFinite(oldPrice) ||
    !Number.isFinite(newPrice)
  ) {
    return {
      dollarDifference: null,
      percentageDifference: null,
    };
  }

  const dollarDifference = newPrice - oldPrice;

  if (oldPrice === 0) {
    return {
      dollarDifference,
      percentageDifference: null,
    };
  }

  return {
    dollarDifference,
    percentageDifference: (dollarDifference / oldPrice) * 100,
  };
}

/**
 * Formats the price change result for display.
 * Example: +$2.00 (+20.0%)
 */
export function formatPriceChange(
  dollarDifference: number | null,
  percentageDifference: number | null
): string {
  if (dollarDifference === null) return "—";

  const sign = dollarDifference > 0 ? "+" : "";
  const dollarStr = formatCurrency(dollarDifference);
  
  // Intl.NumberFormat for currency usually includes the negative sign if the number is negative
  // formatCurrency(-2) -> -$2.00
  // So we only manually add '+' for positive.
  
  let result = `${sign}${dollarStr}`;

  if (percentageDifference !== null) {
    const pSign = percentageDifference > 0 ? "+" : "";
    result += ` (${pSign}${percentageDifference.toFixed(1)}%)`;
  } else {
    result += ` (N/A)`;
  }

  return result;
}


