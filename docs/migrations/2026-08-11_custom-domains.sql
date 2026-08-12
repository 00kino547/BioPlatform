BEGIN;

-- =====================================================================
-- Custom domains: per-profile domain with a self-serve DNS TXT
-- verification + admin approval state machine and a root target.
-- =====================================================================

CREATE TYPE "CustomDomainStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'REJECTED');

CREATE TABLE "profile_domains" (
    "id" UUID NOT NULL PRIMARY KEY,
    "profile_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "CustomDomainStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verification_token" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) WITHOUT TIME ZONE,
    "approved_at" TIMESTAMP(3) WITHOUT TIME ZONE,
    "rejected_at" TIMESTAMP(3) WITHOUT TIME ZONE,
    "root_target" TEXT,
    "created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "profile_domains_profile_id_fkey"
      FOREIGN KEY ("profile_id") REFERENCES "profiles" ("id")
      ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX "profile_domains_profile_id_key" ON "profile_domains" ("profile_id");
CREATE UNIQUE INDEX "profile_domains_domain_key" ON "profile_domains" ("domain");
CREATE INDEX "profile_domains_profile_id_idx" ON "profile_domains" ("profile_id");

COMMIT;
