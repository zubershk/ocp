import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import {
  motion, AnimatePresence, useScroll, useSpring, useInView, useMotionValue,
  useMotionTemplate, animate, useReducedMotion,
} from 'framer-motion';
import {
  ArrowRight, MessageSquare, BarChart3, CheckCircle2, XCircle,
  Terminal, Layout, Smartphone, Bell, Users, GitFork, ShieldCheck,
  BookOpen, Heart, Zap, Gauge, Globe2, LockKeyhole, UtensilsCrossed,
  Coffee, Cloud, Truck, ChevronDown,
} from 'lucide-react';
import { useSocial, useSEO } from '../context/SiteSettingsContext';
import { useRestaurantName } from '../context/RestaurantContext';

function GithubIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

/* ──────────────── motion helpers ──────────────── */

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className}
      initial={reduce ? false : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ type: 'spring', stiffness: 170, damping: 22, mass: 0.7, delay }}>
      {children}
    </motion.div>
  );
}

function TiltCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 180, damping: 18 });
  const sry = useSpring(ry, { stiffness: 180, damping: 18 });
  const reduce = useReducedMotion();
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 9);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 9);
  };
  return (
    <div style={{ perspective: 900 }}>
      <motion.div onMouseMove={onMove} onMouseLeave={() => { rx.set(0); ry.set(0); }}
        style={{ rotateX: srx, rotateY: sry, transformStyle: 'preserve-3d' }}
        className={className}>
        {children}
      </motion.div>
    </div>
  );
}

function MagneticLink({ href, external = false, className = '', children }: { href: string; external?: boolean; className?: string; children: ReactNode }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 16 });
  const sy = useSpring(y, { stiffness: 220, damping: 16 });
  const reduce = useReducedMotion();
  const onMove = (e: MouseEvent<HTMLAnchorElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - r.left - r.width / 2) * 0.22);
    y.set((e.clientY - r.top - r.height / 2) * 0.22);
  };
  return (
    <motion.a href={href} onMouseMove={onMove} onMouseLeave={() => { x.set(0); y.set(0); }}
      style={{ x: sx, y: sy }}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={className}>
      {children}
    </motion.a>
  );
}

function CountUp({ to, suffix = '', decimals = 0 }: { to: number; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const mv = useMotionValue(0);
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(mv, to, { duration: 1.8, ease: 'easeOut', onUpdate: setValue });
    return () => c.stop();
  }, [inView, mv, to]);
  return <span ref={ref} className="tabular-nums">{value.toFixed(decimals)}{suffix}</span>;
}

const orderTimeline = [
  { label: 'Order placed', time: '7:12 pm' },
  { label: 'Confirmed', time: '7:13 pm' },
  { label: 'Preparing', time: '7:19 pm' },
  { label: 'Out for delivery', time: '7:41 pm' },
  { label: 'Delivered', time: '7:58 pm' },
];

function LiveOrderTicket() {
  const [active, setActive] = useState(2);
  useEffect(() => {
    const id = window.setInterval(() => setActive((a) => (a + 1) % orderTimeline.length), 2800);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="relative">
      <div className="glass-float rounded-[20px] border border-white/70 bg-white/90 p-6 shadow-[0_28px_60px_-28px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
        <div className="flex items-start justify-between border-b border-stone-200/70 pb-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-zinc-400">Live order</p>
            <p className="mt-1 font-heading text-xl font-semibold text-zinc-900">ORD-20261117-0126</p>
          </div>
          <motion.span key={orderTimeline[active].label} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            {orderTimeline[active].label}
          </motion.span>
        </div>
        <div className="mt-4 space-y-3">
          {orderTimeline.map((s, i) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 transition-colors duration-500 ${i <= active ? 'border-brand-600 bg-brand-600 shadow-[0_0_0_4px_rgba(234,88,12,0.14)]' : 'border-stone-300 bg-white'}`} />
              <span className={`flex-1 text-sm transition-colors duration-500 ${i <= active ? 'text-zinc-700' : 'text-zinc-400'}`}>{s.label}</span>
              <span className="font-mono text-xs text-zinc-400 tabular-nums">{i <= active ? s.time : '—'}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-2 border-t border-stone-200/70 pt-4 text-sm">
          <div className="flex justify-between text-zinc-600"><span>2 × Cheese &amp; Corn</span><span className="tabular-nums">₹570</span></div>
          <div className="flex justify-between text-zinc-600"><span>1 × Tandoori Paneer</span><span className="tabular-nums">₹285</span></div>
          <div className="flex justify-between border-t border-stone-200/70 pt-2 font-semibold text-zinc-900"><span>Total</span><span className="tabular-nums">₹855</span></div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-white/70">Statuses update live over Server-Sent Events</p>
    </div>
  );
}

/* ──────────────── data ──────────────── */

const features = [
  { icon: MessageSquare, title: 'WhatsApp ordering', desc: 'Customers order on the number they already use. No app download, no new habits.' },
  { icon: Layout, title: 'Live admin dashboard', desc: 'Order queue with status controls, menu editor with photo uploads, customer chat and analytics.' },
  { icon: Bell, title: 'Automatic notifications', desc: 'Confirmations, status changes and delivery alerts go out over WhatsApp without manual work.' },
  { icon: Users, title: 'Team roles', desc: 'Owner, manager, kitchen and viewer see only what they need. Every action goes to the audit log.' },
  { icon: BarChart3, title: 'Campaign runner', desc: 'Bulk WhatsApp messages to tagged customer segments, reusable templates and live delivery progress.' },
  { icon: Smartphone, title: 'Installable storefront', desc: 'A fast web menu with cart, checkout and tracking. Installs to the home screen and works offline.' },
];

const useCases = [
  { icon: UtensilsCrossed, title: 'Restaurants', desc: 'Full menu, modifiers, crusts and combos with live pricing and kitchen workflow.' },
  { icon: Coffee, title: 'Cafés and bakeries', desc: 'Counter pickup, quick orders and a compact POS for high-volume service.' },
  { icon: Cloud, title: 'Cloud kitchens', desc: 'Multiple outlets from one database, with role-based access for each kitchen.' },
  { icon: Truck, title: 'Food trucks and stalls', desc: 'A shareable ordering link and WhatsApp notifications without a marketplace listing.' },
];

const steps = [
  { num: '1', title: 'Clone and configure', desc: 'setup.sh generates the secrets and writes .env. It prints your admin key once.' },
  { num: '2', title: 'Start the stack', desc: 'docker compose up -d starts PostgreSQL, the WhatsApp gateway, the API, the site and campaigns.' },
  { num: '3', title: 'Pair WhatsApp and go', desc: 'Scan the QR code, add your menu, share your link. You are taking orders.' },
];

const comparisons = [
  { feature: 'Commission per order', ocp: 'None — you keep the revenue', other: '25-30% per order' },
  { feature: 'Monthly platform fee', ocp: 'None — MIT licensed', other: '₹2,000-5,000/month' },
  { feature: 'Customer data', ocp: 'Yours, in your database', other: 'Held on their platform' },
  { feature: 'WhatsApp marketing', ocp: 'Campaign runner included', other: 'Extra tool or unavailable' },
  { feature: 'Branding', ocp: 'Your name and your domain', other: 'Their brand on your page' },
  { feature: 'Source code', ocp: 'Full source, self-hosted', other: 'Closed platform' },
];

const techStack = [
  { name: 'Go 1.27', role: 'API' },
  { name: 'React 19', role: 'Storefront and admin' },
  { name: 'PostgreSQL 16', role: 'Database' },
  { name: 'Evolution GO', role: 'WhatsApp gateway' },
  { name: 'Docker', role: 'Deployment' },
];

const stats = [
  { label: 'Peak throughput', value: 13.7, decimals: 1, suffix: 'k RPS', icon: Zap },
  { label: 'Response time p95', value: 160, suffix: ' ms', icon: Gauge },
  { label: 'Concurrent shoppers', value: 1000, suffix: '', icon: Globe2 },
  { label: 'Open advisories', value: 0, suffix: '', icon: ShieldCheck },
];

const deployOptions = [
  { name: 'Northflank free Sandbox', detail: 'Bot, WhatsApp gateway and Postgres managed for you. Site on Vercel.', cost: 'Under the $20/mo free cap' },
  { name: 'Single VPS', detail: 'Docker Compose with Caddy for automatic TLS. Full control of one box.', cost: 'Free on Oracle always-free, else low cost' },
  { name: 'Your own machine', detail: 'Three commands for local development and evaluation.', cost: 'Free' },
];

const faqs = [
  { q: 'Is it really free?', a: 'Yes. The code is MIT licensed with no license fee or per-order commission. You pay only for the server or cloud resources you choose. The recommended Northflank path stays under its $20 monthly free Sandbox cap.' },
  { q: 'Do I need a WhatsApp business account?', a: 'You need a phone number and the bundled Evolution GO gateway to receive OTP logins and order notifications. Without pairing it the storefront still works, but OTP messages are written to the server log instead of arriving on WhatsApp.' },
  { q: 'Can I use my own domain and brand?', a: 'Yes. Brand colors, logo, fonts, pages, banners and footer are editable in the admin dashboard. Tenant resolution supports verified custom domains and subdomains of your base domain.' },
  { q: 'Does it support multiple outlets or restaurants?', a: 'The schema models organizations, restaurants and outlets with roles and per-outlet assignments. A single restaurant with several outlets works today; strict multi-tenant SaaS mode needs additional hardening before production use.' },
  { q: 'What do I need to deploy it?', a: 'Docker and Docker Compose for the recommended path, plus about 15 environment values that setup.sh generates for you. For public hosting you also point DNS at your server and set CORS_ALLOWED_ORIGINS.' },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto max-w-3xl divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white/70 backdrop-blur-sm">
      {faqs.map((f, i) => (
        <div key={f.q}>
          <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-zinc-900">
            {f.q}
            <motion.span animate={{ rotate: open === i ? 180 : 0 }} className="text-zinc-400"><ChevronDown size={16} /></motion.span>
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                <p className="px-5 pb-5 text-sm leading-relaxed text-zinc-600">{f.a}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

const screenshots = [
  { src: 'https://raw.githubusercontent.com/zubershk/ocp/master/docs/screenshots/storefront-menu.png', alt: 'OCP storefront menu with pizza categories and prices', label: 'Storefront menu' },
  { src: 'https://raw.githubusercontent.com/zubershk/ocp/master/docs/screenshots/admin-dashboard.png', alt: 'OCP admin dashboard with live orders', label: 'Admin dashboard' },
  { src: 'https://raw.githubusercontent.com/zubershk/ocp/master/docs/screenshots/campaign-dashboard.png', alt: 'OCP campaign runner dashboard', label: 'Campaign runner' },
];

const DOCS = 'https://github.com/zubershk/ocp#readme';

/* ──────────────── component ──────────────── */

export default function Landing() {
  const social = useSocial();
  const seo = useSEO();
  const restaurantName = useRestaurantName();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, restDelta: 0.001 });
  const cursorX = useMotionValue(-600);
  const cursorY = useMotionValue(-600);
  const smoothX = useSpring(cursorX, { stiffness: 90, damping: 22 });
  const smoothY = useSpring(cursorY, { stiffness: 90, damping: 22 });
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${smoothX}px ${smoothY}px, rgba(251,146,60,0.10), transparent 70%)`;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const move = (e: globalThis.MouseEvent) => { cursorX.set(e.clientX); cursorY.set(e.clientY); };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [cursorX, cursorY]);

  const heroTitle = seo.metaTitle || 'Your restaurant. Your platform. No commission';
  const heroDescription = seo.metaDescription || 'Online ordering with WhatsApp, a live admin dashboard, POS and campaigns — self-hosted, MIT licensed and entirely yours';

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#faf9f7] text-zinc-800">
      <style>{`
        @keyframes auroraDrift { 0%{transform:translate3d(0,0,0) scale(1)} 50%{transform:translate3d(4%,-6%,0) scale(1.12)} 100%{transform:translate3d(-3%,5%,0) scale(.96)} }
        @keyframes marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .aurora { position:absolute; border-radius:9999px; filter:blur(90px); pointer-events:none; animation:auroraDrift 20s ease-in-out infinite alternate; }
        .marquee-track { display:flex; width:max-content; animation:marquee 36s linear infinite; }
        .marquee-track:hover { animation-play-state:paused; }
        /* Concentric radii: nested surfaces step down toward their parent's corner */
        .glass-panel { border-radius: 20px; }
        .glass-panel > * { border-radius: 12px; }
        /* Accessibility: Reduce Transparency -> frost to opaque, like iOS */
        @media (prefers-reduced-transparency: reduce) {
          .glass-panel, .glass-float { background: #fff !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
          nav.bg-zinc-950\\/70, .aurora { display: none !important; }
        }
        @media (prefers-reduced-motion: reduce) { .aurora,.marquee-track{animation:none!important} }
      `}</style>

      <motion.div className="pointer-events-none fixed inset-0 z-[2]" style={{ background: spotlight }} />
      <motion.div className="fixed left-0 right-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-brand-500 to-amber-400" style={{ scaleX }} />

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 shadow-[0_6px_18px_-6px_rgba(251,146,60,0.9)]">
              <span className="font-heading text-sm font-semibold text-white">O</span>
            </div>
            <span className="font-heading text-base font-semibold text-white">{restaurantName || 'Restaurant'}</span>
          </motion.div>
          <div className="hidden items-center gap-6 text-sm text-zinc-300 sm:flex">
            {[['Features', '#features'], ['Who it is for', '#use-cases'], ['Screenshots', '#screenshots'], ['Pricing', '#pricing'], ['FAQ', '#faq'], ['Maintainers', '#maintainers']].map(([label, href]) => (
              <a key={label} href={href} className="transition-colors hover:text-white">{label}</a>
            ))}
            <a href="https://github.com/zubershk/ocp" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 transition-colors hover:text-white"><GithubIcon size={15} /> GitHub</a>
          </div>
          <div className="flex items-center gap-3">
            <a href={DOCS} target="_blank" rel="noopener noreferrer" className="hidden text-sm font-medium text-zinc-300 transition-colors hover:text-white sm:block">Docs</a>
            <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-500">
              Get started <ArrowRight size={14} />
            </MagneticLink>
          </div>
        </div>
      </nav>

      {/* ── Hero: CSS-built warm counter scene + live ticket ── */}
      <section className="relative isolate overflow-hidden bg-zinc-950">
        <div className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(60% 80% at 85% 40%, rgba(234,88,12,0.45), transparent 65%), radial-gradient(45% 60% at 70% 80%, rgba(190,24,93,0.25), transparent 70%), linear-gradient(120deg, #18181b 0%, #1c1917 55%, #2a1a10 100%)' }} />
        <div className="aurora absolute -right-20 top-10 -z-10 h-96 w-96 bg-orange-500/25" />
        <div className="aurora absolute bottom-0 right-1/4 -z-10 h-80 w-80 bg-amber-500/15" style={{ animationDelay: '-11s' }} />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-zinc-950/80 via-transparent to-zinc-950/40" />
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:py-32 lg:grid-cols-2 lg:gap-20">
          <div className="relative z-10">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-zinc-900/60 px-3 py-1.5 text-xs font-semibold text-brand-300 backdrop-blur-md">
              <motion.span animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }} transition={{ duration: 2, repeat: Infinity }} className="h-1.5 w-1.5 rounded-full bg-brand-400" />
              Open source · Free forever · Self-hosted
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.05, ease: [0.16, 1, 0.3, 1] as const }} className="max-w-xl font-heading text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              {heroTitle.replace(/\s*No commission\.?$/i, '')}<span className="bg-gradient-to-r from-brand-300 to-amber-300 bg-clip-text text-transparent"> No commission</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.12 }} className="mt-5 max-w-lg text-base leading-relaxed text-zinc-300 sm:text-lg">
              {heroDescription}
            </motion.p>
            {/* GlassEffectContainer analogue: one shared glass surface for the action group */}
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 170, damping: 22, delay: 0.18 }} className="glass-float mt-8 inline-flex flex-wrap items-center gap-2 rounded-[20px] border border-white/15 bg-white/5 p-2 backdrop-blur-xl">
              <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="inline-flex items-center gap-2 rounded-[12px] bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-500">
                <Terminal size={16} /> Start in three commands
              </MagneticLink>
              <MagneticLink href="#screenshots" className="inline-flex items-center gap-2 rounded-[12px] px-5 py-3 text-sm font-semibold text-white/90 transition-colors hover:bg-white/10 hover:text-white">
                See the product <ArrowRight size={15} />
              </MagneticLink>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.26 }} className="mt-10 max-w-md rounded-xl border border-white/10 bg-zinc-900/80 p-4 shadow-2xl backdrop-blur-xl">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-400/80" />
                <span className="h-2 w-2 rounded-full bg-amber-400/80" />
                <span className="h-2 w-2 rounded-full bg-emerald-500/80" />
                <span className="ml-2 font-mono text-xs text-zinc-500">terminal</span>
              </div>
              <code className="block font-mono text-xs leading-6 text-zinc-300">
                <span className="text-zinc-500">$</span> git clone https://github.com/zubershk/ocp.git<br />
                <span className="text-zinc-500">$</span> cd ocp &amp;&amp; bash setup.sh<br />
                <span className="text-zinc-500">$</span> docker compose up -d<br />
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }} className="text-emerald-400">✓ Ready at http://localhost:3000</motion.span>
              </code>
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] as const }} className="relative z-10">
            <LiveOrderTicket />
          </motion.div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="relative z-10 border-b border-stone-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-stone-200/70 bg-stone-200/60 sm:grid-cols-4">
          {stats.map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal key={s.label} delay={i * 0.08} className="bg-white p-6">
                <Icon size={16} strokeWidth={1.5} className="text-brand-600" />
                <p className="mt-3 font-heading text-2xl font-semibold text-zinc-900"><CountUp to={s.value} decimals={s.decimals} suffix={s.suffix} /></p>
                <p className="mt-1 text-xs text-zinc-500">{s.label}</p>
              </Reveal>
            );
          })}
        </div>
        <div className="mx-auto max-w-6xl px-5 py-6 text-center text-xs text-zinc-500">Measured with the bundled 1,000-user harness — <a className="text-brand-700 underline underline-offset-2" href="https://github.com/zubershk/ocp/blob/master/docs/LOAD_TEST.md" target="_blank" rel="noopener noreferrer">methodology</a></div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="relative z-10 border-b border-stone-200/70 bg-[#faf9f7] py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mb-12 text-center">
            <p className="text-xs font-semibold text-brand-700">Everything included</p>
            <h2 className="mt-2 font-heading text-3xl font-semibold text-zinc-900">A complete ordering operation, not a storefront template</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-600">The web menu, WhatsApp bot, admin, POS and campaign tool share one database and one tenant model.</p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <Reveal key={f.title} delay={i * 0.06}>
                  <TiltCard className="h-full rounded-[20px] border border-stone-200 bg-white p-6 shadow-sm">
                    <Icon size={18} strokeWidth={1.5} className="text-brand-600" />
                    <h3 className="mt-4 font-heading text-base font-semibold text-zinc-900">{f.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600">{f.desc}</p>
                  </TiltCard>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Use cases ── */}
      <section id="use-cases" className="relative z-10 border-b border-stone-200/70 bg-white py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mb-12 text-center">
            <p className="text-xs font-semibold text-brand-700">Who it is for</p>
            <h2 className="mt-2 font-heading text-3xl font-semibold text-zinc-900">Any food business that takes orders</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-600">Business type, sizes, payment labels, hours and branding are configuration, not code.</p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {useCases.map((u, i) => {
              const Icon = u.icon;
              return (
                <Reveal key={u.title} delay={i * 0.07}>
                  <TiltCard className="h-full rounded-[20px] border border-stone-200 bg-white p-6">
                    <Icon size={18} strokeWidth={1.5} className="text-brand-600" />
                    <h3 className="mt-4 font-heading text-base font-semibold text-zinc-900">{u.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600">{u.desc}</p>
                  </TiltCard>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Screenshots ── */}
      <section id="screenshots" className="relative z-10 border-b border-stone-200/70 bg-[#faf9f7] py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mb-12 text-center">
            <p className="text-xs font-semibold text-brand-700">The real product</p>
            <h2 className="mt-2 font-heading text-3xl font-semibold text-zinc-900">The world it belongs in, and the screens that run it</h2>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-3">
            {screenshots.map((s, i) => (
              <Reveal key={s.label} delay={i * 0.1}>
                <motion.figure whileHover={{ y: -6 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }} className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
                  <img src={s.src} alt={s.alt} className="h-44 w-full border-b border-stone-200/60 object-cover object-top" loading="lazy" />
                  <figcaption className="px-4 py-3 text-sm text-zinc-700">{s.label}</figcaption>
                </motion.figure>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-4 text-center text-sm text-zinc-500">All 21 screenshots are in the <a className="text-brand-700 underline underline-offset-2" href={DOCS} target="_blank" rel="noopener noreferrer">README</a></Reveal>
        </div>
      </section>

      {/* ── Steps ── */}
      <section className="relative z-10 border-b border-stone-200/70 bg-white py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mb-12 text-center">
            <p className="text-xs font-semibold text-brand-700">Getting started</p>
            <h2 className="mt-2 font-heading text-3xl font-semibold text-zinc-900">From clone to first order</h2>
          </Reveal>
          <div className="grid gap-8 sm:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal key={s.num} delay={i * 0.1}>
                <div className="relative border-t-2 border-brand-300 pt-5">
                  <span className="absolute -top-[7px] left-0 h-3 w-3 rounded-full border-2 border-brand-500 bg-white" />
                  <span className="font-mono text-sm font-semibold text-brand-600">{s.num}</span>
                  <h3 className="mt-2 font-heading text-base font-semibold text-zinc-900">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Marquee ── */}
      <section className="relative z-10 overflow-hidden border-b border-stone-200/70 bg-zinc-950 py-6">
        <div className="marquee-track">
          {[...techStack, ...techStack, ...techStack].map((t, i) => (
            <div key={`${t.name}-${i}`} className="mx-3 flex shrink-0 items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm">
              <span className="font-semibold text-white">{t.name}</span>
              <span className="text-xs text-zinc-400">{t.role}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Comparison ── */}
      <section className="relative z-10 border-b border-stone-200/70 bg-white py-20">
        <div className="mx-auto max-w-3xl px-5">
          <Reveal className="mb-12 text-center">
            <p className="text-xs font-semibold text-brand-700">Why self-host</p>
            <h2 className="mt-2 font-heading text-3xl font-semibold text-zinc-900">Keep the revenue and the relationship</h2>
            <p className="mt-3 text-sm text-zinc-600">Marketplace commissions are a percentage of every order, forever.</p>
          </Reveal>
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white/70 backdrop-blur-sm">
            <div className="grid grid-cols-3 bg-stone-50/80 text-xs font-semibold text-zinc-500">
              <div className="p-4">Area</div>
              <div className="p-4 text-center text-brand-700">OCP</div>
              <div className="p-4 text-center">Marketplace</div>
            </div>
            {comparisons.map((c, i) => (
              <Reveal key={c.feature} delay={i * 0.04}>
                <div className="grid grid-cols-3 border-t border-stone-200/60 text-sm">
                  <div className="p-4 font-medium text-zinc-700">{c.feature}</div>
                  <div className="p-4 text-center"><span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 size={14} /> {c.ocp}</span></div>
                  <div className="p-4 text-center"><span className="inline-flex items-center gap-1.5 text-zinc-400"><XCircle size={14} /> {c.other}</span></div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Deployment ── */}
      <section className="relative z-10 border-b border-stone-200/70 bg-[#faf9f7] py-20">
        <div className="mx-auto max-w-4xl px-5">
          <Reveal className="mb-12 text-center">
            <p className="text-xs font-semibold text-brand-700">Deployment</p>
            <h2 className="mt-2 font-heading text-3xl font-semibold text-zinc-900">Run it where it makes sense for you</h2>
          </Reveal>
          <div className="space-y-3">
            {deployOptions.map((d, i) => (
              <Reveal key={d.name} delay={i * 0.08}>
                <TiltCard className="flex flex-col gap-2 rounded-[20px] border border-stone-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div><h3 className="font-heading text-base font-semibold text-zinc-900">{d.name}</h3><p className="mt-1 text-sm text-zinc-600">{d.detail}</p></div>
                  <span className="shrink-0 font-mono text-xs text-zinc-500">{d.cost}</span>
                </TiltCard>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-6 text-center text-sm text-zinc-600">Full guides in <a className="text-brand-700 underline underline-offset-2" href="https://github.com/zubershk/ocp/blob/master/docs/DEPLOYMENT.md" target="_blank" rel="noopener noreferrer">DEPLOYMENT.md</a></Reveal>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="relative z-10 border-b border-stone-200/70 bg-white py-20">
        <div className="mx-auto max-w-4xl px-5">
          <Reveal className="mb-12 text-center">
            <p className="text-xs font-semibold text-brand-700">Pricing</p>
            <h2 className="mt-2 font-heading text-3xl font-semibold text-zinc-900">No license fee, no commission</h2>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2">
            <Reveal>
              <TiltCard className="h-full rounded-xl border-2 border-brand-200 bg-white p-7 shadow-lg shadow-brand-600/5">
                <h3 className="font-heading text-lg font-semibold text-zinc-900">Self-hosted</h3>
                <div className="mt-3 flex items-baseline gap-1"><span className="font-heading text-4xl font-semibold text-zinc-900">₹0</span><span className="text-sm text-zinc-500">forever</span></div>
                <p className="mt-2 text-sm text-zinc-600">Run it on your own server. Your data stays with you.</p>
                <ul className="mt-6 space-y-2 text-sm text-zinc-700">
                  {['Unlimited orders and customers', 'WhatsApp campaigns', 'Full source code', 'Team roles and audit log', 'POS and receipt printing'].map((f) => <li key={f} className="flex items-center gap-2"><CheckCircle2 size={14} className="shrink-0 text-emerald-600" /> {f}</li>)}
                </ul>
                <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="mt-7 block rounded-lg bg-zinc-900 px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-zinc-800">Get started</MagneticLink>
              </TiltCard>
            </Reveal>
            <Reveal delay={0.1}>
              <TiltCard className="h-full rounded-[20px] border border-stone-200 bg-white p-7">
                <h3 className="font-heading text-lg font-semibold text-zinc-900">Managed</h3>
                <div className="mt-3 flex items-baseline gap-1"><span className="font-heading text-4xl font-semibold text-zinc-900">₹999</span><span className="text-sm text-zinc-500">per month</span></div>
                <p className="mt-2 text-sm text-zinc-600">We host it while you focus on the food.</p>
                <ul className="mt-6 space-y-2 text-sm text-zinc-700">
                  {['Everything in self-hosted', 'Managed hosting and backups', 'SSL and domain setup', 'WhatsApp configured', 'Priority support'].map((f) => <li key={f} className="flex items-center gap-2"><CheckCircle2 size={14} className="shrink-0 text-emerald-600" /> {f}</li>)}
                </ul>
                <button disabled className="mt-7 block w-full cursor-not-allowed rounded-lg border border-stone-200 px-5 py-3 text-sm font-semibold text-zinc-500">Not available yet</button>
              </TiltCard>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="relative z-10 border-b border-stone-200/70 bg-[#faf9f7] py-20">
        <div className="mx-auto max-w-3xl px-5">
          <Reveal className="mb-12 text-center">
            <p className="text-xs font-semibold text-brand-700">Questions</p>
            <h2 className="mt-2 font-heading text-3xl font-semibold text-zinc-900">The things people ask first</h2>
          </Reveal>
          <Reveal><Faq /></Reveal>
        </div>
      </section>

      {/* ── Maintainers ── */}
      <section id="maintainers" className="relative z-10 border-b border-stone-200/70 bg-white py-20">
        <div className="mx-auto max-w-4xl px-5">
          <Reveal className="text-center">
            <GitFork size={32} strokeWidth={1.5} className="mx-auto text-zinc-400" />
            <h2 className="mt-4 font-heading text-3xl font-semibold text-zinc-900">Built in the open, maintained in the open</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-600">MIT licensed, with a documented architecture, a production checklist and CI that checks every module. If you want to improve food ordering software, there is room to do it here.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <MagneticLink href="https://github.com/zubershk/ocp" external className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"><GithubIcon size={15} /> View on GitHub</MagneticLink>
              <MagneticLink href="https://github.com/zubershk/ocp/blob/master/CONTRIBUTING.md" external className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-5 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:border-stone-300"><BookOpen size={15} /> Contributing guide</MagneticLink>
            </div>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, title: 'Safe to run', desc: 'govulncheck, CodeQL, gitleaks and fail-closed npm audits run on every push. Security reports are private.' },
              { icon: LockKeyhole, title: 'Tested at scale', desc: 'A reproducible 1,000-user harness measures throughput, latency and database pool pressure.' },
              { icon: Heart, title: 'Where help is needed', desc: 'Currency and localization, payment gateways, webhooks, a versioned API, the hosted demo and onboarding.' },
            ].map((c, i) => {
              const Icon = c.icon;
              return (
                <Reveal key={c.title} delay={i * 0.08}>
                  <TiltCard className="h-full rounded-[20px] border border-stone-200 bg-white p-5 shadow-sm">
                    <Icon size={18} strokeWidth={1.5} className="text-brand-600" />
                    <h3 className="mt-3 font-heading text-sm font-semibold text-zinc-900">{c.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600">{c.desc}</p>
                  </TiltCard>
                </Reveal>
              );
            })}
          </div>
          <Reveal className="mt-6 text-center text-sm text-zinc-600">See <a className="text-brand-700 underline underline-offset-2" href="https://github.com/zubershk/ocp/blob/master/docs/DEPENDABOT_TRIAGE.md" target="_blank" rel="noopener noreferrer">security advisories</a> and the <a className="text-brand-700 underline underline-offset-2" href="https://github.com/zubershk/ocp/issues" target="_blank" rel="noopener noreferrer">issue tracker</a></Reveal>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative isolate overflow-hidden bg-zinc-950 py-20">
        <div className="aurora -left-10 top-0 h-64 w-64 bg-orange-500/25" />
        <div className="aurora bottom-0 right-0 h-72 w-72 bg-amber-500/10" style={{ animationDelay: '-9s' }} />
        <div className="relative mx-auto max-w-2xl px-5 text-center">
          <Reveal>
            <h2 className="font-heading text-3xl font-semibold text-white">Own the whole ordering flow</h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">One repository, one database, no platform taking a cut of every order.</p>
            <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="mt-8 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-brand-600/25 transition-colors hover:bg-brand-500">Get started <ArrowRight size={15} /></MagneticLink>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 bg-zinc-950 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600"><span className="font-heading text-xs font-semibold text-white">O</span></div>
            <span className="font-heading text-sm font-semibold text-white">{restaurantName || 'Restaurant'}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5 text-xs text-zinc-500">
            <a href="https://github.com/zubershk/ocp" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-zinc-300">GitHub</a>
            <a href="https://github.com/zubershk/ocp/blob/master/LICENSE" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-zinc-300">MIT License</a>
            <a href="https://github.com/zubershk/ocp/blob/master/docs/DEPLOYMENT.md" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-zinc-300">Deployment</a>
            <a href="https://github.com/zubershk/ocp/blob/master/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-zinc-300">Contributing</a>
            {social.instagram && <a href={social.instagram.startsWith('https://') ? social.instagram : '#'} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-zinc-300">Instagram</a>}
            {social.facebook && <a href={social.facebook.startsWith('https://') ? social.facebook : '#'} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-zinc-300">Facebook</a>}
            {social.twitter && <a href={social.twitter.startsWith('https://') ? social.twitter : '#'} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-zinc-300">Twitter</a>}
            {social.youtube && <a href={social.youtube.startsWith('https://') ? social.youtube : '#'} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-zinc-300">YouTube</a>}
            {social.whatsapp && <a href={social.whatsapp.startsWith('https://') ? social.whatsapp : '#'} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-zinc-300">WhatsApp</a>}
          </div>
        </div>
      </footer>
    </div>
  );
}
