export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "BioPlatform API",
    version: "1.2.0-dev-beta.1",
    description:
      "REST API for the BioPlatform link-in-bio service. Authenticated endpoints require a Bearer token returned by /api/auth/login or /api/auth/register. Public profile data is available without authentication.",
  },
  servers: [{ url: "/api" }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Profiles" },
    { name: "Analytics" },
    { name: "Email" },
    { name: "Music" },
    { name: "Webhooks" },
    { name: "Discord" },
    { name: "Invites" },
    { name: "Badges" },
    { name: "Admin" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        security: [],
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: { type: "object", properties: { status: { type: "string" }, timestamp: { type: "string", format: "date-time" } } },
              },
            },
          },
        },
      },
    },

    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new account",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["username", "email", "password"],
                properties: {
                  username: { type: "string", description: "Unique public username" },
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 12, description: "Password (bcrypt, 12 rounds)" },
                  inviteCode: { type: "string", description: "Invite code if registration requires one" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created. Returns token and user." }, "400": { description: "Validation error" } },
      },
    },
    "/auth/login/start": {
      post: {
        tags: ["Auth"],
        summary: "Discover available login methods for an identifier",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { identifier: { type: "string" } } } } } },
        responses: { "200": { description: "Always returns found:true to avoid account enumeration" } },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in with username/email identifier and password",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["identifier", "password"], properties: { identifier: { type: "string", description: "Username or email" }, password: { type: "string" } } } } },
        },
        responses: {
          "200": { description: "Logged in. Returns token + user, or requiresTwoFactor." },
          "401": { description: "Invalid credentials" },
        },
      },
    },
    "/auth/login/passkey/options": {
      post: {
        tags: ["Auth"],
        summary: "Get WebAuthn assertion options for passwordless login",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { identifier: { type: "string" } } } } } },
        responses: { "200": { description: "PublicKeyCredentialRequestOptionsJSON" } },
      },
    },
    "/auth/login/passkey/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify a passkey assertion and log in",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["identifier", "response"], properties: { identifier: { type: "string" }, response: { type: "object" } } } } },
        },
        responses: { "200": { description: "token + user" } },
      },
    },
    "/auth/2fa/totp": {
      post: {
        tags: ["Auth"],
        summary: "Complete login with a TOTP code",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token", "code"], properties: { token: { type: "string" }, code: { type: "string" } } } } } },
        responses: { "200": { description: "token + user" }, "401": { description: "Invalid code" } },
      },
    },
    "/auth/2fa/passkey/options": {
      post: {
        tags: ["Auth"],
        summary: "Get WebAuthn assertion options for 2FA",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" } } } } } },
        responses: { "200": { description: "PublicKeyCredentialRequestOptionsJSON" } },
      },
    },
    "/auth/2fa/passkey/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify a passkey assertion for 2FA",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token", "response"], properties: { token: { type: "string" }, response: { type: "object" } } } } } },
        responses: { "200": { description: "token + user" } },
      },
    },
    "/auth/passkeys/options": {
      post: {
        tags: ["Auth"],
        summary: "Get WebAuthn creation options to register a passkey",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { residentKey: { type: "string", enum: ["resident", "nonResident"] } } } } } },
        responses: { "200": { description: "PublicKeyCredentialCreationOptionsJSON" } },
      },
    },
    "/auth/passkeys/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new passkey",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["response"], properties: { response: { type: "object" }, name: { type: "string" }, residentKey: { type: "string" } } } } },
        },
        responses: { "201": { description: "Created passkey" } },
      },
    },
    "/auth/passkeys": {
      get: {
        tags: ["Auth"],
        summary: "List your passkeys",
        responses: { "200": { description: "Array of passkeys" } },
      },
    },
    "/auth/passkeys/{id}": {
      delete: {
        tags: ["Auth"],
        summary: "Delete a passkey",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/auth/totp/setup": {
      post: {
        tags: ["Auth"],
        summary: "Start TOTP enrollment (returns secret and otpauth URL)",
        responses: { "200": { description: "TOTP secret + otpauth URL" } },
      },
    },
    "/auth/totp/enable": {
      post: {
        tags: ["Auth"],
        summary: "Enable TOTP with a verification code",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["code"], properties: { code: { type: "string" } } } } } },
        responses: { "200": { description: "Enabled" } },
      },
    },
    "/auth/totp/disable": {
      post: {
        tags: ["Auth"],
        summary: "Disable TOTP",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["code"], properties: { code: { type: "string" } } } } } },
        responses: { "200": { description: "Disabled" } },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get the current user",
        responses: { "200": { description: "Current user", content: { "application/json": { schema: { $ref: "#/components/schemas/SelfUser" } } } } },
      },
    },
    "/auth/change-password": {
      post: {
        tags: ["Auth"],
        summary: "Change your password",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["currentPassword", "newPassword"], properties: { currentPassword: { type: "string" }, newPassword: { type: "string", minLength: 12 } } } } },
        },
        responses: { "200": { description: "Password changed" } },
      },
    },
    "/auth/unlock": {
      post: {
        tags: ["Auth"],
        summary: "Request an account unlock email",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { identifier: { type: "string" } } } } } },
        responses: { "200": { description: "sent:true if the identifier has an account" } },
      },
    },
    "/auth/unlock/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify an unlock token",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" } } } } } },
        responses: { "200": { description: "Unlocked" } },
      },
    },

    "/profiles/me": {
      get: {
        tags: ["Profiles"],
        summary: "List your profiles with limits and primary id",
        responses: {
          "200": {
            description: "Your profiles, limits, primary id, and alias count",
            content: { "application/json": { schema: { $ref: "#/components/schemas/MyProfiles" } } },
          },
        },
      },
      post: {
        tags: ["Profiles"],
        summary: "Create a new profile",
        description: "Limited by your tier (or admin override). The primary profile cannot be deleted.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["slug"],
                properties: {
                  slug: { type: "string", pattern: "^[a-z0-9][a-z0-9-_]{2,31}$", description: "Public URL slug (lowercase)" },
                  displayName: { type: ["string", "null"], maxLength: 64 },
                  bio: { type: ["string", "null"], maxLength: 500 },
                  location: { type: ["string", "null"], maxLength: 100 },
                  website: { type: ["string", "null"], description: "http(s) or mailto URL" },
                  socialLinks: { type: ["array", "null"], items: { $ref: "#/components/schemas/SocialLink" } },
                  theme: { $ref: "#/components/schemas/Theme" },
                  isPublic: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created profile" }, "400": { description: "Validation error or limit reached" } },
      },
      put: {
        tags: ["Profiles"],
        summary: "Update your primary profile (backward-compatible)",
        description: "Equivalent to PATCH /profiles/me/{primaryId}.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  displayName: { type: ["string", "null"], maxLength: 64 },
                  bio: { type: ["string", "null"], maxLength: 500 },
                  location: { type: ["string", "null"], maxLength: 100 },
                  website: { type: ["string", "null"], description: "http(s) or mailto URL" },
                  socialLinks: { type: ["array", "null"], items: { $ref: "#/components/schemas/SocialLink" } },
                  theme: { $ref: "#/components/schemas/Theme" },
                  isPublic: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated profile" } },
      },
    },
    "/profiles/me/{profileId}": {
      get: {
        tags: ["Profiles"],
        summary: "Get one of your profiles",
        parameters: [{ name: "profileId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Your profile", content: { "application/json": { schema: { $ref: "#/components/schemas/Profile" } } } } },
      },
      patch: {
        tags: ["Profiles"],
        summary: "Update a profile",
        description: "Changing the slug of the primary profile is rejected (rename the alias set instead).",
        parameters: [{ name: "profileId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  slug: { type: "string", pattern: "^[a-z0-9][a-z0-9-_]{2,31}$" },
                  displayName: { type: ["string", "null"], maxLength: 64 },
                  bio: { type: ["string", "null"], maxLength: 500 },
                  location: { type: ["string", "null"], maxLength: 100 },
                  website: { type: ["string", "null"], description: "http(s) or mailto URL" },
                  socialLinks: { type: ["array", "null"], items: { $ref: "#/components/schemas/SocialLink" } },
                  theme: { $ref: "#/components/schemas/Theme" },
                  isPublic: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated profile" } },
      },
      delete: {
        tags: ["Profiles"],
        summary: "Delete a profile",
        description: "The primary profile (and the last remaining profile) cannot be deleted.",
        parameters: [{ name: "profileId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" }, "400": { description: "Cannot delete the primary or last profile" } },
      },
    },
    "/profiles/me/{profileId}/primary": {
      post: {
        tags: ["Profiles"],
        summary: "Set a profile as primary",
        parameters: [{ name: "profileId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Primary updated" } },
      },
    },
    "/profiles/me/{profileId}/aliases": {
      get: {
        tags: ["Profiles"],
        summary: "List a profile's aliases",
        parameters: [{ name: "profileId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Array of aliases", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/ProfileAlias" } } } } } },
      },
      post: {
        tags: ["Profiles"],
        summary: "Add an alias to a profile",
        description: "Limited by your tier (or admin override). Aliases resolve to the same public page as the profile slug.",
        parameters: [{ name: "profileId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["slug"], properties: { slug: { type: "string", pattern: "^[a-z0-9][a-z0-9-_]{2,31}$" } } } } },
        },
        responses: { "201": { description: "Created alias" }, "400": { description: "Validation error or limit reached" } },
      },
    },
    "/profiles/me/{profileId}/aliases/{aliasId}": {
      delete: {
        tags: ["Profiles"],
        summary: "Delete an alias",
        parameters: [
          { name: "profileId", in: "path", required: true, schema: { type: "string" } },
          { name: "aliasId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/profiles/me/{profileId}/badges": {
      post: {
        tags: ["Profiles"],
        summary: "Toggle a badge on a profile",
        description: "Badges come from the user's badge set (assigned by admins).",
        parameters: [{ name: "profileId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["badge", "enabled"], properties: { badge: { type: "string", format: "uuid", description: "Badge id" }, enabled: { type: "boolean" } } } } },
        },
        responses: { "200": { description: "Updated badge list", content: { "application/json": { schema: { type: "object", properties: { badges: { type: "array", items: { type: "string", format: "uuid" } } } } } } } },
      },
    },
    "/badges": {
      get: {
        tags: ["Badges"],
        summary: "List all badges (public)",
        security: [],
        description: "The badge catalog with labels, colors and icon names. Used to render badges as colored icons.",
        responses: { "200": { description: "Array of badges" } },
      },
    },
    "/profiles/me/avatar": {
      post: {
        tags: ["Profiles"],
        summary: "Upload an avatar image",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to update (defaults to primary)" }],
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["avatar"], properties: { avatar: { type: "string", format: "binary" } } } } } },
        responses: { "200": { description: "Updated avatar URL" } },
      },
      delete: {
        tags: ["Profiles"],
        summary: "Remove your avatar",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to update (defaults to primary)" }],
        responses: { "200": { description: "Removed" } },
      },
    },
    "/profiles/me/banner": {
      post: {
        tags: ["Profiles"],
        summary: "Upload a banner image",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to update (defaults to primary)" }],
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["banner"], properties: { banner: { type: "string", format: "binary" } } } } } },
        responses: { "200": { description: "Updated banner URL" } },
      },
      delete: {
        tags: ["Profiles"],
        summary: "Remove your banner",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to update (defaults to primary)" }],
        responses: { "200": { description: "Removed" } },
      },
    },
    "/profiles/me/export": {
      get: {
        tags: ["Profiles"],
        summary: "Export your profile as a spreadsheet (Premium API access: api.advanced)",
        description: "Downloads a single-sheet spreadsheet (one field per row). Macro-free by design. Requires the advanced API level (Premium tier or api.advanced permission).",
        parameters: [
          { name: "format", in: "query", schema: { type: "string", enum: ["xlsx", "ods"] }, description: "xlsx (default) or ods" },
          { name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to export (defaults to primary)" },
        ],
        responses: {
          "200": {
            description: "Spreadsheet file",
            content: {
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { schema: { type: "string", format: "binary" } },
              "application/vnd.oasis.opendocument.spreadsheet": { schema: { type: "string", format: "binary" } },
            },
          },
          "403": { description: "Requires the advanced API level (Premium tier or api.advanced permission)" },
        },
      },
    },
    "/profiles/me/import": {
      post: {
        tags: ["Profiles"],
        summary: "Import your profile from a spreadsheet (Premium API access: api.advanced)",
        description: "Accepts .xlsx, .ods, or .csv. Macro-enabled files (.xlsm/.xls) are rejected. Unknown rows are reported as warnings. Requires the advanced API level (Premium tier or api.advanced permission).",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to import into (defaults to primary)" }],
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" } } } } } },
        responses: {
          "200": { description: "Import result with applied fields and warnings", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", properties: { applied: { type: "array", items: { type: "string" } }, warnings: { type: "array", items: { type: "string" } } } } } } } } },
          "400": { description: "Invalid file or data" },
          "403": { description: "Requires the advanced API level (Premium tier or api.advanced permission)" },
        },
      },
    },
    "/profiles/{identifier}": {
      get: {
        tags: ["Profiles"],
        summary: "Get a public profile by slug or alias",
        security: [],
        parameters: [{ name: "identifier", in: "path", required: true, schema: { type: "string" }, description: "A profile slug or an alias slug" }],
        responses: { "200": { description: "Public profile (no email/PII)", content: { "application/json": { schema: { $ref: "#/components/schemas/PublicProfile" } } } }, "404": { description: "Not found or private" } },
      },
    },
    "/profiles/{identifier}/presence": {
      get: {
        tags: ["Profiles"],
        summary: "Get a live presence snapshot for a public profile",
        security: [],
        parameters: [{ name: "identifier", in: "path", required: true, schema: { type: "string" }, description: "A profile slug or an alias slug" }],
        responses: { "200": { description: "Presence snapshot or `data: null` when Discord presence is off", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { oneOf: [{ $ref: "#/components/schemas/DiscordPresence" }, { type: "null" }] } } } } } }, "404": { description: "Not found or private" } },
      },
    },
    "/profiles/{identifier}/og.png": {
      get: {
        tags: ["Profiles"],
        summary: "Render the OpenGraph card image for a public profile",
        security: [],
        parameters: [{ name: "identifier", in: "path", required: true, schema: { type: "string" }, description: "A profile slug or an alias slug" }],
        responses: { "200": { description: "1200x630 PNG card (banner, avatar, display name + @username, bio, all badges, social tiles). Stable profile data only — no presence, so it can't go stale in Discord's image cache. In-memory cached ~5 min keyed by profile content; served with ETag + Cache-Control: public, max-age=300. Use the ?v= versioned URL from the OG page for crawler freshness.", content: { "image/png": { schema: { type: "string", format: "binary" } } } }, "304": { description: "Not modified (If-None-Match matches)" }, "404": { description: "Not found or private" } },
      },
    },
    "/profiles/click": {
      post: {
        tags: ["Profiles"],
        summary: "Record a social link click (public)",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["profileId", "platform"], properties: { profileId: { type: "string" }, platform: { type: "string", description: "A platform from the allowlist" } } } } },
        },
        responses: { "200": { description: "Recorded" }, "404": { description: "Profile not found" } },
      },
    },

    "/analytics/me": {
      get: {
        tags: ["Analytics"],
        summary: "Get your analytics (Premium API access: api.advanced)",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        responses: { "200": { description: "Views and clicks aggregates" }, "403": { description: "Requires the advanced API level (Premium tier or api.advanced permission)" } },
      },
    },

    "/email/settings": {
      get: {
        tags: ["Email"],
        summary: "Get your email notification settings",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        responses: { "200": { description: "Notification settings" } },
      },
      put: {
        tags: ["Email"],
        summary: "Update email notification preferences",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { notifyOnView: { type: "boolean" }, notifyOnClick: { type: "boolean" } } } } },
        },
        responses: { "200": { description: "Updated" } },
      },
    },
    "/email/test": {
      post: {
        tags: ["Email"],
        summary: "Send a test email",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        responses: { "200": { description: "Sent" }, "400": { description: "SMTP not configured or send failed" } },
      },
    },

    "/music/me": {
      get: {
        tags: ["Music"],
        summary: "List your music tracks",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        responses: { "200": { description: "Tracks and tier limit" } },
      },
      post: {
        tags: ["Music"],
        summary: "Add a music track",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["provider"], properties: { provider: { type: "string", enum: ["local", "spotify", "youtube"] }, title: { type: "string" }, artist: { type: "string" }, url: { type: "string" }, fullUrl: { type: "string" } } } } },
        },
        responses: { "201": { description: "Created track" } },
      },
    },
    "/music/me/upload": {
      post: {
        tags: ["Music"],
        summary: "Upload an audio file",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" }, title: { type: "string" }, artist: { type: "string" }, fullUrl: { type: "string" } } } } } },
        responses: { "201": { description: "Created track" } },
      },
    },
    "/music/{id}": {
      patch: {
        tags: ["Music"],
        summary: "Update a track (title, artist, position, fullUrl)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { title: { type: "string" }, artist: { type: "string" }, position: { type: "integer" }, fullUrl: { type: ["string", "null"] } } } } } },
        responses: { "200": { description: "Updated track" } },
      },
      delete: {
        tags: ["Music"],
        summary: "Delete a track",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/music/reorder": {
      post: {
        tags: ["Music"],
        summary: "Reorder tracks",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["ids"], properties: { ids: { type: "array", items: { type: "string" } } } } } } },
        responses: { "200": { description: "Reordered" } },
      },
    },

    "/webhooks": {
      get: {
        tags: ["Webhooks"],
        summary: "List your webhooks with their last delivery (Enterprise API access: api.enterprise)",
        responses: { "200": { description: "Array of webhooks" }, "403": { description: "Requires the enterprise API level (Enterprise tier or api.enterprise permission)" } },
      },
      post: {
        tags: ["Webhooks"],
        summary: "Create a webhook (Enterprise API access: api.enterprise)",
        description: "Returns the signing secret exactly once. It is not recoverable afterwards.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "url", "events"],
                properties: {
                  name: { type: "string", maxLength: 64 },
                  url: { type: "string", maxLength: 512, description: "http(s) endpoint" },
                  events: { type: "array", minItems: 1, items: { $ref: "#/components/schemas/WebhookEvent" }, uniqueItems: true },
                  active: { type: "boolean", default: true },
                  template: { type: "string", maxLength: 2000, nullable: true, description: "Custom JSON payload with {{placeholders}}. Empty = default payload." },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created with one-time secret" }, "400": { description: "Validation error or max 10 webhooks reached" } },
      },
    },
    "/webhooks/{id}": {
      patch: {
        tags: ["Webhooks"],
        summary: "Update a webhook (name, url, events, active) (Enterprise API access: api.enterprise)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { name: { type: "string", maxLength: 64 }, url: { type: "string", maxLength: 512 }, events: { type: "array", minItems: 1, items: { $ref: "#/components/schemas/WebhookEvent" } }, active: { type: "boolean" }, template: { type: "string", maxLength: 2000, nullable: true, description: "Custom JSON payload with {{placeholders}}. Empty = default payload." } } } } } },
        responses: { "200": { description: "Updated webhook" }, "404": { description: "Webhook not found" } },
      },
      delete: {
        tags: ["Webhooks"],
        summary: "Delete a webhook and its delivery history (Enterprise API access: api.enterprise)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" }, "404": { description: "Webhook not found" } },
      },
    },
    "/webhooks/{id}/rotate-secret": {
      post: {
        tags: ["Webhooks"],
        summary: "Rotate the signing secret (returned once) (Enterprise API access: api.enterprise)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "New one-time secret" }, "404": { description: "Webhook not found" } },
      },
    },
    "/webhooks/{id}/test": {
      post: {
        tags: ["Webhooks"],
        summary: "Send a test delivery (webhook.test event) (Enterprise API access: api.enterprise)",
        description: "Rate-limited to 5 per minute per user.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Test delivery queued" }, "400": { description: "Delivery failed immediately" }, "404": { description: "Webhook not found" }, "429": { description: "Rate limited" } },
      },
    },
    "/webhooks/{id}/deliveries": {
      get: {
        tags: ["Webhooks"],
        summary: "List recent deliveries for a webhook (Enterprise API access: api.enterprise)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
        ],
        responses: { "200": { description: "Array of deliveries" }, "404": { description: "Webhook not found" } },
      },
    },

    "/discord": {
      get: {
        tags: ["Discord"],
        summary: "Get your Discord connection status, settings, and current presence snapshot (Premium API access: api.advanced)",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        responses: { "200": { description: "Status, settings, and presence" }, "403": { description: "Requires the advanced API level (Premium tier or api.advanced permission)" } },
      },
    },
    "/discord/connect": {
      get: {
        tags: ["Discord"],
        summary: "Get the Discord OAuth2 authorize URL for your account (Premium API access: api.advanced)",
        responses: { "200": { description: "Authorize URL", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", properties: { url: { type: "string" } } } } } } } }, "400": { description: "Discord integration not configured" } },
      },
    },
    "/discord/callback": {
      get: {
        tags: ["Discord"],
        summary: "OAuth2 callback from Discord (browser redirect)",
        security: [],
        parameters: [
          { name: "code", in: "query", required: true, schema: { type: "string" } },
          { name: "state", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { "302": { description: "Redirects back to the dashboard" } },
      },
    },
    "/discord/disconnect": {
      post: {
        tags: ["Discord"],
        summary: "Disconnect your Discord account and stop presence tracking (Premium API access: api.advanced)",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        responses: { "200": { description: "Disconnected" } },
      },
    },
    "/discord/settings": {
      put: {
        tags: ["Discord"],
        summary: "Update Discord presence visibility and webhook settings (Premium API access: api.advanced)",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  showDiscordPresence: { type: "boolean", description: "Show presence on the public profile and link previews" },
                  showDiscordActivity: { type: "boolean", description: "Include activity details (game/song/app)" },
                  webhookUrl: { type: "string", description: "Discord webhook URL, or empty string to clear. Changing it while a posted message exists deletes the old message." },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated" }, "400": { description: "Invalid settings" } },
      },
    },
    "/discord/post": {
      post: {
        tags: ["Discord"],
        summary: "Post (or update) the profile card embed to a Discord webhook (Premium API access: api.advanced)",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { url: { type: "string", description: "Webhook URL (optional if one is saved)" } } } } } },
        responses: { "200": { description: "Posted or updated in place. Embed = rendered profile card image (versioned og.png URL) + short title; no presence text so it can't go stale.", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", properties: { messageId: { type: ["string", "null"] }, mode: { type: "string", enum: ["created", "updated", "none"] } } } } } } } }, "400": { description: "No webhook configured or invalid URL" }, "502": { description: "Discord webhook failed" } },
      },
    },

    "/invites": {
      get: {
        tags: ["Invites"],
        summary: "List your invite codes and generation status",
        description: "Your invite codes plus meta: event allowance (with expiry), role-based generation config, cooldown remaining, and whether generation is enabled for you. Expired event codes are refunded lazily on this call.",
        responses: { "200": { description: "Array of invite codes + meta" } },
      },
      post: {
        tags: ["Invites"],
        summary: "Create an invite code",
        description: "Admins with `invites.manage` generate without limits. Other users generate within their role quota (`invites.generate` permission + per-role batch/outstanding limits) or their event allowance, subject to the global `userGenerationEnabled` switch, a per-role cooldown, and expiry bounds (min/max, capped by the allowance expiry).",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { count: { type: "integer", minimum: 1, maximum: 50 }, expiresInDays: { type: "integer", minimum: 1, maximum: 365 } } } } } },
        responses: { "201": { description: "Created invite codes + meta" }, "403": { description: "Banned / disabled / no credits" }, "429": { description: "Cooldown active" } },
      },
    },
    "/invites/{id}": {
      delete: {
        tags: ["Invites"],
        summary: "Revoke an invite code you created",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/admin/invites": {
      get: {
        tags: ["Admin"],
        summary: "List all invite codes (admin only)",
        description: "Every invite code across all creators, with the creator and (when used) the account that redeemed it.",
        responses: { "200": { description: "Array of invite codes" } },
      },
    },
    "/admin/invite-settings": {
      get: {
        tags: ["Admin"],
        summary: "Get invite generation settings (admin only)",
        description: "Whether non-admin users may generate invites, and how many users are eligible (not invite-banned).",
        responses: { "200": { description: "{ userGenerationEnabled, eligibleUserCount }" } },
      },
      put: {
        tags: ["Admin"],
        summary: "Set invite generation settings (admin only)",
        description: "Globally enable or disable non-admin invite generation.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["userGenerationEnabled"], properties: { userGenerationEnabled: { type: "boolean" } } } } } },
        responses: { "200": { description: "Updated settings" } },
      },
    },
    "/admin/invite-events": {
      get: {
        tags: ["Admin"],
        summary: "List invite grant events (admin only)",
        responses: { "200": { description: "Array of events" } },
      },
      post: {
        tags: ["Admin"],
        summary: "Run an invite event (admin only)",
        description: "Grants every non-banned user an invite allowance (`count` credits) that expires after `expiryDays`. Users then generate codes within that allowance; codes expiring unused before the allowance expiry are refunded.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["count", "expiryDays"], properties: { count: { type: "integer", minimum: 1, maximum: 1000 }, expiryDays: { type: "integer", minimum: 1, maximum: 3650 } } } } } },
        responses: { "201": { description: "{ grantedUsers, event, allowanceExpiresAt }" } },
      },
    },

    "/admin/users": {
      get: {
        tags: ["Admin"],
        summary: "List all users (admin only)",
        responses: { "200": { description: "Array of users" } },
      },
    },
    "/admin/users/{id}": {
      patch: {
        tags: ["Admin"],
        summary: "Update a user (admin only)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { roleId: { type: "string", format: "uuid", description: "Role id" }, tier: { type: "string", enum: ["FREE", "PRO", "ENTERPRISE"] }, trackLimit: { type: ["integer", "null"] }, profileLimit: { type: ["integer", "null"] }, aliasLimit: { type: ["integer", "null"] }, badges: { type: "array", items: { type: "string", format: "uuid" } }, inviteBanned: { type: "boolean", description: "Block/allow invite events and invite generation (ban also revokes outstanding invites)" } } } } } },
        responses: { "200": { description: "Updated user" } },
      },
      delete: {
        tags: ["Admin"],
        summary: "Permanently delete a user (GDPR erasure, admin only)",
        description: "Irreversibly deletes the account, all profiles, uploads, webhooks, passkeys, invite codes, and the user's auth-log and account-ban references.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "User deleted" }, "400": { description: "Cannot delete your own account" }, "404": { description: "User not found" } },
      },
    },
    "/admin/users/{id}/reset-password": {
      post: {
        tags: ["Admin"],
        summary: "Reset a user's password (admin only)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["newPassword"], properties: { newPassword: { type: "string", minLength: 12 } } } } } },
        responses: { "200": { description: "Reset" } },
      },
    },
    "/admin/users/{id}/profile": {
      get: {
        tags: ["Admin"],
        summary: "Get a user's profile (admin only)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Profile" } },
      },
      put: {
        tags: ["Admin"],
        summary: "Update a user's profile (admin only)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { displayName: { type: ["string", "null"] }, bio: { type: ["string", "null"] }, location: { type: ["string", "null"] }, website: { type: ["string", "null"] }, socialLinks: { type: ["array", "null"], items: { $ref: "#/components/schemas/SocialLink" } }, theme: { $ref: "#/components/schemas/Theme" }, isPublic: { type: "boolean" } } } } } },
        responses: { "200": { description: "Updated profile" } },
      },
    },
    "/admin/auth-bans": {
      get: {
        tags: ["Admin"],
        summary: "List auth bans (admin only)",
        responses: { "200": { description: "Array of bans" } },
      },
      delete: {
        tags: ["Admin"],
        summary: "Remove an auth ban (admin only)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Removed" } },
      },
    },
    "/admin/auth-unlock": {
      post: {
        tags: ["Admin"],
        summary: "Manually unlock an account (admin only)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["userId"], properties: { userId: { type: "string" } } } } } },
        responses: { "200": { description: "Unlocked" } },
      },
    },
    "/admin/auth-logs": {
      get: {
        tags: ["Admin"],
        summary: "List authentication logs (admin only)",
        responses: { "200": { description: "Array of auth logs" } },
      },
    },
    "/admin/roles": {
      get: {
        tags: ["Admin"],
        summary: "List all roles with their permissions (admin only)",
        responses: { "200": { description: "Array of roles" } },
      },
      post: {
        tags: ["Admin"],
        summary: "Create a custom role (admin only)",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RoleInput" } } } },
        responses: { "201": { description: "Created role" }, "409": { description: "Role name already exists" } },
      },
    },
    "/admin/roles/{id}": {
      patch: {
        tags: ["Admin"],
        summary: "Update a role (admin only). The Admin role's permissions are locked.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RoleInput" } } } },
        responses: { "200": { description: "Updated role" }, "400": { description: "Admin role permissions are locked or reserved name" } },
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete a custom role with no users (admin only)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" }, "400": { description: "System roles cannot be deleted or role still has users" } },
      },
    },
    "/admin/badges": {
      get: {
        tags: ["Admin"],
        summary: "List all badges (admin only)",
        responses: { "200": { description: "Array of badges" } },
      },
      post: {
        tags: ["Admin"],
        summary: "Create a badge (admin only)",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/BadgeInput" } } } },
        responses: { "201": { description: "Created badge" }, "409": { description: "Badge slug already exists" } },
      },
    },
    "/admin/badges/{id}": {
      patch: {
        tags: ["Admin"],
        summary: "Update a badge (admin only)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/BadgeInput" } } } },
        responses: { "200": { description: "Updated badge" } },
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete a badge (admin only). System badges cannot be deleted.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" }, "400": { description: "System badges cannot be deleted" } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      SelfUser: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          username: { type: "string" },
          email: { type: "string" },
          role: { type: ["object", "null"] },
          permissions: { type: "array", items: { type: "string" } },
          isAdmin: { type: "boolean" },
          tier: { type: "string", enum: ["FREE", "PRO", "ENTERPRISE"] },
          apiLevel: { type: "string", enum: ["basic", "advanced", "enterprise"], description: "Effective API access: tier default, raised by the api.basic/api.advanced/api.enterprise role permissions" },
          trackLimit: { type: ["integer", "null"] },
          profileLimit: { type: ["integer", "null"] },
          aliasLimit: { type: ["integer", "null"] },
          badges: { type: "array", items: { type: "string", format: "uuid" } },
          totpEnabled: { type: "boolean" },
        },
      },
      Profile: {
        type: "object",
        properties: {
          id: { type: "string" },
          userId: { type: "string" },
          slug: { type: "string", description: "Public URL slug" },
          isPrimary: { type: "boolean", description: "True for the account's primary profile" },
          badges: { type: "array", items: { type: "string", format: "uuid" }, description: "Badge ids; resolve via GET /badges" },
          displayName: { type: ["string", "null"] },
          bio: { type: ["string", "null"] },
          avatar: { type: ["string", "null"] },
          banner: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          website: { type: ["string", "null"] },
          socialLinks: { type: ["array", "null"], items: { $ref: "#/components/schemas/SocialLink" } },
          theme: { $ref: "#/components/schemas/Theme" },
          isPublic: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      PublicProfile: {
        type: "object",
        description: "Public profile payload. requestedSlug echoes the slug/alias used to reach it; slug is the canonical profile slug.",
        properties: {
          id: { type: "string" },
          userId: { type: "string" },
          username: { type: "string", description: "Owner username" },
          slug: { type: "string", description: "Canonical profile slug" },
          requestedSlug: { type: "string", description: "The slug or alias that was requested" },
          isPrimary: { type: "boolean" },
          badges: { type: "array", items: { type: "string", format: "uuid" }, description: "Badge ids; resolve via GET /badges" },
          displayName: { type: ["string", "null"] },
          bio: { type: ["string", "null"] },
          avatar: { type: ["string", "null"] },
          banner: { type: ["string", "null"] },
          location: { type: ["string", "null"] },
          website: { type: ["string", "null"] },
          socialLinks: { type: ["array", "null"], items: { $ref: "#/components/schemas/SocialLink" } },
          theme: { $ref: "#/components/schemas/Theme" },
          isPublic: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          musicTracks: { type: "array", items: { type: "object" } },
          discord: { $ref: "#/components/schemas/PublicDiscord" },
        },
      },
      ProfileAlias: {
        type: "object",
        properties: {
          id: { type: "string" },
          profileId: { type: "string" },
          slug: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      MyProfiles: {
        type: "object",
        properties: {
          profiles: { type: "array", items: { $ref: "#/components/schemas/Profile" } },
          limits: {
            type: "object",
            properties: {
              profiles: { type: "integer", description: "Max profiles for the account tier (or admin override)" },
              aliases: { type: "integer", description: "Max aliases per profile" },
            },
          },
          primaryId: { type: ["string", "null"] },
          aliasCount: { type: "integer", description: "Total aliases across all profiles" },
        },
      },
      Badge: {
        type: "object",
        description: "A badge from the catalog",
        properties: {
          id: { type: "string", format: "uuid" },
          slug: { type: "string" },
          label: { type: "string" },
          color: { type: "string", description: "Hex color used to render the badge" },
          icon: { type: "string", description: "Lucide icon name" },
          isSystem: { type: "boolean", description: "System badges cannot be deleted" },
        },
      },
      BadgeInput: {
        type: "object",
        required: ["label", "color", "icon"],
        properties: {
          slug: { type: "string", description: "Optional unique slug (defaults to the label)" },
          label: { type: "string", maxLength: 32 },
          color: { type: "string", description: "Hex color, e.g. #22c55e" },
          icon: { type: "string", description: "Lucide icon name, e.g. Award" },
        },
      },
      Role: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          slug: { type: "string" },
          description: { type: ["string", "null"] },
          isSystem: { type: "boolean" },
          permissions: { type: "array", items: { $ref: "#/components/schemas/RolePermission" } },
        },
      },
      RoleInput: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 32 },
          description: { type: ["string", "null"] },
          permissions: { type: "array", items: { $ref: "#/components/schemas/RolePermission" } },
        },
      },
      RolePermission: {
        type: "string",
        enum: ["users.view", "users.manage", "profiles.manage", "invites.manage", "invites.generate", "bans.manage", "roles.manage", "badges.manage", "logs.view"],
      },
      PublicDiscord: {
        type: ["object", "null"],
        description: "Present when the owner connected Discord and enabled presence",
        properties: {
          username: { type: "string" },
          globalName: { type: ["string", "null"] },
          avatar: { type: ["string", "null"] },
          presence: {
            type: ["object", "null"],
            properties: {
              status: { type: "string", enum: ["online", "idle", "dnd", "offline"] },
              statusLabel: { type: "string" },
              activities: { type: "array", items: { $ref: "#/components/schemas/DiscordActivity" } },
              line: { type: ["string", "null"] },
              customStatus: { type: ["string", "null"] },
              updatedAt: { type: ["integer", "null"] },
            },
          },
        },
      },
      DiscordActivity: {
        type: "object",
        properties: {
          type: { type: "integer", description: "0 Game, 1 Streaming, 2 Listening, 3 Watching, 4 Custom, 5 Competing, 6 Hanging" },
          name: { type: "string" },
          details: { type: ["string", "null"] },
          state: { type: ["string", "null"] },
          applicationId: { type: ["string", "null"] },
          largeImage: { type: ["string", "null"] },
          smallImage: { type: ["string", "null"] },
          buttons: { type: ["array", "null"], items: { type: "string" }, description: "Presence button labels only (Discord never includes URLs)" },
          timestamps: {
            type: ["object", "null"],
            properties: {
              start: { type: ["integer", "null"], description: "Epoch ms the activity started" },
              end: { type: ["integer", "null"], description: "Epoch ms the activity ends (e.g. track length for Spotify)" },
            },
          },
        },
      },
      SocialLink: {
        type: "object",
        required: ["platform", "url"],
        properties: {
          platform: { type: "string", description: "Must be a platform from the allowlist" },
          url: { type: "string", description: "Valid http(s)/mailto URL" },
        },
      },
      Theme: {
        type: "object",
        properties: {
          bg: { type: "string" },
          cardBg: { type: "string" },
          text: { type: "string" },
          accent: { type: "string" },
          fontFamily: { type: "string" },
        },
      },
      WebhookEvent: {
        type: "string",
        enum: ["profile.viewed", "link.clicked", "profile.updated", "profile.created", "profile.deleted", "user.registered", "user.updated", "webhook.test"],
      },
    },
  },
} as const;
