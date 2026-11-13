import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Save, ArrowLeft, Home, Type, MessageSquare, Package, Search, X, ChevronDown, Check, Undo2, Image, Layout, Tag, MapPin, Megaphone, ShoppingCart, Pizza, Mail, Gift } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/shadcn/tabs';

interface HomepageSettings {
  hero_title: string;
  hero_subtitle: string;
  hero_image_url: string;
  search_placeholder: string;
  popular_title: string;
  popular_subtitle: string;
  categories_title: string;
  offers_title: string;
  offers_subtitle: string;
  offers_phone_text: string;
  offers_cta_title: string;
  offers_cta_text: string;
  offers_cta_button: string;
  locations_title: string;
  locations_subtitle: string;
  locations_note: string;
  cta_title: string;
  cta_subtitle: string;
  cta_button_text: string;
  empty_cart_title: string;
  empty_cart_subtitle: string;
  browse_menu_text: string;
  menu_title: string;
  menu_subtitle: string;
  complete_meal_title: string;
  complete_meal_categories: string;
  complete_meal_limit: number;
  complete_meal_show_on_product: boolean;
  complete_meal_show_on_cart: boolean;
  complete_meal_show_on_checkout: boolean;
  // Crust & toppings
  crust_title: string;
  crust_subtitle: string;
  crust_tossed: string;
  crust_italian_thin: string;
  crust_wheat_thin: string;
  crust_cheese_burst: string;
  crust_double_cheese_crunch: string;
  extra_toppings_title: string;
  extra_cheese_price: string;
  extra_veg_price: string;
  extra_chicken_price: string;
  // Contact page
  contact_title: string;
  contact_subtitle: string;
  contact_call_title: string;
  contact_whatsapp_title: string;
  contact_whatsapp_desc: string;
  contact_whatsapp_button: string;
  contact_outlet_title: string;
  contact_delivery_hours_title: string;
  contact_delivery_hours_text: string;
  contact_delivery_area_text: string;
  contact_delivery_note: string;
  contact_form_title: string;
  contact_form_desc: string;
  contact_name_label: string;
  contact_phone_label: string;
  contact_message_label: string;
  contact_submit_button: string;
  contact_order_cta_text: string;
  contact_other_outlets_title: string;
  contact_map_address: string;
  contact_map_embed_url: string;
  locations_map_address: string;
  locations_map_embed_url: string;
  promos: Array<{
    id: string;
    icon: string;
    badge: string;
    title: string;
    desc: string;
    to: string;
    active: boolean;
  }>;
}

const DEFAULTS: HomepageSettings = {
  hero_title: 'Order food you love',
  hero_subtitle: '',
  hero_image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1920&h=700&fit=crop',
  search_placeholder: 'Search for a dish or cuisine...',
  popular_title: 'Popular Right Now',
  popular_subtitle: 'Customer favourites — add in one tap',
  categories_title: 'Browse by Category',
  offers_title: 'Offers & Family Packs',
  offers_subtitle: 'Current promotions from {restaurant} {outlet}. All prices include tax.',
  offers_phone_text: 'These offers are available on phone and WhatsApp orders. Call us and we\'ll get it started.',
  offers_cta_title: 'Feeding a crowd?',
  offers_cta_text: 'Build your own feast from {count} items on the menu — everything is tax-inclusive.',
  offers_cta_button: 'Browse Full Menu',
  locations_title: 'Our Locations',
  locations_subtitle: 'Visit us at any of our outlets.',
  locations_note: 'Online ordering through this website is currently available only for the {primary} outlet. Please call your nearest outlet directly for {others}.',
  cta_title: 'Ready to order?',
  cta_subtitle: '',
  cta_button_text: 'Start Your Order',
  empty_cart_title: 'Your cart is empty',
  empty_cart_subtitle: 'Add some cheesy pizzas and sides to get started',
  browse_menu_text: 'Browse Menu',
  menu_title: 'Our Menu',
  menu_subtitle: '',
  complete_meal_title: 'Complete Your Meal',
  complete_meal_categories: 'garlic-bread,desserts,french-fries,drinks,beverages',
  complete_meal_limit: 4,
  complete_meal_show_on_product: true,
  complete_meal_show_on_cart: true,
  complete_meal_show_on_checkout: true,
  // Crust & toppings
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
  // Contact page
  contact_title: 'Contact Us',
  contact_subtitle: "We'd love to hear from you. Reach us by phone, WhatsApp, or visit any of our outlets.",
  contact_call_title: 'Call Us',
  contact_whatsapp_title: 'WhatsApp',
  contact_whatsapp_desc: 'Order directly or ask us anything on WhatsApp.',
  contact_whatsapp_button: 'Chat on WhatsApp',
  contact_outlet_title: 'Visit Our {outlet} Outlet',
  contact_delivery_hours_title: 'Delivery Hours',
  contact_delivery_hours_text: '{hours} - all days',
  contact_delivery_area_text: 'We deliver to...',
  contact_delivery_note: 'Free home delivery within our service area. All prices include tax.',
  contact_form_title: 'Send us a message',
  contact_form_desc: 'Have a question or feedback? Send us a message and we\'ll get back to you on WhatsApp.',
  contact_name_label: 'Your Name *',
  contact_phone_label: 'Phone Number *',
  contact_message_label: 'Your Message *',
  contact_submit_button: 'Send on WhatsApp',
  contact_order_cta_text: 'Order Now',
  contact_other_outlets_title: 'Other Outlets',
  contact_map_address: '',
  contact_map_embed_url: '',
  locations_map_address: '',
  locations_map_embed_url: '',
  promos: [
    { id: 'family-pack', icon: 'Gift', badge: 'Family Pack', title: 'Family Pack from ₹1,515', desc: '2 pizzas + garlic bread + choco lava cake', to: '/r/offers', active: true },
    { id: 'free-delivery', icon: 'Truck', badge: 'Free Delivery', title: 'Free delivery 11 AM – 4 AM', desc: 'No minimum order value', to: '/r/locations', active: true },
    { id: 'real-mozzarella', icon: 'Award', badge: 'Real Mozzarella', title: '100% real mozzarella', desc: 'Fresh, never processed cheese on every pizza', to: '/r/about', active: true },
    { id: 'bogo', icon: 'Clock3', badge: 'BOGO', title: 'Buy 1, Get 2nd at Special Price', desc: '2nd pizza from ₹1,150 – call or WhatsApp', to: '/r/offers', active: true },
    { id: '6-crusts', icon: 'UtensilsCrossed', badge: '6 Crusts', title: '6 Crusts · Tossed to Cheese Burst', desc: 'Choose your base, same pricing online & in-store', to: '/r/menu', active: true },
    { id: 'outlets', icon: 'MapPin', badge: 'Outlets', title: 'Visit Our Outlets', desc: 'Same menu, same pricing across all kitchens', to: '/r/locations', active: true },
  ],
};

type SettingField = { key: keyof HomepageSettings; label: string; placeholder: string };
type SettingSection = { id: string; title: string; hint: string; fields: SettingField[] };

/**
 * The customer-facing settings grouped by the page they appear on, so an
 * administrator can find a setting without scrolling a flat list of sixty
 * inputs.
 */
const SECTIONS: SettingSection[] = [
  {
    id: 'hero',
    title: 'Homepage Hero',
    hint: 'The banner and search box at the top of the home page.',
    fields: [
      { key: 'hero_title', label: 'Hero Title', placeholder: 'Order food you love' },
      { key: 'hero_subtitle', label: 'Hero Subtitle', placeholder: 'Free delivery ... Pay on arrival' },
      { key: 'hero_image_url', label: 'Hero Background Image URL', placeholder: 'https://images.unsplash.com/...' },
      { key: 'search_placeholder', label: 'Search Placeholder', placeholder: 'Search for a dish or cuisine...' },
    ],
  },
  {
    id: 'menu',
    title: 'Menu & Categories',
    hint: 'Headings on the menu page and the category strip on the home page.',
    fields: [
      { key: 'popular_title', label: 'Popular Section Title', placeholder: 'Popular Right Now' },
      { key: 'popular_subtitle', label: 'Popular Section Subtitle', placeholder: 'Customer favourites — add in one tap' },
      { key: 'categories_title', label: 'Categories Section Title', placeholder: 'Browse by Category' },
      { key: 'menu_title', label: 'Menu Page Title', placeholder: 'Our Menu' },
      { key: 'menu_subtitle', label: 'Menu Page Subtitle', placeholder: '100% Real Mozzarella...' },
    ],
  },
  {
    id: 'offers',
    title: 'Offers Page',
    hint: 'The /r/offers page — combo deals and family packs.',
    fields: [
      { key: 'offers_title', label: 'Offers Page Title', placeholder: 'Offers & Family Packs' },
      { key: 'offers_subtitle', label: 'Offers Page Subtitle', placeholder: 'Current promotions from ...' },
      { key: 'offers_phone_text', label: 'Offers Phone Notice', placeholder: 'These offers are available on phone...' },
      { key: 'offers_cta_title', label: 'Offers CTA Title', placeholder: 'Feeding a crowd?' },
      { key: 'offers_cta_text', label: 'Offers CTA Text', placeholder: 'Build your own feast from {count} items...' },
      { key: 'offers_cta_button', label: 'Offers CTA Button', placeholder: 'Browse Full Menu' },
    ],
  },
  {
    id: 'locations',
    title: 'Locations Page',
    hint: 'The /r/locations page — outlets and service areas.',
    fields: [
      { key: 'locations_title', label: 'Locations Page Title', placeholder: 'Our Locations' },
      { key: 'locations_subtitle', label: 'Locations Page Subtitle', placeholder: 'Visit us at any of our outlets.' },
      { key: 'locations_note', label: 'Locations Note', placeholder: 'Online ordering available only to...' },
    ],
  },
  {
    id: 'cta',
    title: 'Call To Action Banner',
    hint: 'The closing banner on the home page.',
    fields: [
      { key: 'cta_title', label: 'CTA Title', placeholder: 'Ready to order?' },
      { key: 'cta_subtitle', label: 'CTA Subtitle', placeholder: 'Pay by cash or UPI...' },
      { key: 'cta_button_text', label: 'CTA Button Text', placeholder: 'Start Your Order' },
    ],
  },
  {
    id: 'cart',
    title: 'Cart & Checkout',
    hint: 'The empty cart message and its buttons.',
    fields: [
      { key: 'empty_cart_title', label: 'Empty Cart Title', placeholder: 'Your cart is empty' },
      { key: 'empty_cart_subtitle', label: 'Empty Cart Subtitle', placeholder: 'Add some cheesy pizzas...' },
      { key: 'browse_menu_text', label: 'Browse Menu Button Text', placeholder: 'Browse Menu' },
    ],
  },
  {
    id: 'crust',
    title: 'Crust & Toppings',
    hint: 'Shown on the product page when a customer configures a pizza.',
    fields: [
      { key: 'crust_title', label: 'Crust Section Title', placeholder: '6 Delicious Crusts' },
      { key: 'crust_subtitle', label: 'Crust Section Subtitle', placeholder: 'Choose your base' },
      { key: 'crust_tossed', label: 'Tossed Crust Text', placeholder: 'Tossed (base)' },
      { key: 'crust_italian_thin', label: 'Italian Thin Crust Text', placeholder: 'Italian Thin' },
      { key: 'crust_wheat_thin', label: 'Wheat Thin Crust Text', placeholder: 'Wheat Thin' },
      { key: 'crust_cheese_burst', label: 'Cheese Burst Crust Text', placeholder: 'Cheese Burst' },
      { key: 'crust_double_cheese_crunch', label: 'Double Cheese Crunch Text', placeholder: 'Double Cheese Crunch' },
      { key: 'extra_toppings_title', label: 'Extra Toppings Section Title', placeholder: 'Extra toppings:' },
      { key: 'extra_cheese_price', label: 'Extra Cheese Price Line', placeholder: 'Extra Cheese ₹60/95/125' },
      { key: 'extra_veg_price', label: 'Extra Veg Price Line', placeholder: 'Veg ₹45/80/110' },
      { key: 'extra_chicken_price', label: 'Extra Chicken Price Line', placeholder: 'Chicken ₹60/95/125' },
    ],
  },
  {
    id: 'contact',
    title: 'Contact Page',
    hint: 'The /r/contact page — call, WhatsApp, the form and delivery notes.',
    fields: [
      { key: 'contact_title', label: 'Contact Page Title', placeholder: 'Contact Us' },
      { key: 'contact_subtitle', label: 'Contact Page Subtitle', placeholder: 'We\'d love to hear from you...' },
      { key: 'contact_call_title', label: 'Call Section Title', placeholder: 'Call Us' },
      { key: 'contact_whatsapp_title', label: 'WhatsApp Section Title', placeholder: 'WhatsApp' },
      { key: 'contact_whatsapp_desc', label: 'WhatsApp Description', placeholder: 'Order directly or ask us anything on WhatsApp.' },
      { key: 'contact_whatsapp_button', label: 'WhatsApp Button Text', placeholder: 'Chat on WhatsApp' },
      { key: 'contact_outlet_title', label: 'Outlet Section Title', placeholder: 'Visit Our {outlet} Outlet' },
      { key: 'contact_delivery_hours_title', label: 'Delivery Hours Title', placeholder: 'Delivery Hours' },
      { key: 'contact_delivery_hours_text', label: 'Delivery Hours Text', placeholder: '{hours} - all days' },
      { key: 'contact_delivery_area_text', label: 'Delivery Area Text', placeholder: 'We deliver to...' },
      { key: 'contact_delivery_note', label: 'Delivery Note', placeholder: 'Free home delivery...' },
      { key: 'contact_form_title', label: 'Contact Form Title', placeholder: 'Send us a message' },
      { key: 'contact_form_desc', label: 'Contact Form Description', placeholder: 'Have a question or feedback?' },
      { key: 'contact_name_label', label: 'Name Field Label', placeholder: 'Your Name *' },
      { key: 'contact_phone_label', label: 'Phone Field Label', placeholder: 'Phone Number *' },
      { key: 'contact_message_label', label: 'Message Field Label', placeholder: 'Your Message *' },
      { key: 'contact_submit_button', label: 'Submit Button Text', placeholder: 'Send on WhatsApp' },
      { key: 'contact_order_cta_text', label: 'Order CTA Button Text', placeholder: 'Order Now' },
      { key: 'contact_other_outlets_title', label: 'Other Outlets Title', placeholder: 'Other Outlets' },
      { key: 'contact_map_address', label: 'Map Search Address', placeholder: 'e.g., 123 Main Street, City' },
      { key: 'contact_map_embed_url', label: 'Map Embed URL (full Google Maps embed URL)', placeholder: 'https://www.google.com/maps/embed/v1/...' },
      { key: 'locations_map_address', label: 'Locations Map Search Address', placeholder: 'e.g., 123 Main Street, City' },
      { key: 'locations_map_embed_url', label: 'Locations Map Embed URL (full Google Maps embed URL)', placeholder: 'https://www.google.com/maps/embed/v1/...' },
      { key: 'promos', label: 'Login Page Promo Cards (JSON)', placeholder: 'JSON array of promo cards...' },
    ],
  },
];

/**
 * The upsell has bespoke controls (checkboxes, a number), so it is not
 * a plain text section. It is still declared here so it counts, tabs and
 * searches like every other section.
 */
const UPSELL_SECTION: SettingSection = {
  id: 'upsell',
  title: 'Complete Meal Upsell',
  hint: 'The "Complete Your Meal" strip shown on the product page, cart and checkout.',
  fields: [
    { key: 'complete_meal_title', label: 'Section Title', placeholder: 'Complete Your Meal' },
    { key: 'complete_meal_categories', label: 'Menu Categories Offered', placeholder: 'garlic-bread,desserts,french-fries,drinks,beverages' },
    { key: 'complete_meal_limit', label: 'How Many Items to Show', placeholder: '4' },
    { key: 'complete_meal_show_on_product', label: 'Show On Product Page', placeholder: '' },
    { key: 'complete_meal_show_on_cart', label: 'Show On Cart Page', placeholder: '' },
    { key: 'complete_meal_show_on_checkout', label: 'Show On Checkout Page', placeholder: '' },
  ],
};

const ALL_SECTIONS: SettingSection[] = [...SECTIONS, UPSELL_SECTION];

/**
 * Top level tabs. Each tab groups the settings that belong to one area
 * of the storefront, so the page never becomes one long scroll.
 */
const TAB_GROUPS: { id: string; label: string; sections: string[] }[] = [
  {
    id: 'homepage',
    label: 'Homepage',
    sections: ['hero', 'menu', 'cta'],
  },
  {
    id: 'pages',
    label: 'Store Pages',
    sections: ['offers', 'locations', 'cart', 'contact'],
  },
  {
    id: 'product',
    label: 'Product',
    sections: ['crust', 'upsell'],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    sections: ['maps', 'promos'],
  },
];

const SECTION_ICONS: Record<string, React.ElementType> = {
  hero: Image,
  menu: Layout,
  offers: Tag,
  locations: MapPin,
  cta: Megaphone,
  cart: ShoppingCart,
  crust: Pizza,
  contact: Mail,
  maps: MapPin,
  promos: Gift,
  upsell: Package,
};

export default function AdminHomepage() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<HomepageSettings>(DEFAULTS);
  const [savedForm, setSavedForm] = useState<HomepageSettings>(DEFAULTS);
  const [query, setQuery] = useState('');
  const [promosText, setPromosText] = useState('');
  const [promosError, setPromosError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [justSaved, setJustSaved] = useState(false);
  const [activeTab, setActiveTab] = useState(TAB_GROUPS[0].id);
  const searchRef = useRef<HTMLInputElement>(null);

  const settingsQuery = useQuery({
    queryKey: ['admin-homepage'],
    queryFn: async () => {
      const data = await adminFetch<{ settings: { key: string; value: any }[] }>('/admin/site-settings');
      const hp = data.settings.find((s) => s.key === 'homepage')?.value || {};
      return { ...DEFAULTS, ...hp } as HomepageSettings;
    },
    enabled: authed,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setForm(settingsQuery.data);
      setSavedForm(settingsQuery.data);
      setPromosText(JSON.stringify(settingsQuery.data.promos ?? [], null, 2));
      setPromosError(null);
    }
  }, [settingsQuery.data]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(savedForm), [form, savedForm]);

  const isChanged = (key: keyof HomepageSettings) =>
    JSON.stringify(form[key]) !== JSON.stringify(savedForm[key]);

  const changedCount = (fields: SettingField[]) =>
    fields.filter((f) => isChanged(f.key)).length;

  const revert = (key: keyof HomepageSettings) => {
    setForm((prev) => ({ ...prev, [key]: savedForm[key] }));
    if (key === 'promos') {
      setPromosText(JSON.stringify(savedForm.promos ?? [], null, 2));
    }
  };

  const revertAll = () => {
    setForm(savedForm);
    setPromosText(JSON.stringify(savedForm.promos ?? [], null, 2));
    setPromosError(null);
  };

  const handlePromosChange = (value: string) => {
    setPromosText(value);
    try {
      const parsed = JSON.parse(value);
      setForm((prev) => ({ ...prev, promos: parsed }));
      setPromosError(null);
    } catch {
      setPromosError('Invalid JSON — fix the syntax before saving.');
    }
  };

  const update = (key: keyof HomepageSettings, value: string | boolean | number) => {
    if (key === 'promos') return;
    const boolKeys = [
      'complete_meal_show_on_product',
      'complete_meal_show_on_cart',
      'complete_meal_show_on_checkout',
    ] as const;
    if (boolKeys.includes(key as typeof boolKeys[number])) {
      setForm((prev) => ({ ...prev, [key]: value === 'true' || value === true }));
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const saveMut = useMutation({
    mutationFn: (body: HomepageSettings) =>
      adminFetch('/admin/site-settings/homepage', { method: 'PUT', body: JSON.stringify({ value: body }) }),
    onSuccess: (_data, variables) => {
      setSavedForm(variables);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1600);
      qc.invalidateQueries({ queryKey: ['admin-homepage'] });
      toast.push({ type: 'success', title: 'Content saved' });
    },
    onError: (e: Error) => toast.push({ type: 'error', title: e.message || 'Failed to save' }),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !promosError) saveMut.mutate(form);
        return;
      }
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, promosError, form, saveMut]);

  const matchesQuery = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (section: SettingSection, field: SettingField) =>
      !q ||
      field.label.toLowerCase().includes(q) ||
      field.placeholder.toLowerCase().includes(q) ||
      String(field.key).toLowerCase().includes(q) ||
      section.title.toLowerCase().includes(q);
    return (tabId: string) => {
      const tab = TAB_GROUPS.find((t) => t.id === tabId);
      return ALL_SECTIONS.filter((s) => tab?.sections.includes(s.id))
        .map((section) => ({ ...section, fields: section.fields.filter((f) => match(section, f)) }))
        .filter((section) => section.fields.length > 0);
    };
  }, [query]);

  const searching = query.trim().length > 0;

  const sectionsFor = (tabId: string) =>
    searching
      ? matchesQuery(tabId)
      : ALL_SECTIONS.filter((s) => TAB_GROUPS.find((t) => t.id === tabId)?.sections.includes(s.id));

  useEffect(() => {
    if (!searching) return;
    if (sectionsFor(activeTab).length > 0) return;
    const other = TAB_GROUPS.find((t) => sectionsFor(t.id).length > 0);
    if (other) setActiveTab(other.id);
  }, [query, activeTab]);

  const visibleSections = sectionsFor(activeTab);
  const visibleFieldCount = visibleSections.reduce((n, s) => n + s.fields.length, 0);
  const totalChangedCount = useMemo(
    () => ALL_SECTIONS.reduce((n, s) => n + changedCount(s.fields), 0),
    [form, savedForm],
  );

  const tabStats = (tabId: string) => {
    const sections = ALL_SECTIONS.filter((s) => TAB_GROUPS.find((t) => t.id === tabId)?.sections.includes(s.id));
    return {
      count: sections.reduce((n, s) => n + s.fields.length, 0),
      changed: sections.reduce((n, s) => n + changedCount(s.fields), 0),
      matches: searching ? sectionsFor(tabId).reduce((n, s) => n + s.fields.length, 0) : 0,
    };
  };

  const toggleSection = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderSectionContent = (
    section: SettingSection,
    isCollapsed: boolean,
    form: HomepageSettings,
    promosText: string,
    promosError: string | null,
    changedCount: number
  ) => {
    const isUpsell = section.id === 'upsell';
    return (
      <div className="mt-4 space-y-4">
        {isUpsell ? (
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-700" htmlFor="upsell-title">
                Section Title
              </label>
              <Input
                id="upsell-title"
                value={form.complete_meal_title}
                onChange={(e) => update('complete_meal_title', e.target.value)}
                placeholder="Complete Your Meal"
                className="mt-1.5"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-700" htmlFor="upsell-categories">
                Menu Categories Offered
              </label>
              <Input
                id="upsell-categories"
                value={form.complete_meal_categories}
                onChange={(e) => update('complete_meal_categories', e.target.value)}
                placeholder="garlic-bread,desserts,french-fries,drinks,beverages"
                className="mt-1.5"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Comma separated category ids. Items already in the customer&apos;s cart are never
                offered.
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-700" htmlFor="upsell-limit">
                How Many Items to Show
              </label>
              <Input
                id="upsell-limit"
                type="number"
                min={1}
                max={12}
                value={String(form.complete_meal_limit ?? 4)}
                onChange={(e) =>
                  update(
                    'complete_meal_limit',
                    Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 1)),
                  )
                }
                className="mt-1.5"
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-zinc-700">Show On</legend>
              {(
                [
                  ['complete_meal_show_on_product', 'Product page'],
                  ['complete_meal_show_on_cart', 'Cart page'],
                  ['complete_meal_show_on_checkout', 'Checkout page'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => update(key, e.target.checked)}
                    className="w-4 h-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {section.fields.map(({ key, label, placeholder }) => {
              const isPromos = key === 'promos';
              const changedField = isChanged(key);
              return (
                <div key={key} className="relative group/field">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-zinc-700">{label}</label>
                    {changedField && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
                        title="Changed"
                        aria-label="Changed"
                      />
                    )}
                    {changedField && (
                      <button
                        type="button"
                        onClick={() => revert(key)}
                        aria-label={`Revert ${label}`}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-amber-700 transition-colors"
                      >
                        <Undo2 size={11} /> Revert
                      </button>
                    )}
                  </div>
                  {isPromos ? (
                    <>
                      <textarea
                        value={promosText}
                        onChange={(e) => handlePromosChange(e.target.value)}
                        placeholder={placeholder}
                        rows={10}
                        aria-invalid={!!promosError}
                        className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {promosError && (
                        <p className="mt-1.5 text-xs font-medium text-red-600">{promosError}</p>
                      )}
                    </>
                  ) : (
                    <Input
                      value={String(form[key] ?? '')}
                      onChange={(e) => update(key, e.target.value)}
                      placeholder={placeholder}
                      className={`mt-1.5 ${
                        changedField ? 'border-amber-300 bg-amber-50/40' : ''
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Card className="p-8">
          <CardContent>
            <Home size={24} className="mx-auto text-muted-foreground" />
            <h1 className="font-bold mt-3">Site Content</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in via <a href="/admin" className="text-orange-600 underline">Orders</a> first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center gap-3 mt-4">
        <Button variant="outline" size="icon" aria-label="Go back" onClick={() => window.history.back()} className="w-9 h-9"><ArrowLeft size={16} /></Button>
        <h1 className="text-2xl font-bold tracking-tight">Site Content</h1>
        {dirty && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Unsaved changes
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        Edit every customer-facing heading and label across the storefront.
      </p>

      {/* Sticky search — full width outside grid so it sticks reliably */}
      <div className="mt-4 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-background/90 backdrop-blur-sm border-b border-stone-200 px-3 py-3 sticky top-0 z-20">
          <div className="relative max-w-[1440px] mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" size={15} />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuery('');
              }}
              placeholder="Search settings…"
              aria-label="Search settings"
              className="pl-9 pr-20"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-muted-foreground hover:bg-muted transition-colors"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none px-1.5 py-0.5 rounded border border-stone-300 bg-muted text-[10px] font-mono text-muted-foreground">
                /
              </kbd>
            )}
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {query
                  ? `${visibleFieldCount} setting${visibleFieldCount === 1 ? '' : 's'} match “${query}”`
                  : 'Search by setting name, or browse the sections below.'}
              </p>
              {!query && visibleSections.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((prev) =>
                      prev.size === visibleSections.length
                        ? new Set()
                        : new Set(visibleSections.map((s) => s.id)),
                    )
                  }
                  className="text-xs font-medium text-muted-foreground hover:text-zinc-900 transition-colors shrink-0"
                >
                  {collapsed.size === visibleSections.length ? 'Expand all' : 'Collapse all'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          {/* Tabs */}
          <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex flex-wrap gap-1" aria-label="Settings categories">
              {TAB_GROUPS.map((tab) => {
                const stats = tabStats(tab.id);
                return (
                  <TabsTrigger
  key={tab.id}
  value={tab.id}
  className="relative flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 transition-all data-active:bg-brand-50 data-active:text-brand-600 data-active:rounded-lg data-active:shadow-sm"
>
  {tab.label}
  {stats.changed > 0 && (
    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-[10px] font-semibold text-white flex items-center justify-center">
      {stats.changed > 9 ? '9+' : stats.changed}
    </span>
  )}
</TabsTrigger>
                );
              })}
            </TabsList>

            {(() => {
              if (settingsQuery.isLoading) {
                return (
                  <TabsContent value={activeTab}>
                    <Card className="p-6">
                      <Skeleton className="h-64 w-full" />
                    </Card>
                  </TabsContent>
                );
              }
              if (visibleSections.length === 0) {
                return (
                  <TabsContent value={activeTab}>
                    <Card className="p-8 text-center">
                      <p className="text-sm text-muted-foreground">No settings match “{query}”.</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => setQuery('')}>
                        Clear search
                      </Button>
                    </Card>
                  </TabsContent>
                );
              }
              return (
                <TabsContent value={activeTab}>
                  {visibleSections.map((section) => {
                    const isCollapsed = collapsed.has(section.id);
                    const changed = changedCount(section.fields);
                    return (
                      <Card key={section.id} id={`setting-${section.id}`} className="p-6 scroll-mt-28">
                        <button
                          type="button"
                          onClick={() => toggleSection(section.id)}
                          aria-expanded={!isCollapsed}
                          className="w-full flex items-start gap-3 text-left group"
                        >
                          <div className="flex items-center gap-2.5 shrink-0">
                            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-100 text-zinc-500 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors">
                              {/* Icon */}
                          {(() => {
                            const Icon = SECTION_ICONS[section.id] ?? Package;
                            return <Icon size={16} stroke={1.5} />;
                          })()}
                            </div>
                            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                              {section.fields.length}
                            </span>
                            <ChevronDown
                              size={16}
                              className={`text-zinc-400 transition-transform duration-200 group-hover:text-zinc-700 ${
                                isCollapsed ? '' : 'rotate-180'
                              }`}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h2 className="font-semibold text-zinc-900">{section.title}</h2>
                              {changed > 0 && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                                  {changed} changed
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{section.hint}</p>
                          </div>
                        </button>

                        <div
                          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                            isCollapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'
                          }`}
                        >
                          <div className="overflow-hidden">
                            {renderSectionContent(
                              section,
                              isCollapsed,
                              form,
                              promosText,
                              promosError,
                              changedCount(section.fields)
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </TabsContent>
              );
            })()}
          </Tabs>
        </div>

        {/* Sticky save bar */}
        <div className="space-y-6 sticky top-6 self-start">
          <Card className="p-6">
            <h2 className="font-semibold">Actions</h2>
            {dirty ? (
              <motion.p
                key="dirty"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="mt-3 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
              >
                {totalChangedCount} setting{totalChangedCount === 1 ? '' : 's'} changed
                <button
                  type="button"
                  onClick={revertAll}
                  className="ml-2 underline underline-offset-2 hover:text-amber-900 transition-colors"
                >
                  Revert all
                </button>
              </motion.p>
            ) : justSaved ? (
              <motion.p
                key="saved"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="mt-3 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2"
              >
                Saved — the storefront is up to date.
              </motion.p>
            ) : (
              <p className="mt-3 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                Everything is saved.
              </p>
            )}
            <motion.div whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 400, damping: 17 }}>
              <Button
                onClick={() => saveMut.mutate(form)}
                disabled={saveMut.isPending || !dirty || !!promosError}
                className="mt-4 w-full"
              >
                {saveMut.isPending ? (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.55 0 0 5.55 0 12h4z" />
                  </svg>
                ) : dirty ? (
                  <Save size={16} className="mr-2" />
                ) : (
                  <Check size={16} className="mr-2" />
                )}
                {saveMut.isPending ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
              </Button>
            </motion.div>
            {promosError && (
              <p className="mt-3 text-xs text-red-600">
                Fix the promo cards JSON before saving.
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              Changes will be reflected on the customer-facing website immediately after saving.
              <span className="block mt-1.5 text-muted-foreground/80">
                Tip: press <kbd className="px-1 py-0.5 rounded border border-stone-300 bg-muted text-[10px] font-mono">⌘S</kbd> to save,{' '}
                <kbd className="px-1 py-0.5 rounded border border-stone-300 bg-muted text-[10px] font-mono">/</kbd> to search.
              </span>
            </p>
          </Card>

          {/* Section index — jump straight to the settings you need. */}
          <Card className="p-6">
            <h2 className="font-semibold text-sm">Jump to</h2>
            <ul className="mt-3 space-y-1 max-h-[38vh] overflow-y-auto pr-1">
              {TAB_GROUPS.map((tab) => {
                const sections = ALL_SECTIONS.filter((s) => tab.sections.includes(s.id));
                return (
                  <li key={tab.id}>
                    <h3 className="font-semibold text-xs text-zinc-500 uppercase tracking-wider mb-1.5">
                      {tab.label}
                    </h3>
                    <ul className="space-y-1">
                      {sections.map((section) => {
                        const changed = changedCount(section.fields);
                        return (
                          <li key={section.id}>
                            <a
                              href={`#setting-${section.id}`}
                              className={`flex items-baseline justify-between gap-3 text-sm py-1.5 rounded-md px-1.5 hover:bg-muted transition-colors ${
                                changed > 0 ? 'text-amber-700' : 'text-zinc-600'
                              }`}
                            >
                              <span className="text-zinc-700">{section.title}</span>
                              <div className="flex items-center gap-1">
                                {changed > 0 && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 bg-amber-50/40 px-1 py-0.5 rounded">
                                    {changed}
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {section.fields.length}
                                </span>
                              </div>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}