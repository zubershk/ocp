import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, MapPin, Clock, MessageCircle, ArrowRight, Star, Send, Navigation, Globe, ExternalLink } from 'lucide-react';
import { useAllPhones, useRestaurantAddress, useDeliveryHours, useOutletsList, useRestaurantPhone, useRestaurantName } from '../context/RestaurantContext';
import { useSocial, useBrand, useContact } from '../context/SiteSettingsContext';
import { useToast } from '../context/ToastContext';
import { apiPost } from '../services/api';

export default function Contact() {
  const allPhones = useAllPhones();
  const address = useRestaurantAddress();
  const deliveryHours = useDeliveryHours();
  const outlets = useOutletsList();
  const restaurantPhone = useRestaurantPhone();
  const restaurantName = useRestaurantName();
  const social = useSocial();
  const brand = useBrand();
  const contact = useContact();
  const toast = useToast();

  const [contactForm, setContactForm] = useState({ name: '', phone: '', email: '', category: 'general', priority: 'normal', message: '' });
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name.trim() || !contactForm.phone.trim() || !contactForm.message.trim()) {
      toast.push({ type: 'error', title: 'Please fill in all fields' });
      return;
    }
    setSending(true);
    try {
      await apiPost('/api/contact', {
        name: contactForm.name.trim(),
        phone: contactForm.phone.trim(),
        email: contactForm.email.trim() || undefined,
        category: contactForm.category,
        priority: contactForm.priority,
        message: contactForm.message.trim(),
      });
      // Also open WhatsApp with pre-filled message for immediate response
      const waPhone = restaurantPhone || allPhones[0] || '';
      const text = encodeURIComponent(`Hi ${restaurantName},\n\nName: ${contactForm.name}\nPhone: ${contactForm.phone}\n\n${contactForm.message}`);
      window.open(`https://wa.me/91${waPhone}?text=${text}`, '_blank');
      setContactForm({ name: '', phone: '', email: '', category: 'general', priority: 'normal', message: '' });
      toast.push({ type: 'success', title: "Message sent! We'll get back to you soon." });
    } catch (err) {
      toast.push({ type: 'error', title: err instanceof Error ? err.message : 'Failed to send message' });
    } finally {
      setSending(false);
    }
  };

  const primaryOutlet = outlets[0];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hero CTA - Drive orders */}
      <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-3xl p-6 sm:p-8 text-white mb-8 shadow-[0_4px_24px_rgba(234,88,12,0.3)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold">Contact Us</h1>
            <p className="text-white/80 mt-1 text-sm sm:text-base">
              {contact.subtitle}
            </p>
          </div>
          <Link
            to="/r/menu"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-brand-600 font-bold text-sm hover:bg-stone-50 transition-all shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]"
          >
            {contact.orderCtaText} <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {/* Quick action cards */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {/* Call Us */}
        <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Phone size={18} className="text-orange-500" /> {contact.callTitle}
          </h3>
          <div className="space-y-2">
            {allPhones.map((p) => (
              <a
                key={p}
                href={`tel:+91${p}`}
                className="flex items-center gap-2 text-sm text-zinc-600 hover:text-orange-600 transition-colors"
              >
                +91 {p}
              </a>
            ))}
          </div>
          {allPhones.length > 0 && (
            <a
              href={`tel:+91${allPhones[0]}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-all"
            >
              <Phone size={16} /> Call Now
            </a>
          )}
        </div>

        {/* WhatsApp */}
        <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <MessageCircle size={18} className="text-green-500" /> {contact.whatsappTitle}
          </h3>
          <p className="text-sm text-zinc-600">
            {contact.whatsappDesc}
          </p>
          <a
            href={`https://wa.me/91${restaurantPhone}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-all"
          >
            <MessageCircle size={16} /> {contact.whatsappButton}
          </a>
        </div>
      </div>

      {/* Map + Address */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {/* Map embed */}
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          <div className="aspect-[4/3] bg-stone-100">
            <iframe
              src={contact.mapEmbedUrl || `https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodeURIComponent(contact.mapAddress)}`}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Store location"
            />
          </div>
          <div className="p-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <MapPin size={18} className="text-orange-500" /> {contact.outletTitle.replace('{outlet}', outlets[0]?.name || 'Main')}
            </h3>
            <address className="not-italic text-sm text-zinc-600 leading-relaxed mt-2">
              {address || 'Address not available'}
            </address>
            {primaryOutlet?.phones && primaryOutlet.phones.length > 0 && (
              <div className="flex items-center gap-2 mt-2 text-sm text-zinc-500">
                <Phone size={14} className="text-orange-500" />
                {primaryOutlet.phones.join(' · ')}
              </div>
            )}
          </div>
        </div>

        {/* Delivery hours + other outlets */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Clock size={18} className="text-orange-500" /> {contact.deliveryHoursTitle}
            </h3>
            <p className="text-sm text-zinc-600">{contact.deliveryHoursText.replace('{hours}', deliveryHours || '11:00 AM – 04:00 AM')}</p>
            <p className="text-xs text-zinc-400">
              {contact.deliveryNote}
            </p>
            <div className="flex items-center gap-2 text-xs text-zinc-500 mt-2">
              <Navigation size={12} className="text-orange-500" />
              {contact.deliveryAreaText}
            </div>
          </div>

          {outlets.length > 1 && (
            <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-4">
              <h3 className="font-bold text-lg">{contact.otherOutletsTitle}</h3>
              <div className="space-y-3 text-sm">
                {outlets.slice(1).map((o) => (
                  <div key={o.id} className="flex flex-col gap-1">
                    <span className="font-medium text-zinc-900">{o.name}</span>
                    <span className="text-zinc-600">{o.phones?.join(' · ')}</span>
                    {o.address_lines && o.address_lines.length > 0 && (
                      <span className="text-xs text-zinc-400">{o.address_lines.join(', ')}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contact form */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6 sm:p-8 mt-8">
        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Send size={18} className="text-orange-500" /> {contact.formTitle}
        </h3>
        <p className="text-sm text-zinc-500 mb-4">
          {contact.formDesc}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-zinc-700">{contact.nameLabel}</label>
              <input
                type="text"
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                placeholder="John Doe"
                className="mt-1.5 w-full px-3.5 py-2.5 rounded-full border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-700">{contact.phoneLabel}</label>
              <input
                type="tel"
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                placeholder="9876543210"
                className="mt-1.5 w-full px-3.5 py-2.5 rounded-full border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all text-sm"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-zinc-700">Email (optional)</label>
              <input
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                placeholder="your@email.com"
                className="mt-1.5 w-full px-3.5 py-2.5 rounded-full border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-700">Inquiry Type</label>
              <select
                value={contactForm.category}
                onChange={(e) => setContactForm({ ...contactForm, category: e.target.value })}
                className="mt-1.5 w-full px-3.5 py-2.5 rounded-full border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all text-sm bg-white"
              >
                <option value="general">General Inquiry</option>
                <option value="order">Order Related</option>
                <option value="feedback">Feedback</option>
                <option value="complaint">Complaint</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-700">{contact.messageLabel}</label>
            <textarea
              value={contactForm.message}
              onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
              placeholder="I'd like to ask about..."
              rows={4}
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-2xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all text-sm resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-all disabled:opacity-50"
          >
            <Send size={16} /> {contact.submitButton}
          </button>
        </form>
      </div>

      {/* Social media + bottom CTA */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {social.instagram && (
            <a href={social.instagram?.startsWith('https://') ? social.instagram : '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center hover:bg-orange-100 transition-colors" aria-label="Instagram">
              <Globe size={18} className="text-zinc-600 hover:text-orange-600" />
            </a>
          )}
          {social.facebook && (
            <a href={social.facebook?.startsWith('https://') ? social.facebook : '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center hover:bg-orange-100 transition-colors" aria-label="Facebook">
              <Globe size={18} className="text-zinc-600 hover:text-orange-600" />
            </a>
          )}
          {social.twitter && (
            <a href={social.twitter?.startsWith('https://') ? social.twitter : '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center hover:bg-orange-100 transition-colors" aria-label="Twitter">
              <Globe size={18} className="text-zinc-600 hover:text-orange-600" />
            </a>
          )}
          {social.youtube && (
            <a href={social.youtube?.startsWith('https://') ? social.youtube : '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center hover:bg-orange-100 transition-colors" aria-label="YouTube">
              <Globe size={18} className="text-zinc-600 hover:text-orange-600" />
            </a>
          )}
          {social.whatsapp && (
            <a href={social.whatsapp?.startsWith('https://') ? social.whatsapp : '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center hover:bg-orange-100 transition-colors">
              <MessageCircle size={18} className="text-zinc-600 hover:text-orange-600" />
            </a>
          )}
        </div>
        <Link
          to="/r/menu"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-all shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]"
        >
          {contact.orderCtaText} <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
