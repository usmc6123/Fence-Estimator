/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Layout from './components/Layout';
import Estimator from './components/Estimator';
import MaterialLibrary from './components/MaterialLibrary';
import Settings from './components/Settings';

export default function App() {
  const [activeTab, setActiveTab] = React.useState('estimator');

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'estimator' && <Estimator />}
      {activeTab === 'library' && <MaterialLibrary />}
      {activeTab === 'settings' && <Settings />}
    </Layout>
  );
}

