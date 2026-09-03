import { Link } from 'react-router-dom';
import { Phone, MessageCircle, ShoppingBag, Tag, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useAllPhones, useRestaurantPhone, useDeliveryHours, useOutletNames, useRestaurantName } from '../context/RestaurantContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { useMenuItems } from '../hooks/useMenu';

const inr = (n: number) => `Rs.${n.toLocaleString('en-IN')}`;

export default function Offers() {
  const { items } = useMenuItems();
  const { offers: adminOffers, familyPacks } = useSiteSettings();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const allPhones = useAllPhones();
  const restaurantPhone = useRestaurantPhone();
  const deliveryHours = useDeliveryHours();
  const outletNames = useOutletNames();
  const primaryOutlet = outletNames[0] || 'our outlet';
  const restaurantName = useRestaurantName();
  const primaryPhone = allPhones[0] || restaurantPhone;
  const bySlug = new Map(items.map((i) => [i.id, i]));
  const bogo = familyPacks.bogo ?? { title: '', subtitle: '', description: '', pricing: '', active: false };
  const packs = (familyPacks.packs ?? [])
    .filter((p) => p.active !== false)
    .map((p) => ({
      ...p,
      veg: bySlug.get(p.vegSlug),
      nonveg: bySlug.get(p.nonvegSlug),
    }))
    .filter((p) => p.veg || p.nonveg);
  const anyOrderable = packs.length > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl">Offers &amp; Family Packs</h1>
      <p className="text-zinc-500 mt-2">
        Current promotions from {restaurantName || 'our restaurant'} {primaryOutlet}.
        All prices include tax.
      </p>

      {anyOrderable ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mt-6 text-sm text-green-800 flex items-start gap-2">
          <ShoppingBag size={16} className="mt-0.5 shrink-0 text-green-700" aria-hidden/>
          <span>Great news — Family Packs are now orderable right here online, with free delivery {deliveryHours || '11 AM – 4 AM'}. Tap a pack below.</span>
        </div>
      ) : (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mt-6 text-sm text-orange-800">
          These offers are available on phone and WhatsApp orders. Call us and we&apos;ll get it started.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5 mt-8">
        {adminOffers.map((o) => (
          <div key={o.id} className="bg-white rounded-2xl border border-zinc-100 p-6 flex flex-col hover:shadow-md transition overflow-hidden">
            {o.image_url && (
              <img src={o.image_url} alt="" className="w-full h-40 object-cover rounded-xl mb-4 -mt-0" />
            )}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {o.badge && (
                <span className="inline-flex w-fit px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                  {o.badge}
                </span>
              )}
              {o.discount && (
                <span className="inline-flex w-fit px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                  {o.discount}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold">{o.title}</h2>
            {o.subtitle && <p className="text-sm text-zinc-600 mt-2 flex-1">{o.subtitle}</p>}
            {(o.minOrder > 0 || o.maxDiscount > 0) && (
              <p className="text-xs text-zinc-500 mt-2">
                {o.minOrder > 0 && <>Min order ₹{o.minOrder} </>}
                {o.maxDiscount > 0 && <>· Up to ₹{o.maxDiscount} off</>}
              </p>
            )}
            {o.code && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(o.code).catch(() => {});
                  setCopiedCode(o.id);
                  setTimeout(() => setCopiedCode(null), 2000);
                }}
                className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 text-orange-700 text-sm font-mono font-semibold hover:bg-orange-100 transition w-fit"
              >
                {copiedCode === o.id ? <Check size={14} /> : <Copy size={14} />}
                {copiedCode === o.id ? 'Copied!' : o.code}
              </button>
            )}
          </div>
        ))}
      </div>

      {adminOffers.length > 0 && (
        <h2 className="text-2xl font-bold mt-12 flex items-center gap-2">
          <Tag size={20} /> Family Packs
        </h2>
      )}

      <div className="grid md:grid-cols-2 gap-5 mt-8">
        {bogo.active !== false && (
        <div className="bg-white rounded-2xl border border-zinc-100 p-6 flex flex-col hover:shadow-md transition">
          <span className="inline-flex w-fit px-3 py-1 rounded-full text-xs font-bold mb-3 bg-orange-100 text-orange-700">
            {bogo.subtitle}
          </span>
          <h2 className="text-xl font-bold">{bogo.title}</h2>
          <p className="text-sm text-zinc-600 mt-2 flex-1">{bogo.description}</p>
          <p className="text-sm font-bold text-orange-600 mt-3">{bogo.pricing}</p>
          <div className="flex flex-wrap gap-2 mt-4">
            <a href={`tel:+91${primaryPhone}`} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition">
              <Phone size={14}/> Call to claim
            </a>
            <a href={`https://wa.me/91${primaryPhone}?text=Hi!%20I%20want%20the%20${encodeURIComponent(bogo.title)}%20offer`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition">
              <MessageCircle size={14}/> WhatsApp
            </a>
          </div>
        </div>
        )}

        {packs.map((p) => {
          const priceBits = [
            p.veg ? `Veg ${inr(p.veg.price)}` : null,
            p.nonveg ? `Non-Veg ${inr(p.nonveg.price)}` : null,
          ].filter(Boolean);
          const blurb = p.veg?.description || p.nonveg?.description || '';
          return (
            <div key={p.title} className="bg-white rounded-2xl border border-zinc-100 p-6 flex flex-col hover:shadow-md transition">
              <span className="inline-flex w-fit px-3 py-1 rounded-full text-xs font-bold mb-3 bg-amber-100 text-amber-800">
                {p.subtitle}
              </span>
              <h2 className="text-xl font-bold">{p.title}</h2>
              {blurb && <p className="text-sm text-zinc-600 mt-2 flex-1">{blurb}</p>}
              {priceBits.length > 0 && (
                <p className="text-sm font-bold text-orange-600 mt-3">{priceBits.join(' · ')}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-4">
                {p.veg && (
                  <Link to={`/r/menu/item/${p.vegSlug}`} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition">
                    <ShoppingBag size={14}/> Order Veg
                  </Link>
                )}
                {p.nonveg && (
                  <Link to={`/r/menu/item/${p.nonvegSlug}`} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black transition">
                    <ShoppingBag size={14}/> Order Non-Veg
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 bg-zinc-900 rounded-[2rem] p-8 text-center">
        <h2 className="text-white text-xl lg:text-2xl font-bold">Feeding a crowd?</h2>
        <p className="text-zinc-400 text-sm mt-2 max-w-md mx-auto">Build your own feast from {items.length} items on the menu — everything is tax-inclusive.</p>
        <Link to="/r/menu" className="inline-flex mt-5 px-6 py-3 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-700 transition">Browse Full Menu</Link>
      </div>
    </div>
  );
}
