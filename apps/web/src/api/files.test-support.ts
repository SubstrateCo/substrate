import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { createPictureApi } from "./files";

export const testPictureApi = createPictureApi(
  createAuthClient({
    baseURL: "http://auth.test",
    plugins: [organizationClient()],
    fetchOptions: { customFetchImpl: (...args) => globalThis.fetch(...args) },
  }),
);
