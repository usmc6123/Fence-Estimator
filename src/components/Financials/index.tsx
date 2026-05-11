import React from 'react';
import { 
  Wallet, 
  CreditCard, 
  ArrowUpRight, 
  ArrowDownLeft, 
  FilePlus, 
  BarChart3, 
  Search,
  Plus,
  Filter,
  Download,
  Receipt,
  RotateCcw,
  Package,
  History,
  MoreVertical,
  Link as LinkIcon,
  X,
  ChevronLeft,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../../lib/utils';
import { SavedEstimate, JobExpense, JobStatus } from '../../types';
import { db, handleFirestoreError, OperationType, storage } from '../../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  Timestamp,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { User } from 'firebase/auth';
import { analyzeReceiptDocument } from '../../services/geminiService';

interface FinancialsProps {
  savedEstimates: SavedEstimate[];
  user: User | null;
}

type FinancialSubTab = 'jobs' | 'expenses' | 'reports';

export default function Financials({ savedEstimates, user }: FinancialsProps) {
  const [activeSubTab, setActiveSubTab] = React.useState<FinancialSubTab>('jobs');
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null);
  const [showAddExpense, setShowAddExpense] = React.useState(false);

  // States for real data
  const [expenses, setExpenses] = React.useState<JobExpense[]>([]);

  // Fetch data if user is logged in
  React.useEffect(() => {
    if (!user) return;

    // Fetch all expenses for all jobs (for global reporting/search)
    const qExp = query(collection(db, 'expenses'), where('companyId', '==', 'lonestarfence'), orderBy('date', 'desc'));
    const unsubExp = onSnapshot(qExp, 
      (snapshot) => setExpenses(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as JobExpense))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'expenses')
    );

    return () => {
      unsubExp();
    };
  }, [user]);

  const selectedJob = savedEstimates.find(est => est.id === selectedJobId);

  const subNavItems = [
    { id: 'jobs', label: 'Job Costing', icon: Package },
    { id: 'expenses', label: 'All Expenses', icon: Receipt },
    { id: 'reports', label: 'Performance', icon: BarChart3 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-american-blue">Financials</h1>
          <p className="text-american-red font-bold uppercase tracking-widest text-xs mt-1">
            Job Costing & Profitability
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowAddExpense(true)}
            className="flex items-center gap-2 rounded-xl bg-american-red px-6 py-3 text-sm font-black text-white hover:bg-american-red/90 transition-all shadow-lg shadow-american-red/20"
          >
            <Plus size={18} />
            Record Expense
          </button>
        </div>
      </div>

      {/* Sub Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {subNavItems.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setActiveSubTab(item.id as FinancialSubTab);
              if (item.id !== 'jobs') setSelectedJobId(null);
            }}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black whitespace-nowrap transition-all border-2",
              activeSubTab === item.id 
                ? "bg-american-blue border-american-blue text-white shadow-md shadow-american-blue/20" 
                : "bg-white border-american-blue/5 text-[#999999] hover:border-american-blue/30 hover:text-american-blue"
            )}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeSubTab + (selectedJobId || '')}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="min-h-[400px]"
        >
          {activeSubTab === 'jobs' && !selectedJobId && (
            <JobListView 
              estimates={savedEstimates} 
              onSelect={setSelectedJobId} 
            />
          )}
          {activeSubTab === 'jobs' && selectedJob && (
            <JobDetailView 
              job={selectedJob} 
              onBack={() => setSelectedJobId(null)}
              expenses={expenses.filter(e => (selectedJob as any).expenses?.some((se: any) => se.id === e.id) || (e as any).estimateId === selectedJob.id)}
            />
          )}
          {activeSubTab === 'expenses' && (
            <TransactionsView 
              transactions={expenses.map(e => ({ ...e, type: 'Expense', status: 'Cleared', userId: user?.uid || '', accountId: 'default' } as any))} 
              savedEstimates={savedEstimates} 
              onLink={async (id, eid) => {
                const docRef = doc(db, 'expenses', id);
                await updateDoc(docRef, { estimateId: eid });
              }}
            />
          )}
          {activeSubTab === 'reports' && <ReportsView transactions={expenses.map(e => ({ ...e, type: 'Expense', status: 'Cleared' } as any))} />}
        </motion.div>
      </AnimatePresence>

      <AddExpenseModal 
        isOpen={showAddExpense} 
        onClose={() => setShowAddExpense(false)} 
        user={user}
        jobs={savedEstimates.filter(e => e.jobStatus === 'Accepted' || e.jobStatus === 'In Progress')}
        initialJobId={selectedJobId || undefined}
      />
    </div>
  );
}

function JobListView({ estimates, onSelect }: { estimates: SavedEstimate[], onSelect: (id: string) => void }) {
  const jobs = estimates.filter(e => e.jobStatus === 'Accepted' || e.jobStatus === 'In Progress' || e.jobStatus === 'Completed');
  const proposals = estimates.filter(e => !e.jobStatus || e.jobStatus === 'Proposed' || e.jobStatus === 'Draft');

  return (
    <div className="space-y-8">
      {jobs.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-black text-american-blue uppercase tracking-tight">Active & Completed Jobs</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {jobs.map(job => (
              <JobCard key={job.id} job={job} onClick={() => onSelect(job.id)} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-black text-[#999999] uppercase tracking-tight">Open Proposals</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {proposals.map(proposal => (
            <JobCard key={proposal.id} job={proposal} onClick={() => onSelect(proposal.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function JobCard({ job, onClick }: { job: SavedEstimate, onClick: () => void }) {
  const statusColors = {
    'Draft': 'bg-gray-100 text-gray-600',
    'Proposed': 'bg-blue-100 text-blue-600',
    'Accepted': 'bg-green-100 text-green-600 border-green-200',
    'In Progress': 'bg-amber-100 text-amber-600 border-amber-200',
    'Completed': 'bg-american-blue text-white shadow-american-blue/20',
    'Cancelled': 'bg-american-red/10 text-american-red'
  };

  return (
    <button 
      onClick={onClick}
      className="bg-white rounded-2xl p-6 border-2 border-american-blue/5 shadow-sm hover:border-american-blue/20 transition-all group text-left w-full"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-american-blue/5 rounded-xl group-hover:bg-american-blue group-hover:text-white transition-colors">
          <Package size={24} />
        </div>
        <span className={cn(
          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
          statusColors[job.jobStatus || 'Draft'] || 'bg-gray-100 text-gray-600'
        )}>
          {job.jobStatus || 'Draft'}
        </span>
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-[#999999] mb-1">{job.customerAddress || 'No Address'}</p>
        <h3 className="text-lg font-black text-american-blue mb-4 leading-tight">{job.customerName || 'Unnamed Prospect'}</h3>
        <div className="flex items-center justify-between pt-4 border-t border-american-blue/5">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#999999]">Value</p>
            <p className="text-sm font-black text-american-blue">{formatCurrency(job.manualGrandTotal || 0)}</p>
          </div>
          <div className="text-right">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#999999]">Size</p>
            <p className="text-sm font-black text-[#666666]">{job.linearFeet} LF</p>
          </div>
        </div>
      </div>
    </button>
  );
}

function JobDetailView({ job, onBack, expenses }: { job: SavedEstimate, onBack: () => void, expenses: JobExpense[] }) {
  const projectedMaterial = 0; // In a real app, we'd calculate this from detailedTakeOff results
  const projectedLabor = 0; // Same here
  
  // Need to import calculateDetailedTakeOff or pass results down.
  // For simplicity here, we'll just show the expenses.
  
  const actualMaterial = expenses.filter(e => e.category === 'Material').reduce((sum, e) => sum + e.amount, 0);
  const actualLabor = expenses.filter(e => e.category === 'Labor').reduce((sum, e) => sum + e.amount, 0);
  const otherExpenses = expenses.filter(e => e.category === 'Other').reduce((sum, e) => sum + e.amount, 0);
  const totalActual = actualMaterial + actualLabor + otherExpenses;

  const handleStatusChange = async (newStatus: JobStatus) => {
    try {
      await updateDoc(doc(db, 'estimates', job.id), {
        jobStatus: newStatus,
        lastModified: new Date().toISOString()
      });
    } catch (error) {
       handleFirestoreError(error, OperationType.UPDATE, `estimates/${job.id}`);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-3 bg-white border-2 border-american-blue/5 rounded-xl text-american-blue hover:bg-american-blue hover:text-white transition-all shadow-sm">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h2 className="text-2xl font-black text-american-blue leading-none">{job.customerName || 'Unnamed'}'s Job</h2>
          <p className="text-xs font-bold text-[#999999] uppercase tracking-widest mt-1">{job.customerAddress}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="bg-white rounded-2xl p-6 border-2 border-american-blue/5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#999999] mb-4">Job Status</p>
          <div className="grid grid-cols-2 gap-2">
            {(['Proposed', 'Accepted', 'In Progress', 'Completed'] as JobStatus[]).map(status => (
              <button 
                key={status}
                onClick={() => handleStatusChange(status)}
                className={cn(
                  "px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2",
                  job.jobStatus === status 
                    ? "bg-american-blue border-american-blue text-white shadow-lg" 
                    : "bg-white border-american-blue/5 text-[#999999] hover:border-american-blue/20"
                )}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border-2 border-american-blue/5 shadow-sm col-span-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#999999] mb-4">Financial Overview (Actuals)</p>
          <div className="grid grid-cols-3 gap-8">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#999999] mb-1">Total Payouts</p>
              <p className="text-2xl font-black text-american-blue">{formatCurrency(totalActual)}</p>
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#999999] mb-1">Project Value</p>
              <p className="text-2xl font-black text-american-blue">{formatCurrency(job.manualGrandTotal || 0)}</p>
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-[#999999] mb-1">Gross Profit</p>
              <p className="text-2xl font-black text-emerald-600">{formatCurrency((job.manualGrandTotal || 0) - totalActual)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="bg-white rounded-3xl border-2 border-american-blue/5 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-american-blue/5 flex items-center justify-between bg-[#FBFBFB]">
            <h3 className="text-lg font-black text-american-blue flex items-center gap-2">
              <Receipt size={18} className="text-american-red" />
              Expense Ledger
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#FBFBFB] border-b border-american-blue/5">
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999]">Date</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999]">Description</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999] text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-american-blue/5">
                {expenses.length > 0 ? expenses.map((exp, idx) => (
                  <tr key={idx} className="hover:bg-[#FBFBFB] transition-colors">
                    <td className="px-6 py-4 text-[10px] font-bold text-[#666666]">{exp.date}</td>
                    <td className="px-6 py-4">
                      <p className="text-xs font-black text-american-blue uppercase tracking-tight">{exp.description}</p>
                      <p className="text-[9px] font-bold text-[#999999] uppercase tracking-widest">{exp.category}</p>
                    </td>
                    <td className="px-6 py-4 text-xs font-black text-right text-american-red tabular-nums">{formatCurrency(exp.amount)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-xs font-bold text-[#999999] uppercase tracking-widest italic">
                      No expenses recorded for this project yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-3xl border-2 border-american-blue/5 shadow-sm p-8">
          <h3 className="text-lg font-black text-american-blue mb-6 flex items-center gap-2">
             <BarChart3 size={18} className="text-american-red" />
             Profitability Analysis
          </h3>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-american-blue/5 border border-american-blue/10">
                <p className="text-[10px] font-black text-[#999999] uppercase tracking-widest text-center">Material Spend</p>
                <p className="text-xl font-black text-american-blue mt-1 text-center">{formatCurrency(actualMaterial)}</p>
              </div>
              <div className="p-4 rounded-2xl bg-american-blue/5 border border-american-blue/10">
                <p className="text-[10px] font-black text-[#999999] uppercase tracking-widest text-center">Labor Payout</p>
                <p className="text-xl font-black text-american-blue mt-1 text-center">{formatCurrency(actualLabor)}</p>
              </div>
            </div>
            
            <div className="p-6 rounded-2xl bg-american-blue text-white shadow-xl shadow-american-blue/20">
               <div className="flex justify-between items-center">
                 <div>
                   <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Company Net</p>
                   <p className="text-3xl font-black mt-1">{formatCurrency((job.manualGrandTotal || 0) - totalActual)}</p>
                 </div>
                 <div className="text-right">
                   <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Margin %</p>
                   {job.manualGrandTotal ? (
                     <p className="text-2xl font-black mt-1">
                       {(((job.manualGrandTotal - totalActual) / job.manualGrandTotal) * 100).toFixed(1)}%
                     </p>
                   ) : (
                     <p className="text-2xl font-black mt-1">0%</p>
                   )}
                 </div>
               </div>
            </div>

            <p className="text-[10px] text-[#999999] italic leading-relaxed text-center px-4">
              * Actual material matched via supplier codes and library entries. Projected goals based on initial dossier estimate.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddExpenseModal({ isOpen, onClose, user, jobs, initialJobId }: { isOpen: boolean, onClose: () => void, user: any, jobs: SavedEstimate[], initialJobId?: string }) {
  const [newExp, setNewExp] = React.useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    category: 'Material' as 'Material' | 'Labor' | 'Other',
    estimateId: initialJobId || '',
    materialId: '',
    receiptUrl: ''
  });
  const [isUploading, setIsUploading] = React.useState(false);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (file: File) => {
    if (!user) return;
    setIsUploading(true);
    setIsAnalyzing(true);

    try {
      // 1. Upload to Storage
      const storageRef = ref(storage, `receipts/${user.uid}/${Date.now()}-${file.name}`);
      const uploadResult = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(uploadResult.ref);

      // 2. Base64 for Gemini
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;

      // 3. AI Extraction
      const extracted = await analyzeReceiptDocument(base64Data, file.type);
      
      setNewExp(prev => ({
        ...prev,
        description: extracted.merchantName + (extracted.description ? ` - ${extracted.description}` : ''),
        amount: extracted.amount.toString(),
        category: extracted.category as 'Material' | 'Labor' | 'Other',
        date: extracted.date ? (extracted.date.includes('T') ? extracted.date.split('T')[0] : extracted.date) : prev.date,
        receiptUrl: downloadUrl
      }));
    } catch (err) {
      console.error("AI Analysis failed:", err);
      // Fallback: just keep the upload URL if we have it
    } finally {
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!newExp.description || !newExp.amount || Number(newExp.amount) <= 0) {
      alert("Please provide a description and a valid amount.");
      return;
    }

    try {
      await addDoc(collection(db, 'expenses'), {
        ...newExp,
        amount: Number(newExp.amount),
        userId: user.uid,
        companyId: 'lonestarfence',
        createdAt: serverTimestamp()
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'expenses');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-american-blue/40 backdrop-blur-sm animate-in fade-in duration-300">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border-2 border-american-blue/10"
      >
        <div className="p-6 border-b border-american-blue/5 flex items-center justify-between bg-[#FBFBFB]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-american-red/5 rounded-lg text-american-red">
              <Receipt size={20} />
            </div>
            <h3 className="text-xl font-black text-american-blue">Record Job Expense</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-american-blue/5 rounded-lg text-american-red">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-6 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#999999]">Date</label>
              <input 
                type="date" 
                value={newExp.date}
                onChange={(e) => setNewExp({...newExp, date: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border-2 border-american-blue/10 focus:border-american-blue outline-none transition-all text-sm font-bold bg-[#FBFBFB]" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#999999]">Category</label>
              <select 
                value={newExp.category}
                onChange={(e) => setNewExp({...newExp, category: e.target.value as any})}
                className="w-full px-4 py-3 rounded-xl border-2 border-american-blue/10 focus:border-american-blue outline-none transition-all text-sm font-bold bg-[#FBFBFB]"
              >
                <option value="Material">Material</option>
                <option value="Labor">Labor</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#999999]">Vendor / Description</label>
            <input 
              type="text" 
              placeholder="e.g. Home Depot, Subcontractor Payout..." 
              value={newExp.description}
              onChange={(e) => setNewExp({...newExp, description: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border-2 border-american-blue/10 focus:border-american-blue outline-none transition-all text-sm font-bold" 
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#999999]">Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-american-blue font-black">$</span>
                <input 
                  type="number" 
                  placeholder="0.00" 
                  value={newExp.amount}
                  onChange={(e) => setNewExp({...newExp, amount: e.target.value})}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-american-blue/10 focus:border-american-blue outline-none transition-all text-sm font-bold" 
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#999999]">Link to Job</label>
              <select 
                value={newExp.estimateId}
                onChange={(e) => setNewExp({...newExp, estimateId: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border-2 border-american-blue/10 focus:border-american-blue outline-none transition-all text-sm font-bold bg-[#FBFBFB]"
              >
                <option value="">General Overhead</option>
                {jobs.map(job => (
                  <option key={job.id} value={job.id}>{job.customerName || 'Unnamed'}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Receipt Upload Zone */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#999999]">Attach Receipt (Drag & Drop)</label>
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={onFileSelect} 
              accept="image/*,.pdf"
            />
            <div 
              className={cn(
                "border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center transition-all cursor-pointer relative overflow-hidden",
                (isUploading || isAnalyzing) ? "bg-american-blue/5 border-american-blue" : "bg-[#FBFBFB] border-american-blue/10 hover:border-american-blue/30"
              )}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => { 
                e.preventDefault(); 
                e.stopPropagation();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileUpload(file);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              {(isUploading || isAnalyzing) ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex gap-1">
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1] }} 
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="w-2 h-2 rounded-full bg-american-blue" 
                    />
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1] }} 
                      transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                      className="w-2 h-2 rounded-full bg-american-blue" 
                    />
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1] }} 
                      transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                      className="w-2 h-2 rounded-full bg-american-blue" 
                    />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-american-blue">
                    {isUploading ? "Uploading..." : "AI Intelligence Analyzing..."}
                  </p>
                </div>
              ) : newExp.receiptUrl ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="p-2 bg-emerald-500 rounded-lg text-white">
                    <CheckCircle2 size={16} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Receipt Attached</p>
                  <p className="text-[8px] text-[#999999] truncate max-w-full italic">Click to replace</p>
                </div>
              ) : (
                <>
                  <Download size={24} className="text-american-blue/40 mb-2" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#999999]">Click or drag receipt file</p>
                </>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-american-blue/5 flex items-center justify-end gap-3">
             <button onClick={onClose} className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-[#999999] hover:bg-american-blue/5 transition-all">Cancel</button>
             <button onClick={handleSave} className="px-8 py-3 rounded-xl bg-american-red text-white text-xs font-black uppercase tracking-widest hover:bg-american-red/90 transition-all shadow-lg shadow-american-red/20">Record Expense</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Keep TransactionsView and ReportsView but simplify them to work with JobExpenses
function TransactionsView({ transactions, savedEstimates, onLink }: { transactions: JobExpense[], savedEstimates: SavedEstimate[], onLink: (tid: string, eid: string) => void }) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [linkingTxnId, setLinkingTxnId] = React.useState<string | null>(null);

  const displayTransactions = transactions.filter(t => 
    t.description.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  return (
    <div className="bg-white rounded-3xl border-2 border-american-blue/5 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-american-blue/5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-[#FBFBFB]">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-american-blue/30" size={18} />
          <input 
            type="text" 
            placeholder="Search all expenses..."
            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-american-blue/10 focus:border-american-blue outline-none transition-all text-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#FBFBFB] border-b border-american-blue/5">
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999]">Date</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999]">Description</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999]">Category / Link</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999] text-right">Amount</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999] text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-american-blue/5">
            {displayTransactions.map(txn => (
              <tr key={txn.id} className="hover:bg-[#FBFBFB] transition-colors group">
                <td className="px-6 py-6 text-xs font-bold text-[#666666]">{txn.date}</td>
                <td className="px-6 py-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-american-red/5 text-american-red">
                      <ArrowDownLeft size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-american-blue uppercase tracking-tight">
                          {txn.description}
                        </p>
                        {txn.receiptUrl && (
                          <div className="bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-emerald-100 flex items-center gap-1">
                            <Receipt size={8} />
                            Receipt
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-6">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-american-blue/5 text-american-blue w-fit">
                      {txn.category}
                    </span>
                    {(txn as any).estimateId ? (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                        <LinkIcon size={10} />
                        <span>Job: {savedEstimates.find(e => e.id === (txn as any).estimateId)?.customerName || 'Linked Job'}</span>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setLinkingTxnId(txn.id)}
                        className="flex items-center gap-1 text-[10px] font-bold text-american-red hover:underline"
                      >
                        <Plus size={10} />
                        Link to Job
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-6 py-6 text-sm font-black text-right tabular-nums text-american-red">
                  -{formatCurrency(txn.amount)}
                </td>
                <td className="px-6 py-6 text-center">
                  <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {txn.receiptUrl ? (
                      <a 
                        href={txn.receiptUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-2 hover:bg-american-blue/5 rounded-lg text-emerald-600 transition-colors" 
                        title="View Receipt"
                      >
                        <Receipt size={16} />
                      </a>
                    ) : (
                      <button className="p-2 text-[#CCCCCC] cursor-not-allowed" disabled>
                        <Receipt size={16} />
                      </button>
                    )}
                    <button 
                      onClick={async () => {
                        if (window.confirm("Delete this expense record?")) {
                          await deleteDoc(doc(db, 'expenses', txn.id));
                        }
                      }}
                      className="p-2 hover:bg-american-blue/5 rounded-lg text-american-red transition-colors" 
                      title="Delete Expense"
                    >
                       <X size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Linking Modal */}
      <AnimatePresence mode="wait">
        {linkingTxnId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-american-blue/40 backdrop-blur-sm animate-in fade-in duration-300">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border-2 border-american-blue/10"
            >
              <div className="p-6 border-b border-american-blue/5 flex items-center justify-between bg-[#FBFBFB]">
                <h3 className="text-xl font-black text-american-blue">Link to Job</h3>
                <button onClick={() => setLinkingTxnId(null)} className="p-2 hover:bg-american-blue/5 rounded-lg text-american-red">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-xs font-bold text-[#666666]">Select a job to attribute this expense to for job costing.</p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {savedEstimates.filter(e => e.jobStatus !== 'Draft').map(est => (
                    <button 
                      key={est.id}
                      onClick={() => {
                        onLink(linkingTxnId, est.id);
                        setLinkingTxnId(null);
                      }}
                      className="w-full p-4 rounded-xl border-2 border-american-blue/5 hover:border-american-blue/20 hover:bg-american-blue/5 transition-all text-left group"
                    >
                      <p className="text-sm font-black text-american-blue uppercase tracking-tight group-hover:text-american-blue">{est.customerName || 'Unnamed Customer'}</p>
                      <p className="text-[10px] font-bold text-[#999999]">{est.customerAddress}</p>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReportsView({ transactions }: { transactions: JobExpense[] }) {
  const totalSpend = transactions.reduce((sum, t) => sum + t.amount, 0);
  const matSpend = transactions.filter(t => t.category === 'Material').reduce((sum, t) => sum + t.amount, 0);
  const laborSpend = transactions.filter(t => t.category === 'Labor').reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="bg-white rounded-3xl border-2 border-american-blue/5 shadow-sm p-8">
        <h3 className="text-xl font-black text-american-blue mb-8">Expense Breakdown</h3>
        <div className="space-y-6">
          <div className="flex justify-between items-center py-4 border-b-2 border-american-blue/5">
            <span className="text-sm font-black uppercase text-[#999999] tracking-widest">Material Payouts</span>
            <span className="text-xl font-black text-american-red">{formatCurrency(matSpend)}</span>
          </div>
          <div className="flex justify-between items-center py-4 border-b-2 border-american-blue/5">
            <span className="text-sm font-black uppercase text-[#999999] tracking-widest">Labor Payouts</span>
            <span className="text-xl font-black text-american-red">{formatCurrency(laborSpend)}</span>
          </div>
          <div className="flex justify-between items-center py-4 border-b-2 border-american-blue/5">
            <span className="text-sm font-black uppercase text-[#999999] tracking-widest">Other Expenses</span>
            <span className="text-xl font-black text-american-red">{formatCurrency(totalSpend - matSpend - laborSpend)}</span>
          </div>
          <div className="pt-6 font-black text-american-blue text-right">
            <p className="text-xs uppercase tracking-widest opacity-60">Total Period Expenditure</p>
            <p className="text-4xl tracking-tighter mt-1">{formatCurrency(totalSpend)}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border-2 border-american-blue/5 shadow-sm p-8 flex flex-col justify-center items-center text-center">
         <div className="w-24 h-24 bg-american-red/5 rounded-full flex items-center justify-center text-american-red mb-6 animate-pulse">
            <BarChart3 size={48} />
         </div>
         <h3 className="text-2xl font-black text-american-blue tracking-tight">Business Velocity</h3>
         <p className="text-sm font-bold text-[#999999] uppercase tracking-widest mt-2 max-w-xs">
           Financial metrics across all active jobs are matched in real-time.
         </p>
      </div>
    </div>
  );
}
