import { useEffect, useState } from "react";
import { api, type PolicyContext } from "@/lib/api";

// Module-level cache: both policy pages mount on the same navigation and the
// backend already caches the payload for a minute, so one in-flight promise is
// enough for the whole tab.
//
// While `context` is null (first load, or the endpoint is unreachable) the
// callers must render their neutral "the instance operator may ..." wording, so
// the legal pages never claim a service is enabled when we failed to find out.
let cached: Promise<PolicyContext | null> | null = null;

export function usePolicyContext(): PolicyContext | null {
  const [context, setContext] = useState<PolicyContext | null>(null);

  useEffect(() => {
    if (!cached) {
      cached = api
        .fetchPolicyContext()
        .then((res) => res.data ?? null)
        .catch(() => null);
    }
    let live = true;
    cached.then((c) => {
      if (live) setContext(c);
    });
    return () => {
      live = false;
    };
  }, []);

  return context;
}
