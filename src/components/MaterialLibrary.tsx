import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Plus, Filter, MoreVertical, Edit2, Trash2, 
  Package, Box, Layers, HardHat, Hammer, Ruler, 
  Grid, List as ListIcon, ImageIcon, RotateCcw,
  CheckCircle2, XCircle, AlertCircle, Clock, AlertTriangle, ClipboardList, Printer
} from 'lucide-react';
import { MATERIALS, COMPANY_INFO } from '../constants';
import { MaterialCategory, MaterialItem, User } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';

const CATEGORY_ICONS: Record<string, any> = {
  'Post': Box,
  'Rail': Ruler,
  'Picket': Layers,
  'Panel': Grid,
  'Gate': Hammer,
  'Hardware': Package,
  'Concrete': HardHat,
  'Labor': HardHat,
  'PostCap': ImageIcon,
  'Metal': Layers,
};

// Price Freshness Logic
const getPriceStatus = (lastUpdate?: string) => {
  if (!lastUpdate) return 'preloaded' as const;
  
  const updateDate = new Date(lastUpdate);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - updateDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 30) return 'fresh' as const;
  return 'stale' as const;
};

function PriceIndicator({ status }: { status: 'fresh' | 'stale' | 'preloaded' }) {
  if (status === 'fresh') {
    return <div className="flex items-center gap-1.5" title="Price updated within last 30 days">
      <CheckCircle2 size={12} className="text-emerald-500" />
      <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Current</span>
    </div>;
  }
  if (status === 'stale') {
    return <div className="flex items-center gap-1.5" title="Price updated over 30 days ago">
      <CheckCircle2 size={12} className="text-amber-500" />
      <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Stale</span>
    </div>;
  }
  return <div className="flex items-center gap-1.5" title="Last updated was preloaded price">
    <XCircle size={12} className="text-american-red" />
    <span className="text-[9px] font-black text-american-red uppercase tracking-widest">Legacy</span>
  </div>;
}

interface MaterialLibraryProps {
  materials: MaterialItem[];
  setMaterials: React.Dispatch<React.SetStateAction<MaterialItem[]>>;
  user: User | null;
}

export default function MaterialLibrary({ materials, setMaterials, user }: MaterialLibraryProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<MaterialCategory | 'All'>('All');
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingMaterial, setEditingMaterial] = React.useState<MaterialItem | null>(null);

  // RFQ and Price Integrity Auditor states
  const [showRfqModal, setShowRfqModal] = React.useState(false);
  const [selectedRfqItemIds, setSelectedRfqItemIds] = React.useState<Record<string, boolean>>({});
  const [rfqNote, setRfqNote] = React.useState('Please provide your current wholesale pricing and lead times for the materials listed below.');
  const [rfqSupplierName, setRfqSupplierName] = React.useState('');
  const [librarySubTab, setLibrarySubTab] = React.useState<'inventory' | 'auditor'>('inventory');

  const getPriceStatusLocal = (lastUpdate?: string) => {
    if (!lastUpdate) return 'generic' as const;
    const updateDate = new Date(lastUpdate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - updateDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 30) return 'fresh' as const;
    return 'stale' as const;
  };

  const auditedMaterials = React.useMemo(() => {
    return materials.map(item => {
      const status = getPriceStatusLocal(item.lastPriceUpdate);
      const updateDate = item.lastPriceUpdate ? new Date(item.lastPriceUpdate) : null;
      const now = new Date();
      const ageDays = updateDate ? Math.floor((now.getTime() - updateDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
      return {
        ...item,
        priceStatus: status,
        ageDays,
        lastUpdateDateStr: updateDate ? updateDate.toLocaleDateString() : 'Never',
      };
    });
  }, [materials]);

  // Pre-select stale or generic items for RFQ
  React.useEffect(() => {
    const initial: Record<string, boolean> = {};
    auditedMaterials.forEach(item => {
      if (item.priceStatus === 'generic' || item.priceStatus === 'stale') {
        initial[item.id] = true;
      }
    });
    setSelectedRfqItemIds(prev => {
      const updated = { ...prev };
      let hasNew = false;
      Object.keys(initial).forEach(id => {
        if (updated[id] === undefined) {
          updated[id] = true;
          hasNew = true;
        }
      });
      return hasNew ? updated : prev;
    });
  }, [materials]);

  const [formData, setFormData] = React.useState<Partial<MaterialItem>>({
    name: '',
    category: 'Post',
    unit: 'each',
    cost: 0,
    sku: '',
    description: '',
    imageUrl: '',
  });

  const categories: (MaterialCategory | 'All')[] = [
    'All', 'Post', 'Rail', 'Picket', 'Panel', 'Gate', 'PostCap', 'Hardware', 'Concrete', 'Labor', 'Demolition', 'SitePrep', 'Fastener', 'Finishing', 'Consumable', 'Metal'
  ];

  const filteredMaterials = materials.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleOpenModal = (material?: MaterialItem) => {
    if (material) {
      setEditingMaterial(material);
      setFormData(material);
    } else {
      setEditingMaterial(null);
      setFormData({
        name: '',
        category: 'Post',
        unit: 'each',
        cost: 0,
        description: '',
        imageUrl: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = editingMaterial ? editingMaterial.id : Math.random().toString(36).substr(2, 9);
    
    // Track price updates
    const isPriceChanged = !editingMaterial || editingMaterial.cost !== formData.cost;
    
    const materialData = {
      ...formData,
      id,
      companyId: 'lonestarfence',
      lastPriceUpdate: isPriceChanged ? new Date().toISOString() : editingMaterial?.lastPriceUpdate
    } as MaterialItem;

    if (user) {
      try {
        const token = localStorage.getItem('company_admin_token');
        const response = await fetch('/api/materials/list', {
          method: editingMaterial ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(materialData)
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${response.status}`);
        }
        window.dispatchEvent(new Event('company_materials_updated'));
      } catch (error: any) {
        console.error(error);
        alert(error.message || "Failed to save material to server");
        return;
      }
    } else {
      if (editingMaterial) {
        setMaterials(prev => prev.map(m => m.id === editingMaterial.id ? materialData : m));
      } else {
        setMaterials(prev => [materialData, ...prev]);
      }
    }
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (user) {
      try {
        const token = localStorage.getItem('company_admin_token');
        const response = await fetch('/api/materials/list', {
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
        window.dispatchEvent(new Event('company_materials_updated'));
      } catch (error: any) {
        console.error(error);
        alert(error.message || "Failed to delete material from server");
      }
    } else {
      setMaterials(materials.filter(m => m.id !== id));
    }
  };

  return (
    <div className="space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tighter text-american-blue">Material Library</h1>
          <p className="text-[#666666] mt-2">Manage your inventory and pricing for accurate estimates.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white rounded-xl border border-[#E5E5E5] p-1 shadow-sm">
            <button 
              onClick={async () => {
                if (confirm('Reset all materials to factory defaults? Your custom changes will be lost.')) {
                  if (user) {
                    try {
                      const batch = writeBatch(db);
                      MATERIALS.forEach(mat => {
                        batch.set(doc(db, 'materials', mat.id), { ...mat, companyId: 'lonestarfence' });
                      });
                      await batch.commit();
                      window.dispatchEvent(new Event('company_materials_updated'));
                      console.log('Reset complete');
                    } catch (error) {
                      handleFirestoreError(error, OperationType.WRITE, 'materials/reset');
                    }
                  } else {
                    setMaterials(MATERIALS);
                  }
                }
              }}
              className="p-2 rounded-lg text-[#999999] hover:text-red-500 transition-all"
              title="Reset All Materials to Defaults"
            >
              <RotateCcw size={18} />
            </button>
            <div className="w-px h-4 bg-[#E5E5E5] self-center mx-1" />
            <button 
              onClick={() => setViewMode('grid')}
              className={cn("p-2 rounded-lg transition-all", viewMode === 'grid' ? "bg-american-blue/10 text-american-blue" : "text-[#999999] hover:text-american-blue")}
            >
              <Grid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn("p-2 rounded-lg transition-all", viewMode === 'list' ? "bg-american-blue/10 text-american-blue" : "text-[#999999] hover:text-american-blue")}
            >
              <ListIcon size={18} />
            </button>
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 rounded-xl bg-american-blue px-6 py-3 text-sm font-bold text-white hover:bg-american-blue/90 transition-all shadow-lg active:scale-95"
          >
            <Plus size={18} />
            Add Material
          </button>
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <div className="flex border-b border-[#E5E5E5] gap-8">
        <button
          onClick={() => setLibrarySubTab('inventory')}
          className={cn(
            "pb-4 text-sm font-black uppercase tracking-widest border-b-2 transition-all cursor-pointer",
            librarySubTab === 'inventory'
              ? "border-american-blue text-american-blue"
              : "border-transparent text-[#999999] hover:text-american-blue"
          )}
        >
          Inventory Catalog ({materials.length})
        </button>
        <button
          onClick={() => setLibrarySubTab('auditor')}
          className={cn(
            "pb-4 text-sm font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 cursor-pointer",
            librarySubTab === 'auditor'
              ? "border-american-blue text-american-blue"
              : "border-transparent text-[#999999] hover:text-american-blue"
          )}
        >
          <Clock size={16} className={librarySubTab === 'auditor' ? "text-american-blue animate-pulse" : ""} />
          Price Freshness Auditor & RFQs
          {auditedMaterials.filter(item => item.priceStatus !== 'fresh').length > 0 && (
            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ml-1">
              {auditedMaterials.filter(item => item.priceStatus !== 'fresh').length} Outdated
            </span>
          )}
        </button>
      </div>

      {librarySubTab === 'inventory' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Search & Filters */}
          <div className="flex flex-col gap-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={20} />
          <input 
            type="text" 
            placeholder="Search materials, SKUs, or categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-2xl border border-[#E5E5E5] bg-white px-12 py-4 text-lg focus:border-american-blue focus:outline-none shadow-sm transition-all"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-[#E5E5E5] shadow-sm">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                  selectedCategory === cat 
                    ? "bg-american-blue text-white shadow-md" 
                    : "text-[#666666] hover:bg-[#F5F5F5] hover:text-american-blue"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Materials Grid/List */}
      <AnimatePresence mode="popLayout">
        {viewMode === 'grid' ? (
          <motion.div 
            layout
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {filteredMaterials.map((item) => {
              const Icon = CATEGORY_ICONS[item.category] || Box;
              return (
                <motion.div
                  layout
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group bg-white rounded-3xl p-6 border border-[#E5E5E5] shadow-sm hover:shadow-xl hover:border-american-blue transition-all relative overflow-hidden"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="h-12 w-12 rounded-2xl bg-[#F9F9F9] flex items-center justify-center text-american-blue group-hover:bg-american-blue group-hover:text-white transition-colors">
                      <Icon size={24} />
                    </div>
                    <button className="p-2 text-[#999999] hover:text-american-blue transition-colors">
                      <MoreVertical size={20} />
                    </button>
                  </div>

                  {item.imageUrl && (
                    <div className="mb-4 aspect-video rounded-xl overflow-hidden bg-[#F9F9F9] border border-[#F0F0F0]">
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[#999999]">{item.category}</span>
                      <PriceIndicator status={getPriceStatus(item.lastPriceUpdate)} />
                    </div>
                    <h3 className="text-lg font-bold text-[#1A1A1A] leading-tight line-clamp-2">{item.name}</h3>
                    {item.sku && (
                      <p className="text-[10px] font-mono text-american-blue uppercase tracking-tighter">SKU: {item.sku}</p>
                    )}
                  </div>

                  <div className="mt-6 pt-6 border-t border-[#F5F5F5] flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-2xl font-bold text-[#1A1A1A]">{formatCurrency(item.cost)}</span>
                      <span className="text-[10px] text-[#999999] uppercase font-bold">Per {item.unit}</span>
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => handleOpenModal(item)}
                        className="p-2 rounded-lg text-[#666666] hover:bg-[#F5F5F5] hover:text-[#1A1A1A] transition-all"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(item.id)}
                        className="p-2 rounded-lg text-[#666666] hover:bg-red-50 hover:text-red-600 transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          <motion.div 
            layout
            className="bg-white rounded-3xl border border-[#E5E5E5] shadow-sm overflow-hidden"
          >
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F9F9F9] border-b border-[#E5E5E5]">
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[#666666]">Material</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[#666666]">Category</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[#666666]">Unit</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[#666666]">Cost</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-[#666666] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F5]">
                {filteredMaterials.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F9F9F9] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-[#F5F5F5] flex items-center justify-center text-[#999999]">
                            <Package size={20} />
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="font-bold text-[#1A1A1A]">{item.name}</span>
                          {item.sku && <span className="text-[9px] font-mono text-american-blue/60 uppercase">SKU: {item.sku}</span>}
                          <PriceIndicator status={getPriceStatus(item.lastPriceUpdate)} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-md bg-[#F5F5F5] text-[10px] font-bold uppercase tracking-wider text-[#666666]">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-[#666666] capitalize">{item.unit}</td>
                    <td className="px-6 py-4 font-mono font-bold text-[#1A1A1A]">{formatCurrency(item.cost)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => handleOpenModal(item)}
                          className="p-2 rounded-lg text-[#666666] hover:bg-white hover:shadow-sm transition-all"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
                          className="p-2 rounded-lg text-[#666666] hover:bg-red-50 hover:text-red-600 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>

      {filteredMaterials.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-20 w-20 rounded-full bg-[#F5F5F5] flex items-center justify-center text-[#999999] mb-4">
            <Search size={32} />
          </div>
          <h3 className="text-xl font-bold text-[#1A1A1A]">No materials found</h3>
          <p className="text-[#666666] mt-2">Try adjusting your search or category filters.</p>
        </div>
      )}
        </div>
      )}

      {/* Supplier Request-for-Quote (RFQ) & Price Freshness Auditor Panel */}
      {librarySubTab === 'auditor' && (
        <div className="pt-4 space-y-8 print:hidden text-left animate-in fade-in duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-american-blue/5 text-american-blue flex items-center justify-center shadow-md">
              <Clock size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-american-blue tracking-tight uppercase">Price Integrity & RFQ Auditor</h2>
              <p className="text-xs text-[#666666]">Verify library-wide pricing freshness and generate Request-for-Quote matrices.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowRfqModal(true)}
            disabled={auditedMaterials.filter(item => selectedRfqItemIds[item.id]).length === 0}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              auditedMaterials.filter(item => selectedRfqItemIds[item.id]).length > 0
                ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/10 hover:scale-[1.02] active:scale-95 cursor-pointer"
                : "bg-gray-100 text-[#999999] cursor-not-allowed"
            )}
          >
            <ClipboardList size={14} />
            Generate Supplier RFQ ({auditedMaterials.filter(item => selectedRfqItemIds[item.id]).length} items)
          </button>
        </div>

        {/* Global Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-red-50 border border-red-100 rounded-2xl p-5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-red-700">Generic Pricing</span>
              <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            </div>
            <p className="text-3xl font-black text-[#1A1A1A] tabular-nums">
              {auditedMaterials.filter(item => item.priceStatus === 'generic').length}
            </p>
            <p className="text-xs text-red-600 font-bold uppercase tracking-wide">Never updated (Default Pricing)</p>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Stale pricing</span>
              <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            </div>
            <p className="text-3xl font-black text-[#1A1A1A] tabular-nums">
              {auditedMaterials.filter(item => item.priceStatus === 'stale').length}
            </p>
            <p className="text-xs text-amber-600 font-bold uppercase tracking-wide">Updated &gt; 30 Days Ago</p>
          </div>

          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Fresh current pricing</span>
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </div>
            <p className="text-3xl font-black text-[#1A1A1A] tabular-nums">
              {auditedMaterials.filter(item => item.priceStatus === 'fresh').length}
            </p>
            <p className="text-xs text-emerald-600 font-bold uppercase tracking-wide">Reliable active prices (&lt; 30 Days)</p>
          </div>
        </div>

        {/* List of Legacy & Outdated items */}
        <div className="bg-white rounded-3xl overflow-hidden border-2 border-american-blue/5 shadow-md">
          <div className="p-4 px-6 bg-[#FAFAFA] border-b border-[#E5E5E5] flex justify-between items-center flex-wrap gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-american-blue flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-500" />
              Generic and Outdated Pricing Ledger
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const all: Record<string, boolean> = {};
                  auditedMaterials.forEach(item => {
                    if (item.priceStatus !== 'fresh') {
                      all[item.id] = true;
                    }
                  });
                  setSelectedRfqItemIds(all);
                }}
                className="text-[10px] font-black uppercase tracking-widest text-[#666666] hover:text-american-blue transition-colors cursor-pointer"
              >
                Select All Outdated
              </button>
              <span className="text-[#CCCCCC]">|</span>
              <button
                type="button"
                onClick={() => setSelectedRfqItemIds({})}
                className="text-[10px] font-black uppercase tracking-widest text-[#666666] hover:text-american-red transition-colors cursor-pointer"
              >
                Deselect All
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF9F6] border-b border-[#E5E5E5] text-[10px] font-black uppercase tracking-widest text-[#888888]">
                  <th className="px-6 py-4 w-12 text-center">RFQ</th>
                  <th className="px-6 py-4">Item Specification</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Status & Age</th>
                  <th className="px-6 py-4 text-right">Current cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F5]">
                {auditedMaterials.filter(item => item.priceStatus !== 'fresh').length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-10 text-center text-sm font-bold text-[#c0c0c0] italic">
                      Zero outdated items found! All database items have fresh custom prices.
                    </td>
                  </tr>
                ) : (
                  auditedMaterials.filter(item => item.priceStatus !== 'fresh').map((item) => (
                    <tr key={item.id} className="text-sm font-bold text-american-blue hover:bg-[#F9F9F9] transition-colors">
                      <td className="px-6 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={!!selectedRfqItemIds[item.id]}
                          onChange={(e) => {
                            setSelectedRfqItemIds(prev => ({
                              ...prev,
                              [item.id]: e.target.checked
                            }));
                          }}
                          className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-[#CCCCCC] rounded cursor-pointer"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-[13px] font-black text-[#1A1A1A]">{item.name}</span>
                          {item.sku && <span className="text-[9px] font-mono uppercase text-[#999999] tracking-widest mt-0.5">SKU: {item.sku}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[#888888]">{item.category}</span>
                      </td>
                      <td className="px-6 py-4">
                        {item.priceStatus === 'generic' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 text-[8px] font-black uppercase tracking-widest border border-red-200">
                            Generic Price
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[8px] font-black uppercase tracking-widest border border-amber-200">
                              Stale Price
                            </span>
                            <span className="text-[10px] font-bold text-[#888888]">({item.ageDays} days old)</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums text-[#1A1A1A] font-black">
                        {formatCurrency(item.cost)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* Printable RFQ Modal Overlay */}
      <AnimatePresence>
        {showRfqModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRfqModal(false)}
              className="absolute inset-0 bg-[#1A1A1A]/40 backdrop-blur-sm print:hidden"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col p-1 print:absolute print:inset-0 print:m-0 print:max-h-none print:shadow-none print:w-full print:rounded-none"
            >
              {/* Header and Controls (hidden in print) */}
              <div className="p-6 bg-[#FAFAFA] border-b border-[#EEEEEE] flex justify-between items-center print:hidden flex-wrap gap-2 text-left">
                <div>
                  <h3 className="text-lg font-black text-american-blue uppercase tracking-tight">Generate Supplier RFQ Sheet</h3>
                  <p className="text-xs text-[#666666]">Bundle outdated/generic materials into a customizable quote form.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#E11D48] hover:bg-[#BE123C] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95 shadow-md shadow-american-red/10 cursor-pointer"
                  >
                    <Printer size={14} />
                    Print / Save PDF
                  </button>
                  <button 
                    onClick={() => setShowRfqModal(false)}
                    className="p-2 text-[#999999] hover:text-[#333333] hover:bg-[#EAEAEA] rounded-xl transition-all cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* RFQ Customiser Section (hidden in print) */}
              <div className="p-6 bg-amber-500/[0.02] border-b border-dashed border-[#EEEEEE] grid gap-4 sm:grid-cols-2 print:hidden text-left">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-[#666666] flex items-center gap-1">
                    Supplying Distributor Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Cedar Supply Depot Inc."
                    value={rfqSupplierName}
                    onChange={(e) => setRfqSupplierName(e.target.value)}
                    className="w-full rounded-xl border-2 border-american-blue/10 bg-white px-4 py-2 text-sm focus:border-american-blue focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-[#666666] flex items-center gap-1">
                    Custom Quote Message (Top of Sheet)
                  </label>
                  <input
                    placeholder="Provide your wholesale pricing and lead times..."
                    value={rfqNote}
                    onChange={(e) => setRfqNote(e.target.value)}
                    className="w-full rounded-xl border-2 border-american-blue/10 bg-white px-4 py-2 text-sm focus:border-american-blue focus:outline-none"
                  />
                </div>
              </div>

              {/* Scrollable Sheet Content (beautiful design & readable) */}
              <div className="flex-1 overflow-y-auto p-12 space-y-8 print:overflow-visible print:p-0 print:space-y-6 text-left">
                
                {/* Printable Header Profile */}
                <div className="flex justify-between items-start pb-6 border-b-4 border-american-blue">
                  <div className="space-y-1">
                    <p className="text-2xl font-black uppercase tracking-tight text-american-blue">
                      {COMPANY_INFO.name}
                    </p>
                    <p className="text-xs font-black text-american-red uppercase tracking-widest">
                      Request for Supplier Quotation (RFQ)
                    </p>
                  </div>
                  <div className="text-right space-y-0.5">
                    <p className="text-sm font-black text-american-blue">{COMPANY_INFO.phone}</p>
                    <p className="text-xs text-[#666666] font-bold">{COMPANY_INFO.address}</p>
                    <p className="text-xs text-american-red font-black uppercase tracking-wider">{new Date().toLocaleDateString()}</p>
                  </div>
                </div>

                {/* Sender/Recipient Detail */}
                <div className="grid grid-cols-2 gap-8 py-4 border-b border-dashed border-[#EEEEEE]">
                  <div className="space-y-1 bg-[#FDFDFD] p-5 rounded-2xl border-2 border-[#F5F5F5]">
                    <p className="text-[10px] font-black text-american-red uppercase tracking-widest">To Supplier / Distributor</p>
                    {rfqSupplierName ? (
                      <p className="text-md font-black text-american-blue">{rfqSupplierName}</p>
                    ) : (
                      <p className="text-sm font-medium italic text-[#999999] print:text-black">__________________________________</p>
                    )}
                    <p className="text-[10px] text-[#888888] mt-1">Please quote your current best wholesale price list matching items below.</p>
                  </div>
                  <div className="space-y-1 bg-[#FDFDFD] p-5 rounded-2xl border-2 border-[#F5F5F5]">
                    <p className="text-[10px] font-black text-american-blue uppercase tracking-widest">Sender Details</p>
                    <p className="text-md font-black text-american-blue">Lone Star Materials Division</p>
                    <p className="text-[10px] text-[#666666]">{COMPANY_INFO.address}</p>
                  </div>
                </div>

                {/* Instruction Memo */}
                <div className="p-5 bg-[#FAF9F6] border-2 border-[#EBEAE5] rounded-3xl space-y-1">
                  <p className="text-[10px] font-black uppercase text-american-blue tracking-widest">Pricing Memo & Instructions</p>
                  <p className="text-sm text-[#444444] leading-relaxed italic">
                    "{rfqNote}"
                  </p>
                </div>

                {/* Materials Detail Sheet Table */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#555555] border-b-2 border-american-blue pb-2">
                    Materials Requested for Quote
                  </p>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-american-blue text-[10px] font-black uppercase tracking-widest text-american-blue">
                        <th className="py-3 text-center w-12 bg-[#FBFBFB]">#</th>
                        <th className="py-3 px-4">Item Specification / Product Type</th>
                        <th className="py-3 text-center w-24">Library Unit</th>
                        <th className="py-3 text-right w-28 pr-4 border-r border-[#DDDDDD] bg-[#FAFAFA]">Our Cached Cost</th>
                        <th className="py-3 w-40 pl-4 border-r border-[#DDDDDD] bg-amber-500/[0.02]">supplier quoted Price (Wholesale)</th>
                        <th className="py-3 w-32 pl-4 bg-amber-500/[0.02]">availability / Lead</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEEEEE] text-sm font-bold">
                      {auditedMaterials
                        .filter(item => selectedRfqItemIds[item.id])
                        .map((item, idx) => (
                          <tr key={item.id} className="text-sm hover:bg-[#FDFDFD] font-bold">
                            <td className="py-4 text-center text-xs font-black text-[#888888] bg-[#FBFBFB]">{idx + 1}</td>
                            <td className="py-4 px-4">
                              <div className="flex flex-col">
                                <span className="font-extrabold text-[#111111]">{item.name}</span>
                                {item.sku ? (
                                  <span className="text-[9px] font-mono text-american-blue uppercase tracking-widest mt-0.5">SKU: {item.sku}</span>
                                ) : (
                                  <span className="text-[8px] text-[#999999] uppercase tracking-wider mt-0.5">No SKU specified</span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 text-center font-black text-[#333333] capitalize">
                              {item.unit}
                            </td>
                            <td className="py-4 text-right pr-4 font-black text-[#666666] tabular-nums bg-[#FDFDFD] border-r border-[#DDDDDD]">
                              {formatCurrency(item.cost)}
                            </td>
                            {/* Empty fields for supplier entry */}
                            <td className="py-4 pl-4 border-r border-[#DDDDDD] bg-amber-500/[0.01]">
                              <div className="h-7 w-[95%] border border-dashed border-[#CCCCCC] rounded bg-white print:border-solid print:border-[#111111] print:h-8" />
                            </td>
                            <td className="py-4 pl-4 bg-amber-500/[0.01]">
                              <div className="h-7 w-[95%] border border-dashed border-[#CCCCCC] rounded bg-white print:border-solid print:border-[#111111] print:h-8" />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* Printable Signature block */}
                <div className="pt-16 grid grid-cols-2 gap-12">
                  <div className="space-y-8">
                    <p className="text-xs uppercase font-extrabold tracking-widest text-[#555555]">Authorized Supplying Agent Representative:</p>
                    <div className="space-y-1">
                      <div className="border-b border-american-blue h-8 w-full" />
                      <p className="text-[10px] text-[#888888] uppercase font-bold">Print Name / Title</p>
                    </div>
                    <div className="space-y-1">
                      <div className="border-b border-american-blue h-8 w-full" />
                      <p className="text-[10px] text-[#888888] uppercase font-bold">Signature / Date</p>
                    </div>
                  </div>
                  <div className="space-y-8">
                    <p className="text-xs uppercase font-extrabold tracking-widest text-[#555555]">Receiving Agent Stamp/Approval:</p>
                    <div className="h-28 w-44 rounded-xl border-2 border-dashed border-american-blue/30 flex items-center justify-center p-4 text-center">
                      <span className="text-[9px] text-[#999999] uppercase font-bold tracking-widest">Lone Star Seal & Sign-off Block</span>
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-[#1A1A1A]/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-[#F5F5F5] flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight">
                  {editingMaterial ? 'Edit Material' : 'Add New Material'}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-[#F5F5F5] rounded-xl transition-all">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleSave} className="p-8 space-y-6">
                {formData.aliases && formData.aliases.length > 0 && (
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-2">
                    <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Remembered Supplier Names</p>
                    <div className="flex flex-wrap gap-2">
                      {formData.aliases.map((alias, i) => (
                        <span key={i} className="px-2 py-1 bg-white border border-emerald-200 rounded-md text-[10px] font-bold text-emerald-700">
                          {alias}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Material Name</label>
                    <input 
                      required
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-3 text-sm focus:border-[#1A1A1A] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Category</label>
                    <select 
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value as MaterialCategory})}
                      className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-3 text-sm focus:border-[#1A1A1A] focus:outline-none"
                    >
                      {categories.filter(c => c !== 'All').map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Unit</label>
                    <select 
                      value={formData.unit}
                      onChange={(e) => setFormData({...formData, unit: e.target.value as any})}
                      className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-3 text-sm focus:border-[#1A1A1A] focus:outline-none"
                    >
                      {['each', 'lf', 'bag', 'hour', 'cu yd', 'box', 'gallon', 'trip'].map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Cost (USD)</label>
                    <input 
                      required
                      type="number" 
                      step="0.001"
                      value={formData.cost}
                      onChange={(e) => setFormData({...formData, cost: Number(e.target.value)})}
                      className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-3 text-sm focus:border-[#1A1A1A] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">SKU / Part Number</label>
                    <input 
                      type="text" 
                      value={formData.sku || ''}
                      onChange={(e) => setFormData({...formData, sku: e.target.value})}
                      placeholder="e.g. 100-32-6"
                      className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-3 text-sm focus:border-[#1A1A1A] focus:outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Image URL (Optional)</label>
                  <input 
                    type="url" 
                    value={formData.imageUrl}
                    onChange={(e) => setFormData({...formData, imageUrl: e.target.value})}
                    className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-3 text-sm focus:border-[#1A1A1A] focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Description</label>
                  <textarea 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-3 text-sm focus:border-[#1A1A1A] focus:outline-none h-24 resize-none"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-4 rounded-xl border border-[#E5E5E5] font-bold text-sm hover:bg-[#F5F5F5] transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-6 py-4 rounded-xl bg-american-blue text-white font-bold text-sm hover:bg-american-blue/90 transition-all shadow-lg"
                  >
                    {editingMaterial ? 'Save Changes' : 'Add Material'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
