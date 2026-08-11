import { RESTAURANT } from '../data/outlets';

export default function Privacy() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <div className="space-y-6 text-sm text-zinc-600 leading-relaxed">
        <section>
          <h2 className="font-bold text-zinc-900 mb-1">What we collect</h2>
          <p>When you place an order through this website, we collect your name, phone number, delivery address, and order details. This information is used solely to process and deliver your order.</p>
        </section>
        <section>
          <h2 className="font-bold text-zinc-900 mb-1">How we use it</h2>
          <p>Your information is used to confirm your order, deliver food to your address, send order status updates via WhatsApp, and improve our service. We do not sell or share your data with third parties for marketing purposes.</p>
        </section>
        <section>
          <h2 className="font-bold text-zinc-900 mb-1">Storage</h2>
          <p>Order information is stored in our database to maintain order history. Your WhatsApp number may be used to identify you when you interact with our ordering assistant.</p>
        </section>
        <section>
          <h2 className="font-bold text-zinc-900 mb-1">Your rights</h2>
          <p>You may contact us at any time to request information about the data we hold about you, or to request its deletion after your order is completed.</p>
        </section>
        <section>
          <h2 className="font-bold text-zinc-900 mb-1">Contact</h2>
          <p>For privacy-related questions, call us at +91 {RESTAURANT.phones[0]} or visit our Mira Road East outlet at {RESTAURANT.address.line1}, {RESTAURANT.address.city}.</p>
        </section>
      </div>
    </div>
  );
}
