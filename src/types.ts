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

export interface FenceRun {
  id: string;
  name: string;
  linearFeet: number;
  corners: number;
  gates: number;
}

export interface Estimate {
  id: string;
  customerName: string;
  customerEmail: string;
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
  manualQuantities: Record<string, number>; // itemId -> qty
  createdAt: string;
}
