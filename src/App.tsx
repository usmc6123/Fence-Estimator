/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Layout from './components/Layout';
import Estimator from './components/Estimator';
import MaterialLibrary from './components/MaterialLibrary';
import LaborPricing from './components/LaborPricing';
import Settings from './components/Settings';
import { MATERIALS, DEFAULT_LABOR_RATES } from './constants';
import { MaterialItem, LaborRates } from './types';

export default function App() {
  const [activeTab, setActiveTab] = React.useState('estimator');
  const [materials, setMaterials] = React.useState<MaterialItem[]>(MATERIALS);
  const [laborRates, setLaborRates] = React.useState<LaborRates>(DEFAULT_LABOR_RATES);

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'estimator' && <Estimator materials={materials} laborRates={laborRates} />}
      {activeTab === 'library' && <MaterialLibrary materials={materials} setMaterials={setMaterials} />}
      {activeTab === 'labor' && <LaborPricing laborRates={laborRates} setLaborRates={setLaborRates} />}
      {activeTab === 'settings' && <Settings />}
    </Layout>
  );
}

