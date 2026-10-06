-- Invite notes: allow admins and invite owners to attach a short note to each code.
ALTER TABLE "invite_codes" ADD COLUMN "note" TEXT;