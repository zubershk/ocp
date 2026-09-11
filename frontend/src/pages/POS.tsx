import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PauseCircle, PlusCircle, ReceiptText } from 'lucide-react';
import Button from '../components/ui/Button';
import { adminFetch, getAdminKey } from '../services/api';
import {
  posApi,
  getPosOutletId,
  toPaise,
  posErrorMessage,
  type PosOrder,
  type PosOrderType,
} from '../services/posService';
import PosAuthGate from '../components/pos/PosAuthGate';
import OutletSwitcher from '../components/pos/OutletSwitcher';
import PosHeader from '../components/pos/PosHeader';
import OrderTypeBar from '../components/pos/OrderTypeBar';
import MenuPanel from '../components/pos/MenuPanel';
import TablePicker from '../components/pos/TablePicker';
import CartPanel from '../components/pos/CartPanel';
import CheckoutPanel from '../components/pos/CheckoutPanel';
import HoldDrawer from '../components/pos/HoldDrawer';
import ReceiptModal from '../components/pos/ReceiptModal';
import type { CartLine, HeldOrder, RecordedPayment } from '../components/pos/types';

const HELD_KEY = 'ocp_pos_held';
const ORDER_KEY = 'ocp_pos_order';
const PAYMENTS_KEY = (orderId: number): string => `ocp_pos_payments:${orderId}`;

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export default function POS() {
  const [authed, setAuthed] = useState(() => getAdminKey().length > 0);
  const [outletId, setOutletId] = useState<number | null>(() => getPosOutletId());
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<PosOrderType>('dine_in');
  const [tableId, setTableId] = useState(0);
  const [orderId, setOrderId] = useState<number | null>(() => loadJSON<number | null>(ORDER_KEY, null));
  const [held, setHeld] = useState<HeldOrder[]>(() => loadJSON<HeldOrder[]>(HELD_KEY, []));
  const [payments, setPayments] = useState<RecordedPayment[]>([]);
  const [duePaise, setDuePaise] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [holding, setHolding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resumingId, setResumingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const queryClient = useQueryClient();

  const [online, setOnline] = useState(true);
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const roleQuery = useQuery({
    queryKey: ['pos-role'],
    queryFn: () => adminFetch<{ role?: string; user?: { role?: string; name?: string } }>('/admin/me').then((r) => r.role ?? r.user?.role ?? 'owner'),
    enabled: authed,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const role = roleQuery.data ?? 'owner';
  const operatorName = ((roleQuery.data as { user?: { name?: string } })?.user?.name) ?? '';
  const canPay = ['owner', 'manager', 'cashier'].includes(role);
  const canDiscount = ['owner', 'manager'].includes(role);
  const canRefund = ['owner', 'manager'].includes(role);
  const canManage = ['owner', 'manager'].includes(role);

  // Outlet-scoped persistence
  useEffect(() => {
    const saved = loadJSON<HeldOrder[]>(`${HELD_KEY}:${outletId ?? 'default'}`, []);
    setHeld(saved);
  }, [outletId]);
  useEffect(() => {
    saveJSON(`${HELD_KEY}:${outletId ?? 'default'}`, held);
  }, [outletId, held]);

  // Restore persisted current order id for this outlet
  useEffect(() => {
    const saved = loadJSON<number | null>(`${ORDER_KEY}:${outletId ?? 'default'}`, null);
    setOrderId(saved);
  }, [outletId]);

  // Persist current order id
  useEffect(() => {
    if (orderId != null) saveJSON(`${ORDER_KEY}:${outletId ?? 'default'}`, orderId);
  }, [orderId, outletId]);

  // Restore persisted payment trail when (re)opening an order.
  useEffect(() => {
    if (orderId == null) {
      setPayments([]);
      setDuePaise(null);
      return;
    }
    const saved = loadJSON<{ due: number | null; payments: RecordedPayment[] }>(PAYMENTS_KEY(orderId), { due: null, payments: [] });
    setPayments(saved.payments);
    setDuePaise(saved.due ?? null);
  }, [orderId]);

  useEffect(() => {
    if (orderId != null) saveJSON(PAYMENTS_KEY(orderId), { due: duePaise, payments });
  }, [orderId, duePaise, payments]);

  const resetSale = useCallback(() => {
    setCart([]);
    setOrderType('dine_in');
    setTableId(0);
    setOrderId(null);
    setPayments([]);
    setDuePaise(null);
    setNotice(null);
    try {
      localStorage.removeItem(`${ORDER_KEY}:${outletId ?? 'default'}`);
    } catch {
      /* ignore */
    }
  }, [outletId]);

  const openOrder = useCallback(
    (id: number, totalRupees: number) => {
      setOrderId(id);
      setPayments([]);
      setDuePaise(toPaise(totalRupees));
      queryClient.invalidateQueries({ queryKey: ['pos-tables'] });
    },
    [queryClient],
  );

  const addLine = useCallback((line: Omit<CartLine, 'key'>) => {
    const key = `${line.menuItemID}|${line.size}|${line.crust}`;
    setCart((prev) => {
      const found = prev.find((l) => l.key === key);
      if (found) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, l.quantity + line.quantity) } : l));
      }
      return [...prev, { ...line, key }];
    });
  }, []);

  const createOrder = async () => {
    if (cart.length === 0) return;
    setCreating(true);
    setFatal(null);
    try {
      const created = await posApi.createOrder(
        cart.map((l) => ({ menuItemID: l.menuItemID, size: l.size, crust: l.crust, quantity: l.quantity })),
        orderType === 'dine_in' ? tableId : 0,
        orderType,
      );
      setCart([]);
      setTableId(0);
      openOrder(created.id, created.total);
    } catch (e) {
      const { status, message } = posErrorMessage(e);
      setFatal(status === 403 ? 'Your role cannot create orders.' : message);
    } finally {
      setCreating(false);
    }
  };

const holdCurrent = async () => {
    if (orderId == null) return;
    setHolding(true);
    try {
      await posApi.holdOrder(orderId);
      const data = await posApi.getOrder(orderId);
      setHeld((prev) => [{ id: data.id, orderNumber: data.order_number, total: data.total, at: new Date().toISOString() }, ...prev].slice(0, 20));
      resetSale();
      setNotice(`Order #${data.order_number} held.`);
    } catch (e) {
      const { status, message } = posErrorMessage(e);
      setNotice(status === 409 ? 'Already held — refreshed.' : message);
      queryClient.invalidateQueries({ queryKey: ['pos-order', orderId] });
    } finally {
      setHolding(false);
    }
  };

  const resumeHeld = async (h: HeldOrder) => {
    setResumingId(h.id);
    try {
      await posApi.resumeOrder(h.id);
      setHeld((prev) => prev.filter((x) => x.id !== h.id));
      setHoldOpen(false);
      const resumed = await posApi.getOrder(h.id);
      openOrder(resumed.id, resumed.total);
      setNotice(`Order #${resumed.order_number} resumed.`);
    } catch (e) {
      setNotice(posErrorMessage(e).message);
    } finally {
      setResumingId(null);
    }
  };

  const cancelCurrent = async () => {
    if (orderId == null) return;
    if (!window.confirm('Cancel this order? Payments already taken stay on the ledger.')) return;
    setCancelling(true);
    try {
      await posApi.cancelOrder(orderId);
      resetSale();
      setNotice('Order cancelled.');
    } catch (e) {
      setNotice(posErrorMessage(e).message);
    } finally {
      setCancelling(false);
    }
  };

  const onOrderTypeChange = (t: PosOrderType) => {
    setOrderType(t);
    if (t !== 'dine_in') setTableId(0);
  };

  const onQty = useCallback((key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }, []);

  const header = useMemo(() => (
    <PosHeader
      outletId={outletId}
      onOutlet={(id) => {
        setOutletId(id);
        resetSale();
        queryClient.invalidateQueries({ queryKey: ['pos-menu'] });
        queryClient.invalidateQueries({ queryKey: ['pos-tables'] });
      }}
      operator={operatorName}
      role={role}
      heldCount={held.length}
      onNewSale={resetSale}
      onHeld={() => setHoldOpen(true)}
      onLock={() => setAuthed(false)}
      online={navigator.onLine}
    />
  ), [outletId, operatorName, role, held.length, queryClient]);

  const orderQuery = useQuery({
    queryKey: ['pos-order', orderId],
    queryFn: () => posApi.getOrder(orderId as number),
    enabled: authed && orderId != null,
    staleTime: 5 * 1000,
    retry: 1,
  });
  const order: PosOrder | undefined = orderQuery.data;
  const orderOpen = order != null && ['draft', 'held', 'confirmed'].includes(order.status);

  const modifyItems = useCallback(() => {
    if (!order) return;
    if (!window.confirm('Modify items? The current order will be cancelled and its lines restored to the cart.')) return;
    const lines: CartLine[] = (order.items ?? []).map((it) => ({
      key: `${it.menu_item_id}|${it.size ?? ''}|${it.crust ?? ''}`,
      menuItemID: it.menu_item_id,
      name: it.name,
      size: it.size ?? '',
      crust: it.crust ?? '',
      crustName: '',
      quantity: it.quantity,
      image: '',
      categoryName: '',
      unitPaise: null,
    }));
    posApi
      .cancelOrder(order.id)
      .then(() => {
        resetSale();
        setCart(lines);
        setNotice('Lines restored — edit and create a fresh order.');
      })
      .catch((e: unknown) => setNotice(posErrorMessage(e).message));
  }, [order]);

  const authedView = useMemo(() => {
    if (!authed) return null;
    return (
      <div className="min-h-screen bg-stone-100 flex flex-col">
        {header}
        <main className="mx-auto w-full max-w-7xl flex-1 p-3 sm:p-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_400px] items-start">
          <div className="rounded-3xl border border-zinc-200 bg-white p-4 min-h-0">
            <OrderTypeBar value={orderType} onChange={(t) => { setOrderType(t); if (t !== 'dine_in') setTableId(0); }} />
            {orderId == null && orderType === 'dine_in' && (
              <div className="mt-3">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Select table</p>
                <TablePicker selected={tableId} onSelect={setTableId} outletId={outletId} />
              </div>
            )}
            <MenuPanel onAdd={addLine} outletId={outletId} cart={cart} onQty={onQty} />
          </div>
          <div className="space-y-3 min-w-0">
            {fatal && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                {fatal}{' '}
                <button className="font-bold underline" onClick={() => setFatal(null)}>Dismiss</button>
              </div>
            )}
            {!['owner', 'manager', 'cashier'].includes(role) && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Signed in as {role}: read-only access. Payments, discounts and order changes are disabled.</div>
            )}
            {orderId == null ? (
              <CartPanel
                cart={cart}
                onQty={onQty}
                onRemove={(key) => setCart((prev) => prev.filter((l) => l.key !== key))}
                onClear={() => setCart([])}
                onCreate={createOrder}
                creating={creating}
                canCreate={cart.length > 0 && ['owner', 'manager', 'cashier'].includes(role)}
              />
            ) : (
              <>
                <CheckoutPanel
                  orderId={orderId}
                  payments={payments}
                  duePaise={duePaise ?? (order ? toPaise(order.total) : 0)}
                  onPaid={(p, due) => {
                    setPayments((prev) => [...prev, p]);
                    setDuePaise(due);
                  }}
                  onCompleted={() => {
                    queryClient.invalidateQueries({ queryKey: ['pos-order', orderId] });
                    setReceiptOpen(true);
                  }}
                  onHold={holdCurrent}
                  onCancel={cancelCurrent}
                  onModify={modifyItems}
                  onReceipt={() => setReceiptOpen(true)}
                  canPay={canPay}
                  canDiscount={canDiscount}
                />
                <Button variant="ghost" size="sm" icon={<ReceiptText size={14} />} onClick={() => setReceiptOpen(true)}>View receipt</Button>
              </>
            )}
          </div>
        </main>
        <HoldDrawer open={holdOpen} onClose={() => setHoldOpen(false)} held={held} orderTypes={{}} onResume={resumeHeld} resumingId={resumingId} />
        <ReceiptModal
          open={receiptOpen}
          onClose={() => setReceiptOpen(false)}
          order={order ?? null}
          payments={payments}
          canRefund={canRefund}
          outletName='Current outlet'
          onNewSale={resetSale}
        />
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, outletId, cart, orderType, tableId, orderId, order, orderOpen, payments, duePaise, creating, holding, cancelling, resumingId, notice, fatal, holdOpen, receiptOpen, held, role, modifyItems]);

  if (!authed) return <PosAuthGate onAuthed={() => setAuthed(true)} />;
  return authedView;
}