import { useState, useEffect } from 'react';
import { useRestaurantName, useDeliveryHours, useOutletNames, useRestaurantPhone } from '../context/RestaurantContext';
import { apiGet } from '../services/api';

interface FAQItem {
  q: string;
  a: string;
}

interface FAQContent {
  title?: string;
  description?: string;
  items?: FAQItem[];
}

export default function FAQ() {
  const restaurantName = useRestaurantName();
  const deliveryHours = useDeliveryHours();
  const outletNames = useOutletNames();
  const restaurantPhone = useRestaurantPhone();
  const [open, setOpen] = useState<number | null>(0);
  const [content, setContent] = useState<FAQContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ content: FAQContent }>('/api/site-pages/faq')
      .then((res) => {
        if (res?.content) setContent(res.content);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const primaryOutlet = outletNames[0] || 'our outlet';

  const defaultFaqs: FAQItem[] = [
    {
      q: 'What are your delivery hours?',
      a: `We deliver ${deliveryHours || 'from 11:00 AM to 04:00 AM'} daily. Our kitchen is open from 11 AM to 11 PM.`,
    },
    {
      q: 'Which outlet handles online orders?',
      a: `Online orders through this website and WhatsApp are handled by our ${primaryOutlet} outlet.`,
    },
    {
      q: `Does ${primaryOutlet} deliver to all of Mira-Bhayandar?`,
      a: `Delivery availability depends on your address. ${primaryOutlet} outlet does not deliver to Mira-Bhayandar West-side areas. Please contact us to confirm if we deliver to your location.`,
    },
    {
      q: 'Can I customise my pizza?',
      a: 'Yes! Choose your size (Regular, Medium or Large), pick your crust (including Cheese Burst), and add extra toppings. Prices update automatically as you customise.',
    },
    {
      q: 'Are prices inclusive of tax?',
      a: 'Yes, all prices on our menu include tax. The price you see is the price you pay.',
    },
    {
      q: 'Can I choose delivery or pickup?',
      a: `Yes. At checkout you can choose between delivery to your address or self-pickup from our ${primaryOutlet} outlet. Delivery is free within our service area.`,
    },
    {
      q: 'How do I track my order?',
      a: 'After placing an order online, you receive an order number and a link to the tracking page. You will also receive WhatsApp updates at every stage.',
    },
    {
      q: 'What payment methods do you accept?',
      a: 'We accept Cash on Delivery and UPI. Online payment options are coming soon.',
    },
    {
      q: 'Is delivery really free?',
      a: `Yes! We offer free home delivery during our delivery hours (${deliveryHours || '11 AM to 4 AM'}). No minimum order value required.`,
    },
    {
      q: 'Do you have Jain options?',
      a: 'Yes, we offer Jain Hara Bhara pizza with Jain sauce. Look for the Jain indicator on menu items.',
    },
  ];

  const faqs = (content?.items && content.items.length > 0) ? content.items : defaultFaqs;

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="space-y-4">
          <div className="h-8 w-48 skeleton" />
          <div className="h-4 w-full skeleton" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 w-full skeleton rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold mb-2">{content?.title || 'Frequently Asked Questions'}</h1>
      <p className="text-zinc-500 mb-8">
        {content?.description || `Everything you need to know about ordering from ${restaurantName || 'our restaurant'}.`}
      </p>
      <div className="space-y-3">
        {faqs.map((f, i) => (
          <div key={i} className="bg-white rounded-xl border border-zinc-100 overflow-hidden">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-zinc-50 transition"
            >
              <span className="font-semibold text-sm">{f.q}</span>
              <span className={`text-orange-600 font-bold transition-transform ${open === i ? 'rotate-45' : ''}`}>
                +
              </span>
            </button>
            {open === i && (
              <p className="px-5 pb-4 text-sm text-zinc-600 leading-relaxed">{f.a}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
