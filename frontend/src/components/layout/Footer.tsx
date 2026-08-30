import { Link } from 'react-router-dom';
import { MapPin, Phone, Clock, Pizza, ArrowUpRight } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-zinc-950 text-zinc-400">
      <div className="container-page py-12 sm:py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5 text-white mb-4">
              <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white">
                <Pizza size={16} />
              </div>
              <div>
                <span className="font-heading font-bold text-base">Orange Cheese</span>
                <span className="font-heading font-bold text-base text-brand-400"> Pizza</span>
              </div>
            </div>
            <p className="text-sm text-zinc-500 leading-relaxed max-w-xs">
              100% Real Mozzarella · All prices include tax · Free delivery 11 AM to 4 AM
            </p>
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
              <li className="pt-2">
                <Link to="/r/privacy" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Privacy Policy</Link>
                <span className="text-zinc-700 mx-2">·</span>
                <Link to="/r/terms" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">Terms</Link>
              </li>
            </ul>
          </div>

          {/* Mira Road East */}
          <div>
            <h4 className="text-white font-heading font-semibold mb-4 text-sm">Mira Road East</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex gap-2">
                <MapPin size={14} className="mt-0.5 shrink-0 text-brand-400" />
                <span className="text-zinc-500 leading-relaxed">Shop 21, B Wing, Winstone PNK, Beverly Park, Mira Road East, Thane 401107</span>
              </li>
              <li className="flex gap-2">
                <Phone size={14} className="mt-0.5 shrink-0 text-brand-400" />
                <span className="text-zinc-500">83692 93998 · 85916 83998</span>
              </li>
              <li className="flex gap-2">
                <Clock size={14} className="mt-0.5 shrink-0 text-brand-400" />
                <span className="text-zinc-500">Delivery 11 AM – 4 AM daily</span>
              </li>
            </ul>
          </div>

          {/* Other Outlets */}
          <div>
            <h4 className="text-white font-heading font-semibold mb-4 text-sm">Other Outlets</h4>
            <div className="text-sm space-y-2 text-zinc-500">
              <div>Vasai West: <span className="text-zinc-400">96650 43998</span></div>
              <div>Bhayandar West: <span className="text-zinc-400">85916 43998</span></div>
            </div>
            <Link
              to="/r/locations"
              className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-all duration-200"
            >
              View All Locations
              <ArrowUpRight size={12} />
            </Link>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-zinc-800/80 flex flex-col sm:flex-row justify-between gap-3 text-xs text-zinc-600">
          <span>&copy; {new Date().getFullYear()} Orange Cheese Pizza, Mira Road East. All rights reserved.</span>
          <span className="text-zinc-700">All prices include tax</span>
        </div>
      </div>
    </footer>
  );
}
