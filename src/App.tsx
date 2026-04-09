/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Layout from './components/Layout';
import Estimator from './components/Estimator';
import MaterialLibrary from './components/MaterialLibrary';
import Settings from './components/Settings';
import { MATERIALS } from './constants';
import { MaterialItem } from './types';

export default function App() {
  const [activeTab, setActiveTab] = React.useState('estimator');
  const [materials, setMaterials] = React.useState<MaterialItem[]>(MATERIALS);

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'estimator' && <Estimator materials={materials} />}
      {activeTab === 'library' && <MaterialLibrary materials={materials} setMaterials={setMaterials} />}
      {activeTab === 'settings' && <Settings />}
    </Layout>
  );
}

