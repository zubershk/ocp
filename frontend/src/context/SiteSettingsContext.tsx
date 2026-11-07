import { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { apiGet } from '../services/api';

interface BrandSettings {
  logo_url?: string;
  favicon_url?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  font_heading?: string;
  font_body?: string;
  [key: string]: unknown;
}

interface SEOSettings {
  meta_title?: string;
  meta_description?: string;
  og_image?: string;
  favicon_url?: string;
  [key: string]: unknown;
}

interface SocialSettings {
  instagram?: string;
  facebook?: string;
  twitter?: string;
  youtube?: string;
  whatsapp?: string;
  [key: string]: unknown;
}

interface FooterSettings {
  copyright_text?: string;
  tagline?: string;
  extra_links?: Array<{ label: string; url: string }>;
  promo_strip_text?: string;
  promo_strip_subtext?: string;
  // Footer quick links (configurable from admin)
  quick_links_title?: string;
  quick_links?: Array<{ label: string; url: string }>;
  // Primary outlet section
  outlet_title?: string;
  delivery_hours_text?: string;
  payment_label?: string;
  track_order_text?: string;
  view_locations_text?: string;
  // Trust badges
  trust_title?: string;
  trust_badges?: Array<{ icon: string; text: string }>;
  // Bottom bar
  tax_note?: string;
  // Other outlets
  other_outlets_title?: string;
  [key: string]: unknown;
}

interface HomepageSettings {
  hero_title?: string;
  hero_subtitle?: string;
  hero_image_url?: string;
  locations_map_address?: string;
  locations_map_embed_url?: string;
  search_placeholder?: string;
  // Promo cards displayed on login page (configurable from admin)
  promos?: Array<{
    id: string;
    icon: string;
    badge: string;
    title: string;
    desc: string;
    to: string;
    active: boolean;
  }>;
  popular_title?: string;
  popular_subtitle?: string;
  categories_title?: string;
  offers_title?: string;
  offers_subtitle?: string;
  offers_phone_text?: string;
  offers_cta_title?: string;
  offers_cta_text?: string;
  offers_cta_button?: string;
  locations_title?: string;
  locations_subtitle?: string;
  locations_note?: string;
  cta_title?: string;
  cta_subtitle?: string;
  cta_button_text?: string;
  empty_cart_title?: string;
  empty_cart_subtitle?: string;
  browse_menu_text?: string;
  menu_title?: string;
  menu_subtitle?: string;
  complete_meal_title?: string;
  // Crust & toppings info (configurable from admin)
  crust_title?: string;
  crust_subtitle?: string;
  crust_tossed?: string;
  crust_italian_thin?: string;
  crust_wheat_thin?: string;
  crust_cheese_burst?: string;
  crust_double_cheese_crunch?: string;
  extra_toppings_title?: string;
  extra_cheese_price?: string;
  extra_veg_price?: string;
  extra_chicken_price?: string;
  [key: string]: unknown;
}

interface ContactSettings {
  title?: string;
  subtitle?: string;
  call_title?: string;
  whatsapp_title?: string;
  whatsapp_desc?: string;
  whatsapp_button?: string;
  outlet_title?: string;
  delivery_hours_title?: string;
  delivery_hours_text?: string;
  delivery_area_text?: string;
  delivery_note?: string;
  form_title?: string;
  form_desc?: string;
  name_label?: string;
  phone_label?: string;
  message_label?: string;
  submit_button?: string;
  order_cta_text?: string;
  other_outlets_title?: string;
  map_address?: string;
  map_embed_url?: string;
  [key: string]: unknown;
}

interface SiteSettingsResponse {
  brand: BrandSettings;
  seo: SEOSettings;
  social: SocialSettings;
  footer: FooterSettings;
  homepage: HomepageSettings;
  contact: ContactSettings;
  notifications?: Record<string, unknown>;
  [key: string]: unknown;
}

interface MenuCategory {
  id: number;
  slug: string;
  name: string;
  description?: string;
  image_url?: string;
  sort_order?: number;
  active?: boolean;
}

export interface PublicOffer {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  code: string;
  discount: string;
  image_url: string;
  minOrder: number;
  maxDiscount: number;
  active: boolean;
}

export interface PublicBanner {
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  background: string;
  accent: string;
  buttonText: string;
  buttonLink: string;
  image_url: string;
  active: boolean;
}

export interface FamilyPackConfig {
  id: string;
  title: string;
  subtitle: string;
  vegSlug: string;
  nonvegSlug: string;
  active: boolean;
}

export interface BogoConfig {
  title: string;
  subtitle: string;
  description: string;
  pricing: string;
  active: boolean;
}

export interface FamilyPacksConfig {
  bogo: BogoConfig;
  packs: FamilyPackConfig[];
}

// Empty shape — every business configures its own content via admin.
// No business-specific content belongs in code fallbacks.
const FAMILY_PACKS_DEFAULTS: FamilyPacksConfig = {
  bogo: { title: '', subtitle: '', description: '', pricing: '', active: false },
  packs: [],
};

interface SiteSettingsData {
  settings: SiteSettingsResponse;
  categories: MenuCategory[];
  offers: PublicOffer[];
  banners: PublicBanner[];
  familyPacks: FamilyPacksConfig;
  loading: boolean;
}

const BRAND_DEFAULTS: BrandSettings = {
  primary_color: '#ea580c',
  secondary_color: '#1c1917',
  accent_color: '#f59e0b',
  font_heading: 'Outfit',
  font_body: 'Inter',
};

const SEO_DEFAULTS: SEOSettings = {};
const SOCIAL_DEFAULTS: SocialSettings = {};
const FOOTER_DEFAULTS: FooterSettings = {};
const HOMEPAGE_DEFAULTS: HomepageSettings = {
  crust_title: '6 Delicious Crusts',
  crust_subtitle: 'Choose your base',
  crust_tossed: 'Tossed (base)',
  crust_italian_thin: 'Italian Thin',
  crust_wheat_thin: 'Wheat Thin',
  crust_cheese_burst: 'Cheese Burst',
  crust_double_cheese_crunch: 'Double Cheese Crunch',
  extra_toppings_title: 'Extra toppings:',
  extra_cheese_price: 'Extra Cheese ₹60/95/125',
  extra_veg_price: 'Veg ₹45/80/110',
  extra_chicken_price: 'Chicken ₹60/95/125',
  // Login page promo cards (configurable from admin)
  promos: [
    { id: 'family-pack', icon: 'Gift', badge: 'Family Pack', title: 'Family Pack from ₹1,515', desc: '2 pizzas + garlic bread + choco lava cake', to: '/r/offers', active: true },
    { id: 'free-delivery', icon: 'Truck', badge: 'Free Delivery', title: 'Free delivery 11 AM – 4 AM', desc: 'No minimum order value', to: '/r/locations', active: true },
    { id: 'real-mozzarella', icon: 'Award', badge: 'Real Mozzarella', title: '100% real mozzarella', desc: 'Fresh, never processed cheese on every pizza', to: '/r/about', active: true },
    { id: 'bogo', icon: 'Clock3', badge: 'BOGO', title: 'Buy 1, Get 2nd at Special Price', desc: '2nd pizza from ₹1,150 – call or WhatsApp', to: '/r/offers', active: true },
    { id: '6-crusts', icon: 'UtensilsCrossed', badge: '6 Crusts', title: '6 Crusts · Tossed to Cheese Burst', desc: 'Choose your base, same pricing online & in-store', to: '/r/menu', active: true },
    { id: 'outlets', icon: 'MapPin', badge: 'Outlets', title: 'Visit Our Outlets', desc: 'Same menu, same pricing across all kitchens', to: '/r/locations', active: true },
  ],
};

const CONTACT_DEFAULTS: ContactSettings = {
  title: 'Contact Us',
  subtitle: "We'd love to hear from you. Reach us by phone, WhatsApp, or visit any of our outlets.",
  call_title: 'Call Us',
  whatsapp_title: 'WhatsApp',
  whatsapp_desc: 'Order directly or ask us anything on WhatsApp.',
  whatsapp_button: 'Chat on WhatsApp',
  outlet_title: 'Visit Our {outlet} Outlet',
  delivery_hours_title: 'Delivery Hours',
  delivery_hours_text: '{hours} - all days',
  delivery_area_text: 'We deliver to Mira Road East, Beverly Park, and surrounding areas',
  delivery_note: 'Free home delivery within our service area. All prices include tax.',
  form_title: 'Send us a message',
  form_desc: 'Have a question or feedback? Send us a message and we\'ll get back to you on WhatsApp.',
  name_label: 'Your Name *',
  phone_label: 'Phone Number *',
  message_label: 'Your Message *',
  submit_button: 'Send on WhatsApp',
  order_cta_text: 'Order Now',
  other_outlets_title: 'Other Outlets',
  map_address: 'Mira Road East, Mumbai',
  map_embed_url: '',
};

const SETTINGS_DEFAULTS: SiteSettingsResponse = {
  brand: BRAND_DEFAULTS,
  seo: SEO_DEFAULTS,
  social: SOCIAL_DEFAULTS,
  footer: FOOTER_DEFAULTS,
  homepage: HOMEPAGE_DEFAULTS,
  contact: CONTACT_DEFAULTS,
};

const SiteSettingsContext = createContext<SiteSettingsData>({
  settings: SETTINGS_DEFAULTS,
  categories: [],
  offers: [],
  banners: [],
  familyPacks: FAMILY_PACKS_DEFAULTS,
  loading: true,
});

function setCSSVar(name: string, value: string | undefined) {
  if (value) {
    document.documentElement.style.setProperty(name, value);
  }
}

function applyCSSVars(brand: BrandSettings) {
  setCSSVar('--color-primary', brand.primary_color);
  setCSSVar('--color-secondary', brand.secondary_color);
  setCSSVar('--color-accent', brand.accent_color);
  setCSSVar('--font-heading', brand.font_heading);
  setCSSVar('--font-body', brand.font_body);
}

function applySEO(seo: SEOSettings, brand?: BrandSettings) {
  if (seo.meta_title) {
    document.title = seo.meta_title;
  }
  // Brand page saves the favicon under brand.favicon_url; SEO settings
  // can override it via seo.favicon_url.
  const favicon = seo.favicon_url || brand?.favicon_url;
  if (favicon) {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== favicon) {
      link.href = favicon;
    }
  }
}

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SiteSettingsResponse>(SETTINGS_DEFAULTS);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [offers, setOffers] = useState<PublicOffer[]>([]);
  const [banners, setBanners] = useState<PublicBanner[]>([]);
  const [familyPacks, setFamilyPacks] = useState<FamilyPacksConfig>(FAMILY_PACKS_DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [settingsRes, categoriesRes, offersRes, bannersRes, packsRes] = await Promise.all([
          apiGet<{ settings: SiteSettingsResponse }>('/api/site-settings').catch(() => null),
          apiGet<{ categories: MenuCategory[] }>('/api/menu-categories').catch(() => ({ categories: [] })),
          apiGet<{ offers: PublicOffer[] }>('/api/offers').catch(() => ({ offers: [] })),
          apiGet<{ banners: PublicBanner[] }>('/api/banners').catch(() => ({ banners: [] })),
          apiGet<{ family_packs: FamilyPacksConfig }>('/api/family-packs').catch(() => null),
        ]);
        if (!cancelled) {
          const unwrapped = settingsRes?.settings ?? settingsRes;
          if (unwrapped && typeof unwrapped === 'object' && 'brand' in (unwrapped as object)) {
            const s = unwrapped as SiteSettingsResponse;
            setSettings(s);
            applyCSSVars(s.brand ?? {});
            applySEO(s.seo ?? {}, s.brand ?? {});
          }
          setCategories(categoriesRes.categories ?? []);
          setOffers(offersRes.offers ?? []);
          setBanners(bannersRes.banners ?? []);
          if (packsRes?.family_packs) setFamilyPacks(packsRes.family_packs);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => ({
    settings,
    categories,
    offers,
    banners,
    familyPacks,
    loading,
  }), [settings, categories, offers, banners, familyPacks, loading]);

  return (
    <SiteSettingsContext.Provider value={value}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings(): SiteSettingsData {
  return useContext(SiteSettingsContext);
}

export function useBrand() {
  const { settings } = useSiteSettings();
  const b = settings.brand ?? {};
  return useMemo(() => ({
    logoUrl: b.logo_url ?? '',
    favicon: b.favicon_url ?? '',
    primaryColor: b.primary_color ?? BRAND_DEFAULTS.primary_color,
    secondaryColor: b.secondary_color ?? BRAND_DEFAULTS.secondary_color,
    accentColor: b.accent_color ?? BRAND_DEFAULTS.accent_color,
    fontHeading: b.font_heading ?? BRAND_DEFAULTS.font_heading,
    fontBody: b.font_body ?? BRAND_DEFAULTS.font_body,
  }), [b]);
}

export function useSEO() {
  const { settings } = useSiteSettings();
  const s = settings.seo ?? {};
  return useMemo(() => ({
    metaTitle: s.meta_title ?? '',
    metaDescription: s.meta_description ?? '',
    ogImage: s.og_image ?? '',
    favicon: s.favicon_url ?? '',
  }), [s]);
}

export function useSocial() {
  const { settings } = useSiteSettings();
  const s = settings.social ?? {};
  return useMemo(() => ({
    instagram: s.instagram ?? '',
    facebook: s.facebook ?? '',
    twitter: s.twitter ?? '',
    youtube: s.youtube ?? '',
    whatsapp: s.whatsapp ?? '',
  }), [s]);
}

export function useFooter() {
  const { settings } = useSiteSettings();
  const f = settings.footer ?? {};
  return useMemo(() => ({
    copyrightText: f.copyright_text ?? '',
    tagline: f.tagline ?? '',
    promoStripText: f.promo_strip_text ?? 'Free delivery on all orders · {hours}',
    promoStripSubtext: f.promo_strip_subtext ?? 'Pay cash or UPI on arrival',
    extraLinks: f.extra_links ?? [],
    // Configurable footer content
    quickLinksTitle: f.quick_links_title ?? 'Quick Links',
    quickLinks: f.quick_links ?? [
      { label: 'Menu', url: '/r/menu' },
      { label: 'Offers', url: '/r/offers' },
      { label: 'Locations', url: '/r/locations' },
      { label: 'About', url: '/r/about' },
      { label: 'Reviews', url: '/r/reviews' },
      { label: 'FAQ', url: '/r/faq' },
      { label: 'Contact', url: '/r/contact' },
    ],
    outletTitle: f.outlet_title ?? 'Main Outlet',
    deliveryHoursText: f.delivery_hours_text ?? 'Delivery {hours} daily',
    paymentLabel: f.payment_label ?? 'Payments:',
    trackOrderText: f.track_order_text ?? 'Track Order',
    viewLocationsText: f.view_locations_text ?? 'View All Locations',
    trustTitle: f.trust_title ?? 'Why Order With Us',
    trustBadges: f.trust_badges ?? [
      { icon: 'ShieldCheck', text: 'Secure Checkout' },
      { icon: 'Truck', text: 'Free Delivery' },
      { icon: 'Star', text: '4.7 Rated' },
      { icon: 'CreditCard', text: 'Cash & UPI' },
    ],
    taxNote: f.tax_note ?? 'All prices include tax',
    otherOutletsTitle: f.other_outlets_title ?? 'Other Outlets',
  }), [f]);
}

export function useHomepage() {
  const { settings } = useSiteSettings();
  const h = settings.homepage ?? {};
  return useMemo(() => ({
    heroTitle: h.hero_title ?? 'Order food you love',
    heroSubtitle: h.hero_subtitle ?? '',
    searchPlaceholder: h.search_placeholder ?? 'Search for a dish or cuisine...',
    popularTitle: h.popular_title ?? 'Popular Right Now',
    popularSubtitle: h.popular_subtitle ?? 'Customer favourites — add in one tap',
    categoriesTitle: h.categories_title ?? 'Browse by Category',
    offersTitle: h.offers_title ?? 'Offers & Family Packs',
    offersSubtitle: h.offers_subtitle ?? 'Current promotions from {restaurant} {outlet}. All prices include tax.',
    offersPhoneText: h.offers_phone_text ?? 'These offers are available on phone and WhatsApp orders. Call us and we\'ll get it started.',
    offersCtaTitle: h.offers_cta_title ?? 'Feeding a crowd?',
    offersCtaText: h.offers_cta_text ?? 'Build your own feast from {count} items on the menu — everything is tax-inclusive.',
    offersCtaButton: h.offers_cta_button ?? 'Browse Full Menu',
    locationsTitle: h.locations_title ?? 'Our Locations',
    locationsSubtitle: h.locations_subtitle ?? 'Visit us at any of our outlets.',
    locationsNote: h.locations_note ?? 'Online ordering through this website is currently available only for the {primary} outlet. Please call your nearest outlet directly for {others}.',
    ctaTitle: h.cta_title ?? 'Ready to order?',
    ctaSubtitle: h.cta_subtitle ?? '',
    ctaButtonText: h.cta_button_text ?? 'Start Your Order',
    emptyCartTitle: h.empty_cart_title ?? 'Your cart is empty',
    emptyCartSubtitle: h.empty_cart_subtitle ?? 'Add some cheesy pizzas and sides to get started',
    browseMenuText: h.browse_menu_text ?? 'Browse Menu',
    menuTitle: h.menu_title ?? 'Our Menu',
    menuSubtitle: h.menu_subtitle ?? '',
    completeMealTitle: h.complete_meal_title ?? 'Complete Your Meal',
    heroImageUrl: h.hero_image_url ?? 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1920&h=700&fit=crop',
    locationsMapAddress: h.locations_map_address ?? 'Mira Road East, Mumbai',
    locationsMapEmbedUrl: h.locations_map_embed_url ?? '',
    // Crust & toppings info
    crustTitle: h.crust_title ?? '6 Delicious Crusts',
    crustSubtitle: h.crust_subtitle ?? 'Choose your base',
    crustTossed: h.crust_tossed ?? 'Tossed (base)',
    crustItalianThin: h.crust_italian_thin ?? 'Italian Thin',
    crustWheatThin: h.crust_wheat_thin ?? 'Wheat Thin',
    crustCheeseBurst: h.crust_cheese_burst ?? 'Cheese Burst',
    crustDoubleCheeseCrunch: h.crust_double_cheese_crunch ?? 'Double Cheese Crunch',
    extraToppingsTitle: h.extra_toppings_title ?? 'Extra toppings:',
    extraCheesePrice: h.extra_cheese_price ?? 'Extra Cheese ₹60/95/125',
    extraVegPrice: h.extra_veg_price ?? 'Veg ₹45/80/110',
    extraChickenPrice: h.extra_chicken_price ?? 'Chicken ₹60/95/125',
    // Login page promo cards
    promos: Array.isArray(h.promos) ? h.promos : [],
  }), [h]);
}

export function useContact() {
  const { settings } = useSiteSettings();
  const c = settings.contact ?? {};
  return useMemo(() => ({
    title: c.title ?? 'Contact Us',
    subtitle: c.subtitle ?? "We'd love to hear from you. Reach us by phone, WhatsApp, or visit any of our outlets.",
    callTitle: c.call_title ?? 'Call Us',
    whatsappTitle: c.whatsapp_title ?? 'WhatsApp',
    whatsappDesc: c.whatsapp_desc ?? 'Order directly or ask us anything on WhatsApp.',
    whatsappButton: c.whatsapp_button ?? 'Chat on WhatsApp',
    outletTitle: c.outlet_title ?? 'Visit Our {outlet} Outlet',
    deliveryHoursTitle: c.delivery_hours_title ?? 'Delivery Hours',
    deliveryHoursText: c.delivery_hours_text ?? '{hours} - all days',
    deliveryAreaText: c.delivery_area_text ?? 'We deliver to Mira Road East, Beverly Park, and surrounding areas',
    deliveryNote: c.delivery_note ?? 'Free home delivery within our service area. All prices include tax.',
    formTitle: c.form_title ?? 'Send us a message',
    formDesc: c.form_desc ?? 'Have a question or feedback? Send us a message and we\'ll get back to you on WhatsApp.',
    nameLabel: c.name_label ?? 'Your Name *',
    phoneLabel: c.phone_label ?? 'Phone Number *',
    messageLabel: c.message_label ?? 'Your Message *',
    submitButton: c.submit_button ?? 'Send on WhatsApp',
    orderCtaText: c.order_cta_text ?? 'Order Now',
    otherOutletsTitle: c.other_outlets_title ?? 'Other Outlets',
    mapAddress: c.map_address ?? 'Mira Road East, Mumbai',
    mapEmbedUrl: c.map_embed_url ?? '',
  }), [c]);
}

export function useNotifications() {
  const { settings } = useSiteSettings();
  return settings.notifications ?? {};
}

export function useMenuCategories() {
  const { categories } = useSiteSettings();
  return categories;
}
