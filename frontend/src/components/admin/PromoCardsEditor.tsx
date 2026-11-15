import { useState } from 'react';
import {
  Gift, Truck, Clock3, Award, UtensilsCrossed, MapPin, Star, Flame, Shield, Phone, Mail,
  Plus, Trash2, ChevronDown, ChevronUp, GripVertical, Check, X, Eye, EyeOff,
  Sparkles, Copy, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Switch } from '@/components/shadcn/switch';
import { Badge } from '@/components/shadcn/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/shadcn/popover';
import { cn } from '@/lib/utils';

export interface PromoCard {
  id: string;
  icon: string;
  badge: string;
  title: string;
  desc: string;
  to: string;
  active: boolean;
}

/**
 * The icons the storefront knows how to render. Login.tsx maps these names
 * to lucide components and falls back to Star for anything unknown, so this
 * list is the full set that will actually show up on the site.
 */
const PROMO_ICONS: { name: string; Comp: React.ElementType }[] = [
  { name: 'Gift', Comp: Gift },
  { name: 'Truck', Comp: Truck },
  { name: 'Clock3', Comp: Clock3 },
  { name: 'Award', Comp: Award },
  { name: 'UtensilsCrossed', Comp: UtensilsCrossed },
  { name: 'MapPin', Comp: MapPin },
  { name: 'Star', Comp: Star },
  { name: 'Flame', Comp: Flame },
  { name: 'Shield', Comp: Shield },
  { name: 'Phone', Comp: Phone },
  { name: 'Mail', Comp: Mail },
];

/** Storefront routes a promo card can point at. */
const LINK_PRESETS: { value: string; label: string }[] = [
  { value: '/r/offers', label: 'Offers page' },
  { value: '/r/combos', label: 'Combos page' },
  { value: '/r/family-packs', label: 'Family packs' },
  { value: '/r/menu', label: 'Menu page' },
  { value: '/r/locations', label: 'Locations page' },
  { value: '/r/about', label: 'About page' },
  { value: '/r/contact', label: 'Contact page' },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'promo';

const makeId = (used: string[]) => {
  let base = 'promo-card';
  let n = 1;
  while (used.includes(base)) base = `promo-card-${++n}`;
  return base;
};

export function PromoCardsEditor({
  cards,
  onChange,
}: {
  cards: PromoCard[];
  onChange: (next: PromoCard[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const activeCount = cards.filter((c) => c.active !== false).length;

  const updateCard = (id: string, patch: Partial<PromoCard>) => {
    onChange(cards.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const removeCard = (id: string) => {
    onChange(cards.filter((c) => c.id !== id));
    if (openId === id) setOpenId(null);
  };

  const duplicateCard = (id: string) => {
    const source = cards.find((c) => c.id === id);
    if (!source) return;
    const copy: PromoCard = {
      ...source,
      id: makeId(cards.map((c) => c.id)),
      title: `${source.title} (copy)`,
    };
    const idx = cards.findIndex((c) => c.id === id);
    const next = [...cards];
    next.splice(idx + 1, 0, copy);
    onChange(next);
    setOpenId(copy.id);
  };

  const move = (id: string, dir: -1 | 1) => {
    const idx = cards.findIndex((c) => c.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= cards.length) return;
    const next = [...cards];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const addCard = () => {
    const card: PromoCard = {
      id: makeId(cards.map((c) => c.id)),
      icon: 'Star',
      badge: 'New offer',
      title: 'New promo card',
      desc: '',
      to: '/r/offers',
      active: true,
    };
    onChange([...cards, card]);
    setOpenId(card.id);
  };

  const applyJson = (text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
      const clean: PromoCard[] = parsed.map((raw, _i) => ({
        id: String(raw?.id ?? makeId(parsed.map((_, n) => String(n)))),
        icon: String(raw?.icon ?? 'Star'),
        badge: String(raw?.badge ?? ''),
        title: String(raw?.title ?? ''),
        desc: String(raw?.desc ?? ''),
        to: String(raw?.to ?? '/r/offers'),
        active: raw?.active !== false,
      }));
      onChange(clean);
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
        <Sparkles size={14} className="shrink-0 text-zinc-400" />
        <span className="text-[13px] font-medium text-zinc-700">
          {cards.length} card{cards.length === 1 ? '' : 's'}
        </span>
        <span className="text-[13px] text-zinc-500">
          · {activeCount} showing on the login page
        </span>
        <span className="text-[11px] text-zinc-400">· one is picked at random per visit</span>
        <Button type="button" variant="outline" size="sm" onClick={addCard} className="ml-auto h-7 gap-1.5 px-2.5 text-[12px]">
          <Plus size={13} /> Add card
        </Button>
      </div>

      {cards.length === 0 && (
        <div className="rounded-xl border border-dashed border-stone-300 px-6 py-10 text-center">
          <Sparkles size={20} className="mx-auto text-zinc-300" />
          <p className="mt-3 text-[13px] font-medium text-zinc-700">No promo cards yet</p>
          <p className="mt-1 text-[12px] text-zinc-500">
            Add a card to show a rotating offer on the login page.
          </p>
          <Button type="button" size="sm" onClick={addCard} className="mt-4 h-8 gap-1.5 text-[12px]">
            <Plus size={13} /> Add your first card
          </Button>
        </div>
      )}

      {/* Card list */}
      <ul className="space-y-2">
        {cards.map((card, idx) => {
          const isOpen = openId === card.id;
          const Icon = PROMO_ICONS.find((i) => i.name === card.icon)?.Comp ?? Star;
          return (
            <li
              key={card.id}
              className={cn(
                'overflow-hidden rounded-xl border bg-white transition-colors',
                card.active === false ? 'border-stone-200 opacity-70' : 'border-stone-200',
                isOpen && 'ring-1 ring-brand-200',
              )}
            >
              {/* Collapsed row */}
              <div className="flex items-center gap-2 p-2.5">
                <GripVertical size={14} className="shrink-0 text-zinc-300" aria-hidden />
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : card.id)}
                  aria-expanded={isOpen}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon size={15} stroke={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold text-zinc-900">
                        {card.title || 'Untitled card'}
                      </span>
                      {card.badge && (
                        <Badge variant="secondary" className="shrink-0 text-[10px] font-semibold">
                          {card.badge}
                        </Badge>
                      )}
                      {card.active === false && (
                        <Badge variant="outline" className="shrink-0 text-[10px] text-zinc-400">
                          Hidden
                        </Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                      {card.desc || 'No description'} · {card.to}
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => updateCard(card.id, { active: card.active === false })}
                    aria-label={card.active === false ? 'Show card' : 'Hide card'}
                    title={card.active === false ? 'Show on login page' : 'Hide from login page'}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    {card.active === false ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => move(card.id, -1)}
                    disabled={idx === 0}
                    aria-label="Move card up"
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(card.id, 1)}
                    disabled={idx === cards.length - 1}
                    aria-label="Move card down"
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateCard(card.id)}
                    aria-label="Duplicate card"
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeCard(card.id)}
                    aria-label={`Delete ${card.title || 'card'}`}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Expanded editor */}
              {isOpen && (
                <div className="space-y-4 border-t border-stone-200 bg-stone-50/60 p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`promo-badge-${card.id}`} className="text-xs font-medium text-zinc-600">Badge</label>
                      <Input
                        id={`promo-badge-${card.id}`}
                        value={card.badge}
                        onChange={(e) => updateCard(card.id, { badge: e.target.value })}
                        placeholder="Family Pack"
                        className="mt-1 h-9 text-[13px]"
                      />
                    </div>
                    <div>
                      <label htmlFor={`promo-link-${card.id}`} className="text-xs font-medium text-zinc-600">Link</label>
                      <div className="mt-1 flex gap-1.5">
                        <Input
                          id={`promo-link-${card.id}`}
                          value={card.to}
                          onChange={(e) => updateCard(card.id, { to: e.target.value })}
                          placeholder="/r/offers"
                          className="h-9 flex-1 font-mono text-[12px]"
                        />
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 px-2.5 text-[12px]">
                              Pick
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-52 p-1.5">
                            {LINK_PRESETS.map((preset) => (
                              <button
                                key={preset.value}
                                type="button"
                                onClick={() => updateCard(card.id, { to: preset.value })}
                                className={cn(
                                  'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-muted',
                                  card.to === preset.value && 'bg-muted font-medium',
                                )}
                              >
                                <span>{preset.label}</span>
                                <span className="font-mono text-[10px] text-zinc-400">{preset.value}</span>
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor={`promo-title-${card.id}`} className="text-xs font-medium text-zinc-600">Title</label>
                    <Input
                      id={`promo-title-${card.id}`}
                      value={card.title}
                      onChange={(e) => updateCard(card.id, { title: e.target.value })}
                      placeholder="Family Pack from ₹1,515"
                      className="mt-1 h-9 text-[13px]"
                    />
                  </div>

                  <div>
                    <label htmlFor={`promo-desc-${card.id}`} className="text-xs font-medium text-zinc-600">Description</label>
                    <Input
                      id={`promo-desc-${card.id}`}
                      value={card.desc}
                      onChange={(e) => updateCard(card.id, { desc: e.target.value })}
                      placeholder="2 pizzas + garlic bread + choco lava cake"
                      className="mt-1 h-9 text-[13px]"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-zinc-600">Icon</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Icon for ${card.title || "card"}`}
                            className="mt-1 flex h-9 w-full items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 text-left transition-colors hover:border-stone-300"
                          >
                            <span className="flex size-5 items-center justify-center text-brand-600">
                              <Icon size={14} stroke={1.75} />
                            </span>
                            <span className="text-[12px] text-zinc-700">{card.icon}</span>
                            <ChevronDown size={13} className="ml-auto text-zinc-400" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-56 p-2">
                          <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                            Icon
                          </p>
                          <div className="grid grid-cols-6 gap-1">
                            {PROMO_ICONS.map(({ name, Comp }) => (
                              <button
                                key={name}
                                type="button"
                                title={name}
                                aria-label={name}
                                onClick={() => updateCard(card.id, { icon: name })}
                                className={cn(
                                  'flex size-7 items-center justify-center rounded-md transition-colors hover:bg-muted',
                                  card.icon === name && 'bg-brand-50 text-brand-600 ring-1 ring-brand-200',
                                )}
                              >
                                <Comp size={14} stroke={1.75} />
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div>
                      <label htmlFor={`promo-id-${card.id}`} className="text-xs font-medium text-zinc-600">Card ID</label>
                      <Input
                        id={`promo-id-${card.id}`}
                        value={card.id}
                        onChange={(e) => updateCard(card.id, { id: slugify(e.target.value) || card.id })}
                        placeholder="family-pack"
                        className="mt-1 h-9 font-mono text-[12px]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2">
                    <div>
                      <p className="text-[12px] font-medium text-zinc-700">Show on the login page</p>
                      <p className="text-[11px] text-zinc-500">Hidden cards are ignored but kept.</p>
                    </div>
                    <Switch
                      size="sm"
                      id={`promo-active-${card.id}`}
                      checked={card.active !== false}
                      onCheckedChange={(checked) => updateCard(card.id, { active: checked })}
                      aria-label="Show on the login page"
                    />
                  </div>

                  {/* Live preview */}
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Preview
                    </p>
                    <div className="rounded-xl border border-stone-200 bg-white p-3">
                      <div className="flex items-start gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                          <Icon size={15} stroke={1.75} />
                        </span>
                        <div className="min-w-0">
                          {card.badge && (
                            <Badge variant="secondary" className="mb-1 text-[10px] font-semibold">
                              {card.badge}
                            </Badge>
                          )}
                          <p className="text-[13px] font-semibold text-zinc-900">
                            {card.title || 'Untitled card'}
                          </p>
                          {card.desc && <p className="mt-0.5 text-[12px] text-zinc-500">{card.desc}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Advanced JSON escape hatch */}
      <div className="rounded-lg border border-dashed border-stone-300">
        <button
          type="button"
          onClick={() => {
            setJsonOpen((v) => {
              if (!v) setJsonText(JSON.stringify(cards, null, 2));
              return !v;
            });
          }}
          aria-expanded={jsonOpen}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          {jsonOpen ? <ChevronUp size={13} className="text-zinc-400" /> : <ChevronDown size={13} className="text-zinc-400" />}
          <span className="text-[12px] font-medium text-zinc-500">Paste JSON instead</span>
        </button>
        {jsonOpen && (
          <div className="border-t border-dashed border-stone-300 p-3">
            <textarea
              aria-label="Promo cards JSON"
              value={jsonText}
              onChange={(e) => applyJson(e.target.value)}
              rows={10}
              spellCheck={false}
              aria-invalid={!!jsonError}
              className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 font-mono text-[12px] leading-relaxed focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
            />
            {jsonError ? (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-red-600">
                <AlertCircle size={11} /> {jsonError}
              </p>
            ) : (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <Check size={11} /> Applied — {cards.length} card{cards.length === 1 ? '' : 's'}
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setJsonText(JSON.stringify(cards, null, 2));
                setJsonError(null);
              }}
              className="mt-2 h-7 px-2 text-[11px]"
            >
              <X size={12} className="mr-1" /> Reset to current cards
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
