export type MaterialCategory = 'Post' | 'Rail' | 'Picket' | 'Panel' | 'Gate' | 'Hardware' | 'Concrete' | 'Labor' | 'PostCap' | 'Demolition' | 'SitePrep' | 'Fastener' | 'Finishing' | 'Consumable' | 'Metal' | 'Structure';

export interface MaterialItem {
  id: string;
  companyId?: string;
  name: string;
  category: MaterialCategory;
  unit: 'each' | 'lf' | 'bag' | 'hour' | 'cu yd' | 'box' | 'gallon' | 'trip' | 'pint' | 'pair';
  cost: number;
  priceSource?: string;
  description?: string;
  imageUrl?: string;
  aliases?: string[]; // Remembered naming conventions from supplier quotes
  lastPriceUpdate?: string; // ISO string 
}

export interface FenceStyle {
  id: string;
  name: string;
  type: 'Wood' | 'Aluminum' | 'Chain Link' | 'Metal' | 'Farm' | 'Pipe';
  description: string;
  availableHeights: number[];
  availableWidths: number[];
  availableColors: string[];
  visualStyles: {
    id: string;
    name: string;
    priceModifier: number;
    imageUrl: string;
  }[];
  calcLogic: {
    postsPerLF: number;
    railsPerLF: number;
    picketsPerLF: number;
    concretePerPost: number;
  };
  baseLaborRate: number;
}

export interface GateDetail {
  id: string;
  type: 'Single' | 'Double';
  width: number;
  construction?: 'Pre-made' | 'Welded';
  position?: number; // Distance from start of run in feet
  customItems?: {
    id: string;
    name: string;
    qty: number;
    unit: string;
    unitCost: number;
    category: string;
  }[];
}

export interface FenceRun {
  id: string;
  name: string;
  linearFeet: number;
  corners: number;
  gates: number;
  gateDetails?: GateDetail[];
  points?: { lat: number; lng: number }[]; // Coordinates from map measurements
  // Style per run
  styleId: string;
  visualStyleId: string;
  height: number;
  color: string;
  isPreStained?: boolean;
  reusePosts?: boolean;
  concreteType?: 'Maximizer' | 'Quickset';
  woodType?: 'PT Pine' | 'Western Red Cedar' | 'Japanese Cedar';
  ironRails?: '2 rail' | '3 rail';
  ironTop?: 'Flat top' | 'Pressed point top';
  ironInstallType?: 'Bolt up' | 'Weld up';
  topStyle?: 'Dog Ear' | 'Flat Top';
  chainLinkGrade?: 'Residential' | 'Commercial';
  hasBottomRail?: boolean;
  hasRotBoard?: boolean;
  hasDemolition?: boolean;
  demoLinearFeet?: number;
  demoType?: 'Wood' | 'Chain Link' | 'Metal';
  // Existing and Stain options
  isExistingFence?: boolean;
  isStartOfNewSection?: boolean;
  needsStain?: boolean;
  stainSides?: 'One Side' | 'Both Sides';
}

export interface LaborRates {
  woodSideBySide6: number;
  woodBoardOnBoard6: number;
  woodSideBySide8: number;
  woodBoardOnBoard8: number;
  ironBoltUp: number;
  ironWeldUp: number;
  chainLink: number;
  pipeFence: number;
  topCap: number;
  additionalRailPipe: number;
  demo: number;
  washAndStain: number; // per sq ft
  gateWeldedFrame: number;
  gateWoodWalk: number;
  gateWoodDrive: number;
  gateHangPreMade: number;
}

export interface QuoteItem {
  id: string;
  materialName: string;
  qty: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  mappedMaterialId?: string; // Links to our MaterialLibrary
}

export interface SupplierQuote {
  id: string;
  companyId?: string;
  supplierName: string;
  date: string;
  items: QuoteItem[];
  totalAmount: number;
  fileUrl?: string; // For the "uploaded" visual
  fileName?: string;
  fileType?: string;
}

export interface Estimate {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  customerStreet?: string;
  customerCity?: string;
  customerState?: string;
  customerZip?: string;
  date: string;
  
  // Measurements
  linearFeet: number;
  corners: number;
  height: number;
  width: number;
  runs: FenceRun[];
  
  // Default Settings (used for new runs or bulk apply)
  defaultStyleId: string;
  defaultVisualStyleId: string;
  defaultHeight: number;
  defaultColor: string;
  
  woodType?: 'PT Pine' | 'Western Red Cedar' | 'Japanese Cedar';
  ironRails?: '2 rail' | '3 rail';
  ironTop?: 'Flat top' | 'Pressed point top';
  ironInstallType?: 'Bolt up' | 'Weld up';
  topStyle?: 'Dog Ear' | 'Flat Top';
  defaultChainLinkGrade?: 'Residential' | 'Commercial';
  defaultHasBottomRail?: boolean;
  isPreStained?: boolean;
  
  // Site Prep
  hasSitePrep: boolean;
  needsClearing: boolean;
  needsMarking: boolean;
  obstacleRemoval: boolean;
  
  // Accessories
  postCapId: string;
  hasCapAndTrim: boolean;
  hasDoubleTrim?: boolean;
  hasTopCap?: boolean;
  gateCount: number;
  gateStyleId: string;
  
  // Advanced
  wastePercentage: number;
  includeStain: boolean;
  hasRotBoard?: boolean;
  footingType: 'Cuboid' | 'Cylindrical';
  concreteType: 'Maximizer' | 'Quickset';
  postWidth: number;
  postThickness: number;
  
  // Financials
  markupPercentage: number;
  taxPercentage: number;
  laborRates: LaborRates;
  pricingStrategy?: 'best' | 'supplier';
  selectedSupplier?: string;
  deliveryFee: number;
  manualQuantities: Record<string, number>; // itemId -> qty
  manualPrices: Record<string, number>; // itemId -> price
  manualGrandTotal?: number | null;
  manualSectionTotals?: number[];
  manualGateTotals?: number[];
  manualDemoTotals?: number[];
  contractProjectDate?: string;
  contractScope?: string;
  laborScope?: string;
  createdAt: string;
  version?: number;
  parentId?: string; // Links to the original version id

  // Supplier Quotes
  quotes?: SupplierQuote[];
}

export interface SavedEstimate extends Estimate {
  status: 'active' | 'archived';
  lastModified: string;
}

export interface CompanyInfo {
  name: string;
  logo: string;
  phone: string;
  email: string;
  website: string;
  address: string;
}

export type TransactionType = 'Income' | 'Expense';
export type TransactionStatus = 'Pending' | 'Cleared' | 'Reconciled';

export interface BankAccount {
  id: string;
  name: string;
  type: 'Checking' | 'Savings' | 'Credit Card';
  balance: number;
  institutionName: string;
  lastSync?: string;
  userId: string;
}

export interface BankTransaction {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  type: TransactionType;
  description: string;
  category: string;
  status: TransactionStatus;
  estimateId?: string; // Link to an estimate for job costing
  ref?: string;
  receiptUrl?: string;
  receiptName?: string;
  notes?: string;
  userId: string;
}

export interface InventoryStock {
  id: string;
  materialId: string;
  quantityInStock: number;
  minStockLevel: number;
  averageCost: number;
  userId: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  lines: {
    accountName: string;
    debit: number;
    credit: number;
  }[];
  userId: string;
}
