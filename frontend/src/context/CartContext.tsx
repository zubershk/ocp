import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { CartItem, ComboSelectionItem, MenuItem } from '../types';
import { cartService } from '../services/cartService';
import { useCrusts } from './CrustContext';

type CartContextType = {
  items: CartItem[];
  addItem: (item: MenuItem, size: 'regular'|'medium'|'large', crust: string, qty: number) => void;
  /** Adds a combo line billed at the combo price (not the sum of its parts). */
  addCombo: (combo: { slug: string; name: string; image: string; price: number }, selection: ComboSelectionItem[], qty: number) => void;
  updateQty: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  /** Server-validated promo code shared between Cart and Checkout. */
  couponCode: string;
  couponDiscount: number;
  setCoupon: (code: string, discount: number, subtotalAtApply: number) => void;
  clearCoupon: () => void;
};

const CartContext = createContext<CartContextType>(null!);
export const useCart = () => useContext(CartContext);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => cartService.getCart());
  const { getCrustExtra } = useCrusts();
  useEffect(()=>{ cartService.saveCart(items); },[items]);
  const addItem = (menuItem: MenuItem, size: 'regular'|'medium'|'large', crust: string, qty: number) => {
    const price = menuItem.priceBySize ? (menuItem.priceBySize[size] ?? menuItem.price) : menuItem.price;
    const crustExtra = getCrustExtra(crust, size);
    const unit = price + crustExtra;
    const id = `${menuItem.id}-${size}-${crust}`;
    setItems(prev => {
      const ex = prev.find(p=>p.id===id);
      if (ex) return prev.map(p=>p.id===id?{...p, quantity:p.quantity+qty, subtotal:(p.quantity+qty)*unit}:{...p});
      return [...prev, { id, menuItemId: menuItem.id, name: `${menuItem.name} (${size})${crust!=='tossed'?` + ${crust}`:''}`, image: menuItem.image, basePrice: unit, selectedOptions:{}, quantity: qty, subtotal: unit*qty, size, crust }];
    });
  };
  // A combo is billed at the combo price. Its component items are only
  // recorded so the kitchen knows what to prepare — they are not priced
  // separately, which is what caused the "charging individual price" bug.
  const addCombo = (combo: { slug: string; name: string; image: string; price: number }, selection: ComboSelectionItem[], qty: number) => {
    // Two combos with DIFFERENT mixes must stay separate lines: the
    // kitchen needs to know what each one contains. The same mix
    // repeated still merges into one line with a higher quantity.
    const mixKey = [...selection]
      .sort((a, b) => a.menuItemId - b.menuItemId || a.size.localeCompare(b.size))
      .map((s) => `${s.menuItemId}:${s.size}x${s.quantity}`)
      .join('|');
    const id = `combo-${combo.slug}-${mixKey}`;
    const unit = combo.price;
    setItems(prev => {
      const ex = prev.find(p=>p.id===id);
      if (ex) return prev.map(p=>p.id===id?{...p, quantity:p.quantity+qty, subtotal:(p.quantity+qty)*unit}:{...p});
      return [...prev, { id, menuItemId: combo.slug, name: combo.name, image: combo.image, basePrice: unit, selectedOptions:{}, quantity: qty, subtotal: unit*qty, comboSlug: combo.slug, comboSelection: selection }];
    });
  };
  const updateQty = (id: string, qty: number) => {
    if (qty<=0) return setItems(prev=>prev.filter(p=>p.id!==id));
    setItems(prev=>prev.map(p=>p.id===id?{...p, quantity:qty, subtotal:qty*p.basePrice}:p));
  };
  const removeItem = (id: string)=> setItems(prev=>prev.filter(p=>p.id!==id));
  const COUPON_KEY = 'ocp_applied_coupon';
  const loadCoupon = (): { code: string; discount: number; subtotalAtApply: number } => {
    try {
      const raw = sessionStorage.getItem(COUPON_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (c && typeof c.code === 'string' && typeof c.discount === 'number') return c;
      }
    } catch { /* sessionStorage may be unavailable */ }
    return { code: '', discount: 0, subtotalAtApply: 0 };
  };
  const [coupon, setCouponState] = useState(loadCoupon);
  const persistCoupon = (c: { code: string; discount: number; subtotalAtApply: number }) => {
    setCouponState(c);
    try {
      if (c.code) sessionStorage.setItem(COUPON_KEY, JSON.stringify(c));
      else sessionStorage.removeItem(COUPON_KEY);
    } catch { /* ignore */ }
  };
  const setCoupon = (code: string, discount: number, subtotalAtApply: number) => persistCoupon({ code, discount, subtotalAtApply });
  const clearCoupon = () => persistCoupon({ code: '', discount: 0, subtotalAtApply: 0 });
  const count = items.reduce((a,b)=>a+b.quantity,0);
  const subtotal = items.reduce((a,b)=>a+b.subtotal,0);
  // A coupon's discount is tied to the subtotal it was validated against.
  // If the cart changes, drop the code rather than show/submit a stale discount.
  useEffect(() => {
    if (coupon.code && Math.abs(coupon.subtotalAtApply - subtotal) > 0.01) clearCoupon();
  }, [subtotal, coupon.code]);
  const clear = ()=> { setItems([]); clearCoupon(); };
  return <CartContext.Provider value={{ items, addItem, addCombo, updateQty, removeItem, clear, count, subtotal, couponCode: coupon.code, couponDiscount: coupon.discount, setCoupon, clearCoupon }}>{children}</CartContext.Provider>;
}
