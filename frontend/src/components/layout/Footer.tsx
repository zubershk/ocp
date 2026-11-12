import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Phone, Clock, Pizza, ArrowUpRight, ArrowUp, ShieldCheck, Truck, Star, CreditCard, ChevronRight, Zap, MessageCircle, Globe, ArrowRight } from 'lucide-react';
import { useRestaurant, useRestaurantName, useDeliveryHours, useOutletsList, usePaymentInfo } from '../../context/RestaurantContext';
import { useSocial, useFooter, useBrand } from '../../context/SiteSettingsContext';

export default function Footer() {
  const restaurantName = useRestaurantName();
  const deliveryHours = useDeliveryHours();
  const outlets = useOutletsList();
  const paymentInfo = usePaymentInfo();
  const social = useSocial();
  const footer = useFooter();
  const brand = useBrand();

  const paymentMethods = [
    paymentInfo.cash && 'Cash',
    paymentInfo.upi && 'UPI',
    paymentInfo.online && 'Online',
  ].filter(Boolean);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <footer className="bg-zinc-950 text-zinc-400">
      {/* ── Promotional CTA strip ── */}
      <div className="bg-brand-600 text-white">
        <div className="container-page py-4 sm:py-5 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 text-center sm:text-left">
            <Zap size={18} className="shrink-0 hidden sm:block" />
            <div>
              <span className="font-semibold text-sm sm:text-base">{(footer.promoStripText || 'Free delivery on all orders · {hours}').replace('{hours}', deliveryHours || '11 AM – 4 AM')}</span>
              <span className="block text-xs text-white/70 sm:inline sm:ml-2">{footer.promoStripSubtext || 'Pay cash or UPI on arrival'}</span>
            </div>
          </div>
          <Link
            to="/r/menu"
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 sm:py-2.5 rounded-full bg-white text-brand-600 font-bold text-sm hover:bg-stone-50 transition-all shadow-[0_4px_6px_-1px_rgba(0,0,0,0.2)] shrink-0 touch-target"
          >
            Order Now <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* ── Main footer grid ── */}
      <div className="container-page py-12 sm:py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-10">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5 text-white mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: brand.primaryColor }}>
                <Pizza size={16} />
              </div>
              <div>
                <span className="font-heading font-bold text-base">{restaurantName.split(' ').slice(0, -1).join(' ') || restaurantName}</span>
                <span className="font-heading font-bold text-base" style={{ color: brand.primaryColor }}>{restaurantName.split(' ').length > 1 ? ` ${restaurantName.split(' ').slice(-1)}` : ''}</span>
              </div>
            </div>
            {footer.tagline ? (
              <p className="text-sm text-zinc-500 leading-relaxed max-w-xs">{footer.tagline}</p>
            ) : (
              <p className="text-sm text-zinc-500 leading-relaxed max-w-xs">
                100% Real Mozzarella · All prices include tax · Free delivery {deliveryHours}
              </p>
            )}
            {/* Social links */}
            <div className="flex items-center gap-2.5 mt-5">
              {social.instagram && (
                <a href={social.instagram?.startsWith('https://') ? social.instagram : '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-brand-600 transition-colors" aria-label="Instagram">
                  <Globe size={16} className="text-zinc-400 hover:text-white" />
                </a>
              )}
              {social.facebook && (
                <a href={social.facebook?.startsWith('https://') ? social.facebook : '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-brand-600 transition-colors" aria-label="Facebook">
                  <Globe size={16} className="text-zinc-400 hover:text-white" />
                </a>
              )}
              {social.twitter && (
                <a href={social.twitter?.startsWith('https://') ? social.twitter : '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-brand-600 transition-colors" aria-label="Twitter">
                  <Globe size={16} className="text-zinc-400 hover:text-white" />
                </a>
              )}
              {social.youtube && (
                <a href={social.youtube?.startsWith('https://') ? social.youtube : '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-brand-600 transition-colors" aria-label="YouTube">
                  <Globe size={16} className="text-zinc-400 hover:text-white" />
                </a>
              )}
              {social.whatsapp && (
                <a href={social.whatsapp?.startsWith('https://') ? social.whatsapp : '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-green-600 transition-colors" aria-label="WhatsApp">
                  <MessageCircle size={16} className="text-zinc-400 hover:text-white" />
                </a>
              )}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-heading font-semibold mb-4 text-sm">{footer.quickLinksTitle}</h4>
            <ul className="space-y-2.5">
              {footer.quickLinks.map((link) => (
                <li key={link.url}>
                  <Link to={link.url} className="text-sm text-zinc-500 hover:text-white transition-colors duration-200 inline-flex items-center gap-1 group">
                    {link.label}
                    <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
              ))}
              {footer.extraLinks?.map((link) => (
                <li key={link.url}>
                  <a href={link.url?.startsWith('http') ? link.url : '#'} target="_blank" rel="noopener noreferrer" className="text-sm text-zinc-500 hover:text-white transition-colors duration-200 inline-flex items-center gap-1 group">
                    {link.label}
                    <ArrowUpRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                </li>
              ))}
              <li className="pt-2">
                <Link to="/r/privacy" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Privacy Policy</Link>
                <span className="text-zinc-700 mx-2">·</span>
                <Link to="/r/terms" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Terms</Link>
              </li>
            </ul>
          </div>

          {/* Primary outlet */}
          <div>
            <h4 className="text-white font-heading font-semibold mb-4 text-sm">{outlets[0]?.name || 'Main Outlet'}</h4>
            <ul className="space-y-3 text-sm">
              {outlets[0]?.address_lines?.map((line: string, i: number) => (
                <li key={i} className="flex gap-2">
                  {i === 0 ? (
                    <MapPin size={14} className="mt-0.5 shrink-0" style={{ color: brand.primaryColor }} />
                  ) : (
                    <span className="w-[14px] shrink-0" aria-hidden="true" />
                  )}
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((outlets[0]?.address_lines ?? []).join(' '))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-500 leading-relaxed hover:text-white transition-colors break-words"
                  >
                    {line}
                  </a>
                </li>
              ))}
              {outlets[0]?.phones && outlets[0].phones.length > 0 && (
                <li className="flex gap-2 flex-wrap">
                  <Phone size={14} className="mt-0.5 shrink-0" style={{ color: brand.primaryColor }} />
                  {outlets[0].phones.map((p: string) => (
                    <a
                      key={p}
                      href={`tel:+91${p}`}
                      className="text-zinc-500 hover:text-white transition-colors"
                    >
                      {p}
                    </a>
                  )).reduce((acc: React.ReactNode[], curr: React.ReactNode, idx: number) => {
                    if (idx > 0) acc.push(<span key={`sep-${idx}`} className="text-zinc-700 mx-0.5">·</span>);
                    acc.push(curr);
                    return acc;
                  }, [])}
                </li>
              )}
              <li className="flex gap-2">
                <Clock size={14} className="mt-0.5 shrink-0" style={{ color: brand.primaryColor }} />
                <span className="text-zinc-500">{footer.deliveryHoursText.replace('{hours}', deliveryHours || '11 AM – 4 AM')}</span>
              </li>
              {paymentMethods.length > 0 && (
                <li className="flex gap-2 flex-wrap items-center pt-1">
                  <span className="text-xs text-zinc-600">{footer.paymentLabel}</span>
                  {paymentMethods.map((m) => (
                    <span key={m} className="text-xs text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded">{m}</span>
                  ))}
                </li>
              )}
            </ul>
            {/* Track order CTA */}
            <Link
              to="/r/account"
              className="inline-flex items-center gap-1.5 mt-4 px-5 py-2.5 rounded-full text-white text-xs font-semibold hover:opacity-90 transition-all duration-200 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)]"
              style={{ backgroundColor: brand.primaryColor }}
            >
              {footer.trackOrderText} <ArrowUpRight size={12} />
            </Link>
          </div>

          {/* Other outlets */}
          {outlets.length > 1 && (
            <div>
              <h4 className="text-white font-heading font-semibold mb-4 text-sm">{footer.otherOutletsTitle}</h4>
              <div className="text-sm space-y-2 text-zinc-500">
                {outlets.slice(1).map((o) => (
                  <div key={o.id} className="break-words">
                    <span className="font-medium text-zinc-300">{o.name}:</span>{' '}
                    {o.phones?.map((p: string) => (
                      <a
                        key={p}
                        href={`tel:+91${p}`}
                        className="text-zinc-400 hover:text-white transition-colors"
                      >
                        {p}
                      </a>
                    )).reduce((acc: React.ReactNode[], curr: React.ReactNode, idx: number) => {
                      if (idx > 0) acc.push(<span key={`sep-${idx}`} className="text-zinc-600 mx-0.5">·</span>);
                      acc.push(curr);
                      return acc;
                    }, [])}
                  </div>
                ))}
              </div>
              <Link
                to="/r/locations"
                className="inline-flex items-center gap-1.5 mt-4 px-5 py-2.5 rounded-full text-white text-xs font-semibold hover:opacity-90 transition-all duration-200 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)]"
                style={{ backgroundColor: brand.primaryColor }}
              >
                {footer.viewLocationsText}
                <ArrowUpRight size={12} />
              </Link>
            </div>
          )}
        </div>

        {/* Trust badges */}
        <div className="mt-12 pt-8 border-t border-zinc-800/80">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-white font-heading font-semibold mb-4 text-sm">{footer.trustTitle}</h4>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2.5 sm:gap-3">
                <span className="inline-flex items-center gap-2 bg-zinc-800/60 text-zinc-300 px-4 py-2.5 rounded-xl text-xs font-medium">
                  <ShieldCheck size={14} className="text-emerald-400 shrink-0" /> Secure Checkout
                </span>
                <span className="inline-flex items-center gap-2 bg-zinc-800/60 text-zinc-300 px-4 py-2.5 rounded-xl text-xs font-medium">
                  <Truck size={14} className="text-brand-400 shrink-0" /> Free Delivery
                </span>
                <span className="inline-flex items-center gap-2 bg-zinc-800/60 text-zinc-300 px-4 py-2.5 rounded-xl text-xs font-medium">
                  <Star size={14} className="text-amber-400 shrink-0" /> 4.7 Rated
                </span>
                <span className="inline-flex items-center gap-2 bg-zinc-800/60 text-zinc-300 px-4 py-2.5 rounded-xl text-xs font-medium">
                  <CreditCard size={14} className="text-blue-400 shrink-0" /> Cash &amp; UPI
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 pt-6 border-t border-zinc-800/80 flex flex-col sm:flex-row justify-between gap-3 text-xs text-zinc-600">
          <span>
            {footer.copyrightText || `\u00a9 ${new Date().getFullYear()} ${restaurantName}${outlets[0]?.name ? `, ${outlets[0].name}` : ''}. All rights reserved.`}
          </span>
          <div className="flex items-center gap-4 flex-wrap">
            {social.instagram && (
              <a href={social.instagram?.startsWith('https://') ? social.instagram : '#'} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">Instagram</a>
            )}
            {social.facebook && (
              <a href={social.facebook?.startsWith('https://') ? social.facebook : '#'} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">Facebook</a>
            )}
            {social.twitter && (
              <a href={social.twitter?.startsWith('https://') ? social.twitter : '#'} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">Twitter</a>
            )}
            {social.youtube && (
              <a href={social.youtube?.startsWith('https://') ? social.youtube : '#'} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">YouTube</a>
            )}
            {social.whatsapp && (
              <a href={social.whatsapp?.startsWith('https://') ? social.whatsapp : '#'} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">WhatsApp</a>
            )}
            <span className="text-zinc-700">{footer.taxNote}</span>
          </div>
        </div>

        {/* Back to top — hidden on phones, where it would sit on top of
            the content and collide with the sticky mobile action bars. */}
        <button
          onClick={scrollToTop}
          className="hidden sm:flex fixed bottom-6 right-6 z-40 w-11 h-11 rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 items-center justify-center transition-all shadow-lg group"
          aria-label="Back to top"
        >
          <Pizza size={18} className="transition-transform duration-500 group-hover:rotate-[360deg] group-hover:scale-110" />
        </button>
      </div>
    </footer>
  );
}
