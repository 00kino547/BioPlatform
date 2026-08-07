# Admin Guide

Operations guide for administrators: invite codes, user management, roles &amp; permissions, badges, bans &amp; lockouts, unlocking user accounts, and the auth log.

## Overview

Sign in as an admin and open **Admin Dashboard**. It has up to six tabs:

- **Invite Codes** — create and revoke registration codes.
- **Users** — list accounts, edit profiles, assign roles, change tiers and track limits, reset passwords.
- **Roles** — define roles with per-permission toggles.
- **Badges** — manage the badge catalog (label, color, icon).
- **Bans** — every active fingerprint/account ban with its status.
- **Logs** — the auth log (failed attempts, reasons, penalties).

The tabs you see depend on your own role's permissions: a role with only `invites.manage` sees just **Invite Codes**, while the built-in Admin role sees everything.

## Invite Codes

Registration is invite-only. In the **Invite Codes** tab:

1. Set the **Count** (1–50) and an optional **Expires in days**.
2. Click **Generate** — codes appear at the top of the table.
3. Share codes with the people you want to invite. A used code shows **Used**; you can **Revoke** an unused one at any time.

## Managing Users

The **Users** tab lists every account. Click **Edit Profile** to:

- Change display name, bio, location, website, and public/private visibility.
- Assign the user's **role** (from the roles defined in the **Roles** tab).
- Set the user's **tier** (Free / Pro / Enterprise) and custom **track limit** (overrides the tier default for the music player).
- Set custom **profile limit** and **alias limit** (overrides the tier defaults for multi-profile pages and aliases).
- Toggle **badges** from the badge catalog — these are the badges the user can show on their profiles.
- Reset a user's password (backend `POST /api/admin/users/:id/reset-password`).

## Roles &amp; Permissions

The **Roles** tab manages access. Every user has exactly one role; every role carries a set of permissions:

- `users.view` — see the Users tab.
- `users.manage` — edit users (role, tier, limits, badges, profile).
- `profiles.manage` — manage profiles.
- `invites.manage` — create and revoke invite codes.
- `bans.manage` — manage bans &amp; lockouts.
- `roles.manage` — create/edit/delete roles.
- `badges.manage` — create/edit/delete badges.
- `logs.view` — view the auth log.

Two system roles always exist:

- **Admin** — full access. Its permissions are locked (always everything); you can rename it but not remove its permissions.
- **User** — the default role for new registrations. Its name, description, and permissions are editable.

To create a role, enter a name/description, tick the permissions, and click **Create Role**. You can later **Edit** it (the slug is derived from the name) or **Delete** it — a custom role can only be deleted once no user has it. Reserved names (`admin` / `user`) cannot be reused for custom roles. New custom roles are only as powerful as the permissions you grant them.

## Badges

The **Badges** tab manages the badge catalog. Each badge has:

- **Label** — what's shown on the profile (e.g. "Gold Member").
- **Slug** — a unique key (optional; defaults to the label).
- **Color** — a hex color (`#22c55e`) used for the pill and icon.
- **Icon** — a lucide icon name (e.g. `Crown`, `Award`, `Code`).

Click **Create Badge** to add one; a live preview shows how it renders. System badges (developer, owner, staff, moderator, verified, premium, enterprise) cannot be deleted or have their slug changed; custom badges can be edited or deleted freely (deleting removes them from every profile and user).

Badges are assigned to users in **Users → Edit Profile**. Once a user has a badge, they can toggle it on each profile in their dashboard, and it renders as a colored icon on the public page. The catalog is public at `GET /api/badges`.

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
