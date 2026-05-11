import React from 'react';
import { 
  FileText, Search, Archive, RotateCcw, Trash2, 
  ChevronRight, Calendar, MapPin, DollarSign,
  Filter, MoreVertical, ExternalLink, Download,
  Shield, Check, Briefcase
} from 'lucide-react';
import { SavedEstimate, JobStatus } from '../types';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';

interface SavedEstimatesProps {
  savedEstimates: SavedEstimate[];
  setSavedEstimates: React.Dispatch<React.SetStateAction<SavedEstimate[]>>;
  onLoadEstimate: (estimate: SavedEstimate) => void;
  user: User | null;
}

export default function SavedEstimates({ savedEstimates, setSavedEstimates, onLoadEstimate, user }: SavedEstimatesProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'active' | 'archived'>('active');
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);

  const filteredEstimates = savedEstimates.filter(est => {
    const name = est.customerName || 'Unnamed Prospect';
    const address = est.customerAddress || 'No Address';
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         address.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'all' || est.status === filter;
    return matchesSearch && matchesFilter;
  });

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto py-20 px-4 text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-24 w-24 rounded-[32px] bg-american-blue/5 flex items-center justify-center text-american-blue rotate-6">
            <Shield size={48} />
          </div>
        </div>
        <div>
          <h2 className="text-3xl font-black text-american-blue uppercase tracking-tighter">Authentication Required</h2>
          <p className="text-sm font-bold text-[#999999] uppercase tracking-widest mt-2 max-w-md mx-auto">
            Please sign in on the sidebar to access the Lone Star company cloud dossiers.
          </p>
        </div>
      </div>
    );
  }

  const deleteEstimate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (deleteConfirmId === id) {
      if (!user) return;
      try {
        await deleteDoc(doc(db, 'estimates', id));
        setDeleteConfirmId(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `estimates/${id}`);
      }
    } else {
      setDeleteConfirmId(id);
      // Reset after 6 seconds if not clicked again
      setTimeout(() => setDeleteConfirmId(null), 6000);
    }
  };

  const toggleArchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) return;

    const estimate = savedEstimates.find(est => est.id === id);
    if (!estimate) return;

    try {
      await updateDoc(doc(db, 'estimates', id), {
        status: estimate.status === 'archived' ? 'active' : 'archived',
        lastModified: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `estimates/${id}`);
    }
  };

  const acceptJob = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) return;

    try {
      await updateDoc(doc(db, 'estimates', id), {
        jobStatus: 'Accepted',
        status: 'active', // Ensure it's not archived
        lastModified: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `estimates/${id}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-[40px] shadow-2xl border-2 border-american-blue/5">
        <div className="flex items-center gap-5">
          <div className="h-16 w-16 rounded-3xl bg-american-blue flex items-center justify-center text-white shadow-xl shadow-american-blue/20 rotate-3">
            <FileText size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-american-blue uppercase tracking-tighter">Saved Estimates</h1>
            <p className="text-xs font-bold text-american-red uppercase tracking-widest leading-none mt-1">VIRTUAL DOSSIER ARCHIVE</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Search */}
          <div className="relative group w-full sm:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-american-blue/30 group-focus-within:text-american-blue transition-colors" size={18} />
            <input
              type="text"
              placeholder="Search by name or address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-6 py-4 bg-[#F5F5F7] border-none rounded-2xl text-sm font-bold text-american-blue placeholder:text-[#999999] focus:ring-4 focus:ring-american-blue/10 outline-none transition-all"
            />
          </div>

          {/* Filter */}
          <div className="flex bg-[#F5F5F7] p-1.5 rounded-2xl">
            {(['active', 'archived', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  filter === f 
                    ? "bg-white text-american-blue shadow-lg shadow-american-blue/5 scale-105" 
                    : "text-[#999999] hover:text-american-blue"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filteredEstimates.map((estimate) => (
            <motion.div
              layout
              key={estimate.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                "group relative bg-white rounded-[32px] p-8 shadow-xl hover:shadow-2xl transition-all border-2",
                estimate.status === 'archived' ? "border-dashed border-[#EEEEEE] opacity-75" : "border-transparent hover:border-american-blue/10"
              )}
            >
              {/* Status Badge */}
              <div className="absolute top-4 right-4 flex gap-2">
                {estimate.jobStatus && estimate.jobStatus !== 'Proposed' && (
                  <div className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-600 border border-emerald-200">
                    {estimate.jobStatus}
                  </div>
                )}
                <div className={cn(
                  "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                  estimate.status === 'active' ? "bg-american-blue/10 text-american-blue" : "bg-[#999999]/10 text-[#999999]"
                )}>
                  {estimate.status}
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-black text-american-blue tracking-tight leading-tight group-hover:text-american-red transition-colors">
                    {estimate.customerName || 'Unnamed Prospect'}
                  </h3>
                  <div className="flex items-center gap-2 text-[#999999] mt-1">
                    <MapPin size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-widest truncate">{estimate.customerAddress || 'No Address'}</span>
                    {estimate.version && estimate.version > 1 && (
                      <span className="ml-2 px-1.5 py-0.5 bg-american-blue/5 text-american-blue text-[8px] font-black rounded uppercase">v{estimate.version}</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 py-4 border-y-2 border-[#F5F5F7]">
                  <div>
                    <p className="text-[8px] font-black text-[#CCCCCC] uppercase tracking-widest mb-1">Project Size</p>
                    <p className="text-sm font-bold text-american-blue">{estimate.linearFeet} LF</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-[#CCCCCC] uppercase tracking-widest mb-1">Created</p>
                    <p className="text-sm font-bold text-american-blue">
                      {new Date(estimate.lastModified || estimate.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                </div>

                 <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onLoadEstimate(estimate)}
                      className="relative z-30 p-3 bg-american-blue text-white rounded-xl shadow-lg shadow-american-blue/20 hover:scale-110 active:scale-95 transition-all"
                      title="Open in Estimator"
                    >
                      <ExternalLink size={18} className="pointer-events-none" />
                    </button>
                    {(!estimate.jobStatus || estimate.jobStatus === 'Proposed' || estimate.jobStatus === 'Draft') && (
                      <button
                        type="button"
                        onClick={(e) => acceptJob(estimate.id, e)}
                        className="relative z-30 p-3 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl shadow-lg shadow-emerald-500/20 hover:scale-110 active:scale-95 transition-all"
                        title="Accept Job"
                      >
                        <Check size={18} className="pointer-events-none" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => toggleArchive(estimate.id, e)}
                      className="relative z-30 p-3 bg-[#F5F5F7] text-[#999999] hover:text-american-blue rounded-xl hover:scale-110 active:scale-95 transition-all"
                      title={estimate.status === 'active' ? 'Archive' : 'Restore'}
                    >
                      {estimate.status === 'active' ? <Archive size={18} className="pointer-events-none" /> : <RotateCcw size={18} className="pointer-events-none" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => deleteEstimate(estimate.id, e)}
                    className={cn(
                      "relative z-30 p-3 rounded-xl transition-all hover:scale-110 active:scale-95 flex items-center gap-2",
                      deleteConfirmId === estimate.id 
                        ? "bg-american-red text-white animate-pulse px-4" 
                        : "bg-american-red/10 text-american-red hover:bg-american-red hover:text-white"
                    )}
                    title={deleteConfirmId === estimate.id ? "Confirm Delete" : "Delete Permanently"}
                  >
                    <Trash2 size={18} className="pointer-events-none" />
                    {deleteConfirmId === estimate.id && (
                      <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Sure?</span>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredEstimates.length === 0 && (
          <div className="col-span-full py-20 text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-20 w-20 rounded-full bg-[#F5F5F7] flex items-center justify-center text-[#CCCCCC]">
                <FileText size={40} />
              </div>
            </div>
            <div>
              <p className="text-xl font-black text-american-blue">No matching dossiers found</p>
              <p className="text-sm font-bold text-[#999999] uppercase tracking-widest">Adjust your search or filters</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
