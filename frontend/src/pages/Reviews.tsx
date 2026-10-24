import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Star, Filter, ChevronDown, MessageSquare, ThumbsUp, ArrowRight, Clock } from 'lucide-react';
import { apiGet } from '../services/api';
import StarRating from '../components/ui/StarRating';

interface Review {
  id: number;
  order_id: number;
  item_slug: string;
  customer_name: string;
  customer_phone: string;
  rating: number;
  title: string;
  body: string;
  approved: boolean;
  created_at: string;
}

interface Summary {
  average: number;
  count: number;
  per_item?: Record<string, { average: number; count: number }>;
}

type SortOption = 'recent' | 'highest' | 'lowest';

export default function Reviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<Summary>({ average: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [filterRating, setFilterRating] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiGet<{ reviews: Review[] }>('/api/reviews?limit=100').catch(() => ({ reviews: [] })),
      apiGet<{ summary: Summary }>('/api/reviews/summary').catch(() => ({ summary: { average: 0, count: 0 } })),
    ]).then(([r, s]) => {
      if (!alive) return;
      setReviews(r.reviews ?? []);
      setSummary(s.summary ?? { average: 0, count: 0 });
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  // Compute rating distribution
  const ratingDistribution = useMemo(() => {
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((r) => {
      if (r.rating >= 1 && r.rating <= 5) dist[r.rating as keyof typeof dist]++;
    });
    return dist;
  }, [reviews]);

  // Filter and sort reviews
  const filteredReviews = useMemo(() => {
    let result = [...reviews];
    if (filterRating !== null) {
      result = result.filter((r) => r.rating === filterRating);
    }
    switch (sortBy) {
      case 'highest':
        result.sort((a, b) => b.rating - a.rating || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'lowest':
        result.sort((a, b) => a.rating - b.rating || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      default:
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return result;
  }, [reviews, filterRating, sortBy]);

  const visibleReviews = filteredReviews.slice(0, visibleCount);
  const hasMore = visibleCount < filteredReviews.length;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + 10);
  }, []);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 skeleton rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-3xl font-heading font-bold text-center">Customer Reviews</h1>

      {summary.count === 0 ? (
        <div className="mt-12 text-center animate-fade-up">
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
          {/* Rating summary with distribution */}
          <div className="mt-8 bg-white rounded-2xl border border-stone-100 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Average rating */}
              <div className="text-center shrink-0">
                <div className="text-5xl font-heading font-bold text-zinc-900">{summary.average.toFixed(1)}</div>
                <div className="mt-2 flex justify-center">
                  <StarRating rating={summary.average} count={summary.count} size={20} />
                </div>
                <p className="text-sm text-zinc-500 mt-2">
                  Based on {summary.count} verified order{summary.count === 1 ? '' : 's'}
                </p>
              </div>

              {/* Rating distribution bars */}
              <div className="flex-1 w-full space-y-2">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = ratingDistribution[star as keyof typeof ratingDistribution];
                  const pct = summary.count > 0 ? Math.round((count / summary.count) * 100) : 0;
                  return (
                    <button
                      key={star}
                      onClick={() => setFilterRating(filterRating === star ? null : star)}
                      className={`flex items-center gap-2 w-full text-left rounded-lg px-2 py-1 transition-colors ${filterRating === star ? 'bg-orange-50' : 'hover:bg-stone-50'}`}
                    >
                      <span className="text-xs font-medium text-zinc-600 w-8">{star}★</span>
                      <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-400 w-8 text-right">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sort & filter controls */}
          <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-zinc-600 border border-stone-200 hover:bg-stone-50 transition-colors"
              >
                <Filter size={12} />
                {filterRating ? `${filterRating}★ only` : 'All ratings'}
              </button>
              {filterRating !== null && (
                <button
                  onClick={() => setFilterRating(null)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="sort-reviews">Sort reviews</label>
              <select
                id="sort-reviews"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="text-xs px-3 py-1.5 rounded-full border border-stone-200 bg-white text-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-all"
              >
                <option value="recent">Most recent</option>
                <option value="highest">Highest rated</option>
                <option value="lowest">Lowest rated</option>
              </select>
            </div>
          </div>

          {/* Reviews list */}
          <div className="mt-6 space-y-4">
            {visibleReviews.length === 0 ? (
              <div className="text-center py-8 text-sm text-zinc-500">
                No reviews match your filter.
              </div>
            ) : (
              visibleReviews.map((r) => (
                <article key={r.id} className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StarRating rating={r.rating} size={15} />
                      {r.item_slug && r.item_slug !== '' && (
                        <span className="text-[10px] text-zinc-400 bg-stone-100 px-2 py-0.5 rounded-full">
                          {r.item_slug.replace(/-/g, ' ')}
                        </span>
                      )}
                    </div>
                    <time className="text-xs text-zinc-400" dateTime={r.created_at}>
                      {new Date(r.created_at).toLocaleDateString()}
                    </time>
                  </div>
                  {r.title && <h2 className="font-semibold mt-2 text-zinc-900">{r.title}</h2>}
                  {r.body && <p className="text-sm text-zinc-600 mt-1 leading-relaxed">{r.body}</p>}
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs text-zinc-400">— {r.customer_name || 'Verified customer'}</p>
                    <div className="flex items-center gap-1 text-zinc-400">
                      <ThumbsUp size={12} />
                      <span className="text-[10px]">Helpful</span>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={loadMore}
                className="px-6 py-3 rounded-full bg-stone-100 text-zinc-700 font-semibold text-sm hover:bg-stone-200 transition-all"
              >
                Load more reviews
              </button>
            </div>
          )}

          {/* Write a review CTA */}
          <div className="mt-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-50 text-brand-700 text-sm font-medium">
              <MessageSquare size={14} />
              Ordered recently? Share your experience
            </div>
            <p className="text-xs text-zinc-400 mt-2">
              Reviews are submitted after delivery from the order confirmation page.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
