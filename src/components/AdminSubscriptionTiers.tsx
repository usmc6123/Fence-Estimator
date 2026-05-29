import React from 'react';
import { Check, Sparkles, Shield, BadgeCheck, Users, HelpCircle } from 'lucide-react';
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

interface AdminSubscriptionTiersProps {
  users: UserProfile[];
}

export default function AdminSubscriptionTiers({ users }: AdminSubscriptionTiersProps) {
  const totalFree = users.filter(u => u.subscriptionTier !== 'paid').length;
  const totalPaid = users.filter(u => u.subscriptionTier === 'paid').length;

  const freeFeatures = [
    "Run standard fence segment estimates",
    "Access basic materials library",
    "Acknowledge default labor rates",
    "Save up to 3 active quote dossiers"
  ];

  const premiumFeatures = [
    "Unlimited saved estimates and rosters",
    "Full Custom Materials Library access",
    "Integrated Job Scheduler and reminders",
    "Customer-facing interactive Web Estimator",
    "Supplier Quote management & Order PDF forms",
    "Advanced CRM Customer leads & contract generator"
  ];

  return (
    <div className="space-y-8">
      {/* Overview stats header */}
      <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-sm">
        <h3 className="text-sm font-black text-american-blue uppercase tracking-widest mb-4">
          Subscription Enrollment Ratios
        </h3>
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Free Enrollment Card */}
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Free (Standard) Enrolled</span>
              <span className="text-2xl font-black text-american-blue block mt-1">{totalFree} Accounts</span>
            </div>
            <Users size={24} className="text-gray-400" />
          </div>

          {/* Paid Enrollment Card */}
          <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase text-amber-700 tracking-wider">Paid (Premium) Enrolled</span>
              <span className="text-2xl font-black text-amber-600 block mt-1">{totalPaid} Accounts</span>
            </div>
            <Sparkles size={24} className="text-amber-500 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Comparison Grid */}
      <div className="grid gap-8 md:grid-cols-2">
        {/* Free Tier Details Card */}
        <div className="bg-white rounded-2xl border border-[#E5E5E5] p-8 shadow-sm flex flex-col justify-between relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-6">
              <div>
                <span className="text-[10px] font-black text-[#666666] bg-slate-100 uppercase tracking-widest px-2.5 py-1 rounded">
                  Standard Access
                </span>
                <h4 className="text-xl font-black text-american-blue uppercase mt-3">Free Tier</h4>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-american-blue">$0</span>
                <span className="text-xs text-gray-400 block font-mono">/ Month / User</span>
              </div>
            </div>

            <div className="space-y-4">
              <span className="text-xs font-black uppercase tracking-wider text-gray-500 block">Included Features</span>
              <ul className="space-y-2 text-xs text-[#555555]">
                {freeFeatures.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check size={14} className="text-[#999999] mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-gray-100 flex items-center gap-1.5 text-[10px] font-mono text-[#666666]">
            <Users size={12} />
            <span>Active volume share: {users.length > 0 ? Math.round((totalFree / users.length) * 100) : 0}%</span>
          </div>
        </div>

        {/* Paid Premium Tier Details Card */}
        <div className="bg-white rounded-2xl border-2 border-amber-500 p-8 shadow-md flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-amber-500 text-white font-black text-[9px] uppercase tracking-widest px-4 py-1.5 rounded-bl">
            Top Tier Product
          </div>

          <div>
            <div className="flex items-center justify-between border-b border-amber-100 pb-4 mb-6">
              <div>
                <span className="text-[10px] font-black text-amber-800 bg-amber-100 uppercase tracking-widest px-2.5 py-1 rounded border border-amber-200">
                  Full Authority
                </span>
                <h4 className="text-xl font-black text-american-blue uppercase mt-3">Premium Paid</h4>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-amber-600">$50</span>
                <span className="text-xs text-gray-400 block font-mono">/ Month / User</span>
              </div>
            </div>

            <div className="space-y-4">
              <span className="text-xs font-black uppercase tracking-wider text-amber-600 block flex items-center gap-1.5">
                <Sparkles size={13} /> Exclusive Upgrades
              </span>
              <ul className="space-y-2 text-xs text-[#1A1A1A]">
                {premiumFeatures.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <BadgeCheck size={14} className="text-[#D97706] mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-amber-100 flex items-center gap-1.5 text-[10px] font-mono text-amber-700">
            <Sparkles size={12} />
            <span>Active volume share: {users.length > 0 ? Math.round((totalPaid / users.length) * 100) : 0}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
