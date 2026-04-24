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
  const [materials, setMaterials] = React.useState<MaterialItem[]>(MATERIALS);
  const [quotes, setQuotes] = React.useState<SupplierQuote[]>([]);
  const [laborRates, setLaborRates] = React.useState<LaborRates>(DEFAULT_LABOR_RATES);
  const [estimate, setEstimate] = React.useState<Partial<Estimate>>({
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
  });

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

