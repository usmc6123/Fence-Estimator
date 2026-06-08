import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Save, Globe, Mail, Building2, Phone, MapPin, 
  Webhook, ShieldCheck, Bell, RefreshCw, CheckCircle2,
  ImageIcon, Server, Settings2, Send, AlertCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { COMPANY_INFO } from '../constants';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface SettingsProps {
  user?: any;
  adminToken?: string | null;
}

export default function Settings({ user, adminToken }: SettingsProps) {
  const [isSaving, setIsSaving] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [activeSection, setActiveSection] = React.useState<'company' | 'integration' | 'smtp' | 'templates' | 'notifications'>('company');
  
  const [formData, setFormData] = React.useState({
    companyName: COMPANY_INFO.name,
    businessEmail: COMPANY_INFO.email,
    phoneNumber: COMPANY_INFO.phone,
    website: COMPANY_INFO.website,
    address: COMPANY_INFO.address,
    companyLogo: COMPANY_INFO.logo || '',
    ghlWebhookUrl: '',
    autoSyncEstimates: true,
    
    // SMTP Configurations
    smtpHost: '',
    smtpPort: '465',
    smtpSecureType: 'SSL/TLS' as 'SSL/TLS' | 'STARTTLS' | 'None',
    smtpUsername: '',
    smtpPassword: '',
    fromEmail: '',
    fromName: '',
    replyToEmail: '',
    googleReviewLink: '',

    // Outbound templates
    estimateEmailSubject: '',
    estimateEmailBody: '',
    estimateAcceptedMessage: '',
    estimateDeclinedMessage: ''
  });

  const [selectedPreset, setSelectedPreset] = React.useState('custom');

  // Test Email dispatcher state
  const [testRecipient, setTestRecipient] = React.useState('');
  const [isSendingTest, setIsSendingTest] = React.useState(false);
  const [testSuccess, setTestSuccess] = React.useState<string | null>(null);
  const [testError, setTestError] = React.useState<string | null>(null);

  const smtpPresets: Record<string, { host: string; port: string; secure: 'SSL/TLS' | 'STARTTLS' | 'None' }> = {
    zenbusiness: { host: 'mail.b.hostedemail.com', port: '465', secure: 'SSL/TLS' },
    gmail: { host: 'smtp.gmail.com', port: '587', secure: 'STARTTLS' },
    outlook: { host: 'smtp.office365.com', port: '587', secure: 'STARTTLS' },
    godaddy: { host: 'smtpout.secureserver.net', port: '465', secure: 'SSL/TLS' },
    custom: { host: '', port: '465', secure: 'SSL/TLS' }
  };

  // Load settings on mount
  React.useEffect(() => {
    async function loadSettings() {
      setIsLoading(true);
      try {
        let firebaseData: any = {};
        let apiData: any = {};

        // 1. Try to load from direct client Firestore companySettings/main
        try {
          const settingsDoc = await getDoc(doc(db, 'companySettings', 'main'));
          if (settingsDoc.exists()) {
            firebaseData = settingsDoc.data();
          }
        } catch (error) {
          console.warn("Could not load from Firestore companySettings/main:", error);
        }

        // 2. Try to load secure SMTP & Templates from API
        const token = adminToken || localStorage.getItem('company_admin_token');
        if (token) {
          try {
            const response = await fetch('/api/settings/get', {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
              apiData = await response.json();
            }
          } catch (apiErr) {
            console.warn("Failed to load settings via API:", apiErr);
          }
        }

        // Merge loaded profiles securely
        const merged = {
          ...formData,
          ...firebaseData,
          ...apiData,
          companyName: apiData.companyName || firebaseData.companyName || COMPANY_INFO.name,
          businessEmail: apiData.companyEmail || apiData.businessEmail || firebaseData.businessEmail || firebaseData.companyEmail || COMPANY_INFO.email,
          phoneNumber: apiData.companyPhone || apiData.phoneNumber || firebaseData.phoneNumber || firebaseData.companyPhone || COMPANY_INFO.phone,
          website: apiData.companyWebsite || apiData.website || firebaseData.website || firebaseData.companyWebsite || COMPANY_INFO.website,
          address: apiData.address || firebaseData.address || COMPANY_INFO.address,
          companyLogo: apiData.companyLogo || firebaseData.companyLogo || COMPANY_INFO.logo || '',
          ghlWebhookUrl: apiData.gohighlevelWebhookUrl || apiData.ghlWebhookUrl || firebaseData.ghlWebhookUrl || firebaseData.gohighlevelWebhookUrl || '',
          smtpPort: String(apiData.smtpPort || firebaseData.smtpPort || '465'),
        };

        setFormData(merged);

        // Auto detect preset if standard smtp settings are populated
        const hostVal = merged.smtpHost || '';
        const portVal = String(merged.smtpPort || '465');
        const secureVal = merged.smtpSecureType || 'SSL/TLS';
        
        const matchingPreset = Object.entries(smtpPresets).find(([_, config]) => {
          return config.host === hostVal && Number(config.port) === Number(portVal) && config.secure === secureVal;
        });
        if (matchingPreset) {
          setSelectedPreset(matchingPreset[0]);
        } else {
          setSelectedPreset('custom');
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [adminToken]);

  // Handle SMTP preset change
  const handlePresetSelect = (presetKey: string) => {
    setSelectedPreset(presetKey);
    const config = smtpPresets[presetKey];
    if (config) {
      setFormData(prev => ({
        ...prev,
        smtpHost: config.host,
        smtpPort: config.port,
        smtpSecureType: config.secure
      }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      // 1. Client-side database update to companySettings/main for direct frontend configurations
      const clientPayload = {
        companyName: formData.companyName,
        businessEmail: formData.businessEmail,
        phoneNumber: formData.phoneNumber,
        website: formData.website,
        address: formData.address,
        companyLogo: formData.companyLogo,
        ghlWebhookUrl: formData.ghlWebhookUrl,
        gohighlevelWebhookUrl: formData.ghlWebhookUrl,
        googleReviewLink: formData.googleReviewLink,
        autoSyncEstimates: formData.autoSyncEstimates,
        
        // Include templates inside main doc so embed widgets can pull acceptance screens
        estimateEmailSubject: formData.estimateEmailSubject,
        estimateEmailBody: formData.estimateEmailBody,
        estimateAcceptedMessage: formData.estimateAcceptedMessage,
        estimateDeclinedMessage: formData.estimateDeclinedMessage,
        
        updatedAt: new Date().toISOString()
      };
      
      try {
        await setDoc(doc(db, 'companySettings', 'main'), clientPayload, { merge: true });
      } catch (clientErr) {
        console.error("Error saving directly to firestore:", clientErr);
      }

      // 2. API Backend Secure save to establish validated node server environment
      const token = adminToken || localStorage.getItem('company_admin_token');
      if (token) {
        const apiPayload = {
          companyName: formData.companyName,
          companyEmail: formData.businessEmail,
          companyPhone: formData.phoneNumber,
          companyWebsite: formData.website,
          companyLogo: formData.companyLogo,
          
          smtpHost: formData.smtpHost,
          smtpPort: Number(formData.smtpPort),
          smtpSecureType: formData.smtpSecureType,
          smtpUsername: formData.smtpUsername,
          smtpPassword: formData.smtpPassword,
          fromEmail: formData.fromEmail,
          fromName: formData.fromName,
          replyToEmail: formData.replyToEmail,
          
          gohighlevelWebhookUrl: formData.ghlWebhookUrl,
          googleReviewLink: formData.googleReviewLink,
          estimateEmailSubject: formData.estimateEmailSubject,
          estimateEmailBody: formData.estimateEmailBody,
          estimateAcceptedMessage: formData.estimateAcceptedMessage,
          estimateDeclinedMessage: formData.estimateDeclinedMessage
        };

        const response = await fetch('/api/settings/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(apiPayload)
        });

        const resData = await response.json();
        if (!response.ok) {
          throw new Error(resData.error || 'Failed to save settings to secure server.');
        }
      }

      setShowSuccess(true);
      setSaveSuccess('Global settings & SMTP communication profiles saved successfully!');
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error saving settings:", error);
      setSaveError(error.message || "Failed to save settings. Please verify details and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // SMTP Test pipeline dispatcher
  const handleSendTestEmail = async () => {
    setTestError(null);
    setTestSuccess(null);
    if (!testRecipient) {
      setTestError('A valid test recipient email address is required.');
      return;
    }

    setIsSendingTest(true);
    try {
      const token = adminToken || localStorage.getItem('company_admin_token');
      if (!token) {
        throw new Error('Authentication is required to run secure SMTP connection diagnostic tests.');
      }

      const payload = {
        smtpHost: formData.smtpHost,
        smtpPort: Number(formData.smtpPort),
        smtpSecureType: formData.smtpSecureType,
        smtpUsername: formData.smtpUsername,
        smtpPassword: formData.smtpPassword,
        fromEmail: formData.fromEmail,
        fromName: formData.fromName,
        recipientEmail: testRecipient
      };

      const response = await fetch('/api/settings/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'SMTP Connection Test failed.');
      }

      setTestSuccess('Connected & verified! Validation test email dispatched successfully.');
    } catch (err: any) {
      setTestError(err.message || 'Fatal communications error with SMTP validation server.');
    } finally {
      setIsSendingTest(false);
    }
  };

  const sections = [
    { id: 'company', label: 'Company Profile', icon: Building2 },
    { id: 'integration', label: 'CRM & Integrations', icon: Webhook },
    { id: 'smtp', label: 'SMTP Mail Server', icon: Mail },
    { id: 'templates', label: 'Email Templates', icon: Settings2 },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <RefreshCw className="animate-spin text-american-blue" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tighter text-american-blue font-sans">Settings</h1>
          <p className="text-[#666666] mt-2">Configure your business profile, SMTP servers, and external CRM integrations.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 rounded-xl bg-american-blue px-6 py-3 text-sm font-bold text-white hover:bg-american-blue/90 transition-all shadow-lg active:scale-95 disabled:opacity-50"
        >
          {isSaving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
          Save Changes
        </button>
      </div>

      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-sm">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {saveError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs font-bold flex items-start gap-2 shadow-sm">
          <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Sidebar Nav */}
        <div className="lg:col-span-3 space-y-2">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id as any)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                activeSection === s.id ? "bg-american-blue text-white shadow-md" : "text-[#666666] hover:bg-white hover:shadow-sm hover:text-american-blue"
              )}
            >
              <s.icon size={18} />
              {s.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="lg:col-span-9">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-8 border border-[#E5E5E5] shadow-sm space-y-8"
          >
            {activeSection === 'company' && (
              <div className="space-y-8">
                <div className="flex items-center gap-6">
                  <div className="h-24 w-24 rounded-3xl bg-white border-2 border-american-blue/20 flex flex-col items-center justify-center text-[#999999] cursor-pointer hover:border-american-blue transition-all overflow-hidden shadow-sm">
                    {formData.companyLogo || COMPANY_INFO.logo ? (
                      <img src={formData.companyLogo || COMPANY_INFO.logo} alt="Logo" className="w-full h-full object-contain p-2" referrerPolicy="no-referrer" />
                    ) : (
                      <>
                        <ImageIcon size={24} />
                        <span className="text-[10px] font-bold mt-1">Logo</span>
                      </>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Company Branding</h3>
                    <p className="text-sm text-[#666666]">This logo will appear on customer signature portals and estimate contracts.</p>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Company Name</label>
                    <div className="relative">
                      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="text" 
                        value={formData.companyName} 
                        onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Business Email</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="email" 
                        value={formData.businessEmail} 
                        onChange={(e) => setFormData({...formData, businessEmail: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="tel" 
                        value={formData.phoneNumber} 
                        onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Website</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="url" 
                        value={formData.website} 
                        onChange={(e) => setFormData({...formData, website: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Company Logo URL</label>
                    <div className="relative">
                      <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="text" 
                        placeholder="https://mysite.com/logo.png"
                        value={formData.companyLogo} 
                        onChange={(e) => setFormData({...formData, companyLogo: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm font-sans focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Business Address</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="text" 
                        value={formData.address} 
                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'integration' && (
              <div className="space-y-8">
                <div className="p-6 rounded-2xl bg-blue-50 border border-blue-100 flex gap-4">
                  <ShieldCheck className="text-blue-600 shrink-0" size={24} />
                  <div>
                    <h4 className="text-sm font-bold text-blue-900">CRM & Leads Workspace Links</h4>
                    <p className="text-xs text-blue-800 mt-1 leading-relaxed">
                      Sync fencing leads and active estimators securely to other nodes in your sales workflows.
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">GoHighLevel webhook URL</label>
                    <div className="relative">
                      <Webhook className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="url" 
                        placeholder="https://services.gohighlevel.com/webhook/..."
                        value={formData.ghlWebhookUrl}
                        onChange={(e) => setFormData({...formData, ghlWebhookUrl: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm font-mono focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Google Review shortcut Link</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="url" 
                        placeholder="https://g.page/r/your-id/review"
                        value={formData.googleReviewLink}
                        onChange={(e) => setFormData({...formData, googleReviewLink: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                    </div>
                    <p className="text-[10px] text-[#888] font-bold">Appends direct feedback requests on customer signature portal accepted pages.</p>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl border border-[#E5E5E5] bg-[#F9F9F9]">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-american-blue shadow-sm">
                        <RefreshCw size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold">Auto-Sync Estimates</p>
                        <p className="text-[10px] text-[#666666]">Automatically dispatch decision hooks upon customer signatures.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setFormData({...formData, autoSyncEstimates: !formData.autoSyncEstimates})}
                      className={cn(
                        "h-6 w-12 rounded-full relative transition-all",
                        formData.autoSyncEstimates ? "bg-american-blue" : "bg-gray-300"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                        formData.autoSyncEstimates ? "right-1" : "left-1"
                      )} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'smtp' && (
              <div className="space-y-8">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <Server className="text-american-blue" size={18} />
                  <h3 className="text-sm font-bold text-american-blue uppercase tracking-widest">
                    SMTP Mail Server Configuration
                  </h3>
                </div>

                {/* Presets selectors */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase text-[#666666] tracking-widest">
                    Email Network Presets
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    {Object.keys(smtpPresets).map((pKey) => (
                      <button
                        key={pKey}
                        type="button"
                        onClick={() => handlePresetSelect(pKey)}
                        className={`px-3 py-2 border text-[10px] font-extrabold uppercase tracking-wider rounded-xl transition-all ${
                          selectedPreset === pKey 
                            ? 'border-american-blue bg-american-blue text-white shadow-sm' 
                            : 'border-[#D5D5D5] bg-[#F9F9F9] hover:bg-slate-50 text-[#1A1A1A] hover:border-slate-400'
                        }`}
                      >
                        {pKey === 'zenbusiness' ? 'ZenBusiness' : 
                         pKey === 'gmail' ? 'Google Workspace' : 
                         pKey === 'outlook' ? 'Outlook' : 
                         pKey === 'godaddy' ? 'GoDaddy' : 'Custom'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Parameters inputs */}
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">SMTP Host Address</label>
                    <input 
                      type="text" 
                      value={formData.smtpHost}
                      onChange={(e) => {
                        setFormData({...formData, smtpHost: e.target.value});
                        setSelectedPreset('custom');
                      }}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                      placeholder="smtp.example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">SMTP Port</label>
                    <input 
                      type="text" 
                      value={formData.smtpPort}
                      onChange={(e) => {
                        setFormData({...formData, smtpPort: e.target.value});
                        setSelectedPreset('custom');
                      }}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                      placeholder="465"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Secure Type</label>
                    <select
                      value={formData.smtpSecureType}
                      onChange={(e) => {
                        setFormData({...formData, smtpSecureType: e.target.value as any});
                        setSelectedPreset('custom');
                      }}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                    >
                      <option value="SSL/TLS">SSL/TLS (Port 465)</option>
                      <option value="STARTTLS">STARTTLS (Port 587)</option>
                      <option value="None">None (Unsecured)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">SMTP Username</label>
                    <input 
                      type="text" 
                      value={formData.smtpUsername}
                      onChange={(e) => setFormData({...formData, smtpUsername: e.target.value})}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                      placeholder="sender@brand.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">SMTP Password</label>
                    <input 
                      type="password" 
                      value={formData.smtpPassword}
                      onChange={(e) => setFormData({...formData, smtpPassword: e.target.value})}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Friendly Sender Name</label>
                    <input 
                      type="text" 
                      value={formData.fromName}
                      onChange={(e) => setFormData({...formData, fromName: e.target.value})}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                      placeholder="Lone Star Fence Estimator"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">From Email Address</label>
                    <input 
                      type="text" 
                      value={formData.fromEmail}
                      onChange={(e) => setFormData({...formData, fromEmail: e.target.value})}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                      placeholder="office@yourcompany.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Reply-To Address</label>
                    <input 
                      type="text" 
                      value={formData.replyToEmail}
                      onChange={(e) => setFormData({...formData, replyToEmail: e.target.value})}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                      placeholder="office@yourcompany.com"
                    />
                  </div>
                </div>

                {/* Connection verification checker */}
                <div className="p-6 bg-[#FAF9F6] rounded-2xl border border-[#EBEAE4] space-y-4">
                  <div className="flex items-center gap-2 pb-1 boundary">
                    <Send size={15} />
                    <span className="text-xs font-bold uppercase text-[#666] tracking-wider">SMTP Diagnostic Verification Channel</span>
                  </div>
                  <p className="text-2xs text-[#777] font-bold">Dispatch test handshakes to verify host parameters and receive direct diagnostic stack response traces upon errors.</p>
                  
                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    <input 
                      type="email"
                      value={testRecipient}
                      onChange={(e) => setTestRecipient(e.target.value)}
                      className="w-full sm:max-w-xs rounded-xl border border-[#D5D5D5] bg-white px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue transition-all"
                      placeholder="Enter verification email address"
                    />
                    <button
                      type="button"
                      onClick={handleSendTestEmail}
                      disabled={isSendingTest}
                      className="py-2.5 px-5 bg-[#333] hover:bg-[#222] disabled:opacity-50 text-white rounded-xl text-xs font-semibold uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                    >
                      {isSendingTest ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" />
                          Testing Host...
                        </>
                      ) : (
                        <>
                          <Send size={12} />
                          Send Connection Test
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
                        className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-start gap-2 shadow-sm"
                      >
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-px" />
                        <span>{testSuccess}</span>
                      </motion.div>
                    )}

                    {testError && (
                      <motion.div 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-bold flex items-start gap-2 shadow-sm"
                      >
                        <AlertCircle size={16} className="text-red-600 shrink-0 mt-px" />
                        <span>{testError}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {activeSection === 'templates' && (
              <div className="space-y-8">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <Settings2 className="text-american-blue" size={18} />
                  <h3 className="text-sm font-bold text-american-blue uppercase tracking-widest">
                    Customer Email Subject & Message Templates
                  </h3>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Estimate email Subject</label>
                    <input 
                      type="text"
                      value={formData.estimateEmailSubject}
                      onChange={(e) => setFormData({...formData, estimateEmailSubject: e.target.value})}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all font-sans"
                      placeholder="Fence Installation Contract Agreement - {companyName}"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Estimate Email Body Message</label>
                      <span className="text-[9px] font-bold text-gray-400 bg-slate-100 px-2 py-0.5 rounded-md">
                        Supports: &#123;customerName&#125;, &#123;estimateNumber&#125;, &#123;estimateLink&#125;, &#123;companyName&#125;
                      </span>
                    </div>
                    <textarea 
                      rows={6}
                      value={formData.estimateEmailBody}
                      onChange={(e) => setFormData({...formData, estimateEmailBody: e.target.value})}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all font-mono"
                      placeholder="Hello {customerName},&#10;&#10;We have compiled and drafted your fencing contract agreement. Please review pricing and sign the warranty agreement directly using this link: {estimateLink}&#10;&#10;Best regards,&#10;{companyName}"
                    />
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Accepted screen Success message</label>
                      <textarea 
                        rows={3}
                        value={formData.estimateAcceptedMessage}
                        onChange={(e) => setFormData({...formData, estimateAcceptedMessage: e.target.value})}
                        className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                        placeholder="Estimate accepted successfully! We will finalize your installation timeframe shortly."
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Declined screen feedback message</label>
                      <textarea 
                        rows={3}
                        value={formData.estimateDeclinedMessage}
                        onChange={(e) => setFormData({...formData, estimateDeclinedMessage: e.target.value})}
                        className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                        placeholder="Estimate declined. We will reach out shortly to verify how we can accommodate your requests. Thank you!"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'notifications' && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-20 w-20 rounded-full bg-[#F5F5F5] flex items-center justify-center text-[#999999] mb-4">
                  <Bell size={32} />
                </div>
                <h3 className="text-xl font-bold text-[#1A1A1A]">Notification Settings</h3>
                <p className="text-[#666666] mt-2">Configure how you receive alerts and reports.</p>
                <button className="mt-6 px-6 py-2 rounded-xl border border-[#E5E5E5] text-xs font-bold uppercase tracking-wider hover:border-[#1A1A1A] transition-all">
                  Coming Soon
                </button>
              </div>
            )}

            {/* Danger Zone */}
            <div className="pt-8 mt-8 border-t border-red-100 space-y-4">
              <h3 className="text-sm font-black text-american-red uppercase tracking-widest">Danger Zone</h3>
              <div className="p-6 rounded-2xl bg-red-50 border border-red-100 flex flex-col sm:flex-row items-center justify-between gap-6">
                <div>
                  <h4 className="text-sm font-bold text-red-900 line-clamp-1">Reset Application Data</h4>
                  <p className="text-xs text-red-700 mt-1">This will permanently delete all custom materials, quotes, and saved estimates from this device.</p>
                </div>
                <button 
                  onClick={() => {
                    if (confirm('Are you absolutely sure? This cannot be undone.')) {
                      localStorage.clear();
                      window.location.reload();
                    }
                  }}
                  className="shrink-0 px-6 py-3 bg-white border-2 border-red-200 text-red-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-600 hover:text-white hover:border-red-600 transition-all shadow-sm"
                >
                  Clear All Data
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {showSuccess && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-8 right-8 bg-american-blue text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-50"
        >
          <CheckCircle2 className="text-[#00FF00]" size={20} />
          <span className="font-bold">Settings saved successfully!</span>
        </motion.div>
      )}
    </div>
  );
}
