import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, User, Mail, Lock, Phone, CheckCircle, RefreshCw } from 'lucide-react';
import { register } from '../services/authService';
import { useToast } from '../context/ToastContext';

export default function Register() {
  const nav = useNavigate();
  const { push } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [registering, setRegistering] = useState(false);
  const [success, setSuccess] = useState(false);

  const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!email.trim()) {
      push({ type: 'error', title: 'Email is required' });
      return;
    }
    if (!email.includes('@')) {
      push({ type: 'error', title: 'Enter a valid email address' });
      return;
    }
    if (!password || password.length < 6) {
      push({ type: 'error', title: 'Password must be at least 6 characters' });
      return;
    }
    if (password !== confirmPassword) {
      push({ type: 'error', title: 'Passwords do not match' });
      return;
    }
    if (phone && normalizedPhone.length !== 10) {
      push({ type: 'error', title: 'Enter a valid 10-digit mobile number' });
      return;
    }

    setRegistering(true);
    try {
      await register({
        email: email.trim(),
        password,
        phone: normalizedPhone.length === 10 ? normalizedPhone : undefined,
        name: name.trim() || undefined,
      });
      setSuccess(true);
    } catch (err) {
      push({ type: 'error', title: err instanceof Error ? err.message : 'Registration failed' });
    } finally {
      setRegistering(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-10 relative">
        <div className="w-full max-w-[420px]">
          <div className="bg-white rounded-3xl border border-stone-100 shadow-elevated overflow-hidden">
            <div className="p-7 sm:p-8 text-center py-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 flex items-center justify-center success-check">
                <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-heading font-bold mt-4 text-emerald-700">Account created!</h1>
              <p className="text-sm text-zinc-500 mt-1.5">
                Your account has been created and you're signed in.
              </p>
              <button
                onClick={() => nav('/r/account', { replace: true })}
                className="mt-6 w-full py-3.5 rounded-2xl bg-brand-600 text-white text-center font-semibold hover:bg-brand-700 transition-colors shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)]"
              >
                Go to Account
              </button>
              <p className="text-[11px] text-zinc-400 mt-4">
                You can also sign in with your phone via WhatsApp OTP.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10 relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-100/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-amber-100/30 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-[460px] relative">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 mb-6 transition-colors">
          <ArrowLeft size={14} /> Back to home
        </Link>

        <div className="bg-white rounded-3xl border border-stone-100 shadow-elevated overflow-hidden">
          <div className="h-1 bg-brand-600" />

          <div className="p-7 sm:p-8">
            <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center text-white mb-5">
              <Shield size={20} />
            </div>

            <h1 className="text-xl sm:text-2xl font-heading font-bold tracking-tight">
              Create Account
            </h1>
            <p className="text-sm text-zinc-500 mt-1.5 leading-relaxed">
              Join Orange Cheese Pizza. Same number for web & WhatsApp history.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-1.5">Full Name</label>
                <input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  autoComplete="name"
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 text-base transition-all min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1.5">Email</label>
                <input
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 text-base transition-all min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-zinc-700 mb-1.5">Password</label>
                <input
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 text-base transition-all min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-700 mb-1.5">Confirm Password</label>
                <input
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 text-base transition-all min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-zinc-700 mb-1.5">Mobile Number (optional)</label>
                <div className="flex">
                  <span className="inline-flex items-center px-3.5 rounded-l-xl border border-r-0 border-stone-200 bg-stone-50 text-sm font-medium text-zinc-500">
                    +91
                  </span>
                  <input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    inputMode="numeric"
                    placeholder="98765 43210"
                    autoComplete="tel"
                    className="flex-1 px-4 py-3 rounded-r-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 text-base transition-all min-h-[44px]"
                  />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Optional — links your WhatsApp order history to this account.
                </p>
              </div>

              <button
                type="submit"
                disabled={registering || !email || !password || password.length < 6 || password !== confirmPassword}
                className="w-full py-3.5 rounded-2xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98]"
              >
                {registering ? (
                  <><RefreshCw size={16} className="animate-spin" /> Creating…</>
                ) : (
                  <><User size={16} /> Create Account</>
                )}
              </button>
            </form>

            <div className="mt-5 text-center">
              <p className="text-[11px] text-zinc-500">
                Already have an account?{' '}
                <Link to="/r/login" className="text-brand-600 hover:text-brand-700 font-medium underline underline-offset-2">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}