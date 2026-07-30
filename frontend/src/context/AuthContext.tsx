import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getCustomerToken, getStoredCustomer, fetchMe, logout as doLogout, type Customer } from '../services/authService';

type AuthContextType = {
  customer: Customer | null;
  token: string;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setCustomer: (c: Customer | null, token?: string) => void;
};

const Ctx = createContext<AuthContextType>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomerState] = useState<Customer | null>(() => getStoredCustomer());
  const [token, setToken] = useState<string>(() => getCustomerToken());
  const [loading, setLoading] = useState<boolean>(() => !!getCustomerToken());

  const refresh = async () => {
    const t = getCustomerToken();
    if (!t) { setCustomerState(null); setToken(''); setLoading(false); return; }
    try {
      const c = await fetchMe();
      setCustomerState(c);
      setToken(t);
    } catch {
      // token invalid — clear
      try { localStorage.removeItem('ocp_customer_token'); localStorage.removeItem('ocp_customer'); } catch {}
      setCustomerState(null);
      setToken('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) refresh();
    else setLoading(false);
    // listen for storage changes (login in another tab)
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'ocp_customer_token' || e.key === 'ocp_customer') {
        setToken(getCustomerToken());
        setCustomerState(getStoredCustomer());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setCustomer = (c: Customer | null, t?: string) => {
    setCustomerState(c);
    if (t !== undefined) setToken(t);
  };

  const logout = async () => {
    await doLogout();
    setCustomerState(null);
    setToken('');
  };

  return <Ctx.Provider value={{ customer, token, loading, refresh, logout, setCustomer }}>{children}</Ctx.Provider>;
}
