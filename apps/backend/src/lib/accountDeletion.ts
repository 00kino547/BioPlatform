// Shared "delete this account completely" routine.
//
// Before this existed the admin delete-user route in routes/admin.ts carried the
// whole teardown (webhook notices, auth-ban/auth-log/invite-code cleanup, the
// user row itself, plus parallel best-effort removal of that user's uploads).
// The disabled-account purge job (see lib/dmca.ts) needs the exact same teardown
// after the 30-day appeal window closes, and duplicating ~40 lines of cascade in
// two places is how these drift apart. Extracting it here keeps both callers on
// one behaviour and makes the purge side-effect-free to unit test.

import path from "path";
import { prisma } from "./prisma.js";
import { deleteUpload } from "./mediaStore.js";
import { dispatchWebhookEvent, dispatchWebhookEventAsync } from "./webhook.js";

export interface DeleteAccountContext {
  /**
   * Set by the admin route so the UI can keep its self-deletion guard without
   * trusting each caller to apply it consistently. The purge job passes nothing.
   */
  callerUserId?: string;
}

/** The caller attempted to delete their own account. */
export class SelfDeletionError extends Error {
  constructor() {
    super("You cannot delete your own account");
    this.name = "SelfDeletionError";
  }
}

/**
 * Permanently remove an account: its user row, auth bans/logs and invite codes
 * in one transaction, then best-effort deletion of its stored uploads (avatar,
 * banner, music tracks). Mirrors the previous admin delete-user route 1:1 so a
 * purge behaves exactly like a hand delete.
 *
 * Not covered (matching the historical admin route): product/shop files and
 * seasonal-theme uploads are left to their own cleanup so a purge never touches
 * content beyond the account.
 */
export async function deleteUserCompletely(userId: string, ctx: DeleteAccountContext = {}): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      profiles: {
        select: {
          avatar: true,
          banner: true,
          musicTracks: { select: { filePath: true } },
        },
      },
    },
  });
  if (!user) return;

  if (ctx.callerUserId && ctx.callerUserId === user.id) {
    throw new SelfDeletionError();
  }

  // Fire-and-forget webhook BEFORE the row disappears (the async variant
  // snapshots the payload immediately, so the delete cannot lose it).
  await dispatchWebhookEventAsync(user.id, "user.deleted", {
    username: user.username,
    deletedAt: new Date().toISOString(),
  });

  // The transaction order matters for the DMCA tables: a user can be referenced
  // by fingerprint rows (media_files), reports they filed or reviewed, and hash
  // bans they issued or lifted. The constraints carry ON DELETE ... SET NULL /
  // CASCADE in the pushed schema AND the doc migration, but the DB may be an
  // older push — so detach everything explicitly instead of trusting referential
  // actions. Report/hash rows are legal records and must survive the account.
  await prisma.$transaction([
    prisma.authBan.deleteMany({ where: { kind: "ACCOUNT", value: user.id } }),
    prisma.authLog.deleteMany({ where: { OR: [{ accountId: user.id }, { username: user.username }] } }),
    prisma.inviteCode.deleteMany({ where: { createdById: user.id } }),
    prisma.mediaFile.deleteMany({ where: { userId: user.id } }),
    prisma.dmcaReport.updateMany({ where: { filedByUserId: user.id }, data: { filedByUserId: null } }),
    prisma.dmcaReport.updateMany({ where: { handledById: user.id }, data: { handledById: null } }),
    prisma.bannedHash.updateMany({ where: { bannedById: user.id }, data: { bannedById: null } }),
    prisma.bannedHash.updateMany({ where: { unbannedById: user.id }, data: { unbannedById: null } }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);

  for (const profile of user.profiles) {
    for (const filePath of [profile.avatar, profile.banner]) {
      if (filePath) {
        void deleteUpload(path.basename(filePath)).catch(() => undefined);
      }
    }
    for (const track of profile.musicTracks) {
      if (track.filePath) {
        void deleteUpload(path.basename(track.filePath)).catch(() => undefined);
      }
    }
  }

  dispatchWebhookEvent(user.id, "user.deleted", {
    username: user.username,
    deletedAt: new Date().toISOString(),
  });
}