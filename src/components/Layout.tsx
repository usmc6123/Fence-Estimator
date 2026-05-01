import React from 'react';
import { Hammer, Calculator, Book, Settings, Menu, X, FileText, TrendingUp, Shield, Archive, Wallet, LogIn, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { COMPANY_INFO } from '../constants';
import { User } from 'firebase/auth';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: User | null;
  onLogin: () => void;
  onLogout: () => void;
}

export default function Layout({ children, activeTab, setActiveTab, user, onLogin, onLogout }: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const navItems = [
    { id: 'estimator', label: 'Estimator', icon: Calculator },
    { id: 'dossiers', label: 'Saved Dossiers', icon: Archive },
    { id: 'financials', label: 'Financials', icon: Wallet },
    { id: 'takeoff', label: 'Material Take-off', icon: FileText },
    { id: 'labor-breakdown', label: 'Labor Breakdown', icon: Shield },
    { id: 'customer-contract', label: 'Customer Contract', icon: FileText },
    { id: 'quotes', label: 'Supplier Quotes', icon: TrendingUp },
    { id: 'library', label: 'Materials', icon: Book },
    { id: 'labor', label: 'Labor Rates', icon: Hammer },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans text-[#1A1A1A]">
      {/* Sidebar - Desktop */}
      <aside className="fixed left-0 top-0 hidden h-full w-64 border-r border-[#E5E5E5] bg-white lg:block print:hidden">
        <div className="flex h-24 items-center border-b border-[#E5E5E5] px-6">
          <div className="flex items-center gap-3">
            {COMPANY_INFO.logo && (
              <img 
                src={COMPANY_INFO.logo} 
                alt={COMPANY_INFO.name} 
                className="h-12 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="flex flex-col">
              <span className="text-sm font-black uppercase leading-none tracking-tighter text-american-blue">Lone Star</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-american-red">Fence Works</span>
            </div>
          </div>
        </div>
        
        <nav className="p-4">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200",
                    activeTab === item.id 
                      ? "bg-american-blue text-white shadow-lg shadow-american-blue/20" 
                      : "text-[#666666] hover:bg-[#F0F0F0] hover:text-american-blue"
                  )}
                >
                  <item.icon size={18} />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        
        <div className="absolute bottom-0 w-full border-t border-[#E5E5E5] p-6">
          {user ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ''} className="h-10 w-10 rounded-full border-2 border-american-blue/10" referrerPolicy="no-referrer" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-american-blue text-white flex items-center justify-center text-xs font-bold uppercase">
                    {user.displayName?.substring(0, 2) || 'U'}
                  </div>
                )}
                <div className="overflow-hidden">
                  <p className="text-sm font-black text-american-blue truncate">{user.displayName || 'User'}</p>
                  <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest truncate">Fence Pro</p>
                </div>
              </div>
              <button 
                onClick={onLogout}
                className="p-2 text-american-red hover:bg-american-red/5 rounded-lg transition-colors"
                title="Log Out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button 
              onClick={onLogin}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-american-blue py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-american-blue/20 hover:bg-american-blue/90 transition-all"
            >
              <LogIn size={16} />
              Sign In
            </button>
          )}
        </div>
      </aside>

      {/* Header - Mobile */}
      <header className="sticky top-0 z-50 flex h-20 items-center justify-between border-b border-[#E5E5E5] bg-white px-4 lg:hidden print:hidden">
        <div className="flex items-center gap-3">
          {COMPANY_INFO.logo && (
            <img 
              src={COMPANY_INFO.logo} 
              alt={COMPANY_INFO.name} 
              className="h-10 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          )}
          <div className="flex flex-col">
            <span className="text-xs font-black uppercase leading-none tracking-tighter text-american-blue">Lone Star</span>
            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-american-red">Fence Works</span>
          </div>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-[#1A1A1A]"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-x-0 top-16 z-40 border-b border-[#E5E5E5] bg-white p-4 lg:hidden"
          >
            <ul className="space-y-2">
              {navItems.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium",
                      activeTab === item.id ? "bg-american-blue text-white" : "text-[#666666]"
                    )}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-[#E5E5E5] pt-4">
              {user ? (
                <div className="flex items-center justify-between gap-3 px-4">
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName || ''} className="h-10 w-10 rounded-full border-2 border-american-blue/10" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-american-blue text-white flex items-center justify-center text-xs font-bold uppercase">
                        {user.displayName?.substring(0, 2) || 'U'}
                      </div>
                    )}
                    <div className="overflow-hidden">
                      <p className="text-sm font-black text-american-blue truncate">{user.displayName || 'User'}</p>
                      <p className="text-[10px] font-bold text-[#999999] uppercase tracking-widest truncate">Fence Pro</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      onLogout();
                      setIsMobileMenuOpen(false);
                    }}
                    className="p-2 text-american-red hover:bg-american-red/5 rounded-lg transition-colors flex items-center gap-2 text-sm font-bold uppercase tracking-wider"
                  >
                    <LogOut size={16} />
                    Exit
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => {
                    onLogin();
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-american-blue py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-american-blue/20 hover:bg-american-blue/90 transition-all"
                >
                  <LogIn size={16} />
                  Sign In
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="lg:pl-64 print:pl-0">
        <div className="mx-auto max-w-7xl p-4 md:p-8 lg:p-12 print:p-0 print:max-w-none">
          {children}
        </div>
      </main>
    </div>
  );
}
