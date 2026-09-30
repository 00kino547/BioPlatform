-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserTier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OrderMethod" AS ENUM ('MANUAL', 'STRIPE', 'PAYPAL', 'CRYPTO');

-- CreateEnum
CREATE TYPE "CustomDomainStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "TlsStatus" AS ENUM ('NONE', 'PENDING', 'ISSUED', 'FAILED');

-- CreateEnum
CREATE TYPE "TipStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseMethod" AS ENUM ('STRIPE', 'PAYPAL', 'CRYPTO', 'FREE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "tier" "UserTier" NOT NULL DEFAULT 'FREE',
    "track_limit" INTEGER,
    "profile_limit" INTEGER,
    "alias_limit" INTEGER,
    "seat_limit" INTEGER,
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "oauth_bypass_2fa" BOOLEAN NOT NULL DEFAULT false,
    "registered_ip" TEXT,
    "last_login_ip" TEXT,
    "last_login_at" TIMESTAMP(3),
    "registered_fingerprint" TEXT,
    "registered_user_agent_hash" TEXT,
    "invite_allowance" INTEGER NOT NULL DEFAULT 0,
    "invite_allowance_expires_at" TIMESTAMP(3),
    "invite_last_generated_at" TIMESTAMP(3),
    "invite_banned" BOOLEAN NOT NULL DEFAULT false,
    "invite_banned_at" TIMESTAMP(3),
    "newsletter_sender_whitelisted" BOOLEAN NOT NULL DEFAULT false,
    "accepted_tos_version" TEXT,
    "accepted_privacy_version" TEXT,
    "accepted_policies_at" TIMESTAMP(3),
    "newsletter_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "newsletter_opt_in_at" TIMESTAMP(3),
    "broadcast_unsubscribed_at" TIMESTAMP(3),
    "discount_percent" INTEGER NOT NULL DEFAULT 0,
    "discount_expires_at" TIMESTAMP(3),
    "referred_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "invite_batch_limit" INTEGER NOT NULL DEFAULT 0,
    "invite_outstanding_limit" INTEGER NOT NULL DEFAULT 0,
    "invite_cooldown_minutes" INTEGER NOT NULL DEFAULT 0,
    "invite_default_expiry_days" INTEGER NOT NULL DEFAULT 30,
    "invite_min_expiry_days" INTEGER NOT NULL DEFAULT 1,
    "invite_max_expiry_days" INTEGER NOT NULL DEFAULT 365,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#22c55e',
    "icon" TEXT NOT NULL DEFAULT 'Award',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "badge_order" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "display_name" TEXT,
    "bio" TEXT,
    "avatar" TEXT,
    "banner" TEXT,
    "location" TEXT,
    "website" TEXT,
    "social_links" JSONB,
    "theme" JSONB,
    "terminal_commands" JSONB,
    "notify_on_view" BOOLEAN NOT NULL DEFAULT false,
    "notify_on_click" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "presence_status" TEXT,
    "countdown" JSONB,
    "newsletter_enabled" BOOLEAN NOT NULL DEFAULT false,
    "newsletter_visible" BOOLEAN NOT NULL DEFAULT false,
    "newsletter_heading" TEXT,
    "tips_enabled" BOOLEAN NOT NULL DEFAULT false,
    "tips_heading" TEXT,
    "tips_btc_address" TEXT,
    "tips_ltc_address" TEXT,
    "shop_discount_percent" INTEGER,
    "show_discord_presence" BOOLEAN NOT NULL DEFAULT false,
    "show_discord_activity" BOOLEAN NOT NULL DEFAULT true,
    "discord_webhook_url_encrypted" TEXT,
    "discord_posted_message_id" TEXT,
    "discord_posted_webhook_url_encrypted" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_aliases" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slug_namespace" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "profile_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slug_namespace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_domains" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "CustomDomainStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verification_token" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "root_target" TEXT,
    "tls_status" "TlsStatus" NOT NULL DEFAULT 'NONE',
    "tls_issued_at" TIMESTAMP(3),
    "tls_expires_at" TIMESTAMP(3),
    "tls_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_connections" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "discord_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "global_name" TEXT,
    "avatar" TEXT,
    "access_token_encrypted" TEXT NOT NULL,
    "refresh_token_encrypted" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_views" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "visitor_id" TEXT,
    "referer" TEXT,
    "country" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "link_clicks" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "slug" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "visitor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "link_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_tracks" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "title" TEXT,
    "artist" TEXT,
    "url" TEXT,
    "file_path" TEXT,
    "full_url" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price_cents" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "file_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "preview_image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_purchases" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "buyer_user_id" UUID,
    "buyer_email" TEXT,
    "title" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "method" "PurchaseMethod" NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "base_price_cents" INTEGER NOT NULL,
    "discount_percent" INTEGER NOT NULL DEFAULT 0,
    "final_price_cents" INTEGER NOT NULL,
    "gateway_transaction_id" TEXT,
    "gateway_status" TEXT,
    "gateway_checkout_url" TEXT,
    "crypto_coin" TEXT,
    "crypto_amount" DECIMAL(18,8),
    "crypto_rate_usd" DECIMAL(20,8),
    "invoice_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "used_by_id" UUID,
    "used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "from_allowance" BOOLEAN NOT NULL DEFAULT false,
    "refunded_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "email" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_sso" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "issuer_url" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT 'openid email profile',
    "display_name" TEXT NOT NULL,
    "logo_url" TEXT,
    "allowed_domains" TEXT NOT NULL DEFAULT '',
    "enforced" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_sso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_sso_identities" (
    "id" UUID NOT NULL,
    "sso_id" UUID NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT true,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enterprise_sso_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "subscribed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agreed_at" TIMESTAMP(3) NOT NULL,
    "tos_version" TEXT NOT NULL,
    "privacy_version" TEXT NOT NULL,
    "unsubscribed_at" TIMESTAMP(3),

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_sends" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "recipient_count" INTEGER NOT NULL,
    "success_count" INTEGER NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_sends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_newsletter_sends" (
    "id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "recipient_count" INTEGER NOT NULL,
    "success_count" INTEGER NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_newsletter_sends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_senders" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "from_name" TEXT NOT NULL,
    "from_email" TEXT NOT NULL,
    "smtp_host" TEXT NOT NULL,
    "smtp_port" INTEGER NOT NULL DEFAULT 587,
    "smtp_secure" BOOLEAN NOT NULL DEFAULT false,
    "smtp_user" TEXT,
    "smtp_pass_enc" TEXT,
    "verification_token" TEXT,
    "verified_at" TIMESTAMP(3),
    "tested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsletter_senders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tips" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "coin" TEXT NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "name" TEXT,
    "message" TEXT,
    "status" "TipStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'address',
    "invoice_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache_entries" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cache_entries_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan" "UserTier" NOT NULL,
    "method" "OrderMethod" NOT NULL DEFAULT 'MANUAL',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "base_price_cents" INTEGER NOT NULL,
    "discount_percent" INTEGER NOT NULL DEFAULT 0,
    "final_price_cents" INTEGER NOT NULL,
    "admin_note" TEXT,
    "gateway_transaction_id" TEXT,
    "gateway_status" TEXT,
    "gateway_checkout_url" TEXT,
    "crypto_coin" TEXT,
    "crypto_amount" DECIMAL(18,8),
    "crypto_rate_usd" DECIMAL(20,8),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasonal_themes" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'season',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "start_month" INTEGER,
    "start_day" INTEGER,
    "end_month" INTEGER,
    "end_day" INTEGER,
    "override_state" TEXT,
    "allowed_by_admin" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seasonal_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_rewards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_grant_events" (
    "id" UUID NOT NULL,
    "count" INTEGER NOT NULL,
    "expiry_days" INTEGER NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_grant_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passkeys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "name" TEXT NOT NULL,
    "resident_key" BOOLEAN NOT NULL DEFAULT false,
    "authenticator_attachment" TEXT,
    "credential_device_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "resident_verified_at" TIMESTAMP(3),

    CONSTRAINT "passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "web_authn_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "challenge" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_authn_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_bans" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "permanent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_bans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_logs" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "username" TEXT,
    "account_id" UUID,
    "ip" TEXT NOT NULL,
    "user_agent_hash" TEXT,
    "fingerprint" TEXT,
    "reason" TEXT NOT NULL,
    "penalty_minutes" INTEGER,
    "permanent" BOOLEAN NOT NULL DEFAULT false,
    "triggered_by" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    "secret_prefix" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "template" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "webhook_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_status_code" INTEGER,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BadgeToUser" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_BadgeToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_BadgeToProfile" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_BadgeToProfile_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "users_referred_by_id_idx" ON "users"("referred_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_slug_key" ON "roles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "badges_slug_key" ON "badges"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_slug_key" ON "profiles"("slug");

-- CreateIndex
CREATE INDEX "profiles_user_id_idx" ON "profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "profile_aliases_slug_key" ON "profile_aliases"("slug");

-- CreateIndex
CREATE INDEX "profile_aliases_profile_id_idx" ON "profile_aliases"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "slug_namespace_slug_key" ON "slug_namespace"("slug");

-- CreateIndex
CREATE INDEX "slug_namespace_kind_idx" ON "slug_namespace"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "profile_domains_profile_id_key" ON "profile_domains"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "profile_domains_domain_key" ON "profile_domains"("domain");

-- CreateIndex
CREATE INDEX "profile_domains_profile_id_idx" ON "profile_domains"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "discord_connections_profile_id_key" ON "discord_connections"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "discord_connections_discord_id_key" ON "discord_connections"("discord_id");

-- CreateIndex
CREATE INDEX "discord_connections_profile_id_idx" ON "discord_connections"("profile_id");

-- CreateIndex
CREATE INDEX "page_views_profile_id_created_at_idx" ON "page_views"("profile_id", "created_at");

-- CreateIndex
CREATE INDEX "page_views_profile_id_visitor_id_idx" ON "page_views"("profile_id", "visitor_id");

-- CreateIndex
CREATE INDEX "link_clicks_profile_id_created_at_idx" ON "link_clicks"("profile_id", "created_at");

-- CreateIndex
CREATE INDEX "link_clicks_profile_id_slug_idx" ON "link_clicks"("profile_id", "slug");

-- CreateIndex
CREATE INDEX "link_clicks_profile_id_visitor_id_idx" ON "link_clicks"("profile_id", "visitor_id");

-- CreateIndex
CREATE INDEX "music_tracks_profile_id_idx" ON "music_tracks"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "music_tracks_profile_id_position_key" ON "music_tracks"("profile_id", "position");

-- CreateIndex
CREATE INDEX "products_profile_id_idx" ON "products"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_purchases_invoice_id_key" ON "product_purchases"("invoice_id");

-- CreateIndex
CREATE INDEX "product_purchases_product_id_idx" ON "product_purchases"("product_id");

-- CreateIndex
CREATE INDEX "product_purchases_buyer_user_id_idx" ON "product_purchases"("buyer_user_id");

-- CreateIndex
CREATE INDEX "product_purchases_status_idx" ON "product_purchases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_used_by_id_key" ON "invite_codes"("used_by_id");

-- CreateIndex
CREATE INDEX "invite_codes_code_idx" ON "invite_codes"("code");

-- CreateIndex
CREATE INDEX "invite_codes_created_by_id_idx" ON "invite_codes"("created_by_id");

-- CreateIndex
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_account_id_key" ON "oauth_accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_sso_user_id_key" ON "enterprise_sso"("user_id");

-- CreateIndex
CREATE INDEX "enterprise_sso_identities_user_id_idx" ON "enterprise_sso_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_sso_identities_sso_id_provider_account_id_key" ON "enterprise_sso_identities"("sso_id", "provider_account_id");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_profile_id_idx" ON "newsletter_subscribers"("profile_id");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_email_idx" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_profile_id_email_key" ON "newsletter_subscribers"("profile_id", "email");

-- CreateIndex
CREATE INDEX "newsletter_sends_profile_id_sent_at_idx" ON "newsletter_sends"("profile_id", "sent_at");

-- CreateIndex
CREATE INDEX "admin_newsletter_sends_sent_at_idx" ON "admin_newsletter_sends"("sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_senders_profile_id_key" ON "newsletter_senders"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "tips_invoice_id_key" ON "tips"("invoice_id");

-- CreateIndex
CREATE INDEX "tips_profile_id_created_at_idx" ON "tips"("profile_id", "created_at");

-- CreateIndex
CREATE INDEX "cache_entries_expires_at_idx" ON "cache_entries"("expires_at");

-- CreateIndex
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "seasonal_themes_slug_key" ON "seasonal_themes"("slug");

-- CreateIndex
CREATE INDEX "affiliate_rewards_user_id_idx" ON "affiliate_rewards"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_rewards_user_id_kind_level_key" ON "affiliate_rewards"("user_id", "kind", "level");

-- CreateIndex
CREATE INDEX "invite_grant_events_created_at_idx" ON "invite_grant_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "passkeys_credential_id_key" ON "passkeys"("credential_id");

-- CreateIndex
CREATE INDEX "passkeys_user_id_idx" ON "passkeys"("user_id");

-- CreateIndex
CREATE INDEX "web_authn_challenges_created_at_idx" ON "web_authn_challenges"("created_at");

-- CreateIndex
CREATE INDEX "auth_bans_kind_idx" ON "auth_bans"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "auth_bans_kind_value_key" ON "auth_bans"("kind", "value");

-- CreateIndex
CREATE INDEX "auth_logs_kind_created_at_idx" ON "auth_logs"("kind", "created_at");

-- CreateIndex
CREATE INDEX "auth_logs_account_id_idx" ON "auth_logs"("account_id");

-- CreateIndex
CREATE INDEX "auth_logs_fingerprint_idx" ON "auth_logs"("fingerprint");

-- CreateIndex
CREATE INDEX "auth_logs_created_at_idx" ON "auth_logs"("created_at");

-- CreateIndex
CREATE INDEX "auth_logs_expires_at_idx" ON "auth_logs"("expires_at");

-- CreateIndex
CREATE INDEX "webhooks_user_id_idx" ON "webhooks"("user_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhook_id_created_at_idx" ON "webhook_deliveries"("webhook_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_next_retry_at_idx" ON "webhook_deliveries"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "_BadgeToUser_B_index" ON "_BadgeToUser"("B");

-- CreateIndex
CREATE INDEX "_BadgeToProfile_B_index" ON "_BadgeToProfile"("B");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_aliases" ADD CONSTRAINT "profile_aliases_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slug_namespace" ADD CONSTRAINT "slug_namespace_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_domains" ADD CONSTRAINT "profile_domains_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discord_connections" ADD CONSTRAINT "discord_connections_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "link_clicks" ADD CONSTRAINT "link_clicks_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "music_tracks" ADD CONSTRAINT "music_tracks_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_purchases" ADD CONSTRAINT "product_purchases_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_purchases" ADD CONSTRAINT "product_purchases_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_used_by_id_fkey" FOREIGN KEY ("used_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_sso" ADD CONSTRAINT "enterprise_sso_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_sso_identities" ADD CONSTRAINT "enterprise_sso_identities_sso_id_fkey" FOREIGN KEY ("sso_id") REFERENCES "enterprise_sso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_sso_identities" ADD CONSTRAINT "enterprise_sso_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_sends" ADD CONSTRAINT "newsletter_sends_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_senders" ADD CONSTRAINT "newsletter_senders_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_rewards" ADD CONSTRAINT "affiliate_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_grant_events" ADD CONSTRAINT "invite_grant_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "web_authn_challenges" ADD CONSTRAINT "web_authn_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BadgeToUser" ADD CONSTRAINT "_BadgeToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BadgeToUser" ADD CONSTRAINT "_BadgeToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BadgeToProfile" ADD CONSTRAINT "_BadgeToProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BadgeToProfile" ADD CONSTRAINT "_BadgeToProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

