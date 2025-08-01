import { useState, useRef, useEffect } from 'react';
import { MapPin, Search } from 'lucide-react';

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string, city?: string, postal?: string) => void;
  placeholder?: string;
}

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    postcode?: string;
    state?: string;
  };
}

export default function AddressAutocomplete({ value, onChange, placeholder = 'Start typing your address...' }: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const search = (q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < 3) { setSuggestions([]); return; }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ' Mumbai Maharashtra India')}&limit=5&addressdetails=1`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await res.json();
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  const handleSelect = (s: Suggestion) => {
    const city = s.address?.city || s.address?.town || s.address?.village || '';
    const postal = s.address?.postcode || '';
    setQuery(s.display_name.split(',').slice(0, 3).join(','));
    setOpen(false);
    onChange(s.display_name.split(',').slice(0, 3).join(','), city, postal);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
          onFocus={() => query.length >= 3 && suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-3 rounded-2xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-stone-100 shadow-lg overflow-hidden z-50 max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => handleSelect(s)}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-stone-50 transition-colors text-left border-b border-stone-50 last:border-0"
            >
              <MapPin size={16} className="text-brand-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm text-zinc-900 leading-snug">{s.display_name.split(',').slice(0, 3).join(',')}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{s.display_name.split(',').slice(3, 5).join(',')}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
