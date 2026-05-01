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
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from '../../lib/utils';
import { BankAccount, BankTransaction, InventoryStock, JournalEntry, SavedEstimate } from '../../types';
import { db, auth, handleFirestoreError, OperationType } from '../../lib/firebase';
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
import { User } from 'firebase/auth';

interface FinancialsProps {
  savedEstimates: any[];
  user: User | null;
}

type FinancialSubTab = 'banking' | 'transactions' | 'reports' | 'inventory' | 'journal';

export default function Financials({ savedEstimates, user }: FinancialsProps) {
  const [activeSubTab, setActiveSubTab] = React.useState<FinancialSubTab>('banking');
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [showAddTransaction, setShowAddTransaction] = React.useState(false);

  // States for real data
  const [bankAccounts, setBankAccounts] = React.useState<BankAccount[]>([]);
  const [transactions, setTransactions] = React.useState<BankTransaction[]>([]);
  const [inventory, setInventory] = React.useState<InventoryStock[]>([]);
  const [journalEntries, setJournalEntries] = React.useState<JournalEntry[]>([]);

  // Fetch data if user is logged in
  React.useEffect(() => {
    if (!user) return;

    // Accounts
    const qAcc = query(collection(db, 'bankAccounts'), where('userId', '==', user.uid));
    const unsubAcc = onSnapshot(qAcc, 
      (snapshot) => setBankAccounts(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BankAccount))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'bankAccounts')
    );

    // Transactions
    const qTxn = query(collection(db, 'transactions'), where('userId', '==', user.uid), orderBy('date', 'desc'));
    const unsubTxn = onSnapshot(qTxn, 
      (snapshot) => setTransactions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BankTransaction))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'transactions')
    );

    // Inventory
    const qInv = query(collection(db, 'inventory'), where('userId', '==', user.uid));
    const unsubInv = onSnapshot(qInv, 
      (snapshot) => setInventory(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InventoryStock))),
      (error) => handleFirestoreError(error, OperationType.LIST, 'inventory')
    );

    return () => {
      unsubAcc();
      unsubTxn();
      unsubInv();
    };
  }, [user]);

  const [newTxn, setNewTxn] = React.useState({
    type: 'Expense',
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    accountId: '',
    category: '',
    estimateId: ''
  });

  const handleCreateTransaction = async () => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'transactions'), {
        ...newTxn,
        amount: Number(newTxn.amount),
        userId: user.uid,
        status: 'Pending',
        createdAt: serverTimestamp()
      });
      setShowAddTransaction(false);
      setNewTxn({
        type: 'Expense',
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        accountId: '',
        category: '',
        estimateId: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'transactions');
    }
  };

  const handleLinkTransaction = async (txnId: string, estId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'transactions', txnId), {
        estimateId: estId
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `transactions/${txnId}`);
    }
  };

  const subNavItems = [
    { id: 'banking', label: 'Banking', icon: Wallet },
    { id: 'transactions', label: 'Expenses & Income', icon: Receipt },
    { id: 'reports', label: 'Reports (P&L)', icon: BarChart3 },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'journal', label: 'Journal Entries', icon: History },
  ];

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-american-blue">Financials</h1>
          <p className="text-american-red font-bold uppercase tracking-widest text-xs mt-1">
            Real-time Business Intelligence
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowAddTransaction(true)}
            className="flex items-center gap-2 rounded-xl bg-white border-2 border-american-blue/10 px-6 py-3 text-sm font-black text-american-blue hover:bg-american-blue hover:text-white transition-all shadow-sm"
          >
            <Plus size={18} />
            Add Transaction
          </button>
          <button 
            onClick={handleSync}
            disabled={isSyncing}
            className={cn(
              "flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white transition-all shadow-lg",
              isSyncing ? "bg-[#CCCCCC] cursor-not-allowed" : "bg-american-red hover:bg-american-red/90 shadow-american-red/20"
            )}
          >
            <RotateCcw size={18} className={cn(isSyncing && "animate-spin")} />
            {isSyncing ? 'Connecting...' : 'Sync Bank Accounts'}
          </button>
        </div>
      </div>

      {/* Sub Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {subNavItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveSubTab(item.id as FinancialSubTab)}
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
          key={activeSubTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="min-h-[400px]"
        >
          {activeSubTab === 'banking' && <BankingView accounts={bankAccounts} />}
          {activeSubTab === 'transactions' && (
            <TransactionsView 
              transactions={transactions} 
              savedEstimates={savedEstimates} 
              onLink={handleLinkTransaction}
            />
          )}
          {activeSubTab === 'reports' && <ReportsView transactions={transactions} />}
          {activeSubTab === 'inventory' && <InventoryView inventory={inventory} />}
          {activeSubTab === 'journal' && <JournalView />}
        </motion.div>
      </AnimatePresence>

      {/* Add Transaction Modal */}
      <AnimatePresence>
        {showAddTransaction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-american-blue/40 backdrop-blur-sm animate-in fade-in duration-300">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border-2 border-american-blue/10"
            >
              <div className="p-6 border-b border-american-blue/5 flex items-center justify-between bg-[#FBFBFB]">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-american-blue/5 rounded-lg text-american-blue">
                    <FilePlus size={20} />
                  </div>
                  <h3 className="text-xl font-black text-american-blue">New Transaction</h3>
                </div>
                <button onClick={() => setShowAddTransaction(false)} className="p-2 hover:bg-american-blue/5 rounded-lg text-american-red transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#999999]">Type</label>
                    <select 
                      value={newTxn.type}
                      onChange={(e) => setNewTxn({...newTxn, type: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-american-blue/10 focus:border-american-blue outline-none transition-all text-sm font-bold bg-white"
                    >
                      <option value="Expense">Expense</option>
                      <option value="Income">Income</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#999999]">Date</label>
                    <input 
                      type="date" 
                      value={newTxn.date}
                      onChange={(e) => setNewTxn({...newTxn, date: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-american-blue/10 focus:border-american-blue outline-none transition-all text-sm font-bold" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#999999]">Description / Vendor</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Home Depot, Smith Payment..." 
                    value={newTxn.description}
                    onChange={(e) => setNewTxn({...newTxn, description: e.target.value})}
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
                        value={newTxn.amount}
                        onChange={(e) => setNewTxn({...newTxn, amount: e.target.value})}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-american-blue/10 focus:border-american-blue outline-none transition-all text-sm font-bold" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#999999]">Account</label>
                    <select 
                      value={newTxn.accountId}
                      onChange={(e) => setNewTxn({...newTxn, accountId: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border-2 border-american-blue/10 focus:border-american-blue outline-none transition-all text-sm font-bold bg-white"
                    >
                      <option value="">Select Account...</option>
                      {bankAccounts.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#999999]">Link to Job (Optional)</label>
                  <select 
                    value={newTxn.estimateId}
                    onChange={(e) => setNewTxn({...newTxn, estimateId: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border-2 border-american-blue/10 focus:border-american-blue outline-none transition-all text-sm font-bold bg-white"
                  >
                    <option value="">None / General</option>
                    {savedEstimates.map(est => (
                      <option key={est.id} value={est.id}>{est.customerName || 'Unnamed'}</option>
                    ))}
                  </select>
                </div>

                <div className="pt-4 border-t border-american-blue/5 flex items-center justify-between">
                  <button className="flex items-center gap-2 text-american-blue font-black text-[10px] uppercase tracking-widest hover:underline">
                    <Receipt size={16} />
                    Attach Receipt
                  </button>
                  <div className="flex gap-3">
                    <button onClick={() => setShowAddTransaction(false)} className="px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-[#999999] hover:bg-american-blue/5 transition-all">Cancel</button>
                    <button onClick={handleCreateTransaction} className="px-8 py-3 rounded-xl bg-american-red text-white text-xs font-black uppercase tracking-widest hover:bg-american-red/90 transition-all shadow-lg shadow-american-red/20">Record Transaction</button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Placeholder sub-views for now
function BankingView({ accounts }: { accounts: BankAccount[] }) {
  const displayAccounts = accounts.length > 0 ? accounts : [
    { id: 'mock-1', name: 'Main Business Checking', type: 'Checking', balance: 42550.25, institutionName: 'Chase Bank', lastSync: '10 mins ago', userId: 'mock' },
    { id: 'mock-2', name: 'Business Savings', type: 'Savings', balance: 125000.00, institutionName: 'Chase Bank', lastSync: '1 hour ago', userId: 'mock' },
  ] as BankAccount[];

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {displayAccounts.map(acc => (
        <div key={acc.id} className="bg-white rounded-2xl p-6 border-2 border-american-blue/5 shadow-sm hover:border-american-blue/20 transition-all group">
          <div className="flex justify-between items-start mb-6">
            <div className="p-3 bg-american-blue/5 rounded-xl group-hover:bg-american-blue group-hover:text-white transition-colors">
              <Wallet size={24} />
            </div>
            <div className="text-right">
              <span className={cn(
                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                acc.type === 'Credit Card' ? "bg-american-red/10 text-american-red" : "bg-emerald-100 text-emerald-600"
              )}>
                {acc.type}
              </span>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#999999] mb-1">{acc.institutionName}</p>
            <h3 className="text-lg font-black text-american-blue mb-4">{acc.name}</h3>
            <p className="text-3xl font-black tracking-tight text-american-blue">
              {formatCurrency(acc.balance)}
            </p>
          </div>
          <div className="mt-6 pt-6 border-t border-american-blue/5 flex justify-between items-center text-[10px] font-bold text-[#999999]">
            <span>Last synced: {acc.lastSync}</span>
            <button className="text-american-blue hover:underline">View History</button>
          </div>
        </div>
      ))}
      <button className="bg-white/50 border-2 border-dashed border-american-blue/20 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-[#999999] hover:bg-white hover:border-american-blue/40 hover:text-american-blue transition-all group">
        <div className="p-3 bg-american-blue/5 rounded-xl group-hover:bg-american-blue group-hover:text-white transition-colors">
          <Plus size={24} />
        </div>
        <span className="font-black uppercase tracking-widest text-xs">Link New Bank Account</span>
      </button>
    </div>
  );
}

function TransactionsView({ transactions, savedEstimates, onLink }: { transactions: BankTransaction[], savedEstimates: SavedEstimate[], onLink: (tid: string, eid: string) => void }) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [linkingTxnId, setLinkingTxnId] = React.useState<string | null>(null);

  const displayTransactions = transactions.length > 0 ? transactions : [
    { id: 'm1', date: 'April 20, 2026', accountId: 'mock-1', userId: 'mock', description: 'Home Depot - Materials', type: 'Expense' as const, amount: 1250.50, category: 'Cost of Goods Sold', status: 'Reconciled' as const, ref: '#TXN-98231', estimateId: 'EST-1' },
    { id: 'm2', date: 'April 19, 2026', accountId: 'mock-1', userId: 'mock', description: 'Payment - Smith Residence', type: 'Income' as const, amount: 4500.00, category: 'Project Revenue', status: 'Reconciled' as const, ref: '#TXN-98232', estimateId: 'EST-2' },
  ] as BankTransaction[];
  
  return (
    <div className="bg-white rounded-3xl border-2 border-american-blue/5 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-american-blue/5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-[#FBFBFB]">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-american-blue/30" size={18} />
          <input 
            type="text" 
            placeholder="Search transactions, customers, or items..."
            className="w-full pl-12 pr-4 py-3 rounded-xl border-2 border-american-blue/10 focus:border-american-blue outline-none transition-all text-sm font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-american-blue/10 hover:bg-white transition-all text-american-blue text-sm font-black shadow-sm">
            <Download size={18} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#FBFBFB] border-b border-american-blue/5">
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999]">Date</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999]">Description</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999]">Category / Link</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999]">Status</th>
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
                    <div className={cn(
                      "p-2 rounded-lg bg-american-blue/5",
                      txn.type === 'Expense' ? "text-american-red" : "text-american-blue"
                    )}>
                      {txn.type === 'Expense' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                    </div>
                    <div>
                      <p className="text-sm font-black text-american-blue uppercase tracking-tight">
                        {txn.description}
                      </p>
                      <p className="text-[10px] font-bold text-[#999999]">Ref: {txn.ref}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-6">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-american-blue/5 text-american-blue w-fit">
                      {txn.category}
                    </span>
                    {txn.estimateId ? (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                        <LinkIcon size={10} />
                        <span>Job: {savedEstimates.find(e => e.id === txn.estimateId)?.customerName || 'Linked Job'}</span>
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
                <td className="px-6 py-6 font-bold uppercase tracking-widest">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full shadow-[0_0_8px]",
                      txn.status === 'Reconciled' ? "bg-emerald-500 shadow-emerald-500/50" : "bg-amber-400 shadow-amber-400/50"
                    )} />
                    <span className={cn(
                      "text-[10px]",
                      txn.status === 'Reconciled' ? "text-emerald-600" : "text-amber-600"
                    )}>{txn.status}</span>
                  </div>
                </td>
                <td className={cn(
                  "px-6 py-6 text-sm font-black text-right tabular-nums",
                  txn.type === 'Expense' ? "text-american-red" : "text-american-blue"
                )}>
                  {txn.type === 'Expense' ? '-' : '+'}{formatCurrency(txn.amount)}
                </td>
                <td className="px-6 py-6 text-center">
                  <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-2 hover:bg-american-blue/5 rounded-lg text-american-blue transition-colors" title="View Receipt">
                      <Receipt size={16} />
                    </button>
                    <button className="p-2 hover:bg-american-blue/5 rounded-lg text-[#999999] transition-colors">
                      <MoreVertical size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Linking Modal */}
      <AnimatePresence>
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
                <button onClick={() => setLinkingTxnId(null)} className="p-2 hover:bg-american-blue/5 rounded-lg text-[#999999] transition-colors text-american-red">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-xs font-bold text-[#666666]">Select a job to attribute this transaction to for job costing.</p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {savedEstimates.length > 0 ? (
                    savedEstimates.map(est => (
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
                    ))
                  ) : (
                    <div className="py-8 text-center bg-american-blue/5 rounded-2xl">
                      <p className="text-xs font-black text-[#999999] uppercase tracking-widest">No active jobs found</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ReportsView({ transactions }: { transactions: BankTransaction[] }) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="bg-white rounded-3xl border-2 border-american-blue/5 shadow-sm p-8">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-black text-american-blue">Profit & Loss Statement</h3>
          <select className="bg-[#F8F9FA] border-2 border-american-blue/5 rounded-xl px-4 py-2 text-xs font-black text-american-blue outline-none">
            <option>This Month</option>
            <option>Last Quarter</option>
            <option>Year to Date</option>
          </select>
        </div>
        
        <div className="space-y-6">
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#999999]">Income</h4>
            <div className="flex justify-between items-center py-2 border-b border-american-blue/5">
              <span className="text-sm font-bold text-american-blue">Service Revenue</span>
              <span className="text-sm font-black text-american-blue">{formatCurrency(85420.00)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-american-blue/5">
              <span className="text-sm font-bold text-american-blue">Parts Sales</span>
              <span className="text-sm font-black text-american-blue">{formatCurrency(12500.00)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 font-black text-american-blue">
              <span className="text-sm uppercase tracking-widest">Total Income</span>
              <span className="text-lg">{formatCurrency(97920.00)}</span>
            </div>
          </div>

          <div className="space-y-4 pt-6">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-american-red">Expenses</h4>
            <div className="flex justify-between items-center py-2 border-b border-american-blue/5">
              <span className="text-sm font-bold text-[#666666]">Cost of Goods Sold (Materials)</span>
              <span className="text-sm font-black text-american-red">{formatCurrency(38500.00)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-american-blue/5">
              <span className="text-sm font-bold text-[#666666]">Labor Wages</span>
              <span className="text-sm font-black text-american-red">{formatCurrency(24800.00)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-american-blue/5">
              <span className="text-sm font-bold text-[#666666]">Equipment Rental</span>
              <span className="text-sm font-black text-american-red">{formatCurrency(4200.00)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 font-black text-american-red">
              <span className="text-sm uppercase tracking-widest">Total Expenses</span>
              <span className="text-lg">{formatCurrency(67500.00)}</span>
            </div>
          </div>

          <div className="mt-8 p-6 rounded-2xl bg-american-blue text-white shadow-xl shadow-american-blue/20">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Net Profit</p>
                <p className="text-3xl font-black mt-1">{formatCurrency(30420.00)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Profit Margin</p>
                <p className="text-2xl font-black mt-1">31.1%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="bg-white rounded-3xl border-2 border-american-blue/5 shadow-sm p-8">
          <h3 className="text-xl font-black text-american-blue mb-6">Job Profitability</h3>
          <div className="space-y-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-sm font-black text-american-blue uppercase tracking-tight">Project #{2300 + i}</p>
                    <p className="text-[10px] font-bold text-[#999999]">Anderson Fence Installation</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-american-blue">82% Budget Used</span>
                  </div>
                </div>
                <div className="h-3 bg-[#F5F5F5] rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full w-[82%]" />
                </div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                  <span className="text-[#999999]">Actual: {formatCurrency(12450)}</span>
                  <span className="text-american-red">Est: {formatCurrency(15200)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-3xl border-2 border-american-blue/5 shadow-sm p-8">
          <h3 className="text-xl font-black text-american-blue mb-6">Inventory Health</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-american-blue/5 border border-american-blue/10">
              <p className="text-[10px] font-black text-[#999999] uppercase tracking-widest">Stock Value</p>
              <p className="text-xl font-black text-american-blue mt-1">{formatCurrency(18450.00)}</p>
            </div>
            <div className="p-4 rounded-2xl bg-american-red/5 border border-american-red/10">
              <p className="text-[10px] font-black text-[#999999] uppercase tracking-widest">Items Low</p>
              <p className="text-xl font-black text-american-red mt-1">12 Items</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InventoryView({ inventory }: { inventory: any[] }) {
  const [allocatingItem, setAllocatingItem] = React.useState<any | null>(null);

  const inventoryItems = [
    { id: '1', name: '4x4x8 Treated Post', cat: 'Post', stock: 145, min: 20, cost: 12.50 },
    { id: '2', name: 'Western Red Cedar Picket', cat: 'Picket', stock: 12, min: 250, cost: 2.45 },
    { id: '3', name: '80lb Concrete Mix', cat: 'Concrete', stock: 85, min: 10, cost: 5.80 },
  ];

  return (
    <div className="bg-white rounded-3xl border-2 border-american-blue/5 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-american-blue/5 flex items-center justify-between bg-[#FBFBFB]">
        <h3 className="text-xl font-black text-american-blue">Inventory Stock</h3>
        <button className="flex items-center gap-2 px-4 py-2 bg-american-blue text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-american-blue/90 transition-all">
          <Plus size={16} />
          Purchase Order
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#FBFBFB] border-b border-american-blue/5">
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999]">Material</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999]">Category</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999] text-center">In Stock</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999] text-center">Min Level</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999] text-right">Avg Cost</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#999999] text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-american-blue/5">
            {inventoryItems.map((item, i) => (
              <tr key={i} className="hover:bg-[#FBFBFB] transition-colors group">
                <td className="px-6 py-6 font-black text-american-blue text-sm">
                  {item.name}
                  {item.stock < item.min && (
                    <span className="ml-2 px-2 py-0.5 rounded text-[8px] font-black uppercase bg-american-red/10 text-american-red">Low Stock</span>
                  )}
                </td>
                <td className="px-6 py-6 text-xs font-bold text-[#666666]">{item.cat}</td>
                <td className="px-6 py-6 text-center tabular-nums font-black text-american-blue">{item.stock}</td>
                <td className="px-6 py-6 text-center tabular-nums font-bold text-[#999999]">{item.min}</td>
                <td className="px-6 py-6 text-right tabular-nums font-bold text-american-blue">{formatCurrency(item.cost)}</td>
                <td className="px-6 py-6">
                  <div className="flex justify-center">
                    <button 
                      onClick={() => setAllocatingItem(item)}
                      className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-american-blue/5 text-american-blue hover:bg-american-blue hover:text-white transition-all opacity-0 group-hover:opacity-100"
                    >
                      Allocate to Job
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Allocation Modal Placeholder */}
      {allocatingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-american-blue/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl border-2 border-american-blue/10">
            <h3 className="text-xl font-black text-american-blue mb-4">Allocate {allocatingItem.name}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-[#999999]">Quantity</label>
                <input type="number" className="w-full px-4 py-3 rounded-xl border-2 border-american-blue/10 focus:border-american-blue outline-none transition-all text-sm font-bold" placeholder="Amount to move..." />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-[#999999]">Assign to Job</label>
                <select className="w-full px-4 py-3 rounded-xl border-2 border-american-blue/10 focus:border-american-blue outline-none transition-all text-sm font-bold bg-white">
                  <option>Select Customer...</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setAllocatingItem(null)} className="flex-1 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-[#999999] hover:bg-american-blue/5 transition-all">Cancel</button>
                <button onClick={() => setAllocatingItem(null)} className="flex-1 px-6 py-3 rounded-xl bg-american-blue text-white text-xs font-black uppercase tracking-widest hover:bg-american-blue/90 transition-all">Assign Stock</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function JournalView() {
  return (
    <div className="bg-white rounded-3xl border-2 border-american-blue/5 shadow-sm p-8 flex flex-col items-center justify-center text-center min-h-[400px]">
      <div className="w-20 h-20 bg-american-blue/5 rounded-3xl flex items-center justify-center text-american-blue mb-6">
        <History size={40} />
      </div>
      <h3 className="text-2xl font-black text-american-blue mb-2">History & Journal Entries</h3>
      <p className="text-[#666666] max-w-md mx-auto mb-8 font-medium">
        Review audit logs, manual adjustments, and historical journal entries for full compliance and transparency.
      </p>
      <button className="flex items-center gap-2 rounded-xl bg-american-blue px-8 py-4 text-sm font-black text-white hover:bg-american-blue/90 transition-all shadow-xl shadow-american-blue/20">
        <FilePlus size={18} />
        New Journal Entry
      </button>
    </div>
  );
}
