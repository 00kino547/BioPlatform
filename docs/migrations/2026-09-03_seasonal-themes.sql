BEGIN;

-- =====================================================================
-- Seasonal Themes: admin-managed theme presets (schedule + colors +
-- layout + background) that can decorate user profiles seasonally.
-- =====================================================================

CREATE TABLE "seasonal_themes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL UNIQUE,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'season',
    "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
    "config" JSONB NOT NULL DEFAULT '{}',
    "start_month" INTEGER,
    "start_day" INTEGER,
    "end_month" INTEGER,
    "end_day" INTEGER,
    "override_state" TEXT,
    "allowed_by_admin" BOOLEAN NOT NULL DEFAULT TRUE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed the default seasonal themes (editable by admins later). Date
-- windows are in month-day format and repeat annually.
INSERT INTO "seasonal_themes"
  ("id", "slug", "label", "emoji", "kind", "enabled", "config", "start_month", "start_day", "end_month", "end_day", "allowed_by_admin", "sort_order")
VALUES
  ('0f000000-0000-4000-8000-000000000001', 'spring',       'Spring',        '🌸', 'season',  TRUE,
   '{"bg":"#0b1a12","cardBg":"rgba(16,34,24,0.6)","text":"#ecfdf5","accent":"#34d399","fontFamily":"Inter, system-ui, sans-serif","backgroundImage":null}',
   3, 20, 6, 20, TRUE, 10),
  ('0f000000-0000-4000-8000-000000000002', 'summer',       'Summer',        '☀️', 'season',  TRUE,
   '{"bg":"#0a1622","cardBg":"rgba(12,30,45,0.6)","text":"#ecfeff","accent":"#22d3ee","fontFamily":"Inter, system-ui, sans-serif","backgroundImage":null}',
   6, 21, 9, 22, TRUE, 20),
  ('0f000000-0000-4000-8000-000000000003', 'autumn',       'Autumn',        '🍂', 'season',  TRUE,
   '{"bg":"#180e07","cardBg":"rgba(40,24,12,0.6)","text":"#fffbeb","accent":"#f59e0b","fontFamily":"Inter, system-ui, sans-serif","backgroundImage":null}',
   9, 23, 12, 20, TRUE, 30),
  ('0f000000-0000-4000-8000-000000000004', 'winter',       'Winter',        '❄️', 'season',  TRUE,
   '{"bg":"#0b1320","cardBg":"rgba(15,25,40,0.6)","text":"#e0f2fe","accent":"#38bdf8","fontFamily":"Inter, system-ui, sans-serif","backgroundImage":null}',
   12, 21, 3, 19, TRUE, 40),
  ('0f000000-0000-4000-8000-000000000005', 'halloween',    'Halloween',     '🎃', 'holiday', TRUE,
   '{"bg":"#13070d","cardBg":"rgba(40,12,24,0.6)","text":"#fef2f2","accent":"#f97316","fontFamily":"Inter, system-ui, sans-serif","backgroundImage":null}',
   10, 15, 10, 31, TRUE, 50),
  ('0f000000-0000-4000-8000-000000000006', 'christmas',    'Christmas',     '🎄', 'holiday', TRUE,
   '{"bg":"#0b1117","cardBg":"rgba(16,26,32,0.6)","text":"#f0f9ff","accent":"#ef4444","fontFamily":"Inter, system-ui, sans-serif","backgroundImage":null}',
   12, 1, 1, 8, TRUE, 60),
  ('0f000000-0000-4000-8000-000000000007', 'new-year',     'New Year',      '🎆', 'holiday', TRUE,
   '{"bg":"#0a0a16","cardBg":"rgba(20,20,40,0.6)","text":"#f5f3ff","accent":"#a78bfa","fontFamily":"Inter, system-ui, sans-serif","backgroundImage":null}',
   12, 28, 1, 5, TRUE, 70),
  ('0f000000-0000-4000-8000-000000000008', 'valentines',   'Valentine''s Day','💝', 'holiday', TRUE,
   '{"bg":"#170a12","cardBg":"rgba(45,16,32,0.6)","text":"#fdf2f8","accent":"#ec4899","fontFamily":"Inter, system-ui, sans-serif","backgroundImage":null}',
   2, 1, 2, 14, TRUE, 80),
  ('0f000000-0000-4000-8000-000000000009', 'st-patricks',  'St. Patrick''s Day','🍀', 'holiday', TRUE,
   '{"bg":"#08170f","cardBg":"rgba(14,38,24,0.6)","text":"#ecfdf5","accent":"#22c55e","fontFamily":"Inter, system-ui, sans-serif","backgroundImage":null}',
   3, 10, 3, 17, TRUE, 90);

-- Grant the new themes.manage permission to the admin role on existing installs.
-- The permissions column is a text[] array; append the permission if absent.
UPDATE "roles"
SET "permissions" = "permissions" || ARRAY['themes.manage']::text[]
WHERE "slug" = 'admin' AND NOT ('themes.manage' = ANY("permissions"));

COMMIT;
