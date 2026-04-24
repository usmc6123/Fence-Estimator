import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, FileText, Trash2, TrendingUp, AlertCircle, 
  CheckCircle2, Loader2, ChevronRight, Scale, ExternalLink,
  Plus, History, DollarSign
} from 'lucide-react';
import { SupplierQuote, QuoteItem, MaterialItem } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { analyzeQuoteDocument } from '../services/geminiService';

interface QuoteManagerProps {
  materials: MaterialItem[];
  setMaterials: React.Dispatch<React.SetStateAction<MaterialItem[]>>;
  quotes: SupplierQuote[];
  setQuotes: React.Dispatch<React.SetStateAction<SupplierQuote[]>>;
}

export default function QuoteManager({ materials, setMaterials, quotes, setQuotes }: QuoteManagerProps) {
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeView, setActiveView] = React.useState<'list' | 'compare'>('list');
  const [selectedQuoteId, setSelectedQuoteId] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);

  const selectedQuote = React.useMemo(() => 
    quotes.find(q => q.id === selectedQuoteId) || null
  , [quotes, selectedQuoteId]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const syncAllPrices = () => {
    if (!selectedQuote) return;
    const itemsToUpdate = selectedQuote.items.filter(item => {
      const mat = materials.find(m => m.id === item.mappedMaterialId);
      return mat && Math.abs(item.unitPrice - mat.cost) > 0.001;
    });

    if (itemsToUpdate.length === 0) {
      showToast("All matched prices are already in sync");
      return;
    }

    setMaterials(prev => prev.map(m => {
      const update = itemsToUpdate.find(i => i.mappedMaterialId === m.id);
      return update ? { ...m, cost: update.unitPrice } : m;
    }));
    showToast(`Synchronized ${itemsToUpdate.length} prices from quote`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      // Extract data with Gemini
      const extractedData = await analyzeQuoteDocument(base64Data, file.type);

      const newQuote: SupplierQuote = {
        id: Math.random().toString(36).substr(2, 9),
        supplierName: extractedData.supplierName,
        date: new Date().toISOString(),
        items: extractedData.items.map((item: any) => {
          const itemNameLower = item.materialName.toLowerCase();
          return {
            ...item,
            id: Math.random().toString(36).substr(2, 9),
            // Improved fuzzy matching + alias lookup
            mappedMaterialId: materials.find(m => 
              m.name.toLowerCase().includes(itemNameLower) ||
              itemNameLower.includes(m.name.toLowerCase()) ||
              m.aliases?.some(alias => alias.toLowerCase() === itemNameLower)
            )?.id
          };
        }),
        totalAmount: extractedData.totalAmount,
        fileName: file.name,
        fileType: file.type,
        fileUrl: URL.createObjectURL(file) // Local preview
      };

      setQuotes([newQuote, ...quotes]);
      setSelectedQuoteId(newQuote.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process quote");
    } finally {
      setIsUploading(false);
    }
  };

  const deleteQuote = (id: string) => {
    setQuotes(quotes.filter(q => q.id !== id));
    if (selectedQuoteId === id) setSelectedQuoteId(null);
  };

  const updateMaterialPrice = (materialId: string, newPrice: number) => {
    const mat = materials.find(m => m.id === materialId);
    setMaterials(prev => prev.map(m => 
      m.id === materialId ? { ...m, cost: newPrice } : m
    ));
    showToast(`Updated ${mat?.name || 'Material'} price to ${formatCurrency(newPrice)}`);
  };

  const mapMaterialToItem = (quoteId: string, itemId: string, materialId: string) => {
    // Save the mapping for future memory
    if (materialId) {
      const quote = quotes.find(q => q.id === quoteId);
      const item = quote?.items.find(i => i.id === itemId);
      
      if (item) {
        setMaterials(prev => prev.map(m => {
          if (m.id === materialId) {
            const currentAliases = m.aliases || [];
            if (!currentAliases.includes(item.materialName)) {
              return { ...m, aliases: [...currentAliases, item.materialName] };
            }
          }
          return m;
        }));
        showToast(`Learned mapping: ${item.materialName} → ${materials.find(m => m.id === materialId)?.name}`);
      }
    }

    setQuotes(prev => prev.map(q => {
      if (q.id === quoteId) {
        return {
          ...q,
          items: q.items.map(item => 
            item.id === itemId ? { ...item, mappedMaterialId: materialId } : item
          )
        };
      }
      return q;
    }));
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
                                            onClick={() => mapMaterialToItem(selectedQuote.id, item.id, '')}
                                            className="ml-2 text-[8px] text-[#999999] hover:text-american-red uppercase font-black"
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
                                          <select 
                                            onChange={(e) => mapMaterialToItem(selectedQuote.id, item.id, e.target.value)}
                                            className="text-[10px] bg-[#F5F5F7] border-none rounded-md px-2 py-1 font-bold focus:ring-1 focus:ring-american-blue"
                                            value=""
                                          >
                                            <option value="" disabled>Link to Library...</option>
                                            {materials.map(m => (
                                              <option key={m.id} value={m.id}>{m.name}</option>
                                            ))}
                                          </select>
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
            ) : (
              <motion.div
                key="compare"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-[40px] shadow-xl border-2 border-american-blue/5 p-8">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="h-12 w-12 rounded-2xl bg-american-red text-white flex items-center justify-center shadow-lg">
                      <Scale size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-american-blue tracking-tight uppercase">Cross-Supplier Comparison</h2>
                      <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Side-by-Side Market Analysis</p>
                    </div>
                  </div>

                  <div className="space-y-8">
                    {compareData.length === 0 ? (
                      <div className="py-20 text-center">
                        <p className="text-sm font-bold text-[#999999] uppercase tracking-widest">Upload quotes with matching materials to compare</p>
                      </div>
                    ) : (
                      compareData.map((item) => (
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
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
