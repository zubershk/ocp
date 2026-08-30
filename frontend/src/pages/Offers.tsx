import { Link } from 'react-router-dom';
import { Phone, MessageCircle, ShoppingBag } from 'lucide-react';
import { RESTAURANT } from '../data/outlets';
import { useMenuItems } from '../hooks/useMenu';

const offers = [
  {
    title: 'Buy 1 Get 2nd Pizza',
    subtitle: 'Up to 75% OFF',
    description: 'Get your 2nd pizza at a special price when you order any full-price pizza.',
    pricing: 'Regular Rs.150 · Medium Rs.200 · Large Rs.250',
    type: 'info' as const,
  },
  {
    title: 'Family Pack 1',
    subtitle: 'Classic & Favourite',
    description: '2 Regular Pizzas + 1 Garlic Breadstick + 1 Choco Lava Cake. Serves 3–4.',
    pricing: 'Veg Rs.515 · Non-Veg Rs.625',
    vegSlug: 'fp-1-veg',
    nonvegSlug: 'fp-1-nonveg',
    type: 'pack' as const,
  },
  {
    title: 'Family Pack 2',
    subtitle: 'Signature & Supreme',
    description: '2 Regular Signature/Supreme Pizzas + 1 Garlic Breadstick + 1 Choco Lava Cake. Serves 3–4.',
    pricing: 'Veg Rs.640 · Non-Veg Rs.720',
    vegSlug: 'fp-2-veg',
    nonvegSlug: 'fp-2-nonveg',
    type: 'pack' as const,
  },
  {
    title: 'Family Pack 3',
    subtitle: 'Classic & Favourite - Medium',
    description: '2 Medium Pizzas + 1 Garlic Breadstick + 1 Choco Lava Cake + Coke 600ml. Serves 4–5.',
    pricing: 'Veg Rs.1,025 · Non-Veg Rs.1,200',
    vegSlug: 'fp-3-veg',
    nonvegSlug: 'fp-3-nonveg',
    type: 'pack' as const,
  },
  {
    title: 'Family Pack 4',
    subtitle: 'Signature & Supreme - Medium',
    description: '2 Medium Signature/Supreme Pizzas + 2 Garlic Breadsticks + 2 Choco Lava Cakes + Coke 600ml. Serves 5–6.',
    pricing: 'Veg Rs.1,120 · Non-Veg Rs.1,380',
    vegSlug: 'fp-4-veg',
    nonvegSlug: 'fp-4-nonveg',
    type: 'pack' as const,
  },
];

export default function Offers() {
  const { items } = useMenuItems();
  const slugs = new Set(items.map((i) => i.id));
  const anyOrderable = offers.some((o) => o.type === 'pack' && (slugs.has(o.vegSlug!) || slugs.has(o.nonvegSlug!)));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl">Offers &amp; Family Packs</h1>
      <p className="text-zinc-500 mt-2">
        July 2026 promotions from Orange Cheese Pizza Mira Road East.
        All prices include tax.
      </p>

      {anyOrderable ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mt-6 text-sm text-green-800 flex items-start gap-2">
          <ShoppingBag size={16} className="mt-0.5 shrink-0 text-green-700" aria-hidden/>
          <span>Great news — Family Packs are now orderable right here online, with free delivery 11 AM – 4 AM. Tap a pack below.</span>
        </div>
      ) : (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mt-6 text-sm text-orange-800">
          These offers are available on phone and WhatsApp orders. Call us and we&apos;ll get it started.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5 mt-8">
        {offers.map((o) => (
          <div key={o.title} className="bg-white rounded-2xl border border-zinc-100 p-6 flex flex-col hover:shadow-md transition">
            <span className={`inline-flex w-fit px-3 py-1 rounded-full text-xs font-bold mb-3 ${o.type === 'info' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-800'}`}>
              {o.subtitle}
            </span>
            <h2 className="text-xl font-bold">{o.title}</h2>
            <p className="text-sm text-zinc-600 mt-2 flex-1">{o.description}</p>
            <p className="text-sm font-bold text-orange-600 mt-3">{o.pricing}</p>

            {o.type === 'pack' ? (
              (() => {
                const hasVeg = o.vegSlug && slugs.has(o.vegSlug);
                const hasNonVeg = o.nonvegSlug && slugs.has(o.nonvegSlug);
                if (!hasVeg && !hasNonVeg) return null;
                return (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {hasVeg && (
                      <Link to={`/menu/item/${o.vegSlug}`} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition">
                        <ShoppingBag size={14}/> Order Veg
                      </Link>
                    )}
                    {hasNonVeg && (
                      <Link to={`/menu/item/${o.nonvegSlug}`} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black transition">
                        <ShoppingBag size={14}/> Order Non-Veg
                      </Link>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="flex flex-wrap gap-2 mt-4">
                <a href={`tel:+91${RESTAURANT.phones[0]}`} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition">
                  <Phone size={14}/> Call to claim
                </a>
                <a href={`https://wa.me/${RESTAURANT.whatsappNumber}?text=Hi!%20I%20want%20the%20${encodeURIComponent(o.title)}%20offer`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition">
                  <MessageCircle size={14}/> WhatsApp
                </a>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-10 bg-zinc-900 rounded-[2rem] p-8 text-center">
        <h2 className="text-white text-xl lg:text-2xl font-bold">Feeding a crowd?</h2>
        <p className="text-zinc-400 text-sm mt-2 max-w-md mx-auto">Build your own feast from 41 pizzas, sides and desserts — everything is tax-inclusive.</p>
        <Link to="/r/menu" className="inline-flex mt-5 px-6 py-3 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-700 transition">Browse Full Menu</Link>
      </div>
    </div>
  );
}
