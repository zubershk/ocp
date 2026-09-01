import { useState, useEffect } from 'react';
import { useDeliveryHours, useAllPhones, useOutletNames } from '../context/RestaurantContext';
import { apiGet } from '../services/api';

interface TermsContent {
  title?: string;
  sections?: Array<{ heading: string; body: string }>;
}

export default function Terms() {
  const deliveryHours = useDeliveryHours();
  const allPhones = useAllPhones();
  const outletNames = useOutletNames();
  const primaryPhone = allPhones[0] || '';
  const primaryOutlet = outletNames[0] || 'our outlet';
  const [content, setContent] = useState<TermsContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<{ content: TermsContent }>('/api/site-pages/terms')
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
      <h1 className="text-3xl font-bold mb-6">{content?.title || 'Terms & Conditions'}</h1>
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
              <h2 className="font-bold text-zinc-900 mb-1">Ordering</h2>
              <p>Orders placed through this website or WhatsApp are confirmed only after you receive an order number. Prices shown include all applicable taxes. We reserve the right to refuse or cancel any order.</p>
            </section>
            <section>
              <h2 className="font-bold text-zinc-900 mb-1">Delivery</h2>
              <p>Free delivery is offered during delivery hours ({deliveryHours || '11:00 AM to 04:00 AM'}) within our service area. Delivery availability depends on your address. {primaryOutlet} outlet does not deliver to Mira-Bhayandar West-side areas.</p>
            </section>
            <section>
              <h2 className="font-bold text-zinc-900 mb-1">Payment</h2>
              <p>We currently accept Cash on Delivery and UPI payments at the time of delivery or pickup. Online payment options may be added in the future.</p>
            </section>
            <section>
              <h2 className="font-bold text-zinc-900 mb-1">Food preparation</h2>
              <p>All items are freshly prepared after order confirmation. Preparation times may vary during peak hours. Please inform us of any allergies before ordering.</p>
            </section>
            <section>
              <h2 className="font-bold text-zinc-900 mb-1">Cancellations</h2>
              <p>Orders can be cancelled by contacting us directly before food preparation begins. Once preparation has started, cancellation may not be possible.</p>
            </section>
            <section>
              <h2 className="font-bold text-zinc-900 mb-1">Contact</h2>
              <p>For questions about these terms, call +91 {primaryPhone} or visit our {primaryOutlet} outlet.</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
