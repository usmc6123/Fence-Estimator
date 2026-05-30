import React from 'react';
import { Shield, LogOut, CheckCircle, HelpCircle, FileText, AlertTriangle, ArrowLeft } from 'lucide-react';
import AdminSidebar from '../components/AdminSidebar';
import AdminDashboard from '../components/AdminDashboard';
import AdminUserManagement from '../components/AdminUserManagement';
import AdminSubscriptionTiers from '../components/AdminSubscriptionTiers';
import AdminSettings from '../components/AdminSettings';
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

interface AdminConsoleProps {
  adminToken: string | null;
  setAdminToken: (token: string | null) => void;
  onNavigate: (path: string) => void;
  currentUser: { email?: string; name?: string } | null;
  isAdminVerifying?: boolean;
}

export default function AdminConsole({ adminToken, setAdminToken, onNavigate, currentUser, isAdminVerifying = false }: AdminConsoleProps) {
  const [activeSubTab, setActiveSubTab] = React.useState('dashboard');
  const [users, setUsers] = React.useState<UserProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Form states for inline authentication if token is missing
  const [email, setEmail] = React.useState('bradens@lonestarfenceworks.com');
  const [password, setPassword] = React.useState('password123');
  const [loginError, setLoginError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Fetch all users to populate the admin dashboards
  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        const errData = await response.json().catch(() => ({}));
        setError(errData.error || 'Identity verification failed. Please authenticate.');
        if (response.status === 401 || response.status === 403) {
          setAdminToken(null);
        }
      }
    } catch (err) {
      setError('Communication with core services timed out.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (isAdminVerifying) return;

    if (adminToken) {
      fetchUsers();
    } else {
      setLoading(false);
    }
  }, [adminToken, isAdminVerifying]);

  // Handle automatic token refresh every 5 minutes to keep session alive and prevent premature kick out
  React.useEffect(() => {
    if (!adminToken) return;

    const refreshAdminToken = async () => {
      console.log('[AdminConsole] Initiating credentials verification/token refresh sequence...');
      try {
        const response = await fetch('/api/admin/verify-credentials', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.token) {
            console.log('[AdminConsole] Admin session verified. Local token extended.');
            setAdminToken(data.token);
            localStorage.setItem('company_admin_token', data.token);
          } else {
            console.warn('[AdminConsole] Token validation response indicates invalid token status.', data);
          }
        } else {
          console.error('[AdminConsole] Credentials validation failed with status:', response.status);
          if (response.status === 401 || response.status === 403) {
            console.warn('[AdminConsole] Session expired on backend, logging out.');
            setAdminToken(null);
            localStorage.removeItem('company_admin_token');
          }
        }
      } catch (err) {
        console.error('[AdminConsole] Communication with validation server timed out:', err);
      }
    };

    // Keep-alive check every 5 minutes
    const intervalId = setInterval(refreshAdminToken, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [adminToken, setAdminToken]);

  const handleSignOut = () => {
    setAdminToken(null);
    localStorage.removeItem('company_admin_token');
  };

  const handleInlineLogin = async (e: React.FormEvent) => {
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
        setLoginError(null);
      } else {
        setLoginError(result.error || 'Invalid credentials');
      }
    } catch (err) {
      setLoginError('Could not connect to the remote server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderContent = () => {
    switch (activeSubTab) {
      case 'dashboard':
        return <AdminDashboard users={users} loading={loading} />;
      case 'users':
        return (
          <AdminUserManagement 
            users={users} 
            loading={loading} 
            adminToken={adminToken}
            onRefresh={fetchUsers}
          />
        );
      case 'tiers':
        return <AdminSubscriptionTiers users={users} />;
      case 'settings':
        return (
          <AdminSettings 
            adminEmail="bradens@lonestarfenceworks.com"
            adminToken={adminToken}
            setAdminToken={setAdminToken}
            onNavigate={onNavigate}
          />
        );
      case 'activity':
        return (
          <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm space-y-4">
            <div className="border-b border-[#F0F0F0] pb-3 mb-4">
              <h3 className="text-sm font-black text-american-blue uppercase tracking-widest flex items-center gap-2">
                <FileText size={16} />
                LDAP Audit Logs
              </h3>
              <p className="text-[11px] text-gray-500 font-sans">Corporate action-ledger history for the Lone Star Fence Works node.</p>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-start">
                <div className="space-y-1">
                  <p className="text-american-blue font-bold">Admin session token created successfully</p>
                  <p className="text-[10px] text-gray-400">bradens@lonestarfenceworks.com authenticated from active node</p>
                </div>
                <span className="text-[10px] text-gray-400">2 hours ago</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-start">
                <div className="space-y-1">
                  <p className="text-american-blue font-bold">Encrypted database snapshots archived</p>
                  <p className="text-[10px] text-gray-400">Automated system backup sequence parsed</p>
                </div>
                <span className="text-[10px] text-gray-400">4 hours ago</span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-start">
                <div className="space-y-1">
                  <p className="text-american-blue font-bold">Standard security credentials refreshed</p>
                  <p className="text-[10px] text-gray-400">RSA keys rotate sequence validated</p>
                </div>
                <span className="text-[10px] text-gray-400">1 day ago</span>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (isAdminVerifying) {
    return (
      <div className="bg-white rounded-2xl border border-[#E5E5E5] p-12 text-center shadow-sm flex flex-col items-center justify-center gap-4 min-h-[400px]">
        <div id="loading_spinner" className="animate-spin rounded-full h-8 w-8 border-b-2 border-american-blue"></div>
        <p className="text-xs text-gray-500 font-sans font-semibold">Verifying secure admin credentials clearance...</p>
      </div>
    );
  }

  if (!adminToken) {
    return (
      <div className="space-y-6">
        <div id="admin_console_nav_header" className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-sm">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-american-blue text-white rounded-2xl flex items-center justify-center shadow-lg shadow-american-blue/20">
              <Shield size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-american-blue uppercase tracking-wider">Admin Console</h2>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-american-blue/10 text-american-blue border border-american-blue/10">
                  L1 Master System
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1 font-sans">
                Lone Star Fence Works — Full System Administration
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm">
          <div className="max-w-md mx-auto py-12 px-4">
            <div className="text-center mb-8">
              <div className="mx-auto h-14 w-14 bg-american-blue/5 rounded-full flex items-center justify-center text-american-blue mb-4 shadow-sm">
                <Shield size={32} />
              </div>
              <h2 className="text-2xl font-black text-american-blue tracking-tight uppercase">Admin Console Authentication</h2>
              <p className="mt-1.5 text-xs text-[#666666] font-medium">Please sign in as an administrator to access console controls</p>
            </div>
            
            <form className="space-y-4" onSubmit={handleInlineLogin}>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#666666] tracking-widest mb-1">Corporate Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-3 text-sm text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                  placeholder="admin@lonestarfenceworks.com"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-[#666666] tracking-widest mb-1">Security Credentials</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-3 text-sm text-[#1A1A1A] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                  placeholder="••••••••"
                />
              </div>

              {loginError && (
                <div id="inline_login_error" className="p-3 bg-red-50 border border-red-200 text-american-red rounded-xl text-xs font-bold leading-tight">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center py-3 px-4 border border-transparent text-xs font-black uppercase tracking-wider rounded-xl text-white bg-american-blue hover:bg-american-blue/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-american-blue transition-all shadow-lg shadow-american-blue/15"
              >
                {isSubmitting ? 'Authenticating...' : 'Sign In To Console'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Console Header */}
      <div id="admin_console_nav_header" className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-american-blue text-white rounded-2xl flex items-center justify-center shadow-lg shadow-american-blue/20">
            <Shield size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-american-blue uppercase tracking-wider">Admin Console</h2>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-american-blue/10 text-american-blue border border-american-blue/10">
                L1 Master System
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1 font-sans">
              Lone Star Fence Works — Full System Administration
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-center font-sans">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest block">Active Supervisor</span>
            <span className="text-xs font-black text-american-blue block mt-0.5">bradens@lonestarfenceworks.com</span>
          </div>

          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-american-blue hover:bg-american-blue/95 hover:scale-102 hover:-translate-y-0.5 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-american-blue/15 transition-all"
          >
            <LogOut size={14} />
            Sign Out Admin
          </button>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar Nav */}
        <AdminSidebar activeSubTab={activeSubTab} setActiveSubTab={setActiveSubTab} />

        {/* Dynamic Display Board */}
        <div className="flex-1 min-w-0">
          {error ? (
            <div className="bg-white rounded-2xl border border-[#E5E5E5] p-12 text-center shadow-sm flex flex-col items-center justify-center gap-4">
              <AlertTriangle size={48} className="text-american-red animate-pulse" />
              <div className="space-y-1">
                <h4 className="text-sm font-black uppercase text-american-blue tracking-wider">Credentials Check Failure</h4>
                <p className="text-xs text-gray-500 max-w-md">{error}</p>
              </div>
              <button 
                onClick={handleSignOut}
                className="px-5 py-2.5 bg-[#FFEBEB] text-american-red border border-red-200 font-black text-xs uppercase tracking-wider rounded-xl hover:bg-red-100 transition-colors"
              >
                Authenticate session
              </button>
            </div>
          ) : (
            renderContent()
          )}
        </div>
      </div>
    </div>
  );
}
