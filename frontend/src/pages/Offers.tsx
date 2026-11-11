import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Tag, Package, ArrowRight, Check, Plus, Minus, X } from 'lucide-react';
import { apiGet } from '../services/api';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { ComboSelectionItem } from '../types';
import { Button } from '@/components/shadcn/button';
import { Badge } from '@/components/shadcn/badge';

interface ComboItem {
  id: number;
  menu_item_id: number;
  name: string;
  slug: string;
  image_url: string;
  size: string;
  quantity: number;
  max_qty: number;
  unit_price: number;
  line_total: number;
}

interface Combo {
  id: number;
  name: string;
  slug: string;
  description: string;
  image_url: string;
  combo_price: number;
  mrp_total: number;
  savings: number;
  selection_limit: number;
  requires_selection: boolean;
  items: ComboItem[];
}

const money = (v: number) => `₹${Number(v || 0).toFixed(2)}`;

export default function Offers() {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerSlug, setPickerSlug] = useState<string | null>(null);
  const { addCombo } = useCart();
  const { push } = useToast();

  const fetchOffers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<{ combos: Combo[] }>('/api/combos');
      setCombos(res.combos ?? []);
    } catch {
      setCombos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  if (loading) {
    return (
      <div className="page-container py-8">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600 mb-4">
            <Tag size={24} />
          </div>
          <p className="text-zinc-500 text-sm">Loading offers...</p>
        </div>
      </div>
    );
  }

  const hasOffers = combos.length > 0;

  return (
    <div className="page-container py-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-50 to-white border border-orange-50/20 mb-8 px-8 py-10 lg:px-12 lg:py-12">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80')] bg-cover bg-center opacity-20"></div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <Badge className="bg-orange-100 text-orange-700 font-medium px-3 py-1 rounded-full">
              <Tag className="w-4 h-4 mr-1" />
              Combo Deals
            </Badge>
          </div>
          <h1 className="text-4xl font-bold text-zinc-900 mb-4 lg:text-5xl">More value on every order</h1>
          <p className="text-lg text-zinc-600 max-w-xl leading-relaxed">
            Grab a combo deal built from our menu — curated bundles at a special price.
          </p>
        </div>
      </div>

      {!hasOffers && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Tag size={48} className="text-zinc-300" />
          <h2 className="text-2xl font-bold text-zinc-900 mt-6">No Combo Deals Available</h2>
          <p className="text-zinc-500 mt-2 max-w-md">
            Check back later for exciting combo deals on your favorite pizzas!
          </p>
          <Link
            to="/r/menu"
            className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors"
          >
            <ShoppingBag size={16} /> Browse Menu
          </Link>
        </div>
      )}

      {/* Combos */}
      {combos.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-heading font-bold">Combo Deals</h2>
              <p className="text-sm text-zinc-500">
                Curated bundles from our menu — pick one and add it to your cart.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {combos.map((combo) => (
              <div
                key={combo.id}
                className="group relative flex flex-col rounded-2xl border border-border bg-white overflow-hidden hover:shadow-xl transition-all duration-300"
              >
                <div className="relative h-40 bg-orange-50 overflow-hidden">
                  {combo.image_url ? (
                    <img
                      src={combo.image_url}
                      alt={combo.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-orange-300">
                      <Package size={40} />
                    </div>
                  )}
                  {combo.savings > 0 && (
                    <Badge className="absolute top-3 right-3 bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-md">
                      Save {money(combo.savings)}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-bold text-zinc-900 leading-snug">{combo.name}</h3>
                  {combo.description && (
                    <p className="text-sm text-zinc-600 mt-1 line-clamp-2">{combo.description}</p>
                  )}

                  {combo.requires_selection ? (
                    <p className="text-xs font-semibold text-orange-700 mt-3">
                      Choose any {combo.selection_limit} from {combo.items.length} options
                    </p>
                  ) : (
                    <ul className="mt-4 space-y-1.5 flex-1">
                      {combo.items.map((item) => (
                        <li key={item.id} className="flex items-start gap-2 text-sm text-zinc-600">
                          <Check size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                          <span>
                            {item.quantity} &times; {item.name}
                            {item.size && item.size !== 'regular' ? (
                              <span className="text-zinc-400"> ({item.size})</span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-4 pt-4 border-t border-stone-100 flex items-end justify-between gap-3">
                    <div>
                      <div className="text-xl font-bold text-zinc-900">{money(combo.combo_price)}</div>
                      {combo.mrp_total > combo.combo_price && (
                        <div className="text-xs text-zinc-400 line-through">{money(combo.mrp_total)}</div>
                      )}
                    </div>
                    <Button
                      onClick={() => {
                        if (combo.requires_selection) {
                          setPickerSlug(combo.slug);
                        } else {
                          addCombo(
                            {
                              slug: combo.slug,
                              name: combo.name,
                              image: combo.image_url,
                              price: combo.combo_price,
                            },
                            combo.items.map((i) => ({
                              menuItemId: i.menu_item_id,
                              name: i.name,
                              size: i.size,
                              quantity: i.quantity,
                            })),
                            1,
                          );
                          push({ type: 'success', title: `Added ${combo.name} to cart` });
                        }
                      }}
                      className="inline-flex items-center gap-1.5 bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition-colors"
                    >
                      {combo.requires_selection ? 'Choose Items' : 'Add to Cart'}{' '}
                      <ArrowRight size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Selection picker for pick-N combos */}
      {pickerSlug && (
        <ComboPicker
          combo={combos.find((c) => c.slug === pickerSlug)!}
          onClose={() => setPickerSlug(null)}
          onConfirm={(selection) => {
            const combo = combos.find((c) => c.slug === pickerSlug)!;
            addCombo(
              {
                slug: combo.slug,
                name: combo.name,
                image: combo.image_url,
                price: combo.combo_price,
              },
              selection,
              1,
            );
            push({ type: 'success', title: `Added ${combo.name} to cart` });
            setPickerSlug(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * ComboPicker lets the customer choose exactly N items from the combo's
 * pool. The total selected must equal the combo's selection limit before
 * the combo can be added to the cart.
 */
function ComboPicker({
  combo,
  onClose,
  onConfirm,
}: {
  combo: Combo;
  onClose: () => void;
  onConfirm: (selection: ComboSelectionItem[]) => void;
}) {
  const [picked, setPicked] = useState<Record<string, number>>({});

  const keyOf = (i: ComboItem) => `${i.menu_item_id}:${i.size}`;
  const limit = combo.selection_limit;
  const total = Object.values(picked).reduce((a, b) => a + b, 0);
  const remaining = limit - total;

  const maxFor = (item: ComboItem) => {
    const m = item.max_qty > 0 ? item.max_qty : item.quantity;
    return m > 0 ? m : 1;
  };

  const increment = (item: ComboItem) => {
    if (remaining <= 0) return;
    const k = keyOf(item);
    const current = picked[k] ?? 0;
    if (current >= maxFor(item)) return;
    setPicked((p) => ({ ...p, [k]: current + 1 }));
  };

  const decrement = (item: ComboItem) => {
    const k = keyOf(item);
    const current = picked[k] ?? 0;
    if (current <= 0) return;
    setPicked((p) => {
      const next = { ...p };
      if (current === 1) delete next[k];
      else next[k] = current - 1;
      return next;
    });
  };

  const selection = useMemo<ComboSelectionItem[]>(() => {
    const out: ComboSelectionItem[] = [];
    for (const item of combo.items) {
      const qty = picked[keyOf(item)] ?? 0;
      if (qty > 0) {
        out.push({
          menuItemId: item.menu_item_id,
          name: item.name,
          size: item.size,
          quantity: qty,
        });
      }
    }
    return out;
  }, [picked, combo.items]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Choose items for ${combo.name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-stone-100">
          <div className="min-w-0">
            <h3 className="font-heading font-bold text-lg text-zinc-900 truncate">{combo.name}</h3>
            <p className="text-sm text-zinc-500 mt-0.5">
              Choose any <span className="font-semibold text-orange-700">{limit}</span> item(s)
              {remaining > 0 ? (
                <span> · {remaining} still to pick</span>
              ) : (
                <span className="text-emerald-600 font-semibold"> · all picked</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full text-zinc-400 hover:bg-stone-100 hover:text-zinc-700 transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {combo.items.map((item) => {
            const qty = picked[keyOf(item)] ?? 0;
            const atMax = qty >= maxFor(item);
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-stone-100"
              >
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover bg-orange-50 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-orange-50 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-zinc-900 truncate">{item.name}</div>
                  <div className="text-xs text-zinc-400">
                    {item.size !== 'regular' ? `${item.size} · ` : ''}
                    {money(item.unit_price)}
                    {maxFor(item) > 1 ? ` · max ${maxFor(item)}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => decrement(item)}
                    disabled={qty === 0}
                    aria-label={`Remove one ${item.name}`}
                    className="w-8 h-8 rounded-full border border-stone-200 flex items-center justify-center text-zinc-600 hover:bg-stone-50 disabled:opacity-40 transition-colors"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{qty}</span>
                  <button
                    onClick={() => increment(item)}
                    disabled={atMax || remaining <= 0}
                    aria-label={`Add one ${item.name}`}
                    className="w-8 h-8 rounded-full border border-stone-200 flex items-center justify-center text-zinc-600 hover:bg-stone-50 disabled:opacity-40 transition-colors"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-stone-100 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-zinc-500">Combo price</div>
            <div className="text-lg font-bold text-zinc-900">{money(combo.combo_price)}</div>
          </div>
          <Button
            onClick={() => onConfirm(selection)}
            disabled={total !== limit}
            className="bg-orange-600 text-white font-semibold hover:bg-orange-700 disabled:opacity-50"
          >
            {total !== limit ? `Pick ${remaining} more` : 'Add to Cart'}
          </Button>
        </div>
      </div>
    </div>
  );
}
