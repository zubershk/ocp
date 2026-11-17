import {
  Bell,
  BellMinus,
  X,
  CheckCircle,
} from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import { useRealtime } from '../../context/RealtimeContext';

export interface Notification {
  id: string;
  title: string;
  message?: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
  actionUrl?: string;
  actionLabel?: string;
}

// Notifications are populated from the real admin SSE event stream — no fake
// seed data. The center starts empty and fills as events arrive.
const MAX_NOTIFICATIONS = 50;

function eventToNotification(ev: { type: string; at: string; data?: Record<string, unknown> }, id: string): Notification | null {
  const d = ev.data ?? {};
  const orderNo = d.order_number ? String(d.order_number) : '';
  switch (ev.type) {
    case 'order.created':
    case 'order.new':
      return { id, title: `New order ${orderNo}`.trim(), message: 'A new order was placed.', type: 'info', read: false, createdAt: ev.at, actionUrl: '/admin', actionLabel: 'View orders' };
    case 'order.status':
    case 'order.updated':
      return { id, title: `Order ${orderNo} updated`.trim(), message: d.status ? `Status: ${String(d.status).replace(/_/g, ' ')}` : undefined, type: 'success', read: false, createdAt: ev.at, actionUrl: '/admin', actionLabel: 'View order' };
    case 'chat.message':
      return { id, title: 'New WhatsApp message', message: d.dir === 'out' ? 'You sent a reply.' : 'A customer sent a message.', type: 'info', read: false, createdAt: ev.at, actionUrl: '/admin/chats', actionLabel: 'Open chat' };
    case 'review.created':
      return { id, title: 'New review', message: 'A customer left a review awaiting moderation.', type: 'info', read: false, createdAt: ev.at, actionUrl: '/admin/reviews', actionLabel: 'Moderate' };
    default:
      return null; // ignore ping/hello and unknown event types
  }
}

const typeColor: Record<string, string> = {
  success: 'bg-emerald-50/20 text-emerald-600',
  warning: 'bg-amber-50/20 text-amber-600',
  error: 'bg-rose-50/20 text-rose-600',
  info: 'bg-brand-50/20 text-brand-600',
};

const dismissingNotifications = new Set<string>();

export function NotificationCenter() {
  const { push } = useToast();
  const { lastEvent, lastSeq } = useRealtime();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const swipeRefs = useRef<Map<string, { x: number; startX: number }>>(new Map());

  // Convert incoming realtime events into notifications (dedup by lastSeq).
  const lastSeqRef = useRef(0);
  useEffect(() => {
    if (!lastEvent || lastSeq === lastSeqRef.current) return;
    lastSeqRef.current = lastSeq;
    const n = eventToNotification(lastEvent, `evt-${lastSeq}`);
    if (!n) return;
    setNotifications((prev) => [n, ...prev].slice(0, MAX_NOTIFICATIONS));
  }, [lastEvent, lastSeq]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const dismissNotification = useCallback((id: string) => {
    dismissingNotifications.add(id);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      dismissingNotifications.delete(id);
    }, 200);
  }, []);

  const showToast = useCallback(
    (n: Notification) => {
      push({
        title: n.title,
        message: n.message,
        type: n.type,
        duration: 6000,
        action: n.actionUrl
          ? {
              label: n.actionLabel || 'View',
              onClick: () => {
                window.dispatchEvent(
                  new CustomEvent('ocp:navigate', { detail: n.actionUrl })
                );
              },
            }
          : undefined,
      });
    },
    [push]
  );

  const handleSwipeStart = (id: string, clientX: number) => {
    swipeRefs.current.set(id, { x: clientX, startX: clientX });
  };

  const handleSwipeMove = (id: string, clientX: number) => {
    const state = swipeRefs.current.get(id);
    if (!state) return;
    const dx = clientX - state.startX;
    // Only allow rightward swipe (dismiss)
    if (dx > 0 && dx < 200) {
      state.x = dx;
    }
  };

  const handleSwipeEnd = (id: string, n: Notification) => {
    const state = swipeRefs.current.get(id);
    if (!state) return;
    if (state.x > 80) {
      dismissNotification(id);
      showToast(n);
    }
    swipeRefs.current.delete(id);
    state.x = 0;
  };

  return (
    <>
      {/* Notification bell trigger */}
      <button
        onClick={() => {
          setOpen(!open);
          if (unreadCount > 0) {
            markAllRead();
          }
        }}
        className="relative p-2 rounded-xl hover:bg-stone-50 transition-colors touch-target"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        aria-expanded={open}
      >
        <div className="relative">
          {unreadCount > 0 ? <BellMinus size={20} className="text-brand-600" /> : <Bell size={20} />}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center font-bold shadow-sm animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
      </button>

      {/* Notification panel */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-80 max-w-[90vw] bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <h2 className="font-heading font-bold text-lg">Notifications</h2>
              <button
                onClick={clearAll}
                className="text-xs text-zinc-500 hover:text-rose-600 transition-colors"
                disabled={notifications.length === 0}
              >
                Clear all
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {notifications.length === 0 ? (
                <div className="text-center py-10 text-zinc-400 text-sm">
                  <Bell size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No notifications</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const Icon =
                    n.type === 'success' ? CheckCircle :
                    n.type === 'warning' ? X :
                    n.type === 'error' ? X :
                    Bell;
                  const isDismissing = dismissingNotifications.has(n.id);
                  const state = swipeRefs.current.get(n.id);
                  const offsetX = state?.x || 0;

                  return (
                    <div
                      key={n.id}
                      onTouchStart={(e) => handleSwipeStart(n.id, e.touches[0].clientX)}
                      onTouchMove={(e) => handleSwipeMove(n.id, e.touches[0].clientX)}
                      onTouchEnd={() => handleSwipeEnd(n.id, n)}
                      onMouseDown={(e) => handleSwipeStart(n.id, e.clientX)}
                      onMouseMove={(e) => handleSwipeMove(n.id, e.clientX)}
                      onMouseUp={() => handleSwipeEnd(n.id, n)}
                      onClick={() => {
                        markRead(n.id);
                        if (n.actionUrl) {
                          window.dispatchEvent(
                            new CustomEvent('ocp:navigate', { detail: n.actionUrl })
                          );
                        }
                        setOpen(false);
                      }}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer relative overflow-hidden ${
                        n.read
                          ? 'border-stone-100 bg-stone-50/50 hover:bg-stone-100'
                          : 'border-brand-100 bg-brand-50/40 hover:bg-brand-100/60'
                      } ${isDismissing ? 'opacity-0 translate-x-[200px]' : ''} `}
                      style={{ transform: `translateX(${offsetX}px)` }}
                    >
                      <div className="shrink-0 mt-0.5 p-1.5 rounded-lg" style={{ backgroundColor: typeColor[n.type] }}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <h3 className="font-semibold text-sm text-zinc-900 leading-tight">
                            {n.title}
                          </h3>
                          <span className="text-[10px] text-zinc-400 mt-0.5">
                            {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {n.message && (
                          <p className="text-xs text-zinc-600 mt-1 line-clamp-2">{n.message}</p>
                        )}
                        {n.actionUrl && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              showToast(n);
                            }}
                            className="mt-2 text-xs font-medium text-brand-600 hover:underline transition-colors"
                          >
                            {n.actionLabel || 'View details'}
                          </button>
                        )}
                      </div>
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0" />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-stone-100 px-5 py-3">
              <button
                onClick={markAllRead}
                className="w-full flex items-center justify-center gap-2 text-sm text-zinc-600 hover:bg-stone-50 rounded-xl transition-colors disabled:opacity-50"
                disabled={notifications.every((n) => n.read)}
              >
                <CheckCircle size={14} className="text-emerald-600" />
                Mark all as read
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
