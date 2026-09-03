import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Send, Phone, User, Clock, Search, Bot, Hand, RefreshCw, ShoppingCart, AlertCircle, CheckCircle2 } from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import AdminSubNav from '../components/layout/AdminSubNav';
import { Card, CardContent } from '@/components/shadcn/card';
import { Button } from '@/components/shadcn/button';
import { Input } from '@/components/shadcn/input';
import { Badge } from '@/components/shadcn/badge';
import { Skeleton } from '@/components/shadcn/skeleton';

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
        <Card className="p-8">
          <CardContent>
            <MessageCircle size={24} className="mx-auto text-emerald-600" />
            <h1 className="font-bold mt-3">Live Chat</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in via <a href="/admin" className="text-orange-600 underline">Order Board</a> with admin key first.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedConv = conversations.find((c) => c.phone === selected);
  const isHuman = chatQuery.data?.state === 'HUMAN_SUPPORT';

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-4 h-[calc(100vh-64px)] flex flex-col">
      <AdminSubNav activeOverride="/admin/chats" />

      <Card className="flex-1 overflow-hidden flex min-h-0 mt-3">
        {/* Left list */}
        <div className="w-[340px] border-r border-border flex flex-col min-w-0 hidden md:flex">
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-sm flex items-center gap-1.5"><MessageCircle size={14} className="text-emerald-600" /> Chats <Badge variant="secondary" className="text-xs font-mono">{conversations.length}</Badge></h2>
              <Button variant="ghost" size="icon" onClick={() => convQuery.refetch()} className="w-7 h-7"><RefreshCw size={12} className={convQuery.isFetching ? 'animate-spin' : ''} /></Button>
            </div>
            <div className="relative mt-2">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search phone or name…" className="pl-7 pr-2 py-1.5 rounded-full text-xs" />
            </div>
          </div>
          <div className="flex-1 overflow-auto divide-y divide-border">
            {convQuery.isLoading ? (
              <div className="p-4 space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No chats yet.<br />New WhatsApp messages appear here.</div>
            ) : (
              filtered.map((c) => (
                <Button key={c.phone} variant="ghost" onClick={() => setSelected(c.phone)} className={`w-full justify-start p-3 h-auto gap-2 rounded-none ${selected === c.phone ? 'bg-orange-50' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-zinc-900 text-white grid place-items-center text-xs font-bold shrink-0">{c.name ? c.name[0].toUpperCase() : <User size={12} />}</div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold truncate">{c.name || c.phone}</span>
                      {c.state === 'HUMAN_SUPPORT' && <Badge variant="secondary" className="text-[9px] px-1 py-0.5 bg-amber-100 border border-amber-200 text-amber-700 font-bold">HUMAN</Badge>}
                      <span className="ml-auto text-[10px] text-muted-foreground">{timeAgo(c.last_at)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{c.last_direction === 'out' ? 'You: ' : ''}{c.last_body || '—'}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{c.phone} • {c.state}</div>
                  </div>
                </Button>
              ))
            )}
          </div>
        </div>

        {/* Mobile selector */}
        <div className="md:hidden p-2 border-b border-border w-full">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-border bg-card text-sm">
            <option value="">Select chat</option>
            {filtered.map((c) => <option key={c.phone} value={c.phone}>{c.name || c.phone} — {c.last_body.slice(0, 30)}</option>)}
          </select>
        </div>

        {/* Right chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selected ? (
            <div className="flex-1 grid place-items-center p-8 text-center">
              <div>
                <MessageCircle size={28} className="mx-auto text-muted-foreground" />
                <p className="font-semibold mt-2">Select a conversation</p>
                <p className="text-sm text-muted-foreground">Bot and human messages are synced via phone. Take over to reply as OCP.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="p-3 border-b border-border flex items-center justify-between gap-2 bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-zinc-900 text-white grid place-items-center text-xs font-bold">{selectedConv?.name ? selectedConv.name[0].toUpperCase() : <User size={12} />}</div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold flex items-center gap-1.5 truncate">{selectedConv?.name || selected} <span className="text-xs font-mono text-muted-foreground">{selected}</span></div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${isHuman ? 'bg-amber-500' : 'bg-emerald-500'}`} />{chatQuery.data?.state ?? '—'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <a href={`tel:${selected}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-border bg-card text-xs font-semibold hover:bg-muted"><Phone size={12} />Call</a>
                  <a href={`https://wa.me/${selected.startsWith('91') ? selected : '91' + selected}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700">WA</a>
                  {!isHuman ? (
                    <Button variant="ghost" size="sm" onClick={() => stateMut.mutate('HUMAN_SUPPORT')} className="rounded-full bg-amber-500 text-white text-xs font-bold hover:bg-amber-600"><Hand size={12} /> Take over</Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => stateMut.mutate('IDLE')} className="rounded-full bg-zinc-900 text-white text-xs font-bold hover:bg-black"><Bot size={12} /> Release to bot</Button>
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
                  <div className="text-center text-sm text-muted-foreground py-8">No messages yet. Send a WhatsApp "hi" to start, or message as OCP.</div>
                ) : (
                  (chatQuery.data?.messages ?? []).map((m) => (
                    <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm leading-relaxed shadow-sm ${m.direction === 'out' ? 'bg-zinc-900 text-white rounded-br-sm' : 'bg-card border border-border rounded-bl-sm'}`}>
                        <div>{m.body}</div>
                        <div className={`text-[10px] mt-1 flex items-center gap-1 ${m.direction === 'out' ? 'text-white/60' : 'text-muted-foreground'}`}><Clock size={10} />{new Date(m.created_at.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {m.direction === 'out' ? '• you' : ''}</div>
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
                className="p-3 border-t border-border bg-card flex gap-2"
              >
                <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={isHuman ? 'Reply as OCP…' : 'Take over first, then reply…'} disabled={!isHuman && (chatQuery.data?.messages?.length ?? 0) > 0} className="flex-1" />
                <Button type="submit" disabled={!input.trim() || sendMut.isPending} size="lg"><Send size={14} /> Send</Button>
              </form>

              {/* Context */}
              <div className="border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1"><ShoppingCart size={12} /> Cart: {(chatQuery.data as { cart?: unknown[] })?.cart ? JSON.stringify((chatQuery.data as { cart?: unknown[] }).cart).slice(0, 80) : '—'}</span>
                <span className="inline-flex items-center gap-1"><Bot size={12} /> State: {chatQuery.data?.state ?? '—'}</span>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
