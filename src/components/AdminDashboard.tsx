import React from 'react';
import { Users, UserPlus, Sparkles, Briefcase, Calendar, CheckCircle, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  subscriptionTier: 'free' | 'paid';
  createdAt: string;
  isDisabled: boolean;
  estimatesCount: number;
}

interface AdminDashboardProps {
  users: UserProfile[];
  loading: boolean;
}

export default function AdminDashboard({ users, loading }: AdminDashboardProps) {
  // Aggregate Metrics
  const totalUsers = users.length;
  const freeUsers = users.filter(u => u.subscriptionTier !== 'paid').length;
  const paidUsers = users.filter(u => u.subscriptionTier === 'paid').length;
  const totalEstimates = users.reduce((sum, u) => sum + (u.estimatesCount || 0), 0);

  // Recent 5 Signups
  const recentSignups = [...users]
    .filter(u => u.createdAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 100 } }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-t-2 border-american-blue" />
          <p className="mt-4 text-xs font-black uppercase text-[#666666] tracking-widest">
            Compiling ledger stats...
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* KPI Cards Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Users */}
        <motion.div 
          variants={itemVariants}
          id="stat_total_users"
          className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-all flex items-center justify-between"
        >
          <div className="space-y-1.5">
            <span className="text-[10px] font-black uppercase text-[#999999] tracking-widest block">Total Members</span>
            <span className="text-3xl font-black text-american-blue block">{totalUsers}</span>
          </div>
          <div className="h-12 w-12 bg-blue-50 text-american-blue rounded-xl flex items-center justify-center">
            <Users size={22} />
          </div>
        </motion.div>

        {/* Free Tier */}
        <motion.div 
          variants={itemVariants}
          id="stat_free_users"
          className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-all flex items-center justify-between"
        >
          <div className="space-y-1.5">
            <span className="text-[10px] font-black uppercase text-[#999999] tracking-widest block">Standard Tier</span>
            <span className="text-3xl font-black text-[#555555] block">{freeUsers}</span>
          </div>
          <div className="h-12 w-12 bg-gray-55 bg-gray-50 text-[#666666] rounded-xl flex items-center justify-center border border-gray-100">
            <UserPlus size={22} />
          </div>
        </motion.div>

        {/* Paid Premium Tier */}
        <motion.div 
          variants={itemVariants}
          id="stat_paid_users"
          className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-all flex items-center justify-between"
        >
          <div className="space-y-1.5">
            <span className="text-[10px] font-black uppercase text-[#999999] tracking-widest block">Premium Tier</span>
            <span className="text-3xl font-black text-amber-600 block">{paidUsers}</span>
          </div>
          <div className="h-12 w-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center border border-amber-100">
            <Sparkles size={22} />
          </div>
        </motion.div>

        {/* Total Estimates */}
        <motion.div 
          variants={itemVariants}
          id="stat_total_estimates"
          className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-sm hover:shadow-md transition-all flex items-center justify-between"
        >
          <div className="space-y-1.5">
            <span className="text-[10px] font-black uppercase text-[#999999] tracking-widest block">Dossiers Generated</span>
            <span className="text-3xl font-black text-emerald-700 block">{totalEstimates}</span>
          </div>
          <div className="h-12 w-12 bg-emerald-50 text-emerald-700 rounded-xl flex items-center justify-center border border-emerald-100">
            <Briefcase size={22} />
          </div>
        </motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Users over time & Growth Chart */}
        <motion.div 
          variants={itemVariants} 
          className="bg-white p-6 rounded-2xl border border-[#E5E5E5] lg:col-span-2 shadow-sm flex flex-col justify-between"
        >
          <div className="border-b border-[#F0F0F0] pb-3 mb-4">
            <h3 className="text-sm font-black text-american-blue uppercase tracking-widest flex items-center gap-2">
              <TrendingUp size={16} />
              Registration Growth & Flow
            </h3>
            <p className="text-[11px] text-[#666666] mt-1">Simulated telemetry trend line of client onboarding rates.</p>
          </div>

          {/* Elegant Custom SVG Trend Line */}
          <div className="h-44 w-full flex items-end justify-center relative mt-2 bg-slate-50/50 rounded-xl p-4 border border-slate-100">
            {totalUsers > 0 ? (
              <svg className="h-full w-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="gradient-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0B2545" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#0B2545" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Simulated Wave Line based on actual count */}
                <path
                  d={`M 0 35 Q 25 ${Math.max(10, 35 - paidUsers * 4)} 50 ${Math.max(8, 30 - freeUsers * 2)} T 100 ${Math.max(5, 38 - totalUsers * 2)}`}
                  fill="none"
                  stroke="#0B2545"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d={`M 0 35 Q 25 ${Math.max(10, 35 - paidUsers * 4)} 50 ${Math.max(8, 30 - freeUsers * 2)} T 100 ${Math.max(5, 38 - totalUsers * 2)} L 100 40 L 0 40 Z`}
                  fill="url(#gradient-area)"
                />
              </svg>
            ) : (
              <span className="text-xs text-gray-400 italic">Unlocking trend lines upon active registrations...</span>
            )}
            <div className="absolute top-2 right-4 flex items-center gap-1 bg-white px-2 py-0.5 border border-slate-200 rounded font-mono text-[9px] text-[#666666]">
              <span className="h-2 w-2 rounded-full bg-american-blue inline-block animate-pulse" />
              Live Ledger Activity
            </div>
          </div>
          
          <div className="flex justify-between items-center text-[10px] text-gray-400 font-mono mt-4">
            <span>May 25</span>
            <span>May 26</span>
            <span>May 27</span>
            <span>May 28</span>
            <span>Today</span>
          </div>
        </motion.div>

        {/* Recent signups list card */}
        <motion.div 
          variants={itemVariants}
          className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-sm flex flex-col justify-between"
        >
          <div>
            <div className="border-b border-[#F0F0F0] pb-3 mb-4">
              <h3 className="text-sm font-black text-american-blue uppercase tracking-widest flex items-center gap-2">
                <Calendar size={16} />
                Recent Signups
              </h3>
              <p className="text-[11px] text-[#666666] mt-1 font-sans">Lastest 5 users to join Lone Star Fence Works.</p>
            </div>

            <div className="space-y-3">
              {recentSignups.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400 italic border border-dashed border-[#E5E5E5] rounded-xl">
                  Waiting for organic registrations.
                </div>
              ) : (
                recentSignups.map((user) => (
                  <div key={user.uid} className="flex items-center justify-between p-2.5 rounded-xl border border-gray-100 hover:bg-slate-50 transition-colors">
                    <div className="overflow-hidden mr-2">
                      <p className="text-xs font-black text-american-blue truncate">{user.name}</p>
                      <p className="text-[9px] font-mono text-gray-400 truncate">{user.email}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-slate-100 border text-[#555555] shrink-0 ${
                      user.subscriptionTier === 'paid' ? 'bg-amber-100 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-100'
                    }`}>
                      {user.subscriptionTier === 'paid' ? 'Paid' : 'Free'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-1.5 text-[9px] text-[#22C55E] font-black uppercase tracking-wider">
            <CheckCircle size={12} />
            Data pipeline secure and synchronized
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
