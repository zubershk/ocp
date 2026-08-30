import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, TrendingUp, Clock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface SearchAutocompleteProps {
  items: { id: string; name: string; category: string; price: number; image: string; isPopular?: boolean }[];
  onSelect?: (item: any) => void;
}

const RECENT_KEY = 'ocp_recent_searches';
function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function saveRecent(q: string) {
  const recents = getRecent().filter((r) => r !== q);
  recents.unshift(q);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recents.slice(0, 6)));
}

export default function SearchAutocomplete({ items, onSelect }: SearchAutocompleteProps) {
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState(getRecent);
  const inputRef = useRef<HTMLInputElement>(null);
  const nav = useNavigate();

  const popular = useMemo(() => items.filter((i) => i.isPopular).slice(0, 5), [items]);

  const results = useMemo(() => {
    if (!q.trim()) return [];
    const qq = q.toLowerCase();
    return items
      .filter((m) => m.name.toLowerCase().includes(qq) || m.category.toLowerCase().includes(qq))
      .slice(0, 8);
  }, [q, items]);

  const showDropdown = focused && (q.trim() ? results.length > 0 : true);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const handleSelect = (item: any) => {
    saveRecent(item.name);
    setRecentSearches(getRecent());
    setQ('');
    setFocused(false);
    nav(`/r/menu/item/${item.id}`);
    onSelect?.(item);
  };

  const handleSearch = () => {
    if (q.trim()) {
      saveRecent(q.trim());
      setRecentSearches(getRecent());
      setFocused(false);
      nav(`/r/menu?q=${encodeURIComponent(q.trim())}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
    if (e.key === 'Escape') { setFocused(false); inputRef.current?.blur(); }
  };

  return (
    <div className="relative w-full max-w-xl">
      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder="Search for pizza, burgers, pasta..."
          className="w-full pl-12 pr-20 py-3.5 rounded-2xl border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all shadow-sm"
          aria-label="Search menu"
          aria-expanded={showDropdown}
          role="combobox"
          aria-autocomplete="list"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {q && (
            <button onClick={() => setQ('')} className="p-1 rounded-lg hover:bg-stone-100 transition-colors" aria-label="Clear search">
              <X size={14} className="text-zinc-400" />
            </button>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-100 text-[10px] font-bold text-zinc-500">
            ⌘K
          </span>
        </div>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-stone-100 shadow-lg overflow-hidden z-50">
          {q.trim() ? (
            <>
              <div className="px-4 py-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">Results</div>
              {results.map((item) => (
                <button
                  key={item.id}
                  onMouseDown={() => handleSelect(item)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                >
                  <img src={item.image} alt="" className="w-10 h-10 rounded-xl object-cover bg-orange-50" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-900 truncate">{item.name}</div>
                    <div className="text-xs text-zinc-500 capitalize">{item.category.replace('-', ' ')}</div>
                  </div>
                  <span className="text-sm font-semibold text-zinc-900">₹{item.price}</span>
                  <ArrowRight size={14} className="text-zinc-300" />
                </button>
              ))}
              <button
                onMouseDown={handleSearch}
                className="w-full px-4 py-2.5 text-sm text-brand-600 font-semibold hover:bg-brand-50 transition-colors border-t border-stone-100"
              >
                Search for "{q}"
              </button>
            </>
          ) : (
            <>
              {recentSearches.length > 0 && (
                <>
                  <div className="px-4 py-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wide inline-flex items-center gap-1">
                    <Clock size={10} /> Recent
                  </div>
                  {recentSearches.map((r) => (
                    <button
                      key={r}
                      onMouseDown={() => { setQ(r); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                    >
                      <Clock size={14} className="text-zinc-300 shrink-0" />
                      <span className="text-sm text-zinc-700">{r}</span>
                    </button>
                  ))}
                </>
              )}
              {popular.length > 0 && (
                <>
                  <div className="px-4 py-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wide inline-flex items-center gap-1 mt-1">
                    <TrendingUp size={10} /> Most Popular
                  </div>
                  {popular.map((item) => (
                    <button
                      key={item.id}
                      onMouseDown={() => handleSelect(item)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                    >
                      <img src={item.image} alt="" className="w-10 h-10 rounded-xl object-cover bg-orange-50" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-900 truncate">{item.name}</div>
                        <div className="text-xs text-zinc-500">₹{item.price}</div>
                      </div>
                      <ArrowRight size={14} className="text-zinc-300" />
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
