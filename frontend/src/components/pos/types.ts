export interface CartLine {
  key: string;
  menuItemID: number;
  name: string;
  size: string;
  crust: string;
  crustName: string;
  quantity: number;
  image: string;
  categoryName: string;
  /** Advisory unit estimate in paise (display only; server reprices). */
  unitPaise: number | null;
}

export interface RecordedPayment {
  paymentId: number;
  method: string;
  amountPaise: number;
  reference: string;
  replayed: boolean;
  at: string;
}

export interface HeldOrder {
  id: number;
  orderNumber: string;
  total: number;
  at: string;
}

export const cartLineKey = (menuItemID: number, size: string, crust: string): string =>
  `${menuItemID}|${size}|${crust}`;
