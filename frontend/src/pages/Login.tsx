import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MessageCircle, ArrowLeft, RefreshCw, Gift, Truck, Clock3, Award, UtensilsCrossed, MapPin, Shield, ChevronRight, Mail, Lock, User, Phone, ArrowRight, ArrowLeft as ArrowLeftIcon, Star, Flame } from 'lucide-react';
import { sendOtp, verifyOtp, register, login } from '../services/authService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useOutletNames } from '../context/RestaurantContext';
import { useHomepage } from '../context/SiteSettingsContext';

export default function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const redirectRaw = params.get('redirect');
  // Allowlist redirect to same-origin app routes only — prevent open redirect.
  const allowedRedirects = ['/r/account', '/r/menu', '/r/checkout', '/r/offers', '/r/orders', '/r/cart'];
  const redirect: string = allowedRedirects.includes(redirectRaw ?? '') ? (redirectRaw ?? '/r/account') : '/r/account';
  const { customer, setCustomer } = useAuth();
  const { push } = useToast();
  const outletNames = useOutletNames();

  const outletList = outletNames.length > 0 ? outletNames.join(' · ') : 'Outlet 1• Outlet 2• Outlet 3';

  const ICON_MAP: Record<string, any> = {
    Gift, Truck, Clock3, Award, UtensilsCrossed, MapPin, Star, Flame, Shield, Phone, Mail,
  };

  const hp = useHomepage();
  const promos = useMemo(() => {
    return (hp.promos ?? []).filter((p) => p.active !== false).map((p) => ({
      ...p,
      Icon: ICON_MAP[p.icon] || Star,
    }));
  }, [hp.promos]);

  // Auth method tabs: 'email' | 'whatsapp'
  const [authMethod, setAuthMethod] = useState<'email' | 'whatsapp'>('email');

  // Email + Password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  // WhatsApp OTP state
  const [otpStep, setOtpStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpDelivered, setOtpDelivered] = useState(true);
  const [otpSuccess, setOtpSuccess] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { if (customer) nav(redirect, { replace: true }); }, [customer, nav, redirect]);
  useEffect(() => { if (otpCooldown <= 0) return; const id = setTimeout(() => setOtpCooldown((c) => c - 1), 1000); return () => clearTimeout(id); }, [otpCooldown]);

  // ============ Email + Password ============
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError('');
    setEmailSending(true);
    try {
      const { token, customer: c } = await login(email.trim(), password);
      setCustomer(c, token);
      push({ type: 'success', title: `Welcome back${c.name ? `, ${c.name}` : ''}!` });
      setTimeout(() => nav(redirect, { replace: true }), 800);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setEmailSending(false);
    }
  };

  const handleRegister = () => {
    nav('/r/register', { replace: true });
  };

  // ============ WhatsApp OTP ============
  const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

  const handleSendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setOtpError('');
    if (normalizedPhone.length !== 10) { setOtpError('Enter a 10-digit mobile number.'); return; }
    setOtpSending(true);
    try {
      const result = await sendOtp(normalizedPhone);
      setOtpDelivered(result.delivered);
      setOtpStep('otp');
      setOtpCooldown(30);
      if (result.delivered) {
        push({ type: 'success', title: 'Code sent on WhatsApp' });
      } else {
        push({ type: 'info', title: 'Code generated - check server console (dev mode)' });
      }
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not send code';
      setOtpError(msg);
      const m = msg.match(/please wait (\d+) seconds/i);
      if (m) setOtpCooldown(parseInt(m[1], 10));
    } finally { setOtpSending(false); }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const code = otp.join('');
    if (code.length !== 6) { setOtpError('Enter the 6-digit code'); return; }
    setOtpError(''); setOtpVerifying(true);
    try {
      const { token, customer: c } = await verifyOtp(normalizedPhone, code);
      setCustomer(c, token);
      setOtpSuccess(true);
      push({ type: 'success', title: `Welcome${c.name ? `, ${c.name}` : ''}!` });
      setTimeout(() => nav(redirect, { replace: true }), 800);
    } catch (err) { setOtpError(err instanceof Error ? err.message : 'Verification failed'); }
    finally { setOtpVerifying(false); }
  };

  const handleOtpChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otp]; next[idx] = digit; setOtp(next);
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
  };
  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowLeft' && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < 5) otpRefs.current[idx + 1]?.focus();
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) { e.preventDefault(); setOtp(text.split('')); otpRefs.current[5]?.focus(); }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10 relative">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-100/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-amber-100/30 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-[460px] relative">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 mb-6 transition-colors">
          <ArrowLeftIcon size={14} /> Back to home
        </Link>

        <div className="bg-white rounded-3xl border border-stone-100 shadow-elevated overflow-hidden">
          <div className="h-1 bg-brand-600" />

          <div className="p-7 sm:p-8">
            {/* Logo */}
            <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center text-white mb-5">
              <Shield size={20} />
            </div>

            {/* Auth Method Tabs */}
            <div className="flex gap-1 mb-6 bg-zinc-100 p-1 rounded-xl w-fit mx-auto">
              <button
                onClick={() => setAuthMethod('email')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${authMethod === 'email' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                Email &amp; Password
              </button>
              <button
                onClick={() => setAuthMethod('whatsapp')}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${authMethod === 'whatsapp' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                WhatsApp OTP
              </button>
            </div>

            {/* Already have account prompt on Register tab */}
            {authMethod === 'email' && (
              <div className="mt-5 text-center">
                <p className="text-[11px] text-zinc-500">
                  Don't have an account?{' '}
                  <Link to="/r/register" className="text-brand-600 hover:text-brand-700 font-medium underline underline-offset-2">
                    Register
                  </Link>
                </p>
              </div>
            )}

            {authMethod === 'email' ? (
              // Email + Password Form
              <div>
                <h1 className="text-xl sm:text-2xl font-heading font-bold tracking-tight">Sign in</h1>
                <p className="text-sm text-zinc-500 mt-1.5 leading-relaxed">
                  Sign in to your account to view orders and reorder.
                </p>

                {otpError && (
                  <div role="alert" className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200/60 text-sm text-red-700 flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 text-red-500 font-bold">!</span> {otpError}
                  </div>
                )}

                <form onSubmit={handleEmailLogin} className="mt-6 space-y-3">
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
                      autoFocus
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
                      autoComplete="current-password"
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 text-base transition-all min-h-[44px]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={emailSending || !email || !password}
                    className="w-full py-3.5 rounded-2xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98]"
                  >
                    {emailSending ? (
                      <><RefreshCw size={16} className="animate-spin" /> Signing in…</>
                    ) : (
                      <><User size={16} /> Sign in</>
                    )}
                  </button>
                </form>

                <div className="mt-5 flex justify-between items-center">
                  <button
                    onClick={handleRegister}
                    type="button"
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors underline underline-offset-4"
                  >
                    Don't have an account? Register
                  </button>
                </div>

                <div className="mt-4 border-t border-zinc-100 pt-4">
                  <p className="text-[11px] text-zinc-500 mb-2">Or sign in with WhatsApp</p>
                  <button
                    onClick={() => setAuthMethod('whatsapp')}
                    className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 hover:shadow-[0_4px_6px_-1px_rgba(16,185,129,0.25)] transition-all duration-200 active:scale-[0.98] shadow-sm inline-flex items-center justify-center gap-2"
                  >
                    <Phone size={14} /> Send OTP on WhatsApp
                  </button>
                </div>
              </div>
            ) : (
              // WhatsApp OTP Form
              <div>
                <h1 className="text-xl sm:text-2xl font-heading font-bold tracking-tight">Sign in</h1>
                <p className="text-sm text-zinc-500 mt-1.5 leading-relaxed">
                  We'll send a 6-digit code to your WhatsApp.
                </p>

                {otpError && (
                  <div role="alert" className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200/60 text-sm text-red-700 flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 text-red-500 font-bold">!</span>
                    {otpCooldown > 0 ? `Please wait ${otpCooldown}s before requesting a new code` : otpError}
                  </div>
                )}

                {otpStep === 'phone' ? (
                  <form onSubmit={handleSendOtp} className="mt-6 space-y-4">
                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-zinc-700 mb-1.5">Mobile number</label>
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
                          autoFocus
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={otpSending || normalizedPhone.length !== 10}
                      className="w-full py-3.5 rounded-2xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98]"
                    >
                      {otpSending ? (
                        <><RefreshCw size={16} className="animate-spin" /> Sending…</>
                      ) : (
                        <><MessageCircle size={16} /> Send code</>
                      )}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="mt-6 space-y-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-zinc-700">6-digit code</label>
                      <button
                        type="button"
                        onClick={() => { setOtpStep('phone'); setOtpError(''); setOtp(['', '', '', '', '', '']); }}
                        className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
                      >
                        Change number
                      </button>
                    </div>
                    <div className="flex gap-2 sm:gap-2.5 justify-center" onPaste={handlePaste}>
                      {otp.map((d, i) => (
                        <input
                          key={i}
                          ref={(el) => { otpRefs.current[i] = el; }}
                          value={d}
                          onChange={(e) => handleOtpChange(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                          inputMode="numeric"
                          maxLength={1}
                          className={`w-11 sm:w-14 h-14 sm:h-16 text-center text-xl sm:text-2xl font-bold rounded-2xl border-2 transition-all duration-200
                          ${d ? 'border-brand-500 bg-brand-50 text-brand-700 ring-4 ring-brand-200/50 scale-105' : 'border-stone-200 bg-stone-50 focus:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-200/50' } focus:outline-none`}
                          style={d ? { animationDelay: `${i * 30}ms` } : undefined}
                        />
                      ))}
                    </div>

                    <button
                      type="submit"
                      disabled={otpVerifying || otp.join('').length !== 6}
                      className="w-full py-3.5 rounded-2xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98]"
                    >
                      {otpVerifying ? (
                        <><RefreshCw size={16} className="animate-spin" /> Verifying…</>
                      ) : 'Verify'}
                    </button>

                    <div className="text-center">
                      <button
                        type="button"
                        disabled={otpCooldown > 0 || otpSending}
                        onClick={handleSendOtp}
                        className="text-sm font-medium text-zinc-500 hover:text-brand-600 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition-colors"
                      >
                        <RefreshCw size={13} />
                        {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend code'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Back to email from WhatsApp */}
            {authMethod === 'whatsapp' && otpStep === 'phone' && (
              <div className="mt-4 border-t border-zinc-100 pt-4">
                <p className="text-[11px] text-zinc-500 mb-2">Or sign in with email</p>
                <button
                  onClick={() => setAuthMethod('email')}
                  className="w-full py-3 rounded-xl bg-zinc-900 text-white font-semibold hover:bg-zinc-800 hover:shadow-[0_4px_6px_-1px_rgba(0,0,0,0.25)] transition-all duration-200 active:scale-[0.98] shadow-sm inline-flex items-center justify-center gap-2"
                >
                  <Mail size={14} /> Email &amp; Password
                </button>
              </div>
            )}

            <div className="mt-4 flex justify-between items-center">
              {authMethod === 'email' && (
                <button
                  onClick={() => setAuthMethod('whatsapp')}
                  type="button"
                  className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  Don't have WhatsApp? Sign in with WhatsApp OTP
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Promo card */}
        {(() => {
          const randomPromo = promos.length > 0 ? promos[Math.floor(Math.random() * promos.length)] : null;
          if (!randomPromo) return null;
          const Icon = randomPromo.Icon;
          return (
            <Link
              to={randomPromo.to}
              className="mt-4 flex gap-3.5 p-4 rounded-2xl bg-white border border-stone-100 shadow-card hover:shadow-card-hover hover:border-stone-200 transition-all duration-300 group"
            >
              <div className="w-11 h-11 rounded-xl bg-brand-50 border border-brand-100/60 text-brand-600 grid place-items-center shrink-0">
                <Icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full bg-zinc-900 text-white">{randomPromo.badge}</span>
                  <span className="text-xs text-zinc-400 group-hover:text-brand-600 transition-colors inline-flex items-center gap-0.5">
                    {randomPromo.to === '/offers' ? 'See offers' : randomPromo.to === '/locations' ? 'View outlets' : randomPromo.to === '/about' ? 'About OCP' : 'Explore'}
                    <ChevronRight size={12} />
                  </span>
                </div>
                <div className="text-sm font-semibold leading-tight mt-1.5 text-zinc-900">{randomPromo.title}</div>
                <div className="text-xs text-zinc-500 leading-relaxed mt-0.5">{randomPromo.desc}</div>
              </div>
            </Link>
          );
        })()}

        <p className="text-center text-[11px] text-zinc-400 mt-4">
          Sign in once — same number for web & WhatsApp history.
        </p>
      </div>
    </div>
  );
}
