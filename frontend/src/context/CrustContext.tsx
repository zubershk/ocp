import { createContext, useContext, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface CrustOption {
  slug: string;
  name: string;
  description: string;
  regular: number;
  medium: number;
  large: number;
}

type CrustContextType = {
  crusts: CrustOption[];
  loading: boolean;
  getCrustExtra: (slug: string, size: string) => number;
  /** First active crust slug — safe default when the classic base is off. */
  defaultCrust: string;
};

const CrustContext = createContext<CrustContextType>({ crusts: [], loading: true, getCrustExtra: () => 0, defaultCrust: 'tossed' });
export const useCrusts = () => useContext(CrustContext);

export function CrustProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery<CrustOption[]>({
    queryKey: ['crusts'],
    queryFn: async () => {
      const res = await fetch('/api/crusts');
      if (!res.ok) return [];
      const d = await res.json();
      return d.crusts ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const crusts = data ?? [];
  const getCrustExtra = (slug: string, size: string): number => {
    const c = crusts.find(x => x.slug === slug);
    if (!c) return 0;
    if (size === 'regular') return c.regular;
    if (size === 'medium') return c.medium;
    return c.large;
  };
  const defaultCrust = crusts.length > 0 ? crusts[0].slug : 'tossed';

  return (
    <CrustContext.Provider value={{ crusts, loading: isLoading, getCrustExtra, defaultCrust }}>
      {children}
    </CrustContext.Provider>
  );
}
