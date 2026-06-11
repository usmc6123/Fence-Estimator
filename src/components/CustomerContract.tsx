import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Printer, FileText, Sparkles, Loader2, Download, Send, CheckCircle2, Navigation, RefreshCcw, Save, TrendingUp, Mail, Paperclip, Settings } from 'lucide-react';
import { Estimate, MaterialItem, LaborRates, SupplierQuote } from '../types';
import { calculateDetailedTakeOff, DetailedTakeOff } from '../lib/calculations';
import { cn, formatCurrency } from '../lib/utils';
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
  // Send Email Modal States
  const [openSendModal, setOpenSendModal] = React.useState(false);
  const [senderEmail, setSenderEmail] = React.useState('BradenS@LoneStarFenceWorks.com');
  const [customerEmail, setCustomerEmail] = React.useState(estimate.customerEmail || '');
  const [emailSubject, setEmailSubject] = React.useState('');
  const [emailMessage, setEmailMessage] = React.useState('');
  const [isSendingEmail, setIsSendingEmail] = React.useState(false);
  const [sendSuccessMessage, setSendSuccessMessage] = React.useState<string | null>(null);
  const [sendErrorMessage, setSendErrorMessage] = React.useState<string | null>(null);
  const [companySettings, setCompanySettings] = React.useState<any>(null);
  const [attachedFiles, setAttachedFiles] = React.useState<{ filename: string; mimeType: string; size: number; base64Data: string }[]>([]);
  const [attachmentError, setAttachmentError] = React.useState<string | null>(null);

  // Load Settings Effect
  React.useEffect(() => {
    async function loadCompanySettings() {
      try {
        const token = localStorage.getItem('company_admin_token');
        if (!token) return;
        const res = await fetch('/api/settings', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCompanySettings(data);
        }
      } catch (err) {
        console.warn('Failed to load company settings:', err);
      }
    }
    loadCompanySettings();
  }, [openSendModal]);

  // Email Config Setup Effect
  React.useEffect(() => {
    if (openSendModal) {
      setCustomerEmail(estimate.customerEmail || '');
      
      const host = window.location.host;
      const protocol = window.location.protocol;
      const estimateLink = `${protocol}//${host}/?portal=contract&estimateId=${estimate.id}`;
      const clientName = estimate.customerName || 'Valued Customer';

      let activeFromEmail = 'BradenS@LoneStarFenceWorks.com';
      let activeFromName = 'Lone Star Fence Works';
      let activeSubject = `Fence Installation Contract Agreement - Lone Star Fence Works`;
      let activeMessage = `Hello ${clientName},\n\nWe have generated your custom fencing contract agreement estimate. Please review and sign the agreement directly on your device using the secure link below:\n\n${estimateLink}\n\nThank you for choosing Lone Star Fence Works!\n\nBest regards,\nLone Star Fence Works Estimations Department`;

      if (companySettings) {
        if (companySettings.fromEmail) activeFromEmail = companySettings.fromEmail;
        if (companySettings.fromName) activeFromName = companySettings.fromName;
        
        if (companySettings.estimateEmailSubject) {
          activeSubject = companySettings.estimateEmailSubject
            .replace(/{customerName}/g, clientName)
            .replace(/{estimateNumber}/g, String(estimate.estimateNumber || ''))
            .replace(/{companyName}/g, companySettings.fromName || 'Lone Star Fence Works');
        }

        if (companySettings.estimateEmailBody) {
          activeMessage = companySettings.estimateEmailBody
            .replace(/{customerName}/g, clientName)
            .replace(/{customerEmail}/g, estimate.customerEmail || '')
            .replace(/{estimateNumber}/g, String(estimate.estimateNumber || ''))
            .replace(/{estimateLink}/g, estimateLink)
            .replace(/{companyName}/g, companySettings.fromName || 'Lone Star Fence Works')
            .replace(/{companyPhone}/g, companySettings.companyPhone || '')
            .replace(/{companyWebsite}/g, companySettings.companyWebsite || '');
        }
      }

      setSenderEmail(activeFromEmail);
      setEmailSubject(activeSubject);
      setEmailMessage(activeMessage);
      setSendSuccessMessage(null);
      setSendErrorMessage(null);
      setAttachedFiles([]);
      setAttachmentError(null);
    }
  }, [openSendModal, companySettings, estimate]);

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAttachmentError(null);
    const files = e.target.files;
    if (!files) return;

    const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx'];
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    const currentAttachments = [...attachedFiles];
    let currentTotalSize = currentAttachments.reduce((sum, f) => sum + f.size, 0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase();

      if (!ext || !allowedExtensions.includes(ext)) {
        setAttachmentError(`File "${file.name}" is unsupported. Only PDF, JPG, PNG, DOC, DOCX, XLS, XLSX are allowed.`);
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setAttachmentError(`File "${file.name}" exceeds the 10MB limit.`);
        return;
      }

      if (currentTotalSize + file.size > 20 * 1024 * 1024) {
        setAttachmentError('Total combined attachment size exceeds the 20MB limit.');
        return;
      }

      currentTotalSize += file.size;

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Data = event.target?.result as string;
        setAttachedFiles(prev => {
          const exists = prev.some(f => f.filename === file.name);
          if (!exists) {
            return [...prev, {
              filename: file.name,
              mimeType: file.type || 'application/octet-stream',
              size: file.size,
              base64Data
            }];
          }
          return prev;
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAttachment = (filename: string) => {
    setAttachedFiles(prev => prev.filter(f => f.filename !== filename));
    setAttachmentError(null);
  };

  const handleSendEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerEmail) {
      setSendErrorMessage('Customer email is required.');
      return;
    }

    setIsSendingEmail(true);
    setSendSuccessMessage(null);
    setSendErrorMessage(null);

    try {
      const token = localStorage.getItem('company_admin_token');
      const response = await fetch(`/api/estimates/write`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'send',
          estimateId: estimate.id,
          customerEmail,
          senderEmail,
          subject: emailSubject,
          message: emailMessage,
          attachments: attachedFiles
        })
      });

      const responseText = await response.text();
      console.log(`[SMTP EMAIL API RESPONSE] Code: ${response.status} (${response.statusText})`);

      let parsedJson: any = null;
      try {
        parsedJson = JSON.parse(responseText);
      } catch (jsonErr) {}

      if (response.ok) {
        setSendSuccessMessage('Fencing contract estimate pack successfully sent!');
        setTimeout(() => {
          setOpenSendModal(false);
        }, 1500);
        if (onUpdateEstimate) {
          onUpdateEstimate({
            customerEmailSent: true,
            customerEmailSentAt: new Date().toISOString()
          });
        }
      } else {
        const errorDetail = parsedJson?.error || responseText || 'Unknown server fail.';
        setSendErrorMessage(`API Error: ${errorDetail}`);
      }
    } catch (err: any) {
      setSendErrorMessage(err.message || 'Network dispatch fail. Please check SMTP settings.');
    } finally {
      setIsSendingEmail(false);
    }
  };

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

  // Gracefully clean up case where last name is misplaced in the email field
  const resolvedClientName = React.useMemo(() => {
    let name = estimate.customerName || 'Valued Customer';
    const email = estimate.customerEmail || '';
    if (email && !email.includes('@') && name && !name.toLowerCase().includes(email.toLowerCase())) {
      name = `${name} ${email}`.trim();
    }
    return name;
  }, [estimate.customerName, estimate.customerEmail]);

  const resolvedClientEmail = React.useMemo(() => {
    const email = estimate.customerEmail || '';
    if (email && !email.includes('@')) {
      return '';
    }
    return email;
  }, [estimate.customerEmail]);

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

  const data: DetailedTakeOff = React.useMemo(() => {
    return calculateDetailedTakeOff(estimate, resolvedMaterials, laborRates);
  }, [estimate, resolvedMaterials, laborRates]);

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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);

  // Pricing synchronization and adjustment states
  const [baseFencePrice, setBaseFencePrice] = useState<number | null>(estimate.baseFencePrice ?? null);
  const [addOnTotal, setAddOnTotal] = useState<number | null>(estimate.addOnTotal ?? null);
  const [demoRemovalPrice, setDemoRemovalPrice] = useState<number>(estimate.demoRemovalPrice ?? 0);
  const [demoRemovalDescription, setDemoRemovalDescription] = useState<string>(
    estimate.demoRemovalDescription ?? "Removal and disposal of existing fence material, if included in this estimate."
  );
  const [discountType, setDiscountType] = useState<'none' | 'fixed_amount' | 'free_gate' | 'custom'>(estimate.discountType ?? 'none');
  const [discountLabel, setDiscountLabel] = useState<string>(estimate.discountLabel ?? '');
  const [discountAmount, setDiscountAmount] = useState<number>(estimate.discountAmount ?? 0);
  const [discountReason, setDiscountReason] = useState<string>(estimate.discountReason ?? '');
  const [selectedGateId, setSelectedGateId] = useState<string>(estimate.discountType === 'free_gate' && estimate.discountReason ? estimate.discountReason : '');

  const isInitialMount = React.useRef(true);

  const markupFactor = 1 + (estimate.markupPercentage || 0) / 100;
  const taxFactor = (estimate.taxPercentage || 0) / 100;

  // Calculate project financial breakdown for component use
  const projectBreakdown = React.useMemo(() => {
    return data.runs.map(run => {
      // Fence Charge = Base Labor + Base Materials + Markup + Tax on Materials
      const baseFenceCharge = (run.fenceMaterialCost + run.fenceLaborCost) * markupFactor;
      const fenceTax = run.fenceMaterialCost * taxFactor;
      const totalFenceCharge = baseFenceCharge + fenceTax;
      
      // Gate Charge
      const baseGateCharge = (run.gateMaterialCost + run.gateLaborCost) * markupFactor;
      const gateTax = run.gateMaterialCost * taxFactor;
      const totalGateCharge = baseGateCharge + gateTax;

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
        ironPanelType: run.ironPanelType
      };
    });
  }, [data.runs, markupFactor, taxFactor]);

  // Sync state if estimate changes (e.g. from Estimator tab)
  useEffect(() => {
    if (estimate.manualSectionTotals) setSectionTotals(estimate.manualSectionTotals);
    if (estimate.manualGateTotals) setGateTotals(estimate.manualGateTotals);
    if (estimate.manualDemoTotals) setDemoTotals(estimate.manualDemoTotals);
    if (estimate.manualGrandTotal !== undefined) setManualGrandTotal(estimate.manualGrandTotal);

    setBaseFencePrice(estimate.baseFencePrice ?? null);
    setAddOnTotal(estimate.addOnTotal ?? null);
    setDemoRemovalPrice(estimate.demoRemovalPrice ?? 0);
    setDemoRemovalDescription(estimate.demoRemovalDescription ?? "Removal and disposal of existing fence material, if included in this estimate.");
    setDiscountType(estimate.discountType ?? 'none');
    setDiscountLabel(estimate.discountLabel ?? '');
    setDiscountAmount(estimate.discountAmount ?? 0);
    setDiscountReason(estimate.discountReason ?? '');
    setSelectedGateId(estimate.discountType === 'free_gate' && estimate.discountReason ? estimate.discountReason : '');
  }, [
    estimate.manualSectionTotals, 
    estimate.manualGateTotals, 
    estimate.manualDemoTotals, 
    estimate.manualGrandTotal,
    estimate.baseFencePrice,
    estimate.addOnTotal,
    estimate.demoRemovalPrice,
    estimate.demoRemovalDescription,
    estimate.discountType,
    estimate.discountLabel,
    estimate.discountAmount,
    estimate.discountReason
  ]);

  const handleResetManualOverrides = () => {
    if (confirm('Are you sure you want to reset all manual price overrides to calculated values?')) {
      setSectionTotals([]);
      setGateTotals([]);
      setDemoTotals([]);
      setManualGrandTotal(null);
      setManualGatePrices({});

      setBaseFencePrice(null);
      setAddOnTotal(null);
      setDemoRemovalPrice(0);
      setDemoRemovalDescription("Removal and disposal of existing fence material, if included in this estimate.");
      setDiscountType('none');
      setDiscountLabel('');
      setDiscountAmount(0);
      setDiscountReason('');
      setSelectedGateId('');

      if (onUpdateEstimate) {
        onUpdateEstimate({
          manualSectionTotals: [],
          manualGateTotals: [],
          manualDemoTotals: [],
          manualGrandTotal: null,
          manualGatePrices: {},
          baseFencePrice: null,
          addOnTotal: null,
          demoRemovalPrice: 0,
          demoRemovalDescription: "Removal and disposal of existing fence material, if included in this estimate.",
          discountType: 'none',
          discountLabel: '',
          discountAmount: 0,
          discountReason: '',
          finalCustomerPrice: undefined,
          subtotalBeforeDiscount: undefined,
          pricePerFoot: undefined
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
  }, [
    localAiScope, 
    sectionTotals, 
    gateTotals, 
    demoTotals, 
    manualGrandTotal, 
    projectDate, 
    manualGatePrices,
    baseFencePrice,
    addOnTotal,
    demoRemovalPrice,
    demoRemovalDescription,
    discountType,
    discountLabel,
    discountAmount,
    discountReason,
    selectedGateId
  ]);

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

  // Check if all runs are homogenous (same specs)
  const isHomogeneous = projectBreakdown.length > 1 && projectBreakdown.every(r => {
    const isWood = r.style.includes('Wood') || r.style.includes('Cedar') || r.style.includes('Pine');
    return r.style === projectBreakdown[0].style && 
      r.height === projectBreakdown[0].height &&
      (!isWood || (
        r.hasRotBoard === projectBreakdown[0].hasRotBoard &&
        r.hasTopCap === projectBreakdown[0].hasTopCap &&
        r.hasTrim === projectBreakdown[0].hasTrim &&
        r.picketStyle === projectBreakdown[0].picketStyle
      )) &&
      (r.style !== 'Wrought Iron' || (
        r.ironInstallType === projectBreakdown[0].ironInstallType &&
        r.ironPanelType === projectBreakdown[0].ironPanelType
      ));
  });

  const totalFenceCharge = projectBreakdown.reduce((sum, r, i) => sum + (sectionTotals[i] ?? r.totalFenceCharge), 0);
  const totalNetLF = projectBreakdown.reduce((sum, r) => sum + r.netLF, 0);
  
  // Calculate a dynamic grand total based on edited section totals
  const editedGrandTotal = React.useMemo(() => {
    // Start with the correctly calculated grand total from the library
    let total = data.totals.grandTotal;

    // Apply deltas ONLY for sections that actually have an override
    const overrideDelta = projectBreakdown.reduce((sum, r, i) => {
      // Check if user explicitly set a value that differs from the calculated one
      const fenceDelta = (sectionTotals[i] !== undefined && sectionTotals[i] !== null) ? (sectionTotals[i]! - r.totalFenceCharge) : 0;
      const gateDelta = (gateTotals[i] !== undefined && gateTotals[i] !== null) ? (gateTotals[i]! - r.totalGateCharge) : 0;
      const demoDelta = (demoTotals[i] !== undefined && demoTotals[i] !== null) ? (demoTotals[i]! - r.demoCharge) : 0;
      
      return sum + fenceDelta + gateDelta + demoDelta;
    }, 0);
    
    return total + overrideDelta;
  }, [data.totals.grandTotal, projectBreakdown, sectionTotals, gateTotals, demoTotals]);

  const grandTotal = manualGrandTotal ?? editedGrandTotal;
  const isGrandTotalOverridden = manualGrandTotal !== null;
  const hasSectionOverrides = sectionTotals.some(t => t !== null) || gateTotals.some(t => t !== null) || demoTotals.some(t => t !== null);
  const globalPricePerFoot = totalNetLF > 0 ? totalFenceCharge / totalNetLF : 0;

  // Pricing calculations
  const resolvedBaseFencePrice = baseFencePrice ?? totalFenceCharge;
  const resolvedGateTotal = projectBreakdown.reduce((sum, r, i) => sum + (gateTotals[i] ?? r.totalGateCharge), 0);
  const resolvedAddOnTotal = addOnTotal ?? (data?.totals?.prep * markupFactor || 0);
  
  const subtotalBeforeDiscount = resolvedBaseFencePrice + resolvedGateTotal + resolvedAddOnTotal + demoRemovalPrice;
  const finalCustomerPrice = manualGrandTotal !== null ? manualGrandTotal : Math.max(0, subtotalBeforeDiscount - discountAmount);
  
  const resolvedLinearFeet = totalNetLF > 0 ? totalNetLF : (estimate.linearFeet || 0);
  const pricePerFootValue = resolvedLinearFeet > 0 ? finalCustomerPrice / resolvedLinearFeet : 0;

  // List of all gates in this estimate for selection
  const allGatesList = React.useMemo(() => {
    const list: { gateId: string; runName: string; width: number; type: string; price: number }[] = [];
    projectBreakdown.forEach((run, runIdx) => {
      run.gates.forEach((gate, gIdx) => {
        const calculatedPrice = (gate.items.reduce((acc, item) => acc + item.total, 0) * markupFactor) + 
                             (gate.items.filter(i => i.category !== 'Labor').reduce((acc, item) => acc + item.total, 0) * taxFactor);
        const price = manualGatePrices[gate.gateId] ?? calculatedPrice;
        list.push({
          gateId: gate.gateId,
          runName: run.name,
          width: gate.width || 4,
          type: gate.type || 'Single',
          price
        });
      });
    });
    return list;
  }, [projectBreakdown, manualGatePrices, markupFactor, taxFactor]);

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
      const updates: any = {
        manualSectionTotals: sectionTotals,
        manualGateTotals: gateTotals,
        manualDemoTotals: demoTotals,
        manualGrandTotal: manualGrandTotal,
        contractProjectDate: projectDate,
        contractScope: localAiScope,
        manualGatePrices: manualGatePrices,
        baseFencePrice,
        addOnTotal,
        demoRemovalPrice,
        demoRemovalDescription,
        discountType,
        discountLabel,
        discountAmount,
        discountReason,
        finalCustomerPrice,
        subtotalBeforeDiscount,
        pricePerFoot: pricePerFootValue,
        pricingUpdatedAt: new Date().toISOString()
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
      const prompt = `
        You are a professional estimator for Lone Star Fence Works, a premium fence contractor in Texas. 
        Your tone is professional, confident, and direct. No fluff. 
        Generate a detailed, contractor-grade Scope of Work that protects the contractor legally.
        
        Customer: ${resolvedClientName}
        
        Project Sections & Details:
        ${data.runs.map((run, index) => {
          const originalRun = estimate.runs?.[index];
          return `
          Section Name: ${run.runName}
          Specs: ${run.height}' ${run.styleName}
          Length: ${run.linearFeet} LF
          Status: ${originalRun?.isExistingFence ? 'Existing Fence' : 'New Installation'}
          Needs Staining: ${originalRun?.needsStain ? 'Yes' : 'No'}
          Reuse Posts: ${originalRun?.reusePosts ? 'Yes' : 'No'}
          Post Installation Option: ${originalRun?.pipeInstallType || 'Set in Concrete'}
          
          Generate a detailed Scope of Work for this specific section.
          If this section is for staining only on existing fence, DO NOT describe it as a new installation. 
          Focus on preparation, staining application, and inherent limitations (variations in wood, weather dependency, etc.).
          
          If this section indicates reusing posts (reusePosts: true), you MUST include: 
          "Contractor will reuse existing posts provided by Customer. Contractor's warranty DOES NOT apply to existing posts."
        `}).join('\n')}

        Structure the final Scope of Work with Markdown bold headers to cover the entire project. Ensure the document clearly separates instructions and disclaimers for different sections (e.g., New Install vs Staining/Restoration). Clearly define warranty differences for new vs existing components.

        ADDITIONAL INSTRUCTIONS:
        ${customInstructions}
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
                type="button"
                onClick={() => setOpenSendModal(true)}
                className="flex items-center justify-center gap-2 px-8 py-5 rounded-2xl bg-[#0b2b5a] hover:bg-american-blue text-white font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl min-w-[180px]"
              >
                <Send size={18} />
                Send Estimate
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
                  <p className="text-sm font-bold text-[#444444] leading-relaxed">{estimate.customerAddress || 'No address specified'}</p>
                </div>
                {(estimate.customerPhone || resolvedClientEmail) && (
                  <p className="text-xs font-bold text-[#666666]">{estimate.customerPhone} {resolvedClientEmail && `• ${resolvedClientEmail}`}</p>
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
                        <h4 className="text-xl font-black text-american-blue uppercase tracking-tight">Unified Fence Pricing</h4>
                        <p className="text-xs font-bold text-[#999999] mt-1 italic uppercase tracking-wider">
                          {projectBreakdown[0].height}' {projectBreakdown[0].style} Specification
                          {projectBreakdown[0].style.includes('Iron') && (
                            <>
                              <span className="mx-2">•</span>
                              {projectBreakdown[0].ironInstallType}
                              <span className="mx-2">•</span>
                              {projectBreakdown[0].ironPanelType} Panels
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
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-black text-american-red">
                                {isCustomerView ? (
                                  <span>{formatCurrency((sectionTotals[i] ?? run.totalFenceCharge) / (run.netLF || 1))}</span>
                                ) : (
                                  <input 
                                    type="number" 
                                    value={((sectionTotals[i] ?? run.totalFenceCharge) / (run.netLF || 1)).toFixed(2)}
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
                                    {formatCurrency(sectionTotals[i] ?? run.totalFenceCharge)}
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-xs font-bold text-american-blue">$</span>
                                    <input 
                                      type="number" 
                                      value={(sectionTotals[i] ?? run.totalFenceCharge).toFixed(2)}
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
                                    {formatCurrency(gateTotals[i] ?? run.totalGateCharge)}
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-xs font-bold text-american-blue">$</span>
                                    <input 
                                      type="number" 
                                      value={(gateTotals[i] ?? run.totalGateCharge).toFixed(2)}
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
                                    {formatCurrency(demoTotals[i] ?? run.demoCharge)}
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-xs font-bold text-american-blue">$</span>
                                    <input 
                                      type="number" 
                                      value={(demoTotals[i] ?? run.demoCharge).toFixed(2)}
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
                                (sectionTotals[i] ?? run.totalFenceCharge) + 
                                (gateTotals[i] ?? run.totalGateCharge) + 
                                (demoTotals[i] ?? run.demoCharge)
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
                        {formatCurrency(finalCustomerPrice)}
                      </span>
                    ) : (
                      <>
                        <span className="text-xl font-black text-american-blue">$</span>
                        <input 
                          type="number"
                          step="0.01"
                          value={finalCustomerPrice.toFixed(2)}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : parseFloat(e.target.value);
                            setManualGrandTotal(val);
                            if (onUpdateEstimate) {
                              const resFinal = val !== null ? val : Math.max(0, subtotalBeforeDiscount - discountAmount);
                              const resLF = totalNetLF > 0 ? totalNetLF : (estimate.linearFeet || 0);
                              const resPPerFoot = resLF > 0 ? resFinal / resLF : 0;
                              onUpdateEstimate({
                                manualGrandTotal: val,
                                finalCustomerPrice: resFinal,
                                pricePerFoot: resPPerFoot
                              });
                            }
                          }}
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

              {/* Pricing Customizations and Summary */}
              {!isCustomerView && (
                <div className="bg-slate-50 rounded-3xl p-6 sm:p-8 border-2 border-dashed border-slate-200 space-y-6 mt-8 print:hidden">
                  <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
                    <div className="h-8 w-8 rounded-lg bg-american-blue flex items-center justify-center text-white">
                      <Settings size={18} />
                    </div>
                    <div>
                      <h4 className="font-black text-american-blue text-sm uppercase tracking-wider">Contract Pricing Administration</h4>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Modify base sections, add demo/removal, or apply custom discounts</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Base Fence Price Override */}
                    <div>
                      <label className="block text-[10px] font-black text-american-blue uppercase tracking-widest mb-1.5">
                        Base Fence Price ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder={totalFenceCharge.toFixed(2)}
                        value={baseFencePrice !== null ? baseFencePrice : ''}
                        onChange={(e) => {
                          const v = e.target.value === '' ? null : parseFloat(e.target.value);
                          setBaseFencePrice(v);
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 focus:border-american-blue outline-none transition-all"
                      />
                      <span className="text-[9px] text-slate-400 block mt-1">Calculated: {formatCurrency(totalFenceCharge)}</span>
                    </div>

                    {/* Site Prep & Add-ons */}
                    <div>
                      <label className="block text-[10px] font-black text-american-blue uppercase tracking-widest mb-1.5">
                        Add-ons / Site Prep ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder={(data?.totals?.prep * markupFactor || 0).toFixed(2)}
                        value={addOnTotal !== null ? addOnTotal : ''}
                        onChange={(e) => {
                          const v = e.target.value === '' ? null : parseFloat(e.target.value);
                          setAddOnTotal(v);
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 focus:border-american-blue outline-none transition-all"
                      />
                      <span className="text-[9px] text-slate-400 block mt-1">Calculated: {formatCurrency(data?.totals?.prep * markupFactor || 0)}</span>
                    </div>

                    {/* Demo Removal Price */}
                    <div>
                      <label className="block text-[10px] font-black text-american-blue uppercase tracking-widest mb-1.5">
                        Demo & Removal Price ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder={projectBreakdown.reduce((sum, r, i) => sum + (demoTotals[i] ?? r.demoCharge), 0).toFixed(2)}
                        value={demoRemovalPrice || ''}
                        onChange={(e) => {
                          const v = e.target.value === '' ? 0 : parseFloat(e.target.value);
                          setDemoRemovalPrice(v);
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 focus:border-american-blue outline-none transition-all"
                      />
                      <span className="text-[9px] text-slate-400 block mt-1">Calculated: {formatCurrency(projectBreakdown.reduce((sum, r, i) => sum + (demoTotals[i] ?? r.demoCharge), 0))}</span>
                    </div>
                  </div>

                  {/* Demo/Removal Description */}
                  <div>
                    <label className="block text-[10px] font-black text-american-blue uppercase tracking-widest mb-1.5">
                      Demo & Removal Description
                    </label>
                    <textarea
                      rows={2}
                      value={demoRemovalDescription}
                      onChange={(e) => setDemoRemovalDescription(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600 focus:border-american-blue outline-none transition-all"
                    />
                  </div>

                  {/* Discount Options */}
                  <div className="border-t border-slate-200 pt-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Discount Type */}
                      <div>
                        <label className="block text-[10px] font-black text-american-blue uppercase tracking-widest mb-1.5">
                          Discount Type
                        </label>
                        <select
                          value={discountType}
                          onChange={(e) => {
                            const newType = e.target.value as any;
                            setDiscountType(newType);
                            if (newType === 'none') {
                              setDiscountAmount(0);
                              setDiscountLabel('');
                              setDiscountReason('');
                              setSelectedGateId('');
                            } else if (newType === 'free_gate') {
                              setDiscountLabel('Discount - Free Walk Gate');
                              setDiscountReason('');
                              setSelectedGateId('');
                            } else if (newType === 'fixed_amount' || newType === 'custom') {
                              setDiscountLabel('Contract discount');
                              setDiscountReason('');
                            }
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 focus:border-american-blue outline-none transition-all"
                        >
                          <option value="none">No Discount</option>
                          <option value="fixed_amount">Fixed Amount Discount</option>
                          <option value="free_gate">Free Gate Option</option>
                          <option value="custom">Custom Deal/Promotion</option>
                        </select>
                      </div>

                      {/* Dynamic Free Gate Selection Dropdown */}
                      {discountType === 'free_gate' && (
                        <div>
                          <label className="block text-[10px] font-black text-american-blue uppercase tracking-widest mb-1.5">
                            Select Free Gate
                          </label>
                          <select
                            value={selectedGateId}
                            onChange={(e) => {
                              const sId = e.target.value;
                              const selectedGate = allGatesList.find(g => g.gateId === sId);
                              if (selectedGate) {
                                setSelectedGateId(sId);
                                setDiscountAmount(selectedGate.price);
                                setDiscountLabel(`Discount - Free Walk Gate (${selectedGate.width}' ${selectedGate.type})`);
                                setDiscountReason(sId);
                              } else {
                                setSelectedGateId('');
                                setDiscountAmount(0);
                                setDiscountLabel('Discount - Free Walk Gate');
                                setDiscountReason('');
                              }
                            }}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 focus:border-american-blue outline-none transition-all"
                          >
                            <option value="">-- Choose Gate --</option>
                            {allGatesList.map(g => (
                              <option key={g.gateId} value={g.gateId}>
                                {g.width}' {g.type} inside {g.runName} ({formatCurrency(g.price)})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Discount Label */}
                      {discountType !== 'none' && (
                        <div className={discountType === 'free_gate' ? "" : "md:col-span-2"}>
                          <label className="block text-[10px] font-black text-american-blue uppercase tracking-widest mb-1.5">
                            Discount Label (Customer-Facing)
                          </label>
                          <input
                            type="text"
                            value={discountLabel}
                            onChange={(e) => setDiscountLabel(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 focus:border-american-blue outline-none transition-all"
                          />
                        </div>
                      )}
                    </div>

                    {discountType !== 'none' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Discount Amount */}
                        <div>
                          <label className="block text-[10px] font-black text-american-blue uppercase tracking-widest mb-1.5">
                            Discount Amount ($)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={discountAmount || ''}
                            onChange={(e) => {
                              const amt = e.target.value === '' ? 0 : parseFloat(e.target.value);
                              setDiscountAmount(amt);
                            }}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 focus:border-american-blue outline-none transition-all"
                          />
                          <span className="text-[9px] text-slate-400 block mt-1">Subtracts immediately from Customer Total</span>
                        </div>

                        {/* Discount Reason */}
                        <div>
                          <label className="block text-[10px] font-black text-american-blue uppercase tracking-widest mb-1.5">
                            Discount Reason / Deal Details
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Autumn Special, Military Discount, Bundle deal"
                            value={discountReason}
                            onChange={(e) => setDiscountReason(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 focus:border-american-blue outline-none transition-all"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Itemized Pricing Summary Section (Visible to both Custom View and Admin view) */}
              <div className="bg-[#F8F9FA] rounded-3xl p-6 sm:p-8 border border-[#E5E5E5] mt-8 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 border-b border-[#F0F0F0] pb-4 mb-4">
                  <span className="h-5 w-1 bg-american-blue rounded-full" />
                  <h4 className="font-black text-american-blue uppercase tracking-wider text-xs">Agreement Summary Breakdown</h4>
                </div>
                
                <div className="space-y-3.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-500 uppercase tracking-wider">Base Fencing Structure</span>
                    <span className="font-semibold text-slate-800 font-mono text-xs">{formatCurrency(resolvedBaseFencePrice)}</span>
                  </div>

                  {resolvedGateTotal > 0 && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-500 uppercase tracking-wider">Access Systems & Gateways</span>
                      <span className="font-semibold text-slate-800 font-mono text-xs">{formatCurrency(resolvedGateTotal)}</span>
                    </div>
                  )}

                  {resolvedAddOnTotal > 0 && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-500 uppercase tracking-wider">Site Clears & Custom Addons</span>
                      <span className="font-semibold text-slate-800 font-mono text-xs">{formatCurrency(resolvedAddOnTotal)}</span>
                    </div>
                  )}

                  {demoRemovalPrice > 0 && (
                    <div className="flex justify-between items-center text-xs pt-1">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-500 uppercase tracking-wider">Demo & Removal Services</span>
                        <span className="text-[9px] text-slate-400 italic max-w-sm mt-0.5 leading-relaxed font-semibold">
                          {demoRemovalDescription}
                        </span>
                      </div>
                      <span className="font-semibold text-slate-850 font-mono text-xs self-start">{formatCurrency(demoRemovalPrice)}</span>
                    </div>
                  )}

                  <div className="border-t border-[#F0F0F0] pt-3.5 flex justify-between items-center text-xs">
                    <span className="font-black text-american-blue uppercase tracking-wider">Subtotal Before Discounts</span>
                    <span className="font-black text-american-blue font-mono text-xs">{formatCurrency(subtotalBeforeDiscount)}</span>
                  </div>

                  {discountType !== 'none' && discountAmount > 0 && (
                    <div className="flex justify-between items-center text-xs bg-red-50/50 p-2 rounded-xl border border-red-100/50 font-bold">
                      <div className="flex flex-col col-span-2">
                        <span className="font-black text-american-red uppercase tracking-wider">{discountLabel || 'Deal Discount'}</span>
                        {discountReason && <span className="text-[9px] text-slate-500 font-medium uppercase mt-0.5">{discountReason}</span>}
                      </div>
                      <span className="font-black text-american-red font-mono text-xs">-{formatCurrency(discountAmount)}</span>
                    </div>
                  )}

                  <div className="border-t-2 border-american-blue/10 pt-3.5 flex justify-between items-center text-sm bg-american-blue/[0.02] -mx-6 -mb-6 px-6 py-4 rounded-b-3xl mt-4">
                    <div className="flex flex-col">
                      <span className="font-black text-american-blue uppercase tracking-wider">Guaranteed Final Total</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                        Price Per Foot: {resolvedLinearFeet > 0 ? `${formatCurrency(pricePerFootValue)}/LF` : 'N/A'} • {resolvedLinearFeet.toFixed(1)} LF
                      </span>
                    </div>
                    <span className="font-black text-american-blue text-lg font-mono">{formatCurrency(finalCustomerPrice)}</span>
                  </div>
                </div>
              </div>

              {/* Grand Total */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-8 p-6 sm:p-10 bg-american-blue rounded-3xl text-white relative overflow-hidden mt-8 shadow-xl">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                   <CheckCircle2 size={100} />
                </div>
                <div className="relative z-10 text-center md:text-left">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50 mb-1">Guaranteed Project Quoted Total</p>
                  <h3 className="text-3xl font-black tracking-tighter">TOTAL INVESTMENT</h3>
                </div>
                <div className="relative z-10 text-center md:text-right w-full md:w-auto">
                  <div className="flex items-center justify-center md:justify-end gap-1 mb-1 relative group">
                    {isCustomerView ? (
                      <span className="text-5xl md:text-7xl font-black tabular-nums tracking-tighter leading-none text-white">
                        {formatCurrency(finalCustomerPrice)}
                      </span>
                    ) : (
                      <>
                        <span className="text-3xl font-black tabular-nums tracking-tighter self-center">$</span>
                        <input 
                          type="number"
                          step="0.01"
                          value={finalCustomerPrice.toFixed(2)}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : parseFloat(e.target.value);
                            setManualGrandTotal(val);
                            if (onUpdateEstimate) {
                              const resFinal = val !== null ? val : Math.max(0, subtotalBeforeDiscount - discountAmount);
                              const resLF = totalNetLF > 0 ? totalNetLF : (estimate.linearFeet || 0);
                              const resPPerFoot = resLF > 0 ? resFinal / resLF : 0;
                              onUpdateEstimate({
                                manualGrandTotal: val,
                                finalCustomerPrice: resFinal,
                                pricePerFoot: resPPerFoot
                              });
                            }
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
                    <p className="text-[10px] font-black uppercase tracking-widest text-american-red/80 mb-2">Manual Override Active • Original: {formatCurrency(editedGrandTotal)}</p>
                  )}
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Valid for 30 days from date of issue</p>
                </div>
              </div>
            </div>
          </div>

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
        {/* Contract Footer */}
        <div className="p-8 bg-[#F9F9F9] border-t border-[#F0F0F0] text-center">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#BBBBBB]">Lone Star Fence Works • Official Customer Contract • Fences With Character</p>
        </div>
      </div>

      {/* Send Estimate Email Modal Popup */}
      <AnimatePresence>
        {openSendModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col text-slate-800"
            >
              <div className="p-6 bg-gradient-to-r from-american-blue to-[#0b2b5a] text-white flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 p-2.5 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                    <Mail size={20} className="text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-black uppercase tracking-wider">Send Contract Estimate</h3>
                    <p className="text-[10px] opacity-70 font-semibold uppercase tracking-widest mt-0.5">Lone Star Dispatch Center</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenSendModal(false)}
                  className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSendEmailSubmit} className="p-6 space-y-4 text-left overflow-y-auto max-h-[75vh]">
                {sendSuccessMessage && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-bold uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle2 size={16} fill="#10B981" className="text-white shadow" />
                    <span>{sendSuccessMessage}</span>
                  </div>
                )}

                {sendErrorMessage && (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl font-medium tracking-wide flex items-start gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse shrink-0 mt-1" />
                    <div className="flex-1 space-y-1 text-left">
                      <span className="font-bold uppercase block text-[10px] tracking-wider text-red-600 mb-0.5">Transmission Diagnostic Warning</span>
                      <p className="normal-case break-words leading-relaxed whitespace-pre-wrap text-[#c2410c] font-mono text-[11px] select-all">{sendErrorMessage}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Sender Email */}
                  <div className="space-y-1">
                    <label className="block text-[9px] font-black uppercase tracking-wider text-slate-500">Sender (My Email)</label>
                    <input
                      type="email"
                      required
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-american-blue"
                    />
                  </div>

                  {/* Customer Email */}
                  <div className="space-y-1">
                    <label className="block text-[9px] font-black uppercase tracking-wider text-slate-500">Recipient (Customer Email)</label>
                    <input
                      type="email"
                      required
                      placeholder="customer@email.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-american-blue"
                    />
                  </div>
                </div>

                {/* Email Subject */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-black uppercase tracking-wider text-slate-500">Email Subject</label>
                  <input
                    type="text"
                    required
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-american-blue"
                  />
                </div>

                {/* Email Body Message */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">Email Message Payload</label>
                    <span className="text-[8px] font-bold tracking-widest text-[#9333EA] uppercase bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                      Auto-Injected Link
                    </span>
                  </div>
                  <textarea
                    required
                    rows={6}
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-american-blue leading-relaxed resize-none font-sans"
                  />
                </div>

                {/* Attach Files Section */}
                <div className="space-y-2">
                  <label className="block text-[9px] font-black uppercase tracking-wider text-slate-500">
                    Attach Files (Optional)
                  </label>
                  
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center justify-center gap-2 w-full p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl hover:bg-slate-100 cursor-pointer transition-all">
                      <Paperclip size={14} className="text-slate-600" />
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Choose Files to Attach</span>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                        onChange={handleAttachmentChange}
                        className="hidden"
                      />
                    </label>
                    <span className="text-[9px] text-slate-400 font-medium">
                      Supported: PDF, JPG, PNG, DOC, DOCX, XLS, XLSX (Max 10MB per file, 20MB total)
                    </span>
                  </div>

                  {attachmentError && (
                    <div className="p-2 border border-red-200 bg-red-50 text-red-700 text-[10px] uppercase tracking-wider font-bold rounded-lg leading-relaxed">
                      ⚠️ {attachmentError}
                    </div>
                  )}

                  {attachedFiles.length > 0 && (
                    <div className="max-h-28 overflow-y-auto border border-slate-100 rounded-xl p-2 bg-slate-50 space-y-1.5 scrollbar-thin">
                      {attachedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between text-[11px] font-medium text-slate-700 bg-white border border-slate-150 rounded-lg px-2.5 py-1.5 shadow-sm">
                          <span className="truncate max-w-[200px]" title={file.filename}>
                            📎 {file.filename}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[9px] font-mono text-slate-400 font-medium">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                            <button
                              type="button"
                              onClick={() => removeAttachment(file.filename)}
                              className="text-red-500 hover:text-red-700 font-bold transition-all text-xs px-1 hover:bg-red-50 rounded"
                            >
                              ✕
                            </button>
                          </div>
                      </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 flex gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setOpenSendModal(false)}
                    className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSendingEmail}
                    className="flex-1 py-2.5 bg-[#0b2b5a] text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all hover:bg-american-blue disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-american-blue/15"
                  >
                    {isSendingEmail ? (
                      <>
                        <Loader2 className="animate-spin" size={14} />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send size={12} className="text-white" />
                        <span>Send Package</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
