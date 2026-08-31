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

interface SiteSettingsData {
  settings: SiteSettingsResponse;
  categories: MenuCategory[];
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [settingsRes, categoriesRes] = await Promise.all([
          apiGet<SiteSettingsResponse>('/api/site-settings').catch(() => null),
          apiGet<{ categories: MenuCategory[] }>('/api/menu-categories').catch(() => ({ categories: [] })),
        ]);
        if (!cancelled) {
          if (settingsRes) {
            setSettings(settingsRes);
            applyCSSVars(settingsRes.brand ?? {});
            applySEO(settingsRes.seo ?? {});
          }
          setCategories(categoriesRes.categories ?? []);
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
    loading,
  }), [settings, categories, loading]);

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
