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
        <p className="text-sm text-zinc-500 mb-8">Last updated: September 1, 2026</p>

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
              {branding.name} uses essential cookies for authentication, session management, and analytics. We set a single analytics cookie (<code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs">bp_vid</code>) to distinguish unique visitors. This cookie is anonymous — it contains no personal information and is used solely to count unique profile views and link clicks. We do not use third-party tracking cookies or analytics services that track you across websites.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5a. Analytics Data</h2>
            <p className="text-zinc-400">
              Profile owners can view aggregated analytics for their public profiles, including total and unique views, link clicks, referrer URLs, and browser types. This data is derived from IP addresses, user-agent strings, and the <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-300 text-xs">bp_vid</code> cookie. Individual visitor identities are never exposed — analytics are shown only as aggregate counts and trends. All analytics data is retained for 90 days and then automatically deleted.
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
            <h2 className="text-xl font-semibold text-white mb-3">6. Data Retention</h2>
            <p className="text-zinc-400">
              We retain your account data for as long as your account is active. Analytics data (page views and link clicks) is automatically deleted after 90 days. Authentication failure logs (IP addresses, hashed user-agent strings, browser fingerprints) are retained for up to 30 days and then automatically deleted. Custom domain TLS certificates are retained until renewed or the domain is removed. You may request account deletion by contacting us. Upon deletion, your personal data will be removed from our active systems, though some data may be retained in backups for a limited period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Your Rights</h2>
            <p className="text-zinc-400">
              You have the right to access, update, or delete your personal information at any time through your dashboard. You may also export your data or request complete account deletion by contacting us. Through your dashboard you can manage your registered passkeys, two-factor authentication settings, linked Discord account, webhook configurations, and custom domains.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Changes to This Policy</h2>
            <p className="text-zinc-400">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the &quot;Last updated&quot; date.
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
