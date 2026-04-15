export type MaterialCategory = 'Post' | 'Rail' | 'Picket' | 'Panel' | 'Gate' | 'Hardware' | 'Concrete' | 'Labor' | 'PostCap' | 'Demolition' | 'SitePrep' | 'Fastener' | 'Finishing' | 'Consumable';

export interface MaterialItem {
  id: string;
  name: string;
  category: MaterialCategory;
  unit: 'each' | 'lf' | 'bag' | 'hour' | 'cu yd' | 'box' | 'gallon' | 'trip';
  cost: number;
  description?: string;
  imageUrl?: string;
}

export interface FenceStyle {
  id: string;
  name: string;
  type: 'Wood' | 'Vinyl' | 'Aluminum' | 'Chain Link' | 'Metal' | 'Farm';
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
}

export interface FenceRun {
  id: string;
  name: string;
  linearFeet: number;
  corners: number;
  gates: number;
  gateDetails?: GateDetail[];
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
  
  // Style
  styleId: string;
  visualStyleId: string;
  color: string;
  woodType?: 'Pine' | 'Western Cedar' | 'Japanese Cedar';
  topStyle?: 'Dog Ear' | 'Flat Top';
  isPreStained?: boolean;
  
  // Demolition
  hasDemolition: boolean;
  demoLinearFeet: number;
  demoType: 'Wood' | 'Chain Link' | 'Metal' | 'Vinyl';
  removeConcreteFootings: boolean;
  
  // Site Prep
  hasSitePrep: boolean;
  needsClearing: boolean;
  needsMarking: boolean;
  obstacleRemoval: boolean;
  
  // Accessories
  postCapId: string;
  gateCount: number;
  gateStyleId: string;
  
  // Advanced
  wastePercentage: number;
  includeGravel: boolean;
  includeStain: boolean;
  footingType: 'Cuboid' | 'Cylindrical';
  postWidth: number;
  postThickness: number;
  
  // Financials
  markupPercentage: number;
  taxPercentage: number;
  manualLaborRatePerLF: number;
  manualLaborRatePerGate: number;
  manualQuantities: Record<string, number>; // itemId -> qty
  manualPrices: Record<string, number>; // itemId -> price
  createdAt: string;
}

export interface CompanyInfo {
  name: string;
  logo: string;
  phone: string;
  email: string;
  website: string;
  address: string;
}
