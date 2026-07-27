import { Link } from "react-router-dom";
import { branding } from "@/config/branding";

export function Privacy() {
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
        <p className="text-sm text-zinc-500 mb-8">Last updated: July 27, 2026</p>

        <div className="prose prose-invert prose-zinc max-w-none space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Information We Collect</h2>
            <p className="text-zinc-400">
              When you create an account on {branding.name}, we collect your email address, username, and password (stored as a bcrypt hash). We also store any profile information you choose to provide, including display name, bio, avatar, banner, location, website, social links, and theme preferences.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. How We Use Your Information</h2>
            <p className="text-zinc-400">
              We use your information to provide and maintain the {branding.name} service, to personalize your experience, and to communicate with you about your account. We do not sell, trade, or otherwise transfer your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Data Storage and Security</h2>
            <p className="text-zinc-400">
              Your data is stored on servers operated by us or our hosting providers. We implement industry-standard security measures including bcrypt password hashing, JWT authentication, and HTTPS encryption. However, no method of electronic transmission or storage is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. File Uploads</h2>
            <p className="text-zinc-400">
              Avatar and banner images you upload are stored on our servers. You may delete your uploads at any time through your dashboard. We validate file types and enforce size limits to maintain platform security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Cookies and Tracking</h2>
            <p className="text-zinc-400">
              {branding.name} uses essential cookies for authentication and session management. We do not use third-party tracking cookies or analytics services that track you across websites.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Data Retention</h2>
            <p className="text-zinc-400">
              We retain your account data for as long as your account is active. You may request account deletion by contacting us. Upon deletion, your personal data will be removed from our active systems, though some data may be retained in backups for a limited period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Your Rights</h2>
            <p className="text-zinc-400">
              You have the right to access, update, or delete your personal information at any time through your dashboard. You may also export your data or request complete account deletion by contacting us.
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

      <footer className="border-t border-zinc-800/60 bg-zinc-900/20">
        <div className="mx-auto max-w-4xl px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <p>
            &copy; {new Date().getFullYear()} {branding.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
            <a href={branding.githubUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
            <a href={branding.contactUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
