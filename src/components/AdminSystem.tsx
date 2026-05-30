import React from 'react';
import { 
  Shield, Users, Lock, Mail, Trash2, Settings, Check, X, 
  ChevronRight, Search, ArrowUpDown, UserCheck, UserX, Calendar, Sparkles, Briefcase, Key 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Interfaces matching requested data specs
interface AdminUser {
  email: string;
  uid: string;
  canAccessAllData: boolean;
  isAdmin: boolean;
}

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  subscriptionTier: 'free' | 'paid';
  createdAt: string;
  isDisabled: boolean;
  estimatesCount: number;
}

interface EstimateItem {
  id: string;
  clientName?: string;
  customerName?: string;
  fenceLength?: number;
  totalCost?: number;
  createdAt?: string;
  lastModified?: string;
}

interface AdminSystemProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  adminToken: string | null;
  setAdminToken: (token: string | null) => void;
}

export default function AdminSystem({ currentPath, onNavigate, adminToken, setAdminToken }: AdminSystemProps) {
  const [email, setEmail] = React.useState('bradens@lonestarfenceworks.com');
  const [password, setPassword] = React.useState('password123');
  const [loginError, setLoginError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [adminUid, setAdminUid] = React.useState<string | null>(null);

  // Load both token and uid on mount if present
  React.useEffect(() => {
    const storedToken = localStorage.getItem('company_admin_token');
    const storedUid = localStorage.getItem('company_admin_uid');
    if (storedToken) {
      setAdminToken(storedToken);
    }
    if (storedUid) {
      setAdminUid(storedUid);
    }
  }, [setAdminToken]);

  // Dashboard Data List
  const [users, setUsers] = React.useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [tierFilter, setTierFilter] = React.useState<'all' | 'free' | 'paid'>('all');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'disabled'>('all');
  const [sortField, setSortField] = React.useState<keyof UserProfile>('createdAt');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('desc');

  // Selected User Panel
  const [selectedUser, setSelectedUser] = React.useState<UserProfile | null>(null);
  const [selectedUserEstimates, setSelectedUserEstimates] = React.useState<EstimateItem[]>([]);
  const [loadingEstimates, setLoadingEstimates] = React.useState(false);

  // User Add/Edit Modal states
  const [isUserModalOpen, setIsUserModalOpen] = React.useState(false);
  const [newUserEmail, setNewUserEmail] = React.useState('');
  const [newUserName, setNewUserName] = React.useState('');
  const [newUserTier, setNewUserTier] = React.useState<'free' | 'paid'>('free');
  const [editingUser, setEditingUser] = React.useState<UserProfile | null>(null);
  const [userModalError, setUserModalError] = React.useState<string | null>(null);

  // Settings Password Fields
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = React.useState<string | null>(null);

  // Fetch users list
  const fetchUsers = React.useCallback(async () => {
    if (!adminToken) return;
    setLoadingUsers(true);
    try {
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'x-admin-token': adminToken
        }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else if (response.status === 401 || response.status === 403) {
        setAdminToken(null);
        setAdminUid(null);
        localStorage.removeItem('company_admin_uid');
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoadingUsers(false);
    }
  }, [adminToken, setAdminToken]);

  // Fetch specific user estimates
  const fetchUserEstimates = async (userId: string) => {
    setLoadingEstimates(true);
    try {
      const response = await fetch(`/api/admin/users/${userId}/estimates`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'x-admin-token': adminToken
        }
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedUserEstimates(data);
      }
    } catch (err) {
      console.error("Failed to fetch estimates:", err);
    } finally {
      setLoadingEstimates(false);
    }
  };

  React.useEffect(() => {
    if (adminToken && currentPath === '/admin') {
      fetchUsers();
    }
  }, [adminToken, currentPath, fetchUsers]);

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const result = await response.json();

      if (response.ok && result.success) {
        setAdminToken(result.token);
        localStorage.setItem('company_admin_token', result.token);
        if (result.admin && result.admin.uid) {
          setAdminUid(result.admin.uid);
          localStorage.setItem('company_admin_uid', result.admin.uid);
        }
        onNavigate('/admin');
      } else {
        setLoginError(result.error || 'Invalid credentials');
      }
    } catch (err) {
      setLoginError('Could not connect to the remote server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Change user tier
  const handleToggleTier = async (userProfile: UserProfile) => {
    const nextTier = userProfile.subscriptionTier === 'free' ? 'paid' : 'free';
    try {
      const response = await fetch(`/api/admin/users/${userProfile.uid}/tier`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
          'x-admin-token': adminToken
        },
        body: JSON.stringify({ tier: nextTier })
      });
      if (response.ok) {
        setUsers(prev => prev.map(u => u.uid === userProfile.uid ? { ...u, subscriptionTier: nextTier } : u));
        if (selectedUser?.uid === userProfile.uid) {
          setSelectedUser(prev => prev ? { ...prev, subscriptionTier: nextTier } : null);
        }
      }
    } catch (err) {
      console.error("Error setting tier:", err);
    }
  };

  // Enable / Disable user
  const handleToggleStatus = async (userProfile: UserProfile) => {
    const action = userProfile.isDisabled ? 'enable' : 'disable';
    try {
      const response = await fetch(`/api/admin/users/${userProfile.uid}/${action}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'x-admin-token': adminToken
        }
      });
      if (response.ok) {
        const nextStatus = !userProfile.isDisabled;
        setUsers(prev => prev.map(u => u.uid === userProfile.uid ? { ...u, isDisabled: nextStatus } : u));
        if (selectedUser?.uid === userProfile.uid) {
          setSelectedUser(prev => prev ? { ...prev, isDisabled: nextStatus } : null);
        }
      }
    } catch (err) {
      console.error("Error toggling disable status:", err);
    }
  };

  // Delete user completely
  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Are you absolutely sure you want to permanently delete this user and all of their saved estimates?")) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'x-admin-token': adminToken
        }
      });
      if (response.ok) {
        setUsers(prev => prev.filter(u => u.uid !== userId));
        setSelectedUser(null);
      }
    } catch (err) {
      console.error("Delete user failed:", err);
    }
  };

  // Create or Update User
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserModalError(null);
    const body = {
      email: newUserEmail,
      name: newUserName,
      subscriptionTier: newUserTier,
    };
    
    try {
      const url = editingUser 
        ? `/api/admin/users/${editingUser.uid}`
        : `/api/admin/users`;
      const method = editingUser ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
          'x-admin-token': adminToken
        },
        body: JSON.stringify(body)
      });
      
      const result = await response.json();
      if (response.ok && result.success) {
        setIsUserModalOpen(false);
        fetchUsers();
        if (editingUser && selectedUser?.uid === editingUser.uid) {
          setSelectedUser(prev => prev ? { ...prev, name: newUserName, email: newUserEmail, subscriptionTier: newUserTier } : null);
        }
      } else {
        setUserModalError(result.error || 'Failed to save user profile');
      }
    } catch (err) {
      setUserModalError('Communication error with endpoint');
    }
  };

  // Sort and filter users
  const handleSort = (field: keyof UserProfile) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const processedUsers = React.useMemo(() => {
    return users
      .filter(u => {
        const matchesSearch = u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              u.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesTier = tierFilter === 'all' || u.subscriptionTier === tierFilter;
        const matchesStatus = statusFilter === 'all' || 
          (statusFilter === 'active' && !u.isDisabled) || 
          (statusFilter === 'disabled' && u.isDisabled);
        return matchesSearch && matchesTier && matchesStatus;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        
        if (typeof valA === 'string') {
          return sortDirection === 'asc' 
            ? (valA as string).localeCompare(valB as string) 
            : (valB as string).localeCompare(valA as string);
        }
        
        if (typeof valA === 'boolean') {
          return sortDirection === 'asc'
            ? (valA ? 1 : 0) - (valB ? 1 : 0)
            : (valB ? 1 : 0) - (valA ? 1 : 0);
        }

        return sortDirection === 'asc'
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      });
  }, [users, searchTerm, tierFilter, statusFilter, sortField, sortDirection]);

  // Bulk operation - disable all filtered
  const handleBulkDisable = async () => {
    if (!window.confirm(`Are you sure you want to disable all ${processedUsers.length} active matching users?`)) return;
    for (const u of processedUsers) {
      if (!u.isDisabled) {
        await handleToggleStatus(u);
      }
    }
  };

  // Change Admin Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    try {
      const response = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
          'x-admin-token': adminToken
        },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setPasswordSuccess(result.message || "Password changed successfully! Keep this key safe.");
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordError(result.error || "Password update failed.");
      }
    } catch (err) {
      setPasswordError("Failed to communicate with authentication server.");
    }
  };

  // Render Admin Login Page
  if (currentPath === '/admin-login') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-transparent py-12 px-4 sm:px-6 lg:px-8">
        <div id="admin_login_card" className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl border border-[#E5E5E5] shadow-xl">
          <div className="text-center">
            <div className="mx-auto h-14 w-14 bg-american-blue/5 rounded-full flex items-center justify-center text-american-blue mb-4">
              <Shield size={32} />
            </div>
            <h2 className="text-3xl font-black text-american-blue tracking-tight uppercase">Admin Console</h2>
            <p className="mt-2 text-sm text-[#666666] font-medium">Lone Star Fence Works - Authorization Secure Access</p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleLogin}>
            <div className="rounded-md space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1">Corporate Email</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Mail size={16} />
                  </div>
                  <input
                    id="admin_email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] py-3 text-sm text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="admin@lonestarfenceworks.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1">Security Credentials</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Lock size={16} />
                  </div>
                  <input
                    id="admin_password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] py-3 text-sm text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>

            {loginError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold leading-tight flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <button
                id="admin_submit_btn"
                type="submit"
                disabled={isSubmitting}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-black uppercase tracking-wider rounded-xl text-white bg-american-blue hover:bg-american-blue/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-american-blue transition-all shadow-lg shadow-american-blue/15"
              >
                {isSubmitting ? 'Authenticating...' : 'Establish Secure Connection'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Render Admin settings page
  if (currentPath === '/admin/settings') {
    return (
      <div className="max-w-3xl mx-auto space-y-8 mt-4">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-[#E5E5E5] pb-5">
          <div>
            <h1 className="text-3xl font-black text-american-blue tracking-tight uppercase">Admin Security Settings</h1>
            <p className="text-sm text-[#666666] mt-1">Configure and manage corporate system administrative credentials.</p>
          </div>
          <button 
            onClick={() => onNavigate('/admin')}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider border border-[#D5D5D5] hover:bg-gray-50 text-[#666666] rounded-xl transition-all"
          >
            Back to User Table
          </button>
        </div>

        {/* Change password card */}
        <div id="admin_settings_card" className="bg-white rounded-2xl border border-[#E5E5E5] p-8 shadow-sm">
          <div className="flex items-center gap-3 border-b border-[#F0F0F0] pb-4 mb-6">
            <div className="p-2.5 bg-american-blue/5 text-american-blue rounded-xl">
              <Key size={18} />
            </div>
            <h2 className="text-lg font-black text-american-blue tracking-tight uppercase">Regenerate Master Code</h2>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">Current Password</label>
                <input 
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-3 text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">New Password</label>
                <input 
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-3 text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                  placeholder="Minimum 8 characters"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">Confirm New Password</label>
                <input 
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-3 text-sm text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                  placeholder="Repeat new password"
                />
              </div>
            </div>

            {passwordError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold leading-tight">
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="p-4 bg-emerald-55 text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold leading-tight">
                {passwordSuccess}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="submit"
                className="px-6 py-3 text-xs font-black uppercase tracking-wider bg-american-blue text-white rounded-xl hover:bg-american-blue/90 shadow-lg shadow-american-blue/15 transition-all"
              >
                Change Admin Code
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Render Admin Dashboard (/admin)
  return (
    <div className="space-y-8 mt-4">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-[#E5E5E5] pb-5 gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-black text-american-blue tracking-tight uppercase">Corporate Audit Panel</h1>
            <span className="bg-american-red/10 text-american-red font-black text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-american-red/20">Authorized Privileges</span>
          </div>
          <p className="text-sm text-[#666666] mt-1">Unified administrative registry of active clients, pricing models, and estimate volumes.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button 
            onClick={() => onNavigate('/admin/settings')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border border-[#D5D5D5] hover:bg-gray-50 text-[#666666] rounded-xl transition-all"
          >
            <Settings size={14} />
            Security Settings
          </button>
          <button 
            onClick={() => {
              setAdminToken(null);
              setAdminUid(null);
              localStorage.removeItem('company_admin_token');
              localStorage.removeItem('company_admin_uid');
              onNavigate('/admin-login');
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider bg-american-red text-white hover:bg-american-red/90 rounded-xl transition-all"
          >
            Sign Out Admin
          </button>
        </div>
      </div>

      {/* Grid Content */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main User List Section */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-[#F0F0F0] pb-2">
              <h2 className="text-sm font-black text-american-blue uppercase tracking-widest">Client Base Directory</h2>
              <button 
                onClick={() => {
                  setEditingUser(null);
                  setNewUserEmail('');
                  setNewUserName('');
                  setNewUserTier('free');
                  setIsUserModalOpen(true);
                }}
                className="px-3 py-1.5 bg-american-blue hover:bg-american-blue/90 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
              >
                + Add User
              </button>
            </div>
            
            {/* Filter and search bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text"
                  placeholder="Search corporate profile name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                />
              </div>

              <div className="flex items-center gap-2">
                <select 
                  value={tierFilter} 
                  onChange={(e) => setTierFilter(e.target.value as any)}
                  className="rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue"
                >
                  <option value="all">All Tiers</option>
                  <option value="free">Standard (Free)</option>
                  <option value="paid">Premium (Paid)</option>
                </select>

                <select 
                  value={statusFilter} 
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Profiles</option>
                  <option value="disabled">Disabled Profiles</option>
                </select>

                {processedUsers.some(u => !u.isDisabled) && (
                  <button 
                    onClick={handleBulkDisable}
                    className="px-3 py-2 bg-red-50 border border-red-200 text-red-800 hover:bg-red-100 font-bold text-xs rounded-xl transition-all"
                  >
                    Bulk Disable
                  </button>
                )}
              </div>
            </div>

            {/* Table of Users */}
            {loadingUsers ? (
              <div className="p-12 text-center text-sm font-black text-[#969696] animate-pulse">Running full-scrypt query on corporate ledger...</div>
            ) : processedUsers.length === 0 ? (
              <div className="p-12 text-center text-sm font-black text-[#969696]">No matching corporate client profiles found.</div>
            ) : (
              <div className="overflow-x-auto border border-[#E5E5E5] rounded-xl">
                <table id="client_directory_table" className="min-w-full divide-y divide-[#E5E5E5] text-left">
                  <thead className="bg-[#FAF9F9]">
                    <tr className="text-[10px] font-black uppercase text-[#666666] tracking-wider">
                      <th className="px-4 py-3.5 select-none hover:text-american-blue cursor-pointer" onClick={() => handleSort('name')}>
                        <div className="flex items-center gap-1">Client Profile <ArrowUpDown size={12} /></div>
                      </th>
                      <th className="px-4 py-3.5 select-none hover:text-american-blue cursor-pointer" onClick={() => handleSort('subscriptionTier')}>
                        <div className="flex items-center gap-1">Tier <ArrowUpDown size={12} /></div>
                      </th>
                      <th className="px-4 py-3.5 select-none hover:text-american-blue cursor-pointer" onClick={() => handleSort('createdAt')}>
                        <div className="flex items-center gap-1">Created <ArrowUpDown size={12} /></div>
                      </th>
                      <th className="px-4 py-3.5 select-none hover:text-american-blue cursor-pointer" onClick={() => handleSort('estimatesCount')}>
                        <div className="flex items-center gap-1">Estimates <ArrowUpDown size={12} /></div>
                      </th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F0F0] bg-white text-xs text-[#1A1A1A]">
                    {processedUsers.map((item) => (
                      <tr 
                        key={item.uid} 
                        className={`hover:bg-gray-50/70 transition-all cursor-pointer ${selectedUser?.uid === item.uid ? 'bg-american-blue/5' : ''}`}
                        onClick={() => {
                          setSelectedUser(item);
                          fetchUserEstimates(item.uid);
                        }}
                      >
                        <td className="px-4 py-4">
                          <div className="overflow-hidden">
                            <p className="font-bold text-american-blue truncate">{item.name}</p>
                            <p className="text-[10px] font-mono text-[#999999] truncate">{item.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            item.subscriptionTier === 'paid' 
                              ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                              : 'bg-gray-100 text-gray-700 border border-gray-200'
                          }`}>
                            {item.subscriptionTier === 'paid' ? '★ Paid' : 'Free'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-[#666666] font-mono text-[11px]">
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-4 py-4 text-center font-black">
                          {item.estimatesCount}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[9px] font-extrabold ${
                            item.isDisabled 
                              ? 'bg-[#FFEBEB] text-red-700 border border-red-100' 
                              : 'bg-emerald-58 bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}>
                            {item.isDisabled ? 'Disabled' : 'Good/Active'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit Details Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingUser(item);
                                setNewUserEmail(item.email);
                                setNewUserName(item.name);
                                setNewUserTier(item.subscriptionTier);
                                setIsUserModalOpen(true);
                              }}
                              className="p-1.5 bg-[#EBF5FF] border border-[#D0E7FF] text-[#0066CC] rounded-lg hover:bg-[#D0E7FF] transition-all"
                              title="Edit Profile"
                            >
                              <Settings size={13} />
                            </button>

                            {/* Toggle Disable Button */}
                            <button
                              onClick={() => handleToggleStatus(item)}
                              className={`p-1.5 rounded-lg border transition-all ${
                                item.isDisabled 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100' 
                                  : 'bg-red-50 text-red-700 border-red-100 hover:bg-red-100'
                              }`}
                              title={item.isDisabled ? 'Enable Profile' : 'Disable Profile'}
                            >
                              {item.isDisabled ? <UserCheck size={13} /> : <UserX size={13} />}
                            </button>

                            {/* Change Tier Button */}
                            <button
                              onClick={() => handleToggleTier(item)}
                              className="p-1.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-100 transition-all"
                              title="Toggle Sub Tier"
                            >
                              <Sparkles size={13} />
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={() => handleDeleteUser(item.uid)}
                              className="p-1.5 bg-red-50 border border-pink-100 text-red-700 rounded-lg hover:bg-red-100 transition-all"
                              title="Trash Profile Completely"
                            >
                              <Trash2 size={13} />
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
        </div>

        {/* Selected User estimates detail view card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-black text-american-blue uppercase tracking-widest border-b border-[#F0F0F0] pb-2">Client Details & Estimates</h2>
            
            {selectedUser ? (
              <div className="space-y-6">
                {/* User quick info summary */}
                <div id="inspector_panel" className="p-4 bg-[#FAF9F9] rounded-xl border border-[#E5E5E5] space-y-3">
                  <div className="font-mono text-[10px] text-[#999999] uppercase tracking-wider">Investigating Profile</div>
                  <div className="space-y-1">
                    <h3 className="text-md font-black text-american-blue leading-none">{selectedUser.name}</h3>
                    <p className="text-xs text-[#666666] font-mono leading-none mt-1">{selectedUser.email}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E1E1E1] text-[11px]">
                    <div>
                      <span className="text-[#999999] font-medium block">Subscription Tier</span>
                      <strong className="text-american-blue font-extrabold uppercase leading-none block mt-0.5">
                        {selectedUser.subscriptionTier}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#999999] font-medium block">Account Status</span>
                      <strong className={`${selectedUser.isDisabled ? 'text-red-700' : 'text-emerald-800'} font-extrabold uppercase leading-none block mt-0.5`}>
                        {selectedUser.isDisabled ? 'Disabled' : 'Active'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* List Estimates */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase text-[#666666] tracking-widest flex items-center gap-2">
                    <Briefcase size={14} />
                    Estimate Repository ({selectedUserEstimates.length})
                  </h4>

                  {loadingEstimates ? (
                    <div className="p-8 text-center text-xs font-bold text-[#969696] animate-pulse">Retrieving records...</div>
                  ) : selectedUserEstimates.length === 0 ? (
                    <p className="text-xs text-[#999999] italic p-4 text-center border border-dashed border-[#E5E5E5] rounded-xl">This user has not generated any estimates yet.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                      {selectedUserEstimates.map(est => (
                        <div key={est.id} className="p-3 bg-white hover:bg-gray-50 border border-[#E5E5E5] rounded-xl text-xs space-y-1.5 transition-all">
                          <div className="flex justify-between items-start">
                            <span className="font-extrabold text-american-blue truncate max-w-[130px]">
                              {est.clientName || est.customerName || 'Fence Proposal'}
                            </span>
                            <span className="font-bold text-emerald-800 text-[10px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                              ${est.totalCost ? est.totalCost.toLocaleString() : '0'}
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-[10px] text-[#999999] font-mono">
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
              <div className="p-12 text-center text-xs text-[#999999] font-medium flex flex-col items-center justify-center gap-3">
                <Users size={32} className="text-gray-300 animate-bounce" />
                <p>Select a Client profile from the registry directory to inspect generated estimates and dossier states.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Add / Edit User Modal */}
      <AnimatePresence>
        {isUserModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              id="admin_user_modal" 
              className="bg-white w-full max-w-md p-6 rounded-2xl border border-[#E5E5E5] shadow-2xl relative"
            >
              <button 
                onClick={() => setIsUserModalOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-all font-bold text-lg"
              >
                ✕
              </button>
              
              <h3 className="text-xl font-black text-american-blue uppercase tracking-tight mb-4">
                {editingUser ? 'Edit System User' : 'Register New User'}
              </h3>
              
              <form onSubmit={handleSaveUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="Braden Smith"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="name@company.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1">Subscription Tier</label>
                  <select
                    value={newUserTier}
                    onChange={(e) => setNewUserTier(e.target.value as any)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                  >
                    <option value="free">Standard (Free)</option>
                    <option value="paid">Premium (Paid)</option>
                  </select>
                </div>

                {userModalError && (
                  <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold font-mono">
                    {userModalError}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsUserModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider border border-[#D5D5D5] text-[#666666] rounded-xl hover:bg-gray-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-black uppercase tracking-wider bg-american-blue text-white rounded-xl hover:bg-american-blue/90 shadow-lg transition-all"
                  >
                    Save Changes
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
