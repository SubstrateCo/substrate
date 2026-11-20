import { createAgentPictureApi } from "../agents/requests";
import { createApi } from "../client";
import { createPictureApi } from "./pictures";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export interface FakeRequest {
  url: string;
  init?: RequestInit;
}

type Responder = (request: FakeRequest) => Response | Promise<Response>;

/**
 * Picture APIs wired to a fake server. Each request takes the next responder in order. A
 * request with no responder left fails the test.
 */
export function fakePictureServer(...responders: Responder[]) {
  const requests: FakeRequest[] = [];
  const fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input.toString();
      const request: FakeRequest = { url, init };
      const respond = responders.at(requests.length);
      requests.push(request);
      if (!respond) throw new Error(`Unexpected request ${requests.length}: ${url}`);
      return respond(request);
    },
    { preconnect: globalThis.fetch.preconnect },
  );
  const http = createApi(fetch).api.v1;
  const auth = createAuthClient({
    baseURL: "http://auth.test",
    plugins: [organizationClient()],
    fetchOptions: { customFetchImpl: fetch },
  });
  return {
    requests,
    pictures: createPictureApi(auth, http),
    agentPictures: createAgentPictureApi(http, fetch),
  };
}

/** Reads a recorded JSON request body. */
export const jsonBody = (request: FakeRequest | undefined) =>
  new Response(request?.init?.body).json();
