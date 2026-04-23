import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calculator, Plus, Trash2, Send, Download, CheckCircle2, 
  ChevronRight, ChevronLeft, Info, Ruler, Palette, Box, 
  Layers, HardHat, FileText, Map, X, Printer, Share2, Trees, Droplets
} from 'lucide-react';
import { FENCE_STYLES, COMPANY_INFO } from '../constants';
import { MaterialItem, FenceStyle, Estimate, LaborRates } from '../types';
import { cn, formatCurrency, formatFeetInches } from '../lib/utils';

interface EstimatorProps {
  materials: MaterialItem[];
  laborRates: LaborRates;
  estimate: Partial<Estimate>;
  setEstimate: (estimate: Partial<Estimate>) => void;
}

export default function Estimator({ 
  materials, 
  laborRates: globalLaborRates, 
  estimate, 
  setEstimate 
}: EstimatorProps) {
  const [step, setStep] = React.useState(1);

  const [isFullView, setIsFullView] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [showInvoice, setShowInvoice] = React.useState(false);
  const [showDiagram, setShowDiagram] = React.useState(false);
  const [leftTab, setLeftTab] = React.useState<'Dimensions' | 'Styles'>('Dimensions');

  const defaultStyle = FENCE_STYLES.find(s => s.id === estimate.defaultStyleId) || FENCE_STYLES[0];
  const defaultVisualStyle = defaultStyle.visualStyles.find(vs => vs.id === estimate.defaultVisualStyleId) || defaultStyle.visualStyles[0];

  const calculateCosts = () => {
    const runs = estimate.runs || [];
    const hasRuns = runs.length > 0;
    const wasteFactor = 1 + (estimate.wastePercentage || 10) / 100;
    const rawItems: { name: string; qty: number; unitCost: number; total: number; category: string }[] = [];
    
    const aggregatedData = {
      lf: 0,
      gates: 0,
      postCount: 0,
      materialSubtotal: 0,
      runBreakdown: [] as { id: string, name: string, total: number }[]
    };

    if (hasRuns) {
      runs.forEach((run, idx) => {
        const runStyle = FENCE_STYLES.find(s => s.id === run.styleId) || FENCE_STYLES[0];
        const runVisualStyle = runStyle.visualStyles.find(vs => vs.id === run.visualStyleId) || runStyle.visualStyles[0];
        const logic = runStyle.calcLogic;
        
        const runLF = run.linearFeet;
        const runGates = run.gateDetails?.length || run.gates || 0;
        
        aggregatedData.lf += runLF;
        aggregatedData.gates += runGates;

        // 6' Wood Fence Specific Logic
        const is6ftWood = runStyle.type === 'Wood' && run.height === 6;
        const maxSpacing = (runStyle.type === 'Wood' && run.height === 8) ? 6 : 8;

        // Posts calculation for this run
        let runEndPosts = 0;
        let runDoubleGates = 0;
        let hingePostCount = 0;
        if (run.gateDetails && run.gateDetails.length > 0) {
          run.gateDetails.forEach(gate => {
            if (runStyle.type !== 'Metal') {
              runEndPosts += gate.type === 'Double' ? 2 : 1;
            }
            if (gate.type === 'Double') {
              runDoubleGates++;
              if (runStyle.type === 'Wood') hingePostCount += 2;
            } else {
              if (runStyle.type === 'Wood') hingePostCount += 1;
            }
          });
        } else {
          if (runStyle.type !== 'Metal') {
            runEndPosts += runGates * 2;
          }
          if (runStyle.type === 'Wood') hingePostCount += runGates;
        }

        const runLinePosts = Math.max(0, Math.ceil(runLF / maxSpacing) - 1);
        const runCornerPosts = (idx === runs.length - 1) ? 0 : 1; // Between runs
        const startEndPosts = (idx === 0 ? 1 : 0) + (idx === runs.length - 1 ? 1 : 0);
        
        const runPostCount = runLinePosts + runEndPosts + runCornerPosts + startEndPosts;
        const stdPostCount = Math.max(0, runPostCount - hingePostCount);
        aggregatedData.postCount += runPostCount;

        // Post Material
        let postCost = 0;
        if (!run.reusePosts) {
          // Standard Posts
          if (stdPostCount > 0) {
            let postMat = materials.find(m => m.category === 'Post' && m.id.startsWith(runStyle.type.toLowerCase().charAt(0))) || materials[0];
            if (runStyle.type === 'Wood') {
              postMat = materials.find(m => m.id === (run.height === 8 ? 'w-post-metal-11' : 'w-post-metal-8')) || postMat;
            } else if (runStyle.type === 'Pipe') {
              postMat = materials.find(m => m.id === (run.height >= 5 ? 'p-post-238-10' : 'p-post-238-8')) || postMat;
            }
            
            const currentPostCost = stdPostCount * postMat.cost;
            postCost += currentPostCost;
            const existingPost = rawItems.find(i => i.name === postMat.name);
            if (existingPost) {
              existingPost.qty += stdPostCount;
              existingPost.total += currentPostCost;
            } else {
              rawItems.push({ name: postMat.name, qty: stdPostCount, unitCost: postMat.cost, total: currentPostCost, category: 'Structure' });
            }
          }

          // Hinge Posts (1' deeper)
          if (hingePostCount > 0 && runStyle.type === 'Wood') {
            const hingeId = run.height === 8 ? 'w-post-metal-12' : 'w-post-metal-9';
            const hingeMat = materials.find(m => m.id === hingeId)!;
            const currentHingeCost = hingePostCount * hingeMat.cost;
            postCost += currentHingeCost;
            const hingeName = `${hingeMat.name} (Gate Hinge)`;
            const existingHinge = rawItems.find(i => i.name === hingeName);
            if (existingHinge) {
              existingHinge.qty += hingePostCount;
              existingHinge.total += currentHingeCost;
            } else {
              rawItems.push({ name: hingeName, qty: hingePostCount, unitCost: hingeMat.cost, total: currentHingeCost, category: 'Structure' });
            }
          }

          // Post Caps (One for every post)
          const capId = runStyle.type === 'Pipe' ? 'pc-dome' : (estimate.topStyle === 'Flat Top' ? 'pc-flat' : 'pc-dome');
          const capMat = materials.find(m => m.id === capId) || materials.find(m => m.id === 'pc-dome')!;
          const existingCap = rawItems.find(i => i.name === capMat.name);
          if (existingCap) {
            existingCap.qty += runPostCount;
            existingCap.total += runPostCount * capMat.cost;
          } else {
            rawItems.push({ name: capMat.name, qty: runPostCount, unitCost: capMat.cost, total: runPostCount * capMat.cost, category: 'Hardware' });
          }

          // Concrete (.7 Bags per post)
          const concreteMat = materials.find(m => m.id === 'i-concrete-80')!;
          const runConcreteBags = Math.ceil(runPostCount * 0.7);
          const existingConcrete = rawItems.find(i => i.name === concreteMat.name);
          if (existingConcrete) {
            existingConcrete.qty += runConcreteBags;
            existingConcrete.total += runConcreteBags * concreteMat.cost;
          } else {
            rawItems.push({ name: concreteMat.name, qty: runConcreteBags, unitCost: concreteMat.cost, total: runConcreteBags * concreteMat.cost, category: 'Installation' });
          }
        }

        // Pickets / Panels
        let panelMat = materials.find(m => (m.category === 'Panel' || m.category === 'Picket') && m.id.startsWith(runStyle.type.toLowerCase().charAt(0))) || materials[0];
        let panelQty = 0;
        
        const runGateWidth = (run.gateDetails || []).reduce((sum, g) => sum + (g.width || 0), 0) || (runGates * 4);
        const netLF = Math.max(0, runLF - runGateWidth);

        if (runStyle.type === 'Wood') {
          const totalInches = netLF * 12;
          const isBob = run.visualStyleId === 'w-bob';
          const divisor = isBob ? 4.5 : 5.5; 
          panelQty = Math.ceil((totalInches / divisor) * wasteFactor);
          const woodType = run.woodType || estimate.woodType;
          const isStained = run.isPreStained || estimate.isPreStained;
          if (woodType === 'PT Pine') panelMat = materials.find(m => m.id === (isStained ? 'w-picket-pine-stained' : 'w-picket-pine')) || panelMat;
          else if (woodType === 'Japanese Cedar') panelMat = materials.find(m => m.id === (isStained ? 'w-picket-j-cedar-stained' : 'w-picket-j-cedar')) || panelMat;
          else if (woodType === 'Western Red Cedar') panelMat = materials.find(m => m.id === (isStained ? 'w-picket-w-cedar-stained' : 'w-picket-w-cedar')) || panelMat;
        } else {
          panelQty = Math.ceil((netLF / 8) * wasteFactor);
        }

        let picketDisplayName = panelMat.name;
        if (runStyle.type === 'Wood' && estimate.topStyle) picketDisplayName = picketDisplayName.replace('Picket', `${estimate.topStyle} Picket`);
        
        const panelUnitCost = panelMat.cost + runVisualStyle.priceModifier;
        const panelTotal = panelQty * panelUnitCost;
        const existingPanel = rawItems.find(i => i.name === picketDisplayName && i.unitCost === panelUnitCost);
        if (existingPanel) {
          existingPanel.qty += panelQty;
          existingPanel.total += panelTotal;
        } else {
          rawItems.push({ name: picketDisplayName, qty: panelQty, unitCost: panelUnitCost, total: panelTotal, category: 'Infill' });
        }

        // Gates
        if (run.gateDetails && run.gateDetails.length > 0) {
          run.gateDetails.forEach(gate => {
            if (runStyle.type === 'Wood') {
              if (gate.type === 'Double') {
                // Shark Kit ONLY
                const sharkKit = materials.find(m => m.id === 'g-kit-shark')!;
                const existing = rawItems.find(i => i.name === sharkKit.name);
                if (existing) {
                  existing.qty += 1;
                  existing.total += sharkKit.cost;
                } else {
                  rawItems.push({ name: sharkKit.name, qty: 1, unitCost: sharkKit.cost, total: sharkKit.cost, category: 'Gate' });
                }
              } else {
                // 3-Hinge Kit + 2x4x12s
                const hingeKit = materials.find(m => m.id === 'g-kit-3-hinge')!;
                const existingKit = rawItems.find(i => i.name === hingeKit.name);
                if (existingKit) {
                  existingKit.qty += 1;
                  existingKit.total += hingeKit.cost;
                } else {
                  rawItems.push({ name: hingeKit.name, qty: 1, unitCost: hingeKit.cost, total: hingeKit.cost, category: 'Gate' });
                }

                // Determine rail material for gate bracing
                const isStained = run.isPreStained || estimate.isPreStained;
                const woodType = run.woodType || estimate.woodType;
                let rId = isStained ? 'w-rail-pine-12-stained' : 'w-rail-pine-12';
                if (woodType === 'Japanese Cedar') rId = isStained ? 'w-rail-j-cedar-12-stained' : 'w-rail-j-cedar-12';
                else if (woodType === 'Western Red Cedar') rId = isStained ? 'w-rail-w-cedar-12-stained' : 'w-rail-w-cedar-12';
                const rMat = materials.find(m => m.id === rId)!;
                const gateBracingName = `${rMat.name} (Gate Bracing)`;
                const existingRails = rawItems.find(i => i.name === gateBracingName);
                if (existingRails) {
                  existingRails.qty += 2;
                  existingRails.total += 2 * rMat.cost;
                } else {
                  rawItems.push({ name: gateBracingName, qty: 2, unitCost: rMat.cost, total: 2 * rMat.cost, category: 'Structure' });
                }
              }
            } else {
              // Non-wood logic
              const gateMat = materials.find(m => m.category === 'Gate' && (m.id === estimate.gateStyleId || m.id === 'g-kit-wood')) || materials.find(m => m.category === 'Gate')!;
              const existingGate = rawItems.find(i => i.name === gateMat.name);
              if (existingGate) {
                existingGate.qty += 1;
                existingGate.total += gateMat.cost;
              } else {
                rawItems.push({ name: gateMat.name, qty: 1, unitCost: gateMat.cost, total: gateMat.cost, category: 'Gate' });
              }
              
              const latchMat = materials.find(m => m.id === 'g-latch-grav');
              if (latchMat) {
                const existingLatch = rawItems.find(i => i.name === latchMat.name);
                if (existingLatch) {
                  existingLatch.qty += 1;
                  existingLatch.total += latchMat.cost;
                } else {
                  rawItems.push({ name: latchMat.name, qty: 1, unitCost: latchMat.cost, total: latchMat.cost, category: 'Gate' });
                }
              }

              if (gate.type === 'Double') {
                const sharkKit = materials.find(m => m.id === 'g-kit-shark');
                if (sharkKit) {
                  const existingShark = rawItems.find(i => i.name === sharkKit.name);
                  if (existingShark) {
                    existingShark.qty += 1;
                    existingShark.total += sharkKit.cost;
                  } else {
                    rawItems.push({ name: sharkKit.name, qty: 1, unitCost: sharkKit.cost, total: sharkKit.cost, category: 'Gate' });
                  }
                }
              }
            }
          });
        }

        // Hardware (Rails/Brackets)
        if (runStyle.type === 'Wood') {
          if (is6ftWood) {
             // Brackets for 6' wood
             const bracketMat = materials.find(m => m.id === 'h-bracket-w')!;
             const bracketQty = runPostCount * 4;
             rawItems.push({ name: bracketMat.name, qty: bracketQty, unitCost: bracketMat.cost, total: bracketQty * bracketMat.cost, category: 'Hardware' });

             // Lags for 6' wood
             const lagMat = materials.find(m => m.id === 'h-lag-14')!;
             const lagQty = bracketQty * 4;
             rawItems.push({ name: lagMat.name, qty: lagQty, unitCost: lagMat.cost, total: lagQty * lagMat.cost, category: 'Hardware' });

             // Rails for 6' wood (8ft sections)
             const isStained = run.isPreStained || estimate.isPreStained;
             const woodType = run.woodType || estimate.woodType;
             const sectionCount8 = Math.ceil(runLF / 8);
             let railId = isStained ? 'w-rail-pine-8-stained' : 'w-rail-pine-8';
             if (woodType === 'Japanese Cedar') railId = isStained ? 'w-rail-j-cedar-8-stained' : 'w-rail-j-cedar-8';
             else if (woodType === 'Western Red Cedar') railId = isStained ? 'w-rail-w-cedar-8-stained' : 'w-rail-w-cedar-8';
             
             const railMat = materials.find(m => m.id === railId)!;
             const railQty = sectionCount8 * 3;
             rawItems.push({ name: railMat.name, qty: railQty, unitCost: railMat.cost, total: railQty * railMat.cost, category: 'Structure' });

             // Rot board for 6' wood (Using 16' lengths)
             const sectionCount16 = Math.ceil(runLF / 16);
             const rotBoardId = isStained ? 'w-rot-board-16-stained' : 'w-rot-board-16';
             const rotBoardMat = materials.find(m => m.id === rotBoardId)!;
             rawItems.push({ name: rotBoardMat.name, qty: sectionCount16, unitCost: rotBoardMat.cost, total: sectionCount16 * rotBoardMat.cost, category: 'Structure' });

             // Nails for this run
             const nailsMat = materials.find(m => m.id === 'h-nail-galv')!;
             const nailQty = Number(((panelQty * 6) / 2500).toFixed(2));
             rawItems.push({ name: nailsMat.name, qty: Math.max(0.1, nailQty), unitCost: nailsMat.cost, total: Math.max(0.1, nailQty) * nailsMat.cost, category: 'Hardware' });
          } else {
             // Generic wood logic (Rails/Rot Boards for other heights)
             const bracketMat = materials.find(m => m.id === 'h-bracket-w')!;
             const railsCount = run.height > 6 ? 4 : 3;
             const bracketQty = runPostCount * railsCount;
             rawItems.push({ name: bracketMat.name, qty: bracketQty, unitCost: bracketMat.cost, total: bracketQty * bracketMat.cost, category: 'Hardware' });

             const isStained = run.isPreStained || estimate.isPreStained;
             const woodType = run.woodType || estimate.woodType;
             const sectionCount12 = Math.ceil(runLF / 12);
             const sectionCount16 = Math.ceil(runLF / 16);
             
             let railId = isStained ? 'w-rail-pine-12-stained' : 'w-rail-pine-12';
             if (woodType === 'Japanese Cedar') railId = isStained ? 'w-rail-j-cedar-12-stained' : 'w-rail-j-cedar-12';
             else if (woodType === 'Western Red Cedar') railId = isStained ? 'w-rail-w-cedar-12-stained' : 'w-rail-w-cedar-12';
             
             const railMat = materials.find(m => m.id === railId)!;
             const railQty = sectionCount12 * railsCount;
             rawItems.push({ name: railMat.name, qty: railQty, unitCost: railMat.cost, total: railQty * railMat.cost, category: 'Structure' });

             const rotBoardId = isStained ? 'w-rot-board-16-stained' : 'w-rot-board-16';
             const rotBoardMat = materials.find(m => m.id === rotBoardId)!;
             rawItems.push({ name: rotBoardMat.name, qty: sectionCount16, unitCost: rotBoardMat.cost, total: sectionCount16 * rotBoardMat.cost, category: 'Structure' });

             // Lags and Nails for non-6ft Wood
             const lagMat = materials.find(m => m.id === 'h-lag-14')!;
             const lagQty = bracketQty * 4;
             rawItems.push({ name: lagMat.name, qty: lagQty, unitCost: lagMat.cost, total: lagQty * lagMat.cost, category: 'Hardware' });

             const nailsMat = materials.find(m => m.id === 'h-nail-galv')!;
             const nailQty = Number(((panelQty * 6) / 2500).toFixed(2));
             rawItems.push({ name: nailsMat.name, qty: Math.max(0.1, nailQty), unitCost: nailsMat.cost, total: Math.max(0.1, nailQty) * nailsMat.cost, category: 'Hardware' });
          }
        }

        // Add-ons per run
        if (run.isPreStained && runStyle.type === 'Wood') {
          const preStainMat = materials.find(m => m.id === 'f-pre-stain');
          if (preStainMat) {
            const total = runLF * preStainMat.cost;
            const existing = rawItems.find(i => i.name === preStainMat.name);
            if (existing) {
              existing.qty += runLF;
              existing.total += total;
            } else {
              rawItems.push({ name: preStainMat.name, qty: runLF, unitCost: preStainMat.cost, total: total, category: 'Finishing' });
            }
          }
        }

        if (is6ftWood) {
           if (estimate.hasCapAndTrim) {
              const trimMat = materials.find(m => m.id === 'f-cap-trim')!;
              const trimQty = Math.ceil(runLF / 8);
              rawItems.push({ name: trimMat.name, qty: trimQty, unitCost: trimMat.cost, total: trimQty * trimMat.cost, category: 'Finishing' });
           }
           if (estimate.hasDoubleTrim) {
              const doubleTrimMat = materials.find(m => m.id === 'f-double-trim-1x2')!;
              const trimQty = Math.ceil(runLF / 8);
              rawItems.push({ name: doubleTrimMat.name, qty: trimQty, unitCost: doubleTrimMat.cost, total: trimQty * doubleTrimMat.cost, category: 'Finishing' });
           }
           if (estimate.hasTopCap) {
              const topCapMat = materials.find(m => m.id === 'f-top-cap-2x6')!;
              const topCapQty = Math.ceil(runLF / 12);
              rawItems.push({ name: topCapMat.name, qty: topCapQty, unitCost: topCapMat.cost, total: topCapQty * topCapMat.cost, category: 'Finishing' });
           }
        }

        if (estimate.includeStain && !run.isPreStained && runStyle.type === 'Wood') {
           const stainMat = materials.find(m => m.id === 'f-stain');
           if (stainMat) {
             const sqFt = runLF * run.height;
             const gallons = Math.ceil(sqFt / 175);
             const matTotal = gallons * stainMat.cost;
             const existingMat = rawItems.find(i => i.name === stainMat.name);
             if (existingMat) {
               existingMat.qty += gallons;
               existingMat.total += matTotal;
             } else {
               rawItems.push({ name: stainMat.name, qty: gallons, unitCost: stainMat.cost, total: matTotal, category: 'Finishing' });
             }

             // Labor for stain
             const laborTotal = sqFt * globalLaborRates.washAndStain;
             rawItems.push({ name: `Stain Labor (${run.name})`, qty: sqFt, unitCost: globalLaborRates.washAndStain, total: laborTotal, category: 'Labor' });
           }
        }

        if (runStyle.type === 'Pipe') {
          const railMat = materials.find(m => m.id === 'p-rail-238')!;
          rawItems.push({ name: railMat.name, qty: runLF, unitCost: railMat.cost, total: runLF * railMat.cost, category: 'Structure' });

          const tieMat = materials.find(m => m.id === 'p-ez-tie')!;
          const tieQty = Math.ceil((runLF / 8) * 12);
          rawItems.push({ name: tieMat.name, qty: tieQty, unitCost: tieMat.cost, total: tieQty * tieMat.cost, category: 'Hardware' });

          const wireMat = materials.find(m => m.id === 'p-no-climb')!;
          rawItems.push({ name: wireMat.name, qty: runLF, unitCost: wireMat.cost, total: runLF * wireMat.cost, category: 'Infill' });

          const paintMat = materials.find(m => m.id === 'p-paint-pint')!;
          const paintQty = Math.ceil(runLF / 50);
          rawItems.push({ name: paintMat.name, qty: paintQty, unitCost: paintMat.cost, total: paintQty * paintMat.cost, category: 'Finishing' });
        }

        // --- NEW LABOR CALCULATION ---
        let runLaborRate = 0;
        const rates = globalLaborRates;
        
        if (runStyle.type === 'Wood') {
          const is6ft = run.height <= 6;
          const isSideBySide = run.visualStyleId === 'w-side';
          if (is6ft) {
            runLaborRate = isSideBySide ? rates.woodSideBySide6 : rates.woodBoardOnBoard6;
          } else {
            runLaborRate = isSideBySide ? rates.woodSideBySide8 : rates.woodBoardOnBoard8;
          }
          if (estimate.hasCapAndTrim) runLaborRate += rates.topCap;
        } else if (runStyle.type === 'Metal') {
          runLaborRate = (run.ironInstallType === 'Weld up') ? rates.ironWeldUp : rates.ironBoltUp;
          // Update panel for height
          if (run.height === 4) panelMat = materials.find(m => m.id === 'm-panel-4x8') || panelMat;
          else if (run.height === 5) panelMat = materials.find(m => m.id === 'm-panel-5x8') || panelMat;
          else panelMat = materials.find(m => m.id === 'm-panel-std') || panelMat;
          
          picketDisplayName = `${run.height}'x8' Wrought Iron ${runVisualStyle.name}`;
        } else if (runStyle.type === 'Chain Link') {
          runLaborRate = rates.chainLink;
        } else {
          runLaborRate = rates.pipeFence;
        }
        
        let runGateLaborCost = 0;
        if (run.gateDetails && run.gateDetails.length > 0) {
           run.gateDetails.forEach(gate => {
             if (runStyle.type === 'Wood') {
               runGateLaborCost += gate.type === 'Double' ? rates.gateWoodDrive : rates.gateWoodWalk;
             } else {
               runGateLaborCost += rates.gateWeldedFrame;
             }
           });
        } else {
          runGateLaborCost += runGates * (runStyle.type === 'Wood' ? rates.gateWoodWalk : rates.gateWeldedFrame);
        }

        const runLaborTotal = (runLF * runLaborRate) + runGateLaborCost;
        rawItems.push({ name: `Labor - ${run.name}`, qty: 1, unitCost: runLaborTotal, total: runLaborTotal, category: 'Labor' });

        aggregatedData.runBreakdown.push({ id: run.id, name: run.name, total: postCost + panelTotal + runLaborTotal });
      });
    } else {
      // Global Gates Fallback logic if no runs defined
      if (estimate.gateCount && estimate.gateCount > 0) {
        if (defaultStyle.type === 'Wood') {
            const hingeKit = materials.find(m => m.id === 'g-kit-3-hinge')!;
            rawItems.push({ name: hingeKit.name, qty: estimate.gateCount, unitCost: hingeKit.cost, total: estimate.gateCount * hingeKit.cost, category: 'Gate' });
            
            const rMat = materials.find(m => m.id === 'w-rail-pine-12')!;
            rawItems.push({ name: `${rMat.name} (Gate Bracing)`, qty: estimate.gateCount * 2, unitCost: rMat.cost, total: estimate.gateCount * 2 * rMat.cost, category: 'Structure' });

            const gateLabor = estimate.gateCount * globalLaborRates.gateWoodWalk;
            rawItems.push({ name: 'Labor - Global Gates', qty: 1, unitCost: gateLabor, total: gateLabor, category: 'Labor' });
        } else {
            const gateMat = materials.find(m => m.category === 'Gate')!;
            rawItems.push({ name: gateMat.name, qty: estimate.gateCount, unitCost: gateMat.cost, total: estimate.gateCount * gateMat.cost, category: 'Gate' });
            
            const gateLabor = estimate.gateCount * globalLaborRates.gateWeldedFrame;
            rawItems.push({ name: 'Labor - Global Gates', qty: 1, unitCost: gateLabor, total: gateLabor, category: 'Labor' });
        }
      }
    }

    // Single extra dome cap for pipe projects overall
    if (runs.some(r => FENCE_STYLES.find(s => s.id === r.styleId)?.type === 'Pipe')) {
      const domeCapMat = materials.find(m => m.id === 'pc-dome')!;
      rawItems.push({ name: `${domeCapMat.name} (Global Extra)`, qty: 1, unitCost: domeCapMat.cost, total: domeCapMat.cost, category: 'Hardware' });
    }

    const lf = aggregatedData.lf || estimate.linearFeet || 0;
    const gates = aggregatedData.gates || estimate.gateCount || 0;
    const postCount = aggregatedData.postCount || Math.ceil(lf / 8) + 1;

    // Demolition (Aggregated)
    if (estimate.hasDemolition) {
      const dLF = estimate.demoLinearFeet || lf;
      const dumpsterMat = materials.find(m => m.id === 'd-dumpster')!;
      const bladesNeeded = Math.ceil(dLF / 50);
      rawItems.push(
        { name: dumpsterMat.name, qty: 1, unitCost: dumpsterMat.cost, total: dumpsterMat.cost, category: 'Demolition' },
        { name: materials.find(m => m.id === 'd-hauling')!.name, qty: 1, unitCost: 145, total: 145, category: 'Demolition' },
        { name: materials.find(m => m.id === 'd-blade')!.name, qty: bladesNeeded, unitCost: 14, total: bladesNeeded * 14, category: 'Demolition' },
        { name: 'Demo Labor (Tear down & Haul)', qty: dLF, unitCost: globalLaborRates.demo, total: dLF * globalLaborRates.demo, category: 'Demolition' }
      );
    }

    // Apply manual overrides
    const items = rawItems.map(item => {
      const qty = estimate.manualQuantities?.[item.name] ?? item.qty;
      const unitCost = estimate.manualPrices?.[item.name] ?? item.unitCost;
      return { ...item, qty, unitCost, total: qty * unitCost };
    });

    const demoCost = items.filter(i => i.category === 'Demolition').reduce((sum, i) => sum + i.total, 0);
    const sitePrepCost = estimate.hasSitePrep ? (estimate.needsMarking ? 28 : 0) + (estimate.needsClearing ? (Math.ceil(lf / 20) * 58) : 0) : 0;
    const materialSubtotal = items.filter(i => i.category !== 'Labor' && i.category !== 'Demolition' && i.category !== 'SitePrep').reduce((sum, item) => sum + item.total, 0);
    const laborCost = items.filter(i => i.category === 'Labor').reduce((sum, item) => sum + item.total, 0);
    
    const subtotal = materialSubtotal + laborCost + demoCost + sitePrepCost;
    const markup = subtotal * ((estimate.markupPercentage || 0) / 100);
    const tax = (subtotal + markup) * ((estimate.taxPercentage || 0) / 100);
    const total = subtotal + markup + tax;

    return { items, materialSubtotal, laborCost, demoCost, sitePrepCost, subtotal, markup, tax, total, runBreakdown: aggregatedData.runBreakdown, lf, postCount, gateCount: gates };
  };

  const results = calculateCosts();

  const handleNext = () => setStep(s => Math.min(s + 1, 4));
  const handleBack = () => setStep(s => Math.max(s - 1, 1));

  const handleSave = () => {
    setTimeout(() => {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1500);
  };

  const steps = [
    { id: 1, label: 'Customer', icon: Share2 },
    { id: 2, label: 'Measurements & Styling', icon: Ruler },
    { id: 3, label: 'Add-ons & Specs', icon: HardHat },
    { id: 4, label: 'Review & Send', icon: Send },
  ];

  const PatrioticDivider = () => (
    <div className="relative py-10 flex items-center justify-center">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t-4 border-double border-american-blue/10"></div>
      </div>
      <div className="relative flex items-center gap-6 bg-[#F8F9FA] px-8">
        <div className="w-6 h-6 bg-american-red american-star shadow-lg transform rotate-12" />
        <div className="w-8 h-8 bg-american-blue american-star shadow-xl" />
        <div className="w-6 h-6 bg-american-red american-star shadow-lg transform -rotate-12" />
      </div>
    </div>
  );

  const renderSection = (sectionId: number) => {
    switch (sectionId) {
      case 1:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Customer Information Section */}
            <div className="bg-white rounded-3xl p-8 shadow-xl border-2 border-american-blue/10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Share2 size={120} className="transform rotate-12" />
              </div>
              <div className="flex items-center gap-4 mb-8">
                <div className="h-14 w-14 rounded-2xl bg-american-blue flex items-center justify-center text-white shadow-lg shadow-american-blue/20">
                  <Share2 size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-american-blue tracking-tight uppercase">Customer Dossier</h3>
                  <p className="text-xs font-bold text-american-red uppercase tracking-widest">Project Identification & Logistics</p>
                </div>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Customer Full Name</label>
                  <input 
                    type="text" 
                    value={estimate.customerName} 
                    onChange={(e) => setEstimate({...estimate, customerName: e.target.value})} 
                    placeholder="Enter Name"
                    className="w-full rounded-xl border-2 border-[#F0F0F0] bg-white px-5 py-3.5 text-sm font-bold focus:border-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all placeholder:text-[#CCCCCC]" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Email Address</label>
                  <input 
                    type="email" 
                    value={estimate.customerEmail} 
                    onChange={(e) => setEstimate({...estimate, customerEmail: e.target.value})} 
                    placeholder="email@domain.com"
                    className="w-full rounded-xl border-2 border-[#F0F0F0] bg-white px-5 py-3.5 text-sm font-bold focus:border-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all placeholder:text-[#CCCCCC]" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Phone Number</label>
                  <input 
                    type="tel" 
                    value={estimate.customerPhone} 
                    onChange={(e) => setEstimate({...estimate, customerPhone: e.target.value})} 
                    placeholder="(555) 000-0000"
                    className="w-full rounded-xl border-2 border-[#F0F0F0] bg-white px-5 py-3.5 text-sm font-bold focus:border-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all placeholder:text-[#CCCCCC]" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Project Site Address</label>
                  <input 
                    type="text" 
                    value={estimate.customerAddress} 
                    onChange={(e) => setEstimate({...estimate, customerAddress: e.target.value})} 
                    placeholder="Street, City, State, Zip"
                    className="w-full rounded-xl border-2 border-[#F0F0F0] bg-white px-5 py-3.5 text-sm font-bold focus:border-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all placeholder:text-[#CCCCCC]" 
                  />
                </div>
              </div>
            </div>
          </div>
        );
      case 2: // Consolidated Style & Measurements
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Tab navigation for Step 2 */}
            <div className="flex bg-[#F0F0F0] p-1.5 rounded-2xl w-fit">
               {(['Dimensions', 'Styles'] as const).map(tab => (
                 <button
                   key={tab}
                   onClick={() => setLeftTab(tab)}
                   className={cn(
                     "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                     leftTab === tab ? "bg-white text-american-blue shadow-md" : "text-[#999999] hover:text-american-blue"
                   )}
                 >
                   {tab}
                 </button>
               ))}
            </div>

            {leftTab === 'Styles' && (
              <div className="bg-white rounded-[40px] p-10 shadow-2xl border-2 border-american-blue/5 relative overflow-hidden">
              <div className="flex items-center gap-5 mb-10">
                <div className="h-16 w-16 rounded-3xl bg-american-blue flex items-center justify-center text-white shadow-xl shadow-american-blue/20">
                  <Palette size={32} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-american-blue tracking-tight uppercase">Project Default Style</h2>
                  <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Baseline for new fence runs</p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Default Material</label>
                    <div className="flex flex-wrap gap-2">
                      {FENCE_STYLES.map(style => (
                        <button 
                          key={style.id} 
                          onClick={() => setEstimate({
                            ...estimate, 
                            defaultStyleId: style.id, 
                            defaultVisualStyleId: style.visualStyles[0].id,
                            defaultHeight: style.availableHeights[0]
                          })} 
                          className={cn(
                            "px-4 py-2 rounded-xl border-2 transition-all text-xs font-black uppercase tracking-widest", 
                            estimate.defaultStyleId === style.id 
                              ? "border-american-blue bg-american-blue text-white shadow-md" 
                              : "border-[#F5F5F5] bg-white hover:border-american-blue/20 text-american-blue"
                          )}
                        >
                          {style.name}
                        </button>
                      ))}
                    </div>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Default Pattern</label>
                    <select 
                      value={estimate.defaultVisualStyleId}
                      onChange={(e) => setEstimate({...estimate, defaultVisualStyleId: e.target.value})}
                      className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue outline-none"
                    >
                      {defaultStyle.visualStyles.map(vs => (
                        <option key={vs.id} value={vs.id}>{vs.name}</option>
                      ))}
                    </select>
                 </div>

                 {defaultStyle.type === 'Wood' && (
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Wood Species</label>
                       <select 
                         value={estimate.woodType}
                         onChange={(e) => setEstimate({...estimate, woodType: e.target.value as any})}
                         className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue outline-none"
                       >
                         <option value="PT Pine">PT Pine</option>
                         <option value="Western Red Cedar">Western Red Cedar</option>
                         <option value="Japanese Cedar">Japanese Cedar</option>
                       </select>
                    </div>
                  )}

                  {defaultStyle.type === 'Metal' && (
                    <>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Install Type</label>
                         <select 
                           value={estimate.ironInstallType}
                           onChange={(e) => setEstimate({...estimate, ironInstallType: e.target.value as any})}
                           className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue outline-none"
                         >
                           <option value="Bolt up">Bolt up</option>
                           <option value="Weld up">Weld up</option>
                         </select>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Rail Count</label>
                         <select 
                           value={estimate.ironRails}
                           onChange={(e) => setEstimate({...estimate, ironRails: e.target.value as any})}
                           className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue outline-none"
                         >
                           <option value="2 rail">2 rail</option>
                           <option value="3 rail">3 rail</option>
                         </select>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Top Finishing</label>
                         <select 
                           value={estimate.ironTop}
                           onChange={(e) => setEstimate({...estimate, ironTop: e.target.value as any})}
                           className="w-full rounded-xl border-2 border-[#F0F0F0] bg-[#F9F9F9] px-4 py-3 text-sm font-bold focus:border-american-blue outline-none"
                         >
                           <option value="Flat top">Flat top</option>
                           <option value="Pressed point top">Pressed point top</option>
                         </select>
                      </div>
                    </>
                  )}
               </div>

               <div className="mt-8 pt-6 border-t border-dashed border-american-blue/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-[10px] font-bold text-[#999999] uppercase italic">* New runs will inherit these settings.</p>
                  <button 
                    onClick={() => {
                      if (!estimate.runs) return;
                      const newRuns = estimate.runs.map(r => ({
                        ...r,
                        styleId: estimate.defaultStyleId!,
                        visualStyleId: estimate.defaultVisualStyleId!,
                        height: estimate.defaultHeight!,
                        color: estimate.defaultColor!,
                        woodType: estimate.woodType,
                        ironRails: estimate.ironRails,
                        ironTop: estimate.ironTop
                      }));
                      setEstimate({...estimate, runs: newRuns});
                    }}
                    className="text-[10px] font-black uppercase tracking-widest text-american-red hover:underline"
                  >
                    Apply selection to all existing runs
                  </button>
               </div>
            </div>
          )}

          {leftTab === 'Dimensions' && (
              <div className="bg-white rounded-3xl p-8 shadow-xl border-2 border-american-red/10 relative overflow-hidden">
              <div className="flex items-center gap-4 mb-8">
                <div className="h-14 w-14 rounded-2xl bg-american-red flex items-center justify-center text-white shadow-lg shadow-american-red/20">
                  <Ruler size={28} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-american-red tracking-tight uppercase">Strategic Layout</h2>
                  <p className="text-xs font-bold text-american-blue uppercase tracking-widest">Perimeter Specifications & Custom Runs</p>
                </div>
              </div>

              <div className="grid gap-8 md:grid-cols-3">
                <div className="space-y-3 relative">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Total Project Perimeter (LF)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      value={estimate.linearFeet} 
                      onChange={(e) => setEstimate({...estimate, linearFeet: Number(e.target.value)})} 
                      disabled={estimate.runs && estimate.runs.length > 0}
                      className={`w-full rounded-2xl border-2 border-[#F0F0F0] bg-white px-6 py-4 text-2xl font-black text-american-blue focus:border-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all ${estimate.runs && estimate.runs.length > 0 ? 'opacity-50 cursor-not-allowed bg-[#F5F5F5]' : ''}`} 
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-american-blue/30">FEET</div>
                  </div>
                  {estimate.runs && estimate.runs.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-american-red/5 rounded-lg border border-american-red/20">
                      <Info size={12} className="text-american-red" />
                      <p className="text-[9px] text-american-red font-black uppercase tracking-tighter">Overridden by Sectional Data</p>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Default Height</label>
                  <select 
                    value={estimate.defaultHeight} 
                    onChange={(e) => setEstimate({...estimate, defaultHeight: Number(e.target.value)})}
                    className="w-full rounded-2xl border-2 border-[#F0F0F0] bg-white px-6 py-4 text-sm font-black text-american-blue outline-none"
                  >
                    {defaultStyle.availableHeights.map(h => <option key={h} value={h}>{h} FT</option>)}
                  </select>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Global Access Gates</label>
                  <div className="relative">
                    <input type="number" value={estimate.gateCount} onChange={(e) => setEstimate({...estimate, gateCount: Number(e.target.value)})} className="w-full rounded-2xl border-2 border-[#F0F0F0] bg-white px-6 py-4 text-2xl font-black text-american-blue focus:border-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all" />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-american-blue/30">UNITS</div>
                  </div>
                </div>
              </div>

              {/* Fence Runs Section */}
              <div className="mt-12 pt-10 border-t-2 border-dashed border-[#F0F0F0] space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-american-blue uppercase tracking-tight">Fence Sections</h3>
                    <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Mix & Match Styles per Run</p>
                  </div>
                  <button 
                    onClick={() => {
                      const newRun = { 
                        id: Math.random().toString(36).substr(2, 9), 
                        name: `Run ${(estimate.runs?.length || 0) + 1}`, 
                        linearFeet: 0, 
                        corners: 0, 
                        gates: 0,
                        styleId: estimate.defaultStyleId!,
                        visualStyleId: estimate.defaultVisualStyleId!,
                        height: estimate.defaultHeight!,
                        color: estimate.defaultColor!,
                        isPreStained: estimate.isPreStained
                      };
                      setEstimate({ ...estimate, runs: [...(estimate.runs || []), newRun] });
                    }}
                    className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-american-blue text-white text-xs font-black uppercase tracking-widest hover:bg-american-blue/90 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-american-blue/20"
                  >
                    <Plus size={16} />
                    Add Section
                  </button>
                </div>
                
                <div className="space-y-6">
                  {estimate.runs?.map((run, idx) => {
                    const runStyle = FENCE_STYLES.find(s => s.id === run.styleId) || FENCE_STYLES[0];
                    return (
                      <div key={run.id} className="p-8 rounded-[32px] bg-[#F9F9FB] border-2 border-[#F0F0F0] shadow-sm hover:shadow-md transition-all relative group overflow-hidden">
                        <div className="flex flex-col lg:flex-row gap-8">
                          {/* Run Identifier & Length */}
                          <div className="lg:w-1/3 space-y-6">
                            <div className="flex items-center justify-between mb-2">
                              <span className="px-3 py-1 rounded-full bg-american-blue/10 text-american-blue text-[10px] font-black uppercase tracking-widest">Section {idx + 1}</span>
                              <button 
                                onClick={() => {
                                  const newRuns = estimate.runs!.filter((_, i) => i !== idx);
                                  setEstimate({ ...estimate, runs: newRuns });
                                }}
                                className="text-american-red hover:bg-american-red/10 p-2 rounded-xl transition-all"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Run Name</label>
                                <input 
                                  type="text" 
                                  value={run.name} 
                                  onChange={(e) => {
                                    const newRuns = [...estimate.runs!];
                                    newRuns[idx].name = e.target.value;
                                    setEstimate({ ...estimate, runs: newRuns });
                                  }}
                                  className="w-full rounded-xl border-2 border-white bg-white px-4 py-3 text-sm font-bold focus:border-american-blue outline-none transition-all shadow-sm"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Length (LF)</label>
                                <div className="relative">
                                  <input 
                                    type="number" 
                                    value={run.linearFeet} 
                                    onChange={(e) => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].linearFeet = Number(e.target.value);
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className="w-full rounded-xl border-2 border-white bg-white px-4 py-3 text-sm font-bold focus:border-american-blue outline-none transition-all shadow-sm"
                                  />
                                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-[#BBBBBB]">FT</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Styling Overrides */}
                          <div className="flex-1 grid gap-4 grid-cols-2">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Material</label>
                              <select 
                                value={run.styleId}
                                onChange={(e) => {
                                  const newRuns = [...estimate.runs!];
                                  const newStyle = FENCE_STYLES.find(s => s.id === e.target.value)!;
                                  newRuns[idx].styleId = e.target.value;
                                  newRuns[idx].visualStyleId = newStyle.visualStyles[0].id;
                                  newRuns[idx].height = newStyle.availableHeights[0];
                                  setEstimate({ ...estimate, runs: newRuns });
                                }}
                                className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                              >
                                {FENCE_STYLES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Pattern</label>
                              <select 
                                value={run.visualStyleId}
                                onChange={(e) => {
                                  const newRuns = [...estimate.runs!];
                                  newRuns[idx].visualStyleId = e.target.value;
                                  setEstimate({ ...estimate, runs: newRuns });
                                }}
                                className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                              >
                                {runStyle.visualStyles.map(vs => <option key={vs.id} value={vs.id}>{vs.name}</option>)}
                              </select>
                            </div>

                            {runStyle.type === 'Wood' && (
                              <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Wood Type</label>
                                <select 
                                  value={run.woodType || estimate.woodType}
                                  onChange={(e) => {
                                    const newRuns = [...estimate.runs!];
                                    newRuns[idx].woodType = e.target.value as any;
                                    setEstimate({ ...estimate, runs: newRuns });
                                  }}
                                  className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                                >
                                  <option value="PT Pine">PT Pine</option>
                                  <option value="Western Red Cedar">Western Red Cedar</option>
                                  <option value="Japanese Cedar">Japanese Cedar</option>
                                </select>
                              </div>
                            )}

                            {runStyle.type === 'Metal' && (
                              <>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Install</label>
                                  <select 
                                    value={run.ironInstallType || estimate.ironInstallType}
                                    onChange={(e) => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].ironInstallType = e.target.value as any;
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                                  >
                                    <option value="Bolt up">Bolt up</option>
                                    <option value="Weld up">Weld up</option>
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Rails</label>
                                  <select 
                                    value={run.ironRails || estimate.ironRails}
                                    onChange={(e) => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].ironRails = e.target.value as any;
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                                  >
                                    <option value="2 rail">2 rail</option>
                                    <option value="3 rail">3 rail</option>
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Top</label>
                                  <select 
                                    value={run.ironTop || estimate.ironTop}
                                    onChange={(e) => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].ironTop = e.target.value as any;
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                                  >
                                    <option value="Flat top">Flat top</option>
                                    <option value="Pressed point top">Pressed point top</option>
                                  </select>
                                </div>
                              </>
                            )}

                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/40 ml-1">Height</label>
                              <select 
                                value={run.height}
                                onChange={(e) => {
                                  const newRuns = [...estimate.runs!];
                                  newRuns[idx].height = Number(e.target.value);
                                  setEstimate({ ...estimate, runs: newRuns });
                                }}
                                className="w-full rounded-xl border-2 border-white bg-white px-3 py-2.5 text-[11px] font-bold focus:border-american-blue outline-none shadow-sm"
                              >
                                {runStyle.availableHeights.map(h => <option key={h} value={h}>{h} FT</option>)}
                              </select>
                            </div>
                            {runStyle.type === 'Wood' && (
                              <div className="pt-6">
                                <button
                                  onClick={() => {
                                    const newRuns = [...estimate.runs!];
                                    newRuns[idx].reusePosts = !newRuns[idx].reusePosts;
                                    setEstimate({ ...estimate, runs: newRuns });
                                  }}
                                  className={cn(
                                    "w-full px-3 py-2.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                    run.reusePosts 
                                      ? "border-american-red bg-american-red text-white" 
                                      : "border-white bg-white text-[#BBBBBB]"
                                  )}
                                >
                                  {run.reusePosts ? "Reusing Old Posts" : "Reuse Existing Posts"}
                                </button>
                              </div>
                            )}

                            <div className="pt-6">
                              <button
                                onClick={() => {
                                  const newRuns = [...estimate.runs!];
                                  newRuns[idx].isPreStained = !newRuns[idx].isPreStained;
                                  setEstimate({ ...estimate, runs: newRuns });
                                }}
                                className={cn(
                                  "w-full px-3 py-2.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                                  run.isPreStained 
                                    ? "border-american-blue bg-american-blue text-white" 
                                    : "border-white bg-white text-[#BBBBBB]"
                                )}
                              >
                                {run.isPreStained ? "Pre-Stained Active" : "Add Factory Finish"}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Gates Section for this Run */}
                        <div className="mt-8 pt-6 border-t-2 border-dashed border-[#F0F0F0]">
                          <div className="flex items-center justify-between mb-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 ml-1">Access Gates</label>
                            <button
                              onClick={() => {
                                const newRuns = [...estimate.runs!];
                                if (!newRuns[idx].gateDetails) newRuns[idx].gateDetails = [];
                                newRuns[idx].gateDetails!.push({ 
                                  id: Math.random().toString(36).substr(2, 9), 
                                  type: 'Single', 
                                  width: 4,
                                  position: 0
                                });
                                newRuns[idx].gates = newRuns[idx].gateDetails!.length;
                                setEstimate({ ...estimate, runs: newRuns });
                              }}
                              className="text-[10px] font-black uppercase text-american-red hover:underline"
                            >
                              + Add Gate
                            </button>
                          </div>
                          
                          <div className="space-y-3">
                            {run.gateDetails?.map((gate, gIdx) => (
                              <div key={gate.id} className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-[#F0F0F0] shadow-sm">
                                <div className="flex items-center justify-between">
                                  <select 
                                    value={`${gate.type}-${gate.width}`}
                                    onChange={(e) => {
                                      const [gType, gWidth] = e.target.value.split('-');
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].gateDetails![gIdx].type = gType as 'Single' | 'Double';
                                      newRuns[idx].gateDetails![gIdx].width = Number(gWidth);
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className="bg-transparent text-[10px] font-black uppercase text-american-blue focus:outline-none cursor-pointer"
                                  >
                                    <option value="Single-4">4' Walk Gate</option>
                                    <option value="Double-12">Double 6' Drive Gate</option>
                                  </select>
                                  <button
                                    onClick={() => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].gateDetails = newRuns[idx].gateDetails!.filter((_, i) => i !== gIdx);
                                      newRuns[idx].gates = newRuns[idx].gateDetails!.length;
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className="text-[#CCCCCC] hover:text-american-red"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-[8px] font-black uppercase text-[#BBBBBB]">
                                    <span>Location on Run</span>
                                    <span>{gate.position || 0} FT</span>
                                  </div>
                                  <input 
                                    type="range"
                                    min="0"
                                    max={Math.max(0, run.linearFeet - gate.width)}
                                    value={gate.position || 0}
                                    onChange={(e) => {
                                      const newRuns = [...estimate.runs!];
                                      newRuns[idx].gateDetails![gIdx].position = Number(e.target.value);
                                      setEstimate({ ...estimate, runs: newRuns });
                                    }}
                                    className="w-full h-1 bg-[#F5F5F5] rounded-lg appearance-none cursor-pointer accent-american-red"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {(!estimate.runs || estimate.runs.length === 0) && (
                    <div className="text-center py-12 border-4 border-dashed border-[#F0F0F0] rounded-[40px] bg-[#F9F9FB]/50">
                      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <Ruler className="text-[#CCCCCC]" size={24} />
                      </div>
                      <p className="text-sm font-bold text-[#999999] uppercase tracking-widest">Global measurements Active</p>
                      <p className="text-[10px] text-[#BBBBBB] mt-1 italic">Add sections to specify unique runs and styles</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}
          </div>
        );
      case 3:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#F5F5F5] flex items-center justify-center text-[#1A1A1A]">
                <HardHat size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Add-ons & Specs</h2>
                <p className="text-sm text-[#666666]">Demo, site prep, and technical specifics.</p>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="p-6 rounded-2xl border border-[#E5E5E5] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">Demolition</h3>
                  <button onClick={() => setEstimate({...estimate, hasDemolition: !estimate.hasDemolition})} className={cn("h-6 w-12 rounded-full relative transition-all", estimate.hasDemolition ? "bg-american-red" : "bg-[#E5E5E5]")}>
                    <div className={cn("absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all", estimate.hasDemolition ? "right-1" : "left-1")} />
                  </button>
                </div>
                {estimate.hasDemolition && (
                  <div className="space-y-4 pt-4 border-t border-[#F5F5F5]">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[#666666]">Demo Type</label>
                      <select value={estimate.demoType} onChange={(e) => setEstimate({...estimate, demoType: e.target.value as any})} className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-2 text-sm">
                        <option value="Wood">Wood (18 lbs/LF)</option>
                        <option value="Chain Link">Chain Link (8 lbs/LF)</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={estimate.removeConcreteFootings} onChange={(e) => setEstimate({...estimate, removeConcreteFootings: e.target.checked})} className="rounded border-[#E5E5E5]" />
                      <span className="text-sm">Remove Concrete Footings (225 lbs ea)</span>
                    </label>
                  </div>
                )}
              </div>
              <div className="p-6 rounded-2xl border border-[#E5E5E5] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">Site Prep</h3>
                  <button onClick={() => setEstimate({...estimate, hasSitePrep: !estimate.hasSitePrep})} className={cn("h-6 w-12 rounded-full relative transition-all", estimate.hasSitePrep ? "bg-american-red" : "bg-[#E5E5E5]")}>
                    <div className={cn("absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all", estimate.hasSitePrep ? "right-1" : "left-1")} />
                  </button>
                </div>
                {estimate.hasSitePrep && (
                  <div className="space-y-3 pt-4 border-t border-[#F5F5F5]">
                    {['Marking Paint & Stakes', 'Vegetation Clearing', 'Obstacle Removal'].map((opt, i) => (
                      <label key={i} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={i === 0 ? estimate.needsMarking : (i === 1 ? estimate.needsClearing : estimate.obstacleRemoval)} onChange={(e) => {
                          if (i === 0) setEstimate({...estimate, needsMarking: e.target.checked});
                          if (i === 1) setEstimate({...estimate, needsClearing: e.target.checked});
                          if (i === 2) setEstimate({...estimate, obstacleRemoval: e.target.checked});
                        }} className="rounded border-[#E5E5E5]" />
                        <span className="text-sm">{opt}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Waste Allowance (%)</label>
                  <input type="range" min="0" max="25" step="1" value={estimate.wastePercentage} onChange={(e) => setEstimate({...estimate, wastePercentage: Number(e.target.value)})} className="w-full h-2 bg-[#F5F5F5] rounded-lg appearance-none cursor-pointer accent-american-blue" />
                  <div className="flex justify-between text-[10px] font-bold text-[#999999]">
                    <span>0%</span>
                    <span>{estimate.wastePercentage}%</span>
                    <span>25%</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={estimate.includeGravel} onChange={(e) => setEstimate({...estimate, includeGravel: e.target.checked})} className="rounded border-[#E5E5E5]" />
                    <span className="text-sm">Include Drainage Gravel (0.5 cu ft/hole)</span>
                  </label>
                  {defaultStyle.type === 'Wood' && (
                    <div className="space-y-3 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={estimate.includeStain} onChange={(e) => setEstimate({...estimate, includeStain: e.target.checked})} className="rounded border-[#E5E5E5]" />
                        <span className="text-sm">Include Sealant/Stain</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={estimate.hasCapAndTrim} onChange={(e) => setEstimate({...estimate, hasCapAndTrim: e.target.checked})} className="rounded border-[#E5E5E5]" />
                        <span className="text-sm">Top Trim (1x4)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={estimate.hasDoubleTrim} onChange={(e) => setEstimate({...estimate, hasDoubleTrim: e.target.checked})} className="rounded border-[#E5E5E5]" />
                        <span className="text-sm">Double Trim (1x2)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={estimate.hasTopCap} onChange={(e) => setEstimate({...estimate, hasTopCap: e.target.checked})} className="rounded border-[#E5E5E5]" />
                        <span className="text-sm">Top Cap (2x6)</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-american-blue rounded-2xl p-6 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                  <div className="american-star w-24 h-24 bg-white" />
                </div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-white/60 mb-4">Structural Specs</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-[#999999]">Footing</p>
                    <p className="text-sm font-bold">{estimate.footingType}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-[#999999]">Post Size</p>
                    <p className="text-sm font-bold">
                      {defaultStyle.type === 'Wood' ? '2-3/8" Round' : `${estimate.postWidth}" x ${estimate.postThickness}"`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-american-blue flex items-center justify-center text-white shadow-lg shadow-american-blue/20">
                <Send size={28} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-american-blue tracking-tight uppercase">Ready to Finalize?</h2>
                <p className="text-xs font-bold text-american-red uppercase tracking-widest">Review your dossier and send to headquarters.</p>
              </div>
            </div>
            
            <div className="p-8 rounded-[40px] bg-american-blue text-white shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-10">
                 <div className="american-star w-32 h-32 bg-white" />
               </div>
               <div className="relative z-10 space-y-6">
                 <div>
                   <h3 className="text-sm font-black uppercase tracking-widest text-white/60 mb-2">Customer Summary</h3>
                   <div className="grid gap-2">
                     <p className="text-2xl font-black italic">"{estimate.customerName || 'No Name Provided'}"</p>
                     <p className="text-sm font-bold opacity-80">{estimate.customerEmail || 'No Email'}</p>
                     <p className="text-sm font-bold opacity-80">{estimate.customerPhone || 'No Phone'}</p>
                     <p className="text-xs font-bold opacity-60 mt-2">{estimate.customerAddress || 'No Address'}</p>
                   </div>
                 </div>
                 
                 <div className="pt-6 border-t border-white/10">
                   <h3 className="text-sm font-black uppercase tracking-widest text-white/60 mb-2">Project Scope</h3>
                   <p className="text-4xl font-black tracking-tighter">{results.lf} <span className="text-lg opacity-40">LF</span></p>
                   <p className="text-xs font-bold opacity-60 uppercase tracking-widest mt-1">
                      {estimate.runs && estimate.runs.length > 0 ? 'Multiple Sections' : `${defaultStyle.name} • ${estimate.defaultHeight}' Height`}
                    </p>
                 </div>
               </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button 
                onClick={handleSave}
                className="flex-1 flex items-center justify-center gap-3 px-8 py-5 rounded-2xl bg-american-red text-white text-sm font-black uppercase tracking-widest hover:bg-american-red/90 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-american-red/20 outline-none"
              >
                <Send size={20} />
                Submit Dossier
              </button>
              <button 
                onClick={() => setShowInvoice(true)}
                className="flex items-center justify-center gap-3 px-8 py-5 rounded-2xl bg-white border-4 border-american-blue text-american-blue text-sm font-black uppercase tracking-widest hover:bg-american-blue/5 hover:scale-[1.02] active:scale-[0.98] transition-all outline-none"
              >
                <FileText size={20} />
                Detailed View
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-12">
      {/* Left Column: Editor */}
      <div className="lg:col-span-7 space-y-8">
        {/* Navigation & View Toggle */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-[#E5E5E5] shadow-sm overflow-x-auto no-scrollbar flex-1">
            {steps.map((s) => (
              <button 
                key={s.id}
                onClick={() => { setStep(s.id); setIsFullView(false); }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all shrink-0 text-xs font-bold uppercase tracking-wider",
                  !isFullView && step === s.id ? "bg-american-blue text-white shadow-md" : "text-[#999999] hover:bg-[#F5F5F5] hover:text-american-blue"
                )}
              >
                <s.icon size={14} />
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            ))}
          </div>
          <button 
            onClick={() => setIsFullView(!isFullView)}
            className={cn(
              "flex items-center gap-2 px-6 py-3.5 rounded-2xl border font-bold text-xs uppercase tracking-wider transition-all shadow-sm",
              isFullView ? "bg-american-blue text-white border-american-blue" : "bg-white text-american-blue border-[#E5E5E5] hover:border-american-blue"
            )}
          >
            <Map size={16} />
            {isFullView ? "Wizard View" : "Full Review"}
          </button>
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-sm border border-[#E5E5E5]">
          {isFullView ? (
            <div className="space-y-16">
              {steps.map(s => (
                <div key={s.id} className="scroll-mt-8">
                  {renderSection(s.id)}
                </div>
              ))}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                {renderSection(step)}
                
                <div className="mt-12 flex items-center justify-between pt-8 border-t border-[#E5E5E5]">
                  <button 
                    onClick={handleBack}
                    disabled={step === 1}
                    className="flex items-center gap-2 px-6 py-3 text-sm font-bold text-[#666666] hover:text-[#1A1A1A] disabled:opacity-0 transition-all"
                  >
                    <ChevronLeft size={18} />
                    Back
                  </button>
                  
                  {step < 4 ? (
                    <button 
                      onClick={handleNext}
                      className="flex items-center gap-2 rounded-xl bg-american-blue px-8 py-3 text-sm font-bold text-white hover:bg-american-blue/90 transition-all shadow-lg active:scale-95"
                    >
                      Next Step
                      <ChevronRight size={18} />
                    </button>
                  ) : (
                    <button 
                      onClick={handleSave}
                      className="flex items-center gap-2 rounded-xl bg-american-red px-8 py-3 text-sm font-bold text-white hover:bg-american-red/90 transition-all shadow-lg active:scale-95"
                    >
                      Generate & Send to CRM
                      <Send size={18} />
                    </button>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Right Column: Live Summary */}
      <div className="lg:col-span-5">
        <div className="sticky top-8 space-y-6">
          <section className="patriotic-gradient text-white rounded-3xl p-6 shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <div className="american-star w-32 h-32 bg-white" />
            </div>
            
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-white/60 mb-2">Estimated Total</h2>
            <div className="text-5xl font-bold tracking-tighter mb-8">
              {formatCurrency(results.total)}
            </div>

            <div className="space-y-4 border-t border-white/10 pt-6">
              <div className="flex justify-between text-sm">
                <span className="text-[#999999]">Materials Subtotal</span>
                <span className="font-mono">{formatCurrency(results.materialSubtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#999999]">Demolition Cost</span>
                <span className="font-mono">{formatCurrency(results.demoCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#999999]">Site Prep Cost</span>
                <span className="font-mono">{formatCurrency(results.sitePrepCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#999999]">Labor Cost</span>
                <span className="font-mono">{formatCurrency(results.laborCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#999999]">Markup ({estimate.markupPercentage}%)</span>
                <span className="font-mono">{formatCurrency(results.markup)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#999999]">Tax ({estimate.taxPercentage}%)</span>
                <span className="font-mono">{formatCurrency(results.tax)}</span>
              </div>

              {results.runBreakdown.length > 0 && (
                <div className="space-y-4 border-t border-white/10 pt-6 mt-6">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#999999]">Cost Per Run</h3>
                  {results.runBreakdown.map(run => (
                    <div key={run.id} className="flex justify-between text-sm">
                      <span className="text-[#999999]">{run.name}</span>
                      <span className="font-mono">{formatCurrency(run.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3">
              <button 
                onClick={() => setShowInvoice(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-xs font-bold text-white hover:bg-white/20 transition-colors border border-white/10"
              >
                <Download size={16} />
                Invoice
              </button>
              <button 
                onClick={() => setShowDiagram(true)}
                className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-xs font-bold text-white hover:bg-white/20 transition-colors border border-white/10"
              >
                <Map size={16} />
                Diagram
              </button>
            </div>

            {showSuccess && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute inset-x-0 bottom-0 bg-[#00FF00] p-4 text-[#1A1A1A] text-center font-bold flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={18} />
                Sent to GoHighLevel!
              </motion.div>
            )}
          </section>

          {/* Material Breakdown - Right Column */}
          <section className="bg-white rounded-3xl shadow-sm border border-[#E5E5E5] overflow-hidden flex flex-col max-h-[600px]">
            <div className="p-5 patriotic-gradient text-white relative overflow-hidden shrink-0">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <div className="american-star w-16 h-16 bg-white" />
              </div>
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-widest">Material Breakdown</h3>
                  <p className="text-[10px] text-white/70">Texas-Based Estimates</p>
                </div>
                <div className="px-3 py-1 bg-white/20 rounded-lg text-[10px] font-bold">
                  {results.items.length} Items
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {results.items.map((item, idx) => {
                const material = materials.find(m => m.name === item.name || item.name.startsWith(m.name));
                return (
                  <div key={idx} className="bg-[#F9F9F9] rounded-xl p-3 border border-[#E5E5E5] hover:border-american-blue transition-all group">
                    <div className="flex items-start gap-3">
                      {material?.imageUrl ? (
                        <div className="h-10 w-10 rounded-lg overflow-hidden bg-white border border-[#E5E5E5] shrink-0 shadow-sm">
                          <img src={material.imageUrl} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center text-[#999999] shrink-0 border border-[#E5E5E5] shadow-sm">
                          <Box size={16} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[8px] font-bold uppercase tracking-widest text-american-blue">{item.category}</span>
                          <span className="text-xs font-bold text-[#1A1A1A]">{formatCurrency(item.total)}</span>
                        </div>
                        <h4 className="text-[11px] font-bold text-[#1A1A1A] mb-2 line-clamp-1">{item.name}</h4>
                        
                        <div className="flex items-center gap-2">
                          <div className="flex-1 space-y-0.5">
                            <label className="text-[8px] font-bold uppercase tracking-wider text-[#999999]">Qty</label>
                            <input 
                              type="number" 
                              value={item.qty} 
                              onChange={(e) => {
                                const newQty = Number(e.target.value);
                                setEstimate({
                                  ...estimate,
                                  manualQuantities: {
                                    ...(estimate.manualQuantities || {}),
                                    [item.name]: newQty
                                  }
                                });
                              }}
                              className="w-full rounded-md border border-[#E5E5E5] bg-white px-2 py-1 text-[10px] font-bold focus:border-american-blue focus:outline-none"
                            />
                          </div>
                          <div className="flex-1 space-y-0.5">
                            <label className="text-[8px] font-bold uppercase tracking-wider text-[#999999]">Price</label>
                            <div className="relative">
                              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-[#999999]">$</span>
                              <input 
                                type="number" 
                                step="0.01"
                                value={item.unitCost} 
                                onChange={(e) => {
                                  const newPrice = Number(e.target.value);
                                  setEstimate({
                                    ...estimate,
                                    manualPrices: {
                                      ...(estimate.manualPrices || {}),
                                      [item.name]: newPrice
                                    }
                                  });
                                }}
                                className="w-full rounded-md border border-[#E5E5E5] bg-white pl-4 pr-2 py-1 text-[10px] font-bold focus:border-american-blue focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>

      {/* Invoice Modal */}
      <AnimatePresence>
        {showInvoice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInvoice(false)}
              className="absolute inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-[#F5F5F5] flex items-center justify-between bg-american-blue text-white">
                <div className="flex items-center gap-3">
                  <FileText size={24} />
                  <h2 className="text-xl font-bold">Estimate Invoice</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => window.print()} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                    <Printer size={20} />
                  </button>
                  <button onClick={() => setShowInvoice(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-8 print:p-0">
                <div className="flex justify-between items-start">
                  <div className="flex items-start gap-6">
                    {COMPANY_INFO.logo && (
                      <img src={COMPANY_INFO.logo} alt="Logo" className="h-20 w-auto object-contain" referrerPolicy="no-referrer" />
                    )}
                    <div>
                      <h1 className="text-3xl font-black tracking-tighter text-american-blue uppercase">{COMPANY_INFO.name}</h1>
                      <p className="text-sm text-[#666666]">{COMPANY_INFO.address}</p>
                      <p className="text-sm text-[#666666]">{COMPANY_INFO.phone} | {COMPANY_INFO.email}</p>
                      <p className="text-sm text-american-blue font-bold">{COMPANY_INFO.website}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#999999]">Estimate Date</p>
                    <p className="text-lg font-bold">{new Date().toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 py-8 border-y border-[#F5F5F5]">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#999999] mb-2">Customer Details</p>
                    <p className="text-lg font-bold">{estimate.customerName || 'Valued Customer'}</p>
                    <p className="text-sm text-[#666666]">{estimate.customerEmail || 'No email provided'}</p>
                    {estimate.customerPhone && <p className="text-sm text-[#666666]">{estimate.customerPhone}</p>}
                    {estimate.customerAddress && <p className="text-sm text-[#666666]">{estimate.customerAddress}</p>}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#999999] mb-2">Project Scope</p>
                    <p className="text-sm font-bold">
                      {(() => {
                        const styleNames = Array.from(new Set(estimate.runs?.map(r => FENCE_STYLES.find(s => s.id === r.styleId)?.name).filter(Boolean)));
                        if (styleNames.length === 0) return `${defaultStyle.name} - ${defaultVisualStyle.name}`;
                        if (styleNames.length === 1) return styleNames[0];
                        return "Multi-Style Project";
                      })()}
                    </p>
                    <p className="text-sm text-[#666666]">{results.lf} Linear Feet | {results.postCount} Posts | {results.gateCount} Gates</p>
                  </div>
                </div>

                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-american-blue/10">
                      <th className="py-4 text-xs font-bold uppercase tracking-wider text-[#999999]">Description</th>
                      <th className="py-4 text-xs font-bold uppercase tracking-wider text-[#999999] text-center">Qty</th>
                      <th className="py-4 text-xs font-bold uppercase tracking-wider text-[#999999] text-right">Unit Price</th>
                      <th className="py-4 text-xs font-bold uppercase tracking-wider text-[#999999] text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F5]">
                    {results.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-4">
                          <p className="font-bold text-sm">{item.name}</p>
                          <p className="text-[10px] text-[#999999] uppercase">{item.category}</p>
                        </td>
                        <td className="py-4 text-center text-sm">{item.qty}</td>
                        <td className="py-4 text-right text-sm font-mono">{formatCurrency(item.unitCost)}</td>
                        <td className="py-4 text-right text-sm font-bold font-mono">{formatCurrency(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex justify-end pt-8">
                  <div className="w-64 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#666666]">Subtotal</span>
                      <span className="font-mono">{formatCurrency(results.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#666666]">Tax ({estimate.taxPercentage}%)</span>
                      <span className="font-mono">{formatCurrency(results.tax)}</span>
                    </div>
                    <div className="flex justify-between pt-3 border-t-2 border-american-blue text-xl font-bold">
                      <span>Total</span>
                      <span className="text-american-blue">{formatCurrency(results.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-6 bg-[#F9F9F9] border-t border-[#F5F5F5] flex justify-between items-center">
                <p className="text-[10px] text-[#999999] font-bold uppercase tracking-widest">Generated by {COMPANY_INFO.name} Estimator</p>
                <button 
                  onClick={() => setShowInvoice(false)}
                  className="px-8 py-3 bg-american-blue text-white rounded-xl font-bold text-sm hover:bg-american-blue/90 transition-all"
                >
                  Close Preview
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Diagram Modal */}
      <AnimatePresence>
        {showDiagram && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDiagram(false)}
              className="absolute inset-0 bg-[#1A1A1A]/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-[#F5F5F5] flex items-center justify-between bg-american-red text-white">
                <div className="flex items-center gap-3">
                  <Map size={24} />
                  <h2 className="text-xl font-bold">Fence Layout Diagram</h2>
                </div>
                <button onClick={() => setShowDiagram(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-8">
                <div id="print-area" className="aspect-[11/8.5] bg-[#F5F5F5] rounded-2xl border-2 border-dashed border-[#E5E5E5] relative overflow-hidden flex items-center justify-center">
                  {/* Simple SVG Diagram optimized for 8.5x11 printing */}
                  <svg width="100%" height="100%" viewBox="0 0 1100 850" className="max-w-full">
                    <defs>
                      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E0E0E0" strokeWidth="1"/>
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                    
                    {/* Render Runs */}
                    {(() => {
                      const runsData = estimate.runs && estimate.runs.length > 0 
                        ? estimate.runs 
                        : [{ 
                            id: 'default', 
                            linearFeet: estimate.linearFeet || 100, 
                            gates: estimate.gateCount || 0, 
                            name: 'Main Run', 
                            corners: 0,
                            styleId: estimate.defaultStyleId!,
                            visualStyleId: estimate.defaultVisualStyleId!,
                            height: estimate.defaultHeight!,
                            color: estimate.defaultColor!
                          }];
                      
                      const maxSpacing = (defaultStyle.type === 'Wood' && (estimate.defaultHeight || 6) === 8) ? 6 : 8;
                      
                      // 1. Calculate raw points based on directions
                      const rawPoints: [number, number][] = [[0, 0]];
                      let currentX = 0;
                      let currentY = 0;
                      const directions = [
                        [1, 0],   // Right
                        [0, 1],   // Down
                        [-1, 0],  // Left
                        [0, -1]   // Up
                      ];
                      
                      runsData.forEach((run, i) => {
                        const dir = directions[i % 4];
                        const length = Math.max(run.linearFeet, 1); // Prevent 0-length breaking
                        currentX += dir[0] * length;
                        currentY += dir[1] * length;
                        rawPoints.push([currentX, currentY]);
                      });
                      
                      // 2. Calculate bounding box
                      const xs = rawPoints.map(p => p[0]);
                      const ys = rawPoints.map(p => p[1]);
                      const minX = Math.min(...xs);
                      const maxX = Math.max(...xs);
                      const minY = Math.min(...ys);
                      const maxY = Math.max(...ys);
                      const rawWidth = maxX - minX;
                      const rawHeight = maxY - minY;
                      
                      // 3. Scale and offset to fit SVG viewBox (1100x850 - Landscape Letter)
                      // Internal padding to ensure labels (which are offset from lines) don't get cut off
                      const paddingX = 100;
                      const paddingY = 120;
                      const availWidth = 1100 - paddingX * 2;
                      const availHeight = 850 - paddingY * 2;
                      
                      let scale = 1;
                      if (rawWidth > 0 && rawHeight > 0) {
                        scale = Math.min(availWidth / rawWidth, availHeight / rawHeight);
                      } else if (rawWidth > 0) {
                        scale = availWidth / rawWidth;
                      } else if (rawHeight > 0) {
                        scale = availHeight / rawHeight;
                      }
                      
                      // Cap scale to prevent tiny fences from looking gigantic, but allow it to be larger for better fit
                      scale = Math.min(scale, 25);
                      
                      const scaledWidth = rawWidth * scale;
                      const scaledHeight = rawHeight * scale;
                      
                      const offsetX = paddingX + (availWidth - scaledWidth) / 2 - minX * scale;
                      const offsetY = paddingY + (availHeight - scaledHeight) / 2 - minY * scale;
                      
                      const scaledPoints = rawPoints.map(p => [
                        p[0] * scale + offsetX,
                        p[1] * scale + offsetY
                      ]);
                      
                      return (
                        <g>
                          {/* Draw lines */}
                          {scaledPoints.map((p, i) => {
                            if (i === scaledPoints.length - 1) return null;
                            const nextP = scaledPoints[i + 1];
                            const run = runsData[i];
                            const dirIndex = i % 4;
                            
                            const midX = p[0] + (nextP[0] - p[0]) / 2;
                            const midY = p[1] + (nextP[1] - p[1]) / 2;
                            
                            const runStyle = FENCE_STYLES.find(s => s.id === run.styleId) || defaultStyle;
                            const runVisualStyle = runStyle.visualStyles.find(vs => vs.id === run.visualStyleId) || runStyle.visualStyles[0];

                            const runGateWidth = (run.gateDetails || []).reduce((sum: number, g: any) => sum + (g.width || 0), 0) || ((run.gates || 0) * 4);
                            const fenceLinearFeet = Math.max(0, run.linearFeet - runGateWidth);
                            const spacingLimit = (runStyle.type === 'Wood' && run.height === 8) ? 6 : 8;
                            const sections = Math.max(1, Math.ceil(fenceLinearFeet / spacingLimit));
                            const spacing = fenceLinearFeet / sections;
                            
                            const linePostsCoords = [];
                            for (let j = 1; j < sections; j++) {
                               const fraction = j / sections;
                               const currentDistanceLF = run.linearFeet * fraction;
                               
                               const isInsideGate = (run.gateDetails || []).some(g => {
                                 const start = g.position || 0;
                                 return currentDistanceLF > (start - 0.5) && currentDistanceLF < (start + g.width + 0.5);
                               });

                               if (!isInsideGate) {
                                 linePostsCoords.push([
                                   p[0] + (nextP[0] - p[0]) * fraction,
                                   p[1] + (nextP[1] - p[1]) * fraction
                                 ]);
                               }
                            }
                            
                            let textOffsetX = 0;
                            let textOffsetY = 0;
                            let textAnchor = "middle";
                            
                            if (dirIndex === 0) { // Right
                              textOffsetY = -80;
                            } else if (dirIndex === 1) { // Down
                              textOffsetX = 80;
                              textAnchor = "start";
                            } else if (dirIndex === 2) { // Left
                              textOffsetY = 95;
                            } else if (dirIndex === 3) { // Up
                              textOffsetX = -80;
                              textAnchor = "end";
                            }
                            
                            return (
                              <g key={`l-${i}`}>
                                <line x1={p[0]} y1={p[1]} x2={nextP[0]} y2={nextP[1]} stroke="#3C3B6E" strokeWidth="10" strokeLinecap="round" />
                                {linePostsCoords.map((pc, pIdx) => (
                                  <circle key={`lp-${i}-${pIdx}`} cx={pc[0]} cy={pc[1]} r="8" fill="#A5A5A5" stroke="#FFFFFF" strokeWidth="2" />
                                ))}
                                <text 
                                  x={midX + textOffsetX} 
                                  y={midY + textOffsetY} 
                                  textAnchor={textAnchor as any} 
                                  className="text-[16px] font-bold fill-american-blue"
                                  style={{ paintOrder: 'stroke', stroke: 'white', strokeWidth: '5px', strokeLinecap: 'round', strokeLinejoin: 'round' }}
                                >
                                  <tspan x={midX + textOffsetX} dy="0" className="text-[18px] font-black">{run?.name} ({run?.linearFeet}')</tspan>
                                  <tspan x={midX + textOffsetX} dy="20" className="text-[14px] fill-american-blue/80 font-bold">
                                    {runStyle.name}{runStyle.type === 'Wood' && ` (${run.woodType || estimate.woodType})`} - {runVisualStyle.name}
                                  </tspan>
                                  {runStyle.type === 'Metal' && (
                                    <tspan x={midX + textOffsetX} dy="18" className="text-[12px] fill-american-blue/60 font-medium italic">
                                      {run.ironRails || estimate.ironRails} | {run.ironTop || estimate.ironTop}
                                    </tspan>
                                  )}
                                  <tspan x={midX + textOffsetX} dy={runStyle.type === 'Metal' ? "18" : "18"} className="text-[12px] fill-american-red font-black uppercase tracking-tighter">{(run.height || estimate.defaultHeight)}' H | Spacing: {formatFeetInches(spacing)} OC</tspan>
                                </text>
                              </g>
                            );
                          })}
                          
                           {/* Draw Gates for each run */}
                           {runsData.map((run, rIdx) => {
                             const gatesToDraw = run.gateDetails || Array.from({ length: run.gates || 0 }).map((_, i) => ({ id: `old-${i}`, type: 'Single' as const, width: 4, position: (run.linearFeet - 4) / 2 }));
                             if (gatesToDraw.length === 0) return null;
                             
                             const p1 = scaledPoints[rIdx];
                             const p2 = scaledPoints[rIdx + 1];
                             const dirIndex = rIdx % 4;
                             const isHorizontal = dirIndex % 2 === 0;
                             
                             return gatesToDraw.map((gate, gIdx) => {
                               const gateCenterLF = (gate.position || 0) + (gate.width / 2);
                               const fraction = gateCenterLF / run.linearFeet;
                               const x = p1[0] + (p2[0] - p1[0]) * fraction;
                               const y = p1[1] + (p2[1] - p1[1]) * fraction;
                               
                               const visualWidth = gate.width * scale;
                               const halfWidth = visualWidth / 2;
                               
                               const gateLabel = `${gate.type === 'Double' ? 'DBL ' : ''}GATE (${gate.width}')`;
                               
                               return (
                                 <g key={`g-${rIdx}-${gIdx}`} transform={`translate(${x}, ${y})`}>
                                   {isHorizontal ? (
                                     <>
                                       <rect x={-halfWidth} y="-8" width={visualWidth} height="16" fill="#F5F5F5" />
                                       <line x1={-halfWidth} y1="0" x2={halfWidth} y2="0" stroke="#B22234" strokeWidth="5" />
                                       <circle cx={-halfWidth} cy="0" r="8" fill="#B22234" />
                                       <circle cx={halfWidth} cy="0" r="8" fill="#B22234" />
                                       {gate.type === 'Double' && <circle cx="0" cy="0" r="5" fill="#B22234" />}
                                       <text y="25" textAnchor="middle" className="text-[14px] font-bold fill-american-red" style={{ paintOrder: 'stroke', stroke: 'white' }}>{gateLabel}</text>
                                     </>
                                   ) : (
                                     <>
                                       <rect x="-8" y={-halfWidth} width="16" height={visualWidth} fill="#F5F5F5" />
                                       <line x1="0" y1={-halfWidth} x2="0" y2={halfWidth} stroke="#B22234" strokeWidth="5" />
                                       <circle cx="0" cy={-halfWidth} r="8" fill="#B22234" />
                                       <circle cx="0" cy={halfWidth} r="8" fill="#B22234" />
                                       {gate.type === 'Double' && <circle cx="0" cy="0" r="5" fill="#B22234" />}
                                       <text x="25" y="4" textAnchor="start" className="text-[14px] font-bold fill-american-red" style={{ paintOrder: 'stroke', stroke: 'white' }}>{gateLabel}</text>
                                     </>
                                   )}
                                 </g>
                               );
                             });
                           })}
                          
                          {/* Draw Posts (on top of lines and gates) */}
                          {scaledPoints.map((p, i) => {
                            const isStart = i === 0;
                            const isEnd = i === scaledPoints.length - 1;
                            const isCorner = !isStart && !isEnd;
                            
                            if (isCorner) {
                              return <rect key={`p-${i}`} x={p[0]-10} y={p[1]-10} width="20" height="20" fill="#3C3B6E" />;
                            } else {
                              return <circle key={`p-${i}`} cx={p[0]} cy={p[1]} r="10" fill="#B22234" />
                            }
                          })}
                        </g>
                      );
                    })()}
                  </svg>
                  
                    <div className="absolute bottom-6 left-6 flex gap-4">
                      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-[#E5E5E5] shadow-sm">
                        <div className="w-3 h-3 bg-american-red rounded-full" />
                        <span className="text-[10px] font-bold uppercase">End Post</span>
                      </div>
                      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-[#E5E5E5] shadow-sm">
                        <div className="w-3 h-3 bg-american-blue rounded-sm" />
                        <span className="text-[10px] font-bold uppercase">Corner Post</span>
                      </div>
                      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-[#E5E5E5] shadow-sm">
                        <div className="w-3 h-3 bg-[#A5A5A5] rounded-full border border-white" />
                        <span className="text-[10px] font-bold uppercase">Line Post</span>
                      </div>
                    </div>
                </div>

                <div className="mt-8 grid grid-cols-3 gap-6">
                  <div className="p-4 rounded-2xl bg-[#F9F9F9] border border-[#E5E5E5]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#999999] mb-1">Total Length</p>
                    <p className="text-xl font-bold">{results.lf} LF</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#F9F9F9] border border-[#E5E5E5]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#999999] mb-1">Total Posts</p>
                    <p className="text-xl font-bold">{results.postCount}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#F9F9F9] border border-[#E5E5E5]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#999999] mb-1">Total Gates</p>
                    <p className="text-xl font-bold">{results.gateCount}</p>
                  </div>
                </div>
              </div>
              
              <div className="p-6 bg-[#F9F9F9] border-t border-[#F5F5F5] flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] text-american-red font-bold uppercase tracking-widest">Printing Issue?</p>
                  <p className="text-[9px] text-[#999999] max-w-[200px] leading-tight italic">
                    The browser blocks printing inside this preview window. Use the red button to open the app in a new tab where printing is enabled.
                  </p>
                </div>
                <div className="flex gap-3">
                  <a 
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3 bg-white border-2 border-american-red text-american-red rounded-xl font-bold text-sm hover:bg-american-red/5 transition-all flex items-center gap-2 shadow-sm"
                  >
                    <Share2 size={18} />
                    Open in New Tab
                  </a>
                  <button 
                    onClick={() => {
                      window.focus();
                      window.print();
                    }}
                    className="px-6 py-3 bg-white border-2 border-american-blue text-american-blue rounded-xl font-bold text-sm hover:bg-american-blue/5 transition-all flex items-center gap-2 shadow-sm"
                  >
                    <Printer size={18} />
                    Print Diagram
                  </button>
                  <button 
                    onClick={() => setShowDiagram(false)}
                    className="px-8 py-3 bg-american-blue text-white rounded-xl font-bold text-sm hover:bg-american-blue/90 transition-all shadow-md"
                  >
                    Close Diagram
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
