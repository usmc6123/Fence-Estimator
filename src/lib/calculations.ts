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
  formula?: string;
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

export interface RunTakeOff {
  runId: string;
  runName: string;
  linearFeet: number;
  netLF: number;
  styleName: string;
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
  gates: {
    gateId: string;
    type: string;
    width: number;
    construction?: string;
    items: TakeOffItem[];
  }[];
}

export interface DetailedTakeOff {
  summary: TakeOffItem[];
  manualSummary: TakeOffItem[];
  runs: RunTakeOff[];
  pipeCuttingSummary?: PipeCuttingGuide;
  totals: {
    material: number;
    labor: number;
    demo: number;
    prep: number;
    subtotal: number;
    markup: number;
    tax: number;
    grandTotal: number;
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

export function calculateDetailedTakeOff(
  estimate: Partial<Estimate>,
  materials: MaterialItem[],
  laborRates: LaborRates
): DetailedTakeOff {
  const runs = estimate.runs || [];
  const detailedRuns: RunTakeOff[] = [];
  const summaryMap: Record<string, TakeOffItem> = {};

  const addToSummary = (item: TakeOffItem) => {
    const key = `${item.name}-${item.unitCost}`;
    if (summaryMap[key]) {
      summaryMap[key].qty += item.qty;
      summaryMap[key].total += item.total;
    } else {
      summaryMap[key] = { ...item };
    }
  };

  let totalMaterial = 0;
  let totalLabor = 0;
  let totalDemo = 0;
  let totalPrep = 0;

  // Global Fallback if no runs are defined
  if (runs.length === 0 && (estimate.linearFeet || estimate.gateCount)) {
    const lf = estimate.linearFeet || 0;
    const style = FENCE_STYLES.find(s => s.id === estimate.defaultStyleId) || FENCE_STYLES[0];
    
    // Simple multiplier logic for global fallback
    const materialCostPerLF = 15; // Simplified average
    const laborCostPerLF = 10;
    
    addToSummary({
      id: 'global-material',
      name: `Fence Materials (Bulk - ${style.name})`,
      qty: lf,
      unit: 'lf',
      unitCost: materialCostPerLF,
      priceSource: 'Library Price',
      total: lf * materialCostPerLF,
      category: 'Infill'
    });

    addToSummary({
      id: 'global-labor',
      name: `Fence Installation (Bulk)`,
      qty: lf,
      unit: 'lf',
      unitCost: laborCostPerLF,
      priceSource: 'Library Price',
      total: lf * laborCostPerLF,
      category: 'Labor'
    });

    if (estimate.gateCount) {
      const gateCost = style.type === 'Wood' ? 250 : 350;
      addToSummary({
        id: 'global-gates',
        name: `Gates (Global)`,
        qty: estimate.gateCount,
        unit: 'each',
        unitCost: gateCost,
        priceSource: 'Library Price',
        total: estimate.gateCount * gateCost,
        category: 'Gate'
      });
    }
  }

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
            } else {
              // Custom Welded Gate: 1 panel + (2) 1.5" x 6' gate ends per side
              const panelMat = materials.find(m => m.category === 'Metal' && m.id.includes(`panel-${run.height}x8`)) || materials.find(m => m.category === 'Metal' && m.id.includes('panel-4x8'));
              const gateEndMat = materials.find(m => m.id === 'm-gate-end-6');
              
              if (panelMat) {
                items.push({
                  id: panelMat.id,
                  name: `${panelMat.name} (For Gate Frame)`,
                  qty: sideCount,
                  unit: 'each',
                  unitCost: panelMat.cost,
                  total: sideCount * panelMat.cost,
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

        if (gate.construction === 'Welded') {
          gateLaborAmount = laborRates.gateWeldedFrame;
          gateLaborName = `Gate Install (Welded Frame)`;
        } else if (gate.construction === 'Pre-made') {
          gateLaborAmount = laborRates.gateHangPreMade;
          gateLaborName = `Gate Install (Pre-made Gate)`;
        } else {
          // Default logic if not specifically selected
          if (runStyle.type === 'Wood') {
            gateLaborAmount = gate.type === 'Double' ? laborRates.gateWoodDrive : laborRates.gateWoodWalk;
            gateLaborName = `Gate Install (${gate.type} Wood)`;
          } else {
            gateLaborAmount = laborRates.gateWeldedFrame;
            gateLaborName = `Gate Install (Welded Frame)`;
          }
        }

        const totalGateLabor = gateLaborAmount * sideCount;
        runGateLaborCost += totalGateLabor;
        
        gateItems.push({
          id: `labor-gate-${gate.id}`,
          name: gateLaborName,
          qty: sideCount,
          unit: 'each',
          unitCost: gateLaborAmount,
          total: totalGateLabor,
          category: 'Labor'
        });

        gateItems.forEach(i => {
          if (i.category === 'Labor') {
            // Already added to runGateLaborCost above
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

    const stdPostCount = (runStyle.type === 'Pipe' || runStyle.type === 'Metal')
      ? Math.max(0, runPostCount - gatePostCountForRun)
      : Math.max(0, runPostCount - hingePostCount);

    if (!run.reusePosts) {
      // Standard Posts
      if (stdPostCount > 0) {
        let postMat = materials.find(m => m.category === 'Post' && m.id.startsWith(runStyle.type.toLowerCase().charAt(0))) || materials[0];
        if (runStyle.type === 'Wood') {
          postMat = materials.find(m => m.id === (run.height === 8 ? 'w-post-metal-11' : 'w-post-metal-8')) || postMat;
        } else if (runStyle.type === 'Chain Link') {
          const grade = run.chainLinkGrade || 'Residential';
          const postHeight = (run.height || 4) + 2;
          
          // Line Posts
          const linePostId = `cl-post-line-${grade === 'Commercial' ? 'comm' : 'res'}-${postHeight}`;
          const linePostMat = materials.find(m => m.id === linePostId);
          if (linePostMat && runLinePosts > 0) {
            const lpCost = runLinePosts * linePostMat.cost;
            runFenceMaterialCost += lpCost;
            runItems.push({
              id: linePostMat.id,
              name: linePostMat.name,
              qty: runLinePosts,
              unit: linePostMat.unit,
              unitCost: linePostMat.cost,
              total: lpCost,
              category: 'Structure'
            });
          }
          
          // Terminal Posts (Ends, Corners, and Gates)
          const terminalPostId = `cl-post-term-${postHeight}`;
          const termPostMat = materials.find(m => m.id === terminalPostId);
          const tpCount = (runCornerPosts + startEndPosts) + (run.gateDetails?.length * 2 || 0);
          
          if (termPostMat && tpCount > 0) {
            const tpCost = tpCount * termPostMat.cost;
            runFenceMaterialCost += tpCost;
            runItems.push({
              id: termPostMat.id,
              name: termPostMat.name,
              qty: tpCount,
              unit: termPostMat.unit,
              unitCost: termPostMat.cost,
              total: tpCost,
              category: 'Structure'
            });
          }
        }
        
        // Universal Post Addition (Skip for Chain Link since we handled it above)
        if (runStyle.type !== 'Chain Link') {
          if (runStyle.type === 'Wood') {
            postMat = materials.find(m => m.id === (run.height === 8 ? 'w-post-metal-11' : 'w-post-metal-8')) || postMat;
          } else if (runStyle.type === 'Pipe') {
            const postHeight = (run.height || 4) + 2;
            postMat = materials.find(m => m.id === `p-post-238-${postHeight}`) || postMat;
            for (let i = 0; i < stdPostCount; i++) {
              allPipeSegments.push(postHeight);
            }
          } else if (runStyle.type === 'Metal') {
            const postHeight = (run.height || 4) + 2;
            postMat = materials.find(m => m.id === `m-post-2x2-${postHeight}`) || postMat;
          }

          const cost = stdPostCount * postMat.cost;
          runFenceMaterialCost += cost;
          runItems.push({
            id: postMat.id,
            name: postMat.name,
            qty: stdPostCount,
            unit: postMat.unit,
            unitCost: postMat.cost,
            priceSource: postMat.priceSource,
            total: cost,
            category: 'Structure'
          });
        }
      }

      // Gate Posts for Pipe and Metal Fence
      if ((runStyle.type === 'Pipe' || runStyle.type === 'Metal') && gatePostCountForRun > 0) {
        const postHeight = (run.height || 4) + 3;
        
        if (runStyle.type === 'Metal') {
          // Wrought Iron: Distinguish between Single and Double (Drive) gates
          let driveGatePostCount = 0;
          let singleGatePostCount = 0;
          
          run.gateDetails?.forEach(gate => {
            if (gate.type === 'Double') driveGatePostCount += 2;
            else singleGatePostCount += 1;
          });

          // Single Gate Posts (2x2)
          if (singleGatePostCount > 0) {
            const gatePostMat = materials.find(m => m.id === `m-post-2x2-${postHeight}`) || materials.find(m => m.id === `m-post-2x2-${postHeight - 1}`);
            if (gatePostMat) {
              const cost = singleGatePostCount * gatePostMat.cost;
              runFenceMaterialCost += cost;
              runItems.push({
                id: gatePostMat.id,
                name: `${gatePostMat.name} (Single Gate Post)`,
                qty: singleGatePostCount,
                unit: gatePostMat.unit,
                unitCost: gatePostMat.cost,
                priceSource: gatePostMat.priceSource,
                total: cost,
                category: 'Structure'
              });
            }
          }

          // Drive Gate Posts (4x4)
          if (driveGatePostCount > 0) {
            const gatePostMat = materials.find(m => m.id === `m-post-4x4-${postHeight}`) || materials.find(m => m.id === `m-post-4x4-${postHeight - 1}`);
            if (gatePostMat) {
              const cost = driveGatePostCount * gatePostMat.cost;
              runFenceMaterialCost += cost;
              runItems.push({
                id: gatePostMat.id,
                name: `${gatePostMat.name} (Drive Gate Post)`,
                qty: driveGatePostCount,
                unit: gatePostMat.unit,
                unitCost: gatePostMat.cost,
                priceSource: gatePostMat.priceSource,
                total: cost,
                category: 'Structure'
              });
            }
          }
        } else {
          // Pipe Fence logic remains the same
          const prefix = 'p-post-238-';
          const gatePostMat = materials.find(m => m.id === `${prefix}${postHeight}`) || materials.find(m => m.id === `${prefix}${postHeight - 1}`);
          
          if (gatePostMat) {
            // Collect for optimization
            for (let i = 0; i < gatePostCountForRun; i++) {
              allPipeSegments.push(postHeight);
            }
            const cost = gatePostCountForRun * gatePostMat.cost;
            runFenceMaterialCost += cost;
            runItems.push({
              id: gatePostMat.id,
              name: `${gatePostMat.name} (Gate Post)`,
              qty: gatePostCountForRun,
              unit: gatePostMat.unit,
              unitCost: gatePostMat.cost,
              priceSource: gatePostMat.priceSource,
              total: cost,
              category: 'Structure'
            });
          }
        }
      }

      // Hinge Posts (1' deeper) for Wood Fence
      if (hingePostCount > 0 && runStyle.type === 'Wood') {
        const hingeId = run.height === 8 ? 'w-post-metal-12' : 'w-post-metal-9';
        const hingeMat = materials.find(m => m.id === hingeId);
        if (hingeMat) {
          const cost = hingePostCount * hingeMat.cost;
          runFenceMaterialCost += cost;
          runItems.push({
            id: hingeMat.id,
            name: `${hingeMat.name} (Gate Hinge)`,
            qty: hingePostCount,
            unit: hingeMat.unit,
            unitCost: hingeMat.cost,
            priceSource: hingeMat.priceSource,
            total: cost,
            category: 'Structure'
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
        const concreteQty = Math.ceil(runPostCount * bagsPerPost);
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
          category: 'Infill',
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
      const hasBottomRail = run.hasBottomRail && isCommercial;
      const height = run.height || 6;

      // Mesh
      const meshGrade = isCommercial ? 'comm' : 'res';
      const meshMat = materials.find(m => m.id === `cl-mesh-${meshGrade}-${height}`) || materials.find(m => m.id === `cl-mesh-${meshGrade}-6`) || materials[0];
      const meshCost = runLF * meshMat.cost;
      runFenceMaterialCost += meshCost;
      runItems.push({
        id: meshMat.id,
        name: meshMat.name,
        qty: runLF,
        unit: meshMat.unit,
        unitCost: meshMat.cost,
        total: meshCost,
        category: 'Infill'
      });

      // Top Rail
      const railId = isCommercial ? 'cl-rail-top-comm' : 'cl-rail-top';
      const topRailMat = materials.find(m => m.id === railId) || materials[0];
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
      // Dome Caps (1 per 2-3/8" Post)
      const terminalCount = (runCornerPosts + startEndPosts) + (run.gateDetails?.length * 2 || 0);
      const domeCapMat = materials.find(m => m.id === 'cl-hw-dome-238');
      if (domeCapMat && terminalCount > 0) {
        const dcCost = terminalCount * domeCapMat.cost;
        runFenceMaterialCost += dcCost;
        runItems.push({ id: domeCapMat.id, name: domeCapMat.name, qty: terminalCount, unit: 'each', unitCost: domeCapMat.cost, total: dcCost, category: 'Hardware' });
      }

      // Loop Caps (1 per Line Post - 1-7/8" Comm, 1-5/8" Res)
      const loopCapId = isCommercial ? 'cl-hw-loop-178' : 'cl-hw-loop-158';
      const loopCapMat = materials.find(m => m.id === loopCapId);
      if (loopCapMat && runLinePosts > 0) {
        const lcCost = runLinePosts * loopCapMat.cost;
        runFenceMaterialCost += lcCost;
        runItems.push({ id: loopCapMat.id, name: loopCapMat.name, qty: runLinePosts, unit: 'each', unitCost: loopCapMat.cost, total: lcCost, category: 'Hardware' });
      }

      // Tension Bars (2 per fence run)
      const tensionBarId = `cl-hw-tension-bar-${height}`;
      const barMat = materials.find(m => m.id === tensionBarId) || materials.find(m => m.id === 'cl-hw-tension-bar-6');
      if (barMat) {
        const barQty = 2;
        const barCost = barQty * barMat.cost;
        runFenceMaterialCost += barCost;
        runItems.push({ id: barMat.id, name: barMat.name, qty: barQty, unit: 'each', unitCost: barMat.cost, total: barCost, category: 'Hardware' });
      }

      // Tension Bands (1 per 1' of height per bar - 2 3/8")
      const tensionBandMat = materials.find(m => m.id === 'cl-hw-tension-band-238');
      if (tensionBandMat) {
        const bandQty = height * 2;
        const bandCost = bandQty * tensionBandMat.cost;
        runFenceMaterialCost += bandCost;
        runItems.push({ id: tensionBandMat.id, name: tensionBandMat.name, qty: bandQty, unit: 'each', unitCost: tensionBandMat.cost, total: bandCost, category: 'Hardware' });
      }

      // Brace Bands (4 per fence run - 2 3/8")
      const braceBandMat = materials.find(m => m.id === 'cl-hw-brace-band-238');
      if (braceBandMat) {
        const bbQty = 4;
        const bbCost = bbQty * braceBandMat.cost;
        runFenceMaterialCost += bbCost;
        runItems.push({ id: braceBandMat.id, name: braceBandMat.name, qty: bbQty, unit: 'each', unitCost: braceBandMat.cost, total: bbCost, category: 'Hardware' });
      }

      // Rail End Cups (2 per fence run)
      const cupId = isCommercial ? 'cl-hw-cup-comm' : 'cl-hw-cup-res';
      const cupMat = materials.find(m => m.id === cupId);
      if (cupMat) {
        const cupQty = 2;
        const cupCost = cupQty * cupMat.cost;
        runFenceMaterialCost += cupCost;
        runItems.push({ id: cupMat.id, name: cupMat.name, qty: cupQty, unit: 'each', unitCost: cupMat.cost, total: cupCost, category: 'Hardware' });
      }

      // Rail EZ Ties (1 per 2 LF) - 1-5/8" Comm, 1-3/8" Res
      const railTieId = isCommercial ? 'cl-hw-ez-tie-158' : 'cl-hw-ez-tie-138';
      const railTieMat = materials.find(m => m.id === railTieId);
      if (railTieMat) {
        const tieQty = Math.ceil(runLF / 2);
        const tieCost = tieQty * railTieMat.cost;
        runFenceMaterialCost += tieCost;
        runItems.push({ id: railTieMat.id, name: railTieMat.name, qty: tieQty, unit: 'each', unitCost: railTieMat.cost, total: tieCost, category: 'Hardware' });
      }

      // Post EZ Ties (1 per 1' of height x total number of line posts) - 1-7/8" Comm, 1-5/8" Res
      const postTieId = isCommercial ? 'cl-hw-ez-tie-178' : 'cl-hw-ez-tie-158';
      const postTieMat = materials.find(m => m.id === postTieId);
      if (postTieMat) {
        const tieQty = height * runLinePosts;
        const tieCost = tieQty * postTieMat.cost;
        runFenceMaterialCost += tieCost;
        runItems.push({ id: postTieMat.id, name: postTieMat.name, qty: tieQty, unit: 'each', unitCost: postTieMat.cost, total: tieCost, category: 'Hardware' });
      }

      // Hog Rings (1 for every 2 LF)
      const hogRingMat = materials.find(m => m.id === 'cl-hw-hog-ring');
      if (hogRingMat) {
        const hrQty = Math.ceil(runLF / 2);
        const hrCost = hrQty * hogRingMat.cost;
        runFenceMaterialCost += hrCost;
        runItems.push({ id: hogRingMat.id, name: hogRingMat.name, qty: hrQty, unit: 'each', unitCost: hogRingMat.cost, total: hrCost, category: 'Hardware' });
      }

      // Tension Wire OR Bottom Rail
      if (hasBottomRail) {
        const bottomRailMat = materials.find(m => m.id === 'cl-rail-bottom') || materials[0];
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
        const boulevardMat = materials.find(m => m.id === 'cl-hw-boulevard');
        if (boulevardMat) {
          const bQty = runLinePosts;
          const bCost = bQty * boulevardMat.cost;
          runFenceMaterialCost += bCost;
          runItems.push({
            id: boulevardMat.id,
            name: boulevardMat.name,
            qty: bQty,
            unit: 'each',
            unitCost: boulevardMat.cost,
            total: bCost,
            category: 'Hardware'
          });
        }
      } else {
        // Tension Wire (Commercial uses LF match)
        const tensionMat = materials.find(m => m.id === 'cl-tension-wire');
        if (tensionMat) {
          const tensionCost = runLF * tensionMat.cost;
          runFenceMaterialCost += tensionCost;
          runItems.push({
            id: tensionMat.id,
            name: tensionMat.name,
            qty: runLF,
            unit: tensionMat.unit,
            unitCost: tensionMat.cost,
            total: tensionCost,
            category: 'Hardware'
          });
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
        category: 'Infill',
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
      const isSideBySide = run.visualStyleId === 'w-side';
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
      height: run.height || estimate.defaultHeight || 6,
      railCount: (run.height === 8 ? 4 : 3),
      hasRotBoard: !!(run.hasRotBoard ?? estimate.hasRotBoard),
      topStyle: run.topStyle || estimate.topStyle || 'Dog Ear',
      hasTopCap: !!estimate.hasTopCap,
      hasTrim: !!estimate.hasCapAndTrim,
      woodType: run.woodType || estimate.woodType,
      stainSides: run.stainSides,
      picketStyle: (run.visualStyleId === 'w-bob') ? 'Board on Board' : (run.visualStyleId === 'w-side' ? 'Side by Side' : run.visualStyleId),
      chainLinkGrade: run.chainLinkGrade || (runStyle.type === 'Chain Link' ? 'Residential' : undefined),
      hasBottomRail: run.hasBottomRail,
      ironInstallType: run.ironInstallType || estimate.ironInstallType,
      ironPanelType: run.ironPanelType || estimate.ironPanelType,
      items: runItems,
      fenceMaterialCost: runFenceMaterialCost,
      fenceLaborCost: runFenceLaborCost,
      gateMaterialCost: runGateMaterialCost,
      gateLaborCost: runGateLaborCost,
      demoCharge: runDemoCharge,
      gates: runGates
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
      if (qty === 0) return;
      
      const mat = materials.find(m => m.id === key || m.name === key);
      if (mat) {
        const unitCost = estimate.manualPrices?.[key] ?? mat.cost;
        manualSummary.push({
          id: mat.id,
          name: mat.name,
          qty,
          unit: mat.unit,
          unitCost,
          priceSource: mat.priceSource,
          total: qty * unitCost,
          category: mat.category
        });
      }
    });
  }

  const allItems = [...calculatedSummary, ...manualSummary];

  // Add delivery fee as labor item
  const deliveryFee = estimate.deliveryFee ?? laborRates.deliveryFee ?? 50;
  if (deliveryFee > 0) {
    allItems.push({
      id: 'labor-delivery',
      name: 'Delivery Fee',
      qty: 1,
      unit: 'job',
      unitCost: deliveryFee,
      total: deliveryFee,
      category: 'Labor'
    });
  }

  // Add custom labor items
  if (estimate.customLaborItems) {
    estimate.customLaborItems.forEach(item => {
      allItems.push({
        id: item.id,
        name: item.name,
        qty: 1,
        unit: 'each',
        unitCost: item.cost,
        total: item.cost,
        category: 'Labor'
      });
    });
  }

  // Re-calculate totals based on ALL items
  totalMaterial = allItems.filter(i => i.category !== 'Labor' && i.category !== 'Demolition' && i.category !== 'SitePrep').reduce((sum, i) => sum + i.total, 0);
  totalLabor = allItems.filter(i => i.category === 'Labor').reduce((sum, i) => sum + i.total, 0);
  totalDemo = allItems.filter(i => i.category === 'Demolition').reduce((sum, i) => sum + i.total, 0);
  totalPrep = allItems.filter(i => i.category === 'SitePrep').reduce((sum, i) => sum + i.total, 0);
  
  const subtotal = totalMaterial + totalLabor + totalDemo + totalPrep;
  const markup = subtotal * ((estimate.markupPercentage || 0) / 100);
  const tax = totalMaterial * ((estimate.taxPercentage || 0) / 100);
  
  // deliveryFee is now included in totalLabor and subtotal
  const grandTotal = subtotal + markup + tax;

  return {
    summary: allItems.filter(i => !manualSummary.find(m => m.id === i.id)), // filter back to calculated
    manualSummary: manualSummary,
    runs: detailedRuns,
    pipeCuttingSummary,
    totals: {
      material: totalMaterial,
      labor: totalLabor,
      demo: totalDemo,
      prep: totalPrep,
      subtotal,
      markup,
      tax,
      grandTotal
    }
  };
}
