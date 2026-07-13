import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, FileText, Trash2, TrendingUp, AlertCircle, 
  CheckCircle2, Loader2, ChevronRight, Scale, ExternalLink,
  Plus, History, DollarSign, Search, ChevronDown, GitMerge
} from 'lucide-react';
import { SupplierQuote, QuoteItem, MaterialItem, User, Estimate, SupplierQuoteSnapshot, SnapshotLineItem, ComparisonSummary } from '../types';
import { cn, formatCurrency, getCanonicalSupplierName } from '../lib/utils';
import { analyzeQuoteDocument } from '../services/geminiService';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, updateDoc, deleteDoc, doc, setDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface SearchableSelectProps {
  options: { value: string; label: string }[];
  onSelect: (value: string) => void;
  placeholder?: string;
}

function SearchableSelect({ options, onSelect, placeholder = "Search..." }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(opt => 
    opt.label.toLowerCase().includes(search.toLowerCase())
  );

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block w-48" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3 py-1 bg-[#F5F5F7] border-none rounded-md text-[10px] font-bold text-american-blue focus:ring-1 focus:ring-american-blue outline-none transition-all"
      >
        <span className="truncate">{placeholder}</span>
        <Search size={10} className="text-[#999999]" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 w-64 mt-1 bg-white rounded-xl shadow-2xl border border-american-blue/10 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="p-2 border-b border-[#F5F5F7]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#CCCCCC]" size={12} />
              <input
                autoFocus
                type="text"
                className="w-full pl-8 pr-3 py-2 bg-[#F5F5F7] rounded-lg text-xs font-bold focus:ring-2 focus:ring-american-blue/10 outline-none"
                placeholder="Type to find material..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-[10px] font-bold text-[#CCCCCC] uppercase tracking-widest">No matching materials</p>
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onSelect(opt.value);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-[11px] font-bold text-american-blue hover:bg-american-blue/5 transition-colors flex items-center justify-between group"
                >
                  <span className="truncate">{opt.label}</span>
                  <ChevronRight size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface QuoteManagerProps {
  materials: MaterialItem[];
  setMaterials: React.Dispatch<React.SetStateAction<MaterialItem[]>>;
  quotes: SupplierQuote[];
  setQuotes: React.Dispatch<React.SetStateAction<SupplierQuote[]>>;
  snapshots: SupplierQuoteSnapshot[];
  setSnapshots: React.Dispatch<React.SetStateAction<SupplierQuoteSnapshot[]>>;
  user: User | null;
  estimate: Partial<Estimate>;
  setEstimate: React.Dispatch<React.SetStateAction<Partial<Estimate>>>;
  globalDefaultSupplierId?: string;
  setGlobalDefaultSupplierId?: (val: string) => void;
}

export default function QuoteManager({ 
  materials, 
  setMaterials, 
  quotes, 
  setQuotes, 
  snapshots,
  setSnapshots,
  user, 
  estimate, 
  setEstimate,
  globalDefaultSupplierId = '',
  setGlobalDefaultSupplierId
}: QuoteManagerProps) {
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeView, setActiveView] = React.useState<'list' | 'compare' | 'history'>('list');
  const [selectedQuoteId, setSelectedQuoteId] = React.useState<string | null>(null);
  const [selectedHistoryMaterialId, setSelectedHistoryMaterialId] = React.useState<string | null>(null);
  const [selectedHistorySupplier, setSelectedHistorySupplier] = React.useState<string | null>(null);
  const [compareSearch, setCompareSearch] = React.useState("");
  const [toast, setToast] = React.useState<string | null>(null);

  // States for Manual Supplier Merge
  const [showMergeModal, setShowMergeModal] = React.useState(false);
  const [sourceSupplier, setSourceSupplier] = React.useState("");
  const [destinationSupplier, setDestinationSupplier] = React.useState("");
  const [customDestination, setCustomDestination] = React.useState("");

  const selectedQuote = React.useMemo(() => 
    quotes.find(q => q.id === selectedQuoteId) || null
  , [quotes, selectedQuoteId]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  React.useEffect(() => {
    if (!selectedQuote) return;
    const hasMissing = selectedQuote.items.some(item => 
      item.mappedMaterialId && !materials.some(m => m.id === item.mappedMaterialId)
    );
    if (hasMissing) {
      window.dispatchEvent(new Event('company_materials_updated'));
    }
  }, [selectedQuote, materials]);

  const uniqueSuppliers = React.useMemo(() => {
    return Array.from(new Set(quotes.map(q => q.supplierName))).filter(Boolean).sort();
  }, [quotes]);

  const handleMergeSuppliers = async () => {
    const dest = destinationSupplier === "__custom__" ? customDestination.trim() : destinationSupplier;
    if (!sourceSupplier || !dest) {
      showToast("Please select both source and destination");
      return;
    }
    const finalDest = getCanonicalSupplierName(dest);
    
    if (sourceSupplier === finalDest) {
      showToast("Source and target are already identical");
      return;
    }

    try {
      const quotesToMerge = quotes.filter(q => q.supplierName === sourceSupplier);
      
      if (user) {
        const token = localStorage.getItem('company_admin_token');
        for (const quote of quotesToMerge) {
          const res = await fetch('/api/quotes/write', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              id: quote.id,
              supplierName: finalDest
            })
          });
          if (!res.ok) {
            throw new Error(`Failed to update quote ${quote.id}`);
          }
        }
        window.dispatchEvent(new Event('company_quotes_updated'));
      }

      setQuotes(prev => prev.map(q => 
        q.supplierName === sourceSupplier 
          ? { ...q, supplierName: finalDest } 
          : q
      ));

      showToast(`Merged all from "${sourceSupplier}" to "${finalDest}"`);
      setShowMergeModal(false);
      setSourceSupplier("");
      setDestinationSupplier("");
      setCustomDestination("");
    } catch (error) {
      console.error("Error merging suppliers:", error);
      showToast("Failed to merge suppliers");
    }
  };

  const syncAllPrices = async () => {
    if (!selectedQuote) return;
    const itemsToUpdate = selectedQuote.items.filter(item => {
      const mat = materials.find(m => m.id === item.mappedMaterialId);
      if (!mat) return false;
      const priceDiffers = Math.abs(item.unitPrice - mat.cost) > 0.001;
      const neverUpdated = !mat.lastPriceUpdate;
      return priceDiffers || neverUpdated;
    });

    if (itemsToUpdate.length === 0) {
      showToast("All matched prices are already in sync");
      return;
    }

    if (user) {
      try {
        const token = localStorage.getItem('company_admin_token');
        const response = await fetch('/api/materials/list', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            action: 'bulk-sync',
            updates: itemsToUpdate.map(item => ({
              materialId: item.mappedMaterialId,
              cost: item.unitPrice
            }))
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }

        const resData = await response.json();
        if (resData.updatedMaterials && Array.isArray(resData.updatedMaterials)) {
          setMaterials(prev => prev.map(m => {
            const updated = resData.updatedMaterials.find((u: any) => u.id === m.id);
            return updated || m;
          }));
        } else {
          const nowIso = new Date().toISOString();
          setMaterials(prev => prev.map(m => {
            const update = itemsToUpdate.find(i => i.mappedMaterialId === m.id);
            return update ? { 
              ...m, 
              cost: update.unitPrice,
              lastPriceUpdate: nowIso,
              updatedAt: nowIso
            } : m;
          }));
        }

        window.dispatchEvent(new Event('company_materials_updated'));
      } catch (error: any) {
        console.error(error);
        showToast(error.message || "Failed to sync prices to server");
        return;
      }
    } else {
      const nowIso = new Date().toISOString();
      setMaterials(prev => prev.map(m => {
        const update = itemsToUpdate.find(i => i.mappedMaterialId === m.id);
        return update ? { 
          ...m, 
          cost: update.unitPrice,
          lastPriceUpdate: nowIso,
          updatedAt: nowIso
        } : m;
      }));
    }
    showToast(`Synchronized ${itemsToUpdate.length} prices from quote`);
  };

  const [isProcessing, setIsProcessing] = React.useState(false);
  const [reviewSnapshot, setReviewSnapshot] = React.useState<SupplierQuoteSnapshot | null>(null);

  const calculateComparison = (newLineItems: SnapshotLineItem[], prevSnapshot?: SupplierQuoteSnapshot): ComparisonSummary => {
    if (!prevSnapshot) {
      return {
        itemsIncreased: 0,
        itemsDecreased: 0,
        unchangedItems: 0,
        newItems: newLineItems.length,
        missingItems: 0,
        averagePercentageChange: 0
      };
    }

    let increased = 0;
    let decreased = 0;
    let unchanged = 0;
    let newItems = 0;
    let totalChangePercent = 0;
    let matchedCount = 0;

    newLineItems.forEach(item => {
      const prevItem = prevSnapshot.lineItems.find(pi => 
        (pi.mappedMaterialId && pi.mappedMaterialId === item.mappedMaterialId) || 
        (pi.materialName === item.materialName)
      );

      if (prevItem) {
        matchedCount++;
        const change = ((item.newPrice - prevItem.newPrice) / prevItem.newPrice) * 100;
        totalChangePercent += change;

        if (item.newPrice > prevItem.newPrice) increased++;
        else if (item.newPrice < prevItem.newPrice) decreased++;
        else unchanged++;
      } else {
        newItems++;
      }
    });

    const missingItems = prevSnapshot.lineItems.filter(pi => 
      !newLineItems.find(ni => 
        (ni.mappedMaterialId && ni.mappedMaterialId === pi.mappedMaterialId) || 
        (ni.materialName === pi.materialName)
      )
    ).length;

    return {
      itemsIncreased: increased,
      itemsDecreased: decreased,
      unchangedItems: unchanged,
      newItems: newItems,
      missingItems: missingItems,
      averagePercentageChange: matchedCount > 0 ? totalChangePercent / matchedCount : 0
    };
  };

  const handleActivateSnapshot = async (snapshotId: string) => {
    if (!user) return;
    setIsProcessing(true);
    try {
      const adminToken = localStorage.getItem('company_admin_token');
      const response = await fetch('/api/quotes/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify({
          action: 'activate',
          snapshotId
        })
      });

      if (!response.ok) {
        throw new Error("Failed to activate snapshot");
      }

      showToast("Snapshot activated and material prices updated");
      setReviewSnapshot(null);
      window.dispatchEvent(new Event('company_quotes_updated'));
      window.dispatchEvent(new Event('company_materials_updated'));
    } catch (err) {
      console.error(err);
      setError("Failed to activate snapshot");
    } finally {
      setIsProcessing(false);
    }
  };

  const SnapshotReview = ({ snapshot, onClose }: { snapshot: SupplierQuoteSnapshot, onClose: () => void }) => {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Scale className="w-5 h-5 text-american-blue" />
                Review Quote: {snapshot.supplierName}
              </h3>
              <p className="text-sm text-gray-500 font-mono">
                {new Date(snapshot.date).toLocaleDateString()} • {snapshot.sourceFileName}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
              <Plus className="w-5 h-5 text-gray-500 rotate-45" />
            </button>
          </div>

          {/* Comparison Summary Cards */}
          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4 bg-white">
            <div className="p-4 rounded-xl border border-red-100 bg-red-50/30">
              <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-1">Increases</p>
              <p className="text-2xl font-black text-red-700">{snapshot.comparisonSummary.itemsIncreased}</p>
            </div>
            <div className="p-4 rounded-xl border border-green-100 bg-green-50/30">
              <p className="text-xs font-bold text-green-600 uppercase tracking-wider mb-1">Decreases</p>
              <p className="text-2xl font-black text-green-700">{snapshot.comparisonSummary.itemsDecreased}</p>
            </div>
            <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/30">
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">New Items</p>
              <p className="text-2xl font-black text-blue-700">{snapshot.comparisonSummary.newItems}</p>
            </div>
            <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/30">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">Avg Change</p>
              <p className={cn(
                "text-2xl font-black",
                snapshot.comparisonSummary.averagePercentageChange > 0 ? "text-red-700" : "text-green-700"
              )}>
                {snapshot.comparisonSummary.averagePercentageChange > 0 ? '+' : ''}
                {snapshot.comparisonSummary.averagePercentageChange.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="flex-1 overflow-y-auto px-6">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-gray-100">
                  <th className="py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Material</th>
                  <th className="py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Old Price</th>
                  <th className="py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">New Price</th>
                  <th className="py-3 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {snapshot.lineItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4">
                      <p className="text-sm font-bold text-gray-900">{item.materialName}</p>
                      {item.partNumber && <p className="text-[10px] font-mono text-gray-400">{item.partNumber}</p>}
                    </td>
                    <td className="py-4 text-right font-mono text-sm text-gray-500">
                      {item.oldPrice > 0 ? formatCurrency(item.oldPrice) : '—'}
                    </td>
                    <td className="py-4 text-right font-mono text-sm font-bold text-gray-900">
                      {formatCurrency(item.newPrice)}
                    </td>
                    <td className="py-4 text-right">
                      {item.oldPrice > 0 ? (
                        <span className={cn(
                          "text-xs font-bold px-2 py-0.5 rounded-full",
                          item.changeType === 'increase' ? "bg-red-100 text-red-700" :
                          item.changeType === 'decrease' ? "bg-green-100 text-green-700" :
                          "bg-gray-100 text-gray-600"
                        )}>
                          {item.newPrice > item.oldPrice ? '+' : ''}
                          {(((item.newPrice - item.oldPrice) / item.oldPrice) * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">NEW</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-amber-600 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Activation will update current material prices.
            </div>
            <div className="flex gap-3">
              <button 
                onClick={onClose}
                className="px-6 py-2 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleActivateSnapshot(snapshot.id)}
                disabled={isProcessing}
                className="px-8 py-2 rounded-xl text-sm font-black text-white bg-american-blue hover:bg-american-blue/90 shadow-lg shadow-american-blue/20 flex items-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
                Activate Prices
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  };
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!user) {
      setError("Please login to upload quotes");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // 1. Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      // 2. Upload to Firebase Storage via Server API
      const token = localStorage.getItem('company_admin_token');
      const responseUpload = await fetch('/api/quotes/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'upload',
          fileData: base64Data,
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          pathPrefix: 'quotes/'
        })
      });

      if (!responseUpload.ok) {
        const errData = await responseUpload.json().catch(() => ({}));
        throw new Error(errData.error || `Upload HTTP error ${responseUpload.status}`);
      }

      const uploadResult = await responseUpload.json();
      const downloadUrl = uploadResult.downloadUrl || uploadResult.fileUrl;

      // 3. Extract data with Gemini using base64Data
      const extractedData = await analyzeQuoteDocument(base64Data, file.type);
      
      let supplierName = getCanonicalSupplierName(extractedData.supplierName || 'Unknown Supplier');

      const newQuoteId = Math.random().toString(36).substr(2, 9);

      // 3. Prepare quote object with explicit mapping to avoid garbage fields
      const items = (extractedData.items || []).map((item: any) => {
        const itemNameLower = (item.materialName || '').toLowerCase();
        const partNumberLower = (item.partNumber || '').toLowerCase();

        const match = materials.find(m => {
          // 1. Part Number Exact Match (Highest confidence)
          if (partNumberLower && m.sku && m.sku.toLowerCase() === partNumberLower) return true;
          
          // 2. Alias Match (User-learned memory)
          if (m.aliases?.some(alias => alias.toLowerCase() === itemNameLower)) return true;
          if (partNumberLower && m.aliases?.some(alias => alias.toLowerCase() === partNumberLower)) return true;

          // 3. Name Match (Fuzzy)
          if (m.name.toLowerCase() === itemNameLower) return true;
          if (m.name.toLowerCase().includes(itemNameLower) || itemNameLower.includes(m.name.toLowerCase())) return true;
          
          return false;
        });
        
        return {
          id: Math.random().toString(36).substr(2, 9),
          materialName: item.materialName || 'Unknown Material',
          partNumber: item.partNumber || null,
          qty: Number(item.qty) || 0,
          unit: item.unit || 'each',
          unitPrice: Number(item.unitPrice) || 0,
          totalPrice: Number(item.totalPrice) || (Number(item.qty || 0) * Number(item.unitPrice || 0)) || 0,
          mappedMaterialId: match?.id || null
        };
      });

      const newQuote: SupplierQuote = {
        id: newQuoteId,
        companyId: 'lonestarfence',
        supplierName: supplierName,
        date: new Date().toISOString(),
        items: items,
        totalAmount: Number(extractedData.totalAmount) || items.reduce((sum, i) => sum + i.totalPrice, 0),
        fileName: file.name || 'document',
        fileType: file.type || 'application/pdf',
        fileUrl: downloadUrl || ''
      };

      // 4. Save to Firestore
      // Deep sanitization to ensure no undefined values
      const sanitize = (obj: any): any => {
        return JSON.parse(JSON.stringify(obj, (_, v) => v === undefined ? null : v));
      };
      
      const sanitizedQuote = sanitize(newQuote);
      
      const adminToken = localStorage.getItem('company_admin_token');
      
      // 5. Create Snapshot
      const prevSnapshot = snapshots
        .filter(s => s.supplierName === supplierName)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

      const lineItems: SnapshotLineItem[] = items.map(item => ({
        id: Math.random().toString(36).substr(2, 9),
        materialId: item.mappedMaterialId || null,
        materialName: item.materialName,
        partNumber: item.partNumber,
        unit: item.unit,
        newPrice: item.unitPrice,
        oldPrice: snapshots
          .filter(s => s.supplierName === supplierName)
          .flatMap(s => s.lineItems)
          .find(li => li.materialName === item.materialName)?.newPrice || 0,
        changeType: 'new', // Will be calculated in summary
        mappedMaterialId: item.mappedMaterialId
      })).map(li => {
        if (li.oldPrice === 0) return { ...li, changeType: 'new' as const };
        if (li.newPrice > li.oldPrice) return { ...li, changeType: 'increase' as const };
        if (li.newPrice < li.oldPrice) return { ...li, changeType: 'decrease' as const };
        return { ...li, changeType: 'none' as const };
      });

      const comparisonSummary = calculateComparison(lineItems, prevSnapshot);

      const newSnapshot: SupplierQuoteSnapshot = {
        id: doc(collection(db, 'supplierQuoteSnapshots')).id,
        supplierName,
        date: new Date().toISOString(),
        sourceFileName: file.name,
        sourceFileUrl: downloadUrl || '',
        status: 'pending',
        lineItems,
        comparisonSummary
      };

      // 6. Save Snapshot
      const responseSnapshot = await fetch('/api/quotes/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify({
          action: 'snapshot',
          snapshot: sanitize(newSnapshot)
        })
      });

      if (!responseSnapshot.ok) {
        throw new Error("Failed to save snapshot");
      }

      // 7. Save to Firestore (Legacy)
      const response = await fetch('/api/quotes/write', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'Authorization': `Bearer ${adminToken}` } : {})
        },
        body: JSON.stringify(sanitizedQuote)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      window.dispatchEvent(new Event('company_quotes_updated'));
      setReviewSnapshot(newSnapshot); // Open review modal immediately
      setSelectedQuoteId(newQuoteId);
      showToast("Quote processed and snapshot created");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to process quote");
    } finally {
      setIsUploading(false);
    }
  };

  const deleteQuote = async (id: string) => {
    if (!user) return;
    try {
      const token = localStorage.getItem('company_admin_token');
      const response = await fetch('/api/quotes/write', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ id })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      window.dispatchEvent(new Event('company_quotes_updated'));
      if (selectedQuoteId === id) setSelectedQuoteId(null);
      showToast("Quote deleted from cloud");
    } catch (error: any) {
      console.error(error);
      showToast(error.message || "Failed to delete quote");
    }
  };

  const updateMaterialPrice = async (materialId: string, newPrice: number) => {
    const mat = materials.find(m => m.id === materialId);
    if (user) {
      try {
        const token = localStorage.getItem('company_admin_token');
        const response = await fetch('/api/materials/list', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            id: materialId,
            cost: newPrice,
            lastPriceUpdate: new Date().toISOString()
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }

        const updatedMaterial = await response.json();
        setMaterials(prev => prev.map(m => m.id === materialId ? updatedMaterial : m));
        window.dispatchEvent(new Event('company_materials_updated'));
      } catch (error: any) {
        console.error(error);
        showToast(error.message || "Failed to update material price on server");
        return;
      }
    } else {
      setMaterials(prev => prev.map(m => 
        m.id === materialId ? { 
          ...m, 
          cost: newPrice,
          lastPriceUpdate: new Date().toISOString()
        } : m
      ));
    }
    showToast(`Updated ${mat?.name || 'Material'} price to ${formatCurrency(newPrice)}`);
  };

  const mapMaterialToItem = async (quoteId: string, itemId: string, materialId: string) => {
    if (!user) return;

    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;

    const materialsMap = new Map(materials.map(m => [m.id, m]));
    const mat = materialId ? materialsMap.get(materialId) : null;

    const updatedItems = quote.items.map(item => {
      if (item.id === itemId) {
        if (!materialId) {
          return {
            ...item,
            mappedMaterialId: null,
            mappedMaterialName: null,
            mappedMaterialSku: null,
            mappedMaterialCategory: null,
            mappedAt: null
          };
        } else {
          return {
            ...item,
            mappedMaterialId: materialId,
            mappedMaterialName: mat ? mat.name : null,
            mappedMaterialSku: mat?.sku || null,
            mappedMaterialCategory: mat?.category || null,
            mappedAt: new Date().toISOString()
          };
        }
      }
      return item;
    });

    if (materialId && mat) {
      const item = quote.items.find(i => i.id === itemId);
      if (item) {
        const currentAliases = mat.aliases || [];
        const nextAliases = [...currentAliases];
        let updated = false;

        // Learn materialName as alias
        if (!nextAliases.includes(item.materialName)) {
          nextAliases.push(item.materialName);
          updated = true;
        }

        // Learn partNumber as alias or SKU
        if (item.partNumber && !nextAliases.includes(item.partNumber)) {
          nextAliases.push(item.partNumber);
          updated = true;
        }

        const updates: any = { 
          aliases: nextAliases,
          supplierAlias: item.materialName,
          supplierItemName: item.materialName
        };
        if (item.partNumber) {
          updates.supplierPartNumber = item.partNumber;
          if (!mat.sku) {
            updates.sku = item.partNumber;
          }
        }

        const token = localStorage.getItem('company_admin_token');
        fetch('/api/materials/list', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            id: materialId,
            ...updates
          })
        }).then(async (response) => {
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP error ${response.status}`);
          }
          const updatedMaterial = await response.json();
          setMaterials(prev => prev.map(m => m.id === materialId ? updatedMaterial : m));
          window.dispatchEvent(new Event('company_materials_updated'));
        }).catch(err => {
          console.error('Failed to map material mapping to server', err);
        });

        showToast(`Learned mapping: ${item.materialName} → ${mat.name}`);
      }
    }

    try {
      const token = localStorage.getItem('company_admin_token');
      const response = await fetch('/api/quotes/write', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          id: quoteId,
          items: updatedItems
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const updatedQuote = await response.json();
      setQuotes(prev => prev.map(q => q.id === quoteId ? updatedQuote : q));
      window.dispatchEvent(new Event('company_quotes_updated'));
    } catch (error) {
      console.error(error);
      showToast("Failed to lock material link on server");
    }
  };

  // Comparison Logic: Group by mapped materials
  const compareData = React.useMemo(() => {
    const comparison: Record<string, { materialName: string, suppliers: { supplierName: string, price: number, quoteId: string, fileUrl?: string }[] }> = {};

    const normalizeName = (name: string) => {
      return getCanonicalSupplierName(name).toLowerCase();
    };

    quotes.forEach(quote => {
      quote.items.forEach(item => {
        if (item.mappedMaterialId) {
          if (!comparison[item.mappedMaterialId]) {
            const mat = materials.find(m => m.id === item.mappedMaterialId);
            comparison[item.mappedMaterialId] = {
              materialName: mat?.name || item.materialName,
              suppliers: []
            };
          }

          // Consolidate supplier variations in view
          const normSupplier = normalizeName(quote.supplierName);
          const existingInMat = comparison[item.mappedMaterialId].suppliers.find(s => normalizeName(s.supplierName) === normSupplier);
          
          if (existingInMat) {
            // If multiple quotes from same supplier, keep the newest one for comparison
            const existingQuote = quotes.find(q => q.id === existingInMat.quoteId);
            if (existingQuote && new Date(quote.date) > new Date(existingQuote.date)) {
              existingInMat.price = item.unitPrice;
              existingInMat.quoteId = quote.id;
              existingInMat.supplierName = quote.supplierName;
              existingInMat.fileUrl = quote.fileUrl;
            }
          } else {
            comparison[item.mappedMaterialId].suppliers.push({
              supplierName: quote.supplierName,
              price: item.unitPrice,
              quoteId: quote.id,
              fileUrl: quote.fileUrl
            });
          }
        }
      });
    });

    return Object.entries(comparison).map(([id, data]) => ({
      id,
      ...data,
      minPrice: Math.min(...data.suppliers.map(s => s.price)),
      maxPrice: Math.max(...data.suppliers.map(s => s.price))
    }));
  }, [quotes, materials]);

  // History Logic: Group all instances of a material across time
  const historyData = React.useMemo(() => {
    const history: Record<string, { materialName: string, entries: { supplierName: string, price: number, date: string, quoteId?: string, snapshotId?: string, type: 'quote' | 'snapshot' }[] }> = {};

    const normalizeName = (name: string) => {
      return getCanonicalSupplierName(name).toLowerCase();
    };

    // Process Legacy Quotes
    quotes.forEach(quote => {
      quote.items.forEach(item => {
        if (item.mappedMaterialId) {
          if (!history[item.mappedMaterialId]) {
            const mat = materials.find(m => m.id === item.mappedMaterialId);
            history[item.mappedMaterialId] = {
              materialName: mat?.name || item.materialName,
              entries: []
            };
          }

          const normCurrent = normalizeName(quote.supplierName);
          const existingEntry = history[item.mappedMaterialId].entries.find(e => normalizeName(e.supplierName) === normCurrent && e.date === quote.date);
          
          if (!existingEntry) {
            history[item.mappedMaterialId].entries.push({
              supplierName: quote.supplierName,
              price: item.unitPrice,
              date: quote.date,
              quoteId: quote.id,
              type: 'quote'
            });
          }
        }
      });
    });

    // Process Snapshots (Immutable History)
    snapshots.forEach(snap => {
      snap.lineItems.forEach(item => {
        if (item.mappedMaterialId) {
          if (!history[item.mappedMaterialId]) {
            const mat = materials.find(m => m.id === item.mappedMaterialId);
            history[item.mappedMaterialId] = {
              materialName: mat?.name || item.materialName,
              entries: []
            };
          }

          const normCurrent = normalizeName(snap.supplierName);
          const existingEntry = history[item.mappedMaterialId].entries.find(e => normalizeName(e.supplierName) === normCurrent && e.date === snap.date);
          
          if (!existingEntry) {
            history[item.mappedMaterialId].entries.push({
              supplierName: snap.supplierName,
              price: item.newPrice,
              date: snap.date,
              snapshotId: snap.id,
              type: 'snapshot'
            });
          }
        }
      });
    });

    // Sort entries by date desc (newest first)
    Object.values(history).forEach(h => {
      h.entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });

    return Object.entries(history).map(([id, data]) => ({
      id,
      ...data
    })).sort((a, b) => a.materialName.localeCompare(b.materialName));
  }, [quotes, snapshots, materials]);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-american-blue text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10"
          >
            <CheckCircle2 className="text-emerald-400" size={18} />
            <span className="text-xs font-black uppercase tracking-widest">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {reviewSnapshot && (
        <SnapshotReview 
          snapshot={reviewSnapshot} 
          onClose={() => setReviewSnapshot(null)} 
        />
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-8 rounded-[40px] shadow-xl border-2 border-american-blue/5">
        <div>
          <h1 className="text-4xl font-black text-american-blue tracking-tighter uppercase leading-none">Supplier Intelligence</h1>
          <p className="text-sm font-bold text-american-red uppercase tracking-[0.3em] mt-2">Upload & Compare Strategic Pricing</p>
        </div>
        <div className="flex bg-[#F5F5F7] p-1 rounded-2xl">
          <button 
            onClick={() => setActiveView('list')}
            className={cn(
              "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2",
              activeView === 'list' ? "bg-white text-american-blue shadow-sm" : "text-[#999999] hover:text-american-blue"
            )}
          >
            <FileText size={16} />
            Quotes
          </button>
          <button 
            onClick={() => setActiveView('compare')}
            className={cn(
              "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2",
              activeView === 'compare' ? "bg-white text-american-blue shadow-sm" : "text-[#999999] hover:text-american-blue"
            )}
          >
            <Scale size={16} />
            Compare
          </button>
          <button 
            onClick={() => setActiveView('history')}
            className={cn(
              "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2",
              activeView === 'history' ? "bg-white text-american-blue shadow-sm" : "text-[#999999] hover:text-american-blue"
            )}
          >
            <History size={16} />
            History
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Left Column: Upload & History */}
        <div className="lg:col-span-4 space-y-8">
          <div className="bg-white rounded-[40px] p-8 shadow-xl border-2 border-american-blue/5 space-y-6">
            <div className="flex items-center gap-3 text-american-blue">
              <Upload size={20} />
              <h2 className="font-black uppercase tracking-tight">Upload New Quote</h2>
            </div>
            
            <label className={cn(
              "relative flex flex-col items-center justify-center h-48 border-4 border-dashed rounded-3xl cursor-pointer transition-all",
              isUploading ? "bg-american-blue/5 border-american-blue" : "border-[#E5E5E5] hover:border-american-blue/30 hover:bg-[#FBFBFB]"
            )}>
              <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf" disabled={isUploading} />
              {isUploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="animate-spin text-american-blue" size={32} />
                  <p className="text-xs font-bold uppercase tracking-widest text-american-blue">Analyzing with AI...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-american-blue/5 text-american-blue flex items-center justify-center">
                    <Plus size={24} />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#666666]">Click to upload or drag & drop</p>
                  <p className="text-[10px] font-medium text-[#999999]">Supports JPG, PNG, PDF</p>
                </div>
              )}
            </label>

            {error && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-100 flex items-start gap-3 text-red-600 animate-in shake duration-500">
                <AlertCircle className="shrink-0" size={18} />
                <p className="text-xs font-bold leading-relaxed">{error}</p>
              </div>
            )}

            <button 
              type="button"
              onClick={() => setShowMergeModal(true)}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-american-blue/5 hover:bg-american-blue/10 active:scale-95 text-xs font-black uppercase tracking-widest text-american-blue transition-all cursor-pointer mt-2"
            >
              <GitMerge size={16} />
              Merge / Combine Suppliers
            </button>
          </div>

          {/* Default Pricing Supplier Selection Card */}
          <div className="bg-white rounded-[40px] p-8 shadow-xl border-2 border-american-blue/5 space-y-6">
            <div className="flex items-center gap-3 text-american-blue">
              <CheckCircle2 size={20} className="text-emerald-600" />
              <h2 className="font-black uppercase tracking-tight">Default Pricing Supplier</h2>
            </div>
            
            <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest leading-relaxed">
              Select one supplier as the default source for material takeoff, estimate pricing, and job material cost calculations.
            </p>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#888888]">Default Pricing Supplier:</label>
              <select
                value={globalDefaultSupplierId || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (setGlobalDefaultSupplierId) {
                    setGlobalDefaultSupplierId(val);
                  }
                  setEstimate(prev => ({
                    ...prev,
                    defaultMaterialPricingSupplierId: val,
                    pricingStrategy: val ? 'supplier' : 'best',
                    selectedSupplier: val || prev.selectedSupplier
                  }));
                }}
                className="w-full px-4 py-3 bg-[#F5F5F7] hover:bg-[#EBEBEF] rounded-2xl text-xs font-black uppercase tracking-widest text-american-blue border-2 border-transparent focus:border-american-blue outline-none transition-all cursor-pointer"
              >
                <option value="">-- No Default Supplier (Fallback to Library) --</option>
                {uniqueSuppliers.map((supplier) => (
                  <option key={supplier} value={supplier}>
                    {supplier}
                  </option>
                ))}
              </select>
            </div>

            {globalDefaultSupplierId ? (
              <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 flex items-start gap-3 text-emerald-800">
                <CheckCircle2 className="shrink-0 text-emerald-600 mt-0.5" size={16} />
                <div className="space-y-1">
                  <p className="text-xs font-bold leading-relaxed">
                    Active: <span className="underline font-black">{globalDefaultSupplierId}</span>
                  </p>
                  <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest leading-relaxed">
                    Material Takeoff will use this supplier's item prices first, falling back to library prices if unavailable.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-100 flex items-start gap-3 text-amber-800">
                <AlertCircle className="shrink-0 text-amber-600 mt-0.5" size={16} />
                <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest leading-relaxed">
                  No default supplier active. Material Takeoff uses standard material library prices.
                </p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-[40px] p-8 shadow-xl border-2 border-american-blue/5 space-y-6">
            <div className="flex items-center gap-3 text-american-blue">
              <History size={20} />
              <h2 className="font-black uppercase tracking-tight">Recent Benchmarks</h2>
            </div>
            
            <div className="space-y-4">
              {quotes.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <div className="h-12 w-12 rounded-full bg-[#F5F5F7] flex items-center justify-center mx-auto text-[#CCCCCC]">
                    <FileText size={20} />
                  </div>
                  <p className="text-[11px] font-bold text-[#999999] uppercase tracking-widest">No quotes uploaded yet</p>
                </div>
              ) : (
                quotes.map(quote => (
                  <button
                    key={quote.id}
                    onClick={() => { setSelectedQuoteId(quote.id); setActiveView('list'); }}
                    className={cn(
                      "w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all group text-left",
                      selectedQuoteId === quote.id ? "bg-american-blue/5 border-american-blue" : "bg-white border-transparent hover:bg-[#FBFBFB]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center transition-colors shadow-sm",
                        selectedQuoteId === quote.id ? "bg-american-blue text-white" : "bg-[#F5F5F7] text-american-blue group-hover:bg-american-blue group-hover:text-white"
                      )}>
                        <FileText size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-american-blue">{quote.supplierName}</p>
                        <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">
                          {new Date(quote.date).toLocaleDateString()} • {formatCurrency(quote.totalAmount)}
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={16} className={cn("transition-transform", selectedQuoteId === quote.id ? "text-american-blue translate-x-1" : "text-[#CCCCCC]")} />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Supplier Price History Section */}
          <div className="bg-white rounded-[40px] p-8 shadow-xl border-2 border-american-blue/5 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-american-blue">
                <History size={20} />
                <h2 className="font-black uppercase tracking-tight">Price History</h2>
              </div>
              <span className="px-2 py-0.5 bg-american-blue/10 text-american-blue rounded-full text-[9px] font-black uppercase tracking-widest">
                Immutable Records
              </span>
            </div>
            
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {snapshots.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-[10px] font-bold text-[#CCCCCC] uppercase tracking-widest">No historical snapshots yet</p>
                </div>
              ) : (
                snapshots.map(snap => (
                  <div key={snap.id} className="p-4 rounded-2xl border border-gray-100 bg-gray-50/30 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-black text-american-blue">{snap.supplierName}</p>
                        <p className="text-[10px] font-medium text-gray-500">
                          {new Date(snap.date).toLocaleDateString()} • {snap.sourceFileName}
                        </p>
                      </div>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                        snap.status === 'active' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {snap.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center p-1.5 rounded bg-white border border-gray-100">
                        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">Up</p>
                        <p className="text-xs font-black text-red-600">+{snap.comparisonSummary.itemsIncreased}</p>
                      </div>
                      <div className="text-center p-1.5 rounded bg-white border border-gray-100">
                        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">Down</p>
                        <p className="text-xs font-black text-green-600">-{snap.comparisonSummary.itemsDecreased}</p>
                      </div>
                      <div className="text-center p-1.5 rounded bg-white border border-gray-100">
                        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">Avg</p>
                        <p className={cn(
                          "text-xs font-black",
                          snap.comparisonSummary.averagePercentageChange > 0 ? "text-red-600" : "text-green-600"
                        )}>
                          {snap.comparisonSummary.averagePercentageChange > 0 ? '+' : ''}
                          {snap.comparisonSummary.averagePercentageChange.toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button 
                        onClick={() => setReviewSnapshot(snap)}
                        className="flex-1 py-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-1"
                      >
                        <Search size={10} />
                        Review
                      </button>
                      {snap.sourceFileUrl && (
                        <a 
                          href={snap.sourceFileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center"
                        >
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: View/Compare */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            {activeView === 'list' ? (
              <motion.div
                key="list"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {selectedQuote ? (
                  <div className="bg-white rounded-[40px] shadow-xl border-2 border-american-blue/5 overflow-hidden">
                    <div className="p-8 border-b-2 border-[#F5F5F7] flex flex-col sm:flex-row justify-between items-start gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-2xl font-black text-american-blue tracking-tight uppercase">{selectedQuote.supplierName}</h3>
                          <span className="px-3 py-1 bg-american-blue/10 text-american-blue rounded-full text-[10px] font-black uppercase tracking-widest">Quote Data</span>
                        </div>
                        <p className="text-xs font-bold text-[#999999] uppercase tracking-widest">Processed on {new Date(selectedQuote.date).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2">
                        {selectedQuote.items.some(item => {
                          const mat = materials.find(m => m.id === item.mappedMaterialId);
                          return mat && Math.abs(item.unitPrice - mat.cost) > 0.001;
                        }) && (
                          <button 
                            onClick={syncAllPrices}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-black uppercase tracking-widest text-white transition-colors shadow-lg"
                          >
                            <TrendingUp size={16} />
                            Sync All Prices
                          </button>
                        )}
                        {selectedQuote.fileUrl && (
                          <a 
                            href={selectedQuote.fileUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 bg-[#F5F5F7] hover:bg-[#E5E5E7] rounded-xl text-xs font-black uppercase tracking-widest text-american-blue transition-colors shadow-sm"
                          >
                            <ExternalLink size={16} />
                            Open Document
                          </a>
                        )}
                        <button 
                          onClick={() => deleteQuote(selectedQuote.id)}
                          className="p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-sm"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>

                    <div className="p-8">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-[#F8F9FA] text-[10px] font-black uppercase tracking-widest text-[#999999]">
                              <th className="px-6 py-4">Extracted Material</th>
                              <th className="px-6 py-4 text-center">Qty</th>
                              <th className="px-6 py-4 text-right">Unit Price</th>
                              <th className="px-6 py-4 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y-2 divide-[#F8F9FA]">
                            {selectedQuote.items.map((item) => {
                              const mat = materials.find(m => m.id === item.mappedMaterialId);
                              const isHigher = mat && item.unitPrice > mat.cost;
                              const isLower = mat && item.unitPrice < mat.cost;
                              const isDifferent = mat && (Math.abs(item.unitPrice - mat.cost) > 0.001 || !mat.lastPriceUpdate);

                              return (
                                <tr key={item.id} className="text-sm font-bold text-american-blue hover:bg-[#FBFBFB] transition-colors">
                                  <td className="px-6 py-5">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <p>{item.materialName}</p>
                                        {item.partNumber && (
                                          <span className="px-1.5 py-0.5 bg-american-blue/5 text-[9px] font-black text-american-blue/40 rounded uppercase tracking-tighter">
                                            PN: {item.partNumber}
                                          </span>
                                        )}
                                      </div>
                                      {item.mappedMaterialId && !mat ? (
                                        <div className="flex items-center gap-2">
                                          <div className="flex items-center gap-1.5 text-[10px] text-amber-600">
                                            <AlertCircle size={12} />
                                            <span className="font-black uppercase tracking-widest">Mapped but library price not loaded</span>
                                          </div>
                                          <button 
                                            onClick={() => {
                                              window.dispatchEvent(new Event('company_materials_updated'));
                                            }}
                                            className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-[8px] text-amber-700 uppercase font-black rounded transition-colors"
                                          >
                                            Reload
                                          </button>
                                        </div>
                                      ) : mat ? (
                                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-600">
                                          <CheckCircle2 size={12} />
                                          <span className="font-black uppercase tracking-widest">Matched: {mat.name}</span>
                                          <button 
                                            onClick={(e) => {
                                              e.preventDefault();
                                              mapMaterialToItem(selectedQuote.id, item.id, '');
                                            }}
                                            className="ml-2 px-2 py-0.5 bg-american-blue/5 hover:bg-american-red/10 text-[8px] text-[#999999] hover:text-american-red uppercase font-black rounded transition-colors"
                                          >
                                            Unlink
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-2">
                                          <div className="flex items-center gap-1.5 text-[10px] text-american-red">
                                            <AlertCircle size={12} />
                                            <span className="font-black uppercase tracking-widest">Unlinked</span>
                                          </div>
                                          <SearchableSelect 
                                            options={materials.map(m => ({ value: m.id, label: m.name }))}
                                            onSelect={(value) => mapMaterialToItem(selectedQuote.id, item.id, value)}
                                            placeholder="Link to Library..."
                                          />
                                        </div>
                                      )}

                                      {/* Debug / admin view */}
                                      <div className="mt-2 pt-2 border-t border-dashed border-[#EEEEEE] text-[9px] text-[#A0A0A0] space-y-0.5 font-mono bg-[#FAFAFA] p-2 rounded">
                                        <p><span className="font-bold uppercase tracking-wider text-american-blue">DEBUG DETAILS</span></p>
                                        <p>Item Name: {item.materialName}</p>
                                        <p>Supplier Part Number: {item.partNumber || 'None'}</p>
                                        <p>Mapped Material ID: {item.mappedMaterialId || 'None'}</p>
                                        <p>Mapped Material Name: {item.mappedMaterialName || (mat ? mat.name : 'None')}</p>
                                        <p>Library Price Found: {mat ? formatCurrency(mat.cost) : 'N/A'}</p>
                                        <p>Supplier Price: {formatCurrency(item.unitPrice)}</p>
                                        <p>Can Sync: {mat && Math.abs(item.unitPrice - mat.cost) > 0.001 ? 'TRUE' : 'FALSE'}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-5 text-center">
                                    <span className="px-3 py-1 bg-[#F5F5F7] rounded-full text-xs">{item.qty} {item.unit}</span>
                                  </td>
                                  <td className="px-6 py-5 text-right">
                                    <div className="space-y-1">
                                      <p className="font-black">{formatCurrency(item.unitPrice)}</p>
                                      {mat && (
                                        <>
                                          <p className={cn(
                                            "text-[10px] uppercase font-black tracking-widest",
                                            isHigher ? "text-american-red" : isLower ? "text-emerald-500" : "text-[#999999]"
                                          )}>
                                            Library: {formatCurrency(mat.cost)}
                                          </p>
                                          <p className={cn(
                                            "text-[9px] font-bold uppercase",
                                            isHigher ? "text-american-red" : isLower ? "text-emerald-500" : "text-gray-400"
                                          )}>
                                            Diff: {item.unitPrice > mat.cost ? '+' : ''}{formatCurrency(item.unitPrice - mat.cost)}
                                          </p>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-5 text-right">
                                    {mat && isDifferent ? (
                                      <button 
                                        onClick={() => updateMaterialPrice(mat.id, item.unitPrice)}
                                        className="flex items-center gap-2 ml-auto px-4 py-2 bg-american-blue text-white hover:bg-american-blue/90 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95"
                                      >
                                        <TrendingUp size={12} />
                                        {mat.lastPriceUpdate ? 'Update Library' : 'Confirm Price'}
                                      </button>
                                    ) : mat ? (
                                      <div className="flex items-center justify-end gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-600">
                                        <CheckCircle2 size={12} />
                                        Price Synchronized
                                      </div>
                                    ) : null}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="bg-[#F8F9FA] p-8 border-t-2 border-[#EEEEEE] flex justify-between items-center">
                      <p className="text-xs font-black text-[#999999] uppercase tracking-widest">Total Volume Analyzed</p>
                      <p className="text-3xl font-black text-american-blue">{formatCurrency(selectedQuote.totalAmount)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-[40px] border-4 border-dashed border-[#F0F0F0] p-32 flex flex-col items-center justify-center text-center space-y-6">
                    <div className="h-24 w-24 rounded-full bg-[#FBFBFB] flex items-center justify-center text-[#E0E0E0]">
                      <Scale size={48} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-american-blue uppercase tracking-tight">Market Intel Hub</h3>
                      <p className="text-sm font-bold text-[#999999] mt-2">Select or upload a quote to begin analyzing market standard rates.</p>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : activeView === 'compare' ? (
              <motion.div
                key="compare"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-[40px] shadow-xl border-2 border-american-blue/5 p-8">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 pb-8 border-b-2 border-[#F5F5F7]">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-american-red text-white flex items-center justify-center shadow-lg">
                        <Scale size={24} />
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-american-blue tracking-tight uppercase">Cross-Supplier Comparison</h2>
                        <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Side-by-Side Market Analysis</p>
                      </div>
                    </div>
                    <div className="relative w-full md:w-80">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-american-blue/40" size={18} />
                      <input 
                        type="text" 
                        placeholder="Search materials to compare..." 
                        value={compareSearch} 
                        onChange={(e) => setCompareSearch(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-[#F5F5F7] border-2 border-transparent focus:border-american-blue/20 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-american-blue/5 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-8">
                    {compareData.filter(item => 
                      !compareSearch || item.materialName.toLowerCase().includes(compareSearch.toLowerCase())
                    ).length === 0 ? (
                      <div className="py-20 text-center">
                        <p className="text-sm font-bold text-[#999999] uppercase tracking-widest">
                          {compareSearch ? "No matching materials found in comparison" : "Upload quotes with matching materials to compare"}
                        </p>
                      </div>
                    ) : (
                      compareData.filter(item => 
                        !compareSearch || item.materialName.toLowerCase().includes(compareSearch.toLowerCase())
                      ).map((item) => (
                        <div key={item.id} className="space-y-4">
                          <div className="flex justify-between items-end">
                            <h4 className="text-sm font-black text-american-blue uppercase tracking-tight">{item.materialName}</h4>
                            <div className="text-[10px] font-black uppercase tracking-widest text-[#999999]">
                              Spread: <span className="text-american-red">{formatCurrency(item.maxPrice - item.minPrice)}</span>
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                            {item.suppliers.map((s, idx) => {
                              const isLowest = s.price === item.minPrice;
                              const isHighest = s.price === item.maxPrice;
                              
                              return (
                                <div 
                                  key={idx}
                                  className={cn(
                                    "p-5 rounded-[24px] border-2 transition-all relative overflow-hidden",
                                    isLowest ? "bg-emerald-50 border-emerald-500/30" : 
                                    isHighest ? "bg-red-50 border-american-red/30" : 
                                    "bg-[#FBFBFB] border-transparent"
                                  )}
                                >
                                  {isLowest && (
                                    <div className="absolute top-0 right-0 px-3 py-1 bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest rounded-bl-xl shadow-sm">
                                      Best Value
                                    </div>
                                  )}
                                  {isHighest && (
                                    <div className="absolute top-0 right-0 px-3 py-1 bg-american-red text-white text-[8px] font-black uppercase tracking-widest rounded-bl-xl shadow-sm">
                                      Highest
                                    </div>
                                  )}
                                  <div className="flex justify-between items-start mb-1">
                                    <p className="text-[10px] font-black text-[#999999] uppercase tracking-[0.2em]">{s.supplierName}</p>
                                    <div className="flex items-center gap-2">
                                      {s.fileUrl && (
                                        <a 
                                          href={s.fileUrl} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="text-[8px] font-black text-emerald-600 hover:text-american-blue transition-colors uppercase tracking-widest flex items-center gap-1"
                                          title="View Original Quote"
                                        >
                                          <ExternalLink size={8} />
                                          View Quote
                                        </a>
                                      )}
                                      <button 
                                        onClick={() => updateMaterialPrice(item.id, s.price)}
                                        className="text-[8px] font-black text-american-blue hover:text-american-red transition-colors uppercase tracking-widest"
                                      >
                                        Use Price
                                      </button>
                                    </div>
                                  </div>
                                  <p className={cn(
                                    "text-xl font-black",
                                    isLowest ? "text-emerald-600" : isHighest ? "text-american-red" : "text-american-blue"
                                  )}>
                                    {formatCurrency(s.price)}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-[40px] shadow-xl border-2 border-american-blue/5 p-8">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="h-12 w-12 rounded-2xl bg-american-blue text-white flex items-center justify-center shadow-lg">
                      <History size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-american-blue tracking-tight uppercase">Price Evolution Tracking</h2>
                      <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">Historical Price Points by Material</p>
                    </div>
                  </div>
                  
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-10">
                    <div className="md:col-span-1 lg:col-span-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 mb-2 block ml-1">Filter by Supplier</label>
                      <select 
                        value={selectedHistorySupplier || ''}
                        onChange={(e) => setSelectedHistorySupplier(e.target.value)}
                        className="w-full px-4 py-4 bg-[#F5F5F7] border-2 border-transparent focus:border-american-blue/20 rounded-[20px] text-sm font-bold focus:ring-4 focus:ring-american-blue/5 transition-all outline-none"
                      >
                        <option value="">All Suppliers</option>
                        {Array.from(new Set(quotes.map(q => q.supplierName))).map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-1 lg:col-span-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-american-blue/60 mb-2 block ml-1">Search Material History</label>
                      <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-american-blue/40">
                          <History size={20} />
                        </div>
                        <input 
                          type="text" 
                          placeholder="Type material name (e.g. 'Cedar Picket', 'Post', 'Rail')..." 
                          value={selectedHistoryMaterialId || ''} 
                          onChange={(e) => setSelectedHistoryMaterialId(e.target.value)}
                          className="w-full pl-12 pr-4 py-4 bg-[#F5F5F7] border-2 border-transparent focus:border-american-blue/20 rounded-[20px] text-sm font-bold focus:ring-4 focus:ring-american-blue/5 transition-all outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {historyData.filter(h => 
                    (!selectedHistoryMaterialId || h.materialName.toLowerCase().includes(selectedHistoryMaterialId.toLowerCase())) &&
                    (!selectedHistorySupplier || h.entries.some(e => e.supplierName === selectedHistorySupplier))
                  ).length === 0 ? (
                    <div className="py-20 text-center">
                      <p className="text-sm font-bold text-[#999999] uppercase tracking-widest">
                        {selectedHistoryMaterialId ? "No matching materials found" : "No historical data available. Map your quote items to build history."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-12">
                      {historyData.filter(h => 
                        !selectedHistoryMaterialId || h.materialName.toLowerCase().includes(selectedHistoryMaterialId.toLowerCase())
                      ).map((material) => (
                        <div key={material.id} className="space-y-6">
                          <div className="flex items-center justify-between border-b border-[#F5F5F7] pb-4">
                            <h3 className="text-sm font-black text-american-blue uppercase tracking-tight">{material.materialName}</h3>
                            <span className="text-[10px] font-bold text-[#999999] uppercase tracking-widest bg-[#F5F5F7] px-3 py-1 rounded-full">
                              {material.entries.length} Price Points
                            </span>
                          </div>
                          
                          <div className="grid gap-4">
                            {material.entries.map((entry, idx) => {
                              const isNewest = idx === 0;
                              return (
                                <div key={`${entry.type === 'snapshot' ? entry.snapshotId : entry.quoteId}-${idx}`} className={cn(
                                  "flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 rounded-3xl border-2 transition-all",
                                  isNewest ? "bg-american-blue/5 border-american-blue/10" : "bg-white border-[#F8F9FA]"
                                )}>
                                  <div className="flex items-center gap-4">
                                    <div className={cn(
                                      "h-10 w-10 rounded-xl flex items-center justify-center",
                                      isNewest ? "bg-american-blue text-white" : "bg-[#F5F5F7] text-american-blue"
                                    )}>
                                      {entry.type === 'snapshot' ? <History size={18} /> : <FileText size={18} />}
                                    </div>
                                    <div>
                                      <p className="text-sm font-black text-american-blue">{entry.supplierName}</p>
                                      <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest flex items-center gap-2">
                                        {new Date(entry.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                                        <span className={cn(
                                          "px-1.5 py-0.5 rounded text-[8px] font-black",
                                          entry.type === 'snapshot' ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                                        )}>
                                          {entry.type.toUpperCase()}
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-6 mt-4 sm:mt-0 w-full sm:w-auto justify-between sm:justify-end">
                                    <div className="text-right">
                                      <p className="text-xl font-black text-american-blue">{formatCurrency(entry.price)}</p>
                                      {isNewest && <p className="text-[9px] font-black text-american-blue uppercase tracking-widest">Current/Newest</p>}
                                    </div>
                                    <div className="flex gap-2">
                                      <button 
                                        onClick={() => { 
                                          if (entry.type === 'snapshot') {
                                            const snap = snapshots.find(s => s.id === entry.snapshotId);
                                            if (snap) setReviewSnapshot(snap);
                                          } else {
                                            setSelectedQuoteId(entry.quoteId!); 
                                            setActiveView('list'); 
                                          }
                                        }}
                                        className="p-2 bg-white text-american-blue border border-[#E5E5E5] rounded-xl hover:bg-american-blue hover:text-white hover:border-american-blue transition-all shadow-sm"
                                        title={entry.type === 'snapshot' ? "Review Snapshot" : "View Original Quote"}
                                      >
                                        <Search size={14} />
                                      </button>
                                      <button 
                                        onClick={() => updateMaterialPrice(material.id, entry.price)}
                                        className="px-4 py-2 bg-american-blue text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-american-red transition-all"
                                      >
                                        Use This Price
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Merge Suppliers Modal Overlay */}
          <AnimatePresence>
            {showMergeModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-american-blue/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-american-blue/10 animate-in zoom-in-95 duration-200">
                  {/* Header */}
                  <div className="p-6 bg-american-blue text-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center">
                        <GitMerge size={20} />
                      </div>
                      <div>
                        <h3 className="text-lg font-black uppercase tracking-tight">Combine / Merge Suppliers</h3>
                        <p className="text-[10px] font-bold text-white/70 tracking-wider uppercase">Unify multi-quote nomenclature</p>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        setShowMergeModal(false);
                        setSourceSupplier("");
                        setDestinationSupplier("");
                        setCustomDestination("");
                      }}
                      className="h-8 w-8 rounded-lg hover:bg-white/15 flex items-center justify-center transition-colors text-white"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Content */}
                  <div className="p-8 space-y-6 text-left">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[#888888]">Supplier to Merge (Source)</label>
                      <p className="text-xs text-[#666666] leading-relaxed">
                        All quotes currently matching this supplier will be renamed.
                      </p>
                      <div className="relative">
                        <select
                          value={sourceSupplier}
                          onChange={(e) => setSourceSupplier(e.target.value)}
                          className="w-full px-4 py-3 bg-[#FAF9F6] border-2 border-[#E5E5E5] rounded-2xl text-sm font-bold text-american-blue focus:border-american-blue outline-none transition-all appearance-none cursor-pointer"
                        >
                          <option value="">-- Select Source Supplier --</option>
                          {uniqueSuppliers.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#999999]">
                          <ChevronDown size={16} />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-[#888888]">Target Destination Supplier</label>
                      <p className="text-xs text-[#666666] leading-relaxed">
                        Select an existing supplier to merge into or add a new clean name.
                      </p>
                      <div className="relative">
                        <select
                          value={destinationSupplier}
                          onChange={(e) => setDestinationSupplier(e.target.value)}
                          className="w-full px-4 py-3 bg-[#FAF9F6] border-2 border-[#E5E5E5] rounded-2xl text-sm font-bold text-american-blue focus:border-american-blue outline-none transition-all appearance-none cursor-pointer"
                        >
                          <option value="">-- Select Target --</option>
                          {uniqueSuppliers.filter(s => s !== sourceSupplier).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                          <option value="__custom__">+ Enter A Custom Clean Name...</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[#999999]">
                          <ChevronDown size={16} />
                        </div>
                      </div>
                    </div>

                    {destinationSupplier === "__custom__" && (
                      <div className="space-y-2 animate-in slide-in-from-top-4 duration-200">
                        <label className="text-[10px] font-black uppercase tracking-widest text-[#888888]">New Clean Supplier Name</label>
                        <input
                          type="text"
                          value={customDestination}
                          onChange={(e) => setCustomDestination(e.target.value)}
                          placeholder="e.g. Forney Fence"
                          className="w-full px-4 py-3 border-2 border-[#E5E5E5] rounded-2xl text-sm font-bold text-american-blue outline-none focus:border-american-blue focus:ring-0"
                        />
                      </div>
                    )}

                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100/60 text-xs text-amber-800 leading-relaxed font-medium">
                      <strong>Warning:</strong> This will batch-update all quote files, comparisons, and logs linked to the source supplier to use the updated name. This action is irreversible.
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="p-6 bg-[#FBFBFB] border-t border-[#EEEEEE] flex justify-end gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setShowMergeModal(false);
                        setSourceSupplier("");
                        setDestinationSupplier("");
                        setCustomDestination("");
                      }}
                      className="px-6 py-2.5 rounded-xl border border-[#E5E5E5] text-xs font-black uppercase tracking-widest text-[#777777] hover:bg-gray-50 transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button 
                      type="button"
                      onClick={handleMergeSuppliers}
                      disabled={!sourceSupplier || (!destinationSupplier && destinationSupplier !== "__custom__") || (destinationSupplier === "__custom__" && !customDestination)}
                      className="px-6 py-2.5 rounded-xl bg-american-blue text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-american-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                    >
                      Merge & Combine
                    </button>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
