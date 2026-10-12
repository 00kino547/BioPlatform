export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "BioPlatform API",
    version: "1.3.1",
    description:
      "REST API for the BioPlatform link-in-bio service. Authenticated endpoints require a Bearer token returned by /api/auth/login or /api/auth/oauth/exchange. Registration sends a verification email and does not issue a token until the mailbox is confirmed (POST /api/auth/verify-email). Public profile data is available without authentication.",
  },
  servers: [{ url: "/api" }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Config" },
    { name: "I18n" },
    { name: "Health" },
    { name: "Version" },
    { name: "Auth" },
    { name: "Captcha" },
    { name: "Profiles" },
    { name: "Analytics" },
    { name: "Email" },
    { name: "Music" },
    { name: "Media" },
    { name: "Privacy" },
    { name: "Newsletter" },
    { name: "Tips" },
    { name: "Shop" },
    { name: "Webhooks" },
    { name: "Discord" },
    { name: "Invites" },
    { name: "Badges" },
    { name: "Custom Domains" },
    { name: "Orders" },
    { name: "Dmca" },
    { name: "Admin" },
  ],
  paths: {
    "/media/proxy": {
      get: {
        tags: ["Media"],
        summary: "Proxy external background images",
        description:
          "Securely fetches an external https image URL server-side and returns it as image data. Used to render user-supplied custom profile background URLs without loosening the Content-Security-Policy img-src allowlist. Only raster image content types are allowed (SVG is rejected to avoid embedded scripts); the target host is validated to prevent SSRF against private networks. Results are cached on disk for a configurable TTL.",
        security: [],
        parameters: [
          { name: "url", in: "query", required: true, schema: { type: "string" }, description: "The https:// image URL to proxy." },
        ],
        responses: {
          "200": {
            description: "The proxied image bytes.",
            content: {
              "image/jpeg": { schema: { type: "string", format: "binary" } },
              "image/png": { schema: { type: "string", format: "binary" } },
              "image/gif": { schema: { type: "string", format: "binary" } },
              "image/webp": { schema: { type: "string", format: "binary" } },
            },
          },
          "415": { description: "Unsupported image content type" },
          "502": { description: "Upstream fetch failed, blocked host, or non-https URL" },
        },
      },
    },

    "/privacy/consent": {
      get: {
        tags: ["Privacy"],
        summary: "Get cookie consent status",
        description:
          "Returns the visitor's current cookie consent decision ('accept', 'essential', or 'unknown'), the presence of a Do Not Track / Global Privacy Control signal (`dnt`), and the effective privacy mode. When DNT/GPC is sent, `consent` and `effective` are forced to 'essential' regardless of any stored cookie.",
        security: [],
        responses: {
          "200": {
            description: "Consent status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        consent: { type: "string", enum: ["accept", "essential", "unknown"] },
                        dnt: { type: "boolean", description: "Visitor sent DNT: 1 or Sec-GPC: 1" },
                        effective: { type: "string", enum: ["accept", "essential", "unknown"] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Privacy"],
        summary: "Record cookie consent decision",
        description:
          "Records the visitor's cookie consent. 'accept' enables the non-essential anonymous analytics cookie (bp_vid); 'essential' disables it (and clears any existing bp_vid). Essential cookies (auth session, rate-limit fingerprint) are always active regardless of this choice. Do Not Track / Global Privacy Control always win: when DNT or Sec-GPC is sent, the decision is forced to 'essential' and analytics are never enabled.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["decision"],
                properties: { decision: { type: "string", enum: ["accept", "essential"] } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Consent recorded" },
          "400": { description: "Invalid decision" },
        },
      },
    },

    "/privacy/consent/revoke": {
      post: {
        tags: ["Privacy"],
        summary: "Revoke cookie consent",
        description: "Clears the consent decision and the analytics cookie, returning consent to 'unknown'.",
        security: [],
        responses: {
          "200": { description: "Consent cleared" },
        },
      },
    },

    "/captcha/config": {
      get: {
        tags: ["Captcha"],
        summary: "Get captcha configuration",
        description:
          "Public configuration for the human-verification challenge used on registration and login. `enabled` is true only when a provider is configured. `siteKey` is the public client key (safe to expose); the secret key is never returned. When `enabled` is false, clients must not show a captcha widget.",
        security: [],
        responses: {
          "200": {
            description: "Captcha configuration",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        provider: { type: "string", enum: ["turnstile", "recaptcha", "hcaptcha", "none"] },
                        siteKey: { type: "string" },
                        enabled: { type: "boolean" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/analytics/config": {
      get: {
        tags: ["Analytics"],
        summary: "Get external analytics configuration",
        description:
          "Public configuration for the optional self-hosted analytics service (Matomo). `enabled` is true only when a Matomo instance is configured. The tracker must only be loaded client-side after the visitor accepts non-essential cookies and when no Do Not Track / Global Privacy Control signal is present.",
        security: [],
        responses: {
          "200": {
            description: "Analytics configuration",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        provider: { type: "string", enum: ["matomo", "none"] },
                        enabled: { type: "boolean" },
                        matomoUrl: { type: "string" },
                        matomoSiteId: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        description:
          "Real readiness probe. Pings the database through the actual Prisma client and runs a full-scalar read of every core model (profiles, users, seasonal_themes, invite_codes, newsletter_subscribers, orders, products, tips) so a missing column or table (schema drift) is surfaced instead of a bare `ok` — a container can no longer report healthy while every real route throws Prisma P2021. Also reports the cache driver state. Returns 200 with the full report when everything passes, and 503 with the same body when the DB is unreachable or the schema drifted from what the running client expects.",
        security: [],
        responses: {
          "200": {
            description: "All core checks pass",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthReport" },
              },
            },
          },
          "503": {
            description: "Database unreachable or schema drift detected",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthReport" },
              },
            },
          },
        },
      },
    },

    "/config": {
      get: {
        tags: ["Config"],
        summary: "Public instance configuration (config.yml)",
        description:
          "Returns the PUBLIC part of the instance's config.yml: the landing hero/footer copy, the announcement bar, hidePricing and (when enabled) the ad slot configuration plus any site-verification meta tags. The guarantee is that this endpoint ONLY ever carries data safe to ship to a public browser — the `private` section of config.yml (operator mailbox, ad secrets) is parsed and validated server-side but is never serialized anywhere. Hot-reloads in place; a response may change between requests without a restart. This endpoint is unauthenticated and its response is cacheable for 60 s.",
        security: [],
        responses: {
          "200": {
            description: "Public instance configuration",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        landing: {
                          type: "object",
                          properties: {
                            tagline: { type: "string" },
                            hero: { type: "object", properties: { heading: { type: "string" }, subheading: { type: "string" } } },
                            footerAbout: { type: "string" },
                          },
                        },
                        policy: {
                          type: "object",
                          properties: {
                            operatorName: { type: "string" },
                            operatorContact: { type: "string" },
                            jurisdiction: { type: "string" },
                          },
                        },
                        operational: {
                          type: "object",
                          properties: {
                            announcement: { type: "object", properties: { message: { type: "string" }, href: { type: "string" } } },
                            hidePricing: { type: "boolean", description: "True hides the pricing section from the landing page" },
                          },
                        },
                        ads: {
                          type: "object",
                          description: "Present only when ads are enabled for this instance",
                          properties: {
                            enabled: { type: "boolean" },
                            freeOptOutAllowed: {
                              type: "boolean",
                              description: "Derived from the ADS_FREE_OPT_OUT_ALLOWED env var, always current",
                            },
                            verificationMeta: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: { name: { type: "string" }, content: { type: "string" } },
                              },
                              description: "Meta tags rendered on public profile pages for ad-network site verification",
                            },
                            slots: {
                              type: "array",
                              items: {
                                type: "object",
                                properties: {
                                  network: { type: "string", description: "One of the 8 supported networks or raw" },
                                  placement: { type: "string" },
                                  params: {
                                    type: "object",
                                    properties: {
                                      adsense: {
                                        type: "object",
                                        properties: {
                                          client: { type: "string" },
                                          slot: { type: "string" },
                                          autoEnabled: { type: "boolean" },
                                        },
                                      },
                                      script: {
                                        type: "object",
                                        properties: { src: { type: "string" }, token: { type: "string" } },
                                      },
                                      raw: {
                                        type: "string",
                                        description: "Operator snippet, network: raw. Not sanitized; must not carry secrets.",
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/openapi.json": {
      get: {
        tags: ["Config"],
        summary: "This OpenAPI document",
        security: [],
        description: "Serves the raw OpenAPI 3.0 document that backs the frontend API reference page. Public.",
        responses: { "200": { description: "OpenAPI 3.0 document", content: { "application/json": { schema: { type: "object" } } } } },
      },
    },

    "/i18n/config": {
      get: {
        tags: ["I18n"],
        summary: "Internationalization settings (structure scaffold)",
        description:
          "Returns the i18n configuration exposed by the instance: whether i18n is enabled, the default/fallback locale, and the locales the instance exposes. This route is a structure placeholder while the i18n pipeline is not implemented — it currently answers 503 with code `i18n_not_implemented` instead of a 200 payload so consumers can distinguish 'not implemented yet' from a real failure.",
        security: [],
        responses: {
          "503": {
            description: "Not implemented yet — `{ success:false, error, code:\"i18n_not_implemented\" }`",
          },
          "200": {
            description: "Planned contract: `{ success:true, data:{ enabled, defaultLocale, fallbackLocale, locales } }`",
          },
        },
      },
    },

    "/i18n/locales": {
      get: {
        tags: ["I18n"],
        summary: "Available locale metadata (structure scaffold)",
        description:
          "Returns metadata for the locales the instance exposes — intended to feed the frontend language picker once i18n is wired up (en + es ship first, Spanish as an English placeholder). Structure only: currently answers 503 with code `i18n_not_implemented` so consumers can distinguish 'not implemented yet' from a real failure.",
        security: [],
        responses: {
          "503": {
            description: "Not implemented yet — `{ success:false, error, code:\"i18n_not_implemented\" }`",
          },
          "200": {
            description: "Planned contract: `{ success:true, data:{ defaultLocale, fallbackLocale, locales } }`",
          },
        },
      },
    },

    "/version": {
      get: {
        tags: ["Version"],
        summary: "Software version and update check",
        description:
          "Returns the installed version and, when enabled, the latest version and severity derived from the public CHANGELOG. No authentication required for the cached result. Passing ?force=1 bypasses the cache and re-fetches from GitHub and requires an authenticated administrator. When a critical or security update is pending, security-sensitive endpoints (passkeys, TOTP, password change, admin user/role/badge mutations, webhook create/update/rotate/delete) return 403 with updateRequired:true.",
        security: [],
        parameters: [
          { name: "force", in: "query", required: false, schema: { type: "string", enum: ["1"] }, description: "Bypass the cached result and re-fetch from GitHub. Requires an authenticated administrator." },
        ],
        responses: {
          "200": {
            description: "Version check data",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        enabled: { type: "boolean", description: "Whether the update check is enabled on the server" },
                        installed: { type: "string", description: "Installed version of the app" },
                        latest: { type: "string", nullable: true, description: "Latest released version from the CHANGELOG" },
                        outdated: { type: "boolean" },
                        severity: { type: "string", enum: ["none", "update", "security", "critical"] },
                        skippedVersions: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              version: { type: "string" },
                              date: { type: "string", nullable: true },
                              sections: { type: "array", items: { type: "object", properties: { heading: { type: "string" }, items: { type: "array", items: { type: "string" } } } } },
                            },
                          },
                        },
                        skippedCount: { type: "integer" },
                        releaseUrl: { type: "string" },
                        releasesUrl: { type: "string" },
                        changelogUrl: { type: "string" },
                        checkedAt: { type: "string", format: "date-time" },
                        source: { type: "string", enum: ["github-raw", "github-api", "jsdelivr", "cache", "none"], description: "Where the CHANGELOG was fetched from" },
                        error: { type: "string", nullable: true, description: "Present when the check failed; the app stays fully functional (fail-open)" },
                      },
                    },
                  },
                },
              },
            },
          },
          "500": { description: "Version check failed" },
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
                required: ["username", "email", "password", "inviteCode", "acceptedPolicies"],
                properties: {
                  username: { type: "string", minLength: 3, maxLength: 32, pattern: "^[a-z0-9_-]+$", description: "Unique public username" },
                  email: { type: "string", format: "email", maxLength: 254 },
                  password: { type: "string", minLength: 8, maxLength: 128, description: "Password (bcrypt, 12 rounds)" },
                  inviteCode: { type: "string", minLength: 1, maxLength: 128, description: "Valid registration invite code" },
                  acceptedPolicies: { type: "boolean", enum: [true], description: "Must be true: consent to the Terms of Service and Privacy Policy. Recorded with the current policy versions." },
                  newsletterOptIn: { type: "boolean", description: "Optional opt-in for platform announcements (admin broadcasts). Unsubscribable at any time." },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Verification email sent. Returns { status: 'verification_required', emailSent, warning? }. No session token — the account cannot sign in until the email is verified." },
          "400": { description: "Validation error. The response includes fieldErrors keyed by registration field." },
          "409": { description: "Username or email is already taken. The response includes fieldErrors." },
        },
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
          "403": { description: "Email not verified (verifyEmailRequired:true). Not counted as a failed login." },
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
    "/auth/login/passkey/discoverable/options": {
      post: {
        tags: ["Auth"],
        summary: "Get WebAuthn assertion options for passwordless login without a username",
        security: [],
        description:
          "Discoverable-credential variant of `POST /auth/login/passkey/options`: does not take an identifier — the authenticator resolves which resident key to use. Returns `PublicKeyCredentialRequestOptionsJSON`.",
        responses: { "200": { description: "PublicKeyCredentialRequestOptionsJSON" } },
      },
    },
    "/auth/login/passkey/discoverable/verify": {
      post: {
        tags: ["Auth"],
        summary: "Verify a discoverable credential assertion and log in",
        security: [],
        description:
          "Verifies an assertion produced against `POST /auth/login/passkey/discoverable/options` — no identifier is required because the credential itself maps to the account. Returns token + user.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["response"], properties: { response: { type: "object" } } } } },
        },
        responses: { "200": { description: "token + user" }, "401": { description: "Invalid assertion" } },
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
    "/auth/accept-policies": {
      post: {
        tags: ["Auth"],
        summary: "Accept the instance's ToS / privacy policy for the current user",
        description:
          "Records explicit acceptance of the instance's policies for the signed-in user. Used when the instance requires acknowledgement and the user has not yet accepted. Requires authentication. No body — acceptance of the current policy versions is implicit.",
        security: [],
        responses: { "200": { description: "Accepted: returns accepted versions" }, "401": { description: "Not authenticated" } },
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
    "/auth/verify-email": {
      post: {
        tags: ["Auth"],
        summary: "Confirm an account mailbox with the verification-link token",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string" } } } } } },
        responses: {
          "200": { description: "Email verified. Idempotent: already-verified accounts get { status:'verified', alreadyVerified:true }." },
          "400": { description: "Invalid, tampered, wrong-purpose, or expired verification link" },
        },
      },
    },
    "/auth/verify-email/send": {
      post: {
        tags: ["Auth"],
        summary: "Re-send the verification email to an unverified account",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { identifier: { type: "string" } } } } } },
        responses: {
          "200": { description: "sent:true — same shape for unknown/already-verified identifiers (anti-enumeration)" },
          "429": { description: "Per-IP resend limit exceeded (5/hr)" },
          "503": { description: "Email is not configured" },
        },
      },
    },

    "/auth/oauth/config": {
      get: {
        tags: ["Auth"],
        summary: "SSO configuration for the login/register forms",
        security: [],
        responses: { "200": { description: "Enabled providers plus the instance signup-invite and 2FA-bypass flags" } },
      },
    },
    "/auth/oauth/start": {
      post: {
        tags: ["Auth"],
        summary: "Start an SSO login/signup/link flow (returns the provider authorize URL)",
        description:
          "Public for mode=login/signup; requires a bearer token for mode=link (links the provider to the signed-in account). Sets an httpOnly, path-scoped state cookie validated on the callback. The authorize URL uses PKCE (S256); the PKCE verifier rides inside the signed state token, so no server-side session storage is needed.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["provider", "mode"], properties: { provider: { type: "string", enum: ["google", "github", "discord"] }, mode: { type: "string", enum: ["login", "signup", "link"] }, invite: { type: "string", description: "Optional invite code, embedded in the state when signing up" } } } } },
        },
        responses: { "200": { description: "{ redirectUrl, provider, mode }" }, "400": { description: "Provider not configured or invalid" }, "401": { description: "mode=link without a valid bearer token" } },
      },
    },
    "/auth/oauth/callback": {
      get: {
        tags: ["Auth"],
        summary: "Provider OAuth2 callback (browser redirect)",
        description:
          "Verifies the state cookie matches the returned state, exchanges the authorization code for the provider profile, and redirects to the frontend /oauth/callback. The provider is recovered from the signed state token (providers do not echo a provider parameter). If the provider returns an error (e.g. error=access_denied) the user is redirected with ?error=... instead. Link mode redirects with result=linked. Login/signup mode redirects with a short-lived one-time exchange code.",
        security: [],
        parameters: [
          { name: "code", in: "query", required: true, schema: { type: "string" } },
          { name: "state", in: "query", required: true, schema: { type: "string" } },
          { name: "provider", in: "query", required: false, description: "Optional; if present, must match the provider inside the signed state token", schema: { type: "string", enum: ["google", "github", "discord"] } },
          { name: "error", in: "query", required: false, description: "Provider error (e.g. access_denied)", schema: { type: "string" } },
        ],
        responses: { "302": { description: "Redirect to the frontend with ?code=..., ?result=linked, or ?error=..." }, "400": { description: "State mismatch or provider failure" } },
      },
    },
    "/auth/oauth/exchange": {
      post: {
        tags: ["Auth"],
        summary: "Exchange an SSO code for login/setup results",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["code"], properties: { code: { type: "string", description: "One-time code from the SSO callback redirect" } } } } } },
        responses: {
          "200": {
            description:
              "logged_in (JWT + user), needs_two_factor (twoFactorToken + available methods, reused by the existing 2FA screen), or needs_setup (signupToken + provider info for the completion form). Auto-creates a verified account when the instance allows public signup. A provider-verified email matching an existing UNVERIFIED account verifies that account and logs in; a self-typed email during signup completes as { status:'verification_required', emailSent } with no session.",
          },
        },
      },
    },
    "/auth/oauth/signup": {
      post: {
        tags: ["Auth"],
        summary: "Complete an SSO account setup (choose username, provide email/invite)",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["signupToken", "username"], properties: { signupToken: { type: "string" }, username: { type: "string", pattern: "^[a-z0-9_-]+$", minLength: 3, maxLength: 32 }, email: { type: "string", format: "email", description: "Required when the provider returned no verified email" }, inviteCode: { type: "string", description: "Required when SSO_SIGNUP_REQUIRES_INVITE=true" } } } } } },
        responses: { "201": { description: "Account created. With a provider-verified email it returns the JWT + user directly; a self-typed email stays unverified and returns { status:'verification_required', emailSent } (no session until the mailbox is confirmed via /auth/verify-email)" }, "400": { description: "Validation error" }, "409": { description: "Username/email taken or invite already claimed from this device" } },
      },
    },

    "/auth/sso/config": {
      get: {
        tags: ["Auth"],
        summary: "Get the ENTERPRISE account owner's OIDC SSO configuration",
        description: "Requires a bearer token for an account whose API level is enterprise. Returns null when not configured. The client secret is never returned — only a masked suffix.",
        responses: { "200": { description: "Current configuration or null (not configured)" }, "403": { description: "Requires the enterprise API tier" } },
      },
      put: {
        tags: ["Auth"],
        summary: "Create or update the OIDC SSO configuration",
        description:
          "Requires the enterprise API tier. Issuer discovery: the issuerUrl may be the OIDC discovery URL or the bare issuer (the server appends /.well-known/openid-configuration). clientSecret is required on create; on update, omit it to keep the stored value. The client secret is encrypted at rest (AES-256-GCM).",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["issuerUrl", "clientId", "displayName"], properties: { issuerUrl: { type: "string", format: "url", description: "OIDC issuer or discovery URL (HTTPS)" }, clientId: { type: "string" }, clientSecret: { type: "string" }, scopes: { type: "string", default: "openid email profile" }, displayName: { type: "string", description: "Required. Shown on the 'Continue with <name>' button and in the Business SSO menu" }, logoUrl: { type: "string", format: "url" }, allowedDomains: { type: "string", description: "Comma-separated domains allowed to sign in; empty allows any verified email from the provider" }, enforced: { type: "boolean", default: false, description: "When true, the owner account can only sign in via this SSO provider" }, enabled: { type: "boolean", default: true } } } } },
        },
        responses: { "200": { description: "{ id, saved }" }, "400": { description: "Validation error or missing client secret on create" }, "403": { description: "Requires the enterprise API tier" } },
      },
      delete: {
        tags: ["Auth"],
        summary: "Remove the OIDC SSO configuration",
        responses: { "200": { description: "{ removed: true }" }, "404": { description: "Not configured" } },
      },
    },
    "/auth/sso/configs": {
      get: {
        tags: ["Auth"],
        summary: "Public list of enabled enterprise SSO providers",
        security: [],
        responses: { "200": { description: "Enabled providers (id, displayName, logoUrl, issuerHost) for the login/register forms" } },
      },
    },
    "/auth/sso/start": {
      post: {
        tags: ["Auth"],
        summary: "Start an enterprise SSO login/link flow",
        description:
          "Public for mode=login; requires a bearer token for mode=link, and only the account that owns the provider may link it. Runs OIDC discovery, then returns the provider authorize URL using PKCE (S256) with a signed path-scoped state cookie.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["configId"], properties: { configId: { type: "string", format: "uuid" }, mode: { type: "string", enum: ["login", "link"], default: "login" } } } } } },
        responses: { "200": { description: "{ redirectUrl }" }, "401": { description: "mode=link without a token" }, "403": { description: "Only the owning account can link" }, "404": { description: "Provider disabled or missing" }, "502": { description: "Discovery failed" } },
      },
    },
    "/auth/sso/callback": {
      get: {
        tags: ["Auth"],
        summary: "OIDC authorization callback (browser redirect)",
        description:
          "Verifies the state cookie matches the returned state, exchanges the authorization code, validates the ID token against the provider JWKS (issuer + audience), enforces the allowed email domains, and redirects to the frontend /sso/callback with a one-time exchange code (?code=...), ?status=linked, or ?error=...",
        security: [],
        parameters: [
          { name: "code", in: "query", required: true, schema: { type: "string" } },
          { name: "state", in: "query", required: true, schema: { type: "string" } },
          { name: "error", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: { "302": { description: "Redirect to the frontend" }, "400": { description: "State mismatch, profile/email problems, or provider failure" } },
      },
    },
    "/auth/sso/exchange": {
      post: {
        tags: ["Auth"],
        summary: "Exchange the SSO code for a login (or 2FA challenge)",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["code"], properties: { code: { type: "string", description: "One-time code from the SSO callback redirect" } } } } } },
        responses: {
          "200": {
            description:
              "logged_in (JWT + user) or needs_two_factor (twoFactorToken + methods). First-time sign-in links the OIDC identity to the existing account whose verified email matches; accounts that do not exist yet are rejected (no org provisioning — the owner invites seat users first).",
          },
          "403": { description: "Email not allowed on this provider" },
          "404": { description: "No account matches the verified email" },
        },
      },
    },
    "/auth/sso/identities": {
      get: {
        tags: ["Auth"],
        summary: "List the account's linked enterprise SSO identities",
        responses: { "200": { description: "Linked identities with provider displayName and enforced flag" } },
      },
    },
    "/auth/sso/identities/{id}": {
      delete: {
        tags: ["Auth"],
        summary: "Unlink an enterprise SSO identity from the account",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Unlinked" }, "404": { description: "Identity not found" }, "409": { description: "Only sign-in method, or the account's SSO is enforced" } },
      },
    },
    "/auth/oauth/accounts": {
      get: {
        tags: ["Auth"],
        summary: "List linked SSO providers",
        responses: { "200": { description: "Linked OAuth accounts, the user's oauthBypass2fa flag, whether the instance allows it, and authMethods" } },
      },
    },
    "/auth/oauth/accounts/{provider}/{providerAccountId}": {
      delete: {
        tags: ["Auth"],
        summary: "Unlink an SSO provider",
        parameters: [
          { name: "provider", in: "path", required: true, schema: { type: "string" } },
          { name: "providerAccountId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Unlinked" }, "404": { description: "Account not found" } },
      },
    },
    "/auth/oauth/settings": {
      put: {
        tags: ["Auth"],
        summary: "Toggle whether SSO skips your 2FA step (when the instance allows it)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["oauthBypass2fa"], properties: { oauthBypass2fa: { type: "boolean" } } } } } },
        responses: { "200": { description: "Updated flag" }, "403": { description: "SSO_2FA_BYPASS_ALLOWED is false on this instance" } },
      },
    },
    "/auth/oauth/pocketbase/config": {
      get: {
        tags: ["Auth"],
        summary: "PocketBase OAuth provider configuration",
        description: "Returns whether the optional PocketBase sign-in provider is enabled on this instance, plus the browser-facing client URL, the auth collection name, and the `signupRequiresInvite` / `twoFactorBypassAllowed` capability flags. Returns `{ enabled: false }` when PocketBase is not configured. Public.",
        security: [],
        responses: { "200": { description: "{ enabled, clientUrl, authCollection, signupRequiresInvite, twoFactorBypassAllowed }" } },
      },
    },
    "/auth/oauth/pocketbase/exchange": {
      post: {
        tags: ["Auth"],
        summary: "Exchange a PocketBase auth token for a platform session",
        description:
          "Signs the user in from a PocketBase collection auth record's token (rate-limited): an already-linked identity signs in, else a verified email already on an account auto-links, else onboarding continues through the invite gate. Answers 404 when PocketBase is not enabled and 400 for any invalid/expired token.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string", minLength: 20, maxLength: 4096 }, invite: { type: "string", minLength: 1, maxLength: 128 } } } } } },
        responses: { "200": { description: "token + user (or needs_setup)" }, "400": { description: "Invalid body or expired PocketBase session" }, "404": { description: "PocketBase sign-in not enabled" } },
      },
    },
    "/auth/oauth/pocketbase/link": {
      post: {
        tags: ["Auth"],
        summary: "Link a PocketBase identity to the signed-in account",
        description:
          "Links the current account to a PocketBase auth record via its token (rate-limited, authentication required). Only a PB-verified email may be linked. Answers 404 when disabled, 400 for an invalid token or unverified email, and 409 when the identity is already linked to another account.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string", minLength: 20, maxLength: 4096 } } } } } },
        responses: { "200": { description: "linked (or alreadyLinked)" }, "400": { description: "Invalid token or unverified email" }, "404": { description: "PocketBase sign-in not enabled" }, "409": { description: "Identity already linked to another account" } },
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
                  presenceStatus: { type: ["string", "null"], enum: ["online", "idle", "offline"], description: "Static status shown on the public profile" },
                  countdown: { type: ["object", "null"], properties: { label: { type: "string", maxLength: 60 }, targetDate: { type: "string" } }, description: "Live countdown block shown on the public profile" },
                  newsletterEnabled: { type: "boolean", description: "Master newsletter switch; when off the public form stays visible and still collects signups (pause), only sending is disabled" },
                  newsletterVisible: { type: "boolean", description: "Whether the public subscribe form is shown on the profile" },
                  newsletterHeading: { type: "string", maxLength: 60, description: "Heading shown above the public subscribe form" },
                  tipsEnabled: { type: "boolean", description: "Master tips switch; tips only work when at least one wallet address is set" },
                  tipsHeading: { type: "string", maxLength: 60, description: "Heading shown above the public tip block" },
                  tipsBtcAddress: { type: ["string", "null"], description: "Bitcoin address (only exposed publicly once tips are enabled)" },
                  tipsLtcAddress: { type: ["string", "null"], description: "Litecoin address (only exposed publicly once tips are enabled)" },
                  shopDiscountPercent: { type: ["integer", "null"], minimum: 0, maximum: 100, description: "Per-profile discount applied to every product price (0-100)" },
                  theme: { $ref: "#/components/schemas/Theme" },
                  terminalCommands: { type: ["array", "null"], items: { $ref: "#/components/schemas/TerminalCommand" }, description: "Requires PRO or ENTERPRISE tier" },
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
                  presenceStatus: { type: ["string", "null"], enum: ["online", "idle", "offline"], description: "Static status shown on the public profile" },
                  countdown: { type: ["object", "null"], properties: { label: { type: "string", maxLength: 60 }, targetDate: { type: "string" } }, description: "Live countdown block shown on the public profile" },
                  newsletterEnabled: { type: "boolean", description: "Master newsletter switch; when off the public form stays visible and still collects signups (pause), only sending is disabled" },
                  newsletterVisible: { type: "boolean", description: "Whether the public subscribe form is shown on the profile" },
                  newsletterHeading: { type: "string", maxLength: 60, description: "Heading shown above the public subscribe form" },
                  tipsEnabled: { type: "boolean", description: "Master tips switch; tips only work when at least one wallet address is set" },
                  tipsHeading: { type: "string", maxLength: 60, description: "Heading shown above the public tip block" },
                  tipsBtcAddress: { type: ["string", "null"], description: "Bitcoin address (only exposed publicly once tips are enabled)" },
                  tipsLtcAddress: { type: ["string", "null"], description: "Litecoin address (only exposed publicly once tips are enabled)" },
                  shopDiscountPercent: { type: ["integer", "null"], minimum: 0, maximum: 100, description: "Per-profile discount applied to every product price (0-100)" },
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
                  presenceStatus: { type: ["string", "null"], enum: ["online", "idle", "offline"], description: "Static status shown on the public profile" },
                  countdown: { type: ["object", "null"], properties: { label: { type: "string", maxLength: 60 }, targetDate: { type: "string" } }, description: "Live countdown block shown on the public profile" },
                  newsletterEnabled: { type: "boolean", description: "Master newsletter switch; when off the public form stays visible and still collects signups (pause), only sending is disabled" },
                  newsletterVisible: { type: "boolean", description: "Whether the public subscribe form is shown on the profile" },
                  newsletterHeading: { type: "string", maxLength: 60, description: "Heading shown above the public subscribe form" },
                  tipsEnabled: { type: "boolean", description: "Master tips switch; tips only work when at least one wallet address is set" },
                  tipsHeading: { type: "string", maxLength: 60, description: "Heading shown above the public tip block" },
                  tipsBtcAddress: { type: ["string", "null"], description: "Bitcoin address (only exposed publicly once tips are enabled)" },
                  tipsLtcAddress: { type: ["string", "null"], description: "Litecoin address (only exposed publicly once tips are enabled)" },
                  shopDiscountPercent: { type: ["integer", "null"], minimum: 0, maximum: 100, description: "Per-profile discount applied to every product price (0-100)" },
                  theme: { $ref: "#/components/schemas/Theme" },
                  terminalCommands: { type: ["array", "null"], items: { $ref: "#/components/schemas/TerminalCommand" }, description: "Requires PRO or ENTERPRISE tier" },
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
    "/profiles/me/{profileId}/badges/order": {
      put: {
        tags: ["Profiles"],
        summary: "Set the display order of a profile's badges",
        description: "Accepts the full list of badge ids on the profile in the desired display order. Only badge ids currently on the profile are accepted; unknown or duplicate ids are rejected. Badges not listed keep their previous relative position after the ordered ones. The same order is used on the public profile, the own-profile endpoints and the OG card.",
        parameters: [{ name: "profileId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["order"], properties: { order: { type: "array", items: { type: "string", format: "uuid" } } } } } },
        },
        responses: {
          "200": { description: "Order saved", content: { "application/json": { schema: { type: "object", properties: { badges: { type: "array", items: { type: "string", format: "uuid" } } } } } } },
          "400": { description: "Unknown, duplicate or unauthorized badge ids" },
          "404": { description: "Profile not found" },
        },
      },
    },
    "/badges": {
      get: {
        tags: ["Badges"],
        summary: "List all badges (public)",
        security: [],
        description: "The badge catalog with labels, colors and icon names. Used to render badges as colored icons. Served with `Cache-Control: public, max-age=300` and an ETag (304 on revalidation).",
        responses: { "200": { description: "Array of badges" } },
      },
    },
    "/profiles/me/username/availability": {
      get: {
        tags: ["Profiles"],
        summary: "Check whether a @username is available to claim",
        description: "Own-handle answers are 'current'; reserved routes and handles claimed by public profiles/aliases are 'taken'; handles owned by private profiles are reported available (the oracle must not reveal unlisted accounts exist). Login + a tight per-IP rate limit gate the call.",
        parameters: [{ name: "username", in: "query", required: true, schema: { type: "string" }, description: "Handle to check (3-32 chars, lowercase letters/numbers/_/-)" }],
        responses: {
          "200": { description: "Availability verdict", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", properties: { available: { type: "boolean" }, reason: { type: "string", enum: ["reserved", "taken", "current", "available"] } } } } } } } },
          "400": { description: "Invalid username" },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/profiles/me/username": {
      patch: {
        tags: ["Profiles"],
        summary: "Rename your @username (30-day cooldown)",
        description: "Moves the handle, the primary profile's public URL and the shared slug namespace atomically. The old slug becomes an automatic alias of the primary profile so existing links keep resolving. Rate-limited per IP and capped at one rename per 30 days.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["username"], properties: { username: { type: "string" } } } } } },
        responses: {
          "200": { description: "Renamed", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", properties: { username: { type: "string" }, slug: { type: "string" }, lastUsernameChangeAt: { type: "string", format: "date-time" } } } } } } } },
          "400": { description: "Invalid/reserved/unchanged username" },
          "409": { description: "Identity collision — username already taken" },
          "429": { description: "Rate limited or 30-day cooldown active" },
        },
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
    "/profiles/me/link-icon": {
      post: {
        tags: ["Profiles"],
        summary: "Upload a link favicon image",
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["linkIcon"], properties: { linkIcon: { type: "string", format: "binary" } } } } } },
        responses: { "200": { description: "Uploaded image path (/uploads/…)" } },
      },
    },
    "/profiles/me/background": {
      post: {
        tags: ["Profiles"],
        summary: "Upload a profile background image",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to update (defaults to primary)" }],
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["background"], properties: { background: { type: "string", format: "binary" } } } } } },
        responses: { "200": { description: "Updated background URL" } },
      },
      delete: {
        tags: ["Profiles"],
        summary: "Remove your profile background",
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
        description: "Served with `Cache-Control: no-cache` and a content-based ETag — browsers revalidate every time (304 when unchanged) so profile edits and live presence are never stale and public views are still counted.",
        responses: { "200": { description: "Public profile (no email/PII)", content: { "application/json": { schema: { $ref: "#/components/schemas/PublicProfile" } } } }, "304": { description: "Not modified (If-None-Match matches)" }, "404": { description: "Not found or private" } },
      },
    },
    "/theming/active": {
      get: {
        tags: ["Profiles"],
        summary: "Get the currently active platform-wide theme",
        security: [],
        description: "Public endpoint used by profiles and the landing page to discover the active global seasonal theme and its config (colors + animated FX effect). Resolution: admin override (on wins) → holiday > season → higher sortOrder, gated by the master enabled switch and per-theme enabled/allowedByAdmin flags.",
        responses: { "200": { description: "Active theme or `data: { theme: null }` when no theme is active", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", properties: { theme: { $ref: "#/components/schemas/ResolvedSeasonalTheme" }, source: { type: "string", description: "Which rule resolved the theme: `override`, `holiday`, `season`, or `none`" } } } } } } } } },
      },
    },
    "/features": {
      get: {
        tags: ["Config"],
        summary: "Public feature flags",
        security: [],
        description: "Environment-derived feature flags the frontend uses to hide unsupported UI: `linksSections`, `linksCustomIcons`, `linksQr`, and `pocketbaseOauth` (the optional PocketBase sign-in provider). Public and cacheable for 60 s; answers 500 with `x-no-store` when the cache is unavailable.",
        responses: {
          "200": { description: "Feature flags", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", properties: { linksSections: { type: "boolean" }, linksCustomIcons: { type: "boolean" }, linksQr: { type: "boolean" }, pocketbaseOauth: { type: "boolean" } } } } } } } },
          "500": { description: "Features unavailable" },
        },
      },
    },
    "/policy/context": {
      get: {
        tags: ["Privacy"],
        summary: "Legal/policy context snapshot",
        security: [],
        description: "Public snapshot the legal pages render with: operator identity, policy versions and effective dates, jurisdiction, and invite/resale wording. Cached for 60 s; answers 503 (and the pages fall back to neutral wording) when the cache is unavailable.",
        responses: {
          "200": { description: "Policy context snapshot" },
          "503": { description: "Policy context unavailable" },
        },
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
          content: { "application/json": { schema: { type: "object", required: ["profileId", "platform"], properties: { profileId: { type: "string" }, platform: { type: "string", description: "A platform from the allowlist" }, slug: { type: "string", maxLength: 64, description: "Optional per-link identifier (the link label) used for per-link click analytics" } } } } },
        },
        responses: { "200": { description: "Recorded" }, "404": { description: "Profile not found" } },
      },
    },

    "/analytics/me": {
      get: {
        tags: ["Analytics"],
        summary: "Get your analytics (Premium API access: api.advanced)",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        responses: { "200": { description: "Views and clicks aggregates, daily + 24h hourly series, per-platform and per-link click breakdowns" }, "403": { description: "Requires the advanced API level (Premium tier or api.advanced permission)" } },
      },
      delete: {
        tags: ["Analytics"],
        summary: "Reset click analytics (Premium API access: api.advanced)",
        description: "No `slug` parameter deletes all click records for the profile; otherwise only the matching per-link slug is deleted. Page views are never deleted.",
        parameters: [
          { name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" },
          { name: "slug", in: "query", required: false, schema: { type: "string" }, description: "Per-link identifier to reset (omitting resets everything)" },
        ],
        responses: { "200": { description: "Number of deleted click records" } },
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

    "/newsletter/subscribe": {
      post: {
        tags: ["Newsletter"],
        summary: "Subscribe to a profile's newsletter (public, single opt-in)",
        description: "Requires explicit acceptance of the Terms of Service and Privacy Policy (`agreePrivacy: true`). Stores email + policy versions + consent timestamp (GDPR/CASL). IP + User-Agent consent evidence is kept only transiently in memory (24 h TTL) and never persisted.",
        security: [],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["profileId", "email", "agreePrivacy"], properties: { profileId: { type: "string", format: "uuid" }, email: { type: "string", format: "email" }, agreePrivacy: { type: "boolean", enum: [true], description: "Must be explicitly true (acceptance of the Terms + Privacy Policy)" } } } } },
        },
        responses: { "201": { description: "Subscribed (or already subscribed)" }, "400": { description: "Invalid input or consent not accepted" }, "404": { description: "Profile not found" }, "429": { description: "Rate limited" } },
      },
    },
    "/newsletter/unsubscribe": {
      get: {
        tags: ["Newsletter"],
        summary: "One-click unsubscribe (public, signed token)",
        description: "Opened from the email's List-Unsubscribe header or link. Marks the subscriber unsubscribed (CAN-SPAM/CASL honoured immediately; ≥ 10 business days before any further send).",
        security: [],
        parameters: [{ name: "token", in: "query", required: true, schema: { type: "string" }, description: "Signed one-click unsubscribe token from the newsletter email" }],
        responses: { "200": { description: "HTML confirmation page" }, "400": { description: "Invalid or expired token" } },
      },
      post: {
        tags: ["Newsletter"],
        summary: "One-click unsubscribe via signed token",
        description: "RFC 8058 one-click endpoint. The token comes in the query string (as advertised by the List-Unsubscribe header) or in the JSON body. Marks the subscriber unsubscribed and returns a JSON confirmation.",
        security: [],
        parameters: [{ name: "token", in: "query", schema: { type: "string" }, description: "Signed one-click unsubscribe token (query string preferred, per the List-Unsubscribe header)" }],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" } } } } },
        },
        responses: { "200": { description: "Unsubscribed" }, "400": { description: "Invalid or expired token" } },
      },
    },
    "/newsletter/unsubscribe/broadcast": {
      get: {
        tags: ["Newsletter"],
        summary: "One-click unsubscribe from platform announcements (public, signed token)",
        description: "Opened from a platform announcement email. Sets the recipient's account newsletter opt-in to false and records the unsubscribe timestamp.",
        security: [],
        parameters: [{ name: "token", in: "query", required: true, schema: { type: "string" }, description: "Signed broadcast unsubscribe token from the announcement email" }],
        responses: { "200": { description: "HTML confirmation page" }, "400": { description: "Invalid or expired token" } },
      },
      post: {
        tags: ["Newsletter"],
        summary: "RFC 8058 one-click unsubscribe from platform announcements (public, signed token)",
        description: "POST counterpart of the GET unsubscribe page, used by mail clients (List-Unsubscribe header). Token in query string or JSON body. Disables the account's platform announcement opt-in and records the unsubscribe timestamp.",
        security: [],
        parameters: [{ name: "token", in: "query", schema: { type: "string" }, description: "Signed broadcast unsubscribe token (query string preferred)" }],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" } } } } },
        },
        responses: { "200": { description: "Unsubscribed" }, "400": { description: "Invalid or expired token" } },
      },
    },
    "/newsletter/optin": {
      post: {
        tags: ["Newsletter"],
        summary: "Set the current user's platform announcement opt-in (requires auth)",
        description: "Managed from Account settings. Enabling re-arms the account for future admin broadcasts and clears broadcastUnsubscribedAt; disabling records the opt-out timestamp (broadcastUnsubscribedAt) so the unsubscribe is auditable, just like the broadcast unsubscribe link.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["enabled"], properties: { enabled: { type: "boolean" } } } } },
        },
        responses: { "200": { description: "Opt-in state updated" }, "401": { description: "Not authenticated" } },
      },
    },
    "/newsletter/send": {
      post: {
        tags: ["Newsletter"],
        summary: "Send a newsletter to all active subscribers (own SMTP deliverer, or the platform sender for admins and instance-owner-approved users)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["subject", "body"], properties: { subject: { type: "string", maxLength: 120 }, body: { type: "string", maxLength: 5000 }, profileId: { type: "string", format: "uuid", description: "Profile to scope (defaults to primary)" } } } } },
        },
        responses: { "200": { description: "Send summary (recipientCount, successCount, failedCount)" }, "403": { description: "Permission denied, paused newsletter, tier not allowed, own sender not verified/tested, or the platform sender is disabled/not approved for this account" }, "429": { description: "Per-tier send limit reached" } },
      },
    },
    "/newsletter/subscribers": {
      get: {
        tags: ["Newsletter"],
        summary: "List newsletter subscribers (profile owner or newsletter.manage)",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        responses: { "200": { description: "Subscriber list + counts" } },
      },
    },
    "/newsletter/sends": {
      get: {
        tags: ["Newsletter"],
        summary: "List past newsletter sends (profile owner or newsletter.manage)",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        responses: { "200": { description: "Send history (most recent 50)" } },
      },
    },
    "/newsletter/subscribers/{id}": {
      delete: {
        tags: ["Newsletter"],
        summary: "Remove a subscriber (right-to-erasure, profile owner or newsletter.manage)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" },
        ],
        responses: { "200": { description: "Deleted record count" }, "404": { description: "Subscriber not found" } },
      },
    },
    "/newsletter/sender": {
      get: {
        tags: ["Newsletter"],
        summary: "Get this profile's own SMTP sender configuration (profile owner)",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        responses: { "200": { description: "Sender configuration (no secrets) or null, plus `platformEnabled` (instance-owner opt-in for user platform sending)" } },
      },
      put: {
        tags: ["Newsletter"],
        summary: "Create or update this profile's own SMTP sender (profile owner)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["fromName", "fromEmail", "smtpHost"],
                properties: {
                  profileId: { type: "string", format: "uuid" },
                  fromName: { type: "string", maxLength: 60 },
                  fromEmail: { type: "string", format: "email" },
                  smtpHost: { type: "string", maxLength: 253 },
                  smtpPort: { type: "integer", minimum: 1, maximum: 65535, default: 587 },
                  smtpSecure: { type: "boolean", description: "Implicit TLS (port 465)" },
                  smtpUser: { type: "string", maxLength: 253 },
                  smtpPassword: { type: "string", maxLength: 254, description: "Only sent when rotating; otherwise the stored password is kept" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated sender (no secrets)" }, "400": { description: "Validation error" } },
      },
      delete: {
        tags: ["Newsletter"],
        summary: "Remove this profile's own SMTP sender (profile owner)",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        responses: { "200": { description: "Sender removed" } },
      },
    },
    "/newsletter/sender/verify": {
      post: {
        tags: ["Newsletter"],
        summary: "Verify DNS ownership of the from-domain via the _bioplatform-verify TXT record",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        responses: { "200": { description: "{ verified: true }" }, "400": { description: "TXT record not found yet" } },
      },
    },
    "/newsletter/sender/test": {
      post: {
        tags: ["Newsletter"],
        summary: "Send a test email through the profile's own SMTP relay to confirm deliverability",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        responses: { "200": { description: "{ tested: true }" }, "400": { description: "Test email failed" } },
      },
    },
    "/admin/newsletter/sender-whitelist": {
      get: {
        tags: ["Admin"],
        summary: "List accounts allowed to send via their own SMTP with manual admin approval (requires newsletter.manage)",
        description: "Paginated — supports `limit` (default 50, max 100) and `offset`. Returns `{ data: { users }, pagination: { total, limit, offset } }`.",
        parameters: [
          { name: "q", in: "query", required: false, schema: { type: "string" }, description: "Filter by username or email" },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
        ],
        responses: { "200": { description: "Accounts with the allowlist flag" } },
      },
    },
    "/admin/newsletter/sender-whitelist/{userId}": {
      put: {
        tags: ["Admin"],
        summary: "Toggle the newsletter sender allowlist flag for an account (requires newsletter.manage)",
        parameters: [{ name: "userId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["whitelisted"], properties: { whitelisted: { type: "boolean" } } } } },
        },
        responses: { "200": { description: "Updated flag" }, "404": { description: "User not found" } },
      },
    },
    "/admin/newsletter/config": {
      get: {
        tags: ["Admin"],
        summary: "Get per-tier newsletter send limits (requires newsletter.manage)",
        responses: { "200": { description: "Tier config + configSource (env | db)" } },
      },
      put: {
        tags: ["Admin"],
        summary: "Override per-tier newsletter send limits (requires newsletter.manage)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["FREE", "PRO", "ENTERPRISE"],
                additionalProperties: false,
                properties: {
                  FREE: { type: "object", required: ["sendLimit", "windowHours"], properties: { sendLimit: { type: "integer", minimum: 0, maximum: 100 }, windowHours: { type: "integer", minimum: 1, maximum: 8760 } } },
                  PRO: { type: "object", required: ["sendLimit", "windowHours"], properties: { sendLimit: { type: "integer", minimum: 0, maximum: 100 }, windowHours: { type: "integer", minimum: 1, maximum: 8760 } } },
                  ENTERPRISE: { type: "object", required: ["sendLimit", "windowHours"], properties: { sendLimit: { type: "integer", minimum: 0, maximum: 100 }, windowHours: { type: "integer", minimum: 1, maximum: 8760 } } },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Saved tier config (configSource: db)" } },
      },
      delete: {
        tags: ["Admin"],
        summary: "Reset per-tier newsletter send limits to defaults (requires newsletter.manage)",
        responses: { "200": { description: "Reset config + configSource (env)" } },
      },
    },
    "/admin/newsletter/consent-search": {
      get: {
        tags: ["Admin"],
        summary: "Search consent evidence for an email (requires newsletter.manage)",
        description: "Returns { email, account, subscriptions, consentEvents }. account = the account-level platform announcements state for that email if one exists ({ exists, username, announcementsOptIn, announcementsOptInAt, announcementsUnsubscribedAt, acceptedPoliciesAt }). subscriptions = permanent DB rows per profile the email opted into, each with { email, profileId, subscribedAt, agreedAt, unsubscribedAt, tosVersion, privacyVersion, status: subscribed|unsubscribed } — agreedAt is the exact consent moment, tosVersion/privacyVersion are the pinned policy versions, and status/unsubscribedAt report the newsletter opt-out. consentEvents = transient in-memory IP + User-Agent evidence captured at subscribe time (in-memory only, 24 h TTL, never stored in the database). GDPR/CASL audit trail.",
        parameters: [{ name: "email", in: "query", required: true, schema: { type: "string", format: "email" } }],
        responses: { "200": { description: "Consent evidence for the email" } },
      },
    },
    "/admin/newsletter/broadcast-audience": {
      get: {
        tags: ["Admin"],
        summary: "Count users opted in to platform announcements (requires newsletter.manage)",
        responses: { "200": { description: "Number of opted-in, not-unsubscribed users" } },
      },
    },
    "/admin/newsletter/broadcasts": {
      get: {
        tags: ["Admin"],
        summary: "List recent platform announcement broadcasts (requires newsletter.manage)",
        responses: { "200": { description: "Most recent 50 broadcasts (subject, recipient/delivered counts, sentAt)" } },
      },
    },
    "/admin/newsletter/broadcast": {
      post: {
        tags: ["Admin"],
        summary: "Send a platform announcement to opted-in users (requires newsletter.manage)",
        description: "Emails every opted-in user through the instance SMTP/Resend deliverer. Each recipient gets an account-scoped one-click unsubscribe link. Sanitized (no HTML) via stripHtmlInput.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["subject", "body"],
                properties: {
                  subject: { type: "string", minLength: 1, maxLength: 120 },
                  body: { type: "string", minLength: 1, maxLength: 5000 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Broadcast sent. Returns recipientCount, successCount, failedCount." },
          "400": { description: "No opted-in users or over the 5000 recipient safety cap" },
          "503": { description: "Email delivery is not configured" },
        },
      },
    },

    "/tips": {
      post: {
        tags: ["Tips"],
        summary: "Record a tip intent (public, coin-tip checkout)",
        description:
          "Creates a tip record. If the instance has BTCPay configured (`CRYPTO_ENABLED`, `BTCPAY_URL`, `BTCPAY_API_KEY`, `BTCPAY_STORE_ID`), a BTCPay invoice is created (`mode: btcpay`); otherwise the tip is saved as a recorded intent (`mode: address`) for the profile owner to reconcile.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["profileId", "coin", "amount"],
                properties: {
                  profileId: { type: "string", format: "uuid" },
                  coin: { type: "string", enum: ["BTC", "LTC"], description: "Cryptocurrency the sender will pay in" },
                  amount: { type: "string", description: "Decimal amount in the selected coin (e.g. \"0.0015\")" },
                  name: { type: "string", maxLength: 60, description: "Optional display name shown to the profile owner" },
                  message: { type: "string", maxLength: 500, description: "Optional short message shown to the profile owner" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Tip recorded. body.payment.mode is `btcpay` (invoice URL) or `address` (wallet address + coin-URI)" },
          "400": { description: "Invalid input" },
          "403": { description: "Profile has tips disabled or does not accept this coin" },
          "404": { description: "Profile not found" },
          "429": { description: "Rate limited (public)" },
        },
      },
    },
    "/tips/overview": {
      get: {
        tags: ["Tips"],
        summary: "Get tip totals + recent tips for your profile (authenticated)",
        description: "Returns aggregate tip amounts by coin/status, the payment mode of this instance, and the 50 most recent tips.",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        responses: {
          "200": {
            description:
              "Totals object (keyed by coin, each with confirmedAmount/recordedAmount in the coin's smallest unit, plus counts) + recent tip list + mode (btcpay | address)",
          },
          "401": { description: "Not authenticated" },
          "404": { description: "Profile not found" },
        },
      },
    },
    "/tips/{id}": {
      delete: {
        tags: ["Tips"],
        summary: "Delete a tip record (authenticated)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Tip record id" },
          { name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" },
        ],
        responses: { "200": { description: "Deleted tip count" }, "401": { description: "Not authenticated" }, "404": { description: "Tip not found" } },
      },
    },

    "/shop/availability": {
      get: {
        tags: ["Shop"],
        summary: "Payment gateway availability (public)",
        description:
          "Returns which payment methods are enabled on this instance (Stripe / PayPal / Crypto), the enabled crypto providers, supported coins, billing currency, and the max product file size in MB.",
        security: [],
        responses: { "200": { description: "Availability object" } },
      },
    },
    "/shop/overview": {
      get: {
        tags: ["Shop"],
        summary: "Shop overview for your profile (authenticated, owner)",
        description:
          "Returns the product catalog, tier product limit, per-profile discount percent, and sales totals (units sold + revenue) for the selected profile.",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        responses: { "200": { description: "Shop overview" }, "401": { description: "Not authenticated" }, "404": { description: "Profile not found" } },
      },
    },
    "/shop/products": {
      post: {
        tags: ["Shop"],
        summary: "Create a product (multipart upload, owner)",
        description:
          "Uploads the deliverable file together with its metadata. Product files are stored in a private subtree and only ever served through the signed download endpoint. FREE tier is limited to 3 products; PRO and ENTERPRISE are unlimited.",
        parameters: [{ name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file", "title", "priceCents"],
                properties: {
                  file: { type: "string", format: "binary", description: "The deliverable file (max PRODUCT_FILE_MAX_MB)" },
                  title: { type: "string", maxLength: 120 },
                  description: { type: "string", maxLength: 2000 },
                  priceCents: { type: "integer", minimum: 0, description: "0 = free product" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created product" }, "400": { description: "Validation error or tier limit reached" }, "401": { description: "Not authenticated" }, "404": { description: "Profile not found" } },
      },
    },
    "/shop/products/{id}": {
      patch: {
        tags: ["Shop"],
        summary: "Update a product (owner)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string", maxLength: 120 },
                  description: { type: ["string", "null"], maxLength: 2000 },
                  priceCents: { type: "integer", minimum: 0 },
                  enabled: { type: "boolean", description: "When false the product is hidden from the public shop" },
                  previewImage: { type: ["string", "null"], description: "Local upload path of the preview image" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated product" }, "401": { description: "Not authenticated" }, "404": { description: "Product not found" } },
      },
      delete: {
        tags: ["Shop"],
        summary: "Delete a product (owner)",
        description: "Removes the product, its file, preview image, and purchase history.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" }, "401": { description: "Not authenticated" }, "404": { description: "Product not found" } },
      },
    },
    "/shop/products/{id}/preview": {
      post: {
        tags: ["Shop"],
        summary: "Upload a product preview image (owner)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["image"], properties: { image: { type: "string", format: "binary", description: "JPEG, PNG, GIF or WebP, max 5MB" } } } } } },
        responses: { "200": { description: "Updated previewImage path" }, "401": { description: "Not authenticated" }, "404": { description: "Product not found" } },
      },
    },
    "/shop/sales": {
      get: {
        tags: ["Shop"],
        summary: "Purchase ledger for your profile (authenticated, owner)",
        description: "Returns recent purchases for your products, with masked buyer emails for guests.",
        parameters: [
          { name: "profileId", in: "query", required: false, schema: { type: "string" }, description: "Profile to scope (defaults to primary)" },
          { name: "productId", in: "query", required: false, schema: { type: "string" }, description: "Filter to a single product" },
        ],
        responses: { "200": { description: "List of sales" }, "401": { description: "Not authenticated" }, "404": { description: "Profile not found" } },
      },
    },
    "/shop/sales/{purchaseId}/refund": {
      post: {
        tags: ["Shop"],
        summary: "Refund a purchase (owner)",
        description: "Marks a PAID purchase as REFUNDED and revokes download access. The gateway must be refunded out-of-band.",
        parameters: [{ name: "purchaseId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Refunded purchase" }, "400": { description: "Only paid purchases can be refunded" }, "401": { description: "Not authenticated" }, "404": { description: "Purchase not found" } },
      },
    },
    "/shop/purchases": {
      get: {
        tags: ["Shop"],
        summary: "Your purchases (authenticated, buyer)",
        description: "Lists purchases made by the current account, newest first.",
        responses: { "200": { description: "List of purchases" }, "401": { description: "Not authenticated" } },
      },
    },
    "/shop/buy": {
      post: {
        tags: ["Shop"],
        summary: "Start a purchase (public)",
        description:
          "Creates a purchase and a gateway checkout session. Free products are fulfilled immediately (status PAID) and return a signed download URL. Paid products return a checkout URL plus, for guests, a short-lived client token used to poll /shop/status. Signed to the buyer account when a Bearer token is sent.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["productId"],
                properties: {
                  productId: { type: "string", format: "uuid" },
                  method: { type: "string", enum: ["STRIPE", "PAYPAL", "CRYPTO"], description: "Required for paid products; ignored for free ones" },
                  email: { type: "string", format: "email", description: "Required for guest (unauthenticated) paid purchases — the download link is emailed after payment" },
                  provider: { type: "string", description: "Crypto provider id (optional, defaults to the instance default)" },
                  coin: { type: "string", description: "Crypto coin for checkout (optional, defaults to the instance default)" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Purchase created with checkout. Free / verified-login purchases include downloadUrl." },
          "400": { description: "Invalid input (e.g. missing email for a guest paid purchase)" },
          "404": { description: "Product not found or disabled" },
          "429": { description: "Rate limited (public)" },
          "502": { description: "Gateway error" },
        },
      },
    },
    "/shop/status/{purchaseId}": {
      get: {
        tags: ["Shop"],
        summary: "Poll purchase status (public)",
        description: "Returns the purchase status. Requires the guest client token (?token=) or the buyer's Bearer token. Includes a signed download URL once PAID.",
        security: [],
        parameters: [{ name: "purchaseId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Purchase status" }, "403": { description: "Not authorized for this purchase" }, "404": { description: "Purchase not found" }, "429": { description: "Rate limited" } },
      },
    },
    "/shop/download/{purchaseId}": {
      get: {
        tags: ["Shop"],
        summary: "Download a purchased file (public, signed link)",
        description:
          "Streams the deliverable file as an attachment. Requires either the signed download token in the ?token= query param (from the emailed link or the shop UI) or the buyer's Bearer token. REFUNDED purchases return 410.",
        security: [],
        parameters: [{ name: "purchaseId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "File stream (application/octet-stream, attachment)" }, "401": { description: "Not authenticated and no token" }, "402": { description: "Payment still pending" }, "403": { description: "Invalid/expired token or not the buyer" }, "404": { description: "Purchase or file not found" }, "410": { description: "Purchase was refunded" }, "429": { description: "Rate limited" } },
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

    "/invite-purchases/config": {
      get: {
        tags: ["Invites"],
        summary: "Paid invite storefront config (public)",
        description:
          "Public snapshot of the invite store: whether it is open (operator switch on AND at least one pack parses), the currency, the priced packs, the resale posture, and the published pay-by-hand instructions. Packs are listed even while the store is closed so a page can describe the offer without implying it is buyable. `manualPayment.configured` is false when no usable instructions exist, and a client must not offer a manual payment path in that state.",
        security: [],
        responses: { "200": { description: "Store snapshot" }, "429": { description: "Rate limited" } },
      },
    },
    "/invite-purchases/me": {
      get: {
        tags: ["Invites"],
        summary: "Your invite purchases",
        description: "The signed-in buyer's own invite purchase history, newest first, plus the current store snapshot.",
        responses: { "200": { description: "Purchases + store" }, "401": { description: "Not authenticated" } },
      },
    },
    "/invite-purchases": {
      post: {
        tags: ["Invites"],
        summary: "Buy invite credits (public)",
        description:
          "Creates a PENDING invite purchase and a gateway checkout session. Works with or without a Bearer token: with one, the credits are credited to that account as a permanent balance once the gateway confirms payment; without one, expiring invite codes are minted and emailed with a private claim link. Quantity must match a configured pack exactly — no rounding, no bonuses.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["quantity", "method"],
                properties: {
                  quantity: { type: "integer", minimum: 1, maximum: 50, description: "Must equal one of the configured pack quantities" },
                  method: { type: "string", enum: ["STRIPE", "PAYPAL", "CRYPTO", "MANUAL"], description: "MANUAL is confirmed by an operator in the admin dashboard" },
                  email: { type: "string", format: "email", description: "Required for guest (unauthenticated) purchases — the codes are emailed after payment and this address is the sole identifier" },
                  provider: { type: "string", description: "Crypto provider id (optional, defaults to the instance default)" },
                  coin: { type: "string", description: "Crypto coin for checkout (optional, defaults to the instance default)" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Purchase created with a checkout URL (gateway methods) or an order awaiting manual confirmation" },
          "400": { description: "Invalid request (e.g. missing email for a guest purchase, unknown pack)" },
          "403": { description: "Invite purchases are disabled, or the account is invite-banned" },
          "429": { description: "Rate limited (10/h per IP)" },
          "502": { description: "Gateway error" },
        },
      },
    },
    "/invite-purchases/resellable": {
      get: {
        tags: ["Invites"],
        summary: "List your own codes that are not for sale",
        description: "The caller's own UNPURCHASED invite codes — the ones earned from an invite event or a role quota. Used on instances where the resale mode forbids selling invite codes.",
        responses: { "200": { description: "Resellable codes" }, "401": { description: "Not authenticated" } },
      },
    },
    "/invite-purchases/status/{orderId}": {
      get: {
        tags: ["Invites"],
        summary: "Guest purchase status (public, token-scoped)",
        description:
          "Returns an invite purchase and, once PAID, the codes it holds. Authorised only by the claim token in ?token=, which is bound to this one order — it is the only thing a guest has, since they have no account.",
        security: [],
        parameters: [
          { name: "orderId", in: "path", required: true, schema: { type: "string" }, description: "The prefixed order id (invites-…)" },
          { name: "token", in: "query", required: true, schema: { type: "string" }, description: "Claim token from the purchase email" },
        ],
        responses: {
          "200": { description: "Purchase status, with codes once PAID" },
          "403": { description: "Token is invalid, expired, or belongs to another order" },
          "404": { description: "Purchase not found" },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/invite-purchases/claim-link": {
      post: {
        tags: ["Invites"],
        summary: "Re-email a guest claim link (public)",
        description: "Emails the buyer their claim link again. Always answers 200 (with `sent`) so the endpoint cannot be used to discover which order ids exist.",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["orderId", "email"], properties: { orderId: { type: "string" }, email: { type: "string", format: "email" } } } } } },
        responses: { "200": { description: "Always 200; `sent` reports whether an email went out" }, "400": { description: "Invalid request" }, "429": { description: "Rate limited" } },
      },
    },
    "/invite-purchases/claim-link-auth": {
      post: {
        tags: ["Invites"],
        summary: "Get a claim link for your own purchase",
        description: "Returns the claim URL for one of the caller's own orders, so a member can view purchased codes without opening the email.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["orderId"], properties: { orderId: { type: "string" } } } } } },
        responses: { "200": { description: "Claim URL" }, "400": { description: "Invalid request" }, "401": { description: "Not authenticated" }, "404": { description: "Purchase not found or not yours" } },
      },
    },

    "/admin/invite-purchases/{id}/claim-link": {
      post: {
        tags: ["Invites"],
        summary: "Re-issue a guest claim link (admin)",
        description:
          "Returns a freshly signed claim link for a purchase so an operator can deliver it by hand. Exists because a guest's codes reach them by email only: on an instance with no working mail the operator would otherwise confirm payment with no way to hand anything over. Requires `invites.manage` — the same permission as confirming the payment — and returns only a signed link, never the redeemable codes. Does not mark the order as emailed. Refused for refunded or cancelled orders.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Claim URL, its expiry in days, and whether the buyer was already emailed one" },
          "400": { description: "Invalid purchase" },
          "401": { description: "Not authenticated" },
          "403": { description: "Missing invites.manage" },
          "404": { description: "Purchase not found" },
          "409": { description: "Purchase was refunded or cancelled" },
        },
      },
    },
    "/admin/invite-purchase-settings": {
      get: {
        tags: ["Invites"],
        summary: "Read paid-invite settings (admin)",
        description: "Storefront switch, resale mode, configured packs, and whether outbound mail is working (`emailConfigured`).",
        responses: { "200": { description: "Settings" }, "401": { description: "Not authenticated" }, "403": { description: "Missing invites.manage" } },
      },
      put: {
        tags: ["Invites"],
        summary: "Update paid-invite settings (admin)",
        description: "Enabling purchases with no configured packs is refused, so the switch can never read as live while the storefront is unreachable.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["purchaseEnabled", "resaleMode"], properties: { purchaseEnabled: { type: "boolean" }, resaleMode: { type: "string", enum: ["off", "permitted", "legal", "enforced"], description: "Published resale stance. `off` and `permitted` both allow a member to sell their codes and differ only in whether the legal pages state the position; `legal` and `enforced` prohibit resale." } } } } } },
        responses: { "200": { description: "Saved settings" }, "400": { description: "Invalid input, or enabling with no packs priced" }, "403": { description: "Missing invites.manage" } },
      },
    },

    "/admin/invite-purchases": {
      get: {
        tags: ["Invites"],
        summary: "Recent invite-credit purchases (admin)",
        description: "Invite purchase orders, newest first, capped at 200. Optional `status` filter (PENDING | PAID | REFUNDED | CANCELLED). Requires `invites.manage`.",
        parameters: [{ name: "status", in: "query", required: false, schema: { type: "string", enum: ["PENDING", "PAID", "REFUNDED", "CANCELLED"] } }],
        responses: { "200": { description: "{ data: { purchases } }" }, "403": { description: "Missing invites.manage" } },
      },
    },
    "/admin/invite-purchases/{id}/confirm": {
      post: {
        tags: ["Invites"],
        summary: "Confirm a MANUAL purchase by hand (admin)",
        description: "Applies the same fulfilment path a gateway webhook would (ledger, guest email, idempotency guards). Only `MANUAL` method purchases can be confirmed by hand. Requires `invites.manage`.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Confirmed + fulfilment result" }, "400": { description: "Invalid purchase or not MANUAL" }, "401": { description: "Not authenticated" }, "403": { description: "Missing invites.manage" }, "404": { description: "Purchase not found" } },
      },
    },
    "/admin/invite-purchases/{id}/refund": {
      post: {
        tags: ["Invites"],
        summary: "Refund a purchase (admin)",
        description: "Marks the payment as refunded, applying the same refund path a gateway webhook would. Refused (409) when the purchase is not refundable in its current state.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "{ refunded: true, providerRefundPerformed: false }" }, "400": { description: "Invalid purchase" }, "401": { description: "Not authenticated" }, "403": { description: "Missing invites.manage" }, "404": { description: "Purchase not found" }, "409": { description: "Purchase is not refundable" } },
      },
    },
    "/admin/invite-purchases/{id}/cancel": {
      post: {
        tags: ["Invites"],
        summary: "Cancel a purchase (admin)",
        description: "Cancels a pending purchase.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Cancelled" }, "400": { description: "Invalid purchase" }, "401": { description: "Not authenticated" }, "403": { description: "Missing invites.manage" }, "404": { description: "Purchase not found" } },
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
        description: "Generate within your role quota (`invites.generate` permission + per-role batch/outstanding limits) or your event allowance, subject to the global `userGenerationEnabled` switch, a per-role cooldown, and expiry bounds (min/max, capped by the allowance expiry). Applies to every caller, admins included — the unconstrained operator generator is `POST /api/admin/invites`.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { count: { type: "integer", minimum: 1, maximum: 50 }, expiresInDays: { type: "integer", minimum: 1, maximum: 365 } } } } } },
        responses: { "201": { description: "Created invite codes + meta" }, "403": { description: "Banned / disabled / no credits" }, "429": { description: "Cooldown active" } },
      },
    },
    "/invites/{code}": {
      get: {
        tags: ["Invites"],
        summary: "Look up an invite code (public)",
        description: "Public, rate-limited lookup of a single invite code. Returns the code status (`valid`), the invitee discount percent/duration derived from the AFFILIATE_* environment, and the referrer profile (username, slug, avatar, displayName) when the code was created by a member. Revoked, expired, or already-used codes answer 404.",
        security: [],
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "{ success:true, data:{ code, status:\"valid\", inviteeDiscountPercent, discountDurationDays, referrer } }" }, "404": { description: "Code not found, revoked, expired, or used" } },
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
    "/invites/{id}/note": {
      patch: {
        tags: ["Invites"],
        summary: "Set a note on an invite code",
        description: "Sets a short note on a code you created. Admins with `invites.manage` can edit any code. HTML-like characters are stripped. Pass `null` or an empty/whitespace string to clear the note. Returns the updated code.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["note"],
                properties: { note: { type: "string", nullable: true, maxLength: 500, description: "Note text, or null to clear" } },
              },
            },
          },
        },
        responses: { "200": { description: "Updated code" }, "400": { description: "Invalid input" }, "403": { description: "Not your invite code" }, "404": { description: "Invite code not found" } },
      },
    },
    "/admin/invites": {
      get: {
        tags: ["Admin"],
        summary: "List invite codes (admin only, paginated)",
        description: "Every invite code across all creators, with the creator and (when used) the account that redeemed it. Supports `limit` (default 50, max 100), `offset`, and `filter` (`all` | `available` = unused/unexpired/unrevoked | `mine` = created by the caller). Returns `{ data, pagination: { total, limit, offset }, counts: { total, used, revoked, available } }` where `counts` are global (unfiltered) aggregates.",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
          { name: "filter", in: "query", required: false, schema: { type: "string", enum: ["all", "available", "mine"] } },
        ],
        responses: { "200": { description: "{ data, pagination, counts }" } },
      },
      post: {
        tags: ["Admin"],
        summary: "Generate invite codes without limits (admin only)",
        description: "Operator bulk generator (requires `invites.manage`). Creates `count` codes without consuming any event allowance or role quota — this is the only unconstrained generation path; the user-facing `POST /api/invites` always respects allowance/quota. Body `{ count?, expiresInDays? }`.",
        requestBody: { required: false, content: { "application/json": { schema: { type: "object", properties: { count: { type: "integer", minimum: 1, maximum: 50 }, expiresInDays: { type: "integer", minimum: 1, maximum: 365 } } } } } },
        responses: { "201": { description: "Created invite codes" }, "400": { description: "Invalid input" }, "403": { description: "Missing invites.manage" } },
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

    "/landing/config": {
      get: {
        tags: ["Landing"],
        summary: "Landing page configuration",
        description: "Public configuration for the marketing landing page. Currently exposes the featured profile username set by an administrator; the landing hero and preview editor only show a live-profile button when this is set.",
        security: [],
        responses: {
          "200": {
            description: "Landing config",
            content: {
              "application/json": {
                schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", properties: { featuredProfileUsername: { type: "string", nullable: true, description: "Profile username linked from the landing hero, or null when not configured" } } } } },
              },
            },
          },
        },
      },
    },

    "/admin/landing-config": {
      get: {
        tags: ["Admin"],
        summary: "Get landing configuration (admin only)",
        description: "Returns the configured featured profile username shown on the landing page, or null when unset.",
        responses: { "200": { description: "{ featuredProfileUsername }" } },
      },
      put: {
        tags: ["Admin"],
        summary: "Set landing configuration (admin only)",
        description: "Sets the featured profile username linked from the landing hero and preview editor. Pass an empty string to clear the value (the button then disappears).",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["featuredProfileUsername"], properties: { featuredProfileUsername: { type: "string", description: "Profile username (lowercase letters, numbers, dashes, underscores) or empty string to clear" } } } } } },
        responses: { "200": { description: "Updated landing config" } },
      },
    },
    "/admin/invite-events": {
      get: {
        tags: ["Admin"],
        summary: "List invite grant events (admin only)",
        description: "Paginated — supports `limit` (default 50, max 100) and `offset`. Returns `{ data, pagination: { total, limit, offset } }`.",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
        ],
        responses: { "200": { description: "{ data, pagination }" } },
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
        summary: "List users (admin only, paginated)",
        description:
          "All users, newest first. Supports `limit` (default 50, max 100) and `offset`. Returns `{ data, pagination: { total, limit, offset } }`. Each user includes passkey security flags: `passkeyCount`, `passkeysFreshCount`, `residentPasskeyCount`, `residentFreshCount`, `hasNoPasskeys`, `passkeysUnverified`, `securityFlag` (`none` | `no-passkeys` | `passkeys-unverified`), derived from passkey residency verification within `PASSKEY_RESIDENCY_TTL_DAYS`. Each user also includes team-seat metadata: `seatLimit` (per-user cap, null = unlimited), `seatsUsed` (invite codes with `usedById` set, created by that user), and `hasPaidOrder` (whether the user holds a PAID ENTERPRISE order and is therefore exempt from the seat cap).",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
        ],
        responses: { "200": { description: "{ data, pagination }" } },
      },
    },
    "/admin/users/{id}": {
      patch: {
        tags: ["Admin"],
        summary: "Update a user (admin only)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { roleId: { type: "string", format: "uuid", description: "Role id" }, tier: { type: "string", enum: ["FREE", "PRO", "ENTERPRISE"] }, trackLimit: { type: ["integer", "null"] }, profileLimit: { type: ["integer", "null"] }, aliasLimit: { type: ["integer", "null"] }, seatLimit: { type: ["integer", "null"], description: "Enterprise team seat cap for gifted (non-paying) ENTERPRISE accounts: max members who can join via the user's invites; null = unlimited" }, badges: { type: "array", items: { type: "string", format: "uuid" } }, inviteBanned: { type: "boolean", description: "Block/allow invite events and invite generation (ban also revokes outstanding invites)" } } } } } },
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
    "/admin/users/{id}/passkeys/{passkeyId}": {
      delete: {
        tags: ["Admin"],
        summary: "Delete a user's passkey (admin only)",
        description: "Removes a specific passkey from a user. The response includes the serialized user with freshly recomputed passkey security flags (`passkeyCount`, `passkeysFreshCount`, `hasNoPasskeys`, `passkeysUnverified`, `securityFlag`) so the admin list reflects the deletion immediately.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "passkeyId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: { "200": { description: "Passkey removed" }, "404": { description: "User or passkey not found (or passkey not owned by that user)" } },
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
    "/admin/auth/sign-out-all": {
      post: {
        tags: ["Admin"],
        summary: "Sign out every user and reset stored credentials (admin only)",
        description:
          "Emergency credential reset. In a single transaction it increments every user's token version (invalidating all issued sessions), deletes all passkeys, clears TOTP enrolment and removes all enterprise-SSO identities. Passwords and OAuth links are intentionally left untouched. Refused while the instance is in update lockdown. Requires `{ confirm: true }` to run.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["confirm"], properties: { confirm: { type: "boolean" } } },
            },
          },
        },
        responses: {
          "200": { description: "Counts of affected users, passkeys, TOTP enrolments and SSO identities" },
          "400": { description: "`confirm: true` was not supplied" },
        },
      },
    },
    "/admin/auth-bans": {
      get: {
        tags: ["Admin"],
        summary: "List auth bans (admin only)",
        description: "Paginated — supports `limit` (default 50, max 100) and `offset`. Returns `{ data, pagination: { total, limit, offset } }`.",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
        ],
        responses: { "200": { description: "{ data, pagination }" } },
      },
    },
    "/admin/auth-bans/{id}": {
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
        description: "Paginated — supports `limit` (default 50, max 100) and `offset`. Returns `{ data, pagination: { total, limit, offset } }`.",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
        ],
        responses: { "200": { description: "{ data, pagination }" } },
      },
    },
    "/admin/whitelist": {
      get: {
        tags: ["Admin"],
        summary: "List the anti-abuse IP/CIDR allowlist (admin only)",
        description: "Paginated — supports `limit` (default 50, max 100) and `offset`. Returns `{ data, pagination: { total, limit, offset } }`.",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
        ],
        responses: { "200": { description: "{ data, pagination }" } },
      },
      post: {
        tags: ["Admin"],
        summary: "Add an IP or CIDR network to the anti-abuse allowlist (admin only)",
        description:
          "Allowlisted networks bypass the affiliate/referral anti-abuse fingerprint guard and the login/registration lockouts, so users on them can register multiple accounts. Persisted in the database, so it survives redeploys.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["value"], properties: { value: { type: "string", description: "IP address or CIDR network, e.g. 1.2.3.4 or 1.2.3.0/24" }, note: { type: "string", description: "Optional note (max 200 chars)" } } } } } },
        responses: { "201": { description: "Added entry" }, "400": { description: "Invalid IP/CIDR or already listed / list full" } },
      },
    },
    "/admin/whitelist/{id}": {
      delete: {
        tags: ["Admin"],
        summary: "Remove an anti-abuse allowlist entry (admin only)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Removed" }, "404": { description: "Entry not found" } },
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

    "/domain": {
      get: {
        tags: ["Custom Domains"],
        summary: "Custom-domain info for the current host (public)",
        security: [],
        responses: {
          "200": {
            description: "Whether the current host is an active custom domain, its root target slug, and canonical URL",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        active: { type: "boolean" },
                        host: { type: "string" },
                        slug: { type: ["string", "null"] },
                        canonical: { type: ["string", "null"] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/profiles/me/{profileId}/domain": {
      get: {
        tags: ["Custom Domains"],
        summary: "Get this profile's custom-domain request (owner only)",
        responses: { "200": { description: "ProfileDomain or null" } },
      },
      post: {
        tags: ["Custom Domains"],
        summary: "Request a custom domain (PRO/Enterprise tier + profiles.customDomain permission; owner only)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["domain"], properties: { domain: { type: "string", description: "Plain hostname, e.g. example.com (no scheme/path/port/www)" } } } } },
        },
        responses: {
          "201": { description: "Domain request created in PENDING_VERIFICATION" },
          "403": { description: "Missing tier or permission" },
          "409": { description: "Profile already has a request, or the domain is in use" },
        },
      },
      put: {
        tags: ["Custom Domains"],
        summary: "Set the root target of the custom domain (owner only)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { rootTarget: { type: ["string", "null"], description: "Public profile slug, or null for the landing page" } } } } },
        },
        responses: { "200": { description: "Updated ProfileDomain" } },
      },
      delete: {
        tags: ["Custom Domains"],
        summary: "Disconnect the custom domain from this profile (owner only)",
        responses: { "200": { description: "Removed" } },
      },
    },

    "/profiles/me/{profileId}/domain/verify": {
      post: {
        tags: ["Custom Domains"],
        summary: "Re-check the TXT record for a PENDING_VERIFICATION request (owner only)",
        responses: {
          "200": { description: "Domain verified (status → VERIFIED)" },
          "400": { description: "TXT record not found yet, or request not pending" },
        },
      },
    },

    "/admin/custom-domains": {
      get: {
        tags: ["Admin"],
        summary: "List all custom-domain requests (admin: profiles.manage)",
        description: "Paginated — supports `limit` (default 50, max 100) and `offset`. Returns `{ data, pagination: { total, limit, offset } }`.",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "offset", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
        ],
        responses: { "200": { description: "{ data, pagination }" } },
      },
    },

    "/admin/custom-domains/{id}/approve": {
      post: {
        tags: ["Admin"],
        summary: "Activate a VERIFIED custom domain (admin: profiles.manage)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Activated (status → ACTIVE)", }, "400": { description: "Only VERIFIED requests can be approved" } },
      },
    },

    "/admin/custom-domains/{id}/reject": {
      post: {
        tags: ["Admin"],
        summary: "Reject a custom-domain request (admin: profiles.manage)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Rejected (status → REJECTED)" }, "400": { description: "Already rejected" } },
      },
    },

    "/admin/custom-domains/{id}/issue-cert": {
      post: {
        tags: ["Admin"],
        summary: "Immediately issue/renew the TLS certificate for an ACTIVE domain via ACME (admin: profiles.manage)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Certificate issued and nginx reloaded" },
          "400": { description: "Domain not ACTIVE, or ACME is disabled" },
        },
      },
    },

    "/admin/custom-domains/{id}": {
      delete: {
        tags: ["Admin"],
        summary: "Delete a custom-domain request (admin: profiles.manage)",
        description: "Deletes a custom-domain request by id. Refused while any of its DNS verification records are still outstanding.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" }, "404": { description: "Request not found" }, "400": { description: "Verification records still pending" } },
      },
    },

    "/orders/config": {
      get: {
        tags: ["Orders"],
        summary: "Public billing configuration",
        description:
          "Returns the platform's billing mode, currency, per-plan base prices (from environment), available payment gateways, and the manual-payment contact method. Public — no auth required.",
        security: [],
        responses: {
          "200": {
            description: "Billing config",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    billingMode: { type: "string", enum: ["one-time", "subscription", "fixed-term"] },
                    currency: { type: "string" },
                    plans: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          plan: { type: "string", enum: ["PRO", "ENTERPRISE"] },
                          label: { type: "string" },
                          priceCents: { type: "integer" },
                        },
                      },
                    },
                    gateways: {
                      type: "object",
                      properties: {
                        stripe: { type: "boolean" },
                        paypal: { type: "boolean" },
                        crypto: {
                          type: "object",
                          properties: {
                            enabled: { type: "boolean" },
                            providers: { type: "array", items: { type: "string" } },
                            coins: { type: "array", items: { type: "string" } },
                          },
                        },
                      },
                    },
                    contact: {
                      type: "object",
                      properties: {
                        method: { type: "string", enum: ["none", "email", "telegram", "discord", "whatsapp"] },
                        value: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/orders/me": {
      get: {
        tags: ["Orders"],
        summary: "My orders and computed discount (auth)",
        description:
          "Returns the current user's tier, effective affiliate discount percent, billing config, and their order history.",
        responses: {
          "200": {
            description: "Orders + quote info",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    currentTier: { type: "string", enum: ["FREE", "PRO", "ENTERPRISE"] },
                    discountPercent: { type: "integer" },
                    billing: { type: "object", additionalProperties: true },
                    orders: { type: "array", items: { $ref: "#/components/schemas/Order" } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Orders"],
        summary: "Create a payment order (auth)",
        description:
          "Creates a PENDING order for the requested plan using the server-computed price (base price from environment, discounted by the user's effective affiliate discount). MANUAL creates a contact-the-owner order; STRIPE, PAYPAL and CRYPTO create the order and the payment session at the gateway, returning a checkout URL. When a gateway method is used and the gateway call fails, the order is deleted and a 502 is returned.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  plan: { type: "string", enum: ["PRO", "ENTERPRISE"] },
                  method: { type: "string", enum: ["MANUAL", "STRIPE", "PAYPAL", "CRYPTO"], default: "MANUAL" },
                  note: { type: "string", description: "Optional message for the platform owner (max 500 chars)" },
                  coin: { type: "string", description: "Crypto coin for method=crypto; falls back to the first enabled coin" },
                  provider: { type: "string", description: "Crypto provider id (btcpayserver, bitpay); defaults to the first enabled provider" },
                },
                required: ["plan"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created order (+ checkout payload for gateway methods)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", enum: [true] },
                    data: { $ref: "#/components/schemas/Order" },
                    checkout: {
                      type: "object",
                      nullable: true,
                      properties: {
                        url: { type: "string" },
                        provider: { type: "string", enum: ["stripe", "paypal", "btcpayserver", "bitpay"] },
                        coin: { type: "string", nullable: true },
                        coinAmount: { type: "string", nullable: true },
                        rateUsd: { type: "string", nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid plan, already on this plan, method not enabled on this instance, or invalid body" },
          "401": { description: "Unauthorized" },
          "409": { description: "A PENDING order already exists for this plan" },
          "502": { description: "Gateway call failed; the order was rolled back" },
        },
      },
    },

    "/orders/downgrade": {
      post: {
        tags: ["Orders"],
        summary: "Self-service plan downgrade (auth)",
        description:
          "Moves the account to a strictly lower tier (ENTERPRISE→PRO/FREE, PRO→FREE). Entitlements are soft-disabled, never deleted: existing profiles, aliases, tracks and products are kept (they just can't grow past the new limits) and enterprise-only features (business SSO, team seats, webhooks API, custom domains) become locked by the normal tier gates. Any PENDING order is cancelled, and enterprise SSO enforcement is switched off so a formerly forced-SSO account can still sign in. A same-or-higher target is rejected — use POST /orders/me to upgrade.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { tier: { type: "string", enum: ["PRO", "FREE"] } },
                required: ["tier"],
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Downgraded",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", enum: [true] },
                    data: {
                      type: "object",
                      properties: {
                        tier: { type: "string", enum: ["FREE", "PRO"] },
                        previousTier: { type: "string", enum: ["PRO", "ENTERPRISE"] },
                        cancelledOrders: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid target, or the target is not below the current tier" },
          "401": { description: "Unauthorized" },
        },
      },
    },

    "/admin/orders": {
      get: {
        tags: ["Admin"],
        summary: "List all orders (admin: orders.manage)",
        parameters: [
          { name: "status", in: "query", required: false, schema: { type: "string", enum: ["PENDING", "PAID", "CANCELLED", "REFUNDED"] } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", default: 50 } },
          { name: "offset", in: "query", required: false, schema: { type: "integer", default: 0 } },
        ],
        responses: {
          "200": {
            description: "Orders with the owning user",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/AdminOrder" } },
                    pagination: {
                      type: "object",
                      properties: {
                        total: { type: "integer" },
                        limit: { type: "integer" },
                        offset: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/admin/orders/{id}": {
      patch: {
        tags: ["Admin"],
        summary: "Update an order's status (admin: orders.manage)",
        description:
          "Marks an order as PAID (upgrades the user's tier to the ordered plan if it is higher), CANCELLED, REFUNDED (only from PAID) or back to PENDING. Optionally records an admin note.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", enum: ["PENDING", "PAID", "CANCELLED", "REFUNDED"] },
                  adminNote: { type: "string", description: "Optional note shown in the user's order history (max 500 chars)" },
                },
                required: ["status"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated order" },
          "400": { description: "Invalid status transition" },
          "404": { description: "Order not found" },
        },
      },
    },

    "/admin/orders-config": {
      get: {
        tags: ["Admin"],
        summary: "Get the manual-payment contact config (admin: settings.manage)",
        responses: {
          "200": {
            description: "Contact method and value",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    method: { type: "string", enum: ["none", "email", "telegram", "discord", "whatsapp"] },
                    value: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
      put: {
        tags: ["Admin"],
        summary: "Set the manual-payment contact config (admin: settings.manage)",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  method: { type: "string", enum: ["none", "email", "telegram", "discord", "whatsapp"] },
                  value: { type: "string" },
                },
                required: ["method"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated contact config" },
        },
      },
    },

"/admin/themes": {
      get: {
        tags: ["Admin"],
        summary: "List seasonal themes + config + active (admin: themes.manage)",
        description: "Returns `{ data: { themes, config, active } }`. `/admin/seasonal-themes` is a legacy alias of this route.",
        responses: { "200": { description: "{ themes, config, active }" }, "403": { description: "Missing themes.manage" } },
      },
      post: {
        tags: ["Admin"],
        summary: "Create a seasonal theme (admin: themes.manage)",
        description: "Creates a `seasonalTheme`. A `slug` is derived from the body's `slug` (sanitized) or generated from the label; a duplicate slug answers 409. `/admin/seasonal-themes` is a legacy alias.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["label", "kind", "enabled", "allowedByAdmin"],
                properties: {
                  label: { type: "string", minLength: 1, maxLength: 64 },
                  emoji: { type: "string", maxLength: 16, nullable: true },
                  kind: { type: "string", enum: ["season", "holiday"] },
                  enabled: { type: "boolean" },
                  config: {
                    type: "object",
                    properties: {
                      bg: { type: "string", nullable: true }, cardBg: { type: "string", nullable: true },
                      text: { type: "string", nullable: true }, accent: { type: "string", nullable: true },
                      fontFamily: { type: "string", nullable: true }, layout: { type: "string", nullable: true },
                      backgroundImage: { type: "string", nullable: true },
                      effect: { type: "string", enum: ["none", "snow", "pumpkins", "hearts", "leaves", "stars", "confetti", "sparkle"], nullable: true },
                    },
                  },
                  startMonth: { type: "integer", minimum: 1, maximum: 12, nullable: true },
                  startDay: { type: "integer", minimum: 1, maximum: 31, nullable: true },
                  endMonth: { type: "integer", minimum: 1, maximum: 12, nullable: true },
                  endDay: { type: "integer", minimum: 1, maximum: 31, nullable: true },
                  overrideState: { type: "string", enum: ["on", "off", "schedule"], nullable: true },
                  allowedByAdmin: { type: "boolean" },
                  sortOrder: { type: "integer", minimum: 0, maximum: 10000 },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Created seasonal theme" }, "400": { description: "Invalid input" }, "409": { description: "Slug already exists" }, "403": { description: "Missing themes.manage" } },
      },
    },
    "/admin/themes/config": {
      put: {
        tags: ["Admin"],
        summary: "Set seasonal-theme automation config (admin: themes.manage)",
        description: "`/admin/seasonal-themes/config` is a legacy alias of this route.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["enabled", "autoSchedule", "respectUserPreferences"], properties: { enabled: { type: "boolean" }, autoSchedule: { type: "boolean" }, respectUserPreferences: { type: "boolean" } } } } } },
        responses: { "200": { description: "Saved config" }, "400": { description: "Invalid input" }, "403": { description: "Missing themes.manage" } },
      },
    },
    "/admin/themes/{id}": {
      put: {
        tags: ["Admin"],
        summary: "Update a seasonal theme (admin: themes.manage)",
        description: "Same body as create. `/admin/seasonal-themes/{id}` is a legacy alias.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["label", "kind", "enabled", "allowedByAdmin"],
                properties: {
                  label: { type: "string", minLength: 1, maxLength: 64 },
                  emoji: { type: "string", maxLength: 16, nullable: true },
                  kind: { type: "string", enum: ["season", "holiday"] },
                  enabled: { type: "boolean" },
                  config: { type: "object" },
                  startMonth: { type: "integer", minimum: 1, maximum: 12, nullable: true },
                  startDay: { type: "integer", minimum: 1, maximum: 31, nullable: true },
                  endMonth: { type: "integer", minimum: 1, maximum: 12, nullable: true },
                  endDay: { type: "integer", minimum: 1, maximum: 31, nullable: true },
                  overrideState: { type: "string", enum: ["on", "off", "schedule"], nullable: true },
                  allowedByAdmin: { type: "boolean" },
                  sortOrder: { type: "integer", minimum: 0, maximum: 10000 },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated seasonal theme" }, "400": { description: "Invalid input" }, "404": { description: "Not found" }, "403": { description: "Missing themes.manage" } },
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete a seasonal theme (admin: themes.manage)",
        description: "`/admin/seasonal-themes/{id}` is a legacy alias.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" }, "404": { description: "Not found" }, "403": { description: "Missing themes.manage" } },
      },
    },
    "/admin/themes/{id}/background": {
      post: {
        tags: ["Admin"],
        summary: "Upload a theme background image (admin: themes.manage)",
        description: "Multipart upload; file field is `background` (JPEG/PNG/GIF/WebP). Stored as `config.backgroundImage` and the previous upload is deleted. `/admin/seasonal-themes/{id}/background` is a legacy alias.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["background"], properties: { background: { type: "string", format: "binary" } } } } } },
        responses: { "200": { description: "{ backgroundImage }" }, "400": { description: "No file or invalid image" }, "404": { description: "Theme not found" }, "403": { description: "Missing themes.manage" } },
      },
      delete: {
        tags: ["Admin"],
        summary: "Remove a theme background image (admin: themes.manage)",
        description: "`/admin/seasonal-themes/{id}/background` is a legacy alias.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Removed" }, "404": { description: "Theme not found" }, "403": { description: "Missing themes.manage" } },
      },
    },

    "/admin/seasonal-themes": {
      get: {
        tags: ["Admin"],
        summary: "List seasonal themes (legacy alias)",
        description: "Legacy alias of `GET /api/admin/themes`.",
        responses: { "200": { description: "{ themes, config, active }" }, "403": { description: "Missing themes.manage" } },
      },
      post: {
        tags: ["Admin"],
        summary: "Create a seasonal theme (legacy alias)",
        description: "Legacy alias of `POST /api/admin/themes`.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["label", "kind", "enabled", "allowedByAdmin"], properties: { label: { type: "string" }, emoji: { type: "string", nullable: true }, kind: { type: "string", enum: ["season", "holiday"] }, enabled: { type: "boolean" }, config: { type: "object" }, allowedByAdmin: { type: "boolean" } } } } } },
        responses: { "200": { description: "Created seasonal theme" }, "400": { description: "Invalid input" }, "409": { description: "Slug already exists" }, "403": { description: "Missing themes.manage" } },
      },
    },
    "/admin/seasonal-themes/config": {
      put: {
        tags: ["Admin"],
        summary: "Set seasonal-theme automation config (legacy alias)",
        description: "Legacy alias of `PUT /api/admin/themes/config`.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["enabled", "autoSchedule", "respectUserPreferences"], properties: { enabled: { type: "boolean" }, autoSchedule: { type: "boolean" }, respectUserPreferences: { type: "boolean" } } } } } },
        responses: { "200": { description: "Saved config" }, "400": { description: "Invalid input" }, "403": { description: "Missing themes.manage" } },
      },
    },
    "/admin/seasonal-themes/{id}": {
      put: {
        tags: ["Admin"],
        summary: "Update a seasonal theme (legacy alias)",
        description: "Legacy alias of `PUT /api/admin/themes/{id}`.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["label", "kind", "enabled", "allowedByAdmin"], properties: { label: { type: "string" }, emoji: { type: "string", nullable: true }, kind: { type: "string", enum: ["season", "holiday"] }, enabled: { type: "boolean" }, config: { type: "object" }, allowedByAdmin: { type: "boolean" } } } } } },
        responses: { "200": { description: "Updated seasonal theme" }, "400": { description: "Invalid input" }, "404": { description: "Not found" }, "403": { description: "Missing themes.manage" } },
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete a seasonal theme (legacy alias)",
        description: "Legacy alias of `DELETE /api/admin/themes/{id}`.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" }, "404": { description: "Not found" }, "403": { description: "Missing themes.manage" } },
      },
    },
    "/admin/seasonal-themes/{id}/background": {
      post: {
        tags: ["Admin"],
        summary: "Upload a seasonal-theme background image (legacy alias)",
        description: "Legacy alias of `POST /api/admin/themes/{id}/background`.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["background"], properties: { background: { type: "string", format: "binary" } } } } } },
        responses: { "200": { description: "{ backgroundImage }" }, "400": { description: "No file or invalid image" }, "404": { description: "Theme not found" }, "403": { description: "Missing themes.manage" } },
      },
      delete: {
        tags: ["Admin"],
        summary: "Remove a seasonal-theme background image (legacy alias)",
        description: "Legacy alias of `DELETE /api/admin/themes/{id}/background`.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Removed" }, "404": { description: "Theme not found" }, "403": { description: "Missing themes.manage" } },
      },
    },

    "/admin/policy/status": {
      get: {
        tags: ["Admin"],
        summary: "Read policy-acceptance rollout status (admin: settings.manage)",
        description: "Returns the policy status snapshot the operator's reminder workflow uses (current versions, acceptance counts).",
        responses: { "200": { description: "Policy status snapshot" }, "500": { description: "Failed to read policy status" }, "403": { description: "Missing settings.manage" } },
      },
    },
    "/admin/policy/note": {
      put: {
        tags: ["Admin"],
        summary: "Save the operator's policy-change note (admin: settings.manage)",
        description: "Stores the operator-authored note shown when a policy version changes. Pass a string to set it, or null/absent to clear it.",
        requestBody: { required: false, content: { "application/json": { schema: { type: "object", properties: { note: { type: "string", nullable: true } } } } } },
        responses: { "200": { description: "{ success: true }" }, "400": { description: "Invalid note" }, "403": { description: "Missing settings.manage" } },
      },
    },
    "/admin/policy/notify": {
      post: {
        tags: ["Admin"],
        summary: "Notify users of a policy change (admin: settings.manage)",
        description: "Sends the policy-change notification to users who have not yet accepted the current versions and returns the dispatch result.",
        responses: { "200": { description: "Notification result" }, "500": { description: "Failed to send the notice" }, "403": { description: "Missing settings.manage" } },
      },
    },

    "/affiliate/me": {
      get: {
        tags: ["Affiliate"],
        summary: "Current user's affiliate/referral summary",
        description:
          "Returns the signed-in user's referral count, active discount (percent + expiry), who referred them, the next milestone, earned rewards, and the effective affiliate configuration.",
        responses: {
          "200": {
            description: "Affiliate summary",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        referralCount: { type: "integer" },
                        discountPercent: { type: "integer", nullable: true },
                        discountExpiresAt: { type: "string", format: "date-time", nullable: true },
                        referredBy: { type: "object", nullable: true, properties: { id: { type: "string" }, username: { type: "string" } } },
                        nextMilestone: { type: "object", nullable: true },
                        rewards: { type: "array", items: { type: "object", properties: { kind: { type: "string" }, value: { type: "string" }, level: { type: "integer" }, createdAt: { type: "string", format: "date-time" } } } },
                        config: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/affiliate/admin/overview": {
      get: {
        tags: ["Affiliate"],
        summary: "Affiliate admin overview (admin: affiliates.manage)",
        description:
          "Top referrers (by redeemed invites), total referrals, distinct referrers, and the effective milestone configuration — including configSource (\"db\" when an admin override is stored, otherwise \"env\").",
        responses: { "200": { description: "Leaderboard + effective config" } },
      },
    },
    "/affiliate/admin/config": {
      put: {
        tags: ["Affiliate"],
        summary: "Store an admin milestone configuration (admin: affiliates.manage)",
        description:
          "Persists a DB override for the affiliate milestone configuration (discount / allowance / badge level sets). The stored config is used instead of the AFFILIATE_*_LEVELS environment variables until reset. Discount values must be integer percents 1-99, allowance values invite counts 1-9999, badge values must reference an existing badge slug, and level numbers must be unique within each reward type.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  discountLevels: { type: "array", items: { type: "object", properties: { level: { type: "integer", minimum: 1 }, value: { type: "string" } }, required: ["level", "value"] } },
                  allowanceLevels: { type: "array", items: { type: "object", properties: { level: { type: "integer", minimum: 1 }, value: { type: "string" } }, required: ["level", "value"] } },
                  badgeLevels: { type: "array", items: { type: "object", properties: { level: { type: "integer", minimum: 1 }, value: { type: "string" } }, required: ["level", "value"] } },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated effective config with configSource=db" }, "400": { description: "Invalid level configuration" } },
      },
      delete: {
        tags: ["Affiliate"],
        summary: "Reset the admin milestone configuration (admin: affiliates.manage)",
        description:
          "Deletes the stored override so the effective milestone configuration falls back to the AFFILIATE_*_LEVELS environment variables.",
        responses: { "200": { description: "Effective config with configSource=env" } },
      },
    },

    "/dmca": {
      post: {
        tags: ["Dmca"],
        summary: "File a DMCA takedown request (public)",
        description:
          "Lets a complainant (optionally signed in) submit a takedown notice under 17 U.S.C. § 512. The three statutory statements (good faith, accuracy, signature) are required and enforced server-side — a notice missing them is not valid. User-facing strings are sanitized; the confirmations are composed into the stored description together with the signature and filing time. Rate-limited to 5/hour per IP. Returns 403 dmca_intake_disabled when the operator has turned intake off in config.yml.",
        security: [{ bearerAuth: [] }, {}],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DmcaReportIntake" },
            },
          },
        },
        responses: {
          "201": { description: "Report recorded", content: { "application/json": { schema: { $ref: "#/components/schemas/DmcaReportReference" } } } },
          "400": { description: "Validation or captcha failed" },
          "403": { description: "dmca_intake_disabled" },
          "429": { description: "dmca_rate_limited (5/hour per IP)" },
        },
      },
    },

    "/dmca/status": {
      get: {
        tags: ["Dmca"],
        summary: "The caller's DMCA status and their own reports",
        description:
          "Requires a valid bearer token. Returns the caller's disabled/appeal state plus the reports this account filed (id, status, workUrl, createdAt, handledAt, infringingUrls). Only the caller's own filing history is ever shown — no operator or counter-party text.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Disabled state + the caller's reports", content: { "application/json": { schema: { $ref: "#/components/schemas/DmcaStatusResponse" } } } },
        },
      },
    },

    "/dmca/appeal": {
      post: {
        tags: ["Dmca"],
        summary: "Appeal a DMCA account disablement",
        description:
          "Lets a disabled account request a human review within the grace window. Records the appeal timestamp; an operator reviews it on the admin Disabled accounts view.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { text: { type: "string", maxLength: 2000 } }, required: ["text"] } } },
        },
        responses: {
          "200": { description: "Appeal recorded" },
          "400": { description: "Validation failed" },
          "403": { description: "Account is not disabled or grace has passed" },
        },
      },
    },

    "/admin/dmca/reports": {
      get: {
        tags: ["Admin"],
        summary: "List DMCA reports (admin: moderation.manage)",
        description:
          "Operator report queue with per-status counts, free-text search (claimant name/email or work URL), optional status / from / to filters and pagination. Each row carries only their active (un-un-banned) hash count, plus the account that filed it when it existed. Requires the moderation.manage permission.",
        parameters: [
          { name: "status", in: "query", required: false, schema: { type: "string", enum: ["NEW", "TAKEN_DOWN", "DISMISSED", "COUNTER_NOTICE"] } },
          { name: "q", in: "query", required: false, schema: { type: "string" } },
          { name: "from", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", maximum: 100 } },
          { name: "offset", in: "query", required: false, schema: { type: "integer" } },
        ],
        responses: {
          "200": { description: "Report rows + counts + pagination", content: { "application/json": { schema: { $ref: "#/components/schemas/DmcaReportList" } } } },
          "403": { description: "Requires moderation.manage" },
          "400": { description: "Unknown status or invalid date filter" },
        },
      },
    },

    "/admin/dmca/reports/{id}": {
      get: {
        tags: ["Admin"],
        summary: "Get a DMCA report in full (admin: moderation.manage)",
        description:
          "Operator view of a report: claimant identity, description, reported URLs, contact note, decisions (handler, note, timestamps), the counter-notice text and the report's hash-ban history. This is the internal record — the public /dmca/status endpoint returns a reduced subset.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Full operator record", content: { "application/json": { schema: { $ref: "#/components/schemas/DmcaReportDetail" } } } },
          "404": { description: "Report not found" },
          "403": { description: "Requires moderation.manage" },
        },
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete a report permanently (admin: moderation.manage)",
        description:
          "Hard-deletes the report row. Its active hash bans are lifted FIRST (delete is not a way to keep a ban alive), all hash rows are detached from the report, and the report is then removed. Blocked during an update lockdown.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "{ success: true, data: { hashesUnbanned } }" },
          "403": { description: "Requires moderation.manage or update lockdown" },
          "404": { description: "Report not found" },
        },
      },
    },

    "/admin/dmca/reports/{id}/dismiss": {
      post: {
        tags: ["Admin"],
        summary: "Dismiss a report (admin: moderation.manage)",
        description:
          "Records the operator decision that no action is needed and emails the claimant the outcome. Dismissing a TAKEN_DOWN report is refused.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { note: { type: "string", maxLength: 1000 } } } } } },
        responses: {
          "200": { description: "{ success: true, message: \"Report dismissed\" }" },
          "400": { description: "Cannot dismiss a TAKEN_DOWN report / invalid body" },
          "403": { description: "Requires moderation.manage" },
          "404": { description: "Report not found" },
        },
      },
    },

    "/admin/dmca/reports/{id}/takedown": {
      post: {
        tags: ["Admin"],
        summary: "Execute a takedown (admin: moderation.manage)",
        description:
          "Removes every copy of the selected files' bytes across all accounts (CASCADE on media_files and cleared profile references), bans one hash per distinct sha256, and disables the owners' accounts unless disableAccount is false. The operator picks explicit mediaFileIds from the media search. Blocked during an update lockdown.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  mediaFileIds: { type: "array", minItems: 1, maxItems: 500, items: { type: "string" } },
                  note: { type: "string", maxLength: 1000 },
                  disableAccount: { type: "boolean" },
                },
                required: ["mediaFileIds"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Takedown result", content: { "application/json": { schema: { $ref: "#/components/schemas/DmcaTakedownResult" } } } },
          "400": { description: "Validation or takedown error (id unknown, no report …)" },
          "403": { description: "Requires moderation.manage or update lockdown" },
          "404": { description: "Report not found" },
        },
      },
    },

    "/admin/dmca/reports/{id}/counter-notice": {
      post: {
        tags: ["Admin"],
        summary: "Record a counter-notice (admin: moderation.manage)",
        description:
          "The reported party disputes the takedown. The report becomes COUNTER_NOTICE, its active hash bans are lifted (unbannedById records the operator), and the owners' accounts stay disabled — re-activation is a separate deliberate operator action on the disabled-account queue.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { text: { type: "string", minLength: 1, maxLength: 2000 } }, required: ["text"] } } },
        },
        responses: {
          "200": { description: "Counter-notice recorded and hash bans lifted" },
          "400": { description: "No counter-notice text / invalid state" },
          "403": { description: "Requires moderation.manage" },
          "404": { description: "Report not found" },
        },
      },
    },

    "/admin/dmca/media": {
      get: {
        tags: ["Admin"],
        summary: "Search media files (admin: moderation.manage)",
        description:
          "Operator media search used to build a takedown: filter by sha256 hash, perceptual pHash hex, username, userId, profileId, kind or date. Every row reports copyOwners/copyCount — how many accounts already hold the same bytes, so the operator can preview what the automatic expansion touches — plus whether the sha256 is currently banned.",
        parameters: [
          { name: "sha256", in: "query", required: false, schema: { type: "string" } },
          { name: "pHash", in: "query", required: false, schema: { type: "string" } },
          { name: "username", in: "query", required: false, schema: { type: "string" } },
          { name: "userId", in: "query", required: false, schema: { type: "string" } },
          { name: "profileId", in: "query", required: false, schema: { type: "string" } },
          { name: "kind", in: "query", required: false, schema: { type: "string", enum: ["AVATAR", "BANNER", "LINK_ICON", "BACKGROUND", "MUSIC", "SHOP_PREVIEW", "SHOP_PRODUCT"] } },
          { name: "from", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", maximum: 100 } },
          { name: "offset", in: "query", required: false, schema: { type: "integer" } },
        ],
        responses: {
          "200": { description: "Media files + copy/banned info + pagination", content: { "application/json": { schema: { $ref: "#/components/schemas/DmcaMediaList" } } } },
          "400": { description: "Unknown kind or invalid date filter" },
          "403": { description: "Requires moderation.manage" },
        },
      },
    },

    "/admin/dmca/hashes": {
      get: {
        tags: ["Admin"],
        summary: "List hash bans (admin: moderation.manage)",
        description:
          "Banned-hash history. Pass ?active=true for the live bans or ?active=false for previously un-banned sha256/pHash rows (the operator audit trail).",
        parameters: [{ name: "active", in: "query", required: false, schema: { type: "string", enum: ["true", "false"] } }],
        responses: {
          "200": { description: "Hash rows + pagination", content: { "application/json": { schema: { $ref: "#/components/schemas/DmcaHashList" } } } },
          "400": { description: "active must be true or false" },
          "403": { description: "Requires moderation.manage" },
        },
      },
      post: {
        tags: ["Admin"],
        summary: "Ban a hash directly (admin: moderation.manage)",
        description:
          "Creates a banned-hash row with no report (operator judgement or a pre-emptive block on bytes not uploaded yet). sha256 must be 64 hex characters; the optional pHash blocks near-twins and must be 16 hex characters. The optional note is stored as the ban reason. 409 when the hash already has a live ban. Blocked during an update lockdown.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  sha256: { type: "string" },
                  pHashHex: { type: "string" },
                  note: { type: "string", maxLength: 1000 },
                },
                required: ["sha256"],
              },
            },
          },
        },
        responses: {
          "201": { description: "Hash banned", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", properties: { id: { type: "string" } } } } } } } },
          "400": { description: "Missing or malformed hash" },
          "403": { description: "Requires moderation.manage or update lockdown" },
          "409": { description: "Hash already has an active ban" },
        },
      },
    },

    "/admin/dmca/hashes/{id}": {
      delete: {
        tags: ["Admin"],
        summary: "Manually un-ban a hash (admin: moderation.manage)",
        description:
          "Lifts a single hash ban (false positive / operator judgement), independent of any report, recording who lifted it. Blocked during an update lockdown.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Hash ban lifted" },
          "403": { description: "Requires moderation.manage or update lockdown" },
          "404": { description: "Hash ban not found" },
          "409": { description: "Already unbanned" },
        },
      },
    },

    "/admin/dmca/disabled": {
      get: {
        tags: ["Admin"],
        summary: "List disabled accounts (admin: moderation.manage)",
        description:
          "The disabled-account queue with the audit fields a reviewer needs: when/why disabled, appeal submission/review state and how many DMCA reports were filed against the account.",
        responses: {
          "200": { description: "Disabled accounts", content: { "application/json": { schema: { $ref: "#/components/schemas/DmcaDisabledList" } } } },
          "403": { description: "Requires moderation.manage" },
        },
      },
    },

    "/admin/dmca/disabled/{id}/reactivate": {
      post: {
        tags: ["Admin"],
        summary: "Re-activate a disabled account (admin: moderation.manage)",
        description:
          "Lifts the account disablement after operator review. Re-activation is never automatic — a counter-notice un-bans hashes but leaves the account down until this is called with a recorded decision note. Blocked during an update lockdown.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { decision: { type: "string", minLength: 1, maxLength: 1000 } }, required: ["decision"] } } },
        },
        responses: {
          "200": { description: "Account re-activated" },
          "400": { description: "Decision required or account not disabled" },
          "403": { description: "Requires moderation.manage or update lockdown" },
          "404": { description: "User not found" },
        },
      },
    },

    "/admin/dmca/takedown": {
      post: {
        tags: ["Admin"],
        summary: "Report-less takedown (admin: moderation.manage)",
        description:
          "Operator-initiated takedown with no DMCA report behind it. Same expansion as the report flow — every copy of the selected files' bytes across all accounts is removed and one hash per distinct sha256 is banned — but accounts are disabled only when disableAccount is explicitly true (default off). The note doubles as the recorded ban reason. Blocked during an update lockdown.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  mediaFileIds: { type: "array", minItems: 1, maxItems: 500, items: { type: "string" } },
                  note: { type: "string", maxLength: 1000 },
                  disableAccount: { type: "boolean" },
                },
                required: ["mediaFileIds"],
              },
            },
          },
        },
        responses: {
          "200": { description: "Takedown result", content: { "application/json": { schema: { $ref: "#/components/schemas/DmcaTakedownResult" } } } },
          "400": { description: "Validation error (no files selected, nothing actionable …)" },
          "403": { description: "Requires moderation.manage or update lockdown" },
        },
      },
    },

    "/admin/dmca/media/{id}": {
      delete: {
        tags: ["Admin"],
        summary: "Delete a single media file (admin: moderation.manage)",
        description:
          "Removes one stored file (object + row + owner reference) without banning its hash, so only this copy is gone and the bytes are not blocked anywhere else. Blocked during an update lockdown.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Media file removed" },
          "403": { description: "Requires moderation.manage or update lockdown" },
          "404": { description: "Media file not found" },
        },
      },
    },

    "/admin/dmca/profiles/{identifier}/takedown": {
      post: {
        tags: ["Admin"],
        summary: "Take down a whole profile's media (admin: moderation.manage)",
        description:
          "Takes down every media file owned by a profile's owner. identifier is a profile id or slug. Expansion to other accounts' copies of the same bytes runs inside execTakedown; accounts are disabled only when disableAccount is explicitly true. Blocked during an update lockdown.",
        parameters: [{ name: "identifier", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  note: { type: "string", maxLength: 1000 },
                  disableAccount: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Takedown result", content: { "application/json": { schema: { $ref: "#/components/schemas/DmcaTakedownResult" } } } },
          "400": { description: "Account has no uploaded media to take down" },
          "403": { description: "Requires moderation.manage or update lockdown" },
          "404": { description: "Profile not found" },
        },
      },
    },

    "/admin/dmca/users/{identifier}/disable": {
      post: {
        tags: ["Admin"],
        summary: "Disable an account directly (admin: moderation.manage)",
        description:
          "Disables an account (id or username) with no takedown behind it, reusing the same disabled-account state as a DMCA takedown: sign-in blocked, visible in the disabled queue and appealable. A reason is required. 409 when the account is already disabled. Blocked during an update lockdown.",
        parameters: [{ name: "identifier", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { reason: { type: "string", minLength: 1, maxLength: 1000 } }, required: ["reason"] } } },
        },
        responses: {
          "200": { description: "Account disabled" },
          "400": { description: "Reason required" },
          "403": { description: "Requires moderation.manage or update lockdown" },
          "404": { description: "User not found" },
          "409": { description: "Account is already disabled" },
        },
      },
    },

    "/payments/webhooks/stripe": {
      post: {
        tags: ["Orders"],
        summary: "Stripe webhook (public)",
        description:
          "Receives Stripe checkout events. Signature is verified with HMAC-SHA256 (STRIPE_WEBHOOK_SECRET). checkout.session.completed marks the order paid and upgrades the tier; checkout.session.expired cancels it.",
        security: [],
        requestBody: { content: { "application/json": { schema: { type: "object" } } } },
        responses: {
          "200": { description: "{ received: true }" },
          "400": { description: "Invalid signature" },
        },
      },
    },

    "/payments/webhooks/paypal": {
      post: {
        tags: ["Orders"],
        summary: "PayPal IPN webhook (public)",
        description:
          "Receives PayPal payment events. Verified with PayPal's verify-webhook-signature endpoint using PAYPAL_WEBHOOK_ID. PAYMENT.CAPTURE.COMPLETED marks the order paid; refunded/denied events refund or cancel it.",
        security: [],
        requestBody: { content: { "application/json": { schema: { type: "object" } } } },
        responses: {
          "200": { description: "{ received: true }" },
          "400": { description: "Invalid signature" },
        },
      },
    },

    "/payments/webhooks/crypto/{provider}": {
      post: {
        tags: ["Orders"],
        summary: "Crypto provider webhook (public)",
        description:
          "Receives crypto payment events (btcpayserver or bitpay). Signature verified per provider; settled invoices mark the order paid, expired/invalid ones cancel it, refunds mark it refunded.",
        security: [],
        parameters: [{ name: "provider", in: "path", required: true, schema: { type: "string", enum: ["btcpayserver", "bitpay"] } }],
        requestBody: { content: { "application/json": { schema: { type: "object" } } } },
        responses: {
          "200": { description: "{ received: true }" },
          "404": { description: "Unknown provider" },
          "503": { description: "Provider not configured" },
          "400": { description: "Invalid signature" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      HealthReport: {
        type: "object",
        description:
          "Truthful readiness report. `status` is `degraded` (HTTP 503) whenever the DB is unreachable or the schema drifted from what the running Prisma client expects — the same failure a production route would throw. `checks.schema.drift` lists precisely which column/table is missing; `issues` is the human-readable copy. The cache is reported but never degrades the status (it is best-effort by design).",
        properties: {
          status: { type: "string", enum: ["ok", "degraded"] },
          timestamp: { type: "string", format: "date-time" },
          checks: {
            type: "object",
            properties: {
              database: {
                type: "object",
                description: "Connectivity ping through the real Prisma client.",
                properties: {
                  ok: { type: "boolean" },
                  latencyMs: { type: ["integer", "null"] },
                },
              },
              schema: {
                type: "object",
                description: "Drift probe: full-scalar read of every core model through Prisma (a missing column/table surfaces as P2021).",
                properties: {
                  ok: { type: "boolean" },
                  probedModels: { type: "array", items: { type: "string" } },
                  tables: { type: "array", items: { type: "string" } },
                  drift: { type: "array", items: { $ref: "#/components/schemas/HealthDrift" } },
                },
              },
              cache: {
                type: "object",
                description: "Cache driver state. Informational: the app falls back to upstream on cache failure and does not 503.",
                properties: {
                  driver: { type: "string" },
                  ok: { type: "boolean" },
                  detail: { type: "string" },
                },
              },
              app: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  node: { type: "string" },
                  uptimeSeconds: { type: "integer" },
                },
              },
            },
          },
          issues: { type: "array", items: { type: "string" }, description: "Empty when healthy; otherwise one entry per failing check." },
        },
      },
      HealthDrift: {
        type: "object",
        description: "A single schema-drift finding (missing column or table).",
        properties: {
          model: { type: "string" },
          table: { type: ["string", "null"] },
          column: { type: ["string", "null"] },
          issue: { type: "string" },
        },
      },
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
          newsletterSenderWhitelisted: { type: "boolean", description: "True if this account is whitelisted to send instance newsletter campaigns" },
          newsletterOptIn: { type: "boolean", description: "True if this account opted in to platform announcements" },
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
          presenceStatus: { type: ["string", "null"], enum: ["online", "idle", "offline"], description: "Static status shown on the public profile" },
          countdown: { type: ["object", "null"], properties: { label: { type: "string", maxLength: 60 }, targetDate: { type: "string" } }, description: "The profile's live countdown block" },
          newsletterEnabled: { type: "boolean", description: "Master newsletter switch; when off the public form stays visible and still collects signups (pause), only sending is disabled" },
          newsletterVisible: { type: "boolean", description: "Whether the public subscribe form is shown on this profile" },
          newsletterHeading: { type: ["string", "null"], maxLength: 60, description: "Heading of the public subscribe form" },
          tipsEnabled: { type: "boolean", description: "Master tips switch; public tip block is only shown when enabled" },
          tipsHeading: { type: ["string", "null"], maxLength: 60, description: "Heading of the public tip block" },
          tipsBtcAddress: { type: ["string", "null"], description: "Bitcoin address (null when tips disabled to avoid leaking the owner address)" },
          tipsLtcAddress: { type: ["string", "null"], description: "Litecoin address (null when tips disabled to avoid leaking the owner address)" },
          theme: { $ref: "#/components/schemas/Theme" },
          terminalCommands: { type: ["array", "null"], items: { $ref: "#/components/schemas/TerminalCommand" }, description: "Custom PRO/ENTERPRISE terminal commands (terminal layout)" },
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
presenceStatus: { type: ["string", "null"], enum: ["online", "idle", "offline"], description: "Static status shown on the public profile" },
          countdown: { type: ["object", "null"], properties: { label: { type: "string", maxLength: 60 }, targetDate: { type: "string" } }, description: "Live countdown block shown on the public profile" },
          newsletterVisible: { type: "boolean", description: "Whether the public subscribe form is shown on this profile" },
          newsletterHeading: { type: ["string", "null"], maxLength: 60, description: "Heading of the public subscribe form" },
          tipsEnabled: { type: "boolean", description: "Master tips switch; public tip block is only shown when enabled" },
          tipsHeading: { type: ["string", "null"], maxLength: 60, description: "Heading of the public tip block" },
          tipsBtcAddress: { type: ["string", "null"], description: "Bitcoin address (null when tips disabled to avoid leaking the owner address)" },
          tipsLtcAddress: { type: ["string", "null"], description: "Litecoin address (null when tips disabled to avoid leaking the owner address)" },
          theme: { $ref: "#/components/schemas/Theme" },
          terminalCommands: { type: ["array", "null"], items: { $ref: "#/components/schemas/TerminalCommand" }, description: "Custom PRO/ENTERPRISE terminal commands (terminal layout)" },
          isPublic: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          musicTracks: { type: "array", items: { type: "object" } },
          discord: { $ref: "#/components/schemas/PublicDiscord" },
          seasonal: { $ref: "#/components/schemas/ResolvedSeasonalTheme", description: "Active seasonal/holiday theme applied to this profile, if any" },
        },
      },
      ResolvedSeasonalTheme: {
        type: "object",
        description: "The resolved seasonal/holiday theme currently applied to a profile, plus how it was chosen.",
        properties: {
          theme: {
            type: ["object", "null"],
            description: "The active theme", properties: {
              slug: { type: "string" },
              label: { type: "string" },
              emoji: { type: ["string", "null"] },
              kind: { type: "string", description: "season | holiday" },
              config: {
                type: "object",
                description: "Theme appearance overrides (bg, cardBg, text, accent, fontFamily, layout, backgroundImage, effect — animated FX overlay: none, snow, pumpkins, hearts, leaves, stars, confetti, sparkle)",
              },
            },
          },
          source: { type: "string", description: "How the theme was activated, e.g. schedule, override, season, holiday, christmasAlways" },
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
          largeImage: { type: ["string", "null"], description: "Large art key or spotify: id for the track cover" },
          smallImage: { type: ["string", "null"] },
          largeUrl: { type: ["string", "null"], description: "Click-through URL for the large art (when provided by the platform)" },
          smallUrl: { type: ["string", "null"], description: "Click-through URL for the small art (when provided by the platform)" },
          largeText: { type: ["string", "null"] },
          smallText: { type: ["string", "null"] },
          buttons: { type: ["array", "null"], items: { type: "string" }, description: "Presence button labels only (Discord never includes URLs to bots)" },
          platform: { type: ["string", "null"], description: "The client platform (e.g. desktop, web, ios, android)" },
          syncId: { type: ["string", "null"], description: "Spotify track sync id (track URI) when present" },
          detailsUrl: { type: ["string", "null"], description: "URL linked to the details text when provided by the platform" },
          stateUrl: { type: ["string", "null"], description: "URL linked to the state text when provided by the platform" },
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
          label: { type: "string", description: "Optional user-defined label shown to visitors" },
          heading: { type: "string", maxLength: 48, description: "Optional section heading the link is grouped under" },
          icon: { type: "string", maxLength: 24, description: "Optional emoji shown instead of the platform logo (LINKS_CUSTOM_ICONS_ENABLED)" },
          image: { type: "string", description: "Optional uploaded favicon image path (/uploads/…, LINKS_CUSTOM_ICONS_ENABLED)" },
          showQr: { type: "boolean", description: "Render an on-profile QR code for this link (LINKS_QR_ENABLED)" },
        },
      },
      TerminalCommand: {
        type: "object",
        required: ["command", "output"],
        description: "A custom terminal command (PRO/ENTERPRISE, terminal layout). command must be unique within the profile.",
        properties: {
          command: { type: "string", pattern: "^[a-z0-9_-]{1,24}$", description: "Lowercase command name (must not clash with built-in commands)" },
          output: { type: "string", maxLength: 300, description: "Text printed when the command is run" },
          description: { type: "string", maxLength: 120, description: "Short label shown in the terminal's help listing when the command is defined" },
          url: { type: "string", description: "Optional link target: http(s)/mailto URL or a plain handle (copied when non-URL)" },
        },
      },
      ProfileDomain: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          profileId: { type: "string", format: "uuid" },
          domain: { type: "string" },
          status: { type: "string", enum: ["PENDING_VERIFICATION", "VERIFIED", "ACTIVE", "REJECTED"] },
          verificationToken: { type: "string", description: "TXT value (bioplatform-verify=<hex>) for _bioplatform.<domain>" },
          verifiedAt: { type: ["string", "null"], format: "date-time" },
          approvedAt: { type: ["string", "null"], format: "date-time" },
          rejectedAt: { type: ["string", "null"], format: "date-time" },
          rootTarget: { type: ["string", "null"], description: "Public profile slug served at the root, or null for the landing page" },
          tlsStatus: { type: "string", enum: ["NONE", "PENDING", "ISSUED", "FAILED"], description: "State of the automatic TLS certificate" },
          tlsIssuedAt: { type: ["string", "null"], format: "date-time" },
          tlsExpiresAt: { type: ["string", "null"], format: "date-time" },
          tlsError: { type: ["string", "null"], description: "Last ACME issuance error, if any" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
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
          animatedFx: { type: "boolean", description: "Whether the animated FX overlay is enabled" },
          effect: { type: "string", enum: ["none", "snow", "pumpkins", "hearts", "leaves", "stars", "confetti", "sparkle"], description: "Animated FX overlay" },
          layout: { type: "string", nullable: true, enum: ["default", "grid", "compact", "wide", "glassmorphism", "minimal", "sidebar", "editorial", "hero", "bento", "terminal", "polaroid", "topbar"], description: "Profile layout" },
          backgroundImage: { type: "string", nullable: true, description: "Background image URL (gradient preset or /uploads/ path); null = none" },
        },
      },
      WebhookEvent: {
        type: "string",
        enum: ["profile.viewed", "link.clicked", "profile.updated", "profile.created", "profile.deleted", "user.registered", "user.updated", "webhook.test"],
      },
      Order: {
        type: "object",
        properties: {
          id: { type: "string" },
          plan: { type: "string", enum: ["FREE", "PRO", "ENTERPRISE"] },
          planLabel: { type: "string" },
          method: { type: "string", enum: ["MANUAL", "STRIPE", "PAYPAL", "CRYPTO"] },
          status: { type: "string", enum: ["PENDING", "PAID", "CANCELLED", "REFUNDED"] },
          currency: { type: "string" },
          basePriceCents: { type: "integer" },
          discountPercent: { type: "integer" },
          finalPriceCents: { type: "integer" },
          adminNote: { type: ["string", "null"] },
          gatewayTransactionId: { type: ["string", "null"] },
          gatewayStatus: { type: ["string", "null"] },
          gatewayCheckoutUrl: { type: ["string", "null"] },
          cryptoCoin: { type: ["string", "null"] },
          cryptoAmount: { type: ["string", "null"], description: "Quoted coin amount (8 decimals)" },
          cryptoRateUsd: { type: ["string", "null"], description: "USD rate used for the quote" },
          paidAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      AdminOrder: {
        type: "object",
        properties: {
          id: { type: "string" },
          plan: { type: "string", enum: ["FREE", "PRO", "ENTERPRISE"] },
          planLabel: { type: "string" },
          method: { type: "string", enum: ["MANUAL", "STRIPE", "PAYPAL", "CRYPTO"] },
          status: { type: "string", enum: ["PENDING", "PAID", "CANCELLED", "REFUNDED"] },
          currency: { type: "string" },
          basePriceCents: { type: "integer" },
          discountPercent: { type: "integer" },
          finalPriceCents: { type: "integer" },
          adminNote: { type: ["string", "null"] },
          gatewayTransactionId: { type: ["string", "null"] },
          gatewayStatus: { type: ["string", "null"] },
          gatewayCheckoutUrl: { type: ["string", "null"] },
          cryptoCoin: { type: ["string", "null"] },
          cryptoAmount: { type: ["string", "null"] },
          cryptoRateUsd: { type: ["string", "null"] },
          paidAt: { type: ["string", "null"], format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          user: {
            type: "object",
            properties: {
              id: { type: "string" },
              username: { type: "string" },
              email: { type: "string" },
              tier: { type: "string", enum: ["FREE", "PRO", "ENTERPRISE"] },
            },
          },
        },
      },
      NewsletterSubscriber: {
        type: "object",
        description: "Newsletter subscriber. GDPR/CASL data-minimized: only the email plus policy versions and consent timestamps are persisted; no IP or User-Agent.",
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email", description: "Stored lowercase" },
          subscribedAt: { type: "string", format: "date-time" },
          agreedAt: { type: "string", format: "date-time", description: "When the TOS + Privacy Policy were accepted (single opt-in)" },
          tosVersion: { type: "string", description: "TOS version agreed to, e.g. 2026-09-16" },
          privacyVersion: { type: "string", description: "Privacy Policy version agreed to, e.g. 2026-09-16" },
          unsubscribedAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      NewsletterSend: {
        type: "object",
        description: "Record of a newsletter send (used for per-tier usage limiting).",
        properties: {
          id: { type: "string" },
          profileId: { type: "string" },
          subject: { type: "string" },
          recipientCount: { type: "integer" },
          successCount: { type: "integer" },
          sentAt: { type: "string", format: "date-time" },
        },
      },

      DmcaReportStatus: {
        type: "string",
        enum: ["NEW", "TAKEN_DOWN", "DISMISSED", "COUNTER_NOTICE"],
        description: "Lifecycle of a DMCA report. COUNTER_NOTICE means the reported party disputed the claim and the report's hash bans were lifted.",
      },

      DmcaReportIntake: {
        type: "object",
        description:
          "Body of POST /dmca. `claimantName`, `claimantEmail`, `workUrl`, `description`, the two attestations and `signature` are required (17 U.S.C. § 512(c)(3)(A)); `infringingUrls` (max 20), `contactNote` and `captchaToken` are optional. Every string is sanitized server-side, and `goodFaith`/`accurate` must be exactly true or the whole request is rejected.",
        properties: {
          claimantName: { type: "string", maxLength: 200, description: "Name of the rights holder / reporting party" },
          claimantEmail: { type: "string", format: "email", maxLength: 254, description: "Contact for outcome notifications" },
          workUrl: { type: "string", maxLength: 2048, description: "The original work being infringed" },
          description: { type: "string", maxLength: 4000 },
          infringingUrls: { type: "array", maxItems: 20, items: { type: "string", maxLength: 2048 } },
          contactNote: { type: "string", maxLength: 1000, description: "Optional context; set to the filer's username when signed in" },
          goodFaith: { type: "boolean", description: "Attestation of good faith (must be true)" },
          accurate: { type: "boolean", description: "Attestation that the information is accurate (must be true)" },
          signature: { type: "string", maxLength: 200, description: "Electronic signature (physical or electronic)" },
          captchaToken: { type: "string", maxLength: 4096, description: "Required only when a captcha provider is configured" },
        },
        required: ["claimantName", "claimantEmail", "workUrl", "description", "goodFaith", "accurate", "signature"],
      },

      DmcaReportReference: {
        type: "object",
        description: "Returned by POST /dmca: the new report.",
        properties: {
          id: { type: "string" },
          status: { $ref: "#/components/schemas/DmcaReportStatus" },
          createdAt: { type: "string", format: "date-time" },
        },
      },

      DmcaStatusResponse: {
        type: "object",
        description: "Returned by GET /dmca/status: the caller's disabled/appeal state plus their own filing history.",
        properties: {
          disabled: {
            oneOf: [
              { type: "object", description: "Account not DMCA-disabled", properties: { disabled: { type: "boolean", enum: [false] } } },
              {
                type: "object",
                properties: {
                  disabled: { type: "boolean", enum: [true] },
                  disabledAt: { type: "string", format: "date-time" },
                  disabledReason: { type: "string" },
                  appealSubmittedAt: { type: ["string", "null"], format: "date-time" },
                  appealText: { type: ["string", "null"] },
                },
              },
            ],
          },
          reports: { type: "array", items: { $ref: "#/components/schemas/DmcaStandaloneReport" } },
        },
      },

      DmcaStandaloneReport: {
        type: "object",
        description: "A report the caller filed, as shown on /api/dmca/status.",
        properties: {
          id: { type: "string" },
          status: { $ref: "#/components/schemas/DmcaReportStatus" },
          workUrl: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          handledAt: { type: ["string", "null"], format: "date-time" },
          infringingUrls: { type: "array", items: { type: "string" } },
        },
      },

      DmcaReportList: {
        type: "object",
        properties: {
          reports: {
            type: "array",
            items: { $ref: "#/components/schemas/DmcaReportRow" },
          },
          counts: {
            type: "object",
            properties: {
              NEW: { type: "integer" },
              TAKEN_DOWN: { type: "integer" },
              DISMISSED: { type: "integer" },
              COUNTER_NOTICE: { type: "integer" },
            },
          },
          pagination: { type: "object", properties: { total: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" } } },
        },
      },

      DmcaReportRow: {
        type: "object",
        description: "A single row on the admin report queue.",
        properties: {
          id: { type: "string" },
          status: { $ref: "#/components/schemas/DmcaReportStatus" },
          claimantName: { type: "string" },
          claimantEmail: { type: "string", format: "email" },
          workUrl: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          handledAt: { type: ["string", "null"], format: "date-time" },
          counterNoticeAt: { type: ["string", "null"], format: "date-time" },
          filedBy: { type: ["string", "null"], description: "Username of the account that filed it, or null for a guest filing" },
          activeHashes: { type: "integer", description: "Live (un-un-banned) hash bans attached to this report" },
        },
      },

      DmcaReportDetail: {
        type: "object",
        description: "Full operator record for a report.",
        properties: {
          id: { type: "string" },
          status: { $ref: "#/components/schemas/DmcaReportStatus" },
          claimantName: { type: "string" },
          claimantEmail: { type: "string", format: "email" },
          workUrl: { type: "string" },
          description: { type: "string" },
          infringingUrls: { type: "array", items: { type: "string" } },
          contactNote: { type: ["string", "null"] },
          createdAt: { type: "string", format: "date-time" },
          handledAt: { type: ["string", "null"], format: "date-time" },
          decisionNote: { type: ["string", "null"], description: "Operator note recorded on dismiss/takedown" },
          counterNotice: { type: ["string", "null"] },
          counterNoticeAt: { type: ["string", "null"], format: "date-time" },
          filedByUser: { type: ["object", "null"], properties: { id: { type: "string" }, username: { type: "string" } }, description: "Nulls when the filing account is deleted and the record is kept" },
          handledBy: { type: ["object", "null"], properties: { id: { type: "string" }, username: { type: "string" } } },
          hashes: { type: "array", items: { $ref: "#/components/schemas/DmcaHashRow" } },
        },
      },

      DmcaHashRow: {
        type: "object",
        properties: {
          id: { type: "string" },
          sha256: { type: "string" },
          pHashHex: { type: "string" },
          reason: { type: ["string", "null"] },
          bannedAt: { type: "string", format: "date-time" },
          unbannedAt: { type: ["string", "null"], format: "date-time" },
          dmcaReportId: { type: ["string", "null"] },
          bannedBy: { type: ["object", "null"], properties: { username: { type: "string" } } },
          unbannedBy: { type: ["object", "null"], properties: { username: { type: "string" } } },
          active: { type: "boolean", description: "unbannedAt === null" },
        },
      },

      DmcaHashList: {
        type: "object",
        properties: {
          hashes: { type: "array", items: { $ref: "#/components/schemas/DmcaHashRow" } },
          pagination: { type: "object", properties: { total: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" } } },
        },
      },

      DmcaTakedownResult: {
        type: "object",
        description: "Result of an executed takedown.",
        properties: {
          filesRemoved: { type: "integer", description: "Media files deleted across all accounts (CASCADE)" },
          hashesBanned: { type: "integer", description: "Distinct sha256 hash bans inserted" },
          accountsDisabled: { type: "array", items: { type: "string" }, description: "User ids of the owners disabled by the takedown" },
        },
      },

      DmcaMediaList: {
        type: "object",
        properties: {
          files: { type: "array", items: { $ref: "#/components/schemas/DmcaMediaFile" } },
          pagination: { type: "object", properties: { total: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" } } },
        },
      },

      DmcaMediaFile: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["AVATAR", "BANNER", "LINK_ICON", "BACKGROUND", "MUSIC", "SHOP_PREVIEW", "SHOP_PRODUCT"] },
          sha256: { type: "string" },
          pHashHex: { type: "string" },
          filePath: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          profileId: { type: ["string", "null"] },
          profileSlug: { type: ["string", "null"] },
          owner: { type: "object", properties: { userId: { type: "string" }, username: { type: "string" } } },
          copyOwners: { type: "array", items: { type: "string" }, description: "Every account holding the same bytes (this one included)" },
          copyCount: { type: "integer" },
          banned: { type: "boolean", description: "Whether the sha256 currently has a live hash ban" },
        },
      },

      DmcaDisabledList: {
        type: "object",
        properties: {
          users: { type: "array", items: { $ref: "#/components/schemas/DmcaDisabledUser" } },
          pagination: { type: "object", properties: { total: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" } } },
        },
      },

      DmcaDisabledUser: {
        type: "object",
        description: "A disabled account on the moderation queue.",
        properties: {
          id: { type: "string" },
          username: { type: "string" },
          email: { type: "string", format: "email" },
          disabledAt: { type: "string", format: "date-time" },
          disabledReason: { type: ["string", "null"] },
          appealSubmittedAt: { type: ["string", "null"], format: "date-time" },
          appealReviewedAt: { type: ["string", "null"], format: "date-time" },
          appealDecision: { type: ["string", "null"] },
          reportsFiled: { type: "integer", description: "DMCA reports filed against this account" },
        },
      },
    },
  },
} as const;
