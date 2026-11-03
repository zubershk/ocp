import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import type { MenuItem } from '../types';

const RECENT_KEY = 'ocp_recent_searches';
const MAX_RECENTS = 5;
const DEBOUNCE_MS = 300;

export type DietaryFilter = 'all' | 'veg' | 'nonveg';

export interface UseSearchReturn {
  query: string;
  setQuery: (v: string) => void;
  debouncedQuery: string;
  results: MenuItem[];
  isSearching: boolean;
  recentSearches: string[];
  addRecent: (q: string) => void;
  clearRecent: () => void;
  highlightedIndex: number;
  setHighlightedIndex: (v: SetStateAction<number>) => void;
  openDropdown: boolean;
  setOpenDropdown: (b: boolean) => void;
  dietaryFilter: DietaryFilter;
  setDietaryFilter: (v: DietaryFilter) => void;
  categoryFilter: string | null;
  setCategoryFilter: (v: string | null) => void;
}

export function useSearch(items: MenuItem[], initialQuery?: string): UseSearchReturn {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<MenuItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [openDropdown, setOpenDropdown] = useState(false);
  const [dietaryFilter, setDietaryFilter] = useState<DietaryFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) {
        setRecentSearches(JSON.parse(raw));
      }
    } catch {
      // ignore
    }
  }, []);

  // Initialize query from URL param on first mount
  useEffect(() => {
    if (initialized.current || typeof window === 'undefined') return;
    initialized.current = true;
    if (initialQuery) {
      setQuery(initialQuery);
      setOpenDropdown(true);
    }
  }, [initialQuery]);

  const addRecent = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((r) => r.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, MAX_RECENTS);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // ignore
    }
  }, []);

  // Debounced search with dietary + category filters
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setIsSearching(true);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(query);
      if (!query.trim()) {
        setResults([]);
        setIsSearching(false);
        return;
      }
      const q = query.toLowerCase();
      const filtered = items.filter((item) => {
        // Dietary filter
        if (dietaryFilter === 'veg' && item.dietary !== 'veg') return false;
        if (dietaryFilter === 'nonveg' && item.dietary !== 'nonveg') return false;
        // Category filter
        if (categoryFilter && item.category !== categoryFilter) return false;
        // Text search
        return (
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.ingredients.some((i) => i.toLowerCase().includes(q))
        );
      });
      setResults(filtered);
      setIsSearching(false);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, items, dietaryFilter, categoryFilter]);

  // Reset highlight when query or results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [debouncedQuery, results.length]);

  return {
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
    dietaryFilter,
    setDietaryFilter,
    categoryFilter,
    setCategoryFilter,
  };
}