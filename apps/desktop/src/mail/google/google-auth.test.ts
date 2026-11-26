import { connectGoogle, gmailAccess } from "./google-auth.ts";
import { readGoogleClientFile } from "./google-client.ts";
import { ReconnectRequired } from "../provider.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("desktop consent requests Gmail modify and binds the returned grant to the verified provider subject", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mail-oauth-fixture-"));
  let challenge = "";
  try {
    const file = join(directory, "synthetic-client.json");
    const fixture = {
      client_id: "synthetic.apps.googleusercontent.com",
      client_secret: "synthetic-only",
    };
    await writeFile(
      file,
      JSON.stringify({
        installed: {
          ...fixture,
          token_uri: "https://ignored.example.test/token",
          project_id: "synthetic",
        },
      }),
    );
    const client = await readGoogleClientFile(file);
    const grant = await connectGoogle(
      client,
      async (href) => {
        const url = new URL(href);
        expect(url.origin).toBe("https://accounts.google.com");
        expect(url.searchParams.get("client_id")).toBe(fixture.client_id);
        expect(url.searchParams.has("client_secret")).toBe(false);
        expect(url.searchParams.has("include_granted_scopes")).toBe(false);
        expect(url.searchParams.get("scope")).toBe(
          "openid https://www.googleapis.com/auth/gmail.modify",
        );
        expect(url.searchParams.get("code_challenge_method")).toBe("S256");
        challenge = url.searchParams.get("code_challenge")!;
        const callback = new URL(url.searchParams.get("redirect_uri")!);
        expect(callback.hostname).toBe("127.0.0.1");
        callback.searchParams.set("code", "sample");
        expect((await fetch(callback)).status).toBe(400);
        callback.searchParams.set("state", url.searchParams.get("state")!);
        expect((await fetch(callback)).status).toBe(200);
      },
      new AbortController().signal,
      async (url, init) => {
        if (url === "https://oauth2.googleapis.com/token") {
          expect(init.method).toBe("POST");
          const params = init.body;
          if (!(params instanceof URLSearchParams))
            throw new Error("Expected a form-encoded OAuth exchange.");
          expect(params.get("client_id")).toBe(fixture.client_id);
          expect(params.get("client_secret")).toBe(fixture.client_secret);
          expect(params.get("code")).toBe("sample");
          expect(
            createHash("sha256").update(params.get("code_verifier")!).digest("base64url"),
          ).toBe(challenge);
          return Response.json({
            access_token: "access",
            refresh_token: "refresh",
            expires_in: 3600,
          });
        }
        expect(init.method ?? "GET").toBe("GET");
        expect(new Headers(init.headers).get("authorization")).toBe("Bearer access");
        if (url === "https://openidconnect.googleapis.com/v1/userinfo")
          return Response.json({ sub: "stable-google-account" });
        if (url === "https://gmail.googleapis.com/gmail/v1/users/me/profile")
          return Response.json({ emailAddress: "sample@example.test" });
        throw new Error("Unexpected identity request.");
      },
    );
    expect(grant).toEqual({
      providerAccountId: "stable-google-account",
      address: "sample@example.test",
      refreshToken: "refresh",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refresh keeps legacy read-only grants usable without upgrading them and rejects unrelated scopes", async () => {
  const read = "https://www.googleapis.com/auth/gmail.readonly";
  const modify = "https://www.googleapis.com/auth/gmail.modify";
  let downgrades = 0;
  const refresh = (scope: string) =>
    gmailAccess(
      { client_id: "native-fixture" },
      "fixture-refresh",
      new AbortController().signal,
      async () => {
        throw new Error("Unexpected rotation");
      },
      async () => Response.json({ access_token: "fixture-access", expires_in: 3600, scope }),
      async () => {
        downgrades++;
      },
    )();
  expect(await refresh(`openid ${read}`)).toBe("fixture-access");
  expect(await refresh(`openid ${modify}`)).toBe("fixture-access");
  expect(downgrades).toBe(1);
  for (const scope of ["openid", `${read} https://www.googleapis.com/auth/calendar.readonly`])
    await rejects(refresh(scope), ReconnectRequired);
});

test("cancelling an upgrade or granting only read access never produces a replacement connection", async () => {
  const authorize = (cancel: boolean) =>
    connectGoogle(
      { client_id: "fixture" },
      async (href) => {
        const url = new URL(href);
        const callback = new URL(url.searchParams.get("redirect_uri")!);
        callback.searchParams.set("state", url.searchParams.get("state")!);
        callback.searchParams.set(cancel ? "error" : "code", cancel ? "access_denied" : "sample");
        await fetch(callback);
      },
      new AbortController().signal,
      async (url) => {
        if (cancel || url !== "https://oauth2.googleapis.com/token")
          throw new Error("Unexpected request");
        return Response.json({
          access_token: "read-only",
          refresh_token: "replacement",
          expires_in: 3600,
          scope: "openid https://www.googleapis.com/auth/gmail.readonly",
        });
      },
    );
  expect(await authorize(true)).toBeNull();
  await rejects(authorize(false), ReconnectRequired);
});

test("a rotated token is saved before exposing access and is used for the next refresh", async () => {
  const used: string[] = [],
    saved: string[] = [];
  const access = gmailAccess(
    { client_id: "fixture" },
    "original",
    new AbortController().signal,
    async (token) => {
      saved.push(token);
    },
    async (_url, init) => {
      if (!(init.body instanceof URLSearchParams)) throw new Error("Expected a form");
      used.push(init.body.get("refresh_token")!);
      return Response.json({ access_token: "access", expires_in: 1, refresh_token: "rotated" });
    },
  );
  await Promise.all([access(), access()]);
  expect(saved).toEqual(["rotated"]);
  await access();
  expect(used).toEqual(["original", "rotated"]);
  expect(saved).toEqual(["rotated"]);
});
