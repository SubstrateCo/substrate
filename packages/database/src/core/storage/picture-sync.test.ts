/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { setupDatabase } from "../../testing/database";
import { user } from "../authentication/schema";
import { organization } from "../organizations/schema";
import { storedFiles, userPictures, organizationPictures } from "./schema";

const f = setupDatabase();
const file = (purpose: string, organizationId: string | null = null) => ({
  id: crypto.randomUUID(),
  purpose,
  organizationId,
  ownerUserId: organizationId ? null : "alice",
  uploadedBy: "alice",
  filename: "image.webp",
  contentType: "image/webp",
  size: 100,
  sha256: "a".repeat(64),
  objectKey: crypto.randomUUID(),
});

test("native auth field writes atomically attach, replace, and clear managed pictures", async () => {
  const first = file("avatar");
  const second = file("avatar");
  const logo = file("organization-logo", f.orgA);
  await f.db.insert(storedFiles).values([first, second, logo]);
  await f.db
    .update(user)
    .set({ image: `/api/v1/files/${first.id}/content` })
    .where(eq(user.id, "alice"));
  const [initial] = await f.db.select().from(userPictures).where(eq(userPictures.userId, "alice"));
  expect(initial?.fileId).toBe(first.id);
  await f.db
    .update(user)
    .set({ image: `/api/v1/files/${second.id}/content` })
    .where(eq(user.id, "alice"));
  const [replaced] = await f.db.select().from(userPictures).where(eq(userPictures.userId, "alice"));
  expect(replaced?.fileId).toBe(second.id);
  expect(replaced?.id).toBe(initial?.id);
  await f.db
    .update(organization)
    .set({ logo: `/api/v1/files/${logo.id}/content` })
    .where(eq(organization.id, f.orgA));
  expect((await f.db.select().from(organizationPictures))[0]?.fileId).toBe(logo.id);
  await f.db.update(user).set({ image: null }).where(eq(user.id, "alice"));
  await f.db.update(organization).set({ logo: null }).where(eq(organization.id, f.orgA));
  expect(await f.db.select().from(userPictures)).toHaveLength(0);
  expect(await f.db.select().from(organizationPictures)).toHaveLength(0);
});

test("SQL constraints roll back native auth writes and preserve the old attachment", async () => {
  const avatar = file("avatar");
  const foreignLogo = file("organization-logo", f.orgB);
  await f.db.insert(storedFiles).values([avatar, foreignLogo]);
  const image = `/api/v1/files/${avatar.id}/content`;
  await f.db.update(user).set({ image }).where(eq(user.id, "alice"));
  for (const invalid of [
    "https://evil.test/a",
    `/api/v1/files/${crypto.randomUUID()}/content`,
    `/api/v1/files/${foreignLogo.id}/content`,
  ]) {
    await expect(
      f.db.update(user).set({ image: invalid }).where(eq(user.id, "alice")).execute(),
    ).rejects.toThrow();
    expect((await f.db.select().from(user).where(eq(user.id, "alice")))[0]?.image).toBe(image);
    expect(
      (await f.db.select().from(userPictures).where(eq(userPictures.userId, "alice")))[0]?.fileId,
    ).toBe(avatar.id);
  }
  await expect(
    f.db.update(user).set({ image }).where(eq(user.id, "bob")).execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    f.db
      .update(organization)
      .set({ logo: `/api/v1/files/${foreignLogo.id}/content` })
      .where(eq(organization.id, f.orgA))
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  expect(
    (await f.db.select().from(organization).where(eq(organization.id, f.orgA)))[0]?.logo,
  ).toBeNull();
});
