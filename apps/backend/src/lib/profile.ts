import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export function profileScope(userId: string, profileId?: unknown): Prisma.ProfileWhereInput {
  if (typeof profileId === "string" && profileId.length > 0) {
    return { id: profileId, userId };
  }
  return { userId, isPrimary: true };
}

export function getPrimaryProfile(userId: string) {
  return prisma.profile.findFirst({ where: { userId, isPrimary: true } });
}

export async function resolveProfileId(identifier: string): Promise<string | null> {
  const profile = await prisma.profile.findFirst({
    where: { OR: [{ slug: identifier }, { aliases: { some: { slug: identifier } } }] },
    select: { id: true },
  });
  return profile?.id ?? null;
}

export async function resolvePublicProfile<T extends Prisma.ProfileSelect>(
  identifier: string,
  select: T
): Promise<Prisma.ProfileGetPayload<{ select: T }> | null> {
  const bySlug = await prisma.profile.findUnique({ where: { slug: identifier }, select });
  if (bySlug) return bySlug;
  const viaAlias = await prisma.profileAlias.findUnique({
    where: { slug: identifier },
    select: { profile: { select } },
  });
  return viaAlias?.profile ?? null;
}

export async function upsertPrimaryProfile(
  userId: string,
  data: Omit<Prisma.ProfileUncheckedUpdateInput, "userId" | "slug" | "isPrimary">
) {
  const existing = await getPrimaryProfile(userId);
  if (existing) {
    return prisma.profile.update({ where: { id: existing.id }, data });
  }
  const first = await prisma.profile.findFirst({ where: { userId } });
  if (first) {
    return prisma.profile.update({ where: { id: first.id }, data: { ...data, isPrimary: true } });
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  const createData: Prisma.ProfileUncheckedCreateInput = {
    ...(data as Prisma.ProfileUncheckedCreateInput),
    userId,
    slug: user?.username ?? `user_${userId}`,
    isPrimary: true,
  };
  return prisma.profile.create({ data: createData });
}
