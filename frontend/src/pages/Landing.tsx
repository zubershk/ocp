import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import {
  motion, AnimatePresence, useScroll, useSpring, useInView, useMotionValue,
  useMotionTemplate, useTransform, animate, useReducedMotion,
} from 'framer-motion';
import {
  ArrowRight, MessageSquare, BarChart3, CheckCircle2, XCircle,
  Terminal, Layout, Smartphone, Bell, Users, GitFork, ShieldCheck,
  BookOpen, Heart, Zap, Gauge, Globe2, LockKeyhole, UtensilsCrossed,
  Coffee, Cloud, Truck, ChevronDown, Menu, X, Pause, Play,
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
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 9);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 9);
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

const orderTimeline = [
  { label: 'Order placed', time: '7:12 pm' },
  { label: 'Confirmed', time: '7:13 pm' },
  { label: 'Preparing', time: '7:19 pm' },
  { label: 'Out for delivery', time: '7:41 pm' },
  { label: 'Delivered', time: '7:58 pm' },
];

function LiveOrderTicket() {
  const [active, setActive] = useState(2);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % orderTimeline.length), 2800);
    return () => window.clearInterval(id);
  }, [reduce]);
  return (
    <div className="relative h-full">
      <div className="webflow-lift flex h-full flex-col rounded-lg border border-[#d9d9dd] bg-white p-7">
        <div className="flex items-start justify-between border-b border-[#d9d9dd] pb-4">
          <div>
            <p className="caption-mono text-[#93939f]">Live order</p>
            <p className="mt-2 font-heading text-xl text-[#212121]">ORD-20261117-0126</p>
          </div>
          <motion.span key={orderTimeline[active].label} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="rounded bg-[#fff7ed] px-2.5 py-1 text-xs font-medium text-[#c2410c]">
            {orderTimeline[active].label}
          </motion.span>
        </div>
        <div className="mt-5 flex-1 space-y-3">
          {orderTimeline.map((s, i) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 transition-colors duration-500 ${i <= active ? 'border-[#ea580c] bg-[#ea580c]' : 'border-[#d9d9dd] bg-white'}`} />
              <span className={`flex-1 text-sm transition-colors duration-500 ${i <= active ? 'text-[#212121]' : 'text-[#a1a1aa]'}`}>{s.label}</span>
              <span className="caption-mono tabular-nums text-[#93939f]">{i <= active ? s.time : '—'}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-2 border-t border-[#d9d9dd] pt-4 text-sm">
          <div className="flex justify-between text-[#616161]"><span>2 × Cheese &amp; Corn</span><span className="tabular-nums">₹570</span></div>
          <div className="flex justify-between text-[#616161]"><span>1 × Tandoori Paneer</span><span className="tabular-nums">₹285</span></div>
          <div className="flex justify-between border-t border-[#d9d9dd] pt-2 font-medium text-[#212121]"><span>Total</span><span className="tabular-nums">₹855</span></div>
        </div>
      </div>
      <p className="caption-mono mt-3 text-center text-white/60">Statuses update live over Server-Sent Events</p>
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

// Webflow's signature five-stop chromatic category palette, mapped to OCP surfaces.
const categoryCards = [
  { label: 'Messaging', desc: 'WhatsApp ordering and notifications', bg: '#c2410c', color: '#ffffff', icon: MessageSquare },
  { label: 'Interaction', desc: 'Live admin queue and team roles', bg: '#ea580c', color: '#ffffff', icon: Layout },
  { label: 'Analytics', desc: 'Reports and campaign progress', bg: '#f97316', color: '#212121', icon: BarChart3 },
  { label: 'Infrastructure', desc: 'Self-hosted Docker deployment', bg: '#fb923c', color: '#212121', icon: Cloud },
  { label: 'Commerce', desc: 'Storefront menu, cart and checkout', bg: '#fdba74', color: '#212121', icon: Smartphone },
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

const navLinks = [
  ['Features', '#features'], ['Who it is for', '#use-cases'], ['Screenshots', '#screenshots'],
  ['Pricing', '#pricing'], ['FAQ', '#faq'], ['Maintainers', '#maintainers'],
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto max-w-3xl divide-y divide-[#d9d9dd] border-y border-[#d9d9dd]">
      {faqs.map((f, i) => (
        <div key={f.q}>
          <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-2 py-5 text-left text-base font-medium text-[#212121]">
            {f.q}
            <motion.span animate={{ rotate: open === i ? 180 : 0 }} className="text-[#93939f]"><ChevronDown size={16} /></motion.span>
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                <p className="max-w-2xl px-2 pb-5 text-sm leading-relaxed text-[#616161]">{f.a}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

const screenshots = [
  { src: '/screenshots/storefront-menu.png', alt: 'OCP storefront menu with pizza categories and prices', label: 'Storefront menu' },
  { src: '/screenshots/admin-dashboard.png', alt: 'OCP admin dashboard with live orders', label: 'Admin dashboard' },
  { src: '/screenshots/campaign-dashboard.png', alt: 'OCP campaign runner dashboard', label: 'Campaign runner' },
];

const DOCS = 'https://github.com/zubershk/ocp#readme';

/* ──────────────── connected surfaces ──────────────── */

function ConnectedSystems() {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { margin: '-80px' });
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduce || paused || !inView) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % categoryCards.length), 3200);
    return () => window.clearInterval(id);
  }, [reduce, paused, inView]);

  return (
    <section ref={sectionRef} className="border-b border-[#d9d9dd] bg-white py-16">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow text-[#616161]">One platform, five surfaces</p>
            <h2 className="mt-4 font-heading text-[#212121]">Everything connected, nothing bolted on</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#616161]">Pick a surface. Each one reads and writes the same tenant data, so an order in the storefront is already in the admin queue.</p>
          </div>
          <button type="button" onClick={() => setPaused((p) => !p)}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded border border-[#d9d9dd] px-3 py-2 text-xs font-medium text-[#616161] transition-colors hover:border-[#ea580c] hover:text-[#c2410c] sm:self-auto"
            aria-label={paused ? 'Resume the surface rotation' : 'Pause the surface rotation'}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? 'Resume' : 'Pause'}
          </button>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          {categoryCards.map((c, i) => {
            const Icon = c.icon;
            const isActive = active === i;
            return (
              <Reveal key={c.label} delay={i * 0.06}>
                <motion.button type="button" aria-pressed={isActive}
                  onFocus={() => { setActive(i); setPaused(true); }}
                  onBlur={() => setPaused(false)}
                  onClick={() => setActive(i)}
                  animate={reduce ? undefined : { y: isActive ? -4 : 0 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                  className="w-full text-left">
                  <TiltCard className="relative h-full rounded-lg p-8" style={{ backgroundColor: c.bg, color: c.color }}>
                    <div className="flex items-start justify-between">
                      <span className="caption-mono">0{i + 1}</span>
                      <span className="flex h-6 w-6 items-center justify-center">
                        {isActive && (
                          <motion.span layoutId="connected-node"
                            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                            className="h-2.5 w-2.5 rounded-full bg-current" />
                        )}
                      </span>
                    </div>
                    <Icon size={22} strokeWidth={1.5} className="mt-6" />
                    <h3 className="mt-4 font-heading text-2xl" style={{ color: c.color }}>{c.label}</h3>
                    <p className="mt-2 text-sm">{c.desc}</p>
                    <div className="mt-6 h-5">
                      <AnimatePresence initial={false}>
                        {isActive && (
                          <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                            className="caption-mono font-medium">
                            Active surface · shared tenant data
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: c.color, opacity: 0.25 }}>
                      <motion.div className="h-full w-full" style={{ backgroundColor: c.color, transformOrigin: 'left' }}
                        animate={{ scaleX: isActive ? 1 : 0 }} transition={{ duration: 0.45 }} />
                    </div>
                  </TiltCard>
                </motion.button>
              </Reveal>
            );
          })}
        </div>

        <div className="mt-7 flex items-center justify-center gap-2" aria-label="Select a platform surface">
          {categoryCards.map((c, i) => (
            <button key={c.label} type="button" aria-label={c.label} aria-pressed={active === i}
              onClick={() => setActive(i)}
              className="h-2 rounded-full transition-all duration-300"
              style={{ width: active === i ? 28 : 10, backgroundColor: active === i ? c.bg : '#d9d9dd' }} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────── component ──────────────── */

export default function Landing() {
  const social = useSocial();
  const seo = useSEO();
  const restaurantName = useRestaurantName();
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26, restDelta: 0.001 });
  const cursorX = useMotionValue(-600);
  const cursorY = useMotionValue(-600);
  const smoothX = useSpring(cursorX, { stiffness: 90, damping: 22 });
  const smoothY = useSpring(cursorY, { stiffness: 90, damping: 22 });
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${smoothX}px ${smoothY}px, rgba(234,88,12,0.07), transparent 70%)`;

  // Scroll-linked hero parallax: depth on exit, disabled for reduced motion.
  const heroRef = useRef<HTMLElement>(null);
  const fogRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const reduceMotion = Boolean(useReducedMotion());
  const mediaY = useTransform(heroProgress, [0, 1], reduceMotion ? [0, 0] : [0, 86]);
  const mediaScale = useTransform(heroProgress, [0, 1], reduceMotion ? [1, 1] : [1, 0.98]);
  const copyY = useTransform(heroProgress, [0, 1], reduceMotion ? [0, 0] : [0, 52]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const move = (e: globalThis.MouseEvent) => { cursorX.set(e.clientX); cursorY.set(e.clientY); };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [cursorX, cursorY]);

  // Vanta Fog hero background — loaded lazily; the static gradient is the fallback.
  useEffect(() => {
    if (reduceMotion) return;
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
          el: fogRef.current,
          THREE,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200,
          minWidth: 200,
          backgroundAlpha: 1,
          baseColor: 0x212121,
          highlightColor: 0xfb923c,
          midtoneColor: 0xea580c,
          lowlightColor: 0x7c2d12,
          blurFactor: 0.56,
          speed: 3.6,
          zoom: 1.6,
          scale: 2,
          scaleMobile: 4,
        });
      } catch {
        // Keep the static radial-gradient background if WebGL is unavailable.
      }
    })();

    return () => { disposed = true; fog?.destroy(); };
  }, [reduceMotion]);

  const heroTitle = seo.metaTitle || 'Your restaurant. Your platform. No commission';
  const heroDescription = seo.metaDescription || 'Online ordering with WhatsApp, a live admin dashboard, POS and campaigns — self-hosted, MIT licensed and entirely yours';

  return (
    <div className="webflow-root relative min-h-screen overflow-hidden bg-white text-[#212121]">
      <style>{`
        .webflow-root {
          font-family: Inter, 'Arial', system-ui, sans-serif;
          font-feature-settings: 'ss01';
        }
        .webflow-root .font-heading {
          font-family: Inter, 'Arial', system-ui, sans-serif;
          font-feature-settings: 'ss01';
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .webflow-root h1.font-heading {
          font-size: clamp(2.75rem, 6vw, 5rem);
          line-height: 1.04;
          letter-spacing: -0.8px;
          font-weight: 600;
        }
        .webflow-root h2.font-heading {
          font-size: clamp(2rem, 3.6vw, 2.8rem);
          line-height: 1.1;
          letter-spacing: -0.4px;
          font-weight: 600;
        }
        .eyebrow {
          font-size: 15px;
          font-weight: 500;
          line-height: 19.5px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }
        .caption-mono {
          font-family: 'Inconsolata', ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px;
          line-height: 18px;
        }
        .webflow-lift {
          box-shadow: 0 84px 24px rgba(0,0,0,0), 0 54px 22px rgba(0,0,0,0.01), 0 30px 18px rgba(0,0,0,0.04), 0 13px 13px rgba(0,0,0,0.08), 0 3px 7px rgba(0,0,0,0.09);
        }
        @media (prefers-reduced-transparency: reduce) {
          .webflow-root nav { background: #fff !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
        }
      `}</style>

      <motion.div className="pointer-events-none fixed inset-0 z-[2]" style={{ background: spotlight }} />
      <motion.div className="fixed left-0 right-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-[#c2410c] via-[#ea580c] to-[#fb923c]" style={{ scaleX }} />

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-[#d9d9dd] bg-white/95 backdrop-blur-md">
        <div className="relative mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-5">
          <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#212121]">
              <span className="font-heading text-sm text-white">O</span>
            </div>
            <span className="font-heading text-sm leading-tight text-[#212121] sm:text-base">{restaurantName || 'Restaurant'}</span>
          </motion.div>
          <div className="hidden items-center gap-6 text-sm font-medium text-[#212121] lg:flex">
            {navLinks.map(([label, href]) => (
              <a key={label} href={href} className="whitespace-nowrap transition-colors hover:text-[#ea580c]">{label}</a>
            ))}
          </div>
          <div className="flex items-center justify-end gap-3 sm:gap-4">
            <a href="https://github.com/zubershk/ocp" target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1.5 text-sm font-medium text-[#212121] transition-colors hover:text-[#ea580c] xl:inline-flex"><GithubIcon size={15} /> GitHub</a>
            <a href={DOCS} target="_blank" rel="noopener noreferrer" className="hidden text-sm font-medium text-[#212121] transition-colors hover:text-[#ea580c] sm:block">Docs</a>
            <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="hidden items-center gap-1.5 rounded bg-[#212121] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#3f3f46] sm:inline-flex">
              Get started <ArrowRight size={14} />
            </MagneticLink>
            <button type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d9d9dd] bg-white text-[#212121] lg:hidden">
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {menuOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden border-t border-[#d9d9dd] bg-white lg:hidden">
              <div className="mx-auto flex max-w-6xl flex-col px-5 py-3">
                {navLinks.map(([label, href]) => (
                  <a key={label} href={href} onClick={() => setMenuOpen(false)} className="border-b border-[#d9d9dd] py-3 text-sm font-medium text-[#212121] last:border-0">{label}</a>
                ))}
                <a href="https://github.com/zubershk/ocp" target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)} className="border-t border-[#d9d9dd] py-3 text-sm font-medium text-[#616161] xl:hidden">GitHub</a>
                <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="my-3 inline-flex items-center justify-center gap-1.5 rounded bg-[#212121] px-5 py-3 text-sm font-medium text-white sm:hidden">
                  Get started <ArrowRight size={14} />
                </MagneticLink>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ── Hero: dark band + two-card composition ── */}
      <section ref={heroRef} className="relative isolate overflow-hidden bg-[#212121]">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(55%_60%_at_50%_8%,rgba(234,88,12,0.16),transparent_70%)]" />
        <div ref={fogRef} className="absolute inset-0 -z-10" aria-hidden="true" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#212121]/75 via-[#212121]/50 to-[#212121]/75" aria-hidden="true" />
        <div className="mx-auto max-w-6xl px-5 pb-14 pt-16 sm:pt-20">
          <motion.div style={{ y: copyY }} className="relative z-10 mx-auto max-w-4xl text-center">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="inline-flex items-center gap-2 rounded border border-white/20 px-3 py-1.5 eyebrow text-white/70">
              <motion.span animate={reduceMotion ? {} : { scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }} transition={{ duration: 2, repeat: Infinity }} className="h-1.5 w-1.5 rounded-full bg-[#ea580c]" />
              Open source · Free forever · Self-hosted
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.05, ease: [0.16, 1, 0.3, 1] as const }} className="mx-auto mt-8 font-heading text-white">
              {heroTitle.replace(/\s*No commission\.?$/i, '')}<span className="text-[#fb923c]"> No commission</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.12 }} className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/70">
              {heroDescription}
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 170, damping: 22, delay: 0.18 }} className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="inline-flex items-center gap-2 rounded bg-white px-5 py-3 text-sm font-medium text-[#212121] transition-colors hover:bg-white/90">
                <Terminal size={16} /> Start in three commands
              </MagneticLink>
              <MagneticLink href="#screenshots" className="inline-flex items-center gap-2 rounded border border-white/30 bg-transparent px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10">
                See the product <ArrowRight size={15} />
              </MagneticLink>
            </motion.div>
          </motion.div>

          <motion.div style={{ y: mediaY, scale: mediaScale }} className="relative z-10 mx-auto mt-12 max-w-5xl">
            <div className="grid items-stretch gap-5 md:grid-cols-[1.55fr_1fr]">
              <Reveal className="rounded-lg border border-white/15 bg-white p-2">
                <img src={screenshots[1].src} alt={screenshots[1].alt} className="h-56 w-full rounded bg-white object-cover object-top md:h-full" loading="lazy" />
                <div className="flex items-center justify-between px-3 py-3">
                  <span className="caption-mono text-[#93939f]">Live admin dashboard</span>
                  <span className="caption-mono text-[#ea580c]">Orders · Menu · Analytics</span>
                </div>
              </Reveal>
              <Reveal delay={0.1}><LiveOrderTicket /></Reveal>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Connected surfaces ── */}
      <ConnectedSystems />

      {/* ── Stats ── */}
      <section className="relative z-10 border-b border-[#d9d9dd] bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-[#d9d9dd] sm:grid-cols-4">
          {stats.map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal key={s.label} delay={i * 0.08} className="bg-white px-6 py-8">
                <Icon size={16} strokeWidth={1.5} className="text-[#ea580c]" />
                <p className="mt-4 font-heading text-4xl text-[#212121]"><CountUp to={s.value} decimals={s.decimals} suffix={s.suffix} /></p>
                <p className="caption-mono mt-2 text-[#93939f]">{s.label}</p>
              </Reveal>
            );
          })}
        </div>
        <div className="mx-auto max-w-6xl px-5 py-6 text-center text-xs text-[#93939f]">Measured with the bundled 1,000-user harness — <a className="text-[#212121] underline underline-offset-2" href="https://github.com/zubershk/ocp/blob/master/docs/LOAD_TEST.md" target="_blank" rel="noopener noreferrer">methodology</a></div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="relative z-10 border-b border-[#d9d9dd] bg-white py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mb-14 text-center">
            <p className="eyebrow text-[#616161]">Everything included</p>
            <h2 className="mt-4 font-heading text-[#212121]">A complete ordering operation, not a storefront template</h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#616161]">The web menu, WhatsApp bot, admin, POS and campaign tool share one database and one tenant model.</p>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <Reveal key={f.title} delay={i * 0.06}>
                  <TiltCard className="h-full rounded-lg border border-[#d9d9dd] bg-white p-8">
                    <Icon size={18} strokeWidth={1.5} className="text-[#ea580c]" />
                    <h3 className="mt-6 font-heading text-2xl text-[#212121]">{f.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-[#616161]">{f.desc}</p>
                  </TiltCard>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Dark feature band ── */}
      <section className="relative z-10 bg-[#212121] py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <p className="eyebrow text-white/50">The core workflow</p>
            <h2 className="mt-4 font-heading text-white">Orders arrive on WhatsApp. Your team works one queue.</h2>
            <div className="mt-9 divide-y divide-white/15">
              {[
                ['One conversation per customer', 'OTP logins, order updates and delivery alerts all stay on the number people already use.'],
                ['One queue for the whole team', 'Kitchen, managers and owners see the same live status without passing messages around.'],
                ['One source of truth', 'Menu, orders, customers and campaigns live in a single database you control.'],
              ].map(([title, desc]) => (
                <div key={title} className="py-5 first:pt-0">
                  <p className="text-base font-medium text-white">{title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{desc}</p>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.1} className="rounded-lg border border-white/15 bg-white p-2">
            <img src={screenshots[0].src} alt={screenshots[0].alt} className="h-64 w-full rounded object-cover object-top sm:h-80" loading="lazy" />
            <div className="px-3 py-3"><span className="caption-mono text-[#93939f]">Installable storefront menu</span></div>
          </Reveal>
        </div>
      </section>

      {/* ── Use cases ── */}
      <section id="use-cases" className="relative z-10 border-b border-[#d9d9dd] bg-white py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mb-14 text-center">
            <p className="eyebrow text-[#616161]">Who it is for</p>
            <h2 className="mt-4 font-heading text-[#212121]">Any food business that takes orders</h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#616161]">Business type, sizes, payment labels, hours and branding are configuration, not code.</p>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {useCases.map((u, i) => {
              const Icon = u.icon;
              return (
                <Reveal key={u.title} delay={i * 0.07}>
                  <TiltCard className="h-full rounded-lg border border-[#d9d9dd] bg-white p-8">
                    <Icon size={18} strokeWidth={1.5} className="text-[#ea580c]" />
                    <h3 className="mt-6 font-heading text-xl text-[#212121]">{u.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-[#616161]">{u.desc}</p>
                  </TiltCard>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Screenshots ── */}
      <section id="screenshots" className="relative z-10 border-b border-[#d9d9dd] bg-white py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mb-14 text-center">
            <p className="eyebrow text-[#616161]">The real product</p>
            <h2 className="mt-4 font-heading text-[#212121]">The screens that run the operation</h2>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-3">
            {screenshots.map((s, i) => (
              <Reveal key={s.label} delay={i * 0.1}>
                <motion.figure whileHover={{ y: -6 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }} className="overflow-hidden rounded-lg border border-[#d9d9dd]">
                  <img src={s.src} alt={s.alt} className="h-48 w-full border-b border-[#d9d9dd] object-cover object-top" />
                  <figcaption className="px-5 py-4 text-sm text-[#212121]">{s.label}</figcaption>
                </motion.figure>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-6 text-center text-sm text-[#93939f]">All 21 screenshots are in the <a className="text-[#212121] underline underline-offset-2" href={DOCS} target="_blank" rel="noopener noreferrer">README</a></Reveal>
        </div>
      </section>

      {/* ── Steps ── */}
      <section className="relative z-10 border-b border-[#d9d9dd] bg-white py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal className="mb-14 text-center">
            <p className="eyebrow text-[#616161]">Getting started</p>
            <h2 className="mt-4 font-heading text-[#212121]">From clone to first order</h2>
          </Reveal>
          <div className="grid gap-10 sm:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal key={s.num} delay={i * 0.1}>
                <div className="relative border-t-2 border-[#ea580c] pt-6">
                  <span className="absolute -top-2 left-0 h-3 w-3 rounded-full bg-[#ea580c]" />
                  <span className="caption-mono text-[#93939f]">{s.num}</span>
                  <h3 className="mt-3 font-heading text-2xl text-[#212121]">{s.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#616161]">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison ── */}
      <section className="relative z-10 border-b border-[#d9d9dd] bg-white py-20">
        <div className="mx-auto max-w-3xl px-5">
          <Reveal className="mb-14 text-center">
            <p className="eyebrow text-[#616161]">Why self-host</p>
            <h2 className="mt-4 font-heading text-[#212121]">Keep the revenue and the relationship</h2>
            <p className="mt-5 text-base text-[#616161]">Marketplace commissions are a percentage of every order, forever.</p>
          </Reveal>
          <div className="border-t border-[#d9d9dd]">
            <div className="grid grid-cols-3 eyebrow text-[#93939f]">
              <div className="p-4">Area</div>
              <div className="p-4 text-center text-[#212121]">OCP</div>
              <div className="p-4 text-center">Marketplace</div>
            </div>
            {comparisons.map((c) => (
              <Reveal key={c.feature}>
                <div className="grid grid-cols-3 border-t border-[#d9d9dd] text-sm">
                  <div className="p-4 font-medium text-[#212121]">{c.feature}</div>
                  <div className="p-4 text-center"><span className="inline-flex items-center gap-1.5 text-[#c2410c]"><CheckCircle2 size={14} /> {c.ocp}</span></div>
                  <div className="p-4 text-center"><span className="inline-flex items-center gap-1.5 text-[#93939f]"><XCircle size={14} /> {c.other}</span></div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Deployment ── */}
      <section className="relative z-10 border-b border-[#d9d9dd] bg-white py-20">
        <div className="mx-auto max-w-4xl px-5">
          <Reveal className="mb-14 text-center">
            <p className="eyebrow text-[#616161]">Deployment</p>
            <h2 className="mt-4 font-heading text-[#212121]">Run it where it makes sense for you</h2>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-3">
            {deployOptions.map((d, i) => (
              <Reveal key={d.name} delay={i * 0.08}>
                <TiltCard className="h-full rounded-lg border border-[#d9d9dd] bg-white p-8">
                  <h3 className="font-heading text-xl text-[#212121]">{d.name}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#616161]">{d.detail}</p>
                  <p className="caption-mono mt-5 text-[#ea580c]">{d.cost}</p>
                </TiltCard>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-10 text-center text-sm text-[#616161]">Full guides in <a className="text-[#212121] underline underline-offset-2" href="https://github.com/zubershk/ocp/blob/master/docs/DEPLOYMENT.md" target="_blank" rel="noopener noreferrer">DEPLOYMENT.md</a></Reveal>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="relative z-10 border-b border-[#d9d9dd] bg-white py-20">
        <div className="mx-auto max-w-4xl px-5">
          <Reveal className="mb-14 text-center">
            <p className="eyebrow text-[#616161]">Pricing</p>
            <h2 className="mt-4 font-heading text-[#212121]">No license fee, no commission</h2>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2">
            <Reveal>
              <TiltCard className="webflow-lift h-full rounded-lg bg-[#212121] p-8">
                <h3 className="font-heading text-2xl text-white">Self-hosted</h3>
                <div className="mt-4 flex items-baseline gap-2"><span className="font-heading text-5xl text-white">₹0</span><span className="caption-mono text-white/60">forever</span></div>
                <p className="mt-3 text-sm text-white/70">Run it on your own server. Your data stays with you.</p>
                <ul className="mt-8 space-y-3 text-sm text-white">
                  {['Unlimited orders and customers', 'WhatsApp campaigns', 'Full source code', 'Team roles and audit log', 'POS and receipt printing'].map((f) => <li key={f} className="flex items-center gap-2"><CheckCircle2 size={14} className="shrink-0 text-[#ea580c]" /> {f}</li>)}
                </ul>
                <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="mt-9 block rounded bg-white px-5 py-3 text-center text-sm font-medium text-[#212121] transition-colors hover:bg-white/90">Get started</MagneticLink>
              </TiltCard>
            </Reveal>
            <Reveal delay={0.1}>
              <TiltCard className="h-full rounded-lg border border-[#d9d9dd] bg-white p-8">
                <h3 className="font-heading text-2xl text-[#212121]">Managed</h3>
                <div className="mt-4 flex items-baseline gap-2"><span className="font-heading text-5xl text-[#212121]">₹999</span><span className="caption-mono text-[#93939f]">per month</span></div>
                <p className="mt-3 text-sm text-[#616161]">We host it while you focus on the food.</p>
                <ul className="mt-8 space-y-3 text-sm text-[#212121]">
                  {['Everything in self-hosted', 'Managed hosting and backups', 'SSL and domain setup', 'WhatsApp configured', 'Priority support'].map((f) => <li key={f} className="flex items-center gap-2"><CheckCircle2 size={14} className="shrink-0 text-[#c2410c]" /> {f}</li>)}
                </ul>
                <button disabled className="mt-9 block w-full cursor-not-allowed rounded border border-[#d9d9dd] px-5 py-3 text-sm font-medium text-[#93939f]">Not available yet</button>
              </TiltCard>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="relative z-10 border-b border-[#d9d9dd] bg-white py-20">
        <div className="mx-auto max-w-3xl px-5">
          <Reveal className="mb-14 text-center">
            <p className="eyebrow text-[#616161]">Questions</p>
            <h2 className="mt-4 font-heading text-[#212121]">The things people ask first</h2>
          </Reveal>
          <Reveal><Faq /></Reveal>
        </div>
      </section>

      {/* ── Maintainers ── */}
      <section id="maintainers" className="relative z-10 border-b border-[#d9d9dd] bg-white py-20">
        <div className="mx-auto max-w-4xl px-5">
          <Reveal className="text-center">
            <GitFork size={32} strokeWidth={1.5} className="mx-auto text-[#93939f]" />
            <h2 className="mt-5 font-heading text-[#212121]">Built in the open, maintained in the open</h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#616161]">MIT licensed, with a documented architecture, a production checklist and CI that checks every module. If you want to improve food ordering software, there is room to do it here.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <MagneticLink href="https://github.com/zubershk/ocp" external className="inline-flex items-center gap-2 rounded bg-[#212121] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#3f3f46]"><GithubIcon size={15} /> View on GitHub</MagneticLink>
              <MagneticLink href="https://github.com/zubershk/ocp/blob/master/CONTRIBUTING.md" external className="inline-flex items-center gap-2 rounded border border-[#d9d9dd] bg-white px-5 py-3 text-sm font-medium text-[#212121] transition-colors hover:border-[#93939f]"><BookOpen size={15} /> Contributing guide</MagneticLink>
            </div>
          </Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, title: 'Safe to run', desc: 'govulncheck, CodeQL, gitleaks and fail-closed npm audits run on every push. Security reports are private.' },
              { icon: LockKeyhole, title: 'Tested at scale', desc: 'A reproducible 1,000-user harness measures throughput, latency and database pool pressure.' },
              { icon: Heart, title: 'Where help is needed', desc: 'Currency and localization, payment gateways, webhooks, a versioned API, the hosted demo and onboarding.' },
            ].map((c, i) => {
              const Icon = c.icon;
              return (
                <Reveal key={c.title} delay={i * 0.08}>
                  <TiltCard className="h-full rounded-lg border border-[#d9d9dd] bg-white p-8">
                    <Icon size={18} strokeWidth={1.5} className="text-[#ea580c]" />
                    <h3 className="mt-6 font-heading text-xl text-[#212121]">{c.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-[#616161]">{c.desc}</p>
                  </TiltCard>
                </Reveal>
              );
            })}
          </div>
          <Reveal className="mt-10 text-center text-sm text-[#616161]">See <a className="text-[#212121] underline underline-offset-2" href="https://github.com/zubershk/ocp/blob/master/docs/DEPENDABOT_TRIAGE.md" target="_blank" rel="noopener noreferrer">security advisories</a> and the <a className="text-[#212121] underline underline-offset-2" href="https://github.com/zubershk/ocp/issues" target="_blank" rel="noopener noreferrer">issue tracker</a></Reveal>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative isolate overflow-hidden bg-[#212121] py-24">
        <div className="relative mx-auto max-w-2xl px-5 text-center">
          <Reveal>
            <h2 className="font-heading text-white">Own the whole ordering flow</h2>
            <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-white/60">One repository, one database, no platform taking a cut of every order.</p>
            <MagneticLink href="https://github.com/zubershk/ocp#quick-start" external className="mt-9 inline-flex items-center gap-2 rounded bg-white px-5 py-3 text-sm font-medium text-[#212121] transition-colors hover:bg-white/90">Get started <ArrowRight size={15} /></MagneticLink>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-[#d9d9dd] bg-white py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-5 sm:flex-row">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-[#212121]"><span className="font-heading text-xs text-white">O</span></div>
            <span className="font-heading text-sm text-[#212121]">{restaurantName || 'Restaurant'}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5 text-xs text-[#616161]">
            <a href="https://github.com/zubershk/ocp" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#212121]">GitHub</a>
            <a href="https://github.com/zubershk/ocp/blob/master/LICENSE" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#212121]">MIT License</a>
            <a href="https://github.com/zubershk/ocp/blob/master/docs/DEPLOYMENT.md" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#212121]">Deployment</a>
            <a href="https://github.com/zubershk/ocp/blob/master/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#212121]">Contributing</a>
            {social.instagram && <a href={social.instagram.startsWith('https://') ? social.instagram : '#'} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#212121]">Instagram</a>}
            {social.facebook && <a href={social.facebook.startsWith('https://') ? social.facebook : '#'} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#212121]">Facebook</a>}
            {social.twitter && <a href={social.twitter.startsWith('https://') ? social.twitter : '#'} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#212121]">Twitter</a>}
            {social.youtube && <a href={social.youtube.startsWith('https://') ? social.youtube : '#'} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#212121]">YouTube</a>}
            {social.whatsapp && <a href={social.whatsapp.startsWith('https://') ? social.whatsapp : '#'} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#212121]">WhatsApp</a>}
          </div>
        </div>
      </footer>
    </div>
  );
}
