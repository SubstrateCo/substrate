import type { StorageScope } from "@substrate/contracts/files/scope";

import type { DatabaseExecutor } from "../../core/executor";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError } from "../../errors";
import { projectRepository } from "../projects/repository";

/** Project icon access for picture uploads and reads, with the person's workspace access. */
export function projectIconAccess(db: DatabaseExecutor) {
  async function projects(scope: StorageScope) {
    if (!scope.organizationId) throw new AccessDeniedError();
    const { context } = await workspaceContext(db, {
      userId: scope.userId,
      organizationId: scope.organizationId,
    });
    return projectRepository(context);
  }
  return {
    async requireEdit(scope: StorageScope, id: string) {
      await (await projects(scope)).getPicture(id, "edit");
    },
    async canRead(scope: StorageScope, id: string) {
      try {
        return (await (await projects(scope)).getPicture(id)) !== null;
      } catch (error) {
        if (error instanceof AccessDeniedError) return false;
        throw error;
      }
    },
  };
}
