export function orderBadges<T extends { id: string }>(
  badges: T[],
  savedOrder: string[] | null | undefined
): T[] {
  if (!savedOrder || savedOrder.length === 0) return badges;

  const byId = new Map(badges.map((b) => [b.id, b]));
  const present = new Set(badges.map((b) => b.id));

  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const id of savedOrder) {
    if (seen.has(id) || !present.has(id)) continue;
    seen.add(id);
    const badge = byId.get(id);
    if (badge) ordered.push(badge);
  }

  for (const badge of badges) {
    if (!seen.has(badge.id)) ordered.push(badge);
  }
  return ordered;
}
