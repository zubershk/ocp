export const RESTAURANT = {
  name: 'Orange Cheese Pizza',
  tagline: 'Hot. Cheesy. Made for You.',
  primaryOutlet: 'Mira Road East',
  phone: '8369293998',
  phones: ['8369293998', '8591683998', '8591983998'],
  whatsappNumber: '919967944510',
  address: {
    line1: 'Shop 21, B Wing, Winstone PNK',
    line2: 'next to Pinna Cola Building',
    area: 'Beverly Park',
    city: 'Mira Road East',
    state: 'Maharashtra',
    pincode: '401107',
  },
  deliveryHours: '11:00 AM to 04:00 AM',
  deliveryNote:
    'Delivery availability depends on your address. Mira Road East outlet does not deliver to Mira-Bhayandar West-side areas.',
} as const;

export const OUTLETS = [
  {
    id: 'mira-road',
    name: 'Mira Road East',
    onlineOrdering: true,
    address: [
      'Shop 21, B Wing, Winstone PNK',
      'next to Pinna Cola Building',
      'Beverly Park, Mira Road East',
      'Thane, Maharashtra 401107',
    ],
    phones: ['8369293998', '8591683998', '8591983998'],
    deliveryHours: '11:00 AM to 04:00 AM',
  },
] as const;
