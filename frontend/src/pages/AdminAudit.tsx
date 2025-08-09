import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ScrollText, Clock, User } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';

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
        <div className="bg-white rounded-2xl border p-8">
          <ScrollText size={24} className="mx-auto text-zinc-400" />
          <h1 className="font-bold mt-3">Audit Log</h1>
          <p className="text-sm text-zinc-500 mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Orders</Link> first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit text-sm mb-4">
        <Link to="/admin" className="px-3 py-1.5 rounded-full hover:bg-white">Orders</Link>
        <Link to="/admin/catalog" className="px-3 py-1.5 rounded-full hover:bg-white">Menu</Link>
        <Link to="/admin/chats" className="px-3 py-1.5 rounded-full hover:bg-white">Chats</Link>
        <Link to="/admin/settings" className="px-3 py-1.5 rounded-full hover:bg-white">Settings</Link>
        <Link to="/admin/analytics" className="px-3 py-1.5 rounded-full hover:bg-white">Analytics</Link>
        <Link to="/admin/team" className="px-3 py-1.5 rounded-full hover:bg-white">Team</Link>
        <span className="px-3 py-1.5 rounded-full bg-zinc-900 text-white font-semibold">Audit</span>
      </div>

      <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ScrollText size={20} className="text-zinc-700" /> Audit Log</h1>
      <p className="text-sm text-zinc-500 mt-1">Every menu, order, outlet and chat action — who, what, when, IP.</p>

      <div className="mt-6 bg-white border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b text-[11px] tracking-wide font-semibold text-zinc-500">
              <tr>
                <th className="text-left px-4 py-2">Time</th>
                <th className="text-left px-3 py-2">Admin</th>
                <th className="text-left px-3 py-2">Action</th>
                <th className="text-left px-3 py-2">Target</th>
                <th className="text-left px-3 py-2">Details</th>
                <th className="text-left px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {q.isLoading ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-sm text-zinc-400">Loading…</td>
                </tr>
              ) : (q.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-sm text-zinc-500">No actions yet — create a menu item to see it here.</td>
                </tr>
              ) : (
                (q.data ?? []).map((l) => (
                  <tr key={l.id} className="hover:bg-zinc-50/50">
                    <td className="px-4 py-2 text-xs font-mono whitespace-nowrap flex items-center gap-1"><Clock size={11} className="text-zinc-400" />{new Date(l.created_at.replace(' ', 'T')).toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs font-semibold flex items-center gap-1"><User size={11} className="text-zinc-400" />{l.admin_name}</td>
                    <td className="px-3 py-2 text-xs font-mono bg-zinc-50 border rounded-full w-fit">{l.action}</td>
                    <td className="px-3 py-2 text-xs truncate max-w-[160px]">{l.target || '—'}</td>
                    <td className="px-3 py-2 text-xs font-mono truncate max-w-[240px]">{l.details}</td>
                    <td className="px-3 py-2 text-xs font-mono">{l.ip}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
