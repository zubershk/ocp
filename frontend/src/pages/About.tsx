import { Leaf, ChefHat, Truck, Award } from 'lucide-react';

export default function About(){
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid lg:grid-cols-2 gap-8 items-center">
        <div>
          <h1 className="text-4xl font-bold leading-tight">Our story is <span className="text-orange-600">cheese, crust & care</span></h1>
          <p className="text-zinc-600 mt-4 leading-relaxed">Orange Cheese Pizza was born in Vasai with a simple promise: 100% real mozzarella, fresh dough daily, and bold flavours from across India. From classic Cheese & Tomato to Hyderabadi Paneer Tikka and Korean Spicy, every pizza is hand-tossed and stone-baked.</p>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4"><div className="font-bold text-lg">41</div><div className="text-xs text-zinc-600">Pizza varieties (veg & non-veg)</div></div>
            <div className="bg-zinc-900 text-white rounded-2xl p-4"><div className="font-bold text-lg">6</div><div className="text-xs text-zinc-400">Crusts including Cheese Burst & DCC</div></div>
          </div>
        </div>
        <img src="/uploads/94a2c1d2cd873119.jpg" alt="Restaurant" className="w-full h-[380px] object-cover rounded-[2rem]"/>
      </div>

      <div className="grid md:grid-cols-4 gap-4 mt-12">
        {[
          { icon: Leaf, title:'Fresh Ingredients', desc:'Locally sourced veggies, paneer, chicken daily' },
          { icon: ChefHat, title:'Freshly Prepared', desc:'Made to order, not pre-made. Oregano & chilli flakes on the house' },
          { icon: Truck, title:'Fast Delivery', desc:'Free delivery 11AM–4AM, hot & fresh in 30 mins' },
          { icon: Award, title:'All Prices Include Tax', desc:'No hidden charges. What you see is what you pay' },
        ].map(card=>{
          const Icon = card.icon;
          return <div key={card.title} className="bg-white rounded-2xl border p-5"><div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600"><Icon size={18}/></div><h3 className="font-semibold mt-3 text-sm">{card.title}</h3><p className="text-xs text-zinc-500 mt-1">{card.desc}</p></div>
        })}
      </div>

      <div className="mt-12 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border p-6">
          <h3 className="font-semibold">Food philosophy</h3>
          <p className="text-sm text-zinc-600 mt-2 leading-relaxed">We believe great pizza starts with great cheese — that’s why every pizza uses 100% real mozzarella. Our Makhani sauce, Hyderabadi & Lucknowi seasonings, and Korean spicy sauce are made in-house. Vegetarian and non-vegetarian kitchens are handled with care, and Jain options like Hara Bhara are available.</p>
          <div className="mt-4 grid sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-zinc-50 rounded-xl p-3"><strong>Crusts:</strong> Tossed, Italian Thin, Wheat Thin (+₹30/₹60), Cheese Burst (+₹85/₹110/₹135), DCC (+₹120)</div>
            <div className="bg-zinc-50 rounded-xl p-3"><strong>Toppings:</strong> Extra Cheese ₹60/95/125 • Veg ₹45/80/110 • Chicken ₹60/95/125</div>
          </div>
        </div>
        <img src="/uploads/6b5cec893827b62c.jpg" alt="Pizza making" className="w-full h-full object-cover rounded-2xl min-h-[280px]"/>
      </div>
    </div>
  )
}