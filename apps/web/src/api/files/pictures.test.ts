import { setAgentPicture, uploadAgentPicture } from "../agents/requests";
import { testPictureApi } from "./pictures.test-support";
import { afterEach, expect, spyOn, test } from "bun:test";

const { removePicture, uploadPicture } = testPictureApi;

afterEach(() => {
  fetchSpy?.mockRestore();
});
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
type PictureResponse =
  | { uploadId: string; uploadUrl: string; headers: Record<string, string> }
  | { fileId: string }
  | { fileId: string | null; url: string | null }
  | { url: string }
  | { logo: null };
const success = (data: PictureResponse) => Response.json({ success: true, data });
const file = () => new File(["picture"], "cropped.png", { type: "image/png" });
const pictureUrl = `/api/v1/files/pictures/avatar/alice?v=${crypto.randomUUID()}`;

test("uploads picture bytes before saving the returned URL through Better Auth", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : input.toString();
        requests.push({ url, init });
        if (url.endsWith("/pictures/avatar")) return success({ url: pictureUrl });
        return Response.json({ status: true });
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  const picture = file();
  const controller = new AbortController();
  await uploadPicture(picture, "avatar", controller.signal);
  const body = requests[0]?.init?.body;
  if (!(body instanceof FormData)) throw new Error("Expected multipart upload.");
  const uploaded = body.get("file");
  if (!(uploaded instanceof File)) throw new Error("Expected picture bytes.");
  expect(await uploaded.text()).toBe(await picture.text());
  expect(requests[0]?.init?.signal).toBe(controller.signal);
  expect(requests[1]?.url).toEndWith("/api/auth/update-user");
  expect(requests[1]?.init?.method).toBe("POST");
  expect(await new Response(requests[1]?.init?.body).json()).toEqual({ image: pictureUrl });
  expect(requests).toHaveLength(2);
});

test("attaches an agent avatar by file ID without changing the human profile", async () => {
  const controller = new AbortController();
  let committing = false;
  fetchSpy = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      success({ uploadId: "upload-1", uploadUrl: "https://storage.test/picture", headers: {} }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(success({ fileId: "file-1" }))
    .mockImplementationOnce(
      Object.assign(
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          expect(committing).toBe(true);
          controller.abort();
          expect(init?.signal?.aborted).not.toBe(true);
          return Response.json({
            success: true,
            data: { id: "agent-1", image: "/api/v1/files/file-1/content" },
          });
        },
        { preconnect: globalThis.fetch.preconnect },
      ),
    );
  const result = await uploadAgentPicture("agent-1", file(), controller.signal, () => {
    committing = true;
  });
  expect(result.image).toBe("/api/v1/files/file-1/content");
  expect(await new Response(fetchSpy.mock.calls[0]?.[1]?.body).json()).toMatchObject({
    purpose: "avatar",
  });
  expect(fetchSpy.mock.calls[1]?.[1]?.credentials).toBe("omit");
  const [url, init] = fetchSpy.mock.calls[3]!;
  expect(url instanceof Request ? url.url : url.toString()).toEndWith(
    "/api/v1/agents/actors/picture",
  );
  expect(await new Response(init?.body).json()).toEqual({ id: "agent-1", fileId: "file-1" });
  expect(fetchSpy).toHaveBeenCalledTimes(4);
});

test("agent avatar cancellation before commit does not attach the completed file", async () => {
  const controller = new AbortController();
  const completion = success({ fileId: "file-1" });
  spyOn(completion, "json").mockImplementation(async () => {
    controller.abort();
    return { success: true, data: { fileId: "file-1" } };
  });
  fetchSpy = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      success({ uploadId: "upload-1", uploadUrl: "https://storage.test/picture", headers: {} }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(completion);
  let committing = false;
  await uploadAgentPicture("agent-1", file(), controller.signal, () => {
    committing = true;
  }).then(
    () => {
      throw new Error("Expected cancellation before attachment");
    },
    (error: Error) => {
      expect(error.name).toBe("AbortError");
    },
  );
  expect(committing).toBe(false);
  expect(fetchSpy).toHaveBeenCalledTimes(3);
});

test("removes an agent avatar with a nullable file ID, not a user update", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ success: true, data: { id: "agent-1", image: null } }),
  );
  await setAgentPicture("agent-1", null);
  const [url, init] = fetchSpy.mock.calls[0]!;
  expect(url instanceof Request ? url.url : url.toString()).toEndWith(
    "/api/v1/agents/actors/picture",
  );
  expect(await new Response(init?.body).json()).toEqual({ id: "agent-1", fileId: null });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("does not save a picture URL when the upload fails", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
    Response.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Upload failed." } },
      { status: 500 },
    ),
  );
  await uploadPicture(file(), "organization-logo").then(
    () => {
      throw new Error("Expected a failed upload");
    },
    (error: Error) => {
      expect(error.message).toBe("Upload failed.");
    },
  );
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("cancellation after preparation prevents the committing attachment", async () => {
  const controller = new AbortController();
  const completion = success({ url: pictureUrl });
  spyOn(completion, "json").mockImplementation(async () => {
    controller.abort();
    return { success: true, data: { url: pictureUrl } };
  });
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(completion);
  let committing = false;
  await uploadPicture(file(), "avatar", controller.signal, () => {
    committing = true;
  }).then(
    () => {
      throw new Error("Expected cancellation before attachment");
    },
    (error: Error) => {
      expect(error.name).toBe("AbortError");
    },
  );
  expect(committing).toBe(false);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("a late cancellation cannot abort a committing attachment or hide its success", async () => {
  const controller = new AbortController();
  const started = Promise.withResolvers<RequestInit | undefined>();
  const committed = Promise.withResolvers<Response>();
  fetchSpy = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(success({ url: pictureUrl }))
    .mockImplementationOnce(
      Object.assign(
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          started.resolve(init);
          return committed.promise;
        },
        { preconnect: globalThis.fetch.preconnect },
      ),
    );
  let committing = false;
  const upload = uploadPicture(file(), "avatar", controller.signal, () => {
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
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json(
      { success: false, error: { code: "FORBIDDEN", message: "You cannot change this logo." } },
      { status: 403 },
    ),
  );
  await uploadPicture(file(), "organization-logo").then(
    () => {
      throw new Error("Expected access to be denied");
    },
    (error: Error) => {
      expect(error).toMatchObject({ code: "FORBIDDEN", status: 403 });
    },
  );
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

for (const kind of ["avatar", "organization-logo"] as const) {
  test(`removes ${kind} with a nullable native Better Auth update`, async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status: true }));
    await removePicture(kind, "organization-a");
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url instanceof Request ? url.url : url.toString()).toEndWith(
      kind === "avatar" ? "/api/auth/update-user" : "/api/auth/organization/update",
    );
    expect(init?.method).toBe("POST");
    expect(await new Response(init?.body).json()).toEqual(
      kind === "avatar"
        ? { image: null }
        : { organizationId: "organization-a", data: { logo: null } },
    );
  });

  test(`attaches ${kind} through the native endpoint without discarding validation errors`, async () => {
    fetchSpy = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(success({ url: pictureUrl }))
      .mockResolvedValueOnce(
        Response.json(
          { code: "INVALID_PICTURE", message: "Choose a completed picture owned by this account." },
          { status: 400 },
        ),
      );
    await uploadPicture(file(), kind, undefined, undefined, "organization-a").then(
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
    const [url, init] = fetchSpy.mock.calls[1]!;
    expect(url instanceof Request ? url.url : url.toString()).toEndWith(
      kind === "avatar" ? "/api/auth/update-user" : "/api/auth/organization/update",
    );
    expect(await new Response(init?.body).json()).toEqual(
      kind === "avatar"
        ? { image: pictureUrl }
        : { organizationId: "organization-a", data: { logo: pictureUrl } },
    );
  });
}
