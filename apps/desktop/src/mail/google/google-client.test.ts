import { gmailAccess } from "./google-auth.ts";
import {
  clientForConsent,
  packGoogleGrant,
  readGoogleClientFile,
  unpackGoogleGrant,
} from "./google-client.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("fresh consent can recover a mailbox even if its saved OAuth client cannot be read", async () => {
  const replacement = { client_id: "new.apps.googleusercontent.com" };
  const saved = () => {
    throw new Error("Unreadable old grant");
  };
  const dir = await mkdtemp(join(tmpdir(), "mail-replacement-"));
  try {
    const file = join(dir, "new-client.json");
    await writeFile(file, JSON.stringify({ installed: replacement }));
    expect(
      await clientForConsent(true, { client_id: "configured" }, saved, () =>
        readGoogleClientFile(file),
      ),
    ).toEqual(replacement);
    expect(await clientForConsent(true, replacement, saved, async () => null)).toBeNull();
    expect(await clientForConsent(false, replacement, saved, async () => null)).toEqual(
      replacement,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("refresh uses the original desktop client after the download is gone; legacy raw grants remain readable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mail-client-fixture-"));
  try {
    const path = join(directory, "synthetic.json");
    const fixture = {
      client_id: "first.apps.googleusercontent.com",
      client_secret: "fixture-secret",
    };
    await writeFile(
      path,
      JSON.stringify({ installed: { ...fixture, auth_uri: "https://ignored.example.test" } }),
    );
    const packed = packGoogleGrant(await readGoogleClientFile(path), "fixture-refresh");
    expect(JSON.parse(packed)).toEqual({
      version: 1,
      client: fixture,
      refreshToken: "fixture-refresh",
    });
    await rm(path);
    const grant = unpackGoogleGrant(packed);
    if (!grant.client) throw new Error("Missing client in the fixture grant.");
    const token = gmailAccess(
      grant.client,
      grant.refreshToken,
      new AbortController().signal,
      async () => {
        throw new Error("Unexpected rotation");
      },
      async (url, options) => {
        expect(url).toBe("https://oauth2.googleapis.com/token");
        const body = options.body;
        if (!(body instanceof URLSearchParams)) throw new Error("Expected form data.");
        expect(Object.fromEntries(body)).toEqual({
          ...fixture,
          refresh_token: "fixture-refresh",
          grant_type: "refresh_token",
        });
        return Response.json({ access_token: "fixture-access", expires_in: 3600 });
      },
    );
    expect(await token()).toBe("fixture-access");
    expect(unpackGoogleGrant("legacy-fixture-token")).toEqual({
      client: undefined,
      refreshToken: "legacy-fixture-token",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("wrong client type, malformed and oversized downloads produce the same non-sensitive message", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mail-client-invalid-"));
  try {
    const path = join(directory, "client-fixture-private.json");
    for (const invalid of [
      JSON.stringify({ web: { client_id: "incorrect-client", client_secret: "fixture-secret" } }),
      "fixture-secret : broken JSON",
      "x".repeat(65 * 1024),
    ]) {
      await writeFile(path, invalid);
      await rejects(readGoogleClientFile(path), {
        message: "Choose the downloaded JSON for a Google Desktop app OAuth client.",
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
