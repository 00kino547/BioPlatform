import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildAuthorizeUrl,
  base64UrlEncode,
  sha256,
  pkceChallenge,
  exchangeAuthCode,
  fetchProviderProfile,
  getSsoClientCredentials,
  ssoProvidersEnabled,
} from "../src/lib/oauth.js";

const ENV = {
  SSO_GOOGLE_CLIENT_ID: "g",
  SSO_GOOGLE_CLIENT_SECRET: "gs",
  SSO_GITHUB_CLIENT_ID: "",
  SSO_GITHUB_CLIENT_SECRET: "",
  SSO_DISCORD_CLIENT_ID: "d",
  SSO_DISCORD_CLIENT_SECRET: "ds",
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
    ok,
  });
}

describe("base64url + PKCE", () => {
  test("encodes without +/ and without padding", () => {
    const buf = Buffer.from([0xfb, 0xff, 0x40, 0x00]);
    assert.equal(base64UrlEncode(buf), "-_9AAA");
  });

  test("verifier is base64url and challenge is its sha256", () => {
    const { verifier, challenge } = pkceChallenge();
    assert.equal(verifier, verifier.replace(/[^A-Za-z0-9_-]/g, ""));
    assert.equal(verifier.length >= 43, true);
    assert.equal(challenge, base64UrlEncode(sha256(verifier)));
  });
});

describe("ssoProvidersEnabled / getSsoClientCredentials", () => {
  test("only returns providers with a client id", () => {
    assert.deepEqual(ssoProvidersEnabled(ENV), ["google", "discord"]);
  });

  test("configured providers return credentials, unconfigured return null", () => {
    assert.deepEqual(getSsoClientCredentials("google", ENV), { clientId: "g", clientSecret: "gs" });
    assert.equal(getSsoClientCredentials("github", ENV), null);
  });
});

describe("buildAuthorizeUrl", () => {
  for (const provider of ["google", "github", "discord"] as const) {
    test(`${provider} includes standard OAuth params`, () => {
      const url = new URL(
        buildAuthorizeUrl({
          provider,
          clientId: "cid",
          redirectUri: "https://app.test/api/auth/oauth/callback",
          state: "st",
          codeChallenge: "ch",
        })
      );
      assert.equal(url.searchParams.get("client_id"), "cid");
      assert.equal(url.searchParams.get("redirect_uri"), "https://app.test/api/auth/oauth/callback");
      assert.equal(url.searchParams.get("response_type"), "code");
      assert.equal(url.searchParams.get("scope"), `${provider === "google" ? "openid email profile" : provider === "github" ? "read:user user:email" : "identify email"}`);
      assert.equal(url.searchParams.get("state"), "st");
      assert.equal(url.searchParams.get("code_challenge"), "ch");
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    });
  }
});

describe("exchangeAuthCode", () => {
  test("posts form-encoded body and returns access token", async () => {
    let received: { url: string; init: RequestInit } | null = null;
    const mock = (async (url, init) => {
      received = { url: String(url), init };
      return jsonResponse({ access_token: "tok123" });
    }) as typeof fetch;

    const token = await exchangeAuthCode(
      "google",
      {
        code: "code1",
        codeVerifier: "v",
        clientId: "cid",
        clientSecret: "cs",
        redirectUri: "https://app.test/api/auth/oauth/callback",
      },
      mock
    );

    assert.equal(token, "tok123");
    assert.ok(received, "fetch should have been called");
    assert.equal(received!.url, "https://oauth2.googleapis.com/token");
    const body = received!.init.body as string;
    assert.match(body, /grant_type=authorization_code/);
    assert.match(body, /code=code1/);
    assert.match(body, /code_verifier=v/);
    assert.match(body, /client_id=cid/);
    assert.match(body, /client_secret=cs/);
  });

  test("throws when the provider returns an error", async () => {
    const mock = (async () => jsonResponse({ error: "invalid_grant" })) as typeof fetch;
    await assert.rejects(
      exchangeAuthCode("github", {
        code: "x",
        codeVerifier: "v",
        clientId: "cid",
        clientSecret: "cs",
        redirectUri: "https://app.test/api/auth/oauth/callback",
      }, mock)
    );
  });

  test("throws on non-ok responses", async () => {
    const mock = (async () => jsonResponse({}, false, 500)) as typeof fetch;
    await assert.rejects(
      exchangeAuthCode("discord", {
        code: "x",
        codeVerifier: "v",
        clientId: "cid",
        clientSecret: "cs",
        redirectUri: "https://app.test/api/auth/oauth/callback",
      }, mock)
    );
  });
});

describe("fetchProviderProfile", () => {
  test("google maps sub/email_verified/name/picture", async () => {
    const mock = (async () =>
      jsonResponse({ sub: "111", email: "a@b.test", email_verified: true, name: "Ann", picture: "https://img" })) as typeof fetch;
    const profile = await fetchProviderProfile("google", "tok", mock);
    assert.deepEqual(profile, {
      id: "111",
      email: "a@b.test",
      emailVerified: true,
      name: "Ann",
      avatar: "https://img",
    });
  });

  test("github falls back to /user/emails when email is null", async () => {
    let call = 0;
    const mock = (async () => {
      call += 1;
      if (call === 1) {
        return jsonResponse({ id: 555, login: "gandalf", avatar_url: "https://av" });
      }
      return jsonResponse([
        { email: "g@b.test", primary: true, verified: true },
      ]);
    }) as typeof fetch;
    const profile = await fetchProviderProfile("github", "tok", mock);
    assert.deepEqual(profile, {
      id: "555",
      email: "g@b.test",
      emailVerified: true,
      name: "gandalf",
      avatar: "https://av",
    });
  });

  test("discord builds the CDN avatar and uses global_name", async () => {
    const mock = (async () =>
      jsonResponse({ id: "22", username: "dude", global_name: "Dude", email: "d@b.test", verified: true, avatar: "deadbeef" })) as typeof fetch;
    const profile = await fetchProviderProfile("discord", "tok", mock);
    assert.deepEqual(profile, {
      id: "22",
      email: "d@b.test",
      emailVerified: true,
      name: "Dude",
      avatar: "https://cdn.discordapp.com/avatars/22/deadbeef.png",
    });
  });
});