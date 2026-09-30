import { Link } from "react-router-dom";
import { branding } from "@/config/branding";
import { usePageMeta } from "@/lib/seo";
import { AppFooter } from "@/components/layout/AppFooter";

export function Terms() {
  usePageMeta({ title: "Terms of Service", description: `Read the terms of service governing use of ${branding.name}.`, url: "/terms" });
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
        <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-sm text-zinc-500 mb-8">Last updated: September 30, 2026</p>

        <div className="prose prose-invert prose-zinc max-w-none space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p className="text-zinc-400">
              By accessing or using {branding.name}, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Account Registration</h2>
            <p className="text-zinc-400">
              {branding.name} is an invite-only platform. Accounts may only be created using a valid invite code. The instance operator reserves the right to revoke invite codes, restrict new account creation, or temporarily disable registration at any time.
            </p>
            <p className="text-zinc-400 mt-2">
              Repeated failed login attempts may result in a temporary IP-based lockout to prevent brute-force attacks. Users who attempt to bypass account security protections may have their access permanently restricted.
            </p>
            <p className="text-zinc-400 mt-2">
              You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. Enabling two-factor authentication and registering passkeys are recommended to protect your account.
            </p>
            <p className="text-zinc-400 mt-2">
              When enabled by the instance operator, registration and login may include a human-verification challenge (captcha) provided by a third party such as Cloudflare Turnstile, Google reCAPTCHA, or hCaptcha. The challenge token is validated by the provider&rsquo;s service; each provider operates under its own privacy policy. By completing a challenge you accept the provider&rsquo;s terms for the verification itself. The instance operator does not receive any personal data from the challenge beyond the verification result.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Acceptable Use</h2>
            <p className="text-zinc-400">
              You agree not to use {branding.name} to: post content that is illegal, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable; impersonate any person or entity; distribute malware or spam; attempt to gain unauthorized access to other accounts or systems; or violate any applicable laws or regulations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Content Ownership</h2>
            <p className="text-zinc-400">
              You retain ownership of any content you post on {branding.name}. By posting content, you grant us a non-exclusive license to display, store, and serve your content as part of the service. We will never claim ownership of your content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Music, Embeds and Third-Party Sources</h2>
            <p className="text-zinc-400">
              {branding.name} allows you to link or embed music from third-party services such as Spotify and YouTube, upload your own audio files, and optionally provide an additional &quot;full version&quot; streaming source for your tracks. You are solely responsible for any content you link, upload, or stream, including ensuring you have the right to share it.
            </p>
            <p className="text-zinc-400 mt-2">
              Some services (for example Spotify) restrict playback of full tracks unless the listener has an account with them. Any &quot;full version&quot; source you provide — including streams that may rely on your own account, credentials, or session — is done at your own risk. You acknowledge that such use may violate the terms of service of the third-party platform, and you agree to comply with those terms yourself and to assume full responsibility for them.
            </p>
            <p className="text-zinc-400 mt-2">
              {branding.name} does not host, authorize, or endorse the &quot;full version&quot; sources you provide, and we are not liable for any claims, losses, or actions arising from your use of third-party services, including any violation of their terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Custom Domains</h2>
            <p className="text-zinc-400">
              You may associate a custom domain with your profile. You are responsible for configuring your domain&rsquo;s DNS settings correctly. Domain ownership must be verified before the domain becomes active. When automatic TLS is enabled by the instance operator, {branding.name} will obtain and manage Let&rsquo;s Encrypt certificates on your behalf — you acknowledge this and agree to the{" "}
              <a href="https://letsencrypt.org/terms-of-service/" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 transition-colors">
                Let&rsquo;s Encrypt Terms of Service
              </a>.
            </p>
            <p className="text-zinc-400 mt-2">
              The instance operator may remove or disable custom domains at any time, for example if DNS verification fails, the domain expires, or the associated account is terminated.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Webhooks, Integrations and Discord</h2>
            <p className="text-zinc-400">
              You may configure outgoing webhooks to receive notifications about activity on your profile (views, link clicks, etc.) on endpoints you control. You are solely responsible for the availability, security, and privacy practices of the webhook endpoints you configure. {branding.name} will send data to the URLs you provide and does not control how that data is handled after delivery.
            </p>
            <p className="text-zinc-400 mt-2">
              You may revoke or rotate webhook secrets at any time through your dashboard. The instance operator may remove webhook configurations that are being abused or that violate these terms.
            </p>
            <p className="text-zinc-400 mt-2">
              You may optionally connect a Discord account and share your live presence (online status and activity) on your public profile, and use the &quot;Post to Discord&quot; feature to push a profile embed to a webhook URL you provide. Presence is shared only with your explicit opt-in; you can disconnect your Discord account or disable presence sharing at any time, which stops the display of that data. You are responsible for how you present and share your own presence data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Email Notifications</h2>
            <p className="text-zinc-400">
              With your opt-in, {branding.name} may send email notifications to the address on your account when your profile receives views or link clicks. Notifications are sent only if you have enabled them for the relevant profile, and only while they remain enabled. You can disable these notifications at any time from your settings. To reduce noise, notifications are rate-limited so multiple events within a short window trigger a single email.
            </p>
            <p className="text-zinc-400 mt-2">
              We may also email you about important account or security matters, such as account recovery or security incidents; these notices are not optional and are sent regardless of your notification preferences.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Newsletter</h2>
            <p className="text-zinc-400">
              Public profiles may offer a newsletter to visitors. Subscribing is an explicit, single opt-in: a subscriber enters their email address and checks a box agreeing to these Terms and the Privacy Policy. A subscription is never created without that agreement, and each profile runs its own independent newsletter list.
            </p>
            <p className="text-zinc-400 mt-2">
              If you run a newsletter on your profile, you are a sender and agree to comply with all applicable marketing and anti-spam law, including the US CAN-SPAM Act and Canada&rsquo;s Anti-Spam Legislation (CASL). In particular, you agree to: only send to subscribers who genuinely opted in, keep accurate records of that consent, include identifying sender information and a mailing address (or a link to our website) in every email, and honor unsubscribe requests immediately and in all cases within 10 business days. Every newsletter we deliver on your behalf automatically includes a one-click unsubscribe link; you must not remove it or otherwise prevent subscribers from opting out.
            </p>
            <p className="text-zinc-400 mt-2">
              You must not add email addresses to your list without consent, buy or rent lists, harvest addresses, or misrepresent the identity of a sender. Distributing unsolicited commercial email is a violation of these Terms and may result in suspension or termination of your account. Sending is subject to per-tier volume limits and may be paused or disabled by the instance operator; a disabled or paused profile never sends mail.
            </p>
            <p className="text-zinc-400 mt-2">
              Subscriber data belongs to your subscribers. You may use it only to run your newsletter and must honor erasure requests (right to be forgotten) and any applicable data-protection rights. If you erase a subscriber, we remove the subscription so no further mail is sent.
            </p>
            <p className="text-zinc-400 mt-2">
              You may optionally send through your own SMTP relay instead of {branding.name}&rsquo;s mail stack. If you do, you are responsible for the relay and credentials you configure and for all mail sent through it: you must only use a relay you are authorized to use, keep your credentials secure, and comply with that provider&rsquo;s terms. Your SMTP password is encrypted at rest and used solely to deliver your newsletter. The instance operator may require manual approval before your own relay may send.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9b. Product Shop</h2>
            <p className="text-zinc-400">
              Public profiles may offer digital products for sale. If you list products, you are the seller: you are responsible for the product, its description, its price, the rights to distribute any file or preview image you upload, and for complying with all applicable consumer-protection, tax and intellectual-property law. Prices are shown in the configured currency and any profile-wide discount is applied by the platform at checkout.
            </p>
            <p className="text-zinc-400 mt-2">
              Payments are processed by the payment providers the instance operator has enabled (for example Stripe, PayPal, or a cryptocurrency gateway); we do not store card details. Purchases are final except where a refund is granted, in which case the buyer&rsquo;s download access is revoked. You must not use the shop to sell unlawful content or to circumvent the platform&rsquo;s acceptable-use rules.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9a. Tips</h2>
            <p className="text-zinc-400">
              Public profiles may offer the ability for visitors to send cryptocurrency tips (Bitcoin or Litecoin). Tips are voluntary: the visitor chooses the amount and may include an optional name and message, which are shown to the profile owner. Payments are made directly to the profile owner&rsquo;s wallet (or through a BTCPay checkout where the instance operator has configured BTCPay); we do not act as an intermediary or escrow for tips.
            </p>
            <p className="text-zinc-400 mt-2">
              If you enable tips on your profile you are responsible for the wallet addresses you publish and for complying with any applicable tax, financial-services or anti-money-laundering law in your jurisdiction. You agree that disabling tips hides your wallet addresses and that you may delete any tip record at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Access to the API</h2>
            <p className="text-zinc-400">
              {branding.name} exposes a documented HTTP API (see the API documentation and OpenAPI specification) that supports integration with your account and profile. Use of the API is subject to these Terms, including the Acceptable Use provisions. You are responsible for requests you make and for any application or service you build on top of the API.
            </p>
            <p className="text-zinc-400 mt-2">
              We may impose rate limits or restrict access to protect the service from abuse or degradation. Repeatedly exceeding these limits, placing an unreasonable load on the service, or using the API to circumvent any security measure may result in temporary or permanent suspension of API access or your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Service Availability and Security Updates</h2>
            <p className="text-zinc-400">
              We strive to keep {branding.name} available at all times, but we do not guarantee uninterrupted access. We may perform maintenance, updates, or experience downtime without prior notice.
            </p>
            <p className="text-zinc-400 mt-2">
              When a critical security update is available, certain account security operations (such as changing your password, managing passkeys, or configuring two-factor authentication) may be temporarily restricted until the instance is updated. This is a safety measure to protect all users of the platform. Similarly, administrative operations that could affect system security may be restricted during this window. The instance operator is responsible for applying updates promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">12. Termination</h2>
            <p className="text-zinc-400">
              We reserve the right to suspend or terminate your account at our discretion, with or without cause, including for violations of these Terms. Upon termination, your right to use the service ceases immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">13. Limitation of Liability</h2>
            <p className="text-zinc-400">
              {branding.name} is provided &quot;as is&quot; without warranties of any kind. We shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">14. Changes to Terms (Deemed Acceptance)</h2>
            <p className="text-zinc-400">
              We may update these Terms from time to time. Each update is published on this page with a new version number and an effective date, and we will notify you of material changes through the service or by email. The version of these Terms you accepted (including the original version you agreed to when you first used {branding.name}) is retained in your consent history and remains visible to you whenever you review your account&rsquo;s consent records.
            </p>
            <p className="text-zinc-400 mt-2">
              If a new version of these Terms is published and you do not review the update, you will be deemed to have accepted the updated version if you continue to use {branding.name} for more than thirty (30) days after that version&rsquo;s effective date. Continued use of the platform for more than 30 days after an update is published constitutes your acceptance of the updated version, even if you did not open or check the update. If you do not wish to accept an updated version, you must stop using the platform before the end of that 30-day period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">15. Contact</h2>
            <p className="text-zinc-400">
              For questions about these Terms, please{" "}
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
