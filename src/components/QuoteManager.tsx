import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, FileText, Trash2, TrendingUp, AlertCircle, 
  CheckCircle2, Loader2, ChevronRight, Scale, ExternalLink,
  Plus, History, DollarSign, Search, ChevronDown
} from 'lucide-react';
import { SupplierQuote, QuoteItem, MaterialItem } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { analyzeQuoteDocument } from '../services/geminiService';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, updateDoc, deleteDoc, doc, setDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { User } from 'firebase/auth';

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
  user: User | null;
}

export default function QuoteManager({ materials, setMaterials, quotes, setQuotes, user }: QuoteManagerProps) {
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeView, setActiveView] = React.useState<'list' | 'compare' | 'history'>('list');
  const [selectedQuoteId, setSelectedQuoteId] = React.useState<string | null>(null);
  const [selectedHistoryMaterialId, setSelectedHistoryMaterialId] = React.useState<string | null>(null);
  const [selectedHistorySupplier, setSelectedHistorySupplier] = React.useState<string | null>(null);
  const [compareSearch, setCompareSearch] = React.useState("");
  const [toast, setToast] = React.useState<string | null>(null);

  const selectedQuote = React.useMemo(() => 
    quotes.find(q => q.id === selectedQuoteId) || null
  , [quotes, selectedQuoteId]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const syncAllPrices = async () => {
    if (!selectedQuote) return;
    const itemsToUpdate = selectedQuote.items.filter(item => {
      const mat = materials.find(m => m.id === item.mappedMaterialId);
      return mat && Math.abs(item.unitPrice - mat.cost) > 0.001;
    });

    if (itemsToUpdate.length === 0) {
      showToast("All matched prices are already in sync");
      return;
    }

    if (user) {
      try {
        const batch = writeBatch(db);
        itemsToUpdate.forEach(item => {
          const mat = materials.find(m => m.id === item.mappedMaterialId);
          if (mat) {
            batch.update(doc(db, 'materials', mat.id), { cost: item.unitPrice });
          }
        });
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'materials/bulk-sync');
        return;
      }
    } else {
      setMaterials(prev => prev.map(m => {
        const update = itemsToUpdate.find(i => i.mappedMaterialId === m.id);
        return update ? { ...m, cost: update.unitPrice } : m;
      }));
    }
    showToast(`Synchronized ${itemsToUpdate.length} prices from quote`);
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
      // 1. Upload to Firebase Storage
      const storageRef = ref(storage, `quotes/${user.uid}/${Date.now()}-${file.name}`);
      const uploadResult = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(uploadResult.ref);

      // 2. Convert file to base64 for Gemini
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      // 3. Extract data with Gemini
      const extractedData = await analyzeQuoteDocument(base64Data, file.type);

      const newQuoteId = Math.random().toString(36).substr(2, 9);
      const newQuote: SupplierQuote = {
        id: newQuoteId,
        companyId: 'lonestarfence',
        supplierName: extractedData.supplierName || 'Unknown Supplier',
        date: new Date().toISOString(),
        items: extractedData.items.map((item: any) => {
          const itemNameLower = item.materialName.toLowerCase();
          const match = materials.find(m => 
            m.name.toLowerCase().includes(itemNameLower) ||
            itemNameLower.includes(m.name.toLowerCase()) ||
            m.aliases?.some(alias => alias.toLowerCase() === itemNameLower)
          );
          return {
            ...item,
            id: Math.random().toString(36).substr(2, 9),
            // Ensure no undefined values for Firestore
            mappedMaterialId: match?.id || null
          };
        }),
        totalAmount: extractedData.totalAmount || 0,
        fileName: file.name,
        fileType: file.type,
        fileUrl: downloadUrl
      };

      // 4. Save to Firestore
      // Sanitize object to remove any potential undefined values
      const sanitizedQuote = JSON.parse(JSON.stringify(newQuote));
      await setDoc(doc(db, 'quotes', newQuoteId), sanitizedQuote);
      setSelectedQuoteId(newQuoteId);
      showToast("Quote processed and saved to cloud");
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
      await deleteDoc(doc(db, 'quotes', id));
      if (selectedQuoteId === id) setSelectedQuoteId(null);
      showToast("Quote deleted from cloud");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `quotes/${id}`);
    }
  };

  const updateMaterialPrice = async (materialId: string, newPrice: number) => {
    const mat = materials.find(m => m.id === materialId);
    if (user) {
      try {
        await updateDoc(doc(db, 'materials', materialId), { cost: newPrice });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `materials/${materialId}`);
        return;
      }
    } else {
      setMaterials(prev => prev.map(m => 
        m.id === materialId ? { ...m, cost: newPrice } : m
      ));
    }
    showToast(`Updated ${mat?.name || 'Material'} price to ${formatCurrency(newPrice)}`);
  };

  const mapMaterialToItem = async (quoteId: string, itemId: string, materialId: string) => {
    if (!user) return;

    // Save the mapping for future memory
    if (materialId) {
      const quote = quotes.find(q => q.id === quoteId);
      const item = quote?.items.find(i => i.id === itemId);
      
      if (item) {
        const mat = materials.find(m => m.id === materialId);
        if (mat) {
          const currentAliases = mat.aliases || [];
          if (!currentAliases.includes(item.materialName)) {
            const nextAliases = [...currentAliases, item.materialName];
            if (user) {
              updateDoc(doc(db, 'materials', materialId), { aliases: nextAliases }).catch(err => {
                handleFirestoreError(err, OperationType.UPDATE, `materials/${materialId}`);
              });
            } else {
              setMaterials(prev => prev.map(m => {
                if (m.id === materialId) {
                  return { ...m, aliases: nextAliases };
                }
                return m;
              }));
            }
          }
        }
        showToast(`Learned mapping: ${item.materialName} → ${materials.find(m => m.id === materialId)?.name}`);
      }
    }

    try {
      const quote = quotes.find(q => q.id === quoteId);
      if (!quote) return;

      const updatedItems = quote.items.map(item => 
        item.id === itemId ? { ...item, mappedMaterialId: materialId } : item
      );

      await updateDoc(doc(db, 'quotes', quoteId), {
        items: updatedItems
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `quotes/${quoteId}`);
    }
  };

  // Comparison Logic: Group by mapped materials
  const compareData = React.useMemo(() => {
    const comparison: Record<string, { materialName: string, suppliers: { supplierName: string, price: number, quoteId: string }[] }> = {};

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
          comparison[item.mappedMaterialId].suppliers.push({
            supplierName: quote.supplierName,
            price: item.unitPrice,
            quoteId: quote.id
          });
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
    const history: Record<string, { materialName: string, entries: { supplierName: string, price: number, date: string, quoteId: string }[] }> = {};

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
          history[item.mappedMaterialId].entries.push({
            supplierName: quote.supplierName,
            price: item.unitPrice,
            date: quote.date,
            quoteId: quote.id
          });
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
  }, [quotes, materials]);

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
                              const isDifferent = mat && Math.abs(item.unitPrice - mat.cost) > 0.001;

                              return (
                                <tr key={item.id} className="text-sm font-bold text-american-blue hover:bg-[#FBFBFB] transition-colors">
                                  <td className="px-6 py-5">
                                    <div className="space-y-1">
                                      <p>{item.materialName}</p>
                                      {mat ? (
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
                                    </div>
                                  </td>
                                  <td className="px-6 py-5 text-center">
                                    <span className="px-3 py-1 bg-[#F5F5F7] rounded-full text-xs">{item.qty} {item.unit}</span>
                                  </td>
                                  <td className="px-6 py-5 text-right">
                                    <div className="space-y-1">
                                      <p className="font-black">{formatCurrency(item.unitPrice)}</p>
                                      {mat && (
                                        <p className={cn(
                                          "text-[10px] uppercase font-black tracking-widest",
                                          isHigher ? "text-american-red" : isLower ? "text-emerald-500" : "text-[#999999]"
                                        )}>
                                          Library: {formatCurrency(mat.cost)}
                                        </p>
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
                                        Update Library
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
                                    <button 
                                      onClick={() => updateMaterialPrice(item.id, s.price)}
                                      className="text-[8px] font-black text-american-blue hover:text-american-red transition-colors uppercase tracking-widest"
                                    >
                                      Use Price
                                    </button>
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
                                <div key={`${entry.quoteId}-${idx}`} className={cn(
                                  "flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 rounded-3xl border-2 transition-all",
                                  isNewest ? "bg-american-blue/5 border-american-blue/10" : "bg-white border-[#F8F9FA]"
                                )}>
                                  <div className="flex items-center gap-4">
                                    <div className={cn(
                                      "h-10 w-10 rounded-xl flex items-center justify-center",
                                      isNewest ? "bg-american-blue text-white" : "bg-[#F5F5F7] text-american-blue"
                                    )}>
                                      <DollarSign size={18} />
                                    </div>
                                    <div>
                                      <p className="text-sm font-black text-american-blue">{entry.supplierName}</p>
                                      <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">
                                        {new Date(entry.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
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
                                        onClick={() => { setSelectedQuoteId(entry.quoteId); setActiveView('list'); }}
                                        className="p-2 bg-white text-american-blue border border-[#E5E5E5] rounded-xl hover:bg-american-blue hover:text-white hover:border-american-blue transition-all shadow-sm"
                                        title="View Original Quote"
                                      >
                                        <ExternalLink size={14} />
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
        </div>
      </div>
    </div>
  );
}
