import { MapPin, Phone, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useOutletsList, useOutletNames } from '../context/RestaurantContext';

export default function Locations() {
  const outlets = useOutletsList();
  const outletNames = useOutletNames();
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold mb-2">Our Locations</h1>
      <p className="text-zinc-500 mb-8">
        Visit us at any of our outlets{outletNames.length > 0 ? ` across ${outletNames.join(', ')}` : ''}.
      </p>

      <div className="space-y-6">
        {outlets.map((o) => (
          <div
            key={o.id}
            className={`rounded-2xl border p-6 ${
              o.online_ordering
                ? 'bg-white border-orange-200 shadow-sm'
                : 'bg-zinc-50 border-zinc-100'
            }`}
          >
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h2 className="text-xl font-bold">{o.name}</h2>
              {o.online_ordering ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                  <CheckCircle size={13} /> Online Ordering Available
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-zinc-100 text-zinc-500 text-xs font-medium">
                  <XCircle size={13} /> Location Only
                </span>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <div className="flex items-start gap-2.5">
                <MapPin size={16} className="text-orange-500 mt-0.5 shrink-0" />
                <div className="text-sm text-zinc-600 leading-relaxed">
                  {o.address_lines.map((line: string) => <div key={line}>{line}</div>)}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 text-sm">
                  <Phone size={15} className="text-orange-500 shrink-0" />
                  <span className="text-zinc-600">{o.phones.join(' · ')}</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm">
                  <Clock size={15} className="text-orange-500 shrink-0" />
                  <span className="text-zinc-600">Delivery {o.delivery_hours}</span>
                </div>
              </div>
            </div>

            {o.online_ordering && (
              <a
                href="/r/menu"
                className="inline-flex mt-4 px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700"
              >
                Order from this outlet
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
        <strong>Note:</strong> Online ordering through this website is currently available
        only for the {outletNames[0] || 'primary'} outlet. Please call your nearest outlet directly for
        {outletNames.length > 1 ? ` orders at ${outletNames.slice(1).join(' or ')}` : ''}.
      </div>
    </div>
  );
}
