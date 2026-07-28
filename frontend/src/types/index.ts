export type DietaryType = 'veg' | 'nonveg' | 'vegan' | 'gluten-free';

export type MenuCategory =
  | 'pizza'
  | 'value-pizza'
  | 'family-packs'
  | 'burgers'
  | 'momos'
  | 'pasta'
  | 'speciality-chicken'
  | 'garlic-bread'
  | 'tacos'
  | 'appetizers'
  | 'french-fries'
  | 'desserts'
  | 'beverages'
  | 'sides'
  | 'drinks'
  | 'combos';

export type PizzaSubcategory = 'classic' | 'favourite' | 'signature' | 'supreme' | 'desi-tadka';
export type PizzaType = 'veg' | 'nonveg';

export interface PriceBySize {
  regular?: number;
  medium?: number;
  large?: number;
}

export interface CrustOption {
  id: string;
  name: string;
  description: string;
  extraCharge: PriceBySize;
}

export interface ExtraToppingCategory {
  name: string;
  price: PriceBySize;
  items: string[];
}

export interface Outlet {
  id: string;
  name: string;
  address: string;
  phones: string[];
  area: string;
}

export interface Offer {
  id: string;
  title: string;
  description: string;
  type: 'bogo' | 'family-pack' | 'cheese-burst' | 'fun-meal-box';
  price?: PriceBySize | number;
  vegPrice?: number;
  nonVegPrice?: number;
  items?: string[];
}

export interface MenuOption {
  id: string;
  name: string;
  price: number;
  description?: string;
}

export interface MenuOptionGroup {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: MenuOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  priceBySize?: PriceBySize;
  originalPrice?: number;
  image: string;
  category: MenuCategory;
  pizzaSubcategory?: PizzaSubcategory;
  pizzaType?: PizzaType;
  dietary: DietaryType;
  rating: number;
  reviewCount: number;
  ingredients: string[];
  allergens: string[];
  customizationGroups: MenuOptionGroup[];
  isPopular: boolean;
  isNew: boolean;
  isSpicy?: boolean;
  isJain?: boolean;
  preparationTime: number;
  calories?: number;
}

export interface Category {
  id: MenuCategory;
  name: string;
  description: string;
  image: string;
  itemCount: number;
  pizzaType?: PizzaType;
  subcategory?: PizzaSubcategory;
}

export interface CartItem {
  id: string;
  menuItemId: string;
  name: string;
  image: string;
  basePrice: number;
  selectedOptions: Record<string, MenuOption[]>;
  quantity: number;
  subtotal: number;
  specialInstructions?: string;
  /** Order metadata passed through to the backend (not displayed). */
  size?: string;
  crust?: string;
}

export interface Cart {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  addresses: Address[];
}

export interface Address {
  id: string;
  label: string;
  street: string;
  landmark?: string;
  city: string;
  postalCode: string;
  isDefault: boolean;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export type OrderStatus = 'placed' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';

export interface OrderTimelineEvent {
  status: OrderStatus;
  label: string;
  timestamp: Date;
  isCompleted: boolean;
  isCurrent: boolean;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  image: string;
  selectedOptions: Record<string, MenuOption[]>;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  customer: Customer;
  items: OrderItem[];
  status: OrderStatus;
  timeline: OrderTimelineEvent[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  deliveryAddress?: Address;
  deliveryType: 'delivery' | 'pickup';
  estimatedDeliveryTime: Date;
  createdAt: Date;
  updatedAt: Date;
  specialInstructions?: string;
}

export type PaymentMethod = 'cod' | 'upi' | 'online';

export interface Reservation {
  id: string;
  customerName: string;
  phone: string;
  email: string;
  date: Date;
  time: string;
  guests: number;
  specialRequest?: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  tableNumber?: number;
  createdAt: Date;
}

export interface TimeSlot {
  time: string;
  available: boolean;
  maxGuests: number;
}

export interface Review {
  id: string;
  customerName: string;
  avatar?: string;
  rating: number;
  comment: string;
  date: Date;
  menuItemId?: string;
  verified: boolean;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string;
  author: {
    name: string;
    avatar?: string;
    role: string;
  };
  category: string;
  tags: string[];
  publishedAt: Date;
  readTime: number;
  featured: boolean;
}

export interface RestaurantInfo {
  name: string;
  tagline: string;
  description: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  openingHours: {
    [key: string]: { open: string; close: string; closed: boolean };
  };
  socialLinks: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    youtube?: string;
  };
  features: {
    icon: string;
    title: string;
    description: string;
  }[];
}

export interface SearchResult {
  type: 'menu' | 'category' | 'blog';
  id: string;
  title: string;
  subtitle?: string;
  image?: string;
  url: string;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}