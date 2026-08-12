BEGIN;

-- =====================================================================
-- ACME automatic TLS for custom domains: track the certificate lifecycle
-- (NONE / PENDING / ISSUED / FAILED) on each profile domain.
-- =====================================================================

CREATE TYPE "TlsStatus" AS ENUM ('NONE', 'PENDING', 'ISSUED', 'FAILED');

ALTER TABLE "profile_domains"
    ADD COLUMN "tls_status" "TlsStatus" NOT NULL DEFAULT 'NONE',
    ADD COLUMN "tls_issued_at" TIMESTAMP(3) WITHOUT TIME ZONE,
    ADD COLUMN "tls_expires_at" TIMESTAMP(3) WITHOUT TIME ZONE,
    ADD COLUMN "tls_error" TEXT;

COMMIT;
