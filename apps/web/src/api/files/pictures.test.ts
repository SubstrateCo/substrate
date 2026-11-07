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
  | { logo: null };
const success = (data: PictureResponse) => Response.json({ success: true, data });
const file = () => new File(["picture"], "cropped.png", { type: "image/png" });

test("uploads cropped bytes without credentials before attaching the completed avatar", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : input.toString();
        requests.push({ url, init });
        if (url.endsWith("/uploads"))
          return success({
            uploadId: "upload-1",
            uploadUrl: "https://storage.test/picture",
            headers: { "Content-Type": "image/png" },
          });
        if (url.startsWith("https://storage.test")) return new Response(null, { status: 200 });
        if (url.endsWith("/complete")) return success({ fileId: "file-1" });
        return Response.json({ status: true });
      },
      { preconnect: globalThis.fetch.preconnect },
    ),
  );
  const picture = file();
  const controller = new AbortController();
  await uploadPicture(picture, "avatar", controller.signal);
  const body = await new Response(requests[0]?.init?.body).json();
  expect(body).toEqual({
    purpose: "avatar",
    filename: "cropped.png",
    contentType: "image/png",
    size: picture.size,
  });
  expect(requests[1]).toMatchObject({
    url: "https://storage.test/picture",
    init: {
      method: "PUT",
      body: picture,
      credentials: "omit",
      signal: controller.signal,
      headers: { "Content-Type": "image/png" },
    },
  });
  expect(requests[2]?.url).toEndWith("/uploads/upload-1/complete");
  expect(requests[3]?.url).toEndWith("/api/auth/update-user");
  expect(requests[3]?.init?.method).toBe("POST");
  expect(await new Response(requests[3]?.init?.body).json()).toEqual({
    image: "/api/v1/files/file-1/content",
  });
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

test("does not complete or attach a failed storage upload", async () => {
  fetchSpy = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      success({ uploadId: "upload-1", uploadUrl: "https://storage.test/picture", headers: {} }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  await uploadPicture(file(), "organization-logo").then(
    () => {
      throw new Error("Expected a failed upload");
    },
    (error: Error) => {
      expect(error.message).toContain("could not be uploaded");
    },
  );
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test("cancellation after preparation prevents the committing attachment", async () => {
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
  expect(fetchSpy).toHaveBeenCalledTimes(3);
});

test("a late cancellation cannot abort a committing attachment or hide its success", async () => {
  const controller = new AbortController();
  const started = Promise.withResolvers<RequestInit | undefined>();
  const committed = Promise.withResolvers<Response>();
  fetchSpy = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      success({ uploadId: "upload-1", uploadUrl: "https://storage.test/picture", headers: {} }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(success({ fileId: "file-1" }))
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

test("keeps access failures actionable and does not send picture bytes", async () => {
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
      .mockResolvedValueOnce(
        success({ uploadId: "upload-1", uploadUrl: "https://storage.test/picture", headers: {} }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(success({ fileId: "file-1" }))
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
    const [url, init] = fetchSpy.mock.calls[3]!;
    expect(url instanceof Request ? url.url : url.toString()).toEndWith(
      kind === "avatar" ? "/api/auth/update-user" : "/api/auth/organization/update",
    );
    expect(await new Response(init?.body).json()).toEqual(
      kind === "avatar"
        ? { image: "/api/v1/files/file-1/content" }
        : { organizationId: "organization-a", data: { logo: "/api/v1/files/file-1/content" } },
    );
  });
}
