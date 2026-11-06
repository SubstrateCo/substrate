import { auth } from "../../auth/server";
import { serviceResult } from "../../shared/service-result";

export type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export interface SessionAPI {
  getSession(input: { headers: Headers }): Promise<AuthSession | null>;
}

export function createSessionService(api: SessionAPI) {
  return {
    read(headers: Headers) {
      return serviceResult(() => api.getSession({ headers }));
    },
  };
}

export const defaultSessionService = createSessionService(auth.api);
export type SessionService = ReturnType<typeof createSessionService>;
