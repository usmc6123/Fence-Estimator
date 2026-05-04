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
import CustomerContract from './components/CustomerContract';
import SupplierOrderForm from './components/SupplierOrderForm';
import QuoteManager from './components/QuoteManager';
import Settings from './components/Settings';
import SavedEstimates from './components/SavedEstimates';
import Financials from './components/Financials';
import { MATERIALS, DEFAULT_LABOR_RATES, FENCE_STYLES, DEFAULT_ESTIMATE } from './constants';
import { MaterialItem, LaborRates, Estimate, SupplierQuote, SavedEstimate } from './types';
import { auth, onAuthStateChanged, signInWithPopup, googleProvider, signOut, testConnection } from './lib/firebase';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './lib/firebase';
import { collection, query, where, onSnapshot, doc, writeBatch, getDocs } from 'firebase/firestore';

export default function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [savedEstimates, setSavedEstimates] = React.useState<SavedEstimate[]>([]);
  const [aiContractScope, setAiContractScope] = React.useState<string | null>(() => {
    const saved = localStorage.getItem('fence_pro_customer_contract_ai_scope');
    return saved ? JSON.parse(saved) : null;
  });

  React.useEffect(() => {
    testConnection();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // Fetch estimates from Firestore if user is logged in
  React.useEffect(() => {
    if (!user) {
      setSavedEstimates([]);
      return;
    }

    const q = query(collection(db, 'estimates'), where('companyId', '==', 'lonestarfence'));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setSavedEstimates(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as SavedEstimate)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'estimates')
    );
    return () => unsubscribe();
  }, [user]);

  // Fetch materials from Firestore if user is logged in
  React.useEffect(() => {
    if (!user) {
      setMaterials(MATERIALS);
      return;
    }

    const q = query(collection(db, 'materials'), where('companyId', '==', 'lonestarfence'));
    
    // Check if we need to seed or sync missing items
    const checkAndSync = async () => {
      try {
        const snapshot = await getDocs(q);
        const existingMaterials = snapshot.docs.map(d => d.data() as MaterialItem);
        const existingIds = new Set(existingMaterials.map(m => m.id));
        
        const missingItems = MATERIALS.filter(mat => !existingIds.has(mat.id));
        
        if (missingItems.length > 0) {
          console.log(`Syncing ${missingItems.length} missing materials to Firestore...`);
          const batch = writeBatch(db);
          missingItems.forEach((mat) => {
            const docRef = doc(db, 'materials', mat.id);
            batch.set(docRef, { ...mat, companyId: 'lonestarfence' });
          });
          await batch.commit();
          console.log('Sync complete.');
        }
      } catch (error) {
        console.error('Material sync failed:', error);
      }
    };

    checkAndSync();

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setMaterials(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as MaterialItem)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'materials')
    );
    return () => unsubscribe();
  }, [user]);

  // Fetch quotes from Firestore if user is logged in
  React.useEffect(() => {
    if (!user) {
      setQuotes(getInitialValue('quotes', 'fence_pro_quotes', []));
      return;
    }

    const q = query(collection(db, 'quotes'), where('companyId', '==', 'lonestarfence'));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setQuotes(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as SupplierQuote)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'quotes')
    );
    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };
  // Helper to get state from Hash or LocalStorage
  const getInitialValue = (key: string, storageKey: string, defaultValue: any) => {
    // 1. Try URL Hash (highest priority for new window bridging)
    const hash = window.location.hash;
    if (hash.startsWith('#state=')) {
      try {
        const decoded = JSON.parse(decodeURIComponent(hash.substring(7)));
        if (decoded && typeof decoded === 'object' && key in decoded) {
          const val = decoded[key];
          // If we found a valid non-null value in hash, return it immediately
          if (val !== undefined && val !== null) return val;
        }
      } catch (e) {
        console.warn(`Failed to parse hash state for key "${key}":`, e);
      }
    }

    // 2. Try LocalStorage (session persistence)
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && saved !== 'undefined' && saved !== 'null') {
        try {
          return JSON.parse(saved);
        } catch (e) {
          // Fallback for non-JSON strings
          return saved;
        }
      }
    } catch (e) {
      console.warn(`Failed to parse localStorage for key "${storageKey}":`, e);
    }
    
    return defaultValue;
  };

  const [activeTab, setActiveTab] = React.useState(() => {
    return getInitialValue('activeTab', 'fence_pro_active_tab', 'estimator');
  });
  
  const [materials, setMaterials] = React.useState<MaterialItem[]>(() => {
    return getInitialValue('materials', 'fence_pro_materials', MATERIALS);
  });

  const [quotes, setQuotes] = React.useState<SupplierQuote[]>(() => {
    return getInitialValue('quotes', 'fence_pro_quotes', []);
  });

  const [aiProjectScope, setAiProjectScope] = React.useState<string | null>(() => {
    return getInitialValue('aiProjectScope', 'fence_pro_ai_scope', null);
  });

  const [laborRates, setLaborRates] = React.useState<LaborRates>(() => {
    return getInitialValue('laborRates', 'fence_pro_labor_rates', DEFAULT_LABOR_RATES);
  });

  const [estimate, setEstimate] = React.useState<Partial<Estimate>>(() => {
    const initial = getInitialValue('estimate', 'fence_pro_estimate', DEFAULT_ESTIMATE);
    const hasNoCustomer = !initial.customerName && !initial.customerAddress;
    
    if (hasNoCustomer) {
      let migrated = { ...initial };
      let changed = false;

      if (initial.markupPercentage === 30) {
        migrated.markupPercentage = 20;
        changed = true;
      }
      if (initial.wastePercentage === 10) {
        migrated.wastePercentage = 0;
        changed = true;
      }

      if (changed) return migrated;
    }
    return initial;
  });

  // Global Sync to localStorage
  React.useEffect(() => {
    localStorage.setItem('fence_pro_estimate', JSON.stringify(estimate));
    localStorage.setItem('fence_pro_labor_rates', JSON.stringify(laborRates));
    localStorage.setItem('fence_pro_active_tab', JSON.stringify(activeTab));
    if (!user) {
      localStorage.setItem('fence_pro_quotes', JSON.stringify(quotes));
      localStorage.setItem('fence_pro_materials', JSON.stringify(materials));
    }
    localStorage.setItem('fence_pro_ai_scope', JSON.stringify(aiProjectScope));
  }, [estimate, materials, laborRates, activeTab, quotes, aiProjectScope, user]);

  // Sync state across tabs using the storage event (enables simultaneous updates)
  React.useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (!e.newValue || e.newValue === 'undefined' || e.newValue === 'null') return;
      
      try {
        const parsed = JSON.parse(e.newValue);
        switch (e.key) {
          case 'fence_pro_estimate': setEstimate(parsed); break;
          case 'fence_pro_materials': setMaterials(parsed); break;
          case 'fence_pro_labor_rates': setLaborRates(parsed); break;
          case 'fence_pro_quotes': setQuotes(parsed); break;
          case 'fence_pro_ai_scope': setAiProjectScope(parsed); break;
          // Note: Avoid syncing activeTab across windows as they should be independent
        }
      } catch (err) {
        console.error('Failed to sync storage change:', err);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Structural sync for existing items if they differ from constants in key ways
  React.useEffect(() => {
    let changed = false;
    
    // 1. Deduplicate by ID to fix potential runtime errors from old dual-p-paint-gal state
    const uniqueMaterials: MaterialItem[] = [];
    const seenIds = new Set();
    materials.forEach(m => {
      if (!seenIds.has(m.id)) {
        uniqueMaterials.push(m);
        seenIds.add(m.id);
      } else {
        changed = true;
      }
    });

    // 2. Update existing items if names/units/descriptions changed in constants
    let syncedMaterials = uniqueMaterials.map(m => {
      const base = MATERIALS.find(bm => bm.id === m.id);
      if (base) {
        const needsSync = base.name !== m.name || base.unit !== m.unit || base.description !== m.description;
        if (needsSync) {
          changed = true;
          return { ...m, name: base.name, unit: base.unit, description: base.description };
        }
      }
      return m;
    });

    // Add missing default items that are in MATERIALS but not in the user's list
    const missingItems = MATERIALS.filter(bm => !syncedMaterials.find(m => m.id === bm.id));
    if (missingItems.length > 0) {
      syncedMaterials = [...syncedMaterials, ...missingItems];
      changed = true;
    }

    if (changed) {
      setMaterials(syncedMaterials);
    }
  }, []);

  const handleLoadEstimate = (est: SavedEstimate) => {
    setEstimate(est);
    setActiveTab('estimator');
  };

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      user={user} 
      onLogin={handleLogin} 
      onLogout={handleLogout}
    >
      {activeTab === 'estimator' && (
        <Estimator 
          materials={materials} 
          laborRates={laborRates} 
          estimate={estimate} 
          quotes={quotes}
          setEstimate={setEstimate}
          savedEstimates={savedEstimates}
          setSavedEstimates={setSavedEstimates}
          user={user}
          setActiveTab={setActiveTab}
        />
      )}
      {activeTab === 'dossiers' && (
        <SavedEstimates 
          savedEstimates={savedEstimates} 
          setSavedEstimates={setSavedEstimates}
          onLoadEstimate={handleLoadEstimate}
          user={user}
        />
      )}
      {activeTab === 'financials' && (
        <Financials savedEstimates={savedEstimates} user={user} />
      )}
      {activeTab === 'library' && (
        <MaterialLibrary materials={materials} setMaterials={setMaterials} user={user} />
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
          user={user}
        />
      )}
      {activeTab === 'labor-breakdown' && (
        <LaborTakeOff 
          estimate={estimate} 
          materials={materials} 
          laborRates={laborRates} 
          quotes={quotes}
          aiProjectScope={aiProjectScope}
          setAiProjectScope={setAiProjectScope}
        />
      )}
      {activeTab === 'customer-contract' && (
        <CustomerContract 
          estimate={estimate} 
          materials={materials} 
          laborRates={laborRates}
          quotes={quotes}
          aiContractScope={aiContractScope}
          setAiContractScope={setAiContractScope}
          onUpdateEstimate={(update) => setEstimate(prev => ({ ...prev, ...update }))}
        />
      )}
      {activeTab === 'supplier-order' && (
        <SupplierOrderForm estimate={estimate} materials={materials} laborRates={laborRates} />
      )}
      {activeTab === 'quotes' && (
        <QuoteManager 
          materials={materials} 
          setMaterials={setMaterials} 
          quotes={quotes} 
          setQuotes={setQuotes} 
          user={user}
        />
      )}
      {activeTab === 'settings' && <Settings />}
    </Layout>
  );
}

