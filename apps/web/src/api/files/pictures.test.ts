import { fakePictureServer, jsonBody } from "./pictures.test-support";
import { expect, test } from "bun:test";

type PictureResponse =
  | { uploadId: string; uploadUrl: string; headers: Record<string, string> }
  | { fileId: string }
  | { fileId: string | null; url: string | null }
  | { url: string }
  | { logo: null };
const success = (data: PictureResponse) => Response.json({ success: true, data });
const file = () => new File(["picture"], "cropped.png", { type: "image/png" });
const pictureUrl = `/api/v1/files/pictures/avatar/alice?v=${crypto.randomUUID()}`;
const prepared = () =>
  success({ uploadId: "upload-1", uploadUrl: "https://storage.test/picture", headers: {} });

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

test("attaches an agent avatar by file ID without changing the human profile", async () => {
  const controller = new AbortController();
  let committing = false;
  const { requests, agentPictures } = fakePictureServer(
    prepared,
    () => new Response(null, { status: 200 }),
    () => success({ fileId: "file-1" }),
    ({ init }) => {
      expect(committing).toBe(true);
      controller.abort();
      expect(init?.signal?.aborted).not.toBe(true);
      return Response.json({
        success: true,
        data: { id: "agent-1", image: "/api/v1/files/file-1/content" },
      });
    },
  );
  const result = await agentPictures.uploadAgentPicture(
    "agent-1",
    file(),
    controller.signal,
    () => {
      committing = true;
    },
  );
  expect(result.image).toBe("/api/v1/files/file-1/content");
  expect(await jsonBody(requests[0])).toMatchObject({ purpose: "avatar" });
  expect(requests[1]?.init?.credentials).toBe("omit");
  expect(requests[3]?.url).toEndWith("/api/v1/agents/actors/picture");
  expect(await jsonBody(requests[3])).toEqual({ id: "agent-1", fileId: "file-1" });
  expect(requests).toHaveLength(4);
});

test("agent avatar cancellation before commit does not attach the completed file", async () => {
  const controller = new AbortController();
  const { requests, agentPictures } = fakePictureServer(
    prepared,
    () => new Response(null, { status: 200 }),
    () => {
      // The person cancels while the completed upload's response arrives.
      controller.abort();
      return success({ fileId: "file-1" });
    },
  );
  let committing = false;
  await agentPictures
    .uploadAgentPicture("agent-1", file(), controller.signal, () => {
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
  expect(requests).toHaveLength(3);
});

test("removes an agent avatar with a nullable file ID, not a user update", async () => {
  const { requests, agentPictures } = fakePictureServer(() =>
    Response.json({ success: true, data: { id: "agent-1", image: null } }),
  );
  await agentPictures.setAgentPicture("agent-1", null);
  expect(requests[0]?.url).toEndWith("/api/v1/agents/actors/picture");
  expect(await jsonBody(requests[0])).toEqual({ id: "agent-1", fileId: null });
  expect(requests).toHaveLength(1);
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
    // The person cancels while the uploaded picture's response arrives.
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
