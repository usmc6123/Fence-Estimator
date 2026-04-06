import React from 'react';
import { Hammer, Calculator, Book, Settings, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const navItems = [
    { id: 'estimator', label: 'Estimator', icon: Calculator },
    { id: 'library', label: 'Materials', icon: Book },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#F5F5F5] font-sans text-[#1A1A1A]">
      {/* Sidebar - Desktop */}
      <aside className="fixed left-0 top-0 hidden h-full w-64 border-r border-[#E5E5E5] bg-white lg:block">
        <div className="flex h-20 items-center border-b border-[#E5E5E5] px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1A1A1A] text-white">
              <Hammer size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight">FencePro</span>
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
                      ? "bg-[#1A1A1A] text-white shadow-lg" 
                      : "text-[#666666] hover:bg-[#F0F0F0] hover:text-[#1A1A1A]"
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
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#E5E5E5] flex items-center justify-center text-xs font-bold">
              JD
            </div>
            <div>
              <p className="text-sm font-semibold">John Doe</p>
              <p className="text-xs text-[#666666]">Fence Builder</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Header - Mobile */}
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-[#E5E5E5] bg-white px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1A1A1A] text-white">
            <Hammer size={16} />
          </div>
          <span className="font-bold tracking-tight">FencePro</span>
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
                      activeTab === item.id ? "bg-[#1A1A1A] text-white" : "text-[#666666]"
                    )}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl p-4 md:p-8 lg:p-12">
          {children}
        </div>
      </main>
    </div>
  );
}
