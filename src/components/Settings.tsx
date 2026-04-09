import React from 'react';
import { motion } from 'motion/react';
import { 
  Save, Globe, Mail, Building2, Phone, MapPin, 
  Webhook, ShieldCheck, Bell, RefreshCw, CheckCircle2,
  ImageIcon
} from 'lucide-react';
import { cn } from '../lib/utils';
import { COMPANY_INFO } from '../constants';

export default function Settings() {
  const [isSaving, setIsSaving] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<'company' | 'integration' | 'notifications'>('company');

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1000);
  };

  const sections = [
    { id: 'company', label: 'Company Profile', icon: Building2 },
    { id: 'integration', label: 'CRM Integration', icon: Webhook },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tighter text-american-blue">Settings</h1>
          <p className="text-[#666666] mt-2">Configure your business profile and external integrations.</p>
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
                    {COMPANY_INFO.logo ? (
                      <img src={COMPANY_INFO.logo} alt="Logo" className="w-full h-full object-contain p-2" referrerPolicy="no-referrer" />
                    ) : (
                      <>
                        <ImageIcon size={24} />
                        <span className="text-[10px] font-bold mt-1">Logo</span>
                      </>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Company Branding</h3>
                    <p className="text-sm text-[#666666]">This logo will appear on all generated PDF invoices.</p>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Company Name</label>
                    <div className="relative">
                      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input type="text" defaultValue={COMPANY_INFO.name} className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Business Email</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input type="email" defaultValue={COMPANY_INFO.email} className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input type="tel" defaultValue={COMPANY_INFO.phone} className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Website</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input type="url" defaultValue={COMPANY_INFO.website} className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none" />
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Business Address</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input type="text" defaultValue={COMPANY_INFO.address} className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none" />
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
                    <h4 className="text-sm font-bold text-blue-900">GoHighLevel Integration</h4>
                    <p className="text-xs text-blue-800 mt-1 leading-relaxed">
                      Connect your FencePro Estimator directly to your GHL account using webhooks. 
                      Every time you generate an estimate, the data will be sent to your CRM automatically.
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">GHL Webhook URL</label>
                    <div className="relative">
                      <Webhook className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="url" 
                        placeholder="https://services.gohighlevel.com/webhook/..."
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm font-mono focus:border-american-blue focus:outline-none" 
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl border border-[#E5E5E5] bg-[#F9F9F9]">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-american-blue shadow-sm">
                        <RefreshCw size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold">Auto-Sync Estimates</p>
                        <p className="text-[10px] text-[#666666]">Automatically send all new estimates to CRM</p>
                      </div>
                    </div>
                    <button className="h-6 w-12 rounded-full bg-american-blue relative transition-all">
                      <div className="absolute right-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm" />
                    </button>
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
