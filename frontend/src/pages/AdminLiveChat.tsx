import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MessageCircle, Send, Phone, User, Clock, Search, Bot, Hand, RefreshCw, ShoppingCart, XCircle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';

interface Conversation {
  phone: string;
  name: string;
  state: string;
  last_body: string;
  last_at: string;
  last_direction: string;
  total_messages: number;
}

interface ChatMessage {
  id: number;
  phone: string;
  direction: 'in' | 'out';
  body: string;
  created_at: string;
}

function timeAgo(iso: string) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function AdminLiveChat() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const [selected, setSelected] = useState<string>('');
  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const convQuery = useQuery({
    queryKey: ['admin-conversations'],
    queryFn: () => adminFetch<{ conversations: Conversation[] }>('/admin/conversations?limit=50').then((r) => r.conversations),
    enabled: authed,
    refetchInterval: 5000,
  });

  const chatQuery = useQuery({
    queryKey: ['admin-chat', selected],
    queryFn: () => adminFetch<{ messages: ChatMessage[]; state: string; cart: unknown }>(`/admin/conversations/${selected}/messages?limit=100`),
    enabled: authed && !!selected,
    refetchInterval: 3000,
  });

  const sendMut = useMutation({
    mutationFn: (body: string) => adminFetch(`/admin/conversations/${selected}/send`, { method: 'POST', body: JSON.stringify({ body }) }),
    onSuccess: () => {
      setInput('');
      qc.invalidateQueries({ queryKey: ['admin-chat', selected] });
      qc.invalidateQueries({ queryKey: ['admin-conversations'] });
    },
  });

  const stateMut = useMutation({
    mutationFn: (state: string) => adminFetch(`/admin/conversations/${selected}/state`, { method: 'POST', body: JSON.stringify({ state }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-chat', selected] });
      qc.invalidateQueries({ queryKey: ['admin-conversations'] });
    },
  });

  const conversations = convQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.phone.includes(q) || c.name.toLowerCase().includes(q) || c.last_body.toLowerCase().includes(q));
  }, [conversations, search]);

  // auto-select first conversation
  useEffect(() => {
    if (!selected && filtered.length > 0) setSelected(filtered[0].phone);
  }, [filtered, selected]);

  // scroll to bottom on new messages
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [chatQuery.data?.messages]);

  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border p-8">
          <MessageCircle size={24} className="mx-auto text-emerald-600" />
          <h1 className="font-bold mt-3">Live Chat</h1>
          <p className="text-sm text-zinc-500 mt-1">Sign in via <Link to="/admin" className="text-orange-600 underline">Order Board</Link> with admin key first.</p>
        </div>
      </div>
    );
  }

  const selectedConv = conversations.find((c) => c.phone === selected);
  const isHuman = chatQuery.data?.state === 'HUMAN_SUPPORT';

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-4 h-[calc(100vh-64px)] flex flex-col">
      {/* Sub-nav */}
      <div className="flex gap-1 p-1 bg-zinc-100 rounded-xl w-fit text-sm mb-3 flex-wrap">
        <Link to="/admin" className="px-3 py-1.5 rounded-full hover:bg-white">Orders</Link>
        <Link to="/admin/catalog" className="px-3 py-1.5 rounded-full hover:bg-white">Menu</Link>
        <span className="px-3 py-1.5 rounded-full bg-zinc-900 text-white font-semibold">Chats</span>
        <Link to="/admin/settings" className="px-3 py-1.5 rounded-full hover:bg-white">Settings</Link>
        <Link to="/admin/analytics" className="px-3 py-1.5 rounded-full hover:bg-white">Analytics</Link>
        <Link to="/admin/team" className="px-3 py-1.5 rounded-full hover:bg-white">Team</Link>
        <Link to="/admin/logs" className="px-3 py-1.5 rounded-full hover:bg-white">Audit</Link>
      </div>

      <div className="flex-1 bg-white rounded-2xl border shadow-sm overflow-hidden flex min-h-0">
        {/* Left list */}
        <div className="w-[340px] border-r flex flex-col min-w-0 hidden md:flex">
          <div className="p-3 border-b">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm flex items-center gap-1.5"><MessageCircle size={14} className="text-emerald-600" /> Chats <span className="text-xs font-mono bg-zinc-900 text-white px-1.5 py-0.5 rounded-full">{conversations.length}</span></h2>
              <button onClick={() => convQuery.refetch()} className="w-7 h-7 grid place-items-center rounded-full hover:bg-zinc-100"><RefreshCw size={12} className={convQuery.isFetching ? 'animate-spin' : ''} /></button>
            </div>
            <div className="relative mt-2">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search phone or name…" className="w-full pl-7 pr-2 py-1.5 rounded-full border bg-zinc-50 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-300" />
            </div>
          </div>
          <div className="flex-1 overflow-auto divide-y">
            {convQuery.isLoading ? (
              <div className="p-4 space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 bg-zinc-50 rounded-xl animate-pulse" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-zinc-500">No chats yet.<br />New WhatsApp messages appear here.</div>
            ) : (
              filtered.map((c) => (
                <button key={c.phone} onClick={() => setSelected(c.phone)} className={`w-full text-left p-3 flex gap-2 hover:bg-zinc-50 ${selected === c.phone ? 'bg-orange-50' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-zinc-900 text-white grid place-items-center text-xs font-bold shrink-0">{c.name ? c.name[0].toUpperCase() : <User size={12} />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold truncate">{c.name || c.phone}</span>
                      {c.state === 'HUMAN_SUPPORT' && <span className="text-[9px] px-1 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-700 font-bold">HUMAN</span>}
                      <span className="ml-auto text-[10px] text-zinc-400">{timeAgo(c.last_at)}</span>
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate">{c.last_direction === 'out' ? 'You: ' : ''}{c.last_body || '—'}</div>
                    <div className="text-[10px] font-mono text-zinc-400">{c.phone} • {c.state}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Mobile selector */}
        <div className="md:hidden p-2 border-b w-full">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-full px-3 py-2 rounded-xl border bg-white text-sm">
            <option value="">Select chat</option>
            {filtered.map((c) => <option key={c.phone} value={c.phone}>{c.name || c.phone} — {c.last_body.slice(0, 30)}</option>)}
          </select>
        </div>

        {/* Right chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selected ? (
            <div className="flex-1 grid place-items-center p-8 text-center">
              <div>
                <MessageCircle size={28} className="mx-auto text-zinc-300" />
                <p className="font-semibold mt-2">Select a conversation</p>
                <p className="text-sm text-zinc-500">Bot and human messages are synced via phone. Take over to reply as OCP.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="p-3 border-b flex items-center justify-between gap-2 bg-zinc-50/50">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-zinc-900 text-white grid place-items-center text-xs font-bold">{selectedConv?.name ? selectedConv.name[0].toUpperCase() : <User size={12} />}</div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold flex items-center gap-1.5 truncate">{selectedConv?.name || selected} <span className="text-xs font-mono text-zinc-500">{selected}</span></div>
                    <div className="text-[11px] text-zinc-500 flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${isHuman ? 'bg-amber-500' : 'bg-emerald-500'}`} />{chatQuery.data?.state ?? '—'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <a href={`tel:${selected}`} className="px-2.5 py-1.5 rounded-full bg-white border text-xs font-semibold hover:bg-zinc-50 flex items-center gap-1"><Phone size={12} />Call</a>
                  <a href={`https://wa.me/${selected.startsWith('91') ? selected : '91' + selected}`} target="_blank" rel="noreferrer" className="px-2.5 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 flex items-center gap-1">WA</a>
                  {!isHuman ? (
                    <button onClick={() => stateMut.mutate('HUMAN_SUPPORT')} className="px-3 py-1.5 rounded-full bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 flex items-center gap-1"><Hand size={12} /> Take over</button>
                  ) : (
                    <button onClick={() => stateMut.mutate('IDLE')} className="px-3 py-1.5 rounded-full bg-zinc-900 text-white text-xs font-bold hover:bg-black flex items-center gap-1"><Bot size={12} /> Release to bot</button>
                  )}
                </div>
              </div>

              {/* State banner */}
              {isHuman ? (
                <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center gap-1.5"><AlertCircle size={12} /> You are in control — bot is paused for this customer.</div>
              ) : (
                <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-800 flex items-center gap-1.5"><CheckCircle2 size={12} /> Bot is handling — tap Take over to reply as human.</div>
              )}

              {/* Messages */}
              <div ref={listRef} className="flex-1 overflow-auto p-4 space-y-2 bg-[#fcfcf9]">
                {(chatQuery.data?.messages ?? []).length === 0 ? (
                  <div className="text-center text-sm text-zinc-400 py-8">No messages yet. Send a WhatsApp “hi” to start, or message as OCP.</div>
                ) : (
                  (chatQuery.data?.messages ?? []).map((m) => (
                    <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm leading-relaxed shadow-sm ${m.direction === 'out' ? 'bg-zinc-900 text-white rounded-br-sm' : 'bg-white border rounded-bl-sm'}`}>
                        <div>{m.body}</div>
                        <div className={`text-[10px] mt-1 flex items-center gap-1 ${m.direction === 'out' ? 'text-white/60' : 'text-zinc-400'}`}><Clock size={10} />{new Date(m.created_at.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {m.direction === 'out' ? '• you' : ''}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Composer */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!input.trim()) return;
                  sendMut.mutate(input.trim());
                }}
                className="p-3 border-t bg-white flex gap-2"
              >
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={isHuman ? 'Reply as OCP…' : 'Take over first, then reply…'} disabled={!isHuman && (chatQuery.data?.messages?.length ?? 0) > 0} className="flex-1 px-3 py-2.5 rounded-xl border bg-zinc-50 focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10" />
                <button type="submit" disabled={!input.trim() || sendMut.isPending} className="px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-50 inline-flex items-center gap-1.5"><Send size={14} /> Send</button>
              </form>

              {/* Context */}
              <div className="border-t bg-zinc-50 px-3 py-2 text-xs text-zinc-600 flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1"><ShoppingCart size={12} /> Cart: {(chatQuery.data as { cart?: unknown[] })?.cart ? JSON.stringify((chatQuery.data as { cart?: unknown[] }).cart).slice(0, 80) : '—'}</span>
                <span className="inline-flex items-center gap-1"><Bot size={12} /> State: {chatQuery.data?.state ?? '—'}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
