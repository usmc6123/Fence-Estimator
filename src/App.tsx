/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Layout from './components/Layout';
import Estimator from './components/Estimator';
import MaterialLibrary from './components/MaterialLibrary';
import LaborPricing from './components/LaborPricing';
import MaterialTakeOff from './components/MaterialTakeOff';
import QuoteManager from './components/QuoteManager';
import Settings from './components/Settings';
import { MATERIALS, DEFAULT_LABOR_RATES, FENCE_STYLES } from './constants';
import { MaterialItem, LaborRates, Estimate, SupplierQuote } from './types';

export default function App() {
  const [activeTab, setActiveTab] = React.useState('estimator');
  // Persistence Logic
  const [materials, setMaterials] = React.useState<MaterialItem[]>(() => {
    try {
      const saved = localStorage.getItem('fence_pro_materials');
      if (saved) {
        const parsed = JSON.parse(saved) as MaterialItem[];
        // Merge with current hardcoded constants to ensure new items appear
        const merged = [...parsed];
        MATERIALS.forEach(baseMat => {
          if (!merged.find(m => m.id === baseMat.id)) {
            merged.push(baseMat);
          }
        });
        return merged;
      }
      return MATERIALS;
    } catch (e) {
      console.error('Error loading materials:', e);
      return MATERIALS;
    }
  });

  const [quotes, setQuotes] = React.useState<SupplierQuote[]>(() => {
    try {
      const saved = localStorage.getItem('fence_pro_quotes');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Error loading quotes:', e);
      return [];
    }
  });

  const [laborRates, setLaborRates] = React.useState<LaborRates>(() => {
    try {
      const saved = localStorage.getItem('fence_pro_labor_rates');
      return saved ? JSON.parse(saved) : DEFAULT_LABOR_RATES;
    } catch (e) {
      console.error('Error loading labor rates:', e);
      return DEFAULT_LABOR_RATES;
    }
  });

  const [estimate, setEstimate] = React.useState<Partial<Estimate>>(() => {
    try {
      const saved = localStorage.getItem('fence_pro_estimate');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading estimate:', e);
    }
    return {
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      customerAddress: '',
      linearFeet: 100,
      corners: 2,
      height: 6,
      width: 8,
      runs: [],
      defaultStyleId: FENCE_STYLES[0].id,
      defaultVisualStyleId: FENCE_STYLES[0].visualStyles[0].id,
      defaultHeight: 6,
      defaultColor: 'Natural',
      postCapId: MATERIALS.find(m => m.category === 'PostCap')?.id || '',
      hasCapAndTrim: false,
      gateCount: 1,
      gateStyleId: MATERIALS.find(m => m.category === 'Gate')?.id || '',
      footingType: 'Cuboid',
      concreteType: 'Maximizer',
      postWidth: 6,
      postThickness: 6,
      hasDemolition: false,
      demoLinearFeet: 100,
      demoType: 'Wood',
      removeConcreteFootings: true,
      hasSitePrep: false,
      needsClearing: false,
      needsMarking: true,
      obstacleRemoval: false,
      wastePercentage: 10,
      includeGravel: true,
      includeStain: false,
      markupPercentage: 30,
      taxPercentage: 8.25,
      manualQuantities: {},
      manualPrices: {},
      woodType: 'PT Pine',
      ironRails: '2 rail',
      ironTop: 'Flat top',
      topStyle: 'Dog Ear',
      isPreStained: false,
    };
  });

  // Save to localStorage on changes
  React.useEffect(() => {
    localStorage.setItem('fence_pro_materials', JSON.stringify(materials));
  }, [materials]);

  React.useEffect(() => {
    localStorage.setItem('fence_pro_quotes', JSON.stringify(quotes));
  }, [quotes]);

  React.useEffect(() => {
    localStorage.setItem('fence_pro_labor_rates', JSON.stringify(laborRates));
  }, [laborRates]);

  React.useEffect(() => {
    localStorage.setItem('fence_pro_estimate', JSON.stringify(estimate));
  }, [estimate]);

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'estimator' && (
        <Estimator 
          materials={materials} 
          laborRates={laborRates} 
          estimate={estimate} 
          setEstimate={setEstimate} 
        />
      )}
      {activeTab === 'library' && (
        <MaterialLibrary materials={materials} setMaterials={setMaterials} />
      )}
      {activeTab === 'labor' && (
        <LaborPricing laborRates={laborRates} setLaborRates={setLaborRates} />
      )}
      {activeTab === 'takeoff' && (
        <MaterialTakeOff estimate={estimate} materials={materials} laborRates={laborRates} />
      )}
      {activeTab === 'quotes' && (
        <QuoteManager 
          materials={materials} 
          setMaterials={setMaterials} 
          quotes={quotes} 
          setQuotes={setQuotes} 
        />
      )}
      {activeTab === 'settings' && <Settings />}
    </Layout>
  );
}

