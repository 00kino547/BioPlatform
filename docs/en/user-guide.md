# User Guide

Everything you need to know to use your BioPlatform account: your profile page, links, music, security (2FA and passkeys), analytics, and what to do if you get locked out.

## Your Profile Page

Your profile lives at `/@username` (or `/username`) and is generated from your Dashboard → **Profile** tab:

- **Display name, bio, location, website** — shown on your public page.
- **Avatar & banner** — uploaded images (5 MB max per upload).
- **Social links** — pick a platform from the list (GitHub, X, YouTube, Twitch, Discord, TikTok, Instagram, Facebook, LinkedIn, Spotify, Email, GitLab, Reddit, Pinterest, Snapchat, Threads, Bluesky, Mastodon, WhatsApp, Telegram, Signal, Kick, Steam, SoundCloud, and more). URLs are validated; email links get `mailto:` automatically. Discord usernames must use the new format (no discriminator), or paste a server invite link.
- **Public toggle** — when off, only you (when signed in) can see your page.

## Multiple Profiles & Aliases

The **Profiles** tab manages every page in your account:

- **Create a profile** — enter a lowercase slug (e.g. `gaming`) and click **Create Profile**. Each profile has its own slug, links, music, theme, and public/private toggle. Free accounts get 1 profile; higher tiers raise the limit.
- **Set primary** — the primary profile is the account's default. Its slug is fixed to your username; use aliases to give it extra short URLs.
- **Aliases** — every profile can have extra short URLs that resolve to the same page (e.g. `/bio` pointing at your main profile). Tier limits apply. Aliases make it easy to share a short, memorable link to a specific profile.
- **Badges** — show badges on a profile page as colored icons (each badge has its own color and icon). Badges come from the set admins assign to your account; you toggle which ones appear per profile. Badges you don't own yet are shown greyed out with a lock and can't be toggled until an admin grants them. In the **Appearance** tab you can drag badges to set their display order; badges earned later appear after the ordered ones.
- **Delete a profile** — any profile can be deleted. If you delete the primary profile, primary status moves to your oldest remaining profile; the last profile in the account is protected.

The header selector switches which profile the other tabs (Profile, Links, Appearance, Analytics, Email, Music, Discord, Data) are editing, and **View Profile** opens the currently selected one.

## Links & Music

- **Links tab** — add the buttons shown on your profile.
- **Music tab** — attach a local audio file, or a Spotify/YouTube embed. Free accounts get a limited number of tracks; higher tiers raise the limit.

## Appearance

The **Appearance** tab lets you pick one of the built-in themes (Midnight, Ocean, Sunset, Forest, Lavender, Rose, Arctic, Minimal). Your choice is stored on your profile and shown to visitors.

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

### Change your password

Use **Change password** in the Security tab (or the backend `POST /auth/change-password` flow). Choose a strong, unique password — never reuse one from another site.

## Email Notifications

The **Email** tab lets you toggle notifications when your profile gets a new view or a link is clicked. These only work when the instance has SMTP configured.

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

## Invites

The **Invites** tab is where you manage registration codes and any invite credits you hold:

- **Event allowance** — if the instance runs an invite event, you receive an allowance (a number of invites) that expires on a set date. Each invite you generate from it counts against the allowance.
- **Role quota** — if your role is allowed to generate invites, the tab shows your per-batch limit and cooldown. Every account's ability to generate is controlled by the instance; if it's off, the tab tells you.
- **Generate** — pick how many codes and an expiry in days (between the role's min and max, and no later than your allowance expiry). Leave the expiry blank for the default. After a cooldown window, you can generate again.
- **Refunds** — an event code that expires unused *before* your allowance does is refunded: the credit returns to your allowance on your next visit to the tab, so nothing is wasted.

Codes you no longer need can be **revoked** (except once they've been used). If you were banned from invites by an admin, the tab shows a notice and you can no longer generate or receive allowance.

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
