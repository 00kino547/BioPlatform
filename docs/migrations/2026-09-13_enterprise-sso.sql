-- Enterprise SSO (OIDC) — per ENTERPRISE account holder + sign-in identities
-- Mirrors apps/backend/prisma/schema.prisma models EnterpriseSso and EnterpriseSsoIdentity.

CREATE TABLE IF NOT EXISTS enterprise_sso (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issuer_url       TEXT NOT NULL,
  client_id        TEXT NOT NULL,
  client_secret    TEXT NOT NULL,
  scopes           TEXT NOT NULL DEFAULT 'openid email profile',
  display_name     TEXT NOT NULL,
  logo_url         TEXT,
  allowed_domains  TEXT NOT NULL DEFAULT '',
  enforced         BOOLEAN NOT NULL DEFAULT false,
  enabled          BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_sso_user_unique UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS enterprise_sso_identities (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sso_id               UUID NOT NULL REFERENCES enterprise_sso(id) ON DELETE CASCADE,
  provider_account_id  TEXT NOT NULL,
  email                TEXT NOT NULL,
  email_verified       BOOLEAN NOT NULL DEFAULT true,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT enterprise_sso_identity_unique UNIQUE (sso_id, provider_account_id)
);

CREATE INDEX IF NOT EXISTS enterprise_sso_identities_user_id_idx
  ON enterprise_sso_identities (user_id);