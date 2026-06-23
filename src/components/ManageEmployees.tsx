import React from 'react';
import { motion } from 'motion/react';
import { 
  UserPlus, Trash2, KeyRound, Shield, ShieldCheck, Eye, EyeOff,
  RefreshCw, Copy, Check, Users, Mail, Lock, ShieldAlert, Edit3, Phone
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
  const [activeSettings, setActiveSettings] = React.useState<any>(null);
  
  // New employee form state
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [permission, setPermission] = React.useState<'View Only' | 'Can Edit'>('View Only');
  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState('');
  const [formSuccess, setFormSuccess] = React.useState('');

  // Additional Contact Management details
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [role, setRole] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [canReceiveCrewDispatch, setCanReceiveCrewDispatch] = React.useState(true);
  const [isPrimaryCrewContact, setIsPrimaryCrewContact] = React.useState(false);

  // Edit employee state
  const [editingEmployee, setEditingEmployee] = React.useState<Employee | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editPhone, setEditPhone] = React.useState('');
  const [editRole, setEditRole] = React.useState('');
  const [editIsActive, setEditIsActive] = React.useState(true);
  const [editCanReceiveCrewDispatch, setEditCanReceiveCrewDispatch] = React.useState(true);
  const [editIsPrimaryCrewContact, setEditIsPrimaryCrewContact] = React.useState(false);
  const [editPermission, setEditPermission] = React.useState<'View Only' | 'Can Edit'>('View Only');

  // Password reset form state
  const [resetEmail, setResetEmail] = React.useState('');
  const [resetNewPassword, setResetNewPassword] = React.useState('');
  const [resetOldPassword, setResetOldPassword] = React.useState('');
  const [showResetModal, setShowResetModal] = React.useState(false);
  const [resetError, setResetError] = React.useState('');
  const [resetSuccess, setResetSuccess] = React.useState('');
  const [isResetting, setIsResetting] = React.useState(false);

  // Fetch employees list via API
  const [lastReadError, setLastReadError] = React.useState<string | null>(null);

  const fetchEmployees = async () => {
    setIsLoading(true);
    setLastReadError(null);
    try {
      const adminToken = localStorage.getItem('company_admin_token') || '';
      const response = await fetch('/api/admin/users?type=employees', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'X-Admin-Token': adminToken
        }
      });
      if (!response.ok) {
        throw new Error(`Server returned error ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setEmployees(data);
    } catch (err: any) {
      console.error("Error loading employees via API:", err);
      setLastReadError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Sync employees list & company settings
  React.useEffect(() => {
    fetchEmployees();

    // Grab company settings to check if automated dispatch is enabled in real-time
    const unsubscribeSettings = onSnapshot(doc(db, 'companySettings', 'main'),
      (snap) => {
        if (snap.exists()) {
          setActiveSettings(snap.data());
        }
      },
      (err) => {
        console.warn("Failed to subscribe to companySettings:", err);
      }
    );

    return () => {
      unsubscribeSettings();
    };
  }, []);

  // Requirement: Add a development mode check
  const IS_DEV = process.env.NODE_ENV !== 'production' || true; // Force true for now as requested
  const [devLogs, setDevLogs] = React.useState<string[]>([]);

  const deleteTestEmployee = async (email: string) => {
    if (!window.confirm("WARNING: Deleting test employee from Auth and Firestore. This is irreversible.")) return;
    try {
        const secondaryApp = getApps().find(a => a.name === 'SecondaryAdminApp') || initializeApp(firebaseConfig, 'SecondaryAdminApp');
        const secondaryAuth = getAuth(secondaryApp);
        
        // This is a test, assuming we have credentials, but for now we might fail auth unless already logged in. 
        // This functionality needs admin-sdk or proper handling. 
        // For now, focus on Firestore delete as per instructions to not touch auth systems if complex.
        
        await deleteDoc(doc(db, 'employees', email));
        await fetchEmployees();
        setFormSuccess("Test employee Firestore document deleted.");
        setTimeout(() => setFormSuccess(""), 1500);
    } catch (err: any) {
        setLastReadError("Delete failed: " + err.message);
    }
  };

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
      const adminToken = localStorage.getItem('company_admin_token') || '';

      const payload = {
        action: 'create-employee',
        email: targetEmail,
        password: targetPassword,
        name: name.trim(),
        phone: phone.trim(),
        role: role.trim(),
        permission: permission, // 'View Only' | 'Can Edit'
        permissionLevel: permission,
        active: isActive,
        isActive: isActive,
        canReceiveCrewDispatch: canReceiveCrewDispatch,
        canReceiveCrewDispatchEmails: canReceiveCrewDispatch,
        isPrimaryCrewContact: isPrimaryCrewContact,
        primaryCrewContact: isPrimaryCrewContact
      };

      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
          'X-Admin-Token': adminToken
        },
        body: JSON.stringify(payload)
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || 'Failed to create employee profile.');
      }

      // Requirement: Immediately after creating an employee, perform a verification read
      const docRefEmp = firestoreDoc(db, 'employees', targetEmail);
      const snapshot = await getDoc(docRefEmp);
      
      if (!snapshot.exists()) {
          throw new Error("Employee profile verification failed after creation.");
      }

      // Requirement: Reset every input field
      setFormSuccess(`Employee ${targetEmail} added successfully!`);
      setEmail('');
      setPassword('');
      setPermission('View Only');
      setName('');
      setPhone('');
      setRole('');
      setIsActive(true);
      setCanReceiveCrewDispatch(true);
      setIsPrimaryCrewContact(false);

      await fetchEmployees();
    } catch (err: any) {
      console.error("Failed to create employee:", err);
      setFormError(err.message || "Error creating employee account.");
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

      // 2. Delete firestore document via API
      const adminToken = localStorage.getItem('company_admin_token') || '';
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
          'X-Admin-Token': adminToken
        },
        body: JSON.stringify({
          action: "delete-employee",
          email: emp.email
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Server error deleting employee: ${response.status}`);
      }

      await fetchEmployees();
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

  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setEditName(emp.name || '');
    setEditPhone(emp.phone || '');
    setEditRole(emp.role || '');
    setEditIsActive(emp.isActive !== false);
    setEditCanReceiveCrewDispatch(emp.canReceiveCrewDispatch !== false);
    setEditIsPrimaryCrewContact(!!emp.isPrimaryCrewContact);
    setEditPermission(emp.permission);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    try {
      const targetEmail = editingEmployee.email;
      const adminToken = localStorage.getItem('company_admin_token') || '';

      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
          'X-Admin-Token': adminToken
        },
        body: JSON.stringify({
          action: "update-employee",
          email: targetEmail,
          name: editName,
          phone: editPhone,
          role: editRole,
          isActive: editIsActive,
          canReceiveCrewDispatch: editCanReceiveCrewDispatch,
          isPrimaryCrewContact: editIsPrimaryCrewContact,
          permission: editPermission
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Server error updating employee: ${response.status}`);
      }

      await fetchEmployees();
      alert(`Employee details updated successfully for "${targetEmail}".`);
      setEditingEmployee(null);
    } catch (err: any) {
      console.error("Failed to edit employee details:", err);
      alert(err.message || "Error updating employee details.");
    }
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

      // Update Firestore document via API
      const adminToken = localStorage.getItem('company_admin_token') || '';
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
          'X-Admin-Token': adminToken
        },
        body: JSON.stringify({
          action: "reset-employee-password",
          email: resetEmail,
          newPassword: resetNewPassword.trim()
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Server error resetting employee password: ${response.status}`);
      }

      await fetchEmployees();
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

  // Warning variables and validations (Requirement 7)
  const primaryContact = employees.find(emp => emp.isPrimaryCrewContact === true);
  const isDispatchEnabled = activeSettings?.sendCrewEmailAfterGhlInstallBooking === true;
  const isEmailValid = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const isPrimaryEmailInvalid = primaryContact && !isEmailValid(primaryContact.email);

  return (
    <div className="space-y-8" id="manage-employees-panel">
      {/* Title Header */}
      <div className="flex flex-col gap-2 border-b border-[#E5E5E5] pb-6">
        <h1 className="text-3xl font-black uppercase tracking-tight text-american-blue flex items-center gap-2">
          <Users size={28} className="text-american-red" />
          Manage Employees & Crews
        </h1>
        <p className="text-sm font-bold uppercase tracking-widest text-american-red">
          System Admin and Crew Dispatch Management
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left column: Add employee form & copy link */}
        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-2xl border border-[#E5E5E5] bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-american-blue flex items-center gap-2 border-b pb-2">
              <UserPlus size={16} />
              Register New Employee / Crew
            </h2>

            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1">
                  Employee/Crew Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Braden Stephens"
                  className="w-full rounded-xl border border-[#D5D5D5] bg-white py-2.5 px-4 text-sm font-medium focus:border-american-blue focus:outline-none focus:ring-1 focus:ring-american-blue transition-colors"
                />
              </div>

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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. (512) 555-0199"
                    className="w-full rounded-xl border border-[#D5D5D5] bg-white py-2.5 px-4 text-sm font-medium focus:border-american-blue focus:outline-none focus:ring-1 focus:ring-american-blue transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1">
                    Role / Title
                  </label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="e.g. Lead Installer"
                    className="w-full rounded-xl border border-[#D5D5D5] bg-white py-2.5 px-4 text-sm font-medium focus:border-american-blue focus:outline-none focus:ring-1 focus:ring-american-blue transition-colors"
                  />
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

              {/* Toggles and checkboxes */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-[#D5D5D5] text-american-blue focus:ring-american-blue h-4 w-4"
                  />
                  <div className="text-xs">
                    <span className="block font-bold text-gray-800">Active State</span>
                    <span className="block text-[10px] text-gray-500 font-medium">Allow login and active assignment portals</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={canReceiveCrewDispatch}
                    onChange={(e) => setCanReceiveCrewDispatch(e.target.checked)}
                    className="rounded border-[#D5D5D5] text-american-blue focus:ring-american-blue h-4 w-4"
                  />
                  <div className="text-xs">
                    <span className="block font-bold text-gray-800">Can Receive Dispatch Emails</span>
                    <span className="block text-[10px] text-gray-500 font-medium">Enable in manual labor dropdown choices</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPrimaryCrewContact}
                    onChange={(e) => setIsPrimaryCrewContact(e.target.checked)}
                    className="rounded border-[#D5D5D5] text-american-blue focus:ring-american-blue h-4 w-4"
                  />
                  <div className="text-xs">
                    <span className="block font-bold text-gray-800">Primary Crew Contact</span>
                    <span className="block text-[10px] text-gray-500 font-medium">Default target for automated Scheduler dispatches</span>
                  </div>
                </label>
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
                      ? "bg-white shadow-sm text-american-blue border border-[#E5E5E5]"
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
                      ? "bg-white shadow-sm text-american-blue border border-[#E5E5E5]"
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
            
            <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-american-blue flex items-center justify-between gap-2 border-b pb-2">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-american-red" />
                Active System Users ({employees.length})
              </div>
              <button onClick={fetchEmployees} className="text-[10px] font-bold text-american-blue bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 italic">Refresh List</button>
            </h2>

            {/* Validation warning banners (Requirement 7) */}
            <div className="space-y-3 mb-5">
              {isDispatchEnabled && !primaryContact && (
                <div id="warn-dispatch-no-primary" className="rounded-xl bg-amber-50 p-4 border border-amber-200 text-xs font-semibold text-amber-800 flex items-start gap-2.5">
                  <span className="text-base shrink-0">🚨</span>
                  <div>
                    <h5 className="font-extrabold uppercase tracking-wider text-amber-900 mb-0.5">Automated Crew Dispatch Warning</h5>
                    <p className="leading-relaxed">Automated Crew Dispatch is <strong>ENABLED</strong> in Settings, but no <strong>Primary Crew Contact</strong> is configured. Standard system notifications will fall back to the admin email address.</p>
                  </div>
                </div>
              )}

              {!primaryContact && !isDispatchEnabled && (
                <div id="warn-no-primary-designated" className="rounded-xl bg-orange-50/70 p-4 border border-orange-200/80 text-xs font-semibold text-orange-800 flex items-start gap-2.5">
                  <span className="text-base shrink-0">⚠️</span>
                  <div>
                    <h5 className="font-extrabold uppercase tracking-wider text-orange-900 mb-0.5">Primary Contact Missing</h5>
                    <p className="leading-relaxed">No <strong>Primary Crew Contact</strong> is designated for this company. Automatic field installation updates cannot be routed to a default crew representative.</p>
                  </div>
                </div>
              )}

              {primaryContact && isPrimaryEmailInvalid && (
                <div id="warn-primary-email-invalid" className="rounded-xl bg-red-50 p-4 border border-red-200 text-xs font-semibold text-red-800 flex items-start gap-2.5">
                  <span className="text-base shrink-0">⚠️</span>
                  <div>
                    <h5 className="font-extrabold uppercase tracking-wider text-red-900 mb-0.5">Invalid Contact Email</h5>
                    <p className="leading-relaxed">The designated Primary Crew Contact does not have a valid email address (<strong>{primaryContact.email}</strong>). Please update their email domain settings immediately.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Clear Primary Contact display (Requirement 6) */}
            {primaryContact ? (
              <div className="mb-6 rounded-2xl border-2 border-emerald-500/20 bg-emerald-50/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
                    ★ Primary Automated Crew Contact
                  </span>
                  <h3 className="text-base font-black text-american-blue uppercase tracking-tight">
                    {primaryContact.name || 'Unnamed Crew'}
                  </h3>
                  <div className="text-xs text-slate-600 font-medium space-y-0.5">
                    <p>📧 Email: <strong>{primaryContact.email}</strong></p>
                    {primaryContact.phone && <p>📱 Phone: <strong>{primaryContact.phone}</strong></p>}
                    {primaryContact.role && <p>💼 Role: <strong>{primaryContact.role}</strong></p>}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span className={cn(
                    "text-xs font-bold px-2.5 py-1 rounded-full",
                    primaryContact.isActive !== false ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                  )}>
                    {primaryContact.isActive !== false ? "Active" : "Inactive"}
                  </span>
                  <button
                    onClick={() => handleOpenEdit(primaryContact)}
                    className="rounded-lg border border-[#D5D5D5] bg-white hover:bg-slate-50 text-american font-bold py-1.5 px-3 text-xs flex items-center gap-1.5 text-american-blue transition-colors"
                  >
                    Edit Details
                  </button>
                </div>
              </div>
            ) : (
              <div className="mb-6 rounded-2xl border border-dashed border-red-200 bg-red-50/5 p-5 text-center">
                <p className="text-xs font-bold text-red-700">★ No Primary Crew Contact is currently designated.</p>
                <p className="text-[11px] text-[#666666] mt-1">Designate a crew/employee as primary to automate installation scheduling updates.</p>
              </div>
            )}

            {isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <RefreshCw className="animate-spin text-american-blue" size={24} />
              </div>
            ) : employees.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-[#D5D5D5] bg-gray-50/50 p-6 text-center text-sm font-medium text-[#666666]">
                <Users size={32} className="text-[#999999] mb-2" />
                No custom employees or crew contacts defined yet.
                <p className="text-xs text-[#999999] mt-1">Use the form on the left to add your field installation crews.</p>
              </div>
            ) : (
              <div className="">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E5E5] text-[10px] font-bold uppercase tracking-wider text-[#666666]">
                      <th className="pb-3 pl-4">Name & Contact</th>
                      <th className="pb-3">Permissions</th>
                      <th className="pb-3">Dispatch</th>
                      <th className="pb-3 text-right pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F0F0] font-medium">
                    {employees.map((emp) => (
                      <tr key={emp.email} className={cn("hover:bg-[#F9F9F9]", emp.isPrimaryCrewContact && "bg-[#F0FDF4]/30")}>
                        <td className="py-4 pl-4 font-black">
                          <span className="block text-american-blue font-black max-w-xs truncate">
                            {emp.name || emp.email.split('@')[0]}
                          </span>
                          <span className="block text-xs text-[#666666] font-mono">
                            {emp.email}
                          </span>
                          {emp.phone && (
                            <span className="block text-xs text-[#999999] font-medium flex items-center gap-1 mt-0.5">
                              <Phone size={10} /> {emp.phone}
                            </span>
                          )}
                        </td>
                        <td className="py-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span className={cn(
                              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide",
                              emp.permission === 'Can Edit' 
                                ? "bg-emerald-100 text-emerald-800" 
                                : "bg-amber-100 text-amber-800"
                            )}>
                              {emp.permission === 'Can Edit' ? <ShieldCheck size={11} /> : <Shield size={11} />}
                              {emp.permission}
                            </span>
                            <span className={cn(
                              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide",
                              emp.isActive !== false ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-800"
                            )}>
                              {emp.isActive !== false ? "Active state" : "Inactive state"}
                            </span>
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="flex flex-col gap-1 items-start">
                            {emp.isPrimaryCrewContact ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest animate-pulse border border-emerald-300">
                                ★ Primary Crew Contact
                              </span>
                            ) : null}
                            <span className={cn(
                              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide",
                              emp.canReceiveCrewDispatch !== false ? "bg-teal-100 text-teal-800" : "bg-gray-100 text-gray-800"
                            )}>
                              {emp.canReceiveCrewDispatch !== false ? "Receives Dispatch" : "No Dispatch"}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 text-right pr-4 space-x-1">
                          <button
                            onClick={() => handleOpenEdit(emp)}
                            title="Edit Details"
                            className="inline-flex items-center justify-center rounded-lg border border-[#D5D5D5] bg-white p-1.5 text-american-blue hover:bg-gray-50 transition-colors"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => handleOpenReset(emp)}
                            title="Code"
                            className="inline-flex items-center justify-center rounded-lg border border-[#D5D5D5] bg-white p-1.5 text-american-blue hover:bg-gray-50 transition-colors"
                          >
                            <KeyRound size={12} />
                          </button>
                          <button
                            onClick={() => handleRemoveEmployee(emp)}
                            title="Delete"
                            className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-700 hover:bg-red-100 transition-colors"
                          >
                            <Trash2 size={12} />
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

      {/* Edit Details Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-[#E5E5E5] bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <h3 className="text-sm font-black uppercase tracking-widest text-american-blue mb-2 flex items-center gap-2 border-b pb-3">
              <Users size={16} className="text-american-red" />
              Edit Employee Details
            </h3>
            <p className="text-xs text-[#666666] mb-4">
              Updating details for: <strong className="text-american-blue font-black font-mono">{editingEmployee.email}</strong>
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1">
                  Employee/Crew Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Braden Stephens"
                  className="w-full rounded-xl border border-[#D5D5D5] bg-white py-2.5 px-4 text-sm font-medium focus:border-american-blue focus:outline-none focus:ring-1 focus:ring-american-blue transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="e.g. (512) 555-0199"
                    className="w-full rounded-xl border border-[#D5D5D5] bg-white py-2.5 px-4 text-sm font-medium focus:border-american-blue focus:outline-none focus:ring-1 focus:ring-american-blue transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1">
                    Role / Title
                  </label>
                  <input
                    type="text"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    placeholder="e.g. Lead Installer"
                    className="w-full rounded-xl border border-[#D5D5D5] bg-white py-2.5 px-4 text-sm font-medium focus:border-american-blue focus:outline-none focus:ring-1 focus:ring-american-blue transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1">
                  Permission Level
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditPermission('View Only')}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-bold transition-all",
                      editPermission === 'View Only'
                        ? "border-american-blue bg-american-blue/5 text-american-blue"
                        : "border-[#D5D5D5] bg-white text-[#666666] hover:bg-gray-50"
                    )}
                  >
                    <Shield size={14} />
                    View Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPermission('Can Edit')}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-bold transition-all",
                      editPermission === 'Can Edit'
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-[#D5D5D5] bg-white text-[#666666] hover:bg-gray-50"
                    )}
                  >
                    <ShieldCheck size={14} />
                    Can Edit
                  </button>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-2 border-t mt-4">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="rounded border-[#D5D5D5] text-american-blue focus:ring-american-blue h-4 w-4"
                  />
                  <div className="text-xs">
                    <span className="block font-bold text-gray-800">Active State</span>
                    <span className="block text-[10px] text-gray-500 font-medium font-medium">Allow login and active assignment portals</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editCanReceiveCrewDispatch}
                    onChange={(e) => setEditCanReceiveCrewDispatch(e.target.checked)}
                    className="rounded border-[#D5D5D5] text-american-blue focus:ring-american-blue h-4 w-4"
                  />
                  <div className="text-xs">
                    <span className="block font-bold text-gray-800">Can Receive Dispatch Emails</span>
                    <span className="block text-[10px] text-gray-500 font-medium">Enable in manual labor dropdown choices</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsPrimaryCrewContact}
                    onChange={(e) => setEditIsPrimaryCrewContact(e.target.checked)}
                    className="rounded border-[#D5D5D5] text-american-blue focus:ring-american-blue h-4 w-4"
                  />
                  <div className="text-xs">
                    <span className="block font-bold text-gray-800">Primary Crew Contact</span>
                    <span className="block text-[10px] text-gray-500 font-medium">Default target for automated Scheduler dispatches</span>
                  </div>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t mt-4">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="rounded-xl border border-[#D5D5D5] bg-white px-4 py-2.5 text-xs font-bold text-[#666666] hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-american-blue px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white hover:bg-american-blue/90 transition-all shadow-md shadow-american-blue/10"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

      {/* Development Debug Section */}
      {IS_DEV && (
        <div className="mt-8 rounded-xl bg-gray-900 text-white p-4 font-mono text-xs shadow-xl">
          <h4 className="font-bold border-b border-gray-700 pb-2 mb-2">Development Debug Section</h4>
          <p>Firestore Collection: employees</p>
          <p>Number of Documents: {employees.length}</p>
          <p>Last Read Error: {lastReadError || 'None'}</p>
          <p>Last Document ID: {employees.length > 0 ? employees[employees.length - 1].email : 'N/A'}</p>
          
          <div className="flex gap-2 mt-4">
             <button onClick={fetchEmployees} className="bg-gray-700 p-2 rounded hover:bg-gray-600">Refresh Employees</button>
             <button className="bg-red-900 p-2 rounded hover:bg-red-800" onClick={() => deleteTestEmployee(employees.length > 0 ? employees[employees.length - 1].email : '')}>Delete Last Employee</button>
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
