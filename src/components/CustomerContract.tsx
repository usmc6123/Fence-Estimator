import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Printer, FileText, Sparkles, Loader2, Download, Send, CheckCircle2, Navigation, RefreshCcw, Save, TrendingUp, ExternalLink, AlertCircle, Trash2 } from 'lucide-react';
import { Estimate, MaterialItem, LaborRates, SupplierQuote, CustomContractLineItem } from '../types';
import { calculateDetailedTakeOff, DetailedTakeOff } from '../lib/calculations';
import { cn, formatCurrency, getEstimateFinalPrice } from '../lib/utils';
import { COMPANY_INFO, FENCE_STYLES } from '../constants';
import { generateAIScope } from '../services/geminiService';

interface CustomerContractProps {
  estimate: Partial<Estimate>;
  materials: MaterialItem[];
  laborRates: LaborRates;
  quotes: SupplierQuote[];
  aiContractScope: string | null;
  setAiContractScope: (scope: string | null) => void;
  onUpdateEstimate?: (update: Partial<Estimate>) => void;
  isCustomerView?: boolean;
}

export default function CustomerContract({ 
  estimate, 
  materials, 
  laborRates,
  quotes,
  aiContractScope,
  setAiContractScope,
  onUpdateEstimate,
  isCustomerView = false
}: CustomerContractProps) {
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const y = date.getFullYear();
      return `${m}/${d}/${y}`;
    } catch {
      return '';
    }
  };

  // Gracefully resolve customer metadata preferring contractSnapshot in customer view
  const resolvedMetaSource = React.useMemo(() => {
    if (isCustomerView && estimate.contractSnapshot) {
      return {
        ...estimate,
        ...estimate.contractSnapshot
      };
    }
    return estimate;
  }, [estimate, isCustomerView]);

  const resolvedClientName = React.useMemo(() => {
    let name = resolvedMetaSource.customerName || 'Valued Customer';
    const email = resolvedMetaSource.customerEmail || '';
    if (email && !email.includes('@') && name && !name.toLowerCase().includes(email.toLowerCase())) {
      name = `${name} ${email}`.trim();
    }
    return name;
  }, [resolvedMetaSource.customerName, resolvedMetaSource.customerEmail]);

  const resolvedClientEmail = React.useMemo(() => {
    const email = resolvedMetaSource.customerEmail || '';
    if (email && !email.includes('@')) {
      return '';
    }
    return email;
  }, [resolvedMetaSource.customerEmail]);

  // Resolve materials based on chosen strategy
  const pricingStrategy = estimate.pricingStrategy || 'best';
  const selectedSupplier = estimate.selectedSupplier || '';

  const resolvedMaterials = React.useMemo(() => {
    let resolved = materials;
    if (pricingStrategy === 'supplier' && selectedSupplier) {
      const supplierQuotes = quotes
        .filter(q => q.supplierName === selectedSupplier)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      resolved = materials.map(m => {
        let quotedPrice: number | undefined;
        for (const quote of supplierQuotes) {
          const item = quote.items.find(i => i.mappedMaterialId === m.id);
          if (item) {
            quotedPrice = item.unitPrice;
            break;
          }
        }

        if (quotedPrice !== undefined) {
          return { ...m, cost: quotedPrice };
        }
        return m;
      });
    }
    return resolved;
  }, [materials, pricingStrategy, selectedSupplier, quotes]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [localAiScope, setLocalAiScope] = useState<string>(estimate.contractScope || '');
  const [customInstructions, setCustomInstructions] = useState<string>('');

  const handleScopeChange = (val: string) => {
    setLocalAiScope(val);
    if (onUpdateEstimate) {
      onUpdateEstimate({ contractScope: val });
    }
  };
  const [showCostBreakdown, setShowCostBreakdown] = useState(true);
  const [sectionTotals, setSectionTotals] = useState<(number | null)[]>(estimate.manualSectionTotals || []);
  const [gateTotals, setGateTotals] = useState<(number | null)[]>(estimate.manualGateTotals || []);
  const [demoTotals, setDemoTotals] = useState<(number | null)[]>(estimate.manualDemoTotals || []);

  const [manualGrandTotal, setManualGrandTotal] = useState<number | null>(estimate.manualGrandTotal ?? null);
  const [projectDate, setProjectDate] = useState<string>(estimate.contractProjectDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
  const [manualGatePrices, setManualGatePrices] = useState<Record<string, number>>(estimate.manualGatePrices || {});
  const [customLineItems, setCustomLineItems] = useState<CustomContractLineItem[]>(estimate.customContractLineItems || []);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const isInitialMount = React.useRef(true);

  const customContractLineItemsTotal = React.useMemo(() => {
    return customLineItems
      .filter(item => item.showOnContract)
      .reduce((sum, item) => sum + item.amount, 0);
  }, [customLineItems]);

  const handleAddCustomLineItem = () => {
    const newItem: CustomContractLineItem = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      amount: 0,
      taxable: false,
      showOnContract: true,
      includeInPricePerFoot: false,
      sortOrder: customLineItems.length + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updated = [...customLineItems, newItem];
    setCustomLineItems(updated);
    setHasUnsavedChanges(true);
  };

  const handleUpdateCustomLineItem = (id: string, updates: Partial<CustomContractLineItem>) => {
    const updated = customLineItems.map(item => {
      if (item.id === id) {
        return {
          ...item,
          ...updates,
          updatedAt: new Date().toISOString()
        };
      }
      return item;
    });
    setCustomLineItems(updated);
    setHasUnsavedChanges(true);
  };

  const handleDeleteCustomLineItem = (id: string) => {
    const updated = customLineItems.filter(item => item.id !== id);
    setCustomLineItems(updated);
    setHasUnsavedChanges(true);
  };

  const data: DetailedTakeOff = React.useMemo(() => {
    if (isCustomerView && estimate.contractSnapshot) {
      const snap = estimate.contractSnapshot;
      const snapRuns = snap.runs || [];
      const costSummaryRuns = snap.costSummaryRuns || [];
      const runsToUse = costSummaryRuns.length > 0 ? costSummaryRuns : snapRuns;
      
      const mockCalculated: DetailedTakeOff = {
        summary: [],
        manualSummary: [],
        runs: [],
        totals: {
          material: 0,
          labor: 0,
          demo: Number(snap.demoRemovalPrice || snap.demoTotal || 0),
          prep: Number(snap.addOnSitePrepPrice || 0),
          subtotal: Number(snap.subtotalBeforeDiscount || 0),
          markup: 0,
          tax: 0,
          grandTotal: Number(snap.finalCustomerPrice || snap.totalInvestment || 0)
        },
        pricing: {
          runsPricing: (runsToUse as any[]).map((run, i) => {
            const finalFenceValue = run.fenceTotal !== undefined ? run.fenceTotal : (run.totalFenceCharge || run.finalFence || 0);
            const finalGateValue = run.gatesTotal !== undefined ? run.gatesTotal : (run.totalGateCharge || run.finalGate || 0);
            const finalDemoValue = run.demoTotal !== undefined ? run.demoTotal : (run.demoCharge || run.finalDemo || 0);
            return {
              runName: run.runName || run.name || `Section ${i + 1}`,
              totalFenceCharge: Number(finalFenceValue),
              totalGateCharge: Number(finalGateValue),
              demoCharge: Number(finalDemoValue),
              finalFence: Number(finalFenceValue),
              finalGate: Number(finalGateValue),
              finalDemo: Number(finalDemoValue),
              totalSection: Number(run.sectionTotal || run.totalSectionCharge || (Number(finalFenceValue) + Number(finalGateValue) + Number(finalDemoValue))),
              netLF: Number(run.linearFeet !== undefined ? run.linearFeet : (run.netLF || 0))
            };
          }),
          totalSectionsSum: Number(snap.baseFencePrice || snap.fenceTotal || 0),
          addOnSitePrepPrice: Number(snap.addOnSitePrepPrice || 0),
          demoRemovalPrice: Number(snap.demoRemovalPrice || snap.demoTotal || 0),
          discountAmount: Number(snap.discountAmount || 0),
          manualGrandTotal: snap.manualGrandTotal !== undefined ? snap.manualGrandTotal : null,
          baseFenceTotal: Number(snap.baseFenceTotal || snap.baseFencePrice || snap.fenceTotal || 0),
          additionalContractLineItemsTotal: Number(snap.additionalContractLineItemsTotal || snap.customContractLineItemsTotal || 0),
          calculatedTotal: Number(snap.calculatedGrandTotal || snap.subtotalBeforeDiscount || 0),
          finalCustomerPrice: Number(snap.finalCustomerPrice || snap.totalInvestment || 0),
          estimatedPrice: Number(snap.finalCustomerPrice || snap.totalInvestment || 0),
          grandTotal: Number(snap.finalCustomerPrice || snap.totalInvestment || 0),
          subtotalBeforeDiscount: Number(snap.subtotalBeforeDiscount || 0),
          pricePerFoot: Number(snap.pricePerFoot || 0)
        }
      };
      return mockCalculated;
    }

    const mergedEstimate = {
      ...estimate,
      manualSectionTotals: sectionTotals,
      manualGateTotals: gateTotals,
      manualDemoTotals: demoTotals,
      manualGrandTotal: manualGrandTotal,
      manualGatePrices: manualGatePrices,
      customContractLineItems: customLineItems,
      customContractLineItemsTotal: customContractLineItemsTotal
    };
    const calculated = calculateDetailedTakeOff(mergedEstimate, resolvedMaterials, laborRates);
    
    return calculated;
  }, [estimate, resolvedMaterials, laborRates, sectionTotals, gateTotals, demoTotals, manualGrandTotal, manualGatePrices, isCustomerView, customLineItems, customContractLineItemsTotal]);

  const markupFactor = 1 + (estimate.markupPercentage || 0) / 100;
  const taxFactor = (estimate.taxPercentage || 0) / 100;

  // Calculate project financial breakdown for component use
  const projectBreakdown = React.useMemo(() => {
    if (isCustomerView && estimate.contractSnapshot) {
      const snap = estimate.contractSnapshot;
      const snapRuns = snap.runs || [];
      const costSummaryRuns = snap.costSummaryRuns || [];
      const runsToUse = costSummaryRuns.length > 0 ? costSummaryRuns : snapRuns;

      return (runsToUse as any[]).map((run, i) => {
        const finalFenceValue = run.fenceTotal !== undefined ? run.fenceTotal : (run.totalFenceCharge !== undefined ? run.totalFenceCharge : (run.finalFence || 0));
        const finalGateValue = run.gatesTotal !== undefined ? run.gatesTotal : (run.totalGateCharge !== undefined ? run.totalGateCharge : (run.finalGate || 0));
        const finalDemoValue = run.demoTotal !== undefined ? run.demoTotal : (run.demoCharge !== undefined ? run.demoCharge : (run.finalDemo || 0));
        return {
          name: run.runName || run.name || `Section ${i + 1}`,
          netLF: run.linearFeet !== undefined ? Number(run.linearFeet) : (run.netLF || 0),
          totalFenceCharge: Number(finalFenceValue),
          pricePerFoot: Number(run.fenceRate !== undefined ? run.fenceRate : (run.pricePerFoot || 0)),
          totalGateCharge: Number(finalGateValue),
          demoCharge: Number(finalDemoValue),
          gates: run.gateDetails || run.gates || [],
          style: run.fenceType || run.styleName || run.styleId || run.style || '',
          styleType: run.styleType || '',
          height: run.height || 6,
          hasRotBoard: !!run.hasRotBoard,
          hasTopCap: !!run.hasTopCap,
          hasTrim: !!run.hasTrim,
          picketStyle: run.picketStyle || '',
          ironInstallType: run.ironInstallType || '',
          ironPanelType: run.ironPanelType || '',
          chainLinkFabricGauge: run.chainLinkFabricGauge || '',
        };
      });
    }

    return data.runs.map(run => {
      // Fence Charge = Base Labor + Base Materials + Markup + Tax on Materials
      const baseFenceCharge = (run.fenceMaterialCost + run.fenceLaborCost) * markupFactor;
      const fenceTax = run.fenceMaterialCost * taxFactor;
      const totalFenceCharge = baseFenceCharge + fenceTax;
      
      // Gate Charge calculation with fallback for missing labor in summary fields
      // We calculate from items to ensure parity with the Custom Gate Access Systems section
      const summedGatesTotal = (run.gates || []).reduce((acc: number, gate: any) => {
        const items = gate.items || [];
        const subtotal = items.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
        const nonLaborSubtotal = items.filter((i: any) => i.category !== 'Labor').reduce((sum: number, item: any) => sum + (item.total || 0), 0);
        return acc + (subtotal * markupFactor) + (nonLaborSubtotal * taxFactor);
      }, 0);

      const baseGateCharge = (run.gateMaterialCost + run.gateLaborCost) * markupFactor;
      const gateTax = run.gateMaterialCost * taxFactor;
      const summaryGateTotal = baseGateCharge + gateTax;

      // Fallback: Use summed total if it's greater than summary total and labor in summary is missing/zero
      const totalGateCharge = (summedGatesTotal > summaryGateTotal && (run.gateLaborCost === 0 || !run.gateLaborCost)) 
        ? summedGatesTotal 
        : summaryGateTotal;

      // Demo Charge
      const demoCharge = run.demoCharge * markupFactor;

      return {
        name: run.runName,
        netLF: run.netLF,
        totalFenceCharge,
        pricePerFoot: run.netLF > 0 ? totalFenceCharge / run.netLF : 0,
        totalGateCharge,
        demoCharge,
        gates: run.gates,
        style: run.styleName,
        styleType: run.styleType,
        height: run.height,
        hasRotBoard: run.hasRotBoard,
        hasTopCap: run.hasTopCap,
        hasTrim: run.hasTrim,
        picketStyle: run.picketStyle,
        ironInstallType: run.ironInstallType,
        ironPanelType: run.ironPanelType,
        chainLinkFabricGauge: run.chainLinkFabricGauge
      };
    });
  }, [data.runs, markupFactor, taxFactor, isCustomerView, estimate.contractSnapshot]);

  // Sync state if estimate changes (e.g. from Estimator tab)
  useEffect(() => {
    if (estimate.manualSectionTotals) setSectionTotals(estimate.manualSectionTotals);
    if (estimate.manualGateTotals) setGateTotals(estimate.manualGateTotals);
    if (estimate.manualDemoTotals) setDemoTotals(estimate.manualDemoTotals);
    if (estimate.manualGrandTotal !== undefined) setManualGrandTotal(estimate.manualGrandTotal);
    if (estimate.customContractLineItems) setCustomLineItems(estimate.customContractLineItems);
  }, [estimate.manualSectionTotals, estimate.manualGateTotals, estimate.manualDemoTotals, estimate.manualGrandTotal, estimate.customContractLineItems]);

  const handleResetManualOverrides = () => {
    if (confirm('Are you sure you want to reset all manual price overrides to calculated values?')) {
      setSectionTotals([]);
      setGateTotals([]);
      setDemoTotals([]);
      setManualGrandTotal(null);
      setManualGatePrices({});
      if (onUpdateEstimate) {
        onUpdateEstimate({
          manualSectionTotals: [],
          manualGateTotals: [],
          manualDemoTotals: [],
          manualGrandTotal: null,
          manualGatePrices: {}
        });
      }
    }
  };

  const handleSectionTotalChange = (idx: number, val: number) => {
    const newTotals = [...sectionTotals];
    while (newTotals.length <= idx) newTotals.push(null);
    newTotals[idx] = val;
    setSectionTotals(newTotals);
    if (onUpdateEstimate) {
      onUpdateEstimate({ manualSectionTotals: newTotals });
    }
  };

  const handleGateTotalChange = (idx: number, val: number) => {
    const newTotals = [...gateTotals];
    while (newTotals.length <= idx) newTotals.push(null);
    newTotals[idx] = val;
    setGateTotals(newTotals);
    if (onUpdateEstimate) {
      onUpdateEstimate({ manualGateTotals: newTotals });
    }
  };

  const handleDemoTotalChange = (idx: number, val: number) => {
    const newTotals = [...demoTotals];
    while (newTotals.length <= idx) newTotals.push(null);
    newTotals[idx] = val;
    setDemoTotals(newTotals);
    if (onUpdateEstimate) {
      onUpdateEstimate({ manualDemoTotals: newTotals });
    }
  };

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setHasUnsavedChanges(true);
  }, [localAiScope, sectionTotals, gateTotals, demoTotals, manualGrandTotal, projectDate, manualGatePrices]);

  useEffect(() => {
    // Initial load from estimate shouldn't trigger unsaved changes
    setHasUnsavedChanges(false);
  }, [estimate.id]);

  useEffect(() => {
    if (aiContractScope) {
      setLocalAiScope(aiContractScope);
    }
  }, [aiContractScope]);

  useEffect(() => {
    // If the estimate has a scope but we don't have one locally/globally, use the estimate's
    if (estimate.contractScope && !aiContractScope && !localAiScope) {
      setLocalAiScope(estimate.contractScope);
      setAiContractScope(estimate.contractScope);
    }
  }, [estimate.contractScope]);

  // Synchronize computed contract prices automatically back to parent store / Firestore
  useEffect(() => {
    if (isCustomerView) return;
    if (!onUpdateEstimate) return;

    const finalPrice = Number(data.pricing.finalCustomerPrice || 0);
    const manualGT = manualGrandTotal !== null ? Number(manualGrandTotal) : null;
    const calcGT = Number(data.pricing.calculatedTotal || 0);
    const estPrice = finalPrice;
    const gTotal = finalPrice;
    const totInvest = finalPrice;
    const pPerFoot = Number(data.pricing.pricePerFoot || 0);
    const subtotal = Number(data.pricing.subtotalBeforeDiscount || 0);
    const baseFence = Number(data.pricing.totalSectionsSum || 0);
    const sitePrep = Number(data.pricing.addOnSitePrepPrice || 0);
    const demoRemoval = Number(data.pricing.demoRemovalPrice || 0);
    const discount = Number(data.pricing.discountAmount || 0);

    const diff = 
      (estimate.finalCustomerPrice === undefined ? null : Number(estimate.finalCustomerPrice)) !== finalPrice ||
      (estimate.manualGrandTotal === undefined ? null : (estimate.manualGrandTotal === null ? null : Number(estimate.manualGrandTotal))) !== manualGT ||
      (estimate.estimatedPrice === undefined ? null : Number(estimate.estimatedPrice)) !== estPrice ||
      (estimate.grandTotal === undefined ? null : Number(estimate.grandTotal)) !== gTotal ||
      (estimate.totalInvestment === undefined ? null : Number(estimate.totalInvestment)) !== totInvest ||
      (estimate.pricePerFoot === undefined ? null : Number(estimate.pricePerFoot)) !== pPerFoot ||
      (estimate.subtotalBeforeDiscount === undefined ? null : Number(estimate.subtotalBeforeDiscount)) !== subtotal ||
      (estimate.baseFencePrice === undefined ? null : Number(estimate.baseFencePrice)) !== baseFence ||
      (estimate.addOnSitePrepPrice === undefined ? null : Number(estimate.addOnSitePrepPrice)) !== sitePrep ||
      (estimate.demoRemovalPrice === undefined ? null : Number(estimate.demoRemovalPrice)) !== demoRemoval ||
      (estimate.discountAmount === undefined ? null : Number(estimate.discountAmount)) !== discount ||
      (estimate.calculatedGrandTotal === undefined ? null : Number(estimate.calculatedGrandTotal)) !== calcGT;

    if (diff) {
      onUpdateEstimate({
        finalCustomerPrice: finalPrice,
        manualGrandTotal: manualGT,
        estimatedPrice: estPrice,
        grandTotal: gTotal,
        totalInvestment: totInvest,
        pricePerFoot: pPerFoot,
        subtotalBeforeDiscount: subtotal,
        baseFencePrice: baseFence,
        addOnSitePrepPrice: sitePrep,
        demoRemovalPrice: demoRemoval,
        discountAmount: discount,
        calculatedGrandTotal: calcGT,
        pricingUpdatedAt: new Date().toISOString()
      });
    }
  }, [
    estimate.id,
    data.pricing,
    manualGrandTotal,
    onUpdateEstimate,
    isCustomerView,
    estimate.finalCustomerPrice,
    estimate.manualGrandTotal,
    estimate.estimatedPrice,
    estimate.grandTotal,
    estimate.totalInvestment,
    estimate.pricePerFoot,
    estimate.subtotalBeforeDiscount,
    estimate.baseFencePrice,
    estimate.addOnSitePrepPrice,
    estimate.demoRemovalPrice,
    estimate.discountAmount,
    estimate.calculatedGrandTotal
  ]);

  // Check if all runs are homogenous (same specs)
  const isHomogeneous = Array.isArray(projectBreakdown) && projectBreakdown.length > 1 && projectBreakdown.every(r => {
    if (!r || !projectBreakdown[0]) return false;
    const style1 = r.style || '';
    const style2 = projectBreakdown[0].style || '';
    const isWood = style1.includes('Wood') || style1.includes('Cedar') || style1.includes('Pine');
    return style1 === style2 && 
      r.height === projectBreakdown[0].height &&
      (!isWood || (
        r.hasRotBoard === projectBreakdown[0].hasRotBoard &&
        r.hasTopCap === projectBreakdown[0].hasTopCap &&
        r.hasTrim === projectBreakdown[0].hasTrim &&
        r.picketStyle === projectBreakdown[0].picketStyle
      )) &&
      (style1 !== 'Wrought Iron' || (
        r.ironInstallType === projectBreakdown[0].ironInstallType &&
        r.ironPanelType === projectBreakdown[0].ironPanelType
      ));
  });

  const baseFenceTotal = data.pricing.baseFenceTotal || 0;
  const finalProjectTotal = data.pricing.finalCustomerPrice || 0;

  // Debug Pricing Breakdown (Console logs as requested)
  useEffect(() => {
    const calculatedFenceInstallationTotal = data.pricing.totalSectionsSum + data.pricing.addOnSitePrepPrice - data.pricing.discountAmount;
    const displayFenceInstallationTotal = baseFenceTotal;
    const displayAdditionalItemsTotal = customContractLineItemsTotal;
    const displayTotalInvestment = finalProjectTotal;

    console.log('Contract Display Debug:', {
      calculatedFenceInstallationTotal,
      customContractLineItemsTotal,
      existingFinalContractTotal: data.pricing.finalCustomerPrice,
      displayFenceInstallationTotal,
      displayAdditionalItemsTotal,
      displayTotalInvestment
    });
  }, [data.pricing, baseFenceTotal, customContractLineItemsTotal, finalProjectTotal]);

  const grandTotal = data.pricing.finalCustomerPrice;
  const isGrandTotalOverridden = manualGrandTotal !== null;
  const hasSectionOverrides = sectionTotals.some(t => t !== null) || gateTotals.some(t => t !== null) || demoTotals.some(t => t !== null);
  const globalPricePerFoot = data.pricing.pricePerFoot;

  const getVal = (overrideVal: number | null | undefined, snapVal: number) => {
    if (isCustomerView && estimate.contractSnapshot) return snapVal;
    return overrideVal !== null && overrideVal !== undefined ? overrideVal : snapVal;
  };

  const handleGatePriceChange = (runIdx: number, gateId: string, newPrice: number) => {
    const updatedPrices = { ...manualGatePrices, [gateId]: newPrice };
    setManualGatePrices(updatedPrices);

    // Calculate new total for this run
    const run = projectBreakdown[runIdx];
    const newRunGateTotal = run.gates.reduce((sum, g) => {
      const calculatedPrice = (g.items.reduce((acc, i) => acc + i.total, 0) * markupFactor) + 
                           (g.items.filter(i => i.category !== 'Labor').reduce((acc, i) => acc + i.total, 0) * taxFactor);
      return sum + (updatedPrices[g.gateId] ?? calculatedPrice);
    }, 0);

    const newGateTotals = gateTotals.length ? [...gateTotals] : projectBreakdown.map(r => r.totalGateCharge);
    newGateTotals[runIdx] = newRunGateTotal;
    setGateTotals(newGateTotals);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSaveContract = () => {
    if (onUpdateEstimate) {
      const wasDecisionMade = estimate.customerDecision === 'accepted' || estimate.customerDecision === 'declined' || !!estimate.customerSignature;
      const pricingUpdates = {
        finalCustomerPrice: data.pricing.finalCustomerPrice,
        estimatedPrice: data.pricing.estimatedPrice,
        grandTotal: data.pricing.grandTotal,
        totalCost: data.pricing.grandTotal,
        total: data.pricing.grandTotal,
        subtotalBeforeDiscount: data.pricing.subtotalBeforeDiscount,
        addOnSitePrepPrice: data.pricing.addOnSitePrepPrice,
        demoRemovalPrice: data.pricing.demoRemovalPrice,
        discountAmount: data.pricing.discountAmount,
        pricePerFoot: data.pricing.pricePerFoot,
        baseFenceTotal: baseFenceTotal,
        additionalContractLineItemsTotal: customContractLineItemsTotal,
        materialTakeoffFinalTotal: data.pricing.materialTakeoffFinalTotal,
        fenceRunMaterialTotal: data.pricing.fenceRunMaterialTotal,
        customMaterialTotal: data.pricing.customMaterialTotal,
        customerContractMaterialSource: data.pricing.customerContractMaterialSource,
        customerContractDisplayedMaterialTotal: data.pricing.customerContractDisplayedMaterialTotal
      };

      const updates: any = {
        manualSectionTotals: sectionTotals,
        manualGateTotals: gateTotals,
        manualDemoTotals: demoTotals,
        manualGrandTotal: manualGrandTotal,
        contractProjectDate: projectDate,
        contractScope: localAiScope,
        manualGatePrices: manualGatePrices,
        customContractLineItems: customLineItems,
        customContractLineItemsTotal: customContractLineItemsTotal,
        ...pricingUpdates
      };

      if (wasDecisionMade) {
        updates.customerDecision = null;
        updates.customerSignature = null;
        updates.customerSignedDate = null;
        updates.customerDecisionDate = null;
        updates.customerDeclineReason = null;
        updates.acceptedAt = null;
        updates.customerEmailSigned = null;
        updates.customerEmailSent = false;
        updates.customerSentAt = null;
        updates.jobStatus = 'Draft';
      }

      onUpdateEstimate(updates);
      // Sync the session buffer to match the persisted state
      setAiContractScope(localAiScope);
      setHasUnsavedChanges(false);
      setShowSavedFeedback(true);
      setTimeout(() => setShowSavedFeedback(false), 3000);
    }
  };

  const handleGenerateAIScope = async () => {
    setIsGenerating(true);
    try {
      const totalLinearFeet = projectBreakdown.reduce((sum, r) => sum + r.netLF, 0).toFixed(1);
      const totalGatesCount = projectBreakdown.reduce((sum, r) => sum + (r.gates?.length || 0), 0);
      const companyInfoText = `Company Name: ${COMPANY_INFO.name}\nAddress: ${COMPANY_INFO.address}\nPhone: ${COMPANY_INFO.phone}\nEmail: ${COMPANY_INFO.email}`;
      const customerInfoText = `Customer Name: ${resolvedClientName}\nAddress: ${resolvedMetaSource.customerAddress || 'N/A'}\nPhone: ${resolvedMetaSource.customerPhone || 'N/A'}\nEmail: ${resolvedClientEmail || 'N/A'}`;
      
      const sitePrepText = `
        Has Site Prep: ${estimate.hasSitePrep ? 'Yes' : 'No'}
        Needs Clearing: ${estimate.needsClearing ? 'Yes' : 'No'}
        Needs Marking: ${estimate.needsMarking ? 'Yes' : 'No'}
        Obstacle Removal: ${estimate.obstacleRemoval ? 'Yes' : 'No'}
      `.trim();

      const globalSpecsText = `
        Default Fence Height: ${estimate.height || estimate.defaultHeight || 'N/A'} ft
        Total Linear Footage: ${totalLinearFeet} LF
        Total Gate Count: ${totalGatesCount} gates
        Wood Type Option: ${estimate.woodType || 'N/A'}
        Iron Option (Rails): ${estimate.ironRails || 'N/A'}
        Iron Top Style: ${estimate.ironTop || 'N/A'}
        Iron Install Type: ${estimate.ironInstallType || 'N/A'}
        Iron Panel Type: ${estimate.ironPanelType || 'N/A'}
        Post Cap ID / Type: ${estimate.postCapId || 'N/A'}
        Has Cap and Trim: ${estimate.hasCapAndTrim ? 'Yes' : 'No'}
        Has Double Trim: ${estimate.hasDoubleTrim ? 'Yes' : 'No'}
        Has Top Cap: ${estimate.hasTopCap ? 'Yes' : 'No'}
        Has Rot Board: ${estimate.hasRotBoard ? 'Yes' : 'No'}
        Concrete Type: ${estimate.concreteType || 'N/A'}
        Footing Type: ${estimate.footingType || 'N/A'}
        Include Stain: ${estimate.includeStain ? 'Yes' : 'No'}
        Pre-Stained Style: ${estimate.isPreStained ? 'Yes' : 'No'}
        Stain Color: ${estimate.defaultColor || 'N/A'}
        Increase Post Depth: ${estimate.increasePostDepth ? 'Yes' : 'No'}
        Total Contract Price: $${(data.pricing.finalCustomerPrice || 0).toFixed(2)}
        Demolition Removal Price: $${(data.pricing.demoRemovalPrice || 0).toFixed(2)}
      `.trim();

      const sectionsSpecsText = data.runs.map((run, index) => {
        const originalRun = estimate.runs?.[index];
        const runGates = originalRun?.gateDetails || [];
        const gatesListText = runGates.map((gate, gIdx) => 
          `- Gate #${gIdx + 1}: ${gate.type} Gate, Width ${gate.width} ft, Construction: ${gate.construction || 'N/A'}`
        ).join('\n') || 'None';

        const demoInfo = originalRun?.hasDemolition 
          ? `Included (Length: ${originalRun.demoLinearFeet || run.linearFeet} LF, Type: ${originalRun.demoType || 'N/A'})` 
          : 'Excluded';

        return `
        ========================================
        SECTION #${index + 1}: ${run.runName || run.runId}
        Style Name/Id: ${run.styleName} (${run.styleType || 'N/A'})
        Linear Footage: ${run.linearFeet} LF (Net LF: ${run.netLF} LF)
        Height: ${run.height}' (feet)
        Status: ${originalRun?.isExistingFence ? 'STAINING / RESTORATION on Existing Fence' : 'NEW INSTALLATION'}
        Picket Style / Top Style: ${run.picketStyle || run.topStyle || 'N/A'}
        Rot Board: ${run.hasRotBoard ? 'Yes' : 'No'}
        Cap & Trim: ${run.hasTopCap || run.hasTrim ? 'Yes' : 'No'}
        Wood Type: ${run.woodType || estimate.woodType || 'N/A'}
        Staining Required: ${originalRun?.needsStain ? 'Yes' : 'No'} (Sides: ${originalRun?.stainSides || 'N/A'})
        Stain / Coating Color: ${originalRun?.color || estimate.defaultColor || 'N/A'}
        Is Pre-Stained / Factory Stained: ${originalRun?.isPreStained ? 'Yes' : 'No'}
        Post Installation Method: ${originalRun?.pipeInstallType || 'Set in Concrete'}
        Reusing Existing Posts: ${originalRun?.reusePosts ? 'Yes' : 'No'}
        Demolition Scope: ${demoInfo}
        Gates in this Section:
        ${gatesListText}
        Concrete Selection: ${originalRun?.concreteType || estimate.concreteType || 'Set in Concrete'}
        Rail Count: ${run.railCount || 'N/A'}
        Iron Rails: ${originalRun?.ironRails || estimate.ironRails || 'N/A'}
        Iron Top Style: ${originalRun?.ironTop || estimate.ironTop || 'N/A'}
        Iron Install Type: ${originalRun?.ironInstallType || estimate.ironInstallType || 'N/A'}
        Iron Panel Type: ${originalRun?.ironPanelType || estimate.ironPanelType || 'N/A'}
        Chain Link Grade/Option: ${originalRun?.chainLinkGrade || estimate.defaultChainLinkGrade || 'N/A'}
        `;
      }).join('\n\n');

      const calculationMaterialsText = data.summary.map(item => `- ${item.name}: ${item.qty} ${item.unit}`).join('\n') || 'None';

      const prompt = `
You are a senior project manager and estimator for Lone Star Fence Works, a premium fence contractor in Texas.
Your tone is professional, confident, clear, and legally protective. No fluff. Write a cohesive and complete contract-grade Scope of Work.
This document is a contract Scope of Work that reads as if it was written specifically for this customer's project. The customer must understand exactly what will be built without referring back to an estimate sheet.

CRITICAL INSTRUCTIONS (FORBIDDEN VOCABULARY & RULES):
1. NEVER say "Refer to estimate", "See estimate", or "Per contract selections".
2. NEVER use the phrase "As selected" or "As specified".
3. NEVER use the word "Typically" or "Or equivalent".
4. NEVER say "Metal or wood posts". You MUST explicitly state the precise post type being installed based on the section specs.
5. If the information exists in the estimate facts below, state it explicitly. Do not leaves choices open.
6. Under "Reused Posts (Warranty)": If any section says "Reusing Existing Posts: Yes", you MUST include this exact disclaimer verbatim:
   "Contractor will reuse existing posts provided by Customer. Contractor's warranty DOES NOT apply to existing posts."
7. DAMP LUMBER BRANDING: Do not use premium self-promoting terminology such as "#1 Grade" or similar quality marketing slogans for lumber. Use the exact wood species/types as configured in the estimate (e.g. Japanese Cedar, Western Red Cedar, or Pressure-Treated Pine).
8. SECTION DISTINCTIVENESS: Clearly differentiate between "New Installation" and "Staining/Restoration" sections in the output document. Staining/Restoration work on existing fences MUST NOT be described as a new installation. Focus staining on: surface prep, application method, and limitations (natural tone variations, age/moisture absorption, weather-dependency).
9. INCREASED POST DEPTH: If global specs indicate "Increase Post Depth: Yes", you MUST include this specification in the post installation description: "Increased post depth: +12 inches (Total post depth: 48 inches). Posts are upgraded to 1-foot-longer structural posts and set with deeper set labor."

LONE STAR FENCE WORKS COMPANY SPECIFICATIONS & DEFAULTS:
Use these specific standard specifications when writing:
- POST FOOTINGS:
  - Required Wording: "Posts will be installed in round concrete footings measuring {diameter}\" in diameter by {depth}\" deep."
  - Rule 1 (8' Wood Fence): 10" in diameter by 36" deep.
  - Rule 2 (6' Wood Fence or lower): 8" in diameter by 24" deep.
  - Rule 3 (Wrought Iron): 8" in diameter by 24" deep.
  - Rule 4 (Chain Link): 8" in diameter by 24" deep.
  - Rule 5 (Pipe / No-Climb): 8" in diameter by 24" deep.
  - Rule 6 (Vinyl & others): 8" in diameter by 24" deep.
  - Methodology: All posts are wet-set in concrete.
- STEEL POSTS: "Schedule 20 galvanized steel posts" wet-set in concrete. Post spacing set approximately 8 feet on center.
- WOOD POSTS (Only if PT Pine selection or explicit wood post type chosen): "Pressure-treated Schedule 20 equivalent structural wood posts (4x4)" wet-set in concrete.
- RAILS:
  - For 6' (foot) tall fences: 3 nominal 2x4 rails.
  - For 8' (foot) tall fences: 4 nominal 2x4 rails.
- PICKETS: Exact width (e.g., 6 inches wide) and material (Western Red Cedar, Japanese Cedar, or Pressure-Treated Pine). Style: Board-on-Board, Side-by-Side, Shadowbox, Horizontal, etc.
- FASTENERS: Ring-shank hot-dipped galvanized coil nails (preventing rust streaks).
- IRON FENCES:
  - Post size: 14-gauge square steel posts (2"x2" dimensions) or customize if requested.
  - Rail Configuration: 2 rail for 4'-5' height, or 3 rail for 6' height.
  - Finish: Durable satin-black powder-coated finish.
  - Gate hardware: Heavy-duty gravity latches, self-closing premium spring hinges.
  - Puppy panels: Specify if configured (18" tall pickets with maximum 1.5" bottom gap).
- CHAIN LINK FENCES:
  - Fabric Gauge: heavy duty 9-gauge fabric or residential 11.5-gauge fabric based on selection.
  - Terminal Post size: 2-3/8" diameter Schedule 20 steel posts.
  - Line Post size: 1-7/8" diameter Schedule 20 steel posts.
  - Top Rail: 1-5/8" diameter top rails.
  - Bottom Tension Wire: 6-gauge galvanized steel tension wire.
  - Coating type: Galvanized steel or Black vinyl coated.
  - Privacy Slats: Mention if included.
- PIPE FENCES:
  - Pipe size: 2-3/8" structural tubing.
  - Rails: 2, 3, or 4 rails.
  - Mesh/Wire: 2"x4" no-climb woven wire fabric or welded utility wire.
  - Gate type: Premium welded pipe matching frames.
- STAINING & RESTORATION:
  - Product: Wood Defender Commercial Grade Stain and Sealer (Semi-Transparent or Transparent).
  - Coating application: 1 heavy flood coat saturating wood to refusal.
  - Preparations: Pressurewash/clean off mildew/grime, allow full drying (moisture <= 12%) before high-volume low-pressure (HVLP) spray application with backbrushing.
- DEMOLITION & HAUL OFF: State whether demolition debris haul-off is included (e.g. if demolition price > $0 or demo scope is configured, it is included and hauled away) or excluded.

AI VALIDATION & DISCLOSURES:
Before writing the final contractual narrative, perform and detail an internal validation against the raw estimate fields.
You must verify:
✓ Total Linear Footage: ${totalLinearFeet} LF
✓ Gate Count: ${totalGatesCount} gates
✓ Fence Height
✓ Fence Style
✓ Material specified
✓ Stain selection
✓ Post type
✓ Demolition scope
Compare what was calculated / specified in the sections against the company standards. If any required value is missing, write a professional warning/assumption alert block at the top of the Scope of Work titled "I. Project Variables & Assumptions" explaining that you used the company default values (e.g. 8"x24" footings for 6' fences, 10"x36" footings for 8' wood fences, Schedule 20, 3-rail configuration, etc.) rather than generic placeholder words. If everything is fully specified, note "✓ All estimated parameters verified & locked".

ESTIMATE DATA AND FACTS SHEET:
--- ESTIMATOR SOURCE OF TRUTH ---

CUSTOMER:
${customerInfoText}

CONTRACTOR:
${companyInfoText}

GLOBAL SPECIFICATIONS:
${globalSpecsText}

SITE PREPARATION:
${sitePrepText}

SECTION BY SECTION ESTIMATE SPECS:
${sectionsSpecsText}

CALCULATED MATERIALS:
${calculationMaterialsText}

ADDITIONAL REQUESTS:
${customInstructions}

Please structure the contract narrative with professional Markdown bold headers (using Roman Numerals I, II, III etc. except keep "I. Specifications & Assumptions" if warnings exist). Ensure clean spacing, and do not use clinical AI-like intro text (e.g., "Certainly, here is the..."). Dive right into the contract.
      `;

      const result = await generateAIScope(prompt);
      setAiContractScope(result);
      setLocalAiScope(result);
      if (onUpdateEstimate) {
        onUpdateEstimate({ contractScope: result });
      }
      localStorage.setItem('fence_pro_customer_contract_ai_scope', JSON.stringify(result));
    } catch (error) {
      console.error("AI Generation Error:", error);
      setAiContractScope("Error generating AI scope. Please ensure your API key is correctly configured.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={cn("max-w-5xl mx-auto space-y-8 pb-20", isCustomerView ? "px-0" : "")}>
      {/* Warning if overrides are active */}
      {(isGrandTotalOverridden || hasSectionOverrides) && !isCustomerView && (
        <div className="mb-6 p-4 bg-american-red/10 border-2 border-american-red rounded-2xl flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-american-red text-white rounded-lg">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-sm font-black text-american-red uppercase tracking-tight">Manual Price Overrides Active</p>
              <p className="text-[10px] font-bold text-american-red/80 uppercase tracking-widest">
                The total investment shown below has been manually adjusted and may not match calculated material costs.
              </p>
            </div>
          </div>
          <button 
            onClick={handleResetManualOverrides}
            className="px-4 py-2 bg-white border-2 border-american-red/20 text-american-red text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-american-red hover:text-white transition-all shadow-sm"
          >
            Reset to Calculated
          </button>
        </div>
      )}

      {/* Action Header */}
      {!isCustomerView && (
        <div className="bg-white rounded-3xl p-8 shadow-md border border-[#E5E5E5] flex flex-col gap-6 relative overflow-hidden print:hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
             <FileText size={160} className="text-american-blue" strokeWidth={1} />
          </div>
          
          {/* Top Row: Identity and Actions */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10 w-full">
            <div>
              <h2 className="text-2xl font-black text-american-blue tracking-tighter uppercase mb-1 leading-none">Customer Agreement</h2>
              <p className="text-[10px] font-bold text-[#999999] uppercase tracking-[0.2em] leading-tight opacity-80">Finalize and Print Professional Contract</p>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <button
                onClick={handleResetManualOverrides}
                className="px-6 py-5 bg-[#F5F5F5] hover:bg-[#EAEAEA] text-american-blue rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-[#DDD]"
              >
                Reset Pricing
              </button>
              <button 
                onClick={handlePrint}
                className="flex items-center justify-center gap-2 px-8 py-5 rounded-2xl bg-american-blue text-white font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl min-w-[160px]"
              >
                <Printer size={18} />
                Print
              </button>
              
              <button 
                onClick={handleSaveContract}
                disabled={!hasUnsavedChanges}
                className={`flex items-center justify-center gap-2 px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl min-w-[180px] ${
                  hasUnsavedChanges 
                  ? 'bg-american-red text-white hover:scale-105 animate-pulse' 
                  : 'bg-green-600 text-white cursor-default'
                }`}
              >
                {hasUnsavedChanges ? (
                  <>
                    <Save size={18} />
                    Save Changes
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    Saved
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Bottom Row: AI Customization */}
          <div className="relative z-10 w-full pt-8 border-t border-dashed border-[#E5E5E5]">
            <div className="bg-american-blue group hover:bg-american-blue/95 transition-all p-8 rounded-[32px] shadow-2xl relative overflow-hidden">
              {/* Background Accent */}
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Sparkles size={120} className="text-white" />
              </div>

              <div className="flex flex-col lg:flex-row items-center gap-8 relative z-10">
                <div className="flex-1 w-full flex flex-col gap-3">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-american-red" />
                      <label className="text-[10px] font-black text-white/80 uppercase tracking-[0.2em]">AI Scope Customization</label>
                    </div>
                    <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Natural Language Enhancement</span>
                  </div>
                  <textarea
                    placeholder="e.g., 'Emphasize the 1-year workmanship warranty and specify use of Japanese Cedar...' or 'Note that color variation is normal for new fences...'"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    className="w-full h-36 p-6 rounded-2xl text-sm border-0 focus:ring-4 focus:ring-white/10 outline-none transition-all bg-white/10 text-white placeholder:text-white/30 font-medium leading-relaxed resize-none shadow-inner"
                  />
                </div>
                
                <div className="w-full lg:w-auto flex flex-col items-center justify-center pt-2">
                  <button 
                    onClick={handleGenerateAIScope}
                    disabled={isGenerating}
                    className={cn(
                      "w-full lg:w-64 flex flex-col items-center justify-center gap-4 px-10 py-10 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all shadow-2xl border-b-4",
                      isGenerating 
                        ? "bg-white/10 text-white/40 border-transparent cursor-not-allowed" 
                        : "bg-american-red text-white border-american-red/30 hover:bg-american-red/90 hover:-translate-y-1 active:translate-y-0"
                    )}
                  >
                    {isGenerating ? (
                      <Loader2 className="animate-spin" size={32} />
                    ) : (
                      <Sparkles size={32} />
                    )}
                    <span className="text-center">
                      {isGenerating ? 'Drafting Technical Narrative...' : ( (aiContractScope || estimate.contractScope) ? 'Regenerate Agreement' : 'Generate AI Agreement')}
                    </span>
                  </button>
                  <p className="mt-4 text-[9px] font-bold text-white/40 uppercase tracking-widest text-center">Powered by Project Intelligence</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Contract Line Items (Admin Only) */}
      {!isCustomerView && (
        <div className="bg-white rounded-3xl p-8 shadow-md border border-[#E5E5E5] space-y-6 print:hidden">
          <div>
            <h3 className="text-xl font-black text-american-blue uppercase tracking-tight flex items-center gap-2">
              <Sparkles className="text-american-red" size={20} />
              Custom Contract Line Items
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Add custom standalone line items (fees, discounts, permit charges) to this customer's contract. These do not affect your material takeoffs or labor breakdowns.
            </p>
          </div>

          <div className="space-y-4">
            {customLineItems.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">No custom line items added yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {customLineItems.map((item) => (
                  <div key={item.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-4 items-start md:items-center">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 w-full">
                      <div className="sm:col-span-1 md:col-span-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Title</label>
                        <input
                          type="text"
                          value={item.title}
                          placeholder="e.g. HOA Permit Processing"
                          onChange={(e) => handleUpdateCustomLineItem(item.id, { title: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-american-blue outline-none focus:border-american-blue"
                        />
                      </div>
                      <div className="sm:col-span-2 md:col-span-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Description (Optional)</label>
                        <input
                          type="text"
                          value={item.description || ''}
                          placeholder="Brief details about this custom charge"
                          onChange={(e) => handleUpdateCustomLineItem(item.id, { description: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-600 outline-none focus:border-american-blue"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Amount ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.amount || ''}
                          placeholder="0.00"
                          onChange={(e) => handleUpdateCustomLineItem(item.id, { amount: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-american-blue outline-none focus:border-american-blue"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-4 w-full md:w-auto md:self-end md:mb-1">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id={`taxable-${item.id}`}
                          checked={!!item.taxable}
                          onChange={(e) => handleUpdateCustomLineItem(item.id, { taxable: e.target.checked })}
                          className="rounded border-slate-300 text-american-blue focus:ring-american-blue h-3.5 w-3.5"
                        />
                        <label htmlFor={`taxable-${item.id}`} className="text-[10px] font-black uppercase tracking-wider text-slate-500 cursor-pointer select-none">
                          Taxable
                        </label>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id={`show-${item.id}`}
                          checked={item.showOnContract}
                          onChange={(e) => handleUpdateCustomLineItem(item.id, { showOnContract: e.target.checked })}
                          className="rounded border-slate-300 text-american-blue focus:ring-american-blue h-3.5 w-3.5"
                        />
                        <label htmlFor={`show-${item.id}`} className="text-[10px] font-black uppercase tracking-wider text-slate-500 cursor-pointer select-none">
                          Show on Contract
                        </label>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id={`ppf-${item.id}`}
                          checked={!!item.includeInPricePerFoot}
                          onChange={(e) => handleUpdateCustomLineItem(item.id, { includeInPricePerFoot: e.target.checked })}
                          className="rounded border-slate-300 text-american-blue focus:ring-american-blue h-3.5 w-3.5"
                        />
                        <label htmlFor={`ppf-${item.id}`} className="text-[10px] font-black uppercase tracking-wider text-slate-500 cursor-pointer select-none">
                          Include in PPF
                        </label>
                      </div>

                      <button
                        onClick={() => handleDeleteCustomLineItem(item.id)}
                        className="p-2 text-american-red hover:bg-american-red/10 rounded-xl transition-all ml-auto md:ml-0"
                        title="Delete line item"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={handleAddCustomLineItem}
                className="px-5 py-3 bg-american-blue text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-american-blue/95 active:scale-95 transition-all shadow-md flex items-center gap-2"
              >
                Add Custom Line Item
              </button>
              {customLineItems.length > 0 && (
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Custom Subtotal</span>
                  <span className="text-base font-black text-american-blue">{formatCurrency(customContractLineItemsTotal)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Contract Preview Area */}
      <div id="contract-view" className="bg-white rounded-[40px] shadow-2xl border border-[#E5E5E5] overflow-hidden print:border-0 print:shadow-none print:rounded-none">
        {/* Company Header */}
        <div className="bg-american-blue p-6 md:p-10 text-white flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-10">
            <div className="american-star w-48 h-48 bg-white" />
          </div>
          
          <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-6 relative z-10 w-full md:w-auto">
            {COMPANY_INFO.logo && (
              <img src={COMPANY_INFO.logo} alt="Logo" className="h-16 sm:h-24 w-auto max-w-[150px] sm:max-w-none object-contain bg-white/10 p-4 rounded-3xl" referrerPolicy="no-referrer" />
            )}
            <div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tighter uppercase leading-none">{COMPANY_INFO.name}</h2>
              <div className="mt-4 space-y-1 opacity-70">
                <p className="text-xs sm:text-sm font-bold">{COMPANY_INFO.address}</p>
                <p className="text-xs sm:text-sm font-bold">{COMPANY_INFO.phone} | {COMPANY_INFO.email}</p>
                <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest">{COMPANY_INFO.website}</p>
              </div>
            </div>
          </div>

          <div className="text-right relative z-10">
            <div className="inline-block px-4 py-2 rounded-xl bg-white/10 border border-white/20 mb-4 group transition-all">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-60 mr-2">Estimate Date:</span>
              <span className="text-sm font-bold text-white">
                {formatDate(estimate.customerEmailSentAt || estimate.customerSentAt || estimate.createdAt) || new Date().toLocaleDateString('en-US')}
              </span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-american-red italic">Fences with Character</p>
          </div>
        </div>

        {estimate.customerSignature && (
          <div className="bg-emerald-50 border-y border-emerald-200 px-10 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                <CheckCircle2 size={16} />
              </div>
              <div>
                <p className="text-xs font-black text-emerald-950 uppercase tracking-widest leading-none">Digitally Executed Contract</p>
                <p className="text-[10px] text-emerald-700 font-medium mt-1">This agreement is legally bound and signed via electronic transaction.</p>
              </div>
            </div>
            <div className="text-right text-xs font-mono font-bold text-emerald-800 uppercase tracking-wider bg-emerald-100/60 px-4 py-2 rounded-xl">
              Signed: {formatDate(estimate.customerSignedDate || estimate.customerDecisionDate)}
            </div>
          </div>
        )}

        <div className="p-5 sm:p-8 md:p-12 space-y-8 md:space-y-12">
          {/* Customer & Project Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 border-b border-dashed border-[#E5E5E5] pb-12">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[#999999] mb-4">Customer Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[8px] font-black text-american-blue uppercase tracking-widest opacity-40">Client Name</label>
                  <p className="text-xl font-bold text-american-blue">{resolvedClientName}</p>
                </div>
                <div>
                  <label className="block text-[8px] font-black text-american-blue uppercase tracking-widest opacity-40">Installation Address</label>
                  <p className="text-sm font-bold text-[#444444] leading-relaxed">{resolvedMetaSource.customerAddress || 'No address specified'}</p>
                </div>
                {(resolvedMetaSource.customerPhone || resolvedClientEmail) && (
                  <p className="text-xs font-bold text-[#666666]">{resolvedMetaSource.customerPhone} {resolvedClientEmail && `• ${resolvedClientEmail}`}</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[#999999] mb-4">Project Overview</h3>
              <div className="bg-[#F8F9FA] rounded-2xl p-6 border border-[#F0F0F0] space-y-4">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-[#666666] uppercase tracking-wider">Total linear footage</span>
                  <span className="text-lg font-black text-american-blue tracking-tight">{data.totals.subtotal > 0 ? (projectBreakdown.reduce((sum, r) => sum + r.netLF, 0).toFixed(1)) : (estimate.linearFeet || 0)} LF</span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-[#666666] uppercase tracking-wider">Project Type</span>
                  <span className="text-sm font-bold text-american-blue uppercase tracking-widest">
                    {(() => {
                      const styles = Array.from(new Set(projectBreakdown.map(r => r.style)));
                      if (styles.length === 0) return 'Custom Fence Project';
                      if (styles.length === 1) return styles[0];
                      return "Multi-Section Project";
                    })()}
                  </span>
                </div>
                {estimate.increasePostDepth && (
                  <div className="flex justify-between items-end border-t border-dashed border-[#E5E5E5] pt-3 mt-3">
                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Special Option</span>
                    <span className="text-sm font-bold text-emerald-600 uppercase tracking-widest">
                      Increased post depth: +12"
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Scope of Work Section */}
          <div className="space-y-6">
            <h3 className="text-lg font-black text-american-blue uppercase tracking-tight flex items-center gap-3">
              <span className="h-6 w-1 bg-american-red rounded-full" />
              I. Scope of Work & Project Specifications
            </h3>
            
            { isCustomerView ? (
              <div className="prose prose-sm max-w-none text-american-blue leading-relaxed font-semibold bg-white p-5 sm:p-10 rounded-3xl border border-[#E5E5E5] ai-content-area shadow-inner print:shadow-none print:p-8 print:border-0 print:bg-transparent transition-all">
                <div className="whitespace-pre-wrap text-base font-semibold text-slate-800 leading-relaxed font-sans">
                  {localAiScope || estimate.contractScope || "Detailed Scope of Work is being finalized."}
                </div>
              </div>
            ) : (aiContractScope || estimate.contractScope) ? (
              <div className="prose prose-sm max-w-none text-american-blue leading-relaxed font-medium bg-white p-5 sm:p-10 rounded-3xl border border-[#E5E5E5] ai-content-area shadow-inner print:shadow-none print:p-0 print:border-0 print:bg-transparent transition-all">
                <textarea
                    value={localAiScope}
                    onChange={(e) => handleScopeChange(e.target.value)}
                    onInput={(e) => {
                      e.currentTarget.style.height = 'auto';
                      e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                    }}
                    className="w-full bg-transparent outline-none resize-none overflow-hidden print:hidden text-lg leading-relaxed font-semibold min-h-[400px]"
                />
                <div className="hidden print:block whitespace-pre-wrap min-h-0 text-[13px] text-[#444444]">
                  {localAiScope}
                </div>
              </div>
            ) : (
              <div className="p-8 rounded-3xl border-2 border-dashed border-[#E5E5E5] flex flex-col items-center justify-center gap-4 text-center">
                <div className="h-12 w-12 rounded-full bg-american-red/10 flex items-center justify-center text-american-red">
                  <Sparkles size={24} />
                </div>
                <div>
                  <p className="text-sm font-bold text-american-blue">Generate AI Scope of Work</p>
                  <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest max-w-[300px] mt-1">
                    Click the "Generate AI Scope" button above to create a detailed project narrative for your client.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Financial Breakdown (Client View) */}
          <div className="space-y-6">
            <h3 className="text-lg font-black text-american-blue uppercase tracking-tight flex items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <span className="h-6 w-1 bg-american-red rounded-full" />
                II. Cost Summary
              </span>
              <label className="flex items-center gap-2 cursor-pointer print:hidden">
                <input type="checkbox" checked={showCostBreakdown} onChange={(e) => setShowCostBreakdown(e.target.checked)} className="accent-american-blue" />
                <span className="text-[10px] font-black text-[#999999] uppercase tracking-widest">Show Breakdown</span>
              </label>
            </h3>
            
            <div className="space-y-6">
              {showCostBreakdown ? (
                isHomogeneous ? (
                  <div className="space-y-6">
                    {/* Unified Project Rate Card */}
                    <div className="bg-white rounded-3xl p-8 border-2 border-american-blue/5 shadow-lg flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity">
                        <Sparkles size={120} />
                      </div>
                      
                      <div className="relative z-10 text-center md:text-left">
                        <div className="inline-block px-3 py-1 rounded-full bg-american-red/10 text-american-red text-[9px] font-black uppercase tracking-widest mb-3">
                          Project-Wide Rate
                        </div>
                        <h3 className="text-xl font-black text-american-blue uppercase tracking-tight">Unified Fence Pricing</h3>
                        <p className="text-xs font-bold text-[#999999] mt-1 italic uppercase tracking-wider">
                          {projectBreakdown[0]?.height}' {projectBreakdown[0]?.style} Specification
                          {projectBreakdown[0]?.style?.includes('Iron') && (
                            <>
                              <span className="mx-2">•</span>
                              {projectBreakdown[0]?.ironInstallType}
                              <span className="mx-2">•</span>
                              {projectBreakdown[0]?.ironPanelType} Panels
                            </>
                          )}
                          {projectBreakdown[0]?.style?.includes('Chain Link') && projectBreakdown[0]?.chainLinkFabricGauge && (
                            <>
                              <span className="mx-2">•</span>
                              {projectBreakdown[0]?.chainLinkFabricGauge === '9ga' ? '9 Gauge Fabric' : '11 Gauge Fabric'}
                            </>
                          )}
                        </p>
                      </div>

                      <div className="text-center md:text-right relative z-10">
                        <div className="flex items-baseline justify-center md:justify-end gap-2">
                          <span className="text-4xl font-black text-american-blue tabular-nums">{formatCurrency(globalPricePerFoot)}</span>
                          <span className="text-sm font-black text-[#BBBBBB] uppercase tracking-widest">/ LF</span>
                        </div>
                        <p className="text-[10px] font-bold text-american-red uppercase tracking-widest mt-1">Guaranteed Custom Rate</p>
                      </div>
                    </div>

                    {/* Individual Footages for Clarity */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      {projectBreakdown.map((run, i) => (
                        <div key={i} className="bg-[#F9F9F9] rounded-2xl p-4 border border-[#F0F0F0] flex justify-between items-center">
                          <span className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">{run.name}</span>
                          <span className="text-sm font-bold text-american-blue">{run.netLF.toFixed(1)}'</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {projectBreakdown.map((run, i) => {
                      return (
                        <div key={i} className="bg-white rounded-2xl p-6 border border-[#E5E5E5] shadow-sm flex flex-col gap-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 className="font-black text-american-blue uppercase tracking-tight text-sm">{run.name}</h4>
                              <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">
                                {run.style} {run.height}'
                                {(run.styleType === 'Metal' || (run.style || '').includes('Iron')) && (
                                  <>
                                    <span className="mx-1">•</span>
                                    {run.ironInstallType}
                                    <span className="mx-1">•</span>
                                    {run.ironPanelType}
                                  </>
                                )}
                                {(run.style || '').includes('Chain Link') && run.chainLinkFabricGauge && (
                                  <>
                                    <span className="mx-1">•</span>
                                    {run.chainLinkFabricGauge === '9ga' ? '9 Gauge' : '11 Gauge'}
                                  </>
                                )}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-black text-american-red">
                                {isCustomerView ? (
                                  <span>{formatCurrency(getVal(sectionTotals[i], run.totalFenceCharge) / (run.netLF || 1))}</span>
                                ) : (
                                  <input 
                                    type="number" 
                                    value={(getVal(sectionTotals[i], run.totalFenceCharge) / (run.netLF || 1)).toFixed(2)}
                                    onChange={(e) => {
                                      const newRate = parseFloat(e.target.value) || 0;
                                      const newTotals = sectionTotals.length ? [...sectionTotals] : projectBreakdown.map(r => r.totalFenceCharge);
                                      newTotals[i] = newRate * run.netLF;
                                      setSectionTotals(newTotals);
                                    }}
                                    className="w-16 bg-transparent text-right outline-none"
                                  /> 
                                )}
                                <span className="opacity-40">/ FT</span>
                              </p>
                              <p className="text-[9px] font-bold text-[#BBBBBB] uppercase">Fence Rate</p>
                            </div>
                          </div>

                          <div className="space-y-3 pt-4 border-t border-[#F5F5F5]">
                            <div className="flex justify-between items-center group">
                              <span className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">Fence Total</span>
                              <div className="flex items-center gap-1">
                                {isCustomerView ? (
                                  <span className="font-bold text-american-blue text-xs">
                                    {formatCurrency(getVal(sectionTotals[i], run.totalFenceCharge))}
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-xs font-bold text-american-blue">$</span>
                                    <input 
                                      type="number" 
                                      value={getVal(sectionTotals[i], run.totalFenceCharge).toFixed(2)}
                                      onChange={(e) => {
                                        const newVal = parseFloat(e.target.value) || 0;
                                        const newTotals = sectionTotals.length ? [...sectionTotals] : projectBreakdown.map(r => r.totalFenceCharge);
                                        newTotals[i] = newVal;
                                        setSectionTotals(newTotals);
                                      }}
                                      className="font-bold text-american-blue text-right w-24 outline-none hover:bg-gray-50 focus:bg-gray-50 rounded px-1 transition-colors"
                                    />
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex justify-between items-center group">
                              <span className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">Gates Total</span>
                              <div className="flex items-center gap-1">
                                {isCustomerView ? (
                                  <span className="font-bold text-american-blue text-xs">
                                    {formatCurrency(getVal(gateTotals[i], run.totalGateCharge))}
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-xs font-bold text-american-blue">$</span>
                                    <input 
                                      type="number" 
                                      value={getVal(gateTotals[i], run.totalGateCharge).toFixed(2)}
                                      onChange={(e) => {
                                        const newVal = parseFloat(e.target.value) || 0;
                                        const newTotals = gateTotals.length ? [...gateTotals] : projectBreakdown.map(r => r.totalGateCharge);
                                        newTotals[i] = newVal;
                                        setGateTotals(newTotals);
                                      }}
                                      className="font-bold text-american-blue text-right w-24 outline-none hover:bg-gray-50 focus:bg-gray-50 rounded px-1 transition-colors"
                                    />
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex justify-between items-center group">
                              <span className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">Demo Total</span>
                              <div className="flex items-center gap-1">
                                {isCustomerView ? (
                                  <span className="font-bold text-american-blue text-xs">
                                    {formatCurrency(getVal(demoTotals[i], run.demoCharge))}
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-xs font-bold text-american-blue">$</span>
                                    <input 
                                      type="number" 
                                      value={getVal(demoTotals[i], run.demoCharge).toFixed(2)}
                                      onChange={(e) => {
                                        const newVal = parseFloat(e.target.value) || 0;
                                        const newTotals = demoTotals.length ? [...demoTotals] : projectBreakdown.map(r => r.demoCharge);
                                        newTotals[i] = newVal;
                                        setDemoTotals(newTotals);
                                      }}
                                      className="font-bold text-american-blue text-right w-24 outline-none hover:bg-gray-50 focus:bg-gray-50 rounded px-1 transition-colors"
                                    />
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-auto pt-4 border-t-2 border-american-blue/5 flex justify-between items-center bg-american-blue/5 -mx-6 -mb-6 px-6 py-4 rounded-b-2xl">
                            <span className="text-[10px] font-black text-american-blue uppercase tracking-widest">Section Total</span>
                            <span className="font-black text-american-blue text-lg">
                              {formatCurrency(
                                getVal(sectionTotals[i], run.totalFenceCharge) + 
                                getVal(gateTotals[i], run.totalGateCharge) + 
                                getVal(demoTotals[i], run.demoCharge)
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="bg-[#F9F9F9] rounded-3xl p-8 border border-[#E5E5E5] text-center">
                  <p className="text-sm font-bold text-american-blue uppercase">Refer to Quickbooks Estimate for detailed breakdown.</p>
                  <div className="mt-2 flex items-center justify-center gap-1">
                    {isCustomerView ? (
                      <span className="text-xl font-black text-american-blue">
                        {formatCurrency(data.pricing.baseFenceTotal)}
                      </span>
                    ) : (
                      <>
                        <span className="text-xl font-black text-american-blue">$</span>
                        <input 
                          type="number"
                          step="0.01"
                          value={(data.pricing.baseFenceTotal).toFixed(2)}
                          onChange={(e) => setManualGrandTotal(parseFloat(e.target.value) || 0)}
                          className="text-xl font-black text-american-blue bg-transparent outline-none w-32"
                        />
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Gates Section - Listed Separately */}
              {showCostBreakdown && (
                <div className="bg-[#F8F9FA] rounded-3xl p-8 border border-[#E5E5E5]">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="h-10 w-10 rounded-xl bg-american-blue flex items-center justify-center text-white">
                      <Navigation size={20} />
                    </div>
                    <h4 className="font-black text-american-blue uppercase tracking-widest text-xs">Custom Gate Access Systems</h4>
                  </div>
                  
                  <div className="space-y-3">
                    {projectBreakdown.some(r => r.gates.length > 0) ? (
                      projectBreakdown.map((run, rIdx) => 
                        run.gates.map((gate, gIdx) => {
                          // Estimate gate price
                          const calculatedPrice = (gate.items.reduce((sum, item) => sum + item.total, 0)) * markupFactor + 
                                               (gate.items.filter(i => i.category !== 'Labor').reduce((sum, item) => sum + item.total, 0)) * taxFactor;
                          const displayPrice = manualGatePrices[gate.gateId] ?? calculatedPrice;
                          
                          return (
                            <div key={gate.gateId} className="flex items-center justify-between py-4 border-b border-[#E5E5E5] last:border-0 hover:bg-american-blue/[0.02] -mx-4 px-4 rounded-xl transition-colors">
                              <div>
                                <p className="text-sm font-bold text-[#1A1A1A]">{gate.width}' {gate.type} Gate</p>
                                <p className="text-[10px] font-bold text-[#999999] uppercase tracking-wider">{run.name} • Professionally Installed</p>
                              </div>
                              <div className="flex items-center gap-1 bg-white border border-[#E5E5E5] rounded-xl px-4 py-2 shadow-sm">
                                {isCustomerView ? (
                                  <span className="font-black text-american-blue text-sm">
                                    {formatCurrency(displayPrice)}
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-xs font-black text-american-blue">$</span>
                                    <input 
                                      type="number"
                                      value={displayPrice.toFixed(2)}
                                      onChange={(e) => handleGatePriceChange(rIdx, gate.gateId, parseFloat(e.target.value) || 0)}
                                      className="font-black text-american-blue text-sm w-24 outline-none text-right bg-transparent tabular-nums"
                                      step="0.01"
                                    />
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )
                    ) : (
                      <p className="text-xs font-bold text-[#BBBBBB] uppercase italic tracking-widest">No custom gates included in this scope.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Additional Contract Line Items Section */}
              {customLineItems.filter(item => item.showOnContract).length > 0 && (
                <div className="bg-[#F8F9FA] rounded-3xl p-8 border border-[#E5E5E5] mt-8 space-y-6">
                  <h3 className="text-lg font-black text-american-blue uppercase tracking-tight flex items-center gap-3">
                    <span className="h-6 w-1 bg-american-red rounded-full" />
                    Additional Contract Line Items
                  </h3>
                  <div className="divide-y divide-slate-200">
                    {customLineItems
                      .filter(item => item.showOnContract)
                      .map((item) => (
                        <div key={item.id} className="py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                          <div className="space-y-1">
                            <h4 className="text-sm font-bold text-american-blue uppercase tracking-tight">
                              {item.title || 'Untitled Line Item'}
                            </h4>
                            {item.description && (
                              <p className="text-xs text-slate-500 max-w-xl">
                                {item.description}
                              </p>
                            )}
                          </div>
                          <div className="text-right sm:self-center">
                            <span className="font-bold text-sm text-american-blue font-mono">
                              {formatCurrency(item.amount)}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="pt-4 border-t-2 border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-black text-american-blue uppercase tracking-widest">Additional Items Subtotal</span>
                    <span className="font-black text-american-blue text-base font-mono">
                      {formatCurrency(customContractLineItemsTotal)}
                    </span>
                  </div>
                </div>
              )}

              {/* Grand Total */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-8 p-6 sm:p-10 bg-american-blue rounded-3xl text-white relative overflow-hidden mt-8 shadow-xl">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                   <CheckCircle2 size={100} />
                </div>
                <div className="relative z-10 text-center md:text-left space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Guaranteed Project Quoted Total</p>
                  <h3 className="text-3xl font-black tracking-tighter">TOTAL INVESTMENT</h3>
                  
                  {customContractLineItemsTotal !== 0 && (
                    <div className="text-[11px] font-semibold text-white/70 space-y-1 pt-1 border-t border-white/10 mt-1">
                      <div className="flex justify-between md:justify-start gap-4">
                        <span>Fence Installation Total:</span>
                        <span className="font-bold">{formatCurrency(baseFenceTotal)}</span>
                      </div>
                      <div className="flex justify-between md:justify-start gap-4">
                        <span>Additional Contract Line Items:</span>
                        <span className="font-bold">{formatCurrency(customContractLineItemsTotal)}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="relative z-10 text-center md:text-right w-full md:w-auto">
                  <div className="flex items-center justify-center md:justify-end gap-1 mb-1 relative group">
                    {isCustomerView ? (
                      <span className="text-5xl md:text-7xl font-black tabular-nums tracking-tighter leading-none text-white">
                        {formatCurrency(finalProjectTotal)}
                      </span>
                    ) : (
                      <>
                        <span className="text-3xl font-black tabular-nums tracking-tighter self-center">$</span>
                        <input 
                          type="number"
                          step="0.01"
                          value={finalProjectTotal.toFixed(2)}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : parseFloat(e.target.value);
                            const baseVal = val === null ? null : val - customContractLineItemsTotal;
                            setManualGrandTotal(baseVal);
                            if (onUpdateEstimate) onUpdateEstimate({ manualGrandTotal: baseVal });
                          }}
                          className={cn(
                            "text-7xl font-black tabular-nums tracking-tighter leading-none bg-transparent outline-none text-right w-full max-w-[400px] hover:bg-white/10 rounded px-2 transition-colors",
                            isGrandTotalOverridden ? "text-american-red italic" : "text-white"
                          )}
                        />
                      </>
                    )}
                  </div>
                  {isGrandTotalOverridden && (
                    <p className="text-[10px] font-black uppercase tracking-widest text-american-red/80 mb-2">Manual Override Active • Original: {formatCurrency(data.pricing.calculatedTotal)}</p>
                  )}
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Valid for 30 days from date of issue</p>
                </div>
              </div>

              {/* Debug Pricing Breakdown (Visible on dev/admin view only) */}
              {!isCustomerView && (
                <div id="debug-pricing-breakdown" className="mt-6 p-6 bg-slate-900 border border-slate-700 rounded-3xl text-slate-300 font-mono text-xs space-y-4 shadow-inner">
                  <div className="flex items-center gap-2 text-amber-400 font-bold uppercase tracking-wider border-b border-slate-700 pb-2">
                    <AlertCircle size={16} />
                    <span>Debug Admin Pricing Source of Truth</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-amber-500 font-bold border-b border-slate-800 pb-1">
                      <span>Required Diagnoses</span>
                      <span>Values</span>
                    </div>
                    <div className="flex justify-between text-white font-semibold">
                      <span>Admin Displayed Total:</span>
                      <span>{formatCurrency(finalProjectTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Firestore finalCustomerPrice:</span>
                      <span className="text-green-400">{estimate.finalCustomerPrice !== undefined && estimate.finalCustomerPrice !== null ? formatCurrency(Number(estimate.finalCustomerPrice)) : "undefined"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Firestore manualGrandTotal:</span>
                      <span className="text-amber-300">{estimate.manualGrandTotal !== undefined && estimate.manualGrandTotal !== null ? formatCurrency(Number(estimate.manualGrandTotal)) : "undefined"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Firestore estimatedPrice:</span>
                      <span>{estimate.estimatedPrice !== undefined && estimate.estimatedPrice !== null ? formatCurrency(Number(estimate.estimatedPrice)) : "undefined"}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800 pb-1.5 mb-1.5">
                      <span>Firestore grandTotal:</span>
                      <span>{estimate.grandTotal !== undefined && estimate.grandTotal !== null ? formatCurrency(Number(estimate.grandTotal)) : "undefined"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>contractSnapshot.finalCustomerPrice:</span>
                      <span className="text-blue-400">{estimate.contractSnapshot?.finalCustomerPrice !== undefined ? formatCurrency(Number(estimate.contractSnapshot.finalCustomerPrice)) : "None (Not Sent)"}</span>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-400 border-b border-slate-800 pb-1.5 mb-1.5">
                      <span>Public Portal Displayed Total:</span>
                      <span>{formatCurrency(getEstimateFinalPrice(estimate))}</span>
                    </div>
                    
                    <div className="flex justify-between pt-1 font-semibold text-slate-400">
                      <span>Sum of Run Section Totals:</span>
                      <span className="text-white font-bold">{formatCurrency(data.pricing.totalSectionsSum)}</span>
                    </div>
                    {data.pricing.runsPricing.map((run, i) => (
                      <div key={i} className="pl-4 flex justify-between text-slate-500 text-[11px]">
                        <span>- Run {i + 1} ({run.runName || `Section ${i + 1}`}):</span>
                        <span>Fence: {formatCurrency(run.finalFence)} | Gates: {formatCurrency(run.finalGate)} | Demo: {formatCurrency(run.finalDemo)} &rarr; Sub: {formatCurrency(run.totalSection)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between mt-2 pt-2 border-t border-slate-800/80">
                      <span className="text-slate-400">Site Prep Add-on (addOnSitePrepPrice):</span>
                      <span className="text-white">{formatCurrency(data.pricing.addOnSitePrepPrice)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Demolition (demoRemovalPrice):</span>
                      <span className="text-white">{formatCurrency(data.pricing.demoRemovalPrice)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Discount Amount:</span>
                      <span className="text-white">-{formatCurrency(data.pricing.discountAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Additional Contract Line Items:</span>
                      <span className="text-white">+{formatCurrency(customContractLineItemsTotal)}</span>
                    </div>
                    <div className="flex justify-between font-bold border-t border-slate-700/60 pt-2 text-amber-300">
                      <span>Calculated Grand Total:</span>
                      <span>{formatCurrency(data.pricing.calculatedTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Manual Grand Total Override (Base Fence):</span>
                      <span className="text-white">{data.pricing.manualGrandTotal !== null ? formatCurrency(data.pricing.manualGrandTotal) : "None (Using Calculated)"}</span>
                    </div>
                    <div className="flex justify-between font-extrabold border-t-2 border-slate-700/80 pt-2 text-green-400">
                      <span>Final Customer Price:</span>
                      <span>{formatCurrency(data.pricing.finalCustomerPrice)}</span>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-700 space-y-1">
                      <div className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1">Takeoff Material Breakdown</div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Fence Run Material Total:</span>
                        <span className="text-white">{formatCurrency(data.pricing.fenceRunMaterialTotal || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Custom Material Total:</span>
                        <span className="text-white">{formatCurrency(data.pricing.customMaterialTotal || 0)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-blue-300">
                        <span className="text-slate-300">Material Takeoff Final Total (Incl. Markup/Tax):</span>
                        <span>{formatCurrency(data.pricing.materialTakeoffFinalTotal || 0)}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">Material Source:</span>
                        <span className="text-slate-400">{data.pricing.customerContractMaterialSource}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">Contract Displayed Material (Total):</span>
                        <span className="text-slate-400">{formatCurrency(data.pricing.customerContractDisplayedMaterialTotal || 0)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between text-[11px] text-slate-500 pt-2">
                      <span>Overall Price Per Foot:</span>
                      <span>{formatCurrency(data.pricing.pricePerFoot)} / FT</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Project Drawing / Site Plan section */}
          {estimate.drawingUrl && (
            <div className="space-y-6 pt-12 border-t border-[#F0F0F0]">
              <h3 className="text-lg font-black text-american-blue uppercase tracking-tight flex items-center gap-3">
                <span className="h-6 w-1 bg-american-red rounded-full" />
                Project Drawing / Site Plan
              </h3>
              {estimate.drawingMimeType?.includes('pdf') ? (
                <div>
                  <div className="no-print bg-[#F9F9F9] rounded-3xl p-8 border border-[#E5E5E5] flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <FileText size={24} className="text-american-blue" />
                      <div>
                        <h4 className="text-sm font-bold text-american-blue">{estimate.drawingFileName || 'View Uploaded Project Drawing'}</h4>
                        <p className="text-xs text-[#999999]">PDF Document</p>
                      </div>
                    </div>
                    <a 
                      href={estimate.drawingUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="px-6 py-2 bg-american-blue text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all w-full sm:w-auto text-center"
                    >
                      View Uploaded Project Drawing
                    </a>
                  </div>
                  <div className="hidden print:block p-4 border border-dashed rounded-xl text-xs font-semibold text-slate-800">
                    📎 Reference PDF Drawing: <strong className="font-bold underline">{estimate.drawingFileName}</strong>
                    <p className="text-[10px] text-slate-500 font-mono mt-1 break-all">{estimate.drawingUrl}</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-3xl p-4 border border-[#E5E5E5] flex flex-col gap-4 print:p-0 print:border-0">
                  <div className="max-w-2xl mx-auto overflow-hidden rounded-2xl border border-american-blue/10 print:border-0">
                    <img 
                      src={estimate.drawingUrl} 
                      alt="Project site plan or layout drawing"
                      referrerPolicy="no-referrer"
                      className="w-full h-auto object-contain max-h-[500px]" 
                    />
                  </div>
                  <div className="no-print text-center">
                    <a 
                      href={estimate.drawingUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="inline-flex items-center gap-2 text-xs font-bold text-american-blue hover:underline"
                    >
                      <ExternalLink size={14} />
                      Open Full Resolution Drawing
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fence Style Reference Photo section */}
          {estimate.jobReferencePhotoUrl && (
            <div className="space-y-6 pt-12 border-t border-[#F0F0F0]">
              <h3 className="text-lg font-black text-american-blue uppercase tracking-tight flex items-center gap-3">
                <span className="h-6 w-1 bg-american-red rounded-full" />
                Fence Style Reference Photo
              </h3>
              <p className="text-xs text-slate-500">
                This photo is provided as a style/reference example for the fence type quoted.
              </p>
              <div className="bg-white rounded-3xl p-4 border border-[#E5E5E5] flex flex-col gap-4 print:p-0 print:border-0">
                <div className="max-w-2xl mx-auto overflow-hidden rounded-2xl border border-american-blue/10 print:border-0">
                  <img 
                    src={estimate.jobReferencePhotoUrl} 
                    alt="Fence Style Reference"
                    referrerPolicy="no-referrer"
                    className="w-full h-auto object-contain max-h-[500px]" 
                  />
                </div>
                <div className="no-print text-center">
                  <a 
                    href={estimate.jobReferencePhotoUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex items-center gap-2 text-xs font-bold text-american-blue hover:underline"
                  >
                    <ExternalLink size={14} />
                    Open Full Resolution Reference Photo
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Terms & Conditions (From PDFs) */}
          <div className="space-y-8 pt-12 border-t border-[#F0F0F0]">
            <h3 className="text-lg font-black text-american-blue uppercase tracking-tight flex items-center gap-3">
              <span className="h-6 w-1 bg-american-red rounded-full" />
              III. Terms, Conditions & Disclosures
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 text-[11px] leading-relaxed text-[#555555]">
              {[
                { title: "1. Payment Terms", content: `Total Contract Price: ${formatCurrency(grandTotal)} | Deposit: [10%] due at signing. Balance: [90%] due upon completion. Invoiced via QuickBooks (check, ACH, credit card). 3% fee on credit card payments. Late fee of 5% per month on balances unpaid past 3 days.` },
                { title: "2. Change Orders", content: "Any changes to materials, layout, or additions requested after work begins must be agreed to in writing and may affect cost and timeline." },
                { title: "3. Client Responsibilities", content: "Client warrants property ownership or legal authority, is responsible for identifying property lines (LSFW is not responsible for disputes), must ensure access, provide utility clearance (811 Call Before You Dig), and must clear the immediate work area (including vehicles, items, and plants) of obstructions prior to painting or staining." },
                { 
                  title: "4. Warranty", 
                  content: "Workmanship is warranted for [1 year] from completion, covering installation defects. Exclusions: Normal wear/tear, settling, misuse, neglect, accidents, pets, vehicles, natural disasters. Materials covered by manufacturer warranty only. Staining/Painting workmanship warranty is limited to 30 days for application defects; exclusions include normal aging, fading, environmental factors, or product performance." + 
                    (estimate.runs?.some(r => r.reusePosts) ? " Contractor will reuse existing posts provided by Customer. Contractor's warranty DOES NOT apply to existing posts." : "")
                },
                { title: "5. Liability", content: "LSFW is insured. Contractor is not liable for damages outside the work area unless caused by negligence. Client is responsible for securing pets and protecting landscaping/items within work zones." },
                { title: "6. Termination", content: "Either party may terminate with 7 days written notice. Client remains responsible for payment for work performed and materials ordered." },
                { title: "7. Governing Law", content: "Governed by the laws of the State of Texas." },
                { title: "8. Entire Agreement", content: "Represents total understanding between Contractor and Client. No oral agreements are binding." },
                { title: "9. Lawn and Landscaping", content: "LSFW is not liable for damage to lawns, plants, trees, sprinkler systems, or landscaping resulting from normal foot traffic, material storage, or equipment use. Contractor takes reasonable precautions but is not responsible for damage caused by expected levels of overspray, drift, or runoff during painting or staining." },
                { title: "10. Spoil Haul-Off", content: "Spoil removal (excavated dirt, concrete, etc.) is not included in the base estimate. LSFW offers spoil haul-off for an additional fee that varies depending on the scope of the job, upon request." },
                { title: "11. Fence Length Tolerance", content: "All fence length estimates include a tolerance of ±5 feet. Final pricing may reflect minor adjustments based on actual field measurements." },
                { title: "12. Weather Delays", content: "In the event of rain or inclement weather, the scheduled job date may be delayed. Each weather day may result in up to a 2-day delay to the original schedule." },
                { title: "13. Fence Clearance & Swing Gap", content: "Due to natural variations in terrain, a gap of up to 3 inches between the bottom of the fence and the ground may be necessary for proper installation. Fence gates may have up to a 4-inch gap to allow for smooth swing and operation." },
                { title: "14. Painting & Staining Surfaces", content: "Variations in color, tone, and absorption are natural due to wood grain, age, and moisture content. LSFW is not responsible for color inconsistencies. Application is weather-dependent; rain, humidity, or extreme temperature variations may affect final appearance or curing." }
              ].map((term, idx) => (
                <div key={idx} className="space-y-2">
                  <p className="font-black text-american-blue uppercase tracking-widest">{term.title}</p>
                  <p className="font-medium">{term.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Signature Block */}
          <div className="pt-20 border-t border-dashed border-[#E5E5E5]">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#999999] mb-12 text-center">Acknowledgment & Professional Authorization</h3>
            
            <p className="text-sm font-medium text-[#444444] text-center max-w-2xl mx-auto mb-16 italic">
              "I have read, understood, and agree to the terms stated in this agreement. I acknowledge that Lone Star Fence Works has made all disclosures regarding liability, access, utility use, and warranty coverage."
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
              {/* Customer Column */}
              <div className="space-y-6 relative">
                {/* Visual signature overlay if accepted */}
                <div className="h-20 border-b-2 border-american-blue/20 relative flex items-end justify-between pb-2">
                  {estimate.customerSignature ? (
                    <div className="font-['Brush_Script_MT',_cursive,_sans-serif] text-3xl text-[#1d4ed8] tracking-wide h-12 flex items-center pl-2 italic">
                      {estimate.customerSignature}
                    </div>
                  ) : (
                    <div className="h-12" />
                  )}
                  {estimate.customerSignedDate && (
                    <div className="font-mono text-sm text-[#333333] font-semibold pr-2">
                      {formatDate(estimate.customerSignedDate)}
                    </div>
                  )}
                </div>
                
                <div className="flex justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#999999]">Customer Signature</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#999999]">Date</span>
                </div>
                <div className="pt-4">
                  <p className="text-lg font-bold text-american-blue uppercase">{resolvedClientName}</p>
                  {estimate.customerEmailSigned && (
                    <p className="text-xs text-gray-500 font-mono mt-1">{estimate.customerEmailSigned}</p>
                  )}
                </div>
              </div>

              {/* Representative Column */}
              <div className="space-y-6 relative">
                <div className="h-20 border-b-2 border-american-blue/20 relative flex items-end justify-between pb-2">
                  {estimate.representativeSignatureName ? (
                    <div className="font-['Brush_Script_MT',_cursive,_sans-serif] text-3xl text-[#b91c1c] tracking-wide h-12 flex items-center pl-2 italic">
                      {estimate.representativeSignatureName}
                    </div>
                  ) : (
                    <div className="h-12" />
                  )}
                  {estimate.representativeSignedDate && (
                    <div className="font-mono text-sm text-[#333333] font-semibold pr-2">
                      {formatDate(estimate.representativeSignedDate)}
                    </div>
                  )}
                </div>
                
                <div className="flex justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#999999]">Authorized Representative</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#999999]">Date</span>
                </div>
                <div className="pt-4">
                  <p className="text-lg font-bold text-american-blue uppercase">
                    {estimate.representativeSignatureName || COMPANY_INFO.name}
                  </p>
                  {estimate.representativeCompanyName && (
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-1">{estimate.representativeCompanyName}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contract Footer */}
        <div className="p-8 bg-[#F9F9F9] border-t border-[#F0F0F0] text-center">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#BBBBBB]">Lone Star Fence Works • Official Customer Contract • Fences With Character</p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          #contract-view { border: 0 !important; margin: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
          aside, nav { display: none !important; }
           .ai-content-area textarea { border: none !important; outline: none !important; box-shadow: none !important; }
        }
      `}} />
    </div>
  );
}
