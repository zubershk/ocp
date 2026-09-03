import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { apiGet } from '../services/api';
import StarRating from '../components/ui/StarRating';

interface Review {
  id: number;
  customer_name: string;
  rating: number;
  title: string;
  body: string;
  created_at: string;
}

interface Summary {
  average: number;
  count: number;
}

export default function Reviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<Summary>({ average: 0, count: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiGet<{ reviews: Review[] }>('/api/reviews?limit=50').catch(() => ({ reviews: [] })),
      apiGet<{ summary: Summary }>('/api/reviews/summary').catch(() => ({ summary: { average: 0, count: 0 } })),
    ]).then(([r, s]) => {
      if (!alive) return;
      setReviews(r.reviews ?? []);
      setSummary(s.summary ?? { average: 0, count: 0 });
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl font-heading font-bold text-center">Customer Reviews</h1>
      {loading ? (
        <div className="mt-8 space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 skeleton rounded-2xl" />)}
        </div>
      ) : summary.count === 0 ? (
        <div className="mt-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-orange-100 flex items-center justify-center">
            <Star size={28} className="text-orange-500" />
          </div>
          <p className="text-zinc-500 mt-4 leading-relaxed max-w-md mx-auto">
            No reviews yet — order your favourite pizza and be the first to share what you think!
          </p>
          <Link to="/r/menu" className="inline-flex mt-6 px-6 py-3 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-700">
            Browse Menu
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 bg-white rounded-2xl border border-stone-100 p-6 text-center shadow-sm">
            <div className="text-5xl font-heading font-bold">{summary.average.toFixed(1)}</div>
            <div className="mt-2 flex justify-center">
              <StarRating rating={summary.average} count={summary.count} size={20} />
            </div>
            <p className="text-sm text-zinc-500 mt-2">Based on {summary.count} verified order{summary.count === 1 ? '' : 's'}</p>
          </div>
          <div className="mt-6 space-y-4">
            {reviews.map((r) => (
              <article key={r.id} className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <StarRating rating={r.rating} size={15} />
                  <time className="text-xs text-zinc-400">{new Date(r.created_at).toLocaleDateString()}</time>
                </div>
                {r.title && <h2 className="font-semibold mt-2">{r.title}</h2>}
                {r.body && <p className="text-sm text-zinc-600 mt-1 leading-relaxed">{r.body}</p>}
                <p className="text-xs text-zinc-400 mt-3">— {r.customer_name || 'Verified customer'}</p>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
