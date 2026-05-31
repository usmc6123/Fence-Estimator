import React from 'react';
import { 
  Search, ArrowUpDown, UserCheck, UserX, Trash2, Settings, Sparkles, 
  HelpCircle, Shield, Mail, Check, X, UserPlus, FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  subscriptionTier: 'free' | 'paid';
  createdAt: string;
  isDisabled: boolean;
  estimatesCount: number;
}

interface AdminUserManagementProps {
  users: UserProfile[];
  loading: boolean;
  adminToken: string | null;
  onRefresh: () => void;
}

export default function AdminUserManagement({ users, loading, adminToken, onRefresh }: AdminUserManagementProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [tierFilter, setTierFilter] = React.useState<'all' | 'free' | 'paid'>('all');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'disabled'>('all');
  const [sortField, setSortField] = React.useState<keyof UserProfile>('createdAt');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('desc');

  // Selected User state for details side-drawer
  const [selectedUser, setSelectedUser] = React.useState<UserProfile | null>(null);
  const [userEstimates, setUserEstimates] = React.useState<any[]>([]);
  const [loadingEstimates, setLoadingEstimates] = React.useState(false);

  // Modals state
  const [isAddUserOpen, setIsAddUserOpen] = React.useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<UserProfile | null>(null);

  // Form states
  const [formEmail, setFormEmail] = React.useState('');
  const [formName, setFormName] = React.useState('');
  const [formTier, setFormTier] = React.useState<'free' | 'paid'>('free');
  const [formDisabled, setFormDisabled] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [successToast, setSuccessToast] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // New Password states
  const [formPassword, setFormPassword] = React.useState('');
  const [isResetPassOpen, setIsResetPassOpen] = React.useState(false);
  const [resetPassUser, setResetPassUser] = React.useState<UserProfile | null>(null);
  const [formResetPassword, setFormResetPassword] = React.useState('');
  const [showFormPassword, setShowFormPassword] = React.useState(false);
  const [showResetPassword, setShowResetPassword] = React.useState(false);

  // Auto-hide toast
  React.useEffect(() => {
    if (successToast) {
      const timer = setTimeout(() => setSuccessToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successToast]);

  // Fetch estimates for inspected user
  const fetchUserEstimates = async (userId: string) => {
    setLoadingEstimates(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/estimates`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserEstimates(data);
      }
    } catch (err) {
      console.error("Failed to fetch estimates:", err);
    } finally {
      setLoadingEstimates(false);
    }
  };

  // Sort and filter computation
  const processedUsers = React.useMemo(() => {
    return [...users]
      .filter(u => {
        const matchesSearch = 
          u.email?.toLowerCase().includes(searchTerm.toLowerCase()) || 
          u.name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTier = tierFilter === 'all' || u.subscriptionTier === tierFilter;
        const matchesStatus = statusFilter === 'all' || 
          (statusFilter === 'active' && !u.isDisabled) || 
          (statusFilter === 'disabled' && u.isDisabled);
        return matchesSearch && matchesTier && matchesStatus;
      })
      .sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];

        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortDirection === 'asc' 
            ? valA.localeCompare(valB) 
            : valB.localeCompare(valA);
        }
        if (typeof valA === 'boolean' && typeof valB === 'boolean') {
          return sortDirection === 'asc'
            ? (valA ? 1 : 0) - (valB ? 1 : 0)
            : (valB ? 1 : 0) - (valA ? 1 : 0);
        }
        return sortDirection === 'asc'
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      });
  }, [users, searchTerm, tierFilter, statusFilter, sortField, sortDirection]);

  const handleSort = (field: keyof UserProfile) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Toggle user subscription tier
  const handleToggleTier = async (u: UserProfile) => {
    const nextTier = u.subscriptionTier === 'free' ? 'paid' : 'free';
    try {
      const res = await fetch(`/api/admin/users/${u.uid}/tier`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ tier: nextTier })
      });
      if (res.ok) {
        setSuccessToast(`Tier updated for ${u.name}!`);
        onRefresh();
        if (selectedUser?.uid === u.uid) {
          setSelectedUser({ ...u, subscriptionTier: nextTier });
        }
      }
    } catch (err) {
      console.error("Failed to toggle tier:", err);
    }
  };

  // Toggle disable status
  const handleToggleStatus = async (u: UserProfile) => {
    const action = u.isDisabled ? 'enable' : 'disable';
    try {
      const res = await fetch(`/api/admin/users/${u.uid}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (res.ok) {
        setSuccessToast(`User ${u.isDisabled ? 'Enabled' : 'Disabled'}!`);
        onRefresh();
        if (selectedUser?.uid === u.uid) {
          setSelectedUser({ ...u, isDisabled: !u.isDisabled });
        }
      }
    } catch (err) {
      console.error("Failed to toggle status:", err);
    }
  };

  // Delete User with double checks
  const handleDeleteUser = async (userId: string) => {
    const doubleCheck = window.confirm("This will delete the user and all their estimates permanently. Do you wish to proceed?");
    if (!doubleCheck) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (res.ok) {
        setSuccessToast("User permanently deleted!");
        setIsEditUserOpen(false);
        setSelectedUser(null);
        onRefresh();
      } else {
        alert("Deletion failed.");
      }
    } catch (err) {
      console.error("Failed to delete user:", err);
    }
  };

  // Save new user manual profile
  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          email: formEmail,
          name: formName,
          subscriptionTier: formTier,
          password: formPassword
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessToast("New User created successfully!");
        setIsAddUserOpen(false);
        setFormEmail('');
        setFormName('');
        setFormPassword('');
        setFormTier('free');
        onRefresh();
      } else {
        setFormError(data.error || "Failed to create user.");
      }
    } catch (err) {
      setFormError("Communication failure.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassUser) return;
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/admin/users/${resetPassUser.uid}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          password: formResetPassword
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessToast(`Password reset successfully for ${resetPassUser.name}!`);
        setIsResetPassOpen(false);
        setFormResetPassword('');
      } else {
        setFormError(data.error || "Failed to reset password.");
      }
    } catch (err) {
      setFormError("Communication failure.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save edited user profile
  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/admin/users/${editingUser.uid}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          email: formEmail,
          name: formName,
          subscriptionTier: formTier
        })
      });
      
      // Also update status if different
      if (editingUser.isDisabled !== formDisabled) {
        const action = formDisabled ? 'disable' : 'enable';
        await fetch(`/api/admin/users/${editingUser.uid}/${action}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${adminToken}` }
        });
      }

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessToast("User details updated successfully!");
        setIsEditUserOpen(false);
        onRefresh();
        setSelectedUser(null);
      } else {
        setFormError(data.error || "Failed to edit user profile.");
      }
    } catch (err) {
      setFormError("Communication failure.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      <AnimatePresence>
        {successToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-55 bg-emerald-600 text-white font-black text-xs uppercase px-4 py-3 rounded-xl shadow-lg flex items-center gap-2"
          >
            <Check size={14} />
            {successToast}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Users registry list card */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-[#F0F0F0] pb-3">
            <div>
              <h3 className="text-sm font-black text-american-blue uppercase tracking-widest">
                Client Base Directory
              </h3>
              <p className="text-[11px] text-gray-500">Query and edit all platform subscriber records.</p>
            </div>
            <button 
              onClick={() => {
                setFormEmail('');
                setFormName('');
                setFormTier('free');
                setFormError(null);
                setIsAddUserOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-american-blue hover:bg-american-blue/95 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-american-blue/15 transition-all"
            >
              <UserPlus size={14} />
              Add User
            </button>
          </div>

          {/* Search & Filter tools */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
              <input 
                type="text"
                placeholder="Search by profile name or email address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
              />
            </div>

            <div className="flex items-center gap-2">
              <select 
                value={tierFilter} 
                onChange={(e) => setTierFilter(e.target.value as any)}
                className="rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue font-bold text-[#666666]"
              >
                <option value="all">All Tiers</option>
                <option value="free">Free Tiers</option>
                <option value="paid">Paid Tiers</option>
              </select>

              <select 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue font-bold text-[#666666]"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Tiers</option>
                <option value="disabled">Disabled Tiers</option>
              </select>
            </div>
          </div>

          {/* User Table */}
          {loading ? (
            <div className="p-16 text-center text-xs font-black text-gray-400 uppercase tracking-widest animate-pulse">Running full-scrypt secure query...</div>
          ) : processedUsers.length === 0 ? (
            <div className="p-16 text-center text-xs font-black text-gray-400 uppercase tracking-widest">No matching user profiles found.</div>
          ) : (
            <div className="overflow-x-auto border border-[#E5E5E5] rounded-xl">
              <table id="client_management_table" className="min-w-full divide-y divide-[#E5E5E5] text-left">
                <thead className="bg-[#FAF9F9]">
                  <tr className="text-[10px] font-black uppercase text-[#666666] tracking-wider">
                    <th className="px-4 py-3.5 select-none hover:text-american-blue cursor-pointer" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-1">Client Profile <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="px-4 py-3.5 select-none hover:text-american-blue cursor-pointer" onClick={() => handleSort('subscriptionTier')}>
                      <div className="flex items-center gap-1">Subscription <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="px-4 py-3.5 select-none hover:text-american-blue cursor-pointer" onClick={() => handleSort('createdAt')}>
                      <div className="flex items-center gap-1">Created <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="px-4 py-3.5 text-center select-none hover:text-american-blue cursor-pointer" onClick={() => handleSort('estimatesCount')}>
                      <div className="flex items-center gap-1 justify-center">Estimates <ArrowUpDown size={11} /></div>
                    </th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0F0] bg-white text-xs text-[#1A1A1A]">
                  {processedUsers.map((item) => (
                    <tr 
                      key={item.uid}
                      className={`hover:bg-[#F9F9F9] transition-all cursor-pointer ${selectedUser?.uid === item.uid ? 'bg-american-blue/5' : ''}`}
                      onClick={() => {
                        setSelectedUser(item);
                        fetchUserEstimates(item.uid);
                      }}
                    >
                      {/* Name & Email */}
                      <td className="px-4 py-3.5">
                        <div className="overflow-hidden max-w-[150px]">
                          <p className="font-bold text-american-blue truncate">{item.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono truncate">{item.email}</p>
                        </div>
                      </td>

                      {/* Tier Badge */}
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          item.subscriptionTier === 'paid' 
                            ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                            : 'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}>
                          {item.subscriptionTier === 'paid' ? '★ Premium' : 'Free'}
                        </span>
                      </td>

                      {/* Created Date */}
                      <td className="px-4 py-3.5 text-gray-500 font-mono text-[11px]">
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}
                      </td>

                      {/* Estimates Count */}
                      <td className="px-4 py-3.5 text-center font-black">
                        {item.estimatesCount}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                          item.isDisabled 
                            ? 'bg-[#FFEBEB] text-american-red border border-red-200' 
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}>
                          {item.isDisabled ? 'Disabled' : 'Active'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5 font-sans leading-none">
                          {/* Edit Details */}
                          <button
                            onClick={() => {
                              setEditingUser(item);
                              setFormEmail(item.email);
                              setFormName(item.name);
                              setFormTier(item.subscriptionTier);
                              setFormDisabled(item.isDisabled);
                              setFormError(null);
                              setIsEditUserOpen(true);
                            }}
                            className="p-1 px-2 border border-[#D5D5D5] bg-[#F9F9F9] hover:bg-slate-100 rounded-lg text-[10px] font-black uppercase tracking-wider text-gray-700 transition-[#FAF9F9]"
                            title="Edit User"
                          >
                            Edit
                          </button>

                          {/* Reset Password Button */}
                          <button
                            onClick={() => {
                              setResetPassUser(item);
                              setFormResetPassword('');
                              setFormError(null);
                              setIsResetPassOpen(true);
                            }}
                            className="p-1 px-2 border border-[#D5D5D5] bg-[#F9F9F9] hover:bg-slate-100 rounded-lg text-[10px] font-black uppercase tracking-wider text-gray-700 transition-[#FAF9F9]"
                            title="Reset User Password"
                          >
                            Password
                          </button>

                          {/* Quick Toggle Disable status */}
                          <button
                            onClick={() => handleToggleStatus(item)}
                            className={`p-1.5 rounded-lg border transition-all ${
                              item.isDisabled 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100' 
                                : 'bg-red-50 text-red-700 border-red-100 hover:bg-red-100'
                            }`}
                            title={item.isDisabled ? 'Enable Profile' : 'Disable Profile'}
                          >
                            {item.isDisabled ? <UserCheck size={12} /> : <UserX size={12} />}
                          </button>

                          {/* One-click Tier Switcher */}
                          <button
                            onClick={() => handleToggleTier(item)}
                            className="p-1.5 bg-slate-50 border border-slate-200 text-gray-700 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Toggle Subscription Tier"
                          >
                            <Sparkles size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected User side drawer info screen */}
        <div id="inspector_dossier_panel" className="lg:col-span-1 bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm flex flex-col justify-between min-h-[400px]">
          <div>
            <div className="border-b border-[#F0F0F0] pb-3 mb-4">
              <h3 className="text-sm font-black text-american-blue uppercase tracking-widest flex items-center gap-2">
                <FileText size={16} />
                Client Investigation
              </h3>
            </div>

            {selectedUser ? (
              <div className="space-y-6">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
                  <div className="font-mono text-[9px] text-[#999999] uppercase tracking-widest mb-1">
                    Inspecting ledger record
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-american-blue truncate">{selectedUser.name}</h4>
                    <p className="text-xs text-[#666666] font-mono mt-0.5 truncate">{selectedUser.email}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200 text-[10px]">
                    <div>
                      <span className="text-[#999999] font-medium block uppercase tracking-wider">Tier level</span>
                      <strong className="text-american-blue font-extrabold uppercase leading-none block mt-0.5">
                        {selectedUser.subscriptionTier}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#999999] font-medium block uppercase tracking-wider">Account status</span>
                      <strong className={`${selectedUser.isDisabled ? 'text-american-red' : 'text-emerald-700'} font-extrabold uppercase leading-none block mt-0.5`}>
                        {selectedUser.isDisabled ? 'Disabled' : 'Active'}
                      </strong>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-200/50">
                    <button
                      onClick={() => {
                        setResetPassUser(selectedUser);
                        setFormResetPassword('');
                        setFormError(null);
                        setIsResetPassOpen(true);
                      }}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-black uppercase tracking-wider border border-[#D5D5D5] bg-[#FAF9F9] text-gray-700 hover:bg-[#F0FAF4] rounded-xl transition-all"
                    >
                      <Shield size={13} className="text-american-blue" />
                      Reset Password
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase text-[#666666] tracking-widest flex items-center gap-2">
                    Estimate Dossiers ({userEstimates.length})
                  </h4>

                  {loadingEstimates ? (
                    <div className="p-10 text-center text-xs font-bold text-gray-400 animate-pulse">Running database scan...</div>
                  ) : userEstimates.length === 0 ? (
                    <p className="text-xs text-gray-400 italic p-6 text-center border border-dashed border-gray-150 rounded-xl">
                      This user has not generated any estimates yet.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {userEstimates.map(est => (
                        <div key={est.id} className="p-3 bg-white hover:bg-slate-50 border border-gray-200 rounded-xl text-xs space-y-1.5 transition-colors">
                          <div className="flex justify-between items-start gap-1">
                            <span className="font-extrabold text-american-blue truncate">
                              {est.clientName || est.customerName || 'Fence Proposal'}
                            </span>
                            <span className="font-mono font-black text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                              ${est.totalCost ? est.totalCost.toLocaleString() : '0'}
                            </span>
                          </div>
                          <div className="flex justify-between text-[9px] text-[#999999] font-mono">
                            <span>Length: {est.fenceLength || '0'} LF</span>
                            <span>{est.createdAt ? new Date(est.createdAt).toLocaleDateString() : 'N/A'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-gray-400 italic flex flex-col items-center gap-3">
                <HelpCircle size={32} className="text-gray-300 animate-bounce" />
                Select a client profile from the directory to review estimates and dossier accounts.
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[9px] text-[#999999] font-mono">
            <span>Query token: Authorized JWT</span>
            <span>Lone Star Fence Works</span>
          </div>
        </div>
      </div>

      {/* Manual Registration Modal */}
      <AnimatePresence>
        {isAddUserOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              id="admin_add_user_modal" 
              className="bg-white w-full max-w-md p-6 rounded-2xl border border-[#E5E5E5] shadow-2xl relative"
            >
              <button 
                onClick={() => setIsAddUserOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-all font-bold text-lg"
              >
                ✕
              </button>
              
              <h3 className="text-md font-black text-american-blue uppercase tracking-widest mb-4">
                Register New User
              </h3>
              
              <form onSubmit={handleAddUserSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="Braden Smith"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">Email Address</label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="name@company.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">Initial Password</label>
                  <div className="relative">
                    <input
                      type={showFormPassword ? 'text' : 'password'}
                      required
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 pr-12 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all font-mono"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFormPassword(!showFormPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#666666] font-extrabold transition-colors text-xs"
                    >
                      {showFormPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">Subscription Tier</label>
                  <select
                    value={formTier}
                    onChange={(e) => setFormTier(e.target.value as any)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all font-bold"
                  >
                    <option value="free">Standard (Free)</option>
                    <option value="paid">Premium (Paid)</option>
                  </select>
                </div>

                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold font-mono">
                    {formError}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddUserOpen(false)}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider border border-[#D5D5D5] text-[#666666] rounded-xl hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 text-xs font-black uppercase tracking-wider bg-american-blue text-white rounded-xl hover:bg-american-blue/90 shadow-lg shadow-american-blue/15 transition-all"
                  >
                    {isSubmitting ? 'Creating...' : 'Enroll User'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Registry Modal */}
      <AnimatePresence>
        {isEditUserOpen && editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              id="admin_edit_user_modal" 
              className="bg-white w-full max-w-md p-6 rounded-2xl border border-[#E5E5E5] shadow-2xl relative"
            >
              <button 
                onClick={() => setIsEditUserOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-all font-bold text-lg"
              >
                ✕
              </button>
              
              <h3 className="text-md font-black text-american-blue uppercase tracking-widest mb-4">
                Edit User Registry
              </h3>
              
              <form onSubmit={handleEditUserSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">Full Name</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="Braden Smith"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">Email Address (Read-Only)</label>
                  <input
                    type="email"
                    disabled
                    value={formEmail}
                    className="block w-full rounded-xl border border-[#E5E5E5] bg-[#F0F0F0] px-4 py-2.5 text-xs text-[#999999] cursor-not-allowed font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">Subscription Tier</label>
                  <select
                    value={formTier}
                    onChange={(e) => setFormTier(e.target.value as any)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all font-bold"
                  >
                    <option value="free">Standard (Free)</option>
                    <option value="paid">Premium (Paid)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-55 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-black text-[#1A1A1A] uppercase tracking-wide">Account Access Toggle</span>
                    <span className="text-[10px] text-gray-500">Temporarily suspend client login rights.</span>
                  </div>
                  <input 
                    type="checkbox"
                    checked={formDisabled}
                    onChange={(e) => setFormDisabled(e.target.checked)}
                    className="h-4 w-4 text-american-blue focus:ring-american-blue rounded border-[#D5D5D5]"
                  />
                </div>

                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold font-mono">
                    {formError}
                  </div>
                )}

                <div className="flex justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleDeleteUser(editingUser.uid)}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-black uppercase tracking-wider border border-transparent bg-red-50 text-american-red hover:bg-red-100 rounded-xl transition-all"
                  >
                    <Trash2 size={13} />
                    Delete Profile
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditUserOpen(false)}
                      className="px-4 py-2 text-xs font-bold uppercase tracking-wider border border-[#D5D5D5] text-[#666666] rounded-xl hover:bg-gray-50 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-5 py-2 text-xs font-black uppercase tracking-wider bg-american-blue text-white rounded-xl hover:bg-american-blue/90 shadow-lg shadow-american-blue/15 transition-all"
                    >
                      {isSubmitting ? 'Saving...' : 'Save File'}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset Password Modal */}
      <AnimatePresence>
        {isResetPassOpen && resetPassUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              id="admin_reset_password_modal" 
              className="bg-white w-full max-w-md p-6 rounded-2xl border border-[#E5E5E5] shadow-2xl relative"
            >
              <button 
                onClick={() => setIsResetPassOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-all font-bold text-lg"
              >
                ✕
              </button>
              
              <h3 className="text-md font-black text-american-blue uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <Shield size={18} className="text-american-blue" /> User Password Reset
              </h3>
              <p className="text-xs text-gray-500 mb-4 font-bold">
                Enter or generate a temporary password for: <span className="text-american-blue font-extrabold">{resetPassUser.name}</span>
              </p>
              
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">Temporary Password</label>
                  <div className="relative">
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      required
                      value={formResetPassword}
                      onChange={(e) => setFormResetPassword(e.target.value)}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 pr-20 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all font-mono"
                      placeholder="••••••••"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowResetPassword(!showResetPassword)}
                        className="text-gray-400 hover:text-[#666666] transition-colors text-xs font-extrabold"
                      >
                        {showResetPassword ? 'Hide' : 'Show'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#";
                          let pass = "";
                          for (let i = 0; i < 10; ++i) {
                            pass += chars.charAt(Math.floor(Math.random() * chars.length));
                          }
                          setFormResetPassword(pass);
                          setShowResetPassword(true);
                        }}
                        className="text-american-blue hover:underline text-xs font-black"
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">Provide a secure temporary/new password that the user can use to log in.</p>
                </div>

                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold font-mono">
                    {formError}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsResetPassOpen(false)}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider border border-[#D5D5D5] text-[#666666] rounded-xl hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 text-xs font-black uppercase tracking-wider bg-american-blue text-white rounded-xl hover:bg-american-blue/90 shadow-lg shadow-american-blue/15 transition-all"
                  >
                    {isSubmitting ? 'Resetting...' : 'Save Temporary Password'}
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
