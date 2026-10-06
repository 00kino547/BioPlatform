# User Guide

Everything you need to know to use your BioPlatform account: your profile page, links, music, security (2FA and passkeys), analytics, and what to do if you get locked out.

## Your Profile Page

Your profile lives at `/@username` (or `/username`) and is generated from your Dashboard → **Profile** tab:

- **Display name, bio, location, website** — shown on your public page.
- **Avatar & banner** — uploaded images (5 MB max per upload).
- **Social links** — pick a platform from the list (GitHub, X, YouTube, Twitch, Discord, TikTok, Instagram, Facebook, LinkedIn, Spotify, Email, GitLab, Reddit, Pinterest, Snapchat, Threads, Bluesky, Mastodon, WhatsApp, Telegram, Signal, Kick, Steam, SoundCloud, and more). URLs are validated; email links get `mailto:` automatically. Discord usernames must use the new format (no discriminator), or paste a server invite link.
- **Status** — a static status you can show on your public page: **Online**, **Away**, or **Offline** (pick "hidden" to turn it off). It renders as a small colored dot + label ("Online" green, "Away" amber, "Offline" grey).
- **Countdown** — an optional countdown block for your page: a short label (e.g. "Launch in") and a target date/time. Visitors see a live ticking counter (days/hrs/min/sec) that flips to **Done** once the target passes. Leave the date empty to remove the countdown.
- **Public toggle** — when off, only you (when signed in) can see your page.
- **Your @username** — Dashboard → **Profile** → *Your @username* lets you rename your account handle. Enter the new name (3-32 chars: lowercase letters, numbers, `_`, `-`) and see a live availability verdict as you type. Saving moves the handle **and** your main profile URL to the new name in a single step; every link to your old address keeps working thanks to an automatic redirect alias, and you can rename again only **once every 30 days**.

## Multiple Profiles & Aliases

The **Profiles** tab manages every page in your account:

- **Create a profile** — enter a lowercase slug (e.g. `gaming`) and click **Create Profile**. Each profile has its own slug, links, music, theme, and public/private toggle. Free accounts get 1 profile; higher tiers raise the limit.
- **Set primary** — the primary profile is the account's default. Its slug is fixed to your username; use aliases to give it extra short URLs.
- **Aliases** — every profile can have extra short URLs that resolve to the same page (e.g. `/bio` pointing at your main profile). Tier limits apply. Aliases make it easy to share a short, memorable link to a specific profile.
- **Badges** — show badges on a profile page as colored icons (each badge has its own color and icon). Badges come from the set admins assign to your account; you toggle which ones appear per profile. Badges you don't own yet are shown greyed out with a lock and can't be toggled until an admin grants them. In the **Appearance** tab you can drag badges to set their display order; badges earned later appear after the ordered ones.
- **Delete a profile** — any profile can be deleted. If you delete the primary profile, primary status moves to your oldest remaining profile; the last profile in the account is protected.

The header selector switches which profile the other tabs (Profile, Links, Appearance, Analytics, Email, Music, Discord, Data) are editing, and **View Profile** opens the currently selected one.

## Links & Music

- **Links tab** — add the buttons shown on your profile. Each link can have a **Label** (display text), and — when the instance operator enables the features — a **Section heading** (groups it under a header on your profile), a **custom favicon** (an emoji or an uploaded image replaces the platform logo), and a **QR code**: one-click generate/download from the dashboard and an optional scannable QR rendered on your profile for that link.
- **Music tab** — attach a local audio file, or a Spotify/YouTube embed. Free accounts get a limited number of tracks; higher tiers raise the limit.

## Appearance

The **Appearance** tab lets you pick one of the built-in themes (Midnight, Ocean, Sunset, Forest, Lavender, Rose, Arctic, Minimal). Your choice is stored on your profile and shown to visitors.

### Layout

A **Layout** section lets you choose how your profile is arranged from thirteen presets:

- **Default** — a centered single column with standard link rows.
- **Grid** — links as a two-column grid of icon tiles.
- **Compact** — a tight single column with slimmer rows to fit more links above the fold.
- **Wide** — a wider card (up to the 5xl container) that spreads links across three columns.
- **Glassmorphism** — a translucent backdrop-blur glass card over your background.
- **Minimal** — a borderless, transparent card; over a background image a soft blur tones the card so text stays readable.
- **Sidebar** — content and links side by side on large screens (with a two-column link grid) instead of stacked vertically.
- **Editorial** — a centered, text-focused masthead with hairline-divider link rows.
- **Hero** — a bold centered profile with an accent gradient band at the top.
- **Bento** — a tiled box grid where your identity, bio and links each live in their own tile.
- **Terminal** — a developer-style terminal window with monospace type and a fully **interactive command line**. Visitors type real commands: `help`, `whoami`, `ls`, `cat whoami.txt`, `cat bio.txt`, `open <platform>` (opens that social link in a new tab; falls back to copying handles like Discord usernames), `date`, `echo <text>` and `clear`; up/down arrows recall past commands and a `Type "help"...` hint greets new visitors. Several fun easter eggs are hidden from `help` (e.g. `neofetch`, `sl`, `cmatrix`) — try them. **PRO and Enterprise** users can add up to 12 **custom commands** (each with an output line printed when the command is run, a short optional description shown in `help`, and an optional link target) from *Appearance → Terminal commands*, which appears when the terminal layout is selected; their commands are listed in `help` and `ls`. Both `links/` and `cmds/` are real sub-directories — visitors can run `ls links` or `ls cmds` (with or without the trailing slash) to list only that group. Built-in commands always win over custom ones.
- **Polaroid** — a subtly rotated paper card with a film-frame avatar.
- **Topbar** — a navbar-style horizontal header with divider rows below.

### Background

A **Background** section lets you set the background of your public profile. You can choose one of the built-in **gradient presets** (Midnight, Ocean, Sunset, Forest, Aurora, Royal, Mint, Candy, Ember, Ice, or none), one of the **seasonal presets** (Spring Blossom, Autumn Leaves, Winter Snow, Halloween, Christmas, New Year's Eve, Valentine's, St. Patrick's), add a **custom image URL**, or **upload** your own image or GIF (JPEG, PNG, WebP or GIF; up to 12 MB). Uploaded GIFs are served as-is and animate; still images are optimized automatically. A **Remove** button clears your custom background.

### Seasonal decorations

A **Seasonal Decorations** section in Appearance adds two toggle switches:

- **Seasonal decorations** (violet) — when on, the platform may apply an active seasonal or holiday theme (e.g. Christmas, Halloween) to your profile. While a theme is active it replaces your custom colors, layout and background entirely. If the operator has disabled the whole feature you can't enable it.
- **Always allow Christmas** (red) — opt in to keeping the Christmas theme even when the operator has turned seasonal theming off. This switch overrides the operator's global setting for you only.

## Security

Open Dashboard → **Security**. This is where you manage everything that protects your account.

### Two-factor authentication (authenticator app)

1. Click **Enable 2FA**.
2. Scan the QR code (or enter the secret) in an authenticator app such as Google Authenticator or Authy.
3. Enter the current 6-digit code to confirm.
4. From now on, signing in requires your password **plus** a fresh code from the app.

To disable 2FA, enter a valid code and click **Disable**.

### Passkeys (passcode / passwordless login)

A passkey lets you sign in with your device's fingerprint, Face ID, PIN, or security key — no password needed.

1. In the Security tab, start **Add Passkey**.
2. Give it a name (e.g. "Phone").
3. Choose the credential type:
   - **Resident (discoverable)** — lets you sign in from the login page by typing only your username/email and confirming with your device.
   - **Non-resident** — requires your username/email plus the device prompt.
4. Confirm with your device when the browser asks.

Your passkeys are listed below; you can remove one at any time. Passkeys can also be used as a second factor on top of your password.

### Social sign-in (SSO)

When the instance has one or more social providers configured (Google, GitHub, Discord), the Security tab shows a **Sign-in Options** card where you can:

- **Link a provider** — click **Link `provider`**, authorize with the service, and your account is connected. You can then sign in with that provider on future logins.
- **Unlink a provider** — remove a linked provider. You cannot remove your last sign-in method.
- **Skip 2FA on social sign-in** — when allowed by the instance, enable this toggle to log in instantly via a linked provider without entering a second-factor code.

During registration or login, you can also click **Continue with `provider`** to sign in with your social account. If your email already matches an existing account, the provider is linked automatically.

### Business SSO (Enterprise)

Social sign-in (Google, GitHub, Discord) is available on every plan. The **Business SSO** card in the Security tab is an **Enterprise** feature: it lets an Enterprise account holder connect a corporate single sign-on provider that speaks **OIDC** (Microsoft Entra ID, Okta, Keycloak, Google Workspace, Auth0, and other OpenID Connect 1.0 providers).

- **Connect a provider** — enter a provider name (**required**; shown on the sign-in page), the OIDC **issuer URL** or discovery document URL (the server appends `/.well-known/openid-configuration` automatically when needed), the application **client ID**, the **client secret** (required on first save, optional afterwards — it is stored encrypted and never shown again), an optional logo URL, and optional **allowed email domains** (comma separated; leave empty to allow any verified email the IdP returns).
- **The sign-in button** — once saved and enabled, “Continue with `<provider>`” appears on the login and register pages for everyone. When more than one business provider is published, they collapse into a single **Business SSO** menu that lists every provider (logo, name and host). A signed-in user whose IdP **verified email** matches an existing account is linked on first sign-in: new visitors without a matching account get a clear error instead of a new account, so team members are added via invites first.
- **Force SSO** — enable it to disable password and social sign-in **for your own account**, so that account can only log in through the corporate provider.
- **Test & manage** — **Test sign-in** runs the full flow, **Link this account** connects your own account, and the identity list lets you see and unlink every account that has signed in through your provider. **Remove provider** deletes the configuration and all of its identities.

Users on other plans never see enterprise SSO management; the provider buttons they see on the sign-in page come only from providers that an Enterprise account has published.

### Change your password

Use **Change password** in the Security tab (or the backend `POST /auth/change-password` flow). Choose a strong, unique password — never reuse one from another site.

## Email Notifications

The **Email** tab lets you toggle notifications when your profile gets a new view or a link is clicked. These only work when the instance has SMTP configured.

The **Email** tab also hosts the **Newsletter** manager (only shown once the instance operator has enabled newsletter emails). There you can:

- **Settings** — toggle the newsletter on (enable sending), show the subscribe box on your public profile, and set a custom heading. Turning the switch off **pauses** the newsletter: the subscribe form stays up and new subscribers are still captured, but sending is blocked until you turn it back on. On a profile that has never been enabled, no subscribe form is shown at all.
- **Subscribers** — see who subscribed (and when, with which policy versions they agreed to) and erase a subscriber record, which complies with GDPR right-to-erasure requests.
- **Send newsletter** — compose the subject and body and send to all active subscribers. Sending is rate-limited per plan (e.g. FREE accounts cannot send; PRO allows one send per 24 h by default; an admin can change these limits). A guide box reminds you that subscribers are people to whom you must not spam.
- **History** — every send is recorded with recipient and success counts.

When you subscribe to someone&rsquo;s newsletter from their public profile, you type your email, tick the box agreeing to the Terms and Privacy Policy, and you&rsquo;re in. You can unsubscribe at any time with the one-click link in every newsletter email (and it also works by visiting that link directly); after unsubscribing, the profile stops sending to you and can&rsquo;t mail you again unless you subscribe afresh.

The **Email** tab also lets you control **platform announcements**. When you create an account, the registration form requires a single tick accepting the Terms of Service and Privacy Policy before the account is created (your acceptance is stored on the account, together with the policy versions you agreed to). A second, **optional** box opts you in to platform announcements — occasional news and product updates the instance operator sends to every opted-in user at once. You can flip that preference on or off at any time with the **Platform announcements** toggle in this tab, and every announcement email includes its own one-click unsubscribe link that applies to your whole account.

## Tips

The **Tips** tab lets you accept cryptocurrency tips (Bitcoin and Litecoin) on a profile.

- **Settings** — enable tips, choose a heading, and add one or both wallet addresses (Bitcoin `1…` / `3…` / `bc1…`, Litecoin `L…` / `M…` / `ltc1…`). While tips are off, no tip block appears on your public profile and your addresses stay hidden; only once you enable tips with at least one address set does the public tip block show up.
- **Overview** — the recorded tip ledger: how much has been received in each coin (the **recorded** amount is every tip intent; the **confirmed** amount is payments actually settled through BTCPay when the instance has it configured), plus the 50 most recent tips. You can delete a tip record at any time.

For your visitors the block opens a small dialog: they pick a coin, choose a preset amount or type their own, optionally add a name and message, and either pay through the BTCPay checkout (when the instance is configured with BTCPay) or scan the wallet QR code / copy the address and send the coins on-chain to you. Recorded-but-unconfirmed tips are how you reconcile payments that arrive directly in your own wallet.

## Shop

The **Shop** tab lets you sell digital products on a profile. Each profile carries a product list (up to **3 products on FREE**, unlimited on PRO/Enterprise) and a storefront block is rendered on your public profile with the products you enable.

- **Add a product** — upload the deliverable file (capped by `PRODUCT_FILE_MAX_MB`, default 50 MB) and give it a title (max 80 characters) and an optional description (max 500). The price is per product and set in currency units: `0` makes the product **free**. A product can optionally show a **preview image** on its card (JPEG/PNG/GIF/WebP, up to 5 MB) so visitors get a sense of what they are buying before paying.
- **Profile discount** — a percentage (`0–100`) applied to every product price on the profile. The public card and the checkout always show the discounted price server-side, with the original price crossed out.
- **Manage products** — each product row shows an enable/disable toggle (disabled products disappear from the public shop), a preview-image reload button and a delete action (deleting removes the deliverable file and the preview permanently). Buyer traffic is visible in the **Recent sales** table below (product, masked buyer email like `a***@domain`, payment method, status, amount and date; refunds are handled per instance gateway).
- **Buying side** — visitors open a product card and pick a payment method (card, PayPal or crypto when the instance has them enabled), a coin for crypto, and enter an email address. Paid purchases redirect to the gateway checkout, wait for confirmation and deliver the download link to that email; free products are delivered immediately in the same dialog. Logged-in buyers also see a **Purchases** tab in the dashboard where they can re-download anything they paid for.

The price and discount math always happens on the server: what you see in the dashboard and the storefront is always the authoritative discounted price.

## Discord

The **Discord** tab (only present when the instance has configured Discord) lets you:

- **Connect your account** — authorizes with Discord (scope `identify`, consent required). Connecting is optional and always opt-in.
- **Show presence on your profile** — when enabled, visitors see a live status card (online/idle/dnd/offline, current activity, current song, custom status) on your public page and in shared link previews (OpenGraph image). Nothing is shown until you turn this on. Live presence comes from an instance bot, so you must be in a server that shares the bot and the instance must set `DISCORD_BOT_TOKEN`.
- **Show activity details** — separately controls whether activity details (games, Spotify, custom status) appear; the online status itself is always shown once presence sharing is on.
- **Join presence hub** — if the instance publishes a server invite (`DISCORD_GUILD_INVITE`), a "Join presence hub" button opens it so you can join the server where the presence bot lives and start sharing your status.
- **Invite the bot to your server** — alternatively, a "Invite the bot to your server" button opens Discord's bot-invite flow for the instance bot (`DISCORD_CLIENT_ID`). You can add the bot to any server you manage, so presence works without joining a shared hub. The bot works in any number of servers.
- **Post to Discord** — paste a webhook URL (channel → Integrations → Webhooks) to get a "Post to Discord" button that shares a rich embed with your profile link, avatar, bio, and current status.

**Privacy:** no presence data is collected or stored server-side beyond the encrypted OAuth tokens; presence is read live by a single shared bot and cached in memory only. A user who never connects or opts in is never tracked.

## Analytics

The **Analytics** tab shows views and link clicks over time, with total vs. unique counts. Your own visits are not counted.

- **24-hour timeline** — views and clicks broken into hourly buckets for the last 24 hours.
- **Clicks by link** — a per-link breakdown (click count, unique visitors, last click time) for the last 30 days, matched by link label. Each row has a **Reset** button that clears only that link's click history.
- **Reset all** — a toolbar button clears every click record for the profile. Page views are never deleted.

The per-link breakdown and the reset buttons are limited to premium (PRO/Enterprise) accounts; free accounts see the aggregate stats without them.

## Invites

The **Invites** tab is where you manage registration codes and any invite credits you hold:

- **Event allowance** — if the instance runs an invite event, you receive an allowance (a number of invites) that expires on a set date. Each invite you generate from it counts against the allowance.
- **Role quota** — if your role is allowed to generate invites, the tab shows your per-batch limit and cooldown. Every account's ability to generate is controlled by the instance; if it's off, the tab tells you.
- **Generate** — pick how many codes and an expiry in days (between the role's min and max, and no later than your allowance expiry). Leave the expiry blank for the default. After a cooldown window, you can generate again.
- **Refunds** — an event code that expires unused *before* your allowance does is refunded: the credit returns to your allowance on your next visit to the tab, so nothing is wasted.
- **Shareable invite links** — every code can be shared as `/invite/<code>`, a public landing page that shows who invited you and any invitee discount, with a button that pre-fills the registration form for the visitor. Codes resolve to a 404 unless they are valid, unused, and unexpired.

Codes you no longer need can be **revoked** (except once they've been used). If you were banned from invites by an admin, the tab shows a notice and you can no longer generate or receive allowance.

## Billing

The **Billing** tab shows your current plan, your effective discount, the available plans and your order history:

- **Plans** — the Free, Premium (PRO) and Enterprise prices are set by the instance owner (in the environment configuration) and shown here with your discount already applied. Your discount is computed automatically from the affiliate program: the larger of your referrer milestone discount and the flat invitee discount (if you joined through someone's invite).
- **Upgrade** — choose a plan above your current one and a payment method. If the instance owner enabled online payments you can check out with **Card** (Stripe), **PayPal** or **Crypto** — a payment session opens in a new tab, and as soon as the provider confirms it your account is upgraded automatically. Otherwise (or by choosing **Contact owner**) you create a **PENDING** manual order with an optional note ("I'd like to pay by bank transfer", contact info, etc.), and the platform owner handles the rest. The owner's configured contact method (for example email, Telegram or Discord) is shown so you can arrange the payment directly. If a crypto price is quoted, you also see the exact coin amount and the USD rate used.
- **Order history** — every order you place appears here with its status (Pending / Paid / Cancelled / Refunded), the price you were charged and any note the owner left. An order that still has a pending online payment shows a **Pay now** button that reopens its checkout page.

Once the owner marks an order **Paid** in the admin panel — or an online payment webhook confirms it — your account is upgraded to the ordered plan automatically. Refunds are recorded in your history but never remove a plan you already have.

> The public pricing section on the landing page shows the same environment-configured prices, and its Premium button sends logged-in users straight to this tab.

## Custom Domains

The **Domain** tab (available on PRO/Enterprise accounts whose role has the `profiles.customDomain` permission) lets you put your own domain in front of your profile:

1. **Request** — enter a plain hostname like `example.com` (no `https://`, path, port, or `www.`). One custom domain per profile.
2. **Verify ownership** — add a TXT record to your DNS provider: record name `_bioplatform.example.com` with the exact value shown. DNS can take a few minutes to propagate; click **Verify now** once added.
3. **Approval** — after the TXT check passes, an administrator reviews and activates your domain. Until then it stays **Verified · awaiting approval**.
4. **Use it** — once **Active**, your custom domain serves your profile. Choose what the root (`https://example.com/`) shows: the **landing page** (your profile stays at `/your-slug`) or one of your **public profiles** directly.

The root's OG preview (Discord/X/Telegram embeds) is server-rendered and points at your custom domain. Disconnecting removes the domain and frees it for reuse.

**DNS + TLS:** after activation, point your domain's `A`/`AAAA` records (or a `CNAME`) at the instance's tunnel/ingress. If the instance has automatic TLS enabled, a certificate is issued for you and the Domain tab shows "HTTPS certificate active" with its renewal date; otherwise an administrator installs one manually (see the [Deployment Guide](./deployment.md)). The profile redirects here only once the instance routes the domain to you.

> Note: a passkey is bound to the domain where you registered it — one added on the instance's main domain works there, and one added on your custom domain works on that custom domain.

## I'm locked out — what now?

After **3 failed attempts**, the system locks the affected IP, browser (cookie/user-agent) and your account to stop brute-force attacks. By default the lock is permanent and applies to an attacker's combination; the exact behavior depends on the instance's `AUTH_LOCK_POLICY`:

- **trusted_ip (default)** — if you are locked out, try again from the IP you registered with or your usual last login IP: signing in from there works and resets the counters.
- **email** — the login screen will tell you to check your email. Open the unlock link (valid for `AUTH_UNLOCK_TOKEN_TTL_MINUTES`, default 30 minutes) and sign in again.
- **block** — nobody can sign in to a locked account until an admin unlocks it.

If none of the above helps, contact the instance administrator — they can unlock your account from the admin panel (see the [Admin Guide](./admin-guide.md)).

> The lock triggers on repeated *wrong* attempts. Double-check your password, avoid retrying quickly, and use the "Forgot password"/change-password flow instead of guessing.

---

← [Configuration](./configuration.md) · [Admin Guide](./admin-guide.md) →
