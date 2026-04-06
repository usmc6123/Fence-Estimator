import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Plus, Filter, MoreVertical, Edit2, Trash2, 
  Package, Box, Layers, HardHat, Hammer, Ruler, 
  Grid, List as ListIcon, ImageIcon
} from 'lucide-react';
import { MATERIALS } from '../constants';
import { MaterialCategory, MaterialItem } from '../types';
import { cn, formatCurrency } from '../lib/utils';
import { X } from 'lucide-react';

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
};

export default function MaterialLibrary() {
  const [materials, setMaterials] = React.useState<MaterialItem[]>(MATERIALS);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<MaterialCategory | 'All'>('All');
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingMaterial, setEditingMaterial] = React.useState<MaterialItem | null>(null);

  const [formData, setFormData] = React.useState<Partial<MaterialItem>>({
    name: '',
    category: 'Post',
    unit: 'each',
    cost: 0,
    description: '',
    imageUrl: '',
  });

  const categories: (MaterialCategory | 'All')[] = [
    'All', 'Post', 'Rail', 'Picket', 'Panel', 'Gate', 'PostCap', 'Hardware', 'Concrete', 'Labor', 'Demolition', 'SitePrep', 'Fastener', 'Finishing', 'Consumable'
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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMaterial) {
      setMaterials(materials.map(m => m.id === editingMaterial.id ? { ...m, ...formData } as MaterialItem : m));
    } else {
      const newMaterial: MaterialItem = {
        ...formData,
        id: Math.random().toString(36).substr(2, 9),
      } as MaterialItem;
      setMaterials([newMaterial, ...materials]);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this material?')) {
      setMaterials(materials.filter(m => m.id !== id));
    }
  };

  return (
    <div className="space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tighter text-[#1A1A1A]">Material Library</h1>
          <p className="text-[#666666] mt-2">Manage your inventory and pricing for accurate estimates.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white rounded-xl border border-[#E5E5E5] p-1 shadow-sm">
            <button 
              onClick={() => setViewMode('grid')}
              className={cn("p-2 rounded-lg transition-all", viewMode === 'grid' ? "bg-[#F5F5F5] text-[#1A1A1A]" : "text-[#999999] hover:text-[#1A1A1A]")}
            >
              <Grid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn("p-2 rounded-lg transition-all", viewMode === 'list' ? "bg-[#F5F5F5] text-[#1A1A1A]" : "text-[#999999] hover:text-[#1A1A1A]")}
            >
              <ListIcon size={18} />
            </button>
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-6 py-3 text-sm font-bold text-white hover:bg-[#333333] transition-all shadow-lg active:scale-95"
          >
            <Plus size={18} />
            Add Material
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={20} />
          <input 
            type="text" 
            placeholder="Search materials, SKUs, or categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-2xl border border-[#E5E5E5] bg-white px-12 py-4 text-lg focus:border-[#1A1A1A] focus:outline-none shadow-sm transition-all"
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
                    ? "bg-[#1A1A1A] text-white shadow-md" 
                    : "text-[#666666] hover:bg-[#F5F5F5]"
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
                  className="group bg-white rounded-3xl p-6 border border-[#E5E5E5] shadow-sm hover:shadow-xl hover:border-[#1A1A1A] transition-all relative overflow-hidden"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="h-12 w-12 rounded-2xl bg-[#F9F9F9] flex items-center justify-center text-[#1A1A1A] group-hover:bg-[#1A1A1A] group-hover:text-white transition-colors">
                      <Icon size={24} />
                    </div>
                    <button className="p-2 text-[#999999] hover:text-[#1A1A1A] transition-colors">
                      <MoreVertical size={20} />
                    </button>
                  </div>

                  {item.imageUrl && (
                    <div className="mb-4 aspect-video rounded-xl overflow-hidden bg-[#F9F9F9] border border-[#F0F0F0]">
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                  )}

                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#999999]">{item.category}</span>
                    <h3 className="text-lg font-bold text-[#1A1A1A] leading-tight line-clamp-2">{item.name}</h3>
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
                        <span className="font-bold text-[#1A1A1A]">{item.name}</span>
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
                      step="0.01"
                      value={formData.cost}
                      onChange={(e) => setFormData({...formData, cost: Number(e.target.value)})}
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
                    className="flex-1 px-6 py-4 rounded-xl bg-[#1A1A1A] text-white font-bold text-sm hover:bg-[#333333] transition-all shadow-lg"
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
