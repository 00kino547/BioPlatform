BEGIN;

-- =====================================================================
-- SSO (Single Sign-On): third-party OAuth 2.0 authorization-code sign-in
-- (Google / GitHub / Discord) with PKCE. Each identity provider link is
-- one OAuthAccount row; a user may link several. A per-user flag lets an
-- account opt into letting SSO skip its 2FA step when the instance owner
-- allows it (`SSO_2FA_BYPASS_ALLOWED=true`).
-- =====================================================================

ALTER TABLE "users" ADD COLUMN "oauth_bypass_2fa" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "oauth_accounts" (
    "id" UUID NOT NULL PRIMARY KEY,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "email" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oauth_accounts_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users" ("id")
      ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts" ("user_id");
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_account_id_key" ON "oauth_accounts" ("provider", "provider_account_id");

COMMIT;