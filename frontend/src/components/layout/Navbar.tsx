import { Link, NavLink } from 'react-router-dom';
import { ShoppingCart, Menu, X, Pizza, User, ChevronRight } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useState, useEffect } from 'react';

const navItems = [
  { label: 'Home', to: '/r/' },
  { label: 'Menu', to: '/r/menu' },
  { label: 'Offers', to: '/r/offers' },
  { label: 'About', to: '/r/about' },
  { label: 'Contact', to: '/r/contact' },
];

export default function Navbar() {
  const { count } = useCart();
  const { customer } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <header
        className={`
          sticky top-0 z-50 transition-all duration-300
          ${scrolled
            ? 'bg-white/90 backdrop-blur-xl shadow-sm border-b border-stone-100/50'
            : 'bg-white border-b border-stone-100'
          }
        `}
      >
        <div className="container-page">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
              <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white group-hover:shadow-md transition-shadow duration-300">
                <Pizza size={18} />
              </div>
              <div className="hidden sm:block">
                <span className="font-heading font-bold text-lg tracking-tight text-zinc-900">
                  Orange Cheese
                </span>
                <span className="font-heading font-bold text-lg tracking-tight text-brand-600">
                  {' '}Pizza
                </span>
              </div>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.to === '/'}
                  className={({ isActive }) =>
                    `relative px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'text-brand-600 bg-brand-50/60'
                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-stone-50'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {n.label}
                      {isActive && (
                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-brand-600 rounded-full" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-2">
              {/* Account */}
              <Link
                to={customer ? '/r/account' : '/r/login'}
                className={`
                  hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium
                  transition-all duration-200
                  ${customer
                    ? 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm'
                    : 'text-zinc-600 border border-stone-200 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/50'
                  }
                `}
              >
                <User size={14} />
                {customer ? (customer.name ? customer.name.split(' ')[0] : 'Account') : 'Login'}
              </Link>

              {/* Cart */}
              <Link
                to="/r/cart"
                className="relative p-2.5 rounded-xl hover:bg-stone-50 transition-colors duration-200 group"
                aria-label={`Cart with ${count} items`}
              >
                <ShoppingCart size={19} className="text-zinc-600 group-hover:text-brand-600 transition-colors" />
                {count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-brand-600 text-white text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold animate-scale-in shadow-sm">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </Link>

              {/* CTA */}
              <Link
                to="/r/menu"
                className="hidden sm:inline-flex items-center gap-1.5 ml-1 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98]"
              >
                Order Now
                <ChevronRight size={14} />
              </Link>

              {/* Mobile menu toggle */}
              <button
                onClick={() => setOpen(!open)}
                className="lg:hidden p-2 rounded-xl hover:bg-stone-50 transition-colors"
                aria-label="Toggle menu"
              >
                {open ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile slide-in overlay */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-sm animate-fade-in"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="absolute right-0 top-0 h-full w-80 max-w-[85vw] bg-white shadow-2xl animate-slide-in-right">
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
                <span className="font-heading font-bold text-lg">Menu</span>
                <button
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-xl hover:bg-stone-50 transition-colors"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Nav links */}
              <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                {navItems.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.to === '/'}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? 'text-brand-600 bg-brand-50/60'
                          : 'text-zinc-700 hover:bg-stone-50'
                      }`
                    }
                  >
                    {n.label}
                    <ChevronRight size={14} className="ml-auto text-zinc-300" />
                  </NavLink>
                ))}

                <div className="divider my-3" />

                <Link
                  to="/r/cart"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-700 hover:bg-stone-50 transition-all"
                >
                  <ShoppingCart size={16} />
                  Cart
                  {count > 0 && (
                    <span className="ml-auto bg-brand-600 text-white text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold">
                      {count}
                    </span>
                  )}
                </Link>

                <Link
                  to={customer ? '/r/account' : '/r/login'}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-700 hover:bg-stone-50 transition-all"
                >
                  <User size={16} />
                  {customer ? `Hi, ${customer.name || customer.phone}` : 'Login / Sign up'}
                </Link>
              </nav>

              {/* CTA at bottom */}
              <div className="p-4 border-t border-stone-100">
                <Link
                  to="/r/menu"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 transition-all duration-200 shadow-sm"
                >
                  Order Now
                  <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
