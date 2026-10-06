import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface LandingConfig {
  featuredProfileUsername: string | null;
}

let cached: Promise<LandingConfig> | null = null;

export function useLandingConfig(): LandingConfig | null {
  const [config, setConfig] = useState<LandingConfig | null>(null);

  useEffect(() => {
    if (!cached) {
      cached = api
        .fetchLandingConfig()
        .then((res) => ({ featuredProfileUsername: res.data?.featuredProfileUsername ?? null }))
        .catch(() => ({ featuredProfileUsername: null }));
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