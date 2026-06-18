import React from 'react';

export interface PrefillCustomer {
  id: string;
  customerId?: string;
  estimateId?: string;
  firstName: string;
  lastName: string;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  source: string;
}

export function useCustomerPrefillSearch() {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<PrefillCustomer[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [notification, setNotificationState] = React.useState('');
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  const searchCustomers = React.useCallback(async (nameVal: string) => {
    setQuery(nameVal);

    if (nameVal.trim().length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    setShowDropdown(true);

    try {
      const response = await fetch(`/api/estimates/write?action=search-customer-prefill&query=${encodeURIComponent(nameVal)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'search-customer-prefill', query: nameVal })
      });
      if (response.ok) {
        const data = await response.json();
        setResults(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('Prefill search failed:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const triggerNotification = React.useCallback((msg: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setNotificationState(msg);
    timerRef.current = setTimeout(() => {
      setNotificationState('');
    }, 5000);
  }, []);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    query,
    setQuery,
    results,
    setResults,
    isSearching,
    showDropdown,
    setShowDropdown,
    notification,
    setNotification: triggerNotification,
    searchCustomers,
  };
}
