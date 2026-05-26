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
import Scheduler from './components/Scheduler';
import Financials from './components/Financials';
import EmployeePortal from './components/EmployeePortal';
import ManageEmployees from './components/ManageEmployees';
import CustomerEstimator from './components/CustomerEstimator/CustomerEstimator';
import { MATERIALS, DEFAULT_LABOR_RATES, FENCE_STYLES, DEFAULT_ESTIMATE } from './constants';
import { MaterialItem, LaborRates, Estimate, SupplierQuote, SavedEstimate } from './types';
import { auth, onAuthStateChanged, signInWithPopup, googleProvider, signOut, testConnection } from './lib/firebase';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './lib/firebase';
import { collection, query, where, onSnapshot, doc, writeBatch, getDocs, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { getCanonicalSupplierName } from './lib/utils';


// Helper to get state from Hash or LocalStorage
function getInitialValue(key: string, storageKey: string, defaultValue: any) {
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
}

export default function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [savedEstimates, setSavedEstimates] = React.useState<SavedEstimate[]>([]);

  const [activeTab, setActiveTab] = React.useState(() => {
    return getInitialValue('activeTab', 'fence_pro_active_tab', 'estimator');
  });
  
  const [materials, setMaterials] = React.useState<MaterialItem[]>(() => {
    return getInitialValue('materials', 'fence_pro_materials', MATERIALS);
  });

  const [quotes, setQuotes] = React.useState<SupplierQuote[]>(() => {
    const raw = getInitialValue('quotes', 'fence_pro_quotes', []);
    return raw.map((q: any) => ({
      ...q,
      supplierName: getCanonicalSupplierName(q.supplierName || '')
    }));
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
  
  // Robustly extract the portal mode from URL query parameters or hash segments
  const getPortalParam = () => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.has('portal')) {
        return searchParams.get('portal')?.toLowerCase();
      }
      
      // Secondary check for cases where routers or iframes bundle search params into hash block
      const hash = window.location.hash;
      const qIndex = hash.indexOf('?');
      if (qIndex !== -1) {
        const hashParams = new URLSearchParams(hash.substring(qIndex));
        if (hashParams.has('portal')) {
          return hashParams.get('portal')?.toLowerCase();
        }
      }
      if (hash.includes('portal=')) {
        const part = hash.substring(hash.indexOf('portal=') + 7);
        const ampersand = part.indexOf('&');
        return ampersand !== -1 ? part.substring(0, ampersand).toLowerCase() : part.toLowerCase();
      }
    } catch (e) {
      console.warn('Failed to parse portal query param:', e);
    }
    return null;
  };

  const portalParam = getPortalParam();
  const isEmployeeView = portalParam === 'employee' || portalParam === 'scheduler';
  const isCustomerPortal = portalParam === 'customer';
  
  const [aiContractScope, setAiContractScope] = React.useState<string | null>(() => {
    return getInitialValue('aiContractScope', 'fence_pro_customer_contract_ai_scope', null);
  });

  const [aiProjectScope, setAiProjectScope] = React.useState<string | null>(() => {
    return getInitialValue('aiProjectScope', 'fence_pro_ai_scope', null);
  });

  React.useEffect(() => {
    testConnection();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // Fetch estimates from Firestore if user is logged in, and merge with local ledger backup
  React.useEffect(() => {
    let unsubCloud: () => void = () => {};

    const syncEstimates = () => {
      let localEstimates: SavedEstimate[] = [];
      try {
        const localLedgerStr = localStorage.getItem('customer_estimator_local_ledger');
        if (localLedgerStr) {
          localEstimates = JSON.parse(localLedgerStr);
        }
      } catch (e) {
        console.error('Failed to load local ledger estimates:', e);
      }

      if (!user) {
        setSavedEstimates(localEstimates);
        return () => {};
      }

      const q = query(collection(db, 'estimates'), where('companyId', '==', 'lonestarfence'));
      const unsubscribe = onSnapshot(q, 
        (snapshot) => {
          const cloudEstimates = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as SavedEstimate));
          // Merge cloud with unique local estimates
          const cloudIds = new Set(cloudEstimates.map(e => e.id));
          const uniqueLocal = localEstimates.filter(e => !cloudIds.has(e.id));
          setSavedEstimates([...cloudEstimates, ...uniqueLocal]);
        },
        (error) => {
          console.error('Error listening to cloud estimates, falling back to local registry:', error);
          setSavedEstimates(localEstimates);
        }
      );
      return unsubscribe;
    };

    unsubCloud = syncEstimates();

    // Re-check anytime a new customer estimate is submitted
    const handleLocalSubmitted = () => {
      // Re-run syncing to grab latest items from localStorage
      const unsubNew = syncEstimates();
      // Update original unsubscribe reference
      const prevUnsubVal = unsubCloud;
      unsubCloud = () => {
        prevUnsubVal();
        unsubNew();
      };
    };
    window.addEventListener('customer_estimator_estimate_submitted', handleLocalSubmitted);

    return () => {
      if (unsubCloud) unsubCloud();
      window.removeEventListener('customer_estimator_estimate_submitted', handleLocalSubmitted);
    };
  }, [user]);

  // Fetch materials from Firestore if user is logged in OR if unauthenticated customer portal is loaded
  React.useEffect(() => {
    // If not logged in and not customer portal, set initial/offline materials
    if (!user && !isCustomerPortal) {
      setMaterials(MATERIALS);
      return;
    }

    const q = query(collection(db, 'materials'), where('companyId', '==', 'lonestarfence'));
    
    // Seed and sync ONLY if an administrative user is actively logged in
    if (user) {
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
    }

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const fetched = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as MaterialItem));
        if (fetched.length > 0) {
          setMaterials(fetched);
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'materials')
    );
    return () => unsubscribe();
  }, [user, isCustomerPortal]);

  // Fetch global company settings on mount/initially (especially for unauthenticated customer portal)
  React.useEffect(() => {
    const fetchGlobalSettings = async () => {
      try {
        const docRef = doc(db, 'companySettings', 'main');
        const dSnap = await getDoc(docRef);
        if (dSnap.exists()) {
          const sData = dSnap.data();
          if (sData.laborRates) {
            setLaborRates(sData.laborRates);
          }
          if (sData.estimatorSettings) {
            setEstimate(prev => ({
              ...prev,
              ...sData.estimatorSettings
            }));
          }
        }
      } catch (err) {
        console.warn('Failed to load global settings from Firestore:', err);
      }
    };

    fetchGlobalSettings();
  }, [user]);

  // Global Sync of laborRates and estimatorSettings back to Firestore (Only for authenticated company members)
  React.useEffect(() => {
    if (!user) return;

    const syncSettingsToCloud = async () => {
      try {
        const docRef = doc(db, 'companySettings', 'main');
        // Extract only the estimator configuration defaults to prevent overwriting other customer/active estimate details
        const estimatorSettings = {
          markupPercentage: estimate.markupPercentage !== undefined ? estimate.markupPercentage : 20,
          wastePercentage: estimate.wastePercentage !== undefined ? estimate.wastePercentage : 0,
          taxPercentage: estimate.taxPercentage !== undefined ? estimate.taxPercentage : 8.25,
          concreteType: estimate.concreteType || 'Maximizer',
          footingType: estimate.footingType || 'Cuboid',
          postWidth: estimate.postWidth !== undefined ? estimate.postWidth : 6,
          postThickness: estimate.postThickness !== undefined ? estimate.postThickness : 6,
        };

        await setDoc(docRef, {
          laborRates,
          estimatorSettings,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (syncErr) {
        console.error('Failed to sync updated pricing defaults to cloud:', syncErr);
      }
    };

    // Debounce the cloud write slightly to handle rapid UI edits
    const timer = setTimeout(() => {
      syncSettingsToCloud();
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    laborRates, 
    estimate.markupPercentage, 
    estimate.wastePercentage, 
    estimate.taxPercentage, 
    estimate.concreteType, 
    estimate.footingType, 
    estimate.postWidth, 
    estimate.postThickness, 
    user
  ]);

  // Fetch quotes from Firestore if user is logged in
  React.useEffect(() => {
    if (!user) {
      const raw = getInitialValue('quotes', 'fence_pro_quotes', []);
      setQuotes(raw.map((q: any) => ({
        ...q,
        supplierName: getCanonicalSupplierName(q.supplierName || '')
      })));
      return;
    }

    const q = query(collection(db, 'quotes'), where('companyId', '==', 'lonestarfence'));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setQuotes(snapshot.docs.map(d => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            supplierName: getCanonicalSupplierName(data.supplierName || '')
          } as SupplierQuote;
        }));
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

  // Load scopes from estimate when it changes
  React.useEffect(() => {
    if (estimate.contractScope) {
      setAiContractScope(estimate.contractScope);
    }
    if (estimate.laborScope) {
      setAiProjectScope(estimate.laborScope);
    }
  }, [estimate.id]);

  // Global Sync to localStorage
  React.useEffect(() => {
    localStorage.setItem('fence_pro_estimate', JSON.stringify(estimate));
    localStorage.setItem('fence_pro_labor_rates', JSON.stringify(laborRates));
    localStorage.setItem('fence_pro_active_tab', JSON.stringify(activeTab));
    localStorage.setItem('fence_pro_quotes', JSON.stringify(quotes));
    localStorage.setItem('fence_pro_materials', JSON.stringify(materials));
    localStorage.setItem('fence_pro_ai_scope', JSON.stringify(aiProjectScope));
    localStorage.setItem('fence_pro_customer_contract_ai_scope', JSON.stringify(aiContractScope));
  }, [estimate, materials, laborRates, activeTab, quotes, aiProjectScope, aiContractScope, user]);

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
          case 'fence_pro_customer_contract_ai_scope': setAiContractScope(parsed); break;
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

  const handleUpdateEstimate = async (update: Partial<Estimate>) => {
    setEstimate(prev => ({ ...prev, ...update }));
    
    // If the estimate has an ID and the user is logged in, sync the specific update to Firestore
    if (estimate.id && user) {
      try {
        const docRef = doc(db, 'estimates', estimate.id);
        const updateWithTimestamp = {
          ...update,
          lastModified: new Date().toISOString()
        };
        // Clean undefined values
        Object.keys(updateWithTimestamp).forEach(key => {
          if ((updateWithTimestamp as any)[key] === undefined) {
            delete (updateWithTimestamp as any)[key];
          }
        });
        await updateDoc(docRef, updateWithTimestamp);
      } catch (error) {
        console.error('Failed to auto-sync estimate update:', error);
      }
    }
  };

  if (isEmployeeView) {
    return <EmployeePortal />;
  }

  if (isCustomerPortal) {
    return <CustomerEstimator standalone={true} materials={materials} laborRates={laborRates} estimate={estimate} />;
  }

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      user={user} 
      onLogin={handleLogin} 
      onLogout={handleLogout}
    >
      {activeTab === 'customer-estimator' && (
        <CustomerEstimator materials={materials} laborRates={laborRates} estimate={estimate} />
      )}
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
      {activeTab === 'scheduler' && (
        <Scheduler 
          savedEstimates={savedEstimates} 
          user={user}
        />
      )}
      {activeTab === 'dossiers' && (
        <SavedEstimates 
          savedEstimates={savedEstimates} 
          setSavedEstimates={setSavedEstimates}
          onLoadEstimate={handleLoadEstimate}
          setActiveTab={setActiveTab}
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
          setEstimate={handleUpdateEstimate}
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
          onUpdateEstimate={handleUpdateEstimate}
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
          onUpdateEstimate={handleUpdateEstimate}
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
      {activeTab === 'employees' && <ManageEmployees />}
    </Layout>
  );
}

