import { useEffect, useState } from 'react';
import { loadMenu, type MenuSnapshot } from '../services/menuService';
import type { Category, MenuItem } from '../types';

interface UseMenuResult {
  snapshot: MenuSnapshot | null;
  items: MenuItem[];
  categories: Category[];
  loading: boolean;
}

export function useMenuItems(): UseMenuResult {
  const [snapshot, setSnapshot] = useState<MenuSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    loadMenu().then((loaded) => {
      if (alive) setSnapshot(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  const items = snapshot?.items ?? [];
  const categories = snapshot?.categories ?? [];

  return { snapshot, items, categories, loading: snapshot === null };
}
