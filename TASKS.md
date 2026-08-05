# TASKS.md

> High, Medium, Low priority. Move completed items to Completed.

## High Priority

- [ ] Custom domain support
- [ ] Affiliate/referral program — referrers earn a discount on their own plan and invited users also get a discount (e.g., % off PRO/ENTERPRISE for both parties)
- [ ] Affiliate rewards — referrers get a reward for reaching referral milestones (e.g., a discount on upgrading to a paid plan, or premium perks), not new plan tiers

## Medium Priority

- [ ] API documentation
- [ ] REST API for third-party integrations
- [ ] S3/R2/B2 storage providers

## Low Priority

- [ ] Profile export / data portability
- [ ] Webhook support for integrations

## Completed

- [x] Project scaffolding (monorepo, Docker, Prisma, Express, React)
- [x] Docker Compose (postgres, backend, frontend, nginx)
- [x] Prisma schema (User + InviteCode + Profile models)
- [x] Express server with health endpoint
- [x] React + Vite + TailwindCSS setup
- [x] Shared types package
- [x] StorageProvider interface
- [x] Landing page (Hero, Features, Showcase, Pricing, FAQ, Footer)
- [x] Scroll-reveal animations
- [x] Interactive theme selector in Showcase
- [x] Configurable branding via env vars
- [x] SEO meta tags, OpenGraph, structured data
- [x] README.md and README.es.md
- [x] LICENSE (MIT)
- [x] .gitignore
- [x] AI documentation (AGENTS.md, PROJECT_MAP.md, DECISIONS.md, TASKS.md, PROMPTS.md)
- [x] Docker build fix (copy source before install)
- [x] Pricing content update (correct features per tier)
- [x] FAQ invite system explanation
- [x] Premium badge centering fix
- [x] Pricing hover flickering fix
- [x] Auth system (JWT, bcrypt at 12 rounds, register/login/me)
- [x] Invite-only registration (invite codes with soft revoke, seed script)
- [x] Auth middleware (requireAuth, requireAdmin)
- [x] Frontend auth (API client, AuthContext, ProtectedRoute)
- [x] Login and Register pages
- [x] Dashboard page (user) + Admin Dashboard (admin)
- [x] Admin/user view toggle via navbar links
- [x] React Router with /dashboard and /admin routes
- [x] Invite code revoke (backend + frontend)
- [x] Invite code expiry display in table
- [x] Change own password route
- [x] Admin user management (list users, update details, reset password)
- [x] CORS fix (relative API URLs via Nginx proxy)
- [x] Branding used everywhere (no hardcoded names/URLs)
- [x] Profile model (bio, avatar, banner, displayName, location, website, socialLinks JSON, theme JSON, isPublic)
- [x] Profile API routes (GET/PUT /me, POST avatar/banner, DELETE avatar/banner, GET /:username)
- [x] Public profile page (/:username route, themed, social links with icons)
- [x] Dashboard profile editor (Profile, Links, Appearance tabs)
- [x] File uploads (multer, local storage, 5MB limit, extension-only filter)
- [x] Private profiles (owner-only visibility with optional JWT on public endpoint)
- [x] Admin profile editing (view/edit any user's profile from admin dashboard)
- [x] Auto-profile creation on registration
- [x] Avatar and banner removal (DELETE routes + UI buttons)
- [x] Theme presets (8 built-in themes: Midnight, Ocean, Sunset, Forest, Lavender, Rose, Arctic, Minimal)
- [x] Appearance tab in Dashboard with interactive theme selector
- [x] Platform icons (SVG icons for Twitter/X, GitHub, YouTube, Twitch, Discord, TikTok, Instagram, Facebook, LinkedIn, Spotify, Email)
- [x] Email platform: auto-prepend mailto:, mailto links on public profile
- [x] Discord platform: username validation (new format, no discriminator) + invite link support
- [x] Save error display in Dashboard (red banner on failed saves)
- [x] Input sanitization (strip HTML-like characters from displayName, bio, location, social link URLs)
- [x] Platform allowlist (backend rejects unknown platform names)
- [x] Docker network fix (renamed to bioplatform_net)
- [x] Privacy Policy page (/privacy)
- [x] Terms of Service page (/terms)
- [x] PublicProfile "Powered by" links to GitHub repo
- [x] CHANGELOG.md (starting from 1.0.0-beta.1)
- [x] Landing page buttons fully functional (Hero CTA, nav, pricing, footer links)
- [x] Footer links configurable via env (Changelog, Docs, Status, Privacy, Terms, Contact)
- [x] Analytics dashboard (PageView + LinkClick models, stats API, Dashboard Analytics tab with bar charts)
- [x] Email notifications via SMTP (Gmail preset + custom SMTP, Dashboard Email tab with test button)
- [x] Link click tracking on public profiles
- [x] Global SMTP config via .env (SMTP_PROVIDER, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM_*)
- [x] Per-user email notification preferences (notifyOnView, notifyOnClick) with Dashboard toggles
- [x] Anti-spam email headers (HELO, List-Unsubscribe, X-Mailer, X-Priority, Precedence, envelope)
- [x] Admin credentials via .env (ADMIN_EMAIL, ADMIN_PASSWORD)
- [x] Unique view/click tracking (visitor_id from IP + User-Agent + bp_vid cookie)
- [x] Owner view/click exclusion (owner's own activity not counted)
- [x] Non-auth link click tracking (POST /click works for anonymous visitors)
- [x] Enhanced analytics graphs (dual total/unique bars, hover tooltips with date, platform colors)
- [x] Privacy policy update (bp_vid cookie, analytics data collection, 90-day retention)
- [x] Music player integration (local audio uploads + Spotify + YouTube embeds, tier-based track limits, admin trackLimit control)
- [x] Two-factor authentication (TOTP via authenticator apps, verify-and-enable + disable, QR setup in Security tab)
- [x] WebAuthn passkeys (passwordless login + passkey as 2FA, resident/non-resident choice, Security tab management, server-side challenge store)
- [x] Multi-step login flow (username/email → passwordless or password → TOTP/passkey 2FA)
- [x] Anti-brute-force auth rate limiting (fingerprint 2-of-3 blocks, per-account lockouts, escalation tiers, permanent bans, trusted-IP cap, admin unban panel)
