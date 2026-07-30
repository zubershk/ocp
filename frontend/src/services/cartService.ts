import { CartItem } from '../types';
const KEY = 'ocp_cart';
export const cartService = {
  getCart(): CartItem[] {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  },
  saveCart(items: CartItem[]) {
    localStorage.setItem(KEY, JSON.stringify(items));
  },
  clear() { localStorage.removeItem(KEY); }
};