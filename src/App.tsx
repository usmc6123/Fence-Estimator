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
  // Helper to get state from Hash or LocalStorage
  const getInitialValue = (key: string, storageKey: string, defaultValue: any) => {
    const hash = window.location.hash;
    if (hash.startsWith('#state=')) {
      try {
        const decoded = JSON.parse(decodeURIComponent(hash.substring(7)));
        if (decoded[key] !== undefined) return decoded[key];
      } catch (e) {
        console.error('Error parsing hash state:', e);
      }
    }
    const saved = localStorage.getItem(storageKey);
    if (!saved) return defaultValue;
    try {
      return JSON.parse(saved);
    } catch {
      return defaultValue;
    }
  };

  const [activeTab, setActiveTab] = React.useState(() => {
    return getInitialValue('activeTab', 'fence_pro_active_tab', 'estimator');
  });
  
  const [savedEstimates, setSavedEstimates] = React.useState<SavedEstimate[]>(() => {
    return getInitialValue('savedEstimates', 'fence_pro_saved_estimates', []);
  });

  const [materials, setMaterials] = React.useState<MaterialItem[]>(() => {
    const fromStorage = getInitialValue('materials', 'fence_pro_materials', MATERIALS);
    // Sync logic already exists below or can be integrated
    return fromStorage;
  });

  const [quotes, setQuotes] = React.useState<SupplierQuote[]>(() => {
    return getInitialValue('quotes', 'fence_pro_quotes', []);
  });

  const [laborRates, setLaborRates] = React.useState<LaborRates>(() => {
    return getInitialValue('laborRates', 'fence_pro_labor_rates', DEFAULT_LABOR_RATES);
  });

  const [estimate, setEstimate] = React.useState<Partial<Estimate>>(() => {
    const defaultEst = {
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
    return getInitialValue('estimate', 'fence_pro_estimate', defaultEst);
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

  React.useEffect(() => {
    localStorage.setItem('fence_pro_active_tab', activeTab);
  }, [activeTab]);

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
        <MaterialTakeOff 
          estimate={estimate} 
          materials={materials} 
          laborRates={laborRates}
          quotes={quotes}
          setEstimate={setEstimate}
          setMaterials={setMaterials}
        />
      )}
      {activeTab === 'labor-takeoff' && (
        <LaborTakeOff estimate={estimate} materials={materials} laborRates={laborRates} quotes={quotes} />
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

