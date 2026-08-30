import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Store, MapPin, Phone, Clock, MessageSquare, CheckCircle2,
  ArrowRight, ArrowLeft, ChevronRight, Zap,
} from 'lucide-react';
import { adminFetch } from '../services/api';

const WIZARD_KEY = 'ocp_onboarding_complete';

export function isOnboardingComplete() {
  return localStorage.getItem(WIZARD_KEY) === 'true';
}

export function resetOnboarding() {
  localStorage.removeItem(WIZARD_KEY);
}

interface Props {
  phone: string;
  onComplete: () => void;
}

const steps = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'contact', label: 'Contact' },
  { id: 'hours', label: 'Hours' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'done', label: 'Done' },
];

export default function OnboardingWizard({ phone, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: 'Orange Cheese Pizza',
    phone: phone || '',
    address: '',
    support_phone: '',
    opening_hours: '11:00 AM – 11:00 PM',
    delivery_area: '',
    payment_info: 'Cash, UPI on delivery',
  });
  const qc = useQueryClient();

  const updateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminFetch('/admin/config', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-config'] }),
  });

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
  };
  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  const finish = async () => {
    await updateMut.mutateAsync({
      name: form.name,
      phone: form.phone,
      address: form.address,
      support_phone: form.support_phone || form.phone,
      opening_hours: form.opening_hours,
      delivery_area: form.delivery_area ? form.delivery_area.split(',').map((s: string) => s.trim()) : [],
      payment_info: form.payment_info,
    });
    localStorage.setItem(WIZARD_KEY, 'true');
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white overflow-y-auto">
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <div className="border-b border-stone-200 bg-white sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">O</span>
              </div>
              <span className="font-heading font-bold text-zinc-900">Setup Wizard</span>
            </div>
            <span className="text-xs text-zinc-400">Step {step + 1} of {steps.length}</span>
          </div>
          {/* Progress bar */}
          <div className="h-0.5 bg-stone-100">
            <div
              className="h-full bg-brand-600 transition-all duration-500"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center px-5 py-12">
          <div className="w-full max-w-lg">
            {/* Step: Welcome */}
            {step === 0 && (
              <div className="text-center animate-fade-up">
                <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mx-auto mb-6">
                  <Store size={28} className="text-brand-600" />
                </div>
                <h1 className="font-heading font-extrabold text-3xl text-zinc-900">
                  Welcome to OCP
                </h1>
                <p className="text-zinc-500 mt-3 max-w-sm mx-auto">
                  Let's set up your restaurant in 2 minutes. You can change all of this later from Settings.
                </p>
                <div className="mt-8 space-y-3 text-left max-w-sm mx-auto">
                  {[
                    'Restaurant name and contact info',
                    'Operating hours and delivery areas',
                    'WhatsApp connection for orders',
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 text-sm text-zinc-600">
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
                <button
                  onClick={next}
                  className="mt-10 inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-all shadow-lg shadow-brand-600/20"
                >
                  Get Started <ArrowRight size={16} />
                </button>
              </div>
            )}

            {/* Step: Contact */}
            {step === 1 && (
              <div className="animate-fade-up">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-5">
                  <Phone size={20} className="text-brand-600" />
                </div>
                <h2 className="font-heading font-bold text-2xl text-zinc-900">Restaurant Details</h2>
                <p className="text-zinc-500 mt-1 text-sm">How customers will identify you.</p>

                <div className="mt-8 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">Restaurant Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => set('name', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all"
                      placeholder="My Pizza Shop"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">WhatsApp Number</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => set('phone', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all"
                      placeholder="919876543210"
                    />
                    <p className="text-xs text-zinc-400 mt-1">10-digit number with country code (e.g. 919876543210)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">Address</label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => set('address', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all"
                      placeholder="Shop 12, Main Street, Mumbai"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step: Hours */}
            {step === 2 && (
              <div className="animate-fade-up">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-5">
                  <Clock size={20} className="text-brand-600" />
                </div>
                <h2 className="font-heading font-bold text-2xl text-zinc-900">Hours & Delivery</h2>
                <p className="text-zinc-500 mt-1 text-sm">When are you open and where do you deliver?</p>

                <div className="mt-8 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">Operating Hours</label>
                    <input
                      type="text"
                      value={form.opening_hours}
                      onChange={(e) => set('opening_hours', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all"
                      placeholder="11:00 AM – 11:00 PM"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">Delivery Areas</label>
                    <input
                      type="text"
                      value={form.delivery_area}
                      onChange={(e) => set('delivery_area', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all"
                      placeholder="Mira Road, Borivali, Andheri (comma separated)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1.5">Payment Methods</label>
                    <input
                      type="text"
                      value={form.payment_info}
                      onChange={(e) => set('payment_info', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all"
                      placeholder="Cash, UPI on delivery"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step: WhatsApp */}
            {step === 3 && (
              <div className="animate-fade-up">
                <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-5">
                  <MessageSquare size={20} className="text-brand-600" />
                </div>
                <h2 className="font-heading font-bold text-2xl text-zinc-900">WhatsApp Connection</h2>
                <p className="text-zinc-500 mt-1 text-sm">Connect WhatsApp so customers can order via message.</p>

                <div className="mt-8 bg-stone-50 border border-stone-200 rounded-2xl p-6">
                  <h3 className="font-semibold text-zinc-900 text-sm mb-3">How it works</h3>
                  <ol className="space-y-3 text-sm text-zinc-600">
                    <li className="flex gap-3">
                      <span className="w-6 h-6 rounded-lg bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">1</span>
                      <span>Open Evolution GO at <code className="bg-white px-1.5 py-0.5 rounded text-xs border border-stone-200">http://localhost:8080</code></span>
                    </li>
                    <li className="flex gap-3">
                      <span className="w-6 h-6 rounded-lg bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">2</span>
                      <span>Create an instance named <code className="bg-white px-1.5 py-0.5 rounded text-xs border border-stone-200">OCP</code></span>
                    </li>
                    <li className="flex gap-3">
                      <span className="w-6 h-6 rounded-lg bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">3</span>
                      <span>Scan the QR code with WhatsApp on your phone</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="w-6 h-6 rounded-lg bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">4</span>
                      <span>Set the webhook URL to <code className="bg-white px-1.5 py-0.5 rounded text-xs border border-stone-200">http://YOUR_SERVER:8090/webhook/evolution</code></span>
                    </li>
                  </ol>
                </div>

                <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <Zap size={14} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700">
                    You can skip this for now and set it up later from the admin Settings page.
                    Orders will work on the website immediately.
                  </p>
                </div>
              </div>
            )}

            {/* Step: Done */}
            {step === 4 && (
              <div className="text-center animate-fade-up">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 size={28} className="text-emerald-600" />
                </div>
                <h1 className="font-heading font-extrabold text-3xl text-zinc-900">
                  You're all set!
                </h1>
                <p className="text-zinc-500 mt-3 max-w-sm mx-auto">
                  Your restaurant is configured. Start adding menu items, connect WhatsApp, and you're ready to take orders.
                </p>

                <div className="mt-8 space-y-3 text-left max-w-sm mx-auto">
                  <div className="flex items-center gap-3 text-sm text-zinc-600 p-3 rounded-xl bg-stone-50 border border-stone-100">
                    <Store size={16} className="text-brand-600 shrink-0" />
                    <div>
                      <span className="font-medium">{form.name}</span>
                      {form.phone && <span className="text-zinc-400 ml-2">+{form.phone}</span>}
                    </div>
                  </div>
                  {form.address && (
                    <div className="flex items-center gap-3 text-sm text-zinc-600 p-3 rounded-xl bg-stone-50 border border-stone-100">
                      <MapPin size={16} className="text-brand-600 shrink-0" />
                      <span>{form.address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-sm text-zinc-600 p-3 rounded-xl bg-stone-50 border border-stone-100">
                    <Clock size={16} className="text-brand-600 shrink-0" />
                    <span>{form.opening_hours}</span>
                  </div>
                </div>

                <button
                  onClick={finish}
                  disabled={updateMut.isPending}
                  className="mt-8 inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-all shadow-lg shadow-brand-600/20 disabled:opacity-50"
                >
                  {updateMut.isPending ? 'Saving...' : 'Go to Dashboard'} <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer nav */}
        {step > 0 && step < 4 && (
          <div className="border-t border-stone-200 bg-white sticky bottom-0">
            <div className="max-w-2xl mx-auto px-5 py-4 flex items-center justify-between">
              <button
                onClick={prev}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 hover:bg-stone-50 transition-colors"
              >
                <ArrowLeft size={14} /> Back
              </button>
              <button
                onClick={next}
                className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-all"
              >
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
