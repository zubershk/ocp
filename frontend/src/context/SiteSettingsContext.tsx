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
  [key: string]: unknown;
}

interface SiteSettingsResponse {
  brand: BrandSettings;
  seo: SEOSettings;
  social: SocialSettings;
  footer: FooterSettings;
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

const SETTINGS_DEFAULTS: SiteSettingsResponse = {
  brand: BRAND_DEFAULTS,
  seo: SEO_DEFAULTS,
  social: SOCIAL_DEFAULTS,
  footer: FOOTER_DEFAULTS,
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

function applySEO(seo: SEOSettings) {
  if (seo.meta_title) {
    document.title = seo.meta_title;
  }
  if (seo.favicon_url) {
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = seo.favicon_url;
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
            applySEO(s.seo ?? {});
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
    extraLinks: f.extra_links ?? [],
  }), [f]);
}

export function useNotifications() {
  const { settings } = useSiteSettings();
  return settings.notifications ?? {};
}

export function useMenuCategories() {
  const { categories } = useSiteSettings();
  return categories;
}
