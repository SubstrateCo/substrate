import type { AuthSession } from "../shared/scope-types";
import { ServiceError } from "../shared/service-result";
import { APIError } from "better-auth/api";

export interface AuthSessionAPI {
  getSession(input: {
    headers: Headers;
    query: { disableRefresh: true };
  }): Promise<AuthSession | null>;
  getActiveMemberRole(input: {
    headers: Headers;
    query: { organizationId: string };
  }): Promise<{ role: string }>;
}

async function runAuthCall<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof APIError) {
      switch (error.statusCode) {
        case 400:
          throw new ServiceError("INVALID_INPUT", "Invalid request input.");
        case 401:
          throw new ServiceError("UNAUTHENTICATED", "Sign in to continue.");
        case 403:
          throw new ServiceError("FORBIDDEN", "Access denied.");
      }
    }
    throw error;
  }
}

export function createSessionApi(api: AuthSessionAPI): AuthSessionAPI {
  return {
    getSession: (input) => runAuthCall(() => api.getSession(input)),
    getActiveMemberRole: (input) => runAuthCall(() => api.getActiveMemberRole(input)),
  };
}
