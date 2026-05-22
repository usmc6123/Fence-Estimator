import React from 'react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  CustomerEstimateData,
  calculateCustomerEstimate,
  EstimateBreakdown
} from './customerEstimateCalculations';

const INITIAL_DATA: CustomerEstimateData = {
  fenceType: '',
  linearFeet: 100,
  height: 6,
  material: 'Pressure-treated',
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
};

export function useCustomerEstimator() {
  const [step, setStep] = React.useState<number>(1);
  const [data, setData] = React.useState<CustomerEstimateData>(INITIAL_DATA);
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ghlSynced, setGhlSynced] = React.useState<boolean>(false);

  // Real-time calculation breakdown
  const [breakdown, setBreakdown] = React.useState<EstimateBreakdown>(() => 
    calculateCustomerEstimate(INITIAL_DATA)
  );

  React.useEffect(() => {
    setBreakdown(calculateCustomerEstimate(data));
  }, [data]);

  const updateField = React.useCallback(<K extends keyof CustomerEstimateData>(
    field: K,
    value: CustomerEstimateData[K]
  ) => {
    setData(prev => ({
      ...prev,
      [field]: value
    }));
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
      setError('Please select a material.');
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
    if (!data.firstName.trim() || !data.lastName.trim() || !data.email.trim() || !data.phone.trim() || !data.address.trim()) {
      setError('All contact fields are required to submit the estimate.');
      return;
    }

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

    // Build Estimate model
    const customerEstimateDoc = {
      id: estId,
      customerName: `${data.firstName} ${data.lastName}`,
      customerEmail: data.email,
      customerPhone: data.phone,
      customerAddress: data.address,
      customerStreet: data.address,
      customerCity: '',
      customerState: '',
      customerZip: '',
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
      hasCapAndTrim: false,
      wastePercentage: 10,
      includeStain: false,
      footingType: 'Cuboid',
      concreteType: 'Maximizer',
      postWidth: 4,
      postThickness: 4,
      markupPercentage: 10,
      taxPercentage: 8,
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
          width: 4,
          construction: 'Pre-made'
        }] : [],
        styleId: defaultStyleId,
        visualStyleId: 'standard',
        height: data.height,
        color: 'Natural',
        woodType: data.material === 'Cedar' ? 'Japanese Cedar' : 'PT Pine'
      }]
    };

    try {
      // 1. Save to Firestore
      await setDoc(doc(db, 'estimates', estId), customerEstimateDoc);

      // 2. Fetch GHL Webhook info from companySettings
      let ghlWebhookUrl = '';
      try {
        const settingsDoc = await getDoc(doc(db, 'companySettings', 'main'));
        if (settingsDoc.exists()) {
          const settings = settingsDoc.data();
          if (settings.ghlWebhookUrl) {
            ghlWebhookUrl = settings.ghlWebhookUrl;
          }
        }
      } catch (settingsError) {
        console.warn('Could not read GHL settings, will skip GHL fetch or use env:', settingsError);
      }

      // 3. Post to GHL if we have a URL
      if (ghlWebhookUrl) {
        const webhookPayload = {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          projectAddress: data.address,
          fenceType: data.fenceType,
          estimateTotal: Math.round(breakdown.total * 100) / 100,
          estimateDetails: JSON.stringify({
            data,
            breakdown
          }),
          source: 'website-estimator-tool',
          tags: ['Customer Estimate', 'New Lead']
        };

        const response = await fetch(ghlWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookPayload)
        });

        if (response.ok) {
          setGhlSynced(true);
        } else {
          console.warn('GHL CRM webhook returned an error:', response.status);
        }
      }

      setSubmitSuccess(true);
      setStep(6);
    } catch (saveError) {
      console.error('Failed to submit estimate', saveError);
      setError('Failed to submit your estimate. Please check your network and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [data, breakdown]);

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
