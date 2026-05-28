import React from 'react';
import { 
  Lock, Mail, LogOut, KeyRound, Eye, EyeOff, RefreshCw, 
  Calendar, CheckCircle2, ShieldCheck, ShieldAlert 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  doc, getDoc, onSnapshot, query, collection, where 
} from 'firebase/firestore';
import { 
  auth, db, handleFirestoreError, OperationType, getEstimatesCollection 
} from '../lib/firebase';
import { 
  signInWithEmailAndPassword, signOut, onAuthStateChanged, User 
} from 'firebase/auth';
import Scheduler from './Scheduler';
import { Employee, SavedEstimate } from '../types';
import { COMPANY_INFO } from '../constants';

export default function EmployeePortal() {
  const [user, setUser] = React.useState<User | null>(null);
  const [employeeRecord, setEmployeeRecord] = React.useState<Employee | null>(null);
  const [savedEstimates, setSavedEstimates] = React.useState<SavedEstimate[]>([]);
  
  // Auth state management
  const [authLoading, setAuthLoading] = React.useState(true);
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);
  
  // Form states
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');

  // 1. Detect auth state changes
  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      if (u && u.email) {
        // Fetch matching employee record to confirm access rights
        setErrorMsg('');
        try {
          const empDoc = await getDoc(doc(db, 'employees', u.email.toLowerCase()));
          if (empDoc.exists()) {
            setEmployeeRecord(empDoc.data() as Employee);
          } else if (u.email === 'usmc6123@gmail.com' || u.email === 'bradens@lonestarfenceworks.com') {
            // Give Admin full privileges even inside portal view
            setEmployeeRecord({
              email: u.email,
              permission: 'Can Edit',
              createdAt: new Date().toISOString()
            });
          } else {
            // Signed-in user is NOT registered as an employee
            setErrorMsg("Access Denied: Your email is not registered as an active employee.");
            await signOut(auth);
            setUser(null);
            setEmployeeRecord(null);
          }
        } catch (err) {
          console.error("Error verifying employee access:", err);
          setErrorMsg("Failed to verify employee record. Please contact the administrator.");
          await signOut(auth);
          setUser(null);
          setEmployeeRecord(null);
        }
      } else {
        setEmployeeRecord(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Fetch estimates so they update items on the scheduler
  React.useEffect(() => {
    if (!user || !employeeRecord) {
      setSavedEstimates([]);
      return;
    }

    const q = query(getEstimatesCollection(db));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setSavedEstimates(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as SavedEstimate)));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'estimates')
    );
    return () => unsubscribe();
  }, [user, employeeRecord]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoggingIn(true);

    const targetEmail = email.trim().toLowerCase();
    const targetPassword = password.trim();

    if (!targetEmail || !targetPassword) {
      setErrorMsg("Please enter both email and password.");
      setIsLoggingIn(false);
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, targetEmail, targetPassword);
    } catch (err: any) {
      console.error("Employee Portal Login failed:", err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setErrorMsg("Incorrect email or password.");
      } else if (err.code === 'auth/operation-not-allowed') {
        setErrorMsg("Email/Password provider is not enabled in Firebase Authentication. Tell your admin to enable it.");
      } else {
        setErrorMsg(err.message || "Failed to log in.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setEmployeeRecord(null);
      setUser(null);
    } catch (err) {
      console.error("Portal logout failed:", err);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA]">
        <div className="text-center space-y-4">
          <RefreshCw className="animate-spin text-american-blue mx-auto" size={36} />
          <p className="text-xs font-black uppercase tracking-widest text-[#666666]">Lone Star Fence Works Portal Loading...</p>
        </div>
      </div>
    );
  }

  // Render Login view if not logged in
  if (!user || !employeeRecord) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          {/* Logo */}
          <div className="flex justify-center items-center gap-3 mb-6">
            {COMPANY_INFO.logo && (
              <img 
                src={COMPANY_INFO.logo} 
                alt={COMPANY_INFO.name} 
                className="h-16 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="flex flex-col text-left">
              <span className="text-lg font-black uppercase leading-none tracking-tighter text-american-blue">Lone Star</span>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-american-red">Fence Works</span>
            </div>
          </div>
          
          <h2 className="text-center text-2xl font-black uppercase tracking-tight text-american-blue">
            Employee Portal Login
          </h2>
          <p className="mt-1 text-center text-xs font-bold uppercase tracking-widest text-american-red">
            Field Operations Scheduling Access
          </p>
        </div>

        <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 border border-[#E5E5E5] rounded-2xl shadow-sm sm:px-10">
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-[#999999]" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@lonestarfenceworks.com"
                    className="w-full rounded-xl border border-[#D5D5D5] bg-white py-2.5 pl-10 pr-4 text-sm font-medium focus:border-american-blue focus:outline-none focus:ring-1 focus:ring-american-blue transition-colors"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1">
                  Access Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-[#999999]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter employee password"
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

              {errorMsg && (
                <div className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600 flex items-start gap-2 border border-red-100">
                  <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-american-blue py-3.5 text-xs font-black uppercase tracking-widest text-white hover:bg-american-blue/90 shadow-lg shadow-american-blue/15 transition-all disabled:opacity-50"
              >
                {isLoggingIn && <RefreshCw size={14} className="animate-spin" />}
                Sign In to Portal
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Render Schedule Panel if authenticated successfully
  const readOnly = employeeRecord.permission === 'View Only';

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans mb-12">
      {/* Branded Portal Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-[#E5E5E5]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {COMPANY_INFO.logo && (
              <img 
                src={COMPANY_INFO.logo} 
                alt={COMPANY_INFO.name} 
                className="h-10 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="flex flex-col text-left">
              <span className="text-sm font-black uppercase leading-none tracking-tighter text-american-blue">Lone Star</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-american-red">Fence Works</span>
            </div>
            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-american-blue/5 text-american-blue border border-american-blue/10 text-[10px] font-bold uppercase tracking-wider ml-4">
              <Calendar size={12} />
              Operations Schedule
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs font-black text-american-blue truncate">{user.email}</p>
              <p className={cn(
                "inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider",
                readOnly ? "text-amber-600" : "text-emerald-700"
              )}>
                {readOnly ? 'View Only Access' : 'Can Edit Access'}
              </p>
            </div>
            <button 
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold px-3.5 py-2 rounded-xl text-xs uppercase tracking-wider transition-colors ml-2"
              title="Log Out of Employee Portal"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Log Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content: Scheduler Only */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-0 sm:p-6 lg:p-8">
        <div className="bg-transparent sm:bg-white rounded-none sm:rounded-3xl border-0 sm:border border-[#E5E5E5] p-1 sm:p-6 shadow-none sm:shadow-xs">
          <Scheduler 
            savedEstimates={savedEstimates} 
            user={user} 
            readOnly={readOnly} 
          />
        </div>
      </main>
    </div>
  );
}
