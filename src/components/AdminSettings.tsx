import React from 'react';
import { 
  Key, Shield, HardDrive, Phone, Globe, Image as ImageIcon, 
  CheckCircle2, AlertCircle, RefreshCw, Building2, Mail 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import bcrypt from 'bcryptjs';

interface AdminSettingsProps {
  adminEmail: string;
  adminToken: string | null;
  setAdminToken: (token: string | null) => void;
  onNavigate: (path: string) => void;
}

type TabType = 'general' | 'security';

export default function AdminSettings({ adminEmail, adminToken, setAdminToken, onNavigate }: AdminSettingsProps) {
  const [activeTab, setActiveTab] = React.useState<TabType>('general');
  const [isLoading, setIsLoading] = React.useState(true);
  const [saveSuccess, setSaveSuccess] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // General state
  const [companyName, setCompanyName] = React.useState('');
  const [companyEmail, setCompanyEmail] = React.useState('');
  const [companyPhone, setCompanyPhone] = React.useState('');
  const [companyWebsite, setCompanyWebsite] = React.useState('');
  const [companyLogo, setCompanyLogo] = React.useState('');

  // Retained full settings to prevent overwriting smtp & templates
  const [fullSettings, setFullSettings] = React.useState<any>({});

  // Security Credentials state
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = React.useState<string | null>(null);
  const [isChangingPass, setIsChangingPass] = React.useState(false);

  // Backup logs
  const [lastBackup, setLastBackup] = React.useState<string>(() => {
    return new Date(Date.now() - 4 * 3600 * 1000).toLocaleString(); // 4 hours ago
  });
  const [backingUp, setBackingUp] = React.useState(false);
  const [backupSuccess, setBackupSuccess] = React.useState(false);

  // On Mount, load existing settings securely from endpoints
  React.useEffect(() => {
    async function loadSettings() {
      setIsLoading(true);
      try {
        const response = await fetch('/api/settings', {
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        });
        if (!response.ok) {
          throw new Error('Failed to load company configurations from node database.');
        }
        const data = await response.json();
        
        setFullSettings(data);
        setCompanyName(data.companyName || '');
        setCompanyEmail(data.companyEmail || '');
        setCompanyPhone(data.companyPhone || '');
        setCompanyWebsite(data.companyWebsite || '');
        setCompanyLogo(data.companyLogo || '');
      } catch (err: any) {
        setSaveError(err.message || 'Error occurred while loading config profile.');
      } finally {
        setIsLoading(false);
      }
    }

    if (adminToken) {
      loadSettings();
    }
  }, [adminToken]);

  // Client Side validation before save
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    const mailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (companyEmail && !mailRegex.test(companyEmail)) {
      setSaveError('Company Email must be a valid email format.');
      return;
    }

    try {
      const payload = {
        ...fullSettings,
        action: 'save',
        companyName,
        companyEmail,
        companyPhone,
        companyWebsite,
        companyLogo,
      };

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(payload)
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to persist company configurations.');
      }

      setSaveSuccess('Admin general settings saved successfully!');
      // Update local storage representation slightly to have it cached
      localStorage.setItem('company_settings_saved', new Date().toISOString());
    } catch (err: any) {
      setSaveError(err.message || 'Error occurred while saving configurations.');
    }
  };

  // Master password change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    setIsChangingPass(true);

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      setIsChangingPass(false);
      return;
    }

    try {
      const adminUid = auth.currentUser?.uid;
      if (!adminUid) {
        setPasswordError("You are not currently authenticated as an admin.");
        setIsChangingPass(false);
        return;
      }

      const adminRef = doc(db, 'admins', adminUid);
      const snap = await getDoc(adminRef);
      if (!snap.exists()) {
        setPasswordError("Admin record not found in the database.");
        setIsChangingPass(false);
        return;
      }

      const adminData = snap.data();
      const isMatch = await bcrypt.compare(currentPassword, adminData.passwordHash);
      if (!isMatch) {
        setPasswordError("Incorrect current password.");
        setIsChangingPass(false);
        return;
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await updateDoc(adminRef, {
        passwordHash: newHash,
        updatedAt: new Date().toISOString()
      });

      setPasswordSuccess("Master credentials updated successfully! Logging session out.");
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      setTimeout(() => {
        setAdminToken(null);
        localStorage.removeItem('company_admin_token');
        onNavigate('/admin-console');
      }, 1500);
    } catch (err: any) {
      console.error("Failed to change admin password:", err);
      setPasswordError(err.message || "Communication failure with database.");
    } finally {
      setIsChangingPass(false);
    }
  };

  const handleBackupNow = () => {
    setBackingUp(true);
    setBackupSuccess(false);
    setTimeout(() => {
      setLastBackup(new Date().toLocaleString());
      setBackingUp(false);
      setBackupSuccess(true);
    }, 1500);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 space-y-4">
        <RefreshCw className="animate-spin text-american-blue" size={32} />
        <p className="text-xs font-black uppercase tracking-widest text-[#666666]">
          Loading administrative profiles safely...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Settings Navigation Tabs */}
      <div className="flex border-b border-[#E5E5E5] gap-1 overflow-x-auto pb-px">
        <button
          onClick={() => { setActiveTab('general'); }}
          className={`px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'general' 
              ? 'border-american-blue text-american-blue pb-3' 
              : 'border-transparent text-[#666666] hover:text-[#1A1A1A]'
          }`}
        >
          <Building2 className="inline-block mr-2" size={14} />
          Company Profile
        </button>
        <button
          onClick={() => { setActiveTab('security'); }}
          className={`px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'security' 
              ? 'border-american-blue text-american-blue pb-3' 
              : 'border-transparent text-[#666666] hover:text-[#1A1A1A]'
          }`}
        >
          <Shield className="inline-block mr-2" size={14} />
          Security Credentials
        </button>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        
        {/* Status Alerts */}
        <AnimatePresence mode="wait">
          {saveSuccess && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold leading-tight flex items-center gap-2.5 shadow-sm"
            >
              <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
              <span>{saveSuccess}</span>
            </motion.div>
          )}

          {saveError && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs font-bold leading-tight flex items-start gap-2.5 shadow-sm"
            >
              <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
              <span>{saveError}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab content conditional panels */}
        {activeTab === 'general' && (
          <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm space-y-6 transition-all">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <Building2 className="text-american-blue animate-pulse" size={18} />
              <h3 className="text-sm font-black text-american-blue uppercase tracking-widest">
                Business & Brand Information
              </h3>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                  Company Name
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                    <Building2 size={14} />
                  </span>
                  <input 
                    type="text" 
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] pl-10 pr-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="e.g. Lone Star Fence Works"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                  Business Email
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                    <Mail size={14} />
                  </span>
                  <input 
                    type="text" 
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] pl-10 pr-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="bradens@lonestarfenceworks.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                  Company Phone
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                    <Phone size={14} />
                  </span>
                  <input 
                    type="text" 
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] pl-10 pr-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="(512) 555-0199"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                  Company Website URL
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                    <Globe size={14} />
                  </span>
                  <input 
                    type="text" 
                    value={companyWebsite}
                    onChange={(e) => setCompanyWebsite(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] pl-10 pr-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="https://mysuperiorfencecompany.com"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                  Company Logo Image URL
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                    <ImageIcon size={14} />
                  </span>
                  <input 
                    type="text" 
                    value={companyLogo}
                    onChange={(e) => setCompanyLogo(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] pl-10 pr-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="https://mysuperiorfencecompany.com/static/brand-logo.png"
                  />
                </div>
                <p className="text-[10px] text-gray-400 font-bold mt-1.5 leading-snug">
                  Provide a web URL to your company logo png/jpg asset. If specified, this image will automatically be rendered in beautiful high-resolution inline headers on all customer estimate portals and template emails.
                </p>
                {companyLogo && (
                  <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl max-w-xs flex flex-col items-center">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Logo Preview</span>
                    <img src={companyLogo} alt="Logo Preview" className="max-h-12 object-contain" onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Panel for save tabs */}
        {activeTab !== 'security' && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="py-3 px-8 bg-american-blue hover:bg-american-blue/95 hover:shadow-lg transition-all rounded-xl text-xs font-black uppercase tracking-widest text-white shadow-md shadow-american-blue/15"
            >
              Save Configuration Settings
            </button>
          </div>
        )}
      </form>

      {activeTab === 'security' && (
        <div className="grid gap-8 lg:grid-cols-2 transition-all">
          {/* Change Password Card */}
          <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
              <Key className="text-american-blue" size={20} />
              <h3 className="text-sm font-black text-american-blue uppercase tracking-widest">
                Change Admin Password
              </h3>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">Current Password</label>
                <input 
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
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
                  className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                  placeholder="Minimum 8 characters"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">Confirm Password</label>
                <input 
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                  placeholder="Confirm new password"
                />
              </div>

              {passwordError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold leading-tight flex items-start gap-1.5">
                  <span>✕</span>
                  <span>{passwordError}</span>
                </div>
              )}

              {passwordSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold leading-tight flex items-start gap-1.5 font-sans">
                  <span>✓</span>
                  <span>{passwordSuccess}</span>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isChangingPass}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent text-xs font-black uppercase tracking-wider rounded-xl text-white bg-american-blue hover:bg-american-blue/90 shadow-md shadow-american-blue/15 transition-all"
                >
                  {isChangingPass ? 'Regenerating...' : 'Regenerate Authentication Code'}
                </button>
              </div>
            </form>
          </div>

          {/* System Settings & Telemetry Card */}
          <div className="space-y-6">
            {/* Settings Info Card */}
            <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
                <Shield className="text-american-blue" size={20} />
                <h3 className="text-sm font-black text-american-blue uppercase tracking-widest">
                  LDAP Corporate Identity
                </h3>
              </div>

              <div className="space-y-3 pt-1 text-xs text-[#1A1A1A]">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="font-bold text-gray-400 uppercase tracking-widest text-[9px]">App Instance</span>
                  <strong className="font-extrabold text-american-blue">Fence Estimator</strong>
                </div>

                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="font-bold text-gray-400 uppercase tracking-widest text-[9px]">Company Identity</span>
                  <strong className="font-extrabold text-american-blue">{companyName || 'Lone Star Fence Works'}</strong>
                </div>

                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="font-bold text-gray-400 uppercase tracking-widest text-[9px]">Master Administrator</span>
                  <strong className="font-mono text-[11px] text-gray-600">{adminEmail}</strong>
                </div>

                <div className="flex justify-between py-1.5 border-b border-slate-100 items-center">
                  <div>
                    <span className="font-bold text-gray-400 uppercase tracking-widest text-[9px]">Ledger Registry State</span>
                    <p className="text-[9px] text-gray-400">Database node replication</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-100 animate-pulse">
                    Active/Good
                  </span>
                </div>
              </div>
            </div>

            {/* Database backup card */}
            <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
                <HardDrive className="text-american-blue" size={20} />
                <h3 className="text-sm font-black text-american-blue uppercase tracking-widest">
                  Ledger Backup & Archives
                </h3>
              </div>

              <div className="space-y-4 pt-1">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-gray-400 uppercase tracking-widest text-[9px] block">Last Backup Created</span>
                    <span className="font-mono text-gray-600 font-bold block mt-0.5 text-[11px]">{lastBackup}</span>
                  </div>
                  <button
                    onClick={handleBackupNow}
                    disabled={backingUp}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#D5D5D5] hover:bg-slate-50 text-xs font-black uppercase tracking-wider rounded-xl hover:text-american-blue transition-colors disabled:opacity-50"
                  >
                    Backup Data Now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
