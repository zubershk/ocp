import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Save, ArrowLeft, Home, Type, MessageSquare } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Skeleton } from '@/components/shadcn/skeleton';

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
  contact_delivery_area_text: 'We deliver to Mira Road East, Beverly Park, and surrounding areas',
  contact_delivery_note: 'Free home delivery within our service area. All prices include tax.',
  contact_form_title: 'Send us a message',
  contact_form_desc: 'Have a question or feedback? Send us a message and we\'ll get back to you on WhatsApp.',
  contact_name_label: 'Your Name *',
  contact_phone_label: 'Phone Number *',
  contact_message_label: 'Your Message *',
  contact_submit_button: 'Send on WhatsApp',
  contact_order_cta_text: 'Order Now',
  contact_other_outlets_title: 'Other Outlets',
  contact_map_address: 'Mira Road East, Mumbai',
  contact_map_embed_url: '',
  locations_map_address: 'Mira Road East, Mumbai',
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

export default function AdminHomepage() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<HomepageSettings>(DEFAULTS);

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
    if (settingsQuery.data) setForm(settingsQuery.data);
  }, [settingsQuery.data]);

  const saveMut = useMutation({
    mutationFn: (body: HomepageSettings) =>
      adminFetch('/admin/site-settings/homepage', { method: 'PUT', body: JSON.stringify({ value: body }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-homepage'] }); toast.push({ type: 'success', title: 'Homepage content saved' }); },
    onError: (e: Error) => toast.push({ type: 'error', title: e.message || 'Failed to save' }),
  });

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Card className="p-8">
          <CardContent>
            <Home size={24} className="mx-auto text-muted-foreground" />
            <h1 className="font-bold mt-3">Homepage Content</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in via <a href="/admin" className="text-orange-600 underline">Orders</a> first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const update = (key: keyof HomepageSettings, value: string) => {
    if (key === 'promos') {
      try {
        setForm((prev) => ({ ...prev, [key]: JSON.parse(value) }));
      } catch {
        // ignore invalid JSON
      }
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const fields: { key: keyof HomepageSettings; label: string; placeholder: string }[] = [
    { key: 'hero_title', label: 'Hero Title', placeholder: 'Order food you love' },
    { key: 'hero_subtitle', label: 'Hero Subtitle', placeholder: 'Free delivery ... Pay on arrival' },
    { key: 'hero_image_url', label: 'Hero Background Image URL', placeholder: 'https://images.unsplash.com/...' },
    { key: 'search_placeholder', label: 'Search Placeholder', placeholder: 'Search for a dish or cuisine...' },
    { key: 'popular_title', label: 'Popular Section Title', placeholder: 'Popular Right Now' },
    { key: 'popular_subtitle', label: 'Popular Section Subtitle', placeholder: 'Customer favourites — add in one tap' },
    { key: 'categories_title', label: 'Categories Section Title', placeholder: 'Browse by Category' },
    { key: 'offers_title', label: 'Offers Page Title', placeholder: 'Offers & Family Packs' },
    { key: 'offers_subtitle', label: 'Offers Page Subtitle', placeholder: 'Current promotions from ...' },
    { key: 'offers_phone_text', label: 'Offers Phone Notice', placeholder: 'These offers are available on phone...' },
    { key: 'offers_cta_title', label: 'Offers CTA Title', placeholder: 'Feeding a crowd?' },
    { key: 'offers_cta_text', label: 'Offers CTA Text', placeholder: 'Build your own feast from {count} items...' },
    { key: 'offers_cta_button', label: 'Offers CTA Button', placeholder: 'Browse Full Menu' },
    { key: 'locations_title', label: 'Locations Page Title', placeholder: 'Our Locations' },
    { key: 'locations_subtitle', label: 'Locations Page Subtitle', placeholder: 'Visit us at any of our outlets.' },
    { key: 'locations_note', label: 'Locations Note', placeholder: 'Online ordering available only for...' },
    { key: 'cta_title', label: 'CTA Title', placeholder: 'Ready to order?' },
    { key: 'cta_subtitle', label: 'CTA Subtitle', placeholder: 'Pay by cash or UPI...' },
    { key: 'cta_button_text', label: 'CTA Button Text', placeholder: 'Start Your Order' },
    { key: 'empty_cart_title', label: 'Empty Cart Title', placeholder: 'Your cart is empty' },
    { key: 'empty_cart_subtitle', label: 'Empty Cart Subtitle', placeholder: 'Add some cheesy pizzas...' },
    { key: 'browse_menu_text', label: 'Browse Menu Button Text', placeholder: 'Browse Menu' },
    { key: 'menu_title', label: 'Menu Page Title', placeholder: 'Our Menu' },
    { key: 'menu_subtitle', label: 'Menu Page Subtitle', placeholder: '100% Real Mozzarella...' },
    { key: 'complete_meal_title', label: 'Complete Meal Title', placeholder: 'Complete Your Meal' },
    // Crust & toppings
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
    // Contact page
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
    { key: 'contact_map_address', label: 'Map Search Address', placeholder: 'Mira Road East, Mumbai' },
    { key: 'contact_map_embed_url', label: 'Map Embed URL (full Google Maps embed URL)', placeholder: 'https://www.google.com/maps/embed/v1/...' },
    { key: 'locations_map_address', label: 'Locations Map Search Address', placeholder: 'Mira Road East, Mumbai' },
    { key: 'locations_map_embed_url', label: 'Locations Map Embed URL (full Google Maps embed URL)', placeholder: 'https://www.google.com/maps/embed/v1/...' },
    { key: 'promos', label: 'Login Page Promo Cards (JSON)', placeholder: 'JSON array of promo cards...' },
  ];

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center gap-3 mt-4">
        <Button variant="outline" size="icon" aria-label="Go back" onClick={() => window.history.back()} className="w-9 h-9"><ArrowLeft size={16} /></Button>
        <h1 className="text-2xl font-bold tracking-tight">Homepage Content</h1>
      </div>
      <p className="text-sm text-muted-foreground mt-1 ml-12">Edit all customer-facing text on the home and menu pages.</p>

      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <h2 className="font-semibold flex items-center gap-2"><Type size={16} /> Page Content</h2>
            {settingsQuery.isLoading ? (
              <Skeleton className="mt-3 h-64" />
            ) : (
              <div className="mt-4 space-y-4">
                {fields.map(({ key, label, placeholder }) => {
                  const isPromos = key === 'promos';
                  return (
                    <div key={key}>
                      <label className="text-xs font-semibold text-zinc-700">{label}</label>
                      {isPromos ? (
                        <textarea
                          value={typeof form[key] === 'string' ? form[key] : JSON.stringify(form[key], null, 2)}
                          onChange={(e) => update(key, e.target.value)}
                          placeholder={placeholder}
                          rows={6}
                          className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-stone-200 bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      ) : (
                        <Input
                          value={String(form[key] ?? '')}
                          onChange={(e) => update(key, e.target.value)}
                          placeholder={placeholder}
                          className="mt-1.5"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-semibold">Actions</h2>
            <Button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending} className="mt-4 w-full">
              <Save size={16} className="mr-2" /> {saveMut.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
            <p className="text-xs text-muted-foreground mt-3">
              Changes will be reflected on the customer-facing website immediately after saving.
            </p>
          </Card>

        </div>
      </div>
    </div>
  );
}
