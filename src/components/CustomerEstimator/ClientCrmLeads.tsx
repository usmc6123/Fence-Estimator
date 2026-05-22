import React from 'react';
import { collection, query, where, getDocs, doc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  Users, TrendingUp, DollarSign, Search, MapPin, 
  Trash2, FileText, CheckCircle2, RotateCcw, AlertCircle, Bookmark, ExternalLink 
} from 'lucide-react';

interface ClientCrmLeadsProps {
  onLeadsCountChange?: (count: number) => void;
}

export default function ClientCrmLeads({ onLeadsCountChange }: ClientCrmLeadsProps) {
  const [leads, setLeads] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [statusFilter, setStatusFilter] = React.useState<string>('All');
  const [selectedLead, setSelectedLead] = React.useState<any | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Read leads from firebase
  const fetchLeads = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = query(
        collection(db, 'estimates'), 
        where('companyId', '==', 'lonestarfence')
      );
      const querySnapshot = await getDocs(q);
      const fetchedItems: any[] = [];
      querySnapshot.forEach((docSnap) => {
        const item = docSnap.data();
        // Include customer estimates
        if (item.isCustomerEstimate || item.customerName) {
          fetchedItems.push({
            id: docSnap.id,
            ...item
          });
        }
      });

      // Sort by newest address or date
      fetchedItems.sort((a, b) => {
        const dateA = a.date || a.createdAt || '';
        const dateB = b.date || b.createdAt || '';
        return dateB.localeCompare(dateA);
      });

      setLeads(fetchedItems);
      if (onLeadsCountChange) {
        onLeadsCountChange(fetchedItems.length);
      }
    } catch (err) {
      console.error('Failed to load leads from database:', err);
      setError('Could not connect to database. Showing fallback preview schema.');
      // Keep state clean
    } finally {
      setLoading(false);
    }
  }, [onLeadsCountChange]);

  React.useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Seed demo leads in case database is empty
  const handleSeedDemodb = async () => {
    try {
      setLoading(true);
      const mockLeads = [
        {
          id: 'est-cust-demo1',
          customerName: 'Georgia Martinez',
          customerEmail: 'georgia.m@gmail.com',
          customerPhone: '(512) 381-4028',
          customerAddress: '882 Pine Terrace Dr, Austin TX',
          customerStreet: '882 Pine Terrace Dr',
          date: new Date().toISOString(),
          status: 'New',
          jobStatus: 'Estimate Pending',
          linearFeet: 180,
          height: 6,
          fenceType: 'Cedar',
          defaultStyleId: 'wood-privacy',
          companyId: 'lonestarfence',
          isCustomerEstimate: true,
          subtotal: 16900,
          total: 20451.42,
          gateCount: 1,
          gateType: 'Single Swing',
          removeOldFence: false,
          material: 'Cedar',
          siteCondition: 'Level'
        },
        {
          id: 'est-cust-demo2',
          customerName: 'Marcus Vance',
          customerEmail: 'mvance@ymail.com',
          customerPhone: '(512) 336-1215',
          customerAddress: '1540 Westwood Ave, Austin TX',
          customerStreet: '1540 Westwood Ave',
          date: new Date(Date.now() - 86400000).toISOString(),
          status: 'Contacted',
          jobStatus: 'Contacted',
          linearFeet: 220,
          height: 4,
          fenceType: 'Chain Link',
          defaultStyleId: 'chain-link',
          companyId: 'lonestarfence',
          isCustomerEstimate: true,
          subtotal: 14500,
          total: 18699.12,
          gateCount: 2,
          gateType: 'Double Swing',
          removeOldFence: true,
          material: 'Chain Link',
          siteCondition: 'Slight Slope'
        },
        {
          id: 'est-cust-demo3',
          customerName: 'Claire Atherton',
          customerEmail: 'claire.atherton@hotmail.com',
          customerPhone: '(512) 995-3312',
          customerAddress: '43 Scenic View Way, Austin TX',
          customerStreet: '43 Scenic View Way',
          date: new Date(Date.now() - 86400000 * 3).toISOString(),
          status: 'Quoted',
          jobStatus: 'Quote Approved',
          linearFeet: 110,
          height: 6,
          fenceType: 'Metal',
          defaultStyleId: 'aluminum-ornamental',
          companyId: 'lonestarfence',
          isCustomerEstimate: true,
          subtotal: 13200,
          total: 16100.37,
          gateCount: 1,
          gateType: 'Sliding',
          removeOldFence: false,
          material: 'Metal',
          siteCondition: 'Steep Slope'
        }
      ];

      const batch = writeBatch(db);
      for (const item of mockLeads) {
        const docRef = doc(db, 'estimates', item.id);
        batch.set(docRef, item);
      }
      await batch.commit();
      await fetchLeads();
    } catch (err) {
      console.error('Error seeding demo leads', err);
    } finally {
      setLoading(false);
    }
  };

  // Update status
  const handleUpdateStatus = async (leadId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'estimates', leadId), {
        status: newStatus,
        jobStatus: newStatus === 'New' ? 'Estimate Pending' : newStatus === 'Contacted' ? 'Contacted' : 'Quote Approved',
        lastModified: new Date().toISOString()
      });
      
      // Update local state
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead((prev: any) => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      console.error('Error updating state status:', err);
    }
  };

  // Delete lead
  const handleDeleteLead = async (leadId: string) => {
    if (!window.confirm('Are you sure you want to delete this customer lead? This action is irreversible.')) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'estimates', leadId));
      setLeads(prev => prev.filter(l => l.id !== leadId));
      if (selectedLead && selectedLead.id === leadId) {
        setSelectedLead(null);
      }
      if (onLeadsCountChange) {
        onLeadsCountChange(leads.length - 1);
      }
    } catch (err) {
      console.error('Failed to delete lead document', err);
    }
  };

  // Compute metric cards values
  const totalLeadsCount = leads.length;
  const pipelineValue = leads.reduce((sum, lead) => sum + (lead.total || lead.estimateTotal || 0), 0);
  const avgProjectLength = totalLeadsCount > 0 
    ? Math.round(leads.reduce((sum, lead) => sum + (lead.linearFeet || 0), 0) / totalLeadsCount) 
    : 0;

  const getNormalizedStatus = (status: string) => {
    if (!status || status.toLowerCase() === 'active' || status === 'New') {
      return 'New';
    }
    return status;
  };

  // Filtered list
  const filteredLeads = leads.filter((lead) => {
    const name = (lead.customerName || '').toLowerCase();
    const address = (lead.customerAddress || lead.customerStreet || '').toLowerCase();
    const id = lead.id.toLowerCase();
    const query = searchQuery.toLowerCase();
    
    const matchesSearch = name.includes(query) || address.includes(query) || id.includes(query);
    
    const normStatus = getNormalizedStatus(lead.status);
    const matchesStatus = statusFilter === 'All' || normStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      
      {/* Banner / Header block */}
      <div className="bg-[#1e1b4b] text-white p-6 rounded-2xl border border-indigo-950 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden shadow-xl">
        <div className="space-y-1 z-10">
          <div className="flex items-center gap-2">
            <span className="bg-emerald-500 text-slate-950 font-black text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full">
              GHL Sync Tunnel Simulator
            </span>
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-white leading-none">
            Contractor Lead Management Hub
          </h2>
          <p className="text-xs text-slate-300 max-w-2xl leading-normal">
            Inspect incoming submissions made from both this interactive web application and your Squarespace code embedding. Set pipeline status coordinates or spool contract estimate PDFs instantly.
          </p>
        </div>
        <button
          onClick={fetchLeads}
          className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl border border-indigo-400/20 shadow-md transition-all z-10 flex items-center gap-2"
        >
          <RotateCcw size={12} className="animate-spin-slow" />
          Sync Pipeline Log
        </button>
      </div>

      {/* KPI Stats Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Total Leads Captured */}
        <div className="bg-white p-5 rounded-2xl border border-[#E5E5E5] flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="block text-[10px] font-black text-[#888888] uppercase tracking-wider">
              Total Lead Captures
            </span>
            <span className="block text-3xl font-black text-[#111111]">
              {totalLeadsCount} Leads
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              GHL Linked
            </span>
          </div>
          <div className="p-4 rounded-xl bg-blue-50 text-american-blue">
            <Users size={24} />
          </div>
        </div>

        {/* Total Pipeline value */}
        <div className="bg-white p-5 rounded-2xl border border-[#E5E5E5] flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="block text-[10px] font-black text-[#888888] uppercase tracking-wider">
              Contracts Pipeline Value
            </span>
            <span className="block text-3xl font-black text-[#111111]">
              ${Math.round(pipelineValue).toLocaleString()}
            </span>
            <span className="block text-xs font-medium text-[#666666]">
              Avg Quote: ${totalLeadsCount > 0 ? Math.round(pipelineValue / totalLeadsCount).toLocaleString() : 0}
            </span>
          </div>
          <div className="p-4 rounded-xl bg-emerald-50 text-emerald-600">
            <TrendingUp size={24} />
          </div>
        </div>

        {/* Avg Project Length */}
        <div className="bg-white p-5 rounded-2xl border border-[#E5E5E5] flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="block text-[10px] font-black text-[#888888] uppercase tracking-wider">
              Avg Project Length
            </span>
            <span className="block text-3xl font-black text-[#111111]">
              {avgProjectLength} Linear Feet
            </span>
            <span className="block text-xs font-medium text-[#666666]">
              Preferred spacing: 8 feet
            </span>
          </div>
          <div className="p-4 rounded-xl bg-amber-50 text-[#b45309]">
            <DollarSign size={24} />
          </div>
        </div>
      </div>

      {/* Main Table with Inspection panel split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Master List Table (7 columns) */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* Controls Bar */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-[#E5E5E5] flex flex-col sm:flex-row gap-3 justify-between items-center shadow-inner">
            
            {/* Search Input */}
            <div className="relative w-full sm:max-w-xs">
              <input
                type="text"
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-4 py-2 text-sm font-semibold rounded-xl border border-slate-300 bg-white placeholder-slate-400 focus:outline-none focus:border-american-blue"
              />
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search size={14} />
              </div>
            </div>

            {/* Filter Dropdowns and Actions */}
            <div className="flex gap-2 w-full sm:w-auto justify-end">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-[#333333] focus:outline-none focus:border-american-blue"
              >
                <option value="All">All Pipeline (Any Status)</option>
                <option value="New">New</option>
                <option value="Contacted">Contacted</option>
                <option value="Quoted">Quoted</option>
              </select>

              {leads.length === 0 && (
                <button
                  onClick={handleSeedDemodb}
                  className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-bold text-xs uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all"
                >
                  Reset Db / Seed Leads
                </button>
              )}
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-2xl border border-[#E5E5E5] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#E5E5E5]">
                <thead className="bg-slate-50 font-black text-[#555555] text-[10px] uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-6 py-4 text-left">Client Detail</th>
                    <th scope="col" className="px-6 py-4 text-left">Specifications</th>
                    <th scope="col" className="px-6 py-4 text-left">Estimate Total</th>
                    <th scope="col" className="px-6 py-4 text-left">Pipeline Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5] bg-white text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-[#888888]">
                        <div className="flex flex-col items-center gap-2">
                          <svg className="animate-spin h-6 w-6 text-american-blue" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>Syncing Leads pipeline...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredLeads.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-[#888888] space-y-3">
                        <div className="flex flex-col items-center gap-1">
                          <AlertCircle size={24} className="text-slate-300" />
                          <span className="font-bold">No Leads Found</span>
                          <span className="text-[11px] text-slate-400">Complete a homeowner estimate to sync leads directly to this logger.</span>
                        </div>
                        <button
                          onClick={handleSeedDemodb}
                          className="bg-american-blue text-white font-bold text-xs uppercase tracking-wider px-4 py-2 rounded-xl"
                        >
                          SeedTest Leads
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredLeads.map((lead) => {
                      const isSelected = selectedLead && selectedLead.id === lead.id;
                      const currentStatus = getNormalizedStatus(lead.status);
                      const statusColor = 
                        currentStatus === 'New' ? 'bg-green-100 text-green-800' :
                        currentStatus === 'Contacted' ? 'bg-blue-100 text-blue-800' :
                        'bg-amber-100 text-amber-800';

                      return (
                        <tr
                          key={lead.id}
                          onClick={() => setSelectedLead(lead)}
                          className={`cursor-pointer transition-all ${
                            isSelected ? 'bg-blue-50/60 font-semibold' : 'hover:bg-slate-50'
                          }`}
                        >
                          {/* Client Detail */}
                          <td className="px-6 py-4">
                            <div className="space-y-0.5">
                              <span className="block font-black text-[#111111]">{lead.customerName}</span>
                              <span className="block text-[10px] font-mono text-slate-400 font-bold uppercase">{lead.id.substring(0, 10)}</span>
                              <span className="flex items-center gap-1 text-[10px] text-[#666666]">
                                <MapPin size={10} className="text-[#888888]" />
                                <span className="truncate max-w-[150px]">{lead.customerAddress || lead.customerStreet}</span>
                              </span>
                            </div>
                          </td>

                          {/* specifications */}
                          <td className="px-6 py-4">
                            <div className="space-y-0.5 text-slate-600">
                              <span className="block font-bold text-[#333333]">
                                {lead.fenceType || lead.runs?.[0]?.name?.split('-')?.[1]?.trim() || 'Wood Privacy'}
                              </span>
                              <span className="block text-[10px]">
                                {lead.linearFeet} LF @ {lead.height}ft height
                              </span>
                              {lead.gateCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                                  <span className="h-1 w-1 rounded-full bg-indigo-500" />
                                  {lead.gateCount} x {lead.gateType || 'gate'}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Value */}
                          <td className="px-6 py-4 font-black text-sm text-slate-900">
                            ${Math.round(lead.total || lead.estimateTotal || 0).toLocaleString()}
                          </td>

                          {/* pipeline Status */}
                          <td className="px-6 py-4">
                            <div className="space-y-1">
                              <span className={`inline-block px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full ${statusColor}`}>
                                {currentStatus}
                              </span>
                              <span className="block text-[10px] text-slate-400 font-mono">
                                {lead.date ? new Date(lead.date).toLocaleDateString() : 'Pending'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Dynamic Inspection Details Panel (4 columns) */}
        <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-sm min-h-[400px]">
          {selectedLead ? (
            <div className="space-y-6">
              
              {/* Header inside Panel */}
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-black text-sm uppercase text-american-blue tracking-wider">
                    Lead Details View
                  </h3>
                  <p className="text-[10px] font-mono text-slate-500 font-bold uppercase">
                    ID: {selectedLead.id}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteLead(selectedLead.id)}
                  className="p-2 rounded-xl text-[#888888] hover:text-american-red hover:bg-[#FFF5F5] transition-all"
                  title="Delete lead document"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Status updater */}
              <div className="space-y-2 bg-slate-50 p-4 border border-slate-150 rounded-2xl">
                <label className="block text-[10px] font-black text-[#555555] uppercase tracking-wider">
                  Update CRM Status Link
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {['New', 'Contacted', 'Quoted'].map((st) => {
                    const isCurrent = selectedLead.status === st || (!selectedLead.status && st === 'New');
                    return (
                      <button
                        key={st}
                        onClick={() => handleUpdateStatus(selectedLead.id, st)}
                        className={`py-1.5 px-1 text-[10px] font-black uppercase tracking-wider text-center border rounded-lg transition-all ${
                          isCurrent
                            ? 'bg-american-blue text-white ring-2 ring-american-blue/25 border-american-blue'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Customer Core contact block */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black tracking-widest uppercase text-[#888888]">
                  Customer Dossier
                </h4>
                
                <div className="space-y-3 font-mono text-xs text-slate-600 bg-slate-50 p-4 border border-slate-150 rounded-2xl">
                  <div>
                    <span className="block text-[9px] text-slate-400">NAME:</span>
                    <strong className="text-slate-800">{selectedLead.customerName}</strong>
                  </div>
                  <div>
                    <span className="block text-[9px] text-slate-400">EMAIL:</span>
                    <a href={`mailto:${selectedLead.customerEmail}`} className="text-indigo-600 font-bold underline truncate block">
                      {selectedLead.customerEmail}
                    </a>
                  </div>
                  <div>
                    <span className="block text-[9px] text-slate-400">PHONE:</span>
                    <a href={`tel:${selectedLead.customerPhone}`} className="text-[#333333] font-bold block">
                      {selectedLead.customerPhone}
                    </a>
                  </div>
                  <div>
                    <span className="block text-[9px] text-slate-400">LOCATION:</span>
                    <a 
                      href={`https://maps.google.com/?q=${encodeURIComponent(selectedLead.customerAddress || selectedLead.customerStreet || '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-american-blue hover:underline font-bold flex items-center gap-1 mt-0.5"
                    >
                      <MapPin size={12} className="text-[#888888]" />
                      <span className="truncate">{selectedLead.customerAddress || selectedLead.customerStreet || 'Direct Link'}</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </div>

              {/* Estimate Breakdown inside details panel */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <h4 className="text-[10px] font-black tracking-widest uppercase text-[#888888]">
                  Fence Takeoff Breakdown
                </h4>
                
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Perimeter:</span>
                    <strong className="text-[#111111]">{selectedLead.linearFeet} LF</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Fence height:</span>
                    <strong className="text-[#111111]">{selectedLead.height} FT</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Materials:</span>
                    <strong className="text-[#111111]">{selectedLead.material || 'Standard Cedar'}</strong>
                  </div>
                  {selectedLead.gateCount > 0 && (
                    <div className="flex justify-between text-indigo-600 font-bold">
                      <span>Gates Entry:</span>
                      <span>{selectedLead.gateCount} x {selectedLead.gateType || 'Single'}</span>
                    </div>
                  )}
                  {selectedLead.removeOldFence && (
                    <div className="flex justify-between text-amber-700 font-bold">
                      <span>Demolition Layout:</span>
                      <span>Yes (Tear/Haul)</span>
                    </div>
                  )}
                </div>

                <div className="bg-[#111827] text-white p-4 rounded-xl border border-slate-800 flex items-center justify-between mt-4">
                  <div>
                    <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                      Synced Estimate Total
                    </span>
                    <span className="text-[10px] text-emerald-400 font-bold">GHL Pipeline Value</span>
                  </div>
                  <span className="text-xl font-black text-emerald-400">
                    ${Math.round(selectedLead.total || selectedLead.estimateTotal || 0).toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                onClick={() => window.print()}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-100 font-bold text-slate-700 hover:bg-slate-200 active:scale-95 py-3 text-xs uppercase tracking-wider transition-all"
              >
                <FileText size={14} />
                Spool Contract Estimate
              </button>

            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-16 space-y-3">
              <FileText size={48} className="text-slate-200" />
              <div className="space-y-1">
                <h4 className="font-black text-slate-600 text-sm uppercase tracking-wider">
                  Lead Detail View
                </h4>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  Click on any synchronized lead in the list to inspect client calculations, coordinates sheet, or maps.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
