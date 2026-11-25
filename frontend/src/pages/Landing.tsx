import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import {
  motion, AnimatePresence, useScroll, useSpring, useInView, useMotionValue,
  useMotionTemplate, useTransform, animate, useReducedMotion,
} from 'framer-motion';
import {
  ArrowRight, MessageSquare, CheckCheck, Layout, BarChart3, Smartphone, Bell, Terminal,
  Users, ShieldCheck, Zap, Gauge, Globe2, UtensilsCrossed,
  Coffee, Cloud, Truck, CheckCircle2, XCircle, ChevronDown, Menu, X,
  Clock, BookOpen, ChevronLeft, ChevronRight, Play, Pause, ArrowUp, Star, Copy,
} from '../components/fa-icons';
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
      transition={{ type: 'spring', stiffness: 190, damping: 25, delay }}>
      {children}
    </motion.div>
  );
}

function TiltCard({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 180, damping: 18 });
  const sry = useSpring(ry, { stiffness: 180, damping: 18 });
  const reduce = useReducedMotion();
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 8);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 8);
  };
  return (
    <div style={{ perspective: 900 }}>
      <motion.div onMouseMove={onMove} onMouseLeave={() => { rx.set(0); ry.set(0); }}
        style={{ rotateX: srx, rotateY: sry, transformStyle: 'preserve-3d', ...style }}
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

const quickFeatures = [
  { icon: Zap, title: 'Fast by design', desc: 'Search-as-you-type menus and a 160 ms p95 response time keep checkout quick even at peak rush.', img: '/screenshots/storefront-menu.png' },
  { icon: Clock, title: 'Ready in minutes', desc: 'Docker Compose, setup.sh and smart defaults get the whole stack running without configuration.', img: '/screenshots/admin-dashboard.png' },
  { icon: UtensilsCrossed, title: 'Built around your menu', desc: 'Modifiers, crusts, combos, taxes and offers are data — not code changes.', img: '/screenshots/admin-catalog.png' },
];

const useCases = [
  { key: 'Restaurants', icon: UtensilsCrossed, title: 'Restaurants', desc: 'Full menu, modifiers, crusts and combos with live pricing and kitchen workflow.', img: '/screenshots/admin-dashboard.png' },
  { key: 'Cafés', icon: Coffee, title: 'Cafés and bakeries', desc: 'Counter pickup, quick orders and a compact POS for high-volume service.', img: '/screenshots/admin-pos.png' },
  { key: 'Cloud kitchens', icon: Cloud, title: 'Cloud kitchens', desc: 'Multiple outlets from one database, with role-based access for each kitchen.', img: '/screenshots/admin-analytics.png' },
  { key: 'Food trucks', icon: Truck, title: 'Food trucks and stalls', desc: 'A shareable ordering link and WhatsApp notifications without a marketplace listing.', img: '/screenshots/campaign-customers.png' },
];

const capabilities = [
  { icon: MessageSquare, title: 'WhatsApp ordering', desc: 'Customers order on the number they already use.', img: '/screenshots/admin-chats.png' },
  { icon: Layout, title: 'Live admin dashboard', desc: 'Order queue, menu editor, chat and analytics in one place.', img: '/screenshots/admin-dashboard.png' },
  { icon: Bell, title: 'Automatic notifications', desc: 'Confirmations and delivery alerts go out over WhatsApp.', img: '/screenshots/campaign-templates.png' },
  { icon: Users, title: 'Team roles', desc: 'Owner, manager, kitchen and viewer see only what they need.', img: '/screenshots/admin-settings.png' },
  { icon: BarChart3, title: 'Campaign runner', desc: 'Bulk messages to tagged segments with live delivery progress.', img: '/screenshots/campaign-dashboard.png' },
  { icon: Smartphone, title: 'Installable storefront', desc: 'A fast web menu with cart, checkout and order tracking.', img: '/screenshots/storefront-home.png' },
];

const useCaseHighlights: Record<string, string[]> = {
  Restaurants: ['WhatsApp ordering', 'Live admin dashboard', 'Installable storefront'],
  Cafés: ['Team roles', 'Live admin dashboard', 'Installable storefront'],
  'Cloud kitchens': ['Team roles', 'Campaign runner', 'WhatsApp ordering'],
  'Food trucks': ['WhatsApp ordering', 'Campaign runner', 'Installable storefront'],
};

const technology = ['Go 1.27', 'React 19', 'PostgreSQL 16', 'Evolution GO', 'Docker', 'Caddy', 'Vercel', 'Northflank'];
const stats = [
  { label: 'Peak throughput', value: 13.7, decimals: 1, suffix: 'k RPS', icon: Zap },
  { label: 'Response time p95', value: 160, suffix: ' ms', icon: Gauge },
  { label: 'Concurrent shoppers', value: 1000, suffix: '', icon: Globe2 },
  { label: 'Open advisories', value: 0, suffix: '', icon: ShieldCheck },
];

const navLinks = [
  ['Features', '#features'], ['Built for you', '#use-cases'], ['Screenshots', '#screenshots'],
  ['Get started', '#steps'], ['Pricing', '#pricing'], ['FAQ', '#faq'],
];

const steps = [
  { num: '1', title: 'Clone and configure', desc: 'setup.sh generates the secrets and writes .env. It prints your admin key once.' },
  { num: '2', title: 'Start the stack', desc: 'docker compose up -d starts PostgreSQL, the WhatsApp gateway, the API, the site and campaigns.' },
  { num: '3', title: 'Pair WhatsApp and go', desc: 'Scan the QR code, add your menu, share your link. You are taking orders.' },
];

const comparisons = [
  { feature: 'Commission per order', ocp: 'None — you keep the revenue', other: '25-30% per order' },
  { feature: 'Monthly platform fee', ocp: 'None — AGPL-3.0 licensed', other: '₹2,000-5,000/month' },
  { feature: 'Customer data', ocp: 'Yours, in your database', other: 'Held on their platform' },
  { feature: 'WhatsApp marketing', ocp: 'Campaign runner included', other: 'Extra tool or unavailable' },
  { feature: 'Branding', ocp: 'Your name and your domain', other: 'Their brand on your page' },
  { feature: 'Source code', ocp: 'Full source, self-hosted', other: 'Closed platform' },
];

const faqs = [
  { q: 'Is it really free?', a: 'Yes. The code is AGPL-3.0 licensed with no license fee or per-order commission. You pay only for the server or cloud resources you choose. The recommended Northflank path stays under its $20 monthly free Sandbox cap.' },
  { q: 'Do I need a WhatsApp business account?', a: 'You need a phone number and the bundled Evolution GO gateway to receive OTP logins and order notifications. Without pairing it the storefront still works, but OTP messages are written to the server log instead of arriving on WhatsApp.' },
  { q: 'Can I use my own domain and brand?', a: 'Yes. Brand colors, logo, fonts, pages, banners and footer are editable in the admin dashboard. Tenant resolution supports verified custom domains and subdomains of your base domain.' },
  { q: 'Does it support multiple outlets or restaurants?', a: 'The schema models organizations, restaurants and outlets with roles and per-outlet assignments. A single restaurant with several outlets works today; strict multi-tenant SaaS mode needs additional hardening before production use.' },
  { q: 'What do I need to deploy it?', a: 'Docker and Docker Compose for the recommended path, plus about 15 environment values that setup.sh generates for you. For public hosting you also point DNS at your server and set CORS_ALLOWED_ORIGINS.' },
];

/* ──────────────── nimbus footer toppings ──────────────── */

const NIMBUS_SPEED = 3;
const NIMBUS_BASE_SIZE = 96;
const nimbusPizzas = [
  { src: '/screenshots/topping-pizza-slice.png', left: 6, drift: 54, size: 1.0, duration: 1.0, delay: 0.0, spin: 210, startAngle: -18 },
  { src: '/screenshots/topping-tomato.webp', left: 18, drift: -62, size: 0.72, duration: 1.28, delay: 0.7, spin: -280, startAngle: 24 },
  { src: '/screenshots/topping-pizza-whole.png', left: 32, drift: 44, size: 0.6, duration: 1.12, delay: 1.6, spin: 320, startAngle: 8 },
  { src: '/screenshots/topping-tomato.webp', left: 68, drift: -50, size: 0.64, duration: 1.45, delay: 0.35, spin: -190, startAngle: -32 },
  { src: '/screenshots/topping-pizza-slice.png', left: 84, drift: 58, size: 1.05, duration: 1.18, delay: 2.2, spin: 260, startAngle: 16 },
  { src: '/screenshots/topping-pizza-whole.png', left: 94, drift: -46, size: 0.78, duration: 1.34, delay: 1.15, spin: -240, startAngle: -10 },
];

/* ──────────────── live order flow ──────────────── */

function LiveOrderFlow() {
  const [step, setStep] = useState(1);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || paused) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % 4), 2800);
    return () => window.clearInterval(id);
  }, [reduce, paused]);

  const stages = ['Placed', 'Confirmed', 'Preparing', 'Out for delivery'];
  const times = ['7:12 pm', '7:13 pm', '7:19 pm', '7:41 pm'];
  const replies = [
    'Order received. Confirming your items now.',
    'Confirmed — ₹570. We are preparing your order.',
    'Your order is packed and ready for dispatch.',
    'Out for delivery. Arriving in about 12 minutes.',
  ];
  const details = [
    'Customer confirms the cart and shares a delivery address.',
    'Payment and address are verified; the ticket enters the queue.',
    'Kitchen sees the items, modifiers and notes on one screen.',
    'Rider gets the pickup and the customer gets a live link.',
  ];

  return (
    <div className="rounded-lg border border-white/15 bg-white/[0.06] p-4 backdrop-blur-xl sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="eyebrow text-white/70">One order, every surface</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 caption-mono text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-[#fb923c]" /> SSE live
          </span>
          <button type="button" onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Resume the order updates' : 'Pause the order updates'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/75 transition-colors hover:border-[#fb923c] hover:text-white">
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col rounded border border-white/10 bg-[#0b141a] p-4"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
          <div className="-mx-4 -mt-4 mb-4 flex items-center gap-3 rounded-t border-b border-white/5 bg-[#1f2c34] px-4 py-3">
            <img src="/brand-avatar.svg" alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">Orange Cheese Pizza</p>
              <p className="text-xs text-[#8696a0]">online</p>
            </div>
          </div>
          <div className="relative z-10 mt-1 space-y-3">
            <div className="max-w-[86%] rounded-lg rounded-tl-none bg-[#202c33] p-3 text-sm leading-relaxed text-[#e9edef]">
              2 × Cheese &amp; Corn Pizza<br />Delivery: FLT 301, Shanti Nagar
              <span className="mt-1 block text-right text-[10px] text-[#8696a0]">7:12 pm</span>
            </div>
            <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="ml-auto max-w-[86%] rounded-lg rounded-tr-none bg-[#005c4b] p-3 text-sm leading-relaxed text-[#e9edef]">
              {replies[step]}
              <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white">
                {times[step]} <CheckCheck size={13} className="text-[#53bdeb]" />
              </span>
            </motion.div>
          </div>
          <AnimatePresence mode="wait">
            <motion.p key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="relative z-10 mt-auto pt-4 text-xs leading-relaxed text-[#8696a0]">
              <span className="caption-mono mr-2 text-[#00a884]">{stages[step]}</span>
              {details[step]}
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="rounded border border-white/10 bg-white p-5 text-[#212121]">
          <div className="flex items-start justify-between border-b border-[#e5e7eb] pb-3">
            <div>
              <p className="caption-mono text-[#616161]">Live ticket</p>
              <p className="font-heading text-lg text-[#212121]">ORD-20261117-0126</p>
            </div>
            <motion.span key={stages[step]} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="whitespace-nowrap rounded bg-[#fff7ed] px-2 py-1 caption-mono text-[#7c2d12]">
              {stages[step]}
            </motion.span>
          </div>
          <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-[#e5e7eb]">
            <div className="h-full rounded-full bg-[#c2410c] transition-[width] duration-500" style={{ width: `${((step + 1) / 4) * 100}%` }} />
          </div>
          <p className="mt-2 caption-mono text-[#616161]">Step {step + 1} of 4 · click any status to explore</p>
          <div className="mt-3 space-y-1">
            {stages.map((s, i) => (
              <button key={s} type="button" onClick={() => setStep(i)} aria-current={i === step}
                className={`flex w-full items-center gap-3 rounded px-2 py-2 text-left transition-colors ${i === step ? 'bg-[#fff7ed]' : 'hover:bg-[#faf7f4]'}`}>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 transition-colors duration-500 ${i <= step ? 'border-[#ea580c] bg-[#c2410c]' : 'border-[#d8cdc4] bg-white'}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${i <= step ? 'text-[#212121]' : 'text-[#616161]'}`}>{s}</span>
                  <span className="block text-xs text-[#616161]">{details[i]}</span>
                </span>
                <span className="caption-mono shrink-0 text-[#616161]">{i <= step ? times[i] : '—'}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-between border-t border-[#e5e7eb] pt-3 text-sm">
            <span className="text-[#616161]">2 × Cheese &amp; Corn</span>
            <span className="font-medium text-[#212121]">₹570</span>
          </div>
        </div>
      </div>
      <p className="caption-mono mt-4 text-center text-white/75">Storefront, WhatsApp and admin share one database and one tenant model</p>
    </div>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto max-w-3xl divide-y divide-[#e5e7eb] border-y border-[#e5e7eb]">
      {faqs.map((f, i) => (
        <div key={f.q}>
          <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-2 py-5 text-left text-base font-medium text-[#212121]">
            {f.q}
            <motion.span animate={{ rotate: open === i ? 180 : 0 }} className="text-[#616161]"><ChevronDown size={16} /></motion.span>
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                <p className="max-w-2xl px-2 pb-5 text-sm leading-relaxed text-[#5a5a5a]">{f.a}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

/* ──────────────── page ──────────────── */

export default function Landing() {
  const social = useSocial();
  const seo = useSEO();
  const restaurantName = useRestaurantName();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stars, setStars] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [useCaseIndex, setUseCaseIndex] = useState(0);
  const [useCasePaused, setUseCasePaused] = useState(false);
  const [caseDirection, setCaseDirection] = useState(1);
  const caseRef = useRef<HTMLElement>(null);
  const caseInView = useInView(caseRef, { margin: '-80px' });
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, restDelta: 0.001 });
  const cursorX = useMotionValue(-600);
  const cursorY = useMotionValue(-600);
  const smoothX = useSpring(cursorX, { stiffness: 90, damping: 22 });
  const smoothY = useSpring(cursorY, { stiffness: 90, damping: 22 });
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${smoothX}px ${smoothY}px, rgba(234,88,12,0.08), transparent 70%)`;

  const heroRef = useRef<HTMLElement>(null);
  const fogRef = useRef<HTMLDivElement>(null);
  const nimbusRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroInView = useInView(heroRef, { margin: '0px' });
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const reduceData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  const reduceMotion = Boolean(useReducedMotion());
  const demoY = useTransform(heroProgress, [0, 1], reduceMotion ? [0, 0] : [0, 90]);
  const copyY = useTransform(heroProgress, [0, 1], reduceMotion ? [0, 0] : [0, 48]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const move = (e: globalThis.MouseEvent) => { cursorX.set(e.clientX); cursorY.set(e.clientY); };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [cursorX, cursorY]);

  useEffect(() => {
    const controller = new AbortController();
    fetch('https://api.github.com/repos/zubershk/ocp', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { stargazers_count?: number }) => setStars(data.stargazers_count ?? null))
      .catch(() => { /* keep the static fallback */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (reduceMotion || useCasePaused || !caseInView) return;
    const id = window.setInterval(() => {
      setCaseDirection(1);
      setUseCaseIndex((i) => (i + 1) % useCases.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [reduceMotion, useCasePaused, caseInView]);

  useEffect(() => {
    if (reduceMotion || reduceData || !heroInView || !pageVisible) return;
    let disposed = false;
    let fog: { destroy: () => void } | undefined;
    (async () => {
      try {
        // @ts-ignore - vanta ships no type declarations
        const fogModule = await import('vanta/dist/vanta.fog.min');
        // @ts-ignore - three r134 ships no bundled type declarations
        const threeModule = await import('three');
        if (disposed || !fogRef.current) return;
        const createFog = fogModule.default?.default ?? fogModule.default;
        const THREE = threeModule.default ?? threeModule;
        fog = createFog({
          el: fogRef.current, THREE,
          mouseControls: true, touchControls: true, gyroControls: false,
          minHeight: 200, minWidth: 200, backgroundAlpha: 1,
          baseColor: 0x1a0f08, highlightColor: 0xfb923c,
          midtoneColor: 0xea580c, lowlightColor: 0x7c2d12,
          blurFactor: 0.56, speed: 3.6, zoom: 1.6, scale: 2, scaleMobile: 4,
        });
      } catch { /* static gradient fallback stays */ }
    })();
    return () => { disposed = true; fog?.destroy(); };
  }, [reduceMotion, reduceData, heroInView, pageVisible]);

  const heroTitle = seo.metaTitle || 'Your restaurant. Your platform. No commission';
  const heroDescription = seo.metaDescription || 'Online ordering with WhatsApp, a live admin dashboard, POS and campaigns — self-hosted, AGPL-3.0 licensed and entirely yours';
  const activeCase = useCases[useCaseIndex];
  const ActiveIcon = activeCase.icon;
  const highlights = capabilities.filter((c) => (useCaseHighlights[activeCase.key] ?? []).includes(c.title));
  const goCase = (dir: number) => { setCaseDirection(dir); setUseCaseIndex((i) => (i + dir + useCases.length) % useCases.length); };
  const jumpCase = (i: number) => { setCaseDirection(i > useCaseIndex ? 1 : -1); setUseCaseIndex(i); };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-white text-[#212121]">
      <style>{`
        @keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .marquee-track { display: flex; width: max-content; animation: marquee 36s linear infinite; }
        .marquee-track:hover { animation-play-state: paused; }
        .eyebrow { font-size: 15px; font-weight: 500; line-height: 19.5px; letter-spacing: 1.5px; text-transform: uppercase; }
        .caption-mono { font-family: 'Inconsolata', ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 18px; }
        .layered-shadow { box-shadow: 0 84px 24px rgba(0,0,0,0), 0 54px 22px rgba(0,0,0,0.01), 0 30px 18px rgba(0,0,0,0.04), 0 13px 13px rgba(0,0,0,0.08), 0 3px 7px rgba(0,0,0,0.09); }
        @media (prefers-reduced-transparency: reduce) { nav { background: #1a0f08 !important; backdrop-filter: none !important; } }
        @media (prefers-reduced-motion: reduce) { .marquee-track { animation: none !important; } }
      `}</style>

      <motion.div className="pointer-events-none fixed inset-0 z-[2]" style={{ background: spotlight }} />
      <motion.div className="fixed left-0 right-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-[#c2410c] via-[#ea580c] to-[#fb923c]" style={{ scaleX }} />

      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#1a0f08]/85 backdrop-blur-md">
        <div className="relative mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-5">
          <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#ea580c]"><span className="font-heading text-sm text-white">O</span></div>
            <span className="font-heading text-sm text-white sm:text-base">{restaurantName || 'Restaurant'}</span>
          </motion.div>
          <div className="hidden items-center gap-6 text-sm text-white/70 lg:flex">
            {navLinks.map(([label, href]) => <a key={label} href={href} className="whitespace-nowrap transition-colors hover:text-white">{label}</a>)}
          </div>
          <div className="flex items-center justify-end gap-3 sm:gap-4">
            <a href="https://github.com/zubershk/ocp" target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1.5 text-sm text-white/70 transition-colors hover:text-white xl:inline-flex"><GithubIcon size={15} /> GitHub</a>
            <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="hidden items-center gap-1.5 rounded bg-[#ea580c] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#f97316] sm:inline-flex">Get started <ArrowRight size={14} /></MagneticLink>
            <button type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white lg:hidden">
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {menuOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-white/10 bg-[#1a0f08] lg:hidden">
              <div className="mx-auto flex max-w-6xl flex-col px-5 py-3">
                {navLinks.map(([label, href]) => <a key={label} href={href} onClick={() => setMenuOpen(false)} className="border-b border-white/10 py-3 text-sm text-white last:border-0">{label}</a>)}
                <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="my-3 inline-flex items-center justify-center gap-1.5 rounded bg-[#ea580c] px-5 py-3 text-sm font-medium text-white sm:hidden">Get started <ArrowRight size={14} /></MagneticLink>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero with interactive demo */}
      <section ref={heroRef} className="relative isolate overflow-hidden bg-[#1a0f08]">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_50%_0%,rgba(234,88,12,0.35),transparent_70%),linear-gradient(160deg,#1a0f08,#2a1408_50%,#1a0f08)]" />
        <div ref={fogRef} className="absolute inset-0 -z-10" aria-hidden="true" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#1a0f08]/60 via-[#1a0f08]/40 to-[#1a0f08]/80" aria-hidden="true" />
        <div className="mx-auto max-w-5xl px-5 pb-16 pt-16 sm:pt-24">
          <motion.div style={{ y: copyY }} className="relative z-10 text-center">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-6 inline-flex items-center gap-2 rounded border border-white/20 px-3 py-1.5 eyebrow text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[#fb923c]" /> Open source · Self-hosted · No commission
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.05, ease: [0.16, 1, 0.3, 1] as const }} className="mx-auto font-heading text-white">
              {heroTitle.replace(/\s*No commission\.?$/i, '')}<span className="italic text-[#fb923c]"> No commission</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.12 }} className="mx-auto mt-5 max-w-2xl text-lg text-white/70">
              {heroDescription}
            </motion.p>
          </motion.div>
          <motion.div style={{ y: demoY }} className="relative z-10 mx-auto mt-12 max-w-3xl">
            <motion.div initial={{ opacity: 0, scale: 0.97, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] as const }} className="layered-shadow">
              <LiveOrderFlow />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.32 }} className="relative z-10 mt-10 flex flex-wrap justify-center gap-3">
            <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="inline-flex items-center gap-2 rounded bg-[#ea580c] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#f97316]">Get started <ArrowRight size={15} /></MagneticLink>
            <MagneticLink href="#screenshots" className="inline-flex items-center gap-2 rounded border border-white/30 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10">See the product <ArrowRight size={15} /></MagneticLink>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.42 }} className="relative z-10 mx-auto mt-12 grid max-w-3xl gap-3 sm:grid-cols-3">
            {[
              { icon: MessageSquare, title: 'Customer orders', desc: 'WhatsApp or the web menu' },
              { icon: Bell, title: 'Team is notified', desc: 'Live admin queue and alerts' },
              { icon: CheckCircle2, title: 'Order delivered', desc: 'Status updates over SSE' },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.title} className="flex items-start gap-3 rounded border border-white/15 bg-white/[0.05] p-4 backdrop-blur-md">
                  <Icon size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[#fb923c]" />
                  <div>
                    <p className="text-sm font-medium text-white">{s.title}</p>
                    <p className="mt-1 text-xs text-white/55">{s.desc}</p>
                  </div>
                </div>
              );
            })}
          </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Powered by marquee */}
      <section className="overflow-hidden border-b border-white/10 bg-[#150b05] py-6">
        <p className="eyebrow mb-5 text-center text-white/40">Powered by</p>
        <div className="marquee-track">
          {[...technology, ...technology].map((t, i) => (
            <span key={`${t}-${i}`} className="mx-6 whitespace-nowrap font-heading text-lg text-white/50">{t}</span>
          ))}
        </div>
      </section>

      {/* Next generation */}
      <section id="features" className="border-b border-[#e5e7eb] bg-white py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="eyebrow text-[#ea580c]">The next generation of ordering</p>
            <h2 className="mt-4 font-heading text-[#212121]">One system for the whole operation</h2>
            <p className="mt-4 text-base leading-relaxed text-[#616161]">OCP is a self-hosted ordering platform with WhatsApp, a live admin dashboard, POS and campaigns in one database.</p>
          </Reveal>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {quickFeatures.map((f, i) => {
              const Icon = f.icon;
              return (
                <Reveal key={f.title} delay={i * 0.08}>
                  <TiltCard className="h-full overflow-hidden rounded-lg border border-[#e5e7eb]">
                    <div className="aspect-[16/10] w-full border-b border-[#e5e7eb] bg-[#faf7f4]">
                      <img src={f.img} alt="" className="h-full w-full object-contain" />
                    </div>
                    <div className="p-6">
                      <Icon size={20} strokeWidth={1.5} className="text-[#ea580c]" />
                      <h3 className="mt-4 font-heading text-xl text-[#212121]">{f.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-[#616161]">{f.desc}</p>
                    </div>
                  </TiltCard>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Tabbed use cases */}
      <section id="use-cases" ref={caseRef} className="border-b border-[#e5e7eb] bg-[#faf7f4] py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="eyebrow text-[#ea580c]">Built for every kitchen</p>
            <h2 className="mt-4 font-heading text-[#212121]">Any food business that takes orders</h2>
            <p className="mt-4 text-base text-[#616161]">Business type, hours, payment labels and branding are configuration — not code.</p>
          </Reveal>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            {useCases.map((u, i) => (
              <button key={u.key} type="button" onClick={() => jumpCase(i)} aria-current={i === useCaseIndex}
                className={`rounded px-5 py-2.5 text-sm font-medium transition-colors ${i === useCaseIndex ? 'bg-[#ea580c] text-white' : 'border border-[#e5e7eb] bg-white text-[#616161] hover:border-[#fb923c]'}`}>
                {u.title}
              </button>
            ))}
            <button type="button" onClick={() => setUseCasePaused((p) => !p)} aria-label={useCasePaused ? 'Resume the carousel' : 'Pause the carousel'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#616161]">
              {useCasePaused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          </div>

          <div className="relative mt-8"
            onMouseEnter={() => setUseCasePaused(true)} onMouseLeave={() => setUseCasePaused(false)}
            onFocus={() => setUseCasePaused(true)} onBlur={() => setUseCasePaused(false)}
            role="region" aria-label="Business type carousel">
            <AnimatePresence mode="wait" custom={caseDirection} initial={false}>
              <motion.div key={activeCase.key} custom={caseDirection}
                variants={{
                  enter: (d: number) => ({ x: d > 0 ? 90 : -90, opacity: 0 }),
                  center: { x: 0, opacity: 1 },
                  exit: (d: number) => ({ x: d > 0 ? -90 : 90, opacity: 0 }),
                }}
                initial="enter" animate="center" exit="exit"
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden rounded-lg bg-gradient-to-br from-[#c2410c] via-[#ea580c] to-[#f97316]">
                <div className="grid lg:grid-cols-2">
                  <img src={activeCase.img} alt="" className="h-64 w-full object-cover sm:h-80 lg:h-[26rem]" />
                  <div className="p-8 sm:p-12">
                    <ActiveIcon size={30} strokeWidth={1.5} className="text-white" />
                    <p className="caption-mono mt-6 text-white/60">0{useCaseIndex + 1} / 0{useCases.length}</p>
                    <h3 className="mt-3 font-heading text-3xl text-white sm:text-4xl">{activeCase.title}</h3>
                    <p className="mt-4 max-w-lg text-base leading-relaxed text-white/85">{activeCase.desc}</p>
                    <ul className="mt-8 space-y-3">
                      {highlights.map((h) => {
                        const Icon = h.icon;
                        return (
                          <li key={h.title} className="flex items-start gap-3 border-t border-white/20 pt-3">
                            <Icon size={17} strokeWidth={1.5} className="mt-0.5 shrink-0 text-white" />
                            <div><p className="text-sm font-medium text-white">{h.title}</p><p className="text-sm text-white/70">{h.desc}</p></div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
            <button type="button" onClick={() => goCase(-1)} aria-label="Previous business type"
              className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-[#1a0f08]/40 text-white backdrop-blur-md transition-colors hover:bg-[#1a0f08]/70">
              <ChevronLeft size={20} />
            </button>
            <button type="button" onClick={() => goCase(1)} aria-label="Next business type"
              className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-[#1a0f08]/40 text-white backdrop-blur-md transition-colors hover:bg-[#1a0f08]/70">
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="mt-6 flex items-center justify-center gap-3">
            {useCases.map((u, i) => (
              <button key={u.key} type="button" onClick={() => jumpCase(i)} aria-label={`Show ${u.title}`} aria-current={i === useCaseIndex}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === useCaseIndex ? 'w-10 bg-[#ea580c]' : 'w-4 bg-[#d8cdc4] hover:bg-[#fb923c]'}`} />
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots */}
      <section id="screenshots" className="border-b border-[#e5e7eb] bg-white py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="eyebrow text-[#ea580c]">The real product</p>
            <h2 className="mt-4 font-heading text-[#212121]">See every screen</h2>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {['admin-dashboard', 'storefront-menu', 'campaign-dashboard', 'admin-pos', 'storefront-checkout', 'admin-analytics'].map((name, i) => (
              <Reveal key={name} delay={i * 0.05}>
                <motion.figure whileHover={{ y: -6 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }} className="overflow-hidden rounded-lg border border-[#e5e7eb]">
                  <img src={`/screenshots/${name}.png`} alt={`OCP ${name.replace(/-/g, ' ')} screen`} className="h-56 w-full border-b border-[#e5e7eb] object-cover object-top" />
                  <figcaption className="px-4 py-3 text-sm text-[#212121]">{name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</figcaption>
                </motion.figure>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-8 text-center text-sm text-[#898989]">All 21 screenshots are in the <a className="text-[#212121] underline underline-offset-2" href="https://github.com/zubershk/ocp#readme" target="_blank" rel="noopener noreferrer">README</a></Reveal>
        </div>
      </section>

      {/* Getting started */}
      <section id="steps" className="border-b border-[#e5e7eb] bg-[#faf7f4] py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="eyebrow text-[#ea580c]">Getting started</p>
            <h2 className="mt-4 font-heading text-[#212121]">From clone to first order</h2>
          </Reveal>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal key={s.num} delay={i * 0.1}>
                <div className="relative border-t-2 border-[#ea580c] pt-6">
                  <span className="absolute -top-2 left-0 h-3 w-3 rounded-full bg-[#ea580c]" />
                  <span className="caption-mono text-[#898989]">{s.num}</span>
                  <h3 className="mt-3 font-heading text-xl text-[#212121]">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#616161]">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section id="comparison" className="border-b border-[#e5e7eb] bg-[#faf7f4] py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.4fr] lg:gap-16">
            <Reveal className="self-start lg:sticky lg:top-24">
              <p className="eyebrow text-[#ea580c]">Why self-host</p>
              <h2 className="mt-4 font-heading text-[#212121]">Keep the revenue and the relationship</h2>
              <p className="mt-4 text-base leading-relaxed text-[#616161]">Marketplaces own the channel and take a cut of every order. OCP gives you the whole stack — and the customer relationship that comes with it.</p>
              <ul className="mt-8 space-y-5">
                {[
                  ['No platform commission', 'Every rupee stays with your restaurant.'],
                  ['Your customer data', 'Orders and contacts live in your database.'],
                  ['Your brand, your domain', 'White-label the storefront and dashboard.'],
                ].map(([title, desc]) => (
                  <li key={title} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#ea580c]"><CheckCircle2 size={14} className="text-white" /></span>
                    <div>
                      <p className="text-sm font-medium text-[#212121]">{title}</p>
                      <p className="mt-1 text-sm text-[#616161]">{desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="mt-9 inline-flex items-center gap-2 rounded bg-[#17171c] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#3f3f46]">
                Own your platform <ArrowRight size={15} />
              </MagneticLink>
            </Reveal>

            <Reveal className="overflow-hidden rounded-lg border border-[#e5e7eb] bg-white">
              <div className="hidden grid-cols-[1.1fr_1fr_1fr] gap-4 border-b border-[#e5e7eb] bg-[#fffaf6] px-5 py-4 sm:grid">
                <span className="eyebrow text-[#898989]">Area</span>
                <span className="eyebrow text-[#ea580c]">OCP</span>
                <span className="eyebrow text-[#898989]">Marketplace</span>
              </div>
              {comparisons.map((c, i) => (
                <div key={c.feature} className={`grid gap-3 border-b border-[#e5e7eb] px-5 py-5 last:border-0 sm:grid-cols-[1.1fr_1fr_1fr] sm:gap-4 ${i % 2 ? 'bg-[#fdfbf9]' : 'bg-white'}`}>
                  <p className="text-sm font-medium text-[#212121]">{c.feature}</p>
                  <div>
                    <p className="mb-1 text-xs text-[#898989] sm:hidden">OCP</p>
                    <span className="inline-flex items-start gap-2 text-sm font-medium text-[#c2410c]"><CheckCircle2 size={15} className="mt-0.5 shrink-0" /> {c.ocp}</span>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-[#898989] sm:hidden">Marketplace</p>
                    <span className="inline-flex items-start gap-2 text-sm text-[#898989]"><XCircle size={15} className="mt-0.5 shrink-0" /> {c.other}</span>
                  </div>
                </div>
              ))}
            </Reveal>
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section className="relative overflow-hidden bg-[radial-gradient(60%_80%_at_50%_0%,rgba(234,88,12,0.35),transparent_70%),linear-gradient(160deg,#1a0f08,#2a1408)] py-20">
        <div className="relative mx-auto max-w-6xl px-5">
          <Reveal className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <p className="eyebrow text-[#fb923c]">Nothing good is built alone</p>
              <h2 className="mt-4 max-w-lg font-heading text-white">Measured, not claimed</h2>
              <p className="mt-3 max-w-lg text-sm text-white/60">Reproducible results from the bundled 1,000-user harness.</p>
              <MagneticLink href="https://github.com/zubershk/ocp/blob/master/docs/LOAD_TEST.md" external className="mt-6 inline-flex items-center gap-2 rounded bg-[#ea580c] px-5 py-3 text-sm font-medium text-white">Read the methodology <ArrowRight size={15} /></MagneticLink>
            </div>
            <div className="grid w-full grid-cols-2 gap-6 sm:w-auto sm:grid-cols-2">
              {stats.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="text-center">
                    <Icon size={18} className="mx-auto text-[#fb923c]" />
                    <p className="mt-3 font-heading text-3xl text-white"><CountUp to={s.value} decimals={s.decimals} suffix={s.suffix} /></p>
                    <p className="caption-mono mt-1 text-white/50">{s.label}</p>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Community */}
      <section className="border-b border-[#e5e7eb] bg-[#faf7f4] py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
            <Reveal className="self-start lg:sticky lg:top-24">
              <p className="eyebrow text-[#ea580c]">Join the community</p>
              <h2 className="mt-4 font-heading text-[#212121]">Built in the open, maintained in the open</h2>
              <p className="mt-4 text-base leading-relaxed text-[#616161]">AGPL-3.0 licensed, with a documented architecture, a production checklist and CI that checks every module.</p>
              <div className="mt-8 grid grid-cols-3 gap-4 border-y border-[#e5e7eb] py-5">
                {[['License', 'AGPL-3.0'], ['Screenshots', '21'], ['Checks', 'Green CI']].map(([label, value]) => (
                  <div key={label}>
                    <p className="font-heading text-xl text-[#212121]">{value}</p>
                    <p className="caption-mono mt-1 text-[#898989]">{label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm leading-relaxed text-[#616161]">If you want to improve food ordering software, there is room to do it here.</p>
            </Reveal>
            <div className="space-y-5">
              <Reveal>
                <TiltCard className="group flex h-full flex-col gap-5 rounded-lg border border-[#e5e7eb] bg-white p-7 sm:flex-row sm:items-center">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[#fff7ed]"><GithubIcon size={28} className="text-[#ea580c]" /></div>
                  <div className="flex-1">
                    <p className="caption-mono text-[#898989]">01 · Source</p>
                    <h3 className="mt-1 font-heading text-2xl text-[#212121]">GitHub</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#616161]">Browse the source, open issues, follow releases and see the CI run on every push.</p>
                  </div>
                  <MagneticLink href="https://github.com/zubershk/ocp" external className="inline-flex shrink-0 items-center gap-2 rounded border border-[#e5e7eb] px-4 py-2.5 text-sm font-medium text-[#212121] transition-colors hover:border-[#ea580c] hover:text-[#ea580c]">View repository <ArrowRight size={15} /></MagneticLink>
                </TiltCard>
              </Reveal>
              <Reveal delay={0.1}>
                <TiltCard className="group flex h-full flex-col gap-5 rounded-lg border border-[#e5e7eb] bg-white p-7 sm:flex-row sm:items-center">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[#fff7ed]"><BookOpen size={28} strokeWidth={1.5} className="text-[#ea580c]" /></div>
                  <div className="flex-1">
                    <p className="caption-mono text-[#898989]">02 · Guide</p>
                    <h3 className="mt-1 font-heading text-2xl text-[#212121]">Contributing</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#616161]">Localization, payment gateways, webhooks, a versioned API and onboarding need help.</p>
                  </div>
                  <MagneticLink href="https://github.com/zubershk/ocp/blob/master/CONTRIBUTING.md" external className="inline-flex shrink-0 items-center gap-2 rounded border border-[#e5e7eb] px-4 py-2.5 text-sm font-medium text-[#212121] transition-colors hover:border-[#ea580c] hover:text-[#ea580c]">Read the guide <ArrowRight size={15} /></MagneticLink>
                </TiltCard>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing: OCP vs Marketplace */}
      <section id="pricing" className="border-b border-[#e5e7eb] bg-white py-20">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="eyebrow text-[#ea580c]">Pricing</p>
            <h2 className="mt-4 font-heading text-[#212121]">No license fee, no commission</h2>
            <p className="mt-4 text-base text-[#616161]">The same ordering operation, two very different cost models.</p>
          </Reveal>
          <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
            <Reveal>
              <TiltCard className="layered-shadow relative h-full overflow-hidden rounded-lg bg-[#1a0f08] p-8 sm:p-10">
                <span className="absolute inset-x-0 top-0 h-1 bg-[#ea580c]" />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-heading text-2xl text-white">OCP</h3>
                  <span className="rounded bg-[#ea580c] px-3 py-1 caption-mono text-white">Self-hosted</span>
                </div>
                <div className="mt-6 flex items-end gap-2"><span className="font-heading text-6xl text-white">₹0</span><span className="pb-2 caption-mono text-white/60">forever</span></div>
                <p className="mt-3 text-sm text-white/70">Run it on your own server. You keep the revenue and the customer relationship.</p>
                <div className="my-8 h-px bg-white/15" />
                <ul className="grid gap-3 text-sm text-white sm:grid-cols-2">
                  {['No per-order commission', 'Unlimited orders', 'WhatsApp campaigns', 'Full source code', 'Team roles and audit log', 'POS and printing'].map((f) => <li key={f} className="flex items-center gap-2"><CheckCircle2 size={15} className="shrink-0 text-[#fb923c]" /> {f}</li>)}
                </ul>
                <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="mt-9 block rounded bg-[#ea580c] px-5 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-[#f97316]">Get started</MagneticLink>
              </TiltCard>
            </Reveal>

            <div className="flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-[#ea580c] font-heading text-sm font-semibold text-white shadow-md">VS</span>
            </div>

            <Reveal delay={0.1}>
              <TiltCard className="relative h-full overflow-hidden rounded-lg border border-[#e5e7eb] bg-white p-8 sm:p-10">
                <span className="absolute inset-x-0 top-0 h-1 bg-[#d8cdc4]" />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-heading text-2xl text-[#212121]">Marketplace</h3>
                  <span className="rounded bg-[#faf7f4] px-3 py-1 caption-mono text-[#898989]">Typical platform</span>
                </div>
                <div className="mt-6 flex items-end gap-2"><span className="font-heading text-6xl text-[#212121]">₹999+</span><span className="pb-2 caption-mono text-[#898989]">per month</span></div>
                <p className="mt-3 text-sm text-[#616161]">Plus 25-30% on every order, for the privilege of using their channel.</p>
                <div className="my-8 h-px bg-[#e5e7eb]" />
                <ul className="grid gap-3 text-sm text-[#898989] sm:grid-cols-2">
                  {['Commission on every order', 'Customer data on their platform', 'Their brand on your page', 'Campaigns cost extra', 'Closed source', 'No full data export'].map((f) => <li key={f} className="flex items-center gap-2"><XCircle size={15} className="shrink-0 text-[#b8aea5]" /> {f}</li>)}
                </ul>
                <MagneticLink href="#comparison" className="mt-9 block rounded border border-[#e5e7eb] px-5 py-3 text-center text-sm font-medium text-[#616161] transition-colors hover:border-[#ea580c] hover:text-[#ea580c]">See the full comparison</MagneticLink>
              </TiltCard>
            </Reveal>
          </div>
          <Reveal className="mt-8 text-center text-sm text-[#898989]">No license fee. No per-order commission. <a className="text-[#212121] underline underline-offset-2" href="#comparison">Compare all features</a></Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-b border-[#e5e7eb] bg-white py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.4fr] lg:gap-16">
            <Reveal className="self-start lg:sticky lg:top-24">
              <p className="eyebrow text-[#ea580c]">Questions</p>
              <h2 className="mt-4 font-heading text-[#212121]">The things people ask first</h2>
              <p className="mt-4 text-base leading-relaxed text-[#616161]">A few quick answers about licensing, deployment and what you can customise.</p>
              <div className="mt-8 rounded-lg border border-[#e5e7eb] bg-[#faf7f4] p-6">
                <p className="font-heading text-lg text-[#212121]">Still have a question?</p>
                <p className="mt-2 text-sm leading-relaxed text-[#616161]">Open an issue on GitHub and the maintainers will answer in the open.</p>
                <MagneticLink href="https://github.com/zubershk/ocp/issues" external className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[#ea580c]">Ask on GitHub <ArrowRight size={15} /></MagneticLink>
              </div>
            </Reveal>
            <Reveal><Faq /></Reveal>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-[radial-gradient(60%_80%_at_50%_0%,rgba(234,88,12,0.4),transparent_70%),linear-gradient(160deg,#1a0f08,#2a1408)] py-28 sm:py-36">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden" aria-hidden="true">
          <span className="select-none font-heading text-white/[0.04]" style={{ fontSize: 'clamp(12rem, 28vw, 26rem)', lineHeight: 1 }}>OCP</span>
        </div>
        <div className="relative mx-auto max-w-6xl px-5">
          <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-20">
            <Reveal>
              <p className="eyebrow text-[#fb923c]">Start today</p>
              <h2 className="mt-5 font-heading text-white" style={{ fontSize: 'clamp(2.5rem, 5.5vw, 4.75rem)', lineHeight: 1.04, letterSpacing: '-0.03em' }}>
                Own the whole ordering flow
              </h2>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
                One repository, one database, no platform taking a cut of every order. Bring your menu, your number and your domain — the rest is already built.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="inline-flex items-center gap-2 rounded bg-[#ea580c] px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-[#f97316]">
                  Get started <ArrowRight size={16} />
                </MagneticLink>
                <MagneticLink href="https://github.com/zubershk/ocp#readme" external className="inline-flex items-center gap-2 rounded border border-white/25 px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-white/10">
                  Read the docs <ArrowRight size={16} />
                </MagneticLink>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/60">
                {['No license fee', 'AGPL-3.0', 'No per-order commission', 'Your own domain'].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2"><CheckCircle2 size={15} className="text-[#fb923c]" /> {item}</span>
                ))}
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="rounded-lg border border-white/15 bg-white/[0.06] p-6 backdrop-blur-xl sm:p-8">
                <div className="flex items-center gap-2">
                  <Terminal size={16} className="text-[#fb923c]" />
                  <p className="caption-mono text-white/50">quick start</p>
                </div>
                <div className="mt-5 space-y-2 font-mono text-xs leading-6 text-white/80 sm:text-sm">
                  <p><span className="text-[#fb923c]">$</span> git clone https://github.com/zubershk/ocp.git</p>
                  <p><span className="text-[#fb923c]">$</span> cd ocp &amp;&amp; bash setup.sh</p>
                  <p><span className="text-[#fb923c]">$</span> docker compose up -d</p>
                  <p className="text-[#8fd3b6]">✓ Ready at localhost:3000</p>
                </div>
                <div className="mt-6 border-t border-white/10 pt-5">
                  <p className="text-sm leading-relaxed text-white/65">Three commands from a fresh machine to a working storefront, WhatsApp bot and admin dashboard.</p>
                  <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#fdba74]">See the setup guide <ArrowRight size={15} /></MagneticLink>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Footer: poster wordmark + pizza-only Nimbus flight */}
      <footer className="relative isolate overflow-hidden bg-gradient-to-br from-[#c2410c] via-[#ea580c] to-[#f97316]">
        <div ref={nimbusRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {nimbusPizzas.map((p, i) => {
            const size = NIMBUS_BASE_SIZE * p.size;
            const duration = (2.6 * p.duration) / (NIMBUS_SPEED / 3);
            const delay = (p.delay * 3) / NIMBUS_SPEED;
            const bounce = 125 + size * 0.55;
            const times = [0, 0.38, 0.58, 0.78, 1];
            return (
              <motion.img key={i} src={p.src} alt=""
                className="absolute -bottom-3"
                style={{ left: `${p.left}%`, width: size, height: size, transform: `rotate(${p.startAngle}deg)` }}
                animate={reduceMotion ? undefined : {
                  x: [0, p.drift, -p.drift * 0.65, p.drift * 0.8, 0],
                  y: [0, -bounce, 0, -bounce * 0.4, 0],
                  rotate: [p.startAngle, p.startAngle + p.spin, p.startAngle + p.spin * 1.4, p.startAngle + p.spin * 1.7, p.startAngle + p.spin * 2],
                  scale: [0.85, 1, 0.94, 1, 0.85],
                }}
                transition={reduceMotion ? undefined : {
                  x: { duration, delay, repeat: Infinity, repeatDelay: 0.2, times, ease: 'easeInOut' },
                  y: { duration, delay, repeat: Infinity, repeatDelay: 0.2, times, ease: ['easeOut', 'easeIn', 'easeOut', 'easeIn'] },
                  rotate: { duration, delay, repeat: Infinity, repeatDelay: 0.2, times, ease: 'linear' },
                  scale: { duration, delay, repeat: Infinity, repeatDelay: 0.2, times, ease: 'easeInOut' },
                }} />
            );
          })}
        </div>
        <div className="relative z-10 mx-auto max-w-6xl px-5 pb-10 pt-8 text-white sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="inline-block rounded bg-[#1a0f08]/25 px-2 py-1 text-xs text-white">Copyright 2026, OCP</p>
              <p className="mt-3 max-w-sm text-xs leading-relaxed text-white/85">Self-hosted food ordering with WhatsApp, POS and campaigns. AGPL-3.0 licensed.</p>
            </div>
            <a href="https://github.com/zubershk/ocp/blob/master/LICENSE" target="_blank" rel="noopener noreferrer" className="self-start rounded bg-[#1a0f08]/25 px-2 py-1 text-xs text-white underline underline-offset-2">AGPL-3.0 license</a>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="eyebrow text-white/60">Product</p>
              <ul className="mt-4 space-y-2 text-sm text-white/90">
                <li><a href="#features" className="transition-colors hover:text-[#fff7ed]">Features</a></li>
                <li><a href="#use-cases" className="transition-colors hover:text-[#fff7ed]">Use cases</a></li>
                <li><a href="#screenshots" className="transition-colors hover:text-[#fff7ed]">Screenshots</a></li>
                <li><a href="#pricing" className="transition-colors hover:text-[#fff7ed]">Pricing</a></li>
              </ul>
            </div>
            <div>
              <p className="eyebrow text-white/60">Resources</p>
              <ul className="mt-4 space-y-2 text-sm text-white/90">
                <li><a href="https://github.com/zubershk/ocp#readme" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#fff7ed]">Documentation</a></li>
                <li><a href="https://github.com/zubershk/ocp/blob/master/docs/DEPLOYMENT.md" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#fff7ed]">Deployment</a></li>
                <li><a href="https://github.com/zubershk/ocp/blob/master/docs/LOAD_TEST.md" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#fff7ed]">Load test</a></li>
                <li><a href="https://github.com/zubershk/ocp/blob/master/docs/PRODUCTION_CHECKLIST.md" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#fff7ed]">Production checklist</a></li>
              </ul>
            </div>
            <div>
              <p className="eyebrow text-white/60">Community</p>
              <ul className="mt-4 space-y-2 text-sm text-white/90">
                <li><a href="https://github.com/zubershk/ocp" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#fff7ed]">GitHub</a></li>
                <li><a href="https://github.com/zubershk/ocp/issues" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#fff7ed]">Issues</a></li>
                <li><a href="https://github.com/zubershk/ocp/blob/master/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#fff7ed]">Contributing</a></li>
                <li><a href="https://github.com/zubershk/ocp/blob/master/SECURITY.md" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#fff7ed]">Security</a></li>
              </ul>
            </div>
            <div>
              <p className="eyebrow text-white/60">Follow</p>
              <ul className="mt-4 space-y-2 text-sm text-white/90">
                {social.instagram && <li><a href={social.instagram} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#fff7ed]">Instagram</a></li>}
                {social.facebook && <li><a href={social.facebook} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#fff7ed]">Facebook</a></li>}
                {social.twitter && <li><a href={social.twitter} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#fff7ed]">Twitter</a></li>}
                {social.youtube && <li><a href={social.youtube} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#fff7ed]">YouTube</a></li>}
                {social.whatsapp && <li><a href={social.whatsapp} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#fff7ed]">WhatsApp</a></li>}
                {!social.instagram && !social.facebook && !social.twitter && !social.youtube && !social.whatsapp && <li><a href="https://github.com/zubershk/ocp" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#fff7ed]">GitHub</a></li>}
              </ul>
            </div>
          </div>
        </div>
        <div className="relative z-10 flex justify-center overflow-hidden">
          <span className="select-none font-heading font-semibold leading-[0.72] tracking-[-0.08em] text-white"
            style={{ fontSize: 'clamp(7rem, 31vw, 30rem)', marginBottom: '-0.14em' }}>
            OCP
          </span>
        </div>
      </footer>
    </div>
  );
}
