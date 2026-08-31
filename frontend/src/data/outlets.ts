// Fallback restaurant data — used only when API is unavailable.
// In production, all data comes from /api/config and /api/outlets.
export const RESTAURANT = {
  name: '',
  tagline: '',
  primaryOutlet: '',
  phone: '',
  phones: [] as string[],
  whatsappNumber: '',
  address: { line1: '', line2: '', area: '', city: '', state: '', pincode: '' },
  deliveryHours: '',
  deliveryNote: '',
} as const;

export const OUTLETS: {
  id: string;
  name: string;
  onlineOrdering: boolean;
  address: string[];
  phones: string[];
  deliveryHours: string;
}[] = [];
