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
}

export const MATERIAL_PRICES: Record<string, number> = {
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
}

export function calculateCustomerEstimate(data: Partial<CustomerEstimateData>): EstimateBreakdown {
  const lf = data.linearFeet || 0;
  
  // 1. Posts Cost: (Linear Feet ÷ 8) × $85
  const postsCost = Math.ceil(lf / 8) * 85;

  // 2. Materials Cost: Linear Feet × Material Price Per LF
  const materialPrice = data.material ? (MATERIAL_PRICES[data.material] || 0) : 0;
  const materialsCost = lf * materialPrice;

  // 3. Labor Cost: Linear Feet × $45 × Terrain Factor + Demolition $15/LF if yes
  const terrainFactor = data.siteCondition ? (TERRAIN_FACTORS[data.siteCondition] || 1.0) : 1.0;
  const baseLabor = lf * 45 * terrainFactor;
  const demoCost = data.removeOldFence ? lf * 15 : 0;
  const laborCost = baseLabor + demoCost;

  // 4. Gates Cost
  let gatesCost = 0;
  if (data.needGates && data.gateCount && data.gateType) {
    const gateUnitPrice = GATE_PRICES[data.gateType] || 0;
    gatesCost = data.gateCount * gateUnitPrice;
  }

  // 5. Subtotal: Posts + Materials + Labor + Gates
  const subtotal = postsCost + materialsCost + laborCost + gatesCost;

  // 6. Contingency: Subtotal × 10%
  const contingency = subtotal * 0.10;

  // 7. Tax: (Subtotal + Contingency) × 8% (the user prompt specifies "Tax: (Subtotal + Contingency) x 8%")
  const tax = (subtotal + contingency) * 0.08;

  // 8. TOTAL: Subtotal + Contingency + Tax
  const total = subtotal + contingency + tax;

  return {
    postsCost,
    materialsCost,
    laborCost,
    gatesCost,
    subtotal,
    contingency,
    tax,
    total,
  };
}
