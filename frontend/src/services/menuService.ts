import { apiGet } from './api';
import { menuItems as fallbackItems, crusts, getPopularItems as localPopular } from '../data/menu';
import { categories as localCategories } from '../data/categories';
import {
  Category,
  DietaryType,
  MenuCategory,
  MenuItem,
  PizzaSubcategory,
} from '../types';

// ------------------------------------------------------------------
// API payload types (mirrors Go bot GET /api/menu response)
// ------------------------------------------------------------------

interface ApiCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
}

interface ApiMenuItem {
  id: number;
  category_id: number;
  name: string;
  slug: string;
  description: string;
  price: number;
  image_url: string;
  dietary?: string;
  pizza_subcategory?: string;
  pizza_type?: string;
  is_spicy?: boolean;
  is_jain?: boolean;
  is_new?: boolean;
  no_crust?: boolean;
  price_by_size?: Record<string, number>;
}

interface ApiMenuResponse {
  categories: ApiCategory[];
  items: ApiMenuItem[];
}

export interface MenuSnapshot {
  source: 'api' | 'fallback';
  categories: Category[];
  items: MenuItem[];
}

const DEFAULT_RATING = 4.6;
const DEFAULT_PREP_MINUTES = 20;

/** Backend category slugs → frontend MenuCategory union. */
const CATEGORY_SLUG_MAP: Record<string, MenuCategory> = {
  'veg-pizzas': 'pizza',
  'nonveg-pizzas': 'pizza',
  'value-pizza': 'value-pizza',
  'family-packs': 'family-packs',
  'pasta': 'pasta',
  'garlic-bread': 'garlic-bread',
  'tacos': 'tacos',
  'appetizers': 'appetizers',
  'speciality-chicken': 'speciality-chicken',
  'momos': 'momos',
  'burgers': 'burgers',
  'french-fries': 'french-fries',
  'desserts': 'desserts',
};

/** Presentation-only imagery for category cards (kept local). */
const CATEGORY_IMAGE_BY_SLUG: Record<string, string> = Object.fromEntries(
  localCategories.map((c) => [c.id, c.image]),
);

function mapDietary(raw: string | undefined): DietaryType {
  return raw === 'nonveg' ? 'nonveg' : 'veg';
}

function mapMenuCategory(slug: string | undefined): MenuCategory {
  if (slug && CATEGORY_SLUG_MAP[slug]) return CATEGORY_SLUG_MAP[slug];
  return 'pizza';
}

function mapItem(raw: ApiMenuItem, categorySlug: string): MenuItem {
  const bySize = raw.price_by_size ?? {};
  const hasSizes = ['regular', 'medium', 'large'].some((s) => typeof bySize[s] === 'number');
  const subcategory = (raw.pizza_subcategory || undefined) as PizzaSubcategory | undefined;

  return {
    id: raw.slug || String(raw.id),
    name: raw.name,
    description: raw.description ?? '',
    price: raw.price,
    priceBySize: hasSizes
      ? {
          regular: bySize.regular,
          medium: bySize.medium,
          large: bySize.large,
        }
      : undefined,
    image: raw.image_url ?? '',
    category: mapMenuCategory(categorySlug),
    pizzaSubcategory: subcategory,
    pizzaType: (raw.pizza_type as 'veg' | 'nonveg' | undefined) ?? undefined,
    dietary: mapDietary(raw.dietary),
    rating: DEFAULT_RATING,
    reviewCount: 0,
    ingredients: [],
    allergens: [],
    customizationGroups: [],
    // Presentation heuristic: signature/supreme/desi-tadka pizzas lead the homepage.
    isPopular:
      subcategory === 'signature' || subcategory === 'supreme' || subcategory === 'desi-tadka',
    isNew: raw.is_new === true,
    noCrust: raw.no_crust === true,
    isSpicy: raw.is_spicy === true,
    isJain: raw.is_jain === true,
    preparationTime: DEFAULT_PREP_MINUTES,
  };
}

async function fetchFromApi(): Promise<MenuSnapshot> {
  const data = await apiGet<ApiMenuResponse>('/api/menu');

  if (!Array.isArray(data.categories) || !Array.isArray(data.items)) {
    throw new Error('Malformed /api/menu response');
  }

  const slugById = new Map<number, string>(
    data.categories.map((c) => [c.id, c.slug] as const),
  );

  const items = data.items.map((raw) => mapItem(raw, slugById.get(raw.category_id) ?? ''));

  // Merge live review aggregates (best-effort, never blocks the menu).
  try {
    const summary = await apiGet<{ summary: { per_item: Record<string, { average: number; count: number }> } }>(
      '/api/reviews/summary',
    ).catch(() => null);
    const perItem = summary?.summary?.per_item;
    if (perItem) {
      for (const item of items) {
        const agg = perItem[item.id];
        if (agg && agg.count > 0) {
          item.rating = Math.round(agg.average * 10) / 10;
          item.reviewCount = agg.count;
        }
      }
    }
  } catch {
    /* keep default ratings */
  }

  const counts = new Map<MenuCategory, number>();
  for (const item of items) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }

  const categories: Category[] = data.categories.map((c) => ({
    id: mapMenuCategory(c.slug),
    name: c.name,
    description: c.description ?? '',
    image:
      CATEGORY_IMAGE_BY_SLUG[c.slug] ?? '',
    itemCount: counts.get(mapMenuCategory(c.slug)) ?? 0,
  }));

  return { source: 'api', categories, items };
}

function fallbackSnapshot(): MenuSnapshot {
  return { source: 'fallback', categories: localCategories, items: fallbackItems };
}

let snapshotPromise: Promise<MenuSnapshot> | null = null;
let hasWarnedFallback = false;

/**
 * Loads the menu exactly once per session.
 * Primary source: GET ${VITE_API_BASE_URL}/api/menu (PostgreSQL-backed).
 * Fallback on any failure (network/HTTP/malformed): local menu.ts dataset.
 */
export function loadMenu(): Promise<MenuSnapshot> {
  if (!snapshotPromise) {
    snapshotPromise = fetchFromApi()
      .then((snapshot) => {
        console.info(
          `[menuService] menu source: api (${snapshot.items.length} items, ` +
            `${snapshot.categories.length} categories)`,
        );
        return snapshot;
      })
      .catch((error: unknown) => {
        if (!hasWarnedFallback) {
          console.warn(
            `[menuService] API unavailable (${error instanceof Error ? error.message : error}). ` +
              'Falling back to local menu.ts.',
          );
          hasWarnedFallback = true;
        }
        return fallbackSnapshot();
      });
  }
  return snapshotPromise;
}

export const menuService = {
  load: loadMenu,

  async getMenu(): Promise<MenuItem[]> {
    return (await loadMenu()).items;
  },

  async getMenuItem(id: string): Promise<MenuItem | undefined> {
    const { items } = await loadMenu();
    return items.find((item) => item.id === id);
  },

  async getByCategory(category: MenuCategory): Promise<MenuItem[]> {
    const { items } = await loadMenu();
    return items.filter((item) => item.category === category);
  },

  async getPizzasByType(type: 'veg' | 'nonveg'): Promise<MenuItem[]> {
    const { items } = await loadMenu();
    return items.filter((item) => item.pizzaType === type);
  },

  async search(query: string): Promise<MenuItem[]> {
    const q = query.toLowerCase();
    const { items } = await loadMenu();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.ingredients.some((i) => i.toLowerCase().includes(q)),
    );
  },

  async getCategories(): Promise<Category[]> {
    return (await loadMenu()).categories;
  },
};

/** Deterministic featured list for the homepage. */
export function pickPopular(items: MenuItem[]): MenuItem[] {
  const flagged = items.filter((item) => item.isPopular).slice(0, 8);
  if (flagged.length >= 4) return flagged;
  const pizzasFirst = [...items].sort((a, b) => {
    const aPizza = a.category === 'pizza' ? 0 : 1;
    const bPizza = b.category === 'pizza' ? 0 : 1;
    return aPizza - bPizza;
  });
  return pizzasFirst.slice(0, 8);
}

// Re-exported static business rules (crust pricing stays a local constant).
export { crusts };
export { localPopular };
