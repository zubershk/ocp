import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Save, RotateCcw, MessageSquare, ChevronDown, ChevronRight,
  Eye, HelpCircle, Smartphone, Search, Info, X, CheckCircle, AlertTriangle,
} from 'lucide-react';
import { adminFetch, getAdminKey } from '../services/api';
import { useToast } from '../context/ToastContext';
import AdminSubNav from '../components/layout/AdminSubNav';
import { Button } from '@/components/shadcn/button';
import { Card, CardContent } from '@/components/shadcn/card';
import { Input } from '@/components/shadcn/input';
import { Badge } from '@/components/shadcn/badge';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/shadcn/dialog';

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

interface BotMessage {
  id: number;
  message_key: string;
  category: string;
  description: string;
  message_text: string;
  variables: string;
  active: boolean;
}

// ------------------------------------------------------------------
// Category metadata — labels, colors, descriptions, when-sent info
// ------------------------------------------------------------------

const CATEGORIES: Record<string, {
  label: string;
  color: string;
  icon: string;
  description: string;
  whenSent: string;
}> = {
  greeting: {
    label: 'Welcome & Greetings',
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: '👋',
    description: 'First message customers see when they open the bot.',
    whenSent: 'Sent when a customer types "hi", "hello", or starts a new conversation.',
  },
  ordering: {
    label: 'Menu & Ordering',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    icon: '🍕',
    description: 'Messages shown while browsing the menu and selecting items.',
    whenSent: 'Sent during category browsing, item selection, and size/crust picking.',
  },
  cart: {
    label: 'Shopping Cart',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: '🛒',
    description: 'Cart display, item additions, and cart management.',
    whenSent: 'Sent when viewing cart, adding items, or clearing the cart.',
  },
  checkout: {
    label: 'Checkout & Delivery',
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    icon: '🏪',
    description: 'Delivery/pickup selection, address collection, and payment.',
    whenSent: 'Sent during the checkout flow — choosing delivery, entering address, picking payment.',
  },
  confirmation: {
    label: 'Order Confirmation',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: '✅',
    description: 'Final review before placing, and success confirmation.',
    whenSent: 'Sent when reviewing order summary and after order is placed.',
  },
  status: {
    label: 'Order Status Updates',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: '📦',
    description: 'Notifications when order status changes.',
    whenSent: 'Sent automatically when admin changes order status (confirmed, preparing, ready, etc.).',
  },
  notification: {
    label: 'WhatsApp Notifications',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: '🔔',
    description: 'Alerts sent to restaurant and OTP codes for login.',
    whenSent: 'Sent to restaurant when new order arrives, and OTP codes to customers.',
  },
  profile: {
    label: 'Customer Profile',
    color: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    icon: '👤',
    description: 'Profile viewing and editing.',
    whenSent: 'Sent when customer views or edits their profile.',
  },
  support: {
    label: 'Customer Support',
    color: 'bg-pink-100 text-pink-700 border-pink-200',
    icon: '💬',
    description: 'Human support handoff messages.',
    whenSent: 'Sent when customer requests human support.',
  },
  location: {
    label: 'Restaurant Location',
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    icon: '📍',
    description: 'Address, phone, and hours info.',
    whenSent: 'Sent when customer asks for location or opening hours.',
  },
  errors: {
    label: 'Error Messages',
    color: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    icon: '⚠️',
    description: 'Helpful error messages when something goes wrong.',
    whenSent: 'Sent on invalid input, unavailable items, or service errors.',
  },
  commands: {
    label: 'Quick Commands',
    color: 'bg-teal-100 text-teal-700 border-teal-200',
    icon: '⚡',
    description: 'Cancel, restart, and state-specific help text.',
    whenSent: 'Sent on cancel/restart commands and as inline help during flows.',
  },
};

// ------------------------------------------------------------------
// Variable reference
// ------------------------------------------------------------------

const VARIABLE_REF: Record<string, { description: string; example: string }[]> = {
  greeting: [
    { description: 'Your restaurant name', example: 'My Pizza Place' },
    { description: 'Customer first name', example: 'John' },
    { description: 'Number of items in cart', example: '3' },
    { description: 'Current conversation state', example: 'Category' },
  ],
  ordering: [
    { description: 'Category name', example: 'Veg Pizzas' },
    { description: 'Item name', example: 'Margherita' },
    { description: 'Selected size', example: 'Medium' },
    { description: 'Selected crust', example: 'Thin Crust' },
    { description: 'Item price', example: '385' },
  ],
  cart: [
    { description: 'Item name', example: 'Margherita' },
    { description: 'Size', example: 'Medium' },
    { description: 'Crust name', example: 'Thin Crust' },
    { description: 'Quantity', example: '2' },
    { description: 'Line total', example: '770' },
  ],
  checkout: [
    { description: 'Customer name', example: 'John' },
    { description: 'Delivery address', example: '123 Main St' },
    { description: 'Restaurant name', example: 'My Pizza Place' },
    { description: 'Restaurant address', example: 'Shop 1, Mumbai' },
  ],
  confirmation: [
    { description: 'Customer name', example: 'John' },
    { description: 'Delivery or Pickup', example: 'Delivery' },
    { description: 'Item list', example: '2 x Margherita' },
    { description: 'Subtotal', example: '770' },
    { description: 'Total amount', example: '770' },
    { description: 'Payment method', example: 'Cash' },
    { description: 'Order number', example: 'OCP-20260901-0001' },
  ],
  status: [
    { description: 'Restaurant name', example: 'My Pizza Place' },
    { description: 'Order number', example: 'OCP-20260901-0001' },
    { description: 'Status text', example: 'Confirmed' },
  ],
  notification: [
    { description: 'Restaurant name', example: 'My Pizza Place' },
    { description: 'OTP code', example: '123456' },
    { description: 'Customer phone', example: '9876543210' },
    { description: 'Customer name', example: 'John' },
    { description: 'Order number', example: 'OCP-20260901-0001' },
    { description: 'Cart item count', example: '2' },
  ],
  errors: [
    { description: 'Help text for current state', example: 'Type menu to start' },
  ],
};

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export default function AdminBotWorkflows() {
  const [authed] = useState(() => getAdminKey().length > 0);
  const qc = useQueryClient();
  const toast = useToast();

  // UI state
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState('');
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [confirmResetKey, setConfirmResetKey] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // Data
  const messagesQuery = useQuery({
    queryKey: ['admin-bot-messages'],
    queryFn: () => adminFetch<{ messages: BotMessage[]; categories: string[] }>('/admin/bot-messages'),
    enabled: authed,
  });

  // Mutations
  const updateMutation = useMutation({
    mutationFn: ({ key, text }: { key: string; text: string }) =>
      adminFetch(`/admin/bot-messages/${key}`, { method: 'PUT', body: JSON.stringify({ message_text: text }) }),
    onSuccess: () => { toast.push({ type: 'success', title: 'Message saved' }); qc.invalidateQueries({ queryKey: ['admin-bot-messages'] }); setEditingKey(null); },
    onError: (e: Error) => toast.push({ type: 'error', title: e.message }),
  });

  const resetMutation = useMutation({
    mutationFn: (key: string) => adminFetch(`/admin/bot-messages/reset/${key}`, { method: 'POST' }),
    onSuccess: () => { toast.push({ type: 'success', title: 'Reset to default' }); qc.invalidateQueries({ queryKey: ['admin-bot-messages'] }); setConfirmResetKey(null); },
    onError: (e: Error) => toast.push({ type: 'error', title: e.message }),
  });

  const resetAllMutation = useMutation({
    mutationFn: () => adminFetch('/admin/bot-messages/reset-all', { method: 'POST' }),
    onSuccess: () => { toast.push({ type: 'success', title: 'All messages reset' }); qc.invalidateQueries({ queryKey: ['admin-bot-messages'] }); setConfirmResetAll(false); },
    onError: (e: Error) => toast.push({ type: 'error', title: e.message }),
  });

  const previewMutation = useMutation({
    mutationFn: (key: string) => adminFetch<{ rendered: string }>(`/admin/bot-messages/preview/${key}`, { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: (data) => { setPreviewText(data.rendered); },
    onError: (e: Error) => toast.push({ type: 'error', title: e.message }),
  });

  // Derived
  const messages = messagesQuery.data?.messages ?? [];
  const categories = messagesQuery.data?.categories ?? [];

  const grouped = categories.reduce<Record<string, BotMessage[]>>((acc, cat) => {
    acc[cat] = messages.filter((m) => m.category === cat);
    return acc;
  }, {});

  const filteredGrouped = searchQuery.trim()
    ? categories.reduce<Record<string, BotMessage[]>>((acc, cat) => {
        const q = searchQuery.toLowerCase();
        const filtered = grouped[cat]?.filter(
          (m) =>
            m.message_key.toLowerCase().includes(q) ||
            m.description.toLowerCase().includes(q) ||
            m.message_text.toLowerCase().includes(q)
        );
        if (filtered?.length) acc[cat] = filtered;
        return acc;
      }, {})
    : grouped;

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Enter your admin key at /admin first.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <AdminSubNav activeOverride="/admin/bot-workflows" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare size={20} /> Bot Messages
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Customize every WhatsApp bot response — no coding needed.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={showHelp ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowHelp(!showHelp)}
            className="gap-1.5"
          >
            <HelpCircle size={14} /> How it works
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmResetAll(true)}
            className="gap-1.5"
          >
            <RotateCcw size={14} /> Reset All
          </Button>
        </div>
      </div>

        {/* ---- Getting Started Guide ---- */}
        {showHelp && (
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <Info size={20} className="text-blue-600 mt-0.5 shrink-0" />
                <div className="text-sm space-y-3">
                  <h3 className="font-semibold text-blue-900">How Bot Messages Work</h3>
                  <div className="space-y-2 text-blue-800">
                    <p><strong>1. Every message your bot sends is stored here.</strong> Edit any message to change what the bot says.</p>
                    <p><strong>2. Use {'{{.Variable}}'} for dynamic content.</strong> For example, {'{{.Name}}'} becomes the customer's name, {'{{.OrderNumber}}'} becomes their order ID.</p>
                    <p><strong>3. Changes are instant.</strong> Save a message and the bot uses it immediately — no restart needed.</p>
                    <p><strong>4. You can always reset.</strong> Each message has a "Reset" button to restore the original text.</p>
                  </div>
                  <div className="bg-card rounded-xl p-3 border border-blue-100">
                    <p className="text-xs font-medium text-blue-900 mb-1">Example template:</p>
                    <code className="text-xs text-blue-700 break-all">
                      {'Thank you, {{.Name}}! Your order {{.OrderNumber}} is {{.Status}}.'}
                    </code>
                    <p className="text-xs text-blue-600 mt-1">
                      Renders as: "Thank you, John! Your order OCP-20260901-0001 is Confirmed."
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---- Search ---- */}
        <div className="mb-4 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* ---- Categories ---- */}
        {messagesQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : Object.keys(filteredGrouped).length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {searchQuery ? 'No messages match your search.' : 'No messages found.'}
          </div>
        ) : (
          Object.entries(filteredGrouped).map(([cat, items]) => {
            const meta = CATEGORIES[cat] || { label: cat, color: 'bg-zinc-100 text-zinc-600 border-zinc-200', icon: '💬', description: '', whenSent: '' };
            const isExpanded = expandedCat === cat;
            return (
              <div key={cat} className="mb-3">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => setExpandedCat(isExpanded ? null : cat)}
                >
                  {isExpanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                  <span className="text-lg">{meta.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-sm">{meta.label}</div>
                    <div className="text-xs text-muted-foreground">{meta.description}</div>
                  </div>
                  <Badge variant="outline" className={meta.color}>
                    {items.length} messages
                  </Badge>
                </Button>

                {isExpanded && (
                  <div className="mt-2 ml-6 space-y-2">
                    {/* When-sent hint */}
                    {meta.whenSent && (
                      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted text-xs text-muted-foreground">
                        <Info size={14} className="shrink-0 mt-0.5" />
                        <span>{meta.whenSent}</span>
                      </div>
                    )}

                    {items.map((msg) => (
                      <MessageCard
                        key={msg.message_key}
                        msg={msg}
                        cat={cat}
                        isEditing={editingKey === msg.message_key}
                        editText={editText}
                        onEdit={() => { setEditingKey(msg.message_key); setEditText(msg.message_text); }}
                        onEditTextChange={setEditText}
                        onSave={() => updateMutation.mutate({ key: msg.message_key, text: editText })}
                        onCancel={() => setEditingKey(null)}
                        onPreview={() => { setPreviewKey(msg.message_key); previewMutation.mutate(msg.message_key); }}
                        onReset={() => setConfirmResetKey(msg.message_key)}
                        isPending={updateMutation.isPending}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* ---- Variable Reference ---- */}
        {!searchQuery && expandedCat && CATEGORIES[expandedCat] && VARIABLE_REF[expandedCat] && (
          <Card className="mt-6">
            <CardContent className="p-5">
              <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                <span className="text-lg">{CATEGORIES[expandedCat].icon}</span>
                Available Variables for {CATEGORIES[expandedCat].label}
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Use these placeholders in your message. They are replaced with real values when the bot sends the message.
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {VARIABLE_REF[expandedCat].map((v, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
                    <code className="text-xs bg-card border px-1.5 py-0.5 rounded font-mono text-primary shrink-0">
                      {'{{.'}{v.description.split(' ').slice(0, 2).map(w => w[0].toUpperCase() + w.slice(1)).join('')}{'}'}
                    </code>
                    <span className="text-xs text-muted-foreground truncate">{v.description} — e.g. "{v.example}"</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      {/* ---- WhatsApp Preview Modal ---- */}
      <Dialog open={!!previewKey} onOpenChange={(open) => { if (!open) { setPreviewKey(null); setPreviewText(''); } }}>
        <DialogContent className="p-0 overflow-hidden max-w-sm" showCloseButton={false}>
          {/* Phone frame */}
          <div className="bg-zinc-800 px-4 py-2 flex items-center justify-between">
            <span className="text-white text-xs font-medium">WhatsApp Preview</span>
            <Button variant="ghost" size="icon" className="size-7 text-zinc-400 hover:text-white" onClick={() => { setPreviewKey(null); setPreviewText(''); }}>
              <X size={16} />
            </Button>
          </div>
          {/* Chat header */}
          <div className="bg-[#075e54] px-4 py-2.5 flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-600 grid place-items-center text-white text-xs font-bold">R</div>
            <div>
              <div className="text-white text-sm font-medium">Restaurant</div>
              <div className="text-green-200 text-[10px]">online</div>
            </div>
          </div>
          {/* Message bubble */}
          <div className="bg-[#ece5dd] p-4 min-h-[120px] flex items-end">
            <div className="bg-[#dcf8c6] rounded-xl rounded-tl-none p-3 max-w-[85%] shadow-sm">
              <p className="text-sm text-zinc-800 whitespace-pre-wrap break-words leading-relaxed">
                {previewMutation.isPending ? 'Loading...' : (previewText || 'Click preview on a message to see it here.')}
              </p>
              <div className="text-[10px] text-zinc-500 text-right mt-1">12:00 PM ✓✓</div>
            </div>
          </div>
          {/* Message key */}
          <div className="px-4 py-2 bg-muted border-t text-center">
            <code className="text-xs text-muted-foreground font-mono">{previewKey}</code>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Reset Single Confirm ---- */}
      <Dialog open={!!confirmResetKey} onOpenChange={(open) => { if (!open) setConfirmResetKey(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-100 grid place-items-center"><AlertTriangle size={18} className="text-orange-600" /></div>
              <div>
                <DialogTitle>Reset this message?</DialogTitle>
                <DialogDescription>This will restore the original default text.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <code className="block text-xs bg-muted rounded-lg p-2 font-mono text-muted-foreground">{confirmResetKey}</code>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmResetKey(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => resetMutation.mutate(confirmResetKey!)}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? 'Resetting...' : 'Reset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Reset All Confirm ---- */}
      <Dialog open={confirmResetAll} onOpenChange={(open) => { if (!open) setConfirmResetAll(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 grid place-items-center"><AlertTriangle size={18} className="text-red-600" /></div>
              <div>
                <DialogTitle>Reset all messages?</DialogTitle>
                <DialogDescription>Every bot message will be restored to its original default. Your edits will be lost.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmResetAll(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => resetAllMutation.mutate()}
              disabled={resetAllMutation.isPending}
            >
              {resetAllMutation.isPending ? 'Resetting...' : 'Reset All'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------------
// MessageCard — individual message row with edit/preview/reset
// ------------------------------------------------------------------

function MessageCard({
  msg, cat, isEditing, editText, onEdit, onEditTextChange, onSave, onCancel, onPreview, onReset, isPending,
}: {
  msg: BotMessage;
  cat: string;
  isEditing: boolean;
  editText: string;
  onEdit: () => void;
  onEditTextChange: (t: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onPreview: () => void;
  onReset: () => void;
  isPending: boolean;
}) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Key + description */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{msg.message_key}</code>
              {msg.description && <span className="text-xs text-muted-foreground">{msg.description}</span>}
            </div>

            {/* Variables hint */}
            {msg.variables && (
              <div className="flex items-center gap-1 mb-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground">Variables:</span>
                {msg.variables.split(',').map((v) => (
                  <code key={v} className="text-[10px] bg-primary/10 text-primary px-1 py-0.5 rounded font-mono">{`{{.${v.trim()}}}`}</code>
                ))}
              </div>
            )}

            {/* Message content */}
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => onEditTextChange(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-transparent text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={onSave}
                    disabled={isPending}
                    className="gap-1"
                  >
                    <Save size={12} /> {isPending ? 'Saving...' : 'Save'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
                </div>
              </div>
            ) : (
              <pre className="text-xs text-muted-foreground bg-muted rounded-lg p-3 whitespace-pre-wrap font-mono max-h-24 overflow-y-auto border border-border">
                {msg.message_text}
              </pre>
            )}
          </div>

          {/* Action buttons */}
          {!isEditing && (
            <div className="flex flex-col gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="size-7" onClick={onEdit} title="Edit message">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </Button>
              <Button variant="ghost" size="icon" className="size-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={onPreview} title="Preview in WhatsApp">
                <Smartphone size={14} />
              </Button>
              <Button variant="ghost" size="icon" className="size-7 text-orange-600 hover:text-orange-700 hover:bg-orange-50" onClick={onReset} title="Reset to default">
                <RotateCcw size={14} />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
