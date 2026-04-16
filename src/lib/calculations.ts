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
  styleName: string;
  items: TakeOffItem[];
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
  const wasteFactor = 1 + (estimate.wastePercentage || 10) / 100;
  
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

  runs.forEach((run, idx) => {
    const runStyle = FENCE_STYLES.find(s => s.id === run.styleId) || FENCE_STYLES[0];
    const logic = runStyle.calcLogic;
    const runLF = run.linearFeet;
    const runVisualStyle = runStyle.visualStyles.find(vs => vs.id === run.visualStyleId) || runStyle.visualStyles[0];

    const runItems: TakeOffItem[] = [];
    const runGates: RunTakeOff['gates'] = [];

    // Posts for run
    let runEndPosts = 0;
    let gateLF = 0;

    // Resolve rail material early for gates
    let railId = 'w-rail-pine-12';
    if (run.woodType === 'Japanese Cedar') railId = 'w-rail-j-cedar-12';
    else if (run.woodType === 'Western Red Cedar') railId = 'w-rail-w-cedar-12';
    const railMat = materials.find(m => m.id === railId)!;

    if (run.gateDetails && run.gateDetails.length > 0) {
      run.gateDetails.forEach(gate => {
        runEndPosts += gate.type === 'Double' ? 2 : 1;
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
          }
        }

        runGates.push({
          gateId: gate.id,
          type: gate.type,
          width: gate.width || 4,
          items: gateItems
        });

        gateItems.forEach(i => {
          totalMaterial += i.total;
          addToSummary(i);
        });
      });
    }

    const netLF = Math.max(0, runLF - gateLF);
    
    // 6' Wood Fence Specific Logic
    const is6ftWood = runStyle.type === 'Wood' && run.height === 6;
    const maxSpacing = is6ftWood ? 6 : ((runStyle.type === 'Wood' && run.height === 8) ? 6 : 8);
    
    const runLinePosts = Math.max(0, Math.ceil(runLF / maxSpacing) - 1);
    const runCornerPosts = (idx === runs.length - 1) ? 0 : 1;
    const startEndPosts = (idx === 0 ? 1 : 0) + (idx === runs.length - 1 ? 1 : 0);
    const runPostCount = runLinePosts + runEndPosts + runCornerPosts + startEndPosts;

    let postMat = materials.find(m => m.category === 'Post' && m.id.startsWith(runStyle.type.toLowerCase().charAt(0))) || materials[0];
    if (runStyle.type === 'Wood') {
      postMat = materials.find(m => m.id === (run.height === 8 ? 'w-post-metal-11' : 'w-post-metal-8')) || postMat;
    }

    runItems.push({
      id: postMat.id,
      name: postMat.name,
      qty: runPostCount,
      unit: postMat.unit,
      unitCost: postMat.cost,
      total: runPostCount * postMat.cost,
      category: 'Structure'
    });

    // Post Caps for Wood Fence
    if (runStyle.type === 'Wood') {
      const capId = estimate.topStyle === 'Flat Top' ? 'pc-flat' : 'pc-dome';
      const capMat = materials.find(m => m.id === capId) || materials.find(m => m.id === 'pc-dome')!;
      runItems.push({
        id: capMat.id,
        name: capMat.name,
        qty: runPostCount,
        unit: capMat.unit,
        unitCost: capMat.cost,
        total: runPostCount * capMat.cost,
        category: 'Hardware'
      });
    }

    // Pickets
    let panelMat = materials.find(m => (m.category === 'Panel' || m.category === 'Picket') && m.id.startsWith(runStyle.type.toLowerCase().charAt(0))) || materials[0];
    let panelQty = 0;
    if (runStyle.type === 'Wood') {
      const isBob = run.visualStyleId === 'w-bob';
      const picketsPerFoot = isBob ? 2.6 : 2.0;
      panelQty = Math.ceil((netLF * picketsPerFoot) * wasteFactor);
      
      if (run.woodType === 'PT Pine') panelMat = materials.find(m => m.id === 'w-picket-pine') || panelMat;
      else if (run.woodType === 'Japanese Cedar') panelMat = materials.find(m => m.id === 'w-picket-j-cedar') || panelMat;
      else if (run.woodType === 'Western Red Cedar') panelMat = materials.find(m => m.id === 'w-picket-w-cedar') || panelMat;
    } else {
      panelQty = Math.ceil((netLF / 8) * wasteFactor);
    }
    
    const panelUnitCost = panelMat.cost + runVisualStyle.priceModifier;
    runItems.push({
      id: panelMat.id,
      name: panelMat.name,
      qty: panelQty,
      unit: panelMat.unit,
      unitCost: panelUnitCost,
      total: panelQty * panelUnitCost,
      category: 'Infill'
    });

    // Brackets and Lags for 6' Wood
    if (is6ftWood) {
      const bracketMat = materials.find(m => m.id === 'h-bracket-w')!;
      const bracketQty = runPostCount * 4;
      runItems.push({
        id: bracketMat.id,
        name: bracketMat.name,
        qty: bracketQty,
        unit: bracketMat.unit,
        unitCost: bracketMat.cost,
        total: bracketQty * bracketMat.cost,
        category: 'Hardware'
      });

      const lagMat = materials.find(m => m.id === 'h-lag-14')!;
      const lagQty = bracketQty * 4;
      runItems.push({
        id: lagMat.id,
        name: lagMat.name,
        qty: lagQty,
        unit: lagMat.unit,
        unitCost: lagMat.cost,
        total: lagQty * lagMat.cost,
        category: 'Hardware'
      });

      // Rails and Rot Board (12ft sections)
      const sectionCount12 = Math.ceil(runLF / 12);
      let railId = 'w-rail-pine-12';
      if (run.woodType === 'Japanese Cedar') railId = 'w-rail-j-cedar-12';
      else if (run.woodType === 'Western Red Cedar') railId = 'w-rail-w-cedar-12';
      
      const railMat = materials.find(m => m.id === railId)!;
      const railQty = sectionCount12 * 3;
      runItems.push({
        id: railMat.id,
        name: railMat.name,
        qty: railQty,
        unit: railMat.unit,
        unitCost: railMat.cost,
        total: railQty * railMat.cost,
        category: 'Structure'
      });

      const rotBoardMat = materials.find(m => m.id === 'w-rot-board-12')!;
      runItems.push({
        id: rotBoardMat.id,
        name: rotBoardMat.name,
        qty: sectionCount12,
        unit: rotBoardMat.unit,
        unitCost: rotBoardMat.cost,
        total: sectionCount12 * rotBoardMat.cost,
        category: 'Structure'
      });

      // Concrete for this run
      const concreteBags = Math.ceil(runPostCount * 0.7);
      const concreteMat = materials.find(m => m.id === 'i-concrete-80')!;
      runItems.push({
        id: concreteMat.id,
        name: concreteMat.name,
        qty: concreteBags,
        unit: concreteMat.unit,
        unitCost: concreteMat.cost,
        total: concreteBags * concreteMat.cost,
        category: 'Installation'
      });

      // Nails for this run
      const nailsMat = materials.find(m => m.id === 'h-nail-galv')!;
      const nailQty = Number(((panelQty * 6) / 2500).toFixed(2)); // Approx 2500 nails per 5lb box
      runItems.push({
        id: nailsMat.id,
        name: nailsMat.name,
        qty: Math.max(0.1, nailQty),
        unit: nailsMat.unit,
        unitCost: nailsMat.cost,
        total: Math.max(0.1, nailQty) * nailsMat.cost,
        category: 'Hardware'
      });
    }

    // Brackets (Fallback for non-6ft)
    if (runStyle.type === 'Wood' && !is6ftWood) {
      const bracketMat = materials.find(m => m.id === 'h-bracket-w')!;
      const bracketQty = Math.ceil(netLF * logic.railsPerLF);
      runItems.push({
        id: bracketMat.id,
        name: bracketMat.name,
        qty: bracketQty,
        unit: bracketMat.unit,
        unitCost: bracketMat.cost,
        total: bracketQty * bracketMat.cost,
        category: 'Hardware'
      });
    }

    // Optional Items (Trim, Cap)
    if (is6ftWood) {
       if (estimate.hasCapAndTrim) {
          // Top Trim (1x4x8)
          const trimMat = materials.find(m => m.id === 'f-cap-trim')!;
          const trimQty = Math.ceil(runLF / 8);
          runItems.push({
            id: trimMat.id,
            name: trimMat.name,
            qty: trimQty,
            unit: 'each',
            unitCost: trimMat.cost,
            total: trimQty * trimMat.cost,
            category: 'Finishing'
          });
       }

       if (estimate.hasDoubleTrim) {
          // Double Trim (1x2x8)
          const doubleTrimMat = materials.find(m => m.id === 'f-double-trim-1x2')!;
          const trimQty = Math.ceil(runLF / 8);
          runItems.push({
            id: doubleTrimMat.id,
            name: doubleTrimMat.name,
            qty: trimQty,
            unit: 'each',
            unitCost: doubleTrimMat.cost,
            total: trimQty * doubleTrimMat.cost,
            category: 'Finishing'
          });
       }

       if (estimate.hasTopCap) {
          // Top Cap (2x6x12)
          const topCapMat = materials.find(m => m.id === 'f-top-cap-2x6')!;
          const topCapQty = Math.ceil(runLF / 12);
          runItems.push({
            id: topCapMat.id,
            name: topCapMat.name,
            qty: topCapQty,
            unit: 'each',
            unitCost: topCapMat.cost,
            total: topCapQty * topCapMat.cost,
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
      if (estimate.hasCapAndTrim) runLaborRate += laborRates.topCap;
    } else if (runStyle.type === 'Metal') {
      runLaborRate = (run.ironInstallType === 'Weld up') ? laborRates.ironWeldUp : laborRates.ironBoltUp;
    } else if (runStyle.type === 'Chain Link') {
      runLaborRate = laborRates.chainLink;
    } else {
      runLaborRate = laborRates.pipeFence;
    }

    let runGateLabor = 0;
    if (run.gateDetails) {
      run.gateDetails.forEach(g => {
        if (runStyle.type === 'Wood') {
          runGateLabor += g.type === 'Double' ? laborRates.gateWoodDrive : laborRates.gateWoodWalk;
        } else {
          runGateLabor += laborRates.gateWeldedFrame;
        }
      });
    }

    const laborTotal = (runLF * runLaborRate) + runGateLabor;
    totalLabor += laborTotal;

    runItems.forEach(i => {
      totalMaterial += i.total;
      addToSummary(i);
    });

    detailedRuns.push({
      runId: run.id,
      runName: run.name,
      linearFeet: runLF,
      styleName: runStyle.name,
      items: runItems,
      gates: runGates
    });
  });

  // Global Items
  const totalLF = detailedRuns.reduce((sum, r) => sum + r.linearFeet, 0);

  const globalItems: TakeOffItem[] = [];

  // Demo
  if (estimate.hasDemolition) {
    const dLF = estimate.demoLinearFeet || totalLF;
    const dumpsterMat = materials.find(m => m.id === 'd-dumpster')!;
    totalDemo += dumpsterMat.cost + 145 + (Math.ceil(dLF / 50) * 14) + (dLF * laborRates.demo);
    
    addToSummary({
      id: 'd-dumpster',
      name: dumpsterMat.name,
      qty: 1,
      unit: 'trip',
      unitCost: dumpsterMat.cost,
      total: dumpsterMat.cost,
      category: 'Demolition'
    });
    addToSummary({
      id: 'labor-demo',
      name: 'Demo Labor',
      qty: dLF,
      unit: 'lf',
      unitCost: laborRates.demo,
      total: dLF * laborRates.demo,
      category: 'Labor'
    });
  }

  globalItems.forEach(i => {
    totalMaterial += i.total;
    addToSummary(i);
  });

  const subtotal = totalMaterial + totalLabor + totalDemo + totalPrep;
  const markup = subtotal * ((estimate.markupPercentage || 0) / 100);
  const tax = (subtotal + markup) * ((estimate.taxPercentage || 0) / 100);
  const grandTotal = subtotal + markup + tax;

  return {
    summary: Object.values(summaryMap),
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
