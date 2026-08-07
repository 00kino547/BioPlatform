import { Link } from "react-router-dom";
import { branding } from "@/config/branding";
import { usePageMeta } from "@/lib/seo";

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
        <p className="text-sm text-zinc-500 mb-8">Last updated: July 27, 2026</p>

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
              {branding.name} is an invite-only platform. Accounts may only be created using a valid invite code. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
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
              {branding.name} allows you to link or embed music from third-party services such as Spotify and YouTube, upload your own audio files, and optionally provide an additional "full version" streaming source for your tracks. You are solely responsible for any content you link, upload, or stream, including ensuring you have the right to share it.
            </p>
            <p className="text-zinc-400 mt-2">
              Some services (for example Spotify) restrict playback of full tracks unless the listener has an account with them. Any "full version" source you provide — including streams that may rely on your own account, credentials, or session — is done at your own risk. You acknowledge that such use may violate the terms of service of the third-party platform, and you agree to comply with those terms yourself and to assume full responsibility for them.
            </p>
            <p className="text-zinc-400 mt-2">
              {branding.name} does not host, authorize, or endorse the "full version" sources you provide, and we are not liable for any claims, losses, or actions arising from your use of third-party services, including any violation of their terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Service Availability</h2>
            <p className="text-zinc-400">
              We strive to keep {branding.name} available at all times, but we do not guarantee uninterrupted access. We may perform maintenance, updates, or experience downtime without prior notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Termination</h2>
            <p className="text-zinc-400">
              We reserve the right to suspend or terminate your account at our discretion, with or without cause, including for violations of these Terms. Upon termination, your right to use the service ceases immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Limitation of Liability</h2>
            <p className="text-zinc-400">
              {branding.name} is provided &quot;as is&quot; without warranties of any kind. We shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Changes to Terms</h2>
            <p className="text-zinc-400">
              We may modify these Terms at any time. Continued use of the service after changes constitutes acceptance of the modified Terms. We will notify you of material changes through the service or by email.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Contact</h2>
            <p className="text-zinc-400">
              For questions about these Terms, please{" "}
              <a href={branding.contactUrl} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 transition-colors">
                contact us
              </a>.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-zinc-800/60 bg-zinc-900/20">
        <div className="mx-auto max-w-4xl px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <p>
            &copy; {new Date().getFullYear()} {branding.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <a href={branding.githubUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
            <a href={branding.contactUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
