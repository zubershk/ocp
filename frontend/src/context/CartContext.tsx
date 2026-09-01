import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { CartItem, MenuItem } from '../types';
import { cartService } from '../services/cartService';
import { useCrusts } from './CrustContext';

type CartContextType = {
  items: CartItem[];
  addItem: (item: MenuItem, size: 'regular'|'medium'|'large', crust: string, qty: number) => void;
  updateQty: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
  clear: () => void;
  count: number;
  subtotal: number;
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
  const updateQty = (id: string, qty: number) => {
    if (qty<=0) return setItems(prev=>prev.filter(p=>p.id!==id));
    setItems(prev=>prev.map(p=>p.id===id?{...p, quantity:qty, subtotal:qty*p.basePrice}:p));
  };
  const removeItem = (id: string)=> setItems(prev=>prev.filter(p=>p.id!==id));
  const clear = ()=> setItems([]);
  const count = items.reduce((a,b)=>a+b.quantity,0);
  const subtotal = items.reduce((a,b)=>a+b.subtotal,0);
  return <CartContext.Provider value={{ items, addItem, updateQty, removeItem, clear, count, subtotal }}>{children}</CartContext.Provider>;
}