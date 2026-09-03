import { Link } from 'react-router-dom';
import { MapPin, Phone, Clock, Pizza, ArrowUpRight } from 'lucide-react';
import { useRestaurant, useRestaurantName, useDeliveryHours, useOutletsList, usePaymentInfo } from '../../context/RestaurantContext';
import { useSocial, useFooter, useBrand } from '../../context/SiteSettingsContext';

export default function Footer() {
  const { config } = useRestaurant();
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

  return (
    <footer className="bg-zinc-950 text-zinc-400">
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
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-heading font-semibold mb-4 text-sm">Quick Links</h4>
            <ul className="space-y-2.5">
              {[
                { label: 'Menu', to: '/r/menu' },
                { label: 'Offers', to: '/r/offers' },
                { label: 'Locations', to: '/r/locations' },
                { label: 'About', to: '/r/about' },
                { label: 'Reviews', to: '/r/reviews' },
                { label: 'FAQ', to: '/r/faq' },
                { label: 'Contact', to: '/r/contact' },
              ].map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-sm text-zinc-500 hover:text-white transition-colors duration-200 inline-flex items-center gap-1 group">
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
                  {i === 0 && <MapPin size={14} className="mt-0.5 shrink-0" style={{ color: brand.primaryColor }} />}
                  <span className="text-zinc-500 leading-relaxed">{line}</span>
                </li>
              ))}
              {outlets[0]?.phones && outlets[0].phones.length > 0 && (
                <li className="flex gap-2">
                  <Phone size={14} className="mt-0.5 shrink-0" style={{ color: brand.primaryColor }} />
                  <span className="text-zinc-500">{outlets[0].phones.join(' · ')}</span>
                </li>
              )}
              <li className="flex gap-2">
                <Clock size={14} className="mt-0.5 shrink-0" style={{ color: brand.primaryColor }} />
                <span className="text-zinc-500">Delivery {deliveryHours} daily</span>
              </li>
              {paymentMethods.length > 0 && (
                <li className="text-zinc-600 text-xs">
                  Payments: {paymentMethods.join(' + ')}
                </li>
              )}
            </ul>
          </div>

          {/* Other outlets */}
          {outlets.length > 1 && (
            <div>
              <h4 className="text-white font-heading font-semibold mb-4 text-sm">Other Outlets</h4>
              <div className="text-sm space-y-2 text-zinc-500">
                {outlets.slice(1).map((o) => (
                  <div key={o.id}>{o.name}: <span className="text-zinc-400">{o.phones?.join(' · ')}</span></div>
                ))}
              </div>
              <Link
                to="/r/locations"
                className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl text-white text-xs font-semibold hover:opacity-90 transition-all duration-200"
                style={{ backgroundColor: brand.primaryColor }}
              >
                View All Locations
                <ArrowUpRight size={12} />
              </Link>
            </div>
          )}
        </div>

        {/* Social + Bottom bar */}
        <div className="mt-12 pt-6 border-t border-zinc-800/80 flex flex-col sm:flex-row justify-between gap-3 text-xs text-zinc-600">
          <span>
            {footer.copyrightText || `\u00a9 ${new Date().getFullYear()} ${restaurantName}${outlets[0]?.name ? `, ${outlets[0].name}` : ''}. All rights reserved.`}
          </span>
          <div className="flex items-center gap-4">
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
            <span className="text-zinc-700">All prices include tax</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
