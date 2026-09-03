import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Star, Check, X } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';
import AdminSubNav from '../components/layout/AdminSubNav';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/shadcn/table';
import { Badge } from '@/components/shadcn/badge';
import { Skeleton } from '@/components/shadcn/skeleton';
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

export default function AdminReviews() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const toast = useToast();
  const [pendingOnly, setPendingOnly] = useState(false);

  const reviewsQuery = useQuery({
    queryKey: ['admin-reviews', pendingOnly],
    queryFn: () =>
      adminFetch<{ reviews: Review[] }>(`/admin/reviews${pendingOnly ? '?pending=1' : ''}`).then((r) => r.reviews),
    enabled: authed,
  });

  const moderateMut = useMutation({
    mutationFn: ({ id, approved }: { id: number; approved: boolean }) =>
      adminFetch(`/admin/reviews/${id}`, { method: 'PATCH', body: JSON.stringify({ approved }) }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['admin-reviews'] });
      toast.push({ type: 'success', title: v.approved ? 'Review approved' : 'Review hidden' });
    },
    onError: (e: Error) => toast.push({ type: 'error', title: e.message }),
  });

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Card>
          <CardContent className="py-8">
            <Star size={24} className="mx-auto text-muted-foreground" />
            <h1 className="font-bold mt-3">Reviews</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Orders</Link> first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const reviews = reviewsQuery.data ?? [];

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <AdminSubNav activeOverride="/admin/reviews" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Star size={20} /> Reviews
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Moderate verified-purchase reviews before they go public.</p>
        </div>
        <Button variant={pendingOnly ? 'default' : 'outline'} size="sm" onClick={() => setPendingOnly((v) => !v)}>
          {pendingOnly ? 'Showing pending' : 'Show pending only'}
        </Button>
      </div>

      {reviewsQuery.isLoading ? (
        <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : reviews.length === 0 ? (
        <Card className="mt-4">
          <CardContent className="py-8 text-center">
            <Star size={24} className="mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground mt-2">
              {pendingOnly ? 'No pending reviews. All caught up!' : 'No reviews yet. They appear here after delivered orders are rated.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-4">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="px-4 py-3">Review</TableHead>
                <TableHead className="px-4 py-3 hidden md:table-cell">Order</TableHead>
                <TableHead className="px-4 py-3">Status</TableHead>
                <TableHead className="px-4 py-3 text-right w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="px-4 py-3">
                    <StarRating rating={r.rating} size={13} showCount={false} />
                    {r.title && <div className="font-medium mt-1">{r.title}</div>}
                    {r.body && <div className="text-xs text-muted-foreground mt-0.5 max-w-md">{r.body}</div>}
                    <div className="text-xs text-muted-foreground mt-1">
                      {r.customer_name || 'Customer'}{r.item_slug ? ` · item: ${r.item_slug}` : ' · overall'}
                      {' · '}{new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs font-mono text-muted-foreground">#{r.order_id}</span>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge variant={r.approved ? 'default' : 'secondary'} className={r.approved ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : ''}>
                      {r.approved ? 'Live' : 'Pending'}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!r.approved ? (
                        <Button size="sm" onClick={() => moderateMut.mutate({ id: r.id, approved: true })} disabled={moderateMut.isPending}>
                          <Check size={12} /> Approve
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => moderateMut.mutate({ id: r.id, approved: false })} disabled={moderateMut.isPending}>
                          <X size={12} /> Hide
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
