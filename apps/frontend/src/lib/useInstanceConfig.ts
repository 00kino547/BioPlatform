import { useEffect, useState } from "react";
import { api, type InstanceConfigPublic } from "@/lib/api";

// Module-level cache: one in-flight promise for the tab. The backend serves
// GET /api/config with Cache-Control max-age=60 and an absent config.yml is the
// all-defaults state (every field empty, hidePricing off), so a failed fetch is
// fine: callers fall back to their branding/VITE defaults on empty strings.
let cached: Promise<InstanceConfigPublic | null> | null = null;

export function useInstanceConfig(): InstanceConfigPublic | null {
  const [config, setConfig] = useState<InstanceConfigPublic | null>(null);

  useEffect(() => {
    if (!cached) {
      cached = api
        .fetchInstanceConfig()
        .then((res) => res.data ?? null)
        .catch(() => null);
    }
    let live = true;
    cached.then((c) => {
      if (live) setConfig(c);
    });
    return () => {
      live = false;
    };
  }, []);

  return config;
}