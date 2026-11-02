import { createContext } from "react";

export interface DomainInfo {
  active: boolean;
  host: string;
  slug: string | null;
  canonical: string | null;
}

export interface DomainContextValue {
  info: DomainInfo | null;
  loading: boolean;
}

// The context object is kept in a data-only module. DomainProvider can then
// remain a component-only module for reliable Fast Refresh boundaries.
export const domainContext = createContext<DomainContextValue>({ info: null, loading: true });
