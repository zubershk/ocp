import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { getAdminKey } from '../services/api';

export interface RealtimeEvent {
  type: string;
  at: string;
  data?: Record<string, unknown>;
}

interface RealtimeState {
  live: boolean;
  lastEvent: RealtimeEvent | null;
  lastSeq: number;
  reconnect: () => void;
}

const Ctx = createContext<RealtimeState>({ live: false, lastEvent: null, lastSeq: 0, reconnect: () => {} });
export const useRealtime = () => useContext(Ctx);

const STREAM_URL = '/admin/events/stream';

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [live, setLive] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const [lastSeq, setLastSeq] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const key = getAdminKey();
    if (!key) return;
    abortRef.current?.abort();
    if (timerRef.current) clearTimeout(timerRef.current);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      try {
        const res = await fetch(STREAM_URL, {
          headers: { Accept: 'text/event-stream', 'X-Admin-Key': key },
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
        setLive(true);
        retryRef.current = 0;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of chunk.split('\n')) {
              const t = line.trim();
              if (!t.startsWith('data:')) continue;
              try {
                const ev = JSON.parse(t.slice(5).trim()) as RealtimeEvent;
                if (ev.type === 'ping' || ev.type === 'hello') continue;
                setLastEvent(ev);
                setLastSeq((n) => n + 1);
              } catch {}
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
      if (ctrl.signal.aborted) return;
      setLive(false);
      const backoff = Math.min(30000, 2000 * 2 ** retryRef.current);
      retryRef.current += 1;
      timerRef.current = setTimeout(connect, backoff);
    })();
  }, []);

  useEffect(() => {
    // (re)connect when an admin key appears (login happens in-page)
    connect();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'ocp_admin_key') connect();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [connect]);

  return (
    <Ctx.Provider value={{ live, lastEvent, lastSeq, reconnect: connect }}>
      {children}
    </Ctx.Provider>
  );
}
