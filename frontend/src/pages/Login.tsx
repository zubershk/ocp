import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MessageCircle, ArrowLeft, RefreshCw, Gift, Truck, Clock3, Award, UtensilsCrossed, MapPin, Shield, ChevronRight } from 'lucide-react';
import { sendOtp, verifyOtp } from '../services/authService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const PROMOS = [
  { icon: Gift, badge: 'Family Pack', title: 'Family Pack from ₹515', desc: '2 pizzas + garlic bread + choco lava cake', to: '/r/offers' },
  { icon: Truck, badge: 'Free Delivery', title: 'Free delivery 11 AM – 4 AM', desc: 'Mira Road · Vasai · Bhayandar — no minimum', to: '/r/locations' },
  { icon: Award, badge: 'Real Mozzarella', title: '100% real mozzarella', desc: 'Fresh, never processed cheese on every pizza', to: '/r/about' },
  { icon: Clock3, badge: 'BOGO', title: 'Buy 1, Get 2nd at Special Price', desc: '2nd pizza from ₹150 — call or WhatsApp', to: '/r/offers' },
  { icon: UtensilsCrossed, badge: '6 Crusts', title: '6 Crusts · Tossed to Cheese Burst', desc: 'Choose your base, same pricing online & in-store', to: '/r/menu' },
  { icon: MapPin, badge: '3 Outlets', title: 'Mira Road · Vasai · Bhayandar', desc: 'Same menu, same pricing across all kitchens', to: '/r/locations' },
];

export default function Login() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get('redirect') ?? '/r/account';
  const { customer, setCustomer } = useAuth();
  const { push } = useToast();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { if (customer) nav(redirect, { replace: true }); }, [customer, nav, redirect]);
  useEffect(() => { if (cooldown <= 0) return; const id = setTimeout(() => setCooldown((c) => c - 1), 1000); return () => clearTimeout(id); }, [cooldown]);

  const promo = useMemo(() => PROMOS[Math.floor(Math.random() * PROMOS.length)], []);
  const normalizedPhone = phone.replace(/\D/g, '').slice(-10);

  const onSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    if (normalizedPhone.length !== 10) { setError('Enter a 10-digit mobile number.'); return; }
    setSending(true);
    try {
      await sendOtp(normalizedPhone);
      setStep('otp');
      setCooldown(30);
      push({ type: 'success', title: 'Code sent on WhatsApp' });
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send code'); }
    finally { setSending(false); }
  };

  const onVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const code = otp.join('');
    if (code.length !== 6) { setError('Enter the 6-digit code'); return; }
    setError(''); setVerifying(true);
    try {
      const { token, customer: c } = await verifyOtp(normalizedPhone, code);
      setCustomer(c, token);
      push({ type: 'success', title: `Welcome${c.name ? `, ${c.name}` : ''}!` });
      nav(redirect, { replace: true });
    } catch (err) { setError(err instanceof Error ? err.message : 'Verification failed'); }
    finally { setVerifying(false); }
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
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 mb-6 transition-colors">
          <ArrowLeft size={14} /> Back to home
        </Link>

        <div className="bg-white rounded-3xl border border-stone-100 shadow-elevated overflow-hidden">
          {/* Header accent */}
          <div className="h-1 bg-brand-600" />

          <div className="p-7 sm:p-8">
            {/* Logo */}
            <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center text-white mb-5">
              <Shield size={20} />
            </div>

            <h1 className="text-xl sm:text-2xl font-heading font-bold tracking-tight">
              {step === 'phone' ? 'Sign in' : 'Enter code'}
            </h1>
            <p className="text-sm text-zinc-500 mt-1.5 leading-relaxed">
              {step === 'phone'
                ? "We'll send a 6-digit code to your WhatsApp."
                : <>Code sent to <span className="font-medium text-zinc-700">+91 {normalizedPhone}</span></>
              }
            </p>

            {error && (
              <div role="alert" className="mt-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200/60 text-sm text-red-700 flex items-start gap-2">
                <span className="shrink-0 mt-0.5 text-red-500 font-bold">!</span> {error}
              </div>
            )}

            {step === 'phone' ? (
              <form onSubmit={onSend} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Mobile number
                  </label>
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
                      className="flex-1 px-4 py-3 rounded-r-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 text-base transition-all"
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={sending || normalizedPhone.length !== 10}
                  className="w-full py-3.5 rounded-2xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98]"
                >
                  {sending ? (
                    <><RefreshCw size={16} className="animate-spin" /> Sending…</>
                  ) : (
                    <><MessageCircle size={16} /> Send code</>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={onVerify} className="mt-6 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-zinc-700">6-digit code</label>
                    <button
                      type="button"
                      onClick={() => { setStep('phone'); setError(''); setOtp(['', '', '', '', '', '']); }}
                      className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
                    >
                      Change number
                    </button>
                  </div>
                  <div className="flex gap-2.5 justify-center" onPaste={handlePaste}>
                    {otp.map((d, i) => (
                      <input
                        key={i}
                        ref={(el) => { otpRefs.current[i] = el; }}
                        value={d}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        inputMode="numeric"
                        maxLength={1}
                        className={`
                          w-12 h-14 text-center text-xl font-bold rounded-xl border-2 transition-all duration-200
                          ${d
                            ? 'border-brand-400 bg-brand-50/30 text-brand-700'
                            : 'border-stone-200 bg-stone-50 focus:bg-white focus:border-brand-400'
                          }
                          focus:outline-none focus:ring-2 focus:ring-brand-500/20
                        `}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={verifying || otp.join('').length !== 6}
                  className="w-full py-3.5 rounded-2xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98]"
                >
                  {verifying ? (
                    <><RefreshCw size={16} className="animate-spin" /> Verifying…</>
                  ) : 'Verify'}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    disabled={cooldown > 0 || sending}
                    onClick={onSend}
                    className="text-sm font-medium text-zinc-500 hover:text-brand-600 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw size={13} />
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Promo card */}
        {(() => {
          const Icon = promo.icon;
          return (
            <Link
              to={promo.to}
              className="mt-4 flex gap-3.5 p-4 rounded-2xl bg-white border border-stone-100 shadow-card hover:shadow-card-hover hover:border-stone-200 transition-all duration-300 group"
            >
              <div className="w-11 h-11 rounded-xl bg-brand-50 border border-brand-100/60 text-brand-600 grid place-items-center shrink-0">
                <Icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full bg-zinc-900 text-white">
                    {promo.badge}
                  </span>
                  <span className="text-xs text-zinc-400 group-hover:text-brand-600 transition-colors inline-flex items-center gap-0.5">
                    {promo.to === '/offers' ? 'See offers' : promo.to === '/locations' ? 'View outlets' : promo.to === '/about' ? 'About OCP' : 'Explore'}
                    <ChevronRight size={12} />
                  </span>
                </div>
                <div className="text-sm font-semibold leading-tight mt-1.5 text-zinc-900">{promo.title}</div>
                <div className="text-xs text-zinc-500 leading-relaxed mt-0.5">{promo.desc}</div>
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
