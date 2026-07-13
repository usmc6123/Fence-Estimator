import React from 'react';
import { LayoutDashboard, Users, CreditCard, Settings, FileText } from 'lucide-react';
import { cn } from '../lib/utils';

interface AdminSidebarProps {
  activeSubTab: string;
  setActiveSubTab: (tab: string) => void;
}

export default function AdminSidebar({ activeSubTab, setActiveSubTab }: AdminSidebarProps) {
  const subTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'tiers', label: 'Subscription Tiers', icon: CreditCard },
    { id: 'catalog', label: 'Material Catalog', icon: FileText },
    { id: 'settings', label: 'Admin Settings', icon: Settings },
    { id: 'activity', label: 'Activity Logs', icon: FileText }
  ];

  return (
    <div id="admin_inner_sidebar" className="w-full bg-white rounded-2xl border border-[#E5E5E5] p-4 shadow-sm md:w-64 shrink-0">
      <div className="mb-4 px-3 py-2 border-b border-gray-100">
        <h3 className="text-xs font-black text-american-blue uppercase tracking-widest">
          Console Navigation
        </h3>
      </div>
      <nav>
        <ul className="space-y-1">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <li key={tab.id}>
                <button
                  onClick={() => setActiveSubTab(tab.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wider transition-all duration-200",
                    isActive 
                      ? "bg-american-blue text-white shadow-md shadow-american-blue/15" 
                      : "text-[#666666] hover:bg-[#F9F9F9] hover:text-american-blue"
                  )}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
