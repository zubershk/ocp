export const offers = {
  bogo: {
    title: 'Buy 1 Get 2nd Pizza Up to 75% OFF',
    description: 'Get your 2nd pizza at special price',
    prices: { regular: 150, medium: 200, large: 250 },
  },
  familyPacks: [
    { id: 'fp1', name: 'Family Pack 1 - Classic & Favourite', items: ['2 Regular Pizza','1 Garlic Breadsticks','1 Choco Lava Cake'], vegPrice: 515, nonVegPrice: 625 },
    { id: 'fp2', name: 'Family Pack 2 - Signature & Supreme', items: ['2 Regular Pizza','1 Garlic Breadsticks','1 Choco Lava Cake'], vegPrice: 640, nonVegPrice: 720 },
    { id: 'fp3', name: 'Family Pack 3 - Classic & Favourite', items: ['2 Medium Pizza','1 Garlic Breadsticks','1 Choco Lava Cake','Coke 600ml'], vegPrice: 1025, nonVegPrice: 1200 },
    { id: 'fp4', name: 'Family Pack 4 - Signature & Supreme', items: ['2 Medium Pizza','2 Garlic Breadsticks','2 Choco Lava Cake','Coke 600ml'], vegPrice: 1120, nonVegPrice: 1380 },
  ],
  cheeseBurst: { title: 'Upgrade to Large at ₹150 from any Medium Pizza', prices: { regular: 85, medium: 110, large: 135 } },
  funMealBoxes: [
    { name: 'Veg Single Fun Meal Box', items: ['Onion','Tomato','Capsicum','Golden Corn'], price: 400 },
    { name: 'Veg Double Fun Meal Box', items: ['Onion & Masala Paneer','Black Olives & Golden Corn','Capsicum & Masala Paneer','Onion & Tomato'], price: 525 },
    { name: 'Non-Veg Single Fun Meal Box', items: ['Pepper Barbecue Chicken','Spicy Chicken','Chicken Kebabs & Onion','Chicken Sausages & Capsicum'], price: 525 },
    { name: 'Veg Triple Topping Fun Meal Box', items: ['Paneer, Mushroom & Jalapenos','Green & Yellow Bell Pepper, Tomato','Black Olives, Paneer & Gold Corn'], price: 630 },
    { name: 'Non-Veg Triple Topping Fun Meal Box', items: ['Hyderabadi Chicken, Capsicum & G.C.','Lucknowi Chicken, Onion & Jalapenos'], price: 685 },
  ],
};

export const outlets = [
  { id: 'vasai', name: 'Vasai West', address: 'Shop No. 1 & 3, Opal Fairybell, Bhabola Chuina Rd, Suyog Nagar, Vasai (W), Palghar - 401202', phones: ['9665043998','9156043998'], area: 'Vasai' },
  { id: 'mira', name: 'Mira Road East', address: 'Shop 21, B Wing, Winstone PNK, Next to Pinna Cola Bldg, Beverly Park, Mira Road East, Thane - 401107', phones: ['8369293998','8591683998','8591983998'], area: 'Mira Road' },
  { id: 'bhayandar', name: 'Bhayandar West', address: 'Shop 11, Om Hema Residency, Opp. Narayana E-Techno School, Burhani Nagar, Bhayandar West, Thane - 401101', phones: ['8591643998'], area: 'Bhayandar' },
];
