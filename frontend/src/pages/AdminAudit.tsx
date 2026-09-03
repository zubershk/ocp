import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ScrollText, Clock, User } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import AdminSubNav from '../components/layout/AdminSubNav';
import { Card, CardContent } from '@/components/shadcn/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/shadcn/table';
import { Badge } from '@/components/shadcn/badge';

interface Log {
  id: number;
  admin_name: string;
  action: string;
  target: string;
  details: string;
  ip: string;
  created_at: string;
}

export default function AdminAudit() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const q = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => adminFetch<{ logs: Log[] }>('/admin/audit?limit=100').then((r) => r.logs),
    enabled: authed,
    refetchInterval: 15000,
  });

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Card>
          <CardContent className="p-8">
            <ScrollText size={24} className="mx-auto text-muted-foreground" />
            <h1 className="font-bold mt-3">Audit Log</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Orders</Link> first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <AdminSubNav activeOverride="/admin/logs" />

      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ScrollText size={20} className="text-zinc-700" /> Audit Log</h1>
      <p className="text-sm text-muted-foreground mt-1">Every menu, order, outlet and chat action — who, what, when, IP.</p>

      <Card className="mt-6">
        <CardContent className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-6 text-center text-sm text-muted-foreground">Loading…</TableCell>
                </TableRow>
              ) : (q.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-6 text-center text-sm text-muted-foreground">No actions yet — create a menu item to see it here.</TableCell>
                </TableRow>
              ) : (
                (q.data ?? []).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs font-mono whitespace-nowrap"><div className="flex items-center gap-1"><Clock size={11} className="text-muted-foreground" />{new Date(l.created_at.replace(' ', 'T')).toLocaleString()}</div></TableCell>
                    <TableCell className="text-xs font-semibold"><div className="flex items-center gap-1"><User size={11} className="text-muted-foreground" />{l.admin_name}</div></TableCell>
                    <TableCell><Badge variant="secondary" className="font-mono text-xs">{l.action}</Badge></TableCell>
                    <TableCell className="text-xs truncate max-w-[160px]">{l.target || '—'}</TableCell>
                    <TableCell className="text-xs font-mono truncate max-w-[240px]">{l.details}</TableCell>
                    <TableCell className="text-xs font-mono">{l.ip}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
