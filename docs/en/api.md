# API Reference

BioPlatform exposes a REST API under `/api`. The machine-readable OpenAPI 3.0 specification is served at `/api/openapi.json`, and a rendered reference lives in-app at `/api-docs`.

## Conventions

- **Base URL:** `/api` (relative to the instance origin).
- **Authentication:** most endpoints require `Authorization: Bearer <token>`. Tokens are returned by `POST /api/auth/login` and `POST /api/auth/oauth/exchange`, and expire after `JWT_EXPIRES_IN`. Registration no longer issues a session token — an account must confirm its email first (see `POST /api/auth/verify-email`).
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

## Version

### `GET /api/version`

Public. Software version and update check. Returns the installed version and — when the update check is enabled on the server — the latest released version and a severity derived from the public CHANGELOG of the GitHub repository (`APP_GITHUB_URL`).

| Field | Type | Description |
| --- | --- | --- |
| `enabled` | boolean | Whether the update check is enabled on the server |
| `installed` | string | Installed version of the app |
| `latest` | string \| null | Latest released version from the CHANGELOG (skips `[Unreleased]`) |
| `outdated` | boolean | `true` when the installed version is behind the latest |
| `severity` | `none` \| `update` \| `security` \| `critical` | `security` when any skipped release has security fixes; `critical` when security is combined with a very old install or many skipped releases, when the installed version is older than every documented release, or when the number of skipped releases reaches `UPDATE_CRITICAL_STALE_THRESHOLD` |
| `skippedVersions` | array | Releases newer than the installed version with their changelog sections, for UI rendering |
| `skippedCount` | integer | Number of skipped releases |
| `releaseUrl` / `releasesUrl` / `changelogUrl` | string | Links to the GitHub release/changelog |
| `checkedAt` | string | ISO timestamp of the check |
| `source` | `github-raw` \| `github-api` \| `jsdelivr` \| `cache` \| `none` | Where the CHANGELOG was fetched from |
| `error` | string \| null | Present when the check failed |

Query parameter `?force=1` bypasses the server-side cache (default TTL 12 h) and re-fetches from GitHub. It requires an authenticated **administrator** — public callers always get the cached/background result (this also prevents the endpoint from being used to hammer GitHub). The re-check button is therefore only shown in the admin panel, not on public pages.

**Fail-open:** if the check cannot reach GitHub (private repo, network error, rate limit), the endpoint still returns `200` with `outdated: false`, `severity: "none"`, and an `error` field. The app never locks down on a failed check.

**Update lockdown:** while a `security` or `critical` update is pending, security-sensitive endpoints return `403` with `{ success: false, error, updateRequired: true, severity, latest }`:

- Auth: `POST /auth/passkeys/options`, `POST /auth/passkeys/register`, `DELETE /auth/passkeys/:id`, `POST /auth/totp/setup`, `POST /auth/totp/enable`, `POST /auth/totp/disable`, `POST /auth/change-password`
- Admin: `PATCH /admin/users/:id`, `DELETE /admin/users/:id`, `POST /admin/users/:id/reset-password`, `POST /admin/roles`, `PATCH /admin/roles/:id`, `DELETE /admin/roles/:id`, `POST /admin/badges`, `PATCH /admin/badges/:id`, `DELETE /admin/badges/:id`
- Webhooks: `POST /webhooks`, `PATCH /webhooks/:id`, `POST /webhooks/:id/rotate-secret`, `DELETE /webhooks/:id`

Read-only and non-security endpoints keep working normally during the lockdown.

## Auth

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account. Body: `username` (3–32 lowercase letters, numbers, `_` or `-`, **not** a reserved slug such as `login`, `admin`, `oauth`, `api`, `api-docs`, `dashboard`, `invite`, `privacy`, `terms`, `register`, `unlock`, or `health`), `email` (valid email, max 254 chars), `password` (8–128 chars), `inviteCode` (1–128 chars), and `acceptedPolicies` (must be `true` — a combined acceptance of the current Terms of Service and Privacy Policy; the account stores the accepted policy versions + timestamp). Optional `newsletterOptIn` (boolean) opts the account into platform announcements. Optional `captchaToken` is required when a captcha provider is configured (see [Captcha](#captcha)). Validation and duplicate-account errors include `fieldErrors` keyed by field. The account is created with `emailVerified: false` — a verification email is sent on registration and the response is **`201` with `{ status: "verification_required", emailSent, warning? }`** (no session token; the account **cannot sign in until the mailbox is confirmed** via `/api/auth/verify-email`). `warning` is present only when an invite referral was skipped (abuse policy). |
| `POST` | `/api/auth/login/start` | Discover login methods for an identifier. Always returns `{ found: true }` to prevent account enumeration. |
| `POST` | `/api/auth/login` | Log in with `identifier` (username or email) + `password`. Optional `captchaToken` is required when a captcha provider is configured (see [Captcha](#captcha)). Returns `token` + `user`, or `requiresTwoFactor` when 2FA is enabled. If the account's email was never verified, returns **`403` `{ error, verifyEmailRequired: true }`** (not counted as a failed login). |
| `POST` | `/api/auth/verify-email` | Confirm the mailbox with the link token from the verification email. Body: `token`. Idempotent — an already-verified account gets `{ status: "verified", alreadyVerified: true }`. Tampered, wrong-purpose, or expired links return `400`. |
| `POST` | `/api/auth/verify-email/send` | (Re)send the verification email to an unverified account. Body: `identifier` (username or email). Anti-enumeration: unknown/already-verified identifiers return `{ sent: true }` too. Per-IP throttle 5/hr, 2-min cooldown per account. Returns `503` when email is not configured. |
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
| `GET` | `/api/auth/me` | Get the current user. Returns `newsletterOptIn` (platform announcements opt-in) plus `newsletterSenderWhitelisted`. |
| `POST` | `/api/auth/change-password` | Change your password (`currentPassword`, `newPassword` min 12 chars). |
| `POST` | `/api/auth/unlock` | Request an unlock email for an identifier. |
| `POST` | `/api/auth/unlock/verify` | Verify an unlock `token`. |
| `GET` | `/api/auth/oauth/config` | SSO availability for the login/register forms: enabled `providers` (`google`/`github`/`discord`), `signupRequiresInvite`, and `twoFactorBypassAllowed` (instance flag). |
| `POST` | `/api/auth/oauth/start` | Start SSO (`provider`, `mode` = `login`/`signup`/`link`). Returns the provider's `redirectUrl`; sets a signed, httpOnly state cookie validated on the callback (PKCE S256, verifier inside the token). `mode=link` requires a bearer token and joins the provider to the signed-in account. |
| `GET` | `/api/auth/oauth/callback?code=&state=&error=` | Provider OAuth2 redirect. The `provider` is recovered from the signed state JWT (providers do not send it back in the query string). If the provider returns an error (e.g. `error=access_denied`), the user is redirected with `?error=...`. Otherwise, the state is verified, the code is exchanged for the provider profile, and the user is redirected to the frontend `/oauth/callback` — `?code=<one-time code>` for login/signup or `?result=linked&provider=` for a completed link. |
| `POST` | `/api/auth/oauth/exchange` | Exchange the one-time `code` from the callback. Returns `logged_in` (`token` + `user`), `needs_two_factor` (`twoFactorToken` + `methods` — reused by the existing 2FA screen), or `needs_setup` (`signupToken` + provider info for the completion form). A verified provider email matching an existing account auto-links and logs in. A provider-verified email matching an existing **unverified** account verifies it and logs in; a self-typed email during signup is stored unverified and the signup completes with `{ status: "verification_required", emailSent }` — no session until verified. |
| `POST` | `/api/auth/oauth/signup` | Complete an SSO account setup: `signupToken`, `username` (unique), `email` (when the provider returned none), `inviteCode` (when `SSO_SIGNUP_REQUIRES_INVITE=true`). Returns `201` with `token` + `user`. |
| `GET` | `/api/auth/oauth/accounts` | List your linked OAuth accounts, your `oauthBypass2fa` flag, whether the instance allows SSO 2FA bypass, and `authMethods` (password/oauth/passkeys). |
| `DELETE` | `/api/auth/oauth/accounts/:provider/:providerAccountId` | Unlink an SSO provider. The last sign-in method can never be removed. |
| `PUT` | `/api/auth/oauth/settings` | Set `oauthBypass2fa` (whether SSO login skips your 2FA step). `403` when `SSO_2FA_BYPASS_ALLOWED` is false. |

PocketBase OAuth (first-party token handoff, instance-operator controlled — active when `POCKETBASE_OAUTH_ENABLED=true`):

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/auth/oauth/pocketbase/config` | Public: `{ enabled }` and, when enabled, `clientUrl` (the same-origin proxy, e.g. `/api/pb-speed`), `authCollection` (default `users`), `signupRequiresInvite` and `twoFactorBypassAllowed`. No secrets. |
| `POST` | `/api/auth/oauth/pocketbase/exchange` | Body `{ token, invite? }`. Exchange a PocketBase auth token (obtained by the SPA posting the user's credentials to PocketBase through the `clientUrl` proxy — the password never reaches this backend) for a platform session. Returns the same shapes as `/api/auth/oauth/exchange`: `logged_in` (`token` + `user`), `needs_two_factor` (`twoFactorToken` + `methods`), `needs_setup` (`signupToken` + `provider: "pocketbase"` + fields for the completion form), or `400` for a rejected/invalid PocketBase session. Divergence from social OAuth: a **PocketBase-verified** email auto-links to the matching existing account (PocketBase is operator-controlled; the caller already proved mailbox control there) instead of returning social-OAuth's `409`. A PB-verified email matching an existing **unverified** account verifies it and signs in; provisioning with no invite respects `signupRequiresInvite` (`needs_setup`). |
| `POST` | `/api/auth/oauth/pocketbase/link` | Auth required. Body `{ token }`. Attaches a PocketBase-verified identity to the signed-in account (`{ linked, alreadyLinked }`); `400` when the PB email is unverified, `409` when the identity is already attached to another account. Unlink uses the generic `DELETE /api/auth/oauth/accounts/pocketbase/:providerAccountId`. |

Enterprise SSO (OIDC business single sign-on; config endpoints require the **enterprise** API tier):

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/auth/sso/config` | The ENTERPRISE account holder's OIDC configuration, or `null`. Never returns the client secret — only a masked suffix (`id`, `issuerUrl`, `clientId`, `clientSecretMasked`, `scopes`, `displayName`, `logoUrl`, `allowedDomains`, `enforced`, `enabled`, `identityCount`). |
| `PUT` | `/api/auth/sso/config` | Create or update the OIDC configuration. `issuerUrl` may be the OIDC discovery URL or the bare issuer (the server appends `/.well-known/openid-configuration` when needed). `clientSecret` is required on create; omit it on update to keep the stored (encrypted) value. Fields: `issuerUrl`, `clientId`, `clientSecret?`, `scopes?` (default `openid email profile`), `displayName` (required), `logoUrl?`, `allowedDomains?` (comma separated; empty allows any verified email), `enforced` (blocks password + social login for the owner), `enabled` (default `true`). |
| `DELETE` | `/api/auth/sso/config` | Remove the OIDC configuration and all of its identities. |
| `GET` | `/api/auth/sso/configs` | Public list of enabled providers (`id`, `displayName`, `logoUrl`, `issuerHost`) for the login/register forms. |
| `POST` | `/api/auth/sso/start` | Start an enterprise SSO flow (`configId`, `mode` = `login`/`link`). Runs OIDC discovery and returns the provider's `redirectUrl` (PKCE S256, signed httpOnly state cookie). `mode=link` requires a bearer token and only the provider owner may link. |
| `GET` | `/api/auth/sso/callback?code=&state=&error=` | OIDC provider redirect. Verifies the state cookie, exchanges the code, validates the ID token against the provider JWKS (issuer + audience), falls back to the userinfo endpoint when no ID token is returned, enforces `allowedDomains`, and redirects to the frontend `/sso/callback` — `?code=<one-time code>` for login or `?status=linked` for a completed link. |
| `POST` | `/api/auth/sso/exchange` | Exchange the one-time `code`. Returns `logged_in` (`token` + `user`) or `needs_two_factor` (`twoFactorToken` + `methods`, reused by the existing 2FA screen). First-time sign-in links the OIDC subject to the existing account whose verified email matches; `404` when no account exists yet, `403` when the email is outside `allowedDomains`. |
| `GET` | `/api/auth/sso/identities` | List the account's linked enterprise SSO identities (provider `displayName`, `logoUrl`, `enforced`, `email`). |
| `DELETE` | `/api/auth/sso/identities/:id` | Unlink an enterprise SSO identity. The last sign-in method can never be removed, and `409` when the account's SSO is enforced. |

## Profiles

Every account has one or more **profiles**, each with its own slug, theme, links, and music. The **primary** profile is the account's default. Additional profiles and **aliases** (extra short URLs pointing at a profile) are limited by your tier (`profileLimit` / `aliasLimit`) or the admin's per-user override.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/profiles/me` | List your profiles with `limits`, `primaryId`, and `aliasCount`. |
| `POST` | `/api/profiles/me` | Create a profile. Body: `slug` (lowercase) plus the usual profile fields. Returns the created profile. |
| `PUT` | `/api/profiles/me` | Update your **primary** profile (backward-compatible). |
| `GET` | `/api/profiles/me/:profileId` | Get one of your profiles. |
| `PATCH` | `/api/profiles/me/:profileId` | Update a profile (`slug`, `displayName`, `bio`, `location`, `website`, `socialLinks`, `theme`, `terminalCommands`, `presenceStatus`, `countdown`, `isPublic`). Changing the slug of the primary profile is rejected. `terminalCommands` (an array of `{ command, output, description?, url? }`, max 12) is gated to PRO/Enterprise — FREE accounts get a `403`. `presenceStatus` is `"online"` \| `"idle"` \| `"offline"` (or `null` to hide) and `countdown` is `{ label?, targetDate }` (or `null` to hide). |
| `GET` | `/api/profiles/me/username/availability?username=` | Check whether a `@username` is available to claim. Requires login; rate-limited to 20 checks/min per IP. Returns `{ available, reason }` where `reason` is `reserved`, `taken`, `current`, or `available`. Handles claimed by **private** profiles are reported `available` (the oracle must not reveal that an unlisted account exists) — claiming one still fails with `409` at save time. |
| `PATCH` | `/api/profiles/me/username` | Rename your `@username` (body: `username`). Moves the handle, the primary profile's URL, and the shared slug namespace atomically; the **old slug becomes an automatic alias** so existing links keep working. Rate-limited to 5/min per IP and capped at one rename every **30 days** (`429` during the cooldown). Returns `{ username, slug, lastUsernameChangeAt }`. |
| `DELETE` | `/api/profiles/me/:profileId` | Delete a profile. If you delete the primary profile, primary status moves to your oldest remaining profile; the last profile cannot be deleted. |
| `POST` | `/api/profiles/me/:profileId/primary` | Set a profile as the primary. |
| `GET` | `/api/profiles/me/:profileId/aliases` | List the profile's aliases. |
| `POST` | `/api/profiles/me/:profileId/aliases` | Add an alias (body: `slug`). |
| `DELETE` | `/api/profiles/me/:profileId/aliases/:aliasId` | Delete an alias. |
| `POST` | `/api/profiles/me/:profileId/badges` | Toggle a badge on a profile (body: `badge` — a badge id — + `enabled`). Badges come from the user's badge set assigned by admins. |
| `PUT` | `/api/profiles/me/:profileId/badges/order` | Set the display order of a profile's badges (body: `order` — an array of badge ids on this profile). Only badge ids currently on the profile are accepted; unknown or duplicate ids are rejected (400). Badges not listed keep their previous relative position after the ordered ones. The saved order is used by the public profile, the own-profile endpoints, and the OG card. |
| `POST` | `/api/profiles/me/avatar` | Upload an avatar (multipart, 5 MB max, JPEG/PNG/GIF/WebP). Optional `?profileId=` scopes to a profile. |
| `DELETE` | `/api/profiles/me/avatar` | Remove your avatar. Optional `?profileId=`. |
| `POST` | `/api/profiles/me/banner` | Upload a banner (multipart, same limits). Optional `?profileId=`. |
| `DELETE` | `/api/profiles/me/banner` | Remove your banner. Optional `?profileId=`. |
| `POST` | `/api/profiles/me/background` | Upload a background image (multipart, 12 MB max, JPEG/PNG/GIF/WebP; magic-byte validated). Sets the profile's `theme.backgroundImage` (used only when no seasonal theme is active). Optional `?profileId=`. |
| `DELETE` | `/api/profiles/me/background` | Remove your background image. Optional `?profileId=`. |
| `POST` | `/api/profiles/me/link-icon` | Upload a link favicon image (multipart, 5 MB max, JPEG/PNG/GIF/WebP; magic-byte validated). Returns `{ image }` — a `/uploads/…` path you can set on a `socialLinks` item's `image` field. Requires authentication. |
| `GET` | `/api/profiles/me/export?format=xlsx\|ods` | Download your profile as a spreadsheet. Optional `?profileId=`. |
| `POST` | `/api/profiles/me/import` | Import your profile from a spreadsheet (multipart `file`). Optional `?profileId=`. |
| `GET` | `/api/profiles/:identifier` | Get a public profile by its **slug or alias**. Response includes `requestedSlug` (what you asked for) and the canonical `slug`, plus `badges`, `socialLinks`, `theme`, `terminalCommands`, `presenceStatus`, `countdown`, and `musicTracks`. No email or PII. `presenceStatus` is the owner's static status (`"online"` \| `"idle"` \| `"offline"` or `null`) and `countdown` is `{ label?, targetDate }` or `null`. Includes a `discord` presence object only when the owner connected Discord and opted in to sharing presence. Also includes a `seasonal` object (`theme` + `source`) when an active seasonal/holiday theme is applied to the profile. Served with a content-based `ETag` and `Cache-Control: no-cache` — clients revalidate on every fetch and get a `304` when the profile is unchanged (so edits and live presence are never stale, and public views are still counted). |
| `GET` | `/api/theming/active` | Public. Returns the currently active platform-wide theme (`{ success, data: { theme, source } }`), where `theme` carries the resolved config (colors + optional animated FX `effect`: `none`, `snow`, `pumpkins`, `hearts`, `leaves`, `stars`, `confetti`, `sparkle`, plus optional `layout` and `backgroundImage`) and `source` is `override`, `holiday`, `season`, or `none`. `data.theme` is `null` when no theme is active. Used by profiles and the landing page to stay in sync with the active global theme. |
| `GET` | `/api/profiles/:identifier/presence` | Lightweight live presence snapshot (no profile fields): `status`, `statusLabel`, `activities`, `line`, `customStatus`, `updatedAt`. Returns `data: null` when the owner has no Discord connection or opted out of sharing presence. Same visibility rules as `:identifier`. |
| `GET` | `/api/profiles/:identifier/og.png` | Server-rendered 1200×630 PNG card (banner backdrop, avatar, display name + `@username`, bio, **all** badges, social tiles, link/track counts) used as the OpenGraph image for shared profile links. Contains only stable profile data — live presence is intentionally **not** baked in, since Discord caches embed images for a long time. Cached in memory (~5 min, keyed by profile content) and sent with an `ETag` + `Cache-Control: public, max-age=300`. The `og:image` URL carries a content version (`?v=…`) so crawlers refetch when the profile changes. |
| `POST` | `/api/profiles/click` | Record a social-link click (public; `profileId` + `platform`, optional `slug` — a per-link identifier such as the link label, max 64, used for per-link click analytics). |

> Endpoints that manage music, email settings, analytics, and Discord settings accept an optional `?profileId=` query parameter to scope to a specific profile. When omitted, they operate on the account's primary profile.

#### `socialLinks` items

Each item is `{ platform, url, label?, heading?, icon?, image?, showQr? }`:

- `platform` — an allowlisted platform name (GitHub, X/Twitter, YouTube, Discord, Email, …); anything else is rejected.
- `url` — a valid `http(s)`/`mailto` URL, or a Discord `@username`/`discord.gg` invite; `javascript:` and other schemes are rejected.
- `label` — optional display text (max 64).
- `heading` — optional section heading (max 48, sanitized/trimmed). Links with consecutive equal headings are grouped under a heading on the public profile. Only used when the instance has `LINKS_SECTIONS_ENABLED=true`.
- `icon` — optional emoji (max 24) shown instead of the platform logo. Only rendered when `LINKS_CUSTOM_ICONS_ENABLED=true`.
- `image` — optional local upload path (must start with `/uploads/`, obtained from `POST /api/profiles/me/link-icon`) shown instead of the platform logo. Takes precedence over `icon`.
- `showQr` — optional boolean; when `LINKS_QR_ENABLED=true`, the public profile renders a scannable QR for the link's URL.

Up to 10 links are accepted (unchanged from before).

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
| `GET` | `/api/analytics/me` | Views and clicks aggregates (total, 30d, 7d, 24h, per-day, per-hour, per-platform, **per-link**, top referrers). The per-hour series (`viewsByHour`, `uniqueViewsByHour`, `clicksByHour`, `uniqueClicksByHour`) covers the last 24 hours with ISO-8601 UTC buckets (`YYYY-MM-DDTHH:00:00`). The per-link series (`clicksByLink` with `platform`/`slug`/`count`/`lastClickedAt`, `uniqueClicksByLink` with `uniqueCount`) covers the last 30 days and falls back to the platform name when a click has no slug. Requires the **advanced** API tier. |
| `DELETE` | `/api/analytics/me` | Reset click analytics: with `?slug=` only that per-link slug is deleted; without it, **all** click records for the profile are deleted. Page views are never deleted. Returns `{ deleted, slug }`. Requires the **advanced** API tier. |
| `GET` | `/api/analytics/config` | Public. External/self-hosted analytics configuration: `{ provider: "none" \| "matomo", enabled, matomoUrl, matomoSiteId }`. The tracker must only be loaded client-side after the visitor accepts non-essential cookies and when no Do Not Track / Global Privacy Control signal is present. |

## Email

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/email/settings` | Your notification settings and whether SMTP is configured. |
| `PUT` | `/api/email/settings` | Update `notifyOnView` / `notifyOnClick`. |
| `POST` | `/api/email/test` | Send a test email. |

## Newsletter

Opt-in email newsletters per public profile. Subscribing is a single opt-in: `POST /api/newsletter/subscribe` requires the profile id and email and records agreement to the current Terms and Privacy versions. The IP address and User-Agent are used only as transient consent evidence (in memory, 24 h TTL) — they are never stored in the database. Every newsletter email carries a working one-click unsubscribe link, the sender identity and a postal address (or the site URL as the required CAN-SPAM/CASL fallback).

There are two delivery paths. A profile can configure its **own SMTP deliverer** (`/api/newsletter/sender`); sending through it requires PRO/ENTERPRISE (or an admin allowlist grant), a DNS-verified from-domain and a passed test email, and is capped by `NEWSLETTER_SELF_RECIPIENT_CAP`. Otherwise the **platform sender** (the instance's own mail stack) is used: available unconditionally to `newsletter.manage` admins, and to other users only when the instance owner opts in with `NEWSLETTER_PLATFORM_SMTP_ENABLED=true` **and** the account is allowlisted; such users are limited by the per-tier window and capped by `NEWSLETTER_PLATFORM_RECIPIENT_CAP`.

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/newsletter/subscribe` | Public. Body `{ profileId, email }`. Creates the subscription (or re-activates an unsubscribed one) and returns `{ status: "subscribed" \| "already_subscribed", email }` with HTTP 201. |
| `GET` | `/api/newsletter/unsubscribe?token=...` | One-click unsubscribe. The signed token comes from the `List-Unsubscribe` header / link embedded in every newsletter email. Returns a small HTML confirmation page (or an error page for invalid or expired tokens). |
| `POST` | `/api/newsletter/unsubscribe` | RFC 8058 one-click unsubscribe (what Gmail/Proton's "Unsubscribe" button calls). Reads the token from the query string (as advertised by the `List-Unsubscribe` header) or a JSON body `{ token }`. Returns `{ email, status: "unsubscribed" }`. |
| `POST` | `/api/newsletter/send` | Send a newsletter to all active subscribers of one of your profiles. Body `{ subject, body, profileId? }` (`profileId` required when you own multiple profiles). Subject and body are sanitized on the server. The profile must have `newsletterEnabled`; the own sender must be verified/tested, or the platform sender must be available to the account (see above). Over the tier limit returns `429`. Returns `{ recipientCount, successCount, failedCount }`. |
| `GET` | `/api/newsletter/subscribers?profileId=...` | Your subscriber list with consent metadata (`agreedAt`, `tosVersion`, `privacyVersion`) and counts `{ total, active, unsubscribed }`. |
| `DELETE` | `/api/newsletter/subscribers/:id?profileId=...` | Erase a subscriber record (right to erasure / GDPR). |
| `GET` | `/api/newsletter/sends?profileId=...` | Your send history (latest 50 entries). |
| `GET` | `/api/newsletter/sender?profileId=...` | Your own SMTP deliverer config (no secrets) or `null`, plus `platformEnabled` (the instance's `NEWSLETTER_PLATFORM_SMTP_ENABLED`). |
| `PUT` | `/api/newsletter/sender?profileId=...` | Create/update your own SMTP deliverer. Body `{ fromName, fromEmail, smtpHost, smtpPort?, smtpSecure?, smtpUser?, smtpPassword? }`. Omit `smtpPassword` to keep the stored one. Changing the from-domain or SMTP host resets verification/test status. |
| `DELETE` | `/api/newsletter/sender?profileId=...` | Remove your own SMTP deliverer. |
| `POST` | `/api/newsletter/sender/verify?profileId=...` | Verify DNS ownership of the from-domain via a `_bioplatform-verify.<domain>` TXT record. Returns `{ verified: true }` or a 400 with the expected record name/value. |
| `POST` | `/api/newsletter/sender/test?profileId=...` | Send a test email through your SMTP relay to your account address. Marks the sender as tested on success. |

`newsletterEnabled` (allow sending), `newsletterVisible` (show the subscribe form) and `newsletterHeading` are regular profile fields, managed through the profile create/update endpoints (see [Profiles](#profiles)).

**Admin** (requires `newsletter.manage` permission):

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/admin/newsletter/config` | Effective per-tier send limits: `{ configSource: "env" \| "db", config: { FREE, PRO, ENTERPRISE } }`, each tier `{ sendLimit, windowHours }`. |
| `PUT` | `/api/admin/newsletter/config` | Override the tier config (body matches the `config` shape). Persisted in the database and takes effect immediately. |
| `DELETE` | `/api/admin/newsletter/config` | Remove the override and return to the built-in defaults. |
| `GET` | `/api/admin/newsletter/consent-search?email=...` | Consent audit for a subscriber. Returns `{ email, account, subscriptions, consentEvents }`. **`account`** = the account-level platform-announcements state for that email, if a matching account exists: `{ exists, username, announcementsOptIn, announcementsOptInAt, announcementsUnsubscribedAt, acceptedPoliciesAt }` (absent/`exists:false` if the email has no account). **`subscriptions`** = permanent DB rows, one per profile the email subscribed to: `{ email, profileId, subscribedAt, agreedAt, unsubscribedAt, tosVersion, privacyVersion, status }` — `agreedAt` is the exact moment consent was given, `tosVersion`/`privacyVersion` are the policy versions agreed to at that moment (pinned by the `POLICY_VERSIONS` constants), and `status` (`"subscribed"`/`"unsubscribed"`) with `unsubscribedAt` report the newsletter opt-out. **`consentEvents`** = transient in-memory evidence (IP + User-Agent) captured at subscribe time, ≤ 24 h TTL, never written to the database. Used to prove an opt-in came from a real browser/IP (GDPR/CASL accountability). |
| `GET` | `/api/admin/policy/status` | Current Terms/Privacy state: `{ versions, effectiveDate, deemedAcceptanceCutoff, pendingCount, emailableCount, totalCount, noticePending, lastNotified, note, autoNotifyEnabled, emailConfigured, operatorAutoAccept }`. `operatorAutoAccept` = `{ enabled, roles, windowOpen, cutoff }` — the operator auto-accept rule in force (`POLICY_ADMIN_AUTO_ACCEPT` / `POLICY_ADMIN_AUTO_ACCEPT_ROLES`), where `windowOpen` is `false` while the 30-day review period is still running and those accounts must accept by hand. |
| `GET` | `/api/admin/newsletter/sender-whitelist?q=...` | List accounts with the sender allowlist flag (optionally filtered by username/email). |
| `PUT` | `/api/admin/newsletter/sender-whitelist/:userId` | Body `{ whitelisted }`. Toggle an account's newsletter sender allowlist flag (waives own-deliverer tier/DNS checks; grants platform-sender use when the instance opt-in is on). |
| `POST` | `/api/newsletter/optin` | Authenticated. Body `{ enabled }`. Opt this account in (sets `newsletterOptIn=true` + `newsletterOptInAt`, clears `broadcastUnsubscribedAt`) or out (`newsletterOptIn=false`, records the opt-out in `broadcastUnsubscribedAt`) of platform announcements. |
| `GET` | `/api/newsletter/unsubscribe/broadcast?token=...` | Account-level one-click unsubscribe from platform announcements. The signed token comes from the link in every announcement email. Sets `newsletterOptIn=false` and `broadcastUnsubscribedAt=now`; returns a small HTML confirmation page. |
| `POST` | `/api/newsletter/unsubscribe/broadcast` | RFC 8058 one-click counterpart called by mail clients via the `List-Unsubscribe` header. Reads the token from the query string or a JSON body `{ token }`. Same effect as the GET, `200` JSON response. |
| `GET` | `/api/admin/newsletter/broadcast-audience` | Currently opted-in audience count for platform announcements (`newsletterOptIn=true` and not unsubscribed), capped by `ADMIN_BROADCAST_RECIPIENT_CAP`. |
| `GET` | `/api/admin/newsletter/broadcasts` | Recent platform-announcement sends (latest 50) from `admin_newsletter_sends`. |
| `POST` | `/api/admin/newsletter/broadcast` | Body `{ subject, body }` (subject ≤ 120, body ≤ 5000, sanitized). Send a platform announcement to every opted-in account through the instance sender. Returns `{ broadcast, recipientCount, successCount, failedCount }`. Requires `newsletterEnabled`. |

## Tips

Cryptocurrency tips (Bitcoin and Litecoin) per public profile. Creating a tip is public and rate-limited; reading the ledger and deleting records are authenticated owner operations.

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/tips` | Public. Body `{ profileId, coin, amount, name?, message? }`. `coin` is `"BTC"` or `"LTC"`, `amount` a decimal string with up to 8 places. Sanitized on the server. The profile must have `tipsEnabled` and an address for the requested coin. Returns HTTP 201 with the tip record and a `payment` object: `{ mode: "address", address, uri }` (wallet QR, recorded-intent ledger) when no BTCPay provider is configured, or `{ mode: "btcpay", invoiceId, url }` (BTCPay checkout, confirmation via webhook) when BTCPay is configured; if invoice creation fails it falls back to address mode. |
| `GET` | `/api/tips/overview?profileId=...` | Your tip ledger: `mode` (`"btcpay"` \| `"address"`), `totals` keyed by coin (`confirmedAmount`, `recordedAmount`, `confirmedCount`, `recordedCount`; amounts in the coin's decimal string form) and `recent` (50 latest tips with status `PENDING` \| `CONFIRMED` \| `CANCELLED`). |
| `DELETE` | `/api/tips/:id?profileId=...` | Delete one of your tip records. |

`tipsEnabled` (show the tip block), `tipsHeading`, `tipsBtcAddress` and `tipsLtcAddress` are regular profile fields (see [Profiles](#profiles)). On the **public** profile payload the addresses are only exposed as their real values once `tipsEnabled` is true (otherwise `null`), so a disabled wallet stays private.

**Payment confirmation:** when the instance is configured with BTCPay (`CRYPTO_ENABLED`, `BTCPAY_URL`, `BTCPAY_API_KEY`, `BTCPAY_STORE_ID`), tip invoices use `orderId = "tip-<id>"` and the standard crypto webhook (`POST /api/payments/webhooks/crypto/:provider`) marks the tip `CONFIRMED` on `InvoiceSettled` and `CANCELLED` on expiry/invalidation. Without BTCPay, tips stay recorded intents for the owner to reconcile.

## Shop

Digital product storefront per profile. Owner operations are authenticated and `?profileId`-scoped (defaults to the primary profile); the checkout and download endpoints serve the public.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/shop/availability` | Public instance config for the storefront: `stripe`, `paypal`, `crypto` booleans, `cryptoProviders`, `coins`, `currency`, `fileMaxMb`. |
| `GET` | `/api/shop/overview?profileId=...` | Owner stats: `profileId`, `slug`, `tier`, `limit` (`3` on FREE, `null` = unlimited), `discountPercent`, `totalSold`, `revenueCents`, `currency`, `products` (each with `id`, `title`, `description`, `type` (`DOWNLOAD`\|`REQUEST`), `priceCents`, `enabled`, `fileName`, `fileSize`, `previewImage`, `purchases`, timestamps). |
| `POST` | `/api/shop/products?profileId=...` | Create a product. Multipart form: `file` (the deliverable, ≤ `PRODUCT_FILE_MAX_MB`), `title` (≤ 80, sanitized), optional `description` (≤ 500, sanitized), `priceCents` (integer; `0` = free), optional `type` (`DOWNLOAD` default \| `REQUEST`). Request products take **no file** (a file on `REQUEST` is rejected; `fileName`/`filePath`/`fileSize` are stored empty). Blocked over the tier limit. |
| `PATCH` | `/api/shop/products/:id` | Update a product (`title`, `description`, `priceCents`, `enabled`, `previewImage`, `type`). Re-enabling does not restore deleted files. |
| `DELETE` | `/api/shop/products/:id` | Delete a product and its deliverable file + preview image. |
| `POST` | `/api/shop/products/:id/preview` | Multipart `image` (JPEG/PNG/GIF/WebP, ≤ 5 MB, magic-byte validated). Returns `{ previewImage }` (a public `/uploads/…` path). |
| `GET` | `/api/shop/sales?profileId=...&productId=...` | Owner sales ledger: every purchase with product (incl. `type`), buyer (`buyerEmail` full/unmasked — the seller's ledger, `buyerUserId`, `isGuest`), method, status, prices, crypto quote, `requestText` for request products, timestamps. |
| `POST` | `/api/shop/sales/:purchaseId/refund` | Refund a `PAID` purchase. Marks it `REFUNDED` and revokes the download; **does not** return the money — refund at the gateway first. |
| `GET` | `/api/shop/purchases` | Authenticated buyer's own purchases for re-download; each entry carries `productType` (`DOWNLOAD`\|`REQUEST`) so the UI can hide the download for requests. |
| `POST` | `/api/shop/buy` | Public purchase. Body `{ productId, method?, email?, provider?, coin?, requestText? }` (rate limit 30/h per IP). `method` `STRIPE` \| `PAYPAL` \| `CRYPTO`; `email` is required for guest paid purchases. For `REQUEST` products, `email` **and** `requestText` (≤ 2000, sanitized) are always required — free requests are marked `PAID` (method `FREE`) with the request recorded and the seller notified immediately. Price and discount are computed server-side. Response: `{ data: purchase, status, checkout?, clientToken?, downloadUrl? }` — `checkout.url` for gateway redirect, `clientToken` (JWT, 30 d TTL) for guest status polling, `downloadUrl` on free/instant purchases (never for `REQUEST`). |
| `GET` | `/api/shop/status/:purchaseId?token=...` | Poll a purchase (authenticated bearer or the guest `clientToken`; 120/h per IP). Returns the purchase state plus a `downloadUrl` once `PAID` — except for `REQUEST` products, which never expose one. |
| `GET` | `/api/shop/download/:purchaseId?token=...` | Signed download (download JWT or buyer bearer; 60/h per IP). Serves the file as `application/octet-stream` + `filename*` attachment, `Cache-Control: private, no-store`. `410` when refunded, `402` when confirmed but the download token expired, `400` for request products (nothing to download). |

**Prices & discount:** a product's `priceCents` is its base price; `Profile.shopDiscountPercent` (0–100, nullable) applies a percentage discount on top. The server returns/charges the discounted `finalPriceCents` everywhere; the frontend derives the crossed-out original only for display. Free products (`priceCents` 0) skip the gateway entirely: they are marked `PAID` with method `FREE` at creation time and the buy/status responses carry the download link immediately.

**Payment lifecycle:** paid buys create a `PENDING` purchase and a gateway session (`checkout.url`); the existing webhooks (`POST /api/payments/webhooks/stripe`, `/paypal`, `/crypto/:provider`) dispatch via `handleGatewayEvent` on the `purchase-<id>` `orderId` prefix: paid → `PAID`, refund → `REFUNDED` (revokes the download), cancelled → `CANCELLED` (only while `PENDING`). The gateway return URL is `${APP_URL}/<username>?shop=purchase&id=<id>&status=success\|cancelled`.

**Storage:** deliverable files live under a private `products/` subtree (excluded from the public `/uploads` endpoint), so they are only ever reachable through the signed download route. `PRODUCT_FILE_MAX_MB` (default 50), `PRODUCT_DOWNLOAD_TTL_HOURS` (default 168) and `PRODUCT_PURCHASE_TOKEN_TTL_DAYS` (default 30) configure size and token lifetimes; the product-limit column comes from the profile tier (FREE = 3, PRO/Enterprise unlimited).

## Invites (paid credits)

Invite credits are an instance-level product, not a per-profile shop: the operator enables them once and everyone buys the same packs. Because registration is invite-only, the whole purchase path works without an account — a guest is emailed real codes with a private claim link, and redeeming one of those codes during registration hands the rest to the new account.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/invite-purchases/config` | Public storefront snapshot: `open` (the switch is on **and** at least one pack parses), `currency`, `packs` (`quantity`, `priceCents`, `unitCents`, `bestValue`), `maxQuantity` (50), `resale` (`mode` `off`\|`permitted`\|`legal`\|`enforced`, `sellingAllowed`, `enforcementActive`, `clause` `none`\|`permitted`\|`prohibited`), `manualPayment` (`method`, `value`, `configured`), `claimTokenTtlDays`, `codeTtlDays`. Packs are listed even while `open: false` so a page can describe the offer without implying it is buyable.
| `GET` | `/api/invite-purchases/me` | Authenticated buyer's own history (`purchases`, newest first, 100 max) plus the same `store` snapshot. |
| `POST` | `/api/invite-purchases` | Public checkout (works with or without a bearer token; 10/h per IP). Body `{ quantity, method, email?, provider?, coin? }`. `method` `STRIPE` \| `PAYPAL` \| `CRYPTO` \| `MANUAL`. `quantity` must be an exact configured pack — there is no rounding and no bonus. `email` is required only when there is no session, and is then the sole identifier for the purchase. Returns `201` with `{ purchase, status, checkout?, clientToken? }`; `checkout.url` sends the buyer to the gateway, `clientToken` (JWT) polls a guest order. `403` when the store is closed or the account is invite-banned, `400` for an unknown pack. `MANUAL` is also `400` while `manualPayment.configured` is false, because an order with nowhere to send the money is one the operator would have to refund by hand. |
| `GET` | `/api/invite-purchases/resellable` | Authenticated list of the caller's own **unpurchased** codes — the ones earned from an event or a role quota. The response repeats `sellingAllowed` and `enforcementActive`, so an instance with `resaleMode: enforced` can tell a member their own codes are not for sale. With `off` or `permitted` selling stays allowed; the two differ only in whether the Terms publish the position. |
| `GET` | `/api/invite-purchases/status/:orderId?token=...` | Guest order state, authorised **only** by the claim token (which is bound to that one order). Returns the order plus `codes` (`code`, `used`, `revoked`) once `PAID`, and an empty list otherwise. `403` for a bad or mismatched token, `404` for a valid token on an unknown order. |
| `POST` | `/api/invite-purchases/claim-link` | Re-emails the guest claim link. Body `{ orderId, email }`. Always answers `200` (with `sent: true`/`false`) so it cannot be used to discover which order ids exist. |
| `POST` | `/api/invite-purchases/claim-link-auth` | The signed-in equivalent: body `{ orderId }`, returns `{ url }` for one of your own orders. |

`clause` is the published legal stance and is sent rather than inferred, so a storefront cannot tell a buyer resale is prohibited on an instance that permits it. `manualPayment.configured` is false whenever no usable instructions exist (no method chosen, or a method with an empty value); a client must not offer a manual payment path in that state, because it leaves the buyer with nowhere to send the money. The same setting backs `GET`/`PUT /api/admin/orders-config` and is shared with the plan checkout.

**Payment lifecycle:** orders start `PENDING` and the same webhooks used by the shop (`POST /api/payments/webhooks/stripe`, `/paypal`, `/crypto/:provider`) dispatch on the `invites-<id>` `orderId` prefix: paid → `PAID`, refunded → `REFUNDED`, cancelled → `CANCELLED` (only while `PENDING`). A `MANUAL` order becomes `PAID` when an operator confirms it in the admin dashboard.

**What a `PAID` order grants:** a member purchase is credited to the account as a permanent balance (`InviteCreditGrant`, tied to the order). A guest purchase is minted as expiring `InviteCode` rows (bounded by `INVITE_PURCHASE_CODE_TTL_DAYS`, default 30) and emailed once. The codes email is only marked as sent after the provider confirms delivery, so a failed send stays retryable instead of stranding a buyer who has paid.

**Guest delivery without mail (operator fallback).** A guest purchase has no account to return to, so the codes have to reach the buyer somehow. Email is the normal channel, but an instance with SMTP off would otherwise hold a paid order it cannot deliver. `POST /api/admin/invite-purchases/:id/claim-link` (requires `invites.manage`) mints a fresh signed claim URL for one order and returns `{ url, expiresInDays }` — never the raw codes. Hand that link to the buyer however you like (chat, DM, email from a different mailbox). The order is **not** marked as emailed and its codes remain unrevealed until the order is `PAID`, so this cannot be used to hand out unpaid codes. The guest status endpoint is unchanged and still requires the claim token: `GET /api/invite-purchases/status/:orderId?token=...` answers `403` without it, which is why the admin link (not the order id alone) is the fallback. `GET /api/admin/invite-purchase-settings` returns `emailConfigured`, and the admin dashboard shows a prominent warning while purchases are open with mail unavailable.

**Refunds are local.** `POST /api/admin/invite-purchases/:id/refund` revokes exactly what that order still holds — its unused credits are deleted and its unused codes revoked — and nothing else. It does **not** call the payment provider, so return the money first and then record it. Credit that was already redeemed is never revoked.


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

**Registration invites.** `POST /api/invites` creates invite codes. Admins with `invites.manage` generate up to 50 per call with an optional `expiresInDays`. Other users generate within their **role quota** (needs the `invites.generate` permission plus the role's batch limit > 0) or their **event allowance**, subject to the global `userGenerationEnabled` switch (admin panel), a per-role **cooldown**, **expiry bounds**: the role's min/max expiry days, with the max additionally capped by the allowance's expiry date when generating from an allowance, and — for ENTERPRISE accounts **without a paid order** — a per-user **team seat limit** (when `seatLimit` is set by an admin). Seat-limited users can generate invite codes only while `seatsUsed < seatLimit`, and the batch is capped to the remaining headroom; once the limit is reached, generation is blocked with a `403` and a clear message. Enterprise accounts that purchased via an order (`Order` with `status = PAID` and `plan = ENTERPRISE`) are always uncapped. Body: `count` (1–50, default 1) and optional `expiresInDays`. Returns the created codes plus a `meta` object with the user's `allowance`, `allowanceExpiresAt`, `outstanding`, `cooldownRemainingSeconds`, their role's invite config, and when a seat limit is active: `seat: { limited, limit, used, remaining }`.

**Allowance & refunds.** Invite events grant an allowance (see below). Codes created from an allowance are tagged `fromAllowance: true`. A code that expires **unused before** the allowance itself expires is refunded automatically (its credit returns to the user's allowance on their next `GET /api/invites` or generate call); codes that die exactly at the allowance expiry are not refunded.

`GET /api/invites` lists the caller's codes **and** the same `meta` object (allowance, role config, cooldown remaining, whether generation is currently possible, and the active `seat` info when a team seat limit is set). `DELETE /api/invites/:id` revokes an unused code you created; admins with `invites.manage` can revoke any unused code.

`PATCH /api/invites/:id/note` sets a short note on a code you created (admins with `invites.manage` can edit any code). Body: `{ "note": string | null }` (max 500 chars, HTML-like characters are stripped). Pass `null` or an empty/whitespace string to clear the note. Returns the updated code.

**Public invite landing pages.** `GET /api/invites/:code` (public, no auth, per-IP rate-limited) resolves a **valid, unused, unexpired** invite code and returns `{ code, status: "valid", inviteeDiscountPercent, discountDurationDays, referrer }`. The `referrer` object exposes only a public identity — `username` is always returned, and `slug`, `displayName` and `avatar` come from the referrer's primary public profile when it exists and `isPublic` is true; otherwise only `username` and a `slug` fallback to username are returned. Any code that is missing, used, revoked, or expired returns the same `404 Invite code not found` (the `reason` is never revealed) so invalid codes cannot be enumerated through the API. The endpoint powers the frontend `/invite/<code>` referral landing pages.

**Admin endpoints** under `/api/admin/*` manage users, tiers, password resets, profiles, auth bans, manual unlocks, auth logs, **roles**, **badges**, and **invites**:

- `GET /api/admin/invites` — every invite code across all creators, with the creator and — when used — the account that redeemed it. Paginated: `limit` (default 50, max 100), `offset`, and `filter` (`all` | `available` = unused/unexpired/unrevoked | `mine` = created by the caller); returns `{ data, pagination: { total, limit, offset } }`.
- `GET /api/admin/invite-settings` / `PUT /api/admin/invite-settings` — read or set `{ userGenerationEnabled }`, the master switch for non-admin invite generation (admin panel only, no environment variable).
- `GET /api/admin/invite-events` — audit list of past invite events.
- `POST /api/admin/invite-events` — run an invite event: `{ count, expiryDays }` grants every non-invite-banned user `count` allowance credits expiring after `expiryDays` days (returns `{ grantedUsers, event, allowanceExpiresAt }`).
- `PATCH /api/admin/users/:id` accepts `inviteBanned` — banning zeroes the allowance, revokes the user's outstanding codes, and excludes them from future events. It also accepts `seatLimit` — an integer `>= 0` (or `null`) team seat cap on invite-based team growth for gifted ENTERPRISE accounts (see Registration invites above); `null` means unlimited.
- `GET /api/admin/users` list response includes per-user seat metadata — `seatLimit`, `seatsUsed` (invite codes with `usedById` set, created by that user), and `hasPaidOrder` (whether the user holds a PAID ENTERPRISE order and is therefore always uncapped).
- `DELETE /api/admin/users/:id` — full GDPR erasure (account, profiles, uploads, webhooks, passkeys, invite codes, and the user's auth-log and account-ban references).
- `DELETE /api/admin/users/:id/passkeys/:passkeyId` — remove a single passkey from a user. Requires `users.manage`. Returns the serialized user with freshly recomputed passkey security flags (`passkeyCount`, `hasNoPasskeys`, `passkeysUnverified`, `securityFlag`).
- `GET /api/admin/landing-config` / `PUT /api/admin/landing-config` — read or set `{ featuredProfileUsername }`, the username linked from the landing hero and showcase preview editor (requires `settings.manage`; pass an empty string to clear).

Admin access is permission-based (see [Admin Guide](./admin-guide.md) → Roles &amp; Permissions).

## Affiliate

The referral/affiliate system rewards users who invite new accounts. A flat invitee discount applies to every referred user; the referrer earns milestone rewards (referrer discounts, extra invite credits, badges) configured by the instance via environment variables (`AFFILIATE_DISCOUNT_LEVELS`, `AFFILIATE_ALLOWANCE_LEVELS`, `AFFILIATE_BADGE_LEVELS`) or overridden by an administrator through the API.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/affiliate/me` | The caller's referral stats: `referralCount`, `discountPercent`, `discountExpiresAt`, `referredBy`, `nextMilestone`, `rewards`, and the effective milestone config (including `inviteeDiscountPercent`, `discountDurationDays`, `abuseAction`, `abuseScope`). |
| `GET` | `/api/affiliate/admin/overview` | Admin-only (`affiliates.manage`). Top 50 referrers (leaderboard), totals, and the effective milestone config with a `configSource` field: `"db"` when an admin-managed override is active, `"env"` when using the `AFFILIATE_*_LEVELS` environment variables. |
| `PUT` | `/api/affiliate/admin/config` | Store an admin milestone configuration (overrides the environment). Body: `{ discountLevels?, allowanceLevels?, badgeLevels? }`, each an array of `{ level: integer≥1, value: string }`. Discount values must be integer percents 1–99, allowance values invite counts 1–9999, badge values must reference an existing badge slug by `slug`, and level numbers must be unique within each reward type. Returns the full effective config with `configSource: "db"`. |
| `DELETE` | `/api/affiliate/admin/config` | Delete the stored override so the effective config falls back to the `AFFILIATE_*_LEVELS` environment variables. Returns the full effective config with `configSource: "env"`. |

## Orders & Billing

Orders carry server-computed (affiliate-discounted) prices and are created from the dashboard Billing tab. Checkout methods: `MANUAL` (contact the owner) or, when the instance enables them, `STRIPE` (card), `PAYPAL` and `CRYPTO` — online payments fulfill automatically via webhook.

### `GET /api/orders/config`

Public billing configuration (no auth required) — `{ billingMode, currency, plans, gateways, contact }` where `plans` is the list of priced plans with `{ plan, label, priceCents }` sourced from the environment, `gateways` is `{ stripe: boolean, paypal: boolean, crypto: { enabled, providers, coins } }`, and `contact` is the owner's manual-payment contact `{ method, value }`. The frontend pricing page uses this; it never sends its own prices.

### `GET /api/orders/me`

The caller's billing quote and history — `{ currentTier, discountPercent, billing: { billingMode, currency, plans }, orders }`. `discountPercent` is the effective affiliate discount (max of the user's own milestone discount and the flat invitee discount if they arrived via a referral), and each order includes its `basePriceCents`, `discountPercent`, `finalPriceCents`, `status` and — for gateway orders — `gatewayTransactionId`, `gatewayStatus`, `gatewayCheckoutUrl`, `cryptoCoin`, `cryptoAmount`, `cryptoRateUsd`.

### `POST /api/orders/me`

Create an order: `{ plan: "PRO" | "ENTERPRISE", method: "MANUAL" | "STRIPE" | "PAYPAL" | "CRYPTO", note?, coin?, provider? }`. The price is recomputed server-side (never trusted from the client). For `MANUAL` this returns a pending order; for gateway methods it also creates the payment session and returns `checkout: { url, provider, coin?, coinAmount?, rateUsd? }` (the `url` is where the user pays, e.g. Stripe Checkout, PayPal approval, or the BTCPay/BitPay invoice). If the gateway call fails the order is rolled back and a `502` is returned. Ordering a plan not above your current tier returns `400`; a repeated pending order for the same plan returns `409`.

### `POST /api/orders/downgrade`

Self-service downgrade to a strictly lower tier: `{ tier: "PRO" | "FREE" }` (ENTERPRISE→PRO/FREE, PRO→FREE). Entitlements are **soft-disabled, never deleted** — existing profiles, aliases, tracks and products are kept (they just can't grow past the new plan's limits) and enterprise-only features (business SSO, team seats, webhooks API, custom domains) are locked by the normal tier gates. Any `PENDING` order is cancelled so a late gateway webhook can't silently re-upgrade the account, and enterprise SSO enforcement is switched off so a formerly forced-SSO account can still sign in. A same-or-higher target is rejected with `400` (upgrade through `POST /api/orders/me` instead). Returns `{ tier, previousTier, cancelledOrders }`.

### Payment webhooks (public, no auth)

- `POST /api/payments/webhooks/stripe` — verifies the `stripe-signature` header against `STRIPE_WEBHOOK_SECRET`; `checkout.session.completed` marks the order paid (and upgrades the buyer), `checkout.session.expired` cancels it.
- `POST /api/payments/webhooks/paypal` — verifies the event with PayPal's `verify-webhook-signature` API using `PAYPAL_WEBHOOK_ID`; a captured payment marks the order paid, refunded/denied events refund or cancel it.
- `POST /api/payments/webhooks/crypto/:provider` (`btcpayserver` | `bitpay`) — verifies the provider's signature header; a settled invoice marks the order paid, expired/invalid ones cancel it, refunds mark it refunded.

Each provider dashboard must be pointed at the matching URL (e.g. `https://<host>/api/payments/webhooks/crypto/btcpayserver`). Fulfillment is automatic and idempotent; refunds never downgrade a tier, and cancelled/expired sessions only cancel `PENDING` orders.

### Admin endpoints (`orders.manage`)

- `GET /api/admin/orders?status=&limit=&offset=` — every order (newest first) with the owning user and the order's price/discount breakdown (plus gateway transaction details, when present); paginated `{ data, pagination: { total, limit, offset } }`.
- `PATCH /api/admin/orders/:id` — `{ status, adminNote? }`. `PENDING → PAID` (upgrades the buyer to the ordered plan if higher), `PENDING → CANCELLED`, `PAID → REFUNDED` (no downgrade), `CANCELLED → PENDING` (reopen). Invalid transitions return `400`.
- `GET /api/admin/orders-config` / `PUT /api/admin/orders-config` — read or set the manual-payment contact config `{ method: "none"|"email"|"telegram"|"discord"|"whatsapp", value }` (requires `settings.manage`; stored in a system setting).

## Landing

Public configuration for the marketing landing page, served without authentication:

### `GET /api/landing/config`

Returns `{ featuredProfileUsername }` — the username that the landing hero and showcase preview editor link to (`/{username}`), or `null` when not configured. The response is cached for 60 seconds.

## Features

### `GET /api/features`

Public feature-flag configuration (no auth required), cached for 60 seconds. Returns `{ linksSections, linksCustomIcons, linksQr }` — booleans mirroring the instance operator's `LINKS_*_ENABLED` environment variables. The frontend uses this to show or hide the section-heading, custom-icon, QR-generate, and on-profile-QR controls. The backend always accepts and stores the per-link fields, so toggling a flag on later never needs data re-entry.

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

## Captcha

Human-verification on registration and login, enabled by the instance operator (`CAPTCHA_PROVIDER` = `turnstile` \| `recaptcha` \| `hcaptcha`). When a provider is configured, `POST /api/auth/register` and `POST /api/auth/login` **require** a valid `captchaToken` in the body (a fresh challenge token validated against the provider's siteverify API) and return `400` without it.

### `GET /api/captcha/config`

Public. Returns `{ provider, siteKey, enabled }`. `enabled` is `true` only when a provider is configured; `siteKey` is the public client key (safe to expose — the secret key is never returned). When `enabled` is `false`, clients must not show a captcha widget.

## Privacy & Consent

Consent records and privacy signals for the frontend cookie banner.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/privacy/consent` | Returns `{ consent, dnt, effective }`. `consent` is the stored decision (`accept` \| `essential` \| `unknown`); `dnt` is `true` when the visitor sent Do Not Track (`DNT: 1`) or Global Privacy Control (`Sec-GPC: 1`); `effective` is the enforced mode (`dnt ? "essential" : consent`). |
| `POST` | `/api/privacy/consent` | Body `{ decision: "accept" \| "essential" }`. Sets the `bp_consent` cookie (1-year) and, for `essential`, clears the `bp_vid` analytics cookie. Do Not Track / Global Privacy Control **always win**: when `DNT: 1` or `Sec-GPC: 1` is sent the decision is forced to `essential` and analytics are never enabled. |
| `POST` | `/api/privacy/consent/revoke` | Clears `bp_consent` and `bp_vid`, returning consent to `unknown`. |

Non-essential analytics (page views, link clicks, and any configured external Matomo tracker) are recorded only when the effective consent is `accept`; visitors sending DNT/GPC are never tracked.

## Rate limits

- Public profile views: 60 requests/minute per IP.
- Webhook test deliveries: 5/minute per user.
- Auth endpoints enforce anti-brute-force locking (see [Configuration](./configuration.md) `AUTH_LOCK_POLICY`).

---

← [Environment Variables](./environment-variables.md) · [User Guide](./user-guide.md) →
