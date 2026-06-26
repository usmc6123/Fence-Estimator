/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import Layout from './components/Layout';
import { AuthPage, PricingPage, SubscriptionDashboard, PricingPlansAndBilling } from './components/SubscriptionSystem';
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
import CustomerSignaturePortal from './components/CustomerSignaturePortal';
import CrewSchedulePortal from './components/CrewSchedulePortal';
import JobPortal from './components/JobPortal';
import { MATERIALS, DEFAULT_LABOR_RATES, FENCE_STYLES, DEFAULT_ESTIMATE, COMPANY_INFO } from './constants';
import { MaterialItem, LaborRates, Estimate, SupplierQuote, SavedEstimate, User } from './types';
import { testConnection, setGlobalUserId, getEstimatesCollection, getEstimateDoc } from './lib/firebase';
import { db, handleFirestoreError, OperationType } from './lib/firebase';
import AdminConsole from './pages/admin-console';
import { collection, query, where, onSnapshot, doc, writeBatch, getDocs, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { getCanonicalSupplierName, assignEstimateNumbers } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';


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
  const [localUser, setLocalUser] = React.useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('company_local_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const user = localUser;

  // Routing current path state
  const [currentPath, setCurrentPath] = React.useState(() => window.location.pathname);
  
  // Real-time verified role states
  const [isCompanyUser, setIsCompanyUser] = React.useState(false);
  const [roleChecked, setRoleChecked] = React.useState(false);
  
  // Admin Authorization Session State
  const [adminToken, setAdminToken] = React.useState<string | null>(() => {
    return localStorage.getItem('company_admin_token');
  });
  const [isAdminVerifying, setIsAdminVerifying] = React.useState(!!localStorage.getItem('company_admin_token'));

  // Sync adminToken with currentUser token for admins
  React.useEffect(() => {
    if (user?.isAdmin && user?.token && adminToken !== user.token) {
      setAdminToken(user.token);
      localStorage.setItem('company_admin_token', user.token);
    }
  }, [user, adminToken]);

  // Verify and refresh the admin token on application boot
  React.useEffect(() => {
    const verifyToken = async () => {
      const storedToken = localStorage.getItem('company_admin_token');
      if (!storedToken || storedToken === 'null' || storedToken === 'undefined') {
        setIsAdminVerifying(false);
        setAdminToken(null);
        localStorage.removeItem('company_admin_token');
        return;
      }
      try {
        const response = await fetch('/api/admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${storedToken}`
          },
          body: JSON.stringify({ action: 'verify-credentials' })
        });
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.token) {
            setAdminToken(data.token);
            localStorage.setItem('company_admin_token', data.token);
          } else {
            setAdminToken(null);
            localStorage.removeItem('company_admin_token');
          }
        } else {
          setAdminToken(null);
          localStorage.removeItem('company_admin_token');
        }
      } catch (err) {
        console.error('Failed to verify stored admin token during boot:', err);
      } finally {
        setIsAdminVerifying(false);
      }
    };

    verifyToken();
  }, []);

  // Track path history pushstate popstate
  React.useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    
    window.history.pushState = function(...args) {
      originalPushState.apply(this, args);
      const url = args[2];
      if (url) {
        const urlStr = typeof url === 'string' ? url : url.toString();
        let path = urlStr.split('?')[0].split('#')[0];
        if (path.startsWith('http://') || path.startsWith('https://')) {
          try {
            path = new URL(path).pathname;
          } catch (e) {}
        }
        setCurrentPath(path);
      } else {
        handleLocationChange();
      }
    };
    window.history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      const url = args[2];
      if (url) {
        const urlStr = typeof url === 'string' ? url : url.toString();
        let path = urlStr.split('?')[0].split('#')[0];
        if (path.startsWith('http://') || path.startsWith('https://')) {
          try {
            path = new URL(path).pathname;
          } catch (e) {}
        }
        setCurrentPath(path);
      } else {
        handleLocationChange();
      }
    };
    
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  // Update transparent client-use path translation with global currentUserId
  React.useEffect(() => {
    if (!user) {
      setGlobalUserId(null, false);
      setIsCompanyUser(false);
      setRoleChecked(true);
      return;
    }

    setRoleChecked(false);
    let active = true;

    const checkRoleAndSet = async () => {
      let isCompany = false;
      const emailLower = user.email?.toLowerCase();
      if (emailLower === 'bradens@lonestarfenceworks.com' || emailLower === 'usmc6123@gmail.com') {
        isCompany = true;
      } else if (emailLower) {
        try {
          const empSnap = await getDoc(doc(db, 'employees', emailLower));
          if (empSnap.exists()) {
            isCompany = true;
          } else {
            const adminSnap = await getDoc(doc(db, 'admins', user.uid));
            if (adminSnap.exists()) {
              isCompany = true;
            }
          }
        } catch (err) {
          console.warn("Could not check company user collections, assuming standard user.", err);
        }
      }
      if (active) {
        setGlobalUserId(user.uid, isCompany);
        setIsCompanyUser(isCompany);
        setRoleChecked(true);
      }
    };

    checkRoleAndSet();
    return () => {
      active = false;
    };
  }, [user]);

  // Direct email authentication is used for the security gateway.

  const [userTier, setUserTier] = React.useState<'free' | 'paid'>('free');
  const [userNextBilling, setUserNextBilling] = React.useState<string | null>(null);

  // Sync / Listen to user's real-time subscription document state from Firestore
  React.useEffect(() => {
    if (!user) {
      setUserTier('free');
      setUserNextBilling(null);
      return;
    }

    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const uData = docSnap.data();
        if (uData.isDisabled) {
          alert("Your client profile account has been suspended or disabled by administrator control.");
          setLocalUser(null);
          localStorage.removeItem('company_local_user');
          localStorage.removeItem('company_admin_token');
          return;
        }
        setUserTier(uData.tier || 'free');
        setUserNextBilling(uData.nextBillingDate || null);
      } else {
        // Auto register their doc as free if they signed up and doc doesn't exist yet
        setDoc(userRef, {
          uid: user.uid,
          email: user.email || '',
          tier: 'free',
          createdAt: new Date().toISOString()
        }, { merge: true }).catch(err => console.error("Auto registered doc error:", err));
        
        setUserTier('free');
        setUserNextBilling(null);
      }
    }, (error) => {
      console.warn('Real-time subscription watcher had issues:', error);
    });

    return () => unsubscribe();
  }, [user]);

  // Handle return from Stripe checkout and verify session results
  React.useEffect(() => {
    const handleCheckSessionResult = async () => {
      if (!user) return;
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('session_id');
      if (sessionId) {
        try {
          const response = await fetch('/api/verify-session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessionId, userId: user.uid }),
          });
          const result = await response.json();
          if (response.ok && result.success) {
            setUserTier('paid');
            setUserNextBilling(result.nextBillingDate);
          }
        } catch (err) {
          console.error('Failed to verify landing session path:', err);
        } finally {
          const cleanUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      }
    };
    handleCheckSessionResult();
  }, [user]);

  const [savedEstimates, setSavedEstimates] = React.useState<SavedEstimate[]>([]);

  const [activeTab, setActiveTab] = React.useState(() => {
    const isConsolePath = typeof window !== 'undefined' && (
      window.location.pathname === '/admin-console' || 
      window.location.pathname === '/admin' || 
      window.location.pathname === '/admin/settings'
    );
    if (isConsolePath) {
      return 'admin-console';
    }
    return getInitialValue('activeTab', 'fence_pro_active_tab', 'estimator');
  });

  const handleSetActiveTab = (tab: string) => {
    setActiveTab(tab);
  };

  React.useEffect(() => {
    if (activeTab === 'admin-console') {
      const isConsolePath = window.location.pathname === '/admin-console' || 
                            window.location.pathname === '/admin' || 
                            window.location.pathname === '/admin/settings';
      if (!isConsolePath) {
        const targetPath = '/admin-console';
        window.history.pushState(null, '', targetPath);
        setCurrentPath(targetPath);
      }
    } else {
      const isConsolePath = window.location.pathname === '/admin-console' || 
                            window.location.pathname === '/admin' || 
                            window.location.pathname === '/admin/settings';
      if (isConsolePath) {
        window.history.pushState(null, '', '/');
        setCurrentPath('/');
      }
    }
  }, [activeTab, adminToken]);

  React.useEffect(() => {
    const isConsolePath = currentPath === '/admin-console' || 
                          currentPath === '/admin' || 
                          currentPath === '/admin/settings';
    if (isConsolePath) {
      if (activeTab !== 'admin-console') {
        setActiveTab('admin-console');
      }
    } else {
      if (activeTab === 'admin-console' && (currentPath === '/' || currentPath === '')) {
        setActiveTab('estimator');
      }
    }
  }, [currentPath]);
  
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
  const [laborRateDiagnostic, setLaborRateDiagnostic] = React.useState<any>(null);

  const [globalDefaultSupplierId, setGlobalDefaultSupplierId] = React.useState<string>(() => {
    return localStorage.getItem('fence_pro_global_default_supplier') || '';
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
  const isContractPortal = portalParam === 'contract';
  const isCrewSchedulePortal = portalParam === 'crew-schedule';
  const isJobPortal = portalParam === 'job-portal' || portalParam === 'labor-snapshot';
  
  const [aiContractScope, setAiContractScope] = React.useState<string | null>(() => {
    return getInitialValue('aiContractScope', 'fence_pro_customer_contract_ai_scope', null);
  });

  const [aiProjectScope, setAiProjectScope] = React.useState<string | null>(() => {
    return getInitialValue('aiProjectScope', 'fence_pro_ai_scope', null);
  });

  React.useEffect(() => {
    testConnection();
  }, []);

  // Fetch estimates from Firestore if user is logged in, and merge with local ledger backup
  React.useEffect(() => {
    // Wait until the role of the user (e.g. employee vs. customer) is confirmed
    // before subscribing to any collection path to avoid race conditions
    if (user && !roleChecked) return;

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
        setSavedEstimates(assignEstimateNumbers(localEstimates));
        return;
      }

      // Load via the secure /api/estimates/list endpoint
      const token = localStorage.getItem('company_admin_token');
      fetch('/api/estimates/list', {
        headers: {
          'Authorization': `Bearer ${token || ''}`
        }
      })
        .then(async (res) => {
          if (res.ok) {
            const cloudEstimates = await res.json();
            // Merge cloud with unique local estimates
            const cloudIds = new Set(cloudEstimates.map((e: any) => e.id));
            const uniqueLocal = localEstimates.filter(e => !cloudIds.has(e.id));
            const combined = [...cloudEstimates, ...uniqueLocal];
            setSavedEstimates(assignEstimateNumbers(combined));
          } else {
            console.error('Cloud Sync API fetch failed, showing local estimates as fallback:', res.statusText);
            setSavedEstimates(assignEstimateNumbers(localEstimates));
          }
        })
        .catch((err) => {
          console.error('Network error during cloud sync fetch, falling back to local registry:', err);
          setSavedEstimates(assignEstimateNumbers(localEstimates));
        });
    };

    syncEstimates();

    // Re-check anytime a new customer estimate is submitted or created
    const handleLocalSubmitted = () => {
      syncEstimates();
    };
    window.addEventListener('customer_estimator_estimate_submitted', handleLocalSubmitted);

    // Grab message submissions from embedded iframes/widgets
    const handleMessageReceived = (event: MessageEvent) => {
      if (event && event.data && event.data.type === 'customer_estimator_estimate_submitted') {
        window.dispatchEvent(new Event('customer_estimator_estimate_submitted'));
      }
    };
    window.addEventListener('message', handleMessageReceived);

    return () => {
      window.removeEventListener('customer_estimator_estimate_submitted', handleLocalSubmitted);
      window.removeEventListener('message', handleMessageReceived);
    };
  }, [user, roleChecked, isCompanyUser]);

  const fetchMaterials = React.useCallback(async () => {
    if (!user) return;
    try {
      const token = localStorage.getItem('company_admin_token');
      const response = await fetch('/api/materials/list', {
        headers: {
          'Authorization': `Bearer ${token || ''}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setMaterials(data);
      } else {
        console.error('Failed to fetch materials via API:', response.statusText);
      }
    } catch (err) {
      console.error('Network error fetching materials via API:', err);
    }
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
        } finally {
          fetchMaterials();
        }
      };
      checkAndSync();

      const handleSync = () => {
        fetchMaterials();
      };
      window.addEventListener('company_materials_updated', handleSync);
      window.addEventListener('focus', handleSync);
      return () => {
        window.removeEventListener('company_materials_updated', handleSync);
        window.removeEventListener('focus', handleSync);
      };
    } else {
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
    }
  }, [user, isCustomerPortal, fetchMaterials]);

  // Fetch global company settings on mount/initially (especially for unauthenticated customer portal)
  React.useEffect(() => {
    const fetchGlobalSettings = async () => {
      try {
        const docRef = doc(db, 'companySettings', 'main');
        const dSnap = await getDoc(docRef);
        console.log('[DIAGNOSTIC] Loading laborRates from:', docRef.path);
        
        setLaborRateDiagnostic((prev: any) => ({
          ...(prev || {}),
          firestoreLoadPath: 'companySettings/main'
        }));

        if (dSnap.exists()) {
          const sData = dSnap.data();
          console.log('[DIAGNOSTIC] Data found in main:', Object.keys(sData));
          if (sData.laborRates) {
            console.log('[DIAGNOSTIC] laborRates found in main, updating state');
            setLaborRates(sData.laborRates);
            setLaborRateDiagnostic((prev: any) => ({
              ...(prev || {}),
              firestoreValueLoaded: sData.laborRates
            }));
          } else {
            console.log('[DIAGNOSTIC] No laborRates key in main document');
          }
          if (sData.defaultMaterialPricingSupplierId) {
            setGlobalDefaultSupplierId(sData.defaultMaterialPricingSupplierId);
          } else if (sData.estimatorSettings?.defaultMaterialPricingSupplierId) {
            setGlobalDefaultSupplierId(sData.estimatorSettings.defaultMaterialPricingSupplierId);
          }
          if (sData.estimatorSettings) {
            setEstimate(prev => ({
              ...prev,
              ...sData.estimatorSettings
            }));
          }
        } else {
          console.log('[DIAGNOSTIC] companySettings/main does not exist in Firestore');
        }
      } catch (err) {
        console.warn('Failed to load global settings from Firestore:', err);
      }
    };

    fetchGlobalSettings();
  }, [user]);

  // Synchronize globalDefaultSupplierId back to Firestore and LocalStorage
  React.useEffect(() => {
    localStorage.setItem('fence_pro_global_default_supplier', globalDefaultSupplierId);
    if (!user) return;

    const syncGlobalSupplierToCloud = async () => {
      try {
        const docRef = doc(db, 'companySettings', 'main');
        await setDoc(docRef, {
          defaultMaterialPricingSupplierId: globalDefaultSupplierId,
          estimatorSettings: {
            defaultMaterialPricingSupplierId: globalDefaultSupplierId,
          }
        }, { merge: true });
      } catch (syncErr) {
        console.error('Failed to sync updated global pricing default to cloud:', syncErr);
      }
    };

    const timer = setTimeout(() => {
      syncGlobalSupplierToCloud();
    }, 1000);

    return () => clearTimeout(timer);
  }, [globalDefaultSupplierId, user]);

  // Automatically inject global default supplier into new/draft estimates
  React.useEffect(() => {
    if (!estimate.id && globalDefaultSupplierId && estimate.defaultMaterialPricingSupplierId !== globalDefaultSupplierId) {
      setEstimate(prev => ({
        ...prev,
        defaultMaterialPricingSupplierId: globalDefaultSupplierId,
        pricingStrategy: prev.pricingStrategy || (globalDefaultSupplierId ? 'supplier' : 'best'),
        selectedSupplier: prev.selectedSupplier || globalDefaultSupplierId
      }));
    }
  }, [globalDefaultSupplierId, estimate.id, estimate.defaultMaterialPricingSupplierId]);

  const handleSaveLaborRates = async (newRates: LaborRates) => {
    setLaborRates(newRates);
    localStorage.setItem('fence_pro_labor_rates', JSON.stringify(newRates));
    
    const diagnostic: any = {
      uiState: newRates,
      payloadSent: { action: 'save-labor-rates', laborRates: newRates },
      endpoint: '/api/settings',
      firestoreWritePath: 'companySettings/main',
      firestoreLoadPath: 'companySettings/main',
      pathMatch: true
    };
    setLaborRateDiagnostic(diagnostic);

    if (user) {
      try {
        const token = localStorage.getItem('company_admin_token');
        console.log('[DIAGNOSTIC] Saving laborRates via API...');
        
        const response = await fetch('/api/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token || ''}`
          },
          body: JSON.stringify(diagnostic.payloadSent)
        });

        const resData = await response.json();
        console.log('[DIAGNOSTIC] API Response:', resData);
        
        setLaborRateDiagnostic((prev: any) => ({
          ...prev,
          backendResponse: resData,
          firestoreValueAfterWrite: resData.savedLaborRatesFromFirestore
        }));

        if (response.ok && resData.success) {
          if (resData.savedLaborRatesFromFirestore) {
            setLaborRates(resData.savedLaborRatesFromFirestore);
          }
          return true;
        }
        return false;
      } catch (err) {
        console.error('[DIAGNOSTIC] Labor rates save FAILURE:', err);
        setLaborRateDiagnostic((prev: any) => ({
          ...prev,
          backendResponse: { error: String(err) }
        }));
        return false;
      }
    }
    return true;
  };

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
          defaultMaterialPricingSupplierId: estimate.defaultMaterialPricingSupplierId || '',
        };

        await setDoc(docRef, {
          id: 'main', // Ensure validation passes
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
    estimate.markupPercentage, 
    estimate.wastePercentage, 
    estimate.taxPercentage, 
    estimate.concreteType, 
    estimate.footingType, 
    estimate.postWidth, 
    estimate.postThickness, 
    estimate.defaultMaterialPricingSupplierId,
    user
  ]);

  const fetchQuotes = React.useCallback(async () => {
    if (!user) return;
    try {
      const token = localStorage.getItem('company_admin_token');
      const response = await fetch('/api/quotes/list', {
        headers: {
          'Authorization': `Bearer ${token || ''}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setQuotes(data.map((q: any) => ({
          ...q,
          supplierName: getCanonicalSupplierName(q.supplierName || '')
        })));
      } else {
        console.error('Failed to fetch quotes via API:', response.statusText);
      }
    } catch (err) {
      console.error('Network error fetching quotes via API:', err);
    }
  }, [user]);

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

    fetchQuotes();

    const handleSync = () => {
      fetchQuotes();
    };
    window.addEventListener('company_quotes_updated', handleSync);
    window.addEventListener('focus', handleSync);
    return () => {
      window.removeEventListener('company_quotes_updated', handleSync);
      window.removeEventListener('focus', handleSync);
    };
  }, [user, fetchQuotes]);

  React.useEffect(() => {
    if (quotes && quotes.length > 0) {
      setEstimate(prev => {
        if (prev.quotes !== quotes) {
          return { ...prev, quotes };
        }
        return prev;
      });
    }
  }, [quotes]);

  const handleLogin = async () => {
    setActiveTab('pricing');
  };

  const handleLogout = async () => {
    try {
      setLocalUser(null);
      localStorage.removeItem('company_local_user');
      localStorage.removeItem('company_admin_token');
      setAdminToken(null);
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

        const token = localStorage.getItem('company_admin_token');
        const response = await fetch('/api/estimates/write', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token || ''}`
          },
          body: JSON.stringify({
            id: estimate.id,
            ...updateWithTimestamp
          })
        });
        if (!response.ok) {
          throw new Error('REST API estimate update failed');
        }
      } catch (error) {
        console.error('Failed to auto-sync estimate update via API:', error);
      }
    }
  };

  // No redirection for console path is needed since Estimator renders AdminConsole inline at the bottom of the page now.

  const isAuthLoading = false;
  const isRoleVerifying = !!user && !roleChecked;
  const isLoading = isAuthLoading || isRoleVerifying || isAdminVerifying;

  const [loadingText, setLoadingText] = React.useState('Initializing Portal...');

  React.useEffect(() => {
    if (isAuthLoading) {
      setLoadingText('Securing credential gateway...');
    } else if (isAdminVerifying) {
      setLoadingText('Verifying admin privileges...');
    } else if (isRoleVerifying) {
      setLoadingText('Syncing security configurations...');
    } else {
      setLoadingText('Connecting to engine database...');
    }
  }, [isAuthLoading, isRoleVerifying, isAdminVerifying]);

  if (isCrewSchedulePortal) {
    return <CrewSchedulePortal />;
  }

  if (isJobPortal) {
    return <JobPortal user={user} materials={materials} laborRates={laborRates} quotes={quotes} />;
  }

  if (isCustomerPortal) {
    return <CustomerEstimator standalone={true} materials={materials} laborRates={laborRates} estimate={estimate} />;
  }

  if (isContractPortal) {
    const params = new URLSearchParams(window.location.search);
    let estimateId = params.get('estimateId') || params.get('id') || '';
    if (!estimateId) {
      const hash = window.location.hash;
      if (hash.includes('estimateId=')) {
        estimateId = hash.substring(hash.indexOf('estimateId=') + 11).split('&')[0];
      } else if (hash.includes('id=')) {
        estimateId = hash.substring(hash.indexOf('id=') + 3).split('&')[0];
      }
    }
    return (
      <CustomerSignaturePortal 
        estimateId={estimateId} 
        materials={materials} 
        laborRates={laborRates} 
        quotes={quotes} 
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] px-4 font-sans text-[#1A1A1A]" id="app-loading-screen">
        <div className="flex flex-col items-center max-w-md text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="mb-8 flex flex-col items-center"
          >
            {COMPANY_INFO.logo && (
              <img 
                src={COMPANY_INFO.logo} 
                alt="Lone Star Fence Works" 
                className="h-20 md:h-24 w-auto object-contain animate-pulse"
                style={{ animationDuration: '2000ms' }}
                referrerPolicy="no-referrer"
              />
            )}
            <div className="mt-4 flex flex-col items-center">
              <span className="text-xl font-black uppercase leading-none tracking-tighter text-american-blue">Lone Star</span>
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-american-red mt-1">Fence Works</span>
            </div>
          </motion.div>

          <div className="relative flex h-14 w-14 items-center justify-center my-4">
            <div className="absolute inset-0 rounded-full border-4 border-american-blue/10"></div>
            <motion.div 
              className="absolute inset-0 rounded-full border-4 border-t-american-blue border-r-american-red"
              style={{ borderBottomColor: 'transparent', borderLeftColor: 'transparent' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          </div>

          <motion.p
            key={loadingText}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs font-semibold uppercase tracking-widest text-[#666666] font-mono mt-4 h-5 animate-pulse"
            style={{ animationDuration: '1500ms' }}
          >
            {loadingText}
          </motion.p>
        </div>
      </div>
    );
  }

  if (isEmployeeView) {
    return <EmployeePortal />;
  }

  if (!user) {
    return (
      <Layout 
        activeTab="pricing" 
        setActiveTab={handleSetActiveTab} 
        user={null} 
        userTier="free"
        onLogin={handleLogin} 
        onLogout={handleLogout}
      >
        <div className="grid gap-8 lg:grid-cols-5 items-start mt-4">
          <div className="lg:col-span-3">
            <PricingPage 
              userId={null}
              userEmail={null}
              currentTier="free"
              onGetStarted={() => {}}
            />
          </div>
          <div className="lg:col-span-2">
            <AuthPage 
              onSuccess={() => setActiveTab('estimator')} 
              onLocalLogin={(u) => {
                const userObj = {
                  uid: u.uid,
                  email: u.email,
                  displayName: u.displayName,
                  isAdmin: u.isAdmin || false,
                  token: u.token
                };
                setLocalUser(userObj);
                localStorage.setItem('company_local_user', JSON.stringify(userObj));
                if (u.token) {
                  setAdminToken(u.token);
                  localStorage.setItem('company_admin_token', u.token);
                }
              }}
            />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={handleSetActiveTab} 
      user={user} 
      userTier={userTier}
      onLogin={handleLogin} 
      onLogout={handleLogout}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="w-full h-full"
        >
          {activeTab === 'pricing' && (
            <PricingPlansAndBilling 
              userId={user.uid}
              userEmail={user.email}
              currentTier={userTier}
              nextBillingDate={userNextBilling}
              onGetStarted={() => setActiveTab('estimator')}
            />
          )}
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
              adminToken={adminToken}
              setAdminToken={(token) => {
                setAdminToken(token);
                if (token) {
                  localStorage.setItem('company_admin_token', token);
                } else {
                  localStorage.removeItem('company_admin_token');
                }
              }}
              onNavigate={(path) => {
                window.history.pushState(null, '', path);
                setCurrentPath(path);
              }}
              isAdminVerifying={isAdminVerifying}
              globalDefaultSupplierId={globalDefaultSupplierId}
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
              materials={materials}
              laborRates={laborRates}
            />
          )}
          {activeTab === 'financials' && (
            <Financials savedEstimates={savedEstimates} user={user} />
          )}
          {activeTab === 'library' && (
            <MaterialLibrary materials={materials} setMaterials={setMaterials} user={user} />
          )}
          {activeTab === 'labor' && (
            <LaborPricing 
              laborRates={laborRates} 
              setLaborRates={setLaborRates} 
              onSave={handleSaveLaborRates}
              diagnosticData={laborRateDiagnostic}
            />
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
              estimate={estimate}
              setEstimate={setEstimate}
              globalDefaultSupplierId={globalDefaultSupplierId}
              setGlobalDefaultSupplierId={setGlobalDefaultSupplierId}
            />
          )}
          {activeTab === 'settings' && <Settings user={user} adminToken={adminToken} />}
          {activeTab === 'employees' && <ManageEmployees />}
          {activeTab === 'admin-console' && (
            <AdminConsole 
              adminToken={adminToken}
              setAdminToken={(token) => {
                setAdminToken(token);
                if (token) {
                  localStorage.setItem('company_admin_token', token);
                } else {
                  localStorage.removeItem('company_admin_token');
                }
              }}
              onNavigate={(path) => {
                window.history.pushState(null, '', path);
                setCurrentPath(path);
              }}
              currentUser={user}
              isAdminVerifying={isAdminVerifying}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}

