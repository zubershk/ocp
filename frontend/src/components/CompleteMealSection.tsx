import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useCrusts } from '../context/CrustContext';
import { useHomepage } from '../context/SiteSettingsContext';
import { useToast } from '../context/ToastContext';
import { useMenuItems } from '../hooks/useMenu';
import { Button } from '@/components/shadcn/button';
import { ItemThumb } from './ItemThumb';
import type { MenuItem } from '../types';

/**
 * CompleteMealSection is the storefront's upsell region ("Complete Your
 * Meal"). It has a single owner so the product page, the cart and the
 * checkout all present it identically.
 *
 * What it shows and where it appears are admin configurable:
 *   - title             → `complete_meal_title`
 *   - categories        → `complete_meal_categories` (comma separated)
 *   - item count        → `complete_meal_limit`
 *   - visibility        → `complete_meal_show_on_product|cart|checkout`
 *
 * The add control is always `type="button"`: the region is rendered
 * inside the checkout form, and a submit button there would place the
 * order.
 */
export function CompleteMealSection({
  items,
  className = '',
}: {
  /** Optional override of the item pool; the configured categories are used when omitted. */
  items?: MenuItem[];
  className?: string;
}) {
  const { items: cartItems, addItem } = useCart();
  const { defaultCrust } = useCrusts();
  const { push } = useToast();
  const hp = useHomepage();
  const { items: menuItems } = useMenuItems();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);

  const pool = useMemo(() => {
    const source =
      items ??
      menuItems.filter((m) => hp.completeMealCategories.includes(m.category as string));
    const inCart = new Set(cartItems.map((i) => i.menuItemId));
    return source.filter((m) => !inCart.has(m.id)).slice(0, hp.completeMealLimit);
  }, [items, menuItems, cartItems, hp.completeMealCategories, hp.completeMealLimit]);

  if (pool.length === 0) return null;

  const handleAdd = (item: MenuItem) => {
    setAddingId(item.id);
    addItem(item, 'regular', defaultCrust, 1);
    push({ type: 'success', title: `Added ${item.name} to cart` });
    setAddedId(item.id);
    setAddingId(null);
    window.setTimeout(() => setAddedId((cur) => (cur === item.id ? null : cur)), 1500);
  };

  return (
    <section className={className}>
      <h2 className="font-heading font-bold text-xl sm:text-2xl">{hp.completeMealTitle}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
        {pool.map((item) => {
          const adding = addingId === item.id;
          const added = addedId === item.id;
          return (
            <div
              key={item.id}
              className="bg-white rounded-3xl shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col group"
            >
              <Link to={`/r/menu/item/${item.id}`} aria-label={`View ${item.name}`} className="block">
                <div className="overflow-hidden">
                  <ItemThumb
                    src={item.image}
                    alt={item.name}
                    className="w-full h-40 sm:h-32 lg:h-28 group-hover:scale-105 transition-transform duration-500 ease-out"
                    iconSize={26}
                  />
                </div>
              </Link>
              <div className="p-3 flex flex-col flex-1">
                <h3 className="text-sm font-semibold text-zinc-900 leading-tight line-clamp-1">
                  {item.name}
                </h3>
                <div className="text-sm font-bold text-zinc-900 mt-1">₹{item.price}</div>
                <Button
                  type="button"
                  onClick={() => handleAdd(item)}
                  disabled={adding}
                  aria-label={`Add ${item.name} to cart`}
                  className="w-full gap-2 h-11 mt-3 cursor-pointer bg-brand-600 text-white hover:bg-brand-700 hover:text-white shrink-0 transition-all duration-200 touch-target"
                >
                  {adding ? (
                    <span className="flex items-center gap-1">
                      <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      Adding…
                    </span>
                  ) : added ? (
                    <span className="flex items-center gap-1">
                      <Check size={13} />
                      Added!
                    </span>
                  ) : (
                    <>
                      <Plus size={13} /> Add
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
