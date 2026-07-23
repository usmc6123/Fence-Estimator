import { MaterialItem, LaborRates, Estimate, FenceRun, GateDetail } from '../types';
import { FENCE_STYLES } from '../constants';

export interface TakeOffItem {
  id: string;
  name: string;
  qty: number;
  unit: string;
  unitCost: number;
  priceSource?: string;
  total: number;
  category: string;
  packageQuantity?: number;
  purchaseQty?: number;
  formula?: string;
  originalPostName?: string;
  longerMatchingPostName?: string;
  deeperWarning?: string;
  increasedDepth?: boolean;
}

export interface StickCut {
  id: number;
  cuts: number[];
  leftover: number;
}

export interface PipeCuttingGuide {
  stickLength: number;
  sticks: StickCut[];
  totalWaste: number;
  efficiency: number;
}

export interface ResolvedWroughtIronPost {
  id: string;
  runId: string;
  position: number;
  type: 'line' | 'end' | 'corner' | 'gate-hinge' | 'gate-latch';
  sharedWithRunId?: string;
}

export interface RunTakeOff {
  runId: string;
  runName: string;
  linearFeet: number;
  netLF: number;
  styleName: string;
  styleType: string;
  height: number;
  railCount: number;
  hasRotBoard: boolean;
  topStyle: string;
  hasTopCap: boolean;
  hasTrim: boolean;
  woodType?: string;
  stainSides?: string;
  picketStyle?: string;
  chainLinkGrade?: string;
  hasBottomRail?: boolean;
  ironInstallType?: string;
  ironPanelType?: string;
  items: TakeOffItem[];
  pipeCuttingGuide?: PipeCuttingGuide;
  fenceMaterialCost: number;
  fenceLaborCost: number;
  gateMaterialCost: number;
  gateLaborCost: number;
  demoCharge: number;
  stainingCharge: number;
  gates: {
    gateId: string;
    type: string;
    width: number;
    construction?: string;
    items: TakeOffItem[];
  }[];
  deeperPostMaterialDiff?: number;
  deeperPostLaborCost?: number;
  chainLinkFenceRunCount?: number;
  chainLinkFabricGauge?: '9ga' | '11ga';
  resolvedIronPosts?: ResolvedWroughtIronPost[];
  debugData?: any;
}

export interface DetailedTakeOff {
  summary: TakeOffItem[];
  manualSummary: TakeOffItem[];
  runs: RunTakeOff[];
  pipeCuttingSummary?: PipeCuttingGuide;
  allResolvedIronPosts?: ResolvedWroughtIronPost[];
  totals: {
    material: number;
    labor: number;
    demo: number;
    prep: number;
    subtotal: number;
    markup: number;
    tax: number;
    grandTotal: number;
    postCount: number;
  };
  pricing: {
    runsPricing: {
      runName: string;
      totalFenceCharge: number;
      totalGateCharge: number;
      demoCharge: number;
      stainingCharge: number;
      finalFence: number;
      finalGate: number;
      finalDemo: number;
      finalStain: number;
      totalSection: number;
      netLF: number;
    }[];
    totalSectionsSum: number;
    addOnSitePrepPrice: number;
    demoRemovalPrice: number;
    discountAmount: number;
    manualGrandTotal: number | null;
    baseFenceTotal?: number;
    additionalContractLineItemsTotal?: number;
    calculatedTotal: number;
    finalCustomerPrice: number;
    estimatedPrice: number;
    grandTotal: number;
    subtotalBeforeDiscount: number;
    pricePerFoot: number;
    // Debug fields
    fenceRunMaterialTotal?: number;
    customMaterialTotal?: number;
    materialTakeoffFinalTotal?: number;
    customerContractMaterialSource?: string;
    customerContractDisplayedMaterialTotal?: number;
  };
}

function calculateStickOptimization(requiredLengths: number[], stickLength: number): PipeCuttingGuide {
  if (requiredLengths.length === 0) {
    return { stickLength, sticks: [], totalWaste: 0, efficiency: 100 };
  }

  // Sort lengths descending for First Fit Decreasing
  const sortedLengths = [...requiredLengths].sort((a, b) => b - a);
  const sticks: StickCut[] = [];

  sortedLengths.forEach(length => {
    let placed = false;
    // Try to find a stick with enough leftover room
    for (const stick of sticks) {
      if (stick.leftover >= length) {
        stick.cuts.push(length);
        stick.leftover -= length;
        placed = true;
        break;
      }
    }

    // If not placed, start a new stick
    if (!placed) {
      sticks.push({
        id: sticks.length + 1,
        cuts: [length],
        leftover: stickLength - length
      });
    }
  });

  const totalWaste = sticks.reduce((sum, s) => sum + s.leftover, 0);
  const totalLengthUsed = sticks.length * stickLength;
  const efficiency = totalLengthUsed > 0 ? ((totalLengthUsed - totalWaste) / totalLengthUsed) * 100 : 100;

  return { stickLength, sticks, totalWaste, efficiency };
}

function getPostLength(item: MaterialItem): number | null {
  // Try ID suffix first, e.g., m-post-2x2-10 or w-post-metal-12
  const idMatch = item.id.match(/-(\d+)(?:-|$)/);
  if (idMatch) {
    return parseInt(idMatch[1], 10);
  }
  // Try name pattern, e.g., "6' Steel T-Post" or "8' Sch 20 Metal Post"
  const nameMatch = item.name.match(/(\d+)'/);
  if (nameMatch) {
    return parseInt(nameMatch[1], 10);
  }
  return null;
}

function getPostDimensions(name: string, id: string): string {
  const nameLower = name.toLowerCase();
  const idLower = id.toLowerCase();
  
  // match "2x2", "4x4", etc.
  const xMatch = name.match(/\b\d+x\d+\b/) || id.match(/\b\d+x\d+\b/);
  if (xMatch) return xMatch[0];
  
  // match "2-3/8\"", "1-5/8\"", "1-7/8\"", etc.
  const inchMatch = name.match(/\d+-\d+\/\d+"?/) || id.match(/\d+-\d+\/\d+/);
  if (inchMatch) return inchMatch[0].replace(/"$/, ''); // strip trailing quote
  
  // special case for T-post
  if (nameLower.includes('t-post') || idLower.includes('-t')) return 't-post';
  
  return '';
}

function createTakeOffItem(
  material: MaterialItem, 
  qty: number, 
  category?: string,
  formula?: string,
  unitCostOverride?: number,
  overrides?: Partial<TakeOffItem>
): TakeOffItem {
  const packageQuantity = material.packageQuantity || 1;
  const purchaseQty = Math.ceil(qty / packageQuantity);
  const cost = unitCostOverride !== undefined ? unitCostOverride : material.cost;
  const total = purchaseQty * cost;
  
  return {
    id: material.id,
    name: material.name,
    qty,
    unit: material.unit,
    unitCost: cost,
    total,
    category: category || material.category,
    packageQuantity: packageQuantity > 1 ? packageQuantity : undefined,
    purchaseQty: packageQuantity > 1 ? purchaseQty : undefined,
    formula,
    ...overrides
  };
}

function resolvePostMat(
  materials: MaterialItem[],
  normalPostMat: MaterialItem,
  targetLength: number
): { postMat: MaterialItem | null; warning: string | null } {
  const normalLength = getPostLength(normalPostMat);
  if (normalLength === null) {
    return { postMat: null, warning: null };
  }

  const normalSize = getPostDimensions(normalPostMat.name, normalPostMat.id);
  const isHeavy = normalPostMat.name.toLowerCase().includes('heavy') || normalPostMat.id.toLowerCase().includes('hd');
  const isSch40 = normalPostMat.name.toLowerCase().includes('sch 40');
  const isSch20 = normalPostMat.name.toLowerCase().includes('sch 20');
  const isTerm = normalPostMat.name.toLowerCase().includes('terminal') || normalPostMat.id.toLowerCase().includes('term');
  const isLine = normalPostMat.name.toLowerCase().includes('line') || normalPostMat.id.toLowerCase().includes('line');
  const isComm = normalPostMat.name.toLowerCase().includes('commercial') || normalPostMat.id.toLowerCase().includes('comm');
  const isRes = normalPostMat.name.toLowerCase().includes('residential') || normalPostMat.id.toLowerCase().includes('res');

  const normalPrefix = normalPostMat.id.replace(/-\d+(?:-hd)?$/, '').replace(/-\d+$/, '');

  const candidates = materials.filter(m => {
    if (m.category !== 'Post' && m.category !== normalPostMat.category) {
      return false;
    }
    
    if (getPostLength(m) !== targetLength) {
      return false;
    }

    const candSize = getPostDimensions(m.name, m.id);
    if (candSize !== normalSize) {
      return false;
    }

    const candHeavy = m.name.toLowerCase().includes('heavy') || m.id.toLowerCase().includes('hd');
    if (candHeavy !== isHeavy) {
      return false;
    }

    const candSch40 = m.name.toLowerCase().includes('sch 40');
    if (candSch40 !== isSch40) {
      return false;
    }

    const candSch20 = m.name.toLowerCase().includes('sch 20');
    if (candSch20 !== isSch20) {
      return false;
    }

    const candTerm = m.name.toLowerCase().includes('terminal') || m.id.toLowerCase().includes('term');
    if (candTerm !== isTerm) {
      return false;
    }

    const candLine = m.name.toLowerCase().includes('line') || m.id.toLowerCase().includes('line');
    if (candLine !== isLine) {
      return false;
    }

    const candComm = m.name.toLowerCase().includes('commercial') || m.id.toLowerCase().includes('comm');
    if (candComm !== isComm) {
      return false;
    }

    const candRes = m.name.toLowerCase().includes('residential') || m.id.toLowerCase().includes('res');
    if (candRes !== isRes) {
      return false;
    }

    return true;
  });

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const aPrefix = a.id.replace(/-\d+(?:-hd)?$/, '').replace(/-\d+$/, '');
      const bPrefix = b.id.replace(/-\d+(?:-hd)?$/, '').replace(/-\d+$/, '');
      if (aPrefix === normalPrefix && bPrefix !== normalPrefix) return -1;
      if (bPrefix === normalPrefix && aPrefix !== normalPrefix) return 1;
      return a.id.localeCompare(b.id);
    });
    return { postMat: candidates[0], warning: null };
  }

  const sizeLabel = normalSize ? normalSize : 'same size';
  return {
    postMat: null,
    warning: `Longer matching post not found for ${normalPostMat.name}. Please add a ${sizeLabel} post that is 1 ft longer.`
  };
}

function processPost(
  materials: MaterialItem[],
  normalPostMat: MaterialItem,
  increasePostDepth: boolean,
  targetLengthOffset: number = 1
): MaterialItem & {
  originalPostName?: string;
  longerMatchingPostName?: string;
  deeperWarning?: string;
  increasedDepth?: boolean;
} {
  if (!increasePostDepth) {
    return normalPostMat;
  }
  const normalLength = getPostLength(normalPostMat);
  if (normalLength === null) {
    return normalPostMat;
  }
  const targetLength = normalLength + targetLengthOffset;
  const { postMat, warning } = resolvePostMat(materials, normalPostMat, targetLength);
  if (postMat) {
    return {
      ...postMat,
      originalPostName: normalPostMat.name,
      longerMatchingPostName: postMat.name,
      increasedDepth: true
    };
  }
  return {
    ...normalPostMat,
    originalPostName: normalPostMat.name,
    deeperWarning: warning || `Longer matching post not found for ${normalPostMat.name}. Please add a post that is 1 ft longer.`,
    increasedDepth: true
  };
}

/**
 * Resolves all post positions for a Wrought Iron section, handling gates and corners correctly.
 * This is the single source of truth for diagram, summary, and material takeoff.
 */
export function resolveWroughtIronPosts(runs: FenceRun[]): ResolvedWroughtIronPost[] {
  const allPosts: ResolvedWroughtIronPost[] = [];
  const panelWidth = 8; // Standard Wrought Iron panel width

  runs.forEach((run, idx) => {
    const postMap = new Map<number, ResolvedWroughtIronPost>();
    
    const nextRun = runs[idx + 1];
    const isFirstOfSection = idx === 0 || !!run.isStartOfNewSection;
    const isLastOfSection = !nextRun || !!nextRun.isStartOfNewSection;

    // 1. Initial Terminal Posts
    // Always add a post at 0 for spacing/checkpoint calculation
    // Even if it's shared with the previous run, we need it here to anchor line posts.
    postMap.set(0, {
      id: `post-${run.id}-start`,
      runId: run.id,
      position: 0,
      type: isFirstOfSection ? 'end' : 'corner'
    });
    
    postMap.set(run.linearFeet, {
      id: `post-${run.id}-end`,
      runId: run.id,
      position: run.linearFeet,
      type: isLastOfSection ? 'end' : 'corner'
    });

    // 2. Add Gate Posts (Hinge and Latch)
    const sortedGates = [...(run.gateDetails || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
    sortedGates.forEach(g => {
      const gStart = g.position || 0;
      const gEnd = gStart + g.width;

      // Hinge post (always gate-hinge)
      postMap.set(gStart, {
        id: `post-${run.id}-gate-${g.id}-hinge`,
        runId: run.id,
        position: gStart,
        type: 'gate-hinge'
      });

      // Latch post (double gates have two hinge-like posts, but we'll mark as gate-latch for clarity)
      postMap.set(gEnd, {
        id: `post-${run.id}-gate-${g.id}-latch`,
        runId: run.id,
        position: gEnd,
        type: g.type === 'Double' ? 'gate-hinge' : 'gate-latch'
      });
    });

    // 3. Fill Line Posts
    const checkpoints = Array.from(postMap.keys()).sort((a, b) => a - b);
    for (let j = 0; j < checkpoints.length - 1; j++) {
      const start = checkpoints[j];
      const end = checkpoints[j+1];
      const gapSize = end - start;
      
      const isGate = sortedGates.some(g => 
        Math.abs((g.position || 0) - start) < 0.1 && 
        Math.abs(((g.position || 0) + g.width) - end) < 0.1
      );

      if (!isGate && gapSize > (panelWidth + 0.1)) {
        const numSubPanels = Math.round(gapSize / panelWidth);
        const spacing = gapSize / numSubPanels;
        for (let k = 1; k < numSubPanels; k++) {
          const pos = start + k * spacing;
          const posKey = Math.round(pos * 100) / 100;
          if (!postMap.has(posKey)) {
            postMap.set(posKey, {
              id: `post-${run.id}-line-${posKey}`,
              runId: run.id,
              position: pos,
              type: 'line'
            });
          }
        }
      }
    }

    // 4. Handle Shared Corner Posts
    // If this is not the first run, the start post (at 0) IS shared with the previous run's end post
    if (!isFirstOfSection && idx > 0) {
      const startPost = postMap.get(0);
      const prevRun = runs[idx - 1];
      if (startPost) {
        startPost.sharedWithRunId = prevRun.id;
      }
    }

    // Convert map to array and add to allPosts
    Array.from(postMap.values()).forEach(p => {
      // Don't add if it's a duplicate position from a previous run's end post
      // We identify duplicates by looking for sharedWithRunId
      if (p.sharedWithRunId) {
        // Find the previous post and update its type if needed
        const prevRun = runs[idx - 1];
        const existing = allPosts.find(ap => ap.runId === p.sharedWithRunId && Math.abs(ap.position - prevRun.linearFeet) < 0.1);
        if (existing) {
          existing.type = 'corner';
          return; // Skip adding the duplicate
        }
      }
      allPosts.push(p);
    });
  });

  return allPosts;
}

export function calculateDetailedTakeOff(
  estimate: Partial<Estimate>,
  rawMaterials: MaterialItem[],
  laborRates: LaborRates
): DetailedTakeOff {
  let materials = rawMaterials;
  const defaultSupplier = estimate.defaultMaterialPricingSupplierId;
  if (defaultSupplier) {
    const supplierQuotes = (estimate.quotes || [])
      .filter(q => q.supplierName === defaultSupplier)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    materials = rawMaterials.map(m => {
      let quotedPrice: number | undefined;
      let source = 'Library fallback';
      
      for (const quote of supplierQuotes) {
        const item = quote.items.find(i => i.mappedMaterialId === m.id);
        if (item && item.unitPrice > 0) {
          quotedPrice = item.unitPrice;
          source = quote.supplierName;
          break;
        }
      }

      if (quotedPrice !== undefined) {
        return { ...m, cost: quotedPrice, priceSource: source };
      }
      return { ...m, priceSource: 'Library fallback' };
    });
  }

  const rawRuns = estimate.runs || [];
  let activeRuns = [...rawRuns];

  if (activeRuns.length === 0 && (estimate.linearFeet || estimate.gateCount)) {
    // Generate fallback run from estimate settings
    const styleId = estimate.defaultStyleId || 'wood-privacy';
    const visualStyleId = estimate.defaultVisualStyleId || 'w-side';
    let woodType = estimate.woodType;
    if (styleId === 'wood-privacy' && !woodType) {
      woodType = 'PT Pine';
    }
    let chainLinkGrade = estimate.defaultChainLinkGrade || (estimate as any).chainLinkGrade;
    if (styleId === 'chain-link' && !chainLinkGrade) {
      chainLinkGrade = 'Residential';
    }
    let pipeInstallType = estimate.pipeInstallType;
    if (styleId === 'pipe-no-climb' && !pipeInstallType) {
      pipeInstallType = 'Set in Concrete';
    }

    const gateDetails: GateDetail[] = [];
    if (estimate.gateCount) {
      for (let i = 0; i < estimate.gateCount; i++) {
        gateDetails.push({
          id: `global-gate-${i}`,
          type: 'Single',
          width: 4,
          construction: styleId === 'aluminum-ornamental' ? 'Welded' : 'Pre-made'
        });
      }
    }

    activeRuns = [
      {
        id: 'fallback-run',
        name: 'Main Section',
        linearFeet: estimate.linearFeet || 0,
        corners: 0,
        gates: gateDetails.length,
        gateDetails,
        styleId,
        visualStyleId,
        height: estimate.defaultHeight || 6,
        color: estimate.defaultColor || 'Natural',
        woodType,
        chainLinkGrade: chainLinkGrade as any,
        pipeInstallType,
        hasDemolition: !!(estimate as any).hasDemolition,
        demoLinearFeet: (estimate as any).hasDemolition ? (estimate.linearFeet || 0) : 0,
        demoType: styleId === 'wood-privacy' ? 'Wood' : (styleId === 'chain-link' ? 'Chain Link' : 'Metal'),
        reusePosts: !!(estimate as any).reusePosts,
        isPreStained: !!estimate.isPreStained,
        topStyle: estimate.topStyle || 'Dog Ear',
      }
    ];
  }

  const runs = activeRuns;
  const detailedRuns: RunTakeOff[] = [];
  const summaryMap: Record<string, TakeOffItem> = {};

  const addToSummary = (item: TakeOffItem) => {
    const key = `${item.name}-${item.unitCost}`;
    if (summaryMap[key]) {
      summaryMap[key].qty += item.qty;
      
      // If the item has a package quantity, we must re-calculate purchaseQty and total
      // based on the NEW cumulative quantity.
      if (summaryMap[key].packageQuantity && summaryMap[key].packageQuantity > 1) {
        summaryMap[key].purchaseQty = Math.ceil(summaryMap[key].qty / summaryMap[key].packageQuantity);
        summaryMap[key].total = (summaryMap[key].purchaseQty || 1) * summaryMap[key].unitCost;
      } else {
        summaryMap[key].total += item.total;
      }
    } else {
      summaryMap[key] = { ...item };
    }
  };

  let totalMaterial = 0;
  let totalLabor = 0;
  let totalDemo = 0;
  let totalPrep = 0;

  const wasteFactor = 1 + (estimate.wastePercentage === undefined ? 10 : estimate.wastePercentage) / 100;

  // New Concrete Logic: Total LF determines standard concrete type
  const totalProjectLF = runs.reduce((sum, r) => sum + r.linearFeet, 0);
  const autoConcreteType = totalProjectLF < 250 ? 'Quickset' : 'Maximizer';
  const effectiveConcreteType = estimate.concreteType || autoConcreteType;

  const allPipeSegments: number[] = [];
  
  // Pass 1: Collect Wire and Paint Needs for Pipe Fences to calculate global roll aggregation
  const wireNeeds: Record<string, number> = {};
  let totalPaintLF = 0;
  
  runs.forEach((r) => {
    const s = FENCE_STYLES.find(style => style.id === r.styleId);
    if (s?.type === 'Pipe') {
      // Wire Finish from visualStyleId
      const finish = r.visualStyleId === 'p-black' ? 'black' : 'galv';
      let h = r.height || 4;
      if (h !== 4 && h !== 5 && h !== 6) h = h < 5 ? 4 : (h < 6 ? 5 : 6);
      const k = `${h}-${finish}`;
      wireNeeds[k] = (wireNeeds[k] || 0) + r.linearFeet;

      // Paint needed if color is not 'Raw'
      const color = r.color || estimate.defaultColor || 'Raw';
      if (color !== 'Raw') {
        totalPaintLF += r.linearFeet;
      }
    }
  });

  const wireCostsPerLF: Record<string, number> = {};
  const globalWireRolls: TakeOffItem[] = [];
  const globalPaintItems: TakeOffItem[] = [];

  // Wire aggregation remains similar
  Object.entries(wireNeeds).forEach(([key, totalLF]) => {
    const [h, f] = key.split('-');
    const w200Id = `p-wire-${h}-200-${f}`;
    const w100Id = `p-wire-${h}-100-${f}`;
    const m200 = materials.find(m => m.id === w200Id);
    const m100 = materials.find(m => m.id === w100Id);
    
    if (!m200 || !m100) return;

    let r200 = Math.floor(totalLF / 200);
    const rem = totalLF % 200;
    let r100 = 0;

    if (rem > 100) {
      r200 += 1;
    } else if (rem > 0) {
      r100 = 1;
    }

    const m200Cost = m200?.cost || 0;
    const m100Cost = m100?.cost || 0;

    const tCost = (r200 * m200Cost) + (r100 * m100Cost);
    wireCostsPerLF[key] = tCost / totalLF;

    if (r200 > 0) {
      globalWireRolls.push({
        id: m200.id,
        name: m200.name,
        qty: r200,
        unit: 'each',
        unitCost: m200Cost,
        priceSource: m200.priceSource,
        total: r200 * m200Cost,
        category: 'Infill'
      });
    }
    if (r100 > 0) {
      globalWireRolls.push({
        id: m100.id,
        name: m100.name,
        qty: r100,
        unit: 'each',
        unitCost: m100Cost,
        priceSource: m100.priceSource,
        total: r100 * m100Cost,
        category: 'Infill'
      });
    }
  });

  // Paint aggregation (1 gallon per 200')
  let paintAvgCostPerLF = 0;
  if (totalPaintLF > 0) {
    const paintMat = materials.find(m => m.id === 'p-paint-gal');
    if (paintMat) {
      const totalGallons = Math.ceil(totalPaintLF / 200);
      const totalPaintCost = totalGallons * paintMat.cost;
      paintAvgCostPerLF = totalPaintCost / totalPaintLF;
      
      globalPaintItems.push({
        id: paintMat.id,
        name: paintMat.name,
        qty: totalGallons,
        unit: paintMat.unit,
        unitCost: paintMat.cost,
        priceSource: paintMat.priceSource,
        total: totalPaintCost,
        category: 'Hardware'
      });
    }
  }

  // Site Prep Logic (Matches Estimator)
  if (estimate.hasSitePrep) {
    const totalLF = runs.reduce((sum, r) => sum + r.linearFeet, 0);
    if (estimate.needsMarking) {
      totalPrep += 28;
      addToSummary({
        id: 'prep-marking',
        name: 'Public Utility Marking & Coordination',
        qty: 1,
        unit: 'job',
        unitCost: 28,
        priceSource: 'Library Rate',
        total: 28,
        category: 'SitePrep'
      });
    }
    if (estimate.needsClearing) {
      const clearingCost = Math.ceil(totalLF / 20) * 58;
      totalPrep += clearingCost;
      addToSummary({
        id: 'prep-clearing',
        name: 'Fence Line Clearing & Prep',
        qty: Math.ceil(totalLF / 20),
        unit: 'units',
        unitCost: 58,
        priceSource: 'Library Rate',
        total: clearingCost,
        category: 'SitePrep'
      });
    }
  }

  const allResolvedIronPosts = resolveWroughtIronPosts(runs);

  runs.forEach((run, idx) => {
    const runStyle = FENCE_STYLES.find(s => s.id === run.styleId) || FENCE_STYLES[0];
    const logic = runStyle.calcLogic;
    const runLF = run.linearFeet;
    const runVisualStyle = runStyle.visualStyles.find(vs => vs.id === run.visualStyleId) || runStyle.visualStyles[0];

    const runItems: TakeOffItem[] = [];
    const runGates: RunTakeOff['gates'] = [];
    
    let runFenceMaterialCost = 0;
    let runGateMaterialCost = 0;
    let runGateLaborCost = 0;
    let runDemoCharge = 0;
    let runDeeperPostMaterialDiff = 0;
    
    // Existing Fence Check - We still need style info for staining square footage
    const isExisting = !!run.isExistingFence;
    const isWood = runStyle.type === 'Wood';

    // Stain Logic - Calculate early so we can preserve it if existing
    let runStainLabor = 0;
    const needsStain = !!run.needsStain && isWood;
    if (needsStain) {
      const sidesMult = run.stainSides === 'Both Sides' ? 2 : 1;
      const height = run.height || 6;
      const sqft = runLF * height * sidesMult;
      runStainLabor = sqft * 0.80; // $0.80 per sq ft
      
      const stainItem = {
        id: `labor-stain-${run.id}`,
        name: `Wash & Stain - ${run.stainSides} (${run.name})`,
        qty: sqft,
        unit: 'sq ft',
        unitCost: 0.80,
        total: runStainLabor,
        category: 'Labor',
        formula: `${runLF}LF × ${height}' × ${sidesMult} sides × $0.80/sqft`
      };
      runItems.push(stainItem);
    }

    // Posts for run
    let runEndPosts = 0;
    let gateLF = 0;
    let hingePostCount = 0;

    // Resolve rail material early for gates
    const isStained = run.isPreStained || estimate.isPreStained;
    const woodType = run.woodType || estimate.woodType;
    let railId = isStained ? 'w-rail-pine-12-stained' : 'w-rail-pine-12';
    if (woodType === 'Japanese Cedar') railId = isStained ? 'w-rail-j-cedar-12-stained' : 'w-rail-j-cedar-12';
    else if (woodType === 'Western Red Cedar') railId = isStained ? 'w-rail-w-cedar-12-stained' : 'w-rail-w-cedar-12';
    const railMat = materials.find(m => m.id === railId) || { cost: 0, name: 'Unknown Rail', unit: 'each', id: 'unknown-rail' } as MaterialItem;

    if (run.gateDetails && run.gateDetails.length > 0) {
      run.gateDetails.forEach(gate => {
        if (runStyle.type !== 'Metal') {
          runEndPosts += gate.type === 'Double' ? 2 : 1;
        }
        if (runStyle.type === 'Wood') {
          hingePostCount += (gate.type === 'Double' ? 2 : 1);
        }
        gateLF += gate.width || 4;
        
        // Gate specific items
        let gateItems: TakeOffItem[] = [];
        const width = gate.width || 4;
        
        const generateDefaultGateItems = () => {
          const items: TakeOffItem[] = [];
          if (runStyle.type === 'Wood') {
            if (gate.type === 'Double') {
              // Drive Gate (Shark kit includes hinges/latches usually, but let's be explicit per request)
              const sharkKit = materials.find(m => m.id === 'g-kit-shark');
              if (sharkKit) {
                items.push({
                  id: sharkKit.id,
                  name: sharkKit.name,
                  qty: 1,
                  unit: sharkKit.unit,
                  unitCost: sharkKit.cost,
                  priceSource: sharkKit.priceSource,
                  total: sharkKit.cost,
                  category: 'Gate'
                });
              }

              // Cane Bolts
              const caneBoltMat = materials.find(m => m.id === 'h-cane-bolt-48');
              if (caneBoltMat) {
                items.push({
                  id: caneBoltMat.id,
                  name: caneBoltMat.name,
                  qty: 2,
                  unit: caneBoltMat.unit,
                  unitCost: caneBoltMat.cost,
                  priceSource: caneBoltMat.priceSource,
                  total: 2 * caneBoltMat.cost,
                  category: 'Hardware'
                });
              }
            } else {
              // Walk Gate
              let hasHingeKit = false;
              const hingeKit = materials.find(m => m.id === 'g-kit-3-hinge');
              if (hingeKit) {
                items.push({
                  id: hingeKit.id,
                  name: hingeKit.name,
                  qty: 1,
                  unit: hingeKit.unit,
                  unitCost: hingeKit.cost,
                  priceSource: hingeKit.priceSource,
                  total: hingeKit.cost,
                  category: 'Gate'
                });
                hasHingeKit = true;
              }

              const latchMat = materials.find(m => m.id === 'g-latch-std');
              if (latchMat && !hasHingeKit) {
                items.push({
                  id: latchMat.id,
                  name: latchMat.name,
                  qty: 1,
                  unit: latchMat.unit,
                  unitCost: latchMat.cost,
                  priceSource: latchMat.priceSource,
                  total: latchMat.cost,
                  category: 'Hardware'
                });
              }
              
              // Add (2) 2x4x12's for bracing
              items.push({
                id: railMat.id,
                name: `${railMat.name} (Gate Bracing)`,
                qty: 2,
                unit: 'each',
                unitCost: railMat.cost,
                priceSource: railMat.priceSource,
                total: 2 * railMat.cost,
                category: 'Structure'
              });
            }
          } else if (runStyle.type === 'Pipe') {
            // Pipe Fence specific gates
            const gateMat = materials.find(m => m.id === `p-gate-${width}ft`);
            const hwMat = materials.find(m => m.id === `p-gate-hardware-${width}ft`);
            
            if (gateMat) {
              items.push({
                id: gateMat.id,
                name: gateMat.name,
                qty: 1,
                unit: gateMat.unit,
                unitCost: gateMat.cost,
                priceSource: gateMat.priceSource,
                total: gateMat.cost,
                category: 'Gate'
              });
            }
            
            if (hwMat) {
              items.push({
                id: hwMat.id,
                name: hwMat.name,
                qty: 1,
                unit: hwMat.unit,
                unitCost: hwMat.cost,
                priceSource: hwMat.priceSource,
                total: hwMat.cost,
                category: 'Hardware'
              });
            }

            if (gate.type === 'Double') {
              const caneBoltMat = materials.find(m => m.id === 'h-cane-bolt-24');
              if (caneBoltMat) {
                items.push({
                  id: caneBoltMat.id,
                  name: caneBoltMat.name,
                  qty: 2,
                  unit: caneBoltMat.unit,
                  unitCost: caneBoltMat.cost,
                  priceSource: caneBoltMat.priceSource,
                  total: 2 * caneBoltMat.cost,
                  category: 'Hardware'
                });
              }
            }
          } else if (runStyle.type === 'Metal') {
            // Metal Gate
            const sideCount = gate.type === 'Double' ? 2 : 1;
            const leafWidth = gate.type === 'Double' ? width / 2 : width;
            const isPreMade = gate.construction === 'Pre-made' || (leafWidth === 4 && gate.construction === undefined);
            
            if (isPreMade) {
              const double8Mat = gate.type === 'Double' && width === 8 ? materials.find(m => m.id === 'm-gate-8-double') : null;
              if (double8Mat) {
                items.push({
                  id: double8Mat.id,
                  name: double8Mat.name,
                  qty: 1,
                  unit: double8Mat.unit,
                  unitCost: double8Mat.cost,
                  priceSource: double8Mat.priceSource,
                  total: double8Mat.cost,
                  category: 'Gate'
                });
              } else {
                const preMadeMat = materials.find(m => m.id === 'm-gate-4-pre');
                if (preMadeMat) {
                  items.push({
                    id: preMadeMat.id,
                    name: preMadeMat.name,
                    qty: sideCount,
                    unit: preMadeMat.unit,
                    unitCost: preMadeMat.cost,
                    priceSource: preMadeMat.priceSource,
                    total: sideCount * preMadeMat.cost,
                    category: 'Gate'
                  });
                }
              }
            } else {
              // Custom Welded Gate: 1 panel total + (2) 1.5" x 6' gate ends per side
              // We use 1 panel total because an 8ft panel can frame even a large double gate (2x4ft leaves)
              const panelMat = materials.find(m => m.category === 'Metal' && m.id.includes(`panel-${run.height}x8`)) || materials.find(m => m.category === 'Metal' && m.id.includes('panel-4x8'));
              const gateEndMat = materials.find(m => m.id === 'm-gate-end-6');
              
              if (panelMat) {
                items.push({
                  id: panelMat.id,
                  name: `${panelMat.name} (Gate Frame Panel)`,
                  qty: 1, // One additional panel as frame for the gate
                  unit: 'each',
                  unitCost: panelMat.cost,
                  total: panelMat.cost,
                  category: 'Structure'
                });
              }
              if (gateEndMat) {
                items.push({
                  id: gateEndMat.id,
                  name: gateEndMat.name,
                  qty: 2 * sideCount,
                  unit: 'each',
                  unitCost: gateEndMat.cost,
                  total: (2 * sideCount) * gateEndMat.cost,
                  category: 'Structure'
                });
              }
            }

            // Regular Barrel Hinges (Standard for all WI gates)
            const hingeMat = materials.find(m => m.id === 'h-barrel-hinge');
            if (hingeMat) {
              items.push({
                id: hingeMat.id,
                name: hingeMat.name,
                qty: sideCount,
                unit: 'pair',
                unitCost: hingeMat.cost,
                priceSource: hingeMat.priceSource,
                total: sideCount * hingeMat.cost,
                category: 'Hardware'
              });
            }

            const latchMat = materials.find(m => m.id === 'g-latch-grav');
            if (latchMat) {
              items.push({
                id: latchMat.id,
                name: latchMat.name,
                qty: 1,
                unit: latchMat.unit,
                unitCost: latchMat.cost,
                priceSource: latchMat.priceSource,
                total: latchMat.cost,
                category: 'Hardware'
              });
            }

            if (gate.type === 'Double') {
              const caneBoltMat = materials.find(m => m.id === 'h-cane-bolt-24');
              if (caneBoltMat) {
                items.push({
                  id: caneBoltMat.id,
                  name: caneBoltMat.name,
                  qty: 2,
                  unit: caneBoltMat.unit,
                  unitCost: caneBoltMat.cost,
                  priceSource: caneBoltMat.priceSource,
                  total: 2 * caneBoltMat.cost,
                  category: 'Hardware'
                });
              }
            }
          } else if (runStyle.type === 'Chain Link') {
            const isBlack = run.chainLinkFinish === 'black';
            const suffix = isBlack ? '-black' : '';
            const sideCount = gate.type === 'Double' ? 2 : 1;
            
            // Frame
            const frameLF = (gate.width || 4) * 2 + (run.height || 4) * 2;
            const frameMat = materials.find(m => m.id === `cl-gate-frame${suffix}-138`);
            if (frameMat) {
              items.push({
                id: frameMat.id,
                name: frameMat.name,
                qty: frameLF * sideCount,
                unit: frameMat.unit,
                unitCost: frameMat.cost,
                total: frameLF * sideCount * frameMat.cost,
                category: 'Gate'
              });
            }
            
            // Elbows
            const elbowMat = materials.find(m => m.id === `cl-gate-elbow${suffix}-138`);
            if (elbowMat) {
              items.push({
                id: elbowMat.id,
                name: elbowMat.name,
                qty: 4 * sideCount,
                unit: elbowMat.unit,
                unitCost: elbowMat.cost,
                total: 4 * sideCount * elbowMat.cost,
                category: 'Hardware'
              });
            }
            
            // Hinges
            const maleHingeMat = materials.find(m => m.id === `cl-gate-hinge-male${suffix}-238`);
            const femaleHingeMat = materials.find(m => m.id === `cl-gate-hinge-female${suffix}-138`);
            if (maleHingeMat && femaleHingeMat) {
              items.push({
                id: maleHingeMat.id,
                name: maleHingeMat.name,
                qty: 2 * sideCount,
                unit: maleHingeMat.unit,
                unitCost: maleHingeMat.cost,
                total: 2 * sideCount * maleHingeMat.cost,
                category: 'Hardware'
              });
              items.push({
                id: femaleHingeMat.id,
                name: femaleHingeMat.name,
                qty: 2 * sideCount,
                unit: femaleHingeMat.unit,
                unitCost: femaleHingeMat.cost,
                total: 2 * sideCount * femaleHingeMat.cost,
                category: 'Hardware'
              });
            }
            
            // Latch
            const latchMat = materials.find(m => m.id === `cl-gate-fork-latch${suffix}-238`);
            if (latchMat) {
              items.push({
                id: latchMat.id,
                name: latchMat.name,
                qty: 1,
                unit: latchMat.unit,
                unitCost: latchMat.cost,
                total: latchMat.cost,
                category: 'Hardware'
              });
            }
          }
          return items;
        };

        if (gate.customItems && gate.customItems.length > 0) {
          gateItems = gate.customItems.map(ci => ({
            ...ci,
            total: ci.qty * ci.unitCost,
            priceSource: 'Manual Override'
          }));
        } else {
          gateItems = generateDefaultGateItems();
        }

        runGates.push({
          gateId: gate.id,
          type: gate.type,
          width: gate.width || 4,
          construction: gate.construction,
          items: gateItems
        });

        const sideCount = gate.type === 'Double' ? 2 : 1;
        let gateLaborAmount = 0;
        let gateLaborName = '';

        if (gate.construction === 'Wood Framed') {
          gateLaborAmount = laborRates.gateWoodWalk;
          gateLaborName = `Gate Install (Wood Walk Gate)`;
        } else if (gate.construction === 'Pre-made') {
          gateLaborAmount = laborRates.gateHangPreMade;
          gateLaborName = `Gate Install (Premade 4' Metal Gate)`;
        } else if (gate.construction === 'Welded') {
          gateLaborAmount = laborRates.gateWeldedFrame;
          gateLaborName = `Gate Install (Welded Frame Gate)`;
        } else {
          if (runStyle.type === 'Wood') {
            if (gate.type === 'Double') {
              gateLaborAmount = laborRates.gateWeldedFrame;
              gateLaborName = `Gate Install (Welded Frame - Wood Drive)`;
            } else {
              gateLaborAmount = laborRates.gateWoodWalk;
              gateLaborName = `Gate Install (Wood Walk Gate)`;
            }
          } else {
            // Metal or other run styles
            if (gate.width === 4) {
              gateLaborAmount = laborRates.gateHangPreMade;
              gateLaborName = `Gate Install (Premade 4' Metal Gate)`;
            } else {
              gateLaborAmount = laborRates.gateWeldedFrame;
              gateLaborName = `Gate Install (Welded Frame - Metal other than 4')`;
            }
          }
        }

        const totalGateLabor = gateLaborAmount * sideCount;
        
        // Only push standard labor if no labor item exists in gateItems (e.g. from customItems)
        const hasExistingLabor = gateItems.some(i => i.category === 'Labor');
        if (!hasExistingLabor) {
          gateItems.push({
            id: `labor-gate-${gate.id}`,
            name: gateLaborName,
            qty: sideCount,
            unit: 'each',
            unitCost: gateLaborAmount,
            total: totalGateLabor,
            category: 'Labor'
          });
        }

        gateItems.forEach(i => {
          if (i.category === 'Labor') {
            runGateLaborCost += i.total;
          } else {
            runGateMaterialCost += i.total;
            totalMaterial += i.total;
          }
          addToSummary(i);
        });
      });
    }

    const netLF = Math.max(0, runLF - gateLF);
    
    // 6' Wood Fence Specific Logic
    const is6ftWood = runStyle.type === 'Wood' && run.height === 6;
    const maxSpacing = (runStyle.type === 'Wood' && run.height === 8) ? 6 : (runStyle.type === 'Chain Link' ? (run.hasBottomRail ? 7 : 8) : 8);
    
    const nextRun = runs[idx + 1];
    const isLastOfSection = !nextRun || nextRun.isStartOfNewSection;
    const isFirstOfSection = idx === 0 || run.isStartOfNewSection;

    const runLinePosts = Math.max(0, Math.ceil(runLF / maxSpacing) - 1);
    const runCornerPosts = isLastOfSection ? 0 : 1;
    const startEndPosts = (isFirstOfSection ? 1 : 0) + (isLastOfSection ? 1 : 0);
    const runPostCount = runLinePosts + runCornerPosts + startEndPosts;
    
    // Resolve Wrought Iron Posts for this run from the global list
    const resolvedIronPosts = runStyle.type === 'Metal' 
      ? allResolvedIronPosts.filter(p => p.runId === run.id)
      : [];

    let gatePostCountForRun = 0;
    if (run.gateDetails) {
      if (runStyle.type === 'Metal') {
        run.gateDetails.forEach(gate => {
          gatePostCountForRun += (gate.type === 'Double' ? 2 : 1);
        });
      } else {
        gatePostCountForRun = run.gateDetails.length * 2;
      }
    }

    const stdPostCount = (runStyle.type === 'Pipe')
      ? Math.max(0, runPostCount - gatePostCountForRun)
      : (runStyle.type === 'Metal' ? 0 : Math.max(0, runPostCount - hingePostCount));

    if (!run.reusePosts) {
      // Standard Posts
      if (stdPostCount > 0) {
        let postMat = materials.find(m => m.category === 'Post' && m.id.startsWith(runStyle.type.toLowerCase().charAt(0))) || materials[0];
        if (runStyle.type === 'Wood') {
          postMat = materials.find(m => m.id === (run.height === 8 ? 'w-post-metal-11' : 'w-post-metal-8')) || postMat;
        } else if (runStyle.type === 'Chain Link') {
          const grade = run.chainLinkGrade || 'Residential';
          const postHeight = (run.height || 4) + 2;
          const isBlack = run.chainLinkFinish === 'black';
          
          // Line Posts
          const linePostId = `cl-post-line-${isBlack ? 'black-' : ''}${grade === 'Commercial' ? 'comm' : 'res'}-${postHeight}`;
          const linePostMat = materials.find(m => m.id === linePostId);
          if (linePostMat && runLinePosts > 0) {
            const finalLinePost = processPost(materials, linePostMat, !!estimate.increasePostDepth);
            if (estimate.increasePostDepth) {
              runDeeperPostMaterialDiff += runLinePosts * (finalLinePost.cost - linePostMat.cost);
            }
            const lpCost = runLinePosts * finalLinePost.cost;
            runFenceMaterialCost += lpCost;
            runItems.push({
              id: finalLinePost.id,
              name: finalLinePost.name,
              qty: runLinePosts,
              unit: finalLinePost.unit,
              unitCost: finalLinePost.cost,
              total: lpCost,
              category: 'Structure',
              originalPostName: finalLinePost.originalPostName,
              longerMatchingPostName: finalLinePost.longerMatchingPostName,
              deeperWarning: finalLinePost.deeperWarning,
              increasedDepth: finalLinePost.increasedDepth
            });
          }
          
          // Terminal Posts (Ends, Corners, and Gates)
          const terminalPostId = `cl-post-term-${isBlack ? 'black-' : ''}${postHeight}`;
          const termPostMat = materials.find(m => m.id === terminalPostId);
          const tpCount = (runCornerPosts + startEndPosts + (run.corners || 0)) + (run.gateDetails?.length * 2 || 0);
          
          if (termPostMat && tpCount > 0) {
            const finalTermPost = processPost(materials, termPostMat, !!estimate.increasePostDepth);
            if (estimate.increasePostDepth) {
              runDeeperPostMaterialDiff += tpCount * (finalTermPost.cost - termPostMat.cost);
            }
            const tpCost = tpCount * finalTermPost.cost;
            runFenceMaterialCost += tpCost;
            runItems.push({
              id: finalTermPost.id,
              name: finalTermPost.name,
              qty: tpCount,
              unit: finalTermPost.unit,
              unitCost: finalTermPost.cost,
              total: tpCost,
              category: 'Structure',
              originalPostName: finalTermPost.originalPostName,
              longerMatchingPostName: finalTermPost.longerMatchingPostName,
              deeperWarning: finalTermPost.deeperWarning,
              increasedDepth: finalTermPost.increasedDepth
            });
          }
        }
        
        // Universal Post Addition (Skip for Chain Link since we handled it above)
        if (runStyle.type !== 'Chain Link') {
          if (runStyle.type === 'Wood') {
            postMat = materials.find(m => m.id === (run.height === 8 ? 'w-post-metal-11' : 'w-post-metal-8')) || postMat;
            const finalPost = processPost(materials, postMat, !!estimate.increasePostDepth);
            if (estimate.increasePostDepth) {
              runDeeperPostMaterialDiff += stdPostCount * (finalPost.cost - postMat.cost);
            }
            const cost = stdPostCount * finalPost.cost;
            runFenceMaterialCost += cost;
            runItems.push({
              id: finalPost.id,
              name: finalPost.name,
              qty: stdPostCount,
              unit: finalPost.unit,
              unitCost: finalPost.cost,
              priceSource: finalPost.priceSource,
              total: cost,
              category: 'Structure',
              originalPostName: finalPost.originalPostName,
              longerMatchingPostName: finalPost.longerMatchingPostName,
              deeperWarning: finalPost.deeperWarning,
              increasedDepth: finalPost.increasedDepth
            });
          } else if (runStyle.type === 'Pipe') {
            if (run.pipeInstallType === 'Driven Posts') {
              const concretePostHeight = (run.height || 4) + 3;
              const drivenPostHeight = (run.height || 4) + 4;
              
              const concretePostMat = materials.find(m => m.id === `p-post-238-${concretePostHeight}`) || materials.find(m => m.id === `p-post-238-8`) || postMat;
              const drivenPostMat = materials.find(m => m.id === `p-post-238-${drivenPostHeight}`) || materials.find(m => m.id === `p-post-238-8`) || postMat;
              
              const finalConcretePost = processPost(materials, concretePostMat, !!estimate.increasePostDepth);
              const finalDrivenPost = processPost(materials, drivenPostMat, !!estimate.increasePostDepth);
              
              const cornerAndEndPosts = runCornerPosts + startEndPosts;
              const concreteIntervalCount = Math.floor(runLF / 96);
              const concretePostCount = Math.min(stdPostCount, cornerAndEndPosts + concreteIntervalCount);
              const drivenPostCount = Math.max(0, stdPostCount - concretePostCount);

              if (estimate.increasePostDepth) {
                runDeeperPostMaterialDiff += concretePostCount * (finalConcretePost.cost - concretePostMat.cost);
                runDeeperPostMaterialDiff += drivenPostCount * (finalDrivenPost.cost - drivenPostMat.cost);
              }
              
              const finalConcreteLength = getPostLength(finalConcretePost as MaterialItem) || (concretePostHeight + (estimate.increasePostDepth ? 1 : 0));
              const finalDrivenLength = getPostLength(finalDrivenPost as MaterialItem) || (drivenPostHeight + (estimate.increasePostDepth ? 1 : 0));
              
              // Push to allPipeSegments for stick optimization
              for (let i = 0; i < concretePostCount; i++) {
                allPipeSegments.push(finalConcreteLength);
              }
              for (let i = 0; i < drivenPostCount; i++) {
                allPipeSegments.push(finalDrivenLength);
              }
              
              if (concretePostCount > 0) {
                const concreteCost = concretePostCount * finalConcretePost.cost;
                runFenceMaterialCost += concreteCost;
                runItems.push({
                  id: finalConcretePost.id,
                  name: `${finalConcretePost.name} (Concrete Set Post - 3' Deep)`,
                  qty: concretePostCount,
                  unit: finalConcretePost.unit,
                  unitCost: finalConcretePost.cost,
                  priceSource: finalConcretePost.priceSource,
                  total: concreteCost,
                  category: 'Structure',
                  originalPostName: finalConcretePost.originalPostName,
                  longerMatchingPostName: finalConcretePost.longerMatchingPostName,
                  deeperWarning: finalConcretePost.deeperWarning,
                  increasedDepth: finalConcretePost.increasedDepth
                });
              }
              
              if (drivenPostCount > 0) {
                const drivenCost = drivenPostCount * finalDrivenPost.cost;
                runFenceMaterialCost += drivenCost;
                runItems.push({
                  id: finalDrivenPost.id,
                  name: `${finalDrivenPost.name} (Driven Post - 4' Deep)`,
                  qty: drivenPostCount,
                  unit: finalDrivenPost.unit,
                  unitCost: finalDrivenPost.cost,
                  priceSource: finalDrivenPost.priceSource,
                  total: drivenCost,
                  category: 'Structure',
                  originalPostName: finalDrivenPost.originalPostName,
                  longerMatchingPostName: finalDrivenPost.longerMatchingPostName,
                  deeperWarning: finalDrivenPost.deeperWarning,
                  increasedDepth: finalDrivenPost.increasedDepth
                });
              }
            } else {
              // Standard Posts (Set in Concrete, standard height + 2)
              const postHeight = (run.height || 4) + 2;
              postMat = materials.find(m => m.id === `p-post-238-${postHeight}`) || postMat;
              const finalPost = processPost(materials, postMat, !!estimate.increasePostDepth);
              if (estimate.increasePostDepth) {
                runDeeperPostMaterialDiff += stdPostCount * (finalPost.cost - postMat.cost);
              }
              const finalLength = getPostLength(finalPost as MaterialItem) || (postHeight + (estimate.increasePostDepth ? 1 : 0));
              for (let i = 0; i < stdPostCount; i++) {
                allPipeSegments.push(finalLength);
              }
              
              const cost = stdPostCount * finalPost.cost;
              runFenceMaterialCost += cost;
              runItems.push({
                id: finalPost.id,
                name: finalPost.name,
                qty: stdPostCount,
                unit: finalPost.unit,
                unitCost: finalPost.cost,
                priceSource: finalPost.priceSource,
                total: cost,
                category: 'Structure',
                originalPostName: finalPost.originalPostName,
                longerMatchingPostName: finalPost.longerMatchingPostName,
                deeperWarning: finalPost.deeperWarning,
                increasedDepth: finalPost.increasedDepth
              });
            }
          } else if (runStyle.type === 'Metal') {
            const postHeight = (run.height || 4) + 2;
            postMat = materials.find(m => m.id === `m-post-2x2-${postHeight}`) || postMat;
            const finalPost = processPost(materials, postMat, !!estimate.increasePostDepth);
            if (estimate.increasePostDepth) {
              runDeeperPostMaterialDiff += stdPostCount * (finalPost.cost - postMat.cost);
            }
            const cost = stdPostCount * finalPost.cost;
            runFenceMaterialCost += cost;
            runItems.push({
              id: finalPost.id,
              name: finalPost.name,
              qty: stdPostCount,
              unit: finalPost.unit,
              unitCost: finalPost.cost,
              priceSource: finalPost.priceSource,
              total: cost,
              category: 'Structure',
              originalPostName: finalPost.originalPostName,
              longerMatchingPostName: finalPost.longerMatchingPostName,
              deeperWarning: finalPost.deeperWarning,
              increasedDepth: finalPost.increasedDepth
            });
          }
        }
            // Gate Posts for Pipe and Metal Fence
      if (runStyle.type === 'Pipe' && gatePostCountForRun > 0) {
        const postHeight = (run.height || 4) + 3;
        
        // Pipe Fence logic remains the same
        const prefix = 'p-post-238-';
        const gatePostMat = materials.find(m => m.id === `${prefix}${postHeight}`) || materials.find(m => m.id === `${prefix}${postHeight - 1}`);
        
        if (gatePostMat) {
          const finalGatePost = processPost(materials, gatePostMat, !!estimate.increasePostDepth);
          if (estimate.increasePostDepth) {
            runDeeperPostMaterialDiff += gatePostCountForRun * (finalGatePost.cost - gatePostMat.cost);
          }
          const finalLength = getPostLength(finalGatePost as MaterialItem) || (postHeight + (estimate.increasePostDepth ? 1 : 0));
          // Collect for optimization
          for (let i = 0; i < gatePostCountForRun; i++) {
            allPipeSegments.push(finalLength);
          }

          const cost = gatePostCountForRun * finalGatePost.cost;
          runFenceMaterialCost += cost;
          runItems.push({
            id: finalGatePost.id,
            name: `${finalGatePost.name} (Gate Post)`,
            qty: gatePostCountForRun,
            unit: finalGatePost.unit,
            unitCost: finalGatePost.cost,
            priceSource: finalGatePost.priceSource,
            total: cost,
            category: 'Structure',
            originalPostName: finalGatePost.originalPostName,
            longerMatchingPostName: finalGatePost.longerMatchingPostName,
            deeperWarning: finalGatePost.deeperWarning,
            increasedDepth: finalGatePost.increasedDepth
          });
        }
      }

      // New Unified Wrought Iron Post Logic
      if (runStyle.type === 'Metal' && !run.reusePosts) {
        const postHeight = (run.height || 4) + 2;
        const ironPostMat = materials.find(m => m.id === `m-post-2x2-${postHeight}`) || 
                           materials.find(m => m.id === `m-post-2x2-${postHeight + 1}`) || 
                           materials.find(m => m.category === 'Post' && m.id.startsWith('m')) || 
                           materials[0];
        
        const finalPost = processPost(materials, ironPostMat, !!estimate.increasePostDepth);
        const ironPostsCount = resolvedIronPosts.length;

        if (ironPostsCount > 0) {
          if (estimate.increasePostDepth) {
            runDeeperPostMaterialDiff += ironPostsCount * (finalPost.cost - ironPostMat.cost);
          }
          const cost = ironPostsCount * finalPost.cost;
          runFenceMaterialCost += cost;
          runItems.push({
            id: finalPost.id,
            name: finalPost.name.toLowerCase().includes('post') ? finalPost.name : `${finalPost.name} Post`,
            qty: ironPostsCount,
            unit: finalPost.unit,
            unitCost: finalPost.cost,
            priceSource: finalPost.priceSource,
            total: cost,
            category: 'Structure',
            originalPostName: finalPost.originalPostName,
            longerMatchingPostName: finalPost.longerMatchingPostName,
            deeperWarning: finalPost.deeperWarning,
            increasedDepth: finalPost.increasedDepth
          });
        }
      }
 }

      // Hinge Posts (1' deeper) for Wood Fence
      if (hingePostCount > 0 && runStyle.type === 'Wood') {
        const hingeId = run.height === 8 ? 'w-post-metal-12' : 'w-post-metal-9';
        const hingeMat = materials.find(m => m.id === hingeId);
        if (hingeMat) {
          const finalHinge = processPost(materials, hingeMat, !!estimate.increasePostDepth);
          if (estimate.increasePostDepth) {
            runDeeperPostMaterialDiff += hingePostCount * (finalHinge.cost - hingeMat.cost);
          }
          const cost = hingePostCount * finalHinge.cost;
          runFenceMaterialCost += cost;
          runItems.push({
            id: finalHinge.id,
            name: `${finalHinge.name} (Gate Hinge)`,
            qty: hingePostCount,
            unit: finalHinge.unit,
            unitCost: finalHinge.cost,
            priceSource: finalHinge.priceSource,
            total: cost,
            category: 'Structure',
            originalPostName: finalHinge.originalPostName,
            longerMatchingPostName: finalHinge.longerMatchingPostName,
            deeperWarning: finalHinge.deeperWarning,
            increasedDepth: finalHinge.increasedDepth
          });
        }
      }

      // Post Caps
      const runTopStyle = run.topStyle || estimate.topStyle || 'Dog Ear';
      const capId = runStyle.type === 'Pipe' ? 'pc-dome' : (runTopStyle === 'Flat Top' ? 'pc-flat' : 'pc-dome');
      const capMat = materials.find(m => m.id === capId) || materials.find(m => m.id === 'pc-dome');
      
      // Post caps will only be used at end posts, corner posts, and gate posts for Pipe Fence
      const capQty = runStyle.type === 'Pipe' 
        ? Math.max(0, (runPostCount - runLinePosts) + gatePostCountForRun) 
        : runPostCount;

      if (capQty > 0 && capMat) {
        const capCost = capQty * capMat.cost;
        runFenceMaterialCost += capCost;
        runItems.push({
          id: capMat.id,
          name: capMat.name,
          qty: capQty,
          unit: capMat.unit,
          unitCost: capMat.cost,
          priceSource: capMat.priceSource,
          total: capCost,
          category: 'Hardware'
        });
      }

      // Concrete Calculation
      const runConcreteType = run.concreteType || effectiveConcreteType || 'Maximizer';
      const is8ftWood = runStyle.type === 'Wood' && run.height === 8;
      
      let bagsPerPost = 0.7; // Standard fallthrough
      let concreteMatId = 'i-concrete-80';

      if (runConcreteType === 'Quickset') {
        bagsPerPost = is8ftWood ? 3 : 2;
        concreteMatId = 'i-concrete-quickset';
      } else if (runConcreteType === 'Maximizer') {
        bagsPerPost = is8ftWood ? 1 : 0.7;
        concreteMatId = 'i-concrete-maximizer';
      } else {
        bagsPerPost = logic.concretePerPost;
      }

      const concreteMat = materials.find(m => m.id === concreteMatId) || materials.find(m => m.id === 'i-concrete-80');
      if (concreteMat) {
        let postsInConcrete = runPostCount;
        if (runStyle.type === 'Pipe' && run.pipeInstallType === 'Driven Posts') {
          const cornerAndEndPosts = runCornerPosts + startEndPosts;
          const concreteIntervalCount = Math.floor(runLF / 96);
          const concretePostCount = Math.min(stdPostCount, cornerAndEndPosts + concreteIntervalCount);
          postsInConcrete = gatePostCountForRun + concretePostCount;
        }

        const concreteQty = Math.ceil(postsInConcrete * bagsPerPost);
        const concreteCost = concreteQty * concreteMat.cost;
        runFenceMaterialCost += concreteCost;
        runItems.push({
          id: concreteMat.id,
          name: concreteMat.name,
          qty: concreteQty,
          unit: concreteMat.unit,
          unitCost: concreteMat.cost,
          priceSource: concreteMat.priceSource,
          total: concreteCost,
          category: 'Installation'
        });
      }

      // Brackets and Lags for Wood Fence
      if (runStyle.type === 'Wood' && runPostCount > 0) {
        const bracketsPerPost = (run.height === 8 ? 4 : 3) + (!!(run.hasRotBoard ?? estimate.hasRotBoard) ? 1 : 0);
        const bracketMat = materials.find(m => m.id === 'h-bracket-w');
        if (bracketMat) {
          const bracketQty = runPostCount * bracketsPerPost;
          const bracketFormula = `${runPostCount} posts × ${bracketsPerPost} brackets/post`;
          const bracketCost = bracketQty * bracketMat.cost;
          runFenceMaterialCost += bracketCost;
          runItems.push({
            id: bracketMat.id,
            name: bracketMat.name,
            qty: bracketQty,
            unit: bracketMat.unit,
            unitCost: bracketMat.cost,
            priceSource: bracketMat.priceSource,
            total: bracketCost,
            category: 'Hardware',
            formula: bracketFormula
          });

          const lagMat = materials.find(m => m.id === 'h-lag-14');
          if (lagMat) {
            const lagQty = bracketQty * 4;
            const lagFormula = `${bracketQty} brackets × 4 lag screws/bracket`;
            const lagCost = lagQty * lagMat.cost;
            runFenceMaterialCost += lagCost;
            runItems.push({
              id: lagMat.id,
              name: lagMat.name,
              qty: lagQty,
              unit: lagMat.unit,
              unitCost: lagMat.cost,
              priceSource: lagMat.priceSource,
              total: lagCost,
              category: 'Hardware',
              formula: lagFormula
            });
          }
        }
      }
    }

    // Pickets
    let panelMat = materials.find(m => (m.category === 'Panel' || m.category === 'Picket') && m.id.startsWith(runStyle.type.toLowerCase().charAt(0))) || materials[0];
    let panelQty = 0;
    let skipGenericInfill = false;
    
    if (runStyle.type === 'Wood') {
      if (woodType === 'PT Pine') {
        const baseId = run.height === 8 ? 'w-picket-pine-8' : 'w-picket-pine';
        panelMat = materials.find(m => m.id === (isStained ? `${baseId}-stained` : baseId)) || panelMat;
      } else if (woodType === 'Japanese Cedar') {
        const baseId = run.height === 8 ? 'w-picket-j-cedar-8' : 'w-picket-j-cedar';
        panelMat = materials.find(m => m.id === (isStained ? `${baseId}-stained` : baseId)) || panelMat;
      } else if (woodType === 'Western Red Cedar') {
        const baseId = run.height === 8 ? 'w-picket-w-cedar-8' : 'w-picket-w-cedar';
        panelMat = materials.find(m => m.id === (isStained ? `${baseId}-stained` : baseId)) || panelMat;
      }

      const totalInches = runLF * 12; // Use total run linear feet (including gates) for picket count
      const isBob = run.visualStyleId === 'w-bob';
      
      if (isBob) {
        // Board on Board: Two layers, boards in each layer spaced with a 3.5" gap.
        // User specific calculation:
        // 1. back_layer = ceiling(total_inches / 9) (5.5" picket + 3.5" spacing)
        // 2. front_layer = back_layer - 1
        // 3. total = back_layer + front_layer + 2 (waste per run)
        const backLayer = Math.ceil(totalInches / 9);
        const frontLayer = Math.max(0, backLayer - 1);
        panelQty = backLayer + frontLayer + 2;
        
        const picketUnitCost = panelMat.cost;
        const totalPicketCost = panelQty * picketUnitCost;
        runFenceMaterialCost += totalPicketCost;
        
        runItems.push({
          id: panelMat.id,
          name: `${panelMat.name} (BOB ${run.height}' - 3.5" Spacing)`,
          qty: panelQty,
          unit: panelMat.unit,
          unitCost: picketUnitCost,
          priceSource: panelMat.priceSource,
          total: totalPicketCost,
          category: panelMat.category || 'Picket',
          formula: `${totalInches}" / 9" = ${backLayer} Back; ${backLayer}-1 = ${frontLayer} Front; +2 Waste`
        });
        skipGenericInfill = true;
      } else {
        // Side by Side: Exactly total inches / 5.5" then add waste
        panelQty = Math.ceil((totalInches / 5.5) * wasteFactor);
      }
    } else if (runStyle.type === 'Chain Link') {
      const grade = run.chainLinkGrade || 'Residential';
      const isCommercial = grade === 'Commercial';
      const isBlack = run.chainLinkFinish === 'black';
      const hasBottomRail = run.hasBottomRail && isCommercial;
      const height = run.height || 6;

      const resolveFinishId = (baseId: string) => {
        if (!isBlack) return baseId;
        // Inject '-black-' or '-black' correctly into the ID
        if (baseId.includes('-comm')) return baseId.replace('-comm', '-black-comm');
        if (baseId.includes('-res')) return baseId.replace('-res', '-black-res');
        
        // Handle specific hardware patterns
        if (baseId.startsWith('cl-hw-')) {
          const parts = baseId.split('-');
          parts.splice(2, 0, 'black');
          return parts.join('-');
        }
        
        // Fallback for simple patterns
        return baseId.replace('cl-', 'cl-black-');
      };

      const findMaterial = (id: string, fallbackName: string) => {
        const mat = materials.find(m => m.id === id);
        if (mat) return mat;
        
        // If not found in library, return a standardized record with Needs Pricing status.
        // This should be rare as we now ensure all chain-link components exist in the library.
        return {
          id,
          name: fallbackName,
          cost: 0,
          unit: 'each',
          category: 'Hardware',
          pricingStatus: 'Needs Pricing',
          priceSource: 'Not Yet Priced'
        } as any;
      };

      // Mesh
      const explicitGauge = run.chainLinkFabricGauge;
      let meshGrade: 'res' | 'comm';
      if (explicitGauge) {
        meshGrade = explicitGauge === '9ga' ? 'comm' : 'res';
      } else {
        meshGrade = isCommercial ? 'comm' : 'res';
      }
      const meshMatId = `cl-mesh-${isBlack ? 'black-' : ''}${meshGrade}-${height}`;
      const meshMat = findMaterial(meshMatId, `${isBlack ? 'Black ' : ''}${meshGrade === 'comm' ? '9ga' : '11ga'} Mesh ${height}'`);
      const meshCost = runLF * meshMat.cost;
      runFenceMaterialCost += meshCost;
      runItems.push({
        id: meshMat.id,
        name: meshMat.name,
        qty: runLF,
        unit: meshMat.unit,
        unitCost: meshMat.cost,
        total: meshCost,
        category: meshMat.category || 'Picket'
      });

      // Top Rail
      const railId = isCommercial 
        ? (isBlack ? 'cl-rail-top-black-comm' : 'cl-rail-top-comm') 
        : (isBlack ? 'cl-rail-top-black' : 'cl-rail-top');
      const topRailMat = findMaterial(railId, `${isCommercial ? 'Commercial' : 'Residential'} Top Rail ${isBlack ? '(Black)' : ''}`);
      const railQty = Math.ceil(runLF / 21);
      const topRailCost = railQty * topRailMat.cost;
      runFenceMaterialCost += topRailCost;
      runItems.push({
        id: topRailMat.id,
        name: topRailMat.name,
        qty: railQty,
        unit: topRailMat.unit,
        unitCost: topRailMat.cost,
        total: topRailCost,
        category: 'Structure'
      });

      // Chain Link Hardware Implementation (Both Residential and Commercial)
      const chainLinkFenceRunCount = 1 + (run.corners || 0) + (run.gateDetails?.length || 0);

      // Dome Caps (1 per 2-3/8" Post)
      const terminalCount = (runCornerPosts + startEndPosts + (run.corners || 0)) + (run.gateDetails?.length * 2 || 0);
      const domeCapId = `cl-hw-dome-${isBlack ? 'black-' : ''}238`;
      const domeCapMat = findMaterial(domeCapId, `2-3/8" Dome Cap ${isBlack ? '(Black)' : ''}`);
      if (terminalCount > 0) {
        const dcCost = terminalCount * domeCapMat.cost;
        runFenceMaterialCost += dcCost;
        runItems.push({ 
          id: domeCapMat.id, 
          name: domeCapMat.name, 
          qty: terminalCount, 
          unit: 'each', 
          unitCost: domeCapMat.cost, 
          total: dcCost, 
          category: 'Hardware',
          formula: `${terminalCount} terminal points`
        });
      }

      // Loop Caps (1 per Line Post - 1-7/8" Comm, 1-5/8" Res)
      const loopCapId = isCommercial 
        ? (isBlack ? 'cl-hw-loop-black-178' : 'cl-hw-loop-178') 
        : (isBlack ? 'cl-hw-loop-black-158' : 'cl-hw-loop-158');
      const loopCapMat = findMaterial(loopCapId, `${isCommercial ? '1-7/8"' : '1-5/8"'} Loop Cap ${isBlack ? '(Black)' : ''}`);
      if (runLinePosts > 0) {
        const lcItem = createTakeOffItem(loopCapMat, runLinePosts, 'Hardware', `${runLinePosts} line posts`);
        runFenceMaterialCost += lcItem.total;
        runItems.push(lcItem);
      }

      // Tension Bars (2 per fence run)
      const tensionBarId = `cl-hw-tension-bar-${isBlack ? 'black-' : ''}${height}`;
      const barMat = materials.find(m => m.id === tensionBarId) || materials.find(m => m.id === `cl-hw-tension-bar-${isBlack ? 'black-' : ''}6`) || findMaterial(tensionBarId, `${height}' Tension Bar ${isBlack ? '(Black)' : ''}`);
      if (barMat) {
        const barQty = chainLinkFenceRunCount * 2;
        const barItem = createTakeOffItem(barMat, barQty, 'Hardware', `${chainLinkFenceRunCount} runs × 2 bars/run`);
        runFenceMaterialCost += barItem.total;
        runItems.push(barItem);
      }

      // Tension Bands (1 per 1' of height per bar - 2 3/8")
      const tensionBandId = `cl-hw-tension-band-${isBlack ? 'black-' : ''}238`;
      const tensionBandMat = findMaterial(tensionBandId, `2-3/8" Tension Band ${isBlack ? '(Black)' : ''}`);
      if (tensionBandMat) {
        const bandQty = chainLinkFenceRunCount * 2 * height;
        const bandItem = createTakeOffItem(tensionBandMat, bandQty, 'Hardware', `${chainLinkFenceRunCount} runs × 2 bars × ${height}' height`);
        runFenceMaterialCost += bandItem.total;
        runItems.push(bandItem);
      }

      // Brace Bands (4 per fence run - 2 3/8")
      const braceBandId = `cl-hw-brace-band-${isBlack ? 'black-' : ''}238`;
      const braceBandMat = findMaterial(braceBandId, `2-3/8" Brace Band ${isBlack ? '(Black)' : ''}`);
      if (braceBandMat) {
        const bbQty = chainLinkFenceRunCount * 4;
        const bbItem = createTakeOffItem(braceBandMat, bbQty, 'Hardware', `${chainLinkFenceRunCount} runs × 4 bands/run`);
        runFenceMaterialCost += bbItem.total;
        runItems.push(bbItem);
      }

      // Rail End Cups (2 per fence run)
      const cupId = isCommercial 
        ? (isBlack ? 'cl-hw-cup-black-comm' : 'cl-hw-cup-comm') 
        : (isBlack ? 'cl-hw-cup-black-res' : 'cl-hw-cup-res');
      const cupMat = findMaterial(cupId, `${isCommercial ? '1-5/8"' : '1-3/8"'} Rail End Cup ${isBlack ? '(Black)' : ''}`);
      if (cupMat) {
        const cupQty = chainLinkFenceRunCount * 2;
        const cupItem = createTakeOffItem(cupMat, cupQty, 'Hardware', `${chainLinkFenceRunCount} runs × 2 cups/run`);
        runFenceMaterialCost += cupItem.total;
        runItems.push(cupItem);
      }

      // Rail EZ Ties (1 per 2 LF) - 1-5/8" Comm, 1-3/8" Res
      const railTieId = isCommercial 
        ? (isBlack ? 'cl-hw-ez-tie-black-158' : 'cl-hw-ez-tie-158') 
        : (isBlack ? 'cl-hw-ez-tie-black-138' : 'cl-hw-ez-tie-138');
      const railTieMat = findMaterial(railTieId, `${isCommercial ? '1-5/8"' : '1-3/8"'} EZ Tie ${isBlack ? '(Black)' : ''}`);
      if (railTieMat) {
        const tieQty = Math.ceil(runLF / 2);
        const tieItem = createTakeOffItem(railTieMat, tieQty, 'Hardware');
        runFenceMaterialCost += tieItem.total;
        runItems.push(tieItem);
      }

      // Post EZ Ties (1 per 1' of height x total number of line posts) - 1-7/8" Comm, 1-5/8" Res
      const postTieId = isCommercial 
        ? (isBlack ? 'cl-hw-ez-tie-black-178' : 'cl-hw-ez-tie-178') 
        : (isBlack ? 'cl-hw-ez-tie-black-158' : 'cl-hw-ez-tie-158');
      const postTieMat = findMaterial(postTieId, `${isCommercial ? '1-7/8"' : '1-5/8"'} EZ Tie ${isBlack ? '(Black)' : ''}`);
      if (postTieMat) {
        const tieQty = height * runLinePosts;
        const tieItem = createTakeOffItem(postTieMat, tieQty, 'Hardware');
        runFenceMaterialCost += tieItem.total;
        runItems.push(tieItem);
      }

      // Hog Rings (1 for every 2 LF)
      const hogRingId = `cl-hw-hog-ring${isBlack ? '-black' : ''}`;
      const hogRingMat = findMaterial(hogRingId, `Hog Ring ${isBlack ? '(Black)' : ''}`);
      if (hogRingMat) {
        const hrQty = Math.ceil(runLF / 2);
        const hrItem = createTakeOffItem(hogRingMat, hrQty, 'Hardware', `1 per 2 LF`);
        runFenceMaterialCost += hrItem.total;
        runItems.push(hrItem);
      }

      // Tension Wire OR Bottom Rail
      if (hasBottomRail) {
        const bottomRailId = isBlack ? 'cl-rail-bottom-black' : 'cl-rail-bottom';
        const bottomRailMat = materials.find(m => m.id === bottomRailId) || findMaterial(bottomRailId, `1-5/8" Bottom Rail ${isBlack ? '(Black)' : ''}`);
        const brQty = Math.ceil(runLF / 21);
        const bottomRailCost = brQty * bottomRailMat.cost;
        runFenceMaterialCost += bottomRailCost;
        runItems.push({
          id: bottomRailMat.id,
          name: bottomRailMat.name,
          qty: brQty,
          unit: bottomRailMat.unit,
          unitCost: bottomRailMat.cost,
          total: bottomRailCost,
          category: 'Structure'
        });

        // Boulevard Brackets (1 per line post)
        const boulevardId = `cl-hw-boulevard${isBlack ? '-black' : ''}`;
        const boulevardMat = findMaterial(boulevardId, `Boulevard Bracket ${isBlack ? '(Black)' : ''}`);
        if (boulevardMat) {
          const bQty = runLinePosts;
          const bItem = createTakeOffItem(boulevardMat, bQty, 'Hardware');
          runFenceMaterialCost += bItem.total;
          runItems.push(bItem);
        }
      } else {
        // Tension Wire (Commercial uses LF match)
        const tensionId = `cl-tension-wire${isBlack ? '-black' : ''}`;
        const tensionMat = findMaterial(tensionId, `Bottom Tension Wire ${isBlack ? '(Black)' : ''}`);
        if (tensionMat) {
          const tensionItem = createTakeOffItem(tensionMat, runLF, 'Hardware');
          runFenceMaterialCost += tensionItem.total;
          runItems.push(tensionItem);
        }
      }

      skipGenericInfill = true;
    } else {
      panelQty = Math.ceil((netLF / 8) * wasteFactor);
      if (runStyle.type === 'Metal') {
        const height = run.height || 6;
        const variation = run.visualStyleId === 'm-2rep' ? '2rep' : (run.visualStyleId === 'm-3rr' ? '3rr' : '2rft');
        const panelId = `m-panel-${height}x8-${variation}`;
        panelMat = materials.find(m => m.id === panelId) || 
                   materials.find(m => m.id === `m-panel-${height}x8-2rft`) ||
                   panelMat;
      } else if (runStyle.type === 'Pipe') {
        skipGenericInfill = true;
      }
    }
    
    if (!skipGenericInfill) {
      const panelUnitCost = panelMat.cost; 
      const runTopStyle = run.topStyle || estimate.topStyle || 'Dog Ear';
      const panelName = runStyle.type === 'Wood' 
        ? `${panelMat.name} (${runTopStyle})` 
        : panelMat.name;

      const picketFormula = runStyle.type === 'Wood' 
        ? (run.visualStyleId === 'w-bob' 
            ? `BoB: (${(runLF * 12).toFixed(0)}" / 4.5") × ${wasteFactor} waste`
            : `SbS: (${(runLF * 12).toFixed(0)}" / 5.5") × ${wasteFactor} waste`)
        : `${(netLF / 8).toFixed(1)} Panels × ${wasteFactor} waste`;

      const panelTotalCost = panelQty * panelUnitCost;
      runFenceMaterialCost += panelTotalCost;
      runItems.push({
        id: panelMat.id,
        name: panelName,
        qty: panelQty,
        unit: panelMat.unit,
        unitCost: panelUnitCost,
        priceSource: panelMat.priceSource,
        total: panelTotalCost,
        category: panelMat.category || 'Picket',
        formula: picketFormula
      });

      // Add mounting brackets and screws for Metal (Wrought Iron)
      if (runStyle.type === 'Metal') {
        const installType = run.ironInstallType || estimate.ironInstallType || 'Bolt up';
        const railType = run.ironRails || estimate.ironRails || '2 rail';
        const bracketsPerPanel = railType === '3 rail' ? 6 : 4;
        
        if (installType !== 'Weld up') {
          const bracketMat = materials.find(m => m.id === 'm-bracket');
          if (bracketMat) {
            const bracketQty = panelQty * bracketsPerPanel;
            const bracketCost = bracketQty * bracketMat.cost;
            runFenceMaterialCost += bracketCost;
            runItems.push({
              id: bracketMat.id,
              name: bracketMat.name,
              qty: bracketQty,
              unit: bracketMat.unit,
              unitCost: bracketMat.cost,
              priceSource: bracketMat.priceSource,
              total: bracketCost,
              category: 'Hardware'
            });

            const screwMat = materials.find(m => m.id === 'm-screw-self-tap');
            if (screwMat) {
              const screwQty = bracketQty; // 1 screw per bracket
              const screwCost = screwQty * screwMat.cost;
              runFenceMaterialCost += screwCost;
              runItems.push({
                id: screwMat.id,
                name: screwMat.name,
                qty: screwQty,
                unit: screwMat.unit,
                unitCost: screwMat.cost,
                priceSource: screwMat.priceSource,
                total: screwCost,
                category: 'Hardware'
              });
            }
          }
        }
      }

      // Add visual style surcharge if > 0 (as a separate item)
      if (runVisualStyle.priceModifier > 0) {
        const surchargeName = `${runVisualStyle.name} Style Surcharge (${runStyle.name})`;
        const surchargeTotal = netLF * runVisualStyle.priceModifier;
        runFenceMaterialCost += surchargeTotal;
        runItems.push({
          id: `surcharge-${runVisualStyle.id}`,
          name: surchargeName,
          qty: netLF,
          unit: 'lf',
          unitCost: runVisualStyle.priceModifier,
          total: surchargeTotal,
          category: 'Finishing'
        });
      }
    }



    // Wood Components (Rails, Rot Board, Nails)
    if (runStyle.type === 'Wood') {
      const is6ft = run.height === 6;
      const is8ft = run.height === 8;
      
      // Rails and Rot Board
      const railsCount = is8ft ? 4 : (run.height > 6 ? 4 : 3);
      const railLength = is6ft ? 8 : 12;
      const sectionCount = Math.ceil(runLF / railLength);
      
      let railId = is6ft 
        ? (isStained ? 'w-rail-pine-8-stained' : 'w-rail-pine-8')
        : (isStained ? 'w-rail-pine-12-stained' : 'w-rail-pine-12');
        
      if (woodType === 'Japanese Cedar') {
        railId = is6ft 
          ? (isStained ? 'w-rail-j-cedar-8-stained' : 'w-rail-j-cedar-8')
          : (isStained ? 'w-rail-j-cedar-12-stained' : 'w-rail-j-cedar-12');
      } else if (woodType === 'Western Red Cedar') {
        railId = is6ft 
          ? (isStained ? 'w-rail-w-cedar-8-stained' : 'w-rail-w-cedar-8')
          : (isStained ? 'w-rail-w-cedar-12-stained' : 'w-rail-w-cedar-12');
      }
      
      const railMat = materials.find(m => m.id === railId) || { cost: 0, name: 'Unknown Rail', unit: 'each', id: 'unknown-rail' } as MaterialItem;
      const railQty = sectionCount * railsCount;
      const railFormula = `${sectionCount} sections × ${railsCount} rails/section`;
      const railCost = railQty * railMat.cost;
      runFenceMaterialCost += railCost;
      runItems.push({
        id: railMat.id,
        name: railMat.name,
        qty: railQty,
        unit: railMat.unit,
        unitCost: railMat.cost,
        priceSource: railMat.priceSource,
        total: railCost,
        category: 'Structure',
        formula: railFormula
      });

      const hasRotBoard = !!(run.hasRotBoard ?? estimate.hasRotBoard);
      if (hasRotBoard) {
        const rotBoardId = is8ft 
          ? (isStained ? 'w-rot-board-12-stained' : 'w-rot-board-12')
          : (isStained ? 'w-rot-board-16-stained' : 'w-rot-board-16');
        const rotBoardMat = materials.find(m => m.id === rotBoardId);
        if (rotBoardMat) {
          const rotBoardQty = is8ft ? Math.ceil(runLF / 12) : Math.ceil(runLF / 16);
          const rotBoardCost = rotBoardQty * rotBoardMat.cost;
          runFenceMaterialCost += rotBoardCost;
          runItems.push({
            id: rotBoardMat.id,
            name: rotBoardMat.name,
            qty: rotBoardQty,
            unit: rotBoardMat.unit,
            unitCost: rotBoardMat.cost,
            priceSource: rotBoardMat.priceSource,
            total: rotBoardCost,
            category: 'Structure'
          });
        }
      }

      // Nails
      const nailsMat = materials.find(m => m.id === 'h-nail-galv');
      if (nailsMat) {
        const nailCount = Math.ceil(panelQty * 6);
        const nailCost = nailCount * nailsMat.cost;
        runFenceMaterialCost += nailCost;
        runItems.push({
          id: nailsMat.id,
          name: nailsMat.name,
          qty: nailCount,
          unit: 'nails',
          unitCost: nailsMat.cost,
          priceSource: nailsMat.priceSource,
          total: nailCost,
          category: 'Hardware'
        });
      }
    }

    // Optional Items (Trim, Cap)
    const runTopStyle = run.topStyle || estimate.topStyle || 'Dog Ear';
    const forceTrim = runStyle.type === 'Wood' && runTopStyle === 'Flat Top';

    if (runStyle.type === 'Wood') {
       if (estimate.hasCapAndTrim || forceTrim) {
          // Top Trim (1x4x8)
          const trimMat = materials.find(m => m.id === 'f-cap-trim');
          if (trimMat) {
            const trimQty = Math.ceil(runLF / 8);
            const trimCost = trimQty * trimMat.cost;
            runFenceMaterialCost += trimCost;
            runItems.push({
              id: trimMat.id,
              name: trimMat.name,
              qty: trimQty,
              unit: 'each',
              unitCost: trimMat.cost,
              priceSource: trimMat.priceSource,
              total: trimCost,
              category: 'Finishing'
            });
          }
       }

       if (estimate.hasDoubleTrim) {
          // Double Trim (1x2x8)
          const doubleTrimMat = materials.find(m => m.id === 'f-double-trim-1x2');
          if (doubleTrimMat) {
            const trimQty = Math.ceil(runLF / 8);
            const trimCost = trimQty * doubleTrimMat.cost;
            runFenceMaterialCost += trimCost;
            runItems.push({
              id: doubleTrimMat.id,
              name: doubleTrimMat.name,
              qty: trimQty,
              unit: 'each',
              unitCost: doubleTrimMat.cost,
              priceSource: doubleTrimMat.priceSource,
              total: trimCost,
              category: 'Finishing'
            });
          }
       }

       if (estimate.hasTopCap) {
          // Top Cap (2x6x12)
          const topCapMat = materials.find(m => m.id === 'f-top-cap-2x6');
          if (topCapMat) {
            const topCapQty = Math.ceil(runLF / 12);
            const topCapCost = topCapQty * topCapMat.cost;
            runFenceMaterialCost += topCapCost;
            runItems.push({
              id: topCapMat.id,
              name: topCapMat.name,
              qty: topCapQty,
              unit: 'each',
              unitCost: topCapMat.cost,
              priceSource: topCapMat.priceSource,
              total: topCapCost,
              category: 'Finishing'
            });
          }
       }
    }

    if (runStyle.type === 'Pipe') {
      // 2 3/8" top rail- equal to overall length of fence
      const railMat = materials.find(m => m.id === 'p-rail-238');
      if (railMat) {
        // Collect for optimization (broken into stick lengths)
        let rem = runLF;
        while (rem > 32) {
          allPipeSegments.push(32);
          rem -= 32;
        }
        if (rem > 0.1) {
          allPipeSegments.push(rem);
        }
        const railCost = runLF * railMat.cost;
        runFenceMaterialCost += railCost;
        runItems.push({
          id: railMat.id,
          name: railMat.name,
          qty: runLF,
          unit: railMat.unit,
          unitCost: railMat.cost,
          priceSource: railMat.priceSource,
          total: railCost,
          category: 'Structure'
        });
      }

      // 2 3/8" EZ ties- 12 for every 8 linear feet of fence
      const tieMat = materials.find(m => m.id === 'p-ez-tie');
      if (tieMat) {
        const tieQty = Math.ceil((runLF / 8) * 12);
        const tieCost = tieQty * tieMat.cost;
        runFenceMaterialCost += tieCost;
        runItems.push({
          id: tieMat.id,
          name: tieMat.name,
          qty: tieQty,
          unit: tieMat.unit,
          unitCost: tieMat.cost,
          priceSource: tieMat.priceSource,
          total: tieCost,
          category: 'Hardware'
        });
      }

      // No-Climb Wire - Use aggregated pricing per LF
      const finish = run.visualStyleId === 'p-black' ? 'black' : 'galv';
      let height = run.height || 4;
      if (height !== 4 && height !== 5 && height !== 6) height = height < 5 ? 4 : (height < 6 ? 5 : 6);
      const key = `${height}-${finish}`;
      
      const avgWireCost = wireCostsPerLF[key];
      if (avgWireCost) {
        const totalCost = runLF * avgWireCost;
        runFenceMaterialCost += totalCost;
        runItems.push({
          id: `partial-wire-${key}-${run.id}`,
          name: `No-Climb Wire (Partial Roll - ${height}' ${finish === 'black' ? 'Black' : 'Galv'})`,
          qty: runLF,
          unit: 'lf',
          unitCost: avgWireCost,
          total: totalCost,
          category: 'Infill'
        });
      }

      // Paint - Use aggregated pricing per LF
      const color = run.color || estimate.defaultColor || 'Raw';
      if (color !== 'Raw' && paintAvgCostPerLF > 0) {
        const paintCost = runLF * paintAvgCostPerLF;
        runFenceMaterialCost += paintCost;
        runItems.push({
          id: `partial-paint-${run.id}`,
          name: `Industrial Metal Paint (${color} - Partial)`,
          qty: runLF,
          unit: 'lf',
          unitCost: paintAvgCostPerLF,
          total: paintCost,
          category: 'Finishing'
        });
      }
    }

    // Labor per run
    let runLaborRate = 0;
    if (runStyle.type === 'Wood') {
      const is6ft = run.height <= 6;
      const isSideBySide = run.visualStyleId === 'w-side' || run.visualStyleId === 'side-by-side';
      if (is6ft) {
        runLaborRate = isSideBySide ? laborRates.woodSideBySide6 : laborRates.woodBoardOnBoard6;
      } else {
        runLaborRate = isSideBySide ? laborRates.woodSideBySide8 : laborRates.woodBoardOnBoard8;
      }
      const runTopStyle = run.topStyle || estimate.topStyle || 'Dog Ear';
      if (estimate.hasTopCap) runLaborRate += laborRates.topCap;
    } else if (runStyle.type === 'Metal') {
      const installType = run.ironInstallType || estimate.ironInstallType || 'Bolt up';
      runLaborRate = (installType === 'Weld up') ? laborRates.ironWeldUp : laborRates.ironBoltUp;
    } else if (runStyle.type === 'Chain Link') {
      runLaborRate = laborRates.chainLink;
      if (run.hasBottomRail) {
        runLaborRate += 1;
      }
    } else {
      runLaborRate = laborRates.pipeFence;
    }

    if (run.reusePosts) {
      runLaborRate = Math.max(0, runLaborRate - 2);
    }

    let runFenceLaborCost = netLF * runLaborRate;
    
    // Add fence labor as an item
    if (runFenceLaborCost > 0) {
      const laborItem = {
        id: `labor-${run.id}`,
        name: `Installation Labor (${run.name})`,
        qty: netLF,
        unit: 'lf',
        unitCost: runLaborRate,
        total: runFenceLaborCost,
        category: 'Labor'
      };
      runItems.push(laborItem);
    }

    let runDeeperPostLaborCost = 0;
    if (estimate.increasePostDepth && !isExisting) {
      const deeperPostLaborRate = laborRates.deeperPostLabor ?? 1;
      runDeeperPostLaborCost = netLF * deeperPostLaborRate;
      if (runDeeperPostLaborCost > 0) {
        const deeperPostLaborItem = {
          id: `labor-deeper-post-${run.id}`,
          name: `Deeper Post Labor (${run.name})`,
          qty: netLF,
          unit: 'lf',
          unitCost: deeperPostLaborRate,
          total: runDeeperPostLaborCost,
          category: 'Labor'
        };
        runItems.push(deeperPostLaborItem);
        runFenceLaborCost += runDeeperPostLaborCost;
      }
    }

    // Demolition per run
    if (run.hasDemolition) {
      const runDemoLF = run.demoLinearFeet || runLF;
      const demoCost = runDemoLF * laborRates.demo;
      totalDemo += demoCost;
      runDemoCharge = demoCost;
      
      const demoItem = {
        id: `labor-demo-${run.id}`,
        name: `Demo Labor (${run.name})`,
        qty: runDemoLF,
        unit: 'lf',
        unitCost: laborRates.demo,
        total: demoCost,
        category: 'Demolition'
      };
      runItems.push(demoItem);
    }

    if (isExisting) {
      // If it's an existing fence, zero out standard costs
      // We only keep stain labor and demolition labor
      const preservedItems = runItems.filter(i => 
        i.id.startsWith('labor-stain-') || 
        i.id.startsWith('labor-demo-') ||
        i.category === 'Demolition'
      );
      
      runItems.length = 0;
      runItems.push(...preservedItems);
      
      runFenceMaterialCost = 0;
      runGateMaterialCost = 0;
      // We'll set labor cost to only include the preserved items' totals
      runFenceLaborCost = preservedItems.filter(i => i.id.startsWith('labor-stain-')).reduce((sum, i) => sum + i.total, 0);
      runGateLaborCost = 0;
      // demoCharge is already preserved in detailedData but we explicitly zero others
    } else {
      // Standard Case: add the stain labor to the fence labor cost for this run
      runFenceLaborCost += runStainLabor;
    }

    const laborTotal = runFenceLaborCost + runGateLaborCost;
    totalLabor += laborTotal;

    // We subtract stain from fence labor to keep them separate for the contract breakdown
    const pureFenceLabor = runFenceLaborCost - runStainLabor;

    runItems.forEach(i => {
      const isPartialWire = i.id.startsWith('partial-wire-');
      const isPartialPaint = i.id.startsWith('partial-paint-');
      if (i.category === 'Labor') {
        // Already handled by totalLabor += laborTotal
      } else if (i.category === 'Demolition') {
        // Already handled by totalDemo += demoCost
      } else {
        if (!isPartialWire && !isPartialPaint) {
          totalMaterial += i.total;
        }
      }
      
      if (!isPartialWire && !isPartialPaint) {
        addToSummary(i);
      }
    });

    detailedRuns.push({
      runId: run.id,
      runName: run.name,
      linearFeet: runLF,
      netLF,
      styleName: runStyle.name,
      styleType: runStyle.type,
      height: run.height || estimate.defaultHeight || 6,
      railCount: (run.height === 8 ? 4 : 3),
      hasRotBoard: !!(run.hasRotBoard ?? estimate.hasRotBoard),
      topStyle: run.topStyle || estimate.topStyle || 'Dog Ear',
      hasTopCap: !!estimate.hasTopCap,
      hasTrim: !!estimate.hasCapAndTrim,
      woodType: run.woodType || estimate.woodType,
      stainSides: run.stainSides,
      picketStyle: (run.visualStyleId === 'w-bob') ? 'Board on Board' : ((run.visualStyleId === 'w-side' || run.visualStyleId === 'side-by-side') ? 'Side by Side' : run.visualStyleId),
      chainLinkGrade: run.chainLinkGrade || (runStyle.type === 'Chain Link' ? 'Residential' : undefined),
      chainLinkFabricGauge: run.chainLinkFabricGauge,
      hasBottomRail: run.hasBottomRail,
      ironInstallType: run.ironInstallType || estimate.ironInstallType,
      ironPanelType: run.ironPanelType || estimate.ironPanelType,
      items: runItems,
      fenceMaterialCost: runFenceMaterialCost,
      fenceLaborCost: runFenceLaborCost,
      gateMaterialCost: runGateMaterialCost,
      gateLaborCost: runGateLaborCost,
      demoCharge: runDemoCharge,
      stainingCharge: runStainLabor,
      gates: runGates,
      resolvedIronPosts,
      deeperPostMaterialDiff: runDeeperPostMaterialDiff,
      deeperPostLaborCost: runDeeperPostLaborCost,
      chainLinkFenceRunCount: runStyle.type === 'Chain Link' ? (1 + (run.corners || 0) + (run.gateDetails?.length || 0)) : undefined,
      debugData: runStyle.type === 'Chain Link' ? {
        totalLF: runLF,
        runCount: 1 + (run.corners || 0) + (run.gateDetails?.length || 0),
        segmentNames: run.name,
        gateSplits: run.gateDetails?.length || 0,
        cornerSplits: run.corners || 0,
        tensionBars: (1 + (run.corners || 0) + (run.gateDetails?.length || 0)) * 2,
        railEndCups: (1 + (run.corners || 0) + (run.gateDetails?.length || 0)) * 2,
        braceBands: (1 + (run.corners || 0) + (run.gateDetails?.length || 0)) * 4,
        tensionBands: (1 + (run.corners || 0) + (run.gateDetails?.length || 0)) * 2 * (run.height || 6)
      } : undefined
    });
  });

  // Global Items
  const totalLF = detailedRuns.reduce((sum, r) => sum + r.linearFeet, 0);

  // Global Items for Pipe Fence
  globalWireRolls.forEach(roll => {
    addToSummary(roll);
    totalMaterial += roll.total;
  });

  globalPaintItems.forEach(item => {
    addToSummary(item);
    totalMaterial += item.total;
  });

  let hasAnyPipe = false;

  detailedRuns.forEach((r, idx) => {
    const run = runs[idx];
    const style = FENCE_STYLES.find(s => s.id === run.styleId);
    if (style?.type === 'Pipe') {
      hasAnyPipe = true;
    }
  });

  if (hasAnyPipe) {
    const domeCapMat = materials.find(m => m.id === 'pc-dome');
    if (domeCapMat) {
      addToSummary({
        id: domeCapMat.id,
        name: `${domeCapMat.name} (Project Extra)`,
        qty: 1,
        unit: domeCapMat.unit,
        unitCost: domeCapMat.cost,
        priceSource: domeCapMat.priceSource,
        total: domeCapMat.cost,
        category: 'Hardware'
      });
      totalMaterial += domeCapMat.cost;
    }
  }

  // Pipe Stick Optimization
  let pipeCuttingSummary: PipeCuttingGuide | undefined;
  if (allPipeSegments.length > 0) {
    pipeCuttingSummary = calculateStickOptimization(allPipeSegments, 32);
    const stickMat = materials.find(m => m.id === 'p-stick-32');
    if (stickMat && pipeCuttingSummary.sticks.length > 0) {
      // Remove individual pipe items from summaryMap to replace with optimized sticks
      Object.keys(summaryMap).forEach(key => {
        if (key.includes('2-3/8" Sch 40 Top Rail Pipe') || key.includes('Sch 40 Pipe Post')) {
          delete summaryMap[key];
        }
      });

      // Add optimized sticks
      const qty = pipeCuttingSummary.sticks.length;
      const stickItem = {
        id: stickMat.id,
        name: stickMat.name,
        qty,
        unit: 'each',
        unitCost: stickMat.cost,
        priceSource: stickMat.priceSource,
        total: qty * stickMat.cost,
        category: 'Rail'
      };
      addToSummary(stickItem);
    }
  }

  const globalItems: TakeOffItem[] = [];

  globalItems.forEach(i => {
    totalMaterial += i.total;
    addToSummary(i);
  });

  const calculatedSummary = Object.values(summaryMap);
  const manualSummary: TakeOffItem[] = [];

  if (estimate.manualQuantities) {
    Object.entries(estimate.manualQuantities).forEach(([key, qty]) => {
      const numericQty = Number(qty);
      if (!qty || isNaN(numericQty) || numericQty === 0) return;
      
      const mat = materials.find(m => m.id === key || m.name === key);
      if (mat) {
        const unitCost = estimate.manualPrices?.[key] ?? mat.cost;
        manualSummary.push(createTakeOffItem(mat, numericQty, mat.category, undefined, unitCost));
      }
    });
  }

  const allItems = [...calculatedSummary, ...manualSummary];
  const extraLaborTakeoffItems: TakeOffItem[] = [];
  let extraLaborTotal = 0;

  // Add delivery fee as labor item
  const deliveryFee = estimate.deliveryFee ?? laborRates.deliveryFee ?? 50;
  if (deliveryFee > 0) {
    const deliveryItem = {
      id: 'labor-delivery',
      name: 'Delivery Fee',
      qty: 1,
      unit: 'job',
      unitCost: deliveryFee,
      total: deliveryFee,
      category: 'Labor'
    };
    allItems.push(deliveryItem);
    extraLaborTakeoffItems.push(deliveryItem);
    extraLaborTotal += deliveryFee;
  }

  // Add custom labor items
  if (estimate.customLaborItems) {
    estimate.customLaborItems.forEach(item => {
      const customItem = {
        id: item.id,
        name: item.name,
        qty: 1,
        unit: 'each',
        unitCost: item.cost,
        total: item.cost,
        category: 'Labor'
      };
      allItems.push(customItem);
      extraLaborTakeoffItems.push(customItem);
      extraLaborTotal += item.cost;
    });
  }

  // To meet the requirement that the delivery fee and custom labor additions are included in the fence installation cost
  // and count towards the run/section cost summaries on the contract, we assign it to the first run (idx === 0).
  if (detailedRuns.length > 0) {
    const manualMaterialOnlyTotal = manualSummary.filter(i => i.category !== 'Labor' && i.category !== 'Demolition' && i.category !== 'SitePrep').reduce((sum, i) => sum + i.total, 0);
    const manualLaborOnlyTotal = manualSummary.filter(i => i.category === 'Labor').reduce((sum, i) => sum + i.total, 0);
    const manualDemoOnlyTotal = manualSummary.filter(i => i.category === 'Demolition').reduce((sum, i) => sum + i.total, 0);

    detailedRuns[0].fenceLaborCost += extraLaborTotal + manualLaborOnlyTotal;
    detailedRuns[0].fenceMaterialCost += manualMaterialOnlyTotal;
    detailedRuns[0].demoCharge += manualDemoOnlyTotal;
  }

  // Re-calculate totals based on ALL items
  totalMaterial = allItems.filter(i => i.category !== 'Labor' && i.category !== 'Demolition' && i.category !== 'SitePrep').reduce((sum, i) => sum + i.total, 0);
  totalLabor = allItems.filter(i => i.category === 'Labor').reduce((sum, i) => sum + i.total, 0);
  totalDemo = allItems.filter(i => i.category === 'Demolition').reduce((sum, i) => sum + i.total, 0);
  totalPrep = allItems.filter(i => i.category === 'SitePrep').reduce((sum, i) => sum + i.total, 0);

  // Definitive Post Count logic
  // Priority 1: Use allResolvedIronPosts for Wrought Iron sections
  // Priority 2: Use summary filter for all other sections (Wood, Chain Link, Pipe)
  const ironPostTotal = allResolvedIronPosts.length;
  // When counting 'other' posts, we MUST exclude the wrought iron posts to avoid double-counting
  // We check for both 'Structure' and 'Post' categories to be robust
  const otherPostTotal = allItems
    .filter(i => (i.category === 'Structure' || i.category === 'Post') && i.name.toLowerCase().includes('post') && !i.id.startsWith('m-post-'))
    .reduce((sum, i) => sum + i.qty, 0);
  
  const postCountTotal = ironPostTotal + otherPostTotal;
  
  const subtotal = totalMaterial + totalLabor + totalDemo + totalPrep;
  const markup = subtotal * ((estimate.markupPercentage || 0) / 100);
  const tax = totalMaterial * ((estimate.taxPercentage || 0) / 100);
  
  // deliveryFee is now included in totalLabor and subtotal
  const grandTotal = subtotal + markup + tax;

  // Append extraLaborTakeoffItems to the returned summary so they show up in the Subcontractor Labor Manifest
  const finalSummary = [...calculatedSummary, ...extraLaborTakeoffItems];

  const markupFactor = 1 + (estimate.markupPercentage || 0) / 100;
  const taxFactor = (estimate.taxPercentage || 0) / 100;

  const runsPricing = detailedRuns.map((run, i) => {
    // Separate staining from pure fence installation
    const pureFenceLabor = run.fenceLaborCost - run.stainingCharge;
    const baseFenceCharge = (run.fenceMaterialCost + pureFenceLabor) * markupFactor;
    const fenceTax = run.fenceMaterialCost * taxFactor;
    const totalFenceCharge = baseFenceCharge + fenceTax;

    const stainingCharge = run.stainingCharge * markupFactor;

    // Gate Charge - Use authoritative gate.items for total consistency
    const totalGateCharge = (run.gates || []).reduce((acc: number, gate: any) => {
      const items = gate.items || [];
      const subtotal = items.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
      const nonLaborSubtotal = items.filter((i: any) => i.category !== 'Labor').reduce((sum: number, item: any) => sum + (item.total || 0), 0);
      return acc + (subtotal * markupFactor) + (nonLaborSubtotal * taxFactor);
    }, 0);

    // Demo Charge
    const demoCharge = run.demoCharge * markupFactor;

    // Apply Overrides
    const finalFence = (estimate.manualSectionTotals?.[i] !== undefined && estimate.manualSectionTotals?.[i] !== null)
      ? estimate.manualSectionTotals[i]!
      : totalFenceCharge;

    const finalGate = (estimate.manualGateTotals?.[i] !== undefined && estimate.manualGateTotals?.[i] !== null)
      ? estimate.manualGateTotals[i]!
      : totalGateCharge;

    const finalDemo = (estimate.manualDemoTotals?.[i] !== undefined && estimate.manualDemoTotals?.[i] !== null)
      ? estimate.manualDemoTotals[i]!
      : demoCharge;

    const finalStain = stainingCharge;

    const totalSection = finalFence + finalGate + finalDemo + finalStain;

    return {
      runName: run.runName,
      totalFenceCharge,
      totalGateCharge,
      demoCharge,
      stainingCharge,
      finalFence,
      finalGate,
      finalDemo,
      finalStain,
      totalSection,
      netLF: run.netLF
    };
  });

  // Sum up section totals
  const totalSectionsSum = runsPricing.reduce((sum, r) => sum + r.totalSection, 0);

  // Prep cost charge
  const addOnSitePrepPrice = totalPrep * markupFactor;

  // Demo removal charge
  const demoRemovalPrice = runsPricing.reduce((sum, r) => sum + r.finalDemo, 0);

  // Discount
  const discountAmount = estimate.discountAmount || 0;

  // Authoritative Grand Total from Takeoff (Materials + Labor + Demo + Prep + Markup + Tax)
  const authoritativeGrandTotal = (totalMaterial + totalLabor + totalDemo + totalPrep) * markupFactor + (totalMaterial * taxFactor);

  // Calculated overall base fence total (excluding custom contract line items)
  // This should match authoritativeGrandTotal minus discount
  let baseFenceCalculatedTotal = authoritativeGrandTotal - discountAmount;

  // Override or Calculated for base fence
  const manualGrandTotal = estimate.manualGrandTotal !== undefined && estimate.manualGrandTotal !== null ? estimate.manualGrandTotal : null;
  const baseFenceTotal = manualGrandTotal !== null ? manualGrandTotal : baseFenceCalculatedTotal;

  // Custom contract line items total (additional contract line items)
  const customContractLineItems = estimate.customContractLineItems || [];
  const additionalContractLineItemsTotal = customContractLineItems.length > 0
    ? customContractLineItems.filter(item => item.showOnContract).reduce((sum, item) => sum + item.amount, 0)
    : (estimate.customContractLineItemsTotal || 0);

  // finalCustomerPrice should equal: baseFenceTotal + additionalContractLineItemsTotal
  const finalCustomerPrice = baseFenceTotal + additionalContractLineItemsTotal;

  // calculatedTotal includes base calculated total and additional contract line items
  const calculatedTotal = baseFenceCalculatedTotal + additionalContractLineItemsTotal;

  // Subtotal before discount
  const subtotalBeforeDiscount = authoritativeGrandTotal;

  // Global price per foot
  const totalNetLF = runsPricing.reduce((sum, r) => sum + r.netLF, 0);
  const totalGates = runsPricing.reduce((sum, r) => sum + r.finalGate, 0);
  
  const excludedCustomItemsTotal = customContractLineItems.length > 0
    ? customContractLineItems.filter(item => item.showOnContract && !item.includeInPricePerFoot).reduce((sum, item) => sum + item.amount, 0)
    : additionalContractLineItemsTotal;

  const pricePerFoot = totalNetLF > 0 ? (finalCustomerPrice - totalGates - excludedCustomItemsTotal) / totalNetLF : 0;

  const fenceRunMaterialTotal = calculatedSummary.filter(i => i.category !== 'Labor' && i.category !== 'Demolition' && i.category !== 'SitePrep').reduce((sum, i) => sum + i.total, 0);
  const customMaterialTotal = manualSummary.filter(i => i.category !== 'Labor' && i.category !== 'Demolition' && i.category !== 'SitePrep').reduce((sum, i) => sum + i.total, 0);

  const pricing = {
    runsPricing,
    totalSectionsSum,
    addOnSitePrepPrice,
    demoRemovalPrice,
    discountAmount,
    manualGrandTotal,
    baseFenceTotal,
    additionalContractLineItemsTotal,
    calculatedTotal,
    finalCustomerPrice,
    estimatedPrice: finalCustomerPrice,
    grandTotal: finalCustomerPrice,
    subtotalBeforeDiscount,
    pricePerFoot,
    // Debug fields
    fenceRunMaterialTotal,
    customMaterialTotal,
    materialTakeoffFinalTotal: authoritativeGrandTotal,
    customerContractMaterialSource: customMaterialTotal > 0 ? 'Mixed (Runs + Manual)' : 'Runs Only',
    customerContractDisplayedMaterialTotal: totalMaterial
  };

  return {
    summary: finalSummary,
    manualSummary: manualSummary,
    runs: detailedRuns,
    pipeCuttingSummary,
    allResolvedIronPosts,
    totals: {
      material: totalMaterial,
      labor: totalLabor,
      demo: totalDemo,
      prep: totalPrep,
      subtotal,
      markup,
      tax,
      grandTotal,
      postCount: postCountTotal
    },
    pricing
  };
}
