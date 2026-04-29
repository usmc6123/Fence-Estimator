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

interface MaterialTakeOffProps {
  estimate: Partial<Estimate>;
  materials: MaterialItem[];
  laborRates: LaborRates;
  quotes: SupplierQuote[];
  setEstimate: (estimate: Partial<Estimate>) => void;
  setMaterials: React.Dispatch<React.SetStateAction<MaterialItem[]>>;
}

export default function MaterialTakeOff({ estimate, materials, laborRates, quotes, setEstimate, setMaterials }: MaterialTakeOffProps) {
  const [showPrices, setShowPrices] = React.useState(true);
  const [showAddManual, setShowAddManual] = React.useState(false);
  const [newItem, setNewItem] = React.useState({
    name: '',
    unit: 'each',
    cost: '',
    qty: '1',
    category: 'Hardware'
  });

  const data: DetailedTakeOff = calculateDetailedTakeOff(estimate, materials, laborRates);
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
        unit: newItem.unit,
        cost: cost,
        category: newItem.category,
        description: 'Manually added to take-off'
      };
      setMaterials(prev => [...prev, newMaterial]);
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
      
      const cap = materials.find(m => m.id === 'pc-dome' || m.id === 'pc-flat');
      const concrete = materials.find(m => m.id === 'i-concrete-maximizer' || m.id === 'i-concrete-80');
      
      const bracketId = isWoodStyle ? 'h-bracket-w' : 'm-bracket';
      const bracket = materials.find(m => m.id === bracketId);
      
      const screwId = isWoodStyle ? 'h-lag-14' : 'm-screw-self-tap';
      const screw = materials.find(m => m.id === screwId);

      if (cap) addItemToDossier(cap.id, qty);
      if (concrete) addItemToDossier(concrete.id, qty); // 1-to-1 assumption for manual add
      if (bracket) addItemToDossier(bracket.id, qty * 4);
      if (screw) addItemToDossier(screw.id, qty * 4);
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
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-6 rounded-[32px] shadow-xl border-2 border-american-blue/5 print:hidden">
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
                      <option value="Infill">Infill</option>
                      <option value="Structure">Structure</option>
                      <option value="Concrete">Concrete</option>
                      <option value="Gate">Gate</option>
                      <option value="Labor">Labor</option>
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
          {data.runs.map((run) => (
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
                      <div className="overflow-hidden rounded-2xl border-2 border-american-blue/5">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-[#F8F9FA] text-[10px] font-black uppercase tracking-widest text-[#999999]">
                              <th className="px-6 py-4">Item Specification</th>
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

                              return (
                                <tr key={i} className="text-sm font-bold text-american-blue/80 hover:bg-[#FBFBFB] transition-colors">
                                  <td className="px-6 py-4">{item.name}</td>
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
                                      <td className="px-6 py-4">{item.name}</td>
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
                            </div>
                            <ul className="space-y-2">
                              {gate.items.filter(i => i.category !== 'Labor' && i.category !== 'Demolition').map((gi, gii) => (
                                <li key={gii} className="flex justify-between items-center group">
                                  <span className="text-[11px] font-bold text-[#666666] group-hover:text-american-blue transition-colors">{gi.qty}x {gi.name}</span>
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

            <div className="bg-white rounded-[32px] p-1 overflow-hidden border-2 border-american-blue/5 shadow-lg">
              <table className="w-full text-left">
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
                    data.summary.filter(item => item.category !== 'Labor' && item.category !== 'Demolition').map((item, i) => (
                      <tr key={i} className="text-sm font-bold text-american-blue hover:bg-[#FBFBFB] transition-colors group">
                        <td className="px-8 py-5 flex items-center gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-american-blue/30" />
                          <span className="flex-1">{item.name}</span>
                        </td>
                        <td className="px-8 py-5 text-center">
                          <span className="px-3 py-1 bg-american-blue/5 text-american-blue rounded-full text-xs font-black print:bg-transparent print:p-0">{item.qty} {item.unit}</span>
                        </td>
                        <td className="px-8 py-5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-[#999999]">{item.category}</span>
                        </td>
                        {showPrices && <td className="px-8 py-5 text-right font-black text-american-blue/60 print:hidden">{formatCurrency(item.total)}</td>}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

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

            <div className="bg-white rounded-[32px] p-1 overflow-hidden border-2 border-dashed border-american-red/20 shadow-lg">
              <table className="w-full text-left">
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
                         <th className="px-6 py-3">Cost Category</th>
                         <th className="px-6 py-3 text-right whitespace-nowrap">Raw Total</th>
                         <th className="px-6 py-3 text-right whitespace-nowrap text-american-red">Markup</th>
                         <th className="px-6 py-3 text-right whitespace-nowrap">Tax</th>
                         <th className="px-6 py-3 text-right whitespace-nowrap text-american-blue">Final Adjusted Total</th>
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
                     </tbody>
                   </table>
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
        <div className="bg-[#1A1A1A] p-8 text-center border-t-8 border-american-red print:hidden">
          <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Lone Star Fence Works • Precision Manufacturing & Strategic Deployment</p>
        </div>
      </div>

    </div>
  );
}
