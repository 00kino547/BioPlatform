-- Record the authenticator class and device/binding info reported at passkey
-- registration time. These are facts about how the credential was created;
-- they are NOT proof of discoverable (resident) support, which the client
-- does not reliably expose.
--   authenticator_attachment: "platform" | "cross-platform" | NULL (reported by the browser)
--   credential_device_type:   "singleDevice" | "multiDevice" | NULL (from @simplewebauthn/server)
ALTER TABLE passkeys
  ADD COLUMN IF NOT EXISTS authenticator_attachment TEXT,
  ADD COLUMN IF NOT EXISTS credential_device_type TEXT;