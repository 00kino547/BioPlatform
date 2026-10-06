# PROJECT_MAP.md

> Update when files move or new modules are created.

## Backend

```
apps/backend/src/
├── index.ts              # Entry point
├── app.ts                # Express setup, middleware, routes
├── cli/                  # bioplatform admin CLI (runs in backend container / dev via pnpm cli)
│   ├── index.ts          # Arg parsing + command dispatch + help (bin: dist/cli/index.js)
│   ├── shared.ts         # Identifier resolver (@user/email/slug/alias/uuid), flags parser, confirm/prompt helpers
│   ├── users.ts          # users list/show/set-tier/set-limits/set-username/set-email/reset-password/unlock/(un)ban-invites/delete — no self-edit guard (owner tool)
│   └── profiles.ts       # profiles list/show/edit (display name, bio, location, website, visibility; none = clear)
├── config/env.ts         # Zod-validated env vars
├── lib/
│   ├── prisma.ts         # Prisma client singleton
│   ├── email.ts          # Email service (nodemailer, Gmail preset, custom SMTP)
│   ├── music.ts          # Track limits per tier, Spotify/YouTube URL parsing → embed URLs, fullUrl parsing
│   ├── totp.ts           # TOTP secret generation + code verification (otplib)
│   ├── validation.ts     # Shared sanitization (stripHtml) + URL/platform/discord validators, profile/alias/slug schemas
│   ├── limits.ts         # Tier limits: profileLimit/aliasLimit/trackLimit per tier + admin per-user overrides, limits summary for /profiles/me
│   ├── profile.ts        # Profile helpers: slug/alias resolution (byProfileOrAlias), primary profile resolution, backfill/slug normalization, sanitize
│   ├── webauthn.ts       # Passkey helpers (register/login options, challenge store, verify register/login/2FA)
│   ├── authGuard.ts      # Auth rate limiting: fingerprint (IP/cookie/UA), lock policy (block/trusted_ip/email), lock duration, auth log helpers
│   ├── webhook.ts        # Webhook lib: events, secret gen/encryption (AES-256-GCM), HMAC signing, delivery + retry sweep
│   ├── profileTransfer.ts# Spreadsheet export/import (xlsx/ods/csv via @e965/xlsx, macro reject, formula-injection guard)
│   ├── discord.ts        # Discord OAuth2: scopes, state create/verify, code exchange + refresh grant, @me fetch, avatar URLs, purpose-scoped secret encryption (token/webhook), webhook URL validation
│   ├── discordGateway.ts # Shared bot gateway session (GUILDS|GUILD_PRESENCES intents, heartbeat/resume/reconnect, fatal-close handling), in-memory presence cache keyed by user id, describeActivities
│   ├── discordPost.ts    # Post-to-Discord webhook embed helper
│   ├── httpCache.ts      # TTL-based HTTP response cache (used by version check, SEO, etc.)
│   ├── inviteService.ts  # Invite allowance/grant/refund logic (invite_grant_events table) + purchased-credit allocation + the published resale stance (INVITE_RESALE_MODES off|permitted|legal|enforced → InviteResalePolicy.clause)
│   ├── invitePricing.ts  # INVITE_PRICE_PACKS parsing (quantity:priceInMinorUnits), exact-quantity resolution, per-credit best-value flag
│   ├── inviteOrders.ts   # Paid invite order helpers: guest claim tokens, code minting on confirm, credit grants, lapsed-balance sweep, refunds
│   ├── contactConfig.ts  # Shared "pay by hand" instructions (orders.contactMethod/contactValue) for plan checkout + the invite store; getManualPaymentInstructions derives `configured`
│   ├── policyContext.ts  # Builds the public legal snapshot (/api/policy/context): instance switches + published positions, no secret leakage
│   ├── policyContextCache.ts # 60 s cache key + clearPolicyContextCache() so admin writes that change the legal text invalidate it immediately
│   ├── policyNotice.ts   # Legal change notice: status (versions, cutoff, pending counts), optional note, admin send + boot-time auto-email (deduplicated)
│   ├── tips.ts           # Tip helpers: TIP_COINS, tipAmountSchema, tipUri (bitcoin:/litecoin: URIs), tipsPaymentMode (btcpay | address)
│   ├── shop.ts           # Product shop helpers: getProductLimit (FREE=3, PRO/ENTERPRISE=null), discountedCents, productUploadsDir/productFileKey, publishProductUpload/deleteProductUpload, sign/verify download+client tokens, downloadUrl, shopReturnUrl, buildPurchaseEmail, SHOP_PURCHASE_PREFIX
│   ├── newsletterSender.ts # Own-SMTP deliverer helpers: AES-256-GCM encrypt/decrypt of the SMTP password, public sender shape (hasPassword only), DNS TXT verification token + check, custom-relay send/test
│   ├── newsletter.ts     # Newsletter helpers: per-tier rolling-window limits (env defaults + DB override), unsubscribe JWT sign/verify, email template with List-Unsubscribe + postal-address fallback, transient in-memory consent evidence (24 h)
│   ├── payments/handleGatewayEvent.ts # Shared gateway-event dispatch: "tip-<id>" orderId branch → Tip CONFIRMED/CANCELLED, order branch → fulfill/refund
│   ├── media.ts          # Media processing helpers (sharp-based image optimization)
│   ├── permissions.ts    # Permission constants and role helpers (RBAC) — includes themes.manage (Seasonal Themes)
│   ├── seasonalThemes.ts # Seasonal/holiday theme service: global config (enabled/autoSchedule/respectUserPreferences), resolveActiveSeasonalTheme + resolveProfileSeasonalTheme resolution (override > holiday > season > sortOrder, Christmas always-allow)
│   ├── profileOg.ts      # OG data builder for a public profile (presence line + counts) → PNG card + HTML meta page (host-aware: custom-domain canonical/base URLs)
│   ├── ogCard.ts         # Server-rendered 1200x630 OG card PNG (@napi-rs/canvas)
│   ├── og.ts             # OpenGraph/Twitter meta HTML (escapeHtml + buildOgPage + buildLandingOgPage)
│   ├── customDomains.ts  # Custom domains: hostname validator, app-host detection, TXT verification token + DNS check, PRO/ENTERPRISE + permission gate, status list
│   ├── badges.ts         # Badge ordering helper (orderBadges: saved order first, remaining badges keep original order, stale/duplicate ids ignored)
│   ├── acme.ts           # ACME (Let's Encrypt) service: HTTP-01 challenge map, account key, issue/renew certs, nginx custom-domains.conf generator, interval loop
│   ├── seo.ts            # robots.txt/sitemap.xml/llms.txt/llms-full.txt builders with TTL cache
│   ├── versionCheck.ts   # GitHub update check: changelog fetch (raw → API → jsDelivr, fail-open), semver compare, severity (security/critical), TTL cache + stale-while-error, lockdown middleware (requireNoUpdateLockdown)
│   └── openapi.ts        # OpenAPI 3.0 document served at /api/openapi.json
├── middleware/auth.ts     # JWT verification middleware (requireAuth, requireAdmin)
├── middleware/consent.ts  # Consent gate: 403 policies_outdated on every authenticated route until the current POLICY_VERSIONS are accepted (exempts GET /api/auth/me + POST /api/auth/accept-policies by FULL path; operator auto-accept after the 30-day window)
├── middleware/admin.ts    # Admin permission middleware (requirePermission, requireAdmin gate)
├── middleware/rateLimit.ts # Auth anti-brute-force middleware (cookie issuance, 2-of-3 fingerprint block, policy-aware account lock, outcome + log recording)
├── middleware/domain.ts   # resolveCustomDomain: maps active ProfileDomain → req.customDomain (skips app host)
└── routes/
    ├── auth.ts           # Register, login/start, login (password + 2FA), passkey login/2FA (host-aware rpID/origin for custom domains), passkey CRUD, TOTP setup/enable/disable, me, change-password, unlock, unlock/verify — passkey/TOTP/change-password gated by update lockdown
    ├── invite.ts         # Invite code CRUD (create, list, revoke)
    ├── invitePurchase.ts # Paid invite credits: public /config, /me, POST / (guest or member), /resellable, guest /status/:orderId (claim token), /claim-link(-auth)
    ├── policy.ts         # Public GET /policy/context — the legal snapshot the Terms/Privacy pages render
│   ├── profile.ts        # Multi-profile CRUD (list/create, get/update/delete per profileId, set-primary), aliases CRUD, badges toggle + order, avatar/banner upload+delete, spreadsheet export/import, public profile by slug/alias (incl. discord presence), click tracking, OG card PNG
    ├── admin.ts          # Admin: list users, update user (tier, track/profile/alias limits, badges), reset password, edit profiles, list/unban auth bans, account unlock, auth log, custom-domain list/approve/reject/issue-cert, seasonal-themes CRUD + config (themes.manage) — user/role/badge mutations gated by update lockdown
    ├── badges.ts         # Badge catalog CRUD (list, create, edit, delete) — system badges undeletable
    ├── analytics.ts      # Analytics stats (views, clicks, referrers, platform breakdown) — ?profileId scoped
    ├── email.ts          # Email notification settings (SMTP config, test endpoint) — ?profileId scoped
    ├── newsletter.ts     # Newsletter: public subscribe/unsubscribe, send (own SMTP deliverer or platform sender — admins always, non-admins only when NEWSLETTER_PLATFORM_SMTP_ENABLED + allowlisted), owner subscriber list/sends/erasure, own sender CRUD + verify/test, admin tier-config + sender-whitelist + consent-search
    ├── music.ts          # Music tracks CRUD (create, upload, patch, reorder, delete) — ?profileId scoped
    ├── tips.ts           # Tips: POST /api/tips (public, 30/h per-IP limit), GET /api/tips/overview + DELETE /api/tips/:id (owner) — creates BTCPay invoice or address-mode intent
    ├── shop.ts           # Product shop: GET /availability, GET /overview (+?profileId), POST /products (file upload) + PATCH/DELETE /:id, POST /:id/preview, GET /sales (+refund), GET /purchases (buyer), POST /buy (public/account/free), GET /status/:id, GET /download/:id (signed token or buyer Bearer; 410 refunded, 402 expired), private products/ storage, rate limits 30/120/60 per IP
    ├── paymentWebhooks.ts # Public provider webhooks (stripe/paypal/crypto/:provider) — signature-verified, dispatch via lib/payments/handleGatewayEvent
    ├── webhook.ts        # Webhook CRUD (list, create, patch, rotate-secret, test, deliveries, delete) — create/update/rotate/delete gated by update lockdown
    ├── version.ts        # Public GET /api/version (installed/latest/severity, ?force=1 bypasses cache)
    ├── domain.ts         # Custom domains: public GET /api/domain (host/active/root), user self-serve request/verify/root/remove
    └── discord.ts        # Discord: status, OAuth connect/callback, disconnect, settings, post-to-webhook, session restore on boot — ?profileId scoped
apps/backend/prisma/
├── schema.prisma         # User (tier, trackLimit, profileLimit, aliasLimit, badges, totpSecret, totpEnabled, registeredIp, lastLoginIp), Profile (slug, isPrimary, badges, customDomain relation, incl. showDiscordPresence/showDiscordActivity, discordWebhookUrlEncrypted, tipsEnabled/tipsHeading/tipsBtcAddress/tipsLtcAddress, shopDiscountPercent), Product (profile relation, title, description, priceCents, filePath/fileName/fileSize, previewImage, enabled, purchases), ProductPurchase (buyer/user/Profile, product, PurchaseMethod/PurchaseStatus, gatewayCheckoutUrl, paidAt/refundedAt), Tip (coin, amount, name/message, status, invoiceId, paidAt), ProfileDomain (custom domains + TLS cert status), ProfileAlias (slug per profile), DiscordConnection, InviteCode (purchased/sourceGrantId), PageView, LinkClick, MusicTrack, Passkey, WebAuthnChallenge, AuthBan, AuthLog, Webhook, WebhookDelivery, SeasonalTheme (slug/label/emoji/kind/enabled/config/start-end window/overrideState/allowedByAdmin/sortOrder), NewsletterSubscriber, NewsletterSend, NewsletterSender models; User carries newsletterSenderWhitelisted, acceptedTosVersion/acceptedPrivacyVersion/acceptedPoliciesAt/policiesAutoAccepted; **InviteCreditGrant** (source EVENT|ROLE|PURCHASED, quantity, expiresAt, revokedAt, recoveredAt, sourceGrantId), **InvitePurchaseOrder** (invites-<hex> id, quantity/priceCents/currency, method STRIPE|PAYPAL|CRYPTO|MANUAL, PENDING|PAID|REFUNDED, gateway fields, codesNotifiedAt)
└── seed.ts               # Bootstrap admin + invite codes
apps/backend/docker-entrypoint.sh # Seeds bootstrap data when SEED_ON_START=true, then starts the API
apps/backend/tests/
├── setup-env.ts          # Test env bootstrap (loads .env, points DATABASE_URL at bioplatform_test)
├── badges-order.test.ts  # Unit + integration tests for badge ordering (Node test runner via tsx)
├── shop.test.ts          # Product shop tests (schema promo, product limit tiers, discounted price math, file-name helpers, JWT download+client token sign/verify + wrong-purpose rejection, gateway purchase- prefix branch + refund-after-paid, idempotency)
├── newsletter-sender.test.ts # Own-SMTP deliverer tests (password encryption round-trip/serialization, DNS verify token + mocked resolution, from-domain/host change resets verification, tier/allowlist gating, test-email send, admin whitelist endpoints)
├── version-check.test.ts # Unit tests for compareVersions, parseChangelog, getInstalledVersion
├── invite-purchases.test.ts # Pack pricing + paid invite store: pricing parsing, guest/member purchase, code minting, claim links, refunds, bans, lapsed balances, resale clauses, pay-by-hand instructions
├── policy-consent.test.ts  # Consent gate behaviour and its full-path exemptions
├── policy-auto-accept.test.ts # Operator auto-accept of a new policy version (window, marker, deliberate acceptance)
├── policy-context.test.ts    # Legal snapshot content + no "switched off" leakage into the rendered documents
└── privacy-consent-dnt.test.ts # Cookie consent records an explicit choice under Do Not Track
```

## Frontend

```
apps/frontend/src/
├── main.tsx              # Entry point
├── App.tsx               # Root component + React Router (/, /login, /register, /unlock, /dashboard, /admin, /privacy, /terms, /:username) — wraps in DomainProvider, CustomDomainRoot resolves the custom-domain root (redirect to root-target profile slug, else Landing)
├── index.css             # TailwindCSS + animations + scroll-reveal
├── config/branding.ts    # Branding env vars (VITE_*)
├── config/env.ts           # Env accessor: window.__APP_CONFIG__ (runtime, injected by the container) over import.meta.env (build time)
├── contexts/
│   ├── AuthContext.tsx    # Auth state (login, register, logout)
│   └── DomainContext.tsx  # Custom-domain info for the current host (active, host, root slug, canonical) via GET /api/domain
├── lib/
│   ├── api.ts            # API client (auth incl. passkeys/TOTP/2FA, multi-profile CRUD + aliases + badges + badge order, upload, export/import, analytics, email, music, tips, shop, webhooks, discord, custom domains, version check) — profile-scoped calls take profileId
│   ├── seo.ts            # usePageMeta + JSON-LD (optional baseUrl for custom domains)
│   ├── media.ts          # Frontend media helpers (image URL construction, CDN utils)
│   ├── format.ts         # formatPrice (Intl currency) + fileSize helpers
│   ├── useVersionCheck.ts # Update-check hook: module-level cache + in-flight dedupe, useVersionCheck + useUpdateLockdown (locked = security/critical)
│   ├── emailHint.ts      # emailHint() — shared "is this usable as a delivery address" check
│   ├── usePolicyContext.ts # Fetches /api/policy/context once for landing/legal surfaces
│   └── utils.ts          # cn() utility
├── components/
│   ├── ui/
│   │   ├── button.tsx        # Button (5 variants, href renders an anchor)
│   │   ├── card.tsx          # Card (6 subcomponents)
│   │   ├── badge.tsx         # Badge (5 variants)
│   │   ├── dialog.tsx        # Modal dialog (esc/overlay close, role=dialog, aria-modal)
│   │   ├── scroll-reveal.tsx # IntersectionObserver wrapper
│   │   ├── BadgePill.tsx     # Colored badge pill for public profiles
│   │   ├── ImageCropper.tsx  # Image crop/resize component
│   │   ├── PlatformIcon.tsx  # SVG icons for social platforms (24 platforms)
│   │   ├── LayoutSelector.tsx # 8-layout preset picker grid (default/grid/compact/wide/glassmorphism/minimal/sidebar/editorial) with icon + description
│   │   ├── BackgroundSelector.tsx # Background image picker: gradient presets, seasonal presets, custom URL input, file upload, remove button
│   │   └── FxOverlay.tsx     # Lightweight canvas animated FX overlay (snow/pumpkins/hearts/leaves/stars/confetti/sparkle); DPR-capped, area-scaled particles, respects prefers-reduced-motion
│   ├── updates/
│   │   ├── UpdateDialog.tsx  # Shared update dialog: severity chip, skipped-release changelog sections, GitHub release link, re-check (force)
│   │   └── VersionBadge.tsx  # Public footer version badge (green/amber/red on severity), opens UpdateDialog
│   ├── auth/
│   │   ├── ProtectedRoute.tsx # Redirect to /login if unauthenticated
│   │   └── SecurityTab.tsx    # Dashboard Security tab (passkeys + TOTP management) — locked down during critical/security update
│   ├── settings/
│   │   ├── WebhooksTab.tsx    # Dashboard Webhooks tab (create/edit/toggle/test/rotate/secret/deliveries) — mutations locked down during critical/security update
│   │   ├── DataTab.tsx        # Dashboard Data tab (spreadsheet export/import)
│   │   ├── InvitesTab.tsx     # Dashboard Invites tab (generate/revoke codes, allowance, cooldown)
│   │   ├── InviteCreditStore.tsx    # Buy-invite panel (packs, best value, method picker, MANUAL instructions, guest/member checkout + purchased order link)
│   │   ├── ManualPaymentInstructionsEditor.tsx # Shared pay-by-hand instructions editor (plan checkout + invite store)
│   │   ├── DomainTab.tsx      # Dashboard Domain tab (request TXT-verified custom domain, verify, root target, disconnect)
│   │   └── DiscordTab.tsx     # Dashboard Discord tab (connect/disconnect, presence toggles, webhook + post, invite bot)
│   ├── music/
│   │   └── MusicPlayer.tsx   # Playlist picker + embedded player (local/Spotify/YouTube, full version + Open in Spotify)
│   ├── tips/
│   │   ├── TipsTab.tsx       # Dashboard Tips tab (enable toggle, heading, BTC/LTC addresses; Overview: per-coin recorded/confirmed totals, recent 50, row delete)
│   │   └── TipBlock.tsx      # Public tip block + dialog (coin tabs, amount presets/custom, name/message, QR of bitcoin:/litecoin: URI, copy address, BTCPay checkout link)
│   ├── shop/
│   │   ├── ShopTab.tsx       # Dashboard Shop tab (product upload/create, discount %, overview stats, product list w/ toggle/preview/delete, sales table)
│   │   ├── ShopBlock.tsx     # Public shop block + buy dialog (product grid, method picker Card/PayPal/Crypto, coin picker, guest email, checkout redirect + status polling, download link)
│   │   └── PurchasesTab.tsx  # Dashboard Purchases tab (buyer's purchases + one-click download)
│   ├── discord/
│   │   └── PresenceWidget.tsx # Shared Discord presence card (status dot, activity line/icon, custom status, album art)
│   ├── layout/
│   │   ├── Container.tsx     # Max-width container (3 sizes)
│   │   ├── Navbar.tsx        # Sticky navbar, scroll-aware glass
│   │   └── AppFooter.tsx     # Footer with version badge, links
│   ├── EnterGate.tsx         # Invite-only gate (redirects to register if no access)
│   ├── invites/
│   │   └── BuyInviteModal.tsx  # Shared "buy an invite" dialog (register/login/landing/FAQ entry point, email prefill, esc/backdrop close)
│   ├── legal/
│   │   ├── ConsentGate.tsx    # Blocks the SPA until the current Terms/Privacy are accepted (renders children on /terms + /privacy)
│   │   └── policyText.ts      # Renders the instance-accurate legal text from the policy context (shared by Terms + Privacy)
│   └── landing/
│       ├── Hero.tsx          # Hero with animated grid, stats
│       ├── Features.tsx      # Bento grid (10 cards)
│       ├── Showcase.tsx      # Single responsive live profile card + theme selector grid, reuses SampleProfilePreview
│       ├── SampleProfilePreview.tsx # Reusable locally-editable sample profile (name/bio/links/appearance/background/layout) — used by landing Showcase and admin Theming preview; renders FxOverlay for the selected theme effect
│       ├── GlobalThemeOverlay.tsx # Landing FX + background overlay: fetches /api/theming/active and renders the active theme's animated FX effect and fixed backgroundImage across the landing page
│       ├── Pricing.tsx       # 3-tier pricing
│       ├── FAQ.tsx           # Accordion FAQ (6 questions)
│       └── Footer.tsx        # Footer with links, social, version badge (UpdateDialog)
├── pages/
│   ├── Login.tsx         # Multi-step login (identifier → passwordless/password → 2FA, email unlock)
│   ├── Register.tsx      # Register form (invite code required)
│   ├── Unlock.tsx        # Email unlock link handler (/unlock?token=)
│   ├── Dashboard.tsx     # Profile editor (Profiles, Profile, Links, Appearance, Analytics, Email, Music, Tips, Shop, Purchases, Webhooks, Data, Discord, Invites, Domain, Security tabs) with multi-profile switcher
│   ├── AdminDashboard.tsx # Admin panel (Invite Codes, Users, Roles, Badges, Bans, Logs, Custom Domains, Theming tabs, profile editing modal, tier control, Unlock account actions) — Updates button + auto-popup dialog, high-security ops disabled during update lockdown
│   ├── admin/AdminInvitePurchaseCard.tsx # Admin Invite Codes → paid credits card (store switch, packs, resale mode, pay-by-hand instructions, orders)
│   ├── admin/AdminPolicyTab.tsx # Admin Legal tab (versions, pending counts, note editor, manual notice, auto-accept state)
│   ├── admin/SeasonalThemesTab.tsx # Admin Theming tab (global toggles, theme CRUD/editing, override, effect + layout + background selectors, background upload, live per-theme preview via SampleProfilePreview)
│   ├── PublicProfile.tsx # Themed public profile page (/:username, includes MusicPlayer + Discord presence widget + TipBlock when tips enabled + ShopBlock when products exist; seasonal theme overlay applied; custom-domain host-aware canonical/OG via useDomain)
│   ├── InviteStore.tsx   # Public invite storefront (/invites, accepts ?email= to prefill the delivery address)
│   ├── InvitePurchaseStatus.tsx # Guest order status + code claim (/invites/purchased/:orderId)
│   ├── ApiDocs.tsx       # In-app API reference (/api-docs, renders /api/openapi.json)
│   ├── Privacy.tsx       # Privacy Policy page (/privacy)
│   └── Terms.tsx         # Terms of Service page (/terms)
```

## Shared Package

```
packages/shared/src/
├── index.ts              # Public exports
├── types/user.ts         # User, Role, ApiResponse
└── storage/              # StorageProvider interface + local stub
```

## Configuration

```
docker-compose.yml    # Service orchestration (postgres, backend, frontend, nginx profile) — builds from source
docker-compose.prebuilt.yml # Prebuilt images variant — pulls from Docker Hub / GHCR instead of building
apps/frontend/public/env.js    # Runtime config stub overwritten by the container entrypoint
scripts/bioplatform.sh / .ps1   # Host wrappers: docker compose exec backend bioplatform <args> (Linux/macOS + Windows)
pnpm-workspace.yaml   # Workspace + pnpm config (allowBuilds, nodeLinker)
.env / .env.example   # Environment variables
nginx/nginx.conf      # Reverse proxy config (/api, /uploads, ACME challenge, SPA fallback, custom-domains.conf include, app-host map)
nginx/site.conf       # Server block (ACME challenge proxy, bot root rule, social-crawler OG proxying, security headers)
nginx/entrypoint.sh   # Startup: real-IP conf, HSTS, backend-managed custom-domains.conf watch + reload, app-host map
```

## Documentation

```
AGENTS.md         # AI agent instructions
PROJECT_MAP.md    # This file
DECISIONS.md      # Architecture decisions
TASKS.md          # Task tracking
PROMPTS.md        # Reusable AI prompts
CHANGELOG.md      # Version history (Keep a Changelog format)
SECURITY.md       # Security policy and reporting guidelines
README.md         # Human documentation (English)
README.es.md      # Human documentation (Spanish)
docs/en/          # English docs (getting-started, environment-variables, configuration, deployment, building, user-guide, admin-guide, contributing, api)
docs/es/          # Spanish docs (same files as docs/en)
docs/migrations/  # Raw SQL migration files (applied manually after updates)
```
