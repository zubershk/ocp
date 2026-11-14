import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Save, ArrowLeft, Home, Package, Search, X, ChevronDown, Check, Undo2, Image, Layout, Tag, MapPin, Megaphone, ShoppingCart, Pizza, Mail, Gift, Square, AlertCircle, CheckCircle, Settings } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Card } from '@/components/shadcn/card';
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
  promos: Array<{ id: string; icon: string; badge: string; title: string; desc: string; to: string; active: boolean }>;
}

const DEFAULTS: HomepageSettings = {
  hero_title: 'Order food you love', hero_subtitle: '', hero_image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1920&h=700&fit=crop', search_placeholder: 'Search for a dish or cuisine...', popular_title: 'Popular Right Now', popular_subtitle: 'Customer favourites — add in one tap', categories_title: 'Browse by Category', offers_title: 'Offers & Family Packs', offers_subtitle: 'Current promotions from {restaurant} {outlet}. All prices include tax.', offers_phone_text: 'These offers are available on phone and WhatsApp orders. Call us and we\'ll get it started.', offers_cta_title: 'Feeding a crowd?', offers_cta_text: 'Build your own feast from {count} items on the menu — everything is tax-inclusive.', offers_cta_button: 'Browse Full Menu', locations_title: 'Our Locations', locations_subtitle: 'Visit us at any of our outlets.', locations_note: 'Online ordering through this website is currently available only for the {primary} outlet. Please call your nearest outlet directly for {others}.', cta_title: 'Ready to order?', cta_subtitle: '', cta_button_text: 'Start Your Order', empty_cart_title: 'Your cart is empty', empty_cart_subtitle: 'Add some cheesy pizzas and sides to get started', browse_menu_text: 'Browse Menu', menu_title: 'Our Menu', menu_subtitle: '', complete_meal_title: 'Complete Your Meal', complete_meal_categories: 'garlic-bread,desserts,french-fries,drinks,beverages', complete_meal_limit: 4, complete_meal_show_on_product: true, complete_meal_show_on_cart: true, complete_meal_show_on_checkout: true, crust_title: '6 Delicious Crusts', crust_subtitle: 'Choose your base', crust_tossed: 'Tossed (base)', crust_italian_thin: 'Italian Thin', crust_wheat_thin: 'Wheat Thin', crust_cheese_burst: 'Cheese Burst', crust_double_cheese_crunch: 'Double Cheese Crunch', extra_toppings_title: 'Extra toppings:', extra_cheese_price: 'Extra Cheese ₹60/95/125', extra_veg_price: 'Veg ₹45/80/110', extra_chicken_price: 'Chicken ₹60/95/125', contact_title: 'Contact Us', contact_subtitle: "We'd love to hear from you. Reach us by phone, WhatsApp, or visit any of our outlets.", contact_call_title: 'Call Us', contact_whatsapp_title: 'WhatsApp', contact_whatsapp_desc: 'Order directly or ask us anything on WhatsApp.', contact_whatsapp_button: 'Chat on WhatsApp', contact_outlet_title: 'Visit Our {outlet} Outlet', contact_delivery_hours_title: 'Delivery Hours', contact_delivery_hours_text: '{hours} - all days', contact_delivery_area_text: 'We deliver to...', contact_delivery_note: 'Free home delivery within our service area. All prices include tax.', contact_form_title: 'Send us a message', contact_form_desc: 'Have a question or feedback? Send us a message and we\'ll get back to you on WhatsApp.', contact_name_label: 'Your Name *', contact_phone_label: 'Phone Number *', contact_message_label: 'Your Message *', contact_submit_button: 'Send on WhatsApp', contact_order_cta_text: 'Order Now', contact_other_outlets_title: 'Other Outlets', contact_map_address: '', contact_map_embed_url: '', locations_map_address: '', locations_map_embed_url: '', promos: [ { id: 'family-pack', icon: 'Gift', badge: 'Family Pack', title: 'Family Pack from ₹1,515', desc: '2 pizzas + garlic bread + choco lava cake', to: '/r/offers', active: true }, { id: 'free-delivery', icon: 'Truck', badge: 'Free Delivery', title: 'Free delivery 11 AM – 4 AM', desc: 'No minimum order value', to: '/r/locations', active: true }, { id: 'real-mozzarella', icon: 'Award', badge: 'Real Mozzarella', title: '100% real mozzarella', desc: 'Fresh, never processed cheese on every pizza', to: '/r/about', active: true }, { id: 'bogo', icon: 'Clock3', badge: 'BOGO', title: 'Buy 1, Get 2nd at Special Price', desc: '2nd pizza from ₹1,150 – call or WhatsApp', to: '/r/offers', active: true }, { id: '6-crusts', icon: 'UtensilsCrossed', badge: '6 Crusts', title: '6 Crusts · Tossed to Cheese Burst', desc: 'Choose your base, same pricing online & in-store', to: '/r/menu', active: true }, { id: 'outlets', icon: 'MapPin', badge: 'Outlets', title: 'Visit Our Outlets', desc: 'Same menu, same pricing across all kitchens', to: '/r/locations', active: true } ],
};

type SettingField = { key: keyof HomepageSettings; label: string; placeholder: string; help?: string };
type SettingSection = { id: string; title: string; hint: string; icon: string; fields: SettingField[] };

const SECTIONS: SettingSection[] = [
  { id: 'hero', title: 'Homepage Hero', hint: 'The banner and search box at the top of the home page.', icon: 'Image', fields: [ { key: 'hero_title', label: 'Hero Title', placeholder: 'Order food you love', help: 'Main headline shown on the home page hero banner' }, { key: 'hero_subtitle', label: 'Hero Subtitle', placeholder: 'Free delivery ... Pay on arrival', help: 'Supporting text under the hero title' }, { key: 'hero_image_url', label: 'Hero Background Image URL', placeholder: 'https://images.unsplash.com/...', help: 'Full-width background image for the hero section' }, { key: 'search_placeholder', label: 'Search Placeholder', placeholder: 'Search for a dish or cuisine...', help: 'Placeholder text in the home page search box' } ] },
  { id: 'menu', title: 'Menu & Categories', hint: 'Headings on the menu page and the category strip on the home page.', icon: 'Layout', fields: [ { key: 'popular_title', label: 'Popular Section Title', placeholder: 'Popular Right Now', help: 'Heading for the popular items section' }, { key: 'popular_subtitle', label: 'Popular Section Subtitle', placeholder: 'Customer favourites — add in one tap', help: 'Subtext under the popular section title' }, { key: 'categories_title', label: 'Categories Section Title', placeholder: 'Browse by Category', help: 'Heading for the category strip' }, { key: 'menu_title', label: 'Menu Page Title', placeholder: 'Our Menu', help: 'Page title shown on the menu page' }, { key: 'menu_subtitle', label: 'Menu Page Subtitle', placeholder: '100% Real Mozzarella...', help: 'Subtitle on the menu page' } ] },
  { id: 'offers', title: 'Offers Page', hint: 'The /r/offers page — combo deals and family packs.', icon: 'Tag', fields: [ { key: 'offers_title', label: 'Offers Page Title', placeholder: 'Offers & Family Packs', help: 'Page title for the offers page' }, { key: 'offers_subtitle', label: 'Offers Page Subtitle', placeholder: 'Current promotions from ...', help: 'Subtitle shown on the offers page' }, { key: 'offers_phone_text', label: 'Offers Phone Notice', placeholder: 'These offers are available on phone...', help: 'Notice about phone/WhatsApp ordering' }, { key: 'offers_cta_title', label: 'Offers CTA Title', placeholder: 'Feeding a crowd?', help: 'Call-to-action title' }, { key: 'offers_cta_text', label: 'Offers CTA Text', placeholder: 'Build your own feast from {count} items...', help: 'Call-to-action description' }, { key: 'offers_cta_button', label: 'Offers CTA Button', placeholder: 'Browse Full Menu', help: 'Call-to-action button text' } ] },
  { id: 'locations', title: 'Locations Page', hint: 'The /r/locations page — outlets and service areas.', icon: 'MapPin', fields: [ { key: 'locations_title', label: 'Locations Page Title', placeholder: 'Our Locations', help: 'Page title for locations' }, { key: 'locations_subtitle', label: 'Locations Page Subtitle', placeholder: 'Visit us at any of our outlets.', help: 'Subtitle for locations page' }, { key: 'locations_note', label: 'Locations Note', placeholder: 'Online ordering available only to...', help: 'Note about which outlets offer online ordering' } ] },
  { id: 'cta', title: 'Call To Action Banner', hint: 'The closing banner on the home page.', icon: 'Megaphone', fields: [ { key: 'cta_title', label: 'CTA Title', placeholder: 'Ready to order?', help: 'Main title for the bottom CTA banner' }, { key: 'cta_subtitle', label: 'CTA Subtitle', placeholder: 'Pay by cash or UPI...', help: 'Subtitle under the CTA title' }, { key: 'cta_button_text', label: 'CTA Button Text', placeholder: 'Start Your Order', help: 'Button text for the CTA banner' } ] },
  { id: 'cart', title: 'Cart & Checkout', hint: 'The empty cart message and its buttons.', icon: 'ShoppingCart', fields: [ { key: 'empty_cart_title', label: 'Empty Cart Title', placeholder: 'Your cart is empty', help: 'Title shown when cart is empty' }, { key: 'empty_cart_subtitle', label: 'Empty Cart Subtitle', placeholder: 'Add some cheesy pizzas...', help: 'Subtitle when cart is empty' }, { key: 'browse_menu_text', label: 'Browse Menu Button Text', placeholder: 'Browse Menu', help: 'Button text from empty cart state' } ] },
  { id: 'crust', title: 'Crust & Toppings', hint: 'Shown on the product page when a customer configures a pizza.', icon: 'Pizza', fields: [ { key: 'crust_title', label: 'Crust Section Title', placeholder: '6 Delicious Crusts', help: 'Heading for crust selection section' }, { key: 'crust_subtitle', label: 'Crust Section Subtitle', placeholder: 'Choose your base', help: 'Subtext for crust selection' }, { key: 'crust_tossed', label: 'Tossed Crust Text', placeholder: 'Tossed (base)', help: 'Label for tossed crust option' }, { key: 'crust_italian_thin', label: 'Italian Thin Crust Text', placeholder: 'Italian Thin', help: 'Label for Italian thin crust' }, { key: 'crust_wheat_thin', label: 'Wheat Thin Crust Text', placeholder: 'Wheat Thin', help: 'Label for wheat thin crust' }, { key: 'crust_cheese_burst', label: 'Cheese Burst Crust Text', placeholder: 'Cheese Burst', help: 'Label for cheese burst crust' }, { key: 'crust_double_cheese_crunch', label: 'Double Cheese Crunch Text', placeholder: 'Double Cheese Crunch', help: 'Label for double cheese crunch crust' }, { key: 'extra_toppings_title', label: 'Extra Toppings Section Title', placeholder: 'Extra toppings:', help: 'Heading for extra toppings section' }, { key: 'extra_cheese_price', label: 'Extra Cheese Price Line', placeholder: 'Extra Cheese ₹60/95/125', help: 'Price line for extra cheese (small/medium/large)' }, { key: 'extra_veg_price', label: 'Extra Veg Price Line', placeholder: 'Veg ₹45/80/110', help: 'Price line for extra veg toppings' }, { key: 'extra_chicken_price', label: 'Extra Chicken Price Line', placeholder: 'Chicken ₹60/95/125', help: 'Price line for extra chicken toppings' } ] },
  { id: 'contact', title: 'Contact Page', hint: 'The /r/contact page — call, WhatsApp, the form and delivery notes.', icon: 'Mail', fields: [ { key: 'contact_title', label: 'Contact Page Title', placeholder: 'Contact Us', help: 'Page title for contact page' }, { key: 'contact_subtitle', label: 'Contact Page Subtitle', placeholder: "We'd love to hear from you...", help: 'Subtitle for contact page' }, { key: 'contact_call_title', label: 'Call Section Title', placeholder: 'Call Us', help: 'Heading for phone section' }, { key: 'contact_whatsapp_title', label: 'WhatsApp Section Title', placeholder: 'WhatsApp', help: 'Heading for WhatsApp section' }, { key: 'contact_whatsapp_desc', label: 'WhatsApp Description', placeholder: 'Order directly or ask us anything on WhatsApp.', help: 'Description text for WhatsApp' }, { key: 'contact_whatsapp_button', label: 'WhatsApp Button Text', placeholder: 'Chat on WhatsApp', help: 'Button text for WhatsApp chat' }, { key: 'contact_outlet_title', label: 'Outlet Section Title', placeholder: 'Visit Our {outlet} Outlet', help: 'Heading for outlet location section' }, { key: 'contact_delivery_hours_title', label: 'Delivery Hours Title', placeholder: 'Delivery Hours', help: 'Heading for delivery hours' }, { key: 'contact_delivery_hours_text', label: 'Delivery Hours Text', placeholder: '{hours} - all days', help: 'Text showing delivery hours' }, { key: 'contact_delivery_area_text', label: 'Delivery Area Text', placeholder: 'We deliver to...', help: 'Text describing delivery area' }, { key: 'contact_delivery_note', label: 'Delivery Note', placeholder: 'Free home delivery...', help: 'Note about delivery fees' }, { key: 'contact_form_title', label: 'Contact Form Title', placeholder: 'Send us a message', help: 'Title for the contact form' }, { key: 'contact_form_desc', label: 'Contact Form Description', placeholder: 'Have a question or feedback?', help: 'Description for contact form' }, { key: 'contact_name_label', label: 'Name Field Label', placeholder: 'Your Name *', help: 'Label for name input field' }, { key: 'contact_phone_label', label: 'Phone Field Label', placeholder: 'Phone Number *', help: 'Label for phone input field' }, { key: 'contact_message_label', label: 'Message Field Label', placeholder: 'Your Message *', help: 'Label for message textarea' }, { key: 'contact_submit_button', label: 'Submit Button Text', placeholder: 'Send on WhatsApp', help: 'Text for the form submit button' }, { key: 'contact_order_cta_text', label: 'Order CTA Button Text', placeholder: 'Order Now', help: 'Button text for order CTA' }, { key: 'contact_other_outlets_title', label: 'Other Outlets Title', placeholder: 'Other Outlets', help: 'Heading for other locations section' }, { key: 'contact_map_address', label: 'Map Search Address', placeholder: 'e.g., 123 Main Street, City', help: 'Address shown in contact map' }, { key: 'contact_map_embed_url', label: 'Map Embed URL', placeholder: 'https://www.google.com/maps/embed/v1/...', help: 'Google Maps embed URL for contact page' }, { key: 'locations_map_address', label: 'Locations Map Search Address', placeholder: 'e.g., 123 Main Street, City', help: 'Address shown in locations map' }, { key: 'locations_map_embed_url', label: 'Locations Map Embed URL', placeholder: 'https://www.google.com/maps/embed/v1/...', help: 'Google Maps embed URL for locations page' }, { key: 'promos', label: 'Login Page Promo Cards (JSON)', placeholder: 'JSON array of promo cards...', help: 'JSON array of promo cards shown on login/registration pages' } ] },
];

const UPSELL_SECTION: SettingSection = {
  id: 'upsell',
  title: 'Complete Meal Upsell',
  hint: 'The "Complete Your Meal" strip shown on the product page, cart and checkout.',
  icon: 'Package',
  fields: [ { key: 'complete_meal_title', label: 'Section Title', placeholder: 'Complete Your Meal', help: 'Heading shown above the upsell items' }, { key: 'complete_meal_categories', label: 'Menu Categories Offered', placeholder: 'garlic-bread,desserts,french-fries,drinks,beverages', help: 'Comma-separated category IDs. Items already in cart are never offered.' }, { key: 'complete_meal_limit', label: 'How Many Items to Show', placeholder: '4', help: 'Maximum number of upsell items to display (1-12)' }, { key: 'complete_meal_show_on_product', label: 'Show On Product Page', placeholder: '', help: 'Offer upsell items on the product configuration page' }, { key: 'complete_meal_show_on_cart', label: 'Show On Cart Page', placeholder: '', help: 'Offer upsell items on the cart page' }, { key: 'complete_meal_show_on_checkout', label: 'Show On Checkout Page', placeholder: '', help: 'Offer upsell items on the checkout page' } ],
};

const ALL_SECTIONS: SettingSection[] = [...SECTIONS, UPSELL_SECTION];

const TAB_GROUPS: { id: string; label: string; icon: string; sections: string[] }[] = [
  { id: 'homepage', label: 'Homepage', icon: 'Home', sections: ['hero', 'menu', 'cta'] },
  { id: 'pages', label: 'Store Pages', icon: 'Layout', sections: ['offers', 'locations', 'cart', 'contact'] },
  { id: 'product', label: 'Product', icon: 'Pizza', sections: ['crust', 'upsell'] },
  { id: 'advanced', label: 'Advanced', icon: 'Settings', sections: ['maps', 'promos'] },
];

const ICON_MAP: Record<string, React.ElementType> = { Image, Layout, Tag, MapPin, Megaphone, ShoppingCart, Pizza, Mail, Gift, Package, Home, Square, AlertCircle, CheckCircle, Settings };

const UPSELL_TOGGLES: [string, string][] = [
  ['complete_meal_show_on_product', 'Product page'],
  ['complete_meal_show_on_cart', 'Cart page'],
  ['complete_meal_show_on_checkout', 'Checkout page'],
];

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
  const isChanged = (key: keyof HomepageSettings) => JSON.stringify(form[key]) !== JSON.stringify(savedForm[key]);
  const changedCount = (fields: SettingField[]) => fields.filter((f) => isChanged(f.key)).length;

  const revert = (key: keyof HomepageSettings) => {
    setForm((prev) => ({ ...prev, [key]: savedForm[key] }));
    if (key === 'promos') setPromosText(JSON.stringify(savedForm.promos ?? [], null, 2));
  };

  const revertAll = () => {
    setForm(savedForm);
    setPromosText(JSON.stringify(savedForm.promos ?? [], null, 2));
    setPromosError(null);
  };

  const handlePromosChange = (value: string) => {
    setPromosText(value);
    try { setForm((prev) => ({ ...prev, promos: JSON.parse(value) })); setPromosError(null); }
    catch { setPromosError('Invalid JSON — fix the syntax before saving.'); }
  };

  const update = (key: keyof HomepageSettings, value: string | boolean | number) => {
    if (key === 'promos') return;
    const boolKeys = ['complete_meal_show_on_product', 'complete_meal_show_on_cart', 'complete_meal_show_on_checkout'] as const;
    if (boolKeys.includes(key as typeof boolKeys[number])) { setForm((prev) => ({ ...prev, [key]: value === 'true' || value === true })); return; }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const saveMut = useMutation({
    mutationFn: (body: HomepageSettings) => adminFetch('/admin/site-settings/homepage', { method: 'PUT', body: JSON.stringify({ value: body }) }),
    onSuccess: (_data, variables) => { setSavedForm(variables); setJustSaved(true); window.setTimeout(() => setJustSaved(false), 1800); qc.invalidateQueries({ queryKey: ['admin-homepage'] }); toast.push({ type: 'success', title: 'Content saved' }); },
    onError: (e: Error) => toast.push({ type: 'error', title: e.message || 'Failed to save' }),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty && !promosError) saveMut.mutate(form); return; }
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, promosError, form, saveMut]);

  const matchesQuery = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (section: SettingSection, field: SettingField) => !q || field.label.toLowerCase().includes(q) || field.placeholder.toLowerCase().includes(q) || String(field.key).toLowerCase().includes(q) || section.title.toLowerCase().includes(q) || (field.help ?? '').toLowerCase().includes(q);
    return (tabId: string) => { const tab = TAB_GROUPS.find((t) => t.id === tabId); return ALL_SECTIONS.filter((s) => tab?.sections.includes(s.id)).map((section) => ({ ...section, fields: section.fields.filter((f) => match(section, f)) })).filter((section) => section.fields.length > 0); };
  }, [query]);

  const searching = query.trim().length > 0;
  const sectionsFor = (tabId: string) => searching ? matchesQuery(tabId) : ALL_SECTIONS.filter((s) => TAB_GROUPS.find((t) => t.id === tabId)?.sections.includes(s.id));
  useEffect(() => { if (!searching) return; if (sectionsFor(activeTab).length > 0) return; const other = TAB_GROUPS.find((t) => sectionsFor(t.id).length > 0); if (other) setActiveTab(other.id); }, [query, activeTab]);

  const visibleSections = sectionsFor(activeTab);
  const visibleFieldCount = visibleSections.reduce((n, s) => n + s.fields.length, 0);
  const totalChangedCount = useMemo(() => ALL_SECTIONS.reduce((n, s) => n + changedCount(s.fields), 0), [form, savedForm]);

  const tabStats = (tabId: string) => { const sections = ALL_SECTIONS.filter((s) => TAB_GROUPS.find((t) => t.id === tabId)?.sections.includes(s.id)); return { count: sections.reduce((n, s) => n + s.fields.length, 0), changed: sections.reduce((n, s) => n + changedCount(s.fields), 0), matches: searching ? sectionsFor(tabId).reduce((n, s) => n + s.fields.length, 0) : 0 }; };

  const toggleSection = (id: string) => setCollapsed((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allCollapsed = visibleSections.length > 0 && visibleSections.every((s) => collapsed.has(s.id));

  const renderField = ({ key, label, placeholder, help }: SettingField) => {
    const isPromos = key === 'promos';
    const changed = isChanged(key);
    return (
      <div key={key} className="group/field">
        <div className="flex items-center gap-2">
          <label className="text-[13px] font-medium text-zinc-700">{label}</label>
          {changed && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" title="Unsaved change" aria-label="Unsaved change" />}
          {changed && (
            <button type="button" onClick={() => revert(key)} aria-label={`Revert ${label}`} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-zinc-400 opacity-0 transition-all hover:bg-amber-50 hover:text-amber-700 focus-visible:opacity-100 group-hover/field:opacity-100">
              <Undo2 size={11} /> Revert
            </button>
          )}
        </div>
        {isPromos ? (
          <>
            <textarea value={promosText} onChange={(e) => handlePromosChange(e.target.value)} placeholder={placeholder} rows={10} aria-invalid={!!promosError} className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-mono text-[13px] leading-relaxed transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 focus:outline-none aria-invalid:border-red-400 aria-invalid:ring-red-500/20" />
            {promosError && <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-red-600"><AlertCircle size={11} /> {promosError}</p>}
          </>
        ) : (
          <Input value={String(form[key] ?? '')} onChange={(e) => update(key, e.target.value)} placeholder={placeholder} className={`mt-1.5 h-9 w-full text-[13px] transition-colors ${changed ? 'border-amber-300 bg-amber-50/50 focus:border-amber-400 focus:ring-amber-500/20' : ''}`} />
        )}
        {help && <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">{help}</p>}
      </div>
    );
  };

  const renderUpsell = (f: HomepageSettings) => (
    <div className="space-y-5">
      <div>
        <label className="text-[13px] font-medium text-zinc-700">Section Title</label>
        <Input value={f.complete_meal_title} onChange={(e) => update('complete_meal_title', e.target.value)} placeholder="Complete Your Meal" className="mt-1.5 h-9 text-[13px]" />
        <p className="mt-1.5 text-[11px] text-zinc-400">Heading shown above the upsell items.</p>
      </div>
      <div>
        <label className="text-[13px] font-medium text-zinc-700">Menu Categories Offered</label>
        <Input value={f.complete_meal_categories} onChange={(e) => update('complete_meal_categories', e.target.value)} placeholder="garlic-bread,desserts,french-fries,drinks,beverages" className="mt-1.5 h-9 font-mono text-[12px]" />
        <p className="mt-1.5 text-[11px] text-zinc-400">Comma separated category ids. Items already in the customer&apos;s cart are never offered.</p>
      </div>
      <div>
        <label className="text-[13px] font-medium text-zinc-700">How Many Items to Show</label>
        <Input type="number" min={1} max={12} value={String(f.complete_meal_limit ?? 4)} onChange={(e) => update('complete_meal_limit', Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 1)))} className="mt-1.5 h-9 w-28 text-[13px]" />
        <p className="mt-1.5 text-[11px] text-zinc-400">Maximum number of upsell items to display (1-12).</p>
      </div>
      <fieldset>
        <legend className="text-[13px] font-medium text-zinc-700">Show On</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {UPSELL_TOGGLES.map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[13px] text-zinc-700 transition-colors hover:border-stone-300 hover:bg-zinc-50">
              <input type="checkbox" checked={Boolean(f[key as keyof HomepageSettings])} onChange={(e) => update(key as keyof HomepageSettings, e.target.checked)} className="size-4 shrink-0 rounded border-stone-300 accent-brand-600" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );

  if (!authed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="w-full max-w-sm rounded-2xl shadow-sm">
          <div className="p-8 text-center">
            <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500"><Home size={20} /></div>
            <h1 className="mt-4 text-base font-semibold text-zinc-900">Site Content</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in via <a href="/admin" className="font-medium text-brand-600 underline underline-offset-2">Orders</a> first.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="contents">
        {/* Sticky header + toolbar */}
        <div className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
            <div className="flex h-13 shrink-0 items-center justify-between gap-3 py-3 sm:h-14 sm:py-0">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => window.history.back()} className="size-9 shrink-0 text-zinc-500 hover:text-zinc-900">
                  <ArrowLeft size={16} />
                </Button>
                <div className="min-w-0">
                  <h1 className="truncate text-[15px] font-semibold leading-tight tracking-tight text-zinc-900">Site Content</h1>
                  <p className="hidden truncate text-xs leading-tight text-muted-foreground sm:block">Edit every customer-facing heading and label</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {dirty && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    {totalChangedCount}
                    <span className="hidden sm:inline">unsaved</span>
                  </span>
                )}
                <Button size="sm" variant={dirty ? 'default' : 'outline'} onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending || !dirty || !!promosError} className="h-9 gap-1.5 px-2.5 text-[13px] shadow-sm sm:px-3.5" aria-label={dirty ? 'Save changes' : 'No changes to save'}>
                  {saveMut.isPending ? <><svg className="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.55 0 0 5.55 0 12h4z" /></svg><span className="hidden sm:inline">Saving</span></> : dirty ? <><Save size={14} /><span className="hidden sm:inline">Save changes</span></> : <><Check size={14} /><span className="hidden sm:inline">Saved</span></>}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 pb-2.5 sm:gap-3 sm:pb-3">
              <div className="relative min-w-0 flex-1 sm:max-w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
                <Input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }} placeholder="Search settings…" aria-label="Search settings" className="h-9 w-full rounded-xl border-stone-200 bg-white pl-9 pr-9 text-[13px] shadow-xs" />
                {query ? (
                  <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"><X size={13} /></button>
                ) : (
                  <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 sm:block">/</kbd>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
                {searching ? (
                  <span className="text-[11px] font-medium text-zinc-500">{visibleFieldCount} {visibleFieldCount === 1 ? 'match' : 'matches'}</span>
                ) : visibleSections.length > 0 ? (
                  <button type="button" onClick={() => setCollapsed((prev) => (allCollapsed ? new Set() : new Set(visibleSections.map((s) => s.id))))} className="whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900">
                    {allCollapsed ? 'Expand all' : 'Collapse all'}
                  </button>
                ) : null}
              </div>
            </div>

            <TabsList className="flex w-full justify-start gap-1 overflow-x-auto rounded-xl border border-stone-200 bg-stone-100/80 p-1 pb-2.5 [scrollbar-width:none] sm:w-fit sm:overflow-visible sm:pb-1" aria-label="Settings categories">
              {TAB_GROUPS.map((tab) => {
                const stats = tabStats(tab.id);
                const TabIcon = ICON_MAP[tab.icon] ?? Square;
                return (
                  <TabsTrigger key={tab.id} value={tab.id} className="h-8 shrink-0 gap-1.5 rounded-lg border border-transparent px-2.5 text-[13px] font-medium text-zinc-500 shadow-none transition-all hover:text-zinc-800 data-[state=active]:border-stone-200 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm sm:px-3">
                    <TabIcon size={14} strokeWidth={1.75} />
                    {tab.label}
                    {stats.changed > 0 && <span className="ml-0.5 rounded bg-amber-500 px-1 py-px text-[10px] font-semibold leading-4 text-white tabular-nums">{stats.changed > 9 ? '9+' : stats.changed}</span>}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
        </div>

        {/* Body */}
        <div className="mx-auto mt-5 grid max-w-[1440px] gap-5 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:px-8">
          <div className="min-w-0 space-y-3">
            {settingsQuery.isLoading ? (
              <div className="space-y-3">{[0, 1, 2].map((i) => <Card key={i} className="rounded-2xl border border-border p-5 shadow-xs"><Skeleton className="h-5 w-48" /><Skeleton className="mt-2 h-3 w-72" /><Skeleton className="mt-5 h-9 w-full" /><Skeleton className="mt-4 h-9 w-full" /></Card>)}</div>
            ) : visibleSections.length === 0 ? (
              <Card className="rounded-2xl border border-border shadow-xs">
                <div className="flex flex-col items-center px-6 py-16 text-center">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400"><AlertCircle size={20} /></div>
                  <p className="mt-4 text-sm font-medium text-zinc-800">No settings match “{query}”</p>
                  <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">Try a different keyword, or browse all sections from the tabs above.</p>
                  <Button variant="outline" size="sm" onClick={() => setQuery('')} className="mt-4 h-8 text-[13px]">Clear search</Button>
                </div>
              </Card>
            ) : (
              <TabsContent value={activeTab} className="mt-0">
                {visibleSections.map((section) => {
                  const isCollapsed = collapsed.has(section.id);
                  const changed = changedCount(section.fields);
                  const SectionIcon = ICON_MAP[section.icon] ?? Square;
                  return (
                    <Card key={section.id} id={`setting-${section.id}`} className="scroll-mt-32 gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-xs transition-shadow hover:shadow-md">
                      <button type="button" onClick={() => toggleSection(section.id)} aria-expanded={!isCollapsed} className="group flex w-full items-center gap-3.5 p-5 text-left">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100 transition-colors group-hover:bg-brand-100">
                          <SectionIcon size={16} strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[15px] font-semibold leading-tight tracking-tight text-zinc-900">{section.title}</span>
                            {changed > 0 && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">{changed} changed</span>}
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{section.hint}</span>
                        </span>
                        <span className="hidden shrink-0 items-center gap-2 sm:flex">
                          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-zinc-500">{section.fields.length} settings</span>
                          <ChevronDown size={16} className={`text-zinc-400 transition-transform duration-200 group-hover:text-zinc-700 ${isCollapsed ? '' : 'rotate-180'}`} />
                        </span>
                        <ChevronDown size={16} className={`shrink-0 text-zinc-400 transition-transform duration-200 group-hover:text-zinc-700 sm:hidden ${isCollapsed ? '' : 'rotate-180'}`} />
                      </button>

                      <motion.div initial={false} animate={{ height: isCollapsed ? 0 : 'auto', opacity: isCollapsed ? 0 : 1 }} transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }} className="overflow-hidden">
                        <div className="h-px bg-border" />
                        <div className="space-y-5 p-5">
                          {section.id === 'upsell' ? renderUpsell(form) : section.fields.map(renderField)}
                        </div>
                      </motion.div>
                    </Card>
                  );
                })}
              </TabsContent>
            )}
          </div>

          {/* Right rail */}
          <aside className="space-y-3 lg:sticky lg:top-28 lg:self-start">
            <Card className="gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Save status</span>
                {dirty && (
                  <button type="button" onClick={revertAll} className="text-[11px] font-medium text-zinc-400 transition-colors hover:text-amber-700">Revert all</button>
                )}
              </div>
              <div className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 ring-1 ring-inset ${dirty ? 'bg-amber-50 ring-amber-200' : 'bg-emerald-50 ring-emerald-200'}`}>
                {dirty ? (
                  <><span className="size-2 shrink-0 rounded-full bg-amber-500" /><span className="text-[13px] font-medium text-amber-700">{totalChangedCount} unsaved {totalChangedCount === 1 ? 'change' : 'changes'}</span></>
                ) : justSaved ? (
                  <><CheckCircle size={15} className="shrink-0 text-emerald-600" /><span className="text-[13px] font-medium text-emerald-700">Saved just now</span></>
                ) : (
                  <><CheckCircle size={15} className="shrink-0 text-emerald-600" /><span className="text-[13px] font-medium text-emerald-700">All changes saved</span></>
                )}
              </div>
              {promosError && (
                <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 ring-1 ring-inset ring-red-200">
                  <AlertCircle size={14} className="mt-px shrink-0 text-red-600" />
                  <p className="text-[11px] leading-relaxed text-red-700">Fix the promo cards JSON before saving.</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5 text-[11px] text-zinc-400">
                <kbd className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-[10px]">⌘S</kbd> save
                <kbd className="ml-1 rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-[10px]">/</kbd> search
                <kbd className="ml-1 rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-[10px]">esc</kbd> clear
              </div>
            </Card>

            <Card className="gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">On this page</span>
              <div className="mt-3 max-h-[50vh] space-y-4 overflow-y-auto pr-1">
                {TAB_GROUPS.map((tab) => {
                  const sections = ALL_SECTIONS.filter((s) => tab.sections.includes(s.id));
                  if (!sections.length) return null;
                  return (
                    <div key={tab.id}>
                      <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{tab.label}</div>
                      <ul className="space-y-0.5">
                        {sections.map((section) => {
                          const changed = changedCount(section.fields);
                          return (
                            <li key={section.id}>
                              <a href={`#setting-${section.id}`} onClick={() => setActiveTab(tab.id)} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors ${changed > 0 ? 'bg-amber-50/70 text-amber-800 hover:bg-amber-100' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'}`}>
                                <span className="truncate">{section.title}</span>
                                <span className="flex shrink-0 items-center gap-1">
                                  {changed > 0 && <span className="rounded bg-amber-500 px-1 py-px text-[10px] font-semibold leading-4 text-white tabular-nums">{changed}</span>}
                                  <span className="text-[11px] tabular-nums text-zinc-400">{section.fields.length}</span>
                                </span>
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Card>
          </aside>
        </div>
      </Tabs>
    </div>
  );
}

