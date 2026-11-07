import { createPictureApi } from "./pictures";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const testPictureApi = createPictureApi(
  createAuthClient({
    baseURL: "http://auth.test",
    plugins: [organizationClient()],
    fetchOptions: { customFetchImpl: (...args) => globalThis.fetch(...args) },
  }),
);
