import { useCallback, useEffect, useState } from "react";
import { api, type UpdateSeverity, type VersionCheckData } from "@/lib/api";

const NEUTRAL: VersionCheckData = {
  enabled: true,
  installed: "unknown",
  latest: null,
  outdated: false,
  severity: "none",
  skippedVersions: [],
  skippedCount: 0,
  releaseUrl: "",
  releasesUrl: "",
  changelogUrl: "",
  checkedAt: new Date(0).toISOString(),
  source: "none",
  error: "unknown",
};

let cache: { data: VersionCheckData; fetchedAt: number } | null = null;
let inflight: Promise<VersionCheckData> | null = null;

function loadVersionCheck(force = false): Promise<VersionCheckData> {
  if (!force && cache) return Promise.resolve(cache.data);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await api.getVersionCheck(force);
      const data =
        res.success && res.data
          ? res.data
          : { ...NEUTRAL, error: res.error ?? "Version check failed" };
      cache = { data, fetchedAt: Date.now() };
      return data;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useVersionCheck() {
  const [data, setData] = useState<VersionCheckData | null>(() => cache?.data ?? null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const result = await loadVersionCheck(force);
      setData(result);
    } catch {
      setData((prev) => prev ?? { ...NEUTRAL, error: "Version check failed" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cache) {
      loadVersionCheck().then(setData).catch(() => {});
    }
  }, []);

  return { data, loading, refresh };
}

export function useUpdateLockdown() {
  const { data, loading, refresh } = useVersionCheck();
  const severity: UpdateSeverity = data?.severity ?? "none";
  const locked = severity === "security" || severity === "critical";
  const outdated = Boolean(data?.outdated);
  return { data, loading, refresh, locked, outdated, severity };
}
