export type MaterialCategory = 'Post' | 'Rail' | 'Picket' | 'Panel' | 'Gate' | 'Hardware' | 'Concrete' | 'Labor' | 'PostCap' | 'Demolition' | 'SitePrep' | 'Fastener' | 'Finishing' | 'Consumable';

export interface MaterialItem {
  id: string;
  name: string;
  category: MaterialCategory;
  unit: 'each' | 'lf' | 'bag' | 'hour' | 'cu yd' | 'box' | 'gallon' | 'trip' | 'pint';
  cost: number;
  description?: string;
  imageUrl?: string;
  aliases?: string[]; // Remembered naming conventions from supplier quotes
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
  position?: number; // Distance from start of run in feet
}

export interface FenceRun {
  id: string;
  name: string;
  linearFeet: number;
  corners: number;
  gates: number;
  gateDetails?: GateDetail[];
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
  hasDemolition?: boolean;
  demoLinearFeet?: number;
  demoType?: 'Wood' | 'Chain Link' | 'Metal';
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
  includeGravel: boolean;
  includeStain: boolean;
  footingType: 'Cuboid' | 'Cylindrical';
  concreteType: 'Maximizer' | 'Quickset';
  postWidth: number;
  postThickness: number;
  
  // Financials
  markupPercentage: number;
  taxPercentage: number;
  laborRates: LaborRates;
  manualQuantities: Record<string, number>; // itemId -> qty
  manualPrices: Record<string, number>; // itemId -> price
  createdAt: string;

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
