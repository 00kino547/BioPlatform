import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { domainContext } from "./domainContext";
import type { DomainInfo } from "./domainContext";

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

  return <domainContext.Provider value={{ info, loading }}>{children}</domainContext.Provider>;
}
