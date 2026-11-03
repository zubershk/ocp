import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import type { MenuItem } from '../types';

const RECENT_KEY = 'ocp_recent_searches';
const MAX_RECENTS = 5;
const DEBOUNCE_MS = 300;

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
}

export function useSearch(items: MenuItem[]): UseSearchReturn {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<MenuItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [openDropdown, setOpenDropdown] = useState(false);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Debounced search
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
      const filtered = items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.ingredients.some((i) => i.toLowerCase().includes(q)),
      );
      setResults(filtered);
      setIsSearching(false);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, items]);

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
  };
}