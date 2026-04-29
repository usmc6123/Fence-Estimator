import { MaterialItem, LaborRates, Estimate, FenceRun, GateDetail } from '../types';
import { FENCE_STYLES } from '../constants';

export interface TakeOffItem {
  id: string;
  name: string;
  qty: number;
  unit: string;
  unitCost: number;
  total: number;
  category: string;
}

export interface RunTakeOff {
  runId: string;
  runName: string;
  linearFeet: number;
  netLF: number;
  styleName: string;
  items: TakeOffItem[];
  fenceMaterialCost: number;
  fenceLaborCost: number;
  gateMaterialCost: number;
  gateLaborCost: number;
  demoCharge: number;
  gates: {
    gateId: string;
    type: string;
    width: number;
    items: TakeOffItem[];
  }[];
}

export interface DetailedTakeOff {
  summary: TakeOffItem[];
  runs: RunTakeOff[];
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
      total: lf * materialCostPerLF,
      category: 'Infill'
    });

    addToSummary({
      id: 'global-labor',
      name: `Fence Installation (Bulk)`,
      qty: lf,
      unit: 'lf',
      unitCost: laborCostPerLF,
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
        total: estimate.gateCount * gateCost,
        category: 'Gate'
      });
    }
  }

  const wasteFactor = 1 + (estimate.wastePercentage === undefined ? 10 : estimate.wastePercentage) / 100;

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
    const railMat = materials.find(m => m.id === railId)!;

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
        const gateItems: TakeOffItem[] = [];
        
        if (runStyle.type === 'Wood') {
          if (gate.type === 'Double') {
            // Double 6' Drive Gate
            const sharkKit = materials.find(m => m.id === 'g-kit-shark')!;
            gateItems.push({
              id: sharkKit.id,
              name: sharkKit.name,
              qty: 1,
              unit: sharkKit.unit,
              unitCost: sharkKit.cost,
              total: sharkKit.cost,
              category: 'Gate'
            });

            // Add (2) Cane Bolts for double gates
            const caneBoltMat = materials.find(m => m.id === 'h-cane-bolt');
            if (caneBoltMat) {
              gateItems.push({
                id: caneBoltMat.id,
                name: caneBoltMat.name,
                qty: 2,
                unit: caneBoltMat.unit,
                unitCost: caneBoltMat.cost,
                total: 2 * caneBoltMat.cost,
                category: 'Hardware'
              });
            }
          } else {
            // 4' Walk Gate
            const hingeKit = materials.find(m => m.id === 'g-kit-3-hinge')!;
            gateItems.push({
              id: hingeKit.id,
              name: hingeKit.name,
              qty: 1,
              unit: hingeKit.unit,
              unitCost: hingeKit.cost,
              total: hingeKit.cost,
              category: 'Gate'
            });
            
            // Add (2) 2x4x12's
            gateItems.push({
              id: railMat.id,
              name: `${railMat.name} (Gate Bracing)`,
              qty: 2,
              unit: 'each',
              unitCost: railMat.cost,
              total: 2 * railMat.cost,
              category: 'Structure'
            });
          }
        } else {
          // Fallback for non-wood styles
          const gateMat = materials.find(m => m.category === 'Gate' && m.id === estimate.gateStyleId) || materials.find(m => m.category === 'Gate')!;
          gateItems.push({
            id: gateMat.id,
            name: gateMat.name,
            qty: 1,
            unit: gateMat.unit,
            unitCost: gateMat.cost,
            total: gateMat.cost,
            category: 'Gate'
          });

          const latchMat = materials.find(m => m.id === 'g-latch-grav');
          if (latchMat) {
            gateItems.push({
              id: latchMat.id,
              name: latchMat.name,
              qty: 1,
              unit: latchMat.unit,
              unitCost: latchMat.cost,
              total: latchMat.cost,
              category: 'Hardware'
            });
          }

          if (gate.type === 'Double') {
            const sharkKit = materials.find(m => m.id === 'g-kit-shark');
            if (sharkKit) {
              gateItems.push({
                id: sharkKit.id,
                name: sharkKit.name,
                qty: 1,
                unit: sharkKit.unit,
                unitCost: sharkKit.cost,
                total: sharkKit.cost,
                category: 'Hardware'
              });
            }

            // Add (2) Cane Bolts for double gates
            const caneBoltMat = materials.find(m => m.id === 'h-cane-bolt');
            if (caneBoltMat) {
              gateItems.push({
                id: caneBoltMat.id,
                name: caneBoltMat.name,
                qty: 2,
                unit: caneBoltMat.unit,
                unitCost: caneBoltMat.cost,
                total: 2 * caneBoltMat.cost,
                category: 'Hardware'
              });
            }
          }
        }

        runGates.push({
          gateId: gate.id,
          type: gate.type,
          width: gate.width || 4,
          items: gateItems
        });

        let gateLaborAmount = 0;
        let gateLaborName = '';

        if (runStyle.type === 'Wood') {
          gateLaborAmount = gate.type === 'Double' ? laborRates.gateWoodDrive : laborRates.gateWoodWalk;
          gateLaborName = `Gate Install (${gate.type} Wood)`;
        } else {
          gateLaborAmount = laborRates.gateWeldedFrame;
          gateLaborName = `Gate Install (Welded Frame)`;
        }

        runGateLaborCost += gateLaborAmount;
        
        gateItems.push({
          id: `labor-gate-${gate.id}`,
          name: gateLaborName,
          qty: 1,
          unit: 'each',
          unitCost: gateLaborAmount,
          total: gateLaborAmount,
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
    const maxSpacing = (runStyle.type === 'Wood' && run.height === 8) ? 6 : 8;
    
    const runLinePosts = Math.max(0, Math.ceil(runLF / maxSpacing) - 1);
    const runCornerPosts = (idx === runs.length - 1) ? 0 : 1;
    const startEndPosts = (idx === 0 ? 1 : 0) + (idx === runs.length - 1 ? 1 : 0);
    const runPostCount = runLinePosts + runCornerPosts + startEndPosts;
    
    let pipeGatePostCount = 0;
    if (runStyle.type === 'Pipe' && run.gateDetails) {
      pipeGatePostCount = run.gateDetails.length * 2;
    }

    const stdPostCount = runStyle.type === 'Pipe' 
      ? Math.max(0, runPostCount - pipeGatePostCount)
      : Math.max(0, runPostCount - hingePostCount);

    if (!run.reusePosts) {
      // Standard Posts
      if (stdPostCount > 0) {
        let postMat = materials.find(m => m.category === 'Post' && m.id.startsWith(runStyle.type.toLowerCase().charAt(0))) || materials[0];
        if (runStyle.type === 'Wood') {
          postMat = materials.find(m => m.id === (run.height === 8 ? 'w-post-metal-11' : 'w-post-metal-8')) || postMat;
        } else if (runStyle.type === 'Pipe') {
          const postHeight = (run.height || 4) + 2;
          postMat = materials.find(m => m.id === `p-post-238-${postHeight}`) || postMat;
        }

        const cost = stdPostCount * postMat.cost;
        runFenceMaterialCost += cost;
        runItems.push({
          id: postMat.id,
          name: postMat.name,
          qty: stdPostCount,
          unit: postMat.unit,
          unitCost: postMat.cost,
          total: cost,
          category: 'Structure'
        });
      }

      // Gate Posts for Pipe Fence
      if (runStyle.type === 'Pipe' && pipeGatePostCount > 0) {
        const postHeight = (run.height || 4) + 3;
        const gatePostMat = materials.find(m => m.id === `p-post-238-${postHeight}`)!;
        const cost = pipeGatePostCount * gatePostMat.cost;
        runFenceMaterialCost += cost;
        runItems.push({
          id: gatePostMat.id,
          name: `${gatePostMat.name} (Gate Post)`,
          qty: pipeGatePostCount,
          unit: gatePostMat.unit,
          unitCost: gatePostMat.cost,
          total: cost,
          category: 'Structure'
        });
      }

      // Hinge Posts (1' deeper) for Wood Fence
      if (hingePostCount > 0 && runStyle.type === 'Wood') {
        const hingeId = run.height === 8 ? 'w-post-metal-12' : 'w-post-metal-9';
        const hingeMat = materials.find(m => m.id === hingeId)!;
        const cost = hingePostCount * hingeMat.cost;
        runFenceMaterialCost += cost;
        runItems.push({
          id: hingeMat.id,
          name: `${hingeMat.name} (Gate Hinge)`,
          qty: hingePostCount,
          unit: hingeMat.unit,
          unitCost: hingeMat.cost,
          total: cost,
          category: 'Structure'
        });
      }

      // Post Caps
      const capId = runStyle.type === 'Pipe' ? 'pc-dome' : (estimate.topStyle === 'Flat Top' ? 'pc-flat' : 'pc-dome');
      const capMat = materials.find(m => m.id === capId) || materials.find(m => m.id === 'pc-dome')!;
      
      // Post caps will only be used at end posts, corner posts, and gate posts for Pipe Fence
      const capQty = runStyle.type === 'Pipe' 
        ? Math.max(0, (runPostCount - runLinePosts) + pipeGatePostCount) 
        : runPostCount;

      if (capQty > 0) {
        const capCost = capQty * capMat.cost;
        runFenceMaterialCost += capCost;
        runItems.push({
          id: capMat.id,
          name: capMat.name,
          qty: capQty,
          unit: capMat.unit,
          unitCost: capMat.cost,
          total: capCost,
          category: 'Hardware'
        });
      }

      // Concrete Calculation
      const runConcreteType = run.concreteType || estimate.concreteType || 'Maximizer';
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

      const concreteMat = materials.find(m => m.id === concreteMatId) || materials.find(m => m.id === 'i-concrete-80')!;
      const concreteQty = Math.ceil(runPostCount * bagsPerPost);
      const concreteCost = concreteQty * concreteMat.cost;
      runFenceMaterialCost += concreteCost;
      runItems.push({
        id: concreteMat.id,
        name: concreteMat.name,
        qty: concreteQty,
        unit: concreteMat.unit,
        unitCost: concreteMat.cost,
        total: concreteCost,
        category: 'Installation'
      });
    }

    // Pickets
    let panelMat = materials.find(m => (m.category === 'Panel' || m.category === 'Picket') && m.id.startsWith(runStyle.type.toLowerCase().charAt(0))) || materials[0];
    let panelQty = 0;
    let skipGenericInfill = false;
    
    if (runStyle.type === 'Wood') {
      const totalInches = runLF * 12; // Use total run linear feet (including gates) for picket count
      const isBob = run.visualStyleId === 'w-bob';
      
      if (isBob) {
        // Board on Board: Two layers, boards in each layer spaced with a 3.5" gap.
        // Total = 1 board per 4.5 inches.
        panelQty = Math.ceil((totalInches / 4.5) * wasteFactor);
      } else {
        // Side by Side: Exactly total inches / 5.5" then add waste
        panelQty = Math.ceil((totalInches / 5.5) * wasteFactor);
      }
      
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
    } else {
      panelQty = Math.ceil((netLF / 8) * wasteFactor);
      if (runStyle.type === 'Metal') {
        if (run.height === 4) panelMat = materials.find(m => m.id === 'm-panel-4x8') || panelMat;
        else if (run.height === 5) panelMat = materials.find(m => m.id === 'm-panel-5x8') || panelMat;
        else panelMat = materials.find(m => m.id === 'm-panel-std') || panelMat;
      } else if (runStyle.type === 'Pipe') {
        skipGenericInfill = true;
      }
    }
    
    if (!skipGenericInfill) {
      const panelUnitCost = panelMat.cost; 
      const panelName = runStyle.type === 'Metal' 
        ? `${run.height}'x8' Wrought Iron ${runVisualStyle.name}` 
        : panelMat.name;

      const panelTotalCost = panelQty * panelUnitCost;
      runFenceMaterialCost += panelTotalCost;
      runItems.push({
        id: panelMat.id,
        name: panelName,
        qty: panelQty,
        unit: panelMat.unit,
        unitCost: panelUnitCost,
        total: panelTotalCost,
        category: 'Infill'
      });

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

    // Brackets and Lags for 6' Wood
    if (is6ftWood) {
      const bracketMat = materials.find(m => m.id === 'h-bracket-w')!;
      const bracketQty = runPostCount * 4;
      const bracketCost = bracketQty * bracketMat.cost;
      runFenceMaterialCost += bracketCost;
      runItems.push({
        id: bracketMat.id,
        name: bracketMat.name,
        qty: bracketQty,
        unit: bracketMat.unit,
        unitCost: bracketMat.cost,
        total: bracketCost,
        category: 'Hardware'
      });

      const lagMat = materials.find(m => m.id === 'h-lag-14')!;
      const lagQty = bracketQty * 4;
      const lagCost = lagQty * lagMat.cost;
      runFenceMaterialCost += lagCost;
      runItems.push({
        id: lagMat.id,
        name: lagMat.name,
        qty: lagQty,
        unit: lagMat.unit,
        unitCost: lagMat.cost,
        total: lagCost,
        category: 'Hardware'
      });

      // Rails and Rot Board (8ft rails, 16ft rot board for 6ft Wood)
      const sectionCount8 = Math.ceil(runLF / 8);
      const sectionCount16 = Math.ceil(runLF / 16);
      let railId = isStained ? 'w-rail-pine-8-stained' : 'w-rail-pine-8';
      if (woodType === 'Japanese Cedar') railId = isStained ? 'w-rail-j-cedar-8-stained' : 'w-rail-j-cedar-8';
      else if (woodType === 'Western Red Cedar') railId = isStained ? 'w-rail-w-cedar-8-stained' : 'w-rail-w-cedar-8';
      
      const railMat = materials.find(m => m.id === railId)!;
      const railQty = sectionCount8 * 3;
      const railCost = railQty * railMat.cost;
      runFenceMaterialCost += railCost;
      runItems.push({
        id: railMat.id,
        name: railMat.name,
        qty: railQty,
        unit: railMat.unit,
        unitCost: railMat.cost,
        total: railCost,
        category: 'Structure'
      });

      const rotBoardId = isStained ? 'w-rot-board-16-stained' : 'w-rot-board-16';
      const rotBoardMat = materials.find(m => m.id === rotBoardId)!;
      const rotBoardCost = sectionCount16 * rotBoardMat.cost;
      runFenceMaterialCost += rotBoardCost;
      runItems.push({
        id: rotBoardMat.id,
        name: rotBoardMat.name,
        qty: sectionCount16,
        unit: rotBoardMat.unit,
        unitCost: rotBoardMat.cost,
        total: rotBoardCost,
        category: 'Structure'
      });

      // Nails for this run
      const nailsMat = materials.find(m => m.id === 'h-nail-galv')!;
      const nailCount = Math.ceil(panelQty * 6);
      const nailCost = nailCount * nailsMat.cost;
      runFenceMaterialCost += nailCost;
      runItems.push({
        id: nailsMat.id,
        name: nailsMat.name,
        qty: nailCount,
        unit: 'nails',
        unitCost: nailsMat.cost,
        total: nailCost,
        category: 'Hardware'
      });
    }

    // Brackets and Rails (Fallback for non-6ft Wood)
    if (runStyle.type === 'Wood' && !is6ftWood) {
      const bracketMat = materials.find(m => m.id === 'h-bracket-w')!;
      const railsCount = run.height === 8 ? 4 : (run.height > 6 ? 4 : 3);
      const bracketCount = run.height === 8 ? 5 : (run.height > 6 ? 4 : 3);
      
      const bracketQty = runPostCount * bracketCount;
      const bracketCost = bracketQty * bracketMat.cost;
      runFenceMaterialCost += bracketCost;
      runItems.push({
        id: bracketMat.id,
        name: bracketMat.name,
        qty: bracketQty,
        unit: bracketMat.unit,
        unitCost: bracketMat.cost,
        total: bracketCost,
        category: 'Hardware'
      });

      // Rails and Rot Boards for non-6ft
      const sectionCount12 = Math.ceil(runLF / 12);
      
      let railId = isStained ? 'w-rail-pine-12-stained' : 'w-rail-pine-12';
      if (woodType === 'Japanese Cedar') railId = isStained ? 'w-rail-j-cedar-12-stained' : 'w-rail-j-cedar-12';
      else if (woodType === 'Western Red Cedar') railId = isStained ? 'w-rail-w-cedar-12-stained' : 'w-rail-w-cedar-12';
      
      const railMat = materials.find(m => m.id === railId)!;
      const railQty = sectionCount12 * railsCount;
      const railCost = railQty * railMat.cost;
      runFenceMaterialCost += railCost;
      runItems.push({
        id: railMat.id,
        name: railMat.name,
        qty: railQty,
        unit: railMat.unit,
        unitCost: railMat.cost,
        total: railCost,
        category: 'Structure'
      });

      const is8ftWood = run.height === 8;
      const rotBoardId = is8ftWood 
        ? (isStained ? 'w-rot-board-12-stained' : 'w-rot-board-12')
        : (isStained ? 'w-rot-board-16-stained' : 'w-rot-board-16');
      const rotBoardMat = materials.find(m => m.id === rotBoardId)!;
      const rotBoardQty = is8ftWood ? Math.ceil(runLF / 12) : Math.ceil(runLF / 16);
      const rotBoardCost = rotBoardQty * rotBoardMat.cost;
      runFenceMaterialCost += rotBoardCost;
      runItems.push({
        id: rotBoardMat.id,
        name: rotBoardMat.name,
        qty: rotBoardQty,
        unit: rotBoardMat.unit,
        unitCost: rotBoardMat.cost,
        total: rotBoardCost,
        category: 'Structure'
      });

      // Lags and Nails for non-6ft Wood
      const lagMat = materials.find(m => m.id === 'h-lag-14')!;
      const lagQty = bracketQty * 4;
      const lagCost = lagQty * lagMat.cost;
      runFenceMaterialCost += lagCost;
      runItems.push({
        id: lagMat.id,
        name: lagMat.name,
        qty: lagQty,
        unit: lagMat.unit,
        unitCost: lagMat.cost,
        total: lagCost,
        category: 'Hardware'
      });

      const nailsMat = materials.find(m => m.id === 'h-nail-galv')!;
      const nailCount = Math.ceil(panelQty * 6);
      const nailCost = nailCount * nailsMat.cost;
      runFenceMaterialCost += nailCost;
      runItems.push({
        id: nailsMat.id,
        name: nailsMat.name,
        qty: nailCount,
        unit: 'nails',
        unitCost: nailsMat.cost,
        total: nailCost,
        category: 'Hardware'
      });
    }

    // Optional Items (Trim, Cap)
    if (is6ftWood) {
       if (estimate.hasCapAndTrim) {
          // Top Trim (1x4x8)
          const trimMat = materials.find(m => m.id === 'f-cap-trim')!;
          const trimQty = Math.ceil(runLF / 8);
          const trimCost = trimQty * trimMat.cost;
          runFenceMaterialCost += trimCost;
          runItems.push({
            id: trimMat.id,
            name: trimMat.name,
            qty: trimQty,
            unit: 'each',
            unitCost: trimMat.cost,
            total: trimCost,
            category: 'Finishing'
          });
       }

       if (estimate.hasDoubleTrim) {
          // Double Trim (1x2x8)
          const doubleTrimMat = materials.find(m => m.id === 'f-double-trim-1x2')!;
          const trimQty = Math.ceil(runLF / 8);
          const trimCost = trimQty * doubleTrimMat.cost;
          runFenceMaterialCost += trimCost;
          runItems.push({
            id: doubleTrimMat.id,
            name: doubleTrimMat.name,
            qty: trimQty,
            unit: 'each',
            unitCost: doubleTrimMat.cost,
            total: trimCost,
            category: 'Finishing'
          });
       }

       if (estimate.hasTopCap) {
          // Top Cap (2x6x12)
          const topCapMat = materials.find(m => m.id === 'f-top-cap-2x6')!;
          const topCapQty = Math.ceil(runLF / 12);
          const topCapCost = topCapQty * topCapMat.cost;
          runFenceMaterialCost += topCapCost;
          runItems.push({
            id: topCapMat.id,
            name: topCapMat.name,
            qty: topCapQty,
            unit: 'each',
            unitCost: topCapMat.cost,
            total: topCapCost,
            category: 'Finishing'
          });
       }
    }

    if (runStyle.type === 'Pipe') {
      // 2 3/8" top rail- equal to overall length of fence
      const railMat = materials.find(m => m.id === 'p-rail-238')!;
      const railCost = runLF * railMat.cost;
      runFenceMaterialCost += railCost;
      runItems.push({
        id: railMat.id,
        name: railMat.name,
        qty: runLF,
        unit: railMat.unit,
        unitCost: railMat.cost,
        total: railCost,
        category: 'Structure'
      });

      // 2 3/8" EZ ties- 12 for every 8 linear feet of fence
      const tieMat = materials.find(m => m.id === 'p-ez-tie')!;
      const tieQty = Math.ceil((runLF / 8) * 12);
      const tieCost = tieQty * tieMat.cost;
      runFenceMaterialCost += tieCost;
      runItems.push({
        id: tieMat.id,
        name: tieMat.name,
        qty: tieQty,
        unit: tieMat.unit,
        unitCost: tieMat.cost,
        total: tieCost,
        category: 'Hardware'
      });

      // No climb horse fence - Use 200' and 100' rolls
      const selectedColor = run.color || estimate.defaultColor || 'Black';
      const finish = selectedColor.toLowerCase().includes('black') ? 'black' : 'galv';
      
      // Ensure height is 4, 5, or 6 for the ID mapping
      let height = run.height || 4;
      if (height !== 4 && height !== 5 && height !== 6) {
        height = height < 5 ? 4 : (height < 6 ? 5 : 6);
      }
      
      const wire200Id = `p-wire-${height}-200-${finish}`;
      const wire100Id = `p-wire-${height}-100-${finish}`;
      
      const wire200Mat = materials.find(m => m.id === wire200Id)!;
      const wire100Mat = materials.find(m => m.id === wire100Id)!;
      
      const rolls200 = Math.floor(runLF / 200);
      const remainingLF = runLF % 200;
      const rolls100 = remainingLF > 0 ? Math.ceil(remainingLF / 100) : 0;
      
      if (rolls200 > 0) {
        const cost = rolls200 * wire200Mat.cost;
        runFenceMaterialCost += cost;
        runItems.push({
          id: wire200Mat.id,
          name: wire200Mat.name,
          qty: rolls200,
          unit: 'each',
          unitCost: wire200Mat.cost,
          total: cost,
          category: 'Infill'
        });
      }
      
      if (rolls100 > 0) {
        const cost = rolls100 * wire100Mat.cost;
        runFenceMaterialCost += cost;
        runItems.push({
          id: wire100Mat.id,
          name: wire100Mat.name,
          qty: rolls100,
          unit: 'each',
          unitCost: wire100Mat.cost,
          total: cost,
          category: 'Infill'
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
      if (estimate.hasCapAndTrim) runLaborRate += laborRates.topCap;
    } else if (runStyle.type === 'Metal') {
      runLaborRate = (run.ironInstallType === 'Weld up') ? laborRates.ironWeldUp : laborRates.ironBoltUp;
    } else if (runStyle.type === 'Chain Link') {
      runLaborRate = laborRates.chainLink;
    } else {
      runLaborRate = laborRates.pipeFence;
    }

    const runFenceLaborCost = netLF * runLaborRate;
    
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

    const laborTotal = runFenceLaborCost + runGateLaborCost;
    totalLabor += laborTotal;

    runItems.forEach(i => {
      if (i.category === 'Labor') {
        // Already handled by totalLabor += laborTotal at 762
      } else if (i.category === 'Demolition') {
        // Already handled by totalDemo += demoCost at 746
      } else {
        totalMaterial += i.total;
      }
      addToSummary(i);
    });

    detailedRuns.push({
      runId: run.id,
      runName: run.name,
      linearFeet: runLF,
      netLF,
      styleName: runStyle.name,
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
  let totalPipeBlackLF = 0;
  let hasAnyPipe = false;

  detailedRuns.forEach((r, idx) => {
    const run = runs[idx];
    const style = FENCE_STYLES.find(s => s.id === run.styleId);
    if (style?.type === 'Pipe') {
      hasAnyPipe = true;
      const selectedColor = run.color || estimate.defaultColor || 'Black';
      if (selectedColor.toLowerCase().includes('black')) {
        totalPipeBlackLF += run.linearFeet;
      }
    }
  });

  if (hasAnyPipe) {
    const domeCapMat = materials.find(m => m.id === 'pc-dome')!;
    addToSummary({
      id: domeCapMat.id,
      name: `${domeCapMat.name} (Project Extra)`,
      qty: 1,
      unit: domeCapMat.unit,
      unitCost: domeCapMat.cost,
      total: domeCapMat.cost,
      category: 'Hardware'
    });
    totalMaterial += domeCapMat.cost;
  }

  if (totalPipeBlackLF > 0) {
    const paintMat = materials.find(m => m.id === 'p-paint-gal')!;
    const paintQty = Math.max(1, Math.ceil(totalPipeBlackLF / 200));
    const paintCost = paintQty * paintMat.cost;
    addToSummary({
      id: paintMat.id,
      name: paintMat.name,
      qty: paintQty,
      unit: paintMat.unit,
      unitCost: paintMat.cost,
      total: paintCost,
      category: 'Finishing'
    });
    totalMaterial += paintCost;
  }

  const globalItems: TakeOffItem[] = [];

  globalItems.forEach(i => {
    totalMaterial += i.total;
    addToSummary(i);
  });

  // Apply manual overrides to summary and totals
  const overriddenSummary = Object.values(summaryMap).map(item => {
    const qty = estimate.manualQuantities?.[item.id] ?? estimate.manualQuantities?.[item.name] ?? item.qty;
    const unitCost = estimate.manualPrices?.[item.id] ?? estimate.manualPrices?.[item.name] ?? item.unitCost;
    return { 
      ...item, 
      qty, 
      unitCost, 
      total: qty * unitCost 
    };
  });

  // Re-calculate totals based on overridden summary
  totalMaterial = overriddenSummary.filter(i => i.category !== 'Labor' && i.category !== 'Demolition' && i.category !== 'SitePrep').reduce((sum, i) => sum + i.total, 0);
  totalLabor = overriddenSummary.filter(i => i.category === 'Labor').reduce((sum, i) => sum + i.total, 0);
  totalDemo = overriddenSummary.filter(i => i.category === 'Demolition').reduce((sum, i) => sum + i.total, 0);
  totalPrep = overriddenSummary.filter(i => i.category === 'SitePrep').reduce((sum, i) => sum + i.total, 0);
  
  const subtotal = totalMaterial + totalLabor + totalDemo + totalPrep;
  const markup = subtotal * ((estimate.markupPercentage || 0) / 100);
  const tax = totalMaterial * ((estimate.taxPercentage || 0) / 100);
  const grandTotal = subtotal + markup + tax;

  return {
    summary: overriddenSummary,
    runs: detailedRuns,
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
