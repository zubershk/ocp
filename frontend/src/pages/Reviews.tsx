import { Star } from 'lucide-react';

export default function Reviews() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <div className="w-16 h-16 mx-auto rounded-full bg-orange-100 flex items-center justify-center">
        <Star size={28} className="text-orange-500" />
      </div>
      <h1 className="text-2xl font-bold mt-5">Customer Reviews</h1>
      <p className="text-zinc-500 mt-3 leading-relaxed max-w-md mx-auto">
        We're collecting feedback from our customers and will share reviews here soon.
        In the meantime, order your favourite pizza and let us know what you think!
      </p>
      <a
        href="/r/menu"
        className="inline-flex mt-6 px-6 py-3 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-700"
      >
        Browse Menu
      </a>
    </div>
  );
}
