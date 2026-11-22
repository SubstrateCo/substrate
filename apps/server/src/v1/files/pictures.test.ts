import { ServiceError } from "../../shared/service-result";
import { createPictureService } from "./pictures";
import { expect, test } from "bun:test";
import sharp from "sharp";

const scope = { userId: "alice", organizationId: "org" };

async function fixture() {
  const objects = new Map<string, Uint8Array>();
  let allowed = true;
  const service = createPictureService({
    repository: {
      requirePictureAccess: async () => {
        if (!allowed) throw new ServiceError("FORBIDDEN", "Access denied.");
      },
      canReadPicture: async () => allowed,
    },
    projects: {
      requireEdit: async () => {
        if (!allowed) throw new ServiceError("FORBIDDEN", "Access denied.");
      },
      canRead: async () => allowed,
    },
    storage: {
      put: async (key, bytes) => {
        objects.set(key, bytes);
      },
      signDownload: async (key) => `https://s3.test/${key}`,
    },
  });
  const image = async (color: string) => ({
    bytes: new Uint8Array(
      await sharp({ create: { width: 20, height: 20, channels: 3, background: color } })
        .png()
        .toBuffer(),
    ),
    contentType: "image/png",
  });
  return {
    service,
    objects,
    image,
    deny: () => {
      allowed = false;
    },
  };
}

test("profile uploads overwrite one S3 object and return a fresh URL without attaching it", async () => {
  const f = await fixture();
  const first = await f.service.upload(scope, "avatar", await f.image("red"));
  const previous = f.objects.get("pictures/avatar/alice.webp")!.slice();
  const second = await f.service.upload(scope, "avatar", await f.image("blue"));
  expect(first.success).toBe(true);
  expect(second.success).toBe(true);
  expect(first.success && first.data.url).toStartWith("/api/v1/files/pictures/avatar/alice?v=");
  expect(second.success && second.data.url).not.toBe(first.success && first.data.url);
  expect(f.objects.size).toBe(1);
  expect(f.objects.get("pictures/avatar/alice.webp")).not.toEqual(previous);
  expect((await sharp(f.objects.get("pictures/avatar/alice.webp")).metadata()).format).toBe("webp");
});

test("logos use the active organization key and denied writes do not replace it", async () => {
  const f = await fixture();
  expect((await f.service.upload(scope, "organization-logo", await f.image("red"))).success).toBe(
    true,
  );
  const previous = f.objects.get("pictures/organization-logo/org.webp")!.slice();
  f.deny();
  const denied = await f.service.upload(scope, "organization-logo", await f.image("blue"));
  expect(!denied.success && denied.error.code).toBe("FORBIDDEN");
  expect(f.objects.get("pictures/organization-logo/org.webp")).toEqual(previous);
  expect(f.objects.size).toBe(1);
});

test("invalid images and oversized uploads do not write S3 objects", async () => {
  const f = await fixture();
  for (const file of [
    { bytes: new TextEncoder().encode("not an image"), contentType: "image/png" },
    { bytes: new Uint8Array(5 * 1024 * 1024 + 1), contentType: "image/png" },
  ]) {
    expect((await f.service.upload(scope, "avatar", file)).success).toBe(false);
  }
  expect(f.objects.size).toBe(0);
});

test("a changed active organization cannot overwrite another workspace's logo", async () => {
  const f = await fixture();
  const result = await f.service.upload(
    scope,
    "organization-logo",
    await f.image("red"),
    "previous-org",
  );
  expect(!result.success && result.error.code).toBe("WORKSPACE_CHANGED");
  expect(f.objects.size).toBe(0);
});

test("picture reads require access before issuing a download URL", async () => {
  const f = await fixture();
  expect(await f.service.content(scope, "avatar", "bob")).toEqual({
    success: true,
    data: { url: "https://s3.test/pictures/avatar/bob.webp" },
  });
  f.deny();
  const denied = await f.service.content(scope, "avatar", "bob");
  expect(!denied.success && denied.error.code).toBe("NOT_FOUND");
});

test("project icons reuse the picture upload pipeline with a project-specific object key", async () => {
  const f = await fixture();
  const id = crypto.randomUUID();
  const uploaded = await f.service.upload(scope, "project-icon", await f.image("red"), "org", id);
  expect(uploaded.success && uploaded.data.url).toStartWith(
    `/api/v1/files/pictures/project-icon/${id}?v=`,
  );
  const key = `pictures/project-icon/${id}.webp`;
  const previous = f.objects.get(key)!.slice();
  f.deny();
  const denied = await f.service.upload(scope, "project-icon", await f.image("blue"), "org", id);
  expect(denied.success).toBe(false);
  expect(f.objects.get(key)).toEqual(previous);
});

test("project icons check project access and other pictures check workspace access", async () => {
  const service = createPictureService({
    repository: {
      requirePictureAccess: async () => {
        throw new ServiceError("FORBIDDEN", "Access denied.");
      },
      canReadPicture: async () => false,
    },
    projects: { requireEdit: async () => {}, canRead: async (_scope, id) => id === "project" },
    storage: { put: async () => {}, signDownload: async (key) => `https://s3.test/${key}` },
  });
  expect((await service.content(scope, "project-icon", "project")).success).toBe(true);
  expect((await service.content(scope, "organization-logo", "project")).success).toBe(false);
  expect((await service.content(scope, "project-icon", "other")).success).toBe(false);
});

test("project icons require a target project and cannot cross the active workspace", async () => {
  const f = await fixture();
  const missing = await f.service.upload(scope, "project-icon", await f.image("red"), "org");
  expect(!missing.success && missing.error.code).toBe("INVALID_INPUT");
  const foreign = await f.service.upload(
    scope,
    "project-icon",
    await f.image("red"),
    "other",
    crypto.randomUUID(),
  );
  expect(!foreign.success && foreign.error.code).toBe("WORKSPACE_CHANGED");
  expect(f.objects.size).toBe(0);
});
