import { MATERIALS, DEFAULT_LABOR_RATES } from '../../constants';
import { calculateDetailedTakeOff } from '../../lib/calculations';
import { Estimate, FenceRun, GateDetail, MaterialItem, LaborRates } from '../../types';

export interface CustomerEstimateData {
  fenceType: string;
  linearFeet: number;
  height: number;
  material: string;
  needGates: boolean;
  gateCount: number;
  gateType: 'Single Swing' | 'Double Swing' | 'Sliding';
  siteCondition: 'Level' | 'Slight Slope' | 'Steep Slope';
  removeOldFence: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  isPreStained?: boolean;
  reusePosts?: boolean;
  picketStyle?: 'w-side' | 'w-bob';
  topStyle?: 'Dog Ear' | 'Flat Top';
  hasTopCap?: boolean;
  hasCapAndTrim?: boolean;
  pipePaintColor?: 'Black' | 'Hunter Green' | 'White';
  pipeWireType?: 'Black' | 'Galvanized';
}

export const MATERIAL_PRICES: Record<string, number> = {
  // Wood Fence Species
  'PT Pine': 18,
  'Japanese Cedar': 22,
  'Western Red Cedar': 28,

  // Wrought Iron (nominals)
  'Standard flat top': 32,
  'Extended pickets': 35,
  '3 rail racking': 40,

  // Chain Link (nominals)
  'Residential Grade': 12,
  'Commercial Grade': 16,
  'Privacy Slats': 22,

  // Pipe Fence (nominals)
  'Set in Concrete': 24,
  'Driven Posts': 20,

  // Backward compatibility for existing settings
  'Pressure-treated': 18,
  'Cedar': 22,
  'Composite': 35,
  'Vinyl': 25,
  'Metal': 28,
  'Chain Link': 8,
};

export const TERRAIN_FACTORS = {
  'Level': 1.0,
  'Slight Slope': 1.15,
  'Steep Slope': 1.35,
};

export const GATE_PRICES = {
  'Single Swing': 500,
  'Double Swing': 850,
  'Sliding': 950,
};

export interface EstimateBreakdown {
  postsCost: number;
  materialsCost: number;
  laborCost: number;
  gatesCost: number;
  subtotal: number;
  contingency: number;
  tax: number;
  total: number;
  demoRate: number;
}

export function calculateCustomerEstimate(
  data: Partial<CustomerEstimateData>,
  customMaterials?: MaterialItem[],
  customLaborRates?: LaborRates,
  customEstimateConfig?: any
): EstimateBreakdown {
  const lf = data.linearFeet || 0;
  const height = data.height || 6;
  const fenceType = data.fenceType || 'Wood Fence';

  // Resolve default style ID and run attributes
  let styleId = 'wood-privacy';
  let visualStyleId = 'w-side';
  let woodType: 'PT Pine' | 'Western Red Cedar' | 'Japanese Cedar' | undefined = undefined;
  let chainLinkGrade: 'Residential' | 'Commercial' | undefined = undefined;
  let pipeInstallType: 'Set in Concrete' | 'Driven Posts' | undefined = undefined;

  const mat = data.material || 'PT Pine';

  if (fenceType === 'Wrought iron fence') {
    styleId = 'aluminum-ornamental';
    if (mat === 'Extended pickets') {
      visualStyleId = 'm-2rep';
    } else if (mat === '3 rail racking') {
      visualStyleId = 'm-3rr';
    } else {
      visualStyleId = 'm-2rft';
    }
  } else if (fenceType === 'chain link fence') {
    styleId = 'chain-link';
    if (mat === 'Commercial Grade') {
      chainLinkGrade = 'Commercial';
      visualStyleId = 'cl-std';
    } else if (mat === 'Privacy Slats') {
      chainLinkGrade = 'Residential';
      visualStyleId = 'cl-slat';
    } else {
      chainLinkGrade = 'Residential';
      visualStyleId = 'cl-std';
    }
  } else if (fenceType === 'pipe fence') {
    styleId = 'pipe-no-climb';
    pipeInstallType = 'Set in Concrete';
    if (data.pipeWireType === 'Black') {
      visualStyleId = 'p-black';
    } else {
      visualStyleId = 'p-std';
    }
  } else {
    // Wood Fence
    styleId = 'wood-privacy';
    visualStyleId = data.picketStyle || 'w-side';
    if (mat === 'Western Red Cedar') {
      woodType = 'Western Red Cedar';
    } else if (mat === 'Japanese Cedar') {
      woodType = 'Japanese Cedar';
    } else {
      woodType = 'PT Pine';
    }
  }

  // Gates Detail list
  const gateDetails: GateDetail[] = [];
  if (data.needGates && data.gateCount) {
    for (let i = 0; i < data.gateCount; i++) {
      gateDetails.push({
        id: `gate-cust-${i}`,
        type: data.gateType === 'Double Swing' ? 'Double' : 'Single',
        width: data.gateType === 'Double Swing' ? 8 : 4,
        construction: styleId === 'aluminum-ornamental' ? 'Welded' : 'Pre-made',
      });
    }
  }

  // Retrieve custom materials, labor rates, and estimate settings from parameters or localStorage (for exact matching)
  let activeMaterials = customMaterials || MATERIALS;
  let activeLaborRates = customLaborRates || DEFAULT_LABOR_RATES;
  let activeEstimateConfig: any = customEstimateConfig || {};

  if (!customMaterials && !customLaborRates && !customEstimateConfig && typeof window !== 'undefined') {
    try {
      const cachedMats = localStorage.getItem('fence_pro_materials');
      if (cachedMats) {
        activeMaterials = JSON.parse(cachedMats);
      }
    } catch (e) {
      console.error('Failed to parse cached materials in customer estimator calculations:', e);
    }

    try {
      const cachedLabor = localStorage.getItem('fence_pro_labor_rates');
      if (cachedLabor) {
        activeLaborRates = JSON.parse(cachedLabor);
      }
    } catch (e) {
      console.error('Failed to parse cached labor rates in customer estimator calculations:', e);
    }

    try {
      const cachedEst = localStorage.getItem('fence_pro_estimate');
      if (cachedEst) {
        activeEstimateConfig = JSON.parse(cachedEst);
      }
    } catch (e) {
      console.error('Failed to parse cached estimate config in customer estimator calculations:', e);
    }
  }

  // Set up mock Estimate with the same profit margins, taxes, and settings as the standard estimator
  const mockEstimate: Partial<Estimate> = {
    id: 'mock-cust-est',
    customerName: 'Customer',
    date: new Date().toISOString(),
    linearFeet: lf,
    height: height,
    defaultStyleId: styleId,
    defaultVisualStyleId: visualStyleId,
    defaultHeight: height,
    markupPercentage: activeEstimateConfig.markupPercentage !== undefined ? activeEstimateConfig.markupPercentage : 20,
    taxPercentage: activeEstimateConfig.taxPercentage !== undefined ? activeEstimateConfig.taxPercentage : 8.25,
    concreteType: activeEstimateConfig.concreteType || 'Maximizer',
    footingType: activeEstimateConfig.footingType || 'Cuboid',
    wastePercentage: activeEstimateConfig.wastePercentage !== undefined ? activeEstimateConfig.wastePercentage : 0,
    postWidth: activeEstimateConfig.postWidth !== undefined ? activeEstimateConfig.postWidth : 6,
    postThickness: activeEstimateConfig.postThickness !== undefined ? activeEstimateConfig.postThickness : 6,
    isPreStained: !!data.isPreStained,
    hasTopCap: !!data.hasTopCap,
    hasCapAndTrim: !!data.hasCapAndTrim,
    topStyle: data.topStyle || 'Dog Ear',
    runs: [
      {
        id: 'run-1',
        name: 'Main Section',
        linearFeet: lf,
        corners: 0,
        gates: gateDetails.length,
        gateDetails: gateDetails,
        styleId: styleId,
        visualStyleId: visualStyleId,
        height: height,
        color: styleId === 'pipe-no-climb' ? (data.pipePaintColor || 'Black') : 'Natural',
        woodType: woodType,
        chainLinkGrade: chainLinkGrade,
        pipeInstallType: pipeInstallType,
        hasDemolition: !!data.removeOldFence,
        demoLinearFeet: data.removeOldFence ? lf : 0,
        demoType: styleId === 'wood-privacy' ? 'Wood' : (styleId === 'chain-link' ? 'Chain Link' : 'Metal'),
        reusePosts: !!data.reusePosts,
        isPreStained: !!data.isPreStained,
        topStyle: data.topStyle || 'Dog Ear',
      }
    ]
  };

  const takeoff = calculateDetailedTakeOff(mockEstimate, activeMaterials, activeLaborRates);

  // Classify products into posts, gates, materials, labor
  let postsCost = 0;
  let gatesCost = 0;
  let materialsCost = 0;

  takeoff.summary.forEach(item => {
    const category = item.category || '';
    const name = (item.name || '').toLowerCase();

    // Skip labor, demo, prep which go into laborCost
    if (category === 'Labor' || category === 'Demolition' || category === 'SitePrep') {
      return;
    }

    if (category === 'Gate' || name.includes('gate') || name.includes('hinge') || name.includes('latch')) {
      gatesCost += item.total;
    } else if (category === 'Post' || name.includes('post') || name.includes('concrete') || name.includes('maximizer') || name.includes('quickset')) {
      postsCost += item.total;
    } else {
      materialsCost += item.total;
    }
  });

  const laborCost = takeoff.totals.labor + takeoff.totals.demo + takeoff.totals.prep;
  const subtotal = takeoff.totals.subtotal;
  const contingency = takeoff.totals.markup;
  const tax = takeoff.totals.tax;
  const total = takeoff.totals.grandTotal;

  const markupFactor = 1 + (mockEstimate.markupPercentage || 0) / 100;
  const demoRateWithMarkup = (activeLaborRates.demo || 2) * markupFactor;

  return {
    postsCost,
    materialsCost,
    laborCost,
    gatesCost,
    subtotal,
    contingency,
    tax,
    total,
    demoRate: demoRateWithMarkup,
  };
}
