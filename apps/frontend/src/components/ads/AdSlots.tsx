// Instance ad slots rendered under the profile's links, above the footer line.
// Mounting is fully client-side (ad scripts can't run during SSR); the config
// comes from the same GET /api/config payload as the rest of the instance.

import { useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { InstanceAds } from "@/lib/api";
import { mountAdSlot } from "./adEmbeds";

interface AdSlotsProps {
  ads?: InstanceAds | null;
  profileId: string;
}

export function AdSlots({ ads, profileId }: AdSlotsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = Boolean(ads?.enabled && ads.slots.length > 0);

  // Mount each configured slot once per container. In dev StrictMode the effect
  // runs twice; the container dataset guard makes the second pass a no-op.
  useEffect(() => {
    if (!enabled) return;
    const container = ref.current;
    if (!container || container.dataset.bpAdsMounted) return;
    container.dataset.bpAdsMounted = "1";

    for (const slot of ads!.slots) {
      const box = document.createElement("div");
      box.dataset.bpAdSlot = slot.placement;
      container.appendChild(box);
      mountAdSlot(box, slot);
    }
  }, [enabled, ads]);

  if (!enabled) return null;

  // Count real user clicks inside any slot as ad:network clicks, reusing the
  // existing analytics pipeline (visitor-hash dedupe, DNT/GPC-gated). Pop-under
  // loaders never produce a user-initiated click, so only events inside a slot
  // register — exactly like a link click.
  const handleClickListener = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const box = target?.closest?.("[data-bp-ad-network]") as HTMLElement | null;
    const network = box?.dataset.bpAdNetwork;
    if (!network) return;
    import("@/lib/api").then(({ api }) => {
      api.trackClick(profileId, `ad:${network}`, `ad:${network}`).catch(() => {});
    });
  };

  return (
    <div
      ref={ref}
      data-bp-ads
      className="mt-6 flex w-full flex-col items-stretch gap-3"
      onClick={handleClickListener}
    />
  );
}