import type { UserScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";

export function createAttentionService() {
  return {
    summary(scope: UserScope) {
      return serviceResult(() => scope.owner.attention());
    },
  };
}

export type AttentionService = ReturnType<typeof createAttentionService>;
