import { Link } from "react-router-dom";
import { branding } from "@/config/branding";
import { usePageMeta } from "@/lib/seo";
import { AppFooter } from "@/components/layout/AppFooter";

export function Privacy() {
  usePageMeta({ title: "Privacy Policy", description: `Read how ${branding.name} collects, uses, and protects your data.`, url: "/privacy" });
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-zinc-800/80 bg-zinc-900/30">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <Link to="/" className="text-lg font-bold text-white tracking-tight">
            {branding.name}
          </Link>
          <Link to="/" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-zinc-500 mb-8">Last updated: September 30, 2026</p>

        <div className="prose prose-invert prose-zinc max-w-none space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Information We Collect</h2>
            <p className="text-zinc-400">
              When you create an account on {branding.name}, we collect your email address, username, and password (stored as a bcrypt hash). We also store any profile information you choose to provide, including display name, bio, avatar, banner, location, website, social links, theme preferences, and profile badges.
            </p>
            <p className="text-zinc-400 mt-2">
              For security and abuse prevention, we record your IP address at registration and your most recent login IP address. Failed authentication attempts are logged with your IP address, a hash of your browser user-agent string, and an anonymous browser fingerprint cookie. These logs are retained for up to 30 days and then automatically deleted.
            </p>
            <p className="text-zinc-400 mt-2">
              If you enable passkey (WebAuthn) login, we store the public key and credential identifier for each registered passkey. If you enable two-factor authentication using an authenticator app, we store your TOTP secret encrypted at rest. Neither passkey private keys nor TOTP secrets are ever stored.
            </p>
            <p className="text-zinc-400 mt-2">
              To verify that a registered passkey is genuinely discoverable (resident), we store the timestamp of its most recent successful discoverable sign-in. This verification mark is refreshed only by an actual passkey sign-in and expires after a fixed number of days (14 by default) without one; it is used exclusively by account administrators to review account security and is never shown on your public profile.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. How We Use Your Information</h2>
            <p className="text-zinc-400">
              We use your information to provide and maintain the {branding.name} service, to personalize your experience, and to communicate with you about your account. We do not sell, trade, or otherwise transfer your personal information to third parties.
            </p>
            <p className="text-zinc-400 mt-2">
              IP addresses and authentication logs are used solely for security purposes: to detect and prevent brute-force attacks, to evaluate login trust, and to enforce temporary account lockouts when repeated failures are detected.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Data Storage and Security</h2>
            <p className="text-zinc-400">
              Your data is stored on servers operated by us or our hosting providers. We implement industry-standard security measures including bcrypt password hashing, JWT authentication, encrypted storage of sensitive credentials (TOTP secrets, passkey data, webhook URLs, Discord tokens), and HTTPS encryption. However, no method of electronic transmission or storage is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. File Uploads</h2>
            <p className="text-zinc-400">
              Avatar and banner images you upload are stored on our servers. If you upload audio for music tracks on your profile, those files are also stored on our servers and streamed to visitors when played. You may delete your uploads at any time through your dashboard. We validate file types and enforce size limits to maintain platform security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Cookies and Tracking</h2>
            <p className="text-zinc-400">
              {branding.name} uses two categories of cookies:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1.5 text-zinc-400">
              <li>
                <span className="font-medium text-zinc-300">Essential cookies</span> (always active, no consent needed): the authentication session cookie and a browser fingerprint cookie used to protect against brute-force attacks and rate-limit abuse. These are required for the service to function securely and are set automatically.
              </li>
              <li>
                <span className="font-medium text-zinc-300">Non-essential analytics cookie</span> (<code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs">bp_vid</code>): a single anonymous cookie used to distinguish unique visitors and count unique profile views and link clicks. It contains no personal information. This cookie is set only after you explicitly accept non-essential cookies via the consent banner.
              </li>
            </ul>
            <p className="text-zinc-400 mt-4">
              When you first visit, a consent banner lets you choose &quot;Accept all&quot; (enables the analytics cookie) or &quot;Essential only&quot;. When the banner first appears, the &quot;Essential only&quot; option becomes selectable after a short countdown, so accepting non-essential cookies cannot happen accidentally. You can change your choice at any time through the &quot;Cookie settings&quot; link on the site or by clearing cookies.
            </p>
            <p className="text-zinc-400 mt-4">
              We honor browser-level privacy signals: if your browser sends the Do Not Track header (<code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs">DNT: 1</code>) or Global Privacy Control (<code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs">Sec-GPC: 1</code>), no analytics cookies are set and no non-essential analytics run at all — even if you previously accepted. This preference always takes precedence over any stored choice.
            </p>
            <p className="text-zinc-400 mt-2">
              We do not use third-party advertising cookies or analytics services that track you across websites.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5a. Analytics Data</h2>
            <p className="text-zinc-400">
              Profile owners can view aggregated analytics for their public profiles, including total and unique views, link clicks, referrer URLs, and browser types. This data is derived from IP addresses, user-agent strings, and the <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs">bp_vid</code> cookie, which is only set for visitors who accepted non-essential cookies. Individual visitor identities are never exposed — analytics are shown only as aggregate counts and trends. All analytics data is retained for 90 days and then automatically deleted.
            </p>
            <p className="text-zinc-400 mt-2">
              The instance operator may optionally enable a self-hosted web analytics service (Matomo) to measure site traffic. If enabled, it is loaded on our own infrastructure — your data is not shared with external analytics providers. Matomo&rsquo;s scripts and cookies are only loaded after you accept non-essential cookies and are never loaded for visitors who use Do Not Track or Global Privacy Control. The same consent choice governs both the aggregate analytics described above and any Matomo measurements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5b. Third-Party Embedded Content</h2>
            <p className="text-zinc-400">
              Profiles may embed music from third-party providers such as Spotify and YouTube. YouTube embeds use the privacy-enhanced <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs">youtube-nocookie.com</code> domain, which does not set tracking cookies on your visit. Spotify and other providers set their own cookies in the embedded player; those providers operate under their own privacy policies, which we do not control. We are not responsible for the privacy practices of third-party platforms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5c. Discord Integration</h2>
            <p className="text-zinc-400">
              When you connect a Discord account, {branding.name} receives from Discord only the data granted by the OAuth <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs">identify</code> scope: your Discord user ID, username, global name, and avatar. The access and refresh tokens are stored encrypted and are used solely to keep your account link valid. Connecting is optional and always opt-in.
            </p>
            <p className="text-zinc-400 mt-2">
              Live presence (online status, current activity, custom status) is shown only when the instance operator has enabled it with a Discord bot and you have explicitly turned on presence sharing for a profile. The bot observes presence only for users who are in a server shared with it; if you never enable presence sharing, your status is never read or displayed. Presence data is held in memory and is not retained.
            </p>
            <p className="text-zinc-400 mt-2">
              The optional &quot;Post to Discord&quot; feature sends a profile embed (display name, profile link, avatar, bio, and — when enabled — your current status) to a webhook URL you provide. Webhook URLs are stored encrypted. Discord is a third party and operates under its own privacy policy, which we do not control.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5d. Webhooks and Integrations</h2>
            <p className="text-zinc-400">
              You may configure outgoing webhooks to receive notifications about profile events (views, link clicks, etc.) on endpoints you provide. Webhook URLs and secrets are stored encrypted and are used only to deliver the events you request. You are responsible for the privacy practices of the endpoints you configure — we do not control how third-party webhook receivers handle the data they receive.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5e. Custom Domains and TLS</h2>
            <p className="text-zinc-400">
              If you configure a custom domain for your profile, the domain name and a verification token are stored to confirm ownership. When automatic TLS (HTTPS) is enabled, {branding.name} obtains and stores Let&rsquo;s Encrypt TLS certificates and the associated account key on the server to enable encrypted connections for your domain. Certificate data is used solely to serve your profile over HTTPS and is renewed automatically before expiry.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5f. Version Checking</h2>
            <p className="text-zinc-400">
              {branding.name} periodically checks for available software updates by fetching the project&rsquo;s public CHANGELOG from GitHub (via <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs">raw.githubusercontent.com</code>, the GitHub API, and <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs">cdn.jsdelivr.net</code>). No personal information is transmitted in these requests — only the public repository URL is used. The check runs in the background on the server at startup and every 12 hours; the result is cached and served to all visitors to display the current version badge. This feature can be disabled by the instance operator.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5g. Email Notifications</h2>
            <p className="text-zinc-400">
              If you opt in to email notifications for profile activity, we use the email address on your account to send you a digest when your profile receives views or link clicks. Notifications are only sent while the relevant setting is enabled and are rate-limited to avoid excessive email volume; you can disable them at any time from your settings. We may also send important account or security notices (for example, account recovery) using the email address on your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5h. Newsletter</h2>
            <p className="text-zinc-400">
              Public profiles may offer a newsletter. Subscribing is always an explicit, single opt-in: you voluntarily enter your email address and tick a checkbox agreeing to these Terms and the Privacy Policy. Subscribing never happens silently.
            </p>
            <p className="text-zinc-400 mt-2">
              When you subscribe we store your email address, the time you subscribed, the time you agreed, the versions of these Terms and the Privacy Policy you agreed to, and whether you have unsubscribed. The IP address and browser user-agent captured to evidence consent are kept only in memory for 24 hours and are never written to the database. Your email address is used solely for the newsletters of the profile you subscribed to and is never shared with third parties.
            </p>
            <p className="text-zinc-400 mt-2">
              Every newsletter we send identifies {branding.name} or the sender, includes a physical postal address (or a link to our website when none is set), and provides a clear, one-click unsubscribe link. Unsubscribe requests are honored immediately and in all cases within 10 business days, as required by the US CAN-SPAM Act and Canada&rsquo;s Anti-Spam Legislation (CASL). After unsubscribing you will receive no further newsletters and can resubscribe at any time.
            </p>
            <p className="text-zinc-400 mt-2">
              Newsletter sending is subject to per-profile and per-tier volume limits configured by the instance operator; a paused or disabled newsletter profile never sends mail, even to existing subscribers.
            </p>
            <p className="text-zinc-400 mt-2">
              A profile owner may choose to send through their own SMTP relay instead of {branding.name}&rsquo;s mail stack. In that case the owner provides the relay host and credentials; the SMTP password is encrypted at rest (AES-256-GCM) and used only to deliver that profile&rsquo;s newsletter. It is never returned in API responses and is never shared with third parties. Subscriber email addresses are transmitted to that relay solely to deliver the newsletter the subscriber opted into.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5j. Product Shop</h2>
            <p className="text-zinc-400">
              Public profiles may offer digital products for sale. To fulfil a purchase we store the product&rsquo;s title, description and price, the buyer&rsquo;s email address, the purchase status and a payment-gateway transaction reference, and we send the buyer to the configured payment provider (for example Stripe, PayPal, or a cryptocurrency gateway) whose own privacy policy governs the payment. We do not store card or wallet credentials. Download links are signed and time-limited.
            </p>
            <p className="text-zinc-400 mt-2">
              If you buy without signing in, you are identified only by the email address you provide so the download link can be delivered to you; that address is used solely to fulfil and support the purchase.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5i. Tips</h2>
            <p className="text-zinc-400">
              Public profiles may offer cryptocurrency tips (Bitcoin or Litecoin). Tipping is always voluntary: you choose the amount and may include an optional name and message that are shown to the profile owner. Wallet addresses are provided by the profile owner and payments are sent directly to their wallet (or through a BTCPay checkout where the instance is configured with BTCPay). We do not process or store the coins themselves; when BTCPay is configured, the payment provider and the profile owner receive applicable payment data and a tip may be marked as confirmed.
            </p>
            <p className="text-zinc-400 mt-2">
              The owner may disable tips at any time (which also hides their wallet addresses), and may delete any tip record from their dashboard.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Data Retention</h2>
            <p className="text-zinc-400">
              We retain your account data for as long as your account is active. Analytics data (page views and link clicks) is automatically deleted after 90 days. Authentication failure logs (IP addresses, hashed user-agent strings, browser fingerprints) are retained for up to 30 days and then automatically deleted. Newsletter subscription records are retained only while the profile runs a newsletter and you remain subscribed; they are deleted when you unsubscribe, when the profile owner erases them, or when the account is deleted. Product purchase records are retained to honour refunds, download access and accounting obligations. Custom domain TLS certificates are retained until renewed or the domain is removed. You may request account deletion by contacting us. Upon deletion, your personal data will be removed from our active systems, though some data may be retained in backups for a limited period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Your Rights</h2>
            <p className="text-zinc-400">
              You have the right to access, update, or delete your personal information at any time through your dashboard. You may also export your data or request complete account deletion by contacting us. Through your dashboard you can manage your registered passkeys, two-factor authentication settings, linked Discord account, webhook configurations, and custom domains. If you subscribed to a newsletter, the profile owner may remove your subscription and you may unsubscribe at any time with one click from any newsletter email; you may also request that your consent records be erased.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Changes to This Policy</h2>
            <p className="text-zinc-400">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the &quot;Last updated&quot; date.
            </p>
            <p className="text-zinc-400 mt-2">
              Taking effect on <span className="text-white">September 30, 2026</span>, if we publish a revised version of this Privacy Policy (or the Terms of Service) and you continue to use {branding.name} without checking or reading the updated version for more than thirty (30) days after that version&rsquo;s effective date, you will be deemed to have accepted the updated version. Your original, pinned acceptance remains on record and is never overwritten; continued use for more than 30 days after the new version&rsquo;s effective date is treated as acceptance of the updated policy for consent-status purposes, based on your last login being at least 30 days after that effective date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Contact</h2>
            <p className="text-zinc-400">
              If you have questions about this Privacy Policy, please{" "}
              <a href={branding.contactUrl} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 transition-colors">
                contact us
              </a>.
            </p>
          </section>
        </div>
      </main>

      <AppFooter />
    </div>
  );
}
