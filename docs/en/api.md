# API Reference

BioPlatform exposes a REST API under `/api`. The machine-readable OpenAPI 3.0 specification is served at `/api/openapi.json`, and a rendered reference lives in-app at `/api-docs`.

## Conventions

- **Base URL:** `/api` (relative to the instance origin).
- **Authentication:** most endpoints require `Authorization: Bearer <token>`. Tokens are returned by `POST /api/auth/login` and `POST /api/auth/register`, and expire after `JWT_EXPIRES_IN`.
- **Errors:** every error returns HTTP 4xx/5xx with `{ "success": false, "error": "human readable message" }`.
- **Success:** most responses return `{ "success": true, "data": ... }`.
- **Content-Type:** JSON (`application/json`), except file uploads (multipart) and downloads.

## Access levels

API access is tier-based. Every account has an effective **api level** — `basic`, `advanced`, or `enterprise` — returned as `apiLevel` by `GET /api/auth/me`.

| Level | Default tier | Endpoints |
| --- | --- | --- |
| `basic` | FREE | Profile CRUD, social links, theme, avatar/banner, music, email settings, badges, auth |
| `advanced` | PRO (Premium) | Analytics, Discord integration, data export/import |
| `enterprise` | ENTERPRISE | Webhooks (outbound delivery to your endpoint) |

An **admin can override the tier default** by granting the `api.basic`, `api.advanced`, or `api.enterprise` permission to any role (Dashboard → Admin → Roles). A FREE account with a role carrying `api.advanced` gets advanced access; admins always have the enterprise level. Endpoints the caller lacks return `403` with `{ error: "This endpoint requires the <level> API tier", data: { required, apiLevel } }`.

## Health

### `GET /api/health`

Public. Returns `{ "status": "ok", "timestamp": "..." }`.

## Auth

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account. Body: `username`, `email`, `password` (min 12 chars), optional `inviteCode`. Returns `token` + `user`. |
| `POST` | `/api/auth/login/start` | Discover login methods for an identifier. Always returns `{ found: true }` to prevent account enumeration. |
| `POST` | `/api/auth/login` | Log in with `identifier` (username or email) + `password`. Returns `token` + `user`, or `requiresTwoFactor` when 2FA is enabled. |
| `POST` | `/api/auth/login/passkey/options` | WebAuthn assertion options for passwordless login (`identifier`). |
| `POST` | `/api/auth/login/passkey/verify` | Verify the assertion and log in. |
| `POST` | `/api/auth/2fa/totp` | Complete login with a TOTP code (`token` + `code`). |
| `POST` | `/api/auth/2fa/passkey/options` | WebAuthn assertion options for second factor. |
| `POST` | `/api/auth/2fa/passkey/verify` | Verify the second-factor assertion. |
| `POST` | `/api/auth/passkeys/options` | WebAuthn creation options to register a passkey (`residentKey`). |
| `POST` | `/api/auth/passkeys/register` | Register a new passkey. |
| `GET` | `/api/auth/passkeys` | List your passkeys. |
| `DELETE` | `/api/auth/passkeys/:id` | Delete a passkey. |
| `POST` | `/api/auth/totp/setup` | Start TOTP enrollment. Returns `secret` + `otpauthUrl`. |
| `POST` | `/api/auth/totp/enable` | Enable TOTP with a verification `code`. |
| `POST` | `/api/auth/totp/disable` | Disable TOTP. |
| `GET` | `/api/auth/me` | Get the current user. |
| `POST` | `/api/auth/change-password` | Change your password (`currentPassword`, `newPassword` min 12 chars). |
| `POST` | `/api/auth/unlock` | Request an unlock email for an identifier. |
| `POST` | `/api/auth/unlock/verify` | Verify an unlock `token`. |

## Profiles

Every account has one or more **profiles**, each with its own slug, theme, links, and music. The **primary** profile is the account's default. Additional profiles and **aliases** (extra short URLs pointing at a profile) are limited by your tier (`profileLimit` / `aliasLimit`) or the admin's per-user override.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/profiles/me` | List your profiles with `limits`, `primaryId`, and `aliasCount`. |
| `POST` | `/api/profiles/me` | Create a profile. Body: `slug` (lowercase) plus the usual profile fields. Returns the created profile. |
| `PUT` | `/api/profiles/me` | Update your **primary** profile (backward-compatible). |
| `GET` | `/api/profiles/me/:profileId` | Get one of your profiles. |
| `PATCH` | `/api/profiles/me/:profileId` | Update a profile (`slug`, `displayName`, `bio`, `location`, `website`, `socialLinks`, `theme`, `isPublic`). Changing the slug of the primary profile is rejected. |
| `DELETE` | `/api/profiles/me/:profileId` | Delete a profile. If you delete the primary profile, primary status moves to your oldest remaining profile; the last profile cannot be deleted. |
| `POST` | `/api/profiles/me/:profileId/primary` | Set a profile as the primary. |
| `GET` | `/api/profiles/me/:profileId/aliases` | List the profile's aliases. |
| `POST` | `/api/profiles/me/:profileId/aliases` | Add an alias (body: `slug`). |
| `DELETE` | `/api/profiles/me/:profileId/aliases/:aliasId` | Delete an alias. |
| `POST` | `/api/profiles/me/:profileId/badges` | Toggle a badge on a profile (body: `badge` — a badge id — + `enabled`). Badges come from the user's badge set assigned by admins. |
| `POST` | `/api/profiles/me/avatar` | Upload an avatar (multipart, 5 MB max, JPEG/PNG/GIF/WebP). Optional `?profileId=` scopes to a profile. |
| `DELETE` | `/api/profiles/me/avatar` | Remove your avatar. Optional `?profileId=`. |
| `POST` | `/api/profiles/me/banner` | Upload a banner (multipart, same limits). Optional `?profileId=`. |
| `DELETE` | `/api/profiles/me/banner` | Remove your banner. Optional `?profileId=`. |
| `GET` | `/api/profiles/me/export?format=xlsx\|ods` | Download your profile as a spreadsheet. Optional `?profileId=`. |
| `POST` | `/api/profiles/me/import` | Import your profile from a spreadsheet (multipart `file`). Optional `?profileId=`. |
| `GET` | `/api/profiles/:identifier` | Get a public profile by its **slug or alias**. Response includes `requestedSlug` (what you asked for) and the canonical `slug`, plus `badges`. No email or PII. Includes a `discord` presence object only when the owner connected Discord and opted in to sharing presence. |
| `GET` | `/api/profiles/:identifier/presence` | Lightweight live presence snapshot (no profile fields): `status`, `statusLabel`, `activities`, `line`, `customStatus`, `updatedAt`. Returns `data: null` when the owner has no Discord connection or opted out of sharing presence. Same visibility rules as `:identifier`. |
| `GET` | `/api/profiles/:identifier/og.png` | Server-rendered 1200×630 PNG card (banner backdrop, avatar, display name + `@username`, bio, **all** badges, social tiles, link/track counts) used as the OpenGraph image for shared profile links. Contains only stable profile data — live presence is intentionally **not** baked in, since Discord caches embed images for a long time. Cached in memory (~5 min, keyed by profile content) and sent with an `ETag` + `Cache-Control: public, max-age=300`. The `og:image` URL carries a content version (`?v=…`) so crawlers refetch when the profile changes. |
| `POST` | `/api/profiles/click` | Record a social-link click (public; `profileId` + `platform`). |

> Endpoints that manage music, email settings, analytics, and Discord settings accept an optional `?profileId=` query parameter to scope to a specific profile. When omitted, they operate on the account's primary profile.

### Export / import

- **Export** produces a single-sheet spreadsheet with two columns: `Field` and `Value` (`.xlsx` by default, `.ods` with `?format=ods`). Rows use `displayName`, `bio`, `location`, `website`, `isPublic`, `social.<platform>`, and `theme.<field>` keys. The file contains no macros.
- **Import** accepts `.xlsx`, `.ods`, and `.csv` (5 MB max). Macro-enabled formats (`.xlsm`, `.xls`) are rejected. Values that look like formulas (starting with `=`, `+`, `@`, tab/CR) are skipped. Unknown or duplicate rows are reported as `warnings` instead of failing the whole import. The response is `{ success, data: { applied: string[], warnings: string[] } }`. Importing replaces your current profile fields.

## Badges

Badges are a catalog managed by admins. Each badge has a `slug`, `label`, `color`, and `icon`. Profile badges reference catalog entries by id.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/badges` | Public badge catalog. Returns all badges (`id`, `slug`, `label`, `color`, `icon`). |

Public profiles return `badges` as an array of badge ids; clients resolve them against this catalog to render the colored icons.

## Analytics

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/analytics/me` | Views and clicks aggregates (total, 30d, 7d, 24h, per-day, per-platform, top referrers). |

## Email

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/email/settings` | Your notification settings and whether SMTP is configured. |
| `PUT` | `/api/email/settings` | Update `notifyOnView` / `notifyOnClick`. |
| `POST` | `/api/email/test` | Send a test email. |

## Music

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/music/me` | List your tracks and your tier limit. |
| `POST` | `/api/music/me` | Add a track (`provider` local/spotify/youtube, optional title/artist/url). |
| `POST` | `/api/music/me/upload` | Upload an audio file (multipart). |
| `PATCH` | `/api/music/:id` | Update a track (`title`, `artist`, `position`, `fullUrl`). |
| `POST` | `/api/music/reorder` | Reorder tracks (`ids`). |
| `DELETE` | `/api/music/:id` | Delete a track. |

## Webhooks

Webhooks deliver JSON events to your own endpoint so you can react to activity on your profile. Max 10 webhooks per account.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/webhooks` | List your webhooks with their most recent delivery. |
| `POST` | `/api/webhooks` | Create a webhook (`name`, `url`, `events`, `active`, `template`). Returns the signing `secret` **exactly once**. |
| `PATCH` | `/api/webhooks/:id` | Update name, url, events, `active` (pause/resume), or `template`. |
| `POST` | `/api/webhooks/:id/rotate-secret` | Generate a new signing secret (returned once). |
| `POST` | `/api/webhooks/:id/test` | Send a `webhook.test` delivery. Rate-limited to 5/minute/user. |
| `GET` | `/api/webhooks/:id/deliveries?limit=` | Recent deliveries (default 20, max 50). |
| `DELETE` | `/api/webhooks/:id` | Delete the webhook and its delivery history. |

### Events

| Event | Fires when |
| --- | --- |
| `profile.viewed` | Someone views your public profile. |
| `link.clicked` | Someone clicks one of your social links. |
| `profile.updated` | You update your profile. |
| `profile.created` | You create a new profile. |
| `profile.deleted` | You delete a profile. |
| `user.registered` | A new account is registered. |
| `user.updated` | Your account changes (e.g. password) or an admin edits it. |
| `webhook.test` | You trigger a test delivery. |

### Delivery payload

Every delivery is a `POST` with the shape:

```json
{
  "id": "delivery-uuid",
  "event": "profile.viewed",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "data": { }
}
```

The `data` object is minimal and contains **no** personal information (no email, no IP). Webhooks and deliveries are scoped to per-user events only.

### Discord webhooks

A Discord webhook URL (channel → Integrations → Webhooks) works as a destination. Because Discord's API only accepts message-shaped bodies, deliveries to `discord.com`/`discordapp.com` (including `ptb.`/`canary.` subdomains) are sent as a formatted **embed** instead of raw JSON: a `BioPlatform · <event>` title, the event timestamp, and one field per top-level entry in `data`. A custom template that already produces a Discord message (`content`, `embeds`, `username`, `avatar_url`, `components`, `attachments`, or `poll`) passes through untouched; any other template payload is rendered as pretty-printed JSON in the embed's description. Embed text is truncated to Discord's per-field limits; the signature always covers the body actually sent.

### Custom payload templates

When creating or updating a webhook you can set `template` to a custom JSON document sent instead of the default payload. Leave it empty (or `null`) to receive the default payload above.

Placeholders are replaced at delivery time:

- `{{id}}` — delivery UUID
- `{{event}}` — event name
- `{{timestamp}}` — ISO timestamp
- `{{data}}` — the full default `data` object
- `{{data.<field>}}` — a field nested in `data` (dot path, e.g. `{{data.slug}}`)

Example: sending `{"event":"{{event}}","profile":"{{data.slug}}","at":"{{timestamp}}"}` for a `profile.viewed` delivery produces `{"event":"profile.viewed","profile":"myhandle","at":"2026-01-01T00:00:00.000Z"}`. Unknown or missing fields render as `null`.

The template must be valid JSON after replacing placeholders (max 2000 chars). The signature still covers the rendered body, so verify it as usual.

### Signature verification

Each request includes these headers:

- `X-BioPlatform-Id` — delivery UUID
- `X-BioPlatform-Event` — event name
- `X-BioPlatform-Timestamp` — ISO timestamp
- `X-BioPlatform-Signature` — `sha256=<hex>` HMAC-SHA256 of the **raw request body** using your signing secret

Verify in your endpoint like this:

```js
const crypto = require("crypto");
const rawBody = await readRawBody(req); // do not use a parsed body
const sig = crypto.createHmac("sha256", process.env.WEBHOOK_SECRET)
  .update(rawBody).digest("hex");
const expected = `sha256=${sig}`;
if (req.headers["x-bi-platform-signature"] !== expected) {
  return res.status(401).end();
}
```

Also confirm `X-BioPlatform-Timestamp` is recent (e.g. within 5 minutes) to prevent replay attacks.

### Retries

Deliveries are attempted synchronously and, on failure, retried with backoff of 0s, 60s, 5m, 15m, 60m — up to 5 attempts total. Every attempt is recorded in the delivery log (`GET /api/webhooks/:id/deliveries`) with its HTTP status code or error. After the final attempt the delivery is marked `failed`.

### Best practices

- Respond **quickly** with a 2xx (before your timeout of 10s); do the real work in a background task.
- Return a non-2xx to trigger a retry.
- Reject requests with an invalid signature before doing anything.
- Set up an HTTPS endpoint; only `http(s)` URLs are accepted.

## Discord

OAuth2 account link plus a shared bot for live presence (bot must share a guild with the user). All endpoints are user-authenticated. The whole integration is **disabled** (returns `configured: false`, `/connect` returns 400) when `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_REDIRECT_URI` are not set — see [Environment Variables](./environment-variables.md).

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/discord` | Integration status: `configured`, `connected`, `botConfigured`, `botInviteUrl`, `presenceHubInvite`, `sessionActive`, the connected account (`username`, `globalName`, `avatar`), settings (`showDiscordPresence`, `showDiscordActivity`), `webhookConfigured`, and a cached presence snapshot. |
| `GET` | `/api/discord/connect` | Returns `{ url }` — the Discord OAuth2 authorize URL (scope `identify`, `prompt=consent`). Requires the integration to be configured. |
| `GET` | `/api/discord/callback` | OAuth2 callback (visited in the browser). Exchanges the code, upserts the `DiscordConnection`, redirects to `/dashboard?tab=discord&discord=connected|error`. |
| `POST` | `/api/discord/disconnect` | Disconnect Discord: deletes the connection, turns off presence sharing. |
| `PUT` | `/api/discord/settings` | Update `showDiscordPresence` (share presence on the public profile), `showDiscordActivity` (include activity details), or `webhookUrl` (empty string clears it). If the webhook URL changes while a "Post to Discord" message exists, the old message is deleted from the previous webhook. |
| `POST` | `/api/discord/post` | Post (or update) the profile embed to the saved webhook (or a `url` passed in the body). The embed shows your rendered profile card image (banner, avatar, name, bio, badges) with a short title — no presence text, so it can't go stale in Discord's image cache. Returns `{ messageId, mode }` where `mode` is `"created"` (new message) or `"updated"` (edited in place). Posting again — or editing your profile while a posted message exists — edits the same message instead of spamming new ones; switching webhooks deletes the old message and creates a fresh one. |

Presence shown on the public profile is always gated by `showDiscordPresence`, and activity details by `showDiscordActivity` — a user who never opts in is never tracked or exposed. The OG card and the "Post to Discord" embed never include presence (Discord caches those images), so they're built purely from stable profile data.

The "Post to Discord" embed keeps a single message in sync: the posted message id and the webhook URL it was sent to are stored (webhook encrypted), so subsequent posts and profile edits `PATCH` that message in place. If the stored webhook changes, the old message is deleted first. The message id and webhook are cleared if the message can no longer be edited (e.g. the webhook was deleted). Because Discord caches embed images aggressively, the card and embed show only stable profile data (no live status/song) and the image URL is content-versioned, so it refreshes when the profile actually changes.

## Invites & Admin

**Registration invites.** `POST /api/invites` creates invite codes. Admins with `invites.manage` generate up to 50 per call with an optional `expiresInDays`. Other users generate within their **role quota** (needs the `invites.generate` permission plus the role's batch limit > 0) or their **event allowance**, subject to the global `userGenerationEnabled` switch (admin panel), a per-role **cooldown**, and **expiry bounds**: the role's min/max expiry days, with the max additionally capped by the allowance's expiry date when generating from an allowance. Body: `count` (1–50, default 1) and optional `expiresInDays`. Returns the created codes plus a `meta` object with the user's `allowance`, `allowanceExpiresAt`, `outstanding`, `cooldownRemainingSeconds`, and their role's invite config.

**Allowance & refunds.** Invite events grant an allowance (see below). Codes created from an allowance are tagged `fromAllowance: true`. A code that expires **unused before** the allowance itself expires is refunded automatically (its credit returns to the user's allowance on their next `GET /api/invites` or generate call); codes that die exactly at the allowance expiry are not refunded.

`GET /api/invites` lists the caller's codes **and** the same `meta` object (allowance, role config, cooldown remaining, whether generation is currently possible). `DELETE /api/invites/:id` revokes an unused code you created; admins with `invites.manage` can revoke any unused code.

**Admin endpoints** under `/api/admin/*` manage users, tiers, password resets, profiles, auth bans, manual unlocks, auth logs, **roles**, **badges**, and **invites**:

- `GET /api/admin/invites` — every invite code across all creators, with the creator and — when used — the account that redeemed it.
- `GET /api/admin/invite-settings` / `PUT /api/admin/invite-settings` — read or set `{ userGenerationEnabled }`, the master switch for non-admin invite generation (admin panel only, no environment variable).
- `GET /api/admin/invite-events` — audit list of past invite events.
- `POST /api/admin/invite-events` — run an invite event: `{ count, expiryDays }` grants every non-invite-banned user `count` allowance credits expiring after `expiryDays` days (returns `{ grantedUsers, event, allowanceExpiresAt }`).
- `PATCH /api/admin/users/:id` accepts `inviteBanned` — banning zeroes the allowance, revokes the user's outstanding codes, and excludes them from future events.
- `DELETE /api/admin/users/:id` — full GDPR erasure (account, profiles, uploads, webhooks, passkeys, invite codes, and the user's auth-log and account-ban references).

Admin access is permission-based (see [Admin Guide](./admin-guide.md) → Roles &amp; Permissions).

## Custom Domains

Custom domains are self-serve with admin approval, gated on the PRO/Enterprise tier **and** the `profiles.customDomain` permission.

**Public.** `GET /api/domain` returns the current host's custom-domain state: `{ active, host, slug, canonical }`. `slug` is the root target (public profile slug served at the root) or `null` for the landing page.

**Owner-only** (profile must belong to the caller):

- `GET /api/profiles/me/:profileId/domain` — the profile's `ProfileDomain` or `null`.
- `POST /api/profiles/me/:profileId/domain` — request a domain with `{ domain }` (a plain hostname: no scheme, path, port, or `www.`; the app host and already-used domains are rejected, one per profile). Creates a `PENDING_VERIFICATION` entry and returns it with the `verificationToken`.
- `POST /api/profiles/me/:profileId/domain/verify` — re-resolves the TXT record. On success the status becomes `VERIFIED` (waiting for an admin).
- `PUT /api/profiles/me/:profileId/domain` — set `{ rootTarget }` to a **public** profile slug (root shows that profile) or `null` (root shows the landing page).
- `DELETE /api/profiles/me/:profileId/domain` — disconnect the domain and free it.

**Admin** (`profiles.manage`):

- `GET /api/admin/custom-domains` — all requests, newest first, with owner (username/email/tier) and profile slug.
- `POST /api/admin/custom-domains/:id/approve` — activates a **VERIFIED** request (→ `ACTIVE`).
- `POST /api/admin/custom-domains/:id/reject` — rejects a request (→ `REJECTED`; the user can then submit a new one).

Status flow: `PENDING_VERIFICATION` → `VERIFIED` (user TXT check passes) → `ACTIVE` (admin approves). `REJECTED` entries are reusable.

## Rate limits

- Public profile views: 60 requests/minute per IP.
- Webhook test deliveries: 5/minute per user.
- Auth endpoints enforce anti-brute-force locking (see [Configuration](./configuration.md) `AUTH_LOCK_POLICY`).

---

← [Environment Variables](./environment-variables.md) · [User Guide](./user-guide.md) →
