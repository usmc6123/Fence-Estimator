import React from 'react';
import { 
  Printer, Eye, EyeOff, FileText, ChevronDown, ChevronRight, 
  Package, Hammer, Trash2, Settings as SettingsIcon, ExternalLink,
  Plus, Search, X
} from 'lucide-react';
import { Estimate, MaterialItem, LaborRates, SupplierQuote } from '../types';
import { calculateDetailedTakeOff, DetailedTakeOff, RunTakeOff, TakeOffItem } from '../lib/calculations';
import { cn, formatCurrency } from '../lib/utils';
import { COMPANY_INFO } from '../constants';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

interface MaterialTakeOffProps {
  estimate: Partial<Estimate>;
  materials: MaterialItem[];
  laborRates: LaborRates;
  quotes: SupplierQuote[];
  setEstimate: (estimate: Partial<Estimate>) => void;
  setMaterials: React.Dispatch<React.SetStateAction<MaterialItem[]>>;
  user: User | null;
}

export default function MaterialTakeOff({ estimate, materials, laborRates, quotes, setEstimate, setMaterials, user }: MaterialTakeOffProps) {
  const [showPrices, setShowPrices] = React.useState(true);
  const [showAddManual, setShowAddManual] = React.useState(false);
  const [editingGate, setEditingGate] = React.useState<{ runIndex: number, gateIndex: number, gateId: string } | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  
  const pricingStrategy = estimate.pricingStrategy || 'best';
  const selectedSupplier = estimate.selectedSupplier || '';

  const setPricingStrategy = (strategy: 'best' | 'supplier') => {
    setEstimate({ ...estimate, pricingStrategy: strategy });
  };

  const setSelectedSupplier = (supplier: string) => {
    setEstimate({ ...estimate, selectedSupplier: supplier });
  };
  
  const [newItem, setNewItem] = React.useState({
    name: '',
    unit: 'each',
    cost: '',
    qty: '1',
    category: 'Hardware'
  });

  // Unique suppliers from quotes
  const uniqueSuppliers = React.useMemo(() => 
    Array.from(new Set(quotes.map(q => q.supplierName))).sort()
  , [quotes]);

  // Resolve materials based on chosen strategy
  const resolvedMaterials = React.useMemo(() => {
    if (pricingStrategy === 'best') {
      return materials.map(m => {
        let bestPrice = m.cost;
        let source = 'Library Price';

        // Check all quotes for this material to find lower prices
        quotes.forEach(quote => {
          const item = quote.items.find(i => i.mappedMaterialId === m.id);
          if (item && item.unitPrice > 0 && item.unitPrice < bestPrice) {
            bestPrice = item.unitPrice;
            source = quote.supplierName;
          }
        });

        return { ...m, cost: bestPrice, priceSource: source };
      });
    }

    if (!selectedSupplier) {
      return materials.map(m => ({ ...m, priceSource: 'Library Price' }));
    }

    const supplierQuotes = quotes
      .filter(q => q.supplierName === selectedSupplier)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return materials.map(m => {
      let quotedPrice: number | undefined;
      let source = 'Library Price';
      
      for (const quote of supplierQuotes) {
        const item = quote.items.find(i => i.mappedMaterialId === m.id);
        if (item) {
          quotedPrice = item.unitPrice;
          source = quote.supplierName;
          break;
        }
      }

      if (quotedPrice !== undefined) {
        return { ...m, cost: quotedPrice, priceSource: source };
      }
      return { ...m, priceSource: 'Library Price' };
    });
  }, [materials, quotes, pricingStrategy, selectedSupplier]);

  const data: DetailedTakeOff = calculateDetailedTakeOff(estimate, resolvedMaterials, laborRates);

  const handleUpdateGateItems = (runIndex: number, gateIndex: number, newItems: any[]) => {
    const newRuns = [...(estimate.runs || [])];
    if (newRuns[runIndex] && newRuns[runIndex].gateDetails) {
      newRuns[runIndex].gateDetails![gateIndex].customItems = newItems;
      setEstimate({ ...estimate, runs: newRuns });
    }
  };

  const handleResetGateItems = (runIndex: number, gateIndex: number) => {
    const newRuns = [...(estimate.runs || [])];
    if (newRuns[runIndex] && newRuns[runIndex].gateDetails) {
      const updatedGate = { ...newRuns[runIndex].gateDetails![gateIndex] };
      delete updatedGate.customItems;
      newRuns[runIndex].gateDetails![gateIndex] = updatedGate;
      setEstimate({ ...estimate, runs: newRuns });
    }
  };
  const [expandedRuns, setExpandedRuns] = React.useState<Record<string, boolean>>(
    data.runs.reduce((acc, run) => ({ ...acc, [run.runId]: true }), {})
  );

  const toggleRun = (id: string) => {
    setExpandedRuns(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePrint = () => {
    window.print();
  };

  const handleOpenNewTab = () => {
    // Collect all relevant state for bridging
    const stateToBridge = {
      estimate,
      activeTab: 'takeoff',
      materials,
      laborRates,
      quotes
    };
    
    // Encode state into hash
    const hashState = encodeURIComponent(JSON.stringify(stateToBridge));
    const url = new URL(window.location.href);
    url.hash = `state=${hashState}`;
    
    window.open(url.toString(), '_blank');
  };

  const handleAddManualItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name || !newItem.cost || !newItem.qty) return;

    const existingMaterial = materials.find(m => m.name.toLowerCase() === newItem.name.toLowerCase());
    
    let targetId: string;
    const cost = parseFloat(newItem.cost);
    const qty = parseFloat(newItem.qty);

    if (existingMaterial) {
      targetId = existingMaterial.id;
    } else {
      targetId = `manual-${Date.now()}`;
      const newMaterial: MaterialItem = {
        id: targetId,
        name: newItem.name,
        unit: newItem.unit as any,
        cost: cost,
        category: newItem.category as any,
        description: 'Manually added to take-off',
        companyId: 'lonestarfence',
        lastPriceUpdate: new Date().toISOString()
      } as MaterialItem;
      
      if (user) {
        setDoc(doc(db, 'materials', targetId), newMaterial).catch(err => {
          handleFirestoreError(err, OperationType.WRITE, `materials/${targetId}`);
        });
      } else {
        setMaterials(prev => [...prev, newMaterial]);
      }
    }

    // Prepare update
    const newManualQuantities = { ...(estimate.manualQuantities || {}) };
    const newManualPrices = { ...(estimate.manualPrices || {}) };

    const addItemToDossier = (mid: string, q: number, p?: number) => {
      newManualQuantities[mid] = (newManualQuantities[mid] || 0) + q;
      if (p !== undefined) newManualPrices[mid] = p;
    };

    // Add primary item
    addItemToDossier(targetId, qty, cost);

    // Assembly Logic
    const nameLower = newItem.name.toLowerCase();
    const idLower = targetId.toLowerCase();
    const isPost = nameLower.includes('post') || newItem.category === 'Structure' || newItem.category === 'Post';
    const isBracket = nameLower.includes('bracket') || nameLower.includes('hinge');

    if (isPost) {
      // Find related items in library
      // Determine if it's wood-style post (metal pipe for wood fence) vs metal fence post
      const isWoodStyle = idLower.startsWith('w-post') || nameLower.includes('wood') || (newItem.category === 'Post' && idLower.includes('metal-8'));
      
      // Use project defaults or fallback
      const targetCapId = estimate.topStyle === 'Flat Top' ? 'pc-flat' : 'pc-dome';
      const cap = materials.find(m => m.id === targetCapId) || materials.find(m => m.id === 'pc-dome');
      
      const concreteId = estimate.concreteType === 'Quickset' ? 'i-concrete-quickset' : 
                         (estimate.concreteType === 'Maximizer' ? 'i-concrete-maximizer' : 'i-concrete-80');
      const concrete = materials.find(m => m.id === concreteId) || materials.find(m => m.id === 'i-concrete-80');
      
      const bracketId = isWoodStyle ? 'h-bracket-w' : 'm-bracket';
      const bracket = materials.find(m => m.id === bracketId);
      
      const screwId = isWoodStyle ? 'h-lag-14' : 'm-screw-self-tap';
      const screw = materials.find(m => m.id === screwId);

      const skipHardware = !isWoodStyle && (estimate.ironInstallType === 'Weld up');

      if (cap) addItemToDossier(cap.id, qty);
      if (concrete) {
        const bagsPerPost = estimate.concreteType === 'Quickset' ? 2 : (estimate.concreteType === 'Maximizer' ? 0.7 : 0.7);
        addItemToDossier(concrete.id, Math.ceil(qty * bagsPerPost));
      }
      if (bracket && !skipHardware) addItemToDossier(bracket.id, qty * 4);
      if (screw && !skipHardware) addItemToDossier(screw.id, qty * 4);
    } else if (isBracket) {
      const isWoodBracket = idLower.includes('bracket-w') || idLower.includes('hinge-wood');
      const screwId = isWoodBracket ? 'h-lag-14' : 'm-screw-self-tap';
      const screw = materials.find(m => m.id === screwId);
      if (screw) addItemToDossier(screw.id, qty * 4); // 4 screws per bracket assumption
    }

    setEstimate({
      ...estimate,
      manualQuantities: newManualQuantities,
      manualPrices: newManualPrices
    });

    // Reset and close
    setNewItem({ name: '', unit: 'each', cost: '', qty: '1', category: 'Hardware' });
    setShowAddManual(false);
  };

  const removeItem = (id: string) => {
    const newManualQuantities = { ...(estimate.manualQuantities || {}) };
    delete newManualQuantities[id];
    setEstimate({
      ...estimate,
      manualQuantities: newManualQuantities
    });
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8 animate-in fade-in duration-700 takeoff-page print:max-w-none print:p-0 print:m-0 print:space-y-4">
      {/* Header Controls */}
      <div className="flex flex-col gap-6 bg-white p-6 rounded-[32px] shadow-xl border-2 border-american-blue/5 print:hidden">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-american-blue flex items-center justify-center text-white shadow-lg">
              <FileText size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black text-american-blue uppercase tracking-tight">Material Take-off</h1>
              <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Detailed Inventory & Logistics</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowPrices(!showPrices)}
              className="flex items-center gap-2 px-4 py-2 bg-[#F5F5F7] hover:bg-[#E5E5E7] rounded-xl text-xs font-black uppercase tracking-widest text-american-blue transition-colors"
            >
              {showPrices ? <EyeOff size={16} /> : <Eye size={16} />}
              {showPrices ? 'Hide Prices' : 'Show Prices'}
            </button>
            <button
              onClick={handleOpenNewTab}
              className="flex items-center gap-2 px-4 py-2 bg-[#F5F5F7] hover:bg-[#E5E5E7] rounded-xl text-xs font-black uppercase tracking-widest text-american-blue transition-colors"
              title="Open in new window for better printing"
            >
              <ExternalLink size={16} />
              New Window
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-6 py-2 bg-american-blue text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-american-blue/20 hover:scale-105 transition-transform active:scale-95"
            >
              <Printer size={16} />
              Print Take-off
            </button>
          </div>
        </div>

        {/* Pricing Strategy Selector */}
        <div className="pt-6 border-t-2 border-[#F5F5F7] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center p-1 bg-[#F5F5F7] rounded-2xl w-full md:w-auto">
            <button
              onClick={() => setPricingStrategy('best')}
              className={cn(
                "flex-1 md:flex-none px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                pricingStrategy === 'best' 
                  ? "bg-white text-american-blue shadow-md" 
                  : "text-[#999999] hover:text-american-blue"
              )}
            >
              Best Prices
            </button>
            <button
              onClick={() => {
                setPricingStrategy('supplier');
                if (!selectedSupplier && uniqueSuppliers.length > 0) {
                  setSelectedSupplier(uniqueSuppliers[0]);
                }
              }}
              className={cn(
                "flex-1 md:flex-none px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                pricingStrategy === 'supplier' 
                  ? "bg-white text-american-blue shadow-md" 
                  : "text-[#999999] hover:text-american-blue"
              )}
            >
              Single Supplier
            </button>
          </div>

          {pricingStrategy === 'supplier' && (
            <div className="flex items-center gap-3 w-full md:w-auto animate-in slide-in-from-right-4 duration-300">
              <label className="text-[10px] font-black uppercase tracking-widest text-american-red whitespace-nowrap">Select Supplier:</label>
              <select
                value={selectedSupplier}
                onChange={(e) => setSelectedSupplier(e.target.value)}
                className="flex-1 md:w-64 px-4 py-2 bg-[#F5F5F7] border-none rounded-xl text-xs font-bold text-american-blue outline-none ring-2 ring-transparent focus:ring-american-blue/10 appearance-none cursor-pointer"
              >
                {uniqueSuppliers.length === 0 ? (
                  <option disabled>No supplier quotes uploaded</option>
                ) : (
                  uniqueSuppliers.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))
                )}
              </select>
            </div>
          )}

          {pricingStrategy === 'best' && (
            <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-4 py-2 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Optimal Sourcing Mode Active
            </div>
          )}
        </div>
      </div>

      {/* Manual Item Add Button (Floating/Fixed in UI) */}
      <div className="flex justify-end print:hidden">
        <button
          onClick={() => setShowAddManual(true)}
          className="flex items-center gap-3 px-6 py-3 bg-american-red text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-american-red/20 hover:scale-105 transition-all active:scale-95"
        >
          <Plus size={16} />
          Add Manual Item
        </button>
      </div>

      {/* Manual Add Modal */}
      {showAddManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-american-blue/40 backdrop-blur-sm animate-in fade-in duration-300 print:hidden">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden border-4 border-american-blue/5">
            <div className="p-8 space-y-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-american-red/10 text-american-red flex items-center justify-center">
                    <Plus size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-american-blue uppercase tracking-tight">Add Manual Item</h3>
                    <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">Update Take-off & Library</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAddManual(false)}
                  className="p-2 hover:bg-[#F5F5F7] rounded-full transition-colors"
                >
                  <X size={20} className="text-[#CCCCCC]" />
                </button>
              </div>

              <form onSubmit={handleAddManualItem} className="space-y-4">
                <div className="space-y-1 relative">
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#999999] ml-1">Item Name</label>
                  <div className="relative">
                    <input
                      required
                      type="text"
                      value={newItem.name}
                      onChange={(e) => {
                        setNewItem({ ...newItem, name: e.target.value });
                      }}
                      placeholder="e.g. Extra Brace Pipe"
                      className="w-full px-5 py-3 bg-[#F5F5F7] border-none rounded-xl text-sm font-bold text-american-blue placeholder:text-[#CCCCCC] focus:ring-4 focus:ring-american-blue/5 outline-none transition-all"
                    />
                    {newItem.name.length > 1 && (
                      <div className="absolute top-full left-0 z-[60] w-full mt-2 bg-white rounded-2xl shadow-2xl border border-american-blue/10 overflow-hidden max-h-48 overflow-y-auto">
                        {materials
                          .filter(m => m.name.toLowerCase().includes(newItem.name.toLowerCase()) && m.name !== newItem.name)
                          .map(m => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setNewItem({
                                  name: m.name,
                                  unit: m.unit,
                                  cost: m.cost.toString(),
                                  qty: newItem.qty,
                                  category: m.category
                                });
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-[#F5F5F7] text-[11px] font-bold text-american-blue border-b border-[#F5F5F7] last:border-none flex justify-between items-center group"
                            >
                              <span>{m.name}</span>
                              <span className="text-[9px] text-[#999999] group-hover:text-american-blue">{m.category}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#999999] ml-1">Quantity</label>
                    <input
                      required
                      type="number"
                      step="any"
                      value={newItem.qty}
                      onChange={(e) => setNewItem({ ...newItem, qty: e.target.value })}
                      className="w-full px-5 py-3 bg-[#F5F5F7] border-none rounded-xl text-sm font-bold text-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#999999] ml-1">Unit Cost ($)</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={newItem.cost}
                      onChange={(e) => setNewItem({ ...newItem, cost: e.target.value })}
                      className="w-full px-5 py-3 bg-[#F5F5F7] border-none rounded-xl text-sm font-bold text-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#999999] ml-1">Unit</label>
                    <select
                      value={newItem.unit}
                      onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                      className="w-full px-5 py-3 bg-[#F5F5F7] border-none rounded-xl text-sm font-bold text-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all appearance-none"
                    >
                      <option value="each">Each</option>
                      <option value="lf">Linear Feet</option>
                      <option value="bag">Bag</option>
                      <option value="box">Box</option>
                      <option value="lb">LB</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#999999] ml-1">Category</label>
                    <select
                      value={newItem.category}
                      onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                      className="w-full px-5 py-3 bg-[#F5F5F7] border-none rounded-xl text-sm font-bold text-american-blue focus:ring-4 focus:ring-american-blue/5 outline-none transition-all appearance-none"
                    >
                      <option value="Hardware">Hardware</option>
                      <option value="Panel">Infill / Panel</option>
                      <option value="Metal">Wrought Iron / Metal</option>
                      <option value="Post">Post / Structure</option>
                      <option value="Rail">Rail / Structure</option>
                      <option value="Concrete">Concrete</option>
                      <option value="Gate">Gate</option>
                      <option value="Labor">Labor</option>
                      <option value="SitePrep">Site Prep</option>
                      <option value="Demolition">Demolition</option>
                      <option value="Fastener">Fastener</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-4 bg-american-blue text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-american-blue/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Add to Take-off
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Main Content (Printable) */}
      <div className="bg-white rounded-[40px] shadow-2xl border-2 border-american-blue/5 overflow-hidden print:border-0 print:shadow-none">
        {/* Printable Header */}
        <div className="p-10 border-b-4 border-american-blue/5 bg-[#FBFBFB]">
          <div className="flex flex-col md:flex-row justify-between items-start gap-8">
            <div className="space-y-4">
              <img src={COMPANY_INFO.logo} alt="Logo" className="h-20 object-contain" />
              <div className="space-y-1">
                <h2 className="text-2xl font-black text-american-blue uppercase tracking-tighter">{COMPANY_INFO.name}</h2>
                <div className="text-[11px] font-bold text-[#666666] uppercase tracking-widest space-y-0.5">
                  <p>{COMPANY_INFO.address}</p>
                  <p>{COMPANY_INFO.phone} • {COMPANY_INFO.email}</p>
                </div>
              </div>
            </div>
            <div className="text-right space-y-1">
              <p className="text-[10px] font-black text-american-red uppercase tracking-widest">Document: Material Take-off</p>
              <p className="text-3xl font-black text-american-blue uppercase tracking-tighter">#{Math.random().toString(36).substr(2, 6).toUpperCase()}</p>
              <p className="text-sm font-bold text-[#999999]">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              <div className="mt-4 pt-4 border-t-2 border-dashed border-american-blue/10">
                <p className="text-[10px] font-black text-american-blue uppercase tracking-widest">Customer</p>
                <p className="text-lg font-black text-american-blue tracking-tight">{estimate.customerName || 'N/A'}</p>
                <p className="text-xs font-medium text-[#666666]">{estimate.customerAddress || 'No address provided'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="p-8 space-y-12">
          {data.runs.map((run, ri) => (
            <div key={run.runId} className="space-y-4 takeoff-card">
              <div 
                className="flex items-center justify-between bg-american-blue/5 p-4 rounded-2xl cursor-pointer hover:bg-american-blue/10 transition-colors print:bg-[#F5F5F5]"
                onClick={() => toggleRun(run.runId)}
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-american-blue text-white flex items-center justify-center shadow-lg">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-american-blue uppercase tracking-tight">{run.runName}</h3>
                    <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">{run.linearFeet} LF • {run.styleName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                   {expandedRuns[run.runId] ? <ChevronDown size={20} className="text-american-blue/40" /> : <ChevronRight size={20} className="text-american-blue/40" />}
                </div>
              </div>

              {expandedRuns[run.runId] && (
                <div className="pl-4 sm:pl-14 space-y-6 animate-in slide-in-from-top-2 duration-300">
                  {/* Financial Breakdown per Run */}
                  {showPrices && (
                    <div className="grid gap-4 md:grid-cols-4 print:hidden">
                      <div className="bg-[#F8F9FA] p-4 rounded-2xl border-2 border-american-blue/5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-[#999999] mb-1">Net Fence LF Cost</p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-american-blue">{formatCurrency((run.fenceMaterialCost + run.fenceLaborCost) * (1 + (estimate.markupPercentage || 0) / 100) + (run.fenceMaterialCost * (estimate.taxPercentage || 0) / 100))}</span>
                        </div>
                        <p className="text-[10px] font-bold text-[#666666] tracking-tight">{run.netLF.toFixed(1)} LF @ {formatCurrency(((run.fenceMaterialCost + run.fenceLaborCost) * (1 + (estimate.markupPercentage || 0) / 100) + (run.fenceMaterialCost * (estimate.taxPercentage || 0) / 100)) / (run.netLF || 1))}/FT</p>
                      </div>
                      <div className="bg-[#F8F9FA] p-4 rounded-2xl border-2 border-american-blue/5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-[#999999] mb-1">Gate Logistics Cost</p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-american-red">
                            {formatCurrency((run.gateMaterialCost + run.gateLaborCost) * (1 + (estimate.markupPercentage || 0) / 100) + (run.gateMaterialCost * (estimate.taxPercentage || 0) / 100))}
                          </span>
                        </div>
                        <p className="text-[10px] font-bold text-[#666666] tracking-tight">{run.gates.length} Unit(s)</p>
                      </div>
                      <div className="bg-[#F8F9FA] p-4 rounded-2xl border-2 border-american-blue/5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-[#999999] mb-1">Demolition Charge</p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black text-[#A5A5A5]">
                            {formatCurrency(run.demoCharge * (1 + (estimate.markupPercentage || 0) / 100))}
                          </span>
                        </div>
                        <p className="text-[10px] font-bold text-[#666666] tracking-tight">Demo & Removal</p>
                      </div>
                      <div className="bg-american-blue/10 p-4 rounded-2xl border-2 border-american-blue/20 flex flex-col justify-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-american-blue mb-1">Charge Total for Run</p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl font-black text-american-blue">
                            {formatCurrency(
                              ((run.fenceMaterialCost + run.fenceLaborCost + run.gateMaterialCost + run.gateLaborCost + run.demoCharge) * (1 + (estimate.markupPercentage || 0) / 100)) + 
                              ((run.fenceMaterialCost + run.gateMaterialCost) * (estimate.taxPercentage || 0) / 100)
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Run Materials */}
                      <div className="overflow-x-auto rounded-2xl border-2 border-american-blue/5">
                        <table className="min-w-[800px] w-full text-left">
                          <thead>
                            <tr className="bg-[#F8F9FA] text-[10px] font-black uppercase tracking-widest text-[#999999]">
                              <th className="px-6 py-4 min-w-[200px]">Item Specification</th>
                              <th className="px-6 py-4 text-center">Quantity</th>
                              <th className="px-6 py-4">Unit</th>
                              {showPrices && <th className="px-6 py-4 text-right print:hidden">Raw Cost</th>}
                              {showPrices && <th className="px-6 py-4 text-right whitespace-nowrap print:hidden">Markup</th>}
                              {showPrices && <th className="px-6 py-4 text-right whitespace-nowrap print:hidden">Tax</th>}
                              {showPrices && <th className="px-6 py-4 text-right print:hidden">Selling Price</th>}
                              {showPrices && <th className="px-6 py-4 text-right print:hidden">Line Total</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y-2 divide-[#F8F9FA]">
                            {/* Fence Section */}
                            <tr className="bg-american-blue/[0.03]">
                              <td colSpan={showPrices ? 8 : 3} className="px-6 py-2 text-[9px] font-black text-american-blue uppercase tracking-widest">
                                Fence Components & Labor
                              </td>
                            </tr>
                            {run.items.filter(i => i.category !== 'Labor' && i.category !== 'Demolition' && i.category !== 'Gate').map((item, i) => {
                              const markupFactor = (estimate.markupPercentage || 0) / 100;
                              const taxFactor = (estimate.taxPercentage || 0) / 100;
                              const unitMarkup = item.unitCost * markupFactor;
                              const unitTax = item.unitCost * taxFactor;
                              const sellingPrice = item.unitCost + unitMarkup + unitTax;
                              const lineTotal = item.total * (1 + markupFactor + taxFactor);

                              // Check if price is fallback
                              const isFallback = pricingStrategy === 'supplier' && 
                                !quotes.filter(q => q.supplierName === selectedSupplier)
                                  .some(q => q.items.some(qi => qi.mappedMaterialId === item.id));

                              return (
                                  <tr key={i} className="text-sm font-bold text-american-blue/80 hover:bg-[#FBFBFB] transition-colors">
                                    <td className="px-6 py-4">
                                      <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                          <span>{item.name}</span>
                                          {pricingStrategy === 'best' && item.priceSource && (
                                            <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-tighter rounded-md ${
                                              item.priceSource === 'Library Price' 
                                                ? 'bg-american-blue/10 text-american-blue' 
                                                : 'bg-emerald-100 text-emerald-600'
                                            }`}>
                                              {item.priceSource}
                                            </span>
                                          )}
                                          {isFallback && showPrices && (
                                            <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[8px] font-black uppercase tracking-tighter rounded-md">
                                              Library Price
                                            </span>
                                          )}
                                        </div>
                                        {item.formula && (
                                          <span className="text-[9px] font-bold text-american-red/60 uppercase tracking-tighter mt-0.5">
                                            {item.formula}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 text-center font-black text-american-blue">{item.qty}</td>
                                  <td className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-[#999999]">{item.unit}</td>
                                  {showPrices && <td className="px-6 py-4 text-right tabular-nums text-[#666666] print:hidden">{formatCurrency(item.unitCost)}</td>}
                                  {showPrices && <td className="px-6 py-4 text-right tabular-nums text-american-red/60 text-[10px] print:hidden">+{formatCurrency(unitMarkup)}</td>}
                                  {showPrices && <td className="px-6 py-4 text-right tabular-nums text-american-blue/60 text-[10px] print:hidden">+{formatCurrency(unitTax)}</td>}
                                  {showPrices && <td className="px-6 py-4 text-right tabular-nums font-black text-american-blue print:hidden">{formatCurrency(sellingPrice)}</td>}
                                  {showPrices && <td className="px-6 py-4 text-right tabular-nums font-black text-american-red print:hidden">{formatCurrency(lineTotal)}</td>}
                                </tr>
                              );
                            })}
                            {/* Fence Labor Row */}
                            <tr className="text-sm font-bold text-american-blue hover:bg-[#FBFBFB] transition-colors print:hidden">
                              <td className="px-6 py-4">Fence Installation Labor</td>
                              <td className="px-6 py-4 text-center font-black text-american-blue">1</td>
                              <td className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-[#999999]">Job</td>
                              {showPrices && <td className="px-6 py-4 text-right tabular-nums text-[#666666] print:hidden">{formatCurrency(run.fenceLaborCost)}</td>}
                              {showPrices && <td className="px-6 py-4 text-right tabular-nums text-american-red/60 text-[10px] print:hidden">+{formatCurrency(run.fenceLaborCost * (estimate.markupPercentage || 0) / 100)}</td>}
                              {showPrices && <td className="px-6 py-4 text-right tabular-nums text-american-blue/60 text-[10px] print:hidden">$0.00</td>}
                              {showPrices && <td className="px-6 py-4 text-right tabular-nums font-black text-american-blue print:hidden">{formatCurrency(run.fenceLaborCost * (1 + (estimate.markupPercentage || 0) / 100))}</td>}
                              {showPrices && <td className="px-6 py-4 text-right tabular-nums font-black text-american-red print:hidden">{formatCurrency(run.fenceLaborCost * (1 + (estimate.markupPercentage || 0) / 100))}</td>}
                            </tr>

                            {/* Gate Section */}
                            {run.items.some(i => i.category === 'Gate') && (
                              <>
                                <tr className="bg-american-red/[0.03]">
                                  <td colSpan={showPrices ? 8 : 3} className="px-6 py-2 text-[9px] font-black text-american-red uppercase tracking-widest border-t border-american-blue/5">
                                    Gate Components & Logistics
                                  </td>
                                </tr>
                                {run.items.filter(i => i.category === 'Gate' || (i.category !== 'Labor' && i.category !== 'Demolition' && i.id.startsWith('gate-'))).map((item, i) => {
                                  const markupFactor = (estimate.markupPercentage || 0) / 100;
                                  const taxFactor = (estimate.taxPercentage || 0) / 100;
                                  const unitMarkup = item.unitCost * markupFactor;
                                  const unitTax = item.unitCost * taxFactor;
                                  const sellingPrice = item.unitCost + unitMarkup + unitTax;
                                  const lineTotal = item.total * (1 + markupFactor + taxFactor);

                                  return (
                                    <tr key={`gate-${i}`} className="text-sm font-bold text-american-blue/80 hover:bg-[#FBFBFB] transition-colors">
                                      <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                          <span>{item.name}</span>
                                          {pricingStrategy === 'best' && item.priceSource && (
                                            <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-tighter rounded-md ${
                                              item.priceSource === 'Library Price' 
                                                ? 'bg-american-blue/10 text-american-blue' 
                                                : 'bg-emerald-100 text-emerald-600'
                                            }`}>
                                              {item.priceSource}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-6 py-4 text-center font-black text-american-blue">{item.qty}</td>
                                      <td className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-[#999999]">{item.unit}</td>
                                      {showPrices && <td className="px-6 py-4 text-right tabular-nums text-[#666666] print:hidden">{formatCurrency(item.unitCost)}</td>}
                                      {showPrices && <td className="px-6 py-4 text-right tabular-nums text-american-red/60 text-[10px] print:hidden">+{formatCurrency(unitMarkup)}</td>}
                                      {showPrices && <td className="px-6 py-4 text-right tabular-nums text-american-blue/60 text-[10px] print:hidden">+{formatCurrency(unitTax)}</td>}
                                      {showPrices && <td className="px-6 py-4 text-right tabular-nums font-black text-american-blue print:hidden">{formatCurrency(sellingPrice)}</td>}
                                      {showPrices && <td className="px-6 py-4 text-right tabular-nums font-black text-american-red print:hidden">{formatCurrency(lineTotal)}</td>}
                                    </tr>
                                  );
                                })}
                                <tr className="text-sm font-bold text-american-red hover:bg-[#FBFBFB] transition-colors print:hidden">
                                  <td className="px-6 py-4">Gate Fabrication Labor & Setup</td>
                                  <td className="px-6 py-4 text-center font-black text-american-red">1</td>
                                  <td className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-[#999999]">Job</td>
                                  {showPrices && <td className="px-6 py-4 text-right tabular-nums text-[#666666]">{formatCurrency(run.gateLaborCost)}</td>}
                                  {showPrices && <td className="px-6 py-4 text-right tabular-nums text-american-red/60 text-[10px]">+{formatCurrency(run.gateLaborCost * (estimate.markupPercentage || 0) / 100)}</td>}
                                  {showPrices && <td className="px-6 py-4 text-right tabular-nums text-american-blue/60 text-[10px]">$0.00</td>}
                                  {showPrices && <td className="px-6 py-4 text-right tabular-nums font-black text-american-red">{formatCurrency(run.gateLaborCost * (1 + (estimate.markupPercentage || 0) / 100))}</td>}
                                  {showPrices && <td className="px-6 py-4 text-right tabular-nums font-black text-american-red">{formatCurrency(run.gateLaborCost * (1 + (estimate.markupPercentage || 0) / 100))}</td>}
                                </tr>
                              </>
                            )}

                            {/* Demo Section */}
                            {run.demoCharge > 0 && (
                              <>
                                <tr className="bg-american-red/[0.01] print:hidden">
                                  <td colSpan={showPrices ? 8 : 3} className="px-6 py-2 text-[9px] font-black text-[#666666] uppercase tracking-widest border-t border-american-blue/5">
                                    Demolition & Removal
                                  </td>
                                </tr>
                                <tr className="text-sm font-bold text-american-blue hover:bg-[#FBFBFB] transition-colors print:hidden">
                                  <td className="px-6 py-4">Demolition Labor & Disposal</td>
                                  <td className="px-6 py-4 text-center font-black text-american-blue">1</td>
                                  <td className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-[#999999]">Job</td>
                                  {showPrices && <td className="px-6 py-4 text-right tabular-nums text-[#666666]">{formatCurrency(run.demoCharge)}</td>}
                                  {showPrices && <td className="px-6 py-4 text-right tabular-nums text-american-red/60 text-[10px]">+{formatCurrency(run.demoCharge * (estimate.markupPercentage || 0) / 100)}</td>}
                                  {showPrices && <td className="px-6 py-4 text-right tabular-nums text-american-blue/60 text-[10px]">$0.00</td>}
                                  {showPrices && <td className="px-6 py-4 text-right tabular-nums font-black text-american-blue">{formatCurrency(run.demoCharge * (1 + (estimate.markupPercentage || 0) / 100))}</td>}
                                  {showPrices && <td className="px-6 py-4 text-right tabular-nums font-black text-american-red">{formatCurrency(run.demoCharge * (1 + (estimate.markupPercentage || 0) / 100))}</td>}
                                </tr>
                              </>
                            )}
                          </tbody>
                        </table>
                      </div>

                  {/* Gates Sub-items */}
                  {run.gates.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-american-red ml-2">Sub-Items: Gates in this section</h4>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {run.gates.map((gate, gi) => (
                          <div key={gi} className="bg-white rounded-2xl border-2 border-american-blue/5 p-5 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3 pb-3 border-b-2 border-dashed border-[#F0F0F0]">
                              <div className="h-8 w-8 rounded-lg bg-american-red/10 text-american-red flex items-center justify-center">
                                <Package size={16} />
                              </div>
                              <span className="text-xs font-black text-american-blue uppercase tracking-tight">{gate.type} Gate ({gate.width}')</span>
                              <button
                                onClick={() => setEditingGate({ runIndex: ri, gateIndex: gi, gateId: gate.gateId })}
                                className="ml-auto p-1.5 rounded-lg bg-american-blue/5 text-american-blue/40 hover:bg-american-blue/10 hover:text-american-blue transition-all group/edit print:hidden"
                                title="Edit gate components"
                              >
                                <SettingsIcon size={14} className="group-hover/edit:rotate-45 transition-transform" />
                              </button>
                            </div>
                            <ul className="space-y-2">
                              {gate.items.filter(i => i.category !== 'Labor' && i.category !== 'Demolition').map((gi, gii) => (
                                <li key={gii} className="flex justify-between items-center group">
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="text-[11px] font-bold text-[#666666] group-hover:text-american-blue transition-colors truncate">
                                      {gi.qty}x {gi.name}
                                    </span>
                                    {pricingStrategy === 'best' && gi.priceSource && (
                                      <span className={`w-fit px-1.5 py-0.5 text-[7px] font-black uppercase tracking-tighter rounded-sm ${
                                        gi.priceSource === 'Library Price' 
                                          ? 'bg-american-blue/5 text-american-blue/60' 
                                          : 'bg-emerald-50 text-emerald-600/80'
                                      }`}>
                                        {gi.priceSource}
                                      </span>
                                    )}
                                  </div>
                                  {showPrices && <span className="text-[11px] font-black text-american-blue">{formatCurrency(gi.total)}</span>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Global Prep & Logistics Section */}
          {data.totals.prep > 0 && (
            <div className="space-y-4 takeoff-card">
              <div className="flex items-center justify-between bg-american-red/5 p-4 rounded-2xl border border-american-red/10">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-american-red text-white flex items-center justify-center shadow-lg">
                    <SettingsIcon size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-american-blue uppercase tracking-tight">Global Prep & Logistics</h3>
                    <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Site Prep • Marking • Coordination</p>
                  </div>
                </div>
                {showPrices && (
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase tracking-widest text-american-blue mb-1">Charge Total for Prep</p>
                    <p className="text-xl font-black text-american-blue">
                      {formatCurrency(data.totals.prep * (1 + (estimate.markupPercentage || 0) / 100))}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="pl-4 sm:pl-14">
                <div className="overflow-x-auto rounded-2xl border-2 border-american-blue/5">
                  <table className="min-w-[600px] w-full text-left">
                    <thead>
                      <tr className="bg-[#F8F9FA] text-[10px] font-black uppercase tracking-widest text-[#999999]">
                        <th className="px-6 py-4">Preparation Item</th>
                        <th className="px-6 py-4 text-center">Qty</th>
                        <th className="px-6 py-4">Unit</th>
                        {showPrices && <th className="px-6 py-4 text-right">Raw Cost</th>}
                        {showPrices && <th className="px-6 py-4 text-right">Selling Price</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y-2 divide-[#F8F9FA]">
                      {data.summary.filter(i => i.category === 'SitePrep').map((item, i) => {
                        const sellingPrice = item.unitCost * (1 + (estimate.markupPercentage || 0) / 100);
                        return (
                          <tr key={i} className="text-sm font-bold text-american-blue/80 hover:bg-[#FBFBFB]">
                            <td className="px-6 py-4">{item.name}</td>
                            <td className="px-6 py-4 text-center">{item.qty}</td>
                            <td className="px-6 py-4 text-[10px] uppercase font-black tracking-widest text-[#999999]">{item.unit}</td>
                            {showPrices && <td className="px-6 py-4 text-right tabular-nums text-[#666666]">{formatCurrency(item.unitCost)}</td>}
                            {showPrices && <td className="px-6 py-4 text-right tabular-nums font-black text-american-blue">{formatCurrency(sellingPrice)}</td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Master Inventory Summary */}
          <div className="pt-12 border-t-4 border-american-blue/5 space-y-8 takeoff-card">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-american-red text-white flex items-center justify-center shadow-lg">
                <Package size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-american-blue tracking-tight uppercase">Master Inventory Summary</h2>
                <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Aggregated Calculated Materials List</p>
              </div>
            </div>

            <div className="bg-white rounded-[32px] p-1 overflow-x-auto border-2 border-american-blue/5 shadow-lg">
              <table className="min-w-[700px] w-full text-left">
                <thead>
                  <tr className="bg-[#F8F9FA] text-[10px] font-black uppercase tracking-widest text-[#999999]">
                    <th className="px-8 py-6">Item Specification</th>
                    <th className="px-8 py-6 text-center">Calculated Qty</th>
                    <th className="px-8 py-6">Category</th>
                    {showPrices && <th className="px-8 py-6 text-right print:hidden">Calculated Cost</th>}
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-[#F8F9FA]">
                  {data.summary.filter(item => item.category !== 'Labor' && item.category !== 'Demolition').length === 0 ? (
                    <tr>
                      <td colSpan={showPrices ? 4 : 3} className="px-8 py-10 text-center text-sm font-bold text-[#999999] italic">
                        No calculated items in this dossier
                      </td>
                    </tr>
                  ) : (
                    data.summary.filter(item => item.category !== 'Labor' && item.category !== 'Demolition').map((item, i) => {
                      const isFallback = pricingStrategy === 'supplier' && 
                        !quotes.filter(q => q.supplierName === selectedSupplier)
                          .some(q => q.items.some(qi => qi.mappedMaterialId === item.id));

                      return (
                        <tr key={i} className="text-sm font-bold text-american-blue hover:bg-[#FBFBFB] transition-colors group">
                          <td className="px-8 py-5 flex items-center gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-american-blue/30" />
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span>{item.name}</span>
                                {pricingStrategy === 'best' && item.priceSource && (
                                  <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-tighter rounded-md ${
                                    item.priceSource === 'Library Price' 
                                      ? 'bg-american-blue/10 text-american-blue' 
                                      : 'bg-emerald-100 text-emerald-600'
                                  }`}>
                                    {item.priceSource}
                                  </span>
                                )}
                              </div>
                              {isFallback && showPrices && (
                                <span className="text-[8px] font-black uppercase tracking-tighter text-orange-600 mt-0.5">
                                  Not in supplier quotes - Using library price
                                </span>
                              )}
                            </div>
                          </td>
                        <td className="px-8 py-5 text-center">
                          <span className="px-3 py-1 bg-american-blue/5 text-american-blue rounded-full text-xs font-black print:bg-transparent print:p-0">{item.qty} {item.unit}</span>
                        </td>
                        <td className="px-8 py-5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[#999999]">{item.category}</span>
                        </td>
                        {showPrices && <td className="px-8 py-5 text-right font-black text-american-blue/60 print:hidden">{formatCurrency(item.total)}</td>}
                      </tr>
                    );
                  })
                )}
              </tbody>
              </table>
            </div>
          </div>

          {/* Pipe Cutting Guide */}
          {data.pipeCuttingSummary && data.pipeCuttingSummary.sticks.length > 0 && (
            <div className="pt-12 border-t-4 border-american-blue/10 space-y-8 takeoff-card">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-american-blue text-white flex items-center justify-center shadow-lg">
                  <div className="scale-75"><Package size={24} /></div>
                </div>
                <div>
                  <h2 className="text-xl font-black text-american-blue tracking-tight uppercase">Pipe Cutting Guide (32' Sticks)</h2>
                  <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Optimal Cut List for Minimal Waste</p>
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {data.pipeCuttingSummary.sticks.map((stick, sIdx) => (
                  <div key={sIdx} className="bg-white rounded-3xl border-2 border-american-blue/5 p-6 space-y-4 shadow-md hover:shadow-xl transition-all group overflow-hidden relative">
                    <div className="flex justify-between items-center pb-3 border-b-2 border-dashed border-[#F0F0F0]">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-american-blue/40 uppercase tracking-widest">Stick</span>
                        <span className="text-lg font-black text-american-blue">#{stick.id}</span>
                      </div>
                      <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase tracking-widest">
                        {((32 - stick.leftover) / 32 * 100).toFixed(0)}% Utilized
                      </span>
                    </div>

                    <div className="space-y-3">
                      {stick.cuts.sort((a, b) => b - a).map((cut, cIdx) => (
                        <div key={cIdx} className="flex justify-between items-center bg-[#F8F9FA] p-3 rounded-xl border border-transparent group-hover:border-american-blue/10 transition-colors">
                          <span className="text-sm font-black text-american-blue">Cut @ {cut.toFixed(2)}'</span>
                          <span className="text-[9px] font-bold text-[#999999] uppercase tracking-widest">Required Segment</span>
                        </div>
                      ))}
                    </div>

                    {stick.leftover > 0 && (
                      <div className="bg-american-red/5 p-3 rounded-xl flex justify-between items-center border border-american-red/10">
                        <span className="text-[10px] font-black text-american-red uppercase tracking-widest">Leftover Scrap</span>
                        <span className="text-sm font-black text-american-red">{stick.leftover.toFixed(2)}'</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="bg-[#F8F9FA] p-6 rounded-3xl border-2 border-emerald-500/10 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-6">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-[#999999] uppercase tracking-widest">Total Sticks Needed</p>
                    <p className="text-2xl font-black text-american-blue">{data.pipeCuttingSummary.sticks.length}</p>
                  </div>
                  <div className="h-10 w-[2px] bg-[#E0E0E0]" />
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-[#999999] uppercase tracking-widest">Optimization Efficiency</p>
                    <p className="text-2xl font-black text-emerald-600">{data.pipeCuttingSummary.efficiency.toFixed(1)}%</p>
                  </div>
                </div>
                <div className="text-right text-[10px] font-bold text-[#999999] uppercase tracking-widest max-w-sm">
                  This cutting list considers the project as a whole, including all posts and top rails, to minimize overall material waste.
                </div>
              </div>
            </div>
          )}

          {/* Manual Additions Section */}
          <div className="pt-12 border-t-4 border-american-red/10 space-y-8 takeoff-card">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-american-blue text-white flex items-center justify-center shadow-lg">
                <Plus size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-american-blue tracking-tight uppercase">Custom Manual Additions</h2>
                <p className="text-[10px] font-bold text-american-red uppercase tracking-widest">Manually Injected Items & Assemblies</p>
              </div>
            </div>

            <div className="bg-white rounded-[32px] p-1 overflow-x-auto border-2 border-dashed border-american-red/20 shadow-lg">
              <div className="p-4 bg-american-red/[0.02] border-b-2 border-dashed border-american-red/10 flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-american-red">Manual Item Detail</span>
                {showPrices && (
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase tracking-widest text-american-blue mb-1">Manual Additions Total (Inc. Markup/Tax)</p>
                    <p className="text-lg font-black text-american-blue">
                      {formatCurrency(
                        data.manualSummary.reduce((sum, i) => sum + i.total, 0) * (1 + (estimate.markupPercentage || 0) / 100) + 
                        data.manualSummary.filter(i => i.category !== 'Labor' && i.category !== 'Demolition' && i.category !== 'SitePrep').reduce((sum, i) => sum + i.total, 0) * (estimate.taxPercentage || 0) / 100
                      )}
                    </p>
                  </div>
                )}
              </div>
              <table className="min-w-[700px] w-full text-left">
                <thead>
                  <tr className="bg-[#FEF2F2] text-[10px] font-black uppercase tracking-widest text-american-red/60">
                    <th className="px-8 py-6">Manual Addition Specification</th>
                    <th className="px-8 py-6 text-center">Extra Qty</th>
                    <th className="px-8 py-6">Category</th>
                    {showPrices && <th className="px-8 py-6 text-right print:hidden">Manual Cost</th>}
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-[#F8F9FA]">
                  {data.manualSummary.length === 0 ? (
                    <tr>
                      <td colSpan={showPrices ? 4 : 3} className="px-8 py-10 text-center text-sm font-bold text-[#999999] italic">
                        No manual additions present
                      </td>
                    </tr>
                  ) : (
                    data.manualSummary.map((item, i) => (
                      <tr key={i} className="text-sm font-bold text-american-blue hover:bg-[#FBFBFB] transition-colors group">
                        <td className="px-8 py-5 flex items-center gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-american-red shadow-sm shadow-american-red/40" />
                          <span className="flex-1">{item.name}</span>
                          <button 
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 bg-american-red/10 hover:bg-american-red hover:text-white text-american-red rounded-lg transition-all opacity-100 print:hidden"
                            title="Remove manual item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                        <td className="px-8 py-5 text-center">
                          <span className="px-3 py-1 bg-american-red/5 text-american-red rounded-full text-xs font-black">{item.qty} {item.unit}</span>
                        </td>
                        <td className="px-8 py-5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[#999999]">{item.category}</span>
                        </td>
                        {showPrices && <td className="px-8 py-5 text-right font-black text-american-red print:hidden">{formatCurrency(item.total)}</td>}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial Totals */}
          {showPrices && (
            <div className="space-y-6 takeoff-card print:hidden">
               <div className="space-y-6 flex-1">
                 {/* Detailed Cost Breakdown Table */}
                 <div className="bg-white rounded-[24px] overflow-hidden border-2 border-american-blue/5 shadow-md">
                   <table className="w-full text-left">
                     <thead>
                       <tr className="bg-american-blue/5 text-[10px] font-black uppercase tracking-widest text-american-blue">
                        <th className="px-4 py-3">Cost Category</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap">Raw Total</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap text-american-red">Markup</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap">Tax</th>
                        <th className="px-4 py-3 text-right whitespace-nowrap text-american-blue">Adjusted Total</th>
                      </tr>
                     </thead>
                     <tbody className="divide-y divide-[#F8F9FA]">
                       <tr className="text-sm font-bold text-american-blue">
                         <td className="px-6 py-4">Fence & Gate Materials</td>
                         <td className="px-6 py-4 text-right tabular-nums text-[#666666] font-medium">{formatCurrency(data.totals.material)}</td>
                         <td className="px-6 py-4 text-right tabular-nums text-american-red/80">+{formatCurrency(data.totals.material * (estimate.markupPercentage || 0) / 100)}</td>
                         <td className="px-6 py-4 text-right tabular-nums text-american-blue/60">+{formatCurrency(data.totals.tax)}</td>
                         <td className="px-6 py-4 text-right tabular-nums">
                           {formatCurrency(data.totals.material * (1 + (estimate.markupPercentage || 0) / 100) + data.totals.tax)}
                         </td>
                       </tr>
                       <tr className="text-sm font-bold text-american-blue">
                         <td className="px-6 py-4">Installation Labor</td>
                         <td className="px-6 py-4 text-right tabular-nums text-[#666666] font-medium">{formatCurrency(data.totals.labor)}</td>
                         <td className="px-6 py-4 text-right tabular-nums text-american-red/80">+{formatCurrency(data.totals.labor * (estimate.markupPercentage || 0) / 100)}</td>
                         <td className="px-6 py-4 text-right tabular-nums text-american-blue/60">$0.00</td>
                         <td className="px-6 py-4 text-right tabular-nums">
                           {formatCurrency(data.totals.labor * (1 + (estimate.markupPercentage || 0) / 100))}
                         </td>
                       </tr>
                       {(data.totals.demo > 0 || (data.totals.prep || 0) > 0) && (
                         <tr className="text-sm font-bold text-american-blue">
                           <td className="px-6 py-4">Prep, Demo & Logistics</td>
                           <td className="px-6 py-4 text-right tabular-nums text-[#666666] font-medium">{formatCurrency(data.totals.demo + (data.totals.prep || 0))}</td>
                           <td className="px-6 py-4 text-right tabular-nums text-american-red/80">+{formatCurrency((data.totals.demo + (data.totals.prep || 0)) * (estimate.markupPercentage || 0) / 100)}</td>
                           <td className="px-6 py-4 text-right tabular-nums text-american-blue/60">$0.00</td>
                           <td className="px-6 py-4 text-right tabular-nums">
                             {formatCurrency((data.totals.demo + (data.totals.prep || 0)) * (1 + (estimate.markupPercentage || 0) / 100))}
                           </td>
                         </tr>
                       )}
                       <tr className="text-sm font-bold text-american-blue bg-american-blue/[0.02]">
                         <td className="px-6 py-4">Logistics Delivery Fee</td>
                         <td className="px-6 py-4 text-right tabular-nums text-[#666666] font-medium">{formatCurrency(estimate.deliveryFee ?? 50)}</td>
                         <td className="px-6 py-4 text-right tabular-nums text-american-red/80">+$0.00</td>
                         <td className="px-6 py-4 text-right tabular-nums text-american-blue/60">$0.00</td>
                         <td className="px-6 py-4 text-right tabular-nums font-black">
                           {formatCurrency(estimate.deliveryFee ?? 50)}
                         </td>
                       </tr>
                     </tbody>
                   </table>
                 </div>
               </div>
               
               {/* Financial Breakdown Table for User Verification */}
              <div className="mt-8 pt-8 border-t-2 border-american-blue/5">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-american-blue mb-4">Math Verification (Sum of Sections)</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-american-blue/10">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#999999] mb-1">Total from Runs</p>
                    <p className="text-sm font-black text-american-blue">
                      {formatCurrency(data.runs.reduce((sum, run) => {
                        return sum + (
                          ((run.fenceMaterialCost + run.fenceLaborCost + run.gateMaterialCost + run.gateLaborCost + run.demoCharge) * (1 + (estimate.markupPercentage || 0) / 100)) + 
                          ((run.fenceMaterialCost + run.gateMaterialCost) * (estimate.taxPercentage || 0) / 100)
                        );
                      }, 0))}
                    </p>
                  </div>
                  {data.totals.prep > 0 && (
                    <div className="bg-white p-4 rounded-xl border border-american-blue/10">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#999999] mb-1">Total from Prep</p>
                      <p className="text-sm font-black text-american-blue">
                        {formatCurrency(data.totals.prep * (1 + (estimate.markupPercentage || 0) / 100))}
                      </p>
                    </div>
                  )}
                  {data.manualSummary.length > 0 && (
                    <div className="bg-white p-4 rounded-xl border border-american-blue/10">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#999999] mb-1">Manual Additions</p>
                      <p className="text-sm font-black text-american-blue">
                        {formatCurrency(
                          data.manualSummary.reduce((sum, i) => sum + i.total, 0) * (1 + (estimate.markupPercentage || 0) / 100) + 
                          data.manualSummary.filter(i => i.category !== 'Labor' && i.category !== 'Demolition' && i.category !== 'SitePrep').reduce((sum, i) => sum + i.total, 0) * (estimate.taxPercentage || 0) / 100
                        )}
                      </p>
                    </div>
                  )}
                  <div className="bg-white p-4 rounded-xl border border-american-blue/10">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#999999] mb-1">Delivery Fee</p>
                    <p className="text-sm font-black text-american-blue">
                      {formatCurrency(estimate.deliveryFee ?? 50)}
                    </p>
                  </div>
                  <div className="bg-american-blue/[0.02] p-4 rounded-xl border-2 border-american-blue/20">
                    <p className="text-[9px] font-black uppercase tracking-widest text-american-blue mb-1">Calculated Job Total</p>
                    <p className="text-sm font-black text-american-blue">{formatCurrency(data.totals.grandTotal)}</p>
                  </div>
                </div>
              </div>

              {/* Aggregated Totals Grid */}
               <div className="bg-[#F8F9FA] rounded-[24px] p-8 flex flex-col md:flex-row justify-between gap-8 border-2 border-[#EEEEEE]">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-1">
                   <div className="space-y-1">
                     <p className="text-[10px] font-black uppercase tracking-widest text-[#999999]">Gross Raw Cost</p>
                     <p className="text-2xl font-black text-american-blue">{formatCurrency(data.totals.subtotal)}</p>
                   </div>
                   <div className="space-y-1">
                     <p className="text-[10px] font-black uppercase tracking-widest text-american-red">Markup Amount</p>
                     <p className="text-2xl font-black text-american-red">{formatCurrency(data.totals.markup)}</p>
                   </div>
                   <div className="space-y-1">
                     <p className="text-[10px] font-black uppercase tracking-widest text-american-blue">Sales Tax</p>
                     <p className="text-2xl font-black text-american-blue">{formatCurrency(data.totals.tax)}</p>
                   </div>
                 </div>
                 
                 <div className="bg-american-blue rounded-2xl p-6 text-white min-w-[320px] shadow-xl shadow-american-blue/20 flex flex-col justify-center">
                   <div className="flex justify-between items-baseline gap-4">
                     <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Estimated Final Total</span>
                     <span className="text-3xl font-black">{formatCurrency(data.totals.grandTotal)}</span>
                   </div>
                   <div className="mt-2 text-[8px] font-bold opacity-40 uppercase tracking-widest text-center border-t border-white/10 pt-2">
                     Official Project Investment Analysis
                   </div>
                 </div>
               </div>
            </div>
          )}
        </div>

        {/* Footer Branding */}
        <div className="bg-american-blue p-8 text-center border-t-8 border-american-blue/20 print:hidden">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Lone Star Fence Works • Precision Manufacturing & Strategic Deployment</p>
        </div>
      </div>
      
      {/* Gate Editor Modal */}
      {editingGate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-american-blue/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-american-blue/10 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 bg-american-blue text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-white/10 flex items-center justify-center">
                  <Package size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight">Edit Gate Components</h3>
                  <p className="text-xs font-bold text-white/60 tracking-widest uppercase">
                    Run: {data.runs[editingGate.runIndex].runName} • Gate #{editingGate.gateIndex + 1}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setEditingGate(null)}
                className="h-10 w-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Left Column: Material Library */}
              <div className="w-1/3 border-r border-[#EEEEEE] flex flex-col shrink-0">
                <div className="p-4 border-b border-[#F5F5F5]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                    <input 
                      type="text"
                      placeholder="Search materials..."
                      className="w-full pl-10 pr-4 py-2 bg-[#F8F9FA] rounded-xl border-none text-sm font-bold placeholder:text-[#BBBBBB] focus:ring-2 focus:ring-american-blue/10"
                      onChange={(e) => {
                        const search = e.target.value.toLowerCase();
                        setSearchTerm(search);
                      }}
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-[#FAFAFA]">
                  {materials
                    .filter(m => m.category !== 'Labor' && m.category !== 'Demolition' && (m.name.toLowerCase().includes(searchTerm) || m.category.toLowerCase().includes(searchTerm)))
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          const existingItems = [...(estimate.runs?.[editingGate.runIndex]?.gateDetails?.[editingGate.gateIndex]?.customItems || data.runs[editingGate.runIndex].gates[editingGate.gateIndex].items)];
                          const existing = existingItems.find(i => i.id === item.id);
                          
                          if (existing) {
                            handleUpdateGateItems(editingGate.runIndex, editingGate.gateIndex, 
                              existingItems.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i)
                            );
                          } else {
                            handleUpdateGateItems(editingGate.runIndex, editingGate.gateIndex, [
                              ...existingItems,
                              {
                                id: item.id,
                                name: item.name,
                                qty: 1,
                                unit: item.unit,
                                unitCost: item.cost,
                                category: item.category
                              }
                            ]);
                          }
                        }}
                        className="w-full p-3 flex flex-col text-left rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-american-blue/5 transition-all group"
                      >
                        <span className="text-xs font-black text-american-blue group-hover:text-american-red transition-colors">{item.name}</span>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-[10px] font-bold text-[#999999] uppercase tracking-widest">{item.category}</span>
                          <span className="text-[10px] font-black text-american-blue">{formatCurrency(item.cost)}</span>
                        </div>
                      </button>
                    ))}
                </div>
              </div>

              {/* Right Column: Active Components */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <div>
                  <div className="flex items-baseline justify-between mb-4">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-american-red">Active Component List</h4>
                    <button 
                      onClick={() => handleResetGateItems(editingGate.runIndex, editingGate.gateIndex)}
                      className="text-[10px] font-black uppercase tracking-widest text-[#999999] hover:text-american-red transition-colors"
                    >
                      Reset to Defaults
                    </button>
                  </div>
                  
                  <div className="space-y-2">
                    {(estimate.runs?.[editingGate.runIndex]?.gateDetails?.[editingGate.gateIndex]?.customItems || 
                      data.runs[editingGate.runIndex].gates[editingGate.gateIndex].items.filter(i => i.category !== 'Labor' && i.category !== 'Demolition'))
                      .map((item, idx) => (
                      <div key={idx} className="flex items-center gap-4 bg-[#F8F9FA] p-3 rounded-2xl border border-american-blue/5 group hover:bg-white hover:shadow-md transition-all">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black text-american-blue truncate">{item.name}</p>
                          <p className="text-[9px] font-bold text-[#999999] uppercase tracking-widest">{item.category}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center bg-white rounded-lg border border-[#EEEEEE] overflow-hidden">
                            <button 
                              onClick={() => {
                                const currentItems = [...(estimate.runs?.[editingGate.runIndex]?.gateDetails?.[editingGate.gateIndex]?.customItems || data.runs[editingGate.runIndex].gates[editingGate.gateIndex].items.filter(i => i.category !== 'Labor' && i.category !== 'Demolition'))];
                                if (item.qty > 1) {
                                  handleUpdateGateItems(editingGate.runIndex, editingGate.gateIndex, 
                                    currentItems.map((ci, curIdx) => curIdx === idx ? { ...ci, qty: ci.qty - 1 } : ci)
                                  );
                                }
                              }}
                              className="p-1 px-2 hover:bg-[#F5F5F5] text-american-blue/40 hover:text-american-blue transition-colors"
                            >-</button>
                            <span className="px-2 text-xs font-black text-american-blue border-x border-[#EEEEEE] min-w-[30px] text-center">{item.qty}</span>
                            <button 
                              onClick={() => {
                                const currentItems = [...(estimate.runs?.[editingGate.runIndex]?.gateDetails?.[editingGate.gateIndex]?.customItems || data.runs[editingGate.runIndex].gates[editingGate.gateIndex].items.filter(i => i.category !== 'Labor' && i.category !== 'Demolition'))];
                                handleUpdateGateItems(editingGate.runIndex, editingGate.gateIndex, 
                                  currentItems.map((ci, curIdx) => curIdx === idx ? { ...ci, qty: ci.qty + 1 } : ci)
                                );
                              }}
                              className="p-1 px-2 hover:bg-[#F5F5F5] text-american-blue/40 hover:text-american-blue transition-colors"
                            >+</button>
                          </div>
                          <div className="w-20 text-right">
                            <input 
                              type="number"
                              value={item.unitCost}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                const currentItems = [...(estimate.runs?.[editingGate.runIndex]?.gateDetails?.[editingGate.gateIndex]?.customItems || data.runs[editingGate.runIndex].gates[editingGate.gateIndex].items.filter(i => i.category !== 'Labor' && i.category !== 'Demolition'))];
                                handleUpdateGateItems(editingGate.runIndex, editingGate.gateIndex, 
                                  currentItems.map((ci, curIdx) => curIdx === idx ? { ...ci, unitCost: val } : ci)
                                );
                              }}
                              className="w-full text-right bg-transparent border-none p-0 text-xs font-black text-american-blue focus:ring-0"
                            />
                            <p className="text-[9px] font-bold text-[#999999] uppercase tracking-widest underline decoration-dotted decoration-[#CCCCCC]">Total: {formatCurrency(item.qty * item.unitCost)}</p>
                          </div>
                          <button 
                            onClick={() => {
                              const currentItems = [...(estimate.runs?.[editingGate.runIndex]?.gateDetails?.[editingGate.gateIndex]?.customItems || data.runs[editingGate.runIndex].gates[editingGate.gateIndex].items.filter(i => i.category !== 'Labor' && i.category !== 'Demolition'))];
                              handleUpdateGateItems(editingGate.runIndex, editingGate.gateIndex, 
                                currentItems.filter((_, curIdx) => curIdx !== idx)
                              );
                            }}
                            className="p-1.5 rounded-lg text-[#BBBBBB] hover:bg-american-red/10 hover:text-american-red transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-american-red/5 p-6 rounded-[24px] border border-american-red/10 flex items-center justify-between mt-auto">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-american-blue mb-1">Gate Logistics Total</p>
                    <p className="text-sm font-bold text-[#666666]">Sum of all hardware, framing, and logistics for this gate.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black text-american-blue">
                      {formatCurrency(
                        (estimate.runs?.[editingGate.runIndex]?.gateDetails?.[editingGate.gateIndex]?.customItems || 
                         data.runs[editingGate.runIndex].gates[editingGate.gateIndex].items.filter(i => i.category !== 'Labor' && i.category !== 'Demolition'))
                        .reduce((sum, i) => sum + (i.qty * i.unitCost), 0)
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-6 bg-[#FBFBFB] border-t border-[#EEEEEE] flex justify-end gap-3">
              <button 
                onClick={() => setEditingGate(null)}
                className="px-6 py-3 rounded-xl bg-american-blue text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-american-blue/20 hover:scale-105 active:scale-95 transition-all"
              >
                Confirm & Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
