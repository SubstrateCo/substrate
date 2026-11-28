import { fakePictureServer, jsonBody } from "./pictures.test-support";
import { expect, test } from "bun:test";

type PictureResponse = { url: string } | { logo: null };
const success = (data: PictureResponse) => Response.json({ success: true, data });
const file = () => new File(["picture"], "cropped.png", { type: "image/png" });
const pictureUrl = `/api/v1/files/pictures/avatar/alice?v=${crypto.randomUUID()}`;

test("uploads picture bytes before saving the returned URL through Better Auth", async () => {
  const { requests, pictures } = fakePictureServer(
    () => success({ url: pictureUrl }),
    () => Response.json({ status: true }),
  );
  const picture = file();
  const controller = new AbortController();
  await pictures.uploadPicture(picture, "avatar", controller.signal);
  expect(requests[0]?.url).toEndWith("/api/v1/files/pictures/avatar");
  const body = requests[0]?.init?.body;
  if (!(body instanceof FormData)) throw new Error("Expected multipart upload.");
  const uploaded = body.get("file");
  if (!(uploaded instanceof File)) throw new Error("Expected picture bytes.");
  expect(await uploaded.text()).toBe(await picture.text());
  expect(requests[0]?.init?.signal).toBe(controller.signal);
  expect(requests[1]?.url).toEndWith("/api/auth/update-user");
  expect(requests[1]?.init?.method).toBe("POST");
  expect(await jsonBody(requests[1])).toEqual({ image: pictureUrl });
  expect(requests).toHaveLength(2);
});

test("does not save a picture URL when the upload fails", async () => {
  const { requests, pictures } = fakePictureServer(() =>
    Response.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Upload failed." } },
      { status: 500 },
    ),
  );
  await pictures.uploadPicture(file(), "organization-logo").then(
    () => {
      throw new Error("Expected a failed upload");
    },
    (error: Error) => {
      expect(error.message).toBe("Upload failed.");
    },
  );
  expect(requests).toHaveLength(1);
});

test("cancellation after preparation prevents the committing attachment", async () => {
  const controller = new AbortController();
  const { requests, pictures } = fakePictureServer(() => {
    controller.abort();
    return success({ url: pictureUrl });
  });
  let committing = false;
  await pictures
    .uploadPicture(file(), "avatar", controller.signal, () => {
      committing = true;
    })
    .then(
      () => {
        throw new Error("Expected cancellation before attachment");
      },
      (error: Error) => {
        expect(error.name).toBe("AbortError");
      },
    );
  expect(committing).toBe(false);
  expect(requests).toHaveLength(1);
});

test("a late cancellation cannot abort a committing attachment or hide its success", async () => {
  const controller = new AbortController();
  const started = Promise.withResolvers<RequestInit | undefined>();
  const committed = Promise.withResolvers<Response>();
  const { pictures } = fakePictureServer(
    () => success({ url: pictureUrl }),
    ({ init }) => {
      started.resolve(init);
      return committed.promise;
    },
  );
  let committing = false;
  const upload = pictures.uploadPicture(file(), "avatar", controller.signal, () => {
    committing = true;
  });
  const attachment = await started.promise;
  expect(committing).toBe(true);
  expect(attachment?.signal).not.toBe(controller.signal);
  controller.abort();
  expect(attachment?.signal?.aborted).not.toBe(true);
  committed.resolve(Response.json({ status: true }));
  expect(await upload).toEqual({ status: true });
});

test("keeps upload access failures actionable without updating Better Auth", async () => {
  const { requests, pictures } = fakePictureServer(() =>
    Response.json(
      { success: false, error: { code: "FORBIDDEN", message: "You cannot change this logo." } },
      { status: 403 },
    ),
  );
  await pictures.uploadPicture(file(), "organization-logo").then(
    () => {
      throw new Error("Expected access to be denied");
    },
    (error: Error) => {
      expect(error).toMatchObject({ code: "FORBIDDEN", status: 403 });
    },
  );
  expect(requests).toHaveLength(1);
});

for (const kind of ["avatar", "organization-logo"] as const) {
  test(`removes ${kind} with a nullable native Better Auth update`, async () => {
    const { requests, pictures } = fakePictureServer(() => Response.json({ status: true }));
    await pictures.removePicture(kind, "organization-a");
    expect(requests[0]?.url).toEndWith(
      kind === "avatar" ? "/api/auth/update-user" : "/api/auth/organization/update",
    );
    expect(requests[0]?.init?.method).toBe("POST");
    expect(await jsonBody(requests[0])).toEqual(
      kind === "avatar"
        ? { image: null }
        : { organizationId: "organization-a", data: { logo: null } },
    );
  });

  test(`attaches ${kind} through the native endpoint without discarding validation errors`, async () => {
    const { requests, pictures } = fakePictureServer(
      () => success({ url: pictureUrl }),
      () =>
        Response.json(
          { code: "INVALID_PICTURE", message: "Choose a completed picture owned by this account." },
          { status: 400 },
        ),
    );
    await pictures.uploadPicture(file(), kind, undefined, undefined, "organization-a").then(
      () => {
        throw new Error("Expected native picture validation to fail");
      },
      (error: Error) => {
        expect(error).toMatchObject({
          code: "INVALID_PICTURE",
          message: "Choose a completed picture owned by this account.",
          status: 400,
        });
      },
    );
    expect(requests[1]?.url).toEndWith(
      kind === "avatar" ? "/api/auth/update-user" : "/api/auth/organization/update",
    );
    expect(await jsonBody(requests[1])).toEqual(
      kind === "avatar"
        ? { image: pictureUrl }
        : { organizationId: "organization-a", data: { logo: pictureUrl } },
    );
  });
}
