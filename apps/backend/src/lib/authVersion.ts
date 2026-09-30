import { prisma } from "./prisma.js";

/**
 * A4 — session invalidation. Bump this counter whenever a user's credentials
 * change (password change, admin password reset). Every JWT issued up to that
 * point embeds the previous counter value, so `requireAuth` will reject them.
 */
export async function bumpAuthVersion(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId },
    data: { authVersion: { increment: 1 } },
  });
}