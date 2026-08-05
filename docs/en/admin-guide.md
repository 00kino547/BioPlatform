# Admin Guide

Operations guide for administrators: invite codes, user management, bans &amp; lockouts, unlocking user accounts, and the auth log.

## Overview

Sign in as an admin and open **Admin Dashboard**. It has four tabs:

- **Invite Codes** — create and revoke registration codes.
- **Users** — list accounts, edit profiles, change tiers and track limits, reset passwords.
- **Bans** — every active fingerprint/account ban with its status.
- **Logs** — the auth log (failed attempts, reasons, penalties).

## Invite Codes

Registration is invite-only. In the **Invite Codes** tab:

1. Set the **Count** (1–50) and an optional **Expires in days**.
2. Click **Generate** — codes appear at the top of the table.
3. Share codes with the people you want to invite. A used code shows **Used**; you can **Revoke** an unused one at any time.

## Managing Users

The **Users** tab lists every account. Click **Edit Profile** to:

- Change display name, bio, location, website, and public/private visibility.
- Set the user's **tier** (Free / Pro / Enterprise) and a custom **track limit** (overrides the tier default for the music player).
- Reset a user's password (backend `POST /api/admin/users/:id/reset-password`).

## How Bans &amp; Lockouts Work

The auth system locks after repeated failed login attempts. Two kinds of bans exist:

- **Fingerprint bans** — on an attacker's IP, browser cookie, and user-agent. A request is blocked only when **2 of 3** fingerprint parts are locked.
- **Account bans** — applied to the targeted account after repeated failures.

In the **Bans** tab each row shows its type, value, failure count, and status (Permanent / Locked until / Clear). You can delete a single record with **Unban**.

## Unlocking a User Account

A locked account has an **ACCOUNT** ban row (value = the username). To restore access:

1. Open **Admin Dashboard → Bans**.
2. Find the **ACCOUNT** row for the user and click **Unlock**.

The unlock removes the account ban **and** the IP/cookie bans recorded against that account during the failed attempts, and clears its failed auth-log entries. This matters because deleting only the account row can still leave a fingerprint blocked (2-of-3 rule).

You can also unlock directly from the **Logs** tab: any entry that shows a lock (Permanent or +N min) has an **Unlock** button.

To remove a single fingerprint record without unlocking the whole account, use the row-level **Unban**.

## Auth Log

The **Logs** tab is the audit trail for auth. Each entry records the time, user, reason, IP, penalty (permanent or `+N min`), and what triggered it. Entries are pruned automatically once their lock expires or after the retention period (`AUTH_LOG_RETENTION_DAYS`).

## Lock Policies

The instance-wide lock behavior is set by `AUTH_LOCK_POLICY` (see [Configuration](./configuration.md#security)):

- `block` — locked accounts reject all sign-ins until an admin unlocks them.
- `trusted_ip` (default) — the account's registered/last-login IP can still sign in without unlocking.
- `email` — locked users must click the unlock link sent by email (requires SMTP); admins can still unlock manually.

---

← [User Guide](./user-guide.md) · [Deployment](./deployment.md) →
