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
    if (run.gateDetails && run.gateDetails.length > 0) {
      run.gateDetails.forEach(gate => {
        runEndPosts += gate.type === 'Double' ? 2 : 1;
        gateLF += gate.width || 4;
        
        // Gate specific items
        const gateItems: TakeOffItem[] = [];
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
    const maxSpacing = (runStyle.type === 'Wood' && run.height === 8) ? 6 : 8;
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

    // Pickets
    let panelMat = materials.find(m => (m.category === 'Panel' || m.category === 'Picket') && m.id.startsWith(runStyle.type.toLowerCase().charAt(0))) || materials[0];
    let panelQty = 0;
    if (runStyle.type === 'Wood') {
      panelQty = Math.ceil((netLF / 0.458) * wasteFactor);
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

    // Brackets
    if (runStyle.type === 'Wood') {
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
  const totalPostCount = detailedRuns.reduce((sum, r) => sum + r.items.find(i => i.category === 'Structure')?.qty || 0, 0);
  const totalLF = detailedRuns.reduce((sum, r) => sum + r.linearFeet, 0);

  const globalItems: TakeOffItem[] = [];

  // Fasteners
  const fastenerMat = materials.find(m => m.id === 'h-nail-galv')!;
  const fastenerQty = Math.ceil(totalLF / 50);
  globalItems.push({
    id: fastenerMat.id,
    name: fastenerMat.name,
    qty: fastenerQty,
    unit: fastenerMat.unit,
    unitCost: fastenerMat.cost,
    total: fastenerQty * fastenerMat.cost,
    category: 'Hardware'
  });

  // Concrete
  const concreteBags = Math.ceil(totalPostCount * 1.5);
  const concreteMat = materials.find(m => m.id === 'i-concrete-80')!;
  globalItems.push({
    id: concreteMat.id,
    name: concreteMat.name,
    qty: concreteBags,
    unit: concreteMat.unit,
    unitCost: concreteMat.cost,
    total: concreteBags * concreteMat.cost,
    category: 'Installation'
  });

  if (estimate.includeGravel) {
    const gravelMat = materials.find(m => m.id === 'i-gravel')!;
    const gravelQty = Math.ceil(totalPostCount * 0.5 / 27);
    globalItems.push({
      id: gravelMat.id,
      name: gravelMat.name,
      qty: gravelQty,
      unit: gravelMat.unit,
      unitCost: gravelMat.cost,
      total: gravelQty * gravelMat.cost,
      category: 'Installation'
    });
  }

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
