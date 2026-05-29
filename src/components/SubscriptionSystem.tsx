import React from 'react';
import { Shield, Sparkles, Check, ChevronRight, CreditCard, Calendar, LogIn, ArrowRight, Loader2, RefreshCw, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { SignIn, SignUp } from '@clerk/clerk-react';

interface UserTierInfo {
  tier: 'free' | 'paid';
  nextBillingDate: string | null;
  stripeSubscriptionId?: string | null;
}

// 1. Protective Auth / Login Component
interface AuthPageProps {
  onSuccess?: () => void;
  onLocalLogin?: (user: { uid: string; email: string; displayName: string }) => void;
}

export function AuthPage({ onSuccess, onLocalLogin }: AuthPageProps) {
  const [isSignUp, setIsSignUp] = React.useState(false);
  const [emailMode, setEmailMode] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const targetEmail = email.trim().toLowerCase();
    const targetPassword = password.trim();

    try {
      const response = await fetch('/api/user/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: targetEmail, password: targetPassword })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        if (onLocalLogin) {
          onLocalLogin({
            uid: data.user.uid,
            email: data.user.email,
            displayName: data.user.name || data.user.displayName || 'Client'
          });
        }
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setError(data.error || 'Access Denied: Incorrect email or password.');
      }
    } catch (err: any) {
      setError('Connection failure to authentication server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[500px] flex-col items-center justify-center py-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-american-blue/5 text-american-blue">
            <Shield size={24} />
          </div>
          <h2 className="text-xl font-black uppercase tracking-tight text-american-blue">
            {emailMode ? 'Direct Email Sign In' : isSignUp ? 'Create your Account' : 'Sign in to Fence Works'}
          </h2>
          <p className="mt-1 text-xs text-[#666666]">
            {emailMode 
              ? 'Enter your internal email and password credentials.' 
              : 'Authentication required to access the estimators and estimators dossiers.'}
          </p>
        </div>

        {emailMode ? (
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6 shadow-xl">
            {error && (
              <div className="mb-4 rounded-xl bg-american-red/10 p-3.5 text-xs font-bold text-american-red">
                {error}
              </div>
            )}
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#666666] mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 h-4 w-4 text-[#999999]" />
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
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3.5 h-4 w-4 text-[#999999]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[#D5D5D5] bg-white py-2.5 pl-10 pr-10 text-sm font-medium focus:border-american-blue focus:outline-none focus:ring-1 focus:ring-american-blue transition-colors"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 text-[#999999] hover:text-[#666666]"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-american-blue hover:bg-american-blue/90 text-white py-3 text-xs font-black uppercase tracking-widest shadow-md transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <LogIn size={16} />}
                Sign In
              </button>
            </form>
          </div>
        ) : (
          <div className="flex justify-center bg-white border border-[#E5E5E5] rounded-2xl p-4 shadow-xl overflow-hidden">
            {isSignUp ? (
              <SignUp 
                routing="virtual"
                signInUrl="#"
              />
            ) : (
              <SignIn 
                routing="virtual"
                signUpUrl="#"
              />
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          {!emailMode && (
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-xs font-bold text-american-red hover:underline cursor-pointer"
            >
              {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
            </button>
          )}

          <button
            onClick={() => {
              setEmailMode(!emailMode);
              setError('');
            }}
            className="text-xs font-bold text-american-blue hover:underline cursor-pointer"
          >
            {emailMode ? '← Back to standard Sign In / Register' : 'Use Direct Email / Password Credentials'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 2. Pricing Overview Page
interface PricingPageProps {
  userId: string | null;
  userEmail: string | null;
  currentTier: 'free' | 'paid';
  onGetStarted: () => void;
}

export function PricingPage({ userId, userEmail, currentTier, onGetStarted }: PricingPageProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubscribe = async () => {
    if (!userId) {
      setError('Please sign in first to subscribe.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, email: userEmail }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize subscription');
      }
      if (data.url) {
        window.location.href = data.url; // Redirect to Stripe checkout
      } else {
        throw new Error('Server did not return checkout session URL');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Payment server failed. Check your STRIPE_SECRET_KEY env setting.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-8">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <h1 className="text-3xl font-black uppercase text-american-blue tracking-tight">Fence Estimator Premium Pricing</h1>
        <p className="mt-2 text-sm text-[#666666]">
          Professional estimating tools and automated contract generation. Elevate your project bids.
        </p>
      </div>

      {error && (
        <div className="max-w-md mx-auto mb-6 rounded-xl bg-american-red/10 p-4 text-xs font-bold text-american-red">
          {error}
        </div>
      )}

      <div className="grid gap-8 max-w-4xl mx-auto md:grid-cols-2">
        {/* Free Plan Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#E5E5E5] bg-white p-8 shadow-md relative overflow-hidden transition-all hover:shadow-lg">
          <div>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-black uppercase text-[#666666]">Free Tier</h3>
                <p className="text-xs text-[#999999] mt-1">Great for trialing operations</p>
              </div>
              {currentTier === 'free' && (
                <span className="bg-american-blue/5 text-american-blue text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded">My Active Plan</span>
              )}
            </div>
            
            <div className="mt-6 flex items-baseline">
              <span className="text-4xl font-black text-american-blue">$0</span>
              <span className="text-xs text-[#999999]/80 ml-1">/mo forever</span>
            </div>

            <hr className="my-6 border-[#E5E5E5]" />

            <ul className="space-y-3.5">
              <li className="flex items-center gap-3 text-xs text-[#333333]">
                <Check className="text-green-600 shrink-0" size={16} />
                <span>Full access to Fence Estimator suite</span>
              </li>
              <li className="flex items-center gap-3 text-xs text-[#333333]">
                <Check className="text-green-600 shrink-0" size={16} />
                <span>Basic materials library</span>
              </li>
              <li className="flex items-center gap-3 text-xs text-[#333333]">
                <Check className="text-green-600 shrink-0" size={16} />
                <span>Manage up to 5 estimates</span>
              </li>
            </ul>
          </div>

          <div className="mt-8">
            <button
              onClick={onGetStarted}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#F0F0F0] text-american-blue hover:bg-american-blue/10 py-3.5 text-xs font-black uppercase tracking-widest transition-all"
            >
              Get Started
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Paid Plan Card */}
        <div className="flex flex-col justify-between rounded-2xl border-2 border-american-blue bg-white p-8 shadow-xl relative overflow-hidden transition-all hover:shadow-2xl">
          <div className="absolute top-0 right-0 bg-american-blue text-white text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-bl-xl flex items-center gap-1">
            <Sparkles size={10} />
            Recommended
          </div>

          <div>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-black uppercase text-american-blue flex items-center gap-2">
                  Paid Tier
                </h3>
                <p className="text-xs text-[#666666] mt-1">For active commercial fence outfits</p>
              </div>
              {currentTier === 'paid' && (
                <span className="bg-green-100 text-green-800 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded">My Active Plan</span>
              )}
            </div>
            
            <div className="mt-6 flex items-baseline">
              <span className="text-4xl font-black text-american-blue">$50</span>
              <span className="text-xs text-[#999999]/80 ml-1">/mo</span>
            </div>

            <hr className="my-6 border-[#E5E5E5]" />

            <ul className="space-y-3.5">
              <li className="flex items-center gap-3 text-xs text-[#333333]">
                <Check className="text-green-600 shrink-0" size={16} />
                <span><strong>Full unlimited access</strong> to Estimating Suite</span>
              </li>
              <li className="flex items-center gap-3 text-xs text-[#333333]">
                <Check className="text-green-600 shrink-0" size={16} />
                <span>Automated Scopes & Contract Generation</span>
              </li>
              <li className="flex items-center gap-3 text-xs text-[#333333]">
                <Check className="text-green-600 shrink-0" size={16} />
                <span>Export Dossiers & Unlimited Saved records</span>
              </li>
              <li className="flex items-center gap-3 text-xs text-[#333333]">
                <Check className="text-green-600 shrink-0" size={16} />
                <span>Priority Service and Custom Materials setup</span>
              </li>
              <li className="flex items-center gap-3 text-xs text-[#333333]">
                <Check className="text-green-600 shrink-0" size={16} />
                <span>Remove ads & priority server priority queue</span>
              </li>
            </ul>
          </div>

          <div className="mt-8">
            {currentTier === 'paid' ? (
              <button
                disabled
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-500 text-white py-3.5 text-xs font-black uppercase tracking-widest cursor-default"
              >
                Subscribed
              </button>
            ) : (
              <button
                onClick={handleSubscribe}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-american-blue py-3.5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-american-blue/20 hover:bg-american-blue/90 disabled:opacity-50 transition-all"
              >
                {loading ? <Loader2 className="animate-spin" size={14} /> : <CreditCard size={14} />}
                Subscribe for $50/mo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 3. Billing & Dashboard Page
interface DashboardPageProps {
  userId: string;
  currentTier: 'free' | 'paid';
  nextBillingDate: string | null;
  onNavigatePricing: () => void;
}

export function SubscriptionDashboard({ userId, currentTier, nextBillingDate, onNavigatePricing }: DashboardPageProps) {
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [error, setError] = React.useState('');

  const handleCancel = async () => {
    if (!window.confirm("Are you sure you want to cancel your Premium Fence works plan? This will return you to the free plan immediately.")) {
      return;
    }
    setLoading(true);
    setMsg('');
    setError('');
    try {
      const resp = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to cancel subscription');
      }
      setMsg('Subscription canceled successfully. You have been placed back on the Free plan.');
    } catch (err: any) {
      setError(err.message || 'Server error while canceling.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-black uppercase tracking-tight text-american-blue">Billing & Premium subscription</h1>
        <p className="text-xs text-[#666666] mt-1">Manage your subscriber level, renew rates, and checkout statements.</p>
      </div>

      {msg && (
        <div className="mb-6 rounded-xl bg-green-100 p-4 text-xs font-bold text-green-800">
          {msg}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl bg-american-red/10 p-4 text-xs font-bold text-american-red">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Tier Status Card */}
        <div className="md:col-span-2 rounded-2xl border border-[#E5E5E5] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-wider text-[#999999]">Current Subscriber Level</h3>
            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${currentTier === 'paid' ? 'bg-american-blue text-white' : 'bg-[#E5E5E5] text-[#666666]'}`}>
              {currentTier === 'paid' ? 'PREMIUM (PAID TIER)' : 'STANDARD (FREE TIER)'}
            </span>
          </div>

          <p className="mt-4 text-sm text-[#1A1A1A] leading-relaxed">
            {currentTier === 'paid' 
              ? 'You have complete access to Lone Star Fence Works Premium features, including automated contracts, comprehensive PDF takeaways, and unlimited dossier slots.'
              : 'You are on the free plan. Upgrade to the premium membership to unlock priority execution, PDF storage, client agreement summaries, and customized estimate rates.'
            }
          </p>

          <hr className="my-5 border-[#E5E5E5]" />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="text-[#666666]" size={18} />
              <div>
                <p className="text-[10px] font-black uppercase text-[#999999] tracking-wider">Next Billing / Expiration Date</p>
                <p className="text-xs font-bold text-[#333333]">
                  {nextBillingDate ? new Date(nextBillingDate).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'None (Free Plan)'}
                </p>
              </div>
            </div>

            {currentTier === 'free' ? (
              <button
                onClick={onNavigatePricing}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-american-blue px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-american-blue/20 hover:bg-american-blue/90 transition-all"
              >
                Upgrade to Premium
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleCancel}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-american-red/20 text-american-red hover:bg-american-red/5 px-5 py-3 text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                Cancel Subscription
              </button>
            )}
          </div>
        </div>

        {/* Support Card */}
        <div className="rounded-2xl border border-[#E5E5E5] bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-black uppercase text-american-blue tracking-wider mb-2">Subscriber Benefits</h4>
            <ul className="space-y-3">
              <li className="flex items-start gap-2 text-xs text-[#666666]">
                <Check className="text-green-600 shrink-0 mt-0.5" size={14} />
                <span>Unlimited Dossier Savings</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-[#666666]">
                <Check className="text-green-600 shrink-0 mt-0.5" size={14} />
                <span>Automated Contracts Scope</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-[#666666]">
                <Check className="text-green-600 shrink-0 mt-0.5" size={14} />
                <span>Priority 1-on-1 Help Line</span>
              </li>
            </ul>
          </div>

          <div className="mt-6 border-t border-[#E5E5E5] pt-4">
            <p className="text-[10px] text-[#999999] text-center italic">
              Need assistance? Email us at usmc6123@gmail.com
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
