import { Link } from 'react-router-dom';
import { ShoppingBag, ChevronRight } from 'lucide-react';
import { useCart } from '../../context/CartContext';

export default function FloatingCartBar() {
  const { count, subtotal } = useCart();

  if (count === 0) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
      <Link
        to="/r/cart"
        className="flex items-center justify-between w-full px-5 py-3.5 rounded-2xl bg-brand-600 text-white shadow-lg hover:bg-brand-700 transition-all active:scale-[0.98]"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <ShoppingBag size={20} />
            <span className="absolute -top-2 -right-2 bg-white text-brand-600 text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold">
              {count}
            </span>
          </div>
          <div>
            <div className="text-sm font-semibold">{count} {count === 1 ? 'item' : 'items'}</div>
            <div className="text-xs text-white/70">₹{subtotal} · incl. tax</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-sm font-bold">
          View Cart <ChevronRight size={16} />
        </div>
      </Link>
    </div>
  );
}
