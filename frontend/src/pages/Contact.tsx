import { Phone, MapPin, Clock, MessageCircle } from 'lucide-react';
import { RESTAURANT, OUTLETS } from '../data/outlets';

export default function Contact() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold mb-2">Contact Us</h1>
      <p className="text-zinc-500 mb-8">
        We'd love to hear from you. Reach us by phone, WhatsApp, or visit any of our outlets.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border p-6 space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Phone size={18} className="text-orange-500" /> Call Us
          </h3>
          {RESTAURANT.phones.map((p) => (
            <a key={p} href={`tel:+91${p}`} className="block text-sm text-zinc-600 hover:text-orange-600">
              +91 {p}
            </a>
          ))}
        </div>

        <div className="bg-white rounded-2xl border p-6 space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <MessageCircle size={18} className="text-green-500" /> WhatsApp
          </h3>
          <p className="text-sm text-zinc-600">
            Order directly or ask us anything on WhatsApp.
          </p>
          <a
            href={`https://wa.me/${RESTAURANT.whatsappNumber}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700"
          >
            <MessageCircle size={16} /> Chat on WhatsApp
          </a>
        </div>

        <div className="bg-white rounded-2xl border p-6 space-y-4 md:col-span-2">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <MapPin size={18} className="text-orange-500" /> Visit Our Mira Road Outlet
          </h3>
          <address className="not-italic text-sm text-zinc-600 leading-relaxed">
            {RESTAURANT.address.line1}<br />
            {RESTAURANT.address.line2}<br />
            {RESTAURANT.address.area}, {RESTAURANT.address.city}<br />
            {RESTAURANT.address.state} {RESTAURANT.address.pincode}
          </address>
        </div>

        <div className="bg-white rounded-2xl border p-6 space-y-4 md:col-span-2">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Clock size={18} className="text-orange-500" /> Delivery Hours
          </h3>
          <p className="text-sm text-zinc-600">{RESTAURANT.deliveryHours} - all days</p>
          <p className="text-xs text-zinc-400">
            Free home delivery within our service area. All prices include tax.
          </p>
        </div>
      </div>

      <div className="mt-8 bg-white rounded-2xl border p-6">
        <h3 className="font-bold mb-3">Other Outlets</h3>
        <div className="space-y-3 text-sm">
          {OUTLETS.filter((o) => !o.onlineOrdering).map((o) => (
            <div key={o.id}>
              <span className="font-medium">{o.name}: </span>
              <span className="text-zinc-600">{o.phones.join(', ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
