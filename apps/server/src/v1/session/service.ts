import type { SessionScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";

export function createSessionService() {
  return {
    read({ session: result }: SessionScope) {
      return serviceResult(async () => {
        if (!result) return null;
        const { token: _token, ...session } = result.session;
        return { ...result, session };
      });
    },
  };
}
export type SessionService = ReturnType<typeof createSessionService>;
