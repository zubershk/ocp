import { Link } from 'react-router-dom';
import {
  ArrowRight, MessageSquare, BarChart3, Shield, Zap, Globe, Code,
  CheckCircle2, XCircle, ChevronRight, Terminal, Layout,
  Smartphone, Bell, Users, Settings, Truck, Clock, Star, ExternalLink,
} from 'lucide-react';

function GithubIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

/* ──────────────── data ──────────────── */

const features = [
  {
    icon: MessageSquare,
    title: 'WhatsApp Ordering',
    desc: 'Customers order via WhatsApp — no app download, no new habits. Works on every phone.',
  },
  {
    icon: Layout,
    title: 'Admin Dashboard',
    desc: 'Real-time order management, menu editor with photo uploads, live customer chat, analytics.',
  },
  {
    icon: Bell,
    title: 'Auto Notifications',
    desc: 'Order confirmations, status updates, and delivery alerts sent automatically via WhatsApp.',
  },
  {
    icon: Users,
    title: 'Team Roles',
    desc: 'Owner, manager, kitchen, viewer — each role sees only what they need. Audit log tracks everything.',
  },
  {
    icon: BarChart3,
    title: 'Campaign Runner',
    desc: 'Bulk WhatsApp messages to customer segments. Templates with merge tags. Live delivery tracking.',
  },
  {
    icon: Smartphone,
    title: 'Customer Site',
    desc: 'Full menu with photos, cart, checkout, order tracking. PWA — installs to home screen, works offline.',
  },
];

const steps = [
  { num: '1', title: 'Clone & Configure', desc: 'Run setup.sh — generates secrets, creates .env, prints your admin key.' },
  { num: '2', title: 'Docker Compose Up', desc: 'One command starts PostgreSQL, WhatsApp gateway, backend, frontend, and campaign runner.' },
  { num: '3', title: 'Scan QR & Go', desc: 'Scan the WhatsApp QR code, import your menu, and you are live.' },
];

const comparisons = [
  { feature: 'Commission per order', ocp: 'Zero — you keep everything', competitor: '25-30% per order' },
  { feature: 'Monthly platform fee', ocp: 'Free (open source)', competitor: '₹2,000-5,000/month' },
  { feature: 'Customer data ownership', ocp: 'Fully yours — your database', competitor: 'Locked on their platform' },
  { feature: 'WhatsApp marketing', ocp: 'Built-in campaign runner', competitor: 'Extra tool / not available' },
  { feature: 'Custom branding', ocp: 'Your name, your domain', competitor: 'Their branding on your page' },
  { feature: 'Source code access', ocp: 'Full — MIT licensed', competitor: 'Proprietary black box' },
];

const techStack = [
  { name: 'Go', role: 'Backend API', detail: 'Fast, single binary, low memory' },
  { name: 'React', role: 'Frontend', detail: 'Modern UI with TypeScript' },
  { name: 'PostgreSQL', role: 'Database' },
  { name: 'Evolution GO', role: 'WhatsApp API', detail: 'Open source WhatsApp gateway' },
  { name: 'Docker', role: 'Deployment', detail: 'One command to run everything' },
];

/* ──────────────── component ──────────────── */

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#faf9f7]">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-stone-200/60">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">O</span>
            </div>
            <span className="font-heading font-bold text-lg text-zinc-900">Orange Cheese Pizza</span>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm font-medium text-zinc-600">
            <a href="#features" className="hover:text-zinc-900 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-zinc-900 transition-colors">Pricing</a>
            <a href="#tech" className="hover:text-zinc-900 transition-colors">Tech</a>
            <a href="https://github.com/zubershk/ocp" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-900 transition-colors inline-flex items-center gap-1.5">
              <GithubIcon size={15} /> GitHub
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/r/" className="text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors hidden sm:block">
              View Demo
            </Link>
            <a
              href="https://github.com/zubershk/ocp#quick-start"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition-colors"
            >
              Get Started <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 pt-20 pb-24 sm:pt-28 sm:pb-32 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-semibold mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
            Open Source &middot; Free Forever &middot; Self-Hosted
          </div>
          <h1 className="font-heading font-extrabold text-4xl sm:text-5xl lg:text-6xl text-zinc-900 leading-tight max-w-3xl mx-auto">
            Your pizza shop.<br />Your platform.{' '}
            <span className="text-brand-600">Zero commission.</span>
          </h1>
          <p className="mt-5 text-lg text-zinc-500 max-w-xl mx-auto leading-relaxed">
            Full-stack online ordering with WhatsApp integration, real-time
            management, and a marketing campaign runner — all self-hosted,
            all yours.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="https://github.com/zubershk/ocp#quick-start"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-all shadow-lg shadow-brand-600/20"
            >
              <Terminal size={16} /> Start Free — 3 Commands
            </a>
            <Link
              to="/r/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white border border-stone-200 text-zinc-700 font-semibold hover:border-stone-300 hover:bg-stone-50 transition-all"
            >
              See Live Demo <ChevronRight size={16} />
            </Link>
          </div>

          {/* ── Terminal snippet ── */}
          <div className="mt-12 max-w-lg mx-auto bg-zinc-900 rounded-2xl p-5 text-left shadow-2xl">
            <div className="flex items-center gap-1.5 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
            </div>
            <code className="text-sm text-zinc-300 font-mono leading-relaxed block">
              <span className="text-zinc-500">$</span> git clone https://github.com/zubershk/ocp.git<br />
              <span className="text-zinc-500">$</span> cd ocp && bash setup.sh<br />
              <span className="text-zinc-500">$</span> docker compose up -d<br />
              <span className="text-emerald-400">{'✓'} Running on http://localhost:3000</span>
            </code>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 sm:py-24 bg-white border-y border-stone-200/60">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-14">
            <p className="text-xs font-bold tracking-widest text-brand-600 uppercase">Everything you need</p>
            <h2 className="font-heading font-bold text-3xl sm:text-4xl text-zinc-900 mt-2">
              Run your restaurant like a tech company
            </h2>
            <p className="text-zinc-500 mt-3 max-w-lg mx-auto">
              Built for small food businesses that want a professional online presence
              without paying platform commissions.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="group p-6 rounded-2xl border border-stone-200 bg-white hover:border-brand-200 hover:shadow-lg transition-all">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center group-hover:bg-brand-100 transition-colors">
                    <Icon size={18} className="text-brand-600" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-heading font-semibold text-lg text-zinc-900 mt-4">{f.title}</h3>
                  <p className="text-sm text-zinc-500 mt-1.5 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="py-20 sm:py-24">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-14">
            <p className="text-xs font-bold tracking-widest text-brand-600 uppercase">Getting started</p>
            <h2 className="font-heading font-bold text-3xl sm:text-4xl text-zinc-900 mt-2">
              Live in 3 minutes
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {steps.map((s) => (
              <div key={s.num} className="text-center">
                <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white font-heading font-bold text-xl flex items-center justify-center mx-auto shadow-lg shadow-brand-600/20">
                  {s.num}
                </div>
                <h3 className="font-heading font-semibold text-lg text-zinc-900 mt-4">{s.title}</h3>
                <p className="text-sm text-zinc-500 mt-1.5">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison ── */}
      <section className="py-20 sm:py-24 bg-white border-y border-stone-200/60">
        <div className="max-w-3xl mx-auto px-5">
          <div className="text-center mb-14">
            <p className="text-xs font-bold tracking-widest text-brand-600 uppercase">Why self-host?</p>
            <h2 className="font-heading font-bold text-3xl sm:text-4xl text-zinc-900 mt-2">
              Stop paying 30% commissions
            </h2>
            <p className="text-zinc-500 mt-3">
              Swiggy and Zomato take a cut of every order. OCP keeps your revenue with you.
            </p>
          </div>
          <div className="rounded-2xl border border-stone-200 overflow-hidden">
            <div className="grid grid-cols-3 bg-stone-50 border-b border-stone-200 text-xs font-bold text-zinc-500 uppercase tracking-wider">
              <div className="p-4">Feature</div>
              <div className="p-4 text-center text-brand-600">OCP (Free)</div>
              <div className="p-4 text-center">Swiggy / Zomato</div>
            </div>
            {comparisons.map((c, i) => (
              <div key={c.feature} className={`grid grid-cols-3 text-sm ${i < comparisons.length - 1 ? 'border-b border-stone-100' : ''}`}>
                <div className="p-4 font-medium text-zinc-700">{c.feature}</div>
                <div className="p-4 text-center">
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                    <CheckCircle2 size={14} className="text-emerald-500" /> {c.ocp}
                  </span>
                </div>
                <div className="p-4 text-center">
                  <span className="inline-flex items-center gap-1.5 text-zinc-400">
                    <XCircle size={14} /> {c.competitor}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech stack ── */}
      <section id="tech" className="py-20 sm:py-24">
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center mb-14">
            <p className="text-xs font-bold tracking-widest text-brand-600 uppercase">Under the hood</p>
            <h2 className="font-heading font-bold text-3xl sm:text-4xl text-zinc-900 mt-2">
              Built on proven technology
            </h2>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {techStack.map((t) => (
              <div key={t.name} className="flex items-center gap-3 px-5 py-3 rounded-xl bg-white border border-stone-200 shadow-sm">
                <span className="font-heading font-bold text-zinc-900">{t.name}</span>
                <span className="text-xs text-zinc-400">|</span>
                <span className="text-sm text-zinc-500">{t.role}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 sm:py-24 bg-white border-y border-stone-200/60">
        <div className="max-w-4xl mx-auto px-5">
          <div className="text-center mb-14">
            <p className="text-xs font-bold tracking-widest text-brand-600 uppercase">Pricing</p>
            <h2 className="font-heading font-bold text-3xl sm:text-4xl text-zinc-900 mt-2">
              Free forever. Seriously.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {/* Self-hosted */}
            <div className="rounded-2xl border-2 border-brand-200 bg-white p-8 relative">
              <div className="absolute -top-3 left-6 px-3 py-1 rounded-full bg-brand-600 text-white text-xs font-bold">
                Recommended
              </div>
              <h3 className="font-heading font-bold text-xl text-zinc-900">Self-Hosted</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-heading font-extrabold text-zinc-900">₹0</span>
                <span className="text-zinc-500 text-sm">/forever</span>
              </div>
              <p className="text-sm text-zinc-500 mt-2">Run on your own server. Full control. Zero limits.</p>
              <ul className="mt-6 space-y-2.5">
                {['Unlimited orders', 'Unlimited customers', 'WhatsApp campaigns', 'Menu with photos', 'Team management', 'Analytics dashboard', 'Source code access'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-zinc-600">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <a
                href="https://github.com/zubershk/ocp#quick-start"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 block text-center px-6 py-3 rounded-xl bg-zinc-900 text-white font-semibold hover:bg-zinc-800 transition-colors"
              >
                Get Started Free
              </a>
            </div>

            {/* Managed */}
            <div className="rounded-2xl border border-stone-200 bg-white p-8">
              <h3 className="font-heading font-bold text-xl text-zinc-900">Managed</h3>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-heading font-extrabold text-zinc-900">₹999</span>
                <span className="text-zinc-500 text-sm">/month</span>
              </div>
              <p className="text-sm text-zinc-500 mt-2">We host it. You focus on your food.</p>
              <ul className="mt-6 space-y-2.5">
                {['Everything in Self-Hosted', 'Managed hosting & backups', 'SSL & domain setup', 'WhatsApp API configured', 'Priority support', '99.9% uptime SLA'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-zinc-600">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button className="mt-8 block w-full text-center px-6 py-3 rounded-xl bg-white border border-stone-200 text-zinc-700 font-semibold hover:border-stone-300 hover:bg-stone-50 transition-colors cursor-not-allowed">
                Coming Soon
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Open source ── */}
      <section className="py-20 sm:py-24">
        <div className="max-w-3xl mx-auto px-5 text-center">
          <GithubIcon size={40} className="text-zinc-400 mx-auto" />
          <h2 className="font-heading font-bold text-3xl sm:text-4xl text-zinc-900 mt-4">
            Built in the open
          </h2>
          <p className="text-zinc-500 mt-3 max-w-lg mx-auto">
            MIT licensed. Every line of code is on GitHub. Contribute features,
            report bugs, or fork it for your own restaurant chain.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="https://github.com/zubershk/ocp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-zinc-900 text-white font-semibold hover:bg-zinc-800 transition-colors"
            >
              <GithubIcon size={16} /> View on GitHub
            </a>
            <a
              href="https://github.com/zubershk/ocp/blob/master/CONTRIBUTING.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white border border-stone-200 text-zinc-700 font-semibold hover:border-stone-300 hover:bg-stone-50 transition-colors"
            >
              Contributing Guide
            </a>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 sm:py-24 bg-zinc-900">
        <div className="max-w-3xl mx-auto px-5 text-center">
          <h2 className="font-heading font-bold text-3xl sm:text-4xl text-white">
            Ready to own your ordering platform?
          </h2>
          <p className="text-zinc-400 mt-3 max-w-md mx-auto">
            Three commands. No credit card. No vendor lock-in. Just your restaurant,
            your customers, your revenue.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="https://github.com/zubershk/ocp#quick-start"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-colors shadow-lg shadow-brand-600/20"
            >
              Get Started — It's Free <ArrowRight size={16} />
            </a>
            <Link
              to="/r/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors"
            >
              See Live Demo
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 bg-zinc-950">
        <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">O</span>
            </div>
            <span className="font-heading font-semibold text-sm text-white">Orange Cheese Pizza</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-zinc-500">
            <a href="https://github.com/zubershk/ocp" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition-colors">GitHub</a>
            <a href="https://github.com/zubershk/ocp/blob/master/LICENSE" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition-colors">MIT License</a>
            <a href="https://github.com/zubershk/ocp/blob/master/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition-colors">Contributing</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
