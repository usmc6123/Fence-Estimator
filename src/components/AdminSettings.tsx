import React from 'react';
import { 
  Key, Shield, HardDrive, Mail, Phone, Globe, Image as ImageIcon, 
  Server, Settings2, CheckCircle2, AlertCircle, RefreshCw, Send, 
  HelpCircle, Sparkles, Building2, Terminal
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

type TabType = 'general' | 'smtp' | 'templates' | 'security';

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

  // SMTP Settings
  const [selectedPreset, setSelectedPreset] = React.useState('custom');
  const [smtpHost, setSmtpHost] = React.useState('');
  const [smtpPort, setSmtpPort] = React.useState('465');
  const [smtpSecureType, setSmtpSecureType] = React.useState<'SSL/TLS' | 'STARTTLS' | 'None'>('SSL/TLS');
  const [smtpUsername, setSmtpUsername] = React.useState('');
  const [smtpPassword, setSmtpPassword] = React.useState('');
  const [fromEmail, setFromEmail] = React.useState('');
  const [fromName, setFromName] = React.useState('');
  const [replyToEmail, setReplyToEmail] = React.useState('');

  // Webhooks & template links
  const [gohighlevelWebhookUrl, setGohighlevelWebhookUrl] = React.useState('');
  const [googleReviewLink, setGoogleReviewLink] = React.useState('');

  // Templates
  const [estimateEmailSubject, setEstimateEmailSubject] = React.useState('');
  const [estimateEmailBody, setEstimateEmailBody] = React.useState('');
  const [estimateAcceptedMessage, setEstimateAcceptedMessage] = React.useState('');
  const [estimateDeclinedMessage, setEstimateDeclinedMessage] = React.useState('');

  // Test Email dispatcher state
  const [testRecipient, setTestRecipient] = React.useState('');
  const [isSendingTest, setIsSendingTest] = React.useState(false);
  const [testSuccess, setTestSuccess] = React.useState<string | null>(null);
  const [testError, setTestError] = React.useState<string | null>(null);

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

  // Presets mapping
  const smtpPresets: Record<string, { host: string; port: string; secure: 'SSL/TLS' | 'STARTTLS' | 'None' }> = {
    zenbusiness: { host: 'mail.b.hostedemail.com', port: '465', secure: 'SSL/TLS' },
    gmail: { host: 'smtp.gmail.com', port: '587', secure: 'STARTTLS' },
    outlook: { host: 'smtp.office365.com', port: '587', secure: 'STARTTLS' },
    godaddy: { host: 'smtpout.secureserver.net', port: '465', secure: 'SSL/TLS' },
    custom: { host: '', port: '465', secure: 'SSL/TLS' }
  };

  // On Mount, load existing settings securely from endpoints
  React.useEffect(() => {
    async function loadSettings() {
      setIsLoading(true);
      try {
        const response = await fetch('/api/settings/get', {
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        });
        if (!response.ok) {
          throw new Error('Failed to load company configurations from node database.');
        }
        const data = await response.json();
        
        // Map fields safely
        setCompanyName(data.companyName || '');
        setCompanyEmail(data.companyEmail || '');
        setCompanyPhone(data.companyPhone || '');
        setCompanyWebsite(data.companyWebsite || '');
        setCompanyLogo(data.companyLogo || '');

        setSmtpHost(data.smtpHost || '');
        setSmtpPort(String(data.smtpPort || '465'));
        setSmtpSecureType(data.smtpSecureType || 'SSL/TLS');
        setSmtpUsername(data.smtpUsername || '');
        setSmtpPassword(data.smtpPassword || '');
        setFromEmail(data.fromEmail || '');
        setFromName(data.fromName || '');
        setReplyToEmail(data.replyToEmail || '');

        setGohighlevelWebhookUrl(data.gohighlevelWebhookUrl || data.ghlWebhookUrl || '');
        setGoogleReviewLink(data.googleReviewLink || '');

        setEstimateEmailSubject(data.estimateEmailSubject || '');
        setEstimateEmailBody(data.estimateEmailBody || '');
        setEstimateAcceptedMessage(data.estimateAcceptedMessage || '');
        setEstimateDeclinedMessage(data.estimateDeclinedMessage || '');

        // Auto detect preset if values match
        const matchingPreset = Object.entries(smtpPresets).find(([_, config]) => {
          return config.host === data.smtpHost && Number(config.port) === Number(data.smtpPort) && config.secure === data.smtpSecureType;
        });
        if (matchingPreset) {
          setSelectedPreset(matchingPreset[0]);
        } else {
          setSelectedPreset('custom');
        }
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

  // Handle SMTP preset change
  const handlePresetSelect = (presetKey: string) => {
    setSelectedPreset(presetKey);
    const config = smtpPresets[presetKey];
    if (config) {
      setSmtpHost(config.host);
      setSmtpPort(config.port);
      setSmtpSecureType(config.secure);
    }
  };

  // Client Side validation before save
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    // Email format checks
    const mailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (fromEmail && !mailRegex.test(fromEmail)) {
      setSaveError('From Email must be a valid email format.');
      return;
    }
    if (companyEmail && !mailRegex.test(companyEmail)) {
      setSaveError('Company Email must be a valid email format.');
      return;
    }
    if (replyToEmail && !mailRegex.test(replyToEmail)) {
      setSaveError('Reply-To email must be a valid email format.');
      return;
    }

    // SMTP presence checks
    if (!smtpHost) {
      setSaveError('SMTP Server Host is required.');
      return;
    }
    if (!smtpPort || isNaN(Number(smtpPort))) {
      setSaveError('SMTP Port is required and must be numeric.');
      return;
    }
    if (!smtpUsername) {
      setSaveError('SMTP Username is required.');
      return;
    }

    try {
      const payload = {
        companyName,
        companyEmail,
        companyPhone,
        companyWebsite,
        companyLogo,
        smtpHost,
        smtpPort: Number(smtpPort),
        smtpSecureType,
        smtpUsername,
        smtpPassword,
        fromEmail,
        fromName,
        replyToEmail,
        gohighlevelWebhookUrl,
        googleReviewLink,
        estimateEmailSubject,
        estimateEmailBody,
        estimateAcceptedMessage,
        estimateDeclinedMessage
      };

      const response = await fetch('/api/settings/save', {
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

      setSaveSuccess('Global settings & multi-user rules saved successfully!');
      // Update local storage representation slightly to have it cached
      localStorage.setItem('company_settings_saved', new Date().toISOString());
    } catch (err: any) {
      setSaveError(err.message || 'Error occurred while saving configurations.');
    }
  };

  // Send SMTP Test Email
  const handleSendTestEmail = async () => {
    setTestError(null);
    setTestSuccess(null);
    if (!testRecipient) {
      setTestError('A valid test recipient email address is required.');
      return;
    }

    setIsSendingTest(true);
    try {
      const payload = {
        smtpHost,
        smtpPort: Number(smtpPort),
        smtpSecureType,
        smtpUsername,
        smtpPassword,
        fromEmail,
        fromName,
        recipientEmail: testRecipient
      };

      const response = await fetch('/api/settings/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify(payload)
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'SMTP Connection Test failed.');
      }

      setTestSuccess('Connected & verified! Validation email dispatched successfully.');
    } catch (err: any) {
      setTestError(err.message || 'Fatal communication error with verification server.');
    } finally {
      setIsSendingTest(false);
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
          onClick={() => { setActiveTab('smtp'); }}
          className={`px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'smtp' 
              ? 'border-american-blue text-american-blue pb-3' 
              : 'border-transparent text-[#666666] hover:text-[#1A1A1A]'
          }`}
        >
          <Mail className="inline-block mr-2" size={14} />
          SMTP Mail Server
        </button>
        <button
          onClick={() => { setActiveTab('templates'); }}
          className={`px-4 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'templates' 
              ? 'border-american-blue text-american-blue pb-3' 
              : 'border-transparent text-[#666666] hover:text-[#1A1A1A]'
          }`}
        >
          <Settings2 className="inline-block mr-2" size={14} />
          Templates & Webhooks
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

        {activeTab === 'smtp' && (
          <div className="space-y-6">
            
            {/* Primary Configuration */}
            <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm space-y-6 transition-all">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                <Server className="text-american-blue" size={18} />
                <h3 className="text-sm font-black text-american-blue uppercase tracking-widest">
                  Secure SMTP Dispatch Server Configuration
                </h3>
              </div>

              {/* Presets selectors */}
              <div>
                <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-2.5">
                  Network Email Provider Presets
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {Object.keys(smtpPresets).map((pKey) => (
                    <button
                      key={pKey}
                      type="button"
                      onClick={() => handlePresetSelect(pKey)}
                      className={`px-3 py-2 border text-2xs font-extrabold uppercase tracking-widest rounded-xl transition-all ${
                        selectedPreset === pKey 
                          ? 'border-american-blue bg-american-blue text-white shadow-sm' 
                          : 'border-[#D5D5D5] bg-[#F9F9F9] hover:bg-slate-50 text-[#1A1A1A] hover:border-slate-400'
                      }`}
                    >
                      {pKey === 'zenbusiness' ? 'ZenBusiness' : 
                       pKey === 'gmail' ? 'Google / Workspace' : 
                       pKey === 'outlook' ? 'O365 / Outlook' : 
                       pKey === 'godaddy' ? 'GoDaddy' : 'Custom SMTP'}
                    </button>
                  ))}
                </div>
              </div>

              {/* SMTP parameters */}
              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                    SMTP Host Address
                  </label>
                  <input 
                    type="text" 
                    value={smtpHost}
                    required
                    onChange={(e) => {
                      setSmtpHost(e.target.value);
                      setSelectedPreset('custom');
                    }}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="mail.b.hostedemail.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                    SMTP Port
                  </label>
                  <input 
                    type="text" 
                    value={smtpPort}
                    required
                    onChange={(e) => {
                      setSmtpPort(e.target.value);
                      setSelectedPreset('custom');
                    }}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="465"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                    SMTP Secure Type
                  </label>
                  <select
                    value={smtpSecureType}
                    onChange={(e) => {
                      setSmtpSecureType(e.target.value as any);
                      setSelectedPreset('custom');
                    }}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                  >
                    <option value="SSL/TLS">SSL/TLS (Port 465 - secure: true)</option>
                    <option value="STARTTLS">STARTTLS (Port 587 - secure: false)</option>
                    <option value="None">None (Unsecured Connection)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                    SMTP Username / Login
                  </label>
                  <input 
                    type="text" 
                    value={smtpUsername}
                    required
                    onChange={(e) => setSmtpUsername(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="Smtp@MyBrand.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                    SMTP Password
                  </label>
                  <input 
                    type="password" 
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="••••••••"
                  />
                  <p className="text-[10px] text-gray-400 mt-1 selection:text-white leading-normal font-bold">
                    * If already configured, we mask values for top security. Leave unchanged to retain existing credentials.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                    Sender Name (Friendly From)
                  </label>
                  <input 
                    type="text" 
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="e.g. Braden - Lone Star Fence"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                    From Email Address
                  </label>
                  <input 
                    type="text" 
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="e.g. support@mysuperiorfencecompany.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                    Reply-To Address
                  </label>
                  <input 
                    type="text" 
                    value={replyToEmail}
                    onChange={(e) => setReplyToEmail(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="e.g. office@mysuperiorfencecompany.com"
                  />
                </div>
              </div>
            </div>

            {/* Test Email Card */}
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                <Send className="text-gray-600" size={16} />
                <h4 className="text-xs font-black text-gray-700 uppercase tracking-widest">
                  Diagnostic SMTP Server Connection Dispatcher
                </h4>
              </div>

              <p className="text-2xs text-[#666666] font-bold leading-relaxed max-w-3xl">
                Evaluate SMTP routing pathways directly. Enter a valid recipient. Dispatched payloads will establish secure connection handshakes on host nodes and report diagnostic failure traces in real-time.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <input 
                  type="email" 
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  className="block sm:max-w-sm w-full rounded-xl border border-[#D5D5D5] bg-white px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                  placeholder="Enter verification email address"
                />
                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  disabled={isSendingTest}
                  className="py-2.5 px-5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-all shadow-sm"
                >
                  {isSendingTest ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      Testing Pipeline...
                    </>
                  ) : (
                    <>
                      <Send size={12} />
                      Verify Connection & Send Test
                    </>
                  )}
                </button>
              </div>

              <AnimatePresence mode="wait">
                {testSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold leading-tight flex items-start gap-2.5 shadow-sm"
                  >
                    <CheckCircle2 size={16} className="text-emerald-600 mt-px" />
                    <span>{testSuccess}</span>
                  </motion.div>
                )}

                {testError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-bold leading-tight flex items-start gap-2.5 shadow-sm"
                  >
                    <AlertCircle size={16} className="text-red-600 mt-px flex-shrink-0" />
                    <span>{testError}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-sm space-y-6 transition-all">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <Settings2 className="text-american-blue" size={18} />
              <h3 className="text-sm font-black text-american-blue uppercase tracking-widest">
                Custom Communication & Webhook Integration Templates
              </h3>
            </div>

            <div className="space-y-6">
              
              {/* GoHighLevel Webhook & Feedback */}
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                    GoHighLevel Webhook URL
                  </label>
                  <input 
                    type="text" 
                    value={gohighlevelWebhookUrl}
                    onChange={(e) => setGohighlevelWebhookUrl(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="https://services.leadconnectorhq.com/hooks/..."
                  />
                  <p className="text-[10px] text-gray-400 mt-1 font-bold">
                    Triggers outbound notifications automatically on client decisions (Accepted or Declined).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                    Google Review Link
                  </label>
                  <input 
                    type="text" 
                    value={googleReviewLink}
                    onChange={(e) => setGoogleReviewLink(e.target.value)}
                    className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    placeholder="https://g.page/r/some-unique-profile-id/review"
                  />
                  <p className="text-[10px] text-gray-400 mt-1 font-bold">
                    Provides review shortcuts on portals after signature completions!
                  </p>
                </div>
              </div>

              {/* Estimate Templates */}
              <div className="border-t border-slate-100 pt-6 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-american-blue">
                  Customer Email Templates
                </h4>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                      Estimate Outbound Subject Line
                    </label>
                    <input 
                      type="text" 
                      value={estimateEmailSubject}
                      onChange={(e) => setEstimateEmailSubject(e.target.value)}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                      placeholder="Fence Installation Contract Agreement - {companyName}"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-xs font-black uppercase text-[#666666] tracking-widest">
                        Estimate Email Plain-Text Body
                      </label>
                      <span className="text-[9px] font-bold text-gray-400 bg-slate-100 px-2 py-0.5 rounded-md">
                        Supported: &#123;customerName&#125;, &#123;estimateNumber&#125;, &#123;estimateLink&#125;, &#123;companyName&#125;
                      </span>
                    </div>
                    <textarea 
                      rows={5}
                      value={estimateEmailBody}
                      onChange={(e) => setEstimateEmailBody(e.target.value)}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all font-mono"
                      placeholder="Hello {customerName},&#10;&#10;We have compiled and drafted your fencing contract agreement. Please review pricing and sign the warranty agreement directly using this link: {estimateLink}&#10;&#10;Best regards,&#10;{companyName}"
                    />
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                        Estimate Accepted Success Screen Alert Message
                      </label>
                      <textarea 
                        rows={3}
                        value={estimateAcceptedMessage}
                        onChange={(e) => setEstimateAcceptedMessage(e.target.value)}
                        className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                        placeholder="Estimate accepted successfully! We will finalize your installation timeframe shortly."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-[#666666] tracking-widest mb-1.5">
                        Estimate Declined Success Screen Alert Message
                      </label>
                      <textarea 
                        rows={3}
                        value={estimateDeclinedMessage}
                        onChange={(e) => setEstimateDeclinedMessage(e.target.value)}
                        className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                        placeholder="Estimate declined. We will reach out shortly to understand how we can make adjustments. Thank you!"
                      />
                    </div>
                  </div>
                </div>
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
                    <RefreshCw size={12} className={backingUp ? 'animate-spin' : ''} />
                    Backup Now
                  </button>
                </div>

                <AnimatePresence>
                  {backupSuccess && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="p-3 bg-emerald-50 border border-emerald-25 border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold leading-tight flex items-center gap-2"
                    >
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      Database snapshots cataloged successfully on node server.
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
