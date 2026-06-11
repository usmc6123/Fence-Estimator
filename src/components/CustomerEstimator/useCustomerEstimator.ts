import React from 'react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, getEstimateDoc } from '../../lib/firebase';
import {
  CustomerEstimateData,
  calculateCustomerEstimate,
  EstimateBreakdown
} from './customerEstimateCalculations';
import { MaterialItem, LaborRates, Estimate } from '../../types';

const INITIAL_DATA: CustomerEstimateData = {
  fenceType: '',
  linearFeet: 100,
  height: 6,
  material: 'PT Pine',
  needGates: false,
  gateCount: 1,
  gateType: 'Single Swing',
  siteCondition: 'Level',
  removeOldFence: false,
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  street: '',
  city: '',
  state: '',
  zip: '',
  isPreStained: false,
  reusePosts: false,
  picketStyle: 'w-side',
  topStyle: 'Dog Ear',
  hasTopCap: false,
  hasCapAndTrim: false,
  pipePaintColor: 'Black',
  pipeWireType: 'Black',
};

export function useCustomerEstimator(
  propMaterials?: MaterialItem[],
  propLaborRates?: LaborRates,
  propEstimate?: Partial<Estimate>
) {
  const [step, setStep] = React.useState<number>(1);
  const [data, setData] = React.useState<CustomerEstimateData>(INITIAL_DATA);
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ghlSynced, setGhlSynced] = React.useState<boolean>(false);

  // Real-time calculation breakdown
  const [breakdown, setBreakdown] = React.useState<EstimateBreakdown>(() => 
    calculateCustomerEstimate(INITIAL_DATA, propMaterials, propLaborRates, propEstimate)
  );

  React.useEffect(() => {
    setBreakdown(calculateCustomerEstimate(data, propMaterials, propLaborRates, propEstimate));
  }, [data, propMaterials, propLaborRates, propEstimate]);

  const updateField = React.useCallback(<K extends keyof CustomerEstimateData>(
    field: K,
    value: CustomerEstimateData[K]
  ) => {
    setData(prev => {
      const newData = { ...prev, [field]: value };
      if (['street', 'city', 'state', 'zip'].includes(field as string)) {
        const s = field === 'street' ? (value as string) : (prev.street || '');
        const c = field === 'city' ? (value as string) : (prev.city || '');
        const st = field === 'state' ? (value as string) : (prev.state || '');
        const z = field === 'zip' ? (value as string) : (prev.zip || '');
        newData.address = `${s}, ${c}, ${st} ${z}`.trim().replace(/^,|,$/g, '').trim();
      }
      if (field === 'fenceType') {
        if (value === 'Wood Fence') {
          newData.material = 'PT Pine';
          newData.height = 6;
        } else if (value === 'Wrought iron fence') {
          newData.material = 'Standard flat top';
          newData.height = 4;
        } else if (value === 'chain link fence') {
          newData.material = 'Residential Grade';
          newData.height = 6;
        } else if (value === 'pipe fence') {
          newData.material = 'Set in Concrete';
          newData.height = 5;
          newData.pipePaintColor = 'Black';
          newData.pipeWireType = 'Black';
        }
      }
      if (field === 'topStyle') {
        if (value === 'Flat Top') {
          newData.hasCapAndTrim = true;
        } else {
          newData.hasCapAndTrim = false;
        }
      }
      return newData;
    });
  }, []);

  const handleNext = React.useCallback(() => {
    // Basic validation based on step
    if (step === 1 && !data.fenceType) {
      setError('Please select a fence type before moving to the next step.');
      return;
    }
    if (step === 2) {
      if (!data.linearFeet || data.linearFeet <= 0) {
        setError('Please enter a valid length in linear feet.');
        return;
      }
      if (!data.height) {
        setError('Please select a height.');
        return;
      }
    }
    if (step === 3 && !data.material) {
      setError('Please select a material choice before moving to the next step.');
      return;
    }
    
    setError(null);
    setStep(prev => prev + 1);
  }, [step, data]);

  const handleBack = React.useCallback(() => {
    setError(null);
    setStep(prev => Math.max(1, prev - 1));
  }, []);

  const resetEstimator = React.useCallback(() => {
    setStep(1);
    setData(INITIAL_DATA);
    setSubmitSuccess(false);
    setError(null);
    setIsSubmitting(false);
    setGhlSynced(false);
  }, []);

  const handleSubmit = React.useCallback(async () => {
    // Form verification for step 5
    if (!data.firstName.trim() || !data.lastName.trim() || !data.email.trim() || !data.phone.trim() || !data.street?.trim() || !data.city?.trim() || !data.state?.trim() || !data.zip?.trim()) {
      setError('All contact and address fields are required to submit the estimate.');
      return;
    }

    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const estId = `est-cust-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    // Map style
    let defaultStyleId = 'wood-privacy';
    if (data.fenceType === 'chain link fence') {
      defaultStyleId = 'chain-link';
    } else if (data.fenceType === 'Wrought iron fence') {
      defaultStyleId = 'aluminum-ornamental';
    } else if (data.fenceType === 'pipe fence') {
      defaultStyleId = 'pipe-no-climb';
    }

    // Resolve active estimate config settings
    let activeEstimateConfig: any = propEstimate || {};
    if (!propEstimate && typeof window !== 'undefined') {
      try {
        const cachedEst = localStorage.getItem('fence_pro_estimate');
        if (cachedEst) {
          activeEstimateConfig = JSON.parse(cachedEst);
        }
      } catch (e) {
        console.error(e);
      }
    }

    const wastePercentage = activeEstimateConfig.wastePercentage !== undefined ? activeEstimateConfig.wastePercentage : 0;
    const markupPercentage = activeEstimateConfig.markupPercentage !== undefined ? activeEstimateConfig.markupPercentage : 20;
    const taxPercentage = activeEstimateConfig.taxPercentage !== undefined ? activeEstimateConfig.taxPercentage : 8.25;
    const concreteType = activeEstimateConfig.concreteType || 'Maximizer';
    const footingType = activeEstimateConfig.footingType || 'Cuboid';
    const postWidth = activeEstimateConfig.postWidth !== undefined ? activeEstimateConfig.postWidth : 6;
    const postThickness = activeEstimateConfig.postThickness !== undefined ? activeEstimateConfig.postThickness : 6;

    // Build Estimate model
    const customerEstimateDoc = {
      id: estId,
      customerName: `${data.firstName} ${data.lastName}`,
      customerEmail: data.email,
      customerPhone: data.phone,
      customerAddress: data.address,
      customerStreet: data.street || data.address || '',
      customerCity: data.city || '',
      customerState: data.state || '',
      customerZip: data.zip || '',
      date: now,
      createdAt: now,
      lastModified: now,
      status: 'active',
      jobStatus: 'Estimate Pending',
      linearFeet: data.linearFeet,
      height: data.height,
      defaultStyleId: defaultStyleId,
      defaultHeight: data.height,
      companyId: 'lonestarfence',
      isCustomerEstimate: true,
      subtotal: Math.round(breakdown.subtotal * 100) / 100,
      total: Math.round(breakdown.total * 100) / 100,
      gateCount: data.needGates ? data.gateCount : 0,
      hasSitePrep: false,
      needsClearing: false,
      needsMarking: false,
      obstacleRemoval: false,
      postCapId: 'pc-dome',
      hasCapAndTrim: !!data.hasCapAndTrim,
      hasTopCap: !!data.hasTopCap,
      topStyle: data.topStyle || 'Dog Ear',
      wastePercentage: wastePercentage,
      includeStain: !!data.isPreStained,
      footingType: footingType,
      concreteType: concreteType,
      postWidth: postWidth,
      postThickness: postThickness,
      markupPercentage: markupPercentage,
      taxPercentage: taxPercentage,
      deliveryFee: 0,
      manualQuantities: {},
      manualPrices: {},
      runs: [{
        id: `run-${Math.random().toString(36).substr(2, 9)}`,
        name: `Customer Section - ${data.fenceType}`,
        linearFeet: data.linearFeet,
        corners: 0,
        gates: data.needGates ? data.gateCount : 0,
        gateDetails: data.needGates ? [{
          id: `gate-${Math.random().toString(36).substr(2, 9)}`,
          type: data.gateType === 'Double Swing' ? 'Double' : 'Single',
          width: data.gateType === 'Double Swing' ? 8 : 4,
          construction: defaultStyleId === 'aluminum-ornamental' ? 'Welded' : 'Pre-made'
        }] : [],
        styleId: defaultStyleId,
        visualStyleId: defaultStyleId === 'aluminum-ornamental' 
          ? (data.material === 'Extended pickets' ? 'm-2rep' : (data.material === '3 rail racking' ? 'm-3rr' : 'm-2rft'))
          : (defaultStyleId === 'pipe-no-climb' ? (data.pipeWireType === 'Black' ? 'p-black' : 'p-std') : (defaultStyleId === 'wood-privacy' ? (data.picketStyle || 'w-side') : 'standard')),
        height: data.height,
        color: defaultStyleId === 'pipe-no-climb' ? (data.pipePaintColor || 'Black') : 'Natural',
        woodType: defaultStyleId === 'wood-privacy' 
          ? (data.material === 'Japanese Cedar' ? 'Japanese Cedar' : (data.material === 'Western Red Cedar' ? 'Western Red Cedar' : 'PT Pine')) 
          : undefined,
        chainLinkGrade: defaultStyleId === 'chain-link' 
          ? (data.material === 'Commercial Grade' ? 'Commercial' : 'Residential')
          : undefined,
        pipeInstallType: defaultStyleId === 'pipe-no-climb' 
          ? 'Set in Concrete'
          : undefined,
        isPreStained: !!data.isPreStained,
        reusePosts: !!data.reusePosts,
        hasDemolition: !!data.removeOldFence,
        demoLinearFeet: data.removeOldFence ? data.linearFeet : 0,
        demoType: defaultStyleId === 'wood-privacy' ? 'Wood' : (defaultStyleId === 'chain-link' ? 'Chain Link' : 'Metal'),
        topStyle: data.topStyle || 'Dog Ear',
      }]
    };

    // Deep clean helper to wipe out undefined fields recursively so Firestore doesn't crash on nested fields
    const deepClean = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(deepClean);
      } else if (obj !== null && typeof obj === 'object') {
        const cleaned: any = {};
        Object.keys(obj).forEach(key => {
          if (obj[key] !== undefined) {
            cleaned[key] = deepClean(obj[key]);
          }
        });
        return cleaned;
      }
      return obj;
    };

    const cleanedCustomerEstimateDoc = deepClean(customerEstimateDoc);

    // Always append to local ledger first as a guaranteed offline-first backup record
    try {
      const localLedgerStr = localStorage.getItem('customer_estimator_local_ledger') || '[]';
      const localLedger = JSON.parse(localLedgerStr);
      localLedger.push(cleanedCustomerEstimateDoc);
      localStorage.setItem('customer_estimator_local_ledger', JSON.stringify(localLedger));
      // Dispatch an event to immediately notify the application about the newly submitted estimate
      window.dispatchEvent(new Event('customer_estimator_estimate_submitted'));
    } catch (localErr) {
      console.error('Failed to save to local backup ledger:', localErr);
    }

    try {
      const gateSummary = data.needGates ? `${data.gateCount} x ${data.gateType}` : 'None';
      const selectedOptions: string[] = [];
      if (data.isPreStained) selectedOptions.push('Pre-stained Wood');
      if (data.reusePosts) selectedOptions.push('Reuse Existing Posts');
      if (data.removeOldFence) selectedOptions.push('Remove Existing Fence');
      if (data.hasTopCap) selectedOptions.push('Top Cap');
      if (data.hasCapAndTrim) selectedOptions.push('Cap and Trim');

      const payload = {
        action: 'submit-instant-estimator',
        id: estId,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        customerName: `${data.firstName.trim()} ${data.lastName.trim()}`.trim(),
        email: data.email.trim(),
        phone: data.phone.trim(),
        address: (data.street || '').trim(),
        city: (data.city || '').trim(),
        state: (data.state || '').trim(),
        zip: (data.zip || '').trim(),
        fenceType: data.fenceType || 'Wood Fence',
        fenceHeight: data.height,
        linearFeet: data.linearFeet,
        gateCount: data.needGates ? data.gateCount : 0,
        gateSummary: gateSummary,
        selectedOptions: selectedOptions,
        estimatedPrice: Math.round(breakdown.total * 100) / 100,
        createdAt: now,
        ...cleanedCustomerEstimateDoc
      };

      console.info('Submitting instant estimate to unified backend pipeline...');
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log('Instant Estimator Submit Response status:', response.status, 'Response:', responseText);

      if (!response.ok) {
        let errorMsg = 'Failed to submit estimate.';
        try {
          const parsed = JSON.parse(responseText);
          if (parsed.error) errorMsg = parsed.error;
        } catch (_) {}
        throw new Error(errorMsg);
      }

      let parsedSuccess: any = {};
      try {
        parsedSuccess = JSON.parse(responseText);
      } catch (_) {}

      if (parsedSuccess.ghlWebhookTriggered) {
        setGhlSynced(true);
      }

      setSubmitSuccess(true);
      setStep(6);
    } catch (saveError: any) {
      console.error('Failed to submit estimate', saveError);
      setError(saveError.message || 'Failed to submit your estimate. Please check your network and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [data, breakdown, isSubmitting]);

  return {
    step,
    setStep,
    data,
    updateField,
    breakdown,
    isSubmitting,
    submitSuccess,
    error,
    ghlSynced,
    handleNext,
    handleBack,
    handleSubmit,
    resetEstimator,
  };
}
