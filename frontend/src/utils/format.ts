export const formatPrice = (price: number) => `₹${price}`;
export const getDisplayPrice = (item: { price: number; priceBySize?: { regular?: number; medium?: number; large?: number } }, size: 'regular' | 'medium' | 'large' = 'regular') => {
  if (item.priceBySize) {
    return item.priceBySize[size] ?? item.price;
  }
  return item.price;
};
