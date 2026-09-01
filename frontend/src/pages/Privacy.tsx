import { useState, useEffect } from 'react';
import { useAllPhones, useRestaurantAddress, useOutletNames } from '../context/RestaurantContext';
import { apiGet } from '../services/api';

interface PrivacyContent {
  title?: string;
  sections?: Array<{ heading: string; body: string }>;
}

export default function Privacy() {
  const allPhones = useAllPhones();
  const address = useRestaurantAddress();
  const outletNames = useOutletNames();
  const primaryPhone = allPhones[0] || '';
  const primaryOutlet = outletNames[0] || 'our outlet';
  const [content, setContent] = useState<PrivacyContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ content: PrivacyContent }>('/api/site-pages/privacy')
      .then((res) => {
        if (res?.content) setContent(res.content);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="space-y-4">
          <div className="h-8 w-48 skeleton" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-32 skeleton" />
              <div className="h-4 w-full skeleton" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-6">{content?.title || 'Privacy Policy'}</h1>
      <div className="space-y-6 text-sm text-zinc-600 leading-relaxed">
        {content?.sections && content.sections.length > 0 ? (
          content.sections.map((section, i) => (
            <section key={i}>
              <h2 className="font-bold text-zinc-900 mb-1">{section.heading}</h2>
              <p>{section.body}</p>
            </section>
          ))
        ) : (
          <>
            <section>
              <h2 className="font-bold text-zinc-900 mb-1">What we collect</h2>
              <p>When you place an order through this website, we collect your name, phone number, delivery address, and order details. This information is used solely to process and deliver your order.</p>
            </section>
            <section>
              <h2 className="font-bold text-zinc-900 mb-1">How we use it</h2>
              <p>Your information is used to confirm your order, deliver food to your address, send order status updates via WhatsApp, and improve our service. We do not sell or share your data with third parties for marketing purposes.</p>
            </section>
            <section>
              <h2 className="font-bold text-zinc-900 mb-1">Storage</h2>
              <p>Order information is stored in our database to maintain order history. Your WhatsApp number may be used to identify you when you interact with our ordering assistant.</p>
            </section>
            <section>
              <h2 className="font-bold text-zinc-900 mb-1">Your rights</h2>
              <p>You may contact us at any time to request information about the data we hold about you, or to request its deletion after your order is completed.</p>
            </section>
            <section>
              <h2 className="font-bold text-zinc-900 mb-1">Contact</h2>
              <p>For privacy-related questions, call us at +91 {primaryPhone} or visit our {primaryOutlet} outlet at {address || 'our address'}.</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
