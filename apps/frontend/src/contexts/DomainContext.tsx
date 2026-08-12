import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

export interface DomainInfo {
  active: boolean;
  host: string;
  slug: string | null;
  canonical: string | null;
}

interface DomainContextValue {
  info: DomainInfo | null;
  loading: boolean;
}

const DomainContext = createContext<DomainContextValue>({ info: null, loading: true });

export function DomainProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<DomainInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getDomainInfo()
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) setInfo(res.data);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <DomainContext.Provider value={{ info, loading }}>{children}</DomainContext.Provider>;
}

export function useDomain(): DomainContextValue {
  return useContext(DomainContext);
}
