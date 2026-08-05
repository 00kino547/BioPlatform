# User Guide

Everything you need to know to use your BioPlatform account: your profile page, links, music, security (2FA and passkeys), analytics, and what to do if you get locked out.

## Your Profile Page

Your profile lives at `/@username` (or `/username`) and is generated from your Dashboard → **Profile** tab:

- **Display name, bio, location, website** — shown on your public page.
- **Avatar & banner** — uploaded images (5 MB max per upload).
- **Social links** — pick a platform from the list (GitHub, X, YouTube, Twitch, Discord, TikTok, Instagram, Facebook, LinkedIn, Spotify, Email, and more). URLs are validated; email links get `mailto:` automatically. Discord usernames must use the new format (no discriminator), or paste a server invite link.
- **Public toggle** — when off, only you (when signed in) can see your page.

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

## Analytics

The **Analytics** tab shows views and link clicks over time, with total vs. unique counts. Your own visits are not counted.

## I'm locked out — what now?

After **3 failed attempts**, the system locks the affected IP, browser (cookie/user-agent) and your account to stop brute-force attacks. By default the lock is permanent and applies to an attacker's combination; the exact behavior depends on the instance's `AUTH_LOCK_POLICY`:

- **trusted_ip (default)** — if you are locked out, try again from the IP you registered with or your usual last login IP: signing in from there works and resets the counters.
- **email** — the login screen will tell you to check your email. Open the unlock link (valid for `AUTH_UNLOCK_TOKEN_TTL_MINUTES`, default 30 minutes) and sign in again.
- **block** — nobody can sign in to a locked account until an admin unlocks it.

If none of the above helps, contact the instance administrator — they can unlock your account from the admin panel (see the [Admin Guide](./admin-guide.md)).

> The lock triggers on repeated *wrong* attempts. Double-check your password, avoid retrying quickly, and use the "Forgot password"/change-password flow instead of guessing.

---

← [Configuration](./configuration.md) · [Admin Guide](./admin-guide.md) →
