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
import LaborTakeOff from './components/LaborTakeOff';
import QuoteManager from './components/QuoteManager';
import Settings from './components/Settings';
import SavedEstimates from './components/SavedEstimates';
import { MATERIALS, DEFAULT_LABOR_RATES, FENCE_STYLES } from './constants';
import { MaterialItem, LaborRates, Estimate, SupplierQuote, SavedEstimate } from './types';

export default function App() {
  const [activeTab, setActiveTab] = React.useState('estimator');
  
  const [savedEstimates, setSavedEstimates] = React.useState<SavedEstimate[]>(() => {
    try {
      const saved = localStorage.getItem('fence_pro_saved_estimates');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Error loading saved estimates:', e);
      return [];
    }
  });

  // Persistence Logic
  const [materials, setMaterials] = React.useState<MaterialItem[]>(() => {
    try {
      const saved = localStorage.getItem('fence_pro_materials');
      if (saved) {
        const parsed = JSON.parse(saved) as MaterialItem[];
        // Merge with current hardcoded constants
        const merged = [...parsed];
        MATERIALS.forEach(baseMat => {
          const existingIdx = merged.findIndex(m => m.id === baseMat.id);
          if (existingIdx === -1) {
            merged.push(baseMat);
          } else {
            // Force update if the base unit or description changed in constants
            // This ensures transitions like "box" -> "each" for nails propagate
            if (merged[existingIdx].unit !== baseMat.unit) {
              merged[existingIdx] = { 
                ...merged[existingIdx], 
                unit: baseMat.unit, 
                cost: baseMat.cost,
                description: baseMat.description,
                name: baseMat.name
              };
            }
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

  React.useEffect(() => {
    localStorage.setItem('fence_pro_materials', JSON.stringify(materials));
  }, [materials]);

  // Structural sync for existing items if they differ from constants in key ways
  React.useEffect(() => {
    let changed = false;
    const syncedMaterials = materials.map(m => {
      const base = MATERIALS.find(bm => bm.id === m.id);
      if (base && base.unit !== m.unit) {
        changed = true;
        return { ...m, unit: base.unit, cost: base.cost, description: base.description, name: base.name };
      }
      return m;
    });
    if (changed) {
      setMaterials(syncedMaterials);
    }
  }, []);

  React.useEffect(() => {
    localStorage.setItem('fence_pro_quotes', JSON.stringify(quotes));
  }, [quotes]);

  React.useEffect(() => {
    localStorage.setItem('fence_pro_labor_rates', JSON.stringify(laborRates));
  }, [laborRates]);

  React.useEffect(() => {
    localStorage.setItem('fence_pro_estimate', JSON.stringify(estimate));
  }, [estimate]);

  React.useEffect(() => {
    localStorage.setItem('fence_pro_saved_estimates', JSON.stringify(savedEstimates));
  }, [savedEstimates]);

  const handleLoadEstimate = (est: SavedEstimate) => {
    setEstimate(est);
    setActiveTab('estimator');
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'estimator' && (
        <Estimator 
          materials={materials} 
          laborRates={laborRates} 
          estimate={estimate} 
          setEstimate={setEstimate}
          savedEstimates={savedEstimates}
          setSavedEstimates={setSavedEstimates}
        />
      )}
      {activeTab === 'dossiers' && (
        <SavedEstimates 
          savedEstimates={savedEstimates} 
          setSavedEstimates={setSavedEstimates}
          onLoadEstimate={handleLoadEstimate}
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
      {activeTab === 'labor-takeoff' && (
        <LaborTakeOff estimate={estimate} materials={materials} laborRates={laborRates} />
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

