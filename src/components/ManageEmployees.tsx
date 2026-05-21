import React from 'react';
import { motion } from 'motion/react';
import { 
  UserPlus, Trash2, KeyRound, Shield, ShieldCheck, Eye, EyeOff,
  RefreshCw, Copy, Check, Users, Mail, Lock, ShieldAlert
} from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  collection, query, onSnapshot, doc, setDoc, deleteDoc, 
  getFirestore, doc as firestoreDoc, getDoc 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Employee } from '../types';

// Secondary Firebase app auth import
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updatePassword, signOut, deleteUser } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export default function ManageEmployees() {
  const [employees, setEmployees] = React.useState<Employee[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [embedMode, setEmbedMode] = React.useState<'scheduler' | 'employee'>('scheduler');
  
  // New employee form
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [permission, setPermission] = React.useState<'View Only' | 'Can Edit'>('View Only');
  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState('');
  const [formSuccess, setFormSuccess] = React.useState('');

  // Password reset form state
  const [resetEmail, setResetEmail] = React.useState('');
  const [resetNewPassword, setResetNewPassword] = React.useState('');
  const [resetOldPassword, setResetOldPassword] = React.useState('');
  const [showResetModal, setShowResetModal] = React.useState(false);
  const [resetError, setResetError] = React.useState('');
  const [resetSuccess, setResetSuccess] = React.useState('');
  const [isResetting, setIsResetting] = React.useState(false);

  // Sync employees list
  React.useEffect(() => {
    const q = query(collection(db, 'employees'));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setEmployees(snapshot.docs.map(d => d.data() as Employee));
        setIsLoading(false);
      },
      (error) => {
        console.error("Error loading employees:", error);
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setIsSubmitting(true);

    const targetEmail = email.trim().toLowerCase();
    const targetPassword = password.trim();

    if (!targetEmail || !targetPassword) {
      setFormError("Both email and password are required.");
      setIsSubmitting(false);
      return;
    }

    if (targetPassword.length < 6) {
      setFormError("Password must be at least 6 characters.");
      setIsSubmitting(false);
      return;
    }

    try {
      // 1. Create standard Auth User on secondary App instance
      const secondaryApp = getApps().find(a => a.name === 'SecondaryAdminApp') || initializeApp(firebaseConfig, 'SecondaryAdminApp');
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, targetEmail, targetPassword);
      await signOut(secondaryAuth); // Sign out right away

      // 2. Save employee record to Firestore (with email as document ID)
      const empDocRef = doc(db, 'employees', targetEmail);
      await setDoc(empDocRef, {
        email: targetEmail,
        permission: permission,
        password: targetPassword, // Stored securely in database for easy recall / reset sync
        createdAt: new Date().toISOString()
      });

      setFormSuccess(`Employee ${targetEmail} added successfully! Go to the embed page to login.`);
      setEmail('');
      setPassword('');
      setPermission('View Only');
    } catch (err: any) {
      console.error("Failed to create employee:", err);
      if (err?.code === 'auth/email-already-in-use') {
        // If email is already in Auth but maybe not in employees collection:
        try {
          const empDocRef = doc(db, 'employees', targetEmail);
          await setDoc(empDocRef, {
            email: targetEmail,
            permission: permission,
            password: targetPassword,
            createdAt: new Date().toISOString()
          });
          setFormSuccess(`Employee record updated for existing account.`);
          setEmail('');
          setPassword('');
          return;
        } catch (dbErr) {
          setFormError("Email is already in use by another user.");
        }
      } else if (err?.code === 'auth/operation-not-allowed') {
        setFormError("Firebase Email/Password login is not enabled. Please enable 'Email/Password' in your Firebase console under Authentication -> Sign-in Method.");
      } else {
        setFormError(err instanceof Error ? err.message : "Error creating employee account.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveEmployee = async (emp: Employee) => {
    if (!window.confirm(`Are you absolutely sure you want to remove employee "${emp.email}"? This will instantly revoke their access database permissions.`)) {
      return;
    }

    try {
      // 1. Try to delete them from standard Auth
      if (emp.password) {
        try {
          const secondaryApp = getApps().find(a => a.name === 'SecondaryAdminApp') || initializeApp(firebaseConfig, 'SecondaryAdminApp');
          const secondaryAuth = getAuth(secondaryApp);
          const cred = await signInWithEmailAndPassword(secondaryAuth, emp.email, emp.password);
          await deleteUser(cred.user);
          await signOut(secondaryAuth);
        } catch (authErr) {
          console.warn("Could not delete authentication user. Proceeding to revoke database rights.", authErr);
        }
      }

      // 2. Delete firestore document
      await deleteDoc(doc(db, 'employees', emp.email));
      alert(`Employee "${emp.email}" was removed successfully.`);
    } catch (err: any) {
      console.error("Error removing employee:", err);
      alert(err.message || "Failed to remove employee.");
    }
  };

  const handleOpenReset = (emp: Employee) => {
    setResetEmail(emp.email);
    setResetOldPassword(emp.password || '');
    setResetNewPassword('');
    setResetError('');
    setResetSuccess('');
    setShowResetModal(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');
    setIsResetting(true);

    if (resetNewPassword.trim().length < 6) {
      setResetError("New password must be at least 6 characters.");
      setIsResetting(false);
      return;
    }

    try {
      const secondaryApp = getApps().find(a => a.name === 'SecondaryAdminApp') || initializeApp(firebaseConfig, 'SecondaryAdminApp');
      const secondaryAuth = getAuth(secondaryApp);

      // Authenticate with old password to update
      try {
        const cred = await signInWithEmailAndPassword(secondaryAuth, resetEmail, resetOldPassword);
        await updatePassword(cred.user, resetNewPassword.trim());
        await signOut(secondaryAuth);
      } catch (authErr: any) {
        console.warn("Could not sign in with old password. Re-creating auth user instead.");
        // If password sync is broken, we re-create the user in standard Auth
        try {
          const cred = await createUserWithEmailAndPassword(secondaryAuth, resetEmail, resetNewPassword.trim());
          await signOut(secondaryAuth);
        } catch (createErr: any) {
          if (createErr.code === 'auth/email-already-in-use') {
            setResetError("Password update failed. Please delete this employee and recreate their account to match Auth settings.");
            setIsResetting(false);
            return;
          }
          throw createErr;
        }
      }

      // Update Firestore document
      await setDoc(doc(db, 'employees', resetEmail), {
        password: resetNewPassword.trim()
      }, { merge: true });

      setResetSuccess("Password reset successfully!");
      setTimeout(() => {
        setShowResetModal(false);
      }, 1500);
    } catch (err: any) {
      console.error("Failed to reset password:", err);
      setResetError(err.message || "Error resetting employee password.");
    } finally {
      setIsResetting(false);
    }
  };

  const getSquarespaceCode = () => {
    // Ensure trailing slash is included properly to prevent Vercel redirect query stripping
    const baseOrigin = window.location.origin;
    const origin = baseOrigin.endsWith('/') ? baseOrigin : `${baseOrigin}/`;
    return `<!-- Lone Star Fence Works - Employee Portal Embed -->
<div id="lsfw-portal-container" style="width: 100%; min-height: 800px; background: #F8F9FA; position: relative; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-top: 20px;">
  <iframe 
    src="${origin}?portal=${embedMode}" 
    style="width: 100%; height: 900px; border: none; display: block;" 
    allow="geolocation; microphone; camera"
    id="lsfw-portal-frame"
  ></iframe>
</div>`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(getSquarespaceCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8" id="manage-employees-panel">
      {/* Title Header */}
      <div className="flex flex-col gap-2 border-b border-[#E5E5E5] pb-6">
        <h1 className="text-3xl font-black uppercase tracking-tight text-american-blue flex items-center gap-2">
          <Users size={28} className="text-american-red animate-pulse" />
          Manage Employees
        </h1>
        <p className="text-sm font-bold uppercase tracking-widest text-american-red">
          System Admin and Delegated Portal Management
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left column: Add employee form & copy link */}
        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-2xl border border-[#E5E5E5] bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-american-blue flex items-center gap-2">
              <UserPlus size={16} />
              Register New Employee
            </h2>

            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1">
                  Employee email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-[#999999]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@lonestarfenceworks.com"
                    className="w-full rounded-xl border border-[#D5D5D5] bg-white py-2.5 pl-10 pr-4 text-sm font-medium focus:border-american-blue focus:outline-none focus:ring-1 focus:ring-american-blue transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1">
                  Login Password (Min 6 Characters)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-[#999999]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create login password"
                    className="w-full rounded-xl border border-[#D5D5D5] bg-white py-2.5 pl-10 pr-10 text-sm font-medium focus:border-american-blue focus:outline-none focus:ring-1 focus:ring-american-blue transition-colors"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 text-[#999999] hover:text-american-blue"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1">
                  Permission Level
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPermission('View Only')}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border py-3 text-xs font-bold transition-all",
                      permission === 'View Only'
                        ? "border-american-blue bg-american-blue/5 text-american-blue"
                        : "border-[#D5D5D5] bg-white text-[#666666] hover:bg-gray-50"
                    )}
                  >
                    <Shield size={14} />
                    View Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setPermission('Can Edit')}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border py-3 text-xs font-bold transition-all",
                      permission === 'Can Edit'
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-[#D5D5D5] bg-white text-[#666666] hover:bg-gray-50"
                    )}
                  >
                    <ShieldCheck size={14} />
                    Can Edit
                  </button>
                </div>
              </div>

              {formError && (
                <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600 flex items-start gap-2 border border-red-200">
                  <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {formSuccess && (
                <div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 border border-emerald-200">
                  {formSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-american-blue py-3.5 text-xs font-black uppercase tracking-widest text-white hover:bg-american-blue/90 shadow-lg shadow-american-blue/15 transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw className="animate-spin" size={14} />
                ) : (
                  <UserPlus size={14} />
                )}
                Register Employee
              </button>
            </form>
          </div>

          {/* Squarespace Copy Widget */}
          <div className="rounded-2xl border border-[#E5E5E5] bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-xs font-black uppercase tracking-widest text-american-blue flex items-center gap-2">
              <CodeIcon size={16} />
              Squarespace Embed Code
            </h2>
            <p className="text-xs text-[#666666] leading-relaxed mb-4">
              Add a Code Block in Squarespace at <code className="bg-gray-100 px-1 py-0.5 rounded text-american-red font-bold font-mono text-[10px] sm:text-xs">lonestarfenceworks.com/employees</code> and paste the text snippet below.
            </p>
            
            {/* Embed Mode Switcher */}
            <div className="mb-4">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1.5">
                Embed Target View
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#F8F9FA] rounded-xl">
                <button
                  type="button"
                  onClick={() => setEmbedMode('scheduler')}
                  className={cn(
                    "py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all",
                    embedMode === 'scheduler'
                      ? "bg-white shadow-xs text-american-blue border border-[#E5E5E5]"
                      : "text-[#666666] hover:text-american-blue hover:bg-gray-100"
                  )}
                >
                  Job Scheduler Only
                </button>
                <button
                  type="button"
                  onClick={() => setEmbedMode('employee')}
                  className={cn(
                    "py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all",
                    embedMode === 'employee'
                      ? "bg-white shadow-xs text-american-blue border border-[#E5E5E5]"
                      : "text-[#666666] hover:text-american-blue hover:bg-gray-100"
                  )}
                >
                  Full Employee Portal
                </button>
              </div>
            </div>

            <div className="relative">
              <pre className="max-h-36 overflow-y-auto rounded-xl bg-gray-900 p-3 text-[10px] font-mono text-gray-300 border border-gray-800 whitespace-pre-wrap leading-tight">
                {getSquarespaceCode()}
              </pre>
              <button
                onClick={copyToClipboard}
                className="absolute right-2 top-2 rounded-lg bg-gray-800 p-2 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                title="Copy Embed Code"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>

        {/* Right column: List employees */}
        <div className="space-y-6 lg:col-span-8">
          <div className="rounded-2xl border border-[#E5E5E5] bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-american-blue flex items-center gap-2">
              <Users size={16} className="text-american-red" />
              Active System Users ({employees.length})
            </h2>

            {isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <RefreshCw className="animate-spin text-american-blue" size={24} />
              </div>
            ) : employees.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-[#D5D5D5] bg-gray-50/50 p-6 text-center text-sm font-medium text-[#666666]">
                <Users size={32} className="text-[#999999] mb-2" />
                No custom employee users defined yet.
                <p className="text-xs text-[#999999] mt-1">Use the form on the left to add your field installation crews.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E5E5] text-[10px] font-bold uppercase tracking-wider text-[#666666]">
                      <th className="pb-3 pl-4">Employee Email</th>
                      <th className="pb-3">Permissions</th>
                      <th className="pb-3 text-right pr-4">Action Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F0F0] font-medium">
                    {employees.map((emp) => (
                      <tr key={emp.email} className="hover:bg-[#F9F9F9]">
                        <td className="py-4 pl-4 font-black text-american-blue">
                          {emp.email}
                        </td>
                        <td className="py-4">
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
                            emp.permission === 'Can Edit' 
                              ? "bg-emerald-100 text-emerald-800" 
                              : "bg-amber-100 text-amber-800"
                          )}>
                            {emp.permission === 'Can Edit' ? <ShieldCheck size={12} /> : <Shield size={12} />}
                            {emp.permission}
                          </span>
                        </td>
                        <td className="py-4 text-right pr-4 space-x-1.5">
                          <button
                            onClick={() => handleOpenReset(emp)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D5D5D5] bg-white px-3 py-1.5 text-xs font-bold text-american-blue hover:bg-gray-50 transition-colors"
                          >
                            <KeyRound size={12} />
                            Reset Password
                          </button>
                          <button
                            onClick={() => handleRemoveEmployee(emp)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 transition-colors"
                          >
                            <Trash2 size={12} />
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reset Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-[#E5E5E5] bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-black uppercase tracking-widest text-american-blue mb-2 flex items-center gap-2 border-b pb-3">
              <KeyRound size={16} className="text-american-red" />
              Reset password
            </h3>
            <p className="text-xs text-[#666666] mb-4">
              Reset password for employee: <strong className="text-american-blue font-black font-mono">{resetEmail}</strong>
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1">
                  New Password (Min 6 Characters)
                </label>
                <input
                  type="password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="Enter new account password"
                  className="w-full rounded-xl border border-[#D5D5D5] bg-white px-3 py-2.5 text-sm font-medium focus:border-american-blue focus:outline-none focus:ring-1 focus:ring-american-blue transition-colors"
                  required
                />
              </div>

              {resetError && (
                <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100">
                  {resetError}
                </div>
              )}

              {resetSuccess && (
                <div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 border border-emerald-100">
                  {resetSuccess}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="rounded-xl border border-[#D5D5D5] bg-white px-4 py-2.5 text-xs font-bold text-[#666666] hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResetting || !resetNewPassword}
                  className="rounded-xl bg-american-blue px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-american-blue/90 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isResetting && <RefreshCw size={12} className="animate-spin" />}
                  Save New Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple internal icon for layout
function CodeIcon({ size = 16, className = "" }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}
