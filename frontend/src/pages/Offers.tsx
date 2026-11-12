import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ShoppingBag, Tag, Package, ArrowRight, Check, Plus, Minus, X, Sparkles, RotateCcw } from 'lucide-react';
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

/** One item in the combo's starting (default) mix. */
interface ComboDefaultSelection {
  menu_item_id: number;
  name: string;
  size: string;
  quantity: number;
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
  default_selection?: ComboDefaultSelection[];
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
    <div className="page-container py-5 sm:py-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-50 to-white border border-orange-50/20 mb-6 sm:mb-8 px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80')] bg-cover bg-center opacity-20"></div>
        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <Badge className="bg-orange-100 text-orange-700 font-medium px-3 py-1 rounded-full">
              <Tag className="w-4 h-4 mr-1" />
              Combo Deals
            </Badge>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-3 sm:mb-4 lg:text-5xl">
            More value on every order
          </h1>
          <p className="text-base sm:text-lg text-zinc-600 max-w-xl leading-relaxed">
            Grab a combo deal built from our menu — curated bundles at a special price.
          </p>
        </div>
      </div>

      {!hasOffers && (
        <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center px-4">
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
        <section className="mb-10 sm:mb-12">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-heading font-bold">Combo Deals</h2>
              <p className="text-sm text-zinc-500">
                Curated bundles from our menu — pick one and add it to your cart.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {combos.map((combo) => (
              <div
                key={combo.id}
                className="group relative flex flex-col rounded-2xl border border-border bg-white overflow-hidden hover:shadow-xl transition-all duration-300"
              >
                <div className="relative h-36 sm:h-40 bg-orange-50 overflow-hidden">
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

                <div className="flex flex-1 flex-col p-4 sm:p-5">
                  <h3 className="font-bold text-zinc-900 leading-snug">{combo.name}</h3>
                  {combo.description && (
                    <p className="text-sm text-zinc-600 mt-1 line-clamp-2">{combo.description}</p>
                  )}

                  {combo.requires_selection ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-orange-700">
                        Pick any {combo.selection_limit} — your choice
                      </p>
                      {/* Show the pool up front so the customer knows what
                          they can choose from before opening the picker. */}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {combo.items.map((item) => (
                          <span
                            key={item.id}
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-stone-100 text-zinc-600"
                          >
                            {item.name}
                          </span>
                        ))}
                      </div>
                    </div>
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

                  <div className="mt-4 pt-4 border-t border-stone-100 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div className="flex items-baseline gap-2 sm:block">
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
                      className="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 active:scale-[0.98] transition-all"
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

      {/* Selection picker for pick-N combos. Rendered into <body> so the
          sheet is always positioned against the viewport, never against
          an ancestor with a transform. */}
      {pickerSlug &&
        createPortal(
          <ComboPicker
            key={pickerSlug}
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
          />,
          document.body,
        )}
    </div>
  );
}

/**
 * ComboPicker lets the customer customise a combo: they pick exactly N
 * items from the pool and may redistribute them (e.g. 2 onion + 1 tomato
 * + 1 corn instead of 1 of each), while still paying the combo price.
 *
 * The picker opens on the combo's default mix so the customer starts from
 * a sensible selection rather than an empty list.
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
  const keyOf = (i: ComboItem) => `${i.menu_item_id}:${i.size}`;

  // The customer builds their own mix from a blank slate — nothing is
  // pre-selected for them. The combo's standard mix is offered as a
  // one-tap shortcut instead.
  const standardMix = useMemo(() => {
    const mix: Record<string, number> = {};
    for (const sel of combo.default_selection ?? []) {
      const key = `${sel.menu_item_id}:${sel.size}`;
      mix[key] = (mix[key] ?? 0) + sel.quantity;
    }
    return mix;
  }, [combo.default_selection]);

  const [picked, setPicked] = useState<Record<string, number>>({});

  const limit = combo.selection_limit;
  const total = Object.values(picked).reduce((a, b) => a + b, 0);
  const remaining = limit - total;
  const complete = total === limit;
  const hasStandardMix = Object.keys(standardMix).length > 0;

  // Live value of the current selection, so the customer can see what
  // their customisation is worth while the combo price stays fixed.
  const selectionValue = useMemo(() => {
    let v = 0;
    for (const item of combo.items) {
      const qty = picked[keyOf(item)] ?? 0;
      v += qty * item.unit_price;
    }
    return v;
  }, [picked, combo.items]);

  // Both updaters are purely functional on purpose. React batches rapid
  // taps into a single render, so reading the count from the render-time
  // `picked` would make N quick taps count as 1 (or make the limit check
  // use a stale total).
  const increment = (item: ComboItem) => {
    const k = keyOf(item);
    setPicked((p) => {
      const current = p[k] ?? 0;
      if (current >= limit) return p;
      const total = Object.values(p).reduce((a, b) => a + b, 0);
      if (total >= limit) return p;
      return { ...p, [k]: current + 1 };
    });
  };

  const decrement = (item: ComboItem) => {
    const k = keyOf(item);
    setPicked((p) => {
      const current = p[k] ?? 0;
      if (current <= 0) return p;
      const next = { ...p };
      if (current === 1) delete next[k];
      else next[k] = current - 1;
      return next;
    });
  };

  const useStandardMix = () => setPicked({ ...standardMix });
  const clearAll = () => setPicked({});

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

  // Escape closes the picker, and the page behind must not scroll while
  // the sheet is open (it would scroll the page behind on mobile).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const progress = limit > 0 ? Math.min(100, Math.round((total / limit) * 100)) : 0;

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
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[92vh] max-h-[92dvh] sm:max-h-[90vh] flex flex-col shadow-2xl">
        {/* Drag handle — signals the bottom-sheet behaviour on mobile. */}
        <div className="pt-2.5 pb-1 flex justify-center sm:hidden">
          <div className="h-1 w-10 rounded-full bg-stone-300" />
        </div>

        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-2 sm:pt-0 pb-3 sm:pb-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-heading font-bold text-base sm:text-lg text-zinc-900 truncate">
              {combo.name}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
              Pick <span className="font-semibold text-orange-700">{limit}</span> item
              {limit === 1 ? '' : 's'} — any mix of these {combo.items.length}.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-1 rounded-full text-zinc-400 hover:bg-stone-100 hover:text-zinc-700 transition-colors shrink-0 touch-target"
          >
            <X size={18} />
          </button>
        </div>

        {/* Progress + shortcuts */}
        <div className="px-4 sm:px-5 pb-3">
          <div className="flex items-center justify-between text-xs">
            <span
              className="font-semibold text-zinc-700"
              aria-live="polite"
              aria-atomic="true"
            >
              {total} of {limit} picked
            </span>
            <span className={complete ? 'text-emerald-600 font-semibold' : 'text-zinc-400'}>
              {complete ? 'All picked' : `${remaining} to go`}
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-stone-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                complete ? 'bg-emerald-500' : 'bg-orange-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {(hasStandardMix || total > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {hasStandardMix && (
                <button
                  type="button"
                  onClick={useStandardMix}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 min-h-[40px] rounded-full border border-stone-200 text-zinc-600 hover:bg-stone-50 hover:text-zinc-900 transition-colors"
                >
                  <Sparkles size={13} />
                  Use the combo&apos;s mix
                </button>
              )}
              {total > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 min-h-[40px] rounded-full border border-stone-200 text-zinc-600 hover:bg-stone-50 hover:text-zinc-900 transition-colors"
                >
                  <RotateCcw size={13} />
                  Start over
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-5 pb-4 space-y-2">
          {combo.items.map((item) => {
            const qty = picked[keyOf(item)] ?? 0;
            return (
              <div
                key={item.id}
                className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-xl border transition-colors ${
                  qty > 0 ? 'border-orange-200 bg-orange-50/50' : 'border-stone-100'
                }`}
              >
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt=""
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover bg-orange-50 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-orange-50 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-zinc-900 truncate">{item.name}</div>
                  <div className="text-xs text-zinc-400">
                    {item.size !== 'regular' ? `${item.size} · ` : ''}
                    {money(item.unit_price)} each
                  </div>
                </div>
                <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                  <button
                    onClick={() => decrement(item)}
                    disabled={qty === 0}
                    aria-label={`Remove one ${item.name}`}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-stone-200 flex items-center justify-center text-zinc-700 hover:bg-stone-50 active:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <Minus size={15} />
                  </button>
                  <span className="w-7 sm:w-8 text-center text-base font-bold tabular-nums text-zinc-900">
                    {qty}
                  </span>
                  <button
                    onClick={() => increment(item)}
                    disabled={remaining <= 0}
                    aria-label={`Add one ${item.name}`}
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-orange-200 bg-orange-50 flex items-center justify-center text-orange-700 hover:bg-orange-100 active:bg-orange-200 disabled:opacity-30 disabled:bg-transparent disabled:border-stone-200 disabled:text-zinc-400 transition-colors"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-stone-50/70 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
          <div className="min-w-0 sm:max-w-[45%]">
            <div className="text-xs text-zinc-500 truncate">
              {total > 0 ? `Your pick · worth ${money(selectionValue)}` : 'Combo price, whatever you pick'}
            </div>
            <div className="text-lg font-bold text-zinc-900 leading-tight">
              {money(combo.combo_price)}
            </div>
            {complete && selectionValue > combo.combo_price && (
              <div className="text-xs text-emerald-600 font-semibold">
                You save {money(selectionValue - combo.combo_price)}
              </div>
            )}
          </div>
          <Button
            onClick={() => onConfirm(selection)}
            disabled={!complete}
            size="lg"
            className="w-full sm:w-auto justify-center bg-orange-600 text-white font-semibold hover:bg-orange-700 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {complete ? 'Add to Cart' : `Pick ${remaining} more`}
          </Button>
        </div>
      </div>
    </div>
  );
}
