import { Search, X, ArrowRight, Clock, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { useSearch } from '../../hooks/useSearch';
import type { MenuItem } from '../../types';

interface SearchBarProps {
  items: MenuItem[];
  placeholder?: string;
  onSelect?: (item: MenuItem) => void;
  className?: string;
}

export function SearchBar({ items, placeholder = 'Search for a dish or cuisine...', onSelect, className }: SearchBarProps) {
  const { addItem } = useCart();
  const { push } = useToast();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const {
    query,
    setQuery,
    debouncedQuery,
    results,
    isSearching,
    recentSearches,
    addRecent,
    clearRecent,
    highlightedIndex,
    setHighlightedIndex,
    openDropdown,
    setOpenDropdown,
  } = useSearch(items);

  const handleSelect = useCallback(
    (item: MenuItem) => {
      addRecent(item.name);
      setOpenDropdown(false);
      if (onSelect) {
        onSelect(item);
      } else {
        navigate(`/r/menu/item/${item.id}`);
      }
      push({ type: 'success', title: `Added ${item.name} to cart` });
      addItem(item, 'regular', 'tossed', 1);
    },
    [addItem, navigate, onSelect, push],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % (results.length || 1));
        setOpenDropdown(true);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + (results.length || 1)) % (results.length || 1));
        setOpenDropdown(true);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0 && results[highlightedIndex]) {
          handleSelect(results[highlightedIndex]);
        } else if (results.length > 0) {
          handleSelect(results[0]);
        } else if (query.trim()) {
          addRecent(query);
          navigate(`/r/menu?q=${encodeURIComponent(query.trim())}`);
        }
        setOpenDropdown(false);
      } else if (e.key === 'Escape') {
        setOpenDropdown(false);
        setHighlightedIndex(-1);
      }
    },
    [query, results, highlightedIndex, handleSelect, navigate],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      setOpenDropdown(true);
      setHighlightedIndex(-1);
    },
    [setQuery],
  );

  const handleBlur = useCallback(() => {
    setTimeout(() => setOpenDropdown(false), 150);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0) return;
    const itemEl = document.getElementById(`search-result-${highlightedIndex}`);
    itemEl?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  return (
    <div className={`relative max-w-2xl mx-auto ${className ?? ''}`}>
      <div className="relative flex items-center bg-white rounded-full shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-stone-200 overflow-hidden">
        <div className="pl-5 pr-2">
          <Search size={20} className="text-zinc-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpenDropdown(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="flex-1 py-4 text-base text-zinc-900 placeholder:text-zinc-400 bg-transparent outline-none w-full"
        />
        {query.trim() && (
          <button
            onClick={() => {
              setQuery('');
              setOpenDropdown(false);
              setHighlightedIndex(-1);
              inputRef.current?.focus();
            }}
            className="mr-2 text-zinc-400 hover:text-zinc-600"
          >
            <X size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (!query.trim()) return;
            addRecent(query);
            setOpenDropdown(false);
            if (results.length > 0) {
              handleSelect(results[0]);
            } else {
              navigate(`/r/menu?q=${encodeURIComponent(query.trim())}`);
            }
          }}
          className="m-1.5 px-6 py-2.5 rounded-full bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-all shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)] disabled:opacity-60 disabled:cursor-not-allowed"
          disabled={!query.trim()}
        >
          {isSearching ? <ArrowRight size={18} className="animate-spin" /> : <ArrowRight size={18} />}
        </button>
      </div>

      {/* Dropdown */}
      {openDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white rounded-2xl shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] border border-stone-100 overflow-hidden">
          {/* Recent Searches */}
          {!debouncedQuery.trim() && recentSearches.length > 0 && (
            <div className="px-4 py-3 border-b border-stone-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Recent</span>
                <button
                  onClick={clearRecent}
                  className="text-xs text-zinc-400 hover:text-rose-500 transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((recent) => (
                  <button
                    key={recent}
                    onClick={() => {
                      setQuery(recent);
                      setOpenDropdown(true);
                    }}
                    className="px-3 py-1.5 rounded-full bg-white border border-stone-200 text-xs text-zinc-600 hover:bg-stone-50 hover:text-brand-600 hover:border-brand-300 transition-all"
                  >
                    <Clock size={12} className="mr-1" />
                    {recent}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search Results */}
          {(debouncedQuery.trim() || isSearching) && (
            <div className="max-h-[400px] overflow-y-auto">
              {isSearching && (
                <div className="p-4 text-center text-xs text-zinc-500 animate-pulse">
                  Searching...
                </div>
              )}
              {!isSearching && results.length === 0 && debouncedQuery.trim() && (
                <div className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <X size={16} className="text-zinc-400" />
                  </div>
                  <p className="text-sm text-zinc-500">No dishes found for "{debouncedQuery}"</p>
                  <button
                    onClick={() => {
                      setOpenDropdown(false);
                      navigate(`/r/menu?q=${encodeURIComponent(debouncedQuery.trim())}`);
                    }}
                    className="mt-2 text-xs font-medium text-brand-600 hover:underline transition-colors"
                  >
                    Browse all menu <ChevronDown size={14} className="ml-1" />
                  </button>
                </div>
              )}
              {!isSearching && results.length > 0 && (
                <div className="py-1">
                  {results.map((item, idx) => {
                    const isHighlighted = idx === highlightedIndex;
                    return (
                      <div
                        key={item.id}
                        id={`search-result-${idx}`}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        className={`flex items-center gap-3 p-3 transition-colors cursor-pointer border-b border-stone-50 last:border-0 ${
                          isHighlighted
                            ? 'bg-brand-50 border-brand-100'
                            : 'hover:bg-stone-50'
                        }`}
                      >
                        <div className="relative shrink-0">
                          <img
                            src={item.image || 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200&h=200&fit=crop'}
                            alt={item.name}
                            className="w-12 h-12 rounded-xl object-cover bg-stone-100"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200&h=200&fit=crop';
                            }}
                          />
                          {item.dietary === 'veg' && (
                            <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-600 border-2 border-white flex items-center justify-center">
                              <span className="w-2 h-2 rounded-full bg-white" />
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <h4 className="font-medium text-sm text-zinc-900 leading-tight truncate">
                              {item.name}
                            </h4>
                            <span className="text-xs font-bold text-brand-600">₹{item.price}</span>
                          </div>
                          {item.description && (
                            <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
                              {item.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {item.preparationTime && (
                              <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                                <Clock size={10} /> {item.preparationTime} min
                              </span>
                            )}
                            <span className="ml-auto text-[10px] text-brand-600 font-medium">
                              Add
                              <ArrowRight size={12} className="ml-0.5" />
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}